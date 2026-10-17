// Início com dados do banco (app_home + app_today).
// Mesma marcação da Home do protótipo (prototype/Home.jsx): "aluno novo" até 10 respostas,
// depois o painel do dia. O que o protótipo mostrava sem ter de onde tirar (comparação com
// aprovados, retenção de flashcards) ficou de fora ou foi trocado por um número real.
import React from "react";
import { Banner, Button, Card, EmptyState, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { useLayout } from "../shell/useLayout.js";
import { AppRealIcon } from "../AppIcons.jsx";
import { areaLabel, formatClock, percent } from "../practice/format.js";
import { KIND_LABEL, reasonText, trialDaysLeft, trialTitle } from "./plan.js";
import { Mono, Ring, TaskIcon, areaLetter, areaStyle, taskTile } from "./parts.jsx";
import "./inicio.css";
import { hasFullAccess, usePlanLock } from "../plan/planAccess.js";
import { RadarAvisoFaixa } from "../admin/radar/RadarAvisoFaixa.jsx";
import { useRadarAvisos } from "../admin/radar/useRadarAvisos.js";
import { IneditasCard, ineditasState } from "../practice/IneditasCard.jsx";
import { PlayError, usePlayHome } from "../play/PlayDashboard.jsx";
import { ScoreExplainer } from "../play/components.jsx";
import { usePlayLoad } from "../play/usePlay.js";
import { inicioCelular } from "../shell/cascaConfig.js";
import { NivelamentoConvite } from "../nivelamento/NivelamentoConvite.jsx";
import { CONVITE } from "../nivelamento/textos.js";
import { ConviteOnboarding, PrimeirosPassosCartao, PrimeirosPassosFaixa, useOnboardingAtual } from "../onboarding/Inicio.jsx";

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

function HomeNew({ go, mobile, home, profile, startDiagnostic, busy, extra, boot, onboarding }) {
  const niv = boot.nivelamento;
  const nivAplicavel = niv?.aplicavel;
  const nivPendente = nivAplicavel && (niv.situacao === "novo" || niv.situacao === "adiado" || niv.situacao === "bloco1");
  const nivConcluido = nivAplicavel && (niv.situacao === "parcial" || niv.situacao === "bloco2" || niv.situacao === "concluido");
  
  const started = nivAplicavel ? (niv.situacao === "bloco1") : (home.attempts > 0 || home.open_session);
  const diagDone = nivAplicavel ? nivConcluido : (home.attempts >= DIAGNOSTIC_SIZE);

  const steps = [
    ["Personalizar rotina", profile.daily_minutes != null, () => go("hoje", { ajustar: 1 })],
    ["Diagnóstico inicial", diagDone, startDiagnostic],
    ["Definir data da prova", profile.exam_date != null, () => go("hoje", { ajustar: 1 })],
  ];
  return (
    <>
      {/* pendente: o cartão grande abaixo já é o convite; com a parte 1 feita, o cartão do nivelamento oferece as outras 15 */}
      <ConviteOnboarding estado={onboarding} go={go} />
      {niv?.convite && !nivPendente && <NivelamentoConvite estado={niv} go={go} />}
      {home.trial && <TrialBanner trial={home.trial} attempts={home.attempts} go={go} />}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1.55fr) minmax(0,1fr)", gap: 20 }}>
        <div data-tour="plano-de-hoje" style={{ padding: mobile ? 24 : 36, borderRadius: 24, background: "var(--navy-900)", color: "#fff", display: "flex", flexDirection: "column", gap: 14 }}>
          <span className="sm-overline" style={{ color: "var(--teal-300)" }}>
            Comece aqui
          </span>
          <h2 style={{ margin: 0, font: `700 ${mobile ? 24 : 30}px/1.2 var(--font-sans)`, letterSpacing: "-0.015em", color: "#fff" }}>
            {nivPendente ? "Faça o diagnóstico de nivelamento" : nivConcluido ? "Seu plano já está montado" : "Faça o diagnóstico inicial"}
          </h2>
          <p style={{ margin: 0, color: "var(--navy-200)", maxWidth: 480 }}>
            {nivPendente ? CONVITE.novo.texto : nivConcluido ? "O seu plano de hoje começa pela área de maior prioridade do seu nivelamento." : (
              <>{DIAGNOSTIC_SIZE} questões oficiais, cerca de 20 minutos. Com elas calculamos sua acurácia nas 5 grandes áreas do Revalida e montamos seu plano.{home.attempts > 0 && ` Você já respondeu ${home.attempts} de ${DIAGNOSTIC_SIZE}.`}</>
            )}
          </p>
          <div>
            <button type="button" className="sm-btn sm-btn--lg" onClick={startDiagnostic} disabled={busy} style={{ background: "var(--teal-400)", color: "var(--navy-950)", marginTop: 8 }}>
              {nivConcluido ? "Começar o plano de hoje" : started ? "Continuar diagnóstico" : "Começar diagnóstico"} <Icon name="arrow-right" size={18} />
            </button>
          </div>
        </div>
        <Card style={R} padding={28}>
          {/* Primeiros passos confirmados por ação real (onboarding, migração 013720); sem ele, a lista de antes */}
          {onboarding?.aplicavel ? <PrimeirosPassosCartao estado={onboarding} go={go} /> : <>
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
          </>}
        </Card>
      </div>
      {extra}
      <EmptyState icon="chart-no-axes-combined" title="Seu desempenho aparece aqui" description={`Depois das primeiras ${DIAGNOSTIC_SIZE} questões mostramos acurácia, ritmo e temas prioritários.`} />
    </>
  );
}

