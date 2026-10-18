// Tela de questão no iPhone (WebKit): a página nunca pode ficar mais larga que a tela. Ver rodar.sh.
// No iPhone (Safari), qualquer coisa que passe da borda direita — um quadro, uma palavra sem espaço, o cabeçalho, ou até um
// elemento FIXO durante uma animação — deixa a página mais larga e ela passa a rolar para os lados, cortando o relógio, o
// contador e o A+ (defeito do ar em 18/10/2026, Revalida 2020 · Q79). Este teste confere a página e cada elemento.
import fs from "fs";
import path from "path";
import { webkit, devices } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:31979";
const SAIDA = process.env.SAIDA || "/Volumes/StaziaMed/.tmp-aulas/tela-questao-celular";
fs.mkdirSync(SAIDA, { recursive: true });

const APARELHOS = [
  ["iPhone 12", 390, 844],
  ["iPhone SE", 375, 667],
  ["iPhone 14 Pro Max", 430, 932],
];
// q=quadro: quadro como figura + tabela de apoio larga + endereço de site sem espaço + alternativa sem espaço
const CASOS = [
  ["treino", "/?modo=treino&q=quadro&total=20"],
  ["simulado", "/?modo=simulado&q=quadro&total=20"],
  ["treino-tabela", "/?modo=treino&q=tabela&total=20"],
];

// vigia (a cada 50 ms, desde o carregamento): a maior sobra da página e de qualquer elemento fora de um quadro que rola/corta
function vigia() {
  window.__sobra = { pagina: 0, itens: {} };
  const olhar = () => {
    const de = document.documentElement;
    if (!de || !document.body) return;
    const iw = window.innerWidth;
    window.__sobra.pagina = Math.max(window.__sobra.pagina, de.scrollWidth - iw);
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const sai = Math.max(r.right - iw, -r.left);
      if (sai <= 1) continue;
      let preso = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) {
          preso = true;
          break;
        }
      }
      // texto só para leitor de tela (1 px fora da tela de propósito)
      if (preso || (r.width <= 1 && r.height <= 1)) continue;
      const nome = `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className ?? "").trim().split(/\s+/).slice(0, 2).join(".")}`;
      window.__sobra.itens[nome] = Math.max(window.__sobra.itens[nome] ?? 0, Math.round(sai));
    }
  };
  setInterval(olhar, 50);
}

const falhas = [];
const browser = await webkit.launch();
try {
  for (const [nome, w, h] of APARELHOS) {
    for (const [caso, rota] of CASOS) {
      const ctx = await browser.newContext({ ...devices[nome], viewport: { width: w, height: h } });
      await ctx.addInitScript(vigia);
      const page = await ctx.newPage();
      await page.goto(BASE + rota);
      await page.locator(".tq-alts").waitFor({ timeout: 60000 });
      const conferir = async (etapa) => {
        await page.waitForTimeout(1500); // animações de entrada (aba do mini tutor, comemorações) terminam
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, sobra: window.__sobra }));
        const onde = `${caso} ${w}×${h} ${etapa}`;
        await page.screenshot({ path: path.join(SAIDA, `${caso}-${w}x${h}-${etapa}.png`) });
        if (m.sw > m.iw) falhas.push(`${onde}: a página tem ${m.sw} px numa tela de ${m.iw} px`);
        if (m.sobra.pagina > 0) falhas.push(`${onde}: em algum momento a página passou ${m.sobra.pagina} px da tela`);
        for (const [el, px] of Object.entries(m.sobra.itens)) falhas.push(`${onde}: ${el} passou ${px} px da borda`);
        await page.evaluate(() => {
          window.__sobra = { pagina: 0, itens: {} };
        });
        console.log(`${onde}: scrollWidth ${m.sw} · innerWidth ${m.iw}`);
      };
      await conferir("normal");
      await page.locator(".tq-fs button[data-plus=true]").click();
      await conferir("A+");
      // responde (a correção aparece no cartão) e confere de novo
      await page.locator(".tq-alts [role=radio]").first().click();
      const confirmar = page.locator(".tq-primary", { hasText: /Confirmar resposta|Próxima|Responder/ }).first();
      if (await confirmar.isVisible()) await confirmar.click();
      await conferir("respondida");
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
if (falhas.length) {
  console.error(`\nFALHOU (${falhas.length}):\n- ` + falhas.join("\n- "));
  process.exit(1);
}
console.log(`\nOK: nenhuma tela de questão ficou mais larga que o iPhone (capturas em ${SAIDA}).`);
