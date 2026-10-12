// @vitest-environment node
/**
 * Fontes complementares, rodada de correções (banco). Num Postgres real em memória com TODAS as migrações.
 *  (A) mudar o nível/classe de uma fonte (por app_ch_set_source_authority, por UPDATE direto, ou apagar a fonte) atualiza as marcas
 *      guardadas dos anexos (aula, material, atualização), nos dois sentidos.
 *  (D) o banco normaliza entidades HTML como o servidor (ver também fontesComplementaresRodada2Servidor.test.ts).
 *  (E) o gatilho de salvar só monta a expressão da biblioteca uma vez por instrução.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ADMIN = "00000000-0000-4000-8000-0000000c00ad";
const ALUNA = "00000000-0000-4000-8000-0000000c000a";

const SHA = "a".repeat(64);
const FONTE_TITULO = "Manual de Referência Beta de Pediatria 2026";
const FONTE_URL = "https://editora-beta.invalid/pediatria-2026.pdf";

let db: PGlite;
const sql = async <T = any>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
const arg = (v: unknown) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);
async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => arg(args[k])));
    return r.rows[0].result;
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  for (const [id, email, name] of [[ADMIN, "adm@c.dev", "Adm"], [ALUNA, "aluna@c.dev", "Aluna"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await sql(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
}, 120_000);

describe("(A) marcas guardadas dos anexos acompanham o nível e a classe da fonte", () => {
  let fonteId: string;
  let aulaId: string;
  let materialId: string;
  let materialSemSha: string;
  let atualizacaoId: string;
  let podcastId: string;
  let podSrcId: string;

  const marcas = async () => ({
    material: (await sql(`select hidden_from_student h from public.lesson_materials where id = $1`, [materialId]))[0].h,
    aula: (await sql(`select guideline_hidden h from public.lessons where id = $1`, [aulaId]))[0].h,
    atualizacao: (await sql(`select source_hidden h from public.guideline_updates where id = $1`, [atualizacaoId]))[0].h,
  });
  const alunaVeMaterial = async () => (await rpc(ALUNA, "app_lesson_material", { p_id: materialId })) !== null;
  const podcastEscondido = async () => (await sql(`select public.podcast_admin_view($1) v`, [podcastId]))[0].v.sources.find((s: any) => s.id === podSrcId).student_hidden;

  beforeAll(async () => {
    // fonte OFICIAL nível A com o mesmo arquivo (SHA-256) que foi anexado a uma aula
    fonteId = (await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level, sha256) values ($1, 'Editora Beta de Pediatria (teste)', 'final', $2, '2026', 'A', $3) returning id`, [FONTE_TITULO, FONTE_URL, SHA]))[0].id;
    aulaId = (await sql(`insert into public.lessons (area, topic, title, guideline_title, published) values ('PEDIATRIA', 'Bronquiolite', 'Bronquiolite na prática', $1, true) returning id`, [FONTE_TITULO]))[0].id;
    materialId = (await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path, sha256) values ($1, 'other', 'Material de apoio', $2, $3) returning id`, [aulaId, `lessons/${aulaId}/neutro.pdf`, SHA]))[0].id;
    materialSemSha = (await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ($1, 'other', 'Outro material', $2) returning id`, [aulaId, `lessons/${aulaId}/outro.pdf`]))[0].id;
    atualizacaoId = (await sql(
      `insert into public.guideline_updates (slug, area, topic, institution, document_title, source_url, published, review_status, source_checked_at, reviewed_by, reviewed_at)
       values ('diretriz-beta', 'PEDIATRIA', 'Bronquiolite leve', 'Editora Beta de Pediatria (teste)', $1, 'https://exemplo.invalid/diretriz-beta', true, 'approved', now(), $2, now()) returning id`, [FONTE_TITULO, ADMIN]))[0].id;
    podcastId = (await sql(`insert into public.podcasts (title, topic, area, status, script, approved_at, audio_path, published_at) values ('Bronquiolite em 8 minutos', 'Bronquiolite', 'PEDIATRIA', 'published', '{"lines":[]}'::jsonb, now(), 'podcasts/x.mp3', now()) returning id`))[0].id;
    podSrcId = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, sha256, position) values ($1, 'pdf', 'Resumo.pdf', 'podcasts/a.pdf', $2, 1) returning id`, [podcastId, SHA]))[0].id;
  });

  it("começa tudo à mostra (fonte oficial)", async () => {
    expect(await marcas()).toEqual({ material: false, aula: false, atualizacao: false });
    expect(await alunaVeMaterial()).toBe(true);
    expect(await podcastEscondido()).toBe(false);
  });

  it("subir o nível para E pela função do administrador esconde os anexos e o aluno deixa de receber o arquivo", async () => {
    await rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: fonteId, p_level: "E" });
    expect((await sql(`select audience from public.ch_sources where id = $1`, [fonteId]))[0].audience).toBe("complementar");
    expect(await marcas()).toEqual({ material: true, aula: true, atualizacao: true });
    expect(await alunaVeMaterial()).toBe(false);
    expect(await podcastEscondido()).toBe(true);
    expect((await sql(`select hidden_from_student h from public.lesson_materials where id = $1`, [materialSemSha]))[0].h).toBe(false);
  });

  it("voltar a classe para oficial (pela função) devolve a marca", async () => {
    await rpc(ADMIN, "app_ch_set_source_audience", { p_source_id: fonteId, p_audience: "oficial" });
    expect(await marcas()).toEqual({ material: false, aula: false, atualizacao: false });
    expect(await alunaVeMaterial()).toBe(true);
  });

  it("UPDATE direto só do nível (A para E) também esconde", async () => {
    await sql(`update public.ch_sources set authority_level = 'A' where id = $1`, [fonteId]);
    expect(await marcas()).toEqual({ material: false, aula: false, atualizacao: false });
    await sql(`update public.ch_sources set authority_level = 'E' where id = $1`, [fonteId]);
    expect(await marcas()).toEqual({ material: true, aula: true, atualizacao: true });
  });

  it("UPDATE direto só da classe (complementar para oficial) devolve a marca, e de volta esconde", async () => {
    await sql(`update public.ch_sources set audience = 'oficial' where id = $1`, [fonteId]);
    expect(await marcas()).toEqual({ material: false, aula: false, atualizacao: false });
    await sql(`update public.ch_sources set audience = 'complementar' where id = $1`, [fonteId]);
    expect(await marcas()).toEqual({ material: true, aula: true, atualizacao: true });
  });

  it("apagar a fonte complementar devolve a marca; fonte nova de nível E esconde de uma vez", async () => {
    await sql(`delete from public.ch_sources where id = $1`, [fonteId]);
    expect(await marcas()).toEqual({ material: false, aula: false, atualizacao: false });
    await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level, sha256) values ($1, 'Editora Beta de Pediatria (teste)', 'final', $2, '2026', 'E', $3)`, [FONTE_TITULO, FONTE_URL, SHA]);
    expect(await marcas()).toEqual({ material: true, aula: true, atualizacao: true });
  });
});
