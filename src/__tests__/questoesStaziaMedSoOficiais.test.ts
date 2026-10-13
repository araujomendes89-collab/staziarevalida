// @vitest-environment node
/**
 * Questões StaziaMed — consumidores "só oficiais" e recusas (migração 9801, Tarefa 3). Incidência, temas, Aulas, trilhas, Início,
 * abertura do app, Tutor, SQIE e o banco de questões da administração não misturam Questão StaziaMed com prova oficial; o gabarito
 * oficial a recusa; reaplicar a carga com StaziaMed publicadas não quebra. O CATÁLOGO abaixo é a lista de toda função e visão que lê
 * `public.questions`: função nova que lê a tabela precisa ser classificada AQUI (o teste de igualdade fica vermelho até lá).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { insertStaziaQuestion, openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 600_000 });

type Classe = "so_oficiais" | "as_duas";
type Como = "filtra" | "recusa" | "herda" | "historico" | "equipe";
/**
 * so_oficiais/filtra  = confere `origin` no próprio corpo; so_oficiais/recusa = recusa a StaziaMed com aviso; so_oficiais/herda =
 * só recebe linhas de quem já filtra; as_duas/historico = conta as respostas do aluno nas duas coleções (ou decide pelo acesso);
 * as_duas/equipe = ferramenta da equipe que age pelo id de uma questão (não é caminho do aluno; ver o relatório).
 */
