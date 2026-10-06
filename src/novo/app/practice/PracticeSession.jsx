// Sessão de resolução ligada ao banco (treino e simulado).
// Mesma marcação da Session do protótipo (prototype/Session.jsx). Diferenças de comportamento:
//  - treino: confirmar grava a tentativa e o banco devolve a correção;
//  - simulado: marcar já guarda a resposta, sem correção; dá para voltar e trocar até finalizar.
// A dica e o tutor de IA entram quando o Tutor for ligado.
import React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { AnswerOption, Badge, Banner, Button, Card, EmptyState, Icon } from "../../ds";
import { useMQ } from "../Shell.jsx";
import { useSession } from "../session.jsx";
import { Correction } from "./Correction.jsx";
import { QuestionFigures } from "./QuestionFigures.jsx";
import { SessionResult } from "./SessionResult.jsx";
import { areaLabel, examLabel, formatClock, splitStatement } from "./format.js";
import { XPToast, useTurnFeedback } from "../play/PlayFeedback.jsx";

// Até aqui, um traço por questão na barra do topo; acima disso, uma barra contínua.
const SEGMENT_LIMIT = 30;
const BLANK_CHIPS = 40;

function useNow() {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Tempo gasto na questão atual, contando só com a aba à vista. */
function useActiveTime(key, baseMs) {
  const ref = React.useRef({ base: 0, since: 0 });
  React.useEffect(() => {
    ref.current = { base: baseMs, since: document.hidden ? 0 : Date.now() };
    const onVisibility = () => {
      const t = ref.current;
      if (document.hidden && t.since) {
        t.base += Date.now() - t.since;
        t.since = 0;
      } else if (!document.hidden && !t.since) {
        t.since = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // baseMs só vale na troca de questão
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return React.useCallback(() => {
    const t = ref.current;
    return Math.round(t.base + (t.since ? Date.now() - t.since : 0));
  }, []);
}

function Centered({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--bg-app)" }}>
      <div style={{ maxWidth: 480, width: "100%" }}>{children}</div>
    </div>
  );
}

function Runner({ session, go, onFinished }) {
  const { backend } = useSession();
  const mobile = useMQ("(max-width: 1023px)");
  const sim = session.kind === "simulado";

  const [questions, setQuestions] = React.useState(session.questions);
  const [index, setIndex] = React.useState(() => {
    const firstOpen = session.questions.findIndex((q) => q.selected == null);
    return firstOpen === -1 ? session.questions.length - 1 : firstOpen;
  });
  const [picked, setPicked] = React.useState(null); // treino: alternativa escolhida, ainda sem confirmar
  const [strike, setStrike] = React.useState({}); // alternativas riscadas por questão (só na tela)
  const [striking, setStriking] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const saving = React.useRef(Promise.resolve());
  const finishing = React.useRef(false);
  const feedback = useTurnFeedback(); // Stazia Play: novo nível e medalhas viram modais curtos
  const [sessionXp, setSessionXp] = React.useState(0);

  const total = questions.length;
  const question = questions[index];
  const answered = questions.filter((q) => q.selected != null).length;
  const revealed = !sim && question.correction != null;
  const selected = sim || revealed ? question.selected : picked;
  const struck = strike[question.id] ?? [];
  const last = index + 1 >= total;
  const patch = (id, changes) => setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...changes } : q)));

  // Cronômetro: o prazo usa o relógio do servidor (diferença medida ao abrir a sessão).
  const skew = React.useRef(Date.parse(session.server_now) - Date.now());
  const now = useNow();
  const activeMs = useActiveTime(question.id, sim ? question.active_ms : 0);
  const deadline = session.time_limit_seconds ? Date.parse(session.started_at) + session.time_limit_seconds * 1000 : null;
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - (now + skew.current)) / 1000));
  const running = !revealed && !confirming;
  const spent = Math.floor(
    (questions.reduce((sum, q) => sum + (q.id === question.id && running ? 0 : q.active_ms), 0) + (running ? activeMs() : 0)) / 1000
  );

  const finish = React.useCallback(
    async (timeUp = false) => {
      if (finishing.current) return;
      finishing.current = true;
      setBusy(true);
      setError(null);
      try {
        await saving.current.catch(() => {});
        onFinished(await backend.rpc("app_finish_session", { p_session_id: session.id }), timeUp);
      } catch {
        finishing.current = false;
        setBusy(false);
        setError("Não foi possível finalizar. Verifique a conexão e tente de novo.");
      }
    },
    [backend, session.id, onFinished]
  );

  React.useEffect(() => {
    if (remaining === 0) finish(true);
  }, [remaining, finish]);

  const goTo = (next) => {
    setIndex(next);
    setPicked(null);
    setError(null);
    setConfirming(false);
    window.scrollTo(0, 0);
  };

  const choose = (option) => {
    if (busy || revealed) return;
    if (striking) {
      if (sim && question.selected === option) return; // resposta guardada não é riscada
      if (picked === option) setPicked(null);
      setStrike((all) => ({ ...all, [question.id]: struck.includes(option) ? struck.filter((o) => o !== option) : [...struck, option] }));
      return;
    }
    if (struck.includes(option)) {
      setStrike((all) => ({ ...all, [question.id]: struck.filter((o) => o !== option) }));
      return;
    }
    if (!sim) {
      setPicked(option);
      return;
    }
    const previous = question.selected;
    if (previous === option) return;
    const id = question.id;
    const ms = activeMs();
    patch(id, { selected: option, active_ms: ms });
    setError(null);
    saving.current = saving.current
      .catch(() => {})
      .then(() => backend.rpc("app_answer_question", { p_session_id: session.id, p_question_id: id, p_option: option, p_active_ms: ms }))
      .catch(() => {
        patch(id, { selected: previous });
        setError("Não foi possível guardar sua resposta. Marque de novo.");
      });
  };

  const confirm = async () => {
    if (picked == null || busy) return;
    setBusy(true);
    setError(null);
    const ms = activeMs();
    try {
      const correction = await backend.rpc("app_answer_question", {
        p_session_id: session.id,
        p_question_id: question.id,
        p_option: picked,
        p_active_ms: ms,
      });
      const { play, ...rest } = correction;
      patch(question.id, { selected: rest.selected, correction: rest, play, active_ms: ms });
      if (play?.xp?.valid) setSessionXp((n) => n + (play.xp.total ?? 0) + (play.bonus ?? []).reduce((sum, b) => sum + (b.xp ?? 0), 0));
      feedback.push(play);
      setPicked(null);
      setStriking(false);
    } catch {
      setError("Não foi possível registrar sua resposta. Tente de novo.");
    }
    setBusy(false);
  };

  const next = () => {
    if (!last) goTo(index + 1);
    else if (sim) setConfirming(true);
    else finish();
  };

  const toggleMark = () => {
    const on = !question.bookmarked;
    const id = question.id;
    patch(id, { bookmarked: on });
    backend.rpc("app_set_bookmark", { p_question_id: id, p_on: on }).catch(() => patch(id, { bookmarked: !on }));
  };

  const exit = async () => {
    // Sessão aberta sem nenhuma resposta não precisa ficar no histórico.
    if (answered === 0) await backend.rpc("app_finish_session", { p_session_id: session.id }).catch(() => {});
    go(sim ? "simulados" : "questoes");
  };

  // Atalhos: A–D (ou 1–4) marca; Enter confirma ou avança.
  const keys = React.useRef(null);
  keys.current = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || confirming) return;
    const tag = (event.target?.tagName ?? "").toLowerCase();
    if (["input", "textarea", "select"].includes(tag)) return;
    if (event.key === "Enter") {
      // Num botão comum, o Enter é do próprio botão; numa alternativa, confirma/avança.
      if (tag === "button" && event.target.getAttribute("role") !== "radio") return;
      event.preventDefault();
      if (!sim && !revealed) confirm();
      else next();
      return;
    }
    const option = question.options[["a", "b", "c", "d"].indexOf(event.key.toLowerCase())] ?? question.options[["1", "2", "3", "4"].indexOf(event.key)];
    if (option) choose(option.id);
  };
  React.useEffect(() => {
    const onKey = (event) => keys.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const optionState = (id) => {
    if (!revealed) return selected === id ? "selected" : "idle";
    if (id === question.correction.correct_option) return "correct";
    return id === question.selected ? "incorrect" : "dimmed";
  };
  const tool = (icon, label, on, onClick, disabled) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: mobile ? "0 12px" : "0 16px", border: 0, borderRadius: 999, background: on ? "var(--selected-bg)" : "transparent", color: on ? "var(--selected-text)" : "var(--text-secondary)", font: "600 14px var(--font-sans)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 }}
    >
      <Icon name={icon} size={18} />
      {!mobile && label}
    </button>
  );

  const { stem, ask } = splitStatement(question.statement);
  const blanks = questions.map((q, k) => ({ q, k })).filter(({ q }) => q.selected == null);
  const urgent = remaining !== null && remaining <= 300;
  const panel = revealed && (
    <aside
      style={{ background: "var(--surface-subtle)", borderLeft: mobile ? 0 : "1px solid var(--border-subtle)", borderTop: mobile ? "1px solid var(--border-subtle)" : 0, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}
      aria-live="polite"
    >
      {question.play && <XPToast play={question.play} />}
      <Correction selected={question.selected} correction={question.correction} question={question} />
    </aside>
  );

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: revealed && !mobile ? "minmax(0,1fr) 440px" : "1fr", background: "var(--surface-card)" }}>
      <div style={{ position: "relative", paddingBottom: 120 }}>
        <header style={{ position: "sticky", top: 0, zIndex: 5, height: 68, display: "flex", alignItems: "center", gap: 16, padding: mobile ? "0 12px" : "0 32px", borderBottom: "1px solid var(--border-subtle)", background: "color-mix(in oklab,var(--surface-card) 90%,transparent)", backdropFilter: "blur(12px)" }}>
          <Button variant="ghost" size="sm" icon="x" onClick={exit}>
            Sair
          </Button>
          <div style={{ flex: 1, display: "flex", gap: 3, maxWidth: 560, margin: "0 auto" }} aria-hidden="true">
            {total <= SEGMENT_LIMIT ? (
              questions.map((q, k) => (
                <span key={q.id} style={{ flex: 1, height: 6, borderRadius: 9, background: k === index ? "var(--teal-300)" : q.selected != null ? "var(--action-primary)" : "var(--chart-track)" }} />
              ))
            ) : (
              <span style={{ flex: 1, height: 6, borderRadius: 9, background: "var(--chart-track)", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(100 * answered) / total}%`, borderRadius: 9, background: "var(--action-primary)" }} />
              </span>
            )}
          </div>
          <span style={{ font: "600 14px var(--font-mono)", color: "var(--text-secondary)" }}>
            {index + 1}/{total}
          </span>
          {sessionXp > 0 && (
            <span className="sm-pill" style={{ color: "var(--xp-text)", background: "var(--xp-bg)", borderColor: "transparent" }} title="XP ganho nesta sessão">
              <Icon name="zap" size={16} />
              <span style={{ fontFamily: "var(--font-mono)" }}>+{sessionXp}</span>
            </span>
          )}
          {(!mobile || remaining !== null) && (
            <span className="sm-pill" style={urgent ? { color: "var(--danger-text)" } : undefined} title={remaining !== null ? "Tempo restante" : "Tempo respondendo"}>
              <Icon name="timer" size={16} />
              <span style={{ fontFamily: "var(--font-mono)" }}>{formatClock(remaining !== null ? remaining : spent)}</span>
            </span>
          )}
        </header>

        {confirming ? (
          <div style={{ maxWidth: 560, margin: "0 auto", padding: mobile ? "24px 18px" : "44px 32px" }}>
            <Card style={{ borderRadius: 24 }} padding={mobile ? 22 : 32}>
              <h1 style={{ margin: 0, font: "var(--type-h2)" }}>Finalizar simulado?</h1>
              <p style={{ margin: "10px 0 0", color: "var(--text-secondary)" }}>
                Você respondeu {answered} de {total} questões.
                {blanks.length > 0 && ` ${blanks.length === 1 ? "A questão em branco conta" : `As ${blanks.length} em branco contam`} como erro.`}
              </p>
              {blanks.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 16 }} aria-label="Questões em branco">
                  {blanks.slice(0, BLANK_CHIPS).map(({ q, k }) => (
                    <button key={q.id} type="button" className="sm-chip" onClick={() => goTo(k)} aria-label={`Ir para a questão ${k + 1}`}>
                      {k + 1}
                    </button>
                  ))}
                  {blanks.length > BLANK_CHIPS && <span style={{ alignSelf: "center", color: "var(--text-tertiary)" }}>e mais {blanks.length - BLANK_CHIPS}</span>}
                </div>
              )}
              {error && (
                <div style={{ marginTop: 16 }}>
                  <Banner tone="danger">{error}</Banner>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
                <Button onClick={() => finish()} loading={busy}>
                  Finalizar e ver resultado
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
                  Voltar às questões
                </Button>
              </div>
            </Card>
          </div>
        ) : (
          <div style={{ maxWidth: 720, margin: "0 auto", padding: mobile ? "24px 18px" : "44px 32px" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge tone="brand">{areaLabel(question.area)}</Badge>
              <Badge>
                {examLabel(question.exam)} · Q{question.number}
              </Badge>
              {question.bookmarked && (
                <Badge tone="warning" icon="bookmark">
                  Marcada
                </Badge>
              )}
            </div>
            {error && (
              <div style={{ marginTop: 16 }}>
                <Banner tone="danger">{error}</Banner>
              </div>
            )}
            <p style={{ font: `400 ${mobile ? 17 : 19}px/1.65 var(--font-sans)`, margin: "22px 0 0", textWrap: "pretty" }}>{stem}</p>
            <QuestionFigures images={question.images} />
            {ask && <p style={{ font: "600 18px/1.4 var(--font-sans)", margin: "28px 0 0" }}>{ask}</p>}
            <div role="radiogroup" aria-label="Alternativas" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: ask ? 20 : 28 }}>
              {question.options.map((option) => {
                const out = struck.includes(option.id) && !revealed;
                return (
                  <div key={option.id} style={{ opacity: out ? 0.45 : 1, textDecoration: out ? "line-through" : "none" }}>
                    <AnswerOption letter={option.id} state={optionState(option.id)} onClick={() => choose(option.id)}>
                      {option.text}
                    </AnswerOption>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {mobile && !confirming && panel}

        {!confirming && (
          <div
            role="toolbar"
            aria-label="Ferramentas da questão"
            style={{ position: "fixed", left: mobile ? 12 : revealed ? "calc((100% - 440px)/2)" : "50%", right: mobile ? 12 : "auto", bottom: 24, transform: mobile ? "none" : "translateX(-50%)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, padding: 6, borderRadius: 999, background: "var(--surface-card)", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-lg)", zIndex: 10 }}
          >
            {tool("bookmark", "Marcar", question.bookmarked, toggleMark)}
            {tool("strikethrough", "Riscar", striking, () => setStriking((value) => !value), revealed)}
            {sim && tool("arrow-left", "Anterior", false, () => goTo(index - 1), index === 0)}
            {!sim && !revealed ? (
              <Button disabled={picked == null} loading={busy} onClick={confirm} style={{ borderRadius: 999, marginLeft: 6 }} iconRight="check">
                Confirmar
              </Button>
            ) : (
              <Button onClick={next} loading={busy} style={{ borderRadius: 999, marginLeft: 6 }} iconRight="arrow-right">
                {last ? (sim ? "Finalizar" : "Concluir") : "Próxima"}
              </Button>
            )}
          </div>
        )}
      </div>
      {!mobile && !confirming && panel}
      {feedback.modal}
    </div>
  );
}

export function PracticeSession({ go }) {
  const { backend, refresh } = useSession();
  const [params] = useSearchParams();
  const id = params.get("s");
  const [view, setView] = React.useState({ status: "loading", session: null, timeUp: false });
  const refreshRef = React.useRef(refresh);
  refreshRef.current = refresh;

  React.useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    setView({ status: "loading", session: null, timeUp: false });
    (async () => {
      try {
        let session = await backend.rpc("app_get_session", { p_session_id: id });
        let timeUp = false;
        // Simulado cujo tempo acabou com a página fechada: finaliza com o que estava marcado.
        if (session && !session.finished_at && session.time_limit_seconds) {
          const deadline = Date.parse(session.started_at) + session.time_limit_seconds * 1000;
          if (Date.parse(session.server_now) >= deadline) {
            session = await backend.rpc("app_finish_session", { p_session_id: id });
            timeUp = true;
            refreshRef.current().catch(() => {});
          }
        }
        if (alive) setView({ status: session ? "ready" : "missing", session, timeUp });
      } catch {
        if (alive) setView({ status: "missing", session: null, timeUp: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, [backend, id]);

  const onFinished = React.useCallback((session, timeUp) => {
    setView({ status: "ready", session, timeUp });
    window.scrollTo(0, 0);
    refreshRef.current().catch(() => {}); // sequência de dias no menu
  }, []);

  if (!id) return <Navigate to="/questoes" replace />;
  if (view.status === "loading") {
    return (
      <Centered>
        <p style={{ margin: 0, textAlign: "center", font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Carregando…</p>
      </Centered>
    );
  }
  if (view.status === "missing") {
    return (
      <Centered>
        <EmptyState
          icon="file-question"
          title="Sessão não encontrada"
          description="Ela pode ter sido aberta em outra conta ou o endereço está incompleto."
          action={<Button onClick={() => go("questoes")}>Montar um treino</Button>}
        />
      </Centered>
    );
  }
  if (view.session.finished_at) return <SessionResult session={view.session} go={go} timeUp={view.timeUp} />;
  return <Runner key={view.session.id} session={view.session} go={go} onFinished={onFinished} />;
}
