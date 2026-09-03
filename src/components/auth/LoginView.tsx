import React, { useState, useEffect } from "react";
import {
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowRight,
  BookOpen,
  Brain,
  Calendar,
  BarChart2,
  ShieldCheck,
  Headphones,
  Loader2,
  Sun,
  Moon,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  UserPlus,
  LogIn,
} from "lucide-react";
import { useApp } from "../../context/AppContext";

type AuthMode = "LOGIN" | "REGISTER" | "FORGOT_PASSWORD";

export const LoginView: React.FC = () => {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    setActiveTab,
    logout,
    isDarkMode,
    setIsDarkMode,
  } = useApp();

  const [mode, setMode] = useState<AuthMode>("LOGIN");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [suggestRegister, setSuggestRegister] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [activeHighlight, setActiveHighlight] = useState(0);

  const platformHighlights = [
    {
      icon: Brain,
      title: "IA Adaptativa",
      subtitle: "Ciclos de estudo focados nas suas fraquezas clínicas",
    },
    {
      icon: BookOpen,
      title: "40.000+ Questões",
      subtitle: "Comentadas detalhadamente por especialistas",
    },
    {
      icon: Calendar,
      title: "Plano Inteligente",
      subtitle: "Metas diárias, repetição espaçada e estações OSCE",
    },
    {
      icon: BarChart2,
      title: "Desempenho em Tempo Real",
      subtitle: "Probabilidade de aprovação e métricas INEP",
    },
  ];

  // Auto-rotate highlight banner on mobile/tablet every 4.5s
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveHighlight((prev) => (prev + 1) % platformHighlights.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [platformHighlights.length]);

  const isSubmitting = isLoading || isLoadingGoogle;

  const validateForm = (): boolean => {
    const errors: { name?: string; email?: string; password?: string } = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (mode === "REGISTER" && name.trim().length > 0 && name.trim().length < 2) {
      errors.name = "O nome deve ter pelo menos 2 caracteres.";
    }

    if (!email.trim()) {
      errors.email = "Informe seu endereço de e-mail.";
    } else if (!emailRegex.test(email.trim())) {
      errors.email = "Formato de e-mail inválido (exemplo: doutor@medicina.com.br).";
    }

    if (mode !== "FORGOT_PASSWORD") {
      if (!password) {
        errors.password = "Informe sua senha de acesso.";
      } else if (password.length < 6) {
        errors.password = "A senha deve conter no mínimo 6 caracteres.";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const getPortugueseAuthError = (errorCode: string): { message: string; suggestSignUp?: boolean } => {
    switch (errorCode) {
      case "auth/email-already-in-use":
        return {
          message: "Este e-mail já está cadastrado. Faça login ou utilize a recuperação de senha.",
        };
      case "auth/invalid-email":
        return { message: "O endereço de e-mail fornecido não possui um formato válido." };
      case "auth/user-not-found":
        return {
          message: "Nenhuma conta cadastrada encontrada com este e-mail. Deseja criar uma conta agora?",
          suggestSignUp: true,
        };
      case "auth/wrong-password":
        return {
          message: "Senha incorreta. Verifique os caracteres ou clique em 'Esqueci minha senha'.",
        };
      case "auth/invalid-credential":
        return {
          message: "E-mail ou senha não conferem. Se você ainda não possui cadastro, clique em 'Criar Conta' para se registrar.",
          suggestSignUp: true,
        };
      case "auth/weak-password":
        return { message: "Senha fraca. Escolha uma senha com no mínimo 6 caracteres." };
      case "auth/user-disabled":
        return { message: "Esta conta foi temporariamente desativada pelo administrador." };
      case "auth/popup-closed-by-user":
        return { message: "A janela de autenticação do Google foi fechada antes da conclusão." };
      case "auth/popup-blocked":
        return { message: "O navegador bloqueou a janela pop-up do Google. Por favor, permita pop-ups para este site." };
      case "auth/network-request-failed":
        return { message: "Falha de comunicação com os servidores. Verifique sua conexão com a internet." };
      case "auth/too-many-requests":
        return { message: "Muitas tentativas consecutivas. Aguarde alguns instantes antes de tentar novamente." };
      case "auth/operation-not-allowed":
        return { message: "O método de autenticação não está habilitado no momento." };
      default:
        return { message: "Não foi possível autenticar. Verifique os dados e tente novamente." };
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setSuggestRegister(false);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      if (mode === "LOGIN") {
        await signInWithEmail(email.trim(), password);
        setActiveTab("home");
      } else if (mode === "REGISTER") {
        const displayName = name.trim() || undefined;
        await signUpWithEmail(email.trim(), password, displayName);
        setActiveTab("home");
      } else if (mode === "FORGOT_PASSWORD") {
        await sendPasswordReset(email.trim());
        setSuccessMessage("Link de redefinição de senha enviado para o e-mail informado! Verifique sua caixa de entrada.");
      }
    } catch (err: any) {
      console.error("[LoginView] Auth action error:", err);
      if (mode === "REGISTER") {
        await logout().catch(() => {});
      }
      const code = err?.code || "";
      const errorObj = getPortugueseAuthError(code);
      setErrorMessage(errorObj.message);
      if (errorObj.suggestSignUp && mode === "LOGIN") {
        setSuggestRegister(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSubmit = async () => {
    if (isSubmitting) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setSuggestRegister(false);
    setFieldErrors({});
    setIsLoadingGoogle(true);

    try {
      await signInWithGoogle();
      setActiveTab("home");
    } catch (err: any) {
      console.error("[LoginView] Google Sign-In error:", err);
      const code = err?.code || "";
      if (code !== "auth/popup-closed-by-user") {
        const errorObj = getPortugueseAuthError(code);
        setErrorMessage(errorObj.message);
      }
    } finally {
      setIsLoadingGoogle(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setErrorMessage(null);
    setSuccessMessage(null);
    setSuggestRegister(false);
    setFieldErrors({});
  };

  return (
    <div className="min-h-screen w-full bg-[#06101E] flex items-center justify-center p-3 sm:p-6 lg:p-10 font-sans relative overflow-x-hidden selection:bg-teal-500/30 selection:text-teal-200">
      {/* Background Ambience Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Responsive Split Container: Controlled width on mobile/tablet, 2-column split on desktop/landscape */}
      <div className="w-full max-w-md sm:max-w-xl lg:max-w-6xl grid grid-cols-1 lg:grid-cols-12 rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-[#08172D] relative z-10 my-auto">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: Institutional & Platform Benefits (Hidden on mobile/tablet) */}
        {/* ========================================================================= */}
        <div className="hidden lg:flex lg:col-span-6 bg-gradient-to-b from-[#081A32] via-[#07152A] to-[#040C1A] p-8 lg:p-12 flex-col justify-between relative overflow-hidden text-white border-r border-white/10">
          {/* Subtle Dot Matrix Background Decorative Watermark */}
          <div className="absolute inset-0 pointer-events-none select-none opacity-[0.04]">
            <div
              className="w-full h-full"
              style={{
                backgroundImage: "radial-gradient(#00d2b4 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />
          </div>

          {/* Caduceus / Rod of Asclepius Medical Symbol Watermark */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 pointer-events-none select-none opacity-10 hidden sm:block">
            <svg
              className="w-80 h-80 text-teal-400"
              viewBox="0 0 200 200"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="100" y1="15" x2="100" y2="185" strokeWidth="4" />
              <circle cx="100" cy="18" r="7" fill="currentColor" />
              <path d="M100 35 C 70 20, 40 45, 25 70 C 45 65, 75 60, 100 55" />
              <path d="M100 35 C 130 20, 160 45, 175 70 C 155 65, 125 60, 100 55" />
              <path d="M70 70 C 85 55, 115 55, 130 75 C 145 95, 115 110, 75 115 C 60 120, 70 145, 100 150 C 130 155, 135 175, 100 180" />
            </svg>
          </div>

          {/* Top Section: StaziaMed Revalida Logo */}
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3">
              <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-600 p-0.5 shadow-lg shadow-teal-500/20 shrink-0 flex items-center justify-center">
                <div className="w-full h-full bg-[#07162A] rounded-[14px] flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-teal-300"
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

              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white leading-none">
                  Stazia<span className="text-teal-400 font-extrabold">Med</span>
                </h1>
                <span className="text-[10px] font-black tracking-[0.25em] text-teal-400/90 uppercase block mt-1">
                  REVALIDA
                </span>
              </div>
            </div>

            {/* Main Headline & Subtitle */}
            <div className="space-y-3 pt-4">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
                Sua aprovação <br className="hidden sm:block" />
                começa com{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-teal-400 to-cyan-400">
                  estratégia.
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed max-w-lg font-normal">
                Plataforma completa para sua preparação para o{" "}
                <strong className="text-teal-300 font-semibold">Revalida INEP</strong> com
                método inteligente, questões comentadas e banco de dados sincronizado em tempo real.
              </p>
            </div>

            {/* 4 Core Value Proposition Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5 pt-2">
              <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-teal-500/30 transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <BookOpen className="w-5 h-5 text-teal-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-white tracking-wide">
                    Questões comentadas & inéditas
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    Mais de 40 mil questões detalhadas por especialistas
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-teal-500/30 transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Brain className="w-5 h-5 text-teal-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-white tracking-wide">
                    IA diagnóstica e adaptativa
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    Ciclos de estudo personalizados para o seu perfil
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-teal-500/30 transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Calendar className="w-5 h-5 text-teal-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-white tracking-wide">
                    Plano de estudos inteligente
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    Metas diárias, repetição espaçada e simulações OSCE
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-teal-500/30 transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <BarChart2 className="w-5 h-5 text-teal-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-white tracking-wide">
                    Desempenho em tempo real
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    Métricas de prontidão e probabilidade de aprovação
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Testimonial Card */}
          <div className="relative z-10 mt-8 pt-4">
            <div className="p-4 sm:p-5 rounded-2xl bg-[#0B213D]/80 border border-teal-500/20 backdrop-blur-xs space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-serif text-teal-400 leading-none">“</span>
                <p className="text-xs sm:text-sm font-medium text-slate-200">
                  A plataforma mais completa para quem leva o Revalida a sério.
                </p>
              </div>
              <div className="flex items-center gap-1 text-amber-400 pl-1">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="text-sm">★</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: Interactive Form Card                      */}
        {/* ========================================================= */}
        <div className="lg:col-span-6 bg-white p-5 sm:p-7 md:p-8 lg:p-12 flex flex-col justify-between text-slate-800 relative w-full">
          {/* Mobile/Tablet Compact Brand Header (< lg) */}
          <div className="lg:hidden flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-600 p-0.5 shadow-md shadow-teal-500/20 flex items-center justify-center shrink-0">
                <div className="w-full h-full bg-[#07162A] rounded-[10px] flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-teal-300"
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
              <div>
                <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 leading-none block">
                  Stazia<span className="text-teal-600 font-extrabold">Med</span>
                </span>
                <span className="text-[9px] font-black tracking-[0.2em] text-teal-600 uppercase block">
                  REVALIDA
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="min-w-[44px] min-h-[44px] p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex items-center justify-center cursor-pointer"
              title={isDarkMode ? "Modo escuro" : "Modo claro"}
              aria-label="Alternar tema visual"
            >
              {isDarkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>

          {/* Compact Marketing Banner for Mobile and Tablet (< lg) - Occupies minimal vertical height (< 20% viewport) */}
          <div className="lg:hidden my-2.5 sm:my-3 p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-teal-500/10 via-teal-500/5 to-cyan-500/10 border border-teal-500/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                {React.createElement(platformHighlights[activeHighlight].icon, { className: "w-4 h-4" })}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {platformHighlights[activeHighlight].title}
                  </p>
                  <span className="text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold uppercase shrink-0">
                    Revalida
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {platformHighlights[activeHighlight].subtitle}
                </p>
              </div>
            </div>
            {/* Carousel Interactive Dots */}
            <div className="flex items-center gap-1 shrink-0">
              {platformHighlights.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveHighlight(i)}
                  className="min-w-[28px] min-h-[28px] flex items-center justify-center cursor-pointer"
                  aria-label={`Ver benefício ${i + 1}`}
                >
                  <span
                    className={`h-1.5 rounded-full transition-all ${
                      activeHighlight === i ? "w-4 bg-teal-600" : "w-1.5 bg-slate-300 hover:bg-slate-400"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Top Bar for Desktop (Segmented Switcher & Theme on >= lg) and Switcher for Mobile (< lg) */}
          <div className="flex items-center justify-between gap-2 pb-3">
            {mode !== "FORGOT_PASSWORD" ? (
              <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => switchMode("LOGIN")}
                  className={`flex-1 sm:flex-none min-h-[44px] px-5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === "LOGIN"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("REGISTER")}
                  className={`flex-1 sm:flex-none min-h-[44px] px-5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === "REGISTER"
                      ? "bg-teal-600 text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  Criar Conta
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => switchMode("LOGIN")}
                className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar para o login
              </button>
            )}

            {/* Desktop Theme Toggle */}
            <div className="hidden lg:block">
              <button
                type="button"
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="min-w-[44px] min-h-[44px] p-2.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex items-center justify-center cursor-pointer"
                title={isDarkMode ? "Modo escuro" : "Modo claro"}
                aria-label="Alternar tema visual"
              >
                {isDarkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Form Content Area */}
          <div className="my-auto py-2 space-y-5 max-w-md w-full mx-auto">
            {/* Dynamic Title & Subtitle */}
            <div className="space-y-1">
              {mode === "LOGIN" && (
                <>
                  <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                    Bem-vindo(a) de volta!
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500">
                    Entre para continuar sua jornada rumo à aprovação no Revalida.
                  </p>
                </>
              )}
              {mode === "REGISTER" && (
                <>
                  <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                    Crie sua conta
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500">
                    Cadastre-se gratuitamente e tenha acesso ao método inteligente.
                  </p>
                </>
              )}
              {mode === "FORGOT_PASSWORD" && (
                <>
                  <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                    Recuperar senha
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500">
                    Informe seu e-mail cadastrado para receber as instruções de recuperação.
                  </p>
                </>
              )}
            </div>

            {/* Error Notification Alert */}
            {errorMessage && (
              <div
                role="alert"
                aria-live="polite"
                className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex flex-col gap-2 animate-in fade-in duration-200"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 font-medium leading-relaxed">{errorMessage}</div>
                </div>

                {suggestRegister && (
                  <div className="pt-1 pl-6">
                    <button
                      type="button"
                      onClick={() => switchMode("REGISTER")}
                      className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Criar conta com este e-mail
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Success Notification Alert */}
            {successMessage && (
              <div
                role="alert"
                aria-live="polite"
                className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-start gap-2.5 animate-in fade-in duration-200"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium leading-relaxed">{successMessage}</div>
              </div>
            )}

            {/* Google Authentication Button - Placed at the top for fast, zero-friction mobile access */}
            {mode !== "FORGOT_PASSWORD" && (
              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  id="btn-login-google"
                  disabled={isSubmitting}
                  onClick={handleGoogleSubmit}
                  className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold flex items-center justify-center gap-3 shadow-xs transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
                >
                  {isLoadingGoogle ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                      <span>Conectando com Google...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                        />
                      </svg>
                      <span>Continuar com o Google</span>
                    </>
                  )}
                </button>

                {/* Divider between Google and Email/Password */}
                <div className="relative flex items-center justify-center my-2">
                  <div className="border-t border-slate-200 w-full" />
                  <span className="bg-white px-3 text-[11px] text-slate-400 font-medium uppercase tracking-wider whitespace-nowrap">
                    ou continue com e-mail
                  </span>
                  <div className="border-t border-slate-200 w-full" />
                </div>
              </div>
            )}

            {/* Main Email / Password Form */}
            <form onSubmit={handleFormSubmit} noValidate className="space-y-3.5">
              {/* Name Field (Only in REGISTER mode) */}
              {mode === "REGISTER" && (
                <div className="space-y-1">
                  <label
                    htmlFor="auth-name-input"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Nome completo / Como quer ser chamado(a)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <input
                      id="auth-name-input"
                      type="text"
                      inputMode="text"
                      name="name"
                      autoComplete="name"
                      value={name}
                      disabled={isSubmitting}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                      }}
                      placeholder="Dr(a). Seu Nome"
                      className={`w-full pl-10 pr-4 min-h-[48px] py-3 rounded-xl border text-base sm:text-sm text-slate-900 placeholder:text-slate-400 bg-white transition-all outline-none focus:ring-2 disabled:bg-slate-50 disabled:cursor-not-allowed ${
                        fieldErrors.name
                          ? "border-rose-400 focus:ring-rose-200 focus:border-rose-500"
                          : "border-slate-200 hover:border-slate-300 focus:border-teal-600 focus:ring-teal-100"
                      }`}
                    />
                  </div>
                  {fieldErrors.name && (
                    <p className="text-[11px] text-rose-600 font-medium pl-1">{fieldErrors.name}</p>
                  )}
                </div>
              )}

              {/* E-mail Field */}
              <div className="space-y-1">
                <label
                  htmlFor="auth-email-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  E-mail
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-email-input"
                    type="email"
                    inputMode="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="seu@email.com.br"
                    className={`w-full pl-10 pr-4 min-h-[48px] py-3 rounded-xl border text-base sm:text-sm text-slate-900 placeholder:text-slate-400 bg-white transition-all outline-none focus:ring-2 disabled:bg-slate-50 disabled:cursor-not-allowed ${
                      fieldErrors.email
                        ? "border-rose-400 focus:ring-rose-200 focus:border-rose-500"
                        : "border-slate-200 hover:border-slate-300 focus:border-teal-600 focus:ring-teal-100"
                    }`}
                  />
                </div>
                {fieldErrors.email && (
                  <p className="text-[11px] text-rose-600 font-medium pl-1">{fieldErrors.email}</p>
                )}
              </div>

              {/* Password Field (Not in FORGOT_PASSWORD) */}
              {mode !== "FORGOT_PASSWORD" && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="auth-password-input"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Senha
                    </label>
                    {mode === "LOGIN" && (
                      <button
                        type="button"
                        onClick={() => switchMode("FORGOT_PASSWORD")}
                        className="min-h-[44px] inline-flex items-center px-1 text-xs font-medium text-teal-700 hover:text-teal-800 transition-colors cursor-pointer"
                      >
                        Esqueci minha senha
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="auth-password-input"
                      type={showPassword ? "text" : "password"}
                      name="password"
                      autoComplete={mode === "REGISTER" ? "new-password" : "current-password"}
                      value={password}
                      disabled={isSubmitting}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder={mode === "REGISTER" ? "Crie uma senha (mínimo 6 dígitos)" : "Sua senha"}
                      className={`w-full pl-10 pr-12 min-h-[48px] py-3 rounded-xl border text-base sm:text-sm text-slate-900 placeholder:text-slate-400 bg-white transition-all outline-none focus:ring-2 disabled:bg-slate-50 disabled:cursor-not-allowed ${
                        fieldErrors.password
                          ? "border-rose-400 focus:ring-rose-200 focus:border-rose-500"
                          : "border-slate-200 hover:border-slate-300 focus:border-teal-600 focus:ring-teal-100"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isSubmitting}
                      className="min-w-[44px] min-h-[44px] absolute inset-y-0 right-0 flex items-center justify-center text-slate-400 hover:text-slate-600 focus:outline-none transition-colors cursor-pointer"
                      aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="text-[11px] text-rose-600 font-medium pl-1">{fieldErrors.password}</p>
                  )}
                </div>
              )}

              {/* Main Submit Button */}
              <button
                type="submit"
                id="btn-auth-submit"
                disabled={isSubmitting}
                className="w-full min-h-[48px] py-3.5 px-6 rounded-xl bg-gradient-to-r from-teal-500 via-teal-600 to-[#0A66C2] hover:brightness-105 active:scale-[0.99] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-teal-900/10 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {mode === "LOGIN" && "Entrando na plataforma..."}
                      {mode === "REGISTER" && "Criando sua conta..."}
                      {mode === "FORGOT_PASSWORD" && "Enviando link..."}
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      {mode === "LOGIN" && "Entrar na plataforma"}
                      {mode === "REGISTER" && "Cadastrar e começar agora"}
                      {mode === "FORGOT_PASSWORD" && "Enviar link de recuperação"}
                    </span>
                    <ArrowRight className="w-4 h-4 text-white" />
                  </>
                )}
              </button>
            </form>

            {/* Bottom Toggle Prompt */}
            {mode !== "FORGOT_PASSWORD" && (
              <div className="text-center pt-1">
                {mode === "LOGIN" ? (
                  <p className="text-xs text-slate-500">
                    Novo por aqui?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("REGISTER")}
                      className="min-h-[44px] inline-flex items-center px-1 font-bold text-teal-700 hover:text-teal-800 transition-colors cursor-pointer"
                    >
                      Criar minha conta
                    </button>
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    Já possui uma conta?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("LOGIN")}
                      className="min-h-[44px] inline-flex items-center px-1 font-bold text-teal-700 hover:text-teal-800 transition-colors cursor-pointer"
                    >
                      Fazer login
                    </button>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Bottom Security / Trust Footer Badges - Fully legible with flex-wrap on mobile and inline on tablet */}
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-2 text-center text-[11px] sm:text-xs text-slate-500">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Segurança garantida</span>
            </div>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Lock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Dados protegidos</span>
            </div>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Headphones className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Suporte especializado</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
