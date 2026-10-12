// Análises de questões históricas (SQIE): o revisor médico confere a análise de cada alternativa e decide.
// O gabarito oficial é histórico e não muda aqui; a IA nunca publica: o aluno só vê o que um revisor aprovar.
import React from "react";
import { Badge, Banner, Button, EmptyState, SegmentedControl, SelectField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, TextArea, useLoad } from "../common.jsx";
import { AREA_LABEL } from "./labels.js";
import { SearchSourcesButton, OPEN_CONTEXT } from "../assistant/SearchSourcesButton.jsx";
import { UpdateQueue } from "./UpdateQueue.jsx";
import { UpdatedQuestions } from "./UpdatedQuestions.jsx";
import { Label, Pre, Section, useAction, when } from "./ui.jsx";

const PAGE = 15;
const STATUS = { ai_draft: ["Rascunho de IA", "neutral"], checked: ["Conferida por regras", "info"], reviewed: ["Revisada", "success"], published: ["Publicada ao aluno", "success"], rejected: ["Recusada", "danger"] };
const VERDICT = { pass: ["sem problemas", "success"], issues: ["com apontamentos", "warning"], fail: ["reprovada", "danger"], inconclusive: ["não foi possível conferir", "neutral"] };
const SEVERITY = { critical: ["crítico", "danger"], major: ["importante", "warning"], minor: ["menor", "neutral"], info: ["informação", "info"] };
const ROLE = { CRITICAL: ["crítico", "danger"], SUPPORTIVE: ["apoio", "info"], NEUTRAL: ["neutro", "neutral"], DISTRACTOR_INFORMATION: ["distrai", "warning"] };
const KIND = { CORRECT: "Correta (gabarito oficial)", WRONG: "Errada", TRUE_BUT_NOT_BEST: "Verdadeira, mas não é a melhor" };
const TEMPORAL = {
  REQUIRES_MEDICAL_REVIEW: "Atualidade não conferida",
  CURRENT: "Atual",
  UPDATED_BUT_SAME_ANSWER: "Atualizada, mesmo gabarito",
  PARTIALLY_OUTDATED: "Parcialmente desatualizada",
  OUTDATED_EXPLANATION: "Explicação desatualizada",
  OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT: "Gabarito oficial difere da conduta atual",
  NO_CURRENT_VALID_OPTION: "Nenhuma alternativa válida hoje",
  CURRENTLY_AMBIGUOUS: "Ambígua hoje",
  MAJOR_GUIDELINE_CHANGE: "Mudança importante de diretriz",
};

export function QuestionAnalyses({ reviewerAreas }) {
  const { backend } = useSession();
  const [status, setStatus] = React.useState("checked");
  const [exam, setExam] = React.useState("");
  const [page, setPage] = React.useState(0);
  const { data, error, reload } = useLoad(() => backend.rpc("app_question_analyses", { p_status: status || null, p_exam: exam || null, p_limit: PAGE, p_offset: page * PAGE }), [backend, status, exam, page]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const pages = Math.max(Math.ceil(data.total / PAGE), 1);
  const s = data.summary;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Banner tone="info" icon="shield-check" title="Gabarito oficial preservado">
        O gabarito de cada prova é registro histórico e não é alterado aqui. A análise explica as quatro alternativas e só chega ao aluno depois que um revisor médico da área a aprova. "Atualidade" depende de fonte oficial vigente conferida por pessoa e fica como "não conferida" até existir acervo.
      </Banner>
      <UpdateAlerts />
      <UpdateQueue reviewerAreas={reviewerAreas} />
      <UpdatedQuestions />
      <Section title="Andamento">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge>{s.analyzed} de {s.questions} questões analisadas</Badge>
          {Object.entries(s.by_status).map(([k, n]) => (
            <Badge key={k} tone={STATUS[k]?.[1]}>
              {STATUS[k]?.[0] ?? k}: {n}
            </Badge>
          ))}
        </div>
        {reviewerAreas.length > 0 && <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 8 }}>Você decide nas áreas: {reviewerAreas.map((a) => AREA_LABEL[a] ?? a).join(", ")}.</div>}
      </Section>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <SegmentedControl label="Situação" value={status} onChange={(v) => (setStatus(v), setPage(0))} options={[{ value: "checked", label: "Para revisar" }, { value: "ai_draft", label: "Rascunhos" }, { value: "published", label: "Publicadas" }, { value: "rejected", label: "Recusadas" }, { value: "", label: "Todas" }]} />
        <div style={{ width: 240 }}>
          <SelectField aria-label="Prova" value={exam} onChange={(e) => (setExam(e.target.value), setPage(0))} options={[{ value: "", label: "Todas as provas" }, ...data.exams.map((e) => ({ value: e.id, label: e.title }))]} />
        </div>
      </div>
      <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{data.total} análises</div>
      {data.items.length === 0 && <EmptyState icon="file-question" title="Nenhuma análise aqui" description="As análises são geradas pelo comando de análise de questões, com autorização de envio do texto ao provedor de IA." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.items.map((a) => (
          <Analysis key={a.analysis_id} item={a} onChanged={reload} />
        ))}
      </div>
      {pages > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
          <span style={{ font: "var(--type-label)" }}>{page + 1}/{pages}</span>
          <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      )}
    </div>
  );
}

