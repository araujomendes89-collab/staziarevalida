// Nível de áudio (0..1) do microfone e da voz do professor, para a animação reagir ao som de verdade (não a um sorteio).
// Web Audio: AudioContext → MediaStreamAudioSourceNode → AnalyserNode; a cada quadro (requestAnimationFrame), o RMS do sinal,
// suavizado (anterior × 0,78 + atual × 0,22) para a esfera não tremer. Os valores ficam numa ref (sem redesenhar o React a cada
// quadro); quem desenha lê a ref.
import React from "react";
import { getAudioContext } from "./audioUnlock.js";

/** RMS normalizado de um bloco de amostras (0..1, com ganho para a fala comum chegar perto de 1). */
export function rmsLevel(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = (samples[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

export const smooth = (previous, current, keep = 0.78) => previous * keep + current * (1 - keep);

function meter(ctx, stream) {
  if (!ctx || !stream || typeof ctx.createMediaStreamSource !== "function") return null;
  try {
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(analyser); // sem ligar no destino: só mede (o som do professor sai pelo elemento de áudio)
    const buf = new Uint8Array(analyser.fftSize);
    return {
      read() {
        analyser.getByteTimeDomainData(buf);
        return rmsLevel(buf);
      },
      stop() {
        try {
          source.disconnect();
        } catch {
          // já desligado
        }
      },
    };
  } catch {
    return null;
  }
}

/**
 * Mede os dois lados. levels.current = { input, output } (0..1, suavizados). onFrame(levels) roda a cada quadro, para quem desenha.
 * enabled = false (ou movimento reduzido) desliga a medição.
 */
export function useAudioLevel({ input, output, enabled = true, onFrame }) {
  const levels = React.useRef({ input: 0, output: 0 });
  const frameCb = React.useRef(onFrame);
  frameCb.current = onFrame;
  React.useEffect(() => {
    if (!enabled) return undefined;
    const ctx = getAudioContext();
    const inM = meter(ctx, input);
    const outM = meter(ctx, output);
    let raf = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const l = levels.current;
      l.input = smooth(l.input, inM ? inM.read() : 0);
      l.output = smooth(l.output, outM ? outM.read() : 0);
      frameCb.current?.(l);
      raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(tick) : setTimeout(tick, 33);
    };
    tick();
    return () => {
      alive = false;
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
      clearTimeout(raf);
      inM?.stop();
      outM?.stop();
      levels.current = { input: 0, output: 0 };
    };
  }, [input, output, enabled]);
  return levels;
}
