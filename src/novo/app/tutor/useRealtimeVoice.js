// Conversa por voz em tempo real com o Stazia Tutor. Três provedores, a mesma tela:
//
//  - Gemini (voz nativa do Google, português do Brasil sem sotaque americano; preferido no modo automático): o servidor cria uma
//    chave temporária com as instruções travadas e o navegador conecta direto no Google (voice/geminiLive.js). As ferramentas
//    passam pelo servidor. Se não conectar neste aparelho, o app pede ao servidor outra voz (OpenAI) na hora.
//
//  - GPT-Live (quando o servidor diz que está disponível): o navegador prepara a oferta WebRTC e manda para o NOSSO servidor, que
//    abre a sessão com a OpenAI e devolve a resposta (nenhuma credencial vem para cá). A voz conversa e, quando precisa do sistema,
//    DELEGA: o aplicativo manda o que foi dito ao servidor (/voice/delegate) e devolve à voz o que dizer, já conferido.
//  - Realtime (reserva, ou escolhido no painel): o servidor devolve um segredo temporário e o navegador abre o WebRTC direto com a
//    OpenAI; as ferramentas que o professor pede passam pelo servidor (/voice/tool).
//
// Nos dois: o servidor decide direito, cota, uma voz por aluno e a reserva de tempo (renovada a cada ~minuto); as transcrições vão
// para o servidor (que confere o que foi dito) e o uso também. Nenhum áudio é gravado.
//
// estados: idle · connecting · ready · listening · thinking · speaking · interrupted · paused · reconnecting · ended · error
// A animação não conhece a OpenAI: ela lê só este estado, os níveis de áudio (streams) e a emoção que o servidor devolve.
import React from "react";
import { voiceApi } from "./api.js";
import { unlockAudio } from "./voice/audioUnlock.js";
import { openGeminiLive } from "./voice/geminiLive.js";
import { refreshVoiceLanguage, TUTOR_SPOKEN_LANGUAGE } from "../../../shared/tutor/voiceLanguage";

const CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const CONNECT_TIMEOUT_MS = 20_000;
const UTTERANCE_GAP_MS = 1_200; // GPT-Live manda a transcrição em pedaços: sem pedaço novo por este tempo, a fala terminou
const SPEAKING_GAP_MS = 900;
const MAX_RECONNECTS = 2;
// o Gemini não abriu neste aparelho (rede que bloqueia, navegador sem suporte, modelo recusado): a OpenAI direto por um tempo,
// sem fazer o aluno esperar outra tentativa a cada ligação
const GEMINI_RETRY_MS = 10 * 60_000;
let geminiFailedAt = 0;
/** Testes: esquece a falha do Gemini neste aparelho. */
export const resetGeminiDeviceFallback = () => {
  geminiFailedAt = 0;
};

export const realtimeSupport = () =>
  typeof window !== "undefined" && typeof window.RTCPeerConnection === "function" && Boolean(navigator?.mediaDevices?.getUserMedia);

/** Mensagem para o aluno, por tipo de problema. */
export function realtimeErrorMessage(err) {
  if (!err) return null;
  switch (err.kind) {
    case "mic":
      return "O navegador bloqueou o microfone. Clique no cadeado ao lado do endereço, permita o microfone e tente de novo.";
    case "no_mic":
      return "Não encontrei um microfone neste aparelho.";
    case "unsupported":
      return "Este navegador não faz conversa por voz em tempo real. Use o Chrome, o Edge ou o Safari atualizados.";
    case "network":
      return "A conexão de voz caiu. Confira a internet e toque em Reconectar.";
    case "timeout":
      return "Não consegui conectar a voz a tempo. Tente de novo.";
    default:
      return err.message || "A conversa por voz falhou agora. Tente de novo em instantes.";
  }
}

const newMetrics = () => ({ t0: Date.now(), turns: 0, turnSum: 0, tools: 0, toolSum: 0, delegations: 0, delegateSum: 0, reconnects: 0, interruptions: 0, device_changes: 0, audio_errors: 0, texts: 0, mutedSum: 0 });

/** Resumo das métricas da ligação para o servidor (só números e rótulos curtos). */
function metricsOut(m) {
  const avg = (sum, n) => (n ? Math.round(sum / n) : undefined);
  const out = {
    connect_ms: m.connect_ms, first_audio_ms: m.first_audio_ms, turn_ms_avg: avg(m.turnSum, m.turns), turns: m.turns, reconnects: m.reconnects,
    tool_ms_avg: avg(m.toolSum, m.tools), tools: m.tools, delegations: m.delegations, delegate_ms_avg: avg(m.delegateSum, m.delegations),
    interruptions: m.interruptions, device_changes: m.device_changes, audio_errors: m.audio_errors, texts: m.texts,
    muted_ms: Math.round(m.mutedSum + (m.mutedAt ? Date.now() - m.mutedAt : 0)),
    disconnect_reason: m.disconnect_reason, mic_permission: m.mic_permission, last_error: m.last_error, provider_used: m.provider,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && v !== null));
}

let eventSeq = 0;
const eid = (p) => `${p}_${Date.now().toString(36)}_${(++eventSeq).toString(36)}`;

