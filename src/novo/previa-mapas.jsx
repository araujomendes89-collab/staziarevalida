// PRÉVIA (não commitar): shell do aluno com dados simulados, aberto direto em Mapas Mentais. Sem login e sem banco.
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useNavigate } from "react-router-dom";
import "./ds/styles.css";
import { AppShell } from "./app/Shell.jsx";
import { MapasScreen } from "./app/mapas/MapasScreen.jsx";

function Previa() {
  const [route, setRoute] = React.useState("mapas");
  const [theme, setTheme] = React.useState("light");
  const nav = useNavigate();
  React.useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const go = (next, query) => { setRoute(next); nav(next === "mapas" && query ? `/mapas?${new URLSearchParams(query)}` : "/" + next); window.scrollTo(0, 0); };
  return (
    <AppShell route={route} go={go} phase={1} setPhase={() => {}} theme={theme} setTheme={setTheme} info={{ name: "Aluno de prévia", isStaff: false, flashcardsDue: 0 }}>
      {route === "mapas" ? <MapasScreen go={go} /> : <p style={{ padding: 24 }}>Prévia: esta tela não faz parte da demonstração. Volte para "Mapas Mentais" no menu.</p>}
    </AppShell>
  );
}
createRoot(document.getElementById("root")).render(<MemoryRouter initialEntries={["/mapas"]}><Previa /></MemoryRouter>);
