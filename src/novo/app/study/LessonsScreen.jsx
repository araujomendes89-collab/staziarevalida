// Aulas teórico-práticas com dados do banco (app_lessons, app_lesson, app_lesson_progress, app_start_lesson_questions).
// Mesma marcação do carrossel "Aulas" do protótipo (prototype/Study1.jsx) com aulas reais; a aula aberta segue a
// estrutura padrão: vídeo · área/tema/título/duração/professor/especialidade · "Treinar questões deste tema" ·
// materiais complementares (slides PDF, áudio Flashcast, diretriz SUS/PCDT) · resumo e racionalidade · pontos-chave.
import React from "react";
import { Badge, Banner, Button, Card, EmptyState, Icon, TextField } from "../../ds";
import { IconTile } from "../../prototype/RealIcons.jsx";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { AREAS, areaLabel } from "../practice/format.js";
import { XPToast } from "../play/PlayFeedback.jsx";
import { durationLabel, lessonFileUrl, lessonsAvailable, materialTitle, sizeLabel, videoEmbed } from "./lessonsApi.js";
import { canMeasureEnd, createWatchTracker, MEASURE_TIMEOUT_MS, parsePlayerMessage, subscribeToPlayer, withPlayerApi, xpNote } from "./lessonWatch.js";
import { PodcastsSection } from "../podcasts/PodcastsSection.jsx";

const AREA_ICON = { CLINICA_MEDICA: "stethoscope", CIRURGIA_GERAL: "scissors", PEDIATRIA: "baby", GINECOLOGIA_OBSTETRICIA: "heart-pulse", MEDICINA_FAMILIA_COMUNIDADE: "shield-plus" };
const AREA_COLOR = { CLINICA_MEDICA: "#2F5FD0", CIRURGIA_GERAL: "#D9650A", PEDIATRIA: "#0E8A5F", GINECOLOGIA_OBSTETRICIA: "#C23A74", MEDICINA_FAMILIA_COMUNIDADE: "#6A47E0" };
const GLASS = { background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", backdropFilter: "blur(18px) saturate(1.4)", WebkitBackdropFilter: "blur(18px) saturate(1.4)", boxShadow: "0 30px 60px -20px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.12)" };

function useCarouselStyles() {
  React.useEffect(() => {
    if (document.getElementById("cf-kf")) return;
    const st = document.createElement("style");
    st.id = "cf-kf";
    st.textContent = "@keyframes cfIn{from{opacity:0;transform:scale(.92) translateY(12px)}to{opacity:1;transform:none}}@keyframes cfFade{from{opacity:0}to{opacity:1}}";
    document.head.appendChild(st);
  }, []);
}

