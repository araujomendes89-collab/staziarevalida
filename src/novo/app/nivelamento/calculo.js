// Nivelamento (Sistema de Diagnóstico de Proficiência, SDP): a conta da especificação do dono (16/10/2026), sem IA.
//   P_a  = 100 · (A_a + 1) / (Q_a + 2)      (Beta-Binomial com Beta(1,1): A = acertos, Q = questões respondidas na área)
//   PG   = média simples das 5 áreas         (w_a = 0,20 no diagnóstico inicial)
//   PR_a = 100 − P_a                         (prioridade de estudo da área)
// Faixas de nível PROVISÓRIAS (parâmetros internos do StaziaMed, não são do Inep nem validados psicometricamente).
// A taxa de acertos simples fica guardada e aparece SEPARADA. Nada de "chance de aprovação".
// O banco faz a MESMA conta em public.nivelamento_calcular (migração …012300); o teste nivelamentoBanco confere que as duas batem.
// Sem React, para poder testar sozinho e usar no simulador.

export const VERSAO = "sdp-1";

/** As 5 áreas, na ordem da especificação (é também a ordem de desempate das prioridades). */
export const AREAS = [
  { id: "CLINICA_MEDICA", chave: "clinica", nome: "Clínica Médica" },
  { id: "CIRURGIA_GERAL", chave: "cirurgia", nome: "Cirurgia" },
  { id: "PEDIATRIA", chave: "pediatria", nome: "Pediatria" },
  { id: "GINECOLOGIA_OBSTETRICIA", chave: "go", nome: "Ginecologia e Obstetrícia" },
  { id: "MEDICINA_FAMILIA_COMUNIDADE", chave: "mfc", nome: "Medicina de Família e Comunidade" },
];

/** Faixas iniciais propostas, sujeitas a validação (seção 3 da especificação). */
export const NIVEIS = [
  { nivel: 1, nome: "Fundamentos", faixa: "0–39,9", foco: "Reconstruir conceitos fundamentais" },
  { nivel: 2, nome: "Em desenvolvimento", faixa: "40–54,9", foco: "Consolidar conhecimentos essenciais" },
  { nivel: 3, nome: "Intermediário", faixa: "55–69,9", foco: "Fortalecer raciocínio clínico e tomada de decisão" },
  { nivel: 4, nome: "Avançado", faixa: "70–84,9", foco: "Aprimorar casos complexos e questões difíceis" },
  { nivel: 5, nome: "Domínio elevado", faixa: "85–100", foco: "Refinar pontos específicos e manter desempenho" },
];

export const FRONTEIRAS = [40, 55, 70, 85];
/** Abaixo disto em qualquer área, não há resultado (DADOS_INSUFICIENTES), como no algoritmo da especificação. */
export const COBERTURA_MINIMA = 3;
/** Diagnóstico completo: 30 questões (6 por área: 2 fáceis, 2 médias, 2 difíceis). Abaixo disto o resultado é PROVISÓRIO. */
export const TOTAL_COMPLETO = 30;
export const BLOCO = 15;
export const Z_90 = 1.645;

const areaInfo = (id) => AREAS.find((a) => a.id === id || a.chave === id) ?? null;
export const nomeArea = (id) => areaInfo(id)?.nome ?? String(id ?? "");

/** Arredonda para 1 casa (meio para cima, como o round(numeric, 1) do Postgres). */
export function arred1(x) {
  return Math.round(Number(Number(x).toFixed(9)) * 10) / 10;
}

/** 57.5 → "57,5" (sempre uma casa, vírgula). */
export function fmt1(x) {
  return x == null || Number.isNaN(Number(x)) ? "—" : arred1(x).toFixed(1).replace(".", ",");
}

/** Nível pela pontuação (sem arredondar, como o classificar() da especificação). */
export function classificar(score) {
  if (score < 40) return NIVEIS[0];
  if (score < 55) return NIVEIS[1];
  if (score < 70) return NIVEIS[2];
  if (score < 85) return NIVEIS[3];
  return NIVEIS[4];
}

/** Distribuição de dificuldade das ATIVIDADES SEGUINTES pela proficiência da área (tabela da seção 5). Não muda a nota inicial. */
export function distribuicaoDificuldade(p) {
  if (p < 45) return { facil: 60, media: 30, dificil: 10 };
  if (p < 70) return { facil: 20, media: 60, dificil: 20 };
  return { facil: 10, media: 40, dificil: 50 };
}

