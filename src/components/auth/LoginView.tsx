import React, { useState } from "react";
import {
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { StaziaMedLogo } from "../brand/StaziaMedLogo";
import { getPurchaseIntent } from "../billing/pricingTypes";

type AuthMode = "LOGIN" | "SIGNUP" | "FORGOT_PASSWORD";

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

// Curva e duração do deslizamento do painel (mesmas do STEA Code Drop #002).
const SLIDE_EASE = [0.22, 1, 0.36, 1] as const;
const SLIDE_DURATION = 0.65;

const INPUT_BASE =
  "w-full min-h-[44px] px-3.5 rounded-[11px] border text-sm outline-none transition-all bg-[#FAFBFC] text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:bg-white focus:border-teal-600/70 focus:ring-4 focus:ring-teal-500/10 disabled:opacity-60";

const HERO_BACKGROUND =
  "radial-gradient(circle at 25% 20%, rgba(0,210,180,.28), transparent 42%), " +
  "radial-gradient(circle at 85% 85%, rgba(2,132,199,.22), transparent 38%), " +
  "linear-gradient(160deg, #0A1C3E 0%, #0E2856 55%, #0B3552 100%)";

const GoogleIcon = () => (
  <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
);

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  labelAction?: React.ReactNode;
  children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ id, label, error, labelAction, children }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="block text-xs font-bold text-slate-700">
        {label}
      </label>
      {labelAction}
    </div>
    {children}
    {error && <p className="text-[11px] text-rose-600 font-medium pl-1">{error}</p>}
  </div>
);

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  visible: boolean;
  onToggle: () => void;
  hasError: boolean;
}

