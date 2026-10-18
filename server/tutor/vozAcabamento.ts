/**
 * ACABAMENTO DA VOZ DO PROFESSOR (no servidor, sem API): o mesmo caminho das 32 frases de espera aprovadas pelo dono
 * (scripts/voz-teste/gravar-frases-espera.ts), para a voz que lê as respostas soar igual a elas e à voz ao vivo:
 *
 *   1. afina com o MESMO afinador da voz ao vivo (AfinadorStream de src/novo/app/tutor/voice/pitchShift.js): o Stazi sobe +3
 *      semitons (efeito de desenho); a Stazia passa sem tocar em nada;
 *   2. tira o RUÍDO das pontas que o Gemini TTS entrega em todo arquivo (18/10, o "chiado" que o dono ouviu quando o professor
 *      termina de falar): ~170 ms de ruído largo e alto (−3 a −6 dB) depois de um silêncio no fim, e um estalo de ~20 ms no
 *      começo. O corte é por DETECÇÃO (energia + planura do espectro + silêncio antes), nunca por tempo fixo: fala não é cortada;
 *   3. apara o silêncio das pontas (janelas de 20 ms, 60 ms de folga; entrada suave de 20 ms e saída de 30 ms);
 *   4. iguala o volume ao das frases de espera do mesmo personagem (loudness EBU R128 integrada, com um limitador rápido que
 *      segura só os picos);
 *   5. MP3 mono 24 kHz 64 kbps (lamejs), como as frases de espera.
 *
 * O navegador toca o MP3 como chega (o tocador nunca afina o MP3 do professor: audioPlayer.js).
 */
import { afinarTudo } from "../../src/novo/app/tutor/voice/pitchShift.js";
import { pcmToMp3 } from "../podcasts/audio";
import { tirarRuidoDasPontas } from "./ruidoTts";

/** Muda quando o acabamento mudar: entra na versão da voz (nova audição e nova aprovação). */
// 18/10: sem o ruído das pontas do Gemini TTS (o "chiado"): o cache e a aprovação da voz mudam junto
export const ACABAMENTO_VERSAO = "sem-chiado-2026-10-18";
export const MP3_KBPS = 64;
/**
 * Volume medido nas frases de espera aprovadas (public/novo-assets/tutor/espera/manifesto.json, média de cada personagem):
 * Stazi −13,1 LUFS e Stazia −13,7 LUFS.
 */
export const LUFS_ALVO = { stazi: -13.1, stazia: -13.7 } as const;
/** Teto dos picos antes do MP3 (o MP3 passa ~2 a 3 dB do pico do PCM; as frases de espera usaram o mesmo teto). */
export const PICO_MAX_DB = -3.5;

export function pcmParaFloat(pcm: Buffer): Float32Array {
  const n = pcm.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = pcm.readInt16LE(i * 2) / 0x8000;
  return out;
}
export function floatParaPcm(a: Float32Array): Buffer {
  const b = Buffer.alloc(a.length * 2);
  for (let i = 0; i < a.length; i++) {
    const s = Math.max(-1, Math.min(1, a[i]));
    b.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), i * 2);
  }
  return b;
}

// o ruído das pontas do Gemini TTS sai por ruidoTts.ts (sem dependências: também serve aos podcasts)
export { fimDoEstaloInicial, inicioDoRuidoFinal, planura, tirarRuidoDasPontas } from "./ruidoTts";

/** Corta o silêncio das pontas: fala = janela de 20 ms com RMS acima de 500/32768 (o mesmo critério de aparar.mjs). */
export function apararPontas(a: Float32Array, taxa: number, folgaS = 0.06): Float32Array {
  const jan = Math.max(1, Math.round(taxa * 0.02));
  const limiar = 500 / 0x8000;
  const n = Math.floor(a.length / jan);
  let ini = -1;
  let fim = -1;
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = k * jan; i < (k + 1) * jan; i++) s += a[i] * a[i];
    if (Math.sqrt(s / jan) > limiar) {
      if (ini < 0) ini = k;
      fim = k;
    }
  }
  if (ini < 0) return a;
  const de = Math.max(0, Math.round(ini * jan - folgaS * taxa));
  const ate = Math.min(a.length, Math.round((fim + 1) * jan + folgaS * taxa));
  const out = a.slice(de, ate);
  // entrada suave de 20 ms e saída de 30 ms (sem estalo no começo nem no fim)
  const entra = Math.min(Math.round(taxa * 0.02), out.length >> 1);
  const sai = Math.min(Math.round(taxa * 0.03), out.length >> 1);
  for (let k = 0; k < entra; k++) out[k] *= k / entra;
  for (let k = 0; k < sai; k++) out[out.length - 1 - k] *= k / sai;
  return out;
}

