// Prévia navegável: o Shell, a Administração e a Fila do Radar de verdade, com dados simulados e sem login.
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "../../../src/novo/ds/styles.css";
import { Banner } from "../../../src/novo/ds";
import { AppShell } from "../../../src/novo/app/Shell.jsx";
import { AdminScreen } from "../../../src/novo/app/admin/AdminScreen.jsx";
import { RadarAvisoFaixa } from "../../../src/novo/app/admin/radar/RadarAvisoFaixa.jsx";
import { useRadarAvisos } from "../../../src/novo/app/admin/radar/useRadarAvisos.js";
import { useSession } from "../../../src/novo/app/session.jsx";

const p = new URLSearchParams(location.search);
const tema = p.get("tema") === "escuro" ? "dark" : "light";
document.documentElement.dataset.theme = tema;

function Pagina() {
  const { boot } = useSession();
  const radar = useRadarAvisos(boot.role === "admin");
  const rota = p.get("rota") === "home" ? "home" : "admin";
  const go = (r, q) => { const u = new URL(location.href); u.searchParams.set("rota", r === "admin" ? "admin" : "home"); if (q?.aba) u.searchParams.set("aba", q.aba); location.href = u.toString(); };
  return (
    <AppShell route={rota} go={go} theme={tema} setTheme={() => {}} title={rota === "admin" ? "Administração" : "Bom dia, Ana."} sub={rota === "admin" ? "Gestão da plataforma" : "Quinta-feira, 15 de outubro"} phase={1} setPhase={() => {}} info={{ name: "Dra. Ana Souza", streakDays: 4, flashcardsDue: 0, onSignOut: () => {}, isStaff: boot.role !== "student", isReviewer: false, radarGraves: radar.graves }}>
      {rota === "admin" ? <AdminScreen /> : (
        <>
          {boot.role === "admin" && <RadarAvisoFaixa avisos={radar} go={go} />}
          <Banner tone="brand" title="Início do administrador">Aqui entram as demais seções do Início (simuladas fora desta prévia).</Banner>
        </>
      )}
    </AppShell>
  );
}
createRoot(document.getElementById("root")).render(<BrowserRouter><Pagina /></BrowserRouter>);
