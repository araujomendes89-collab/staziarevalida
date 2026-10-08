// Nexus: a tela única do Stazia Tutor (spec do Tutor Nexus; prévia aprovada pelo dono em 2026-10-08). Fases: entrada (escolher o
// professor e o modo), conversa (a esfera em tela cheia, no computador e no celular), resumo (depois de Encerrar), histórico e
// só leitura. O toque em "Começar" libera o som e pede o microfone na hora (Safari e iPhone exigem o gesto); a conversa nasce com
// o professor escolhido e o servidor diz o jeito: voz do professor, voz reserva (a voz ao vivo de antes) ou por escrito.
import React from "react";
import { useSession } from "../../session.jsx";
import { nexusApi, tutorServerStatus, voiceApi } from "../api.js";
import { ERROR_CLASS, modeLabel } from "../labels.js";
import { useRealtimeVoice } from "../useRealtimeVoice.js";
import { StaziaVoiceMode } from "../voice/StaziaVoiceMode.jsx";
import { StaziaVoiceOrb } from "../voice/StaziaVoiceOrb.jsx";
import { unlockAudio } from "../voice/audioUnlock.js";
import { TutorGate } from "./TutorGate.jsx";
import { NexusLobby, withArticle } from "./NexusLobby.jsx";
import "./nexus.css";

export const JEITO_LABEL = { eleven: "Voz do professor", reserva: "Voz reserva", escrito: "Por escrito" };
export const PROFESSOR_CHANGED = "Este professor mudou. Comece uma conversa nova.";
const messageOf = (error) => error?.message || "Não foi possível concluir. Tente de novo.";

/** Argumentos de app_tutor_start: o modo, o professor e o contexto ("Me teste" pelos pontos fracos; "Perguntar" livre). */
export function startArgs(personalityId, mode, request = null) {
  const context = request?.context ?? (mode === "livre" ? { type: "free" } : mode === "perguntas" ? { type: "weak_points" } : null);
  return { p_mode: mode, p_topic: request?.topic ?? null, p_question_id: request?.questionId ?? null, p_context: context, p_personality: personalityId };
}

export function NexusScreen({ go, overlay = false, request = null, onClose }) {
  return <TutorGate go={go}>{(status, refresh) => <Nexus status={status} refresh={refresh} overlay={overlay} request={request} onClose={onClose} />}</TutorGate>;
}

