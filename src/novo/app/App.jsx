// App novo: sessão, rotas e estrutura reais.
// As telas ainda não ligadas aos dados usam as do protótipo (src/novo/prototype) no estado
// "aluno novo" e mostram um aviso; cada etapa substitui um grupo por telas com dados reais.
// Treinamento em Dupla: /estacoes, /dupla, /dupla/perfil e /dupla/sala/:roomId, dentro do DuplaGate (chave e plano).
import React from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { Banner, Button, EmptyState, SegmentedControl } from "../ds";
import { AppShell, useMobile } from "./Shell.jsx";
import { AuthFlow, NewPasswordScreen } from "./AuthScreens.jsx";
import { SessaoDerrubadaScreen } from "./auth/SessaoDerrubada.jsx";
import { LegalPage } from "./legal/LegalPage.jsx";
import { AcceptanceScreen, emPrazoDeAceite, precisaTelaDeAceite } from "./legal/AcceptanceScreen.jsx";
import { AvisoContratoNovo } from "./legal/AvisoContratoNovo.jsx";
import { SessionProvider, useSession } from "./session.jsx";
import { forgetShellCounts } from "./shell/useShellCounts.js";
import { rememberScreen } from "./support/lastScreen.js";
import { NexusScreen } from "./tutor/nexus/NexusScreen.jsx";
import { ReportScreen } from "./tutor/ReportScreen.jsx";
import { TutorDockProvider } from "./tutor/TutorDrawer.jsx";
import { LessonsScreen } from "./study/LessonsScreen.jsx";
import { aulasParaAluno } from "./features.js";
import { UpdatesScreen } from "./study/UpdatesScreen.jsx";
import { MapasScreen } from "./mapas/MapasScreen.jsx";
// 2ª fase com dados reais (estações aprovadas, tentativas e notas do próprio aluno): ver src/novo/app/fase2/
import { Fase2Home } from "./fase2/Fase2Home.jsx";
import { Fase2Theory } from "./fase2/Fase2Theory.jsx";
import { Fase2Player } from "./fase2/Fase2Player.jsx";
import { Fase2Peps } from "./fase2/Fase2Peps.jsx";
import { Fase2Patient } from "./fase2/Fase2Patient.jsx";
import { Fase2Performance } from "./fase2/Fase2Performance.jsx";
// Treino em Dupla (Praticar, perfil de estudo, banco de estações da dupla e sala)
import { DuplaGate, duplaAllowed, soloAllowed } from "./dupla/DuplaGate.jsx";
import { StationsScreen } from "./dupla/StationsScreen.jsx";
import { PracticeScreen } from "./dupla/PracticeScreen.jsx";
import { StudyProfileScreen } from "./dupla/StudyProfileScreen.jsx";
import { RoomScreen } from "./dupla/room/RoomScreen.jsx";
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
import { useRadarAvisos } from "./admin/radar/useRadarAvisos.js";
import { ThemesScreen } from "./study/ThemesScreen.jsx";
import { QuestionBuilder } from "./practice/QuestionBuilder.jsx";
import { PracticeSession } from "./practice/PracticeSession.jsx";
import { TrailScreen } from "./play/TrailScreen.jsx";
import { LeaderboardScreen } from "./play/LeaderboardScreen.jsx";
import { MissionsScreen } from "./play/MissionsScreen.jsx";
import { AchievementsScreen } from "./play/AchievementsScreen.jsx";
import { Nivelamento, deveMostrarNivelamento } from "./nivelamento/Nivelamento.jsx";
import { CelebracoesProvider } from "./play/celebracoes/CelebracoesProvider.jsx";
import { Onboarding, deveMostrarOnboarding } from "./onboarding/Onboarding.jsx";
import { TourNoPainel } from "./onboarding/Tour.jsx";
import { DicaPrimeiroUso } from "./onboarding/Inicio.jsx";
import { AmostraFaixa, CadeadoDialog } from "./plan/cadeado.jsx";
import { AvisosPopup } from "./plan/AvisosPopup.jsx";
import { NotificacoesProvider } from "./notificacoes/NotificacoesProvider.jsx";

