// ANTES: as telas de maquete da 2ª fase (dados de exemplo e pessoas inventadas), só para comparar com a prévia nova.
//   /antes.html?t=home|teoria|estacoes|peps|paciente|desempenho
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/novo/ds/styles.css";
import { Home2, Stations, Peps, Perf2, SimPatient } from "../../src/novo/prototype/Phase2.jsx";
import { Theory2 } from "../../src/novo/prototype/Theory2.jsx";

const t = new URLSearchParams(location.search).get("t") || "home";
const go = () => {};
const TELAS = {
  home: <Home2 go={go} data="exemplo" mobile={false} />,
  teoria: <Theory2 go={go} />,
  estacoes: <Stations go={go} />,
  peps: <Peps go={go} />,
  paciente: <SimPatient go={go} />,
  desempenho: <Perf2 go={go} data="exemplo" />,
};
createRoot(document.getElementById("root")).render(
  <>
    <div style={{ padding: "8px 16px", background: "#fde2e2", color: "#7a1111", font: "600 13px system-ui" }}>ANTES · maquete com dados de exemplo (pessoas e números inventados)</div>
    <div style={{ padding: "20px 24px", maxWidth: 1180, margin: "0 auto", background: "var(--bg-app)", minHeight: "100vh" }}>{TELAS[t]}</div>
  </>
);
