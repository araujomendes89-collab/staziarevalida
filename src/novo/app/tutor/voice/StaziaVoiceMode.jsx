// Stazia Voice Mode: a conversa por voz em tela cheia com o Tutor (como na referência enviada pelo dono). Fluxo: o aluno toca em
// "Conversar com o Tutor" → esta tela abre → a esfera aparece → a voz conecta → o professor abre a conversa → o aluno fala quando
// quiser (o sistema percebe sozinho quando ele começa e termina) → o professor responde e a esfera reage à voz dele → o aluno pode
// interromper falando por cima. Microfone liga e desliga sem encerrar; o chat abre por cima sem desligar a voz; fechar encerra a
// ligação, para microfone e alto-falante e libera o áudio do navegador.
// 17/10/2026: no lugar da esfera fica o personagem escolhido pelo aluno (Stazi ou Stazia), com as mesmas entradas da esfera
// (estado, emoção do servidor, nível do microfone e da voz). A animação só lê; nada aqui muda a lógica da voz.
import React from "react";
import { createPortal } from "react-dom";
import { StaziaVoiceOrb, orbEmotion } from "./StaziaVoiceOrb.jsx";
import { PersonagemTutor } from "../personagens/PersonagemTutor.jsx";
import { PERSONAGENS, gravarPersonagem, personagemDaConversa, personagemDe } from "../personagens/personagens.js";
import "../personagens/escolha.css";
import { VoiceControls } from "./VoiceControls.jsx";
import { VoiceStatus } from "./VoiceStatus.jsx";
import { VoiceCaptions, VoiceChatSheet } from "./VoiceTranscript.jsx";
import { releaseAudioContext } from "./audioUnlock.js";
import { definirSemitonsDaVoz } from "./pitchShift.js";
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

