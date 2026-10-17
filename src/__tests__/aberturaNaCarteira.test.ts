// @vitest-environment node
/**
 * Abertura do Tutor escrita pela IA paga pela CARTEIRA do aluno (decisão do dono de 17/10/2026; migração 20261003013807).
 *  - chave da carteira DESLIGADA: nada muda para o aluno (a fala da IA entra como antes, a cota de mensagens não é tocada); a carteira
 *    só anota;
 *  - chave LIGADA: reservar → confirmar só quando a conversa usa a fala da IA → devolver quando não usa; carteira recusou = fala de
 *    reserva, sem chamar a IA;
 *  - abertura PREPARADA: preparar não desconta (custo da casa); usar na conversa desconta.
 * Banco local com todas as migrações e IA simulada (sem rede).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import type { StructuredRequest } from "../../server/contentHub/ai/provider";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { naturalOpening, prepararAbertura } from "../../server/tutor/opening";
import { aceitarTermos } from "./helpers/aceites";

const ROOT = path.resolve(__dirname, "../..");
const ADMIN = "00000000-0000-4000-8000-0000000002a7";
const ANA = "00000000-0000-4000-8000-0000000002b7";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "abertura-carteira-"));
let dev: DevDatabase;
let db: ContentDb;
const calls: StructuredRequest[] = [];
let respond: (req: StructuredRequest) => unknown = () => ({ fala: "Começando: me diz o que quer estudar." });
const deps: any = { mockRespond: (req: StructuredRequest) => { calls.push(req); return respond(req); }, log: (m: string) => { if (process.env.DEBUG_AC) console.error("LOG", m); } };
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  (await dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))).rows;
  }))[0].r;
const start = async (uid: string, topic: string, personality = "tranquila") => (await rpc(uid, "app_tutor_start", "livre", topic, null, null, personality)).id as string;
const firstMessage = async (sid: string) => (await sql(`select id, content, meta from public.tutor_messages where session_id = $1 order by id limit 1`, [sid]))[0];
const movimentos = async (uid: string) =>
  sql(`select recurso, modo, situacao, creditos::float8 creditos from public.carteira_movimentos where user_id = $1 and recurso = 'tutor_abertura' order by id`, [uid]);
const ligar = (on: boolean) => sql(`update public.direitos_config set cadeados_ligados = $1, teto_custo_dia_usd = null`, [on]);
const limpar = async () => {
  await sql(`delete from public.carteira_movimentos`);
  await sql(`delete from public.tutor_opening_ready`);
  await sql(`delete from public.tutor_rate_limits`);
};

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  deps.db = db;
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'ana@t.dev')`, [ADMIN, ANA]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id = $1`, [ANA]);
  for (const uid of [ADMIN, ANA]) await aceitarTermos(dev.db, uid);
  await sql(`update public.ch_flags set value = true where key in ('enabled', 'ai_enabled')`);
  await rpc(ADMIN, "app_admin_tutor_save_config", { enabled: true, requires_pro: true, max_profanity: "moderate" }, "Testes da abertura paga pela carteira.");
  process.env.TUTOR_AI_PROVIDER = "mock";
  process.env.TUTOR_SETTINGS_TTL_MS = "0";
  process.env.TUTOR_ABERTURA_PRONTA = "1";
}, 300_000);
afterAll(async () => {
  delete process.env.TUTOR_SETTINGS_TTL_MS;
  delete process.env.TUTOR_ABERTURA_PRONTA;
  await ligar(false).catch(() => undefined);
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(async () => {
  calls.length = 0;
  respond = () => ({ fala: "Começando: me diz o que quer estudar." });
  await limpar();
});

describe("abertura do Tutor na carteira do aluno", () => {
  it("chave DESLIGADA: a abertura pela IA entra como antes, a cota de mensagens não muda e a carteira só anota", async () => {
    await ligar(false);
    const mensagensAntes = (await sql(`select count(*)::int n from public.ai_usage_ledger where user_id = $1 and interactions = 1`, [ANA]))[0].n;
    respond = () => ({ fala: "Sepse hoje. Diagnóstico ou conduta primeiro?" });
    const sid = await start(ANA, "Sepse");
    const o = await naturalOpening(deps, ANA, sid, 3000);
    expect(o?.content).toBe("Sepse hoje. Diagnóstico ou conduta primeiro?");
    expect(calls).toHaveLength(1);
    expect((await sql(`select count(*)::int n from public.ai_usage_ledger where user_id = $1 and interactions = 1`, [ANA]))[0].n).toBe(mensagensAntes);
    expect((await movimentos(ANA)).map((m: any) => `${m.modo}:${m.situacao}`)).toEqual(["sombra:confirmado"]);
  });

  it("chave LIGADA: a abertura usada desconta da carteira (reservar → confirmar)", async () => {
    await ligar(true);
    const antes = (await rpc(ANA, "app_minha_carteira")).saldo;
    respond = () => ({ fala: "Asma hoje. Crise ou controle primeiro?" });
    const sid = await start(ANA, "Asma");
    const o = await naturalOpening(deps, ANA, sid, 3000);
    expect(o?.content).toBe("Asma hoje. Crise ou controle primeiro?");
    const mov = await movimentos(ANA);
    expect(mov).toHaveLength(1);
    expect(mov[0]).toMatchObject({ modo: "ligado", situacao: "confirmado" });
    expect(mov[0].creditos).toBeGreaterThan(0);
    const depois = (await rpc(ANA, "app_minha_carteira")).saldo;
    expect(JSON.stringify(depois)).not.toBe(JSON.stringify(antes));
    await ligar(false);
  });

  it("chave LIGADA e carteira recusa (teto do dia): fala de reserva, sem chamar a IA e sem desconto", async () => {
    await ligar(true);
    await sql(`update public.direitos_config set teto_custo_dia_usd = 0`);
    const sid = await start(ANA, "Dengue");
    const reserva = (await firstMessage(sid)).content;
    expect(await naturalOpening(deps, ANA, sid, 3000)).toBeNull();
    expect(calls).toHaveLength(0);
    expect((await firstMessage(sid)).content).toBe(reserva);
    expect(await movimentos(ANA)).toEqual([]);
    await ligar(false);
  });

  it("chave LIGADA e a IA não serve (fala barrada): devolve tudo, nada descontado", async () => {
    await ligar(true);
    respond = () => ({ fala: "" });
    const sid = await start(ANA, "Malária");
    const reserva = (await firstMessage(sid)).content;
    expect(await naturalOpening(deps, ANA, sid, 3000)).toBeNull();
    expect((await firstMessage(sid)).content).toBe(reserva);
    expect((await movimentos(ANA)).map((m: any) => m.situacao)).toEqual(["devolvido"]);
    await ligar(false);
  });

  it("abertura PREPARADA: preparar não desconta; usar na conversa desconta; preparada e não usada não desconta", async () => {
    await ligar(true);
    respond = () => ({ fala: "Pneumonia: bora montar o raciocínio pelos sinais de gravidade, um por um." });
    expect(await prepararAbertura(deps, ANA, { personality: "tranquila", mode: "livre", topic: "Pneumonia" })).toBe(true);
    expect(await movimentos(ANA)).toEqual([]); // preparada e ainda não usada: custo da casa, nada na carteira
    calls.length = 0;
    const sid = await start(ANA, "Pneumonia");
    const o = await naturalOpening(deps, ANA, sid, 3000);
    expect(o?.content).toBe("Pneumonia: bora montar o raciocínio pelos sinais de gravidade, um por um.");
    expect(calls).toHaveLength(0); // a fala pronta entrou sem nova chamada
    const mov = await movimentos(ANA);
    expect(mov).toHaveLength(1);
    expect(mov[0]).toMatchObject({ modo: "ligado", situacao: "confirmado" });
    await ligar(false);
  });

  it("custo da preparada vem do registro de custos; visitante e aluno não chamam as funções do servidor", async () => {
    respond = () => ({ fala: "Tuberculose na pauta. Diagnóstico ou tratamento?" });
    await prepararAbertura(deps, ANA, { personality: "tranquila", mode: "livre", topic: "Tuberculose" });
    const r = (await sql(`select r.id, l.estimated_cost_usd::float8 c from public.tutor_opening_ready r left join public.ai_usage_ledger l on l.id = r.ledger_id where r.user_id = $1`, [ANA]))[0];
    expect(Number((await sql(`select public.ch_worker_tutor_opening_ready_custo($1, $2) c`, [ANA, r.id]))[0].c ?? 0)).toBe(Number(r.c ?? 0));
    await expect(rpc(ANA, "ch_worker_tutor_opening_ready_custo", ANA, r.id)).rejects.toThrow();
    await expect(rpc(ANA, "ch_worker_carteira_reservar", ANA, "tutor_abertura", "abertura:aluno-tenta", null, null)).rejects.toThrow();
  });

  it("migração colada de novo não muda nada; desfazer volta a recusar o recurso; colar de novo volta a aceitar", async () => {
    const mig = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003013807_abertura_na_carteira.sql"), "utf8");
    const undo = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013807_abertura_na_carteira.desfazer.sql"), "utf8");
    const def = async () => (await sql(`select pg_get_functiondef('public.ch_worker_carteira_reservar(uuid,text,text,uuid,integer)'::regprocedure) d`))[0].d;
    const d1 = await def();
    await dev.db.exec(mig);
    expect(await def()).toBe(d1);
    await dev.db.exec(undo);
    await expect(sql(`select public.ch_worker_carteira_reservar($1, 'tutor_abertura', 'abertura:depois-de-desfazer', null, null)`, [ANA])).rejects.toThrow(/Recurso inválido/);
    await dev.db.exec(undo); // de novo, sem erro
    await dev.db.exec(mig);
    expect(await def()).toBe(d1);
  });
});
