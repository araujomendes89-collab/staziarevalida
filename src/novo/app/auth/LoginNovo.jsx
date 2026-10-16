// Login do pacote "Novas telas" (LoginWeb, LoginTablet, LoginMobile; 15/10/2026): fundo azul-marinho, cartão branco com o selo
// "ACESSO SEGURO · REVALIDA", frase "Foco no que cai. Memória no que fica. Confiança na prova.", etapas Identidade/Segurança/Acesso,
// botão ENTRAR azul, Google, "Esqueci minha senha" e "Criar conta". Mesma lógica do login de antes (useLoginForm.js): nada muda
// em autenticação, recuperação de senha, cadastro (com o Termo de aceite) ou "Lembrar de mim".
// Computador (>= 1024 px): frase e etapas à esquerda, cartão à direita. Tablet: tudo centralizado, etapas em linha.
// Celular (<= 719 px): logo e etapas no alto e o cartão branco ocupa o resto da tela.
import React from "react";
import { useSupportEmail } from "../support/supportContact.jsx";
import { useMQ } from "../shell/useLayout.js";
import { LOGIN_STEPS, LOGIN_TEXT, useLoginForm } from "./useLoginForm.js";
import "./login.css"; // só pelas fontes Barlow (licença OFL), as classes lg- não são usadas aqui
import "./login-novo.css";

