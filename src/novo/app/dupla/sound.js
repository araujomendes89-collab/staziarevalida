// Treino em Dupla · sons: apito do treinador, "Deu match!" e pular. Porte fiel dos números de App.jsx:1-32 (apito) e Match.jsx:30-88
// (fanfarra e pular) do pacote de design, sem cor e sem texto. A chave "sz-sound" ("off" desliga) vale para os três; o aparelho
// que não tem AudioContext fica em silêncio, sem erro.

const SOUND_KEY = "sz-sound";

/** Som ligado? Só o valor "off" em localStorage["sz-sound"] desliga. */
export function soundOn() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Liga ou desliga os sons e guarda a escolha neste aparelho. */
export function setSoundOn(on) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* sem armazenamento (janela privada): vale só até fechar a tela */
  }
}

/** Contexto de áudio único da página, criado na primeira vez e acordado se o navegador o suspendeu. */
function audioContext(options) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = window.__szAudio || (window.__szAudio = options ? new AC(options) : new AC());
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** Ruído branco pré-gerado (2,5 s) para o sopro do apito sair sem atraso. */
function noise(ctx, dur) {
  const need = Math.floor(ctx.sampleRate * dur);
  if (!window.__szNoise || window.__szNoise.length < need) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2.5), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    window.__szNoise = buf;
  }
  return window.__szNoise;
}

let wakeInstalled = false;

/**
 * Deixa o áudio pronto antes do clique: na primeira interação (pointerdown, keydown ou touchstart) cria/ativa o contexto e pré-gera
 * o ruído, para o apito não atrasar. Instala uma vez só, não importa quantas telas chamem.
 */
export function installAudioWake() {
  if (wakeInstalled || typeof window === "undefined") return;
  wakeInstalled = true;
  const wake = () => {
    try {
      const ctx = audioContext({ latencyHint: "interactive" });
      if (ctx) noise(ctx, 2);
    } catch {
      /* áudio indisponível */
    }
  };
  ["pointerdown", "keydown", "touchstart"].forEach((ev) => window.addEventListener(ev, wake, { capture: true, passive: true }));
}

/** Apito de treinador: tom duplo firme, sem trinado, 2 s em 1.400 Hz; vibra 800 ms. */
export function playWhistle() {
  try {
    if (!soundOn()) return;
    const ctx = audioContext();
    if (!ctx) return;
    const T = ctx.currentTime + 0.005;
    const DUR = 2;
    const F = 1400;
    const VOL = 0.75;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 6;
    comp.connect(ctx.destination);
    const out = ctx.createGain();
    out.connect(comp);
    out.gain.setValueAtTime(0.0001, T);
    out.gain.exponentialRampToValueAtTime(VOL, T + 0.02);
    out.gain.setValueAtTime(VOL, T + DUR - 0.08);
    out.gain.exponentialRampToValueAtTime(0.0001, T + DUR);
    [
      [F, 0.45],
      [F * 1.12, 0.4],
      [F * 2, 0.06],
    ].forEach(([f, v]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(f * 0.93, T);
      o.frequency.exponentialRampToValueAtTime(f, T + 0.04);
      o.frequency.setValueAtTime(f, T + DUR - 0.1);
      o.frequency.exponentialRampToValueAtTime(f * 0.97, T + DUR);
      g.gain.value = v;
      o.connect(g).connect(out);
      o.start(T);
      o.stop(T + DUR + 0.05);
    });
    const nz = ctx.createBufferSource();
    nz.buffer = noise(ctx, DUR);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = F;
    bp.Q.value = 3;
    const ng = ctx.createGain();
    ng.gain.value = 0.09;
    nz.connect(bp).connect(ng).connect(out);
    nz.start(T);
    nz.stop(T + DUR);
    if (navigator.vibrate) navigator.vibrate(800);
  } catch {
    /* áudio indisponível */
  }
}

