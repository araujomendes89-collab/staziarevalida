// Comentário da questão em revisão (Q09, leva 3): explicação de cada alternativa, conduta esperada e "o que a questão avalia" novos
// ou alterados ficam escondidos do aluno até o revisor médico da área aprovar. Aqui: a faixa do editor (equipe), a decisão
// (aprovar ou devolver, com a nota) e a fila do revisor médico que não é da equipe. As regras de verdade estão no banco.
import React from "react";
import { Badge, Banner, Button, Card, EmptyState, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { areaLabel } from "../practice/format.js";
import { dateBR, ListRow, LoadError, Loading, messageOf, TextArea, useLoad } from "./common.jsx";

const LETTERS = ["A", "B", "C", "D"];
export const COMMENT_FIELD_LABEL = (campo) =>
  /^explanation_[A-D]$/.test(campo) ? `Explicação da ${campo.slice(-1)}` : { expected_conduct: "Conduta esperada", inep_intent: "O que a questão avalia" }[campo] ?? campo;
/** "Explicação da B, Conduta esperada" (explicações primeiro, na ordem das letras). */
export const commentFieldsText = (campos = []) => [...campos].sort((a, b) => (/^explanation_/.test(a) === /^explanation_/.test(b) ? a.localeCompare(b) : /^explanation_/.test(a) ? -1 : 1)).map(COMMENT_FIELD_LABEL).join(", ");

const squash = (text) => String(text ?? "").trim();
/** Os textos de comentário como estão num formulário (ou numa questão): campo → texto sem espaços nas pontas. */
export const commentTexts = (f) => ({
  ...Object.fromEntries(LETTERS.map((id) => [`explanation_${id}`, squash(f.options?.find((o) => o.id === id)?.explanation)])),
  expected_conduct: squash(f.expected_conduct),
  inep_intent: squash(f.inep_intent),
});
/** Os campos de comentário que a pessoa mudou no formulário (texto novo ou diferente; apagar não manda para revisão). */
export function changedCommentFields(now, saved) {
  const a = commentTexts(now);
  const b = saved ? commentTexts(saved) : {};
  return Object.keys(a).filter((k) => a[k] !== "" && a[k] !== (b[k] ?? ""));
}

const NOTE_MIN = 10;

/** Aprovar ou devolver: a nota é obrigatória (10 letras ou mais). Fica fora de <form>, então Enter não envia nada. */
function DecisionPanel({ initialMode = "approve", busy, error, onSubmit, onCancel }) {
  const [mode, setMode] = React.useState(initialMode);
  const [approveNote, setApproveNote] = React.useState("");
  const [returnNote, setReturnNote] = React.useState("");
  const approving = mode === "approve";
  const note = approving ? approveNote : returnNote;
  const ready = note.trim().length >= NOTE_MIN;
  return (
    <section
      aria-label="Decisão sobre o comentário"
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target?.tagName === "INPUT") event.preventDefault();
      }}
      style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: 16, border: "1px solid var(--border-default)", background: "var(--surface-sunken)" }}
    >
      {approving ? (
        <TextArea label="O que você conferiu" rows={3} maxLength={1000} value={approveNote} onChange={setApproveNote} hint={`Diga o que conferiu e em que fonte (pelo menos ${NOTE_MIN} letras). Ao aprovar, o aluno passa a ver o comentário.`} />
      ) : (
        <TextArea label="Motivo da devolução" rows={3} maxLength={1000} value={returnNote} onChange={setReturnNote} hint={`Diga o que precisa mudar (pelo menos ${NOTE_MIN} letras). O comentário continua escondido do aluno.`} />
      )}
      {error && <Banner tone="danger">{error}</Banner>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {approving ? (
          <>
            <Button size="sm" onClick={() => onSubmit("approve", approveNote.trim())} loading={busy} disabled={!ready}>
              Aprovar e liberar ao aluno
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("return")} disabled={busy}>
              Devolver para ajustes
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="danger" onClick={() => onSubmit("return", returnNote.trim())} loading={busy} disabled={!ready}>
              Devolver ao editor
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("approve")} disabled={busy}>
              Voltar para aprovar
            </Button>
          </>
        )}
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        )}
      </div>
    </section>
  );
}

const sinceText = (review, by) =>
  [by ? `Alterado por ${by}` : "Alterado", review?.desde ? `em ${dateBR(review.desde)}` : null].filter(Boolean).join(" ") + (review?.ia ? " (sugerido pelo assistente de IA)" : "") + ".";