/** Espera a coleta de candidatos ICE (GPT-Live recebe a oferta completa). Navegador sem esse estado: segue. */
function waitIce(pc, ms = 3_000) {
  if (!pc || !("iceGatheringState" in pc) || pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener?.("icegatheringstatechange", check);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    const timer = setTimeout(done, ms);
    pc.addEventListener?.("icegatheringstatechange", check);
  });
}

/**
 * live = o servidor indicou que pode abrir o GPT-Live (manda a oferta antes de abrir a ligação).
 * onAvatar recebe a emoção que o servidor calculou (para a animação), nunca deduzida do texto.
 */
export function useRealtimeVoice({ backend, sessionId, live = false, hint = null, onTranscript, onWarning, onAvatar }) {
  const [state, setStateRaw] = React.useState("idle");
  const [error, setError] = React.useState(null);
  const [remaining, setRemaining] = React.useState(null); // segundos de voz que restam (pelo servidor)
  const [muted, setMutedState] = React.useState(false);
  const [captions, setCaptions] = React.useState({ tutor: "", student: "" });
  const [streams, setStreams] = React.useState({ input: null, output: null });
  const [provider, setProvider] = React.useState(null);
  const [playbackBlocked, setPlaybackBlocked] = React.useState(false);
  const r = React.useRef({ handled: new Set(), transcript: [] });
  const stateRef = React.useRef("idle");
  const cb = React.useRef({});
  cb.current = { onTranscript, onWarning, onAvatar };
  const setState = (next) => {
    setStateRaw((prev) => {
      const v = typeof next === "function" ? next(prev) : next;
      stateRef.current = v;
      return v;
    });
  };

  const send = (event) => {
    const dc = r.current.dc;
    if (dc && dc.readyState === "open") dc.send(JSON.stringify(event));
  };
  const metrics = () => (r.current.metrics ??= newMetrics());

  const clearTimers = () => {
    const cur = r.current;
    for (const k of ["renewTimer", "connectTimer", "utterTimer", "speakTimer", "graceTimer", "interruptTimer"]) clearTimeout(cur[k]);
  };

  /** Fecha a conexão (canal, peer, microfone, alto-falante). Mantém métricas e transcrição quando é uma reconexão. */
  const teardown = (keep = false) => {
    const cur = r.current;
    clearTimers();
    try {
      cur.gem?.close();
    } catch {
      // já fechado
    }
    try {
      cur.dc?.close();
    } catch {
      // já fechado
    }
    try {
      cur.pc?.close();
    } catch {
      // já fechado
    }
    cur.stream?.getTracks?.().forEach((t) => t.stop());
    if (cur.audio) {
      try {
        cur.audio.pause?.();
      } catch {
        // sem áudio
      }
      cur.audio.srcObject = null;
    }
    cur.offListeners?.();
    r.current = keep
      ? { handled: new Set(), transcript: cur.transcript ?? [], metrics: cur.metrics, utter: { role: null, text: "" }, volume: cur.volume }
      : { handled: new Set(), transcript: [], volume: cur.volume };
    setStreams({ input: null, output: null });
    setPlaybackBlocked(false);
  };

  const end = async (id, reason) => {
    if (!id) return;
    const m = r.current.metrics;
    await voiceApi.end(backend, id, reason, m ? metricsOut(m) : null).catch(() => {});
  };

  const fail = async (kind, message = null, endReason = null) => {
    const id = r.current.voiceCallId;
    const m = r.current.metrics;
    if (m) m.disconnect_reason = kind;
    if (id && m) await voiceApi.end(backend, id, endReason ?? "student", metricsOut(m)).catch(() => {});
    teardown();
    setState("error");
    setError({ kind, message });
    if (id && !m) await voiceApi.end(backend, id, endReason ?? "student").catch(() => {});
  };

  // ------------------------------------------------------------ transcrição (pedaços → falas)
  const finalizeUtterance = () => {
    const cur = r.current;
    clearTimeout(cur.utterTimer);
    const u = cur.utter;
    if (!u?.role || !u.text.trim()) return;
    const role = u.role;
    const text = u.text.trim();
    u.role = null;
    u.text = "";
    pushTranscript(role, text);
  };

  const pushTranscript = (role, text) => {
    const cur = r.current;
    cur.transcript = [...(cur.transcript ?? []), { role, text }].slice(-40);
    cb.current.onTranscript?.(role, text);
    const id = cur.voiceCallId;
    voiceApi.transcript(backend, id, role, text).then(
      (res) => {
        // o servidor conferiu o que foi dito: se escapou algo, o professor corrige na hora
        if (role !== "tutor" || !res?.correction) return;
        if (r.current.provider === "gemini") r.current.gem?.sendText(`Instrução do sistema (não leia em voz alta; diga a correção agora, do seu jeito): ${res.correction}`);
        else if (r.current.provider === "live") send({ type: "session.instructions.append", event_id: eid("corr"), delegation_id: null, content: res.correction });
        else {
          send({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: res.correction }] } });
          send({ type: "response.create" });
        }
      },
      () => {}
    );
  };

  const caption = (role, text) => setCaptions((c) => ({ ...c, [role]: text }));

  const speakingStarted = () => {
    const cur = r.current;
    const m = metrics();
    if (m.first_audio_ms == null && cur.openedAt) m.first_audio_ms = Date.now() - cur.openedAt;
    if (cur.turnStart) {
      m.turns++;
      m.turnSum += Date.now() - cur.turnStart;
      cur.turnStart = null;
    }
    setState("speaking");
  };
  const speakingStopped = () => {
    setState((s) => (s === "paused" ? s : s === "thinking" && r.current.delegBusy ? s : "listening"));
    const closing = r.current.closing;
    if (closing) closing.finish();
  };
  const studentSpeaking = () => {
    const cur = r.current;
    if (stateRef.current === "speaking") {
      metrics().interruptions++;
      setState("interrupted");
      clearTimeout(cur.interruptTimer);
      cur.interruptTimer = setTimeout(() => setState((s) => (s === "interrupted" ? "listening" : s)), 700);
    } else if (stateRef.current !== "paused") setState("listening");
  };

  // ------------------------------------------------------------ Realtime
  const realtimeReady = () => {
    const cur = r.current;
    if (cur.voiceReady) return;
    cur.voiceReady = true;
    clearTimeout(cur.connectTimer);
    cur.openedAt = Date.now();
    metrics().connect_ms ??= Date.now() - metrics().t0;
    if (cur.track) cur.track.enabled = !cur.muted;
    setState("listening");
    send({ type: "response.create" });
  };

  const onRealtimeEvent = async (ev) => {
    const id = r.current.voiceCallId;
    switch (ev.type) {
      case "session.created": {
        const cur = r.current;
        if (cur.voiceReady || cur.languageUpdate) break;
        const instructions = refreshVoiceLanguage(ev.session?.instructions);
        if (!instructions) {
          await fail("server", "A voz não recebeu as instruções do professor. Encerre e tente novamente.", "error");
          break;
        }
        if (instructions === ev.session.instructions) realtimeReady();
        else {
          // O teste local usa o servidor publicado: atualiza a direção de fala antes da primeira resposta,
          // sem apagar as regras médicas, o contexto, a personalidade ou as ferramentas da sessão.
          cur.languageUpdate = { id: eid("idioma"), instructions };
          send({ type: "session.update", event_id: cur.languageUpdate.id, session: { type: "realtime", instructions } });
        }
        break;
      }
      case "session.updated":
        if (r.current.languageUpdate && r.current.languageUpdate.instructions === ev.session?.instructions) {
          r.current.languageUpdate = null;
          realtimeReady();
        }
        break;
      case "error":
        if (r.current.languageUpdate && ev.error?.event_id === r.current.languageUpdate.id) {
          await fail("server", "Não foi possível aplicar o português brasileiro à voz. Encerre e tente novamente.", "error");
        }
        break;
      case "input_audio_buffer.speech_started":
        studentSpeaking();
        break;
      case "input_audio_buffer.speech_stopped":
        r.current.turnStart = Date.now();
        setState((s) => (s === "paused" ? s : "thinking"));
        break;
      case "response.created":
        setState((s) => (s === "paused" ? s : "thinking"));
        break;
      case "output_audio_buffer.started":
        speakingStarted();
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        speakingStopped();
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        if (ev.delta) {
          r.current.tutorPartial = (r.current.tutorPartial ?? "") + ev.delta;
          caption("tutor", r.current.tutorPartial);
        }
        break;
      case "conversation.item.input_audio_transcription.delta":
        if (ev.delta) {
          r.current.studentPartial = (r.current.studentPartial ?? "") + ev.delta;
          caption("student", r.current.studentPartial);
        }
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        r.current.tutorPartial = "";
        if (!ev.transcript) break;
        caption("tutor", ev.transcript);
        pushTranscript("tutor", ev.transcript);
        break;
      }
      case "conversation.item.input_audio_transcription.completed":
        r.current.studentPartial = "";
        if (ev.transcript) {
          caption("student", ev.transcript);
          pushTranscript("student", ev.transcript);
        }
        break;
      case "response.done": {
        const resp = ev.response ?? {};
        if (resp.usage) voiceApi.usage(backend, id, resp.usage).catch(() => {});
        // ferramentas pedidas nesta resposta: o servidor executa; o resultado volta para o professor continuar
        const calls = (resp.output ?? []).filter((o) => o.type === "function_call" && !r.current.handled.has(o.call_id));
        if (!calls.length) break;
        for (const c of calls) r.current.handled.add(c.call_id);
        setState("thinking");
        for (const c of calls) {
          const t0 = Date.now();
          const out = await voiceApi.tool(backend, id, c.name, c.arguments ?? "{}").catch((e) => ({ output: { error: e.message } }));
          const m = metrics();
          m.tools++;
          m.toolSum += Date.now() - t0;
          const output = out.output ?? out;
          if (output?.avatar) cb.current.onAvatar?.(output.avatar);
          send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: c.call_id, output: JSON.stringify(output) } });
        }
        // "espere o aluno" (ruído, TV, outra pessoa): o professor não fala de novo; volta a ouvir
        if (calls.every((c) => c.name === "wait_for_user")) setState("listening");
        else send({ type: "response.create" });
        break;
      }
      default:
        break;
    }
  };

  // ------------------------------------------------------------ GPT-Live
  const liveDelta = (role, delta) => {
    const cur = r.current;
    cur.utter ??= { role: null, text: "" };
    if (cur.utter.role && cur.utter.role !== role) finalizeUtterance();
    cur.utter.role = role;
    cur.utter.text += delta;
    caption(role, cur.utter.text.trim());
    clearTimeout(cur.utterTimer);
    cur.utterTimer = setTimeout(finalizeUtterance, UTTERANCE_GAP_MS);
    if (role === "tutor") {
      if (stateRef.current !== "speaking") speakingStarted();
      clearTimeout(cur.speakTimer);
      cur.speakTimer = setTimeout(speakingStopped, SPEAKING_GAP_MS);
    } else {
      studentSpeaking();
      cur.turnStart = Date.now();
    }
  };

  /** GPT-Live delegou: o servidor responde (motor do Tutor) e o resultado volta para a voz dizer. Uma por vez; a mais nova vence. */
  const delegate = async (delegationId) => {
    const cur = r.current;
    if (cur.utter?.role === "student") finalizeUtterance();
    cur.delegQueue = delegationId;
    if (cur.delegBusy) return;
    cur.delegBusy = true;
    setState("thinking");
    while (r.current.delegQueue && r.current === cur) {
      const did = cur.delegQueue;
      cur.delegQueue = null;
      const t0 = Date.now();
      let res;
      try {
        res = await voiceApi.delegate(backend, cur.voiceCallId, { transcript: (cur.transcript ?? []).slice(-24), interrupted: cur.lastInterrupted ?? null });
      } catch (e) {
        res = { say: [e?.status === 429 ? "Só um instante, ainda estou terminando o raciocínio anterior." : "Não consegui consultar isso agora. Tenta de novo daqui a pouco."], thinking: [], tone: null };
      }
      if (r.current !== cur) break;
      const m = metrics();
      m.delegations++;
      m.delegateSum += Date.now() - t0;
      if (res.tone) send({ type: "session.instructions.append", event_id: eid("tom"), delegation_id: null, content: res.tone });
      for (const t of res.thinking ?? []) send({ type: "session.thinking.append", event_id: eid("ctx"), delegation_id: did, content: t });
      for (const s of res.say ?? []) send({ type: "session.commentary.append", event_id: eid("diz"), delegation_id: did, content: s });
      if (res.avatar) cb.current.onAvatar?.(res.avatar);
    }
    cur.delegBusy = false;
  };

  const onLiveEvent = (ev) => {
    const cur = r.current;
    switch (ev.type) {
      case "session.started":
        clearTimeout(cur.connectTimer);
        cur.openedAt = Date.now();
        metrics().connect_ms ??= Date.now() - metrics().t0;
        if (cur.track) cur.track.enabled = !cur.muted;
        setState("ready");
        // o professor abre a conversa (curto, do jeito dele)
        send({ type: "session.instructions.append", event_id: eid("abre"), delegation_id: null, content: `${TUTOR_SPOKEN_LANGUAGE}\n\nAbra a conversa agora, numa frase curta, no seu jeito.` });
        break;
      case "session.input_transcript.delta":
        if (ev.delta) liveDelta("student", ev.delta);
        break;
      case "session.output_transcript.delta":
        if (ev.delta) liveDelta("tutor", ev.delta);
        break;
      case "session.delegation.created":
        if (ev.delegation?.id && ev.delegation.target !== "responses") delegate(ev.delegation.id);
        break;
      case "session.closed":
        if (!cur.stopping) {
          const id = cur.voiceCallId;
          metrics().disconnect_reason = ev.reason ?? "closed";
          end(id, "student");
          teardown();
          setState("ended");
        }
        cur.closedResolve?.();
        break;
      case "error":
        metrics().last_error = String(ev.error?.code ?? "erro").slice(0, 40);
        break;
      default:
        break;
    }
  };

  // ------------------------------------------------------------ Gemini
  /** Transcrição em pedaços: legenda na hora; a fala inteira vai para o servidor quando o turno fecha. */
  const geminiDelta = (role, text, finished) => {
    const cur = r.current;
    cur.utter ??= { role: null, text: "" };
    if (cur.utter.role && cur.utter.role !== role) finalizeUtterance();
    cur.utter.role = role;
    cur.utter.text += text;
    caption(role, cur.utter.text.trim());
    clearTimeout(cur.utterTimer);
    if (finished) finalizeUtterance();
    else cur.utterTimer = setTimeout(finalizeUtterance, role === "student" ? UTTERANCE_GAP_MS : 4_000);
    if (role === "student") {
      studentSpeaking();
      cur.turnStart = Date.now();
    }
  };

  /** O professor pediu ferramentas: o servidor executa; o resultado volta para ele continuar falando. */
  const geminiTools = async (calls) => {
    const cur = r.current;
    const id = cur.voiceCallId;
    setState("thinking");
    const responses = [];
    for (const c of calls) {
      if (!c?.name) continue;
      const t0 = Date.now();
      const out = await voiceApi.tool(backend, id, c.name, JSON.stringify(c.args ?? {})).catch((e) => ({ output: { error: e.message } }));
      const m = metrics();
      m.tools++;
      m.toolSum += Date.now() - t0;
      const output = out.output ?? out;
      if (output?.avatar) cb.current.onAvatar?.(output.avatar);
      responses.push({ id: c.id, name: c.name, response: { output } });
    }
    if (r.current !== cur) return;
    cur.gem?.respondTools(responses);
    if (calls.every((c) => c.name === "wait_for_user")) setState("listening");
  };

  // ------------------------------------------------------------ renovação, fim com folga
  const renew = async () => {
    const id = r.current.voiceCallId;
    if (!id) return;
    try {
      const res = await voiceApi.renew(backend, id, r.current.rtcId);
      if (res.stop) {
        const finish = async () => {
          if (r.current.voiceCallId !== id) return;
          r.current.stopping = true;
          const m = r.current.metrics;
          if (m) m.disconnect_reason = res.reason ?? "stop";
          if (r.current.provider === "live") send({ type: "session.close" });
          if (r.current.provider === "gemini") r.current.gem?.close();
          await voiceApi.end(backend, id, ["quota", "session_limit"].includes(res.reason) ? res.reason : "student", m ? metricsOut(m) : null).catch(() => {});
          teardown();
          setState("ended");
          setError(res.reason === "quota" ? { kind: "quota", message: res.message } : null);
          cb.current.onWarning?.(res.message);
        };
        const grace = Number(res.grace_seconds ?? 0);
        // limite atingido: não corta o professor no meio da frase; termina o turno e então encerra
        if (grace > 0 && stateRef.current === "speaking") {
          r.current.closing = { finish };
          r.current.graceTimer = setTimeout(finish, Math.max(1, grace - 2) * 1000);
        } else await finish();
        return;
      }
      setRemaining(res.remaining_s ?? null);
      if (res.warn) cb.current.onWarning?.(res.warn);
      r.current.renewTimer = setTimeout(renew, Math.max(20, Math.floor((res.lease_seconds ?? 120) / 2)) * 1000);
    } catch {
      // falha momentânea: tenta de novo logo (a reserva ainda vale por alguns segundos)
      r.current.renewTimer = setTimeout(renew, 10_000);
    }
  };

  // ------------------------------------------------------------ conexão
  const wire = (pc, dc, stream, audio) => {
    dc.onmessage = (m) => {
      if (r.current.pc !== pc) return;
      let ev;
      try {
        ev = JSON.parse(m.data);
      } catch {
        return; // evento ilegível: ignora
      }
      if (r.current.provider === "live") onLiveEvent(ev);
      else onRealtimeEvent(ev);
    };
    dc.onopen = () => {
      // Aguarda session.created/session.updated (Realtime) ou session.started (Live).
      // Abrir o canal não confirma que as instruções de pronúncia foram aplicadas.
    };
    pc.ontrack = (e) => {
      const out = e.streams?.[0] ?? (e.track ? new MediaStream([e.track]) : null);
      if (audio) {
        audio.srcObject = out;
        const blocked = () => {
          if (r.current.audio !== audio) return;
          metrics().audio_errors++;
          setPlaybackBlocked(true);
          cb.current.onWarning?.("O navegador bloqueou o som. Toque em Ativar som do Nexus.");
        };
        try {
          audio.play?.()?.then?.(() => {
            if (r.current.audio === audio) setPlaybackBlocked(false);
          }, blocked);
        } catch {
          blocked();
        }
      }
      setStreams((s) => ({ ...s, output: out }));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected") setState("reconnecting");
      else if (pc.connectionState === "connected") setState((s) => (s === "reconnecting" ? "listening" : s));
      else if (pc.connectionState === "failed") reconnect();
    };
    // microfone trocado ou desconectado: pega outro sem derrubar a conversa
    const track = stream.getAudioTracks?.()[0];
    const replaceMic = async () => {
      if (r.current.pc !== pc) return;
      try {
        const fresh = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        const t = fresh.getAudioTracks()[0];
        t.enabled = !r.current.muted;
        await pc.getSenders?.().find((s) => s.track?.kind === "audio" || s.track === r.current.track)?.replaceTrack?.(t);
        r.current.stream?.getTracks?.().forEach((x) => x.stop());
        Object.assign(r.current, { stream: fresh, track: t });
        t.onended = replaceMic;
        metrics().device_changes++;
        setStreams((s) => ({ ...s, input: fresh }));
      } catch {
        metrics().audio_errors++;
        cb.current.onWarning?.("Perdi o microfone. Confira se ele está conectado.");
      }
    };
    if (track) track.onended = replaceMic;
    const onDevice = () => {
      if (r.current.track?.readyState === "ended") replaceMic();
    };
    const onOffline = () => setState((s) => (["idle", "ended", "error"].includes(s) ? s : "reconnecting"));
    const onOnline = () => {
      if (["failed", "closed"].includes(pc.connectionState)) reconnect();
      else setState((s) => (s === "reconnecting" ? "listening" : s));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") unlockAudio();
    };
    navigator.mediaDevices.addEventListener?.("devicechange", onDevice);
    window.addEventListener?.("offline", onOffline);
    window.addEventListener?.("online", onOnline);
    document.addEventListener?.("visibilitychange", onVisible);
    r.current.offListeners = () => {
      navigator.mediaDevices.removeEventListener?.("devicechange", onDevice);
      window.removeEventListener?.("offline", onOffline);
      window.removeEventListener?.("online", onOnline);
      document.removeEventListener?.("visibilitychange", onVisible);
    };
  };

  const newPeer = (stream) => {
    const pc = new RTCPeerConnection();
    const audio = typeof Audio !== "undefined" ? new Audio() : null;
    if (audio) {
      audio.autoplay = true;
      audio.playsInline = true;
      audio.volume = r.current.volume ?? 1;
      try {
        audio.setAttribute?.("playsinline", "");
      } catch {
        // sem atributos
      }
    }
    stream.getTracks().forEach((t) => {
      t.enabled = false; // só transmite depois de configurar a voz; evita respostas com a direção antiga
      pc.addTrack(t, stream);
    });
    const dc = pc.createDataChannel("oai-events");
    Object.assign(r.current, { pc, dc, stream, audio, track: stream.getAudioTracks?.()[0] ?? null, handled: r.current.handled ?? new Set() });
    wire(pc, dc, stream, audio);
    setStreams({ input: stream, output: null });
    return { pc, dc };
  };

  const startError = (e) => ({ kind: e.code === "busy" ? "busy" : e.status === 429 ? "quota" : "server", code: e.code ?? null, message: e.message });

  /** Realtime: a reserva vem primeiro (segredo temporário); depois microfone e WebRTC direto com a OpenAI. */
  const startRealtime = async (force, given = null, avoid = null) => {
    let data = given;
    if (!data) {
      try {
        data = await voiceApi.start(backend, sessionId, force, null, avoid);
      } catch (e) {
        setState("error");
        setError(startError(e));
        return;
      }
    }
    r.current.voiceCallId = data.voice_call_id;
    r.current.provider = "realtime";
    metrics().provider = "realtime";
    setProvider("realtime");
    r.current.connectTimer = setTimeout(() => fail("timeout"), CONNECT_TIMEOUT_MS);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      metrics().mic_permission = "granted";
    } catch (e) {
      metrics().mic_permission = "denied";
      await fail(e?.name === "NotFoundError" ? "no_mic" : "mic", null, "error");
      return;
    }
    try {
      const { pc } = newPeer(stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await fetch(CALLS_URL, { method: "POST", body: offer.sdp, headers: { Authorization: `Bearer ${data.client_secret}`, "Content-Type": "application/sdp" } });
      if (!res.ok) throw new Error(`voz respondeu ${res.status}`);
      r.current.rtcId = res.headers.get("Location")?.split("/").pop() ?? null;
      await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
      setRemaining(data.entitlement?.voice?.remaining_s ?? null);
      // primeira renovação logo: o servidor fica sabendo o id da chamada e pode desligá-la se precisar
      r.current.renewTimer = setTimeout(renew, 5_000);
    } catch {
      await fail("network", null, r.current.rtcId ? "student" : "error");
    }
  };

  /** GPT-Live: microfone e oferta primeiro; o servidor troca a oferta (ou, sem GPT-Live, devolve o segredo do Realtime). */
  const startLiveFirst = async (force, avoid = null) => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      metrics().mic_permission = "granted";
    } catch (e) {
      metrics().mic_permission = "denied";
      teardown();
      setState("error");
      setError({ kind: e?.name === "NotFoundError" ? "no_mic" : "mic" });
      return;
    }
    let pc;
    let offer;
    try {
      ({ pc } = newPeer(stream));
      offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIce(pc);
    } catch {
      teardown();
      setState("error");
      setError({ kind: "network" });
      return;
    }
    let data;
    try {
      data = await voiceApi.start(backend, sessionId, force, pc.localDescription?.sdp ?? offer.sdp, avoid);
    } catch (e) {
      teardown();
      setState("error");
      setError(startError(e));
      return;
    }
    r.current.voiceCallId = data.voice_call_id;
    r.current.provider = data.provider === "live" ? "live" : "realtime";
    metrics().provider = r.current.provider;
    setProvider(r.current.provider);
    r.current.connectTimer = setTimeout(() => fail("timeout"), CONNECT_TIMEOUT_MS);
    try {
      if (data.provider === "live") {
        r.current.rtcId = data.live_session_id ?? null;
        await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
      } else {
        // o servidor preferiu (ou caiu para) o Realtime: a mesma oferta vai direto para a OpenAI com o segredo temporário
        const res = await fetch(CALLS_URL, { method: "POST", body: offer.sdp, headers: { Authorization: `Bearer ${data.client_secret}`, "Content-Type": "application/sdp" } });
        if (!res.ok) throw new Error(`voz respondeu ${res.status}`);
        r.current.rtcId = res.headers.get("Location")?.split("/").pop() ?? null;
        await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
      }
      setRemaining(data.entitlement?.voice?.remaining_s ?? null);
      r.current.renewTimer = setTimeout(renew, 5_000);
    } catch {
      await fail("network", null, r.current.rtcId ? "student" : "error");
    }
  };

  /**
   * Gemini: microfone, depois a reserva (o servidor devolve a chave temporária ou, se o Google recusar, o segredo do Realtime);
   * se a conexão não abrir neste aparelho, encerra a reserva e pede outra voz ao servidor (avoid = gemini).
   */
  const startGemini = async (force) => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      metrics().mic_permission = "granted";
    } catch (e) {
      metrics().mic_permission = "denied";
      teardown();
      setState("error");
      setError({ kind: e?.name === "NotFoundError" ? "no_mic" : "mic" });
      return;
    }
    let data;
    try {
      data = await voiceApi.start(backend, sessionId, force);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      teardown();
      setState("error");
      setError(startError(e));
      return;
    }
    if (data.provider !== "gemini") {
      // o servidor caiu para a OpenAI (Realtime): segue o caminho de sempre com este microfone
      stream.getTracks().forEach((t) => t.stop());
      await startRealtime(force, data);
      return;
    }
    const cur = r.current;
    Object.assign(cur, { voiceCallId: data.voice_call_id, provider: "gemini", stream, track: stream.getAudioTracks?.()[0] ?? null });
    metrics().provider = "gemini";
    setProvider("gemini");
    setStreams({ input: stream, output: null });
    const giveUp = async (reason) => {
      // não abriu neste aparelho: libera a reserva sem cobrar e pede outra voz
      if (r.current !== cur || cur.geminiFallback) return;
      cur.geminiFallback = true;
      geminiFailedAt = Date.now();
      metrics().last_error = String(reason ?? "gemini").slice(0, 40);
      await voiceApi.end(backend, data.voice_call_id, "error").catch(() => {});
      teardown(true);
      if (live) await startLiveFirst(true, ["gemini"]);
      else await startRealtime(true, null, ["gemini"]);
    };
    cur.connectTimer = setTimeout(() => giveUp("timeout"), CONNECT_TIMEOUT_MS);
    try {
      const gem = await openGeminiLive({
        token: data.gemini_token,
        model: data.model,
        stream,
        volume: cur.volume ?? 1,
        handlers: {
          onReady: () => {
            if (r.current !== cur) return;
            clearTimeout(cur.connectTimer);
            cur.openedAt = Date.now();
            metrics().connect_ms ??= Date.now() - metrics().t0;
            setState("listening");
            setRemaining(data.entitlement?.voice?.remaining_s ?? null);
            cur.renewTimer = setTimeout(renew, 5_000);
            // o professor abre a conversa, curto e do jeito dele
            cur.gem?.sendText("O aluno acabou de abrir a conversa por voz. Abra do seu jeito, numa frase curta.");
          },
          onAudio: () => {
            if (stateRef.current !== "speaking" && stateRef.current !== "paused") speakingStarted();
          },
          onIdle: () => speakingStopped(),
          onInterrupted: () => {
            metrics().interruptions++;
            setState((s) => (s === "paused" ? s : "listening"));
          },
          onTranscript: (role, text, finished) => geminiDelta(role, text, finished),
          onTurnComplete: () => {
            if (r.current.utter?.role === "tutor") finalizeUtterance();
          },
          onToolCalls: (calls) => geminiTools(calls),
          onReconnect: (why) => {
            // a troca de conexão de rotina do Google não é queda
            if (why !== "goaway") metrics().reconnects++;
          },
          onError: (e) => {
            metrics().last_error = String(e?.message ?? "erro").slice(0, 40);
          },
          onClose: ({ beforeReady, reason }) => {
            if (r.current !== cur || cur.stopping) return;
            if (beforeReady) giveUp(reason);
            else {
              // caiu no meio da conversa e não deu para retomar: abre de novo (até duas vezes), como na voz da OpenAI
              metrics().last_error = String(reason ?? "closed").slice(0, 40);
              reconnect();
            }
          },
        },
      });
      if (r.current !== cur || cur.geminiFallback) {
        gem.close(); // o aluno saiu (ou a voz já trocou para a OpenAI) enquanto esta abria
        return;
      }
      cur.gem = gem;
      setStreams({ input: stream, output: gem.outputStream });
    } catch (e) {
      await giveUp(e?.message ?? "connect");
    }
  };

  /** Abre a conversa por voz. force = assumir aqui uma voz aberta em outro aparelho. */
  const start = React.useCallback(
    async (force = false, opts = {}) => {
      if (!realtimeSupport()) {
        setState("error");
        setError({ kind: "unsupported" });
        return;
      }
      unlockAudio(); // gesto do aluno: Safari libera o áudio agora
      teardown(Boolean(opts.reconnect));
      if (!opts.reconnect) r.current.metrics = newMetrics();
      setError(null);
      setMutedState(false);
      setCaptions({ tutor: "", student: "" });
      setState(opts.reconnect ? "reconnecting" : "connecting");
      const skipGemini = hint === "gemini" && Date.now() - geminiFailedAt < GEMINI_RETRY_MS;
      if (hint === "gemini" && !skipGemini) await startGemini(force);
      else if (live) await startLiveFirst(force, skipGemini ? ["gemini"] : null);
      else await startRealtime(force, null, skipGemini ? ["gemini"] : null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backend, sessionId, live, hint]
  );

  /** A ligação caiu: tenta abrir de novo (até duas vezes), mantendo a conversa. */
  const reconnect = async () => {
    const cur = r.current;
    if (cur.stopping || cur.reconnecting) return;
    const m = metrics();
    if (m.reconnects >= MAX_RECONNECTS) {
      await fail("network", null, "student");
      return;
    }
    cur.reconnecting = true;
    m.reconnects++;
    m.disconnect_reason = "network";
    setState("reconnecting");
    const id = cur.voiceCallId;
    if (id) await voiceApi.end(backend, id, "student", metricsOut(m)).catch(() => {});
    await start(true, { reconnect: true });
  };

  const stop = React.useCallback(async () => {
    const cur = r.current;
    const id = cur.voiceCallId;
    cur.stopping = true;
    finalizeUtterance();
    if (cur.provider === "live" && cur.dc?.readyState === "open") {
      // encerramento combinado: session.close e espera o session.closed (com limite)
      send({ type: "session.close" });
      await new Promise((resolve) => {
        cur.closedResolve = resolve;
        setTimeout(resolve, 2_500);
      });
    }
    if (cur.provider === "gemini") cur.gem?.close();
    const m = cur.metrics;
    if (m && !m.disconnect_reason) m.disconnect_reason = "student";
    teardown();
    setState("ended");
    if (id) await voiceApi.end(backend, id, "student", m ? metricsOut(m) : null).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend]);

  /** O aluno corta o professor (a voz também corta sozinha quando o aluno começa a falar). */
  const interrupt = React.useCallback(() => {
    if (r.current.provider === "gemini") {
      r.current.gem?.interrupt();
      metrics().interruptions++;
      setState("listening");
      return;
    }
    if (r.current.provider === "live") {
      // GPT-Live é full-duplex: falar por cima basta; aqui só se registra
      metrics().interruptions++;
      setState("listening");
      return;
    }
    send({ type: "response.cancel" });
    send({ type: "output_audio_buffer.clear" });
    metrics().interruptions++;
    setState("listening");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Microfone desligado: a conversa continua aberta, mas o professor não ouve nada. */
  const setMuted = React.useCallback((on) => {
    const cur = r.current;
    cur.muted = on;
    cur.stream?.getAudioTracks?.().forEach((t) => (t.enabled = !on));
    if (cur.provider === "live") send({ type: on ? "session.input_audio.mute" : "session.input_audio.unmute", event_id: eid(on ? "mudo" : "som") });
    if (cur.provider === "gemini") cur.gem?.mute(on);
    const m = metrics();
    if (on) m.mutedAt = Date.now();
    else if (m.mutedAt) {
      m.mutedSum += Date.now() - m.mutedAt;
      m.mutedAt = null;
    }
    setMutedState(on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = React.useCallback(() => {
    r.current.stream?.getAudioTracks?.().forEach((t) => (t.enabled = false));
    if (r.current.provider === "gemini") {
      r.current.gem?.mute(true);
      r.current.gem?.interrupt();
    } else if (r.current.provider !== "live") {
      send({ type: "response.cancel" });
      send({ type: "output_audio_buffer.clear" });
    } else send({ type: "session.input_audio.mute", event_id: eid("pausa") });
    setState("paused");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const resume = React.useCallback(() => {
    r.current.stream?.getAudioTracks?.().forEach((t) => (t.enabled = !r.current.muted));
    if (r.current.provider === "live") send({ type: "session.input_audio.unmute", event_id: eid("volta") });
    if (r.current.provider === "gemini") r.current.gem?.mute(Boolean(r.current.muted));
    setState("listening");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Texto digitado no chat da tela de voz: mesma conversa, sem desligar a voz. */
  const sendText = React.useCallback((text) => {
    const clean = String(text ?? "").trim().slice(0, 2000);
    if (!clean || !r.current.voiceCallId) return false;
    metrics().texts++;
    if (r.current.provider === "gemini") {
      finalizeUtterance();
      pushTranscript("student", clean);
      r.current.gem?.sendText(clean);
    } else if (r.current.provider === "live") {
      finalizeUtterance();
      pushTranscript("student", clean);
      send({ type: "session.instructions.append", event_id: eid("chat"), delegation_id: null, content: `O aluno escreveu no chat (trate como se tivesse falado): «${clean}». Responda agora; se depender do sistema, delegue.` });
    } else {
      pushTranscript("student", clean);
      send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: clean }] } });
      send({ type: "response.create" });
    }
    setState("thinking");
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(
    () => () => {
      const id = r.current.voiceCallId;
      const m = r.current.metrics;
      if (r.current.provider === "live") send({ type: "session.close" });
      if (r.current.provider === "gemini") r.current.gem?.close();
      teardown();
      if (id) voiceApi.end(backend, id, "student", m ? metricsOut(m) : null).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /** Volume da voz do professor (0..1), sem mexer no microfone. */
  const setVolume = React.useCallback((v) => {
    const vol = Math.max(0, Math.min(1, Number(v)));
    r.current.volume = vol;
    if (r.current.audio) r.current.audio.volume = vol;
    r.current.gem?.setVolume(vol);
  }, []);

  // Repetir play no gesto do aluno libera o áudio bloqueado por autoplay (retomar só AudioContext não libera HTMLAudio).
  const enablePlayback = React.useCallback(async () => {
    const cur = r.current;
    const ctx = unlockAudio();
    const volume = cur.volume > 0 ? cur.volume : 1;
    cur.volume = volume;
    cur.gem?.setVolume(volume);
    try {
      if (cur.audio) {
        cur.audio.muted = false;
        cur.audio.volume = volume;
        await cur.audio.play();
      } else if (ctx) {
        await ctx.resume();
        if (ctx.state !== "running") throw new Error("Áudio suspenso");
      } else return false;
      if (r.current !== cur) return false;
      setPlaybackBlocked(false);
      return true;
    } catch {
      if (r.current === cur) {
        setPlaybackBlocked(true);
        cb.current.onWarning?.("Não foi possível reproduzir a voz. Confira a permissão de som desta página e tente novamente.");
      }
      return false;
    }
  }, []);

  return {
    state, error, remaining, start, stop, interrupt, pause, resume, setVolume, enablePlayback, playbackBlocked,
    muted, mute: () => setMuted(true), unmute: () => setMuted(false), toggleMute: () => setMuted(!r.current.muted),
    sendText, captions, streams, provider,
    active: !["idle", "ended", "error"].includes(state),
  };
}
