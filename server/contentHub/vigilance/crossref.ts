/**
 * Vigilância científica: retratação pelo Crossref (API pública, SEM chave). Uma consulta por DOI, com User-Agent e mailto de
 * contato (boa prática do Crossref). Só lê o campo "updated-by" (avisos ligados ao artigo pela editora ou pelo Retraction Watch):
 *   retraction / withdrawal / removal → retratada (bloqueia);
 *   expression_of_concern / partial_retraction → alerta (baixa a nota, não bloqueia);
 *   correction / erratum / ... → só registro.
 * Nada da resposta é interpretado como ordem; texto cortado e limpo. Resposta guardada nos testes: src/__tests__/fixtures/vigilancia.
 */
import { cleanField } from "./pageFacts";

export const CROSSREF_CONTACT = "suporte@staziamed.com.br";
export const CROSSREF_UA = `StaziaMed-Vigilancia/1.0 (mailto:${CROSSREF_CONTACT})`;
const SELECT = "DOI,title,type,publisher,container-title,published,update-to,updated-by,relation,update-policy";

export function crossrefUrl(doi: string): string {
  return `https://api.crossref.org/works?filter=doi:${encodeURIComponent(doi)}&select=${SELECT}&mailto=${encodeURIComponent(CROSSREF_CONTACT)}`;
}

export interface CrossrefReport {
  status: "ok" | "retratada" | "nao_encontrado" | "erro";
  titulo?: string | null;
  retracao?: { data: string | null; doi: string | null; rotulo: string | null; origem: string | null };
  alertas?: { tipo: string; rotulo: string | null; data: string | null; doi: string | null; origem: string | null }[];
  erro?: string;
}

const RETRACTION = new Set(["retraction", "withdrawal", "removal"]);
const ALERT = new Set(["expression_of_concern", "partial_retraction", "correction", "erratum", "corrigendum", "addendum", "clarification"]);

const dateOf = (u: any): string | null => {
  const p = u?.updated?.["date-parts"]?.[0];
  if (Array.isArray(p) && p.length >= 1 && Number.isInteger(p[0])) {
    const [y, m = 1, d = 1] = p as number[];
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const t = typeof u?.updated?.["date-time"] === "string" ? u.updated["date-time"].slice(0, 10) : null;
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};

/** Lê a resposta do Crossref para o DOI pedido (só o item com o MESMO DOI conta). */
export function parseCrossref(body: unknown, doi: string): CrossrefReport {
  const msg = (body as any)?.message;
  if ((body as any)?.status !== "ok" || !msg) return { status: "erro", erro: "Resposta do Crossref fora do formato esperado." };
  const items: any[] = Array.isArray(msg.items) ? msg.items : msg.DOI ? [msg] : [];
  const it = items.find((x) => typeof x?.DOI === "string" && x.DOI.toLowerCase() === doi.toLowerCase());
  if (!it) return { status: "nao_encontrado" };
  const updates: any[] = Array.isArray(it["updated-by"]) ? it["updated-by"] : [];
  const pick = (u: any) => ({
    tipo: String(u?.type ?? ""),
    rotulo: cleanField(u?.label, 80),
    data: dateOf(u),
    doi: cleanField(typeof u?.DOI === "string" ? u.DOI.toLowerCase() : null, 300),
    origem: cleanField(u?.source, 60),
  });
  const retractions = updates.filter((u) => RETRACTION.has(String(u?.type))).map(pick);
  const alertas = updates.filter((u) => ALERT.has(String(u?.type))).map(pick).slice(0, 20);
  const titulo = cleanField(Array.isArray(it.title) ? it.title[0] : it.title, 500);
  if (retractions.length) {
    // a data mais confiável é a do Retraction Watch; senão a mais antiga da editora
    const best = retractions.find((r) => r.origem === "retraction-watch") ?? [...retractions].sort((a, b) => String(a.data).localeCompare(String(b.data)))[0];
    return { status: "retratada", titulo, retracao: { data: best.data, doi: best.doi, rotulo: best.rotulo, origem: best.origem }, alertas };
  }
  return { status: "ok", titulo, alertas };
}
