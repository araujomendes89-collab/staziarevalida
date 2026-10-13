// Capturas de tela da prévia LOCAL (servidor de prévia na porta 31914, banco local de teste; nada de produção).
//   node scripts/carga-provas/capturas-previa.mjs <pasta-de-saida> [<pagina-previa-correcoes.html>]
// Aluno de teste: treina questões reais já com o texto fiel, tabelas como imagem, figuras novas e a 2026/2 (aviso do gabarito preliminar).
// Equipe de teste: editor e histórico de uma questão corrigida e da 2024/2 Q46 (figura trocada).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { lerJson, manifestoImagens, correcoesDaProva } from "./comum.mjs";

const require = createRequire(path.resolve("node_modules") + "/");
const { chromium } = require("playwright-core");
const OUT = process.argv[2];
const PREVIA = process.argv[3];
const URL = "http://127.0.0.1:31914/novo";
fs.mkdirSync(OUT, { recursive: true });

// termos de busca: as 3 palavras mais longas do enunciado (a busca exige todas)
const enunciado = new Map();
for (const q of lerJson("revalida_2026_2.json")) enunciado.set(q.id, q.statement);
for (const q of manifestoImagens()) if (q.enunciado_depois) enunciado.set(q.id, q.enunciado_depois);
const busca = (id) => {
  let t = enunciado.get(id);
  if (!t) {
    const pasta = id.replace(/_q\d+$/, "");
    const it = correcoesDaProva(pasta).itens.find((i) => i.id === id);
    t = it?.campos.statement?.depois ?? lerJson("questoes-antes.json").questoes.find((q) => q.id === id).statement;
  }
  const palavras = [...new Set(t.split(/[^\p{L}]+/u).filter((w) => w.length >= 8))].sort((a, b) => b.length - a.length);
  return palavras.slice(0, 3).join(" ");
};
const ALVOS = [
  ["texto-fiel_2023-2-q004_kg-m2", "revalida_2023_2_q004", "Revalida 2023/2"],
  ["texto-fiel_2022-1-q010_lixo-ocr", "revalida_2022_1_q010", "Revalida 2022/1"],
  ["texto-fiel_enamed-q055_quatro-alternativas", "enamed_2025_q055", "ENAMED 2025"],
  ["tabela_2023-2-q022", "revalida_2023_2_q022", "Revalida 2023/2"],
  ["tabela_2025-1-q029_duas-tabelas", "revalida_2025_1_q029", "Revalida 2025/1"],
  ["tabela_2026-1-q004", "revalida_2026_1_q004", "Revalida 2026/1"],
  ["figura_2020-q025", "revalida_2020_1_q025", "Revalida 2020"],
  ["figura_2020-q047", "revalida_2020_1_q047", "Revalida 2020"],
  ["figura_2023-2-q079", "revalida_2023_2_q079", "Revalida 2023/2"],
  ["figura_2025-2-q058", "revalida_2025_2_q058", "Revalida 2025/2"],
  ["2026-2-q001_gabarito-preliminar", "revalida_2026_2_q001", "Revalida 2026/2"],
  ["2026-2-q029_figura-e-gabarito-preliminar", "revalida_2026_2_q029", "Revalida 2026/2"],
  ["2026-2-q037_figura-tabela-e-gabarito-preliminar", "revalida_2026_2_q037", "Revalida 2026/2"],
  ["2026-2-q074_area-decidida-pelo-dono", "revalida_2026_2_q074", "Revalida 2026/2"],
];
// 2026/2: marca uma alternativa ERRADA (para a questão cair no caderno de erros e mostrar o selo lá também)
const gabarito262 = new Map(lerJson("revalida_2026_2.json").map((q) => [q.id, q.correct_option]));

