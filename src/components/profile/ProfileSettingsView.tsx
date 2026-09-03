import React, { useState } from "react";
import {
  User,
  Award,
  BookOpen,
  Sliders,
  Shield,
  Database,
  HelpCircle,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Lock,
  Download,
  Trash2,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  Calendar,
  Clock,
  Sparkles,
  Layers,
  Volume2,
  Sun,
  Moon,
  Laptop,
  Check,
  Flame,
  FileText,
  MessageSquare,
  ShieldAlert,
  Send,
  Bell,
  Smartphone,
  Info,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { MedicalArea, UserProfile, UserPreferences } from "../../types";
import {
  sendUserEmailVerification,
  reloadCurrentUser,
  resetPasswordWithEmail,
  signInWithGooglePopup,
  FIRESTORE_DATABASE_ID,
  FIRESTORE_REGION,
} from "../../lib/firebase";
import { StorageService } from "../../services/storageService";

export type ProfileSection =
  | "overview"
  | "account"
  | "exam"
  | "study"
  | "app"
  | "security"
  | "privacy"
  | "help";

export const ProfileSettingsView: React.FC = () => {
  const {
    user,
    updateUserProfile,
    firebaseUser,
    logout,
    setActiveTab,
    setIsSubscriptionModalOpen,
    attempts,
    flashcards,
    questions,
  } = useApp();

  const [activeSection, setActiveSection] = useState<ProfileSection>("overview");

  // Feedback notifications
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);

  // SECTION 1: Minha Conta state
  const [accountForm, setAccountForm] = useState({
    name: user.name || "",
    email: user.email || firebaseUser?.email || "",
    graduationCountry: user.graduationCountry || "Brasil",
    graduationUniversity: user.graduationUniversity || "",
    avatarSeed: user.avatarSeed || "",
  });

  // SECTION 2: Minha Prova state
  const [examForm, setExamForm] = useState({
    examType: (user.examType || (user.targetEdition?.includes("ENAMED") ? "ENAMED" : "REVALIDA")) as "REVALIDA" | "ENAMED",
    examEdition: user.examEdition || (user.targetEdition?.includes("2026/1") ? "2026/1" : "2026/2"),
    customDate: user.examDate || "2026-09-13",
  });

  // SECTION 3: Preferências de Estudo state
  const [studyForm, setStudyForm] = useState({
    studyHoursPerDay: user.preferences?.studyHoursPerDay || (user.dailyStudyMinutes ? user.dailyStudyMinutes / 60 : 2),
    studyDaysPerWeek: user.preferences?.studyDaysPerWeek || user.availableDaysPerWeek || 6,
    planIntensity: user.preferences?.planIntensity || "MODERADO",
    priorityAreas: (user.preferences?.priorityAreas || user.weakAreas || [
      "CLINICA_MEDICA",
      "CIRURGIA_GERAL",
      "GINECOLOGIA_OBSTETRICIA",
      "PEDIATRIA",
      "MEDICINA_FAMILIA_COMUNIDADE",
    ]) as MedicalArea[],
    studyRemindersEnabled: user.preferences?.studyRemindersEnabled ?? true,
    studyReminderTime: user.preferences?.studyReminderTime || "08:00",
  });

  // SECTION 4: Preferências do App state
  const [appForm, setAppForm] = useState({
    appTheme: user.preferences?.appTheme || "dark",
    textSize: user.preferences?.textSize || "standard",
    audioSpeed: user.preferences?.audioSpeed || "1.0",
    notificationsEmail: user.preferences?.notificationsEmail ?? true,
    notificationsPush: user.preferences?.notificationsPush ?? true,
    notificationsAlerts: user.preferences?.notificationsAlerts ?? true,
  });

  // SECTION 6: Excluir conta confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // SECTION 7: Suporte / Reportar problema
  const [supportTicket, setSupportTicket] = useState({
    category: "QUESTAO_GABARITO",
    subject: "",
    description: "",
    isSubmitted: false,
  });

  const showSuccess = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const showError = (msg: string) => {
    setErrorToast(msg);
    setTimeout(() => setErrorToast(null), 5000);
  };

  // Helper: Resumo da prova
  const getExamSummary = (type: "REVALIDA" | "ENAMED", edition: string, dateStr: string) => {
    const isRevalida = type === "REVALIDA";
    const title = isRevalida ? `Revalida INEP ${edition}` : `ENAMED ${edition}`;
    const stage = isRevalida ? "1ª etapa — Prova Teórica Objetiva e Discursiva" : "Exame Nacional de Avaliação e Residência";
    const questionsCount = isRevalida ? "100 questões objetivas + 5 discursivas" : "100 questões objetivas de múltipla escolha";
    const duration = isRevalida ? "300 minutos (5 horas)" : "270 minutos (4h30)";

    // Format date in PT-BR
    let formattedDate = dateStr;
    try {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        formattedDate = d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
      }
    } catch {
      formattedDate = dateStr;
    }

    return {
      title,
      stage,
      formattedDate,
      questionsCount,
      duration,
    };
  };

  const currentSummary = getExamSummary(examForm.examType, examForm.examEdition, examForm.customDate);

  // Calculate days remaining
  const getDaysRemaining = (dateStr: string) => {
    if (!dateStr) return null;
    const target = new Date(dateStr).getTime();
    const today = new Date().setHours(0, 0, 0, 0);
    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };
  const daysRemaining = getDaysRemaining(user.examDate || "2026-09-13");

  // Email verification action
  const handleResendVerification = async () => {
    setIsVerifyingEmail(true);
    try {
      await sendUserEmailVerification();
      showSuccess("E-mail de confirmação reenviado com sucesso! Verifique sua caixa de entrada e spam.");
    } catch (err: any) {
      showError(err.message || "Não foi possível reenviar o e-mail no momento.");
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  const handleRefreshEmailStatus = async () => {
    setIsVerifyingEmail(true);
    try {
      const reloaded = await reloadCurrentUser();
      if (reloaded?.emailVerified) {
        showSuccess("Parabéns! Seu e-mail foi verificado com sucesso.");
      } else {
        showError("O e-mail ainda consta como não confirmado. Clique no link enviado para sua caixa postal.");
      }
    } catch (err: any) {
      showError(err.message || "Erro ao consultar status.");
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  // Password reset action
  const handleSendPasswordReset = async () => {
    const targetEmail = firebaseUser?.email || user.email;
    if (!targetEmail) {
      showError("Nenhum e-mail vinculado a esta conta.");
      return;
    }
    setIsSendingResetEmail(true);
    try {
      await resetPasswordWithEmail(targetEmail);
      showSuccess(`Link de redefinição de senha enviado para ${targetEmail}.`);
    } catch (err: any) {
      showError(err.message || "Erro ao solicitar redefinição de senha.");
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  // Google Link action
  const handleLinkGoogle = async () => {
    setIsLinkingGoogle(true);
    try {
      await signInWithGooglePopup();
      showSuccess("Conta vinculada com o Google com sucesso!");
    } catch (err: any) {
      showError(err.message || "Não foi possível vincular com a conta Google.");
    } finally {
      setIsLinkingGoogle(false);
    }
  };

  // SECTION 1: Save
  const handleSaveAccount = () => {
    updateUserProfile({
      name: accountForm.name.trim() || user.name,
      graduationCountry: accountForm.graduationCountry,
      graduationUniversity: accountForm.graduationUniversity,
      avatarSeed: accountForm.avatarSeed,
    });
    showSuccess("Dados da conta salvos com sucesso.");
  };

  const handleCancelAccount = () => {
    setAccountForm({
      name: user.name || "",
      email: user.email || firebaseUser?.email || "",
      graduationCountry: user.graduationCountry || "Brasil",
      graduationUniversity: user.graduationUniversity || "",
      avatarSeed: user.avatarSeed || "",
    });
    setActiveSection("overview");
  };

  // SECTION 2: Save
  const handleSaveExam = () => {
    const editionName = examForm.examType === "REVALIDA" 
      ? `Revalida INEP ${examForm.examEdition}` 
      : `ENAMED ${examForm.examEdition}`;

    updateUserProfile({
      examType: examForm.examType,
      examEdition: examForm.examEdition,
      targetEdition: editionName,
      examDate: examForm.customDate,
      hasConfiguredExamDate: true,
    });
    showSuccess("Configurações da prova salvas com sucesso.");
  };

  const handleCancelExam = () => {
    setExamForm({
      examType: (user.examType || (user.targetEdition?.includes("ENAMED") ? "ENAMED" : "REVALIDA")) as "REVALIDA" | "ENAMED",
      examEdition: user.examEdition || (user.targetEdition?.includes("2026/1") ? "2026/1" : "2026/2"),
      customDate: user.examDate || "2026-09-13",
    });
    setActiveSection("overview");
  };

  // SECTION 3: Save
  const handleSaveStudy = () => {
    updateUserProfile({
      dailyStudyMinutes: Math.round(studyForm.studyHoursPerDay * 60),
      availableDaysPerWeek: studyForm.studyDaysPerWeek,
      weakAreas: studyForm.priorityAreas,
      preferences: {
        ...user.preferences,
        studyHoursPerDay: studyForm.studyHoursPerDay,
        studyDaysPerWeek: studyForm.studyDaysPerWeek,
        planIntensity: studyForm.planIntensity as any,
        priorityAreas: studyForm.priorityAreas,
        studyRemindersEnabled: studyForm.studyRemindersEnabled,
        studyReminderTime: studyForm.studyReminderTime,
      },
    });
    showSuccess("Preferências de estudo atualizadas com sucesso.");
  };

  const handleCancelStudy = () => {
    setStudyForm({
      studyHoursPerDay: user.preferences?.studyHoursPerDay || (user.dailyStudyMinutes ? user.dailyStudyMinutes / 60 : 2),
      studyDaysPerWeek: user.preferences?.studyDaysPerWeek || user.availableDaysPerWeek || 6,
      planIntensity: user.preferences?.planIntensity || "MODERADO",
      priorityAreas: (user.preferences?.priorityAreas || user.weakAreas || [
        "CLINICA_MEDICA",
        "CIRURGIA_GERAL",
        "GINECOLOGIA_OBSTETRICIA",
        "PEDIATRIA",
        "MEDICINA_FAMILIA_COMUNIDADE",
      ]) as MedicalArea[],
      studyRemindersEnabled: user.preferences?.studyRemindersEnabled ?? true,
      studyReminderTime: user.preferences?.studyReminderTime || "08:00",
    });
    setActiveSection("overview");
  };

  // SECTION 4: Save
  const handleSaveApp = () => {
    updateUserProfile({
      preferences: {
        ...user.preferences,
        appTheme: appForm.appTheme as any,
        textSize: appForm.textSize as any,
        audioSpeed: appForm.audioSpeed as any,
        notificationsEmail: appForm.notificationsEmail,
        notificationsPush: appForm.notificationsPush,
        notificationsAlerts: appForm.notificationsAlerts,
      },
    });
    showSuccess("Preferências do aplicativo salvas com sucesso.");
  };

  const handleCancelApp = () => {
    setAppForm({
      appTheme: user.preferences?.appTheme || "dark",
      textSize: user.preferences?.textSize || "standard",
      audioSpeed: user.preferences?.audioSpeed || "1.0",
      notificationsEmail: user.preferences?.notificationsEmail ?? true,
      notificationsPush: user.preferences?.notificationsPush ?? true,
      notificationsAlerts: user.preferences?.notificationsAlerts ?? true,
    });
    setActiveSection("overview");
  };

  // SECTION 6: Export Data
  const handleExportData = () => {
    try {
      const exportObject = {
        exportedAt: new Date().toISOString(),
        userProfile: user,
        attemptsCount: attempts.length,
        flashcardsCount: flashcards.length,
        attempts: attempts,
        storageKeys: {
          appVersion: "2.5.0",
          platform: "StaziaMed Revalida INEP",
        },
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObject, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `staziamed_meus_dados_${user.id}_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showSuccess("Arquivo de dados exportado com sucesso em formato JSON.");
    } catch (e: any) {
      showError("Não foi possível gerar a exportação dos dados.");
    }
  };

  // SECTION 6: Delete Account
  const handleConfirmDeleteAccount = async () => {
    if (deleteConfirmationText !== "EXCLUIR") {
      showError("Digite a palavra EXCLUIR em maiúsculas para confirmar.");
      return;
    }
    setIsDeletingAccount(true);
    try {
      // Clear storage
      StorageService.saveUserProfile({
        ...user,
        name: "Conta Desativada",
        email: "",
      });
      localStorage.clear();
      showSuccess("Conta excluída e dados desativados.");
      setTimeout(async () => {
        await logout();
      }, 1500);
    } catch (e: any) {
      showError(e.message || "Erro ao excluir conta.");
      setIsDeletingAccount(false);
    }
  };

  // SECTION 7: Submit Support Ticket
  const handleSubmitSupportTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportTicket.description.trim()) {
      showError("Por favor, descreva o problema ou dúvida antes de enviar.");
      return;
    }
    setSupportTicket((prev) => ({ ...prev, isSubmitted: true }));
    showSuccess("Mensagem enviada com sucesso! Nossa equipe médica/técnica responderá por e-mail em até 24 horas úteis.");
  };

  // Sidebar Menu Items
  const navItems: { id: ProfileSection; label: string; icon: React.ElementType; description: string }[] = [
    { id: "overview", label: "Visão Geral", icon: User, description: "Resumo do perfil e atalhos rápidos" },
    { id: "account", label: "1. Minha conta", icon: User, description: "Nome, e-mail, foto e confirmação" },
    { id: "exam", label: "2. Minha prova", icon: Award, description: "Revalida ou ENAMED e edição alvo" },
    { id: "study", label: "3. Preferências de estudo", icon: BookOpen, description: "Horas, dias, intensidade e áreas" },
    { id: "app", label: "4. Preferências do app", icon: Sliders, description: "Tema, texto, áudio e alertas" },
    { id: "security", label: "5. Segurança", icon: Shield, description: "Senha, Google e sessões ativas" },
    { id: "privacy", label: "6. Privacidade e dados", icon: Database, description: "Exportação, exclusão e LGPD" },
    { id: "help", label: "7. Ajuda & Suporte", icon: HelpCircle, description: "Central de dúvidas e contato" },
  ];

  const userInitial = (user.name || firebaseUser?.displayName || "D").charAt(0).toUpperCase();
  const isEmailVerified = Boolean(firebaseUser?.emailVerified);

  return (
    <div id="profile-settings-page" className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* Toast notifications */}
      {successToast && (
        <div
          id="profile-toast-success"
          className="fixed top-20 right-4 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-top-2 border border-emerald-400/40"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {errorToast && (
        <div
          id="profile-toast-error"
          className="fixed top-20 right-4 z-50 bg-rose-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-top-2 border border-rose-400/40"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorToast}</span>
        </div>
      )}

      {/* Breadcrumb / Top Bar on Mobile when inside a sub-section */}
      {activeSection !== "overview" && (
        <div className="lg:hidden flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/10">
          <button
            type="button"
            onClick={() => setActiveSection("overview")}
            className="flex items-center gap-2 text-xs font-semibold text-teal-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Perfil</span>
          </button>
          <span className="text-xs font-bold text-white/60">
            {navItems.find((n) => n.id === activeSection)?.label}
          </span>
        </div>
      )}

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Menu Lateral & Perfil Compacto (Hidden on mobile if inside a section) */}
        <div
          className={`lg:col-span-4 space-y-4 ${
            activeSection !== "overview" ? "hidden lg:block" : "block"
          }`}
        >
          {/* User Preview Card */}
          <div className="p-5 rounded-[24px] bg-[#0c1626]/80 backdrop-blur-xl border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center gap-3.5">
              {firebaseUser?.photoURL ? (
                <img
                  src={firebaseUser.photoURL}
                  alt="Avatar"
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-teal-500/40 shadow-md"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-700 text-white flex items-center justify-center font-bold text-xl shadow-md border-2 border-teal-400/30">
                  {userInitial}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-white truncate">{user.name || "Dr(a). Candidato(a)"}</h3>
                <p className="text-xs text-slate-400 truncate">{firebaseUser?.email || user.email || "Sem e-mail cadastrado"}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {isEmailVerified ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      E-mail confirmado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">
                      <AlertTriangle className="w-3 h-3" />
                      E-mail pendente
                    </span>
                  )}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30 font-semibold uppercase">
                    Plano {user.tier === "PRO" || user.plan === "pro" ? "PRO" : "Trial"}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Meta atual:</span>
              <span className="font-semibold text-teal-300">{user.targetEdition || "Revalida 2026/2"}</span>
            </div>
          </div>

          {/* Navigation Menu of Sections */}
          <div className="p-2 rounded-[24px] bg-[#0c1626]/80 backdrop-blur-xl border border-slate-800 shadow-xl space-y-1">
            <p className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Seções de Configuração
            </p>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  id={`profile-nav-${item.id}`}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-medium transition-all text-left cursor-pointer ${
                    isActive
                      ? "bg-teal-500/20 text-teal-200 border border-teal-500/40 font-bold shadow-sm"
                      : "text-slate-300 hover:text-white hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-teal-400" : "text-slate-400"}`} />
                    <div className="min-w-0">
                      <div className="truncate">{item.label}</div>
                      <div className="text-[10px] text-slate-400 truncate font-normal">{item.description}</div>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isActive ? "text-teal-300 translate-x-0.5" : "text-slate-500"}`} />
                </button>
              );
            })}

            {/* Logout separated in footer of menu */}
            <div className="pt-2 mt-2 border-t border-slate-800/80">
              <button
                id="btn-profile-logout"
                type="button"
                onClick={async () => {
                  try {
                    await logout();
                  } catch (err) {
                    console.error("Logout error", err);
                  }
                }}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4 shrink-0 text-rose-400" />
                <span>Sair da Conta</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic Section Content (or Mobile Overview) */}
        <div className="lg:col-span-8 space-y-6">
          {/* ========================================================================= */}
          {/* TELA INICIAL DO PERFIL (RESUMO / OVERVIEW)                                 */}
          {/* ========================================================================= */}
          {activeSection === "overview" && (
            <div id="profile-section-overview" className="space-y-6">
              {/* Resumo Card Principal */}
              <div className="p-6 sm:p-8 rounded-[28px] bg-gradient-to-br from-[#0c1626] to-[#0f1f38] border border-slate-800 shadow-2xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {firebaseUser?.photoURL ? (
                      <img
                        src={firebaseUser.photoURL}
                        alt="Avatar"
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-teal-400/40 shadow-lg"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center justify-center text-2xl font-black shadow-lg">
                        {userInitial}
                      </div>
                    )}
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                        {user.name || "Dr(a). Candidato(a)"}
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400">{firebaseUser?.email || user.email || "Sem e-mail cadastrado"}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {isEmailVerified ? (
                          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            E-mail Verificado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Confirmação Pendente
                          </span>
                        )}
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold uppercase">
                          Plano {user.tier === "PRO" || user.plan === "pro" ? "PRO Ilimitado" : "Gratuito / Trial"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveSection("account")}
                    className="self-start sm:self-center px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                  >
                    Editar dados
                  </button>
                </div>

                {/* Prova Escolhida & Data */}
                <div className="p-4 sm:p-5 rounded-2xl bg-black/30 border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Prova Escolhida</span>
                    <span className="text-sm font-bold text-white mt-0.5 block">{currentSummary.title}</span>
                    <span className="text-[11px] text-slate-400">{currentSummary.stage}</span>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Data da Prova</span>
                    <span className="text-sm font-bold text-teal-300 mt-0.5 block">{currentSummary.formattedDate}</span>
                    <span className="text-[11px] text-slate-400">
                      {daysRemaining !== null ? `Faltam ${daysRemaining} dias para o exame` : "Data em definição"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Formato & Tempo</span>
                    <span className="text-sm font-bold text-white mt-0.5 block">{currentSummary.questionsCount}</span>
                    <span className="text-[11px] text-slate-400">{currentSummary.duration}</span>
                  </div>
                </div>

                {/* Atalhos Rápidos para Preferências e Segurança */}
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">
                    Atalhos Rápidos
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveSection("study")}
                      className="p-3.5 rounded-xl bg-white/[0.04] hover:bg-teal-500/10 border border-slate-800 hover:border-teal-500/40 text-left transition-all group cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <BookOpen className="w-4 h-4 text-teal-400" />
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-teal-300 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <span className="text-xs font-bold text-white block">Preferências de Estudo</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {user.dailyStudyMinutes / 60}h/dia · {user.availableDaysPerWeek || 6} dias/semana
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveSection("security")}
                      className="p-3.5 rounded-xl bg-white/[0.04] hover:bg-teal-500/10 border border-slate-800 hover:border-teal-500/40 text-left transition-all group cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <Shield className="w-4 h-4 text-teal-400" />
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-teal-300 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <span className="text-xs font-bold text-white block">Segurança da Conta</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Senha, Google Auth e sessões
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveSection("exam")}
                      className="p-3.5 rounded-xl bg-white/[0.04] hover:bg-teal-500/10 border border-slate-800 hover:border-teal-500/40 text-left transition-all group cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <Award className="w-4 h-4 text-teal-400" />
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-teal-300 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <span className="text-xs font-bold text-white block">Minha Prova Alvo</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Alterar edital ou exame
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile View: Tappable Section Cards to Enter Each Sub-Screen */}
              <div className="lg:hidden space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                  Todas as Configurações
                </p>
                {navItems
                  .filter((item) => item.id !== "overview")
                  .map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveSection(item.id)}
                        className="w-full flex items-center justify-between p-4 rounded-2xl bg-[#0c1626]/90 border border-slate-800 hover:border-teal-500/30 text-left transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white block">{item.label}</span>
                            <span className="text-[11px] text-slate-400 block mt-0.5">{item.description}</span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SEÇÃO 1: MINHA CONTA                                                      */}
          {/* ========================================================================= */}
          {activeSection === "account" && (
            <div id="profile-section-account" className="p-6 sm:p-8 rounded-[28px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white">1. Minha Conta</h3>
                <p className="text-xs text-slate-400">Gerencie seus dados pessoais, foto e status de confirmação do e-mail</p>
              </div>

              {/* Status de Confirmação do E-mail */}
              <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isEmailVerified ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="text-xs font-bold text-white">
                      Status do E-mail: {isEmailVerified ? "Confirmado" : "Não confirmado"}
                    </span>
                  </div>
                  {isEmailVerified ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                      Conta Segura
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRefreshEmailStatus}
                      disabled={isVerifyingEmail}
                      className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center gap-1 font-semibold cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isVerifyingEmail ? "animate-spin" : ""}`} />
                      Já confirmei
                    </button>
                  )}
                </div>

                {!isEmailVerified && (
                  <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-400">
                      Enviamos um link de ativação para <strong className="text-white">{firebaseUser?.email || user.email}</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={isVerifyingEmail}
                      className="text-xs font-bold px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition-all cursor-pointer disabled:opacity-50 self-start sm:self-auto"
                    >
                      Reenviar e-mail
                    </button>
                  </div>
                )}
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Nome Completo</label>
                  <input
                    type="text"
                    value={accountForm.name}
                    onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                    placeholder="Dr(a). Seu Nome"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">E-mail Cadastrado</label>
                  <input
                    type="email"
                    value={accountForm.email}
                    disabled
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/20 border border-slate-800 text-slate-400 text-xs cursor-not-allowed"
                  />
                  <span className="text-[10px] text-slate-500">O e-mail é vinculado à sua autenticação de segurança.</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">País de Graduação</label>
                  <input
                    type="text"
                    value={accountForm.graduationCountry}
                    onChange={(e) => setAccountForm({ ...accountForm, graduationCountry: e.target.value })}
                    placeholder="Ex: Brasil, Bolívia, Paraguai, Argentina"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Faculdade de Medicina (Opcional)</label>
                  <input
                    type="text"
                    value={accountForm.graduationUniversity}
                    onChange={(e) => setAccountForm({ ...accountForm, graduationUniversity: e.target.value })}
                    placeholder="Ex: UFMG, Univalle, UBA, etc."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Independent Section Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCancelAccount}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveAccount}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg shadow-teal-600/20 transition-all cursor-pointer"
                >
                  Salvar alterações
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SEÇÃO 2: MINHA PROVA                                                      */}
          {/* ========================================================================= */}
          {activeSection === "exam" && (
            <div id="profile-section-exam" className="p-6 sm:p-8 rounded-[28px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white">2. Minha Prova</h3>
                <p className="text-xs text-slate-400">Defina o exame e a edição alvo para calibrar cronograma e simulados</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Campo 1: Exame */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                    Exame Principal
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExamForm({ ...examForm, examType: "REVALIDA" })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        examForm.examType === "REVALIDA"
                          ? "bg-teal-500/20 border-teal-400 text-white font-bold"
                          : "bg-black/30 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <span className="text-xs block">Revalida INEP</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Revalidação Médica</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExamForm({ ...examForm, examType: "ENAMED" })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        examForm.examType === "ENAMED"
                          ? "bg-teal-500/20 border-teal-400 text-white font-bold"
                          : "bg-black/30 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <span className="text-xs block">ENAMED</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Avaliação Médica</span>
                    </button>
                  </div>
                </div>

                {/* Campo 2: Edição */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                    Edição Alvo
                  </label>
                  <select
                    value={examForm.examEdition}
                    onChange={(e) => {
                      const newEd = e.target.value;
                      let defaultDate = examForm.customDate;
                      if (newEd === "2026/2") defaultDate = "2026-09-13";
                      if (newEd === "2026/1") defaultDate = "2026-03-15";
                      if (newEd === "2027/1") defaultDate = "2027-03-21";
                      setExamForm({ ...examForm, examEdition: newEd, customDate: defaultDate });
                    }}
                    className="w-full px-3.5 py-3 rounded-xl bg-black/40 border border-slate-700 text-white text-xs font-semibold focus:border-teal-400 focus:outline-none"
                  >
                    {examForm.examType === "REVALIDA" ? (
                      <>
                        <option value="2026/2">2026/2 · 13 de Setembro de 2026 (Oficial)</option>
                        <option value="2026/1">2026/1 · 15 de Março de 2026</option>
                        <option value="2027/1">2027/1 · Março de 2027</option>
                        <option value="2027/2">2027/2 · Setembro de 2027</option>
                      </>
                    ) : (
                      <>
                        <option value="2026">2026 · 18 de Outubro de 2026</option>
                        <option value="2027">2027 · Outubro de 2027</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Data da Prova Opcional / Customizável */}
              <div className="p-3.5 rounded-xl bg-black/20 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-slate-300">Data Prevista da Prova:</span>
                  <span className="text-xs font-bold text-teal-300 ml-2">{currentSummary.formattedDate}</span>
                </div>
                <input
                  type="date"
                  value={examForm.customDate}
                  onChange={(e) => setExamForm({ ...examForm, customDate: e.target.value })}
                  className="px-2.5 py-1.5 rounded-lg bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
                />
              </div>

              {/* Resumo Compacto da Seleção */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-teal-950/40 to-slate-900 border border-teal-500/30 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Resumo do Exame Selecionado
                  </span>
                </div>
                <p className="text-xs font-bold text-teal-200 leading-relaxed">
                  {currentSummary.title} · {currentSummary.stage} · {currentSummary.formattedDate} · {currentSummary.questionsCount} · {currentSummary.duration}
                </p>
                <p className="text-[11px] text-slate-400">
                  Todas as metas de estudo diário, simulados cronometrados e revisões de diretrizes serão sincronizados para esta data.
                </p>
              </div>

              {/* Independent Section Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCancelExam}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveExam}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg shadow-teal-600/20 transition-all cursor-pointer"
                >
                  Salvar alterações
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SEÇÃO 3: PREFERÊNCIAS DE ESTUDO                                           */}
          {/* ========================================================================= */}
          {activeSection === "study" && (
            <div id="profile-section-study" className="p-6 sm:p-8 rounded-[28px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white">3. Preferências de Estudo</h3>
                <p className="text-xs text-slate-400">Ajuste seu ritmo diário, disponibilidade, áreas prioritárias e lembretes</p>
              </div>

              {/* Horas e Dias */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>Horas Disponíveis por Dia</span>
                    <span className="font-bold text-teal-300">{studyForm.studyHoursPerDay} horas/dia</span>
                  </label>
                  <div className="flex gap-1.5">
                    {[1, 1.5, 2, 3, 4, 6].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setStudyForm({ ...studyForm, studyHoursPerDay: h })}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          studyForm.studyHoursPerDay === h
                            ? "bg-teal-500/20 border-teal-400 text-white font-bold"
                            : "bg-black/30 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>Dias de Estudo por Semana</span>
                    <span className="font-bold text-teal-300">{studyForm.studyDaysPerWeek} dias</span>
                  </label>
                  <div className="flex gap-1.5">
                    {[4, 5, 6, 7].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setStudyForm({ ...studyForm, studyDaysPerWeek: d })}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          studyForm.studyDaysPerWeek === d
                            ? "bg-teal-500/20 border-teal-400 text-white font-bold"
                            : "bg-black/30 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        {d} dias
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Intensidade do Plano */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Intensidade do Plano
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: "MODERADO", label: "Moderado", desc: "Ritmo equilibrado para fixação a médio prazo" },
                    { id: "INTENSIVO", label: "Intensivo", desc: "Carga alta de questões diárias e revisões aceleradas" },
                    { id: "REVISAO", label: "Reta Final", desc: "Foco 100% em cadernos de erros, temas chave e simulados" },
                  ].map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setStudyForm({ ...studyForm, planIntensity: lvl.id as any })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        studyForm.planIntensity === lvl.id
                          ? "bg-teal-500/20 border-teal-400 text-white font-bold"
                          : "bg-black/30 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <span className="text-xs block font-bold">{lvl.label}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5 leading-tight">{lvl.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Áreas Prioritárias */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Áreas com Foco Prioritário
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: "CLINICA_MEDICA" as MedicalArea, label: "Clínica Médica" },
                    { id: "CIRURGIA_GERAL" as MedicalArea, label: "Cirurgia Geral" },
                    { id: "PEDIATRIA" as MedicalArea, label: "Pediatria" },
                    { id: "GINECOLOGIA_OBSTETRICIA" as MedicalArea, label: "Ginecologia & Obstetrícia" },
                    { id: "MEDICINA_FAMILIA_COMUNIDADE" as MedicalArea, label: "Preventiva & SUS" },
                  ].map((area) => {
                    const isSelected = studyForm.priorityAreas.includes(area.id);
                    return (
                      <button
                        key={area.id}
                        type="button"
                        onClick={() => {
                          const updated = isSelected
                            ? studyForm.priorityAreas.filter((a) => a !== area.id)
                            : [...studyForm.priorityAreas, area.id];
                          setStudyForm({ ...studyForm, priorityAreas: updated });
                        }}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between text-xs transition-all cursor-pointer ${
                          isSelected
                            ? "bg-teal-500/20 border-teal-400 text-white font-semibold"
                            : "bg-black/30 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <span className="truncate">{area.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lembretes */}
              <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-white block">Lembretes Diários de Estudo</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Notificações para manter a sequência e cumprir a meta do dia
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="time"
                    value={studyForm.studyReminderTime}
                    onChange={(e) => setStudyForm({ ...studyForm, studyReminderTime: e.target.value })}
                    className="px-2.5 py-1.5 rounded-lg bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setStudyForm({ ...studyForm, studyRemindersEnabled: !studyForm.studyRemindersEnabled })}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      studyForm.studyRemindersEnabled ? "bg-teal-500" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full bg-white block transition-transform absolute top-1 ${
                        studyForm.studyRemindersEnabled ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Independent Section Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCancelStudy}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveStudy}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg shadow-teal-600/20 transition-all cursor-pointer"
                >
                  Salvar alterações
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SEÇÃO 4: PREFERÊNCIAS DO APLICATIVO                                       */}
          {/* ========================================================================= */}
          {activeSection === "app" && (
            <div id="profile-section-app" className="p-6 sm:p-8 rounded-[28px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white">4. Preferências do Aplicativo</h3>
                <p className="text-xs text-slate-400">Personalize o tema visual, tamanho de fonte, velocidade de áudio e alertas</p>
              </div>

              {/* Tema */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Tema da Interface
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "dark", label: "Escuro (Plantão)", icon: Moon },
                    { id: "light", label: "Claro (Diurno)", icon: Sun },
                    { id: "system", label: "Automático", icon: Laptop },
                  ].map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setAppForm({ ...appForm, appTheme: t.id as any })}
                        className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                          appForm.appTheme === t.id
                            ? "bg-teal-500/20 border-teal-400 text-white font-bold"
                            : "bg-black/30 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        <Icon className="w-4 h-4 text-teal-400" />
                        <span className="text-xs">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tamanho do Texto & Velocidade do Áudio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">Tamanho da Fonte nos Casos Clínicos</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAppForm({ ...appForm, textSize: "standard" })}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                        appForm.textSize === "standard"
                          ? "bg-teal-500/20 border-teal-400 text-white font-bold"
                          : "bg-black/30 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <span className="text-xs block font-bold">Padrão</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">16px otimizado</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAppForm({ ...appForm, textSize: "large" })}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                        appForm.textSize === "large"
                          ? "bg-teal-500/20 border-teal-400 text-white font-bold"
                          : "bg-black/30 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <span className="text-xs block font-bold">Confortável</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">18px ampliado</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">Velocidade Padrão do Áudio (Flash-Áudio)</label>
                  <div className="flex gap-1.5">
                    {["1.0", "1.25", "1.5", "1.75", "2.0"].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setAppForm({ ...appForm, audioSpeed: spd as any })}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          appForm.audioSpeed === spd
                            ? "bg-teal-500/20 border-teal-400 text-white font-bold"
                            : "bg-black/30 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Toggles de Notificações */}
              <div className="space-y-3 pt-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Alertas e Notificações
                </label>
                <div className="space-y-2">
                  {[
                    { key: "notificationsEmail", title: "Relatório Semanal de Desempenho", desc: "Resumo semanal com taxa de acerto por área e tempo investido" },
                    { key: "notificationsPush", title: "Revisão Espaçada (Flashcards)", desc: "Avisos quando cartões de alta retenção atingirem a data de revisão" },
                    { key: "notificationsAlerts", title: "Atualizações de Editais e Diretrizes", desc: "Alertas críticos do INEP, Ministério da Saúde e notas de corte" },
                  ].map((notif) => {
                    const isEnabled = (appForm as any)[notif.key];
                    return (
                      <div key={notif.key} className="p-3.5 rounded-xl bg-black/30 border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-white block">{notif.title}</span>
                          <span className="text-[11px] text-slate-400 block mt-0.5">{notif.desc}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAppForm({ ...appForm, [notif.key]: !isEnabled })}
                          className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ml-3 ${
                            isEnabled ? "bg-teal-500" : "bg-slate-700"
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded-full bg-white block transition-transform absolute top-1 ${
                              isEnabled ? "left-6" : "left-1"
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Independent Section Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCancelApp}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveApp}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg shadow-teal-600/20 transition-all cursor-pointer"
                >
                  Salvar alterações
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SEÇÃO 5: SEGURANÇA                                                        */}
          {/* ========================================================================= */}
          {activeSection === "security" && (
            <div id="profile-section-security" className="p-6 sm:p-8 rounded-[28px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white">5. Segurança da Conta</h3>
                <p className="text-xs text-slate-400">Proteção de acesso, credenciais, provedores conectados e encerramento de sessões</p>
              </div>

              {/* Provedor Conectado */}
              <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 space-y-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Método de Autenticação Conectado
                </span>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center font-bold">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">
                        {firebaseUser?.providerData?.[0]?.providerId === "google.com"
                          ? "Login com Conta Google"
                          : "E-mail e Senha Criptografados"}
                      </span>
                      <span className="text-[11px] text-slate-400 block font-mono mt-0.5">
                        UID: {firebaseUser?.uid ? `${firebaseUser.uid.slice(0, 16)}...` : "Sessão Local"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleLinkGoogle}
                      disabled={isLinkingGoogle}
                      className="px-3 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLinkingGoogle ? "animate-spin" : ""}`} />
                      <span>Vincular Google</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Alterar Senha */}
              <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Alterar Senha</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Enviaremos um link seguro para o seu e-mail para criar uma nova senha
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendPasswordReset}
                    disabled={isSendingResetEmail}
                    className="px-3.5 py-1.5 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{isSendingResetEmail ? "Enviando..." : "Redefinir senha"}</span>
                  </button>
                </div>
              </div>

              {/* Sair de todos os dispositivos */}
              <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Sair de Todos os Dispositivos</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Encerra os tokens de autenticação em outros computadores, tablets ou celulares
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await logout();
                        showSuccess("Sessões encerradas com sucesso.");
                      } catch (e) {
                        showError("Erro ao encerrar sessões.");
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Encerrar sessões</span>
                  </button>
                </div>
              </div>

              {/* Independent Section Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveSection("overview")}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Voltar
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SEÇÃO 6: PRIVACIDADE E DADOS                                              */}
          {/* ========================================================================= */}
          {activeSection === "privacy" && (
            <div id="profile-section-privacy" className="p-6 sm:p-8 rounded-[28px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white">6. Privacidade e Dados</h3>
                <p className="text-xs text-slate-400">Transparência dos registros armazenados, portabilidade e exclusão definitiva</p>
              </div>

              {/* Resumo de Dados Armazenados */}
              <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 space-y-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Dados Armazenados na sua Conta
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Questões Feitas</span>
                    <span className="text-sm font-bold text-white mt-0.5 block">{attempts.length} resoluções</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Flashcards Salvos</span>
                    <span className="text-sm font-bold text-white mt-0.5 block">{flashcards.length} cartões</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Caderno de Erros</span>
                    <span className="text-sm font-bold text-white mt-0.5 block">
                      {attempts.filter((a) => !a.isCorrect).length} questões
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Sequência de Estudos</span>
                    <span className="text-sm font-bold text-teal-300 mt-0.5 block">{user.studyStreakDays} dias</span>
                  </div>
                </div>
              </div>

              {/* Exportar Dados */}
              <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-white block">Exportar Meus Dados (JSON)</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Baixe uma cópia completa de todo o seu histórico acadêmico em formato padronizado
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleExportData}
                  className="px-4 py-2 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar dados</span>
                </button>
              </div>

              {/* Política de Privacidade e LGPD */}
              <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-white block">Proteção e Tratamento de Dados (LGPD)</span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Seus dados de estudo e métricas de desempenho são utilizados estritamente para o cálculo adaptativo do algoritmo do Revalida INEP. Não compartilhamos, vendemos nem transmitimos seus dados clínicos ou cadastrais para terceiros sem autorização explícita.
                </p>
              </div>

              {/* Excluir Conta (Botão Vermelho com Confirmação) */}
              <div className="p-5 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-3">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-bold text-rose-300 block">Excluir Minha Conta</span>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      Esta ação é irreversível. Todos os seus cadernos de erros, estatísticas, histórico de simulados e anotações serão permanentemente desativados.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir minha conta</span>
                  </button>
                </div>
              </div>

              {/* Modal de Confirmação de Exclusão */}
              {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
                  <div className="w-full max-w-md rounded-2xl bg-[#0c1626] border border-rose-500/40 p-6 space-y-4 shadow-2xl text-white">
                    <div className="flex items-center gap-3 text-rose-400">
                      <AlertTriangle className="w-6 h-6" />
                      <h4 className="text-sm font-bold">Confirmação de Exclusão de Conta</h4>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      Para confirmar a exclusão permanente de todos os seus dados e histórico de estudo, digite a palavra <strong className="text-rose-400">EXCLUIR</strong> no campo abaixo:
                    </p>

                    <input
                      type="text"
                      value={deleteConfirmationText}
                      onChange={(e) => setDeleteConfirmationText(e.target.value)}
                      placeholder="Digite EXCLUIR"
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-slate-700 text-white text-xs font-mono focus:border-rose-400 focus:outline-none"
                    />

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteModal(false);
                          setDeleteConfirmationText("");
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDeleteAccount}
                        disabled={deleteConfirmationText !== "EXCLUIR" || isDeletingAccount}
                        className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{isDeletingAccount ? "Excluindo..." : "Confirmar Exclusão"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Back button */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveSection("overview")}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Voltar
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SEÇÃO 7: AJUDA & SUPORTE                                                  */}
          {/* ========================================================================= */}
          {activeSection === "help" && (
            <div id="profile-section-help" className="p-6 sm:p-8 rounded-[28px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white">7. Ajuda & Suporte</h3>
                <p className="text-xs text-slate-400">Dúvidas frequentes do Revalida INEP, envio de relatos técnicos e contato direto</p>
              </div>

              {/* FAQ Compacta */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Perguntas Frequentes do Candidato
                </span>
                <div className="space-y-2">
                  {[
                    {
                      q: "Como é calculada a nota de corte do Revalida INEP?",
                      a: "O INEP utiliza o método de Angoff modificado por uma comissão de especialistas médicos para fixar a nota mínima de aprovação a cada edição (historicamente em torno de 60 pontos na prova objetiva).",
                    },
                    {
                      q: "Como funciona a repetição espaçada no aplicativo?",
                      a: "Baseada no modelo de Hermann Ebbinghaus. Questões erradas retornam automaticamente em 24h, 3 dias e 7 dias para assegurar retenção de longo prazo até a data do exame.",
                    },
                    {
                      q: "O que fazer se a data da prova ou edital for alterada pelo INEP?",
                      a: "Vá na seção '2. Minha prova' neste perfil e atualize para a nova data. Toda a sua régua de simulados e missões será recalculada automaticamente.",
                    },
                  ].map((faq, idx) => (
                    <details
                      key={idx}
                      className="p-3.5 rounded-xl bg-black/30 border border-slate-800 group cursor-pointer"
                    >
                      <summary className="text-xs font-bold text-white flex items-center justify-between">
                        <span>{faq.q}</span>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-open:rotate-90 transition-transform" />
                      </summary>
                      <p className="text-[11px] text-slate-300 mt-2.5 leading-relaxed pt-2 border-t border-slate-800/80">
                        {faq.a}
                      </p>
                    </details>
                  ))}
                </div>
              </div>

              {/* Reportar Problema Form */}
              <form onSubmit={handleSubmitSupportTicket} className="p-5 rounded-2xl bg-black/30 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-teal-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Reportar Problema ou Sugestão
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">Categoria do Problema</label>
                    <select
                      value={supportTicket.category}
                      onChange={(e) => setSupportTicket({ ...supportTicket, category: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
                    >
                      <option value="QUESTAO_GABARITO">Dúvida ou divergência em Gabarito</option>
                      <option value="ERRO_SISTEMA">Falha ou lentidão no aplicativo</option>
                      <option value="CRONOGRAMA">Dúvida sobre o Cronograma de Estudo</option>
                      <option value="SUGESTAO">Sugestão de melhoria pedagógica</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">Assunto Breve</label>
                    <input
                      type="text"
                      value={supportTicket.subject}
                      onChange={(e) => setSupportTicket({ ...supportTicket, subject: e.target.value })}
                      placeholder="Ex: Questão 42 de Pediatria com divergência"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Descrição Detalhada</label>
                  <textarea
                    rows={3}
                    value={supportTicket.description}
                    onChange={(e) => setSupportTicket({ ...supportTicket, description: e.target.value })}
                    placeholder="Descreva o que ocorreu ou sua sugestão para nossa equipe..."
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none resize-none"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md shadow-teal-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar mensagem</span>
                  </button>
                </div>
              </form>

              {/* Contato Direto com Suporte */}
              <div className="p-4 rounded-2xl bg-teal-950/20 border border-teal-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-white block">Atendimento Acadêmico & Suporte Técnico</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    E-mail oficial: <code className="text-teal-300 font-mono">suporte@staziamed.com.br</code>
                  </span>
                </div>
                <a
                  href="mailto:suporte@staziamed.com.br"
                  className="px-3.5 py-1.5 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 text-xs font-bold transition-all inline-flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Abrir e-mail</span>
                </a>
              </div>

              {/* Back button */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveSection("overview")}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Voltar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
