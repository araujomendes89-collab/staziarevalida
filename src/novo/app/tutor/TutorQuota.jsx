// Uso do Tutor do aluno (números do servidor): teste grátis ou plano, interações de texto, voz ao vivo e questões do dia.
import React from "react";

const minutes = (s) => Math.max(0, Math.floor((s ?? 0) / 60));

export function TutorQuota({ status, realtime, compact = false }) {
  const e = status.entitlement;
  if (!e) return <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{status.used_today} de {status.daily_limit} interações hoje</span>;
  const trial = e.mode === "trial";
  const head = trial
    ? e.trial.state === "active" ? `Teste grátis · Dia ${e.trial.day} de ${e.trial.days}` : `Teste grátis de ${e.trial.days} dias: começa no primeiro uso`
    : e.staff ? "Acesso da equipe" : e.is_paid ? "Plano ativo" : "Acesso liberado";
  const text = `Texto ${e.text.used}/${e.text.limit} interações hoje`;
  const voice = realtime && e.voice?.enabled
    ? `Voz ${minutes(e.voice.remaining_today_s)} min disponíveis hoje${e.voice.remaining_total_s != null ? ` · ${minutes(e.voice.remaining_total_s)} min restantes no teste` : ""}`
    : null;
  const qs = e.questions?.limit != null ? `Questões ${e.questions.used}/${e.questions.limit} hoje` : null;
  if (compact) return <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{head} · {text}</span>;
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "var(--surface-subtle)", font: "var(--type-caption)", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 3 }} aria-label="Uso do Tutor">
      <b style={{ color: "var(--text-primary)" }}>{head}</b>
      <span>{text}</span>
      {voice && <span>{voice}</span>}
      {qs && <span>{qs}</span>}
      {e.text.remaining > 0 && e.text.remaining <= 3 && <span style={{ color: "var(--text-warning, var(--text-secondary))" }}>Restam {e.text.remaining} interações de texto hoje.</span>}
      {status.reviews_due > 0 && <span>{status.reviews_due} revisão(ões) na hora</span>}
    </div>
  );
}
