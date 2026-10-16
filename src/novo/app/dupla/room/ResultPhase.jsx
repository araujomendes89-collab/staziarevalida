// Fase "result" (Result.jsx:85-139 do protótipo, com ResultData do servidor): nota, critérios, detalhes e feedback.
// Nada é calculado aqui além da contagem por nível e dos pontos perdidos: a nota e a % vêm do servidor.
// Revisão da nota (Tarefa 18): o candidato pede uma vez, com motivo; o avaliador vê o pedido e "Rever a nota" (a sala volta à
// conferência); depois aparece "Nota revisada". "Treinar outra estação" abre a rodada seguinte com o mesmo par, de volta à
// escolha dos papéis e de uma estação DIFERENTE (decisão do dono de 16/10: não há inverter papéis na mesma estação, porque o
// novo candidato já viu o tema como avaliador; o banco recusa estação já treinada na sala). "Encerrar treino" pede
// confirmação. O nome da estação aparece aos dois só aqui, no resultado.
import React from "react";
import { Avatar, Badge, Banner, Button, Dialog, Tabs, Textarea } from "../../../ds";
import { formatDecimal, formatDuration } from "../../../ds/format.js";
import { areaVars } from "../labels.js";
import { StationChip, pageStyle } from "./parts.jsx";
import { feedbackKey, writeDraft } from "./useRoom.js";

const GRADES = {
  correct: { text: "Adequado", color: "var(--score-full)" },
  partial: { text: "Parcial", color: "var(--score-partial)" },
  incorrect: { text: "Inadequado", color: "var(--score-none)" },
  pending: { text: "Não avaliado", color: "var(--score-pending)" },
};
const ORDER = ["correct", "partial", "incorrect", "pending"];
const MINUS = "−";

const box = { background: "var(--surface-card)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)" };
const label = { font: "600 var(--text-xs) var(--font-sans)", color: "var(--text-secondary)" };
const h2 = { margin: 0, font: "700 var(--text-base) var(--font-sans)", color: "var(--text-primary)" };
const column = { flex: "1 1 240px", padding: "20px 24px", borderLeft: "1px solid var(--surface-card)" };

/** "11 de outubro de 2026", no fuso de São Paulo. */
function dateLong(iso) {
  const time = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(time)) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(time));
}

/** Comparação com a tentativa anterior do mesmo candidato na mesma estação (Result.jsx:100). */
function Comparison({ pct, previous }) {
  if (typeof previous !== "number") return null;
  if (pct === previous) return <> · igual à última tentativa</>;
  const up = pct > previous;
  return (
    <>
      {" · "}
      <span style={{ color: up ? "var(--success-text)" : "var(--danger-text)", fontWeight: 600 }}>
        {`${up ? "+" : MINUS}${Math.abs(pct - previous)} p.p. vs. última tentativa (${previous}%)`}
      </span>
    </>
  );
}

/** Pedido de revisão: motivo de 1 a 500 caracteres; o servidor confere de novo. */
function ReviewRequest({ actions, requested }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const ok = reason.trim().length > 0 && reason.trim().length <= 500;
  return (
    <>
      <Button variant="ghost" size="sm" icon="flag" disabled={requested} onClick={() => setOpen(true)}>
        Solicitar revisão da nota
      </Button>
      {open && (
        <Dialog
          title="Solicitar revisão da nota"
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Voltar
              </Button>
              <Button
                icon="send"
                disabled={!ok || busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await actions.requestReview(reason.trim());
                  setBusy(false);
                  if (res) setOpen(false);
                }}
              >
                Solicitar revisão da nota
              </Button>
            </>
          }
        >
          <Textarea label="Motivo" rows={4} maxLength={500} showCount value={reason} onChange={(e) => setReason(e.target.value)} />
        </Dialog>
      )}
    </>
  );
}

