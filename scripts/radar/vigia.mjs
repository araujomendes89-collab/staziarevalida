#!/usr/bin/env node
// Radar de Evidências StaziaMed, vigia local em MODO ENSAIO (não grava em banco, não publica nada ao aluno).
//
//   node scripts/radar/vigia.mjs [--biblioteca DIR] [--saida DIR] [--max-remoto 10] [--max-pares 5] [--max-ia 3]
//                                [--sem-rede] [--sem-ia] [--sem-hash-local] [--modelo gemini-3.8-flash] [--env ARQUIVO.env]
//                                [--adaptadores [conitec,dou,vacinacao,febrasgo]] [--envelhecer-base] [--mapa-producao] [--teto-usd 5]
//
// 1. lê o catálogo da biblioteca local (SQLite) e classifica cada referência (vigente | proposta | revogada | evidência
//    complementar | desconhecido | proibida_samu);
// 2. confere o hash dos PDFs locais contra o catálogo e acha duplicatas;
// 3. compara VERSÕES do mesmo documento dentro da biblioteca (diff por trecho e página);
// 4. confere uma amostra de URLs oficiais na internet (hash do arquivo) contra o catálogo;
// 5. SÓ quando há mudança chama o Gemini (Vertex) para explicar em português simples; a IA nunca altera nada. Teto de US$ 5 por mês
//    (contador persistido em radar/custo.json): ao atingir, a IA para e a mudança é só registrada;
// 6. cruza com o mapa fonte → usos e lista o que fica "revalidar" (só AVISA; nunca bloqueia nem altera). Com --mapa-producao o mapa é
//    POR TRECHO (questão/aula/atualização → fonte/página), lido da produção em SOMENTE LEITURA; sem a flag, por tema;
// 6b. --adaptadores lê Conitec, Diário Oficial (canais permitidos), calendário de vacinação e Febrasgo; --envelhecer-base simula, no
//    ensaio, uma base antiga para mostrar como o vigia detecta o que é novo ou mudou;
// 6c. cada evento recebe gravidade: grave (revogação ou mudança de conduta, vai ao dono) ou leve (redação/numeração);
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
  anoDoDoc, classificarGravidade, classificarReferencia, observacaoDaIA, decodificarBytes, esqueleto, textoDeHtml, compararVersoes, decidirMudanca, duplicatasExatas, familiasDeVersoes,
  itensAfetados, montarMapaUsos, sha256Hex,
} from "./lib.mjs";
import { ContadorCusto, StoreCustoArquivo, tetoEfetivo } from "./custo.mjs";
import { analisarComTeto, MODELO_PADRAO, montarPrompt } from "./ia.mjs";
import { criarCliente } from "./adaptadores/http.mjs";
import { ATIVOS, ORDEM } from "./adaptadores/index.mjs";
import { EstadoArquivo, EstadoMemoria } from "./estado.mjs";
import { carregarMapaDeProducao, itensAfetadosPorTrecho, lerEnv, resumoDoMapa } from "./mapa-trechos.mjs";
import { vigiarAdaptadores } from "./nucleo.mjs";

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
const MODELO = A.modelo ?? MODELO_PADRAO;
const ADAPTADORES = A.adaptadores ? A.adaptadores.split(",").filter((x) => ORDEM.includes(x)) : A.flags.has("adaptadores") ? ATIVOS : [];
const ENVELHECER = A.flags.has("envelhecer-base"), MAPA_PRODUCAO = A.flags.has("mapa-producao");
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
let mapaTrechos = null, mapaInfo = { modo: "por tema (dossiês locais)" };
if (MAPA_PRODUCAO) {
  try {
    const env = lerEnv(A.env ?? path.resolve(RAIZ, "..", "..", "..", ".env"));
    const r = await carregarMapaDeProducao({ env, dossies, ligacao });
    mapaTrechos = r.mapa;
    mapaInfo = { modo: "por trecho, produção em SOMENTE LEITURA (somente GET)", leituras: r.leitor.chamadas.length, tabelas_lidas: r.bruto, resumo: resumoDoMapa(r.mapa) };
    log(`Mapa por trecho (produção, só leitura): ${JSON.stringify(mapaInfo.resumo)}`);
  } catch (e) { mapaInfo = { modo: "por tema (a leitura da produção falhou)", erro: String(e.message).slice(0, 160) }; log(mapaInfo.modo, mapaInfo.erro); }
}

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

