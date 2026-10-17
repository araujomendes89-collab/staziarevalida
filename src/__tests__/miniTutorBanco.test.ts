// @vitest-environment node
/**
 * Mini Tutor no servidor (migração 20261003013630, revisão de 17/10/2026): a trava do simulado em andamento e o limite de pistas por
 * QUESTÃO valem no banco, não só na tela. Banco local (PGlite com todas as migrações), nada remoto.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { aceitarTermos } from "./helpers/aceites";

const ROOT = path.resolve(__dirname, "../..");
const SQL = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003013630_mini_tutor.sql"), "utf8");
const UNDO = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013630_mini_tutor.desfazer.sql"), "utf8");
const S1 = "00000000-0000-4000-8000-0000000000b1";
const S2 = "00000000-0000-4000-8000-0000000000b2";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mini-tutor-"));
let dev: DevDatabase;
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    const r = await tx.query<any>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)));
    return r.rows[0].r;
  });
const comecar = (uid: string, q: string | null, modo = "questao") => rpc(uid, "app_tutor_start", modo, null, q, null, null);
const simulado = async (uid: string, ids: string[], entregue = false) =>
  (await sql(`insert into public.practice_sessions (user_id, kind, question_ids, finished_at) values ($1, 'simulado', $2, ${entregue ? "now()" : "null"}) returning id`, [uid, ids]))[0].id as string;
const sessao = async (id: string) => (await sql(`select question_id, question_state, hint_level from public.tutor_sessions where id = $1`, [id]))[0];
let Q: string[] = [];

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  await sql(`insert into auth.users (id, email) values ($1, 'mini1@t.dev'), ($2, 'mini2@t.dev')`, [S1, S2]);
  for (const uid of [S1, S2]) await aceitarTermos(dev.db, uid);
  await sql(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id in ($1, $2)`, [S1, S2]);
  await sql(`update public.tutor_config set enabled = true`);
  Q = (await sql(`select id from public.questions where origin = 'official' and status <> 'annulled' and correct_option is not null order by id limit 6`)).map((r) => r.id);
  await dev.db.exec(SQL); // pode ser colada de novo (a migração já entrou com as outras)
}, 300_000);
afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("simulado em andamento (decisão 3) no servidor", () => {
  it("conversa nova numa questão do simulado aberto é recusada; entregue, libera", async () => {
    const sim = await simulado(S1, [Q[0]]);
    await expect(comecar(S1, Q[0])).rejects.toThrow(/depois que você entregar o simulado/);
    // outro aluno, sem simulado, conversa normalmente sobre a mesma questão
    expect((await sessao((await comecar(S2, Q[0])).id)).question_id).toBe(Q[0]);
    await sql(`update public.practice_sessions set finished_at = now() where id = $1`, [sim]);
    const s = await comecar(S1, Q[0]);
    expect((await sessao(s.id)).question_id).toBe(Q[0]);
  });

  it("conversa que já existia não sobe pista nem mostra resolução enquanto o simulado está aberto", async () => {
    const s = await comecar(S1, Q[1]);
    const sim = await simulado(S1, [Q[1]]);
    await expect(sql(`update public.tutor_sessions set hint_level = hint_level + 1 where id = $1`, [s.id])).rejects.toThrow(/entregar o simulado/);
    await expect(sql(`update public.tutor_sessions set question_state = 'revealed', hint_level = 5 where id = $1`, [s.id])).rejects.toThrow(/entregar o simulado/);
    // o resto da conversa segue (encerrar, mexer em outras colunas)
    await sql(`update public.tutor_sessions set last_message_at = now() where id = $1`, [s.id]);
    await sql(`update public.practice_sessions set finished_at = now() where id = $1`, [sim]);
    await sql(`update public.tutor_sessions set hint_level = 1 where id = $1`, [s.id]);
    expect((await sessao(s.id)).hint_level).toBe(1);
  });

  it("o sorteio de questão (modo questão e próxima questão) pula o simulado aberto", async () => {
    const pick = (await sql(`select public.tutor_pick_question($1, 'questao', 3::smallint, '{}', null) q`, [S2]))[0].q as string;
    expect(pick).toBeTruthy();
    await simulado(S2, [pick]);
    const s = await comecar(S2, null);
    const q = (await sessao(s.id)).question_id;
    expect(q).toBeTruthy();
    expect(q).not.toBe(pick);
    for (const f of ["public.app_tutor_start(text, text, text, jsonb, text)", "public.tutor_next_for(uuid, uuid)"]) {
      expect((await sql(`select pg_get_functiondef($1::regprocedure) d`, [f]))[0].d).toContain("tutor_simulado_aberto_ids(v_user)");
    }
  });

  it("simulado entregue ou abandonado há mais de 30 dias não trava", async () => {
    await simulado(S1, [Q[2]], true);
    const velho = await simulado(S1, [Q[3]]);
    await sql(`update public.practice_sessions set started_at = now() - interval '31 days' where id = $1`, [velho]);
    expect((await sql(`select public.tutor_simulado_aberto_ids($1) ids`, [S1]))[0].ids).not.toEqual(expect.arrayContaining([Q[2]]));
    await expect(comecar(S1, Q[2])).resolves.toBeTruthy();
    await expect(comecar(S1, Q[3])).resolves.toBeTruthy();
  });
});

describe("pistas contadas por questão (fechar e abrir não zera)", () => {
  it("conversa nova na mesma questão aberta herda o maior nível de pista das últimas 24 h, até 4", async () => {
    const a = await comecar(S2, Q[4]);
    expect((await sessao(a.id)).hint_level).toBe(0);
    await sql(`update public.tutor_sessions set hint_level = 3 where id = $1`, [a.id]);
    await rpc(S2, "app_tutor_close", a.id);
    const b = await comecar(S2, Q[4]);
    expect((await sessao(b.id)).hint_level).toBe(3);
    expect(b.hint_level).toBe(3); // a tela recebe o nível ao abrir a conversa
    await sql(`update public.tutor_sessions set hint_level = 5 where id = $1`, [b.id]);
    expect((await sessao((await comecar(S2, Q[4])).id)).hint_level).toBe(4); // a 5ª (resolução) nunca é herdada
    // outra questão, outro aluno ou conversa antiga: começa do zero
    expect((await sessao((await comecar(S2, Q[5])).id)).hint_level).toBe(0);
    expect((await sessao((await comecar(S1, Q[4])).id)).hint_level).toBe(0);
    await sql(`update public.tutor_sessions set created_at = now() - interval '25 hours' where user_id = $1 and question_id = $2`, [S2, Q[4]]);
    expect((await sessao((await comecar(S2, Q[4])).id)).hint_level).toBe(0);
  });
});

describe("segurança e desfazer", () => {
  it("o aluno não chama as funções internas", async () => {
    await expect(rpc(S1, "tutor_simulado_aberto_ids", S1)).rejects.toThrow(/permission denied|permissão negada/i);
  });

  it("desfazer volta ao desenho de antes e a migração pode ser colada de novo", async () => {
    await dev.db.exec(UNDO);
    expect(await sql(`select 1 from pg_trigger where tgname = 'tutor_sessions_mini_tutor_guard'`)).toHaveLength(0);
    expect((await sql(`select pg_get_functiondef('public.app_tutor_start(text, text, text, jsonb, text)'::regprocedure) d`))[0].d).not.toContain("tutor_simulado_aberto_ids");
    await simulado(S1, [Q[5]]);
    await expect(comecar(S1, Q[5])).resolves.toBeTruthy();
    await dev.db.exec(SQL);
    await dev.db.exec(SQL);
    await expect(comecar(S1, Q[5])).rejects.toThrow(/entregar o simulado/);
  });
});
