// Verificação ponta a ponta da prévia das comemorações no app (Chromium próprio, não o navegador compartilhado):
//   node src/novo/app/play/celebracoes/previa/e2e-previa.mjs [URL_BASE] [PASTA_DAS_FOTOS]
import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:31994";
const fotos = process.argv[3] || null;
const res = [];
const check = (n, ok, d = "") => {
  res.push(ok);
  console.log(`${ok ? "OK   " : "FALHA"} ${n} ${d}`);
};
const browser = await chromium.launch();

async function abrir(opcoes = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, ...opcoes });
  const page = await ctx.newPage();
  const erros = [];
  const sons = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.location()?.url ?? "") && erros.push(m.text()));
  // só o áudio de verdade (fetch do motor de som); no servidor de desenvolvimento cada "?url" do Vite é um módulo JS minúsculo
  page.on("request", (r) => r.resourceType() === "fetch" && /\.(mp3|wav)(\?|$)/.test(r.url()) && sons.push(r.url()));
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  return { ctx, page, erros, sons };
}
const ev = (page, id) => page.locator(`[data-evento="${id}"]`).first();
const botao = (page, nome) => page.getByRole("button", { name: nome, exact: true });
const foto = async (page, nome) => fotos && (await page.screenshot({ path: `${fotos}/${nome}.png` }));

// 1) medalha fora de atividade: cheia, nome real, Fechar desde o início, som só do evento, Fechar some na hora
{
  const { ctx, page, erros, sons } = await abrir();
  await botao(page, "Medalha: Primeiros Passos").click();
  const c = ev(page, "conquista-desbloqueada");
  await c.waitFor({ timeout: 8000 });
  check("medalha: comemoração média em tela cheia", (await c.getAttribute("data-intensidade")) === "media");
  check("medalha: Fechar visível desde o primeiro quadro", await page.getByRole("button", { name: "Fechar comemoração" }).isVisible());
  await page.waitForTimeout(3600);
  check("medalha: nome real da medalha na tela", await c.getByText("Primeiros Passos", { exact: true }).isVisible());
  check("medalha: voz da Durona (padrão) escolhida", (await c.getAttribute("data-fala")) === "Tá bom, essa eu aplaudo.");
  check("medalha: som ligado depois do clique", (await c.getAttribute("data-sound")) === "ligado");
  await foto(page, "1-medalha-desktop");
  await page.waitForTimeout(1500);
  check("medalha: baixa só os sons desta comemoração (até 4 arquivos)", sons.length > 0 && sons.length <= 4, `(${sons.length}: ${sons.map((u) => u.split("/").pop().split("?")[0]).join(", ")})`);
  await page.getByRole("button", { name: "Fechar comemoração" }).click();
  await page.waitForTimeout(150);
  check("medalha: Fechar dispensa na hora", (await page.locator("[data-evento]").count()) === 0);
  check("histórico: medalha registrada", await page.getByText("Medalha desbloqueada: Primeiros Passos", { exact: true }).isVisible());
  check("medalha: sem erros no console", erros.length === 0, erros.slice(0, 2).join(" | "));
  await ctx.close();
}

// 2) treino: só a faixa do acerto durante; a medalha espera "Terminar treino"
{
  const { ctx, page, erros } = await abrir();
  await botao(page, "Abrir treino").click();
  await botao(page, "Acertar + medalha nova").click();
  await ev(page, "questao-correta").waitFor({ timeout: 8000 });
  check("treino: faixa pequena do acerto aparece", (await ev(page, "questao-correta").getAttribute("data-intensidade")) === "micro");
  await page.waitForTimeout(400);
  await foto(page, "2-faixa-acerto");
  check("treino: a medalha NÃO aparece durante a sessão", (await ev(page, "conquista-desbloqueada").count()) === 0);
  await botao(page, "Terminar treino").click();
  await ev(page, "conquista-desbloqueada").waitFor({ timeout: 8000 });
  check("treino: a medalha aparece no fim", true);
  check("treino: sem erros", erros.length === 0, erros.slice(0, 2).join(" | "));
  await ctx.close();
}

