/**
 * Conteúdo do e-mail de um COMUNICADO da equipe (013940) a partir do texto formatado, nas duas versões do e-mail:
 *   - HTML: o documento saneado pelo mesmo núcleo do editor profissional (ricoValido + htmlDoDoc: texto escapado, só https nos links,
 *     nada de HTML cru vindo de fora), com estilos na linha para os programas de e-mail;
 *   - texto simples: títulos, parágrafos, listas com "•" ou "1." e links como "texto (https://...)".
 * Comunicado antigo, só texto, também funciona (vira um parágrafo). A moldura (logo, rodapé, descadastro) fica em ./emails.ts.
 */
import { blocoDeTexto, htmlDoDoc, ricoValido, sanear, type DocRico } from "../../src/shared/docRico";
import { ler } from "../../src/shared/textoRico";

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

/** Versão em texto simples do documento (parte text/plain do e-mail). */
export function textoSimplesDoDoc(doc: DocRico): string {
  return (doc.content as No[]).map(blocoTexto).filter((x) => x.trim()).join("\n\n");
}

/** HTML do documento para o corpo do e-mail (saneado; estilos na linha, porque programas de e-mail ignoram classes). */
export function htmlDoEmail(doc: DocRico): string {
  return htmlDoDoc(doc)
    .replace(/<p(?=[ >])/g, '<p style="margin:0 0 12px 0;"')
    .replace(/<h([234])(?=[ >])/g, '<h$1 style="margin:16px 0 8px 0;font-size:17px;line-height:24px;color:#0D1C42;"')
    .replace(/<(ul|ol)(?=[ >])/g, '<$1 style="margin:0 0 12px 0;padding-left:22px;"')
    .replace(/<a /g, '<a style="color:#0B6F68;" ');
}
