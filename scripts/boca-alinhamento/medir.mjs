// Bancada do encaixe da boca (17/10/2026): mede, no navegador, quanto a boca sai do lugar em relação à boca aberta original.
// Precisa da prévia dos personagens no ar: npx vite --config scripts/previa-personagens/vite.config.mjs (porta 31994).
// Uso: node scripts/boca-alinhamento/medir.mjs <rotulo> [pasta de saída]   (PORTA=31995 para medir outra prévia)
//
// Para cada personagem (Stazi, Stazia), pose com boca (falando, falando bravo) e tamanho (tela de voz, prévia de voz, rosto do Mini
// Tutor; tela de 2x e de 1x, que escolhe a versão "meia" dos sprites), a boca é posta em aberta (1), meia (0,5) e entrando (0,25)
// pelo MESMO desenho do app (aparenciaBoca: opacidade na .tp__boca e escala na parte que dobra) e fotografada com e sem a boca.
// Referência independente do CSS: a pose e o recorte desenhados num canvas a partir dos arquivos e do manifest (boca aberta original).
// Medida: linha de cima da parte que a boca muda (lábio de cima), coluna a coluna no meio da boca, em px de tela (CSS):
//   vs original = (onde a boca começa na tela) − (onde ela começa na boca aberta original desenhada pelos arquivos);
//   lábio mexe  = (onde a boca começa nesta abertura) − (onde ela começa na boca aberta, na mesma tela).
// Na meia boca e entrando, o certo é o lábio de cima ficar parado (só o queixo desce): deslocamento ~0.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const [rotulo = "teste", saida = "/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/boca-alinhamento"] = process.argv.slice(2);
const PASTA = path.join(saida, rotulo);
fs.mkdirSync(PASTA, { recursive: true });
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const PORTA = process.env.PORTA ?? "31994"; // outra prévia (ex.: cópia do código de antes) em outra porta
const POSES = [
  ["stazi", "neutral", "falando"],
  ["stazi", "firm", "falando-bravo"],
  ["stazia", "neutral", "falando"],
  ["stazia", "firm", "falando-brava"],
];
// altura da tela (viewport) que dá a caixa do personagem do tamanho de cada lugar do app na prévia em modo captura
const TAMANHOS = [
  { nome: "tela-voz-2x", vh: 570, dpr: 2 }, // .svm__stage .tp: 480 px
  { nome: "previa-voz-1x", vh: 523, dpr: 1 }, // .palco da prévia de voz: 440 px, monitor comum (usa a versão meia)
  { nome: "mini-2x", vh: 150, dpr: 2 }, // rosto do Mini Tutor: caixa de 123 px (versão meia)
  { nome: "mini-1x", vh: 150, dpr: 1 },
];
const ABERTURAS = [["aberta", 1], ["meia", 0.5], ["entrando", 0.25]];

