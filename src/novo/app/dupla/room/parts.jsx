// Peças que as fases da sala dividem (cabeçalho da dupla, faixa dos papéis, bloco com título, selo da área, imagem do impresso).
// Só cores do app (var(--…)); nada de dado de exemplo.
import React from "react";
import { Avatar, Badge, Card, Icon, PrintImage } from "../../../ds";
import { areaVars, ROOM_ROLE_LABEL, sourceLabel } from "../labels.js";

export const pageStyle = {
  maxWidth: 960,
  margin: "0 auto",
  width: "100%",
  padding: "32px 28px 64px",
  display: "flex",
  flexDirection: "column",
  gap: 20,
  boxSizing: "border-box",
};

export const strong = { color: "var(--text-primary)" };

/** Cores de cada papel (tokens de dupla.css), por extenso para a conferência dos tokens. */
export const ROLE_COLORS = {
  candidate: { base: "var(--role-candidate)", soft: "var(--role-candidate-soft)", ink: "var(--role-candidate-ink)" },
  actor: { base: "var(--role-actor)", soft: "var(--role-actor-soft)", ink: "var(--role-actor-ink)" },
};

/** Primeiro nome ("Bruno Lima" → "Bruno"). */
export function firstName(name) {
  return typeof name === "string" ? name.trim().split(/\s+/)[0] || "" : "";
}

export function roleLabel(role) {
  return ROOM_ROLE_LABEL[role] || "";
}

/** Dupla: dois avatares e um título com subtítulo; `right` fica à direita. */
export function PairHeader({ room, title, subtitle, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <Avatar name={room.me.public_name} />
      <Avatar name={room.partner.public_name} />
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <h1 style={{ margin: 0, font: "var(--type-h2)", color: "var(--text-primary)" }}>{title}</h1>
        <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{subtitle}</div>
      </div>
      {right}
    </div>
  );
}

/** Bloco com título (o Card do app não tem `title`). */
export function CardBlock({ title, action, children, padding = 20 }) {
  return (
    <Card padding={padding}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ margin: 0, font: "600 var(--text-base)/1.3 var(--font-sans)", color: "var(--text-primary)" }}>{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** Faixa "Você é … · {parceiro} é …" com o selo "Papéis definidos". */
export function RoleBand({ room }) {
  const actor = room.me.role === "evaluator";
  const tone = actor ? "actor" : "candidate";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "12px 16px",
        borderRadius: 16,
        background: ROLE_COLORS[tone].soft,
      }}
    >
      <Icon name={actor ? "drama" : "stethoscope"} size={18} style={{ color: ROLE_COLORS[tone].base }} />
      <span style={{ flex: 1, font: "var(--type-body-sm)", color: "var(--text-primary)" }}>
        Você é <b style={strong}>{roleLabel(room.me.role)}</b> · {room.partner.public_name} é <b style={strong}>{roleLabel(room.partner.role)}</b>
      </span>
      <Badge size="sm" tone="success" icon="check">
        Papéis definidos
      </Badge>
    </div>
  );
}

/** Selo da área: "Estação {n} · {área}" (texto sobre a cor `solid` da área, que passa de 4,5:1). */
export function StationChip({ station }) {
  const vars = areaVars(station.area_code);
  const label = station.number != null ? `Estação ${station.number} · ${station.area}` : station.area;
  return (
    <span
      style={{
        font: "800 var(--text-xs) var(--font-sans)",
        color: "var(--surface-card)",
        background: vars.solid,
        padding: "5px 10px",
        borderRadius: "var(--radius-pill)",
      }}
    >
      {label}
    </span>
  );
}

/**
 * Título da estação. Com o nome (avaliador, resultado e o catálogo): "Estação {n} · {nome}" (sem número: só o nome).
 * Sem o nome (o candidato nunca recebe o tema antes do resultado): "Estação {n} · {área}" (Etapa P, migração 012900).
 */
export function stationTitle(station) {
  if (!station) return "";
  if (station.name) return station.number != null ? `Estação ${station.number} · ${station.name}` : station.name;
  const label = station.label || (station.number != null ? `Estação ${station.number}` : "Estação");
  return station.area ? `${label} · ${station.area}` : label;
}

/**
 * Título da estação com a origem: "Estação 3 · Clínica Médica · Revalida 2020 · INEP". A origem aparece sempre, também para o
 * candidato (decisão do dono de 16/10); estação autoral (sem instituição) fica só com o título.
 */
export function stationLine(station) {
  const title = stationTitle(station);
  const origin = sourceLabel(station);
  return origin ? `${title} · ${origin}` : title;
}

/** Imagem do impresso: o endereço assinado vem de `actions.printUrl` (Tarefa 17); sem endereço, nada é mostrado. */
export function PressingImage({ pressing, actions }) {
  const [src, setSrc] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    if (!pressing.has_image) return undefined;
    Promise.resolve(actions.printUrl(pressing.id)).then(
      (url) => alive && setSrc(url || null),
      () => alive && setSrc(null)
    );
    return () => {
      alive = false;
    };
  }, [pressing.id, pressing.has_image, actions]);
  if (!src) return null;
  return <PrintImage src={src} alt={`${pressing.name}: ${pressing.content}`} />;
}

/** Texto do impresso, com as quebras de linha como foram gravadas. */
export function PressingBody({ pressing, actions }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ whiteSpace: "pre-wrap" }}>{pressing.content}</div>
      <PressingImage pressing={pressing} actions={actions} />
    </div>
  );
}

/** Roteiro do ator em lista de rótulo e valor; sem roteiro, o texto do protótipo (`fallback`). */
export function ActorScript({ script, fallback }) {
  if (!script.length) return <div style={{ color: "var(--text-secondary)" }}>{fallback}</div>;
  return (
    <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(96px, 120px) 1fr", rowGap: 10, columnGap: 12 }}>
      {script.map(([label, value], i) => (
        <React.Fragment key={label + i}>
          {label && <dt style={{ font: "600 var(--text-xs)/1.6 var(--font-sans)", color: "var(--text-secondary)" }}>{label}</dt>}
          <dd style={{ margin: 0, color: "var(--text-primary)", whiteSpace: "pre-wrap", gridColumn: label ? undefined : "1 / -1" }}>{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/** Cenário em parágrafos, como a Montagem os separa. */
export function Scene({ blocks, style }) {
  return (
    <>
      {blocks.map((block, i) => (
        <p key={i} style={{ margin: i === 0 ? 0 : "8px 0 0", whiteSpace: "pre-wrap", ...style }}>
          {block}
        </p>
      ))}
    </>
  );
}
