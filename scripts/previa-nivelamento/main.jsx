import "../../src/novo/ds/styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Nivelamento } from "../../src/novo/app/nivelamento/Nivelamento.jsx";
import { NivelamentoConvite } from "../../src/novo/app/nivelamento/NivelamentoConvite.jsx";
import { SessionProvider, useSession } from "./sessaoSimulada.jsx"; // It is resolved by vite.config.mjs alias, but better import directly to avoid issues in some setups

function AppContent() {
  const session = useSession();
  
  const params = new URLSearchParams(window.location.search);
  const isConvite = params.get("tela") === "convite";

  if (isConvite) {
    return (
      <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
        <h2 style={{ marginBottom: 24 }}>Início (Simulação)</h2>
        <NivelamentoConvite estado={session.boot.nivelamento} go={() => { window.location.href = window.location.pathname; }} />
      </div>
    );
  }

  return (
    <Nivelamento modo="primeira" go={() => { alert("go() chamado"); }} />
  );
}

function App() {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);