/** Etapas da trilha em bolinhas: as feitas, a atual e as que faltam; a última é a bandeira da etapa. */
function TrailSteps({ answered, goal }) {
  const n = Math.max(2, Math.min(Number(goal) || 8, 8));
  const frac = goal > 0 ? Math.min(1, Math.max(0, answered / goal)) : 0;
  const filled = Math.min(n, answered > 0 ? Math.max(1, Math.round(frac * n)) : 0);
  const items = [];
  for (let i = 0; i < n; i += 1) {
    if (i === n - 1 && filled < n) items.push(<span key={i} className="ih-st ih-st--flag"><svg width="11" height="11" viewBox="0 0 24 24" fill="var(--streak)" aria-hidden="true"><path d="M5 21V4h11l-2 4 2 4H7v9z" /></svg></span>);
    else if (i < filled) items.push(<span key={i} className="ih-st ih-st--done"><Icon name="check" size={11} /></span>);
    else if (i === filled) items.push(<span key={i} className="ih-st ih-st--now" />);
    else items.push(<span key={i} className="ih-st" />);
  }
  return (
    <span className="ih-steps" role="img" aria-label={`${answered} de ${goal} questões da etapa`}>
      <span className="ih-steps-fill" style={{ width: `${Math.round(frac * 100)}%` }} />
      {items}
    </span>
  );
}

/** Próxima etapa da trilha (mesmos dados da prévia antiga do Início: app_trail). Sem trilha ligada, não aparece. */
function TrailCard({ trail, onStart, busy, go }) {
  if (!trail.data && !trail.error) return <div className="ih-lcard" aria-busy="true" style={{ minHeight: 134, cursor: "default" }} />; // guarda o lugar (o carrossel do celular não pula)
  if (!trail.data || trail.error || trail.data.enabled === false) return null;
  const areas = trail.data.areas;
  let pick = null;
  for (const a of areas) {
    const n = a.nodes.find((x) => x.state === "in_progress") ?? a.nodes.find((x) => x.state === "available");
    if (n && (!pick || n.state === "in_progress")) pick = { area: a, node: n };
    if (pick?.node.state === "in_progress") break;
  }
  const done = areas.reduce((acc, a) => acc + a.done, 0);
  const total = areas.reduce((acc, a) => acc + a.total, 0);
  const run = () => (pick ? onStart(pick.area.area, pick.node.topic) : go("trilha"));
  return (
    <button type="button" className="ih-lcard ih-press" onClick={run} disabled={busy} aria-label={pick ? `Sua trilha: ${pick.node.topic}. Continuar` : "Trilha concluída. Ver trilha"}>
      <span className="ih-lcard-h">
        <span className="ih-lcard-ic">{AppRealIcon({ name: "route", size: 30 })}</span>
        <span className="ih-lcard-t">
          <small className="brand">Sua trilha</small>
          <b>{pick ? pick.node.topic : "Trilha concluída"}</b>
        </span>
      </span>
      {pick ? <TrailSteps answered={pick.node.answered} goal={pick.node.goal} /> : null}
      <span className="ih-lcard-f">
        <span>
          {pick ? (
            <>
              {pick.area.label} · etapa {Math.min(pick.area.done + 1, pick.area.total)} de {pick.area.total} · <Mono>{pick.node.answered}/{pick.node.goal}</Mono>
            </>
          ) : (
            `${done} de ${total} etapas concluídas.`
          )}
        </span>
        <strong>{pick ? "Continuar →" : "Ver trilha →"}</strong>
      </span>
    </button>
  );
}

