// Convite do nivelamento no Início, no desenho dos cartões do Início (como o de Questões Inéditas, variante "inicio").
import React from "react";
import { Button, Card } from "../../ds";
import { RichIcon } from "../evolucao/ui.jsx";
import { CONVITE, TITULO } from "./textos.js";
import "./nivelamento.css";

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

  const abrir = () => go("nivelamento");
  const andamento = (sit === "bloco1" || sit === "bloco2") && estado.total_bloco > 0;
  const pct = andamento ? Math.round((100 * (estado.respondidas || 0)) / estado.total_bloco) : 0;

  return (
    <Card variant="brand" padding={20} role="region" aria-label={TITULO} style={{ borderRadius: 24, marginBottom: 24 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ flex: "none", width: 48, height: 48, borderRadius: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--surface-card)", boxShadow: "var(--shadow-xs)" }}>
          <RichIcon name="target" size={30} />
        </span>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          {textos.titulo !== TITULO && <span className="sm-overline">{TITULO}</span>}
          <div style={{ font: "700 20px/1.25 var(--font-sans)", letterSpacing: "-0.015em", marginTop: 4, color: "var(--text-primary)" }}>{textos.titulo}</div>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", marginTop: 4 }}>{textos.texto}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Button size="sm" iconRight="arrow-right" onClick={abrir}>
            {textos.botao}
          </Button>
          {sit === "parcial" && textos.ver && (
            <Button size="sm" variant="ghost" onClick={abrir}>
              {textos.ver}
            </Button>
          )}
        </div>
      </div>
      {andamento && (
        <div className="nv-convite__prog" role="progressbar" aria-valuemin={0} aria-valuemax={estado.total_bloco} aria-valuenow={estado.respondidas || 0} aria-label="Questões respondidas">
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
    </Card>
  );
}
