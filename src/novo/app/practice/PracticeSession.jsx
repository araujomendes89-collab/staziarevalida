// Sessão de resolução ligada ao banco (treino e simulado).
// Mesma marcação da Session do protótipo (prototype/Session.jsx). Diferenças de comportamento:
//  - treino: confirmar grava a tentativa e o banco devolve a correção;
//  - simulado: marcar já guarda a resposta, sem correção; dá para voltar e trocar até finalizar.
//    O cronômetro do simulado pausa, continua e encerra (com confirmação). A pausa fica no banco
//    (…4300_simulado_cronometro.sql): pausado, o tempo não corre, a questão fica escondida e o banco
//    não aceita resposta; dá para sair e continuar outro dia.
// A dica e o tutor de IA entram quando o Tutor for ligado.
import React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { AnswerOption, Badge, Banner, Button, Card, EmptyState, Icon, IconButton, IconTile } from "../../ds";
import { useMQ } from "../Shell.jsx";
import { useSession } from "../session.jsx";
import { Correction, answerState } from "./Correction.jsx";
import { QuestionFigures } from "./QuestionFigures.jsx";
import { SessionResult } from "./SessionResult.jsx";
import { areaLabel, formatClock, isStaziamed, questionRef, splitStatement } from "./format.js";
import { SupportTable } from "./SupportTable.jsx";
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

