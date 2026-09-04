import React, { useState } from "react";
import {
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  UserPlus,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { StaziaMedLogo } from "../brand/StaziaMedLogo";

type AuthMode = "ENTRY" | "LOGIN" | "SIGNUP" | "FORGOT_PASSWORD";

export const LoginView: React.FC = () => {
  const navigate = useNavigate();
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    enterGuestMode,
    setActiveTab,
  } = useApp();

  const [mode, setMode] = useState<AuthMode>("ENTRY");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const isSubmitting = isLoading || isLoadingGoogle;

  const getPortugueseAuthError = (errorCode: string): string => {
    switch (errorCode) {
      case "auth/email-already-in-use":
        return "Já existe uma conta vinculada a este e-mail.";
      case "auth/invalid-email":
        return "O endereço de e-mail informado não é válido.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Não foi possível entrar com esses dados. Verifique seu e-mail e senha.";
      case "auth/weak-password":
        return "A senha deve conter no mínimo 6 caracteres.";
      case "auth/user-disabled":
        return "Esta conta foi temporariamente desativada pelo administrador.";
      case "auth/popup-blocked":
        return "O navegador bloqueou a janela de autenticação. Permita pop-ups para este site.";
      case "auth/network-request-failed":
        return "Falha de comunicação com os servidores. Verifique sua conexão com a internet.";
      case "auth/too-many-requests":
        return "Muitas tentativas consecutivas. Aguarde alguns instantes antes de tentar novamente.";
      case "auth/operation-not-allowed":
        return "O método de autenticação não está habilitado no momento.";
      default:
        return "Não foi possível autenticar. Verifique seus dados e tente novamente.";
    }
  };

  const validateForm = (): boolean => {
    const errors: {
      name?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
    } = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (mode === "SIGNUP" && name.trim().length > 0 && name.trim().length < 2) {
      errors.name = "O nome deve ter pelo menos 2 caracteres.";
    }

    if (!email.trim()) {
      errors.email = "Informe seu endereço de e-mail.";
    } else if (!emailRegex.test(email.trim())) {
      errors.email = "Formato de e-mail inválido (ex: doutor@medicina.com.br).";
    }

    if (mode !== "FORGOT_PASSWORD") {
      if (!password) {
        errors.password = "Informe sua senha de acesso.";
      } else if (password.length < 6) {
        errors.password = "A senha deve conter no mínimo 6 caracteres.";
      }

      if (mode === "SIGNUP") {
        if (!confirmPassword) {
          errors.confirmPassword = "Confirme sua senha.";
        } else if (password !== confirmPassword) {
          errors.confirmPassword = "As senhas não coincidem.";
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleGoogleSubmit = async () => {
    if (isSubmitting) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setFieldErrors({});
    setIsLoadingGoogle(true);

    try {
      await signInWithGoogle();
      setActiveTab("home");
    } catch (err: any) {
      console.error("[LoginView] Google Sign-In error:", err);
      const code = err?.code || "";
      if (code !== "auth/popup-closed-by-user") {
        setErrorMessage(getPortugueseAuthError(code));
      }
    } finally {
      setIsLoadingGoogle(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      if (mode === "LOGIN") {
        await signInWithEmail(email.trim(), password);
        setActiveTab("home");
      } else if (mode === "SIGNUP") {
        const displayName = name.trim() || undefined;
        await signUpWithEmail(email.trim(), password, displayName);
        setActiveTab("home");
      } else if (mode === "FORGOT_PASSWORD") {
        await sendPasswordReset(email.trim());
        // Neutral confirmation message to prevent email enumeration
        setSuccessMessage(
          "Se houver uma conta vinculada a este e-mail, enviaremos as instruções de recuperação."
        );
      }
    } catch (err: any) {
      console.error("[LoginView] Auth error:", err);
      const code = err?.code || "";
      setErrorMessage(getPortugueseAuthError(code));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestSubmit = () => {
    if (isSubmitting) return;
    enterGuestMode();
    setActiveTab("home");
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setErrorMessage(null);
    setSuccessMessage(null);
    setFieldErrors({});
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col justify-between items-center p-4 sm:p-6 lg:p-8 font-sans relative overflow-hidden bg-[#F8FAFC] text-slate-800 selection:bg-teal-500/30 selection:text-teal-900">
      {/* Subtle Ambient Background Glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[400px] bg-[#00D2B4]/8 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-1/4 w-[450px] h-[350px] bg-[#0284C7]/6 rounded-full blur-3xl" />
      </div>

      {/* Top Spacer */}
      <div className="h-2 sm:h-4" aria-hidden="true" />

      {/* Main Single Centered Card */}
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[440px] sm:max-w-[460px] my-auto flex flex-col items-center text-center p-7 sm:p-9 rounded-3xl bg-white border border-slate-200/90 shadow-xl shadow-slate-900/5 z-10"
      >
        {/* Official StaziaMed Logo */}
        <div className="mb-6 sm:mb-7">
          <StaziaMedLogo layout="vertical" size="lg" />
        </div>

        {/* ----------------------------------------------------------- */}
        {/* 1. STATE: ENTRY (Initial Choice: Já tenho conta / Criar)    */}
        {/* ----------------------------------------------------------- */}
        {mode === "ENTRY" && (
          <div className="w-full flex flex-col items-center animate-in fade-in duration-200">
            {/* Headline & Subheadline */}
            <div className="space-y-1.5 mb-7">
              <h1 className="text-2xl sm:text-[26px] font-extrabold tracking-tight text-[#0A1C3E]">
                Bem-vindo à StaziaMed.
              </h1>
              <p className="text-xs sm:text-sm font-normal text-slate-600 max-w-xs mx-auto leading-relaxed">
                Escolha como deseja continuar.
              </p>
            </div>

            {/* CTAs */}
            <div className="w-full space-y-3">
              {/* Option A: Já tenho uma conta */}
              <button
                type="button"
                id="btn-choice-login"
                onClick={() => switchMode("LOGIN")}
                className="w-full min-h-[50px] sm:min-h-[52px] px-6 py-3.5 rounded-xl bg-[#0A1C3E] hover:bg-[#0E2856] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-[0.99]"
              >
                <span>Já tenho uma conta</span>
                <ArrowRight className="w-4 h-4 text-[#00D2B4]" />
              </button>

              {/* Option B: Criar uma nova conta */}
              <button
                type="button"
                id="btn-choice-signup"
                onClick={() => switchMode("SIGNUP")}
                className="w-full min-h-[50px] sm:min-h-[52px] px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300/90 text-slate-800 text-sm font-bold flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.99]"
              >
                <span>Criar uma nova conta</span>
                <UserPlus className="w-4 h-4 text-slate-600" />
              </button>

              {/* Guest Mode Link */}
              <div className="pt-2">
                <button
                  type="button"
                  id="btn-guest-mode"
                  onClick={handleGuestSubmit}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline-offset-4 hover:underline transition-colors cursor-pointer"
                >
                  Explorar como visitante
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------- */}
        {/* 2. STATE: LOGIN (Email / Senha ou Google)                  */}
        {/* ----------------------------------------------------------- */}
        {mode === "LOGIN" && (
          <div className="w-full flex flex-col items-center animate-in fade-in duration-200">
            {/* Headline */}
            <div className="space-y-1.5 mb-6 text-center">
              <h1 className="text-2xl sm:text-[26px] font-extrabold tracking-tight text-[#0A1C3E]">
                Bem-vindo de volta.
              </h1>
              <p className="text-xs sm:text-sm font-normal text-slate-600 max-w-xs mx-auto leading-relaxed">
                Entre para continuar sua preparação.
              </p>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div
                role="alert"
                aria-live="polite"
                className="w-full mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2.5 text-left animate-in fade-in duration-200"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="flex-1 font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Google Primary CTA */}
            <button
              type="button"
              id="btn-google-login"
              disabled={isSubmitting}
              onClick={handleGoogleSubmit}
              className="w-full min-h-[50px] sm:min-h-[52px] px-5 py-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300/90 text-slate-800 text-sm font-semibold flex items-center justify-center gap-3 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.99] disabled:opacity-60"
            >
              {isLoadingGoogle ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#00D2B4]" />
                  <span>Continuando...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
                  <span>Continuar com Google</span>
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative flex items-center justify-center my-4 w-full">
              <div className="border-t border-slate-200 w-full" />
              <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-white">
                ou
              </span>
              <div className="border-t border-slate-200 w-full" />
            </div>

            {/* Email / Password Form */}
            <form onSubmit={handleEmailSubmit} noValidate className="w-full space-y-3.5 text-left">
              {/* E-mail */}
              <div className="space-y-1">
                <label htmlFor="auth-email-input" className="block text-xs font-semibold text-slate-700">
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
                      if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="seu@email.com.br"
                    className={`w-full pl-10 pr-4 min-h-[46px] py-2.5 rounded-xl border text-sm transition-all outline-none bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:opacity-60 ${
                      fieldErrors.email ? "border-rose-500" : ""
                    }`}
                  />
                </div>
                {fieldErrors.email && (
                  <p className="text-[11px] text-rose-600 font-medium pl-1">{fieldErrors.email}</p>
                )}
              </div>

              {/* Senha */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="auth-password-input" className="block text-xs font-semibold text-slate-700">
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => switchMode("FORGOT_PASSWORD")}
                    className="text-xs font-medium text-teal-700 hover:text-teal-900 hover:underline cursor-pointer"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-password-input"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Sua senha"
                    className={`w-full pl-10 pr-11 min-h-[46px] py-2.5 rounded-xl border text-sm transition-all outline-none bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:opacity-60 ${
                      fieldErrors.password ? "border-rose-500" : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="min-w-[40px] min-h-[40px] absolute inset-y-0 right-0 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-[11px] text-rose-600 font-medium pl-1">{fieldErrors.password}</p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="btn-auth-submit"
                disabled={isSubmitting}
                className="w-full min-h-[48px] py-3 px-5 rounded-xl bg-[#0A1C3E] hover:bg-[#0E2856] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-[0.99] disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#00D2B4]" />
                    <span>Entrando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar</span>
                    <ArrowRight className="w-4 h-4 text-[#00D2B4]" />
                  </>
                )}
              </button>
            </form>

            {/* Back Button */}
            <div className="pt-4">
              <button
                type="button"
                onClick={() => switchMode("ENTRY")}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </button>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------- */}
        {/* 3. STATE: SIGNUP (Cadastro com E-mail / Senha ou Google)     */}
        {/* ----------------------------------------------------------- */}
        {mode === "SIGNUP" && (
          <div className="w-full flex flex-col items-center animate-in fade-in duration-200">
            {/* Headline */}
            <div className="space-y-1.5 mb-5 text-center">
              <h1 className="text-2xl sm:text-[26px] font-extrabold tracking-tight text-[#0A1C3E]">
                Pronto para começar sua preparação?
              </h1>
              <p className="text-xs sm:text-sm font-normal text-slate-600 max-w-xs mx-auto leading-relaxed">
                Crie sua conta e organize seus estudos para o Revalida.
              </p>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div
                role="alert"
                aria-live="polite"
                className="w-full mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2.5 text-left animate-in fade-in duration-200"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="flex-1 font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Google Primary CTA */}
            <button
              type="button"
              id="btn-google-signup"
              disabled={isSubmitting}
              onClick={handleGoogleSubmit}
              className="w-full min-h-[50px] sm:min-h-[52px] px-5 py-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300/90 text-slate-800 text-sm font-semibold flex items-center justify-center gap-3 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.99] disabled:opacity-60"
            >
              {isLoadingGoogle ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#00D2B4]" />
                  <span>Continuando...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
                  <span>Continuar com Google</span>
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative flex items-center justify-center my-3.5 w-full">
              <div className="border-t border-slate-200 w-full" />
              <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-white">
                ou
              </span>
              <div className="border-t border-slate-200 w-full" />
            </div>

            {/* Form */}
            <form onSubmit={handleEmailSubmit} noValidate className="w-full space-y-3 text-left">
              {/* Nome */}
              <div className="space-y-1">
                <label htmlFor="auth-name-input" className="block text-xs font-semibold text-slate-700">
                  Nome completo
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-name-input"
                    type="text"
                    name="name"
                    autoComplete="name"
                    value={name}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined }));
                    }}
                    placeholder="Dr(a). Seu Nome"
                    className={`w-full pl-10 pr-4 min-h-[44px] py-2 rounded-xl border text-sm transition-all outline-none bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:opacity-60 ${
                      fieldErrors.name ? "border-rose-500" : ""
                    }`}
                  />
                </div>
                {fieldErrors.name && (
                  <p className="text-[11px] text-rose-600 font-medium pl-1">{fieldErrors.name}</p>
                )}
              </div>

              {/* E-mail */}
              <div className="space-y-1">
                <label htmlFor="auth-email-input" className="block text-xs font-semibold text-slate-700">
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
                      if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="seu@email.com.br"
                    className={`w-full pl-10 pr-4 min-h-[44px] py-2 rounded-xl border text-sm transition-all outline-none bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:opacity-60 ${
                      fieldErrors.email ? "border-rose-500" : ""
                    }`}
                  />
                </div>
                {fieldErrors.email && (
                  <p className="text-[11px] text-rose-600 font-medium pl-1">{fieldErrors.email}</p>
                )}
              </div>

              {/* Senha */}
              <div className="space-y-1">
                <label htmlFor="auth-password-input" className="block text-xs font-semibold text-slate-700">
                  Senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-password-input"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="new-password"
                    value={password}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Crie uma senha (mín. 6 caracteres)"
                    className={`w-full pl-10 pr-11 min-h-[44px] py-2 rounded-xl border text-sm transition-all outline-none bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:opacity-60 ${
                      fieldErrors.password ? "border-rose-500" : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="min-w-[40px] min-h-[40px] absolute inset-y-0 right-0 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-[11px] text-rose-600 font-medium pl-1">{fieldErrors.password}</p>
                )}
              </div>

              {/* Confirmar Senha */}
              <div className="space-y-1">
                <label
                  htmlFor="auth-confirm-password-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Confirmar senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-confirm-password-input"
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    autoComplete="new-password"
                    value={confirmPassword}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (fieldErrors.confirmPassword)
                        setFieldErrors((p) => ({ ...p, confirmPassword: undefined }));
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Confirme sua senha"
                    className={`w-full pl-10 pr-11 min-h-[44px] py-2 rounded-xl border text-sm transition-all outline-none bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:opacity-60 ${
                      fieldErrors.confirmPassword ? "border-rose-500" : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="min-w-[40px] min-h-[40px] absolute inset-y-0 right-0 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showConfirmPassword ? "Ocultar senha" : "Exibir senha"}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="text-[11px] text-rose-600 font-medium pl-1">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="btn-signup-submit"
                disabled={isSubmitting}
                className="w-full min-h-[48px] py-3 px-5 mt-2 rounded-xl bg-[#0A1C3E] hover:bg-[#0E2856] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-[0.99] disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#00D2B4]" />
                    <span>Criando conta...</span>
                  </>
                ) : (
                  <>
                    <span>Criar minha conta</span>
                    <ArrowRight className="w-4 h-4 text-[#00D2B4]" />
                  </>
                )}
              </button>
            </form>

            {/* Back Button */}
            <div className="pt-4">
              <button
                type="button"
                onClick={() => switchMode("ENTRY")}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </button>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------- */}
        {/* 4. STATE: FORGOT_PASSWORD (Recuperação de Senha)            */}
        {/* ----------------------------------------------------------- */}
        {mode === "FORGOT_PASSWORD" && (
          <div className="w-full flex flex-col items-center animate-in fade-in duration-200">
            {/* Headline */}
            <div className="space-y-1.5 mb-6 text-center">
              <h1 className="text-2xl sm:text-[26px] font-extrabold tracking-tight text-[#0A1C3E]">
                Recuperar senha
              </h1>
              <p className="text-xs sm:text-sm font-normal text-slate-600 max-w-xs mx-auto leading-relaxed">
                Informe seu e-mail para receber as instruções de recuperação.
              </p>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div
                role="alert"
                aria-live="polite"
                className="w-full mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2.5 text-left animate-in fade-in duration-200"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="flex-1 font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Success Neutral Banner */}
            {successMessage && (
              <div
                role="status"
                aria-live="polite"
                className="w-full mb-4 p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-800 flex items-center gap-2.5 text-left animate-in fade-in duration-200"
              >
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="flex-1 font-medium">{successMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleEmailSubmit} noValidate className="w-full space-y-3.5 text-left">
              <div className="space-y-1">
                <label htmlFor="auth-email-input" className="block text-xs font-semibold text-slate-700">
                  E-mail cadastrado
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
                      if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="seu@email.com.br"
                    className={`w-full pl-10 pr-4 min-h-[46px] py-2.5 rounded-xl border text-sm transition-all outline-none bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:opacity-60 ${
                      fieldErrors.email ? "border-rose-500" : ""
                    }`}
                  />
                </div>
                {fieldErrors.email && (
                  <p className="text-[11px] text-rose-600 font-medium pl-1">{fieldErrors.email}</p>
                )}
              </div>

              <button
                type="submit"
                id="btn-forgot-submit"
                disabled={isSubmitting}
                className="w-full min-h-[48px] py-3 px-5 rounded-xl bg-[#0A1C3E] hover:bg-[#0E2856] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-[0.99] disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#00D2B4]" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <span>Enviar instruções</span>
                    <ArrowRight className="w-4 h-4 text-[#00D2B4]" />
                  </>
                )}
              </button>
            </form>

            {/* Back to Login */}
            <div className="pt-4">
              <button
                type="button"
                onClick={() => switchMode("LOGIN")}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar para o login</span>
              </button>
            </div>
          </div>
        )}

        {/* Legal Disclaimer Footer */}
        <div className="mt-7 pt-4 border-t border-slate-200/90 w-full text-center">
          <p className="text-[11px] leading-relaxed max-w-xs mx-auto text-slate-500">
            Ao continuar, você concorda com nossos{" "}
            <button
              type="button"
              id="link-termos-de-uso"
              onClick={() => navigate("/termos-de-uso")}
              className="font-semibold underline underline-offset-2 hover:text-teal-600 transition-colors cursor-pointer text-slate-700"
            >
              Termos de Uso
            </button>{" "}
            e{" "}
            <button
              type="button"
              id="link-politica-de-privacidade"
              onClick={() => navigate("/politica-de-privacidade")}
              className="font-semibold underline underline-offset-2 hover:text-teal-600 transition-colors cursor-pointer text-slate-700"
            >
              Política de Privacidade
            </button>
            .
          </p>
        </div>
      </motion.div>

      {/* Bottom Spacer */}
      <div className="h-2 sm:h-4" aria-hidden="true" />
    </div>
  );
};
