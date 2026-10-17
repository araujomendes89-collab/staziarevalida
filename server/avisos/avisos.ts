/**
 * Avisos de cobrança ao aluno (migração 013760): o banco cria o aviso UMA vez (tela + e-mail) e este módulo manda o e-mail.
 *   - gerar(): tarefa diária (7, 3 e 1 dia antes do vencimento; acesso pausado por falta de pagamento);
 *   - enviar(): pega os e-mails pendentes (no máximo 48 h de idade), manda e marca enviado/falhou. Sem SMTP: não faz nada (o aviso
 *     continua na tela e o e-mail expira sozinho). Um e-mail que caiu no meio NUNCA é repetido.
 * Molde do e-mail igual aos do Supabase (tabela, estilos na linha, cores #0B6F68 / #0D1C42 / #4F5A69, logo nova).
 */
import type { ContentDb } from "../contentHub/infra";
import type { Mailer } from "./smtp";

export interface AvisoEmail {
  id: number;
  tipo: string;
  titulo: string;
  texto: string;
  rota: string;
  email: string;
  nome: string | null;
}

export interface AvisosDeps {
  db: ContentDb;
  mailer: Mailer | null;
  /** APP_BASE_URL (ex.: https://app.staziamed.com.br). Sem ele, o botão do e-mail aponta para o endereço oficial. */
  baseUrl: string | null;
  log?: (m: string) => void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const LOGO = "https://app.staziamed.com.br/brand/horizontal-480w.png";

/** Assunto, texto e HTML do e-mail de um aviso (o texto é o MESMO do aviso na tela). */
export function renderAviso(a: Pick<AvisoEmail, "titulo" | "texto" | "rota" | "nome">, baseUrl: string | null) {
  const base = (baseUrl || "https://app.staziamed.com.br").replace(/\/+$/, "");
  const link = `${base}/novo/${a.rota === "perfil" ? "perfil" : "planos"}`;
  const primeiro = (a.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const ola = primeiro ? `Olá, ${primeiro}!` : "Olá!";
  const botao = a.rota === "perfil" ? "Abrir Minha conta" : "Abrir Meu plano";
  const rodape = "Você recebe este e-mail porque tem uma assinatura no StaziaMed Revalida. Não responda: esta caixa não é lida. Dúvidas: suporte@staziamed.com.br.";
  const text = `${ola}\n\n${a.titulo}\n\n${a.texto}\n\n${botao}: ${link}\n\n—\nStaziaMed Revalida\n${rodape}\n`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(a.titulo)}</title></head>
<body style="margin:0;padding:0;background:#F4F6F8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;padding:32px 28px;font-family:Arial,Helvetica,sans-serif;">
<tr><td style="padding-bottom:20px;"><img src="${LOGO}" width="200" alt="StaziaMed Revalida" style="display:block;width:200px;height:auto;border:0;"></td></tr>
<tr><td style="font-size:16px;color:#4F5A69;line-height:24px;padding-bottom:8px;">${esc(ola)}</td></tr>
<tr><td style="font-size:22px;font-weight:bold;color:#0D1C42;line-height:30px;padding-bottom:12px;">${esc(a.titulo)}</td></tr>
<tr><td style="font-size:16px;color:#4F5A69;line-height:24px;padding-bottom:24px;">${esc(a.texto)}</td></tr>
<tr><td style="padding-bottom:28px;"><a href="${esc(link)}" style="display:inline-block;background:#0B6F68;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 24px;border-radius:10px;">${esc(botao)}</a></td></tr>
<tr><td style="font-size:12px;color:#8A94A3;line-height:18px;border-top:1px solid #E6E9EE;padding-top:16px;">${esc(rodape)}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  return { subject: `${a.titulo} · StaziaMed`, text, html };
}

export function createAvisos(deps: AvisosDeps) {
  const log = (m: string) => deps.log?.(m.slice(0, 300));

  /** Tarefa diária: avisos novos de renovação e de acesso pausado. Devolve quantos saíram. */
  async function gerar(): Promise<number> {
    return Number(await deps.db.service<number>("ch_worker_avisos_cobranca", {})) || 0;
  }

  /** Manda os e-mails pendentes. Sem SMTP configurado: { desligado: true } (nada é marcado). */
  async function enviar(limite = 20): Promise<{ enviados: number; falhas: number; desligado?: boolean }> {
    if (!deps.mailer) return { enviados: 0, falhas: 0, desligado: true };
    const lote = (await deps.db.service<AvisoEmail[]>("ch_worker_avisos_email_pegar", { p_limite: limite, p_horas: 48 })) ?? [];
    let enviados = 0;
    let falhas = 0;
    for (const a of lote) {
      try {
        const r = renderAviso(a, deps.baseUrl);
        await deps.mailer.send({ to: a.email, subject: r.subject, text: r.text, html: r.html });
        await deps.db.service("ch_worker_aviso_email_marcar", { p_id: a.id, p_ok: true, p_erro: null });
        enviados++;
      } catch (e) {
        falhas++;
        const msg = (e as Error).message;
        log(`[avisos] e-mail ${a.id} não enviado: ${msg}`);
        await deps.db.service("ch_worker_aviso_email_marcar", { p_id: a.id, p_ok: false, p_erro: msg }).catch(() => undefined);
      }
    }
    return { enviados, falhas };
  }

  return { gerar, enviar };
}

export type Avisos = ReturnType<typeof createAvisos>;
