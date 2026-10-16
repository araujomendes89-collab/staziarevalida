// Prévia (porta 31992), dados de teste, nada vai ao banco:
//   ?tela=painel   Administração › Vozes do Nexus › Reações de voz (o dono)
//   ?tela=aluno    Preferências do Tutor › Jeito da Durona (o aluno), dentro da entrada do Tutor com a Durona escolhida
//   &termo=nao     aluno que ainda não aceitou o Termo com a declaração de 18+ e médico
//   &tema=escuro   tema escuro
import React from "react";
import { createRoot } from "react-dom/client";
import "../../../src/novo/ds/styles.css";
import "../../../src/novo/app/tutor/nexus/nexus.css";
import { VoiceReactionsPanel } from "../../../src/novo/app/admin/VoiceReactionsPanel.jsx";
import { ExplosivaPreferences } from "../../../src/novo/app/tutor/ExplosivaPreferences.jsx";
import { NexusLobby } from "../../../src/novo/app/tutor/nexus/NexusLobby.jsx";

const STATUS = {
  personalities: [
    { id: "tranquilo", name: "Tranquilo", emoji: "🧘", tagline: "calmo, faz você chegar lá" },
    { id: "direto", name: "Direto", emoji: "🎯", tagline: "objetivo e seco" },
    { id: "durona", name: "Durona", emoji: "🔥", tagline: "exigente, sem filtro" },
  ],
  preferences: { personality_id: "durona" },
};

function Harness() {
  const params = new URLSearchParams(location.search);
  const [tela, setTela] = React.useState(params.get("tela") === "aluno" ? "aluno" : "painel");
  const [tema, setTema] = React.useState(params.get("tema") === "escuro" ? "dark" : "light");
  const [ultimo, setUltimo] = React.useState(null);
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    document.body.style.background = "var(--bg-app)";
    document.body.style.color = "var(--text-primary)";
    document.body.style.margin = "0";
  }, [tema]);
  React.useEffect(() => {
    const on = (e) => setUltimo(e.detail);
    window.addEventListener("previa-salvou", on);
    return () => window.removeEventListener("previa-salvou", on);
  }, []);
  const go = (t) => { setTela(t); const u = new URL(location.href); u.searchParams.set("tela", t); history.replaceState(null, "", u); };
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 48px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1px dashed var(--border-default)", borderRadius: 12, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        <span>PRÉVIA · dados de teste, nada é gravado</span>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className={`sm-btn sm-btn--${tela === "painel" ? "primary" : "secondary"} sm-btn--sm`} onClick={() => go("painel")}>Painel do dono</button>
          <button type="button" className={`sm-btn sm-btn--${tela === "aluno" ? "primary" : "secondary"} sm-btn--sm`} onClick={() => go("aluno")}>Tela do aluno</button>
          <button type="button" className="sm-btn sm-btn--secondary sm-btn--sm" onClick={() => setTema(tema === "dark" ? "light" : "dark")}>{tema === "dark" ? "Tema claro" : "Tema escuro"}</button>
        </span>
      </div>
      {tela === "painel" ? (
        <VoiceReactionsPanel />
      ) : (
        <div style={{ marginTop: 16 }}>
          <p style={{ font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>
            Aluno {params.get("termo") === "nao" ? "SEM" : "com"} a declaração de 18+ e médico do Termo ({params.get("termo") === "nao" ? <a href="?tela=aluno">ver com</a> : <a href="?tela=aluno&termo=nao">ver sem</a>}). O quadro só aparece com a Durona escolhida.
          </p>
          <div className="nx">
            <NexusLobby status={STATUS} nexus={null} onStart={() => setUltimo({ comecar: true })} onHistory={() => {}} onListen={() => {}} duronaSettings={<ExplosivaPreferences compact />} />
          </div>
        </div>
      )}
      {ultimo && (
        <details open style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          <summary>O que a tela mandaria ao banco (último “Salvar”)</summary>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{JSON.stringify(ultimo, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
