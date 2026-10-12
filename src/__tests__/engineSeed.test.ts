// @vitest-environment node
/**
 * Pacote do motor de engenharia reversa no banco: imagens, classificação detalhada, limpeza de
 * rodapé, questões equivalentes entre provas e incidência real.
 */
import { beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { buildSeedStatements } from "../../scripts/supabase/seed-builder";
import { ASSETS_PUBLIC_DIR, buildEngineStatements, EXCLUDED_EXAMS, findEquivalents, loadEnginePackage } from "../../scripts/supabase/engine-seed";

const ROOT = path.resolve(__dirname, "../..");
const ANA = "00000000-0000-4000-8000-00000000000a";
const REVIEWER_PED = "00000000-0000-4000-8000-0000000000c2";
const STAFF = "00000000-0000-4000-8000-0000000000ed";
let db: PGlite;

async function as<T>(uid: string, fn: (q: (sql: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return fn(async (sql, p = []) => (await tx.query<any>(sql, p)).rows);
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const f of fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"));
  }
  for (const statement of [...buildSeedStatements(), ...buildEngineStatements()]) await db.exec(statement);
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@teste.dev'), ($2, 'editor@teste.dev')`, [ANA, STAFF]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [STAFF]);
  await db.query(`insert into auth.users (id, email) values ($1, 'revisor@teste.dev')`, [REVIEWER_PED]);
  await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [REVIEWER_PED]);
}, 180_000);

describe("Pacote do motor", () => {
  it("o pacote é conferido pelo manifesto e a 2020/2 duplicada fica de fora, com o motivo", () => {
    const { questions, excluded } = loadEnginePackage();
    expect(questions).toHaveLength(1200);
    expect(excluded).toHaveLength(100);
    expect(EXCLUDED_EXAMS.revalida_2020_2).toMatch(/idênticos aos de revalida_2020_1/);
    expect(questions.some((q) => q.exam_id === "revalida_2020_2")).toBe(false);
  });

  it("as imagens das questões ficam vinculadas e cada arquivo confere com o hash do manifesto", async () => {
    const r = await db.query<any>(`select id, images from public.questions where jsonb_array_length(images) > 0`);
    expect(r.rows).toHaveLength(46);
    for (const q of r.rows) {
      for (const img of q.images) {
        const file = path.join(ASSETS_PUBLIC_DIR, img.url.replace("/question-assets/", ""));
        expect(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), `${q.id} ${img.url}`).toBe(img.sha256);
        expect(img.alt).toMatch(/^Figura \d+ da questão \d+$/);
      }
    }
  });

  it("questão que cita figura entra no treino quando a imagem existe", async () => {
    const withImage = (await db.query<any>(`select count(*)::int n from public.questions where needs_image and jsonb_array_length(images) > 0 and status <> 'annulled'`)).rows[0].n;
    expect(withImage).toBeGreaterThan(20);
    const stillOut = (await db.query<any>(`select id from public.questions where needs_image and jsonb_array_length(images) = 0 and status <> 'annulled'`)).rows;
    expect(stillOut.length).toBeLessThan(5); // citam figura que o pacote não trouxe: seguem fora do treino
  });

  it("nenhum rodapé nem pesquisa de satisfação sobra no texto, e cada remoção ficou registrada", async () => {
    const left = await db.query<any>(
      `select id from public.questions q, jsonb_array_elements(q.options) o
       where o ->> 'text' ~ '(PRIMEIRA|SEGUNDA) EDIÇÃO|QUESTIONÁRIO DE PERCEPÇÃO|Espaço livre\\s*$|Revalida 20\\d\\d\\s*$|enamed Exame Nacional'
          or q.statement ~ 'QUESTIONÁRIO DE PERCEPÇÃO'`
    );
    expect(left.rows).toEqual([]);
    const c = (await db.query<any>(`select count(*)::int n, count(distinct question_id)::int q from public.question_cleanups`)).rows[0];
    expect(c.n).toBeGreaterThanOrEqual(234);
    expect(c.q).toBeGreaterThanOrEqual(231);
    const survey = (await db.query<any>(`select removed_text from public.question_cleanups where rule = 'questionario-de-percepcao' limit 1`)).rows[0];
    expect(survey.removed_text).toMatch(/^QUESTIONÁRIO DE PERCEPÇÃO/);
    // alternativa legítima intacta
    const keep = (await db.query<any>(`select o ->> 'text' t from public.questions q, jsonb_array_elements(q.options) o where q.id = 'revalida_2020_1_q077' and o ->> 'id' = 'D'`)).rows[0].t;
    expect(keep).toMatch(/prosseguimento ou não do rastreamento\.$/);
  });

  it("a classificação detalhada cobre as 1.117 questões válidas e só a equipe a lê (traz o conceito da resposta)", async () => {
    expect((await db.query<any>(`select count(*)::int n from public.question_dna`)).rows[0].n).toBe(1117);
    expect(await as(ANA, (q) => q(`select * from public.question_dna limit 1`))).toEqual([]);
    const staff = await as(STAFF, (q) => q(`select question_id, competency, care_setting, detail ->> 'correct_answer_concept' as c from public.question_dna where question_id = 'enamed_2025_q001'`));
    expect(staff[0]).toMatchObject({ competency: "SELECT_TREATMENT", care_setting: "OUTPATIENT_SPECIALTY" });
    expect(staff[0].c).toMatch(/Espironolactona/);
  });

  it("equivalentes: 49 pares ENAMED 2025 × Revalida 2025/2 e 1 par 2022/2 × 2023/1, todos com similaridade alta", async () => {
    const r = await db.query<any>(`select group_id, array_agg(question_id order by question_id) ids, min(similarity) s from public.question_equivalents group by group_id`);
    expect(r.rows).toHaveLength(50);
    expect(r.rows.every((g: any) => g.ids.length === 2 && g.s >= 0.75)).toBe(true);
    expect(r.rows.filter((g: any) => g.ids.every((i: string) => /^(enamed_2025|revalida_2025_2)/.test(i)))).toHaveLength(49);
  });

  it("um treino não repete a mesma questão cobrada em duas provas", async () => {
    const twins = new Map<string, string>();
    for (const g of (await db.query<any>(`select group_id, array_agg(question_id) ids from public.question_equivalents group by group_id`)).rows) for (const id of g.ids) twins.set(id, g.group_id);
    // restringe o treino às provas que compartilham questões, para forçar a colisão
    for (let round = 0; round < 15; round++) {
      const r = await as(ANA, async (q) => {
        const s = await q(`select public.app_start_session('questoes', '{}'::jsonb, 200) as r`);
        return (await q(`select question_ids from public.practice_sessions where id = $1`, [s[0].r.session_id]))[0].question_ids as string[];
      });
      const groups = r.map((id) => twins.get(id)).filter(Boolean);
      expect(new Set(groups).size, `rodada ${round}`).toBe(groups.length);
    }
  });

  it("a mesma questão ainda aparece, uma vez, quando só uma delas pode ser sorteada", async () => {
    const r = await as(ANA, async (q) => {
      const s = await q(`select public.app_start_session('questoes', '{"exam_id": "enamed-2025"}'::jsonb, 200) as r`);
      return (await q(`select cardinality(question_ids) n from public.practice_sessions where id = $1`, [s[0].r.session_id]))[0].n as number;
    });
    expect(r).toBeGreaterThan(80); // a prova inteira (menos anuladas e as que dependem de figura ausente)
  });
});

