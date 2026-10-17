// Bancada do encaixe dos olhos na piscada (17/10/2026): mede, no navegador, o que a piscada mexe FORA dos olhos (sobrancelhas que
// pulam, boca que troca) e se os olhos fechados caem no lugar dos olhos da pose.
// Precisa da prévia dos personagens no ar: npx vite --config scripts/previa-personagens/vite.config.mjs (porta 31994).
// Uso: node scripts/olhos-alinhamento/medir.mjs <rotulo> [pasta de saída]   (PORTA=31995 para medir outra prévia)
//
// Para cada personagem, pose com piscada (base, falando, ouvindo) e tamanho (tela de voz 2x, prévia de voz em monitor comum com a
// versão "meia" dos desenhos, rosto do Mini Tutor 2x), a piscada é posta em aberto (0), meio (0,5) e fechado (1) pela opacidade do
// recorte (o mesmo que o quadro faz) e fotografada. As zonas dos olhos vêm do manifest (olhos.zonas).
// Medidas (px de tela, CSS):
//   sobrancelha = quanto a sobrancelha acima de cada olho se desloca entre aberto e fechado (busca do melhor encaixe, em px do aparelho);
//   fora = área (px²) que muda FORA dos olhos ao piscar (sobrancelhas, boca, pelo);
//   olho = desvio dos olhos fechados contra o recorte desenhado direto dos arquivos, dentro do olho (o recorte está no lugar?).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const [rotulo = "teste", saida = "/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/olhos-alinhamento"] = process.argv.slice(2);
const PASTA = path.join(saida, rotulo);
fs.mkdirSync(PASTA, { recursive: true });
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORTA = process.env.PORTA ?? "31994";

// estado da prévia que mostra cada pose com piscada
const POSES = [
  ["base", "idle"],
  ["falando", "speaking"],
  ["ouvindo", "listening"],
];
const TAMANHOS = [
  { nome: "tela-voz-2x", vh: 570, dpr: 2 },
  { nome: "previa-voz-1x", vh: 523, dpr: 1 },
  { nome: "mini-2x", vh: 150, dpr: 2 },
];
const PISCADA = [["aberto", 0], ["meio", 0.5], ["fechado", 1]];

