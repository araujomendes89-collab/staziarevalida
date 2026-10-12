// Custo estimado antes de gastar: chamadas, dólares (ou "desconhecido"), IAs, teto e o que falta configurar.
import React from "react";
import { Banner } from "../../../../ds";
import { usd } from "./labels.js";

export function CostBox({ estimate }) {
  if (!estimate) return null;
  const range = estimate.usd_min == null ? null : estimate.usd_min === estimate.usd_max ? usd(estimate.usd_max) : `${usd(estimate.usd_min)} a ${usd(estimate.usd_max)}`;
  return (
    <div role="status" aria-label="Custo estimado" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ font: "var(--type-body-sm)" }}>
        <strong>
          {estimate.chamadas_min === estimate.chamadas_max ? `${estimate.chamadas_max} chamadas de IA` : `${estimate.chamadas_min} a ${estimate.chamadas_max} chamadas de IA`}
        </strong>
        {" · "}
        {range ? <strong>{range}</strong> : <strong>custo desconhecido</strong>}
        {estimate.sem_preco?.length > 0 && <span> (sem preço cadastrado na Central de IAs para: {estimate.sem_preco.join(", ")})</span>}
      </div>
      <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
        {estimate.ias?.criadora && <>Escreve: {estimate.ias.criadora}. </>}
        {estimate.ias?.conferentes?.length > 0 && <>Confere: {estimate.ias.conferentes.join(", ")}. </>}
        {estimate.teto?.ligado ? <>Tetos da Central ligados{estimate.teto.mensal != null ? ` (mensal ${usd(estimate.teto.mensal)}` : ""}{estimate.teto.por_execucao != null ? `${estimate.teto.mensal != null ? ", " : " ("}por execução ${usd(estimate.teto.por_execucao)}` : ""}{estimate.teto.mensal != null || estimate.teto.por_execucao != null ? ")" : ""}.</> : <>Tetos da Central desligados.</>}
      </div>
      {estimate.ia_pendente?.length > 0 && (
        <Banner tone="warning" title="A IA ainda não está pronta">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {estimate.ia_pendente.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          O pedido entra na fila e as tarefas ficam paradas até a IA ser ligada na Central de IAs.
        </Banner>
      )}
    </div>
  );
}
