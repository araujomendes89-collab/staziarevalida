// Fila de atualizações (SQIE fase 4): a fonte oficial mudou e a questão precisa de decisão do revisor médico da área.
// A IA só PROPÕE. Publicar exige evidência oficial vigente conferida por PESSOA na nova versão da fonte.
import React from "react";
import { Badge, Banner, Button, EmptyState, SegmentedControl, SelectField, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, TextArea, useLoad } from "../common.jsx";
import { AREA_LABEL, DIFF_KIND } from "./labels.js";
import { Label, Pre, Section, StatusBadge, useAction, when } from "./ui.jsx";

const TEMPORAL = {
  UPDATED_BUT_SAME_ANSWER: "Atualizada, mesma resposta",
  PARTIALLY_OUTDATED: "Parcialmente desatualizada",
  OUTDATED_EXPLANATION: "Explicação desatualizada",
  OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT: "Gabarito oficial difere da conduta atual",
  NO_CURRENT_VALID_OPTION: "Nenhuma alternativa válida hoje",
  CURRENTLY_AMBIGUOUS: "Ambígua hoje",
  MAJOR_GUIDELINE_CHANGE: "Mudança importante de diretriz",
};
const IMPACT = {
  COMMENT_ONLY: "só o comentário",
  RATIONALE_CHANGED: "justificativa mudou",
  DISTRACTOR_CHANGED: "distrator mudou",
  CURRENT_ANSWER_CHANGED: "resposta atual mudou",
  NO_VALID_ALTERNATIVE: "nenhuma alternativa válida hoje",
  MAJOR_CHANGE: "mudança importante",
};
const VERDICT = { pass: ["sem problemas", "success"], issues: ["com apontamentos", "warning"], fail: ["reprovada pelo software", "danger"] };
const STATUS = { review_required: "Para decidir", queued: "Aguardando reanálise", reviewed: "Decididas" };

export function UpdateQueue({ reviewerAreas }) {
  const { backend } = useSession();
  const [status, setStatus] = React.useState("review_required");
  const { data, error, reload } = useLoad(() => backend.rpc("app_question_updates_queue", { p_status: status, p_limit: 30, p_offset: 0 }), [backend, status]);
  return (
    <Section title="Fila de atualizações">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Banner tone="info" icon="shield-check">
          O gabarito oficial da prova não muda. A IA só propõe; o cartão que o aluno vê nasce da sua decisão, e só com evidência oficial vigente conferida por pessoa na nova versão da fonte.
          {reviewerAreas.length > 0 ? ` Você decide nas áreas: ${reviewerAreas.map((a) => AREA_LABEL[a] ?? a).join(", ")}.` : ""}
        </Banner>
        <SegmentedControl label="Situação" value={status} onChange={setStatus} options={Object.entries(STATUS).map(([value, label]) => ({ value, label }))} />
        {error && <LoadError error={error} retry={reload} />}
        {!data && !error && <Loading />}
        {data?.length === 0 && <EmptyState icon="inbox" title="Nada aqui" description="Quando uma fonte oficial mudar, as questões afetadas aparecem nesta fila." />}
        {(data ?? []).map((u) => (
          <UpdateItem key={u.id} item={u} onChanged={reload} canDecide={reviewerAreas.includes(u.area)} />
        ))}
      </div>
    </Section>
  );
}

