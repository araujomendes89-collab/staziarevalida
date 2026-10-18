// Teste de tela da conversa por voz (prévia com servidor, ponte e microfone simulados), com capturas.
// Uso (da raiz, com a prévia no ar): PLAYWRIGHT_BROWSERS_PATH=/Volumes/StaziaMed/.tmp-aulas/pw-browsers \
//   node scripts/previa-voz-natural/teste.mjs <pasta-de-saida> [cenario ...]
// Para cada cenário roda o iPhone (WebKit, 390×844, toque) e o computador (Chromium, 1440×900) e grava resultado.json.
import { chromium, devices, webkit } from "playwright";
import fs from "node:fs";
import path from "node:path";

const saida = process.argv[2] ?? "/Volumes/StaziaMed/.tmp-aulas/voz-natural/depois";
const cenarios = process.argv.slice(3).length ? process.argv.slice(3) : ["aovivo"];
const BASE = process.env.PREVIA ?? "http://127.0.0.1:31977/";
const extra = process.env.EXTRA ?? "";
fs.mkdirSync(saida, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const resultado = [];

const perfis = [
  { nome: "iphone", tipo: webkit, ctx: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } } },
  { nome: "computador", tipo: chromium, ctx: { viewport: { width: 1440, height: 900 } } },
];

/** Confere se o personagem cobre algum texto visível da tela de voz (retângulos que se cruzam). */
async function sobreposicoes(page) {
  return page.evaluate(() => {
    const boneco = document.querySelector(".svm__stage .tp, .svm__stage canvas, .svm__stage img, .svm__stage svg, .svm__stage > *");
    if (!boneco) return [];
    const b = boneco.getBoundingClientRect();
    const textos = [...document.querySelectorAll(".svm p, .svm h2, .svm__captions, .svm__legenda, .svm__aviso, .svm__status")].filter((el) => el.textContent.trim() && el.offsetParent !== null);
    return textos
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width && r.height && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top && !(r.bottom <= b.top + 2 || r.top >= b.bottom - 2))
      .map(({ el, r }) => ({ classe: el.className, texto: el.textContent.trim().slice(0, 60), alto: Math.round(r.top), baixo: Math.round(r.bottom), bonecoAlto: Math.round(b.top), bonecoBaixo: Math.round(b.bottom) }));
  });
}

for (const cenario of cenarios) {
  for (const p of perfis) {
    const browser = await p.tipo.launch();
    const context = await browser.newContext({ ...p.ctx, colorScheme: extra.includes("tema=escuro") ? "dark" : "light" });
    const page = await context.newPage();
    const erros = [];
    page.on("pageerror", (e) => erros.push(String(e.message).slice(0, 200)));
    page.on("console", (m) => m.type() === "error" && erros.push(m.text().slice(0, 200)));
    const r = { cenario, perfil: p.nome, passos: {} };
    const sufixo = extra.replace(/[^a-z0-9=]+/gi, "_").replace(/=/g, "-").replace(/^_|_$/g, "");
    const foto = async (nome) => page.screenshot({ path: path.join(saida, `${cenario}${sufixo ? `-${sufixo}` : ""}-${p.nome}-${nome}.png`) });
    const botoes = async () => (await page.locator(".svm button:visible").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    try {
      await page.goto(`${BASE}?cenario=${cenario}${extra}`, { waitUntil: "domcontentloaded" });
      const comecar = page.getByRole("button", { name: /^Começar com/ });
      await comecar.waitFor({ timeout: 30_000 });
      await foto("1-entrada");
      if (p.nome === "iphone") await comecar.tap();
      else await comecar.click();
      await page.locator(".svm").waitFor({ timeout: 15_000 });
      await wait(1200);
      await foto("2-abrindo");
      r.passos.abrindo = { botoes: await botoes(), titulo: await page.locator("#svm-title").innerText().catch(() => null), selo: await page.locator(".svm__top").innerText().catch(() => null), cobre: await sobreposicoes(page) };
      await wait(2200);
      // o aluno fala (microfone falso): sem tocar em nada
      await page.evaluate(() => window.__falar(1600));
      await wait(900);
      await foto("3-aluno-falando");
      await wait(2200);
      await foto("4-professor-responde");
      r.passos.respondendo = { estado: await page.locator(".svm__status").innerText().catch(() => null), botoes: await botoes(), cobre: await sobreposicoes(page) };
      // fala por cima do professor
      await page.evaluate(() => window.__falar(900));
      await wait(1800);
      r.passos.interrupcao = await page.evaluate(() => ({ interrupcoes: window.__voz.interrupcoes, falas: window.__voz.falasAluno, quadros: window.__voz.quadros, gravacoes: window.__voz.gravacoes, microfone: window.__voz.microfone, textos: window.__voz.textos }));
      r.passos.avisos = await page.locator(".svm__aviso").allInnerTexts().catch(() => []);
      // modo reserva com o medidor do navegador parado: um toque acorda o som e a conversa segue sozinha
      const acordar = page.getByRole("button", { name: /Toque para eu voltar a te ouvir|Terminei de falar/ });
      if (await acordar.count()) {
        await foto("3b-medidor-parado");
        r.passos.medidor = { botao: await acordar.first().innerText() };
        await page.evaluate(() => window.__consertarMedidor?.());
        await acordar.first().click();
        await page.evaluate(() => window.__falar(1400));
        await wait(4000);
        r.passos.medidor.gravacoesDepois = await page.evaluate(() => window.__voz.gravacoes);
      }
      // o Chat aberto sozinho (microfone bloqueado) cobre a tela: fecha para seguir
      if (await page.locator(".svm__sheet").count()) {
        await foto("3c-chat-aberto");
        await page.keyboard.press("Escape");
        await wait(300);
      }
      // legendas (acessibilidade): liga e confere que não fica atrás do personagem
      const legendas = page.getByRole("button", { name: /Legendas/ });
      if (await legendas.count()) {
        await legendas.first().click();
        await page.evaluate(() => window.__falar(800));
        await wait(2500);
        await foto("5-com-legendas");
        r.passos.legendas = { cobre: await sobreposicoes(page), texto: await page.locator(".svm__legenda").innerText().catch(() => null) };
        await legendas.first().click();
      }
      await page.getByRole("button", { name: /Encerrar/ }).first().click();
      await page.locator(".nx-summary, .nx-fim").first().waitFor({ timeout: 20_000 });
      await wait(1500);
      await foto("6-fim");
      r.passos.fim = { texto: (await page.locator(".nx-summary, .nx-fim").first().innerText()).slice(0, 600) };
    } catch (e) {
      r.falha = String(e.message).slice(0, 300);
      await foto("x-falha").catch(() => {});
    }
    r.erros = erros;
    resultado.push(r);
    await browser.close();
  }
}
fs.writeFileSync(path.join(saida, `resultado-${cenarios.join("+")}${extra.replace(/[^a-z0-9]+/gi, "_")}.json`), JSON.stringify(resultado, null, 2));
console.log(JSON.stringify(resultado.map((x) => ({ c: x.cenario, p: x.perfil, falha: x.falha ?? null, erros: x.erros.length })), null, 0));
