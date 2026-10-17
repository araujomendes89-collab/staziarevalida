// "Confirme seu e-mail" (17/10/2026): o que a pessoa vê quando o Supabase pede a confirmação do e-mail no cadastro
// ("Confirm email" ligado no painel). Mesmo padrão do login no ar (LoginNovo.jsx): fundo azul-marinho, cartão branco com o selo
// "ACESSO SEGURO · REVALIDA", título em Barlow Condensed, botão azul. Usa as classes ln- de login-novo.css e acrescenta só o que o
// login não tem em confirmar-email.css (classes ce-).
//   ConfirmEmailScreen: logo depois de criar a conta (origin "cadastro") ou de tentar entrar sem ter confirmado (origin "login"):
//                       diz para qual e-mail foi o link, deixa reenviar (com espera entre um envio e outro) e trocar o e-mail.
//   ConfirmLinkExpired: o link de confirmação venceu ou já foi usado: quem já confirmou só entra; quem não, pede um novo.
// O login pelo Google não passa por aqui (o Google já confirma o e-mail).
import React from "react";
import { useSupportEmail } from "../support/supportContact.jsx";
import { DocumentModal } from "../legal/DocumentModal.jsx";
import { useMQ } from "../shell/useLayout.js";
import { useSession } from "../session.jsx";
import { LOGIN_TEXT } from "./useLoginForm.js";
import "./login.css"; // só pelas fontes Barlow (licença OFL), como no login
import "./login-novo.css";
import "./confirmar-email.css";

/** Espera entre um reenvio e outro (o Supabase também recusa pedidos seguidos do mesmo e-mail). */
export const RESEND_WAIT_SECONDS = 60;

export const CONFIRM_TEXT = {
  title: "Confirme seu e-mail",
  sentSignup: (email) => (
    <>
      Conta criada. Enviamos um link para <strong className="ce-email">{email}</strong>. Abra e confirme para entrar.
    </>
  ),
  pendingLogin: (email) => (
    <>
      Seu e-mail <strong className="ce-email">{email}</strong> ainda não foi confirmado. Abra o link que enviamos ou peça um novo.
    </>
  ),
  resent: (email) => (
    <>
      Enviamos um novo link para <strong className="ce-email">{email}</strong>. Abra e confirme para entrar.
    </>
  ),
  tips: [
    "Não chegou em alguns minutos? Confira o spam e a aba Promoções.",
    "O link vale por tempo limitado e só pode ser usado uma vez.",
    "Depois de confirmar, você entra direto no app.",
  ],
  expiredTitle: "Link de confirmação vencido",
  expiredMsg: "Esse link venceu ou já foi usado.",
  expiredSub: "Se você já confirmou seu e-mail, é só entrar. Se ainda não, informe o e-mail do cadastro para receber um novo link.",
  expiredSent: "Se este e-mail tem um cadastro esperando confirmação, o novo link chega em instantes. Confira também o spam.",
};

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** Texto do erro do reenvio; no "espere", usa os segundos que o Supabase informar ("only request this after 42 seconds"). */
export function resendErrorText(err) {
  if (err?.code === "rate_limited") {
    const secs = Number(/after (\d+) seconds?/i.exec(err?.message ?? "")?.[1]);
    return secs > 0
      ? `Por segurança, espere ${secs} segundos antes de pedir outro e-mail.`
      : "Por segurança, espere um minuto antes de pedir outro e-mail.";
  }
  if (err?.code === "network") return "Falha de conexão. Verifique sua internet e tente de novo.";
  if (err?.code === "invalid_email") return "Informe um e-mail válido.";
  return "Não foi possível reenviar agora. Tente de novo em instantes.";
}

const Svg = ({ size = 18, width = 2.2, children, ...rest }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {children}
  </svg>
);
const ICONS = {
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.1" />
    </>
  ),
  ok: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.8 2.8L16 9.8" />
    </>
  ),
  back: <path d="M19 12H5M11 18l-6-6 6-6" />,
};
const Icon = ({ name, ...p }) => <Svg {...p}>{ICONS[name]}</Svg>;