const paginasDoDiff = (itens) => [...new Set((itens ?? []).flatMap((i) => [i.pagina_antiga, i.pagina_nova]).filter((p) => Number.isInteger(p)))];
for (const ev of eventos) {
  ev.afetados = mapaTrechos ? itensAfetadosPorTrecho(ev.doc_id, mapaTrechos, paginasDoDiff(ev.itens)) : itensAfetados(ev.doc_id, mapa);
  ev.referencia = fontes.find((f) => f.doc_id === ev.doc_id)?.referencia ?? "desconhecido";
  const g = classificarGravidade({ referencia: ev.referencia, item: { titulo: fontes.find((f) => f.doc_id === ev.doc_id)?.titulo ?? ev.doc_id, tipo: "biblioteca", adaptador: "biblioteca" }, diff: { itens: ev.itens }, novo: false, temasAfetados: ev.afetados.resumo.temas ?? 0 });
  ev.gravidade = g.gravidade; ev.motivo_gravidade = g.motivo;
}

// ---------------------------------------------------------------- 6. Gemini (só nas mudanças, com teto de chamadas e TETO MENSAL em dólar)
const contador = new ContadorCusto({ store: new StoreCustoArquivo(path.join(SAIDA, "custo.json")), tetoUsd: tetoEfetivo(A["teto-usd"]) });
const custoAntes = await contador.estado();
const ia = { modelo: MODELO, chamadas: 0, tokens_entrada: 0, tokens_saida: 0, custo_estimado_usd: 0, erros: [], puladas_por_teto: 0 };
const chaveIA = SEM_IA ? null : lerChave();
async function analisar(ev, doc) {
  const r = await analisarComTeto({ contador, chave: chaveIA, modelo: MODELO, prompt: montarPrompt({ titulo: doc?.titulo ?? ev.doc_id, instituicao: doc?.instituicao ?? "", referencia: ev.referencia, origem: ev.origem, comparadoCom: ev.doc_id_comparado, itens: ev.itens }) });
  if (r.analise) { ev.analise_ia = r.analise; ia.chamadas++; ia.tokens_entrada += r.tokensEntrada; ia.tokens_saida += r.tokensSaida; ev.ia_custo_usd = r.custo_usd; ev.ia_modelo = MODELO; const o = observacaoDaIA(ev.gravidade, r.analise); if (o) ev.motivo_gravidade += ` ${o}`; }
  else if (r.pulada === "teto_mensal") { ia.puladas_por_teto++; ev.ia_pulada = "teto mensal de US$ 5 atingido: mudança registrada sem análise"; }
}
if (!SEM_IA && MAX_IA > 0) {
  if (!chaveIA) ia.erros.push("VERTEX_API_KEY não encontrada: IA pulada");
  else {
    const fila = eventos.filter((e) => e.itens.length).sort((x, y) => (Number(!!y.manual) - Number(!!x.manual)) || (Number(y.gravidade === "grave") - Number(x.gravidade === "grave")) || ((y.afetados.resumo.questoes + y.afetados.resumo.aulas) - (x.afetados.resumo.questoes + x.afetados.resumo.aulas)) || ((y.resumo?.criticas ?? 0) - (x.resumo?.criticas ?? 0))).slice(0, MAX_IA); // primeiro o que foi pedido, depois o que mais conteúdo toca
    for (const ev of fila) {
      try { await analisar(ev, fontes.find((f) => f.doc_id === ev.doc_id)); } catch (e) { ia.erros.push(`${ev.doc_id}: ${String(e.message).replace(chaveIA, "***").slice(0, 120)}`); }
    }
  }
}

