// Questões inéditas StaziaMed geradas pelo motor: rascunhos aguardando revisão médica.
// Ficam fora do banco de questões do aluno. Só um revisor médico cadastrado na área decide;
// a revisão automática (IA) aparece como apontamento e nunca como aprovação.
import React from "react";
import { Badge, Banner, Button, EmptyState, SegmentedControl, SelectField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, TextArea, useLoad } from "../common.jsx";
import { AREA_LABEL } from "./labels.js";
import { Label, Pre, Section, useAction, when } from "./ui.jsx";

const PAGE = 20;
const STATUS = {
  awaiting_medical_review: ["Aguardando revisão médica", "warning"],
  approved: ["Aprovada pelo revisor", "success"],
  needs_changes: ["Ajustes pedidos", "info"],
  rejected: ["Recusada", "danger"],
};
const batchName = (b) => b.replace(/^simulado_preditivo_(\d{4})_(\d)_(\d+)$/, "Lote $3 · $1/$2");
const REVIEW_VERDICT = { APPROVED: "sem problemas apontados", REVISION_REQUIRED: "pede revisão", REJECTED: "recusa" };

export function DraftQuestions({ reviewerAreas }) {
  const { backend } = useSession();
  const [batch, setBatch] = React.useState("");
  const [status, setStatus] = React.useState("awaiting_medical_review");
  const [area, setArea] = React.useState("");
  const [page, setPage] = React.useState(0);
  const { data, error, reload } = useLoad(
    () => backend.rpc("app_draft_questions", { p_batch: batch || null, p_status: status || null, p_area: area || null, p_limit: PAGE, p_offset: page * PAGE }),
    [backend, batch, status, area, page]
  );
  const set = (fn) => (v) => (setPage(0), fn(v));
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const pages = Math.max(Math.ceil(data.total / PAGE), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Banner tone="info" icon="shield-check" title="Questões StaziaMed, não oficiais do Inep">
        Rascunhos gerados pelo motor a partir do perfil das provas oficiais. Nenhum está no banco de treino: só entram depois da revisão médica. A "revisão automática" abaixo é apontamento de IA e não vale como aprovação.
      </Banner>
      <Section title="Lotes">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.batches.map((b) => (
            <Badge key={b.batch} tone="neutral">
              {batchName(b.batch)}: {b.awaiting} aguardando · {b.approved} aprovadas · {b.needs_changes} com ajustes · {b.rejected} recusadas (de {b.total})
            </Badge>
          ))}
        </div>
      </Section>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <SegmentedControl
          label="Situação"
          value={status}
          onChange={set(setStatus)}
          options={[{ value: "awaiting_medical_review", label: "Aguardando" }, { value: "needs_changes", label: "Ajustes" }, { value: "approved", label: "Aprovadas" }, { value: "rejected", label: "Recusadas" }, { value: "", label: "Todas" }]}
        />
        <div style={{ width: 200 }}>
          <SelectField aria-label="Lote" value={batch} onChange={(e) => set(setBatch)(e.target.value)} options={[{ value: "", label: "Todos os lotes" }, ...data.batches.map((b) => ({ value: b.batch, label: batchName(b.batch) }))]} />
        </div>
        <div style={{ width: 220 }}>
          <SelectField aria-label="Área" value={area} onChange={(e) => set(setArea)(e.target.value)} options={[{ value: "", label: "Todas as áreas" }, ...Object.entries(AREA_LABEL).filter(([c]) => ["CLINICA_MEDICA", "CIRURGIA", "GINECOLOGIA_OBSTETRICIA", "PEDIATRIA", "MFC"].includes(c)).map(([value, label]) => ({ value, label }))]} />
        </div>
      </div>
      {reviewerAreas.length > 0 && <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Você pode decidir nas áreas: {reviewerAreas.map((a) => AREA_LABEL[a] ?? a).join(", ")}.</div>}
      <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{data.total} questões</div>
      {data.items.length === 0 && <EmptyState icon="file-question" title="Nenhuma questão aqui" description="Mude os filtros acima." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.items.map((d) => (
          <Draft key={d.id} item={d} onChanged={reload} />
        ))}
      </div>
      {pages > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span style={{ font: "var(--type-label)" }}>
            {page + 1}/{pages}
          </span>
          <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}

function Draft({ item: d, onChanged }) {
  const { backend } = useSession();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const act = useAction();
  const [label, tone] = STATUS[d.status];
  const ai = d.ai_review;
  const issues = [...(ai?.medical?.critical_issues ?? []), ...(ai?.pedagogical?.critical_issues ?? [])];
  const decide = (decision, done) => act.run(() => backend.rpc("app_draft_question_decide", { p_id: d.id, p_decision: decision, p_note: note || null }), done).then((r) => r && onChanged());
  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 12 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ all: "unset", cursor: "pointer", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", width: "100%" }}>
        <Badge size="sm" tone={tone}>{label}</Badge>
        <Badge size="sm" tone="brand">{AREA_LABEL[d.area] ?? d.area}</Badge>
        <Badge size="sm">{batchName(d.batch)} · nº {d.slot}</Badge>
        {d.similarity_to_official >= 50 && <Badge size="sm" tone="warning">semelhança com questão oficial: {d.similarity_to_official}%</Badge>}
        {d.review_outdated && <Badge size="sm" tone="danger">texto mudou depois da revisão</Badge>}
        <strong style={{ flexBasis: "100%", font: "var(--type-body-sm)" }}>{d.title ?? d.stem.slice(0, 90)}</strong>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <Label>Enunciado</Label>
          <Pre>{d.stem}</Pre>
          <Label>Alternativas (resposta do rascunho: {d.correct_answer})</Label>
          {Object.entries(d.alternatives).map(([id, text]) => (
            <div key={id} style={{ margin: "6px 0", fontWeight: id === d.correct_answer ? 700 : 400 }}>
              {id}) {text}
              <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", fontWeight: 400 }}>{d.alternative_explanations?.[id]}</div>
            </div>
          ))}
          {d.explanation && (
            <>
              <Label>Comentário do professor</Label>
              <Pre>{d.explanation}</Pre>
            </>
          )}
          {d.update_application && (
            <>
              <Label>Atualização aplicada</Label>
              <Pre>{d.update_application}</Pre>
            </>
          )}
          {d.source_citations?.length > 0 && (
            <>
              <Label>Fontes citadas pelo gerador (conferir o documento original)</Label>
              <ul style={{ margin: 0, paddingLeft: 18, font: "var(--type-body-sm)" }}>
                {d.source_citations.map((c, i) => (
                  <li key={i}>
                    {c.source_file}: {c.supported_claim}
                  </li>
                ))}
              </ul>
            </>
          )}
          <Label>Revisão automática (IA) — apontamento, não aprovação</Label>
          {!ai && <p style={{ margin: 0, color: "var(--text-tertiary)", font: "var(--type-body-sm)" }}>Sem revisão automática neste lote.</p>}
          {ai && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, font: "var(--type-body-sm)" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Badge size="sm" tone="ai">médica: {REVIEW_VERDICT[ai.medical?.verdict] ?? ai.medical?.verdict ?? "—"}</Badge>
                <Badge size="sm" tone="ai">pedagógica: {REVIEW_VERDICT[ai.pedagogical?.verdict] ?? ai.pedagogical?.verdict ?? "—"}</Badge>
                {ai.model && <Badge size="sm">{ai.model}</Badge>}
              </div>
              {issues.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {issues.map((x, i) => (
                    <li key={i}>{typeof x === "string" ? x : JSON.stringify(x)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {d.reviewed_at && (
            <p style={{ margin: "10px 0 0", font: "var(--type-body-sm)" }}>
              Decisão de {d.reviewer} em {when(d.reviewed_at)}
              {d.review_note ? `: ${d.review_note}` : "."}
            </p>
          )}
          {d.can_review ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              <TextArea label="Observação (obrigatória para pedir ajustes ou recusar)" value={note} onChange={setNote} rows={2} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button size="sm" icon="stamp" loading={act.busy} onClick={() => decide("approved", "Aprovação registrada.")}>
                  Aprovar
                </Button>
                <Button size="sm" variant="secondary" icon="pencil" loading={act.busy} disabled={!note.trim()} onClick={() => decide("needs_changes", "Ajustes pedidos.")}>
                  Pedir ajustes
                </Button>
                <Button size="sm" variant="secondary" icon="x" loading={act.busy} disabled={!note.trim()} onClick={() => decide("rejected", "Recusada.")}>
                  Recusar
                </Button>
              </div>
            </div>
          ) : (
            <p style={{ margin: "10px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>A decisão é de um revisor médico cadastrado em {AREA_LABEL[d.area] ?? d.area}.</p>
          )}
          {act.feedback}
        </div>
      )}
    </div>
  );
}
