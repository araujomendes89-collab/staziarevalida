// Planejamento com dados do banco (app_planning + app_today).
// Visual do pacote "Novas telas" (15/10/2026): cartão azul "Até a prova", calendário do mês (segunda a domingo), "Esta semana" em sete
// cartões (computador e tablet) ou em fitas de dia (celular). O selo "Adaptativo no PRO" saiu: o plano do dia já é montado pelo
// histórico para todos os alunos. Nenhum número é fixo: tudo vem de app_planning e app_today.
import React from "react";
import { Banner, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { Panel, RichIcon, useNarrow } from "../evolucao/ui.jsx";
import "./planejamento.css";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const LONG_DAY = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

/** Frase de ritmo: em quanto tempo as questões inéditas acabam, no ritmo real ou na meta. */
export function paceText({ unanswered, last_7_days: week, daily_target: target, days_to_exam: daysLeft }) {
  if (unanswered === 0) return "Você já resolveu todas as questões disponíveis. Agora o foco é revisar os erros.";
  const perWeek = week > 0 ? week : target * 7;
  const weeks = Math.max(1, Math.ceil(unanswered / perWeek));
  const span = weeks === 1 ? "1 semana" : `${weeks} semanas`;
  const basis = week > 0 ? `No ritmo dos últimos 7 dias (${week} ${week === 1 ? "questão" : "questões"})` : `Com a meta de ${target} questões por dia`;
  let text = `${basis}, as ${unanswered} questões inéditas acabam em cerca de ${span}.`;
  if (daysLeft != null) {
    if (weeks * 7 <= daysLeft) text += " Dá tempo antes da prova.";
    else text += ` Para fechar antes da prova, seriam cerca de ${Math.ceil(unanswered / Math.max(daysLeft, 1))} por dia.`;
  }
  return text;
}

function headline(plan) {
  if (plan.days_to_exam == null) return "Data da prova não definida";
  const days = plan.days_to_exam === 1 ? "1 dia" : `${plan.days_to_exam} dias`;
  const exam = plan.target_edition ? ` · ${plan.exam_type === "ENAMED" ? "ENAMED" : "Revalida"} ${plan.target_edition}` : "";
  return `${days}${exam}`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** O que escrever no cartão de um dia (estudo feito, meta ou "Sem estudo"). `kind`: today | done | empty | future. */
function dayInfo(d, plan, today) {
  const isToday = d.day === plan.today;
  const past = d.day < plan.today;
  const studied = d.questions > 0 || d.flashcards > 0;
  const kind = isToday ? "today" : past ? (studied ? "done" : "empty") : "future";
  const parts = [];
  if (past || isToday) {
    if (d.questions) parts.push(plural(d.questions, "questão", "questões"));
    if (d.flashcards) parts.push(plural(d.flashcards, "card", "cards"));
    if (!parts.length) parts.push(isToday ? "Ainda sem estudo" : "Sem estudo");
  } else {
    parts.push(`Meta: ${plan.daily_target} questões`);
  }
  const share = past || isToday ? Math.min(100, Math.round((d.questions / Math.max(plan.daily_target, 1)) * 100)) : 0;
  return { kind, isToday, text: parts.join(", "), width: d.questions > 0 ? Math.max(6, share) : 0, plano: isToday && today.total ? `Plano ${today.done}/${today.total}` : null, studied };
}

/** Calendário do mês, de segunda a domingo; os dias com estudo levam um ponto verde (só o mês atual tem marcação, o banco só manda esse). */
function MonthCalendar({ year, month, day, marked }) {
  const [view, setView] = React.useState([year, month]);
  const [y, m] = view;
  const first = (new Date(y, m, 1).getDay() + 6) % 7; // segunda = 0
  const count = new Date(y, m + 1, 0).getDate();
  const current = y === year && m === month;
  const move = (n) => {
    const date = new Date(y, m + n, 1);
    setView([date.getFullYear(), date.getMonth()]);
  };
  return (
    <Panel className="pl-cal" aria-label="Calendário">
      <div className="pl-cal__head">
        <h2 className="ev-h2" aria-live="polite">{MONTHS[m]} {y}</h2>
        <button type="button" className="pl-nav" aria-label="Mês anterior" onClick={() => move(-1)}>
          <Icon name="chevron-left" size={16} />
        </button>
        <button type="button" className="pl-nav" aria-label="Próximo mês" onClick={() => move(1)}>
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
      <div className="pl-cal__grid">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((l, i) => (
          <span key={i} className="pl-cal__dow" aria-hidden="true">{l}</span>
        ))}
        {Array.from({ length: first }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const n = i + 1;
          const isToday = current && n === day;
          const future = current && n > day;
          const has = current && marked.includes(n);
          return (
            <span key={n} className={`pl-day${isToday ? " is-today" : ""}${future ? " is-future" : ""}`} aria-label={`${n} de ${MONTHS[m]}${isToday ? ", hoje" : ""}${has ? ", com estudo" : ""}`}>
              <span className="ev-mono">{n}</span>
              {has && <span className="pl-dot" aria-hidden="true" />}
            </span>
          );
        })}
      </div>
      <div className="pl-cal__foot">
        {marked.length === 0 ? (
          "Os dias em que você estudar aparecem marcados."
        ) : (
          <>
            <span className="pl-dot pl-dot--lg" aria-hidden="true" />
            <span>
              <strong className="ev-mono">{marked.length}</strong> {marked.length === 1 ? "dia" : "dias"} de estudo neste mês.
            </span>
          </>
        )}
      </div>
    </Panel>
  );
}

