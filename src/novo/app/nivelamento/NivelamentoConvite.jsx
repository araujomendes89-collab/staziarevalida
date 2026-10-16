import React, { useState, useEffect } from "react";
import { Banner, Button, Card, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { CONVITE } from "./textos.js";

export function NivelamentoConvite({ estado, go }) {
  if (!estado?.convite) return null;

  let textos = null;
  const sit = estado.situacao;

  if (sit === "novo" || sit === "adiado") {
    textos = CONVITE.novo;
  } else if (sit === "bloco1" || sit === "bloco2") {
    textos = CONVITE.andamento(estado.bloco, estado.respondidas, estado.total_bloco);
  } else if (sit === "parcial") {
    textos = CONVITE.parcial(estado.resultado?.nivel, estado.resultado?.nivel_nome);
  } else {
    return null; // concluido or null
  }

  if (!textos) return null;

  const handleAction = () => go("nivelamento");

  return (
    <Card padding={24} style={{ marginBottom: 24, border: "2px solid var(--action-primary)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ padding: 12, background: "var(--bg-surface)", borderRadius: "50%", color: "var(--action-primary)" }}>
          <Icon name="crosshair" size={24} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: "0 0 4px 0", fontSize: 18, color: "var(--text-primary)" }}>{textos.titulo}</h3>
          <p style={{ margin: "0 0 16px 0", fontSize: 14, color: "var(--text-secondary)" }}>{textos.texto}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {sit === "parcial" ? (
              <>
                <Button size="sm" onClick={handleAction}>{textos.botao}</Button>
                <Button size="sm" variant="secondary" onClick={handleAction}>{textos.ver}</Button>
              </>
            ) : (
              <Button size="sm" onClick={handleAction}>{textos.botao}</Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
