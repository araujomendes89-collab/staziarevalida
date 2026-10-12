// Acesso pago do aluno nas telas (PL02, decisão do dono de 2026-10-11). Quem decide é SEMPRE o banco (…9730_teste_vencido_trava_pago):
// as telas perguntam "app_my_access" e só escolhem o aviso em português. Se o banco ainda não tem essa regra (a função não existe) ou a
// pergunta falha, nenhum aviso aparece e a tela fica como antes: o aviso nunca promete o que o banco não faz. Sem tela de assinatura e sem
// cobrança (a Stripe está parada): os avisos não têm botão de assinar.
import React from "react";
import { useSession } from "../session.jsx";
import { isStaffRole, paidPlanLapsed, trialLapsed } from "../admin/common.jsx";

/** Equipe (administrador e editor) e revisor médico: acesso completo, sem teste nem plano. */
export const hasFullAccess = (boot) => boot?.role === "admin" || boot?.role === "editor" || Boolean(boot?.reviewer_areas?.length);

const KEEP_OPEN = "as questões e os flashcards continuam abertos. A assinatura pelo app ainda não está disponível.";

/**
 * Aviso para quem não tem acesso ao que é pago (null quando tem). `state`: "teste_acabou", "plano_acabou" ou "sem_teste" (vem do banco).
 * `tutorClosed`: o Tutor está fechado para essa pessoa? Se o Tutor está aberto (chave do Tutor desligada pelo dono, ou teste do Tutor ainda
 * valendo), o aviso não diz que ele é pago.
 */
export function lockNotice(state, tutorClosed = true) {
  const rest = tutorClosed
    ? `Os simulados completos, o Tutor e as estações Pro fazem parte dos planos pagos; ${KEEP_OPEN}`
    : `Os simulados completos e as estações Pro fazem parte dos planos pagos; ${KEEP_OPEN}`;
  if (state === "teste_acabou") return { title: "Seu teste grátis terminou", text: rest };
  if (state === "plano_acabou") return { title: "Seu plano pago terminou", text: rest };
  if (state === "sem_teste") return { title: "Você está no acesso gratuito", text: rest };
  return null;
}

/**
 * O aviso da pessoa logada, perguntando ao banco (app_my_access). null enquanto carrega, para equipe/revisor, para quem tem acesso e
 * quando o banco não responde (banco ainda sem a regra): nesses casos a tela fica como antes.
 */
export function usePlanLock() {
  const { backend, boot } = useSession();
  const [lock, setLock] = React.useState(null);
  const sub = boot?.subscription;
  const skip = !backend || !boot || hasFullAccess(boot);
  const key = [sub?.plan, sub?.status, sub?.trial_ends_at, sub?.current_period_end, boot?.has_pro].join("|");
  React.useEffect(() => {
    setLock(null); // o plano mudou: o aviso antigo sai da tela até o banco responder de novo
    if (skip) return undefined;
    let alive = true;
    Promise.resolve()
      .then(() => backend.rpc("app_my_access"))
      .then((r) => alive && setLock(r?.locked ? lockNotice(r.state, r.tutor_closed !== false) : null))
      .catch(() => alive && setLock(null));
    return () => {
      alive = false;
    };
  }, [backend, skip, key]);
  return lock;
}

/** O banco recusou por falta de plano pago (mensagem de simulado_gate)? */
export const isPlanLockMessage = (message) => /planos pagos/.test(String(message ?? ""));

const PLAN_LABEL = { trial: "Teste grátis", pro: "Plano Pro", elite: "Plano Elite" };
const dateBR = (iso) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

/** A situação do plano da pessoa em uma frase curta (Conta e tela de Planos). null quando não há assinatura registrada. */
export function planStatusLabel(subscription, role, reviewer = false) {
  if (isStaffRole(role)) return "Equipe · acesso completo";
  if (reviewer) return "Revisor médico · acesso completo";
  if (!subscription) return null;
  const label = PLAN_LABEL[subscription.plan] ?? subscription.plan;
  // cadastro sem teste grátis (PL06): conta gratuita, sem plano pago
  if (subscription.plan === "trial" && subscription.status === "expired" && !subscription.trial_ends_at) return "Acesso gratuito";
  if (trialLapsed(subscription)) return `${label} · encerrado`;
  if (subscription.status === "trialing" && subscription.trial_ends_at) return `${label} até ${dateBR(subscription.trial_ends_at)}`;
  // plano pago depois de "Plano pago até" (com pagamento pendente, depois dos 3 dias de tolerância) já não dá acesso
  if (subscription.status === "canceled" || subscription.status === "expired" || paidPlanLapsed(subscription)) return `${label} · encerrado`;
  if (subscription.status === "past_due") return `${label} · pagamento pendente`;
  return label;
}

/** O plano da pessoa vale agora (teste dentro do prazo ou plano pago em dia)? É só para destacar o cartão do plano: quem decide o acesso é o banco. */
export function currentPlanCode(subscription, role, reviewer = false) {
  if (!subscription || isStaffRole(role) || reviewer) return null;
  if (subscription.plan === "trial" && subscription.status === "expired") return null;
  if (trialLapsed(subscription)) return null;
  if (subscription.status === "canceled" || subscription.status === "expired" || paidPlanLapsed(subscription)) return null;
  return subscription.plan;
}
