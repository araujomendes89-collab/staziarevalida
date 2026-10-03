// Planejamento com dados do banco (app_planning + app_today).
// Mesma marcação da Planning do protótipo (prototype/More.jsx). O selo "Adaptativo no PRO" saiu:
// o plano do dia já é montado pelo histórico para todos os alunos.
import React from "react";
import { Banner, Button, Card, MiniCalendar } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";

const R = { borderRadius: 24 };
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

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

export function PlanningScreen({ go }) {
  const { backend } = useSession();
  const mobile = useMobile();
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
  const colors = { done: "var(--surface-brand-soft)", today: "var(--info-bg)", future: "var(--surface-sunken)", empty: "transparent" };

  return (
    <>
      <Card variant="brand" style={R} padding={28}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 360px" }}>
            <span className="sm-overline">Até a prova</span>
            <div style={{ font: "700 30px/1.2 var(--font-sans)", marginTop: 6 }}>{headline(plan)}</div>
            <div style={{ color: "var(--text-secondary)", marginTop: 4, textWrap: "pretty" }}>{paceText(plan)}</div>
          </div>
          <Button variant="secondary" icon="sliders-horizontal" onClick={() => go("hoje", { ajustar: 1 })}>
            {plan.days_to_exam == null ? "Definir data da prova" : "Ajustar disponibilidade"}
          </Button>
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,2fr) minmax(280px,1fr)", gap: 20, alignItems: "start" }}>
        <Card style={R} padding={24}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
            <h3 style={{ margin: 0, font: "600 18px var(--font-sans)" }}>Esta semana</h3>
            <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Meta: {plan.daily_target} questões por dia</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(7,1fr)", gap: 8 }}>
            {plan.week.map((d, k) => {
              const isToday = d.day === plan.today;
              const past = d.day < plan.today;
              const studied = d.questions > 0 || d.flashcards > 0;
              const kind = isToday ? "today" : past ? (studied ? "done" : "empty") : "future";
              const lines = [];
              if (past || isToday) {
                if (d.questions) lines.push(`${d.questions} ${d.questions === 1 ? "questão" : "questões"}`);
                if (d.flashcards) lines.push(`${d.flashcards} ${d.flashcards === 1 ? "card" : "cards"}`);
                if (isToday && today.total) lines.push(`Plano ${today.done}/${today.total}`);
                if (!lines.length) lines.push(isToday ? "Ainda sem estudo" : "Sem estudo");
              } else {
                lines.push(`Meta: ${plan.daily_target} questões`);
              }
              return (
                <div key={d.day} style={{ display: "flex", flexDirection: mobile ? "row" : "column", gap: 8, alignItems: mobile ? "center" : "stretch" }}>
                  <span style={{ font: "600 12px var(--font-sans)", color: isToday ? "var(--text-brand)" : "var(--text-tertiary)", width: mobile ? 40 : "auto" }}>{WEEKDAYS[k]}</span>
                  <div
                    style={{ flex: 1, minHeight: mobile ? 48 : 120, padding: 10, borderRadius: 12, background: colors[kind], border: isToday ? "2px solid var(--selected-border)" : kind === "empty" ? "1px dashed var(--border-default)" : "1px solid transparent" }}
                  >
                    <div style={{ font: "600 13px var(--font-sans)" }}>{Number(d.day.slice(8))}</div>
                    {lines.map((line) => (
                      <div key={line} style={{ font: "500 12px var(--font-sans)", color: "var(--text-secondary)", marginTop: 2 }}>
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card style={R} padding={20}>
          <MiniCalendar year={year} month={month - 1} today={day} marked={plan.month_active_days} />
          <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 12 }}>
            {plan.month_active_days.length === 0
              ? "Os dias em que você estudar aparecem marcados."
              : `${plan.month_active_days.length} ${plan.month_active_days.length === 1 ? "dia" : "dias"} de estudo neste mês.`}
          </div>
        </Card>
      </div>
    </>
  );
}
