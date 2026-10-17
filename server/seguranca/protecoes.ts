import { timingSafeEqual } from "crypto";

/**
 * Proteções pequenas do servidor (auditoria de segurança de 17/10/2026).
 */

/** Confere o "Authorization: Bearer <CRON_SECRET>" das tarefas agendadas sem vazar, pelo tempo de resposta, quantas letras bateram. */
export function cronAutorizado(authorization: string | undefined, secret: string | undefined): boolean {
  if (!secret || typeof authorization !== "string") return false;
  const recebido = Buffer.from(authorization);
  const esperado = Buffer.from(`Bearer ${secret}`);
  if (recebido.length !== esperado.length) return false;
  return timingSafeEqual(recebido, esperado);
}

/**
 * O banco de desenvolvimento (/api/dev-db: cadastro, entrada e "primeiro administrador" sem conferência) só pode existir
 * na máquina de quem desenvolve. Antes dependia só de NODE_ENV; agora também nunca sobe na Vercel nem no Cloud Run,
 * mesmo que NODE_ENV fique errado num desses lugares.
 */
export function podeMontarBancoDev(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production") return false;
  if (env.VERCEL || env.VERCEL_ENV) return false;
  if (env.K_SERVICE) return false; // Cloud Run
  return true;
}