const IMPACT = { UNDETERMINED: "impacto a definir", NO_IMPACT: "trecho igual: confirmar a nova versão", COMMENT_ONLY: "só o comentário", RATIONALE_CHANGED: "justificativa mudou", DISTRACTOR_CHANGED: "distrator mudou", CURRENT_ANSWER_CHANGED: "resposta atual mudou", NO_VALID_ALTERNATIVE: "nenhuma alternativa válida hoje", MAJOR_CHANGE: "mudança importante" };
const TRIAGE = { UNCHANGED: "trecho idêntico", EDITORIAL: "só a forma", MINOR_WORDING: "redação", NUMERIC: "número mudou", NEGATION: "negação mudou", SUBSTANTIVE: "trecho reescrito", REMOVED: "trecho removido", NOT_LOCATED: "evidência não localizada" };
const VERDICT_EV = { compatible: ["compatível", "success"], outdated: ["desatualizada", "danger"], conflicting: ["conflitante", "danger"], insufficient: ["insuficiente", "warning"], context_dependent: ["depende de contexto", "warning"] };

/** Alertas (item 88): questões impactadas por mudança de fonte e a cobertura de evidência oficial. */
function UpdateAlerts() {
  const { backend } = useSession();
  const { data } = useLoad(() => backend.rpc("app_question_update_summary"), [backend]);
  if (!data) return null;
  const pending = Object.entries(data.by_impact);
  return (
    <Section title="Atualização de diretrizes">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Badge>{data.questions_with_claims} questões ligadas a afirmações</Badge>
        <Badge tone={data.claims_with_official_evidence ? "success" : "warning"}>{data.claims_with_official_evidence} de {data.claims} afirmações com evidência oficial conferida</Badge>
        {pending.length === 0 && <Badge tone="neutral">nenhuma questão impactada por mudança de fonte</Badge>}
        {pending.map(([k, n]) => (
          <Badge key={k} tone={k === "NO_IMPACT" ? "neutral" : k === "COMMENT_ONLY" ? "warning" : "danger"}>{n} questão(ões): {IMPACT[k] ?? k}</Badge>
        ))}
        {data.critical_open > 0 && <Badge tone="danger">{data.critical_open} com mudança crítica (número, negação ou trecho removido)</Badge>}
        {data.with_proposal > 0 && <Badge tone="info">{data.with_proposal} com proposta da IA aguardando decisão</Badge>}
        {data.cards_published > 0 && <Badge tone="success">{data.cards_published} cartão(ões) de atualização publicado(s)</Badge>}
        {data.with_content_diff > 0 && <Badge tone="info">{data.with_content_diff} já triadas pela comparação de conteúdo</Badge>}
      </div>
      {data.claims_with_official_evidence === 0 && (
        <p style={{ margin: "8px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Sem fonte oficial cadastrada e conferida, o sistema não consegue dizer se uma conduta mudou desde a prova. Cadastre o documento completo na aba "Fontes oficiais".</p>
      )}
      {data.claims_with_official_evidence === 0 && <SearchSourcesButton tab="analises" context={OPEN_CONTEXT} />}
    </Section>
  );
}

/** Afirmações que a questão exige, com a evidência e a fonte de cada uma (QUESTÃO → AFIRMAÇÃO → EVIDÊNCIA → FONTE). */
function Knowledge({ questionId }) {
  const { backend } = useSession();
  const { data, error } = useLoad(() => backend.rpc("app_question_knowledge", { p_question_id: questionId }), [backend, questionId]);
  if (error) return null;
  if (!data) return <Loading />;
  return (
    <>
      <Label>Afirmações que a questão exige e suas fontes</Label>
      {data.claims.length === 0 && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>nenhuma afirmação ligada</span>}
      {data.claims.map((c) => (
        <div key={c.claim_id} style={{ borderTop: "1px solid var(--border-subtle)", padding: "6px 0" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <Badge size="sm" tone={c.status === "compatible" ? "success" : c.status === "needs_review" ? "danger" : "neutral"}>{c.status === "extracted" ? "sem evidência" : c.status === "compatible" ? "compatível" : c.status === "needs_review" ? "fonte mudou: rever" : c.status}</Badge>
            {c.shared_with > 0 && <Badge size="sm">compartilhada com mais {c.shared_with} questão(ões)</Badge>}
          </div>
          <div style={{ font: "var(--type-body-sm)", marginTop: 4 }}>{c.statement}</div>
          {c.evidence.map((e, i) => (
            <div key={i} style={{ font: "var(--type-caption)", color: "var(--text-secondary)", paddingLeft: 12, marginTop: 2, opacity: e.stale ? 0.6 : 1 }}>
              <Badge size="sm" tone={VERDICT_EV[e.verdict]?.[1]}>{VERDICT_EV[e.verdict]?.[0] ?? e.verdict}</Badge> <Badge size="sm" tone={e.official ? "info" : "warning"}>{e.official ? `nível ${e.authority_level}` : "não oficial"}</Badge>
              {e.stale && <Badge size="sm" tone="warning">fonte substituída</Badge>} {e.source} · {e.organ}{e.version ? ` · versão ${e.version}` : ""}{e.page != null ? ` · p. ${e.page}` : ""}
            </div>
          ))}
        </div>
      ))}
      {data.updates.length > 0 && (
        <>
          <Label>Atualizações detectadas</Label>
          {data.updates.map((u) => (
            <div key={u.id} style={{ font: "var(--type-body-sm)" }}>
              <Badge size="sm" tone={u.impact_level === "NO_IMPACT" ? "neutral" : "danger"}>{IMPACT[u.impact_level] ?? u.impact_level}</Badge> {u.critical && <Badge size="sm" tone="danger">crítico</Badge>} {u.triage_kind && <Badge size="sm">{TRIAGE[u.triage_kind] ?? u.triage_kind}</Badge>} {when(u.detected_at)} · {u.reason}
            </div>
          ))}
        </>
      )}
    </>
  );
}

/** Como os alunos responderam cada alternativa (só com 5+ alunos): mostra qual distrator mais atrai. */
function DistractorStats({ questionId }) {
  const { backend } = useSession();
  const { data } = useLoad(() => backend.rpc("app_distractor_stats", { p_question_id: questionId }), [backend, questionId]);
  if (!data) return null;
  return (
    <>
      <Label>Como os alunos responderam</Label>
      {!data.enough ? (
        <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{data.students} aluno(s) responderam: são precisos pelo menos 5 para mostrar a distribuição.</span>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {data.options.map((o) => (
            <Badge key={o.option_id} size="sm" tone={o.correct ? "success" : "neutral"}>{o.option_id}: {Math.round(o.share * 100)}% ({o.count})</Badge>
          ))}
          <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{data.students} alunos</span>
        </div>
      )}
    </>
  );
}

function Analysis({ item: a, onChanged }) {
  const { backend } = useSession();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const act = useAction();
  const [label, tone] = STATUS[a.status] ?? [a.status, "neutral"];
  const worst = (a.checks ?? []).find((c) => c.verdict === "fail") ?? (a.checks ?? []).find((c) => c.verdict === "issues");
  const decide = (decision, done) => act.run(() => backend.rpc("app_question_analysis_decide", { p_analysis_id: a.analysis_id, p_decision: decision, p_note: note || null }), done).then((r) => r && onChanged());
  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 12 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ all: "unset", cursor: "pointer", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", width: "100%" }}>
        <Badge size="sm" tone={tone}>{label}</Badge>
        <Badge size="sm" tone="brand">{AREA_LABEL[a.area] ?? a.area}</Badge>
        <Badge size="sm">{a.code}</Badge>
        <Badge size="sm">gabarito oficial: {a.official_answer ?? "—"}</Badge>
        {a.difficulty && <Badge size="sm">dificuldade {a.difficulty}/5</Badge>}
        {worst && <Badge size="sm" tone={VERDICT[worst.verdict][1]}>{VERDICT[worst.verdict][0]}</Badge>}
        {a.stale && <Badge size="sm" tone="danger">a questão mudou depois da análise</Badge>}
        <strong style={{ flexBasis: "100%", font: "var(--type-body-sm)" }}>{a.question_core}</strong>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <Label>Enunciado</Label>
          <Pre>{a.statement}</Pre>
          {a.images?.length > 0 && <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 4 }}>Esta questão tem {a.images.length} figura(s).</div>}
          <Label>Alternativas (gabarito oficial {a.official_answer}, {a.official_status === "FINAL" ? "definitivo" : a.official_status})</Label>
          {(a.question_options ?? []).map((o) => (
            <div key={o.id} style={{ margin: "4px 0", fontWeight: o.id === a.official_answer ? 700 : 400 }}>
              {o.id}) {o.text}
            </div>
          ))}
          <Label>Dados-chave</Label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(a.key_data ?? []).map((k, i) => (
              <Badge key={i} size="sm" tone={ROLE[k.role]?.[1]}>
                {k.text} · {ROLE[k.role]?.[0] ?? k.role}
              </Badge>
            ))}
          </div>
          <Label>Análise de cada alternativa</Label>
          {(a.options ?? []).map((o) => (
            <div key={o.option_id} style={{ borderTop: "1px solid var(--border-subtle)", padding: "8px 0" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <strong>{o.option_id}</strong>
                <Badge size="sm" tone={o.distractor_kind === "CORRECT" ? "success" : o.distractor_kind === "TRUE_BUT_NOT_BEST" ? "warning" : "neutral"}>{KIND[o.distractor_kind]}</Badge>
                {(o.error_types ?? []).map((t) => (
                  <Badge key={t} size="sm" tone="warning">{t}</Badge>
                ))}
                {o.quality != null && <Badge size="sm">qualidade do distrator {o.quality}/4</Badge>}
              </div>
              <div style={{ font: "var(--type-body-sm)", marginTop: 4 }}>{o.reasoning}</div>
              {o.why_plausible && <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}><em>Por que parece plausível:</em> {o.why_plausible}</div>}
              {o.why_wrong && <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}><em>Por que está errada:</em> {o.why_wrong}</div>}
              {o.when_correct && <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}><em>Quando estaria correta:</em> {o.when_correct}</div>}
              {o.concept_difference && <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}><em>O que a diferencia:</em> {o.concept_difference}</div>}
            </div>
          ))}
          <Label>Armadilha e regra para lembrar</Label>
          <Pre>{a.trap}</Pre>
          <Pre tone="brand">{a.golden_rule}</Pre>
          <Knowledge questionId={a.question_id} />
          <DistractorStats questionId={a.question_id} />
          <Label>Atualidade</Label>
          <Badge size="sm" tone="warning">{TEMPORAL[a.temporal_status] ?? a.temporal_status}</Badge>
          <Label>Conferências</Label>
          {(a.checks ?? []).length === 0 && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>ainda não conferida</span>}
          {(a.checks ?? []).map((c) => (
            <div key={c.layer} style={{ margin: "4px 0 8px" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ font: "var(--type-body-sm)" }}>{c.layer === "software" ? "Regras (sem IA)" : "Conferente independente"}</strong>
                <Badge size="sm" tone={VERDICT[c.verdict]?.[1]}>{VERDICT[c.verdict]?.[0]}</Badge>
              </div>
              {c.findings.map((f, i) => (
                <div key={i} style={{ font: "var(--type-body-sm)", paddingLeft: 12, marginTop: 2 }}>
                  <Badge size="sm" tone={SEVERITY[f.severity]?.[1]}>{SEVERITY[f.severity]?.[0]}</Badge> {f.where ? <em>{f.where}: </em> : null}{f.detail}
                </div>
              ))}
            </div>
          ))}
          <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 8 }}>
            Análise v{a.version} de {a.analysis_date} · modelo {a.model ?? "—"}{a.reviewed_at ? ` · revisada em ${when(a.reviewed_at)}` : ""}
          </div>
          {a.review_note && <Pre>{a.review_note}</Pre>}
          {["checked", "ai_draft"].includes(a.status) &&
            (a.can_review ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                <TextArea label="Observação (obrigatória para recusar)" value={note} onChange={setNote} rows={2} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button size="sm" icon="stamp" disabled={a.stale} loading={act.busy} onClick={() => decide("approved", "Aprovada e publicada ao aluno.")}>Aprovar e publicar</Button>
                  <Button size="sm" variant="secondary" icon="x" disabled={!note.trim()} loading={act.busy} onClick={() => decide("rejected", "Análise recusada.")}>Recusar</Button>
                </div>
              </div>
            ) : (
              <p style={{ margin: "10px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>A decisão é de um revisor médico cadastrado em {AREA_LABEL[a.area] ?? a.area}.</p>
            ))}
          {act.feedback}
        </div>
      )}
    </div>
  );
}
