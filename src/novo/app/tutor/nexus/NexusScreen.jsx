// Nexus: a tela única do Stazia Tutor (spec do Tutor Nexus; prévia aprovada pelo dono em 2026-10-08). Fases: entrada (escolher o
// professor e o modo), conversa (a esfera em tela cheia, no computador e no celular), resumo (depois de Encerrar), histórico e
// só leitura. O toque em "Começar" libera o som e pede o microfone na hora (Safari e iPhone exigem o gesto); a conversa nasce com
// o professor escolhido e o servidor diz o jeito. Desde 18/10 (pedido do dono: "a conversa deve ser natural") a VOZ AO VIVO vem
// primeiro: o microfone abre uma vez e fica aberto, o próprio serviço de voz percebe a fala e o professor para quando o aluno fala
// por cima. Se ela não abrir (ponte fora, microfone bloqueado, minutos ao vivo no fim), a conversa passa SOZINHA para o modo
// reserva (a voz do professor em cascata, também sem toques) ou por escrito, com um aviso curto. Na conversa por voz a fala do
// Tutor não aparece escrita (só o personagem e o estado); "Legendas" liga a legenda numa faixa própria (escolha guardada por aluno).
import React from "react";
import { useSession } from "../../session.jsx";
import { nexusApi, tutorOpening, tutorPrepareOpening, tutorServerStatus, withOpening } from "../api.js";
import { ERROR_CLASS, modeLabel } from "../labels.js";
import { nomeSubareaOuNada } from "../../practice/taxonomia.js";
import { Button } from "../../../ds";
import { realtimeErrorMessage, useRealtimeVoice } from "../useRealtimeVoice.js";
import { MIC_CONSTRAINTS } from "../voice/microfone.js";
import { StaziaVoiceMode } from "../voice/StaziaVoiceMode.jsx";
import { PersonagemTutor } from "../personagens/PersonagemTutor.jsx";
import { PERSONAGENS, marcarNoPerfil, personagemDaConversa, personagemDe } from "../personagens/personagens.js";
import { unlockAudio } from "../voice/audioUnlock.js";
import { TutorGate } from "./TutorGate.jsx";
import { NexusLobby } from "./NexusLobby.jsx";
import { QuestionCard } from "./QuestionCard.jsx";
import { useNexusVoice } from "./useNexusVoice.js";
import "./nexus.css";
import { explainError } from "../../../../shared/errors/explicarErro";

/** Selo do jeito ao lado do nome do personagem: a voz ao vivo (o normal) não leva selo. */
export const JEITO_LABEL = { aovivo: null, eleven: "Modo reserva", escrito: "Por escrito" };
/** Avisos curtos, sem jargão (a tela de voz mostra numa faixa própria, nunca atrás do personagem). */
export const AVISO = {
  reserva: "Modo reserva: a conversa continua, com respostas um pouco mais lentas.",
  semMinutos: "Seus minutos de voz ao vivo acabaram. A conversa continua no modo reserva.",
  escrito: "A voz não está disponível agora. A conversa continua por escrito no Chat.",
};
/** Instrução da despedida (a voz ao vivo cria a frase na hora; nada de texto fixo). */
export const FAREWELL_INSTRUCTION =
  "Instrução do sistema (não leia esta instrução em voz alta): o aluno tocou em Encerrar. Despeça-se agora numa frase curta, de no máximo 20 palavras, do seu jeito, retomando o que vocês estudaram e, se fizer sentido, o próximo passo. Não faça pergunta.";
/** Legendas na conversa por voz: desligadas por padrão; a escolha fica guardada por conta neste aparelho. */
const LEGENDAS = "smn-voz-legendas";
const lerLegendas = (conta) => {
  try {
    return window.localStorage.getItem(`${LEGENDAS}:${conta ?? "anonimo"}`) === "1";
  } catch {
    return false;
  }
};
const gravarLegendas = (conta, on) => {
  try {
    window.localStorage.setItem(`${LEGENDAS}:${conta ?? "anonimo"}`, on ? "1" : "0");
  } catch {
    // navegação privada: vale só nesta tela
  }
};
export const PROFESSOR_CHANGED = "Este professor mudou. Comece uma conversa nova.";
const messageOf = (error) => explainError(error);

/** Argumentos de app_tutor_start: o modo, o professor e o contexto ("Me teste" pelos pontos fracos; "Perguntar" livre). */
export function startArgs(personalityId, mode, request = null) {
  const context = request?.context ?? (mode === "livre" ? { type: "free" } : mode === "perguntas" ? { type: "weak_points" } : null);
  return { p_mode: mode, p_topic: request?.topic ?? null, p_question_id: request?.questionId ?? null, p_context: context, p_personality: personalityId };
}

/**
 * overlay: a Nexus aberta por outra tela (Correção, Caderno de erros, Flashcards, Temas, Desempenho), numa camada por cima que não
 * desmonta a tela de baixo; `request` trava o modo (e a questão ou o tema) e só se escolhe o professor.
 */