/**
 * Questões Inéditas como terceiro cartão do Início (proposta de 15/10/2026). Mesmos dados e estados do cartão de sempre (app_my_ineditas):
 * todas liberadas, parte liberada (teste grátis ou plano com limite) ou sem acesso. "Resolver" abre o Banco já filtrado nas inéditas.
 */
export function ineditasHomeText(i, trial) {
  const st = ineditasState(i);
  if (st === "todas") return `${i.total} liberadas`;
  if (st === "limitado") return `${i.released} de ${i.total} ${trial ? "no teste grátis" : "no seu plano"}`;
  if (st === "sem_acesso") return `${i.total} no banco · abrem com plano ou teste grátis em dia`;
  return null;
}
function IneditasHomeCard({ ineditas, trial, go, compact }) {
  const st = ineditasState(ineditas);
  if (st === "oculto") return null;
  const released = Number(ineditas.released) || 0;
  const answered = Math.min(Number(ineditas.answered) || 0, released);
  const pending = released - answered;
  const locked = st === "sem_acesso";
  const run = () => (locked ? go("planos") : go("questoes", { prova: "staziamed", status: pending > 0 ? "unanswered" : "all" }));
  return (
    <div className={`ih-lcard ih-ined${compact ? " ih-ined--m" : ""}`} style={{ cursor: "default" }} role="region" aria-label="Questões Inéditas">
      <span className="ih-lcard-h">
        <span className="ih-lcard-ic ih-tile--ai">{locked ? <Icon name="lock" size={22} /> : AppRealIcon({ name: "sparkles", size: 30 })}</span>
        <span className="ih-lcard-t">
          <small style={{ color: "var(--ai-text)" }}>Escritas pela StaziaMed</small>
          <b>Questões Inéditas</b>
        </span>
      </span>
      <span className="ih-ined-n">{ineditasHomeText(ineditas, trial)}</span>
      <button type="button" className="ip-btn ip-btn--ai ih-ined-btn" onClick={run}>
        {locked ? (
          <>
            <Icon name="lock" size={16} /> Ver planos
          </>
        ) : (
          <>
            {pending > 0 || answered === 0 ? "Resolver" : "Rever"} <Icon name="arrow-right" size={16} />
          </>
        )}
      </button>
    </div>
  );
}

function PriorityCard({ topics, go, compact }) {
  if (!topics.length) return null;
  const top = topics[0];
  const mastery = percent(top.correct, top.attempts);
  const open = () => go("questoes", { tema: top.topic, area: top.area, status: "all", ...(top.questions === 0 && top.ineditas > 0 ? { prova: "staziamed" } : {}) });
  const body = (
    <>
      <span className="ih-lcard-h">
        <span className="ih-letter" style={areaStyle(top.area)} aria-hidden="true">{areaLetter(top.area)}</span>
        <span className="ih-lcard-t">
          <small>Próximo tema prioritário</small>
          <b>{top.topic}</b>
          {compact && (
            <span className="ih-meter" style={{ marginTop: 4 }}>
              <span className="ih-chip" style={areaStyle(top.area)}>{areaLabel(top.area)}</span>
              <i><b style={{ width: `${mastery}%` }} /></i>
              <span>{mastery}% domínio</span>
            </span>
          )}
        </span>
        <Icon name="chevron-right" size={18} className="ih-chev" />
      </span>
      {!compact && (
        <span className="ih-meter">
          <i><b style={{ width: `${mastery}%` }} /></i>
          <span>{mastery}% domínio</span>
        </span>
      )}
    </>
  );
  if (compact) {
    return (
      <button type="button" className="ih-theme ih-press" onClick={open} aria-label={`Próximo tema prioritário: ${top.topic}`}>
        {body}
      </button>
    );
  }
  return (
    <div className="ih-lcard" style={{ cursor: "default" }}>
      <button type="button" className="ih-press" onClick={open} aria-label={`Próximo tema prioritário: ${top.topic}`} style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: 14, borderRadius: 16, boxSizing: "border-box" }}>
        {body}
      </button>
      <button type="button" className="ih-link" onClick={() => go("questoes")} style={{ all: "unset", cursor: "pointer", alignSelf: "flex-start", minHeight: 24, font: "800 12.5px var(--font-sans)", color: "var(--action-primary)" }}>
        Ver {topics.length === 1 ? "o tema prioritário" : `os ${topics.length} temas prioritários`}
      </button>
    </div>
  );
}

