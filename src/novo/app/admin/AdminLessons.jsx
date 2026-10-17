// Administração das aulas (equipe): cadastro com a estrutura padrão, assistente de IA (LessonAssistant.jsx), materiais complementares já na criação
// (PDF complementar, áudio Flashcast em MP3 e diretriz SUS/PCDT por link), publicação e exclusão. Os arquivos vão
// para o depósito privado "lessons" (com o Supabase, direto do navegador por envio assinado; ver server/lessons/router.ts).
import React from "react";
import { TextoRico } from "../textoRico/TextoRico.jsx";
import { Badge, Banner, Button, Card, Icon, SelectField, Switch, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { AREAS, areaLabel } from "../practice/format.js";
import { lessonFileUrl, lessonsAvailable, materialTitle, removeLesson, removeLessonMaterial, sizeLabel, sweepLessonFiles, uploadErrorText, uploadLessonFile, videoPlaysInside } from "../study/lessonsApi.js";
import { dateTimeBR, LoadError, Loading, messageOf, useLoad } from "./common.jsx";
import { CampoTexto } from "../textoRico/CampoTexto.jsx";
import { LessonAssistant } from "./LessonAssistant.jsx";
import EditorResumo from "../editorPro/editarAula/EditorResumo.jsx";
import { resumoRicoValido } from "../../../shared/docRico/modulos/editarAula";
import EditorPontosChave from "../editorPro/editarAula/EditorPontosChave.jsx";
import { pontosParaSalvar } from "../../../shared/aulas/camposRicos";

const EMPTY = { area: "CLINICA_MEDICA", topic: "", title: "", duration_minutes: "", instructor: "", specialty: "", video_url: "", summary: "", summary_rico: null, key_points: "", key_points_rico: null, guideline_title: "", guideline_url: "", published: false, position: 0, review_note: "" };
// Quem conferiu, quando e os avisos guardados da IA vêm da aula, mas não entram no formulário: a conferência é sempre nova (A01).
const toForm = ({ ai_notes, reviewer, reviewed_at, ...l }) => ({ ...EMPTY, ...l, review_note: "", duration_minutes: l.duration_minutes ?? "", key_points: (l.key_points ?? []).join("\n"), instructor: l.instructor ?? "", specialty: l.specialty ?? "", video_url: l.video_url ?? "", summary: l.summary ?? "", summary_rico: l.summary_rico ?? null, key_points_rico: l.key_points_rico ?? null, guideline_title: l.guideline_title ?? "", guideline_url: l.guideline_url ?? "" });

// Os três materiais da aula, como no app anterior: PDF complementar, áudio Flashcast e a diretriz SUS/PCDT (link).
const FILE_SLOTS = [
  { kind: "slides", label: "Material complementar (PDF)", icon: "file-text", accept: "application/pdf,.pdf", pick: "Escolher PDF" },
  { kind: "flashcast", label: "Áudio Flashcast (MP3)", icon: "headphones", accept: "audio/mpeg,.mp3", pick: "Escolher MP3" },
];

function SlotRow({ icon, label, available, detail, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: 14, border: "1px solid var(--border-subtle)", background: "var(--surface-subtle)" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", color: "var(--text-brand)" }}><Icon name={icon} size={18} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", font: "600 14px var(--font-sans)" }}>{label}</span>
          {detail && <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</span>}
        </span>
        {available === true && <Badge size="sm" tone="success" icon="check">Disponível</Badge>}
        {available === "pending" && <Badge size="sm" tone="info">Será enviado ao criar a aula</Badge>}
        {available === false && <Badge size="sm">Não disponível</Badge>}
      </div>
      {children}
    </div>
  );
}

/**
 * Áudio enviado que ainda não foi conferido: os alunos não o ouvem (continuam com o anterior, se houver). Só o administrador ou
 * o revisor médico da área libera (o banco decide: can_release); o editor só vê o estado. "Ouvir e liberar" carrega o áudio e
 * só então oferece "Liberar para os alunos".
 */
