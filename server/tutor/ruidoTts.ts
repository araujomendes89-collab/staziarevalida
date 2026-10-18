/**
 * RUÍDO DAS PONTAS DO GEMINI TTS (18/10/2026, o "chiado" que o dono ouviu quando o professor termina de falar). Medido nos arquivos
 * do gemini-3.8-flash-tts: a fala termina, vem ~250 ms de silêncio (−70 a −85 dBFS) e depois ~160 ms de RUÍDO BRANCO alto (−2 a
 * −6 dB RMS, pico perto de 0 dBFS, com um buraco de ~30 ms de zeros); no começo há um estalo de ~1 ms. O aparador por energia
 * achava que o ruído era fala (passa de −36 dBFS) e o igualador de volume ainda o subia.
 *
 * Aqui o corte é por DETECÇÃO, nunca por tempo fixo, para não comer sílaba: silêncio antes + trecho curto, alto e de espectro plano
 * (planura ~0,4; a voz fica abaixo de 0,1 em 90% das janelas). Conferido em 42 arquivos do TTS (todos cortados, 160 a 180 ms) e em
 * 64 gravações da voz ao vivo e de outras vozes (nenhum corte). Sem dependências: serve ao acabamento da voz do professor
 * (vozAcabamento.ts), aos podcasts e ao roteiro que limpou as frases de espera (scripts/voz-teste/limpar-chiado-espera.ts).
 */

/** FFT real simples (raiz 2, no lugar), só para medir a planura do espectro de janelas curtas. */
function potencia(seg: Float32Array, tam: number): Float64Array {
  const re = new Float64Array(tam);
  const im = new Float64Array(tam);
  for (let i = 0; i < seg.length && i < tam; i++) re[i] = seg[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (seg.length - 1)));
  for (let i = 1, j = 0; i < tam; i++) {
    let bit = tam >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= tam; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < tam; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
  const p = new Float64Array(tam / 2);
  for (let k = 1; k <= tam / 2; k++) p[k - 1] = re[k] * re[k] + im[k] * im[k] + 1e-12;
  return p;
}
/**
 * Planura do espectro até 7,5 kHz (0 = tom/voz; ~1 = ruído branco): média geométrica ÷ média aritmética da potência. Só até 7,5 kHz
 * porque o MP3 corta o agudo (o ruído de um MP3 deixaria de parecer ruído se a conta fosse até o fim do espectro).
 */
export function planura(seg: Float32Array, taxa = 24_000): number {
  const p = potencia(seg, 512);
  const ate = Math.max(8, Math.min(p.length, Math.floor((7500 / (taxa / 2)) * p.length)));
  let lg = 0, s = 0;
  for (let i = 0; i < ate; i++) {
    lg += Math.log(p[i]);
    s += p[i];
  }
  return Math.exp(lg / ate) / (s / ate);
}
const dbRms = (a: Float32Array, de: number, ate: number) => {
  let s = 0;
  for (let i = de; i < ate; i++) s += a[i] * a[i];
  return 10 * Math.log10(s / Math.max(1, ate - de) + 1e-18);
};
const mediana = (xs: number[]) => {
  const o = [...xs].sort((x, y) => x - y);
  return o.length ? o[o.length >> 1] : -Infinity;
};

/**
 * Ruído do fim (medido em 18/10 nos arquivos do Gemini TTS): depois da última sílaba vem um silêncio (abaixo de −45 dB) e, por
 * fim, um trecho curto (até 400 ms) de ruído LARGO (mediana da planura ≥ 0,25; o ruído fica em ~0,4 e a voz abaixo de 0,1 em 90%
 * das janelas, medido em 10 mil janelas de voz do TTS e da voz ao vivo) e ALTO
 * (mediana ≥ −15 dB; a voz raramente passa de −9 dB), às vezes com um buraco de zeros no meio. Só corta quando as três coisas
 * aparecem juntas; senão devolve o áudio como veio. Devolve onde o ruído começa (amostra) ou null.
 */
