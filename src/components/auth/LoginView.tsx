import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { setAuthRememberMe } from "../../lib/firebase";
import { getPurchaseIntent } from "../billing/pricingTypes";
import "./steaAuth.css";

// Visual: STEA Code Drop #002 (sign in / sign up), ver steaAuth.css.

type AuthMode = "LOGIN" | "SIGNUP" | "FORGOT_PASSWORD";

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
};

const EyeOpenIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

const EyeClosedIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c6.1 0 9.5 7 9.5 7a17.7 17.7 0 0 1-3.1 3.8" />
    <path d="M6.2 6.3C3.8 8 2.5 12 2.5 12s3.4 6 9.5 6c1.5 0 2.8-.3 4-.8" />
    <path d="M9.9 9.9a2.8 2.8 0 0 0 4.2 4.2" />
  </svg>
);

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M21.35 12.23c0-.74-.07-1.45-.22-2.12H12v4.01h5.24a4.48 4.48 0 0 1-1.95 2.94v2.44h3.15c1.84-1.69 2.91-4.18 2.91-7.27Z"
    />
    <path
      fill="#34A853"
      d="M12 21.99c2.63 0 4.84-.87 6.45-2.49l-3.15-2.44c-.87.58-1.98.93-3.3.93-2.54 0-4.69-1.72-5.46-4.03H3.29v2.52A9.75 9.75 0 0 0 12 21.99Z"
    />
    <path
      fill="#FBBC05"
      d="M6.54 13.96A5.86 5.86 0 0 1 6.23 12c0-.68.12-1.34.31-1.96V7.52H3.29A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.06 1.04 4.48l3.25-2.52Z"
    />
    <path
      fill="#EA4335"
      d="M12 6.01c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.02 14.63 2.01 12 2.01a9.75 9.75 0 0 0-8.71 5.51l3.25 2.52C7.31 7.73 9.46 6.01 12 6.01Z"
    />
  </svg>
);

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ id, label, error, className, children }) => (
  <div className={className ? `field ${className}` : "field"}>
    <label htmlFor={id}>{label}</label>
    {children}
    {error && (
      <p className="field-error" id={`${id}-error`}>
        {error}
      </p>
    )}
  </div>
);

interface PasswordFieldProps {
  id: string;
  label: string;
  name: string;
  autoComplete: string;
  value: string;
  error?: string;
  disabled: boolean;
  visible: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}

const PasswordField: React.FC<PasswordFieldProps> = ({
  id,
  label,
  name,
  autoComplete,
  value,
  error,
  disabled,
  visible,
  onToggle,
  onChange,
}) => (
  <Field id={id} label={label} error={error} className="password-field">
    <div className="input-wrap">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder="••••••••"
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        className="eye"
        type="button"
        onClick={onToggle}
        aria-label={visible ? "Ocultar senha" : "Exibir senha"}
      >
        {visible ? <EyeClosedIcon /> : <EyeOpenIcon />}
      </button>
    </div>
  </Field>
);

const FormMessage: React.FC<{ error?: string | null; success?: string | null }> = ({ error, success }) => (
  <div className={error ? "message is-error" : "message"} role={error ? "alert" : "status"} aria-live="polite">
    {error || success || ""}
  </div>
);

