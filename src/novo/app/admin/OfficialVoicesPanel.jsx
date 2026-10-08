import React from "react";
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
  const [scenario, setScenario] = React.useState("apresentacao");
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

  React.useEffect(() => {
    const abort = new AbortController();
    request("", { signal: abort.signal }).then((response) => response.json()).then((value) => { if (!abort.signal.aborted) setStatus(value); })
      .catch((e) => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [request]);
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

  const test = async (id) => {
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
    setBusy(id);
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
    } catch (e) { if (!abort.signal.aborted && generation === r.generation) setError(e.message); }
    finally { if (generation === r.generation) setBusy(null); }
  };
  const sample = selected ? VOICE_SCENARIOS[selected.scenario] : null;
  const emotion = orbEmotion(sample ? { emotion: sample.emotion, intensity: sample.intensity } : null);
  return (
    <section className="official-voices" aria-labelledby="official-voices-title">
      <header>
        <span className="official-voices__eyebrow">NEXUS · AUDIÇÃO INTERNA</span>
        <h2 id="official-voices-title">Vozes oficiais do Tutor Stazia</h2>
        <p>ElevenLabs somente como TTS. Conteúdo, personalidade, memória e emoção continuam no Stazia Tutor Engine.</p>
      </header>
      <p className="official-voices__notice" role="status">{status?.releaseReady ? "Tranquilo, Durona e Direto estão aprovadas. Nenhum deploy é realizado por este painel." : "Liberação aos alunos bloqueada até a aprovação de Tranquilo, Durona e Direto."} Os testes reais consomem créditos ElevenLabs.</p>
      {status?.pending && <p>{status.pending}</p>}
      <label className="official-voices__scenario">Cenário de audição
        <select value={scenario} onChange={(event) => setScenario(event.target.value)} disabled={Boolean(busy)}>
          {Object.entries(VOICE_SCENARIOS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
      </label>
      <div className="official-voices__rows">
        {Object.entries(OFFICIAL_VOICES).map(([id, voice]) => {
          const row = status?.rows?.find((item) => item.id === id);
          return <div className="official-voices__row" key={id}>
            <div><h3>{voice.label}</h3><p>{voice.description}</p><small>{row?.approved ? "Aprovada" : row?.configured ? "Aguardando audição e aprovação" : "Voice ID pendente"}</small>{row?.pending && row.pending !== status?.pending && <p>{row.pending}</p>}</div>
            <button type="button" aria-label={`Testar voz ${voice.label}`} disabled={!row?.ready || Boolean(busy)} onClick={() => test(id)}>{busy === id ? "Gerando áudio…" : "▶ Testar voz"}</button>
          </div>;
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
      <p className="official-voices__footnote">Tranquilo, Durona e Direto são as três vozes. Personalidade, memória, regras pedagógicas e respostas são definidas pelo Stazia Tutor Engine; a ElevenLabs somente sintetiza o áudio.</p>
      {status?.rows?.some((row) => row.configured) && <details><summary>Identificadores de revisão para registrar a aprovação</summary>{status.rows.filter((row) => row.configured).map((row) => <p key={row.id}>{row.label}: <code>{row.fingerprint}</code></p>)}</details>}
    </section>
  );
}
