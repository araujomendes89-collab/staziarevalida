// @vitest-environment node
/**
 * Motor de questões parecidas no banco (migração 20261003009910) e no processamento (server/contentHub/similarity), num Postgres
 * real em memória (PGlite, com pgvector como no Supabase) com TODAS as migrações em ordem e a carga REAL do repositório (todas as
 * questões oficiais, question_dna e grupos de equivalentes). Nada é inventado: as questões são as oficiais; os perfis são os reais da revisão local (cópia em
 * fixtures/similaridade); os vetores de teste saem do texto real por hash; a "IA" é um provedor de teste que devolve a própria
 * sugestão do motor. Nenhuma chave de IA é usada e nada sai para a rede.
 *
 * As provas Revalida 2021 e 2022/2 têm os perfis reais; ENAMED 2025 × Revalida 2025/2 trazem as mesmas questões aplicadas em duas
 * provas (duplicatas exatas de verdade).
 *   - RLS: aluno e visitante não leem nem gravam as tabelas e não chamam as funções do processamento;
 *   - perfis reais carregados pelo SQL do script (idempotente; não sobrescreve o que a equipe gravou);
 *   - SEM a taxonomia (estado de hoje): só duplicata exata (e o texto quase igual, com confiança baixa); nada chega ao aluno;
 *   - só o que mudou é reprocessado; trava contra processamento em dobro;
 *   - COM o nó da taxonomia (derivado do tema real, só para o teste): mesmo tema não vira equivalente;
 *   - revisar relação (equipe e revisor da área), registro, e o par revisado sobrevive ao reprocessamento;
 *   - aluno: sem gabarito, sem duplicata, cadeado das Questões Inéditas, abrir a questão relacionada;
 *   - vetores só com a função ligada na Central de IAs; IA só nos pares duvidosos, em lote do administrador, e nunca aprova.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import type { DevDatabase } from "../../server/devDb/devDatabase";
import { migrateDatabase } from "../novo/data/localCore";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { createContentHubWorker } from "../../server/contentHub/worker";
import type { PipelineDeps } from "../../server/contentHub/pipeline";
import { invalidateAiConfig } from "../../server/ai/config";
import { resetEmbeddingsPermission, type Embedder } from "../../server/contentHub/embeddings";
import { ENGINE_VERSION, NO_TAXONOMY_CAP } from "../../server/contentHub/similarity/engine";
import { EMBED_TEXT_VERSION } from "../../server/contentHub/similarity/run";
import type { StructuredRequest } from "../../server/contentHub/ai/provider";
import { lerPerfis, sqlPerfis } from "../../scripts/similaridade/gerar-sql-perfis.mjs";
import { avaliar, lerPares } from "../../scripts/similaridade/avaliar.mjs";
import { cosseno, FIXTURE_DIR, vetorDoTexto } from "./helpers/similaridade";

vi.setConfig({ testTimeout: 900_000 });

const ROOT = path.resolve(__dirname, "../..");
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = U(1), EDITOR = U(2), REV_GO = U(3), REV_PED = U(4), ALUNO = U(6), ALUNO_FECHADO = U(7);
const MODEL = "gemini-embedding-2";
const CONTRATO_ALUNO = ["answered", "area", "code", "exam_label", "id", "locked", "number", "reason", "relation", "subtema", "tema"];

let dev: DevDatabase;
let db: ContentDb;
let TOTAL = 0; // questões oficiais da carga
const semPgvector = () => new PGlite();
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const rpc = async <T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const keys = Object.keys(args);
  return dev.db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ r: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, keys.map((k) => args[k]));
    return r.rows[0].r;
  });
};
const asRole = async <T = any>(uid: string | null, q: string): Promise<T[]> =>
  dev.db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return (await tx.query<T>(q)).rows;
  });

// ---------------------------------------------------------------- infraestrutura simulada (sem rede)
const embedCalls = { texts: 0 };
const fakeEmbedder: Embedder = {
  model: MODEL,
  async embedDocuments(items) {
    embedCalls.texts += items.length;
    const tokens = items.reduce((s, it) => s + Math.ceil(it.text.length / 4), 0);
    return { vectors: items.map((it) => vetorDoTexto(it.text)), tokens, costUsd: Math.round(((tokens * 0.2) / 1_000_000) * 1e6) / 1e6, latencyMs: 1 };
  },
  async embedQuery(text) {
    return vetorDoTexto(text);
  },
};
const aiSeen: string[] = [];
// "IA" de teste: devolve a própria sugestão do motor para cada par recebido (nenhum julgamento clínico é inventado)
const aiMaker = (ref: { provider: string; model: string }) =>
  ({
    name: ref.provider, model: ref.model, isMock: false,
    async generate(req: StructuredRequest) {
      const doc = JSON.parse(req.input.match(/<documento>\n([\s\S]*)\n<\/documento>/)![1]);
      aiSeen.push(...doc.pares.map((p: any) => p.id));
      return {
        output: { pares: doc.pares.map((p: any) => ({ id: p.id, relacao: p.sugestao_do_motor, confianca: 0.9, justificativa: "Resposta do provedor de teste (nenhuma IA foi chamada)." })) },
        provider: ref.provider, model: ref.model, inputTokens: 1000, outputTokens: 200, latencyMs: 1, costUsd: null,
      };
    },
  }) as any;
const deps = (embedder: Embedder | null = null): PipelineDeps =>
  ({ db, storage: null, ai: { provider: null, status: { ready: false, provider: null, model: null, isMock: false, pending: "sem IA" } }, renderer: null, embedder, aiMaker }) as unknown as PipelineDeps;
const drain = (embedder: Embedder | null = null) => createContentHubWorker(deps(embedder)).drain();
const lastRun = async () => (await sql(`select * from public.similarity_runs order by started_at desc, id desc limit 1`))[0];
const relations = (where = "true") => sql<any>(`select * from public.question_relations where ${where}`);
const reprocess = (uid: string, ids: string[] | null = null) => rpc(uid, "app_admin_similarity_reprocess", { p_question_ids: ids });

const MIG = path.join(ROOT, "supabase/migrations");
const migrations = () => Object.fromEntries(fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).map((f) => [f, fs.readFileSync(path.join(MIG, f), "utf8")]));
const cargaReal = async () => [
  ...(await import("../../scripts/supabase/seed-builder")).buildSeedStatements(),
  ...(await import("../../scripts/supabase/engine-seed")).buildEngineStatements(),
];
/** Banco como o de desenvolvimento (todas as migrações em ordem e a carga real do repositório), com ou sem pgvector. */
async function abrirBanco(pg: PGlite): Promise<PGlite> {
  await migrateDatabase(pg, fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"), migrations(), cargaReal);
  return pg;
}

beforeAll(async () => {
  const pg = await abrirBanco(new PGlite({ extensions: { vector } }));
  dev = { db: pg } as unknown as DevDatabase;
  db = devContentDb(async () => dev);
  TOTAL = (await pg.query<{ n: number }>(`select count(*)::int n from public.questions`)).rows[0].n;
  for (const [n, id] of [["adm", ADMIN], ["ed", EDITOR], ["revgo", REV_GO], ["revped", REV_PED], ["alu", ALUNO], ["fechado", ALUNO_FECHADO]] as const) {
    await dev.db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${n}@t.local`, { name: n }]);
  }
  await dev.db.exec(`
    update public.user_roles set role = 'admin' where user_id = '${ADMIN}';
    update public.user_roles set role = 'editor' where user_id = '${EDITOR}';
    insert into public.ch_reviewer_areas (user_id, area_code) values ('${REV_GO}', 'GINECOLOGIA_OBSTETRICIA'), ('${REV_PED}', 'PEDIATRIA');
    update public.subscriptions set plan = 'trial', status = 'trialing', trial_ends_at = now() + interval '3 days' where user_id = '${ALUNO}';
    update public.subscriptions set plan = 'trial', status = 'trialing', trial_ends_at = now() - interval '1 day' where user_id = '${ALUNO_FECHADO}';`);
}, 900_000);
afterAll(async () => {
  await dev?.db.close();
});

describe("Banco: tabelas fechadas, fila e Central de IAs", () => {
  it("a carga real tem as provas oficiais, com duplicatas de verdade entre o ENAMED 2025 e o Revalida 2025/2", async () => {
    expect(TOTAL).toBeGreaterThan(1000);
    const dup = await sql(`select count(*)::int n from (select public.similarity_text_hash(statement, options) h from public.questions group by 1 having count(*) > 1) x`);
    expect(dup[0].n).toBeGreaterThanOrEqual(20);
    expect((await sql(`select count(*)::int n from pg_indexes where indexname like 'question_embeddings_%_hnsw'`))[0].n).toBe(2);
  });

  it("aluno e visitante não leem nem gravam as tabelas do motor", async () => {
    await sql(`select public.similarity_refresh_state(null)`);
    for (const t of ["question_profiles", "question_embeddings", "question_relations", "question_relation_history", "question_similarity_state", "similarity_runs"]) {
      expect(await asRole(ALUNO, `select * from public.${t} limit 1`), t).toEqual([]);
      await expect(asRole(null, `select * from public.${t} limit 1`), t).rejects.toThrow(/permission denied/);
      await expect(asRole(ALUNO, `delete from public.${t}`), t).rejects.toThrow(/permission denied/);
    }
    await expect(asRole(ALUNO, `insert into public.question_relations (question_a, question_b, relation, score, confidence, origin) values ('a', 'b', 'mesmo_tema', 1, 1, 'regra')`)).rejects.toThrow(/permission denied/);
    expect((await sql(`select count(*)::int n from public.question_similarity_state`))[0].n).toBe(TOTAL);
    // RLS ligado nas 6
    const rls = await sql(`select relname from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity and relname = any ($1)`,
      [["question_profiles", "question_embeddings", "question_relations", "question_relation_history", "question_similarity_state", "similarity_runs"]]);
    expect(rls).toHaveLength(6);
  });

  it("as funções do processamento e as internas não são chamadas por aluno nem visitante", async () => {
    const fns = await sql<{ sig: string }>(`select p.oid::regprocedure::text sig from pg_proc p where p.pronamespace = 'public'::regnamespace
      and (p.proname like 'ch\\_worker\\_similarity\\_%' or p.proname like 'similarity\\_%' or p.proname = 'ai_function_keys')`);
    expect(fns.length).toBeGreaterThan(15);
    for (const role of ["anon", "authenticated"]) {
      const open = await sql(`select p.oid::regprocedure::text sig from pg_proc p where p.pronamespace = 'public'::regnamespace
        and (p.proname like 'ch\\_worker\\_similarity\\_%' or p.proname like 'similarity\\_%' or p.proname = 'ai_function_keys') and has_function_privilege($1, p.oid, 'execute')`, [role]);
      expect(open, role).toEqual([]);
    }
    await expect(rpc(ALUNO, "ch_worker_similarity_pending", { p_model: MODEL, p_engine: ENGINE_VERSION })).rejects.toThrow(/permission denied/);
    // as do contrato: visitante não chama nenhuma
    for (const f of ["app_related_questions(text,integer)", "app_start_related_question(text)", "app_admin_question_relations(text,integer,integer)",
      "app_admin_review_relation(uuid,text,text,text)", "app_admin_similarity_reprocess(text[])", "app_admin_similarity_classify(integer)", "app_admin_similarity_status()"]) {
      const [x] = await sql(`select has_function_privilege('anon', $1::regprocedure, 'execute') anon, has_function_privilege('authenticated', $1::regprocedure, 'execute') auth`, [`public.${f}`]);
      expect(x, f).toEqual({ anon: false, auth: true });
    }
  });

  it("a função Questões parecidas existe na Central de IAs e começa DESLIGADA; a fila aceita a etapa nova", async () => {
    const s = await rpc(EDITOR, "app_ai_summary");
    expect(s.functions.map((f: any) => f.key)).toEqual(["criacao", "verificacao", "engenharia_reversa", "assistente_preencher", "assistente_conferir", "assistente_revisar", "busca_fontes", "similaridade", "analise_mudancas", "treino_avaliacao"]);
    expect(s.functions.find((f: any) => f.key === "similaridade")).toMatchObject({ configured: false });
    expect(await sql(`select 1 from public.ai_functions where key = 'similaridade'`)).toEqual([]);
    expect((await sql(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'ch_jobs_step_check'`))[0].d).toMatch(/'similarity'/);
    // a versão do motor no banco é a mesma do servidor (trocar uma exige trocar a outra)
    expect((await sql(`select public.similarity_engine_version() v`))[0].v).toBe(ENGINE_VERSION);
    // sem a função ligada: a fila automática não põe nada, e a IA em lote é recusada em português
    expect((await sql(`select public.ch_worker_similarity_autoqueue() r`))[0].r).toBe(false);
    await expect(rpc(ADMIN, "app_admin_similarity_classify", { p_limit: 5 })).rejects.toThrow(/desligada na Central de IAs/);
    await expect(rpc(EDITOR, "app_admin_similarity_classify", { p_limit: 5 })).rejects.toThrow(/administradores/);
  });
});

