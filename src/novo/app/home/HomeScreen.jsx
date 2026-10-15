// Início com dados do banco (app_home + app_today).
// Mesma marcação da Home do protótipo (prototype/Home.jsx): "aluno novo" até 10 respostas,
// depois o painel do dia. O que o protótipo mostrava sem ter de onde tirar (comparação com
// aprovados, retenção de flashcards) ficou de fora ou foi trocado por um número real.
import React from "react";
import { Banner, Button, Card, EmptyState, Icon, TopicRow } from "../../ds";
import { useSession } from "../session.jsx";
import { areaLabel, formatClock, percent } from "../practice/format.js";
import { KIND_LABEL, reasonText, trialDaysLeft, trialTitle } from "./plan.js";
import { hasFullAccess, usePlanLock } from "../plan/planAccess.js";
import { RadarAvisoFaixa } from "../admin/radar/RadarAvisoFaixa.jsx";
import { useRadarAvisos } from "../admin/radar/useRadarAvisos.js";
import { IneditasCard, ineditasState } from "../practice/IneditasCard.jsx";
import { PlayError, PlayHeader, PlayLoading, PlayLower, TrailPreview, usePlayHome } from "../play/PlayDashboard.jsx";

const DIAGNOSTIC_SIZE = 10;
const R = { borderRadius: 24 };

/** O aviso do teste vira alerta nos 2 últimos dias e depois que o teste acaba. */
const trialEnding = (trial) => {
  const left = trialDaysLeft(trial);
  return left === null || left <= 2;
};

function TrialBanner({ trial, attempts, go }) {
  // Teste que acabou E o banco confirmou que a conta está sem acesso pago: avisa o que fica nos planos pagos e o que segue aberto (PL02).
  // O botão "Ver planos" leva à tela informativa de planos (sem preço e sem assinatura: a Stripe está parada). Sem a confirmação do banco, fica como antes.
  const lock = usePlanLock();
  const over = Boolean(lock) && trialDaysLeft(trial) === null;
  return (
    <Banner
      tone={trialEnding(trial) ? "warning" : "brand"}
      title={trialTitle(trial)}
      action={
        <Button size="sm" variant="secondary" onClick={() => go("planos")}>
          Ver planos
        </Button>
      }
    >
      {over
        ? lock.text
        : attempts === 0
          ? "Você ainda não respondeu nenhuma questão."
          : `Você respondeu ${attempts} ${attempts === 1 ? "questão" : "questões"} até agora.`}
    </Banner>
  );
}