// Se o personagem falhar ao carregar ou desenhar, a esfera de sempre assume (a conversa por voz não depende dele).
class PersonagemSeguro extends React.Component {
  state = { falhou: false };
  static getDerivedStateFromError() {
    return { falhou: true };
  }
  componentDidCatch() {
    this.props.onFalha?.();
  }
  render() {
    return this.state.falhou ? this.props.fallback : this.props.children;
  }
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * jeitoLabel: como o professor fala nesta conversa ("Voz do professor", "Voz reserva", "Por escrito"), ao lado do selo dele.
 * card: o que fica abaixo da esfera (o cartão da questão). Para escrever, o Chat abre por cima, na mesma conversa.
 * onWrite: quando a voz não abriu, "Escrever pelo Chat" pede antes à tela um jeito em que o Chat manda (a Nexus passa para por escrito).
 */
export function StaziaVoiceMode({ rt, persona, messages = [], avatar = null, entitlement = null, note = null, onClose, jeitoLabel = null, card = null, onWrite = null, personagem = null, motor = "2d", semitons = null }) {
  const [chatOpen, setChatOpen] = React.useState(false);
  const [showCaptions, setShowCaptionsState] = React.useState(() => readPref("smn-voice-captions", true));
  const [volume, setVolumeState] = React.useState(() => readPref("smn-voice-volume", 1));
  const [playbackMessage, setPlaybackMessage] = React.useState(null);
  const dialog = React.useRef(null);
  const mic = React.useRef(null);
  const emo = orbEmotion(avatar);
  const [quem, setQuem] = React.useState(() => personagem ?? personagemDaConversa(persona?.id));
  const [semPersonagem, setSemPersonagem] = React.useState(false);
  const outro = quem === "stazia" ? "stazi" : "stazia";
  // 17/10/2026: a voz e a personalidade são do personagem. Com uma personalidade conhecida (Durão, Tranquilo, Durona, Tranquila) o
  // personagem fica fixo na conversa; a troca no meio só existe para conversa antiga, de professor aposentado, e só muda o desenho
  // (a ligação, o microfone e a conversa seguem como estão).
  const personagemFixo = Boolean(personagemDe(persona?.id));
  // 17/10/2026: a voz ao vivo do personagem vem afinada pelo manifest (`voz.semitons`: Stazi +3, efeito de desenho; Stazia 0, sem
  // afinar). Vale o personagem DONO da voz (o da personalidade), nunca o desenho trocado de conversa antiga (essa voz não é dele).
  // A prop `semitons` passa por cima. A tela avisa o tocador da voz ao vivo (geminiLive/geminiPonte seguem definirSemitonsDaVoz);
  // quem abrir a ligação também pode passar `semitons` direto a openGeminiLive/openGeminiPonte.
  const donoDaVoz = personagemDe(persona?.id);
  const semitonsDaVoz = semitons ?? PERSONAGENS[donoDaVoz]?.voz?.semitons ?? 0;
  React.useEffect(() => {
    definirSemitonsDaVoz(semitonsDaVoz);
    return () => definirSemitonsDaVoz(0);
  }, [semitonsDaVoz]);
  const trocarPersonagem = () => {
    setQuem(outro);
    gravarPersonagem(outro);
  };

  const setShowCaptions = (v) => {
    setShowCaptionsState(v);
    writePref("smn-voice-captions", v);
  };
  const setVolume = (v) => {
    setVolumeState(v);
    writePref("smn-voice-volume", v);
    rt.setVolume?.(v);
  };
  const enableSound = async () => {
    if (volume === 0) setVolume(1);
    const ok = await rt.enablePlayback?.();
    setPlaybackMessage(ok ? "Som liberado." : "Confira a saída de som e a permissão de áudio do navegador.");
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

  // a Nexus pede o Chat aberto (microfone negado, transcrição que não entendeu)
  React.useEffect(() => {
    if (rt.chatRequest) setChatOpen(true);
  }, [rt.chatRequest]);

  const err = rt.state === "error" ? rt.error : null;
  const shownNote = note ?? rt.notice ?? null;
  const connected = ["ready", "listening", "thinking", "speaking", "interrupted", "paused"].includes(rt.state);
  const quota = voiceQuotaText(entitlement, rt.remaining);
  const hasCaption = Boolean((rt.captions?.tutor ?? "").trim() || (rt.captions?.student ?? "").trim());

  const onFrame = (l) => mic.current?.style.setProperty("--mic-level", (rt.muted ? 0 : l.input).toFixed(3));
  const esfera = (
    <StaziaVoiceOrb
      conversationState={rt.state}
      emotion={emo.emotion}
      emotionIntensity={emo.intensity}
      inputStream={rt.muted ? null : rt.streams?.input ?? null}
      outputStream={rt.streams?.output ?? null}
      personality={persona}
      onFrame={onFrame}
    />
  );

  return createPortal(
    <div className={`svm${card ? " svm--with-card" : ""}`} data-emo={semPersonagem ? undefined : emo.emotion} style={{ "--svm-emo-i": emo.intensity.toFixed(2) }} role="dialog" aria-modal="true" aria-labelledby="svm-title" aria-describedby="svm-desc" ref={dialog} onKeyDown={onKey}>
      <div className="svm__top">
        <span className="svm__persona">
          <span aria-hidden="true">{persona?.emoji ?? "🎙️"}</span>
          {persona?.name ?? "Professor"}
        </span>
        {jeitoLabel && <span className="svm__jeito">{jeitoLabel}</span>}
        {!semPersonagem && !personagemFixo && (
          <button type="button" className="svm__troca" onClick={trocarPersonagem} aria-label={`Trocar para ${PERSONAGENS[outro].genero === "a" ? "a" : "o"} ${PERSONAGENS[outro].nome}, ${PERSONAGENS[outro].papel}`}>
            Trocar para {PERSONAGENS[outro].nome}
          </button>
        )}
        {quota && <span className="svm__quota">{quota}</span>}
      </div>
      <div className="svm__head">
        <h2 id="svm-title" className="svm__title">Nexus</h2>
        <VoiceStatus state={rt.state} muted={rt.muted} />
      </div>
      <p id="svm-desc" className="svm-sr">Conversa por voz com o professor. Fale quando quiser; para interromper, é só falar. O microfone liga e desliga sem encerrar a conversa.</p>

      <div className="svm__stage">
        <PersonagemSeguro onFalha={() => setSemPersonagem(true)} fallback={esfera}>
          <PersonagemTutor
            personagem={quem}
            motor={motor}
            conversationState={rt.state}
            emotion={emo.emotion}
            emotionIntensity={emo.intensity}
            inputStream={rt.muted ? null : rt.streams?.input ?? null}
            outputStream={rt.streams?.output ?? null}
            personality={persona}
            onFrame={onFrame}
          />
        </PersonagemSeguro>
      </div>
      {card && <div className="svm__card">{card}</div>}

      {err ? (
        <div role="alert" style={{ width: "100%" }}>
          <div className="svm__error">{realtimeErrorMessage(err)}</div>
          <div className="svm__actions">
            {err.kind === "busy" && <button type="button" className="svm__pill" onClick={() => rt.start(true)}>Assumir aqui</button>}
            {["network", "timeout", "server", "mic", "no_mic"].includes(err.kind) && <button type="button" className="svm__pill" onClick={() => rt.start()}>Tentar de novo</button>}
            <button type="button" className="svm__pill" onClick={() => (onWrite?.(), setChatOpen(true))}>Escrever pelo Chat</button>
          </div>
        </div>
      ) : rt.state === "ended" ? (
        <div style={{ width: "100%" }}>
          <p className="svm__hint" role="status">{shownNote ?? "A conversa por voz foi encerrada."}</p>
          <div className="svm__actions">
            <button type="button" className="svm__pill" onClick={() => rt.start()}>Conversar de novo</button>
          </div>
        </div>
      ) : connected && !hasCaption ? (
        <p className="svm__hint">
          <strong>Fale com o Nexus...</strong>
          Experimente: “me explica pré-eclâmpsia” ou “me faz uma pergunta de pediatria”.
          {shownNote && <span style={{ display: "block", marginTop: 6 }}>{shownNote}</span>}
        </p>
      ) : (
        <>
          <VoiceCaptions show={showCaptions} captions={rt.captions} />
          {shownNote && <p className="svm__hint" role="status" style={{ marginTop: 4 }}>{shownNote}</p>}
        </>
      )}

      {rt.micError && <p className="svm__hint" role="status">{rt.micError}</p>}
      {/* frase de espera: a busca no material passou de ~600 ms (frasesEspera.ts, decisão do dono de 17/10) */}
      {rt.conferindo && <p className="svm__hint svm__conferindo" role="status">{rt.conferindo}</p>}

      {rt.tapToTalk && connected && rt.state === "ready" && !rt.muted && rt.streams?.input && (
        <div className="svm__actions">
          <p className="svm__hint" style={{ margin: 0 }}>Toque para falar</p>
          <button type="button" className="svm__pill" onClick={rt.talk}>Falar</button>
        </div>
      )}
      {rt.tapToTalk && rt.state === "listening" && (
        <div className="svm__actions">
          <button type="button" className="svm__pill" aria-label="Enviar a fala" onClick={rt.send}>Enviar</button>
        </div>
      )}

      {rt.state === "speaking" && rt.provider !== "live" && (
        <div className="svm__actions">
          <button type="button" className="svm__pill" onClick={rt.interrupt}>Interromper</button>
        </div>
      )}

      {connected && rt.enablePlayback && (
        <div className="svm__actions">
          <button type="button" className="svm__pill" onClick={enableSound}>
            {rt.playbackBlocked || volume === 0 ? "Ativar som do Nexus" : "Não ouvi a voz"}
          </button>
        </div>
      )}
      {playbackMessage && <p className="svm__hint" role="status">{playbackMessage}</p>}

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