const browser = await chromium.launch();
const linhas = [];
for (const t of TAMANHOS) {
  for (const id of ["stazi", "stazia"]) {
    for (const [arquivo, estado] of POSES) {
      const page = await browser.newPage({ viewport: { width: 600, height: t.vh }, deviceScaleFactor: t.dpr });
      await page.goto(`http://127.0.0.1:${PORTA}/?captura=fixa&personagem=${id}&estado=${estado}&emocao=neutral&intensidade=0.3`);
      await page.waitForFunction(() => window.__pronto);
      await page.evaluate(() => window.__setTime(4000));
      await page.waitForFunction(() => {
        const ims = [...document.querySelectorAll(".tp__pose--atual img")];
        return ims.some((i) => /olhos/.test(i.src)) && ims.every((i) => i.complete && i.naturalWidth > 0);
      }, null, { timeout: 30_000 });
      await page.waitForTimeout(300);
      const man = JSON.parse(fs.readFileSync(path.join(RAIZ, `src/novo/app/tutor/personagens/sprites/${id}/manifest.json`), "utf8"));
      const s = man[arquivo];
      const o = s.olhos;
      const geo = await page.evaluate(({ s }) => {
        document.querySelector(".tp__corpo").style.transform = "none";
        const p = document.querySelector(".tp__pose--atual");
        p.style.transform = "none";
        const boca = p.querySelector(".tp__boca");
        if (boca) boca.style.opacity = "0";
        const img = p.querySelector(".tp__img");
        const r = img.getBoundingClientRect();
        const ol = [...p.querySelectorAll("img")].find((i) => /olhos/.test(i.src));
        return { x: r.x, y: r.y, k: r.width / s.w, poseSrc: img.currentSrc || img.src, olhosSrc: ol.currentSrc || ol.src, pose: p.dataset.pose, meia: /\.meia\./.test(img.src), caixa: document.querySelector(".tp").clientHeight };
      }, { s });
      const clip = { x: Math.floor(geo.x + (o.x - 8) * geo.k), y: Math.floor(geo.y + (o.y - 8) * geo.k), width: Math.ceil((o.w + 16) * geo.k), height: Math.ceil((o.h + 16) * geo.k) };
      const fotos = {};
      for (const [nome, v] of PISCADA) {
        await page.evaluate((v) => {
          const ol = [...document.querySelectorAll(".tp__pose--atual img")].find((i) => /olhos/.test(i.src));
          ol.style.opacity = String(v);
        }, v);
        await page.waitForTimeout(80);
        const buf = await page.screenshot({ clip });
        fs.writeFileSync(path.join(PASTA, `${t.nome}-${id}-${arquivo}-${nome}.png`), buf);
        fotos[nome] = buf.toString("base64");
      }
      const res = await page.evaluate(async ({ fotos, geo, s, clip, dpr }) => {
        const o = s.olhos;
        const carregar = (src) => new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = src; });
        const W = Math.round(clip.width * dpr), H = Math.round(clip.height * dpr);
        const pixels = async (desenhar) => { const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"); await desenhar(x); return x.getImageData(0, 0, W, H).data; };
        const daFoto = (b64) => pixels(async (x) => x.drawImage(await carregar("data:image/png;base64," + b64), 0, 0, W, H));
        const [pose, rec] = await Promise.all([carregar(geo.poseSrc), carregar(geo.olhosSrc)]);
        const ref = await pixels(async (x) => {
          x.setTransform(dpr * geo.k, 0, 0, dpr * geo.k, (geo.x - clip.x) * dpr, (geo.y - clip.y) * dpr);
          x.drawImage(pose, 0, 0, s.w, s.h);
          x.drawImage(rec, o.x, o.y, o.w, o.h);
        });
        const cRef = document.createElement("canvas"); cRef.width = W; cRef.height = H;
        cRef.getContext("2d").putImageData(new ImageData(ref, W, H), 0, 0);
        const refPng = cRef.toDataURL("image/png").split(",")[1];
        const A0 = await daFoto(fotos.aberto), A1 = await daFoto(fotos.fechado), Am = await daFoto(fotos.meio);
        // px do aparelho de um ponto lógico do recorte
        const e = dpr * geo.k;
        const px = (lx, ly) => [(o.x + lx) * e - (clip.x - geo.x) * dpr, (o.y + ly) * e - (clip.y - geo.y) * dpr];
        const zonas = (o.zonas ?? []).map((z) => { const [cx, cy] = px(z.cx, z.cy); return { cx, cy, rx: z.rx * e, ry: z.ry * e }; });
        const raio = (x, y) => Math.min(...zonas.map((z) => Math.hypot((x - z.cx) / z.rx, (y - z.cy) / z.ry)));
        const dif = (P, Q, i) => Math.max(Math.abs(P[4 * i] - Q[4 * i]), Math.abs(P[4 * i + 1] - Q[4 * i + 1]), Math.abs(P[4 * i + 2] - Q[4 * i + 2]));
        // melhor deslocamento inteiro (px do aparelho) de Q para encaixar em P, dentro da máscara
        const encaixe = (P, Q, mask, R = 12) => {
          // começa no "não mexeu" e só troca por um encaixe claramente melhor (empate em região lisa não inventa deslocamento)
          let melhor = { e: Infinity, dx: 0, dy: 0 };
          const passos = [[0, 0]];
          for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx || dy) passos.push([dx, dy]);
          let primeiro = true;
          for (const [dx, dy] of passos) {
            let s2 = 0, n = 0;
            for (const i of mask) { const x = i % W, y = (i / W) | 0; const xq = x - dx, yq = y - dy; if (xq < 0 || yq < 0 || xq >= W || yq >= H) continue; const j = yq * W + xq; for (let c = 0; c < 3; c++) { const d = P[4 * i + c] - Q[4 * j + c]; s2 += d * d; } n++; }
            const v = s2 / Math.max(1, n);
            if (primeiro) {
              primeiro = false;
              melhor = { e: v, dx, dy };
              if (v < 30) break; // a região não mudou (diferença média < ~3 tons): não há deslocamento a procurar
              continue;
            }
            if (v < melhor.e * 0.98 - 0.5) melhor = { e: v, dx, dy };
          }
          return { dx: melhor.dx / dpr, dy: melhor.dy / dpr };
        };
        const out = { sobrancelha: [], olho: [], fora: {} };
        for (const z of zonas) {
          // faixa acima de cada olho (a sobrancelha), fora da zona
          const m = [];
          for (let y = Math.max(0, Math.round(z.cy - 2.1 * z.ry)); y < Math.round(z.cy - 0.95 * z.ry); y++) for (let x = Math.max(0, Math.round(z.cx - 0.9 * z.rx)); x < Math.min(W, Math.round(z.cx + 0.9 * z.rx)); x++) if (raio(x, y) > 1) m.push(y * W + x);
          out.sobrancelha.push(m.length > 50 ? encaixe(A0, A1, m, Math.round(6 * dpr)) : null);
          // dentro do olho: fechado na tela × recorte desenhado pelos arquivos
          const mo = [];
          for (let y = Math.max(0, Math.round(z.cy - z.ry)); y < Math.min(H, Math.round(z.cy + z.ry)); y++) for (let x = Math.max(0, Math.round(z.cx - z.rx)); x < Math.min(W, Math.round(z.cx + z.rx)); x++) if (Math.hypot((x - z.cx) / z.rx, (y - z.cy) / z.ry) < 0.75) mo.push(y * W + x);
          out.olho.push(encaixe(A1, ref, mo, Math.round(3 * dpr)));
        }
        for (const [nome, A] of [["meio", Am], ["fechado", A1]]) {
          let n = 0;
          for (let i = 0; i < W * H; i++) if (dif(A, A0, i) > 30 && raio(i % W, (i / W) | 0) > 1.02) n++;
          out.fora[nome] = n / (dpr * dpr);
        }
        out.refPng = refPng;
        return out;
      }, { fotos, geo, s, clip, dpr: t.dpr });
      fs.writeFileSync(path.join(PASTA, `${t.nome}-${id}-${arquivo}-referencia.png`), Buffer.from(res.refPng, "base64"));
      fs.writeFileSync(path.join(PASTA, `${t.nome}-${id}-${arquivo}-geo.json`), JSON.stringify({ geo, clip, dpr: t.dpr, olhos: o }));
      const f = (v) => (v == null ? null : +v.toFixed(2));
      const sob = res.sobrancelha.filter(Boolean);
      const l = {
        tamanho: t.nome, personagem: id, pose: geo.pose, versao: geo.meia ? "meia" : "cheia", caixa: geo.caixa,
        sobrancelha_pula_px: f(Math.max(0, ...sob.map((r) => Math.hypot(r.dx, r.dy)))), sobrancelha: sob,
        fora_meio_px2: Math.round(res.fora.meio), fora_fechado_px2: Math.round(res.fora.fechado),
        olho_desvio_px: f(Math.max(...res.olho.map((r) => Math.hypot(r.dx, r.dy)))), olho: res.olho,
      };
      linhas.push(l);
      console.log(`${t.nome.padEnd(14)} ${id.padEnd(6)} ${geo.pose.padEnd(8)} ${l.versao.padEnd(5)} ${String(l.caixa).padStart(3)}px  sobrancelha pula ${String(l.sobrancelha_pula_px).padStart(4)} px | muda fora dos olhos: meio ${String(l.fora_meio_px2).padStart(5)} px², fechado ${String(l.fora_fechado_px2).padStart(5)} px² | olho fechado × arquivo ${l.olho_desvio_px} px`);
      await page.close();
    }
  }
}
await browser.close();
fs.writeFileSync(path.join(PASTA, "medidas.json"), JSON.stringify(linhas, null, 1));
console.log(`\n${PASTA}/medidas.json`);
