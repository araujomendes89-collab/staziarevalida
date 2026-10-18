/**
 * E-mails de serviço do Contrato 3.0 (ramo termo-funcoes), no mesmo visual dos modelos do Supabase com a logo nova
 * (~/Downloads/emails-staziamed-logo-nova: fundo #F4F6F9, cartão branco de 560 px com borda #ECEFF3, texto #0D1C42 / #4F5A69,
 * botão #0B6F68, "Equipe StaziaMed — Tecnologia que transforma.").
 *   - aviso de conta inativa (Política 3.0, seção 5; Regulamento 1.0, 4.3);
 *   - comunicado da equipe (013940; decisão do dono 18/10): só para quem aceitou receber novidades, com o texto formatado da versão
 *     atual (montado em ./comunicado.ts) e o rodapé de descadastro (link de um clique + confirmação, e cabeçalho List-Unsubscribe);
 *   - lista de interesse da 2ª fase (013960): confirmação do e-mail (dupla confirmação) e o aviso "a 2ª fase abriu", os dois com o
 *     link de sair da lista (um clique + confirmação; o aviso também com List-Unsubscribe). Páginas em server/interesse/router.ts.
 * O contrato NÃO vai por e-mail (decisão do dono, 18/10/2026: "Contrato não é enviado ao cliente, fica dentro do app dele."):
 * o contrato aceito fica só em Minha Conta → Documentos.
 * Só texto vindo do banco; tudo que entra no HTML passa por esc().
 */
import { docDoComunicado, htmlDoEmail, textoSimplesDoDoc } from "./comunicado";

export interface ItemFila {
  id: number;
  kind: "aviso_inatividade" | "comunicado" | "interesse_confirmar" | "interesse_aviso";
  tentativas: number;
  email: string | null;
  nome: string | null;
  payload: {
    acao?: "apagar_conta" | "zerar_coins";
    ultimo_acesso?: string;
    prazo?: string;
    // comunicado (montado pela fila na hora do envio, com a versão atual)
    comunicado_id?: number;
    titulo?: string;
    texto?: string;
    rico?: unknown;
    link?: string | null;
    descadastro?: string;
    // lista de interesse (montado pela fila na hora do envio): códigos dos links de confirmar, sair e do grupo
    fase?: string;
    confirmar?: string;
    sair?: string;
    grupo?: string;
    tem_grupo?: boolean;
  };
}

export interface EmailPronto {
  subject: string;
  text: string;
  html: string;
  /** cabeçalhos extras (List-Unsubscribe do comunicado) */
  headers?: Record<string, string>;
}

export const LOGO = "https://app.staziamed.com.br/brand/horizontal-480w.png";
const SITE = "https://www.staziamed.com.br";
const SUPORTE = "suporte@staziamed.com.br";
const PRIVACIDADE = "privacidade@staziamed.com.br";
const BASE_PADRAO = "https://app.staziamed.com.br";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const base = (url: string | null) => (url || BASE_PADRAO).replace(/\/+$/, "");
export const primeiroNome = (nome: string | null) => (nome ?? "").trim().split(/\s+/)[0] ?? "";

/** "2026-11-30" (data do banco) → "30/11/2026"; um instante → a data em Brasília. */
export function dataBR(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(v));
}

/** Moldura dos modelos (logo, corpo, assinatura). `blocos` já vem em HTML seguro. */
export function moldura(titulo: string, blocos: string[]): string {
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
export const p = (html: string, ultimo = false, cinza = false) =>
  `        <p style="margin:0 0 ${ultimo ? 24 : 16}px 0;${cinza ? "color:#4F5A69;" : ""}">${html}</p>`;
export const botao = (href: string, rotulo: string) => `        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
          <tr>
            <td style="background-color:#0B6F68;border-radius:12px;">
              <a href="${esc(href)}" style="display:inline-block;padding:14px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:20px;color:#FFFFFF;text-decoration:none;">${esc(rotulo)}</a>
            </td>
          </tr>
        </table>`;
export const mail = (e: string) => `<a href="mailto:${e}" style="color:#0B6F68;">${e}</a>`;
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
  if (item.kind === "comunicado") return renderComunicado(item, baseUrl);
  if (item.kind === "interesse_confirmar") return renderInteresseConfirmar(item, baseUrl);
  if (item.kind === "interesse_aviso") return renderInteresseAviso(item, baseUrl);
  return renderAvisoInatividade(item, baseUrl);
}

