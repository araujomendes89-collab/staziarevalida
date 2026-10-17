// Etapa 1: leitura. Cenário e tarefas (sem impressos e sem PEP) e o botão "Iniciar atendimento".
import React from "react";
import { Banner, Button, Card, Icon } from "../../../ds";

export function SoloReading({ attempt, mobile, busy, onBegin }) {
  const [tab, setTab] = React.useState("cenario"); // cenario | tarefas
  const { scene, tasks } = attempt;
  return (
    <>
      <main className="f2-player-content">
        <div role="tablist" aria-label="Leitura da estação" className="f2-solo-tabs">
          {[
            ["cenario", "file-text", "Cenário"],
            ["tarefas", "list-todo", "Tarefas"],
          ].map(([key, icon, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`sm-tab${tab === key ? " sm-tab--active" : ""}`}
              onClick={() => setTab(key)}
            >
              <Icon name={icon} size={16} />
              {label}
            </button>
          ))}
        </div>

        {tab === "cenario" && (
          <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)" }}>
            <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
              Cenário de atuação
            </span>
            <div className="f2-solo-prose" style={{ font: "var(--type-body-lg)" }}>
              {scene || "Nenhum cenário cadastrado para esta estação."}
            </div>
          </Card>
        )}

        {tab === "tarefas" && (
          <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)" }}>
            <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
              Tarefas a serem executadas
            </span>
            <div className="f2-solo-prose" style={{ font: "var(--type-body)" }}>
              {tasks || "Nenhuma tarefa cadastrada para esta estação."}
            </div>
          </Card>
        )}

        <Banner tone="info" icon="info">
          Os impressos aparecem quando você iniciar o atendimento. O PEP só aparece depois que você entregar.
        </Banner>
      </main>

      <div className="f2-player-toolbar" role="toolbar" aria-label="Ações da estação">
        <span className="f2-solo-toolbar-note">Leia o cenário e as tarefas antes de iniciar.</span>
        <Button icon="play" disabled={busy} onClick={onBegin} style={{ borderRadius: "var(--radius-pill)" }}>
          Iniciar atendimento
        </Button>
      </div>
    </>
  );
}