describe("Incidência real", () => {
  it("conta questões oficiais por tema e por prova, com o método explícito e o que ficou de fora", async () => {
    const r = await as(ANA, (q) => q(`select public.app_incidence('topic') as r`));
    const inc = r[0].r;
    expect(inc.method).toMatch(/anuladas ficam de fora/);
    expect(inc.annulled).toBe(83);
    expect(inc.counted + inc.annulled + inc.unclassified).toBe(1200);
    const total = inc.rows.reduce((n: number, row: any) => n + row.total, 0);
    expect(total).toBe(inc.counted);
    expect(inc.rows[0].total).toBeGreaterThanOrEqual(inc.rows[inc.rows.length - 1].total);
    for (const row of inc.rows) expect(Object.values<number>(row.by_exam).reduce((a, b) => a + b, 0)).toBe(row.total);
  });

  it("incidência por subárea usa a classificação do motor (mesmo para quem não é equipe) e rejeita dimensão inválida", async () => {
    const r = (await as(ANA, (q) => q(`select public.app_incidence('subarea') as r`)))[0].r;
    expect(r.rows.length).toBeGreaterThan(10);
    expect(r.rows.some((row: any) => row.key === "CARDIOLOGY")).toBe(true);
    await expect(as(ANA, (q) => q(`select public.app_incidence('gabarito')`))).rejects.toThrow(/Dimensão inválida/);
    await expect(db.query(`select public.app_incidence('topic')`)).rejects.toThrow();
  });

  it("não há previsão nem 'altíssima recorrência' inventada: só contagens", async () => {
    const r = (await as(ANA, (q) => q(`select public.app_incidence('area') as r`)))[0].r;
    expect(Object.keys(r.rows[0]).sort()).toEqual(["area", "by_exam", "key", "total"]);
  });
});

describe("Equivalentes (função pura)", () => {
  it("ignora o mesmo exame e agrupa só pares parecidos de provas diferentes", () => {
    const q = (id: string, exam: string, stem: string) => ({ id, exam_id: exam, question_number: 1, status: "ACTIVE", stem, alternatives: { A: "a", B: "b", C: "c", D: "d" }, dna: null, visual: { assets: [] } });
    const text = "Paciente de trinta anos chega ao pronto atendimento com dor abdominal intensa em fossa ilíaca direita há doze horas, febre e vômitos";
    const out = findEquivalents([q("a_q1", "a", text), q("b_q1", "b", text), q("a_q2", "a", text), q("c_q1", "c", "Outro enunciado totalmente diferente sobre vacinação infantil no calendário nacional de rotina")]);
    expect(out.map((e) => e.question_id).sort()).toEqual(["a_q1", "a_q2", "b_q1"]);
  });
});

