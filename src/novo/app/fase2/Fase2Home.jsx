import React from "react";
import { Card, Button, Badge, Icon, EmptyState, StatCard } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { useLoad, Loading, LoadError, dateTimeBR } from "../admin/common.jsx";
import { fase2Api } from "./api.js";
import { AREAS, fmtScore, ORIGIN_LABEL } from "./labels.js";
import "./fase2.css";

export function Fase2Home({ go }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const api = React.useMemo(() => fase2Api(backend), [backend]);

  const { data, loading, error, reload } = useLoad(() => api.overview(), [api]);

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
    stations_total = 0,
    areas = [],
    done_count = 0,
    avg_score10 = null,
    last = null,
    open_attempt = null,
  } = data || {};

  const areaMapCounts = Object.fromEntries(areas.map((a) => [a.area, a.total]));

  return (
    <div className="f2-container">
      {/* Bloco superior: Destaque condicional + Como funciona a 2ª fase */}
      <div className="f2-grid-hero">
        {open_attempt ? (
          <div className="f2-hero-card">
            <span className="f2-hero-overline">Estação em andamento</span>
            <h2 className="f2-hero-title">Continue sua estação</h2>
            <div style={{ font: "var(--type-h4)", color: "var(--text-inverse)" }}>
              {open_attempt.name}
            </div>
            <p className="f2-hero-desc">
              Você tem um treino em andamento. Retome o atendimento ou a avaliação pelo PEP de onde parou.
            </p>
            <div className="f2-hero-actions">
              <Button
                size="lg"
                icon="play"
                onClick={() => go("estacao", { tentativa: open_attempt.id })}
                style={{ borderRadius: "var(--radius-pill)" }}
              >
                Continuar estação
              </Button>
            </div>
          </div>
        ) : stations_total > 0 ? (
          <div className="f2-hero-card">
            <span className="f2-hero-overline">Treino prático</span>
            <h2 className="f2-hero-title">Comece por uma estação</h2>
            <p className="f2-hero-desc">
              Simule os 10 minutos da prova de habilidades clínicas do Revalida. Leia o caso, solicite os impressos e pontue seu atendimento no PEP oficial.
            </p>
            <div className="f2-hero-actions">
              <Button
                size="lg"
                icon="play"
                onClick={() => go("estacoes")}
                style={{ borderRadius: "var(--radius-pill)" }}
              >
                Abrir banco de estações
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState
            icon="clipboard-list"
            title="Ainda não há estações aprovadas"
            description="O catálogo de estações práticas é preenchido após a validação da revisão médica."
          />
        )}

        <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-2xl)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
            Como funciona a 2ª fase
          </span>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", marginTop: "var(--space-1)" }}>
            <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-sunken)",
                  color: "var(--text-brand)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  font: "var(--type-label)",
                }}
              >
                1
              </span>
              <div>
                <div style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>Leia o caso</div>
                <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", marginTop: 2 }}>
                  Cenário de atuação, tarefas do médico e impressos disponíveis.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-sunken)",
                  color: "var(--text-brand)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  font: "var(--type-label)",
                }}
              >
                2
              </span>
              <div>
                <div style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>Atenda em 10 min</div>
                <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", marginTop: 2 }}>
                  Anamnese, exame físico, solicitação de exames e conduta terapêutica.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-sunken)",
                  color: "var(--text-brand)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  font: "var(--type-label)",
                }}
              >
                3
              </span>
              <div>
                <div style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>Pontue pelo PEP</div>
                <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", marginTop: 2 }}>
                  Avalie cada item como adequado, parcialmente adequado ou inadequado.
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Indicadores reais (sem variações inventadas) */}
      <div className="f2-grid-stats">
        <StatCard
          label="Estações feitas"
          value={String(done_count)}
          caption="concluídas até o momento"
          icon="clipboard-check"
          tone="brand"
        />
        <StatCard
          label="Nota média"
          value={fmtScore(avg_score10)}
          caption={avg_score10 != null ? "escala de 0 a 10" : "sem avaliações"}
          icon="target"
          tone={avg_score10 != null && Number(avg_score10) >= 7 ? "success" : "neutral"}
        />
        <StatCard
          label="Estações disponíveis"
          value={String(stations_total)}
          caption="aprovadas pela equipe médica"
          icon="library"
          tone="neutral"
        />
      </div>

      {/* Última estação realizada (quando houver) */}
      {last && (
        <Card padding={mobile ? 18 : 24} style={{ borderRadius: "var(--radius-xl)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
            <div>
              <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>Última estação</span>
              <h3 style={{ margin: "4px 0 0", font: "var(--type-h4)", color: "var(--text-primary)" }}>
                {last.name}
              </h3>
            </div>
            <Button variant="secondary" size="sm" onClick={() => go("peps")}>
              Ver em Meus PEPs
            </Button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "var(--type-label)", color: "var(--text-secondary)" }}>
              <span className="f2-area-dot" style={{ background: `var(--area-${last.area ? (AREAS.find((a) => a.name === last.area)?.color || "clinica") : "clinica"})` }} />
              {last.area}
            </span>
            <Badge tone="neutral" size="sm">
              {ORIGIN_LABEL[last.origin] || "Sozinho"}
            </Badge>
            <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
              {dateTimeBR(last.at)}
            </span>
            <span style={{ marginLeft: "auto", font: "var(--type-h3)", color: Number(last.score10) >= 7 ? "var(--success-text)" : "var(--warning-text)" }}>
              {fmtScore(last.score10)} <span style={{ font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>/ 10</span>
            </span>
          </div>
        </Card>
      )}

      {/* As 5 grandes áreas com contagem real */}
      <Card padding={mobile ? 18 : 24} style={{ borderRadius: "var(--radius-xl)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
          <div>
            <h3 style={{ margin: 0, font: "var(--type-h4)", color: "var(--text-primary)" }}>
              Grandes áreas da prova prática
            </h3>
            <p style={{ margin: "2px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
              Distribuição das estações com revisão médica aprovada.
            </p>
          </div>
          <Button variant="link" onClick={() => go("estacoes")}>
            Ver todas
          </Button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {AREAS.map((a) => {
            const count = areaMapCounts[a.name] || 0;
            return (
              <button
                key={a.name}
                type="button"
                className="f2-pep-row"
                onClick={() => go("estacoes")}
                aria-label={`${a.name}: ${count} estações`}
              >
                <span className="f2-area-strip" style={{ background: `var(${a.token})` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>{a.name}</div>
                  <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                    {count === 1 ? "1 estação aprovada" : `${count} estações aprovadas`}
                  </div>
                </div>
                <Icon name="chevron-right" size={18} style={{ color: "var(--text-tertiary)" }} />
              </button>
            );
          })}
        </div>
      </Card>

      {/* Atalhos principais da 2ª fase */}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-4)" }}>
        <Card
          interactive
          padding={20}
          style={{ borderRadius: "var(--radius-lg)", cursor: "pointer" }}
          onClick={() => go("estacoes")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
            <span style={{ width: 36, height: 36, borderRadius: "var(--radius-md)", background: "var(--surface-sunken)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-primary)" }}>
              <Icon name="clipboard-list" size={20} />
            </span>
            <div style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>Banco de estações</div>
          </div>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            Filtre por especialidade, tema e status de realização.
          </div>
        </Card>

        <Card
          interactive
          padding={20}
          style={{ borderRadius: "var(--radius-lg)", cursor: "pointer" }}
          onClick={() => go("peps")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
            <span style={{ width: 36, height: 36, borderRadius: "var(--radius-md)", background: "var(--surface-sunken)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-primary)" }}>
              <Icon name="list-checks" size={20} />
            </span>
            <div style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>Meus PEPs</div>
          </div>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            Histórico das estações avaliadas e pontos perdidos.
          </div>
        </Card>

        <Card
          interactive
          padding={20}
          style={{ borderRadius: "var(--radius-lg)", cursor: "pointer" }}
          onClick={() => go("teoria2")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
            <span style={{ width: 36, height: 36, borderRadius: "var(--radius-md)", background: "var(--surface-sunken)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-primary)" }}>
              <Icon name="book-open" size={20} />
            </span>
            <div style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>Teoria para a prática</div>
          </div>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            Conexão entre a teoria da 1ª fase e as habilidades do PEP.
          </div>
        </Card>

        <Card
          interactive
          padding={20}
          style={{ borderRadius: "var(--radius-lg)", cursor: "pointer" }}
          onClick={() => go("paciente")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
            <span style={{ width: 36, height: 36, borderRadius: "var(--radius-md)", background: "var(--ai-bg)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--ai-text)" }}>
              <Icon name="sparkles" size={20} />
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>Paciente simulado</span>
              <Badge tone="ai" size="sm">Em breve</Badge>
            </div>
          </div>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            Treine a consulta e anamnese com inteligência artificial.
          </div>
        </Card>
      </div>
    </div>
  );
}