/** Endereço de descadastro (página com confirmação; o mesmo endereço recebe o POST de um clique do List-Unsubscribe). */
export const linkDescadastro = (baseUrl: string | null, token: string) => `${base(baseUrl)}/api/legal/descadastro?t=${encodeURIComponent(token)}`;

export function renderComunicado(item: ItemFila, baseUrl: string | null): EmailPronto {
  const { titulo, texto, rico, link, descadastro } = item.payload ?? {};
  if (!titulo || !texto) throw new Error("Comunicado sem título ou texto.");
  if (!descadastro || !/^[0-9a-f]{64}$/.test(descadastro)) throw new Error("Comunicado sem link de descadastro.");
  const doc = docDoComunicado(texto, rico);
  const nome = primeiroNome(item.nome);
  const ola = nome ? `Olá, ${nome}!` : "Olá!";
  const abrir = link ? (/^https:\/\//.test(link) ? link : `${base(baseUrl)}/novo${link}`) : `${base(baseUrl)}/novo/`;
  const sair = linkDescadastro(baseUrl, descadastro);
  const rodape = "Você recebe este e-mail porque aceitou receber novidades do StaziaMed por e-mail. Não responda: esta caixa não é lida.";
  const html = moldura(titulo, [
    p(esc(ola)),
    `        <h1 style="margin:0 0 16px 0;font-size:22px;line-height:30px;color:#0D1C42;">${esc(titulo)}</h1>`,
    `        <div style="margin:0 0 24px 0;color:#4F5A69;">${htmlDoEmail(doc)}</div>`,
    botao(abrir, link ? "Abrir no app" : "Abrir o StaziaMed"),
    p(`${esc(rodape)} Dúvidas: ${mail(SUPORTE)}.`, false, true),
    p(`Não quer mais receber? <a href="${esc(sair)}" style="color:#0B6F68;">Descadastrar deste tipo de e-mail</a> (um clique e uma confirmação). Também dá para mudar em Minha Conta → Privacidade e dados.`, true, true),
  ]);
  const text = [
    ola,
    "",
    titulo,
    "",
    textoSimplesDoDoc(doc),
    "",
    `${link ? "Abrir no app" : "Abrir o StaziaMed"}: ${abrir}`,
    "",
    `${rodape} Dúvidas: ${SUPORTE}.`,
    `Não quer mais receber? Descadastrar: ${sair}`,
    "",
    "Equipe StaziaMed",
    "Tecnologia que transforma.",
    "www.staziamed.com.br",
    "",
  ].join("\n");
  return {
    subject: `${titulo} · StaziaMed`,
    text,
    html,
    headers: { "List-Unsubscribe": `<${sair}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

// ---------------------------------------------------------------- lista de interesse da 2ª fase (013960)
const CODIGO = /^[0-9a-f]{64}$/;
/** Endereços das páginas da lista (server/interesse/router.ts). Só o código aleatório vai no link, nunca o e-mail nem o WhatsApp. */
export const linkInteresse = (baseUrl: string | null, pagina: "confirmar" | "sair" | "grupo", token: string) =>
  `${base(baseUrl)}/api/interesse/${pagina}?t=${encodeURIComponent(token)}`;
const RODAPE_INTERESSE =
  "Você recebe este e-mail porque pediu, no site do StaziaMed, para ser avisado quando a 2ª fase abrir. Usamos este endereço só para isso. Não responda: esta caixa não é lida.";

/** Confirmação do e-mail (dupla confirmação): o botão leva à página com "Confirmar"; sem confirmar, não mandamos mais nada. */
export function renderInteresseConfirmar(item: ItemFila, baseUrl: string | null): EmailPronto {
  const { confirmar, sair } = item.payload ?? {};
  if (!confirmar || !CODIGO.test(confirmar) || !sair || !CODIGO.test(sair)) throw new Error("Confirmação sem link.");
  const nome = primeiroNome(item.nome);
  const ola = nome ? `Olá, ${nome}!` : "Olá!";
  const subject = "Confirme seu e-mail para o aviso da 2ª fase · StaziaMed";
  const ok = linkInteresse(baseUrl, "confirmar", confirmar);
  const fora = linkInteresse(baseUrl, "sair", sair);
  const html = moldura(subject, [
    p(esc(ola)),
    p("Recebemos um pedido para avisar este e-mail quando a 2ª fase do StaziaMed abrir."),
    p("Para confirmar que o e-mail é seu, toque no botão abaixo. O link vale por 7 dias.", true),
    botao(ok, "Confirmar meu e-mail"),
    p("Não foi você? É só ignorar: sem a confirmação, não mandamos mais nada para este endereço e ele sai da lista em até 30 dias.", false, true),
    p(`Quer sair da lista agora? <a href="${esc(fora)}" style="color:#0B6F68;">Sair da lista de interesse</a> (um clique e uma confirmação).`, false, true),
    p(`${esc(RODAPE_INTERESSE)} Dúvidas: ${mail(SUPORTE)}.`, true, true),
  ]);
  const text = [
    ola,
    "",
    "Recebemos um pedido para avisar este e-mail quando a 2ª fase do StaziaMed abrir.",
    "Para confirmar que o e-mail é seu, abra o link abaixo (vale por 7 dias):",
    ok,
    "",
    "Não foi você? É só ignorar: sem a confirmação, não mandamos mais nada para este endereço e ele sai da lista em até 30 dias.",
    `Quer sair da lista agora? ${fora}`,
    "",
    `${RODAPE_INTERESSE} Dúvidas: ${SUPORTE}.`,
    "",
    "Equipe StaziaMed",
    "Tecnologia que transforma.",
    "www.staziamed.com.br",
    "",
  ].join("\n");
  return { subject, text, html };
}

/** O aviso "a 2ª fase abriu" (só para e-mail confirmado; uma vez por pessoa). */
export function renderInteresseAviso(item: ItemFila, baseUrl: string | null): EmailPronto {
  const { sair, grupo, tem_grupo } = item.payload ?? {};
  if (!sair || !CODIGO.test(sair)) throw new Error("Aviso sem link de sair da lista.");
  const nome = primeiroNome(item.nome);
  const ola = nome ? `Olá, ${nome}!` : "Olá!";
  const subject = "A 2ª fase do StaziaMed abriu";
  const fora = linkInteresse(baseUrl, "sair", sair);
  const linkGrupo = tem_grupo && grupo && CODIGO.test(grupo) ? linkInteresse(baseUrl, "grupo", grupo) : null;
  const html = moldura(subject, [
    p(esc(ola)),
    p("Você pediu para ser avisado quando a 2ª fase do StaziaMed abrisse. <strong>Ela abriu.</strong>"),
    p("Veja como funciona e como entrar no site:", true),
    botao(SITE, "Conhecer a 2ª fase"),
    ...(linkGrupo ? [p(`Avisos e novidades da 2ª fase também no <a href="${esc(linkGrupo)}" style="color:#0B6F68;">grupo do WhatsApp</a>.`)] : []),
    p("Este é o único aviso por e-mail que você pediu: depois dele, não mandamos mais nada por esta lista.", false, true),
    p(`${esc(RODAPE_INTERESSE)} Dúvidas: ${mail(SUPORTE)}.`, false, true),
    p(`Não quer mais receber? <a href="${esc(fora)}" style="color:#0B6F68;">Sair da lista de interesse</a> (um clique e uma confirmação).`, true, true),
  ]);
  const text = [
    ola,
    "",
    "Você pediu para ser avisado quando a 2ª fase do StaziaMed abrisse. Ela abriu.",
    `Veja como funciona e como entrar: ${SITE}`,
    ...(linkGrupo ? [`Grupo do WhatsApp da 2ª fase: ${linkGrupo}`] : []),
    "",
    "Este é o único aviso por e-mail que você pediu: depois dele, não mandamos mais nada por esta lista.",
    `${RODAPE_INTERESSE} Dúvidas: ${SUPORTE}.`,
    `Não quer mais receber? Sair da lista: ${fora}`,
    "",
    "Equipe StaziaMed",
    "Tecnologia que transforma.",
    "www.staziamed.com.br",
    "",
  ].join("\n");
  return { subject, text, html, headers: { "List-Unsubscribe": `<${fora}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}
