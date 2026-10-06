// Áudio do navegador para a voz do Tutor. Safari (iPhone e Mac) só libera o AudioContext e a reprodução dentro de um toque do
// aluno: por isso o contexto é criado e "acordado" no próprio clique de "Conversar com o Tutor", antes de qualquer espera.
let ctx = null;

export function getAudioContext() {
  if (ctx && ctx.state !== "closed") return ctx;
  const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Chame no clique (gesto do aluno): cria/retoma o contexto de áudio. Nunca lança erro. */
export function unlockAudio() {
  const c = getAudioContext();
  try {
    if (c && c.state === "suspended") c.resume?.().catch?.(() => {});
  } catch {
    // navegador sem suporte: a voz funciona, só a animação fica sem reagir ao som
  }
  return c;
}

/** Libera o contexto (ao fechar a tela de voz): microfone e alto-falante não ficam presos. */
export async function releaseAudioContext() {
  const c = ctx;
  ctx = null;
  try {
    if (c && c.state !== "closed") await c.close?.();
  } catch {
    // já fechado
  }
}
