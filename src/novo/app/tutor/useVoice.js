// Voz do Stazia Tutor no aparelho do aluno: ouvir (reconhecimento de fala) e falar (síntese de voz) do próprio navegador.
// A resposta falada é sempre o texto que já passou pela validação do servidor. O aluno pode interromper a qualquer momento;
// a frase que estava sendo dita volta para o servidor, para o professor retomar daquele ponto.
import React from "react";

const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

export const voiceSupport = () => ({ listen: Boolean(Recognition), speak: Boolean(synth) });

const VOICE_KEY = "smn-tutor-voice";

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

function portugueseVoice() {
  const voices = portugueseVoices();
  const wanted = chosenVoiceName();
  return voices.find((v) => v.name === wanted) ?? voices[0] ?? null;
}

/** "espera", "para", "um momento": o aluno só quer que o professor pare de falar. */
export const isPauseWord = (text) => /^(espera(?: a[ií])?|pera(?: a[ií])?|para(?: a[ií])?|um momento|calma|s[oó] um minuto)[.!…]*$/i.test(text.trim());

export function useVoice({ onUtterance }) {
  const [listening, setListening] = React.useState(false);
  const [speaking, setSpeaking] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const recRef = React.useRef(null);
  const current = React.useRef(null);     // frase sendo falada agora
  const token = React.useRef(0);          // invalida a fala anterior quando há interrupção
  const settle = React.useRef(null);      // encerra a promessa da fala em curso (nem todo navegador avisa quando a fala é cancelada)
  const handler = React.useRef(onUtterance);
  handler.current = onUtterance;

  const stopListening = React.useCallback(() => {
    try {
      recRef.current?.abort();
    } catch {
      // já parado
    }
    recRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  /** Interrompe a fala e devolve a frase que estava sendo dita (ou nulo). */
  const interrupt = React.useCallback(() => {
    const said = current.current;
    token.current++;
    current.current = null;
    synth?.cancel();
    setSpeaking(false);
    settle.current?.(false);
    settle.current = null;
    return said;
  }, []);

  /** Fala o texto frase a frase, com a velocidade e o tom do professor. Resolve quando termina (ou é interrompida). */
  const speak = React.useCallback(
    (text, voice = {}) =>
      new Promise((done) => {
        if (!synth || !text) return done(false);
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
        synth.cancel();
        const parts = speechChunks(text);
        const chosen = portugueseVoice();
        setSpeaking(true);
        const next = (i) => {
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
        };
        next(0);
      }),
    []
  );

  const listen = React.useCallback(() => {
    if (!Recognition || recRef.current) return false;
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
    rec.onerror = () => {
      recRef.current = null;
      setListening(false);
      setInterim("");
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      setInterim("");
      const text = finalText.trim();
      if (text) handler.current?.(text);
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      recRef.current = null;
      setListening(false);
      return false;
    }
    return true;
  }, []);

  React.useEffect(
    () => () => {
      token.current++;
      synth?.cancel();
      settle.current?.(false);
      try {
        recRef.current?.abort();
      } catch {
        // já parado
      }
    },
    []
  );

  return { listening, speaking, interim, speak, interrupt, listen, stopListening };
}
