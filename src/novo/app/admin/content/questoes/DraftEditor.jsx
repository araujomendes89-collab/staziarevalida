// Editar um rascunho (equipe). Salvar zera as conferências e a revisão médica; o servidor confere o hash que a pessoa abriu.
import React from "react";
import { Banner, Button, SelectField, TextField } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { TextArea } from "../../common.jsx";
import { useAction } from "../ui.jsx";

export function DraftEditor({ draft, notice, onSaved, onCancel }) {
  const { backend } = useSession();
  const act = useAction();
  const [f, setF] = React.useState(() => ({
    title: draft.title ?? "",
    topic: draft.topic ?? "",
    stem: draft.stem ?? "",
    supportTitle: draft.support_title ?? "",
    supportRows: (draft.support_rows ?? []).map((r) => `${r.label}: ${r.value}`).join("\n"),
    alternatives: { A: "", B: "", C: "", D: "", ...(draft.alternatives ?? {}) },
    correct: draft.correct_answer,
    explanation: draft.explanation ?? "",
    alternativeExplanations: { A: "", B: "", C: "", D: "", ...(draft.alternative_explanations ?? {}) },
    decision: draft.clinical_decision ?? "",
    application: draft.update_application ?? "",
  }));
  const topics = React.useRef(null);
  const [topicList, setTopicList] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    backend.rpc("app_staziamed_topics", { p_area: draft.area }).then((r) => alive && setTopicList(r ?? []), () => {});
    return () => {
      alive = false;
    };
  }, [backend, draft.area]);
  void topics;
  const set = (patch) => setF((v) => ({ ...v, ...patch }));
  const rows = f.supportRows
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(":");
      return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: l, value: "" };
    });
  const save = () =>
    act
      .run(
        () =>
          backend.rpc("app_draft_question_save", {
            p_id: draft.id,
            p_hash: draft.content_hash,
            p_content: {
              title: f.title,
              topic: f.topic,
              stem: f.stem,
              support: { type: rows.length ? (draft.support_type === "LAB_PANEL" ? "LAB_PANEL" : "TABLE") : "NONE", title: f.supportTitle, rows },
              alternatives: f.alternatives,
              correct_answer: f.correct,
              explanation: f.explanation,
              alternative_explanations: f.alternativeExplanations,
              clinical_decision: f.decision,
              update_application: f.application,
            },
          }),
        "Rascunho salvo. As conferências e a revisão médica voltaram a zero."
      )
      .then((r) => r && onSaved(r));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
      <Banner tone="warning" title="Salvar zera as conferências e a revisão médica deste rascunho.">
        O texto novo precisa ser conferido de novo e aprovado de novo pelo revisor da área.
      </Banner>
      {notice && <Banner tone="info">{notice}</Banner>}
      <TextField label="Título" value={f.title} onChange={(e) => set({ title: e.target.value })} />
      <SelectField
        label="Tema"
        value={f.topic}
        onChange={(e) => set({ topic: e.target.value })}
        options={[{ value: "", label: "Sem tema (precisa de tema para aprovar)" }, ...(f.topic && !topicList.some((t) => t.topic === f.topic) ? [{ value: f.topic, label: f.topic }] : []), ...topicList.map((t) => ({ value: t.topic, label: t.topic }))]}
      />
      <TextArea label="Enunciado" value={f.stem} onChange={(v) => set({ stem: v })} rows={5} />
      <TextField label="Título da tabela de apoio" value={f.supportTitle} onChange={(e) => set({ supportTitle: e.target.value })} />
      <TextArea label="Linhas da tabela de apoio (uma por linha, no formato nome: valor)" value={f.supportRows} onChange={(v) => set({ supportRows: v })} rows={3} />
      {["A", "B", "C", "D"].map((l) => (
        <div key={l} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <TextField label={`Alternativa ${l}`} value={f.alternatives[l]} onChange={(e) => set({ alternatives: { ...f.alternatives, [l]: e.target.value } })} />
          <TextField label={`Explicação da alternativa ${l}`} value={f.alternativeExplanations[l]} onChange={(e) => set({ alternativeExplanations: { ...f.alternativeExplanations, [l]: e.target.value } })} />
        </div>
      ))}
      <SelectField label="Alternativa correta" value={f.correct} onChange={(e) => set({ correct: e.target.value })} options={["A", "B", "C", "D"].map((l) => ({ value: l, label: l }))} />
      <TextArea label="Comentário do professor (explicação geral)" value={f.explanation} onChange={(v) => set({ explanation: v })} rows={3} />
      <TextArea label="Decisão clínica central" value={f.decision} onChange={(v) => set({ decision: v })} rows={2} />
      <TextArea label="Aplicação da atualização" value={f.application} onChange={(v) => set({ application: v })} rows={2} />
      <div style={{ display: "flex", gap: 8 }}>
        <Button size="sm" icon="save" loading={act.busy} onClick={save}>
          Salvar
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
      {act.feedback}
    </div>
  );
}
