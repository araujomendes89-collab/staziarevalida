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
// funções de SERVIÇO (ch_worker_*): o servidor reserva (e recebe um CÓDIGO por caminho), renova antes de cada exclusão, confirma ou
// devolve com o código; a equipe não as chama direto
const servico = async <T = any>(fn: string, args: Record<string, unknown> = {}) => {
  const keys = Object.keys(args);
  const casts: Record<string, string> = { p_items: "::jsonb", p_actor: "::uuid", p_token: "::uuid" };
  return (await db.query<{ r: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}${casts[k] ?? ""}`).join(", ")}) r`, keys.map((k) => (k === "p_items" ? JSON.stringify(args[k]) : args[k])))).rows[0].r;
};
const codigos = new Map<string, string>(); // último código recebido por caminho
const NENHUM = "00000000-0000-4000-8000-0000000000ff";
const reservar = async (actor: string | null = EDITOR) => {
  const items = ((await servico("ch_worker_lesson_files_reserve", { p_actor: actor })).items as Array<{ path: string; token: string }>).slice().sort((a, b) => a.path.localeCompare(b.path));
  for (const i of items) codigos.set(i.path, i.token);
  return items;
};
const paths = async (actor: string | null = EDITOR) => (await reservar(actor)).map((i) => i.path);
const itens = (p: string[]) => p.map((path) => ({ path, token: codigos.get(path) ?? NENHUM }));
const renovar = (p: string, token: string | undefined = codigos.get(p)) => servico<boolean>("ch_worker_lesson_files_renew", { p_path: p, p_token: token ?? NENHUM });
const confirmar = (p: string[], actor: string | null = EDITOR) => servico<number>("ch_worker_lesson_files_done", { p_items: itens(p), p_actor: actor });
const devolver = (p: string[]) => servico<number>("ch_worker_lesson_files_release", { p_items: itens(p) });
const estado = async (p: string) => (await db.query<any>(`select state from public.lesson_files_pending_delete where storage_path = $1`, [p])).rows[0]?.state ?? null;

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
    expect(await estado(arquivo(id, "slides", "aaaa"))).toBe("deleting"); // reservado: só o que foi reservado é entregue
    await devolver([arquivo(id, "slides", "aaaa")]);
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
    expect(await fila()).toEqual([arquivo(id, "slides", "1111")]); // (reservado: 'apagando')
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
  it("confirmar o apagamento tira da fila e grava no Registro o caminho apagado (com a aula e quem pediu); não registra duas vezes", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "slides", "log0");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "slides") });
    expect(await paths(EDITOR)).toEqual([arquivo(id, "slides", "log0")]);
    expect(await confirmar([arquivo(id, "slides", "log0")])).toBe(1);
    expect(await fila()).toEqual([]);
    const reg = (await db.query<any>(`select actor_id, target, details from public.admin_audit_log where action = 'lesson.file.delete' order by id desc limit 1`)).rows[0];
    expect(reg).toMatchObject({ actor_id: EDITOR, target: id, details: { path: arquivo(id, "slides", "log0"), kind: "slides" } });
    expect(await confirmar([arquivo(id, "slides", "log0")])).toBe(0); // já confirmado: não registra de novo
    expect((await db.query<any>(`select count(*)::int n from public.admin_audit_log where action = 'lesson.file.delete' and target = $1`, [id])).rows[0].n).toBe(1);
  });

  it("achado 4: confirmar SÓ vale para o que foi reservado (nada de 'apagado' sem reserva), nem que o caminho esteja na fila", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "slides", "falso");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "slides") });
    expect(await fila()).toEqual([arquivo(id, "slides", "falso")]); // na fila, mas NÃO reservado
    expect(await confirmar([arquivo(id, "slides", "falso"), "lessons/qualquer/outro.pdf"])).toBe(0);
    expect(await fila()).toEqual([arquivo(id, "slides", "falso")]); // continua para a próxima limpeza
    expect((await db.query<any>(`select count(*)::int n from public.admin_audit_log where action = 'lesson.file.delete' and target = $1`, [id])).rows[0].n).toBe(0);
    await limparFila();
  });

  it("devolver a reserva (o depósito falhou): o caminho volta a 'pendente' e sai de novo na próxima limpeza; confirmar sem reserva não vale", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "slides", "devo");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "slides") });
    expect(await paths(EDITOR)).toEqual([arquivo(id, "slides", "devo")]);
    expect(await paths(EDITOR)).toEqual([]); // já reservado: não entrega duas vezes
    expect(await devolver([arquivo(id, "slides", "devo")])).toBe(1);
    expect(await estado(arquivo(id, "slides", "devo"))).toBe("pending");
    expect(await confirmar([arquivo(id, "slides", "devo")])).toBe(0);
    expect(await paths(EDITOR)).toEqual([arquivo(id, "slides", "devo")]);
    await limparFila();
  });

  it("achado 5: o servidor caiu antes de confirmar: a reserva vence em 10 minutos, a próxima limpeza entrega de novo e a confirmação registra", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "slides", "venc");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "slides") });
    expect(await paths(EDITOR)).toEqual([arquivo(id, "slides", "venc")]);
    expect(await paths(EDITOR)).toEqual([]); // reserva recente: ninguém repete
    await db.query(`update public.lesson_files_pending_delete set reserved_at = now() - interval '11 minutes'`);
    expect(await paths(ADMIN)).toEqual([arquivo(id, "slides", "venc")]); // vencida: volta
    expect(await confirmar([arquivo(id, "slides", "venc")], ADMIN)).toBe(1);
    const reg = (await db.query<any>(`select actor_id from public.admin_audit_log where action = 'lesson.file.delete' and target = $1`, [id])).rows;
    expect(reg).toEqual([{ actor_id: ADMIN }]);
    expect(await fila()).toEqual([]);
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

