// Etapa 5: resultado do treino sozinho. Nota, selos, tempo usado e o quadro por item. Na avaliação por IA cada item mostra o
// "Trecho seu" e o "Por quê" e as etiquetas que o servidor devolveu; a IA pode errar e a nota vale só contra o PEP da estação.
// Nada aqui diz empresa, modelo, prompt ou custo. Sem "Solicitar revisão da nota" e sem "Inverter papéis" (não há outra pessoa).
import React from "react";
import { Accordion, Badge, Banner, Button, Card } from "../../../ds";
import { formatDecimal, formatDuration } from "../../../ds/format.js";
import { getArea } from "../labels.js";
import { ReportIaDialog } from "./ReportIaDialog.jsx";

export const IA_NOTICE = "Avaliação feita por inteligência artificial. Ela pode errar. A nota vale só contra o PEP desta estação.";

/** Nível do item: texto e cor (tokens de pontuação do app). Nota nula = sem avaliação. */
const LEVELS = {
  correct: { text: "Adequado", color: "var(--score-full)", tone: "success" },
  partial: { text: "Parcial", color: "var(--score-partial)", tone: "warning" },
  incorrect: { text: "Inadequado", color: "var(--score-none)", tone: "danger" },
  pending: { text: "Sem avaliação", color: "var(--score-pending)", tone: "neutral" },
};
const ORDER = ["correct", "partial", "incorrect", "pending"];

/** Etiquetas que a IA devolve por item (`label`), com o texto que a pessoa lê. */
export const EVIDENCE_LABEL = {
  nao_citado: "Não citado no seu texto",
  sem_trecho: "A IA não achou um trecho seu que provasse este item",
  divergiram: "As duas IAs divergiram",
  sem_avaliacao: "Sem avaliação",
};

const SOURCE_LABEL = { ia: "IA", autoavaliacao: "Autoavaliação" };

const levelOf = (mark) => (LEVELS[mark.grade] ? mark.grade : "pending");

function ItemEvidence({ mark }) {
  const quote = typeof mark.quote === "string" ? mark.quote.trim() : "";
  const reason = typeof mark.reason === "string" ? mark.reason.trim() : "";
  // "Sem avaliação" já está no nível; não repete a mesma frase embaixo
  const tag = EVIDENCE_LABEL[mark.label] && mark.label !== "sem_avaliacao" ? EVIDENCE_LABEL[mark.label] : null;
  if (!quote && !reason && !tag) return null;
  return (
    <div className="f2-solo-evidence">
      {tag && (
        <div>
          <Badge tone="warning" size="sm" icon="triangle-alert">
            {tag}
          </Badge>
        </div>
      )}
      {quote && (
        <Accordion title="Trecho seu">
          <blockquote className="f2-solo-quote">{quote}</blockquote>
        </Accordion>
      )}
      {reason && (
        <Accordion title="Por quê">
          <p className="f2-solo-reason-text">{reason}</p>
        </Accordion>
      )}
    </div>
  );
}

