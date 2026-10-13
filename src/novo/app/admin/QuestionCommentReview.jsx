// Comentário da questão em revisão (Q09, leva 3): explicação de cada alternativa, conduta esperada e "o que a questão avalia" novos
// ou alterados ficam escondidos do aluno até o revisor médico da área aprovar. Aqui: a faixa do editor (equipe), a decisão
// (aprovar ou devolver, com a nota) e a fila do revisor médico que não é da equipe. As regras de verdade estão no banco.
import React from "react";
import { Badge, Banner, Button, Card, EmptyState, Icon, SelectField } from "../../ds";
import { useSession } from "../session.jsx";
import { areaLabel } from "../practice/format.js";
import { QuestionFigures } from "../practice/QuestionFigures.jsx";
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
function DecisionPanel({ initialMode = "approve", busy, error, locked = false, onSubmit, onCancel }) {
  const [mode, setMode] = React.useState(initialMode);
  const [approveNote, setApproveNote] = React.useState("");
  const [returnNote, setReturnNote] = React.useState("");
  const approving = mode === "approve";
  const note = approving ? approveNote : returnNote;
  const ready = note.trim().length >= NOTE_MIN && !locked;
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
      {locked && <Banner tone="warning">Você mudou o texto do formulário. Salve a questão (ou desfaça a mudança) antes de decidir: o revisor só aprova o texto que está gravado.</Banner>}
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
  [review?.carga ? "Veio da carga das explicações (escritas pelos agentes Professor e Auditor)" : by ? `Alterado por ${by}` : "Alterado", review?.desde ? `em ${dateBR(review.desde)}` : null].filter(Boolean).join(" ") +
  (review?.ia && !review?.carga ? " (sugerido pelo assistente de IA)" : "") + ".";

const VEREDITO = { ok: "sem problema", corrigir: "corrigiu o texto", divergente: "apontou divergência (o dono decidiu manter o gabarito)" };
/** O que a conferência automática da carga apontou (só a equipe e o revisor médico veem; nada disto vai ao aluno). */
export function LoadNotes({ carga }) {
  if (!carga) return null;
  const linhas = [
    carga.veredito ? `Auditor: ${VEREDITO[carga.veredito] ?? carga.veredito}${carga.correcoes_aplicadas?.length ? ` (${carga.correcoes_aplicadas.filter((c) => c.startsWith("explicacao") || ["conduta_esperada", "o_que_a_questao_avalia", "tema", "subtema", "nota_atualizacao"].includes(c)).length} trecho(s) reescrito(s))` : ""}.` : "O Auditor ainda não conferiu.",
    ...(carga.problemas ?? []).map((p) => `Auditor: ${p}`),
    carga.suspeita_gabarito && `Professor desconfiou do gabarito: ${carga.suspeita_gabarito}`,
    carga.conferir_diretriz && `Conferir na diretriz vigente: ${carga.conferir_diretriz}`,
    ...(carga.alertas ?? []).map((a) => `Alerta: ${a}`),
    ...(carga.pontos_de_atencao ?? []).map((p) => `Ponto de atenção: ${p}`),
    carga.texto_diferente && "O enunciado ou as alternativas do banco não são exatamente os que o Professor leu: confira.",
    carga.gabarito_preliminar && "Prova com gabarito PRELIMINAR.",
  ].filter(Boolean);
  return (
    <section aria-label="Conferência automática" style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px", borderRadius: 12, background: "var(--surface-sunken)", border: "1px solid var(--border-default)", font: "var(--type-body-sm)" }}>
      <b>Conferência automática (só a equipe vê)</b>
      {linhas.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </section>
  );
}

const NOTE_STATUS = { em_revisao: ["warning", "Em revisão"], aprovada: ["success", "Aprovada"], devolvida: ["danger", "Devolvida"] };

/**
 * Nota "O que mudou desde a prova" da questão (carga das explicações): ver, escrever (equipe) e aprovar ou devolver (revisor médico
 * da área ou administrador). lazy: só busca quando a pessoa abre (no editor, como o histórico). Sem a atualização do banco, nada aparece.
 */
export function UpdateNoteCard({ questionId, lazy = false }) {
  const { backend } = useSession();
  const [open, setOpen] = React.useState(!lazy);
  const [data, setData] = React.useState(null); // null = carregando ou indisponível
  const [failed, setFailed] = React.useState(false);
  const [draft, setDraft] = React.useState(null);
  const [panel, setPanel] = React.useState(null);
  const [state, setState] = React.useState({ busy: false, error: null, done: null });
  React.useEffect(() => {
    let alive = true;
    if (!open || !questionId) return undefined;
    backend.rpc("app_admin_question_update_note", { p_question_id: questionId }).then(
      (d) => alive && setData(d),
      () => alive && setFailed(true)
    );
    return () => {
      alive = false;
    };
  }, [backend, questionId, open]);
  if (failed && !lazy) return null;
  const run = async (fn, args, done) => {
    setState({ busy: true, error: null, done: null });
    try {
      const fresh = await backend.rpc(fn, args);
      setData(fresh);
      setDraft(null);
      setPanel(null);
      setState({ busy: false, error: null, done });
    } catch (error) {
      setState({ busy: false, error: messageOf(error), done: null });
    }
  };
  const box = { display: "flex", flexDirection: "column", gap: 10 };
  const body = !open ? (
    <div>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Ver a nota
      </Button>
    </div>
  ) : failed ? (
    <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>A nota ainda não está disponível (falta a atualização do banco).</div>
  ) : !data ? (
    <Loading />
  ) : (
    <div style={box}>
      {data.note ? (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Badge size="sm" tone={NOTE_STATUS[data.status]?.[0] ?? "neutral"}>
              {NOTE_STATUS[data.status]?.[1] ?? data.status}
            </Badge>
            <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>
              {data.origin === "professor" ? "Escrita pelo agente Professor" : "Escrita pela equipe"}
              {data.decided_at ? ` · ${data.status === "aprovada" ? "aprovada" : "devolvida"} por ${data.decided_by ?? "revisor"} em ${dateBR(data.decided_at)}` : ""}
            </span>
          </div>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{data.note}</p>
          {data.decision_note && <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{`Nota do revisor: “${data.decision_note}”`}</div>}
          {data.status === "aprovada" && data.student_sees && <div style={{ font: "var(--type-caption)", color: "var(--success-text)" }}>O aluno vê esta nota na correção.</div>}
          {data.hidden_reason && <Banner tone="info">{data.hidden_reason}</Banner>}
          {data.status !== "aprovada" && <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>O aluno só vê esta nota depois que um revisor médico da área (ou um administrador) aprovar.</div>}
        </>
      ) : (
        <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Esta questão não tem nota “O que mudou desde a prova”.</div>
      )}
      {data.note && data.status !== "aprovada" && data.can_decide && !panel && draft === null && (
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button size="sm" variant="secondary" onClick={() => setPanel("approve")}>
            Aprovar a nota
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPanel("return")}>
            Devolver a nota
          </Button>
        </span>
      )}
      {panel && (
        <DecisionPanel
          key={panel}
          initialMode={panel}
          busy={state.busy}
          error={state.error}
          onSubmit={(decision, note) =>
            run("app_admin_question_update_note_decide", { p_question_id: questionId, p_decision: decision, p_note: note, p_seen_text: data.note }, decision === "approve" ? "Nota aprovada: o aluno já pode ver." : "Nota devolvida.")
          }
          onCancel={() => (setPanel(null), setState({ busy: false, error: null, done: null }))}
        />
      )}
      {data.can_edit && !panel && (draft === null ? (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setDraft(data.note ?? "")}>
            {data.note ? "Mudar a nota" : "Escrever nota"}
          </Button>
        </div>
      ) : (
        <div style={box}>
          <TextArea label="Nota “O que mudou desde a prova”" rows={4} maxLength={1500} value={draft} onChange={setDraft} hint="O gabarito oficial não muda. Diga o que era na época e o que vale hoje, sem inventar número de documento. Ao salvar, a nota volta para a revisão; apagar tudo tira a nota." />
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" loading={state.busy} onClick={() => run("app_admin_question_update_note_save", { p_question_id: questionId, p_note: draft }, "Nota salva: espera a aprovação do revisor médico.")}>
              Salvar nota
            </Button>
            <Button size="sm" variant="ghost" disabled={state.busy} onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </span>
        </div>
      ))}
      {!panel && state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.done && (
        <div role="status" style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>
          {state.done}
        </div>
      )}
    </div>
  );
  return (
    <Card>
      <section aria-label="Nota O que mudou desde a prova" style={box}>
        <h3 style={{ margin: 0, font: "var(--type-h4)" }}>O que mudou desde a prova</h3>
        {body}
      </section>
    </Card>
  );
}

