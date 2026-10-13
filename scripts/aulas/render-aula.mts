/**
 * Gera TODA a parte visual de uma aula a partir da pasta de conteúdo, num comando só (pode rodar de novo
 * quantas vezes quiser; a pasta de saída é refeita):
 *
 *   npx tsx scripts/aulas/render-aula.mts <pasta-de-conteudo> <pasta-de-saida> [--ajustes ajustes.json] [--conferir pasta]
 *
 * Entrada (mesma estrutura de aulas-piloto/<código>/final): aula.json, pdf_aluno.md, flashcards.json, fixacao.json,
 * card_resumo.json, visual_briefing.json, fontes.json e, se houver, comandos/*.txt, lessons_campos.json, lacunas.md,
 * para-o-revisor-medico.md, CHANGELOG.md, auditoria/.
 *
 * Saída:
 *   imagens/   cards (feed, story), página A4 (PNG e PDF) e flashcards (digital PNG/PDF; A6 PDF + prévia PNG),
 *              no modelo visual atual (criativo-1), com a conferência automática de cada peça;
 *   pdf/       PDF do aluno interativo (sumário clicável, marcadores, caixas de marcar, anotações, questões e flashcards);
 *   previa-final.html  a mesma aula em HTML, com os mesmos recursos;
 *   comandos/  o comando usado em cada peça (cola no editor da Central);
 *   fontes-internas/   fontes, afirmações e trechos citados (só para a equipe e o revisor; nada disso vai ao aluno);
 *   conteúdo limpo (aula.json, flashcards.json, fixacao.json, pdf_aluno.md…), para-o-revisor-medico.md,
 *   conferencia-automatica.json e manifesto.json (sha256, tamanho, dimensões e texto alternativo de cada arquivo).
 *
 * Regra do dono (2026-10-13): NENHUMA referência no texto que o aluno lê (sem [n], sem lista de referências, sem
 * "segundo o Guia…", sem rodapé com documento/página). A linha pequena de fonte continua só no rodapé dos cards e do A4.
 * O que ainda parecer referência no texto do aluno PARA a geração (código 3) e aparece em conferencia-automatica.json.
 *
 * Sem IA, sem chave do .env, sem banco: só os arquivos da pasta, o Chromium (Playwright) e o PyMuPDF (pdfpython).
 */
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { createRenderer } from "../../server/contentHub/render.ts";
import { renderVisualContent, visualFontCss } from "../../server/contentHub/visual/render.ts";
import { VISUAL_TEMPLATE_VERSION, parseVisualCommand, resolveSpecialty, validateVisualInput, visualCommandText, type VisualContent } from "../../src/shared/visualMaterials/index.ts";
import { SECOES_INTERNAS, SINAIS_DE_REFERENCIA, htmlPdf, htmlPrevia, lerMarkdown, limparTexto, montarSecoes, type Aula } from "./aula-html.mts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PY = process.env.CONTENT_HUB_PYTHON ?? "pdfpython";

// ---------------------------------------------------------------------------- argumentos
const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const pos = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
const [SRC, OUT] = pos.map((p) => path.resolve(p));
if (!SRC || !OUT) {
  console.error("Uso: npx tsx scripts/aulas/render-aula.mts <pasta-de-conteudo> <pasta-de-saida> [--ajustes ajustes.json] [--conferir pasta]");
  process.exit(1);
}
if (path.resolve(SRC) === path.resolve(OUT)) throw new Error("A saída não pode ser a própria pasta de conteúdo.");

interface Ajustes {
  /** Ícone/cena do kit para todas as peças (ex.: "pulmao"). */
  ilustracao_icone?: string;
  /** Trocas extras no texto do aluno: [["de (regex)", "para"]]. */
  substituicoes?: [string, string][];
  /** Campos a acrescentar ou trocar por peça: { "feed": { "tome_nota": "…" } } (só texto já validado). */
  campos?: Record<string, Record<string, unknown>>;
}
const ajustesPath = opt("ajustes");
const AJ: Ajustes = ajustesPath ? JSON.parse(fs.readFileSync(ajustesPath, "utf8")) : {};
const extras: [RegExp, string][] = (AJ.substituicoes ?? []).map(([a, b]) => [new RegExp(a, "g"), b]);
const limpar = (s: string) => limparTexto(s, extras);
const conferir = opt("conferir");

