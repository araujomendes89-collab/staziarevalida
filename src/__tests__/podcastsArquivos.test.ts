// @vitest-environment node
/**
 * Podcasts, P08 (supabase/migrations/…9721_podcasts_arquivos_esquecidos.sql + server/podcasts/router.ts): arquivos antigos do
 * depósito saem POR EVENTO (roteiro editado, roteiro novo, áudio refeito, fonte tirada, episódio apagado), só se nenhuma linha do
 * banco os usa (outro episódio, material de aula, retenção de arquivo), sem varredura de arquivos que já existiam, sem desfazer a
 * operação principal quando apagar falha, e com o que foi apagado no Registro. A rotina de leitura da lista de esquecidos também.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, localStorageDir, type ContentDb, type Storage } from "../../server/contentHub/infra";
import { createPodcastsRouter, type PodcastsDeps } from "../../server/podcasts/router";
import { auditSummary } from "../novo/app/admin/auditLog.js";

vi.setConfig({ testTimeout: 60_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "podcasts-arquivos-"));
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
let dev: DevDatabase;
let db: ContentDb;
const servers: Server[] = [];
let base: string;
let flaky: string; // depósito que falha ao apagar quando `falhaAoApagar` está ligado
let spy: string; // depósito que chama `aoApagar` (simula outra operação acontecendo no meio da exclusão)
let semSql: string; // servidor novo diante de um banco SEM a migração 9721
let aoApagar: ((keys: string[]) => Promise<void>) | null = null;
let admin: string, editor: string, student: string;
let falhaAoApagar = false;

const files = localStorageDir(path.join(tmp, "podcasts"));
const flakyFiles: Storage = { ...files, remove: async (keys) => (falhaAoApagar ? Promise.reject(new Error("depósito fora do ar")) : files.remove!(keys)) };
const spyFiles: Storage = { ...files, remove: async (keys) => { await aoApagar?.(keys); return files.remove!(keys); } };
const lessonFiles = localStorageDir(path.join(tmp, "lessons"));

const mockScript = (req: { input: string }) => {
  const ids = [...req.input.matchAll(/\[T(\d+)\]/g)].map((m) => Number(m[1]));
  return {
    title_suggestion: "Pré-eclâmpsia",
    lines: [
      { speaker: "ANA", text: "Hoje a conversa é sobre pré-eclâmpsia, só com o material da equipe.", style: "acolhedora", sources: [] },
      { speaker: "BRUNO", text: "Boa! O que define o quadro?", style: "curioso", sources: [] },
      { speaker: "ANA", text: "Hipertensão depois de 20 semanas com proteinúria, como está no material.", style: "didática", sources: [ids[0]] },
      { speaker: "BRUNO", text: "Anotado, obrigado!", style: "animado", sources: [] },
    ],
    missing: [],
  };
};

const sqlAs = (uid: string, q: string, p: unknown[] = []) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(q, p)).rows;
  });
const rpc = async (uid: string, fn: string, args: Record<string, unknown> = {}) => {
  const keys = Object.keys(args);
  return (await sqlAs(uid, `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, keys.map((k) => args[k])))[0].r;
};
const sql = async (q: string, p: unknown[] = []) => (await dev.db.query<any>(q, p)).rows;
const listen = (deps: PodcastsDeps) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use(express.json({ limit: "50mb" }));
    app.use("/api/podcasts", createPodcastsRouter(deps));
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/podcasts`));
    servers.push(srv);
  });
const call = async (url: string, token: string, init: RequestInit = {}) => {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, body: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const post = (url: string, token: string, body: unknown = {}) => call(url, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const del = (url: string, token: string) => call(url, token, { method: "DELETE" });

const TEXTO = "Na prova, a pegadinha é tratar a pressão sem pensar no sulfato de magnésio para prevenir convulsão. Hipertensão após 20 semanas com proteinúria define o quadro. ";

/** Episódio pronto até o áudio: fonte de texto, roteiro, aprovação do administrador e áudio simulado. Devolve o caminho do áudio. */
async function episodioComAudio(url = base) {
  const ep = await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: `Episódio ${Math.random().toString(36).slice(2, 7)}`, topic: "Pré-eclâmpsia", area: "GINECOLOGIA_OBSTETRICIA", target_minutes: 5 } });
  const id = ep.id as string;
  expect((await post(`${url}/${id}/sources/text`, editor, { title: "Anotações", text: TEXTO.repeat(2) })).status).toBe(201);
  expect((await post(`${url}/${id}/script`, editor, { provider: "mock" })).status).toBe(200);
  await rpc(ADMIN, "app_admin_podcast_approve", { p_id: id, p_note: "Conferi o roteiro com a fonte." });
  const audio = await refazAudio(id, url);
  return { id, audio };
}
async function refazAudio(id: string, url = base) {
  const start = await post(`${url}/${id}/audio/start`, editor, { provider: "mock" });
  expect(start.status).toBe(200);
  for (let i = 0; i < start.body.parts; i++) expect((await post(`${url}/${id}/audio/part`, editor, { job: start.body.job, index: i })).status).toBe(200);
  const fin = await post(`${url}/${id}/audio/finish`, editor, { job: start.body.job });
  expect(fin.status).toBe(200);
  return fin.body.audio_path as string;
}
const registro = (id: string) => sql(`select actor_id, details from public.admin_audit_log where action = 'podcast.files.cleanup' and target = $1 order by id`, [id]);
const fila = (id: string) => sql(`select storage_path, reason, status, attempts, last_error from public.podcast_files_released where podcast_id = $1 order by id`, [id]);

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'ed@t.dev'), ($3, 'al@t.dev')`, [ADMIN, EDITOR, STUDENT]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  base = await listen({ db, storage: files, lessons: lessonFiles, mockScript });
  flaky = await listen({ db, storage: flakyFiles, lessons: lessonFiles, mockScript });
  spy = await listen({ db, storage: spyFiles, lessons: lessonFiles, mockScript });
  // banco antigo: as funções da 9721 não existem (mensagem no formato do PostgREST do Supabase)
  const bancoAntigo: ContentDb = { ...db, service: async (fn, args) => (fn.startsWith("ch_worker_podcast_files_") ? Promise.reject(new Error(`Could not find the function public.${fn}(p_podcast, p_user) in the schema cache`)) : db.service(fn, args)) };
  semSql = await listen({ db: bancoAntigo, storage: files, lessons: lessonFiles, mockScript });
  admin = await dev.createSession(ADMIN);
  editor = await dev.createSession(EDITOR);
  student = await dev.createSession(STUDENT);
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("P08: o áudio que deixou de valer é apagado no evento", () => {
  it("editar o roteiro: o áudio some do episódio na hora, o arquivo sai quando a tela avisa o servidor, e o Registro diz o que saiu", async () => {
    const { id, audio } = await episodioComAudio();
    expect(await files.exists(audio)).toBe(true);
    const lines = (await rpc(EDITOR, "app_admin_podcast", { p_id: id })).script.lines;
    const edited = await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: id, p_script: { lines, missing: [] } });
    expect(edited).toMatchObject({ status: "script_ready", audio_path: null });
    expect((await fila(id))[0]).toMatchObject({ storage_path: audio, reason: "audio_invalidado", status: "pendente" });
    expect(await files.exists(audio)).toBe(true); // a edição é no banco: o arquivo espera o aviso do servidor
    expect((await post(`${base}/${id}/files/cleanup`, editor)).status).toBe(200);
    expect(await files.exists(audio)).toBe(false);
    expect((await fila(id))[0]).toMatchObject({ status: "apagado", attempts: 0 });
    const log = await registro(id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor_id: EDITOR, details: { audios: 1, fontes: 0, falhas: 0, arquivos: [path.basename(audio)] } });
    // aparece no Registro da Administração, em português
    const linhas = await rpc(ADMIN, "app_admin_audit", { p_limit: 20 });
    const entrada = linhas.find((l: any) => l.action === "podcast.files.cleanup" && l.target === id);
    expect(entrada).toBeTruthy();
    expect(auditSummary(entrada)).toBe(`${entrada.title} · 1 áudio antigo apagado · Arquivos: ${path.basename(audio)}`);
    // chamar de novo não apaga nem registra nada a mais
    expect((await post(`${base}/${id}/files/cleanup`, editor)).status).toBe(200);
    expect(await registro(id)).toHaveLength(1);
  });

  it("gerar outro roteiro (evento do servidor) apaga o áudio anterior sem esperar", async () => {
    const { id, audio } = await episodioComAudio();
    expect((await post(`${base}/${id}/script`, editor, { provider: "mock" })).status).toBe(200);
    expect(await files.exists(audio)).toBe(false);
    expect((await registro(id))[0].details).toMatchObject({ audios: 1, arquivos: [path.basename(audio)] });
  });

  it("refazer o áudio apaga o anterior e registra; o novo fica", async () => {
    const { id, audio } = await episodioComAudio();
    const novo = await refazAudio(id);
    expect(novo).not.toBe(audio);
    expect(await files.exists(audio)).toBe(false);
    expect(await files.exists(novo)).toBe(true);
    expect((await fila(id)).map((r) => [r.storage_path, r.reason, r.status])).toEqual([[audio, "audio_refeito", "apagado"]]);
    expect(await registro(id)).toHaveLength(1);
  });

  it("apagar o episódio apaga o áudio e o arquivo das fontes; só o administrador apaga", async () => {
    const { id, audio } = await episodioComAudio();
    const arq = `podcasts/${id}/src-aaaaaaaaaaaaaaaa.pdf`;
    await files.put(arq, Buffer.from("%PDF-1.4 teste"), "application/pdf");
    await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'Fonte em arquivo', $2, 9)`, [id, arq]);
    expect((await del(`${base}/${id}`, editor)).status).toBe(403);
    expect(await files.exists(audio)).toBe(true);
    expect((await del(`${base}/${id}`, admin)).status).toBe(200);
    expect(await files.exists(audio)).toBe(false);
    expect(await files.exists(arq)).toBe(false);
    const log = await registro(id);
    expect(log).toHaveLength(1);
    expect(log[0].details).toMatchObject({ audios: 1, fontes: 1 });
    expect((await fila(id)).map((r) => r.reason).sort()).toEqual(["episodio_apagado", "episodio_apagado"]);
    // o Registro ainda mostra o título do episódio apagado (guardado pelo podcast.save)
    const entrada = (await rpc(ADMIN, "app_admin_audit", { p_limit: 50 })).find((l: any) => l.action === "podcast.files.cleanup" && l.target === id);
    expect(entrada.title).toBeTruthy();
  });
});

