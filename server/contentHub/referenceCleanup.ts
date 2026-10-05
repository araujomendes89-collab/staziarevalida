/**
 * Retirada das referências do LICENCIANTE de um material (nome, marca, @, site, direitos reservados), só quando a licença
 * cadastrada autoriza. Conservadora de propósito: remove apenas o que identifica o licenciante; links oficiais (gov.br,
 * sociedades, periódicos) e citações de fontes clínicas ficam. O original extraído nunca é tocado: o resultado vai para o
 * texto revisado (ou exclui o bloco inteiro quando ele só continha a referência), com prévia, registro e desfazer.
 */
import type { ContentDb } from "./infra";

export interface CleanupBlock {
  id: string;
  page_no: number;
  idx: number;
  type: string;
  status: string;
  text: string | null;
}

export interface CleanupChange {
  block_id: string;
  page: number;
  before: string;
  after: string | null;
  exclude: boolean;
  removed: string[];
}

const strip = (c: string) => c.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Texto sem acento e em minúsculas, com o mapa de cada posição para o texto original. */
function folded(text: string) {
  let out = "";
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = strip(ch).toLowerCase();
    for (let k = 0; k < f.length; k++) map.push(i);
    out += f;
    i += ch.length;
  }
  map.push(text.length);
  return { out, map };
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);

// Padrões genéricos que quase sempre são do licenciante: contatos de rede social e avisos de direitos.
const GENERIC: RegExp[] = [
  /(^|\s)@[\p{L}\p{N}_.]{2,}/gu,
  /©[^\n]*/g,
  /todos os direitos reservados[^\n]*/gi,
  /proibid[ao]s? a (?:reprodu[çc][ãa]o|c[óo]pia|distribui[çc][ãa]o)[^\n]*/gi,
];

function ranges(text: string, terms: string[]): [number, number][] {
  const { out, map } = folded(text);
  const found: [number, number][] = [];
  for (const raw of terms) {
    const t = strip(raw).toLowerCase().trim();
    if (t.length < 3) continue;
    let from = 0;
    for (;;) {
      const at = out.indexOf(t, from);
      if (at < 0) break;
      from = at + t.length;
      if (isWordChar(out[at - 1]) && isWordChar(out[at])) continue;     // dentro de outra palavra
      if (isWordChar(out[at + t.length - 1]) && isWordChar(out[at + t.length])) continue;
      let s = map[at];
      let e = map[at + t.length];
      // dentro de um endereço ou @contato: leva o endereço inteiro
      const token = /\S+/g;
      for (const m of text.matchAll(token)) {
        const ts = m.index!;
        const te = ts + m[0].length;
        if (ts <= s && e <= te && /^(https?:\/\/|www\.|@)|\//i.test(m[0])) {
          s = ts;
          e = te;
        }
      }
      found.push([s, e]);
    }
  }
  for (const re of GENERIC) for (const m of text.matchAll(re)) {
    const lead = m[0].match(/^\s/) ? 1 : 0;
    found.push([m.index! + lead, m.index! + m[0].length]);
  }
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const r of found) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

/** Limpa o que sobra depois de cortar: espaços duplos, parênteses vazios, traços e pontuação soltos nas pontas. */
function tidy(text: string): string {
  return text
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—|·•:;,./]+|[\s\-–—|·•:;,/]+$/g, "")
    .trim();
}

export function cleanBlockText(text: string, terms: string[]): { after: string; removed: string[] } | null {
  const rs = ranges(text, terms);
  if (!rs.length) return null;
  let after = "";
  let at = 0;
  const removed: string[] = [];
  for (const [s, e] of rs) {
    after += text.slice(at, s) + " ";
    removed.push(text.slice(s, e).trim());
    at = e;
  }
  after += text.slice(at);
  let tidied = tidy(after);
  // sobrou "Mais em" / "Siga" depois de tirar o link ou o @: corta a frase pendurada
  if (removed.some((r) => /^(https?:\/\/|www\.|@)/i.test(r))) tidied = tidied.replace(/\s+(?:(?:veja|acesse|siga|visite|confira|mais|saiba)\s+)*(?:em|no|na|pelo|pela)\s*$|\s+(?:veja|acesse|siga|visite|confira)\s*$/i, "");
  return { after: tidied, removed };
}

/** O que sobraria só tem a referência? Sem letras suficientes, o bloco inteiro é do licenciante. */
const onlyReference = (after: string) => (after.match(/[\p{L}\p{N}]/gu) ?? []).length < 4;

export function planCleanup(blocks: CleanupBlock[], terms: string[]): CleanupChange[] {
  const changes: CleanupChange[] = [];
  for (const b of blocks) {
    if (b.status !== "extracted" || !b.text) continue;
    const r = cleanBlockText(b.text, terms);
    if (!r) continue;
    const exclude = onlyReference(r.after);
    changes.push({ block_id: b.id, page: b.page_no, before: b.text, after: exclude ? null : r.after, exclude, removed: [...new Set(r.removed)] });
  }
  return changes;
}

export interface LicenseRow {
  id: string;
  licensor: string;
  reference_terms: string[];
  allows_attribution_removal: boolean;
  expired: boolean;
}

async function load(db: ContentDb, documentId: string) {
  const license = await db.service<LicenseRow | null>("ch_worker_license", { p_document_id: documentId });
  if (!license) throw new Error("Este documento não tem licença cadastrada.");
  if (license.expired) throw new Error("A licença está vencida.");
  if (!license.allows_attribution_removal) throw new Error("A licença cadastrada não autoriza retirar as referências do licenciante.");
  return license;
}

/** Prévia: nada é gravado. */
export async function previewReferenceCleanup(db: ContentDb, documentId: string) {
  const license = await load(db, documentId);
  const blocks = await db.service<CleanupBlock[]>("ch_worker_blocks", { p_document_id: documentId });
  const changes = planCleanup(blocks, license.reference_terms);
  return { license_id: license.id, terms: license.reference_terms, edited: changes.filter((c) => !c.exclude).length, excluded: changes.filter((c) => c.exclude).length, changes };
}

export async function applyReferenceCleanup(db: ContentDb, documentId: string, actor: string) {
  const preview = await previewReferenceCleanup(db, documentId);
  const r = await db.service<{ edited: number; excluded: number; skipped: number }>("ch_worker_apply_reference_cleanup", {
    p_document_id: documentId,
    p_license_id: preview.license_id,
    p_actor: actor,
    p_changes: preview.changes.map((c) => ({ block_id: c.block_id, before: c.before, after: c.after, exclude: c.exclude, removed: c.removed })),
  });
  return { ...r, planned: preview.changes.length };
}

export const undoReferenceCleanup = (db: ContentDb, documentId: string, actor: string) =>
  db.service<{ undone: number; skipped: number }>("ch_worker_undo_reference_cleanup", { p_document_id: documentId, p_actor: actor });
