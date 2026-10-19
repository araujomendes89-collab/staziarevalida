// Treino em Dupla · cota de matches na tela. `CreditHeader` é a faixa do cabeçalho do Praticar; `OwnQuotaLine` é a linha da
// preparação da sala. Os dois mostram só o que o servidor devolveu para o próprio aluno e nada do colega.
import React from "react";
import { Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { CREDIT_LABEL, OWN_QUOTA_EMPTY, renewLabel, useCreditState } from "./credits.js";

/** `credit` vem de `useCreditState`; sem cota ligada (null) não desenha nada. Com zero, usa o tom de atenção do app. */
export function CreditHeader({ credit }) {
  if (!credit) return null;
  const empty = credit.disponivel <= 0;
  const renews = renewLabel(credit.renovaEm);
  return (
    <span
      role="status"
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px", borderRadius: "var(--radius-pill)", font: "600 13px var(--font-sans)",
        background: empty ? "var(--warning-bg)" : "var(--surface-card)", border: `1px solid ${empty ? "var(--warning-border)" : "var(--border-subtle)"}`,
        color: empty ? "var(--warning-text)" : "var(--text-primary)",
      }}
    >
      <Icon name="ticket" size={15} />
      <span>{CREDIT_LABEL}</span>
      <b data-testid="credit-available" style={{ font: "700 13px var(--font-mono)" }}>{credit.disponivel}</b>
      {renews && <span style={{ fontWeight: 500, color: empty ? "var(--warning-text)" : "var(--text-tertiary)" }}>{`· ${renews}`}</span>}
    </span>
  );
}

/** Preparação da sala: só para quem está sem crédito (e só com a cota ligada). Nunca fala do colega. */
export function OwnQuotaLine({ roomId }) {
  const { backend } = useSession();
  const { credit } = useCreditState(backend, [roomId]);
  if (!credit || credit.disponivel > 0) return null;
  return (
    <p role="status" style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--warning-text)" }}>
      {OWN_QUOTA_EMPTY}
    </p>
  );
}
