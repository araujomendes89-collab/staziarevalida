// Mede o quanto o limitador do acabamento mexe na voz (18/10, "aspereza" do Kore): para cada combinação de alvo, teto e soltura,
// a variação do ganho em blocos de 5 ms, o tempo com mais de 3 dB de redução e a energia acima de 4 kHz em relação ao sinal só com
// ganho (sem limitar). Uso: npx tsx scripts/voz-teste/medir-limitador.ts <wav...>
import fs from "node:fs";
import { definirSolturaParaMedir, igualarVolume, loudnessLufs, pcmParaFloat, tirarRuidoDasPontas } from "../../server/tutor/vozAcabamento";
function lerWav(f: string) {
  const b = fs.readFileSync(f);
  let p = 12, taxa = 24000;
  while (p + 8 <= b.length) {
    const id = b.toString("ascii", p, p + 4), tam = b.readUInt32LE(p + 4);
    if (id === "fmt ") taxa = b.readUInt32LE(p + 12);
    if (id === "data") return { taxa, a: pcmParaFloat(b.subarray(p + 8, p + 8 + tam)) };
    p += 8 + tam + (tam & 1);
  }
  throw new Error(f);
}
function hf(a: Float32Array, taxa: number) {
  // passa-altas simples de 2ª ordem em 4 kHz (RBJ) e energia
  const w0 = (2 * Math.PI * 4000) / taxa, al = Math.sin(w0) / (2 * Math.SQRT1_2), c = Math.cos(w0);
  const b0 = (1 + c) / 2, b1 = -(1 + c), b2 = (1 + c) / 2, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, s = 0;
  for (let i = 0; i < a.length; i++) {
    const y = (b0 * a[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = a[i]; y2 = y1; y1 = y; s += y * y;
  }
  return 10 * Math.log10(s / a.length + 1e-18);
}
const combos = [
  { nome: "atual  -13.7/-3.5/60ms ", alvo: -13.7, teto: -3.5, solt: 0.06 },
  { nome: "teto   -13.7/-1.5/180ms", alvo: -13.7, teto: -1.5, solt: 0.18 },
  { nome: "meio   -15.0/-2.0/180ms", alvo: -15, teto: -2, solt: 0.18 },
  { nome: "alvo   -16.0/-3.5/180ms", alvo: -16, teto: -3.5, solt: 0.18 },
];
for (const c of combos) {
  definirSolturaParaMedir(c.solt);
  let varSum = 0, acima3 = 0, total = 0, hfDif = 0, n = 0;
  for (const f of process.argv.slice(2)) {
    const { taxa, a: bruto } = lerWav(f);
    const a = tirarRuidoDasPontas(bruto, taxa).audio;
    const ganhoPuro = c.alvo - loudnessLufs(a, taxa);
    const g = Math.pow(10, ganhoPuro / 20);
    const puro = a.map((v) => v * g);
    const lim = igualarVolume(a, taxa, c.alvo, c.teto);
    const bloco = Math.round(taxa * 0.005);
    const red: number[] = [];
    for (let i = 0; i + bloco <= a.length; i += bloco) {
      let sp = 0, sl = 0;
      for (let k = i; k < i + bloco; k++) (sp += puro[k] * puro[k]), (sl += lim[k] * lim[k]);
      if (sp > 1e-6) red.push(10 * Math.log10(sp / Math.max(sl, 1e-12)));
    }
    const m = red.reduce((s, v) => s + v, 0) / red.length;
    for (let i = 1; i < red.length; i++) varSum += Math.abs(red[i] - red[i - 1]);
    total += red.length;
    acima3 += red.filter((v) => v - m > 3 || v > 3).length;
    hfDif += hf(lim, taxa) - hf(puro, taxa);
    n++;
  }
  console.log(`${c.nome}  variação média do ganho entre blocos de 5 ms ${(varSum / total).toFixed(2)} dB · tempo com >3 dB de redução ${((acima3 / total) * 100).toFixed(1)}% · agudo >4 kHz vs só ganho ${(hfDif / n).toFixed(2)} dB`);
}
