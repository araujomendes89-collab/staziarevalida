// Login, cadastro e recuperação de senha. O login fica em auth/LoginScreen.jsx (tela "Acesso seguro REVALIDA",
// 2026-10-07); cadastro, recuperação e conta master continuam aqui.
// Derivado de "ui_kits/auth-billing/AuthScreens.jsx" do design system: mesma marcação e
// estilos, agora ligados ao backend real. Em telas estreitas o painel azul vai para baixo
// do formulário (o kit original só tinha a versão de duas colunas).
import React from "react";
import { Button, TextField, Banner } from "../ds";
import { PASSWORD_MIN_LENGTH } from "../data";
import { useMobile } from "./Shell.jsx";
import { useSession, rememberChoice } from "./session.jsx";
import { LoginScreen } from "./auth/LoginScreen.jsx";

const ERROR_TEXT = {
  invalid_credentials: "Não foi possível entrar com esses dados. Verifique seu e-mail e senha.",
  email_taken: "Já existe uma conta com este e-mail.",
  weak_password: `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  invalid_email: "Informe um e-mail válido.",
  google_unavailable: "O login com Google não está disponível neste ambiente.",
  network: "Falha de conexão. Verifique sua internet e tente de novo.",
  unknown: "Não foi possível concluir. Tente novamente.",
};
const messageFor = (error) => ERROR_TEXT[error?.code] ?? ERROR_TEXT.unknown;
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function GoogleBtn({ children, onClick, disabled }) {
  return (
    <Button variant="secondary" fullWidth onClick={onClick} disabled={disabled}>
      <img src="/novo-assets/google.svg" alt="" width="18" height="18" />
      {children}
    </Button>
  );
}

function Divider({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
      <span style={{ flex: 1, height: 1, background: "var(--border-default)" }} />
      {children}
      <span style={{ flex: 1, height: 1, background: "var(--border-default)" }} />
    </div>
  );
}

function AuthLayout({ children, aside }) {
  const mobile = useMobile();
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-app)", display: "flex", alignItems: "center", justifyContent: "center", padding: mobile ? 16 : 24 }}>
      <div
        className="sm-card"
        style={{ width: "100%", maxWidth: 960, display: "grid", gridTemplateColumns: mobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)", overflow: "hidden", boxShadow: "var(--shadow-lg)", padding: 0 }}
      >
        <div style={{ padding: mobile ? "32px 24px" : "48px 48px" }}>{children}</div>
        <div style={{ background: "var(--navy-900)", color: "#fff", padding: mobile ? "32px 24px" : 48, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", gap: 20 }}>
          <img src="/novo-assets/logo-vertical-on-dark.png" alt="StaziaMed Revalida" style={{ height: mobile ? 96 : 140 }} />
          {aside}
        </div>
      </div>
    </div>
  );
}

const legal = (
  <p style={{ margin: 0, font: "var(--type-caption)", color: "var(--text-tertiary)", textAlign: "center" }}>
    Ao continuar, você concorda com os <a href="/termos-de-uso">Termos de Uso</a> e a{" "}
    <a href="/politica-de-privacidade">Política de Privacidade</a>.
  </p>
);

const asideButtonStyle = { background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.4)" };

function Signup({ go }) {
  const { backend } = useSession();
  const [errors, setErrors] = React.useState({});
  const [error, setError] = React.useState(null);
  const [confirmEmail, setConfirmEmail] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    const email = e.target.email.value.trim();
    const password = e.target.pw.value;
    const next = {};
    if (name.length < 2) next.name = "Informe seu nome.";
    if (!isEmail(email)) next.email = "Informe um e-mail válido.";
    if (password.length < PASSWORD_MIN_LENGTH) next.pw = `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`;
    setErrors(next);
    setError(null);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      rememberChoice(true);
      const result = await backend.signUp(name, email, password);
      if (result.needsEmailConfirmation) setConfirmEmail(true);
    } catch (err) {
      setError(messageFor(err));
    }
    setLoading(false);
  };
  const google = async () => {
    setError(null);
    try {
      await backend.signInWithGoogle();
    } catch (err) {
      setError(messageFor(err));
    }
  };

  return (
    <AuthLayout
      aside={
        <>
          <h2 style={{ margin: 0, font: "var(--type-h2)", color: "#fff" }}>Já tem conta?</h2>
          <p style={{ margin: 0, color: "var(--navy-200)" }}>Entre para revisar sua conta e continuar sua jornada.</p>
          <button className="sm-btn sm-btn--secondary" style={asideButtonStyle} onClick={() => go("login")}>
            Entrar
          </button>
        </>
      }
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }} noValidate>
        <div>
          <h1 style={{ margin: 0, font: "var(--type-h2)" }}>Criar conta</h1>
          <p style={{ margin: "6px 0 0", color: "var(--text-secondary)" }}>Crie sua conta e comece sua jornada.</p>
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
        {confirmEmail && (
          <Banner tone="success" title="Confirme seu e-mail">
            Enviamos um link de confirmação. Depois de confirmar, é só entrar.
          </Banner>
        )}
        <TextField name="name" label="Nome completo" autoComplete="name" error={errors.name} />
        <TextField name="email" label="E-mail" type="email" autoComplete="email" error={errors.email} />
        <TextField name="pw" label="Senha" type="password" hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`} autoComplete="new-password" error={errors.pw} />
        <Button type="submit" size="lg" fullWidth loading={loading}>
          Criar conta
        </Button>
        <Divider>ou cadastre-se com</Divider>
        <GoogleBtn onClick={google} disabled={loading}>
          Continuar com Google
        </GoogleBtn>
        {legal}
      </form>
    </AuthLayout>
  );
}