function HomeNew({ go, mobile, home, profile, startDiagnostic, busy, extra }) {
  const started = home.attempts > 0 || home.open_session;
  const steps = [
    ["Personalizar rotina", profile.daily_minutes != null, () => go("hoje", { ajustar: 1 })],
    ["Diagnóstico inicial", home.attempts >= DIAGNOSTIC_SIZE, startDiagnostic],
    ["Definir data da prova", profile.exam_date != null, () => go("hoje", { ajustar: 1 })],
  ];
  return (
    <>
      {home.trial && <TrialBanner trial={home.trial} attempts={home.attempts} go={go} />}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1.55fr) minmax(0,1fr)", gap: 20 }}>
        <div style={{ padding: mobile ? 24 : 36, borderRadius: 24, background: "var(--navy-900)", color: "#fff", display: "flex", flexDirection: "column", gap: 14 }}>
          <span className="sm-overline" style={{ color: "var(--teal-300)" }}>
            Comece aqui
          </span>
          <h2 style={{ margin: 0, font: `700 ${mobile ? 24 : 30}px/1.2 var(--font-sans)`, letterSpacing: "-0.015em", color: "#fff" }}>Faça o diagnóstico inicial</h2>
          <p style={{ margin: 0, color: "var(--navy-200)", maxWidth: 480 }}>
            {DIAGNOSTIC_SIZE} questões oficiais, cerca de 20 minutos. Com elas calculamos sua acurácia nas 5 grandes áreas do Revalida e montamos seu plano.
            {home.attempts > 0 && ` Você já respondeu ${home.attempts} de ${DIAGNOSTIC_SIZE}.`}
          </p>
          <div>
            <button type="button" className="sm-btn sm-btn--lg" onClick={startDiagnostic} disabled={busy} style={{ background: "var(--teal-400)", color: "var(--navy-950)", marginTop: 8 }}>
              {started ? "Continuar diagnóstico" : "Começar diagnóstico"} <Icon name="arrow-right" size={18} />
            </button>
          </div>
        </div>
        <Card style={R} padding={28}>
          <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
            Primeiros passos · {steps.filter(([, done]) => done).length} de {steps.length}
          </span>
          {steps.map(([title, done, run]) => (
            <button
              key={title}
              type="button"
              onClick={run}
              disabled={busy}
              style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", padding: "14px 0", border: 0, borderBottom: "1px solid var(--border-subtle)", background: "none", cursor: "pointer", color: "inherit", font: "inherit", textAlign: "left" }}
            >
              <span style={{ width: 24, height: 24, borderRadius: "50%", flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: done ? "var(--action-primary)" : "transparent", border: done ? 0 : "1.5px solid var(--border-strong)", color: "#fff" }}>
                {done ? <Icon name="check" size={13} label="Feito" /> : null}
              </span>
              <span style={{ flex: 1, font: "600 15px var(--font-sans)", textDecoration: done ? "line-through" : "none", color: done ? "var(--text-tertiary)" : "var(--text-primary)" }}>{title}</span>
              <Icon name="chevron-right" size={18} style={{ color: "var(--text-tertiary)" }} />
            </button>
          ))}
        </Card>
      </div>
      {extra}
      <EmptyState icon="chart-no-axes-combined" title="Seu desempenho aparece aqui" description={`Depois das primeiras ${DIAGNOSTIC_SIZE} questões mostramos acurácia, ritmo e temas prioritários.`} />
    </>
  );
}