const PasswordInput: React.FC<PasswordInputProps> = ({ visible, onToggle, hasError, ...inputProps }) => (
  <div className="relative">
    <input
      {...inputProps}
      type={visible ? "text" : "password"}
      className={`${INPUT_BASE} pr-12 ${hasError ? "border-rose-500" : "border-[#E7EAF0]"}`}
    />
    <button
      type="button"
      onClick={onToggle}
      className="absolute top-1/2 right-1.5 -translate-y-1/2 w-[34px] h-[34px] grid place-items-center rounded-[9px] text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
      aria-label={visible ? "Ocultar senha" : "Exibir senha"}
    >
      {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  </div>
);

export const LoginView: React.FC = () => {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    setActiveTab,
  } = useApp();

  const [mode, setMode] = useState<AuthMode>("LOGIN");
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const isSubmitting = isLoading || isLoadingGoogle;
  const isSignup = mode === "SIGNUP";

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
    const errors: FieldErrors = {};
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

  const goToAppAfterAuth = () => {
    setActiveTab(getPurchaseIntent() ? "subscription" : "home");
  };

  const handleGoogleSubmit = async () => {
    if (isSubmitting) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setFieldErrors({});
    setIsLoadingGoogle(true);

    try {
      await signInWithGoogle();
      goToAppAfterAuth();
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
        goToAppAfterAuth();
      } else if (mode === "SIGNUP") {
        const displayName = name.trim() || undefined;
        await signUpWithEmail(email.trim(), password, displayName);
        goToAppAfterAuth();
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

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setErrorMessage(null);
    setSuccessMessage(null);
    setFieldErrors({});
  };

  const clearFieldError = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) setFieldErrors((p) => ({ ...p, [field]: undefined }));
    if (errorMessage) setErrorMessage(null);
  };

  const slideTransition = prefersReducedMotion
    ? { duration: 0 }
    : { layout: { duration: SLIDE_DURATION, ease: SLIDE_EASE } };

  const heroContent = isSignup
    ? {
        title: "Já tem uma conta?",
        text: "Acesse sua conta e retome seus estudos de onde parou.",
        action: "Já tenho uma conta",
        target: "LOGIN" as AuthMode,
      }
    : {
        title: "Novo por aqui?",
        text: "Questões oficiais comentadas, simulados e revisão inteligente para a sua aprovação no Revalida.",
        action: "Criar uma nova conta",
        target: "SIGNUP" as AuthMode,
      };

  const headings: Record<AuthMode, { title: string; subtitle: string }> = {
    LOGIN: {
      title: "Bem-vindo de volta.",
      subtitle: "Entre para continuar sua preparação.",
    },
    SIGNUP: {
      title: "Pronto para começar sua preparação?",
      subtitle: "Crie sua conta e organize seus estudos para o Revalida.",
    },
    FORGOT_PASSWORD: {
      title: "Recuperar senha",
      subtitle: "Informe seu e-mail para receber as instruções de recuperação.",
    },
  };

  const emailInput = (
    <Field id="auth-email-input" label={mode === "FORGOT_PASSWORD" ? "E-mail cadastrado" : "E-mail"} error={fieldErrors.email}>
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
          clearFieldError("email");
        }}
        placeholder="seu@email.com.br"
        className={`${INPUT_BASE} ${fieldErrors.email ? "border-rose-500" : "border-[#E7EAF0]"}`}
      />
    </Field>
  );

  const submitLabel: Record<AuthMode, { idle: string; busy: string; id: string }> = {
    LOGIN: { idle: "Entrar", busy: "Entrando...", id: "btn-auth-submit" },
    SIGNUP: { idle: "Criar minha conta", busy: "Criando conta...", id: "btn-signup-submit" },
    FORGOT_PASSWORD: { idle: "Enviar instruções", busy: "Enviando...", id: "btn-forgot-submit" },
  };

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans relative overflow-hidden bg-[#F4F6F9] text-slate-800 selection:bg-teal-500/30 selection:text-teal-900">
      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-24 -left-24 w-[520px] h-[420px] bg-[#00D2B4]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-[480px] h-[380px] bg-[#0284C7]/8 rounded-full blur-3xl" />
      </div>

      {/* Dual-panel auth card */}
      <div className="relative z-10 w-full max-w-[920px] md:min-h-[620px] flex flex-col md:flex-row rounded-[24px] bg-white border-[6px] sm:border-8 border-white shadow-[0_30px_90px_rgba(8,11,20,0.14),0_8px_30px_rgba(10,28,62,0.08)] overflow-hidden">
        {/* FORM PANEL */}
        <motion.section
          layout="position"
          transition={slideTransition}
          aria-label={isSignup ? "Criar conta" : mode === "FORGOT_PASSWORD" ? "Recuperar senha" : "Entrar"}
          className={`md:w-1/2 flex items-center justify-center px-5 py-8 sm:px-10 sm:py-10 ${
            isSignup ? "md:order-2" : "md:order-1"
          }`}
        >
          <motion.div
            key={mode}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: prefersReducedMotion ? 0 : 0.15, ease: SLIDE_EASE }}
            className="w-full max-w-[340px]"
          >
            {/* Box sized to the square logo PNG; negative margin offsets its built-in padding */}
            <div className="w-24 sm:w-28 -ml-3 -mt-3 mb-3">
              <StaziaMedLogo layout="vertical" size="sm" />
            </div>

            <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-[-0.04em] leading-tight text-[#0A1C3E]">
              {headings[mode].title}
            </h1>
            <p className="mt-1.5 mb-5 text-xs sm:text-[13px] leading-relaxed text-slate-500">
              {headings[mode].subtitle}
            </p>

            {errorMessage && (
              <div
                role="alert"
                aria-live="polite"
                className="w-full mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2.5 text-left"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="flex-1 font-medium">{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div
                role="status"
                aria-live="polite"
                className="w-full mb-4 p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-800 flex items-center gap-2.5 text-left"
              >
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="flex-1 font-medium">{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleEmailSubmit} noValidate className="w-full space-y-3 text-left">
              {isSignup && (
                <Field id="auth-name-input" label="Nome completo" error={fieldErrors.name}>
                  <input
                    id="auth-name-input"
                    type="text"
                    name="name"
                    autoComplete="name"
                    value={name}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setName(e.target.value);
                      clearFieldError("name");
                    }}
                    placeholder="Dr(a). Seu Nome"
                    className={`${INPUT_BASE} ${fieldErrors.name ? "border-rose-500" : "border-[#E7EAF0]"}`}
                  />
                </Field>
              )}

              {emailInput}

              {mode !== "FORGOT_PASSWORD" && (
                <Field
                  id="auth-password-input"
                  label="Senha"
                  error={fieldErrors.password}
                  labelAction={
                    mode === "LOGIN" ? (
                      <button
                        type="button"
                        onClick={() => switchMode("FORGOT_PASSWORD")}
                        className="text-xs font-bold text-teal-700 hover:text-teal-900 hover:underline cursor-pointer"
                      >
                        Esqueci minha senha
                      </button>
                    ) : undefined
                  }
                >
                  <PasswordInput
                    id="auth-password-input"
                    name="password"
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    value={password}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearFieldError("password");
                    }}
                    placeholder={isSignup ? "Crie uma senha (mín. 6 caracteres)" : "Sua senha"}
                    visible={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                    hasError={Boolean(fieldErrors.password)}
                  />
                </Field>
              )}

              {isSignup && (
                <Field id="auth-confirm-password-input" label="Confirmar senha" error={fieldErrors.confirmPassword}>
                  <PasswordInput
                    id="auth-confirm-password-input"
                    name="confirmPassword"
                    autoComplete="new-password"
                    value={confirmPassword}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      clearFieldError("confirmPassword");
                    }}
                    placeholder="Confirme sua senha"
                    visible={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
                    hasError={Boolean(fieldErrors.confirmPassword)}
                  />
                </Field>
              )}

              <button
                type="submit"
                id={submitLabel[mode].id}
                disabled={isSubmitting}
                className="w-full min-h-[46px] mt-2 px-5 rounded-[11px] bg-gradient-to-br from-[#0A1C3E] to-[#16336B] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(10,28,62,0.18)] hover:shadow-[0_11px_26px_rgba(10,28,62,0.26)] hover:-translate-y-px hover:brightness-110 active:translate-y-0 transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#00D2B4]" />
                    <span>{submitLabel[mode].busy}</span>
                  </>
                ) : (
                  <>
                    <span>{submitLabel[mode].idle}</span>
                    <ArrowRight className="w-4 h-4 text-[#00D2B4]" />
                  </>
                )}
              </button>
            </form>

            {mode === "FORGOT_PASSWORD" ? (
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
            ) : (
              <>
                <div className="flex items-center gap-3 my-4 text-[11px] font-semibold text-slate-400 whitespace-nowrap before:h-px before:flex-1 before:bg-[#E7EAF0] after:h-px after:flex-1 after:bg-[#E7EAF0]">
                  {isSignup ? "ou cadastre-se com" : "ou entre com"}
                </div>

                <button
                  type="button"
                  id={isSignup ? "btn-google-signup" : "btn-google-login"}
                  disabled={isSubmitting}
                  onClick={handleGoogleSubmit}
                  className="w-full min-h-[44px] px-5 rounded-[11px] bg-white border border-[#E7EAF0] text-slate-800 text-sm font-semibold flex items-center justify-center gap-3 hover:bg-[#FAFBFC] hover:border-slate-300 hover:-translate-y-px active:translate-y-0 transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {isLoadingGoogle ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#00D2B4]" />
                      <span>Continuando...</span>
                    </>
                  ) : (
                    <>
                      <GoogleIcon />
                      <span>Continuar com Google</span>
                    </>
                  )}
                </button>
              </>
            )}

            {/* Legal disclaimer */}
            <p className="mt-6 text-[11px] leading-relaxed text-center text-slate-500">
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
          </motion.div>
        </motion.section>

        {/* HERO PANEL — slides to the opposite side of the form */}
        <motion.section
          layout="position"
          transition={slideTransition}
          aria-label={isSignup ? "Já tenho conta" : "Novo usuário"}
          style={{ background: HERO_BACKGROUND }}
          className={`relative md:w-1/2 rounded-[18px] overflow-hidden text-white flex flex-col items-center justify-center text-center gap-4 px-6 py-9 sm:px-10 md:py-12 ${
            isSignup ? "md:order-1" : "md:order-2"
          }`}
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
            aria-hidden="true"
          />

          <motion.div
            key={heroContent.target}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: prefersReducedMotion ? 0 : 0.25, ease: SLIDE_EASE }}
            className="relative flex flex-col items-center gap-4"
          >
            <div className="hidden md:grid w-16 h-16 place-items-center rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] ring-4 ring-white/10">
              <StaziaMedLogo layout="monogram" size="md" />
            </div>

            <h2 className="text-[26px] sm:text-[34px] md:text-[38px] font-extrabold leading-[1.05] tracking-[-0.045em]">
              {heroContent.title}
            </h2>
            <p className="max-w-[270px] text-[13px] sm:text-sm leading-relaxed text-white/85">{heroContent.text}</p>

            <button
              type="button"
              onClick={() => switchMode(heroContent.target)}
              disabled={isSubmitting}
              className="mt-1 min-w-[150px] min-h-[46px] px-7 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md text-white text-sm font-bold hover:bg-white hover:text-[#0A1C3E] hover:border-white hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer disabled:opacity-60"
            >
              {heroContent.action}
            </button>
          </motion.div>
        </motion.section>
      </div>
    </div>
  );
};