describe("P08: tirar uma fonte", () => {
  it("o arquivo da fonte e o áudio que deixou de valer saem; arquivo igual usado por outra fonte do mesmo episódio fica", async () => {
    const { id, audio } = await episodioComAudio();
    const arq = `podcasts/${id}/src-bbbbbbbbbbbbbbbb.pdf`;
    await files.put(arq, Buffer.from("%PDF-1.4 teste"), "application/pdf");
    // dois cadastros do mesmo arquivo (o envio pelo servidor usa o SHA-256 como nome, então o mesmo arquivo repetido cai no mesmo caminho)
    const [a, b] = [(await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'Cópia 1', $2, 8) returning id`, [id, arq]))[0].id, (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'Cópia 2', $2, 9) returning id`, [id, arq]))[0].id];
    expect((await del(`${base}/${id}/sources/${a}`, editor)).status).toBe(200);
    expect(await files.exists(audio)).toBe(false); // sem fonte o roteiro cai, e o áudio com ele
    expect(await files.exists(arq)).toBe(true); // a Cópia 2 ainda usa o arquivo
    expect((await fila(id)).find((r) => r.storage_path === arq)).toMatchObject({ status: "mantido" });
    expect((await del(`${base}/${id}/sources/${b}`, editor)).status).toBe(200);
    expect(await files.exists(arq)).toBe(false); // agora ninguém o usa: o segundo evento enfileira o caminho de novo e ele sai
    expect((await fila(id)).filter((r) => r.storage_path === arq).map((r) => [r.reason, r.status])).toEqual([["fonte_tirada", "mantido"], ["fonte_tirada", "apagado"]]);
    expect((await registro(id)).at(-1)!.details).toMatchObject({ fontes: 1, arquivos: [path.basename(arq)] });
  });
});

describe("P08: só apaga o que ninguém mais usa", () => {
  it("áudio usado por outro episódio, por material de aula ou retido pela Fonte complementar NÃO é apagado", async () => {
    const { id, audio } = await episodioComAudio();
    const outro = (await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: "Outro episódio", topic: "T", area: "CLINICA_MEDICA", target_minutes: 5 } })).id;
    const lines = (await rpc(EDITOR, "app_admin_podcast", { p_id: id })).script.lines;
    await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: id, p_script: { lines, missing: [] } }); // o áudio deste episódio deixa de valer: caminho na fila
    const aula = (await sql(`insert into public.lessons (area, topic, title) values ('PEDIATRIA', 'Asma', 'Asma') returning id`))[0].id;
    const usos: Array<[string, string, string]> = [
      ["outro episódio", `update public.podcasts set audio_path = '${audio}' where id = '${outro}'`, `update public.podcasts set audio_path = null where id = '${outro}'`],
      ["retenção da Fonte complementar", `insert into public.ch_file_holds (storage_path) values ('${audio}')`, `delete from public.ch_file_holds where storage_path = '${audio}'`],
      ["material de aula", `insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ('${aula}', 'flashcast', 'Flashcast', '${audio}')`, `delete from public.lesson_materials where lesson_id = '${aula}'`],
    ];
    let esperadas = 1; // a primeira linha da fila veio do gatilho da edição
    for (const [nome, poe, tira] of usos) {
      if (esperadas > 1) await sql(`insert into public.podcast_files_released (podcast_id, storage_path, reason) values ($1, $2, 'audio_invalidado')`, [id, audio]);
      await sql(poe);
      expect((await post(`${base}/${id}/files/cleanup`, editor)).status, nome).toBe(200);
      expect(await files.exists(audio), nome).toBe(true);
      expect((await fila(id)).at(-1), nome).toMatchObject({ storage_path: audio, status: "mantido" });
      expect((await fila(id)).length).toBe(esperadas++);
      await sql(tira);
      await sql(`update public.podcast_files_released set status = 'mantido' where podcast_id = $1 and status = 'pendente'`, [outro]); // o outro episódio soltar o caminho enfileira para ELE (outro evento); aqui só nos interessa o episódio em teste
    }
    expect(await registro(id)).toHaveLength(0); // nada foi apagado: nada no Registro
  });

  it("o Flashcast já copiado para a aula continua tocando depois que o episódio perde o áudio", async () => {
    const { id, audio } = await episodioComAudio();
    await sql(`update public.podcasts set status = 'published', published_by = $2, published_at = now() where id = $1`, [id, ADMIN]);
    const aula = (await sql(`insert into public.lessons (area, topic, title, published) values ('PEDIATRIA', 'Asma', 'Asma na infância', true) returning id`))[0].id;
    expect((await post(`${base}/${id}/flashcast`, admin, { lesson_id: aula, confirm: true })).status).toBe(201);
    const copia = (await sql(`select storage_path from public.lesson_materials where lesson_id = $1 and kind = 'flashcast'`, [aula]))[0].storage_path;
    expect(await lessonFiles.exists(copia)).toBe(true);
    await rpc(ADMIN, "app_admin_podcast_publish", { p_id: id, p_published: false });
    await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: id, p_script: { lines: (await rpc(EDITOR, "app_admin_podcast", { p_id: id })).script.lines, missing: [] } });
    expect((await post(`${base}/${id}/files/cleanup`, editor)).status).toBe(200);
    expect(await lessonFiles.exists(copia)).toBe(true); // o depósito das aulas não é tocado
    expect(await files.exists(audio)).toBe(false); // o áudio do episódio saiu, a cópia da aula ficou
  });

  it("só caminhos no formato podcasts/<episódio>/<arquivo> são apagados; qualquer outro vira 'mantido'", async () => {
    const ep = (await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: "Caminhos estranhos", topic: "T", area: "CLINICA_MEDICA", target_minutes: 5 } })).id;
    const outroId = "00000000-0000-4000-8000-0000000000ff";
    for (const p of ["x", "audio.mp3", `podcasts/${outroId.slice(0, 30)}/audio-a.mp3`, `podcasts/${ep}/../outro.mp3`, `lessons/${ep}/x.mp3`]) {
      await sql(`insert into public.podcast_files_released (podcast_id, storage_path, reason) values ($1, $2, 'audio_invalidado')`, [ep, p]);
    }
    const pending = await db.service<any[]>("ch_worker_podcast_files_pending", { p_user: EDITOR, p_podcast: ep });
    expect(pending).toEqual([]);
    expect((await fila(ep)).map((r) => r.status)).toEqual(Array(5).fill("mantido"));
  });
});

