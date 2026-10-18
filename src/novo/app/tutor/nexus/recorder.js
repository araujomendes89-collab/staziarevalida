// Gravação da fala do aluno na Nexus (modo reserva, quando a voz ao vivo não está disponível). O áudio fica só na memória até ir
// ao servidor (/voice/transcribe), que também não guarda.
//
// 18/10 (pedido do dono: "nada de apertar pra falar e depois apertar pra enviar"): a gravação começa e termina sozinha em TODO
// aparelho, iPhone inclusive. O fim da fala é percebido no navegador por um detector com limiar ADAPTATIVO: ele aprende o ruído de
// fundo da sala (e o nível que o iPhone entrega, que é mais baixo por causa do ganho automático) e só conta como fala o que passa
// bem acima disso por um tempinho. Antes, o iPhone usava toque porque a medição em bytes (0..255) perdia a fala baixa do Safari;
// agora a medição usa amostras em ponto flutuante quando o navegador oferece.
// Se o medidor do navegador não devolver nada (só zeros, o que o Safari faz quando o áudio está suspenso), a gravação avisa
// (onMeterDead) para a tela pedir UM toque, que acorda o áudio; depois disso volta a ser sozinha. Tudo para em 45 s.
export const MAX_RECORD_MS = 45_000;
/** Silêncio depois da fala que encerra a vez do aluno. */
export const SILENCE_MS = 1_200;
/** Fala mínima (somada) para valer como fala, e não um estalo. */
export const MIN_SPEECH_MS = 250;
/** Medidor morto: só zeros exatos por este tempo. */
export const DEAD_METER_MS = 2_500;
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const TICK_MS = 50;

/** O formato que o navegador grava: webm/opus (Chrome, Edge, Android), senão mp4 (Safari). */
export function pickMime(isTypeSupported) {
  if (typeof isTypeSupported !== "function") return "";
  for (const mime of ["audio/webm;codecs=opus", "audio/mp4"]) {
    try {
      if (isTypeSupported(mime)) return mime;
    } catch {
      // navegador antigo
    }
  }
  return "";
}

/**
 * Detector de fala com limiar adaptativo. `push(nivel, ms)` recebe o RMS (0..1, amostras em ponto flutuante) a cada passo e
 * devolve "speech" | "silence" | "gap" (entre os dois limiares). O piso de ruído desce depressa e sobe devagar (só fora da fala),
 * então uma sala barulhenta ou um microfone baixinho mudam os limiares sozinhos.
 */
export function createVad({ floor = 0.004 } = {}) {
  let piso = floor;
  let amostras = 0;
  const limites = () => ({ fala: Math.max(piso * 3.2, piso + 0.012, 0.01), silencio: Math.max(piso * 1.8, piso + 0.005, 0.006) });
  return {
    push(l) {
      const nivel = Math.max(0, Number(l) || 0);
      amostras++;
      const { fala, silencio } = limites();
      const tipo = nivel >= fala ? "speech" : nivel < silencio ? "silence" : "gap";
      // aprende o fundo: nos primeiros passos fica com o menor nível visto (no máximo 0,02, caso o aluno já comece falando); depois,
      // só o que não é fala entra na conta (desce rápido, sobe devagar)
      if (amostras <= 6) piso = Math.min(amostras === 1 ? nivel : Math.min(piso, nivel), 0.02);
      else if (tipo !== "speech") piso = nivel < piso ? piso * 0.7 + nivel * 0.3 : piso * 0.985 + nivel * 0.015;
      piso = Math.min(Math.max(piso, 0.0015), 0.08);
      return tipo;
    },
    get limites() {
      return { piso, ...limites() };
    },
  };
}

/**
 * Começa a gravar. Para sozinha quando o aluno fala e depois fica em silêncio (SILENCE_MS). `level()`: RMS do microfone agora (0..1);
 * sem ele, só para em 45 s ou por `stop()`. `onMeterDead()`: o medidor só devolveu zeros (a tela pede um toque). `onSpeech()`: a
 * fala começou (para o estado "ouvindo"). `onDone({ blob, mime, seconds })`, ou `onDone(null)` quando só houve silêncio, quando foi
 * cancelada ou acima de 4 MB. Devolve { stop, cancel }.
 */
export function startRecording({ stream, level, MediaRecorderImpl = globalThis.MediaRecorder, onDone, onMeterDead, onSpeech }) {
  const mime = pickMime(MediaRecorderImpl?.isTypeSupported?.bind(MediaRecorderImpl));
  const rec = new MediaRecorderImpl(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  const t0 = Date.now();
  const medir = typeof level === "function";
  const vad = createVad();
  let falaMs = 0;
  let heard = !medir;
  let quietSince = null;
  let zerosDesde = null;
  let avisouMorto = false;
  let cancelled = false;
  let finished = false;

  const stop = () => {
    if (rec.state !== "inactive") rec.stop();
  };
  const watch = setInterval(() => {
    if (!medir) return;
    const l = Number(level()) || 0;
    // medidor morto: zeros exatos o tempo todo (um microfone de verdade nunca dá zero exato)
    if (l === 0) {
      zerosDesde ??= Date.now();
      if (!avisouMorto && Date.now() - zerosDesde >= DEAD_METER_MS) {
        avisouMorto = true;
        onMeterDead?.();
      }
      return;
    }
    zerosDesde = null;
    const tipo = vad.push(l);
    if (tipo === "speech") {
      falaMs += TICK_MS;
      quietSince = null;
      if (!heard && falaMs >= MIN_SPEECH_MS) {
        heard = true;
        onSpeech?.();
      }
    } else if (tipo === "silence") {
      if (heard) {
        quietSince ??= Date.now();
        if (Date.now() - quietSince >= SILENCE_MS) stop();
      } else falaMs = Math.max(0, falaMs - TICK_MS / 2); // estalos soltos não somam
    } else quietSince = null;
  }, TICK_MS);
  const cap = setTimeout(stop, MAX_RECORD_MS);

  rec.ondataavailable = (e) => {
    if (e?.data?.size) chunks.push(e.data);
  };
  rec.onstop = () => {
    clearInterval(watch);
    clearTimeout(cap);
    if (finished) return;
    finished = true;
    if (cancelled || !heard) return onDone(null);
    const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
    if (!blob.size || blob.size > MAX_AUDIO_BYTES) return onDone(null);
    onDone({ blob, mime: blob.type, seconds: Math.min(MAX_RECORD_MS, Date.now() - t0) / 1000 });
  };
  rec.start();
  return {
    stop,
    /** O aluno tocou em "Pronto" (só quando o medidor está morto): manda o que gravou mesmo sem o medidor ouvir fala. */
    finish() {
      heard = true;
      stop();
    },
    cancel() {
      cancelled = true;
      stop();
    },
  };
}
