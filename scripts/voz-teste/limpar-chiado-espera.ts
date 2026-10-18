// Tira o "chiado" do fim das 32 frases de espera já aprovadas (18/10): o Gemini TTS entrega todo arquivo com ~170 ms de ruído alto
// depois da última sílaba, e as frases de 17/10 saíram com ele (o aparador por energia achou que era fala). Nada é gravado de novo:
// cada MP3 é lido, o ruído do fim sai pela MESMA detecção do servidor (vozAcabamento.tirarRuidoDasPontas: energia + planura do
// espectro + silêncio antes; nunca tempo fixo), entra uma saída suave de 30 ms e o MP3 sai com o mesmo formato (mono 24 kHz 64 kbps,
// sem ganho novo). Atualiza o manifesto e imprime as versões novas (`?v=`) para server/tutor/conhecimento/frasesEspera.ts.
// Uso: npx tsx scripts/voz-teste/limpar-chiado-espera.ts   (precisa do ffmpeg em /Volumes/StaziaMed/.tmp-aulas/bin/ffmpeg)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { floatParaPcm, pcmParaFloat, tirarRuidoDasPontas } from "../../server/tutor/vozAcabamento";

const FFMPEG = process.env.FFMPEG ?? "/Volumes/StaziaMed/.tmp-aulas/bin/ffmpeg";
const TAXA = 24_000;
const PUBLICO = path.resolve("public");
const MANIFESTO = path.join(PUBLICO, "novo-assets/tutor/espera/manifesto.json");
const TMP = process.env.TMP_CHIADO ?? "/Volumes/StaziaMed/.tmp-aulas/voz-natural/chiado/tmp";

function medir(arquivo: string): { lufs: number; picoDb: number } {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-i", arquivo, "-af", "ebur128=peak=sample", "-f", "null", "-"], { encoding: "utf8" });
  const txt = String(r.stderr);
  const resumo = txt.slice(txt.lastIndexOf("Summary:"));
  return { lufs: Number(resumo.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]), picoDb: Number(resumo.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]) };
}

fs.mkdirSync(TMP, { recursive: true });
const m = JSON.parse(fs.readFileSync(MANIFESTO, "utf8"));
const versoes: Record<string, string[]> = {};
for (const [persona, dados] of Object.entries<any>(m.personas)) {
  versoes[persona] = [];
  for (const f of dados.frases) {
    const mp3 = path.join(PUBLICO, f.url);
    const pcm = execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", mp3, "-ac", "1", "-ar", String(TAXA), "-f", "s16le", "-"], { maxBuffer: 64 * 1024 * 1024 });
    const r = tirarRuidoDasPontas(pcmParaFloat(pcm), TAXA);
    if (!r.cortadoNoFimMs && !r.cortadoNoComecoMs) {
      console.log(`${path.basename(mp3)}: sem ruído nas pontas, fica como está`);
      versoes[persona].push(f.sha256.slice(0, 8));
      continue;
    }
    const a = r.audio;
    const sai = Math.min(Math.round(TAXA * 0.03), a.length >> 1);
    if (r.cortadoNoFimMs) for (let k = 0; k < sai; k++) a[a.length - 1 - k] *= k / sai;
    const entra = Math.min(Math.round(TAXA * 0.02), a.length >> 1);
    if (r.cortadoNoComecoMs) for (let k = 0; k < entra; k++) a[k] *= k / entra;
    const bruto = path.join(TMP, `${path.basename(mp3, ".mp3")}.pcm`);
    fs.writeFileSync(bruto, floatParaPcm(a));
    execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "s16le", "-ar", String(TAXA), "-ac", "1", "-i", bruto, "-c:a", "libmp3lame", "-b:a", "64k", "-map_metadata", "-1", "-id3v2_version", "0", "-write_xing", "1", mp3]);
    const med = medir(mp3);
    const bytes = fs.readFileSync(mp3);
    const sha = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    Object.assign(f, { segundos: +(a.length / TAXA).toFixed(2), bytes: bytes.length, lufs: +med.lufs.toFixed(1), pico_db: +med.picoDb.toFixed(1), sha256: sha });
    if (r.cortadoNoFimMs) f.chiado_cortado_ms = r.cortadoNoFimMs;
    if (r.cortadoNoComecoMs) f.estalo_cortado_ms = r.cortadoNoComecoMs;
    versoes[persona].push(sha.slice(0, 8));
    console.log(`${path.basename(mp3)}: cortou ${r.cortadoNoComecoMs} ms no começo e ${r.cortadoNoFimMs} ms de ruído no fim; ${f.segundos} s, ${med.lufs.toFixed(1)} LUFS, pico ${med.picoDb.toFixed(1)} dBFS`);
  }
}
m.chiado_cortado_em = new Date().toISOString();
fs.writeFileSync(MANIFESTO, JSON.stringify(m, null, 2) + "\n");
console.log("\nversões para frasesEspera.ts:");
for (const [p, v] of Object.entries(versoes)) console.log(`${p}: ${JSON.stringify(v)}`);
