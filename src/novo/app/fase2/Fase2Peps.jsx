import React from "react";
import { Card, Button, Badge, Banner, Icon, EmptyState, ProgressBar } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { useLoad, Loading, LoadError, dateTimeBR } from "../admin/common.jsx";
import { fase2Api } from "./api.js";
import { fmtScore, getArea, ORIGIN_LABEL, SOURCE_LABEL } from "./labels.js";
import { ResultPhase } from "../dupla/room/ResultPhase.jsx";
import "./fase2.css";

// Treino em Dupla no histórico (decisão do dono de 17/10, migração 013400): cada rodada em que a pessoa foi candidata ou
// avaliadora, inclusive depois de a sala fechar. O nome da estação e a nota só vêm do servidor com o resultado liberado;
// rodada com a revisão da nota pedida e ainda não feita aparece como "Aguardando revisão", sem nome, sem nota e sem abrir.

/** "Estação 8" (sem o nome) enquanto o resultado não está liberado. */
export function duplaStationLabel(station) {
  return typeof station?.number === "number" ? `Estação ${station.number}` : "Estação";
}

/** Nota de 0 a 10 da rodada (a mesma conta do resultado da sala: pontos sobre o máximo). */
function score10(row) {
  const score = Number(row.score);
  const max = Number(row.max_score);
  return row.score == null || !(max > 0) ? null : Math.round((score / max) * 100) / 10;
}

/** Resultado de uma rodada em dupla aberto pelo histórico: o mesmo da sala, só leitura. */
export function DuplaHistoryResult({ api, room, round, onBack }) {
  const { data, loading, error, reload } = useLoad(() => api.duplaHistoryResult(room, round), [api, room, round]);
  if (loading) return <Loading />;
  if (error) {
    return (
      <div className="f2-container" style={{ display: "grid", gap: "var(--space-3)" }}>
        <LoadError error={error} retry={reload} />
        <div>
          <Button variant="ghost" icon="arrow-left" onClick={onBack}>
            Voltar para Meus PEPs
          </Button>
        </div>
      </div>
    );
  }
  return <ResultPhase room={null} result={data} actions={null} readOnly onBack={onBack} />;
}

