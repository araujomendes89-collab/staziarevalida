// Administração das aulas (equipe): cadastro com a estrutura padrão, envio de slides (PDF) e áudio Flashcast (MP3),
// diretriz por endereço, publicação e exclusão. Os arquivos sobem pelo servidor (/api/lessons) para o depósito privado.
import React from "react";
import { Badge, Banner, Button, Card, SelectField, Switch, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { AREAS, areaLabel } from "../practice/format.js";
import { lessonsAvailable, sizeLabel, uploadLessonFile } from "../study/lessonsApi.js";
import { dateTimeBR, LoadError, Loading, messageOf, TextArea, useLoad } from "./common.jsx";

const EMPTY = { area: "CLINICA_MEDICA", topic: "", title: "", duration_minutes: "", instructor: "", specialty: "", video_url: "", summary: "", key_points: "", guideline_title: "", guideline_url: "", published: false, position: 0 };
const toForm = (l) => ({ ...EMPTY, ...l, duration_minutes: l.duration_minutes ?? "", key_points: (l.key_points ?? []).join("\n"), instructor: l.instructor ?? "", specialty: l.specialty ?? "", video_url: l.video_url ?? "", summary: l.summary ?? "", guideline_title: l.guideline_title ?? "", guideline_url: l.guideline_url ?? "" });

function Materials({ lesson, onChanged }) {
  const { backend } = useSession();
  const [state, setState] = React.useState({ busy: null, error: null });
  const send = async (kind, file) => {
    if (!file) return;
    setState({ busy: kind, error: null });
    try {
      onChanged(await uploadLessonFile(backend, lesson.id, file, kind));
      setState({ busy: null, error: null });
    } catch (error) {
      setState({ busy: null, error: error.message });
    }
  };
  const remove = async (id) => {
    setState({ busy: id, error: null });
    try {
      onChanged(await backend.rpc("app_admin_delete_lesson_material", { p_id: id }));
      setState({ busy: null, error: null });
    } catch (error) {
      setState({ busy: null, error: messageOf(error) });
    }
  };
  const canUpload = lessonsAvailable(backend);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ font: "var(--type-label)" }}>Materiais complementares</div>
      {!canUpload && <Banner tone="warning">O envio de arquivos precisa do servidor (não funciona no banco local do navegador).</Banner>}
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
        <label className="sm-btn sm-btn--secondary" style={{ cursor: canUpload ? "pointer" : "not-allowed" }}>
          {state.busy === "slides" ? "Enviando…" : "Enviar slides (PDF)"}
          <input type="file" accept="application/pdf" hidden disabled={!canUpload || Boolean(state.busy)} onChange={(e) => send("slides", e.target.files?.[0])} />
        </label>
        <label className="sm-btn sm-btn--secondary" style={{ cursor: canUpload ? "pointer" : "not-allowed" }}>
          {state.busy === "flashcast" ? "Enviando…" : "Enviar áudio Flashcast (MP3)"}
          <input type="file" accept="audio/mpeg,.mp3" hidden disabled={!canUpload || Boolean(state.busy)} onChange={(e) => send("flashcast", e.target.files?.[0])} />
        </label>
      </div>
      {lesson.materials.map((m) => (
        <div key={m.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", borderRadius: 12, background: "var(--surface-subtle)" }}>
          <Badge size="sm">{{ slides: "Slides", flashcast: "Flashcast", guideline: "Diretriz", other: "Material" }[m.kind]}</Badge>
          <span style={{ flex: 1, minWidth: 0, font: "var(--type-body-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}{m.size_bytes ? ` · ${sizeLabel(m.size_bytes)}` : ""}{m.url ? ` · ${m.url}` : ""}</span>
          <Button size="sm" variant="ghost" icon="trash-2" loading={state.busy === m.id} onClick={() => remove(m.id)}>Remover</Button>
        </div>
      ))}
    </div>
  );
}

function LessonEditor({ lesson, topics, onSaved, onClose, isAdmin }) {
  const { backend } = useSession();
  const [form, setForm] = React.useState(() => (lesson ? toForm(lesson) : EMPTY));
  const [current, setCurrent] = React.useState(lesson);
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  const set = (patch) => (setForm((f) => ({ ...f, ...patch })), setState((s) => ({ ...s, done: false })));
  const save = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null, done: false });
    try {
      const saved = await backend.rpc("app_admin_save_lesson", {
        p_lesson: { ...form, id: current?.id, duration_minutes: form.duration_minutes === "" ? null : Number(form.duration_minutes), position: Number(form.position) || 0, key_points: form.key_points.split("\n") },
      });
      setCurrent(saved);
      setForm(toForm(saved));
      onSaved(saved);
      setState({ saving: false, error: null, done: true });
    } catch (error) {
      setState({ saving: false, error: messageOf(error), done: false });
    }
  };
  const remove = async () => {
    if (!current || !window.confirm(`Apagar a aula "${current.title}"? Os materiais também somem.`)) return;
    try {
      await backend.rpc("app_admin_delete_lesson", { p_id: current.id });
      onSaved(null, current.id);
      onClose();
    } catch (error) {
      setState({ saving: false, error: messageOf(error), done: false });
    }
  };
  const areaTopics = topics.filter((t) => t.area === form.area);
  return (
    <Card>
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>{current ? "Editar aula" : "Nova aula"}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            {current && isAdmin && <Button variant="ghost" icon="trash-2" onClick={remove}>Apagar</Button>}
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
          </div>
        </div>
        {state.error && <Banner tone="danger">{state.error}</Banner>}
        {state.done && <Banner tone="success">Aula salva.</Banner>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
          <SelectField label="Grande área" value={form.area} onChange={(e) => set({ area: e.target.value })} options={AREAS.map((a) => ({ value: a.id, label: a.label }))} />
          <div>
            <TextField label="Tema" value={form.topic} onChange={(e) => set({ topic: e.target.value })} list="lesson-topics" hint="Use o mesmo nome do tema das questões para o botão 'Treinar questões deste tema' cair no tema certo." />
            <datalist id="lesson-topics">{areaTopics.map((t) => <option key={t.topic} value={t.topic}>{`${t.questions} questões`}</option>)}</datalist>
          </div>
          <TextField label="Título da aula" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
          <TextField label="Duração estimada (min)" type="number" min={1} max={600} value={form.duration_minutes} onChange={(e) => set({ duration_minutes: e.target.value })} />
          <TextField label="Professor / convidado" value={form.instructor} maxLength={160} onChange={(e) => set({ instructor: e.target.value })} />
          <TextField label="Especialidade" value={form.specialty} maxLength={120} onChange={(e) => set({ specialty: e.target.value })} />
          <TextField label="Vídeo (YouTube, Vimeo ou MP4, https)" value={form.video_url} onChange={(e) => set({ video_url: e.target.value })} hint="O vídeo fica hospedado fora; aqui entra só o endereço." />
          <TextField label="Posição" type="number" value={form.position} onChange={(e) => set({ position: e.target.value })} hint="Ordem dentro da área." />
          <TextField label="Diretriz SUS / PCDT: título" value={form.guideline_title} maxLength={200} onChange={(e) => set({ guideline_title: e.target.value })} />
          <TextField label="Diretriz SUS / PCDT: endereço (https)" value={form.guideline_url} onChange={(e) => set({ guideline_url: e.target.value })} />
        </div>
        <TextArea label="Resumo & racionalidade clínica" value={form.summary} rows={6} maxLength={8000} onChange={(v) => set({ summary: v })} />
        <TextArea label="Pontos-chave para o Revalida (um por linha)" value={form.key_points} rows={5} onChange={(v) => set({ key_points: v })} />
        <Switch label="Publicada" description="Só aulas publicadas aparecem para os alunos." checked={Boolean(form.published)} onChange={(e) => set({ published: e.target.checked })} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button type="submit" loading={state.saving}>{current ? "Salvar alterações" : "Criar aula"}</Button>
        </div>
      </form>
      {current && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
          <Materials lesson={current} onChanged={(l) => (setCurrent(l), onSaved(l))} />
        </div>
      )}
      {!current && <p style={{ margin: "12px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Salve a aula para anexar slides e áudio.</p>}
    </Card>
  );
}

export function AdminLessons() {
  const { backend, boot } = useSession();
  const mobile = useMobile();
  const { data, error, reload, setData } = useLoad(() => Promise.all([backend.rpc("app_admin_lessons"), backend.rpc("app_lesson_topics", { p_area: null })]).then(([a, t]) => ({ ...a, topics: t })), [backend]);
  const [editing, setEditing] = React.useState(undefined); // undefined fechado · null nova · objeto edita
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const onSaved = (saved, removedId) => {
    setData({ ...data, lessons: removedId ? data.lessons.filter((l) => l.id !== removedId) : data.lessons.some((l) => l.id === saved.id) ? data.lessons.map((l) => (l.id === saved.id ? { ...l, ...saved } : l)) : [...data.lessons, saved] });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{data.lessons.length} {data.lessons.length === 1 ? "aula" : "aulas"} · {data.lessons.filter((l) => l.published).length} publicadas</span>
        <Button icon="plus" onClick={() => setEditing(null)}>Nova aula</Button>
      </div>
      {editing !== undefined && <LessonEditor key={editing?.id ?? "nova"} lesson={editing} topics={data.topics} isAdmin={boot.role === "admin"} onSaved={onSaved} onClose={() => setEditing(undefined)} />}
      <Card padding={8}>
        {data.lessons.length === 0 && <p style={{ margin: 0, padding: 16, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Nenhuma aula cadastrada. Crie a primeira com a estrutura padrão: área, tema, título, duração, professor, vídeo, materiais, resumo e pontos-chave.</p>}
        {data.lessons.map((l) => (
          <button key={l.id} type="button" onClick={() => setEditing(l)} style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", padding: "10px 12px", border: 0, borderRadius: 12, background: "transparent", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}>
            <Badge size="sm" tone={l.published ? "success" : "neutral"}>{l.published ? "Publicada" : "Rascunho"}</Badge>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", font: "600 14px var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</span>
              <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                {areaLabel(l.area)} · {l.topic}{l.duration_minutes ? ` · ${l.duration_minutes} min` : ""} · {l.materials.length} {l.materials.length === 1 ? "material" : "materiais"}{!mobile && ` · ${l.started_by} iniciaram, ${l.completed_by} concluíram · ${dateTimeBR(l.updated_at)}`}
              </span>
            </span>
            {!l.video_url && <Badge size="sm" tone="warning">sem vídeo</Badge>}
          </button>
        ))}
      </Card>
    </div>
  );
}
