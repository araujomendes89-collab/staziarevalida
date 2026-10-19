// PRÉVIA do Treinamento em Dupla (porta 31997): dados de teste, sem login e sem banco.
//   /tela.html?t=praticar|perfil|estacoes|sala|vitrine|estacoes-adm|peps|convite|creditos  [&sala=<fase>-<papel>] [&estacao=<id>] [&perfil=nenhum]
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
import { CreditosHojeView } from "../../src/novo/app/home/CreditosHoje.jsx";
import { modeloCreditosHoje } from "../../src/novo/app/home/creditosHoje.js";
import { Fase2Player } from "../../src/novo/app/fase2/Fase2Player.jsx";
import { AdminDupla } from "../../src/novo/app/admin/AdminDupla.jsx";

const params = new URLSearchParams(location.search);
const tela = params.get("t") || "praticar";
document.documentElement.dataset.theme = params.get("tema") === "escuro" ? "dark" : "light";

const ROTAS = { dupla: "praticar", "dupla-perfil": "perfil", estacoes: "estacoes", "dupla-sala": "sala", peps: "peps", estacao: "sozinho" };
const KEEP = ["tema", "perfil", "convite", "radar", "limite", "ia", "atraso", "funcao", "elite"];
function go(route, query = {}) {
  if (route === "planos" || !ROTAS[route]) { location.href = "/"; return; }
  const next = new URLSearchParams();
  KEEP.forEach((k) => params.get(k) && next.set(k, params.get(k)));
  next.set("t", ROTAS[route]);
  if (route === "dupla-sala") next.set("sala", query.sala || "roles-candidate");
  else if (route === "estacao") { if (query.id) next.set("id", query.id); if (query.tentativa) next.set("tentativa", query.tentativa); }
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

// "Créditos de hoje" no Início do aluno: as três situações lado a lado (dados de teste; o número real vem de app_credit_state).
const E = (extra) => ({ ativa: true, ilimitado: false, limite_dia: 5, usados_hoje: 2, bonus: 0, comprados: 0, disponivel: 3, renova_em: "2026-10-18T03:00:00.000Z", ...extra });
const DESLIGADO = { ativa: false, ilimitado: false, limite_dia: null, usados_hoje: 0, bonus: 0, comprados: 0, disponivel: null };
const SITUACOES = [
  ["Com saldo (e bônus)", modeloCreditosHoje(E({ bonus: 3, disponivel: 6 }), E({ limite_dia: 4, usados_hoje: 1, disponivel: 3 }))],
  ["Esgotado", modeloCreditosHoje(E({ usados_hoje: 5, disponivel: 0 }), E({ limite_dia: 4, usados_hoje: 4, disponivel: 0 }))],
  ["Cota desligada (ou equipe, ou plano sem número): o bloco não aparece", modeloCreditosHoje(DESLIGADO, DESLIGADO)],
];
function Creditos() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <h1 style={{ margin: 0, font: "var(--type-h3)" }}>Início · Créditos de hoje</h1>
      {SITUACOES.map(([titulo, modelo]) => (
        <div key={titulo} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b>{titulo}</b>
          <div style={{ minHeight: 24 }}>{modelo ? <CreditosHojeView modelo={modelo} go={go} /> : <i style={{ color: "var(--text-tertiary)" }}>(nada aparece)</i>}</div>
        </div>
      ))}
    </div>
  );
}

function Tela() {
  if (tela === "creditos") return <Creditos />;
  if (tela === "perfil") return <StudyProfileScreen go={go} />;
  if (tela === "convite") return <InviteLinkScreen go={go} handle={params.get("h") || "colega.teste1"} stationId={params.get("estacao")} />;
  if (tela === "estacoes") return <StationsScreen go={go} />;
  if (tela === "sala") return <RoomScreen roomId={params.get("sala") || "roles-candidate"} go={go} />;
  if (tela === "vitrine") return <Vitrine />;
  if (tela === "estacoes-adm") return <AdminStations />;
  if (tela === "peps") return <Fase2Peps go={go} />;
  if (tela === "sozinho") return <Fase2Player go={go} />;
  if (tela === "painel") return <AdminDupla onOpenIAs={() => alert("Abriria a Central de IAs (prévia).")} />;
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
