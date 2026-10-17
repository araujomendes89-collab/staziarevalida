// Capturas da prévia do onboarding (precisa do servidor: npx tsx scripts/previa-onboarding/servidor.ts).
// Para cada tamanho (celular 390x844, computador 1440x900) e tema (claro, escuro): cria uma conta nova no banco local, passa pelo
// onboarding inteiro (apresentação, 7 perguntas, nivelamento "Fazer depois", plano), faz o tour no painel e abre as dicas e a Ajuda.
// Uso: node scripts/previa-onboarding/capturas.mjs [pasta]   (padrão /Volumes/StaziaMed/.tmp-aulas/onboarding)
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:31990";
const SAIDA = process.argv[2] || "/Volumes/StaziaMed/.tmp-aulas/onboarding";
const SO = process.env.SO || ""; // ex.: "celular-claro"
fs.mkdirSync(SAIDA, { recursive: true });

const api = async (caminho, corpo, token) => {
  const r = await fetch(`${BASE}/api/dev-db${caminho}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(corpo),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${caminho}: ${JSON.stringify(j)}`);
  return j;
};
const rpc = async (token, fn, args = {}) => (await api("/rpc", { fn, args }, token)).data;

async function novaConta(rotulo, tema) {
  const email = `onb-${rotulo}-${Date.now()}@previa.dev`;
  const { token } = await api("/auth/signup", {
    name: "Ana Souza", email, password: "Senha-forte-123", phone: `+55419${String(Date.now()).slice(-8)}`, terms_version: "2.0",
    user_agent: "previa", declares_adult: "true", declares_physician: "true",
  });
  if (tema === "escuro") await rpc(token, "app_update_profile", { p_patch: { theme: "dark" } });
  return token;
}

const VARIANTES = [
  ["celular", { width: 390, height: 844 }, "claro"],
  ["celular", { width: 390, height: 844 }, "escuro"],
  ["computador", { width: 1440, height: 900 }, "claro"],
  ["computador", { width: 1440, height: 900 }, "escuro"],
].filter(([t, , tema]) => !SO || SO === `${t}-${tema}`);

const lista = [];
const browser = await chromium.launch();
for (const [tam, vp, tema] of VARIANTES) {
  const token = await novaConta(tam, tema);
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, colorScheme: tema === "escuro" ? "dark" : "light", locale: "pt-BR" });
  await ctx.addInitScript((t) => localStorage.setItem("smn-dev-token", t), token);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`[${tam}-${tema}] erro na página:`, e.message));
  let n = 0;
  const foto = async (nome) => {
    n += 1;
    const arq = `${tam}-${tema}-${String(n).padStart(2, "0")}-${nome}.png`;
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(SAIDA, arq) });
    lista.push({ tam, tema, n, nome, arq });
  };
  const continuar = async () => {
    await page.getByRole("button", { name: /^Continuar/ }).click();
    await page.waitForTimeout(350);
  };

  await page.goto(`${BASE}/novo/`);
  await page.getByText("Oi!").first().waitFor({ timeout: 60000 });
  for (let i = 1; i <= 6; i += 1) {
    await foto(`apresentacao-${i}`);
    if (i < 6) await continuar();
  }
  await page.getByRole("button", { name: /Montar meu estudo/ }).click();
  await page.getByRole("heading", { name: /Para qual prova/ }).waitFor();
  await foto("fase");
  await continuar();
  await page.getByRole("heading", { name: /Quando é a sua prova/ }).waitFor();
  const data = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
  await page.locator("#ob-data").fill(data);
  await foto("prova");
  await continuar();
  await page.getByRole("heading", { name: /Quanto tempo/ }).waitFor();
  await page.locator(".ob-tempo", { hasText: "1 h 30" }).click();
  await page.getByLabel("sábado").check({ force: true });
  await foto("rotina");
  await continuar();
  await page.getByRole("heading", { name: /dificuldade/ }).waitFor();
  await page.locator(".ob-opc", { hasText: "Pediatria" }).click();
  await page.locator(".ob-opc", { hasText: "Clínica Médica" }).click();
  await foto("dificuldades");
  await continuar();
  await page.getByRole("heading", { name: /Como você prefere/ }).waitFor();
  await page.locator(".ob-opc", { hasText: "Um pouco de tudo" }).click();
  await foto("jeito");
  await continuar();
  await page.getByRole("heading", { name: /Quem vai te acompanhar/ }).waitFor();
  await page.locator(".ob-per", { hasText: "Stazia" }).click();
  await page.locator(".ob-opc", { hasText: "Durona" }).click();
  await foto("tutor");
  await continuar();
  await page.getByRole("heading", { name: /lembretes/ }).waitFor();
  await page.getByRole("switch").check({ force: true });
  await page.locator("#ob-hora").fill("07:30");
  await foto("lembretes");
  await continuar();
  await page.getByText("Fazer depois").first().waitFor({ timeout: 30000 });
  await foto("nivelamento");
  await page.getByRole("button", { name: "Fazer depois" }).first().click();
  await page.getByRole("heading", { name: /Seu plano de hoje está pronto/ }).waitFor();
  await page.locator(".ob-tarefas li").first().waitFor({ timeout: 20000 }).catch(() => {});
  await foto("plano");
  await page.getByRole("button", { name: /Ir para o meu painel/ }).click();
  await page.locator(".ob-tour__caixa").waitFor({ timeout: 30000 });
  for (let i = 1; i <= 5; i += 1) {
    await page.waitForTimeout(500);
    await foto(`tour-${i}`);
    await page.locator(".ob-tour__pri").click();
  }
  await page.waitForTimeout(600);
  await foto("inicio-primeiros-passos");
  if (tam === "computador") {
    await page.locator(".ih, main").first().screenshot({ path: path.join(SAIDA, `${tam}-${tema}-inicio-inteiro.png`) }).catch(() => {});
  }
  await page.goto(`${BASE}/novo/simulados`);
  await page.locator(".ob-dica1").waitFor({ timeout: 20000 });
  await foto("dica-simulados");
  await page.goto(`${BASE}/novo/perfil`);
  await page.getByText("Ajuda e suporte").first().click();
  await page.getByRole("button", { name: "Refazer apresentação" }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Refazer apresentação" }).scrollIntoViewIfNeeded();
  await foto("ajuda");
  await ctx.close();
  console.log(`[${tam}-${tema}] ok: ${n} capturas`);
}
await browser.close();
// junta com as capturas de outras rodadas (SO=...), trocando as da mesma variante
const arqJson = path.join(SAIDA, "capturas.json");
const antes = fs.existsSync(arqJson) ? JSON.parse(fs.readFileSync(arqJson, "utf8")) : [];
const feitas = new Set(lista.map((x) => `${x.tam}-${x.tema}`));
fs.writeFileSync(arqJson, JSON.stringify([...antes.filter((x) => !feitas.has(`${x.tam}-${x.tema}`)), ...lista], null, 1));
