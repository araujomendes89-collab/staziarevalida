// Faixa no Início do administrador: mudanças graves do Radar que esperam a decisão do dono. Sem pendência, não mostra nada.
import React from "react";
import { Banner, Button } from "../../../ds";
import { prazoInfo, tituloAviso } from "./radarFila.js";

export function RadarAvisoFaixa({ avisos, go }) {
  if (!avisos || avisos.graves < 1) return null;
  return (
    <Banner
      tone="danger"
      icon="triangle-alert"
      title={tituloAviso(avisos.graves)}
      action={
        <Button size="sm" variant="secondary" iconRight="arrow-right" onClick={() => go("admin", { aba: "radar" })}>
          Abrir a Fila do Radar
        </Button>
      }
    >
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
        {avisos.itens.slice(0, 3).map((i) => {
          const prazo = prazoInfo({ status: "pendente", prazo_revisao_ate: i.prazo_revisao_ate });
          return (
            <li key={i.evento}>
              <strong>{i.fonte}</strong>
              {i.motivo ? `: ${i.motivo}` : ""}
              {prazo ? ` (${prazo.texto.toLowerCase()})` : ""}
            </li>
          );
        })}
      </ul>
      {avisos.graves > 3 && <p style={{ margin: "6px 0 0" }}>E mais {avisos.graves - 3} na fila.</p>}
    </Banner>
  );
}
