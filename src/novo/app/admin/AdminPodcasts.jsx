// Administração › Podcasts (equipe). Fluxo pedido em 2026-10-06: fontes (PDF, DOCX, texto, link ou uma aula) → trechos com a
// origem → roteiro com IA (Gemini, Claude ou OpenAI; Ana e Bruno, cada fala citando os trechos) → revisão e aprovação de uma
// pessoa da equipe → áudio (OpenAI por enquanto; Gemini com duas vozes só se ligado no servidor) → publicação pelo administrador. A IA nunca aprova nem publica.
// Servidor: server/podcasts/router.ts; banco: supabase/migrations/…4700_podcasts.sql.
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Banner, Button, Card, EmptyState, Icon, ProgressBar, SegmentedControl, SelectField, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { AREAS, areaLabel } from "../practice/format.js";
import { dateTimeBR, LoadError, Loading, messageOf, TextArea, useLoad } from "./common.jsx";
import * as api from "../podcasts/podcastsApi.js";

const DURATIONS = [3, 5, 8, 10, 15, 20, 30].map((m) => ({ value: String(m), label: `${m} minutos` }));
const SOURCE_ICON = { pdf: "file-text", docx: "file-text", text: "text", link: "link", lesson: "tv" };
const SOURCE_KIND = { pdf: "PDF", docx: "DOCX", text: "Texto", link: "Link", lesson: "Aula" };
const WARNING_TEXT = { unknown_source: "Cita trecho que não vale", ungrounded_number: "Número fora dos trechos citados", no_source: "Fala longa sem trecho citado" };
const SPEAKERS = [
  { value: "ANA", label: "Ana (professora)" },
  { value: "BRUNO", label: "Bruno (estudante)" },
];
const usd = (n) => (n == null ? "—" : `US$ ${Number(n).toFixed(4).replace(".", ",")}`);

function Section({ step, title, children, done }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span aria-hidden style={{ width: 26, height: 26, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "700 13px var(--font-sans)", background: done ? "var(--action-primary)" : "var(--surface-sunken)", color: done ? "#fff" : "var(--text-secondary)" }}>
          {done ? <Icon name="check" size={14} /> : step}
        </span>
        <h4 style={{ margin: 0, font: "var(--type-h5, 600 16px var(--font-sans))" }}>{title}</h4>
      </div>
      {children}
    </section>
  );
}

const Muted = ({ children }) => <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{children}</div>;

// ---------------------------------------------------------------- 1. episódio
function EpisodeForm({ podcast, lessons, onSaved }) {
  const { backend } = useSession();
  const [form, setForm] = React.useState(() => ({
    title: podcast?.title ?? "",
    topic: podcast?.topic ?? "",
    area: podcast?.area ?? "",
    lesson_id: podcast?.lesson_id ?? "",
    target_minutes: String(podcast?.target_minutes ?? 8),
  }));
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  const set = (patch) => (setForm((f) => ({ ...f, ...patch })), setState((s) => ({ ...s, done: false })));
  const pickLesson = (id) => {
    const l = lessons.find((x) => x.id === id);
    // aula escolhida preenche o que estiver vazio (tema, área e título)
    set({ lesson_id: id, ...(l && !form.topic ? { topic: l.topic } : {}), ...(l && !form.area ? { area: l.area } : {}), ...(l && !form.title ? { title: `Flashcast: ${l.title}` } : {}) });
  };
  const save = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null, done: false });
    try {
      const saved = await backend.rpc("app_admin_save_podcast", { p_podcast: { ...form, id: podcast?.id, target_minutes: Number(form.target_minutes) } });
      setState({ saving: false, error: null, done: true });
      onSaved(saved);
    } catch (error) {
      setState({ saving: false, error: messageOf(error), done: false });
    }
  };
  return (
    <form onSubmit={save} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <TextField label="Título do episódio" value={form.title} maxLength={160} onChange={(e) => set({ title: e.target.value })} />
        <TextField label="Tema" value={form.topic} maxLength={160} onChange={(e) => set({ topic: e.target.value })} hint="Ex.: Pré-eclâmpsia" />
        <SelectField label="Grande área" value={form.area} onChange={(e) => set({ area: e.target.value })} options={[{ value: "", label: "—" }, ...AREAS.map((a) => ({ value: a.id, label: a.label }))]} />
        <SelectField label="Aula ligada (opcional)" value={form.lesson_id} onChange={(e) => pickLesson(e.target.value)} options={[{ value: "", label: "Nenhuma" }, ...lessons.map((l) => ({ value: l.id, label: `${l.title}${l.published ? "" : " (rascunho)"}` }))]} />
        <SelectField label="Duração" value={form.target_minutes} onChange={(e) => set({ target_minutes: e.target.value })} options={DURATIONS} />
        <TextField label="Idioma" value="Português do Brasil" disabled onChange={() => {}} />
        <TextField label="Formato" value="Ana e Bruno" disabled onChange={() => {}} hint="Dois apresentadores: professora e estudante." />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Salvo.</span>}
        <Button type="submit" loading={state.saving}>{podcast ? "Salvar episódio" : "Criar episódio"}</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- 2. fontes