/** Biquad (forma direta I) aplicado a um sinal inteiro. */
function biquad(x: Float64Array, b: [number, number, number], a: [number, number, number]): Float64Array {
  const [b0, b1, b2] = b.map((v) => v / a[0]);
  const [a1, a2] = [a[1] / a[0], a[2] / a[0]];
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

/**
 * Loudness integrada (LUFS) pela ITU-R BS.1770-4 (a mesma conta do ebur128 do ffmpeg): filtro K (prateleira alta + passa-altas,
 * coeficientes calculados para a taxa do áudio), blocos de 400 ms com 75% de sobreposição, porta absoluta de −70 LUFS e relativa
 * de −10 LU. Áudio mais curto que um bloco: o áudio inteiro é o bloco. Silêncio: −Infinity.
 */
export function loudnessLufs(a: Float32Array, taxa: number): number {
  if (!a.length) return -Infinity;
  // prateleira alta
  let G = 3.99984385397, Q = 0.7071752369554193, fc = 1681.9744509555319;
  let A = Math.pow(10, G / 40), w0 = (2 * Math.PI * fc) / taxa, al = Math.sin(w0) / (2 * Q), c = Math.cos(w0), sA = Math.sqrt(A);
  const shelf = biquad(Float64Array.from(a),
    [A * (A + 1 + (A - 1) * c + 2 * sA * al), -2 * A * (A - 1 + (A + 1) * c), A * (A + 1 + (A - 1) * c - 2 * sA * al)],
    [A + 1 - (A - 1) * c + 2 * sA * al, 2 * (A - 1 - (A + 1) * c), A + 1 - (A - 1) * c - 2 * sA * al]);
  // passa-altas
  Q = 0.5003270373253953; fc = 38.13547087613982; G = 0;
  w0 = (2 * Math.PI * fc) / taxa; al = Math.sin(w0) / (2 * Q); c = Math.cos(w0);
  const k = biquad(shelf, [(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al]);
  const bloco = Math.round(taxa * 0.4);
  const passo = Math.round(taxa * 0.1);
  const z: number[] = [];
  if (k.length <= bloco) {
    let s = 0;
    for (let i = 0; i < k.length; i++) s += k[i] * k[i];
    z.push(s / k.length);
  } else {
    for (let ini = 0; ini + bloco <= k.length; ini += passo) {
      let s = 0;
      for (let i = ini; i < ini + bloco; i++) s += k[i] * k[i];
      z.push(s / bloco);
    }
  }
  const lufs = (v: number) => -0.691 + 10 * Math.log10(v);
  const abs = z.filter((v) => v > 0 && lufs(v) > -70);
  if (!abs.length) return -Infinity;
  const rel = lufs(abs.reduce((s, v) => s + v, 0) / abs.length) - 10;
  const fim = abs.filter((v) => lufs(v) > rel);
  return lufs(fim.reduce((s, v) => s + v, 0) / fim.length);
}

/**
 * Ganho + limitador (como o alimiter das frases de espera: ataque de 3 ms, soltura de 60 ms): olha 3 ms à frente e abaixa o
 * ganho só onde o pico passaria do teto, depois volta devagar. Nenhuma amostra sai acima do teto.
 */
export function ganhoComLimite(a: Float32Array, taxa: number, ganhoDb: number, tetoDb = PICO_MAX_DB): Float32Array {
  const g = Math.pow(10, ganhoDb / 20);
  const teto = Math.pow(10, tetoDb / 20);
  const n = a.length;
  const precisa = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.abs(a[i] * g);
    precisa[i] = v > teto ? teto / v : 1;
  }
  // olhar à frente: o ganho de cada amostra é o menor dos próximos `ataque` (a redução começa antes do pico)
  const ataque = Math.max(1, Math.round(taxa * 0.003));
  const frente = new Float32Array(n);
  const fila: number[] = [];
  for (let i = n - 1; i >= 0; i--) {
    while (fila.length && precisa[fila[fila.length - 1]] >= precisa[i]) fila.pop();
    fila.push(i);
    while (fila[0] > i + ataque) fila.shift();
    frente[i] = precisa[fila[0]];
  }
  // rampa de descida ao longo do ataque (sem degrau) e soltura exponencial
  const soltura = Math.exp(-1 / (taxa * 0.06));
  const desce = 1 / ataque;
  const out = new Float32Array(n);
  let atual = 1;
  for (let i = 0; i < n; i++) {
    const alvo = frente[i];
    atual = alvo < atual ? Math.max(alvo, atual - desce) : alvo - (alvo - atual) * soltura;
    let v = a[i] * g * atual;
    if (Math.abs(v) > teto) v = Math.sign(v) * teto; // garantia final
    out[i] = v;
  }
  return out;
}

/** Sobe/abaixa até o volume alvo; o limitador tira um pouco, então mede de novo e corrige (até 3 passos, 0,3 LU). */
export function igualarVolume(a: Float32Array, taxa: number, alvoLufs: number): Float32Array {
  const medido = loudnessLufs(a, taxa);
  if (!Number.isFinite(medido)) return a;
  let ganho = alvoLufs - medido;
  let out = ganhoComLimite(a, taxa, ganho);
  for (let passo = 0; passo < 3; passo++) {
    const d = alvoLufs - loudnessLufs(out, taxa);
    if (Math.abs(d) < 0.3 || ganho > 30) break;
    ganho += d;
    out = ganhoComLimite(a, taxa, ganho);
  }
  return out;
}

export interface Acabamento {
  mp3: Buffer;
  segundos: number;
  lufs: number;
}

/** PCM 16 bits mono do serviço de voz → MP3 com o acabamento do personagem. */
export async function acabarVoz(pcm: Buffer, taxa: number, o: { semitons: number; lufs: number }): Promise<Acabamento> {
  // o ruído sai ANTES de afinar (o afinador espalharia o ruído do fim por cima da última sílaba)
  let a = tirarRuidoDasPontas(pcmParaFloat(pcm), taxa).audio;
  if (o.semitons) a = afinarTudo(a, { semitons: o.semitons, taxa }) as Float32Array;
  a = apararPontas(a, taxa);
  a = igualarVolume(a, taxa, o.lufs);
  const mp3 = await pcmToMp3(floatParaPcm(a), taxa, MP3_KBPS);
  return { mp3, segundos: a.length / taxa, lufs: loudnessLufs(a, taxa) };
}
