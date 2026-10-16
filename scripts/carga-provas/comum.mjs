// Carga das provas corrigidas: peças comuns dos geradores (texto fiel, tabelas e figuras como imagem, prova 2026/2).
// Tudo lê scripts/carga-provas/dados (cópia do material revisado em 12/10/2026, origem em dados/ORIGEM.json).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const DADOS = path.join(AQUI, "dados");
export const IMAGENS = path.join(AQUI, "imagens");
export const SAIDA = path.join(AQUI, "saida");
export const BUCKET = "question-figures";
export const DATA_REVISAO = "12/10/2026";

export const lerJson = (p) => JSON.parse(fs.readFileSync(path.isAbsolute(p) ? p : path.join(DADOS, p), "utf8"));
export const md5 = (t) => crypto.createHash("md5").update(String(t), "utf8").digest("hex");
export const sha256Arquivo = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

/** Literal jsonb seguro: dollar-quote com marca que não aparece no texto. */
export function jsonbLiteral(valor, marca = "carga_dados") {
  const texto = JSON.stringify(valor);
  if (texto.includes(`$${marca}$`)) throw new Error(`a marca $${marca}$ aparece nos dados`);
  return `$${marca}$${texto}$${marca}$::jsonb`;
}
export const sqlTexto = (t) => (t == null ? "null" : `'${String(t).replace(/'/g, "''")}'`);

/** Aplica os trechos (antes → depois) em ordem; cada "antes" precisa aparecer exatamente uma vez. */
export function aplicarTrechos(texto, trechos, onde) {
  let t = texto;
  for (const p of trechos) {
    if (p.antes === "") {
      // campo vazio no banco (alternativa que perdeu o texto): o trecho é o campo inteiro
      if (t !== "") throw new Error(`${onde}: trecho vazio, mas o campo tem texto`);
      t = p.depois;
      continue;
    }
    const n = t.split(p.antes).length - 1;
    if (n !== 1) throw new Error(`${onde}: o trecho "${p.antes.slice(0, 50)}" aparece ${n} vezes`);
    t = t.replace(p.antes, () => p.depois);
  }
  return t;
}

/** Tira o trecho achatado da tabela (uma única ocorrência) e junta o espaço duplo que sobra. */
export function tirarTabela(texto, trecho, onde) {
  const n = texto.split(trecho).length - 1;
  if (n !== 1) throw new Error(`${onde}: o trecho da tabela aparece ${n} vezes`);
  const i = texto.indexOf(trecho);
  let antes = texto.slice(0, i);
  const depois = texto.slice(i + trecho.length);
  if (antes.endsWith(" ") && (depois.startsWith(" ") || depois === "")) antes = antes.slice(0, -1);
  return antes + depois;
}

export const provas = () => lerJson("provas.json");
export const questoesAntes = () => new Map(lerJson("questoes-antes.json").questoes.map((q) => [q.id, q]));
export const textoAlternativa = (q, letra) => q.options.find((o) => o.id === letra)?.text;

/**
 * Para cada prova: as questões com texto a corrigir, com o texto de hoje (export) e o texto fiel (trechos aplicados).
 * Confere contra o "corrigidas-todas.json" da revisão (md5 em dados/conferencia-corrigidas.json): o resultado tem de ser
 * idêntico (nas provas em que a revisão já tirou a tabela do texto, idêntico depois de tirar a tabela).
 */
export function correcoesDaProva(pasta, antes = questoesAntes()) {
  const trechos = lerJson(`patches/${pasta}.json`);
  const tabelas = new Map(lerJson(`tabelas/${pasta}.json`).map((t) => [t.id, t]));
  const conf = lerJson("conferencia-corrigidas.json");
  const porQuestao = new Map();
  for (const p of trechos) {
    if (!porQuestao.has(p.id)) porQuestao.set(p.id, []);
    porQuestao.get(p.id).push(p);
  }
  const itens = [];
  for (const [id, lista] of porQuestao) {
    const q = antes.get(id);
    if (!q) throw new Error(`${id}: questão fora do export`);
    const campos = {};
    const porCampo = new Map();
    for (const p of lista) {
      if (!porCampo.has(p.campo)) porCampo.set(p.campo, []);
      porCampo.get(p.campo).push(p);
    }
    for (const [campo, ps] of porCampo) {
      const chave = campo === "statement" ? "statement" : campo.replace(/^options\./, "");
      if (!/^(statement|[ABCD])$/.test(chave)) throw new Error(`${id}: campo desconhecido ${campo}`);
      const atual = chave === "statement" ? q.statement : textoAlternativa(q, chave);
      const fiel = aplicarTrechos(atual, ps, `${id}.${campo}`);
      campos[chave] = { antes: atual, depois: fiel, trechos: ps };
    }
    // conferência com o texto revisado
    const c = conf[id];
    const enun = campos.statement?.depois ?? q.statement;
    const tb = tabelas.get(id);
    const okEnun = md5(enun) === c.statement_md5 || (tb && md5(tirarTabela(enun, tb.tabela_removida_do_texto, id)) === c.statement_md5);
    if (!okEnun) throw new Error(`${id}: enunciado corrigido difere do revisado`);
    for (const l of ["A", "B", "C", "D"]) {
      const t = campos[l]?.depois ?? textoAlternativa(q, l);
      if (md5(t) !== c.options_md5[l]) throw new Error(`${id}: alternativa ${l} difere da revisada`);
    }
    itens.push({ id, code: q.code, numero: q.number, status: q.status, campos, n_trechos: lista.length });
  }
  itens.sort((a, b) => a.numero - b.numero);
  return { itens, n_trechos: trechos.length };
}

