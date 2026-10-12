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
import { PhoneField } from "./legal/PhoneField.jsx";
import { DocumentModal } from "./legal/DocumentModal.jsx";
import { COUNTRIES, normalizePhone, phoneError } from "./legal/phone.js";
import { TERMO_VERSAO } from "./legal/versions.js";
import { rememberGoogleAcceptance } from "./legal/googleAcceptance.js";
import { clearAuthLinkFromUrl, initialAuthLink } from "./auth/authLink.js";
import "./auth/login.css";

const ERROR_TEXT = {
  invalid_credentials: "Não foi possível entrar com esses dados. Verifique seu e-mail e senha.",
  email_taken: "Já existe uma conta com este e-mail.",
  weak_password: `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  same_password: "Escolha uma senha diferente da anterior.",
  link_expired: "Esse link venceu. Peça um novo.",
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

const asideButtonStyle = { background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.4)" };

function SecureField({ name, label, type = "text", autoComplete, hint, error }) {
  return (
    <div className="lg-field">
      <label className="lg-label" htmlFor={`secure-${name}`}>{label}</label>
      <input
        id={`secure-${name}`}
        name={name}
        type={type}
        autoComplete={autoComplete}
        className={`lg-input lg-input--plain${error ? " is-error" : ""}`}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? `secure-${name}-error` : undefined}
      />
      {error ? <span id={`secure-${name}-error`} className="lg-field-error">{error}</span> : hint ? <span className="lg-field-hint">{hint}</span> : null}
    </div>
  );
}

function SecureSignupLayout({ children, onLogin, onDoc, label = "Criar conta", asideTitle = "Já tem conta?", asideCopy = "Entre para continuar sua preparação para o Revalida.", asideButton = "Entrar" }) {
  return (
    <div className="lg-root">
      <div className="lg-shell lg-shell--auth">
        <header className="lg-top"><img className="lg-logo" src="/novo-assets/logo-staziamed-revalida-v2-escuro.png" alt="StaziaMed Revalida" width="200" height="61" /></header>
        <h1 className="lg-h1">Acesso seguro <span className="lg-grad">REVALIDA</span></h1>
        <section className="lg-card lg-auth-card" aria-label={label}>
          <div className="lg-auth-form">{children}</div>
          <aside className="lg-auth-aside">
            <svg className="lg-auth-mark" aria-hidden="true" viewBox="0 0 120 120" fill="none">
              <circle cx="60" cy="60" r="52" stroke="#7FE3DE" opacity=".2" />
              <path d="M60 18 94 31v30c0 23-15 40-34 49-19-9-34-26-34-49V31Z" fill="rgba(31,166,160,.12)" stroke="#7FE3DE" strokeWidth="2" />
              <path d="M43 60h34M60 43v34" stroke="#7FE3DE" strokeWidth="6" strokeLinecap="round" />
            </svg>
            <h2 className="lg-h2">{asideTitle}</h2>
            <p className="lg-sub lg-auth-copy">{asideCopy}</p>
            {asideButton ? <button type="button" className="lg-btn lg-btn-ghost lg-auth-login" onClick={onLogin}>{asideButton}</button> : null}
          </aside>
        </section>
        <p className="lg-tagline">Foco no que cai <span className="lg-dot">•</span> Memória no que fica <span className="lg-dot">•</span> Confiança na prova</p>
        <footer className="lg-footer"><span>© 2026 StaziaMed Revalida</span><button type="button" className="lg-link-btn" onClick={() => onDoc("termos")}>Termos de uso</button><button type="button" className="lg-link-btn" onClick={() => onDoc("privacidade")}>Privacidade</button></footer>
      </div>
    </div>
  );
}

const COUNTRY_CODES = new Set(COUNTRIES.filter((c) => c.code !== "outro").map((c) => c.code));
const ACCEPT_ERROR = "Para criar a conta, é preciso aceitar o Termo de Aceite e Uso e a Política de Privacidade.";
const ACCEPT_TEXT = "Declaro que li e compreendi os Termos de Aceite e Uso e a Política de Privacidade do StaziaMed Revalida e concordo com suas condições.";
// ids dos campos, na ordem da tela, para levar o foco ao primeiro com erro
const FIELD_IDS = { name: "secure-name", email: "secure-email", code: "secure-phone-code", phone: "secure-phone-number", pw: "secure-pw", pw2: "secure-pw2", accept: "secure-accept" };

function Signup({ go }) {
  const { backend } = useSession();
  const [errors, setErrors] = React.useState({});
  const [error, setError] = React.useState(null);
  const [confirmEmail, setConfirmEmail] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [phone, setPhone] = React.useState({ code: "+55", number: "" });
  const [accepted, setAccepted] = React.useState(false);
  const [doc, setDoc] = React.useState(null);
  const closeDoc = React.useCallback(() => setDoc(null), []);

  const focusFirst = (next) => {
    const first = ["name", "email", "code", "phone", "pw", "pw2", "accept"].find((k) => next[k]);
    if (first) document.getElementById(FIELD_IDS[first])?.focus();
  };

  const submit = async (e) => {
    e.preventDefault();
    const field = (n) => e.target.elements.namedItem(n).value;
    const name = field("name").trim();
    const email = field("email").trim();
    const password = field("pw");
    const next = {};
    if (name.length < 2) next.name = "Informe seu nome.";
    if (!isEmail(email)) next.email = "Informe um e-mail válido.";
    const phoneMsg = phoneError(phone.code, phone.number);
    if (phoneMsg) {
      // Outro país com número preenchido, mas código vazio ou inválido: o erro vai para a caixa do código
      if (phone.number.trim() && !/^\+?[1-9][0-9]{0,2}$/.test(phone.code.trim()) && !COUNTRY_CODES.has(phone.code)) next.code = phoneMsg;
      else next.phone = phoneMsg;
    }
    if (password.length < PASSWORD_MIN_LENGTH) next.pw = `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`;
    else if (password !== field("pw2")) next.pw2 = "As senhas não são iguais.";
    if (!accepted) next.accept = ACCEPT_ERROR;
    setErrors(next);
    setError(null);
    if (Object.keys(next).length) {
      focusFirst(next);
      return;
    }

    setLoading(true);
    try {
      rememberChoice(true);
      const result = await backend.signUp(name, email, password, {
        phone: normalizePhone(phone.code, phone.number),
        termsVersion: TERMO_VERSAO,
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      });
      if (result.needsEmailConfirmation) setConfirmEmail(true);
    } catch (err) {
      setError(messageFor(err));
    }
    setLoading(false);
  };
  const google = async () => {
    setError(null);
    if (!accepted) {
      const next = { accept: ACCEPT_ERROR };
      setErrors(next);
      focusFirst(next);
      return;
    }
    setErrors({});
    try {
      rememberGoogleAcceptance(TERMO_VERSAO);
      await backend.signInWithGoogle();
    } catch (err) {
      setError(messageFor(err));
    }
  };

  return (
    <SecureSignupLayout onLogin={() => go("login")} onDoc={setDoc}>
      <form onSubmit={submit} className="lg-auth-fields" noValidate>
        <div><h2 className="lg-h2">Criar conta</h2><p className="lg-sub">Crie sua conta e comece sua jornada.</p></div>
        {error && <div className="lg-msg lg-msg--error" role="alert">{error}</div>}
        {confirmEmail && <div className="lg-msg lg-msg--success" role="status">Enviamos um link de confirmação. Depois de confirmar, é só entrar.</div>}
        <SecureField name="name" label="Nome completo" autoComplete="name" error={errors.name} />
        <SecureField name="email" label="E-mail" type="email" autoComplete="email" error={errors.email} />
        <PhoneField code={phone.code} number={phone.number} onChange={setPhone} error={errors.phone} codeError={errors.code} />
        <SecureField name="pw" label="Senha" type="password" hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`} autoComplete="new-password" error={errors.pw} />
        <SecureField name="pw2" label="Conferir senha" type="password" autoComplete="new-password" error={errors.pw2} />
        <div className="lg-field">
          <label className="lg-accept">
            <input
              id="secure-accept"
              aria-label={ACCEPT_TEXT}
              type="checkbox"
              className="lg-check"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              aria-invalid={errors.accept ? "true" : "false"}
              aria-describedby={errors.accept ? "secure-accept-error" : undefined}
            />
            <span>
              Declaro que li e compreendi os{" "}
              <button type="button" className="lg-link-btn" onClick={() => setDoc("termos")}>Termos de Aceite e Uso</button>
              {" "}e a{" "}
              <button type="button" className="lg-link-btn" onClick={() => setDoc("privacidade")}>Política de Privacidade</button>
              {" "}do StaziaMed Revalida e concordo com suas condições.
            </span>
          </label>
          {errors.accept ? <span id="secure-accept-error" className="lg-field-error">{errors.accept}</span> : null}
        </div>
        <button type="submit" className="lg-btn lg-btn-primary" disabled={loading}>{loading ? <><span className="lg-spin" />CRIANDO CONTA…</> : "CRIAR CONTA"}</button>
        <div className="lg-or" aria-hidden="true"><span /><span>ou cadastre-se com</span><span /></div>
        <button type="button" className="lg-btn lg-btn-ghost" onClick={google} disabled={loading}><img src="/novo-assets/google.svg" alt="" width="18" height="18" />Criar conta com Google</button>
      </form>
      {doc && <DocumentModal doc={doc} onClose={closeDoc} />}
    </SecureSignupLayout>
  );
}

