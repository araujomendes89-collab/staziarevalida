// App novo: sessão, rotas e estrutura reais.
// As telas ainda não ligadas aos dados usam as do protótipo (src/novo/prototype) no estado
// "aluno novo" e mostram um aviso; cada etapa substitui um grupo por telas com dados reais.
import React from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { Banner, Button, EmptyState, SegmentedControl } from "../ds";
import { AppShell, useMobile } from "./Shell.jsx";
import { AuthFlow, NewPasswordScreen } from "./AuthScreens.jsx";
import { LegalPage } from "./legal/LegalPage.jsx";
import { AcceptanceScreen } from "./legal/AcceptanceScreen.jsx";
import { SessionProvider, useSession } from "./session.jsx";
import { rememberScreen } from "./support/lastScreen.js";
import { NexusScreen } from "./tutor/nexus/NexusScreen.jsx";
import { ReportScreen } from "./tutor/ReportScreen.jsx";
import { TutorDockProvider } from "./tutor/TutorDrawer.jsx";
import { LessonsScreen } from "./study/LessonsScreen.jsx";
import { aulasParaAluno } from "./features.js";
import { UpdatesScreen } from "./study/UpdatesScreen.jsx";
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
import { PlansScreen } from "./plan/PlansScreen.jsx";
import { AdminScreen, isStaffRole } from "./admin/AdminScreen.jsx";
import { isPhase2Locked } from "./admin/common.jsx";
import { ThemesScreen } from "./study/ThemesScreen.jsx";
import { QuestionBuilder } from "./practice/QuestionBuilder.jsx";
import { PracticeSession } from "./practice/PracticeSession.jsx";
import { TrailScreen } from "./play/TrailScreen.jsx";
import { LeaderboardScreen } from "./play/LeaderboardScreen.jsx";
import { MissionsScreen } from "./play/MissionsScreen.jsx";
import { AchievementsScreen } from "./play/AchievementsScreen.jsx";

// [título, subtítulo] de cada rota (o início é montado com nome e data reais).
const TITLES = {
  aulas: ["Aulas teórico-práticas", "Aprender · conteúdo audiovisual por grande área"],
  temas: ["Temas Essenciais", "Aprender · os 100 temas prioritários, com as questões oficiais de cada um"],
  atualizacoes: ["Diretrizes e Atualizações", "Aprender · o que mudou nas condutas e onde conferir"],
  hoje: ["Plano de Hoje", "Aprender · praticar · revisar"],
  questoes: ["Banco de Questões", "Monte seu treino"],
  simulados: ["Simulados", "Condições de prova"],
  flash: ["Flashcards", "Revisão espaçada"],
  erros: ["Caderno de Erros", "Revisar"],
  plano: ["Planejamento", "Cronograma até a prova"],
  desempenho: ["Desempenho", "Seus dados reais"],
  analise: ["Análise Inteligente", "Minha Evolução · o que o Tutor percebeu nos seus erros e acertos"],
  tutor: ["Nexus · Tutor com IA", "Seu professor particular para o Revalida"],
  trilha: ["Minha Trilha", "Stazia Arena · uma etapa de cada vez"],
  classificacao: ["Ranking", "Stazia Arena · ranking e liga da semana"],
  missoes: ["Missões", "Stazia Arena · metas de hoje e da semana"],
  conquistas: ["Conquistas", "Stazia Arena · medalhas e recompensas"],
  perfil: ["Conta", "Dados, segurança e privacidade"],
  planos: ["Meu Plano", "Conta · o que cada plano inclui"],
  teoria2: ["Teoria para a prática", "Esqueletos, documentos médicos e protocolos aplicados às estações"],
  estacoes: ["Banco de estações", "Estações nas 5 grandes áreas"],
  dupla: ["Praticar", "Treine em dupla com outro aluno"],
  peps: ["Meus PEPs", "Estações avaliadas"],
  paciente: ["Paciente simulado", "Treine a anamnese com IA"],
  desempenho2: ["Desempenho prático", "Notas pelo PEP"],
  admin: ["Administração", "Gestão da plataforma"],
};
const PHASE2_ROUTES = ["home2", "teoria2", "estacoes", "estacao", "dupla", "peps", "paciente", "desempenho2"];
const ROUTES = new Set(["home", "home2", "sessao", "estacao", ...Object.keys(TITLES)]);

