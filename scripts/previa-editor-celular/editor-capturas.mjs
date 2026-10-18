// Capturas do editor profissional a 390 px nas telas da Administração (antes/depois do ajuste da barra no celular).
// Precisa de um servidor Vite que entregue scripts/previa-editor-celular/editor-celular.html em /previa/editor (no ramo comunicados-editor isso estava em scripts/previa-comunicados-editor/servidor.ts, commit 1278fcda + rota /previa/editor). Uso: node .../editor-capturas.mjs antes|depois
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:31994";
const FASE = process.argv[2] || "depois";
const PASTA = "/Volumes/StaziaMed/.tmp-aulas/comunicados-editor/editor-celular";
fs.mkdirSync(PASTA, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "pt-BR" });
const medidas = [];
for (const tela of ["questoes", "atualizacoes", "comunicados", "podcasts", "aulas"]) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/previa/editor?tela=${tela}`);
  await page.locator(".ProseMirror").first().waitFor({ timeout: 120000 });
  await page.locator(".ProseMirror").first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => {
    const el = document.querySelector(".ep-container");
    const r = el.getBoundingClientRect();
    const fora = [...el.querySelectorAll("button, select")].filter((b) => {
      const x = b.getBoundingClientRect();
      if (!x.width) return false;
      let p = b.parentElement;
      while (p && p !== el) {
        const st = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(st.overflowX)) return false; // dentro de uma barra que rola: não estoura
        p = p.parentElement;
      }
      return x.right > r.right + 1 || x.left < r.left - 1;
    }).length;
    return { paginaLarga: document.documentElement.scrollWidth > window.innerWidth, botoesForaDaCaixa: fora, larguraEditor: Math.round(r.width) };
  });
  medidas.push({ tela, ...m });
  await page.screenshot({ path: path.join(PASTA, `390-${FASE}-${tela}.png`) });
  const mais = page.getByRole("button", { name: "Mais" });
  if (FASE === "depois" && (await mais.count())) {
    await mais.click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const largo = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    medidas.push({ tela: `${tela} (Mais aberto)`, paginaLarga: largo });
    await page.screenshot({ path: path.join(PASTA, `390-${FASE}-${tela}-mais.png`) });
  }
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(PASTA, `medidas-${FASE}.json`), JSON.stringify(medidas, null, 2));
console.log(JSON.stringify(medidas));
