#!/usr/bin/env node
// Radar de Evidências StaziaMed, vigia local em MODO ENSAIO (não grava em banco, não publica nada ao aluno).
//
//   node scripts/radar/vigia.mjs [--biblioteca DIR] [--saida DIR] [--max-remoto 10] [--max-pares 5] [--max-ia 3]
//                                [--sem-rede] [--sem-ia] [--sem-hash-local] [--modelo gemini-2.5-flash] [--env ARQUIVO.env]
//
// 1. lê o catálogo da biblioteca local (SQLite) e classifica cada referência (vigente | proposta | revogada | evidência
//    complementar | desconhecido | proibida_samu);
// 2. confere o hash dos PDFs locais contra o catálogo e acha duplicatas;
// 3. compara VERSÕES do mesmo documento dentro da biblioteca (diff por trecho e página);
// 4. confere uma amostra de URLs oficiais na internet (hash do arquivo) contra o catálogo;
// 5. SÓ quando há mudança chama o Gemini (Vertex) para explicar em português simples; a IA nunca altera nada;
// 6. cruza com o mapa fonte → usos (temas, questões, aulas) e lista o que fica "revalidar";
// 7. grava relatório em Markdown e JSON em --saida (padrão /Volumes/StaziaMed/.tmp-aulas/radar/).
//
// A chave VERTEX_API_KEY vem do .env do projeto e NUNCA é impressa nem gravada.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  anoDoDoc, classificarReferencia, decodificarBytes, esqueleto, textoDeHtml, compararVersoes, custoEstimadoUsd, decidirMudanca, duplicatasExatas, familiasDeVersoes,
  itensAfetados, montarMapaUsos, sanitizarAnaliseIA, sha256Hex,
} from "./lib.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");

function args() {
  const a = process.argv.slice(2), o = { flags: new Set() };
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith("--")) continue;
    const k = a[i].slice(2);
    if (a[i + 1] && !a[i + 1].startsWith("--")) o[k] = a[++i]; else o.flags.add(k);
  }
  return o;
}
const A = args();
const BIBLIOTECA = A.biblioteca ?? "/Volumes/StaziaMed/STAZIAMED REVALIDA/_biblioteca-fontes-local";
const SAIDA = A.saida ?? "/Volumes/StaziaMed/.tmp-aulas/radar";
const MAX_REMOTO = Number(A["max-remoto"] ?? 10);
const MAX_PARES = Number(A["max-pares"] ?? 5);
const MAX_IA = Number(A["max-ia"] ?? 3);
const MODELO = A.modelo ?? "gemini-2.5-flash";
const SEM_REDE = A.flags.has("sem-rede"), SEM_IA = A.flags.has("sem-ia"), SEM_HASH_LOCAL = A.flags.has("sem-hash-local");
const agora = new Date();
const carimbo = agora.toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1-$2");
const PASTA = path.join(SAIDA, carimbo);
fs.mkdirSync(path.join(SAIDA, "tmp"), { recursive: true });
fs.mkdirSync(PASTA, { recursive: true });
const log = (...m) => console.log(...m);