describe("Perfis reais da revisão local (SQL do script)", () => {
  let total = 0;
  it("o script lê os arquivos da revisão e o SQL grava os perfis das questões que existem; colar de novo não muda nada", async () => {
    const { perfis, relato } = lerPerfis(FIXTURE_DIR);
    total = perfis.length;
    expect(total).toBeGreaterThan(150);
    expect(relato).toMatchObject({ provas: 2, com_perfil: total, sem_perfil: 0, avisos: [] });
    const text = sqlPerfis(perfis, relato);
    expect(text).not.toMatch(/embedding/i); // os vetores não são gerados aqui
    const r1 = await dev.db.exec(text);
    expect((r1[r1.length - 1].rows[0] as any).resultado).toMatch(new RegExp(`^OK: ${total} perfis`));
    const retrato = () => sql(`select question_id, md5((to_jsonb(p) - 'updated_at' - 'created_at')::text) h from public.question_profiles p order by 1`);
    const antes = await retrato();
    const datas = () => sql(`select question_id, updated_at::text u from public.question_profiles order by 1`);
    const datasAntes = await datas();
    await dev.db.exec(text);
    const depois = await retrato();
    expect(antes).toHaveLength(total);
    expect(depois).toEqual(antes);
    expect(await datas()).toEqual(datasAntes); // rodada 2: perfil igual não é regravado (nem a data muda)
    const row = (await sql(`select * from public.question_profiles where question_id = $1`, [perfis[0].id]))[0];
    expect(row).toMatchObject({ origem: "revisao_local", competencia: perfis[0].competencia, taxonomy_node_id: null, conceitos: perfis[0].conceitos });
    expect(row.basis_hash).toBe((await sql(`select public.similarity_text_hash(statement, options) h from public.questions where id = $1`, [perfis[0].id]))[0].h);
  });

  it("perfil gravado pela equipe não é sobrescrito, e o nó da taxonomia já gravado não é apagado ao colar de novo", async () => {
    const { perfis, relato } = lerPerfis(FIXTURE_DIR);
    const [a, b] = perfis;
    await sql(`update public.question_profiles set origem = 'revisor', updated_at = '2020-01-01' where question_id = $1`, [a.id]);
    await sql(`update public.question_profiles set taxonomy_node_id = 'teste-raiz.tema.subtema', taxonomy_parent_id = 'teste-raiz.tema' where question_id = $1`, [b.id]);
    await dev.db.exec(sqlPerfis(perfis, relato));
    expect((await sql(`select origem, updated_at::date::text d from public.question_profiles where question_id = $1`, [a.id]))[0]).toEqual({ origem: "revisor", d: "2020-01-01" });
    expect((await sql(`select taxonomy_node_id from public.question_profiles where question_id = $1`, [b.id]))[0].taxonomy_node_id).toBe("teste-raiz.tema.subtema");
    // volta ao estado da revisão (sem taxonomia)
    await sql(`update public.question_profiles set origem = 'revisao_local' where question_id = $1`, [a.id]);
    await sql(`update public.question_profiles set taxonomy_node_id = null, taxonomy_parent_id = null where question_id = $1`, [b.id]);
    expect((await sql(`select count(*)::int n from public.question_profiles where taxonomy_node_id is not null`))[0].n).toBe(0);
  });

  it("o mapa da taxonomia (quando existir) entra pelo script; id fora do formato é recusado", () => {
    const { perfis } = lerPerfis(FIXTURE_DIR);
    const id = perfis[0].id;
    const com = lerPerfis(FIXTURE_DIR, { [id]: { no: "teste-raiz.tema.subtema", pai: "teste-raiz.tema" }, [perfis[1].id]: "Com Espaço" });
    expect(com.perfis.find((p: any) => p.id === id)).toMatchObject({ taxonomy_node_id: "teste-raiz.tema.subtema", taxonomy_parent_id: "teste-raiz.tema" });
    expect(com.perfis.find((p: any) => p.id === perfis[1].id).taxonomy_node_id).toBeNull();
  });
});

