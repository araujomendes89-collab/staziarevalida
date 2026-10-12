// Fase "connecting" (Loading.jsx do protótipo): anel de progresso e as 5 etapas da sala.
// Nesta tarefa as etapas aparecem "a fazer"; a Tarefa 16 liga os eventos de cada uma.
import React from "react";
import { Avatar, Button, Icon } from "../../../ds";
import { firstName, stationTitle } from "./parts.jsx";

const RING = 2 * Math.PI * 34;

export function ConnectingPhase({ room, actions }) {
  const partner = room.partner.public_name;
  const steps = [
    ["Carregando a estação", room.station ? stationTitle(room.station) : ""],
    ["Validando acesso", "Plano e permissões do módulo"],
    ["Separando conteúdo por papel", "Roteiro e checklist só para o avaliador"],
    ["Criando sala privada", "Sala exclusiva da dupla"],
    ["Sincronizando com " + partner, "Cronômetro e estado da rodada"],
  ];
  const done = 0; // etapas concluídas (Tarefa 16)
  const pct = Math.round((Math.min(done, steps.length) / steps.length) * 100);
  const finished = done >= steps.length;

  return (
    <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", width: "100%", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ position: "relative", width: 76, height: 76 }}>
          <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
            <circle cx="38" cy="38" r="34" fill="none" stroke="var(--border-default)" strokeWidth="5" />
            <circle
              cx="38"
              cy="38"
              r="34"
              fill="none"
              stroke="var(--action-primary)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - pct / 100)}
              style={{ transition: "stroke-dashoffset .5s var(--ease-out)" }}
            />
          </svg>
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", font: "700 var(--text-base) var(--font-mono)", color: "var(--text-brand)" }}>
            {pct}%
          </span>
        </div>
        <div style={{ textAlign: "center" }} aria-live="polite">
          <h1 style={{ margin: 0, font: "700 var(--text-lg) var(--font-sans)", color: "var(--text-primary)" }}>{finished ? "Sala pronta" : "Preparando a sala…"}</h1>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", marginTop: 4 }}>
            {finished ? "Entrando…" : `${steps[done][0]} (${done + 1}/${steps.length})`}
          </div>
        </div>
        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: "8px 0",
            width: "100%",
            background: "var(--surface-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          {steps.map(([title, sub], k) => {
            const state = k < done ? "done" : "todo"; // "run" entra com a Tarefa 16
            return (
              <li key={title} data-state={state} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", opacity: state === "todo" ? 0.55 : 1 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    flexShrink: 0,
                    borderRadius: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: state === "done" ? "var(--success-solid)" : "transparent",
                    border: state === "done" ? 0 : "2px solid var(--border-strong)",
                    color: "var(--surface-card)",
                  }}
                >
                  {state === "done" && <Icon name="check" size={13} />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: "500 var(--text-sm) var(--font-sans)", color: "var(--text-primary)" }}>{title}</div>
                  {state !== "todo" && sub && <div style={{ font: "var(--text-xs) var(--font-sans)", color: "var(--text-secondary)", marginTop: 1 }}>{sub}</div>}
                </div>
              </li>
            );
          })}
        </ol>
        <div style={{ display: "flex", alignItems: "center", gap: 10, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          <Avatar name={room.me.public_name} size={28} />
          <Icon name="arrow-left-right" size={14} />
          <Avatar name={partner} size={28} />
          Você e {firstName(partner)}
        </div>
        <Button variant="ghost" icon="log-out" onClick={() => actions.leave()}>
          Sair da sala
        </Button>
      </div>
    </main>
  );
}
