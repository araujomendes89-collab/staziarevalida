// Tela de login "Acesso seguro REVALIDA" (pacote "Pagina de Login", 2026-10-07), ligada à autenticação que já
// existia: backend.signIn (e-mail e senha), backend.signInWithGoogle, "Lembrar de mim" (rememberChoice), recuperação
// de senha e criação de conta (as mesmas telas de antes). Nada de senha guardada no navegador nem em registro:
// a senha só vai para o backend no envio. Estados: normal, foco, carregando, erro e sucesso.
import React from "react";
import { rememberChoice, useSession } from "../session.jsx";
import { useSupportEmail } from "../support/supportContact.jsx";
import "./login.css";

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Textos oficiais da tela
export const LOGIN_TEXT = {
  title: "Acesso seguro",
  titleAccent: "REVALIDA",
  welcome: "Bem-vindo de volta",
  subtitle: "Acesse sua preparação para o Revalida.",
  loading: "VERIFICANDO ACESSO…",
  error: "Confira seu e-mail e sua senha.",
  success: "Acesso autorizado.",
  tagline: ["Foco no que cai", "Memória no que fica", "Confiança na prova"],
  copyright: "© 2026 StaziaMed Revalida",
};

/** Erros que não são de e-mail/senha: mantém a explicação de antes (rede, Google indisponível…). */
const OTHER_ERRORS = {
  invalid_email: "Informe um e-mail válido.",
  google_unavailable: "O login com Google não está disponível neste ambiente.",
  network: "Falha de conexão. Verifique sua internet e tente de novo.",
  unknown: "Não foi possível concluir. Tente novamente.",
};
const errorText = (error) => (!error?.code || error.code === "invalid_credentials" ? LOGIN_TEXT.error : (OTHER_ERRORS[error.code] ?? OTHER_ERRORS.unknown));

/** Etapas [Identidade, Segurança, Acesso] por estado: "" | "is-active" | "is-done". */
function stepsFor(status, focus, emailOk) {
  if (status === "success") return ["is-done", "is-done", "is-done"];
  if (status === "loading") return ["is-done", "is-active", ""];
  if (status === "error") return ["", "is-active", ""];
  if (focus === "email") return ["is-active", "", ""];
  if (focus === "password") return [emailOk ? "is-done" : "", "is-active", ""];
  return [emailOk ? "is-done" : "", "", ""];
}

