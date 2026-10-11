// Questões: busca, edição, nova questão e carregamento em lote (planilha CSV ou JSON).
import React from "react";
import { Badge, Banner, Button, Card, Checkbox, EmptyState, Icon, SegmentedControl, SelectField, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { AREAS, areaLabel } from "../practice/format.js";
import { csvTemplate, jsonTemplate, markDuplicates, questionsFromFile } from "./questionImport.js";
import { ASSIST_TEXTS } from "../../../shared/adminAssistant/types";
import { QUESTOES_SPEC } from "../../../shared/adminAssistant/questoes";
import { AssistantLayout } from "./assistant/AssistantLayout.jsx";
import { TabAssistant } from "./assistant/TabAssistant.jsx";
import { downloadText, ListRow, LoadError, Loading, messageOf, QUESTION_STATUS_LABEL, TextArea, useDebounced, useLoad } from "./common.jsx";

const PAGE = 50;
const LETTERS = ["A", "B", "C", "D"];
const statusTone = { valid: "success", annulled: "danger", changed_after_appeal: "warning" };
const AREA_OPTIONS = AREAS.map((a) => ({ value: a.id, label: a.label }));
// Registro do gabarito oficial (Q02): a situação oficial que muda o que o aluno vê
const OFFICIAL_STATUS = [
  { value: "FINAL", label: "Definitivo" },
  { value: "CHANGED_AFTER_APPEAL", label: "Alterado após recurso" },
  { value: "ANNULLED", label: "Anulada pela banca" },
];
const OFFICIAL_LABEL = { PRELIMINARY: "preliminar", FINAL: "definitivo", CHANGED_AFTER_APPEAL: "alterado após recurso", ANNULLED: "anulada pela banca", UNKNOWN: "sem informação" };
const LOCKED_TEXT = "Gabarito e situação só mudam pelo registro do gabarito oficial (administrador, com fonte e motivo).";
// campos marcados para revisão depois da troca de gabarito → nome na tela (em questão anulada a análise não volta: ela
// aponta uma alternativa como a correta)
const REVIEW_LABEL = (campo, annulled) =>
  /^explanation_[A-D]$/.test(campo)
    ? `Explicação da ${campo.slice(-1)}`
    : { expected_conduct: "Conduta esperada", analise: annulled ? "Análise publicada (não aparece ao aluno em questão anulada)" : "Análise publicada (volta com nova análise aprovada, depois de marcar como revisadas)" }[campo] ?? campo;
// gabarito da marca de revisão: a letra ou "ANULADA" (anular também muda o gabarito)
const REVIEW_ANSWER = (value) => (value === "ANULADA" ? "anulada pela banca" : value ?? "sem gabarito");
// texto da marca "explicações a revisar". O gabarito pode ter voltado ao de antes da troca (…7710): aí só ficam marcados os
// textos que mudaram durante a troca (podem ter sido escritos para o outro gabarito), e a marca não diz "mudou de B para B"
const reviewText = (review) => {
  const fields = (review.campos ?? []).map((c) => REVIEW_LABEL(c, review.para === "ANULADA")).join(", ");
  return review.de === review.para
    ? `O gabarito voltou para ${REVIEW_ANSWER(review.para)}, o mesmo de antes da troca. Revise o que mudou durante a troca: ${fields}. Até lá, o aluno não vê esses textos.`
    : `O gabarito mudou de ${REVIEW_ANSWER(review.de)} para ${REVIEW_ANSWER(review.para)}. Revise: ${fields}. Até lá, o aluno não vê esses textos.`;
};
const codesText = (list, max = 20) => list.slice(0, max).join("; ") + (list.length > max ? ` e mais ${list.length - max}` : "");
// o que a Análise Stazia publicada explica: o enunciado e o texto de cada alternativa (a mesma comparação do banco: espaços
// repetidos e nas pontas contam como um só; explicação, conduta, tema e subtema não entram)
const squash = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const analysisTextChanged = (now, saved) =>
  squash(now.statement) !== squash(saved.statement) || LETTERS.some((id) => squash(now.options.find((o) => o.id === id)?.text) !== squash(saved.options.find((o) => o.id === id)?.text));

// ---------------------------------------------------------------- editor
function emptyQuestion() {
  return {
    kind: "REVALIDA",
    year: String(new Date().getFullYear()),
    semester: "1",
    number: "",
    area: "",
    topic: "",
    subtopic: "",
    statement: "",
    options: LETTERS.map((id) => ({ id, text: "", explanation: "" })),
    correct_option: "",
    status: "valid",
    expected_conduct: "",
    inep_intent: "",
    needs_image: false,
  };
}

function fromRow(q) {
  return {
    id: q.id,
    code: q.code,
    attempts: q.attempts,
    kind: q.exam?.kind ?? "REVALIDA",
    year: String(q.exam?.year ?? ""),
    semester: q.exam?.semester ? String(q.exam.semester) : "",
    number: String(q.number),
    area: q.area,
    topic: q.topic ?? "",
    subtopic: q.subtopic ?? "",
    statement: q.statement ?? "",
    options: LETTERS.map((id) => {
      const o = (q.options ?? []).find((x) => x.id === id) ?? {};
      return { id, text: o.text ?? "", explanation: o.explanation ?? "" };
    }),
    correct_option: q.correct_option ?? "",
    status: q.status,
    expected_conduct: q.expected_conduct ?? "",
    inep_intent: q.inep_intent ?? "",
    needs_image: q.needs_image,
    images: q.images ?? [],
    official: q.official ?? null,
    explanations_review: q.explanations_review ?? null,
  };
}

/** O que o "Salvar questão" grava. Também diz se há mudança não salva (comparando com o que veio do banco). */
function payloadOf(form) {
  return {
    ...(form.id ? { id: form.id } : {}),
    kind: form.kind,
    year: form.year.trim(),
    semester: form.kind === "ENAMED" ? "" : form.semester,
    number: form.number.trim(),
    area: form.area,
    topic: form.topic,
    subtopic: form.subtopic,
    statement: form.statement,
    options: form.options,
    correct_option: form.correct_option || null,
    status: form.status,
    expected_conduct: form.expected_conduct,
    inep_intent: form.inep_intent,
    needs_image: form.needs_image,
  };
}

/** Registro do gabarito oficial (só administrador): situação, letra, fonte e motivo. Fica dentro do formulário da questão, então
 * Enter num campo daqui não envia a questão. */
function OfficialAnswerForm({ question, onCancel, onDone }) {
  const { backend } = useSession();
  const [status, setStatus] = React.useState("FINAL");
  const [answer, setAnswer] = React.useState(question.correct_option || "");
  const [source, setSource] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [state, setState] = React.useState({ saving: false, error: null });
  const needsLetter = status !== "ANNULLED";
  const ready = Boolean(source.trim() && reason.trim() && (!needsLetter || answer));

  const submit = async () => {
    if (!ready || state.saving) return;
    setState({ saving: true, error: null });
    try {
      const result = await backend.rpc("app_admin_set_official_answer", {
        p_question_id: question.id,
        p_answer: needsLetter ? answer : null,
        p_status: status,
        p_source: source.trim(),
        p_source_url: url.trim() || null,
        p_published_at: null,
        p_reason: reason.trim(),
      });
      setState({ saving: false, error: null });
      onDone(result);
    } catch (error) {
      setState({ saving: false, error: messageOf(error) });
    }
  };

  return (
    <section
      aria-label="Registro do gabarito oficial"
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target?.tagName === "INPUT") event.preventDefault();
      }}
      style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: 16, border: "1px solid var(--border-default)", background: "var(--surface-sunken)" }}
    >
      <div style={{ font: "var(--type-label)" }}>Registro do gabarito oficial</div>
      <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        Ao mudar a letra, as respostas antigas dos alunos são corrigidas de novo e as explicações escritas para o gabarito antigo saem do aluno até a revisão.
      </p>
      <SelectField label="Situação do gabarito oficial" value={status} onChange={(e) => setStatus(e.target.value)} options={OFFICIAL_STATUS} />
      {needsLetter && (
        <div>
          <div className="sm-field__label" style={{ marginBottom: 10 }}>
            Letra
          </div>
          <SegmentedControl label="Letra do gabarito oficial" value={answer} onChange={setAnswer} options={LETTERS} />
        </div>
      )}
      <TextField label="Fonte (documento e data)" value={source} maxLength={300} placeholder="Ex.: Gabarito definitivo INEP 2024/1, publicado em 30/09/2026" onChange={(e) => setSource(e.target.value)} />
      <TextField label="Link da fonte (opcional)" value={url} maxLength={500} placeholder="https://" onChange={(e) => setUrl(e.target.value)} />
      <TextArea label="Motivo da mudança" rows={2} maxLength={500} value={reason} onChange={setReason} />
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" onClick={submit} loading={state.saving} disabled={!ready}>
          Registrar
        </Button>
      </div>
    </section>
  );
}