// ---------------------------------------------------------------- 6b. adaptadores (Conitec, DOU, vacinação, Febrasgo)
let adaptadores = null;
if (ADAPTADORES.length && !SEM_REDE) {
  const cliente = criarCliente({ pausaMs: Number(A["pausa-ms"] ?? 1500) });
  const arquivoBase = path.join(SAIDA, "estado-adaptadores.json");
  const comIA = !SEM_IA && MAX_IA > 0 && chaveIA ? { contador, chaveIA, modelo: MODELO, maxIA: Number(A["max-ia-adaptadores"] ?? 8) } : {};
  const dadosComuns = { cliente, quais: ADAPTADORES, dossies, ligacao };
  if (ENVELHECER) {
    // ensaio: 1) lê tudo e grava a base de verdade (se ainda não existe); 2) cria uma cópia ENVELHECIDA da base (tira os itens mais novos de cada
    // adaptador e muda número e hash de algumas páginas) e lê de novo, para o relatório mostrar o que o vigia faria diante de mudanças.
    const real = new EstadoArquivo(arquivoBase);
    const primeira = await vigiarAdaptadores({ ...dadosComuns, estado: real });
    const velha = new EstadoMemoria();
    const alteracoesSimuladas = [];
    for (const ad of ADAPTADORES) {
      const base = await real.carregar(ad);
      const lista = [...base].map(([chave, v]) => ({ chave, ...v }));
      const porData = [...lista].sort((x, y) => String(y.data ?? y.versao ?? "").localeCompare(String(x.data ?? x.versao ?? "")));
      const tirar = new Set(porData.slice(0, Math.max(1, Math.min(4, Math.floor(lista.length / 3)))).map((x) => x.chave));
      const resto = lista.filter((x) => !tirar.has(x.chave));
      let alterados = 0;
      for (const x of resto) {
        if (alterados >= 3) break;
        if (x.texto && /\d/.test(x.texto)) { x.texto = x.texto.replace(/(\d+)(\s*(?:meses|anos|dias|doses?|semanas))/i, (_, n, u) => `${Number(n) + 1}${u}`); x.hash = "0".repeat(64); alterados++; alteracoesSimuladas.push({ adaptador: ad, chave: x.chave, simulacao: "número alterado no texto da base antiga" }); }
        else if (!x.texto && !/^vacinacao:calendario/.test(x.chave) && ad !== "dou") { x.hash = "f".repeat(64); x.versao = "2020-01-01"; alterados++; alteracoesSimuladas.push({ adaptador: ad, chave: x.chave, simulacao: "data/versão antiga na base" }); }
      }
      await velha.salvar(ad, resto.map((x) => ({ chave: x.chave, hash: x.hash, titulo: x.titulo, versao: x.versao, data: x.data, url: x.url, tipo: x.tipo, texto: x.texto })));
      alteracoesSimuladas.push({ adaptador: ad, simulacao: `${tirar.size} itens mais novos removidos da base antiga (voltam como NOVOS)` });
    }
    const segunda = await vigiarAdaptadores({ ...dadosComuns, estado: velha, gravarBase: false, ...comIA });
    adaptadores = { modo: "ensaio com base envelhecida artificialmente", primeira_leitura: primeira.porAdaptador, alteracoes_simuladas: alteracoesSimuladas, ...segunda };
  } else {
    const r = await vigiarAdaptadores({ ...dadosComuns, estado: new EstadoArquivo(arquivoBase), ...comIA });
    adaptadores = { modo: "leitura real contra a base gravada", ...r };
  }
  for (const ev of adaptadores.eventos) if (ev.analise_ia) { ia.chamadas++; ia.custo_estimado_usd += ev.ia_custo_usd ?? 0; }
  log(`Adaptadores: ${adaptadores.porAdaptador.map((x) => `${x.adaptador} ${x.lidos} lidos/${x.eventos} eventos`).join("; ")}`);
}
const custoDepois = await contador.estado();
ia.custo_estimado_usd = Number((custoDepois.usd - custoAntes.usd).toFixed(6));
ia.mes = { mes: custoDepois.mes, usd: custoDepois.usd, teto_usd: custoDepois.teto_usd, restante_usd: custoDepois.restante_usd, atingiu_teto: custoDepois.atingiu_teto };
log(`Gemini: ${ia.chamadas} chamadas, custo estimado desta rodada US$ ${ia.custo_estimado_usd}; mês ${ia.mes.mes}: US$ ${ia.mes.usd} de US$ ${ia.mes.teto_usd}`);

