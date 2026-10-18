// Capturas e medidas do editor profissional no CELULAR nas telas de verdade da Administração (prévia com banco simulado).
// Precisa do servidor:  npx vite --config scripts/previa-editor-celular/vite.config.mjs   (porta 31996)
// Uso: node scripts/previa-editor-celular/capturas.mjs antes|depois [pasta]
//   Mede em 375 e 390 px: a página não fica mais larga que a tela e nenhum botão da barra sai da caixa do editor (fora de uma
//   faixa que rola dentro dela). Em "depois", também: botões da barra curta com 44 px, "Mais" abre e fecha (botão, Esc e toque
//   fora) e um comando de dentro do "Mais" funciona. Sai com erro se algo falhar. Fotos só a 390 px.
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:31996";
const FASE = process.argv[2] || "depois";
const PASTA = process.argv[3] || "/Volumes/StaziaMed/.tmp-aulas/editor-celular";
fs.mkdirSync(PASTA, { recursive: true });
const TELAS = ["questoes", "aulas", "comunicados", "atualizacoes", "podcasts"];
const problemas = [];
const medidas = [];

async function abrir(page, tela) {
  await page.goto(`${BASE}/?tela=${tela}`);
  if (tela === "aulas") {
    await page.getByRole("button", { name: "Editar", exact: true }).click({ timeout: 120000 });
    await page.getByRole("button", { name: "Editor completo" }).click();
  }
  if (tela === "atualizacoes") await page.getByRole("button", { name: "Nova atualização" }).click({ timeout: 120000 });
  const campo = page.locator(".ProseMirror").first();
  await campo.waitFor({ timeout: 120000 });
  await campo.scrollIntoViewIfNeeded();
  await campo.click();
  await page.waitForTimeout(500);
  return page.locator(".ep-container").filter({ has: campo }).first();
}

// botões e seletores da barra que saem da caixa do editor (os que estão numa faixa que rola dentro dela não contam)
const medir = (caixa) =>
  caixa.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const visiveis = [...el.querySelectorAll(".ep-rapida button, .ep-toolbar button, .ep-toolbar select")].filter((b) => b.getBoundingClientRect().width > 0);
    const fora = visiveis.filter((b) => {
      const x = b.getBoundingClientRect();
      for (let p = b.parentElement; p && p !== el; p = p.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) return false;
      return x.right > r.right + 1 || x.left < r.left - 1;
    });
    const faixas = [...el.querySelectorAll(".ep-rapida, .ep-toolbar, .ep-tablist, .ep-tools")].filter((f) => f.getBoundingClientRect().width > 0);
    const faixaLarga = faixas.filter((f) => f.getBoundingClientRect().right > window.innerWidth + 1).length;
    const pequenos = [...el.querySelectorAll(".ep-rapida button")].filter((b) => {
      const x = b.getBoundingClientRect();
      return x.width > 0 && (x.width < 44 || x.height < 44);
    }).length;
    return {
      paginaLarga: document.documentElement.scrollWidth > window.innerWidth,
      larguraTela: window.innerWidth,
      larguraEditor: Math.round(r.width),
      botoesForaDaCaixa: fora.length,
      faixaMaisLargaQueATela: faixaLarga,
      botoesCurtosMenoresQue44: pequenos,
      barraCurtaRola: (() => {
        const f = el.querySelector(".ep-rapida");
        return f ? f.scrollWidth > f.clientWidth + 1 : false;
      })(),
      barraCurta: [...el.querySelectorAll(".ep-rapida button")].map((b) => b.getAttribute("aria-label")),
    };
  });

