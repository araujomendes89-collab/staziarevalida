/**
 * E-mails de serviço do Contrato 3.0 (ramo termo-funcoes), no mesmo visual dos modelos do Supabase com a logo nova
 * (~/Downloads/emails-staziamed-logo-nova: fundo #F4F6F9, cartão branco de 560 px com borda #ECEFF3, texto #0D1C42 / #4F5A69,
 * botão #0B6F68, "Equipe StaziaMed — Tecnologia que transforma.").
 *   - cópia do contrato aceito (cláusulas 6.4 e 6.6): versão, data e hora, código do texto, link para Minha Conta → Documentos e o
 *     texto completo em anexo (.txt, o mesmo formato do botão "Baixar" de Documentos);
 *   - aviso de conta inativa (Política 3.0, seção 5; Regulamento 1.0, 4.3).
 * Só texto vindo do banco; tudo que entra no HTML passa por esc().
 */

export interface ContratoAceito {
  document: string;
  version: string;
  accepted_at: string;
  origin: string;
  text_sha256: string | null;
  title: string | null;
  body: string | null;
  companions: Record<string, { version?: string; sha256?: string } | undefined>;
}

export interface ItemFila {
  id: number;
  kind: "contrato_copia" | "aviso_inatividade";
  tentativas: number;
  email: string | null;
  nome: string | null;
  payload: { acao?: "apagar_conta" | "zerar_coins"; ultimo_acesso?: string; prazo?: string };
  contrato: ContratoAceito | null;
}

export interface EmailPronto {
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: string; contentType: string }[];
}

export const LOGO = "https://app.staziamed.com.br/brand/horizontal-480w.png";
const SITE = "https://www.staziamed.com.br";
const SUPORTE = "suporte@staziamed.com.br";
const PRIVACIDADE = "privacidade@staziamed.com.br";
const BASE_PADRAO = "https://app.staziamed.com.br";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const base = (url: string | null) => (url || BASE_PADRAO).replace(/\/+$/, "");
const primeiroNome = (nome: string | null) => (nome ?? "").trim().split(/\s+/)[0] ?? "";

const ORIGEM: Record<string, string> = { cadastro: "no cadastro", google: "ao entrar com o Google", tela_aceite: "na tela de aceite" };
const NOME_DOC: Record<string, string> = { politica_privacidade: "Política de Privacidade", regulamento: "Regulamento de Coins e Ligas" };

/** Data e hora no fuso de Brasília, como em Minha Conta → Documentos ("17/10/2026 às 14:05"). */
export function dataHoraBR(iso: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
}
/** "2026-11-30" (data do banco) → "30/11/2026"; um instante → a data em Brasília. */
export function dataBR(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(v));
}