const Check = ({ size = 16, width = 3, color = "currentColor" }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

function Shield({ status, focused }) {
  const loading = status === "loading";
  const success = status === "success";
  return (
    <svg
      className={`lg-shield${focused ? " is-focus" : ""}${success ? " is-success" : ""}`}
      role="img"
      aria-label={success ? "Escudo desbloqueado" : "Escudo com cadeado fechado"}
      viewBox="0 0 240 240"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <linearGradient id="lg-sh" gradientUnits="userSpaceOnUse" x1="56" y1="36" x2="184" y2="206">
          <stop offset="0" stopColor="#7FE3DE" />
          <stop offset=".5" stopColor="#3A7BD5" />
          <stop offset="1" stopColor="#7B5DB7" />
        </linearGradient>
        <linearGradient id="lg-sh-fill" gradientUnits="userSpaceOnUse" x1="120" y1="36" x2="120" y2="206">
          <stop offset="0" stopColor="#1FA6A0" stopOpacity=".22" />
          <stop offset="1" stopColor="#7B5DB7" stopOpacity=".10" />
        </linearGradient>
      </defs>
      <circle cx="120" cy="120" r="112" stroke="#7FE3DE" strokeWidth="1" opacity=".14" />
      <circle cx="120" cy="120" r="96" stroke="#7B5DB7" strokeWidth="1" opacity=".3" strokeDasharray="2 8" />
      {loading && (
        <>
          <circle className="lg-halo" cx="120" cy="120" r="104" stroke="#1FA6A0" strokeWidth="1.5" />
          <circle className="lg-scan" cx="120" cy="120" r="104" stroke="#7FE3DE" strokeWidth="3" strokeDasharray="120 534" />
        </>
      )}
      <path d="M120 36 L184 60 V118 C184 160 156 190 120 206 C84 190 56 160 56 118 V60 Z" fill="url(#lg-sh-fill)" stroke="url(#lg-sh)" strokeWidth="3" />
      <rect x="94" y="112" width="52" height="42" rx="9" stroke="#F2F6FA" strokeWidth="3" />
      <path d="M120 128 v10" stroke="#F2F6FA" strokeWidth="3" />
      {success ? (
        <>
          <path d="M104 112 V88 a16 16 0 0 1 32 0 V94" stroke="#7FE3DE" strokeWidth="3" />
          <circle cx="166" cy="72" r="15" fill="#1FA6A0" />
          <path d="M159 72.5 l5 5 l9 -10" stroke="#07080D" strokeWidth="3" />
        </>
      ) : (
        <path d="M104 112 V98 a16 16 0 0 1 32 0 V112" stroke="#F2F6FA" strokeWidth="3" />
      )}
    </svg>
  );
}

/** Fundo decorativo (halos, linhas, pontos e um traçado de ECG discreto); some no celular. */
function Backdrop() {
  return (
    <svg className="lg-deco" aria-hidden="true" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <g stroke="#7FE3DE" strokeWidth="1">
        <circle cx="170" cy="700" r="210" opacity=".10" />
        <circle cx="170" cy="700" r="130" opacity=".14" />
        <circle cx="1290" cy="210" r="240" opacity=".08" stroke="#7B5DB7" />
        <circle cx="1290" cy="210" r="150" opacity=".16" stroke="#7B5DB7" />
        <path d="M0 150 H250 l40 40 H420" opacity=".14" />
        <path d="M1440 760 H1210 l-40 -40 H1060" opacity=".14" stroke="#3A7BD5" />
        <path d="M90 0 V90 l30 30 V220" opacity=".10" />
        <path d="M1360 900 V800 l-30 -30 V690" opacity=".12" stroke="#7B5DB7" />
      </g>
      <path d="M-10 470 H420 l14 -12 l12 12 h20 l12 40 l20 -110 l20 90 l10 -20 h24 l16 -16 l16 16 H1450" stroke="#1FA6A0" strokeWidth="1.5" opacity=".12" />
      <g stroke="none">
        <circle cx="420" cy="190" r="3" fill="#7FE3DE" opacity=".6" />
        <circle cx="1060" cy="720" r="3" fill="#3A7BD5" opacity=".7" />
        <circle cx="120" cy="220" r="3" fill="#7FE3DE" opacity=".5" />
        <circle cx="1330" cy="690" r="3" fill="#7B5DB7" opacity=".8" />
        <circle cx="300" cy="820" r="2" fill="#F5B041" opacity=".55" />
        <circle cx="1150" cy="90" r="2" fill="#7FE3DE" opacity=".5" />
        <circle cx="640" cy="60" r="2" fill="#3A7BD5" opacity=".6" />
        <circle cx="860" cy="850" r="2" fill="#7FE3DE" opacity=".4" />
      </g>
    </svg>
  );
}

export function LoginScreen({ go }) {
  const { backend } = useSession();
  const supportEmail = useSupportEmail();
  // idle | loading | error | success
  const [status, setStatus] = React.useState("idle");
  const [message, setMessage] = React.useState("");
  const [emailInvalid, setEmailInvalid] = React.useState(false);
  const [focus, setFocus] = React.useState(null);
  const [emailOk, setEmailOk] = React.useState(false);
  const [showPw, setShowPw] = React.useState(false);
  const [needsMaster, setNeedsMaster] = React.useState(false);
  const alive = React.useRef(true);
  const emailRef = React.useRef(null);

  React.useEffect(() => {
    alive.current = true;
    backend.masterSetup
      ?.needed()
      .then((needed) => alive.current && setNeedsMaster(needed))
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, [backend]);

  const fail = (text, email = false) => {
    setStatus("error");
    setMessage(text);
    setEmailInvalid(email);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (status === "loading" || status === "success") return;
    const fields = e.currentTarget.elements;
    const email = fields.namedItem("email").value.trim();
    const password = fields.namedItem("password").value;
    const remember = fields.namedItem("remember").checked;
    if (!isEmail(email)) {
      fail(OTHER_ERRORS.invalid_email, true);
      emailRef.current?.focus();
      return;
    }
    if (!password) return fail(LOGIN_TEXT.error);
    setStatus("loading");
    setMessage("");
    setEmailInvalid(false);
    try {
      rememberChoice(remember);
      await backend.signIn(email, password);
      // a sessão troca para o app quando os dados de abertura chegam; até lá, a tela confirma o acesso
      if (alive.current) setStatus("success");
    } catch (err) {
      if (alive.current) fail(errorText(err));
    }
  };

  const google = async () => {
    if (status === "loading" || status === "success") return;
    try {
      await backend.signInWithGoogle();
    } catch (err) {
      // no Google não há senha: erro de credencial vira a mensagem genérica
      fail(err?.code && err.code !== "invalid_credentials" ? errorText(err) : OTHER_ERRORS.unknown);
    }
  };

  const loading = status === "loading";
  const success = status === "success";
  const error = status === "error";
  const steps = stepsFor(status, focus, emailOk);
  const inputCls = (bad) => `lg-input${error && bad ? " is-error" : ""}`;

  return (
    <div className="lg-root">
      <div className="lg-shell">
        <Backdrop />
        <header className="lg-top">
          <img className="lg-logo" src="/novo-assets/logo-staziamed-revalida-v2-escuro.png" alt="StaziaMed Revalida" width="200" height="61" />
        </header>

        <h1 className="lg-h1">
          {LOGIN_TEXT.title} <span className="lg-grad">{LOGIN_TEXT.titleAccent}</span>
        </h1>

        <section className="lg-card" aria-label="Entrar na sua conta">
          <form className="lg-form" onSubmit={submit} noValidate>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 className="lg-h2">{LOGIN_TEXT.welcome}</h2>
              {/* a mensagem de estado ocupa o lugar do subtítulo para o painel não crescer */}
              <div aria-live="polite" style={{ display: "flex", flexDirection: "column" }}>
                {status === "idle" && <p className="lg-sub">{LOGIN_TEXT.subtitle}</p>}
                {loading && (
                  <div className="lg-msg lg-msg--loading" role="status">
                    <span>{LOGIN_TEXT.loading}</span>
                  </div>
                )}
                {error && (
                  <div className="lg-msg lg-msg--error" role="alert">
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7.5v5.5M12 16.5v.1" />
                    </svg>
                    <span>{message}</span>
                  </div>
                )}
                {success && (
                  <div className="lg-msg lg-msg--success" role="status">
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7FE3DE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8 12.5l2.8 2.8L16 9.8" />
                    </svg>
                    <span>{LOGIN_TEXT.success}</span>
                  </div>
                )}
              </div>
            </div>

            {needsMaster && (
              <div className="lg-msg lg-msg--info">
                <span style={{ flex: "1 1 200px" }}>Primeiro acesso: ainda não há administrador neste ambiente.</span>
                <button type="button" className="lg-btn lg-btn-ghost lg-btn-small" onClick={() => go("master")}>
                  Criar conta master
                </button>
              </div>
            )}

            <div className="lg-field">
              <label className="lg-label" htmlFor="lg-email">
                E-mail
              </label>
              <div className="lg-control">
                <svg className="lg-ico" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
                  <path d="M4 7.5l8 6 8-6" />
                </svg>
                <input
                  ref={emailRef}
                  id="lg-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="voce@exemplo.com"
                  className={inputCls(true)}
                  aria-invalid={error && (emailInvalid || message === LOGIN_TEXT.error) ? "true" : "false"}
                  disabled={loading || success}
                  onFocus={() => setFocus("email")}
                  onBlur={() => setFocus(null)}
                  onInput={(e) => setEmailOk(isEmail(e.currentTarget.value.trim()))}
                />
                {emailOk && (
                  <svg className="lg-ok" role="img" aria-label="E-mail em formato válido" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7FE3DE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8 12.5l2.8 2.8L16 9.8" />
                  </svg>
                )}
              </div>
            </div>

            <div className="lg-field">
              <label className="lg-label" htmlFor="lg-password">
                Senha
              </label>
              <div className="lg-control">
                <svg className="lg-ico" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
                  <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" />
                </svg>
                <input
                  id="lg-password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  className={inputCls(!emailInvalid)}
                  aria-invalid={error && !emailInvalid ? "true" : "false"}
                  disabled={loading || success}
                  onFocus={() => setFocus("password")}
                  onBlur={() => setFocus(null)}
                />
                <button type="button" className="lg-eye" aria-label={showPw ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPw ? "true" : "false"} onClick={() => setShowPw((v) => !v)}>
                  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                    <circle cx="12" cy="12" r="3" />
                    {showPw && <path d="M4 4l16 16" />}
                  </svg>
                </button>
              </div>
            </div>

            <div className="lg-row">
              <label className="lg-remember">
                <input type="checkbox" name="remember" className="lg-check" defaultChecked />
                <span>Lembrar de mim</span>
              </label>
              <button type="button" className="lg-link-btn" onClick={() => go("forgot")}>
                Esqueci minha senha
              </button>
            </div>

            <button type="submit" className={`lg-btn lg-btn-primary${success ? " is-success" : ""}`} disabled={loading} aria-busy={loading ? "true" : "false"}>
              {loading ? (
                <>
                  <span className="lg-spin" aria-hidden="true" />
                  <span>VERIFICANDO…</span>
                </>
              ) : success ? (
                <>
                  <Check size={20} width={2.4} />
                  <span>ACESSO AUTORIZADO</span>
                </>
              ) : (
                <span>ENTRAR</span>
              )}
            </button>

            <div className="lg-or" aria-hidden="true">
              <span />
              <span>ou</span>
              <span />
            </div>

            <button type="button" className="lg-btn lg-btn-ghost" onClick={google} disabled={loading || success}>
              <span className="lg-g" aria-hidden="true">
                G
              </span>
              <span>Continuar com Google</span>
            </button>

            <p className="lg-signup">
              Ainda não tem uma conta?{" "}
              <button type="button" className="lg-link-btn lg-link-btn--strong" onClick={() => go("signup")}>
                Criar conta
              </button>
            </p>
          </form>

          <aside className="lg-aside" aria-label="Etapas do acesso">
            <Shield status={status} focused={focus !== null && status === "idle"} />
            <ol className="lg-steps">
              {[
                ["Identidade", "Informe seu e-mail"],
                ["Segurança", "Proteja seu acesso"],
                ["Acesso", "Entre para continuar"],
              ].map(([title, desc], i) => (
                <li key={title} className={`lg-step ${steps[i]}`.trim()} aria-current={steps[i] === "is-active" ? "step" : undefined}>
                  <span className="lg-step-dot">
                    <span className="lg-n">{i + 1}</span>
                    <Check />
                  </span>
                  <span className="lg-step-text">
                    <span className="lg-step-title">{title}</span>
                    <span className="lg-step-desc">{desc}</span>
                    {steps[i] === "is-done" && <span className="lg-sr"> (concluída)</span>}
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </section>

        <p className="lg-tagline">
          {LOGIN_TEXT.tagline.map((t, i) => (
            <React.Fragment key={t}>
              {i > 0 && (
                <>
                  {" "}
                  <span className="lg-dot" aria-hidden="true">
                    •
                  </span>{" "}
                </>
              )}
              <span>{t}</span>
            </React.Fragment>
          ))}
        </p>

        <footer className="lg-footer">
          <span>{LOGIN_TEXT.copyright}</span>
          <a href="/novo/termos">Termos de uso</a>
          <a href="/novo/privacidade">Privacidade</a>
          <span>
            Precisa de ajuda? <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          </span>
        </footer>
      </div>
    </div>
  );
}