describe("P08: falhar ao apagar não desfaz a operação principal", () => {
  it("a edição, a fonte tirada e o episódio apagado terminam; o arquivo fica pendente com o erro e sai no evento seguinte", async () => {
    const { id, audio } = await episodioComAudio(flaky);
    falhaAoApagar = true;
    try {
      expect((await post(`${flaky}/${id}/script`, editor, { provider: "mock" })).status).toBe(200); // a geração do roteiro não falha por causa do depósito
      expect(await files.exists(audio)).toBe(true);
      expect((await fila(id))[0]).toMatchObject({ status: "pendente", attempts: 1, last_error: "depósito fora do ar" });
      expect(await registro(id)).toHaveLength(0); // não apagou: não registra
    } finally {
      falhaAoApagar = false;
    }
    expect((await post(`${flaky}/${id}/files/cleanup`, editor)).status).toBe(200);
    expect(await files.exists(audio)).toBe(false);
    expect((await fila(id))[0]).toMatchObject({ status: "apagado", attempts: 1 });
    expect(await registro(id)).toHaveLength(1);
  });

  it("apagar o episódio com o depósito fora do ar: o episódio é apagado e os arquivos ficam na fila", async () => {
    const { id, audio } = await episodioComAudio(flaky);
    falhaAoApagar = true;
    try {
      expect((await del(`${flaky}/${id}`, admin)).status).toBe(200);
    } finally {
      falhaAoApagar = false;
    }
    expect((await sql(`select 1 from public.podcasts where id = $1`, [id]))).toHaveLength(0);
    expect(await files.exists(audio)).toBe(true);
    expect((await fila(id))[0]).toMatchObject({ status: "pendente", reason: "episodio_apagado", attempts: 1 });
  });
});

describe("P08: nada é apagado por varredura e as permissões valem", () => {
  it("arquivo antigo que já estava esquecido, sem linha na fila, continua lá depois de qualquer evento", async () => {
    const { id } = await episodioComAudio();
    const velho = `podcasts/${id}/audio-esquecido0000.mp3`;
    await files.put(velho, Buffer.from("mp3 antigo"), "audio/mpeg");
    expect((await post(`${base}/${id}/script`, editor, { provider: "mock" })).status).toBe(200);
    expect((await post(`${base}/${id}/files/cleanup`, editor)).status).toBe(200);
    expect(await files.exists(velho)).toBe(true);
    expect((await fila(id)).some((r) => r.storage_path === velho)).toBe(false);
  });

  it("a limpeza é só da equipe; aluno e visitante não chamam, e as funções do banco não são chamáveis por login", async () => {
    const { id } = await episodioComAudio();
    expect((await post(`${base}/${id}/files/cleanup`, student)).status).toBe(403);
    expect((await call(`${base}/${id}/files/cleanup`, "token-invalido", { method: "POST" })).status).toBe(401);
    for (const [fn, args] of [["ch_worker_podcast_files_pending", { p_user: EDITOR, p_podcast: id }], ["ch_worker_podcast_files_done", { p_user: EDITOR, p_results: "[]" }]] as const) {
      for (const uid of [ADMIN, EDITOR, STUDENT]) await expect(rpc(uid, fn, args as any), `${fn} ${uid}`).rejects.toThrow(/permission denied/);
    }
    await expect(sqlAs(EDITOR, `select * from public.podcast_files_released`)).rejects.toThrow(/permission denied/);
    // as funções do servidor também conferem a equipe pela conta informada
    await expect(db.service("ch_worker_podcast_files_pending", { p_user: STUDENT, p_podcast: id })).rejects.toThrow(/Acesso restrito/);
    await expect(db.service("ch_worker_podcast_files_done", { p_user: STUDENT, p_results: [] })).rejects.toThrow(/Acesso restrito/);
  });
});

describe("P08: lista de arquivos esquecidos (rotina só de leitura)", () => {
  const ROTINA = path.resolve(__dirname, "../../supabase/rotinas/lista-podcasts-arquivos-esquecidos.sql");

  it("lista, sem apagar nada, o que está no depósito e nenhuma linha do banco usa; dá a conta no começo", async () => {
    const { id, audio } = await episodioComAudio();
    // depósito simulado do Supabase (storage.objects): o usado, o esquecido, a fonte esquecida, o temporário velho e o recente
    await sql(`create schema if not exists storage`);
    await sql(`create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, created_at timestamptz default now(), metadata jsonb)`);
    await sql(`delete from storage.objects`);
    const velho = "now() - interval '3 days'";
    const obj = (name: string, bytes: number, quando = "now()") => sql(`insert into storage.objects (bucket_id, name, created_at, metadata) values ('podcasts', $1, ${quando}, $2::jsonb)`, [name, JSON.stringify({ size: bytes })]);
    await obj(audio, 1_000_000); // usado pelo episódio
    await obj(`podcasts/${id}/audio-esquecido1111.mp3`, 2_000_000, velho);
    await obj(`podcasts/${id}/src-esquecida2222.pdf`, 3_000_000, velho);
    await obj(`podcasts/${id}/tmp/aaaaaaaaaaaaaaaa/part-0.mp3`, 500_000, velho);
    await obj(`podcasts/${id}/tmp/bbbbbbbbbbbbbbbb/part-0.mp3`, 500_000); // geração em andamento: não é esquecido
    await sql(`insert into storage.objects (bucket_id, name, created_at, metadata) values ('lessons', 'lessons/x/slides.pdf', now(), '{"size":10}')`); // outro depósito: fora
    const before = (await sql(`select count(*)::int n from storage.objects`))[0].n;
    const rows = await sql(fs.readFileSync(ROTINA, "utf8"));
    expect((await sql(`select count(*)::int n from storage.objects`))[0].n).toBe(before); // só leitura
    expect(rows[0]).toMatchObject({ tipo: "RESUMO" });
    expect(rows[0].arquivo).toMatch(/3 arquivos/);
    const nomes = rows.slice(1).map((r: any) => r.arquivo).sort();
    expect(nomes).toEqual([`podcasts/${id}/audio-esquecido1111.mp3`, `podcasts/${id}/src-esquecida2222.pdf`, `podcasts/${id}/tmp/aaaaaaaaaaaaaaaa/part-0.mp3`].sort());
    expect(rows.slice(1).map((r: any) => r.tipo).sort()).toEqual(["Áudio que nenhum episódio usa", "Arquivo de fonte que nenhuma fonte usa", "Partes temporárias de um áudio que não terminou"].sort());
    expect(rows.slice(1).every((r: any) => typeof r.tamanho_mb === "string" || typeof r.tamanho_mb === "number")).toBe(true);
    // a retenção da Fonte complementar protege: o que está retido não entra na lista
    await sql(`insert into public.ch_file_holds (storage_path) values ($1)`, [`podcasts/${id}/src-esquecida2222.pdf`]);
    const retido = await sql(fs.readFileSync(ROTINA, "utf8"));
    expect(retido.slice(1).map((r: any) => r.arquivo)).not.toContain(`podcasts/${id}/src-esquecida2222.pdf`);
    await sql(`delete from storage.objects`);
    await sql(`drop table storage.objects`);
    await sql(`drop schema storage`);
  });
});