function UpdateItem({ item: u, onChanged, canDecide }) {
  const { backend } = useSession();
  const [open, setOpen] = React.useState(false);
  const p = u.proposal;
  const [card, setCard] = React.useState({
    temporal_status: p?.assessment && p.assessment !== "INCONCLUSIVE" ? p.assessment : "PARTIALLY_OUTDATED",
    impact_level: p?.impact_level && p.impact_level !== "NO_IMPACT" ? p.impact_level : "RATIONALE_CHANGED",
    current_answer: p?.current_answer ?? "",
    what_changed: p?.what_changed ?? "",
    why_it_matters: p?.why_it_matters ?? "",
    options_affected: p?.options_affected ?? [],
    effective_date: "",
  });
  const [note, setNote] = React.useState("");
  const act = useAction();
  const set = (patch) => setCard((c) => ({ ...c, ...patch }));
  const open_ = u.status !== "reviewed" && u.status !== "dismissed";
  const decide = (decision, done, body) =>
    act.run(() => backend.rpc("app_question_update_decide", { p_update_id: u.id, p_decision: decision, p_note: note, p_card: body ?? null }), done).then((r) => r && onChanged());
  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 12 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ all: "unset", cursor: "pointer", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", width: "100%" }}>
        {u.critical && <Badge size="sm" tone="danger">crítico</Badge>}
        <Badge size="sm" tone="brand">{AREA_LABEL[u.area] ?? u.area}</Badge>
        <Badge size="sm">{u.exam_id} · {u.number}</Badge>
        {u.triage_kind && <StatusBadge map={DIFF_KIND} value={u.triage_kind} />}
        {p && <Badge size="sm" tone="info">proposta{p.simulated ? " (simulação)" : ""}</Badge>}
        {u.proposal_checks && <Badge size="sm" tone={VERDICT[u.proposal_checks.verdict]?.[1]}>{VERDICT[u.proposal_checks.verdict]?.[0]}</Badge>}
        <Badge size="sm" tone={u.evidence_ready ? "success" : "warning"}>{u.evidence_ready ? "evidência da nova versão conferida" : "falta conferir a evidência na nova versão"}</Badge>
        <strong style={{ flexBasis: "100%", font: "var(--type-body-sm)" }}>{u.claim}</strong>
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Gabarito oficial da prova: {u.official_answer ?? "—"} · detectada em {when(u.detected_at)}</div>
          {u.reason && <Pre>{u.reason}</Pre>}
          <Label>Trecho antigo</Label>
          <Pre>{u.old_text ?? "—"}</Pre>
          <Label>Trecho novo</Label>
          <Pre tone="brand">{u.new_text ?? "removido na nova versão"}</Pre>
          {p && (
            <>
              <Label>Proposta da IA (não vale para o aluno)</Label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Badge size="sm">{TEMPORAL[p.assessment] ?? "Inconclusiva"}</Badge>
                {p.current_answer && <Badge size="sm" tone="warning">alternativa atual proposta: {p.current_answer}</Badge>}
                <Badge size="sm">confiança {p.confidence}</Badge>
                {u.proposal_model && <Badge size="sm">{u.proposal_model}</Badge>}
              </div>
              <div style={{ font: "var(--type-body-sm)" }}>{p.what_changed}</div>
              {p.citations?.map((c, i) => (
                <div key={i} style={{ font: "var(--type-caption)", color: "var(--text-secondary)", paddingLeft: 12 }}>
                  <em>{c.ref}:</em> “{c.quote}”
                </div>
              ))}
              {u.proposal_checks?.findings?.map((f, i) => (
                <div key={i} style={{ font: "var(--type-body-sm)", paddingLeft: 12 }}>
                  <Badge size="sm" tone={f.severity === "critical" ? "danger" : f.severity === "major" ? "warning" : "neutral"}>{f.severity}</Badge> {f.detail}
                </div>
              ))}
            </>
          )}
          {u.decision_note && <Pre>{u.decision_note}</Pre>}
          {open_ && canDecide && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
              <Label>Cartão que o aluno verá (você escreve e confirma)</Label>
              <SelectField label="Situação" value={card.temporal_status} onChange={(e) => set({ temporal_status: e.target.value })} options={Object.entries(TEMPORAL).map(([value, label]) => ({ value, label }))} />
              <SelectField label="Impacto" value={card.impact_level} onChange={(e) => set({ impact_level: e.target.value })} options={Object.entries(IMPACT).map(([value, label]) => ({ value, label }))} />
              <SelectField label="Alternativa atual (conferida)" hint="Só preencha se a fonte nova decidir a questão." value={card.current_answer} onChange={(e) => set({ current_answer: e.target.value })} options={[{ value: "", label: "Nenhuma" }, ...["A", "B", "C", "D"].map((x) => ({ value: x, label: x }))]} />
              <TextArea label="O que mudou (para o aluno)" value={card.what_changed} onChange={(v) => set({ what_changed: v })} rows={3} />
              <TextArea label="Por que importa" value={card.why_it_matters} onChange={(v) => set({ why_it_matters: v })} rows={2} />
              <TextField label="Em vigor desde" type="date" value={card.effective_date} onChange={(e) => set({ effective_date: e.target.value })} />
              <TextArea label="O que você conferiu (obrigatório)" value={note} onChange={setNote} rows={2} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button size="sm" icon="stamp" disabled={!u.evidence_ready || card.what_changed.trim().length < 20 || note.trim().length < 10} loading={act.busy} onClick={() => decide("publish_update", "Cartão publicado ao aluno.", { ...card, current_answer: card.current_answer || null, effective_date: card.effective_date || null })}>
                  Publicar cartão de atualização
                </Button>
                <Button size="sm" variant="secondary" icon="check" disabled={!u.evidence_ready || note.trim().length < 10} loading={act.busy} onClick={() => decide("no_change", "Registrado: a conduta continua a mesma.")}>
                  A conduta não mudou
                </Button>
                {p && (
                  <Button size="sm" variant="ghost" icon="x" disabled={note.trim().length < 10} loading={act.busy} onClick={() => decide("reject_proposal", "Proposta descartada; volta para reanálise.")}>
                    Descartar proposta
                  </Button>
                )}
              </div>
              {!u.evidence_ready && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Para publicar ou confirmar, confira antes a evidência de cada afirmação da questão na nova versão da fonte oficial.</span>}
            </div>
          )}
          {open_ && !canDecide && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>A decisão é de um revisor médico cadastrado em {AREA_LABEL[u.area] ?? u.area}.</span>}
          {act.feedback}
        </div>
      )}
    </div>
  );
}
