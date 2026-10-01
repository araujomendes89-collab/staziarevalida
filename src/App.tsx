import React, { useState, useEffect } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { BottomNav } from "./components/layout/BottomNav";
import { DashboardView } from "./components/dashboard/DashboardView";
import { QuestionsView } from "./components/questions/QuestionsView";
import { UnifiedReviewView } from "./components/review/UnifiedReviewView";
import { UnifiedOsceView } from "./components/osce/UnifiedOsceView";
import { UnifiedProgressView } from "./components/progress/UnifiedProgressView";
import { AdminEditorialView } from "./components/admin/AdminEditorialView";
import { DataExportView } from "./components/export/DataExportView";
import { StudyForMeModal } from "./components/modals/StudyForMeModal";
import { WhatIfModal } from "./components/modals/WhatIfModal";
import { PricingModal } from "./components/modals/PricingModal";
import { PricingPage } from "./components/pricing/PricingPage";
import { ExamConfigModal } from "./components/modals/ExamConfigModal";
import { OfficialMedicalSearchView } from "./components/search/OfficialMedicalSearchView";
import { OfficialSearchModal } from "./components/search/OfficialSearchModal";
import { StudentMemoryView } from "./components/memory/StudentMemoryView";
import { FunctionCallingAgentView } from "./components/agent/FunctionCallingAgentView";
import { VoiceTutorView } from "./components/voice/VoiceTutorView";
import { GrandesTemasView } from "./components/grandesTemas/GrandesTemasView";
import { QuestoesIAView } from "./components/questoesIA/QuestoesIAView";
import { AdaptiveCalendarView } from "./components/calendar/AdaptiveCalendarView";
import { EstudarView } from "./components/estudar/EstudarView";
import { PraticarView } from "./components/praticar/PraticarView";
import { RevisarView } from "./components/revisar/RevisarView";
import { PlanejamentoView } from "./components/planejamento/PlanejamentoView";
import { DesempenhoView } from "./components/desempenho/DesempenhoView";
import { TutorIaView } from "./components/tutor/TutorIaView";
import { ProfileSettingsView } from "./components/profile/ProfileSettingsView";
import { SimuladosHubView } from "./components/simulados/SimuladosHubView";
import { VideoLessonsCatalogView } from "./components/lessons/VideoLessonsCatalogView";
import { LoginView } from "./components/auth/LoginView";
import { EmailVerificationBanner } from "./components/auth/EmailVerificationBanner";
import { EmailVerificationRequiredView } from "./components/auth/EmailVerificationRequiredView";
import { OnboardingSplashView } from "./components/onboarding/OnboardingSplashView";
import { OnboardingWelcomeView } from "./components/onboarding/OnboardingWelcomeView";
import { OnboardingEcosystemView } from "./components/onboarding/OnboardingEcosystemView";
import { OnboardingDemoQuestionView } from "./components/onboarding/OnboardingDemoQuestionView";
import { OnboardingPersonalizationView } from "./components/onboarding/OnboardingPersonalizationView";
import { OnboardingProgressPreviewView } from "./components/onboarding/OnboardingProgressPreviewView";
import { OnboardingFinishView } from "./components/onboarding/OnboardingFinishView";
import { TermsOfUseView } from "./components/legal/TermsOfUseView";
import { PrivacyPolicyView } from "./components/legal/PrivacyPolicyView";
import { PlanSelectionView } from "./components/auth/PlanSelectionView";
import { CheckoutView } from "./components/billing/CheckoutView";
import { PaymentProcessingView } from "./components/billing/PaymentProcessingView";
import { PaymentSuccessView } from "./components/billing/PaymentSuccessView";
import { PaymentErrorView } from "./components/billing/PaymentErrorView";
import { MySubscriptionView } from "./components/billing/MySubscriptionView";
import {
  SHOW_SPLASH_FOR_ALL,
  hasSeenSplashThisSession,
  markSplashSeenThisSession,
} from "./config/splashConfig";
import { BrowserRouter, useLocation } from "react-router-dom";
import { testFirestoreConnection, FIRESTORE_DATABASE_ID, FIRESTORE_REGION } from "./lib/firebase";