/** Tempo gasto na questão atual, contando só com a aba à vista e o cronômetro correndo (pausado não conta). */
function useActiveTime(key, baseMs, paused = false) {
  const ref = React.useRef({ base: 0, since: 0 });
  const pausedRef = React.useRef(paused);
  pausedRef.current = paused;
  const sync = React.useCallback(() => {
    const t = ref.current;
    const counting = !document.hidden && !pausedRef.current;
    if (!counting && t.since) {
      t.base += Date.now() - t.since;
      t.since = 0;
    } else if (counting && !t.since) {
      t.since = Date.now();
    }
  }, []);
  React.useEffect(() => {
    ref.current = { base: baseMs, since: !document.hidden && !pausedRef.current ? Date.now() : 0 };
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
    // baseMs só vale na troca de questão
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  React.useEffect(sync, [paused, sync]);
  return React.useCallback(() => {
    const t = ref.current;
    return Math.round(t.base + (t.since ? Date.now() - t.since : 0));
  }, []);
}

/**
 * Cronômetro como o banco devolve (sessão, pausar, continuar): prazo no relógio do servidor, já com as pausas.
 * Pausado, vale o tempo que restava (parado); sem prazo, o simulado não tem cronômetro regressivo.
 */
export function readTimer(t) {
  const limit = t?.time_limit_seconds ?? null;
  const deadline = t?.deadline_at ? Date.parse(t.deadline_at) : limit && t?.started_at ? Date.parse(t.started_at) + limit * 1000 : null;
  return { paused: t?.paused_at != null, deadline, frozen: t?.remaining_seconds ?? null };
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
  const [confirming, setConfirming] = React.useState(false); // false · "finish" (última questão) · "end" (encerrar pelo cronômetro)
  const [busy, setBusy] = React.useState(false);
  const [timer, setTimer] = React.useState(() => readTimer(session));
  const [toggling, setToggling] = React.useState(false); // pausando ou continuando
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

  // Cronômetro: o prazo usa o relógio do servidor (diferença medida ao abrir a sessão). Pausado, fica parado.
  const skew = React.useRef(Date.parse(session.server_now) - Date.now());
  const now = useNow();
  const paused = sim && timer.paused;
  const activeMs = useActiveTime(question.id, sim ? question.active_ms : 0, paused);
  const remaining =
    timer.deadline === null
      ? null
      : paused && timer.frozen !== null
        ? timer.frozen
        : Math.max(0, Math.ceil((timer.deadline - (now + skew.current)) / 1000));
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

  const timeIsUp = (e) => /tempo do simulado acabou/i.test(e?.message ?? "");
  const pause = async () => {
    if (toggling || busy || paused) return;
    setToggling(true);
    setError(null);
    try {
      await saving.current.catch(() => {}); // a resposta que estava saindo entra antes da pausa
      setTimer(readTimer(await backend.rpc("app_pause_session", { p_session_id: session.id })));
      setStriking(false);
    } catch (e) {
      if (timeIsUp(e)) finish(true);
      else setError("Não foi possível pausar. Verifique a conexão e tente de novo.");
    }
    setToggling(false);
  };
  const resume = async () => {
    if (toggling || busy || !paused) return;
    setToggling(true);
    setError(null);
    try {
      setTimer(readTimer(await backend.rpc("app_resume_session", { p_session_id: session.id })));
    } catch {
      setError("Não foi possível continuar. Verifique a conexão e tente de novo.");
    }
    setToggling(false);
  };

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
      .catch(async (e) => {
        patch(id, { selected: previous });
        if (/pausado/i.test(e?.message ?? "")) {
          // pausado em outra janela: pausar de novo não muda nada e devolve o cronômetro como está no banco
          const state = await backend.rpc("app_pause_session", { p_session_id: session.id }).catch(() => null);
          if (state) setTimer(readTimer(state));
          setError("O simulado foi pausado em outra janela. Continue para responder.");
        } else setError("Não foi possível guardar sua resposta. Marque de novo.");
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
    else if (sim) setConfirming("finish");
    else finish();
  };

  const toggleMark = () => {
    const on = !question.bookmarked;
    const id = question.id;
    patch(id, { bookmarked: on });
    backend.rpc("app_set_bookmark", { p_question_id: id, p_on: on }).catch(() => patch(id, { bookmarked: !on }));
  };

  const exit = async () => {
    // Sessão aberta sem nenhuma resposta não precisa ficar no histórico (a pausada fica: o aluno vai continuar depois).
    if (answered === 0 && !paused) await backend.rpc("app_finish_session", { p_session_id: session.id }).catch(() => {});
    go(sim ? "simulados" : "questoes");
  };

  // Atalhos: A–D (ou 1–4) marca; Enter confirma ou avança.
  const keys = React.useRef(null);
  keys.current = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || confirming || paused) return;
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
    return answerState(id, question.selected, question.correction);
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
  const urgent = remaining !== null && remaining <= 300 && !paused;
  const clock = remaining !== null ? remaining : spent;
  const ending = confirming === "end";
  // Controles do cronômetro do simulado: com texto no computador, só o ícone no celular.
  const timerControl = (icon, label, onClick, disabled) =>
    mobile ? (
      <IconButton size="sm" icon={icon} label={`${label} o simulado`} onClick={onClick} disabled={disabled} />
    ) : (
      <Button variant="ghost" size="sm" icon={icon} onClick={onClick} disabled={disabled} aria-label={`${label} o simulado`}>
        {label}
      </Button>
    );
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
        <header style={{ position: "sticky", top: 0, zIndex: 5, height: 68, display: "flex", alignItems: "center", gap: mobile ? 10 : 16, padding: mobile ? "0 12px" : "0 32px", borderBottom: "1px solid var(--border-subtle)", background: "color-mix(in oklab,var(--surface-card) 90%,transparent)", backdropFilter: "blur(12px)" }}>
          {mobile && sim ? (
            <IconButton size="sm" icon="x" label="Sair" onClick={exit} />
          ) : (
            <Button variant="ghost" size="sm" icon="x" onClick={exit}>
              Sair
            </Button>
          )}
          <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 3, maxWidth: 560, margin: "0 auto" }} aria-hidden="true">
            {total <= SEGMENT_LIMIT && !(mobile && sim) ? (
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
          {sim ? (
            <div role="group" aria-label="Cronômetro do simulado" style={{ display: "flex", alignItems: "center", gap: mobile ? 2 : 4 }}>
              <span
                className="sm-pill"
                style={paused ? { color: "var(--warning-text)", background: "var(--warning-bg)", borderColor: "transparent", cursor: "default" } : { cursor: "default", ...(urgent ? { color: "var(--danger-text)" } : null) }}
                title={`${remaining !== null ? "Tempo restante" : "Tempo de prova"}${paused ? " (pausado)" : ""}`}
              >
                <Icon name={paused ? "pause" : "timer"} size={16} />
                <span style={{ fontFamily: "var(--font-mono)" }}>{formatClock(clock)}</span>
                {paused && !mobile && <span>Pausado</span>}
              </span>
              {paused ? timerControl("play", "Continuar", resume, toggling || busy) : timerControl("pause", "Pausar", pause, toggling || busy)}
              {timerControl("square", "Encerrar", () => setConfirming("end"), busy || !!confirming)}
            </div>
          ) : (
            !mobile && (
              <span className="sm-pill" title="Tempo respondendo">
                <Icon name="timer" size={16} />
                <span style={{ fontFamily: "var(--font-mono)" }}>{formatClock(spent)}</span>
              </span>
            )
          )}
        </header>

        {confirming ? (
          <div style={{ maxWidth: 560, margin: "0 auto", padding: mobile ? "24px 18px" : "44px 32px" }}>
            <Card style={{ borderRadius: 24 }} padding={mobile ? 22 : 32}>
              <h1 style={{ margin: 0, font: "var(--type-h2)" }}>{ending ? "Encerrar o simulado?" : "Finalizar simulado?"}</h1>
              <p style={{ margin: "10px 0 0", color: "var(--text-secondary)" }}>
                Você respondeu {answered} de {total} questões.
                {blanks.length > 0 && ` ${blanks.length === 1 ? "A questão em branco conta" : `As ${blanks.length} em branco contam`} como erro.`}
                {ending && remaining !== null && ` Ainda restam ${formatClock(remaining)} de prova.`}
              </p>
              {blanks.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 16 }} aria-label="Questões em branco">
                  {blanks.slice(0, BLANK_CHIPS).map(({ q, k }) => (
                    <button
                      key={q.id}
                      type="button"
                      className="sm-chip"
                      onClick={() => {
                        goTo(k);
                        if (paused) resume(); // para responder, o cronômetro volta a correr
                      }}
                      aria-label={`Ir para a questão ${k + 1}`}
                    >
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
                  {ending ? "Encerrar e ver resultado" : "Finalizar e ver resultado"}
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
                  {paused ? "Voltar" : "Voltar às questões"}
                </Button>
              </div>
            </Card>
          </div>
        ) : paused ? (
          <div style={{ maxWidth: 560, margin: "0 auto", padding: mobile ? "24px 18px" : "44px 32px" }}>
            <Card style={{ borderRadius: 24 }} padding={mobile ? 22 : 32}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <IconTile name="pause" size={56} tone="brand" />
                <h1 style={{ margin: "18px 0 0", font: "var(--type-h2)" }}>Simulado pausado</h1>
                <div style={{ marginTop: 14, font: "700 44px/1 var(--font-mono)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{formatClock(clock)}</div>
                <p style={{ margin: "8px 0 0", color: "var(--text-secondary)" }}>
                  {remaining !== null ? "de prova restantes. O cronômetro só volta a correr quando você continuar." : "de prova até aqui. O tempo só volta a contar quando você continuar."}
                </p>
                <p style={{ margin: "12px 0 0", font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>
                  Você respondeu {answered} de {total}. As respostas estão guardadas e as questões ficam escondidas durante a pausa.
                </p>
              </div>
              {error && (
                <div style={{ marginTop: 16 }}>
                  <Banner tone="danger">{error}</Banner>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
                <Button size="lg" fullWidth icon="play" onClick={resume} loading={toggling}>
                  Continuar simulado
                </Button>
                <Button variant="secondary" fullWidth icon="square" onClick={() => setConfirming("end")} disabled={toggling}>
                  Encerrar simulado
                </Button>
                <Button variant="ghost" fullWidth onClick={() => go("simulados")} disabled={toggling}>
                  Sair e continuar depois
                </Button>
              </div>
            </Card>
          </div>
        ) : (
          <div style={{ maxWidth: 720, margin: "0 auto", padding: mobile ? "24px 18px" : "44px 32px" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge tone="brand">{areaLabel(question.area)}</Badge>
              <Badge>{questionRef(question)}</Badge>
              {isStaziamed(question) && <Badge tone="warning">não é questão oficial do Inep</Badge>}
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
            <SupportTable support={question.support} />
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
        {mobile && !confirming && !paused && panel}

        {!confirming && !paused && (
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
      {!mobile && !confirming && !paused && panel}
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
        // Simulado cujo tempo acabou com a página fechada: finaliza com o que estava marcado (pausado não acaba).
        if (session && !session.finished_at && session.time_limit_seconds && !session.paused_at) {
          const { deadline } = readTimer(session);
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
  // acesso às Questões Inéditas acabou (teste vencido, plano vencido): a sessão abre sem questões e com o aviso do banco
  if (view.session.locked) {
    return (
      <Centered>
        <EmptyState
          icon="lock"
          title="Questões Inéditas indisponíveis agora"
          description={view.session.lock_message || "As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia. As questões das provas oficiais continuam abertas."}
          action={<Button onClick={() => go("planos")}>Ver planos</Button>}
        />
      </Centered>
    );
  }
  if (view.session.finished_at) return <SessionResult session={view.session} go={go} timeUp={view.timeUp} />;
  return <Runner key={view.session.id} session={view.session} go={go} onFinished={onFinished} />;
}