describe("Motor sem a taxonomia (estado de hoje): só duplicata exata fica gravada", () => {
  it("quem não é da equipe não reprocessa; a equipe põe UM trabalho na fila (sem duplicar)", async () => {
    await expect(reprocess(ALUNO)).rejects.toThrow(/Acesso restrito à equipe/);
    await expect(reprocess(REV_GO)).rejects.toThrow(/Acesso restrito à equipe/);
    await expect(rpc(null, "app_admin_similarity_reprocess", {})).rejects.toThrow(/permission denied/);
    const r1 = await reprocess(EDITOR);
    expect(r1).toMatchObject({ queued: TOTAL, duplicate: false });
    const r2 = await reprocess(ADMIN);
    expect(r2).toMatchObject({ queued: TOTAL, duplicate: true, job_id: r1.job_id });
    expect((await sql(`select count(*)::int n from public.ch_jobs where step = 'similarity'`))[0].n).toBe(1);
  });

  it("o processamento roda sem vetor e sem IA: grava as duplicatas exatas reais e nada definitivo", async () => {
    embedCalls.texts = 0;
    expect(await drain(fakeEmbedder)).toBe(1);
    const run = await lastRun();
    expect(run).toMatchObject({ mode: "motor", status: "concluida", questions: TOTAL, embedded: 0, engine_version: ENGINE_VERSION, requested_by: EDITOR });
    expect(Number(run.cost_usd)).toBe(0);
    expect(run.duration_ms).toBeGreaterThan(0);
    expect(run.message).toMatch(/desligada na Central de IAs/);
    expect(embedCalls.texts).toBe(0); // função desligada: nada foi "enviado", nem com o gerador de vetores presente
    expect((await sql(`select count(*)::int n from public.question_embeddings`))[0].n).toBe(0);
    expect((await sql(`select status from public.ch_jobs where step = 'similarity'`))[0].status).toBe("succeeded");

    // toda duplicata exata real (mesmo enunciado e mesmas alternativas) virou par, com confiança 1
    const reais = await sql(`select array_agg(question_id order by question_id) ids from public.question_similarity_state group by text_hash having count(*) > 1`);
    expect(reais.length).toBeGreaterThanOrEqual(20);
    for (const { ids } of reais) {
      const [r] = await relations(`question_a = '${ids[0]}' and question_b = '${ids[1]}'`);
      expect(r, ids.join(" × ")).toMatchObject({ relation: "duplicada_exata", status: "proposta", origin: "regra", stale: false });
      expect(Number(r.confidence)).toBe(1);
    }
    // sem a taxonomia nada mais é definitivo: só duplicata exata, e o texto quase igual com confiança baixa
    const todas = await relations();
    expect(todas.length).toBeGreaterThanOrEqual(reais.length);
    for (const r of todas) {
      expect(["duplicada_exata", "duplicada_semantica"], `${r.question_a} × ${r.question_b}`).toContain(r.relation);
      if (r.relation === "duplicada_semantica") expect(Number(r.confidence)).toBeLessThanOrEqual(NO_TAXONOMY_CAP);
      expect(r.question_a < r.question_b).toBe(true);
    }
    expect((await sql(`select count(*)::int n from public.question_relation_history where event = 'criada'`))[0].n).toBe(todas.length);
  });

  it("o aluno não recebe nada (nem a cópia da mesma questão em outra prova)", async () => {
    const [{ ids }] = await sql(`select array_agg(question_id order by question_id) ids from public.question_similarity_state group by text_hash having count(*) > 1 limit 1`);
    expect(await rpc(ALUNO, "app_related_questions", { p_question_id: ids[0] })).toEqual({ items: [] });
    await expect(rpc(null, "app_related_questions", { p_question_id: ids[0] })).rejects.toThrow(/permission denied/);
    expect(await rpc(ALUNO, "app_related_questions", { p_question_id: "nao_existe" })).toEqual({ items: [] });
  });

  it("situação e lista da Administração; aluno barrado; a data da última execução é ISO", async () => {
    const st = await rpc(EDITOR, "app_admin_similarity_status");
    const n = (await relations()).length;
    expect(st).toMatchObject({ com_vetor: 0, relacoes: n, pendentes_revisao: n, questoes: TOTAL, pendentes_processar: 0, na_fila: false, funcao_ia_ligada: false });
    expect(st.perfis).toBeGreaterThan(150);
    expect(st.ultima_execucao).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(st.ultima_execucao_detalhe).toMatchObject({ status: "concluida", questions: TOTAL });
    await expect(rpc(ALUNO, "app_admin_similarity_status")).rejects.toThrow(/Acesso restrito à equipe de conteúdo/);
    await expect(rpc(ALUNO, "app_admin_question_relations")).rejects.toThrow(/Acesso restrito à equipe de conteúdo/);
    await expect(rpc(EDITOR, "app_admin_question_relations", { p_filter: "outro" })).rejects.toThrow(/Filtro inválido/);
    const dup = await rpc(EDITOR, "app_admin_question_relations", { p_filter: "duplicadas", p_limit: 5 });
    expect(dup.total).toBe(n);
    expect(dup.items).toHaveLength(5);
    expect(Object.keys(dup.items[0])).toEqual(expect.arrayContaining(["id", "a", "b", "relation", "score", "confidence", "reason", "status", "origin", "created_at"]));
    expect(Object.keys(dup.items[0].a)).toEqual(expect.arrayContaining(["id", "code", "excerpt", "subtema"]));
    expect(dup.items[0]).toMatchObject({ relation: "duplicada_exata", status: "proposta", origin: "regra", confidence_level: "alta" });
    expect(dup.items[0].a.excerpt.length).toBeLessThanOrEqual(160);
    const page2 = await rpc(EDITOR, "app_admin_question_relations", { p_filter: "duplicadas", p_limit: 5, p_offset: 5 });
    expect(page2.items.map((x: any) => x.id)).not.toEqual(expect.arrayContaining(dup.items.map((x: any) => x.id)));
    expect((await rpc(EDITOR, "app_admin_question_relations", { p_filter: "todas", p_limit: 200 })).items).toHaveLength(Math.min(n, 200));
  });
});

