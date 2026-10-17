// Capturas da prévia da tela Criar conta (celular 390×844 e computador 1440×900, claro e escuro), uma por estado.
// Uso: node scripts/previa-criar-conta/capturar.mjs <pasta-de-saida> [prefixo] [endereco]
//   ex.: node scripts/previa-criar-conta/capturar.mjs /Volumes/StaziaMed/.tmp-aulas/criar-conta depois
// A prévia precisa estar rodando (npx vite --config scripts/previa-criar-conta/vite.config.mjs).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [out = "/Volumes/StaziaMed/.tmp-aulas/criar-conta", prefixo = "depois", base = "http://127.0.0.1:31958/"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

const TELAS = {
  celular: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  computador: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const FRASE = "Declaro que li e compreendi os Termos de Aceite e Uso e a Política de Privacidade do StaziaMed Revalida e concordo com suas condições.";

const clicar = (p, nome) => p.getByRole("button", { name: nome, exact: true }).click();
const escrever = (p, rotulo, valor) => p.getByLabel(rotulo, { exact: true }).fill(valor);
// o WhatsApp saiu do cadastro em 17/10/2026; nas capturas de "antes" ele ainda existe
const whatsapp = async (p, valor) => { if (await p.getByLabel("WhatsApp", { exact: true }).count()) await escrever(p, "WhatsApp", valor); };

async function preencher(p, email = "ana.lima@exemplo.com") {
  await escrever(p, "Nome completo", "Ana Lima");
  await escrever(p, "E-mail", email);
  await whatsapp(p, "(41) 99999-8888");
  await escrever(p, "Senha", "senha-segura");
  await escrever(p, "Conferir senha", "senha-segura");
  await p.getByLabel(FRASE, { exact: true }).check();
  for (const c of await p.locator("#secure-adulto, #secure-medico").all()) await c.check();
}

// [nome do arquivo, passos]
const ESTADOS = [
  ["1-vazio", async (p) => p.getByLabel("Nome completo", { exact: true }).waitFor()],
  ["2-preenchido", async (p) => preencher(p)],
  ["3-erros-nos-campos", async (p) => {
    await escrever(p, "E-mail", "ana.lima@");
    await whatsapp(p, "999998888");
    await escrever(p, "Senha", "senha-segura");
    await escrever(p, "Conferir senha", "outra-senha");
    await clicar(p, "CRIAR CONTA");
    await p.getByText("As senhas não são iguais.").waitFor();
    await p.evaluate(() => window.scrollTo(0, 0));
  }],
  ["4-enviando", async (p) => { await preencher(p, "ana.lento@exemplo.com"); await clicar(p, "CRIAR CONTA"); await p.getByText("CRIANDO CONTA…").waitFor(); }],
  ["5-email-ja-existe", async (p) => {
    await preencher(p, "ana.existe@exemplo.com");
    await clicar(p, "CRIAR CONTA");
    await p.getByText("Já existe uma conta com este e-mail.").waitFor();
    await p.evaluate(() => window.scrollTo(0, 0));
  }],
  ["6-depois-confirme-seu-email", async (p) => { await preencher(p); await clicar(p, "CRIAR CONTA"); await p.getByRole("heading", { name: "Confirme seu e-mail" }).waitFor(); }],
];

const browser = await chromium.launch();
const feitos = [];
for (const [tela, opcoes] of Object.entries(TELAS)) {
  for (const tema of ["light", "dark"]) {
    const ctx = await browser.newContext({ ...opcoes, colorScheme: tema, reducedMotion: "reduce" });
    for (const [nome, passos] of ESTADOS) {
      const page = await ctx.newPage();
      await page.goto(`${base}?tela=cadastro&tema=${tema}`, { waitUntil: "networkidle" });
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
await browser.close();
console.log(`${feitos.length} capturas em ${out}`);
