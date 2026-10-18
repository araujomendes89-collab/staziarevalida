/**
 * E-mails da cobrança além dos avisos ao aluno (migração 013850):
 *   - "Sua nota fiscal": quando a nota de um pagamento é autorizada, o aluno recebe o link do PDF (uma vez por nota). Escolha de
 *     17/10: mandar NÓS MESMOS pelo SMTP do projeto, porque os clientes são criados no Asaas com os avisos desligados
 *     (notificationDisabled) e a documentação do Asaas não garante que a nota vá por e-mail nessa situação;
 *   - alertas ao DONO (gasto de IA em 80% e 100% do teto do dia, aluno fora do comum, resumo diário, devolução no painel para
 *     conferir), para o endereço configurado na Administração (padrão suporte@staziamed.com.br).
 * Mesma regra dos avisos: o banco cria cada e-mail UMA vez; um envio que cai no meio nunca é repetido; sem SMTP, nada sai (o link da
 * nota continua em Minha conta e os alertas continuam na Administração).
 * Molde igual ao dos avisos (tabela, estilos na linha, cores #0B6F68 / #0D1C42 / #4F5A69, logo nova).
 */
import type { ContentDb } from "../contentHub/infra";
import type { Mailer } from "./smtp";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const LOGO = "https://app.staziamed.com.br/brand/horizontal-480w.png";
const PLANOS: Record<string, string> = { pro: "PRO", pratica: "PRÁTICA", elite: "ELITE" };

