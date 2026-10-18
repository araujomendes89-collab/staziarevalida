/**
 * E-mail de um COMUNICADO da equipe a partir do conteúdo formatado (migração 013940). PRONTO, MAS NÃO LIGADO: hoje comunicado vai só
 * para o sino (email_status 'so_tela', 013830) e nenhuma rotina chama esta função. Fica pronto para o dia em que o dono decidir mandar
 * comunicado por e-mail (aí entram as regras de consentimento do Termo e um envio próprio).
 *
 * As duas versões saem do MESMO conteúdo que o aluno vê no sino:
 *   - HTML: o documento saneado pelo mesmo núcleo do editor (ricoValido + htmlDoDoc: texto escapado, só https nos links, nada de HTML
 *     cru que veio de fora), dentro do molde dos e-mails de aviso (logo, cores #0B6F68 / #0D1C42 / #4F5A69);
 *   - texto simples: títulos, parágrafos, listas com "•" ou "1." e links como "texto (https://...)".
 * Comunicado antigo, só texto, também funciona (vira um parágrafo).
 */
import { blocoDeTexto, htmlDoDoc, ricoValido, sanear, type DocRico } from "../../src/shared/docRico";
import { ler } from "../../src/shared/textoRico";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const LOGO = "https://app.staziamed.com.br/brand/horizontal-480w.png";

export interface ComunicadoParaEmail {
  titulo: string;
  texto: string;
  rico?: unknown;
  link?: string | null;
  nome?: string | null;
}

/** O documento que o aluno vê: o rico quando bate com o texto; senão, o texto com marcas (links etc.). */
export function docDoComunicado(texto: string, rico: unknown): DocRico {
  const r = ricoValido(String(texto ?? ""), rico);
  if (r) return r.doc;
  const d = ler(String(texto ?? ""), "linha") as unknown as DocRico;
  return sanear(d.content?.length ? d : { type: "doc", content: [blocoDeTexto(String(texto ?? ""))] }, { semRef: true });
}

type No = { type: string; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: No[]; attrs?: Record<string, unknown> };

function inlineTexto(nos: No[] | undefined): string {
  return (nos ?? [])
    .map((n) => {
      if (n.type === "hardBreak") return "\n";
      if (n.type !== "text") return inlineTexto(n.content);
      const href = n.marks?.find((m) => m.type === "link")?.attrs?.href;
      return typeof href === "string" && href !== n.text ? `${n.text ?? ""} (${href})` : n.text ?? "";
    })
    .join("");
}

function blocoTexto(b: No): string {
  switch (b.type) {
    case "paragraph":
    case "heading":
      return inlineTexto(b.content);
    case "bulletList":
      return (b.content ?? []).map((it) => `• ${(it.content ?? []).map(blocoTexto).join(" ")}`).join("\n");
    case "orderedList": {
      let n = Number(b.attrs?.start) > 0 ? Number(b.attrs?.start) : 1;
      return (b.content ?? []).map((it) => `${n++}. ${(it.content ?? []).map(blocoTexto).join(" ")}`).join("\n");
    }
    case "table":
      return (b.content ?? []).map((r) => (r.content ?? []).map((c) => (c.content ?? []).map(blocoTexto).join(" ")).join(" | ")).join("\n");
    default:
      return (b.content ?? []).map(blocoTexto).filter(Boolean).join("\n");
  }
}

/** Versão em texto simples do documento (para a parte text/plain do e-mail). */
export function textoSimplesDoDoc(doc: DocRico): string {
  return (doc.content as No[]).map(blocoTexto).filter((x) => x.trim()).join("\n\n");
}

/** Assunto, texto simples e HTML do e-mail de um comunicado. */
export function renderComunicadoEmail(c: ComunicadoParaEmail, baseUrl: string | null) {
  const base = (baseUrl || "https://app.staziamed.com.br").replace(/\/+$/, "");
  const doc = docDoComunicado(c.texto, c.rico);
  const link = c.link ? (/^https:\/\//.test(c.link) ? c.link : `${base}/novo${c.link}`) : null;
  const primeiro = (c.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const ola = primeiro ? `Olá, ${primeiro}!` : "Olá!";
  const rodape = "Você recebe este e-mail porque tem uma conta no StaziaMed Revalida. Não responda: esta caixa não é lida. Dúvidas: suporte@staziamed.com.br.";
  const corpoTexto = textoSimplesDoDoc(doc);
  const text = `${ola}\n\n${c.titulo}\n\n${corpoTexto}\n\n${link ? `Abrir: ${link}\n\n` : ""}—\nStaziaMed Revalida\n${rodape}\n`;
  const corpoHtml = htmlDoDoc(doc)
    .replace(/<p(?=[ >])/g, '<p style="margin:0 0 12px;"')
    .replace(/<h([234])(?=[ >])/g, '<h$1 style="margin:16px 0 8px;font-size:17px;color:#0D1C42;"')
    .replace(/<(ul|ol)(?=[ >])/g, '<$1 style="margin:0 0 12px;padding-left:22px;"')
    .replace(/<a /g, '<a style="color:#0B6F68;" ');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(c.titulo)}</title></head>
<body style="margin:0;padding:0;background:#F4F6F8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;padding:32px 28px;font-family:Arial,Helvetica,sans-serif;">
<tr><td style="padding-bottom:20px;"><img src="${LOGO}" width="200" alt="StaziaMed Revalida" style="display:block;width:200px;height:auto;border:0;"></td></tr>
<tr><td style="font-size:16px;color:#4F5A69;line-height:24px;padding-bottom:8px;">${esc(ola)}</td></tr>
<tr><td style="font-size:22px;font-weight:bold;color:#0D1C42;line-height:30px;padding-bottom:12px;">${esc(c.titulo)}</td></tr>
<tr><td style="font-size:16px;color:#4F5A69;line-height:24px;padding-bottom:24px;">${corpoHtml}</td></tr>
${link ? `<tr><td style="padding-bottom:28px;"><a href="${esc(link)}" style="display:inline-block;background:#0B6F68;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 24px;border-radius:10px;">Abrir</a></td></tr>\n` : ""}<tr><td style="font-size:12px;color:#8A94A3;line-height:18px;border-top:1px solid #E6E9EE;padding-top:16px;">${esc(rodape)}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  return { subject: `${c.titulo} · StaziaMed`, text, html };
}
