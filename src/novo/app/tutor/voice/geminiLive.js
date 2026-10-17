// Voz nativa do Gemini (Live API, áudio nativo) no navegador: português do Brasil com pronúncia de brasileiro (pedido de 2026-10-06,
// "ainda está com muito sotaque americano"). O servidor cria uma chave temporária com TUDO travado (instruções do professor, voz,
// ferramentas e transcrições); aqui só se conecta, manda o microfone em PCM 16 kHz e toca a voz do professor em PCM 24 kHz.
// As ferramentas (questão, gabarito, avaliação) passam pelo nosso servidor, como no Realtime. Nenhum áudio é gravado.
// O SDK oficial do Google (@google/genai/web) só é carregado quando esta voz abre.
// O áudio usa o contexto liberado no toque do aluno (audioUnlock.js): o Safari não toca nem capta som num contexto criado depois
// de uma espera, e o Firefox não liga o microfone num contexto com outra taxa. Por isso a captura reduz a taxa aqui mesmo.
import { AudioPlayer, base64ToFloat32 } from "./audioPlayer.js";
import { getAudioContext } from "./audioUnlock.js";

export const GEMINI_IN_RATE = 16_000;
export const GEMINI_OUT_RATE = 24_000;
const MAX_DROPS = 2; // quedas de rede retomadas por ligação
const MAX_RESUMES = 8; // trocas de conexão no total (as do Google, de ~10 em ~10 minutos, mais as quedas)

// Captura do microfone em blocos de ~100 ms a 16 kHz, na taxa que o contexto tiver (48 kHz, 44,1 kHz ou já 16 kHz):
// passa-baixa (dois polos simples) e interpolação linear. Para voz, que é o que o Gemini precisa ouvir, basta.
export const CAPTURE_WORKLET = `
class StaziaCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const rate = (options && options.processorOptions && options.processorOptions.rate) || sampleRate;
    this.step = sampleRate / rate;
    this.alpha = this.step > 1 ? 1 - Math.exp((-2 * Math.PI * rate * 0.4) / sampleRate) : 1;
    this.a = 0;
    this.b = 0;
    this.prev = 0;
    this.frac = 1;
    this.buf = new Float32Array(1600);
    this.n = 0;
  }
  emit(v) {
    this.buf[this.n++] = v;
    if (this.n === this.buf.length) {
      this.port.postMessage(this.buf, [this.buf.buffer]);
      this.buf = new Float32Array(1600);
      this.n = 0;
    }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.a += this.alpha * (ch[i] - this.a);
      this.b += this.alpha * (this.a - this.b);
      const cur = this.b;
      while (this.frac <= 1) {
        this.emit(this.prev + (cur - this.prev) * this.frac);
        this.frac += this.step;
      }
      this.frac -= 1;
      this.prev = cur;
    }
    return true;
  }
}
try { registerProcessor("stazia-capture", StaziaCapture); } catch (e) { /* já registrado neste contexto */ }`;

// contextos em que o processador de captura já foi carregado (o contexto é o mesmo entre ligações)
const loaded = new WeakSet();

