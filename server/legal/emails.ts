/**
 * E-mails de serviço do Contrato 3.0 (ramo termo-funcoes), no mesmo visual dos modelos do Supabase com a logo nova
 * (~/Downloads/emails-staziamed-logo-nova: fundo #F4F6F9, cartão branco de 560 px com borda #ECEFF3, texto #0D1C42 / #4F5A69,
 * botão #0B6F68, "Equipe StaziaMed — Tecnologia que transforma.").
 *   - aviso de conta inativa (Política 3.0, seção 5; Regulamento 1.0, 4.3).
 * O contrato NÃO vai por e-mail (decisão do dono, 18/10/2026: "Contrato não é enviado ao cliente, fica dentro do app dele."):
 * o contrato aceito fica só em Minha Conta → Documentos.
 * Só texto vindo do banco; tudo que entra no HTML passa por esc().
 */

export interface ItemFila {
  id: number;
  kind: "aviso_inatividade";
  tentativas: number;
  email: string | null;
  nome: string | null;
  payload: { acao?: "apagar_conta" | "zerar_coins"; ultimo_acesso?: string; prazo?: string };
}

export interface EmailPronto {
  subject: string;
  text: string;
  html: string;
}

export const LOGO = "https://app.staziamed.com.br/brand/horizontal-480w.png";
const SITE = "https://www.staziamed.com.br";
const SUPORTE = "suporte@staziamed.com.br";
const PRIVACIDADE = "privacidade@staziamed.com.br";
const BASE_PADRAO = "https://app.staziamed.com.br";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const base = (url: string | null) => (url || BASE_PADRAO).replace(/\/+$/, "");
const primeiroNome = (nome: string | null) => (nome ?? "").trim().split(/\s+/)[0] ?? "";

/** "2026-11-30" (data do banco) → "30/11/2026"; um instante → a data em Brasília. */
export function dataBR(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(v));
}

/** Moldura dos modelos (logo, corpo, assinatura). `blocos` já vem em HTML seguro. */
function moldura(titulo: string, blocos: string[]): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background-color:#F4F6F9;">
<div style="margin:0;padding:24px 12px;background-color:#F4F6F9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;background-color:#FFFFFF;border:1px solid #ECEFF3;border-radius:16px;">
    <tr>
      <td style="padding:32px 32px 8px 32px;">
        <img src="${LOGO}" alt="StaziaMed Revalida" width="200" style="display:block;width:200px;max-width:100%;height:auto;border:0;">
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px 32px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#0D1C42;">
${blocos.join("\n")}
        <p style="margin:0 0 16px 0;">Equipe StaziaMed<br>Tecnologia que transforma.</p>
        <p style="margin:0;"><a href="${SITE}" style="color:#0B6F68;">www.staziamed.com.br</a></p>
      </td>
    </tr>
  </table>
</div>
</body></html>`;
}
const p = (html: string, ultimo = false, cinza = false) =>
  `        <p style="margin:0 0 ${ultimo ? 24 : 16}px 0;${cinza ? "color:#4F5A69;" : ""}">${html}</p>`;
const botao = (href: string, rotulo: string) => `        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
          <tr>
            <td style="background-color:#0B6F68;border-radius:12px;">
              <a href="${esc(href)}" style="display:inline-block;padding:14px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:20px;color:#FFFFFF;text-decoration:none;">${esc(rotulo)}</a>
            </td>
          </tr>
        </table>`;
const mail = (e: string) => `<a href="mailto:${e}" style="color:#0B6F68;">${e}</a>`;
export function renderAvisoInatividade(item: ItemFila, baseUrl: string | null): EmailPronto {
  const { acao, ultimo_acesso, prazo } = item.payload ?? {};
  if ((acao !== "apagar_conta" && acao !== "zerar_coins") || !ultimo_acesso || !prazo) throw new Error("Aviso sem ação, último acesso ou prazo.");
  const nome = primeiroNome(item.nome);
  const ola = nome ? `Olá, ${nome}!` : "Olá!";
  const desde = dataBR(ultimo_acesso);
  const ate = dataBR(prazo);
  const entrar = `${base(baseUrl)}/novo/login`;
  const apagar = acao === "apagar_conta";
  const subject = apagar ? "Sua conta StaziaMed será apagada por falta de acesso" : "Seus Stazia Coins serão zerados por falta de acesso";
  const regra = apagar
    ? "Pela nossa Política de Privacidade, contas gratuitas sem nenhum acesso por mais de 12 meses têm os dados de estudo eliminados, com aviso de pelo menos 30 dias."
    : "Pelo Regulamento de Coins e Ligas (item 4.3), o saldo de Stazia Coins de contas sem acesso por 12 meses seguidos pode ser zerado, com aviso de 30 dias.";
  const efeito = apagar
    ? `Se você não entrar no app até <strong>${esc(ate)}</strong>, a sua conta e os seus dados de estudo serão apagados depois dessa data. Guardamos só o que a lei exige (como o registro do aceite do contrato).`
    : `Se você não entrar no app até <strong>${esc(ate)}</strong>, o seu saldo de Stazia Coins será zerado depois dessa data. A sua conta e o seu progresso continuam.`;
  const efeitoTxt = efeito.replace(/<\/?strong>/g, "");
  const manter = apagar
    ? "Para manter a conta, basta entrar no StaziaMed. Se quiser uma cópia dos seus dados antes, peça pelo e-mail privacidade@staziamed.com.br."
    : "Para manter os Coins, basta entrar no StaziaMed.";
  const html = moldura(subject, [
    p(esc(ola)),
    p(`A sua conta StaziaMed está sem acesso desde <strong>${esc(desde)}</strong>.`),
    p(esc(regra)),
    p(efeito),
    p(esc(manter), true),
    botao(entrar, "Entrar no StaziaMed"),
    p(`Este é um e-mail de serviço sobre a sua conta, não é propaganda. Não responda: esta caixa não é lida. Dúvidas: ${mail(SUPORTE)}. Seus dados pessoais: ${mail(PRIVACIDADE)}.`, true, true),
  ]);
  const text = [
    ola,
    "",
    `A sua conta StaziaMed está sem acesso desde ${desde}.`,
    "",
    regra,
    "",
    efeitoTxt,
    "",
    manter,
    `Entrar no StaziaMed: ${entrar}`,
    "",
    `Este é um e-mail de serviço sobre a sua conta, não é propaganda. Não responda: esta caixa não é lida. Dúvidas: ${SUPORTE}. Seus dados pessoais: ${PRIVACIDADE}.`,
    "",
    "Equipe StaziaMed",
    "Tecnologia que transforma.",
    "www.staziamed.com.br",
    "",
  ].join("\n");
  return { subject, text, html };
}

export function renderItem(item: ItemFila, baseUrl: string | null): EmailPronto {
  return renderAvisoInatividade(item, baseUrl);
}