const MainContent: React.FC = () => {
  const {
    activeTab,
    isExamConfigOpen,
    setIsExamConfigOpen,
    isOfficialSearchOpen,
    setIsOfficialSearchOpen,
    officialSearchQuery,
  } = useApp();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    async function runFirestoreHealthCheck() {
      console.log(
        `[StaziaMed Revalida] Checking Firestore connection to DB "${FIRESTORE_DATABASE_ID}" in region "${FIRESTORE_REGION}"...`
      );
      try {
        const isOnline = await testFirestoreConnection();
        if (isOnline) {
          console.log(
            `%c[Firestore: HEALTHY] Connected successfully to database: ${FIRESTORE_DATABASE_ID} (${FIRESTORE_REGION})`,
            "color: #10b981; font-weight: bold;"
          );
        } else {
          console.warn(
            `[Firestore: OFFLINE / FALLBACK] Local cache persistence active for database: ${FIRESTORE_DATABASE_ID}`
          );
        }
      } catch (err) {
        console.error(
          `[Firestore: HEALTH CHECK ERROR] Could not probe database: ${FIRESTORE_DATABASE_ID}`,
          err
        );
      }
    }

    runFirestoreHealthCheck();
  }, []);

  return (
    <div className="min-h-screen bg-[#F6F8FB] dark:bg-[#050b14] text-slate-800 dark:text-slate-100 flex font-sans selection:bg-teal-500/20 selection:text-teal-900 dark:selection:text-teal-50 relative">
      {/* Desktop Sidebar (Left column) */}
      <div className="hidden lg:flex lg:shrink-0 sticky top-0 h-screen z-30">
        <Sidebar />
      </div>

      {/* Mobile Slide-over Sidebar Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-64 bg-[#0B192C] h-full shadow-2xl flex flex-col">
            <Sidebar onCloseMobile={() => setIsMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Area (Header + Stage) */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        {/* Top Header */}
        <Header
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          isMobileMenuOpen={isMobileMenuOpen}
        />

        {/* Email Verification Alert Banner for unverified email/password accounts */}
        <EmailVerificationBanner />

        {/* Dynamic Center Stage Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-28 lg:pb-12 safe-bottom">
          {/* 1. Início */}
          {activeTab === "home" && <DashboardView />}

          {/* 2. Estudar (Plano de hoje, Aulas, Grandes Temas, Materiais oficiais) */}
          {(activeTab === "estudar" ||
            activeTab === "estudar-plano-hoje" ||
            activeTab === "estudar-aulas" ||
            activeTab === "estudar-grandes-temas" ||
            activeTab === "estudar-materiais" ||
            activeTab === "grandes-temas" ||
            activeTab === "official-search") && (
            <EstudarView
              initialSubTab={
                activeTab === "estudar-aulas"
                  ? "AULAS"
                  : activeTab === "estudar-grandes-temas" || activeTab === "grandes-temas"
                  ? "GRANDES_TEMAS"
                  : activeTab === "estudar-materiais" || activeTab === "official-search"
                  ? "MATERIAIS"
                  : "PLANO_HOJE"
              }
            />
          )}

          {/* 3. Praticar (Questões, Simulados, Provas completas, Questões geradas por IA) */}
          {(activeTab === "praticar" ||
            activeTab === "praticar-questoes" ||
            activeTab === "praticar-simulados" ||
            activeTab === "praticar-provas" ||
            activeTab === "praticar-questoes-ia" ||
            activeTab === "praticar-checklists" ||
            activeTab === "osce" ||
            activeTab === "questions" ||
            activeTab === "ineditas" ||
            activeTab === "questoes-ia") && (
            <PraticarView
              initialSubTab={
                activeTab === "praticar-simulados" || activeTab === "ineditas"
                  ? "SIMULADOS"
                  : activeTab === "praticar-provas"
                  ? "PROVAS"
                  : activeTab === "praticar-questoes-ia" || activeTab === "questoes-ia"
                  ? "QUESTOES_IA"
                  : activeTab === "praticar-checklists" || activeTab === "osce"
                  ? "CHECKLISTS"
                  : "QUESTOES"
              }
            />
          )}

          {/* 4. Revisar (Flashcards, Caderno de erros, Atualizações, Radar de diretrizes, Flash-Audio) */}
          {(activeTab === "revisar" ||
            activeTab === "revisar-flashcards" ||
            activeTab === "revisar-erros" ||
            activeTab === "revisar-atualizacoes" ||
            activeTab === "revisar-radar" ||
            activeTab === "revisar-audio" ||
            activeTab === "review" ||
            activeTab === "errors" ||
            activeTab === "guidelines" ||
            activeTab === "radar") && (
            <RevisarView
              initialSubTab={
                activeTab === "revisar-erros" || activeTab === "errors"
                  ? "ERRORS"
                  : activeTab === "revisar-atualizacoes"
                  ? "ATUALIZACOES"
                  : activeTab === "revisar-radar" || activeTab === "guidelines" || activeTab === "radar"
                  ? "RADAR"
                  : activeTab === "revisar-audio"
                  ? "AUDIO"
                  : "FLASHCARDS"
              }
            />
          )}

          {/* 5. Planejamento (Calendário, Plano semanal, Plano até a prova, Disponibilidade, Replanejamento) */}
          {(activeTab === "planejamento" ||
            activeTab === "planejamento-calendario" ||
            activeTab === "planejamento-semanal" ||
            activeTab === "planejamento-ate-prova" ||
            activeTab === "planejamento-disponibilidade" ||
            activeTab === "planejamento-replanejamento" ||
            activeTab === "calendario-inteligente" ||
            activeTab === "calendar") && (
            <PlanejamentoView
              initialSubTab={
                activeTab === "planejamento-semanal"
                  ? "SEMANAL"
                  : activeTab === "planejamento-ate-prova"
                  ? "ATE_PROVA"
                  : activeTab === "planejamento-disponibilidade"
                  ? "DISPONIBILIDADE"
                  : activeTab === "planejamento-replanejamento"
                  ? "REPLANEJAMENTO"
                  : "CALENDARIO"
              }
            />
          )}

          {/* 6. Desempenho (Visão geral, Evolução, Matriz de competências, Tendências INEP, Desempenho por área) */}
          {(activeTab === "desempenho" ||
            activeTab === "desempenho-geral" ||
            activeTab === "desempenho-evolucao" ||
            activeTab === "desempenho-matriz" ||
            activeTab === "desempenho-tendencias" ||
            activeTab === "desempenho-areas" ||
            activeTab === "progress" ||
            activeTab === "pattern-engine" ||
            activeTab === "matrix") && (
            <DesempenhoView
              initialSubTab={
                activeTab === "desempenho-evolucao"
                  ? "EVOLUCAO"
                  : activeTab === "desempenho-matriz" || activeTab === "matrix"
                  ? "MATRIZ"
                  : activeTab === "desempenho-tendencias" || activeTab === "pattern-engine"
                  ? "TENDENCIAS"
                  : activeTab === "desempenho-areas"
                  ? "AREAS"
                  : "GERAL"
              }
            />
          )}

          {/* 7. Tutor IA (Conversar com tutor, Modo trânsito, Histórico) */}
          {(activeTab === "tutor-ia" ||
            activeTab === "tutor-conversar" ||
            activeTab === "tutor-transito" ||
            activeTab === "tutor-historico" ||
            activeTab === "voice-tutor") && (
            <TutorIaView
              initialSubTab={
                activeTab === "tutor-transito"
                  ? "TRANSITO"
                  : activeTab === "tutor-historico"
                  ? "HISTORICO"
                  : "CONVERSAR"
              }
            />
          )}

          {/* Special / Advanced / Other modules */}
          {activeTab === "student-memory" && <StudentMemoryView />}
          {activeTab === "agent" && <FunctionCallingAgentView />}
          {activeTab === "admin" && <AdminEditorialView />}
          {(activeTab === "profile" || activeTab === "settings") && <ProfileSettingsView />}
          {activeTab === "export" && <DataExportView />}
          {activeTab === "subscription" && <PricingPage />}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />

      {/* Global Modals */}
      <StudyForMeModal />
      <WhatIfModal />
      <PricingModal />
      <ExamConfigModal
        isOpen={isExamConfigOpen}
        onClose={() => setIsExamConfigOpen(false)}
      />
      <OfficialSearchModal
        isOpen={isOfficialSearchOpen}
        onClose={() => setIsOfficialSearchOpen(false)}
        initialQuery={officialSearchQuery}
      />
    </div>
  );
};