export const brl = (centavos: number) =>
  (Number(centavos || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const diaBR = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

function layout(o: { titulo: string; ola: string; paragrafos: string[]; botao?: { texto: string; link: string } | null; extra?: { texto: string; link: string } | null; rodape: string }) {
  const ps = o.paragrafos
    .map((p) => `<tr><td style="font-size:16px;color:#4F5A69;line-height:24px;padding-bottom:16px;">${esc(p)}</td></tr>`)
    .join("\n");
  const botao = o.botao
    ? `<tr><td style="padding:8px 0 20px;"><a href="${esc(o.botao.link)}" style="display:inline-block;background:#0B6F68;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 24px;border-radius:10px;">${esc(o.botao.texto)}</a></td></tr>`
    : "";
  const extra = o.extra
    ? `<tr><td style="font-size:14px;line-height:22px;padding-bottom:24px;"><a href="${esc(o.extra.link)}" style="color:#0B6F68;">${esc(o.extra.texto)}</a></td></tr>`
    : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(o.titulo)}</title></head>
<body style="margin:0;padding:0;background:#F4F6F8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;padding:32px 28px;font-family:Arial,Helvetica,sans-serif;">
<tr><td style="padding-bottom:20px;"><img src="${LOGO}" width="200" alt="StaziaMed Revalida" style="display:block;width:200px;height:auto;border:0;"></td></tr>
<tr><td style="font-size:16px;color:#4F5A69;line-height:24px;padding-bottom:8px;">${esc(o.ola)}</td></tr>
<tr><td style="font-size:22px;font-weight:bold;color:#0D1C42;line-height:30px;padding-bottom:12px;">${esc(o.titulo)}</td></tr>
${ps}
${botao}
${extra}
<tr><td style="font-size:12px;color:#8A94A3;line-height:18px;border-top:1px solid #E6E9EE;padding-top:16px;">${esc(o.rodape)}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ---------------------------------------------------------------- nota fiscal ao aluno
export interface NotaEmail {
  id: number;
  email: string;
  nome: string | null;
  tipo: "plano" | "extra";
  codigo: string;
  ciclo: string;
  valor_centavos: number;
  pago_em: string | null;
  numero: string | null;
  pdf_url: string;
  nome_extra?: string | null;
}

/** O que foi pago, em palavras (igual ao histórico). */
export function oQueFoiPago(n: Pick<NotaEmail, "tipo" | "codigo" | "ciclo" | "nome_extra">) {
  if (n.tipo === "plano") return `plano ${PLANOS[n.codigo] ?? n.codigo.toUpperCase()} ${n.ciclo === "trimestral" ? "trimestral" : "mensal"}`;
  const nome = (n.nome_extra ?? "").replace(/\s*\(.*\)\s*$/, "").trim();
  return nome ? `pacote extra ${/^IA\b/i.test(nome) ? nome : `de IA ${nome}`}` : "pacote extra de IA";
}

export function renderNota(n: NotaEmail, baseUrl: string | null) {
  const base = (baseUrl || "https://app.staziamed.com.br").replace(/\/+$/, "");
  const conta = `${base}/novo/perfil?secao=assinatura`;
  const primeiro = (n.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const ola = primeiro ? `Olá, ${primeiro}!` : "Olá!";
  const titulo = "Sua nota fiscal";
  const quando = diaBR(n.pago_em);
  const p1 = `A nota fiscal${n.numero ? ` nº ${n.numero}` : ""} do seu pagamento de ${brl(n.valor_centavos)} (${oQueFoiPago(n)}${quando ? `, pago em ${quando}` : ""}) foi emitida.`;
  const p2 = "Ela também fica em Minha conta > Assinatura > Pagamentos e notas, quando você precisar de novo.";
  const rodape = "Você recebe este e-mail porque fez um pagamento no StaziaMed Revalida. Não responda: esta caixa não é lida. Dúvidas: suporte@staziamed.com.br.";
  const text = `${ola}\n\n${titulo}\n\n${p1}\n\nBaixar a nota fiscal (PDF): ${n.pdf_url}\n\n${p2}\nMinha conta: ${conta}\n\n—\nStaziaMed Revalida\n${rodape}\n`;
  const html = layout({ titulo, ola, paragrafos: [p1, p2], botao: { texto: "Baixar a nota fiscal (PDF)", link: n.pdf_url }, extra: { texto: "Abrir Minha conta", link: conta }, rodape });
  return { subject: `${titulo} · StaziaMed`, text, html };
}

// ---------------------------------------------------------------- alertas ao dono
export interface AlertaDono {
  id: number;
  tipo: string;
  titulo: string;
  texto: string;
  email: string;
}

export function renderAlerta(a: Pick<AlertaDono, "titulo" | "texto" | "tipo">, baseUrl: string | null) {
  const base = (baseUrl || "https://app.staziamed.com.br").replace(/\/+$/, "");
  // a devolução para conferir se resolve em Vendas e pagamentos; o resto, na Carteira de IA (Planos)
  const link = `${base}/novo/admin?aba=${a.tipo === "devolucao_conferir" ? "vendas" : "planos"}`;
  const rodape = "Alerta automático do StaziaMed para a administração. Uma vez só por evento. Para mudar o endereço ou desligar: Administração > Planos > Carteira de IA > Alertas por e-mail.";
  const text = `${a.titulo}\n\n${a.texto}\n\nAbrir a Administração: ${link}\n\n—\nStaziaMed Revalida\n${rodape}\n`;
  const html = layout({ titulo: a.titulo, ola: "Alerta do StaziaMed", paragrafos: [a.texto], botao: { texto: "Abrir a Administração", link }, rodape });
  return { subject: `[StaziaMed] ${a.titulo}`, text, html };
}

// ---------------------------------------------------------------- envio
export interface EmailsCobrancaDeps {
  db: ContentDb;
  mailer: Mailer | null;
  baseUrl: string | null;
  log?: (m: string) => void;
}

type Resultado = { enviados: number; falhas: number; desligado?: boolean };

export function createEmailsCobranca(deps: EmailsCobrancaDeps) {
  const log = (m: string) => deps.log?.(m.slice(0, 300));

  async function lote<T extends { id: number }>(pegar: string, marcar: string, limite: number, montar: (x: T) => { to: string; subject: string; text: string; html: string }): Promise<Resultado> {
    if (!deps.mailer) return { enviados: 0, falhas: 0, desligado: true };
    const itens = (await deps.db.service<T[]>(pegar, { p_limite: limite })) ?? [];
    let enviados = 0;
    let falhas = 0;
    for (const x of itens) {
      try {
        await deps.mailer.send(montar(x));
        await deps.db.service(marcar, { p_id: x.id, p_ok: true, p_erro: null });
        enviados++;
      } catch (e) {
        falhas++;
        const msg = (e as Error).message;
        log(`[emails] ${pegar} ${x.id} não enviado: ${msg}`);
        await deps.db.service(marcar, { p_id: x.id, p_ok: false, p_erro: msg }).catch(() => undefined);
      }
    }
    return { enviados, falhas };
  }

  /** "Sua nota fiscal" pendentes. */
  const enviarNotas = (limite = 20) =>
    lote<NotaEmail>("ch_worker_billing_notas_email_pegar", "ch_worker_billing_nota_email_marcar", limite, (n) => ({ to: n.email, ...renderNota(n, deps.baseUrl) }));

  /** Alertas novos ao dono (gasto de IA, aluno fora do comum, resumo, devolução para conferir). Devolve quantos nasceram. */
  const gerarAlertas = async () => Number(await deps.db.service<number>("ch_worker_alertas_dono_gerar", {})) || 0;

  const enviarAlertas = (limite = 20) =>
    lote<AlertaDono>("ch_worker_alertas_dono_pegar", "ch_worker_alerta_dono_marcar", limite, (a) => ({ to: a.email, ...renderAlerta(a, deps.baseUrl) }));

  /** Tarefa de hora em hora: gera e manda os alertas ao dono e manda as notas pendentes. Cada parte falha sozinha. */
  async function rodar() {
    const out: Record<string, unknown> = {};
    try {
      out.alertas_novos = await gerarAlertas();
    } catch (e) {
      log(`[alertas] gerar falhou: ${(e as Error).message}`);
      out.alertas_novos = { erro: true };
    }
    out.alertas_email = await enviarAlertas(50).catch((e) => (log(`[alertas] envio falhou: ${(e as Error).message}`), { erro: true }));
    out.notas_email = await enviarNotas(50).catch((e) => (log(`[notas] envio falhou: ${(e as Error).message}`), { erro: true }));
    return out;
  }

  return { enviarNotas, gerarAlertas, enviarAlertas, rodar };
}

export type EmailsCobranca = ReturnType<typeof createEmailsCobranca>;