/** Uma área: proficiência (0–100), prioridade e variância da posterior Beta. */
export function calcularArea(acertos, total) {
  const alpha = acertos + 1;
  const beta = total - acertos + 1;
  const probabilidade = alpha / (alpha + beta);
  const variancia = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  return { probabilidade, variancia, proficiencia: 100 * probabilidade, prioridade: 100 * (1 - probabilidade) };
}

/** [{ area, correta }] → [{ area, acertos, total }] nas 5 áreas (área sem resposta fica com 0 de 0). */
export function contarPorArea(respostas) {
  return AREAS.map(({ id, chave }) => {
    const itens = respostas.filter((r) => r.area === id || r.area === chave);
    return { area: id, acertos: itens.filter((r) => r.correta).length, total: itens.length };
  });
}

function validarContagens(contagens) {
  for (const c of contagens) {
    if (!areaInfo(c.area)) throw new Error(`Área desconhecida: ${c.area}`);
    if (!Number.isInteger(c.total) || !Number.isInteger(c.acertos) || c.total < 0 || c.acertos < 0 || c.acertos > c.total)
      throw new Error(`Contagem inválida em ${c.area}: ${c.acertos} de ${c.total}`);
  }
}

/**
 * A conta inteira a partir dos acertos por área. Entrada: [{ area, acertos, total }] (área ausente = 0 de 0).
 * Saída (a mesma forma que o banco grava em nivelamento_diagnosticos.resultado):
 *   { versao, status, score, nivel, nivel_nome, nivel_foco, acertos, total, percentual_bruto, faixa_indicativa, perfil, prioridades }
 * status: DADOS_INSUFICIENTES (alguma área com menos de 3 questões: sem pontuação nem nível), PROVISORIO (menos de 30 questões ou
 * faixa indicativa cruzando uma fronteira de nível) ou ESTIMATIVA_INICIAL.
 * A faixa indicativa é aproximação com hipóteses simplificadoras: fica guardada para validação e NÃO aparece ao aluno.
 */
export function calcularPorContagem(contagens) {
  validarContagens(contagens);
  const perfilBruto = AREAS.map(({ id, nome }) => {
    const c = contagens.find((x) => areaInfo(x.area)?.id === id) ?? { acertos: 0, total: 0 };
    return { area: id, nome, acertos: c.acertos, total: c.total, ...calcularArea(c.acertos, c.total) };
  });
  const acertos = perfilBruto.reduce((s, p) => s + p.acertos, 0);
  const total = perfilBruto.reduce((s, p) => s + p.total, 0);
  const perfil = perfilBruto.map((p) => ({
    area: p.area,
    nome: p.nome,
    acertos: p.acertos,
    total: p.total,
    proficiencia: arred1(p.proficiencia),
    prioridade: arred1(p.prioridade),
    variancia: Number(p.variancia.toFixed(6)),
  }));
  // ordem de prioridade: maior PR_a primeiro; empate fica na ordem da especificação (sort estável)
  const prioridades = perfilBruto
    .map((p, i) => ({ area: p.area, prioridade: p.prioridade, i }))
    .sort((a, b) => b.prioridade - a.prioridade || a.i - b.i)
    .map((p) => p.area);
  const base = {
    versao: VERSAO,
    acertos,
    total,
    percentual_bruto: total > 0 ? arred1((100 * acertos) / total) : null,
    perfil,
    prioridades,
  };

  if (perfilBruto.some((p) => p.total < COBERTURA_MINIMA)) {
    return { ...base, status: "DADOS_INSUFICIENTES", score: null, nivel: null, nivel_nome: null, nivel_foco: null, faixa_indicativa: null };
  }

  const score = perfilBruto.reduce((s, p) => s + p.proficiencia, 0) / AREAS.length;
  const desvio = Math.sqrt(perfilBruto.reduce((s, p) => s + p.variancia, 0) / AREAS.length ** 2) * 100;
  const limiteInferior = Math.max(0, score - Z_90 * desvio);
  const limiteSuperior = Math.min(100, score + Z_90 * desvio);
  const instavel = FRONTEIRAS.some((f) => limiteInferior < f && limiteSuperior >= f);
  const n = classificar(score);
  return {
    ...base,
    status: total < TOTAL_COMPLETO || instavel ? "PROVISORIO" : "ESTIMATIVA_INICIAL",
    score: arred1(score),
    nivel: n.nivel,
    nivel_nome: n.nome,
    nivel_foco: n.foco,
    faixa_indicativa: [arred1(limiteInferior), arred1(limiteSuperior)],
  };
}

