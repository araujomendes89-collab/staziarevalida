// Assistente de IA da "Nova aula" (pedido de 2026-10-06): a equipe escolhe a IA (Gemini, Claude ou OpenAI) e o material (PDF da
// aula, outro PDF, texto ou link); o assistente sugere título, tema, área, resumo e pontos-chave citando as páginas. Nada vai para
// a aula sozinho: cada sugestão tem "Usar", e a aula só muda quando a equipe salvar. Também cria o podcast da aula.
import React from "react";
import { useInRouterContext, useSearchParams } from "react-router-dom";
import { Badge, Banner, Button, Icon, SegmentedControl, SelectField, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { areaLabel } from "../practice/format.js";
import { lessonFileUrl } from "../study/lessonsApi.js";
import { addLessonSource, pendingText } from "../podcasts/podcastsApi.js";
import { messageOf, TextArea } from "./common.jsx";
import { assistAvailable, assistProviders, capPages, pdfPages, runLessonAssist } from "./lessonAssistApi.js";

const pagesText = (pages) => (pages?.length ? `p. ${pages.join(", ")}` : "sem página");
const usd = (n) => `US$ ${Number(n ?? 0).toFixed(4).replace(".", ",")}`;

function Suggestion({ label, children, onUse, used, meta }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border-subtle)", background: "var(--surface-default, #fff)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <span style={{ font: "var(--type-label)" }}>{label}</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {meta && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{meta}</span>}
          <Button size="sm" variant={used ? "ghost" : "secondary"} icon={used ? "check" : "arrow-down-to-line"} onClick={onUse}>{used ? "Usado" : "Usar"}</Button>
        </span>
      </div>
      <div style={{ font: "var(--type-body-sm)", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{children}</div>
    </div>
  );
}

/** "Criar podcast desta aula": cria o episódio ligado à aula, com a aula como fonte, e abre a aba Podcasts nele. */
function CreatePodcastButton({ lesson, disabled, onError, open }) {
  const { backend } = useSession();
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const view = await backend.rpc("app_admin_save_podcast", { p_podcast: { title: `Flashcast: ${lesson.title}`.slice(0, 160), topic: lesson.topic, area: lesson.area, lesson_id: lesson.id, target_minutes: 8 } });
      await addLessonSource(backend, view.id, lesson.id);
      open(view.id);
    } catch (error) {
      setBusy(false);
      onError(messageOf(error));
    }
  };
  return (
    <Button size="sm" variant="secondary" icon="headphones" loading={busy} disabled={disabled} onClick={run}>
      Criar podcast desta aula
    </Button>
  );
}
// dentro do app (rotas): troca a aba sem recarregar; fora delas, abre o endereço
function CreatePodcastRouted(props) {
  const [, setParams] = useSearchParams();
  return <CreatePodcastButton {...props} open={(id) => setParams({ aba: "podcasts", ep: id })} />;
}
const CreatePodcastPlain = (props) => <CreatePodcastButton {...props} open={(id) => window.location.assign(`/novo/admin?aba=podcasts&ep=${id}`)} />;

