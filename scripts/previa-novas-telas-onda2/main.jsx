// PRÉVIA do Início e do Plano de Hoje (onda 2). Dados de TESTE, sem banco. Parâmetros:
//   ?rota=home|hoje  &tema=escuro  &fase=1|2  &papel=aluno|equipe|revisor  &abrir=1 (Personalizar plano aberto)  &vazio=1  &tudofeito=1
//   &arena=0 (Stazia Arena desligada)  &semliga=1 (fora do ranking)  &teste=1 (teste grátis: 20 de 74 inéditas)
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../../src/novo/ds/styles.css";
import { AppShell } from "../../src/novo/app/Shell.jsx";
import { HomeScreen } from "../../src/novo/app/home/HomeScreen.jsx";
import { TodayPlan } from "../../src/novo/app/home/TodayPlan.jsx";
import { useSession } from "./sessaoSimulada.jsx";

const q = new URLSearchParams(location.search);
const papel = q.get("papel") || "aluno";

function Previa() {
  const { updateProfile } = useSession();
  const [nav, setNav] = React.useState({ route: q.get("rota") || "home", query: q.get("abrir") ? { ajustar: "1" } : null });
  const [theme, setTheme] = React.useState(q.get("tema") === "escuro" ? "dark" : "light");
  const [phase, setPhase] = React.useState(Number(q.get("fase")) === 2 ? 2 : 1);
  const [choice, setChoice] = React.useState(q.get("tema") === "escuro" ? "dark" : "light");
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const go = (route, query) => setNav({ route, query: query || null });
  const setT = (next) => {
    setChoice(next);
    setTheme(next === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : next);
    updateProfile({ theme: next });
  };
  const info = { name: "João Paulo Mendes", streakDays: 0, flashcardsDue: 0, onSignOut: () => alert("Sair (prévia)"), isStaff: papel === "equipe", isReviewer: papel === "revisor", radarGraves: 0, themeChoice: choice };
  const h = new Date().getHours();
  const title = nav.route === "home" ? "Boa tarde, João." : "Plano de Hoje";
  const sub = nav.route === "home" ? "Quinta, 15 de outubro" : "Ciclo diário · aprender, praticar, revisar";
  const search = nav.query ? `?${new URLSearchParams(nav.query)}` : "";
  const headerKind = nav.route === "home" ? "inicio" : nav.route === "hoje" ? "plano" : undefined;
  return (
    <MemoryRouter key={nav.route + search} initialEntries={["/" + nav.route + search]}>
      <AppShell route={nav.route} go={go} theme={theme} setTheme={setT} phase={phase} setPhase={setPhase} phase2Locked={papel === "aluno"} info={info} title={title} sub={sub} headerKind={headerKind}>
        {nav.route === "home" ? <HomeScreen go={go} mobile={false} /> : nav.route === "hoje" ? <TodayPlan go={go} /> : <p>Tela: {nav.route} (fora desta prévia)</p>}
      </AppShell>
    </MemoryRouter>
  );
}
createRoot(document.getElementById("root")).render(<Previa />);
