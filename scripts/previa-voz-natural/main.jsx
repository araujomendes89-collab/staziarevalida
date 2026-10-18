// Prévia da conversa por voz do Tutor: a tela de verdade com servidor, ponte e microfone simulados (simulados.js).
import "./simulados.js";
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../../src/novo/ds/styles.css";
import { NexusScreen } from "../../src/novo/app/tutor/nexus/NexusScreen.jsx";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("tema") === "escuro" ? "dark" : "light";
window.__rotas = [];
createRoot(document.getElementById("root")).render(
  <MemoryRouter>
    <div style={{ minHeight: "100vh", padding: 16, background: "var(--bg-app)" }}>
      <NexusScreen go={(rota, q) => window.__rotas.push({ rota, q })} />
    </div>
  </MemoryRouter>
);