function PointList({ title, items }) {
  return (
    <section className="f2-solo-points">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="f2-solo-muted">Nenhum item.</p>
      ) : (
        <ul>
          {items.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SoloResult({ attempt, onReport, go }) {
  const { station, result } = attempt;
  const [report, setReport] = React.useState(false);
  const [filter, setFilter] = React.useState("all");
  if (!result) return null;
  const isIa = result.source === "ia";
  const area = getArea(station?.area);
  const marks = [...(result.marks || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const count = (level) => marks.filter((m) => levelOf(m) === level).length;
  const lost = marks.filter((m) => Number(m.points) < Number(m.max));
  const shown = filter === "lost" ? lost : marks;
  const lostPoints = lost.reduce((sum, m) => sum + Math.max(0, Number(m.max) - (Number(m.points) || 0)), 0);
  const positive = Array.isArray(result.positive) ? result.positive : [];
  const negative = Array.isArray(result.negative) ? result.negative : [];
  const note = typeof result.ia?.note === "string" ? result.ia.note.trim() : "";

  return (
    <main className="f2-player-content f2-solo-wide">
      <header className="f2-solo-result-head">
        <div className="f2-solo-badges">
          <Badge tone="brand">Sozinho</Badge>
          {SOURCE_LABEL[result.source] && <Badge tone={isIa ? "ai" : "info"} icon={isIa ? "sparkles" : "clipboard-list"}>{SOURCE_LABEL[result.source]}</Badge>}
        </div>
        <h1>Resultado do treino sozinho</h1>
        <div className="f2-solo-muted">{[station?.name, station?.area].filter(Boolean).join(" · ")}</div>
      </header>

      <section
        aria-label="Resumo da nota"
        className="f2-solo-summary"
        style={{ background: `var(${area.bgToken})`, color: `var(${area.textToken})` }}
      >
        <div className="f2-solo-summary__col">
          <div className="f2-solo-label">Nota</div>
          <div className="f2-solo-score">
            <span className="f2-solo-score__n">{formatDecimal(Number(result.score))}</span>
            <span className="f2-solo-score__max">{`/ ${formatDecimal(Number(result.max_score))}`}</span>
          </div>
        </div>
        <div className="f2-solo-summary__col">
          <div className="f2-solo-label">{`Itens (${marks.length})`}</div>
          <div
            role="img"
            aria-label={ORDER.map((level) => `${count(level)} ${LEVELS[level].text}`).join(", ")}
            className="f2-solo-bar"
          >
            {ORDER.map((level) => count(level) > 0 && <span key={level} style={{ flex: count(level), background: LEVELS[level].color }} />)}
          </div>
          <div className="f2-solo-legend">
            {ORDER.map((level) => (
              <div key={level}>
                <span className="f2-solo-dot" style={{ background: LEVELS[level].color }} />
                <span style={{ flex: 1 }}>{LEVELS[level].text}</span>
                <b>{count(level)}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="f2-solo-summary__col">
          <div className="f2-solo-label">Detalhes</div>
          <dl className="f2-solo-details">
            <dt>Tempo usado</dt>
            <dd>{formatDuration(result.used_ms)}</dd>
            <dt>Correção</dt>
            <dd>{isIa ? "Inteligência artificial" : "Você mesmo"}</dd>
          </dl>
        </div>
      </section>

      {isIa && (
        <Banner
          tone="info"
          icon="triangle-alert"
          action={
            <Button variant="secondary" size="sm" icon="flag" onClick={() => setReport(true)}>
              Avisar a equipe que a avaliação errou
            </Button>
          }
        >
          {IA_NOTICE}
        </Banner>
      )}

      <div className="f2-solo-result-grid">
        <Card padding={0} style={{ borderRadius: "var(--radius-xl)", minWidth: 0 }}>
          <div className="f2-solo-card-head">
            <h2 className="f2-solo-h2">Quadro por item</h2>
            <span className="f2-solo-muted">{`${formatDecimal(lostPoints)} pt perdidos`}</span>
          </div>
          <div role="group" aria-label="Filtrar itens" className="f2-solo-filter">
            {[
              ["all", `Todos (${marks.length})`],
              ["lost", `Com perda de pontos (${lost.length})`],
            ].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} className={`sm-tab${filter === value ? " sm-tab--active" : ""}`} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
          <ol className="f2-solo-items" aria-label="Quadro por item">
            {shown.length === 0 && <li className="f2-solo-muted f2-solo-items__empty">Nenhum item com perda de pontos.</li>}
            {shown.map((mark) => {
              const level = levelOf(mark);
              return (
                <li key={mark.order} className="f2-solo-item">
                  <div className="f2-solo-item__head">
                    <span className="f2-solo-item__text">
                      <span className="f2-solo-item__n">{mark.order}</span>
                      {mark.content}
                    </span>
                    <Badge tone={LEVELS[level].tone} size="sm">
                      {LEVELS[level].text}
                    </Badge>
                    <span className="f2-solo-item__pts">{`${formatDecimal(Number(mark.points) || 0)} / ${formatDecimal(Number(mark.max))}`}</span>
                  </div>
                  {isIa && <ItemEvidence mark={mark} />}
                </li>
              );
            })}
          </ol>
          <div className="f2-solo-total">
            <span>Total</span>
            <span>{`${formatDecimal(Number(result.score))} / ${formatDecimal(Number(result.max_score))}`}</span>
          </div>
        </Card>

        <aside className="f2-solo-side" aria-label="Pontos do treino">
          <Card padding={20} style={{ borderRadius: "var(--radius-xl)" }}>
            <PointList title="Pontos positivos" items={positive} />
            <PointList title="Pontos para melhorar" items={negative} />
            {isIa && note && (
              <section className="f2-solo-points">
                <h3>Observação da IA</h3>
                <p className="f2-solo-reason-text">{note}</p>
              </section>
            )}
          </Card>
        </aside>
      </div>

      <div className="f2-solo-actions">
        <Button variant="primary" icon="rotate-ccw" onClick={() => go("estacao", { id: station?.id })}>
          Treinar de novo
        </Button>
        <Button variant="secondary" icon="list-checks" onClick={() => go("peps")}>
          Meus PEPs
        </Button>
        <Button variant="ghost" onClick={() => go("estacoes")}>
          Voltar ao banco de estações
        </Button>
      </div>

      {report && <ReportIaDialog items={marks} onSend={onReport} onClose={() => setReport(false)} />}
    </main>
  );
}
