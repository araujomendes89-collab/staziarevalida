/**
 * Apoio dos testes das Questões StaziaMed: um banco de desenvolvimento isolado (PGlite numa pasta temporária, com as
 * migrações e a carga de sempre: as 1.200 questões oficiais e os 200 rascunhos do gerador antigo), as contas de teste,
 * uma fonte oficial com trecho e um rascunho limpo pronto para receber erros plantados.
 *
 * Tudo grava com o dono do banco (`sql`), menos `sqlAs` (papel `authenticated` com as claims do JWT, o RLS valendo) e
 * `rpc` (o mesmo caminho do app: só funções `app_*` com argumentos `p_*`). Funções que não são `app_*`
 * (ex.: practice_pool, tutor_pick_question, ch_worker_*) são chamadas por `sql`/`sqlAs`.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../../server/contentHub/infra";
import { buildDraftStatements } from "../../../scripts/supabase/engine-seed";

/** Contas de teste (uuids fixos). Revisores são médicos (papel de aluno) cadastrados numa área; TESTE fica no teste grátis. */
export const USERS = {
  ADMIN: "00000000-0000-4000-8000-0000000051a1",
  EDITOR: "00000000-0000-4000-8000-0000000051e1",
  REVISOR_PED: "00000000-0000-4000-8000-0000000051c1",
  REVISOR_CM: "00000000-0000-4000-8000-0000000051c2",
  PRO: "00000000-0000-4000-8000-0000000051b1",
  TESTE: "00000000-0000-4000-8000-0000000051f1",
  /** Teste grátis já vencido (data de fim no passado). */
  TESTE_VENCIDO: "00000000-0000-4000-8000-0000000051f2",
  /** Plano Pro cancelado. */
  PRO_VENCIDO: "00000000-0000-4000-8000-0000000051b2",
  /** Conta sem nenhuma linha de assinatura. */
  SEM_PLANO: "00000000-0000-4000-8000-0000000051f3",
} as const;

