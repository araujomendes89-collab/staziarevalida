// Administração de Atualizações: editar (equipe ou revisor da área), conferir no documento oficial
// (só revisor médico cadastrado na área) e publicar para o aluno (só administrador, e só depois da conferência aprovada).
// Recusar ou mudar o texto de uma publicada tira do ar até nova conferência. O banco confere cada papel e cada regra.
// Editor profissional (013130): os textos longos usam o CampoRico (texto oficial + formatação). A formatação vai em "formatacao"
// (chaves em src/shared/atualizacoes/formatacao.ts) e mudar SÓ a formatação não tira do ar nem pede nova conferência.
import React from "react";
import { Badge, Banner, Button, Card, SelectField, Switch, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { AREAS, areaLabel } from "../practice/format.js";
import { ATUALIZACOES_SPEC } from "../../../shared/adminAssistant/atualizacoes";
import { AssistantLayout } from "./assistant/AssistantLayout.jsx";
import { TabAssistant } from "./assistant/TabAssistant.jsx";
import { SearchSourcesButton } from "./assistant/SearchSourcesButton.jsx";
import { dateTimeBR, LoadError, Loading, messageOf, TextArea, useLoad } from "./common.jsx";
import { CampoRico } from "../editorPro/CampoRico.jsx";
import { comFormatacao } from "../../../shared/docRico/campos";
import { chaves, paraSalvar, tirarItem } from "../../../shared/atualizacoes/formatacao";

const REVIEW = { pending: ["Conferência pendente", "warning"], approved: ["Conferida", "success"], rejected: ["Recusada", "danger"] };
const FILTERS = [
  ["todas", "Todas"],
  ["pendentes", "Conferência pendente"],
  ["conferidas", "Conferidas"],
  ["publicadas", "Publicadas"],
  ["app-anterior", "Vindas do app anterior"],
];
const blank = { area: "CLINICA_MEDICA", topic: "", subtopic: "", priority: 2, publication_label: "", institution: "", document_title: "", source_url: "", before_text: "", timeline: [], current_conduct: "", clinical_impact: "", exam_impact: "", trap: "", search_terms: "", position: 0, flashcards: [], practice_questions: [], formatacao: {} };
const toForm = (u) => ({ ...blank, ...Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v ?? (typeof blank[k] === "string" ? "" : blank[k])])) });
// O que o aluno lê (os mesmos campos que o banco compara): mudar algo daqui numa publicada tira do ar até nova conferência.
// Posição, prioridade e termos do treino ficam de fora, como no banco. A tela compara do mesmo jeito que o banco
// (app_admin_save_guideline_update): o que seria gravado a partir do formulário contra o que está gravado.
const TEXT_FIELDS = ["area", "topic", "subtopic", "publication_label", "institution", "document_title", "source_url", "before_text", "current_conduct", "clinical_impact", "exam_impact", "trap"];
// btrim do banco: tira só os espaços das pontas (quebra de linha fica e conta como mudança)
const btrim = (v) => String(v ?? "").replace(/^ +| +$/g, "");
// o banco compara jsonb pelo valor, sem ligar para a ordem das chaves
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const asSaved = (f, practice) => {
  const timeline = (f.timeline ?? [])
    .map((t) => ({ year: Number(t.year), text: btrim(t.text) }))
    .filter((t) => Number.isInteger(t.year) && t.year >= 2000 && t.year <= 2100 && t.text)
    .sort((a, b) => a.year - b.year);
  return canon({
    ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, btrim(f[k])])),
    years: [...new Set(timeline.map((t) => t.year))].sort((a, b) => a - b),
    timeline,
    flashcards: (f.flashcards ?? []).map((c) => ({ ...(c.type == null ? {} : { type: String(c.type) }), front: btrim(c.front), back: btrim(c.back) })),
    practice_questions: practice ?? [],
  });
};
const asStored = (u) => canon({
  ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, u[k] ?? ""])),
  years: u.years ?? [], timeline: u.timeline ?? [], flashcards: u.flashcards ?? [], practice_questions: u.practice_questions ?? [],
});
const OFF_AIR_CONFIRM = "Esta atualização está no ar para os alunos. Com a mudança no texto, ela sai do ar até um revisor médico conferir de novo e o administrador publicar outra vez. Salvar mesmo assim?";

function LegacyBox({ legacy, sources }) {
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
        {sources}
      </div>
    </Banner>
  );
}

