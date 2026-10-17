#!/usr/bin/env node
// Afinador ao vivo, conferido fora do navegador: lê a voz do Stazi sem afinar (Gemini Live "Zubenelgenubi", PCM 16 bits, 24 kHz,
// mono), fatia em pedaços de 100 ms e de 40 ms (como chegam ao vivo), passa pelo MESMO AfinadorStream do tocador
// (src/novo/app/tutor/voice/pitchShift.js) e grava WAV para comparar de ouvido com a referência aprovada pelo dono (ffmpeg:
// asetrate=24000*2^(3/12),aresample=24000,atempo=1/2^(3/12)). Não chama nenhuma API.
//
// Uso: node scripts/voz-teste/afinador-offline.mjs [--semitons 3] [--entrada pasta] [--saida pasta]
import fs from "node:fs";
import path from "node:path";
import { AfinadorStream } from "../../src/novo/app/tutor/voice/pitchShift.js";

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