/** A mesma conta a partir das respostas: [{ area, correta }] (a forma do algoritmo em TypeScript da especificação). */
export function calcularNivelamento(respostas) {
  return calcularPorContagem(contarPorArea(respostas));
}

function listaPt(nomes) {
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/**
 * Interpretação automática (seção 4 da especificação):
 *   "O estudante apresentou 60,0% de acertos brutos. A maior prioridade de revisão é Cirurgia, seguida de Ginecologia e Obstetrícia."
 * pessoa: "estudante" (simulador do dono, texto da especificação) ou "voce" (tela do aluno).
 * Empates são ditos como empates (nunca uma área "na frente" sem diferença).
 */
export function interpretar(resultado, { pessoa = "estudante" } = {}) {
  if (!resultado || resultado.total === 0) return "";
  const sujeito = pessoa === "voce" ? "Você apresentou" : "O estudante apresentou";
  const frase1 = `${sujeito} ${fmt1(resultado.percentual_bruto)}% de acertos brutos.`;
  if (resultado.status === "DADOS_INSUFICIENTES") return `${frase1} Ainda não há questões suficientes em todas as áreas para indicar prioridades.`;
  const prof = (id) => resultado.perfil.find((p) => p.area === id).proficiencia;
  const ordem = resultado.prioridades;
  const grupos = [];
  for (const id of ordem) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && prof(ultimo[0]) === prof(id)) ultimo.push(id);
    else grupos.push([id]);
  }
  if (grupos.length === 1) return `${frase1} As cinco áreas tiveram o mesmo resultado; nenhuma se destacou como prioridade de revisão.`;
  const [g1, g2] = grupos;
  const nomes = (g) => listaPt(g.map(nomeArea));
  if (g1.length > 1) return `${frase1} As maiores prioridades de revisão, empatadas, são ${nomes(g1)}.`;
  const seguida = g2.length > 1 ? `seguida de ${nomes(g2)} (empatadas)` : `seguida de ${nomes(g2)}`;
  return `${frase1} A maior prioridade de revisão é ${nomeArea(g1[0])}, ${seguida}.`;
}

const POR_EXTENSO = ["nenhuma", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
const contaObs = (n) => `${POR_EXTENSO[n] ?? n} ${n === 1 ? "observação" : "observações"}`;

/** Aviso de incerteza: "Resultado inicial sujeito a revisão por novas questões. Cada área contém apenas seis observações." */
export function avisoIncerteza(resultado) {
  const totais = (resultado?.perfil ?? []).map((p) => p.total);
  if (!totais.length) return "";
  const min = Math.min(...totais);
  const max = Math.max(...totais);
  const cada = min === max ? `Cada área contém apenas ${contaObs(min)}.` : `Cada área contém de ${min} a ${max} observações.`;
  return `Resultado inicial sujeito a revisão por novas questões. ${cada}`;
}

/** Frase fixa: o nivelamento não é a nota do Revalida (o Inep usa Angoff modificado por edição) nem previsão de aprovação. */
export const AVISO_NAO_E_NOTA =
  "Este nivelamento não é a nota do Revalida nem uma previsão de aprovação: a nota de corte do Inep é definida a cada edição (método Angoff modificado) e não se aplica a um diagnóstico de 30 questões.";

/** Exemplo da seção 4 da especificação (botão "Restaurar exemplo" do simulador). */
export const EXEMPLO_ESPECIFICACAO = [
  { area: "CLINICA_MEDICA", acertos: 5, total: 6 },
  { area: "CIRURGIA_GERAL", acertos: 2, total: 6 },
  { area: "PEDIATRIA", acertos: 4, total: 6 },
  { area: "GINECOLOGIA_OBSTETRICIA", acertos: 3, total: 6 },
  { area: "MEDICINA_FAMILIA_COMUNIDADE", acertos: 4, total: 6 },
];