// formatacao/onFormatacao: a formatação de cada texto (chave timeline.N, na ordem desta lista); tirar uma linha sobe a das seguintes
function TimelineEditor({ value, onChange, formatacao, onFormatacao }) {
  const rows = value ?? [];
  const set = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="sm-field__label">O que mudou, por ano</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr auto", gap: 8, alignItems: "start" }}>
          <TextField aria-label="Ano" type="number" min={2000} max={2100} value={r.year ?? ""} onChange={(e) => set(i, { year: e.target.value })} />
          <CampoRico label={`Texto do ano ${i + 1}`} texto={r.text ?? ""} rico={formatacao?.[chaves.timeline(i)]} onChange={(c) => (set(i, { text: c.texto }), onFormatacao((f) => comFormatacao(f, chaves.timeline(i), c.rico)))} />
          <Button variant="ghost" size="sm" icon="trash-2" aria-label="Remover ano" onClick={() => (onChange(rows.filter((_, k) => k !== i)), onFormatacao((f) => tirarItem(f, "timeline", i)))} />
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" icon="plus" onClick={() => onChange([...rows, { year: new Date().getFullYear(), text: "" }])}>Acrescentar ano</Button>
      </div>
    </div>
  );
}

function FlashcardsEditor({ value, onChange, formatacao, onFormatacao }) {
  const rows = value ?? [];
  const set = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="sm-field__label">Flashcards de fixação</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "start" }}>
          <CampoRico label="Frente" texto={r.front ?? ""} rico={formatacao?.[chaves.frente(i)]} maxLength={2000} onChange={(c) => (set(i, { front: c.texto }), onFormatacao((f) => comFormatacao(f, chaves.frente(i), c.rico)))} />
          <CampoRico label="Verso" texto={r.back ?? ""} rico={formatacao?.[chaves.verso(i)]} maxLength={2000} onChange={(c) => (set(i, { back: c.texto }), onFormatacao((f) => comFormatacao(f, chaves.verso(i), c.rico)))} />
          <Button variant="ghost" size="sm" icon="trash-2" aria-label="Remover flashcard" onClick={() => (onChange(rows.filter((_, k) => k !== i)), onFormatacao((f) => tirarItem(f, "flashcard", i)))} />
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" icon="plus" onClick={() => onChange([...rows, { front: "", back: "" }])}>Acrescentar flashcard</Button>
      </div>
    </div>
  );
}

