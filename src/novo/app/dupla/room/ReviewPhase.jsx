// Fase "review" (Result.jsx:15-61 do protótipo, sem "Voltar ao checklist"): conferência da avaliação, só do avaliador.
// O candidato vê "Aguardando avaliação" e "Sair da sala" (não finaliza: D8). As marcações vêm do servidor; mudar uma nota aqui
// vai ao servidor como na estação (300 ms). O feedback digitado fica em rascunho no aparelho (por sala e rodada) e só some
// depois de finalizar: recarregar a página ou o celular descartar a aba não perde o texto.
import React from "react";
import { Avatar, Button, Dialog, Icon, Textarea } from "../../../ds";
import { formatDecimal } from "../../../ds/format.js";
import { areaVars } from "../labels.js";
import { maxScoreOf } from "../content.js";
import { StationChip, firstName, pageStyle } from "./parts.jsx";
import { feedbackKey, readDraft, writeDraft } from "./useRoom.js";

// Cada nível: rótulo na lista, rótulo completo (leitor de tela) e a cor do tema de pontuação.
const LEVELS = [
  { grade: "correct", short: "Adequado", full: "Adequado", color: "var(--score-full)", on: "var(--pep-sheet)" },
  { grade: "partial", short: "Parcial", full: "Parcialmente adequado", color: "var(--score-partial)", on: "var(--navy-950)" },
  { grade: "incorrect", short: "Inadequado", full: "Inadequado", color: "var(--score-none)", on: "var(--pep-sheet)" },
];

// Fluxo simples (dono, 19/10): um comentário opcional só (vai em "gen"; "pos" e "neg" ficam vazios).
const FEEDBACK = [["gen", "Comentário (opcional)", "Para o candidato: o que foi bem e o que melhorar.", "message-square", "var(--info-solid)"]];

const card = { background: "var(--surface-card)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)" };

/** Pontos do nível marcado (`null` = sem nota: 0). */
function pointsOf(item, grade) {
  const value = grade ? item.grades?.[grade] : null;
  return typeof value === "number" ? value : 0;
}

function Waiting({ room, actions, askLeave }) {
  return (
    <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", width: "100%", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={room.me.public_name} size={40} />
          <Icon name="arrow-left-right" size={16} />
          <Avatar name={room.partner.public_name} size={40} />
        </div>
        <div aria-live="polite" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <Icon name="hourglass" size={28} style={{ color: "var(--text-brand)" }} />
          <h1 style={{ margin: 0, font: "700 var(--text-lg) var(--font-sans)", color: "var(--text-primary)" }}>Aguardando avaliação</h1>
        </div>
        <Button variant="ghost" icon="log-out" onClick={() => (askLeave ? askLeave("sair") : actions.leave())}>
          Sair da sala
        </Button>
      </div>
    </main>
  );
}

