// Correção de uma questão: veredito, explicação e o que a banca cobra.
// Usada na sessão, na revisão do resultado e no caderno de erros. Só mostra o que existe no banco.
// Modelo "Tela de Questão" (15/10/2026): a correção se divide em duas partes que a tela encaixa onde quiser:
//  - CorrectionBody: o que fica no cartão da questão (veredito, explicação, "por que não as outras", análise, conduta);
//  - CorrectionSide: o painel lateral (área e tema, selo de gabarito, fontes, Tutor, flashcard, relacionadas).
// `Correction` junta as duas, empilhadas (resultado e caderno de erros).
import React from "react";
import { Badge, Icon } from "../../ds";
import { FlashcardForm } from "../review/FlashcardForm.jsx";
import { QuestionCommentary, useCommentary } from "./QuestionCommentary.jsx";
import { LinkedSources, useLinkedSources } from "./LinkedSources.jsx";
import { useSession } from "../session.jsx";
import { ERROR_TYPE, KIND_LABEL } from "./diagnosisLabels.js";
import { areaLabel, areaOf, isStaziamed } from "./format.js";
import { TutorButton } from "../tutor/TutorDrawer.jsx";
import { RelatedQuestions } from "./RelatedQuestions.jsx";
import "./tela/tela-questao.css";

/**
 * Decisão do dono (15/10/2026): as fontes das Questões Inéditas ficam na tabela interna e NÃO aparecem ao aluno (referências e códigos
 * não aparecem em conteúdo StaziaMed). O banco ainda manda `official_sources` na correção; a tela não as mostra. Ligar = voltar o bloco
 * "Fontes oficiais citadas" das inéditas (só com nova decisão do dono).
 */