describe("A07 (achado 2): a corrida entre conferir e apagar está fechada", () => {
  it("caminho reservado para apagar NÃO aceita novo material de aula (a criação é recusada em português e nada fica pendurado)", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "other", "corr");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "other") });
    expect(await paths(EDITOR)).toEqual([arquivo(id, "other", "corr")]); // reservado; o servidor ainda não apagou
    await expect(material(EDITOR, id, "other", "corr")).rejects.toThrow(/sendo apagado do depósito/);
    expect((await rpc(EDITOR, "app_lesson", { p_id: id })).materials.some((m: any) => m.kind === "other")).toBe(false);
    expect(await confirmar([arquivo(id, "other", "corr")])).toBe(1); // o servidor apagou: confirmado
    await material(EDITOR, id, "other", "corr"); // agora o caminho pode ser usado de novo (arquivo novo)
    expect((await rpc(EDITOR, "app_lesson", { p_id: id })).materials.some((m: any) => m.kind === "other")).toBe(true);
  });

  it("trocar o caminho de um material existente para um caminho reservado também é recusado", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "other", "rsv0");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "other") });
    expect(await paths(EDITOR)).toEqual([arquivo(id, "other", "rsv0")]);
    await material(EDITOR, id, "slides", "orig");
    const slides = (await rpc(EDITOR, "app_lesson", { p_id: id })).materials.find((m: any) => m.kind === "slides");
    await expect(db.query(`update public.lesson_materials set storage_path = $1 where id = $2`, [arquivo(id, "other", "rsv0"), slides.id])).rejects.toThrow(/sendo apagado/);
    await confirmar([arquivo(id, "other", "rsv0")]);
  });

  it("fonte de podcast e retenção de arquivo (ch_file_holds) com caminho reservado também são recusadas", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "other", "pod1");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "other") });
    expect(await paths(EDITOR)).toEqual([arquivo(id, "other", "pod1")]);
    const ep = (await db.query<any>(`insert into public.podcasts (title, area, status) values ('Episódio', 'PEDIATRIA', 'draft') returning id`)).rows[0].id;
    await expect(db.query(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'x.pdf', $2, 1)`, [ep, arquivo(id, "other", "pod1")])).rejects.toThrow(/sendo apagado/);
    await expect(servico("ch_worker_file_hold", { p_path: arquivo(id, "other", "pod1") })).rejects.toThrow(/sendo apagado/);
    await confirmar([arquivo(id, "other", "pod1")]);
    await servico("ch_worker_file_hold", { p_path: arquivo(id, "other", "pod1") }); // depois de apagado, vale de novo
    await db.query(`delete from public.ch_file_holds where storage_path = $1`, [arquivo(id, "other", "pod1")]);
  });

  it("a outra ordem: referência criada ANTES da reserva é vista por ela (sai da fila sem apagar); reserva vencida não bloqueia", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "other", "ord0");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "other") });
    await material(EDITOR, id, "other", "ord0"); // alguém reaproveita o caminho antes da limpeza
    expect(await paths(EDITOR)).toEqual([]);
    expect(await fila()).toEqual([]);
    // reserva vencida (servidor caiu): não bloqueia quem quer usar o caminho
    const k = await novaAula();
    const m = await material(EDITOR, k, "other", "ven1");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(m, "other") });
    await paths(EDITOR);
    await db.query(`update public.lesson_files_pending_delete set reserved_at = now() - interval '11 minutes'`);
    await material(EDITOR, k, "other", "ven1");
    expect(await paths(EDITOR)).toEqual([]); // em uso de novo: sai da fila
    expect(await fila()).toEqual([]);
  });
});

describe("A07 (achado 6): retenções antigas não prendem a fila", () => {
  it("duzentas retenções no começo da fila não impedem entregar os arquivos livres que vieram depois; em lotes de 50", async () => {
    await limparFila();
    await db.query(`insert into public.lesson_files_pending_delete (storage_path, queued_at) select 'lessons/lote/ret' || lpad(g::text, 4, '0'), now() - interval '2 days' + g * interval '1 second' from generate_series(1, 200) g`);
    await db.query(`insert into public.ch_file_holds (storage_path) select 'lessons/lote/ret' || lpad(g::text, 4, '0') from generate_series(1, 200) g`);
    await db.query(`insert into public.lesson_files_pending_delete (storage_path) select 'lessons/lote/livre' || lpad(g::text, 4, '0') from generate_series(1, 120) g`);
    const a = await paths(EDITOR);
    expect(a.length).toBe(50);
    expect(a.every((p) => p.startsWith("lessons/lote/livre"))).toBe(true);
    expect((await paths(EDITOR)).length).toBe(50);
    expect((await paths(EDITOR)).length).toBe(20);
    expect(await paths(EDITOR)).toEqual([]);
    // os retidos continuam na fila (não foram apagados nem reservados)
    expect((await db.query<any>(`select count(*)::int n from public.lesson_files_pending_delete where state = 'pending'`)).rows[0].n).toBe(200);
    await db.query(`delete from public.ch_file_holds`);
    await limparFila();
  });
});

describe("A07 (2a rodada): a reserva tem código e prazo renovado antes de cada exclusão", () => {
  const preparar = async (tag: string) => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "slides", tag);
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "slides") });
    return arquivo(id, "slides", tag);
  };

  it("cada reserva devolve um código próprio (uuid) por caminho; reservar de novo uma reserva vencida troca o código", async () => {
    const k = await preparar("tok0");
    const [a] = await reservar();
    expect(a.path).toBe(k);
    expect(a.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    await db.query(`update public.lesson_files_pending_delete set reserved_at = now() - interval '11 minutes'`);
    const [b] = await reservar();
    expect(b.path).toBe(k);
    expect(b.token).not.toBe(a.token);
    await limparFila();
  });

  it("confirmar e devolver exigem o código vigente: código errado, de outro caminho ou de reserva antiga não age e não registra", async () => {
    const k = await preparar("tok1");
    const [a] = await reservar();
    expect(await servico("ch_worker_lesson_files_done", { p_items: [{ path: k, token: NENHUM }], p_actor: EDITOR })).toBe(0);
    expect(await servico("ch_worker_lesson_files_release", { p_items: [{ path: k, token: NENHUM }] })).toBe(0);
    expect(await servico("ch_worker_lesson_files_done", { p_items: [{ path: k }, { token: a.token }, { path: k, token: "lixo" }, "x"], p_actor: EDITOR })).toBe(0);
    expect(await servico("ch_worker_lesson_files_done", { p_items: { path: k, token: a.token }, p_actor: EDITOR })).toBe(0); // não é lista
    expect(await estado(k)).toBe("deleting");
    expect((await db.query<any>(`select count(*)::int n from public.admin_audit_log where action = 'lesson.file.delete' and details->>'path' = $1`, [k])).rows[0].n).toBe(0);
    expect(await servico("ch_worker_lesson_files_done", { p_items: [{ path: k, token: a.token }], p_actor: EDITOR })).toBe(1);
    await limparFila();
  });

  it("limpeza ANTIGA (reserva vencida e refeita por outra): sua renovação, confirmação e devolução não valem sobre a reserva NOVA; a nova registra", async () => {
    const k = await preparar("tok2");
    const [velha] = await reservar(EDITOR);
    await db.query(`update public.lesson_files_pending_delete set reserved_at = now() - interval '11 minutes'`);
    const [nova] = await reservar(ADMIN);
    expect(nova.token).not.toBe(velha.token);
    expect(await renovar(k, velha.token)).toBe(false); // a velha não pode mais apagar
    expect(await servico("ch_worker_lesson_files_done", { p_items: [{ path: k, token: velha.token }], p_actor: EDITOR })).toBe(0);
    expect(await servico("ch_worker_lesson_files_release", { p_items: [{ path: k, token: velha.token }] })).toBe(0);
    expect(await estado(k)).toBe("deleting"); // a reserva nova continua intacta
    expect((await db.query<any>(`select count(*)::int n from public.admin_audit_log where action = 'lesson.file.delete' and details->>'path' = $1`, [k])).rows[0].n).toBe(0);
    expect(await renovar(k, nova.token)).toBe(true);
    expect(await servico("ch_worker_lesson_files_done", { p_items: [{ path: k, token: nova.token }], p_actor: ADMIN })).toBe(1);
    const reg = (await db.query<any>(`select actor_id from public.admin_audit_log where action = 'lesson.file.delete' and details->>'path' = $1`, [k])).rows;
    expect(reg).toEqual([{ actor_id: ADMIN }]);
    expect(await fila()).toEqual([]);
  });

  it("renovar: com o código vigente e dentro do prazo vale e recomeça o prazo de 10 minutos", async () => {
    const k = await preparar("ren0");
    await reservar();
    await db.query(`update public.lesson_files_pending_delete set reserved_at = now() - interval '9 minutes'`);
    expect(await renovar(k)).toBe(true);
    const r = (await db.query<any>(`select reserved_at > now() - interval '1 minute' as novo from public.lesson_files_pending_delete where storage_path = $1`, [k])).rows[0];
    expect(r.novo).toBe(true);
    await limparFila();
  });

  it("reserva VENCIDA nunca permite apagar: renovar com o código certo, depois do prazo, responde não (e outra limpeza pode retomar)", async () => {
    const k = await preparar("ren1");
    await reservar();
    await db.query(`update public.lesson_files_pending_delete set reserved_at = now() - interval '11 minutes'`);
    expect(await renovar(k)).toBe(false);
    expect(await estado(k)).toBe("deleting"); // nada mudou; a próxima reserva retoma
    expect(await paths(ADMIN)).toEqual([k]);
    await limparFila();
  });

  it("renovar sem reserva (caminho pendente), caminho inexistente, código nulo ou de outro caminho: não", async () => {
    const k = await preparar("ren2");
    expect(await renovar(k, NENHUM)).toBe(false); // ainda 'pendente'
    expect(await servico("ch_worker_lesson_files_renew", { p_path: "lessons/nada/x.pdf", p_token: NENHUM })).toBe(false);
    expect(await servico("ch_worker_lesson_files_renew", { p_path: k, p_token: null })).toBe(false);
    const [a] = await reservar();
    expect(await renovar(k, NENHUM)).toBe(false);
    expect(await renovar(k, a.token)).toBe(true);
    await limparFila();
  });

  it("o arquivo voltou a ser usado depois da reserva (reserva vencida deixou a criação passar): renovar responde não e o arquivo sai da fila sem apagar", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "other", "ren3");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "other") });
    const k = arquivo(id, "other", "ren3");
    const [a] = await reservar();
    await db.query(`update public.lesson_files_pending_delete set reserved_at = now() - interval '11 minutes'`);
    await material(EDITOR, id, "other", "ren3"); // vencida: não bloqueia o novo uso
    expect(await renovar(k, a.token)).toBe(false);
    expect(await fila()).toEqual([]);
    expect(await confirmar([k])).toBe(0);
  });

  it("retenção de arquivo criada com a reserva já vencida: renovar responde não e o caminho volta a 'pendente' (sem apagar)", async () => {
    const k = await preparar("ren4");
    const [a] = await reservar();
    await db.query(`update public.lesson_files_pending_delete set reserved_at = now() - interval '11 minutes'`);
    await db.query(`insert into public.ch_file_holds (storage_path) values ($1)`, [k]);
    expect(await renovar(k, a.token)).toBe(false);
    expect(await estado(k)).toBe("pending");
    expect(await paths(EDITOR)).toEqual([]); // retido: não é entregue
    await db.query(`delete from public.ch_file_holds`);
    await limparFila();
  });

  it("durante uma reserva vigente e renovada, criar referência continua recusado (até o prazo renovado)", async () => {
    const k = await preparar("ren5");
    const id = k.split("/")[1];
    await reservar();
    await db.query(`update public.lesson_files_pending_delete set reserved_at = now() - interval '9 minutes'`);
    await renovar(k);
    await db.query(`update public.lesson_files_pending_delete set reserved_at = now() - interval '9 minutes'`); // ainda dentro do novo prazo
    await expect(material(EDITOR, id, "slides", "ren5")).rejects.toThrow(/sendo apagado do depósito/);
    await limparFila();
  });
});

describe("A07 (3a rodada): prazo pela hora REAL (clock_timestamp), ordem de travas e registro por função própria", () => {
  const preparar = async (tag: string) => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "slides", tag);
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "slides") });
    return { id, k: arquivo(id, "slides", tag) };
  };
  // Numa MESMA transação now() fica parado no início; clock_timestamp() anda. Simula a espera longa por trava antes de renovar.
  const naMesmaTransacao = async <T,>(fn: (q: (sql: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
    db.transaction(async (tx) => fn(async (sql, p = []) => (await tx.query<any>(sql, p)).rows));

  it("renovar depois de uma espera que ESTOURA o prazo responde não (com now() do início da transação responderia sim)", async () => {
    const { k } = await preparar("clk0");
    const [a] = await reservar();
    await naMesmaTransacao(async (q) => {
      await q(`select now()`); // fixa o início da transação
      await q(`update public.lesson_files_pending_delete set reserved_at = clock_timestamp() - interval '599.5 seconds'`); // faltam 0,5 s
      await q(`select pg_sleep(1)`); // a espera pelo trava passou do prazo
      const r = await q(`select public.ch_worker_lesson_files_renew($1, $2::uuid) r`, [k, a.token]);
      expect(r[0].r).toBe(false);
    });
    await limparFila();
  });

  it("renovar grava o novo prazo com a hora REAL (depois da espera), não com o início da transação", async () => {
    const { k } = await preparar("clk1");
    const [a] = await reservar();
    await naMesmaTransacao(async (q) => {
      await q(`select now()`);
      await q(`select pg_sleep(1)`);
      expect((await q(`select public.ch_worker_lesson_files_renew($1, $2::uuid) r`, [k, a.token]))[0].r).toBe(true);
      const g = await q(`select reserved_at >= now() + interval '0.5 seconds' as real from public.lesson_files_pending_delete where storage_path = $1`, [k]);
      expect(g[0].real).toBe(true);
    });
    await limparFila();
  });

  it("reservar: a reserva que estourou o prazo durante a espera é retomada (código novo) e a nova reserva é gravada com a hora real", async () => {
    const { k } = await preparar("clk2");
    const [a] = await reservar();
    await naMesmaTransacao(async (q) => {
      await q(`select now()`);
      await q(`update public.lesson_files_pending_delete set reserved_at = clock_timestamp() - interval '599.5 seconds'`);
      await q(`select pg_sleep(1)`);
      const r = (await q(`select public.ch_worker_lesson_files_reserve($1::uuid) r`, [EDITOR]))[0].r;
      expect(r.items.map((i: any) => i.path)).toEqual([k]);
      expect(r.items[0].token).not.toBe(a.token);
      const g = await q(`select reserved_at >= now() + interval '0.5 seconds' as real from public.lesson_files_pending_delete where storage_path = $1`, [k]);
      expect(g[0].real).toBe(true);
    });
    await limparFila();
  });

  it("o gatilho que protege o caminho também usa a hora real: reserva que estourou o prazo durante a espera não bloqueia mais", async () => {
    const { id, k } = await preparar("clk3");
    await reservar();
    await naMesmaTransacao(async (q) => {
      await q(`select now()`);
      await q(`update public.lesson_files_pending_delete set reserved_at = clock_timestamp() - interval '599.5 seconds'`);
      await q(`select pg_sleep(1)`);
      await q(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ($1, 'other', 'volta', $2)`, [id, k]); // não deve recusar
    });
    await db.query(`delete from public.lesson_materials where storage_path = $1`, [k]);
    await limparFila();
  });

  it("ordem de travas: reserva e renovação pegam o trava do CAMINHO antes da linha da fila (leitura do corpo das funções; o impasse real exige duas conexões)", async () => {
    const corpo = async (f: string) => (await db.query<any>(`select pg_get_functiondef(p.oid) d from pg_proc p where p.proname = $1`, [f])).rows[0].d as string;
    const renew = await corpo("ch_worker_lesson_files_renew");
    const reserve = await corpo("ch_worker_lesson_files_reserve");
    expect(renew.indexOf("pg_advisory_xact_lock")).toBeGreaterThan(-1);
    const primeiraLinhaRenew = renew.search(/(update|delete from) public\.lesson_files_pending_delete/);
    expect(renew.indexOf("pg_advisory_xact_lock")).toBeLessThan(primeiraLinhaRenew);
    // na reserva, a linha só é travada (for update) DEPOIS do trava do caminho, e sem pegar a linha antes na consulta dos candidatos
    const lock = reserve.indexOf("pg_advisory_xact_lock");
    const forUpdates = [...reserve.matchAll(/for update/g)].map((m) => m.index!);
    expect(forUpdates.length).toBe(1);
    expect(lock).toBeGreaterThan(-1);
    expect(forUpdates[0]).toBeGreaterThan(lock);
    expect(reserve).not.toMatch(/now\(\)/);
    expect(renew).not.toMatch(/now\(\)/);
  });

  it("reservas simultâneas (duas chamadas em sequência) não entregam o mesmo caminho duas vezes", async () => {
    await preparar("ord0");
    const a = await reservar();
    const b = await reservar();
    expect(a.length).toBe(1);
    expect(b).toEqual([]);
    await limparFila();
  });

  it("ch_worker_lesson_files_audit: anota o apagamento no Registro (aula e tipo vêm da fila) SEM tocar na reserva nova", async () => {
    const { id, k } = await preparar("aud0");
    const [velha] = await reservar(EDITOR);
    await db.query(`update public.lesson_files_pending_delete set reserved_at = now() - interval '11 minutes'`);
    const [nova] = await reservar(ADMIN);
    expect(await servico("ch_worker_lesson_files_done", { p_items: [{ path: k, token: velha.token }], p_actor: EDITOR })).toBe(0); // recusado
    const antes = (await db.query<any>(`select state, reserve_token, reserved_at from public.lesson_files_pending_delete where storage_path = $1`, [k])).rows[0];
    expect(await servico("ch_worker_lesson_files_audit", { p_items: [{ path: k }, { path: "" }, {}], p_actor: EDITOR })).toBe(1);
    const depois = (await db.query<any>(`select state, reserve_token, reserved_at from public.lesson_files_pending_delete where storage_path = $1`, [k])).rows[0];
    expect(depois).toEqual(antes); // a reserva nova não foi tocada
    expect(depois.reserve_token).toBe(nova.token);
    const reg = (await db.query<any>(`select actor_id, target, details from public.admin_audit_log where action = 'lesson.file.delete' and details->>'path' = $1`, [k])).rows;
    expect(reg).toHaveLength(1);
    expect(reg[0]).toMatchObject({ actor_id: EDITOR, target: id, details: { path: k, kind: "slides" } });
    expect(await servico("ch_worker_lesson_files_audit", { p_items: { path: k } })).toBe(0); // não é lista
    await limparFila();
  });
});

