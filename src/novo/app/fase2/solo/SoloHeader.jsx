// Cabeçalho do treino sozinho: sair, nome da estação, as etapas e o cronômetro. No atendimento o tempo é o do servidor
// (`useCountdown`): âmbar até 2 min, vermelho até 30 s, e em 00:00 aparece o selo "Tempo esgotado" (o treino segue).
import React from "react";
import { Badge, Button, Icon, Timer } from "../../../ds";
import { formatClock } from "../../dupla/clock.js";

/** Tempo usado até a entrega, em "mm:ss", ou null enquanto não dá para saber. */
export function usedClock(attempt) {
  const start = Date.parse(attempt?.attendance_started_at ?? "");
  const end = Date.parse(attempt?.submitted_at ?? attempt?.attendance_ended_at ?? "");
  return Number.isFinite(start) && Number.isFinite(end) ? formatClock(Math.max(0, end - start)) : null;
}

function Clock({ attempt, remaining }) {
  const status = attempt.status;
  if (status === "attending" && remaining != null) {
    return <Timer seconds={Math.floor(remaining / 1000)} state={remaining === 0 ? "expired" : "running"} size={22} />;
  }
  const text =
    status === "reading"
      ? formatClock(attempt.station?.duration_ms ?? 600000)
      : usedClock(attempt)
        ? `Usou ${usedClock(attempt)}`
        : "—";
  return (
    <span role="timer" aria-live="off" className="f2-player-timer">
      <Icon name="timer" size={16} />
      {text}
    </span>
  );
}

const STAGES = [
  ["Leitura", ["reading"]],
  ["Atendimento", ["attending"]],
  ["Correção", ["submitted", "evaluating", "scoring", "done"]],
];

export function SoloHeader({ attempt, remaining, expired, mobile, busy, onExit }) {
  const { status, station } = attempt;
  return (
    <header className="f2-player-header">
      <Button variant="ghost" size="sm" icon="x" onClick={onExit} disabled={busy}>
        Sair
      </Button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="f2-solo-title">{station?.name}</div>
        {!mobile && (
          <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
            {station?.area} {station?.setting ? `· ${station.setting}` : ""}
          </div>
        )}
      </div>

      <div className="f2-player-stage-pills" role="group" aria-label="Etapas da estação">
        {STAGES.map(([label, on]) => (
          <span
            key={label}
            className={`f2-player-stage-pill${on.includes(status) ? " f2-player-stage-pill--active" : ""}`}
            aria-current={on.includes(status) ? "step" : undefined}
          >
            {label}
          </span>
        ))}
      </div>

      <span aria-live="polite" style={{ display: "inline-flex" }}>
        {expired && (
          <Badge tone="danger" icon="timer">
            Tempo esgotado
          </Badge>
        )}
      </span>
      <Clock attempt={attempt} remaining={remaining} />
    </header>
  );
}
