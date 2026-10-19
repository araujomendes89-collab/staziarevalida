// Etapa 4: autoavaliação. O PEP só aparece aqui (e no resultado). A pessoa marca cada item; a nota que vale é a do servidor.
import React from "react";
import { Badge, Button, Card, Icon, ProgressBar } from "../../../ds";
import { fmtScore, GRADE_LABEL } from "../labels.js";

const CRITERIA = [
  ["incorrect", "Inadequado"],
  ["partial", "Parcialmente adequado"],
  ["correct", "Adequado"],
];

function Criteria({ criteria }) {
  const rows = CRITERIA.map(([grade, label]) => [label, typeof criteria?.[grade] === "string" ? criteria[grade].trim() : ""]).filter(([, text]) => text);
  if (rows.length === 0) return null;
  return (
    <details className="f2-solo-criteria">
      <summary>Critérios detalhados</summary>
      <dl>
        {rows.map(([label, text]) => (
          <React.Fragment key={label}>
            <dt>{label}</dt>
            <dd>{text}</dd>
          </React.Fragment>
        ))}
      </dl>
    </details>
  );
}

function ItemCard({ item, grade, onMark }) {
  const hasPartial = item.partial != null;
  const options = [
    ["correct", "check"],
    ...(hasPartial ? [["partial", "minus"]] : []),
    ["incorrect", "x"],
  ];
  return (
    <div className="f2-pep-item-card">
      <div className="f2-solo-pep-row">
        <span className="f2-solo-pep-n">{item.order}</span>

        <div className="f2-solo-pep-body">
          <div className="f2-solo-pep-meta">
            {item.phase && <Badge size="sm">{item.phase}</Badge>}
            <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
              Máximo: {fmtScore(item.max)} pt{hasPartial ? ` · Parcial: ${fmtScore(item.partial)} pt` : ""}
            </span>
          </div>

          <div style={{ font: "var(--type-body)", color: "var(--text-primary)", lineHeight: 1.5 }}>{item.content}</div>

          {item.tip ? <div className="f2-solo-muted">{item.tip}</div> : null}

          {Array.isArray(item.subitems) && item.subitems.length > 0 && (
            <ul style={{ margin: "var(--space-2) 0 0", paddingLeft: 20, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
              {item.subitems.map((sub, i) => (
                <li key={i}>{typeof sub === "string" ? sub : (sub?.text ?? "")}</li>
              ))}
            </ul>
          )}

          <Criteria criteria={item.criteria} />
        </div>

        <div role="radiogroup" aria-label={`Item ${item.order}`} className="f2-pep-radiogroup">
          {options.map(([key, icon]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={grade === key}
              className={`f2-pep-radio${grade === key ? ` f2-pep-radio--${key}` : ""}`}
              onClick={() => onMark(String(item.order), key)}
            >
              <Icon name={icon} size={14} />
              {GRADE_LABEL[key]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SoloSelfGrade({ checklist = [], mobile, busy, onSubmit }) {
  const [marks, setMarks] = React.useState({});
  const mark = (key, grade) => setMarks((prev) => ({ ...prev, [key]: grade }));

  // Prévia só para orientar: a nota que vale é a calculada pelo servidor ao concluir.
  let earned = 0;
  let max = 0;
  for (const item of checklist) {
    const itemMax = Number(item.max) || 0;
    max += itemMax;
    const grade = marks[String(item.order)];
    if (grade === "correct") earned += itemMax;
    else if (grade === "partial") earned += Number(item.partial) || 0;
  }
  const preview = max > 0 ? (earned / max) * 10 : 0;
  const marked = Object.keys(marks).length;
  const all = checklist.length > 0 && checklist.every((i) => marks[String(i.order)] != null);

  return (
    <>
      <main className="f2-player-content">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "var(--space-4)", flexWrap: "wrap" }}>
              <div>
                <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
                  Padrão Esperado de Procedimentos
                </span>
                <div style={{ font: "var(--type-display)", fontSize: 36, color: "var(--text-primary)", marginTop: "var(--space-2)" }}>
                  {fmtScore(preview)} <span style={{ font: "var(--type-h3)", color: "var(--text-tertiary)" }}>/ 10</span>
                </div>
                <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Prévia da nota calculada localmente</span>
              </div>

              <div style={{ minWidth: 220, flex: mobile ? "1 1 100%" : "none" }}>
                <ProgressBar
                  value={marked}
                  max={checklist.length}
                  label="Itens avaliados"
                  valueLabel={`${marked} de ${checklist.length}`}
                  color="var(--action-primary)"
                />
              </div>
            </div>
          </Card>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {checklist.map((item) => (
              <ItemCard key={item.order} item={item} grade={marks[String(item.order)]} onMark={mark} />
            ))}
          </div>
        </div>
      </main>

      <div className="f2-player-toolbar" role="toolbar" aria-label="Ações da estação">
        <span className="f2-solo-toolbar-note">{all ? "Todos os itens avaliados." : "Marque todos os itens para salvar."}</span>
        <Button iconRight="check" disabled={!all || busy} onClick={() => onSubmit(marks)} style={{ borderRadius: "var(--radius-pill)" }}>
          Concluir e ver a nota
        </Button>
      </div>
    </>
  );
}
