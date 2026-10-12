// Nexus: a tela única do Stazia Tutor (spec do Tutor Nexus; prévia aprovada pelo dono em 2026-10-08). Fases: entrada (escolher o
// professor e o modo), conversa (a esfera em tela cheia, no computador e no celular), resumo (depois de Encerrar), histórico e
// só leitura. O toque em "Começar" libera o som e pede o microfone na hora (Safari e iPhone exigem o gesto); a conversa nasce com
// o professor escolhido e o servidor diz o jeito: voz do professor, voz reserva (a voz ao vivo de antes) ou por escrito.
import React from "react";
import { useSession } from "../../session.jsx";
import { nexusApi, tutorServerStatus } from "../api.js";
import { ERROR_CLASS, modeLabel } from "../labels.js";
import { useRealtimeVoice } from "../useRealtimeVoice.js";
import { StaziaVoiceMode } from "../voice/StaziaVoiceMode.jsx";
import { StaziaVoiceOrb } from "../voice/StaziaVoiceOrb.jsx";
import { unlockAudio } from "../voice/audioUnlock.js";
import { TutorGate } from "./TutorGate.jsx";
import { NexusLobby, withArticle } from "./NexusLobby.jsx";
import { QuestionCard } from "./QuestionCard.jsx";
import { useNexusVoice } from "./useNexusVoice.js";
import "./nexus.css";
import { explainError } from "../../../../shared/errors/explicarErro";

