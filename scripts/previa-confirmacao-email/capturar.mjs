// Capturas da prévia (celular 390 e computador 1440, claro; algumas no escuro), uma por estado da confirmação do e-mail.
// Uso: node scripts/previa-confirmacao-email/capturar.mjs <pasta-de-saida> [prefixo] [endereco]
// A prévia precisa estar rodando (npx vite --config scripts/previa-confirmacao-email/vite.config.mjs).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [out = "/Volumes/StaziaMed/.tmp-aulas/confirmacao-email", prefixo = "depois", base = "http://127.0.0.1:31957/"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

const TELAS = {
  celular: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  computador: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const FRASE = "Declaro que li e compreendi os Termos de Aceite e Uso e a Política de Privacidade do StaziaMed Revalida e concordo com suas condições.";

const clicar = (p, nome) => p.getByRole("button", { name: nome, exact: true }).click();
const escrever = (p, rotulo, valor) => p.getByLabel(rotulo, { exact: true }).fill(valor);

async function cadastrar(p, email = "ana.lima@exemplo.com") {
  await escrever(p, "Nome completo", "Ana Lima");
  await escrever(p, "E-mail", email);
  await escrever(p, "WhatsApp", "(41) 99999-8888");
  await escrever(p, "Senha", "senha-segura");
  await escrever(p, "Conferir senha", "senha-segura");
  await p.getByLabel(FRASE, { exact: true }).check();
  for (const c of await p.locator("#secure-adulto, #secure-medico").all()) await c.check();
  await clicar(p, "CRIAR CONTA");
  await p.getByRole("heading", { name: "Confirme seu e-mail" }).waitFor();
}
async function entrarPendente(p, email = "ana.pendente@exemplo.com") {
  await escrever(p, "E-mail", email);
  await escrever(p, "Senha", "senha-segura");
  await clicar(p, "ENTRAR");
  await p.getByText(/Falta confirmar seu e-mail/).waitFor();
}

// [nome do arquivo, ?tela=, passos]
const ESTADOS = [
  ["1-confirme-seu-email", "cadastro", async (p) => cadastrar(p)],
  ["2-novo-link-enviado", "cadastro", async (p) => { await cadastrar(p); for (let i = 0; i < 62; i++) { await p.clock.runFor(1_000); await p.waitForTimeout(10); } await clicar(p, "REENVIAR E-MAIL"); await p.getByText(/Enviamos um novo link/).waitFor(); }],
  ["3-entrar-sem-confirmar", "login", async (p) => entrarPendente(p)],
  ["4-pendente-reenviar", "login", async (p) => { await entrarPendente(p); await clicar(p, "Reenviar link de confirmação"); await p.getByRole("heading", { name: "Confirme seu e-mail" }).waitFor(); }],
  ["5-espere-para-reenviar", "login", async (p) => { await entrarPendente(p, "ana.pendente.espera@exemplo.com"); await clicar(p, "Reenviar link de confirmação"); await clicar(p, "REENVIAR E-MAIL"); await p.getByText(/espere 42 segundos/).waitFor(); }],
  ["6-link-vencido", "vencido", async (p) => p.getByRole("heading", { name: "Link de confirmação vencido" }).waitFor()],
  ["7-vencido-novo-link", "vencido", async (p) => { await escrever(p, "E-mail do cadastro", "ana.lima@exemplo.com"); await clicar(p, "ENVIAR NOVO LINK"); await p.getByText(/o novo link chega em instantes/).waitFor(); }],
];
const NO_ESCURO = new Set(["1-confirme-seu-email", "3-entrar-sem-confirmar", "6-link-vencido"]);

const browser = await chromium.launch();
const feitos = [];
for (const [tela, opcoes] of Object.entries(TELAS)) {
  for (const tema of ["light", "dark"]) {
    const ctx = await browser.newContext({ ...opcoes, colorScheme: tema, reducedMotion: "reduce" });
    for (const [nome, rota, passos] of ESTADOS) {
      if (tema === "dark" && !NO_ESCURO.has(nome)) continue;
      const page = await ctx.newPage();
      await page.clock.install();
      await page.goto(`${base}?tela=${rota}&tema=${tema}`, { waitUntil: "networkidle" });
      await page.clock.runFor(500);
      await passos(page);
      await page.clock.runFor(1_000);
      await page.evaluate(() => document.fonts.ready);
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