export function ResultPhase({ room, result, actions, askLeave }) {
  const [filter, setFilter] = React.useState("all");
  const [nexting, setNexting] = React.useState(false);
  if (!result) return null;
  const review = result.review || {};
  const requested = Boolean(review.requested_at);
  const revised = Boolean(review.revised_at);
  const candidateName = result.candidate?.public_name;
  const station = result.station || room.station;
  const vars = areaVars(station?.area_code);
  const isCandidate = result.viewer === "candidate";

  const rows = [...(result.items || [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((item) => {
      const kind = item.grade || "pending";
      const got = typeof item.points === "number" ? item.points : 0;
      return { item, kind, got, lost: Math.max(0, (item.max_points ?? 0) - got) };
    });
  const count = (kind) => rows.filter((row) => row.kind === kind).length;
  const lostRows = rows.filter((row) => row.lost > 0);
  const lostPoints = lostRows.reduce((sum, row) => sum + row.lost, 0);
  const shown = filter === "lost" ? lostRows : rows;
  const feedback = result.feedback || {};
  const evaluator = result.evaluator?.public_name;
  const rowGrid = { display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px 96px", gap: 12 };

  return (
    <main style={{ ...pageStyle, maxWidth: 1120, padding: "28px 28px 64px", gap: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", paddingBottom: 4 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {station && <StationChip station={station} />}
            <span style={label}>{`Resultado da rodada ${result.round}`}</span>
          </div>
          <h1 style={{ margin: "10px 0 0", font: "800 30px/1.15 var(--font-sans)", letterSpacing: "-.01em", color: "var(--text-primary)", textWrap: "pretty" }}>
            {station?.name}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="ghost" onClick={() => (askLeave ? askLeave("encerrar") : actions.leave())}>
            Encerrar treino
          </Button>
          <Button
            icon="clipboard-list"
            disabled={nexting}
            onClick={async () => {
              setNexting(true);
              await actions.nextStation();
              setNexting(false);
            }}
          >
            Treinar outra estação
          </Button>
        </div>
      </header>

      {!isCandidate && requested && !revised && (
        <Banner
          tone="warning"
          title={`${candidateName || "O candidato"} pediu revisão da nota`}
          action={
            <Button
              icon="rotate-ccw"
              onClick={() => {
                // a conferência reabre com o feedback que já foi enviado, para o avaliador ajustar
                writeDraft(feedbackKey(room.id, room.round), { pos: result.feedback?.pos ?? "", neg: result.feedback?.neg ?? "", gen: result.feedback?.gen ?? "" });
                actions.redoReview();
              }}
            >
              Rever a nota
            </Button>
          }
        >
          {review.reason}
        </Banner>
      )}
      {revised && (
        <div>
          <Badge tone="success" icon="check">
            Nota revisada
          </Badge>
        </div>
      )}

      <section aria-label="Resumo da nota" style={{ ...box, background: vars.soft, display: "flex", flexWrap: "wrap", overflow: "hidden" }}>
        <div style={{ ...column, borderLeft: 0 }}>
          <div style={label}>Nota final</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
            <span style={{ font: "800 52px/1 var(--font-sans)", color: vars.ink, letterSpacing: "-.03em" }}>{formatDecimal(result.score)}</span>
            <span style={{ font: "500 var(--text-base) var(--font-mono)", color: "var(--text-secondary)" }}>{`/ ${formatDecimal(result.max_score)}`}</span>
          </div>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", marginTop: 8 }}>
            {`${result.pct}% de aproveitamento`}
            <Comparison pct={result.pct} previous={result.previous_pct} />
          </div>
        </div>
        <div style={column}>
          <div style={label}>{`Critérios (${rows.length})`}</div>
          <div
            role="img"
            aria-label={ORDER.map((kind) => `${count(kind)} ${GRADES[kind].text}`).join(", ")}
            style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 2, margin: "12px 0", background: "var(--surface-sunken)" }}
          >
            {ORDER.map((kind) => count(kind) > 0 && <span key={kind} style={{ flex: count(kind), background: GRADES[kind].color }} />)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 6, columnGap: 16 }}>
            {ORDER.map((kind) => (
              <div key={kind} style={{ display: "flex", alignItems: "center", gap: 8, font: "var(--type-body-sm)", color: "var(--text-primary)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: GRADES[kind].color }} />
                <span style={{ flex: 1 }}>{GRADES[kind].text}</span>
                <span style={{ font: "600 var(--text-sm) var(--font-mono)", color: "var(--text-primary)" }}>{count(kind)}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...column, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={label}>Detalhes</div>
          {[
            ["Avaliador", evaluator ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Avatar name={evaluator} size={20} />
                {evaluator}
              </span>
            ) : "—"],
            ["Data", dateLong(result.finished_at)],
            ["Tempo da estação", formatDuration(result.used_ms)],
          ].map(([key, value]) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 12, font: "var(--type-body-sm)" }}>
              <span style={{ color: "var(--text-secondary)" }}>{key}</span>
              <span style={{ color: "var(--text-primary)", fontWeight: 600, textAlign: "right" }}>{value}</span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <section aria-labelledby="res-pep" style={{ ...box, flex: "2 1 480px", minWidth: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <h2 id="res-pep" style={h2}>
              Checklist PEP
            </h2>
            <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{`${formatDecimal(lostPoints)} pt perdidos`}</span>
          </div>
          <div style={{ padding: "0 20px" }}>
            <Tabs
              value={filter}
              onChange={setFilter}
              label="Critérios do PEP"
              tabs={[
                { value: "all", label: "Todos", count: rows.length },
                { value: "lost", label: "Com perda de pontos", count: lostRows.length },
              ]}
            />
          </div>
          <div role="table" aria-label="Critérios do PEP">
            <div
              role="row"
              style={{
                ...rowGrid,
                padding: "10px 20px",
                background: "var(--surface-subtle)",
                borderBottom: "1px solid var(--border-subtle)",
                font: "600 11px var(--font-sans)",
                letterSpacing: ".04em",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
              }}
            >
              <span role="columnheader">Critério</span>
              <span role="columnheader">Resultado</span>
              <span role="columnheader" style={{ textAlign: "right" }}>
                Pontos
              </span>
            </div>
            {shown.length === 0 && (
              <div style={{ padding: "28px 20px", textAlign: "center", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
                Nenhum critério com perda de pontos.
              </div>
            )}
            {shown.map(({ item, kind, got, lost }) => (
              <div key={item.id} role="row" style={{ ...rowGrid, alignItems: "baseline", padding: "12px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
                <span role="cell" style={{ font: "var(--type-body-sm)", lineHeight: 1.5, color: "var(--text-primary)", textWrap: "pretty" }}>
                  <span style={{ font: "500 var(--text-xs) var(--font-mono)", color: "var(--text-tertiary)", marginRight: 8 }}>{item.order}</span>
                  {item.content}
                </span>
                <span role="cell" style={{ display: "inline-flex", alignItems: "center", gap: 8, font: "var(--type-body-sm)", color: "var(--text-primary)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: GRADES[kind].color, flexShrink: 0 }} />
                  {GRADES[kind].text}
                </span>
                <span
                  role="cell"
                  style={{ textAlign: "right", font: "500 var(--text-sm) var(--font-mono)", color: lost > 0 ? "var(--text-primary)" : "var(--text-secondary)", whiteSpace: "nowrap" }}
                >
                  {`${formatDecimal(got)} / ${formatDecimal(item.max_points)}`}
                </span>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, padding: "12px 20px", font: "600 var(--text-sm) var(--font-sans)", color: "var(--text-primary)" }}>
              <span>Total</span>
              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{`${formatDecimal(result.score)} / ${formatDecimal(result.max_score)}`}</span>
            </div>
          </div>
        </section>

        <aside aria-labelledby="res-fb" style={{ ...box, flex: "1 1 280px", minWidth: 0, padding: "16px 20px", display: "flex", flexDirection: "column" }}>
          <h2 id="res-fb" style={{ ...h2, marginBottom: 4 }}>
            Feedback do avaliador
          </h2>
          {evaluator && (
            <div style={{ font: "var(--text-xs) var(--font-sans)", color: "var(--text-secondary)", marginBottom: 8 }}>{`Escrito por ${evaluator}`}</div>
          )}
          {[
            ["Pontos positivos", feedback.pos],
            ["Pontos para melhorar", feedback.neg],
            ["Orientações gerais", feedback.gen],
          ].map(([title, value]) => (
            <div key={title} style={{ padding: "12px 0", borderTop: "1px solid var(--border-subtle)" }}>
              <div style={{ font: "600 var(--text-sm) var(--font-sans)", color: "var(--text-primary)", marginBottom: 4 }}>{title}</div>
              <p style={{ margin: 0, font: "var(--type-body-sm)", lineHeight: 1.6, whiteSpace: "pre-wrap", color: value ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                {value || "Sem comentários."}
              </p>
            </div>
          ))}
          {isCandidate && (
            <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
              <ReviewRequest actions={actions} requested={requested} />
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