describe("Rodada de correções da revisão: a corrida entre conferir e apagar (achados 1 e 2)", () => {
  const dono = async (id: string) => (await sql(`select status, reserved_at from public.podcast_files_released where podcast_id = $1 order by id`, [id]));

  it("o banco RESERVA o caminho; quem tenta criar referência a ele (material de aula, retenção, fonte, áudio de outro episódio) é recusado, em português", async () => {
    const { id, audio } = await episodioComAudio();
    const outro = (await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: "Outro", topic: "T", area: "CLINICA_MEDICA", target_minutes: 5 } })).id;
    const aula = (await sql(`insert into public.lessons (area, topic, title) values ('PEDIATRIA', 'Asma', 'Asma') returning id`))[0].id;
    await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: id, p_script: { lines: (await rpc(EDITOR, "app_admin_podcast", { p_id: id })).script.lines, missing: [] } });
    const reservados = await db.service<any[]>("ch_worker_podcast_files_pending", { p_user: EDITOR, p_podcast: null });
    expect(reservados.map((r) => r.path)).toEqual([audio]);
    expect((await dono(id))[0]).toMatchObject({ status: "apagando" });
    const recusas = [
      `insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ('${aula}', 'flashcast', 'F', '${audio}')`,
      `insert into public.ch_file_holds (storage_path) values ('${audio}')`,
      `insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ('${outro}', 'pdf', 'P', '${audio}', 9)`,
      `update public.podcasts set audio_path = '${audio}' where id = '${outro}'`,
    ];
    for (const q of recusas) await expect(sql(q), q).rejects.toThrow(/está sendo apagado do depósito agora/);
    // uma segunda limpeza ao mesmo tempo não recebe o mesmo arquivo
    expect(await db.service<any[]>("ch_worker_podcast_files_pending", { p_user: EDITOR, p_podcast: null })).toEqual([]);
    // depois da confirmação o caminho volta a ser livre (um arquivo novo com esse nome é outro arquivo)
    await db.service("ch_worker_podcast_files_done", { p_user: EDITOR, p_results: [{ id: reservados[0].id, token: reservados[0].token, ok: true }] });
    await sql(`insert into public.ch_file_holds (storage_path) values ('${audio}')`);
    await sql(`delete from public.ch_file_holds where storage_path = '${audio}'`);
  });

  it("uma reserva que venceu (servidor que caiu) não trava ninguém e é reavaliada", async () => {
    const { id, audio } = await episodioComAudio();
    await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: id, p_script: { lines: (await rpc(EDITOR, "app_admin_podcast", { p_id: id })).script.lines, missing: [] } });
    const [r] = await db.service<any[]>("ch_worker_podcast_files_pending", { p_user: EDITOR, p_podcast: id });
    await sql(`update public.podcast_files_released set reserved_at = now() - interval '11 minutes' where id = $1`, [r.id]);
    await sql(`insert into public.ch_file_holds (storage_path) values ('${audio}')`); // reserva vencida: não recusa
    expect(await db.service<any[]>("ch_worker_podcast_files_pending", { p_user: EDITOR, p_podcast: id })).toEqual([]); // agora há referência: mantém
    expect((await dono(id))[0]).toMatchObject({ status: "mantido" });
    await sql(`delete from public.ch_file_holds where storage_path = '${audio}'`);
  });

  it("ponta a ponta: uma operação que tenta usar o arquivo NO MEIO da exclusão é recusada e o arquivo sai; sem ela, o arquivo ficaria apontado e apagado", async () => {
    const { id, audio } = await episodioComAudio(spy);
    const aula = (await sql(`insert into public.lessons (area, topic, title) values ('PEDIATRIA', 'Asma', 'Asma') returning id`))[0].id;
    let recusa = "";
    aoApagar = async (keys) => {
      if (!keys.includes(audio)) return;
      try { await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ('${aula}', 'flashcast', 'F', '${audio}')`); recusa = "aceitou"; } catch (e) { recusa = String((e as Error).message); }
    };
    try {
      expect((await post(`${spy}/${id}/script`, editor, { provider: "mock" })).status).toBe(200);
    } finally {
      aoApagar = null;
    }
    expect(recusa).toMatch(/está sendo apagado/);
    expect(await files.exists(audio)).toBe(false);
    expect((await sql(`select 1 from public.lesson_materials where storage_path = $1`, [audio]))).toHaveLength(0); // nenhuma referência ficou apontando para o arquivo apagado
  });

  it("o servidor nunca apaga o que o banco não reservou: referência criada ANTES da reserva mantém o arquivo", async () => {
    const { id, audio } = await episodioComAudio(spy);
    const aula = (await sql(`insert into public.lessons (area, topic, title) values ('PEDIATRIA', 'Asma', 'Asma') returning id`))[0].id;
    await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: id, p_script: { lines: (await rpc(EDITOR, "app_admin_podcast", { p_id: id })).script.lines, missing: [] } });
    await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ('${aula}', 'flashcast', 'F', '${audio}')`);
    const apagados: string[] = [];
    aoApagar = async (keys) => { apagados.push(...keys); };
    try { expect((await post(`${spy}/${id}/files/cleanup`, editor)).status).toBe(200); } finally { aoApagar = null; }
    expect(apagados).not.toContain(audio);
    expect(await files.exists(audio)).toBe(true);
    await sql(`delete from public.lesson_materials where lesson_id = '${aula}'`);
  });
});

describe("Rodada de correções da revisão: servidor ANTIGO na janela 'SQL novo + site antigo' (achado 2)", () => {
  it("apagar o episódio devolve ao servidor antigo só os caminhos que nenhuma outra linha usa", async () => {
    const { id, audio } = await episodioComAudio();
    const aula = (await sql(`insert into public.lessons (area, topic, title) values ('PEDIATRIA', 'Asma', 'Asma') returning id`))[0].id;
    const arq = `podcasts/${id}/src-eeeeeeeeeeeeeeee.pdf`;
    await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'Fonte', $2, 9)`, [id, arq]);
    // o áudio foi copiado para um material de aula pelo mesmo caminho (por engano ou à mão): quem apagar o episódio NÃO pode levá-lo
    await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ($1, 'flashcast', 'F', $2)`, [aula, audio]);
    const r = await rpc(ADMIN, "app_admin_delete_podcast", { p_id: id });
    expect(r.deleted).toBe(true);
    expect(r.paths).toEqual([arq]); // o servidor antigo apagaria só a fonte; o áudio em uso fica
    await sql(`delete from public.lesson_materials where lesson_id = $1`, [aula]);
  });
  it("o servidor antigo apaga direto (como hoje); o que o SQL novo anotou na fila é confirmado depois, sem erro e sem apagar nada em uso", async () => {
    const { id, audio } = await episodioComAudio();
    await files.remove!([audio]); // o servidor antigo já apagou o arquivo direto
    await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: id, p_script: { lines: (await rpc(EDITOR, "app_admin_podcast", { p_id: id })).script.lines, missing: [] } });
    expect((await post(`${base}/files/cleanup`, editor)).body).toEqual({ ok: true }); // arquivo inexistente: confirma, não quebra
    expect((await fila(id))[0]).toMatchObject({ status: "apagado" });
  });
});