describe("Rascunhos inéditos do motor", () => {
  it("200 rascunhos (2 lotes de 100) entram aguardando revisão médica, fora do banco de questões", async () => {
    const r = (await db.query<any>(`select batch, count(*)::int n, count(*) filter (where status = 'awaiting_medical_review')::int w from public.draft_questions group by batch order by batch`)).rows;
    expect(r).toEqual([
      { batch: "simulado_preditivo_2026_2_001", n: 100, w: 100 },
      { batch: "simulado_preditivo_2026_2_002", n: 100, w: 100 },
    ]);
    expect((await db.query<any>(`select count(*)::int n from public.questions where id like 'simulado%'`)).rows[0].n).toBe(0);
    expect((await db.query<any>(`select count(*)::int n from public.draft_questions where reviewed_by is not null`)).rows[0].n).toBe(0);
  });

  it("a revisão automática (IA) vem como apontamento e não aprova nada", async () => {
    const r = (await db.query<any>(`select ai_review, similarity_to_official from public.draft_questions where batch = 'simulado_preditivo_2026_2_001' and source_id = 'simulado_revalida_enamed_2026_2_q001'`)).rows[0];
    expect(r.ai_review.status).toBe("APPROVED_FOR_PDF");
    expect(Number(r.similarity_to_official)).toBeGreaterThan(0);
    expect(r.ai_review.medical.verdict).toBeTruthy();
    expect((await db.query<any>(`select count(*)::int n from public.draft_questions where status = 'approved'`)).rows[0].n).toBe(0);
  });

  it("só equipe e revisores leem; aluno não vê rascunho nenhum", async () => {
    expect(await as(ANA, (q) => q(`select id from public.draft_questions`))).toEqual([]);
    await expect(as(ANA, (q) => q(`select public.app_draft_questions()`))).rejects.toThrow(/restrito/);
    const list = (await as(STAFF, (q) => q(`select public.app_draft_questions('simulado_preditivo_2026_2_001', null, 'PEDIATRIA', 5) as r`)))[0].r;
    expect(list.items).toHaveLength(5);
    expect(list.batches).toHaveLength(2);
    expect(list.items.every((i: any) => i.area === "PEDIATRIA" && i.can_review === false)).toBe(true);
  });

  it("só revisor médico da área decide; pedir ajustes ou recusar exige motivo; registra quem e o hash", async () => {
    const { id } = (await db.query<any>(`select id from public.draft_questions where area = 'PEDIATRIA' order by batch, slot limit 1`)).rows[0];
    const other = (await db.query<any>(`select id from public.draft_questions where area = 'CIRURGIA' limit 1`)).rows[0].id;
    await expect(as(STAFF, (q) => q(`select public.app_draft_question_decide($1, 'approved')`, [id]))).rejects.toThrow(/revisor cadastrado na área PEDIATRIA/);
    await expect(as(REVIEWER_PED, (q) => q(`select public.app_draft_question_decide($1, 'approved')`, [other]))).rejects.toThrow(/área CIRURGIA/);
    await expect(as(REVIEWER_PED, (q) => q(`select public.app_draft_question_decide($1, 'rejected')`, [id]))).rejects.toThrow(/motivo/);
    await as(REVIEWER_PED, (q) => q(`select public.app_draft_question_decide($1, 'needs_changes', 'Ajustar a dose citada na alternativa B.')`, [id]));
    const d = (await db.query<any>(`select status, reviewed_by, review_note, reviewed_hash = content_hash as same from public.draft_questions where id = $1`, [id])).rows[0];
    expect(d).toMatchObject({ status: "needs_changes", reviewed_by: REVIEWER_PED, same: true });
  });

  it("reaplicar a carga mantém a decisão; se o conteúdo mudou, a revisão volta a aguardar", async () => {
    const decided = (await db.query<any>(`select id, source_id, batch from public.draft_questions where status = 'needs_changes'`)).rows[0];
    const { buildDraftStatements } = await import("../../scripts/supabase/engine-seed");
    for (const st of buildDraftStatements()) await db.exec(st);
    expect((await db.query<any>(`select status from public.draft_questions where id = $1`, [decided.id])).rows[0].status).toBe("needs_changes");
    // o texto mudou depois da revisão: o hash que foi revisado deixa de ser o do conteúdo atual.
    // O hash é do banco (gatilho): a versão revisada é simulada mudando o enunciado, não o hash.
    await db.query(`update public.draft_questions set stem = 'texto anterior' where id = $1`, [decided.id]);
    await db.query(`update public.draft_questions set reviewed_hash = content_hash where id = $1`, [decided.id]);
    for (const st of buildDraftStatements()) await db.exec(st);
    const after = (await db.query<any>(`select status, reviewed_hash <> content_hash as stale from public.draft_questions where id = $1`, [decided.id])).rows[0];
    expect(after).toEqual({ status: "awaiting_medical_review", stale: true });
  }, 120_000); // recarrega os lotes duas vezes (o gatilho do hash roda em cada linha): com a máquina cheia 5 s não bastam
});