// Questão de treino (AT07): formulário no lugar do código. Guarda no formato que o banco já usa
// ({ statement, options: [{ id, text, justification }], answer, commentary }); o que o formulário não mostra
// (ex.: dificuldade) fica como está, e questão que ninguém mexeu é gravada exatamente como veio.
const LETTERS = ["A", "B", "C", "D"];
const blankQuestion = () => ({ statement: "", options: LETTERS.map((id) => ({ id, text: "", justification: "" })), answer: "", commentary: "" });
const optionOf = (q, id) => (q.options ?? []).find((o) => o.id === id) ?? { id, text: "", justification: "" };
const withOption = (q, id, patch) => ({ ...q, options: LETTERS.map((l) => (l === id ? { ...optionOf(q, l), ...patch } : optionOf(q, l))) });
const listLetters = (l) => (l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`);
// Primeiro problema que o banco recusaria (app_admin_save_guideline_update), dito em português; null se está tudo certo.
const practiceProblem = (list) => {
  for (let i = 0; i < list.length; i += 1) {
    const q = list[i];
    const at = `Questão de treino ${i + 1}`;
    if (String(q.statement ?? "").trim().length < 20) return `${at}: o enunciado precisa ter pelo menos 20 caracteres.`;
    const empty = LETTERS.filter((l) => !String(optionOf(q, l).text ?? "").trim());
    if (empty.length) return `${at}: escreva o texto ${empty.length === 1 ? "da alternativa" : "das alternativas"} ${listLetters(empty)}.`;
    if (!LETTERS.includes(q.answer)) return `${at}: escolha o gabarito (a alternativa correta).`;
  }
  return null;
};

function PracticeQuestionsEditor({ value, onChange, formatacao, onFormatacao }) {
  const rows = value ?? [];
  const set = (i, q) => onChange(rows.map((r, k) => (k === i ? q : r)));
  const fmt = (chave, rico) => onFormatacao((f) => comFormatacao(f, chave, rico));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="sm-field__label">Questões de treino (escritas pela equipe; não são questões oficiais do INEP)</div>
      {rows.map((q, i) => (
        <div key={i} role="group" aria-label={`Questão de treino ${i + 1}`} style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12, borderRadius: 12, border: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <strong style={{ font: "var(--type-label)" }}>{`Questão de treino ${i + 1}`}</strong>
            <Button variant="ghost" size="sm" icon="trash-2" aria-label={`Remover questão de treino ${i + 1}`} onClick={() => (onChange(rows.filter((_, k) => k !== i)), onFormatacao((f) => tirarItem(f, "questao", i)))} />
          </div>
          <CampoRico label="Enunciado" texto={q.statement ?? ""} rico={formatacao?.[chaves.enunciado(i)]} onChange={(c) => (set(i, { ...q, statement: c.texto }), fmt(chaves.enunciado(i), c.rico))} hint="Pelo menos 20 caracteres." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
            {LETTERS.map((l) => (
              <div key={l} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <CampoRico label={`Alternativa ${l}`} texto={optionOf(q, l).text ?? ""} rico={formatacao?.[chaves.alt(i, l)]} onChange={(c) => (set(i, withOption(q, l, { text: c.texto })), fmt(chaves.alt(i, l), c.rico))} />
                <CampoRico label={`Justificativa da ${l} (por que está certa ou errada)`} texto={optionOf(q, l).justification ?? ""} rico={formatacao?.[chaves.justificativa(i, l)]} onChange={(c) => (set(i, withOption(q, l, { justification: c.texto })), fmt(chaves.justificativa(i, l), c.rico))} />
              </div>
            ))}
          </div>
          <SelectField
            label="Gabarito (alternativa correta)"
            value={q.answer ?? ""}
            onChange={(e) => set(i, { ...q, answer: e.target.value })}
            options={[{ value: "", label: "Escolha a alternativa correta" }, ...LETTERS.map((l) => ({ value: l, label: `Alternativa ${l}` }))]}
          />
          <CampoRico label="Comentário (o aluno lê depois de confirmar)" texto={q.commentary ?? ""} rico={formatacao?.[chaves.comentario(i)]} onChange={(c) => (set(i, { ...q, commentary: c.texto }), fmt(chaves.comentario(i), c.rico))} />
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" icon="plus" onClick={() => onChange([...rows, blankQuestion()])}>Acrescentar questão de treino</Button>
      </div>
    </div>
  );
}

function Editor({ item, onSaved, onClose, isAdmin, reviewAreas }) {
  const { backend } = useSession();
  const [form, setForm] = React.useState(() => (item ? toForm(item) : blank));
  const [questions, setQuestions] = React.useState(() => (Array.isArray(item?.practice_questions) ? item.practice_questions : []));
  const [current, setCurrent] = React.useState(item);
  const [state, setState] = React.useState({ busy: false, error: null, done: null });
  const [note, setNote] = React.useState("");
  const [assistantOpen, setAssistantOpen] = React.useState(false);
  const set = (patch) => (setForm((f) => ({ ...f, ...patch })), setState((s) => ({ ...s, done: null })));
  const changeQuestions = (next) => (setQuestions(next), setState((s) => ({ ...s, done: null })));
  // formatação (013130): muda junto com o texto do campo; fn recebe a formatação atual e devolve a nova
  const setFormatacao = (fn) => (setForm((f) => ({ ...f, formatacao: fn(f.formatacao ?? {}) })), setState((s) => ({ ...s, done: null })));
  const campo = (k) => ({ texto: form[k], rico: form.formatacao?.[k], onChange: (c) => (setForm((f) => ({ ...f, [k]: c.texto, formatacao: comFormatacao(f.formatacao, k, c.rico) })), setState((s) => ({ ...s, done: null }))) });
  // "Usar" só muda o formulário (e apaga o aviso de salvo); quem grava é "Salvar alterações". Lista (linha do tempo, flashcards): o painel
  // entrega a lista já com os itens novos ao fim, então o campo é trocado pelo valor final.
  const applySuggestion = (field, value) => {
    setForm((f) => ({ ...f, ...ATUALIZACOES_SPEC.patch(f, field, value) }));
    setState((s) => ({ ...s, done: null }));
  };
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
    const practice = questions;
    const problem = practiceProblem(practice);
    if (problem) return setState({ busy: false, error: problem, done: null });
    // formatação aparada junto com o texto (como o banco apara), chaves da linha do tempo na ordem gravada e só as válidas (formatacao.ts)
    const pronto = paraSalvar(form, practice, form.formatacao);
    if (pronto.problema) return setState({ busy: false, error: pronto.problema, done: null });
    // só formatação não muda o texto: não tira do ar, então não pergunta
    if (current?.published && asSaved(form, practice) !== asStored(current) && !window.confirm(OFF_AIR_CONFIRM)) return;
    run("save", async () => {
      const saved = await backend.rpc("app_admin_save_guideline_update", {
        // os textos vão como sempre (o banco apara e põe a linha do tempo em ordem de ano, no empate a ordem enviada); a formatação já
        // vem com as chaves na ordem que o banco grava
        p_update: { ...form, id: current?.id, priority: Number(form.priority) || 2, position: Number(form.position) || 0, timeline: form.timeline.map((t) => ({ year: Number(t.year), text: t.text })), practice_questions: practice, formatacao: pronto.formatacao },
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
  // publicar só com conferência aprovada (o banco também recusa); tirar do ar fica sempre livre
  const publishLocked = Boolean(current) && !current.published && current.review_status !== "approved";
  const [label, tone] = REVIEW[current?.review_status] ?? REVIEW.pending;
  // O servidor lê o formulário como está na tela. O id é o do item gravado (nulo se ainda é novo); o registro do app anterior e a
  // questão de treino (com a resposta) não vão para a IA. O documento oficial só é oferecido como material se o endereço é https.
  const assistantForm = { ...form, id: current?.id ?? null, legacy: undefined, practice_questions: undefined, formatacao: undefined };
  const officialUrl = String(form.source_url ?? "").trim();
  const materialLink = officialUrl.startsWith("https://") ? officialUrl : null;
  return (
    <AssistantLayout
      open={assistantOpen}
      panel={<TabAssistant spec={ATUALIZACOES_SPEC} title="Assistente" form={assistantForm} materialLink={materialLink} onUse={applySuggestion} onClose={() => setAssistantOpen(false)} />}
    >
      <Card>
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, font: "var(--type-h4)" }}>{current ? "Editar atualização" : "Nova atualização"}</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {current && <Badge tone={tone}>{label}</Badge>}
              {current && <Badge tone={current.published ? "success" : "neutral"}>{current.published ? "Publicada" : "Não publicada"}</Badge>}
              {current && isAdmin && <Button variant="ghost" icon="trash-2" onClick={remove}>Apagar</Button>}
              <Button variant="secondary" aria-pressed={assistantOpen} onClick={() => setAssistantOpen((open) => !open)}>Assistente</Button>
              <Button variant="ghost" onClick={onClose}>Fechar</Button>
            </div>
          </div>
          {state.error && <Banner tone="danger">{state.error}</Banner>}
          {state.done === "save" && current?.review_status === "pending" && current?.review_note && <Banner tone="warning">{current.review_note}</Banner>}
          {state.done === "save" && <Banner tone="success">Atualização salva.</Banner>}
          {current?.published && <Banner tone="warning">Esta atualização está no ar. Se você mudar o texto, ela sai do ar para os alunos até um revisor médico conferir de novo e o administrador publicar outra vez. Mudar só a posição, a prioridade, os termos do treino ou a formatação (negrito, cor, alinhamento...) não tira do ar.</Banner>}
          {current?.origin === "legacy_app" && <LegacyBox legacy={current.legacy} sources={<SearchSourcesButton tab="atualizacoes" form={form} />} />}
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
          <CampoRico label="Antes (conduta anterior)" maxLength={4000} {...campo("before_text")} />
          <TimelineEditor value={form.timeline} onChange={(timeline) => set({ timeline })} formatacao={form.formatacao} onFormatacao={setFormatacao} />
          <CampoRico label="Conduta vigente" maxLength={4000} {...campo("current_conduct")} />
          <CampoRico label="Como pode aparecer no Revalida" maxLength={4000} {...campo("exam_impact")} />
          <CampoRico label="Pegadinha da banca" maxLength={2000} {...campo("trap")} />
          <CampoRico label="Impacto clínico" maxLength={4000} {...campo("clinical_impact")} />
          <FlashcardsEditor value={form.flashcards} onChange={(flashcards) => set({ flashcards })} formatacao={form.formatacao} onFormatacao={setFormatacao} />
          <PracticeQuestionsEditor value={questions} onChange={changeQuestions} formatacao={form.formatacao} onFormatacao={setFormatacao} />
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
                  {current.published && <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Recusar tira esta atualização do ar para os alunos na hora.</p>}
                </div>
              ) : (
                <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Só um revisor médico cadastrado em {areaLabel(current.area)} confere esta atualização (Central de Conteúdo › Configuração).</p>
              )}
            </div>
            {isAdmin && (
              <div>
                <Switch
                  label="Publicada para os alunos"
                  description={current.review_status === "approved" ? "Conferida por revisor médico." : "Só pode ser publicada depois que um revisor médico aprovar a conferência no documento oficial."}
                  checked={Boolean(current.published)}
                  disabled={state.busy === "publish" || publishLocked}
                  onChange={(e) => !publishLocked && publish(e.target.checked)}
                />
              </div>
            )}
          </div>
        )}
      </Card>
    </AssistantLayout>
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
