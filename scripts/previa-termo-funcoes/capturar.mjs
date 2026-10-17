// Capturas da prévia do ramo termo-funcoes (celular 390×844 e computador 1440×900, claro e escuro) e dos e-mails.
// Uso: node scripts/previa-termo-funcoes/capturar.mjs <pasta> <prefixo> [endereco] [so-antes]
// A prévia precisa estar rodando (npx vite --config scripts/previa-termo-funcoes/vite.config.mjs).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [out = "/Volumes/StaziaMed/.tmp-aulas/termo-funcoes/capturas", prefixo = "depois", base = "http://127.0.0.1:31977/", modo = ""] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const antes = modo === "antes";

const TELAS = {
  celular: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  computador: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const escrever = (p, rotulo, valor) => p.getByLabel(rotulo, { exact: true }).fill(valor);
/** "antes" não tem o ?secao=: abre a seção pelo botão (no celular, a linha da lista) */
async function abrirSecao(p, nome, texto) {
  await p.getByRole("button", { name: nome }).first().waitFor();
  if (await p.getByText(texto).first().isVisible().catch(() => false)) return;
  await p.getByRole("button", { name: nome }).first().click();
  await p.getByText(texto).first().waitFor();
}
const ESTADOS = [
  ["cadastro-1-vazio", "?tela=cadastro", async (p) => p.getByLabel("Nome completo", { exact: true }).waitFor()],
  ["cadastro-2-senha-curta-ao-sair", "?tela=cadastro", async (p) => {
    await escrever(p, "Nome completo", "Ana Lima");
    await escrever(p, "E-mail", "ana.lima@exemplo.com");
    await escrever(p, "Senha", "abc12");
    await p.getByLabel("Conferir senha", { exact: true }).focus();
    await p.waitForTimeout(200);
  }],
  ["cadastro-3-senhas-diferentes-digitando", "?tela=cadastro", async (p) => {
    await escrever(p, "Nome completo", "Ana Lima");
    await escrever(p, "E-mail", "ana.lima@exemplo.com");
    await escrever(p, "Senha", "senha-segura");
    await p.getByLabel("Conferir senha", { exact: true }).focus();
    await p.keyboard.type("senha-segurx", { delay: 10 });
    await p.waitForTimeout(200);
  }],
  ["cadastro-4-preenchido-com-marketing", "?tela=cadastro", async (p) => {
    await escrever(p, "Nome completo", "Ana Lima");
    await escrever(p, "E-mail", "ana.lima@exemplo.com");
    await escrever(p, "Senha", "senha-segura");
    await escrever(p, "Conferir senha", "senha-segura");
    await p.locator("#secure-accept").check();
    if (await p.locator("#secure-marketing").count()) await p.locator("#secure-marketing").check();
  }],
  ["conta-1-privacidade-e-dados", "?tela=conta&secao=priv", async (p) => {
    await p.getByText("Privacidade e dados", { exact: false }).first().waitFor();
    if (antes) await abrirSecao(p, /Privacidade e dados/, "Baixar meus dados");
    if (!antes) await p.getByRole("switch").waitFor();
    await p.waitForTimeout(400);
  }],
  ["conta-2-ajuda-e-suporte", "?tela=conta&secao=ajuda", async (p) => {
    if (antes) await abrirSecao(p, /Ajuda e suporte/, "E-mail de suporte");
    await p.getByText("E-mail de suporte").waitFor();
  }],
  ["conta-3-documentos-pelo-link-do-email", "?tela=conta&secao=docs", async (p) => {
    if (!antes) await p.getByText("Aceite mais recente").waitFor();
    else await p.waitForTimeout(800);
  }],
];

const browser = await chromium.launch();
const feitos = [];
for (const [tela, opcoes] of Object.entries(TELAS)) {
  for (const tema of ["light", "dark"]) {
    const ctx = await browser.newContext({ ...opcoes, colorScheme: tema, reducedMotion: "reduce" });
    for (const [nome, q, passos] of ESTADOS) {
      if (antes && !["cadastro-1-vazio", "cadastro-3-senhas-diferentes-digitando", "conta-1-privacidade-e-dados", "conta-2-ajuda-e-suporte"].includes(nome)) continue;
      const page = await ctx.newPage();
      await page.goto(`${base}${q}&tema=${tema}`, { waitUntil: "networkidle" });
      await passos(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      const arquivo = path.join(out, `${prefixo}-${tela}-${tema === "dark" ? "escuro" : "claro"}-${nome}.png`);
      await page.screenshot({ path: arquivo, fullPage: true });
      feitos.push(path.basename(arquivo));
      await page.close();
    }
    await ctx.close();
  }
}
// e-mails (só "depois"; gerados por emails.ts na pasta irmã "emails")
const pastaEmails = path.join(path.dirname(out), "emails");
if (!antes && fs.existsSync(pastaEmails)) {
  for (const [tela, opcoes] of Object.entries(TELAS)) {
    const ctx = await browser.newContext({ ...opcoes });
    for (const f of fs.readdirSync(pastaEmails).filter((x) => x.endsWith(".html"))) {
      const page = await ctx.newPage();
      await page.goto(`file://${path.join(pastaEmails, f)}`, { waitUntil: "load" });
      await page.waitForTimeout(500);
      const arquivo = path.join(out, `${prefixo}-${tela}-${f.replace(/\.html$/, "")}.png`);
      await page.screenshot({ path: arquivo, fullPage: true });
      feitos.push(path.basename(arquivo));
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`${feitos.length} capturas em ${out}`);
