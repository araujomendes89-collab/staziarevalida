// A esfera do Nexus no modo de voz. Base: o vídeo enviado pelo dono (recortado só na esfera, sem a interface desenhada e sem
// som: public/novo-assets/tutor/stazia-voice-orb.mp4). Não há um vídeo por estado: o mesmo vídeo muda de velocidade, escala, brilho,
// contraste e cor, com anéis e partículas por cima, conforme o ESTADO da conversa, a EMOÇÃO que o servidor calculou e o NÍVEL do
// áudio (microfone ao ouvir, voz do professor ao falar). Sem o vídeo, uma esfera desenhada em CSS assume (mesma identidade).
// Com "reduzir movimento" no aparelho, o vídeo fica parado no primeiro quadro e os efeitos ficam mínimos.
import React from "react";
import { useAudioLevel } from "./useAudioLevel.js";
import "./voiceMode.css";

export const ORB_VIDEO = "/novo-assets/tutor/stazia-voice-orb.mp4";
export const ORB_POSTER = "/novo-assets/tutor/stazia-voice-orb.jpg";

/** Humor do motor do servidor → emoção da esfera (neutral · curious · happy · proud · skeptical · annoyed · angry · impressed). */
export const ORB_EMOTION = {
  neutral: "neutral", pleased: "happy", encouraged: "proud", impressed: "impressed", impatient: "skeptical", irritated: "annoyed",
  angry: "angry", disappointed: "skeptical", curious: "curious", happy: "happy", proud: "proud", skeptical: "skeptical", annoyed: "annoyed",
};

/** Avatar devolvido pelo servidor ({ emotion, intensity 0–100 }) → emoção e intensidade (0..1) da esfera. */
export function orbEmotion(avatar) {
  if (!avatar) return { emotion: "neutral", intensity: 0.3 };
  const emotion = ORB_EMOTION[avatar.emotion] ?? "neutral";
  const raw = Number(avatar.intensity);
  return { emotion, intensity: Number.isFinite(raw) ? Math.max(0, Math.min(1, raw > 1 ? raw / 100 : raw)) : 0.4 };
}

// Velocidade do vídeo por estado (a emoção e o som somam por cima).
const BASE_RATE = { idle: 0.6, connecting: 0.5, ready: 0.7, listening: 0.85, thinking: 0.45, speaking: 0.95, interrupted: 1.1, paused: 0.3, reconnecting: 0.4, ended: 0.4, error: 0.3 };
const HOT = new Set(["angry", "annoyed"]);
const WARM = new Set(["happy", "proud", "impressed"]);

export function usePrefersReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const get = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false);
  const [reduced, setReduced] = React.useState(get);
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(query);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/**
 * conversationState · emotion · emotionIntensity (0..1) · inputStream/outputStream (para o nível de áudio) · personality.
 * Os níveis (inputAudioLevel/outputAudioLevel) são medidos aqui, dos streams, e expostos como variáveis CSS:
 * --audio-input, --audio-output, --emotion-intensity, --orb-scale, --orb-glow, --ring-speed.
 */