/**
 * Aprovar a prova inteira (revisor médico: só as questões das áreas dele; administrador: todas). Mostra quantas entram, quantas
 * ficam de fora (devolvidas, de outras áreas) e pede a nota do que foi conferido. O banco recusa se a lista mudou desde a leitura.
 */
export function ExamApproval({ examId, onDone }) {
  const { backend } = useSession();
  const [info, setInfo] = React.useState(null);
  const [note, setNote] = React.useState("");
  const [state, setState] = React.useState({ busy: false, error: null });
  const load = React.useCallback(() => {
    setInfo(null);
    backend.rpc("app_admin_comment_review_exam", { p_exam_id: examId }).then(setInfo, () => setInfo(false));
  }, [backend, examId]);
  React.useEffect(() => {
    load();
  }, [load]);
  if (!info) return null;
  if (info.aprovaveis === 0) {
    return info.pendentes > 0 ? (
      <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        {`Nesta prova, ${info.pendentes} ${info.pendentes === 1 ? "comentário espera" : "comentários esperam"} revisão, mas nenhum que você possa aprovar de uma vez (a aprovação é do revisor médico da área ou do administrador; as devolvidas ficam de fora).`}
      </div>
    ) : null;
  }
  const submit = async () => {
    setState({ busy: true, error: null });
    try {
      const r = await backend.rpc("app_admin_comment_review_approve_exam", { p_exam_id: examId, p_note: note.trim(), p_seen: info.impressao });
      setState({ busy: false, error: null });
      setNote("");
      onDone?.(`${r.aprovadas} ${r.aprovadas === 1 ? "comentário aprovado" : "comentários aprovados"}: o aluno já pode ver.`);
      load();
    } catch (error) {
      setState({ busy: false, error: messageOf(error) });
      load();
    }
  };
  const fora = [info.devolvidas ? `${info.devolvidas} devolvida(s)` : null, info.outras_areas ? `${info.outras_areas} de outras áreas` : null].filter(Boolean).join(" e ");
  return (
    <section aria-label="Aprovar a prova inteira" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 16, border: "1px solid var(--border-default)", background: "var(--surface-sunken)" }}>
      <b>{`Aprovar a prova inteira: ${info.aprovaveis} ${info.aprovaveis === 1 ? "comentário" : "comentários"}`}</b>
      <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        {`${info.title ?? ""}. Ao aprovar, o aluno passa a ver as explicações dessas questões. Fica no Registro de ações com o seu nome.`}
        {fora ? ` Ficam de fora: ${fora}.` : ""}
        {info.notas ? ` As ${info.notas} nota(s) “O que mudou desde a prova” não entram: aprove cada uma na questão.` : ""}
      </div>
      <TextArea label="O que você conferiu nesta prova" rows={3} maxLength={900} value={note} onChange={setNote} hint={`Pelo menos ${NOTE_MIN} letras.`} />
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div>
        <Button size="sm" onClick={submit} loading={state.busy} disabled={note.trim().length < NOTE_MIN}>
          {`Aprovar ${info.aprovaveis} ${info.aprovaveis === 1 ? "comentário" : "comentários"} desta prova`}
        </Button>
      </div>
    </section>
  );
}
// Só a devolução que ainda vale (a da marca atual). A nota de uma APROVAÇÃO anterior nunca aparece como devolução, nem a de uma
// devolução já atendida (quando o editor muda o texto de novo, a marca nova nasce sem devolução).
const returnedText = (question) => {
  const note = question.comment_review?.devolvido?.nota;
  if (!note) return null;
  const decision = question.comment_decision;
  const by = decision?.decision === "return" && decision.note === note ? decision.by : null;
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
  // se o formulário mudou DEPOIS de abrir o painel, o erro que chega não pode trazer a questão do banco por cima do que a pessoa digitou
  const unsavedRef = React.useRef(unsaved);
  unsavedRef.current = unsaved;
  if (!review) return null;
  const canDecide = Boolean(question.comment_can_review);
  const returned = returnedText(question);

  const submit = async (decision, note) => {
    // o texto que a tela mostra agora é o enviado; com mudança não salva a decisão nem sai (o painel fica travado)
    if (unsavedRef.current) return;
    setState({ busy: true, error: null });
    try {
      const fresh = await backend.rpc("app_admin_question_comment_decide", {
        p_question_id: question.id, p_decision: decision, p_note: note, p_seen_texts: commentTexts(question),
      });
      setState({ busy: false, error: null });
      setPanel(null);
      onDecided(decision, fresh);
    } catch (error) {
      const text = messageOf(error);
      setState({ busy: false, error: text });
      // só a recusa "o texto mudou" pede a questão de agora; e nunca por cima de mudança que a pessoa ainda não salvou
      if (/mudou enquanto você revisava/i.test(text) && !unsavedRef.current) onStale?.();
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
      {canDecide && panel && <DecisionPanel key={panel} initialMode={panel} busy={state.busy} error={state.error} locked={unsaved} onSubmit={submit} onCancel={() => (setPanel(null), setState({ busy: false, error: null }))} />}
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
          <QuestionFigures images={q.images} questionId={q.id} />
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
      <LoadNotes carga={q.comment_review?.carga} />
      <UpdateNoteCard questionId={q.id} />
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
        <Banner tone="success" title="Comentário sem revisão pendente">
          O comentário desta questão já foi decidido.
        </Banner>
      )}
    </div>
  );
}

