// App novo: sessão, rotas e estrutura reais.
// As telas ainda não ligadas aos dados usam as do protótipo (src/novo/prototype) no estado
// "aluno novo" e mostram um aviso; cada etapa substitui um grupo por telas com dados reais.
import React from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { Banner, Button, EmptyState, SegmentedControl } from "../ds";
import { AppShell, useMobile } from "./Shell.jsx";
import { AuthFlow } from "./AuthScreens.jsx";
import { SessionProvider, useSession } from "./session.jsx";
import { Tutor } from "../prototype/More.jsx";
import { Aulas, Temas, Materiais } from "../prototype/Study1.jsx";
import { Home2, Stations, Station, Peps, Perf2, SimPatient } from "../prototype/Phase2.jsx";
import { Pair } from "../prototype/Match.jsx";
import { Theory2 } from "../prototype/Theory2.jsx";
import { HomeScreen } from "./home/HomeScreen.jsx";
import { TodayPlan } from "./home/TodayPlan.jsx";
import { PlanningScreen } from "./home/PlanningScreen.jsx";
import { ErrorNotebook } from "./review/ErrorNotebook.jsx";
import { PerformanceScreen } from "./review/PerformanceScreen.jsx";
import { FlashcardsScreen } from "./review/FlashcardsScreen.jsx";
import { AccountScreen } from "./account/AccountScreen.jsx";
import { QuestionBuilder } from "./practice/QuestionBuilder.jsx";
import { PracticeSession } from "./practice/PracticeSession.jsx";

// [título, subtítulo] de cada rota (o início é montado com nome e data reais).
const TITLES = {
  aulas: ["Aulas teórico-práticas", "Estudar · conteúdo audiovisual por grande área"],
  temas: ["Grandes Temas do Revalida", "Estudar · temas nas 5 grandes áreas"],
  materiais: ["Materiais oficiais e diretrizes", "Estudar · PCDTs, protocolos do MS, INEP e sociedades"],
  hoje: ["Plano de hoje", "Estudar · praticar · revisar"],
  questoes: ["Questões", "Monte seu treino"],
  simulados: ["Simulados", "Condições de prova"],
  flash: ["Flashcards", "Revisão espaçada"],
  erros: ["Caderno de erros", "Revisar"],
  plano: ["Planejamento", "Cronograma até a prova"],
  desempenho: ["Desempenho", "Seus dados reais"],
  tutor: ["Tutor IA", "Discussão clínica socrática"],
  perfil: ["Conta", "Dados, segurança e privacidade"],
  teoria2: ["Teoria para a prática", "Esqueletos, documentos médicos e protocolos aplicados às estações"],
  estacoes: ["Banco de estações", "Estações nas 5 grandes áreas"],
  dupla: ["Praticar", "Treine em dupla com outro aluno"],
  peps: ["Meus PEPs", "Estações avaliadas"],
  paciente: ["Paciente simulado", "Treine a anamnese com IA"],
  desempenho2: ["Desempenho prático", "Notas pelo PEP"],
};
const PHASE2_ROUTES = ["home2", "teoria2", "estacoes", "estacao", "dupla", "peps", "paciente", "desempenho2"];
const ROUTES = new Set(["home", "home2", "sessao", "estacao", ...Object.keys(TITLES)]);

// Telas já ligadas aos dados reais (as demais mostram o aviso de exemplo).
const CONNECTED = new Set(["home", "hoje", "questoes", "simulados", "flash", "erros", "plano", "desempenho", "perfil"]);

function greeting(name, now = new Date()) {
  const hour = now.getHours();
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const first = (name || "").trim().split(/\s+/)[0];
  return first ? `${hello}, ${first}.` : `${hello}.`;
}

function todayLabel(daysToExam, now = new Date()) {
  const date = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(now);
  const label = date.charAt(0).toUpperCase() + date.slice(1);
  if (daysToExam === null || daysToExam === undefined) return label;
  return `${label} · ${daysToExam === 1 ? "1 dia" : `${daysToExam} dias`} para a prova`;
}

function resolveTheme(theme) {
  if (theme === "system") return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return theme === "dark" ? "dark" : "light";
}

