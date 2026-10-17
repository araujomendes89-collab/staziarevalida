// Estado da tentativa do treino sozinho. Tudo que muda a fase acontece no servidor (`status`); a tela só guarda a última
// resposta, a diferença de relógio com o servidor e refaz a consulta enquanto a avaliação por IA está correndo.
import React from "react";
import { measureOffset } from "../../dupla/clock.js";

/** A cada quanto a tela pergunta ao servidor se a avaliação por IA terminou. */
export const POLL_EVALUATING_MS = 4000;

/**
 * @param {ReturnType<typeof import("../api.js").fase2Api>} api
 * @param {{ stationId: string | null, attemptId: string | null }} target abre a tentativa `attemptId` ou começa/retoma `stationId`
 * @param {boolean} waiting a avaliação por IA foi pedida nesta tela e ainda não terminou
 */
export function useAttempt(api, { stationId, attemptId }, waiting) {
  const [attempt, setAttempt] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [offsetMs, setOffsetMs] = React.useState(0);
  const alive = React.useRef(true);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Chama uma função do servidor medindo a diferença de relógio e guarda o resultado como a tentativa atual. */
  const run = React.useCallback(async (call) => {
    const sentAt = Date.now();
    const payload = await call();
    const receivedAt = Date.now();
    if (alive.current && payload && typeof payload === "object") {
      if (payload.server_now) setOffsetMs(measureOffset(payload.server_now, sentAt, receivedAt));
      setAttempt(payload);
    }
    return payload;
  }, []);

  const load = React.useCallback(async () => {
    if (!stationId && !attemptId) {
      setError(new Error("Estação ou tentativa não informada na URL."));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await run(() => (attemptId ? api.attempt(attemptId) : api.start(stationId)));
    } catch (err) {
      if (alive.current) setError(err);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [api, stationId, attemptId, run]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Avaliação em andamento: consulta leve até virar "done" ou voltar a "submitted". Falha de rede não derruba a tela.
  const id = attempt?.attempt_id;
  const evaluating = attempt?.status === "evaluating" || waiting;
  React.useEffect(() => {
    if (!id || !evaluating) return undefined;
    const timer = setInterval(() => {
      run(() => api.attempt(id)).catch(() => undefined);
    }, POLL_EVALUATING_MS);
    return () => clearInterval(timer);
  }, [api, id, evaluating, run]);

  return { attempt, loading, error, setError, offsetMs, run, reload: load, setAttempt };
}
