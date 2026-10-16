// Podcasts publicados, na tela de Aulas (o menu ficou como o usuário pediu: Estudar › Aulas, Grandes Temas, Atualizações).
// Só aparecem episódios publicados pelo administrador (app_podcasts / app_podcast); cada um traz a transcrição (Ana e Bruno) e as
// fontes com as páginas usadas. O áudio vem por link assinado do servidor (/api/podcasts/:id/audio/link).
import React from "react";
import { Badge, Button, Icon } from "../../ds";
import { IconTile } from "../../prototype/RealIcons.jsx";
import { areaLabel } from "../practice/format.js";
import { durationText, podcastAudioUrl, podcastsAvailable } from "./podcastsApi.js";
import { explainError } from "../../../shared/errors/explicarErro";

const dateBR = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(iso)) : "");
const SPEAKER = { ANA: "Ana", BRUNO: "Bruno" };

function Episode({ episode, backend }) {
  const [audio, setAudio] = React.useState({ url: null, busy: false, error: null });
  const [details, setDetails] = React.useState(null);
  const [showText, setShowText] = React.useState(false);
  React.useEffect(() => () => audio.url?.startsWith("blob:") && URL.revokeObjectURL(audio.url), [audio.url]);
  const listen = async () => {
    if (audio.url) return;
    setAudio({ url: null, busy: true, error: null });
    try {
      setAudio({ url: await podcastAudioUrl(backend, episode.id), busy: false, error: null });
    } catch (error) {
      setAudio({ url: null, busy: false, error: explainError(error) });
    }
  };
  const toggleText = async () => {
    setShowText((s) => !s);
    if (!details) {
      try {
        setDetails(await backend.rpc("app_podcast", { p_id: episode.id }));
      } catch {
        setDetails({ lines: [], sources: [], error: true });
      }
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 18, background: "var(--surface-subtle)", border: "1px solid var(--border-subtle)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <IconTile name="headphones" size={40} tone="brand" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "500 12px var(--font-sans)", color: "var(--text-tertiary)" }}>{[episode.area ? areaLabel(episode.area) : null, episode.topic].filter(Boolean).join(" · ")}</div>
          <div style={{ font: "600 15px/1.35 var(--font-sans)" }}>{episode.title}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 2, flexWrap: "wrap" }}>
            <span><Icon name="clock" size={12} /> {durationText(episode.seconds)}</span>
            <span>{dateBR(episode.published_at)}</span>
            {episode.lesson && <Badge size="sm">Aula: {episode.lesson.title}</Badge>}
          </div>
        </div>
        <Button size="sm" variant="secondary" icon="play" loading={audio.busy} disabled={!podcastsAvailable(backend)} onClick={listen}>{audio.url ? "Tocando" : "Ouvir"}</Button>
      </div>
      {audio.error && <span style={{ font: "var(--type-caption)", color: "var(--danger-text)" }}>{audio.error}</span>}
      {audio.url && <audio controls autoPlay src={audio.url} style={{ width: "100%" }} aria-label={`Podcast: ${episode.title}`} />}
      <button type="button" onClick={toggleText} aria-expanded={showText} style={{ alignSelf: "flex-start", border: 0, background: "none", padding: 0, font: "600 13px var(--font-sans)", color: "var(--text-brand)", cursor: "pointer" }}>
        {showText ? "Esconder transcrição e fontes" : "Ver transcrição e fontes"}
      </button>
      {showText && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!details && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Carregando…</span>}
          {details?.error && <span style={{ font: "var(--type-caption)", color: "var(--danger-text)" }}>Não foi possível carregar a transcrição.</span>}
          {details?.sources?.length > 0 && (
            <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>
              <b>Fontes:</b>{" "}
              {details.sources.map((s, i) => (
                <span key={i}>
                  {i ? "; " : ""}
                  {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : s.title}
                  {s.pages?.length ? ` (p. ${s.pages.join(", ")})` : ""}
                </span>
              ))}
              . Roteiro feito só com essas fontes e revisado pela equipe.
            </div>
          )}
          {details?.lines?.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
              {details.lines.map((l, i) => (
                <p key={i} style={{ margin: 0, font: "var(--type-body-sm)", lineHeight: 1.5 }}>
                  <b style={{ color: l.speaker === "ANA" ? "var(--text-brand)" : "var(--text-primary)" }}>{SPEAKER[l.speaker] ?? l.speaker}:</b> {l.text}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Lista dos podcasts publicados (filtrada pela grande área escolhida). Sem episódio publicado, não mostra nada. */
export function PodcastsSection({ backend, area }) {
  const [episodes, setEpisodes] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    backend
      .rpc("app_podcasts", { p_area: area || null })
      .then((r) => alive && setEpisodes(r ?? []))
      .catch(() => alive && setEpisodes([]));
    return () => {
      alive = false;
    };
  }, [backend, area]);
  if (!episodes?.length) return null;
  return (
    <section aria-label="Podcasts" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Podcasts</h3>
        <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Ana e Bruno conversam sobre o tema a partir dos materiais da equipe</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
        {episodes.map((e) => <Episode key={e.id} episode={e} backend={backend} />)}
      </div>
    </section>
  );
}
