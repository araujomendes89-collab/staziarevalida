// PRÉVIA da onda 5 (porta 31974): dados de TESTE, sem banco. Parâmetros:
//   ?rota=desempenho|analise|plano|perfil|planos|login  &tema=escuro  &papel=aluno|equipe  &vazio=1  &plano=trial|pro|elite
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/novo/ds/styles.css";
import { AppShell } from "../../src/novo/app/Shell.jsx";
import { PerformanceScreen } from "../../src/novo/app/review/PerformanceScreen.jsx";
import { ReportScreen } from "../../src/novo/app/tutor/ReportScreen.jsx";
import { PlanningScreen } from "../../src/novo/app/home/PlanningScreen.jsx";
import { AccountScreen } from "../../src/novo/app/account/AccountScreen.jsx";
import { PlansScreen } from "../../src/novo/app/plan/PlansScreen.jsx";
import { LoginScreen } from "../../src/novo/app/auth/LoginScreen.jsx";
import { TutorDockProvider } from "../../src/novo/app/tutor/TutorDrawer.jsx";
import { SessionProvider } from "./sessaoSimulada.jsx";

const q = new URLSearchParams(location.search);
const papel = q.get("papel") || "aluno";
const TITLES = {
  plano: ["Planejamento", "Cronograma até a prova"],
  desempenho: ["Desempenho", "Seus dados reais"],
  analise: ["Análise Inteligente", "Minha Evolução · o que o Tutor percebeu nos seus erros e acertos"],
  perfil: ["Minha conta", "Dados, segurança e privacidade"],
  planos: ["Meu plano", "Conta · o que cada plano inclui"],
};


function Previa() {
  const [route, setRoute] = React.useState(q.get("rota") || "desempenho");
  const [theme, setTheme] = React.useState(q.get("tema") === "escuro" ? "dark" : "light");
  React.useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const go = (r) => setRoute(r);
  if (route === "login") return <LoginScreen go={go} />;
  const info = { name: "Aluno de Teste", streakDays: 0, flashcardsDue: 5, onSignOut: () => alert("Sair (prévia)"), isStaff: papel === "equipe", isReviewer: false, radarGraves: 0 };
  const body = { desempenho: <PerformanceScreen go={go} />, analise: <ReportScreen go={go} />, plano: <PlanningScreen go={go} />, perfil: <AccountScreen go={go} />, planos: <PlansScreen go={go} /> }[route] ?? <PerformanceScreen go={go} />;
  const [title, sub] = TITLES[route] ?? TITLES.desempenho;
  return (
    <AppShell route={route} go={go} theme={theme} setTheme={setTheme} phase={1} setPhase={() => {}} phase2Locked={papel === "aluno"} info={info} title={title} sub={sub}>
      {body}
    </AppShell>
  );
}
createRoot(document.getElementById("root")).render(<SessionProvider><TutorDockProvider go={() => {}}><Previa /></TutorDockProvider></SessionProvider>);
