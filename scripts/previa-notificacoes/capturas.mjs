// Capturas da Central de Notificações (precisa do servidor: npx tsx scripts/previa-notificacoes/servidor.ts). Celular 390x844 e
// computador 1440x900, claro e escuro: pop-up de cobrança com o sino atrás, sino fechado, painel aberto, 9+, estado vazio, sino nas
// outras telas e a Administração > Comunicados (com a prévia). Monta também a página comparar.html.
// Uso: node scripts/previa-notificacoes/capturas.mjs [pasta]   (padrão /Volumes/StaziaMed/.tmp-aulas/notificacoes)
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:31997";
const PASTA = process.argv[2] || "/Volumes/StaziaMed/.tmp-aulas/notificacoes";
const SAIDA = path.join(PASTA, "capturas");
const SO = process.env.SO || "";
fs.mkdirSync(SAIDA, { recursive: true });

const post = async (url, body, token) => {
  const r = await fetch(`${BASE}${url}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${url}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
};
const rpc = async (token, fn, args = {}) => (await post("/api/dev-db/rpc", { fn, args }, token)).data;
const entrar = async (email) => (await post("/api/dev-db/auth/signin", { email, password: "Senha-forte-123" })).token;

const VARIANTES = [
  ["celular", { width: 390, height: 844 }, "claro"],
  ["celular", { width: 390, height: 844 }, "escuro"],
  ["computador", { width: 1440, height: 900 }, "claro"],
  ["computador", { width: 1440, height: 900 }, "escuro"],
].filter(([t, , tema]) => !SO || SO === `${t}-${tema}`);

const ana = await entrar("aluno-notificacoes@previa.dev");
const carla = await entrar("aluno-muitas@previa.dev");
const bruno = await entrar("aluno-vazio@previa.dev");
const admin = await entrar("admin-previa@previa.dev");
const erros = [];
const lista = [];
const browser = await chromium.launch();
for (const [tam, vp, tema] of VARIANTES) {
  const ctxDe = async (token) => {
    await rpc(token, "app_update_profile", { p_patch: { theme: tema === "escuro" ? "dark" : "light" } });
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, colorScheme: tema === "escuro" ? "dark" : "light", locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    await ctx.addInitScript((t) => localStorage.setItem("smn-dev-token", t), token);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => !/WebSocket/.test(e.message) && erros.push(`[${tam}-${tema}] ${e.message}`)); // o aviso do WebSocket é do recarregamento automático do Vite (desligado na prévia)
    return { ctx, page };
  };
  let n = 0;
  const foto = async (page, nome, legenda) => {
    n += 1;
    const arq = `${tam}-${tema}-${String(n).padStart(2, "0")}-${nome}.png`;
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SAIDA, arq) });
    lista.push({ tam, tema, nome, legenda, arq });
  };

  // 1) Ana: o pop-up de cobrança aparece por cima; "Entendi" conta como lido também no sino
  {
    await post("/previa/nao-lidas", { email: "aluno-notificacoes@previa.dev" });
    const { ctx, page } = await ctxDe(ana);
    await page.goto(`${BASE}/novo/`);
    await page.getByTestId("avisos-popup").waitFor({ timeout: 90000 });
    await foto(page, "popup-cobranca", "Ao abrir o app: o pop-up do aviso urgente de cobrança (o sino atrás já conta 3 não lidas)");
    await page.getByRole("button", { name: "Entendi" }).click();
    await page.getByRole("button", { name: "Notificações, 2 não lidas" }).waitFor({ timeout: 30000 });
    await foto(page, "sino-fechado", "Sino fechado: depois do “Entendi” no pop-up, a bolinha cai de 3 para 2 (lido no pop-up = lido na Central)");
    await page.getByTestId("sino").click();
    await page.getByTestId("painel-notificacoes").waitFor();
    await foto(page, "painel-aberto", "Painel aberto: do mais novo para o mais antigo, ícone por tipo, data relativa e botão de ação");
    await page.keyboard.press("Escape");
    // o sino em outra tela (computador: cabeçalho das telas; celular: barra “‹ Mais | Título”)
    await page.goto(`${BASE}/novo/${tam === "celular" ? "desempenho" : "questoes"}`);
    await page.getByTestId("sino").waitFor({ timeout: 60000 });
    await foto(page, "sino-outra-tela", tam === "celular" ? "Sino na barra “‹ Mais | Título” (Desempenho)" : "Sino no cabeçalho das outras telas (Banco de Questões)");
    await ctx.close();
  }
  // 2) Carla: aviso URGENTE no pop-up e no topo do painel; 12 não lidas → 9+; "Marcar todas como lidas" não cala o urgente
  {
    await post("/previa/nao-lidas", { email: "aluno-muitas@previa.dev", tudo: true });
    const { ctx, page } = await ctxDe(carla);
    await page.goto(`${BASE}/novo/`);
    await page.getByTestId("avisos-popup").waitFor({ timeout: 90000 });
    await foto(page, "popup-urgente", "Aviso urgente (a renovação no cartão não passou): volta a cada abertura do app até o aluno pagar");
    await page.getByRole("button", { name: "Entendi" }).click();
    await page.getByTestId("sino-bolinha").waitFor({ timeout: 30000 });
    await foto(page, "sino-9-mais", "Sino em destaque (vermelho) com aviso urgente; mais de 9 não lidas: a bolinha mostra 9+");
    await page.getByTestId("sino").click();
    await page.getByTestId("painel-notificacoes").waitFor();
    await foto(page, "painel-muitas", "Painel: o urgente vem primeiro, com o selo “Urgente”; os outros rolam dentro do painel");
    await page.getByRole("button", { name: /Marcar todas como lidas/ }).click();
    await foto(page, "painel-urgente-fica", "Depois de “Marcar todas como lidas”: o urgente continua não lido (bolinha 1) até o pagamento");
    await ctx.close();
  }
  // 3) Bruno: estado vazio
  {
    const { ctx, page } = await ctxDe(bruno);
    await page.goto(`${BASE}/novo/`);
    await page.getByRole("button", { name: "Notificações, nenhuma não lida" }).waitFor({ timeout: 90000 });
    await page.getByTestId("sino").click();
    await page.getByTestId("notificacoes-vazio").waitFor();
    await foto(page, "painel-vazio", "Sem notificações: estado vazio");
    await ctx.close();
  }
  // 4) Administração > Comunicados (a equipe não tem o sino de aluno)
  {
    const { ctx, page } = await ctxDe(admin);
    await page.goto(`${BASE}/novo/admin?aba=comunicados`);
    await page.getByTestId("admin-comunicados").waitFor({ timeout: 90000 });
    if (await page.getByTestId("sino").count()) erros.push(`[${tam}-${tema}] o sino apareceu para o administrador`);
    await foto(page, "admin-comunicados", "Administração > Comunicados: escrever, escolher para quem, e os enviados com quem enviou e quantos leram");
    await page.getByLabel("Título").fill("Plantão de dúvidas ao vivo");
    await page.getByLabel("Texto").fill("Quinta, às 20h, a equipe responde dúvidas de Clínica Médica. Traga suas questões erradas.");
    await page.getByLabel("Link (opcional)").fill("/atualizacoes");
    await page.getByRole("radio", { name: "Um plano" }).click();
    await page.getByRole("button", { name: /Ver prévia/ }).click();
    await page.getByTestId("previa-comunicado").waitFor();
    await page.getByTestId("previa-comunicado").scrollIntoViewIfNeeded();
    await foto(page, "admin-comunicado-previa", "Prévia antes de enviar: como o aluno vê no sino e quantos alunos recebem");
    await ctx.close();
  }
}
await browser.close();

// página de comparação
const grupos = ["celular-claro", "celular-escuro", "computador-claro", "computador-escuro"];
const nomes = [...new Set(lista.map((x) => x.nome))];
const cel = (x) => (x ? `<figure><img src="capturas/${x.arq}" loading="lazy" alt="${x.legenda}"><figcaption>${x.tam} · ${x.tema}</figcaption></figure>` : "<figure><i>—</i></figure>");
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Central de Notificações · capturas</title>
<style>body{font:15px/1.5 system-ui;margin:0;padding:24px 16px;background:#f4f6fa;color:#0d1c42}h1{margin:0 0 4px}section{margin:28px 0}h2{font-size:17px;margin:0 0 10px}
.linha{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;align-items:start}figure{margin:0;background:#fff;border:1px solid #dde3ee;border-radius:12px;padding:8px}
img{width:100%;height:auto;display:block;border-radius:6px}figcaption{font-size:12.5px;color:#5b6778;margin-top:6px}</style>
<h1>Central de Notificações do aluno</h1><p>Prévia local (banco PGlite, ramo <code>notificacoes</code>). Gerado em ${new Date().toLocaleString("pt-BR")}. ${erros.length ? `<b style="color:#c9302c">Erros: ${erros.join(" · ")}</b>` : "Sem erros na página."}</p>
${nomes.map((nome) => {
  const de = lista.filter((x) => x.nome === nome);
  return `<section><h2>${de[0].legenda}</h2><div class="linha">${grupos.map((g) => cel(de.find((x) => `${x.tam}-${x.tema}` === g))).join("")}</div></section>`;
}).join("\n")}
</html>`;
fs.writeFileSync(path.join(PASTA, "comparar.html"), html);
console.log(`ok: ${lista.length} capturas em ${SAIDA}; comparar.html pronto.${erros.length ? ` ERROS: ${erros.join(" | ")}` : ""}`);
