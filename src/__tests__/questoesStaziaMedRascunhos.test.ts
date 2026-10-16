// @vitest-environment node
/**
 * Questões StaziaMed — rascunhos no banco (migração 9800, antigas 6200 e 8800; parte 1): o hash do conteúdo é calculado pelo banco, a carga
 * antiga não apaga o que foi editado no servidor, os 200 importados ficam na trilha, pedidos/propostas/trilha só para a
 * equipe e os revisores, as etapas novas da fila e as funções de serviço fechadas para o app.
 */
import fs from "fs";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildDraftStatements } from "../../scripts/supabase/engine-seed";
import { addOfficialSource, insertDraft, openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

// banco PGlite + recarga dos 200 rascunhos: com a máquina cheia (vários testes em paralelo) 5 s não bastam
vi.setConfig({ testTimeout: 120_000 });

let env: StaziaEnv;
const hashOf = async (id: string) => (await env.sql(`select content_hash from public.draft_questions where id = $1`, [id]))[0].content_hash as string;

beforeAll(async () => {
  env = await openStaziaEnv({ drafts: true });
}, 600_000);
afterAll(async () => {
  await env?.close();
}, 60_000);

describe("Rascunhos com hash no banco", () => {
  it("o hash do rascunho é do banco: muda com enunciado, tabela, alternativas, gabarito, explicações, decisão clínica, tema e citações; não muda com título", async () => {
    const id = await insertDraft(env);
    let previous = await hashOf(id);
    expect(previous).toMatch(/^[0-9a-f]{64}$/);
    const changes: [string, string][] = [
      ["enunciado", `stem = stem || ' Afebril há 24 horas.'`],
      ["tipo da tabela", `support_type = 'TABLE'`],
      ["título da tabela", `support_title = 'Exames da admissão'`],
      ["linhas da tabela", `support_rows = '[{"label": "Hemoglobina", "value": "11 g/dL"}]'::jsonb`],
      ["alternativas", `alternatives = jsonb_set(alternatives, '{C}', '"Azitromicina por 5 dias."')`],
      ["gabarito", `correct_answer = 'B'`],
      ["explicação geral", `explanation = explanation || ' Revisado.'`],
      ["explicações por alternativa", `alternative_explanations = jsonb_set(alternative_explanations, '{C}', '"Incorreta. Outra escolha."')`],
      ["decisão clínica", `clinical_decision = clinical_decision || ' Reavaliar em 48 horas.'`],
      ["tema", `topic = 'Otite média aguda'`],
      ["citações", `source_citations = '[]'::jsonb`],
    ];
    for (const [name, set] of changes) {
      await env.sql(`update public.draft_questions set ${set} where id = $1`, [id]);
      const now = await hashOf(id);
      expect(now, name).not.toBe(previous);
      previous = now;
    }
    await env.sql(`update public.draft_questions set title = 'Outro título', status = 'needs_changes', review_note = 'nota' where id = $1`, [id]);
    expect(await hashOf(id)).toBe(previous);
    // gravar o hash à mão não adianta: o gatilho recalcula
    await env.sql(`update public.draft_questions set content_hash = 'forjado' where id = $1`, [id]);
    expect(await hashOf(id)).toBe(previous);
    const [r] = await env.sql(`select public.draft_content_hash(d) = d.content_hash as same from public.draft_questions d where d.id = $1`, [id]);
    expect(r.same).toBe(true);
  });

  it("os 200 importados têm a trilha 'importada' com o hash atual (reaplicar a carga não duplica; rascunho do servidor não entra)", async () => {
    const serverDraft = await insertDraft(env);
    expect(await env.sql(`select kind from public.draft_question_events where draft_id = $1`, [serverDraft])).toEqual([]);
    const [r] = await env.sql(`
      select count(*)::int as n, count(distinct e.draft_id)::int as drafts,
             count(*) filter (where e.content_hash = d.content_hash)::int as same_hash,
             count(*) filter (where d.generated_by = 'gerador_antigo')::int as legacy
      from public.draft_question_events e join public.draft_questions d on d.id = e.draft_id where e.kind = 'importada'`);
    expect(r).toEqual({ n: 200, drafts: 200, same_hash: 200, legacy: 200 });
  });

  it("rascunho editado no servidor não é sobrescrito pela carga antiga; o não editado volta ao arquivo e a 'aguardando'", async () => {
    const [a, b] = await env.sql(`select id, stem from public.draft_questions where generated_by = 'gerador_antigo' order by batch, slot limit 2`);
    await env.sql(`update public.draft_questions set edited_at = now(), stem = 'X' where id = $1`, [a.id]);
    const editedHash = await hashOf(a.id);
    await env.sql(`update public.draft_questions set stem = 'Y', status = 'needs_changes' where id = $1`, [b.id]);
    for (const st of buildDraftStatements()) await env.dev.db.exec(st);
    const rows = await env.sql(`select id, stem, status, content_hash from public.draft_questions where id in ($1, $2)`, [a.id, b.id]);
    const A = rows.find((x) => x.id === a.id);
    const B = rows.find((x) => x.id === b.id);
    expect(A.stem).toBe("X");
    expect(A.content_hash).toBe(editedHash);
    expect(B.stem).toBe(b.stem);
    expect(B.status).toBe("awaiting_medical_review");
    const [fresh] = await env.sql(`select public.draft_content_hash(d) as h from public.draft_questions d where d.id = $1`, [b.id]);
    expect(B.content_hash).toBe(fresh.h);
    // devolve o A ao que o arquivo trouxe: os testes não dependem da ordem (a trilha 'importada' continua com o hash atual)
    await env.sql(`update public.draft_questions set stem = $2, edited_at = null where id = $1`, [a.id, a.stem]);
    expect(await hashOf(a.id)).toBe((await env.sql(`select content_hash from public.draft_question_events where draft_id = $1 and kind = 'importada'`, [a.id]))[0].content_hash);
  });

  it("draft_event grava quem, o hash atual, o conteúdo anterior e a observação; tipo fora da lista é recusado", async () => {
    const id = await insertDraft(env);
    await env.sql(`select public.draft_event($1, 'editada', 'Ajuste da dose.', '{"stem": "antes"}'::jsonb, '{"campo": "stem"}'::jsonb, $2)`, [id, USERS.EDITOR]);
    // sem p_actor, o ator é quem está logado
    await env.dev.db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: USERS.ADMIN })]);
      await tx.query(`select public.draft_event($1, 'conferida')`, [id]);
    });
    const events = await env.sql(`select kind, actor_id, content_hash, previous, note, details from public.draft_question_events where draft_id = $1 order by id`, [id]);
    const hash = await hashOf(id);
    expect(events).toEqual([
      { kind: "editada", actor_id: USERS.EDITOR, content_hash: hash, previous: { stem: "antes" }, note: "Ajuste da dose.", details: { campo: "stem" } },
      { kind: "conferida", actor_id: USERS.ADMIN, content_hash: hash, previous: null, note: null, details: {} },
    ]);
    await expect(env.sql(`select public.draft_event($1, 'inventada')`, [id])).rejects.toThrow(/check/);
  });
});

