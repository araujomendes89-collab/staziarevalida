// Conversa por voz em tempo real com o Stazia Tutor (OpenAI Realtime por WebRTC).
//
// O servidor decide tudo o que importa: direito, cota, uma voz por aluno e a reserva de tempo (renovada a cada ~minuto).
// O navegador recebe só um segredo temporário, abre o áudio direto com a OpenAI e repassa ao servidor: as ferramentas que o
// professor pede (o servidor executa com as regras dele), as transcrições (o servidor confere o que foi dito) e o uso.
import React from "react";
import { voiceApi } from "./api.js";

const CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const CONNECT_TIMEOUT_MS = 20_000;

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

/**
 * estados: idle · connecting · listening · thinking · speaking · paused · reconnecting · ended · error
 */
export function useRealtimeVoice({ backend, sessionId, onTranscript, onWarning }) {
  const [state, setState] = React.useState("idle");
  const [error, setError] = React.useState(null);
  const [remaining, setRemaining] = React.useState(null); // segundos de voz que restam (pelo servidor)
  const r = React.useRef({});
  const cb = React.useRef({});
  cb.current = { onTranscript, onWarning };

  const send = (event) => {
    const dc = r.current.dc;
    if (dc && dc.readyState === "open") dc.send(JSON.stringify(event));
  };

  const teardown = () => {
    const cur = r.current;
    clearTimeout(cur.renewTimer);
    clearTimeout(cur.connectTimer);
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
    if (cur.audio) cur.audio.srcObject = null;
    r.current = { handled: new Set() };
  };

  const fail = async (kind, message = null, endReason = null) => {
    const id = r.current.voiceCallId;
    teardown();
    setState("error");
    setError({ kind, message });
    if (id) await voiceApi.end(backend, id, endReason ?? "student").catch(() => {});
  };

  const renew = async () => {
    const id = r.current.voiceCallId;
    if (!id) return;
    try {
      const res = await voiceApi.renew(backend, id, r.current.rtcId);
      if (res.stop) {
        teardown();
        setState("ended");
        setError(res.reason === "quota" ? { kind: "quota", message: res.message } : null);
        cb.current.onWarning?.(res.message);
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

  const onEvent = async (ev) => {
    const id = r.current.voiceCallId;
    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        setState("listening");
        break;
      case "input_audio_buffer.speech_stopped":
      case "response.created":
        setState((s) => (s === "paused" ? s : "thinking"));
        break;
      case "output_audio_buffer.started":
        setState("speaking");
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        setState((s) => (s === "paused" ? s : "listening"));
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        if (!ev.transcript) break;
        cb.current.onTranscript?.("tutor", ev.transcript);
        const res = await voiceApi.transcript(backend, id, "tutor", ev.transcript).catch(() => null);
        // o servidor conferiu o que foi dito: se escapou algo, o professor corrige na hora
        if (res?.correction) {
          send({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: res.correction }] } });
          send({ type: "response.create" });
        }
        break;
      }
      case "conversation.item.input_audio_transcription.completed":
        if (ev.transcript) {
          cb.current.onTranscript?.("student", ev.transcript);
          voiceApi.transcript(backend, id, "student", ev.transcript).catch(() => {});
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
          const out = await voiceApi.tool(backend, id, c.name, c.arguments ?? "{}").catch((e) => ({ output: { error: e.message } }));
          send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: c.call_id, output: JSON.stringify(out.output ?? out) } });
        }
        send({ type: "response.create" });
        break;
      }
      default:
        break;
    }
  };

  /** Abre a conversa por voz. force = assumir aqui uma voz aberta em outro aparelho. */
  const start = React.useCallback(
    async (force = false) => {
      if (!realtimeSupport()) {
        setState("error");
        setError({ kind: "unsupported" });
        return;
      }
      teardown();
      setError(null);
      setState("connecting");
      let data;
      try {
        data = await voiceApi.start(backend, sessionId, force);
      } catch (e) {
        setState("error");
        setError({ kind: e.code === "busy" ? "busy" : e.status === 429 ? "quota" : "server", message: e.message });
        return;
      }
      r.current.voiceCallId = data.voice_call_id;
      r.current.connectTimer = setTimeout(() => fail("timeout"), CONNECT_TIMEOUT_MS);
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        await fail(e?.name === "NotFoundError" ? "no_mic" : "mic", null, "error");
        return;
      }
      try {
        const pc = new RTCPeerConnection();
        const audio = typeof Audio !== "undefined" ? new Audio() : null;
        if (audio) audio.autoplay = true;
        pc.ontrack = (e) => {
          if (audio) audio.srcObject = e.streams[0];
        };
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const dc = pc.createDataChannel("oai-events");
        dc.onmessage = (m) => {
          try {
            onEvent(JSON.parse(m.data));
          } catch {
            // evento ilegível: ignora
          }
        };
        dc.onopen = () => {
          clearTimeout(r.current.connectTimer);
          setState("listening");
          send({ type: "response.create" }); // o professor abre a conversa
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "disconnected") setState("reconnecting");
          else if (pc.connectionState === "connected") setState((s) => (s === "reconnecting" ? "listening" : s));
          else if (pc.connectionState === "failed") fail("network");
        };
        Object.assign(r.current, { pc, dc, stream, audio, handled: new Set() });
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backend, sessionId]
  );

  const stop = React.useCallback(async () => {
    const id = r.current.voiceCallId;
    teardown();
    setState("ended");
    if (id) await voiceApi.end(backend, id, "student").catch(() => {});
  }, [backend]);

  /** O aluno corta o professor (o servidor de voz também corta sozinho quando o aluno começa a falar). */
  const interrupt = React.useCallback(() => {
    send({ type: "response.cancel" });
    send({ type: "output_audio_buffer.clear" });
    setState("listening");
  }, []);

  const pause = React.useCallback(() => {
    r.current.stream?.getAudioTracks?.().forEach((t) => (t.enabled = false));
    send({ type: "response.cancel" });
    send({ type: "output_audio_buffer.clear" });
    setState("paused");
  }, []);
  const resume = React.useCallback(() => {
    r.current.stream?.getAudioTracks?.().forEach((t) => (t.enabled = true));
    setState("listening");
  }, []);

  React.useEffect(
    () => () => {
      const id = r.current.voiceCallId;
      teardown();
      if (id) voiceApi.end(backend, id, "student").catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return { state, error, remaining, start, stop, interrupt, pause, resume, active: !["idle", "ended", "error"].includes(state) };
}
