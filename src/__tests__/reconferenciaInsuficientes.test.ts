// @vitest-environment node
/**
 * CC01 (2026-10-10): afirmação marcada "insuficiente" porque nenhuma fonte cadastrada tinha trecho sobre ela volta a ser
 * conferida
 *   - quando uma fonte nova é indexada (etapa "source_index" de um PDF de referência), sem ninguém precisar apertar nada;
 *   - quando a equipe manda reprocessar a conferência ("Reprocessar" na etapa de evidências).
 * Só voltam as que ficaram sem trecho (sem evidência vigente); as que a conferência já julgou com um trecho ficam como estão.
 *
 * Sem rede: simulação de IA (mock). Os textos são fictícios, feitos só para o teste (não são conteúdo médico).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, localStorageDir, type ContentDb, type Storage } from "../../server/contentHub/infra";
import { MockProvider, type StructuredRequest } from "../../server/contentHub/ai/provider";
import { mockRespond } from "../../server/contentHub/ai/mock";
import { stepVersions, type PipelineDeps } from "../../server/contentHub/pipeline";
import { createContentHubWorker } from "../../server/contentHub/worker";
import type { AuthUser } from "../../src/novo/data/backend";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reconferencia-"));
let dev: DevDatabase;
let db: ContentDb;
let storage: Storage;
let admin: AuthUser;
let manualSource: string;

const sql = async <T = any>(q: string, params: unknown[] = []) => (await dev.db.query<T>(q, params)).rows;
/** Gerador de arquivos falso (nenhum arquivo): o processamento segue até o fim sem Chromium. */
const renderer = { templateVersion: "t1", brandVersion: "b1", render: async () => [] } as any;
let answer: (req: StructuredRequest) => unknown = mockRespond;
const deps = (): PipelineDeps => {
  const provider = new MockProvider((req) => answer(req));
  return { db, storage, ai: { provider, status: { ready: true, provider: "mock", model: provider.model, isMock: true, pending: null } }, renderer };
};
const drain = () => createContentHubWorker(deps()).drain();

// frases fictícias sem nenhuma palavra em comum entre si (a busca por palavras de uma não acha o trecho da outra)
const S1 = "Alfateste deve ser iniciado quando Betateste superar 37 pontos.";
const S2 = "Gamateste deve ser suspenso quando Deltateste cair abaixo de 41 graus.";
const S3 = "Epsilonteste deve ser repetido quando Zetateste mostrar 53 sinais.";
// a fonte traz outro número (com unidade, que a conferência compara): a conferência julga "insuficiente" COM o trecho
const S4 = "Kapateste deve ser medido quando Lambdateste ultrapassar 61%.";
const S4_FONTE = "Kapateste deve ser medido quando Lambdateste ultrapassar 62%.";

async function registerDoc(name: string) {
  const bytes = Buffer.from(`%PDF-1.7 ${name}`);
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  const key = `documents/${sha}.pdf`;
  await storage.put(key, bytes, "application/pdf");
  return (await db.asUser<{ id: string }>(admin, "app_ch_register_document", { p_doc: { name, sha256: sha, storage_path: key, rights_status: "own" } })).id;
}

/** Material de estudo com uma frase: extração pronta, processamento do começo (classificação) ao fim. */
async function studyDocument(name: string, sentence: string) {
  const id = await registerDoc(name);
  await db.service("ch_worker_save_extraction", {
    p_document_id: id,
    p_text_kind: "text",
    p_pages: [{ page_no: 1, kind: "text", width: 595, height: 842 }],
    p_blocks: [
      { page_no: 1, idx: 0, type: "heading", text: `Capítulo fictício ${name}`, bbox: [0, 0, 1, 1] },
      { page_no: 1, idx: 1, type: "paragraph", text: `Texto fictício de teste. ${sentence}`, bbox: [0, 0, 1, 1] },
    ],
  });
  await db.service("ch_worker_next", { p_document_id: id, p_step: "classify", p_versions: stepVersions("classify", deps()) });
  await drain();
  return id;
}

/** PDF de referência com uma frase: fonte cadastrada, PDF vinculado e indexado (etapa source_index). */
async function indexSource(name: string, sentence: string) {
  const id = await registerDoc(name);
  await sql(`update public.ch_documents set purpose = 'reference_source' where id = $1`, [id]);
  await db.service("ch_worker_save_extraction", {
    p_document_id: id,
    p_text_kind: "text",
    p_pages: [{ page_no: 1, kind: "text" }],
    p_blocks: [
      { page_no: 1, idx: 0, type: "heading", text: "Recomendações fictícias", bbox: [0, 0, 1, 1] },
      { page_no: 1, idx: 1, type: "paragraph", text: `Texto fictício de teste. ${sentence}`, bbox: [0, 0, 1, 1] },
    ],
  });
  const src = await db.asUser<{ id: string }>(admin, "app_ch_register_source", { p_source: { title: name, organ: "Órgão fictício", version: "1", published_on: "2026-01-01" } });
  await db.asUser(admin, "app_ch_attach_source_document", { p_source_id: src.id, p_document_id: id });
  await db.service("ch_worker_next", { p_document_id: id, p_step: "source_index", p_versions: {} });
  await drain();
  return { documentId: id, sourceId: src.id };
}

