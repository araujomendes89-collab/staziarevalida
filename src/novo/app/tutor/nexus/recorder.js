// Gravação da fala do aluno na Nexus. O áudio fica só na memória até ir ao servidor (/voice/transcribe), que também não guarda.
// Computador e Android: a gravação para sozinha depois de 1,5 s de silêncio, só depois de ouvir fala. iPhone e iPad (o Safari
// não deixa medir o microfone com confiança): o aluno toca em "Falar" e em "Enviar". Tudo para em 45 s.
export const MAX_RECORD_MS = 45_000;
export const SILENCE_MS = 1_500;
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
// níveis iniciais, na escala de rmsLevel (useAudioLevel.js); ajustáveis depois da audição
export const SPEECH_LEVEL = 0.15;
export const SILENCE_LEVEL = 0.08;

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

/** iPhone, iPad ou iPod (também o iPad que se apresenta como Mac, com tela de toque): gravação por toque. */
export function tapToTalkDevice(nav = typeof navigator !== "undefined" ? navigator : null) {
  const ua = nav?.userAgent ?? "";
  return /iPhone|iPad|iPod/.test(ua) || (nav?.platform === "MacIntel" && (nav?.maxTouchPoints ?? 0) > 1);
}

/**
 * Começa a gravar. `auto`: para sozinha no silêncio (depois de ouvir fala). `level()`: nível do microfone agora (0..1); sem ele,
 * a fala é presumida. `onDone({ blob, mime, seconds })`, ou `onDone(null)` quando só houve silêncio, quando foi cancelada ou
 * acima de 4 MB. Devolve { stop, cancel }.
 */
export function startRecording({ stream, auto, level, MediaRecorderImpl = globalThis.MediaRecorder, onDone }) {
  const mime = pickMime(MediaRecorderImpl?.isTypeSupported?.bind(MediaRecorderImpl));
  const rec = new MediaRecorderImpl(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  const t0 = Date.now();
  let heard = typeof level !== "function";
  let quietSince = null;
  let cancelled = false;
  let finished = false;

  const stop = () => {
    if (rec.state !== "inactive") rec.stop();
  };
  const watch = setInterval(() => {
    if (typeof level !== "function") return;
    const l = Number(level()) || 0;
    if (l >= SPEECH_LEVEL) {
      heard = true;
      quietSince = null;
    } else if (l < SILENCE_LEVEL) {
      if (heard && auto) {
        quietSince ??= Date.now();
        if (Date.now() - quietSince >= SILENCE_MS) stop();
      }
    } else quietSince = null;
  }, 100);
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
    cancel() {
      cancelled = true;
      stop();
    },
  };
}