function WeekCards({ plan, today }) {
  return (
    <ol className="pl-week">
      {plan.week.map((d, k) => {
        const info = dayInfo(d, plan, today);
        return (
          <li key={d.day} className={`pl-wd pl-wd--${info.kind}`} aria-current={info.isToday ? "date" : undefined}>
            <span className="pl-wd__top">
              <span className="pl-wd__dow">{WEEKDAYS[k]}</span>
              <span className="pl-wd__num ev-mono">{Number(d.day.slice(8))}</span>
            </span>
            <span className="pl-wd__txt">{info.text}</span>
            <span className="pl-bar" aria-hidden="true">
              <span style={{ width: `${info.width}%` }} />
            </span>
            {info.plano && <span className="pl-wd__plan">Hoje · {info.plano}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Celular: fita com os sete dias (toque para ver o dia) e o resumo do dia escolhido. */
function WeekStrip({ plan, today }) {
  const todayIndex = Math.max(0, plan.week.findIndex((d) => d.day === plan.today));
  const [sel, setSel] = React.useState(todayIndex);
  const d = plan.week[sel];
  const info = dayInfo(d, plan, today);
  const label = LONG_DAY.format(new Date(`${d.day}T00:00:00Z`)).replace(/^./, (c) => c.toUpperCase());
  return (
    <div className="pl-strip-card">
      <div className="pl-strip" role="group" aria-label="Dias da semana">
        {plan.week.map((x, k) => {
          const i = dayInfo(x, plan, today);
          const on = k === sel;
          return (
            <button key={x.day} type="button" className={`pl-pill pl-pill--${i.kind}${on ? " is-on" : ""}`} aria-pressed={on} aria-label={`${WEEKDAYS[k]} ${Number(x.day.slice(8))}${i.isToday ? ", hoje" : ""}`} onClick={() => setSel(k)}>
              <span className="pl-pill__dow">{WEEKDAYS[k]}</span>
              <span className="pl-pill__num ev-mono">{Number(x.day.slice(8))}</span>
              <span className={`pl-pill__dot${i.studied ? " has" : ""}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="pl-sel">
        <div className="pl-sel__head">
          <div>
            <div className="pl-sel__day">{info.isToday ? `Hoje, ${label.toLowerCase()}` : label}</div>
            <div className="pl-sel__txt">{info.text}</div>
          </div>
          {info.plano && <span className="pl-plan">{info.plano}</span>}
        </div>
        <span className="pl-bar" aria-hidden="true">
          <span style={{ width: `${info.width}%` }} />
        </span>
      </div>
    </div>
  );
}

export function PlanningScreen({ go }) {
  const { backend } = useSession();
  const narrow = useNarrow();
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    Promise.all([backend.rpc("app_planning"), backend.rpc("app_today")])
      .then(([plan, today]) => alive && setData({ plan, today }))
      .catch(() => alive && setError("Não foi possível carregar o planejamento. Recarregue a página."));
    return () => {
      alive = false;
    };
  }, [backend]);

  if (!data) return error ? <Banner tone="danger">{error}</Banner> : <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;

  const { plan, today } = data;
  const [year, month, day] = plan.today.split("-").map(Number);
  const hero = (
    <section className="pl-hero" aria-label="Até a prova">
      <span className="pl-hero__k">
        <RichIcon name="calendar" size={narrow ? 36 : 34} />
        <span>Até a prova</span>
      </span>
      <h2 className="pl-hero__h">{headline(plan)}</h2>
      <p className="pl-hero__p">{paceText(plan)}</p>
      <button type="button" className="pl-hero__btn" onClick={() => go("hoje", { ajustar: 1 })}>
        {plan.days_to_exam == null ? "Definir data da prova" : "Ajustar disponibilidade"}
        <Icon name="arrow-right" size={16} />
      </button>
    </section>
  );
  const calendar = <MonthCalendar year={year} month={month - 1} day={day} marked={plan.month_active_days} />;

  if (narrow) {
    return (
      <div className="ev ev-stack pl pl--narrow">
        {hero}
        <section aria-label="Esta semana" className="pl-sec">
          <div className="pl-sec__head">
            <h2 className="pl-sec__h">Esta semana</h2>
            <span className="pl-sec__meta">Meta: <strong className="ev-mono">{plan.daily_target}</strong>/dia</span>
          </div>
          <WeekStrip plan={plan} today={today} />
        </section>
        <section aria-label="Calendário do mês" className="pl-sec">
          <h2 className="pl-sec__h">Calendário</h2>
          {calendar}
        </section>
      </div>
    );
  }

  return (
    <div className="pl-wrap">
    <div className="ev pl pl--wide">
      {hero}
      {calendar}
      <Panel className="pl-weekcard" aria-label="Esta semana">
        <div className="pl-weekcard__head">
          <h2 className="ev-h2" style={{ fontSize: 18 }}>Esta semana</h2>
          <span className="pl-sec__meta">Meta: <strong><span className="ev-mono">{plan.daily_target}</span> questões por dia</strong></span>
        </div>
        <WeekCards plan={plan} today={today} />
      </Panel>
    </div>
    </div>
  );
}