function Sources({ podcast, lessons, isAdmin, onChanged }) {
  const { backend } = useSession();
  const [mode, setMode] = React.useState("file");
  const [text, setText] = React.useState({ title: "", body: "" });
  const [url, setUrl] = React.useState("");
  const [lessonId, setLessonId] = React.useState(podcast.lesson_id ?? "");
  const [state, setState] = React.useState({ busy: null, error: null, note: null });
  const locked = podcast.status === "published";
  const run = async (key, fn) => {
    setState({ busy: key, error: null, note: null });
    try {
      const view = await fn();
      onChanged(view);
      setState({ busy: null, error: null, note: view?.note ?? null });
      return true;
    } catch (error) {
      setState({ busy: null, error: messageOf(error), note: null });
      return false;
    }
  };
  const pickFile = (file) => file && run("file", () => api.addFileSource(backend, podcast.id, file));
  const addText = async () => (await run("text", () => api.addTextSource(backend, podcast.id, text.title, text.body))) && setText({ title: "", body: "" });
  const addLink = async () => (await run("link", () => api.addLinkSource(backend, podcast.id, url))) && setUrl("");
  const addLesson = () => run("lesson", () => api.addLessonSource(backend, podcast.id, lessonId));
  const rename = (s) => {
    const next = window.prompt("Nome da fonte que o aluno vai ver na transcrição:", s.title);
    if (next == null || !next.trim() || next.trim() === s.title) return;
    run(`rename-${s.id}`, () => api.renameSource(backend, podcast.id, s.id, next.trim()));
  };
  // fonte complementar (apostila): vale para a IA e para a equipe, mas o aluno não vê o nome, o link nem as páginas dela. Só o administrador marca.
  const marcarComplementar = (s) => {
    const para = !s.complementar;
    if (!para && !window.confirm("O aluno voltará a ver o nome desta fonte e as páginas usadas na transcrição. Continuar?")) return;
    run(`comp-${s.id}`, () => backend.rpc("app_admin_podcast_source_complementar", { p_source_id: s.id, p_complementar: para }));
  };
  const remove = (s) => {
    if (podcast.script && !window.confirm("Tirar esta fonte apaga o roteiro atual (ele pode citar trechos dela). Continuar?")) return;
    run(s.id, () => api.removeSource(backend, podcast.id, s.id));
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.note && <Banner tone="warning">{state.note}</Banner>}
      {locked && <Banner tone="info">Episódio publicado: despublique para mexer nas fontes.</Banner>}
      {podcast.sources.length === 0 ? (
        <Muted>Nenhuma fonte ainda. A IA só pode usar o que estiver aqui.</Muted>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {podcast.sources.map((s, i) => (
            <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border-subtle)", background: "var(--surface-subtle)" }}>
              <span style={{ color: "var(--text-brand)", display: "inline-flex" }}><Icon name={SOURCE_ICON[s.kind] ?? "file"} size={18} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", font: "600 14px var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Documento {i + 1}: {s.title}</span>
                <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-tertiary)", overflowWrap: "anywhere" }}>
                  {SOURCE_KIND[s.kind]} · {s.chunks} trechos{s.pages ? ` · ${s.pages} páginas` : ""}{s.url ? ` · ${s.url}` : ""}
                </span>
                {s.student_hidden && (
                  <span style={{ display: "block", marginTop: 4 }}>
                    <Badge size="sm" tone="warning" icon="eye-off">
                      {s.complementar ? "Fonte complementar · o aluno não vê esta fonte" : "O aluno não vê esta fonte: o nome bate com uma fonte complementar da biblioteca"}
                    </Badge>
                  </span>
                )}
              </span>
              {isAdmin && (
                <Button size="sm" variant="ghost" icon={s.complementar ? "eye" : "eye-off"} loading={state.busy === `comp-${s.id}`} onClick={() => marcarComplementar(s)}>
                  {s.complementar ? "Voltar a oficial" : "Marcar como complementar"}
                </Button>
              )}
              {!locked && <Button size="sm" variant="ghost" icon="pencil" loading={state.busy === `rename-${s.id}`} onClick={() => rename(s)}>Renomear</Button>}
              {!locked && <Button size="sm" variant="ghost" icon="trash-2" loading={state.busy === s.id} onClick={() => remove(s)}>Tirar</Button>}
            </div>
          ))}
        </div>
      )}
      {!locked && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 14, border: "1px dashed var(--border-default)" }}>
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: "file", label: "PDF ou DOCX" },
              { value: "text", label: "Texto" },
              { value: "link", label: "Link" },
              { value: "lesson", label: "Aula" },
            ]}
          />
          {mode === "file" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label className="sm-btn sm-btn--secondary sm-btn--sm" style={{ alignSelf: "flex-start", cursor: state.busy ? "not-allowed" : "pointer" }}>
                {state.busy === "file" ? "Lendo o arquivo…" : "Escolher PDF ou DOCX"}
                <input type="file" accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx" hidden disabled={Boolean(state.busy)} onChange={(e) => (pickFile(e.target.files?.[0]), (e.target.value = ""))} />
              </label>
              <Muted>Até 30 MB. O texto é lido por página (PDF digital). PDF escaneado não tem texto: passe pela Central de Conteúdo (OCR) ou cole o texto.</Muted>
            </div>
          )}
          {mode === "text" && (
            <>
              <TextField label="Título da fonte" value={text.title} maxLength={200} onChange={(e) => setText((t) => ({ ...t, title: e.target.value }))} placeholder="Ex.: Anotações da aula de 05/10" />
              <TextArea label="Texto" value={text.body} rows={6} onChange={(v) => setText((t) => ({ ...t, body: v }))} />
              <Button size="sm" style={{ alignSelf: "flex-start" }} loading={state.busy === "text"} disabled={text.body.trim().length < 80} onClick={addText}>Adicionar texto</Button>
            </>
          )}
          {mode === "link" && (
            <>
              <TextField label="Endereço (https)" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.gov.br/saude/…" hint="Página ou PDF público. Endereços internos não são aceitos." />
              <Button size="sm" style={{ alignSelf: "flex-start" }} loading={state.busy === "link"} disabled={!/^https:\/\/\S+$/i.test(url.trim())} onClick={addLink}>Ler o link</Button>
            </>
          )}
          {mode === "lesson" && (
            <>
              <SelectField label="Aula" value={lessonId} onChange={(e) => setLessonId(e.target.value)} options={[{ value: "", label: "Escolha a aula" }, ...lessons.map((l) => ({ value: l.id, label: l.title }))]} />
              <Muted>Entram o resumo, os pontos-chave e o PDF complementar da aula (se houver).</Muted>
              <Button size="sm" style={{ alignSelf: "flex-start" }} loading={state.busy === "lesson"} disabled={!lessonId} onClick={addLesson}>Usar esta aula</Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 3. roteiro
function Citation({ id, cited }) {
  const [open, setOpen] = React.useState(false);
  const c = cited?.[String(id)];
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, maxWidth: "100%" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ border: "1px solid var(--border-default)", background: "var(--surface-default, #fff)", borderRadius: 999, padding: "2px 8px", font: "var(--type-caption)", cursor: "pointer", color: c ? "var(--text-secondary)" : "var(--danger-text)" }}>
        T{id}{c ? ` · ${c.source}${c.page ? `, p. ${c.page}` : ""}` : " · inexistente"}
      </button>
      {open && c && <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)", background: "var(--surface-sunken)", borderRadius: 8, padding: 8, whiteSpace: "pre-wrap" }}>{c.excerpt}</span>}
    </span>
  );
}