function Forgot({ go }) {
  const { backend } = useSession();
  const [sent, setSent] = React.useState(false);
  const [emailError, setEmailError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [doc, setDoc] = React.useState(null);
  const closeDoc = React.useCallback(() => setDoc(null), []);

  const submit = async (e) => {
    e.preventDefault();
    const email = e.target.elements.namedItem("email").value.trim();
    if (!isEmail(email)) {
      setEmailError("Informe um e-mail válido.");
      document.getElementById("secure-email")?.focus();
      return;
    }
    setEmailError(null);
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
    <SecureSignupLayout
      onLogin={() => go("login")}
      onDoc={setDoc}
      label="Recuperar senha"
      asideTitle="Lembrou da senha?"
      asideCopy="Volte para o login e continue sua preparação para o Revalida."
      asideButton="Entrar"
    >
      <form onSubmit={submit} className="lg-auth-fields" noValidate>
        <div><h2 className="lg-h2">Recuperar senha</h2><p className="lg-sub">Informe seu e-mail para receber as instruções de recuperação.</p></div>
        {sent && (
          <div className="lg-msg lg-msg--success" role="status">
            Se houver uma conta com este e-mail, as instruções chegam em instantes. Confira também o spam.
          </div>
        )}
        <SecureField name="email" label="E-mail cadastrado" type="email" autoComplete="email" error={emailError} />
        <button type="submit" className="lg-btn lg-btn-primary" disabled={loading}>
          {loading ? <><span className="lg-spin" />ENVIANDO…</> : "ENVIAR INSTRUÇÕES"}
        </button>
        <button type="button" className="lg-link-btn" onClick={() => go("login")}>Voltar para o login</button>
      </form>
      {doc && <DocumentModal doc={doc} onClose={closeDoc} />}
    </SecureSignupLayout>
  );
}

/**
 * Depois do link do e-mail de recuperar senha: a pessoa já está dentro (o link criou uma sessão de recuperação), mas antes de
 * usar o app precisa criar a nova senha. Só depois de salvar, a mensagem de sucesso aparece e o botão abre o app.
 */
export function NewPasswordScreen() {
  const { backend, finishRecovery, signOut } = useSession();
  const [errors, setErrors] = React.useState({});
  const [error, setError] = React.useState(null);
  const [expired, setExpired] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [doc, setDoc] = React.useState(null);
  const closeDoc = React.useCallback(() => setDoc(null), []);

  const submit = async (e) => {
    e.preventDefault();
    const field = (n) => e.target.elements.namedItem(n).value;
    const password = field("pw");
    const next = {};
    if (password.length < PASSWORD_MIN_LENGTH) next.pw = `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`;
    else if (password !== field("pw2")) next.pw2 = "As senhas não são iguais.";
    setErrors(next);
    setError(null);
    if (Object.keys(next).length) {
      document.getElementById(next.pw ? "secure-pw" : "secure-pw2")?.focus();
      return;
    }
    setLoading(true);
    try {
      await backend.updatePassword(password);
      rememberChoice(true);
      setDone(true);
    } catch (err) {
      if (err?.code === "link_expired") setExpired(true);
      else setError(messageFor(err));
    }
    setLoading(false);
  };
  // link vencido no meio do caminho: sai da sessão de recuperação e leva ao pedido de um novo link
  const askAgain = async () => {
    clearAuthLinkFromUrl();
    try {
      await signOut();
    } catch {
      /* já estava fora */
    }
    finishRecovery();
  };

  return (
    <SecureSignupLayout
      onLogin={() => {}}
      onDoc={setDoc}
      label="Criar nova senha"
      asideTitle="Defina sua nova senha"
      asideCopy="Escolha uma senha que só você conheça. Depois é só continuar sua preparação para o Revalida."
      asideButton={null}
    >
      <form onSubmit={submit} className="lg-auth-fields" noValidate>
        <div><h2 className="lg-h2">Criar nova senha</h2><p className="lg-sub">Escreva a nova senha duas vezes para confirmar.</p></div>
        {error && <div className="lg-msg lg-msg--error" role="alert">{error}</div>}
        {expired && <div className="lg-msg lg-msg--error" role="alert">Esse link venceu. Peça um novo.</div>}
        {done && <div className="lg-msg lg-msg--success" role="status">Senha alterada com sucesso. Você já está dentro da sua conta.</div>}
        {done ? (
          <button type="button" className="lg-btn lg-btn-primary" onClick={() => finishRecovery()}>ENTRAR NO APP</button>
        ) : expired ? (
          <button type="button" className="lg-btn lg-btn-primary" onClick={askAgain}>PEDIR NOVO LINK</button>
        ) : (
          <>
            <SecureField name="pw" label="Nova senha" type="password" hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`} autoComplete="new-password" error={errors.pw} />
            <SecureField name="pw2" label="Conferir nova senha" type="password" autoComplete="new-password" error={errors.pw2} />
            <button type="submit" className="lg-btn lg-btn-primary" disabled={loading}>{loading ? <><span className="lg-spin" />SALVANDO…</> : "SALVAR NOVA SENHA"}</button>
            <button type="button" className="lg-link-btn" onClick={async () => { try { await signOut(); } catch { /* já estava fora */ } finishRecovery(); }}>Agora não, sair</button>
          </>
        )}
      </form>
      {doc && <DocumentModal doc={doc} onClose={closeDoc} />}
    </SecureSignupLayout>
  );
}

/** Link do e-mail vencido ou já usado: aviso claro e botão para pedir outro. */
function ExpiredLink({ go }) {
  const [doc, setDoc] = React.useState(null);
  const closeDoc = React.useCallback(() => setDoc(null), []);
  const askAgain = () => {
    clearAuthLinkFromUrl();
    go("forgot");
  };
  return (
    <SecureSignupLayout
      onLogin={() => { clearAuthLinkFromUrl(); go("login"); }}
      onDoc={setDoc}
      label="Link vencido"
      asideTitle="Lembrou da senha?"
      asideCopy="Volte para o login e continue sua preparação para o Revalida."
      asideButton="Entrar"
    >
      <div className="lg-auth-fields">
        <div><h2 className="lg-h2">Link vencido</h2><p className="lg-sub">Por segurança, cada link vale por pouco tempo e só pode ser usado uma vez.</p></div>
        <div className="lg-msg lg-msg--error" role="alert">Esse link venceu. Peça um novo.</div>
        <button type="button" className="lg-btn lg-btn-primary" onClick={askAgain}>PEDIR NOVO LINK</button>
        <button type="button" className="lg-link-btn" onClick={() => { clearAuthLinkFromUrl(); go("login"); }}>Voltar para o login</button>
      </div>
      {doc && <DocumentModal doc={doc} onClose={closeDoc} />}
    </SecureSignupLayout>
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
export function AuthFlow({ link = initialAuthLink } = {}) {
  // link do e-mail vencido ou já usado: abre direto o aviso "Esse link venceu. Peça um novo."
  const [screen, setScreen] = React.useState(link?.kind === "expired" ? "expired" : "login");
  const go = (next) => {
    setScreen(next);
    window.scrollTo(0, 0);
  };
  if (screen === "signup") return <Signup go={go} />;
  if (screen === "forgot") return <Forgot go={go} />;
  if (screen === "expired") return <ExpiredLink go={go} />;
  if (screen === "master") return <MasterSetup go={go} />;
  // tela de login "Acesso seguro REVALIDA" (auth/LoginScreen.jsx), com a mesma autenticação de antes
  return <LoginScreen go={go} />;
}
