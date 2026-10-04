/**
 * SQIE fase 3: compara o CONTEÚDO de duas versões de uma fonte (não só o arquivo) e diz, por afirmação,
 * se o trecho que a sustentava mudou. Tudo aqui é determinístico (sem IA): o resultado é triagem para
 * o revisor médico, nunca decisão. Mudança de número, negação ou texto novo vira prioridade; trecho
 * idêntico vira "confirmar a nova versão".
 */

export interface Passage {
  id?: string;
  section?: string | null;
  page?: number | null;
  text: string;
}

export type ChangeKind = "UNCHANGED" | "EDITORIAL" | "MINOR_WORDING" | "NUMERIC" | "NEGATION" | "SUBSTANTIVE" | "REMOVED" | "ADDED";

export interface DiffItem {
  kind: ChangeKind;
  oldIndex: number | null;
  newIndex: number | null;
  similarity: number;
  critical: boolean;
  oldText: string | null;
  newText: string | null;
  section: string | null;
  numbersOld: string[];
  numbersNew: string[];
}

export interface SourceDiff {
  items: DiffItem[];
  summary: Record<ChangeKind, number> & { critical: number };
}

const fold = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Só o conteúdo: sem pontuação nem caixa, para separar "mudou a forma" de "mudou o sentido". */
const content = (t: string) => fold(t).replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ").replace(/[^\p{L}\p{N}%.,/ -]+/gu, " ").replace(/\s+/g, " ").trim();

export function numbersOf(t: string): string[] {
  const out = fold(t).match(/\d+(?:[.,]\d+)?\s*(?:mg\/kg\/dia|mg\/kg|mcg\/kg|mg\/dl|mg|mcg|ug|g\/dl|g|ml|ui|u|meq|mmhg|mmol\/l|%|anos|ano|meses|mes|semanas|semana|dias|dia|horas|hora|h|min|kg|cm|mm)?/g) ?? [];
  const words = fold(t).match(/\b(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|quinhentos|mil)\b/g) ?? [];
  return [...new Set([...out, ...words].map((n) => n.replace(/\s+/g, "").replace(/,/g, ".")))].sort();
}

const NEGATIONS: [string, RegExp][] = [
  ["nao", /\b(nao|nunca|jamais|sem|exceto|dispensa)\b/],
  ["contraindicado", /\bcontraindic\w*/],
  ["proibido", /\b(proibid|vedad)\w*/],
  ["evitar", /\bevit\w*/],
  ["ausencia", /\b(ausencia|exclui\w*)\b/],
];
export function negationsOf(t: string): string[] {
  const f = fold(t);
  return NEGATIONS.filter(([, re]) => re.test(f)).map(([k]) => k).sort();
}

const CRITICAL_WORDS = /\b(dose|doses|mg|mcg|ui|contraindic\w*|interac\w*|intervalo|rastreamento|criterio|via |urgencia|emergencia|esquema|tratamento|conduta)\b/;

const shingles = (t: string, n = 3) => {
  const w = content(t).split(" ").filter(Boolean);
  const set = new Set<string>();
  if (w.length <= n) set.add(w.join(" "));
  for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(" "));
  return set;
};

export function similarity(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const s of A) if (B.has(s)) inter++;
  return inter / (A.size + B.size - inter);
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function classify(oldText: string, newText: string): { kind: ChangeKind; similarity: number } {
  if (fold(oldText) === fold(newText)) return { kind: "UNCHANGED", similarity: 1 };
  if (content(oldText) === content(newText)) return { kind: "EDITORIAL", similarity: 1 };
  const sim = similarity(oldText, newText);
  if (!sameSet(numbersOf(oldText), numbersOf(newText))) return { kind: "NUMERIC", similarity: sim };
  if (!sameSet(negationsOf(oldText), negationsOf(newText))) return { kind: "NEGATION", similarity: sim };
  return { kind: sim >= 0.8 ? "MINOR_WORDING" : "SUBSTANTIVE", similarity: sim };
}

const isCritical = (kind: ChangeKind, oldText: string | null, newText: string | null) =>
  kind === "NUMERIC" || kind === "NEGATION" || ((kind === "REMOVED" || kind === "ADDED" || kind === "SUBSTANTIVE") && CRITICAL_WORDS.test(fold(`${oldText ?? ""} ${newText ?? ""}`)));

const MATCH_MIN = 0.35;

