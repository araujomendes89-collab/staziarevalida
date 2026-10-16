// Fotografa as telas novas (Chromium/Playwright) com os dados reais do banco de teste: claro e escuro, computador e celular.
import { chromium } from "playwright";
import fs from "node:fs"; import path from "node:path";
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const URL = "http://127.0.0.1:5391/";
const navegador = await chromium.launch();
const TELAS = [
  { id: "1-lista", nome: "Lista de unidades", tela: "lista", acao: async () => {}, alvo: (p) => p.locator("#root > div > div") },
  { id: "2-topo", nome: "Cabeçalho, Caminho até publicar e Materiais da unidade", acao: async () => {}, topo: true },
  { id: "3-ficha", nome: "Ficha do revisor médico", acao: async () => {}, alvo: (p) => p.getByLabel("Ficha do revisor médico") },
  { id: "4-resumo-aprovacao", nome: "Resumo antes de aprovar (aprovação médica)", acao: async (p) => { await p.getByRole("button", { name: /Aprovar \(revisão médica\)/ }).click(); await p.getByLabel("Resumo do que você vai aprovar").waitFor(); }, alvo: (p) => p.getByLabel("Resumo do que você vai aprovar") },
  { id: "5-previa-aluno", nome: "Pré-visualizar como aluno", acao: async (p) => { await p.getByLabel("Materiais da unidade").getByRole("button", { name: /Pré-visualizar como aluno/ }).first().click(); await p.getByRole("dialog").waitFor(); await p.waitForTimeout(1500); }, janela: true },
  { id: "5b-previa-aluno-video", nome: "Pré-visualizar como aluno: o vídeo na posição escolhida", acao: async (p) => { await p.getByLabel("Materiais da unidade").getByRole("button", { name: /Pré-visualizar como aluno/ }).first().click(); await p.getByRole("dialog").waitFor(); await p.waitForTimeout(800); await p.evaluate(() => document.querySelector("[data-media]").scrollIntoView({ block: "center" })); await p.waitForTimeout(1500); }, janela: true },
  { id: "5c-previa-aluno-revisao", nome: "Pré-visualizar como aluno: Revisão da Aula (imagem dentro da página, sem download)", acao: async (p) => { await p.getByLabel("Materiais da unidade").getByRole("button", { name: /Pré-visualizar como aluno/ }).first().click(); await p.getByRole("dialog").waitFor(); await p.waitForTimeout(800); await p.evaluate(() => document.querySelector("#revisao-da-aula").scrollIntoView({ block: "start" })); await p.waitForTimeout(1500); }, janela: true },
  { id: "6-inserir", nome: "Inserir material (vídeo/áudio por link, arquivo como etapa futura)", acao: async (p) => { await p.getByLabel("Materiais da unidade").getByRole("button", { name: /^Inserir$/ }).click(); await p.getByRole("dialog").waitFor(); }, janela: true },
  { id: "7-arquivo-equipe", nome: "Material só da equipe (card de feed)", acao: async (p) => { await p.locator("[data-kind=card_feed]").getByRole("button", { name: /Pré-visualizar/ }).click(); await p.getByRole("dialog").waitFor(); await p.waitForTimeout(800); }, janela: true },
  { id: "8-retirar", nome: "Retirar material (pede o motivo; nada é apagado)", acao: async (p) => { await p.locator("[data-kind=card_feed]").getByRole("button", { name: /Retirar/ }).click(); await p.getByRole("dialog").waitFor(); }, janela: true },
];
const feitos = [];
for (const tema of ["light", "dark"]) for (const [disp, vp, scale] of [["computador", { width: 1280, height: 900 }, 1], ["celular", { width: 390, height: 844 }, 2]]) {
  for (const t of TELAS) {
    const ctx = await navegador.newContext({ viewport: vp, deviceScaleFactor: scale, colorScheme: tema });
    const page = await ctx.newPage();
    await page.goto(`${URL}?tema=${tema}&papel=admin${t.tela ? "&tela=" + t.tela : ""}`);
    await page.waitForSelector(t.tela === "lista" ? "text=GR-001" : '[aria-label="Caminho até publicar"]');
    await page.waitForSelector(t.tela === "lista" ? "text=afirmações" : '[aria-label="Materiais da unidade"] li');
    await page.waitForTimeout(500);
    await t.acao(page);
    const arq = `${t.id}-${tema === "light" ? "claro" : "escuro"}-${disp}.png`;
    if (t.topo) await page.screenshot({ path: path.join(OUT, arq), fullPage: true, clip: { x: 0, y: 0, width: vp.width, height: disp === "computador" ? 1000 : 2900 } });
    else if (t.janela || t.id === "1-lista") await page.screenshot({ path: path.join(OUT, arq), fullPage: false });
    else await t.alvo(page).first().screenshot({ path: path.join(OUT, arq) });
    feitos.push({ arq, t: t.nome, tema, disp });
    await ctx.close();
  }
}
fs.writeFileSync(path.join(OUT, "lista.json"), JSON.stringify(feitos, null, 1));
await navegador.close();
console.log(feitos.length, "capturas em", OUT);
