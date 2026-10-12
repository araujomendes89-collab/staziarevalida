// @vitest-environment node
/**
 * A migração 9620 convive com as entregas de Aulas (9580) e Podcasts (9591 a 9593) sem desfazê-las:
 *  (a) o título que a equipe deu à fonte do podcast continua valendo (9593, title_by_staff);
 *  (b) o aluno continua com rótulo neutro nos materiais e sem o nome do arquivo (9580);
 *  (c) a tabela lesson_materials continua sem leitura direta do aluno (9580) e lesson_reviews sem acesso;
 *  (d) a 9620 colada duas vezes não muda nada;
 *  (e) colada ANTES da 9593 (mas DEPOIS da 9580, de que ela depende: usa review_status) não dá erro (e, colada de novo no fim, o filtro vale);
 *  (f) a conferência do áudio das aulas (9580, review_status) continua valendo: material aguardando conferência não chega ao aluno.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const ALUNA = "00000000-0000-4000-8000-00000000000a";
const NOVA = "20261003009620_fontes_complementares.sql";
// 2026-10-11: a 9620 parte da 9580 (conferência do áudio das aulas: review_status, lesson_can_release), então a 9580 precisa vir antes
const DEPOIS = ["20261003009590", "20261003009591", "20261003009592", "20261003009593"];
// (APOIO-B) a 9621 (parte da equipe) vem depois da 9620 e redefine duas funções dela: este arquivo prova só a 9620, então a deixa de fora
// (LEVA3-Q) a 9701 (comentário da questão em revisão) redefine duas funções ch_raw_* da 9620 e exige a 9620 e a 9621 coladas antes dela;
// este arquivo prova só a 9620 (e cola a 9620 de novo no fim), então deixa a 9701 de fora; a ordem com a 9701 está em leva3QComentarioBanco.test.ts
const todas = () => fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && !f.startsWith("20261003009621") && !f.startsWith("20261003009701")).sort();
const ler = (f: string) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8");

async function novoBanco(arquivos: string[]) {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const f of arquivos) await db.exec(ler(f));
  for (const [id, email] of [[ADMIN, "master@teste.dev"], [ALUNA, "aluna@teste.dev"]]) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [id, email]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  return db;
}
async function rpc(db: PGlite, uid: string, fn: string, args: Record<string, unknown> = {}) {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<{ r: any }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, keys.map((k) => args[k]))).rows[0].r;
  });
}
const comoAluna = async (db: PGlite, text: string) =>
  db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ALUNA })]);
    return (await tx.query<any>(text)).rows;
  });
/** Impressão do banco: corpo de toda função do schema public + políticas + colunas. */
async function impressao(db: PGlite) {
  const f = (await db.query<any>(`select p.oid::regprocedure::text as sig, md5(p.prosrc) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`)).rows;
  const pol = (await db.query<any>(`select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' order by 1, 2`)).rows;
  const col = (await db.query<any>(`select table_name, column_name from information_schema.columns where table_schema = 'public' order by 1, 2`)).rows;
  return { f, pol, col };
}

