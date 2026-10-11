// @vitest-environment node
/**
 * CC01 (2026-10-10): afirmação marcada "insuficiente" porque nenhuma fonte cadastrada tinha trecho sobre ela volta a ser
 * conferida
 *   - quando uma fonte nova é indexada (etapa "source_index" de um PDF de referência), sem ninguém precisar apertar nada;
 *   - quando a equipe manda reprocessar a conferência ("Reprocessar" na etapa de evidências).
 * Voltam as que só a IA julgou: sem evidência vigente (nenhum trecho achado) ou só com evidência "insuficiente" dada pelo
 * processamento (a IA pode ter comparado com um trecho de outro assunto). A que tem evidência dada pela equipe fica como está.
 *
 * Rodada de correção 1: a reconferência automática só roda para fonte que entra na busca e só segue para o rascunho quando alguma
 * afirmação passa a ser compatível, e só no tema dela: tema que já tem unidade não ganha versão nova sozinho (recebe um aviso);
 * materiais e revisão automática só nas versões novas. O rascunho nunca mexe em versão fora do rascunho nem cria versão nova
 * com o texto antigo da IA.
 *
 * Rodada de correção 2: a reconferência automática não entra no meio de uma reexecução pedida pela equipe (e a etapa anterior
 * que acha a reconferência na fila tira a marca dela), só deixa parcial a etapa que já tinha terminado inteira, e a falha ou a
 * pendência dela não muda a situação do documento.
 *
 * Rodada de correção 3: duas execuções do processamento ao mesmo tempo (o agendador dispara a tarefa do Cloud Run a cada 10
 * minutos e cada execução pega trabalho por até 50). O pedido para uma etapa que está rodando em outro processamento fica
 * guardado e vale quando ela termina; e a proteção da reconferência automática não depende mais de ch_worker_claim, que o ramo
 * montagem-estacoes (5900) recria.
 *
 * Rodada de correção 4: a conferência dá sinal de vida a cada afirmação (uma conferência longa não é pega de novo por outra
 * execução da tarefa enquanto ainda roda), e o trabalho tem dono: o processamento que ficou sem sinal e perdeu o trabalho para
 * sem gravar e sem registrar o fim; quem pegou o trabalho continua do ponto salvo.
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
import { AiCapReached } from "../../server/ai/maestro";
import { runJob, stepVersions, type Job, type PipelineDeps } from "../../server/contentHub/pipeline";
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
/** Outro nome de modelo para a simulação (como se o dono trocasse a IA na Central de IAs); null = o de sempre. */
let model: string | null = null;
const deps = (): PipelineDeps => {
  const provider = new MockProvider((req) => answer(req));
  if (model) Object.defineProperty(provider, "model", { value: model });
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
// julgada por uma pessoa da equipe
const S5 = "Tauteste deve ser aferido quando Upsilonteste passar de 19 etiquetas.";
// trecho de outro assunto que a busca por palavras acha por um termo comum ("pacientes")
const OUTRO_ASSUNTO = "Pacientes fictícios recebem uma senha impressa.";
// o número com unidade é comparado pela conferência: o trecho de outro assunto não o tem, então a IA julga "insuficiente"
const S7 = "Fiteste deve ser trocado quando 29% dos pacientes reunirem cupons.";
// rascunho e reconferência automática
const SA1 = "Quiloteste deve ser girado quando Lambdateste marcar 47 voltas.";
const SA2 = "Miteste deve ser dobrado quando Niteste alcançar 59 folhas.";
const SEM_RELACAO = "Xiteste deve ser polido quando Omiteste exibir 67 brilhos.";
const SB1 = "Piteste deve ser lixado quando Riteste completar 71 lascas.";
const SB2 = "Siteste deve ser colado quando Titeste revelar 73 riscos.";
const SB3 = "Uiteste deve ser pintado quando Viteste acumular 79 manchas.";
const SB4 = "Wuteste deve ser regado quando Xuteste medir 89 gotas.";
const SB5 = "Yuteste deve ser podado quando Zuteste somar 97 galhos.";
const SC = "Ziteste deve ser varrido quando Ypsiteste tocar 83 sinos.";
// rodada de correção 2 (cada frase com palavras só dela)
const SD1 = "Etateste deve ser afinado quando Iotateste emitir 43 apitos.";
const SD2 = "Psiteste deve ser escovado quando Chiteste soltar 31 faiscas.";
const SE1 = "Hetateste deve ser afiado quando Joteste piscar 23 luzes.";
const SF1 = "Qopateste deve ser amarrado quando Sampiteste vibrar 17 cordas.";
const SG1 = "Digamateste deve ser coado quando Heteste ferver 13 bolhas.";
const SG2 = "Stigmateste deve ser peneirado quando Koppateste reter 11 graos.";
const SH1 = "Santeste deve ser enrolado quando Vauteste trancar 7 novelos.";
const SH2 = "Zayinteste deve ser dosado quando Lamedteste atingir 15%.";
const SH2_FONTE = "Zayinteste deve ser dosado quando Lamedteste atingir 16%.";
const SI1 = "Yodteste deve ser carimbado quando Hethteste juntar 3 selos.";
const SJ1 = "Shinteste deve ser lacrado quando Tsadeteste encher 9 frascos.";
// rodada de correção 3 (cada frase com palavras só dela)
const SK1 = "Alefteste deve ser costurado quando Betteste prender 5 botoes.";
const SL1 = "Kafteste deve ser ensacado quando Memteste empilhar 25 sacos.";
const SN1 = "Nunteste deve ser rotulado quando Samekhteste contar 27 potes.";
const SN2 = "Ainteste deve ser selado quando Peteste guardar 33 tampas.";
// rodada de correção 4 (cada frase com palavras só dela)
const SP1 = "Orvateste deve ser esticado quando Pinheteste projetar 103 nuvens.";
const SP2 = "Quartzteste deve ser embrulhado quando Rubiteste farejar 107 trilhas.";
const SP3 = "Safirteste deve ser lustrado quando Topazteste rodear 109 postes.";
const SQ1 = "Turmalinateste deve ser soprado quando Jadeteste pescar 113 peixes.";
const SQ2 = "Onixteste deve ser tingido quando Opalateste quebrar 127 nozes.";
/** Parágrafo sem afirmação que separa as seções (a classificação simulada liga cada seção só ao tema do seu título). */
const FILLER = "Texto fictício de preenchimento para separar as seções do teste. ".repeat(26).trim();

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

/** PDF de referência com uma frase: fonte cadastrada, PDF vinculado e indexado (etapa source_index). Sem `drain`, só entra na fila. */
async function indexSource(name: string, sentence: string, kind = "final", opts: { drain?: boolean } = {}) {
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
  const src = await db.asUser<{ id: string }>(admin, "app_ch_register_source", { p_source: { title: name, organ: "Órgão fictício", kind, version: "1", published_on: "2026-01-01" } });
  await db.asUser(admin, "app_ch_attach_source_document", { p_source_id: src.id, p_document_id: id });
  await db.service("ch_worker_next", { p_document_id: id, p_step: "source_index", p_versions: {} });
  if (opts.drain !== false) await drain();
  return { documentId: id, sourceId: src.id };
}

/** Trecho colado à mão na fonte manual (não é indexação de PDF: não dispara a reconferência). */
const addPassage = (page: number, sentence: string) =>
  db.asUser(admin, "app_ch_add_passage", { p_source_id: manualSource, p_passage: { section: "Fictícia", page, text: `Texto fictício de teste. ${sentence}` } });

/** Tema fictício novo no catálogo publicado (a classificação simulada liga o bloco ao tema pelo nome do título). */
async function fictitiousTheme(name: string) {
  const [sub] = await sql(
    `select n.id, n.version_id from public.ch_taxonomy_nodes n join public.ch_taxonomy_versions v on v.id = n.version_id
      where v.status = 'published' and n.level = 'subarea' and n.status = 'active' order by n.name limit 1`
  );
  const [t] = await sql(`insert into public.ch_taxonomy_nodes (version_id, parent_id, level, name) values ($1, $2, 'theme', $3) returning id`, [sub.version_id, sub.id, name]);
  return t.id as string;
}

/** Material de estudo com seções: cada seção tem o título (nome do tema fictício) e as frases dela. */
async function themedDocument(name: string, sections: { heading: string; sentences: string[] }[]) {
  const id = await registerDoc(name);
  await db.service("ch_worker_save_extraction", {
    p_document_id: id,
    p_text_kind: "text",
    p_pages: [{ page_no: 1, kind: "text", width: 595, height: 842 }],
    p_blocks: sections.flatMap((s, k) => [
      { page_no: 1, idx: 3 * k, type: "heading", text: s.heading, bbox: [0, 0, 1, 1] },
      { page_no: 1, idx: 3 * k + 1, type: "paragraph", text: `Texto fictício de teste. ${s.sentences.join(" ")}`, bbox: [0, 0, 1, 1] },
      { page_no: 1, idx: 3 * k + 2, type: "paragraph", text: FILLER, bbox: [0, 0, 1, 1] },
    ]),
  });
  await db.service("ch_worker_next", { p_document_id: id, p_step: "classify", p_versions: stepVersions("classify", deps()) });
  await drain();
  return id;
}

/** A revisão automática (simulada) aponta um problema em cada versão que confere. */
const REVIEW_ISSUE = { severity: "major", kind: "other", where: "Conceitos essenciais §1", detail: "Apontamento fictício da revisão automática (teste)." };
const withReviewIssue = (req: StructuredRequest) => (req.promptId === "review" ? { issues: [REVIEW_ISSUE] } : mockRespond(req));

const claimOf = async (doc: string) => {
  const [c] = await sql(`select id, statement, status from public.ch_claims where document_id = $1`, [doc]);
  return c;
};
const claimBy = async (doc: string, sentence: string) => (await sql(`select id, status from public.ch_claims where document_id = $1 and statement = $2`, [doc, sentence]))[0];
const evidenceOf = async (claim: string) => sql(`select source_id, verdict, stale from public.ch_evidence where claim_id = $1 order by created_at`, [claim]);
/** O trabalho mais novo da etapa (trocar o modelo cria outro trabalho da mesma etapa). */
const stepJob = async (doc: string, step: string) =>
  (await sql(`select id, status, finished_at, metrics from public.ch_jobs where document_id = $1 and step = $2 order by created_at desc limit 1`, [doc, step]))[0];
const evidenceJob = async (doc: string) => stepJob(doc, "evidence");
const versionsOf = async (theme: string) =>
  sql(`select v.id, v.version, v.status, v.content, v.review_flags, v.generated_by_model from public.ch_unit_versions v join public.ch_units u on u.id = v.unit_id
        where u.theme_node_id = $1 order by v.version`, [theme]);
const aiFlags = (v: any) => (v.review_flags ?? []).filter((f: any) => f.by === "ai_review");
/** O trabalho como está no banco (sem depender das colunas que existem). */
const jobRow = async (id: string) => (await sql(`select to_jsonb(j) as j from public.ch_jobs j where j.id = $1`, [id]))[0].j;
/** Outro processamento pega ESTE trabalho (como ch_worker_claim faz, mas sem escolher outro da fila). */
const claimJob = async (id: string) =>
  (
    await sql(
      `update public.ch_jobs as j set status = 'running', attempts = j.attempts + 1, locked_at = now(), started_at = coalesce(j.started_at, now())
        where j.id = $1 and j.status = 'queued' returning to_jsonb(j) as job`,
      [id]
    )
  )[0].job as Job;

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

  it("julgada pela IA com um trecho: ao reprocessar é conferida de novo e, com a mesma resposta, nada se repete", async () => {
    await addPassage(1, S4_FONTE);
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
    expect((await evidenceJob(judgedDoc)).metrics).toMatchObject({ claims_checked: 1, rechecked: 1, verdicts: { unchanged: 1 } });
  }, 240_000);

  it("julgada por uma pessoa da equipe (evidência dela) fica como está ao reprocessar", async () => {
    const doc = await studyDocument("Apostila julgada pela equipe", S5);
    const claim = await claimOf(doc);
    expect(claim.status).toBe("insufficient");
    await db.asUser(admin, "app_ch_link_evidence", { p_claim_id: claim.id, p_evidence: { source_id: manualSource, page: 1, quote: "Texto fictício de teste.", verdict: "insufficient" } });
    await db.asUser(admin, "app_ch_retry_job", { p_job_id: (await evidenceJob(doc)).id });
    await drain();
    expect((await claimOf(doc)).status).toBe("insufficient");
    expect(await evidenceOf(claim.id)).toEqual([{ source_id: manualSource, verdict: "insufficient", stale: false }]);
    expect((await evidenceJob(doc)).metrics.claims_checked).toBe(0);
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
    // voltam para a conferência a apostila sem trecho e a julgada pela IA; a julgada pela equipe, não
    expect(index.metrics.recheck_documents).toBe(2);

    claim = await claimOf(doc);
    expect(claim.status).toBe("compatible");
    expect(await evidenceOf(claim.id)).toEqual([{ source_id: sourceId, verdict: "compatible", stale: false }]);
    expect((await evidenceJob(doc)).metrics).toMatchObject({ claims_checked: 1, rechecked: 1, auto_recheck: true, became_compatible: 1 });
    // a julgada pela IA foi conferida de novo, mas a fonte nova não trata dela: mesma resposta, nada muda
    expect((await claimOf(judgedDoc)).status).toBe("insufficient");
    expect(await evidenceOf(judgedClaim)).toHaveLength(1);
    expect((await evidenceJob(judgedDoc)).metrics).toMatchObject({ rechecked: 1, verdicts: { unchanged: 1 }, became_compatible: 0 });
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

  it("julgada pela IA contra um trecho de outro assunto: volta a ser conferida quando a fonte certa é indexada", async () => {
    // a biblioteca ainda não tem a fonte do assunto: a busca por palavras acha um trecho de outro assunto por "pacientes"
    await addPassage(4, OUTRO_ASSUNTO);
    const doc = await studyDocument("Apostila de outro assunto", S7);
    let claim = await claimOf(doc);
    expect(claim.status).toBe("insufficient");
    expect(await evidenceOf(claim.id)).toEqual([{ source_id: manualSource, verdict: "insufficient", stale: false }]);

    const { sourceId } = await indexSource("Manual fictício do assunto certo", S7);
    claim = await claimOf(doc);
    expect(claim.status).toBe("compatible");
    // a resposta nova da IA substitui a "insuficiente" antiga dela, que fica registrada no histórico
    expect(await evidenceOf(claim.id)).toEqual([{ source_id: sourceId, verdict: "compatible", stale: false }]);
    const replaced = await sql(`select details from public.ch_claim_history where claim_id = $1 and event = 'evidence_replaced_by_ai'`, [claim.id]);
    expect(replaced).toHaveLength(1);
    expect(replaced[0].details.replaced).toMatchObject([{ source_id: manualSource, verdict: "insufficient" }]);
    expect((await evidenceJob(doc)).metrics).toMatchObject({ rechecked: 1, verdicts: { compatible: 1 }, became_compatible: 1 });
  }, 240_000);

  describe("rascunho e reconferência automática", () => {
    let quilo: string;
    let docA: string;

    it("fonte sem relação: nada muda, o rascunho não roda de novo e a versão em revisão fica com os apontamentos", async () => {
      quilo = await fictitiousTheme("Quilotema");
      await addPassage(5, SA1);
      answer = withReviewIssue;
      try {
        docA = await themedDocument("Apostila com rascunho", [{ heading: "Quilotema", sentences: [SA1, SA2] }]);
      } finally {
        answer = mockRespond;
      }
      expect((await claimBy(docA, SA1)).status).toBe("compatible");
      expect((await claimBy(docA, SA2)).status).toBe("insufficient");
      const [v1] = await versionsOf(quilo);
      expect(aiFlags(v1)).toHaveLength(1);
      await db.asUser(admin, "app_ch_submit_for_review", { p_version_id: v1.id });
      const draftBefore = await stepJob(docA, "draft");
      const [docBefore] = await sql(`select status from public.ch_documents where id = $1`, [docA]);

      const { documentId } = await indexSource("Manual fictício sem relação", SEM_RELACAO);
      expect((await stepJob(documentId, "source_index")).metrics.recheck_documents).toBeGreaterThan(0);
      const versions = await versionsOf(quilo);
      expect(versions).toHaveLength(1);
      expect(versions[0].status).toBe("awaiting_review");
      expect(aiFlags(versions[0])).toEqual([expect.objectContaining({ detail: REVIEW_ISSUE.detail })]);
      expect(await stepJob(docA, "draft")).toEqual(draftBefore);
      // a afirmação sem trecho foi conferida de novo, continuou sem trecho e o processamento parou ali
      expect((await evidenceJob(docA)).metrics).toMatchObject({ auto_recheck: true, rechecked: 1, verdicts: { still_no_passage: 1 }, became_compatible: 0 });
      const [docAfter] = await sql(`select status from public.ch_documents where id = $1`, [docA]);
      expect(docAfter.status).toBe(docBefore.status);
    }, 300_000);

    it("afirmações passam a compatíveis depois da troca da IA do rascunho: só o tema sem unidade ganha rascunho; os outros temas não mudam", async () => {
      const rho = await fictitiousTheme("Rhotema");
      const sigma = await fictitiousTheme("Sigmatema");
      const tau = await fictitiousTheme("Tautema");
      const upsilon = await fictitiousTheme("Upsilontema");
      await addPassage(6, SB1);
      await addPassage(7, SB3);
      await addPassage(8, SB4);
      answer = withReviewIssue;
      let doc: string;
      try {
        doc = await themedDocument("Apostila com quatro temas", [
          { heading: "Rhotema", sentences: [SB1] },
          { heading: "Sigmatema", sentences: [SB2] },
          { heading: "Tautema", sentences: [SB3] },
          { heading: "Upsilontema", sentences: [SB4, SB5] },
        ]);
      } finally {
        answer = mockRespond;
      }
      expect((await claimBy(doc, SB2)).status).toBe("insufficient");
      expect((await claimBy(doc, SB5)).status).toBe("insufficient");
      const [vr] = await versionsOf(rho);
      const [vt] = await versionsOf(tau);
      const [vu] = await versionsOf(upsilon);
      expect(await versionsOf(sigma)).toEqual([]);
      for (const v of [vr, vt, vu]) expect(aiFlags(v)).toHaveLength(1);
      // a equipe edita o texto de uma versão e manda duas para revisão; a do Upsilontema fica em rascunho
      const edited = { sections: vr.content.sections.map((s: any) => ({ ...s, heading: `${s.heading} (editado pela equipe)` })) };
      await db.asUser(admin, "app_ch_save_unit_version", { p_version_id: vr.id, p_content: edited });
      await db.asUser(admin, "app_ch_submit_for_review", { p_version_id: vr.id });
      await db.asUser(admin, "app_ch_submit_for_review", { p_version_id: vt.id });

      // o dono troca a IA (outro modelo, sem as respostas guardadas) e chega a fonte das duas afirmações que faltavam
      model = "mock-outra (simulação de troca de modelo)";
      try {
        await indexSource("Manual fictício dos quatro temas", `${SB2} ${SB5}`);
      } finally {
        model = null;
      }
      expect((await claimBy(doc, SB2)).status).toBe("compatible");
      expect((await claimBy(doc, SB5)).status).toBe("compatible");

      // versão editada em revisão: continua sendo a única da unidade, com o texto da equipe e os apontamentos
      const rhoVersions = await versionsOf(rho);
      expect(rhoVersions.map((v: any) => v.id)).toEqual([vr.id]);
      expect(rhoVersions[0].status).toBe("awaiting_review");
      expect(rhoVersions[0].content).toEqual(edited);
      expect(aiFlags(rhoVersions[0])).toHaveLength(1);
      // versão sem edição em revisão: os apontamentos da revisão automática continuam
      const tauVersions = await versionsOf(tau);
      expect(tauVersions.map((v: any) => v.id)).toEqual([vt.id]);
      expect(tauVersions[0].status).toBe("awaiting_review");
      expect(aiFlags(tauVersions[0])).toEqual([expect.objectContaining({ detail: REVIEW_ISSUE.detail })]);
      // tema que já tem unidade e ganhou afirmação compatível: nenhuma versão nova sozinha; a versão mais nova recebe o aviso
      const upsilonVersions = await versionsOf(upsilon);
      expect(upsilonVersions.map((v: any) => v.id)).toEqual([vu.id]);
      expect(upsilonVersions[0].status).toBe("draft");
      expect(upsilonVersions[0].content).toEqual(vu.content);
      expect(aiFlags(upsilonVersions[0])).toHaveLength(1);
      const notices = upsilonVersions[0].review_flags.filter((f: any) => f.by === "reconferencia");
      expect(notices).toEqual([expect.objectContaining({ claim_id: (await claimBy(doc, SB5)).id, detail: expect.stringContaining(SB5) })]);
      expect(notices[0].detail).toMatch(/Reprocessar/);
      // o tema que ainda não tinha unidade ganha o primeiro rascunho, feito pela IA nova
      const sigmaVersions = await versionsOf(sigma);
      expect(sigmaVersions).toHaveLength(1);
      expect(sigmaVersions[0].status).toBe("draft");
      expect(sigmaVersions[0].generated_by_model).toBe("mock-outra (simulação de troca de modelo)");
      expect((await evidenceJob(doc)).metrics).toMatchObject({ auto_recheck: true, became_compatible: 2 });
      expect((await stepJob(doc, "draft")).metrics).toMatchObject({ auto_recheck: true, themes: 2, drafts: 1, held_themes: 1, kept_versions: 0 });
      // materiais, arquivos e revisão automática só na versão nova (os materiais do rascunho do Upsilontema não são refeitos)
      expect((await stepJob(doc, "materials")).metrics).toMatchObject({ versions: 1 });
      expect((await stepJob(doc, "review_check")).metrics).toMatchObject({ versions: 1 });
    }, 300_000);

    it("Reprocessar o rascunho (pedido da equipe): o tema avisado ganha a versão nova; as versões em revisão ficam como estão", async () => {
      const doc = (await sql(`select id from public.ch_documents where name = 'Apostila com quatro temas'`))[0].id;
      const theme = async (name: string) => (await sql(`select id from public.ch_taxonomy_nodes where name = $1 and level = 'theme'`, [name]))[0].id;
      const [rho, tau, upsilon] = [await theme("Rhotema"), await theme("Tautema"), await theme("Upsilontema")];
      const [vr] = await versionsOf(rho);
      const [vt] = await versionsOf(tau);
      const [vu] = await versionsOf(upsilon);
      await db.asUser(admin, "app_ch_retry_job", { p_job_id: (await stepJob(doc, "draft")).id });
      await drain();
      // versões em revisão (editada e sem edição): nenhuma versão nova, apontamentos da revisão automática mantidos
      for (const [t, v] of [[rho, vr], [tau, vt]]) {
        const after = await versionsOf(t);
        expect(after.map((x: any) => x.id)).toEqual([v.id]);
        expect(after[0].content).toEqual(v.content);
        expect(aiFlags(after[0])).toHaveLength(1);
      }
      // o tema avisado ganha a versão nova, com a afirmação que passou a ter evidência
      const upsilonVersions = await versionsOf(upsilon);
      expect(upsilonVersions.map((v: any) => v.id)[0]).toBe(vu.id);
      expect(upsilonVersions).toHaveLength(2);
      expect(upsilonVersions[1].status).toBe("draft");
      expect(JSON.stringify(upsilonVersions[1].content)).toContain((await claimBy(doc, SB5)).id);
      expect((await stepJob(doc, "draft")).metrics).toMatchObject({ kept_versions: 2 });
      expect((await stepJob(doc, "draft")).metrics.auto_recheck).toBeUndefined();
    }, 300_000);

    it("fonte que não entra na busca (consulta pública): não dispara a reconferência", async () => {
      const doc = await studyDocument("Apostila da consulta", SC);
      expect((await claimOf(doc)).status).toBe("insufficient");
      const before = await evidenceJob(doc);
      const { documentId } = await indexSource("Consulta pública fictícia", SC, "public_consultation");
      const index = await stepJob(documentId, "source_index");
      expect(index.status).toBe("succeeded");
      expect(index.metrics.recheck_documents).toBe(0);
      expect(index.metrics.recheck_skipped).toMatch(/não entra na busca/);
      expect(await evidenceJob(doc)).toEqual(before);
      expect((await claimOf(doc)).status).toBe("insufficient");
    }, 240_000);
  });

  describe("rodada de correção 2: a reconferência automática não atrapalha o que está em andamento nem muda a situação do documento", () => {
    const docState = async (doc: string) => (await sql(`select status, failure from public.ch_documents where id = $1`, [doc]))[0];
    const jobsOf = (doc: string, step: string) =>
      sql(`select id, status, checkpoint, error, metrics from public.ch_jobs where document_id = $1 and step = $2 order by created_at`, [doc, step]);
    /** A IA simulada falha só no pedido (promptId) que traz a palavra; o resto responde normalmente. */
    const failing = (promptId: string, word: string, error: () => Error) => (req: StructuredRequest) => {
      if (req.promptId === promptId && req.input.includes(word)) throw error();
      return mockRespond(req);
    };
    const capReached = () => new AiCapReached("Teto de gasto da IA atingido (simulação do teste).");
    /** As tentativas seguintes de um trabalho que falhou (a fila espera entre uma e outra; aqui sem esperar). */
    const exhaust = async (doc: string, step: string) => {
      for (let k = 0; k < 5 && (await stepJob(doc, step)).status === "queued"; k++) {
        await sql(`update public.ch_jobs set run_after = now() where document_id = $1 and status = 'queued'`, [doc]);
        await drain();
      }
    };

    it("Reprocessar a partir da Classificação com fonte nova indexada no meio: a reexecução roda inteira e o documento termina pronto", async () => {
      const doc = await studyDocument("Apostila reprocessada com fonte no meio", SD1);
      expect((await claimOf(doc)).status).toBe("insufficient");
      expect((await docState(doc)).status).toBe("awaiting_review");
      const draftBefore = await stepJob(doc, "draft");
      // a equipe aperta "Reprocessar" na Classificação; antes de a reexecução chegar à conferência, entra uma fonte nova
      await db.asUser(admin, "app_ch_retry_job", { p_job_id: (await stepJob(doc, "classify")).id });
      const { sourceId } = await indexSource("Manual fictício indexado no meio", SD1);
      const claim = await claimOf(doc);
      expect(claim.status).toBe("compatible");
      expect(await evidenceOf(claim.id)).toEqual([{ source_id: sourceId, verdict: "compatible", stale: false }]);
      // a conferência rodou inteira (não como reconferência automática), e o resto do processamento também
      const evidence = await evidenceJob(doc);
      expect(evidence.status).toBe("succeeded");
      expect(evidence.metrics.auto_recheck).toBeUndefined();
      const draft = await stepJob(doc, "draft");
      expect(new Date(draft.finished_at).getTime()).toBeGreaterThan(new Date(draftBefore.finished_at).getTime());
      expect((await stepJob(doc, "review_check")).status).toBe("succeeded");
      expect((await docState(doc)).status).toBe("awaiting_review");
    }, 300_000);

    it("a etapa anterior termina e acha a reconferência automática ainda na fila: tira a marca e a conferência roda inteira", async () => {
      const doc = await studyDocument("Apostila com marca na fila", SD2);
      expect((await claimOf(doc)).status).toBe("insufficient");
      // a fonte nova é indexada e a reconferência automática entra na fila, sem rodar ainda
      await indexSource("Manual fictício da marca na fila", SD2, "final", { drain: false });
      await createContentHubWorker(deps()).tick();
      const [queued] = await jobsOf(doc, "evidence");
      expect(queued.status).toBe("queued");
      expect(queued.checkpoint).toMatchObject({ auto_recheck: true });
      // a etapa Afirmações de uma reexecução termina e põe a conferência na fila
      await db.service("ch_worker_next", { p_document_id: doc, p_step: "evidence", p_versions: stepVersions("evidence", deps()) });
      const [after] = await jobsOf(doc, "evidence");
      expect(after.id).toBe(queued.id);
      expect(after.status).toBe("queued");
      expect(after.checkpoint).toEqual({});
      await drain();
      expect((await claimOf(doc)).status).toBe("compatible");
      expect((await evidenceJob(doc)).metrics.auto_recheck).toBeUndefined();
      expect((await docState(doc)).status).toBe("awaiting_review");
    }, 300_000);

    it("a IA falha em todas as tentativas da reconferência automática: o documento pronto continua pronto e volta a ser conferido na fonte seguinte", async () => {
      const doc = await studyDocument("Apostila com IA fora do ar", SE1);
      const before = await docState(doc);
      expect(before.status).toBe("awaiting_review");
      answer = failing("evidence", "Hetateste", () => new Error("Falha simulada do provedor de IA."));
      try {
        await indexSource("Manual fictício com IA fora do ar", SE1);
        await exhaust(doc, "evidence");
      } finally {
        answer = mockRespond;
      }
      const [job] = await jobsOf(doc, "evidence");
      expect(job.status).toBe("dead");
      expect(await docState(doc)).toEqual(before);
      // o erro fica só na etapa, dizendo que o documento continua como estava
      expect(job.error).toMatch(/^Reconferência automática.*Falha simulada do provedor de IA\.$/);
      // a fonte seguinte confere de novo (o documento não ficou de fora) e o documento continua pronto
      await indexSource("Manual fictício com IA de volta", SE1);
      expect((await claimOf(doc)).status).toBe("compatible");
      expect(await docState(doc)).toEqual(before);
    }, 300_000);

    it("IA da conferência parada na reconferência automática: nenhuma pendência no documento pronto", async () => {
      const doc = await studyDocument("Apostila com IA parada", SF1);
      const before = await docState(doc);
      expect(before.status).toBe("awaiting_review");
      answer = failing("evidence", "Qopateste", capReached);
      try {
        await indexSource("Manual fictício com IA parada", SF1);
      } finally {
        answer = mockRespond;
      }
      const [job] = await jobsOf(doc, "evidence");
      expect(job.status).toBe("blocked");
      expect(job.checkpoint).toMatchObject({ auto_recheck: true });
      expect(await docState(doc)).toEqual(before);
      // a IA volta: a reconferência roda e o documento continua pronto
      await db.service("ch_worker_unblock");
      await drain();
      expect((await claimOf(doc)).status).toBe("compatible");
      expect(await docState(doc)).toEqual(before);
    }, 300_000);

    it("materiais da reconferência automática falham: o documento continua pronto (não fica em 'gerando' nem com falha)", async () => {
      const shin = await fictitiousTheme("Shintema");
      const doc = await themedDocument("Apostila dos materiais", [{ heading: "Shintema", sentences: [SJ1] }]);
      expect((await claimBy(doc, SJ1)).status).toBe("insufficient");
      expect(await versionsOf(shin)).toEqual([]);
      const before = await docState(doc);
      expect(before.status).toBe("awaiting_review");
      answer = failing("summary", "Shinteste", () => new Error("Falha simulada do provedor de IA."));
      try {
        await indexSource("Manual fictício dos materiais", SJ1);
        await exhaust(doc, "materials");
      } finally {
        answer = mockRespond;
      }
      expect((await claimBy(doc, SJ1)).status).toBe("compatible");
      expect(await versionsOf(shin)).toHaveLength(1);
      expect((await stepJob(doc, "materials")).status).toBe("dead");
      expect(await docState(doc)).toEqual(before);
    }, 300_000);

    it("trabalho da reconferência automática com falha definitiva ou interrompido: o documento continua como estava", async () => {
      const doc = await studyDocument("Apostila da falha definitiva", SI1);
      const before = await docState(doc);
      const running = async (lockedAgo: string) =>
        (
          await sql(
            `insert into public.ch_jobs (document_id, step, scope_key, idempotency_key, versions, status, attempts, max_attempts, checkpoint, locked_at, started_at)
             values ($1, 'evidence', '', $2, '{}'::jsonb, 'running', 3, 3, $3::jsonb, now() - $4::interval, now()) returning id`,
            [doc, `teste-${crypto.randomUUID()}`, JSON.stringify({ auto_recheck: true, source_id: crypto.randomUUID() }), lockedAgo]
          )
        )[0].id as string;
      const fatal = await running("0 seconds");
      await db.service("ch_worker_fail", { p_job_id: fatal, p_error: "Falha definitiva simulada." });
      const stale = await running("2 hours");
      expect(await db.service("ch_worker_claim", { p_stale_seconds: 600 })).toBeNull();
      const rows = await sql(`select status from public.ch_jobs where id = any($1::uuid[])`, [[fatal, stale]]);
      expect(rows.map((r: any) => r.status)).toEqual(["dead", "dead"]);
      expect(await docState(doc)).toEqual(before);
    }, 240_000);

    it("rascunho pendente (IA da criação parada) e fonte nova: o rascunho continua inteiro e, quando a IA volta, os dois temas ganham rascunho", async () => {
      const digama = await fictitiousTheme("Digamatema");
      const stigma = await fictitiousTheme("Stigmatema");
      await addPassage(10, SG1);
      answer = (req) => {
        if (req.promptId === "draft" && /Digamateste|Stigmateste/.test(req.input)) throw capReached();
        return mockRespond(req);
      };
      let doc = "";
      try {
        doc = await themedDocument("Apostila com rascunho pendente", [
          { heading: "Digamatema", sentences: [SG1] },
          { heading: "Stigmatema", sentences: [SG2] },
        ]);
        expect((await claimBy(doc, SG1)).status).toBe("compatible");
        expect((await claimBy(doc, SG2)).status).toBe("insufficient");
        const [pending] = await jobsOf(doc, "draft");
        expect(pending.status).toBe("blocked");
        expect(pending.checkpoint.auto_recheck).toBeUndefined();
        // entra a fonte da afirmação que faltava; a IA da criação continua parada
        await indexSource("Manual fictício do rascunho pendente", SG2);
        expect((await claimBy(doc, SG2)).status).toBe("compatible");
        const [still] = await jobsOf(doc, "draft");
        expect(still.status).toBe("blocked");
        expect(still.checkpoint.auto_recheck).toBeUndefined();
      } finally {
        answer = mockRespond;
      }
      // a IA volta: o rascunho roda inteiro, para os dois temas
      await db.service("ch_worker_unblock");
      await drain();
      expect(await versionsOf(digama)).toHaveLength(1);
      expect(await versionsOf(stigma)).toHaveLength(1);
      const draft = await stepJob(doc, "draft");
      expect(draft.metrics).toMatchObject({ themes: 2, drafts: 2 });
      expect(draft.metrics.auto_recheck).toBeUndefined();
      expect((await stepJob(doc, "review_check")).status).toBe("succeeded");
      expect((await docState(doc)).status).toBe("awaiting_review");
    }, 300_000);

    it("conferência de uma reexecução pendente (IA nova) e fonte nova: a conferência pendente continua inteira", async () => {
      // SH2 é julgada "insuficiente" pela IA com um trecho (número diferente): a conferência da reexecução chama a IA para ela
      await addPassage(11, SH2_FONTE);
      const doc = await studyDocument("Apostila com conferência pendente", `${SH1} ${SH2}`);
      expect((await claimBy(doc, SH1)).status).toBe("insufficient");
      expect((await claimBy(doc, SH2)).status).toBe("insufficient");
      model = "mock-outra (simulação de troca de modelo)";
      answer = failing("evidence", "Zayinteste", capReached);
      try {
        // a equipe reprocessa a partir da Classificação com a IA nova; a conferência da reexecução fica pendente
        await db.asUser(admin, "app_ch_retry_job", { p_job_id: (await stepJob(doc, "classify")).id });
        await drain();
        expect((await jobsOf(doc, "evidence")).map((j: any) => j.status)).toEqual(["succeeded", "blocked"]);
        await indexSource("Manual fictício da conferência pendente", SH1);
        const after = await jobsOf(doc, "evidence");
        expect(after.map((j: any) => j.status)).toEqual(["succeeded", "blocked"]);
        expect(after[1].checkpoint.auto_recheck).toBeUndefined();
      } finally {
        model = null;
        answer = mockRespond;
      }
      await db.service("ch_worker_unblock");
      await drain();
      const job = await evidenceJob(doc);
      expect(job.status).toBe("succeeded");
      expect(job.metrics.auto_recheck).toBeUndefined();
      expect((await claimBy(doc, SH1)).status).toBe("compatible");
      expect((await docState(doc)).status).toBe("awaiting_review");
    }, 300_000);

    it("próxima etapa com a marca: só a etapa concluída roda parcial; a pendente, na fila ou com falha roda inteira; duas reconferências se juntam", async () => {
      const doc = await registerDoc("Documento só da fila");
      const put = async (scope: string, status: string, checkpoint: object) => {
        const r = await db.service<{ id: string }>("ch_worker_enqueue", { p_document_id: doc, p_step: "draft", p_scope_key: scope, p_versions: {} });
        await sql(`update public.ch_jobs set status = $2, checkpoint = $3::jsonb, attempts = 1 where id = $1`, [r.id, status, JSON.stringify(checkpoint)]);
        return r.id;
      };
      const next = (scope: string, mark: object) =>
        db.service("ch_worker_next_marked", { p_document_id: doc, p_step: "draft", p_versions: {}, p_scope_key: scope, p_checkpoint: mark });
      const job = async (id: string) => (await sql(`select status, checkpoint from public.ch_jobs where id = $1`, [id]))[0];
      const mark = (...themes: string[]) => ({ auto_recheck: true, themes, claims: themes.map((t) => `c-${t}`) });
      try {
        // concluída inteira: roda de novo só para o que mudou
        const done = await put("concluida", "succeeded", { theme: 3 });
        await next("concluida", mark("b"));
        expect(await job(done)).toEqual({ status: "queued", checkpoint: mark("b") });
        // trabalho normal pendente, na fila ou com falha: roda inteiro, do começo
        const blocked = await put("pendente", "blocked", { theme: 2 });
        await next("pendente", mark("b"));
        expect(await job(blocked)).toEqual({ status: "blocked", checkpoint: {} });
        const queued = await put("na-fila", "queued", { theme: 1 });
        await next("na-fila", mark("b"));
        expect(await job(queued)).toEqual({ status: "queued", checkpoint: {} });
        const dead = await put("falhou", "dead", { theme: 4 });
        await next("falhou", mark("b"));
        expect(await job(dead)).toEqual({ status: "queued", checkpoint: {} });
        // outra reconferência automática ainda por fazer, parada ou que falhou: as marcas se juntam e ela recomeça do início
        const autoQueued = await put("auto-fila", "queued", { ...mark("a"), theme: 1 });
        await next("auto-fila", mark("b"));
        expect(await job(autoQueued)).toEqual({ status: "queued", checkpoint: mark("a", "b") });
        const autoBlocked = await put("auto-pendente", "blocked", mark("c"));
        await next("auto-pendente", mark("a"));
        expect(await job(autoBlocked)).toEqual({ status: "blocked", checkpoint: mark("a", "c") });
        const autoDead = await put("auto-falhou", "dead", { ...mark("a"), versions: ["v1"], theme: 2 });
        await next("auto-falhou", { ...mark("b"), versions: ["v2"] });
        expect(await job(autoDead)).toEqual({ status: "queued", checkpoint: { ...mark("a", "b"), versions: ["v1", "v2"] } });
        // nova: entra com a marca
        const fresh = (await next("nova", mark("d"))) as { id: string };
        expect(await job(fresh.id)).toEqual({ status: "queued", checkpoint: mark("d") });
      } finally {
        await sql(`delete from public.ch_jobs where document_id = $1`, [doc]);
      }
    }, 240_000);
  });

  describe("rodada de correção 3: dois processamentos ao mesmo tempo (execuções da tarefa do Cloud Run que se sobrepõem)", () => {
    const docState = async (doc: string) => (await sql(`select status, failure from public.ch_documents where id = $1`, [doc]))[0];
    /** Trabalho da reconferência automática interrompido (sem sinal há 2 horas) na última tentativa. */
    const interruptedAuto = async (doc: string) =>
      (
        await sql(
          `insert into public.ch_jobs (document_id, step, scope_key, idempotency_key, versions, status, attempts, max_attempts, checkpoint, locked_at, started_at)
           values ($1, 'evidence', '', $2, '{}'::jsonb, 'running', 3, 3, $3::jsonb, now() - interval '2 hours', now()) returning id`,
          [doc, `teste-${crypto.randomUUID()}`, JSON.stringify({ auto_recheck: true, source_id: crypto.randomUUID() })]
        )
      )[0].id as string;
    const NOTE = /^Reconferência automática \(fonte nova\): o documento continua como estava\. /;

    it("Reprocessar da Classificação enquanto a reconferência automática roda em outro processamento: a conferência roda inteira depois e o documento termina pronto", async () => {
      const doc = await studyDocument("Apostila com dois processamentos", SK1);
      expect((await claimOf(doc)).status).toBe("insufficient");
      expect((await docState(doc)).status).toBe("awaiting_review");
      // processamento 1: a fonte nova é indexada e ele pega a reconferência automática deste documento (ainda sem terminar)
      await indexSource("Manual fictício de dois processamentos", SK1, "final", { drain: false });
      await createContentHubWorker(deps()).tick();
      const queued = await evidenceJob(doc);
      expect(queued.status).toBe("queued");
      const auto = await claimJob(queued.id);
      expect(auto.checkpoint).toMatchObject({ auto_recheck: true });
      // processamento 2: a equipe aperta "Reprocessar" na Classificação; Classificação e Afirmações rodam e pedem a conferência,
      // que está rodando no processamento 1
      await db.asUser(admin, "app_ch_retry_job", { p_job_id: (await stepJob(doc, "classify")).id });
      await drain();
      expect((await evidenceJob(doc)).status).toBe("running");
      // o processamento 1 termina a reconferência automática; o que ficou pedido roda depois
      await runJob(deps(), auto);
      await drain();
      const evidence = await evidenceJob(doc);
      expect(evidence.status).toBe("succeeded");
      expect(evidence.metrics.auto_recheck).toBeUndefined();
      expect((await claimOf(doc)).status).toBe("compatible");
      expect((await stepJob(doc, "review_check")).status).toBe("succeeded");
      expect((await docState(doc)).status).toBe("awaiting_review");
    }, 300_000);

    it("fonte nova indexada enquanto a conferência roda em outro processamento: a reconferência fica guardada e roda quando ela termina", async () => {
      const doc = await studyDocument("Apostila conferida em outro processamento", SL1);
      expect((await claimOf(doc)).status).toBe("insufficient");
      // processamento 1: a equipe reprocessa a conferência; ela roda inteira (ainda sem trecho para a afirmação) e para logo antes
      // de registrar o fim
      await db.asUser(admin, "app_ch_retry_job", { p_job_id: (await evidenceJob(doc)).id });
      const job = await claimJob((await evidenceJob(doc)).id);
      let reached!: () => void;
      let release!: () => void;
      const atFinish = new Promise<void>((r) => (reached = r));
      const gate = new Promise<void>((r) => (release = r));
      const slow: ContentDb = {
        ...db,
        service: async <T,>(fn: string, args?: Record<string, unknown>) => {
          if (fn === "ch_worker_finish" && args?.p_job_id === job.id) {
            reached();
            await gate;
          }
          return db.service<T>(fn, args);
        },
      };
      const first = runJob({ ...deps(), db: slow }, job);
      await atFinish;
      // processamento 2: a fonte nova é indexada enquanto isso
      await indexSource("Manual fictício conferido em outro processamento", SL1);
      expect((await claimOf(doc)).status).toBe("insufficient");
      // o processamento 1 termina; a reconferência que ficou guardada roda depois, sem mudar a situação do documento
      release();
      expect((await first).status).toBe("succeeded");
      await drain();
      expect((await claimOf(doc)).status).toBe("compatible");
      expect((await evidenceJob(doc)).metrics.auto_recheck).toBe(true);
      expect((await docState(doc)).status).toBe("awaiting_review");
    }, 300_000);

    it("pedido para uma etapa que está rodando em outro processamento fica guardado e vale quando ela termina, de qualquer jeito que termine", async () => {
      const mark = (...themes: string[]) => ({ auto_recheck: true, themes, claims: themes.map((t) => `c-${t}`) });
      const docs: string[] = [];
      /** Trabalho rodando em outro processamento (cada um com um documento só dele). */
      const running = async (checkpoint: object, attempts = 1) => {
        const doc = await registerDoc(`Documento da fila ${crypto.randomUUID()}`);
        docs.push(doc);
        const r = await db.service<{ id: string }>("ch_worker_enqueue", { p_document_id: doc, p_step: "draft", p_scope_key: "", p_versions: {} });
        await sql(`update public.ch_jobs set status = 'running', attempts = $2, max_attempts = 3, checkpoint = $3::jsonb, locked_at = now(), started_at = now() where id = $1`, [
          r.id,
          attempts,
          JSON.stringify(checkpoint),
        ]);
        return { doc, id: r.id };
      };
      const next = (doc: string) => db.service("ch_worker_next", { p_document_id: doc, p_step: "draft", p_versions: {}, p_scope_key: "" });
      const nextMarked = (doc: string, m: object) =>
        db.service("ch_worker_next_marked", { p_document_id: doc, p_step: "draft", p_versions: {}, p_scope_key: "", p_checkpoint: m });
      const finish = (id: string, ok: boolean) => db.service("ch_worker_finish", { p_job_id: id, p_ok: ok, p_error: ok ? null : "Falha simulada.", p_metrics: {} });
      const job = async (id: string) => {
        const j = await jobRow(id);
        return { status: j.status, checkpoint: j.checkpoint, attempts: j.attempts, requeue: j.requeue ?? null };
      };
      try {
        // reconferência automática interrompida na última tentativa, com outra pedida no meio: volta do começo com as duas marcas
        // (e é pega de novo na hora), sem mudar o documento
        let r = await running({ ...mark("a"), theme: 1 }, 3);
        const beforeStale = await docState(r.doc);
        await nextMarked(r.doc, mark("b"));
        expect((await job(r.id)).status).toBe("running");
        await sql(`update public.ch_jobs set locked_at = now() - interval '2 hours' where id = $1`, [r.id]);
        const again = await db.service<any>("ch_worker_claim", { p_stale_seconds: 600 });
        expect(again).toMatchObject({ id: r.id, status: "running", attempts: 1, checkpoint: mark("a", "b") });
        expect(await docState(r.doc)).toEqual(beforeStale);
        await finish(r.id, true);

        // a etapa anterior pede a etapa (inteira) que está rodando como reconferência automática: ela roda inteira depois
        r = await running(mark("a"));
        await next(r.doc);
        expect((await job(r.id)).status).toBe("running");
        await finish(r.id, true);
        expect(await job(r.id)).toEqual({ status: "queued", checkpoint: {}, attempts: 0, requeue: null });
        // ... também quando a reconferência falha na última tentativa (o documento continua como estava)
        r = await running(mark("a"), 3);
        const before = await docState(r.doc);
        await next(r.doc);
        expect(await finish(r.id, false)).toBe("queued");
        expect(await job(r.id)).toEqual({ status: "queued", checkpoint: {}, attempts: 0, requeue: null });
        expect(await docState(r.doc)).toEqual(before);
        // ... e quando a etapa normal que rodava tem falha definitiva: volta para a fila sem marcar o documento como falho
        r = await running({ theme: 2 });
        await next(r.doc);
        await db.service("ch_worker_fail", { p_job_id: r.id, p_error: "Falha definitiva simulada." });
        expect(await job(r.id)).toEqual({ status: "queued", checkpoint: {}, attempts: 0, requeue: null });
        expect((await docState(r.doc)).status).not.toBe("failed");
        // um pedido da etapa inteira cobre as reconferências pedidas antes e depois dele
        r = await running(mark("a"));
        await nextMarked(r.doc, mark("b"));
        await next(r.doc);
        await nextMarked(r.doc, mark("c"));
        await finish(r.id, true);
        expect(await job(r.id)).toEqual({ status: "queued", checkpoint: {}, attempts: 0, requeue: null });

        // reconferência automática pedida para a etapa normal que está rodando: depois que ela termina, roda só para o que mudou
        r = await running({ theme: 2 });
        await nextMarked(r.doc, mark("b"));
        await finish(r.id, true);
        expect(await job(r.id)).toEqual({ status: "queued", checkpoint: mark("b"), attempts: 0, requeue: null });
        // ... se a etapa normal falha e vai tentar de novo, recomeça inteira, do começo (sem a marca)
        r = await running({ theme: 2 });
        await nextMarked(r.doc, mark("b"));
        await finish(r.id, false);
        expect(await job(r.id)).toEqual({ status: "queued", checkpoint: {}, attempts: 1, requeue: null });
        // ... se ela falha de vez, a falha fica para a equipe (o pedido automático não faz a etapa rodar de novo sozinha)
        r = await running({ theme: 2 }, 3);
        await nextMarked(r.doc, mark("b"));
        await finish(r.id, false);
        expect(await job(r.id)).toMatchObject({ status: "dead", requeue: null });
        expect((await docState(r.doc)).status).toBe("failed");
        // duas reconferências automáticas: a que rodava fica pendente, as marcas se juntam e ela recomeça do início
        r = await running({ ...mark("a"), theme: 1 });
        await nextMarked(r.doc, mark("b"));
        await db.service("ch_worker_block", { p_job_id: r.id, p_reason: "IA parada (simulação)." });
        expect(await job(r.id)).toEqual({ status: "blocked", checkpoint: mark("a", "b"), attempts: 0, requeue: null });
        expect((await docState(r.doc)).failure ?? "").not.toMatch(/Pendência/);
      } finally {
        await sql(`delete from public.ch_jobs where document_id = any($1::uuid[])`, [docs]);
      }
    }, 240_000);

    it("aviso da reconferência: não aponta a afirmação que a versão mais nova já cita", async () => {
      const theme = await fictitiousTheme("Nuntema");
      const doc = await studyDocument("Apostila do aviso", `${SN1} ${SN2}`);
      const cited = await claimBy(doc, SN1);
      const missing = await claimBy(doc, SN2);
      await db.service("ch_worker_save_draft", {
        p_theme_node_id: theme,
        p_title: "Unidade fictícia do aviso",
        p_content: { sections: [{ heading: "Conceitos essenciais", paragraphs: [{ text: "Texto fictício.", clinical: true, claim_ids: [cited.id] }] }] },
        p_origin: "adaptation",
        p_model: "mock",
        p_scope_note: "Teste.",
      });
      const notice = (id: string) => ({ severity: "minor", kind: "other", where: "Reconferência nas fontes", detail: `Aviso fictício ${id}.`, claim_id: id, by: "reconferencia" });
      const r = await db.service<any>("ch_worker_theme_notice", { p_theme_node_id: theme, p_notices: [notice(cited.id), notice(missing.id)] });
      expect(r.notices).toBe(1);
      const [v] = await versionsOf(theme);
      expect(v.review_flags.filter((f: any) => f.by === "reconferencia").map((f: any) => f.claim_id)).toEqual([missing.id]);
    }, 240_000);

    it("reconferência automática interrompida sem tentativas: fica com o aviso na etapa e não muda o documento", async () => {
      const doc = await registerDoc("Documento da reconferência interrompida");
      const before = await docState(doc);
      const id = await interruptedAuto(doc);
      expect(await db.service("ch_worker_claim", { p_stale_seconds: 600 })).toBeNull();
      const j = await jobRow(id);
      expect(j.status).toBe("dead");
      expect(j.finished_at).not.toBeNull();
      expect(j.error).toMatch(NOTE);
      expect(j.error).toContain("Interrompido sem concluir.");
      expect(await docState(doc)).toEqual(before);
    }, 240_000);

    it("junção com o ramo montagem-estacoes (a 5900 recria ch_worker_claim): a proteção continua nas duas ordens e a 8200 pode ser colada de novo", async () => {
      const MIGRATION = fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/20261003008200_reconferir_insuficientes.sql"), "utf8");
      const claimFunctions = async () =>
        (await sql(`select count(*)::int as n from pg_proc where proname = 'ch_worker_claim' and pronamespace = 'public'::regnamespace`))[0].n as number;
      expect(await claimFunctions()).toBe(1);
      const [{ def }] = await sql(`select pg_get_functiondef('public.ch_worker_claim(integer)'::regprocedure) as def`);
      // a 5900 como está no ramo montagem-estacoes (ainda não publicada): apaga ch_worker_claim(integer) e cria outra, a partir da 1400
      const MONTAGEM_5900 = `
        drop function public.ch_worker_claim(integer);
        create function public.ch_worker_claim(p_stale_seconds integer default 600, p_steps text[] default null) returns jsonb
          language plpgsql security definer set search_path = ''
        as $f$
        declare j public.ch_jobs;
        begin
          update public.ch_jobs set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
                 error = 'Interrompido sem concluir.' || coalesce(' Falha anterior: ' || error, ''), locked_at = null
           where status = 'running' and locked_at < now() - make_interval(secs => p_stale_seconds);
          update public.ch_documents d set status = 'failed', failure = left(j2.error, 500)
            from public.ch_jobs j2 where j2.document_id = d.id and j2.status = 'dead' and j2.finished_at is null;
          update public.ch_jobs set finished_at = now() where status = 'dead' and finished_at is null;
          select * into j from public.ch_jobs
           where status = 'queued' and run_after <= now() and (p_steps is null or step = any (p_steps))
           order by run_after, created_at for update skip locked limit 1;
          if not found then return null; end if;
          update public.ch_jobs set status = 'running', attempts = attempts + 1, locked_at = now(), started_at = coalesce(started_at, now()) where id = j.id returning * into j;
          return to_jsonb(j);
        end
        $f$;
        revoke execute on function public.ch_worker_claim(integer, text[]) from public, anon, authenticated;`;
      const doc = await registerDoc("Documento da junção com as estações");
      const before = await docState(doc);
      try {
        // ordem da publicação: a 8200 já está no banco e a 5900 chega depois
        await dev.db.exec(MONTAGEM_5900);
        const a = await interruptedAuto(doc);
        expect(await db.service("ch_worker_claim", { p_stale_seconds: 600 })).toBeNull();
        expect((await jobRow(a)).status).toBe("dead");
        expect(await docState(doc)).toEqual(before);
        // ordem dos arquivos (banco novo): a 5900 roda antes e a 8200 depois; colada duas vezes, sem erro
        await dev.db.exec(MIGRATION);
        await dev.db.exec(MIGRATION);
        expect(await claimFunctions()).toBe(1);
        expect(await sql(`select public.ch_worker_claim(600) as r`)).toEqual([{ r: null }]);
        const b = await interruptedAuto(doc);
        expect(await db.service("ch_worker_claim", { p_stale_seconds: 600 })).toBeNull();
        expect((await jobRow(b)).error).toMatch(NOTE);
        expect(await docState(doc)).toEqual(before);
      } finally {
        // volta a ch_worker_claim deste ramo
        await dev.db.exec(`drop function if exists public.ch_worker_claim(integer, text[]); drop function if exists public.ch_worker_claim(integer);`);
        await dev.db.exec(def);
        await dev.db.exec(`revoke execute on function public.ch_worker_claim(integer) from public, anon, authenticated;`);
      }
    }, 240_000);
  });

  describe("rodada de correção 4: conferência longa dá sinal de vida e o trabalho tem dono", () => {
    const docState = async (doc: string) => (await sql(`select status, failure from public.ch_documents where id = $1`, [doc]))[0];
    const claimStatus = async (id: string) => (await sql(`select status from public.ch_claims where id = $1`, [id]))[0].status as string;
    /** CONTENT_HUB_STALE_SECONDS da tarefa do Cloud Run: sem sinal por mais que isso, o trabalho "rodando" volta para a fila. */
    const STALE = 1800;
    /** Os outros trabalhos da fila esperam: a execução nova do teste só pode pegar o trabalho da conferência. Devolve quem os solta. */
    const parkQueue = async (except: string) => {
      const parked = (await sql(`update public.ch_jobs set run_after = now() + interval '1 day' where status = 'queued' and id <> $1 returning id`, [except])).map((r: any) => r.id);
      return async () => {
        await sql(`update public.ch_jobs set run_after = now() where id = any($1::uuid[])`, [parked]);
      };
    };
    /** Banco visto pelo processamento 1: antes de cada busca de trechos (uma por afirmação), roda `before(n)`, n = 1, 2, ... */
    const onSearch = (before: (n: number) => Promise<void>): ContentDb => {
      let n = 0;
      return {
        ...db,
        service: async <T,>(fn: string, args?: Record<string, unknown>) => {
          if (fn === "ch_worker_search_passages") await before(++n);
          return db.service<T>(fn, args);
        },
      };
    };
    type Run = Awaited<ReturnType<typeof runJob>>;

    it("conferência longa: dá sinal de vida a cada afirmação e uma execução nova da tarefa não pega o trabalho no meio", async () => {
      const doc = await studyDocument("Apostila da conferência longa", `${SP1} ${SP2} ${SP3}`);
      const claims = await sql(`select id, status from public.ch_claims where document_id = $1`, [doc]);
      expect(claims.map((c) => c.status)).toEqual(["insufficient", "insufficient", "insufficient"]);
      await addPassage(11, SP1);
      await addPassage(12, SP2);
      await addPassage(13, SP3);
      // a equipe reprocessa a conferência e o processamento 1 pega o trabalho
      await db.asUser(admin, "app_ch_retry_job", { p_job_id: (await evidenceJob(doc)).id });
      const id = (await evidenceJob(doc)).id as string;
      const release = await parkQueue(id);
      const taken: (string | null)[] = [];
      let result!: Run;
      try {
        // cada afirmação leva 20 minutos (busca e IA); a cada uma, uma execução nova da tarefa chama ch_worker_claim
        const slow = onSearch(async () => {
          await sql(`update public.ch_jobs set locked_at = locked_at - interval '20 minutes' where id = $1`, [id]);
          taken.push((await db.service<Job | null>("ch_worker_claim", { p_stale_seconds: STALE }))?.id ?? null);
        });
        result = await runJob({ ...deps(), db: slow }, await claimJob(id));
      } finally {
        await release();
      }
      // 60 minutos no total, mas nunca 30 sem sinal: ninguém pegou o trabalho, e cada afirmação tem uma evidência só
      expect(taken).toEqual([null, null, null]);
      expect(result.status).toBe("succeeded");
      for (const c of claims) {
        expect(await claimStatus(c.id)).toBe("compatible");
        expect(await evidenceOf(c.id)).toEqual([{ source_id: manualSource, verdict: "compatible", stale: false }]);
      }
      await drain();
      expect((await docState(doc)).status).toBe("awaiting_review");
    }, 300_000);

    it("processamento que ficou sem sinal e perdeu o trabalho para sem gravar nem registrar o fim; o outro termina com o que os dois conferiram", async () => {
      const turmalina = await fictitiousTheme("Turmalinatema");
      const onix = await fictitiousTheme("Onixtema");
      const doc = await themedDocument("Apostila retomada por outro processamento", [
        { heading: "Turmalinatema", sentences: [SQ1] },
        { heading: "Onixtema", sentences: [SQ2] },
      ]);
      const c1 = await claimBy(doc, SQ1);
      const c2 = await claimBy(doc, SQ2);
      expect([c1.status, c2.status]).toEqual(["insufficient", "insufficient"]);
      expect(await versionsOf(turmalina)).toEqual([]);
      expect(await versionsOf(onix)).toEqual([]);
      const before = await docState(doc);
      await addPassage(14, SQ1);
      await addPassage(15, SQ2);
      // reconferência automática (como a de uma fonte nova indexada); o processamento 1 pega o trabalho
      await db.service("ch_worker_next_marked", {
        p_document_id: doc,
        p_step: "evidence",
        p_versions: stepVersions("evidence", deps()),
        p_scope_key: "",
        p_checkpoint: { auto_recheck: true, source_id: manualSource },
      });
      const id = (await evidenceJob(doc)).id as string;
      expect((await jobRow(id)).status).toBe("queued");
      const release = await parkQueue(id);
      const seen: { other: Job | null } = { other: null };
      let first!: Run;
      try {
        // na segunda afirmação, o processamento 1 fica 2 horas sem sinal (a chamada travou) e uma execução nova pega o trabalho
        const stuck = onSearch(async (n) => {
          if (n !== 2) return;
          await sql(`update public.ch_jobs set locked_at = locked_at - interval '2 hours' where id = $1`, [id]);
          seen.other = await db.service<Job | null>("ch_worker_claim", { p_stale_seconds: STALE });
        });
        first = await runJob({ ...deps(), db: stuck }, await claimJob(id));
      } finally {
        await release();
      }
      const other = seen.other!;
      expect(other.id).toBe(id);
      // o processamento 1 para: não grava a afirmação que conferia e não registra o fim no trabalho que agora é do outro
      expect(first.status).toBe("lost");
      expect((await jobRow(id)).status).toBe("running");
      const done = (await claimStatus(c1.id)) === "compatible" ? c1 : c2;
      const pending = done === c1 ? c2 : c1;
      expect(await claimStatus(pending.id)).toBe("insufficient");
      // o outro recebe o que o primeiro já tinha achado (o tema da afirmação que passou a compatível) e confere só o resto
      expect(other.checkpoint).toMatchObject({ auto_recheck: true, themes: [done === c1 ? turmalina : onix], claims: [done.id] });
      expect(await runJob(deps(), other)).toMatchObject({ status: "succeeded", next: "draft" });
      await drain();
      for (const c of [c1, c2]) {
        expect(await claimStatus(c.id)).toBe("compatible");
        expect(await evidenceOf(c.id)).toEqual([{ source_id: manualSource, verdict: "compatible", stale: false }]);
      }
      // os dois temas (sem unidade antes) ganham rascunho; o documento continua como estava
      expect(await versionsOf(turmalina)).toHaveLength(1);
      expect(await versionsOf(onix)).toHaveLength(1);
      expect(await docState(doc)).toEqual(before);
    }, 300_000);
  });

  it("as funções novas e redefinidas continuam só do servidor (nem a equipe chama direto)", async () => {
    const id = crypto.randomUUID();
    for (const call of [
      `select public.ch_worker_recheck_insufficient('${id}'::uuid, '{}'::jsonb)`,
      `select public.ch_worker_claims('${id}'::uuid)`,
      `select public.ch_worker_mark_claim('${id}'::uuid, 'insufficient', 'x')`,
      `select public.ch_worker_link_evidence('${id}'::uuid, '{}'::jsonb)`,
      `select public.ch_worker_save_draft('${id}'::uuid, 'x', '{}'::jsonb, 'adaptation', 'x', 'x', 'x')`,
      `select public.ch_claim_recheckable('${id}'::uuid)`,
      `select public.ch_worker_next_marked('${id}'::uuid, 'draft', '{}'::jsonb, '', '{}'::jsonb)`,
      `select public.ch_worker_theme_notice('${id}'::uuid, '[]'::jsonb)`,
      // redefinidas na rodada de correção 2
      `select public.ch_worker_next('${id}'::uuid, 'evidence', '{}'::jsonb, '')`,
      `select public.ch_worker_finish('${id}'::uuid, false, 'x', '{}'::jsonb)`,
      `select public.ch_worker_block('${id}'::uuid, 'x')`,
      `select public.ch_worker_fail('${id}'::uuid, 'x')`,
      // a 8200 não redefine mais ch_worker_claim (rodada de correção 3), mas ela continua só do servidor
      `select public.ch_worker_claim(600)`,
      // nova na rodada de correção 3
      `select public.ch_worker_merge_marks('{}'::jsonb, '{}'::jsonb)`,
      // redefinida na rodada de correção 4 (confere o dono do trabalho)
      `select public.ch_worker_checkpoint('${id}'::uuid, '{}'::jsonb)`,
    ]) {
      for (const role of ["authenticated", "anon"]) {
        const attempt = dev.db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          await tx.query(call);
        });
        await expect(attempt, `${role}: ${call}`).rejects.toThrow(/permission denied/);
      }
    }
    // as funções dos gatilhos da fila (rodadas de correção 3 e 4) também não ficam liberadas para ninguém de fora do servidor
    for (const fn of ["public.ch_jobs_worker_exit()", "public.ch_jobs_worker_enter()"]) {
      const [grants] = await sql(
        `select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as authenticated`,
        [fn]
      );
      expect(grants, fn).toEqual({ anon: false, authenticated: false });
    }
  });

  it("banco sem a atualização 8200: indexar a fonte continua funcionando e a etapa anota o que falta", async () => {
    const MIGRATION = fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/20261003008200_reconferir_insuficientes.sql"), "utf8");
    await dev.db.exec(`drop function public.ch_worker_recheck_insufficient(uuid, jsonb)`);
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