describe("Rodada de correções da revisão: site novo com banco SEM a 9721 (achado 3)", () => {
  it("apagar episódio e tirar fonte: nada é apagado do depósito e a resposta AVISA em português (não é sucesso silencioso)", async () => {
    const { id, audio } = await episodioComAudio();
    const arq = `podcasts/${id}/src-cccccccccccccccc.pdf`;
    await files.put(arq, Buffer.from("%PDF-1.4 teste"), "application/pdf");
    const fonte = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'F', $2, 9) returning id`, [id, arq]))[0].id;
    const tirar = await del(`${semSql}/${id}/sources/${fonte}`, editor);
    expect(tirar.status).toBe(200);
    expect(tirar.body.note).toMatch(/atualização necessária.*ainda não foi concluída/);
    expect(tirar.body.note).not.toMatch(/9721|migra/i);
    expect(await files.exists(arq)).toBe(true);
    const apagar = await del(`${semSql}/${id}`, admin);
    expect(apagar.status).toBe(200);
    expect(apagar.body).toMatchObject({ deleted: true });
    expect(apagar.body.aviso).toMatch(/atualização necessária/);
    expect(apagar.body.aviso).not.toMatch(/9721|migra/i);
    expect(await files.exists(audio)).toBe(true); // nada se perdeu: os arquivos ficam e aparecem na lista de esquecidos
    expect(await files.exists(arq)).toBe(true);
    const repetir = await post(`${semSql}/files/cleanup`, editor);
    expect(repetir.body).toMatchObject({ ok: false });
    expect(repetir.body.note).toMatch(/atualização necessária/);
    expect(repetir.body.note).not.toMatch(/9721|migra/i);
  });
});

describe("Rodada de correções da revisão: fila sem caminho de recuperação (achado 4)", () => {
  it("episódio apagado com o depósito fora do ar: a rota de repetir alcança a fila inteira, sem depender do episódio", async () => {
    const { id, audio } = await episodioComAudio(flaky);
    falhaAoApagar = true;
    try { expect((await del(`${flaky}/${id}`, admin)).status).toBe(200); } finally { falhaAoApagar = false; }
    expect(await files.exists(audio)).toBe(true);
    expect((await fila(id))[0]).toMatchObject({ status: "pendente", reason: "episodio_apagado", attempts: 1 });
    expect((await post(`${base}/${id}/files/cleanup`, editor)).status).toBe(404); // o episódio não existe mais: a rota por episódio não serve
    expect((await post(`${base}/files/cleanup`, student)).status).toBe(403);
    expect((await call(`${base}/files/cleanup`, "token-invalido", { method: "POST" })).status).toBe(401);
    expect((await post(`${base}/files/cleanup`, editor)).body).toEqual({ ok: true });
    expect(await files.exists(audio)).toBe(false);
    expect((await fila(id))[0]).toMatchObject({ status: "apagado" });
    const log = await registro(id);
    expect(log).toHaveLength(1);
    expect(log[0].details).toMatchObject({ audios: 1, falhas: 0 });
  });

  it("qualquer evento seguinte (de OUTRO episódio) também limpa o que ficou pendente", async () => {
    const outro = await episodioComAudio(); // (os eventos de montar este episódio também limpam a fila: por isso vem primeiro)
    const velho = await episodioComAudio(flaky);
    falhaAoApagar = true;
    try { expect((await del(`${flaky}/${velho.id}`, admin)).status).toBe(200); } finally { falhaAoApagar = false; }
    expect(await files.exists(velho.audio)).toBe(true);
    expect((await post(`${base}/${outro.id}/script`, editor, { provider: "mock" })).status).toBe(200);
    expect(await files.exists(velho.audio)).toBe(false);
    expect((await fila(velho.id))[0]).toMatchObject({ status: "apagado" });
  });

  it("se a confirmação ao banco se perder depois de apagar, a reserva vence e a próxima limpeza confirma e registra uma vez", async () => {
    const { id, audio } = await episodioComAudio();
    await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: id, p_script: { lines: (await rpc(EDITOR, "app_admin_podcast", { p_id: id })).script.lines, missing: [] } });
    const [r] = await db.service<any[]>("ch_worker_podcast_files_pending", { p_user: EDITOR, p_podcast: null });
    await files.remove!([audio]); // o servidor apagou, mas a chamada `done` nunca chegou
    expect(await registro(id)).toHaveLength(0);
    await sql(`update public.podcast_files_released set reserved_at = now() - interval '11 minutes' where id = $1`, [r.id]);
    expect((await post(`${base}/files/cleanup`, editor)).body).toEqual({ ok: true });
    expect((await fila(id))[0]).toMatchObject({ status: "apagado" });
    expect(await registro(id)).toHaveLength(1);
  });
});

describe("Rodada de correções da revisão: arquivo compartilhado entre episódios (achado 5)", () => {
  it("A e B usam o mesmo áudio: quando A solta fica mantido; quando B solta (pasta de A) o arquivo SAI", async () => {
    const A = await episodioComAudio();
    const B = (await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: "Episódio B", topic: "T", area: "CLINICA_MEDICA", target_minutes: 5 } })).id as string;
    await sql(`update public.podcasts set audio_path = $1 where id = $2`, [A.audio, B]);
    await sql(`update public.podcasts set audio_path = null where id = $1`, [A.id]); // A solta o arquivo
    expect((await post(`${base}/files/cleanup`, editor)).status).toBe(200);
    expect(await files.exists(A.audio)).toBe(true);
    expect((await fila(A.id))[0]).toMatchObject({ status: "mantido" });
    await sql(`update public.podcasts set audio_path = null where id = $1`, [B]); // B (último uso) solta
    expect((await post(`${base}/files/cleanup`, editor)).status).toBe(200);
    expect(await files.exists(A.audio)).toBe(false);
    expect((await fila(B))[0]).toMatchObject({ storage_path: A.audio, status: "apagado" });
    expect((await registro(B))[0].details).toMatchObject({ audios: 1, arquivos: [path.basename(A.audio)] });
  });
});

describe("Rodada de correções da revisão: Registro sem duplicar e sem confirmar o que não foi reservado (achado 6)", () => {
  it("confirmar duas vezes o mesmo resultado grava UM item no Registro; id que não foi reservado é ignorado", async () => {
    const { id, audio } = await episodioComAudio();
    await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: id, p_script: { lines: (await rpc(EDITOR, "app_admin_podcast", { p_id: id })).script.lines, missing: [] } });
    const row = (await fila(id))[0];
    const rowId = (await sql(`select id from public.podcast_files_released where podcast_id = $1`, [id]))[0].id;
    // ainda "pendente" (ninguém reservou): a confirmação é ignorada, não apaga nem registra
    expect(await db.service("ch_worker_podcast_files_done", { p_user: EDITOR, p_results: [{ id: rowId, token: "00000000-0000-4000-8000-000000000000", ok: true }] })).toBe(0);
    expect(row.status).toBe("pendente");
    expect((await fila(id))[0].status).toBe("pendente");
    expect(await registro(id)).toHaveLength(0);
    const [r] = await db.service<any[]>("ch_worker_podcast_files_pending", { p_user: EDITOR, p_podcast: id });
    await files.remove!([audio]);
    expect(await db.service("ch_worker_podcast_files_done", { p_user: EDITOR, p_results: [{ id: r.id, token: r.token, ok: true }, { id: r.id, token: r.token, ok: true }] })).toBe(1);
    expect(await db.service("ch_worker_podcast_files_done", { p_user: EDITOR, p_results: [{ id: r.id, token: r.token, ok: true }] })).toBe(0);
    expect(await registro(id)).toHaveLength(1);
  });

  it("duas limpezas ao mesmo tempo: cada arquivo é entregue a UMA delas e o Registro tem um item por arquivo", async () => {
    const { id, audio } = await episodioComAudio();
    await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: id, p_script: { lines: (await rpc(EDITOR, "app_admin_podcast", { p_id: id })).script.lines, missing: [] } });
    const [a, b] = await Promise.all([post(`${base}/files/cleanup`, editor), post(`${base}/files/cleanup`, admin)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await files.exists(audio)).toBe(false);
    expect(await registro(id)).toHaveLength(1);
    expect((await fila(id)).map((r) => r.status)).toEqual(["apagado"]);
  });

  it("falha entra na contagem do Registro só do que esta chamada confirmou", async () => {
    const { id, audio } = await episodioComAudio();
    const arq = `podcasts/${id}/src-dddddddddddddddd.pdf`;
    await files.put(arq, Buffer.from("%PDF-1.4"), "application/pdf");
    await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: id, p_script: { lines: (await rpc(EDITOR, "app_admin_podcast", { p_id: id })).script.lines, missing: [] } });
    await sql(`insert into public.podcast_files_released (podcast_id, storage_path, reason) values ($1, $2, 'fonte_tirada')`, [id, arq]);
    const reservados = await db.service<any[]>("ch_worker_podcast_files_pending", { p_user: EDITOR, p_podcast: id });
    expect(reservados).toHaveLength(2);
    const idAudio = reservados.find((r) => r.path === audio).id, idArq = reservados.find((r) => r.path === arq).id;
    const tokAudio = reservados.find((r) => r.path === audio).token, tokArq = reservados.find((r) => r.path === arq).token;
    await db.service("ch_worker_podcast_files_done", { p_user: EDITOR, p_results: [{ id: idAudio, token: tokAudio, ok: true }, { id: idArq, token: tokArq, ok: false, error: "fora do ar" }] });
    expect((await registro(id))[0].details).toMatchObject({ audios: 1, fontes: 0, falhas: 1 });
    expect((await fila(id)).find((r) => r.storage_path === arq)).toMatchObject({ status: "pendente", attempts: 1, last_error: "fora do ar" });
  });
});

// ================================================================================================================================
// 2ª rodada da revisão independente
// ================================================================================================================================
const salvaRoteiro = async (id: string) =>
  rpc(EDITOR, "app_admin_podcast_save_script", { p_id: id, p_script: { lines: (await rpc(EDITOR, "app_admin_podcast", { p_id: id })).script.lines, missing: [] } });
const entrada = async (id: string) => (await sql(`select id, status, reserve_token, reserved_at, reavaliar, attempts from public.podcast_files_released where podcast_id = $1 order by id`, [id]));
const vence = (rowId: number) => sql(`update public.podcast_files_released set reserved_at = now() - interval '11 minutes' where id = $1`, [rowId]);
const renew = (rowId: number, token: string | null) => db.service<string>("ch_worker_podcast_files_renew", { p_user: EDITOR, p_id: rowId, p_token: token });
const done = (results: unknown[]) => db.service<number>("ch_worker_podcast_files_done", { p_user: EDITOR, p_results: results });
const reserva = async (id: string) => (await db.service<any[]>("ch_worker_podcast_files_pending", { p_user: EDITOR, p_podcast: id }))[0];

describe("2ª rodada, achado 1: cada reserva tem um código; resposta atrasada de uma tentativa antiga não mexe na nova", () => {
  it("A reserva, a reserva vence, B reserva de novo: a resposta atrasada de A (ok ou falha) é ignorada e a reserva de B continua valendo", async () => {
    const { id, audio } = await episodioComAudio();
    await salvaRoteiro(id);
    const a = await reserva(id);
    expect(a.token).toMatch(/^[0-9a-f-]{36}$/);
    await vence(a.id);
    const b = await reserva(id); // reserva vencida é reavaliada e ganha OUTRO código
    expect(b.id).toBe(a.id);
    expect(b.token).not.toBe(a.token);
    expect(await done([{ id: a.id, token: a.token, ok: false, error: "tarde demais" }])).toBe(0); // antes: devolvia a entrada de B para 'pendente'
    expect((await entrada(id))[0]).toMatchObject({ status: "apagando", reserve_token: b.token, attempts: 0 });
    expect(await done([{ id: a.id, token: a.token, ok: true }])).toBe(0);
    expect(await registro(id)).toHaveLength(0);
    expect(await renew(a.id, a.token)).toBe("outra"); // o código antigo também não renova
    expect(await renew(a.id, b.token)).toBe("ok");
    await files.remove!([audio]);
    expect(await done([{ id: b.id, token: b.token, ok: true }])).toBe(1);
    expect((await entrada(id))[0]).toMatchObject({ status: "apagado", reserve_token: null });
    expect(await registro(id)).toHaveLength(1);
  });

  it("renovar: só com o código vigente, dentro do prazo e enquanto nada usa o caminho; reserva vencida nunca autoriza apagar", async () => {
    const { id, audio } = await episodioComAudio();
    await salvaRoteiro(id);
    const row = (await entrada(id))[0];
    expect(await renew(row.id, "00000000-0000-4000-8000-000000000001")).toBe("incompleta"); // ainda 'pendente': ninguém reservou
    const r = await reserva(id);
    expect(await renew(r.id, null)).toBe("incompleta");
    expect(await renew(r.id, "00000000-0000-4000-8000-000000000001")).toBe("outra"); // código errado
    expect(await renew(r.id, r.token)).toBe("ok");
    expect(await renew(r.id, r.token)).toBe("ok"); // renovar de novo é permitido
    await vence(r.id);
    expect(await renew(r.id, r.token)).toBe("incompleta"); // vencida: não renova, mesmo com o código certo
    expect((await entrada(id))[0]).toMatchObject({ status: "apagando" }); // continua reservada ao código antigo até alguém reservar de novo
    // vencida + alguém passa a usar o caminho (a recusa só vale com reserva vigente): a renovação continua negada
    await sql(`insert into public.ch_file_holds (storage_path) values ('${audio}')`);
    expect(await renew(r.id, r.token)).toBe("incompleta");
    await sql(`delete from public.ch_file_holds where storage_path = '${audio}'`);
  });

  it("renovar percebe o uso que apareceu depois da reserva (reserva vencida, mas ainda com o código): encerra como mantido e não apaga", async () => {
    const { id, audio } = await episodioComAudio();
    await salvaRoteiro(id);
    const r = await reserva(id);
    await sql(`update public.podcast_files_released set reserved_at = now() - interval '9 minutes' where id = $1`, [r.id]); // ainda vigente
    await sql(`alter table public.ch_file_holds disable trigger podcast_files_guard_hold`); // simula uma escrita que escapou do gatilho
    await sql(`insert into public.ch_file_holds (storage_path) values ('${audio}')`);
    await sql(`alter table public.ch_file_holds enable trigger podcast_files_guard_hold`);
    expect(await renew(r.id, r.token)).toBe("em_uso");
    expect((await entrada(id))[0]).toMatchObject({ status: "mantido", reserve_token: null });
    await sql(`delete from public.ch_file_holds where storage_path = '${audio}'`);
  });

  it("ponta a ponta: a reserva do 2º arquivo vence enquanto o 1º é apagado e alguém passa a usar o 2º → o servidor NÃO apaga o 2º", async () => {
    const { id, audio } = await episodioComAudio(spy);
    const arq = `podcasts/${id}/src-aaaaaaaaaaaaaaaa.pdf`;
    await files.put(arq, Buffer.from("%PDF-1.4 teste"), "application/pdf");
    const aula = (await sql(`insert into public.lessons (area, topic, title) values ('PEDIATRIA', 'Asma', 'Asma') returning id`))[0].id;
    await salvaRoteiro(id);
    await sql(`insert into public.podcast_files_released (podcast_id, storage_path, reason) values ($1, $2, 'fonte_tirada')`, [id, arq]);
    const apagados: string[] = [];
    aoApagar = async (keys) => {
      apagados.push(...keys);
      if (!keys.includes(audio)) return;
      // a limpeza demorou: a reserva do 2º arquivo venceu e, sem reserva vigente, alguém conseguiu criar uma referência a ele
      await sql(`update public.podcast_files_released set reserved_at = now() - interval '11 minutes' where podcast_id = $1 and storage_path = $2`, [id, arq]);
      await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ('${aula}', 'flashcast', 'Apostila', '${arq}')`);
    };
    try {
      expect((await post(`${spy}/${id}/files/cleanup`, editor)).body).toEqual({ ok: true });
    } finally {
      aoApagar = null;
    }
    expect(apagados).toEqual([audio]); // o 2º nunca chegou ao depósito
    expect(await files.exists(arq)).toBe(true);
    // reserva vencida: a rodada seguinte da MESMA limpeza reserva de novo, vê o uso e encerra como mantido (3ª revisão: sem aviso falso, nada apagado)
    expect((await fila(id)).find((r) => r.storage_path === arq)).toMatchObject({ status: "mantido" });
    expect(await files.exists(arq)).toBe(true);
    await sql(`delete from public.lesson_materials where lesson_id = '${aula}'`);
  });

  it("ponta a ponta: a reserva do 2º arquivo foi tomada por outra tentativa (outro código) durante a limpeza → o servidor NÃO apaga e a outra continua dona", async () => {
    const { id, audio } = await episodioComAudio(spy);
    const arq = `podcasts/${id}/src-bbbbbbbbbbbbbbbb.pdf`;
    await files.put(arq, Buffer.from("%PDF-1.4 teste"), "application/pdf");
    await salvaRoteiro(id);
    await sql(`insert into public.podcast_files_released (podcast_id, storage_path, reason) values ($1, $2, 'fonte_tirada')`, [id, arq]);
    let outro: any = null;
    aoApagar = async (keys) => {
      if (!keys.includes(audio)) return;
      await sql(`update public.podcast_files_released set reserved_at = now() - interval '11 minutes' where podcast_id = $1 and storage_path = $2`, [id, arq]);
      outro = (await db.service<any[]>("ch_worker_podcast_files_pending", { p_user: ADMIN, p_podcast: id })).find((r) => r.path === arq); // a tentativa B
    };
    let resposta: any;
    try {
      resposta = (await post(`${spy}/${id}/files/cleanup`, editor)).body;
    } finally {
      aoApagar = null;
    }
    expect(resposta).toMatchObject({ ok: false }); // 3ª revisão: o arquivo ficou com outra tentativa; nunca "tudo certo" em silêncio
    expect(resposta.note).toMatch(/Nada se perdeu/);
    expect(outro).toBeTruthy();
    expect(await files.exists(arq)).toBe(true);
    expect((await fila(id)).find((r) => r.storage_path === arq)).toMatchObject({ status: "apagando" });
    expect((await entrada(id)).find((r) => r.id === outro.id)).toMatchObject({ reserve_token: outro.token });
    await files.remove!([arq]);
    expect(await done([{ id: outro.id, token: outro.token, ok: true }])).toBe(1);
  });

  it("código ausente ou malformado nunca confirma nada", async () => {
    const { id } = await episodioComAudio();
    await salvaRoteiro(id);
    const r = await reserva(id);
    expect(await done([{ id: r.id, ok: true }, { id: r.id, token: "não-é-código", ok: true }, { id: r.id, token: 7, ok: true }, "lixo", null])).toBe(0);
    expect((await entrada(id))[0]).toMatchObject({ status: "apagando", reserve_token: r.token });
    await vence(r.id);
    await reserva(id).then((x) => done([{ id: x.id, token: x.token, ok: false, error: "x" }]));
  });
});

