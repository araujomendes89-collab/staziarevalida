import React from "react";
import { Card, Button, Badge, Icon } from "../../ds";
import { useMobile } from "../Shell.jsx";
import "./fase2.css";

export const PACIENTE_IA_LIGADO = false;

export function Fase2Patient({ go }) {
  const mobile = useMobile();

  return (
    <div className="f2-container" style={{ maxWidth: 760 }}>
      <Card padding={mobile ? 24 : 36} style={{ borderRadius: "var(--radius-2xl)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-4)" }}>
        {/* Ícone ilustrado em destaque */}
        <span
          style={{
            width: 64,
            height: 64,
            borderRadius: "var(--radius-xl)",
            background: "var(--ai-bg)",
            color: "var(--ai-text)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="sparkles" size={32} />
        </span>

        {/* Título e Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "center" }}>
          <h2 style={{ margin: 0, font: "var(--type-h2)", color: "var(--text-primary)" }}>
            Paciente simulado com IA
          </h2>
          <Badge tone="ai" size="sm">
            Em breve
          </Badge>
        </div>

        {/* Parágrafo honesto obrigatório */}
        <p style={{ margin: 0, font: "var(--type-body)", color: "var(--text-secondary)", maxWidth: 540, lineHeight: 1.6 }}>
          Em breve você poderá treinar a anamnese conversando com um paciente simulado. Esta função ainda não está ligada.
        </p>

        {/* Bloco "Como vai funcionar" */}
        <div
          style={{
            width: "100%",
            textAlign: "left",
            marginTop: "var(--space-3)",
            padding: mobile ? "var(--space-4)" : "var(--space-5)",
            borderRadius: "var(--radius-xl)",
            background: "var(--surface-subtle)",
            border: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
            Como vai funcionar
          </span>

          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "var(--radius-sm)",
                background: "var(--surface-card)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                font: "var(--type-label)",
                fontSize: 13,
              }}
            >
              1
            </span>
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-primary)", marginTop: 4 }}>
              Escolha uma estação clínica com caso e queixa do paciente.
            </div>
          </div>

          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "var(--radius-sm)",
                background: "var(--surface-card)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                font: "var(--type-label)",
                fontSize: 13,
              }}
            >
              2
            </span>
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-primary)", marginTop: 4 }}>
              Faça perguntas sobre sintomas, histórico e antecedentes como em uma consulta real.
            </div>
          </div>

          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "var(--radius-sm)",
                background: "var(--surface-card)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                font: "var(--type-label)",
                fontSize: 13,
              }}
            >
              3
            </span>
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-primary)", marginTop: 4 }}>
              Receba respostas orientadas pelo caso e avalie sua condução pelo PEP ao final.
            </div>
          </div>
        </div>

        {/* Botões de direcionamento para funções ativas */}
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", justifyContent: "center", marginTop: "var(--space-2)" }}>
          <Button
            size="lg"
            icon="play"
            onClick={() => go("estacoes")}
            style={{ borderRadius: "var(--radius-pill)" }}
          >
            Treinar uma estação
          </Button>

          <Button
            variant="secondary"
            size="lg"
            icon="list-checks"
            onClick={() => go("peps")}
            style={{ borderRadius: "var(--radius-pill)" }}
          >
            Ver minhas estações
          </Button>
        </div>
      </Card>
    </div>
  );
}