// 3) simulado: nada durante; placar no fim
{
  const { ctx, page } = await abrir();
  await botao(page, "Abrir simulado").click();
  await botao(page, "Terminar com 82%").click();
  const s = ev(page, "simulado-alto");
  await s.waitFor({ timeout: 8000 });
  await page.waitForTimeout(3200);
  check("simulado: placar real (82 de 100)", await s.getByText("82 de 100 questões certas", { exact: true }).isVisible());
  await foto(page, "3-simulado");
  await ctx.close();
}

// 4) marcos (celular): 30 dias com a maior sequência do banco; nível com o nome real; liga Ouro; sem rolagem lateral
{
  const { ctx, page, erros } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await botao(page, "30 dias").click();
  const s = ev(page, "streak-30");
  await s.waitFor({ timeout: 8000 });
  check("sequência 30: grande", (await s.getAttribute("data-intensidade")) === "grande");
  await page.waitForSelector('[data-evento="streak-30"][data-finished="true"]', { timeout: 12000 });
  check("sequência 30: maior sequência vinda do banco", await s.getByText("Maior sequência: 30 dias", { exact: true }).isVisible());
  check("sequência 30: Continuar e Compartilhar no fim", (await page.getByRole("button", { name: "Continuar" }).isVisible()) && (await page.getByRole("button", { name: "Compartilhar marco" }).isVisible()));
  await foto(page, "4-sequencia-30-celular");
  const lateral = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("celular: sem rolagem lateral", lateral <= 0, `(${lateral})`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  check("Esc fecha", (await page.locator("[data-evento]").count()) === 0);

  await botao(page, "Novo nível").click();
  const n = ev(page, "novo-nivel");
  await n.waitFor({ timeout: 8000 });
  await page.waitForTimeout(4500);
  check("nível: nome real do nível", await n.getByText("Agora você é Explorador", { exact: true }).isVisible());
  await foto(page, "5-nivel-celular");
  await page.getByRole("button", { name: "Fechar comemoração" }).click();

  await botao(page, "Subiu para Ouro").click();
  const l = ev(page, "liga-promocao-ouro");
  await l.waitFor({ timeout: 8000 });
  await page.waitForTimeout(4500);
  check("liga: 'Você subiu para a Liga Ouro'", await l.getByText("Você subiu para a Liga Ouro", { exact: true }).isVisible());
  check("liga: posição final da semana", await l.getByText("Você fechou a semana em 4º lugar", { exact: true }).isVisible());
  await foto(page, "6-liga-ouro-celular");
  await page.getByRole("button", { name: "Fechar comemoração" }).click();

  await botao(page, "Meta do dia").click();
  const m = ev(page, "meta-diaria");
  await m.waitFor({ timeout: 8000 });
  check("meta do dia: cartão pequeno (não tela cheia)", (await m.getAttribute("data-intensidade")) === "pequena");
  await page.waitForTimeout(1200);
  await foto(page, "7-meta-do-dia-cartao");
  check("marcos: sem erros", erros.length === 0, erros.slice(0, 2).join(" | "));
  await ctx.close();
}

// 5) preferências: voz desligada, animações reduzidas; movimento reduzido do sistema
{
  const { ctx, page } = await abrir();
  await page.getByText("Voz da Durona", { exact: true }).click();
  await page.getByText("Animações reduzidas", { exact: true }).click();
  await botao(page, "Medalha: Mira Boa").click();
  const c = ev(page, "conquista-desbloqueada");
  await c.waitFor({ timeout: 8000 });
  check("preferência: voz desligada = sem fala", (await c.getAttribute("data-fala")) === "");
  check("preferência: animações reduzidas = cartão pequeno", (await c.getAttribute("data-intensidade")) === "pequena");
  await ctx.close();
}
{
  const { ctx, page } = await abrir({ reducedMotion: "reduce" });
  await botao(page, "60 dias").click();
  const s = ev(page, "streak-60");
  await s.waitFor({ timeout: 8000 });
  check("movimento reduzido do sistema: aparece já pronto (sem Pular)", (await s.getAttribute("data-finished")) === "true" && (await page.getByRole("button", { name: "Pular" }).count()) === 0);
  await ctx.close();
}

await browser.close();
const falhas = res.filter((x) => !x).length;
console.log(`\n${res.length - falhas}/${res.length} verificações OK`);
process.exit(falhas ? 1 : 0);
