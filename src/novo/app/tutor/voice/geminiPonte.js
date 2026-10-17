// Voz do Gemini pelo VERTEX (decisão do dono de 16/10/2026): o navegador conversa com a PONTE no Cloud Run (server/vozPonte),
// nunca com o Google. O servidor do app sela um bilhete com instruções, voz e ferramentas; aqui só se entrega o bilhete na
// primeira mensagem, manda o microfone em PCM 16 kHz e toca a voz do professor em PCM 24 kHz. Mesmo controle de openGeminiLive
// (mute, sendText, respondTools, interrupt, setVolume, close, outputStream), para o useRealtimeVoice trocar um pelo outro.
// Sem retomada de sessão no Google: se a ponte reabrir a conexão, ela mesma devolve o contexto ("reconectando" → "pronto").
import { AudioPlayer } from "./audioPlayer.js";
import { getAudioContext } from "./audioUnlock.js";
import { CAPTURE_WORKLET, GEMINI_IN_RATE, pcm16Base64 } from "./geminiLive.js";

const loaded = new WeakSet();

/**
 * Abre a voz pela ponte. `ponte`: { url, bilhete } vindos de /voice/start. `semitons`: afinação da voz do personagem (como em
 * openGeminiLive; sem valor, segue a tela de voz). handlers: onReady, onAudio, onIdle,
 * onTranscript(role, text, finished), onTurnComplete, onInterrupted, onToolCalls(calls), onUsage(uso), onReconnect(why),
 * onClose({ beforeReady, reason }), onError(err). Testes podem trocar o WebSocket (WebSocketImpl).
 */
export async function openGeminiPonte({ ponte, stream, volume = 1, handlers = {}, audioContext = null, WebSocketImpl = null, semitons = null }) {
  const ctx = audioContext ?? getAudioContext();
  if (!ctx) throw new Error("Este navegador não toca o áudio da voz.");
  if (ctx.state === "suspended") ctx.resume?.()?.catch?.(() => {});
  const h = handlers;
  const player = new AudioPlayer(ctx, volume, () => h.onIdle?.(), semitons == null ? { seguirTela: true } : { semitons });
  const state = { ws: null, ready: false, readySent: false, handedOver: false, muted: false, closed: false, capture: null };
  const send = (o) => {
    if (state.ws?.readyState === 1) state.ws.send(JSON.stringify(o));
  };
  const announceReady = () => {
    if (!state.ready || !state.handedOver || state.readySent || state.closed) return;
    state.readySent = true;
    h.onReady?.();
  };

  const shutdown = () => {
    state.closed = true;
    try {
      state.ws?.close();
    } catch {
      // já fechada
    }
    try {
      if (state.capture?.node?.port) state.capture.node.port.onmessage = null;
      state.capture?.src?.disconnect();
      state.capture?.node?.disconnect();
      state.capture?.silent?.disconnect();
    } catch {
      // já parado
    }
    player.close();
  };

  const onMessage = (m) => {
    if (state.closed) return;
    switch (m.t) {
      case "pronto":
        if (m.reaberta) h.onReconnect?.("ponte");
        state.ready = true;
        announceReady();
        break;
      case "audio":
        player.play(m.d);
        h.onAudio?.();
        break;
      case "transcricao":
        h.onTranscript?.(m.quem === "aluno" ? "student" : "tutor", m.texto, Boolean(m.fim));
        break;
      case "interrompido":
        player.stop();
        h.onInterrupted?.();
        break;
      case "geracao_completa":
        player.flush(); // voz afinada: solta o finzinho que o afinador guardava assim que o modelo termina de gerar
        break;
      case "turno_completo":
        player.flush(); // e de novo no turno completo (sem efeito se já saiu)
        h.onTurnComplete?.();
        break;
      case "ferramentas":
        h.onToolCalls?.(m.chamadas ?? []);
        break;
      case "uso":
        h.onUsage?.(m);
        break;
      case "erro":
        h.onError?.(new Error(String(m.mensagem ?? "erro na ponte de voz")));
        break;
      case "encerrado":
        if (!state.closed) {
          const beforeReady = !state.readySent;
          shutdown();
          h.onClose?.({ beforeReady, reason: String(m.motivo ?? "encerrado").slice(0, 60) });
        }
        break;
      default:
        break;
    }
  };

  // conecta e entrega o bilhete
  await new Promise((resolve, reject) => {
    const WS = WebSocketImpl ?? WebSocket;
    const ws = new WS(ponte.url);
    state.ws = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true;
      ws.send(JSON.stringify({ t: "abrir", bilhete: ponte.bilhete }));
      resolve();
    };
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(typeof e.data === "string" ? e.data : ""));
      } catch {
        // mensagem ilegível: ignora
      }
    };
    ws.onerror = () => {
      if (!opened) reject(new Error("Não consegui abrir a ponte de voz."));
      else h.onError?.(new Error("a ponte de voz falhou"));
    };
    ws.onclose = (e) => {
      if (!opened) return reject(new Error("A ponte de voz recusou a conexão."));
      if (state.closed) return;
      const beforeReady = !state.readySent;
      shutdown();
      h.onClose?.({ beforeReady, reason: String(e?.reason || e?.code || "closed").slice(0, 60) });
    };
  });

  try {
    if (!loaded.has(ctx)) {
      const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      loaded.add(ctx);
    }
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "stazia-capture", { processorOptions: { rate: GEMINI_IN_RATE } });
    const silent = ctx.createGain();
    silent.gain.value = 0;
    src.connect(node);
    node.connect(silent);
    silent.connect(ctx.destination);
    node.port.onmessage = (e) => {
      if (state.muted || state.closed || !state.ready) return;
      send({ t: "audio", d: pcm16Base64(e.data) });
    };
    state.capture = { node, src, silent };
  } catch (error) {
    shutdown();
    throw error;
  }

  setTimeout(() => {
    state.handedOver = true;
    announceReady();
  }, 0);

  return {
    outputStream: player.stream,
    get ready() {
      return state.readySent;
    },
    get speaking() {
      return player.playing;
    },
    mute(on) {
      state.muted = on;
      send({ t: "mudo", v: Boolean(on) });
    },
    sendText(text) {
      if (!state.closed) send({ t: "texto", texto: String(text).slice(0, 4000) });
    },
    /** Resultado das ferramentas (o mesmo formato do Gemini: { id, name, response }). */
    respondTools(responses) {
      if (!state.closed) send({ t: "ferramentas", respostas: responses });
    },
    interrupt() {
      player.stop();
      send({ t: "interromper" });
    },
    setVolume(v) {
      player.setVolume(v);
    },
    /** Afinação da voz do personagem (semitons; 0 = sem afinar). */
    setSemitons(n) {
      player.setSemitons(n);
    },
    close() {
      if (state.closed) return;
      send({ t: "fim" });
      shutdown();
    },
  };
}