export interface StaziaEnv {
  dev: DevDatabase;
  db: ContentDb;
  sql<T = any>(q: string, p?: unknown[]): Promise<T[]>;
  sqlAs<T = any>(uid: string, q: string, p?: unknown[]): Promise<T[]>;
  rpc<T = any>(uid: string, fn: string, args?: Record<string, unknown>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Abre o banco de teste. A carga de sempre já traz os 200 rascunhos do gerador antigo: `drafts: true` reaplica a carga dos
 * rascunhos (como quem roda o seed de novo) e os mantém; sem `drafts` (ou `false`) eles são apagados depois de montar o
 * banco, para o teste contar só o que ele mesmo criou.
 */
export async function openStaziaEnv(opts: { drafts?: boolean } = {}): Promise<StaziaEnv> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "questoes-staziamed-"));
  const dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  const db = devContentDb(async () => dev);
  const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;

  if (opts.drafts) for (const st of buildDraftStatements()) await dev.db.exec(st);
  else await sql(`delete from public.draft_questions`);

  const emails: [string, string][] = [
    [USERS.ADMIN, "admin@staziamed.teste"],
    [USERS.EDITOR, "editor@staziamed.teste"],
    [USERS.REVISOR_PED, "revisor.pediatria@staziamed.teste"],
    [USERS.REVISOR_CM, "revisor.clinica@staziamed.teste"],
    [USERS.PRO, "aluno.pro@staziamed.teste"],
    [USERS.TESTE, "aluno.teste@staziamed.teste"],
    [USERS.TESTE_VENCIDO, "aluno.teste.vencido@staziamed.teste"],
    [USERS.PRO_VENCIDO, "aluno.pro.vencido@staziamed.teste"],
    [USERS.SEM_PLANO, "aluno.sem.plano@staziamed.teste"],
  ];
  for (const [id, email] of emails) await sql(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
  await sql(`update public.user_roles set role = 'admin' where user_id = $1`, [USERS.ADMIN]);
  await sql(`update public.user_roles set role = 'editor' where user_id = $1`, [USERS.EDITOR]);
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA'), ($2, 'CLINICA_MEDICA')`, [USERS.REVISOR_PED, USERS.REVISOR_CM]);
  // plano pago só vale com data de fim no futuro (regra da correção de acesso, 9550)
  await sql(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id = $1`, [USERS.PRO]);
  await sql(`update public.subscriptions set plan = 'pro', status = 'canceled', current_period_end = now() - interval '2 days' where user_id = $1`, [USERS.PRO_VENCIDO]);
  await sql(`update public.subscriptions set status = 'trialing', trial_ends_at = now() - interval '1 day' where user_id = $1`, [USERS.TESTE_VENCIDO]);
  await sql(`update public.subscriptions set trial_ends_at = now() + interval '5 days' where user_id = $1`, [USERS.TESTE]);
  await sql(`delete from public.subscriptions where user_id = $1`, [USERS.SEM_PLANO]);

  return {
    dev,
    db,
    sql,
    async sqlAs<T = any>(uid: string, q: string, p: unknown[] = []) {
      return dev.db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
        return (await tx.query<T>(q, p)).rows;
      });
    },
    rpc<T = any>(uid: string, fn: string, args: Record<string, unknown> = {}) {
      return dev.core.rpc<T>({ id: uid, email: null }, fn, args);
    },
    async close() {
      await dev.db.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

/** Fonte cadastrada na Central com um trecho. Padrão: oficial (nível A, final, vigente, sem fim de vigência). */
export async function addOfficialSource(
  env: StaziaEnv,
  o: { text: string; title?: string; organ?: string; page?: number; level?: "A" | "B" | "C" | "D" | "E"; kind?: string; status?: string; validUntil?: string | null }
): Promise<{ sourceId: string; passageId: string }> {
  const [source] = await env.sql<{ id: string }>(
    `insert into public.ch_sources (title, organ, kind, status, version, published_on, valid_until, authority_level)
     values ($1, $2, $3, $4, '2026', '2026-01-01', $5, $6) returning id`,
    [o.title ?? "PCDT de teste", o.organ ?? "Ministério da Saúde (teste)", o.kind ?? "final", o.status ?? "current", o.validUntil ?? null, o.level ?? "A"]
  );
  const [passage] = await env.sql<{ id: string }>(
    `insert into public.ch_source_passages (source_id, section, page, text) values ($1, 'Tratamento', $2, $3) returning id`,
    [source.id, o.page ?? 7, o.text]
  );
  return { sourceId: source.id, passageId: passage.id };
}

/** Colunas de conteúdo de `draft_questions` que um teste preenche. */
export interface DraftInsert {
  batch: string;
  source_id: string;
  slot: number;
  area: string;
  topic: string | null;
  title: string | null;
  stem: string;
  support_type: string | null;
  support_title: string | null;
  support_rows: unknown[];
  alternatives: Record<string, string>;
  correct_answer: "A" | "B" | "C" | "D";
  explanation: string | null;
  alternative_explanations: Record<string, string>;
  clinical_decision: string | null;
  key_concepts: unknown[];
  source_citations: unknown[];
  model: string | null;
  generated_by: "gerador_antigo" | "servidor";
}

let draftSeq = 0;
const JSON_COLUMNS = new Set(["support_rows", "alternatives", "alternative_explanations", "key_concepts", "source_citations"]);

/** Rascunho limpo de PEDIATRIA feito pelo servidor (o mesmo de `clean()` em contentHubDraftChecks.test.ts). Devolve o id. */
export async function insertDraft(env: StaziaEnv, o: Partial<DraftInsert> = {}): Promise<string> {
  draftSeq += 1;
  const row: DraftInsert = {
    batch: "staziamed-teste",
    source_id: `q${draftSeq}`,
    slot: draftSeq,
    area: "PEDIATRIA",
    topic: null,
    title: null,
    stem: "Lactente de 8 meses, 8 kg, com febre há 3 dias e diagnóstico de otite média aguda, sem alergia a antibióticos. Qual a conduta?",
    support_type: "NONE",
    support_title: null,
    support_rows: [],
    alternatives: {
      A: "Amoxicilina 90 mg/kg/dia por 10 dias.",
      B: "Observar por 48 horas sem antibiótico.",
      C: "Azitromicina dose única.",
      D: "Ceftriaxona intramuscular por 1 dia.",
    },
    correct_answer: "A",
    explanation: "Em lactente com otite média aguda, indica-se amoxicilina 90 mg/kg/dia por 10 dias.",
    alternative_explanations: {
      A: "Correta. Amoxicilina 90 mg/kg/dia por 10 dias é a conduta inicial.",
      B: "Incorreta. Em menores de 2 anos a observação isolada não é a conduta.",
      C: "Incorreta. Não é a primeira escolha.",
      D: "Incorreta. Reservada para falha terapêutica.",
    },
    clinical_decision: "Tratar otite média aguda do lactente com amoxicilina 90 mg/kg/dia por 10 dias.",
    key_concepts: [],
    source_citations: [{ source_file: "Manual oficial.pdf", supported_claim: "Em menores de 2 anos com otite média aguda, amoxicilina 90 mg/kg/dia por 10 dias." }],
    model: "gpt-5.6-luna",
    generated_by: "servidor",
    ...o,
  };
  const cols = Object.keys(row) as (keyof DraftInsert)[];
  const values = cols.map((c) => (JSON_COLUMNS.has(c) ? JSON.stringify(row[c]) : row[c]));
  const [r] = await env.sql<{ id: string }>(
    `insert into public.draft_questions (${cols.join(", ")}) values (${cols.map((c, i) => `$${i + 1}${JSON_COLUMNS.has(c) ? "::jsonb" : ""}`).join(", ")}) returning id`,
    values
  );
  return r.id;
}

/** Colunas que um teste pode escolher numa Questão StaziaMed publicada (o resto é fixo e válido). */
export interface StaziaQuestionInsert {
  number?: number;
  /** Valor de `med_area` (PEDIATRIA, CLINICA_MEDICA, CIRURGIA_GERAL, GINECOLOGIA_OBSTETRICIA, MEDICINA_FAMILIA_COMUNIDADE). */
  area?: string;
  topic?: string;
  correct?: "A" | "B" | "C" | "D";
  /** Tabela de apoio `{ type, title, rows: [{ label, value }] }`; sem ela, nula (como nas oficiais). */
  support?: object;
  /** Recolhida: fora do sorteio, mas ainda lida por quem já respondeu. */
  retired?: boolean;
}

/**
 * Questão StaziaMed já publicada, inserida direto no banco como o dono (origem 'staziamed', prova 'staziamed'):
 * id `staziamed_q` + número com 4 dígitos, código `STZ-` + número. `sources` traz só título, órgão, nível, página e link
 * (nunca `supports` nem trecho: o aluno lê esta coluna direto). Devolve o id.
 */
export async function insertStaziaQuestion(env: StaziaEnv, o: StaziaQuestionInsert = {}): Promise<string> {
  const number =
    o.number ?? Number((await env.sql<{ n: number }>(`select coalesce(max(number), 0) + 1 as n from public.questions where exam_id = 'staziamed'`))[0].n);
  const tag = String(number).padStart(4, "0");
  const id = `staziamed_q${tag}`;
  const correct = o.correct ?? "A";
  const options = (["A", "B", "C", "D"] as const).map((letter) => ({
    id: letter,
    text: `Alternativa ${letter} da questão ${tag}.`,
    explanation: letter === correct ? `Correta. Explicação da questão ${tag}.` : `Incorreta. A alternativa ${letter} não é a conduta.`,
  }));
  await env.sql(
    `insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option, expected_conduct, sources, origin, retired_at, support)
     values ($1, $2, 'staziamed', $3, $4::public.med_area, $5, $6, $7::jsonb, $8, $9, $10::jsonb, 'staziamed', $11, $12::jsonb)`,
    [
      id,
      `STZ-${tag}`,
      number,
      o.area ?? "PEDIATRIA",
      o.topic ?? "Otite média aguda",
      `Enunciado da Questão StaziaMed ${tag}: lactente de 8 meses com febre há 3 dias. Qual a conduta?`,
      JSON.stringify(options),
      correct,
      `Conduta esperada da questão ${tag}.`,
      JSON.stringify([{ title: "PCDT de teste", organ: "Ministério da Saúde (teste)", level: "A", page: 7, link: "https://exemplo.gov.br/pcdt-teste" }]),
      o.retired ? new Date().toISOString() : null,
      o.support ? JSON.stringify(o.support) : null,
    ]
  );
  return id;
}

/** Texto da fonte oficial usado por `readyDraft` (a citação literal e a decisão clínica saem dele). */
export const READY_PASSAGE = "Em lactentes com otite média aguda, indica-se amoxicilina 90 mg/kg/dia por 10 dias como primeira escolha no tratamento.";
export const READY_QUOTE = "indica-se amoxicilina 90 mg/kg/dia por 10 dias";
export const READY_DECISION = "Tratar otite média aguda do lactente com amoxicilina 90 mg/kg/dia por 10 dias.";

/** Grava as 4 camadas de conferência no texto ATUAL do rascunho (todas "pass", salvo `verdicts`). */
export async function setChecks(env: StaziaEnv, draftId: string, verdicts: Partial<Record<"software" | "sources" | "currency" | "redteam", string | null>> = {}): Promise<string> {
  const [{ content_hash: hash }] = await env.sql<{ content_hash: string }>(`select content_hash from public.draft_questions where id = $1`, [draftId]);
  await env.sql(`delete from public.draft_checks where draft_id = $1`, [draftId]);
  for (const layer of ["software", "sources", "currency", "redteam"] as const) {
    const verdict = layer in verdicts ? verdicts[layer] : "pass";
    if (verdict === null) continue;
    await env.sql(`insert into public.draft_checks (draft_id, layer, verdict, content_hash, model) values ($1, $2, $3, $4, 'mock')`, [draftId, layer, verdict, hash]);
  }
  return hash;
}

/**
 * Rascunho pronto para aprovar: fonte oficial com trecho, rascunho de PEDIATRIA com tema (o primeiro da lista de temas das provas), citação nova da
 * decisão clínica e as 4 camadas "pass" no texto atual. Cada chamada cria a sua fonte e o seu rascunho (enunciado único).
 */
export async function readyDraft(env: StaziaEnv, over: Partial<DraftInsert> = {}): Promise<{ id: string; hash: string; sourceId: string; passageId: string; title: string }> {
  readySeq += 1;
  const title = `PCDT pronto ${readySeq}`;
  const { sourceId, passageId } = await addOfficialSource(env, { title, text: READY_PASSAGE });
  const [{ topic }] = await env.sql<{ topic: string }>(`select topic from public.staziamed_topic_weights('PEDIATRIA') limit 1`);
  const citation = { passage_id: passageId, source_id: sourceId, source: title, organ: "Ministério da Saúde (teste)", version: "2026", page: 7, quote: READY_QUOTE, supports: READY_DECISION };
  const id = await insertDraft(env, {
    stem: `Quadro ${readySeq}: lactente com febre e otalgia há três dias, membrana timpânica abaulada e sem sinais de gravidade. Qual a conduta inicial adequada?`,
    topic, source_citations: [citation], clinical_decision: READY_DECISION, ...over,
  });
  return { id, hash: await setChecks(env, id), sourceId, passageId, title };
}
let readySeq = 0;
