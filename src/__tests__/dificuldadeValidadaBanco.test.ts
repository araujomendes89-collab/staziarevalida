// @vitest-environment node
/**
 * Migração 10700 (lista da equipe para a dificuldade validada), num Postgres real em memória:
 *  - só a equipe lê; aluno e revisor sem papel de equipe são barrados;
 *  - o filtro "sem dificuldade validada" e os níveis 1 a 5 contam certo; busca por tema e código;
 *  - NADA é calculado: sem cadastro, o nível é nulo;
 *  - o aluno continua sem ver a tabela; ensaio de desfazer e de reaplicar.
 */
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 120_000 });
const ROOT = path.resolve(__dirname, "../..");
const MIGRACAO = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003010700_dificuldade_validada_lista_equipe.sql"), "utf8");
const DESFAZER = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003010700_dificuldade_validada_lista_equipe.desfazer.sql"), "utf8");

let env: StaziaEnv;
let ids: string[];
beforeAll(async () => {
  env = await openStaziaEnv();
  ids = (await env.sql<{ id: string }>(`select id from public.questions where origin = 'official' order by id limit 3`)).map((r) => r.id);
}, 600_000);
afterAll(async () => {
  await env?.close();
}, 60_000);

const list = (uid: string, filters: Record<string, unknown> = {}, limit = 50, offset = 0) =>
  env.rpc<any>(uid, "app_admin_question_difficulties", { p_filters: filters, p_limit: limit, p_offset: offset });

describe("lista de dificuldade validada (só equipe)", () => {
  it("aluno e revisor sem papel de equipe são barrados", async () => {
    await expect(list(USERS.PRO)).rejects.toThrow();
    await expect(list(USERS.TESTE)).rejects.toThrow();
    await expect(list(USERS.REVISOR_PED)).rejects.toThrow();
  });

  it("sem cadastro, nenhuma questão tem nível (nada é calculado) e o filtro 'sem dificuldade' traz todas", async () => {
    const all = await list(USERS.ADMIN);
    expect(all.validated_total).toBe(0);
    expect(all.items.every((i: any) => i.level === null && i.note === null && i.validated_at === null)).toBe(true);
    const none = await list(USERS.ADMIN, { level: "none" });
    expect(none.total).toBe(all.total);
    expect(all.questions_total).toBe(all.total);
  });

  it("cadastro pelo RPC aparece com nível, nota e quem validou; remover volta a 'sem dificuldade'", async () => {
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: ids[0], p_level: 4, p_note: "validada pela banca interna" });
    await env.rpc(USERS.EDITOR, "app_admin_set_question_difficulty", { p_question_id: ids[1], p_level: 2 });
    const l4 = await list(USERS.ADMIN, { level: "4" });
    expect(l4.total).toBe(1);
    expect(l4.items[0]).toMatchObject({ id: ids[0], level: 4, note: "validada pela banca interna" });
    expect(l4.items[0].validated_at).toBeTruthy();
    expect((await list(USERS.EDITOR, { level: "2" })).items.map((i: any) => i.id)).toEqual([ids[1]]);
    const none = await list(USERS.ADMIN, { level: "none", search: "" }, 200);
    expect(none.items.map((i: any) => i.id)).not.toContain(ids[0]);
    expect(none.validated_total).toBe(2);
    expect(none.total).toBe(none.questions_total - 2);
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: ids[0], p_level: null });
    expect((await list(USERS.ADMIN, { level: "4" })).total).toBe(0);
    const code = (await env.sql<any>(`select code from public.questions where id = $1`, [ids[0]]))[0].code;
    expect((await list(USERS.ADMIN, { level: "none", search: code })).items.map((i: any) => i.id)).toContain(ids[0]);
  });

  it("busca por código e por tema (sem acento), por área, e paginação", async () => {
    const row = (await env.sql<any>(`select id, code, topic, area from public.questions where id = $1`, [ids[2]]))[0];
    expect((await list(USERS.ADMIN, { search: row.code })).items.map((i: any) => i.id)).toContain(ids[2]);
    const word = String(row.topic).split(/\s+/)[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
    expect((await list(USERS.ADMIN, { search: word })).items.map((i: any) => i.id)).toContain(ids[2]);
    const area = await list(USERS.ADMIN, { area: row.area });
    expect(area.items.every((i: any) => i.area === row.area)).toBe(true);
    const p1 = await list(USERS.ADMIN, {}, 2, 0);
    const p2 = await list(USERS.ADMIN, {}, 2, 2);
    expect(p1.items).toHaveLength(2);
    expect(p2.items.map((i: any) => i.id).some((id: string) => p1.items.map((i: any) => i.id).includes(id))).toBe(false);
  });

  it("filtro inválido é recusado em português", async () => {
    await expect(list(USERS.ADMIN, { level: "9" })).rejects.toThrow(/inválido/);
  });

  it("o aluno não lê a tabela nem executa a função de leitura em lote", async () => {
    await expect(env.sqlAs(USERS.PRO, `select * from public.question_difficulty_review`)).resolves.toEqual([]);
    await expect(env.sqlAs("00000000-0000-4000-8000-000000000000", `select public.app_admin_question_difficulties('{}'::jsonb, 5, 0)`)).rejects.toThrow();
  });
});

describe("ensaio de desfazer (reaplica no fim)", () => {
  it("desfazer apaga só a função de leitura e não toca nos dados; reaplicar funciona", async () => {
    await env.rpc(USERS.ADMIN, "app_admin_set_question_difficulty", { p_question_id: ids[1], p_level: 3 });
    await env.dev.db.exec(DESFAZER);
    expect((await env.sql(`select 1 from pg_proc where proname = 'app_admin_question_difficulties'`)).length).toBe(0);
    expect((await env.sql(`select level from public.question_difficulty_review where question_id = $1`, [ids[1]]))[0].level).toBe(3);
    await env.dev.db.exec(MIGRACAO);
    expect((await list(USERS.ADMIN, { level: "3" })).items.map((i: any) => i.id)).toEqual([ids[1]]);
  });
});
