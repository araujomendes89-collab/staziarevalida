// Editar um rascunho (equipe). Mudar o texto zera as conferências e a revisão médica; mudar SÓ a formatação (editor profissional,
// migração 013120) mantém a aprovação e as conferências. O servidor confere o hash que a pessoa abriu.
import React from "react";
import { Banner, Button, SelectField, TextField } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { TextArea } from "../../common.jsx";
import { CampoRico } from "../../../editorPro/CampoRico.jsx";
import { camposConteudo, comFormatacao } from "../../../../../shared/docRico/campos";
import { formatacaoParaSalvar, LETRAS, textosInedita } from "../../../../../shared/questions/formatacao";
import { useAction } from "../ui.jsx";

const formDe = (draft) => ({
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
  // a formatação de cada campo (chave → envelope); o texto continua nos campos de sempre
  formatacao: draft.formatacao ?? null,
});

const linhasDe = (texto) =>
  texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(":");
      return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: l, value: "" };
    });

/** O que vai para app_draft_question_save. Os campos com formatação vão aparados (a projeção da formatação bate com o texto). */
function conteudoDe(f, draft) {
  const rows = linhasDe(f.supportRows);
  const textos = textosInedita(f);
  const apara = (k) => String(textos[k] ?? "").trim();
  return {
    title: f.title,
    topic: f.topic,
    stem: apara("stem"),
    support: { type: rows.length ? (draft.support_type === "LAB_PANEL" ? "LAB_PANEL" : "TABLE") : "NONE", title: f.supportTitle, rows },
    alternatives: Object.fromEntries(LETRAS.map((l) => [l, apara(`alt.${l}`)])),
    correct_answer: f.correct,
    explanation: apara("explanation"),
    alternative_explanations: Object.fromEntries(LETRAS.map((l) => [l, apara(`altexp.${l}`)])),
    clinical_decision: apara("clinical_decision"),
    update_application: apara("update_application"),
  };
}

/**
 * Prévia, na tela, do que o banco vai decidir ao salvar: "nada", "formatacao" (só formatação: a aprovação continua) ou
 * "conteudo" (texto ou o que a formatação traz de conteúdo mudou: volta para revisão médica). Quem decide de verdade é o banco.
 */
function tipoDaMudanca(f, inicial, draft) {
  const agora = conteudoDe(f, draft);
  const antes = conteudoDe(inicial, draft);
  if (JSON.stringify(agora) !== JSON.stringify(antes)) return "conteudo";
  const fAgora = formatacaoParaSalvar(textosInedita(f), f.formatacao);
  const fAntes = formatacaoParaSalvar(textosInedita(inicial), inicial.formatacao);
  if (JSON.stringify(fAgora) === JSON.stringify(fAntes)) return "nada";
  const textos = textosInedita(f);
  return JSON.stringify(camposConteudo(textos, fAgora)) === JSON.stringify(camposConteudo(textos, fAntes)) ? "formatacao" : "conteudo";
}

export function DraftEditor({ draft, notice, onSaved, onCancel }) {
  const { backend } = useSession();
  const act = useAction();
  const [inicial] = React.useState(() => formDe(draft));
  const [f, setF] = React.useState(inicial);
  const [topicList, setTopicList] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    backend.rpc("app_staziamed_topics", { p_area: draft.area }).then((r) => alive && setTopicList(r ?? []), () => {});
    return () => {
      alive = false;
    };
  }, [backend, draft.area]);
  const set = (patch) => setF((v) => ({ ...v, ...patch }));
  // campo com o editor profissional: o texto vai para o campo de sempre e a formatação para f.formatacao[chave]
  const setRico = (chave, aplicar) => ({ texto, rico }) => setF((v) => ({ ...v, ...aplicar(v, texto), formatacao: comFormatacao(v.formatacao, chave, rico) }));
  const rico = (chave) => f.formatacao?.[chave] ?? null;
  const mudanca = tipoDaMudanca(f, inicial, draft);
  const save = () =>
    act
      .run(
        () =>
          backend.rpc("app_draft_question_save", {
            p_id: draft.id,
            p_hash: draft.content_hash,
            p_content: { ...conteudoDe(f, draft), formatacao: formatacaoParaSalvar(textosInedita(f), f.formatacao) },
          }),
        "Rascunho salvo."
      )
      .then((r) => r && onSaved(r));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
      <Banner tone="info" title="Mudar o texto zera as conferências e a revisão médica deste rascunho.">
        O texto novo precisa ser conferido de novo e aprovado de novo pelo revisor da área. Mudar só a formatação (negrito, itálico, cor, listas, alinhamento) mantém a aprovação e as conferências.
      </Banner>
      {notice && <Banner tone="info">{notice}</Banner>}
      <TextField label="Título" value={f.title} onChange={(e) => set({ title: e.target.value })} />
      <SelectField
        label="Tema"
        value={f.topic}
        onChange={(e) => set({ topic: e.target.value })}
        options={[{ value: "", label: "Sem tema (precisa de tema para aprovar)" }, ...(f.topic && !topicList.some((t) => t.topic === f.topic) ? [{ value: f.topic, label: f.topic }] : []), ...topicList.map((t) => ({ value: t.topic, label: t.topic }))]}
      />
      <CampoRico label="Enunciado" texto={f.stem} rico={rico("stem")} onChange={setRico("stem", (_v, stem) => ({ stem }))} />
      <TextField label="Título da tabela de apoio" value={f.supportTitle} onChange={(e) => set({ supportTitle: e.target.value })} />
      <TextArea label="Linhas da tabela de apoio (uma por linha, no formato nome: valor)" value={f.supportRows} onChange={(v) => set({ supportRows: v })} rows={3} />
      {LETRAS.map((l) => (
        <div key={l} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <CampoRico label={`Alternativa ${l}`} texto={f.alternatives[l]} rico={rico(`alt.${l}`)} onChange={setRico(`alt.${l}`, (v, t) => ({ alternatives: { ...v.alternatives, [l]: t } }))} />
          <CampoRico label={`Explicação da alternativa ${l}`} texto={f.alternativeExplanations[l]} rico={rico(`altexp.${l}`)} onChange={setRico(`altexp.${l}`, (v, t) => ({ alternativeExplanations: { ...v.alternativeExplanations, [l]: t } }))} />
        </div>
      ))}
      <SelectField label="Alternativa correta" value={f.correct} onChange={(e) => set({ correct: e.target.value })} options={LETRAS.map((l) => ({ value: l, label: l }))} />
      <CampoRico label="Comentário do professor (explicação geral)" texto={f.explanation} rico={rico("explanation")} onChange={setRico("explanation", (_v, explanation) => ({ explanation }))} />
      <CampoRico label="Decisão clínica central" texto={f.decision} rico={rico("clinical_decision")} onChange={setRico("clinical_decision", (_v, decision) => ({ decision }))} />
      <CampoRico label="Aplicação da atualização" texto={f.application} rico={rico("update_application")} onChange={setRico("update_application", (_v, application) => ({ application }))} />
      {mudanca === "formatacao" && (
        <Banner tone="success" title="Até agora você mudou só a formatação.">
          Ao salvar, a aprovação e as conferências continuam valendo.
        </Banner>
      )}
      {mudanca === "conteudo" && (
        <Banner tone="warning" title="Você mudou o texto.">
          Ao salvar, as conferências e a revisão médica voltam a zero e a questão volta para a revisão médica.
        </Banner>
      )}
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