export function Fase2Peps({ go }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const api = React.useMemo(() => fase2Api(backend), [backend]);
  const [aberto, setAberto] = React.useState(null);

  const { data, loading, error, reload } = useLoad(
    async () => {
      const [pepsList, perfData, dupla] = await Promise.all([
        api.peps(100),
        api.performance(),
        // sem a migração 013400 (ou sem acesso), a lista do treino sozinho continua e um aviso explica
        api.duplaHistory(100).then(
          (rows) => ({ rows: rows || [], error: null }),
          (error) => ({ rows: [], error })
        ),
      ]);
      return { peps: pepsList || [], perf: perfData || {}, dupla };
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

  if (aberto) {
    return <DuplaHistoryResult api={api} room={aberto.room_id} round={aberto.round} onBack={() => setAberto(null)} />;
  }

  const { perf = {}, dupla = { rows: [], error: null } } = data || {};
  const { by_phase = [], lost_items = [] } = perf;
  // treino sozinho pelo app_fase2_peps; em dupla pelo histórico novo (as duas pontas, com a revisão da nota)
  const peps = [
    ...(data?.peps || []).filter((row) => row.origin === "solo").map((row) => ({ kind: "solo", at: row.at, row })),
    ...dupla.rows.map((row) => ({ kind: "dupla", at: row.finished_at, row })),
  ].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));

  if (peps.length === 0 && !dupla.error) {
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
      {dupla.error && <Banner tone="warning">Não foi possível carregar os treinos em dupla agora. Os treinos sozinho estão abaixo.</Banner>}
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
          {peps.map((entry, idx) => (
            <div
              key={entry.kind === "solo" ? entry.row.id || idx : `${entry.row.room_id}-${entry.row.round}`}
              style={{
                borderTop: idx > 0 ? "1px solid var(--border-subtle)" : "none",
                paddingTop: idx > 0 ? "var(--space-2)" : 0,
              }}
            >
              {entry.kind === "solo" ? (
                <SoloRow row={entry.row} go={go} />
              ) : (
                <DuplaRow row={entry.row} onOpen={() => setAberto({ room_id: entry.row.room_id, round: entry.row.round })} />
              )}
            </div>
          ))}
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

/** Linha do treino sozinho (abre o PEP detalhado). */
function SoloRow({ row, go }) {
  const areaInfo = getArea(row.area);
  const scoreNum = Number(row.score10);
  const isPassing = !Number.isNaN(scoreNum) && scoreNum >= 7;
  return (
    <button
      type="button"
      className="f2-pep-row"
      onClick={() => go("estacao", { tentativa: row.id })}
      aria-label={`${row.name} - ${row.area} - Nota ${fmtScore(row.score10)}`}
      title="Ver PEP detalhado"
    >
      <span className="f2-area-strip" style={{ background: `var(${areaInfo.token})` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--type-label)", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {row.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
          <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{row.area}</span>
          <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>·</span>
          <Badge tone="neutral" size="sm">
            {ORIGIN_LABEL.solo}
          </Badge>
          {SOURCE_LABEL[row.source] && <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{SOURCE_LABEL[row.source]}</span>}
          <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>·</span>
          <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{dateTimeBR(row.at)}</span>
        </div>
      </div>
      <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <span style={{ font: "var(--type-h3)", color: isPassing ? "var(--success-text)" : "var(--warning-text)" }}>{fmtScore(row.score10)}</span>
        <Icon name="chevron-right" size={18} style={{ color: "var(--text-tertiary)" }} />
      </div>
    </button>
  );
}

/** Linha de uma rodada em dupla: liberada abre o resultado (só leitura); aguardando revisão fica fechada, sem nome e sem nota. */
function DuplaRow({ row, onOpen }) {
  const station = row.station || {};
  const areaInfo = getArea(station.area);
  const released = row.status === "concluida";
  const title = released && station.name ? station.name : duplaStationLabel(station);
  const nota = released ? score10(row) : null;
  const isPassing = nota != null && nota >= 7;
  const partner = row.partner?.public_name;
  const papel = row.role === "candidate" ? (partner ? `Avaliado por ${partner}` : "Você foi o candidato") : partner ? `Você avaliou ${partner}` : "Você foi o avaliador";
  const meta = { font: "var(--type-caption)", color: "var(--text-tertiary)" };
  return (
    <button
      type="button"
      className="f2-pep-row"
      disabled={!released}
      onClick={() => released && onOpen()}
      aria-label={released ? `${title} - ${station.area || ""} - Nota ${fmtScore(nota)}` : `${title} - ${station.area || ""} - Aguardando revisão da nota`}
      title={released ? "Ver o resultado da rodada" : "A revisão da nota foi pedida e ainda não foi feita"}
    >
      <span className="f2-area-strip" style={{ background: `var(${areaInfo.token})` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--type-label)", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
          {station.area && (
            <>
              <span style={meta}>{station.area}</span>
              <span style={meta}>·</span>
            </>
          )}
          <Badge tone="info" size="sm">
            {ORIGIN_LABEL.dupla}
          </Badge>
          <span style={meta}>·</span>
          <span style={meta}>{papel}</span>
          <span style={meta}>·</span>
          <span style={meta}>{dateTimeBR(row.finished_at)}</span>
          {!released && (
            <Badge tone="warning" size="sm">
              Aguardando revisão
            </Badge>
          )}
          {released && row.revised && (
            <Badge tone="success" size="sm">
              Nota revisada
            </Badge>
          )}
        </div>
      </div>
      <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <span style={{ font: "var(--type-h3)", color: !released ? "var(--text-tertiary)" : isPassing ? "var(--success-text)" : "var(--warning-text)" }}>
          {released ? fmtScore(nota) : "—"}
        </span>
        {released ? <Icon name="chevron-right" size={18} style={{ color: "var(--text-tertiary)" }} /> : <span style={{ width: 18 }} />}
      </div>
    </button>
  );
}