export function inicioDoRuidoFinal(a: Float32Array, taxa: number): number | null {
  const jan = Math.max(1, Math.round(taxa * 0.01));
  const n = Math.floor(a.length / jan);
  if (n < 12) return null;
  const db = (k: number) => dbRms(a, k * jan, (k + 1) * jan);
  // do fim para trás, até 450 ms: o primeiro silêncio de pelo menos 50 ms (abaixo de −50 dBFS; zeros exatos não contam, eles são
  // parte do ruído) marca onde o trecho final começa. Depois de afinar ou virar MP3, o buraco de zeros vira um "quase silêncio"
  // curto (menos de 50 ms), então ele não engana a busca.
  let corrida = 0;
  let inicio = -1;
  for (let k = n - 1; k >= Math.max(0, n - 46); k--) {
    const v = db(k);
    if (v < -50 && v > -170) {
      if (++corrida >= 5) {
        inicio = k + corrida;
        break;
      }
    } else corrida = 0;
  }
  if (inicio < 0) return null;
  const quadros = n - inicio;
  if (quadros < 6 || quadros > 40) return null;
  // alto e largo como ruído
  const niveis: number[] = [];
  for (let k = inicio; k < n; k++) {
    const v = db(k);
    if (v > -40) niveis.push(v);
  }
  const planuras: number[] = [];
  for (let i = inicio * jan; i + 2 * jan <= a.length; i += 2 * jan) {
    if (dbRms(a, i, i + 2 * jan) > -40) planuras.push(planura(a.subarray(i, i + 2 * jan), taxa));
  }
  if (niveis.length < 4 || mediana(niveis) < -15 || !planuras.length || mediana(planuras) < 0.25) return null;
  return inicio * jan;
}

/**
 * Estalo do começo (Gemini TTS: ~1 ms com pico perto de 0 dBFS; nas frases de espera, pico de −11 a −19 dBFS nos primeiros 5 ms):
 * até 40 ms com pico acima de −30 dBFS (janelas de 5 ms) seguidos de pelo menos 50 ms de silêncio (RMS abaixo de −45 dB). Devolve
 * onde a limpeza acaba (amostra), ou 0 quando o começo já é fala ou silêncio.
 */
export function fimDoEstaloInicial(a: Float32Array, taxa: number): number {
  const jan = Math.max(1, Math.round(taxa * 0.005));
  const n = Math.floor(a.length / jan);
  const pico = (k: number) => {
    let m = 0;
    for (let i = k * jan; i < (k + 1) * jan; i++) m = Math.max(m, Math.abs(a[i]));
    return 20 * Math.log10(m + 1e-12);
  };
  let k = 0;
  while (k < n && k < 8 && pico(k) > -30) k++;
  if (k === 0 || k >= 8) return 0;
  let quietos = 0;
  for (let q = k; q < n && dbRms(a, q * jan, (q + 1) * jan) < -45; q++) quietos++;
  return quietos >= 10 ? k * jan : 0;
}

/** Tira o ruído das pontas do Gemini TTS (o resto do áudio fica igual). `de`/`ate`: o trecho mantido, em amostras do original. */
export function tirarRuidoDasPontas(a: Float32Array, taxa: number): { audio: Float32Array; de: number; ate: number; cortadoNoComecoMs: number; cortadoNoFimMs: number } {
  const ate = inicioDoRuidoFinal(a, taxa) ?? a.length;
  const de = Math.min(fimDoEstaloInicial(a, taxa), ate);
  return {
    audio: de || ate < a.length ? a.slice(de, ate) : a, de, ate,
    cortadoNoComecoMs: Math.round((de / taxa) * 1000), cortadoNoFimMs: Math.round(((a.length - ate) / taxa) * 1000),
  };
}

/** O mesmo corte direto num PCM 16 bits mono (podcasts): devolve o PCM sem as pontas de ruído. */
export function tirarRuidoDoPcm(pcm: Buffer, taxa: number): Buffer {
  const n = pcm.length >> 1;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = pcm.readInt16LE(i * 2) / 0x8000;
  const r = tirarRuidoDasPontas(a, taxa);
  return r.de === 0 && r.ate === n ? pcm : pcm.subarray(r.de * 2, r.ate * 2);
}
