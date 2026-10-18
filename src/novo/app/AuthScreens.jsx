// Login, cadastro e recuperação de senha. O login fica em auth/LoginScreen.jsx; cadastro, recuperação e conta master continuam
// aqui. O cadastro (Criar conta) e a recuperação (Recuperar senha, Criar nova senha, Link vencido) usam a moldura de
// auth/RecoveryLayout.jsx, no mesmo padrão do login no ar (17/10/2026). Só a conta master (1º acesso no banco local) segue na
// moldura antiga do design system (AuthLayout, derivado de "ui_kits/auth-billing/AuthScreens.jsx").
import React from "react";
import { Button, TextField, Banner } from "../ds";
import { PASSWORD_MIN_LENGTH } from "../data";
import { useMobile } from "./Shell.jsx";
import { useSession, rememberChoice } from "./session.jsx";
import { LoginScreen } from "./auth/LoginScreen.jsx";
import { ConfirmEmailScreen, ConfirmLinkExpired } from "./auth/ConfirmEmail.jsx";
import { DocumentModal } from "./legal/DocumentModal.jsx";
import { TERMO_VERSAO } from "./legal/versions.js";
import { rememberGoogleAcceptance } from "./legal/googleAcceptance.js";
import { ACEITE_ERRO_CADASTRO_V3, ACEITE_TEXTO, ACEITE_TEXTO_V3, aceiteNovo } from "./legal/documentos.js";
import { VIGENTES_DO_SITE, useVigentes } from "./legal/vigente.js";
import { AceiteFrase } from "./legal/AceiteFrase.jsx";
import { clearAuthLinkFromUrl, initialAuthLink } from "./auth/authLink.js";
import { FieldError, RecoveryButton, RecoveryField, RecoveryLayout, RecoveryLink, RecoveryMessage } from "./auth/RecoveryLayout.jsx";
import "./auth/criar-conta.css";

