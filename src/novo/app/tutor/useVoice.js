// Voz do Stazia Tutor no aparelho do aluno: ouvir (reconhecimento de fala do navegador) e falar. Para falar há dois caminhos:
// a VOZ NATURAL, gerada no servidor (áudio de um serviço de voz neural), e a voz do próprio aparelho, que é a reserva quando a
// natural não está ligada ou falha. Nos dois, o que se fala é sempre o texto que já passou pela validação do servidor.
// O aluno pode interromper a qualquer momento; a frase que estava sendo dita volta para o servidor, para o professor retomar dali.
import React from "react";

const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

export const voiceSupport = () => ({ listen: Boolean(Recognition), speak: Boolean(synth) });

const VOICE_KEY = "smn-tutor-voice";
const ENGINE_KEY = "smn-tutor-voice-engine"; // "device" quando o aluno prefere a voz do aparelho à natural
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

/**
 * Pedaços de fala: frases juntas até uns 220 caracteres. Frase a frase a voz fica picada; um texto longo de uma vez é
 * cortado por alguns navegadores depois de uns 15 segundos.
 */
export function speechChunks(text, max = 220) {
  const parts = (text.match(/[^.!?…]+[.!?…]*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
  const chunks = [];
  for (const part of parts) {
    const last = chunks[chunks.length - 1];
    if (last && last.length + part.length + 1 <= max) chunks[chunks.length - 1] = `${last} ${part}`;
    else chunks.push(part);
  }
  return chunks;
}

/** Quanto uma voz do aparelho tende a soar natural: as "neurais/naturais/aprimoradas" primeiro, depois as do Google. */
function naturalness(v) {
  // português do Brasil sempre na frente do de Portugal: sotaque errado soa mais estranho que voz simples
  let score = /^pt[-_]BR/i.test(v.lang) ? 10 : /^pt/i.test(v.lang) ? 0 : -100;
  if (/natural|neural|online|premium|enhanced|aprimorad|melhorad|siri/i.test(v.name)) score += 4;
  if (/google/i.test(v.name)) score += 2;
  if (v.localService === false) score += 1;
  return score;
}

/** Vozes em português do aparelho, da mais natural para a menos. */
export function portugueseVoices() {
  const voices = synth?.getVoices?.() ?? [];
  return voices.filter((v) => /^pt/i.test(v.lang)).sort((a, b) => naturalness(b) - naturalness(a));
}

export function chosenVoiceName() {
  try {
    return localStorage.getItem(VOICE_KEY) || "";
  } catch {
    return "";
  }
}
export function chooseVoice(name) {
  try {
    if (name) localStorage.setItem(VOICE_KEY, name);
    else localStorage.removeItem(VOICE_KEY);
  } catch {
    // armazenamento indisponível: vale a voz mais natural do aparelho
  }
}

/** O aluno quer a voz natural (padrão, quando o servidor tem uma)? */
export function neuralChosen() {
  try {
    return localStorage.getItem(ENGINE_KEY) !== "device";
  } catch {
    return true;
  }
}
export function chooseNeural(on) {
  try {
    if (on) localStorage.removeItem(ENGINE_KEY);
    else localStorage.setItem(ENGINE_KEY, "device");
  } catch {
    // armazenamento indisponível: vale o padrão
  }
}

/** O pedaço do texto que estava sendo dito quando o áudio parou (pela fração já tocada). */
export function chunkAt(text, fraction) {
  const parts = speechChunks(text);
  const total = parts.reduce((n, x) => n + x.length, 0) || 1;
  let acc = 0;
  for (const part of parts) {
    acc += part.length;
    if (acc / total >= fraction) return part;
  }
  return parts[parts.length - 1] ?? text;
}

function portugueseVoice() {
  const voices = portugueseVoices();
  const wanted = chosenVoiceName();
  return voices.find((v) => v.name === wanted) ?? voices[0] ?? null;
}

/** "espera", "para", "um momento": o aluno só quer que o professor pare de falar. */
export const isPauseWord = (text) => /^(espera(?: a[ií])?|pera(?: a[ií])?|para(?: a[ií])?|um momento|calma|s[oó] um minuto)[.!…]*$/i.test(text.trim());

export function useVoice({ onUtterance, onSilence }) {
  const [listening, setListening] = React.useState(false);
  const [speaking, setSpeaking] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const [error, setError] = React.useState(null);   // código do erro do microfone (ver micErrorMessage)
  const speakingKind = React.useRef(null);          // "reply" (fala do professor) ou "system" (leitura da questão, avisos)
  const silence = React.useRef(onSilence);
  silence.current = onSilence;
  const recRef = React.useRef(null);
  const current = React.useRef(null);     // frase sendo falada agora
  const token = React.useRef(0);          // invalida a fala anterior quando há interrupção
  const settle = React.useRef(null);      // encerra a promessa da fala em curso (nem todo navegador avisa quando a fala é cancelada)
  const handler = React.useRef(onUtterance);
  handler.current = onUtterance;
  const player = React.useRef(null);      // elemento de áudio da voz natural (um só, liberado no primeiro toque do aluno)
  const playing = React.useRef(null);     // { text, url } da fala natural em curso

  const audioEl = () => {
    if (!player.current && typeof Audio !== "undefined") player.current = new Audio();
    return player.current;
  };
  /** Chamado num toque do aluno: alguns navegadores (Safari) só deixam tocar áudio depois de um gesto. */
  const unlock = React.useCallback(() => {
    const a = audioEl();
    if (!a || playing.current) return;
    try {
      a.muted = true;
      if (!a.src) a.src = SILENT;
      const p = a.play?.();
      p?.then?.(() => (a.pause(), (a.muted = false)), () => (a.muted = false));
    } catch {
      a.muted = false;
    }
  }, []);
  const stopAudio = () => {
    const now = playing.current;
    playing.current = null;
    if (!now) return null;
    const a = player.current;
    const fraction = a && a.duration > 0 ? a.currentTime / a.duration : 0;
    try {
      a?.pause();
    } catch {
      // já parado
    }
    if (a) a.onended = a.onerror = null;
    URL.revokeObjectURL?.(now.url);
    return chunkAt(now.text, fraction);
  };

  const stopListening = React.useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;   // parada pedida: o fim desta escuta não conta como "silêncio"
    try {
      rec?.abort();
    } catch {
      // já parado
    }
    setListening(false);
    setInterim("");
  }, []);

  /** Interrompe a fala. Devolve o trecho que estava sendo dito, só quando era o professor respondendo (para ele retomar dali). */
  const interrupt = React.useCallback(() => {
    const atAudio = stopAudio();
    const said = speakingKind.current === "reply" ? (atAudio ?? current.current) : null;
    speakingKind.current = null;
    token.current++;
    current.current = null;
    synth?.cancel();
    setSpeaking(false);
    settle.current?.(false);
    settle.current = null;
    return said;
  }, []);

  /**
   * Fala o texto. Com `load` (busca o áudio da voz natural no servidor), toca esse áudio; sem ele, ou se falhar, fala frase a
   * frase com a voz do aparelho, na velocidade e no tom do professor. Resolve quando termina (ou é interrompida).
   */
  const speak = React.useCallback(
    (text, voice = {}, kind = "reply", load = null) =>
      new Promise((done) => {
        if (!text || (!synth && !load)) return done(false);
        stopAudio();
        speakingKind.current = kind;
        settle.current?.(false);          // uma fala nova encerra a anterior
        const mine = ++token.current;
        let finished = false;
        const resolve = (value) => {
          if (finished) return;
          finished = true;
          if (settle.current === resolve) settle.current = null;
          done(value);
        };
        settle.current = resolve;
        synth?.cancel();
        const parts = speechChunks(text);
        const chosen = portugueseVoice();
        setSpeaking(true);
        if (load && audioEl()) {
          current.current = parts[0] ?? text;
          load().then(
            (blob) => {
              if (mine !== token.current) return resolve(false);
              const a = audioEl();
              const url = URL.createObjectURL(blob);
              playing.current = { text, url };
              const failed = () => {
                if (playing.current?.url !== url) return;
                stopAudio();
                if (mine === token.current) device();
              };
              a.onended = () => {
                if (playing.current?.url !== url) return;
                stopAudio();
                current.current = null;
                setSpeaking(false);
                resolve(true);
              };
              a.onerror = failed;
              a.muted = false;
              a.src = url;
              try {
                a.play()?.catch?.(failed);
              } catch {
                failed();
              }
            },
            () => mine === token.current && device()
          );
          return;
        }
        device();
        function device() {
          if (!synth) {
            setSpeaking(false);
            return resolve(false);
          }
          synth.cancel();
          next(0);
        }
        function next(i) {
          if (mine !== token.current) return resolve(false);
          if (i >= parts.length) {
            current.current = null;
            setSpeaking(false);
            return resolve(true);
          }
          const u = new SpeechSynthesisUtterance(parts[i]);
          u.lang = chosen?.lang ?? "pt-BR";
          if (chosen) u.voice = chosen;
          u.rate = Math.min(2, Math.max(0.5, Number(voice.rate) || 1));
          u.pitch = Math.min(2, Math.max(0.5, Number(voice.pitch) || 1));
          u.onstart = () => {
            current.current = parts[i];
          };
          u.onend = () => next(i + 1);
          u.onerror = () => next(i + 1);
          synth.speak(u);
        }
      }),
    []
  );

  const listen = React.useCallback(() => {
    if (!Recognition) {
      setError("unsupported");
      return false;
    }
    if (recRef.current) return false;
    const rec = new Recognition();
    rec.lang = "pt-BR";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (event) => {
      let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += piece;
        else partial += piece;
      }
      setInterim(finalText + partial);
    };
    let failed = false;
    rec.onerror = (event) => {
      // "no-speech" e "aborted" não são defeito: o aluno ficou em silêncio ou a escuta foi interrompida de propósito
      if (event?.error && event.error !== "no-speech" && event.error !== "aborted") {
        failed = true;
        setError(event.error);
      }
    };
    rec.onend = () => {
      const wasMine = recRef.current === rec;
      recRef.current = null;
      setListening(false);
      setInterim("");
      const text = finalText.trim();
      if (text) handler.current?.(text);
      else if (wasMine && !failed) silence.current?.();
    };
    recRef.current = rec;
    setError(null);
    setListening(true);
    try {
      rec.start();
    } catch {
      recRef.current = null;
      setListening(false);
      setError("start");
      return false;
    }
    return true;
  }, []);

  React.useEffect(
    () => () => {
      token.current++;
      synth?.cancel();
      stopAudio();
      settle.current?.(false);
      try {
        recRef.current?.abort();
      } catch {
        // já parado
      }
    },
    []
  );

  return { listening, speaking, interim, error, speak, interrupt, listen, stopListening, unlock };
}