export function NexusScreen({ go, overlay = false, request = null, onClose }) {
  const frame = overlay
    ? (node) => (
        <div className="nx-gate">
          <div className="nx-gate__top">
            <button type="button" className="nx-pill nx-pill--light" aria-label="Fechar o Tutor" onClick={onClose}>Fechar</button>
          </div>
          {node}
        </div>
      )
    : undefined;
  const gate = (
    <TutorGate go={go} frame={frame}>
      {(status, refresh) => <Nexus status={status} refresh={refresh} overlay={overlay} request={request} onClose={onClose} go={go} />}
    </TutorGate>
  );
  if (!overlay) return gate;
  return (
    <div className="nx-overlay" role="dialog" aria-modal="true" aria-label="Tutor">
      {gate}
    </div>
  );
}

function Nexus({ status: statusLido, refresh, overlay, request, onClose, go = null }) {
  const { backend, user } = useSession();
  const conta = user?.id ?? null;
  // O status do Tutor é lido ao abrir. O que o perfil confirmou depois (troca de personagem, conversa começada) fica aqui por cima
  // dele, para a entrada não voltar ao personagem antigo quando o aluno sai dela e volta; o status relido em seguida substitui.
  const [confirmado, setConfirmado] = React.useState(null); // { base: status a que vale, prefs }
  const statusRef = React.useRef(statusLido);
  statusRef.current = statusLido;
  const status = confirmado?.base === statusLido ? { ...statusLido, preferences: { ...(statusLido.preferences ?? {}), ...confirmado.prefs } } : statusLido;
  const confirmar = React.useCallback((prefs) => {
    setConfirmado((c) => {
      const base = statusRef.current;
      return { base, prefs: { ...(c?.base === base ? c.prefs : {}), ...prefs } };
    });
    refresh().catch(() => {});
  }, [refresh]);
  const [phase, setPhase] = React.useState("lobby"); // lobby | conversation | summary | history | readonly
  const [nexus, setNexus] = React.useState(null);
  const [server, setServer] = React.useState({ live: false, hint: null });
  const [session, setSession] = React.useState(null);
  const [opened, setOpened] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null); // { message, code }
  const [sessions, setSessions] = React.useState(null);
  const mic = React.useRef(null); // microfone pedido no toque do "Começar", guardado para a conversa (voz do professor)
  const starting = React.useRef(false);
  const pending = React.useRef(null); // conversa criada que esbarrou em outra aba aberta ("Assumir aqui")
  const sampleAudio = React.useRef(null);
  const liveStarted = React.useRef(null);
  const ttsStarted = React.useRef(null);
  const [micStream, setMicStream] = React.useState(null);
  const [fallback, setFallback] = React.useState(null); // { note, caption }: a voz que estava falando parou e outro jeito assumiu
  const [picked, setPicked] = React.useState(null); // letra marcada na voz ao vivo (a voz do professor guarda a dela)
  // cartão da questão na voz ao vivo: o motivo de uma recusa (aparece no próprio cartão; antes ficava atrás do aviso de minutos) e o
  // "carregando" de Responder/Próxima (um toque só)
  const [cardNote, setCardNote] = React.useState(null);
  const [cardBusy, setCardBusy] = React.useState(false);
  const cardBusyRef = React.useRef(false);
  const [legendas, setLegendasState] = React.useState(() => lerLegendas(conta));
  const setLegendas = (on) => {
    setLegendasState(on);
    gravarLegendas(conta, on);
  };
  const [closing, setClosing] = React.useState(false); // tocou em Encerrar: o professor se despede
  const [farewell, setFarewell] = React.useState(null); // a frase de despedida dita agora (mostrada no fim)
  const skipped = React.useRef(new Set()); // jeitos que já falharam nesta conversa (a troca não volta para eles)
  const closingRef = React.useRef(null);
  const micDenied = React.useRef(false); // o aluno (ou o aparelho) negou o microfone no toque do "Começar"
  // o aviso do modo reserva é curto: some depois de alguns segundos (o selo "Modo reserva" continua no topo)
  React.useEffect(() => {
    if (fallback?.note !== AVISO.reserva) return undefined;
    const t = setTimeout(() => setFallback((f) => (f?.note === AVISO.reserva ? { ...f, note: null } : f)), 10_000);
    return () => clearTimeout(t);
  }, [fallback?.note]);
  const sessionRef = React.useRef(null);
  sessionRef.current = session;

  const consentLost = (e) => e?.code === "tutor_consent" && (refresh().catch(() => {}), true);

  // por cima de outra tela: Esc fecha (na conversa, o Esc é da tela de voz e encerra a conversa)
  React.useEffect(() => {
    if (!overlay || phase === "conversation") return undefined;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, phase, onClose]);

  React.useEffect(() => {
    let alive = true;
    nexusApi.status(backend).then((n) => alive && setNexus(n), (e) => alive && !consentLost(e) && setNexus(null));
    if (status.voice_enabled) tutorServerStatus(backend).then((s) => alive && setServer({ live: Boolean(s?.live_voice), hint: s?.voice_hint ?? null }), () => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, status.voice_enabled]);

  const reload = async () => {
    const s = await backend.rpc("app_tutor_session", { p_session_id: sessionRef.current.id });
    setSession(s);
    return s;
  };
  /**
   * Relê a conversa para o cartão acompanhar o servidor (relato de 19/10: a voz ao vivo responde e abre a próxima questão pelas
   * ferramentas; o cartão ficava na questão antiga e o "Próxima" era recusado). Questão nova: a letra marcada e o aviso antigo somem.
   */
  const syncCard = async () => {
    const antes = sessionRef.current?.question?.id ?? null;
    if (!sessionRef.current) return null;
    const s = await reload();
    if ((s?.question?.id ?? null) !== antes) {
      setPicked(null);
      setCardNote(null);
    }
    return s;
  };
  /** Responder/Próxima do cartão na voz ao vivo: um toque só (o botão fica desabilitado enquanto o banco responde). */
  const cardAction = async (fn) => {
    if (cardBusyRef.current) return;
    cardBusyRef.current = true;
    setCardBusy(true);
    try {
      await fn();
    } finally {
      cardBusyRef.current = false;
      setCardBusy(false);
    }
  };
  // as falas da conversa por voz aparecem no Chat (a mesma conversa; o servidor grava e confere)
  const appendMessage = (m) =>
    setSession((s) => (s ? { ...s, messages: [...(s.messages ?? []), { id: m.id ?? `nx-${Date.now()}-${(s.messages ?? []).length}`, role: m.role, content: m.content, voice: true }] } : s));
  // voz ao vivo (o servidor encerra a chamada da voz do professor ao abrir esta)
  const [liveAvatar, setLiveAvatar] = React.useState(null);
  const [liveNote, setLiveNote] = React.useState(null);
  const live = useRealtimeVoice({
    backend, sessionId: session?.id ?? null, live: server.live, hint: server.hint,
    onTranscript: (role, said) => appendMessage({ role, content: said }), onWarning: setLiveNote, onAvatar: setLiveAvatar,
    // a própria voz respondeu ou abriu a próxima questão no servidor: o cartão relê a conversa
    onSessionChange: () => void syncCard().catch(() => {}),
  });
  // voz do professor e por escrito: o turno pelo motor do Tutor
  const ttsRef = React.useRef(null);
  const tts = useNexusVoice({
    backend, session, jeito: opened?.jeito ?? null, voiceCallId: opened?.voice_call_id ?? null, micStream, canListen: Boolean(opened?.mic),
    onSession: reload, onMessage: appendMessage,
    // a chamada acabou no servidor e o aluno tocou em "Conversar de novo" aqui: abre outra, assumindo esta aba
    onReopen: () => void openSession(sessionRef.current, true),
    onFallback: (code, message, caption = null) => {
      if (code === "tutor_consent") return void refresh().catch(() => {});
      // a voz do professor parou (limite, teto, aprovação, falha): a chamada dela fecha e o servidor escolhe o que sobra (a voz ao
      // vivo, se ela ainda não falhou nesta conversa; senão por escrito), com a mensagem e a legenda mantidas
      setFallback({ note: message, caption: caption ?? ttsRef.current?.captions?.tutor ?? "" });
      void (async () => {
        await Promise.resolve(ttsRef.current?.stop?.({ keepState: true })).catch(() => {});
        await switchJeito("eleven");
      })();
    },
  });
  ttsRef.current = tts;
  React.useEffect(() => {
    // sem chamada (voz desligada no painel), a conversa por escrito também começa
    const key = opened?.voice_call_id ?? (opened?.jeito === "escrito" && session?.id ? `escrito:${session.id}` : null);
    if (phase === "conversation" && (opened?.jeito === "eleven" || opened?.jeito === "escrito") && key && ttsStarted.current !== key) {
      ttsStarted.current = key;
      tts.start();
    }
  }, [phase, opened?.jeito, opened?.voice_call_id, session?.id, tts]);
  React.useEffect(() => {
    if (phase === "conversation" && opened?.jeito === "aovivo" && session?.id && liveStarted.current !== session.id) {
      liveStarted.current = session.id;
      // microfone bloqueado no toque do "Começar": nem tenta a voz ao vivo (não pede de novo); segue no modo reserva com o aviso
      if (micDenied.current) {
        if (skipped.current.has("aovivo")) return;
        setFallback({ note: realtimeErrorMessage({ kind: "mic" }), caption: "" });
        void switchJeito("aovivo");
        return;
      }
      // o microfone pedido no toque do "Começar" segue para a voz ao vivo (sem pedir de novo depois da espera); vai uma cópia, para o
      // original continuar aberto se a conversa precisar passar para o modo reserva
      live.start(false, { stream: mic.current?.clone?.() ?? mic.current });
    }
  }, [phase, opened?.jeito, session?.id, live]);
  // a voz ao vivo não abriu ou parou (ponte fora, microfone bloqueado, minutos no fim, rede): passa sozinha para o modo reserva
  React.useEffect(() => {
    const e = live.error;
    if (!e) return;
    if (e.code === "tutor_consent") return void refresh().catch(() => {});
    // (os minutos que acabam no meio da conversa chegam aqui também: o servidor encerra a ligação com kind "quota")
    if (phase !== "conversation" || opened?.jeito !== "aovivo" || e.kind === "busy" || closingRef.current || skipped.current.has("aovivo")) return;
    const note = e.kind === "quota" ? AVISO.semMinutos : e.kind === "mic" || e.kind === "no_mic" ? realtimeErrorMessage(e) : AVISO.reserva;
    setFallback({ note, caption: "" });
    void switchJeito("aovivo");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.error, phase, opened?.jeito]);
  /**
   * Troca o jeito no meio da conversa (esta aba assume): skip "aovivo" sem a voz ao vivo; "eleven" sem a voz do professor; "voice"
   * sem as duas. O que já falhou nesta conversa não volta (a voz ao vivo caiu e depois a do professor: por escrito).
   */
  const switchJeito = async (skip) => {
    const s = sessionRef.current;
    if (!s) return;
    skipped.current.add(skip);
    const pular = skipped.current.has("voice") || (skipped.current.has("aovivo") && skipped.current.has("eleven")) ? "voice" : skip;
    if (skip === "voice" || skip === "aovivo") void Promise.resolve(live.stop?.()).catch(() => {});
    try {
      const o = await nexusApi.open(backend, s.id, true, pular);
      if (o.jeito !== "aovivo" && !o.mic) releaseMic(); // sem microfone liberado (CF02) não fica nada aberto
      else if (o.jeito !== "aovivo" && !micLive()) mic.current = await askMic(); // a voz ao vivo fechou o microfone dela
      setMicStream(o.jeito === "aovivo" || !o.mic ? null : mic.current);
      liveStarted.current = null;
      ttsStarted.current = null;
      setOpened(o);
      // por escrito: fica o motivo que o servidor deu (ex.: "Você usou sua voz de hoje"); sem motivo, o aviso curto
      if (o.jeito === "escrito") setFallback((f) => ({ caption: "", ...(f ?? {}), note: f?.note && f.note !== AVISO.reserva && f.note !== AVISO.semMinutos ? f.note : AVISO.escrito }));
    } catch (e) {
      if (!consentLost(e)) setFallback((f) => ({ caption: "", ...(f ?? {}), note: messageOf(e) }));
    }
  };

  const micLive = () => Boolean(mic.current?.getAudioTracks?.().some((t) => t.readyState === "live"));
  const askMic = () => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
    if (micDenied.current) return Promise.resolve(null); // já foi negado nesta conversa: não pergunta de novo
    return md?.getUserMedia ? md.getUserMedia(MIC_CONSTRAINTS).catch(() => null) : Promise.resolve(null);
  };

  const releaseMic = () => {
    mic.current?.getTracks?.().forEach((t) => t.stop());
    mic.current = null;
  };
  React.useEffect(() => () => releaseMic(), []);

  /** O microfone é pedido nesta conversa? (voz ligada, navegador com microfone e alguma voz que ouça o aluno) */
  const micAsked = () => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
    const noMic = Boolean(nexus) && !nexus.stt && !(nexus.live ?? nexus.reserve);
    return Boolean(status.voice_enabled && !noMic && md?.getUserMedia);
  };
  /** O gesto do aluno: libera o som e pede o microfone antes de qualquer espera (Safari e iPhone). */
  const gesture = () => {
    unlockAudio();
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
    // sem transcrição liberada a esta pessoa (CF02) e sem voz ao vivo, o microfone nem é pedido
    const noMic = Boolean(nexus) && !nexus.stt && !(nexus.live ?? nexus.reserve);
    // eco cancelado e supressão de ruído (o professor sai pelo alto-falante); o mesmo microfone serve à voz ao vivo e à reserva
    return status.voice_enabled && !noMic && md?.getUserMedia ? md.getUserMedia(MIC_CONSTRAINTS).catch(() => null) : Promise.resolve(null);
  };

  const openSession = async (s, force = false) => {
    try {
      const o = await nexusApi.open(backend, s.id, force);
      pending.current = null;
      setError(null);
      // a abertura criada agora pela IA (o servidor já trocou a reserva no banco)
      setSession(withOpening(s, o.opening));
      setOpened(o);
      // começou já no modo reserva (a voz ao vivo não está disponível para esta conta agora): o aviso curto aparece
      setFallback(o.jeito === "eleven" ? { note: o.live_minutes === 0 && nexus?.live === false ? AVISO.semMinutos : AVISO.reserva, caption: "" } : null);
      skipped.current = new Set();
      setFarewell(null);
      setClosing(false);
      closingRef.current = null;
      setPicked(null);
      setCardNote(null);
      setLiveNote(null);
      setLiveAvatar(null);
      if (o.jeito !== "aovivo" && !o.mic) releaseMic(); // sem microfone liberado (CF02) não fica nada aberto
      setMicStream(o.jeito === "aovivo" || !o.mic ? null : mic.current);
      liveStarted.current = null;
      ttsStarted.current = null;
      setPhase("conversation");
    } catch (e) {
      if (consentLost(e)) return;
      if (e.code === "busy") pending.current = s;
      else releaseMic();
      setError({ message: messageOf(e), code: e.code ?? null });
    }
  };

  const begin = (personalityId, mode) => {
    if (starting.current) return; // toque duplo: uma conversa só
    starting.current = true;
    setBusy(true);
    setError(null);
    const micP = gesture();
    void (async () => {
      try {
        const s = await backend.rpc("app_tutor_start", startArgs(personalityId, mode, request));
        // a conversa grava a personalidade (e o personagem dela) no perfil
        const quem = personagemDe(s?.personality);
        if (quem) {
          marcarNoPerfil(conta, quem);
          confirmar({ personality_id: s.personality.id, character: quem });
        }
        releaseMic();
        mic.current = await micP;
        micDenied.current = micAsked() && !mic.current;
        await openSession(s);
      } catch (e) {
        if (!consentLost(e)) setError({ message: messageOf(e), code: e.code ?? null });
        releaseMic();
      } finally {
        starting.current = false;
        setBusy(false);
      }
    })();
  };

  // abertura preparada (17/10): a escolha atual da entrada, para a abertura já estar pronta quando o aluno tocar em "Começar"
  const prepareOpening = React.useCallback((personalityId, mode) => {
    void tutorPrepareOpening(backend, startArgs(personalityId, mode, request));
  }, [backend, request]);

  const takeOver = () => {
    const s = pending.current;
    if (!s || starting.current) return;
    starting.current = true;
    setBusy(true);
    void openSession(s, true).finally(() => {
      starting.current = false;
      setBusy(false);
    });
  };

  // o personagem tocado na entrada vai para o perfil do aluno (vale em qualquer aparelho); a entrada não espera a resposta
  // depois que o perfil confirma, a Nexus guarda a resposta e relê o status (sem "Carregando"), para valer ao voltar à entrada
  const envioPersonagem = React.useRef(0);
  const savePersonagem = React.useCallback(async (id) => {
    const n = ++envioPersonagem.current;
    const r = await backend.rpc("app_tutor_set_character", { p_character: id });
    if (n === envioPersonagem.current && r && typeof r === "object") confirmar({ ...r, character: r.character ?? id });
    return r;
  }, [backend, confirmar]);

  const listen = async (personalityId) => {
    unlockAudio();
    try {
      const blob = await nexusApi.sample(backend, personalityId);
      const player = sampleAudio.current ?? (sampleAudio.current = new Audio());
      if (player.src) URL.revokeObjectURL(player.src);
      player.src = URL.createObjectURL(blob);
      await player.play();
    } catch (e) {
      if (!consentLost(e)) setError({ message: e.status === 404 ? "A amostra desta voz ainda não está disponível." : messageOf(e), code: null });
    }
  };

  /**
   * Encerrar: na voz ao vivo, o microfone fecha e o professor se despede numa frase curta criada agora (no máximo ~9 s; um segundo
   * toque em Encerrar pula a despedida). Depois a tela de fim abre na hora e o encerramento (voz, chamada e conversa) segue por trás.
   */
  const finish = async () => {
    if (closingRef.current) {
      closingRef.current.skip?.();
      return;
    }
    const s = session;
    const o = opened;
    const ctl = (closingRef.current = {});
    let said = null;
    if (o?.jeito === "aovivo" && live.farewell) {
      setClosing(true);
      said = await Promise.race([live.farewell(FAREWELL_INSTRUCTION), new Promise((r) => (ctl.skip = () => r(null)))]);
    }
    setFarewell(said);
    setClosing(false);
    const stopping = o?.jeito === "aovivo" ? live.stop?.() : tts.stop();
    setOpened(null);
    setPhase("summary");
    releaseMic();
    setMicStream(null);
    await backend.rpc("app_tutor_close", { p_session_id: s.id }).catch(() => {});
    await Promise.resolve(stopping).catch(() => {});
    const full = await backend.rpc("app_tutor_session", { p_session_id: s.id }).catch(() => s);
    setSession(full ?? s);
  };

  const showHistory = async () => {
    setError(null);
    setPhase("history");
    setSessions(null);
    try {
      setSessions((await backend.rpc("app_tutor_sessions", { p_limit: 30 })) ?? []);
    } catch (e) {
      if (!consentLost(e)) setError({ message: messageOf(e), code: null });
      setSessions([]);
    }
  };

  const fromHistory = (item) => {
    setError(null);
    if (item.read_only || item.status !== "active") {
      backend.rpc("app_tutor_session", { p_session_id: item.id }).then(
        (s) => (setSession(s), setPhase("readonly")),
        (e) => !consentLost(e) && setError({ message: messageOf(e), code: null })
      );
      return;
    }
    // conversa aberta: continua com o mesmo professor (o toque também libera o som e o microfone)
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    const micP = gesture();
    void (async () => {
      try {
        const s = await backend.rpc("app_tutor_session", { p_session_id: item.id });
        mic.current = await micP;
        micDenied.current = micAsked() && !mic.current;
        await openSession(s);
      } catch (e) {
        if (!consentLost(e)) setError({ message: messageOf(e), code: null });
        releaseMic();
      } finally {
        starting.current = false;
        setBusy(false);
      }
    })();
  };

  const toLobby = () => {
    setError(null);
    setSession(null);
    setPhase("lobby");
    refresh().catch(() => {}); // a conversa pode ter trocado a personalidade preferida e o uso do dia
  };

  /**
   * "Voltar" na conversa (relato de 19/10: só havia "Encerrar"). Sai SEM encerrar: a voz desliga e para de contar minutos (a tela de
   * voz desmonta e fecha a ligação), e a conversa continua aberta no Histórico. Por cima de outra tela (a questão do treino, do Plano
   * de Hoje, do Caderno de erros…), fecha a camada e a tela de baixo continua exatamente como estava (resposta, correção, tempo).
   * Pela página do Tutor (menu), volta para a tela anterior do app; aberta direto pelo endereço, vai para o Início.
   */
  const temTelaAnterior = () => typeof window !== "undefined" && Number(window.history.state?.idx) > 0;
  /**
   * Página do Tutor: sai da tela de voz JÁ (a voz para e os minutos param; a conversa continua aberta no Histórico) e a Nexus volta
   * para a entrada. Sem isso, se a tela anterior do histórico também for o Tutor (tocar em "Tutor" no menu estando no Tutor empilha
   * /tutor de novo), a rota não mudava, a Nexus não desmontava e a voz seguia aberta no primeiro toque.
   */
  const deixarConversa = () => {
    if (opened?.jeito === "aovivo") void Promise.resolve(live.stop?.()).catch(() => {});
    else void Promise.resolve(tts.stop?.()).catch(() => {});
    setOpened(null);
    releaseMic();
    setMicStream(null);
    setPicked(null);
    setCardNote(null);
    setLiveNote(null);
    toLobby();
  };
  const voltar = overlay
    ? onClose
    : () => {
        deixarConversa();
        if (temTelaAnterior()) window.history.back();
        else go?.("home");
      };
  const voltarRotulo = overlay ? (request?.questionId ? "Voltar para a questão" : "Voltar para a tela anterior") : temTelaAnterior() ? "Voltar para a tela anterior" : "Voltar para o Início";

  const errorBox = error && (
    <div className="nx-error" role="alert">
      <span>{error.message}</span>
      {error.code === "busy" && pending.current && <button type="button" className="nx-pill" onClick={takeOver} disabled={busy}>Assumir aqui</button>}
    </div>
  );

  let body;
  if (phase === "conversation" && session && opened) {
    const aoVivo = opened.jeito === "aovivo";
    const rt = aoVivo ? { ...live, state: closing ? (live.state === "speaking" ? "speaking" : "thinking") : live.state } : tts;
    const card = session.question && ["questao", "erros"].includes(session.mode) ? (
      aoVivo ? (
        <QuestionCard
          session={session} marked={picked} gate={session.gate} busy={cardBusy} error={cardNote}
          onMark={(l) => setPicked(l)}
          onAnswer={(l) =>
            cardAction(async () => {
              const antes = session.question?.id ?? null;
              try {
                await backend.rpc("app_tutor_answer", { p_session_id: session.id, p_option: l, p_confidence: null, p_response_ms: null, p_first_pick: null });
                setCardNote(null);
                await reload();
                live.sendText(`Marquei a ${l}.`);
              } catch (e) {
                // a voz pode ter respondido ou passado de questão sem a tela saber: relê; se a questão já não está aberta aqui, o
                // cartão acompanha o servidor; senão, o motivo aparece no cartão
                const s = await syncCard().catch(() => null);
                const igual = s?.question && s.question.id === antes && s.question.state === "open";
                setCardNote(!s || igual ? messageOf(e) : null);
              }
            })
          }
          onHint={() => live.sendText("Me dá uma ajuda aqui.")}
          onReveal={() => live.sendText("Me mostra a resolução.")}
          onNext={() =>
            cardAction(async () => {
              const antes = session.question?.id ?? null;
              try {
                const s2 = await backend.rpc("app_tutor_next_question", { p_session_id: session.id });
                setSession(s2);
                setPicked(null);
                setCardNote(null);
                live.sendText("Vamos para a próxima.");
                // a passagem fixa é só a reserva: a criada agora pela IA aparece quando chegar
                void tutorOpening(backend, s2?.id ?? session.id).then((op) => op && setSession((cur) => (cur?.id === s2?.id ? withOpening(cur, op) : cur)));
              } catch (e) {
                // recusado ("Responda a questão atual…"): a voz já pode ter aberto a próxima no servidor. Relê: se a questão mudou, o
                // cartão pula para ela (sem erro); senão, o motivo aparece no cartão (ex.: limite de questões de hoje)
                const s = await syncCard().catch(() => null);
                const mudou = Boolean(s?.question) && s.question.id !== antes;
                setCardNote(mudou ? null : messageOf(e));
              }
            })
          }
        />
      ) : (
        <QuestionCard session={session} marked={tts.marked} gate={session.gate} onMark={tts.mark} onAnswer={tts.answer} onHint={() => tts.command("hint")} onReveal={() => tts.command("reveal")} onNext={() => tts.command("next")} />
      )
    ) : null;
    body = (
      <StaziaVoiceMode
        rt={rt}
        persona={session.personality}
        messages={session.messages ?? []}
        avatar={aoVivo ? liveAvatar : tts.avatar}
        entitlement={aoVivo ? status.entitlement : null}
        // voz ao vivo: o aviso de minutos E o motivo de uma troca que falhou (ex.: "Escrever pelo Chat"); um não esconde o outro
        note={aoVivo ? [liveNote, fallback?.note] : error?.message ?? fallback?.note ?? null}
        jeitoLabel={JEITO_LABEL[opened.jeito]}
        card={card}
        captions={legendas}
        onCaptions={setLegendas}
        closing={closing}
        onWrite={aoVivo ? () => void switchJeito("voice") : undefined}
        onClose={finish}
        onBack={
          voltar
            ? () => {
                // a voz para já e a conversa NÃO é encerrada. Por cima da questão: a voz do professor e o por escrito fecham a chamada
                // no servidor aqui; a voz ao vivo fecha a dela quando a camada sai (a Nexus desmonta). Na página do Tutor, quem para a
                // voz é deixarConversa (dentro de voltar)
                if (overlay && !aoVivo) void Promise.resolve(tts.stop?.()).catch(() => {});
                voltar();
              }
            : null
        }
        backLabel={voltarRotulo}
      />
    );
  } else if (phase === "summary" || phase === "readonly") {
    body = (
      <SummaryView
        session={session} farewell={phase === "summary" ? farewell : null} busy={busy} onLobby={toLobby} onClose={overlay ? onClose : null} error={errorBox}
        onAgain={session?.read_only ? null : () => begin(session.personality?.id, session.mode)}
        onStudy={go ? (q) => (overlay && onClose?.(), go("questoes", q)) : null}
        onHistory={phase === "readonly" ? showHistory : null}
      />
    );
  } else if (phase === "history") {
    body = <HistoryView sessions={sessions} onBack={toLobby} onOpen={fromHistory} onClose={overlay ? onClose : null} error={errorBox} />;
  } else {
    body = <NexusLobby status={status} nexus={nexus} request={request} busy={busy} error={errorBox} onStart={begin} onHistory={showHistory} onListen={listen} onClose={overlay ? onClose : null} onPersonagem={savePersonagem} conta={conta} onPrepare={prepareOpening} />;
  }
  const fimClaro = phase === "summary" || phase === "readonly";
  return <div className={`nx${overlay ? " nx--overlay" : ""}${fimClaro ? " nx--fim" : ""}`}>{body}</div>;
}