/** Etapa atual da trilha (a mesma escolha do cartão "Sua trilha"). */
function trailPick(trail) {
  if (!trail.data || trail.error || trail.data.enabled === false) return null;
  let pick = null;
  for (const a of trail.data.areas) {
    const n = a.nodes.find((x) => x.state === "in_progress") ?? a.nodes.find((x) => x.state === "available");
    if (n && (!pick || n.state === "in_progress")) pick = { area: a, node: n };
    if (pick?.node.state === "in_progress") break;
  }
  return pick;
}

/**
 * Início do celular "simples" (pacote MobileMenu, "Mobile · Início"): cartão "Próximo passo", Stazia Score e Meta de hoje lado a lado,
 * e a Trilha de aprendizado. Mesmos dados do Início completo; Score, Meta, missões e trilha só com a Stazia Arena ligada.
 * Escolha em shell/cascaConfig.js (INICIO_CELULAR = "simples").
 */
function HomeSimples({ hero, busy, sum, arenaOn, trail, startNode, top, setExplain }) {
  const today = sum?.streak?.today ?? {};
  const goalQ = today.min_questions ?? 10;
  const doneQ = sum?.streak?.today_done ? goalQ : Math.min(today.questions ?? 0, goalQ);
  const missions = arenaOn && sum?.missions?.total > 0 ? sum.missions : null;
  const pick = arenaOn ? trailPick(trail) : null;
  const scoreName = sum?.names?.score ?? "Stazia Score";
  return (
    <div className="ih ih--m ih--simples">
      {top}
      <section className="ihs-next" aria-label={hero.kicker} data-tour="plano-de-hoje">
        <span className="ihs-k">{hero.kicker === "Continue de onde parou" ? "Próximo passo" : hero.kicker}</span>
        <h2>{hero.title}</h2>
        <span className="ihs-sub">{hero.sub}</span>
        <button type="button" className="ihs-cta ih-press" onClick={hero.run} disabled={busy}>
          {hero.cta} <Icon name="arrow-right" size={16} />
        </button>
      </section>
      {sum && (
        <div className="ihs-two">
          <button type="button" className="ihs-box ih-press" onClick={() => setExplain(true)} aria-label={`${scoreName} ${sum.score} de 1000${sum.level?.name ? `, ${sum.level.name}` : ""}. Ver como é calculado`}>
            <span className="ihs-over">{scoreName}</span>
            <span>
              <b className="ihs-n">{sum.score}</b>
              <small className="ihs-of"> /1000</small>
            </span>
            <span className="ihs-bar"><i style={{ width: `${Math.min(100, Math.round(sum.score / 10))}%` }} /></span>
            {sum.level?.name && <span className="ihs-foot">{sum.level.name}</span>}
          </button>
          <div className="ihs-box" role="group" aria-label={`Meta de hoje: ${doneQ} de ${goalQ} questões`}>
            <span className="ihs-over">Meta de hoje</span>
            <span>
              <b className="ihs-n">{doneQ}</b>
              <small className="ihs-of"> /{goalQ} q.</small>
            </span>
            <span className="ihs-bar"><i style={{ width: `${Math.round((100 * doneQ) / Math.max(1, goalQ))}%` }} /></span>
            {missions && (
              <span className="ihs-foot">
                <Mono>{missions.done}/{missions.total}</Mono> missões
              </span>
            )}
          </div>
        </div>
      )}
      {pick && (
        <button type="button" className="ihs-box ihs-trail ih-press" onClick={() => startNode(pick.area.area, pick.node.topic)} aria-label={`Trilha de aprendizado: ${pick.node.topic}. Continuar`}>
          <span className="ihs-over ihs-over--brand">Trilha de aprendizado</span>
          <b className="ihs-t">{pick.node.topic}</b>
          <span className="ihs-foot">
            {pick.area.label} · <Mono>{pick.node.answered}/{pick.node.goal}</Mono> questões da etapa
          </span>
        </button>
      )}
    </div>
  );
}