export const MOSTRAR_FONTES_DAS_INEDITAS = false;

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
      <div className="tq-verdict" style={{ alignItems: "flex-start" }}>
        <span className="tq-verdict__pill" data-t="info">
          <Icon name="ban" size={16} style={{ marginRight: 6 }} />
          Questão anulada
        </span>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
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
  return (
    <div className="tq-verdict">
      <span className="tq-verdict__pill" data-t={blank ? "warning" : ok ? "success" : "danger"}>
        {blank ? "Em branco" : ok ? "Você acertou" : "Resposta incorreta"}
      </span>
      <span className="tq-verdict__key">
        Gabarito: <strong>{correction.correct_option}</strong>
      </span>
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

/** Salvar um flashcard pessoal a partir da questão: o verso vem com a conduta esperada. Botão do painel + formulário embaixo. */
function SaveAsFlashcard({ question, correction }) {
  const [state, setState] = React.useState("closed"); // closed | open | saved
  return (
    <>
      <button type="button" className="tq-secondary" data-done={state === "saved" ? "true" : "false"} disabled={state === "saved"} aria-expanded={state === "open"} onClick={() => setState(state === "open" ? "closed" : "open")}>
        <Icon name="layers" size={18} />
        {state === "saved" ? "Flashcard criado" : "Criar flashcard"}
      </button>
      {state === "saved" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--type-body-sm)", color: "var(--success-text)" }} role="status">
          <Icon name="circle-check" size={16} /> Flashcard salvo. Ele aparece na sua revisão de Flashcards.
        </div>
      )}
      {state === "open" && (
        <div className="tq-box" style={{ padding: 16, borderRadius: 16, borderColor: "var(--border-default)" }}>
          <div style={{ font: "600 15px var(--font-sans)", marginBottom: 12 }}>Novo flashcard</div>
          <FlashcardForm
            compact
            initial={{ area: question.area, topic: correction.topic ?? "", front: "", back: correction.expected_conduct ?? "", source_question_id: question.id }}
            onCancel={() => setState("closed")}
            onSaved={() => setState("saved")}
          />
        </div>
      )}
    </>
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

/** Tudo que a correção busca no banco, num lugar só (a tela chama uma vez e passa para o corpo e o painel). */
export function useCorrectionData(question, correction) {
  const on = correction != null;
  // Questão StaziaMed: "Gabarito StaziaMed", nunca "gabarito oficial", "O que a questão avalia" nem o Tutor (o Tutor só trabalha com as oficiais)
  const staz = on && (correction.origin === "staziamed" || isStaziamed(question));
  // Anulada: nenhuma alternativa é "a correta" (a letra guardada não vale), então não há "Explicação clínica" da correta,
  // "Por que não as outras?" nem análise publicada, mesmo que venham de um servidor antigo
  const annulled = on && isAnnulled(correction);
  // Análise Stazia publicada (se houver): substitui "Por que não as outras?", que fica como reserva
  const fetched = useCommentary(on && !staz ? question?.id : null);
  const commentary = annulled ? null : fetched;
  // Fontes vinculadas (12/10/2026): o trecho do documento oficial que sustenta a resposta; questão anulada não tem resposta a sustentar
  const linked = useLinkedSources(on && !annulled ? question?.id : null);
  // regra da rodada 2: a nota "O que mudou desde a prova" aparece UMA vez só. O banco (9920) já não manda a da carga das explicações
  // quando o quadro tem nota; a tela confere de novo (se o quadro mostra a nota da referência atual, a outra não aparece)
  const linkedNote = Boolean(linked) && linked.status !== "nao_confirmada" && (linked.current ?? []).some((i) => typeof i?.update_note === "string" && i.update_note.trim());
  return { staz, annulled, commentary, linked, linkedNote };
}

const boxStyle = { padding: "14px 16px", borderRadius: 14, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", fontSize: 14, lineHeight: 1.55 };

/** O que fica dentro do cartão da questão depois de responder: veredito, explicação, letras, análise, conduta, fontes vinculadas. */
export function CorrectionBody({ selected, correction, question, data }) {
  const { staz, annulled, commentary, linked, linkedNote } = data;
  return (
    <div className="tq-answer" aria-live="polite">
      <Verdict selected={selected} correction={correction} />
      {/* gabarito oficial ainda preliminar (o banco diz answer_preliminary; some quando o definitivo for registrado) */}
      {!staz && !annulled && correction.answer_preliminary === true && <PreliminarySeal info={correction.preliminary ?? {}} />}
      {correction.explanation && !annulled && <p className="tq-expl">{correction.explanation}</p>}
      {question && correction.is_correct === false && selected != null && !annulled && <ErrorDiagnosis questionId={question.id} />}
      <QuestionCommentary commentary={commentary} />
      {!commentary && !annulled && correction.option_notes?.length > 0 && (
        <div>
          <div className="tq-over" style={{ marginBottom: 8 }}>Por que não as outras?</div>
          <div className="tq-letters">
            {correction.option_notes.map((note) => (
              <div key={note.id} data-key={note.id === correction.correct_option ? "true" : "false"}>
                <b>{note.id}.</b>
                <span>{note.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {annulled && <AnnulledStudy notes={annulledStudyNotes(correction)} />}
      {correction.expected_conduct && (
        <div style={boxStyle}>
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
          <div className="tq-over">O que a questão avalia</div>
          <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)" }}>{correction.inep_intent}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Painel lateral. Área e tema (o tema só existe depois de responder, vem da correção), selo do gabarito, fontes do gabarito
 * (só das questões oficiais, que o app já mostrava), Tutor (não abre para Inédita nem anulada), flashcard e relacionadas.
 * Não mostra dificuldade: o banco não tem esse dado.
 */
export function CorrectionSide({ selected, correction, question, data, tutorContext = "question", go = null, inSession = false, children = null }) {
  const { staz, annulled } = data;
  const area = areaOf(question?.area);
  const source = correction.sources?.[0];
  const title = correction.topic ? `${areaLabel(question?.area)} — ${correction.topic}` : areaLabel(question?.area);
  return (
    <>
      {children}
      <div className="tq-panel" style={area ? { "--area": `var(${area.tone})` } : undefined}>
        <div className="tq-ctx">
          <div className="tq-ctx__tile" aria-hidden="true">
            <Icon name={area?.icon ?? "stethoscope"} size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="tq-over">Área e tema</div>
            <div className="tq-ctx__title">{title}</div>
            {correction.subtopic && <div className="tq-ctx__sub">{correction.subtopic}</div>}
          </div>
        </div>
        {staz && !annulled && (
          <dl className="tq-dl">
            <dt>Gabarito</dt>
            <dd>
              <strong>Gabarito StaziaMed</strong> · questão autoral, não oficial do Inep
            </dd>
          </dl>
        )}
      </div>
      {correction.in_review && (
        <div className="tq-notice-card" role="status">
          <Icon name="clock" size={20} style={{ flex: "none", marginTop: 1 }} />
          <div>
            <strong style={{ display: "block", fontWeight: 700 }}>Explicação em revisão</strong>A explicação desta questão está em revisão pela equipe.
          </div>
        </div>
      )}
      {staz && MOSTRAR_FONTES_DAS_INEDITAS && <OfficialSources correction={correction} />}
      {!staz && source?.title && (
        <div className="tq-panel" style={{ gap: 12 }}>
          <div className="tq-over tq-over--accent">Fontes</div>
          <div className="tq-src">
            <Icon name="file-text" size={20} style={{ color: "var(--tq-accent-text)", flex: "none" }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="tq-src__t">{source.title}</span>
              {(source.organization ?? source.organ) && <span className="tq-src__o">{source.organization ?? source.organ}</span>}
            </span>
          </div>
        </div>
      )}
      <div className="tq-actions">
        {!staz && question?.id && selected != null && !annulled && <TutorButton variant="modelo" request={{ mode: "livre", questionId: question.id, context: { type: tutorContext, id: question.id } }} label={correction.is_correct === false ? "Discutir com o Tutor" : "Conversar com o Tutor"} />}
        {/* chaves DIFERENTES de propósito: irmãos com a mesma chave fazem o React duplicar o botão a cada nova renderização */}
        {question && <SaveAsFlashcard key={`flashcard-${question.id}`} question={question} correction={correction} />}
      </div>
      {go && question?.id && <RelatedQuestions key={`related-${question.id}`} questionId={question.id} go={go} inSession={inSession} />}
    </>
  );
}

/**
 * Correção empilhada (resultado do treino e caderno de erros): o corpo e o painel, um embaixo do outro.
 * `go` liga "Questões relacionadas"; `inSession` avisa que abrir outra questão sai do treino em andamento.
 */
export function Correction({ selected, correction, question, tutorContext = "question", go = null, inSession = false }) {
  const data = useCorrectionData(question, correction);
  return (
    <div className="tq" style={{ minHeight: 0, background: "transparent", display: "flex", flexDirection: "column", gap: 16 }}>
      <CorrectionBody selected={selected} correction={correction} question={question} data={data} />
      <CorrectionSide selected={selected} correction={correction} question={question} data={data} tutorContext={tutorContext} go={go} inSession={inSession} />
    </div>
  );
}