describe("A07 (2a rodada): a 9710 exige a 9620 (retenção de arquivos)", () => {
  it("sem a tabela ch_file_holds a migração PARA com aviso em português (não pula em silêncio) e não deixa nada pela metade; com ela, cola de novo sem erro", async () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS, "20261003009710_aulas_apagar_arquivo.sql"), "utf8");
    const holds = (await db.query<any>(`select count(*)::int n from public.ch_file_holds`)).rows[0].n;
    expect(holds).toBe(0);
    await db.exec(`alter table public.ch_file_holds rename to ch_file_holds_x`);
    try {
      await expect(db.exec(sql)).rejects.toThrow(/Cole antes a migração 9620 \(fonte complementar\)/);
    } finally {
      await db.exec(`alter table public.ch_file_holds_x rename to ch_file_holds`);
    }
    await db.exec(sql); // colar de novo (com a 9620) funciona
    await db.exec(sql); // e mais uma vez
    expect((await db.query<any>(`select count(*)::int n from pg_trigger where tgname = 'ch_file_holds_file_reference_guard' and not tgisinternal`)).rows[0].n).toBe(1);
  });
});

describe("A07: permissões", () => {
  it("achado 4: ninguém de fora do serviço (visitante, aluno, revisora, editor, administrador) chama reservar, confirmar ou devolver; a fila não é lida direto", async () => {
    const id = await novaAula();
    const l = await material(EDITOR, id, "slides", "perm");
    await rpc(EDITOR, "app_admin_delete_lesson_material", { p_id: idDe(l, "slides") });
    for (const uid of [null, ANA, REVISORA, EDITOR, ADMIN]) {
      const chamar = (sql: string) => (uid ? asUser(uid, sql) : db.transaction(async (tx) => { await tx.exec("set local role anon"); return tx.query<any>(sql); }));
      await expect(chamar(`select public.ch_worker_lesson_files_reserve('${EDITOR}'::uuid)`)).rejects.toThrow(/permission denied/i);
      await expect(chamar(`select public.ch_worker_lesson_files_renew('${arquivo(id, "slides", "perm")}', '${NENHUM}'::uuid)`)).rejects.toThrow(/permission denied/i);
      await expect(chamar(`select public.ch_worker_lesson_files_done('[{"path":"${arquivo(id, "slides", "perm")}","token":"${NENHUM}"}]'::jsonb)`)).rejects.toThrow(/permission denied/i);
      await expect(chamar(`select public.ch_worker_lesson_files_audit('[{"path":"${arquivo(id, "slides", "perm")}"}]'::jsonb)`)).rejects.toThrow(/permission denied/i);
      await expect(chamar(`select public.ch_worker_lesson_files_release('[{"path":"${arquivo(id, "slides", "perm")}","token":"${NENHUM}"}]'::jsonb)`)).rejects.toThrow(/permission denied/i);
    }
    // só o serviço (service_role) executa as cinco funções
    for (const f of ["ch_worker_lesson_files_reserve(uuid)", "ch_worker_lesson_files_renew(text, uuid)", "ch_worker_lesson_files_done(jsonb, uuid)", "ch_worker_lesson_files_release(jsonb)", "ch_worker_lesson_files_audit(jsonb, uuid)"]) {
      const acl = (await db.query<any>(`select has_function_privilege('service_role', 'public.${f}', 'execute') s, has_function_privilege('authenticated', 'public.${f}', 'execute') a, has_function_privilege('anon', 'public.${f}', 'execute') n, has_function_privilege('public', 'public.${f}', 'execute') p`)).rows[0];
      expect(acl).toEqual({ s: true, a: false, n: false, p: false });
    }
    // (as versões da 1a rodada, sem código de reserva, não existem mais)
    expect((await db.query<any>(`select count(*)::int n from pg_proc where proname like 'ch_worker_lesson_files_%'`)).rows[0].n).toBe(5);
    // as versões antigas (que a equipe chamava direto) não existem mais
    await expect(rpc(ADMIN, "app_admin_lesson_files_purge")).rejects.toThrow();
    await expect(rpc(ADMIN, "app_admin_lesson_files_done", { p_paths: [arquivo(id, "slides", "perm")] })).rejects.toThrow();
    for (const uid of [ANA, EDITOR, ADMIN, REVISORA]) await expect(asUser(uid, `select * from public.lesson_files_pending_delete`)).rejects.toThrow();
    expect(await fila()).toEqual([arquivo(id, "slides", "perm")]); // nada foi mexido pelos barrados
    expect(await paths(ADMIN)).toEqual([arquivo(id, "slides", "perm")]);
    expect(await confirmar([arquivo(id, "slides", "perm")], ADMIN)).toBe(1);
    // as funções internas dos gatilhos não são chamáveis por ninguém de fora
    await expect(asUser(EDITOR, `select public.lesson_material_file_queue()`)).rejects.toThrow();
    await expect(asUser(EDITOR, `select public.lesson_file_reference_guard()`)).rejects.toThrow();
  });

  it("o aluno continua sem ler lesson_materials direto e sem ver caminho (nada mudou)", async () => {
    expect((await asUser(ANA, `select * from public.lesson_materials`)).rows).toEqual([]);
  });
});
