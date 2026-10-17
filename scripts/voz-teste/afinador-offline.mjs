#!/usr/bin/env node
// Afinador ao vivo, conferido fora do navegador: lê a voz do Stazi sem afinar (Gemini Live "Zubenelgenubi", PCM 16 bits, 24 kHz,
// mono), fatia em pedaços de 100 ms e de 40 ms (como chegam ao vivo), passa pelo MESMO AfinadorStream do tocador
// (src/novo/app/tutor/voice/pitchShift.js) e grava WAV para comparar de ouvido com a referência aprovada pelo dono (ffmpeg:
// asetrate=24000*2^(3/12),aresample=24000,atempo=1/2^(3/12)). Não chama nenhuma API.
//
// Também passa a voz pelo TOCADOR de verdade (audioPlayer.js) com relógio simulado e os pedaços chegando no ritmo da fala (40 e
// 100 ms), sem afinar e afinado: conta os buracos entre os pedaços agendados e grava a linha do tempo tocada
// (zubenelgenubi-<jeito>-tocador-<ms>ms.wav), para ouvir o que o aluno ouviria.
//
// Uso: node scripts/voz-teste/afinador-offline.mjs [--semitons 3] [--entrada pasta] [--saida pasta]
import fs from "node:fs";
import path from "node:path";
import { AfinadorStream } from "../../src/novo/app/tutor/voice/pitchShift.js";
import { AudioPlayer } from "../../src/novo/app/tutor/voice/audioPlayer.js";

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
};
const SEMITONS = Number(arg("semitons", "3"));
const ENTRADA = arg("entrada", "/Volumes/StaziaMed/.tmp-aulas/vozes-comparacao/menino/caricato");
const SAIDA = arg("saida", "/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/afinador");
const JEITOS = ["tranquilo", "durao"];
const PEDACOS_MS = [100, 40];

function lerWav(arquivo) {
  const b = fs.readFileSync(arquivo);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error(`${arquivo}: não é WAV`);
  let fmt = null;
  let dados = null;
  for (let o = 12; o + 8 <= b.length; ) {
    const id = b.toString("ascii", o, o + 4);
    const tam = b.readUInt32LE(o + 4);
    if (id === "fmt ") fmt = { formato: b.readUInt16LE(o + 8), canais: b.readUInt16LE(o + 10), taxa: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === "data") dados = b.subarray(o + 8, o + 8 + Math.min(tam, b.length - o - 8));
    o += 8 + tam + (tam % 2);
  }
  if (!fmt || !dados) throw new Error(`${arquivo}: sem fmt/data`);
  if (fmt.formato !== 1 || fmt.bits !== 16 || fmt.canais !== 1) throw new Error(`${arquivo}: esperado PCM 16 bits mono (veio ${JSON.stringify(fmt)})`);
  const n = dados.length >> 1;
  const out = new Float32Array(n);
  // a mesma conversão do tocador (base64ToFloat32): inteiro / 32768
  for (let i = 0; i < n; i++) out[i] = dados.readInt16LE(i * 2) / 0x8000;
  return { taxa: fmt.taxa, amostras: out };
}

function gravarWav(arquivo, amostras, taxa) {
  const dados = Buffer.alloc(amostras.length * 2);
  for (let i = 0; i < amostras.length; i++) {
    const s = Math.max(-1, Math.min(1, amostras[i]));
    dados.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), i * 2);
  }
  const cab = Buffer.alloc(44);
  cab.write("RIFF", 0, "ascii");
  cab.writeUInt32LE(36 + dados.length, 4);
  cab.write("WAVE", 8, "ascii");
  cab.write("fmt ", 12, "ascii");
  cab.writeUInt32LE(16, 16);
  cab.writeUInt16LE(1, 20);
  cab.writeUInt16LE(1, 22);
  cab.writeUInt32LE(taxa, 24);
  cab.writeUInt32LE(taxa * 2, 28);
  cab.writeUInt16LE(2, 32);
  cab.writeUInt16LE(16, 34);
  cab.write("data", 36, "ascii");
  cab.writeUInt32LE(dados.length, 40);
  fs.writeFileSync(arquivo, Buffer.concat([cab, dados]));
}

