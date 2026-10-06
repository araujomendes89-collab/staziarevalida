// @vitest-environment node
/**
 * Aulas (supabase/migrations/…3900_aulas.sql) num Postgres real em memória: a equipe cria e publica,
 * o aluno só vê publicadas, materiais acompanham a aula, progresso e conclusão valem XP uma vez,
 * e "Treinar questões deste tema" cai no tema (ou na área, quando o tema não tem questão).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ANA = "00000000-0000-4000-8000-00000000000a";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
let db: PGlite;
let lessonId: string;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k])));
    return r.rows[0].result;
  });
}
const asUser = (uid: string, sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return tx.query<any>(sql, params);
  });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@t.dev'), ($2, 'ed@t.dev'), ($3, 'adm@t.dev')`, [ANA, EDITOR, ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.exec(`insert into public.exams (id, kind, year, semester, title, question_count) values ('e', 'REVALIDA', 2024, 1, 'E', 10)`);
  const options = JSON.stringify(["A", "B", "C", "D"].map((id) => ({ id, text: id, explanation: "" })));
  for (let i = 1; i <= 8; i++) {
    await db.query(`insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option) values ($1, $2, 'e', $3, 'PEDIATRIA', $4, 'x', $5::jsonb, 'B')`, [`q${i}`, `C${i}`, i, i <= 5 ? "Bronquiolite" : "Outro tema", options]);
  }
}, 300_000);

describe("Equipe cria e publica", () => {
  it("editor cria a aula com a estrutura completa; aluno não vê enquanto não publicar", async () => {
    await expect(rpc(ANA, "app_admin_save_lesson", { p_lesson: { area: "PEDIATRIA", topic: "Bronquiolite", title: "x" } })).rejects.toThrow(/equipe/);
    await expect(rpc(EDITOR, "app_admin_save_lesson", { p_lesson: { area: "PEDIATRIA", title: "Sem tema" } })).rejects.toThrow(/tema/);
    await expect(rpc(EDITOR, "app_admin_save_lesson", { p_lesson: { area: "PEDIATRIA", topic: "Bronquiolite", title: "Aula", video_url: "http://inseguro" } })).rejects.toThrow(/https/);
    const l = await rpc(EDITOR, "app_admin_save_lesson", {
      p_lesson: {
        area: "PEDIATRIA", topic: "Bronquiolite", title: "Bronquiolite viral aguda", duration_minutes: 45, instructor: "Dra. Teste", specialty: "Pneumologia pediátrica",
        video_url: "https://www.youtube.com/watch?v=abc123", summary: "Síntese.", key_points: ["Não usar broncodilatador de rotina", " ", "Suporte"],
        guideline_title: "PCDT Bronquiolite", guideline_url: "https://www.gov.br/saude/pcdt",
      },
    });
    lessonId = l.id;
    expect(l).toMatchObject({ published: false, key_points: ["Não usar broncodilatador de rotina", "Suporte"], area_label: "Pediatria", questions_topic: 5, questions_area: 8 });
    expect((await rpc(ANA, "app_lessons")).lessons).toEqual([]);
    expect(await rpc(ANA, "app_lesson", { p_id: lessonId })).toBeNull();
    expect((await rpc(EDITOR, "app_admin_lessons")).lessons.length).toBe(1);
  });

  it("materiais: arquivo registrado pelo servidor, diretriz por endereço; slides novos substituem os antigos", async () => {
    await expect(rpc(EDITOR, "app_admin_lesson_material", { p_lesson_id: lessonId, p_material: { kind: "slides", title: "Slides", storage_path: "documents/x.pdf" } })).rejects.toThrow(/Caminho/);
    await rpc(EDITOR, "app_admin_lesson_material", { p_lesson_id: lessonId, p_material: { kind: "slides", title: "Slides v1", storage_path: `lessons/${lessonId}/slides-aaa.pdf`, content_type: "application/pdf", size_bytes: 10 } });
    let l = await rpc(EDITOR, "app_admin_lesson_material", { p_lesson_id: lessonId, p_material: { kind: "slides", title: "Slides v2", storage_path: `lessons/${lessonId}/slides-bbb.pdf`, content_type: "application/pdf", size_bytes: 12 } });
    expect(l.materials.filter((m: any) => m.kind === "slides").map((m: any) => m.title)).toEqual(["Slides v2"]);
    l = await rpc(EDITOR, "app_admin_lesson_material", { p_lesson_id: lessonId, p_material: { kind: "flashcast", title: "Flashcast", storage_path: `lessons/${lessonId}/flashcast-ccc.mp3`, content_type: "audio/mpeg", size_bytes: 99 } });
    l = await rpc(EDITOR, "app_admin_lesson_material", { p_lesson_id: lessonId, p_material: { kind: "guideline", title: "PCDT", url: "https://www.gov.br/x" } });
    expect(l.materials.map((m: any) => [m.kind, m.has_file])).toEqual([["slides", true], ["flashcast", true], ["guideline", false]]);
    expect(JSON.stringify(l.materials)).not.toMatch(/storage_path/);
  });

  it("publicar: aluno vê o catálogo com contagem por área e o detalhe; busca sem acento", async () => {
    await rpc(EDITOR, "app_admin_save_lesson", { p_lesson: { id: lessonId, area: "PEDIATRIA", topic: "Bronquiolite", title: "Bronquiolite viral aguda", published: true } });
    const c = await rpc(ANA, "app_lessons", { p_area: null, p_search: "bronquiolite" });
    expect(c).toMatchObject({ total: 1, by_area: { PEDIATRIA: 1 }, completed: 0 });
    expect(c.lessons[0].title).toBe("Bronquiolite viral aguda");
    expect((await rpc(ANA, "app_lessons", { p_area: "CIRURGIA_GERAL" })).lessons).toEqual([]);
    const d = await rpc(ANA, "app_lesson", { p_id: lessonId });
    expect(d.materials.length).toBe(3);
    expect(d.progress).toBeNull();
    // o material é servido pelo servidor: o aluno lê o caminho só de aula publicada
    const m = await rpc(ANA, "app_lesson_material", { p_id: d.materials[0].id });
    expect(m.storage_path).toMatch(/^lessons\//);
  });
});

describe("Aluno", () => {
  it("progresso só cresce; concluir vale XP uma vez; não escreve direto na tabela", async () => {
    let p = await rpc(ANA, "app_lesson_progress", { p_id: lessonId, p_seconds: 120 });
    expect(p).toMatchObject({ seconds_watched: 120, completed_at: null, xp: null });
    p = await rpc(ANA, "app_lesson_progress", { p_id: lessonId, p_seconds: 60 });
    expect(p.seconds_watched).toBe(120);
    p = await rpc(ANA, "app_lesson_progress", { p_id: lessonId, p_seconds: 2700, p_completed: true });
    expect(p.completed_at).toBeTruthy();
    expect(p.xp).toBe(20);
    p = await rpc(ANA, "app_lesson_progress", { p_id: lessonId, p_completed: true });
    expect(p.xp).toBeNull(); // já tinha concluído: nada de novo
    const ev = await db.query<any>(`select count(*)::int n, sum(xp_awarded)::int xp from public.gamification_events where user_id = $1 and event_type = 'LESSON_COMPLETED'`, [ANA]);
    expect(ev.rows[0]).toEqual({ n: 1, xp: 20 });
    expect((await rpc(ANA, "app_lessons")).completed).toBe(1);
    await expect(asUser(ANA, `insert into public.lesson_progress (user_id, lesson_id, completed_at) values ($1, $2, now())`, [ANA, lessonId])).rejects.toThrow();
    await expect(asUser(ANA, `update public.lessons set published = false`)).resolves.toMatchObject({ affectedRows: 0 });
  });

  it("treinar questões: pelo tema da aula; sem questão no tema, pela área", async () => {
    const s = await rpc(ANA, "app_start_lesson_questions", { p_id: lessonId, p_count: 10 });
    expect(s.filters).toEqual({ area: "PEDIATRIA", topic: "Bronquiolite" });
    expect(s.count).toBe(5);
    const other = await rpc(EDITOR, "app_admin_save_lesson", { p_lesson: { area: "PEDIATRIA", topic: "Tema sem questões", title: "Outra aula", published: true } });
    const s2 = await rpc(ANA, "app_start_lesson_questions", { p_id: other.id, p_count: 10 });
    expect(s2.filters).toEqual({ area: "PEDIATRIA" });
    expect(s2.count).toBe(8);
  });

  it("temas com questões ajudam a equipe a ligar a aula ao banco; admin apaga a aula e os materiais somem", async () => {
    const t = await rpc(EDITOR, "app_lesson_topics", { p_area: "PEDIATRIA" });
    expect(t.map((x: any) => [x.topic, x.questions])).toEqual([["Bronquiolite", 5], ["Outro tema", 3]]);
    await expect(rpc(EDITOR, "app_admin_delete_lesson", { p_id: lessonId })).rejects.toThrow(/administradores/);
    expect(await rpc(ADMIN, "app_admin_delete_lesson", { p_id: lessonId })).toBe(true);
    expect((await db.query<any>(`select count(*)::int n from public.lesson_materials`)).rows[0].n).toBe(0);
    const log = await rpc(ADMIN, "app_admin_audit", { p_limit: 20 });
    expect(JSON.stringify(log)).toMatch(/lesson\.delete/);
  });
});
