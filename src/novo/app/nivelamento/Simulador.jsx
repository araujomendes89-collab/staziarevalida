// Simulador do nivelamento (seção 4 da especificação do dono): a equipe muda os acertos de cada área (0 a 6) e vê a conta ao vivo.
// Mesmo visual das telas do aluno (quadros, azulejos, anel e régua dos níveis). Ferramenta de conferência: não grava nada.
import React, { useState } from "react";
import { Badge, Button, Icon } from "../../ds";
import { AreaTile, Panel } from "../evolucao/ui.jsx";
import { areaOf } from "../practice/format.js";
import { EXEMPLO_ESPECIFICACAO, calcularPorContagem, interpretar, avisoIncerteza, nomeArea, fmt1 } from "./calculo.js";
import { Anel, Regua } from "./NivelamentoTelas.jsx";
import "../review/desempenho.css";
import "./nivelamento.css";

export function Simulador() {
  const [contagens, setContagens] = useState(EXEMPLO_ESPECIFICACAO);

  const atualizar = (areaId, delta) => {
    setContagens((prev) =>
      prev.map((c) => (c.area !== areaId ? c : { ...c, acertos: Math.max(0, Math.min(c.total, c.acertos + delta)) }))
    );
  };

  const resultado = calcularPorContagem(contagens);
  const insuficiente = resultado.status === "DADOS_INSUFICIENTES" || resultado.score == null;

  return (
    <div className="ev nv nv--primeira">
      <main className="nv-wrap">
        <div className="nv-head">
          <span className="nv-head__text">
            <span className="nv-head__over">Equipe · conferência da conta</span>
            <h1 className="nv-head__title">Simulador do nivelamento</h1>
          </span>
          <Button size="sm" variant="secondary" icon="rotate-ccw" onClick={() => setContagens(EXEMPLO_ESPECIFICACAO)}>
            Restaurar exemplo
          </Button>
        </div>

        <div className="nv-sim">
          <Panel className="nv-sim__ctrls" aria-label="Acertos por área">
            <h2 className="ev-h2">Acertos por grande área</h2>
            {contagens.map((c) => {
              const area = resultado.perfil.find((p) => p.area === c.area);
              const tom = areaOf(c.area)?.tone;
              return (
                <div key={c.area} className="nv-sim__row">
                  <AreaTile area={c.area} size={40} />
                  <span className="nv-sim__name">
                    <span className="dp-area__top">
                      <b>{nomeArea(c.area)}</b>
                      <span className="dp-area__val">
                        <strong className="ev-mono">{fmt1(area?.proficiencia)}</strong>
                      </span>
                    </span>
                    <span className="dp-bar">
                      <span style={{ width: `${Math.max(0, Math.min(100, area?.proficiencia ?? 0))}%`, background: tom ? `var(${tom})` : "var(--action-primary)" }} />
                    </span>
                  </span>
                  <span className="nv-sim__step">
                    <button type="button" className="nv-sim__btn" onClick={() => atualizar(c.area, -1)} disabled={c.acertos === 0} aria-label={`Menos um acerto em ${nomeArea(c.area)}`}>
                      −
                    </button>
                    <span className="nv-sim__val">
                      {c.acertos}/{c.total}
                    </span>
                    <button type="button" className="nv-sim__btn" onClick={() => atualizar(c.area, 1)} disabled={c.acertos === c.total} aria-label={`Mais um acerto em ${nomeArea(c.area)}`}>
                      +
                    </button>
                  </span>
                </div>
              );
            })}
          </Panel>

          <div className="nv-sim__side">
            <Panel className="nv-sum" aria-label="Resultado ao vivo">
              {!insuficiente && <Anel valor={resultado.score} tamanho={128} />}
              <div className="nv-sum__body">
                <div className="nv-sum__top">
                  <span className="nv-sum__over">Proficiência estimada</span>
                  <Badge tone="warning" size="sm">
                    Provisório
                  </Badge>
                </div>
                {!insuficiente && (
                  <>
                    <p className="nv-sum__level">{`Nível ${resultado.nivel} · ${resultado.nivel_nome}`}</p>
                    <Regua nivel={resultado.nivel} />
                  </>
                )}
                <p className="nv-sum__text">
                  Acertos brutos: <b className="ev-mono">{resultado.acertos}/{resultado.total}</b> ({fmt1(resultado.percentual_bruto)}%)
                </p>
              </div>
            </Panel>
            <Panel className="nv-card">
              <h2 className="ev-h2">Leitura</h2>
              <p className="nv-sum__text" style={{ margin: 0 }}>
                {interpretar(resultado, { pessoa: "estudante" })}
              </p>
            </Panel>
            <p className="nv-aside nv-aside--box">
              <Icon name="info" size={16} />
              <span>{avisoIncerteza(resultado)}</span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