export const CATALOGO: Record<string, { classe: Classe; como: Como }> = {
  // só oficiais, filtra
  app_incidence: { classe: "so_oficiais", como: "filtra" },
  app_bootstrap: { classe: "so_oficiais", como: "filtra" },
  app_home: { classe: "so_oficiais", como: "filtra" },
  app_lesson_topics: { classe: "so_oficiais", como: "filtra" },
  app_trail: { classe: "so_oficiais", como: "filtra" },
  app_start_trail_node: { classe: "so_oficiais", como: "filtra" },
  ch_worker_questions_for_analysis: { classe: "so_oficiais", como: "filtra" },
  // pedidos de análise pela tela (9810, com o filtro de origem na 9830)
  ch_qa_pick: { classe: "so_oficiais", como: "filtra" },
  ch_worker_questions_for_analysis_ids: { classe: "so_oficiais", como: "filtra" },
  app_question_analyses: { classe: "so_oficiais", como: "filtra" },
  app_question_updates_queue: { classe: "so_oficiais", como: "filtra" },
  ch_worker_updates_for_reanalysis: { classe: "so_oficiais", como: "filtra" },
  app_updated_questions: { classe: "so_oficiais", como: "filtra" },
  tutor_pick_question: { classe: "so_oficiais", como: "filtra" },
  tutor_question_view: { classe: "so_oficiais", como: "filtra" },
  ch_raw_tutor_truth: { classe: "so_oficiais", como: "filtra" },
  tutor_answer_for: { classe: "so_oficiais", como: "filtra" },
  app_tutor_start: { classe: "so_oficiais", como: "filtra" },
  app_admin_questions: { classe: "so_oficiais", como: "filtra" },
  app_admin_question: { classe: "so_oficiais", como: "filtra" },
  admin_import_merge_question: { classe: "so_oficiais", como: "filtra" },
  // só oficiais, recusa
  app_admin_set_official_answer: { classe: "so_oficiais", como: "recusa" },
  question_official_answers_guard: { classe: "so_oficiais", como: "recusa" },
  app_admin_save_question: { classe: "so_oficiais", como: "recusa" },
  admin_upsert_question: { classe: "so_oficiais", como: "recusa" },
  app_admin_delete_question: { classe: "so_oficiais", como: "recusa" },
  // só oficiais, herda (recebem linhas de quem já filtra, ou só mexem em questão com análise, que só as oficiais têm)
  ch_worker_save_question_analysis: { classe: "so_oficiais", como: "herda" },
  ch_worker_analyses_for_check: { classe: "so_oficiais", como: "herda" },
  app_question_analysis_decide: { classe: "so_oficiais", como: "herda" },
  question_analysis_fits: { classe: "so_oficiais", como: "herda" },
  ch_reanalysis_waiting: { classe: "so_oficiais", como: "herda" }, // leva 5 (9872): só conta questão com pedido de atualização por mudança de fonte; esse pedido nasce da ligação questão-afirmação, que só a análise (oficiais) cria
  tutor_session_summary: { classe: "so_oficiais", como: "herda" },
  tutor_learning_memory: { classe: "so_oficiais", como: "herda" },
  ch_worker_tutor_learning_event: { classe: "so_oficiais", como: "herda" },
  ch_worker_tutor_speech: { classe: "so_oficiais", como: "herda" },
  app_admin_import_questions: { classe: "so_oficiais", como: "herda" }, // só provas REVALIDA/ENAMED (admin_question_problem) e o upsert recusa STAZIAMED
  app_admin_import_preview: { classe: "so_oficiais", como: "herda" },
  // as duas, histórico do aluno e acesso
  practice_pool: { classe: "as_duas", como: "historico" },
  practice_question_view: { classe: "as_duas", como: "historico" },
  // carga das provas (9930): o selo "gabarito preliminar" de UMA questão; só é chamada por practice_question_view e
  // practice_correction_view, que já decidiram o acesso (fechada ao app)
  question_preliminary_info: { classe: "as_duas", como: "historico" },
  ch_raw_practice_correction_view: { classe: "as_duas", como: "historico" },
  practice_result: { classe: "as_duas", como: "historico" },
  app_get_session: { classe: "as_duas", como: "historico" },
  app_recent_sessions: { classe: "as_duas", como: "historico" },
  app_error_notebook: { classe: "as_duas", como: "historico" },
  my_error_notebook_of: { classe: "as_duas", como: "historico" },
  app_error_profile: { classe: "as_duas", como: "historico" },
  app_error_reasons: { classe: "as_duas", como: "historico" },
  app_attempt_diagnosis: { classe: "as_duas", como: "historico" },
  app_performance: { classe: "as_duas", como: "historico" },
  plan_task_progress: { classe: "as_duas", como: "historico" },
  app_create_flashcard: { classe: "as_duas", como: "historico" },
  grade_question_attempt: { classe: "as_duas", como: "historico" },
  gam_check_achievements: { classe: "as_duas", como: "historico" },
  gam_compute_score: { classe: "as_duas", como: "historico" },
  gam_facts: { classe: "as_duas", como: "historico" },
  gam_process_attempt: { classe: "as_duas", como: "historico" },
  gam_recount_answers: { classe: "as_duas", como: "historico" },
  ch_worker_gamification_recalculate: { classe: "as_duas", como: "historico" },
  admin_refresh_exam_counts: { classe: "as_duas", como: "historico" },
  admin_user_row: { classe: "as_duas", como: "historico" },
  app_admin_user: { classe: "as_duas", como: "historico" },
  app_admin_overview: { classe: "as_duas", como: "historico" }, // conta separado: oficiais e StaziaMed
  question_area_code: { classe: "as_duas", como: "historico" },
  tutor_mastery: { classe: "as_duas", como: "historico" },
  app_tutor_report: { classe: "as_duas", como: "historico" },
  ch_worker_tutor_play_context: { classe: "as_duas", como: "historico" },
  question_attempts_ineditas_gate: { classe: "as_duas", como: "historico" },
  ineditas_option: { classe: "as_duas", como: "historico" },
  app_question_figure: { classe: "as_duas", como: "historico" }, // exige acesso às inéditas
  staziamed_topic_weights: { classe: "so_oficiais", como: "filtra" },
  staziamed_plan_slots: { classe: "as_duas", como: "historico" }, // oficiais para temas e peso; StaziaMed publicadas só para as letras-alvo
  app_draft_questions: { classe: "as_duas", como: "historico" }, // lista dos rascunhos: lê a questão publicada (recolhida, número) e conta as StaziaMed
  app_draft_question_detail: { classe: "as_duas", como: "historico" }, // mostra a questão oficial mais parecida
  app_staziamed_preview: { classe: "as_duas", como: "historico" }, // prévia do administrador: lê a questão publicada para o número
  app_staziamed_publish: { classe: "as_duas", como: "historico" }, // grava a Questão StaziaMed (origem 'staziamed'), nunca oficial
  app_staziamed_retire: { classe: "as_duas", como: "historico" }, // recolhe a Questão StaziaMed
  draft_situation: { classe: "as_duas", como: "historico" }, // rascunho publicado: lê a questão para saber se foi recolhida
  ch_worker_similarity_corpus: { classe: "so_oficiais", como: "filtra" }, // corpus oficial = origin 'official'; as StaziaMed vêm dos rascunhos
  // Fontes vinculadas (9900): o aluno lê os vínculos confirmados das duas coleções, só depois de responder (question_viewable)
  app_question_source_links: { classe: "as_duas", como: "historico" },
  // Carga das explicações (9920): a correção do aluno lê a nota aprovada (as duas coleções, depois de responder)
  question_update_note_visible: { classe: "as_duas", como: "historico" },
  // as duas, ferramentas da equipe que agem pelo id da questão
  app_admin_comment_review: { classe: "as_duas", como: "equipe" },
  app_admin_comment_review_queue: { classe: "as_duas", como: "equipe" },
  app_admin_question_comment_decide: { classe: "as_duas", como: "equipe" },
  app_admin_question_history: { classe: "as_duas", como: "equipe" },
  app_admin_question_review_done: { classe: "as_duas", como: "equipe" },
  app_admin_remove_question_image: { classe: "as_duas", como: "equipe" },
  app_admin_set_question_image: { classe: "as_duas", como: "equipe" },
  ch_worker_question_figure_drop: { classe: "as_duas", como: "equipe" },
  question_comment_review_missing: { classe: "as_duas", como: "equipe" },
  app_ch_complementar_mentions: { classe: "as_duas", como: "equipe" },
  question_source_links_guard: { classe: "as_duas", como: "equipe" }, // 9900: gatilho do vínculo de fonte; recusa só a "versão da época da prova" em Questão StaziaMed
  // questões parecidas (9910): o motor compara as duas coleções (uma inédita pode repetir uma oficial); só a equipe e o servidor
  app_admin_similarity_status: { classe: "as_duas", como: "equipe" },
  ch_worker_similarity_candidates: { classe: "as_duas", como: "equipe" },
  ch_worker_similarity_doubtful: { classe: "as_duas", como: "equipe" },
  ch_worker_similarity_save: { classe: "as_duas", como: "equipe" },
  ch_worker_similarity_save_embeddings: { classe: "as_duas", como: "equipe" },
  similarity_pair_in_scope: { classe: "as_duas", como: "equipe" },
  similarity_profiles: { classe: "as_duas", como: "equipe" },
  similarity_relation_item: { classe: "as_duas", como: "equipe" },
  similarity_texts: { classe: "as_duas", como: "equipe" },
  similarity_vector_neighbors: { classe: "as_duas", como: "equipe" },
  // questões parecidas, lado do aluno: decidem pelo acesso (a inédita só para quem tem plano ou teste em dia)
  app_related_questions: { classe: "as_duas", como: "historico" },
  app_start_related_question: { classe: "as_duas", como: "historico" },
  // Carga das explicações (9920): carga e regra B do dono (por id, só o editor SQL), prova inteira e nota (equipe e revisores)
  question_explanations_apply: { classe: "as_duas", como: "equipe" },
  question_explanations_release: { classe: "as_duas", como: "equipe" },
  question_update_notes_trail: { classe: "as_duas", como: "equipe" },
  question_comment_review_exam_rows: { classe: "as_duas", como: "equipe" },
  app_admin_comment_review_exams: { classe: "as_duas", como: "equipe" },
  app_admin_comment_review_exam: { classe: "as_duas", como: "equipe" },
  app_admin_comment_review_approve_exam: { classe: "as_duas", como: "equipe" },
  app_admin_question_update_note: { classe: "as_duas", como: "equipe" },
  app_admin_question_update_note_save: { classe: "as_duas", como: "equipe" },
  app_admin_question_update_note_decide: { classe: "as_duas", como: "equipe" },
  // visões
  my_area_stats: { classe: "as_duas", como: "historico" },
  my_topic_stats: { classe: "as_duas", como: "historico" },
  my_error_notebook: { classe: "as_duas", como: "historico" },
};