export const LoginView: React.FC = () => {
  const navigate = useNavigate();
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
  const [showPassword, setShowPassword] = useState(false);
  // Marcado por padrão para manter o comportamento anterior (sessão persistente).
  const [rememberMe, setRememberMe] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const isSubmitting = isLoading || isLoadingGoogle;
  const isRegister = mode === "SIGNUP";

  // Firebase já começa com sessão persistente; só troca quando a escolha muda.
  // Aplicado fora do clique para não atrasar o popup do Google (bloqueio de pop-up).
  const appliedRememberRef = useRef(true);
  const persistenceRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const desired = isRegister ? true : rememberMe;
    if (desired === appliedRememberRef.current) return;
    appliedRememberRef.current = desired;
    persistenceRef.current = setAuthRememberMe(desired).catch((err) => {
      console.warn("[LoginView] Could not set auth persistence:", err);
    });
  }, [isRegister, rememberMe]);

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
        await persistenceRef.current;
        await signInWithEmail(email.trim(), password);
        goToAppAfterAuth();
      } else if (mode === "SIGNUP") {
        await persistenceRef.current;
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

  const renderEmailField = (id: string, label: string, active: boolean) => (
    <Field id={id} label={label} error={active ? fieldErrors.email : undefined}>
      <input
        id={id}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="voce@exemplo.com"
        value={email}
        disabled={isSubmitting}
        aria-invalid={active && Boolean(fieldErrors.email)}
        aria-describedby={active && fieldErrors.email ? `${id}-error` : undefined}
        onChange={(e) => {
          setEmail(e.target.value);
          clearFieldError("email");
        }}
      />
    </Field>
  );

  const renderGoogleButton = (label: string) => (
    <div className="socials">
      <button
        type="button"
        className="social-btn"
        disabled={isSubmitting}
        onClick={handleGoogleSubmit}
      >
        <GoogleIcon />
        <span>{isLoadingGoogle ? "Continuando..." : label}</span>
      </button>
    </div>
  );

  const renderTerms = (intro: string) => (
    <p className="terms">
      {intro}{" "}
      <button type="button" className="link" onClick={() => navigate("/termos-de-uso")}>
        Termos de Uso
      </button>{" "}
      e a{" "}
      <button type="button" className="link" onClick={() => navigate("/politica-de-privacidade")}>
        Política de Privacidade
      </button>
      .
    </p>
  );

  const loginActive = !isRegister;
  const loginMessage = loginActive ? <FormMessage error={errorMessage} success={successMessage} /> : <FormMessage />;
  const registerMessage = isRegister ? <FormMessage error={errorMessage} /> : <FormMessage />;

  return (
    <div className="stea-auth">
      <main className={isRegister ? "card register" : "card"} data-mode={isRegister ? "register" : "login"}>
        <div className="card-bg" aria-hidden="true" />

        {/* REGISTER HERO */}
        <section className="hero register" aria-label="Já tenho conta" inert={!isRegister} aria-hidden={!isRegister}>
          <h2>Já tem conta?</h2>
          <p>Entre para revisar sua conta e continuar sua jornada.</p>
          <button type="button" className="switch" onClick={() => switchMode("LOGIN")}>
            Entrar
          </button>
        </section>

        {/* REGISTER FORM */}
        <section className="form register" aria-label="Criar conta" inert={!isRegister} aria-hidden={!isRegister}>
          <div className="form-inner">
            <h1>Criar conta</h1>
            <p className="subtitle">Crie sua conta e comece sua jornada.</p>

            <form onSubmit={handleEmailSubmit} noValidate>
              <Field id="registerName" label="Nome completo" error={isRegister ? fieldErrors.name : undefined}>
                <input
                  id="registerName"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Seu nome"
                  value={name}
                  disabled={isSubmitting}
                  aria-invalid={isRegister && Boolean(fieldErrors.name)}
                  aria-describedby={isRegister && fieldErrors.name ? "registerName-error" : undefined}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearFieldError("name");
                  }}
                />
              </Field>

              {renderEmailField("registerEmail", "E-mail", isRegister)}

              <PasswordField
                id="registerPassword"
                label="Senha"
                name="password"
                autoComplete="new-password"
                value={password}
                error={isRegister ? fieldErrors.password : undefined}
                disabled={isSubmitting}
                visible={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
                onChange={(value) => {
                  setPassword(value);
                  clearFieldError("password");
                }}
              />

              <button className="primary" type="submit" disabled={isSubmitting}>
                {isLoading && isRegister ? "Criando conta..." : "Criar conta"}
              </button>

              {registerMessage}
            </form>

            <div className="or">Ou cadastre-se com</div>
            {renderGoogleButton("Continuar com Google")}
            {renderTerms("Ao criar uma conta, você concorda com os")}
          </div>
        </section>

        {/* LOGIN HERO */}
        <section className="hero login" aria-label="Novo usuário" inert={isRegister} aria-hidden={isRegister}>
          <h2>Olá!</h2>
          <p>Comece sua jornada com a gente e descubra algo novo.</p>
          <button type="button" className="switch" onClick={() => switchMode("SIGNUP")}>
            Cadastre-se
          </button>
        </section>

        {/* LOGIN FORM (inclui a recuperação de senha) */}
        <section
          className="form login"
          aria-label={mode === "FORGOT_PASSWORD" ? "Recuperar senha" : "Entrar"}
          inert={isRegister}
          aria-hidden={isRegister}
        >
          <div className="form-inner">
            {mode === "FORGOT_PASSWORD" ? (
              <>
                <h1>Recuperar senha</h1>
                <p className="subtitle">Informe seu e-mail para receber as instruções de recuperação.</p>

                <form onSubmit={handleEmailSubmit} noValidate>
                  {renderEmailField("loginEmail", "E-mail cadastrado", loginActive)}

                  <button className="primary" type="submit" disabled={isSubmitting}>
                    {isLoading ? "Enviando..." : "Enviar instruções"}
                  </button>

                  {loginMessage}
                </form>

                <p className="back-row">
                  <button type="button" className="link" onClick={() => switchMode("LOGIN")}>
                    Voltar para o login
                  </button>
                </p>
              </>
            ) : (
              <>
                <h1>Bem-vindo de volta</h1>
                <p className="subtitle">Entre para continuar na sua conta.</p>

                <form onSubmit={handleEmailSubmit} noValidate>
                  {renderEmailField("loginEmail", "E-mail", loginActive)}

                  <PasswordField
                    id="loginPassword"
                    label="Senha"
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    error={loginActive ? fieldErrors.password : undefined}
                    disabled={isSubmitting}
                    visible={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                    onChange={(value) => {
                      setPassword(value);
                      clearFieldError("password");
                    }}
                  />

                  <div className="form-row">
                    <label className="remember">
                      <input
                        type="checkbox"
                        name="remember"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      Lembrar de mim
                    </label>

                    <button type="button" className="link" onClick={() => switchMode("FORGOT_PASSWORD")}>
                      Esqueceu a senha?
                    </button>
                  </div>

                  <button className="primary" type="submit" disabled={isSubmitting}>
                    {isLoading && loginActive ? "Entrando..." : "Entrar"}
                  </button>

                  {loginMessage}
                </form>

                <div className="or">Ou entre com</div>
                {renderGoogleButton("Continuar com Google")}
                {renderTerms("Ao continuar, você concorda com os")}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