describe("Pedidos, propostas e trilha", () => {
  const TABLES = ["staziamed_requests", "draft_source_proposals", "draft_question_events"];

  it("pedidos, propostas e trilha: equipe e revisores leem; aluno não lê nada", async () => {
    const [draft] = await env.sql(`select id, content_hash from public.draft_questions where area = 'PEDIATRIA' order by batch, slot limit 1`);
    await env.sql(`insert into public.staziamed_requests (created_by, mode, area, topic, count) values ($1, 'tema', 'PEDIATRIA', 'Otite média aguda', 2)`, [USERS.EDITOR]);
    await env.sql(`insert into public.draft_source_proposals (draft_id, content_hash, claims, complete) values ($1, $2, '[]'::jsonb, false)`, [draft.id, draft.content_hash]);
    for (const t of TABLES) {
      for (const uid of [USERS.TESTE, USERS.PRO]) expect(await env.sqlAs(uid, `select id from public.${t}`), `${t} lido por aluno`).toEqual([]);
      for (const uid of [USERS.REVISOR_PED, USERS.EDITOR, USERS.ADMIN]) {
        expect((await env.sqlAs(uid, `select id from public.${t}`)).length, `${t} lido pela equipe/revisor da área`).toBeGreaterThan(0);
      }
      // Leva 4 (9830): o revisor de OUTRA área não lê a proposta nem a trilha do rascunho de Pediatria; o pedido (sem área) continua aberto a revisores
      const outra = t === "staziamed_requests" ? await env.sqlAs(USERS.REVISOR_CM, `select id from public.${t}`) : await env.sqlAs(USERS.REVISOR_CM, `select id from public.${t} where draft_id = $1`, [draft.id]);
      expect(outra.length, `${t} lido pelo revisor de outra área`).toBe(t === "staziamed_requests" ? 1 : 0);
    }
    // escrita só pelas funções do banco: nem a equipe grava direto
    await expect(env.sqlAs(USERS.ADMIN, `insert into public.staziamed_requests (created_by, mode, count) values ($1, 'tema', 1)`, [USERS.ADMIN])).rejects.toThrow(/row-level security/);
    await expect(env.sqlAs(USERS.EDITOR, `insert into public.draft_source_proposals (draft_id, content_hash, claims, complete) values ($1, 'x', '[]', true)`, [draft.id])).rejects.toThrow(/row-level security/);
    await expect(env.sqlAs(USERS.EDITOR, `insert into public.draft_question_events (draft_id, kind) values ($1, 'editada')`, [draft.id])).rejects.toThrow(/row-level security/);
    const before = await env.sql(`select (select count(*) from public.draft_question_events)::int as e, (select count(*) from public.draft_source_proposals)::int as p, (select count(*) from public.staziamed_requests)::int as r`);
    for (const t of TABLES) await env.sqlAs(USERS.ADMIN, `delete from public.${t}`);
    expect(await env.sql(`select (select count(*) from public.draft_question_events)::int as e, (select count(*) from public.draft_source_proposals)::int as p, (select count(*) from public.staziamed_requests)::int as r`)).toEqual(before);
  });

  it("pedido: modo, quantidade de 1 a 20 e estado conferidos no banco", async () => {
    const insert = (mode: string, count: number, state = "na_fila") =>
      env.sql(`insert into public.staziamed_requests (created_by, mode, count, state) values ($1, $2, $3, $4) returning slots, cost_usd, estimate`, [USERS.EDITOR, mode, count, state]);
    expect((await insert("mais_cobrados", 20))[0]).toEqual({ slots: [], cost_usd: "0.00000", estimate: null });
    await expect(insert("tema", 0)).rejects.toThrow(/check/);
    await expect(insert("tema", 21)).rejects.toThrow(/check/);
    await expect(insert("outro", 1)).rejects.toThrow(/check/);
    await expect(insert("tema", 1, "pausado")).rejects.toThrow(/check/);
  });
});