function PendingAudio({ material, hasPrevious, backend, onChanged, onRemove, busy }) {
  const [state, setState] = React.useState({ url: null, loading: false, releasing: false, error: null });
  const listen = async () => {
    setState((s) => ({ ...s, url: null, loading: true, error: null }));
    try {
      const url = await lessonFileUrl(backend, material.id);
      setState({ url, loading: false, releasing: false, error: null });
    } catch (error) {
      setState({ url: null, loading: false, releasing: false, error: messageOf(error) });
    }
  };
  const release = async () => {
    setState((s) => ({ ...s, releasing: true, error: null }));
    try {
      const released = await backend.rpc("app_admin_release_lesson_audio", { p_id: material.id });
      onChanged(released);
      sweepLessonFiles(backend); // o áudio que este substituiu sai do depósito
    } catch (error) {
      setState((s) => ({ ...s, releasing: false, error: messageOf(error) }));
    }
  };
  return (
    <Banner tone="warning" title="Áudio aguardando conferência">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span>
          {material.file_title ?? material.title}{material.size_bytes ? ` · ${sizeLabel(material.size_bytes)}` : ""}.{" "}
          {hasPrevious ? "Os alunos continuam ouvindo o áudio anterior até este ser liberado." : "Os alunos só ouvem depois que for liberado."}
        </span>
        {state.error && <span>{state.error}</span>}
        {material.can_release ? (
          <>
            {state.url && <audio controls src={state.url} aria-label="Ouvir o áudio aguardando conferência" style={{ width: "100%" }} />}
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button size="sm" variant={state.url ? "ghost" : "secondary"} icon="headphones" loading={state.loading} onClick={listen}>Ouvir e liberar</Button>
              {state.url && <Button size="sm" icon="check" loading={state.releasing} onClick={release}>Liberar para os alunos</Button>}
              <Button size="sm" variant="ghost" icon="trash-2" loading={busy} onClick={onRemove}>Remover</Button>
            </span>
          </>
        ) : (
          <>
            <span>Só o administrador ou o revisor médico da área pode ouvir e liberar este áudio.</span>
            <span><Button size="sm" variant="ghost" icon="trash-2" loading={busy} onClick={onRemove}>Remover</Button></span>
          </>
        )}
      </div>
    </Banner>
  );
}

/**
 * Materiais complementares, já na criação da aula. Aula nova: os arquivos escolhidos ficam guardados e sobem logo depois
 * de criar a aula. Aula salva: o arquivo sobe na hora (com o Supabase vai direto ao depósito privado "lessons").
 */
function MaterialsSection({ lesson, pending, setPending, onChanged, form, set }) {
  const { backend } = useSession();
  const [state, setState] = React.useState({ busy: null, error: null });
  const canUpload = lessonsAvailable(backend);
  const choose = async (kind, file) => {
    if (!file) return;
    if (!lesson) return setPending((p) => ({ ...p, [kind]: file }));
    setState({ busy: kind, error: null });
    try {
      onChanged(await uploadLessonFile(backend, lesson.id, file, kind));
      setState({ busy: null, error: null });
    } catch (error) {
      setState({ busy: null, error: uploadErrorText(error) });
    }
  };
  const remove = async (id) => {
    setState({ busy: id, error: null });
    try {
      onChanged(await removeLessonMaterial(backend, id));
      setState({ busy: null, error: null });
    } catch (error) {
      setState({ busy: null, error: messageOf(error) });
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ font: "var(--type-label)" }}>Materiais complementares</div>
      <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Ao remover ou trocar um arquivo, o arquivo antigo também é apagado do depósito, sem volta (se nenhum outro material o usa).</span>
      {!canUpload && <Banner tone="warning">O envio de arquivos precisa do servidor (não funciona no banco local do navegador).</Banner>}
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {lesson?.materials?.some((x) => x.sha_pendente) && (
        <Banner tone="warning" title="Arquivo escondido do aluno">
          Não foi possível conferir a impressão digital do arquivo; confira antes de liberar. Por segurança, ele fica escondido do aluno. Para liberar, envie o arquivo de novo.
        </Banner>
      )}
      {FILE_SLOTS.map((slot) => {
        const m = lesson?.materials?.find((x) => x.kind === slot.kind && x.review_status !== "pending"); // o que os alunos recebem
        const waiting = lesson?.materials?.find((x) => x.kind === slot.kind && x.review_status === "pending");
        const chosen = pending?.[slot.kind];
        const busy = state.busy === slot.kind;
        return (
          <SlotRow key={slot.kind} icon={slot.icon} label={slot.label} available={m ? true : chosen ? "pending" : false} detail={m ? `${materialTitle(m.file_title ?? m.title)}${m.size_bytes ? ` · ${sizeLabel(m.size_bytes)}` : ""}` : chosen ? `${chosen.name} · ${sizeLabel(chosen.size)}` : null}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label className="sm-btn sm-btn--secondary sm-btn--sm" style={{ cursor: canUpload && !state.busy ? "pointer" : "not-allowed", opacity: canUpload ? 1 : 0.6 }}>
                {busy ? "Enviando…" : m || chosen ? "Trocar arquivo" : slot.pick}
                <input type="file" accept={slot.accept} hidden disabled={!canUpload || Boolean(state.busy)} onChange={(e) => (choose(slot.kind, e.target.files?.[0]), (e.target.value = ""))} />
              </label>
              {m && <Button size="sm" variant="ghost" icon="trash-2" loading={state.busy === m.id} onClick={() => remove(m.id)}>Remover</Button>}
              {!m && chosen && <Button size="sm" variant="ghost" icon="x" onClick={() => setPending((p) => ({ ...p, [slot.kind]: null }))}>Tirar</Button>}
            </div>
            {waiting && <PendingAudio key={waiting.id} material={waiting} hasPrevious={Boolean(m)} backend={backend} onChanged={onChanged} onRemove={() => remove(waiting.id)} busy={state.busy === waiting.id} />}
          </SlotRow>
        );
      })}
      <SlotRow icon="shield-check" label="Diretriz SUS / PCDT" available={Boolean(form.guideline_url?.trim())} detail={form.guideline_url?.trim() ? form.guideline_title || form.guideline_url : null}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
          <TextField label="Título da diretriz" value={form.guideline_title} maxLength={200} onChange={(e) => set({ guideline_title: e.target.value })} />
          <TextField label="Endereço oficial (https)" value={form.guideline_url} onChange={(e) => set({ guideline_url: e.target.value })} hint="Link do documento no gov.br ou na fonte oficial." />
        </div>
      </SlotRow>
    </div>
  );
}

