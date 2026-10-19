// Stazia Voice Mode: a conversa por voz em tela cheia com o Tutor (como na referência enviada pelo dono). Fluxo: o aluno toca em
// "Conversar com o Tutor" → esta tela abre → a esfera aparece → a voz conecta → o professor abre a conversa → o aluno fala quando
// quiser (o sistema percebe sozinho quando ele começa e termina) → o professor responde e a esfera reage à voz dele → o aluno pode
// interromper falando por cima. Microfone liga e desliga sem encerrar; o chat abre por cima sem desligar a voz; fechar encerra a
// ligação, para microfone e alto-falante e libera o áudio do navegador.
// 17/10/2026: no lugar da esfera fica o personagem escolhido pelo aluno (Stazi ou Stazia), com as mesmas entradas da esfera
// (estado, emoção do servidor, nível do microfone e da voz). A animação só lê; nada aqui muda a lógica da voz.
// 18/10/2026 (pedidos do dono): sem "Falar"/"Enviar" (a conversa é mãos livres); o título é o nome do personagem (Stazi ou Stazia) e o
// selo mostra o jeito ("Tranquilo"); a fala NÃO aparece escrita durante a conversa (só o personagem e o estado: ouvindo, pensando,
// falando). "Legendas" (desligado por padrão, guardado por aluno) mostra o texto numa faixa própria, embaixo do personagem, que
// nunca fica atrás dele. Avisos importantes (modo reserva, sem minutos, microfone bloqueado) aparecem curtos na mesma faixa.
import React from "react";
import { createPortal } from "react-dom";
import { StaziaVoiceOrb, orbEmotion } from "./StaziaVoiceOrb.jsx";
import { PersonagemTutor } from "../personagens/PersonagemTutor.jsx";
import { PERSONAGENS, gravarPersonagem, personagemDaConversa, personagemDe } from "../personagens/personagens.js";
import "../personagens/escolha.css";
import { Icon } from "../../../ds";
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
 * jeitoLabel: o selo do jeito quando não é a voz ao vivo ("Modo reserva", "Por escrito"); a voz ao vivo não leva selo.
 * card: o que fica abaixo do personagem (o cartão da questão). Para escrever, o Chat abre por cima, na mesma conversa.
 * onWrite: quando a voz não abriu, "Escrever pelo Chat" pede antes à tela um jeito em que o Chat manda (a Nexus passa para por escrito).
 * captions / onCaptions: as Legendas (desligadas por padrão; quem guarda a escolha por aluno é a Nexus). Sem onCaptions, a escolha
 * fica só nesta tela. closing: o aluno tocou em Encerrar e o professor está se despedindo.
 * onBack / backLabel (relato de 19/10): "‹ Voltar" no topo, para sair da conversa SEM encerrar (quem abriu decide para onde volta;
 * o nome acessível diz o destino, ex.: "Voltar para a questão"). O Esc continua sendo o Encerrar.
 * note: um aviso da tela ou uma lista deles (todos aparecem na faixa, sem repetir).
 */
