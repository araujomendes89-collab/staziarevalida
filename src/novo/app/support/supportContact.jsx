// Contato de suporte do app (B12/B4 da Fase 1). O e-mail vem de UMA configuração só, que o administrador edita em
// Administração > Configurações (função app_support_contact, que até o visitante do login pode ler). Se o banco ainda não tem essa
// função, ou a pergunta falha, vale o padrão abaixo: o aviso nunca fica sem contato.
import React from "react";
import { useSession } from "../session.jsx";

export const DEFAULT_SUPPORT_EMAIL = "suporte@staziamed.com.br";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** O e-mail de suporte para mostrar agora (o padrão até o banco responder). */
export function useSupportEmail() {
  const { backend } = useSession() ?? {};
  const [email, setEmail] = React.useState(DEFAULT_SUPPORT_EMAIL);
  React.useEffect(() => {
    if (typeof backend?.rpc !== "function") return undefined;
    let alive = true;
    Promise.resolve()
      .then(() => backend.rpc("app_support_contact"))
      .then((r) => alive && typeof r?.email === "string" && EMAIL.test(r.email) && setEmail(r.email))
      .catch(() => {}); // banco sem a função: fica o padrão
    return () => {
      alive = false;
    };
  }, [backend]);
  return email;
}

/** O e-mail como link para escrever. */
export function SupportMail({ email, style }) {
  return (
    <a href={`mailto:${email}`} style={style}>
      {email}
    </a>
  );
}

/** Frase padrão dos avisos de acesso bloqueado (texto puro, sem preço nem pagamento automático). */
export const askForAccess = (email) => `Para pedir acesso ou tirar dúvidas, fale com o suporte: ${email}.`;
