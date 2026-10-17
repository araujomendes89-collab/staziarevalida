// @vitest-environment node
/**
 * ABERTURA PREPARADA na entrada do Tutor (migração 20261003013805, pedido do dono de 17/10/2026: "mais de 90% das aberturas vindas
 * da IA, sem o aluno esperar mais que hoje"). Enquanto o aluno escolhe professor e modo, o servidor prepara a abertura daquela escolha
 * (mesmo limite 'tutor_opening', mesmas conferências, custo da casa); quando a conversa nasce com a mesma escolha, a fala pronta entra
 * na hora. E os dois achados da auditoria de segurança deste ramo: segredo do cron em tempo constante e relatório da ponte uma vez só.
 * Banco local e IA simulada (sem rede).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import type { StructuredRequest } from "../../server/contentHub/ai/provider";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { createTutorRouter, segredoDoCronConfere } from "../../server/tutor/router";
import { naturalOpening, prepararAbertura } from "../../server/tutor/opening";
import { aceitarTermos } from "./helpers/aceites";

const ADMIN = "00000000-0000-4000-8000-0000000001a7";
const ANA = "00000000-0000-4000-8000-0000000001b7";
const BIA = "00000000-0000-4000-8000-0000000001c7";
const CAIO = "00000000-0000-4000-8000-0000000001d7"; // sem o aceite do Tutor
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-abertura-pronta-"));
let dev: DevDatabase;
let db: ContentDb;
let server: Server;
let base: string;
const tokens: Record<string, string> = {};
const calls: StructuredRequest[] = [];
let respond: (req: StructuredRequest) => unknown = () => ({ fala: "Começando: me diz o que quer estudar." });
const deps: any = { mockRespond: (req: StructuredRequest) => { calls.push(req); return respond(req); }, log: (m: string) => { if (process.env.DEBUG_PRONTA) console.error(m); } };
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  (await dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))).rows;
  }))[0].r;
const start = async (uid: string, mode: string, personality: string, topic: string | null = null, context: Record<string, unknown> | null = null) =>
  (await rpc(uid, "app_tutor_start", mode, topic, null, context, personality)).id as string;
const firstMessage = async (sid: string) => (await sql(`select id, content, meta from public.tutor_messages where session_id = $1 order by id limit 1`, [sid]))[0];
const prepare = (uid: string, body: Record<string, unknown>) =>
  fetch(`${base}/opening/prepare`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens[uid]}` }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const limpar = async (uid: string) => {
  await sql(`delete from public.tutor_opening_ready where user_id = $1`, [uid]);
  await sql(`delete from public.tutor_rate_limits where user_id = $1`, [uid]);
};

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  deps.db = db;
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'ana@t.dev'), ($3, 'bia@t.dev'), ($4, 'caio@t.dev')`, [ADMIN, ANA, BIA, CAIO]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id in ($1, $2, $3)`, [ANA, BIA, CAIO]);
  for (const uid of [ADMIN, ANA, BIA]) await aceitarTermos(dev.db, uid);
  for (const uid of [ANA, BIA, CAIO]) tokens[uid] = await dev.createSession(uid);
  await sql(`update public.ch_flags set value = true where key in ('enabled', 'ai_enabled')`);
  await rpc(ADMIN, "app_admin_tutor_save_config", { enabled: true, requires_pro: true, max_profanity: "moderate" }, "Testes da abertura preparada do Tutor.");
  process.env.TUTOR_AI_PROVIDER = "mock";
  process.env.TUTOR_SETTINGS_TTL_MS = "0";
  process.env.TUTOR_ABERTURA_PRONTA = "1"; // com a IA simulada, a preparação só liga com =1
  delete process.env.DETERMINISTIC_TUTOR;
  const app = express();
  app.use(express.json());
  app.use("/api/tutor", createTutorRouter(deps));
  server = await new Promise<Server>((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  base = `http://127.0.0.1:${(server.address() as any).port}/api/tutor`;
}, 300_000);
afterAll(async () => {
  delete process.env.TUTOR_SETTINGS_TTL_MS;
  delete process.env.TUTOR_ABERTURA_PRONTA;
  await new Promise((r) => server?.close(r));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(() => {
  calls.length = 0;
  respond = () => ({ fala: "Começando: me diz o que quer estudar." });
});

describe("abertura preparada na entrada do Tutor", () => {
  it("prepara na entrada e, quando a conversa nasce com a mesma escolha, a fala pronta troca a reserva na hora (sem nova chamada à IA)", async () => {
    await limpar(ANA);
    respond = () => ({ fala: "Sepse na pauta. Diagnóstico ou conduta primeiro, você decide." });
    const r = await prepare(ANA, { personality: "tranquila", mode: "livre", topic: "Sepse" });
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toHaveLength(1);
    // a IA da preparação recebe a ficha e o contexto, como a abertura de sempre (sem enunciado nem alternativas)
    expect(calls[0].promptId).toBe("tutor_abertura");
    expect(calls[0].input).toMatch(/"tema":"Sepse"/);
    const pronta = (await sql(`select id, content, emotion, ledger_id from public.tutor_opening_ready where user_id = $1`, [ANA]))[0];
    expect(pronta.content).toBe("Sepse na pauta. Diagnóstico ou conduta primeiro, você decide.");

    calls.length = 0;
    const sid = await start(ANA, "livre", "tranquila", "Sepse");
    const reserva = (await firstMessage(sid)).content;
    const o = await naturalOpening(deps, ANA, sid, 3000);
    expect(o?.content).toBe("Sepse na pauta. Diagnóstico ou conduta primeiro, você decide.");
    expect(calls).toHaveLength(0);
    const m = await firstMessage(sid);
    expect(m.content).toBe(o!.content);
    expect(m.meta).toMatchObject({ opening: true, generated: true, origem: "pronta", reserve: reserva, ready_id: Number(pronta.id) });
    // a conversa adota o humor do dia da preparação; a fala vai para a memória das aberturas; a preparação fica usada
    const s = (await sql(`select emotion from public.tutor_sessions where id = $1`, [sid]))[0];
    expect(s.emotion.session_mood).toBe(pronta.emotion.session_mood);
    expect(await sql(`select kind, content from public.tutor_recent_openings where session_id = $1`, [sid])).toEqual([{ kind: "abertura", content: o!.content }]);
    expect((await sql(`select used_session from public.tutor_opening_ready where id = $1`, [pronta.id]))[0].used_session).toBe(sid);
    // e não troca de novo
    expect(await naturalOpening(deps, ANA, sid, 3000)).toBeNull();
  });

  it("modo questão: a questão é sorteada quando a conversa nasce e a fala preparada (sem a questão) serve a ela", async () => {
    await limpar(ANA);
    respond = () => ({ fala: "Hora do treino. Lê inteiro antes de marcar qualquer coisa." });
    expect((await prepare(ANA, { personality: "durao", mode: "questao" })).body.ok).toBe(true);
    // a IA da preparação não recebe questão nenhuma
    expect(calls[0].input).not.toMatch(/alternativ|enunciado/i);
    calls.length = 0;
    const sid = await start(ANA, "questao", "durao");
    expect((await sql(`select context_type, question_id is not null as tem from public.tutor_sessions where id = $1`, [sid]))[0]).toEqual({ context_type: "question", tem: true });
    const o = await naturalOpening(deps, ANA, sid, 3000);
    expect(o?.content).toBe("Hora do treino. Lê inteiro antes de marcar qualquer coisa.");
    expect(calls).toHaveLength(0);
  });

  it("custo da casa: a preparação vai para o registro sem gastar a cota de interações (usada ou não)", async () => {
    await limpar(BIA);
    const antes = (await sql(`select coalesce(sum(requests), 0)::int n from public.ai_usage where user_id = $1`, [BIA]))[0].n;
    respond = () => ({ fala: "Dengue hoje. Começa me dizendo o que separa o grupo B do C." });
    expect((await prepare(BIA, { personality: "durona", mode: "livre", topic: "Dengue" })).body.ok).toBe(true);
    const led = await sql(`select feature, interactions, session_id, persona, meta from public.ai_usage_ledger where user_id = $1 and meta ->> 'kind' = 'abertura_pronta'`, [BIA]);
    expect(led).toHaveLength(1);
    expect(led[0]).toMatchObject({ feature: "tutor_text", interactions: 0, session_id: null, persona: "durona", meta: { kind: "abertura_pronta", casa: true, ok: true, calls: 1 } });
    expect((await sql(`select coalesce(sum(requests), 0)::int n from public.ai_usage where user_id = $1`, [BIA]))[0].n).toBe(antes);
  });

  it("escolha diferente da preparada: a fala pronta não entra (a IA cria a abertura na hora, como antes)", async () => {
    await limpar(ANA);
    respond = () => ({ fala: "Tuberculose: me diz o primeiro exame que você pediria." });
    expect((await prepare(ANA, { personality: "durao", mode: "livre", topic: "Tuberculose" })).body.ok).toBe(true);
    calls.length = 0;
    respond = () => ({ fala: "Anafilaxia, coisa séria. Qual é a primeira coisa que você faz?" });
    // outro tema
    const sid = await start(ANA, "livre", "durao", "Anafilaxia");
    const o = await naturalOpening(deps, ANA, sid, 3000);
    expect(o?.content).toBe("Anafilaxia, coisa séria. Qual é a primeira coisa que você faz?");
    expect(calls).toHaveLength(1);
    expect((await firstMessage(sid)).meta.origem).toBe("na_hora");
    // outro professor com o mesmo tema também não usa
    calls.length = 0;
    const sid2 = await start(ANA, "livre", "durona", "Tuberculose");
    respond = () => ({ fala: "Tuberculose de novo na roda. Qual exame primeiro?" });
    await naturalOpening(deps, ANA, sid2, 3000);
    expect((await firstMessage(sid2)).meta.origem).toBe("na_hora");
    expect((await sql(`select used_at from public.tutor_opening_ready where user_id = $1 and personality_id = 'durao'`, [ANA]))[0].used_at).toBeNull();
  });

  it("ainda preparando quando a conversa nasce: espera por ela dentro do mesmo tempo; não ficou pronta a tempo, fica a reserva", async () => {
    await limpar(ANA);
    // preparação em andamento (reservada, sem fala ainda), como se a IA ainda estivesse respondendo
    const id = (await sql(`insert into public.tutor_opening_ready (user_id, personality_id, mode, topic, question_state, emotion)
                            values ($1, 'acolhedor', 'livre', 'Sepse', 'none', '{"session_mood": "good", "frustration": 0}') returning id`, [ANA]))[0].id;
    const sid = await start(ANA, "livre", "acolhedor", "Sepse");
    setTimeout(() => void sql(`select public.ch_worker_tutor_opening_prep_save($1, $2, $3, '{"calls": 0}')`, [ANA, id, "Sepse, então. Explica pra mim, que eu tô economizando energia."]), 500);
    const t0 = Date.now();
    const o = await naturalOpening(deps, ANA, sid, 3000);
    expect(o?.content).toBe("Sepse, então. Explica pra mim, que eu tô economizando energia.");
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(calls).toHaveLength(0);

    // preparação que não termina: espera o tempo e a reserva fica (sem chamar a IA no fim do tempo)
    await sql(`insert into public.tutor_opening_ready (user_id, personality_id, mode, topic, question_state, emotion) values ($1, 'acolhedor', 'livre', 'Dengue', 'none', '{}')`, [ANA]);
    const sid2 = await start(ANA, "livre", "acolhedor", "Dengue");
    const reserva = (await firstMessage(sid2)).content;
    const t1 = Date.now();
    expect(await naturalOpening(deps, ANA, sid2, 1000)).toBeNull();
    expect(Date.now() - t1).toBeLessThan(1500);
    expect(calls).toHaveLength(0);
    expect((await firstMessage(sid2)).content).toBe(reserva);
  });

  it("a fala pronta é conferida de novo na conversa: igual ao que o aluno já ouviu, a IA faz outra na hora", async () => {
    await limpar(BIA);
    respond = () => ({ fala: "Pré-eclâmpsia hoje. Qual sinal te faz correr?" });
    expect((await prepare(BIA, { personality: "tranquila", mode: "livre", topic: "Pré-eclâmpsia" })).body.ok).toBe(true);
    // entre a preparação e a conversa, ela ouviu exatamente essa fala em outra conversa
    await sql(`insert into public.tutor_recent_openings (user_id, personality_id, kind, content) values ($1, 'tranquila', 'abertura', 'Pré-eclâmpsia hoje. Qual sinal te faz correr?')`, [BIA]);
    calls.length = 0;
    respond = () => ({ fala: "Gestante com pressão alta: o que você olha primeiro?" });
    const sid = await start(BIA, "livre", "tranquila", "Pré-eclâmpsia");
    const o = await naturalOpening(deps, BIA, sid, 3000);
    // (as falas do teste fogem das reservas do banco: a reserva também conta como "já ouvida")
    expect(o?.content).toBe("Gestante com pressão alta: o que você olha primeiro?");
    expect(calls).toHaveLength(1);
  });

  it("limites: a mesma escolha não prepara duas vezes; o limite 'tutor_opening' vale; teto de 15 preparações sem uso no dia", async () => {
    await limpar(BIA);
    expect((await prepare(BIA, { personality: "durao", mode: "perguntas" })).body.ok).toBe(true);
    expect((await prepare(BIA, { personality: "durao", mode: "perguntas" })).body.ok).toBe(false); // já pronta
    expect(calls).toHaveLength(1);

    // o mesmo limite de frequência da abertura de sempre (aqui, 2 por minuto)
    await limpar(BIA);
    await sql(`update public.tutor_config set voice_rate_limits = voice_rate_limits || '{"tutor_opening_per_minute": 2}'::jsonb`);
    try {
      calls.length = 0;
      const temas = ["Sepse", "Dengue", "Asma"];
      const oks = [];
      for (const t of temas) oks.push((await prepare(BIA, { personality: "durona", mode: "livre", topic: t })).body.ok);
      expect(oks).toEqual([true, true, false]);
      expect(calls).toHaveLength(2);
    } finally {
      await sql(`update public.tutor_config set voice_rate_limits = voice_rate_limits || '{"tutor_opening_per_minute": 100000}'::jsonb`);
    }

    // teto de preparações sem uso no dia: 15
    await limpar(BIA);
    await sql(`insert into public.tutor_opening_ready (user_id, personality_id, mode, topic, question_state, content, ready_at)
               select $1, 'durona', 'livre', 'Tema ' || g, 'none', 'Fala ' || g, now() from generate_series(1, 15) g`, [BIA]);
    calls.length = 0;
    expect((await prepare(BIA, { personality: "durona", mode: "livre", topic: "Outro" })).body.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("sem aceite do Tutor, escolha inválida ou sem login: não prepara nem chama a IA", async () => {
    expect((await prepare(CAIO, { personality: "durona", mode: "livre" })).body.ok).toBe(false);
    expect((await prepare(ANA, { personality: "militar", mode: "livre" })).body.ok).toBe(false);
    expect((await prepare(ANA, { personality: "durona", mode: "qualquer" })).body.ok).toBe(false);
    expect((await prepare(ANA, { personality: "Durona; drop", mode: "livre" })).status).toBe(400);
    expect((await prepare(ANA, { personality: "durona", mode: "livre", question_id: "x' or 1=1" })).status).toBe(400);
    // conversar sobre uma questão que ela nunca respondeu: não prepara
    expect((await prepare(ANA, { personality: "durona", mode: "livre", question_id: "nao-respondida-123" })).body.ok).toBe(false);
    const semLogin = await fetch(`${base}/opening/prepare`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personality: "durona", mode: "livre" }) });
    expect(semLogin.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("desligada (TUTOR_ABERTURA_PRONTA=0): não prepara; e a função direta também nunca lança", async () => {
    process.env.TUTOR_ABERTURA_PRONTA = "0";
    try {
      expect(await prepararAbertura(deps, ANA, { personality: "durona", mode: "livre", topic: "Sepse 2" })).toBe(false);
      expect(calls).toHaveLength(0);
    } finally {
      process.env.TUTOR_ABERTURA_PRONTA = "1";
    }
    expect(await prepararAbertura({ ...deps, db: { service: async () => { throw new Error("banco fora"); } } }, ANA, { personality: "durona", mode: "livre" })).toBe(false);
  });

  it("as preparações ficam fechadas: RLS ligado, sem acesso para o aluno, funções só do servidor", async () => {
    expect((await sql(`select relrowsecurity from pg_class where oid = 'public.tutor_opening_ready'::regclass`))[0].relrowsecurity).toBe(true);
    await expect(rpc(ANA, "ch_worker_tutor_opening_prep_claim", ANA, "durona", "livre", null, null, null)).rejects.toThrow(/permission denied/);
    await expect(rpc(ANA, "ch_worker_tutor_ready_opening", ANA, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(/permission denied/);
    await expect(dev.db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      return tx.query(`select * from public.tutor_opening_ready`);
    })).rejects.toThrow(/permission denied/);
  });
});

describe("auditoria de segurança de 17/10 (ramo do Tutor)", () => {
  it("segredo da tarefa agendada: confere em tempo constante e só com o segredo exato", () => {
    expect(segredoDoCronConfere("Bearer cron-teste", "cron-teste")).toBe(true);
    expect(segredoDoCronConfere("Bearer cron-test", "cron-teste")).toBe(false);
    expect(segredoDoCronConfere("Bearer cron-testeX", "cron-teste")).toBe(false);
    expect(segredoDoCronConfere("cron-teste", "cron-teste")).toBe(false);
    expect(segredoDoCronConfere(undefined, "cron-teste")).toBe(false);
    expect(segredoDoCronConfere("Bearer ", "")).toBe(false);
    expect(segredoDoCronConfere("Bearer undefined", undefined)).toBe(false);
  });

  it("relatório da ponte: o mesmo resumo grava uma vez só", async () => {
    const sid = await start(ANA, "livre", "durona", "Ponte");
    const entrada = { feature: "tutor_voice_gemini", provider: "google-vertex", model: "gemini-3.8-live", estimated_cost_usd: 0.01, meta: { voice_call: "teste-ponte", via: "vertex-ponte" } };
    const uma = await sql(`select public.ch_worker_tutor_ponte_uso($1, $2, $3, $4) r`, [ANA, sid, "a".repeat(40), JSON.stringify(entrada)]);
    const duas = await sql(`select public.ch_worker_tutor_ponte_uso($1, $2, $3, $4) r`, [ANA, sid, "a".repeat(40), JSON.stringify(entrada)]);
    expect([uma[0].r, duas[0].r]).toEqual([true, false]);
    expect(await sql(`select count(*)::int n from public.ai_usage_ledger where meta ->> 'voice_call' = 'teste-ponte'`)).toEqual([{ n: 1 }]);
    await expect(sql(`select public.ch_worker_tutor_ponte_uso($1, $2, 'curto', '{}')`, [ANA, sid])).rejects.toThrow(/Relatório inválido/);
  });
});
