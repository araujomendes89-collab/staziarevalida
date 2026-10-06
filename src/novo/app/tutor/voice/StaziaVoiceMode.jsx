// Stazia Voice Mode: a conversa por voz em tela cheia com o Tutor (como na referência enviada pelo dono). Fluxo: o aluno toca em
// "Conversar com o Tutor" → esta tela abre → a esfera aparece → a voz conecta → o professor abre a conversa → o aluno fala quando
// quiser (o sistema percebe sozinho quando ele começa e termina) → o professor responde e a esfera reage à voz dele → o aluno pode
// interromper falando por cima. Microfone liga e desliga sem encerrar; o chat abre por cima sem desligar a voz; fechar encerra a
// ligação, para microfone e alto-falante e libera o áudio do navegador.
import React from "react";
import { createPortal } from "react-dom";
import { StaziaVoiceOrb, orbEmotion } from "./StaziaVoiceOrb.jsx";
import { VoiceControls } from "./VoiceControls.jsx";
import { VoiceStatus } from "./VoiceStatus.jsx";
import { VoiceCaptions, VoiceChatSheet } from "./VoiceTranscript.jsx";
import { releaseAudioContext } from "./audioUnlock.js";
import { realtimeErrorMessage } from "../useRealtimeVoice.js";
import "./voiceMode.css";

const readPref = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};
const writePref = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // navegação privada: vale só nesta tela
  }
};
const minutesOf = (s) => Math.max(0, Math.floor((Number(s) || 0) / 60));

/**
 * Tempo de voz que resta (números do servidor): "45 min de voz hoje"; no teste grátis, o de hoje e o do teste todo quando são
 * diferentes ("10 min hoje · 17 min no seu teste") ou só "17 min restantes no seu teste".
 */