export function LessonAssistant({ form, set, lesson, pending }) {
  const { backend } = useSession();
  const inRouter = useInRouterContext();
  const [open, setOpen] = React.useState(false);
  const [providers, setProviders] = React.useState(null);
  const [provider, setProvider] = React.useState("");
  const slides = lesson?.materials?.find((m) => m.kind === "slides" && m.storage_path);
  const lessonPdf = pending?.slides ?? (slides ? "saved" : null);
  const [source, setSource] = React.useState(lessonPdf ? "lesson" : "text");
  const [file, setFile] = React.useState(null);
  const [text, setText] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [state, setState] = React.useState({ busy: null, error: null, note: null });
  const [result, setResult] = React.useState(null);
  const [used, setUsed] = React.useState({});
  const available = assistAvailable(backend);

  React.useEffect(() => {
    if (!open || providers || !available) return;
    assistProviders(backend)
      .then((list) => {
        setProviders(list);
        const ready = list.filter((p) => p.ready);
        setProvider((ready.find((p) => p.kind === "gemini") ?? ready.find((p) => p.kind !== "mock") ?? ready[0])?.kind ?? "");
      })
      .catch((e) => setState((s) => ({ ...s, error: `Não foi possível ver as IAs do servidor: ${messageOf(e)}` })));
  }, [open, providers, available, backend]);

  const readPdf = async (input) => {
    const { pages, dropped } = capPages(await pdfPages(input));
    if (!pages.some((p) => p.text.length > 40)) throw new Error("O PDF não tem texto aproveitável (pode ser escaneado). Cole o texto.");
    return { pages, note: dropped ? `Material longo: entraram ${pages.length} páginas; ${dropped} ficaram de fora.` : null };
  };

  const run = async () => {
    setState({ busy: "run", error: null, note: null });
    setUsed({});
    try {
      const body = { provider, title: form.title, topic: form.topic, area: form.area, instructions };
      let note = null;
      if (source === "lesson") {
        const input = pending?.slides ?? (await (await fetch(await lessonFileUrl(backend, slides.id))).arrayBuffer());
        ({ pages: body.pages, note } = await readPdf(input));
      } else if (source === "file") {
        ({ pages: body.pages, note } = await readPdf(file));
      } else if (source === "text") {
        body.text = text;
      } else {
        body.url = url.trim();
      }
      setResult(await runLessonAssist(backend, body));
      setState({ busy: null, error: null, note });
    } catch (error) {
      setState({ busy: null, error: messageOf(error), note: null });
    }
  };

  const use = (key, patch) => (set(patch), setUsed((u) => ({ ...u, [key]: true })));
  const s = result?.suggestion;
  const useAll = () => {
    if (!s) return;
    set({ ...(s.title ? { title: s.title } : {}), ...(s.topic ? { topic: s.topic } : {}), ...(s.area ? { area: s.area } : {}), ...(s.summary ? { summary: s.summary } : {}), ...(s.key_points.length ? { key_points: s.key_points.map((k) => k.text).join("\n") } : {}) });
    setUsed({ title: true, topic: true, area: true, summary: true, key_points: true });
  };

  const ready = (providers ?? []).filter((p) => p.ready);
  const unavailable = (providers ?? []).filter((p) => !p.ready && p.kind !== "mock");
  const canRun = provider && (source === "lesson" ? Boolean(lessonPdf) : source === "file" ? Boolean(file) : source === "text" ? text.trim().length >= 80 : /^https:\/\/\S+$/i.test(url.trim()));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, borderRadius: 16, border: "1px solid color-mix(in oklab, var(--border-brand, var(--border-default)) 40%, transparent)", background: "var(--surface-brand-soft, var(--surface-subtle))" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ color: "var(--text-brand)", display: "inline-flex" }}><Icon name="sparkles" size={20} /></span>
          <span>
            <span style={{ display: "block", font: "600 15px var(--font-sans)" }}>Assistente de IA da aula</span>
            <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-secondary)" }}>Lê o material e sugere título, tema, resumo e pontos-chave citando as páginas. Você confere e decide o que usar.</span>
          </span>
        </span>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {lesson && (inRouter ? <CreatePodcastRouted lesson={lesson} disabled={!available} onError={(error) => setState({ busy: null, error, note: null })} /> : <CreatePodcastPlain lesson={lesson} disabled={!available} onError={(error) => setState({ busy: null, error, note: null })} />)}
          <Button size="sm" variant={open ? "ghost" : "primary"} onClick={() => setOpen((o) => !o)}>{open ? "Fechar assistente" : "Abrir assistente"}</Button>
        </span>
      </div>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {open && !available && <Banner tone="warning">O assistente precisa do servidor (não funciona no banco local do navegador).</Banner>}
      {open && available && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <SelectField label="IA" value={provider} onChange={(e) => setProvider(e.target.value)} options={ready.length ? ready.map((p) => ({ value: p.kind, label: `${p.label}${p.model && p.kind !== "mock" ? ` (${p.model})` : ""}` })) : [{ value: "", label: providers ? "Nenhuma IA pronta no servidor" : "Carregando…" }]} />
          </div>
          {unavailable.length > 0 && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{pendingText(unavailable)}</span>}
          <SegmentedControl
            value={source}
            onChange={setSource}
            options={[
              ...(lessonPdf ? [{ value: "lesson", label: "PDF da aula" }] : []),
              { value: "file", label: "Outro PDF" },
              { value: "text", label: "Texto" },
              { value: "link", label: "Link" },
            ]}
          />
          {source === "lesson" && <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{pending?.slides ? `Arquivo escolhido: ${pending.slides.name}` : `Material complementar: ${slides?.title}`}</span>}
          {source === "file" && (
            <label className="sm-btn sm-btn--secondary sm-btn--sm" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
              {file ? file.name : "Escolher PDF"}
              <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => (setFile(e.target.files?.[0] ?? null), (e.target.value = ""))} />
            </label>
          )}
          {source === "text" && <TextArea label="Texto (transcrição, anotações, trecho de diretriz)" value={text} rows={6} onChange={setText} />}
          {source === "link" && <TextField label="Endereço (https)" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.gov.br/saude/…" />}
          <TextArea label="Pedido (opcional)" value={instructions} rows={2} maxLength={800} onChange={setInstructions} placeholder="Ex.: foque no manejo na UBS e nas pegadinhas de prova." />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Button icon="sparkles" loading={state.busy === "run"} disabled={!canRun || Boolean(state.busy)} onClick={run}>Gerar sugestões</Button>
            {state.busy === "run" && <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Lendo o material…</span>}
          </div>
          {state.note && <Banner tone="warning">{state.note}</Banner>}
          {s && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>
                  {result.usage.model === "mock" || result.usage.provider === "mock" ? "Sugestões simuladas (sem IA)." : `${result.usage.provider} · ${result.usage.model} · ${result.usage.input_tokens + result.usage.output_tokens} tokens · custo estimado ${usd(result.usage.cost_usd)}`} · {result.used_chunks} de {result.total_chunks} trechos lidos
                </span>
                <Button size="sm" variant="secondary" onClick={useAll}>Usar tudo no formulário</Button>
              </div>
              {result.warnings.length > 0 && (
                <Banner tone="warning" title="Confira antes de usar">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </Banner>
              )}
              {s.title && <Suggestion label="Título" used={used.title} onUse={() => use("title", { title: s.title })}>{s.title}</Suggestion>}
              {s.topic && <Suggestion label="Tema" used={used.topic} onUse={() => use("topic", { topic: s.topic })}>{s.topic}</Suggestion>}
              {s.area && <Suggestion label="Grande área" used={used.area} onUse={() => use("area", { area: s.area })}>{areaLabel(s.area)}</Suggestion>}
              {s.summary && <Suggestion label="Resumo & racionalidade clínica" meta={pagesText(s.summary_pages)} used={used.summary} onUse={() => use("summary", { summary: s.summary })}>{s.summary}</Suggestion>}
              {s.key_points.length > 0 && (
                <Suggestion label="Pontos-chave" used={used.key_points} onUse={() => use("key_points", { key_points: s.key_points.map((k) => k.text).join("\n") })}>
                  <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                    {s.key_points.map((k, i) => (
                      <li key={i}>
                        {k.text} <Badge size="sm">{pagesText(k.pages)}</Badge>
                      </li>
                    ))}
                  </ul>
                </Suggestion>
              )}
              {s.missing.length > 0 && (
                <Banner tone="info" title="O material não esclarece">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>{s.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </Banner>
              )}
              <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Nada muda na aula até você clicar em {lesson ? "Salvar alterações" : "Criar aula"}.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