describe("2ª rodada, achado 3: o último uso liberado não se perde", () => {
  it("novo evento com entrada aberta: não é descartado (marca reavaliar); com reserva vigente a reserva não é tocada", async () => {
    const A = await episodioComAudio();
    const B = (await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: "Episódio B1", topic: "T", area: "CLINICA_MEDICA", target_minutes: 5 } })).id as string;
    await sql(`update public.podcasts set audio_path = $1 where id = $2`, [A.audio, B]); // A e B apontam para o mesmo áudio
    await sql(`update public.podcasts set audio_path = null where id = $1`, [A.id]); // A solta: entrada aberta (pendente)
    await sql(`update public.podcasts set audio_path = null where id = $1`, [B]); // B solta ANTES da limpeza: antes o evento era descartado
    const abertas = (await sql(`select id, podcast_id, status, reavaliar from public.podcast_files_released where storage_path = $1`, [A.audio]));
    expect(abertas).toHaveLength(1);
    expect(abertas[0]).toMatchObject({ status: "pendente", reavaliar: true });
    // com reserva vigente: a reserva e o código continuam, só chega a marca
    const r = await reserva(A.id);
    expect(r.path).toBe(A.audio);
    const outro = (await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: "Episódio C1", topic: "T", area: "CLINICA_MEDICA", target_minutes: 5 } })).id as string;
    await sql(`update public.podcast_files_released set reavaliar = false where id = $1`, [r.id]);
    // evento novo para o mesmo caminho (simulado pela inserção que o gatilho faria) com a entrada reservada
    await sql(`insert into public.podcast_files_released (podcast_id, storage_path, reason) values ($1, $2, 'audio_invalidado') on conflict (storage_path) where status in ('pendente', 'apagando') do update set reavaliar = true`, [outro, A.audio]);
    expect((await sql(`select status, reserve_token, reavaliar from public.podcast_files_released where id = $1`, [r.id]))[0]).toMatchObject({ status: "apagando", reserve_token: r.token, reavaliar: true });
    await files.remove!([A.audio]);
    expect(await done([{ id: r.id, token: r.token, ok: true }])).toBe(1);
  });

  it("evento que chega com a entrada encerrada como 'mantido' abre uma entrada nova (e o arquivo sai quando o último uso solta)", async () => {
    const A = await episodioComAudio();
    const B = (await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: "Episódio B2", topic: "T", area: "CLINICA_MEDICA", target_minutes: 5 } })).id as string;
    await sql(`update public.podcasts set audio_path = $1 where id = $2`, [A.audio, B]);
    await sql(`update public.podcasts set audio_path = null where id = $1`, [A.id]);
    expect((await post(`${base}/files/cleanup`, editor)).status).toBe(200);
    expect((await fila(A.id))[0]).toMatchObject({ status: "mantido" });
    await sql(`update public.podcasts set audio_path = null where id = $1`, [B]);
    expect((await fila(B)).map((r) => r.status)).toEqual(["pendente"]);
    expect((await post(`${base}/files/cleanup`, editor)).status).toBe(200);
    expect(await files.exists(A.audio)).toBe(false);
  });

  it("rede de segurança: entrada 'mantido' com mais de uma hora é reavaliada; sem uso, o arquivo sai; ainda em uso, continua mantida", async () => {
    const { id, audio } = await episodioComAudio();
    await salvaRoteiro(id);
    // simula o evento perdido: a entrada foi encerrada como 'mantido' vendo uma referência que já não existe
    const antiga = "now() - interval '2 hours'";
    await sql(`update public.podcast_files_released set status = 'mantido', resolved_at = ${antiga} where podcast_id = $1`, [id]);
    expect((await post(`${base}/${id}/files/cleanup`, editor)).body).toEqual({ ok: true });
    expect(await files.exists(audio)).toBe(false);
    expect((await fila(id))[0]).toMatchObject({ status: "apagado" });
    expect(await registro(id)).toHaveLength(1);

    // ainda usado: continua mantido (e só é reavaliado de novo daqui a uma hora)
    const outro = await episodioComAudio();
    const aula = (await sql(`insert into public.lessons (area, topic, title) values ('PEDIATRIA', 'Asma', 'Asma') returning id`))[0].id;
    await salvaRoteiro(outro.id);
    await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ('${aula}', 'flashcast', 'F', '${outro.audio}')`);
    await sql(`update public.podcast_files_released set status = 'mantido', resolved_at = ${antiga} where podcast_id = $1`, [outro.id]);
    expect((await post(`${base}/${outro.id}/files/cleanup`, editor)).body).toEqual({ ok: true });
    expect(await files.exists(outro.audio)).toBe(true);
    const e = (await sql(`select status, resolved_at > now() - interval '1 minute' as recente from public.podcast_files_released where podcast_id = $1`, [outro.id]))[0];
    expect(e).toMatchObject({ status: "mantido", recente: true });
    // 'mantido' recente (menos de uma hora) não é mexido
    await sql(`delete from public.lesson_materials where lesson_id = '${aula}'`);
    expect((await post(`${base}/${outro.id}/files/cleanup`, editor)).status).toBe(200);
    expect(await files.exists(outro.audio)).toBe(true);
    expect((await fila(outro.id))[0]).toMatchObject({ status: "mantido" });
  });

  it("'mantido' antigo cujo caminho já tem outra entrada aberta não quebra o índice único: só renova a data", async () => {
    const { id, audio } = await episodioComAudio();
    await salvaRoteiro(id);
    await sql(`insert into public.podcast_files_released (podcast_id, storage_path, reason, status, resolved_at) values ($1, $2, 'audio_refeito', 'mantido', now() - interval '3 hours')`, [id, audio]);
    expect((await post(`${base}/${id}/files/cleanup`, editor)).body).toEqual({ ok: true });
    expect(await files.exists(audio)).toBe(false);
    expect((await fila(id)).map((r) => r.status).sort()).toEqual(["apagado", "mantido"]);
  });
});

describe("2ª rodada, achado 4: sempre um aviso em português simples quando a limpeza não termina", () => {
  const SEM_NUMERO = /^(?!.*(9721|migra)).*$/is;
  it("depósito fora do ar: repetir a limpeza, a limpeza depois da edição, tirar fonte, gerar roteiro e apagar episódio devolvem aviso", async () => {
    const { id, audio } = await episodioComAudio(flaky);
    const arq = `podcasts/${id}/src-cccccccccccccccc.pdf`;
    await files.put(arq, Buffer.from("%PDF-1.4"), "application/pdf");
    const fonte = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'F', $2, 9) returning id`, [id, arq]))[0].id;
    falhaAoApagar = true;
    try {
      // edição do roteiro no banco + a rota que a tela chama depois
      await salvaRoteiro(id);
      const depoisDaEdicao = await post(`${flaky}/${id}/files/cleanup`, editor);
      expect(depoisDaEdicao.status).toBe(200);
      expect(depoisDaEdicao.body).toMatchObject({ ok: false, falhas: 1 });
      expect(depoisDaEdicao.body.note).toMatch(/1 arquivo antigo não pôde ser apagado agora.*Nada se perdeu/);
      expect(depoisDaEdicao.body.note).toMatch(SEM_NUMERO);
      const repetir = await post(`${flaky}/files/cleanup`, editor);
      expect(repetir.body).toMatchObject({ ok: false });
      expect(repetir.body.note).toMatch(SEM_NUMERO);
      // tirar a fonte: o arquivo dela e o áudio ficam na fila e o depósito falha
      const tirar = await del(`${flaky}/${id}/sources/${fonte}`, editor);
      expect(tirar.status).toBe(200);
      expect(tirar.body.note).toMatch(/arquivos? antigos? não pôde|não puderam/);
      expect(tirar.body.note).toMatch(SEM_NUMERO);
      // gerar outro roteiro (o servidor limpa por conta própria)
      const gerar = await post(`${flaky}/${id}/script`, editor, { provider: "mock" });
      expect(gerar.status).toBe(200);
      expect(gerar.body.note).toMatch(/Nada se perdeu/);
      // apagar o episódio
      const apagar = await del(`${flaky}/${id}`, admin);
      expect(apagar.body).toMatchObject({ deleted: true });
      expect(apagar.body.aviso).toMatch(/Nada se perdeu/);
      expect(apagar.body.aviso).toMatch(SEM_NUMERO);
    } finally {
      falhaAoApagar = false;
    }
    expect(await files.exists(audio)).toBe(true); // nada se perdeu
    expect((await post(`${base}/files/cleanup`, editor)).body).toEqual({ ok: true });
    expect(await files.exists(audio)).toBe(false);
  });

  it("refazer o áudio com o depósito fora do ar devolve o aviso junto com o episódio", async () => {
    const { id } = await episodioComAudio(flaky);
    const start = await post(`${flaky}/${id}/audio/start`, editor, { provider: "mock" });
    for (let i = 0; i < start.body.parts; i++) expect((await post(`${flaky}/${id}/audio/part`, editor, { job: start.body.job, index: i })).status).toBe(200);
    falhaAoApagar = true;
    let fin;
    try { fin = await post(`${flaky}/${id}/audio/finish`, editor, { job: start.body.job }); } finally { falhaAoApagar = false; }
    expect(fin.status).toBe(200);
    expect(fin.body.id).toBe(id);
    expect(fin.body.note).toMatch(/Nada se perdeu/);
    expect((await post(`${base}/files/cleanup`, editor)).body).toEqual({ ok: true });
  });

  it("todas as mensagens ao dono estão sem número de migração nem termo técnico", async () => {
    const fonte = fs.readFileSync(path.resolve(__dirname, "../../server/podcasts/router.ts"), "utf8");
    const linhas = fonte.split("\n").filter((l) => /const (SQL_ANTIGO|SEM_LIMPEZA) =/.test(l) || /Nada se perdeu/.test(l));
    expect(linhas.length).toBeGreaterThan(0);
    for (const l of linhas) expect(l).not.toMatch(/9721|migra/i);
  });
});

