// Sessão de resolução ligada ao banco (treino e simulado).
// Mesma marcação da Session do protótipo (prototype/Session.jsx). Diferenças de comportamento:
//  - treino: confirmar grava a tentativa e o banco devolve a correção;
//  - simulado: marcar já guarda a resposta, sem correção; dá para voltar e trocar até finalizar.
//    O cronômetro do simulado pausa, continua e encerra (com confirmação). A pausa fica no banco
//    (…4300_simulado_cronometro.sql): pausado, o tempo não corre, a questão fica escondida e o banco
//    não aceita resposta; dá para sair e continuar outro dia.
// Visual: modelo "Tela de Questão" (15/10/2026), em ./tela. A dica do Tutor antes de responder não existe no app (só o Tutor depois de
// responder, que vem com a correção); dificuldade e fontes das Questões Inéditas não aparecem (ver docs/tela-questao-modelo.md).
import React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Banner, Button, Card, EmptyState, Icon } from "../../ds";
import { useMQ } from "../Shell.jsx";
import { useSession } from "../session.jsx";
import { CorrectionBody, CorrectionSide, answerState, isAnnulled, useCorrectionData } from "./Correction.jsx";
import { SessionResult } from "./SessionResult.jsx";
import { areaLabel, formatClock } from "./format.js";
import { XPToast, useTurnFeedback } from "../play/PlayFeedback.jsx";
import { QuestionHeader, timerLevel } from "./tela/QuestionHeader.jsx";
import { TutorHint, useHintAvailable } from "./tela/TutorHint.jsx";
import { Alternatives, QuestionFooter, QuestionSheet, ReportQuestion } from "./tela/QuestionSheet.jsx";
import "./tela/tela-questao.css";

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
  const phone = useMQ("(max-width: 719px)"); // no celular o simulado usa barra contínua; no tablet, um traço por questão (pacote)
  // tablet (721 a 1180 px), depois de responder: a explicação sai do cartão e vai para a coluna da direita, como no pacote
  // (TabletRespondida). Só muda o lugar: continua aparecendo só depois de responder, e nunca no simulado.
  const sideExplanation = useMQ("(min-width: 721px) and (max-width: 1180px)");
  const sim = session.kind === "simulado";

  const [questions, setQuestions] = React.useState(session.questions);
  const [index, setIndex] = React.useState(() => {
    // open_index: só a prévia manda (para abrir já na questão respondida); o banco não tem esse campo
    if (Number.isInteger(session.open_index) && session.open_index >= 0 && session.open_index < session.questions.length) return session.open_index;
    const firstOpen = session.questions.findIndex((q) => q.selected == null);
    return firstOpen === -1 ? session.questions.length - 1 : firstOpen;
  });
  const [picked, setPicked] = React.useState(null); // treino: alternativa escolhida, ainda sem confirmar
  const [strike, setStrike] = React.useState({}); // alternativas riscadas por questão (só na tela)
  const [confirming, setConfirming] = React.useState(false); // false · "finish" (última questão, ou resposta em branco no treino) · "end" (encerrar pelo cronômetro)
  const [reviewing, setReviewing] = React.useState(false); // voltou a uma questão em branco pela lista antes de finalizar
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
  // resposta fechada: treino corrigido, ou simulado com a resposta já confirmada (sem correção, só trava)
  const locked = revealed || (sim && question.selected != null);
  const selected = locked ? question.selected : picked;
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
  // Treino: o cronômetro principal ("Respondendo") corre sem parar enquanto a sessão está aberta (dono, 16/10: "o cronômetro
  // simplesmente para e isso não pode acontecer"; antes ele parava ao corrigir a questão e só voltava na próxima). Começa do tempo
  // já gasto nas questões (sessão retomada) e soma o relógio desde que a tela abriu. O tempo de cada questão ("Nesta questão" e o
  // que vai ao banco) continua contando só até responder.
  const treinoClock = React.useRef({ at: Date.now(), base: session.questions.reduce((sum, q) => sum + (q.active_ms ?? 0), 0) });
  const spent = sim
    ? Math.floor(
        (questions.reduce((sum, q) => sum + (q.id === question.id && running ? 0 : q.active_ms), 0) + (running ? activeMs() : 0)) / 1000
      )
    : Math.floor((treinoClock.current.base + Math.max(0, now - treinoClock.current.at)) / 1000);

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

  const goTo = (next, fromList = false) => {
    setReviewing(fromList);
    setIndex(next);
    setPicked(null);
    setError(null);
    setConfirming(false);
    window.scrollTo(0, 0);
  };

  const choose = (option) => {
    if (busy || locked) return;
    // tocar numa alternativa riscada tira o risco e a escolhe (como no modelo)
    if (struck.includes(option)) setStrike((all) => ({ ...all, [question.id]: struck.filter((o) => o !== option) }));
    setPicked(option);
  };

  // Riscar é só da tela; no treino, riscar a escolhida desmarca.
  const strikeOption = (option) => {
    if (busy || locked) return;
    if (picked === option) setPicked(null);
    setStrike((all) => ({ ...all, [question.id]: struck.includes(option) ? struck.filter((o) => o !== option) : [...struck, option] }));
  };

  // "Confirmar resposta": no treino o banco corrige; no simulado só guarda e trava a resposta (a correção vem no fim).
  const confirm = async () => {
    if (picked == null || busy || locked) return;
    setBusy(true);
    setError(null);
    const ms = activeMs();
    try {
      await saving.current.catch(() => {});
      const result = await backend.rpc("app_answer_question", { p_session_id: session.id, p_question_id: question.id, p_option: picked, p_active_ms: ms });
      if (sim) {
        patch(question.id, { selected: picked, active_ms: ms });
      } else {
        const { play, ...rest } = result;
        patch(question.id, { selected: rest.selected, correction: rest, play, active_ms: ms });
        if (play?.xp?.valid) setSessionXp((n) => n + (play.xp.total ?? 0) + (play.bonus ?? []).reduce((sum, b) => sum + (b.xp ?? 0), 0));
        feedback.push(play);
      }
      setPicked(null);
    } catch (e) {
      if (sim && /pausado/i.test(e?.message ?? "")) {
        // pausado em outra janela: pausar de novo não muda nada e devolve o cronômetro como está no banco
        const state = await backend.rpc("app_pause_session", { p_session_id: session.id }).catch(() => null);
        if (state) setTimer(readTimer(state));
        setError("O simulado foi pausado em outra janela. Continue para responder.");
      } else if (sim && timeIsUp(e)) finish(true);
      else setError(sim ? "Não foi possível guardar sua resposta. Confirme de novo." : "Não foi possível registrar sua resposta. Tente de novo.");
    }
    setBusy(false);
  };

  // Avançar. No treino, antes de finalizar (última questão, ou voltando de uma em branco), se sobrou questão não feita
  // aparece a lista delas; só finaliza direto quando não sobrou nenhuma.
  const next = () => {
    const pending = questions.some((q) => q.selected == null);
    if (!last && !reviewing) goTo(index + 1);
    else if (sim || pending) setConfirming("finish");
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
      if (!locked) {
        if (picked != null) confirm();
      } else next();
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

  const blanks = questions.map((q, k) => ({ q, k })).filter(({ q }) => q.selected == null);
  const limit = sim ? (session.time_limit_seconds ?? null) : null;
  const level = sim && !paused ? timerLevel(remaining, limit) : "ok";
  const clock = remaining !== null ? remaining : spent;
  const ending = confirming === "end";
  const hintAvailable = useHintAvailable(backend);
  const correctionData = useCorrectionData(question, revealed ? question.correction : null);

  // Progresso: um traço por questão (até 30) com a cor do resultado no treino; acima disso, barra contínua.
  const segments =
    total <= SEGMENT_LIMIT && !(phone && sim)
      ? questions.map((q, k) => {
          if (k === index) return revealed ? (isAnnulled(question.correction) ? "done" : question.correction.is_correct ? "right" : "wrong") : "current";
          if (q.selected == null) return "open";
          if (!q.correction || isAnnulled(q.correction)) return "done";
          return q.correction.is_correct ? "right" : "wrong";
        })
      : null;
  const timerLabel = !sim ? "Respondendo" : paused ? "Pausado" : remaining === null ? "Tempo de prova" : level === "over" ? "Tempo esgotado" : level === "ok" ? "Restante" : "Reta final";
  const headerTimer = {
    mainLabel: timerLabel,
    mainValue: clock,
    level,
    fraction: limit && remaining !== null ? remaining / limit : null,
    paused,
    questionSeconds: Math.floor((revealed ? question.active_ms : activeMs()) / 1000),
    aria: `${sim ? (remaining !== null ? "Tempo restante do simulado" : "Tempo de prova") : "Tempo respondendo"} ${formatClock(clock)}${paused ? ", pausado" : ""}`,
  };

  // Rodapé: "Confirmar resposta" nos dois modos (no treino corrige; no simulado só guarda e trava). Só depois de confirmar libera avançar.
  const primary = !locked
    ? { label: "Confirmar resposta", onClick: confirm, disabled: picked == null || busy, loading: busy }
    : { label: last ? (sim ? "Finalizar simulado" : "Concluir treino") : "Próxima questão", onClick: next, disabled: busy, loading: busy };
  const hint = locked ? (sim ? "Resposta confirmada" : "") : picked ? `Alternativa ${picked} selecionada` : "Escolha uma alternativa";

  const status = (
    <div style={{ maxWidth: 620, margin: "0 auto", flex: "1 1 100%", padding: "20px 0" }}>
      <Card style={{ borderRadius: 24 }} padding={mobile ? 22 : 32}>
        <h1 style={{ margin: 0, font: "var(--type-h2)" }}>{ending ? "Encerrar o simulado?" : sim ? "Finalizar simulado?" : "Questões não feitas"}</h1>
        <p style={{ margin: "10px 0 0", color: "var(--text-secondary)" }}>
          Você respondeu {answered} de {total} questões.
          {blanks.length > 0 &&
            (sim
              ? ` ${blanks.length === 1 ? "A questão em branco conta" : `As ${blanks.length} em branco contam`} como erro.`
              : ` ${blanks.length === 1 ? "A questão não feita fica" : `As ${blanks.length} questões não feitas ficam`} em branco e não entra${blanks.length === 1 ? "" : "m"} no placar. Toque numa delas para voltar.`)}
          {ending && remaining !== null && ` Ainda restam ${formatClock(remaining)} de prova.`}
        </p>
        {blanks.length > 0 && (
          <ul style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }} aria-label="Questões em branco">
            {blanks.slice(0, BLANK_CHIPS).map(({ q, k }) => (
              <li key={q.id}>
                <button
                  type="button"
                  className="tq-pending"
                  onClick={() => {
                    goTo(k, true);
                    if (paused) resume(); // para responder, o cronômetro volta a correr
                  }}
                  aria-label={`Ir para a questão ${k + 1}`}
                >
                  <span className="tq-mono tq-pending__n">{k + 1}</span>
                  <span className="tq-pending__t">{q.statement}</span>
                  <Icon name="arrow-right" size={16} />
                </button>
              </li>
            ))}
            {blanks.length > BLANK_CHIPS && <li style={{ color: "var(--text-tertiary)" }}>e mais {blanks.length - BLANK_CHIPS}</li>}
          </ul>
        )}
        {error && (
          <div style={{ marginTop: 16 }}>
            <Banner tone="danger">{error}</Banner>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
          <Button onClick={() => finish()} loading={busy}>
            {ending ? "Encerrar e ver resultado" : sim ? "Finalizar e ver resultado" : "Finalizar mesmo assim"}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
            {paused ? "Voltar" : "Voltar às questões"}
          </Button>
        </div>
      </Card>
    </div>
  );

  const pausePanel = (
    <div className="tq-pause">
      <div className="tq-pause__tile">
        <Icon name="pause" size={26} />
      </div>
      <h1>Simulado pausado</h1>
      <div className="tq-mono" style={{ font: "700 44px/1 var(--font-mono)", letterSpacing: "-0.02em", color: "var(--tq-ink)" }}>
        {formatClock(clock)}
      </div>
      <p>{remaining !== null ? "de prova restantes. O cronômetro só volta a correr quando você continuar." : "de prova até aqui. O tempo só volta a contar quando você continuar."}</p>
      <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>Você respondeu {answered} de {total}. As respostas estão guardadas e as questões ficam escondidas durante a pausa.</p>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="tq-pause__btns">
        <button type="button" className="tq-primary" onClick={resume} disabled={toggling} aria-busy={toggling || undefined}>
          <Icon name="play" size={18} />
          Continuar simulado
        </button>
        <button type="button" className="tq-secondary" onClick={() => setConfirming("end")} disabled={toggling}>
          <Icon name="square" size={18} />
          Encerrar simulado
        </button>
        <button type="button" className="tq-ghost" style={{ justifyContent: "center" }} onClick={() => go("simulados")} disabled={toggling}>
          Sair e continuar depois
        </button>
      </div>
    </div>
  );

  return (
    <div className="tq">
      <QuestionHeader
        label={`${sim ? "Simulado Revalida" : "Treino"} · ${areaLabel(session.filters?.area)}`}
        index={index}
        total={total}
        segments={segments}
        progress={(100 * answered) / total}
        timer={headerTimer}
        onExit={exit}
        xp={sessionXp}
        pause={sim ? { paused, disabled: toggling || busy, onToggle: paused ? resume : pause } : null}
        onEnd={sim ? () => setConfirming("end") : null}
        endDisabled={busy || !!confirming}
      />
      <main className="tq-main" data-revealed={!confirming && !paused && revealed ? "true" : "false"}>
        {confirming ? (
          status
        ) : paused ? (
          pausePanel
        ) : (
          <>
            <QuestionSheet
              key={question.id}
              question={question}
              revealed={revealed}
              topic={revealed ? question.correction.topic : null}
              bookmarked={!!question.bookmarked}
              banner={error ? <Banner tone="danger">{error}</Banner> : null}
              hint={!sim && !revealed && hintAvailable ? <TutorHint key={question.id} questionId={question.id} /> : null}
              alternatives={
                <Alternatives
                  options={question.options}
                  stateOf={optionState}
                  chosen={locked ? question.selected : selected}
                  struck={struck}
                  revealed={revealed}
                  locked={locked}
                  onPick={choose}
                  onStrike={strikeOption}
                  strikeDisabled={() => busy}
                />
              }
              answer={revealed && !sideExplanation ? <CorrectionBody selected={question.selected} correction={question.correction} question={question} data={correctionData} /> : null}
              footer={
                <QuestionFooter
                  marked={!!question.bookmarked}
                  onMark={toggleMark}
                  onPrev={sim ? () => goTo(index - 1) : null}
                  prevDisabled={index === 0}
                  onSkip={sim || locked ? null : next}
                  skipDisabled={busy}
                  hint={hint}
                  primary={primary}
                />
              }
              report={<ReportQuestion key={`report-${question.id}`} question={question} />}
            />
            {revealed && (
              <aside className="tq-side" aria-label="Contexto da questão" aria-live="polite">
                {sideExplanation && (
                  <section className="tq-panel tq-panel--expl" aria-label="Explicação">
                    <span className="tq-over tq-over--accent">Explicação</span>
                    <CorrectionBody selected={question.selected} correction={question.correction} question={question} data={correctionData} />
                  </section>
                )}
                <CorrectionSide selected={question.selected} correction={question.correction} question={question} data={correctionData} go={go} inSession showDifficulty={!sim}>
                  {question.play && <XPToast play={question.play} />}
                </CorrectionSide>
              </aside>
            )}
          </>
        )}
      </main>
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