// Vitrine dos componentes do Treinamento em Dupla: só no servidor de desenvolvimento; sai do build de produção.
const Vitrine = import.meta.env.DEV ? React.lazy(() => import("./dupla/Vitrine.jsx")) : null;

// [título, subtítulo] de cada rota (o início é montado com nome e data reais).
const TITLES = {
  aulas: ["Aulas teórico-práticas", "Aprender · conteúdo audiovisual por grande área"],
  temas: ["Temas Essenciais", "Aprender · os 100 temas prioritários, com as questões oficiais de cada um"],
  atualizacoes: ["Diretrizes e Atualizações", "Aprender · o que mudou nas condutas e onde conferir"],
  mapas: ["Mapas Mentais", "Aprender · resumos visuais por tema, da revisão rápida ao aprofundado"],
  hoje: ["Plano de Hoje", "Ciclo diário · aprender, praticar, revisar"],
  questoes: ["Banco de Questões", "Monte seu treino"],
  simulados: ["Simulados", "Condições de prova"],
  flash: ["Flashcards", "Revisão espaçada"],
  erros: ["Caderno de Erros", "Revisar"],
  plano: ["Planejamento", "Cronograma até a prova"],
  desempenho: ["Desempenho", "Seus dados reais"],
  analise: ["Análise Inteligente", "Minha Evolução · o que o Tutor percebeu nos seus erros e acertos"],
  tutor: ["Tutor", "Stazi e Stazia, seus tutores para o Revalida"],
  trilha: ["Minha Trilha", "Stazia Arena · uma etapa de cada vez"],
  classificacao: ["Ranking", "Stazia Arena · ranking e liga da semana"],
  missoes: ["Missões", "Stazia Arena · metas de hoje e da semana"],
  conquistas: ["Conquistas", "Stazia Arena · medalhas e recompensas"],
  perfil: ["Minha conta", "Dados, segurança e privacidade"],
  planos: ["Meu plano", "Conta · o que cada plano inclui"],
  nivelamento: ["Diagnóstico de nivelamento", "Evolução · o seu nível e por onde começar"],
  teoria2: ["Teoria para a prática", "Esqueletos, documentos médicos e protocolos aplicados às estações"],
  estacoes: ["Banco de estações", null],
  dupla: ["Praticar em dupla", null],
  "dupla-perfil": ["Meu perfil de estudo", null],
  peps: ["Meus PEPs", "Estações avaliadas"],
  paciente: ["Paciente simulado", "Treine a anamnese com IA"],
  desempenho2: ["Desempenho prático", "Notas pelo PEP"],
  admin: ["Administração", "Gestão da plataforma"],
  ...(import.meta.env.DEV ? { "vitrine-dupla": ["Vitrine de componentes", "Somente em desenvolvimento · dados de exemplo"] } : {}),
};
// planos etapa 4: a faixa da amostra do dia nas telas que gastam a amostra
const AMOSTRA_ROTA = { questoes: "questoes", simulados: "simulados_teoricos", flash: "flashcards" };
const PHASE2_ROUTES = ["home2", "teoria2", "estacoes", "estacao", "dupla", "dupla-perfil", "dupla-sala", "peps", "paciente", "desempenho2"];
// Aluno com o Treino em Dupla aberto: o Banco de estações (um só, decisão do dono de 16/10: o do pacote de 11/10) e o Praticar
// em dupla abrem; as outras telas da 2ª fase com dados (fase2_allowed, hoje só a equipe) ficam "Em breve" e o endereço leva ao
// Banco de estações. "estacoes" NÃO entra aqui (entraria em ciclo, mandando o aluno para a própria tela).
const SOON = ["home2", "teoria2", "estacao", "peps", "paciente", "desempenho2"];
const ROUTES = new Set(["home", "home2", "sessao", "estacao", "nivelamento", "apresentacao", "dupla-sala", ...Object.keys(TITLES)]);