// ---------------------------------------------------------------- 7. relatório
const relatorio = {
  gerado_em: agora.toISOString(), modo: "ensaio (nada gravado em banco, nada publicado ao aluno)", biblioteca: BIBLIOTECA,
  totais: { documentos: docs.length, por_referencia: porReferencia, fontes_proibidas_samu: proibidas, fontes_com_uso_mapeado: mapa.size },
  integridade_local: integridade, duplicatas_exatas: duplicatas,
  familias_de_versoes: familias.map((f) => ({ chave: f.chave, docs: f.docs.map((d) => d.doc_id) })),
  comparacoes_de_versoes: diffsVersoes.map((v) => ({ ...v, itens: v.itens.slice(0, 40) })),
  conferencia_remota: remoto, eventos, ia, mapa: mapaInfo, adaptadores,
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
md.push(`## Mapa de itens afetados`, "", `Modo: ${mapaInfo.modo}.${mapaInfo.resumo ? ` ${JSON.stringify(mapaInfo.resumo)}` : ""}${mapaInfo.erro ? ` Erro: ${mapaInfo.erro}` : ""}`, "");
if (adaptadores) {
  md.push(`## Adaptadores (${adaptadores.modo})`, "");
  for (const x of adaptadores.porAdaptador) md.push(`- ${x.adaptador}: ${x.lidos} itens lidos em ${x.ms} ms; base antes ${x.base_antes}; ${x.novos} novos, ${x.alterados} alterados, ${x.iguais} iguais; ${x.eventos} eventos${x.primeira_leitura ? " (primeira leitura: virou linha de base)" : ""}${x.leitura_suspeita ? " (leitura suspeita: ignorada)" : ""}${x.inundacao ? ` (${x.inundacao} itens novos de uma vez: aceitos como nova linha de base, sem eventos)` : ""}${x.base_incompleta ? " (leitura parcial: não virou linha de base)" : ""}${x.bloqueado ? " (canal oficial bloqueado pelo robots.txt)" : ""}${x.erros.length ? `; erros: ${x.erros.join(" | ")}` : ""}`);
  if (adaptadores.alteracoes_simuladas) md.push("", "Simulação do ensaio (base antiga artificial):", ...adaptadores.alteracoes_simuladas.map((a) => `- ${a.adaptador}${a.chave ? ` ${a.chave}` : ""}: ${a.simulacao}`));
  md.push("", `### Eventos dos adaptadores (${adaptadores.eventos.length}; graves: ${adaptadores.eventos.filter((e) => e.gravidade === "grave").length})`, "");
  for (const e of adaptadores.eventos.sort((x, y) => Number(y.gravidade === "grave") - Number(x.gravidade === "grave"))) {
    md.push(`- [${e.gravidade.toUpperCase()}] ${e.adaptador} ${e.origem === "adaptador_novo" ? "NOVO" : "MUDOU"}: ${e.titulo} (${e.tipo}${e.data ? `, ${e.data}` : ""}) ${e.url}`, `  Motivo: ${e.motivo_gravidade}. Referência: ${e.referencia}${e.fonte.esfera === "sociedade" ? " (sociedade médica, não é norma do SUS)" : ""}. Temas do app: ${e.temas.map((t) => t.tema).join(", ") || "nenhum"}; revalidar: ${e.afetados.filter((i) => i.tipo === "questao").length} questões, ${e.afetados.filter((i) => i.tipo === "aula").length} aulas.`);
    if (e.analise_ia) md.push(`  IA (sugestão, precisa de revisão médica; certeza ${e.analise_ia.certeza}): ${e.analise_ia.o_que_mudou} Impacto: ${e.analise_ia.impacto_clinico_provavel}`);
    if (e.ia_pulada) md.push(`  IA pulada: ${e.ia_pulada}`);
  }
  md.push("");
}
md.push(`## Gravidade dos eventos da biblioteca e da conferência remota`, "", ...eventos.map((e) => `- [${(e.gravidade ?? "leve").toUpperCase()}] ${e.origem} ${e.doc_id}: ${e.motivo_gravidade}`), "");
md.push(`## Custo do Gemini`, "", `Modelo ${ia.modelo}; ${ia.chamadas} chamadas; custo estimado desta rodada US$ ${ia.custo_estimado_usd} (preço de tabela, conferir na fatura). Mês ${ia.mes.mes}: US$ ${ia.mes.usd} de US$ ${ia.mes.teto_usd} (restam US$ ${ia.mes.restante_usd}${ia.mes.atingiu_teto ? "; TETO ATINGIDO: a IA para e só se registra a mudança" : ""}). Puladas por teto: ${ia.puladas_por_teto}.`, ...ia.erros.map((x) => `- erro: ${x}`), "");
fs.writeFileSync(path.join(PASTA, "relatorio.md"), md.join("\n"));
// linha de base para a próxima rodada
fs.writeFileSync(path.join(SAIDA, "estado.json"), JSON.stringify({ atualizado_em: agora.toISOString(), docs: Object.fromEntries(docs.filter((d) => d.sha256).map((d) => [d.doc_id, { sha256: d.sha256 }])) }));
log(`Relatório: ${path.join(PASTA, "relatorio.md")}`);