export function QuestionEditor({ id, onClose, onSaved }) {
  const { backend, boot } = useSession();
  const isAdmin = boot?.role === "admin";
  const [officialOpen, setOfficialOpen] = React.useState(false);
  const [officialNote, setOfficialNote] = React.useState(null);
  const [reviewState, setReviewState] = React.useState({ saving: false, error: null });
  const existing = useLoad(() => (id ? backend.rpc("app_admin_question", { p_id: id }) : Promise.resolve(null)), [backend, id]);
  const [form, setForm] = React.useState(id ? null : emptyQuestion());
  // o formulário como está gravado no banco (para saber se há mudança não salva)
  const [savedForm, setSavedForm] = React.useState(null);
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  const [assistantOpen, setAssistantOpen] = React.useState(false);
  const [aiUsed, setAiUsed] = React.useState(false);
  // gabarito e situação da questão gravada (null = questão nova, ainda não gravada). O painel do assistente só recomeça quando
  // eles mudam numa questão já gravada; o primeiro salvamento de questão nova não o desmonta (decisão D3a)
  const [stored, setStored] = React.useState(null);
  const [panelKey, setPanelKey] = React.useState(0);
  const storedKey = (row) => `${row?.correct_option ?? ""}|${row?.status ?? ""}`;
  React.useEffect(() => {
    if (existing.data) {
      setForm(fromRow(existing.data));
      setSavedForm(fromRow(existing.data));
      setStored(storedKey(existing.data));
    }
  }, [existing.data]);

  if (existing.error) return <LoadError error={existing.error} retry={existing.reload} />;
  if (!form) return <Loading />;

  const set = (patch) => (setForm((f) => ({ ...f, ...patch })), setState((s) => ({ ...s, done: false })));
  const setOption = (letter, patch) => set({ options: form.options.map((o) => (o.id === letter ? { ...o, ...patch } : o)) });
  const isNew = !form.id;
  const useSuggestion = (field, value) => {
    setForm((f) => ({ ...f, ...QUESTOES_SPEC.patch(f, field, value) }));
    setState((s) => ({ ...s, done: false }));
    setAiUsed(true);
  };
  const { images: _images, attempts: _attempts, official: _official, explanations_review: _review, ...assistantForm } = form;
  // questão já gravada: gabarito e situação só mudam pelo registro do gabarito oficial (Q02)
  const locked = !isNew;

  // traz do banco só gabarito, situação, registro e marca de revisão (o resto do formulário, ainda não salvo, fica como está)
  const takeOfficial = (fresh) => {
    setForm((f) => ({ ...f, correct_option: fresh.correct_option ?? "", status: fresh.status, official: fresh.official ?? null, explanations_review: fresh.explanations_review ?? null }));
    setSavedForm((f) => f && { ...f, correct_option: fresh.correct_option ?? "", status: fresh.status });
    const next = storedKey(fresh);
    if (stored !== null && stored !== next) setPanelKey((k) => k + 1);
    setStored(next);
  };
  // depois do registro do gabarito oficial
  const officialDone = async (result) => {
    setOfficialOpen(false);
    const n = result?.recorrected ?? 0;
    setOfficialNote(`Gabarito oficial registrado.${n ? ` ${n} ${n === 1 ? "resposta de aluno foi corrigida" : "respostas de alunos foram corrigidas"} de novo.` : ""}`);
    try {
      takeOfficial(await backend.rpc("app_admin_question", { p_id: form.id }));
    } catch (error) {
      setState((s) => ({ ...s, error: messageOf(error) }));
    }
    onSaved();
  };
  const review = form.explanations_review;
  const official = form.official;
  const unsaved = savedForm !== null && JSON.stringify(payloadOf(form)) !== JSON.stringify(payloadOf(savedForm));
  // Q10: salvar com o enunciado ou o texto de uma alternativa mudado tira do ar a análise publicada da questão
  const textChanged = !isNew && savedForm !== null && analysisTextChanged(form, savedForm);

  /** Grava o formulário e devolve a questão gravada (ou lança a recusa do banco). */
  const persist = async () => {
    const saved = await backend.rpc("app_admin_save_question", {
      p_question: payloadOf(form),
      ...(aiUsed ? { p_reason: ASSIST_TEXTS.aiReason } : {}),
    });
    const next = storedKey(saved);
    if (stored !== null && stored !== next) setPanelKey((k) => k + 1);
    setForm(fromRow(saved));
    setSavedForm(fromRow(saved));
    setStored(next);
    setAiUsed(false);
    return saved;
  };

  const save = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null, done: false });
    try {
      await persist();
      setState({ saving: false, error: null, done: true });
      onSaved();
    } catch (error) {
      setState({ saving: false, error: messageOf(error), done: false });
    }
  };

  // Tirar a marca libera ao aluno o que está GRAVADO. Por isso o texto reescrito no formulário é salvo antes; se o salvar
  // falhar, a marca fica (o aluno continua sem os textos antigos) e nada mais é feito.
  const reviewDone = async () => {
    if (reviewState.saving || state.saving) return;
    setReviewState({ saving: true, error: null });
    const wasUnsaved = unsaved;
    if (wasUnsaved) {
      try {
        await persist();
        setState({ saving: false, error: null, done: true });
      } catch (error) {
        setReviewState({ saving: false, error: `A questão não foi salva e as explicações continuam marcadas para revisão. ${messageOf(error)}` });
        return;
      }
    }
    try {
      // o banco só tira a marca que a pessoa viu: se outra pessoa registrou outra troca de gabarito enquanto ela revisava, ele recusa
      const fresh = await backend.rpc("app_admin_question_review_done", { p_question_id: form.id, p_seen: review });
      setForm((f) => ({ ...f, explanations_review: fresh?.explanations_review ?? null }));
      setReviewState({ saving: false, error: null });
      onSaved();
    } catch (error) {
      setReviewState({ saving: false, error: messageOf(error) });
      if (wasUnsaved) onSaved();
      // a marca (e o gabarito) podem ter mudado: mostra os de agora, para a pessoa revisar o que ela ainda não tinha visto
      try {
        takeOfficial(await backend.rpc("app_admin_question", { p_id: form.id }));
      } catch {
        /* segue com o que a tela já mostra */
      }
    }
  };

  return (
    <AssistantLayout
      open={assistantOpen}
      panel={<TabAssistant key={panelKey} spec={QUESTOES_SPEC} title="Assistente" notice={ASSIST_TEXTS.questoesNotice} form={assistantForm} onUse={useSuggestion} onClose={() => setAssistantOpen(false)} />}
    >
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={onClose}>
          Voltar à lista
        </Button>
        <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {!isNew && (
            <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
              {form.code} · respondida {form.attempts} {form.attempts === 1 ? "vez" : "vezes"}
            </span>
          )}
          <Button variant="secondary" size="sm" aria-pressed={assistantOpen} onClick={() => setAssistantOpen((o) => !o)}>
            Assistente
          </Button>
        </span>
      </div>
      {review && (
        <Banner
          tone="warning"
          title="Explicações a revisar"
          action={
            <Button size="sm" variant="secondary" loading={reviewState.saving} disabled={state.saving} onClick={reviewDone}>
              {unsaved ? "Salvar e marcar como revisadas" : "Marcar como revisadas"}
            </Button>
          }
        >
          {reviewText(review)}
        </Banner>
      )}
      {reviewState.error && <Banner tone="danger">{reviewState.error}</Banner>}
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>{isNew ? "Nova questão" : "Editar questão"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
            <SelectField label="Prova" value={form.kind} disabled={!isNew} onChange={(e) => set({ kind: e.target.value })} options={[{ value: "REVALIDA", label: "Revalida" }, { value: "ENAMED", label: "ENAMED" }]} />
            <TextField label="Ano" value={form.year} disabled={!isNew} inputMode="numeric" maxLength={4} onChange={(e) => set({ year: e.target.value })} />
            {form.kind !== "ENAMED" && (
              <SelectField label="Edição" value={form.semester} disabled={!isNew} onChange={(e) => set({ semester: e.target.value })} options={[{ value: "", label: "Única" }, { value: "1", label: "1º semestre" }, { value: "2", label: "2º semestre" }]} />
            )}
            <TextField label="Número" value={form.number} disabled={!isNew} inputMode="numeric" maxLength={4} onChange={(e) => set({ number: e.target.value })} />
          </div>
          {!isNew && <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Prova e número não mudam depois de criada (o código e o histórico dos alunos dependem deles).</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <SelectField label="Grande área" value={form.area} onChange={(e) => set({ area: e.target.value })} options={[{ value: "", label: "Escolha a área" }, ...AREA_OPTIONS]} />
            <TextField label="Tema" value={form.topic} maxLength={200} onChange={(e) => set({ topic: e.target.value })} />
            <TextField label="Subtema" value={form.subtopic} maxLength={300} onChange={(e) => set({ subtopic: e.target.value })} />
          </div>
          <TextArea label="Enunciado" rows={7} value={form.statement} onChange={(statement) => set({ statement })} />
        </div>
      </Card>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Alternativas e gabarito</h3>
          {form.options.map((o) => (
            <div key={o.id} style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr)", gap: 12, alignItems: "start" }}>
              <span style={{ width: 32, height: 32, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", font: "700 14px var(--font-sans)", background: form.correct_option === o.id ? "var(--success-bg)" : "var(--surface-sunken)", color: form.correct_option === o.id ? "var(--success-text)" : "var(--text-secondary)", marginTop: 26 }}>
                {o.id}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <TextArea label={`Alternativa ${o.id}`} rows={2} value={o.text} onChange={(text) => setOption(o.id, { text })} />
                <TextArea label={`Explicação da ${o.id} (opcional)`} rows={2} value={o.explanation} onChange={(explanation) => setOption(o.id, { explanation })} />
              </div>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, alignItems: "end" }}>
            <div>
              <div className="sm-field__label" style={{ marginBottom: 10 }}>
                Gabarito
              </div>
              <SegmentedControl
                label="Gabarito"
                value={form.correct_option}
                onChange={(correct_option) => !locked && set({ correct_option })}
                options={[...LETTERS, ...(form.status === "annulled" ? [""] : [])].map((value) => ({ value, label: value || "Sem", disabled: locked }))}
              />
            </div>
            <SelectField label="Situação" value={form.status} disabled={locked} onChange={(e) => set({ status: e.target.value })} options={Object.entries(QUESTION_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
          </div>
          {locked && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{LOCKED_TEXT}</div>
              <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
                {official
                  ? `Gabarito oficial atual: ${official.answer ? `${official.answer} (${OFFICIAL_LABEL[official.answer_status] ?? official.answer_status})` : OFFICIAL_LABEL[official.answer_status] ?? official.answer_status} · ${official.source ?? "sem fonte"} · versão ${official.version}`
                  : "Ainda não há registro do gabarito oficial desta questão."}
              </div>
              {officialNote && (
                <div role="status" style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>
                  {officialNote}
                </div>
              )}
              {isAdmin && !officialOpen && (
                <div>
                  <Button variant="secondary" size="sm" onClick={() => (setOfficialOpen(true), setOfficialNote(null))}>
                    Registrar gabarito oficial
                  </Button>
                </div>
              )}
              {isAdmin && officialOpen && <OfficialAnswerForm question={form} onCancel={() => setOfficialOpen(false)} onDone={officialDone} />}
            </div>
          )}
          {form.status === "annulled" && (
            <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
              Questão anulada: o aluno não vê a explicação de cada alternativa (nenhuma é a correta).
            </div>
          )}
          <Checkbox
            label={form.images?.length ? "Cita figura (a imagem está vinculada)" : "Cita uma figura que não está vinculada (fica fora dos treinos)"}
            checked={form.needs_image}
            onChange={(e) => set({ needs_image: e.target.checked })}
          />
        </div>
      </Card>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Comentário</h3>
          <TextArea label="Conduta esperada" rows={3} value={form.expected_conduct} onChange={(expected_conduct) => set({ expected_conduct })} />
          <TextArea label="O que a questão avalia" rows={3} value={form.inep_intent} onChange={(inep_intent) => set({ inep_intent })} />
        </div>
      </Card>
      {textChanged && (
        <Banner tone="warning" title="A análise publicada sai do ar">
          Você mudou o enunciado ou o texto de uma alternativa. Ao salvar, a análise publicada desta questão (se houver) sai do ar para o aluno e só volta quando uma nova análise for aprovada por um revisor médico.
        </Banner>
      )}
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
        {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Questão salva.</span>}
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
        <Button type="submit" loading={state.saving}>
          {isNew ? "Criar questão" : "Salvar questão"}
        </Button>
      </div>
    </form>
    </AssistantLayout>
  );
}

// ---------------------------------------------------------------- importação
function ImportPanel({ onClose, onImported }) {
  const { backend } = useSession();
  const [file, setFile] = React.useState(null); // { name, items, fileError }
  const [update, setUpdate] = React.useState(false);
  const [state, setState] = React.useState({ importing: false, result: null, error: null });
  const [preview, setPreview] = React.useState(null); // { data } | { error } | { loading }
  const [previewTry, setPreviewTry] = React.useState(0); // "Conferir de novo" depois de uma prévia que falhou

  const pick = async (event) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    setState({ importing: false, result: null, error: null });
    if (chosen.size > 20 * 1024 * 1024) return setFile({ name: chosen.name, items: [], fileError: "Arquivo grande demais (máximo de 20 MB)." });
    const parsed = questionsFromFile(chosen.name, await chosen.text());
    setFile({ name: chosen.name, ...parsed, items: markDuplicates(parsed.items) });
  };

  const items = file?.items ?? [];
  const withProblems = items.filter((i) => i.problems.length);
  const byExam = items.reduce((acc, { question: q }) => {
    if (!q.kind || !q.year) return acc;
    const key = `${q.kind === "ENAMED" ? "ENAMED" : "Revalida"} ${q.year}${q.semester ? `/${q.semester}` : ""}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const figures = items.filter((i) => i.question.needs_image).length;
  const tooMany = items.length > 1000;

  // prévia (Q03): antes de gravar, quantas são novas, quantas já existem, quantas perderiam comentário e quantas têm
  // gabarito ou situação diferente; só quando o arquivo não tem problema
  React.useEffect(() => {
    const list = file?.items ?? [];
    if (!list.length || file?.fileError || list.some((i) => i.problems.length) || list.length > 1000) {
      setPreview(null);
      return undefined;
    }
    let alive = true;
    setPreview({ loading: true });
    backend.rpc("app_admin_import_preview", { p_questions: list.map((i) => i.question) }).then(
      (data) => alive && setPreview({ data }),
      (error) => alive && setPreview({ error: messageOf(error, "Não foi possível conferir o arquivo com o banco. Tente de novo.") })
    );
    return () => {
      alive = false;
    };
  }, [file, backend, previewTry]);
  const p = preview?.data;
  const lose = p?.lose_comment ?? [];
  const differs = p?.answer_differs ?? [];

  const run = async () => {
    setState({ importing: true, result: null, error: null });
    try {
      const result = await backend.rpc("app_admin_import_questions", { p_questions: items.map((i) => i.question), p_update_existing: update });
      setState({ importing: false, result, error: null });
      if (result.ok) onImported();
    } catch (error) {
      setState({ importing: false, result: null, error: messageOf(error) });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={onClose}>
          Voltar à lista
        </Button>
      </div>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Carregar questões</h3>
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>
            Use uma planilha (CSV, salva do Excel ou do Google Planilhas) ou um arquivo JSON, com uma questão por linha. A prova é criada automaticamente. Antes de gravar, o app confere todas as linhas e mostra o que precisa ser corrigido.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" size="sm" icon="download" onClick={() => downloadText("modelo-questoes.csv", csvTemplate(), "text/csv")}>
              Modelo de planilha (CSV)
            </Button>
            <Button variant="secondary" size="sm" icon="download" onClick={() => downloadText("modelo-questoes.json", jsonTemplate(), "application/json")}>
              Modelo JSON
            </Button>
          </div>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            Colunas obrigatórias: prova (ex.: Revalida 2026/2), numero, area, tema, enunciado, A, B, C, D e gabarito (A a D, ou ANULADA). Opcionais: subtema, explicacao, conduta esperada, situacao e fonte.
          </div>
          <label className="sm-btn sm-btn--primary" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
            <Icon name="upload" size={18} /> Escolher arquivo
            <input type="file" accept=".csv,.json,text/csv,application/json" onChange={pick} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} aria-label="Arquivo de questões" />
          </label>
        </div>
      </Card>
      {file && (
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ font: "var(--type-label)" }}>{file.name}</div>
            {file.fileError ? (
              <Banner tone="danger">{file.fileError}</Banner>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
                  <div>
                    <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Questões no arquivo</div>
                    <div style={{ font: "700 26px var(--font-sans)" }}>{items.length}</div>
                  </div>
                  <div>
                    <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Com problema</div>
                    <div style={{ font: "700 26px var(--font-sans)", color: withProblems.length ? "var(--danger-text)" : "var(--success-text)" }}>{withProblems.length}</div>
                  </div>
                  <div>
                    <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Citam figura</div>
                    <div style={{ font: "700 26px var(--font-sans)" }}>{figures}</div>
                  </div>
                </div>
                {Object.keys(byExam).length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {Object.entries(byExam).map(([exam, n]) => (
                      <Badge key={exam}>
                        {exam}: {n}
                      </Badge>
                    ))}
                  </div>
                )}
                {figures > 0 && <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>As que citam figura ficam fora dos treinos até a imagem ser vinculada.</div>}
                {tooMany && <Banner tone="danger">Importe no máximo 1.000 questões por vez. Divida o arquivo.</Banner>}
                {withProblems.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Banner tone="warning" title="Corrija o arquivo e escolha de novo">
                      Nenhuma questão é gravada enquanto houver problema.
                    </Banner>
                    <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, font: "var(--type-body-sm)" }}>
                      {withProblems.slice(0, 50).map((item) => (
                        <li key={item.line}>
                          <b>{/\.json$/i.test(file.name) ? `Item ${item.line}` : `Linha ${item.line}`}</b>
                          {item.question.number ? ` (questão ${item.question.number})` : ""}: {item.problems.join(" ")}
                        </li>
                      ))}
                    </ul>
                    {withProblems.length > 50 && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>e mais {withProblems.length - 50} linhas com problema.</span>}
                  </div>
                )}
                {preview?.loading && <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Conferindo o arquivo com o banco…</div>}
                {preview?.error && (
                  <Banner
                    tone="danger"
                    action={
                      <Button size="sm" variant="secondary" onClick={() => setPreviewTry((n) => n + 1)}>
                        Conferir de novo
                      </Button>
                    }
                  >
                    {`${preview.error} A importação só fica liberada depois dessa conferência.`}
                  </Banner>
                )}
                {p && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ font: "var(--type-body-sm)" }}>
                      {`${p.new} ${p.new === 1 ? "nova" : "novas"} · ${p.existing} ${p.existing === 1 ? "já existe" : "já existem"} (mesma prova e número)`}
                    </div>
                    {p.existing > 0 && !update && (
                      <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
                        {p.existing === 1 ? "A que já existe será pulada." : `As ${p.existing} que já existem serão puladas.`} Para atualizar, marque a opção abaixo.
                      </div>
                    )}
                    {p.existing > 0 && update && lose.length > 0 && (
                      <Banner tone="warning" title={`${lose.length} ${lose.length === 1 ? "perderia o comentário gravado" : "perderiam o comentário gravado"}`}>
                        {`O comentário preenchido no arquivo (explicação, conduta esperada ou o que a questão avalia) substitui o que está gravado: ${codesText(lose.map((x) => x.code))}.`}
                      </Banner>
                    )}
                    {p.existing > 0 && update && lose.length === 0 && (
                      <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Nenhuma perde comentário: o que vier vazio no arquivo não apaga o que está gravado.</div>
                    )}
                    {update && differs.length > 0 && (
                      <Banner tone="warning" title={`${differs.length} ${differs.length === 1 ? "tem gabarito ou situação diferente do arquivo" : "têm gabarito ou situação diferente do arquivo"}`}>
                        {`Essas não serão atualizadas: o gabarito e a situação só mudam pelo registro do gabarito oficial (administrador). ${codesText(
                          differs.map((x) => `${x.code} (gravado ${x.stored ?? "sem gabarito"}, no arquivo ${x.file ?? "sem gabarito"})`)
                        )}.`}
                      </Banner>
                    )}
                  </div>
                )}
                <Checkbox
                  label="Atualizar as questões que já existem (mesma prova e número): só os campos preenchidos no arquivo; gabarito e situação nunca mudam aqui. Desmarcado, elas são puladas."
                  checked={update}
                  onChange={(e) => setUpdate(e.target.checked)}
                />
                {state.error && <Banner tone="danger">{state.error}</Banner>}
                {state.result?.ok && (
                  <Banner tone="success" title="Importação concluída">
                    {`${state.result.inserted} novas · ${state.result.updated} atualizadas · ${state.result.skipped} já existiam (puladas)${
                      state.result.answer_differs ? ` · ${state.result.answer_differs} com gabarito ou situação diferente (não mudaram)` : ""
                    }`}
                  </Banner>
                )}
                {state.result && !state.result.ok && (
                  <Banner tone="danger" title="O banco recusou o arquivo">
                    {state.result.errors.slice(0, 10).map((e) => `Item ${e.index}: ${e.message}`).join(" · ")}
                  </Banner>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {/* só depois da prévia (Q03): antes de gravar, a pessoa vê quantas perderiam comentário */}
                  <Button icon="upload" onClick={run} loading={state.importing} disabled={!items.length || withProblems.length > 0 || tooMany || !p || state.result?.ok}>
                    Importar {items.length} {items.length === 1 ? "questão" : "questões"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- lista
export function AdminQuestions() {
  const { backend } = useSession();
  const mobile = useMobile();
  const [view, setView] = React.useState({ mode: "list", id: null }); // list | edit | new | import
  const [filters, setFilters] = React.useState({ search: "", exam_id: "", area: "", status: "", needs_image: false, review: false });
  const [limit, setLimit] = React.useState(PAGE);
  const search = useDebounced(filters.search.trim());
  const list = useLoad(
    () => backend.rpc("app_admin_questions", { p_filters: { ...filters, search }, p_limit: limit }),
    [backend, search, filters.exam_id, filters.area, filters.status, filters.needs_image, filters.review, limit]
  );
  const set = (patch) => (setFilters((f) => ({ ...f, ...patch })), setLimit(PAGE));
  const back = () => setView({ mode: "list", id: null });

  if (view.mode === "edit" || view.mode === "new") return <QuestionEditor key={view.id ?? "nova"} id={view.id} onClose={back} onSaved={list.reload} />;
  if (view.mode === "import") return <ImportPanel onClose={back} onImported={list.reload} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button icon="upload" onClick={() => setView({ mode: "import", id: null })}>
          Carregar questões
        </Button>
        <Button variant="secondary" icon="plus" onClick={() => setView({ mode: "new", id: null })}>
          Nova questão
        </Button>
      </div>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,2fr) repeat(3,minmax(0,1fr))", gap: 12 }}>
            <TextField label="Buscar" icon="search" placeholder="Código, tema ou palavras do enunciado" value={filters.search} onChange={(e) => set({ search: e.target.value })} />
            <SelectField label="Prova" value={filters.exam_id} onChange={(e) => set({ exam_id: e.target.value })} options={[{ value: "", label: "Todas" }, ...(list.data?.exams ?? []).map((e) => ({ value: e.id, label: `${e.title} (${e.question_count})` }))]} />
            <SelectField label="Área" value={filters.area} onChange={(e) => set({ area: e.target.value })} options={[{ value: "", label: "Todas" }, ...AREA_OPTIONS]} />
            <SelectField label="Situação" value={filters.status} onChange={(e) => set({ status: e.target.value })} options={[{ value: "", label: "Todas" }, ...Object.entries(QUESTION_STATUS_LABEL).map(([value, label]) => ({ value, label }))]} />
          </div>
          <Checkbox label="Só as que citam figura sem imagem vinculada" checked={filters.needs_image} onChange={(e) => set({ needs_image: e.target.checked })} />
          <Checkbox label="Só as com explicações a revisar (o gabarito mudou)" checked={filters.review} onChange={(e) => set({ review: e.target.checked })} />
        </div>
      </Card>
      {list.error && <LoadError error={list.error} retry={list.reload} />}
      {!list.data && !list.error && <Loading />}
      {list.data && (
        <>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }} aria-live="polite">
            {list.data.total} {list.data.total === 1 ? "questão" : "questões"}
          </div>
          {list.data.items.length === 0 ? (
            <EmptyState icon="file-question" title="Nenhuma questão encontrada" description="Ajuste a busca ou carregue questões." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {list.data.items.map((q) => (
                <ListRow key={q.id} onClick={() => setView({ mode: "edit", id: q.id })} label={`Editar ${q.code}`}>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ font: "600 13px var(--font-mono)", color: "var(--text-secondary)" }}>{q.code}</span>
                      <Badge tone="brand" size="sm">
                        {areaLabel(q.area)}
                      </Badge>
                      {q.status !== "valid" && (
                        <Badge tone={statusTone[q.status]} size="sm">
                          {QUESTION_STATUS_LABEL[q.status]}
                        </Badge>
                      )}
                      {q.explanations_review && (
                        <Badge tone="warning" size="sm">
                          Revisar explicações
                        </Badge>
                      )}
                      {q.needs_image && !q.images && (
                        <Badge tone="warning" size="sm" icon="image">
                          Sem figura
                        </Badge>
                      )}
                    </div>
                    <span style={{ font: "600 15px var(--font-sans)", color: "var(--text-primary)" }}>{q.topic}</span>
                    <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.excerpt}</span>
                  </div>
                  <Icon name="chevron-right" size={18} style={{ color: "var(--text-tertiary)", flex: "none", alignSelf: "center" }} />
                </ListRow>
              ))}
            </div>
          )}
          {list.data.items.length < list.data.total && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Button variant="secondary" onClick={() => setLimit((n) => n + PAGE)} loading={list.loading}>
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