fs.mkdirSync(SAIDA, { recursive: true });
for (const jeito of JEITOS) {
  const origem = path.join(ENTRADA, `live-zubenelgenubi-${jeito}.wav`);
  const { taxa, amostras } = lerWav(origem);
  const saidas = [];
  for (const ms of PEDACOS_MS) {
    const tam = Math.round((taxa * ms) / 1000);
    const afinador = new AfinadorStream({ semitons: SEMITONS, taxa });
    const partes = [];
    let maxRetidas = 0;
    let gasto = 0;
    for (let i = 0; i < amostras.length; i += tam) {
      const t0 = performance.now();
      partes.push(afinador.processar(amostras.subarray(i, i + tam)));
      gasto += performance.now() - t0;
      maxRetidas = Math.max(maxRetidas, afinador.retidas);
    }
    partes.push(afinador.finalizar());
    const total = partes.reduce((s, p) => s + p.length, 0);
    const out = new Float32Array(total);
    let o = 0;
    for (const p of partes) {
      out.set(p, o);
      o += p.length;
    }
    let pico = 0;
    let nan = 0;
    for (const v of out) {
      if (Number.isNaN(v)) nan++;
      else pico = Math.max(pico, Math.abs(v));
    }
    const destino = path.join(SAIDA, `zubenelgenubi-${jeito}-js-${ms}ms.wav`);
    gravarWav(destino, out, taxa);
    saidas.push(out);
    const dur = amostras.length / taxa;
    console.log(
      `${path.basename(destino)}: ${(total / taxa).toFixed(3)} s (entrada ${dur.toFixed(3)} s), pico ${pico.toFixed(3)}, NaN ${nan}, ` +
        `retidas no máx. ${maxRetidas} amostras (${((maxRetidas / taxa) * 1000).toFixed(1)} ms), processamento ${gasto.toFixed(0)} ms ` +
        `(${((gasto / 1000 / dur) * 100).toFixed(2)}% do tempo real)`
    );
  }
  let dif = 0;
  for (let i = 0; i < Math.min(saidas[0].length, saidas[1].length); i++) dif = Math.max(dif, Math.abs(saidas[0][i] - saidas[1][i]));
  console.log(`  ${jeito}: diferença máxima entre 100 ms e 40 ms = ${dif}`);
}

// ---- tocador com relógio simulado: pedaços chegando no ritmo da fala, fim da geração logo depois do último ----
function tocadorTempoReal(amostras, taxa, ms, semitons) {
  let agora = 0;
  const relogios = new Map();
  let id = 0;
  const [st, ct] = [globalThis.setTimeout, globalThis.clearTimeout];
  globalThis.setTimeout = (f, espera) => (relogios.set(++id, { em: agora + espera / 1000, f }), id);
  globalThis.clearTimeout = (i) => relogios.delete(i);
  const avancar = (t) => {
    for (;;) {
      let prox = null;
      for (const [i, r] of relogios) if (r.em <= t && (!prox || r.em < prox[1].em)) prox = [i, r];
      if (!prox) break;
      relogios.delete(prox[0]);
      agora = prox[1].em;
      prox[1].f();
    }
    agora = t;
  };
  const agendados = [];
  const ctx = {
    state: "running",
    get currentTime() {
      return agora;
    },
    destination: {},
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    createBuffer: (_c, n, r) => {
      const d = new Float32Array(n);
      return { duration: n / r, getChannelData: () => d };
    },
    createBufferSource: () => ({ connect() {}, start(at) { agendados.push({ at, buffer: this.buffer }); }, stop() {} }),
  };
  try {
    const p = new AudioPlayer(ctx, 1, null, { semitons });
    let flushes = 0;
    const flush = p.flush.bind(p);
    p.flush = () => (flushes++, flush());
    const tam = Math.round((taxa * ms) / 1000);
    for (let i = 0; i < amostras.length; i += tam) {
      avancar(i / taxa);
      const pedaco = amostras.subarray(i, i + tam);
      const b = Buffer.alloc(pedaco.length * 2);
      for (let k = 0; k < pedaco.length; k++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pedaco[k] * 0x8000))), k * 2);
      p.play(b.toString("base64"), taxa);
    }
    const doRelogio = flushes;
    avancar(amostras.length / taxa);
    p.flush();
    avancar(agora + 5);
    let buracos = 0;
    let somaBuracos = 0;
    for (let i = 1; i < agendados.length; i++) {
      const g = agendados[i].at - (agendados[i - 1].at + agendados[i - 1].buffer.duration);
      if (g > 1e-9) (buracos++, (somaBuracos += g));
    }
    const fim = agendados.at(-1).at + agendados.at(-1).buffer.duration;
    const linha = new Float32Array(Math.ceil(fim * taxa) + 1);
    for (const a of agendados) linha.set(a.buffer.getChannelData(0), Math.round(a.at * taxa));
    return { buracos, somaBuracos, doRelogio, primeiro: agendados[0].at, fim, linha };
  } finally {
    globalThis.setTimeout = st;
    globalThis.clearTimeout = ct;
  }
}

console.log("\nTocador (audioPlayer.js) com os pedaços chegando no ritmo da fala:");
for (const jeito of JEITOS) {
  const { taxa, amostras } = lerWav(path.join(ENTRADA, `live-zubenelgenubi-${jeito}.wav`));
  for (const ms of PEDACOS_MS) {
    const sem0 = tocadorTempoReal(amostras, taxa, ms, 0);
    const afin = tocadorTempoReal(amostras, taxa, ms, SEMITONS);
    const destino = path.join(SAIDA, `zubenelgenubi-${jeito}-tocador-${ms}ms.wav`);
    gravarWav(destino, afin.linha, taxa);
    const f = (r) =>
      `buracos ${r.buracos} (${(r.somaBuracos * 1000).toFixed(1)} ms), 1º som ${(r.primeiro * 1000).toFixed(1)} ms, fim ${r.fim.toFixed(3)} s, ` +
      `fim solto pelo relógio no meio da fala ${r.doRelogio}`;
    console.log(`  ${jeito} ${ms} ms | sem afinar: ${f(sem0)}\n  ${jeito} ${ms} ms | ${SEMITONS > 0 ? "+" : ""}${SEMITONS}: ${f(afin)} → ${path.basename(destino)}`);
  }
}
