// Voz do Stazia Tutor no aparelho do aluno: ouvir (reconhecimento de fala) e falar (síntese de voz) do próprio navegador.
// A resposta falada é sempre o texto que já passou pela validação do servidor. O aluno pode interromper a qualquer momento;
// a frase que estava sendo dita volta para o servidor, para o professor retomar daquele ponto.
import React from "react";

const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

export const voiceSupport = () => ({ listen: Boolean(Recognition), speak: Boolean(synth) });

const sentences = (text) => (text.match(/[^.!?]+[.!?]*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);

function portugueseVoice() {
  const voices = synth?.getVoices?.() ?? [];
  return voices.find((v) => /^pt[-_]BR/i.test(v.lang)) ?? voices.find((v) => /^pt/i.test(v.lang)) ?? null;
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
        const parts = sentences(text);
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
