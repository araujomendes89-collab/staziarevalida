// PRÉVIA do Treinamento em Dupla (porta 31997): dados de teste, sem login e sem banco.
//   /tela.html?t=praticar|perfil|estacoes|sala|vitrine|estacoes-adm|peps|convite  [&sala=<fase>-<papel>] [&estacao=<id>] [&perfil=nenhum]
//     [&convite=1|direto|pedido] [&modo=online (radar)] [&radar=vazio] [&limite=1] [&h=<@> (t=convite)] [&tema=escuro]
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "../../src/novo/ds/styles.css";
import { PracticeScreen } from "../../src/novo/app/dupla/PracticeScreen.jsx";
import { InviteLinkScreen } from "../../src/novo/app/dupla/InviteLinkScreen.jsx";
import { StudyProfileScreen } from "../../src/novo/app/dupla/StudyProfileScreen.jsx";
import { StationsScreen } from "../../src/novo/app/dupla/StationsScreen.jsx";
import { RoomScreen } from "../../src/novo/app/dupla/room/RoomScreen.jsx";
import { Vitrine } from "../../src/novo/app/dupla/Vitrine.jsx";
import { AdminStations } from "../../src/novo/app/admin/AdminPanels.jsx";
import { Fase2Peps } from "../../src/novo/app/fase2/Fase2Peps.jsx";

const params = new URLSearchParams(location.search);
const tela = params.get("t") || "praticar";
document.documentElement.dataset.theme = params.get("tema") === "escuro" ? "dark" : "light";

const ROTAS = { dupla: "praticar", "dupla-perfil": "perfil", estacoes: "estacoes", "dupla-sala": "sala", peps: "peps" };
const KEEP = ["tema", "perfil", "convite", "radar", "limite"];
function go(route, query = {}) {
  if (route === "planos" || !ROTAS[route]) { location.href = "/"; return; }
  const next = new URLSearchParams();
  KEEP.forEach((k) => params.get(k) && next.set(k, params.get(k)));
  next.set("t", ROTAS[route]);
  if (route === "dupla-sala") next.set("sala", query.sala || "roles-candidate");
  else {
    if (query.estacao) next.set("estacao", query.estacao);
    if (query.modo) next.set("modo", query.modo);
  }
  location.href = "/tela.html?" + next.toString();
}

const faixa = {
  position: "sticky", top: 0, zIndex: 50, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 16px",
  background: "#fff3cd", color: "#5c4400", font: "600 13px system-ui, sans-serif", borderBottom: "1px solid #e0c36a",
};
function Faixa() {
  return (
    <div style={faixa}>
      <span>PRÉVIA · DADOS DE TESTE: nenhuma pessoa, nota ou resultado é real. Só no seu computador.</span>
      <a href="/" style={{ color: "inherit" }}>← Índice das telas</a>
      <a href={"/tela.html?" + new URLSearchParams({ ...Object.fromEntries(params), tema: params.get("tema") === "escuro" ? "claro" : "escuro" })} style={{ color: "inherit" }}>Alternar modo noite</a>
    </div>
  );
}

function Tela() {
  if (tela === "perfil") return <StudyProfileScreen go={go} />;
  if (tela === "convite") return <InviteLinkScreen go={go} handle={params.get("h") || "colega.teste1"} stationId={params.get("estacao")} />;
  if (tela === "estacoes") return <StationsScreen go={go} />;
  if (tela === "sala") return <RoomScreen roomId={params.get("sala") || "roles-candidate"} go={go} />;
  if (tela === "vitrine") return <Vitrine />;
  if (tela === "estacoes-adm") return <AdminStations />;
  if (tela === "peps") return <Fase2Peps go={go} />;
  return <PracticeScreen go={go} />;
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Faixa />
    <div style={{ padding: tela === "sala" ? 0 : "20px 24px", maxWidth: tela === "sala" ? "none" : 1180, margin: "0 auto", background: "var(--bg-app)", minHeight: "100vh" }}>
      <Tela />
    </div>
  </BrowserRouter>
);
