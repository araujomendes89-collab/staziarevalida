// PRÉVIA do Início e do Plano de Hoje (onda 2). Dados de TESTE, sem banco. Parâmetros:
//   ?rota=home|hoje  &tema=escuro  &fase=1|2  &papel=aluno|equipe|revisor  &abrir=1 (Personalizar plano aberto)  &vazio=1  &tudofeito=1
//   &arena=0 (Stazia Arena desligada)  &semliga=1 (fora do ranking)  &teste=1 (teste grátis: 20 de 74 inéditas)
//   onda 7: ?rota=conquistas|medalhas  &arte=0 (como o app hoje: sem a arte 3D do pacote)  &ganhas=1 (2 medalhas de TESTE desbloqueadas)
//           &aba=loja (Recompensas)  &lojavazia=1  &semmoedas=1 (moedas desligadas: sem a aba Recompensas)
//   Onda 6 (Stazia Arena): ?rota=trilha|missoes|classificacao  &trilhaandamento=1 (etapas feitas)  &missoesfeitas=1  &rankcheio=1 (linhas de TESTE)  &liga=1 (aluno numa liga)
//   Casca final (15/10/2026): ?rota=login (login novo; &login=atual mostra o de antes; senha "errada" mostra o erro)
//   &inicio=simples (Início do celular do pacote MobileMenu)  &mais=pagina (botão Mais do celular abre a página em vez da folha)
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../../src/novo/ds/styles.css";
import { AppShell } from "../../src/novo/app/Shell.jsx";
import { HomeScreen } from "../../src/novo/app/home/HomeScreen.jsx";
import { TodayPlan } from "../../src/novo/app/home/TodayPlan.jsx";
import { AchievementsScreen } from "../../src/novo/app/play/AchievementsScreen.jsx";
import { MedalhasPadrao } from "../../src/novo/app/play/MedalhasPadrao.jsx";
import artesDoPacote from "../../src/novo/ds/medalhas-pacote/artes.js";
import { registrarArtesDoPacote } from "../../src/novo/ds/medalhas-pacote/index.js";
import { TrailScreen } from "../../src/novo/app/play/TrailScreen.jsx";
import { MissionsScreen } from "../../src/novo/app/play/MissionsScreen.jsx";
import { LeaderboardScreen } from "../../src/novo/app/play/LeaderboardScreen.jsx";
import { LoginScreen } from "../../src/novo/app/auth/LoginScreen.jsx";
import { useSession } from "./sessaoSimulada.jsx";

const q = new URLSearchParams(location.search);
registrarArtesDoPacote(artesDoPacote); // onda 7: arte 3D das medalhas só nesta prévia
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
  if (nav.route === "login") return <LoginScreen go={(r) => alert(`Prévia: abriria "${r}" (recuperar senha, criar conta)`)} />;
  const info = { name: "João Paulo Mendes", streakDays: 0, flashcardsDue: 0, onSignOut: () => alert("Sair (prévia)"), isStaff: papel === "equipe", isReviewer: papel === "revisor", radarGraves: 0, themeChoice: choice };
  const h = new Date().getHours();
  const arte = q.get("arte") === "0" ? false : undefined;
  const TITULOS = { home: ["Boa tarde, João.", "Quinta, 15 de outubro"], hoje: ["Plano de Hoje", "Ciclo diário · aprender, praticar, revisar"], conquistas: ["Conquistas", "Stazia Arena · medalhas e recompensas"], medalhas: ["Medalhas e ligas", "Padrão 3D do pacote · só na prévia"],
    trilha: ["Minha Trilha", "Stazia Arena · uma etapa de cada vez"], missoes: ["Missões", "Stazia Arena · metas de hoje e da semana"], classificacao: ["Ranking", "Stazia Arena · ranking e liga da semana"] };
  const [title, sub] = TITULOS[nav.route] ?? [nav.route, ""];
  const search = nav.query ? `?${new URLSearchParams(nav.query)}` : "";
  const headerKind = nav.route === "home" ? "inicio" : nav.route === "hoje" ? "plano" : undefined;
  return (
    <MemoryRouter key={nav.route + search} initialEntries={["/" + nav.route + search]}>
      <AppShell route={nav.route} go={go} theme={theme} setTheme={setT} phase={phase} setPhase={setPhase} phase2Locked={papel === "aluno"} info={info} title={title} sub={sub} headerKind={headerKind}>
        {nav.route === "home" ? (
          <HomeScreen go={go} mobile={false} />
        ) : nav.route === "hoje" ? (
          <TodayPlan go={go} />
        ) : nav.route === "conquistas" ? (
          <AchievementsScreen arte={arte} aba={q.get("aba") || undefined} />
        ) : nav.route === "medalhas" ? (
          <MedalhasPadrao arte={arte} />
        ) : nav.route === "trilha" ? (
          <TrailScreen go={go} />
        ) : nav.route === "missoes" ? (
          <MissionsScreen go={go} />
        ) : nav.route === "classificacao" ? (
          <LeaderboardScreen go={go} />
        ) : (
          <p>Tela: {nav.route} (fora desta prévia)</p>
        )}
      </AppShell>
    </MemoryRouter>
  );
}
createRoot(document.getElementById("root")).render(<Previa />);
