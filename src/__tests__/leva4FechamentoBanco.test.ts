// @vitest-environment node
/**
 * Leva 4, fechamento (migração 9830): as regras das migrações 9800/9801 (Questões StaziaMed), 9810 (Análise e conferência pela tela)
 * e 9820 que mexem nas MESMAS funções convivem numa versão só. Cada caso falha se a migração 9830 for tirada.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertDraft, insertStaziaQuestion, openStaziaEnv, readyDraft, setChecks, USERS, type StaziaEnv } from "./helpers/staziamed";

let env: StaziaEnv;
beforeAll(async () => {
  env = await openStaziaEnv();
}, 300_000);
afterAll(async () => {
  await env?.close();
});

const decide = (uid: string, id: string, decision: string, note: string | null, hash: string | null, checked = true) =>
  env.rpc(uid, "app_draft_question_decide", { p_id: id, p_decision: decision, p_note: note, p_hash: hash, p_sources_checked: checked });
const message = async (p: Promise<unknown>) => (await p.then(() => "", (e) => String(e?.message ?? e)));

describe("uma versão só de cada função", () => {
  it("app_draft_question_decide e app_draft_questions existem uma vez (nada de versão antiga com o mesmo nome)", async () => {
    const rows = await env.sql<{ name: string; args: string }>(
      `select p.proname as name, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('app_draft_question_decide', 'app_draft_questions') order by 1`
    );
    expect(rows.map((r) => r.name)).toEqual(["app_draft_question_decide", "app_draft_questions"]);
    expect(rows[0].args).toBe("p_id uuid, p_decision text, p_note text, p_hash text, p_sources_checked boolean");
    expect(rows[1].args).toMatch(/p_origin text.*p_blocked boolean.*p_min_similarity numeric.*p_triage text, p_order text$/);
  });

  it("a decisão trava a linha (for update) e usa a evidência de fonte oficial e os bloqueios da revisão", async () => {
    const [{ def }] = await env.sql<{ def: string }>(`select pg_get_functiondef('public.app_draft_question_decide(uuid, text, text, text, boolean)'::regprocedure) as def`);
    expect(def).toMatch(/for update/);
    expect(def).toMatch(/ch_draft_official_evidence/);
    expect(def).toMatch(/draft_approval_blockers/);
  });

  it("a restrição da fila aceita as etapas de todas as frentes", async () => {
    const [{ def }] = await env.sql<{ def: string }>(`select pg_get_constraintdef(c.oid) as def from pg_constraint c where c.conrelid = 'public.ch_jobs'::regclass and c.conname = 'ch_jobs_step_check'`);
    for (const s of ["question_generate", "question_check", "question_source", "source_search", "question_analysis", "draft_check", "visual_render", "station_draft", "extract"]) {
      expect(def, s).toContain(`'${s}'`);
    }
  });
});

describe("aprovar: bloqueios da Questões StaziaMed + evidência de fonte oficial da Análise", () => {
  it("rascunho pronto (citação nova, 4 camadas sem problema): o revisor da área aprova; outras pessoas não", async () => {
    const d = await readyDraft(env);
    expect(await message(decide(USERS.REVISOR_CM, d.id, "approved", null, d.hash))).toMatch(/revisor cadastrado na área/);
    expect(await message(decide(USERS.EDITOR, d.id, "approved", null, d.hash))).toMatch(/revisor cadastrado/);
    expect(await message(decide(USERS.PRO, d.id, "approved", null, d.hash))).toMatch(/revisor cadastrado/);
    expect(await message(decide(USERS.REVISOR_PED, d.id, "approved", null, "hash-velho"))).toMatch(/O texto mudou/);
    expect(await message(decide(USERS.REVISOR_PED, d.id, "approved", null, d.hash, false))).toMatch(/Conferi as fontes citadas/);
    expect(await decide(USERS.REVISOR_PED, d.id, "approved", null, d.hash)).toBe(true);
  });

  it("rascunho do gerador antigo (cita apostila) não aprova, mesmo com a conferência de fontes 'sem problemas'", async () => {
    const id = await insertDraft(env, { generated_by: "gerador_antigo", topic: null });
    const hash = await setChecks(env, id);
    const msg = await message(decide(USERS.REVISOR_PED, id, "approved", null, hash));
    expect(msg).toMatch(/fonte oficial/i);
    expect(await message(decide(USERS.REVISOR_PED, id, "needs_changes", "Falta a fonte oficial.", hash))).toBe(""); // pedir ajustes continua livre
  });

  it("sem a conferência de fontes 'sem problemas' para o texto atual, não aprova (evidência positiva)", async () => {
    const issues = await readyDraft(env);
    await setChecks(env, issues.id, { sources: "issues" });
    expect(await message(decide(USERS.REVISOR_PED, issues.id, "approved", null, issues.hash))).toMatch(/Fontes oficiais: com apontamentos|fonte oficial/);
    const never = await readyDraft(env);
    await setChecks(env, never.id, { sources: null });
    expect(await message(decide(USERS.REVISOR_PED, never.id, "approved", null, never.hash))).toMatch(/Conferência pendente: Fontes oficiais|fonte oficial/);
  });
});

describe("lista e rascunho aberto: selo de triagem e escopo do revisor", () => {
  it("a lista traz os filtros da Questões StaziaMed e o selo de triagem; o revisor só enxerga a área dele", async () => {
    const ped = await readyDraft(env);
    const cm = await insertDraft(env, { area: "CLINICA_MEDICA" });
    const admin = await env.rpc(USERS.ADMIN, "app_draft_questions", { p_limit: 100 });
    const ids = admin.items.map((i: any) => i.id);
    expect(ids).toContain(ped.id);
    expect(ids).toContain(cm);
    const item = admin.items.find((i: any) => i.id === ped.id);
    expect(item).toMatchObject({ triage: "sem_apontamentos", can_edit: true, content_hash: ped.hash });
    expect(item.approval_blockers).toEqual([]);
    expect(admin.triage_counts).toBeTruthy();
    expect(admin.answer_distribution).toBeTruthy();

    const rev = await env.rpc(USERS.REVISOR_PED, "app_draft_questions", { p_limit: 100 });
    const revIds = rev.items.map((i: any) => i.id);
    expect(revIds).toContain(ped.id);
    expect(revIds).not.toContain(cm);
    expect(rev.items.every((i: any) => i.area === "PEDIATRIA")).toBe(true);

    const onlyClean = await env.rpc(USERS.ADMIN, "app_draft_questions", { p_limit: 100, p_triage: "sem_apontamentos" });
    expect(onlyClean.items.every((i: any) => i.triage === "sem_apontamentos")).toBe(true);
    expect(await message(env.rpc(USERS.ADMIN, "app_draft_questions", { p_triage: "inventado" }))).toMatch(/Selo de triagem inválido/);
  });

  it("o revisor médico não abre o rascunho de outra área; a equipe abre qualquer um", async () => {
    const cm = await insertDraft(env, { area: "CLINICA_MEDICA" });
    expect(await message(env.rpc(USERS.REVISOR_PED, "app_draft_question_detail", { p_id: cm }))).toMatch(/Questão não encontrada/);
    expect((await env.rpc(USERS.ADMIN, "app_draft_question_detail", { p_id: cm })).draft.id).toBe(cm);
  });
});

describe("leitura direta das tabelas de rascunho", () => {
  it("o revisor médico lê pela API do banco só os rascunhos, conferências e trilha da área dele; a equipe lê tudo", async () => {
    const ped = await readyDraft(env);
    const cm = await insertDraft(env, { area: "CLINICA_MEDICA" });
    await env.sql(`insert into public.draft_checks (draft_id, layer, verdict, content_hash, model) select id, 'software', 'pass', content_hash, 'mock' from public.draft_questions where id = $1`, [cm]);
    await env.sql(`select public.draft_event($1::uuid, 'editada', 'teste', null, '{}'::jsonb)`, [cm]);
    const seen = async (uid: string, table: string, col: string) => (await env.sqlAs<{ id: string }>(uid, `select ${col} as id from public.${table}`)).map((r) => r.id);
    expect(await seen(USERS.REVISOR_PED, "draft_questions", "id")).toContain(ped.id);
    expect(await seen(USERS.REVISOR_PED, "draft_questions", "id")).not.toContain(cm);
    expect(await seen(USERS.REVISOR_PED, "draft_checks", "draft_id")).not.toContain(cm);
    expect(await seen(USERS.REVISOR_PED, "draft_question_events", "draft_id")).not.toContain(cm);
    expect(await seen(USERS.REVISOR_CM, "draft_questions", "id")).toContain(cm);
    expect(await seen(USERS.REVISOR_CM, "draft_checks", "draft_id")).toContain(cm);
    expect(await seen(USERS.ADMIN, "draft_questions", "id")).toEqual(expect.arrayContaining([ped.id, cm]));
    expect(await seen(USERS.EDITOR, "draft_checks", "draft_id")).toContain(cm);
    expect(await seen(USERS.PRO, "draft_questions", "id")).toEqual([]);
  });
});

describe("pedido de análise: só questões oficiais", () => {
  it("a Questão StaziaMed publicada nunca entra num pedido de análise", async () => {
    const sid = await insertStaziaQuestion(env);
    const picked = await env.sql<{ id: string }>(`select id from public.ch_qa_pick(null, null, null, false, null)`);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.map((r) => r.id)).not.toContain(sid);
    const worker = await env.sql<{ r: any[] }>(`select public.ch_worker_questions_for_analysis_ids(array[$1], false) as r`, [sid]);
    expect(worker[0].r).toEqual([]);
  });
});