let env: StaziaEnv;
beforeAll(async () => {
  env = await openStaziaEnv();
}, 600_000);
afterAll(async () => {
  await env?.close();
}, 60_000);

describe("Catálogo de leitores de public.questions", () => {
  it("toda função e visão que lê public.questions está classificada, e as 'filtra' conferem origin", async () => {
    const fns = await env.sql<{ proname: string; prosrc: string }>(
      `select proname, prosrc from pg_proc where pronamespace = 'public'::regnamespace and prosrc ~ 'public\\.questions([^_a-z]|$)'`
    );
    // visões: pelo catálogo de dependências, nunca pelo texto da definição (a definição omite "public.")
    const views = await env.sql<{ view_name: string }>(
      `select distinct view_name from information_schema.view_table_usage where table_schema = 'public' and table_name = 'questions' and view_schema = 'public'`
    );
    const found = [...new Set([...fns.map((f) => f.proname), ...views.map((v) => v.view_name)])].sort();
    expect(found).toEqual(Object.keys(CATALOGO).sort());
    for (const f of fns) {
      if (CATALOGO[f.proname].como === "filtra") expect(f.prosrc, f.proname).toMatch(/origin/);
      if (CATALOGO[f.proname].como === "recusa") expect(f.prosrc, f.proname).toMatch(/STAZIAMED|staziamed/i);
    }
  });
});