describe("2ª rodada: colar a migração duas vezes (simulação de dupla colagem)", () => {
  it("colar de novo com reserva em andamento não muda a fila, o código nem as permissões, e o fluxo continua igual", async () => {
    const { id, audio } = await episodioComAudio();
    await salvaRoteiro(id);
    const r = await reserva(id);
    const antes = await entrada(id);
    const migracao = fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/20261003009721_podcasts_arquivos_esquecidos.sql"), "utf8");
    await dev.db.exec(migracao);
    await dev.db.exec(migracao);
    expect(await entrada(id)).toEqual(antes);
    const perm = await sql(`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon
                              from pg_proc p where p.proname in ('ch_worker_podcast_files_pending', 'ch_worker_podcast_files_renew', 'ch_worker_podcast_files_done', 'podcast_files_blocked') order by 1`);
    expect(perm).toHaveLength(4);
    for (const f of perm) expect(f, f.proname).toMatchObject({ auth: false, anon: false });
    expect(await renew(r.id, r.token)).toBe("ok");
    await files.remove!([audio]);
    expect(await done([{ id: r.id, token: r.token, ok: true }])).toBe(1);
    expect(await sql(`select count(*)::int n from pg_trigger where tgname like 'podcast_files_%' and not tgisinternal`)).toEqual([{ n: 7 }]);
  });
});