export function StaziaVoiceOrb({ conversationState = "idle", emotion = "neutral", emotionIntensity = 0.3, inputStream = null, outputStream = null, personality = null, videoSrc = ORB_VIDEO, posterSrc = ORB_POSTER, onFrame = null }) {
  const root = React.useRef(null);
  const video = React.useRef(null);
  const [videoOk, setVideoOk] = React.useState(true);
  const reduced = usePrefersReducedMotion();
  const live = React.useRef({ ease: emotionIntensity, frame: 0 });
  Object.assign(live.current, { state: conversationState, emotion, intensity: emotionIntensity, onFrame });

  const paint = React.useCallback((l) => {
    const el = root.current;
    if (!el) return;
    const s = live.current;
    s.ease += (s.intensity - s.ease) * 0.04; // inércia: a emoção não pula de um extremo ao outro
    const speaking = s.state === "speaking";
    const listening = s.state === "listening" || s.state === "interrupted" || s.state === "ready";
    const audio = speaking ? l.output : listening ? l.input : 0;
    const hot = HOT.has(s.emotion);
    const warm = WARM.has(s.emotion);
    const scale = 1 + audio * (speaking ? 0.1 : 0.06) + (s.state === "thinking" ? -0.035 : 0) + (warm ? s.ease * 0.03 : 0);
    const glow = Math.min(1.1, 0.35 + audio * 0.6 + s.ease * (hot ? 0.3 : warm ? 0.2 : 0.1));
    const ring = Math.max(1.2, (hot ? 2.4 : warm ? 4.2 : 5.5) - audio * 2.5 - (s.state === "thinking" ? -2 : 0));
    el.style.setProperty("--audio-input", l.input.toFixed(3));
    el.style.setProperty("--audio-output", l.output.toFixed(3));
    el.style.setProperty("--emotion-intensity", s.ease.toFixed(3));
    el.style.setProperty("--orb-scale", scale.toFixed(3));
    el.style.setProperty("--orb-glow", glow.toFixed(3));
    el.style.setProperty("--ring-speed", `${ring.toFixed(2)}s`);
    // a velocidade do vídeo muda devagar (a cada ~6 quadros) para não engasgar
    if (++s.frame % 6 === 0 && video.current && !reduced) {
      const rate = (BASE_RATE[s.state] ?? 0.7) * (hot ? 1 + s.ease * 0.35 : 1) + audio * 0.5;
      const v = video.current;
      const next = Math.max(0.25, Math.min(2, Math.round(rate * 20) / 20));
      if (Math.abs((v.playbackRate || 1) - next) >= 0.05) v.playbackRate = next;
    }
    s.onFrame?.(l); // quem está fora da esfera (o botão do microfone) também reage ao som
  }, [reduced]);

  useAudioLevel({ input: inputStream, output: outputStream, enabled: !reduced, onFrame: paint });

  // sem medição (movimento reduzido): os valores de base ainda vão para o CSS
  React.useEffect(() => {
    if (reduced) paint({ input: 0, output: 0 });
  }, [reduced, conversationState, emotion, emotionIntensity, paint]);

  React.useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (reduced) {
      v.pause?.();
      return;
    }
    v.play?.()?.catch?.(() => {}); // sem gesto ainda: o pôster fica até tocar
  }, [reduced, videoOk]);

  // emenda do loop (o vídeo tem 10 s e não foi feito para repetir): um esmaecido curto esconde o salto
  const onTime = () => {
    const v = video.current;
    const el = root.current;
    if (!v || !el || !v.duration) return;
    el.classList.toggle("is-seam", v.currentTime > v.duration - 0.55 || v.currentTime < 0.25);
  };

  return (
    <div
      ref={root}
      className={`svm-orb is-${conversationState} emo-${emotion}${reduced ? " is-reduced" : ""}${videoOk ? "" : " is-fallback"}`}
      data-state={conversationState}
      data-emotion={emotion}
      data-personality={personality?.id ?? undefined}
      aria-hidden="true"
    >
      <div className="svm-orb__glow" />
      <div className="svm-orb__rings">
        <span />
        <span />
        <span />
      </div>
      <div className="svm-orb__core">
        {videoOk ? (
          <video
            ref={video}
            className="svm-orb__video"
            src={videoSrc}
            poster={posterSrc}
            muted
            loop
            autoPlay={!reduced}
            playsInline
            preload="auto"
            disablePictureInPicture
            onTimeUpdate={onTime}
            onError={() => setVideoOk(false)}
          />
        ) : (
          <div className="svm-orb__fallback" data-testid="orb-fallback" />
        )}
      </div>
      <div className="svm-orb__particles">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} style={{ "--i": i }} />
        ))}
      </div>
    </div>
  );
}
