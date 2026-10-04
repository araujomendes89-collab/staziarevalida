// Correção de uma questão: veredito, explicação e o que a banca cobra.
// Usada no painel da sessão e na revisão do resultado. Só mostra o que existe no banco.
import React from "react";
import { Badge, Button, Icon } from "../../ds";
import { FlashcardForm } from "../review/FlashcardForm.jsx";
import { QuestionCommentary, useCommentary } from "./QuestionCommentary.jsx";

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

/** Salvar um flashcard pessoal a partir da questão: o verso vem com a conduta esperada. */
function SaveAsFlashcard({ question, correction }) {
  const [state, setState] = React.useState("closed"); // closed | open | saved
  if (state === "saved") {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--type-body-sm)", color: "var(--success-text)" }} role="status">
        <Icon name="circle-check" size={16} /> Flashcard salvo. Ele aparece na sua revisão de Flashcards.
      </div>
    );
  }
  if (state === "closed") {
    return (
      <div>
        <Button variant="secondary" size="sm" icon="layers" onClick={() => setState("open")}>
          Criar flashcard
        </Button>
      </div>
    );
  }
  return (
    <div style={{ padding: 16, borderRadius: 16, background: "var(--surface-card)", border: "1px solid var(--border-default)" }}>
      <div style={{ font: "600 15px var(--font-sans)", marginBottom: 12 }}>Novo flashcard</div>
      <FlashcardForm
        compact
        initial={{ area: question.area, topic: correction.topic ?? "", front: "", back: correction.expected_conduct ?? "", source_question_id: question.id }}
        onCancel={() => setState("closed")}
        onSaved={() => setState("saved")}
      />
    </div>
  );
}

export function Correction({ selected, correction, question }) {
  const source = correction.sources?.[0];
  // Análise Stazia publicada (se houver): substitui "Por que não as outras?", que fica como reserva
  const commentary = useCommentary(question?.id);
  return (
    <>
      <Verdict selected={selected} correction={correction} />
      {correction.explanation && (
        <div>
          <div className="sm-overline">Explicação clínica</div>
          <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.6 }}>{correction.explanation}</p>
        </div>
      )}
      <QuestionCommentary commentary={commentary} />
      {!commentary && correction.option_notes?.length > 0 && (
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
      {question && <SaveAsFlashcard key={question.id} question={question} correction={correction} />}
    </>
  );
}