describe("3ª rodada, achado 1: o vencimento usa o relógio real, lido depois de esperar as travas", () => {
  // dentro de UMA transação now() fica congelado no começo dela; é exatamente o que acontece com quem espera uma trava
  const naTransacao = <T,>(fn: (tx: any) => Promise<T>) => dev.db.transaction(fn);

  it("renovar: reserva que venceu enquanto a transação esperava NÃO é renovada (com now() ela seria autorizada já vencida)", async () => {
    const { id } = await episodioComAudio();
    await salvaRoteiro(id);
    const r = await reserva(id);
    const veredito = await naTransacao(async (tx) => {
      // pelo relógio do começo da transação ainda faltava 1 s; 1,6 s depois (espera) ela já venceu de verdade
      await tx.query(`update public.podcast_files_released set reserved_at = transaction_timestamp() - interval '10 minutes' + interval '1 second' where id = $1`, [r.id]);
      await tx.query(`select pg_sleep(1.6)`);
      return (await tx.query(`select public.ch_worker_podcast_files_renew($1, $2, $3) as v`, [EDITOR, r.id, r.token])).rows[0].v;
    });
    expect(veredito).toBe("incompleta");
  });

  it("renovar e reservar gravam a hora REAL (não a do começo da transação)", async () => {
    const { id } = await episodioComAudio();
    await salvaRoteiro(id);
    const [reservada] = await naTransacao(async (tx) => {
      await tx.query(`select pg_sleep(1.3)`);
      const p = (await tx.query(`select public.ch_worker_podcast_files_pending($1, $2) as r`, [EDITOR, id])).rows[0].r;
      const dif = (await tx.query(`select extract(epoch from (reserved_at - transaction_timestamp())) as d from public.podcast_files_released where id = $1`, [p[0].id])).rows[0].d;
      return [{ ...p[0], reservaDepois: Number(dif) }];
    });
    expect(reservada.reservaDepois).toBeGreaterThan(1); // reserva: hora real
    const renovada = await naTransacao(async (tx) => {
      await tx.query(`select pg_sleep(1.3)`);
      const v = (await tx.query(`select public.ch_worker_podcast_files_renew($1, $2, $3) as v`, [EDITOR, reservada.id, reservada.token])).rows[0].v;
      const dif = (await tx.query(`select extract(epoch from (reserved_at - transaction_timestamp())) as d from public.podcast_files_released where id = $1`, [reservada.id])).rows[0].d;
      return { v, dif: Number(dif) };
    });
    expect(renovada.v).toBe("ok");
    expect(renovada.dif).toBeGreaterThan(1); // renovação: hora real
  });
});

describe("3ª rodada, achado 2: recusa de renovação nunca termina em sucesso silencioso", () => {
  const dois = async (url: string) => {
    const { id, audio } = await episodioComAudio(url === spy ? spy : base);
    const arq = `podcasts/${id}/src-${Math.random().toString(16).slice(2, 18).padEnd(16, "0")}.pdf`;
    await files.put(arq, Buffer.from("%PDF-1.4 teste"), "application/pdf");
    await salvaRoteiro(id);
    await sql(`insert into public.podcast_files_released (podcast_id, storage_path, reason) values ($1, $2, 'fonte_tirada')`, [id, arq]);
    return { id, audio, arq };
  };

  it("reserva do 2º arquivo vence SEM uso novo: a limpeza tenta de novo na rodada seguinte e apaga os dois, sem aviso", async () => {
    const { id, audio, arq } = await dois(spy);
    aoApagar = async (keys) => {
      if (!keys.includes(audio)) return;
      await sql(`update public.podcast_files_released set reserved_at = now() - interval '11 minutes' where podcast_id = $1 and storage_path = $2`, [id, arq]);
    };
    try {
      expect((await post(`${spy}/${id}/files/cleanup`, editor)).body).toEqual({ ok: true });
    } finally {
      aoApagar = null;
    }
    expect(await files.exists(audio)).toBe(false);
    expect(await files.exists(arq)).toBe(false);
    expect((await fila(id)).map((r) => r.status)).toEqual(["apagado", "apagado"]);
  });

  it("o banco diz que a reserva está com OUTRA tentativa (ou que o código mudou): nada é apagado e a resposta traz o aviso em português", async () => {
    const { id, audio, arq } = await dois(base);
    const apagados: string[] = [];
    const recusando: ContentDb = { ...db, service: async (fn, args) => (fn === "ch_worker_podcast_files_renew" ? ("outra" as any) : db.service(fn, args)) };
    const srv = await listen({ db: recusando, storage: { ...files, remove: async (keys) => { apagados.push(...keys); return files.remove!(keys); } }, lessons: lessonFiles, mockScript });
    const r = (await post(`${srv}/files/cleanup`, editor)).body;
    expect(apagados).toEqual([]);
    expect(r).toMatchObject({ ok: false });
    expect(r.note).toMatch(/Nada se perdeu/);
    expect(r.note).not.toMatch(/9721|migra/i);
    expect(await files.exists(audio)).toBe(true);
    expect(await files.exists(arq)).toBe(true);
    // a limpeza normal depois (reservas vencem) termina o serviço sem aviso
    await sql(`update public.podcast_files_released set reserved_at = now() - interval '11 minutes' where podcast_id = $1 and status = 'apagando'`, [id]);
    expect((await post(`${base}/files/cleanup`, editor)).body).toEqual({ ok: true });
    expect(await files.exists(audio)).toBe(false);
  });

  it("o banco diz 'incompleta' (reserva vencida) em todas as rodadas: sai das 5 rodadas com aviso, sem apagar às cegas", async () => {
    const { id, audio } = await dois(base);
    const apagados: string[] = [];
    const recusando: ContentDb = {
      ...db,
      service: async (fn, args) => {
        if (fn !== "ch_worker_podcast_files_renew") return db.service(fn, args);
        await sql(`update public.podcast_files_released set reserved_at = now() - interval '11 minutes' where id = $1`, [(args as any).p_id]); // a reserva vence de novo antes da próxima rodada
        return "incompleta" as any;
      },
    };
    const srv = await listen({ db: recusando, storage: { ...files, remove: async (keys) => { apagados.push(...keys); return files.remove!(keys); } }, lessons: lessonFiles, mockScript });
    const r = (await post(`${srv}/files/cleanup`, editor)).body;
    expect(apagados).toEqual([]);
    expect(r).toMatchObject({ ok: false });
    expect(r.note).toMatch(/Nada se perdeu/);
    expect(await files.exists(audio)).toBe(true);
    expect((await post(`${base}/files/cleanup`, editor)).body).toEqual({ ok: true }); // sem o banco recusando, termina
    expect((await fila(id)).every((x) => x.status === "apagado")).toBe(true);
  });

  it("os adaptadores da tela passam o aviso adiante (roteiro, áudio, fonte, episódio)", async () => {
    const api = await import("../novo/app/podcasts/podcastsApi.js");
    const aviso = "A limpeza não terminou. Nada se perdeu.";
    (globalThis as any).fetch = vi.fn(async (url: string) => {
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/audio/start")) return json({ job: "j", parts: 1 });
      if (url.endsWith("/audio/part")) return json({ ok: true });
      if (url.endsWith("/audio/finish")) return json({ id: "x", note: aviso });
      if (url.endsWith("/script")) return json({ podcast: { id: "x" }, warnings: [], note: aviso });
      if (url.includes("/sources/")) return json({ id: "x", note: aviso });
      return json({ deleted: true, aviso });
    });
    const backend: any = { accessToken: async () => "t" };
    expect((await api.generatePodcastScript(backend, "x", "mock", "")).note).toBe(aviso);
    expect((await api.generatePodcastAudio(backend, "x", { provider: "mock", voices: {} })).note).toBe(aviso);
    expect((await api.removeSource(backend, "x", "s")).note).toBe(aviso);
    expect((await api.deletePodcast(backend, "x")).aviso).toBe(aviso);
  });
});
