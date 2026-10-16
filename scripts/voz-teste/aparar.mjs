// Mede onde a fala começa e termina (energia em janelas de 20 ms) e apara o silêncio das pontas, deixando 100 ms.
// Mostra também a maior pausa interna. Uso: node scripts/voz-teste/aparar.mjs <wav...>  (regrava *-aparado.wav ao lado)
import fs from "node:fs";
import { lerWav, wav } from "./vertex.mjs";
export function faixaDeFala(pcm, rate, limiar = 500) {
  const jan = Math.round(rate * 0.02), n = Math.floor(pcm.length / 2 / jan), ativo = [];
  for (let k = 0; k < n; k++) { let s = 0; for (let i = 0; i < jan; i++) { const v = pcm.readInt16LE((k * jan + i) * 2); s += v * v; } ativo.push(Math.sqrt(s / jan) > limiar); }
  const ini = ativo.indexOf(true), fim = ativo.lastIndexOf(true);
  let pausa = 0, cur = 0; for (let k = ini; k <= fim; k++) { if (!ativo[k]) { cur++; pausa = Math.max(pausa, cur); } else cur = 0; }
  return { iniS: ini * 0.02, fimS: (fim + 1) * 0.02, maiorPausaS: +(pausa * 0.02).toFixed(2), jan };
}
if (process.argv[1]?.endsWith("aparar.mjs")) for (const f of process.argv.slice(2)) {
  const { rate, pcm } = lerWav(f); const fx = faixaDeFala(pcm, rate);
  const a = Math.max(0, Math.round((fx.iniS - 0.1) * rate)) * 2, b = Math.min(pcm.length, Math.round((fx.fimS + 0.1) * rate) * 2);
  fs.writeFileSync(f.replace(/\.wav$/, "-aparado.wav"), wav(pcm.subarray(a, b), rate));
  console.log(f.split("/").pop(), "total", (pcm.length / 2 / rate).toFixed(2), "fala", fx.iniS.toFixed(2), "→", fx.fimS.toFixed(2), "maior pausa interna", fx.maiorPausaS, "s");
}