export function AreaTabs({ value, onChange, counts }) {
  const all = [{ id: "", label: "Todas as áreas", icon: "layers" }, ...AREAS];
  return (
    <div role="tablist" aria-label="Grande área" style={{ display: "flex", gap: 6, padding: 6, borderRadius: 16, background: "var(--surface-sunken)", overflowX: "auto", scrollbarWidth: "none" }}>
      {all.map((a) => {
        const on = value === a.id;
        const n = a.id ? counts?.[a.id] ?? 0 : Object.values(counts ?? {}).reduce((s, x) => s + x, 0);
        return (
          <button key={a.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(a.id)} style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 14px", border: 0, borderRadius: 12, whiteSpace: "nowrap", cursor: "pointer", background: on ? "var(--surface-card)" : "transparent", boxShadow: on ? "var(--shadow-sm)" : "none", color: on ? "var(--text-primary)" : "var(--text-secondary)", font: "600 14px var(--font-sans)" }}>
            <IconTile name={a.icon} size={24} radius={7} tone={a.tone || "brand"} />
            {a.label}
            {counts && <span style={{ font: "600 11px var(--font-mono)", padding: "2px 6px", borderRadius: 6, background: on ? "var(--surface-brand-soft)" : "var(--surface-card)", color: on ? "var(--text-brand)" : "var(--text-tertiary)" }}>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Poster({ lesson, big, hideTitle = false }) {
  const c = AREA_COLOR[lesson.area] ?? "#0B6F68";
  return (
    <div style={{ position: "relative", height: "100%", borderRadius: 14, overflow: "hidden", background: `linear-gradient(160deg,${c} 0%,color-mix(in oklab,${c} 45%,#08122B) 100%)`, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 14, color: "#fff" }}>
      <span style={{ alignSelf: "flex-start", font: "700 10px var(--font-sans)", letterSpacing: ".1em", textTransform: "uppercase", padding: "4px 8px", borderRadius: 6, background: "rgba(255,255,255,.18)" }}>{areaLabel(lesson.area)}</span>
      <Icon name={AREA_ICON[lesson.area] ?? "tv"} size={big ? 64 : 44} style={{ alignSelf: "center", opacity: 0.35 }} />
      <span style={{ font: `700 ${big ? 15 : 12}px/1.25 var(--font-sans)`, textWrap: "balance", visibility: hideTitle ? "hidden" : "visible" }}>{lesson.title}</span>
      {lesson.progress?.completed_at && <span style={{ position: "absolute", top: 10, right: 10, color: "var(--teal-300)" }}><Icon name="circle-check" size={18} label="Concluída" /></span>}
    </div>
  );
}

/** Carrossel do protótipo com aulas reais: ← → navegam, a aula central abre. */
function Carousel({ lessons, onOpen }) {
  const mobile = useMobile();
  const [i, setI] = React.useState(0);
  const n = lessons.length;
  const idx = n ? ((i % n) + n) % n : 0;
  const cur = lessons[idx];
  React.useEffect(() => setI(0), [lessons]);
  React.useEffect(() => {
    const k = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") setI((v) => v + 1);
      if (e.key === "ArrowLeft") setI((v) => v - 1);
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  const c = cur ? AREA_COLOR[cur.area] : "#0B6F68";
  const CW = mobile ? 180 : 220;
  const CH = mobile ? 250 : 300;
  const GAP = mobile ? 120 : 170;
  const round = (ic, label, f) => (
    <button key={label} type="button" aria-label={label} onClick={f} style={{ width: 36, height: 36, borderRadius: "50%", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", color: "#fff" }}>
      <Icon name={ic} size={16} />
    </button>
  );
  return (
    <section aria-roledescription="carrossel" aria-label="Aulas" style={{ position: "relative", borderRadius: 28, overflow: "hidden", background: `radial-gradient(120% 90% at 50% 40%,color-mix(in oklab,${c} 55%,#08122B) 0%,#08122B 70%)`, transition: "background 600ms var(--ease-standard)", padding: "36px 0 24px", color: "#fff" }}>
      <div style={{ position: "relative", height: CH + 70, perspective: 1200 }}>
        {lessons.map((x, k) => {
          let off = k - idx;
          if (off > n / 2) off -= n;
          if (off < -n / 2) off += n;
          const ab = Math.abs(off);
          if (ab > 3) return null;
          const on = off === 0;
          return (
            <div key={x.id} onClick={() => (on ? onOpen(x) : setI(i + off))} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && (on ? onOpen(x) : setI(i + off))} aria-label={on ? `Abrir ${x.title}` : `Ver ${x.title}`} style={{ position: "absolute", left: "50%", top: 0, width: CW, marginLeft: -CW / 2, padding: 8, borderRadius: 22, cursor: "pointer", ...GLASS, transform: `translateX(${off * GAP}px) translateZ(${-ab * 140}px) rotateY(${-off * 28}deg) scale(${1 - ab * 0.08})`, opacity: ab > 2 ? 0.25 : 1 - ab * 0.22, zIndex: 10 - ab, filter: on ? "none" : "saturate(.7) brightness(.8)", transition: "transform 600ms cubic-bezier(.2,.7,.2,1),opacity 600ms,filter 600ms" }}>
              <div style={{ position: "relative", height: CH - 80 }}>
                <Poster lesson={x} big={on} hideTitle={on} />
                {on && (
                  <>
                    <span style={{ position: "absolute", top: "50%", left: "50%", width: 44, height: 44, margin: "-22px 0 0 -22px", borderRadius: "50%", ...GLASS, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="play" size={18} /></span>
                    <span style={{ position: "absolute", left: "50%", bottom: 12, transform: "translateX(-50%)", display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 10px", borderRadius: 999, background: "rgba(8,18,43,.7)", font: "600 11px var(--font-sans)", whiteSpace: "nowrap" }}><Icon name="play" size={10} />Assistir aula</span>
                  </>
                )}
              </div>
              <div style={{ padding: "10px 4px 4px", textAlign: "center" }}>
                <div style={{ font: "700 13px/1.3 var(--font-sans)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.title}</div>
                <div style={{ font: "500 11px var(--font-sans)", color: "#C4D1EA", marginTop: 3 }}>{[durationLabel(x.duration_minutes), x.topic].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div role="toolbar" aria-label="Navegar pelas aulas" style={{ margin: "0 auto", width: "min(560px,calc(100% - 32px))", display: "flex", alignItems: "center", gap: 6, padding: 6, borderRadius: 999, ...GLASS }}>
        {round("skip-back", "Anterior", () => setI(i - 1))}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, height: 40, padding: "0 12px 0 4px", borderRadius: 999, background: "rgba(255,255,255,.08)" }}>
          <span style={{ width: 32, height: 32, flex: "none", borderRadius: 8, overflow: "hidden" }}><Poster lesson={cur} /></span>
          <span style={{ minWidth: 0, flex: 1, font: "600 12px var(--font-sans)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {cur.title}<span style={{ color: "#93A8D3", fontWeight: 500 }}> · {areaLabel(cur.area)}</span>
          </span>
        </div>
        {round("skip-forward", "Próxima", () => setI(i + 1))}
        {round("maximize-2", "Abrir aula", () => onOpen(cur))}
      </div>
    </section>
  );
}

/**
 * Vídeo da aula. `watch` (A08) recebe o que o player avisa: { onAlive(), onTime(segundos), onEnd() }. YouTube e Vimeo avisam por
 * mensagens do player incorporado; o arquivo MP4/WebM, pelos eventos do próprio <video>. Link aberto em outra aba não avisa nada.
 */
function Video({ url, lesson, watch }) {
  const v = videoEmbed(url);
  const frame = React.useRef(null);
  const handlers = React.useRef(watch);
  handlers.current = watch;
  const kind = v?.kind;
  React.useEffect(() => {
    if (kind !== "youtube" && kind !== "vimeo") return undefined;
    let alive = false;
    const listener = (e) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const m = parsePlayerMessage(e.origin, e.data);
      if (!m) return;
      alive = true;
      handlers.current?.onAlive?.();
      if (m.kind === "ready") subscribeToPlayer(kind, frame.current.contentWindow);
      else if (m.kind === "time") handlers.current?.onTime?.(m.seconds);
      else if (m.kind === "ended") handlers.current?.onEnd?.();
    };
    window.addEventListener("message", listener);
    // o player só começa a avisar depois do pedido; o pedido se repete até chegar o primeiro aviso
    let tries = 0;
    const timer = window.setInterval(() => {
      if (alive || ++tries > 12 || !frame.current) return window.clearInterval(timer);
      subscribeToPlayer(kind, frame.current.contentWindow);
    }, 1000);
    return () => {
      window.removeEventListener("message", listener);
      window.clearInterval(timer);
    };
  }, [kind, url]);
  if (!v) {
    // sem vídeo: o pôster da área (como no protótipo), mais baixo, com o aviso
    return (
      <div style={{ position: "relative", aspectRatio: "21/9", borderRadius: 18, overflow: "hidden", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.35 }}><Poster lesson={lesson} big hideTitle /></div>
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px", borderRadius: 999, ...GLASS, color: "#fff", font: "600 13px var(--font-sans)" }}>
          <Icon name="video-off" size={16} /> Vídeo ainda não disponível para esta aula
        </span>
      </div>
    );
  }
  if (v.kind === "youtube" || v.kind === "vimeo")
    return (
      <iframe
        ref={frame}
        title="Vídeo da aula"
        src={withPlayerApi(v.kind, v.src, typeof window !== "undefined" ? window.location.origin : undefined)}
        onLoad={() => subscribeToPlayer(v.kind, frame.current?.contentWindow)}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        style={{ width: "100%", aspectRatio: "16/9", border: 0, borderRadius: 18, background: "#000", display: "block" }}
      />
    );
  if (v.kind === "file")
    return (
      <video
        src={v.src}
        controls
        preload="metadata"
        onLoadedMetadata={() => watch?.onAlive?.()}
        onTimeUpdate={(e) => watch?.onTime?.(e.currentTarget.currentTime)}
        onEnded={() => watch?.onEnd?.()}
        style={{ width: "100%", aspectRatio: "16/9", borderRadius: 18, background: "#000", display: "block" }}
      />
    );
  return (
    <a href={v.src} target="_blank" rel="noreferrer" style={{ display: "flex", aspectRatio: "16/9", borderRadius: 18, background: "#000", alignItems: "center", justifyContent: "center", gap: 8, color: "#fff", font: "600 14px var(--font-sans)" }}>
      <Icon name="external-link" size={18} /> Abrir o vídeo em outra aba
    </a>
  );
}

// PDF e MP3 enviados: o aluno nunca vê o nome do arquivo do computador de quem enviou (A05); só o rótulo e o tamanho
const FILE_KINDS = new Set(["slides", "flashcast"]);
const MATERIAL = { slides: ["file-text", "Material complementar", "PDF"], flashcast: ["headphones", "Áudio Flashcast", "MP3"], guideline: ["shield-check", "Diretriz SUS / PCDT", ""], other: ["paperclip", "Material", ""] };

/** Linha fixa de material (como no app anterior): "Disponível" com o botão, ou "Não disponível". */
function MaterialSlot({ kind, m, backend }) {
  if (m) return <Material m={m} backend={backend} />;
  const [icon, label, ext] = MATERIAL[kind];
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 14, borderRadius: 16, background: "var(--surface-subtle)", border: "1px solid var(--border-subtle)", opacity: 0.75 }}>
      <IconTile name={icon} size={36} tone="neutral" />
      <div style={{ flex: 1, minWidth: 0, font: "600 14px var(--font-sans)" }}>{label}{ext ? ` (${ext})` : ""}</div>
      <Badge size="sm">Não disponível</Badge>
    </div>
  );
}

function Material({ m, backend }) {
  const [icon, label, kind] = MATERIAL[m.kind] ?? MATERIAL.other;
  const [state, setState] = React.useState({ url: null, busy: false, error: null });
  const renewed = React.useRef(false); // já pediu outro endereço sem o áudio chegar a tocar
  const resumeAt = React.useRef(0);
  // O endereço do áudio vence (6 horas): se o player falhar, pede outro uma vez e continua do mesmo ponto (A04).
  const renew = async (event) => {
    if (renewed.current) return setState((s) => ({ ...s, error: "Não foi possível tocar o áudio. Atualize a página e tente de novo." }));
    renewed.current = true;
    resumeAt.current = event.currentTarget.currentTime || 0;
    try {
      const url = await lessonFileUrl(backend, m.id);
      setState({ url, busy: false, error: null });
    } catch {
      setState((s) => ({ ...s, error: "Não foi possível tocar o áudio. Atualize a página e tente de novo." }));
    }
  };
  const fetchUrl = async () => {
    if (state.url) return state.url;
    setState({ url: null, busy: true, error: null });
    try {
      const url = await lessonFileUrl(backend, m.id);
      setState({ url, busy: false, error: null });
      return url;
    } catch (error) {
      setState({ url: null, busy: false, error: error.message });
      return null;
    }
  };
  const open = async () => {
    if (m.url) return void window.open(m.url, "_blank", "noopener");
    if (m.kind === "flashcast") return void fetchUrl(); // o áudio toca aqui mesmo
    // a janela abre no clique (bloqueadores de janela barram a que abre depois de esperar a rede)
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    const url = await fetchUrl();
    if (url && win) win.location.href = url;
    else if (url) window.open(url, "_blank", "noopener");
    else win?.close();
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 16, background: "var(--surface-subtle)", border: "1px solid var(--border-subtle)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <IconTile name={icon} size={36} tone="brand" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", font: "600 14px var(--font-sans)" }}>
            {label}{kind ? ` (${kind})` : ""}
            <Badge size="sm" tone="success" icon="check">Disponível</Badge>
          </div>
          <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{[FILE_KINDS.has(m.kind) ? null : materialTitle(m.title), m.size_bytes ? sizeLabel(m.size_bytes) : null].filter(Boolean).join(" · ")}</div>
        </div>
        <Button size="sm" variant="secondary" icon={m.url ? "external-link" : m.kind === "flashcast" ? "play" : "download"} loading={state.busy} onClick={open} disabled={!m.url && (!m.has_file || !lessonsAvailable(backend))}>
          {m.url ? "Abrir" : m.kind === "flashcast" ? (state.url ? "Pronto" : "Ouvir") : "Abrir"}
        </Button>
      </div>
      {state.error && <span style={{ font: "var(--type-caption)", color: "var(--danger-text)" }}>{state.error}</span>}
      {m.kind === "flashcast" && state.url && <audio
          controls
          autoPlay
          src={state.url}
          style={{ width: "100%" }}
          aria-label="Áudio Flashcast"
          onError={renew}
          onPlaying={() => (renewed.current = false)}
          onLoadedMetadata={(e) => {
            if (resumeAt.current) (e.currentTarget.currentTime = resumeAt.current), (resumeAt.current = 0);
          }}
        />}
    </div>
  );
}

export function LessonDetail({ lesson: initial, go, onBack, onChanged }) {
  const { backend, boot } = useSession();
  const mobile = useMobile();
  const [lesson, setLesson] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [play, setPlay] = React.useState(null);
  const c = AREA_COLOR[lesson.area] ?? "#0B6F68";
  const done = Boolean(lesson.progress?.completed_at);
  const embed = videoEmbed(lesson.video_url);
  const measurable = canMeasureEnd(embed);
  // A08: o XP da conclusão só vem de quem assistiu até o fim; o player avisa e o banco guarda (app_lesson_watch)
  const [watch, setWatch] = React.useState({ endedAt: lesson.progress?.watched_to_end_at ?? null, measure: measurable ? "waiting" : "none" });
  const tracker = React.useRef(createWatchTracker());
  const sent = React.useRef({ max: 0, ended: false });
  const live = React.useRef({});
  live.current = { backend, id: lesson.id };
  const report = React.useCallback(async (ended) => {
    const { backend: b, id } = live.current;
    const max = tracker.current.max;
    if (ended ? sent.current.ended : max <= sent.current.max) return;
    const before = { ...sent.current };
    sent.current = { max: Math.max(max, sent.current.max), ended: sent.current.ended || ended };
    try {
      const r = await b.rpc("app_lesson_watch", { p_id: id, p_seconds: max, p_ended: ended });
      if (!r) return;
      setWatch((w) => ({ ...w, endedAt: r.watched_to_end_at ?? w.endedAt }));
      setLesson((l) => ({ ...l, progress: { ...(l.progress ?? {}), ...r } }));
      if (r.xp) setPlay({ xp: { total: r.xp, valid: true }, bonus: [], coins: 0 });
    } catch {
      sent.current = before; // não chegou ao banco: tenta de novo no próximo aviso
    }
  }, []);
  const watcher = React.useMemo(
    () => ({
      onAlive: () => setWatch((w) => (w.measure === "waiting" || w.measure === "unavailable" ? { ...w, measure: "ok" } : w)),
      onTime: (t) => (tracker.current.time(t), setWatch((w) => (w.measure === "ok" ? w : { ...w, measure: "ok" }))),
      onEnd: () => {
        if (tracker.current.end()) report(true);
      },
    }),
    [report]
  );
  React.useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => backend.rpc("app_lesson_watch_state", { p_id: lesson.id }))
      .then((r) => alive && r?.watched_to_end_at && setWatch((w) => ({ ...w, endedAt: r.watched_to_end_at })))
      .catch(() => null); // sem o estado guardado a tela só mostra a regra
    return () => {
      alive = false;
    };
  }, [backend, lesson.id]);
  React.useEffect(() => {
    if (!measurable) return undefined;
    const timer = window.setTimeout(() => setWatch((w) => (w.measure === "waiting" ? { ...w, measure: "unavailable" } : w)), MEASURE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [measurable, lesson.id]);
  React.useEffect(() => () => void report(false), [report]); // ao sair da aula, guarda até onde foi
  const train = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await backend.rpc("app_start_lesson_questions", { p_id: lesson.id, p_count: 20 });
      go("sessao", { s: s.session_id });
    } catch {
      setError("Não foi possível abrir o treino. Tente de novo.");
      setBusy(false);
    }
  };
  const complete = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await backend.rpc("app_lesson_progress", { p_id: lesson.id, p_completed: true });
      const next = { ...lesson, progress: { ...(lesson.progress ?? {}), ...p } };
      setLesson(next);
      onChanged?.(next);
      if (p.xp) setPlay({ xp: { total: p.xp, valid: true }, bonus: [], coins: 0 });
    } catch {
      setError("Não foi possível registrar a conclusão. Tente de novo.");
    }
    setBusy(false);
  };
  const meta = [lesson.instructor && `Professor: ${lesson.instructor}`, lesson.specialty, durationLabel(lesson.duration_minutes)].filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={onBack}>Voltar para as aulas</Button>
      </div>
      <div style={{ borderRadius: 28, padding: mobile ? 12 : 16, color: "#fff", background: `radial-gradient(120% 120% at 50% 0%,color-mix(in oklab,${c} 40%,#0D1C42) 0%,#08122B 75%)`, border: "1px solid rgba(255,255,255,.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 6px 12px", gap: 8, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, font: "700 11px var(--font-sans)", letterSpacing: ".1em" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--danger-solid)" }} />MÓDULO AUDIOVISUAL STAZIAMED</span>
          <span style={{ font: "600 12px var(--font-sans)", color: "#C4D1EA" }}>{areaLabel(lesson.area)} · {lesson.topic}{lesson.duration_minutes ? ` · ${durationLabel(lesson.duration_minutes)}` : ""}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", padding: "4px 6px 16px" }}>
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <h2 style={{ margin: 0, font: `700 ${mobile ? 20 : 24}px/1.25 var(--font-sans)`, color: "#fff" }}>{lesson.title}</h2>
            <div style={{ font: "500 13px var(--font-sans)", color: "#A9B5C7", marginTop: 4 }}>{meta.join(" · ") || "Equipe StaziaMed"}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="sm-btn" onClick={train} disabled={busy} style={{ background: "var(--teal-400)", color: "var(--navy-950)" }}>
              <Icon name="file-question" size={18} /> Treinar questões deste tema
            </button>
            <Button variant="secondary" icon={done ? "circle-check" : "check"} onClick={complete} disabled={busy || done} style={{ background: "rgba(255,255,255,.1)", color: "#fff", borderColor: "rgba(255,255,255,.25)" }}>
              {done ? "Aula concluída" : "Marcar como concluída"}
            </Button>
          </div>
        </div>
        <Video url={lesson.video_url} lesson={lesson} watch={watcher} />
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {play && <XPToast play={play} />}
      {boot?.play?.enabled && xpNote({ embed, measure: watch.measure, done, ended: Boolean(watch.endedAt) }) && (
        <p role="note" style={{ margin: 0, font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{xpNote({ embed, measure: watch.measure, done, ended: Boolean(watch.endedAt) })}</p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1.6fr) minmax(280px,1fr)", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card style={{ borderRadius: 24 }} padding={mobile ? 18 : 24}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <IconTile name="book-open" size={32} tone="brand" />
              <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>Resumo & racionalidade clínica</span>
            </div>
            {lesson.summary ? <p style={{ margin: 0, font: "400 15px/1.65 var(--font-sans)", whiteSpace: "pre-wrap", textWrap: "pretty" }}>{lesson.summary}</p> : <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Resumo ainda não publicado.</p>}
          </Card>
          <Card style={{ borderRadius: 24 }} padding={mobile ? 18 : 24}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <IconTile name="sparkles" size={32} tone="warning" />
              <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>Pontos-chave para o Revalida</span>
            </div>
            {lesson.key_points?.length ? (
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {lesson.key_points.map((p, k) => (
                  <li key={k} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 14, background: "var(--surface-subtle)", border: "1px solid var(--border-subtle)" }}>
                    <span style={{ width: 24, height: 24, flex: "none", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--warning-bg)", color: "var(--warning-text)", font: "700 12px var(--font-sans)" }}>{k + 1}</span>
                    <span style={{ font: "500 14px/1.5 var(--font-sans)" }}>{p}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Pontos-chave ainda não publicados.</p>
            )}
          </Card>
        </div>
        <Card style={{ borderRadius: 24, position: mobile ? "static" : "sticky", top: 24 }} padding={mobile ? 18 : 20}>
          <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>Materiais complementares</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            <MaterialSlot kind="slides" m={lesson.materials.find((m) => m.kind === "slides")} backend={backend} />
            <MaterialSlot kind="flashcast" m={lesson.materials.find((m) => m.kind === "flashcast")} backend={backend} />
            <MaterialSlot
              kind="guideline"
              m={lesson.materials.find((m) => m.kind === "guideline") ?? (lesson.guideline_url ? { id: "guideline", kind: "guideline", title: lesson.guideline_title || "Documento oficial", url: lesson.guideline_url } : null)}
              backend={backend}
            />
            {lesson.materials.filter((m) => m.kind === "other").map((m) => <Material key={m.id} m={m} backend={backend} />)}
          </div>
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border-subtle)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge size="sm" tone="brand">{areaLabel(lesson.area)}</Badge>
            <Badge size="sm">{lesson.topic}</Badge>
            {lesson.questions_topic > 0 && <Badge size="sm" tone="success">{lesson.questions_topic} questões do tema</Badge>}
            {lesson.questions_topic === 0 && <Badge size="sm" tone="warning">treino pela área ({lesson.questions_area} questões)</Badge>}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function LessonsScreen({ go }) {
  const { backend } = useSession();
  useCarouselStyles();
  const [area, setArea] = React.useState("");
  const [q, setQ] = React.useState("");
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [open, setOpen] = React.useState(null);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    setError(null);
    backend
      .rpc("app_lessons", { p_area: area || null, p_search: q.trim() || null })
      .then((r) => alive && setData(r))
      .catch(() => alive && setError("Não foi possível carregar as aulas."));
    return () => {
      alive = false;
    };
  }, [backend, area, q, tick]);
  const openLesson = async (l) => {
    try {
      setOpen((await backend.rpc("app_lesson", { p_id: l.id })) ?? l);
      window.scrollTo(0, 0);
    } catch {
      setOpen(l);
    }
  };
  if (open) {
    return (
      <LessonDetail
        lesson={open}
        go={go}
        onBack={() => (setOpen(null), setTick((n) => n + 1))}
        onChanged={(next) => setData((d) => (d ? { ...d, lessons: d.lessons.map((x) => (x.id === next.id ? { ...x, progress: next.progress } : x)) } : d))}
      />
    );
  }
  if (error) return <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={() => setTick((n) => n + 1)}>Tentar de novo</Button>}>{error}</Banner>;
  if (!data) return <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;
  const empty = data.total === 0;
  return (
    <>
      <AreaTabs value={area} onChange={setArea} counts={data.by_area} />
      <TextField icon="search" aria-label="Buscar aula" placeholder="Buscar aula por título, tema, professor ou conduta" value={q} onChange={(e) => setQ(e.target.value)} />
      {empty ? (
        <EmptyState icon="tv" title="As aulas estão sendo preparadas" description="Assim que a equipe publicar as primeiras aulas teórico-práticas, elas aparecem aqui, por grande área. Enquanto isso, treine com as questões oficiais." action={<Button onClick={() => go("questoes")}>Montar um treino</Button>} />
      ) : data.lessons.length === 0 ? (
        <EmptyState icon="search" title="Nenhuma aula com esses filtros" description="Tente outra área ou outro termo." />
      ) : (
        <>
          <Carousel lessons={data.lessons} onOpen={openLesson} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
            <span>{data.lessons.length} {data.lessons.length === 1 ? "aula" : "aulas"} · {data.completed} {data.completed === 1 ? "concluída" : "concluídas"}</span>
            <span>Use ← → para navegar · clique na aula central para assistir</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
            {data.lessons.map((l) => (
              <button key={l.id} type="button" onClick={() => openLesson(l)} className="sm-card sm-card--interactive" style={{ borderRadius: 20, padding: 16, textAlign: "left", font: "inherit", color: "inherit", display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ width: 56, height: 72, flex: "none", borderRadius: 10, overflow: "hidden" }}><Poster lesson={l} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", font: "500 12px var(--font-sans)", color: "var(--text-tertiary)" }}>{areaLabel(l.area)} · {l.topic}</span>
                  <span style={{ display: "block", font: "600 14px/1.35 var(--font-sans)", marginTop: 2 }}>{l.title}</span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 4 }}>
                    {l.duration_minutes && <span><Icon name="clock" size={12} /> {durationLabel(l.duration_minutes)}</span>}
                    {l.materials.length > 0 && <span>{l.materials.length} {l.materials.length === 1 ? "material" : "materiais"}</span>}
                    {l.progress?.completed_at && <Badge size="sm" tone="success" icon="check">Concluída</Badge>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <PodcastsSection backend={backend} area={area} />
    </>
  );
}