const ler = (f: string) => (fs.existsSync(path.join(SRC, f)) ? fs.readFileSync(path.join(SRC, f), "utf8") : null);
const lerJson = (f: string) => {
  const t = ler(f);
  return t ? JSON.parse(t) : null;
};

// ---------------------------------------------------------------------------- conteúdo
const aulaJson = lerJson("aula.json") ?? {};
const flashJson = lerJson("flashcards.json") ?? {};
const fixJson = lerJson("fixacao.json") ?? { items: [] };
const cardResumo = lerJson("card_resumo.json") ?? {};
const briefing = lerJson("visual_briefing.json") ?? {};
const pdfMd = ler("pdf_aluno.md") ?? "";
const CODIGO: string = aulaJson.codigo_roteiro ?? path.basename(path.dirname(SRC));

const avisos: string[] = [];
const erros: string[] = [];

// pasta de saída refeita (só o que este comando gera)
// a conferência visual é escrita por quem olha as peças: fica guardada entre as gerações
const MANUAIS = ["conferencia-visual.md"];
if (fs.existsSync(OUT)) for (const f of fs.readdirSync(OUT)) if (!MANUAIS.includes(f)) fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
for (const d of ["imagens", "pdf", "comandos", "fontes-internas"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });

function comandoArquivo(sufixo: RegExp): string | null {
  const dir = path.join(SRC, "comandos");
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).find((x) => sufixo.test(x));
  return f ? fs.readFileSync(path.join(dir, f), "utf8") : null;
}

/** visual_briefing.campos (JSON do roteiro) → texto de comando. */
function briefingParaComando(campos: Record<string, any>): string {
  const linhas: string[] = [];
  for (const [k, v] of Object.entries(campos)) {
    if (k === "tabela" && Array.isArray(v)) {
      linhas.push("tabela:", ...v.map((r: any) => `| ${(Array.isArray(r) ? r : [r]).join(" | ")} |`));
    } else if (Array.isArray(v)) linhas.push(`${k}:`, ...v.map((x) => `- ${x}`));
    else if (v != null && v !== "") linhas.push(`${k}: ${v}`);
  }
  return linhas.join("\n");
}

type Peca = { nome: string; modelo: string; texto: string; flash?: boolean };
const pecas: Peca[] = [];
const feedTxt = comandoArquivo(/card-feed\.txt$/) ?? cardResumo.feed?.comando;
const storyTxt = comandoArquivo(/card-story\.txt$/) ?? cardResumo.story?.comando;
const a4Txt = comandoArquivo(/pagina-a4\.txt$/) ?? (briefing.campos ? briefingParaComando(briefing.campos) : null);
if (feedTxt) pecas.push({ nome: `${CODIGO}-card-feed`, modelo: "feed", texto: feedTxt });
if (storyTxt) pecas.push({ nome: `${CODIGO}-card-story`, modelo: "story", texto: storyTxt });
if (a4Txt) pecas.push({ nome: `${CODIGO}-pagina-a4`, modelo: "a4", texto: a4Txt });
const cartoes: any[] = flashJson.cartoes ?? [];
for (const c of cartoes) {
  if (c.comando_flashcard_digital) pecas.push({ nome: `${c.id}-digital`, modelo: "flashcard_digital", texto: c.comando_flashcard_digital, flash: true });
  if (c.comando_flashcard_a6) pecas.push({ nome: `${c.id}-a6`, modelo: "flashcard_a6", texto: c.comando_flashcard_a6, flash: true });
}
if (!cartoes.length) {
  const dir = path.join(SRC, "comandos");
  if (fs.existsSync(dir))
    for (const f of fs.readdirSync(dir).filter((x) => /-F\d+-(digital|a6)\.txt$/.test(x)).sort())
      pecas.push({ nome: f.replace(/\.txt$/, ""), modelo: f.includes("-a6") ? "flashcard_a6" : "flashcard_digital", texto: fs.readFileSync(path.join(dir, f), "utf8"), flash: true });
}

const fontesFlash: Record<string, { fonte?: string; referencia?: string }> = {};
const contents: Record<string, VisualContent> = {};