const browser = await chromium.launch();
const linhas = [];
for (const t of TAMANHOS) {
  for (const [id, emocao, arquivo] of POSES) {
    const page = await browser.newPage({ viewport: { width: 600, height: t.vh }, deviceScaleFactor: t.dpr });
    await page.goto(`http://127.0.0.1:${PORTA}/?captura=fixa&personagem=${id}&estado=speaking&emocao=${emocao}&intensidade=0.3`);
    await page.waitForFunction(() => window.__pronto);
    await page.evaluate(() => window.__setTime(1500));
    await page.waitForFunction(() => {
      const ims = [...document.querySelectorAll(".tp__pose--atual img")];
      return ims.length >= 2 && document.querySelector(".tp__pose--atual .tp__boca") && ims.every((i) => i.complete && i.naturalWidth > 0);
    }, null, { timeout: 30_000 });
    await page.waitForTimeout(300);
    const man = JSON.parse(fs.readFileSync(path.join(RAIZ, `src/novo/app/tutor/personagens/sprites/${id}/manifest.json`), "utf8"));
    const s = man[arquivo];
    // corpo parado (as mesmas contas valem com ele mexendo: boca e pose estão na mesma camada) e caixa do recorte na tela
    const geo = await page.evaluate(async ({ s }) => {
      document.querySelector(".tp__corpo").style.transform = "none";
      const p = document.querySelector(".tp__pose--atual");
      p.style.transform = "none";
      const img = p.querySelector(".tp__img");
      const r = img.getBoundingClientRect();
      const k = r.width / s.w; // px de tela por px lógico
      const bocaImg = [...p.querySelectorAll(".tp__boca img")][0];
      return { x: r.x, y: r.y, k, u: Math.min(document.querySelector(".tp").clientHeight / 820, document.querySelector(".tp").clientWidth / 600), meia: /\.meia\./.test(img.currentSrc || img.src), poseSrc: img.currentSrc || img.src, bocaSrc: bocaImg.currentSrc || bocaImg.src, alturaCaixa: document.querySelector(".tp").clientHeight };
    }, { s });
    const b = s.boca;
    const clip = { x: Math.floor(geo.x + (b.x - 10) * geo.k), y: Math.floor(geo.y + (s.ny - 6) * geo.k), width: Math.ceil((b.w + 20) * geo.k), height: Math.ceil((b.y + b.h - s.ny + 12) * geo.k) };
    const foto = async (nome, abertura) => {
      await page.evaluate(async ({ abertura }) => {
        const { aparenciaBoca } = await import("/@fs" + window.__RAIZ_MOV);
        const p = document.querySelector(".tp__pose--atual");
        const boca = p.querySelector(".tp__boca");
        const a = aparenciaBoca(abertura ?? 0);
        boca.style.opacity = abertura == null ? "0" : String(a.opacidade);
        // a parte que dobra: a nova (.tp__boca-baixo) ou, no desenho antigo, a própria .tp__boca
        const dobra = p.querySelector(".tp__boca-baixo") ?? boca;
        dobra.style.transform = `scaleY(${a.escala})`;
      }, { abertura });
      await page.waitForTimeout(80);
      const buf = await page.screenshot({ clip });
      fs.writeFileSync(path.join(PASTA, `${t.nome}-${id}-${arquivo}-${nome}.png`), buf);
      return buf.toString("base64");
    };
    await page.evaluate((r) => (window.__RAIZ_MOV = r), path.join(RAIZ, "src/novo/app/tutor/personagens/movimento.js"));
    const semBoca = await foto("sem-boca", null);
    const fotos = {};
    for (const [nome, v] of ABERTURAS) fotos[nome] = await foto(nome, v);

    // análise no próprio navegador (decodifica PNG e desenha a referência pelos arquivos)
    const res = await page.evaluate(async ({ semBoca, fotos, geo, s, clip, dpr }) => {
      const carregar = (src) => new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = src; });
      const W = Math.round(clip.width * dpr), H = Math.round(clip.height * dpr);
      const pixels = async (desenhar) => {
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const ctx = c.getContext("2d");
        await desenhar(ctx);
        return ctx.getImageData(0, 0, W, H).data;
      };
      const daFoto = (b64) => pixels(async (ctx) => ctx.drawImage(await carregar("data:image/png;base64," + b64), 0, 0, W, H));
      const b = s.boca;
      const [pose, rec] = await Promise.all([carregar(geo.poseSrc), carregar(geo.bocaSrc)]);
      // referência: pose (e recorte por cima) no mesmo lugar, em px do aparelho, só pelos números do manifest
      const ref = (comBoca) => pixels(async (ctx) => {
        ctx.setTransform(dpr * geo.k, 0, 0, dpr * geo.k, (geo.x - clip.x) * dpr, (geo.y - clip.y) * dpr);
        ctx.drawImage(pose, 0, 0, s.w, s.h);
        if (comBoca) ctx.drawImage(rec, b.x, b.y, b.w, b.h);
      });
      const mudou = (A, B) => { const m = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) { const d = Math.max(Math.abs(A[4 * i] - B[4 * i]), Math.abs(A[4 * i + 1] - B[4 * i + 1]), Math.abs(A[4 * i + 2] - B[4 * i + 2])); m[i] = d > 40 ? 1 : 0; } return m; };
      // por coluna: primeira linha (abaixo do focinho) em que a boca muda a imagem (2 px seguidos, sem ruído de 1 pixel)
      const escala = dpr * geo.k;
      const yFocinho = Math.round((s.ny - (clip.y - geo.y) / geo.k) * escala) + Math.round(3 * escala);
      const cxTela = (s.nx - (clip.x - geo.x) / geo.k) * escala;
      const meiaLarg = 0.12 * b.w * escala;
      const topo = (m) => {
        const out = [];
        for (let x = Math.max(0, Math.round(cxTela - meiaLarg)); x < Math.min(W, Math.round(cxTela + meiaLarg)); x++) {
          let y0 = null;
          for (let y = yFocinho; y < H - 1; y++) if (m[y * W + x] && m[(y + 1) * W + x]) { y0 = y; break; }
          out.push(y0);
        }
        return out;
      };
      const B = await daFoto(semBoca);
      // a referência (boca aberta original pelos arquivos) também vai para a pasta, para conferir a olho e medir fora daqui
      const cRef = document.createElement("canvas"); cRef.width = W; cRef.height = H;
      cRef.getContext("2d").putImageData(new ImageData(await ref(true), W, H), 0, 0);
      const refPng = cRef.toDataURL("image/png").split(",")[1];
      const topoRef = topo(mudou(await ref(true), await ref(false)));
      const out = {};
      const resumo = (a, c) => {
        const dif = a.map((v, i) => (v != null && c[i] != null ? (v - c[i]) / dpr : null)).filter((v) => v != null);
        const abs = dif.map(Math.abs).sort((x, y) => x - y);
        const ord = [...dif].sort((x, y) => x - y);
        return { colunas: dif.length, mediana: ord[Math.floor(ord.length / 2)] ?? null, p90: abs[Math.floor(0.9 * (abs.length - 1))] ?? null, pior: abs.at(-1) ?? null };
      };
      const topos = {};
      for (const [nome, b64] of Object.entries(fotos)) topos[nome] = topo(mudou(await daFoto(b64), B));
      // vsOriginal: contra a boca aberta original (desenhada pelos arquivos); vsAberta: quanto o lábio mexe ao abrir/fechar (mesma tela)
      for (const nome of Object.keys(fotos)) out[nome] = { vsOriginal: resumo(topos[nome], topoRef), vsAberta: resumo(topos[nome], topos.aberta) };
      return { out, refPng };
    }, { semBoca, fotos, geo, s, clip, dpr: t.dpr });
    fs.writeFileSync(path.join(PASTA, `${t.nome}-${id}-${arquivo}-referencia.png`), Buffer.from(res.refPng, "base64"));
    for (const [nome, r] of Object.entries(res.out)) {
      const f = (v) => (v == null ? null : +v.toFixed(2));
      const l = { tamanho: t.nome, personagem: id, pose: arquivo, versao: geo.meia ? "meia" : "cheia", caixa: geo.alturaCaixa, abertura: nome, colunas: r.vsOriginal.colunas,
        original_mediana_px: f(r.vsOriginal.mediana), original_p90_px: f(r.vsOriginal.p90), original_pior_px: f(r.vsOriginal.pior), labio_mexe_mediana_px: f(r.vsAberta.mediana), labio_mexe_p90_px: f(r.vsAberta.p90), labio_mexe_pior_px: f(r.vsAberta.pior) };
      linhas.push(l);
      console.log(`${t.nome.padEnd(14)} ${id.padEnd(6)} ${arquivo.padEnd(14)} ${l.versao.padEnd(5)} ${String(l.caixa).padStart(3)}px ${nome.padEnd(8)} vs original: med ${String(l.original_mediana_px).padStart(5)} p90 ${String(l.original_p90_px).padStart(4)} | lábio mexe: med ${String(l.labio_mexe_mediana_px).padStart(5)} p90 ${String(l.labio_mexe_p90_px).padStart(4)} pior ${String(l.labio_mexe_pior_px).padStart(4)} (${l.colunas} col)`);
    }
    await page.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(PASTA, "medidas.json"), JSON.stringify(linhas, null, 1));
console.log(`\n${PASTA}/medidas.json`);