describe("Com Questões StaziaMed publicadas, os números oficiais não mudam", () => {
  it("sorteio padrão, filtros, incidência, temas das Aulas, trilha, Início e abertura do app: iguais antes e depois", async () => {
    const snap = async (uid: string) => {
      const f = await env.rpc(uid, "app_question_filters", {});
      return {
        total: f.total,
        topics: f.topics,
        exams: f.exams.filter((e: any) => e.id !== "staziamed"),
        count: await env.rpc(uid, "app_count_questions", { p_filters: {} }),
        incidenciaTema: await env.rpc(uid, "app_incidence", { p_dimension: "topic" }),
        incidenciaArea: await env.rpc(uid, "app_incidence", { p_dimension: "area" }),
        aulas: await env.rpc(uid, "app_lesson_topics", {}),
        trilha: await env.rpc(uid, "app_trail", {}),
        home: await env.rpc(uid, "app_home", {}),
        boot: (({ streak_days, ...r }: any) => r)(await env.rpc(uid, "app_bootstrap", {})),
        pool: (await env.sqlAs(uid, `select count(*)::int as n from public.practice_pool('{}'::jsonb)`))[0].n,
      };
    };
    const before = { pro: await snap(USERS.PRO), teste: await snap(USERS.TESTE) };
    expect(before.pro.total).toBeGreaterThan(1000);
    for (let i = 0; i < 3; i++) await insertStaziaQuestion(env, { area: i === 0 ? "PEDIATRIA" : "CLINICA_MEDICA", topic: i === 0 ? "Otite média aguda" : "Tema só das inéditas" });
    const after = { pro: await snap(USERS.PRO), teste: await snap(USERS.TESTE) };
    expect(after).toEqual(before);
    // o tema que só existe nas inéditas nunca aparece nos temas oficiais
    expect(JSON.stringify(after.pro.aulas)).not.toContain("Tema só das inéditas");
    expect(JSON.stringify(after.pro.incidenciaTema)).not.toContain("Tema só das inéditas");
    expect(JSON.stringify(after.pro.trilha)).not.toContain("Tema só das inéditas");
  });
});

