#!/usr/bin/env tsx
// Grava as 32 FRASES DE ESPERA aprovadas pelo dono (server/tutor/conhecimento/frasesEspera.ts) na voz de cada personagem e prepara
// os arquivos leves do app (public/novo-assets/tutor/espera/*.mp3 + manifesto.json).
//
// 1. Gravação (Gemini TTS pelo Vertex, gemini-3.8-flash-tts; chave lida por vertex.mjs, nunca impressa): UMA chamada por frase, uma
//    por vez e espaçadas; só a fala, nada mais (ver abaixo). O bruto fica em
//    <saida>/bruto/<arquivo>.wav e NÃO é gravado de novo se já existir (rodar outra vez não gasta nada).
//    Stazi = "Zubenelgenubi" com atuação de desenho animado (Durão e Tranquilo); Stazia = "Kore" (Durona e Tranquila).
// 2. Acabamento (sem API): Stazi passa pelo MESMO afinador da voz ao vivo (AfinadorStream, +3 semitons; personagens.js), em pedaços
//    de 100 ms como chega ao vivo; Stazia sem afinar. Silêncio das pontas aparado (faixaDeFala de aparar.mjs, 60 ms de folga), volume
//    igualado à voz AO VIVO do mesmo personagem (loudness EBU R128 medida em gravações do Gemini Live, pico máximo −1,5 dBFS) e MP3
//    mono 24 kHz 64 kbps.
//
// Uso: node_modules/.bin/tsx scripts/voz-teste/gravar-frases-espera.ts [--so-acabamento] [--espaco-ms 4000]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { FRASES_ESPERA, type PersonaEspera } from "../../server/tutor/conhecimento/frasesEspera";
import { geminiTts, lerWav, wav } from "./vertex.mjs";
import { faixaDeFala } from "./aparar.mjs";
import { tokensPorModalidade, custoUsd } from "./precos.mjs";
import { AfinadorStream } from "../../src/novo/app/tutor/voice/pitchShift.js";
import { PERSONAGENS } from "../../src/novo/app/tutor/personagens/personagens.js";

const arg = (n: string, p: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p;
};
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FFMPEG = "/Volumes/StaziaMed/.tmp-aulas/bin/ffmpeg";
const MODELO = "gemini-3.8-flash-tts";
// pasta dos brutos (WAV) e do trabalho: --saida (17/10 o disco StaziaMed lotou; os brutos ficaram fora dele)
const SAIDA = arg("saida", "/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro/frases-audio");
const PUBLICO = path.join(RAIZ, "public/novo-assets/tutor/espera");
const URL_BASE = "/novo-assets/tutor/espera";
const SO_ACABAMENTO = process.argv.includes("--so-acabamento");
const ESPACO_MS = Number(arg("espaco-ms", "4000"));
const LIMITE = Number(arg("limite", "999")); // quantas gravações novas nesta rodada (teste: --limite 1)
const TAXA = 24000;
// teto do limitador: o MP3 passa ~2 a 3 dB do pico do WAV, então -3,5 deixa o arquivo final abaixo de 0 dBFS. Com esse teto a
// loudness fica ~1 a 2 LU abaixo da voz ao vivo (que tem pico quase no máximo); mais alto que isso só com compressão pesada.
const PICO_MAX_DB = -3.5;
const PICO_MP3_DB = -0.1; // pico máximo do arquivo final
const KBPS = "64k";

// referências da voz AO VIVO (Gemini Live, sem afinar) de cada voz: o volume das gravações fica igual ao delas
const REF_VIVO: Record<"stazi" | "stazia", string[]> = {
  stazi: ["live-zubenelgenubi-durao.wav", "live-zubenelgenubi-tranquilo.wav"].map((f) => `/Volumes/StaziaMed/.tmp-aulas/vozes-comparacao/menino/caricato/${f}`),
  stazia: ["gemini-live-kore-durona-explosiva.wav", "gemini-live-kore-durona-expressiva.wav"].map((f) => `/Volumes/StaziaMed/.tmp-aulas/vozes-comparacao/${f}`),
};

