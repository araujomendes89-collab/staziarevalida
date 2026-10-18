// Mede as tabelas dos documentos jurídicos no celular (pedido do dono, 18/10/2026): dentro da janela, nada pode passar da largura
// da tela (scrollWidth ≤ innerWidth, sem arrastar para o lado). A 375 e 390 px, claro e escuro: Contrato e Política abertos pelo
// cadastro e o Contrato aberto por Minha Conta → Documentos ("Ver"). Também confere que no computador (1440 px) continua tabela.
// Precisa da prévia rodando (npx vite --config scripts/previa-criar-conta/vite.config.mjs).
// Uso: node scripts/previa-criar-conta/medir-tabelas.mjs [endereco] [pasta-das-capturas]   → sai com erro se algo não couber.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [base = "http://127.0.0.1:31958/", pasta] = process.argv.slice(2);
if (pasta) fs.mkdirSync(pasta, { recursive: true });
const browser = await chromium.launch();
const resultado = [];

async function abrir(largura, tema, tela) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: tema, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.goto(`${base}?tela=${tela}&tema=${tema}`, { waitUntil: "networkidle" });
  return { ctx, p };
}

async function medir(p, corpo, rotulo, arquivo) {
  await p.locator(`${corpo} .lgl-tabela`).first().waitFor();
  await p.evaluate(() => document.fonts.ready);
  const m = await p.evaluate((sel) => {
    const c = document.querySelector(sel);
    const tabs = [...c.querySelectorAll(".lgl-tabela")];
    return {
      innerWidth: window.innerWidth,
      pagina: document.documentElement.scrollWidth,
      janela: c.scrollWidth,
      janelaVisivel: c.clientWidth,
      piorTabela: Math.max(0, ...tabs.map((t) => t.scrollWidth - t.clientWidth)),
      tabelas: tabs.length,
    };
  }, corpo);
  const ok = m.pagina <= m.innerWidth && m.janela <= m.janelaVisivel && m.piorTabela === 0;
  resultado.push({ rotulo, ok, ...m });
  if (pasta && arquivo) {
    await p.locator(`${corpo} .lgl-tabela`).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
    await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(pasta, arquivo) });
  }
}

for (const tema of ["light", "dark"]) {
  const nomeTema = tema === "dark" ? "escuro" : "claro";
  for (const largura of [375, 390]) {
    {
      const { ctx, p } = await abrir(largura, tema, "cadastro");
      await p.locator("#secure-accept").waitFor();
      await p.locator(".cc-consent").getByRole("button").first().click();
      await medir(p, ".lgm-body", `cadastro → Termos ${largura} ${nomeTema}`, `medida-cadastro-termos-${largura}-${nomeTema}.png`);
      await p.getByRole("button", { name: "Fechar" }).click();
      await p.locator(".cc-consent").getByRole("button", { name: "Política de Privacidade" }).click();
      await medir(p, ".lgm-body", `cadastro → Política ${largura} ${nomeTema}`, `medida-cadastro-politica-${largura}-${nomeTema}.png`);
      await ctx.close();
    }
    {
      const { ctx, p } = await abrir(largura, tema, "documentos");
      await p.getByRole("button", { name: "Ver" }).first().click();
      await medir(p, ".acd-body", `Documentos → Contrato ${largura} ${nomeTema}`, `medida-documentos-contrato-${largura}-${nomeTema}.png`);
      await ctx.close();
    }
  }
}
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${base}?tela=cadastro&tema=light`, { waitUntil: "networkidle" });
  await p.locator("#secure-accept").waitFor();
  await p.locator(".cc-consent").getByRole("button").first().click();
  await p.locator(".lgm-body .lgl-tabela").first().waitFor();
  const display = await p.locator(".lgm-body .lgl-tabela table").first().evaluate((t) => getComputedStyle(t).display);
  resultado.push({ rotulo: "computador 1440: continua tabela", ok: display === "table", display });
  await ctx.close();
}
await browser.close();
for (const r of resultado) console.log(`${r.ok ? "ok  " : "FALHA"} ${r.rotulo} ${JSON.stringify(r)}`);
if (resultado.some((r) => !r.ok)) process.exit(1);
