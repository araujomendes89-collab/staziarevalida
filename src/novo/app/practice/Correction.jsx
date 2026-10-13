// Correção de uma questão: veredito, explicação e o que a banca cobra.
// Usada no painel da sessão e na revisão do resultado. Só mostra o que existe no banco.
import React from "react";
import { Badge, Button, Icon } from "../../ds";
import { FlashcardForm } from "../review/FlashcardForm.jsx";
import { QuestionCommentary, useCommentary } from "./QuestionCommentary.jsx";
import { LinkedSources, useLinkedSources } from "./LinkedSources.jsx";
import { useSession } from "../session.jsx";
import { ERROR_TYPE, KIND_LABEL } from "./diagnosisLabels.js";
import { isStaziamed } from "./format.js";
import { TutorButton } from "../tutor/TutorDrawer.jsx";
import { RelatedQuestions } from "./RelatedQuestions.jsx";

/** Questão anulada pela banca (o banco diz "annulled"; sem gabarito também é anulada): não conta como acerto nem erro. */
export const isAnnulled = (correction) => correction?.annulled === true || (correction != null && correction.correct_option == null);
/** Anulada com explicações de estudo (carga das explicações, 12/10/2026): o aviso exato, pedido pelo dono. */
export const ANNULLED_NOTICE = "Questão anulada pela banca do Inep. As explicações abaixo servem para estudo; nenhuma alternativa conta como gabarito.";
export const UPDATE_NOTE_TITLE = "O que mudou desde a prova";
export const UPDATE_NOTE_CAPTION = "O gabarito oficial da prova não muda. A nota mostra o que mudou depois da prova e foi aprovada pela equipe.";
/** As explicações de estudo da anulada: o banco só manda as quatro, todas "Defensável." ou "Incorreta."; a tela confere de novo. */
export const annulledStudyNotes = (correction) => {
  const notes = Array.isArray(correction?.annulled_notes) ? correction.annulled_notes : [];
  return notes.length === 4 && notes.every((n) => typeof n?.text === "string" && /^(Defensável|Incorreta)\./.test(n.text.trim())) ? notes : [];
};

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
        <div>
          <div style={{ font: "600 15px var(--font-sans)" }}>Questão anulada pela banca. Não conta como acerto nem erro.</div>
          {annulledStudyNotes(correction).length === 0 && (
            <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 2 }}>Nenhuma alternativa conta como correta, por isso não há explicação de cada alternativa.</div>
          )}
        </div>
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

export const PRELIMINARY_SEAL = "GABARITO PRELIMINAR";