/**
 * Conferência do texto antes de ir ao aluno (A01): mostra quem conferiu a última vez e os avisos que a IA deu, e pede o que foi
 * conferido quando a aula vai ficar publicada. O nome e a data são gravados pelo banco, a partir da conta de quem salva.
 */
function ReviewSection({ form, current, set }) {
  const notes = form.ai_notes ?? current?.ai_notes ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: 14, border: "1px solid var(--border-subtle)", background: "var(--surface-subtle)" }}>
      <div style={{ font: "var(--type-label)" }}>Conferência do texto</div>
      {current?.reviewed_at ? (
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          Última conferência: {current.reviewer || "pessoa da equipe"} em {dateTimeBR(current.reviewed_at)}. <TextoRico texto={current.review_note} />
        </span>
      ) : current?.published ? (
        <Banner tone="warning">Esta aula está publicada sem registro de conferência. Ao salvar com o campo abaixo preenchido, a conferência fica registrada.</Banner>
      ) : (
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Ainda sem conferência registrada.</span>
      )}
      {notes.length > 0 && (
        <Banner tone="warning" title="Avisos da IA ao gerar o texto">
          <ul style={{ margin: 0, paddingLeft: 18 }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </Banner>
      )}
      {form.published && (
        <CampoTexto
          modo="linha"
          label="O que você conferiu antes de publicar"
          value={form.review_note}
          minRows={2}
          maxLength={1000}
          onChange={(v) => set({ review_note: v })}
          hint="Fica registrado com o seu nome e a data. Obrigatório ao publicar e ao mudar título, tema, resumo ou pontos-chave de uma aula publicada. Mudar só a formatação do resumo (negrito, cor, alinhamento...) não precisa."
        />
      )}
    </div>
  );
}