const TITULO_COMP = "Sangue nos Olhos — Clínica Médica";
const FIXTURA = async (db: PGlite) => {
  // a apostila está CADASTRADA na biblioteca (nível E nasce complementar): só o nome cadastrado a identifica (decisão do dono, 2026-10-11)
  await db.query(`insert into public.ch_sources (title, organ, kind, version, authority_level) values ($1, 'Editora Sangue nos Olhos', 'final', '2026', 'E')`, [TITULO_COMP]);
  const aula = (await db.query<any>(`insert into public.lessons (area, topic, title, published) values ('PEDIATRIA', 'Bronquiolite', 'Aula', true) returning id`)).rows[0].id;
  await db.query(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ($1, 'slides', 'arquivo-secreto-da-aula.pdf', $2)`, [aula, `lessons/${aula}/a.pdf`]);
  const pod = (await db.query<any>(
    `insert into public.podcasts (title, area, status, script, approved_at, audio_path, published_at) values ('Episódio de teste', 'PEDIATRIA', 'published', '{"lines":[]}'::jsonb, now(), 'p/x.mp3', now()) returning id`)).rows[0].id;
  await db.query(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position, title_by_staff) values ($1, 'pdf', 'PCDT Bronquiolite.pdf', 'p/a.pdf', 1, true)`, [pod]);
  await db.query(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'arquivo-do-aluno-xyz-longo-sem-extensao', 'p/b.pdf', 2)`, [pod]);
  // a apostila (título cadastrado) em material de aula e em fonte de podcast: o filtro da 9620 continua valendo
  await db.query(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ($1, 'other', $3, $2)`, [aula, `lessons/${aula}/b.pdf`, `${TITULO_COMP}.pdf`]);
  await db.query(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', $2, 'p/c.pdf', 3)`, [pod, `${TITULO_COMP}.pdf`]);
  // um material com 'Sangue nos Olhos' solto no nome NÃO é apostila cadastrada: continua aparecendo (decisão de 2026-10-11)
  await db.query(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ($1, 'other', 'Queixa de sangue nos olhos.pdf', $2)`, [aula, `lessons/${aula}/c.pdf`]);
  return { aula, pod };
};
const confere = async (db: PGlite, aula: string, pod: string) => {
  // (a) o título da equipe vale; o outro vira "Documento N" (N = posição) e o nome do arquivo não sai
  const ep = await rpc(db, ALUNA, "app_podcast", { p_id: pod });
  expect(ep.sources.map((s: any) => s.title)).toEqual(["PCDT Bronquiolite.pdf", "Documento 2"]);
  expect(JSON.stringify(ep)).not.toContain("arquivo-do-aluno");
  expect(JSON.stringify(ep)).not.toMatch(/sangue/i);
  // (b) rótulo neutro e sem nome do arquivo; a equipe recebe file_title e storage_path
  const l = await rpc(db, ALUNA, "app_lesson", { p_id: aula });
  expect(l.materials.map((m: any) => m.title)).toEqual(["Material complementar", "Material 1"]);
  expect(JSON.stringify(l)).not.toContain("arquivo-secreto");
  expect(JSON.stringify(l)).not.toContain("Queixa"); // o nome do arquivo nunca sai; o rótulo é neutro
  expect(JSON.stringify(l)).not.toContain(TITULO_COMP);
  expect(JSON.stringify(l)).not.toContain("storage_path");
  const eq = await rpc(db, ADMIN, "app_lesson", { p_id: aula });
  expect(eq.materials[0]).toMatchObject({ file_title: "arquivo-secreto-da-aula.pdf" });
  expect(eq.materials[0].storage_path).toContain("lessons/");
  // (c) leitura direta: tabela de materiais só da equipe; lesson_reviews sem acesso
  expect(await comoAluna(db, `select * from public.lesson_materials`)).toEqual([]);
  expect((await db.query<any>(`select policyname from pg_policies where schemaname = 'public' and tablename = 'lesson_materials'`)).rows.map((r) => r.policyname)).toEqual(["materiais: só a equipe"]);
  await expect(comoAluna(db, `select * from public.lesson_reviews`)).rejects.toThrow(/permission|permiss/i);
};

describe("9620 junto das entregas de Aulas e Podcasts", () => {
  it("(a)(b)(c)(d) na ordem normal: nada é desfeito, e colar a 9620 duas vezes não muda nada", async () => {
    const db = await novoBanco(todas());
    const { aula, pod } = await FIXTURA(db);
    await confere(db, aula, pod);
    const antes = await impressao(db);
    await db.exec(ler(NOVA));
    await db.exec(ler(NOVA));
    expect(await impressao(db)).toEqual(antes);
    await confere(db, aula, pod);
  }, 90_000);

  it("(f) a conferência do áudio das aulas (9580) continua valendo depois da 9620: material aguardando conferência não chega ao aluno nem pelo link", async () => {
    const db = await novoBanco(todas());
    const { aula } = await FIXTURA(db);
    const pend = (await db.query<any>(`insert into public.lesson_materials (lesson_id, kind, title, storage_path, review_status) values ($1, 'flashcast', 'audio-pendente.mp3', $2, 'pending') returning id`, [aula, `lessons/${aula}/pend.mp3`])).rows[0].id;
    const aprov = (await db.query<any>(`insert into public.lesson_materials (lesson_id, kind, title, storage_path, review_status) values ($1, 'flashcast', 'audio-conferido.mp3', $2, 'approved') returning id`, [aula, `lessons/${aula}/ok.mp3`])).rows[0].id;
    const l = await rpc(db, ALUNA, "app_lesson", { p_id: aula });
    expect(l.materials.map((m: any) => m.id)).toContain(aprov);
    expect(l.materials.map((m: any) => m.id)).not.toContain(pend);
    expect(await rpc(db, ALUNA, "app_lesson_material", { p_id: pend })).toBeNull();
    expect(await rpc(db, ALUNA, "app_lesson_material", { p_id: aprov })).toMatchObject({ id: aprov });
    const eq = await rpc(db, ADMIN, "app_lesson", { p_id: aula });
    expect(eq.materials.find((m: any) => m.id === pend)).toMatchObject({ review_status: "pending" }); // a equipe vê o estado da conferência
  }, 90_000);

  it("(e) a 9620 colada ANTES da 9593 (depois da 9580) não dá erro; colada de novo no fim, tudo vale", async () => {
    const base = todas().filter((f) => f !== NOVA && !DEPOIS.some((d) => f.startsWith(d)));
    const db = await novoBanco(base);
    await db.exec(ler(NOVA));
    for (const f of todas().filter((f) => DEPOIS.some((d) => f.startsWith(d)))) await db.exec(ler(f));
    await db.exec(ler(NOVA));
    const { aula, pod } = await FIXTURA(db);
    await confere(db, aula, pod);
  }, 90_000);
});