function ScriptEditor({ podcast, warnings, onSaved, locked }) {
  const { backend } = useSession();
  const saved = podcast.script?.lines ?? [];
  const [lines, setLines] = React.useState(saved);
  const [state, setState] = React.useState({ saving: false, error: null });
  React.useEffect(() => setLines(podcast.script?.lines ?? []), [podcast.script]);
  const dirty = JSON.stringify(lines) !== JSON.stringify(saved);
  const byLine = React.useMemo(() => {
    const m = {};
    for (const w of warnings ?? []) (m[w.line] ??= []).push(w);
    return m;
  }, [warnings]);
  const edit = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const remove = (i) => setLines((ls) => ls.filter((_, j) => j !== i));
  const insertAfter = (i) => setLines((ls) => [...ls.slice(0, i + 1), { speaker: ls[i]?.speaker === "ANA" ? "BRUNO" : "ANA", text: "", style: "", sources: [] }, ...ls.slice(i + 1)]);
  const save = async () => {
    setState({ saving: true, error: null });
    try {
      const view = await backend.rpc("app_admin_podcast_save_script", { p_id: podcast.id, p_script: { lines: lines.map((l) => ({ ...l, text: l.text.trim() })), missing: podcast.script?.missing ?? [] } });
      setState({ saving: false, error: null });
      onSaved(view, true);
    } catch (error) {
      setState({ saving: false, error: messageOf(error) });
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, border: `1px solid ${byLine[i] ? "var(--warning-border)" : "var(--border-subtle)"}`, background: l.speaker === "ANA" ? "var(--surface-subtle)" : "transparent" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ font: "600 13px var(--font-sans)", color: "var(--text-tertiary)" }}>Fala {i + 1}</span>
            {byLine[i]?.map((w, k) => <Badge key={k} size="sm" tone="warning" icon="triangle-alert">{WARNING_TEXT[w.kind] ?? w.kind}: {w.detail}</Badge>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
            <SelectField label="Quem fala" value={l.speaker} disabled={locked} onChange={(e) => edit(i, { speaker: e.target.value })} options={SPEAKERS} />
            <TextField label="Jeito de falar" value={l.style ?? ""} maxLength={80} disabled={locked} onChange={(e) => edit(i, { style: e.target.value })} placeholder="didático e calmo" />
          </div>
          <TextArea label="Fala" value={l.text} rows={3} maxLength={700} disabled={locked} onChange={(v) => edit(i, { text: v })} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
            {(l.sources ?? []).length ? l.sources.map((s) => <Citation key={s} id={s} cited={podcast.cited} />) : <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Sem trecho citado</span>}
          </div>
          {!locked && (
            <div style={{ display: "flex", gap: 6 }}>
              <Button size="sm" variant="ghost" icon="plus" onClick={() => insertAfter(i)}>Fala abaixo</Button>
              <Button size="sm" variant="ghost" icon="trash-2" onClick={() => remove(i)} disabled={lines.length <= 2}>Tirar fala</Button>
            </div>
          )}
        </div>
      ))}
      {!locked && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {dirty && <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Salvar a edição tira a aprovação e o áudio (precisam ser refeitos).</span>}
          <Button variant="secondary" disabled={!dirty} onClick={() => setLines(saved)}>Desfazer</Button>
          <Button loading={state.saving} disabled={!dirty || lines.some((l) => !l.text.trim())} onClick={save}>Salvar edição</Button>
        </div>
      )}
    </div>
  );
}