/** Alinha os trechos da versão antiga com os da nova (iguais primeiro, depois os mais parecidos) e classifica cada par. */
export function diffPassages(oldP: Passage[], newP: Passage[]): SourceDiff {
  const pairs = new Map<number, number>();
  const usedNew = new Set<number>();
  const newByFold = new Map<string, number[]>();
  newP.forEach((p, j) => newByFold.set(fold(p.text), [...(newByFold.get(fold(p.text)) ?? []), j]));
  oldP.forEach((p, i) => {
    const j = newByFold.get(fold(p.text))?.find((x) => !usedNew.has(x));
    if (j !== undefined) {
      pairs.set(i, j);
      usedNew.add(j);
    }
  });
  const candidates: { i: number; j: number; s: number }[] = [];
  oldP.forEach((o, i) => {
    if (pairs.has(i)) return;
    newP.forEach((n, j) => {
      if (usedNew.has(j)) return;
      const s = similarity(o.text, n.text);
      if (s >= MATCH_MIN) candidates.push({ i, j, s });
    });
  });
  candidates.sort((a, b) => b.s - a.s);
  for (const c of candidates) {
    if (pairs.has(c.i) || usedNew.has(c.j)) continue;
    pairs.set(c.i, c.j);
    usedNew.add(c.j);
  }

  const items: DiffItem[] = [];
  oldP.forEach((o, i) => {
    const j = pairs.get(i);
    if (j === undefined) {
      items.push({ kind: "REMOVED", oldIndex: i, newIndex: null, similarity: 0, critical: false, oldText: o.text, newText: null, section: o.section ?? null, numbersOld: numbersOf(o.text), numbersNew: [] });
      return;
    }
    const n = newP[j];
    const { kind, similarity: sim } = classify(o.text, n.text);
    items.push({ kind, oldIndex: i, newIndex: j, similarity: Math.round(sim * 1000) / 1000, critical: false, oldText: o.text, newText: n.text, section: n.section ?? o.section ?? null, numbersOld: numbersOf(o.text), numbersNew: numbersOf(n.text) });
  });
  newP.forEach((n, j) => {
    if (!usedNew.has(j)) items.push({ kind: "ADDED", oldIndex: null, newIndex: j, similarity: 0, critical: false, oldText: null, newText: n.text, section: n.section ?? null, numbersOld: [], numbersNew: numbersOf(n.text) });
  });
  for (const it of items) it.critical = isCritical(it.kind, it.oldText, it.newText);

  const summary = { UNCHANGED: 0, EDITORIAL: 0, MINOR_WORDING: 0, NUMERIC: 0, NEGATION: 0, SUBSTANTIVE: 0, REMOVED: 0, ADDED: 0, critical: 0 } as SourceDiff["summary"];
  for (const it of items) {
    summary[it.kind]++;
    if (it.critical) summary.critical++;
  }
  return { items, summary };
}

/** Parágrafos legíveis de uma página HTML ou de um texto simples (o que o vigia compara entre uma conferência e outra). */
export function snapshotPassages(body: string, contentType = ""): Passage[] {
  const isHtml = /html/i.test(contentType) || /<\/?(p|div|li|h\d|body|html)\b/i.test(body);
  const text = isHtml
    ? body
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ")
        .replace(/<\/(p|div|li|h\d|tr|section|article|nav|header|footer|ul|ol|table|br)>|<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
    : body;
  return text
    .split(/\n{1,}/)
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length >= 40)
    .map((t) => ({ text: t }));
}

export type ImpactLevel = "NO_IMPACT" | "COMMENT_ONLY" | "UNDETERMINED";

export interface ClaimImpact {
  claimId: string;
  evidenceId: string;
  level: ImpactLevel;
  critical: boolean;
  kind: ChangeKind | "NOT_LOCATED";
  itemIndex: number | null;
  reason: string;
}

export interface EvidenceRef {
  evidenceId: string;
  claimId: string;
  passageId?: string | null;
  quote: string;
}

const KIND_TEXT: Record<ChangeKind | "NOT_LOCATED", string> = {
  UNCHANGED: "o trecho que sustentava a afirmação está idêntico na nova versão (confirmar a vigência da nova versão)",
  EDITORIAL: "o trecho mudou só de forma (pontuação, caixa ou espaçamento), sem mudar números ou sentido",
  MINOR_WORDING: "o trecho teve pequenas mudanças de redação, sem mudança de números ou negações",
  NUMERIC: "os números do trecho mudaram (dose, prazo, valor ou intervalo): reanálise obrigatória",
  NEGATION: "uma negação ou restrição do trecho mudou: reanálise obrigatória",
  SUBSTANTIVE: "o trecho foi reescrito de forma relevante: reanálise obrigatória",
  REMOVED: "o trecho que sustentava a afirmação não existe mais na nova versão: reanálise obrigatória",
  ADDED: "trecho novo",
  NOT_LOCATED: "a evidência não foi localizada no texto comparado: reanálise obrigatória (não dá para afirmar que não mudou)",
};

/**
 * Para cada evidência da fonte antiga, acha o trecho antigo que a contém (por id do trecho ou pelo texto citado)
 * e traduz a mudança desse trecho em impacto. Não localizou → impacto indeterminado, nunca "sem impacto".
 */
export function claimImpacts(evidence: EvidenceRef[], oldP: Passage[], diff: SourceDiff): ClaimImpact[] {
  const byOld = new Map<number, number>();
  diff.items.forEach((it, idx) => {
    if (it.oldIndex !== null) byOld.set(it.oldIndex, idx);
  });
  return evidence.map((e) => {
    let oldIdx = e.passageId ? oldP.findIndex((p) => p.id === e.passageId) : -1;
    if (oldIdx < 0) {
      const q = content(e.quote);
      oldIdx = q ? oldP.findIndex((p) => content(p.text).includes(q)) : -1;
    }
    if (oldIdx < 0) {
      let best = { i: -1, s: 0 };
      oldP.forEach((p, i) => {
        const s = similarity(e.quote, p.text);
        if (s > best.s) best = { i, s };
      });
      if (best.s >= 0.5) oldIdx = best.i;
    }
    const itemIdx = oldIdx >= 0 ? byOld.get(oldIdx) : undefined;
    if (itemIdx === undefined) return { claimId: e.claimId, evidenceId: e.evidenceId, level: "UNDETERMINED", critical: true, kind: "NOT_LOCATED", itemIndex: null, reason: KIND_TEXT.NOT_LOCATED };
    const it = diff.items[itemIdx];
    const level: ImpactLevel = it.kind === "UNCHANGED" || it.kind === "EDITORIAL" ? "NO_IMPACT" : it.kind === "MINOR_WORDING" ? "COMMENT_ONLY" : "UNDETERMINED";
    return { claimId: e.claimId, evidenceId: e.evidenceId, level, critical: it.critical, kind: it.kind, itemIndex: itemIdx, reason: KIND_TEXT[it.kind] };
  });
}
