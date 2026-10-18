// Contato de suporte do app (B12/B4 da Fase 1). O e-mail vem de UMA configuração só, que o administrador edita em
// Administração > Configurações (função app_support_contact, que até o visitante do login pode ler). Se o banco ainda não tem essa
// função, ou a pergunta falha, vale o padrão abaixo: o aviso nunca fica sem contato.
import React from "react";
import { useSession } from "../session.jsx";

export const DEFAULT_SUPPORT_EMAIL = "suporte@staziamed.com.br";
// Contrato 3.0, cláusulas 1.3 e 1.4 (textos em src/novo/app/legal/textos/contrato-v3.0.md): telefone/WhatsApp do SAC, horário e o
// e-mail do encarregado pelos dados pessoais. Mudou no contrato, muda aqui (o teste confere que o contrato traz os mesmos).
export const SUPPORT_PHONE = "(41) 99903-1074";
export const SUPPORT_PHONE_E164 = "+5541999031074";
export const SUPPORT_HOURS = "De segunda a sexta, das 9h às 18h";
export const PRIVACY_EMAIL = "privacidade@staziamed.com.br";
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

/** O telefone do SAC como link para ligar, e o mesmo número no WhatsApp. */
export function SupportPhone({ style }) {
  return (
    <span style={{ display: "inline-flex", gap: 12, flexWrap: "wrap", alignItems: "baseline", ...style }}>
      <a href={`tel:${SUPPORT_PHONE_E164}`}>{SUPPORT_PHONE}</a>
      <a href={`https://wa.me/${SUPPORT_PHONE_E164.slice(1)}`} target="_blank" rel="noopener noreferrer" style={{ font: "var(--type-body-sm)" }}>
        Abrir no WhatsApp
      </a>
    </span>
  );
}
