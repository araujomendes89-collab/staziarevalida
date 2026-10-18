// Relógio da sala do Treinamento em Dupla. O tempo certo é sempre o do SERVIDOR: `ends_at` (correndo) ou `paused_left_ms`
// (pausado), gravados pelas funções do banco. O aparelho só mede a diferença entre o relógio dele e o do servidor
// (`server_now` de cada resposta) e conta a partir daí; nunca existe contador local que "anda sozinho".

/**
 * Diferença de relógio (servidor − aparelho), em ms, medida no MEIO da ida e volta da consulta.
 * Ex.: enviado às 12:00:00,000 (aparelho), recebido 400 ms depois, servidor diz 12:00:10,000 → 10 000 − 200 = 9 800.
 * @param {string} serverNowIso `server_now` da resposta
 * @param {number} sentAtMs hora do aparelho ao enviar (Date.now())
 * @param {number} receivedAtMs hora do aparelho ao receber
 * @returns {number}
 */
export function measureOffset(serverNowIso, sentAtMs, receivedAtMs) {
  const server = Date.parse(serverNowIso);
  if (!Number.isFinite(server) || !Number.isFinite(sentAtMs) || !Number.isFinite(receivedAtMs)) return 0;
  return Math.round(server - (sentAtMs + receivedAtMs) / 2);
}

/**
 * Tempo que falta, em ms: pausado → `paused_left_ms`; correndo → max(0, ends_at − (agora + diferença)); sem cronômetro → null.
 * @param {{ ends_at?: string | null, paused_left_ms?: number | null } | null} room
 * @param {number} nowMs hora do aparelho (Date.now())
 * @param {number} offsetMs diferença medida por `measureOffset`
 * @returns {number | null}
 */
export function remainingMs(room, nowMs, offsetMs) {
  if (!room) return null;
  if (typeof room.paused_left_ms === "number") return Math.max(0, room.paused_left_ms);
  if (room.ends_at) {
    const end = Date.parse(room.ends_at);
    if (Number.isFinite(end)) return Math.max(0, end - (nowMs + (Number.isFinite(offsetMs) ? offsetMs : 0)));
  }
  return null;
}

/**
 * "mm:ss", com os segundos arredondados para baixo ("09:59" quando faltam 599 999 ms). Negativo ou inválido: "00:00".
 * @param {number} ms
 * @returns {string}
 */
export function formatClock(ms) {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