describe("Tutor", () => {
  it("o Tutor nunca escolhe nem comenta Questão StaziaMed", async () => {
    const stz = await insertStaziaQuestion(env, { area: "PEDIATRIA", topic: "Tema do Tutor" });
    const official = (await env.sql<{ id: string }>(`select id from public.questions where origin = 'official' and area = 'PEDIATRIA'`)).map((r) => r.id);
    // com todas as oficiais de pediatria excluídas, só sobra a StaziaMed: o Tutor não a escolhe
    for (const mode of ["questao", "erros"]) {
      const [r] = await env.sql<{ q: string | null }>(`select public.tutor_pick_question($1, $2, 3::smallint, $3::text[], 'PEDIATRIA') as q`, [USERS.PRO, mode, official]);
      expect(r.q, mode).toBeNull();
    }
    expect((await env.sql(`select public.tutor_question_view($1, 'open') as v`, [stz]))[0].v).toBeNull();
    expect((await env.sql(`select public.tutor_truth($1, 'full') as v`, [stz]))[0].v).toBeNull();
    await env.sql(`insert into public.tutor_config (id) values (true) on conflict (id) do nothing`).catch(() => null);
    await expect(env.rpc(USERS.PRO, "app_tutor_start", { p_mode: "questao", p_question_id: stz })).rejects.toThrow(/Questão não encontrada|Aceite do Tutor|Tutor ainda não/);
    // a mesma conta, com uma oficial, segue valendo (o filtro não fecha o Tutor)
    const [{ id: some }] = await env.sql<{ id: string }>(`select id from public.questions where origin = 'official' limit 1`);
    expect((await env.sql(`select public.tutor_question_view($1, 'open') as v`, [some]))[0].v).not.toBeNull();
  });
});

describe("SQIE", () => {
  it("análise, reanálise e fila de atualização sem Questão StaziaMed", async () => {
    await insertStaziaQuestion(env, { area: "PEDIATRIA" });
    const toAnalyze = (await env.sql<{ r: any[] }>(`select public.ch_worker_questions_for_analysis(500, null, false) as r`))[0].r;
    expect(toAnalyze.length).toBe(500); // o teto da função; nenhuma é StaziaMed
    expect(toAnalyze.filter((x) => String(x.id).startsWith("staziamed_q"))).toEqual([]);
    expect((await env.sql<{ r: any[] }>(`select public.ch_worker_updates_for_reanalysis(100) as r`))[0].r.filter((x) => String(x.question_id).startsWith("staziamed_q"))).toEqual([]);
    const analyses = await env.rpc(USERS.EDITOR, "app_question_analyses", {});
    expect(analyses.summary.questions).toBe(
      Number((await env.sql(`select count(*)::int as n from public.questions where origin = 'official' and status <> 'annulled'`))[0].n)
    );
    const queue = await env.rpc(USERS.EDITOR, "app_question_updates_queue", { p_status: null });
    expect(JSON.stringify(queue)).not.toContain("staziamed_q");
    expect((await env.rpc(USERS.EDITOR, "app_updated_questions", {})).items.filter((x: any) => String(x.question_id).startsWith("staziamed_q"))).toEqual([]);
  });
});

