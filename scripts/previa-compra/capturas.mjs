// Capturas da prévia da compra (precisa do servidor e das contas: servidor.ts + semear.mjs). Celular 390x844 e computador 1440x900,
// claro e escuro. Usa o Asaas SANDBOX de verdade (Pix simulado como pago pela página de apoio; nada real é cobrado).
// Uso: node scripts/previa-compra/capturas.mjs [pasta]   (padrão /Volumes/StaziaMed/.tmp-aulas/fase1-compra/capturas)
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:31995";
const SAIDA = process.argv[2] || "/Volumes/StaziaMed/.tmp-aulas/fase1-compra/capturas";
const SO = process.env.SO || "";
fs.mkdirSync(SAIDA, { recursive: true });

const post = async (url, body, token) => {
  const r = await fetch(`${BASE}${url}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body ?? {}), redirect: "manual" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 302) throw new Error(`${url}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
};
const get = async (url, token) => (await fetch(`${BASE}${url}`, { headers: { authorization: `Bearer ${token}` } })).json();
// versão vigente do Contrato/Termo (lida do banco, como o cadastro faz)
let _versao = null;
const versaoDoTermo = async () => (_versao ??= ((await (await fetch(`${BASE}/api/dev-db/rpc`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fn: "app_legal_current", args: {} }) })).json()).data?.termo_uso?.version ?? "3.0"));
const rpc = async (token, fn, args = {}) => (await post("/api/dev-db/rpc", { fn, args }, token)).data;
const entrar = async (email) => (await post("/api/dev-db/auth/signin", { email, password: "Senha-forte-123" })).token;
async function contaNova(rotulo, nome) {
  const email = `${rotulo}-${Date.now()}@previa.dev`;
  const { token } = await post("/api/dev-db/auth/signup", { name: nome, email, password: "Senha-forte-123", terms_version: await versaoDoTermo(), user_agent: "previa", declares_adult: "true", declares_physician: "true" });
  await post("/api/planos/teste/ativar", {}, token);
  await rpc(token, "app_onboarding_salvar", { p_passo: "pular", p_dados: {} });
  return token;
}

const VARIANTES = [
  ["celular", { width: 390, height: 844 }, "claro"],
  ["celular", { width: 390, height: 844 }, "escuro"],
  ["computador", { width: 1440, height: 900 }, "claro"],
  ["computador", { width: 1440, height: 900 }, "escuro"],
].filter(([t, , tema]) => !SO || SO === `${t}-${tema}`);

// aluno-teste: 2 respostas hoje (na prévia a amostra é 2), para o cadeado aparecer ao começar outro treino
const teste = await entrar("aluno-teste@previa.dev");
const amostra = await rpc(teste, "app_amostra_hoje");
if ((amostra?.recursos?.questoes?.usados ?? 0) < 2) {
  const s = await rpc(teste, "app_start_session", { p_kind: "questoes", p_filters: {}, p_count: 3, p_time_limit_seconds: null });
  const sess = await rpc(teste, "app_get_session", { p_session_id: s.session_id });
  for (const q of (sess.questions ?? sess.items ?? []).slice(0, 2)) {
    const opt = (q.options ?? q.alternatives ?? [])[0];
    const letra = opt?.key ?? opt?.letter ?? opt?.id ?? "A";
    await rpc(teste, "app_answer_question", { p_session_id: s.session_id, p_question_id: q.id, p_option: letra, p_active_ms: 30000 }).catch((e) => console.log("resposta:", e.message.slice(0, 160)));
  }
  await rpc(teste, "app_finish_session", { p_session_id: s.session_id }).catch(() => undefined);
}