function HomeActive({ go, mobile, home, plan, startTask, toggleTask, busy, play, extra }) {
  const open = home.open_session;
  const pending = plan.tasks.find((t) => !t.done);
  let hero;
  if (open) {
    const left = open.total - open.answered;
    hero = {
      title:
        open.kind === "simulado"
          ? `Simulado de ${open.total} questões`
          : open.status === "wrong"
            ? `Revisão de ${open.total} ${open.total === 1 ? "questão errada" : "questões erradas"}`
            : `${open.total} questões · ${areaLabel(open.area)}`,
      text:
        (open.paused ? `Simulado pausado${open.remaining_seconds != null ? ` com ${formatClock(open.remaining_seconds)} de prova` : ""}. ` : "") +
        (left > 0 ? `Você parou na questão ${open.answered + 1}. ${left === 1 ? "Falta 1" : `Faltam ${left}`}.` : "Todas respondidas: falta só concluir para ver o resultado."),
      cta: "Continuar",
      run: () => go("sessao", { s: open.id }),
    };
  } else if (pending) {
    hero = {
      title: pending.title,
      text: `${reasonText(pending)}${pending.progress > 0 ? ` ${pending.progress} de ${pending.target} feitas hoje.` : ""}`,
      cta: pending.progress > 0 ? "Continuar" : "Começar",
      run: () => startTask(pending),
    };
  } else {
    hero = { title: "Plano de hoje concluído", text: "Quer continuar? Monte um treino livre ou faça um simulado.", cta: "Montar treino", run: () => go("questoes") };
  }

  const accuracy = percent(home.correct, home.attempts);
  const comparable = home.week.attempts >= 10 && home.previous_week.attempts >= 10;
  const delta = percent(home.week.correct, home.week.attempts) - percent(home.previous_week.correct, home.previous_week.attempts);
  const metrics = [
    ["Acurácia", `${accuracy}%`, comparable ? `${delta >= 0 ? "+" : ""}${delta} pts na semana` : `${home.attempts} respostas`, comparable && delta >= 0, "desempenho"],
    ["Itens na semana", home.week.attempts, `${home.today.attempts} hoje · ${home.week.days_active} ${home.week.days_active === 1 ? "dia ativo" : "dias ativos"}`, false, "desempenho"],
    ["Para revisar", home.wrong_pending, home.wrong_pending ? "questões erradas no caderno" : "nenhuma questão pendente", home.wrong_pending === 0, "erros"],
  ];

  const s = play.summary;
  const playOn = s.data?.enabled !== false;
  return (
    <>
      {home.trial && trialEnding(home.trial) && <TrialBanner trial={home.trial} attempts={home.attempts} go={go} />}
      {playOn && (s.error ? <PlayError retry={s.reload} /> : !s.data ? <PlayLoading /> : <PlayHeader summary={s.data} mobile={mobile} go={go} />)}
      {play.error && <Banner tone="danger">{play.error}</Banner>}
      <Card style={{ borderRadius: 28 }} padding={mobile ? 24 : 36}>
        <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 24 : 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 360px", minWidth: 0 }}>
              <span className="sm-overline">Próximo passo</span>
              <h2 style={{ margin: "10px 0 8px", font: `700 ${mobile ? 24 : 30}px/1.2 var(--font-sans)`, letterSpacing: "-0.02em" }}>{hero.title}</h2>
              <p style={{ margin: 0, color: "var(--text-secondary)", maxWidth: 520 }}>{hero.text}</p>
            </div>
            <Button size="lg" iconRight="arrow-right" onClick={hero.run} loading={busy}>
              {hero.cta}
            </Button>
          </div>
          {plan.tasks.length > 0 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : `repeat(${Math.min(plan.tasks.length, 3)},1fr)`, gap: mobile ? 8 : 12 }}>
                {plan.tasks.map((task) => (
                  <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16, background: task.done ? "var(--surface-subtle)" : "var(--surface-card)", border: "1px solid var(--border-subtle)" }}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={task.done}
                      aria-label={`Concluir ${task.title}`}
                      onClick={() => toggleTask(task)}
                      style={{ width: 24, height: 24, flex: "none", borderRadius: "50%", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", background: task.done ? "var(--action-primary)" : "transparent", border: task.done ? 0 : "1.5px solid var(--border-strong)", color: "var(--action-on-primary)" }}
                    >
                      {task.done && <Icon name="check" size={13} />}
                    </button>
                    <button type="button" onClick={() => startTask(task)} disabled={busy || task.done} style={{ flex: 1, minWidth: 0, border: 0, background: "none", padding: 0, textAlign: "left", cursor: task.done ? "default" : "pointer", font: "inherit", color: "inherit" }}>
                      <span style={{ display: "block", font: "500 12px var(--font-sans)", color: "var(--text-tertiary)" }}>
                        {KIND_LABEL[task.kind]} · {task.minutes} min
                      </span>
                      <span style={{ display: "block", font: "600 14px var(--font-sans)", marginTop: 2, textDecoration: task.done ? "line-through" : "none", color: task.done ? "var(--text-tertiary)" : "var(--text-primary)" }}>{task.title}</span>
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                <span>
                  Plano de hoje · {plan.done} de {plan.total}
                </span>
                <div style={{ flex: 1, maxWidth: 200, height: 4, borderRadius: 9, background: "var(--chart-track)" }}>
                  <div style={{ width: `${percent(plan.done, plan.total)}%`, height: "100%", borderRadius: 9, background: "var(--action-primary)", transition: "width var(--dur-slow)" }} />
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
      {extra}
      {playOn && s.data?.flags?.trail !== false && <TrailPreview go={go} mobile={mobile} onStart={play.startNode} busy={play.busy} />}
      {playOn && s.data && <PlayLower summary={s.data} mobile={mobile} go={go} />}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(3,1fr)", gap: mobile ? 12 : 20 }}>
        {metrics.map(([label, value, caption, ok, route]) => (
          <button key={label} type="button" onClick={() => go(route)} className="sm-card sm-card--interactive" style={{ borderRadius: 24, padding: mobile ? 18 : 24, textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer" }}>
            <div style={{ font: "500 13px var(--font-sans)", color: "var(--text-tertiary)" }}>{label}</div>
            <div style={{ font: `700 ${mobile ? 28 : 34}px/1.1 var(--font-sans)`, letterSpacing: "-0.02em", marginTop: 8 }}>{value}</div>
            <div style={{ font: "600 13px var(--font-sans)", color: ok ? "var(--success-text)" : "var(--text-secondary)", marginTop: 4 }}>{caption}</div>
          </button>
        ))}
      </div>
      {home.priority_topics.length > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, font: "600 17px var(--font-sans)" }}>Temas prioritários</h3>
            <Button variant="link" iconRight="chevron-right" onClick={() => go("questoes")}>
              Ver todos
            </Button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {home.priority_topics.map((topic) => (
              <TopicRow
                key={`${topic.area}-${topic.topic}`}
                status="pendente"
                area={areaLabel(topic.area)}
                title={topic.topic}
                questions={topic.questions}
                questionsLabel={topic.questions === 0 && topic.ineditas > 0 ? `${topic.ineditas} inéditas StaziaMed` : undefined}
                cards={0}
                mastery={percent(topic.correct, topic.attempts)}
                onClick={() => go("questoes", { tema: topic.topic, area: topic.area, status: "all", ...(topic.questions === 0 && topic.ineditas > 0 ? { prova: "staziamed" } : {}) })}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function HomeScreen({ go, mobile }) {
  const { backend, boot } = useSession();
  const play = usePlayHome(go);
  const radar = useRadarAvisos(boot.role === "admin");
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    Promise.all([backend.rpc("app_home"), backend.rpc("app_today"), backend.rpc("app_announcement").catch(() => null), Promise.resolve().then(() => backend.rpc("app_my_ineditas")).catch(() => null)])
      .then(([home, plan, announcement, ineditas]) => alive && setData({ home, plan, announcement, ineditas }))
      .catch(() => alive && setError("Não foi possível carregar o Início. Recarregue a página."));
    return () => {
      alive = false;
    };
  }, [backend]);

  const startTask = async (task) => {
    setBusy(true);
    setError(null);
    try {
      const started = await backend.rpc("app_start_plan_task", { p_task_id: task.id });
      go("sessao", { s: started.session_id });
    } catch {
      setError("Não foi possível abrir o treino. Tente de novo.");
      setBusy(false);
    }
  };
  const toggleTask = async (task) => {
    try {
      const plan = await backend.rpc("app_set_plan_task", { p_task_id: task.id, p_done: !task.done });
      setData((current) => ({ ...current, plan }));
    } catch {
      setError("Não foi possível atualizar a tarefa. Tente de novo.");
    }
  };

  if (!data) {
    return error ? <Banner tone="danger">{error}</Banner> : <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;
  }

  const { plan } = data;
  // equipe (administrador ou editor) e revisor médico têm acesso completo: sem aviso de teste grátis
  const home = hasFullAccess(boot) ? { ...data.home, trial: null } : data.home;
  const startDiagnostic = () => {
    if (home.open_session) return go("sessao", { s: home.open_session.id });
    const task = plan.tasks.find((t) => t.ref?.reason === "diagnostic");
    return task ? startTask(task) : go("questoes");
  };

  // atalho das Questões Inéditas (contador + convite); só aparece se existir alguma publicada
  const ineditasCard =
    ineditasState(data.ineditas) !== "oculto" ? (
      <IneditasCard
        variant="inicio"
        ineditas={data.ineditas}
        onPlans={() => go("planos")}
        onOpen={({ status }) => go("questoes", { prova: "staziamed", status })}
      />
    ) : null;

  return (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      {boot.role === "admin" && <RadarAvisoFaixa avisos={radar} go={go} />}
      {data.announcement && (
        <Banner tone={data.announcement.tone} icon="megaphone" title={data.announcement.title}>
          {data.announcement.text}
        </Banner>
      )}
      {home.attempts < DIAGNOSTIC_SIZE ? (
        <HomeNew go={go} mobile={mobile} home={home} profile={boot.profile} startDiagnostic={startDiagnostic} busy={busy} extra={ineditasCard} />
      ) : (
        <HomeActive go={go} mobile={mobile} home={home} plan={plan} startTask={startTask} toggleTask={toggleTask} busy={busy} play={play} extra={ineditasCard} />
      )}
    </>
  );
}