function HomeActive({ go, home, plan, startTask, busy, play, startNode, ineditas, arenaOn, onboarding }) {
  const compact = useLayout() === "mobile";
  const { backend } = useSession();
  const trail = usePlayLoad(() => (arenaOn ? backend.rpc("app_trail", { p_area: null }) : Promise.resolve({ enabled: false })), [backend, arenaOn]);
  const [explain, setExplain] = React.useState(false);
  const [slide, setSlide] = React.useState(0);
  const open = home.open_session;
  const pending = plan.tasks.find((t) => !t.done);
  const s = play.summary;
  const playOn = s.data?.enabled !== false;
  const sum = s.data && s.data.enabled !== false ? s.data : null;

  let hero;
  if (open) {
    const left = open.total - open.answered;
    hero = {
      kicker: "Continue de onde parou",
      title:
        open.kind === "simulado"
          ? `Simulado de ${open.total} questões`
          : open.status === "wrong"
            ? `Revisão de ${open.total} ${open.total === 1 ? "questão errada" : "questões erradas"}`
            : `${open.total} questões · ${areaLabel(open.area)}`,
      sub:
        (open.paused ? `Simulado pausado${open.remaining_seconds != null ? ` com ${formatClock(open.remaining_seconds)} de prova` : ""}. ` : "") +
        (left > 0 ? `Você parou na questão ${open.answered + 1}. ${left === 1 ? "Falta 1" : `Faltam ${left}`}.` : "Todas respondidas: falta só concluir para ver o resultado."),
      ring: { value: open.answered, total: open.total },
      cta: "Continuar",
      run: () => go("sessao", { s: open.id }),
    };
  } else if (pending) {
    hero = {
      kicker: "Próximo passo",
      title: pending.title,
      sub: `${reasonText(pending)}${pending.progress > 0 ? ` ${pending.progress} de ${pending.target} feitas hoje.` : ""}`,
      ring: { value: pending.progress, total: pending.target },
      cta: pending.progress > 0 ? "Continuar" : "Começar",
      run: () => startTask(pending),
    };
  } else {
    hero = { kicker: "Tudo certo por hoje", title: "Plano de hoje concluído", sub: "Quer continuar? Monte um treino livre ou faça um simulado.", ring: { value: plan.done, total: plan.total }, cta: "Montar treino", run: () => go("questoes") };
  }

  // meta de hoje (Stazia Play): só aparece com o Play ligado e respondido
  const today = sum?.streak?.today ?? {};
  const goalQ = today.min_questions ?? 10;
  const doneQ = sum?.streak?.today_done ? goalQ : Math.min(today.questions ?? 0, goalQ);
  const segments = Math.round((10 * doneQ) / Math.max(1, goalQ));
  const goal = sum ? (
    <div className="ih-goal">
      <b>Meta de hoje</b>
      <span className="ih-goal-bar" role="img" aria-label={`${doneQ} de ${goalQ} questões`}>
        {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < segments ? "on" : ""} />)}
      </span>
      <span className="ih-goal-n">{compact ? `${doneQ}/${goalQ}` : `${doneQ}/${goalQ} · ${today.min_minutes ?? 20} min`}</span>
    </div>
  ) : null;

  const heroEl = (
    <section className="ih-hero" aria-label={hero.kicker} data-tour={plan.tasks.length > 0 ? undefined : "plano-de-hoje"}>
      <div className="ih-hero-main">
        <Ring value={hero.ring.value} total={hero.ring.total} size={compact ? 80 : 116} stroke={compact ? 7 : 9}>
          <span className="ih-ring-n">
            {hero.ring.value}
            <small>/{hero.ring.total}</small>
          </span>
          {!compact && <span className="ih-ring-u">questões</span>}
        </Ring>
        <div className="ih-hero-txt">
          <span className="ih-kicker">{hero.kicker}</span>
          <h2>{hero.title}</h2>
          <span className="ih-hero-sub">{hero.sub}</span>
          {!compact && (
            <button type="button" className="ih-cta ih-press" onClick={hero.run} disabled={busy}>
              {hero.cta} <Icon name="arrow-right" size={18} />
            </button>
          )}
        </div>
      </div>
      {compact && (
        <div className="ih-hero-act">
          <button type="button" className="ih-cta ih-cta--full ih-press" onClick={hero.run} disabled={busy}>
            {hero.cta} <Icon name="arrow-right" size={18} />
          </button>
        </div>
      )}
      {goal}
    </section>
  );

  const accuracy = percent(home.correct, home.attempts);
  // Missões e ranking na faixa de números: só com a Stazia Arena ligada (mesmo interruptor das telas da Arena: boot.play.enabled)
  const missionsKpi = arenaOn && sum?.missions?.total > 0 ? sum.missions : null;
  const rankOn = arenaOn && sum && (sum.flags?.leaderboard !== false || sum.flags?.leagues !== false);
  const league = sum?.flags?.leagues !== false ? sum?.league : null;
  const weekly = sum?.flags?.leaderboard !== false ? sum?.weekly_rank : null;
  const rankKpi = !rankOn ? null : league ? { n: `${league.position}º`, l: `Liga ${league.name}` } : weekly ? { n: `${weekly.rank}º`, l: "no ranking semanal" } : { n: null, l: "Entre na liga" };
  const rankLabel = rankKpi ? (rankKpi.n ? `${rankKpi.l} · ${rankKpi.n}` : rankKpi.l) : "";
  const activeDays = home.week.days_active;
  const rowOf = (task) => {
    const doneRow = task.done;
    return (
      <button key={task.id} type="button" className={compact ? "ih-mrow" : "ih-row ih-press"} onClick={() => startTask(task)} disabled={busy || doneRow} aria-label={`${task.title}. ${doneRow ? "Concluída" : task.progress > 0 ? "Continuar" : "Começar"}`}>
        <span className={`ih-tile ${taskTile(task.kind)}`}><TaskIcon kind={task.kind} size={compact ? 26 : 30} /></span>
        <span className="ih-row-txt">
          <span className="ih-row-t" style={doneRow ? { textDecoration: "line-through", color: "var(--text-tertiary)" } : undefined}>{task.title}</span>
          {compact ? (
            <span className="ih-mmeter">
              <i><b style={{ width: `${percent(task.progress, task.target)}%` }} /></i>
              <span>{task.progress}/{task.target} · {task.minutes} min</span>
            </span>
          ) : (
            <span className="ih-row-s">{KIND_LABEL[task.kind]} · {task.minutes} min</span>
          )}
        </span>
        {doneRow ? (
          <span className="ih-pill ih-pill--done"><Icon name="check" size={14} />Concluída</span>
        ) : (
          <span className="ih-pill">{task.progress > 0 ? "Continuar" : "Começar"}</span>
        )}
      </button>
    );
  };

  // Faixa de números em blocos com ícone/gráfico (pacote HomeMobileCompact); a mesma no computador e no tablet (pedido do dono, 15/10/2026).
  // Missões, liga/ranking e Stazia Score só com a Stazia Arena ligada (mesma regra de antes).
  const kpiTiles = (
    <>
      <button type="button" className="ih-mk ih-mk--rev ih-press" onClick={() => go("erros")} aria-label={`${home.wrong_pending} para revisar`}>
        <span className="ih-mk-ic">
          {AppRealIcon({ name: "notebook-pen", size: 28 })}
          {home.wrong_pending > 0 && <span className="ih-mk-badge">{home.wrong_pending}</span>}
        </span>
        <small>Revisar</small>
      </button>
      {sum && (
        <button type="button" className="ih-mk ih-press" onClick={() => setExplain(true)} aria-label={`Stazia Score ${sum.score}. Ver como é calculado`}>
          <b>{sum.score}</b>
          <span className="ih-bar"><i style={{ width: `${Math.min(100, Math.round(sum.score / 10))}%` }} /></span>
          <small>Score</small>
        </button>
      )}
      <button type="button" className="ih-mk ih-press" onClick={() => go("desempenho")} aria-label={`${accuracy}% de acerto`}>
        <Ring value={accuracy} total={100} size={compact ? 28 : 34} stroke={compact ? 3.5 : 4} color="var(--success-solid)" track="var(--chart-track)">{null}</Ring>
        <small><b style={{ font: "600 12px var(--font-mono)", color: "var(--success-text)" }}>{accuracy}%</b> acerto</small>
      </button>
      <button type="button" className="ih-mk ih-press" onClick={() => go("desempenho")} aria-label={`${home.week.attempts} itens na semana, ${activeDays} ${activeDays === 1 ? "dia ativo" : "dias ativos"}`}>
        <b>{home.week.attempts}</b>
        <small>
          na semana
          <br />
          {activeDays} {activeDays === 1 ? "dia ativo" : "dias ativos"}
        </small>
      </button>
      {missionsKpi && (
        <button type="button" className="ih-mk ih-press" onClick={() => go("missoes")} aria-label={`${missionsKpi.done} de ${missionsKpi.total} missões de hoje`}>
          <span className="ih-mk-ic">{AppRealIcon({ name: "target", size: 26 })}</span>
          <b>{missionsKpi.done}/{missionsKpi.total}</b>
          <small>missões</small>
        </button>
      )}
      {rankKpi && (
        <button type="button" className="ih-mk ih-press" onClick={() => go("classificacao")} aria-label={`${rankLabel}. Abrir o Ranking`}>
          <span className="ih-mk-ic">{AppRealIcon({ name: "trophy", size: 26 })}</span>
          {rankKpi.n && <b>{rankKpi.n}</b>}
          <small>{rankKpi.n ? rankKpi.l : <strong style={{ color: "var(--action-primary)" }}>{rankKpi.l}</strong>}</small>
        </button>
      )}
    </>
  );

  const planEl = plan.tasks.length > 0 && (
    compact ? (
      <section aria-label="Plano de hoje" style={{ display: "flex", flexDirection: "column", gap: 10 }} data-tour="plano-de-hoje">
        <div className="ih-sec-h">
          <h2>Plano de hoje</h2>
          <span className="ih-count">{plan.done} de {plan.total}</span>
        </div>
        <div className="ih-list">{plan.tasks.map(rowOf)}</div>
      </section>
    ) : (
      <section className="ih-card" aria-label="Plano de hoje" data-tour="plano-de-hoje">
        <div className="ih-card-h">
          <h2>Plano de hoje</h2>
          <span className="ih-count">{plan.done} de {plan.total}</span>
        </div>
        {plan.tasks.map(rowOf)}
      </section>
    )
  );

  const top = (
    <>
      <ConviteOnboarding estado={onboarding} go={go} />
      <PrimeirosPassosFaixa estado={onboarding} go={go} />
      {home.trial && trialEnding(home.trial) && <TrialBanner trial={home.trial} attempts={home.attempts} go={go} />}
      {playOn && s.error && <PlayError retry={s.reload} />}
      {play.error && <Banner tone="danger">{play.error}</Banner>}
    </>
  );
  // a trilha faz parte da Stazia Arena (TrailScreen): com a Arena desligada o cartão não aparece
  const trailEl = arenaOn ? <TrailCard trail={trail} onStart={startNode} busy={play.busy} go={go} /> : null;
  const priorityEl = <PriorityCard topics={home.priority_topics} go={go} compact={compact} />;

  // ---- celular "simples" (pacote MobileMenu), escolhido em shell/cascaConfig.js
  if (compact && inicioCelular() === "simples") {
    return (
      <>
        <HomeSimples hero={hero} busy={busy || play.busy} sum={sum} arenaOn={arenaOn} trail={trail} startNode={startNode} top={top} setExplain={setExplain} />
        {explain && sum && <ScoreExplainer summary={sum} onClose={() => setExplain(false)} />}
      </>
    );
  }
  // ---- celular: faixa de 4 números, "Para você" em carrossel e tema prioritário
  if (compact) {
    const trailOn = arenaOn && !(trail.error || trail.data?.enabled === false);
    const cards = trailOn ? [trailEl] : [];
    if (ineditasState(ineditas) !== "oculto") cards.push(<IneditasHomeCard key="ined" ineditas={ineditas} trial={home.trial} go={go} compact />);
    const onScroll = (e) => {
      const el = e.currentTarget;
      const w = el.firstElementChild ? el.firstElementChild.getBoundingClientRect().width + 12 : 1;
      setSlide(Math.min(cards.length - 1, Math.round(el.scrollLeft / w)));
    };
    return (
      <div className="ih ih--m">
        {top}
        {heroEl}
        {planEl}
        <section className="ih-mkpis" aria-label="Seu desempenho">
          {kpiTiles}
        </section>
        {cards.length > 0 && (
        <section aria-label="Para você" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="ih-sec-h">
            <h2>Para você <span>{cards.length > 1 ? "· deslize" : ""}</span></h2>
            {cards.length > 1 && (
              <span className="ih-dots" role="img" aria-label={`Cartão ${slide + 1} de ${cards.length}`}>
                {cards.map((_, i) => <i key={i} className={i === slide ? "on" : ""} />)}
              </span>
            )}
          </div>
          <div className="ih-car" onScroll={onScroll} tabIndex={0} aria-label="Cartões para você, deslize para o lado">
            {cards.map((c, i) => <React.Fragment key={i}>{c}</React.Fragment>)}
          </div>
        </section>
        )}
        {priorityEl}
        {explain && sum && <ScoreExplainer summary={sum} onClose={() => setExplain(false)} />}
      </div>
    );
  }

  // ---- computador e tablet. Grade em inicio.css (G2.1/G2.5): empilhado até 1179 px; cartão azul | plano de 1180 a 1679 px;
  // cartão azul | plano | números (blocos 3×2) a partir de 1680 px, para o cartão azul não passar de ~700 px nas telas largas.
  return (
    <div className="ih">
      {top}
      <div className={`ih-top${planEl ? "" : " ih-top--sem-plano"}`}>
        {heroEl}
        {planEl}
        <section className="ih-mkpis ih-mkpis--wide" aria-label="Seu desempenho">
          {kpiTiles}
        </section>
      </div>
      <div className="ih-cards">
        {trailEl}
        {priorityEl}
        <IneditasHomeCard ineditas={ineditas} trial={home.trial} go={go} />
      </div>
      {explain && sum && <ScoreExplainer summary={sum} onClose={() => setExplain(false)} />}
    </div>
  );
}

