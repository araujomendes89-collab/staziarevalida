// A conversa da Nexus pela voz do professor ("eleven") ou por escrito ("escrito"). Mesmo formato do `rt` da voz ao vivo
// (useRealtimeVoice), para a tela cheia (StaziaVoiceMode) não saber a diferença.
//
// Um turno: o aluno fala (gravação) → transcrição no servidor → o motor do Tutor (/voice/say, com client_turn_id) → a legenda e
// a emoção aparecem → a voz do professor (/speech) toca → o microfone volta a ouvir (computador e Android) ou mostra "Toque para
// falar" (iPhone e iPad). O microfone fica fechado enquanto o professor fala. "Interromper" corta o som e o trecho vai no próximo
// turno. A letra só marca; "confirmo" ou "Responder" responde. Sem voz do professor (limite, teto, aprovação revogada, falha), a
// tela passa para a voz reserva pelo onFallback, com a legenda mantida. O enunciado nunca vai para a voz. Sem chamada (a conversa
// por voz desligada no painel), o turno vai pela rota de texto do Tutor e a questão pelo banco, como no Chat de antes.
import React from "react";
import { nexusApi, tutorOpening, tutorSpeech, tutorTurn, voiceApi } from "../api.js";
import { realtimeErrorMessage } from "../useRealtimeVoice.js";
import { AudioPlayer } from "../voice/audioPlayer.js";
import { getAudioContext } from "../voice/audioUnlock.js";
import { rmsLevel } from "../voice/useAudioLevel.js";
import { startRecording, tapToTalkDevice } from "./recorder.js";

/** Tempos (ajustáveis nos testes). */
export const NEXUS_TIMING = { retryMs: 2_000, retryForMs: 30_000, renewMs: 60_000 };
export const STT_FAILED = "Não entendi, pode repetir ou digitar?";
export const ENGINE_FAILED = "O professor não conseguiu responder, tente de novo";
export const CALL_ENDED = "A conversa por voz foi encerrada.";
export const CALL_REPLACED = "A conversa continuou em outra aba ou aparelho.";
/** Códigos da voz do professor que passam a conversa para a voz reserva. */
export const VOICE_FALLBACK_CODES = new Set(["voice_student_limit", "voice_account_day", "voice_account_month", "voice_unavailable", "voice_failed"]);
export const markedPhrase = (letter) => `Marquei a ${letter}. Diga confirmo para responder, ou fale outra alternativa.`;
export const UNMARKED_PHRASE = "Desmarquei. Qual você escolhe?";

