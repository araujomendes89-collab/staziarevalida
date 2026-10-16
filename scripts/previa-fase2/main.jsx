// PRÉVIA da 2ª fase (porta 31983): telas reais conversando com um Postgres de teste em memória (servidor-banco.mjs, porta 31984).
//   /tela.html?t=home|teoria|estacoes|estacao|peps|paciente|desempenho  [&id=<estacao>] [&tentativa=<id>] [&db=dados|vazio] [&tema=escuro]
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "../../src/novo/ds/styles.css";
import { Fase2Home } from "../../src/novo/app/fase2/Fase2Home.jsx";
import { Fase2Theory } from "../../src/novo/app/fase2/Fase2Theory.jsx";
import { Fase2Stations } from "../../src/novo/app/fase2/Fase2Stations.jsx";
import { Fase2Player } from "../../src/novo/app/fase2/Fase2Player.jsx";
import { Fase2Peps } from "../../src/novo/app/fase2/Fase2Peps.jsx";
import { Fase2Patient } from "../../src/novo/app/fase2/Fase2Patient.jsx";
import { Fase2Performance } from "../../src/novo/app/fase2/Fase2Performance.jsx";

const params = new URLSearchParams(location.search);
const tela = params.get("t") || "home";
document.documentElement.dataset.theme = params.get("tema") === "escuro" ? "dark" : "light";

const ROTAS = { home2: "home", teoria2: "teoria", estacoes: "estacoes", estacao: "estacao", peps: "peps", paciente: "paciente", desempenho2: "desempenho" };
function go(route, query = {}) {
  const next = new URLSearchParams();
  ["db", "tema"].forEach((k) => params.get(k) && next.set(k, params.get(k)));
  if (!ROTAS[route]) { location.href = "/"; return; }
  next.set("t", ROTAS[route]);
  Object.entries(query).forEach(([k, v]) => next.set(k, v));
  location.href = "/tela.html?" + next.toString();
}

const faixa = { position: "sticky", top: 0, zIndex: 50, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 16px", background: "#fff3cd", color: "#5c4400", font: "600 13px system-ui, sans-serif", borderBottom: "1px solid #e0c36a" };
function Faixa() {
  const outro = new URLSearchParams(params); outro.set("db", params.get("db") === "dados" ? "vazio" : "dados");
  const noite = new URLSearchParams(params); noite.set("tema", params.get("tema") === "escuro" ? "claro" : "escuro");
  return (
    <div style={faixa}>
      <span>PRÉVIA · DADOS DE TESTE ({params.get("db") === "dados" ? "com dados" : "banco vazio"}): nada aqui é real. Só no seu computador.</span>
      <a href="/" style={{ color: "inherit" }}>Índice</a>
      <a href={"/tela.html?" + outro} style={{ color: "inherit" }}>Trocar {params.get("db") === "dados" ? "para vazio" : "para com dados"}</a>
      <a href={"/tela.html?" + noite} style={{ color: "inherit" }}>Modo noite</a>
    </div>
  );
}

const TELAS = { home: Fase2Home, teoria: Fase2Theory, estacoes: Fase2Stations, estacao: Fase2Player, peps: Fase2Peps, paciente: Fase2Patient, desempenho: Fase2Performance };
const Tela = TELAS[tela] || Fase2Home;
const cheia = tela === "estacao";
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Faixa />
    <div style={{ padding: cheia ? 0 : "20px 24px", maxWidth: cheia ? "none" : 1180, margin: "0 auto", background: "var(--bg-app)", minHeight: "100vh" }}>
      <Tela go={go} />
    </div>
  </BrowserRouter>
);