// Telas já ligadas aos dados reais (as demais mostram o aviso de exemplo).
const CONNECTED = new Set(["home", "hoje", "questoes", "simulados", "flash", "erros", "plano", "desempenho", "analise", "perfil", "admin", "temas", "tutor", "trilha", "classificacao", "missoes", "conquistas", "aulas", "atualizacoes", "mapas", "planos", "nivelamento", "home2", "teoria2", "estacoes", "peps", "paciente", "desempenho2", "dupla", "dupla-perfil", "dupla-sala"]);

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

function Screen({ view }) {
  const { boot, dupla, updateProfile, signOut, backend } = useSession();
  const params = useParams();
  const navigate = useNavigate();
  const mobile = useMobile();
  const profile = boot.profile;
  // aviso das mudanças GRAVES do Radar de Evidências: só o administrador pede (para os outros papéis nem chama o banco)
  const radar = useRadarAvisos(boot.role === "admin");
  // 2ª fase · prática "em breve": a equipe entra sempre; aluno e revisor médico só com a chave do Treinamento em Dupla ligada
  // (ou liberados pelo banco). O plano é conferido dentro das telas (DuplaGate).
  const phase2Locked = isPhase2Locked(boot.role, dupla);
  // aluno com a 2ª fase aberta: começa no Banco de estações e o resto da 2ª fase fica "Em breve"
  const studentPhase2 = !phase2Locked && !isStaffRole(boot.role);
  // treino sozinho (decisão do dono 19/10): a tela da estação abre para quem o banco libera (2ª fase paga ou amostra)
  const soon = studentPhase2 && soloAllowed(boot, dupla) ? SOON.filter((r) => r !== "estacao") : SOON;

  const defaultRoute = profile.phase === 2 && !phase2Locked ? (studentPhase2 ? "estacoes" : "home2") : "home";
  const route = view ?? params.route ?? defaultRoute;
  const theme = resolveTheme(profile.theme);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // novo.html aplica este tema antes da primeira pintura na próxima visita (sem piscar claro → escuro)
    try {
      localStorage.setItem("smn-theme", theme);
    } catch {
      // armazenamento bloqueado (janela privada): o tema da sessão continua valendo
    }
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
  if (studentPhase2 && soon.includes(route)) return <Navigate to="/estacoes" replace />;
  // Aulas fechadas ao aluno por enquanto (ver features.js): quem abrir o endereço antigo cai no início
  if (route === "aulas" && !aulasParaAluno() && !isStaffRole(boot.role)) return <Navigate to="/" replace />;

  const go = (next, query) => {
    const target = next;
    if (target === "dupla-perfil") navigate("/dupla/perfil");
    else if (target === "dupla-sala") navigate(`/dupla/sala/${encodeURIComponent(query?.sala ?? "")}`);
    else navigate((target === defaultRoute ? "/" : `/${target}`) + (query ? `?${new URLSearchParams(query)}` : ""));
    window.scrollTo(0, 0);
  };
  const phase = PHASE2_ROUTES.includes(route) ? 2 : 1;
  const setPhase = (next) => {
    if (next === 2 && phase2Locked) return; // o botão já fica sem clique; esta é a defesa extra
    updateProfile({ phase: next }).catch(() => {});
    navigate(next === 2 ? (studentPhase2 ? "/estacoes" : "/home2") : "/home");
    window.scrollTo(0, 0);
  };
  const setTheme = (next) => updateProfile({ theme: next }).catch(() => {});

  const { search } = useLocation();
  const query = new URLSearchParams(search);

  // o Tutor abre em qualquer tela de estudo, com o contexto que a tela já conhece
  // (ao sair da sessão os selos do menu, como o do Caderno de Erros, são perguntados de novo ao banco)
  if (route === "sessao") forgetShellCounts(backend);
  if (route === "sessao") return <TutorDockProvider go={go}><PracticeSession go={go} /></TutorDockProvider>;
  if (route === "nivelamento" && query.get("etapa") === "questoes") return <Nivelamento modo="rota" go={go} />;
  // "Refazer apresentação" (Conta → Ajuda) e o convite/Primeiros passos do Início: o onboarding em tela cheia, sem obrigar
  if (route === "apresentacao") return boot.onboarding ? <Onboarding modo="refazer" inicio={query.get("inicio")} go={go} /> : <Navigate to="/" replace />;
  // a tela de uma estação (leitura, atendimento e PEP) abre sem a moldura
  if (route === "estacao") return <Fase2Player go={go} />;

  let body;
  if (route === "home") body = <HomeScreen go={go} mobile={mobile} />;
  else if (route === "hoje") body = <TodayPlan go={go} />;
  else if (route === "nivelamento") body = <Nivelamento go={go} modo="rota" />;
  else if (route === "aulas") body = <LessonsScreen go={go} />;
  else if (route === "temas") body = <ThemesScreen go={go} />;
  else if (route === "atualizacoes") body = <UpdatesScreen go={go} />;
  else if (route === "mapas") body = <MapasScreen go={go} />;
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
  else if (route === "home2") body = <Fase2Home go={go} />;
  // Banco de estações único (sozinho e em dupla), no desenho do pacote de 11/10
  else if (route === "estacoes") body = <DuplaGate go={go} sozinho><StationsScreen go={go} /></DuplaGate>;
  else if (route === "teoria2") body = <Fase2Theory go={go} />;
  else if (route === "dupla") body = <DuplaGate go={go}><PracticeScreen go={go} /></DuplaGate>;
  else if (route === "dupla-perfil") body = <DuplaGate go={go}><StudyProfileScreen go={go} /></DuplaGate>;
  else if (route === "dupla-sala") body = <DuplaGate go={go}><RoomScreen roomId={params.roomId} go={go} /></DuplaGate>;
  else if (route === "peps") body = <Fase2Peps go={go} />;
  else if (route === "paciente") body = <Fase2Patient go={go} />;
  else if (route === "desempenho2") body = <Fase2Performance go={go} />;
  else if (route === "planos") body = <PlansScreen go={go} />;
  else if (route === "admin") body = <AdminScreen />;
  else if (import.meta.env.DEV && Vitrine && route === "vitrine-dupla") body = <React.Suspense fallback={null}><Vitrine /></React.Suspense>;
  else body = <AccountScreen go={go} />;

  const isHome = route === "home" || route === "home2";
  const [title, sub] = isHome
    ? [greeting(profile.name), route === "home2" ? "2ª fase · habilidades clínicas" : todayLabel(boot.days_to_exam)]
    : (TITLES[route] ?? TITLES.dupla);

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
      soon={studentPhase2 ? soon : []}
      studentPhase2={studentPhase2}
      bare={route === "dupla-sala" && duplaAllowed(boot, dupla)}
      title={title}
      sub={sub}
      headerKind={route === "home" ? "inicio" : route === "hoje" ? "plano" : undefined}
      info={{
        name: profile.name || "Sua conta",
        streakDays: boot.play?.enabled ? boot.play.streak : boot.streak_days,
        flashcardsDue: boot.flashcards_due,
        onSignOut: () => signOut(),
        isStaff: isStaffRole(boot.role),
        isReviewer: Boolean(boot.reviewer_areas?.length),
        radarGraves: radar.graves,
        themeChoice: profile.theme || "light",
      }}
    >
      {emPrazoDeAceite(boot.legal) && <AvisoContratoNovo legal={boot.legal} onAceitar={() => navigate("/aceite")} />}
      {!CONNECTED.has(route) && <ReconstructionNotice />}
      <DicaPrimeiroUso route={route} />
      <TourNoPainel route={route} />
      {/* planos etapa 4: quanto sobra da amostra hoje (só com os cadeados ligados; desligados, nada aparece) */}
      {AMOSTRA_ROTA[route] && !isStaffRole(boot.role) && <AmostraFaixa recurso={AMOSTRA_ROTA[route]} go={go} />}
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

/** Aluno de verdade: não é equipe (admin/editor) nem revisor médico. Só o aluno tem o pop-up de cobrança e o sino de notificações. */
const ehAluno = (boot) => Boolean(boot) && !isStaffRole(boot.role) && !boot.reviewer_areas?.length;

/** Planos etapa 4, acima de todas as rotas (inclusive o treino, fora do menu): a mensagem "assine para liberar" quando o banco
 * recusa por plano e o pop-up dos avisos de cobrança (só aluno). Sem cadeados e sem cobrança ligados, nada aparece. */
function AvisosGlobais({ boot }) {
  const navigate = useNavigate();
  const go = (rota, query) => navigate(`/${rota}` + (query ? `?${new URLSearchParams(query)}` : ""));
  const aluno = ehAluno(boot);
  return (
    <>
      <CadeadoDialog go={go} />
      <AvisosPopup go={go} ativo={aluno} />
    </>
  );
}

function Root() {
  const session = useSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Contrato/Termo, Política e Regulamento são públicos: abrem com ou sem login, também carregando ou com erro.
  const publicPath = pathname.replace(/\/+$/, "");
  if (publicPath === "/termos") return <LegalPage doc="termos" />;
  if (publicPath === "/privacidade") return <LegalPage doc="privacidade" />;
  if (publicPath === "/regulamento") return <LegalPage doc="regulamento" />;

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
  // sessão única: a conta foi aberta em outro aparelho e este saiu; o aviso vem antes do login
  if (session.status === "signed-out" && session.derrubada) return <SessaoDerrubadaScreen aviso={session.derrubada} onEntrar={session.entrarNovamente} />;
  if (session.status === "signed-out") return <AuthFlow />;
  // Veio pelo link de recuperar senha: antes de qualquer tela do app, a pessoa cria a nova senha
  if (session.recovery) return <NewPasswordScreen />;
  // Aluno sem aceite do Termo vigente: a tela de aceite vem antes de qualquer rota (o servidor decide em gate_required)
  if (precisaTelaDeAceite(session.boot?.legal)) return <AcceptanceScreen />;
  // Contrato 3.0, cláusula 6.5-A: com plano pago ativo, o aceite pode esperar o fim do período; o aviso do app leva para cá
  if (publicPath === "/aceite") {
    if (emPrazoDeAceite(session.boot?.legal)) return <AcceptanceScreen onAgoraNao={() => navigate("/", { replace: true })} />;
    return <Navigate to="/" replace />;
  }
  // Conta nova: o onboarding (apresentação, configuração, nivelamento, plano) antes do app; o servidor decide (013720)
  if (deveMostrarOnboarding(session.boot)) return <Onboarding modo="primeira" />;
  if (deveMostrarNivelamento(session.boot)) return <Nivelamento modo="primeira" go={() => {}} />;

  // Comemorações do Stazi acima de todas as rotas (inclusive o treino/simulado, que fica fora do menu)
  // Central de Notificações (013830): o sino do cabeçalho e o pop-up de cobrança leem o mesmo estado (só para aluno)
  return (
    <CelebracoesProvider rota={pathname}>
      <NotificacoesProvider ativo={ehAluno(session.boot)}>
        <AvisosGlobais boot={session.boot} />
        <Routes>
          {/* /novo/login: sem sessão, qualquer endereço mostra o login; com sessão, volta para o início */}
          <Route path="/login" element={<Navigate to="/" replace />} />
          {/* /novo/entrar: o mesmo login, com o nome usado pela página inicial; com sessão, volta para o início */}
          <Route path="/entrar" element={<Navigate to="/" replace />} />
          {/* /novo/criar-conta: sem sessão abre o Criar conta (AuthFlow); com sessão, volta para o início */}
          <Route path="/criar-conta" element={<Navigate to="/" replace />} />
          <Route path="/dupla/perfil" element={<Screen view="dupla-perfil" />} />
          <Route path="/dupla/estacoes" element={<Navigate to="/estacoes" replace />} />
          <Route path="/dupla/sala/:roomId" element={<Screen view="dupla-sala" />} />
          <Route path="/:route?" element={<Screen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </NotificacoesProvider>
    </CelebracoesProvider>
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