const ERROR_TEXT = {
  invalid_credentials: "Não foi possível entrar com esses dados. Verifique seu e-mail e senha.",
  email_taken: "Já existe uma conta com este e-mail.",
  weak_password: `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  same_password: "Escolha uma senha diferente da anterior.",
  link_expired: "Esse link venceu. Peça um novo.",
  invalid_email: "Informe um e-mail válido.",
  email_not_confirmed: "Falta confirmar seu e-mail. Abra o link que enviamos quando você criou a conta.",
  rate_limited: "Muitos e-mails enviados agora. Espere um minuto e tente de novo.",
  google_unavailable: "O login com Google não está disponível neste ambiente.",
  network: "Falha de conexão. Verifique sua internet e tente de novo.",
  unknown: "Não foi possível concluir. Tente novamente.",
};
const messageFor = (error) => ERROR_TEXT[error?.code] ?? ERROR_TEXT.unknown;
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

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
          <img src="/brand/vertical-escuro-240w.png" alt="StaziaMed Revalida" width="140" height="122" style={{ height: mobile ? 96 : 140, width: "auto" }} />
          {aside}
        </div>
      </div>
    </div>
  );
}

const ACCEPT_ERROR = "Para criar a conta, é preciso aceitar os Termos de Uso e a Política de Privacidade e declarar ter 18 anos ou mais.";
// ids dos campos, na ordem da tela, para levar o foco ao primeiro com erro
const FIELD_IDS = { name: "secure-name", email: "secure-email", pw: "secure-pw", pw2: "secure-pw2", accept: "secure-accept" };
const PW_CURTA = `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`;
const PW_DIFERENTE = "As senhas não são iguais.";

/**
 * Avisos das senhas enquanto a pessoa preenche (pedido do dono, 17/10/2026), sem atrapalhar quem ainda está digitando:
 *   - "Mínimo de 8 caracteres." aparece ao SAIR do campo Senha (se estiver curta) e some assim que a senha chega ao tamanho;
 *   - "As senhas não são iguais." aparece ao sair do Conferir senha ou, digitando, quando o tamanho já bate com o da Senha; depois
 *     de sair do campo uma vez, aparece também quando o que está digitado já não confere com o começo da Senha. Enquanto a pessoa
 *     digita certo (o começo confere), não aparece; some assim que as duas ficam iguais.
 * Campo vazio não ganha aviso aqui (o envio continua conferindo tudo, como antes).
 * @param {{ pw?: string, pw2?: string }} prev avisos atuais de pw e pw2
 * @param {{ pw: string, pw2: string, evento: "pw-blur"|"pw-change"|"pw2-blur"|"pw2-change", visto2: boolean }} a
 */
export function avisosDasSenhas(prev, { pw, pw2, evento, visto2 }) {
  let pwErr = prev.pw;
  if (evento === "pw-blur" && pw && pw.length < PASSWORD_MIN_LENGTH) pwErr = PW_CURTA;
  if (pwErr === PW_CURTA && pw.length >= PASSWORD_MIN_LENGTH) pwErr = undefined;
  let pw2Err;
  if (!pw2 || pw2 === pw) pw2Err = undefined;
  else if (evento === "pw2-blur" || pw2.length >= pw.length || (visto2 && !pw.startsWith(pw2))) pw2Err = PW_DIFERENTE;
  return { pw: pwErr, pw2: pw2Err };
}

// DECLARAÇÕES (feito em 17/10/2026, decisão do dono): as caixas separadas "Declaro que tenho 18 anos ou mais." e "Declaro que sou
// médico(a)…" saíram. A maioridade vai na PRÓPRIA caixa do aceite (ACEITE_TEXTO) e segue nos metadados do cadastro como
// declares_adult = "true"; a de médico não é mais pedida. O banco aceita assim desde a migração …13661_aceite_com_maioridade (o
// Tutor N3/N4 passa a olhar só a maioridade). Por isso esta publicação precisa da 13661 aplicada ANTES do site.

/**
 * Criar conta (17/10/2026): no MESMO padrão do login e das telas de recuperar senha e "Confirme seu e-mail" (moldura de
 * auth/RecoveryLayout.jsx: azul-marinho, logo nova, frase da marca, cartão branco com o selo ACESSO SEGURO · REVALIDA, mesmo rodapé,
 * claro/escuro, celular e computador). Só muda a aparência: mesmos campos, validações e envio (signUp com os metadados), o Google
 * continua e, com a confirmação ligada, segue para "Confirme seu e-mail".
 * Sem WhatsApp desde 17/10/2026 (decisão do dono): o banco deixou de exigir o telefone (migração …13660_cadastro_sem_whatsapp).
 */
function Signup({ go }) {
  const { backend } = useSession();
  // versão vigente do Contrato/Termo (do banco desde a migração …13740; num banco sem ela, a do próprio site): caixa e versão enviada
  const vig = useVigentes();
  const novo = aceiteNovo(vig.vigentes);
  const acceptError = novo ? ACEITE_ERRO_CADASTRO_V3 : ACCEPT_ERROR;
  const [errors, setErrors] = React.useState({});
  const [error, setError] = React.useState(null);
  // Supabase com "Confirm email" ligado: a conta nasce sem sessão e a tela "Confirme seu e-mail" toma o lugar do formulário
  const [confirmEmail, setConfirmEmail] = React.useState(null);
  // o que a pessoa já escreveu, para "Usar outro e-mail" voltar ao formulário preenchido (as senhas não ficam guardadas)
  const [saved, setSaved] = React.useState({ name: "", email: "" });
  const [loading, setLoading] = React.useState(false);
  const [accepted, setAccepted] = React.useState(false);
  const [doc, setDoc] = React.useState(null);
  // o Conferir senha já foi deixado uma vez: daí em diante o aviso acompanha a digitação
  const visto2 = React.useRef(false);
  const senhas = (evento) => {
    if (evento === "pw2-blur") visto2.current = true;
    const pw = document.getElementById(FIELD_IDS.pw)?.value ?? "";
    const pw2 = document.getElementById(FIELD_IDS.pw2)?.value ?? "";
    setErrors((prev) => {
      const a = avisosDasSenhas(prev, { pw, pw2, evento, visto2: visto2.current });
      if (a.pw === prev.pw && a.pw2 === prev.pw2) return prev;
      const next = { ...prev, pw: a.pw, pw2: a.pw2 };
      if (!next.pw) delete next.pw;
      if (!next.pw2) delete next.pw2;
      return next;
    });
  };
  const closeDoc = React.useCallback(() => setDoc(null), []);
  const messageRef = React.useRef(null);

  const focusFirst = (next) => {
    const first = ["name", "email", "pw", "pw2", "accept"].find((k) => next[k]);
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
    if (password.length < PASSWORD_MIN_LENGTH) next.pw = PW_CURTA;
    else if (password !== field("pw2")) next.pw2 = PW_DIFERENTE;
    if (!accepted) next.accept = acceptError;
    setErrors(next);
    setError(null);
    if (Object.keys(next).length) {
      focusFirst(next);
      return;
    }

    setLoading(true);
    try {
      rememberChoice(true);
      // a versão que vai é sempre a da caixa que a pessoa viu: a vigente lida do banco ou, se ainda não chegou (ou falhou), a do
      // próprio site com a caixa de antes. O banco só grava o aceite da versão vigente; outra versão cai na tela de aceite depois.
      const vigentes = vig.vigentes ?? VIGENTES_DO_SITE;
      const termsVersion = vigentes.termo_uso?.version ?? TERMO_VERSAO;
      const result = await backend.signUp(name, email, password, {
        termsVersion,
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
        // a caixa do aceite já traz a declaração de maioridade
        declaresAdult: true,
      });
      setSaved({ name, email });
      // Contrato 3.0: o aceite guarda o IP; o cadastro passa pelo serviço de login, que não entrega o IP ao banco, então este mesmo
      // navegador avisa logo depois, com o número da conta recém-criada (app_legal_cadastro_ip; sem a 013740 a chamada só falha)
      if (result?.userId && aceiteNovo(vigentes)) backend.rpc("app_legal_cadastro_ip", { p_user: result.userId }).catch(() => {});
      if (result?.needsEmailConfirmation) {
        setLoading(false);
        setConfirmEmail(email);
        window.scrollTo(0, 0);
        return;
      }
    } catch (err) {
      setSaved({ name, email });
      if (err?.code === "email_taken") {
        // e-mail que já tem conta: o aviso fica no próprio campo, com o foco nele
        setErrors({ email: messageFor(err) });
        setTimeout(() => document.getElementById(FIELD_IDS.email)?.focus(), 0);
      } else {
        setError(messageFor(err));
        setTimeout(() => messageRef.current?.scrollIntoView?.({ block: "center" }), 0);
      }
    }
    setLoading(false);
  };
  // volta ao formulário com nome, e-mail e o aceite marcado; o foco vai para o e-mail
  const changeEmail = () => {
    setConfirmEmail(null);
    setTimeout(() => {
      const field = document.getElementById(FIELD_IDS.email);
      field?.focus();
      field?.select?.();
    }, 0);
  };
  const google = async () => {
    setError(null);
    if (!accepted) {
      const next = { accept: acceptError };
      setErrors(next);
      focusFirst(next);
      return;
    }
    setErrors({});
    try {
      // guarda o aceite (com a maioridade, que está na mesma caixa) para gravar na volta do Google
      rememberGoogleAcceptance((vig.vigentes ?? VIGENTES_DO_SITE).termo_uso?.version ?? TERMO_VERSAO, { adult: true });
      await backend.signInWithGoogle();
    } catch (err) {
      setError(messageFor(err));
    }
  };

  if (confirmEmail) {
    return <ConfirmEmailScreen email={confirmEmail} origin="cadastro" onChangeEmail={changeEmail} onLogin={() => go("login")} />;
  }

  return (
    <RecoveryLayout
      label="Criar conta"
      title="Criar conta"
      sub="Crie sua conta e comece sua jornada."
      aside={{ title: "Já tem conta?", copy: "Entre para continuar sua preparação para o Revalida.", button: "Entrar", onButton: () => go("login") }}
    >
      <form onSubmit={submit} className="rc-fields cc-fields" noValidate>
        {error && (
          <div ref={messageRef}>
            <RecoveryMessage tone="danger">{error}</RecoveryMessage>
          </div>
        )}
        <RecoveryField id={FIELD_IDS.name} name="name" label="Nome completo" autoComplete="name" icon="user" placeholder="Seu nome completo" error={errors.name} defaultValue={saved.name} />
        <RecoveryField id={FIELD_IDS.email} name="email" label="E-mail" type="email" autoComplete="email" icon="mail" placeholder="voce@exemplo.com" error={errors.email} defaultValue={saved.email} />
        <RecoveryField
          id={FIELD_IDS.pw} name="pw" label="Senha" type="password" icon="lock" hint={PW_CURTA} autoComplete="new-password" error={errors.pw}
          onBlur={() => senhas("pw-blur")} onChange={() => senhas("pw-change")}
        />
        <RecoveryField
          id={FIELD_IDS.pw2} name="pw2" label="Conferir senha" type="password" icon="lock" autoComplete="new-password" error={errors.pw2}
          onBlur={() => senhas("pw2-blur")} onChange={() => senhas("pw2-change")}
        />

        <div className={`cc-consent${errors.accept ? " is-error" : ""}`}>
          <div className="cc-item">
            <label className="cc-check">
              <input
                id={FIELD_IDS.accept}
                aria-label={novo ? ACEITE_TEXTO_V3 : ACEITE_TEXTO}
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                aria-invalid={errors.accept ? "true" : "false"}
                aria-describedby={errors.accept ? "secure-accept-error" : undefined}
              />
              <AceiteFrase onDoc={setDoc} linkClassName="cc-inline-link" novo={novo} />
            </label>
            {errors.accept ? <FieldError id="secure-accept-error">{errors.accept}</FieldError> : null}
          </div>
        </div>


        <RecoveryButton type="submit" loading={loading} loadingText="CRIANDO CONTA…">CRIAR CONTA</RecoveryButton>
        <div className="ln-or" aria-hidden="true">
          <span />
          ou cadastre-se com
          <span />
        </div>
        <button type="button" className="ln-btn ln-btn--google" onClick={google} disabled={loading}>
          <img src="/novo-assets/google.svg" alt="" width="20" height="20" />
          <span>Criar conta com Google</span>
        </button>
        {/* mesmo caminho de volta das telas de recuperar senha (no computador, o lado azul também tem "Já tem conta? Entrar") */}
        <div className="rc-actions">
          <RecoveryLink back onClick={() => go("login")}>Voltar para o login</RecoveryLink>
        </div>
      </form>
      {doc && <DocumentModal doc={doc} onClose={closeDoc} />}
    </RecoveryLayout>
  );
}

function Forgot({ go }) {
  const { backend } = useSession();
  const [sent, setSent] = React.useState(false);
  const [emailError, setEmailError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

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
    <RecoveryLayout
      label="Recuperar senha"
      title="Recuperar senha"
      sub="Informe seu e-mail para receber as instruções de recuperação."
      aside={{ title: "Lembrou da senha?", copy: "Volte para o login e continue sua preparação para o Revalida.", button: "Entrar", onButton: () => go("login") }}
    >
      <form onSubmit={submit} className="rc-fields" noValidate>
        {sent && (
          <RecoveryMessage tone="success">
            Se houver uma conta com este e-mail, as instruções chegam em instantes. Confira também o spam.
          </RecoveryMessage>
        )}
        <RecoveryField id="secure-email" name="email" label="E-mail cadastrado" type="email" autoComplete="email" icon="mail" placeholder="voce@exemplo.com" error={emailError} />
        <div className="rc-actions">
          <RecoveryButton type="submit" loading={loading} loadingText="ENVIANDO…">ENVIAR INSTRUÇÕES</RecoveryButton>
          <RecoveryLink back onClick={() => go("login")}>Voltar para o login</RecoveryLink>
        </div>
      </form>
    </RecoveryLayout>
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
    <RecoveryLayout
      label="Criar nova senha"
      title="Criar nova senha"
      sub={done || expired ? null : "Escreva a nova senha duas vezes para confirmar."}
      aside={done || expired ? null : { title: "Defina sua nova senha", copy: "Escolha uma senha que só você conheça. Depois é só continuar sua preparação para o Revalida." }}
    >
      <form onSubmit={submit} className="rc-fields" noValidate>
        {error && <RecoveryMessage tone="danger">{error}</RecoveryMessage>}
        {expired && <RecoveryMessage tone="danger">Esse link venceu. Peça um novo.</RecoveryMessage>}
        {done && <RecoveryMessage tone="success">Senha alterada com sucesso. Você já está dentro da sua conta.</RecoveryMessage>}
        {done ? (
          <RecoveryButton onClick={() => finishRecovery()}>ENTRAR NO APP</RecoveryButton>
        ) : expired ? (
          <RecoveryButton onClick={askAgain}>PEDIR NOVO LINK</RecoveryButton>
        ) : (
          <>
            <RecoveryField id="secure-pw" name="pw" label="Nova senha" type="password" icon="lock" hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`} autoComplete="new-password" error={errors.pw} />
            <RecoveryField id="secure-pw2" name="pw2" label="Conferir nova senha" type="password" icon="lock" autoComplete="new-password" error={errors.pw2} />
            <div className="rc-actions">
              <RecoveryButton type="submit" loading={loading} loadingText="SALVANDO…">SALVAR NOVA SENHA</RecoveryButton>
              <RecoveryLink onClick={async () => { try { await signOut(); } catch { /* já estava fora */ } finishRecovery(); }}>Agora não, sair</RecoveryLink>
            </div>
          </>
        )}
      </form>
    </RecoveryLayout>
  );
}