const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const rel = [];
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: "networkidle" });
  await p.getByLabel("E-mail").fill("aluno.teste@previa.local");
  await p.getByLabel("Senha", { exact: true }).fill("Previa-Aluno-2026!");
  await p.getByRole("button", { name: /^ENTRAR$/i }).click();
  await p.waitForTimeout(3500);
  for (const [nome, id, prova] of ALVOS) {
    const termos = busca(id);
    await p.goto(URL, { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    await p.getByText("Questões", { exact: true }).first().click();
    await p.waitForTimeout(1200);
    await p.getByPlaceholder(/asma/).fill(termos);
    await p.getByLabel("Prova / edição").selectOption({ label: prova });
    await p.getByLabel("Status").selectOption("all"); // inclui as já respondidas (a prévia pode rodar mais de uma vez)
    await p.waitForTimeout(1500);
    const btn = p.getByRole("button", { name: /Começar treino/ });
    if (!(await btn.isEnabled().catch(() => false))) {
      rel.push({ nome, id, termos, erro: "sem questão com esses filtros" });
      await p.screenshot({ path: `${OUT}/aluno_${nome}_SEM-QUESTAO.png` });
      continue;
    }
    await btn.click();
    await p.waitForTimeout(3000);
    const ref = (await p.innerText("main").catch(() => "")).slice(0, 120).replace(/\n+/g, " ");
    const figs = p.locator("figure img");
    const nfig = await figs.count();
    const imgs = [];
    for (let i = 0; i < nfig; i++) imgs.push(await figs.nth(i).evaluate((x) => ({ ok: x.complete && x.naturalWidth > 0, alt: x.alt.slice(0, 60) })));
    await p.screenshot({ path: `${OUT}/aluno_${nome}_1-questao.png`, fullPage: true });
    const certa = gabarito262.get(id);
    await p.getByRole("radio").nth(certa ? (["A", "B", "C", "D"].indexOf(certa) === 0 ? 1 : 0) : 0).click();
    await p.getByRole("button", { name: "Confirmar" }).click();
    await p.waitForTimeout(2500);
    const corpo = await p.innerText("body");
    const aviso = corpo.includes("GABARITO PRELIMINAR") && corpo.includes("O gabarito definitivo só será divulgado pelo Inep em 04/12/2026.");
    await p.screenshot({ path: `${OUT}/aluno_${nome}_2-correcao.png`, fullPage: true });
    let noResultado = null;
    if (certa) {
      await p.getByRole("button", { name: /Concluir/ }).click();
      await p.waitForTimeout(2500);
      await p.getByRole("button", { name: /GABARITO PRELIMINAR|Revalida 2026\/2/ }).first().click().catch(() => {});
      await p.waitForTimeout(1200);
      noResultado = (await p.innerText("body")).includes("GABARITO PRELIMINAR");
      await p.screenshot({ path: `${OUT}/aluno_${nome}_3-resultado-da-sessao.png`, fullPage: true });
    }
    rel.push({ nome, id, termos, cabecalho: ref, imagens: imgs, aviso_gabarito_preliminar: aviso, selo_no_resultado: noResultado });
    console.log(nome, "| imagens:", imgs.length, imgs.every((i) => i.ok) ? "carregadas" : "COM FALHA", "| selo/frase:", aviso, "| no resultado:", noResultado);
  }
  // caderno de erros: a lista com o selo e uma questão da 2026/2 aberta
  await p.goto(URL, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.getByText("Caderno de erros", { exact: true }).first().click();
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/aluno_caderno-de-erros_1-lista.png`, fullPage: true });
  await p.getByRole("button", { name: /Revalida 2026\/2/ }).first().click().catch(() => {});
  await p.waitForTimeout(2500);
  const noCaderno = (await p.innerText("body")).includes("O gabarito definitivo só será divulgado pelo Inep em 04/12/2026.");
  await p.screenshot({ path: `${OUT}/aluno_caderno-de-erros_2-questao-2026-2.png`, fullPage: true });
  rel.push({ nome: "caderno-de-erros", selo_e_frase: noCaderno });
  console.log("caderno de erros | selo e frase:", noCaderno);
  // equipe
  const e = await (await b.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
  await e.goto(URL, { waitUntil: "networkidle" });
  await e.getByLabel("E-mail").fill("equipe.teste@previa.local");
  await e.getByLabel("Senha", { exact: true }).fill("Previa-Equipe-2026!");
  await e.getByRole("button", { name: /^ENTRAR$/i }).click();
  await e.waitForTimeout(3500);
  for (const [nome, codigo] of [["2023-2-q022_tabela", "REV-2023.2-Q022"], ["2024-2-q046_figura-trocada", "REV-2024.2-Q046"], ["2026-2-q037", "REV-2026.2-Q037"]]) {
    await e.goto(URL, { waitUntil: "networkidle" });
    await e.getByText("Administração", { exact: true }).first().click();
    await e.waitForTimeout(1500);
    await e.getByRole("tab", { name: "Questões" }).first().click().catch(() => e.getByText("Questões", { exact: true }).nth(1).click());
    await e.waitForTimeout(1500);
    await e.getByPlaceholder(/Código, tema/).fill(codigo);
    await e.waitForTimeout(2000);
    await e.getByRole("button", { name: `Editar ${codigo}` }).click().catch(() => e.getByText(codigo).first().click());
    await e.waitForTimeout(2500);
    await e.screenshot({ path: `${OUT}/equipe_${nome}_editor.png`, fullPage: true });
    const hist = e.locator('section[aria-label="Histórico de mudanças"]');
    let htxt = null;
    if (await hist.count()) {
      await hist.scrollIntoViewIfNeeded();
      await hist.getByRole("button").first().click().catch(() => {});
      await e.waitForTimeout(2000);
      htxt = (await hist.innerText()).replace(/\n+/g, " | ").slice(0, 500);
      await hist.screenshot({ path: `${OUT}/equipe_${nome}_historico.png` });
    }
    rel.push({ nome, codigo, historico: htxt });
    console.log(nome, "| histórico:", (htxt ?? "—").slice(0, 160));
  }
  // a página de prévia antes x depois
  if (PREVIA) {
    const v = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
    await v.goto(pathToFileURL(PREVIA).href);
    await v.waitForTimeout(1500);
    await v.screenshot({ path: `${OUT}/previa-correcoes_topo.png` });
    await v.locator("#revalida_2022_1 details").first().evaluate((d) => (d.open = true));
    await v.locator("#revalida_2022_1").scrollIntoViewIfNeeded();
    await v.waitForTimeout(800);
    await v.screenshot({ path: `${OUT}/previa-correcoes_2022-1-lixo-ocr.png` });
    await v.locator("#imagens").scrollIntoViewIfNeeded();
    await v.waitForTimeout(2000);
    await v.screenshot({ path: `${OUT}/previa-correcoes_tabelas.png` });
  }
} finally {
  fs.writeFileSync(`${OUT}/resultado.json`, JSON.stringify(rel, null, 1));
  await b.close();
}