const returnedText = (question) => {
  const note = question.comment_review?.devolvido?.nota ?? question.comment_decision?.note;
  if (!note) return null;
  const by = question.comment_decision?.decision === "return" ? question.comment_decision.by : null;
  return `${by ? `Devolvido por ${by}` : "Devolvido pelo revisor"}: “${note}”`;
};

/**
 * Faixa do editor: o que espera revisão, quem mexeu, a devolução do revisor e, para quem decide (administrador ou revisor da área),
 * os botões de aprovar e devolver. A decisão só vale para o texto gravado: com mudança não salva, os botões ficam travados.
 */
export function CommentReviewBanner({ question, savedForm, unsaved, onDecided, onStale }) {
  const { backend } = useSession();
  const review = question.comment_review;
  const [panel, setPanel] = React.useState(null); // null | "approve" | "return"
  const [state, setState] = React.useState({ busy: false, error: null });
  if (!review) return null;
  const canDecide = Boolean(question.comment_can_review);
  const returned = returnedText(question);

  const submit = async (decision, note) => {
    setState({ busy: true, error: null });
    try {
      const fresh = await backend.rpc("app_admin_question_comment_decide", {
        p_question_id: question.id, p_decision: decision, p_note: note, p_seen_texts: commentTexts(savedForm ?? question),
      });
      setState({ busy: false, error: null });
      setPanel(null);
      onDecided(decision, fresh);
    } catch (error) {
      setState({ busy: false, error: messageOf(error) });
      onStale?.();
    }
  };

  return (
    <>
      <Banner
        tone="warning"
        title="Comentário em revisão"
        action={
          canDecide && !panel ? (
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button size="sm" variant="secondary" disabled={unsaved} onClick={() => setPanel("approve")}>
                Aprovar comentário
              </Button>
              <Button size="sm" variant="ghost" disabled={unsaved} onClick={() => setPanel("return")}>
                Devolver para ajustes
              </Button>
            </span>
          ) : undefined
        }
      >
        {`Esperam revisão: ${commentFieldsText(review.campos)}. ${sinceText(review, question.comment_review_by)} O aluno não vê esses textos até um revisor médico aprovar.`}
        {returned && ` ${returned}`}
        {!canDecide && ` A aprovação é de um revisor médico cadastrado em ${areaLabel(question.area)} ou um administrador.`}
        {canDecide && unsaved && " Salve a questão antes de decidir: o revisor só aprova o texto gravado."}
      </Banner>
      {canDecide && panel && <DecisionPanel key={panel} initialMode={panel} busy={state.busy} error={state.error} onSubmit={submit} onCancel={() => (setPanel(null), setState({ busy: false, error: null }))} />}
      {!panel && state.error && <Banner tone="danger">{state.error}</Banner>}
    </>
  );
}

