// Fase "setup" (Setup.jsx do protótipo de 11/10): só a prontidão. Sem campo de link (os dois conversam fora do app, decisão D3
// do dono) e sem leitura prévia: o avaliador entra na "sala do avaliador" (resumo, impressos, cronômetro e PEP) antes de iniciar,
// e o cronômetro fica no rodapé dela. O candidato espera aqui e passa sozinho à estação quando o avaliador inicia.
import React from "react";
import { Avatar, Badge, Button, Card, Icon } from "../../../ds";
import { CardBlock, PairHeader, RoleBand, firstName, pageStyle, stationLine } from "./parts.jsx";

const overline = { font: "var(--type-overline)", letterSpacing: "var(--tracking-overline)", textTransform: "uppercase", color: "var(--text-tertiary)" };

function ReadyCard({ room, actions }) {
  const people = [
    [`${room.me.public_name} (você)`, room.me.public_name, room.me.ready],
    [room.partner.public_name, room.partner.public_name, room.partner.ready],
  ];
  return (
    <CardBlock title="1. Prontidão">
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {people.map(([shown, name, ready]) => (
          <div
            key={shown}
            style={{
              flex: "1 1 220px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              background: ready ? "var(--success-bg)" : "var(--surface-sunken)",
            }}
          >
            <Avatar name={name} size={32} />
            <span style={{ flex: 1, font: "600 var(--text-sm) var(--font-sans)", color: "var(--text-primary)" }}>{shown}</span>
            <Badge size="sm" tone={ready ? "success" : "neutral"} icon={ready ? "check" : "clock"}>{ready ? "Pronto" : "Aguardando"}</Badge>
          </div>
        ))}
        <Button variant="secondary" icon={room.me.ready ? "x" : "hand"} onClick={() => actions.setReady(!room.me.ready)}>
          {room.me.ready ? (room.partner.ready ? "Cancelar" : "Pronto · aguardando o colega") : "Estou pronto para iniciar"}
        </Button>
      </div>
    </CardBlock>
  );
}

/** Candidato: só "Estação N · Área · origem", sem o tema; o enunciado aparece quando o avaliador iniciar. */
function CandidateWaiting({ room }) {
  const station = room.station;
  if (!station) return null;
  return (
    <Card padding={20}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Icon name="stethoscope" size={22} style={{ color: "var(--text-brand)" }} />
        <div style={overline}>{stationLine(station)}</div>
      </div>
      <p style={{ margin: "10px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>O enunciado aparece quando o avaliador iniciar a estação.</p>
    </Card>
  );
}

export function SetupPhase({ room, actions, askLeave, openEvaluatorRoom }) {
  const isEval = room.me.role === "evaluator";
  const both = room.me.ready && room.partner.ready;
  const partner = room.partner.public_name;
  const leave = () => (askLeave ? askLeave("sair") : actions.leave());

  return (
    <main style={pageStyle}>
      <PairHeader
        room={room}
        title={`Sala com ${partner}`}
        subtitle="Confirmem a prontidão para iniciar a estação."
        right={!both && <Badge tone="warning">Aguardando prontidão</Badge>}
      />
      <RoleBand room={room} />
      <ReadyCard room={room} actions={actions} />
      {!isEval && <CandidateWaiting room={room} />}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          padding: "16px 20px",
          borderRadius: "var(--radius-lg)",
          background: both ? "var(--success-bg)" : "var(--surface-sunken)",
        }}
      >
        <div
          role="status"
          style={{ display: "flex", alignItems: "center", gap: 10, font: "600 var(--text-sm) var(--font-sans)", color: both ? "var(--success-text)" : "var(--text-secondary)" }}
        >
          <Icon name={both ? "link-2" : "loader"} size={18} />
          {!both
            ? "Aguardando os dois confirmarem prontidão"
            : isEval
              ? "Prontidão confirmada. Entre na sala do avaliador para controlar o cronômetro."
              : `Dupla conectada. Aguardando ${firstName(partner)} (avaliador) iniciar a estação…`}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Button variant="ghost" icon="log-out" onClick={leave}>
            Sair da sala
          </Button>
          {isEval ? (
            <Button size="lg" icon="arrow-right" disabled={!both} onClick={() => openEvaluatorRoom?.()}>
              Abrir sala do avaliador
            </Button>
          ) : (
            <Badge tone={both ? "success" : "neutral"} icon="lock">
              Só o avaliador inicia
            </Badge>
          )}
        </div>
      </div>
    </main>
  );
}
