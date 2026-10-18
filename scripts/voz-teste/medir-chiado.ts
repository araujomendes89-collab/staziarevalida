// Mede o "chiado" do fim (e o estalo do começo) em WAVs PCM 16 bits mono e mostra o que o acabamento corta (18/10).
// Uso: npx tsx scripts/voz-teste/medir-chiado.ts <wav...>
// Para cada arquivo: energia dos últimos 300 ms antes e depois, ms cortados no começo e no fim.
import fs from "node:fs";
import { pcmParaFloat, tirarRuidoDasPontas } from "../../server/tutor/vozAcabamento";

function lerWav(f: string): { taxa: number; a: Float32Array } {
  const b = fs.readFileSync(f);
  let p = 12, taxa = 24000, canais = 1;
  while (p + 8 <= b.length) {
    const id = b.toString("ascii", p, p + 4), tam = b.readUInt32LE(p + 4);
    if (id === "fmt ") { canais = b.readUInt16LE(p + 10); taxa = b.readUInt32LE(p + 12); }
    if (id === "data") {
      let a = pcmParaFloat(b.subarray(p + 8, p + 8 + tam));
      if (canais > 1) a = a.filter((_, i) => i % canais === 0);
      return { taxa, a };
    }
    p += 8 + tam + (tam & 1);
  }
  throw new Error(`sem dados: ${f}`);
}
export const energiaFinalDb = (a: Float32Array, taxa: number, ms = 300) => {
  const n = Math.min(a.length, Math.round((taxa * ms) / 1000));
  let s = 0;
  for (let i = a.length - n; i < a.length; i++) s += a[i] * a[i];
  return Math.round(10 * Math.log10(s / Math.max(1, n) + 1e-18) * 10) / 10;
};
for (const f of process.argv.slice(2)) {
  const { taxa, a } = lerWav(f);
  const r = tirarRuidoDasPontas(a, taxa);
  console.log(`${f.split("/").pop()}\tantes ${energiaFinalDb(a, taxa)} dB\tdepois ${energiaFinalDb(r.audio, taxa)} dB\tcorte começo ${r.cortadoNoComecoMs} ms\tfim ${r.cortadoNoFimMs} ms`);
}