/** Enunciado depois da parte 2 (texto fiel), para quem não tem trecho de texto, o do export. */
export function enunciadoFiel(id, antes = questoesAntes(), cache = new Map()) {
  const pasta = id.replace(/_q\d+$/, "");
  if (!cache.has(pasta)) cache.set(pasta, new Map(correcoesDaProva(pasta, antes).itens.map((i) => [i.id, i])));
  const it = cache.get(pasta).get(id);
  return it?.campos.statement?.depois ?? antes.get(id).statement;
}

/** Caminho no depósito: "questoes/<32 letras>.png", sorteio determinístico (não revela nome de arquivo nem código da questão). */
export const destinoNoDeposito = (questionId, tipo, sha) =>
  `questoes/${crypto.createHash("sha256").update(`carga-provas-2026-10-12|${questionId}|${tipo}|${sha}`).digest("hex").slice(0, 32)}.png`;

/** Ordem das imagens da 2026/2 quando a questão tem figura E tabela (ordem da prova: coluna, depois altura na página). */
const ORDEM_2026_2 = { 37: ["figura", "tabela"], 81: ["tabela", "figura"] };

/**
 * O manifesto das imagens: 56 tabelas, 5 figuras que faltavam e as figuras e tabelas da 2026/2.
 * Cada questão: imagens (na ordem), as que estavam antes (export), o enunciado esperado antes e depois (tabela tirada).
 */
export function manifestoImagens() {
  const antes = questoesAntes();
  const cache = new Map();
  const porQuestao = new Map();
  const add = (id, img) => {
    if (!porQuestao.has(id)) porQuestao.set(id, []);
    porQuestao.get(id).push(img);
  };
  const nova = (id, tipo, x, pagina) => {
    const arquivo = path.join(IMAGENS, x.arquivo);
    const sha = sha256Arquivo(arquivo);
    if (sha !== x.sha256) throw new Error(`${x.arquivo}: sha256 diferente do registrado`);
    const tamanho = fs.statSync(arquivo).size;
    if (tamanho > 5 * 1024 * 1024) throw new Error(`${x.arquivo}: maior que 5 MB`);
    const alt = String(x.alt ?? "").trim();
    if (alt.length < 10 || alt.length > 300) throw new Error(`${x.arquivo}: texto alternativo fora de 10 a 300 letras`);
    return { tipo, arquivo: x.arquivo, sha256: sha, tamanho, content_type: "image/png", alt, source_page: pagina, path: destinoNoDeposito(id, tipo, sha) };
  };
  for (const p of provas()) {
    for (const t of lerJson(`tabelas/${p.pasta}.json`)) add(t.id, { ...nova(t.id, "tabela", t, t.pagina), trecho: t.tabela_removida_do_texto, observacao: t.observacao ?? null });
  }
  for (const f of lerJson("figuras-novas.json").figuras) add(f.id, nova(f.id, "figura", f, f.pagina));
  const q262 = lerJson("revalida_2026_2.json");
  for (const q of q262) {
    const tipos = ORDEM_2026_2[q.number] ?? ["figura", "tabela"];
    for (const tipo of tipos) if (q[tipo]) add(q.id, nova(q.id, tipo, q[tipo], q[tipo].pagina));
  }
  const questoes = [];
  for (const [id, imagens] of porQuestao) {
    const nova262 = id.startsWith("revalida_2026_2_");
    const q = nova262 ? null : antes.get(id);
    if (!nova262 && !q) throw new Error(`${id}: fora do export`);
    const tabela = imagens.find((i) => i.trecho);
    const enunAntes = nova262 ? null : enunciadoFiel(id, antes, cache);
    questoes.push({
      id,
      code: nova262 ? `REV-2026.2-Q${id.slice(-3)}` : q.code,
      imagens,
      imagens_antes: nova262 ? [] : q.images,
      substitui: !nova262 && q.images.length > 0,
      enunciado_antes: enunAntes,
      enunciado_depois: tabela ? tirarTabela(enunAntes, tabela.trecho, id) : null,
    });
  }
  questoes.sort((a, b) => a.id.localeCompare(b.id));
  return questoes;
}

/** O que vai em questions.images: o formato do sistema para figura do depósito ({ path, alt }) mais sha256 e página do PDF. */
export const imagemDoBanco = (i) => ({ path: i.path, alt: i.alt, sha256: i.sha256, source_page: i.source_page });
