// Vozes do Nexus (administração): ouvir cada cenário da versão atual de cada voz e, para quem está na lista de aprovação do
// servidor, aprovar ou revogar aquela voz. O servidor registra as audições e confere tudo de novo; o navegador manda só o
// professor e o cenário.
import React from "react";
import { Badge, Button } from "../../ds";
import { useSession } from "../session.jsx";
import { OFFICIAL_VOICES, VOICE_SCENARIOS } from "../../../shared/tutor/officialVoices";
import { StaziaVoiceOrb, orbEmotion } from "../tutor/voice/StaziaVoiceOrb.jsx";
import { unlockAudio } from "../tutor/voice/audioUnlock.js";
import "./officialVoices.css";

export function OfficialVoicesPanel({ endpoint = "/api/tutor/voices" }) {
  const { backend } = useSession();
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(null);
  const [acting, setActing] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [speaking, setSpeaking] = React.useState(false);
  const [stream, setStream] = React.useState(null);
  const player = React.useRef(null);
  const resources = React.useRef({ url: null, source: null, destination: null, abort: null, generation: 0 });

  const request = React.useCallback(async (path = "", options = {}) => {
    const token = await backend.accessToken();
    if (!token) throw new Error("Entre na sua conta StaziaMed.");
    const response = await fetch(`${endpoint}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Não foi possível carregar a audição.");
    }
    return response;
  }, [backend, endpoint]);

  const reload = React.useCallback((signal) => request("", { signal }).then((response) => response.json()).then((value) => { if (!signal?.aborted) setStatus(value); }), [request]);
  React.useEffect(() => {
    const abort = new AbortController();
    reload(abort.signal).catch((e) => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [reload]);
  React.useEffect(() => {
    const audio = player.current;
    return () => {
    const r = resources.current;
    r.generation++;
    r.abort?.abort();
    audio?.pause();
    audio?.removeAttribute("src");
    if (r.url) URL.revokeObjectURL(r.url);
    r.source?.disconnect();
    r.destination?.disconnect();
    r.destination?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const test = async (id, scenario) => {
    const r = resources.current;
    const generation = ++r.generation;
    r.abort?.abort();
    const abort = new AbortController();
    r.abort = abort;
    player.current.pause();
    player.current.removeAttribute("src");
    if (r.url) URL.revokeObjectURL(r.url);
    r.url = null;
    setSpeaking(false);
    setBusy(`${id}:${scenario}`);
    setError("");
    setSelected({ id, scenario });
    // Um único player e sinal de áudio real para a esfera, sem alterar o avatar.
    const ctx = unlockAudio();
    if (ctx) {
      try {
        await ctx.resume();
        if (!r.source) {
          r.source = ctx.createMediaElementSource(player.current);
          r.destination = ctx.createMediaStreamDestination();
          r.source.connect(ctx.destination);
          r.source.connect(r.destination);
          setStream(r.destination.stream);
        }
      } catch { /* player nativo continua disponível sem a medição visual */ }
    }
    try {
      const response = await request("/preview", { method: "POST", signal: abort.signal, body: JSON.stringify({ personality: id, scenario }) });
      const blob = await response.blob();
      if (generation !== r.generation) return;
      const responseType = response.headers.get("content-type")?.split(";", 1)[0].toLowerCase() || "";
      const types = [responseType, blob.type].filter(Boolean);
      if (types.length && !types.some((type) => type.startsWith("audio/"))) throw new Error("O servidor não retornou áudio.");
      if (r.url) URL.revokeObjectURL(r.url);
      r.url = URL.createObjectURL(blob);
      player.current.src = r.url;
      try { await player.current.play(); }
      catch { setError("O navegador bloqueou a reprodução automática. Use o botão de reprodução do áudio abaixo."); }
      // a audição entrou no registro do servidor: o painel relê o que já foi ouvido
      reload().catch(() => undefined);
    } catch (e) { if (!abort.signal.aborted && generation === r.generation) setError(e.message); }
    finally { if (generation === r.generation) setBusy(null); }
  };
  const decide = async (id, action) => {
    setActing(`${action}:${id}`);
    setError("");
    try {
      const response = await request(`/${action}`, { method: "POST", body: JSON.stringify({ personality: id }) });
      setStatus(await response.json());
    } catch (e) { setError(e.message); }
    finally { setActing(null); }
  };
  const sample = selected ? VOICE_SCENARIOS[selected.scenario] : null;
  const emotion = orbEmotion(sample ? { emotion: sample.emotion, intensity: sample.intensity } : null);
  const approver = Boolean(status?.approver);
  return (
    <section className="official-voices" aria-labelledby="official-voices-title">
      <header>
        <span className="official-voices__eyebrow">NEXUS · AUDIÇÃO E APROVAÇÃO</span>
        <h2 id="official-voices-title">Vozes do Nexus</h2>
        <p>Ouça todos os cenários da versão atual de uma voz; depois, quem está na lista de aprovação aprova. Cada voz vale sozinha: aprovada, ela já fala com os alunos (se "Voz do professor só para a equipe" estiver desligado no Tutor). Mudar a voz, o modelo ou a direção cria uma versão nova, que pede nova audição.</p>
      </header>
      <p className="official-voices__notice" role="status">
        {approver ? "Você está na lista de aprovação." : "Só quem está na lista de aprovação do servidor aprova ou revoga. Você pode ouvir."} As audições consomem créditos da ElevenLabs.
      </p>
      {status?.pending && <p>{status.pending}</p>}
      <div className="official-voices__rows">
        {Object.entries(OFFICIAL_VOICES).map(([id, voice]) => {
          const row = status?.rows?.find((item) => item.id === id);
          const label = row?.approved ? "Aprovada" : row?.configured ? "Aguardando audição e aprovação" : "Voice ID pendente";
          return (
            <div className="official-voices__row" role="group" aria-label={`Voz ${voice.label}`} key={id}>
              <div className="official-voices__who">
                <h3>{voice.label}</h3>
                <p>{voice.description}</p>
                <Badge tone={row?.approved ? "success" : row?.configured ? "warning" : "neutral"} size="sm">{label}</Badge>
                {row?.pending && row.pending !== status?.pending && <p>{row.pending}</p>}
              </div>
              <div className="official-voices__scenarios">
                {(row?.scenarios ?? []).map((sc) => (
                  <button type="button" key={sc.id} className="official-voices__scenario" aria-pressed={sc.heard ? "true" : "false"} aria-label={`Ouvir ${voice.label}: ${sc.label}`}
                    disabled={!row?.ready || Boolean(busy)} onClick={() => test(id, sc.id)}>
                    {busy === `${id}:${sc.id}` ? "Gerando…" : `${sc.heard ? "✓ " : "▶ "}${sc.label}`}
                  </button>
                ))}
              </div>
              <div className="official-voices__actions">
                {row?.approved
                  ? approver && <Button variant="secondary" size="sm" aria-label={`Revogar: ${voice.label}`} loading={acting === `revoke:${id}`} disabled={Boolean(acting)} onClick={() => decide(id, "revoke")}>Revogar</Button>
                  : <Button size="sm" aria-label={`Aprovar esta voz: ${voice.label}`} loading={acting === `approve:${id}`} disabled={!row?.can_approve || Boolean(acting)} onClick={() => decide(id, "approve")}>Aprovar esta voz</Button>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="official-voices__player" hidden={!selected}>
        <div className="official-voices__orb"><StaziaVoiceOrb conversationState={busy ? "thinking" : speaking ? "speaking" : "idle"} emotion={emotion.emotion} emotionIntensity={emotion.intensity} outputStream={stream} /></div>
        <div>
          {selected && <p><strong>{OFFICIAL_VOICES[selected.id].label}</strong> · {sample.label}</p>}
          <audio ref={player} controls preload="none" aria-label="Audição da voz oficial" onPlay={() => setSpeaking(true)} onPause={() => setSpeaking(false)} onEnded={() => setSpeaking(false)} onError={() => { setSpeaking(false); setError("Falha ao reproduzir o áudio. Tente a audição novamente."); }} />
          {selected && <p>{sample.text ?? OFFICIAL_VOICES[selected.id].sample}</p>}
        </div>
      </div>
      {error && <p role="alert" className="official-voices__error">{error}</p>}
      <p className="official-voices__footnote">Personalidade, memória, regras pedagógicas e respostas vêm do motor do Tutor; a ElevenLabs só sintetiza o áudio.</p>
    </section>
  );
}