/** Link do e-mail vencido ou já usado: aviso claro e botão para pedir outro. */
function ExpiredLink({ go }) {
  const askAgain = () => {
    clearAuthLinkFromUrl();
    go("forgot");
  };
  const backToLogin = () => {
    clearAuthLinkFromUrl();
    go("login");
  };
  return (
    <RecoveryLayout
      label="Link vencido"
      title="Link vencido"
      sub="Por segurança, cada link vale por pouco tempo e só pode ser usado uma vez."
      aside={{ title: "Lembrou da senha?", copy: "Volte para o login e continue sua preparação para o Revalida.", button: "Entrar", onButton: backToLogin }}
    >
      <div className="rc-fields">
        <RecoveryMessage tone="danger">Esse link venceu. Peça um novo.</RecoveryMessage>
        <div className="rc-actions">
          <RecoveryButton onClick={askAgain}>PEDIR NOVO LINK</RecoveryButton>
          <RecoveryLink back onClick={backToLogin}>Voltar para o login</RecoveryLink>
        </div>
      </div>
    </RecoveryLayout>
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

/** /novo/criar-conta abre direto o Criar conta (botões "Teste grátis" da página inicial); o resto (/novo, /novo/login, /novo/entrar…) abre o login. */
export function telaInicialPeloEndereco(pathname = typeof window !== "undefined" ? window.location.pathname : "") {
  return /^\/novo\/criar-conta\/?$/.test(pathname || "") ? "signup" : "login";
}

/** Fluxo de entrada: login → cadastro → recuperar senha (e, no 1º acesso local, conta master). */
export function AuthFlow({ link = initialAuthLink, inicial = telaInicialPeloEndereco() } = {}) {
  // link do e-mail vencido ou já usado: abre direto o aviso "Esse link venceu. Peça um novo."
  // (o de confirmar o cadastro tem a própria tela: quem já confirmou só entra, quem não confirmou pede outro link)
  const [screen, setScreen] = React.useState(link?.kind === "expired" ? (link.signup ? "expired-confirm" : "expired") : inicial);
  // dados da próxima tela (ex.: o e-mail que ainda não foi confirmado, vindo do login)
  const [data, setData] = React.useState(null);
  const go = (next, nextData = null) => {
    setScreen(next);
    setData(nextData);
    window.scrollTo(0, 0);
  };
  if (screen === "signup") return <Signup go={go} />;
  if (screen === "confirm" && data?.email) {
    return <ConfirmEmailScreen email={data.email} origin={data.origin ?? "login"} onChangeEmail={() => go("signup")} onLogin={() => go("login")} />;
  }
  if (screen === "expired-confirm") {
    return <ConfirmLinkExpired onLogin={() => { clearAuthLinkFromUrl(); go("login"); }} />;
  }
  if (screen === "forgot") return <Forgot go={go} />;
  if (screen === "expired") return <ExpiredLink go={go} />;
  if (screen === "master") return <MasterSetup go={go} />;
  // tela de login "Acesso seguro REVALIDA" (auth/LoginScreen.jsx), com a mesma autenticação de antes
  return <LoginScreen go={go} />;
}