describe("Só o que mudou é reprocessado", () => {
  it("sem mudança, nada entra na fila; pedir uma questão reprocessa só ela", async () => {
    expect(await reprocess(EDITOR)).toMatchObject({ queued: 0, job_id: null });
    expect(await drain()).toBe(0);
    const [{ question_id: id }] = await sql(`select question_id from public.question_profiles order by 1 limit 1`);
    expect(await reprocess(EDITOR, [id])).toMatchObject({ queued: 1, duplicate: false });
    expect(await drain()).toBe(1);
    expect(await lastRun()).toMatchObject({ status: "concluida", questions: 1, relations_new: 0, relations_changed: 0, relations_removed: 0 });
    expect(await reprocess(EDITOR)).toMatchObject({ queued: 0 });
  });

  it("perfil que muda (some e volta) reprocessa só aquela questão", async () => {
    const { perfis, relato } = lerPerfis(FIXTURE_DIR);
    const id = perfis[5].id;
    await sql(`delete from public.question_profiles where question_id = $1`, [id]);
    expect(await reprocess(EDITOR)).toMatchObject({ queued: 1 });
    expect(await drain()).toBe(1);
    expect(await lastRun()).toMatchObject({ questions: 1 });
    await dev.db.exec(sqlPerfis(perfis, relato)); // o perfil real volta
    expect(await reprocess(EDITOR)).toMatchObject({ queued: 1 });
    expect(await drain()).toBe(1);
    expect(await lastRun()).toMatchObject({ questions: 1, status: "concluida" });
    expect(await reprocess(EDITOR)).toMatchObject({ queued: 0 });
    expect((await sql(`select count(*)::int n from public.similarity_runs`))[0].n).toBe(4);
  });
});

describe("Com o nó da taxonomia nas questões (derivado do tema real, só para o teste)", () => {
  it("as questões com perfil ganham o nó e só elas são reprocessadas", async () => {
    // nó = teste-<área>.<tema da questão>.<subtema da questão>; pai = teste-<área>.<tema> (campos reais topic e subtopic)
    const slugSql = (x: string) => `btrim(left(regexp_replace(public.similarity_norm(${x}), ' ', '-', 'g'), 50), '-')`;
    await dev.db.exec(`
      update public.question_profiles p
         set taxonomy_parent_id = 'teste-' || lower(q.area::text) || '.' || ${slugSql("q.topic")},
             taxonomy_node_id = 'teste-' || lower(q.area::text) || '.' || ${slugSql("q.topic")} || coalesce('.' || nullif(${slugSql("q.subtopic")}, ''), '')
        from public.questions q where q.id = p.question_id;`);
    const n = (await sql(`select count(*)::int n from public.question_profiles where taxonomy_node_id is not null`))[0].n;
    expect(n).toBeGreaterThan(150);
    expect(await reprocess(EDITOR)).toMatchObject({ queued: n });
    expect(await drain()).toBe(1);
    expect(await lastRun()).toMatchObject({ status: "concluida", questions: n });
  });

  it("mesmo tema não vira equivalente: mesmo raciocínio só com a mesma competência e o mesmo problema; duplicada só com texto igual", async () => {
    const novas = await relations(`relation not in ('duplicada_exata', 'duplicada_semantica')`);
    expect(novas.length).toBeGreaterThan(0);
    const perfil = new Map((await sql(`select question_id, competencia, taxonomy_node_id, taxonomy_parent_id from public.question_profiles`)).map((p: any) => [p.question_id, p]));
    const porTipo: Record<string, number> = {};
    for (const r of novas) {
      porTipo[r.relation] = (porTipo[r.relation] ?? 0) + 1;
      const a = perfil.get(r.question_a);
      const b = perfil.get(r.question_b);
      // relação definitiva só entre questões com o nó da taxonomia
      expect(a?.taxonomy_node_id && b?.taxonomy_node_id, `${r.question_a} × ${r.question_b}`).toBeTruthy();
      expect(r.signals.com_taxonomia).toBe(true);
      if (r.relation === "mesmo_raciocinio") {
        expect(a.competencia).toBe(b.competencia);
        expect(r.signals.competencia).toBe(1);
        expect(Math.max(r.signals.problema ?? 0, r.signals.raciocinio_texto ?? 0)).toBeGreaterThanOrEqual(0.5);
      }
      if (r.relation === "complementar") expect(a.competencia).not.toBe(b.competencia);
      // mesmo ramo da taxonomia com competências diferentes nunca é "mesmo raciocínio"
      if (a.competencia !== b.competencia) expect(r.relation).not.toBe("mesmo_raciocinio");
    }
    // duplicadas: só as que têm prova no texto
    for (const r of await relations(`relation in ('duplicada_exata', 'duplicada_semantica')`)) {
      expect(r.signals.texto >= 70 || r.signals.regra === "texto_igual" || (r.signals.via ?? []).includes("equivalente"), `${r.question_a} × ${r.question_b}`).toBe(true);
    }
    // os pares reais do mesmo tema existem nos dados (ex.: mais de uma questão do mesmo tema nas duas provas)
    expect((porTipo.mesmo_tema ?? 0) + (porTipo.mesmo_subtema ?? 0) + (porTipo.complementar ?? 0)).toBeGreaterThan(0);
  });
});