function Screen() {
  const { boot, updateProfile, signOut } = useSession();
  const params = useParams();
  const navigate = useNavigate();
  const mobile = useMobile();
  const profile = boot.profile;

  const defaultRoute = profile.phase === 2 ? "home2" : "home";
  const route = params.route ?? defaultRoute;
  const theme = resolveTheme(profile.theme);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  if (!ROUTES.has(route)) return <Navigate to="/" replace />;

  const go = (next, query) => {
    const target = next === "planos" ? "perfil" : next;
    navigate((target === defaultRoute ? "/" : `/${target}`) + (query ? `?${new URLSearchParams(query)}` : ""));
    window.scrollTo(0, 0);
  };
  const phase = PHASE2_ROUTES.includes(route) ? 2 : 1;
  const setPhase = (next) => {
    updateProfile({ phase: next }).catch(() => {});
    navigate(next === 2 ? "/home2" : "/home");
    window.scrollTo(0, 0);
  };
  const setTheme = (next) => updateProfile({ theme: next }).catch(() => {});

  if (route === "sessao") return <PracticeSession go={go} />;
  if (route === "estacao") return <Station go={go} />;

  // Até cada tela ser ligada aos dados, usa o estado "aluno novo" do design (sem números inventados).
  const data = "novo";
  let body;
  if (route === "home") body = <HomeScreen go={go} mobile={mobile} />;
  else if (route === "hoje") body = <TodayPlan go={go} />;
  else if (route === "aulas") body = <Aulas />;
  else if (route === "temas") body = <Temas go={go} />;
  else if (route === "materiais") body = <Materiais />;
  else if (route === "questoes") body = <QuestionBuilder key="q" go={go} mode="q" />;
  else if (route === "simulados") body = <QuestionBuilder key="sim" go={go} mode="sim" />;
  else if (route === "flash") body = <FlashcardsScreen go={go} />;
  else if (route === "erros") body = <ErrorNotebook go={go} />;
  else if (route === "plano") body = <PlanningScreen go={go} />;
  else if (route === "desempenho") body = <PerformanceScreen go={go} />;
  else if (route === "tutor") body = <Tutor go={go} />;
  else if (route === "home2") body = <Home2 go={go} data={data} mobile={mobile} />;
  else if (route === "estacoes") body = <Stations go={go} />;
  else if (route === "teoria2") body = <Theory2 go={go} />;
  else if (route === "dupla") body = <Pair go={go} />;
  else if (route === "peps") body = <Peps go={go} />;
  else if (route === "paciente") body = <SimPatient go={go} />;
  else if (route === "desempenho2") body = <Perf2 go={go} data={data} />;
  else body = <AccountScreen />;

  const isHome = route === "home" || route === "home2";
  const [title, sub] = isHome
    ? [greeting(profile.name), route === "home2" ? "2ª fase · habilidades clínicas" : todayLabel(boot.days_to_exam)]
    : TITLES[route];

  const reviewSwitch = (value) => (
    <div>
      <SegmentedControl
        label="Revisar"
        value={value}
        onChange={(v) => go(v)}
        options={[
          { value: "flash", label: "Flashcards" },
          { value: "erros", label: "Caderno de erros" },
        ]}
      />
    </div>
  );

  return (
    <AppShell
      route={route}
      go={go}
      theme={theme}
      setTheme={setTheme}
      phase={phase}
      setPhase={setPhase}
      title={title}
      sub={sub}
      info={{
        name: profile.name || "Sua conta",
        streakDays: boot.streak_days,
        flashcardsDue: boot.flashcards_due,
        onSignOut: () => signOut(),
      }}
    >
      {!CONNECTED.has(route) && (
        <Banner tone="warning" title="Tela em reconstrução">
          Os itens e números abaixo são exemplos do novo design e ainda não refletem os seus dados.
        </Banner>
      )}
      {route === "flash" && reviewSwitch("flash")}
      {route === "erros" && reviewSwitch("erros")}
      {body}
    </AppShell>
  );
}

function Splash({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "var(--bg-app)", padding: 24 }}>
      <img src="/novo-assets/logo-mark.png" alt="StaziaMed" style={{ height: 56 }} />
      {children}
    </div>
  );
}

function Root() {
  const session = useSession();

  if (session.status === "loading") {
    return (
      <Splash>
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Carregando…</span>
      </Splash>
    );
  }
  if (session.status === "error") {
    return (
      <Splash>
        <div style={{ maxWidth: 480, width: "100%" }}>
          <EmptyState
            icon="cloud-off"
            title="Não foi possível carregar"
            description={session.error?.message || "Verifique sua conexão e tente de novo."}
            action={<Button onClick={() => window.location.reload()}>Tentar de novo</Button>}
          />
        </div>
      </Splash>
    );
  }
  if (session.status === "signed-out") return <AuthFlow />;

  return (
    <Routes>
      <Route path="/:route?" element={<Screen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter basename="/novo">
      <SessionProvider>
        <Root />
      </SessionProvider>
    </BrowserRouter>
  );
}
