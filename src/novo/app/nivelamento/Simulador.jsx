import React, { useState } from "react";
import { Button, Icon } from "../../ds";
import { AREAS, EXEMPLO_ESPECIFICACAO, calcularPorContagem, interpretar, avisoIncerteza, nomeArea, fmt1 } from "./calculo.js";
import "./nivelamento.css";

export function Simulador() {
  const [contagens, setContagens] = useState(EXEMPLO_ESPECIFICACAO);

  const atualizar = (areaId, delta) => {
    setContagens((prev) =>
      prev.map((c) => {
        if (c.area !== areaId) return c;
        const acertos = Math.max(0, Math.min(6, c.acertos + delta));
        return { ...c, acertos };
      })
    );
  };

  const restaurar = () => {
    setContagens(EXEMPLO_ESPECIFICACAO);
  };

  const resultado = calcularPorContagem(contagens);

  return (
    <div className="nivelamento-content" style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, margin: 0 }}>Simulador do Nivelamento</h2>
        <Button size="sm" variant="secondary" onClick={restaurar}>
          Restaurar exemplo
        </Button>
      </div>

      <div className="nivelamento-pg-container" style={{ background: "var(--bg-surface)", borderRadius: 12, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Proficiência Estimada
        </div>
        <div className="nivelamento-pg">{fmt1(resultado.score)}%</div>
        <div className="nivelamento-nivel">{resultado.nivel_nome}</div>
        <div className="nivelamento-acertos">
          Acertos {resultado.acertos}/{resultado.total}
        </div>
      </div>

      <div className="nivelamento-simulador-ctrls" style={{ marginBottom: 32 }}>
        {contagens.map((c) => {
          const prof = fmt1(resultado.perfil.find(p => p.area === c.area)?.proficiencia);
          return (
            <div key={c.area} className="nivelamento-simulador-area">
              <div className="nivelamento-simulador-nome">{nomeArea(c.area)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ fontSize: 14, color: "var(--text-secondary)", width: 80, textAlign: "right" }}>
                  {c.acertos} de 6 → {prof}%
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button className="nivelamento-simulador-btn" onClick={() => atualizar(c.area, -1)} disabled={c.acertos === 0}>
                    −
                  </button>
                  <span className="nivelamento-simulador-valor">{c.acertos}</span>
                  <button className="nivelamento-simulador-btn" onClick={() => atualizar(c.area, 1)} disabled={c.acertos === 6}>
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="nivelamento-interpretacao" style={{ marginBottom: 24 }}>
        {interpretar(resultado, { pessoa: "estudante" })}
      </div>

      <div className="nivelamento-aviso">
        <Icon name="info" size={16} style={{ float: "left", marginRight: 8, marginTop: 2 }} />
        {avisoIncerteza(resultado)}
      </div>
    </div>
  );
}