const lista = [];
const browser = await chromium.launch();
for (const [tam, vp, tema] of VARIANTES) {
  const ctxDe = async (token) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, colorScheme: tema === "escuro" ? "dark" : "light", locale: "pt-BR" });
    await ctx.addInitScript((t) => localStorage.setItem("smn-dev-token", t), token);
    return ctx;
  };
  let n = 0;
  const foto = async (page, nome, full = false) => {
    n += 1;
    const arq = `${tam}-${tema}-${String(n).padStart(2, "0")}-${nome}.png`;
    await page.waitForTimeout(600);
    // celular, página inteira: as barras fixas (topo e menu de baixo) ficam no lugar delas, sem cobrir o meio da foto
    if (full && tam === "celular") await page.addStyleTag({ content: ".smn-tabs{position:static!important}.smn-sbar{position:static!important}.smn-skip{display:none!important}" }).catch(() => undefined);
    await page.screenshot({ path: path.join(SAIDA, arq), fullPage: full && tam === "celular" });
    lista.push({ tam, tema, n, nome, arq });
  };
  const tema_ = async (token) => rpc(token, "app_update_profile", { p_patch: { theme: tema === "escuro" ? "dark" : "light" } });

  // 1) compra por Pix (conta nova em teste grátis)
  {
    const token = await contaNova(`compra-${tam}-${tema}`, "Bruno Lima");
    await tema_(token);
    const ctx = await ctxDe(token);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`[${tam}-${tema}] erro na página:`, e.message));
    await page.goto(`${BASE}/novo/planos`);
    await page.getByTestId("cobranca-plano-pro").waitFor({ timeout: 90000 });
    await foto(page, "planos-vitrine", true);
    await page.getByRole("button", { name: "Assinar o PRO mensal" }).click();
    await page.getByLabel("Nome completo").fill("Bruno Lima Teste");
    await page.getByLabel("CPF").fill("36638544691");
    await foto(page, "compra-1-forma-e-cpf", true);
    await page.getByRole("button", { name: "Revisar e pagar" }).click();
    await page.getByRole("checkbox").check({ force: true });
    await foto(page, "compra-2-resumo-e-aceite", true);
    await page.getByRole("button", { name: "Gerar o Pix" }).click();
    await page.getByTestId("cobranca-aberta").waitFor({ timeout: 60000 });
    await foto(page, "compra-3-pix-aguardando", true);
    const ov = await get("/api/cobranca/overview", token);
    const pedido = ov.pedidos_abertos?.[0]?.id;
    if (pedido) await post(`/previa/pix-pago/${pedido}`);
    await page.getByTestId("cobranca-pago").waitFor({ timeout: 60000 });
    await foto(page, "compra-4-pago");
    await page.goto(`${BASE}/novo/`);
    await page.getByTestId("avisos-popup").waitFor({ timeout: 60000 });
    await foto(page, "aviso-pagamento-confirmado");
    await page.getByRole("button", { name: "Entendi" }).click();
    await page.goto(`${BASE}/novo/perfil?secao=assinatura`);
    await page.getByTestId("assinatura-plano").waitFor({ timeout: 60000 });
    await foto(page, "minha-conta-assinatura", true);
    await page.getByRole("button", { name: "Cancelar assinatura" }).click();
    await foto(page, "assinatura-cancelar-confirmar", true);
    await ctx.close();
  }

  // 2) assinante com renovação chegando (aviso 3 dias antes; Pix da renovação já gerado)
  {
    const token = await entrar("aluno-pro@previa.dev");
    await post("/previa/avisos-de-novo", { email: "aluno-pro@previa.dev" });
    await tema_(token);
    const ctx = await ctxDe(token);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/novo/`);
    await page.getByTestId("avisos-popup").waitFor({ timeout: 60000 });
    await foto(page, "aviso-renovacao");
    await page.getByRole("button", { name: "Entendi" }).click();
    await page.getByRole("button", { name: "Entendi" }).click().catch(() => undefined);
    await page.goto(`${BASE}/novo/perfil?secao=assinatura`);
    await page.getByTestId("assinatura-plano").waitFor({ timeout: 60000 });
    await foto(page, "assinatura-com-pix-da-renovacao", true);
    await ctx.close();
  }

  // 3) teste grátis: faixa da amostra e o cadeado
  {
    await tema_(teste);
    const ctx = await ctxDe(teste);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/novo/flash`);
    await page.getByTestId("amostra-flashcards").waitFor({ timeout: 60000 });
    await foto(page, "amostra-flashcards");
    await page.goto(`${BASE}/novo/questoes`);
    await page.getByTestId("amostra-questoes").waitFor({ timeout: 60000 });
    await foto(page, "amostra-questoes-acabou");
    const comecar = page.getByRole("button", { name: /Começar/ }).first();
    await comecar.click();
    await page.getByTestId("cadeado-dialogo").waitFor({ timeout: 60000 });
    await foto(page, "cadeado-assine-para-liberar");
    await ctx.close();
  }

  // 4) cartão (só no computador claro): a página segura do Asaas abre em outra aba
  if (tam === "computador" && tema === "claro") {
    const token = await contaNova(`cartao-${tam}`, "Davi Rocha");
    const ctx = await ctxDe(token);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/novo/planos`);
    await page.getByTestId("cobranca-plano-pro").waitFor({ timeout: 90000 });
    await page.getByTestId("cobranca-plano-pro").getByRole("radio", { name: /Trimestral/ }).click();
    await page.getByRole("button", { name: "Assinar o PRO trimestral" }).click();
    await page.getByRole("radio", { name: /Cartão de crédito/ }).click();
    await page.getByLabel("Nome completo").fill("Davi Rocha Teste");
    await page.getByLabel("CPF").fill("36638544691");
    await page.getByRole("button", { name: "Revisar e pagar" }).click();
    await page.getByRole("checkbox").check({ force: true });
    await foto(page, "cartao-resumo-trimestral", true);
    const [aba] = await Promise.all([ctx.waitForEvent("page"), page.getByRole("button", { name: "Ir para a página segura do cartão" }).click()]);
    await page.getByTestId("cobranca-aberta").waitFor({ timeout: 60000 });
    await foto(page, "cartao-aguardando", true);
    await aba.waitForURL(/asaas\.com/, { timeout: 60000 }).catch(() => undefined);
    await aba.waitForTimeout(4000);
    n += 1;
    const arq = `${tam}-${tema}-${String(n).padStart(2, "0")}-pagina-segura-asaas.png`;
    await aba.screenshot({ path: path.join(SAIDA, arq), fullPage: true });
    lista.push({ tam, tema, n, nome: "pagina-segura-asaas", arq });
    await ctx.close();
  }
}
await browser.close();
const antigo = fs.existsSync(path.join(SAIDA, "capturas.json")) ? JSON.parse(fs.readFileSync(path.join(SAIDA, "capturas.json"), "utf8")) : [];
const juntos = [...antigo.filter((a) => !lista.some((b) => b.arq === a.arq)), ...lista];
fs.writeFileSync(path.join(SAIDA, "capturas.json"), JSON.stringify(juntos, null, 2));
console.log(`ok: ${lista.length} capturas em ${SAIDA}`);
