import React from "react";
import { Card, Button, Badge, Icon } from "../../ds";
import { useMobile } from "../Shell.jsx";
import "./fase2.css";

export function Fase2Theory({ go }) {
  const mobile = useMobile();

  return (
    <div className="f2-container">
      {/* Bloco de Introdução */}
      <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-2xl)" }}>
        <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
          Preparação teórica para habilidades clínicas
        </span>
        <h2 style={{ margin: "var(--space-2) 0 0", font: "var(--type-h3)", color: "var(--text-primary)" }}>
          Teoria para a prática
        </h2>
        <p style={{ margin: "var(--space-3) 0 0", font: "var(--type-body-lg)", color: "var(--text-secondary)", maxWidth: 760, lineHeight: 1.6 }}>
          A prova prática de habilidades clínicas avalia como você traduz o conhecimento médico em atitudes: anamnese estruturada, exame físico dirigido, comunicação clara e tomada de decisão respaldada em protocolos oficiais.
        </p>
      </Card>

      {/* Bloco: Esqueletos, documentos médicos e roteiros */}
      <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: "var(--radius-md)",
                background: "var(--surface-sunken)",
                color: "var(--text-primary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="file-text" size={20} />
            </span>
            <h3 style={{ margin: 0, font: "var(--type-h4)", color: "var(--text-primary)" }}>
              Esqueletos, documentos médicos e roteiros
            </h3>
          </div>

          <Badge tone="warning" size="sm">
            Em preparação
          </Badge>
        </div>

        <p style={{ margin: "var(--space-2) 0 0", font: "var(--type-body)", color: "var(--text-primary)", fontWeight: 500 }}>
          Este material só será publicado depois da revisão médica.
        </p>

        <p style={{ margin: "var(--space-2) 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)", maxWidth: 680, lineHeight: 1.55 }}>
          Roteiros de atendimento, modelos de documentos médicos e listas de checagem ainda não foram publicados.
        </p>
      </Card>

      {/* Bloco: Enquanto isso, estude pela 1ª fase */}
      <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)" }}>
        <div style={{ marginBottom: "var(--space-4)" }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)", color: "var(--text-primary)" }}>
            Enquanto isso, estude pela 1ª fase
          </h3>
          <p style={{ margin: "4px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            O conteúdo da 1ª fase continua valendo como base de estudo para as estações.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3, 1fr)", gap: "var(--space-4)" }}>
          <Card
            interactive
            padding={20}
            style={{ borderRadius: "var(--radius-lg)", cursor: "pointer", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
            onClick={() => go("temas")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", background: "var(--surface-sunken)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-primary)" }}>
                <Icon name="library" size={18} />
              </span>
              <div style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>
                Temas Essenciais
              </div>
            </div>
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", flex: 1 }}>
              Foco nos conteúdos de maior prevalência nas cinco grandes áreas médicas.
            </div>
            <div style={{ marginTop: "var(--space-2)" }}>
              <Button variant="ghost" size="sm" iconRight="chevron-right">
                Abrir temas
              </Button>
            </div>
          </Card>

          <Card
            interactive
            padding={20}
            style={{ borderRadius: "var(--radius-lg)", cursor: "pointer", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
            onClick={() => go("atualizacoes")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", background: "var(--surface-sunken)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-primary)" }}>
                <Icon name="book-open" size={18} />
              </span>
              <div style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>
                Diretrizes e Atualizações
              </div>
            </div>
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", flex: 1 }}>
              PCDTs do Ministério da Saúde e consensos de sociedades brasileiras.
            </div>
            <div style={{ marginTop: "var(--space-2)" }}>
              <Button variant="ghost" size="sm" iconRight="chevron-right">
                Abrir diretrizes
              </Button>
            </div>
          </Card>

          <Card
            interactive
            padding={20}
            style={{ borderRadius: "var(--radius-lg)", cursor: "pointer", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
            onClick={() => go("questoes")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", background: "var(--surface-sunken)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-primary)" }}>
                <Icon name="file-question" size={18} />
              </span>
              <div style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>
                Banco de Questões
              </div>
            </div>
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", flex: 1 }}>
              Treine raciocínio diagnóstico e conduta terapêutica em questões de prova.
            </div>
            <div style={{ marginTop: "var(--space-2)" }}>
              <Button variant="ghost" size="sm" iconRight="chevron-right">
                Abrir questões
              </Button>
            </div>
          </Card>
        </div>
      </Card>

      {/* Bloco: Aplique na prática */}
      <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, font: "var(--type-h4)", color: "var(--text-primary)" }}>
            Aplique na prática
          </h3>
          <p style={{ margin: "4px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)", maxWidth: 520 }}>
            Simule o atendimento completo e avalie sua postura pelo PEP oficial no banco de estações.
          </p>
        </div>

        <Button
          size="lg"
          icon="play"
          onClick={() => go("estacoes")}
          style={{ borderRadius: "var(--radius-pill)" }}
        >
          Banco de estações
        </Button>
      </Card>
    </div>
  );
}
