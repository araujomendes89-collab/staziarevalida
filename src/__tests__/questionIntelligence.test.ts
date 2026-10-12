// @vitest-environment node
/**
 * SQIE fase 1: gabarito oficial com histórico, trilha de mudanças, análise de questão e de cada alternativa,
 * comentário versionado e acesso do aluno. Erros PLANTADOS medem o que a conferência por software pega.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import type { StructuredRequest } from "../../server/contentHub/ai/provider";
import { analysisChecks, compileComments, runQuestionAnalysis, type Analysis, type QuestionForAnalysis } from "../../server/contentHub/questionAnalysis";
import { verdictOf } from "../../server/contentHub/draftChecks";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";

const question = (): QuestionForAnalysis => ({
  id: "q1",
  exam_id: "revalida-2021",
  exam_year: 2021,
  number: 7,
  area: "PEDIATRIA",
  statement: "Lactente de 8 meses, com febre há 3 dias e otalgia, diagnosticado com otite média aguda, sem alergia a antibióticos. Qual a conduta inicial?",
  correct_option: "A",
  images: [],
  options: [
    { id: "A", text: "Amoxicilina por 10 dias.", explanation: null },
    { id: "B", text: "Observar sem antibiótico.", explanation: null },
    { id: "C", text: "Azitromicina em dose única.", explanation: null },
    { id: "D", text: "Ceftriaxona por 1 dia.", explanation: null },
  ],
  official: { answer: "A", status: "FINAL", source: "Gabarito Oficial Definitivo (teste)" },
  dna: { clinical_decision: "Tratar otite média aguda do lactente com amoxicilina.", concept: "Amoxicilina é a primeira escolha.", distractor_patterns: ["UNDERTREATMENT"] },
  basis_hash: "h",
});
const opt = (id: string, over = {}) => ({
  option_id: id,
  is_official_correct: id === "A",
  distractor_kind: id === "A" ? "CORRECT" : "WRONG",
  reasoning: "A amoxicilina é a primeira escolha em lactente com otite média aguda e sem alergia a antibióticos.",
  why_plausible: "É uma conduta usada em quadros infecciosos de via aérea.",
  why_wrong: "Não é a conduta inicial recomendada para este lactente com otite média aguda.",
  when_correct: "Seria considerada em outro cenário clínico, com outra indicação.",
  concept_difference: "A escolha depende da idade e da gravidade do quadro.",
  error_types: id === "A" ? [] : ["WRONG_TREATMENT"],
  trap: "Escolher pela familiaridade do nome do medicamento.",
  quality: 3,
  ...over,
});
const analysis = (): Analysis => ({
  question_core: "Reconhecer a otite média aguda do lactente e indicar o antibiótico de primeira escolha.",
  key_data: [{ text: "Lactente de 8 meses", role: "CRITICAL" }, { text: "Febre há 3 dias", role: "SUPPORTIVE" }],
  reasoning_types: ["tratamento_inicial"],
  difficulty: 2,
  difficulty_components: { reasoning_steps: 2, rarity: "low", distractor_similarity: "medium", integration: "low", specific_guideline: false, therapeutic_complexity: "low" },
  trap: "Tratar apenas os sintomas sem reconhecer a indicação de antibiótico na idade.",
  golden_rule: "Otite média aguda em lactente: antibiótico de primeira escolha, sem esperar.",
  pedagogy: { teaches: "Primeira escolha na otite média aguda.", why_important: "É conduta frequente na pediatria.", cognitive_error: "Fechamento precoce.", review_if_wrong: "Otite média aguda." },
  guideline_dependency: { depends: false, topics: [] },
  options: ["A", "B", "C", "D"].map((id) => opt(id)) as Analysis["options"],
});
const clean = () => analysisChecks(question(), analysis());
const codes = (mutate: (a: Analysis, q: QuestionForAnalysis) => void) => {
  const q = question();
  const a = analysis();
  mutate(a, q);
  return analysisChecks(q, a).map((f) => f.code);
};

describe("Conferência por software da análise — erros plantados", () => {
  it("análise limpa não gera nenhum apontamento", () => {
    expect(clean()).toEqual([]);
    expect(verdictOf(clean())).toBe("pass");
  });

  const planted: [string, (a: Analysis, q: QuestionForAnalysis) => void, string, string][] = [
    ["a IA troca o gabarito oficial", (a) => a.options.forEach((o) => ((o.is_official_correct = o.option_id === "B"), (o.distractor_kind = o.option_id === "B" ? "CORRECT" : "WRONG"))), "official_answer_changed", "critical"],
    ["duas alternativas oficiais", (a) => (a.options[1].is_official_correct = true), "single_correct", "critical"],
    ["faltam alternativas", (a) => a.options.pop(), "options_incomplete", "critical"],
    ["distrator marcado como CORRECT", (a) => (a.options[2].distractor_kind = "CORRECT"), "kind_mismatch", "critical"],
    ["contesta o gabarito", (a) => (a.options[1].why_wrong = "O gabarito está errado nesta questão e deveria ser a alternativa B."), "challenges_official_answer", "critical"],
    ["fórmula 'as demais estão incorretas'", (a) => (a.options[2].why_wrong = "As demais alternativas estão incorretas porque não seguem a conduta inicial indicada."), "lazy_distractors", "major"],
    ["distrator sem explicação", (a) => (a.options[1].why_wrong = "Errada."), "distractor_too_short", "major"],
    ["não diz quando estaria correta", (a) => (a.options[3].when_correct = ""), "no_context_where_correct", "major"],
    ["cita portaria inventada", (a) => (a.options[1].reasoning = "Conforme a Portaria 1234 do Ministério, a observação é a regra nesta idade para quadros leves."), "invented_reference_risk", "major"],
    ["afirma que 'atualmente' é assim", (a) => (a.golden_rule = "Atualmente a diretriz vigente indica antibiótico imediato em lactentes."), "currency_claim_without_source", "major"],
    ["dose inventada", (a) => (a.options[0].reasoning = "A amoxicilina na dose de 90 mg/kg/dia por 10 dias é a primeira escolha para este lactente."), "numbers_unsupported", "major"],
    ["nenhum dado crítico", (a) => a.key_data.forEach((k) => (k.role = "SUPPORTIVE")), "no_critical_data", "major"],
    ["distrator sem tipo de erro", (a) => (a.options[1].error_types = []), "no_error_type", "minor"],
  ];
  it.each(planted)("pega: %s", (_n, mutate, code, severity) => {
    const q = question();
    const a = analysis();
    mutate(a, q);
    const hit = analysisChecks(q, a).find((f) => f.code === code);
    expect(hit, `esperava ${code}`).toBeDefined();
    expect(hit!.severity).toBe(severity);
  });

  it("número que está no enunciado ou nas alternativas não é apontado", () => {
    const q = question();
    q.statement += " Peso de 8 kg.";
    const a = analysis();
    a.options[0].reasoning = "Em lactente de 8 kg com otite média aguda, a amoxicilina é a primeira escolha.";
    expect(analysisChecks(q, a).map((f) => f.code)).not.toContain("numbers_unsupported");
  });

  it("o comentário é montado da análise: rápido curto, completo com cada distrator", () => {
    const [quick, full] = compileComments(question(), analysis());
    expect(quick.level).toBe("quick");
    expect(quick.content.why_wrong).toEqual([]);
    expect(full.level).toBe("full");
    expect(full.content.why_wrong.map((w) => w.option_id)).toEqual(["B", "C", "D"]);
    expect(full.content.answer).toBe("A");
    expect(full.content.label).toBe("Comentário Stazia");
  });
});

describe("SQIE com banco e simulação de IA", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sqie-"));
  let dev: DevDatabase;
  let db: ContentDb;
  const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
  const ADMIN = "00000000-0000-4000-8000-0000000000ad";
  const REVIEWER = "00000000-0000-4000-8000-0000000000c2";
  const STUDENT = "00000000-0000-4000-8000-00000000000a";
  const as = <T>(uid: string, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
    dev.db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
      return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
    });
  // a simulação devolve uma análise coerente com o gabarito que recebe
  const respond = (req: StructuredRequest) => {
    const payload = JSON.parse(req.input.match(/<documento>\n([\s\S]*)\n<\/documento>/)![1]);
    const official = payload.gabarito_oficial as string;
    const a = analysis();
    a.options = ["A", "B", "C", "D"].map((id) => opt(id, { is_official_correct: id === official, distractor_kind: id === official ? "CORRECT" : "WRONG", error_types: id === official ? [] : ["WRONG_TREATMENT"], reasoning: `Alternativa ${id}: análise simulada do raciocínio clínico para esta questão de teste.` })) as Analysis["options"];
    return a;
  };

  beforeAll(async () => {
    dev = await openDevDatabaseForTests(path.join(tmp, "db"));
    db = devContentDb(async () => dev);
    for (const st of buildEngineStatements()) await dev.db.exec(st);
    await dev.db.query(`insert into auth.users (id, email) values ($1, 'a@t.dev'), ($2, 'r@t.dev'), ($3, 's@t.dev')`, [ADMIN, REVIEWER, STUDENT]);
    await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
    await dev.db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA'), ($1, 'CLINICA_MEDICA')`, [REVIEWER]);
    Object.assign(process.env, { CONTENT_HUB_AI_PROVIDER_CREATE: "mock" });
  }, 300_000);
  afterAll(async () => {
    await dev?.db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("o gabarito oficial das 1.200 questões nasce como versão 1 (definitivo ou anulada) e confere com o que o app usa", async () => {
    const r = (await sql(`select count(*)::int n, count(*) filter (where answer_status = 'ANNULLED')::int anuladas, count(*) filter (where is_current)::int atuais from public.question_official_answers`))[0];
    expect(r).toEqual({ n: 1200, anuladas: 83, atuais: 1200 });
    const diverge = (await sql(`select count(*)::int n from public.questions q join public.question_official_answers o on o.question_id = q.id and o.is_current where o.answer_status <> 'ANNULLED' and o.answer is distinct from q.correct_option`))[0].n;
    expect(diverge).toBe(0);
    expect((await sql(`select source from public.question_official_answers limit 1`))[0].source).toMatch(/Gabarito Oficial Definitivo/);
  });

  it("histórico: nova versão mantém a anterior; preliminar não substitui definitivo; nada se edita nem se apaga", async () => {
    const id = (await sql(`select id from public.questions where status = 'valid' order by id limit 1`))[0].id;
    const current = (await sql(`select answer from public.question_official_answers where question_id = $1 and is_current`, [id]))[0].answer;
    await expect(as(ADMIN, (q) => q(`select public.app_admin_set_official_answer($1, 'A', 'PRELIMINARY', 'Gabarito preliminar (teste)', null, null, 'Teste do preliminar.')`, [id]))).rejects.toThrow(/gabarito definitivo/);
    const other = ["A", "B", "C", "D"].find((l) => l !== current)!;
    await as(ADMIN, (q) => q(`select public.app_admin_set_official_answer($1, $2, 'CHANGED_AFTER_APPEAL', 'Gabarito pós-recurso (teste)', null, '2026-09-30', 'Recurso aceito (teste).')`, [id, other]));
    const h = await sql(`select version, answer, answer_status, is_current from public.question_official_answers where question_id = $1 order by version`, [id]);
    expect(h).toEqual([
      { version: 1, answer: current, answer_status: "FINAL", is_current: false },
      { version: 2, answer: other, answer_status: "CHANGED_AFTER_APPEAL", is_current: true },
    ]);
    expect((await sql(`select correct_option, status from public.questions where id = $1`, [id]))[0]).toEqual({ correct_option: other, status: "changed_after_appeal" });
    await expect(sql(`update public.question_official_answers set answer = 'A' where question_id = $1`, [id])).rejects.toThrow(/não se altera/);
    await expect(sql(`delete from public.question_official_answers where question_id = $1`, [id])).rejects.toThrow(/não se altera/);
    await expect(as(REVIEWER, (q) => q(`select public.app_admin_set_official_answer($1, 'A', 'FINAL', 'x', null, null, 'y')`, [id]))).rejects.toThrow(/administradores/);
    // fonte e motivo obrigatórios (…7700)
    await expect(as(ADMIN, (q) => q(`select public.app_admin_set_official_answer($1, 'A', 'FINAL', 'Gabarito definitivo (teste)')`, [id]))).rejects.toThrow(/motivo/);
    // a mudança ficou na trilha, com motivo
    const log = (await sql(`select reason, changes from public.question_change_log where question_id = $1`, [id]))[0];
    expect(log.reason).toMatch(/CHANGED_AFTER_APPEAL/);
    expect(log.changes.correct_option).toEqual({ de: current, para: other });
    // devolve ao estado original para os demais testes
    await as(ADMIN, (q) => q(`select public.app_admin_set_official_answer($1, $2, 'FINAL', 'Gabarito definitivo (teste)', null, null, 'Volta ao estado original (teste).')`, [id, current]));
    await as(ADMIN, (q) => q(`select public.app_admin_question_review_done($1)`, [id]));
  });

  it("trilha de mudanças: editar enunciado ou alternativas deixa registro (antes e depois); reaplicar igual não registra", async () => {
    const id = (await sql(`select id from public.questions where status = 'valid' order by id offset 3 limit 1`))[0].id;
    const before = (await sql(`select count(*)::int n from public.question_change_log where question_id = $1`, [id]))[0].n;
    await sql(`update public.questions set topic = topic where id = $1`, [id]);
    expect((await sql(`select count(*)::int n from public.question_change_log where question_id = $1`, [id]))[0].n).toBe(before);
    const old = (await sql(`select statement from public.questions where id = $1`, [id]))[0].statement;
    await sql(`update public.questions set statement = statement || ' (corrigido)' where id = $1`, [id]);
    const log = (await sql(`select changes from public.question_change_log where question_id = $1 order by id desc limit 1`, [id]))[0].changes;
    expect(log.statement.de).toBe(old);
    expect(log.statement.para).toBe(`${old} (corrigido)`);
    await sql(`update public.questions set statement = $2 where id = $1`, [id, old]);
  });

  it("gera a análise de questões reais, confere por software, é idempotente e não publica nada", async () => {
    const first = await runQuestionAnalysis({ db, mockRespond: respond }, { limit: 3, exam: "revalida-2021" });
    expect(first).toMatchObject({ considered: 3, saved: 3, skipped: 0 });
    expect(first.verdicts).toEqual({ pass: 3 });
    const rows = await sql(`select a.status, a.version, a.official_answer_at_analysis oa, q.correct_option co, a.current_best_answer, a.temporal_status,
       (select count(*)::int from public.question_option_analysis x where x.analysis_id = a.id) opts, (select count(*)::int from public.question_comments c where c.analysis_id = a.id) comments
       from public.question_analysis a join public.questions q on q.id = a.question_id where a.is_current`);
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r).toMatchObject({ status: "checked", version: 1, opts: 4, comments: 2, current_best_answer: null, temporal_status: "REQUIRES_MEDICAL_REVIEW" });
    for (const r of rows) expect(r.oa).toBe(r.co);
    expect((await sql(`select count(*)::int n from public.question_comments where status = 'published'`))[0].n).toBe(0);
    // reexecutar não refaz o que já foi analisado para o mesmo conteúdo
    const again = await runQuestionAnalysis({ db, mockRespond: respond }, { limit: 3, exam: "revalida-2021" });
    expect(again.considered).toBe(3);
    expect(again.saved).toBe(3); // 3 outras questões da prova
    expect((await sql(`select count(distinct question_id)::int n from public.question_analysis`))[0].n).toBe(6);
  });

  it("análise com erro crítico é gravada como 'fail' e não vira 'conferida'", async () => {
    const bad = (req: StructuredRequest) => {
      const a = respond(req) as Analysis;
      a.options = a.options.map((o) => ({ ...o, is_official_correct: o.option_id === "D", distractor_kind: o.option_id === "D" ? "CORRECT" : "WRONG" })) as Analysis["options"];
      return a;
    };
    const r = await runQuestionAnalysis({ db, mockRespond: bad }, { limit: 1, exam: "revalida-2021" });
    expect(r.verdicts).toEqual({ fail: 1 });
    const last = (await sql(`select a.status, c.verdict from public.question_analysis a join public.question_analysis_checks c on c.analysis_id = a.id where c.layer = 'software' order by a.created_at desc limit 1`))[0];
    expect(last).toEqual({ status: "ai_draft", verdict: "fail" });
  });

  it("estimativa não grava nem chama IA; sem IA ligada na Central a execução fica pendente, com a mensagem da Central", async () => {
    let called = 0;
    const est = await runQuestionAnalysis({ db, mockRespond: () => (called++, {}) }, { limit: 5, exam: "revalida-2022-1", dryRun: true });
    expect(est.estimate!.calls).toBe(5);
    expect(called).toBe(0);
    const pending = await runQuestionAnalysis({ db }, { limit: 2, exam: "revalida-2022-1" });
    expect(pending.pending).toMatch(/Central de IAs/);
    expect(pending.saved).toBe(0);
  });

  it("análise de questões usa a função engenharia reversa, e grava o modelo de quem respondeu", async () => {
    const { invalidateAiConfig } = await import("../../server/ai/config");
    const seen: string[] = [];
    const aiMaker = (ref: { provider: string; model: string }) =>
      ({
        name: ref.provider,
        model: ref.model,
        isMock: false,
        async generate(req: StructuredRequest) {
          seen.push(`${ref.provider}:${ref.model}`);
          return { output: respond(req), provider: ref.provider, model: ref.model, inputTokens: 10, outputTokens: 20, latencyMs: 1, costUsd: null };
        },
      }) as any;
    const save = (key: string, primary: object) => db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: key, p_config: { mode: "sozinha", primary_ref: primary, fallback_ref: null, reviewers: [], care: "caprichado" } });
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: true });
    await save("criacao", { provider: "openai", model: "gpt-nao-usado" });
    await save("engenharia_reversa", { provider: "anthropic", model: "claude-rev-teste" });
    invalidateAiConfig(db);
    const r = await runQuestionAnalysis({ db, aiMaker }, { limit: 1, exam: "revalida-2022-1" });
    expect(r).toMatchObject({ considered: 1, saved: 1, skipped: 0 });
    expect(seen).toEqual(["anthropic:claude-rev-teste"]);
    const m = (await sql(`select generated_by_model m from public.question_analysis order by created_at desc limit 1`))[0].m;
    expect(m).toBe("claude-rev-teste");
    expect((await sql(`select source, item_id, function_key from public.ai_calls order by id desc limit 1`))[0]).toMatchObject({ source: "analise", function_key: "engenharia_reversa" });
    // IA desligada depois de configurada: pendente, sem cair em outro modelo
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: false });
    invalidateAiConfig(db);
    seen.length = 0;
    const off = await runQuestionAnalysis({ db, aiMaker }, { limit: 1, exam: "revalida-2022-1" });
    expect(off.pending).toMatch(/Claude está desligada na Central de IAs/);
    expect(off.saved).toBe(0);
    expect(seen).toEqual([]);
  });

  it("análise de questões para no teto de gasto, com a mensagem do teto, em vez de seguir pelas outras questões", async () => {
    const { invalidateAiConfig } = await import("../../server/ai/config");
    const seen: string[] = [];
    const aiMaker = (ref: { provider: string; model: string }) =>
      ({
        name: ref.provider,
        model: ref.model,
        isMock: false,
        async generate(req: StructuredRequest) {
          seen.push(`${ref.provider}:${ref.model}`);
          return { output: respond(req), provider: ref.provider, model: ref.model, inputTokens: 10, outputTokens: 20, latencyMs: 1, costUsd: null };
        },
      }) as any;
    const settings = (s: object) => db.service("ch_worker_ai_save_settings", { p_actor: ADMIN, p_settings: s });
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: true });
    await db.service("ch_worker_ai_save_function", { p_actor: ADMIN, p_key: "engenharia_reversa", p_config: { mode: "sozinha", primary_ref: { provider: "anthropic", model: "claude-rev-teste" }, fallback_ref: null, reviewers: [], care: "caprichado" } });
    await db.service("ch_worker_ai_save_price", { p_actor: ADMIN, p_provider: "anthropic", p_model: "claude-rev-teste", p_price: { input_per_mtok: 100, output_per_mtok: 200 } });
    await settings({ caps_enabled: true, monthly_cap_usd: 1000, per_run_cap_usd: 0.01 });
    await sql(`delete from public.ai_calls`);
    invalidateAiConfig(db);
    try {
      const r = await runQuestionAnalysis({ db, aiMaker }, { limit: 3, exam: "revalida-2022-1" });
      expect(r).toMatchObject({ considered: 3, saved: 0, skipped: 0 }); // parou: nenhuma questão marcada como falha
      expect(r.pending).toMatch(/teto por chamada de US\$ 0,01/);
      expect(seen).toEqual([]);
      // uma linha de teto só (a questão que bateu no teto), não uma por questão
      expect((await sql(`select count(*)::int n from public.ai_calls where outcome = 'teto'`))[0].n).toBe(1);
    } finally {
      await settings({ caps_enabled: false });
      await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: false });
      invalidateAiConfig(db);
    }
  });

  it("aluno: nada de análise antes de responder; depois, só a PUBLICADA e só com revisão médica da área", async () => {
    const a = (await sql(`select a.id, a.question_id, public.question_area_code(a.question_id) area from public.question_analysis a where a.is_current and a.status = 'checked' order by a.question_id limit 1`))[0];
    // não publicada: nem a equipe a recebe como "comentário do aluno"
    expect((await as(STUDENT, (q) => q(`select public.app_question_commentary($1) r`, [a.question_id])))[0].r).toBeNull();
    // só revisor da área decide (o aluno e o admin sem área não)
    await expect(as(STUDENT, (q) => q(`select public.app_question_analysis_decide($1, 'approved')`, [a.id]))).rejects.toThrow(/revisor cadastrado/);
    await expect(as(ADMIN, (q) => q(`select public.app_question_analysis_decide($1, 'approved')`, [a.id]))).rejects.toThrow(/revisor cadastrado/);
    await dev.db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, $2) on conflict do nothing`, [REVIEWER, a.area]);
    // análise criada pela simulação nunca é publicada
    await expect(as(REVIEWER, (q) => q(`select public.app_question_analysis_decide($1, 'approved')`, [a.id]))).rejects.toThrow(/simulação de desenvolvimento/);
    // (para exercitar o resto do fluxo, o teste a reatribui a um modelo que não é a simulação)
    await dev.db.query(`update public.question_analysis set generated_by_model = 'modelo-de-teste' where id = $1`, [a.id]);
    await expect(as(REVIEWER, (q) => q(`select public.app_question_analysis_decide($1, 'rejected')`, [a.id]))).rejects.toThrow(/motivo/);
    await as(REVIEWER, (q) => q(`select public.app_question_analysis_decide($1, 'approved', 'Conferi as quatro alternativas.')`, [a.id]));
    expect((await sql(`select status from public.question_comments where analysis_id = $1 order by level`, [a.id])).map((r) => r.status)).toEqual(["published", "published"]);
    // publicada, mas o aluno ainda não respondeu: continua fechada (a análise revela o gabarito)
    expect((await as(STUDENT, (q) => q(`select public.app_question_commentary($1) r`, [a.question_id])))[0].r).toBeNull();
    // depois de responder a questão, recebe: gabarito oficial, análise de cada alternativa e comentário; sem nome de modelo
    await dev.db.query(`insert into public.question_attempts (user_id, question_id, selected_option) values ($1, $2, 'B')`, [STUDENT, a.question_id]);
    const out = (await as(STUDENT, (q) => q(`select public.app_question_commentary($1, 'full') r`, [a.question_id])))[0].r;
    expect(out.official_status).toBe("FINAL");
    expect(out.options).toHaveLength(4);
    expect(out.options.filter((o: any) => o.is_official_correct)).toHaveLength(1);
    expect(out.current_best_answer).toBeNull();
    expect(out.comment.why_wrong).toHaveLength(3);
    expect(JSON.stringify(out)).not.toMatch(/mock|claude|gpt/i);
  });

  it("análise reprovada em conferência não pode ser aprovada", async () => {
    const a = (await sql(`select a.id from public.question_analysis a join public.question_analysis_checks c on c.analysis_id = a.id and c.layer = 'software' and c.verdict = 'fail' where a.is_current limit 1`))[0];
    if (!a) return;
    await dev.db.query(`update public.question_analysis set generated_by_model = 'modelo-de-teste' where id = $1`, [a.id]);
    const area = (await sql(`select public.question_area_code(question_id) area from public.question_analysis where id = $1`, [a.id]))[0].area;
    await dev.db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, $2) on conflict do nothing`, [REVIEWER, area]);
    await expect(as(REVIEWER, (q) => q(`select public.app_question_analysis_decide($1, 'approved')`, [a.id]))).rejects.toThrow(/reprovada/);
  });

  it("se a questão mudar depois da análise, a aprovação é barrada e a análise aparece como desatualizada", async () => {
    const a = (await sql(`select a.id, a.question_id from public.question_analysis a where a.is_current and a.status = 'checked' order by a.question_id limit 1`))[0];
    await sql(`update public.question_analysis set generated_by_model = 'modelo-de-teste' where id = $1`, [a.id]);
    await sql(`update public.questions set statement = statement || ' (editado)' where id = $1`, [a.question_id]);
    await expect(as(REVIEWER, (q) => q(`select public.app_question_analysis_decide($1, 'approved')`, [a.id]))).rejects.toThrow(/gere a análise de novo/);
    const list = (await as(ADMIN, (q) => q(`select public.app_question_analyses('checked', null, 50) r`)))[0].r;
    expect(list.items.find((i: any) => i.question_id === a.question_id).stale).toBe(true);
    // a questão alterada volta à fila de análise
    const queue = await db.service<any[]>("ch_worker_questions_for_analysis", { p_limit: 500, p_exam: null, p_only_missing: true });
    expect(queue.some((x) => x.id === a.question_id)).toBe(true);
  });

  it("as tabelas do SQIE não são legíveis por aluno (revelam o gabarito)", async () => {
    for (const t of ["question_official_answers", "question_analysis", "question_option_analysis", "question_comments", "question_change_log"]) {
      expect(await as(STUDENT, (q) => q(`select * from public.${t} limit 1`)), t).toEqual([]);
    }
    await expect(as(STUDENT, (q) => q(`select public.app_question_analyses()`))).rejects.toThrow(/restrito/);
  });
});