function prepararPeca(p: Peca): Record<string, any> | null {
  const parsed = parseVisualCommand(p.texto);
  for (const pr of parsed.problems) erros.push(`${p.nome}: linha ${pr.line}: ${pr.message}`);
  const input = { ...parsed.input };
  if (p.flash) {
    // flashcards: sem fonte nem referência no que o aluno lê (vão para fontes-internas)
    fontesFlash[input.card_id ?? p.nome] = { ...(fontesFlash[input.card_id ?? p.nome] ?? {}), ...(input.fonte ? { fonte: input.fonte } : {}), ...(input.referencia ? { referencia: input.referencia } : {}) };
    delete input.fonte;
    delete input.referencia;
    for (const k of ["pergunta", "resposta", "explicacao", "como_lembrar", "pegadinha"]) if (typeof input[k] === "string") input[k] = limpar(input[k]);
  } else {
    for (const k of ["resumo", "resumo_paragrafo", "pegadinha", "tome_nota", "dado_chave", "subtitulo"]) if (typeof input[k] === "string") input[k] = limpar(input[k]);
    if (Array.isArray(input.pontos_chave)) input.pontos_chave = input.pontos_chave.map((x: string) => limpar(x));
  }
  if (AJ.ilustracao_icone) input.ilustracao = { ...(typeof input.ilustracao === "object" ? input.ilustracao : {}), tipo: "icone", icone: AJ.ilustracao_icone };
  Object.assign(input, AJ.campos?.[p.modelo] ?? {}, AJ.campos?.[p.nome] ?? {});
  return input;
}

const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
const conferencia: any = { gerado_em: new Date().toISOString(), conteudo: SRC, modelo_visual: VISUAL_TEMPLATE_VERSION, pecas: {}, pdf_aluno: null, previa: null, texto_do_aluno: [] };
const imagensPrevia: Aula["imagens"] = [];
const altTexts: Record<string, string> = {};

const resumir = (s: string, n = 260) => (s.length > n ? s.slice(0, n - 1).trim() + "…" : s);

function altPeca(c: VisualContent, lado: string): string {
  if (c.model === "flashcard_digital" || c.model === "flashcard_a6") {
    return lado === "front" ? `Flashcard ${c.card_id}, frente: ${c.pergunta}` : resumir(`Flashcard ${c.card_id}, verso. Resposta: ${c.resposta} ${c.explicacao || c.como_lembrar}`);
  }
  const partes = [`${c.model === "a4" ? "Página A4" : c.model === "feed" ? "Card de feed" : "Story"} "${c.titulo}"`, c.subtitulo, c.resumo, c.dado_chave && `Destaque: ${c.dado_chave}`, c.pontos_chave.length && `Pontos-chave: ${c.pontos_chave.map((x) => x.replace(/[.;]+$/, "")).join("; ")}`, c.tabela && `Tabela: ${c.tabela.titulo}`, c.pegadinha && `Pegadinha: ${c.pegadinha}`];
  return resumir(partes.filter(Boolean).map((x) => String(x).replace(/[.;]+$/, "")).join(". ") + ".", 400);
}

