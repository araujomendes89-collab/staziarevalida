// Questões: busca, edição, nova questão e carregamento em lote (planilha CSV ou JSON).
import React from "react";
import { Badge, Banner, Button, Card, Checkbox, EmptyState, Icon, SegmentedControl, SelectField, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { AREAS, areaLabel } from "../practice/format.js";
import { csvTemplate, jsonTemplate, markDuplicates, questionsFromFile } from "./questionImport.js";
import { downloadText, ListRow, LoadError, Loading, messageOf, QUESTION_STATUS_LABEL, TextArea, useDebounced, useLoad } from "./common.jsx";

const PAGE = 50;
const LETTERS = ["A", "B", "C", "D"];
const statusTone = { valid: "success", annulled: "danger", changed_after_appeal: "warning" };
const AREA_OPTIONS = AREAS.map((a) => ({ value: a.id, label: a.label }));

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
  };
}

function QuestionEditor({ id, onClose, onSaved }) {
  const { backend } = useSession();
  const existing = useLoad(() => (id ? backend.rpc("app_admin_question", { p_id: id }) : Promise.resolve(null)), [backend, id]);
  const [form, setForm] = React.useState(id ? null : emptyQuestion());
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  React.useEffect(() => {
    if (existing.data) setForm(fromRow(existing.data));
  }, [existing.data]);

  if (existing.error) return <LoadError error={existing.error} retry={existing.reload} />;
  if (!form) return <Loading />;

  const set = (patch) => (setForm((f) => ({ ...f, ...patch })), setState((s) => ({ ...s, done: false })));
  const setOption = (letter, patch) => set({ options: form.options.map((o) => (o.id === letter ? { ...o, ...patch } : o)) });
  const isNew = !form.id;

  const save = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null, done: false });
    try {
      const saved = await backend.rpc("app_admin_save_question", {
        p_question: {
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
        },
      });
      setForm(fromRow(saved));
      setState({ saving: false, error: null, done: true });
      onSaved();
    } catch (error) {
      setState({ saving: false, error: messageOf(error), done: false });
    }
  };

  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={onClose}>
          Voltar à lista
        </Button>
        {!isNew && (
          <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            {form.code} · respondida {form.attempts} {form.attempts === 1 ? "vez" : "vezes"}
          </span>
        )}
      </div>
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
              <SegmentedControl label="Gabarito" value={form.correct_option} onChange={(correct_option) => set({ correct_option })} options={[...LETTERS, ...(form.status === "annulled" ? [{ value: "", label: "Sem" }] : [])]} />
            </div>
            <SelectField label="Situação" value={form.status} onChange={(e) => set({ status: e.target.value })} options={Object.entries(QUESTION_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
          </div>
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
  );
}

// ---------------------------------------------------------------- importação
function ImportPanel({ onClose, onImported }) {
  const { backend } = useSession();
  const [file, setFile] = React.useState(null); // { name, items, fileError }
  const [update, setUpdate] = React.useState(false);
  const [state, setState] = React.useState({ importing: false, result: null, error: null });

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
                <Checkbox label="Atualizar as questões que já existem (mesma prova e número). Desmarcado, elas são puladas." checked={update} onChange={(e) => setUpdate(e.target.checked)} />
                {state.error && <Banner tone="danger">{state.error}</Banner>}
                {state.result?.ok && (
                  <Banner tone="success" title="Importação concluída">
                    {state.result.inserted} novas · {state.result.updated} atualizadas · {state.result.skipped} já existiam (puladas)
                  </Banner>
                )}
                {state.result && !state.result.ok && (
                  <Banner tone="danger" title="O banco recusou o arquivo">
                    {state.result.errors.slice(0, 10).map((e) => `Item ${e.index}: ${e.message}`).join(" · ")}
                  </Banner>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button icon="upload" onClick={run} loading={state.importing} disabled={!items.length || withProblems.length > 0 || tooMany || state.result?.ok}>
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
  const [filters, setFilters] = React.useState({ search: "", exam_id: "", area: "", status: "", needs_image: false });
  const [limit, setLimit] = React.useState(PAGE);
  const search = useDebounced(filters.search.trim());
  const list = useLoad(
    () => backend.rpc("app_admin_questions", { p_filters: { ...filters, search }, p_limit: limit }),
    [backend, search, filters.exam_id, filters.area, filters.status, filters.needs_image, limit]
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
