// Portão do Treinamento em Dupla: equipe e quem o banco libera (`permitido`) veem a tela; os demais veem o cadeado com o convite.
// A tela nunca decide plano: o que vale é o que app_dupla_access devolveu (useSession().dupla). Desde a 014220 o banco segue o
// plano por fase (chave "prática": PRÁTICA ou ELITE; o PRO é só a 1ª fase) e manda, em `dupla`, a mensagem de compra e os planos
// que liberam, com "à venda" ou "em breve" (até a 2ª fase abrir, só o PRO está à venda).
import React from "react";
import { LockedFeature } from "../../ds";
import { useSession } from "../session.jsx";
import { isStaffRole, PLAN_LABEL } from "../admin/common.jsx";

/** Pode ver as telas do módulo? Equipe, ou quem o banco libera (`permitido`: 2ª fase paga com a chave ligada, revisor médico). */
export function duplaAllowed(boot, dupla) {
  return isStaffRole(boot?.role) || dupla?.equipe === true || dupla?.permitido === true;
}

/**
 * Pode treinar SOZINHO (botão "Sozinho" do Banco de estações e a tela da estação)? Equipe sempre; os demais pelo acesso do
 * banco à 2ª fase (app_dupla_access().fase2, migração 014220): liberado (PRÁTICA/ELITE pagos) ou amostra (teste da 2ª fase,
 * 2ª fase vencida: 1 estação por dia). Chave desligada = o banco diz "trancado" e nada muda para o aluno. Decisão do dono 19/10.
 */
export function soloAllowed(boot, dupla) {
  if (isStaffRole(boot?.role) || dupla?.equipe === true) return true;
  return dupla?.aberto === true && ["liberado", "amostra"].includes(dupla?.fase2?.acesso);
}

/** Planos que liberam o Treino em Dupla (PRÁTICA ou ELITE), com "em breve" quando nenhum está à venda. */
export function planOf(access) {
  const ofertas = Array.isArray(access?.dupla?.ofertas) ? access.dupla.ofertas.filter((o) => o?.tipo === "assinar" && o.nome) : [];
  if (ofertas.length) {
    const nomes = ofertas.map((o) => o.nome).join(" ou ");
    return ofertas.some((o) => o.a_venda === true) ? nomes : `${nomes} · em breve`;
  }
  // banco sem a 014220: a lista "planos" da chave
  const marked = Array.isArray(access?.planos) ? access.planos : [];
  const first = ["pratica", "pro", "elite"].find((plan) => marked.includes(plan)) ?? "pratica";
  return first === "pratica" ? "Prática" : PLAN_LABEL[first];
}

const CONVITE = "Encontre um colega com os mesmos objetivos e treine as estações da 2ª fase.";

/**
 * `sozinho`: a tela também abre para quem só pode treinar sozinho (Banco de estações; a Dupla segue fechada dentro dela).
 * @param {{ go: (route: string, query?: Record<string, string>) => void, children: React.ReactNode, sozinho?: boolean }} props
 */
export function DuplaGate({ go, children, sozinho = false }) {
  const { boot, dupla } = useSession();
  if (duplaAllowed(boot, dupla) || (sozinho && soloAllowed(boot, dupla))) return <>{children}</>;
  const mensagem = typeof dupla?.dupla?.mensagem === "string" ? dupla.dupla.mensagem : "";
  return (
    <LockedFeature
      title="Praticar em dupla"
      description={mensagem ? `${mensagem} ${CONVITE}` : CONVITE}
      plan={planOf(dupla)}
      cta="Ver planos"
      onUpgrade={() => go("planos")}
    />
  );
}