/** "2026-12-04" → "O gabarito definitivo só será divulgado pelo Inep em 04/12/2026." (a data é dado da prova no banco). */
export function preliminaryText(expectedOn) {
  const m = String(expectedOn ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `O gabarito definitivo só será divulgado pelo Inep em ${m[3]}/${m[2]}/${m[1]}.` : "O gabarito definitivo ainda não foi divulgado pelo Inep.";
}

/**
 * Selo claro das questões com gabarito oficial ainda PRELIMINAR (o banco manda preliminary = { expected_on } ou nulo).
 * compact: só o selo (linhas de lista). Some quando a equipe registra o gabarito definitivo.
 */
export function PreliminarySeal({ info, compact = false }) {
  if (!info) return null;
  if (compact) return <Badge tone="warning" size="sm">{PRELIMINARY_SEAL}</Badge>;
  return (
    <div role="note" aria-label={PRELIMINARY_SEAL} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "12px 14px", borderRadius: 14, background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
      <Badge tone="warning">{PRELIMINARY_SEAL}</Badge>
      <span style={{ font: "600 14px/1.4 var(--font-sans)", color: "var(--warning-text)" }}>{preliminaryText(info.expected_on)}</span>
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

/** Anulada: as explicações de estudo das quatro letras ("Defensável." ou "Incorreta."), com o aviso. Fora de acertos e erros. */
function AnnulledStudy({ notes }) {
  if (!notes.length) return null;
  return (
    <section aria-label="Explicações para estudo" style={{ padding: "14px 16px", borderRadius: 14, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", fontSize: 14, lineHeight: 1.55, display: "flex", flexDirection: "column", gap: 8 }}>
      <b>Explicações para estudo</b>
      <div role="note" style={{ padding: "8px 10px", borderRadius: 10, background: "var(--info-bg)", border: "1px solid var(--info-border)" }}>
        {ANNULLED_NOTICE}
      </div>
      {notes.map((note) => {
        const text = note.text.trim();
        const label = text.startsWith("Defensável.") ? "Defensável." : "Incorreta.";
        return (
          <div key={note.id}>
            <b>{note.id}.</b> <b>{label}</b> {text.slice(label.length).trim()}
          </div>
        );
      })}
    </section>
  );
}

/** "O que mudou desde a prova": a nota aprovada pela equipe (o banco só manda aprovada e sem repetir a das Fontes vinculadas). */
function UpdateNote({ text }) {
  if (!text) return null;
  return (
    <section aria-label={UPDATE_NOTE_TITLE} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: 12, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", fontSize: 14, lineHeight: 1.55 }}>
      <div className="sm-overline">{UPDATE_NOTE_TITLE}</div>
      <p style={{ margin: 0, overflowWrap: "anywhere" }}>{text}</p>
      <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{UPDATE_NOTE_CAPTION}</div>
    </section>
  );
}

/** Fontes oficiais citadas de uma Questão StaziaMed: órgão, documento, versão, página e o trecho (só depois de responder). */
function OfficialSources({ correction }) {
  const list = correction.official_sources?.length ? correction.official_sources : (correction.sources ?? []).map((s) => ({ source: s.title, organ: s.organ, version: s.version, page: s.page }));
  if (!list.length) return null;
  return (
    <div style={{ padding: "14px 16px", borderRadius: 14, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", fontSize: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      <b>Fontes oficiais citadas</b>
      {list.map((c, i) => (
        <div key={i}>
          <div>
            <b>{c.source ?? c.title}</b>
            {c.organ ? ` · ${c.organ}` : ""}
            {c.version ? ` · versão ${c.version}` : ""}
            {c.page != null ? ` · p. ${c.page}` : ""}
          </div>
          {c.quote && <blockquote style={{ margin: "4px 0 0", paddingLeft: 10, borderLeft: "3px solid var(--border-default)", color: "var(--text-secondary)" }}>{c.quote}</blockquote>}
        </div>
      ))}
    </div>
  );
}

/**
 * `go` (navegação das telas) liga o bloco "Questões relacionadas" no fim da correção; `inSession` avisa que abrir outra
 * questão sai do treino em andamento.
 */
export function Correction({ selected, correction, question, tutorContext = "question", go = null, inSession = false }) {
  const source = correction.sources?.[0];
  // Questão StaziaMed: "Gabarito StaziaMed", nunca "gabarito oficial", "O que a questão avalia" nem o Tutor (o Tutor só trabalha com as oficiais)
  const staz = correction.origin === "staziamed" || isStaziamed(question);
  // Anulada: nenhuma alternativa é "a correta" (a letra guardada não vale), então não há "Explicação clínica" da correta,
  // "Por que não as outras?" nem análise publicada, mesmo que venham de um servidor antigo
  const annulled = isAnnulled(correction);
  // Análise Stazia publicada (se houver): substitui "Por que não as outras?", que fica como reserva
  const fetched = useCommentary(staz ? null : question?.id);
  const commentary = annulled ? null : fetched;
  // Fontes vinculadas (12/10/2026): o trecho do documento oficial que sustenta a resposta; questão anulada não tem resposta a sustentar
  const linked = useLinkedSources(annulled ? null : question?.id);
  // regra da rodada 2: a nota "O que mudou desde a prova" aparece UMA vez só. O banco (9920) já não manda a da carga das explicações
  // quando o quadro tem nota; a tela confere de novo (se o quadro mostra a nota da referência atual, a outra não aparece)
  const linkedNote = Boolean(linked) && linked.status !== "nao_confirmada" && (linked.current ?? []).some((i) => typeof i?.update_note === "string" && i.update_note.trim());
  return (
    <>
      <Verdict selected={selected} correction={correction} />
      {/* gabarito oficial ainda preliminar (o banco diz answer_preliminary; some quando o definitivo for registrado) */}
      {!staz && !annulled && correction.answer_preliminary === true && <PreliminarySeal info={correction.preliminary ?? {}} />}
      {/* anulada: o Tutor não abre questão anulada (responderia "Questão não encontrada."), então o botão não aparece */}
      {staz && !annulled && (
        <div style={{ font: "600 15px var(--font-sans)" }}>
          Gabarito StaziaMed: alternativa {correction.correct_option}
          <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", fontWeight: 400 }}> · não é questão oficial do Inep</span>
        </div>
      )}
      {!staz && question?.id && selected != null && !annulled && (
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
      {annulled && <AnnulledStudy notes={annulledStudyNotes(correction)} />}
      {correction.expected_conduct && (
        <div style={{ padding: "14px 16px", borderRadius: 14, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", fontSize: 14, lineHeight: 1.55 }}>
          <b>Conduta esperada.</b> {correction.expected_conduct}
        </div>
      )}
      {/* o cartão de atualização do comentário já mostra "o que mudou": a nota não se repete no quadro */}
      {!annulled && <LinkedSources data={linked} hideUpdateNote={Boolean(commentary?.update_card)} />}
      {/* nota "O que mudou desde a prova" da carga das explicações (9920): o banco já a devolve vazia quando o quadro Fontes
          vinculadas (9900) mostra a nota da referência atual (e a tela confere de novo: linkedNote); o cartão da Análise Stazia também a esconde */}
      {!commentary?.update_card && !linkedNote && <UpdateNote text={correction.update_note} />}
      {!staz && correction.inep_intent && (
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
      {staz && <OfficialSources correction={correction} />}
      {!staz && source?.title && (
        <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
          Gabarito: {source.title}
          {source.organization ? ` · ${source.organization}` : ""}
        </div>
      )}
      {question && <SaveAsFlashcard key={question.id} question={question} correction={correction} />}
      {go && question?.id && <RelatedQuestions key={question.id} questionId={question.id} go={go} inSession={inSession} />}
    </>
  );
}
