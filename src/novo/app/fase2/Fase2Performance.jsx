import React from "react";
import { Card, Button, Badge, EmptyState, StatCard, ProgressBar } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { useLoad, Loading, LoadError, dateBR } from "../admin/common.jsx";
import { fase2Api } from "./api.js";
import { fmtScore, getArea } from "./labels.js";
import "./fase2.css";

export function Fase2Performance({ go }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const api = React.useMemo(() => fase2Api(backend), [backend]);

  const { data, loading, error, reload } = useLoad(() => api.performance(), [api]);

  if (loading) {
    return (
      <div className="f2-container" style={{ padding: "var(--space-6) 0" }}>
        <Loading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="f2-container" style={{ padding: "var(--space-6) 0" }}>
        <LoadError error={error} retry={reload} />
      </div>
    );
  }

  const {
    count = 0,
    avg_score10 = null,
    best_score10 = null,
    by_area = [],
    evolution = [],
    by_phase = [],
    lost_items = [],
  } = data || {};

  if (count === 0) {
    return (
      <div className="f2-container">
        <EmptyState
          icon="chart-column"
          title="Ainda não há estações avaliadas"
          description="Faça uma estação no banco e pontue pelo PEP para visualizar sua evolução prática e estatísticas por grande área."
          action={
            <Button icon="play" onClick={() => go("estacoes")}>
              Iniciar estação
            </Button>
          }
        />
      </div>
    );
  }

  // Ordena cronologicamente os pontos de evolução do mais antigo ao mais novo
  const evoPoints = [...evolution].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  // Dimensões do gráfico SVG
  const svgW = 600;
  const svgH = 220;
  const padL = 40;
  const padR = 30;
  const padT = 25;
  const padB = 35;
  const innerW = svgW - padL - padR;
  const innerH = svgH - padT - padB;

  const getY = (val) => {
    const num = Math.min(10, Math.max(0, Number(val) || 0));
    return padT + innerH - (num / 10) * innerH;
  };

  const getX = (idx, total) => {
    if (total <= 1) return padL + innerW / 2;
    return padL + (idx / (total - 1)) * innerW;
  };

  const polylineCoords = evoPoints
    .map((p, i) => `${getX(i, evoPoints.length)},${getY(p.score10)}`)
    .join(" ");

  return (
    <div className="f2-container">
      {/* StatCards com métricas reais */}
      <div className="f2-grid-stats">
        <StatCard
          label="Estações avaliadas"
          value={String(count)}
          caption="total de treinos concluídos"
          icon="clipboard-check"
          tone="brand"
        />
        <StatCard
          label="Nota média"
          value={fmtScore(avg_score10)}
          caption={avg_score10 != null ? "escala de 0 a 10" : "sem média"}
          icon="target"
          tone={avg_score10 != null && Number(avg_score10) >= 7 ? "success" : "neutral"}
        />
        <StatCard
          label="Melhor nota"
          value={fmtScore(best_score10)}
          caption="sua pontuação máxima no PEP"
          icon="trophy"
          tone={best_score10 != null && Number(best_score10) >= 7 ? "success" : "neutral"}
        />
      </div>

      {/* Nota por grande área */}
      {by_area.length > 0 && (
        <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)" }}>
          <h3 style={{ margin: "0 0 var(--space-4)", font: "var(--type-h4)", color: "var(--text-primary)" }}>
            Nota por grande área
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {by_area.map((a) => {
              const areaInfo = getArea(a.area);
              const scoreNum = Number(a.avg_score10) || 0;
              return (
                <div key={a.area}>
                  <ProgressBar
                    label={`${a.area} (${a.count} ${a.count === 1 ? "estação" : "estações"})`}
                    value={scoreNum}
                    max={10}
                    valueLabel={`${fmtScore(a.avg_score10)} / 10`}
                    height={8}
                    color={`var(${areaInfo.token})`}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Evolução temporal em SVG acessível */}
      {evoPoints.length > 0 && (
        <Card padding={mobile ? 18 : 26} style={{ borderRadius: "var(--radius-xl)" }}>
          <div style={{ marginBottom: "var(--space-3)" }}>
            <h3 style={{ margin: 0, font: "var(--type-h4)", color: "var(--text-primary)" }}>
              Evolução da nota
            </h3>
            <p style={{ margin: "2px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
              Histórico das últimas avaliações no PEP (escala de 0 a 10).
            </p>
          </div>

          <div style={{ width: "100%", overflowX: "auto" }}>
            <svg
              className="f2-chart-svg"
              viewBox={`0 0 ${svgW} ${svgH}`}
              role="img"
              aria-label={`Gráfico de evolução da nota: ${evoPoints.map((p) => `${fmtScore(p.score10)} em ${dateBR(p.at)}`).join(", ")}`}
            >
              <title>Evolução da nota no PEP de 0 a 10</title>
              <desc>Linha de tendência com as notas obtidas nas avaliações recentes.</desc>

              {/* Linhas de grade horizontais e rótulos */}
              {[10, 5, 0].map((gridVal) => {
                const y = getY(gridVal);
                return (
                  <g key={gridVal}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={padL + innerW}
                      y2={y}
                      stroke="var(--border-subtle)"
                      strokeDasharray="none"
                    />
                    <text
                      x={padL - 8}
                      y={y + 4}
                      textAnchor="end"
                      font="var(--font-mono)"
                      fontSize="11"
                      fill="var(--text-tertiary)"
                    >
                      {gridVal}
                    </text>
                  </g>
                );
              })}

              {/* Linha de conexão quando houver mais de 1 ponto */}
              {evoPoints.length > 1 && (
                <polyline
                  points={polylineCoords}
                  fill="none"
                  stroke="var(--action-primary)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Círculos e rótulos de cada ponto */}
              {evoPoints.map((p, i) => {
                const cx = getX(i, evoPoints.length);
                const cy = getY(p.score10);
                return (
                  <g key={i}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={evoPoints.length === 1 ? 7 : 5}
                      fill="var(--surface-card)"
                      stroke="var(--action-primary)"
                      strokeWidth="2.5"
                    />
                    <text
                      x={cx}
                      y={cy - 10}
                      textAnchor="middle"
                      font="var(--font-mono)"
                      fontSize="12"
                      fontWeight="600"
                      fill="var(--text-primary)"
                    >
                      {fmtScore(p.score10)}
                    </text>
                  </g>
                );
              })}

              {/* Rótulos de datas nas extremidades */}
              {evoPoints.length > 0 && (
                <g font="var(--font-sans)" fontSize="11" fill="var(--text-tertiary)">
                  <text x={getX(0, evoPoints.length)} y={svgH - 8} textAnchor="start">
                    {dateBR(evoPoints[0].at)}
                  </text>
                  {evoPoints.length > 1 && (
                    <text
                      x={getX(evoPoints.length - 1, evoPoints.length)}
                      y={svgH - 8}
                      textAnchor="end"
                    >
                      {dateBR(evoPoints[evoPoints.length - 1].at)}
                    </text>
                  )}
                </g>
              )}
            </svg>
          </div>
        </Card>
      )}

      {/* Cartão "Onde você perde pontos" */}
      {(by_phase.length > 0 || lost_items.length > 0) && (
        <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)" }}>
          <div style={{ marginBottom: "var(--space-4)" }}>
            <h3 style={{ margin: 0, font: "var(--type-h4)", color: "var(--text-primary)" }}>
              Onde você perde pontos
            </h3>
            <p style={{ margin: "2px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
              Distribuição de acertos por fase da estação e principais itens pontuados a menos.
            </p>
          </div>

          {/* Barras de fases / domínios do PEP */}
          {by_phase.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: "var(--space-4) var(--space-8)", marginBottom: "var(--space-5)" }}>
              {by_phase.map((phaseItem) => (
                <ProgressBar
                  key={phaseItem.phase}
                  label={phaseItem.phase}
                  value={Number(phaseItem.pct) || 0}
                  max={100}
                  valueLabel={`${fmtScore(phaseItem.pct)}%`}
                  height={8}
                  color={Number(phaseItem.pct) < 70 ? "var(--warning-solid)" : "var(--action-primary)"}
                />
              ))}
            </div>
          )}

          {/* Lista de itens mais perdidos */}
          {lost_items.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border-subtle)" }}>
              <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
                Itens com maior perda acumulada
              </span>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {lost_items.slice(0, 5).map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "var(--space-2) var(--space-3)",
                      borderRadius: "var(--radius-md)",
                      background: "var(--surface-sunken)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        {item.phase && <Badge size="sm">{item.phase}</Badge>}
                        <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                          {item.times === 1 ? "1 ocorrência" : `${item.times} ocorrências`}
                        </span>
                      </div>
                      <div style={{ font: "var(--type-body-sm)", color: "var(--text-primary)" }}>
                        {item.content}
                      </div>
                    </div>

                    <span style={{ font: "var(--type-data)", color: "var(--danger-text)", flexShrink: 0 }}>
                      -{fmtScore(item.lost)} pt
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nota de rodapé obrigatória */}
          <p style={{ margin: "var(--space-4) 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
            Itens detalhados apenas das estações treinadas sozinho.
          </p>
        </Card>
      )}
    </div>
  );
}