describe("Revisar relação, e o que o aluno recebe", () => {
  let rel: any; // um par real proposto, não duplicado, das mesmas provas
  let origem: string;
  let outra: string;

  it("aluno e revisor de outra área não decidem; a equipe aprova, e fica no registro e no histórico", async () => {
    rel = (await sql(`select r.*, qa.area area_a, qb.area area_b from public.question_relations r
       join public.questions qa on qa.id = r.question_a join public.questions qb on qb.id = r.question_b
      where r.relation not in ('duplicada_exata', 'duplicada_semantica') and r.status = 'proposta' and qa.area = qb.area
        and qa.status <> 'annulled' and qb.status <> 'annulled' and not qa.needs_image and not qb.needs_image
      order by (qa.area = 'GINECOLOGIA_OBSTETRICIA') desc, r.score desc, r.id limit 1`))[0];
    expect(rel).toBeTruthy();
    origem = rel.question_a;
    outra = rel.question_b;
    // antes de aprovar: confiança abaixo de alta não chega ao aluno
    const antes = await rpc(ALUNO, "app_related_questions", { p_question_id: origem });
    if (Number(rel.confidence) < 0.8) expect(antes.items.map((i: any) => i.id)).not.toContain(outra);

    await expect(rpc(ALUNO, "app_admin_review_relation", { p_id: rel.id, p_decision: "aprovar" })).rejects.toThrow(/Acesso restrito à equipe de conteúdo/);
    const foraDaArea = rel.area_a === "PEDIATRIA" ? REV_GO : REV_PED;
    await expect(rpc(foraDaArea, "app_admin_review_relation", { p_id: rel.id, p_decision: "aprovar" })).rejects.toThrow(/revisor médico das áreas destas questões/);
    await expect(rpc(EDITOR, "app_admin_review_relation", { p_id: rel.id, p_decision: "talvez" })).rejects.toThrow(/Decisão inválida/);
    await expect(rpc(EDITOR, "app_admin_review_relation", { p_id: rel.id, p_decision: "aprovar", p_relation: "parecida" })).rejects.toThrow(/Tipo de relação inválido/);
    await expect(rpc(EDITOR, "app_admin_review_relation", { p_id: U(999), p_decision: "aprovar" })).rejects.toThrow(/Relação não encontrada/);

    const r = await rpc(EDITOR, "app_admin_review_relation", { p_id: rel.id, p_decision: "aprovar", p_note: "Conferido no teste." });
    expect(r).toMatchObject({ id: rel.id, status: "aprovada", relation: rel.relation, origin: rel.origin, review_note: "Conferido no teste.", stale: false });
    const [row] = await relations(`id = '${rel.id}'`);
    expect(row).toMatchObject({ status: "aprovada", reviewed_by: EDITOR });
    expect(row.reviewed_at).toBeTruthy();
    const [log] = await sql(`select * from public.admin_audit_log where action = 'similarity.relation.review' order by id desc limit 1`);
    expect(log).toMatchObject({ actor_id: EDITOR, target: rel.id });
    expect(log.details).toMatchObject({ decision: "aprovar", question_a: rel.question_a, question_b: rel.question_b });
    expect((await sql(`select event, actor_id from public.question_relation_history where relation_id = $1 order by id desc limit 1`, [rel.id]))[0]).toEqual({ event: "aprovada", actor_id: EDITOR });
  });

  it("o aluno recebe a questão relacionada aprovada, só com os campos do contrato: sem gabarito, sem explicação, sem citar IA", async () => {
    const r = await rpc(ALUNO, "app_related_questions", { p_question_id: origem });
    const item = r.items.find((i: any) => i.id === outra);
    expect(item, JSON.stringify(r)).toBeTruthy();
    expect(Object.keys(item).sort()).toEqual(CONTRATO_ALUNO);
    const q = (await sql(`select q.*, e.title from public.questions q join public.exams e on e.id = q.exam_id where q.id = $1`, [outra]))[0];
    expect(item).toMatchObject({ id: outra, code: q.code, number: q.number, area: q.area, tema: q.topic, subtema: q.subtopic, exam_label: q.title, relation: rel.relation, answered: false, locked: false });
    expect(["Raciocínio semelhante", "Questão complementar: mesmo assunto, outra etapa", "Mesmo subtema", "Mesmo tema, outra abordagem"]).toContain(item.reason);
    const texto = JSON.stringify(r);
    expect(texto).not.toMatch(/correct_option|explanation|gabarito|\bIA\b|statement|problema_central|raciocinio/i);
    for (const i of r.items) expect(["mesmo_raciocinio", "complementar", "mesmo_subtema", "mesmo_tema"]).toContain(i.relation);
    // pelo outro lado do par também (o par é um só)
    expect((await rpc(ALUNO, "app_related_questions", { p_question_id: outra })).items.map((i: any) => i.id)).toContain(origem);
    expect((await rpc(ALUNO, "app_related_questions", { p_question_id: origem, p_limit: 1 })).items).toHaveLength(1);
  });

  it("a questão respondida aparece como respondida; a anulada e a rejeitada não aparecem", async () => {
    const s = await rpc(ALUNO, "app_start_related_question", { p_question_id: outra });
    expect(s.count).toBe(1);
    await rpc(ALUNO, "app_answer_question", { p_session_id: s.session_id, p_question_id: outra, p_option: "A", p_active_ms: 1000 });
    expect((await rpc(ALUNO, "app_related_questions", { p_question_id: origem })).items.find((i: any) => i.id === outra)).toMatchObject({ answered: true });
    await rpc(EDITOR, "app_admin_review_relation", { p_id: rel.id, p_decision: "rejeitar", p_note: "Teste: rejeitada." });
    expect((await rpc(ALUNO, "app_related_questions", { p_question_id: origem })).items.map((i: any) => i.id)).not.toContain(outra);
    expect((await relations(`id = '${rel.id}'`))[0]).toMatchObject({ status: "rejeitada", relation: rel.relation });
    // volta a aprovar corrigindo o tipo: a origem passa a ser o revisor
    const outroTipo = rel.relation === "mesmo_subtema" ? "mesmo_tema" : "mesmo_subtema";
    expect(await rpc(EDITOR, "app_admin_review_relation", { p_id: rel.id, p_decision: "aprovar", p_relation: outroTipo })).toMatchObject({ status: "aprovada", relation: outroTipo, origin: "revisor" });
    expect((await rpc(ALUNO, "app_related_questions", { p_question_id: origem })).items.find((i: any) => i.id === outra)).toMatchObject({ relation: outroTipo });
    // questão anulada não é oferecida (a situação real da questão volta depois)
    const [{ status }] = await sql(`select status from public.questions where id = $1`, [outra]);
    await sql(`update public.questions set status = 'annulled' where id = $1`, [outra]);
    expect((await rpc(ALUNO, "app_related_questions", { p_question_id: origem })).items.map((i: any) => i.id)).not.toContain(outra);
    await expect(rpc(ALUNO, "app_start_related_question", { p_question_id: outra })).rejects.toThrow(/anulada/);
    await sql(`update public.questions set status = $2 where id = $1`, [outra, status]);
  });

  it("o par revisado não é trocado pelo reprocessamento, e a duplicata aprovada continua fora da lista do aluno", async () => {
    const antes = (await relations(`id = '${rel.id}'`))[0];
    expect(await reprocess(EDITOR, [origem, outra])).toMatchObject({ queued: 2 });
    expect(await drain()).toBe(1);
    expect((await relations(`id = '${rel.id}'`))[0]).toMatchObject({ status: "aprovada", relation: antes.relation, origin: "revisor", stale: false });
    const [dup] = await relations(`relation = 'duplicada_exata' limit 1`);
    await rpc(EDITOR, "app_admin_review_relation", { p_id: dup.id, p_decision: "aprovar" });
    expect((await rpc(ALUNO, "app_related_questions", { p_question_id: dup.question_a })).items.map((i: any) => i.id)).not.toContain(dup.question_b);
  });

  it("revisor médico da área decide os pares da área dele e só vê esses na lista", async () => {
    const go = (await sql(`select r.id from public.question_relations r join public.questions qa on qa.id = r.question_a join public.questions qb on qb.id = r.question_b
      where r.status = 'proposta' and qa.area = 'GINECOLOGIA_OBSTETRICIA' and qb.area = 'GINECOLOGIA_OBSTETRICIA' order by r.id limit 1`))[0];
    expect(go).toBeTruthy();
    expect(await rpc(REV_GO, "app_admin_review_relation", { p_id: go.id, p_decision: "aprovar" })).toMatchObject({ status: "aprovada" });
    await expect(rpc(REV_PED, "app_admin_review_relation", { p_id: go.id, p_decision: "rejeitar" })).rejects.toThrow(/revisor médico das áreas/);
    const lista = await rpc(REV_GO, "app_admin_question_relations", { p_filter: "todas", p_limit: 200 });
    expect(lista.total).toBeGreaterThan(0);
    expect(lista.items.every((i: any) => i.a.area === "GINECOLOGIA_OBSTETRICIA" && i.b.area === "GINECOLOGIA_OBSTETRICIA")).toBe(true);
    expect(lista.total).toBeLessThan((await rpc(EDITOR, "app_admin_question_relations", { p_filter: "todas" })).total);
  });

  it("cadeado das Questões Inéditas: quem está fechado não recebe a inédita na lista nem abre o treino dela", async () => {
    // uma questão real das provas é marcada como inédita SÓ neste banco de teste, para exercitar o cadeado
    await sql(`update public.questions set origin = 'staziamed', exam_id = 'staziamed', number = 9001, inep_intent = null, sources = '[]'::jsonb where id = $1`, [outra]);
    const aberto = await rpc(ALUNO, "app_related_questions", { p_question_id: origem });
    expect(aberto.items.find((i: any) => i.id === outra)).toMatchObject({ exam_label: "Questões Inéditas", locked: false });
    expect((await rpc(ALUNO_FECHADO, "app_related_questions", { p_question_id: origem })).items.map((i: any) => i.id)).not.toContain(outra);
    // a inédita como origem: fechado não recebe nada
    expect(await rpc(ALUNO_FECHADO, "app_related_questions", { p_question_id: outra })).toEqual({ items: [] });
    await expect(rpc(ALUNO_FECHADO, "app_start_related_question", { p_question_id: outra })).rejects.toThrow(/Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia/);
    const s = await rpc(ALUNO, "app_start_related_question", { p_question_id: outra });
    expect(s).toMatchObject({ count: 1 });
    expect((await sql(`select user_id, kind, question_ids from public.practice_sessions where id = $1`, [s.session_id]))[0]).toEqual({ user_id: ALUNO, kind: "questoes", question_ids: [outra] });
    // a sessão abre pela função de sempre do treino
    expect((await rpc(ALUNO, "app_get_session", { p_session_id: s.session_id })).questions).toHaveLength(1);
    await expect(rpc(null, "app_start_related_question", { p_question_id: origem })).rejects.toThrow(/permission denied/);
    await expect(rpc(ALUNO, "app_start_related_question", { p_question_id: "nao_existe" })).rejects.toThrow(/Questão não encontrada/);
    // o aluno fechado continua abrindo a questão oficial
    expect(await rpc(ALUNO_FECHADO, "app_start_related_question", { p_question_id: origem })).toMatchObject({ count: 1 });
  });
});

