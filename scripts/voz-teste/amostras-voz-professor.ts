#!/usr/bin/env tsx
// Amostras da VOZ DO PROFESSOR pelo caminho NOVO do servidor (OfficialGeminiSpeech: Gemini TTS + acabamento das frases de espera),
// uma por cenário do painel e por personagem, para o dono ouvir antes de aprovar no painel. A chave do Vertex é lida de
// ~/.config/vertex-staziamed/vertex.env (vertex.mjs) e nunca é impressa. Não gera de novo o que já existe (rodar de novo não gasta).
// Para no teto de custo (--teto-usd, padrão 0,50).
//
// Uso: node_modules/.bin/tsx scripts/voz-teste/amostras-voz-professor.ts [--saida pasta] [--teto-usd 0.5] [--espaco-ms 3000]
import fs from "node:fs";
import path from "node:path";
import { lerEnv, VERTEX_ENV } from "./vertex.mjs";
import { OfficialGeminiSpeech } from "../../server/tutor/geminiTts";
import { geminiVoiceOf, voiceFingerprint } from "../../server/tutor/officialVoices";
import { OFFICIAL_VOICES, VOICE_SCENARIOS, scenariosFor, type OfficialVoice } from "../../src/shared/tutor/officialVoices";

const arg = (n: string, p: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p;
};
const SAIDA = arg("saida", "/Volumes/StaziaMed/.tmp-aulas/vozes-unificadas");
const TETO = Number(arg("teto-usd", "0.5"));
const ESPACO_MS = Number(arg("espaco-ms", "3000"));
const env = { VERTEX_API_KEY: lerEnv(VERTEX_ENV).VERTEX_API_KEY, TUTOR_VOICE_ALLOW_EXTERNAL: "1" } as NodeJS.ProcessEnv;
if (!env.VERTEX_API_KEY) throw new Error(`VERTEX_API_KEY ausente em ${VERTEX_ENV}`);
const voz = new OfficialGeminiSpeech(env);
fs.mkdirSync(SAIDA, { recursive: true });
const usoArq = path.join(SAIDA, "uso.json");
const uso: Record<string, any> = fs.existsSync(usoArq) ? JSON.parse(fs.readFileSync(usoArq, "utf8")) : {};
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
let gasto = Object.values(uso).reduce((s: number, u: any) => s + (u.custo_usd ?? 0), 0);
let chamadas = 0;
for (const id of Object.keys(OFFICIAL_VOICES) as OfficialVoice[]) {
  for (const sc of scenariosFor(id)) {
    const nome = `${id}-${sc}`;
    const arquivo = path.join(SAIDA, `${nome}.mp3`);
    if (fs.existsSync(arquivo) && uso[nome]) continue;
    if (gasto >= TETO) {
      console.log(`teto de US$ ${TETO} atingido: parei antes de ${nome}`);
      break;
    }
    if (chamadas++) await espera(ESPACO_MS);
    const texto = VOICE_SCENARIOS[sc].text ?? OFFICIAL_VOICES[id].sample;
    const t0 = Date.now();
    const out = await voz.synthesize(texto, { personality: id });
    fs.writeFileSync(arquivo, out.audio);
    uso[nome] = { personagem: OFFICIAL_VOICES[id].label, cenario: VOICE_SCENARIOS[sc].label, texto, ...geminiVoiceOf(id), ms: Date.now() - t0, segundos: out.seconds, bytes: out.audio.length, custo_usd: out.costUsd ?? null, caracteres: texto.length, versao: voiceFingerprint(id, env).slice(0, 12) };
    gasto += out.costUsd ?? 0;
    fs.writeFileSync(usoArq, JSON.stringify(uso, null, 2));
    console.log(`${nome}: ${out.seconds} s, ${(out.audio.length / 1024).toFixed(1)} KB, ${Date.now() - t0} ms, US$ ${(out.costUsd ?? 0).toFixed(5)}`);
  }
}
console.log(`total das amostras: US$ ${gasto.toFixed(4)} (${Object.keys(uso).length} arquivos)`);