function Forgot({ go }) {
  const { backend } = useSession();
  const [sent, setSent] = React.useState(false);
  const [emailError, setEmailError] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    if (!isEmail(email)) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    setLoading(true);
    try {
      await backend.resetPassword(email);
    } catch {
      /* resposta neutra: não revela se o e-mail tem conta */
    }
    setLoading(false);
    setSent(true);
  };

  return (
    <AuthLayout
      aside={
        <>
          <h2 style={{ margin: 0, font: "var(--type-h2)", color: "#fff" }}>Olá!</h2>
          <p style={{ margin: 0, color: "var(--navy-200)" }}>Comece sua jornada com a gente e descubra algo novo.</p>
        </>
      }
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }} noValidate>
        <div>
          <h1 style={{ margin: 0, font: "var(--type-h2)" }}>Recuperar senha</h1>
          <p style={{ margin: "6px 0 0", color: "var(--text-secondary)" }}>Informe seu e-mail para receber as instruções de recuperação.</p>
        </div>
        {sent && (
          <Banner tone="success" title="Instruções enviadas">
            Se houver uma conta com este e-mail, as instruções chegam em instantes. Confira também o spam.
          </Banner>
        )}
        <TextField name="email" label="E-mail cadastrado" type="email" icon="mail" autoComplete="email" error={emailError ? "Informe um e-mail válido." : undefined} />
        <Button type="submit" size="lg" fullWidth loading={loading}>
          Enviar instruções
        </Button>
        <Button variant="ghost" icon="arrow-left" onClick={() => go("login")}>
          Voltar para o login
        </Button>
      </form>
    </AuthLayout>
  );
}

/** Primeiro acesso no banco local: cria o administrador (conta master). */
function MasterSetup({ go }) {
  const { backend } = useSession();
  const [errors, setErrors] = React.useState({});
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    const email = e.target.email.value.trim();
    const password = e.target.pw.value;
    const next = {};
    if (name.length < 2) next.name = "Informe seu nome.";
    if (!isEmail(email)) next.email = "Informe um e-mail válido.";
    if (password.length < PASSWORD_MIN_LENGTH) next.pw = `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`;
    else if (password !== e.target.pw2.value) next.pw2 = "As duas senhas não são iguais.";
    setErrors(next);
    setError(null);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      rememberChoice(true);
      await backend.masterSetup.create(name, email, password);
    } catch (err) {
      setError(/administrador/.test(err?.message ?? "") ? "Já existe um administrador neste ambiente. Entre com a conta dele." : messageFor(err));
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      aside={
        <>
          <h2 style={{ margin: 0, font: "var(--type-h2)", color: "#fff" }}>Conta master</h2>
          <p style={{ margin: 0, color: "var(--navy-200)" }}>Administra usuários, questões, planos, estações e configurações da plataforma.</p>
        </>
      }
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }} noValidate>
        <div>
          <h1 style={{ margin: 0, font: "var(--type-h2)" }}>Criar conta master</h1>
          <p style={{ margin: "6px 0 0", color: "var(--text-secondary)" }}>Este é o primeiro acesso: a conta criada aqui será a administradora. Guarde o e-mail e a senha.</p>
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
        <TextField name="name" label="Nome completo" autoComplete="name" error={errors.name} />
        <TextField name="email" label="E-mail" type="email" autoComplete="email" error={errors.email} />
        <TextField name="pw" label="Senha" type="password" hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`} autoComplete="new-password" error={errors.pw} />
        <TextField name="pw2" label="Repita a senha" type="password" autoComplete="new-password" error={errors.pw2} />
        <Button type="submit" size="lg" fullWidth loading={loading}>
          Criar conta master
        </Button>
        <Button variant="ghost" icon="arrow-left" onClick={() => go("login")}>
          Voltar para o login
        </Button>
      </form>
    </AuthLayout>
  );
}

/** Fluxo de entrada: login → cadastro → recuperar senha (e, no 1º acesso local, conta master). */
export function AuthFlow() {
  const [screen, setScreen] = React.useState("login");
  const go = (next) => {
    setScreen(next);
    window.scrollTo(0, 0);
  };
  if (screen === "signup") return <Signup go={go} />;
  if (screen === "forgot") return <Forgot go={go} />;
  if (screen === "master") return <MasterSetup go={go} />;
  // tela de login "Acesso seguro REVALIDA" (auth/LoginScreen.jsx), com a mesma autenticação de antes
  return <LoginScreen go={go} />;
}