function Nexus({ status, refresh, overlay, request, onClose }) {
  const { backend } = useSession();
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

  const consentLost = (e) => e?.code === "tutor_consent" && (refresh().catch(() => {}), true);

  React.useEffect(() => {
    let alive = true;
    nexusApi.status(backend).then((n) => alive && setNexus(n), (e) => alive && !consentLost(e) && setNexus(null));
    if (status.voice_enabled) tutorServerStatus(backend).then((s) => alive && setServer({ live: Boolean(s?.live_voice), hint: s?.voice_hint ?? null }), () => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, status.voice_enabled]);

  // voz reserva: a voz ao vivo de antes (o servidor encerra a chamada da voz do professor ao abrir esta)
  const live = useRealtimeVoice({ backend, sessionId: session?.id ?? null, live: server.live, hint: server.hint });
  React.useEffect(() => {
    if (phase === "conversation" && opened?.jeito === "reserva" && session?.id && liveStarted.current !== session.id) {
      liveStarted.current = session.id;
      live.start();
    }
  }, [phase, opened?.jeito, session?.id, live]);
  React.useEffect(() => {
    if (live.error?.code === "tutor_consent") refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.error]);

  const releaseMic = () => {
    mic.current?.getTracks?.().forEach((t) => t.stop());
    mic.current = null;
  };
  React.useEffect(() => () => releaseMic(), []);

  /** O gesto do aluno: libera o som e pede o microfone antes de qualquer espera (Safari e iPhone). */
  const gesture = () => {
    unlockAudio();
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
    return status.voice_enabled && md?.getUserMedia ? md.getUserMedia({ audio: true }).catch(() => null) : Promise.resolve(null);
  };

  const openSession = async (s, force = false) => {
    try {
      const o = await nexusApi.open(backend, s.id, force);
      pending.current = null;
      setError(null);
      setSession(s);
      setOpened(o);
      if (o.jeito === "reserva") releaseMic(); // a voz ao vivo pede o microfone por conta própria
      liveStarted.current = null;
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
        releaseMic();
        mic.current = await micP;
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

  const finish = async () => {
    const s = session;
    const o = opened;
    await backend.rpc("app_tutor_close", { p_session_id: s.id }).catch(() => {});
    if (o?.jeito === "reserva") await live.stop?.().catch?.(() => {});
    else if (o?.voice_call_id) await voiceApi.end(backend, o.voice_call_id, "student").catch(() => {});
    releaseMic();
    const full = await backend.rpc("app_tutor_session", { p_session_id: s.id }).catch(() => s);
    setSession(full ?? s);
    setOpened(null);
    setPhase("summary");
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
  };

  const errorBox = error && (
    <div className="nx-error" role="alert">
      <span>{error.message}</span>
      {error.code === "busy" && pending.current && <button type="button" className="nx-pill" onClick={takeOver} disabled={busy}>Assumir aqui</button>}
    </div>
  );

  let body;
  if (phase === "conversation" && session && opened) {
    const placeholder = {
      state: "ready", error: null, captions: { tutor: lastTutor(session), student: "" }, streams: { input: null, output: null }, muted: false, provider: "tts", remaining: null,
      start() {}, stop: async () => {}, interrupt() {}, sendText() {}, toggleMute() {}, setVolume() {}, active: true,
    };
    body = (
      <StaziaVoiceMode
        rt={opened.jeito === "reserva" ? live : placeholder}
        persona={session.personality}
        messages={session.messages ?? []}
        entitlement={opened.jeito === "reserva" ? status.entitlement : null}
        jeitoLabel={JEITO_LABEL[opened.jeito]}
        onClose={finish}
      />
    );
  } else if (phase === "summary" || phase === "readonly") {
    body = <SummaryView session={session} onAgain={session?.read_only ? null : () => begin(session.personality?.id, session.mode)} busy={busy} onLobby={toLobby} onHistory={showHistory} error={errorBox} />;
  } else if (phase === "history") {
    body = <HistoryView sessions={sessions} onBack={toLobby} onOpen={fromHistory} error={errorBox} />;
  } else {
    body = <NexusLobby status={status} nexus={nexus} request={request} busy={busy} error={errorBox} onStart={begin} onHistory={showHistory} onListen={listen} onClose={overlay ? onClose : null} />;
  }
  return <div className={`nx${overlay ? " nx--overlay" : ""}`}>{body}</div>;
}

const lastTutor = (s) => [...(s?.messages ?? [])].reverse().find((m) => m.role === "tutor")?.content ?? "";

// ---------------------------------------------------------------- resumo e só leitura
function SummaryBlock({ summary: s }) {
  const list = (x) => (Array.isArray(x) ? x.filter(Boolean) : []);
  if (!s || typeof s !== "object") return <span>Sem resumo desta conversa.</span>;
  const lines = [
    s.questions_answered > 0 && `${s.correct} de ${s.questions_answered} questões certas.`,
    list(s.concepts_mastered).length > 0 && `Firmou: ${list(s.concepts_mastered).join(", ")}.`,
    list(s.errors_detected).length > 0 && `Erros: ${[...new Set(list(s.errors_detected).map((e) => ERROR_CLASS[e.error_type] ?? e.error_type))].join(", ")}.`,
    list(s.recurrent_errors).length > 0 && `Erros que já se repetiram: ${list(s.recurrent_errors).map((e) => ERROR_CLASS[e] ?? e).join(", ")}.`,
    list(s.needs_review).length > 0 && `Volta em revisão: ${list(s.needs_review).join(", ")}.`,
    list(s.next_recommended_topics).length > 0 && `Próximos temas sugeridos: ${list(s.next_recommended_topics).join(", ")}.`,
  ].filter(Boolean);
  if (!lines.length) return <span>Conversa curta: ainda sem resumo de estudo.</span>;
  return lines.map((l) => <span key={l}>{l}</span>);
}

function SummaryView({ session, onAgain, busy, onLobby, onHistory, error }) {
  const p = session?.personality ?? {};
  const readOnly = Boolean(session?.read_only);
  const closed = session?.status !== "active";
  return (
    <div className="nx-summary">
      <div className="nx-summary__orb" aria-hidden="true">
        <StaziaVoiceOrb conversationState="idle" emotion="neutral" emotionIntensity={0.3} />
      </div>
      <div className="nx-summary__head">
        <span className="nx-overline">{readOnly ? "Só leitura" : closed ? "Conversa encerrada" : "Conversa"}</span>
        <h2 className="nx-summary__title">{p.emoji} {p.name} · {modeLabel(session?.mode)}</h2>
      </div>
      {readOnly && <p className="nx-changed">{PROFESSOR_CHANGED}</p>}
      <div className="nx-summary__box">
        <span className="nx-overline">Resumo</span>
        <SummaryBlock summary={session?.summary} />
      </div>
      {error}
      <div className="nx-summary__actions">
        {onAgain && (
          <>
            <button type="button" className="nx-start" onClick={onAgain} disabled={busy}>Conversar de novo com {withArticle(p)}</button>
            <span className="nx-summary__note">Abre uma conversa nova com o mesmo professor.</span>
          </>
        )}
        <button type="button" className="nx-ghost" onClick={onLobby}>Trocar de professor</button>
        <button type="button" className="nx-ghost" onClick={onHistory}>Histórico</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- histórico
function HistoryView({ sessions, onBack, onOpen, error }) {
  return (
    <div className="nx-history">
      <div className="nx-history__top">
        <button type="button" className="nx-round" aria-label="Voltar para a entrada" onClick={onBack}>‹</button>
        <div className="nx-top__title">
          <span className="nx-top__eyebrow">Stazia Tutor</span>
          <h2 className="nx-top__name">Histórico</h2>
        </div>
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