export function HomeScreen({ go, mobile }) {
  const { backend, boot } = useSession();
  const onboarding = useOnboardingAtual();
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
  if (!data) {
    return error ? <Banner tone="danger">{error}</Banner> : <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;
  }

  const { plan } = data;
  // equipe (administrador ou editor) e revisor médico têm acesso completo: sem aviso de teste grátis
  const home = hasFullAccess(boot) ? { ...data.home, trial: null } : data.home;
  const startDiagnostic = () => {
    const niv = boot.nivelamento;
    if (niv?.aplicavel && (niv.situacao === "novo" || niv.situacao === "adiado" || niv.situacao === "bloco1")) {
      return go("nivelamento");
    }
    if (niv?.aplicavel && ["parcial", "bloco2", "concluido"].includes(niv.situacao)) {
      const nivTask = plan.tasks.find((t) => t.ref?.reason === "nivelamento" && !t.done);
      return nivTask ? startTask(nivTask) : go("hoje");
    }
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
        <HomeNew go={go} mobile={mobile} home={home} profile={boot.profile} startDiagnostic={startDiagnostic} busy={busy} extra={ineditasCard} boot={boot} onboarding={onboarding} />
      ) : (
        <>
          {boot.nivelamento?.convite && <NivelamentoConvite estado={boot.nivelamento} go={go} />}
          <HomeActive go={go} home={home} plan={plan} startTask={startTask} busy={busy} play={play} startNode={play.startNode} ineditas={data.ineditas} arenaOn={boot.play?.enabled !== false} onboarding={onboarding} />
        </>
      )}
    </>
  );
}