const claimOf = async (doc: string) => {
  const [c] = await sql(`select id, statement, status from public.ch_claims where document_id = $1`, [doc]);
  return c;
};
const evidenceOf = async (claim: string) => sql(`select source_id, verdict, stale from public.ch_evidence where claim_id = $1 order by created_at`, [claim]);
const evidenceJob = async (doc: string) => (await sql(`select id, status, metrics from public.ch_jobs where document_id = $1 and step = 'evidence'`, [doc]))[0];

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  storage = localStorageDir(path.join(tmp, "files"));
  admin = await dev.core.createAccount("Admin Teste", "admin@reconferencia.local", "senha-forte-123", true);
  // fonte cadastrada à mão (trechos colados no painel): não é indexação de PDF
  manualSource = (await db.asUser<{ id: string }>(admin, "app_ch_register_source", { p_source: { title: "Fonte fictícia manual", organ: "Órgão fictício", version: "1", published_on: "2026-01-01" } })).id;
}, 300_000);

afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("CC01: afirmação insuficiente por falta de trecho volta a ser conferida", () => {
  let judgedDoc: string;
  let judgedClaim: string;

  it("julgada com um trecho (insuficiente com evidência) fica como está ao reprocessar", async () => {
    await db.asUser(admin, "app_ch_add_passage", { p_source_id: manualSource, p_passage: { section: "Fictícia", page: 1, text: `Texto fictício de teste. ${S4_FONTE}` } });
    judgedDoc = await studyDocument("Apostila julgada", S4);
    const claim = await claimOf(judgedDoc);
    judgedClaim = claim.id;
    expect(claim.status).toBe("insufficient");
    expect(await evidenceOf(claim.id)).toEqual([{ source_id: manualSource, verdict: "insufficient", stale: false }]);

    const job = await evidenceJob(judgedDoc);
    await db.asUser(admin, "app_ch_retry_job", { p_job_id: job.id });
    await drain();
    expect((await claimOf(judgedDoc)).status).toBe("insufficient");
    expect(await evidenceOf(claim.id)).toHaveLength(1);
    expect((await evidenceJob(judgedDoc)).metrics.claims_checked).toBe(0);
  }, 240_000);

  it("fonte nova indexada: a afirmação que estava sem trecho é conferida de novo sozinha", async () => {
    const doc = await studyDocument("Apostila sem fonte", S1);
    let claim = await claimOf(doc);
    expect(claim.status).toBe("insufficient");
    expect(await evidenceOf(claim.id)).toEqual([]);
    expect((await evidenceJob(doc)).status).toBe("succeeded");

    const { documentId, sourceId } = await indexSource("Manual fictício novo", S1);
    const [index] = await sql(`select status, metrics from public.ch_jobs where document_id = $1 and step = 'source_index'`, [documentId]);
    expect(index.status).toBe("succeeded");
    // só o documento com afirmação sem trecho volta para a conferência (a julgada com trecho, não)
    expect(index.metrics.recheck_documents).toBe(1);

    claim = await claimOf(doc);
    expect(claim.status).toBe("compatible");
    expect(await evidenceOf(claim.id)).toEqual([{ source_id: sourceId, verdict: "compatible", stale: false }]);
    expect((await evidenceJob(doc)).metrics).toMatchObject({ claims_checked: 1, rechecked: 1 });
    expect((await claimOf(judgedDoc)).status).toBe("insufficient");
    expect(await evidenceOf(judgedClaim)).toHaveLength(1);
  }, 240_000);

  it("Reprocessar a conferência: a afirmação que estava sem trecho é conferida de novo", async () => {
    const doc = await studyDocument("Apostila reprocessada", S2);
    let claim = await claimOf(doc);
    expect(claim.status).toBe("insufficient");

    // trecho colado à mão no painel: não é indexação, a conferência só volta quando a equipe manda
    await db.asUser(admin, "app_ch_add_passage", { p_source_id: manualSource, p_passage: { section: "Fictícia", page: 2, text: `Texto fictício de teste. ${S2}` } });
    expect((await claimOf(doc)).status).toBe("insufficient");

    const job = await evidenceJob(doc);
    await db.asUser(admin, "app_ch_retry_job", { p_job_id: job.id });
    await drain();
    claim = await claimOf(doc);
    expect(claim.status).toBe("compatible");
    expect(await evidenceOf(claim.id)).toEqual([{ source_id: manualSource, verdict: "compatible", stale: false }]);
  }, 240_000);

  it("ainda sem trecho: continua insuficiente, sem repetir a anotação no histórico", async () => {
    const doc = await studyDocument("Apostila ainda sem fonte", "Mutesteum deve ser pesado quando Nutesteum exceder 71 gramas.");
    const claim = await claimOf(doc);
    expect(claim.status).toBe("insufficient");
    const notes = async () => (await sql(`select 1 from public.ch_claim_history where claim_id = $1 and event = 'worker_note'`, [claim.id])).length;
    expect(await notes()).toBe(1);
    await db.asUser(admin, "app_ch_retry_job", { p_job_id: (await evidenceJob(doc)).id });
    await drain();
    expect((await claimOf(doc)).status).toBe("insufficient");
    expect(await notes()).toBe(1);
    expect((await evidenceJob(doc)).metrics).toMatchObject({ claims_checked: 1, rechecked: 1, verdicts: { still_no_passage: 1 } });
  }, 240_000);

  it("trecho achado mas a evidência proposta é recusada: a afirmação vai para revisão humana", async () => {
    const doc = await studyDocument("Apostila recusada", S3);
    expect((await claimOf(doc)).status).toBe("insufficient");
    await db.asUser(admin, "app_ch_add_passage", { p_source_id: manualSource, p_passage: { section: "Fictícia", page: 3, text: `Texto fictício de teste. ${S3}` } });
    // a IA "cita" uma frase que não está no trecho: a conferência por software recusa
    answer = (req) => {
      if (req.promptId !== "evidence") return mockRespond(req);
      const p = JSON.parse(req.input.match(/<documento>\n([\s\S]*)\n<\/documento>/)![1]);
      return { verdict: "compatible", passage_id: p.trechos[0].passage_id, quote: "Frase que não existe no trecho da fonte.", rationale: "teste" };
    };
    try {
      await db.asUser(admin, "app_ch_retry_job", { p_job_id: (await evidenceJob(doc)).id });
      await drain();
    } finally {
      answer = mockRespond;
    }
    const claim = await claimOf(doc);
    expect(claim.status).toBe("needs_review");
    const [last] = await sql(`select details from public.ch_claim_history where claim_id = $1 and event = 'worker_note' order by id desc limit 1`, [claim.id]);
    expect(last.details.note).toMatch(/recusada pela conferência/);
  }, 240_000);

  it("documento com falha não volta sozinho para a fila quando entra fonte nova", async () => {
    const doc = await studyDocument("Apostila com falha", "Omicronteste deve ser lavado quando Pitesteum perder 83 camadas.");
    expect((await claimOf(doc)).status).toBe("insufficient");
    await sql(`update public.ch_documents set status = 'failed' where id = $1`, [doc]);
    const [before] = await sql(`select status, finished_at, metrics from public.ch_jobs where document_id = $1 and step = 'evidence'`, [doc]);
    const { documentId } = await indexSource("Manual fictício da falha", "Omicronteste deve ser lavado quando Pitesteum perder 83 camadas.");
    const [index] = await sql(`select status from public.ch_jobs where document_id = $1 and step = 'source_index'`, [documentId]);
    expect(index.status).toBe("succeeded");
    expect((await claimOf(doc)).status).toBe("insufficient");
    const [after] = await sql(`select status, finished_at, metrics from public.ch_jobs where document_id = $1 and step = 'evidence'`, [doc]);
    expect(after).toEqual(before);
  }, 240_000);

  it("as funções novas e redefinidas continuam só do servidor (nem a equipe chama direto)", async () => {
    const id = crypto.randomUUID();
    for (const call of [
      `select public.ch_worker_recheck_insufficient('{}'::jsonb)`,
      `select public.ch_worker_claims('${id}'::uuid)`,
      `select public.ch_worker_mark_claim('${id}'::uuid, 'insufficient', 'x')`,
    ]) {
      for (const role of ["authenticated", "anon"]) {
        const attempt = dev.db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          await tx.query(call);
        });
        await expect(attempt, `${role}: ${call}`).rejects.toThrow(/permission denied/);
      }
    }
  });

  it("banco sem a atualização 8200: indexar a fonte continua funcionando e a etapa anota o que falta", async () => {
    const MIGRATION = fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/20261003008200_reconferir_insuficientes.sql"), "utf8");
    await dev.db.exec(`drop function public.ch_worker_recheck_insufficient(jsonb)`);
    try {
      const { documentId } = await indexSource("Manual fictício banco antigo", "Rhotesteum deve ser guardado quando Sigmatesteum somar 97 caixas.");
      const [index] = await sql(`select status, metrics from public.ch_jobs where document_id = $1 and step = 'source_index'`, [documentId]);
      expect(index.status).toBe("succeeded");
      expect(index.metrics.recheck_error).toBe("Falta aplicar no Supabase a atualização da reconferência das afirmações sem trecho (migração 8200).");
    } finally {
      await dev.db.exec(MIGRATION);
    }
  }, 240_000);
});