function ScriptStep({ podcast, providers, onChanged }) {
  const { backend } = useSession();
  const choices = providers?.script?.choices ?? [];
  const fixed = providers?.script && providers.script.override_allowed === false && providers.script.current ? providers.script.current : null; // a Central de IAs decide
  const ready = choices.filter((p) => p.ready);
  const [picked, setProvider] = React.useState("");
  const provider = fixed ? fixed.kind : picked;
  const fixedChoice = fixed ? choices.find((p) => p.kind === fixed.kind) : null;
  const canPick = fixed ? Boolean(fixedChoice?.ready) : ready.some((p) => p.kind === provider);
  React.useEffect(() => {
    if (!ready.some((p) => p.kind === picked)) setProvider((ready.find((p) => p.kind === "gemini") ?? ready.find((p) => p.kind !== "mock") ?? ready[0])?.kind ?? "");
  }, [providers]); // eslint-disable-line react-hooks/exhaustive-deps
  const [notes, setNotes] = React.useState("");
  const [warnings, setWarnings] = React.useState(podcast.script_meta?.warnings ?? null);
  const [state, setState] = React.useState({ busy: null, error: null });
  const [note, setNote] = React.useState("");
  const locked = podcast.status === "published";
  const hasScript = Boolean(podcast.script?.lines?.length);
  const meta = podcast.script_meta ?? {};

  // Quem aprova o roteiro: administrador ou revisor médico da área do episódio (o banco decide; a tela só explica). Se a pergunta
  // falhar (banco ainda sem a função), o botão fica ligado e o banco recusa quem não pode.
  const [approval, setApproval] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    setApproval(null);
    backend.rpc("app_admin_podcast_approval", { p_id: podcast.id }).then((r) => alive && setApproval(r)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [backend, podcast.id, podcast.area, podcast.approved_by]);
  const cannotApprove = approval?.can_approve === false;

  // roteiro editado (sem avisos guardados): o servidor confere de novo
  React.useEffect(() => {
    let alive = true;
    if (hasScript && !podcast.script_meta?.warnings) api.checkPodcastScript(backend, podcast.id).then((r) => alive && setWarnings(r.warnings)).catch(() => {});
    else setWarnings(podcast.script_meta?.warnings ?? null);
    return () => {
      alive = false;
    };
  }, [backend, podcast.id, podcast.script, podcast.script_meta, hasScript]);

  const generate = async () => {
    if (hasScript && !window.confirm("Gerar outro roteiro substitui o atual e tira a aprovação e o áudio. Continuar?")) return;
    setState({ busy: "generate", error: null });
    try {
      const r = await api.generatePodcastScript(backend, podcast.id, provider, notes);
      setWarnings(r.warnings);
      onChanged(r.podcast);
      setState({ busy: null, error: null });
    } catch (error) {
      setState({ busy: null, error: messageOf(error) });
    }
  };
  const approve = async () => {
    setState({ busy: "approve", error: null });
    try {
      onChanged(await backend.rpc("app_admin_podcast_approve", { p_id: podcast.id, p_note: note }));
      setNote("");
      setState({ busy: null, error: null });
    } catch (error) {
      setState({ busy: null, error: messageOf(error) });
    }
  };
  const options = ready.length ? ready.map((p) => ({ value: p.kind, label: `${p.label}${p.model && p.kind !== "mock" ? ` (${p.model})` : ""}` })) : [{ value: "", label: providers ? "Nenhuma IA pronta no servidor" : "Carregando…" }];
  const unavailable = choices.filter((p) => !p.ready && p.kind !== "mock");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {!locked && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            {fixed ? <Muted>IA definida na Central de IAs: {fixed.label} {fixed.model}</Muted> : <SelectField label="IA do roteiro" value={provider} onChange={(e) => setProvider(e.target.value)} options={options} />}
          </div>
          {fixed ? fixedChoice && !fixedChoice.ready && <Muted>{fixedChoice.pending}</Muted> : unavailable.length > 0 && <Muted>{api.pendingText(unavailable)}</Muted>}
          <TextArea label="Pedido para a IA (opcional)" value={notes} rows={2} maxLength={1000} onChange={setNotes} placeholder="Ex.: dê ênfase à conduta na emergência e às pegadinhas de prova." />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Button icon="sparkles" loading={state.busy === "generate"} disabled={!podcast.chunks_total || !canPick} onClick={generate}>
              {hasScript ? "Gerar outro roteiro" : "Gerar roteiro"}
            </Button>
            {!podcast.chunks_total && <Muted>Adicione fontes primeiro.</Muted>}
            {state.busy === "generate" && <Muted>Escrevendo a conversa a partir das fontes… pode levar alguns minutos.</Muted>}
          </div>
        </div>
      )}
      {hasScript && (
        <>
          <Muted>
            {meta.simulated ? "Roteiro simulado (sem IA). " : meta.model ? `Gerado por ${meta.provider} · ${meta.model} · ${(meta.input_tokens ?? 0) + (meta.output_tokens ?? 0)} tokens · custo estimado ${usd(meta.cost_usd)}. ` : ""}
            {meta.edited_at ? `Editado pela equipe em ${dateTimeBR(meta.edited_at)}. ` : ""}
            {podcast.script.lines.length} falas · cerca de {Math.max(1, Math.round(podcast.script.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0) / 150))} min falados.
          </Muted>
          {warnings?.length > 0 && <Banner tone="warning" title={`${warnings.length} ponto(s) para conferir`}>As falas marcadas citam trecho inexistente (ou que a IA não recebeu) ou trazem número que não está nos trechos citados. Confira na fonte e corrija antes de aprovar.</Banner>}
          {(podcast.script.missing ?? []).length > 0 && (
            <Banner tone="info" title="O que as fontes não esclarecem">
              <ul style={{ margin: 0, paddingLeft: 18 }}>{podcast.script.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </Banner>
          )}
          <ScriptEditor podcast={podcast} warnings={warnings} locked={locked} onSaved={(view) => onChanged(view)} />
          {podcast.approved_at ? (
            <Banner tone="success" icon="shield-check" title={`Roteiro aprovado por ${podcast.approved_by_name ?? "equipe"} em ${dateTimeBR(podcast.approved_at)}`}>
              {podcast.approval_note}
            </Banner>
          ) : (
            !locked && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, background: "var(--surface-subtle)" }}>
                {cannotApprove && (
                  <Banner tone="info" icon="lock" title="Você não pode aprovar este roteiro">
                    {approval.reason}
                  </Banner>
                )}
                <TextArea label="O que você conferiu (obrigatório para aprovar)" value={note} rows={2} maxLength={600} disabled={cannotApprove} onChange={setNote} placeholder="Ex.: conferi doses e critérios nas páginas citadas do PCDT; corrigi a fala 12." />
                <Button icon="shield-check" style={{ alignSelf: "flex-start" }} loading={state.busy === "approve"} disabled={cannotApprove || note.trim().length < 10} onClick={approve}>Aprovar roteiro</Button>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 4. áudio
function AudioStep({ podcast, providers, lessons, isAdmin, onChanged }) {
  const { backend } = useSession();
  const ready = (providers?.tts ?? []).filter((p) => p.ready);
  const [provider, setProvider] = React.useState("");
  React.useEffect(() => {
    // abre na OpenAI (a voz que vale por enquanto), mesmo que a do Gemini esteja ligada no servidor
    if (!ready.some((p) => p.kind === provider)) setProvider((ready.find((p) => p.kind === "openai") ?? ready.find((p) => p.kind !== "mock") ?? ready[0])?.kind ?? "");
  }, [providers]); // eslint-disable-line react-hooks/exhaustive-deps
  const voiceList = providers?.voices?.[provider] ?? [];
  // vozes: o padrão do provedor, trocado só no que a pessoa escolher (sem esperar outra renderização)
  const [chosen, setChosen] = React.useState({});
  const voices = { ...(providers?.default_voices?.[provider] ?? {}), ...(chosen[provider] ?? {}) };
  const pickVoice = (who, value) => setChosen((c) => ({ ...c, [provider]: { ...(c[provider] ?? {}), [who]: value } }));
  const [progress, setProgress] = React.useState(null);
  const [state, setState] = React.useState({ busy: null, error: null, done: null });
  const [src, setSrc] = React.useState(null);
  const canGenerate = Boolean(podcast.approved_at) && ["approved", "audio_ready"].includes(podcast.status);
  const lesson = lessons.find((l) => l.id === podcast.lesson_id);

  React.useEffect(() => {
    let alive = true;
    let blob = null;
    setSrc(null);
    if (podcast.audio_path) {
      api.podcastAudioUrl(backend, podcast.id).then((url) => {
        if (url.startsWith("blob:")) blob = url;
        if (alive) setSrc(url);
      }).catch(() => {});
    }
    return () => {
      alive = false;
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [backend, podcast.id, podcast.audio_path]);

  const generate = async () => {
    if (podcast.audio_path && !window.confirm("Gerar de novo substitui o áudio atual. Continuar?")) return;
    setState({ busy: "audio", error: null, done: null });
    setProgress({ done: 0, total: 1 });
    try {
      onChanged(await api.generatePodcastAudio(backend, podcast.id, { provider, voices }, setProgress));
      setState({ busy: null, error: null, done: "Áudio pronto. Ouça antes de publicar." });
    } catch (error) {
      setState({ busy: null, error: messageOf(error), done: null });
    } finally {
      setProgress(null);
    }
  };
  const flashcast = async () => {
    const aula = lesson?.title ? `"${lesson.title}"` : "ligada ao episódio";
    if (!window.confirm(`Copiar este áudio para a aula ${aula} como Flashcast?\n\nOs alunos passam a ouvir na aula, e o Flashcast que ela já tem é trocado. Se você despublicar ou apagar o episódio depois, a cópia continua na aula e precisa ser tirada lá.`)) return;
    setState({ busy: "flashcast", error: null, done: null });
    try {
      await api.attachFlashcast(backend, podcast.id, podcast.lesson_id);
      setState({ busy: null, error: null, done: `Pronto: o áudio virou o Flashcast da aula "${lesson?.title ?? "ligada"}".` });
    } catch (error) {
      setState({ busy: null, error: messageOf(error), done: null });
    }
  };
  const meta = podcast.audio_meta ?? {};
  const unavailable = (providers?.tts ?? []).filter((p) => !p.ready && p.kind !== "mock");
  // as vozes prontas são escolhíveis; as indisponíveis (ex.: Gemini desligado) aparecem travadas, com o motivo embaixo
  const ttsOptions = [
    ...(ready.length ? [] : [{ value: "", label: providers ? "Nenhuma voz pronta no servidor" : "Carregando…" }]),
    ...(providers?.tts ?? []).filter((p) => p.ready || p.kind !== "mock").map((p) =>
      p.ready ? { value: p.kind, label: `${p.label}${p.model && p.kind !== "mock" ? ` · ${p.model}` : ""}` } : { value: p.kind, label: `${String(p.label).split(" (")[0]} — indisponível por enquanto`, disabled: true }
    ),
  ];

  if (!podcast.approved_at) return <Muted>O áudio só é gerado depois que o administrador ou o revisor médico da área aprovar o roteiro.</Muted>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {state.done && <Banner tone="success">{state.done}</Banner>}
      {canGenerate && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <SelectField label="Voz" value={provider} onChange={(e) => setProvider(e.target.value)} options={ttsOptions} />
            {provider && provider !== "mock" && <SelectField label="Voz da Ana" value={voices.ana ?? ""} onChange={(e) => pickVoice("ana", e.target.value)} options={voiceList.map((v) => ({ value: v, label: v }))} />}
            {provider && provider !== "mock" && <SelectField label="Voz do Bruno" value={voices.bruno ?? ""} onChange={(e) => pickVoice("bruno", e.target.value)} options={voiceList.map((v) => ({ value: v, label: v }))} />}
          </div>
          {unavailable.length > 0 && <Muted>{api.pendingText(unavailable)}</Muted>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Button icon="audio-lines" loading={state.busy === "audio"} disabled={!ready.some((p) => p.kind === provider)} onClick={generate}>{podcast.audio_path ? "Gerar áudio de novo" : "Gerar áudio"}</Button>
          </div>
          {progress && (
            <ProgressBar value={progress.done} max={Math.max(progress.total, 1)} label={progress.finishing ? "Juntando as partes…" : `Gerando a voz: parte ${Math.min(progress.done + 1, progress.total)} de ${progress.total}`} valueLabel={`${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%`} />
          )}
        </>
      )}
      {podcast.audio_path && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {src ? <audio controls preload="metadata" src={src} style={{ width: "100%" }} aria-label={`Áudio de ${podcast.title}`} /> : <Muted>Carregando o áudio…</Muted>}
          <Muted>
            {api.durationText(podcast.audio_seconds)} · {meta.simulated ? "voz simulada (silêncio)" : `${meta.provider ?? ""} ${meta.model ?? ""} · Ana: ${meta.voices?.ana ?? "—"}, Bruno: ${meta.voices?.bruno ?? "—"} · custo estimado ${usd(meta.cost_usd)}`}
          </Muted>
          {isAdmin && podcast.lesson_id && podcast.status === "published" && (
            <Button variant="secondary" icon="headphones" style={{ alignSelf: "flex-start" }} loading={state.busy === "flashcast"} onClick={flashcast}>
              Usar como Flashcast da aula{lesson ? ` "${lesson.title}"` : ""}
            </Button>
          )}
          {podcast.lesson_id && !(isAdmin && podcast.status === "published") && <Muted>Depois que o administrador publicar o episódio, só ele pode usar o áudio como Flashcast da aula.</Muted>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 5. publicação
function PublishStep({ podcast, isAdmin, onChanged, onDeleted }) {
  const { backend } = useSession();
  const [state, setState] = React.useState({ busy: null, error: null });
  const publish = async (on) => {
    setState({ busy: on ? "publish" : "unpublish", error: null });
    try {
      onChanged(await backend.rpc("app_admin_podcast_publish", { p_id: podcast.id, p_published: on }));
      setState({ busy: null, error: null });
    } catch (error) {
      setState({ busy: null, error: messageOf(error) });
    }
  };
  const remove = async () => {
    if (!window.confirm(`Apagar o episódio "${podcast.title}"? Fontes, roteiro e áudio somem.`)) return;
    setState({ busy: "delete", error: null });
    try {
      await api.deletePodcast(backend, podcast.id);
      onDeleted();
    } catch (error) {
      setState({ busy: null, error: messageOf(error) });
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {podcast.status === "published" ? (
        <Banner tone="success" icon="radio" title={`Publicado em ${dateTimeBR(podcast.published_at)}`}>Os alunos ouvem em Aulas › Podcasts.</Banner>
      ) : (
        <Muted>{podcast.status === "audio_ready" ? "Pronto para publicar: roteiro aprovado e áudio gerado." : "Publicar exige o roteiro aprovado e o áudio pronto."}</Muted>
      )}
      {isAdmin ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {podcast.status === "published" ? (
            <Button variant="secondary" loading={state.busy === "unpublish"} onClick={() => publish(false)}>Despublicar</Button>
          ) : (
            <Button icon="send" loading={state.busy === "publish"} disabled={podcast.status !== "audio_ready"} onClick={() => publish(true)}>Publicar</Button>
          )}
          <Button variant="ghost" icon="trash-2" loading={state.busy === "delete"} onClick={remove}>Apagar episódio</Button>
        </div>
      ) : (
        <Muted>Só o administrador publica e apaga episódios.</Muted>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- editor
function PodcastEditor({ id, isAdmin, lessons, providers, providersError, onClose, onChanged, onCreated, onDeleted }) {
  const { backend } = useSession();
  const [podcast, setPodcast] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    if (!id) return setPodcast(null);
    backend.rpc("app_admin_podcast", { p_id: id }).then((p) => alive && setPodcast(p)).catch((e) => alive && setError(messageOf(e)));
    return () => {
      alive = false;
    };
  }, [backend, id]);
  const changed = (view) => {
    setPodcast(view);
    onChanged(view);
  };
  if (error) return <Card><Banner tone="danger">{error}</Banner></Card>;
  if (id && !podcast) return <Card><Loading /></Card>;
  const status = podcast?.status ?? "draft";
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, font: "var(--type-h4)" }}>{podcast ? podcast.title : "Novo episódio"}</h3>
            {podcast && <Badge size="sm" tone={api.STATUS_TONE[status]}>{api.STATUS_LABEL[status]}</Badge>}
          </div>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </div>
        {providersError && <Banner tone="warning">{providersError}</Banner>}
        <Section step={1} title="Episódio" done={Boolean(podcast)}>
          <EpisodeForm podcast={podcast} lessons={lessons} onSaved={(view) => (podcast ? changed(view) : onCreated(view))} />
        </Section>
        {podcast && (
          <>
            <Section step={2} title="Fontes" done={podcast.sources.length > 0}>
              <Sources podcast={podcast} lessons={lessons} isAdmin={isAdmin} onChanged={changed} />
            </Section>
            <Section step={3} title="Roteiro (revisão humana)" done={Boolean(podcast.approved_at)}>
              <ScriptStep podcast={podcast} providers={providers} onChanged={changed} />
            </Section>
            <Section step={4} title="Áudio" done={Boolean(podcast.audio_path)}>
              <AudioStep podcast={podcast} providers={providers} lessons={lessons} isAdmin={isAdmin} onChanged={changed} />
            </Section>
            <Section step={5} title="Publicação" done={status === "published"}>
              <PublishStep podcast={podcast} isAdmin={isAdmin} onChanged={changed} onDeleted={onDeleted} />
            </Section>
          </>
        )}
      </div>
    </Card>
  );
}

export function AdminPodcasts() {
  const { backend, boot } = useSession();
  const isAdmin = boot.role === "admin";
  const [params, setParams] = useSearchParams();
  const { data, error, reload } = useLoad(() => Promise.all([backend.rpc("app_admin_podcasts"), backend.rpc("app_admin_lessons")]).then(([podcasts, l]) => ({ podcasts, lessons: l.lessons ?? [] })), [backend]);
  const [providers, setProviders] = React.useState(null);
  const [providersError, setProvidersError] = React.useState(null);
  React.useEffect(() => {
    if (!api.podcastsAvailable(backend)) return setProvidersError("Os podcasts precisam do servidor (não funcionam no banco local do navegador).");
    api.podcastProviders(backend).then(setProviders).catch((e) => setProvidersError(`Não foi possível ver as IAs do servidor: ${messageOf(e)}`));
  }, [backend]);
  const open = params.get("ep");
  const setOpen = (ep) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (ep) next.set("ep", ep);
        else next.delete("ep");
        return next;
      },
      { replace: true }
    );
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Banner tone="info" icon="headphones" title="Podcasts a partir dos materiais">
        Fontes → roteiro com IA (só com o que está nas fontes, citando documento e página) → revisão da equipe e aprovação do administrador ou do revisor médico da área → áudio com duas vozes → publicação pelo administrador. A IA nunca aprova nem publica.
      </Banner>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          {data.podcasts.length} {data.podcasts.length === 1 ? "episódio" : "episódios"} · {data.podcasts.filter((p) => p.status === "published").length} publicados
        </span>
        <Button icon="plus" onClick={() => setOpen("novo")}>Novo episódio</Button>
      </div>
      {open && (
        <PodcastEditor
          key={open}
          id={open === "novo" ? null : open}
          isAdmin={isAdmin}
          lessons={data.lessons}
          providers={providers}
          providersError={providersError}
          onClose={() => setOpen(null)}
          onChanged={() => reload()}
          onCreated={(view) => (reload(), setOpen(view.id))}
          onDeleted={() => (setOpen(null), reload())}
        />
      )}
      <Card padding={8}>
        {data.podcasts.length === 0 ? (
          <EmptyState icon="headphones" title="Nenhum episódio ainda" description="Crie o primeiro: escolha o tema, junte as fontes e gere o roteiro." />
        ) : (
          data.podcasts.map((p) => (
            <button key={p.id} type="button" onClick={() => setOpen(p.id)} style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", padding: "10px 12px", border: 0, borderRadius: 12, background: open === p.id ? "var(--surface-subtle)" : "transparent", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}>
              <Badge size="sm" tone={api.STATUS_TONE[p.status]}>{api.STATUS_LABEL[p.status]}</Badge>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", font: "600 14px var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                  {[p.area ? areaLabel(p.area) : null, p.topic, `${p.sources} ${p.sources === 1 ? "fonte" : "fontes"}`, p.lines ? `${p.lines} falas` : null, p.seconds ? api.durationText(p.seconds) : null, p.lesson ? `aula: ${p.lesson}` : null, dateTimeBR(p.updated_at)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <Icon name="chevron-right" size={18} style={{ color: "var(--text-tertiary)" }} />
            </button>
          ))
        )}
      </Card>
    </div>
  );
}