export const JEITO_LABEL = { eleven: "Voz do professor", reserva: "Voz reserva", escrito: "Por escrito" };
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
      {(status, refresh) => <Nexus status={status} refresh={refresh} overlay={overlay} request={request} onClose={onClose} />}
    </TutorGate>
  );
  if (!overlay) return gate;
  return (
    <div className="nx-overlay" role="dialog" aria-modal="true" aria-label="Nexus">
      {gate}
    </div>
  );
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
  const ttsStarted = React.useRef(null);
  const [micStream, setMicStream] = React.useState(null);
  const [fallback, setFallback] = React.useState(null); // { note, caption }: a voz do professor parou e a reserva assumiu
  const [picked, setPicked] = React.useState(null); // letra marcada na reserva (a voz do professor guarda a dela)
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
  // as falas da conversa por voz aparecem no Chat (a mesma conversa; o servidor grava e confere)
  const appendMessage = (m) =>
    setSession((s) => (s ? { ...s, messages: [...(s.messages ?? []), { id: m.id ?? `nx-${Date.now()}-${(s.messages ?? []).length}`, role: m.role, content: m.content, voice: true }] } : s));
  // voz reserva: a voz ao vivo de antes (o servidor encerra a chamada da voz do professor ao abrir esta)
  const [liveAvatar, setLiveAvatar] = React.useState(null);
  const [liveNote, setLiveNote] = React.useState(null);
  const live = useRealtimeVoice({
    backend, sessionId: session?.id ?? null, live: server.live, hint: server.hint,
    onTranscript: (role, said) => appendMessage({ role, content: said }), onWarning: setLiveNote, onAvatar: setLiveAvatar,
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
      // a voz do professor parou (limite, teto, aprovação, falha): a chamada dela fecha e o servidor escolhe o que sobra (a reserva,
      // ou por escrito quando a reserva não roda), com a mensagem e a legenda mantidas
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
    if (phase === "conversation" && opened?.jeito === "reserva" && session?.id && liveStarted.current !== session.id) {
      liveStarted.current = session.id;
      live.start();
    }
  }, [phase, opened?.jeito, session?.id, live]);
  React.useEffect(() => {
    if (live.error?.code === "tutor_consent") refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.error]);

  /** Troca o jeito no meio da conversa (esta aba assume): skip "eleven" sem a voz do professor; "voice" sem as duas vozes. */
  const switchJeito = async (skip) => {
    const s = sessionRef.current;
    if (!s) return;
    if (skip === "voice") void Promise.resolve(live.stop?.()).catch(() => {});
    try {
      const o = await nexusApi.open(backend, s.id, true, skip);
      if (o.jeito === "reserva") releaseMic(); // a voz ao vivo pede o microfone por conta própria
      setMicStream(o.jeito === "reserva" ? null : mic.current);
      liveStarted.current = null;
      ttsStarted.current = null;
      setOpened(o);
    } catch (e) {
      if (!consentLost(e)) setFallback((f) => ({ caption: "", ...(f ?? {}), note: messageOf(e) }));
    }
  };

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
      setFallback(null);
      setPicked(null);
      setLiveNote(null);
      setLiveAvatar(null);
      if (o.jeito === "reserva") releaseMic(); // a voz ao vivo pede o microfone por conta própria
      setMicStream(o.jeito === "reserva" ? null : mic.current);
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
    // a tela de voz fecha na hora; o encerramento (voz, chamada e conversa) segue por trás e o resumo chega em seguida
    const stopping = o?.jeito === "reserva" ? live.stop?.() : tts.stop();
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
    const reserve = opened.jeito === "reserva";
    // na reserva, a legenda da voz do professor fica até a voz ao vivo falar
    const rt = reserve ? (fallback?.caption && !(live.captions?.tutor ?? "").trim() ? { ...live, captions: { ...live.captions, tutor: fallback.caption } } : live) : tts;
    const card = session.question && ["questao", "erros"].includes(session.mode) ? (
      reserve ? (
        <QuestionCard
          session={session} marked={picked} gate={session.gate}
          onMark={(l) => setPicked(l)}
          onAnswer={async (l) => {
            try {
              await backend.rpc("app_tutor_answer", { p_session_id: session.id, p_option: l, p_confidence: null, p_response_ms: null, p_first_pick: null });
              await reload();
              live.sendText(`Marquei a ${l}.`);
            } catch (e) {
              setFallback((f) => ({ ...(f ?? {}), note: messageOf(e) }));
            }
          }}
          onHint={() => live.sendText("Me dá uma ajuda aqui.")}
          onReveal={() => live.sendText("Me mostra a resolução.")}
          onNext={async () => {
            try {
              setSession(await backend.rpc("app_tutor_next_question", { p_session_id: session.id }));
              setPicked(null);
              live.sendText("Vamos para a próxima.");
            } catch (e) {
              setFallback((f) => ({ ...(f ?? {}), note: messageOf(e) }));
            }
          }}
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
        avatar={reserve ? liveAvatar : tts.avatar}
        entitlement={reserve ? status.entitlement : null}
        note={reserve ? fallback?.note ?? liveNote ?? null : error?.message ?? fallback?.note ?? null}
        jeitoLabel={JEITO_LABEL[opened.jeito]}
        card={card}
        onWrite={reserve ? () => void switchJeito("voice") : undefined}
        onClose={finish}
      />
    );
  } else if (phase === "summary" || phase === "readonly") {
    body = <SummaryView session={session} onAgain={session?.read_only ? null : () => begin(session.personality?.id, session.mode)} busy={busy} onLobby={toLobby} onHistory={showHistory} onClose={overlay ? onClose : null} error={errorBox} />;
  } else if (phase === "history") {
    body = <HistoryView sessions={sessions} onBack={toLobby} onOpen={fromHistory} onClose={overlay ? onClose : null} error={errorBox} />;
  } else {
    body = <NexusLobby status={status} nexus={nexus} request={request} busy={busy} error={errorBox} onStart={begin} onHistory={showHistory} onListen={listen} onClose={overlay ? onClose : null} />;
  }
  return <div className={`nx${overlay ? " nx--overlay" : ""}`}>{body}</div>;
}


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

function SummaryView({ session, onAgain, busy, onLobby, onHistory, onClose = null, error }) {
  const p = session?.personality ?? {};
  const readOnly = Boolean(session?.read_only);
  const closed = session?.status !== "active";
  return (
    <div className="nx-summary">
      {onClose && (
        <div className="nx-top__actions nx-summary__close">
          <button type="button" className="nx-pill" aria-label="Fechar o Tutor" onClick={onClose}>Fechar</button>
        </div>
      )}
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

