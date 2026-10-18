// Gera a imagem de compartilhamento da página inicial (WhatsApp, redes, Google): public/brand/compartilhar-inicio.jpg, 1200×630.
// Monta a arte com os arquivos do próprio projeto (logo para fundo escuro, lontra de braços cruzados, fontes da página) e fotografa
// com o Chromium do Playwright. Uso: node scripts/inicio/imagem-compartilhar.cjs   (depois: conferir a imagem e fazer o commit)
// Texto fixo e sempre verdadeiro (sem preço, teste grátis ou recurso que dependa do que está ligado no app).
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const raiz = path.resolve(__dirname, "../..");
const url = (rel) => "file://" + path.join(raiz, rel).split(path.sep).map(encodeURIComponent).join("/");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"BC";font-weight:700;src:url("${url("src/novo/app/auth/fonts/barlow-condensed-700.woff2")}")}
@font-face{font-family:"PJ";font-weight:400 800;src:url("${url("src/inicio/fonts/plus-jakarta-sans-latin.woff2")}")}
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{position:relative;font-family:PJ,sans-serif;color:#fff;background:radial-gradient(900px 500px at 15% 10%,rgba(0,157,254,.28),transparent 60%),radial-gradient(700px 500px at 90% 100%,rgba(10,111,216,.35),transparent 60%),linear-gradient(160deg,#052a5a,#031a3a 70%)}
.txt{position:absolute;left:80px;top:92px;width:700px}.logo{width:420px;display:block}
h1{font-family:BC,sans-serif;font-weight:700;font-size:92px;line-height:.98;margin:56px 0 24px}
p{font-size:30px;line-height:1.35;font-weight:600;color:#CFE4FF;margin:0}.lontra{position:absolute;right:70px;bottom:0;height:590px}
</style></head><body><div class="txt"><img class="logo" src="${url("public/brand/horizontal-escuro-1280w.png")}" alt="">
<h1>Estude, treine<br>e dispute.</h1><p>Preparação para o Revalida INEP<br>e o ENAMED</p></div>
<img class="lontra" src="${url("src/inicio/img/lontra-bracos-cruzados-460w.webp")}" alt=""></body></html>`;

(async () => {
  const pasta = fs.mkdtempSync(path.join(raiz, ".imagem-compartilhar-"));
  try {
    const arqHtml = path.join(pasta, "arte.html");
    const arqPng = path.join(pasta, "arte.png");
    fs.writeFileSync(arqHtml, html);
    const navegador = await chromium.launch();
    const pagina = await navegador.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await pagina.goto("file://" + arqHtml);
    await pagina.evaluate(() => document.fonts.ready);
    await pagina.screenshot({ path: arqPng, type: "png" });
    await navegador.close();
    // JPEG leve (o WhatsApp não mostra imagem grande): sips é do próprio macOS
    const destino = path.join(raiz, "public/brand/compartilhar-inicio.jpg");
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", arqPng, "--out", destino], { stdio: "ignore" });
    console.log("pronto:", destino, fs.statSync(destino).size, "bytes");
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
})();
