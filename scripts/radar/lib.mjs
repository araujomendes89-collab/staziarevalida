// Radar de Evidências StaziaMed: lógica DETERMINÍSTICA (sem IA, sem rede, sem banco). Testada em src/__tests__/radarEvidencias.test.ts.
// A IA só entra no vigia.mjs, depois que esta parte já provou que houve mudança. Nada aqui altera gabarito, aula ou questão.
import { createHash } from "node:crypto";

// ---------------------------------------------------------------- hash e texto
export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

/** Texto comparável: minúsculas, sem acento, espaços colapsados. */
export function normalizar(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Ainda mais frouxo: só letras e números (diferença só de pontuação/hifenização = editorial). */
export function esqueleto(s) {
  return normalizar(s).replace(/[^a-z0-9]+/g, "");
}

const STOP = new Set("de da do das dos a o as os e em um uma para por com que na no nas nos ao se ou sua seu como mais foi sao ser ha".split(" "));
export function tokens(s) {
  return normalizar(s)
    .replace(/[^a-z0-9%,.\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[-.,]+|[-.,]+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Divide o texto de uma página em frases (unidade de comparação). Descarta cabeçalhos curtos. */
export function frases(pageText) {
  const flat = String(pageText ?? "").replace(/-\n(?=[a-zà-ú])/g, "").replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
  if (!flat) return [];
  return flat
    .split(/(?<=[.;:!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ••\-\d(])/)
    .map((f) => f.trim())
    .filter((f) => tokens(f).length >= 5);
}

// ---------------------------------------------------------------- diff por trecho e página
const NEGACAO = /\b(nao|nunca|jamais|contraindic\w*|vedad\w*|proibid\w*|evitar|sem indicacao|dispensavel|desnecessari\w*)\b/g;
const RECOMENDA = /\b(recomend\w*|deve\w*|indica\w*|contraindic\w*|dose|mg|esquema|primeira linha|segunda linha|tratamento|conduta|rastreamento|criterio\w*)\b/;

const NUM_EXTENSO = "um uma dois duas tres quatro cinco seis sete oito nove dez onze doze quinze vinte trinta quarenta sessenta noventa cem";
const RE_NUM = new RegExp(`\\d+(?:[.,]\\d+)?|\\b(?:${NUM_EXTENSO.split(" ").join("|")})\\b`, "g");
/** Números em algarismo e por extenso (seis meses x nove meses é mudança numérica). */
const RE_MARCADOR = /^\s*(?:art\.?\s*)?(?:§\s*)?\d+\s*[ºo°.)]?\s+/i; // "6º ", "§ 2º ", "Art. 5º " no começo: numeração do parágrafo, não conteúdo
function numeros(s) {
  return (normalizar(s.replace(RE_MARCADOR, "")).match(RE_NUM) ?? []).map((n) => n.replace(",", "."));
}
/** Os números (algarismo ou por extenso) das duas frases diferem? Ignora a numeração do parágrafo no começo. */
export function numerosDiferem(a, b) { return numeros(a).join("|") !== numeros(b).join("|"); }
function contaNegacao(s) {
  return (normalizar(s).match(NEGACAO) ?? []).length;
}

/** Tipo da diferença entre duas frases já pareadas. Mesmos rótulos do ch_source_diff_items (SQIE fase 3). */
export function classificarPar(antigo, novo) {
  if (normalizar(antigo) === normalizar(novo)) return { kind: "UNCHANGED", similarity: 1, critical: false };
  if (esqueleto(antigo) === esqueleto(novo)) return { kind: "EDITORIAL", similarity: 1, critical: false };
  const sim = jaccard(tokens(antigo), tokens(novo));
  const nA = numeros(antigo), nB = numeros(novo);
  const numDifere = nA.join("|") !== nB.join("|");
  // negação só vale em frase curta: em bloco longo (tabela colada pelo PDF) a contagem de "não" é ruído
  const curta = Math.max(tokens(antigo).length, tokens(novo).length) <= 60;
  if (curta && sim >= 0.75 && contaNegacao(antigo) !== contaNegacao(novo)) return { kind: "NEGATION", similarity: sim, critical: true };
  if (numDifere && sim >= 0.5 && curta) return { kind: "NUMERIC", similarity: sim, critical: true };
  if (sim >= 0.85) return { kind: "MINOR_WORDING", similarity: sim, critical: false };
  return { kind: "SUBSTANTIVE", similarity: sim, critical: RECOMENDA.test(normalizar(novo)) || RECOMENDA.test(normalizar(antigo)) };
}

/** Menor trecho que difere entre duas frases (palavras), com um pouco de contexto: mostra EXATAMENTE o que mudou. */
export function trechoQueMudou(antigo, novo, contexto = 4) {
  const a = String(antigo ?? "").split(/\s+/).filter(Boolean), b = String(novo ?? "").split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const ini = Math.max(0, i - contexto);
  const fatia = (arr, fimCorte) => arr.slice(ini, Math.min(arr.length, arr.length - j + (fimCorte ? contexto : 0))).join(" ");
  return { antes: fatia(a, true), depois: fatia(b, true) };
}

/**
 * Compara duas versões de um documento. Entrada: [{pagina, texto}]. Saída: resumo + lista de diferenças com a PÁGINA
 * de cada lado (é isto que mostra EXATAMENTE o que mudou). Pareamento: igual exato, depois melhor semelhança (jaccard) pelos
 * termos raros. Greedy 1:1. Não lê nada fora dos textos recebidos.
 */
export function compararVersoes(paginasAntigas, paginasNovas, { limiarPar = 0.45, maxItens = 400 } = {}) {
  const A = [], B = [];
  for (const p of paginasAntigas) for (const f of frases(p.texto)) A.push({ pagina: p.pagina, texto: f, n: normalizar(f), tk: tokens(f), usado: false });
  for (const p of paginasNovas) for (const f of frases(p.texto)) B.push({ pagina: p.pagina, texto: f, n: normalizar(f), tk: tokens(f), usado: false });

  const porTexto = new Map();
  A.forEach((a, i) => { if (!porTexto.has(a.n)) porTexto.set(a.n, []); porTexto.get(a.n).push(i); });
  let iguais = 0;
  for (const b of B) {
    const fila = porTexto.get(b.n);
    if (fila) {
      const i = fila.find((k) => !A[k].usado);
      if (i !== undefined) { A[i].usado = true; b.usado = true; iguais++; }
    }
  }
  // índice invertido dos termos das frases antigas ainda sem par
  const indice = new Map();
  A.forEach((a, i) => { if (a.usado) return; for (const t of new Set(a.tk)) { if (!indice.has(t)) indice.set(t, []); indice.get(t).push(i); } });

  const itens = [];
  for (const b of B) {
    if (b.usado) continue;
    const votos = new Map();
    for (const t of new Set(b.tk)) {
      const lista = indice.get(t);
      if (!lista || lista.length > 300) continue; // termo comum demais não identifica
      for (const i of lista) if (!A[i].usado) votos.set(i, (votos.get(i) ?? 0) + 1);
    }
    let melhor = -1, melhorSim = 0;
    const candidatos = [...votos.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
    for (const [i] of candidatos) {
      const s = jaccard(A[i].tk, b.tk);
      if (s > melhorSim) { melhorSim = s; melhor = i; }
    }
    if (melhor >= 0 && melhorSim >= limiarPar) {
      A[melhor].usado = true; b.usado = true;
      const c = classificarPar(A[melhor].texto, b.texto);
      itens.push({ kind: c.kind, critical: c.critical, similarity: Number(c.similarity.toFixed(3)), pagina_antiga: A[melhor].pagina, pagina_nova: b.pagina, texto_antigo: A[melhor].texto, texto_novo: b.texto, ...(c.kind === "UNCHANGED" || c.kind === "EDITORIAL" ? {} : { trecho: trechoQueMudou(A[melhor].texto, b.texto) }) });
    }
  }
  for (const b of B) if (!b.usado) itens.push({ kind: "ADDED", critical: RECOMENDA.test(b.n), similarity: 0, pagina_antiga: null, pagina_nova: b.pagina, texto_antigo: null, texto_novo: b.texto });
  for (const a of A) if (!a.usado) itens.push({ kind: "REMOVED", critical: RECOMENDA.test(a.n), similarity: 0, pagina_antiga: a.pagina, pagina_nova: null, texto_antigo: a.texto, texto_novo: null });

  const contagem = {};
  for (const it of itens) contagem[it.kind] = (contagem[it.kind] ?? 0) + 1;
  const ordemRelevancia = { NEGATION: 0, NUMERIC: 1, SUBSTANTIVE: 2, REMOVED: 3, ADDED: 4, MINOR_WORDING: 5, EDITORIAL: 6, UNCHANGED: 7 };
  const relevantes = itens
    .filter((i) => !["UNCHANGED", "EDITORIAL"].includes(i.kind))
    .sort((x, y) => (Number(y.critical) - Number(x.critical)) || (ordemRelevancia[x.kind] - ordemRelevancia[y.kind]) || (y.similarity - x.similarity));
  const paginasMudadas = new Set();
  for (const it of itens) if (!["UNCHANGED", "EDITORIAL", "MINOR_WORDING"].includes(it.kind)) { if (it.pagina_nova) paginasMudadas.add(it.pagina_nova); }
  return {
    resumo: {
      frases_antigas: A.length,
      frases_novas: B.length,
      iguais_exatas: iguais,
      por_tipo: contagem,
      criticas: itens.filter((i) => i.critical).length,
      paginas_novas_com_mudanca: paginasMudadas.size,
      mudou: relevantes.some((i) => i.kind !== "MINOR_WORDING") || contagem.MINOR_WORDING > 0,
    },
    itens: relevantes.slice(0, maxItens),
  };
}

// ---------------------------------------------------------------- classificação da referência
const RE_SAMU = /\bsamu\b/i;
const RE_PROPOSTA_FORTE = /preliminar|minuta|rascunho|em elaboracao|sujeita a mudanca|versao para consulta/;
const RE_PROPOSTA_FRACA = /consulta publica|proposta/; // "consulta pública nº 11/2025" no histórico de um PCDT já aprovado por portaria não o torna proposta
const RE_PORTARIA = /portaria[^;]{0,40}\bn\s*[ºo°.]?\s*\d/;
function ehProposta(doc) {
  const t = normalizar(`${doc.titulo ?? ""} ${doc.versao ?? ""}`);
  if (RE_PROPOSTA_FORTE.test(t)) return true;
  return RE_PROPOSTA_FRACA.test(t) && !RE_PORTARIA.test(t);
}
const RE_SOCIEDADE = /sociedade|febrasgo|sbp\b|sbc\b|sbpt|amib|associacao|federacao|colegio|academia|\bsb[a-z]{1,4}\b|nucleo brasileiro|cfm|conselho federal/;
const RE_OMS = /organizacao mundial|\boms\b|\bwho\b|opas|paho|world health/;
const RE_SUS = /ministerio da saude|\bms\b|conitec|sectics|sctie|svs|svsa|saps|anvisa|inca\b|datasus|\bsus\b|portaria|\bgvs\b/;

/** Protocolos do SAMU são fonte PROIBIDA no StaziaMed (regra do dono). Marca no radar; nunca vira fonte de conduta. */
export function ehFonteProibida(doc) {
  return RE_SAMU.test(`${doc.doc_id ?? ""} ${doc.titulo ?? ""}`);
}

/** Esfera da fonte: evita confundir recomendação recente de sociedade/OMS com norma do SUS. */
export function esferaDaFonte(doc) {
  const inst = normalizar(`${doc.instituicao ?? ""}`);
  const resto = normalizar(`${doc.titulo ?? ""}`);
  if (RE_OMS.test(inst)) return "oms";
  if (RE_SUS.test(inst)) return "sus";
  if (RE_SOCIEDADE.test(inst)) return "sociedade";
  if (RE_OMS.test(resto)) return "oms";
  if (/pcdt|portaria|caderno de atencao|diretriz(es)? brasileira/.test(resto) && RE_SUS.test(resto)) return "sus";
  return "outra";
}

/**
 * Classifica a referência em: vigente | proposta | revogada | evidencia_complementar | desconhecido (+ proibida_samu).
 * Regras (conservadoras: na dúvida, "desconhecido", e quem decide é o revisor):
 *  - SAMU => proibida_samu.
 *  - revogado no catálogo, ou versão histórica => revogada (histórica só serve para explicar gabarito do Inep, nunca conduta).
 *  - consulta pública/preliminar/proposta no título ou na versão => proposta.
 *  - sociedade/OMS/categoria complementar => evidencia_complementar: NUNCA vira "norma do SUS", mesmo recente.
 *  - normativa do SUS ou documento oficial de exame, vigente e com catálogo verificado => vigente.
 *  - resto (versão a confirmar, não encontrado, sem arquivo) => desconhecido.
 */
export function classificarReferencia(doc) {
  const esfera = esferaDaFonte(doc);
  const base = { esfera, norma_sus: false, uso_permitido: "conduta", gabarito_inep_imutavel: doc.categoria === "oficial_exame" };
  if (ehFonteProibida(doc)) return { ...base, status: "proibida_samu", uso_permitido: "nenhum", motivo: "Protocolos do SAMU são fonte proibida no StaziaMed." };
  const cat = normalizar(doc.status_catalogo);
  if (cat === "revogado") return { ...base, status: "revogada", uso_permitido: "historico", motivo: "Catálogo marca como revogado." };
  if (doc.tipo === "historica") return { ...base, status: "revogada", uso_permitido: "historico", motivo: "Versão histórica: só explica o gabarito da época, nunca conduta." };
  if (ehProposta(doc)) return { ...base, status: "proposta", uso_permitido: "nenhum", motivo: "Texto em consulta pública/preliminar: não vale como norma." };
  if (esfera === "sociedade" || esfera === "oms" || doc.categoria === "complementar")
    return { ...base, status: "evidencia_complementar", uso_permitido: "apoio", motivo: `Recomendação de ${esfera === "oms" ? "OMS/OPAS" : esfera === "sociedade" ? "sociedade" : "fonte complementar"}: evidência, não norma do SUS.` };
  if (cat.startsWith("verificado") && (doc.categoria === "normativa" || doc.categoria === "oficial_exame") && doc.tipo === "vigente")
    return { ...base, status: "vigente", norma_sus: esfera === "sus", motivo: "Catálogo verificado e versão vigente." };
  return { ...base, status: "desconhecido", uso_permitido: "conduta_apos_conferencia", motivo: `Situação do catálogo: ${doc.status_catalogo || "vazia"}.` };
}

// ---------------------------------------------------------------- famílias de versões
function chaveFamilia(doc) {
  return normalizar(doc.titulo)
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(\d+)\s*(a|o)?\s*(edicao|ed)\b/g, " ")
    .replace(/\b(modulo|volume|vol)\s*(\d+)\b/g, "vol$2") // volume/módulo DIFERENTE é outro documento, não outra versão
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Agrupa documentos que parecem ser versões do mesmo texto (mesmo título sem ano/edição/volume). Devolve só grupos com 2+. */
export function familiasDeVersoes(docs) {
  const grupos = new Map();
  for (const d of docs) {
    const k = chaveFamilia(d);
    if (k.length < 12) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(d);
  }
  return [...grupos.entries()].filter(([, v]) => v.length > 1).map(([chave, v]) => ({ chave, docs: v }));
}

export function anoDoDoc(doc) {
  const m = String(doc.ano ?? "").match(/(19|20)\d{2}/g);
  return m ? Math.max(...m.map(Number)) : 0;
}

/** Duplicata exata = mesmo sha256 em doc_ids diferentes (mesmo arquivo cadastrado duas vezes). */
export function duplicatasExatas(docs) {
  const porHash = new Map();
  for (const d of docs) if (d.sha256) { if (!porHash.has(d.sha256)) porHash.set(d.sha256, []); porHash.get(d.sha256).push(d.doc_id); }
  return [...porHash.entries()].filter(([, ids]) => ids.length > 1).map(([sha256, ids]) => ({ sha256, doc_ids: ids }));
}

const ENT_SIMPLES = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", sect: "§", ordm: "º", ordf: "ª", ndash: "–", mdash: "—", laquo: "«", raquo: "»", hellip: "…", deg: "°", ccedil: "ç", Ccedil: "Ç", ntilde: "ñ" };
const COMBINA = { acute: "\u0301", grave: "\u0300", circ: "\u0302", tilde: "\u0303", uml: "\u0308" };
function decodificarEntidade(m, e) {
  if (e[0] === "#") {
    const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
  }
  if (e in ENT_SIMPLES) return ENT_SIMPLES[e];
  const mm = e.match(/^([A-Za-z])(acute|grave|circ|tilde|uml)$/);
  return mm ? (mm[1] + COMBINA[mm[2]]).normalize("NFC") : m;
}

/** Bytes -> texto respeitando o charset (cabeçalho ou <meta>); sites do governo ainda servem windows-1252/latin1. */
export function decodificarBytes(buf, contentType = "") {
  const head = Buffer.from(buf).subarray(0, 4096).toString("latin1");
  const cs = (String(contentType).match(/charset=([\w-]+)/i) ?? head.match(/<meta[^>]+charset=["']?([\w-]+)/i) ?? [])[1]?.toLowerCase();
  const rotulo = !cs || cs === "utf8" ? "utf-8" : cs === "iso-8859-1" || cs === "latin1" ? "windows-1252" : cs;
  try {
    const t = new TextDecoder(rotulo).decode(buf);
    if (rotulo === "utf-8" && t.includes("\ufffd")) return new TextDecoder("windows-1252").decode(buf);
    return t;
  } catch { return new TextDecoder("windows-1252").decode(buf); }
}

/** Texto visível de uma página HTML (sem script/estilo/tags). Só para comparar; não interpreta nada. */
export function textoDeHtml(html) {
  return String(html ?? "")
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|br|section|article)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+[0-9]*);/gi, (m, e) => decodificarEntidade(m, e))
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

// ---------------------------------------------------------------- vigia: decisão de mudança
/** Compara o que foi lido agora com o que o radar já sabia. "metadados_apenas" = bytes diferentes e texto igual (não revalida nada). */
export function decidirMudanca(anterior, atual) {
  if (!atual || atual.erro) return { mudou: false, motivo: "fora_do_ar", detalhe: atual?.erro ?? "sem leitura" };
  if (!anterior?.sha256) return { mudou: false, motivo: "sem_base", detalhe: "primeira leitura: vira linha de base" };
  if (anterior.sha256 === atual.sha256) return { mudou: false, motivo: "igual" };
  if (anterior.texto_sha256 && atual.texto_sha256 && anterior.texto_sha256 === atual.texto_sha256) return { mudou: false, motivo: "metadados_apenas" };
  return { mudou: true, motivo: "conteudo_diferente" };
}

// ---------------------------------------------------------------- mapa fonte → usos
/**
 * Monta o mapa fonte → onde é usada, a partir de dossiês (tema → fontes) e do vínculo questão → tema.
 * dossies: {temas:[{tema,titulo,fontes:[{id,papel}]}]}  ligacao: {questoes:[{question_id,tema_id,status}]}
 * Aula e Atualização seguem o tema (uma aula por Grande Tema). Questão anulada nunca entra. Nada é inventado: sem tema, sem uso.
 */
export function montarMapaUsos(dossies, ligacao, extras = {}) {
  const questoesPorTema = new Map();
  for (const q of ligacao?.questoes ?? []) {
    if (!q.tema_id || q.status === "annulled" || q.status === "anulada") continue;
    if (!questoesPorTema.has(q.tema_id)) questoesPorTema.set(q.tema_id, []);
    questoesPorTema.get(q.tema_id).push(q.question_id);
  }
  const mapa = new Map();
  for (const t of dossies?.temas ?? []) {
    for (const f of t.fontes ?? []) {
      if (!mapa.has(f.id)) mapa.set(f.id, { temas: [], questoes: [], aulas: [], atualizacoes: [] });
      const m = mapa.get(f.id);
      if (!m.temas.some((x) => x.tema === t.tema)) m.temas.push({ tema: t.tema, titulo: t.titulo, papel: f.papel ?? "complementar" });
      for (const q of questoesPorTema.get(t.tema) ?? []) if (!m.questoes.includes(q)) m.questoes.push(q);
      if (!m.aulas.includes(t.tema)) m.aulas.push(t.tema);
      for (const a of extras.atualizacoesPorTema?.[t.tema] ?? []) if (!m.atualizacoes.includes(a)) m.atualizacoes.push(a);
    }
  }
  return mapa;
}

/** Itens afetados por uma mudança na fonte: tudo vira "revalidar" e vai para a fila do revisor; nunca altera nada sozinho. */
export function itensAfetados(docId, mapa, { principalSomente = false } = {}) {
  const m = mapa.get(docId);
  if (!m) return { itens: [], resumo: { temas: 0, questoes: 0, aulas: 0, atualizacoes: 0 } };
  const temasValidos = m.temas.filter((t) => !principalSomente || t.papel === "principal");
  const ok = new Set(temasValidos.map((t) => t.tema));
  const itens = [];
  for (const q of m.questoes) itens.push({ tipo: "questao", ref: q, acao: "revalidar" });
  for (const a of m.aulas) if (ok.has(a)) itens.push({ tipo: "aula", ref: a, acao: "revalidar" });
  for (const a of m.atualizacoes) itens.push({ tipo: "atualizacao", ref: a, acao: "revalidar" });
  return { itens, resumo: { temas: temasValidos.length, questoes: m.questoes.length, aulas: temasValidos.length, atualizacoes: m.atualizacoes.length } };
}

// ---------------------------------------------------------------- custo da IA (estimativa)
// Preços de tabela do Gemini 2.5 Flash em US$ por milhão de tokens (entrada 0,30; saída 2,50). Estimativa: conferir na fatura do Google Cloud.
export const PRECOS_USD_POR_MILHAO = {
  "gemini-2.5-flash": { entrada: 0.3, saida: 2.5 }, "gemini-2.5-flash-lite": { entrada: 0.1, saida: 0.4 },
  // gemini-3.8-flash: 0,75 / 3,75 até 31/12/2026; 1,50 / 7,50 a partir de 01/01/2027 (mesma tabela de server/ai/prices.ts)
  "gemini-3.8-flash": { entrada: 0.75, saida: 3.75, ate: "2026-12-31", depois: { entrada: 1.5, saida: 7.5 } },
  "gemini-3.5-flash": { entrada: 1.5, saida: 9 },
};
export function custoEstimadoUsd(modelo, tokensEntrada, tokensSaida, quando = new Date()) {
  let p = PRECOS_USD_POR_MILHAO[modelo];
  if (!p) return null;
  if (p.ate && quando.toISOString().slice(0, 10) > p.ate) p = p.depois;
  return Number(((tokensEntrada * p.entrada + tokensSaida * p.saida) / 1e6).toFixed(6));
}

/** Sanitiza a resposta do modelo: só campos esperados, textos curtos. A resposta é sugestão para o revisor, nunca ordem. */
export function sanitizarAnaliseIA(bruto) {
  const obj = Array.isArray(bruto) ? bruto[0] : bruto; // o modelo às vezes embrulha a resposta numa lista
  const t = (v, n) => (Array.isArray(v) ? v.join(" ") : typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, n);
  const certeza = ["alta", "media", "baixa"].includes(obj?.certeza) ? obj.certeza : "baixa";
  return {
    o_que_mudou: t(obj?.o_que_mudou, 900),
    recomendacao_alterada: t(obj?.recomendacao_alterada, 600),
    impacto_clinico_provavel: t(obj?.impacto_clinico_provavel, 600),
    precisa_revisao_medica: true, // sempre: a IA nunca decide
    certeza,
    observacao: t(obj?.observacao, 300),
  };
}

// ---------------------------------------------------------------- linha de base e diferenças dos adaptadores
/**
 * Compara o que o adaptador leu agora com a linha de base (Map chave → {hash,...}).
 * Primeira leitura (base vazia) não gera evento: vira linha de base. Leitura com menos da metade dos itens da base é suspeita
 * (site fora do ar ou layout mudou): não gera evento nem apaga a base.
 */
export function diffItens(base, atuais) {
  const baseMap = base instanceof Map ? base : new Map(Object.entries(base ?? {}));
  if (baseMap.size === 0) return { primeira_leitura: atuais.length > 0, suspeita: false, novos: [], alterados: [], iguais: 0, sumiram: 0 };
  if (atuais.length < baseMap.size * 0.5) return { primeira_leitura: false, suspeita: true, novos: [], alterados: [], iguais: 0, sumiram: 0 };
  const novos = [], alterados = [];
  let iguais = 0;
  const vistos = new Set();
  for (const it of atuais) {
    vistos.add(it.chave);
    const antes = baseMap.get(it.chave);
    if (!antes) novos.push(it);
    else if (antes.hash !== it.hash) alterados.push({ antes, agora: it });
    else iguais++;
  }
  let sumiram = 0;
  for (const k of baseMap.keys()) if (!vistos.has(k)) sumiram++;
  // enxurrada de itens novos de uma vez = base incompleta ou site reorganizado, não 1.000 publicações: aceita como linha de base, sem eventos
  const limiteNovos = Math.max(50, Math.ceil(baseMap.size * 0.25));
  if (novos.length > limiteNovos) return { primeira_leitura: false, suspeita: false, inundacao: novos.length, novos: [], alterados, iguais, sumiram };
  return { primeira_leitura: false, suspeita: false, novos, alterados, iguais, sumiram };
}

// ---------------------------------------------------------------- referência e gravidade dos itens de adaptador
/** Classificação conservadora do que um adaptador trouxe. Sociedade médica nunca vira norma do SUS. */
export function classificarItemAdaptador(item) {
  const t = normalizar(`${item.titulo ?? ""} ${item.url ?? ""}`);
  if (item.adaptador === "febrasgo") return { referencia: "evidencia_complementar", esfera: "sociedade", norma_sus: false, uso_permitido: "apoio" };
  if (/revog|retirad|tornad[ao] sem efeito/.test(t)) return { referencia: "revogada", esfera: "sus", norma_sus: false, uso_permitido: "historico" };
  if (item.tipo === "relatorio_preliminar") return { referencia: "proposta", esfera: "sus", norma_sus: false, uso_permitido: "apoio" };
  if (item.adaptador === "conitec" || item.adaptador === "vacinacao") return { referencia: "vigente", esfera: "sus", norma_sus: item.tipo !== "relatorio_recomendacao", uso_permitido: "conduta_apos_conferencia" };
  return { referencia: "desconhecido", esfera: "sus", norma_sus: false, uso_permitido: "conduta_apos_conferencia" };
}

const RE_UNIDADE = /\b(mg|mcg|ug|ml|ui|g|kg|mmhg|mm hg|bpm|meses|mes|semanas|semana|anos|ano|dias|dia|horas|hora|dose|doses|comprimidos?|ciclos?|vezes)\b|%|\/dia|\/kg/;
const RE_REVOGACAO = /revog|retirad[ao] |tornad[ao] sem efeito|exclu[ií]d[ao] do sus|n[aã]o incorpor|exclus[aã]o/;
const RE_CONDUTA = /protocolo cl[ií]nico|\bpcdt\b|diretriz|incorpor|calend[aá]rio|instru[cç][aã]o normativa|nota t[eé]cnica|portaria|resolu[cç][aã]o|revog/; // "vacinação" sozinha (campanha, notícia) não é mudança de conduta
/**
 * Gravidade (decisão do dono, 2026-10-15): GRAVE = revogação da fonte ou mudança de conduta; LEVE = redação/numeração/moldura.
 * Só as graves vão para a decisão do dono; todas entram na fila dos 2 revisores (48 h). Nunca bloqueia nada.
 * Entrada: { referencia, origem, item:{titulo,tipo,adaptador}, diff:{itens,resumo}, novo:boolean, temasAfetados:number }
 */
export function classificarGravidade({ referencia, item, diff, novo = false, temasAfetados = 0 }) {
  const titulo = normalizar(item?.titulo ?? "");
  if (referencia === "revogada" || RE_REVOGACAO.test(titulo)) return { gravidade: "grave", motivo: "fonte revogada, retirada ou incorporação negada/excluída" };
  // mudança de conduta provável = negação (frase curta e parecida) ou número COM unidade clínica (dose, tempo, %): numeração de artigo/§/quadro é leve
  // (linha de tabela colada pelo PDF passa de 60 palavras e não vira NUMERIC: por isso o par também é checado aqui, se parecido e com números diferentes)
  const calendario = ["pagina_calendario", "arquivo_calendario", "instrucao_normativa"].includes(item?.tipo);
  const criticas = (diff?.itens ?? []).filter((i) => i.kind === "NEGATION" && i.critical
    || (i.texto_antigo && i.texto_novo && !["UNCHANGED", "EDITORIAL"].includes(i.kind) && ((i.kind === "NUMERIC" && i.critical) || (i.similarity ?? 0) >= 0.5) && numerosDiferem(i.texto_antigo, i.texto_novo)
        && (calendario || RE_UNIDADE.test(normalizar(`${i.texto_antigo} ${i.texto_novo}`)))));
  if (criticas.length) return { gravidade: "grave", motivo: `mudança de conduta provável: ${criticas.length} diferença(s) de número com unidade clínica ou de negação` };
  if (item?.adaptador === "febrasgo") return { gravidade: "leve", motivo: "evidência complementar de sociedade médica (não é norma do SUS); revisão editorial" };
  if (item?.tipo === "relatorio_preliminar") return { gravidade: "leve", motivo: "relatório em consulta pública (proposta, ainda não vigente)" };
  if (item?.tipo === "instrucao_normativa" && !novo) return { gravidade: "grave", motivo: "a Instrução Normativa do calendário mudou" };
  if ((item?.tipo === "decisao_incorporacao" || item?.tipo === "pcdt") && temasAfetados > 0) return { gravidade: "grave", motivo: "decisão de incorporação ou PCDT novo/alterado que toca tema do app" };
  if ((item?.tipo === "pagina_calendario" || item?.tipo === "arquivo_calendario") && diff && diff.itens.length) return { gravidade: "leve", motivo: "calendário mudou só em redação, numeração ou moldura" };
  if (item?.tipo === "arquivo_calendario" && !novo && !diff) return { gravidade: "grave", motivo: "arquivo do calendário mudou e não foi possível comparar o texto: revisar à mão" };
  if (novo && temasAfetados > 0 && RE_CONDUTA.test(titulo)) return { gravidade: "grave", motivo: "norma nova sobre conduta/protocolo/calendário que toca tema do app" };
  return { gravidade: "leve", motivo: temasAfetados ? "mudança de redação ou documento sem efeito claro sobre conduta" : "sem tema do app afetado (informativo)" };
}

/** Temas do app cujas palavras-chave aparecem no título do item (dossiês dos 100 Grandes Temas). Palavra curta exige palavra inteira. */
export function temasDoTitulo(titulo, dossies) {
  const alvo = " " + normalizar(titulo).replace(/[^a-z0-9]+/g, " ") + " ";
  const achados = [];
  for (const t of dossies?.temas ?? []) {
    const hit = (t.palavras ?? []).some((p) => {
      const n = normalizar(p).replace(/[^a-z0-9]+/g, " ").trim();
      if (n.length < 2) return false;
      return n.length <= 4 ? alvo.includes(" " + n + " ") : alvo.includes(" " + n);
    });
    if (hit) achados.push({ tema: t.tema, titulo: t.titulo });
  }
  return achados;
}

/** A IA nunca muda a gravidade, mas avisa o revisor quando ela, com certeza alta, só enxerga redação num evento classificado grave. */
export function observacaoDaIA(gravidade, analise) {
  if (gravidade !== "grave" || !analise) return null;
  if (analise.certeza === "alta" && /nenhuma recomenda/i.test(analise.recomendacao_alterada ?? "")) return "A IA (certeza alta) viu só mudança de redação/numeração: revisar para rebaixar a leve.";
  return null;
}