// ---------------------------------------------------------------------------- geração das peças
const renderer = await createRenderer();
if (!renderer) throw new Error("Chromium (Playwright) não encontrado neste computador.");
try {
  for (const p of pecas) {
    const input = prepararPeca(p);
    if (!input) continue;
    const v = validateVisualInput(input);
    fs.writeFileSync(path.join(OUT, "comandos", `${p.nome}.txt`), visualCommandText(input) + "\n");
    if (!v.ok) {
      erros.push(...v.problems.map((x) => `${p.nome}: ${x.message} (o detalhe que não couber vai só para o PDF da aula)`));
      conferencia.pecas[p.nome] = { ok: false, problemas: v.problems };
      continue;
    }
    for (const w of v.warnings) avisos.push(`${p.nome}: ${w.message}`);
    const c = v.content;
    contents[p.nome] = c;
    const r = await renderVisualContent(renderer, c);
    conferencia.pecas[p.nome] = { ok: r.check.ok, problemas: r.check.problems, encaixe: r.check.fitted, modelo_visual: r.check.template_version };
    if (!r.check.ok) erros.push(...r.check.problems.map((x) => `${p.nome}: ${x.message}`));
    for (const f of r.files) {
      const lado = f.side === "front" ? "-frente" : f.side === "back" ? "-verso" : "";
      const nome = f.format === "pdf" ? `${p.nome}.pdf` : `${p.nome}${lado}.png`;
      fs.writeFileSync(path.join(OUT, "imagens", nome), f.data);
      if (f.format === "png") altTexts[nome] = altPeca(c, f.side);
    }
    // A6: só PDF (impressão); prévia PNG das duas faces para conferir e mostrar
    if (c.model === "flashcard_a6") {
      const pdfFile = path.join(OUT, "imagens", `${p.nome}.pdf`);
      execFileSync(PY, ["-I", "-c", `import sys,pymupdf\nd=pymupdf.open(sys.argv[1])\nfor i,pg in enumerate(d): pg.get_pixmap(dpi=110).save(sys.argv[2]+("-frente-previa.png" if i==0 else "-verso-previa.png"))`, pdfFile, path.join(OUT, "imagens", p.nome)]);
      altTexts[`${p.nome}-frente-previa.png`] = altPeca(c, "front") + " (prévia da impressão A6)";
      altTexts[`${p.nome}-verso-previa.png`] = altPeca(c, "back") + " (prévia da impressão A6)";
    }
    const titulos: Record<string, string> = { feed: "Card de feed", story: "Story", a4: "Página A4" };
    if (titulos[c.model]) imagensPrevia.push({ arquivo: `imagens/${p.nome}.png`, pdf: `imagens/${p.nome}.pdf`, titulo: titulos[c.model], alt: altTexts[`${p.nome}.png`] });
    if (c.model === "flashcard_digital") {
      imagensPrevia.push({ arquivo: `imagens/${p.nome}-frente.png`, pdf: `imagens/${p.nome}.pdf`, titulo: `${c.card_id} digital · frente`, alt: altTexts[`${p.nome}-frente.png`] });
      imagensPrevia.push({ arquivo: `imagens/${p.nome}-verso.png`, titulo: `${c.card_id} digital · verso`, alt: altTexts[`${p.nome}-verso.png`] });
    }
    if (c.model === "flashcard_a6") {
      imagensPrevia.push({ arquivo: `imagens/${p.nome}-frente-previa.png`, pdf: `imagens/${p.nome}.pdf`, titulo: `${c.card_id} A6 · frente`, alt: altTexts[`${p.nome}-frente-previa.png`] });
      imagensPrevia.push({ arquivo: `imagens/${p.nome}-verso-previa.png`, titulo: `${c.card_id} A6 · verso`, alt: altTexts[`${p.nome}-verso-previa.png`] });
    }
    console.log(`${r.check.ok ? "ok " : "ERRO"} ${p.nome}${r.check.fitted.length ? ` (encaixe: ${r.check.fitted.map((x: any) => `${x.field} ${x.scale}`).join(", ")})` : ""}`);
  }

  // -------------------------------------------------------------------------- aula do aluno (PDF e prévia)
  const md = lerMarkdown(pdfMd);
  const a4 = contents[`${CODIGO}-pagina-a4`] ?? null;
  const secoes = montarSecoes(md.secoes, a4, limpar);
  const sp = resolveSpecialty(aulaJson.area ?? "clinica_medica");
  const flashcards = cartoes.length
    ? cartoes.map((c) => ({ id: c.id, frente: limpar(c.frente), resposta: limpar(c.resposta), explicacao: limpar(c.explicacao ?? "") }))
    : (flashJson.material_central?.cards ?? []).map((c: any, i: number) => ({ id: `${CODIGO}-F${String(i + 1).padStart(2, "0")}`, frente: limpar(c.front), resposta: limpar(c.back), explicacao: "" }));
  const questoes = (fixJson.items ?? []).map((q: any) => ({
    numero: q.numero,
    dimensao: q.dimensao ?? "",
    stem: limpar(q.stem),
    options: q.options.map((o: any) => ({ id: o.id, text: limpar(o.text) })),
    correct: q.correct,
    comments: Object.fromEntries((q.comments ?? []).map((c: any) => [c.id, limpar(c.text)])),
    label: q.label ?? "Questão StaziaMed (não é questão oficial do Inep)",
  }));
  const titulo = limpar(aulaJson.titulo ?? md.titulo);
  const aula: Aula = {
    codigo: CODIGO,
    titulo,
    area: aulaJson.area ?? sp.label,
    subarea: aulaJson.subarea ?? "",
    atualizacao: (a4?.atualizacao || contents[`${CODIGO}-card-feed`]?.atualizacao || "").trim(),
    specialtyKey: sp.key,
    mensagem: limpar(cardResumo.mensagem_do_card ?? ""),
    meta: limpar(md.meta.replace(/·?\s*Não é material oficial do Inep\.?/i, "").trim()) + (md.meta ? " Não é material oficial do Inep." : ""),
    icone: AJ.ilustracao_icone ?? "prancheta",
    secoes,
    questoes,
    flashcards,
    imagens: imagensPrevia,
    pdfAluno: `pdf/${CODIGO}-aula-interativa.pdf`,
  };

  // texto do aluno: nada pode parecer referência
  const textoAluno: string[] = [aula.titulo, aula.mensagem, aula.meta];
  for (const s of secoes)
    for (const b of s.blocos) textoAluno.push(JSON.stringify(b.t === "tabela" || b.t === "passos" ? { t: b.t } : b));
  for (const q of questoes) textoAluno.push(q.stem, ...q.options.map((o: any) => o.text), ...Object.values(q.comments) as string[]);
  for (const f of flashcards) textoAluno.push(f.frente, f.resposta, f.explicacao);
  for (const t of textoAluno) {
    const m = SINAIS_DE_REFERENCIA.exec(t ?? "");
    if (m) conferencia.texto_do_aluno.push({ trecho: resumir(t, 160), sinal: m[0] });
  }

  const fontCss = visualFontCss().css;
  const page = await renderer.newPage!({ viewport: { width: 794, height: 1123 } });
  try {
    await page.setContent(htmlPdf(aula, fontCss), { waitUntil: "load" });
    await page.evaluate(() => (document as any).fonts.ready);
    await page.waitForFunction(() => (window as any).__aula?.done === true, null, { timeout: 60_000 });
    const lay = await page.evaluate(() => (window as any).__aula);
    const raw = await page.pdf({ width: "210mm", height: "297mm", printBackground: true, preferCSSPageSize: true });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aula-pdf-"));
    try {
      fs.writeFileSync(path.join(tmp, "in.pdf"), raw);
      fs.writeFileSync(
        path.join(tmp, "spec.json"),
        JSON.stringify({ scale: 595.28 / 794, dests: lay.dests, links: lay.links, checks: lay.checks, fields: lay.fields, bookmarks: lay.bookmarks, metadata: { title: `${CODIGO} · ${titulo}`, author: "StaziaMed", subject: "Material StaziaMed (não é material oficial do Inep)", keywords: `aula=${CODIGO}; modelo=${VISUAL_TEMPLATE_VERSION}`, creator: "scripts/aulas/render-aula.mts" } })
      );
      const dst = path.join(OUT, "pdf", `${CODIGO}-aula-interativa.pdf`);
      const rel = JSON.parse(execFileSync(PY, ["-I", path.join(ROOT, "scripts/aulas/pdf_interativo.py"), path.join(tmp, "in.pdf"), dst, path.join(tmp, "spec.json")]).toString());
      conferencia.pdf_aluno = { arquivo: path.relative(OUT, dst), ...rel, paginas_html: lay.pages, problemas_de_paginacao: lay.problemas };
      if (lay.problemas.length) erros.push(...lay.problemas.map((x: string) => `PDF do aluno: ${x}`));
      if (rel.missing_dests.length) erros.push(`PDF do aluno: destinos sem alvo: ${rel.missing_dests.join(", ")}`);
      // o texto final do PDF também não pode ter referência (fora a linha de "não é material oficial")
      const txt = execFileSync(PY, ["-I", "-c", "import sys,pymupdf\nprint('\\n'.join(p.get_text() for p in pymupdf.open(sys.argv[1])))", dst]).toString();
      const m = SINAIS_DE_REFERENCIA.exec(txt);
      if (m) conferencia.texto_do_aluno.push({ trecho: "PDF do aluno (texto extraído)", sinal: m[0] });
      if (conferir) {
        fs.mkdirSync(conferir, { recursive: true });
        execFileSync(PY, ["-I", "-c", "import sys,pymupdf\nd=pymupdf.open(sys.argv[1])\nfor i,p in enumerate(d): p.get_pixmap(dpi=int(sys.argv[3])).save(f'{sys.argv[2]}/pag-{i+1:02d}.png')", dst, conferir, "72"]);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  } finally {
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, "previa-final.html"), htmlPrevia(aula, fontCss));
  conferencia.previa = { arquivo: "previa-final.html", secoes: secoes.length, questoes: questoes.length, flashcards: flashcards.length };

  // -------------------------------------------------------------------------- conteúdo limpo (o que o aluno lê) e fontes internas
  const mdLimpo = [`# ${titulo}`, "", aula.meta ? `*${aula.meta}*` : "", ""];
  const secoesInternas: string[] = [];
  {
    let dentro = false;
    for (const l of pdfMd.split("\n")) {
      if (/^##\s/.test(l)) dentro = SECOES_INTERNAS.test(l);
      if (dentro || /^#{2,3}\s/.test(l) === false) {
        if (dentro) secoesInternas.push(l);
      }
    }
  }
  for (const s of md.secoes.filter((s) => !SECOES_INTERNAS.test(s.titulo))) {
    mdLimpo.push(`## ${limpar(s.titulo)}`, "");
    for (const it of s.itens) {
      const t = limpar(it.s);
      if (!t || /^os n[úu]meros entre colchetes/i.test(t) || /^fontes?:\s*$/i.test(t)) continue;
      mdLimpo.push(it.k === "h3" ? `### ${t}` : it.k === "li" ? `- ${t}` : t, it.k === "li" ? "" : "");
    }
  }
  mdLimpo.push("---", "Material StaziaMed. Não é material oficial do Inep.", "");
  fs.writeFileSync(path.join(OUT, "pdf_aluno.md"), mdLimpo.join("\n").replace(/\n{3,}/g, "\n\n"));
  fs.writeFileSync(path.join(OUT, "fontes-internas", "trechos-citados.md"), `# ${CODIGO}: referências e trechos citados (uso interno)\n\nTirados do texto do aluno na v2 (pedido do dono, 2026-10-13). Ficam só para a equipe e o revisor médico.\n\n${secoesInternas.join("\n")}\n`);
  if (aulaJson.sections)
    aulaJson.sections = aulaJson.sections.map((s: any) => ({ ...s, heading: limpar(s.heading ?? ""), paragraphs: (s.paragraphs ?? []).map((p: any) => ({ ...p, text: limpar(p.text ?? "") })) }));
  fs.writeFileSync(path.join(OUT, "aula.json"), JSON.stringify(aulaJson, null, 2));
  if (flashJson.material_central?.cards) flashJson.material_central.cards = flashJson.material_central.cards.map((c: any) => ({ ...c, front: limpar(c.front), back: limpar(c.back) }));
  if (flashJson.cartoes)
    flashJson.cartoes = flashJson.cartoes.map((c: any) => {
      const { referencia, ...rest } = c;
      return { ...rest, explicacao: limpar(c.explicacao ?? ""), verso_central: limpar(c.verso_central ?? ""), comando_flashcard_digital: fs.existsSync(path.join(OUT, "comandos", `${c.id}-digital.txt`)) ? fs.readFileSync(path.join(OUT, "comandos", `${c.id}-digital.txt`), "utf8").trim() : c.comando_flashcard_digital, comando_flashcard_a6: fs.existsSync(path.join(OUT, "comandos", `${c.id}-a6.txt`)) ? fs.readFileSync(path.join(OUT, "comandos", `${c.id}-a6.txt`), "utf8").trim() : c.comando_flashcard_a6 };
    });
  fs.writeFileSync(path.join(OUT, "flashcards.json"), JSON.stringify(flashJson, null, 2));
  if (fixJson.items) fixJson.items = fixJson.items.map((q: any) => ({ ...q, stem: limpar(q.stem), comments: (q.comments ?? []).map((c: any) => ({ ...c, text: limpar(c.text) })) }));
  fs.writeFileSync(path.join(OUT, "fixacao.json"), JSON.stringify(fixJson, null, 2));
  for (const f of ["card_resumo.json", "visual_briefing.json", "lessons_campos.json"]) if (ler(f)) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
  for (const f of ["fontes.json", "lacunas.md"]) if (ler(f)) fs.copyFileSync(path.join(SRC, f), path.join(OUT, "fontes-internas", f));
  fs.writeFileSync(path.join(OUT, "fontes-internas", "flashcards-fontes.json"), JSON.stringify(fontesFlash, null, 2));
  if (aulaJson.claims || aulaJson.referencias) fs.writeFileSync(path.join(OUT, "fontes-internas", "afirmacoes-e-referencias.json"), JSON.stringify({ claims: aulaJson.claims ?? [], referencias: aulaJson.referencias ?? [] }, null, 2));
  for (const f of ["CHANGELOG.md"]) if (ler(f)) fs.copyFileSync(path.join(SRC, f), path.join(OUT, "fontes-internas", f));
  if (fs.existsSync(path.join(SRC, "auditoria"))) fs.cpSync(path.join(SRC, "auditoria"), path.join(OUT, "fontes-internas", "auditoria"), { recursive: true });

  // revisor médico: o texto da pasta de conteúdo + o que mudou na apresentação
  const revBase = ler("para-o-revisor-medico.md") ?? "";
  fs.writeFileSync(
    path.join(OUT, "para-o-revisor-medico.md"),
    `${revBase.trim()}

## Apresentação v2 (o que mudou só na forma, ${new Date().toISOString().slice(0, 10)})

- **O aluno não vê referência nenhuma**: saíram do texto da aula, do PDF, dos flashcards e das explicações das questões os números entre colchetes, a lista de referências, os trechos citados e as frases do tipo "segundo o Guia…". Nada clínico foi reescrito além dessas expressões.
- **Onde estão as citações agora**: \`fontes-internas/\` (\`fontes.json\` com o trecho literal validado de cada afirmação, \`trechos-citados.md\` com a lista que antes ia no PDF, \`flashcards-fontes.json\` com a fonte e a página de cada flashcard, \`afirmacoes-e-referencias.json\`).
- **Cards e A4**: mantêm só uma linha pequena de fonte no rodapé escuro (como no modelo do dono).
- **Para conferir**: o texto clínico das peças é o mesmo dos comandos em \`comandos/\`; confira se a troca de expressões não mudou o sentido (lista das trocas padrão em \`scripts/aulas/aula-html.mts\`, SUBSTITUICOES_PADRAO).
`
  );
} finally {
  await renderer.close();
}

// ---------------------------------------------------------------------------- manifesto
function pngDims(b: Buffer) {
  return b.subarray(1, 4).toString("latin1") === "PNG" ? { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) } : null;
}
const arquivos: any[] = [];
const walk = (d: string) => {
  for (const f of fs.readdirSync(d).sort()) {
    const full = path.join(d, f);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (f !== "manifesto.json" && f !== ".DS_Store" && !MANUAIS.includes(f)) {
      const b = fs.readFileSync(full);
      const rel = path.relative(OUT, full);
      const item: any = { arquivo: rel, bytes: b.length, sha256: sha(b) };
      const dims = pngDims(b);
      if (dims) Object.assign(item, dims);
      if (f.endsWith(".pdf")) {
        const info = JSON.parse(execFileSync(PY, ["-I", "-c", "import sys,json,pymupdf\nd=pymupdf.open(sys.argv[1])\nprint(json.dumps({'paginas':d.page_count,'pagina_pt':[round(d[0].rect.width,2),round(d[0].rect.height,2)]}))", full]).toString());
        Object.assign(item, info);
      }
      const base = path.basename(f);
      if (altTexts[base]) item.texto_alternativo = altTexts[base];
      arquivos.push(item);
    }
  }
};
walk(OUT);
if (conferencia.texto_do_aluno.length) erros.push(`Texto do aluno ainda com sinal de referência: ${conferencia.texto_do_aluno.map((x: any) => `"${x.sinal}" em ${x.trecho}`).join(" | ")}`);
conferencia.erros = erros;
conferencia.avisos = avisos;
fs.writeFileSync(path.join(OUT, "conferencia-automatica.json"), JSON.stringify(conferencia, null, 2));
fs.writeFileSync(path.join(OUT, "manifesto.json"), JSON.stringify({ aula: CODIGO, gerado_em: conferencia.gerado_em, conteudo: SRC, comando: `npx tsx scripts/aulas/render-aula.mts ${SRC} ${OUT}${ajustesPath ? ` --ajustes ${ajustesPath}` : ""}`, modelo_visual: VISUAL_TEMPLATE_VERSION, arquivos }, null, 2));
console.log(`\n${arquivos.length} arquivos em ${OUT}`);
console.log(`PDF do aluno: ${JSON.stringify(conferencia.pdf_aluno)}`);
for (const a of avisos) console.log(`aviso: ${a}`);
for (const e of erros) console.error(`ERRO: ${e}`);
process.exitCode = conferencia.texto_do_aluno.length ? 3 : erros.length ? 2 : 0;