/** Float32 (−1..1) → PCM 16 bits little-endian em base64. */
export function pcm16Base64(f32) {
  const bytes = new Uint8Array(f32.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** base64 de PCM 16 bits → Float32 (no tocador compartilhado). */
export { base64ToFloat32 };

/**
 * Abre a voz do Gemini. `semitons`: afinação da voz do personagem (manifest `voz.semitons`; +3 = Stazi); sem valor, segue o que a
 * tela de voz definiu (definirSemitonsDaVoz), e 0 é o caminho original. `handlers`: onReady, onAudio, onIdle, onTranscript(role, text, finished), onTurnComplete, onInterrupted,
 * onToolCalls(calls), onUsage(usage), onReconnect(why: "goaway" | "drop"), onClose({ beforeReady, reason }), onError(err).
 * onReady só chega depois de esta função devolver o controle (a abertura do professor usa o controle).
 * Devolve o controle: mute, sendText, respondTools, interrupt, setVolume, setSemitons, close, outputStream.
 */
export async function openGeminiLive({ token, model, stream, volume = 1, handlers = {}, sdk = null, audioContext = null, semitons = null }) {
  const ctx = audioContext ?? getAudioContext();
  if (!ctx) throw new Error("Este navegador não toca o áudio da voz.");
  if (ctx.state === "suspended") ctx.resume?.()?.catch?.(() => {});
  const { GoogleGenAI } = sdk ?? (await import("@google/genai/web"));
  const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });
  const h = handlers;
  const player = new AudioPlayer(ctx, volume, () => h.onIdle?.(), semitons == null ? { seguirTela: true } : { semitons });
  // `current`: qual conexão vale agora (a antiga, ao fechar depois de trocada, não derruba a nova).
  // O Google troca a conexão de tempos em tempos (aviso "goAway", rotina em conversa longa); quedas de rede são poucas.
  const state = { session: null, current: 0, ready: false, readySent: false, handedOver: false, muted: false, closed: false, resuming: false, handle: null, resumes: 0, drops: 0, capture: null };
  const canResume = (why) => Boolean(state.handle) && state.resumes < MAX_RESUMES && (why === "goaway" || state.drops < MAX_DROPS);
  const announceReady = () => {
    if (!state.ready || !state.handedOver || state.readySent || state.closed) return;
    state.readySent = true;
    h.onReady?.();
  };

  const onMessage = (msg) => {
    if (state.closed) return;
    if (msg.setupComplete) {
      state.ready = true;
      announceReady();
    }
    if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) state.handle = msg.sessionResumptionUpdate.newHandle;
    if (msg.goAway) resume("goaway"); // o Google avisa que vai fechar a conexão: abre outra e continua a mesma conversa
    if (msg.toolCall?.functionCalls?.length) h.onToolCalls?.(msg.toolCall.functionCalls);
    const sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) {
        player.stop();
        h.onInterrupted?.();
      }
      for (const part of sc.modelTurn?.parts ?? []) {
        const d = part.inlineData;
        if (d?.data && String(d.mimeType ?? "audio/pcm").startsWith("audio/")) {
          player.play(d.data);
          h.onAudio?.();
        }
      }
      if (sc.inputTranscription?.text) h.onTranscript?.("student", sc.inputTranscription.text, Boolean(sc.inputTranscription.finished));
      if (sc.outputTranscription?.text) h.onTranscript?.("tutor", sc.outputTranscription.text, Boolean(sc.outputTranscription.finished));
      if (sc.turnComplete) {
        player.flush(); // voz afinada: solta o finzinho que o afinador guardava
        h.onTurnComplete?.();
      }
    }
    if (msg.usageMetadata) h.onUsage?.(msg.usageMetadata);
  };

  const connect = (mine) =>
    ai.live.connect({
      model,
      // as instruções, a voz e as ferramentas estão travadas na chave; aqui só a continuidade entre conexões
      config: { sessionResumption: state.handle ? { handle: state.handle } : {} },
      callbacks: {
        onmessage: onMessage,
        onerror: (e) => h.onError?.(e),
        onclose: (e) => {
          if (mine !== state.current || state.closed || state.resuming) return;
          const beforeReady = !state.readySent;
          // queda no meio da conversa com o que retomar: reconecta na mesma conversa (retomar não gasta a chave)
          if (!beforeReady && canResume("drop")) {
            resume("drop");
            return;
          }
          shutdown();
          h.onClose?.({ beforeReady, reason: String(e?.reason || e?.code || "closed").slice(0, 60) });
        },
      },
    });

  const resume = async (why) => {
    if (state.closed || state.resuming || !canResume(why)) return;
    state.resuming = true;
    state.resumes++;
    if (why === "drop") state.drops++;
    const old = state.session;
    const mine = state.current + 1;
    try {
      const next = await connect(mine);
      if (state.closed) {
        try {
          next.close();
        } catch {
          // já fechada
        }
        return;
      }
      state.current = mine;
      state.session = next;
      try {
        old?.close();
      } catch {
        // já fechada
      }
      h.onReconnect?.(why);
    } catch (error) {
      // não deu para continuar a conversa: encerra (o aplicativo mostra e o aluno abre de novo)
      h.onError?.(error);
      if (!state.closed) {
        shutdown();
        h.onClose?.({ beforeReady: false, reason: "reconnect_failed" });
      }
    } finally {
      state.resuming = false;
    }
  };

  const startCapture = async () => {
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
    // o nó precisa estar no grafo para ser processado; o volume zero evita eco
    const silent = ctx.createGain();
    silent.gain.value = 0;
    src.connect(node);
    node.connect(silent);
    silent.connect(ctx.destination);
    node.port.onmessage = (e) => {
      if (state.muted || state.closed || !state.session) return;
      try {
        state.session.sendRealtimeInput({ audio: { data: pcm16Base64(e.data), mimeType: `audio/pcm;rate=${GEMINI_IN_RATE}` } });
      } catch {
        // conexão trocando: o próximo bloco vai
      }
    };
    state.capture = { node, src, silent };
  };

  /** Fecha tudo desta voz (conexão, captura, alto-falante); o contexto compartilhado continua. */
  const shutdown = () => {
    state.closed = true;
    try {
      state.session?.close();
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

  try {
    state.current = 1;
    state.session = await connect(1);
    await startCapture();
    if (state.closed) throw new Error("A conexão da voz fechou ao abrir.");
  } catch (error) {
    // não abriu por inteiro: nada fica ligado (nem a conexão com o Google, nem o alto-falante)
    shutdown();
    throw error;
  }

  // a abertura só depois de quem chamou ter o controle na mão
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
      if (on) {
        try {
          state.session?.sendRealtimeInput({ audioStreamEnd: true });
        } catch {
          // sem conexão
        }
      }
    },
    /** Texto (chat da tela de voz, abertura ou correção do sistema): o professor responde falando. */
    sendText(text) {
      if (state.closed) return;
      state.session?.sendRealtimeInput({ text: String(text).slice(0, 4000) });
    },
    /** Resultado das ferramentas, na ordem pedida. */
    respondTools(responses) {
      if (state.closed) return;
      state.session?.sendToolResponse({ functionResponses: responses });
    },
    interrupt() {
      player.stop();
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
      shutdown();
    },
  };
}
