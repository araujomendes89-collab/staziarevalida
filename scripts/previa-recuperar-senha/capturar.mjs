// Capturas da prévia (celular 390 e computador 1440, claro; algumas no escuro), uma por estado da recuperação de senha.
// Uso: node scripts/previa-recuperar-senha/capturar.mjs <pasta-de-saida> [prefixo] [endereco]
//   ex.: node scripts/previa-recuperar-senha/capturar.mjs /Volumes/StaziaMed/.tmp-aulas/recuperar-senha depois
// A prévia precisa estar rodando (npx vite --config scripts/previa-recuperar-senha/vite.config.mjs).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [out = "/Volumes/StaziaMed/.tmp-aulas/recuperar-senha", prefixo = "depois", base = "http://127.0.0.1:31956/"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

const TELAS = {
  celular: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  computador: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

const enviar = (page, nome) => page.getByRole("button", { name: nome }).click();
const escrever = (page, rotulo, valor) => page.getByLabel(rotulo, { exact: true }).fill(valor);

// [nome do arquivo, ?tela=, passos]
const ESTADOS = [
  ["1-pedir-link", "forgot", async (p) => p.getByLabel("E-mail cadastrado").waitFor()],
  ["2-email-invalido", "forgot", async (p) => { await escrever(p, "E-mail cadastrado", "sem-arroba"); await enviar(p, "ENVIAR INSTRUÇÕES"); await p.getByText("Informe um e-mail válido.").first().waitFor(); }],
  ["3-link-enviado", "forgot", async (p) => { await escrever(p, "E-mail cadastrado", "ana@exemplo.com"); await enviar(p, "ENVIAR INSTRUÇÕES"); await p.getByText(/Confira também o spam/).waitFor(); }],
  ["4-criar-nova-senha", "nova", async (p) => p.getByLabel("Nova senha", { exact: true }).waitFor()],
  ["5-senhas-diferentes", "nova", async (p) => { await escrever(p, "Nova senha", "senha-boa-123"); await escrever(p, "Conferir nova senha", "senha-boa-124"); await enviar(p, "SALVAR NOVA SENHA"); await p.getByText("As senhas não são iguais.").waitFor(); }],
  ["6-senha-trocada", "nova", async (p) => { await escrever(p, "Nova senha", "senha-boa-123"); await escrever(p, "Conferir nova senha", "senha-boa-123"); await enviar(p, "SALVAR NOVA SENHA"); await p.getByText(/Senha alterada com sucesso/).waitFor(); }],
  ["7-link-vencido", "vencido", async (p) => p.getByRole("button", { name: "PEDIR NOVO LINK" }).waitFor()],
  ["8-vencido-ao-salvar", "nova", async (p) => { await escrever(p, "Nova senha", "senha-vencido-1"); await escrever(p, "Conferir nova senha", "senha-vencido-1"); await enviar(p, "SALVAR NOVA SENHA"); await p.getByRole("button", { name: "PEDIR NOVO LINK" }).waitFor(); }],
];
const NO_ESCURO = new Set(["1-pedir-link", "3-link-enviado", "4-criar-nova-senha", "7-link-vencido"]);

const browser = await chromium.launch();
const feitos = [];
for (const [tela, opcoes] of Object.entries(TELAS)) {
  for (const tema of ["light", "dark"]) {
    const ctx = await browser.newContext({ ...opcoes, colorScheme: tema, reducedMotion: "reduce" });
    for (const [nome, rota, passos] of ESTADOS) {
      if (tema === "dark" && !NO_ESCURO.has(nome)) continue;
      const page = await ctx.newPage();
      await page.goto(`${base}?tela=${rota}&tema=${tema}`, { waitUntil: "networkidle" });
      await passos(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
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