describe("Vetores (de teste, derivados do texto real) só com a função ligada; IA só nos duvidosos", () => {
  it("ligar a função na Central de IAs é o que libera os vetores; cada texto vira vetor uma vez só", async () => {
    const total = TOTAL;
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: true });
    await db.service("ch_worker_ai_save_price", { p_actor: ADMIN, p_provider: "anthropic", p_model: "modelo-de-teste", p_price: { input_per_mtok: 4, output_per_mtok: 20 } });
    await db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: "similaridade", p_config: { mode: "sozinha", primary_ref: { provider: "anthropic", model: "modelo-de-teste" }, fallback_ref: null, reviewers: [], care: "caprichado" } });
    invalidateAiConfig(db);
    resetEmbeddingsPermission();
    expect((await rpc(EDITOR, "app_admin_similarity_status")).funcao_ia_ligada).toBe(true);

    // parte das questões ainda "não reclassificada": as de Pediatria ficam sem o nó da taxonomia (como todas estão hoje)
    await sql(`update public.question_profiles p set taxonomy_node_id = null, taxonomy_parent_id = null from public.questions q where q.id = p.question_id and q.area = 'PEDIATRIA'`);
    embedCalls.texts = 0;
    const r = await reprocess(EDITOR, (await sql(`select id from public.questions`)).map((q: any) => q.id));
    expect(r).toMatchObject({ queued: total, duplicate: false });
    expect(await drain(fakeEmbedder)).toBe(1);
    const run = await lastRun();
    expect(run).toMatchObject({ status: "concluida", questions: total, embedded: total * 2, model: MODEL });
    expect(embedCalls.texts).toBe(total * 2);
    expect(Number(run.cost_usd)).toBeGreaterThan(0);
    expect(run.tokens).toBeGreaterThan(0);
    const vs = await sql(`select kind, model, dims, version, count(*)::int n, bool_and(array_length(embedding, 1) = 768) ok from public.question_embeddings group by 1, 2, 3, 4 order by 1`);
    expect(vs).toEqual([{ kind: "clinico", model: MODEL, dims: 768, version: EMBED_TEXT_VERSION, n: total, ok: true }, { kind: "tematico", model: MODEL, dims: 768, version: EMBED_TEXT_VERSION, n: total, ok: true }]);
    // a impressão digital do vetor é a do texto atual
    expect((await sql(`select count(*)::int n from public.question_embeddings e join public.question_similarity_state s on s.question_id = e.question_id
      where (e.kind = 'tematico' and e.basis_hash = s.tematico_hash) or (e.kind = 'clinico' and e.basis_hash = s.clinico_hash)`))[0].n).toBe(total * 2);
    expect((await sql(`select count(*)::int n from public.ch_ai_runs where prompt_id = 'question_embedding'`))[0].n).toBeGreaterThan(0);
    expect((await rpc(EDITOR, "app_admin_similarity_status")).com_vetor).toBe(total);
    // com pgvector, os vizinhos de uma questão saem na ordem do cosseno (conferido com a conta feita aqui, sobre os mesmos textos)
    const ped = await sql<{ question_id: string; clinico: string }>(`select t.question_id, t.clinico from public.similarity_texts((select array_agg(id) from public.questions where exam_id = 'revalida-2021' and area = 'PEDIATRIA')) t order by 1`);
    const vizinhos = await sql<{ question_id: string; cos: number }>(`select * from public.similarity_vector_neighbors($1, 'clinico', $2, 200, true)`, [ped[0].question_id, MODEL]);
    const daProva = vizinhos.filter((v) => ped.some((p) => p.question_id === v.question_id));
    const esperado = ped.slice(1).map((p) => ({ id: p.question_id, cos: cosseno(vetorDoTexto(ped[0].clinico), vetorDoTexto(p.clinico)) })).sort((a, b) => b.cos - a.cos);
    expect(daProva.length).toBeGreaterThan(5);
    expect(daProva.map((v) => v.question_id)).toEqual(esperado.filter((e) => daProva.some((v) => v.question_id === e.id)).map((e) => e.id));
    expect(daProva[0].cos).toBeCloseTo(esperado.find((e) => e.id === daProva[0].question_id)!.cos, 3);

    // de novo: nenhum texto mudou, nenhum vetor novo
    embedCalls.texts = 0;
    await reprocess(EDITOR, [(await sql(`select id from public.questions order by 1 limit 1`))[0].id]);
    expect(await drain(fakeEmbedder)).toBe(1);
    expect(embedCalls.texts).toBe(0);
    expect(await lastRun()).toMatchObject({ questions: 1, embedded: 0 });
  });

  it("par achado só pelo vetor, sem a taxonomia nas duas questões, fica como proposta de confiança baixa", async () => {
    const semTax = await sql(`select r.* from public.question_relations r
      where r.status = 'proposta' and r.relation <> 'duplicada_exata' and (r.signals ->> 'com_taxonomia') = 'false'`);
    expect(semTax.length).toBeGreaterThan(0);
    for (const r of semTax) {
      expect(Number(r.confidence), `${r.question_a} × ${r.question_b}`).toBeLessThanOrEqual(NO_TAXONOMY_CAP);
      expect((r.signals.via as string[]).some((v) => v.startsWith("vetor")) || r.relation === "duplicada_semantica").toBe(true);
      expect(r.signals.cos_c).not.toBeNull();
    }
    const baixa = await rpc(EDITOR, "app_admin_question_relations", { p_filter: "baixa_confianca", p_limit: 200 });
    expect(baixa.total).toBeGreaterThanOrEqual(semTax.length);
    expect(baixa.items.every((i: any) => i.confidence < 0.6 && i.confidence_level === "baixa" && i.status === "proposta")).toBe(true);
    // nenhum desses chega ao aluno
    const r = semTax[0];
    expect((await rpc(ALUNO, "app_related_questions", { p_question_id: r.question_a })).items.map((i: any) => i.id)).not.toContain(r.question_b);
  });

  it("a fila automática só anda com a função ligada e com questão que mudou", async () => {
    expect((await sql(`select public.ch_worker_similarity_autoqueue() r`))[0].r).toBe(false); // nada mudou
    const [{ question_id: id }] = await sql(`select question_id from public.question_profiles where taxonomy_node_id <> taxonomy_parent_id order by 1 desc limit 1`);
    await sql(`update public.question_profiles set taxonomy_node_id = taxonomy_parent_id where question_id = $1`, [id]); // reclassificada no nó de cima (derivado do tema real)
    expect((await sql(`select public.ch_worker_similarity_autoqueue() r`))[0].r).toBe(true);
    expect((await sql(`select public.ch_worker_similarity_autoqueue() r`))[0].r).toBe(false); // já tem um na fila
    embedCalls.texts = 0;
    expect(await drain(fakeEmbedder)).toBe(1);
    expect(embedCalls.texts).toBe(1); // só o texto temático daquela questão mudou
    expect(await lastRun()).toMatchObject({ questions: 1, embedded: 1, requested_by: null });
  });

  it("IA em lote: só administrador, só os pares duvidosos, grava o gasto na Central de IAs e nunca aprova", async () => {
    const duvidosos = (await sql(`select id from public.question_relations where status = 'proposta' and origin in ('regra', 'vetor') and relation <> 'duplicada_exata' and not stale and confidence < 0.6`)).map((x: any) => x.id);
    expect(duvidosos.length).toBeGreaterThan(0);
    await expect(rpc(EDITOR, "app_admin_similarity_classify", { p_limit: 6 })).rejects.toThrow(/administradores/);
    const pedido = await rpc(ADMIN, "app_admin_similarity_classify", { p_limit: 6 });
    const n = Math.min(6, duvidosos.length);
    expect(pedido).toMatchObject({ queued: n, duplicate: false });
    expect(await rpc(ADMIN, "app_admin_similarity_classify", { p_limit: 6 })).toMatchObject({ duplicate: true });
    aiSeen.length = 0;
    expect(await drain()).toBe(1);
    const run = await lastRun();
    expect(run).toMatchObject({ mode: "ia", status: "concluida", ai_pairs: n, requested_by: ADMIN });
    expect(Number(run.cost_usd)).toBeGreaterThan(0); // 1.000 de entrada e 200 de saída por chamada, pelo preço cadastrado
    expect(aiSeen).toHaveLength(n);
    expect(aiSeen.every((id) => duvidosos.includes(id))).toBe(true); // só pares duvidosos foram enviados
    const feitos = await relations(`id = any (array[${aiSeen.map((id) => `'${id}'`).join(",")}]::uuid[])`);
    for (const r of feitos) {
      expect(r).toMatchObject({ origin: "ia", status: "proposta" }); // a IA não aprova
      expect(Number(r.confidence)).toBe(0.9);
      expect(r.signals.ia).toMatchObject({ model: "modelo-de-teste" });
      // o que a IA reclassificou não chega ao aluno antes de uma pessoa aprovar, mesmo com confiança alta
      expect((await rpc(ALUNO, "app_related_questions", { p_question_id: r.question_a })).items.map((i: any) => i.id)).not.toContain(r.question_b);
    }
    const calls = await sql(`select function_key, source, outcome, provider from public.ai_calls where function_key = 'similaridade'`);
    expect(calls.length).toBe(Math.ceil(n / 4));
    expect(calls.every((c: any) => c.source === "similaridade" && c.outcome === "ok" && c.provider === "anthropic")).toBe(true);
    expect((await sql(`select count(*)::int n from public.question_relation_history where event = 'ia'`))[0].n).toBe(n);
    // par da IA com a mesma base não é desfeito pelo motor
    const r0 = feitos[0];
    await reprocess(EDITOR, [r0.question_a]);
    expect(await drain(fakeEmbedder)).toBe(1);
    expect((await relations(`id = '${r0.id}'`))[0]).toMatchObject({ origin: "ia", relation: r0.relation });
  });

  it("função desligada de novo: o pedido de IA que ficou na fila morre com o aviso, e nenhum vetor novo é gerado", async () => {
    // pedido feito com a função ligada, que é desligada antes de o pedido rodar
    const pedido = await rpc(ADMIN, "app_admin_similarity_classify", { p_limit: 4 });
    expect(pedido).toMatchObject({ duplicate: false });
    expect(pedido.job_id).toBeTruthy();
    await db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: "similaridade", p_config: null });
    invalidateAiConfig(db);
    aiSeen.length = 0;
    expect(await drain()).toBe(1);
    expect(aiSeen).toEqual([]);
    expect((await sql(`select status, error from public.ch_jobs where id = $1`, [pedido.job_id]))[0]).toMatchObject({ status: "dead" });
    expect(await lastRun()).toMatchObject({ mode: "ia", status: "falhou" });
    expect((await lastRun()).message).toMatch(/desligada na Central de IAs.*peça a classificação de novo/);
    const [{ question_id: id }] = await sql(`select question_id from public.question_profiles where taxonomy_node_id <> taxonomy_parent_id order by 1 limit 1`);
    await sql(`update public.question_profiles set taxonomy_node_id = taxonomy_parent_id where question_id = $1`, [id]);
    embedCalls.texts = 0;
    expect(await reprocess(EDITOR)).toMatchObject({ queued: 1 });
    expect(await drain(fakeEmbedder)).toBe(1);
    expect(embedCalls.texts).toBe(0);
    expect(await lastRun()).toMatchObject({ status: "concluida", questions: 1, embedded: 0 });
    expect((await sql(`select public.ch_worker_similarity_autoqueue() r`))[0].r).toBe(false);
    await expect(rpc(ADMIN, "app_admin_similarity_classify", { p_limit: 5 })).rejects.toThrow(/desligada na Central de IAs/);
  });
});

