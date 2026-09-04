import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Web Audio API synthesized soundtrack for Onboarding Splash (Etapa 1.26E.2).
 * Replaces cartoon boings with a sophisticated thump + soft chime and ambient pad/harmonics.
 * Fully synthesized via AudioContext, GainNodes, BiquadFilter, Convolver reverb and Oscillators.
 * Completely non-blocking: failure or autoplay blockage will NEVER hinder visual animations or route progression.
 */

function buildReverb(ctx: AudioContext, seconds: number, decay: number): ConvolverNode | null {
  try {
    const rate = ctx.sampleRate || 44100;
    const len = Math.floor(rate * seconds);
    if (len <= 0) return null;
    const impulse = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = impulse;
    return conv;
  } catch {
    return null;
  }
}

export function useSplashAudio(options: { reduceMotion: boolean }) {
  const [needsGesture, setNeedsGesture] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const dryBusRef = useRef<GainNode | null>(null);
  const reverbSendRef = useRef<GainNode | null>(null);
  const audioStartedRef = useRef(false);
  const activeOscillatorsRef = useRef<OscillatorNode[]>([]);

  const cleanup = useCallback(() => {
    try {
      activeOscillatorsRef.current.forEach((osc) => {
        try {
          osc.stop();
        } catch {
          // already stopped
        }
      });
      activeOscillatorsRef.current = [];
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
      audioContextRef.current = null;
      masterGainRef.current = null;
      dryBusRef.current = null;
      reverbSendRef.current = null;
      audioStartedRef.current = false;
    } catch {
      // safe error suppression
    }
  }, []);

  const ensureCtx = useCallback((): AudioContext | null => {
    try {
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        return audioContextRef.current;
      }
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);

      const dryBus = ctx.createGain();
      dryBus.gain.value = 1.0;
      dryBus.connect(master);

      const reverbSend = ctx.createGain();
      reverbSend.gain.value = 0.55;

      const convolver = buildReverb(ctx, 3.2, 2.6);
      const reverbReturn = ctx.createGain();
      reverbReturn.gain.value = 0.7;

      if (convolver) {
        reverbSend.connect(convolver);
        convolver.connect(reverbReturn);
        reverbReturn.connect(master);
      } else {
        reverbSend.connect(reverbReturn);
        reverbReturn.connect(master);
      }

      audioContextRef.current = ctx;
      masterGainRef.current = master;
      dryBusRef.current = dryBus;
      reverbSendRef.current = reverbSend;

      return ctx;
    } catch {
      return null;
    }
  }, []);

  const scheduleSfx = useCallback((ctx: AudioContext) => {
    if (!dryBusRef.current || !reverbSendRef.current) return;

    try {
      const dryBus = dryBusRef.current;
      const reverbSend = reverbSendRef.current;
      const t = ctx.currentTime + 0.02;

      interface VoiceOptions {
        type?: OscillatorType;
        detune?: number;
        cutoff?: number;
        attack?: number;
        reverb?: number;
      }

      // Voice helper: low-pass filter + chorus (2 detuned oscillators)
      const voice = (
        freq: number,
        start: number,
        dur: number,
        peakGain: number,
        opts: VoiceOptions = {}
      ) => {
        try {
          const type: OscillatorType = opts.type || "sine";
          const detune = opts.detune != null ? opts.detune : 5;
          const cutoff = opts.cutoff || 2600;
          const attack = opts.attack != null ? opts.attack : 0.05;

          const g = ctx.createGain();
          const filt = ctx.createBiquadFilter();
          filt.type = "lowpass";
          filt.frequency.value = cutoff;
          filt.Q.value = 0.5;

          g.gain.setValueAtTime(0.0001, start);
          g.gain.exponentialRampToValueAtTime(Math.max(peakGain, 0.001), start + attack);
          g.gain.exponentialRampToValueAtTime(0.0001, start + dur);

          [-detune, detune].forEach((d) => {
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.frequency.value = freq;
            osc.detune.value = d;
            const oscGain = ctx.createGain();
            oscGain.gain.value = 0.5;
            osc.connect(oscGain);
            oscGain.connect(filt);
            osc.start(start);
            osc.stop(start + dur + 0.05);
            activeOscillatorsRef.current.push(osc);
          });

          filt.connect(g);
          g.connect(dryBus);

          const send = ctx.createGain();
          send.gain.value = opts.reverb != null ? opts.reverb : 0.5;
          g.connect(send);
          send.connect(reverbSend);
        } catch {
          // safe error handling
        }
      };

      // Warm opening pad: fundamental (C3 approx 130.81 Hz) + 5th, smooth in and out
      const pad = (root: number, start: number, dur: number, peakGain: number) => {
        [root, root * 1.5].forEach((f, i) => {
          voice(f, start, dur, peakGain * (i === 0 ? 1 : 0.55), {
            type: "sine",
            detune: 4,
            cutoff: 900,
            attack: dur * 0.4,
            reverb: 0.4,
          });
        });
      };

      // Soft chime for jumps/impacts (replaces cartoon boing)
      const chime = (start: number, freq: number, dur: number, gainScale: number) => {
        voice(freq, start, dur, gainScale, {
          type: "sine",
          detune: 3,
          cutoff: 1800,
          attack: 0.006,
          reverb: 0.6,
        });
        voice(freq * 2, start, dur * 0.6, gainScale * 0.25, {
          type: "sine",
          detune: 2,
          cutoff: 3200,
          attack: 0.004,
          reverb: 0.5,
        });
      };

      // Low short sub-impact thump
      const thump = (start: number, gainScale: number) => {
        try {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(120, start);
          osc.frequency.exponentialRampToValueAtTime(48, start + 0.22);
          g.gain.setValueAtTime(0.0001, start);
          g.gain.exponentialRampToValueAtTime(gainScale, start + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
          osc.connect(g);
          g.connect(dryBus);
          osc.start(start);
          osc.stop(start + 0.3);
          activeOscillatorsRef.current.push(osc);
        } catch {
          // safe
        }
      };

      // 1. Opening warm pad (C3, approx 3.0s)
      pad(130.81, t, 3.0, 0.22);

      // 2. Three bounces / impacts: thump + chime
      thump(t + 0.93, 0.9);
      chime(t + 0.95, 987.77, 0.55, 0.16); // B5

      thump(t + 1.45, 0.55);
      chime(t + 1.47, 1108.73, 0.4, 0.11); // C#6

      thump(t + 1.92, 0.32);
      chime(t + 1.94, 1244.51, 0.3, 0.08); // D#6/Eb6

      // 3. Logo arpeggio (C5, E5, G5, B5, D6) starting at ~3.90s
      const chordUp = [523.25, 659.25, 783.99, 987.77, 1174.66];
      chordUp.forEach((f, i) => {
        chime(t + 3.9 + i * 0.11, f, 0.9, 0.14 - i * 0.012);
      });

      // 4. Intermediate melodic phrases
      chime(t + 5.6, 880.0, 0.7, 0.1); // A5
      chime(t + 6.9, 783.99, 0.8, 0.09); // G5
      chime(t + 8.3, 659.25, 0.9, 0.09); // E5

      // 5. Final resolution chord: deep bass C2 (~9.65s) + full Cmaj9 chord (C4, E4, G4, B4, D5) (~9.80s)
      voice(65.41, t + 9.65, 2.2, 0.2, {
        type: "sine",
        detune: 2,
        cutoff: 500,
        attack: 0.35,
        reverb: 0.3,
      }); // C2

      const finalChord = [261.63, 329.63, 392.0, 493.88, 587.33]; // C4, E4, G4, B4, D5
      finalChord.forEach((f, i) => {
        chime(t + 9.8 + i * 0.06, f, 1.8, 0.15);
      });
    } catch {
      // safe audio error suppression
    }
  }, []);

  const unlockAndPlay = useCallback(() => {
    if (audioStartedRef.current) return;
    try {
      const ctx = ensureCtx();
      if (!ctx) return;
      ctx
        .resume()
        .then(() => {
          if (ctx.state === "running") {
            if (audioStartedRef.current) return;
            audioStartedRef.current = true;
            setNeedsGesture(false);
            scheduleSfx(ctx);
          }
        })
        .catch(() => {});
    } catch {
      // safe
    }
  }, [ensureCtx, scheduleSfx]);

  useEffect(() => {
    if (options.reduceMotion) return;

    let mounted = true;
    const ctx = ensureCtx();
    if (ctx) {
      if (ctx.state === "running") {
        audioStartedRef.current = true;
        setNeedsGesture(false);
        scheduleSfx(ctx);
      } else {
        ctx
          .resume()
          .then(() => {
            if (!mounted) return;
            if (ctx.state === "running") {
              if (audioStartedRef.current) return;
              audioStartedRef.current = true;
              setNeedsGesture(false);
              scheduleSfx(ctx);
            } else {
              setNeedsGesture(true);
            }
          })
          .catch(() => {
            if (mounted) setNeedsGesture(true);
          });
      }
    }

    const handlePointerDown = () => {
      unlockAndPlay();
    };

    window.addEventListener("pointerdown", handlePointerDown, { once: true });

    return () => {
      mounted = false;
      window.removeEventListener("pointerdown", handlePointerDown);
      cleanup();
    };
  }, [options.reduceMotion, ensureCtx, scheduleSfx, unlockAndPlay, cleanup]);

  return {
    needsGesture,
    unlockAndPlay,
    cleanup,
  };
}
