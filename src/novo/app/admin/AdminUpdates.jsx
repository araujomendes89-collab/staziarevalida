// Administração de Atualizações & Diretrizes: editar (equipe ou revisor da área), conferir no documento oficial
// (só revisor médico cadastrado na área) e publicar para o aluno (só administrador). O banco confere cada papel.
import React from "react";
import { Badge, Banner, Button, Card, SelectField, Switch, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { AREAS, areaLabel } from "../practice/format.js";
import { dateTimeBR, LoadError, Loading, messageOf, TextArea, useLoad } from "./common.jsx";

const REVIEW = { pending: ["Conferência pendente", "warning"], approved: ["Conferida", "success"], rejected: ["Recusada", "danger"] };
const FILTERS = [
  ["todas", "Todas"],
  ["pendentes", "Conferência pendente"],
  ["conferidas", "Conferidas"],
  ["publicadas", "Publicadas"],
  ["app-anterior", "Vindas do app anterior"],
];
const blank = { area: "CLINICA_MEDICA", topic: "", subtopic: "", priority: 2, publication_label: "", institution: "", document_title: "", source_url: "", before_text: "", timeline: [], current_conduct: "", clinical_impact: "", exam_impact: "", trap: "", search_terms: "", position: 0, flashcards: [], practice_questions: [] };
const toForm = (u) => ({ ...blank, ...Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v ?? (typeof blank[k] === "string" ? "" : blank[k])])) });

function LegacyBox({ legacy }) {
  if (!legacy?.original_url && !legacy?.cited_questions?.length) return null;
  return (
    <Banner tone="warning" title="Veio do app anterior: conferir tudo antes de aprovar">
      <div style={{ display: "grid", gap: 6, font: "var(--type-body-sm)" }}>
        {legacy.original_url && (
          <span>
            Link que o app anterior mostrava: <code style={{ overflowWrap: "anywhere" }}>{legacy.original_url}</code>
            {legacy.original_url_check?.http_status ? ` (dava erro ${legacy.original_url_check.http_status} em ${legacy.original_url_check.checked_on.split("-").reverse().join("/")})` : ""}
          </span>
        )}
        {legacy.status_label && <span>O selo "{legacy.status_label}" e a "verificação em {legacy.last_verification_claim}" do app anterior não têm registro de quem conferiu: não valem como conferência.</span>}
        {legacy.cited_questions?.map((c) => (
          <span key={c.exam_code}>
            Questão citada {c.exam_code} ({c.claimed_answer}): {c.matched_question_id ? `no banco oficial ela é sobre "${c.matched_topic}" — a citação não confere.` : "não existe no banco oficial."}
          </span>
        ))}
      </div>
    </Banner>
  );
}

function TimelineEditor({ value, onChange }) {
  const rows = value ?? [];
  const set = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="sm-field__label">O que mudou, por ano</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr auto", gap: 8, alignItems: "start" }}>
          <TextField aria-label="Ano" type="number" min={2000} max={2100} value={r.year ?? ""} onChange={(e) => set(i, { year: e.target.value })} />
          <TextArea label={null} value={r.text ?? ""} rows={2} onChange={(v) => set(i, { text: v })} />
          <Button variant="ghost" size="sm" icon="trash-2" aria-label="Remover ano" onClick={() => onChange(rows.filter((_, k) => k !== i))} />
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" icon="plus" onClick={() => onChange([...rows, { year: new Date().getFullYear(), text: "" }])}>Acrescentar ano</Button>
      </div>
    </div>
  );
}

function FlashcardsEditor({ value, onChange }) {
  const rows = value ?? [];
  const set = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="sm-field__label">Flashcards de fixação</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "start" }}>
          <TextArea label={null} placeholder="Frente" value={r.front ?? ""} rows={2} onChange={(v) => set(i, { front: v })} />
          <TextArea label={null} placeholder="Verso" value={r.back ?? ""} rows={2} onChange={(v) => set(i, { back: v })} />
          <Button variant="ghost" size="sm" icon="trash-2" aria-label="Remover flashcard" onClick={() => onChange(rows.filter((_, k) => k !== i))} />
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" icon="plus" onClick={() => onChange([...rows, { front: "", back: "" }])}>Acrescentar flashcard</Button>
      </div>
    </div>
  );
}

