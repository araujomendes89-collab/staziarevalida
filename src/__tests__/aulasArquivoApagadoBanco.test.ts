// @vitest-environment node
/**
 * A07 (decisão do dono, 11/10/2026): quando a equipe REMOVE um material de aula (ou o troca, ou apaga a aula), o ARQUIVO guardado
 * no depósito também é apagado, como nos Podcasts. Aqui, o banco (migração …9710): a fila de arquivos órfãos, a regra de
 * "só apaga se ninguém mais usa o caminho", o registro da ação e as permissões. Postgres real em memória (PGlite).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ANA = "00000000-0000-4000-8000-00000000000a"; // aluna
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const REVISORA = "00000000-0000-4000-8000-0000000000f1"; // revisora médica de Pediatria que NÃO é da equipe (papel de aluno)
let db: PGlite;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(
      `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}${Array.isArray(args[k]) ? "::text[]" : ""}`).join(", ")}) as result`,
      keys.map((k) => (args[k] !== null && typeof args[k] === "object" && !Array.isArray(args[k]) ? JSON.stringify(args[k]) : args[k])),
    );
    return r.rows[0].result;
  });
}
const asUser = (uid: string, sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return tx.query<any>(sql, params);
  });
const fila = async () => (await db.query<{ storage_path: string }>(`select storage_path from public.lesson_files_pending_delete order by storage_path`)).rows.map((r) => r.storage_path);
const limparFila = () => db.query(`delete from public.lesson_files_pending_delete`);
const paths = async (uid: string) => ((await rpc(uid, "app_admin_lesson_files_purge")).paths as string[]).slice().sort();

let n = 0;
async function novaAula(published = true) {
  const l = await rpc(ADMIN, "app_admin_save_lesson", { p_lesson: { area: "PEDIATRIA", topic: "Sepse", title: `Sepse ${++n}`, published, review_note: "Conferido com a diretriz." } });
  return l.id as string;
}
const arquivo = (id: string, kind: string, tag: string, ext = kind === "flashcast" ? "mp3" : "pdf") => `lessons/${id}/${kind}-${tag.padEnd(16, "0")}.${ext}`;
const material = (uid: string, id: string, kind: string, tag: string, extra: Record<string, unknown> = {}) =>
  rpc(uid, "app_admin_lesson_material", { p_lesson_id: id, p_material: { kind, title: `${kind}-${tag}`, storage_path: arquivo(id, kind, tag), content_type: kind === "flashcast" ? "audio/mpeg" : "application/pdf", size_bytes: 9, ...extra } });
const idDe = (l: any, kind: string) => l.materials.find((m: any) => m.kind === kind).id as string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@t.dev'), ($2, 'ed@t.dev'), ($3, 'adm@t.dev'), ($4, 'rev@t.dev')`, [ANA, EDITOR, ADMIN, REVISORA]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [REVISORA]);
}, 300_000);

describe("A07: o caminho do arquivo entra na fila quando o material sai", () => {
  it("remover um material: o caminho do arquivo é devolvido para apagar; link externo não tem arquivo; o material some mesmo assim", async () => {
    const id = await novaAula();
    let l = await material(EDITOR, id, "slides", "aaaa");
    await rpc(EDITOR, "app_admin_lesson_material", { p_lesson_id: id, p_material: { kind: "guideline", title: "PCDT", url: "https://www.gov.br/saude/pcdt" } });
    const slides = idDe(l, "slides");
    l = await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: slides });
    expect(l.materials.some((m: any) => m.kind === "slides")).toBe(false);
    expect(await fila()).toEqual([arquivo(id, "slides", "aaaa")]);
    expect(await paths(EDITOR)).toEqual([arquivo(id, "slides", "aaaa")]);
    // o material do tipo link (sem arquivo) não entra na fila
    const link = (await rpc(EDITOR, "app_lesson", { p_id: id })).materials.find((m: any) => m.kind === "guideline");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: link.id });
    expect(await fila()).toEqual([arquivo(id, "slides", "aaaa")]);
    await limparFila();
  });

  it("trocar o PDF: o arquivo antigo vai para a fila; trocar por outro com o MESMO caminho não apaga nada", async () => {
    const id = await novaAula();
    await material(EDITOR, id, "slides", "1111");
    await material(EDITOR, id, "slides", "2222");
    expect(await fila()).toEqual([arquivo(id, "slides", "1111")]);
    await material(EDITOR, id, "slides", "2222"); // mesmo caminho de novo (envio repetido)
    expect(await fila()).toEqual([arquivo(id, "slides", "1111"), arquivo(id, "slides", "2222")]);
    expect(await paths(EDITOR)).toEqual([arquivo(id, "slides", "1111")]); // o 2222 está em uso: sai da fila sem apagar
    expect(await fila()).toEqual([arquivo(id, "slides", "1111")]);
    await limparFila();
  });

  it("liberar o áudio do editor: o áudio conferido que ele substitui vai para a fila; o pendente trocado também", async () => {
    const id = await novaAula();
    await material(ADMIN, id, "flashcast", "velho");
    await material(EDITOR, id, "flashcast", "pend1");
    await material(EDITOR, id, "flashcast", "pend2"); // troca só o pendente
    expect(await fila()).toEqual([arquivo(id, "flashcast", "pend1")]);
    const pend = (await rpc(EDITOR, "app_lesson", { p_id: id })).materials.find((m: any) => m.review_status === "pending");
    await rpc(ADMIN, "app_admin_release_lesson_audio", { p_id: pend.id });
    expect(await fila()).toEqual([arquivo(id, "flashcast", "pend1"), arquivo(id, "flashcast", "velho")]);
    await limparFila();
  });

  it("apagar a aula (administrador): todos os arquivos dela vão para a fila", async () => {
    const id = await novaAula();
    await material(EDITOR, id, "slides", "s000");
    await material(ADMIN, id, "flashcast", "f000");
    await material(EDITOR, id, "other", "o000");
    expect(await rpc(ADMIN, "app_admin_delete_lesson", { p_id: id })).toBe(true);
    expect(await fila()).toEqual([arquivo(id, "flashcast", "f000"), arquivo(id, "other", "o000"), arquivo(id, "slides", "s000")]);
    expect(await paths(EDITOR)).toEqual([arquivo(id, "flashcast", "f000"), arquivo(id, "other", "o000"), arquivo(id, "slides", "s000")]);
    await limparFila();
  });
});

describe("A07: só apaga o arquivo que ninguém mais usa", () => {
  it("dois materiais com o mesmo caminho: remover um não apaga; remover o segundo apaga", async () => {
    const id = await novaAula();
    await material(EDITOR, id, "other", "dupl"); // outro 1
    await material(EDITOR, id, "other", "dupl"); // outro 2, mesmo arquivo
    const outros = (await rpc(EDITOR, "app_lesson", { p_id: id })).materials.filter((m: any) => m.kind === "other");
    expect(outros.length).toBe(2);
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: outros[0].id });
    expect(await paths(EDITOR)).toEqual([]); // o outro material ainda usa o arquivo
    expect(await fila()).toEqual([]);
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: outros[1].id });
    expect(await paths(EDITOR)).toEqual([arquivo(id, "other", "dupl")]);
    await limparFila();
  });

  it("caminho referenciado de novo depois de removido (outro material, de qualquer aula): sai da fila sem apagar", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "other", "volta");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "other") });
    expect(await fila()).toEqual([arquivo(id, "other", "volta")]);
    await material(EDITOR, id, "other", "volta");
    expect(await paths(EDITOR)).toEqual([]);
    expect(await fila()).toEqual([]);
  });

  it("caminho com retenção de arquivo (ch_file_holds, Fonte complementar): não apaga e continua na fila até a retenção cair", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "slides", "hold");
    await db.query(`insert into public.ch_file_holds (storage_path) values ($1)`, [arquivo(id, "slides", "hold")]);
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "slides") });
    expect(await paths(EDITOR)).toEqual([]);
    expect(await fila()).toEqual([arquivo(id, "slides", "hold")]);
    await db.query(`delete from public.ch_file_holds`);
    expect(await paths(EDITOR)).toEqual([arquivo(id, "slides", "hold")]);
    await limparFila();
  });

  it("caminho usado por fonte de episódio de podcast também não é apagado", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "other", "pod0");
    const ep = (await db.query<any>(`insert into public.podcasts (title, area, status) values ('Episódio de teste', 'PEDIATRIA', 'draft') returning id`)).rows[0].id;
    await db.query(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'x.pdf', $2, 1)`, [ep, arquivo(id, "other", "pod0")]);
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "other") });
    expect(await paths(EDITOR)).toEqual([]);
    expect(await fila()).toEqual([]);
  });

  it("o Flashcast copiado de um podcast tem caminho próprio: remover o material da aula não mexe no áudio do episódio", async () => {
    const id = await novaAula();
    const ep = (await db.query<any>(`insert into public.podcasts (title, area, status, script, approved_at, audio_path, published_at) values ('Episódio de teste', 'PEDIATRIA', 'published', '{"lines":[]}'::jsonb, now(), 'podcasts/ep/final.mp3', now()) returning id`)).rows[0].id;
    const l = await material(ADMIN, id, "flashcast", "copia");
    await rpc(ADMIN, "app_admin_delete_lesson_material", { p_id: idDe(l, "flashcast") });
    expect(await paths(ADMIN)).toEqual([arquivo(id, "flashcast", "copia")]);
    expect((await db.query<any>(`select audio_path from public.podcasts where id = $1`, [ep])).rows[0].audio_path).toBe("podcasts/ep/final.mp3");
    await limparFila();
  });
});

describe("A07: confirmar, registrar e falhas", () => {
  it("confirmar o apagamento tira da fila e grava no Registro o caminho apagado (com a aula e quem apagou); sem confirmar, o caminho volta na próxima limpeza", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "slides", "log0");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "slides") });
    expect(await paths(EDITOR)).toEqual([arquivo(id, "slides", "log0")]);
    expect(await paths(EDITOR)).toEqual([arquivo(id, "slides", "log0")]); // o depósito falhou e ninguém confirmou: continua na fila
    expect(await rpc(EDITOR, "app_admin_lesson_files_done", { p_paths: [arquivo(id, "slides", "log0")] })).toBe(1);
    expect(await fila()).toEqual([]);
    const reg = (await db.query<any>(`select actor_id, target, details from public.admin_audit_log where action = 'lesson.file.delete' order by id desc limit 1`)).rows[0];
    expect(reg).toMatchObject({ actor_id: EDITOR, target: id, details: { path: arquivo(id, "slides", "log0"), kind: "slides" } });
    expect(await rpc(EDITOR, "app_admin_lesson_files_done", { p_paths: [arquivo(id, "slides", "log0")] })).toBe(0); // já confirmado: não registra de novo
    expect((await db.query<any>(`select count(*)::int n from public.admin_audit_log where action = 'lesson.file.delete' and target = $1`, [id])).rows[0].n).toBe(1);
  });

  it("confirmar não apaga caminho que não está na fila, que voltou a ser usado ou que tem retenção", async () => {
    const id = await novaAula();
    await material(EDITOR, id, "slides", "usa0");
    expect(await rpc(EDITOR, "app_admin_lesson_files_done", { p_paths: [arquivo(id, "slides", "usa0"), "lessons/qualquer/outro.pdf"] })).toBe(0);
    const l = await material(EDITOR, id, "other", "reu0");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "other") });
    await material(EDITOR, id, "other", "reu0"); // voltou a ser usado antes de confirmar
    expect(await rpc(EDITOR, "app_admin_lesson_files_done", { p_paths: [arquivo(id, "other", "reu0")] })).toBe(0);
    expect(await fila()).toEqual([arquivo(id, "other", "reu0")]); // fica para a próxima limpeza descartar
    await limparFila();
  });

  it("falha ao guardar na fila NÃO desfaz a remoção do material", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "slides", "falh");
    await db.exec(`alter table public.lesson_files_pending_delete rename to lesson_files_pending_delete_x`);
    try {
      const after = await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "slides") });
      expect(after.materials.some((m: any) => m.kind === "slides")).toBe(false);
    } finally {
      await db.exec(`alter table public.lesson_files_pending_delete_x rename to lesson_files_pending_delete`);
    }
  });
});

describe("A07: permissões", () => {
  it("visitante, aluno e revisora que não é da equipe não limpam nem confirmam; editor e administrador sim; a fila não é lida por ninguém direto", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "slides", "perm");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "slides") });
    await expect(rpc(null, "app_admin_lesson_files_purge")).rejects.toThrow();
    await expect(rpc(null, "app_admin_lesson_files_done", { p_paths: [arquivo(id, "slides", "perm")] })).rejects.toThrow();
    for (const uid of [ANA, REVISORA]) {
      await expect(rpc(uid, "app_admin_lesson_files_purge")).rejects.toThrow(/equipe/);
      await expect(rpc(uid, "app_admin_lesson_files_done", { p_paths: [arquivo(id, "slides", "perm")] })).rejects.toThrow(/equipe/);
    }
    for (const uid of [ANA, EDITOR, ADMIN, REVISORA]) await expect(asUser(uid, `select * from public.lesson_files_pending_delete`)).rejects.toThrow();
    expect(await fila()).toEqual([arquivo(id, "slides", "perm")]); // nada foi mexido pelos barrados
    expect(await paths(ADMIN)).toEqual([arquivo(id, "slides", "perm")]);
    expect(await rpc(ADMIN, "app_admin_lesson_files_done", { p_paths: [arquivo(id, "slides", "perm")] })).toBe(1);
    // as funções internas do gatilho não são chamáveis por ninguém de fora
    await expect(asUser(EDITOR, `select public.lesson_material_file_queue()`)).rejects.toThrow();
  });

  it("o aluno continua sem ler lesson_materials direto e sem ver caminho (nada mudou)", async () => {
    expect((await asUser(ANA, `select * from public.lesson_materials`)).rows).toEqual([]);
  });
});