export function voiceQuotaText(entitlement, remaining = null) {
  const v = entitlement?.voice;
  const left = remaining ?? v?.remaining_s ?? null;
  if (left == null) return null;
  if (entitlement?.mode === "trial") {
    const total = v?.remaining_total_s;
    if (total != null && minutesOf(total) !== minutesOf(left)) return `${minutesOf(left)} min hoje · ${minutesOf(total)} min no seu teste`;
    return `${minutesOf(left)} min restantes no seu teste`;
  }
  return `${minutesOf(left)} min de voz hoje`;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function StaziaVoiceMode({ rt, persona, messages = [], avatar = null, entitlement = null, note = null, onClose, onTextFallback }) {
  const [chatOpen, setChatOpen] = React.useState(false);
  const [showCaptions, setShowCaptionsState] = React.useState(() => readPref("smn-voice-captions", true));
  const [volume, setVolumeState] = React.useState(() => readPref("smn-voice-volume", 1));
  const dialog = React.useRef(null);
  const mic = React.useRef(null);
  const emo = orbEmotion(avatar);

  const setShowCaptions = (v) => {
    setShowCaptionsState(v);
    writePref("smn-voice-captions", v);
  };
  const setVolume = (v) => {
    setVolumeState(v);
    writePref("smn-voice-volume", v);
    rt.setVolume?.(v);
  };
  React.useEffect(() => {
    rt.setVolume?.(volume);
    // volume salvo vale ao conectar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt.provider]);

  // tela cheia: a página de trás não rola; o foco começa no microfone e volta para quem abriu
  React.useEffect(() => {
    const before = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (mic.current ?? dialog.current?.querySelector(FOCUSABLE))?.focus?.();
    return () => {
      document.body.style.overflow = overflow;
      before?.focus?.();
      releaseAudioContext();
    };
  }, []);

  const onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (chatOpen) setChatOpen(false);
      else onClose();
      return;
    }
    if (e.key !== "Tab" || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest("[aria-hidden='true']"));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const err = rt.state === "error" ? rt.error : null;
  const connected = ["ready", "listening", "thinking", "speaking", "interrupted", "paused"].includes(rt.state);
  const quota = voiceQuotaText(entitlement, rt.remaining);
  const hasCaption = Boolean((rt.captions?.tutor ?? "").trim() || (rt.captions?.student ?? "").trim());

  return createPortal(
    <div className="svm" role="dialog" aria-modal="true" aria-labelledby="svm-title" aria-describedby="svm-desc" ref={dialog} onKeyDown={onKey}>
      <div className="svm__top">
        <span className="svm__persona">
          <span aria-hidden="true">{persona?.emoji ?? "🎙️"}</span>
          {persona?.name ?? "Professor"}
        </span>
        {quota && <span className="svm__quota">{quota}</span>}
      </div>
      <div className="svm__head">
        <h2 id="svm-title" className="svm__title">Tutor Stazia</h2>
        <VoiceStatus state={rt.state} muted={rt.muted} />
      </div>
      <p id="svm-desc" className="svm-sr">Conversa por voz com o professor. Fale quando quiser; para interromper, é só falar. O microfone liga e desliga sem encerrar a conversa.</p>

      <div className="svm__stage">
        <StaziaVoiceOrb
          conversationState={rt.state}
          emotion={emo.emotion}
          emotionIntensity={emo.intensity}
          inputStream={rt.muted ? null : rt.streams?.input ?? null}
          outputStream={rt.streams?.output ?? null}
          personality={persona}
          onFrame={(l) => mic.current?.style.setProperty("--mic-level", (rt.muted ? 0 : l.input).toFixed(3))}
        />
      </div>

      {err ? (
        <div role="alert" style={{ width: "100%" }}>
          <div className="svm__error">{realtimeErrorMessage(err)}</div>
          <div className="svm__actions">
            {err.kind === "busy" && <button type="button" className="svm__pill" onClick={() => rt.start(true)}>Assumir aqui</button>}
            {["network", "timeout", "server", "mic", "no_mic"].includes(err.kind) && <button type="button" className="svm__pill" onClick={() => rt.start()}>Tentar de novo</button>}
            <button type="button" className="svm__pill" onClick={onTextFallback}>Continuar por texto</button>
          </div>
        </div>
      ) : rt.state === "ended" ? (
        <div style={{ width: "100%" }}>
          <p className="svm__hint" role="status">{note ?? "A conversa por voz foi encerrada."}</p>
          <div className="svm__actions">
            <button type="button" className="svm__pill" onClick={() => rt.start()}>Conversar de novo</button>
            <button type="button" className="svm__pill" onClick={onTextFallback}>Continuar por texto</button>
          </div>
        </div>
      ) : connected && !hasCaption ? (
        <p className="svm__hint">
          <strong>Fale com o Tutor Stazia...</strong>
          Experimente: “me explica pré-eclâmpsia” ou “me faz uma pergunta de pediatria”.
          {note && <span style={{ display: "block", marginTop: 6 }}>{note}</span>}
        </p>
      ) : (
        <>
          <VoiceCaptions show={showCaptions} captions={rt.captions} />
          {note && <p className="svm__hint" role="status" style={{ marginTop: 4 }}>{note}</p>}
        </>
      )}

      {rt.state === "speaking" && rt.provider !== "live" && (
        <div className="svm__actions">
          <button type="button" className="svm__pill" onClick={rt.interrupt}>Interromper</button>
        </div>
      )}

      <VoiceControls
        muted={rt.muted}
        onToggleMute={rt.toggleMute}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((v) => !v)}
        onClose={onClose}
        micDisabled={!connected}
        micRef={mic}
      />

      {chatOpen && (
        <VoiceChatSheet
          messages={messages}
          onSend={(t) => rt.sendText(t)}
          onClose={() => setChatOpen(false)}
          showCaptions={showCaptions}
          onToggleCaptions={setShowCaptions}
          volume={volume}
          onVolume={setVolume}
          canSend={connected}
        />
      )}
    </div>,
    document.body
  );
}
