// Portão do Treinamento em Dupla: equipe e quem o banco libera (`permitido`) veem a tela; os demais veem o convite do plano.
// A tela nunca decide plano: o que vale é o que app_dupla_access devolveu (useSession().dupla).
import React from "react";
import { LockedFeature } from "../../ds";
import { useSession } from "../session.jsx";
import { isStaffRole, PLAN_LABEL } from "../admin/common.jsx";

/** Pode ver as telas do módulo? Equipe, ou quem o banco libera (`permitido`: plano marcado com a chave ligada, revisor médico). */
export function duplaAllowed(boot, dupla) {
  return isStaffRole(boot?.role) || dupla?.equipe === true || dupla?.permitido === true;
}

/** Primeiro dos planos pagos (Pro, depois Elite) marcado no painel; sem nenhum, "Pro". */
function planOf(access) {
  const marked = Array.isArray(access?.planos) ? access.planos : [];
  const first = ["pro", "elite"].find((plan) => marked.includes(plan)) ?? "pro";
  return PLAN_LABEL[first];
}

/**
 * @param {{ go: (route: string, query?: Record<string, string>) => void, children: React.ReactNode }} props
 */
export function DuplaGate({ go, children }) {
  const { boot, dupla } = useSession();
  if (duplaAllowed(boot, dupla)) return <>{children}</>;
  return (
    <LockedFeature
      title="Praticar em dupla"
      description="Encontre um colega com os mesmos objetivos e treine as estações da 2ª fase."
      plan={planOf(dupla)}
      cta="Ver planos"
      onUpgrade={() => go("planos")}
    />
  );
}