const Svg = ({ size = 18, width = 2.2, children, ...rest }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {children}
  </svg>
);
const Lock = (p) => (
  <Svg {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Svg>
);
const Mail = (p) => (
  <Svg {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </Svg>
);
const Check = (p) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

function Footer({ supportEmail, className }) {
  return (
    <footer className={`ln-foot ${className}`}>
      <span>{LOGIN_TEXT.copyright}</span>
      <a href="/novo/termos">Termos de uso</a>
      <a href="/novo/privacidade">Privacidade</a>
      <span>
        Precisa de ajuda?{" "}
        <a className="ln-foot-mail" href={`mailto:${supportEmail}`}>
          {supportEmail}
        </a>
      </span>
    </footer>
  );
}

export function LoginNovo({ go }) {
  const supportEmail = useSupportEmail();
  const f = useLoginForm();
  const mobile = useMQ("(max-width: 719px)");
  const tablet = useMQ("(max-width: 1023px)");
  const size = mobile ? "m" : tablet ? "t" : "w"; // sem matchMedia (testes): computador
  const { status, message, emailInvalid, setFocus, emailOk, showPw, loading, success, error } = f;
  // no pacote a primeira etapa já aparece acesa; o resto segue o estado real do formulário
  const steps = f.steps.every((s) => !s) ? ["is-active", "", ""] : f.steps;
  const bad = (field) => error && (field === "email" ? emailInvalid || message === LOGIN_TEXT.error : !emailInvalid);

  return (
    <div className={`ln-root ln-root--${size}`}>
      <section className="ln-side">
        <img className="ln-logo" src="/brand/horizontal-escuro-480w.png" alt="StaziaMed Revalida" width="155" height="48" />
        {size === "t" && (
          <p className="ln-tagline">
            {LOGIN_TEXT.tagline.map((t, i) => (
              <React.Fragment key={t}>
                {i > 0 && <span aria-hidden="true"> • </span>}
                <span>{t}</span>
              </React.Fragment>
            ))}
          </p>
        )}
        {size === "w" && (
          <div className="ln-hero">
            <p className="ln-hero-h" aria-hidden="true">
              {LOGIN_TEXT.tagline[0]}.<br />
              <span>{LOGIN_TEXT.tagline[1]}.</span>
              <br />
              {LOGIN_TEXT.tagline[2]}.
            </p>
            <p className="ln-hero-sub">{LOGIN_TEXT.subtitle}</p>
          </div>
        )}
        <ol className="ln-steps" aria-label="Etapas do acesso">
          {LOGIN_STEPS.map(([title, desc], i) => (
            <li key={title} className={`ln-step ${steps[i]}`.trim()} aria-current={steps[i] === "is-active" ? "step" : undefined}>
              <span className="ln-step-dot">{steps[i] === "is-done" ? <Check size={16} width={3} /> : i + 1}</span>
              <span className="ln-step-txt">
                <span className="ln-step-t">{title}</span>
                <span className="ln-step-d">{desc}</span>
                {steps[i] === "is-done" && <span className="ln-sr"> (concluída)</span>}
              </span>
            </li>
          ))}
        </ol>
        {size === "w" && <Footer supportEmail={supportEmail} className="ln-foot--side" />}
      </section>

      <main className="ln-main">
        <div className="ln-card">
          <form className="ln-form" onSubmit={f.submit} noValidate aria-label="Entrar na sua conta">
            <span className="ln-badge">
              <Lock size={13} width={2.6} />
              {LOGIN_TEXT.badge}
            </span>
            <div className="ln-head">
              <h1 className="ln-h1">{LOGIN_TEXT.welcome}</h1>
              <div aria-live="polite" className="ln-live">
                {status === "idle" && <p className="ln-sub">{LOGIN_TEXT.subtitle}</p>}
                {loading && (
                  <p className="ln-msg ln-msg--loading" role="status">
                    {LOGIN_TEXT.loading}
                  </p>
                )}
                {error && (
                  <p className="ln-msg ln-msg--error" role="alert">
                    <Svg size={18} width={2.2}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7.5v5.5M12 16.5v.1" />
                    </Svg>
                    <span>{message}</span>
                  </p>
                )}
                {success && (
                  <p className="ln-msg ln-msg--success" role="status">
                    <Svg size={18} width={2.2}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8 12.5l2.8 2.8L16 9.8" />
                    </Svg>
                    <span>{LOGIN_TEXT.success}</span>
                  </p>
                )}
              </div>
            </div>

            {f.needsMaster && (
              <div className="ln-msg ln-msg--info">
                <span style={{ flex: "1 1 200px" }}>Primeiro acesso: ainda não há administrador neste ambiente.</span>
                <button type="button" className="ln-small" onClick={() => go("master")}>
                  Criar conta master
                </button>
              </div>
            )}

            <div className="ln-field">
              <label className="ln-label" htmlFor="ln-email">
                E-mail
              </label>
              <span className="ln-control">
                <Mail className="ln-ico" />
                <input
                  ref={f.emailRef}
                  id="ln-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="voce@exemplo.com"
                  className={`ln-input${bad("email") ? " is-error" : ""}`}
                  aria-invalid={bad("email") ? "true" : "false"}
                  disabled={loading || success}
                  onFocus={() => setFocus("email")}
                  onBlur={() => setFocus(null)}
                  onInput={f.onEmailInput}
                />
                {emailOk && (
                  <svg
                    className="ln-ok"
                    role="img"
                    aria-label="E-mail em formato válido"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8 12.5l2.8 2.8L16 9.8" />
                  </svg>
                )}
              </span>
            </div>

            <div className="ln-field">
              <label className="ln-label" htmlFor="ln-password">
                Senha
              </label>
              <span className="ln-control">
                <Lock className="ln-ico" />
                <input
                  id="ln-password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  className={`ln-input ln-input--pw${bad("password") ? " is-error" : ""}`}
                  aria-invalid={bad("password") ? "true" : "false"}
                  disabled={loading || success}
                  onFocus={() => setFocus("password")}
                  onBlur={() => setFocus(null)}
                />
                <button type="button" className="ln-eye" aria-label={showPw ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPw ? "true" : "false"} onClick={f.togglePw}>
                  <Svg size={18}>
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                    {showPw && <path d="M3 3l18 18" />}
                  </Svg>
                </button>
              </span>
            </div>

            <div className="ln-row">
              <label className="ln-remember">
                <input type="checkbox" name="remember" defaultChecked />
                <span>Lembrar de mim</span>
              </label>
              <button type="button" className="ln-link" onClick={() => go("forgot")}>
                Esqueci minha senha
              </button>
            </div>

            <button type="submit" className={`ln-btn ln-btn--primary${success ? " is-success" : ""}`} disabled={loading} aria-busy={loading ? "true" : "false"}>
              {loading ? (
                <>
                  <span className="ln-spin" aria-hidden="true" />
                  <span>VERIFICANDO…</span>
                </>
              ) : success ? (
                <>
                  <Check size={20} width={2.6} />
                  <span>ACESSO AUTORIZADO</span>
                </>
              ) : (
                <span>ENTRAR</span>
              )}
            </button>

            <div className="ln-or" aria-hidden="true">
              <span />
              ou
              <span />
            </div>

            <button type="button" className="ln-btn ln-btn--google" onClick={f.google} disabled={loading || success}>
              <img src="/novo-assets/google.svg" alt="" width="20" height="20" />
              <span>Continuar com Google</span>
            </button>

            <p className="ln-signup">
              Ainda não tem uma conta?{" "}
              <button type="button" className="ln-link ln-link--strong" onClick={() => go("signup")}>
                Criar conta
              </button>
            </p>
          </form>
          {size === "m" && <Footer supportEmail={supportEmail} className="ln-foot--card" />}
        </div>
        {size === "t" && <Footer supportEmail={supportEmail} className="ln-foot--below" />}
      </main>
    </div>
  );
}
