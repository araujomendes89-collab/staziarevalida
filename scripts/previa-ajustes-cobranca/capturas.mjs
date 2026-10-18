// Capturas da prévia dos ajustes da cobrança (precisa do servidor.ts no ar). Celular 390x844 e computador 1440x900, claro e escuro.
// Uso: node scripts/previa-ajustes-cobranca/capturas.mjs [pasta]   (padrão /Volumes/StaziaMed/.tmp-aulas/ajustes-cobranca/capturas)
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:31993";
const SAIDA = process.argv[2] || "/Volumes/StaziaMed/.tmp-aulas/ajustes-cobranca/capturas";
fs.mkdirSync(SAIDA, { recursive: true });
const post = async (url, body, token) => {
  const r = await fetch(`${BASE}${url}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${url}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
};
const rpc = async (token, fn, args = {}) => (await post("/api/dev-db/rpc", { fn, args }, token)).data;
const entrar = async (email) => (await post("/api/dev-db/auth/signin", { email, password: "Senha-forte-123" })).token;
const admin = await entrar("admin-previa@previa.dev");
const ana = await entrar("ana-pagamentos@previa.dev");
const anaId = (await rpc(admin, "app_admin_users", { p_search: "ana-pagamentos", p_role: null, p_plan: null, p_limit: 5, p_offset: 0 })).items[0].id;

const VARIANTES = [
  ["computador", { width: 1440, height: 900 }, "claro"],
  ["computador", { width: 1440, height: 900 }, "escuro"],
  ["celular", { width: 390, height: 844 }, "claro"],
  ["celular", { width: 390, height: 844 }, "escuro"],
];
const lista = [];
const browser = await chromium.launch();
for (const [tam, vp, tema] of VARIANTES) {
  const ctxDe = async (token) => {
    await rpc(token, "app_update_profile", { p_patch: { theme: tema === "escuro" ? "dark" : "light" } });
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: tam === "celular" ? 2 : 1, colorScheme: tema === "escuro" ? "dark" : "light", locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    await ctx.addInitScript((t) => localStorage.setItem("smn-dev-token", t), token);
    return ctx;
  };
  const foto = async (page, nome, alvo) => {
    const arq = `${tam}-${tema}-${nome}.png`;
    await page.waitForTimeout(700);
    if (tam === "celular") await page.addStyleTag({ content: ".smn-tabs{position:static!important}.smn-sbar{position:static!important}.smn-skip{display:none!important}" }).catch(() => undefined);
    if (alvo) await alvo.screenshot({ path: path.join(SAIDA, arq) });
    else await page.screenshot({ path: path.join(SAIDA, arq), fullPage: tam === "celular" });
    lista.push({ tam, tema, nome, arq });
  };
  const erro = (p) => p.on("pageerror", (e) => console.error(`[${tam}-${tema}] erro na página:`, e.message));

  // Administração
  {
    // a prévia começa com as vendas fechadas e os cadeados desligados em cada variante
    await rpc(admin, "app_admin_billing_vendas_ligar", { p_ligar: false });
    const ctx = await ctxDe(admin);
    const page = await ctx.newPage();
    erro(page);
    await page.goto(`${BASE}/novo/admin?aba=planos`, { waitUntil: "domcontentloaded" });
    const vendas = page.getByTestId("vendas-chave");
    await vendas.waitFor({ timeout: 60000 });
    await foto(page, "01-vendas-fechadas", vendas);
    await page.getByRole("button", { name: "Abrir vendas" }).click();
    await foto(page, "02-vendas-abrir-confirmar", vendas);
    await page.getByRole("button", { name: "Sim, abrir as vendas" }).click();
    await page.getByText("Vendas abertas.").waitFor();
    await foto(page, "03-vendas-abertas-lembra-cadeados", vendas);
    const dev = page.getByLabel("Devoluções", { exact: true });
    await dev.scrollIntoViewIfNeeded();
    await foto(page, "04-planos-devolucoes", dev.locator("xpath=..").first());
    const alertas = page.getByLabel("Alertas por e-mail", { exact: true });
    await alertas.scrollIntoViewIfNeeded();
    await page.getByText(/Últimos alertas/).click();
    await foto(page, "05-carteira-alertas-por-email", alertas.locator("xpath=..").first());
    // aviso da chave dos cadeados (texto novo), ligando e salvando
    const sw = page.getByRole("switch", { name: /^Cadeados ligados/ });
    await sw.scrollIntoViewIfNeeded();
    if (!(await sw.isChecked())) {
      await sw.check({ force: true });
      await page.locator("form").filter({ has: page.getByRole("switch", { name: /^Cadeados ligados/ }) }).locator('button[type="submit"]').first().click();
      await page.getByText("Cadeados: chave LIGADA").waitFor({ timeout: 15000 }).catch(() => undefined);
    }
    const banner = page.getByText("Cadeados: chave LIGADA");
    await banner.scrollIntoViewIfNeeded().catch(() => undefined);
    await foto(page, "06-cadeados-ligados-aviso-novo", banner.locator("xpath=ancestor::div[@role='status' or @role='alert'][1]"));
    // desliga de novo para a próxima variante
    const sw2 = page.getByRole("switch", { name: /^Cadeados ligados/ });
    if (await sw2.isChecked()) {
      await sw2.uncheck({ force: true });
      await page.locator("form").filter({ has: page.getByRole("switch", { name: /^Cadeados ligados/ }) }).locator('button[type="submit"]').first().click();
      await page.getByText("Modo sombra: nada é trancado").waitFor({ timeout: 15000 }).catch(() => undefined);
    }

    // Vendas e pagamentos
    await page.goto(`${BASE}/novo/admin?aba=vendas`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("vendas-lista").waitFor({ timeout: 60000 });
    await foto(page, "07-vendas-e-pagamentos");
    await page.getByRole("radio", { name: /Em análise/ }).click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Devolver pagamento" }).first().click();
    await page.getByLabel("Motivo (obrigatório)").fill("Pedido do aluno aprovado pela equipe");
    await page.getByRole("radio", { name: "Devolver e encerrar acesso" }).click();
    await foto(page, "08-vendas-em-analise-devolver");

    // ficha da aluna: Pagamentos
    await page.goto(`${BASE}/novo/admin?aba=usuarios`, { waitUntil: "domcontentloaded" });
    await page.getByText("Ana Souza").first().waitFor({ timeout: 60000 });
    await page.getByText("Ana Souza").first().click();
    const pag = page.getByLabel("Pagamentos do aluno", { exact: true });
    await pag.waitFor({ timeout: 60000 });
    await pag.scrollIntoViewIfNeeded();
    await foto(page, "09-ficha-pagamentos", pag);
    await pag.getByRole("button", { name: "Devolver pagamento" }).first().click();
    await pag.getByLabel("Motivo (obrigatório)").fill("Cobrança em dobro");
    await pag.getByRole("radio", { name: "Devolver e manter acesso" }).click();
    await foto(page, "10-ficha-devolver-formulario", pag);
    await ctx.close();
  }
  // Aluna: Minha conta › Assinatura (link da nota)
  {
    const ctx = await ctxDe(ana);
    const page = await ctx.newPage();
    erro(page);
    await page.goto(`${BASE}/novo/perfil?secao=assinatura`, { waitUntil: "domcontentloaded" });
    const h = page.getByTestId("assinatura-historico");
    await h.waitFor({ timeout: 60000 });
    await h.scrollIntoViewIfNeeded();
    await foto(page, "11-aluno-assinatura-nota-fiscal", h.locator("xpath=..").first());
    await ctx.close();
  }
}
// e-mails (gravados pela prévia; nada foi enviado)
{
  const page = await browser.newPage({ viewport: { width: 640, height: 900 } });
  const pasta = "/Volumes/StaziaMed/.tmp-aulas/ajustes-cobranca/emails";
  for (const arq of fs.readdirSync(pasta).filter((f) => f.endsWith(".html")).sort()) {
    const html = fs.readFileSync(path.join(pasta, arq), "utf8");
    const assunto = (/Assunto: (.*?) -->/.exec(html)?.[1] ?? arq).replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60);
    await page.setContent(html, { waitUntil: "load" });
    const nome = `email-${assunto}.png`;
    await page.screenshot({ path: path.join(SAIDA, nome), fullPage: true });
    lista.push({ tam: "email", tema: "claro", nome: `email-${assunto}`, arq: nome });
  }
}
await browser.close();
fs.writeFileSync(path.join(SAIDA, "capturas.json"), JSON.stringify(lista, null, 1));
console.log(`${lista.length} capturas em ${SAIDA}`);