export const AppRoot: React.FC = () => {
  const {
    firebaseUser,
    isAuthLoading,
    isGuestMode,
    profileResolutionStatus,
    profileError,
    retryProfileResolution,
    logout,
  } = useApp();
  const location = useLocation();
  const [splashSessionSeen, setSplashSessionSeen] = useState<boolean>(() =>
    hasSeenSplashThisSession()
  );

  // Development / Prototype Preview Routes for Onboarding
  if (location.pathname === "/onboarding/splash") {
    return <OnboardingSplashView />;
  }
  if (location.pathname === "/onboarding/welcome") {
    return <OnboardingWelcomeView />;
  }
  if (location.pathname === "/onboarding/ecosystem") {
    return <OnboardingEcosystemView />;
  }
  if (location.pathname === "/onboarding/experience") {
    return <OnboardingDemoQuestionView />;
  }
  if (location.pathname === "/onboarding/personalize") {
    return <OnboardingPersonalizationView />;
  }
  if (location.pathname === "/onboarding/progress-preview") {
    return <OnboardingProgressPreviewView />;
  }
  if (location.pathname === "/onboarding/finish") {
    return <OnboardingFinishView />;
  }
  if (location.pathname === "/termos-de-uso") {
    return <TermsOfUseView />;
  }
  if (location.pathname === "/politica-de-privacidade") {
    return <PrivacyPolicyView />;
  }
  if (location.pathname === "/auth/select-plan") {
    return <PlanSelectionView />;
  }
  if (
    location.pathname === "/planos" ||
    location.pathname === "/precos" ||
    location.pathname === "/assinatura" ||
    location.pathname === "/pricing"
  ) {
    return <PricingPage />;
  }
  if (location.pathname === "/checkout") {
    return <CheckoutView />;
  }
  if (location.pathname === "/pagamento/processando") {
    return <PaymentProcessingView />;
  }
  if (location.pathname === "/pagamento/sucesso") {
    return <PaymentSuccessView />;
  }
  if (location.pathname === "/pagamento/erro") {
    return <PaymentErrorView />;
  }
  if (location.pathname === "/conta/assinatura") {
    return <MySubscriptionView />;
  }

  if (isAuthLoading) {
    return (
      <div className="min-h-screen w-full bg-[#06101E] flex flex-col items-center justify-center p-4 text-white">
        <div className="flex flex-col items-center space-y-4 animate-in fade-in duration-300">
          <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-600 p-0.5 shadow-xl shadow-teal-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-[#07162A] rounded-[14px] flex items-center justify-center">
              <svg
                className="w-7 h-7 text-teal-300 animate-pulse"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 6l-8 6 8 6" />
                <circle cx="16" cy="6" r="2" fill="currentColor" />
                <circle cx="8" cy="12" r="2" fill="currentColor" />
                <circle cx="16" cy="18" r="2" fill="currentColor" />
              </svg>
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight text-white">
              Stazia<span className="text-teal-400">Med</span>{" "}
              <span className="text-[10px] font-black tracking-widest uppercase text-teal-400/90 ml-1">REVALIDA</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">Carregando ambiente seguro...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!firebaseUser && !isGuestMode) {
    return <LoginView />;
  }

  // Authenticated Profile Resolution Barrier (Fail-Closed)
  // Non-guest authenticated users MUST have their UserProfile resolved from Firestore before entering main content.
  if (firebaseUser && !isGuestMode) {
    if (profileResolutionStatus === "LOADING") {
      return (
        <div
          data-testid="profile-loading-barrier"
          className="min-h-screen w-full bg-[#06101E] flex flex-col items-center justify-center p-4 text-white"
        >
          <div className="flex flex-col items-center space-y-4 animate-in fade-in duration-300">
            <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-600 p-0.5 shadow-xl shadow-teal-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-[#07162A] rounded-[14px] flex items-center justify-center">
                <svg
                  className="w-7 h-7 text-teal-300 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              </div>
            </div>
            <div className="text-center space-y-1.5">
              <h1 className="text-lg font-bold tracking-tight text-white">
                Preparando seu perfil médico
              </h1>
              <p className="text-xs text-slate-400">
                Sincronizando dados acadêmicos e plano de estudos...
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (profileResolutionStatus === "ERROR") {
      return (
        <div
          data-testid="profile-error-barrier"
          className="min-h-screen w-full bg-[#06101E] flex flex-col items-center justify-center p-4 text-white"
        >
          <div className="max-w-md w-full bg-[#0B192C] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-bold text-white">
                Não foi possível carregar seu perfil
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                {profileError ||
                  "Ocorreu uma instabilidade de conexão ao sincronizar seu perfil médico. Por favor, tente novamente."}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => retryProfileResolution()}
                data-testid="retry-profile-button"
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-teal-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Tentar novamente
              </button>
              <button
                onClick={() => logout()}
                data-testid="logout-profile-button"
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs rounded-xl border border-slate-700 transition-all cursor-pointer"
              >
                Sair da conta
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  // Mandatory Full-Screen Email Verification Gate
  // When an account is registered with Email/Password and emailVerified is false,
  // block ALL app modules (Sidebar, Header, MainContent, Modals) and render only the confirmation screen.
  // Exception: Master Admin (araujomendes@staziamed.com.br / master UID) has full direct bypass.
  const isMasterUser = Boolean(
    (firebaseUser?.email || "").trim().toLowerCase() === "araujomendes@staziamed.com.br" ||
    firebaseUser?.uid === "cQjACVALpedbijS0WiCwuFRJgxj2"
  );
  const isGoogleAuth = Boolean(
    firebaseUser?.providerData?.some((p) => p.providerId === "google.com")
  );
  if (firebaseUser && !isMasterUser && !isGoogleAuth && !firebaseUser.emailVerified) {
    return <EmailVerificationRequiredView />;
  }

  // Global Splash Test Mode (Etapa 1.26E)
  // Shows the animated mascot splash screen once per session for all users who enter the app.
  if (SHOW_SPLASH_FOR_ALL && !splashSessionSeen) {
    return (
      <OnboardingSplashView
        onComplete={() => {
          markSplashSeenThisSession();
          setSplashSessionSeen(true);
        }}
      />
    );
  }

  return <MainContent />;
};

export function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoot />
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;