const turnId = () => globalThis.crypto?.randomUUID?.() ?? `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lastTutor = (s) => [...(s?.messages ?? [])].reverse().find((m) => m.role === "tutor") ?? null;

function micLevel(stream) {
  try {
    const ctx = getAudioContext();
    if (!ctx?.createAnalyser || !ctx.createMediaStreamSource) return undefined;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const read = () => {
      analyser.getByteTimeDomainData(data);
      return rmsLevel(data);
    };
    read.close = () => {
      try {
        source.disconnect();
      } catch {
        // já desligado
      }
    };
    return read;
  } catch {
    return undefined; // sem medição: a fala é presumida (para no "Enviar" ou em 45 s)
  }
}

/**
 * canListen: o servidor transcreve a fala (opened.mic); sem isso, o aluno escreve pelo Chat e o professor responde (em voz, se houver).
 * onReopen: a chamada acabou no servidor e o aluno tocou em "Conversar de novo"; a tela abre outra chamada para esta conversa.
 */
export function useNexusVoice({ backend, session, jeito, voiceCallId, micStream, canListen = true, onSession, onMessage, onFallback, onReopen }) {
  const [state, setStateRaw] = React.useState("idle");
  const [captions, setCaptions] = React.useState({ tutor: "", student: "" });
  const [avatar, setAvatar] = React.useState(null);
  const [marked, setMarkedState] = React.useState(null);
  const [muted, setMuted] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const [micError, setMicError] = React.useState(null);
  const [chatRequest, setChatRequest] = React.useState(0);
  const [output, setOutput] = React.useState(null);
  const tap = React.useMemo(() => tapToTalkDevice(), []);
  const r = React.useRef({ metrics: { stt: [], engine: [], tts: [], play: [] } });
  // as funções chamadas de fora do ciclo de desenho sempre leem o estado mais novo
  Object.assign(r.current, { backend, session, jeito, voiceCallId, micStream, canListen, onSession, onMessage, onFallback, onReopen, muted, tap });

  const setState = (s) => {
    r.current.state = s;
    setStateRaw(s);
  };
  const setMarked = (l) => {
    r.current.marked = l;
    setMarkedState(l);
  };
  const speaks = () => r.current.jeito === "eleven";
  /** O som e o medidor do microfone valem para uma conversa: a tela de voz fecha o contexto de som ao sair. */
  const releaseAudio = () => {
    const c = r.current;
    c.player?.stop?.();
    c.player?.close?.();
    c.player = null;
    setOutput(null);
    c.level?.close?.();
    c.level = undefined;
  };
  const player = () => {
    if (!r.current.player) {
      const ctx = getAudioContext();
      if (!ctx) return null;
      r.current.player = new AudioPlayer(ctx, r.current.volume ?? 1);
      setOutput(r.current.player.stream ?? null);
    }
    return r.current.player;
  };

  /** A chamada acabou no servidor (aparelho dormiu, outra aba assumiu, prazo): para tudo e mostra "Conversar de novo". */
  const closed = (message = CALL_ENDED) => {
    const c = r.current;
    if (!c.alive) return;
    c.alive = false;
    c.closedCall = c.voiceCallId;
    cancelRec();
    releaseAudio();
    clearInterval(c.renew);
    setNotice(message);
    setState("ended");
  };

  // ---- ouvir
  /** Para a gravação sem mandar nada; o fim dela não volta a ouvir (quem cancelou decide o que vem depois). */
  const cancelRec = () => {
    const c = r.current;
    const h = c.rec;
    c.rec = null;
    if (h) {
      h.dropped = true;
      h.cancel?.();
    }
  };
  const listen = (manual = false) => {
    const c = r.current;
    if (!c.alive || c.rec) return;
    if (!c.micStream || !c.canListen || c.muted || c.noRecorder || (c.tap && !manual)) {
      setState("ready");
      return;
    }
    c.level ??= micLevel(c.micStream);
    try {
      let h = null;
      h = startRecording({ stream: c.micStream, auto: !c.tap, level: c.level, onDone: (out) => heard(out, h) });
      c.rec = h;
      setState("listening");
    } catch {
      // navegador sem gravação de áudio: a conversa segue pelo Chat, com a resposta em voz
      c.rec = null;
      c.noRecorder = true;
      setMicError("Este navegador não grava a sua voz. Escreva pelo Chat: o professor responde em voz.");
      setChatRequest((n) => n + 1);
      setState("ready");
    }
  };
  const afterReply = () => {
    if (r.current.alive) listen(false);
  };

  // ---- a fala do aluno chegou
  const heard = async (out, h) => {
    const c = r.current;
    if (h?.dropped) return;
    if (c.rec === h) c.rec = null;
    if (!c.alive) return;
    if (!out) return afterReply(); // só silêncio ou cancelada: volta a ouvir
    setState("thinking");
    const t0 = Date.now();
    let text = "";
    try {
      text = ((await nexusApi.transcribe(c.backend, c.voiceCallId, out.blob, out.seconds))?.text ?? "").trim();
      c.metrics.stt.push(Date.now() - t0);
    } catch (e) {
      if (e?.code === "tutor_consent") return c.onFallback?.("tutor_consent", e.message);
      if (e?.status === 409) return closed(e.message || CALL_ENDED);
      // microfone não liberado ou limite de fala de hoje (CF02): o servidor já escreveu o motivo em português; segue pelo Chat
      if (e?.status === 403 && /^stt_/.test(e?.code ?? "") && e.message) {
        setNotice(e.message);
        setChatRequest((n) => n + 1);
        return afterReply();
      }
      text = "";
    }
    if (!text) {
      setNotice(STT_FAILED);
      setChatRequest((n) => n + 1);
      return afterReply();
    }
    await turn({ text });
  };

  // ---- um turno pelo motor (com repetição do mesmo client_turn_id quando a rede cai ou o turno anterior ainda roda)
  const say = async (payload) => {
    const started = Date.now();
    for (;;) {
      try {
        return await nexusApi.say(r.current.backend, payload);
      } catch (e) {
        const retry = !e?.status || e?.code === "turn_busy";
        if (!retry || Date.now() - started > NEXUS_TIMING.retryForMs || !r.current.alive) throw e;
        await wait(NEXUS_TIMING.retryMs);
      }
    }
  };

  /** Sem chamada (voz desligada no painel): o mesmo turno pela rota de texto, no formato da /voice/say. */
  const textTurn = async (body) => {
    const c = r.current;
    const id = c.session?.id;
    const fromTurn = (intent, t) => ({ intent, message: t?.message ?? null, phrase: null, marked: null, question_state: t?.question_state ?? null });
    if (body.command === "next") {
      const s = await c.backend.rpc("app_tutor_next_question", { p_session_id: id });
      // a passagem fixa é só a reserva: a IA troca antes de a tela reler a conversa (sem ela, fica a reserva)
      await tutorOpening(c.backend, id);
      return { intent: "next", message: null, phrase: null, question_state: s?.question ? "open" : null };
    }
    if (body.command === "answer") {
      await c.backend.rpc("app_tutor_answer", { p_session_id: id, p_option: body.option, p_confidence: null, p_response_ms: null, p_first_pick: null });
      return fromTurn("answer", await tutorTurn(c.backend, { session_id: id, action: "react" }));
    }
    if (body.command) return fromTurn(body.command, await tutorTurn(c.backend, { session_id: id, action: body.command }));
    return fromTurn("message", await tutorTurn(c.backend, { session_id: id, action: "message", text: body.text }));
  };

  const turn = async (body) => {
    const c = r.current;
    if (!c.alive) return;
    cancelRec();
    setNotice(null);
    if (body.text) {
      setCaptions((x) => ({ ...x, student: body.text }));
      c.onMessage?.({ role: "student", content: body.text });
    }
    setState("thinking");
    const payload = { voice_call_id: c.voiceCallId, client_turn_id: turnId(), ...body, ...(c.marked ? { marked: c.marked } : {}), ...(c.interrupted ? { interrupted: c.interrupted } : {}) };
    c.interrupted = null;
    const t0 = Date.now();
    let res;
    try {
      res = c.voiceCallId ? await say(payload) : await textTurn(body);
      c.metrics.engine.push(Date.now() - t0);
    } catch (e) {
      if (e?.code === "tutor_consent") return c.onFallback?.("tutor_consent", e.message);
      if (e?.status === 409 && c.voiceCallId) return closed(e.message || CALL_ENDED);
      setNotice(e?.status === 502 ? ENGINE_FAILED : e?.message || ENGINE_FAILED);
      return afterReply();
    }
    await handle(res);
  };

  const handle = async (res) => {
    const c = r.current;
    if (!c.alive || !res) return;
    if (res.intent === "mark" || res.intent === "unmark" || res.intent === "answer") setMarked(res.intent === "mark" ? res.marked : null);
    const before = c.session?.question_state;
    if (res.phrase) {
      setCaptions((x) => ({ ...x, tutor: res.phrase.text }));
      await sayAloud({ kind: "phrase", phrase: res.phrase.phrase, letter: res.phrase.letter, personality_id: c.session?.personality?.id }, res.phrase.text);
    }
    if (res.message) {
      // a legenda e a emoção chegam antes do som
      setCaptions((x) => ({ ...x, tutor: res.message.content }));
      if (res.message.voice_avatar) setAvatar(res.message.voice_avatar);
      c.onMessage?.({ id: res.message.id, role: "tutor", content: res.message.content });
      const ok = await sayAloud({ kind: "message", session_id: c.session?.id, message_id: res.message.id }, res.message.content);
      if (ok === "fallback") return;
    }
    if (res.intent === "next" || (res.question_state && res.question_state !== before)) {
      const fresh = await c.onSession?.().catch?.(() => null);
      if (res.intent === "next" && fresh) {
        const opening = lastTutor(fresh);
        if (opening) {
          setCaptions({ tutor: opening.content, student: "" });
          const ok = await sayAloud({ kind: "message", session_id: fresh.id, message_id: opening.id }, opening.content);
          if (ok === "fallback") return;
        }
      }
    }
    if (r.current.state !== "listening") afterReply();
  };

  /** A voz do professor fala um texto já gravado pelo servidor. Devolve "fallback" quando a conversa passou para a reserva. */
  const sayAloud = async (body, text) => {
    const c = r.current;
    if (!speaks() || !c.alive) return false;
    cancelRec(); // o microfone fica fechado enquanto o professor fala (sem eco)
    const t0 = Date.now();
    let blob;
    try {
      blob = await tutorSpeech(c.backend, body);
      c.metrics.tts.push(Date.now() - t0);
    } catch (e) {
      if (VOICE_FALLBACK_CODES.has(e?.code) || e?.code === "tutor_consent") {
        c.alive = false;
        cancelRec();
        c.onFallback?.(e.code, e.message, text);
        return "fallback";
      }
      setNotice(e?.message || "A voz do professor falhou agora.");
      return false;
    }
    const p = player();
    if (!p || !c.alive) return false;
    c.speaking = text;
    setState("speaking");
    c.metrics.play.push(Date.now() - t0);
    let finished;
    try {
      finished = await p.playEncoded(await blob.arrayBuffer());
    } catch {
      c.speaking = null;
      setNotice("A voz do professor falhou agora.");
      return false;
    }
    c.speaking = null;
    if (!finished) return "cut";
    return true;
  };

  // ---- ações
  const start = React.useCallback(() => {
    const c = r.current;
    if (c.alive) return;
    // "Conversar de novo" depois que a chamada acabou no servidor: a tela abre outra (a de agora não volta)
    if (c.closedCall && c.closedCall === c.voiceCallId && c.onReopen) return void c.onReopen();
    c.alive = true;
    c.metrics = { stt: [], engine: [], tts: [], play: [] };
    // conversa nova: nada da anterior (som, medidor, letra marcada, emoção, avisos e legenda)
    releaseAudio();
    c.interrupted = null;
    c.speaking = null;
    setMarked(null);
    setAvatar(null);
    setMicError(null);
    setCaptions({ tutor: "", student: "" });
    setNotice(null);
    if (!c.canListen) setChatRequest((n) => n + 1); // sem transcrição no servidor: a conversa é pelo Chat
    else if (!c.micStream && c.jeito === "eleven") {
      setMicError(realtimeErrorMessage({ kind: "mic" }));
      setChatRequest((n) => n + 1);
    } else if (!c.micStream) setChatRequest((n) => n + 1);
    clearInterval(c.renew);
    c.renew = setInterval(() => {
      if (!r.current.alive || !r.current.voiceCallId) return;
      voiceApi.renew(r.current.backend, r.current.voiceCallId, null).then((x) => {
        if (x?.stop) closed(x.reason === "replaced" ? CALL_REPLACED : x.message || CALL_ENDED);
      }, () => {});
    }, NEXUS_TIMING.renewMs);
    // o professor fala a abertura (a fala gravada mais recente) e depois o aluno
    const opening = lastTutor(c.session);
    setState("thinking");
    void (async () => {
      if (opening) {
        setCaptions({ tutor: opening.content, student: "" });
        const ok = await sayAloud({ kind: "message", session_id: c.session.id, message_id: opening.id }, opening.content);
        if (ok === "fallback") return;
      }
      afterReply();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** keepState: a tela troca de jeito (a voz do professor parou) e a conversa segue; sem "encerrada" no meio da troca. */
  const stop = React.useCallback(async (opts) => {
    const c = r.current;
    const wasAlive = c.alive;
    c.alive = false;
    cancelRec();
    releaseAudio();
    clearInterval(c.renew);
    if (opts?.keepState !== true) {
      setState("ended");
      setAvatar(null);
      setMarked(null);
    }
    if (!c.voiceCallId || c.ended === c.voiceCallId) return;
    c.ended = c.voiceCallId;
    const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : undefined);
    const m = c.metrics;
    const metrics = { stt_ms_avg: avg(m.stt), engine_ms_avg: avg(m.engine), tts_ms_avg: avg(m.tts), play_start_ms_avg: avg(m.play), turns: m.engine.length };
    await voiceApi.end(c.backend, c.voiceCallId, "student", Object.fromEntries(Object.entries(metrics).filter(([, v]) => typeof v === "number"))).catch(() => {});
    return wasAlive;
  }, []);

  const interrupt = React.useCallback(() => {
    const c = r.current;
    if (c.state !== "speaking") return;
    c.interrupted = (c.speaking ?? "").slice(0, 300) || null;
    c.player?.stop();
    afterReply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendText = React.useCallback((text) => {
    const clean = String(text ?? "").trim().slice(0, 2000);
    if (!clean) return false;
    if (r.current.state === "speaking") {
      r.current.interrupted = (r.current.speaking ?? "").slice(0, 300) || null;
      r.current.player?.stop();
    }
    void turn({ text: clean });
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mark = React.useCallback((letter) => {
    const c = r.current;
    setMarked(letter);
    const text = markedPhrase(letter);
    setCaptions((x) => ({ ...x, tutor: text }));
    if (c.state === "speaking") c.player?.stop();
    void sayAloud({ kind: "phrase", phrase: "marked", letter, personality_id: c.session?.personality?.id }, text).then((ok) => ok !== "fallback" && ok !== "cut" && afterReply());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const answer = React.useCallback((letter) => void turn({ command: "answer", option: letter }), []);
  const command = React.useCallback((kind) => void turn({ command: kind }), []);

  const toggleMute = React.useCallback(() => {
    const c = r.current;
    const next = !c.muted;
    c.muted = next;
    setMuted(next);
    if (next) {
      cancelRec();
      if (c.state === "listening") setState("ready");
    } else if (c.state === "ready") listen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setVolume = React.useCallback((v) => {
    r.current.volume = v;
    r.current.player?.setVolume(v);
  }, []);
  const talk = React.useCallback(() => listen(true), []);
  const send = React.useCallback(() => r.current.rec?.stop?.(), []);

  React.useEffect(() => () => {
    r.current.alive = false;
    cancelRec();
    r.current.player?.close?.();
    clearInterval(r.current.renew);
  }, []);

  return {
    state, error: null, captions, streams: { input: micStream ?? null, output }, muted, provider: "tts", remaining: null, active: state !== "idle" && state !== "ended",
    start, stop, interrupt, sendText, toggleMute, setVolume, enablePlayback: null,
    mark, answer, command, marked, avatar, tapToTalk: tap, talk, send, recording: state === "listening", micError, notice, chatRequest,
  };
}