// ---------------------------------------------------------------- fila do revisor médico (sem papel de equipe)
function Pending({ children }) {
  return (
    <div data-em-revisao style={{ borderRadius: 12, border: "1px solid var(--warning-border)", background: "var(--warning-bg)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
      <Badge tone="warning" size="sm">
        Em revisão
      </Badge>
      {children}
    </div>
  );
}

function CommentReviewDetail({ id, onBack, onDone }) {
  const { backend } = useSession();
  const view = useLoad(() => backend.rpc("app_admin_comment_review", { p_question_id: id }), [backend, id]);
  const [state, setState] = React.useState({ busy: false, error: null });
  const q = view.data;
  if (view.error && !q) return <LoadError error={view.error} retry={view.reload} />;
  if (!q) return <Loading />;
  const campos = q.comment_review?.campos ?? [];
  const waiting = (campo) => campos.includes(campo);
  const returned = returnedText({ ...q, comment_review: q.comment_review });

  const submit = async (decision, note) => {
    setState({ busy: true, error: null });
    try {
      // os textos em revisão como esta tela os mostrou: o banco recusa se algum já não for este
      await backend.rpc("app_admin_question_comment_decide", { p_question_id: q.id, p_decision: decision, p_note: note, p_seen_texts: commentTexts({ options: q.options, expected_conduct: q.expected_conduct, inep_intent: q.inep_intent }) });
      setState({ busy: false, error: null });
      onDone(decision === "approve" ? "Comentário aprovado: o aluno já pode ver." : "Comentário devolvido ao editor.");
    } catch (error) {
      setState({ busy: false, error: messageOf(error) });
      view.reload(); // a questão de agora: o revisor lê de novo o que mudou
    }
  };

  const text = (value) => <p style={{ margin: 0, font: "var(--type-body)", whiteSpace: "pre-wrap" }}>{value}</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={onBack}>
          Voltar à fila
        </Button>
      </div>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ font: "600 13px var(--font-mono)", color: "var(--text-secondary)" }}>{q.code}</span>
            <Badge tone="brand" size="sm">
              {q.area_label}
            </Badge>
            {q.exam && (
              <Badge size="sm">
                {q.exam} · Q{q.number}
              </Badge>
            )}
          </div>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>{q.topic}</h3>
          {text(q.statement)}
          {q.options.map((o) => (
            <div key={o.id} style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr)", gap: 12, alignItems: "start" }}>
              <span style={{ width: 32, height: 32, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", font: "700 14px var(--font-sans)", background: q.correct_option === o.id ? "var(--success-bg)" : "var(--surface-sunken)", color: q.correct_option === o.id ? "var(--success-text)" : "var(--text-secondary)" }}>{o.id}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {text(o.text)}
                {o.explanation && (waiting(`explanation_${o.id}`) ? <Pending>{text(o.explanation)}</Pending> : <div style={{ color: "var(--text-secondary)" }}>{text(o.explanation)}</div>)}
              </div>
            </div>
          ))}
          {q.expected_conduct && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="sm-field__label">Conduta esperada</div>
              {waiting("expected_conduct") ? <Pending>{text(q.expected_conduct)}</Pending> : text(q.expected_conduct)}
            </div>
          )}
          {q.inep_intent && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="sm-field__label">O que a questão avalia</div>
              {waiting("inep_intent") ? <Pending>{text(q.inep_intent)}</Pending> : text(q.inep_intent)}
            </div>
          )}
        </div>
      </Card>
      {q.comment_review ? (
        <>
          <Banner tone="warning" title="Em revisão">
            {`Esperam sua decisão: ${commentFieldsText(campos)}. ${sinceText(q.comment_review, q.comment_review_by)}`}
            {returned && ` ${returned}`}
            {!q.can_review && ` A decisão é de um revisor médico cadastrado em ${q.area_label} ou um administrador.`}
          </Banner>
          {q.can_review && <DecisionPanel busy={state.busy} error={state.error} onSubmit={submit} />}
        </>
      ) : (
        <Banner tone="success" title="Nada em revisão">
          O comentário desta questão já foi decidido.
        </Banner>
      )}
    </div>
  );
}

/** A fila do revisor médico: os comentários das questões das áreas dele, os mais antigos primeiro. */
export function CommentReviewQueue() {
  const { backend } = useSession();
  const [openId, setOpenId] = React.useState(null);
  const [note, setNote] = React.useState(null);
  const list = useLoad(() => backend.rpc("app_admin_comment_review_queue", { p_filters: {}, p_limit: 200, p_offset: 0 }), [backend]);
  if (openId) {
    return (
      <CommentReviewDetail
        id={openId}
        onBack={() => (setOpenId(null), list.reload())}
        onDone={(message) => {
          setOpenId(null);
          setNote(message);
          list.reload();
        }}
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Comentários a revisar</h3>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>
          Questões das suas áreas com explicação, conduta esperada ou “o que a questão avalia” novos ou alterados. O aluno só vê o texto depois da sua aprovação.
        </p>
      </div>
      {note && (
        <div role="status" style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>
          {note}
        </div>
      )}
      {list.error && <LoadError error={list.error} retry={list.reload} />}
      {!list.data && !list.error && <Loading />}
      {list.data &&
        (list.data.items.length === 0 ? (
          <EmptyState icon="file-question" title="Nenhum comentário esperando revisão" description="Quando alguém criar ou alterar um comentário de questão das suas áreas, ele aparece aqui." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {list.data.items.map((item) => (
              <ListRow key={item.id} onClick={() => (setNote(null), setOpenId(item.id))} label={`Revisar ${item.code}`}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ font: "600 13px var(--font-mono)", color: "var(--text-secondary)" }}>{item.code}</span>
                    <Badge tone="brand" size="sm">
                      {item.area_label}
                    </Badge>
                    {item.returned && (
                      <Badge tone="warning" size="sm">
                        Devolvido
                      </Badge>
                    )}
                    {item.ia && (
                      <Badge size="sm" icon="sparkles">
                        Sugerido pelo assistente
                      </Badge>
                    )}
                  </div>
                  <span style={{ font: "600 15px var(--font-sans)", color: "var(--text-primary)" }}>{item.topic}</span>
                  <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{commentFieldsText(item.campos)}</span>
                </div>
                <Icon name="chevron-right" size={18} style={{ color: "var(--text-tertiary)", flex: "none", alignSelf: "center" }} />
              </ListRow>
            ))}
          </div>
        ))}
    </div>
  );
}