describe("Medição (precision@5 e recall@20)", () => {
  it("o arquivo de pares revisados está vazio de propósito e o script não inventa métrica", () => {
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/similaridade/pares-revisados.json"), "utf8"));
    expect(doc.formato).toBe("staziamed.similaridade.pares-revisados.v1");
    expect(doc.pares).toEqual([]);
    expect(lerPares(doc)).toEqual({ pares: [], erros: [] });
    expect(avaliar([], [])).toMatchObject({ questoes_avaliadas: 0, precision_at_5: null, recall_at_20: null, tipo_certo: null, pares_julgados: 0 });
  });

  it("com as relações reais do banco de teste e sem pares julgados, as contas não devolvem número", async () => {
    const rels = await relations();
    expect(rels.length).toBeGreaterThan(0);
    expect(avaliar(rels, [])).toMatchObject({ questoes_avaliadas: 0, precision_at_5: null, recall_at_20: null });
    // par fora do formato é recusado com o motivo (não entra na conta)
    expect(lerPares({ pares: [{ a: "x", b: "x", relacao: "mesmo_tema", revisado_por: "m" }, { a: "x", b: "y", relacao: "parecida", revisado_por: "m" }, { a: "x", b: "y", relacao: "mesmo_tema" }] }).erros).toHaveLength(3);
  });
});

