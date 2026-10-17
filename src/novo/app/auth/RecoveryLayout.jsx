// Moldura das telas de recuperar senha (Recuperar senha, Criar nova senha e Link vencido), no MESMO padrão do login que está no ar
// (LoginNovo.jsx, pacote "Novas telas" de 15/10/2026): fundo azul-marinho, logo nova (public/brand), frase da marca, cartão branco
// com o selo "ACESSO SEGURO · REVALIDA", título em Barlow Condensed, campos e botão azul iguais aos do login. Usa as classes ln- de
// login-novo.css (claro e escuro já resolvidos lá) e só acrescenta o que o login não tem (dica/erro no campo, link de voltar,
// bloco "Lembrou da senha?") em recuperar-senha.css com classes rc-. Computador: frase à esquerda e cartão à direita; tablet: tudo
// centralizado; celular: logo no alto e o cartão ocupa o resto da tela. Só muda a aparência: a recuperação funciona como antes.
import React from "react";
import { useSupportEmail } from "../support/supportContact.jsx";
import { DocumentModal } from "../legal/DocumentModal.jsx";
import { useMQ } from "../shell/useLayout.js";
import { LOGIN_TEXT } from "./useLoginForm.js";
import "./login.css"; // só pelas fontes Barlow (licença OFL), como no login
import "./login-novo.css";
import "./recuperar-senha.css";

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

/** Aviso dentro do cartão, igual aos do login: erro (alert) ou sucesso (status), com ícone. */
export function RecoveryMessage({ tone = "danger", children }) {
  const error = tone === "danger";
  return (
    <p className={`ln-msg rc-msg ln-msg--${error ? "error" : "success"}`} role={error ? "alert" : "status"}>
      <Icon name={error ? "alert" : "ok"} />
      <span>{children}</span>
    </p>
  );
}

/** Campo no visual do login: rótulo, ícone à esquerda, olho para mostrar a senha, dica ou erro embaixo. */
export function RecoveryField({ id, name, label, type = "text", autoComplete, hint, error, icon = "mail", disabled, placeholder }) {
  const [show, setShow] = React.useState(false);
  const pw = type === "password";
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="ln-field">
      <label className="ln-label" htmlFor={id}>
        {label}
      </label>
      <span className="ln-control">
        <Icon name={icon} className="ln-ico" />
        <input
          id={id}
          name={name}
          type={pw && show ? "text" : type}
          autoComplete={autoComplete}
          inputMode={type === "email" ? "email" : undefined}
          placeholder={placeholder}
          className={`ln-input${pw ? " ln-input--pw" : ""}${error ? " is-error" : ""}`}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={describedBy}
          disabled={disabled}
        />
        {pw && (
          <button type="button" className="ln-eye" aria-label={show ? "Ocultar senha" : "Mostrar senha"} aria-pressed={show ? "true" : "false"} aria-controls={id} onClick={() => setShow((v) => !v)}>
            <Svg size={18}>
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
              {show && <path d="M3 3l18 18" />}
            </Svg>
          </button>
        )}
      </span>
      {error ? (
        <span id={`${id}-error`} className="rc-field-error">
          <Icon name="alert" size={16} />
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="rc-field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Botão azul do login (ENTRAR), com o mesmo giro de carregando. */
export function RecoveryButton({ type = "button", loading = false, loadingText, onClick, children }) {
  return (
    <button type={type} className="ln-btn ln-btn--primary" disabled={loading} aria-busy={loading ? "true" : "false"} onClick={onClick}>
      {loading ? (
        <>
          <span className="ln-spin" aria-hidden="true" />
          <span>{loadingText}</span>
        </>
      ) : (
        <span>{children}</span>
      )}
    </button>
  );
}

/** Caminho secundário (Voltar para o login, Agora não, sair), no azul dos links do login. */
export function RecoveryLink({ onClick, back = false, children }) {
  return (
    <button type="button" className="ln-link rc-back" onClick={onClick}>
      {back && <Icon name="back" size={16} />}
      <span>{children}</span>
    </button>
  );
}

function Footer({ supportEmail, className, onDoc }) {
  return (
    <footer className={`ln-foot rc-foot ${className}`}>
      <span>{LOGIN_TEXT.copyright}</span>
      {/* abre o documento por cima (não sai da página: na tela Criar nova senha a sessão de recuperação continua) */}
      <button type="button" className="rc-foot-link" onClick={() => onDoc("termos")}>
        Termos de uso
      </button>
      <button type="button" className="rc-foot-link" onClick={() => onDoc("privacidade")}>
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

/**
 * @param label      nome da região do cartão (leitor de tela)
 * @param title      título do cartão (h1)
 * @param sub        frase de apoio embaixo do título (some quando já não serve)
 * @param aside      bloco do lado azul, só no computador: { title, copy, button?, onButton? } (os textos do painel de antes)
 */
export function RecoveryLayout({ children, label, title, sub, aside }) {
  const supportEmail = useSupportEmail();
  const mobile = useMQ("(max-width: 719px)");
  const tablet = useMQ("(max-width: 1023px)");
  const size = mobile ? "m" : tablet ? "t" : "w"; // sem matchMedia (testes): computador
  const [doc, setDoc] = React.useState(null);
  const closeDoc = React.useCallback(() => setDoc(null), []);

  return (
    <div className={`ln-root ln-root--${size} rc-root`}>
      <section className="ln-side" aria-label="StaziaMed Revalida">
        <img
          className="ln-logo"
          src="/brand/horizontal-escuro-480w.png"
          srcSet="/brand/horizontal-escuro-480w.png 1x, /brand/horizontal-escuro-960w.png 2x"
          alt="StaziaMed Revalida"
          width="155"
          height="48"
        />
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
            {aside && (
              <div className="rc-aside">
                <p className="rc-aside-t">{aside.title}</p>
                <p className="ln-hero-sub">{aside.copy}</p>
                {aside.button && (
                  <button type="button" className="rc-aside-btn" onClick={aside.onButton}>
                    {aside.button}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {size === "w" && <Footer supportEmail={supportEmail} onDoc={setDoc} className="ln-foot--side" />}
      </section>

      <main className="ln-main">
        <section className="ln-card rc-card" aria-label={label}>
          <div className="ln-form rc-form">
            <span className="ln-badge">
              <Icon name="lock" size={13} width={2.6} />
              {LOGIN_TEXT.badge}
            </span>
            <div className="ln-head">
              <h1 className="ln-h1">{title}</h1>
              {sub ? <p className="ln-sub">{sub}</p> : null}
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