// ---------------------------------------------------------------- fim da conversa e só leitura
const lista = (x) => (Array.isArray(x) ? x.map((v) => String(v ?? "").trim()).filter(Boolean) : []);
const minusc = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/**
 * O resumo de verdade do fim (2 a 3 linhas, só com o que o banco registrou; nada inventado): o que estudamos, o que acertou ou
 * travou, e o próximo passo. Conversa curta demais: sem linhas, só o próximo passo. `next.tema` vai para Questões (10 questões).
 */
export function fimDaConversa(session) {
  const s = session?.summary && typeof session.summary === "object" ? session.summary : {};
  const tema = String(session?.topic ?? "").trim() || null;
  const firmou = lista(s.concepts_mastered);
  const revisar = lista(s.needs_review);
  const erros = [...new Set((Array.isArray(s.errors_detected) ? s.errors_detected : []).map((e) => ERROR_CLASS[e?.error_type] ?? e?.error_type).filter(Boolean))];
  const n = Number(s.questions_answered) || 0;
  const certas = Number(s.correct) || 0;
  const linhas = [];
  if (tema) linhas.push(`Estudamos ${minusc(tema)}.`);
  else if (firmou.length) linhas.push(`Estudamos ${firmou.slice(0, 2).join(" e ")}.`);
  if (n > 0) {
    const trava = revisar[0] ?? (erros[0] ? minusc(erros[0]) : null);
    linhas.push(`Você acertou ${certas} de ${n} ${n === 1 ? "questão" : "questões"}${trava ? ` e travou em ${trava}` : ""}.`);
  } else if (tema && firmou.length) linhas.push(`Você firmou ${firmou.slice(0, 2).join(" e ")}.`);
  else if (revisar.length) linhas.push(`Vale revisar ${revisar[0]}.`);
  // o banco recomenda pela subárea (código do motor, "NEONATOLOGY"): o aluno vê e busca pelo nome em português
  const proximo = lista(s.next_recommended_topics).map(nomeSubareaOuNada).filter(Boolean)[0] ?? revisar[0] ?? tema;
  // sem tema nenhum (conversa curta, livre): a sugestão é montar um treino
  const next = proximo ? { tema: proximo, texto: `10 questões de ${minusc(proximo)}` } : { tema: null, texto: "Montar um treino de questões" };
  const curta = !n && !firmou.length && !revisar.length && !erros.length;
  return { linhas: curta ? [] : linhas.slice(0, 2), next, foiBem: n >= 2 && certas / n >= 0.7 };
}

