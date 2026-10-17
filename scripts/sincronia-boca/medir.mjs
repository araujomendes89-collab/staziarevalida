// Mede a sincronia da boca com a voz que SAI do alto-falante, no navegador (Chromium), pelo caminho real do app.
// Precisa da bancada no ar: npx vite --config scripts/sincronia-boca/vite.config.mjs (porta 31993).
// Uso: node scripts/sincronia-boca/medir.mjs <rotulo> [wav] [semitons=3] [personagem=stazi] [segundos=12]
// Saída: /Volumes/StaziaMed/.tmp-aulas/tutor-personagens/sincronia/medida-<rotulo>.json (+ quadros.csv)
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [rotulo = "teste", wav = "/Volumes/StaziaMed/.tmp-aulas/voice-tutor/previa-personagens-teste/stazi-durao-voz-original.wav", semitons = "3", personagem = "stazi", segundos = "12", versao = "depois"] = process.argv.slice(2);
const SAIDA = "/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/sincronia";
fs.mkdirSync(SAIDA, { recursive: true });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const page = await browser.newPage({ viewport: { width: 480, height: 640 } });
const erros = [];
page.on("pageerror", (e) => erros.push(String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:31993/?voz=/@fs${encodeURI(wav)}&semitons=${semitons}&personagem=${personagem}&ate=${segundos}&versao=${versao}`, { timeout: 120_000 });
await page.waitForFunction(() => window.__resultado || window.__erro, null, { timeout: (Number(segundos) + 40) * 1000 });
const r = await page.evaluate(() => window.__resultado ?? { erro: window.__erro });
await browser.close();
if (r.erro) { console.error(r.erro); process.exit(1); }

// sinal que sai: cada pedaço agendado em `at` (s do contexto)
const RATE = r.pedacos[0]?.rate ?? 24000;
const t0 = Math.min(...r.pedacos.map((p) => p.at));
const fimT = Math.max(...r.pedacos.map((p) => p.at + p.data.length / p.rate));
const sinal = new Float32Array(Math.ceil((fimT - t0) * RATE) + 10);
for (const p of r.pedacos) { const o = Math.round((p.at - t0) * RATE); p.data.forEach((v, i) => { sinal[o + i] = v / 32767; }); }
const rmsEm = (tc, janela = 0.02) => {
  const c = Math.round((tc - t0) * RATE);
  const h = Math.round((janela * RATE) / 2);
  let s = 0, n = 0;
  for (let i = c - h; i < c + h; i++) { const v = i >= 0 && i < sinal.length ? sinal[i] : 0; s += v * v; n++; }
  return Math.sqrt(s / n);
};
const num = (re, s, k = 1) => { const m = re.exec(s); return m ? Number(m[k]) : NaN; };
const quadros = r.quadros.map((f) => {
  const ouvindo = f.outCtx > 0 ? f.outCtx + (f.pt - f.outPt) / 1000 : f.ctxT - (f.lat ?? 0);
  const sy = num(/scaleY\(([-\d.]+)\)/, f.bocaTr);
  return { ...f, ouvindo, bocaSy: Number.isFinite(sy) ? sy : null, x: num(/translate\(([-\d.]+)px/, f.corpo), csx: num(/scale\(([-\d.]+),/, f.corpo), y: num(/translate\([-\d.]+px,\s*([-\d.]+)px\)/, f.corpo), rot: num(/rotate\(([-\d.]+)deg\)/, f.corpo), csy: num(/scale\([-\d.]+,\s*([-\d.]+)\)/, f.corpo) };
}).filter((f) => f.ouvindo > t0 - 0.3 && f.ouvindo < fimT + 0.3);
// abertura visível da boca: opacidade × (escala vertical, se houver)
const abertura = (f) => (f.bocaVal != null ? f.bocaVal : (f.bocaOp ?? 0) * (f.bocaSy ?? 1));
const A = quadros.map(abertura);
const pearson = (a, b) => { const n = a.length; const ma = a.reduce((x, y) => x + y, 0) / n; const mb = b.reduce((x, y) => x + y, 0) / n; let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb || 1); };
let melhor = { lag: 0, r: -2 };
const correl = [];
for (let lag = -250; lag <= 350; lag += 5) {
  const E = quadros.map((f) => rmsEm(f.ouvindo - lag / 1000, 0.03));
  const c = pearson(A, E);
  correl.push([lag, +c.toFixed(3)]);
  if (c > melhor.r) melhor = { lag, r: c };
}
const dur = (quadros.at(-1).pt - quadros[0].pt) / 1000;
// trocas de boca: abre (passa de 0,5 subindo) e fecha (desce de 0,5), com faixa de 0,1 para não contar ruído
let estado = A[0] > 0.5, trocas = 0, saltos = 0;
for (let i = 1; i < A.length; i++) {
  if (!estado && A[i] > 0.55) { estado = true; trocas++; } else if (estado && A[i] < 0.45) { estado = false; trocas++; }
  if (Math.abs(A[i] - A[i - 1]) > 0.35) saltos++;
}
const niveisBoca = new Set(A.map((v) => Math.round(v * 10))).size;
// trocas de abertura (fechada/meia/aberta, arredondando a abertura) por segundo, e o pior segundo
const deg = A.map((v) => Math.round(v * 2));
const tTroca = [];
for (let i = 1; i < deg.length; i++) if (deg[i] !== deg[i - 1]) tTroca.push(quadros[i].pt);
let piorSegundo = 0;
for (let i = 0; i < tTroca.length; i++) { let j = i; while (j < tTroca.length && tTroca[j] - tTroca[i] < 1000) j++; piorSegundo = Math.max(piorSegundo, j - i); }
// tremor do corpo: o que sobra depois de tirar a média móvel de 300 ms (movimento rápido)
const tremor = (campo) => {
  const v = quadros.map((f) => f[campo]);
  const res = v.map((x, i) => { const ini = Math.max(0, i - 9), fim = Math.min(v.length, i + 10); const m = v.slice(ini, fim).reduce((a, b) => a + b, 0) / (fim - ini); return x - m; });
  const rms = Math.sqrt(res.reduce((a, b) => a + b * b, 0) / res.length);
  let maxPasso = 0; for (let i = 1; i < v.length; i++) maxPasso = Math.max(maxPasso, Math.abs(v[i] - v[i - 1]));
  return { rms_rapido: +rms.toFixed(4), maior_passo_por_quadro: +maxPasso.toFixed(4), amplitude: +(Math.max(...v) - Math.min(...v)).toFixed(3) };
};
const poses = []; for (const f of quadros) if (poses.at(-1) !== f.pose) poses.push(f.pose);
const res = {
  rotulo, wav: path.basename(wav), semitons: Number(semitons), personagem, segundos_medidos: +dur.toFixed(2), quadros: quadros.length, fps: +(quadros.length / dur).toFixed(1),
  latencia_saida_ms: { outputLatency: r.quadros.at(-1).lat * 1000, baseLatency: r.quadros.at(-1).base * 1000 },
  atraso_boca_ms: melhor.lag, correlacao: +melhor.r.toFixed(3),
  ciclos_abre_fecha_por_s: +(trocas / 2 / dur).toFixed(2), trocas_de_abertura_por_s: +(tTroca.length / dur).toFixed(2), pior_segundo_trocas: piorSegundo, saltos_boca_maiores_que_0_35: saltos, niveis_distintos_de_boca: niveisBoca,
  corpo_y_px: tremor("y"), corpo_rot_graus: tremor("rot"), corpo_escala_vertical: tremor("csy"),
  sequencia_de_poses: poses.join(" → "), erros,
};
fs.writeFileSync(path.join(SAIDA, `medida-${rotulo}.json`), JSON.stringify({ ...res, correl }, null, 1));
fs.writeFileSync(path.join(SAIDA, `quadros-${rotulo}.csv`), "ms,ouvindo_s,voz_rms,abertura,opacidade,escala_boca,corpo_y,corpo_rot,corpo_sy,pose,corpo_x,corpo_sx,olhos,u\n" + quadros.map((f, i) => [(f.pt - quadros[0].pt).toFixed(1), (f.ouvindo - t0).toFixed(4), rmsEm(f.ouvindo, 0.03).toFixed(4), A[i].toFixed(3), f.bocaOp, f.bocaSy, f.y, f.rot, f.csy, f.pose, f.x, f.csx, f.olhosOp, f.u].join(",")).join("\n"));
// o som que saiu (a partir do primeiro pedaço = 0 s do CSV), para montar o vídeo
{
  const b = Buffer.alloc(44 + sinal.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + sinal.length * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(sinal.length * 2, 40);
  sinal.forEach((v, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  fs.writeFileSync(path.join(SAIDA, `som-${rotulo}.wav`), b);
}
console.log(JSON.stringify(res, null, 1));
