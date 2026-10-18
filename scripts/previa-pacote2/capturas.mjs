// Capturas da prévia do Pacote 2 (precisa de scripts/previa-pacote2/servidor.mts ligado na porta 31962).
// Para cada tamanho (celular 390x844, computador 1440x900) e tema (claro, escuro):
//   1) Criar conta (sem login): a tela inteira, para mostrar que NÃO há caixa de marketing no cadastro;
//   2) conta nova pelo banco local, perguntas do onboarding respondidas pelo banco até os lembretes;
//   3) lembretes → "Novidades por e-mail" (nada marcado) → no claro "Sim, quero receber", no escuro "Agora não" → passo seguinte;
//   4) Minha Conta → Privacidade e dados (chave de novidades ligada/desligada conforme a resposta; sem "Baixar meus dados").
// Uso: node capturas.mjs   (do worktree, para achar o playwright)
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire("/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/package.json");
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:31962";
const SAIDA = "/Volumes/StaziaMed/.tmp-aulas/pacote2-previo/capturas";
fs.mkdirSync(SAIDA, { recursive: true });
const api = async (caminho, corpo, token) => {
  const r = await fetch(`${BASE}/api/dev-db${caminho}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${caminho}: ${JSON.stringify(j).slice(0, 400)}`);
  return j;
};
const rpc = async (token, fn, args = {}) => (await api("/rpc", { fn, args }, token)).data;
const legal = await rpc(null, "app_legal_current").catch(() => null);
const TERMO = legal?.termo_uso?.version || "3.0";

async function novaConta(rotulo, tema) {
  const email = `p2-${rotulo}-${tema}-${Date.now()}@previa.dev`;
  const { token } = await api("/auth/signup", {
    name: "Ana Souza", email, password: "Senha-forte-123", terms_version: TERMO, user_agent: "previa", declares_adult: "true", declares_physician: "true",
  });
  if (tema === "escuro") await rpc(token, "app_update_profile", { p_patch: { theme: "dark" } });
  // perguntas já respondidas pelo banco: a tela retoma nos lembretes
  await rpc(token, "app_onboarding_salvar", { p_passo: "apresentacao", p_dados: {} });
  const e = await rpc(token, "app_onboarding_estado");
  const fase = e?.acesso?.modo_fase === "escolher_teste" ? { escolha: "teoria" } : {};
  for (const [p, d] of [
    ["fase", fase], ["prova", { exam_date: null }], ["rotina", { daily_minutes: 90, dias_semana: [1, 2, 3, 4, 5] }],
    ["dificuldades", { areas: ["PEDIATRIA"] }], ["jeito", { jeito: "misto" }], ["tutor", { personagem: "stazia", personalidade: "tranquila" }],
  ]) await rpc(token, "app_onboarding_salvar", { p_passo: p, p_dados: d });
  return { token, email };
}

const VARIANTES = [
  ["celular", { width: 390, height: 844 }, "claro"],
  ["celular", { width: 390, height: 844 }, "escuro"],
  ["computador", { width: 1440, height: 900 }, "claro"],
  ["computador", { width: 1440, height: 900 }, "escuro"],
];
const lista = [];
const notas = [];
const browser = await chromium.launch();
for (const [tam, vp, tema] of VARIANTES) {
  const opts = { viewport: vp, deviceScaleFactor: 2, colorScheme: tema === "escuro" ? "dark" : "light", locale: "pt-BR" };
  let n = 0;
  const foto = async (page, nome, inteira = false) => {
    n += 1;
    const arq = `${tam}-${tema}-${String(n).padStart(2, "0")}-${nome}.png`;
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SAIDA, arq), fullPage: inteira });
    lista.push({ tam, tema, n, nome, arq });
  };
  // 1) Criar conta, sem login
  {
    const ctx = await browser.newContext(opts);
    if (tema === "escuro") await ctx.addInitScript(() => { try { localStorage.setItem("smn-theme", "dark"); } catch {} });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`[${tam}-${tema}] erro na página:`, e.message));
    await page.goto(`${BASE}/novo/criar-conta`);
    await page.getByRole("heading").first().waitFor({ timeout: 90000 });
    await page.waitForTimeout(1200);
    const txt = (await page.locator("body").innerText()).toLowerCase();
    notas.push(`${tam}-${tema}: Criar conta ${/marketing|novidades|ofertas/.test(txt) ? "TEM texto de marketing" : "sem texto de marketing/novidades/ofertas"}; caixas na tela: ${await page.getByRole("checkbox").count()}`);
    await foto(page, "criar-conta", true);
    await ctx.close();
  }
  // 2) onboarding
  const { token, email } = await novaConta(tam, tema);
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript((t) => localStorage.setItem("smn-dev-token", t), token);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`[${tam}-${tema}] erro na página:`, e.message));
  await page.goto(`${BASE}/novo/`);
  await page.getByRole("heading", { name: /lembretes/ }).waitFor({ timeout: 90000 });
  await page.getByRole("switch").check({ force: true });
  await page.locator("#ob-hora").fill("07:30");
  await foto(page, "lembretes");
  await page.getByRole("button", { name: /^Continuar/ }).click();
  await page.getByRole("heading", { name: "Novidades por e-mail" }).waitFor({ timeout: 30000 });
  await foto(page, "novidades-por-email");
  const sim = tema === "claro";
  await page.getByRole("button", { name: sim ? "Sim, quero receber" : "Agora não" }).click();
  await page.getByText(/Fazer depois|Seu plano de hoje está pronto/).first().waitFor({ timeout: 30000 });
  await foto(page, sim ? "depois-do-sim" : "depois-do-agora-nao");
  const m = await rpc(token, "app_marketing_get");
  notas.push(`${tam}-${tema}: respondeu "${sim ? "Sim" : "Agora não"}" → banco: opt_in=${m?.opt_in}, origem=${m?.origin ?? "—"} (${email})`);
  // 3) Minha Conta → Privacidade e dados
  await rpc(token, "app_onboarding_salvar", { p_passo: "concluir", p_dados: {} }).catch(() => {});
  await page.goto(`${BASE}/novo/perfil?secao=privacidade`);
  await page.waitForTimeout(1500);
  const priv = page.getByText("Privacidade e dados").first();
  if (await priv.count()) await priv.click().catch(() => {});
  await page.getByText("Novidades e ofertas por e-mail").first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.getByText("Novidades e ofertas por e-mail").first().evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  const corpo = await page.locator("body").innerText();
  notas.push(`${tam}-${tema}: Minha Conta ${/Baixar meus dados/i.test(corpo) ? 'TEM "Baixar meus dados"' : 'sem "Baixar meus dados"'}; chave de novidades ${/Ligado/.test(corpo) ? "Ligado" : /Desligado/.test(corpo) ? "Desligado" : "?"}`);
  await foto(page, "minha-conta-privacidade");
  await ctx.close();
  console.log(`[${tam}-${tema}] ok: ${n} capturas`);
}
await browser.close();
fs.writeFileSync(path.join(SAIDA, "capturas.json"), JSON.stringify(lista, null, 1));
fs.writeFileSync(path.join(SAIDA, "notas.txt"), notas.join("\n") + "\n");
console.log(notas.join("\n"));
