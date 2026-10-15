// Núcleo da vigia dos adaptadores: lê os sites, compara com a linha de base, dá gravidade, acha o que fica "revalidar" e (só se houve
// mudança e há orçamento) pede a explicação ao Gemini. Usado pelo ensaio local (vigia.mjs) e pelo job do Cloud Run (job.mjs).
// NUNCA grava em questão, aula, gabarito ou atualização: devolve eventos; quem registra é o chamador (arquivo ou radar_registrar_evento).
import { classificarGravidade, classificarItemAdaptador, compararVersoes, diffItens, observacaoDaIA, temasDoTitulo } from "./lib.mjs";
import { coletarTodos, ATIVOS } from "./adaptadores/index.mjs";
import { analisarComTeto, montarPrompt, MODELO_PADRAO } from "./ia.mjs";
import { separarPaginas } from "./adaptadores/pdf.mjs";

export const MAX_EVENTOS_POR_ADAPTADOR = 40;

/** Itens do app que usam os temas achados (aula do Grande Tema + questões válidas do tema). Nível "tema": o item novo não tem página nossa. */
export function afetadosDosTemas(temas, ligacao) {
  const itens = [];
  const codigos = new Set(temas.map((t) => t.tema));
  for (const t of codigos) itens.push({ tipo: "aula", ref: t, acao: "revalidar", nivel: "tema", paginas: [], citacao: null });
  for (const q of ligacao?.questoes ?? []) {
    if (!codigos.has(q.tema_id) || q.status === "annulled" || q.status === "anulada") continue;
    itens.push({ tipo: "questao", ref: q.question_id, acao: "revalidar", nivel: "tema", paginas: [], citacao: null });
  }
  return itens;
}

function resumoDoDiff(diff) { return diff ? { ...diff.resumo } : {}; }

/**
 * @param {object} p
 * @param {object} p.cliente   criarCliente()
 * @param {object} p.estado    EstadoArquivo | EstadoSupabase | EstadoMemoria
 * @param {string[]} [p.quais] adaptadores (padrão: Conitec, DOU, vacinação, Febrasgo)
 * @param {object} [p.dossies] dossies-100.json   @param {object} [p.ligacao] ligacao-questoes.json
 * @param {object} [p.contador] ContadorCusto      @param {string} [p.chaveIA]  @param {string} [p.modelo]
 * @param {number} [p.maxIA]   teto de chamadas desta rodada (além do teto mensal em dinheiro)
 */
export async function vigiarAdaptadores({ cliente, estado, quais = ATIVOS, dossies = null, ligacao = null, contador = null, chaveIA = null, modelo = MODELO_PADRAO, maxIA = 20, opcoes = {}, fetchIA, gravarBase = true }) {
  const resultados = await coletarTodos(cliente, { quais, opcoes });
  const eventos = [], porAdaptador = [], baseParaSalvar = [];
  let chamadasIA = 0;
  for (const res of resultados) {
    const base = await estado.carregar(res.adaptador);
    const d = diffItens(base, res.itens);
    const info = { adaptador: res.adaptador, lidos: res.itens.length, erros: res.erros, bloqueado: res.bloqueado, canais: res.canais, ms: res.ms, base_antes: base.size, primeira_leitura: d.primeira_leitura, leitura_suspeita: d.suspeita, inundacao: d.inundacao ?? 0, novos: d.novos.length, alterados: d.alterados.length, iguais: d.iguais, sumiram: d.sumiram, eventos: 0, excedentes: 0 };
    const candidatos = [
      ...d.novos.map((item) => ({ item, novo: true })),
      ...d.alterados.map(({ antes, agora }) => ({ item: agora, novo: false, antes })),
    ];
    for (const c of candidatos.slice(0, MAX_EVENTOS_POR_ADAPTADOR)) {
      const cls = classificarItemAdaptador(c.item);
      let diff = null;
      if (!c.novo && c.antes?.texto && c.item.texto) diff = compararVersoes(separarPaginas(c.antes.texto), separarPaginas(c.item.texto));
      // página de calendário que mudou só na moldura (nenhuma diferença real de frase) não é evento
      if (!c.novo && diff && !diff.itens.length) continue;
      const temas = temasDoTitulo(c.item.titulo ?? "", dossies);
      const grav = classificarGravidade({ referencia: cls.referencia, item: c.item, diff, novo: c.novo, temasAfetados: temas.length });
      const ev = {
        origem: c.novo ? "adaptador_novo" : "adaptador_mudou", doc_id: `adaptador:${c.item.adaptador}:${c.item.chave}`.slice(0, 180),
        adaptador: c.item.adaptador, titulo: c.item.titulo, url: c.item.url, tipo: c.item.tipo, versao_antiga: c.antes?.versao ?? null, versao_nova: c.item.versao, data: c.item.data,
        sha256_antigo: c.antes?.hash ?? null, sha256_novo: c.item.hash,
        fonte: { url: c.item.url, ...cls }, referencia: cls.referencia, gravidade: grav.gravidade, motivo_gravidade: grav.motivo,
        resumo: resumoDoDiff(diff), itens: (diff?.itens ?? []).slice(0, 200),
        temas, afetados: afetadosDosTemas(temas, ligacao),
      };
      // IA: só quando há TEXTO comparado para explicar (documento só com metadados não gasta chamada) e há orçamento
      if (contador && chaveIA && chamadasIA < maxIA && diff?.itens.length) {
        const r = await analisarComTeto({ contador, chave: chaveIA, modelo, fetchImpl: fetchIA, prompt: montarPrompt({
          titulo: c.item.titulo ?? c.item.url, instituicao: c.item.fonte, referencia: cls.referencia, origem: ev.origem, itens: ev.itens,
          observacaoItem: `Tipo: ${c.item.tipo}. Endereço: ${c.item.url}. ${c.novo ? "Documento NOVO na fonte." : "Documento ALTERADO desde a última leitura."} Gravidade preliminar do radar: ${grav.gravidade} (${grav.motivo}).` }) }).catch((e) => ({ erro: String(e.message).slice(0, 100) }));
        if (r.analise) { ev.analise_ia = r.analise; ev.ia_modelo = modelo; ev.ia_custo_usd = r.custo_usd; chamadasIA++; const o = observacaoDaIA(ev.gravidade, r.analise); if (o) ev.motivo_gravidade += ` ${o}`; }
        else ev.ia_pulada = r.pulada ?? r.erro ?? "sem_resposta";
      }
      eventos.push(ev);
      info.eventos++;
    }
    info.excedentes = Math.max(candidatos.length - MAX_EVENTOS_POR_ADAPTADOR, 0);
    porAdaptador.push(info);
    // linha de base: só avança com leitura confiável (não suspeita); falha total do adaptador mantém a base
    // leitura com erro e SEM base anterior é parcial: não vira linha de base (a próxima tenta de novo)
    info.base_incompleta = base.size === 0 && res.erros.length > 0;
    if (!d.suspeita && res.itens.length > 0 && !info.base_incompleta) {
      baseParaSalvar.push({ adaptador: res.adaptador, itens: res.itens });
      if (gravarBase) await estado.salvar(res.adaptador, res.itens);
    }
  }
  return { eventos, porAdaptador, chamadasIA, baseParaSalvar };
}