function Editor({ item, onSaved, onClose, isAdmin, reviewAreas }) {
  const { backend } = useSession();
  const [form, setForm] = React.useState(() => (item ? toForm(item) : blank));
  const [questions, setQuestions] = React.useState(() => JSON.stringify(item?.practice_questions ?? [], null, 2));
  const [current, setCurrent] = React.useState(item);
  const [state, setState] = React.useState({ busy: false, error: null, done: null });
  const [note, setNote] = React.useState("");
  const set = (patch) => (setForm((f) => ({ ...f, ...patch })), setState((s) => ({ ...s, done: null })));
  const run = async (label, fn) => {
    setState({ busy: label, error: null, done: null });
    try {
      await fn();
      setState({ busy: false, error: null, done: label });
    } catch (error) {
      setState({ busy: false, error: messageOf(error), done: null });
    }
  };
  const save = (event) => {
    event.preventDefault();
    let practice;
    try {
      practice = JSON.parse(questions || "[]");
    } catch {
      return setState({ busy: false, error: "A questão de treino precisa estar em JSON válido.", done: null });
    }
    run("save", async () => {
      const saved = await backend.rpc("app_admin_save_guideline_update", {
        p_update: { ...form, id: current?.id, priority: Number(form.priority) || 2, position: Number(form.position) || 0, timeline: form.timeline.map((t) => ({ year: Number(t.year), text: t.text })), practice_questions: practice },
      });
      onSaved();
      setCurrent((c) => ({ ...(c ?? {}), ...saved }));
    });
  };
  const review = (decision) => run(decision, async () => {
    const data = await backend.rpc("app_admin_review_guideline_update", { p_id: current.id, p_decision: decision, p_note: note });
    onSaved(data);
    setCurrent(data.items.find((u) => u.id === current.id));
    setNote("");
  });
  const publish = (on) => run("publish", async () => {
    const data = await backend.rpc("app_admin_publish_guideline_update", { p_id: current.id, p_published: on });
    onSaved(data);
    setCurrent(data.items.find((u) => u.id === current.id));
  });
  const remove = () => {
    if (!window.confirm(`Apagar "${current.topic}"?`)) return;
    run("delete", async () => {
      await backend.rpc("app_admin_delete_guideline_update", { p_id: current.id });
      onSaved();
      onClose();
    });
  };
  const canReview = current && (current.can_review ?? reviewAreas.includes(current.area));
  const [label, tone] = REVIEW[current?.review_status] ?? REVIEW.pending;
  return (
    <Card>
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>{current ? "Editar atualização" : "Nova atualização"}</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {current && <Badge tone={tone}>{label}</Badge>}
            {current && <Badge tone={current.published ? "success" : "neutral"}>{current.published ? "Publicada" : "Não publicada"}</Badge>}
            {current && isAdmin && <Button variant="ghost" icon="trash-2" onClick={remove}>Apagar</Button>}
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
          </div>
        </div>
        {state.error && <Banner tone="danger">{state.error}</Banner>}
        {state.done === "save" && current?.review_status === "pending" && current?.review_note && <Banner tone="warning">{current.review_note}</Banner>}
        {state.done === "save" && <Banner tone="success">Atualização salva.</Banner>}
        {current?.origin === "legacy_app" && <LegacyBox legacy={current.legacy} />}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
          <SelectField label="Grande área" value={form.area} onChange={(e) => set({ area: e.target.value })} options={AREAS.map((a) => ({ value: a.id, label: a.label }))} />
          <TextField label="Tema" value={form.topic} maxLength={200} onChange={(e) => set({ topic: e.target.value })} />
          <TextField label="Subtema" value={form.subtopic} maxLength={200} onChange={(e) => set({ subtopic: e.target.value })} />
          <SelectField label="Prioridade" value={String(form.priority)} onChange={(e) => set({ priority: Number(e.target.value) })} options={[{ value: "1", label: "Muito alta" }, { value: "2", label: "Alta" }, { value: "3", label: "Moderada" }, { value: "4", label: "Baixa" }]} />
          <TextField label="Instituição" value={form.institution} maxLength={200} onChange={(e) => set({ institution: e.target.value })} />
          <TextField label="Documento oficial" value={form.document_title} maxLength={300} onChange={(e) => set({ document_title: e.target.value })} />
          <TextField label="Data de publicação (como no documento)" value={form.publication_label} maxLength={80} onChange={(e) => set({ publication_label: e.target.value })} hint="Ex.: 03/2025" />
          <TextField label="Endereço do documento oficial (https)" value={form.source_url} onChange={(e) => set({ source_url: e.target.value })} hint="Obrigatório para a conferência médica." />
          <TextField label="Termos para o treino" value={form.search_terms} maxLength={120} onChange={(e) => set({ search_terms: e.target.value })} hint="Palavras buscadas nas questões oficiais da área (ex.: pré-eclâmpsia)." />
          <TextField label="Posição" type="number" value={form.position} onChange={(e) => set({ position: e.target.value })} />
        </div>
        <TextArea label="Antes (conduta anterior)" value={form.before_text} rows={3} maxLength={4000} onChange={(v) => set({ before_text: v })} />
        <TimelineEditor value={form.timeline} onChange={(timeline) => set({ timeline })} />
        <TextArea label="Conduta vigente" value={form.current_conduct} rows={4} maxLength={4000} onChange={(v) => set({ current_conduct: v })} />
        <TextArea label="Como pode aparecer no Revalida" value={form.exam_impact} rows={3} maxLength={4000} onChange={(v) => set({ exam_impact: v })} />
        <TextArea label="Pegadinha da banca" value={form.trap} rows={2} maxLength={2000} onChange={(v) => set({ trap: v })} />
        <TextArea label="Impacto clínico" value={form.clinical_impact} rows={3} maxLength={4000} onChange={(v) => set({ clinical_impact: v })} />
        <FlashcardsEditor value={form.flashcards} onChange={(flashcards) => set({ flashcards })} />
        <TextArea label="Questão de treino (JSON: statement, options A–D com text e justification, answer, commentary)" value={questions} rows={6} onChange={(v) => setQuestions(v)} />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="submit" loading={state.busy === "save"}>{current ? "Salvar alterações" : "Criar atualização"}</Button>
        </div>
      </form>

      {current && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-subtle)", display: "grid", gap: 16 }}>
          <div>
            <div style={{ font: "var(--type-label)", marginBottom: 6 }}>Conferência médica</div>
            {current.review_status !== "pending" && (
              <p style={{ margin: "0 0 8px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
                {label} {current.reviewer ? `por ${current.reviewer} ` : ""}em {dateTimeBR(current.reviewed_at)}{current.review_note ? `: "${current.review_note}"` : ""}
              </p>
            )}
            {canReview ? (
              <div style={{ display: "grid", gap: 8 }}>
                <TextArea label="O que foi conferido (documento, página, versão)" value={note} rows={2} onChange={(v) => setNote(v)} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button icon="shield-check" loading={state.busy === "approve"} disabled={note.trim().length < 10} onClick={() => review("approve")}>Aprovar: confere com o documento oficial</Button>
                  <Button variant="secondary" icon="x" loading={state.busy === "reject"} disabled={note.trim().length < 10} onClick={() => review("reject")}>Recusar</Button>
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Só um revisor médico cadastrado em {areaLabel(current.area)} confere esta atualização (Central de Conteúdo › Configuração).</p>
            )}
          </div>
          {isAdmin && (
            <div>
              <Switch
                label="Publicada para os alunos"
                description={current.review_status === "approved" ? "Conferida por revisor médico." : "Sem conferência médica: a tela do aluno mostra um aviso."}
                checked={Boolean(current.published)}
                disabled={state.busy === "publish"}
                onChange={(e) => publish(e.target.checked)}
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function AdminUpdates() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_guideline_updates"), [backend]);
  const [filter, setFilter] = React.useState("todas");
  const [editing, setEditing] = React.useState(undefined);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const onSaved = (fresh) => (fresh ? setData(fresh) : reload());
  const items = data.items.filter((u) =>
    filter === "pendentes" ? u.review_status === "pending" : filter === "conferidas" ? u.review_status === "approved" : filter === "publicadas" ? u.published : filter === "app-anterior" ? u.origin === "legacy_app" : true
  );
  const count = (fn) => data.items.filter(fn).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          {data.items.length} atualizações · {count((u) => u.review_status === "approved")} conferidas · {count((u) => u.published)} publicadas
        </span>
        <Button icon="plus" onClick={() => setEditing(null)}>Nova atualização</Button>
      </div>
      {data.review_areas.length === 0 && <Banner tone="info">Você não é revisor médico de nenhuma área: pode editar, mas a conferência no documento oficial é de um revisor cadastrado na área.</Banner>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTERS.map(([v, l]) => (
          <button key={v} type="button" className="sm-chip" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      {editing !== undefined && <Editor key={editing?.id ?? "nova"} item={editing} isAdmin={data.is_admin} reviewAreas={data.review_areas} onSaved={onSaved} onClose={() => setEditing(undefined)} />}
      <Card padding={8}>
        {items.length === 0 && <p style={{ margin: 0, padding: 16, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Nada com este filtro.</p>}
        {items.map((u) => {
          const [label, tone] = REVIEW[u.review_status] ?? REVIEW.pending;
          return (
            <button key={u.id} type="button" onClick={() => setEditing(u)} style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", padding: "10px 12px", border: 0, borderRadius: 12, background: "transparent", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}>
              <Badge size="sm" tone={tone}>{label}</Badge>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", font: "600 14px var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.topic}</span>
                <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                  {areaLabel(u.area)} · {(u.years ?? []).join(", ") || "sem ano"}{u.origin === "legacy_app" ? " · veio do app anterior" : ""}{u.source_url ? "" : " · sem endereço oficial"}
                </span>
              </span>
              <Badge size="sm" tone={u.published ? "success" : "neutral"}>{u.published ? "Publicada" : "Rascunho"}</Badge>
            </button>
          );
        })}
      </Card>
    </div>
  );
}