// Telas já ligadas aos dados reais (as demais mostram o aviso de exemplo).
const CONNECTED = new Set(["home", "hoje", "questoes", "simulados", "flash", "erros", "plano", "desempenho", "analise", "perfil", "admin", "temas", "tutor", "trilha", "classificacao", "missoes", "conquistas", "aulas", "atualizacoes", "planos"]);

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
  // 2ª fase · prática "em breve": por enquanto só a equipe (admin/editor) entra; aluno e revisor médico não
  const phase2Locked = isPhase2Locked(boot.role);

  const defaultRoute = profile.phase === 2 && !phase2Locked ? "home2" : "home";
  const route = params.route ?? defaultRoute;
  const theme = resolveTheme(profile.theme);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // a tela de antes da Conta vai pré-escolhida em "Relatar um problema"
  React.useEffect(() => {
    rememberScreen(route);
  }, [route]);

  // "Materiais oficiais" virou "Atualizações": endereços antigos continuam funcionando
  if (route === "materiais") return <Navigate to="/atualizacoes" replace />;
  if (!ROUTES.has(route)) return <Navigate to="/" replace />;
  // equipe (admin/editor) ou revisor médico de alguma área (só a revisão da Central de Conteúdo)
  if (route === "admin" && !isStaffRole(boot.role) && !boot.reviewer_areas?.length) return <Navigate to="/" replace />;
  if (phase2Locked && PHASE2_ROUTES.includes(route)) return <Navigate to="/" replace />;
  // Aulas fechadas ao aluno por enquanto (ver features.js): quem abrir o endereço antigo cai no início
  if (route === "aulas" && !aulasParaAluno() && !isStaffRole(boot.role)) return <Navigate to="/" replace />;

  const go = (next, query) => {
    const target = next;
    navigate((target === defaultRoute ? "/" : `/${target}`) + (query ? `?${new URLSearchParams(query)}` : ""));
    window.scrollTo(0, 0);
  };
  const phase = PHASE2_ROUTES.includes(route) ? 2 : 1;
  const setPhase = (next) => {
    if (next === 2 && phase2Locked) return; // o botão já fica sem clique; esta é a defesa extra
    updateProfile({ phase: next }).catch(() => {});
    navigate(next === 2 ? "/home2" : "/home");
    window.scrollTo(0, 0);
  };
  const setTheme = (next) => updateProfile({ theme: next }).catch(() => {});

  // o Tutor abre em qualquer tela de estudo, com o contexto que a tela já conhece
  if (route === "sessao") return <TutorDockProvider go={go}><PracticeSession go={go} /></TutorDockProvider>;
  // a tela de uma estação abre sem a moldura: o aviso de "em reconstrução" entra aqui, antes dela
  if (route === "estacao")
    return (
      <>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "16px 16px 0" }}>
          <ReconstructionNotice />
        </div>
        <Station go={go} />
      </>
    );

  // Até cada tela ser ligada aos dados, usa o estado "aluno novo" do design (sem números inventados).
  const data = "novo";
  let body;
  if (route === "home") body = <HomeScreen go={go} mobile={mobile} />;
  else if (route === "hoje") body = <TodayPlan go={go} />;
  else if (route === "aulas") body = <LessonsScreen go={go} />;
  else if (route === "temas") body = <ThemesScreen go={go} />;
  else if (route === "atualizacoes") body = <UpdatesScreen go={go} />;
  else if (route === "questoes") body = <QuestionBuilder key="q" go={go} mode="q" />;
  else if (route === "simulados") body = <QuestionBuilder key="sim" go={go} mode="sim" />;
  else if (route === "flash") body = <FlashcardsScreen go={go} />;
  else if (route === "erros") body = <ErrorNotebook go={go} />;
  else if (route === "plano") body = <PlanningScreen go={go} />;
  else if (route === "desempenho") body = <PerformanceScreen go={go} />;
  else if (route === "tutor") body = <NexusScreen go={go} />;
  // "Análise" (grupo Evolução): o relatório do Tutor (o que ele percebeu, erros que se repetem, evolução por área)
  else if (route === "analise") body = <ReportScreen go={go} />;
  else if (route === "trilha") body = <TrailScreen go={go} />;
  else if (route === "classificacao") body = <LeaderboardScreen go={go} />;
  else if (route === "missoes") body = <MissionsScreen go={go} />;
  else if (route === "conquistas") body = <AchievementsScreen go={go} />;
  else if (route === "home2") body = <Home2 go={go} data={data} mobile={mobile} />;
  else if (route === "estacoes") body = <Stations go={go} />;
  else if (route === "teoria2") body = <Theory2 go={go} />;
  else if (route === "dupla") body = <Pair go={go} />;
  else if (route === "peps") body = <Peps go={go} />;
  else if (route === "paciente") body = <SimPatient go={go} />;
  else if (route === "desempenho2") body = <Perf2 go={go} data={data} />;
  else if (route === "planos") body = <PlansScreen go={go} />;
  else if (route === "admin") body = <AdminScreen />;
  else body = <AccountScreen go={go} />;

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
          { value: "erros", label: "Caderno de Erros" },
        ]}
      />
    </div>
  );

  return (
    <TutorDockProvider go={go}>
    <AppShell
      route={route}
      go={go}
      theme={theme}
      setTheme={setTheme}
      phase={phase}
      setPhase={setPhase}
      phase2Locked={phase2Locked}
      title={title}
      sub={sub}
      info={{
        name: profile.name || "Sua conta",
        streakDays: boot.play?.enabled ? boot.play.streak : boot.streak_days,
        flashcardsDue: boot.flashcards_due,
        onSignOut: () => signOut(),
        isStaff: isStaffRole(boot.role),
        isReviewer: Boolean(boot.reviewer_areas?.length),
      }}
    >
      {!CONNECTED.has(route) && <ReconstructionNotice />}
      {route === "flash" && reviewSwitch("flash")}
      {route === "erros" && reviewSwitch("erros")}
      {body}
    </AppShell>
    </TutorDockProvider>
  );
}