// SEM direção de tom no pedido: medido em 17/10, o gemini-3.8-flash-tts LÊ EM VOZ ALTA qualquer instrução que venha junto da fala
// ("Fale num tom…: frase", "[tag] frase") e recusa systemInstruction (400). O tom de cada personalidade vem do próprio texto aprovado
// (pontuação e palavras) e, no Stazi, do afinador de desenho (+3 semitons), igual ao da voz ao vivo.
const ROTULO: Record<PersonaEspera, { personagem: "stazi" | "stazia"; nome: string; arquivo: string }> = {
  durao: { personagem: "stazi", nome: "Durão", arquivo: "stazi-durao" },
  acolhedor: { personagem: "stazi", nome: "Tranquilo", arquivo: "stazi-tranquilo" },
  durona: { personagem: "stazia", nome: "Durona", arquivo: "stazia-durona" },
  tranquila: { personagem: "stazia", nome: "Tranquila", arquivo: "stazia-tranquila" },
};
const ORDEM: PersonaEspera[] = ["durao", "acolhedor", "durona", "tranquila"];

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

function paraFloat(pcm: Buffer): Float32Array {
  const n = pcm.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = pcm.readInt16LE(i * 2) / 0x8000;
  return out;
}
function paraPcm(a: Float32Array): Buffer {
  const b = Buffer.alloc(a.length * 2);
  for (let i = 0; i < a.length; i++) {
    const s = Math.max(-1, Math.min(1, a[i]));
    b.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), i * 2);
  }
  return b;
}
/** O mesmo afinador da voz ao vivo, em pedaços de 100 ms; finalizar() devolve a duração igual à da entrada. */
function afinar(a: Float32Array, semitons: number): Float32Array {
  if (!semitons) return a;
  const af = new AfinadorStream({ semitons, taxa: TAXA });
  const partes: Float32Array[] = [];
  const tam = TAXA / 10;
  for (let i = 0; i < a.length; i += tam) partes.push(af.processar(a.subarray(i, i + tam)));
  partes.push(af.finalizar());
  const out = new Float32Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) (out.set(p, o), (o += p.length));
  return out;
}
/** Loudness integrada (LUFS) e pico (dBFS) pelo ffmpeg (o resumo do ebur128 sai no stderr). */
function medirComStderr(arquivo: string): { lufs: number; picoDb: number } {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-i", arquivo, "-af", "ebur128=peak=sample", "-f", "null", "-"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg falhou em ${arquivo}: ${String(r.stderr).slice(-200)}`);
  const txt = String(r.stderr);
  const resumo = txt.slice(txt.lastIndexOf("Summary:"));
  const lufs = Number(resumo.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
  const picoDb = Number(resumo.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
  if (!Number.isFinite(lufs) || !Number.isFinite(picoDb)) throw new Error(`sem medida de volume em ${arquivo}`);
  return { lufs, picoDb };
}

async function gravar() {
  fs.mkdirSync(path.join(SAIDA, "bruto"), { recursive: true });
  const usoArq = path.join(SAIDA, "bruto/uso.json");
  const uso: Record<string, unknown> = fs.existsSync(usoArq) ? JSON.parse(fs.readFileSync(usoArq, "utf8")) : {};
  let chamadas = 0;
  for (const p of ORDEM) {
    const voz = PERSONAGENS[ROTULO[p].personagem].voz.gemini;
    for (let i = 0; i < FRASES_ESPERA[p].length; i++) {
      const nome = `${ROTULO[p].arquivo}-${i + 1}`;
      const destino = path.join(SAIDA, "bruto", `${nome}.wav`);
      if (fs.existsSync(destino)) continue;
      if (chamadas >= LIMITE) continue;
      if (chamadas++) await espera(ESPACO_MS);
      let r: Awaited<ReturnType<typeof geminiTts>> | null = null;
      for (let tentativa = 1; tentativa <= 2 && !r; tentativa++) {
        try {
          r = await geminiTts({ modelo: MODELO, voz, texto: FRASES_ESPERA[p][i] });
          if (!r.pcm.length) throw new Error("sem áudio na resposta");
        } catch (e: any) {
          r = null;
          console.log(`${nome}: falhou (${String(e?.message ?? e).slice(0, 160)})${tentativa < 2 ? "; tento de novo em 20 s" : ""}`);
          if (tentativa < 2) await espera(20_000);
          else throw e;
        }
      }
      fs.writeFileSync(destino, wav(r!.pcm, TAXA));
      const t = tokensPorModalidade(r!.usage);
      uso[nome] = { voz, ms: r!.ms, segundos: +(r!.pcm.length / 2 / TAXA).toFixed(2), tokens: t, custo_usd: custoUsd(MODELO, t) };
      fs.writeFileSync(usoArq, JSON.stringify(uso, null, 2));
      console.log(`${nome}: ${(r!.pcm.length / 2 / TAXA).toFixed(2)} s, ${r!.ms} ms, US$ ${(custoUsd(MODELO, t) ?? 0).toFixed(5)}`);
    }
  }
  const total = Object.values(uso).reduce((s: number, u: any) => s + (u.custo_usd ?? 0), 0);
  console.log(`gravação: ${chamadas} chamada(s) agora; custo estimado de todas as gravações: US$ ${total.toFixed(4)}`);
  return { uso, total };
}

function acabamento(uso: Record<string, any>) {
  fs.mkdirSync(PUBLICO, { recursive: true });
  const tmp = path.join(SAIDA, "tmp");
  fs.mkdirSync(tmp, { recursive: true });
  // alvo de volume: média da loudness da voz ao vivo de cada personagem (Stazi medido JÁ afinado, como o aluno ouve)
  const alvo: Record<string, number> = {};
  for (const [personagem, refs] of Object.entries(REF_VIVO)) {
    const semitons = PERSONAGENS[personagem as "stazi"].voz.semitons;
    const vals = refs.map((f, k) => {
      const { rate, pcm } = lerWav(f);
      if (rate !== TAXA) throw new Error(`${f}: taxa ${rate}`);
      const arq = path.join(tmp, `ref-${personagem}-${k}.wav`);
      fs.writeFileSync(arq, wav(paraPcm(afinar(paraFloat(pcm), semitons)), TAXA));
      return medirComStderr(arq).lufs;
    });
    alvo[personagem] = vals.reduce((s, v) => s + v, 0) / vals.length;
    console.log(`voz ao vivo ${personagem}: ${vals.map((v) => v.toFixed(1)).join(" / ")} LUFS → alvo ${alvo[personagem].toFixed(1)} LUFS`);
  }
  const manifesto: any = {
    gerado_em: new Date().toISOString(),
    modelo: MODELO,
    formato: `mp3 mono 24 kHz ${KBPS}bps`,
    observacao: "Stazi já vem afinado (+3 semitons, o mesmo AfinadorStream da voz ao vivo): o app toca com semitons 0.",
    alvo_lufs: Object.fromEntries(Object.entries(alvo).map(([k, v]) => [k, +v.toFixed(1)])),
    personas: {} as Record<string, unknown>,
  };
  for (const p of ORDEM) {
    const { personagem, nome: rotulo, arquivo } = ROTULO[p];
    const semitons = PERSONAGENS[personagem].voz.semitons;
    const itens = [];
    for (let i = 0; i < FRASES_ESPERA[p].length; i++) {
      const nome = `${arquivo}-${i + 1}`;
      const { rate, pcm } = lerWav(path.join(SAIDA, "bruto", `${nome}.wav`));
      if (rate !== TAXA) throw new Error(`${nome}: taxa ${rate}`);
      let a = afinar(paraFloat(pcm), semitons);
      const pcmAf = paraPcm(a);
      const fx = faixaDeFala(pcmAf, TAXA);
      const ini = Math.max(0, Math.round((fx.iniS - 0.06) * TAXA));
      const fim = Math.min(a.length, Math.round((fx.fimS + 0.06) * TAXA));
      a = a.slice(ini, fim);
      // 10 ms de entrada e de saída suaves (sem estalo no corte)
      const rampa = Math.round(TAXA * 0.01);
      for (let k = 0; k < rampa && k < a.length; k++) {
        a[k] *= k / rampa;
        a[a.length - 1 - k] *= k / rampa;
      }
      const aparado = path.join(tmp, `${nome}-aparado.wav`);
      fs.writeFileSync(aparado, wav(paraPcm(a), TAXA));
      const m = medirComStderr(aparado);
      // a voz ao vivo é bem mais "cheia" (pico perto do máximo) que a do TTS: sobe o volume até o da voz ao vivo e um limitador rápido
      // segura só os picos (sem estourar); depois mede de novo e corrige o que o limitador tirou
      const final = path.join(PUBLICO, `${nome}.mp3`);
      const limite = Math.pow(10, PICO_MAX_DB / 20).toFixed(4);
      let ganho = alvo[personagem] - m.lufs;
      // mede o PRÓPRIO mp3 (o que o aluno ouve) e acerta o ganho até ficar a menos de 0,3 LU do alvo
      for (let passo = 0; passo < 4; passo++) {
        execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", aparado, "-af", `volume=${ganho.toFixed(2)}dB,alimiter=limit=${limite}:attack=3:release=60:level=disabled`, "-ac", "1", "-ar", String(TAXA), "-c:a", "libmp3lame", "-b:a", KBPS, "-map_metadata", "-1", "-id3v2_version", "0", "-write_xing", "1", final]);
        const med = medirComStderr(final);
        if (med.picoDb > PICO_MP3_DB) {
          ganho -= med.picoDb - PICO_MP3_DB + 0.3; // estourou: abaixa um pouco e mede de novo
          continue;
        }
        const d = alvo[personagem] - med.lufs;
        if (Math.abs(d) < 0.3) break;
        ganho += d;
      }
      const conferido = medirComStderr(final);
      const bytes = fs.statSync(final).size;
      const segundos = +(a.length / TAXA).toFixed(2);
      itens.push({
        n: i + 1,
        texto: FRASES_ESPERA[p][i],
        url: `${URL_BASE}/${nome}.mp3`,
        segundos,
        bytes,
        lufs: +conferido.lufs.toFixed(1),
        pico_db: +conferido.picoDb.toFixed(1),
        sha256: crypto.createHash("sha256").update(fs.readFileSync(final)).digest("hex").slice(0, 16),
      });
      const suspeito = segundos > Math.max(4.5, FRASES_ESPERA[p][i].length / 8) ? "  <- LONGO DEMAIS, conferir de ouvido" : "";
      console.log(`${nome}: ${segundos} s, ${(bytes / 1024).toFixed(1)} KB, ${conferido.lufs.toFixed(1)} LUFS (alvo ${alvo[personagem].toFixed(1)}), pico ${conferido.picoDb.toFixed(1)} dBFS, pausa interna ${fx.maiorPausaS} s${suspeito}`);
    }
    manifesto.personas[p] = { personagem: PERSONAGENS[personagem].nome, personalidade: rotulo, voz: PERSONAGENS[personagem].voz.gemini, semitons_aplicados: semitons, frases: itens };
  }
  manifesto.custo_gravacao_usd = +Object.values(uso).reduce((s: number, u: any) => s + (u.custo_usd ?? 0), 0).toFixed(5);
  fs.writeFileSync(path.join(PUBLICO, "manifesto.json"), JSON.stringify(manifesto, null, 2) + "\n");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`manifesto: ${path.join(PUBLICO, "manifesto.json")}`);
}

const { uso } = SO_ACABAMENTO ? { uso: JSON.parse(fs.readFileSync(path.join(SAIDA, "bruto/uso.json"), "utf8")) } : await gravar();
const faltam = ORDEM.flatMap((p) => FRASES_ESPERA[p].map((_, i) => `${ROTULO[p].arquivo}-${i + 1}`)).filter((n) => !fs.existsSync(path.join(SAIDA, "bruto", `${n}.wav`)));
if (faltam.length) console.log(`faltam ${faltam.length} gravação(ões); acabamento só quando todas existirem`);
else acabamento(uso);