export function StaziaVoiceMode({ rt, persona, messages = [], avatar = null, entitlement = null, note = null, onClose, jeitoLabel = null, card = null, onWrite = null, personagem = null, motor = "2d", semitons = null, captions = undefined, onCaptions = null, closing = false, onBack = null, backLabel = "Voltar para a tela anterior" }) {
  const [chatOpen, setChatOpen] = React.useState(false);
  const [localCaptions, setLocalCaptions] = React.useState(false);
  const showCaptions = captions ?? localCaptions;
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
    if (onCaptions) onCaptions(v);
    else setLocalCaptions(v);
  };
  const setVolume = (v) => {
    setVolumeState(v);
    writePref("smn-voice-volume", v);
    rt.setVolume?.(v);
  };
  const enableSound = async () => {
    if (volume === 0) setVolume(1);
    const ok = await rt.enablePlayback?.();
    setPlaybackMessage(ok ? null : "Confira a saída de som e a permissão de áudio do navegador.");
  };
  React.useEffect(() => {
    rt.setVolume?.(volume);
    // volume salvo vale ao conectar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt.provider]);

  // tela cheia: a página de trás não rola; o foco começa no microfone e volta para quem abriu. O microfone fica desabilitado enquanto
  // a voz conecta: aí o foco fica no próprio diálogo (nunca na página de trás, onde o Tab sairia da tela de voz) e passa para o
  // microfone quando a voz conecta. Se quem abriu já saiu da tela (o "Começar"), quem devolve o foco é a camada do Tutor.
  // Sem rolar (preventScroll): no celular a tela de voz é mais alta que a janela e abre do topo (Voltar e questão), não no rodapé.
  React.useEffect(() => {
    const before = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const m = mic.current;
    if (m && !m.disabled) m.focus({ preventScroll: true });
    else dialog.current?.focus?.({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      if (before && before !== document.body && before.isConnected) before.focus?.();
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
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
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
  // avisos curtos: o da voz (ex.: "Não entendi, pode repetir?") e os da tela (ex.: modo reserva; na voz ao vivo, o aviso de minutos
  // E o motivo de uma troca que falhou — um não esconde o outro), sem repetir
  const avisos = [...new Set([rt.notice, ...[].concat(note)].filter(Boolean))];
  const shownNote = avisos[0] ?? null;
  const connected = ["ready", "listening", "thinking", "speaking", "interrupted", "paused"].includes(rt.state);
  // o foco ficou no próprio diálogo enquanto a voz conectava: com a voz pronta, vai para o microfone
  React.useEffect(() => {
    if (connected && !closing && document.activeElement === dialog.current && mic.current && !mic.current.disabled) mic.current.focus({ preventScroll: true });
  }, [connected, closing]);
  const quota = voiceQuotaText(entitlement, rt.remaining);
  const nome = PERSONAGENS[quem]?.nome ?? persona?.name ?? "Tutor";
  const tutorCaption = (rt.captions?.tutor ?? "").trim();
  const studentCaption = (rt.captions?.student ?? "").trim();
  // som parado pelo navegador (Safari): um toque volta
  const semSom = connected && rt.enablePlayback && (rt.playbackBlocked || rt.audioSuspended || volume === 0);

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
    <div className={`svm${card ? " svm--with-card" : ""}`} data-emo={semPersonagem ? undefined : emo.emotion} style={{ "--svm-emo-i": emo.intensity.toFixed(2) }} role="dialog" aria-modal="true" aria-labelledby="svm-title" aria-describedby="svm-desc" tabIndex={-1} ref={dialog} onKeyDown={onKey}>
      <div className="svm__top">
        {onBack && (
          <button type="button" className="svm__voltar" aria-label={backLabel} onClick={onBack}>
            <Icon name="chevron-left" size={22} />
            <span>Voltar</span>
          </button>
        )}
        <span className="svm__persona">{persona?.name ?? "Tutor"}</span>
        {jeitoLabel && <span className="svm__jeito">{jeitoLabel}</span>}
        {!semPersonagem && !personagemFixo && (
          <button type="button" className="svm__troca" onClick={trocarPersonagem} aria-label={`Trocar para ${PERSONAGENS[outro].genero === "a" ? "a" : "o"} ${PERSONAGENS[outro].nome}, ${PERSONAGENS[outro].papel}`}>
            Trocar para {PERSONAGENS[outro].nome}
          </button>
        )}
        <span className="svm__top-dir">
          {quota && <span className="svm__quota">{quota}</span>}
          <button type="button" className={`svm__legendas${showCaptions ? " is-on" : ""}`} aria-pressed={showCaptions} onClick={() => setShowCaptions(!showCaptions)}>
            Legendas
          </button>
        </span>
      </div>
      <div className="svm__head">
        <h2 id="svm-title" className="svm__title">{nome}</h2>
        <VoiceStatus state={closing ? "closing" : rt.state} muted={rt.muted} />
      </div>
      <p id="svm-desc" className="svm-sr">Conversa por voz com {nome}. Fale quando quiser; para interromper, é só falar. O microfone liga e desliga sem encerrar a conversa. As legendas mostram a conversa escrita.</p>

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

      {/* faixa própria, embaixo do personagem (nunca atrás dele): legenda (se ligada), avisos curtos e saídas de erro */}
      <div className="svm__faixa">
        {showCaptions && !err && rt.state !== "ended" && (
          <div className="svm__legenda" aria-live="polite">
            <VoiceCaptions show captions={{ tutor: tutorCaption || (rt.conferindo ?? ""), student: studentCaption }} />
          </div>
        )}
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
            <p className="svm__aviso" role="status">{shownNote ?? "A conversa por voz foi encerrada."}</p>
            <div className="svm__actions">
              <button type="button" className="svm__pill" onClick={() => rt.start()}>Conversar de novo</button>
            </div>
          </div>
        ) : (
          avisos.map((a) => <p key={a} className="svm__aviso" role="status">{a}</p>)
        )}
        {rt.micError && !avisos.includes(rt.micError) && <p className="svm__aviso" role="status">{rt.micError}</p>}
        {/* modo reserva no iPhone, caso raro: o medidor do navegador parou; um toque acorda o som (ou encerra a fala, se ele não voltar) */}
        {rt.meterDead > 0 && connected && (
          <div className="svm__actions">
            <button type="button" className="svm__pill" onClick={rt.wakeMeter}>{rt.meterDead >= 2 ? "Terminei de falar" : "Toque para eu voltar a te ouvir"}</button>
          </div>
        )}
        {rt.state === "speaking" && rt.provider === "tts" && (
          <div className="svm__actions">
            <button type="button" className="svm__pill" onClick={rt.interrupt}>Interromper</button>
          </div>
        )}
        {semSom && (
          <div className="svm__actions">
            <button type="button" className="svm__pill" onClick={enableSound}>Toque para ativar o som</button>
          </div>
        )}
        {playbackMessage && <p className="svm__aviso" role="status">{playbackMessage}</p>}
      </div>

      <VoiceControls
        muted={rt.muted}
        onToggleMute={rt.toggleMute}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((v) => !v)}
        onClose={onClose}
        micDisabled={!connected || closing}
        micRef={mic}
        closing={closing}
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