describe("Sem pgvector (bancos de teste e o banco do navegador)", () => {
  it("não há índice HNSW, os vizinhos saem na ordem do cosseno pela conta direta, e as candidatas trazem o mesmo cosseno", async () => {
    const pg = await abrirBanco(semPgvector());
    try {
      expect((await pg.query(`select 1 from pg_indexes where indexname like 'question_embeddings_%_hnsw'`)).rows).toEqual([]);
      // questões reais da carga (uma área de uma prova), com vetores derivados do enunciado real
      const qs = (await pg.query<{ id: string; statement: string }>(`select id, statement from public.questions where exam_id = 'revalida-2021' and area = 'PEDIATRIA' order by id`)).rows;
      expect(qs.length).toBeGreaterThan(5);
      const vec = new Map(qs.map((q) => [q.id, vetorDoTexto(q.statement)]));
      await pg.query(`select public.similarity_refresh_state(null)`);
      await pg.query(`select public.ch_worker_similarity_save_embeddings($1, 'q1', $2::jsonb)`, [MODEL, JSON.stringify(qs.flatMap((q) => ["tematico", "clinico"].map((kind) => ({ question_id: q.id, kind, basis_hash: "h", embedding: vec.get(q.id) }))))]);
      const viz = (await pg.query<{ question_id: string; cos: number }>(`select * from public.similarity_vector_neighbors($1, 'clinico', $2, 5, true)`, [qs[0].id, MODEL])).rows;
      const esperado = qs.slice(1).map((q) => ({ id: q.id, cos: cosseno(vec.get(qs[0].id)!, vec.get(q.id)!) })).sort((a, b) => b.cos - a.cos);
      expect(viz.map((v) => v.question_id)).toEqual(esperado.slice(0, 5).map((e) => e.id));
      expect(viz[0].cos).toBeCloseTo(esperado[0].cos, 4);
      const ctx = (await pg.query<{ r: any }>(`select public.ch_worker_similarity_candidates($1, $2, 20) r`, [qs[0].id, MODEL])).rows[0].r;
      expect(ctx.question).toMatchObject({ id: qs[0].id, has_vectors: true });
      for (const e of esperado) {
        const c = ctx.candidates.find((x: any) => x.id === e.id);
        expect(c, e.id).toBeTruthy();
        expect(c.cos_c).toBeCloseTo(e.cos, 3);
        expect(c.via).toEqual(expect.arrayContaining(["vetor_clinico"]));
      }
      // vetor fora do tamanho é recusado
      await expect(pg.query(`select public.ch_worker_similarity_save_embeddings($1, 'q1', $2::jsonb)`, [MODEL, JSON.stringify([{ question_id: qs[0].id, kind: "clinico", basis_hash: "h", embedding: [1, 2, 3] }])])).rejects.toThrow(/tamanho diferente de 768/);
    } finally {
      await pg.close();
    }
  });
});
