// Prévia (porta 31992): o painel de verdade (src/novo/app/admin/VoiceReactionsPanel.jsx) com a sessão simulada.
//   ?tema=escuro   tema escuro
import React from "react";
import { createRoot } from "react-dom/client";
import "../../../src/novo/ds/styles.css";
import { VoiceReactionsPanel } from "../../../src/novo/app/admin/VoiceReactionsPanel.jsx";

function Harness() {
  const params = new URLSearchParams(location.search);
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
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 48px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1px dashed var(--border-default)", borderRadius: 12, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        <span>PRÉVIA · dados de teste, nada é gravado no banco · Administração › Vozes do Nexus</span>
        <button type="button" className="sm-btn sm-btn--secondary sm-btn--sm" onClick={() => setTema(tema === "dark" ? "light" : "dark")}>{tema === "dark" ? "Tema claro" : "Tema escuro"}</button>
      </div>
      <VoiceReactionsPanel />
      {ultimo && (
        <details open style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          <summary>O que o painel mandaria ao banco (último “Salvar”)</summary>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{JSON.stringify(ultimo, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
