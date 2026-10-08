// Relatório do Tutor em /analise ("Meu relatório"), com o mesmo portão da Nexus: aceite do §34, Tutor desligado e plano.
import React from "react";
import { Badge, Banner, Button, Card } from "../../ds";
import { useSession } from "../session.jsx";
import { ERROR_CLASS, LEVEL } from "./labels.js";
import { TutorGate } from "./nexus/TutorGate.jsx";

const R = { borderRadius: 24 };
const messageOf = (error) => error?.message || "Não foi possível concluir. Tente de novo.";

export function ReportScreen({ go }) {
  return <TutorGate go={go}>{() => <Report />}</TutorGate>;
}

/** O relatório do aluno (dados do banco: erros, domínio, evolução, revisões e o que o Tutor percebeu). */
export function Report({ onBack = null }) {
  const { backend } = useSession();
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    backend.rpc("app_tutor_report").then((r) => alive && setData(r), (e) => alive && setError(messageOf(e)));
    return () => {
      alive = false;
    };
  }, [backend]);
  if (error) return <Banner tone="danger">{error}</Banner>;
  if (!data) return <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;
  const pct = (x) => (x.attempts ? `${Math.round((100 * x.correct) / x.attempts)}% em ${x.attempts}` : "sem respostas");
  const classes = Object.entries(data.error_types ?? data.tutor.error_classes ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <Card style={R} padding={28}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, font: "600 18px var(--font-sans)" }}>Meu relatório</h3>
        {onBack && <Button size="sm" variant="ghost" icon="arrow-left" onClick={onBack}>Voltar</Button>}
      </div>
      {(data.insights ?? []).length > 0 && (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 14, background: "var(--ai-bg, var(--surface-subtle))", display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="sm-overline">O Tutor percebeu</div>
          {data.insights.map((x) => (
            <p key={x.text} style={{ margin: 0, font: "var(--type-body-sm)" }}>{x.text} <span style={{ color: "var(--text-tertiary)" }}>({x.evidence} casos)</span></p>
          ))}
        </div>
      )}
      {data.sessions && (
        <p style={{ margin: "12px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          {data.sessions.count} sessões · {data.sessions.minutes} min de estudo{data.sessions.voice_minutes ? ` (${data.sessions.voice_minutes} por voz)` : ""} · {data.sessions.questions_discussed} questões discutidas
        </p>
      )}
      {(data.recurrent_errors ?? []).length > 0 && (
        <>
          <div className="sm-overline" style={{ marginTop: 16 }}>Erros que se repetem</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {data.recurrent_errors.map((e) => (
              <Badge key={`${e.error_type}-${e.knowledge_gap}`} tone="danger">{ERROR_CLASS[e.error_type] ?? e.error_type}{e.knowledge_gap ? `: ${e.knowledge_gap}` : ""} · {e.times}×</Badge>
            ))}
          </div>
        </>
      )}
      <div className="sm-overline" style={{ marginTop: 16 }}>Domínio por grande área</div>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {data.mastery.areas.map((a) => {
          const [label, tone] = LEVEL[a.level] ?? [a.level, "neutral"];
          return (
            <div key={a.area} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "8px 12px", border: "1px solid var(--border-subtle)", borderRadius: 12 }}>
              <span>{a.area.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{a.attempts ? `${a.accuracy}% em ${a.attempts}` : "sem respostas"}</span>
                <Badge size="sm" tone={tone}>{label}</Badge>
              </span>
            </div>
          );
        })}
      </div>
      {data.highest_risk_area && <p style={{ margin: "10px 0 0", font: "var(--type-body-sm)" }}>Área com maior risco hoje: <b>{data.highest_risk_area.replace(/_/g, " ").toLowerCase()}</b>.</p>}
      {data.critical_topics.length > 0 && (
        <>
          <div className="sm-overline" style={{ marginTop: 16 }}>Temas críticos</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {data.critical_topics.map((t) => (
              <Badge key={`${t.area}-${t.subarea}`} tone={LEVEL[t.level]?.[1]}>{t.subarea} · {t.accuracy}%</Badge>
            ))}
          </div>
        </>
      )}
      <div className="sm-overline" style={{ marginTop: 16 }}>Evolução</div>
      <p style={{ margin: "6px 0 0", font: "var(--type-body-sm)" }}>Últimos 30 dias: {pct(data.evolution.last_30)}. Os 30 dias anteriores: {pct(data.evolution.previous_30)}.</p>
      <div className="sm-overline" style={{ marginTop: 16 }}>Revisões</div>
      <p style={{ margin: "6px 0 0", font: "var(--type-body-sm)" }}>{data.reviews.due} na hora de rever · {data.reviews.scheduled} agendadas (1, 3, 7, 14 e 30 dias).</p>
      <div className="sm-overline" style={{ marginTop: 16 }}>Com o Tutor</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        <Badge>{data.tutor.correct} acertos em {data.tutor.answers} respostas</Badge>
        {data.tutor.wrong_but_sure > 0 && <Badge tone="danger">{data.tutor.wrong_but_sure} erro(s) com certeza</Badge>}
        {data.tutor.lucky_guesses > 0 && <Badge tone="warning">{data.tutor.lucky_guesses} provável(is) chute(s)</Badge>}
        {data.tutor.with_heavy_hints > 0 && <Badge tone="warning">{data.tutor.with_heavy_hints} com muita ajuda</Badge>}
        <Badge>{data.tutor.avg_hints} ajuda(s) por questão, em média</Badge>
      </div>
      {classes.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {classes.map(([k, n]) => (
              <Badge key={k} tone="warning">{ERROR_CLASS[k] ?? k} · {n}</Badge>
            ))}
          </div>
          <p style={{ margin: "6px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Tipo de erro apontado pelo Tutor (IA) nos últimos 90 dias: serve de pista, não é diagnóstico revisado por médico.</p>
        </>
      )}
      <p style={{ margin: "16px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Não há previsão de aprovação aqui: não existe base para prometer isso.</p>
    </Card>
  );
}
