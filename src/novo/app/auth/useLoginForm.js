// Lógica única da tela de login (Novas telas, 15/10/2026): as duas aparências (a nova do pacote e a "Acesso seguro" que estava
// no ar) usam exatamente esta mesma lógica. backend.signIn (e-mail e senha), backend.signInWithGoogle, "Lembrar de mim"
// (rememberChoice), aviso de conta master e as etapas Identidade/Segurança/Acesso. A senha só vai para o backend no envio.
import React from "react";
import { rememberChoice, useSession } from "../session.jsx";

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
  badge: "Acesso seguro · Revalida",
};

/** Etapas do acesso (as mesmas nas duas aparências). */
export const LOGIN_STEPS = [
  ["Identidade", "Informe seu e-mail"],
  ["Segurança", "Proteja seu acesso"],
  ["Acesso", "Entre para continuar"],
];

/** Erros que não são de e-mail/senha: mantém a explicação de antes (rede, Google indisponível…). */
export const OTHER_ERRORS = {
  invalid_email: "Informe um e-mail válido.",
  // senha certa, mas o cadastro ainda espera a confirmação do e-mail (Supabase: "Email not confirmed")
  email_not_confirmed: "Falta confirmar seu e-mail. Abra o link que enviamos quando você criou a conta ou peça um novo.",
  rate_limited: "Muitas tentativas seguidas. Espere um minuto e tente de novo.",
  google_unavailable: "O login com Google não está disponível neste ambiente.",
  network: "Falha de conexão. Verifique sua internet e tente de novo.",
  unknown: "Não foi possível concluir. Tente novamente.",
};
const errorText = (error) => (!error?.code || error.code === "invalid_credentials" ? LOGIN_TEXT.error : (OTHER_ERRORS[error.code] ?? OTHER_ERRORS.unknown));

/** Etapas [Identidade, Segurança, Acesso] por estado: "" | "is-active" | "is-done". */
export function stepsFor(status, focus, emailOk) {
  if (status === "success") return ["is-done", "is-done", "is-done"];
  if (status === "loading") return ["is-done", "is-active", ""];
  if (status === "error") return ["", "is-active", ""];
  if (focus === "email") return ["is-active", "", ""];
  if (focus === "password") return [emailOk ? "is-done" : "", "is-active", ""];
  return [emailOk ? "is-done" : "", "", ""];
}

export function useLoginForm() {
  const { backend } = useSession();
  // idle | loading | error | success
  const [status, setStatus] = React.useState("idle");
  const [message, setMessage] = React.useState("");
  const [emailInvalid, setEmailInvalid] = React.useState(false);
  const [focus, setFocus] = React.useState(null);
  const [emailOk, setEmailOk] = React.useState(false);
  const [showPw, setShowPw] = React.useState(false);
  const [needsMaster, setNeedsMaster] = React.useState(false);
  // e-mail que entrou com a senha certa mas ainda não confirmou o cadastro (a tela oferece reenviar o link)
  const [unconfirmedEmail, setUnconfirmedEmail] = React.useState(null);
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
    setUnconfirmedEmail(null);
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
      if (!alive.current) return;
      fail(errorText(err));
      if (err?.code === "email_not_confirmed") setUnconfirmedEmail(email);
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

  return {
    status,
    message,
    emailInvalid,
    focus,
    setFocus,
    emailOk,
    onEmailInput: (e) => setEmailOk(isEmail(e.currentTarget.value.trim())),
    showPw,
    togglePw: () => setShowPw((v) => !v),
    needsMaster,
    unconfirmedEmail,
    emailRef,
    submit,
    google,
    loading: status === "loading",
    success: status === "success",
    error: status === "error",
    steps: stepsFor(status, focus, emailOk),
  };
}