function SummaryView({ session, farewell = null, onAgain, busy, onLobby, onStudy = null, onHistory = null, onClose = null, error }) {
  const p = session?.personality ?? {};
  const quem = personagemDaConversa(p.id);
  const nome = PERSONAGENS[quem]?.nome ?? "Tutor";
  const readOnly = Boolean(session?.read_only);
  const closed = session?.status !== "active";
  const fim = fimDaConversa(session);
  const [verConversa, setVerConversa] = React.useState(false);
  const mensagens = (session?.messages ?? []).filter((m) => m.role === "tutor" || m.role === "student");
  return (
    <div className="nx-fim">
      {onClose && (
        <div className="nx-fim__fechar">
          <Button variant="ghost" size="sm" aria-label="Fechar o Tutor" onClick={onClose}>Fechar</Button>
        </div>
      )}
      <div className="nx-fim__personagem" aria-hidden="true">
        {/* despedida: acena; se foi bem, acena e comemora (orgulho) */}
        <PersonagemTutor personagem={quem} conversationState={fim.foiBem ? "ready" : closed ? "ended" : "idle"} emotion={fim.foiBem ? "proud" : "happy"} emotionIntensity={fim.foiBem ? 0.85 : 0.4} decorativo />
      </div>
      <header className="nx-fim__cabeca">
        <h2 className="nx-fim__nome">{nome}</h2>
        {p.name && <span className="nx-fim__jeito">{p.name}</span>}
      </header>
      {farewell && <p className="nx-fim__fala">“{farewell}”</p>}
      {readOnly && <p className="nx-fim__aviso">{PROFESSOR_CHANGED}</p>}
      {fim.linhas.length > 0 && (
        <div className="nx-fim__resumo">
          {fim.linhas.map((l) => <p key={l}>{l}</p>)}
        </div>
      )}
      {fim.next && (
        <div className="nx-fim__passo">
          <span className="nx-fim__rotulo">Próximo passo</span>
          {onStudy ? (
            <Button variant="secondary" iconRight="arrow-right" onClick={() => onStudy(fim.next.tema ? { tema: fim.next.tema, status: "all", quantidade: "10" } : undefined)}>{fim.next.texto}</Button>
          ) : (
            <span className="nx-fim__passo-texto">{fim.next.texto}</span>
          )}
        </div>
      )}
      {error}
      <div className="nx-fim__acoes">
        {onAgain && <Button fullWidth size="lg" onClick={onAgain} loading={busy}>{`Continuar com ${PERSONAGENS[quem]?.genero === "a" ? "a" : "o"} ${nome}`}</Button>}
        <div className="nx-fim__links">
          <button type="button" className="nx-fim__link" onClick={onLobby}>Trocar de personagem ou jeito</button>
          {onHistory && <button type="button" className="nx-fim__link" onClick={onHistory}>Voltar ao histórico</button>}
          {mensagens.length > 0 && (
            <button type="button" className="nx-fim__link" aria-expanded={verConversa} onClick={() => setVerConversa((v) => !v)}>
              {verConversa ? "Esconder a conversa" : "Ver a conversa"}
            </button>
          )}
        </div>
      </div>
      {verConversa && (
        <ol className="nx-fim__conversa" aria-label="A conversa">
          {mensagens.map((m, i) => (
            <li key={m.id ?? i} className={`nx-fim__msg is-${m.role}`}>
              <span className="nx-fim__quem">{m.role === "tutor" ? nome : "Você"}</span>
              {m.content}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- histórico
function HistoryView({ sessions, onBack, onOpen, onClose = null, error }) {
  return (
    <div className="nx-history">
      <div className="nx-history__top">
        <button type="button" className="nx-round" aria-label="Voltar para a entrada" onClick={onBack}>‹</button>
        <div className="nx-top__title">
          <span className="nx-top__eyebrow">Stazia Tutor</span>
          <h2 className="nx-top__name">Histórico</h2>
        </div>
        {onClose && <button type="button" className="nx-pill nx-history__close" aria-label="Fechar o Tutor" onClick={onClose}>Fechar</button>}
      </div>
      {error}
      {sessions === null && <p className="nx-muted">Carregando…</p>}
      {sessions?.length === 0 && <p className="nx-muted">Nenhuma conversa ainda.</p>}
      <div className="nx-history__list">
        {(sessions ?? []).map((s) => {
          const tag = s.read_only ? "Só leitura" : s.status === "active" ? "Aberta · continuar de onde parou" : "Encerrada · só leitura, com resumo";
          return (
            <button key={s.id} type="button" className="nx-item" onClick={() => onOpen(s)}>
              <span className="nx-item__emoji" aria-hidden="true">{s.personality}</span>
              <span className="nx-item__text">
                <span className="nx-item__name">{s.persona} · {modeLabel(s.mode)}</span>{" "}
                <span className="nx-item__meta">{s.title} · {s.questions > 0 ? `${s.questions} ${s.questions === 1 ? "questão" : "questões"}` : `${s.minutes ?? 1} min`}</span>
                {s.read_only && <span className="nx-item__warn">{PROFESSOR_CHANGED}</span>}
                <span className={`nx-tag${s.status === "active" && !s.read_only ? " nx-tag--open" : ""}`}>{tag}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="nx-muted nx-history__note">Conversas antigas nunca trocam de professor: a encerrada abre para leitura; a que ficou aberta continua com o mesmo professor.</p>
    </div>
  );
}