const QUEUE_PAGE = 50;

/** A fila do revisor médico: os comentários das questões das áreas dele, os mais antigos primeiro, em páginas de 50. */
export function CommentReviewQueue({ onBack } = {}) {
  const { backend } = useSession();
  const [openId, setOpenId] = React.useState(null);
  const [note, setNote] = React.useState(null);
  // escolha da prova (para ver só uma e aprovar a prova inteira); sem a atualização do banco, a escolha nem aparece
  const [exams, setExams] = React.useState(null);
  const [examId, setExamId] = React.useState("");
  const [examKey, setExamKey] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    backend.rpc("app_admin_comment_review_exams", {}).then((l) => alive && setExams(Array.isArray(l) ? l : null), () => alive && setExams(null));
    return () => {
      alive = false;
    };
  }, [backend, examKey]);
  const [queue, setQueue] = React.useState({ items: [], total: 0, loading: true, error: null, loaded: false });
  const load = React.useCallback(
    async (offset) => {
      setQueue((s) => ({ ...s, loading: true, error: null }));
      try {
        const page = await backend.rpc("app_admin_comment_review_queue", { p_filters: examId ? { exam_id: examId } : {}, p_limit: QUEUE_PAGE, p_offset: offset });
        setQueue((s) => ({
          items: offset === 0 ? page.items : s.items.concat(page.items.filter((i) => !s.items.some((x) => x.id === i.id))),
          total: page.total ?? page.items.length,
          loading: false,
          error: null,
          loaded: true,
        }));
      } catch (error) {
        setQueue((s) => ({ ...s, loading: false, error }));
      }
    },
    [backend, examId]
  );
  React.useEffect(() => {
    load(0);
  }, [load]);
  const list = { data: queue.loaded ? queue : null, error: queue.error, reload: () => load(0) };
  if (openId) {
    return (
      <CommentReviewDetail
        id={openId}
        onBack={() => (setOpenId(null), list.reload())}
        onDone={(message) => {
          setOpenId(null);
          setNote(message);
          list.reload();
          setExamKey((k) => k + 1);
        }}
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {onBack && (
        <div>
          <Button variant="ghost" size="sm" icon="arrow-left" onClick={onBack}>
            Voltar à lista de questões
          </Button>
        </div>
      )}
      <div>
        <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Comentários a revisar</h3>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>
          Questões das suas áreas com explicação, conduta esperada ou “o que a questão avalia” novos ou alterados. O aluno só vê o texto depois da sua aprovação.
        </p>
      </div>
      {exams && exams.length > 0 && (
        <SelectField
          label="Prova"
          value={examId}
          onChange={(e) => (setNote(null), setExamId(e.target.value))}
          options={[{ value: "", label: "Todas as provas" }, ...exams.map((e) => ({ value: e.id, label: `${e.title} (${e.pendentes} em revisão${e.notas ? `, ${e.notas} nota(s)` : ""})` }))]}
        />
      )}
      {examId && <ExamApproval key={`${examId}-${examKey}`} examId={examId} onDone={(message) => (setNote(message), list.reload(), setExamKey((k) => k + 1))} />}
      {note && (
        <div role="status" style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>
          {note}
        </div>
      )}
      {list.error && <LoadError error={list.error} retry={() => load(queue.items.length)} />}
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
                    {item.ia && !item.from_load && (
                      <Badge size="sm" icon="sparkles">
                        Sugerido pelo assistente
                      </Badge>
                    )}
                    {item.from_load && <Badge size="sm">Carga das explicações</Badge>}
                    {item.note_pending && (
                      <Badge tone="warning" size="sm">
                        {item.note_returned ? "Nota devolvida" : "Nota a aprovar"}
                      </Badge>
                    )}
                  </div>
                  <span style={{ font: "600 15px var(--font-sans)", color: "var(--text-primary)" }}>{item.topic}</span>
                  <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{[commentFieldsText(item.campos ?? []), item.note_pending ? "Nota “O que mudou desde a prova”" : null].filter(Boolean).join(", ")}</span>
                </div>
                <Icon name="chevron-right" size={18} style={{ color: "var(--text-tertiary)", flex: "none", alignSelf: "center" }} />
              </ListRow>
            ))}
          </div>
        ))}
      {queue.loaded && queue.items.length < queue.total && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{`Mostrando ${queue.items.length} de ${queue.total} comentários.`}</span>
          <Button variant="secondary" onClick={() => load(queue.items.length)} loading={queue.loading}>
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  );
}
