import React from "react";
import { Card, Button, Badge, Icon, EmptyState, ProgressBar } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { useLoad, Loading, LoadError, dateTimeBR } from "../admin/common.jsx";
import { fase2Api } from "./api.js";
import { fmtScore, getArea, ORIGIN_LABEL } from "./labels.js";
import "./fase2.css";

export function Fase2Peps({ go }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const api = React.useMemo(() => fase2Api(backend), [backend]);

  const { data, loading, error, reload } = useLoad(
    async () => {
      const [pepsList, perfData] = await Promise.all([
        api.peps(100),
        api.performance(),
      ]);
      return { peps: pepsList || [], perf: perfData || {} };
    },
    [api]
  );

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

  const { peps = [], perf = {} } = data || {};
  const { by_phase = [], lost_items = [] } = perf;

  if (peps.length === 0) {
    return (
      <div className="f2-container">
        <EmptyState
          icon="list-checks"
          title="Você ainda não tem estações avaliadas"
          description="Inicie um treino no banco de estações e conclua a avaliação pelo PEP para acompanhar seus resultados aqui."
          action={
            <Button icon="play" onClick={() => go("estacoes")}>
              Ir para o banco de estações
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="f2-container">
      {/* Cabeçalho da Lista de PEPs */}
      <Card padding={mobile ? 16 : 24} style={{ borderRadius: "var(--radius-xl)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
          <div>
            <h2 style={{ margin: 0, font: "var(--type-h3)", color: "var(--text-primary)" }}>
              Meus PEPs
            </h2>
            <p style={{ margin: "2px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
              {peps.length === 1 ? "1 estação avaliada" : `${peps.length} estações avaliadas`}
            </p>
          </div>

          <Button variant="secondary" size="sm" icon="plus" onClick={() => go("estacoes")}>
            Nova estação
          </Button>
        </div>

        {/* Lista de avaliações */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {peps.map((row, idx) => {
            const areaInfo = getArea(row.area);
            const isSolo = row.origin === "solo";
            const scoreNum = Number(row.score10);
            const isPassing = !Number.isNaN(scoreNum) && scoreNum >= 7;

            return (
              <div
                key={row.id || idx}
                style={{
                  borderTop: idx > 0 ? "1px solid var(--border-subtle)" : "none",
                  paddingTop: idx > 0 ? "var(--space-2)" : 0,
                }}
              >
                <button
                  type="button"
                  className="f2-pep-row"
                  disabled={!isSolo}
                  onClick={() => isSolo && go("estacao", { tentativa: row.id })}
                  aria-label={`${row.name} - ${row.area} - Nota ${fmtScore(row.score10)}`}
                  title={!isSolo ? "Resultado da sala em dupla" : "Ver PEP detalhado"}
                >
                  {/* Faixa lateral colorida da área */}
                  <span className="f2-area-strip" style={{ background: `var(${areaInfo.token})` }} />

                  {/* Nome da estação e metadados */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "var(--type-label)", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                      <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                        {row.area}
                      </span>
                      <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>·</span>
                      <Badge tone={isSolo ? "neutral" : "info"} size="sm">
                        {ORIGIN_LABEL[row.origin] || "Sozinho"}
                      </Badge>
                      <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>·</span>
                      <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                        {dateTimeBR(row.at)}
                      </span>
                      {!isSolo && (
                        <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", fontStyle: "italic" }}>
                          (Resultado da sala em dupla)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Nota */}
                  <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                    <span
                      style={{
                        font: "var(--type-h3)",
                        color: isPassing ? "var(--success-text)" : "var(--warning-text)",
                      }}
                    >
                      {fmtScore(row.score10)}
                    </span>
                    {isSolo ? (
                      <Icon name="chevron-right" size={18} style={{ color: "var(--text-tertiary)" }} />
                    ) : (
                      <span style={{ width: 18 }} />
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Cartão "Onde você perde pontos" (se houver dados) */}
      {(by_phase.length > 0 || lost_items.length > 0) && (
        <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)" }}>
          <div style={{ marginBottom: "var(--space-4)" }}>
            <h3 style={{ margin: 0, font: "var(--type-h4)", color: "var(--text-primary)" }}>
              Onde você perde pontos
            </h3>
            <p style={{ margin: "2px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
              Desempenho por domínio e itens recorrentes com perda de pontuação nas estações individuais.
            </p>
          </div>

          {/* Barras de fases / domínios do PEP (pior primeiro) */}
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

          {/* Lista de itens com mais pontos perdidos */}
          {lost_items.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border-subtle)" }}>
              <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
                Itens com maior perda de pontuação
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
        </Card>
      )}
    </div>
  );
}
