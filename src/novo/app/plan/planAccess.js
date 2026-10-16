// Acesso pago do aluno nas telas (PL02, decisão do dono de 2026-10-11). Quem decide é SEMPRE o banco (…9730_teste_vencido_trava_pago):
// as telas perguntam "app_my_access" e só escolhem o aviso em português. Se o banco ainda não tem essa regra (a função não existe) ou a
// pergunta falha, nenhum aviso aparece e a tela fica como antes: o aviso nunca promete o que o banco não faz. Sem tela de assinatura e sem
// cobrança (a Stripe está parada): os avisos não têm botão de assinar nem falam de pagamento automático ou preço; dizem como pedir
// acesso (contato de suporte da configuração única, B4 da Fase 1).
import React from "react";
import { useSession } from "../session.jsx";
import { dateBR, isStaffRole, paidPlanLapsed, trialLapsed } from "../admin/common.jsx";
import { askForAccess, DEFAULT_SUPPORT_EMAIL, useSupportEmail } from "../support/supportContact.jsx";

/** Equipe (administrador e editor) e revisor médico: acesso completo, sem teste nem plano. */
export const hasFullAccess = (boot) => boot?.role === "admin" || boot?.role === "editor" || Boolean(boot?.reviewer_areas?.length);

const KEEP_OPEN = "as questões e os flashcards continuam abertos.";
/** A frase que o banco e o servidor ainda trazem nas recusas (SQL antigo); a tela troca por "fale com o suporte". */
const OLD_SENTENCE = /\s*A assinatura pelo app ainda não está disponível\./;
/** Mensagem de recusa do banco ou do servidor, sem a frase antiga e com o contato de suporte. */
export const withSupport = (message, email = DEFAULT_SUPPORT_EMAIL) => {
  const text = String(message ?? "");
  return OLD_SENTENCE.test(text) ? `${text.replace(OLD_SENTENCE, "")} ${askForAccess(email)}` : text;
};

/**
 * Aviso para quem não tem acesso ao que é pago (null quando tem). `state`: "teste_acabou", "plano_acabou" ou "sem_teste" (vem do banco).
 * `tutorClosed`: o Tutor está fechado para essa pessoa? Se o Tutor está aberto (chave do Tutor desligada pelo dono, ou teste do Tutor ainda
 * valendo), o aviso não diz que ele é pago.
 */
export function lockNotice(state, tutorClosed = true, email = DEFAULT_SUPPORT_EMAIL) {
  const rest = `${
    tutorClosed
      ? `Os simulados completos, o Tutor e as estações Pro fazem parte dos planos pagos; ${KEEP_OPEN}`
      : `Os simulados completos e as estações Pro fazem parte dos planos pagos; ${KEEP_OPEN}`
  } ${askForAccess(email)}`;
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
  const email = useSupportEmail();
  const [access, setAccess] = React.useState(null);
  const sub = boot?.subscription;
  const skip = !backend || !boot || hasFullAccess(boot);
  const key = [sub?.plan, sub?.status, sub?.trial_ends_at, sub?.current_period_end, boot?.has_pro].join("|");
  React.useEffect(() => {
    setAccess(null); // o plano mudou: o aviso antigo sai da tela até o banco responder de novo
    if (skip) return undefined;
    let alive = true;
    Promise.resolve()
      .then(() => backend.rpc("app_my_access"))
      .then((r) => alive && setAccess(r?.locked ? { state: r.state, tutorClosed: r.tutor_closed !== false } : null))
      .catch(() => alive && setAccess(null));
    return () => {
      alive = false;
    };
  }, [backend, skip, key]);
  return React.useMemo(() => (access ? lockNotice(access.state, access.tutorClosed, email) : null), [access, email]);
}

/** O banco recusou por falta de plano pago (mensagem de simulado_gate)? */
export const isPlanLockMessage = (message) => /planos pagos/.test(String(message ?? ""));

/**
 * "Seu plano" na Conta (B4 da Fase 1): só o que a assinatura do aluno diz. As datas vêm de "Teste grátis até" (trial_ends_at) e
 * "Plano pago até" (current_period_end); nenhum número é inventado. `lead` é o começo da frase e `date` a data (a tela mostra a data em
 * destaque). Equipe (administrador e editor) não tem plano: devolve null (a Conta já mostra o aviso próprio da equipe). Revisor médico
 * tem acesso completo.
 */
export function planSummary(subscription, role, reviewer = false, now = Date.now()) {
  if (role === "admin" || role === "editor") return null;
  if (reviewer) return { lead: "Acesso completo como revisor médico", date: null, note: null };
  const sub = subscription;
  if (!sub) return null;
  const open = "As questões e os flashcards continuam abertos.";
  if (sub.plan === "trial") {
    if (sub.status === "trialing" && sub.trial_ends_at) {
      return trialLapsed(sub, now)
        ? { lead: "Teste grátis encerrado em", date: dateBR(sub.trial_ends_at), note: open }
        : { lead: "Teste grátis até", date: dateBR(sub.trial_ends_at), note: null };
    }
    return { lead: "Sem teste nem plano pago no momento", date: null, note: "As questões e os flashcards estão abertos." };
  }
  const until = sub.current_period_end ? dateBR(sub.current_period_end) : null;
  if (sub.status === "canceled" || sub.status === "expired" || paidPlanLapsed(sub, now)) {
    return { lead: until ? "Plano pago encerrado em" : "Plano pago encerrado", date: until, note: open };
  }
  return { lead: until ? "Plano pago até" : "Plano pago", date: until, note: sub.status === "past_due" ? "Há um pagamento pendente neste plano." : null };
}

const PLAN_LABEL = { trial: "Teste grátis", pro: "Plano Pro", elite: "Plano Elite" };

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