function Message({ tone, children }) {
  const cls = tone === "danger" ? "error" : tone === "info" ? "info" : "success";
  return (
    <p className={`ln-msg ce-msg ln-msg--${cls}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon name={tone === "danger" ? "alert" : tone === "info" ? "mail" : "ok"} />
      <span>{children}</span>
    </p>
  );
}

function Footer({ supportEmail, className, onDoc }) {
  return (
    <footer className={`ln-foot ce-foot ${className}`}>
      <span>{LOGIN_TEXT.copyright}</span>
      <button type="button" className="ce-foot-link" onClick={() => onDoc("termos")}>
        Termos de uso
      </button>
      <button type="button" className="ce-foot-link" onClick={() => onDoc("privacidade")}>
        Privacidade
      </button>
      <span>
        Precisa de ajuda?{" "}
        <a className="ln-foot-mail" href={`mailto:${supportEmail}`}>
          {supportEmail}
        </a>
      </span>
    </footer>
  );
}

/** Moldura no visual do login: computador = frase à esquerda e cartão à direita; tablet = centralizado; celular = cartão até o fim. */
function ConfirmLayout({ label, title, children }) {
  const supportEmail = useSupportEmail();
  const mobile = useMQ("(max-width: 719px)");
  const tablet = useMQ("(max-width: 1023px)");
  const size = mobile ? "m" : tablet ? "t" : "w"; // sem matchMedia (testes): computador
  const [doc, setDoc] = React.useState(null);
  const closeDoc = React.useCallback(() => setDoc(null), []);
  return (
    <div className={`ln-root ln-root--${size} ce-root`}>
      <section className="ln-side" aria-label="StaziaMed Revalida">
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
            <p className="ln-hero-h">
              {LOGIN_TEXT.tagline[0]}.<br />
              <span>{LOGIN_TEXT.tagline[1]}.</span>
              <br />
              {LOGIN_TEXT.tagline[2]}.
            </p>
            <p className="ln-hero-sub">Falta só um passo: confirmar o seu e-mail protege a sua conta e o seu progresso.</p>
          </div>
        )}
        {size === "w" && <Footer supportEmail={supportEmail} onDoc={setDoc} className="ln-foot--side" />}
      </section>
      <main className="ln-main">
        <section className="ln-card ce-card" aria-label={label}>
          <div className="ln-form ce-form">
            <span className="ln-badge">
              <Icon name="lock" size={13} width={2.6} />
              {LOGIN_TEXT.badge}
            </span>
            <div className="ce-mark" aria-hidden="true">
              <Icon name="mail" size={30} width={2} />
            </div>
            <div className="ln-head">
              <h1 className="ln-h1">{title}</h1>
            </div>
            {children}
          </div>
          {size === "m" && <Footer supportEmail={supportEmail} onDoc={setDoc} className="ln-foot--card" />}
        </section>
        {size === "t" && <Footer supportEmail={supportEmail} onDoc={setDoc} className="ln-foot--below" />}
      </main>
      {doc && <DocumentModal doc={doc} onClose={closeDoc} />}
    </div>
  );
}

/** Contagem regressiva do botão de reenviar (segundos que faltam; 0 = liberado). */
function useCountdown(initial) {
  const [left, setLeft] = React.useState(initial);
  React.useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft];
}

function ResendButton({ loading, wait, onClick, children = "REENVIAR E-MAIL", type = "button" }) {
  const blocked = loading || wait > 0;
  return (
    <button type={type} className="ln-btn ln-btn--primary" disabled={blocked} aria-busy={loading ? "true" : "false"} onClick={onClick}>
      {loading ? (
        <>
          <span className="ln-spin" aria-hidden="true" />
          <span>ENVIANDO…</span>
        </>
      ) : wait > 0 ? (
        <span>REENVIAR EM {wait} s</span>
      ) : (
        <span>{children}</span>
      )}
    </button>
  );
}

function LinkButton({ onClick, back = false, children }) {
  return (
    <button type="button" className="ln-link ce-link" onClick={onClick}>
      {back && <Icon name="back" size={16} />}
      <span>{children}</span>
    </button>
  );
}

/**
 * @param email          para onde o link foi (ou vai) — aparece na tela
 * @param origin         "cadastro" (acabou de criar a conta; o e-mail já saiu) ou "login" (tentou entrar sem confirmar)
 * @param onChangeEmail  "Usar outro e-mail" (volta ao cadastro com os dados preenchidos)
 * @param onLogin        "Já confirmei, entrar"
 */
export function ConfirmEmailScreen({ email, origin = "cadastro", onChangeEmail, onLogin }) {
  const { backend } = useSession();
  // no cadastro o e-mail acabou de sair: o botão espera antes de liberar um novo envio
  const [wait, setWait] = useCountdown(origin === "cadastro" ? RESEND_WAIT_SECONDS : 0);
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState(null);
  const canResend = typeof backend?.resendConfirmation === "function";

  const resend = async () => {
    if (loading || wait > 0 || !canResend) return;
    setLoading(true);
    setError(null);
    try {
      await backend.resendConfirmation(email);
      setSent(true);
      setWait(RESEND_WAIT_SECONDS);
    } catch (err) {
      setSent(false);
      setError(resendErrorText(err));
      const secs = Number(/after (\d+) seconds?/i.exec(err?.message ?? "")?.[1]);
      if (err?.code === "rate_limited") setWait(secs > 0 ? secs : RESEND_WAIT_SECONDS);
    }
    setLoading(false);
  };

  return (
    <ConfirmLayout label="Confirme seu e-mail" title={CONFIRM_TEXT.title}>
      <div className="ce-body" aria-live="polite">
        {sent ? (
          <Message tone="success">{CONFIRM_TEXT.resent(email)}</Message>
        ) : origin === "login" ? (
          <Message tone="info">{CONFIRM_TEXT.pendingLogin(email)}</Message>
        ) : (
          <Message tone="success">{CONFIRM_TEXT.sentSignup(email)}</Message>
        )}
        {error && <Message tone="danger">{error}</Message>}
      </div>
      <ul className="ce-tips">
        {CONFIRM_TEXT.tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <div className="ce-actions">
        {canResend && <ResendButton loading={loading} wait={wait} onClick={resend} />}
        {onChangeEmail && <LinkButton onClick={onChangeEmail}>{origin === "login" ? "Criar conta com outro e-mail" : "Usar outro e-mail"}</LinkButton>}
        <LinkButton back onClick={onLogin}>
          Já confirmei, entrar
        </LinkButton>
      </div>
    </ConfirmLayout>
  );
}

/** Link de confirmação vencido ou já usado (endereço de volta com ?confirmacao=1 e erro do Supabase). */
export function ConfirmLinkExpired({ onLogin }) {
  const { backend } = useSession();
  const [wait, setWait] = useCountdown(0);
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [emailError, setEmailError] = React.useState(null);
  const canResend = typeof backend?.resendConfirmation === "function";

  const submit = async (e) => {
    e.preventDefault();
    if (loading || wait > 0) return;
    const email = e.currentTarget.elements.namedItem("email").value.trim();
    if (!isEmail(email)) {
      setEmailError("Informe um e-mail válido.");
      document.getElementById("ce-email")?.focus();
      return;
    }
    setEmailError(null);
    setError(null);
    setLoading(true);
    try {
      await backend.resendConfirmation(email);
      setSent(true);
      setWait(RESEND_WAIT_SECONDS);
    } catch (err) {
      // resposta neutra (não revela se o e-mail tem conta), menos quando é para esperar ou não há internet
      if (err?.code === "rate_limited" || err?.code === "network") {
        setError(resendErrorText(err));
        if (err?.code === "rate_limited") setWait(RESEND_WAIT_SECONDS);
      } else {
        setSent(true);
        setWait(RESEND_WAIT_SECONDS);
      }
    }
    setLoading(false);
  };

  return (
    <ConfirmLayout label="Link de confirmação vencido" title={CONFIRM_TEXT.expiredTitle}>
      <div className="ce-body" aria-live="polite">
        {sent ? <Message tone="success">{CONFIRM_TEXT.expiredSent}</Message> : <Message tone="danger">{CONFIRM_TEXT.expiredMsg}</Message>}
        {error && <Message tone="danger">{error}</Message>}
      </div>
      <p className="ln-sub ce-sub">{CONFIRM_TEXT.expiredSub}</p>
      <button type="button" className="ln-btn ln-btn--primary" onClick={onLogin}>
        <span>ENTRAR</span>
      </button>
      {canResend && (
        <form className="ce-resend-form" onSubmit={submit} noValidate>
          <div className="ln-field">
            <label className="ln-label" htmlFor="ce-email">
              E-mail do cadastro
            </label>
            <span className="ln-control">
              <Icon name="mail" className="ln-ico" />
              <input
                id="ce-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="voce@exemplo.com"
                className={`ln-input${emailError ? " is-error" : ""}`}
                aria-invalid={emailError ? "true" : "false"}
                aria-describedby={emailError ? "ce-email-error" : undefined}
              />
            </span>
            {emailError && (
              <span id="ce-email-error" className="ce-field-error">
                <Icon name="alert" size={16} />
                {emailError}
              </span>
            )}
          </div>
          <button type="submit" className="ln-btn ce-btn-ghost" disabled={loading || wait > 0} aria-busy={loading ? "true" : "false"}>
            {loading ? "ENVIANDO…" : wait > 0 ? `REENVIAR EM ${wait} s` : "ENVIAR NOVO LINK"}
          </button>
        </form>
      )}
    </ConfirmLayout>
  );
}