const browser = await chromium.launch();
for (const largura of [375, 390]) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", locale: "pt-BR" });
  for (const tela of TELAS) {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => problemas.push(`[${largura} ${tela}] erro na página: ${e.message}`));
    const caixa = await abrir(page, tela);
    const m = await medir(caixa);
    medidas.push({ largura, tela, ...m });
    const ruim = (mm, onde) => {
      if (mm.paginaLarga) problemas.push(`[${largura} ${onde}] a página ficou mais larga que a tela`);
      if (mm.botoesForaDaCaixa) problemas.push(`[${largura} ${onde}] ${mm.botoesForaDaCaixa} botões fora da caixa do editor`);
      if (mm.faixaMaisLargaQueATela) problemas.push(`[${largura} ${onde}] barra mais larga que a tela`);
    };
    if (FASE === "depois") ruim(m, tela);
    if (largura === 390) {
      await caixa.evaluate((el) => (el.scrollIntoView({ block: "start" }), window.scrollBy(0, -12)));
      await page.screenshot({ path: path.join(PASTA, `390-${FASE}-${tela}.png`) });
    }
    if (FASE === "depois") {
      if (m.barraCurtaRola) problemas.push(`[${largura} ${tela}] a barra curta não coube inteira (precisou rolar)`);
      if (m.botoesCurtosMenoresQue44) problemas.push(`[${largura} ${tela}] botões da barra curta menores que 44 px`);
      const mais = caixa.getByRole("button", { name: "Mais" });
      const painel = caixa.getByRole("group", { name: "Mais ferramentas" });
      // abre e fecha no próprio botão
      await mais.click();
      if ((await mais.getAttribute("aria-expanded")) !== "true" || !(await painel.isVisible())) problemas.push(`[${largura} ${tela}] Mais não abriu`);
      const mm = await medir(caixa);
      medidas.push({ largura, tela: `${tela} (Mais aberto)`, ...mm, barraCurta: undefined });
      ruim(mm, `${tela} Mais aberto`);
      if (largura === 390) {
        await caixa.evaluate((el) => (el.scrollIntoView({ block: "start" }), window.scrollBy(0, -12)));
        await page.screenshot({ path: path.join(PASTA, `390-${FASE}-${tela}-mais.png`) });
      }
      // um comando de dentro do Mais funciona (desfazer: digita, desfaz, o texto volta)
      const campo = caixa.locator(".ProseMirror");
      const antes = await campo.innerText();
      await campo.click();
      await page.keyboard.press("End");
      await page.keyboard.type(" XYZ");
      // tocar no texto fechou o Mais (tocar fora); abre de novo para usar o Desfazer de dentro dele
      if (await painel.isVisible()) problemas.push(`[${largura} ${tela}] Mais não fechou ao tocar no texto`);
      await mais.click();
      await caixa.getByRole("button", { name: "Desfazer (Ctrl+Z)" }).click();
      if ((await campo.innerText()) !== antes) problemas.push(`[${largura} ${tela}] Desfazer (dentro do Mais) não funcionou`);
      if (tela !== "podcasts") {
        // Título 2 (dentro do Mais) vira título no texto
        await campo.click();
        if (!(await painel.isVisible())) await mais.click();
        await caixa.getByRole("button", { name: "Título 2" }).click();
        if (!(await campo.locator("h3").count())) problemas.push(`[${largura} ${tela}] Título 2 (dentro do Mais) não funcionou`);
        await caixa.getByRole("button", { name: "Título 2" }).click();
      }
      // fecha no botão
      if (!(await painel.isVisible())) await mais.click();
      await mais.click();
      if (await painel.isVisible()) problemas.push(`[${largura} ${tela}] Mais não fechou no botão`);
      // fecha com Esc
      await mais.click();
      await caixa.getByRole("tab").first().focus();
      await page.keyboard.press("Escape");
      if (await painel.isVisible()) problemas.push(`[${largura} ${tela}] Mais não fechou com Esc`);
      // fecha ao tocar fora (no texto)
      await mais.click();
      await campo.click();
      if (await painel.isVisible()) problemas.push(`[${largura} ${tela}] Mais não fechou ao tocar fora`);
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(PASTA, `medidas-${FASE}.json`), JSON.stringify(medidas, null, 2));
console.log(JSON.stringify(medidas.map(({ barraCurta, ...m }) => m)));
if (problemas.length) {
  console.error("PROBLEMAS:\n" + problemas.join("\n"));
  process.exit(1);
}
console.log(`ok (${FASE})`);
