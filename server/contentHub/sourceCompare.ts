/**
 * SQIE fase 3: junta a comparação de conteúdo (sourceDiff) com o banco. Lê os trechos e as evidências,
 * compara, calcula o impacto por afirmação e grava (ch_worker_record_source_diff).
 */
import type { ContentDb } from "./infra";
import { claimImpacts, diffPassages, type ClaimImpact, type EvidenceRef, type Passage, type SourceDiff } from "./sourceDiff";

const RANK = { NO_IMPACT: 0, COMMENT_ONLY: 1, UNDETERMINED: 2 } as const;

/** Uma afirmação pode ter várias evidências na fonte: vale a pior mudança. */
export function worstPerClaim(impacts: ClaimImpact[]): ClaimImpact[] {
  const best = new Map<string, ClaimImpact>();
  for (const i of impacts) {
    const cur = best.get(i.claimId);
    if (!cur || RANK[i.level] > RANK[cur.level] || (RANK[i.level] === RANK[cur.level] && i.critical && !cur.critical)) best.set(i.claimId, i);
  }
  return [...best.values()];
}

interface Recorded { diff_id: string; items: number; updates_triaged: number }

async function record(db: ContentDb, args: { sourceId: string; newSourceId?: string | null; origin: "version" | "snapshot"; oldHash?: string | null; newHash?: string | null; diff: SourceDiff; impacts: ClaimImpact[] }) {
  return db.service<Recorded>("ch_worker_record_source_diff", {
    p_diff: {
      source_id: args.sourceId,
      new_source_id: args.newSourceId ?? null,
      origin: args.origin,
      old_hash: args.oldHash ?? null,
      new_hash: args.newHash ?? null,
      summary: args.diff.summary,
      items: args.diff.items.map((i) => ({ kind: i.kind, change_type: i.changeType, old_values: i.oldValues, new_values: i.newValues, section: i.section, old_text: i.oldText, new_text: i.newText, similarity: i.similarity, critical: i.critical })),
      impacts: worstPerClaim(args.impacts).map((i) => ({ claim_id: i.claimId, level: i.level, critical: i.critical, kind: i.kind, item_index: i.itemIndex, reason: i.reason })),
    },
  });
}

const evidenceOf = async (db: ContentDb, sourceId: string): Promise<EvidenceRef[]> =>
  (await db.service<{ evidence_id: string; claim_id: string; passage_id: string | null; quote: string }[]>("ch_worker_source_evidence", { p_source_id: sourceId })).map((e) => ({
    evidenceId: e.evidence_id, claimId: e.claim_id, passageId: e.passage_id, quote: e.quote,
  }));

/** Duas versões cadastradas (a antiga já substituída): compara os trechos completos de cada uma. */
export async function compareSourceVersions(db: ContentDb, oldSourceId: string, newSourceId: string) {
  const [oldP, newP, evidence] = await Promise.all([
    db.service<Passage[]>("ch_worker_source_passages", { p_source_id: oldSourceId }),
    db.service<Passage[]>("ch_worker_source_passages", { p_source_id: newSourceId }),
    evidenceOf(db, oldSourceId),
  ]);
  if (!oldP.length || !newP.length) throw new Error("As duas versões precisam ter os trechos do documento completo cadastrados para comparar.");
  const diff = diffPassages(oldP, newP);
  const impacts = claimImpacts(evidence, oldP, diff);
  const recorded = await record(db, { sourceId: oldSourceId, newSourceId, origin: "version", diff, impacts });
  return { ...recorded, summary: diff.summary, claims: worstPerClaim(impacts).length };
}

/** Mesma publicação em duas conferências do vigia (HTML ou texto): compara o que o worker leu antes com o que leu agora. */
export async function compareSnapshots(db: ContentDb, sourceId: string, before: Passage[], after: Passage[], hashes: { old?: string | null; new?: string | null } = {}) {
  const diff = diffPassages(before, after);
  const impacts = claimImpacts(await evidenceOf(db, sourceId), before, diff);
  const recorded = await record(db, { sourceId, origin: "snapshot", oldHash: hashes.old, newHash: hashes.new, diff, impacts });
  return { ...recorded, summary: diff.summary, claims: worstPerClaim(impacts).length };
}
