// Foto do editor no COMPUTADOR (1440 px) nas mesmas telas, para conferir que a barra continua igual (antes x depois).
// Uso: node scripts/previa-editor-celular/computador.mjs antes|depois [pasta]   (servidor da prévia na porta 31996)
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:31996";
const FASE = process.argv[2] || "depois";
const PASTA = process.argv[3] || "/Volumes/StaziaMed/.tmp-aulas/editor-celular";
fs.mkdirSync(PASTA, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", locale: "pt-BR" });
for (const tela of ["questoes", "aulas", "comunicados", "atualizacoes", "podcasts"]) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?tela=${tela}`);
  if (tela === "aulas") {
    await page.getByRole("button", { name: "Editar", exact: true }).click({ timeout: 120000 });
    await page.getByRole("button", { name: "Editor completo" }).click();
  }
  if (tela === "atualizacoes") await page.getByRole("button", { name: "Nova atualização" }).click({ timeout: 120000 });
  const campo = page.locator(".ProseMirror").first();
  await campo.waitFor({ timeout: 120000 });
  await campo.click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(600);
  const caixa = page.locator(".ep-container").filter({ has: campo }).first();
  await caixa.locator(".ep-toolbar").screenshot({ path: path.join(PASTA, `1440-${FASE}-${tela}-barra.png`), animations: "disabled", caret: "hide" });
  await page.close();
}
await browser.close();
console.log(`ok (${FASE})`);