describe("Gabarito oficial e administração do banco de questões", () => {
  it("gabarito oficial recusa Questão StaziaMed (função e inserção direta)", async () => {
    const stz = await insertStaziaQuestion(env, { area: "PEDIATRIA" });
    await expect(
      env.rpc(USERS.ADMIN, "app_admin_set_official_answer", { p_question_id: stz, p_answer: "A", p_status: "FINAL", p_source: "Edital", p_reason: "teste" })
    ).rejects.toThrow("Questão StaziaMed não tem gabarito oficial.");
    await expect(
      env.sql(`insert into public.question_official_answers (question_id, answer, answer_status, source) values ($1, 'A', 'FINAL', 'Edital')`, [stz])
    ).rejects.toThrow("Questão StaziaMed não tem gabarito oficial.");
    expect((await env.sql(`select count(*)::int as n from public.question_official_answers where question_id = $1`, [stz]))[0].n).toBe(0);
  });

  it("administração: salvar, apagar e abrir recusam StaziaMed; a lista e a visão geral separam", async () => {
    const stz = await insertStaziaQuestion(env, { area: "PEDIATRIA" });
    const aviso = "Questões StaziaMed só mudam pelo rascunho na Central de Conteúdo.";
    await expect(env.rpc(USERS.ADMIN, "app_admin_save_question", { p_question: { id: stz, kind: "REVALIDA", year: 2024, semester: 1, number: 1 } })).rejects.toThrow(aviso);
    await expect(env.rpc(USERS.ADMIN, "app_admin_save_question", { p_question: { kind: "STAZIAMED", year: 2026, number: 1 } })).rejects.toThrow(aviso);
    await expect(env.rpc(USERS.ADMIN, "app_admin_delete_question", { p_question_id: stz })).rejects.toThrow(aviso);
    await expect(env.rpc(USERS.ADMIN, "app_admin_question", { p_id: stz })).rejects.toThrow("Questão não encontrada.");
    await expect(env.sql(`select public.admin_upsert_question('{"kind": "STAZIAMED"}'::jsonb, true)`)).rejects.toThrow(aviso);
    const list = await env.rpc(USERS.ADMIN, "app_admin_questions", { p_filters: {}, p_limit: 200 });
    expect(list.total).toBe(1200);
    expect(JSON.stringify(list)).not.toContain("staziamed");
    const total = Number((await env.sql(`select count(*)::int as n from public.questions where origin = 'staziamed' and retired_at is null`))[0].n);
    const ov = await env.rpc(USERS.ADMIN, "app_admin_overview", {});
    expect(ov.questions.total).toBe(1200);
    expect(ov.questions.staziamed).toEqual({ published: total, retired: 0 });
    // a questão StaziaMed continua inteira
    expect((await env.sql(`select count(*)::int as n from public.questions where id = $1`, [stz]))[0].n).toBe(1);
  });
});

describe("Carga do banco", () => {
  it("reaplicar a carga com Questões StaziaMed publicadas não quebra e não dá gabarito oficial a elas", async () => {
    await insertStaziaQuestion(env, { area: "PEDIATRIA" });
    await insertStaziaQuestion(env, { area: "CLINICA_MEDICA" });
    const state = async () => (await env.sql(`select count(*)::int as n, coalesce(max(version), 0)::int as v from public.question_official_answers`))[0];
    const antes = await state();
    for (const st of buildEngineStatements()) await env.dev.db.exec(st);
    for (const st of buildEngineStatements()) await env.dev.db.exec(st); // uma segunda vez também passa
    expect(await state()).toEqual(antes);
    expect((await env.sql(`select count(*)::int as n from public.question_official_answers o join public.questions q on q.id = o.question_id where q.origin = 'staziamed'`))[0].n).toBe(0);
  });
});

describe("Migração", () => {
  it("a lista de funções com origem continua igual depois de colar de novo (idempotente)", async () => {
    const fs = await import("fs");
    const { fileURLToPath } = await import("url");
    const text = fs.readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261003009801_questoes_staziamed_aluno.sql", import.meta.url)), "utf8");
    const snap = async () =>
      (await env.sql(`select md5(string_agg(pg_get_functiondef(p.oid), E'\\n' order by p.oid::regprocedure::text)) as h, count(*)::int as n
                      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc ~ 'origin'`))[0];
    // a 9920 (carga das explicações) redefine a correção do aluno a partir da 9801: colar a 9801 de novo pede colar a 9920 depois
    const carga = fs.readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261003009920_carga_explicacoes.sql", import.meta.url)), "utf8");
    const before = await snap();
    await env.dev.db.exec(text);
    await env.dev.db.exec(carga);
    // a 9930 (carga das provas) redefine practice_question_view por cima da 9801: colar a 9801 de novo pede colar a 9930 depois
    await env.dev.db.exec(fs.readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261003009930_gabarito_preliminar_aviso.sql", import.meta.url)), "utf8"));
    expect(await snap()).toEqual(before);
  });
});