function LessonEditor({ lesson, topics, onSaved, onClose, isAdmin }) {
  const { backend } = useSession();
  const [form, setForm] = React.useState(() => (lesson ? toForm(lesson) : EMPTY));
  const [current, setCurrent] = React.useState(lesson);
  const [pending, setPending] = React.useState({ slides: null, flashcast: null }); // arquivos escolhidos antes de criar a aula
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  const set = (patch) => (setForm((f) => ({ ...f, ...patch })), setState((s) => ({ ...s, done: false })));
  const save = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null, done: false });
    try {
      const saved = await backend.rpc("app_admin_save_lesson", {
        // pontos-chave: só os que têm texto, aparados, com a formatação alinhada a eles (013160)
        p_lesson: { ...form, summary_rico: resumoRicoValido(form.summary, form.summary_rico), id: current?.id, duration_minutes: form.duration_minutes === "" ? null : Number(form.duration_minutes), position: Number(form.position) || 0, ...pontosParaSalvar(form.key_points, form.key_points_rico) },
      });
      // materiais escolhidos na criação: sobem agora que a aula existe
      let latest = saved;
      const failed = [];
      for (const slot of FILE_SLOTS) {
        const file = pending[slot.kind];
        if (!file) continue;
        try {
          latest = { ...latest, ...(await uploadLessonFile(backend, saved.id, file, slot.kind)) }; // a resposta do envio não traz os dados de conferência
          setPending((p) => ({ ...p, [slot.kind]: null }));
        } catch (error) {
          failed.push(`${slot.label}: ${uploadErrorText(error)}`);
        }
      }
      setCurrent(latest);
      setForm(toForm(latest));
      onSaved(latest);
      setState({ saving: false, error: failed.length ? `A aula foi salva, mas o envio falhou — ${failed.join(" · ")} Escolha o arquivo de novo.` : null, done: true });
    } catch (error) {
      setState({ saving: false, error: messageOf(error), done: false });
    }
  };
  const remove = async () => {
    if (!current || !window.confirm(`Apagar a aula "${current.title}"? Os materiais e os arquivos deles também são apagados, sem volta.`)) return;
    try {
      await removeLesson(backend, current.id);
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
        {state.done && !state.error && <Banner tone="success">Aula salva.</Banner>}
        <LessonAssistant form={form} set={set} lesson={current} pending={pending} />
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
          <div>
            <TextField label="Vídeo (YouTube, Vimeo ou MP4, https)" value={form.video_url} onChange={(e) => set({ video_url: e.target.value })} hint="O vídeo fica hospedado fora; aqui entra só o endereço." />
            {form.video_url.trim() && !videoPlaysInside(form.video_url.trim()) && (
              <Banner tone="warning">Este endereço não toca dentro da aula: o aluno verá só um botão para abrir em outra aba. Para tocar na aula, use um link do YouTube, do Vimeo ou um arquivo MP4.</Banner>
            )}
          </div>
          <TextField label="Posição" type="number" value={form.position} onChange={(e) => set({ position: e.target.value })} hint="Ordem dentro da área." />
        </div>
        <EditorResumo summary={form.summary} rico={form.summary_rico} maxLength={8000} aoMudar={({ summary, summary_rico }) => set({ summary, summary_rico })} />
        <EditorPontosChave pontos={form.key_points} ricos={form.key_points_rico} aoMudar={({ pontos, ricos }) => set({ key_points: pontos, key_points_rico: ricos })} />
        <MaterialsSection lesson={current} pending={pending} setPending={setPending} onChanged={(l) => (setCurrent((c) => ({ ...c, ...l })), onSaved(l))} form={form} set={set} />
        <ReviewSection form={form} current={current} set={set} />
        <Switch label="Publicada" description="Só aulas publicadas aparecem para os alunos." checked={Boolean(form.published)} onChange={(e) => set({ published: e.target.checked })} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button type="submit" loading={state.saving}>{current ? "Salvar alterações" : "Criar aula"}</Button>
        </div>
      </form>
    </Card>
  );
}

export function AdminLessons() {
  const { backend, boot } = useSession();
  const mobile = useMobile();
  const { data, error, reload, setData } = useLoad(() => Promise.all([backend.rpc("app_admin_lessons"), backend.rpc("app_lesson_topics", { p_area: null })]).then(([a, t]) => ({ ...a, topics: t })), [backend]);
  const [editing, setEditing] = React.useState(undefined); // undefined fechado · null nova · objeto edita
  const [fresh, setFresh] = React.useState(0); // a cada clique em "Nova aula" o formulário recomeça em branco (A03)
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const onSaved = (saved, removedId) => {
    setData({ ...data, lessons: removedId ? data.lessons.filter((l) => l.id !== removedId) : data.lessons.some((l) => l.id === saved.id) ? data.lessons.map((l) => (l.id === saved.id ? { ...l, ...saved } : l)) : [...data.lessons, { started_by: 0, completed_by: 0, ...saved }] }); // aula nova: ainda ninguém iniciou (A09)
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{data.lessons.length} {data.lessons.length === 1 ? "aula" : "aulas"} · {data.lessons.filter((l) => l.published).length} publicadas</span>
        <Button icon="plus" onClick={() => (setFresh((n) => n + 1), setEditing(null))}>Nova aula</Button>
      </div>
      {editing !== undefined && <LessonEditor key={editing?.id ?? `nova-${fresh}`} lesson={editing} topics={data.topics} isAdmin={boot.role === "admin"} onSaved={onSaved} onClose={() => setEditing(undefined)} />}
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