// ---------------------------------------------------------------- chave (nunca impressa)
function lerChave() {
  if (process.env.VERTEX_API_KEY) return process.env.VERTEX_API_KEY;
  const candidatos = [A.env, path.join(RAIZ, ".env"), path.resolve(RAIZ, "..", "..", "..", ".env"), path.resolve(RAIZ, "..", "..", ".env")].filter(Boolean);
  for (const f of candidatos) {
    try {
      const m = fs.readFileSync(f, "utf8").match(/^VERTEX_API_KEY=(.*)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch { /* tenta o próximo */ }
  }
  return null;
}

// ---------------------------------------------------------------- catálogo local
const db = new DatabaseSync(path.join(BIBLIOTECA, "biblioteca.sqlite"), { readOnly: true });
const docs = db.prepare("select * from docs").all();
const paginasDe = (docId) => db.prepare("select pagina, texto from paginas where doc_id = ? order by pagina").all(docId);
log(`Biblioteca: ${docs.length} documentos`);

// mapa fonte → usos (dossiês dos 100 Grandes Temas + ligação questão → tema; sem inventar: sem tema, sem uso)
function lerJson(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }
const dossies = lerJson(path.join(RAIZ, "scripts/portao-atualidade/dossies-100.json"));
const ligacao = lerJson(path.join(RAIZ, "scripts/grandes-temas/ligacao-questoes.json"));
const mapa = montarMapaUsos(dossies, ligacao);
log(`Mapa fonte→usos: ${mapa.size} fontes ligadas a temas`);

// ---------------------------------------------------------------- 1. classificação + campos por fonte
const fontes = docs.map((d) => {
  const c = classificarReferencia(d);
  const usos = mapa.get(d.doc_id);
  return {
    doc_id: d.doc_id, titulo: d.titulo, instituicao: d.instituicao, url: d.url_pdf || d.url || null,
    referencia: c.status, esfera: c.esfera, norma_sus: c.norma_sus, uso_permitido: c.uso_permitido, motivo_classificacao: c.motivo,
    gabarito_inep_imutavel: c.gabarito_inep_imutavel,
    vigencia_normativa: d.ato || null, data_edicao: d.ano || null, ultima_conferencia: d.atualizado_em || null,
    tema_clinico: usos ? usos.temas.map((t) => `${t.tema} ${t.titulo}`) : [], status_revisao: "pendente_revisao_medica",
    situacao_arquivo: d.situacao, sha256: d.sha256 || null,
  };
});
const porReferencia = {};
for (const f of fontes) porReferencia[f.referencia] = (porReferencia[f.referencia] ?? 0) + 1;
const proibidas = fontes.filter((f) => f.referencia === "proibida_samu").map((f) => f.doc_id);
log("Classificação:", JSON.stringify(porReferencia));

// ---------------------------------------------------------------- 2. integridade local e duplicatas
const eventos = [];
const integridade = { conferidos: 0, iguais: 0, diferentes: [], ausentes: [] };
if (!SEM_HASH_LOCAL) {
  for (const d of docs) {
    if (d.situacao !== "baixado" || !d.arquivo || !d.sha256) continue;
    const arq = path.join(BIBLIOTECA, d.arquivo);
    if (!fs.existsSync(arq)) { integridade.ausentes.push(d.doc_id); continue; }
    integridade.conferidos++;
    const h = createHash("sha256");
    const fd = fs.openSync(arq, "r");
    const buf = Buffer.allocUnsafe(1 << 20);
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) h.update(buf.subarray(0, n));
    fs.closeSync(fd);
    if (h.digest("hex") === d.sha256) integridade.iguais++; else integridade.diferentes.push(d.doc_id);
  }
  log(`Integridade local: ${integridade.iguais}/${integridade.conferidos} iguais; ${integridade.diferentes.length} diferentes; ${integridade.ausentes.length} ausentes`);
}
const duplicatas = duplicatasExatas(docs.filter((d) => d.situacao === "baixado"));

// ---------------------------------------------------------------- 3. versões do mesmo documento dentro da biblioteca
const comTexto = docs.filter((d) => d.situacao === "baixado" && d.paginas > 0);
const familias = familiasDeVersoes(comTexto).map((f) => ({ ...f, docs: f.docs.sort((x, y) => anoDoDoc(x) - anoDoDoc(y)) }));
const pares = [];
for (const f of familias) {
  for (let i = 0; i + 1 < f.docs.length; i++) {
    const [ant, nov] = [f.docs[i], f.docs[i + 1]];
    if (ant.sha256 && ant.sha256 === nov.sha256) continue; // duplicata exata, vai na lista de duplicatas
    if (classificarReferencia(ant).status === "proibida_samu") continue;
    if (ant.categoria === "oficial_exame" || nov.categoria === "oficial_exame") continue; // edições de prova são provas diferentes; gabarito do Inep nunca muda
    pares.push({ ant, nov, familia: f.chave });
  }
}
// prioridade: normativa do SUS (PCDT) primeiro
pares.sort((x, y) => Number(/pcdt|protocolo clinico/i.test(y.nov.titulo)) - Number(/pcdt|protocolo clinico/i.test(x.nov.titulo)));
// pares escolhidos à mão (--pares antigo:novo,antigo:novo): comparações que o título não revela (ex.: proposta x vigente)
for (const par of (A.pares ?? "").split(",").filter(Boolean)) {
  const [ia, ib] = par.split(":");
  const ant = docs.find((d) => d.doc_id === ia), nov = docs.find((d) => d.doc_id === ib);
  if (ant && nov) pares.unshift({ ant, nov, familia: "manual", manual: true });
}
log(`Famílias de versões: ${familias.length}; pares candidatos: ${pares.length}; comparando até ${MAX_PARES}`);
const diffsVersoes = [];
for (const p of pares) {
  if (diffsVersoes.filter((d) => !d.manual).length >= MAX_PARES && !p.manual) break;
  const pa = paginasDe(p.ant.doc_id), pn = paginasDe(p.nov.doc_id);
  const r = compararVersoes(pa, pn);
  const menor = Math.min(r.resumo.frases_antigas, r.resumo.frases_novas) || 1;
  const sobreposicao = r.resumo.iguais_exatas / menor;
  // textos quase sem trecho em comum não são "versões": são documentos diferentes com título parecido
  const mesmoDocumento = p.manual || sobreposicao >= 0.15 || r.resumo.por_tipo.MINOR_WORDING > 20 || r.resumo.por_tipo.SUBSTANTIVE > 30;
  diffsVersoes.push({ antigo: p.ant.doc_id, novo: p.nov.doc_id, ano_antigo: p.ant.ano, ano_novo: p.nov.ano, titulo: p.nov.titulo, manual: !!p.manual, ref_antigo: classificarReferencia(p.ant).status, ref_novo: classificarReferencia(p.nov).status, sobreposicao: Number(sobreposicao.toFixed(3)), mesmo_documento: mesmoDocumento, ...r });
}

// ---------------------------------------------------------------- 4. amostra remota (URL oficial → hash do arquivo)
const remoto = { tentados: 0, ok_iguais: 0, mudaram: [], falhas: [], ignorados_grandes: [] };
async function baixar(url, limiteMb = 60) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "user-agent": "StaziaMed-Radar/0.1 (ensaio; contato@staziamed.com.br)" } });
    if (!r.ok) return { erro: `HTTP ${r.status}` };
    const tam = Number(r.headers.get("content-length") ?? 0);
    if (tam > limiteMb * 1048576) return { grande: true, tam };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > limiteMb * 1048576) return { grande: true, tam: buf.length };
    return { buf, sha256: sha256Hex(buf), tam: buf.length, etag: r.headers.get("etag"), lastModified: r.headers.get("last-modified"), tipo: r.headers.get("content-type") };
  } catch (e) { return { erro: String(e?.cause?.code ?? e?.message ?? e).slice(0, 120) }; } finally { clearTimeout(t); }
}
if (!SEM_REDE) {
  const candidatas = docs
    .filter((d) => d.situacao === "baixado" && /^https:\/\//.test(d.url_pdf || "") && d.sha256 && (d.tamanho_bytes ?? 0) < 25 * 1048576 && classificarReferencia(d).status !== "proibida_samu")
    .sort((x, y) => (Number(/pcdt|protocolo clinico|portaria/i.test(y.titulo)) - Number(/pcdt|protocolo clinico|portaria/i.test(x.titulo))) || (anoDoDoc(y) - anoDoDoc(x)))
    .slice(0, MAX_REMOTO);
  for (const d of candidatas) {
    remoto.tentados++;
    const r = await baixar(d.url_pdf);
    if (r.grande) { remoto.ignorados_grandes.push(d.doc_id); continue; }
    if (r.erro) { remoto.falhas.push({ doc_id: d.doc_id, erro: r.erro }); continue; }
    const dec = decidirMudanca({ sha256: d.sha256 }, { sha256: r.sha256 });
    if (!dec.mudou) { remoto.ok_iguais++; continue; }
    // mudou: extrai o texto novo e compara com as páginas da biblioteca
    let diff = null;
    const paginasLocais = paginasDe(d.doc_id);
    if (/pdf/i.test(r.tipo ?? "") || r.buf.subarray(0, 5).toString() === "%PDF-") {
      const tmp = path.join(SAIDA, "tmp", `${d.doc_id}.pdf`);
      fs.writeFileSync(tmp, r.buf);
      const ex = spawnSync("pdfpython", ["-I", path.join(AQUI, "extrair-pdf.py"), tmp], { maxBuffer: 1 << 29, encoding: "utf8" });
      if (ex.status === 0) { try { diff = compararVersoes(paginasLocais, JSON.parse(ex.stdout).paginas); } catch { /* sem diff */ } }
      try { fs.unlinkSync(tmp); } catch { /* ok */ }
    } else {
      // página HTML: o hash dos bytes muda por menu, data e contador; o que vale é o texto
      const textoNovo = textoDeHtml(decodificarBytes(r.buf, r.tipo));
      if (esqueleto(textoNovo) === esqueleto(paginasLocais.map((p) => p.texto).join(" "))) { remoto.ok_iguais++; remoto.html_so_moldura = (remoto.html_so_moldura ?? 0) + 1; continue; }
      diff = compararVersoes(paginasLocais, [{ pagina: 1, texto: textoNovo }]);
    }
    if (diff && !diff.itens.some((i) => i.kind !== "MINOR_WORDING" && i.kind !== "EDITORIAL")) { remoto.ok_iguais++; remoto.html_so_moldura = (remoto.html_so_moldura ?? 0) + 1; continue; }
    remoto.mudaram.push({ doc_id: d.doc_id, titulo: d.titulo, url: d.url_pdf, sha256_antigo: d.sha256, sha256_novo: r.sha256, lastModified: r.lastModified, etag: r.etag, ...(diff ?? { resumo: null, itens: [] }) });
  }
  log(`Remoto: ${remoto.tentados} tentados, ${remoto.ok_iguais} iguais, ${remoto.mudaram.length} mudaram, ${remoto.falhas.length} falhas`);
}

// ---------------------------------------------------------------- 5. eventos (o que o radar sinaliza)
for (const d of integridade.diferentes) eventos.push({ origem: "arquivo_local_diferente_do_catalogo", doc_id: d, resumo: null, itens: [] });
for (const m of remoto.mudaram) eventos.push({ origem: "fonte_oficial_mudou", doc_id: m.doc_id, resumo: m.resumo, itens: m.itens, detalhe: { url: m.url, lastModified: m.lastModified } });
for (const v of diffsVersoes) if (v.mesmo_documento && v.itens.length) eventos.push({ origem: "versoes_divergem_na_biblioteca", manual: v.manual, doc_id: v.novo, doc_id_comparado: v.antigo, resumo: v.resumo, itens: v.itens, detalhe: { ano_antigo: v.ano_antigo, ano_novo: v.ano_novo, ref_antigo: v.ref_antigo, ref_novo: v.ref_novo } });

for (const ev of eventos) {
  const af = itensAfetados(ev.doc_id, mapa);
  ev.afetados = af;
  ev.referencia = fontes.find((f) => f.doc_id === ev.doc_id)?.referencia ?? "desconhecido";
}

// ---------------------------------------------------------------- 6. Gemini (só nas mudanças, com teto)
const ia = { modelo: MODELO, chamadas: 0, tokens_entrada: 0, tokens_saida: 0, custo_estimado_usd: 0, erros: [] };
async function perguntarGemini(ev, chave) {
  const top = ev.itens.slice(0, 12).map((i, n) =>
    `#${n + 1} [${i.kind}${i.critical ? ", CRITICO" : ""}] antigo(p.${i.pagina_antiga ?? "-"}): ${(i.trecho?.antes ?? i.texto_antigo ?? "(não existia)").slice(0, 350)}\n   novo(p.${i.pagina_nova ?? "-"}): ${(i.trecho?.depois ?? i.texto_novo ?? "(removido)").slice(0, 350)}`).join("\n");
  const doc = fontes.find((f) => f.doc_id === ev.doc_id);
  const prompt = `Você ajuda a equipe médica do StaziaMed (preparatório Revalida) a triar mudanças em fontes oficiais. Você NÃO decide conduta clínica e NÃO altera gabarito: apenas descreve a diferença para um revisor médico.
Documento: ${doc?.titulo ?? ev.doc_id} (${doc?.instituicao ?? ""}). Classificação do radar: ${ev.referencia}. Origem do sinal: ${ev.origem}${ev.doc_id_comparado ? `, comparado com ${ev.doc_id_comparado}` : ""}.
Diferenças encontradas por comparação automática de texto (trecho antigo x novo, com página):
${top}
Responda SOMENTE em JSON, em português simples, com as chaves: "o_que_mudou" (até 4 frases, citando as páginas), "recomendacao_alterada" (qual recomendação ou número mudou, ou "nenhuma recomendação clara"), "impacto_clinico_provavel" (o que isso pode mudar na prática ou em questões de prova; diga "incerto" se não der para saber), "certeza" ("alta", "media" ou "baixa"), "observacao" (ressalvas: pode ser só diferença de diagramação ou de extração de PDF). Não invente nada que não esteja nos trechos.`;
  const r = await fetch(`https://aiplatform.googleapis.com/v1beta1/publishers/google/models/${MODELO}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": chave, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 3000, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } } }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  ia.chamadas++;
  ia.tokens_entrada += j.usageMetadata?.promptTokenCount ?? 0;
  ia.tokens_saida += (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0);
  const txt = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (process.env.RADAR_DEBUG) fs.writeFileSync(path.join(SAIDA, "tmp", `ia-${ev.doc_id}.txt`), txt);
  return sanitizarAnaliseIA(JSON.parse(txt));
}
if (!SEM_IA && MAX_IA > 0) {
  const chave = lerChave();
  if (!chave) ia.erros.push("VERTEX_API_KEY não encontrada: IA pulada");
  else {
    const fila = eventos.filter((e) => e.itens.length).sort((x, y) => (Number(!!y.manual) - Number(!!x.manual)) || ((y.afetados.resumo.questoes + y.afetados.resumo.aulas) - (x.afetados.resumo.questoes + x.afetados.resumo.aulas)) || ((y.resumo?.criticas ?? 0) - (x.resumo?.criticas ?? 0))).slice(0, MAX_IA) // primeiro o que foi pedido, depois o que mais conteúdo toca;
    for (const ev of fila) {
      try { ev.analise_ia = await perguntarGemini(ev, chave); if (!ev.analise_ia.o_que_mudou) ev.analise_ia = await perguntarGemini(ev, chave); /* resposta vazia: tenta uma vez mais */ } catch (e) { ia.erros.push(`${ev.doc_id}: ${String(e.message).replace(chave, "***").slice(0, 120)}`); }
    }
  }
  ia.custo_estimado_usd = custoEstimadoUsd(MODELO, ia.tokens_entrada, ia.tokens_saida);
}
log(`Gemini: ${ia.chamadas} chamadas, ${ia.tokens_entrada} tokens entrada, ${ia.tokens_saida} saída, custo estimado US$ ${ia.custo_estimado_usd}`);

// ---------------------------------------------------------------- 7. relatório
const relatorio = {
  gerado_em: agora.toISOString(), modo: "ensaio (nada gravado em banco, nada publicado ao aluno)", biblioteca: BIBLIOTECA,
  totais: { documentos: docs.length, por_referencia: porReferencia, fontes_proibidas_samu: proibidas, fontes_com_uso_mapeado: mapa.size },
  integridade_local: integridade, duplicatas_exatas: duplicatas,
  familias_de_versoes: familias.map((f) => ({ chave: f.chave, docs: f.docs.map((d) => d.doc_id) })),
  comparacoes_de_versoes: diffsVersoes.map((v) => ({ ...v, itens: v.itens.slice(0, 40) })),
  conferencia_remota: remoto, eventos, ia,
  fila_de_revisao: eventos.flatMap((e) => e.afetados.itens.length ? [{ fonte: e.doc_id, origem: e.origem, qtd_itens_para_revalidar: e.afetados.itens.length, resumo: e.afetados.resumo }] : []),
  fontes,
};
fs.writeFileSync(path.join(PASTA, "relatorio.json"), JSON.stringify(relatorio, null, 1));

const md = [];
md.push(`# Radar de Evidências, ensaio de ${agora.toISOString().slice(0, 16).replace("T", " ")} UTC`, "", "Modo ensaio: nada foi gravado em banco nem publicado ao aluno. A IA só explica; a decisão é do revisor médico.", "");
md.push("## Classificação das referências", "", ...Object.entries(porReferencia).map(([k, v]) => `- ${k}: ${v}`), "");
md.push(`Fontes proibidas (SAMU) marcadas: ${proibidas.join(", ") || "nenhuma"}`, "");
md.push(`## Integridade dos PDFs locais`, "", `${integridade.iguais} de ${integridade.conferidos} iguais ao catálogo; diferentes: ${integridade.diferentes.join(", ") || "nenhum"}; ausentes: ${integridade.ausentes.join(", ") || "nenhum"}.`, "");
md.push(`## Duplicatas exatas (mesmo arquivo em dois cadastros)`, "", ...(duplicatas.map((d) => `- ${d.doc_ids.join(" = ")}`)), "");
md.push(`## Versões que divergem dentro da biblioteca`, "");
for (const v of diffsVersoes) {
  md.push(`### ${v.antigo} [${v.ref_antigo}] (${v.ano_antigo}) -> ${v.novo} [${v.ref_novo}] (${v.ano_novo})`, `${v.titulo}`, "", `Trechos em comum: ${(v.sobreposicao * 100).toFixed(0)}%. ${v.mesmo_documento ? "Tratado como versões do mesmo documento." : "Textos muito diferentes: provavelmente documentos distintos com título parecido, sem diff."}`, `Tipos: ${JSON.stringify(v.resumo.por_tipo)}; críticas: ${v.resumo.criticas}.`, "");
  if (v.mesmo_documento) for (const i of v.itens.filter((x) => x.critical).slice(0, 5)) md.push(`- [${i.kind}] antigo p.${i.pagina_antiga ?? "-"}: "...${(i.trecho?.antes ?? i.texto_antigo ?? "(não existia)").slice(0, 220)}..."  \n  novo p.${i.pagina_nova ?? "-"}: "...${(i.trecho?.depois ?? i.texto_novo ?? "(removido)").slice(0, 220)}..."`);
  md.push("");
}
md.push(`## Conferência na internet`, "", `${remoto.tentados} tentados, ${remoto.ok_iguais} iguais, ${remoto.mudaram.length} mudaram, ${remoto.falhas.length} falhas.`, ...remoto.falhas.map((f) => `- falha ${f.doc_id}: ${f.erro}`), "");
md.push(`## Eventos e análise da IA`, "");
for (const e of eventos) {
  md.push(`### ${e.origem}: ${e.doc_id}${e.doc_id_comparado ? ` (vs ${e.doc_id_comparado})` : ""}`, `Referência: ${e.referencia}. Para revalidar: ${e.afetados.resumo.questoes} questões, ${e.afetados.resumo.aulas} aulas, ${e.afetados.resumo.atualizacoes} atualizações.`);
  if (e.analise_ia) md.push(`IA (sugestão, precisa de revisão médica; certeza ${e.analise_ia.certeza}): ${e.analise_ia.o_que_mudou}  \nRecomendação alterada: ${e.analise_ia.recomendacao_alterada}  \nImpacto provável: ${e.analise_ia.impacto_clinico_provavel}`);
  md.push("");
}
md.push(`## Custo do Gemini`, "", `Modelo ${ia.modelo}; ${ia.chamadas} chamadas; ${ia.tokens_entrada} tokens de entrada; ${ia.tokens_saida} de saída; custo estimado US$ ${ia.custo_estimado_usd} (preço de tabela, conferir na fatura).`, ...ia.erros.map((x) => `- erro: ${x}`), "");
fs.writeFileSync(path.join(PASTA, "relatorio.md"), md.join("\n"));
// linha de base para a próxima rodada
fs.writeFileSync(path.join(SAIDA, "estado.json"), JSON.stringify({ atualizado_em: agora.toISOString(), docs: Object.fromEntries(docs.filter((d) => d.sha256).map((d) => [d.doc_id, { sha256: d.sha256 }])) }));
log(`Relatório: ${path.join(PASTA, "relatorio.md")}`);