function ReconstructionNotice() {
  return (
    <Banner tone="warning" title="Tela em reconstrução">
      Os itens e números abaixo são exemplos do novo design e ainda não refletem os seus dados.
    </Banner>
  );
}

function Splash({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "var(--bg-app)", padding: 24 }}>
      <img src="/brand/simbolo-96w.png" alt="StaziaMed Revalida" width="38" height="56" style={{ height: 56, width: "auto" }} />
      {children}
    </div>
  );
}

function Root() {
  const session = useSession();
  const { pathname } = useLocation();

  // Termo e Política são públicas: abrem com ou sem login, também carregando ou com erro.
  const publicPath = pathname.replace(/\/+$/, "");
  if (publicPath === "/termos") return <LegalPage doc="termos" />;
  if (publicPath === "/privacidade") return <LegalPage doc="privacidade" />;

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
  // Veio pelo link de recuperar senha: antes de qualquer tela do app, a pessoa cria a nova senha
  if (session.recovery) return <NewPasswordScreen />;
  // Aluno sem aceite do Termo vigente ou sem WhatsApp: a tela de aceite vem antes de qualquer rota (o servidor decide em gate_required)
  if (session.boot?.legal?.gate_required) return <AcceptanceScreen />;

  return (
    <Routes>
      {/* /novo/login: sem sessão, qualquer endereço mostra o login; com sessão, volta para o início */}
      <Route path="/login" element={<Navigate to="/" replace />} />
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
