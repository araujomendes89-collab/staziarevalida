// Cronômetro do treino sozinho. O tempo certo é o do SERVIDOR (`ends_at`); o aparelho só mede a diferença de relógio
// (`measureOffset`, do clock.js da sala em dupla) e conta a partir dela. Em 00:00 o apito toca uma vez por treino
// (respeita `sz-sound`) e o treino NÃO se encerra: a pessoa pode seguir e entregar.
import React from "react";
import { remainingMs } from "../../dupla/clock.js";
import { playWhistle } from "../../dupla/sound.js";

/**
 * @param {{ status?: string, ends_at?: string | null, attendance_started_at?: string | null, attempt_id?: string, station?: { duration_ms?: number } } | null} attempt
 * @param {number} offsetMs diferença servidor − aparelho
 * @returns {{ remaining: number | null, expired: boolean }} `remaining` em ms (null fora do atendimento)
 */
export function useCountdown(attempt, offsetMs) {
  const running = attempt?.status === "attending";
  const endsAt = attempt?.ends_at ?? fallbackEnd(attempt);
  const [now, setNow] = React.useState(() => Date.now());
  const whistled = React.useRef(null);
  const previous = React.useRef(null);
  const attemptId = attempt?.attempt_id ?? null;

  React.useEffect(() => {
    if (!running || !endsAt) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running, endsAt]);

  const remaining = running && endsAt ? remainingMs({ ends_at: endsAt }, now, offsetMs) : null;

  // outro treino na mesma tela: recomeça a conta do apito
  React.useEffect(() => {
    previous.current = null;
    whistled.current = null;
  }, [attemptId]);

  React.useEffect(() => {
    if (remaining == null) return;
    // só toca quando o zero é visto chegando (não ao abrir um treino cujo tempo já tinha acabado) e uma vez por treino
    if (remaining === 0 && previous.current != null && previous.current > 0 && whistled.current !== attemptId) {
      whistled.current = attemptId;
      playWhistle();
    }
    previous.current = remaining;
  }, [remaining, attemptId]);

  return { remaining, expired: remaining === 0 };
}

/** Sem `ends_at` na resposta, o fim é o começo do atendimento mais a duração da estação. */
function fallbackEnd(attempt) {
  const start = attempt?.attendance_started_at ? Date.parse(attempt.attendance_started_at) : NaN;
  const duration = attempt?.station?.duration_ms;
  if (!Number.isFinite(start) || typeof duration !== "number") return null;
  return new Date(start + duration).toISOString();
}
