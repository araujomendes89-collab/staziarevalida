// Mapa POR TRECHO do Radar: questão / aula / atualização -> fonte -> página, lido SOMENTE LEITURA da produção.
//
// Garantia de somente leitura (decisão 5 do dono): o leitor só sabe fazer GET na API REST do Supabase (nenhum POST/PATCH/DELETE existe no
// código; o método é fixo e há teste). Em SQL puro seria `BEGIN READ ONLY; select ...; ROLLBACK;` (o ambiente não tem driver Postgres
// instalado; a API REST com GET é equivalente e não pode escrever). Tabelas lidas: ch_gt_fontes, ch_sources, question_source_links, questions
// (só id/status), guideline_updates, lessons. Nenhuma senha ou chave é impressa.
//
// Ordem de precisão: 1) question_source_links (questão -> fonte -> página/seção/citação) = nível "trecho";
//                    2) tema do Grande Tema que usa a fonte (ch_gt_fontes / dossiês) = nível "tema" (fallback).
// Atualização e aula entram quando o endereço da fonte coincide (guideline_updates.source_url, lessons.guideline_url).
import fs from "node:fs";
import { montarMapaUsos } from "./lib.mjs";

const normUrl = (u) => String(u ?? "").trim().toLowerCase().replace(/^http:/, "https:").replace(/[#?].*$/, "").replace(/\/(view|@@download\/file|@@display-file\/file)$/, "").replace(/\/$/, "");

// ---------------------------------------------------------------- leitor somente leitura (só GET)
export function criarLeitorSomenteLeitura({ url, chave, fetchImpl = globalThis.fetch }) {
  const base = url.replace(/\/$/, "");
  const cab = { apikey: chave, authorization: `Bearer ${chave}` };
  const chamadas = [];
  async function todas(tabela, consulta = "select=*") {
    const linhas = [];
    for (let de = 0; ; de += 1000) {
      const alvo = `${base}/rest/v1/${tabela}?${consulta}`;
      chamadas.push(`GET ${tabela}`);
      const r = await fetchImpl(alvo, { method: "GET", headers: { ...cab, range: `${de}-${de + 999}` } });
      if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status}`);
      const parte = await r.json();
      linhas.push(...parte);
      if (parte.length < 1000) break;
    }
    return linhas;
  }
  return { todas, chamadas };
}

export async function lerDadosDeProducao(leitor) {
  const [gtFontes, chSources, links, updates, lessons] = await Promise.all([
    leitor.todas("ch_gt_fontes", "select=tema_id,catalogo_id,url,papel,evidencia,source_id&removida=eq.false"),
    leitor.todas("ch_sources", "select=id,title,url,status"),
    leitor.todas("question_source_links", "select=question_id,source_id,page,page_label,section,quote,status,temporal").catch(() => []),
    leitor.todas("guideline_updates", "select=id,slug,topic,source_url,published,review_status").catch(() => []),
    leitor.todas("lessons", "select=id,topic,guideline_url,ch_unit_id").catch(() => []),
  ]);
  const ids = [...new Set(links.map((l) => l.question_id))];
  const questoes = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const lista = ids.slice(i, i + 100).map((x) => `"${x}"`).join(",");
    for (const q of await leitor.todas("questions", `select=id,status,retired_at&id=in.(${encodeURIComponent(lista)})`)) questoes.set(q.id, q);
  }
  return { gtFontes, chSources, links, updates, lessons, questoes };
}

// ---------------------------------------------------------------- montagem (pura, testada)
function paginasDeEvidencia(ev) {
  const out = new Set();
  for (const e of Array.isArray(ev) ? ev : []) for (const p of e?.exemplos ?? []) if (Number.isInteger(p)) out.add(p);
  return [...out];
}

export function montarMapaTrechos({ gtFontes = [], chSources = [], links = [], updates = [], lessons = [], questoes = new Map() } = {}, dossies = null, ligacao = null) {
  const entradas = new Map(); // chave canônica -> entrada
  const indice = new Map();   // doc_id | url normalizada | "source:<uuid>" -> entrada
  const nova = (chave) => {
    if (!entradas.has(chave)) entradas.set(chave, { chave, temas: [], questoes: new Map(), aulas: new Map(), atualizacoes: new Map() });
    return entradas.get(chave);
  };
  // 0. base local (dossiês dos 100 Grandes Temas + questão -> tema), nível "tema"
  for (const [docId, m] of montarMapaUsos(dossies, ligacao)) {
    const e = nova(docId); indice.set(docId, e);
    for (const t of m.temas) e.temas.push({ tema: t.tema, titulo: t.titulo, papel: t.papel, paginas_exemplo: [] });
    for (const q of m.questoes) e.questoes.set(q, { nivel: "tema", paginas: new Set(), citacoes: [] });
    for (const a of m.aulas) e.aulas.set(a, { nivel: "tema", ref: a });
  }
  // 1. produção: fontes dos Grandes Temas (acrescenta temas e páginas de exemplo; cria a entrada se só existir lá)
  for (const g of gtFontes) {
    const e = indice.get(g.catalogo_id) ?? nova(g.catalogo_id);
    indice.set(g.catalogo_id, e);
    if (g.url) indice.set(normUrl(g.url), e);
    if (g.source_id) indice.set(`source:${g.source_id}`, e);
    const ja = e.temas.find((t) => t.tema === g.tema_id);
    const pags = paginasDeEvidencia(g.evidencia);
    if (ja) ja.paginas_exemplo = pags; else e.temas.push({ tema: g.tema_id, titulo: null, papel: g.papel ?? "complementar", paginas_exemplo: pags });
    if (!e.aulas.has(g.tema_id)) e.aulas.set(g.tema_id, { nivel: "tema", ref: g.tema_id });
  }
  // ponte ch_sources.id -> entrada por endereço
  for (const s of chSources) {
    const e = s.url ? indice.get(normUrl(s.url)) : null;
    if (e) indice.set(`source:${s.id}`, e);
  }
  // 2. vínculos questão -> fonte -> trecho (nível "trecho"); questão anulada/recolhida nunca entra
  for (const l of links) {
    if (l.status === "nao_confirmada" || l.temporal === "historica") continue;
    const q = questoes.get(l.question_id);
    if (q && (q.status === "annulled" || q.status === "anulada" || q.retired_at)) continue;
    let e = indice.get(`source:${l.source_id}`);
    if (!e) { e = nova(`source:${l.source_id}`); indice.set(`source:${l.source_id}`, e); const src = chSources.find((s) => s.id === l.source_id); if (src?.url) indice.set(normUrl(src.url), e); }
    const atual = e.questoes.get(l.question_id);
    const base = atual && atual.nivel === "trecho" ? atual : { nivel: "trecho", paginas: new Set(), citacoes: [] };
    if (Number.isInteger(l.page)) base.paginas.add(l.page);
    if (l.quote) base.citacoes.push(l.quote.slice(0, 200));
    if (!Number.isInteger(l.page) && l.page_label) base.citacoes.push(l.page_label);
    e.questoes.set(l.question_id, base);
  }
  // 3. atualizações e aulas pelo endereço da fonte
  for (const u of updates) {
    const e = u.source_url ? indice.get(normUrl(u.source_url)) : null;
    if (e) e.atualizacoes.set(u.id, { ref: u.id, slug: u.slug, publicada: !!u.published });
  }
  for (const a of lessons) {
    const e = a.guideline_url ? indice.get(normUrl(a.guideline_url)) : null;
    if (e) e.aulas.set(a.id, { nivel: "trecho", ref: a.id });
  }
  return { entradas, indice };
}

export function resumoDoMapa(mapa) {
  let q = 0, qTrecho = 0, at = 0, au = 0;
  for (const e of mapa.entradas.values()) {
    for (const v of e.questoes.values()) { q++; if (v.nivel === "trecho") qTrecho++; }
    at += e.atualizacoes.size; au += e.aulas.size;
  }
  return { fontes: mapa.entradas.size, vinculos_questao: q, vinculos_questao_por_trecho: qTrecho, vinculos_questao_so_por_tema: q - qTrecho, vinculos_atualizacao: at, vinculos_aula: au };
}

/**
 * Itens a revalidar quando a fonte mudou. paginasMudadas = páginas (antigas e novas) onde o diff achou diferença.
 * Questão com vínculo de TRECHO só entra se a página dela está entre as páginas mudadas (ou se o vínculo não tem página);
 * questão só por tema entra sempre (não dá para saber o trecho). Nada é alterado: o resultado só alimenta "revalidar".
 */
export function itensAfetadosPorTrecho(chave, mapa, paginasMudadas = null) {
  const e = mapa.indice.get(chave) ?? mapa.indice.get(normUrl(chave)) ?? mapa.entradas.get(chave);
  const vazio = { itens: [], resumo: { temas: 0, questoes: 0, questoes_por_trecho: 0, questoes_fora_do_trecho: 0, aulas: 0, atualizacoes: 0 } };
  if (!e) return vazio;
  const mudadas = paginasMudadas && paginasMudadas.length ? new Set(paginasMudadas) : null;
  const itens = [];
  let porTrecho = 0, fora = 0;
  for (const [id, v] of e.questoes) {
    if (v.nivel === "trecho" && mudadas && v.paginas.size && ![...v.paginas].some((p) => mudadas.has(p))) { fora++; continue; }
    if (v.nivel === "trecho") porTrecho++;
    itens.push({ tipo: "questao", ref: id, acao: "revalidar", nivel: v.nivel, paginas: [...v.paginas].sort((a, b) => a - b), citacao: v.citacoes[0] ?? null });
  }
  for (const [ref, a] of e.aulas) itens.push({ tipo: "aula", ref, acao: "revalidar", nivel: a.nivel, paginas: [], citacao: null });
  for (const [ref, a] of e.atualizacoes) itens.push({ tipo: "atualizacao", ref, acao: "revalidar", nivel: "trecho", paginas: [], citacao: null });
  return { itens, resumo: { temas: e.temas.length, questoes: e.questoes.size - fora, questoes_por_trecho: porTrecho, questoes_fora_do_trecho: fora, aulas: e.aulas.size, atualizacoes: e.atualizacoes.size } };
}

// ---------------------------------------------------------------- uso na linha de comando
export function lerEnv(arquivo) {
  const o = {};
  for (const l of fs.readFileSync(arquivo, "utf8").split("\n")) { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) o[m[1]] = m[2].trim().replace(/^["']|["']$/g, ""); }
  return o;
}
export async function carregarMapaDeProducao({ env, dossies, ligacao, fetchImpl }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessárias para ler a produção");
  const leitor = criarLeitorSomenteLeitura({ url: env.SUPABASE_URL, chave: env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl });
  const dados = await lerDadosDeProducao(leitor);
  const mapa = montarMapaTrechos(dados, dossies, ligacao);
  return { mapa, leitor, bruto: { gt_fontes: dados.gtFontes.length, ch_sources: dados.chSources.length, question_source_links: dados.links.length, guideline_updates: dados.updates.length, lessons: dados.lessons.length } };
}