describe("Fila e funções de serviço", () => {
  it("a fila aceita question_generate, question_check e question_source sem documento", async () => {
    const steps = ["question_generate", "question_check", "question_source"];
    for (const step of steps) {
      await env.sql(`insert into public.ch_jobs (step, scope_key, idempotency_key) values ($1, 'teste', $2)`, [step, `teste:${step}`]);
    }
    const [r] = await env.sql(`select count(*)::int as n from public.ch_jobs where step = any($1) and document_id is null`, [steps]);
    expect(r.n).toBe(3);
    // as etapas de antes e as dos outros ramos (estações, fontes oficiais) continuam aceitas: a regra é a união
    const others = ["extract", "classify", "claims", "evidence", "draft", "materials", "render", "review_check", "source_index", "visual_render",
      "station_pages", "station_segment", "station_draft", "source_search"];
    for (const step of others) {
      await env.sql(`insert into public.ch_jobs (step, scope_key, idempotency_key) values ($1, 'teste', $2)`, [step, `teste-uniao:${step}`]);
    }
    await expect(env.sql(`insert into public.ch_jobs (step, idempotency_key) values ('question_inventada', 'teste:x')`)).rejects.toThrow(/ch_jobs_step_check/);
  });

  it("apoio de teste: sem 'drafts' o banco começa sem rascunhos; contas, rpc e fonte oficial funcionam", async () => {
    const empty = await openStaziaEnv();
    try {
      expect((await empty.sql(`select count(*)::int as n from public.draft_questions`))[0].n).toBe(0);
      expect((await empty.sql(`select count(*)::int as n from public.questions`))[0].n).toBe(1200);
      const roles = await empty.sql(`select r.user_id, r.role::text as role, s.plan::text as plan, s.status::text as status
                                     from public.user_roles r join public.subscriptions s on s.user_id = r.user_id where r.user_id = any($1) order by r.user_id`, [Object.values(USERS)]);
      expect(Object.fromEntries(roles.map((r) => [r.user_id, `${r.role}/${r.plan}/${r.status}`]))).toEqual({
        [USERS.ADMIN]: "admin/trial/trialing",
        [USERS.EDITOR]: "editor/trial/trialing",
        [USERS.REVISOR_PED]: "student/trial/trialing",
        [USERS.REVISOR_CM]: "student/trial/trialing",
        [USERS.PRO]: "student/pro/active",
        [USERS.TESTE]: "student/trial/trialing",
        [USERS.TESTE_VENCIDO]: "student/trial/trialing",
        [USERS.PRO_VENCIDO]: "student/pro/canceled",
        // SEM_PLANO não tem linha de assinatura: não aparece na junção
      });
      expect((await empty.rpc(USERS.EDITOR, "app_draft_questions", { p_limit: 1 })).total).toBe(0);
      await expect(empty.rpc(USERS.TESTE, "app_draft_questions")).rejects.toThrow(/restrito/);
      const id = await insertDraft(empty, { area: "CLINICA_MEDICA", topic: "Abdome agudo" }); // o revisor da clínica lê só a área dele (9830)
      expect((await empty.sqlAs(USERS.REVISOR_CM, `select area, topic, generated_by from public.draft_questions where id = $1`, [id]))[0]).toEqual({
        area: "CLINICA_MEDICA", topic: "Abdome agudo", generated_by: "servidor",
      });
      const { passageId } = await addOfficialSource(empty, { text: "Amoxicilina por dez dias na otite média aguda do lactente." });
      const found = (await empty.sql(`select public.ch_worker_search_official_passages('otite amoxicilina', 5) as r`))[0].r;
      expect(found.map((p: any) => p.passage_id)).toEqual([passageId]);
      await addOfficialSource(empty, { text: "Amoxicilina segundo a apostila do curso para a otite média.", level: "E" });
      expect((await empty.sql(`select public.ch_worker_search_official_passages('otite amoxicilina', 5) as r`))[0].r).toHaveLength(1);
    } finally {
      await empty.close();
    }
  }, 600_000); // abre um segundo banco inteiro (migrações + carga): com a máquina cheia leva minutos

  it("a migração pode ser colada de novo (duas vezes seguidas) sem estragar nada: nada novo, nada duplicado, nada mudado", async () => {
    const file = fileURLToPath(new URL("../../supabase/migrations/20261003009800_questoes_staziamed.sql", import.meta.url));
    const text = fs.readFileSync(file, "utf8");
    const snapshot = async () => {
      const [r] = await env.sql(`
        select
          (select md5(string_agg(pg_get_functiondef(p.oid), E'\n' order by p.oid::regprocedure::text))
             from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^(draft|staziamed)_') as functions,
          (select md5(string_agg(pol.polname || pg_get_expr(pol.polqual, pol.polrelid), E'\n' order by pol.polname))
             from pg_policy pol where pol.polrelid in ('public.staziamed_requests'::regclass, 'public.draft_source_proposals'::regclass, 'public.draft_question_events'::regclass)) as policies,
          (select md5(string_agg(t.tgname || t.tgrelid::regclass::text, E'\n' order by t.tgname))
             from pg_trigger t where t.tgrelid = 'public.draft_questions'::regclass and not t.tgisinternal) as triggers,
          (select md5(string_agg(c.conname || pg_get_constraintdef(c.oid), E'\n' order by c.conname))
             from pg_constraint c where c.conrelid in ('public.ch_jobs'::regclass, 'public.draft_questions'::regclass)) as constraints,
          (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'draft_questions') as columns,
          (select count(*)::int from public.draft_question_events) as events,
          (select count(*)::int from public.draft_questions) as drafts,
          (select md5(string_agg(content_hash, ',' order by id)) from public.draft_questions) as hashes,
          (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^(ch_worker|draft|staziamed)_'
              and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))) as open_functions`);
      return r;
    };
    const before = await snapshot();
    expect(before.events).toBeGreaterThan(0);
    // colar a 9800 de novo exige colar depois a 9810 e o fechamento 9830 (ordem do pacote: colar da parte dela até a última)
    // e as que vieram depois e mexem no mesmo lugar (a 010900 fecha de novo draft_approval_blockers para o app): a 9910 (etapa similarity) e a 9941 (source_change_analysis) refazem a restrição de
    // etapas de ch_jobs (união, em ordem); a 9990 (portão de atualidade) embrulha draft_approval_blockers por cima da versão da 9800
    const resto = ["20261003009810_analise_ia_pedidos.sql", "20261003009830_fechamento_leva4.sql", "20261003009910_similaridade_clinica.sql", "20261003009941_vigilancia_painel.sql",
      "20261003009990_portao_atualidade.sql", "20261003010900_fecha_draft_approval_blockers.sql"].map((f) => fs.readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${f}`, import.meta.url)), "utf8"));
    for (let volta = 0; volta < 2; volta++) {
      await env.dev.db.exec(text);
      for (const sql of resto) await env.dev.db.exec(sql);
    }
    expect(await snapshot()).toEqual(before);
  }, 120_000);

  it("nenhuma função ch_worker_*, draft_* ou staziamed_* é executável por anon ou authenticated", async () => {
    const all = (await env.sql(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                where n.nspname = 'public' and p.proname ~ '^(ch_worker|draft|staziamed)_'`)).map((r) => r.proname);
    expect(all).toEqual(expect.arrayContaining(["draft_content_hash", "draft_event", "ch_worker_search_official_passages"]));
    const open = await env.sql(`select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                where n.nspname = 'public' and p.proname ~ '^(ch_worker|draft|staziamed)_'
                                  and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
                                order by 1`);
    expect(open).toEqual([]);
  });
});
