// Acesso pago do aluno nas telas (PL02, decisão do dono de 2026-10-11). Espelha a regra do banco (…9730_teste_vencido_trava_pago):
// o que decide é sempre o banco; aqui só se escolhe o aviso em português. Sem tela de assinatura e sem cobrança (a Stripe está parada).
import { paidPlanLapsed } from "../admin/common.jsx";

/** Equipe (administrador e editor) e revisor médico: acesso completo, sem teste nem plano. */
export const hasFullAccess = (boot) => boot?.role === "admin" || boot?.role === "editor" || Boolean(boot?.reviewer_areas?.length);

/** Teste grátis valendo: situação "Em teste" com a data de fim no futuro (ou sem data registrada). */
export function trialValid(sub, now = Date.now()) {
  if (!sub || sub.status !== "trialing") return false;
  if (!sub.trial_ends_at) return true;
  const end = Date.parse(sub.trial_ends_at);
  return Number.isNaN(end) || end > now;
}

/**
 * Situação do aluno diante do que é pago de verdade (Tutor, simulados completos, estações Pro):
 *  completo (equipe/revisor), pago (plano pago válido), teste (teste valendo), teste_acabou, plano_acabou, sem_teste
 *  (ou desconhecido, quando a abertura do app não trouxe a assinatura).
 */
export function planAccess(boot, now = Date.now()) {
  if (!boot) return "teste";
  if (hasFullAccess(boot)) return "completo";
  if (boot.has_pro) return "pago";
  const sub = boot.subscription;
  if (!sub) return "desconhecido"; // sem a assinatura na abertura do app: a tela não trava nada; o banco decide
  if (trialValid(sub, now)) return "teste";
  if (sub && ["pro", "elite"].includes(sub.plan) && (sub.status !== "trialing" || paidPlanLapsed(sub, now))) return "plano_acabou";
  if (sub && sub.plan === "trial" && sub.trial_ends_at) return "teste_acabou";
  return "sem_teste";
}

/** Aviso para quem não tem acesso ao que é pago (null quando tem). */
export function lockNotice(access) {
  const rest = "Os simulados completos, o Tutor e as estações Pro fazem parte dos planos pagos; as questões e os flashcards continuam abertos. A assinatura pelo app ainda não está disponível.";
  if (access === "teste_acabou") return { title: "Seu teste grátis terminou", text: rest };
  if (access === "plano_acabou") return { title: "Seu plano pago terminou", text: rest };
  if (access === "sem_teste") return { title: "Você está no acesso gratuito", text: rest };
  return null;
}

/** O banco recusou por falta de plano pago (mensagem de simulado_gate)? */
export const isPlanLockMessage = (message) => /planos pagos/.test(String(message ?? ""));
