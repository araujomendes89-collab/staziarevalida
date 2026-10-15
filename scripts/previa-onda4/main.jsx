// PRÉVIA da onda 4 (dados de TESTE, sem banco): ?rota=temas|atualizacoes|mapas|flash  &tema=escuro  &papel=aluno|equipe
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useNavigate } from "react-router-dom";
import "../../src/novo/ds/styles.css";
import { AppShell } from "../../src/novo/app/Shell.jsx";
import { ThemesScreen } from "../../src/novo/app/study/ThemesScreen.jsx";
import { UpdatesScreen } from "../../src/novo/app/study/UpdatesScreen.jsx";
import { MapasScreen } from "../../src/novo/app/mapas/MapasScreen.jsx";
import { FlashcardsScreen } from "../../src/novo/app/review/FlashcardsScreen.jsx";

const q = new URLSearchParams(location.search);
const TITULOS = {
  temas: ["Temas Essenciais", "Aprender · os 100 temas prioritários, com as questões oficiais de cada um"],
  atualizacoes: ["Diretrizes e Atualizações", "Aprender · o que mudou nas condutas e onde conferir"],
  mapas: ["Mapas Mentais", "Aprender · resumos visuais por tema, da revisão rápida ao aprofundado"],
  flash: ["Flashcards", "Revisão espaçada"],
};

function Previa() {
  const [route, setRoute] = React.useState(q.get("rota") || "temas");
  const [theme, setTheme] = React.useState(q.get("tema") === "escuro" ? "dark" : "light");
  const nav = useNavigate();
  React.useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const go = (next, query) => { setRoute(next); nav("/" + next + (query ? `?${new URLSearchParams(query)}` : "")); window.scrollTo(0, 0); };
  const info = { name: "Aluno de Teste", streakDays: 0, flashcardsDue: 5, onSignOut: () => alert("Sair (prévia)"), isStaff: q.get("papel") === "equipe", radarGraves: 0 };
  const [t, s] = TITULOS[route] ?? [route, ""];
  return (
    <AppShell route={route} go={go} theme={theme} setTheme={setTheme} phase={1} setPhase={() => {}} phase2Locked info={info} title={t} sub={s}>
      {route === "temas" && <ThemesScreen go={go} />}
      {route === "atualizacoes" && <UpdatesScreen go={go} />}
      {route === "mapas" && <MapasScreen go={go} />}
      {route === "flash" && <FlashcardsScreen go={go} />}
      {!TITULOS[route] && <p>Prévia: esta tela não faz parte da onda 4.</p>}
    </AppShell>
  );
}
createRoot(document.getElementById("root")).render(<MemoryRouter initialEntries={["/" + (q.get("rota") || "temas")]}><Previa /></MemoryRouter>);
