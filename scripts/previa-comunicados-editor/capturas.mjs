// Capturas de Comunicados: editar, apagar e editor profissional (013940). Precisa do servidor:
//   npx tsx scripts/previa-comunicados-editor/servidor.ts
// Celular 390x844 e computador 1440x900: lista com Editar/Apagar, edição com o editor, confirmação de apagar (e o Desfazer),
// filtro Apagados e o sino do aluno com o comunicado formatado e "editado".
// Uso: node scripts/previa-comunicados-editor/capturas.mjs [pasta]   (padrão /Volumes/StaziaMed/.tmp-aulas/comunicados-editor)
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:31994";
const PASTA = process.argv[2] || "/Volumes/StaziaMed/.tmp-aulas/comunicados-editor";
fs.mkdirSync(PASTA, { recursive: true });

const post = async (url, body, token) => {
  const r = await fetch(`${BASE}${url}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${url}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
};
const entrar = async (email) => (await post("/api/dev-db/auth/signin", { email, password: "Senha-forte-123" })).token;

const admin = await entrar("admin-comunicados@previa.dev");
const ana = await entrar("aluna-comunicados@previa.dev");
const erros = [];
const browser = await chromium.launch();
for (const [tam, vp] of [["computador", { width: 1440, height: 900 }], ["celular", { width: 390, height: 844 }]]) {
  const novo = async (token) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, colorScheme: "light", locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    await ctx.addInitScript((t) => localStorage.setItem("smn-dev-token", t), token);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => !/WebSocket/.test(e.message) && erros.push(`[${tam}] ${e.message}`));
    page.on("dialog", (d) => (erros.push(`[${tam}] janela do navegador: ${d.message()}`), d.dismiss()));
    return { ctx, page };
  };
  const foto = async (page, nome, alvo) => {
    await page.waitForTimeout(600);
    const arq = path.join(PASTA, `${tam}-${nome}.png`);
    if (alvo) await alvo.screenshot({ path: arq });
    else await page.screenshot({ path: arq });
    console.log(arq);
  };

  // Administração
  {
    const { ctx, page } = await novo(admin);
    await page.goto(`${BASE}/novo/admin?aba=comunicados`);
    const lista = page.getByRole("list", { name: "Comunicados enviados" });
    await lista.waitFor({ timeout: 120000 });
    await lista.scrollIntoViewIfNeeded();
    await foto(page, "01-lista-editar-apagar");
    // edição com o editor (o comunicado formatado e já editado)
    const item = lista.locator("li").filter({ hasText: "novo horário" });
    await item.getByRole("button", { name: /^Editar/ }).click();
    await item.getByTestId("editar-comunicado").waitFor();
    // a barra do editor aparece quando o campo está em foco (campo compacto)
    await item.locator(".ProseMirror").first().click({ timeout: 60000 });
    await item.getByRole("toolbar", { name: "Ferramentas do editor" }).waitFor({ timeout: 60000 }).catch(() => erros.push(`[${tam}] barra do editor não apareceu`));
    if (tam === "celular") {
      // celular: a tela como o dono vê (a foto do bloco inteiro emendaria a barra de baixo no meio)
      await item.getByText("Texto", { exact: true }).evaluate((el) => (el.scrollIntoView({ block: "start" }), window.scrollBy(0, -16)));
      await foto(page, "02-edicao-com-editor");
      await item.getByTestId("editar-comunicado").locator(".ntf-previa-caixa").evaluate((el) => el.scrollIntoView({ block: "center" }));
      await foto(page, "02b-edicao-previa-e-botoes");
    } else {
      await item.getByTestId("editar-comunicado").scrollIntoViewIfNeeded();
      await foto(page, "02-edicao-com-editor", item.getByTestId("editar-comunicado"));
    }
    await item.getByRole("button", { name: "Cancelar" }).click();
    // edição de um comunicado que alguém já leu: público fixo
    const lido = lista.locator("li").filter({ hasText: "Boas-vindas" });
    await lido.getByRole("button", { name: /^Editar/ }).click();
    await lido.getByTestId("publico-fixo").scrollIntoViewIfNeeded();
    await foto(page, "03-edicao-publico-fixo", lido.getByTestId("editar-comunicado"));
    await lido.getByRole("button", { name: "Cancelar" }).click();
    // apagar: confirmação na própria página
    await lido.getByRole("button", { name: /^Apagar/ }).click();
    await lido.getByTestId("confirmar-apagar").waitFor();
    await lido.getByLabel("Motivo (opcional)").fill("Texto antigo; vou mandar um novo");
    // a caixa de confirmação no alto da tela (no celular, a barra de baixo cobriria o botão)
    await lido.evaluate((el) => (el.scrollIntoView({ block: "start" }), window.scrollBy(0, -16)));
    await foto(page, "04-confirmar-apagar");
    await lido.getByRole("button", { name: "Apagar comunicado" }).click();
    await page.getByTestId("barra-desfazer").waitFor();
    await page.getByTestId("barra-desfazer").scrollIntoViewIfNeeded();
    await foto(page, "05-apagado-com-desfazer");
    await page.getByTestId("barra-desfazer").getByRole("button", { name: "Desfazer" }).click();
    await page.getByText("voltou para o sino dos alunos").waitFor();
    // filtro Apagados
    await page.getByRole("radio", { name: "Apagados" }).click();
    await page.getByRole("list", { name: "Comunicados apagados" }).waitFor();
    await page.getByRole("list", { name: "Comunicados apagados" }).scrollIntoViewIfNeeded();
    await foto(page, "06-filtro-apagados");
    await ctx.close();
  }
  // Aluno: sino com o comunicado formatado e "editado"
  {
    const { ctx, page } = await novo(ana);
    await page.goto(`${BASE}/novo/`);
    await page.getByTestId("sino").waitFor({ timeout: 120000 });
    await page.getByTestId("sino").click();
    const painel = page.getByTestId("painel-notificacoes");
    await painel.waitFor();
    await painel.getByTestId("selo-editado").first().waitFor({ timeout: 30000 });
    await foto(page, "07-sino-aluno-formatado-editado");
    if (await painel.getByText("Aula ao vivo hoje (data errada)").count()) erros.push(`[${tam}] o comunicado apagado apareceu no sino`);
    await ctx.close();
  }
}
await browser.close();
if (erros.length) {
  console.error("PROBLEMAS:\n" + erros.join("\n"));
  process.exit(1);
}
console.log("capturas ok");
