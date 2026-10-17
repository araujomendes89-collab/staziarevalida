// Fase "roles" (Setup.jsx:13-27 do protótipo): definir quem é o candidato e quem é o ator/avaliador, e a estação.
import React from "react";
import { Button, Icon } from "../../../ds";
import { CardBlock, PairHeader, ROLE_COLORS, firstName, pageStyle, roleLabel, stationLine, strong } from "./parts.jsx";
import { StationPicker } from "./StationPicker.jsx";

const ROLE_CARDS = [
  { id: "candidate", icon: "stethoscope", tone: "candidate", title: "Candidato", desc: "Conduz o atendimento como médico. Vê apenas o enunciado e os impressos liberados." },
  { id: "evaluator", icon: "drama", tone: "actor", title: "Ator/Avaliador", desc: "Interpreta o paciente, libera impressos e preenche o checklist PEP." },
];

function RoleCard({ card, on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        flex: "1 1 260px",
        textAlign: "left",
        padding: 18,
        borderRadius: "var(--radius-lg)",
        cursor: "pointer",
        border: "1.5px solid " + (on ? ROLE_COLORS[card.tone].base : "var(--border-default)"),
        background: on ? ROLE_COLORS[card.tone].soft : "var(--surface-card)",
        font: "inherit",
        color: "inherit",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          width: 36,
          height: 36,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          background: ROLE_COLORS[card.tone].base,
          color: "var(--surface-card)",
        }}
      >
        <Icon name={card.icon} size={18} />
      </span>
      <div style={{ font: "600 var(--text-base) var(--font-sans)", color: "var(--text-primary)", margin: "12px 0 4px" }}>{card.title}</div>
      <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{card.desc}</div>
    </button>
  );
}

export function RolesPhase({ room, actions }) {
  const [picking, setPicking] = React.useState(false);
  const station = room.station;
  const partnerName = room.partner.public_name;
  const ready = Boolean(station && room.me.role);
  // Só o avaliador escolhe ou troca a estação (o candidato não pode saber o tema antes do resultado).
  const isEval = room.me.role === "evaluator";
  const evaluatorName = room.partner.role === "evaluator" ? partnerName : null;
  const seenNote =
    room.me.role === "candidate" && room.me.seen_station
      ? "Você já viu esta estação, então já conhece o tema. Se quiserem, o avaliador pode trocar a estação."
      : isEval && room.partner.role === "candidate" && room.partner.seen_station
        ? `${firstName(partnerName)} já viu esta estação. Se quiserem, troque a estação.`
        : null;
  // Com a estação já escolhida, virar avaliador mostra o tema (e quem voltar a candidato recebe o aviso acima).
  const revealHint = Boolean(station) && !isEval && !room.me.seen_station;

  return (
    <main style={pageStyle}>
      <PairHeader
        room={room}
        title={`Dupla com ${partnerName}`}
        subtitle={
          room.round > 1
            ? `Rodada ${room.round}: ${station ? stationLine(station) + ". " : ""}definam de novo os papéis; a estação precisa ser diferente das que vocês já treinaram nesta sala.`
            : `${station ? stationLine(station) + ". " : ""}Antes de conectar, definam quem será o candidato e quem será o ator/avaliador.`
        }
      />
      {room.match_note && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderRadius: "var(--radius-lg)",
            background: "var(--surface-brand-soft)",
            color: "var(--selected-text)",
            font: "600 var(--text-sm)/1.45 var(--font-sans)",
          }}
        >
          <Icon name="handshake" size={18} />
          {room.match_note}
        </div>
      )}
      {room.invite_pending && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          <Icon name="loader" size={16} />
          Aguardando {partnerName} entrar na sala
        </div>
      )}
      {seenNote && (
        // Decisão do dono (16/10): os dois escolhem os papéis. Quem já viu esta estação (escolheu, no Banco de estações ou na
        // sala, ou passou por avaliador com ela) e está como candidato recebe o aviso; o avaliador também fica sabendo, para
        // combinarem trocar de estação. O tema continua só para o avaliador.
        <div
          role="note"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderRadius: "var(--radius-lg)",
            background: "var(--warning-bg)",
            color: "var(--warning-text)",
            font: "600 var(--text-sm)/1.45 var(--font-sans)",
          }}
        >
          <Icon name="triangle-alert" size={18} />
          {seenNote}
        </div>
      )}
      <CardBlock
        title="Papéis desta rodada"
        action={
          <Button size="sm" variant="ghost" icon="shuffle" onClick={() => actions.drawRoles()}>
            Sortear
          </Button>
        }
      >
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {ROLE_CARDS.map((card) => (
            <RoleCard key={card.id} card={card} on={room.me.role === card.id} onClick={() => actions.chooseRole(card.id)} />
          ))}
        </div>
        {room.partner.role && (
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", marginTop: 12 }}>
            {partnerName} será <b style={strong}>{roleLabel(room.partner.role)}</b>.
          </div>
        )}
        {revealHint && (
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", marginTop: 8 }}>
            A estação já foi escolhida: quem passar a avaliador verá o tema.
          </div>
        )}
      </CardBlock>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {isEval ? (
          <Button variant="secondary" icon="clipboard-list" onClick={() => setPicking(true)}>
            {station ? "Trocar estação" : "Escolher estação"}
          </Button>
        ) : (
          <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            <Icon name={station ? "clipboard-list" : "info"} size={16} />
            {station
              ? stationLine(station)
              : evaluatorName
                ? `Aguardando ${firstName(evaluatorName)} escolher a estação.`
                : "Definam os papéis antes de escolher a estação."}
          </div>
        )}
        {room.me.confirmed ? (
          <Button size="lg" variant="secondary" icon="loader" disabled>
            Aguardando {partnerName} confirmar os papéis
          </Button>
        ) : (
          <Button size="lg" icon="plug-zap" disabled={!ready} onClick={() => actions.confirmRoles()}>
            Confirmar papéis e conectar
          </Button>
        )}
      </div>
      {picking && isEval && (
        <StationPicker
          roomId={room.id}
          title={station ? "Trocar estação" : "Escolher estação"}
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setPicking(false);
            actions.setStation(id);
          }}
        />
      )}
    </main>
  );
}
