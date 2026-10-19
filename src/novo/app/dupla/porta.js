// Treino em Dupla · entrada na estação (dono, 19/10): o candidato fica de frente para a porta da área e, ao iniciar, o apito e a
// porta abrindo acontecem juntos, pelo relógio do SERVIDOR. A migração 014150 grava started_at = toque do ator + 2 s.

/** Duração do apito (playWhistle, sound.js) e da porta abrindo, em ms. A 014150 usa o mesmo valor ("interval '2 seconds'"). */
export const APITO_MS = 2000;

/** Apito que chegaria atrasado mais que isto (rede lenta, aba no fundo, sala aberta depois) não toca: a porta abre sem som. */
export const APITO_TOLERANCIA_MS = 1000;

const ANTES_DE_COMECAR = new Set(["roles", "connecting", "setup"]);

/**
 * Etapa da entrada na estação, pela hora do SERVIDOR (função pura: quem chama passa `Date.now() + offsetMs`).
 * "fechada" antes de começar e até o apito começar (started_at − APITO_MS); "abrindo" durante o apito; "aberta" a partir de
 * started_at (ou já começada sem started_at gravado).
 * @param {{ phase?: string, started_at?: string | null } | null} room
 * @param {number} serverNowMs
 * @returns {{ etapa: "fechada" | "abrindo" | "aberta", apitoEm: number | null, abreEm: number | null, faltaMs: number }}
 */
export function entrada(room, serverNowMs) {
  const abreEm = room?.started_at ? Date.parse(room.started_at) : NaN;
  if (!room || ANTES_DE_COMECAR.has(room.phase)) return { etapa: "fechada", apitoEm: null, abreEm: null, faltaMs: 0 };
  // Já começou, mas sem início gravado (sala antiga): a porta já está aberta, sem apito.
  if (!Number.isFinite(abreEm)) return { etapa: "aberta", apitoEm: null, abreEm: null, faltaMs: 0 };
  const apitoEm = abreEm - APITO_MS;
  if (serverNowMs < apitoEm) return { etapa: "fechada", apitoEm, abreEm, faltaMs: abreEm - serverNowMs };
  if (serverNowMs < abreEm) return { etapa: "abrindo", apitoEm, abreEm, faltaMs: abreEm - serverNowMs };
  return { etapa: "aberta", apitoEm, abreEm, faltaMs: 0 };
}

/**
 * Toca o apito agora? Só na etapa "abrindo", uma vez por rodada (`jaApitou`), e só se o atraso desde o começo do apito for de
 * até APITO_TOLERANCIA_MS.
 */
export function deveApitar(e, serverNowMs, jaApitou) {
  return e.etapa === "abrindo" && !jaApitou && serverNowMs - e.apitoEm <= APITO_TOLERANCIA_MS;
}

/** Tempo do cronômetro: enquanto a porta abre, a duração cheia (os 10 minutos começam com a porta aberta). */
export function tempoMostrado(e, restanteMs, duracaoMs) {
  if (restanteMs == null) return duracaoMs ?? null;
  return e.etapa === "abrindo" && typeof duracaoMs === "number" ? Math.min(restanteMs, duracaoMs) : restanteMs;
}
