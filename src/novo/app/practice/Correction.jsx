// Correção de uma questão: veredito, explicação e o que a banca cobra.
// Usada no painel da sessão e na revisão do resultado. Só mostra o que existe no banco.
import React from "react";
import { Badge, Icon } from "../../ds";

export function Verdict({ selected, correction }) {
  const blank = selected == null;
  const ok = correction.is_correct === true;
  const tone = blank ? "warning" : ok ? "success" : "danger";
  const text = blank
    ? `Em branco. A correta é ${correction.correct_option}.`
    : ok
      ? "Resposta correta."
      : `Você marcou ${selected}. A correta é ${correction.correct_option}.`;
  return (
    <div style={{ padding: 16, borderRadius: 16, background: `var(--${tone}-bg)`, border: `1px solid var(--${tone}-border)`, display: "flex", gap: 12, alignItems: "center" }}>
      <Icon name={blank ? "circle-minus" : ok ? "circle-check" : "circle-x"} size={22} style={{ color: `var(--${tone}-text)`, flex: "none" }} />
      <div style={{ font: "600 15px var(--font-sans)" }}>{text}</div>
    </div>
  );
}

export function Correction({ selected, correction }) {
  const source = correction.sources?.[0];
  return (
    <>
      <Verdict selected={selected} correction={correction} />
      {correction.explanation && (
        <div>
          <div className="sm-overline">Explicação clínica</div>
          <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.6 }}>{correction.explanation}</p>
        </div>
      )}
      {correction.option_notes?.length > 0 && (
        <div style={{ padding: "14px 16px", borderRadius: 14, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", fontSize: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <b>Por que não as outras?</b>
          {correction.option_notes.map((note) => (
            <div key={note.id}>
              <b>{note.id}.</b> {note.text}
            </div>
          ))}
        </div>
      )}
      {correction.expected_conduct && (
        <div style={{ padding: "14px 16px", borderRadius: 14, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", fontSize: 14, lineHeight: 1.55 }}>
          <b>Conduta esperada.</b> {correction.expected_conduct}
        </div>
      )}
      {correction.inep_intent && (
        <div>
          <div className="sm-overline">O que a questão avalia</div>
          <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)" }}>{correction.inep_intent}</p>
        </div>
      )}
      {correction.topic && (
        <div style={{ minWidth: 0 }}>
          {/* Temas podem ser longos: o selo quebra linha em vez de vazar do painel. */}
          <Badge tone="brand" style={{ height: "auto", minHeight: 24, padding: "4px 8px", whiteSpace: "normal", lineHeight: 1.3, borderRadius: 12 }}>
            {correction.topic}
          </Badge>
          {correction.subtopic && (
            <p style={{ margin: "6px 0 0", font: "var(--type-body-sm)", fontSize: 13, color: "var(--text-secondary)" }}>{correction.subtopic}</p>
          )}
        </div>
      )}
      {source?.title && (
        <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
          Gabarito: {source.title}
          {source.organization ? ` · ${source.organization}` : ""}
        </div>
      )}
    </>
  );
}