/** "Deu match!": subida (whoosh), impacto grave, metais em Dó maior com abertura de filtro e brilho final. */
export function playMatchSound() {
  try {
    if (!soundOn()) return;
    const ctx = audioContext();
    if (!ctx) return;
    const T = ctx.currentTime + 0.02;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const master = ctx.createGain();
    master.gain.value = 1.1;
    master.connect(comp).connect(ctx.destination);
    const dl = ctx.createDelay();
    dl.delayTime.value = 0.11;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    master.connect(dl);
    dl.connect(fb).connect(dl);
    dl.connect(wet).connect(comp);
    const env = (g, t, a, peak, dur) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    };
    // 1. whoosh (ruído filtrado subindo)
    const len = Math.floor(ctx.sampleRate * 0.35);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (i / len);
    const nz = ctx.createBufferSource();
    nz.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, T);
    bp.frequency.exponentialRampToValueAtTime(6000, T + 0.32);
    const ng = ctx.createGain();
    env(ng, T, 0.25, 0.35, 0.36);
    nz.connect(bp).connect(ng).connect(master);
    nz.start(T);
    nz.stop(T + 0.4);
    const H = T + 0.3; // momento do impacto
    // 2. impacto grave (kick + sub)
    const k = ctx.createOscillator();
    const kg = ctx.createGain();
    k.type = "sine";
    k.frequency.setValueAtTime(160, H);
    k.frequency.exponentialRampToValueAtTime(42, H + 0.35);
    env(kg, H, 0.005, 1.0, 0.6);
    k.connect(kg).connect(master);
    k.start(H);
    k.stop(H + 0.65);
    // 3. metais: arpejo rápido + acorde
    const brass = (f, at, dur, vol) => {
      const t = H + at;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 3;
      lp.frequency.setValueAtTime(600, t);
      lp.frequency.exponentialRampToValueAtTime(5200, t + 0.08);
      lp.frequency.exponentialRampToValueAtTime(1800, t + dur);
      const g = ctx.createGain();
      env(g, t, 0.02, vol, dur);
      lp.connect(g).connect(master);
      [0, 6, -6].forEach((det) => {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
      });
    };
    [
      [392, -0.22],
      [523.25, -0.15],
      [659.25, -0.08],
    ].forEach(([f, at]) => brass(f, at, 0.16, 0.12));
    [261.63, 392, 523.25, 659.25, 783.99, 1046.5].forEach((f) => brass(f, 0, 1.5, f < 300 ? 0.14 : 0.09));
    // 4. brilho (sinos agudos em cascata)
    [
      [2093, 0.12],
      [2637, 0.2],
      [3136, 0.28],
      [4186, 0.38],
    ].forEach(([f, at]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      env(g, H + at, 0.005, 0.12, 0.7);
      o.connect(g).connect(master);
      o.start(H + at);
      o.stop(H + at + 0.75);
    });
    if (navigator.vibrate) setTimeout(() => navigator.vibrate([120, 60, 60, 40, 200]), 300);
  } catch {
    /* áudio indisponível */
  }
}

/** Som de "não deu match" ao pular: whoosh curto para a esquerda e duas notas descendo (Mi, depois Dó grave), suave. */
export function playSkipSound() {
  try {
    if (!soundOn()) return;
    const ctx = audioContext();
    if (!ctx) return;
    const T = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.22);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const nz = ctx.createBufferSource();
    nz.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1;
    bp.frequency.setValueAtTime(2500, T);
    bp.frequency.exponentialRampToValueAtTime(300, T + 0.2);
    const ng = ctx.createGain();
    ng.gain.value = 0.18;
    nz.connect(bp).connect(ng).connect(out);
    nz.start(T);
    nz.stop(T + 0.22);
    [
      [329.63, 0.06, 0.18],
      [196, 0.2, 0.38],
    ].forEach(([f, at, dur]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      o.type = "triangle";
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      o.frequency.setValueAtTime(f, T + at);
      o.frequency.exponentialRampToValueAtTime(f * 0.94, T + at + dur);
      g.gain.setValueAtTime(0.0001, T + at);
      g.gain.exponentialRampToValueAtTime(0.28, T + at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, T + at + dur);
      o.connect(lp).connect(g).connect(out);
      o.start(T + at);
      o.stop(T + at + dur + 0.05);
    });
    if (navigator.vibrate) navigator.vibrate(25);
  } catch {
    /* áudio indisponível */
  }
}
