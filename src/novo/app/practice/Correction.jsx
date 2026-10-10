// Correção de uma questão: veredito, explicação e o que a banca cobra.
// Usada no painel da sessão e na revisão do resultado. Só mostra o que existe no banco.
import React from "react";
import { Badge, Button, Icon } from "../../ds";
import { FlashcardForm } from "../review/FlashcardForm.jsx";
import { QuestionCommentary, useCommentary } from "./QuestionCommentary.jsx";
import { useSession } from "../session.jsx";
import { ERROR_TYPE, KIND_LABEL } from "./diagnosisLabels.js";
import { TutorButton } from "../tutor/TutorDrawer.jsx";

/** Questão anulada pela banca (o banco diz "annulled"; sem gabarito também é anulada): não conta como acerto nem erro. */
export const isAnnulled = (correction) => correction?.annulled === true || (correction != null && correction.correct_option == null);

/** Estado de cada alternativa depois da correção. Anulada: nenhuma é "correta" nem "incorreta"; a marcada fica destacada. */
export function answerState(id, selected, correction) {
  if (isAnnulled(correction)) return id === selected ? "selected" : "dimmed";
  if (id === correction?.correct_option) return "correct";
  return id === selected ? "incorrect" : "dimmed";
}

export function Verdict({ selected, correction }) {
  if (isAnnulled(correction)) {
    return (
      <div style={{ padding: 16, borderRadius: 16, background: "var(--info-bg)", border: "1px solid var(--info-border)", display: "flex", gap: 12, alignItems: "center" }}>
        <Icon name="ban" size={22} style={{ color: "var(--info-text)", flex: "none" }} />
        <div style={{ font: "600 15px var(--font-sans)" }}>Questão anulada pela banca. Não conta como acerto nem erro.</div>
      </div>
    );
  }
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

/** Diagnóstico do erro: só aparece para quem errou, e só com o que a análise revisada por médico diz da alternativa marcada. */
function ErrorDiagnosis({ questionId }) {
  const { backend } = useSession();
  const [d, setD] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    backend.rpc("app_attempt_diagnosis", { p_question_id: questionId }).then((r) => alive && setD(r), () => alive && setD(null));
    return () => {
      alive = false;
    };
  }, [backend, questionId]);
  if (!d || (!d.diagnosed && !d.repeated_same_option)) return null;
  return (
    <div style={{ padding: "14px 16px", borderRadius: 14, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", fontSize: 14, display: "grid", gap: 8 }}>
      <b>Diagnóstico do seu erro</b>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {d.distractor_kind && <Badge size="sm" tone={d.distractor_kind === "TRUE_BUT_NOT_BEST" ? "warning" : "neutral"}>{KIND_LABEL[d.distractor_kind] ?? d.distractor_kind}</Badge>}
        {d.error_types.map((t) => (
          <Badge key={t} size="sm" tone="warning">{ERROR_TYPE[t] ?? t}</Badge>
        ))}
        {d.repeated_same_option && <Badge size="sm" tone="danger">você já marcou esta mesma alternativa {d.same_option_times} vezes</Badge>}
        {d.confidence === 3 && <Badge size="sm" tone="danger">você tinha certeza</Badge>}
      </div>
      {d.trap && <div><i>Armadilha:</i> {d.trap}</div>}
      {d.concept_difference && <div style={{ color: "var(--text-secondary)" }}><i>O que diferencia:</i> {d.concept_difference}</div>}
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

export function Correction({ selected, correction, question, tutorContext = "question" }) {
  const source = correction.sources?.[0];
  // Anulada: nenhuma alternativa é "a correta" (a letra guardada não vale), então não há "Explicação clínica" da correta,
  // "Por que não as outras?" nem análise publicada, mesmo que venham de um servidor antigo
  const annulled = isAnnulled(correction);
  // Análise Stazia publicada (se houver): substitui "Por que não as outras?", que fica como reserva
  const fetched = useCommentary(question?.id);
  const commentary = annulled ? null : fetched;
  return (
    <>
      <Verdict selected={selected} correction={correction} />
      {question?.id && selected != null && (
        <div>
          <TutorButton request={{ mode: "livre", questionId: question.id, context: { type: tutorContext, id: question.id } }} label={correction.is_correct === false ? "Discutir com o Tutor" : "Conversar com o Tutor"} />
        </div>
      )}
      {correction.in_review && (
        <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>A explicação desta questão está em revisão pela equipe.</div>
      )}
      {correction.explanation && !annulled && (
        <div>
          <div className="sm-overline">Explicação clínica</div>
          <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.6 }}>{correction.explanation}</p>
        </div>
      )}
      {question && correction.is_correct === false && selected != null && !annulled && <ErrorDiagnosis questionId={question.id} />}
      <QuestionCommentary commentary={commentary} />
      {!commentary && !annulled && correction.option_notes?.length > 0 && (
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
