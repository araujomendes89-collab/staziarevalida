// Formulário de flashcard pessoal: usado na tela de Flashcards e no "Criar flashcard" da correção.
import React from "react";
import { Banner, Button, SelectField, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { AREAS } from "../practice/format.js";

const ERRORS = [
  [/já criou um flashcard desta questão/, "Você já criou um flashcard desta questão."],
  [/pergunta e a resposta/, "Preencha a pergunta e a resposta."],
  [/longo demais/, "Texto longo demais para um flashcard."],
];

function TextArea({ id, label, value, onChange, rows, maxLength, hint, placeholder }) {
  return (
    <div className="sm-field">
      <label className="sm-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="sm-input" style={{ height: "auto" }}>
        <textarea
          id={id}
          rows={rows}
          maxLength={maxLength}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", resize: "vertical", padding: "12px 16px", font: "400 15px/1.5 var(--font-sans)", color: "var(--text-primary)" }}
        />
      </div>
      {hint && <span className="sm-field__hint">{hint}</span>}
    </div>
  );
}

/**
 * initial: { area, topic, front, back, source_question_id } — vindo de uma questão, os campos
 * chegam preenchidos com o tema e a conduta esperada, e o aluno ajusta antes de salvar.
 */
export function FlashcardForm({ initial = {}, onSaved, onCancel, compact = false }) {
  const { backend, refresh } = useSession();
  const id = React.useId();
  const [form, setForm] = React.useState({ area: initial.area ?? "", topic: initial.topic ?? "", front: initial.front ?? "", back: initial.back ?? "" });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.area) return setError("Escolha a grande área.");
    if (!form.front.trim() || !form.back.trim()) return setError("Preencha a pergunta e a resposta.");
    setSaving(true);
    setError(null);
    try {
      const created = await backend.rpc("app_create_flashcard", {
        p_area: form.area,
        p_topic: form.topic,
        p_front: form.front,
        p_back: form.back,
        p_source_question_id: initial.source_question_id ?? null,
      });
      refresh().catch(() => {});
      onSaved?.(created);
    } catch (err) {
      const message = ERRORS.find(([pattern]) => pattern.test(err?.message ?? ""))?.[1];
      setError(message ?? "Não foi possível salvar o flashcard. Tente de novo.");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
      {error && <Banner tone="danger">{error}</Banner>}
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
        <SelectField label="Grande área" value={form.area} onChange={(e) => set({ area: e.target.value })} options={[{ value: "", label: "Escolha a área" }, ...AREAS.map((a) => ({ value: a.id, label: a.label }))]} />
        <TextField label="Tema" value={form.topic} onChange={(e) => set({ topic: e.target.value })} maxLength={200} placeholder="Ex.: Bronquiolite" />
      </div>
      <TextArea id={`${id}-front`} label="Pergunta (frente)" rows={2} maxLength={2000} value={form.front} onChange={(front) => set({ front })} placeholder="Ex.: Qual a conduta inicial na bronquiolite sem sinais de gravidade?" />
      <TextArea id={`${id}-back`} label="Resposta (verso)" rows={compact ? 4 : 3} maxLength={4000} value={form.back} onChange={(back) => set({ back })} hint={initial.source_question_id ? "Vem preenchido com a conduta esperada da questão. Ajuste como preferir." : undefined} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={saving} icon="plus">
          Salvar flashcard
        </Button>
      </div>
    </form>
  );
}