/** Igual ao textoSimples do site (src/novo/app/legal/LegalText.jsx): tira as marcas de negrito/itálico do Markdown. */
export function textoSimples(source: string): string {
  return source.replace(/\r/g, "").replace(/\*\*\*([^*]+?)\*\*\*/g, "$1").replace(/\*\*([^*]+?)\*\*/g, "$1").replace(/\*([^*\s](?:[^*]*?[^*\s])?)\*/g, "$1");
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
function quadro(linhas: [string, string, boolean?][]): string {
  const tr = linhas
    .map(
      ([k, v, mono]) =>
        `<tr><td style="padding:6px 0;font-size:14px;line-height:20px;color:#4F5A69;vertical-align:top;width:120px;">${esc(k)}</td>` +
        `<td style="padding:6px 0 6px 12px;font-size:14px;line-height:20px;color:#0D1C42;vertical-align:top;${mono ? "font-family:Consolas,Menlo,monospace;font-size:12px;word-break:break-all;" : ""}">${esc(v)}</td></tr>`,
    )
    .join("");
  return `        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;padding:12px 16px;background-color:#F4F6F9;border-radius:12px;">${tr}</table>`;
}

/** Nome do arquivo da cópia, igual ao do botão "Baixar" de Minha Conta → Documentos. */
export const arquivoDoContrato = (versao: string) => `staziamed-contrato-v${versao}.txt`;

/** A cópia em texto: o mesmo cabeçalho do "Baixar" de Documentos (versão, data e hora, conta, código) e o texto aceito. */
export function textoDaCopia(c: ContratoAceito, email: string | null): string {
  const cabecalho = [
    "StaziaMed Revalida — cópia do aluno",
    `${c.title ?? "Contrato de Assinatura e Termos de Uso"} — versão ${c.version}`,
    `Aceito em ${dataHoraBR(c.accepted_at)} (horário de Brasília)${email ? ` pela conta ${email}` : ""}`,
    c.text_sha256 ? `Código de integridade (SHA-256) do texto: ${c.text_sha256}` : null,
    "Stazia Tecnologia e Educação Ltda — CNPJ 64.964.213/0001-16",
    "".padEnd(60, "-"),
    "",
  ].filter((l): l is string => l !== null);
  return `${cabecalho.join("\n")}\n${textoSimples(c.body ?? "")}`;
}

export function renderCopiaContrato(item: ItemFila, baseUrl: string | null): EmailPronto {
  const c = item.contrato;
  if (!c?.body || !c.version) throw new Error("Texto do contrato não encontrado.");
  const titulo = c.title ?? "Contrato de Assinatura e Termos de Uso";
  const nome = primeiroNome(item.nome);
  const ola = nome ? `Olá, ${nome}!` : "Olá!";
  const link = `${base(baseUrl)}/novo/perfil?secao=docs`;
  const quando = dataHoraBR(c.accepted_at);
  const onde = ORIGEM[c.origin];
  const arquivo = arquivoDoContrato(c.version);
  const outros = ["politica_privacidade", "regulamento"]
    .map((d) => (c.companions?.[d]?.version ? `${NOME_DOC[d]} ${c.companions[d]!.version}` : null))
    .filter((x): x is string => Boolean(x));
  const linhas: [string, string, boolean?][] = [
    ["Documento", titulo],
    ["Versão", c.version],
    ["Aceito em", `${quando} (horário de Brasília)${onde ? `, ${onde}` : ""}`],
  ];
  if (outros.length) linhas.push(["Junto com", outros.join(" e ")]);
  if (c.text_sha256) linhas.push(["Código do texto", c.text_sha256, true]);

  const subject = `Sua cópia do contrato (versão ${c.version}) · StaziaMed`;
  const html = moldura(subject, [
    p(esc(ola)),
    p(`Você aceitou o <strong>${esc(titulo)}</strong> do StaziaMed Revalida. Este e-mail é a <strong>sua cópia do contrato</strong>: guarde-o.`),
    quadro(linhas),
    p(`O texto completo que você aceitou está no arquivo anexo (<strong>${esc(arquivo)}</strong>). Ele também fica guardado em Minha Conta → Documentos, onde você pode ver e baixar a qualquer momento.`, true),
    botao(link, "Ver em Minha Conta → Documentos"),
    p(`O código do texto (SHA-256) identifica exatamente o texto aceito: em caso de dúvida, vale o texto com esse código. A Stazia guarda outra cópia, que não pode ser alterada, junto com o registro do aceite.`, false, true),
    p(`Este é um e-mail de serviço sobre o seu contrato, não é propaganda. Não responda: esta caixa não é lida. Dúvidas: ${mail(SUPORTE)}. Seus dados pessoais: ${mail(PRIVACIDADE)}.`, true, true),
  ]);
  const text = [
    ola,
    "",
    `Você aceitou o ${titulo} do StaziaMed Revalida. Este e-mail é a sua cópia do contrato: guarde-o.`,
    "",
    ...linhas.map(([k, v]) => `${k}: ${v}`),
    "",
    `O texto completo que você aceitou está no arquivo anexo (${arquivo}). Ele também fica em Minha Conta → Documentos: ${link}`,
    "",
    "O código do texto (SHA-256) identifica exatamente o texto aceito: em caso de dúvida, vale o texto com esse código. A Stazia guarda outra cópia, que não pode ser alterada, junto com o registro do aceite.",
    "",
    `Este é um e-mail de serviço sobre o seu contrato, não é propaganda. Não responda: esta caixa não é lida. Dúvidas: ${SUPORTE}. Seus dados pessoais: ${PRIVACIDADE}.`,
    "",
    "Equipe StaziaMed",
    "Tecnologia que transforma.",
    "www.staziamed.com.br",
    "",
  ].join("\n");
  return { subject, text, html, attachments: [{ filename: arquivo, content: textoDaCopia(c, item.email), contentType: "text/plain; charset=UTF-8" }] };
}

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
    ? "Para manter a conta, basta entrar no StaziaMed. Se preferir guardar seus dados antes, use Minha Conta → Privacidade e dados → Baixar meus dados."
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
  return item.kind === "contrato_copia" ? renderCopiaContrato(item, baseUrl) : renderAvisoInatividade(item, baseUrl);
}
