// Quanto das Questões Inéditas o plano do aluno libera ("20 de 74 liberadas no seu plano"). Mostra o TOTAL existente, o que está
// liberado e o convite para conhecer os planos; não mostra preço (a assinatura pelo app ainda não existe) nem nada de conteúdo.
import React from "react";
import { Button, ProgressBar } from "../../ds";

/** Há limite de plano para este aluno (nem equipe, nem plano com "todas") e a opção está aberta? */
export const isIneditasLimited = (ineditas) => Boolean(ineditas && ineditas.limited === true && ineditas.locked !== true && Number(ineditas.total) > 0);

/** "20 de 74 liberadas no seu plano" */
export function quotaText(ineditas) {
  return `${ineditas.released} de ${ineditas.total} liberadas no seu plano`;
}

export function IneditasQuota({ ineditas, onPlans }) {
  const restante = Math.max(0, Number(ineditas.total) - Number(ineditas.released));
  const respondidas = Number(ineditas.answered) || 0;
  const acabou = Number(ineditas.released) > 0 && respondidas >= Number(ineditas.released);
  return (
    <div
      role="group"
      aria-label="Questões Inéditas liberadas no seu plano"
      style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: 16, border: "1px solid var(--border-default)", background: "var(--surface-sunken)" }}
    >
      <ProgressBar
        label={quotaText(ineditas)}
        valueLabel={`${respondidas} ${respondidas === 1 ? "respondida" : "respondidas"}`}
        value={Math.min(respondidas, Number(ineditas.released) || 0)}
        max={Math.max(Number(ineditas.released) || 0, 1)}
      />
      <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        {acabou ? "Você respondeu todas as Questões Inéditas liberadas no seu plano. " : ""}
        {restante > 0
          ? `As outras ${restante} ${restante === 1 ? "está bloqueada" : "estão bloqueadas"} e ${restante === 1 ? "abre" : "abrem"} em um plano com mais acesso. Conheça os planos para liberar.`
          : ""}
      </div>
      {restante > 0 && onPlans && (
        <div>
          <Button size="sm" variant="secondary" icon="crown" onClick={onPlans}>
            Conhecer os planos
          </Button>
        </div>
      )}
    </div>
  );
}