function Grader({ number, item, grade, onMark }) {
  const options = LEVELS.filter((level) => level.grade !== "partial" || typeof item.grades?.partial === "number");
  return (
    <div role="radiogroup" aria-label={`Nota do critério ${number}`} style={{ display: "flex", gap: 6 }}>
      {options.map((level) => {
        const on = grade === level.grade;
        const points = pointsOf(item, level.grade);
        return (
          <button
            key={level.grade}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${level.full}, ${formatDecimal(points)} ponto(s)`}
            title={level.full}
            onClick={() => onMark(item.id, on ? null : level.grade)}
            style={{
              minWidth: 64,
              height: 40,
              padding: "0 10px",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              border: on ? "1px solid transparent" : "1px solid var(--border-default)",
              background: on ? level.color : "var(--surface-card)",
              color: on ? level.on : "var(--text-primary)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
            }}
          >
            <span style={{ font: "700 11px var(--font-sans)" }}>{level.short}</span>
            <span style={{ font: "600 11px var(--font-mono)" }}>{formatDecimal(points)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Evaluation({ room, content, marks, actions }) {
  const station = room.station;
  const vars = areaVars(station?.area_code);
  const items = [...(content?.checklist_items || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const max = maxScoreOf(items);
  const [filter, setFilter] = React.useState("all");
  const [confirm, setConfirm] = React.useState(false);
  const draftKey = feedbackKey(room.id, room.round);
  const [fb, setFbState] = React.useState(() => ({ gen: String(readDraft(draftKey, {})?.gen ?? "") }));
  const setFb = (next) => {
    setFbState(next);
    writeDraft(draftKey, next);
  };

  const rows = items.map((item) => ({ item, grade: marks[item.id]?.grade ?? null }));
  const pending = rows.filter((row) => !row.grade);
  const done = rows.length - pending.length;
  const score = rows.reduce((sum, row) => sum + pointsOf(row.item, row.grade), 0);
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  const shown = filter === "pend" ? pending : rows;
  const fbCount = Object.values(fb).filter((value) => value.trim()).length;
  const partner = room.partner.public_name;
  const plural = pending.length > 1;

  const mark = (itemId, grade) => actions.mark(itemId, grade, marks[itemId]?.subitems ?? []);
  const sectionTitle = { margin: 0, font: "700 var(--text-md) var(--font-sans)", color: "var(--text-primary)" };

  return (
    <main style={{ ...pageStyle, maxWidth: 1160, padding: "24px 28px 64px" }}>
      <header style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {station && <StationChip station={station} />}
          <span style={{ font: "600 var(--text-xs) var(--font-sans)", color: "var(--text-secondary)" }}>Etapa final do avaliador</span>
        </div>
        <h1 style={{ margin: "10px 0 0", font: "800 30px/1.15 var(--font-sans)", letterSpacing: "-.02em", color: "var(--text-primary)" }}>Conferência da avaliação</h1>
        <p style={{ margin: "6px 0 0", font: "var(--type-body)", color: "var(--text-secondary)" }}>
          Confira o PEP, escreva um comentário se quiser e envie a nota para {firstName(partner)}.
        </p>
      </header>

      <section
        aria-label="Nota provisória"
        style={{ ...card, background: vars.soft, boxShadow: "none", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 28, padding: "20px 24px" }}
      >
        <div>
          <div style={{ font: "600 var(--text-xs) var(--font-sans)", color: vars.ink }}>Nota provisória</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
            <span style={{ font: "800 44px/1 var(--font-sans)", letterSpacing: "-.03em", color: vars.ink }}>{formatDecimal(score)}</span>
            <span style={{ font: "600 var(--text-md) var(--font-sans)", color: vars.ink }}>{`/ ${formatDecimal(max)} · ${pct}%`}</span>
          </div>
        </div>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, font: "600 var(--text-sm) var(--font-sans)", color: vars.ink, marginBottom: 8 }}>
            <span>{`${done} de ${rows.length} critérios avaliados`}</span>
            {pending.length > 0 ? (
              <span>{`${pending.length} pendente${plural ? "s" : ""}`}</span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="check" size={14} />
                Tudo avaliado
              </span>
            )}
          </div>
          <div style={{ height: 10, borderRadius: "var(--radius-pill)", background: "var(--surface-card)", overflow: "hidden" }}>
            <div style={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%`, height: "100%", background: vars.solid, borderRadius: "var(--radius-pill)" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {[
            ["Critérios", `${done}/${rows.length}`, "list-checks"],
            ["Feedback", `${fbCount}/3`, "message-square"],
          ].map(([label, value, icon]) => (
            <div key={label} style={{ background: "var(--surface-card)", borderRadius: 14, padding: "10px 14px", minWidth: 96 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, font: "600 11px var(--font-sans)", color: "var(--text-secondary)" }}>
                <Icon name={icon} size={12} />
                {label}
              </div>
              <div style={{ font: "800 20px var(--font-sans)", color: "var(--text-primary)", marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        <section style={{ ...card, flex: "3 1 520px", minWidth: 0, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              padding: "16px 20px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <h2 style={sectionTitle}>Checklist PEP</h2>
            <div role="radiogroup" aria-label="Filtro" style={{ display: "inline-flex", padding: 3, gap: 2, borderRadius: "var(--radius-md)", background: "var(--surface-sunken)" }}>
              {[
                ["all", "Todos", rows.length],
                ["pend", "Pendentes", pending.length],
              ].map(([id, label, n]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={filter === id}
                  onClick={() => setFilter(id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 32,
                    padding: "0 12px",
                    border: 0,
                    borderRadius: 9,
                    cursor: "pointer",
                    background: filter === id ? "var(--surface-card)" : "transparent",
                    boxShadow: filter === id ? "var(--shadow-xs)" : "none",
                    font: "600 var(--text-sm) var(--font-sans)",
                    color: filter === id ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {label}
                  <span
                    style={{
                      font: "700 11px var(--font-mono)",
                      padding: "1px 6px",
                      borderRadius: "var(--radius-pill)",
                      background: id === "pend" && n ? "var(--warning-bg)" : "var(--surface-sunken)",
                      color: id === "pend" && n ? "var(--warning-text)" : "var(--text-secondary)",
                    }}
                  >
                    {n}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 && (
            <div style={{ padding: "36px 20px", textAlign: "center", color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>
              <span
                style={{
                  display: "inline-flex",
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "var(--success-bg)",
                  color: "var(--success-text)",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 8,
                }}
              >
                <Icon name="check" size={22} />
              </span>
              <div style={{ font: "700 var(--text-base) var(--font-sans)", color: "var(--text-primary)" }}>Nenhum critério pendente</div>
            </div>
          )}
          {shown.map(({ item, grade }) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                gap: 14,
                alignItems: "center",
                flexWrap: "wrap",
                padding: "12px 20px",
                borderBottom: "1px solid var(--border-subtle)",
                background: grade ? "var(--surface-card)" : "var(--warning-bg)",
              }}
            >
              <div style={{ flex: "1 1 260px", minWidth: 0, font: "var(--type-body-sm)", lineHeight: 1.45, color: "var(--text-primary)" }}>
                <span style={{ font: "600 var(--text-xs) var(--font-mono)", color: "var(--text-tertiary)", marginRight: 8 }}>{item.order}</span>
                {item.content}
                {!grade && <span style={{ marginLeft: 8, font: "700 11px var(--font-sans)", color: "var(--warning-text)" }}>Pendente</span>}
              </div>
              <Grader number={item.order} item={item} grade={grade} onMark={mark} />
            </div>
          ))}
        </section>

        <aside style={{ ...card, flex: "2 1 340px", minWidth: 0, padding: 20, display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar name={partner} size={36} />
            <div>
              <h2 style={sectionTitle}>Comentário ao candidato</h2>
              <div style={{ font: "var(--text-xs) var(--font-sans)", color: "var(--text-secondary)" }}>Aparece junto com a nota no resultado</div>
            </div>
          </div>
          {FEEDBACK.map(([key, label, hint, , color]) => (
            <div key={key} style={{ display: "flex", gap: 10 }}>
              <span style={{ width: 4, borderRadius: 4, background: color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Textarea label={label} hint={hint} rows={3} value={fb[key]} onChange={(e) => setFb({ ...fb, [key]: e.target.value })} />
              </div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {pending.length > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", font: "var(--type-body-sm)", lineHeight: 1.45, color: "var(--warning-text)" }}>
                <Icon name="triangle-alert" size={15} style={{ marginTop: 2 }} />
                {`${pending.length} critério${plural ? "s" : ""} sem nota. Ser${plural ? "ão" : "á"} registrado${plural ? "s" : ""} como não avaliado${plural ? "s" : ""}.`}
              </div>
            )}
            <Button size="lg" fullWidth icon="send" onClick={() => setConfirm(true)}>
              Enviar nota
            </Button>
          </div>
        </aside>
      </div>

      {confirm && (
        <Dialog
          title="Enviar nota?"
          description={`${pending.length ? `${pending.length} critério(s) pendente(s) serão registrados como não avaliados. ` : ""}Depois de finalizada, a nota só muda por solicitação de revisão.`}
          onClose={() => setConfirm(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Voltar
              </Button>
              <Button
                onClick={() => {
                  setConfirm(false);
                  actions.finalize({ gen: fb.gen });
                }}
              >
                Enviar nota
              </Button>
            </>
          }
        />
      )}
    </main>
  );
}

export function ReviewPhase({ room, content, marks, actions, askLeave }) {
  if (room.me.role !== "evaluator") return <Waiting room={room} actions={actions} askLeave={askLeave} />;
  return <Evaluation room={room} content={content} marks={marks} actions={actions} />;
}
