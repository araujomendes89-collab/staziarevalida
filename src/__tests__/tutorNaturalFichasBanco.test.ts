// @vitest-environment node
/**
 * Tutor natural, sem textos prontos (migração 20261003013600, decisão do dono de 17/10/2026): a fala sorteada pelo banco na abertura
 * e na passagem vira só a RESERVA; o servidor troca pela fala criada agora pela IA (ch_worker_tutor_set_opening), guarda as últimas
 * falas que o aluno ouviu de cada personalidade (tutor_recent_openings) e não tenta de novo uma fala barrada. Banco local (PGlite).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const MINE = "20261003013600_tutor_natural_fichas.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS, MINE), "utf8");
const UNDO = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013600_tutor_natural_fichas.desfazer.sql"), "utf8");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ANA = id(11);
const BIA = id(12);
let db: PGlite;

const rows = async <T = any>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows;
const asRole = async (role: "anon" | "authenticated", uid: string | null, q: string, p: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return (await tx.query(q, p)).rows;
  });
const state = async (uid: string, sid: string) => (await rows(`select public.ch_worker_tutor_opening_state($1, $2) r`, [uid, sid]))[0].r;
const setOpening = async (uid: string, sid: string, mid: number, text: string | null, usage: Record<string, unknown> = { calls: 0 }) =>
  (await rows(`select public.ch_worker_tutor_set_opening($1, $2, $3, $4, $5, $6) r`, [uid, sid, mid, text, JSON.stringify({ model: "modelo-teste", provider: "teste", prompt_version: "1.0.0" }), JSON.stringify(usage)]))[0].r;
/** Conversa nova com a abertura de reserva, como app_tutor_start grava (meta.opening = true). */
const newSession = async (uid: string, personality = "durona", created = "now()") => {
  const sid = (await rows(`insert into public.tutor_sessions (user_id, mode, title, topic, personality_id, intensity, created_at, last_message_at)
                           values ($1, 'livre', 'Sepse', 'Sepse', $2, 3, ${created}, ${created}) returning id`, [uid, personality]))[0].id as string;
  const mid = (await rows(`insert into public.tutor_messages (session_id, user_id, role, content, meta) values ($1, $2, 'tutor', 'Sepse. Fala aí o que você já sabe.', '{"opening": true, "grounding": "none"}') returning id`, [sid, uid]))[0].id as number;
  return { sid, mid: Number(mid) };
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f < MINE).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  for (const [n, uid] of [["ana", ANA], ["bia", BIA]] as const) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [uid, `${n}@t.dev`]);
  await db.exec(SQL);
  await db.exec(SQL); // pode ser colada de novo
}, 240_000);

describe("abertura e passagem naturais (migração 013600)", () => {
  it("a memória das falas fica fechada: RLS ligado e sem acesso para anon e authenticated; as funções são só do servidor", async () => {
    expect((await rows(`select relrowsecurity from pg_class where oid = 'public.tutor_recent_openings'::regclass`))[0].relrowsecurity).toBe(true);
    await expect(asRole("authenticated", ANA, `select * from public.tutor_recent_openings`)).rejects.toThrow(/permission denied/);
    await expect(asRole("anon", null, `select * from public.tutor_recent_openings`)).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", ANA, `insert into public.tutor_recent_openings (user_id, personality_id, kind, content) values ($1, 'durona', 'abertura', 'x')`, [ANA])).rejects.toThrow(/permission denied/);
    const { sid, mid } = await newSession(ANA);
    await expect(asRole("authenticated", ANA, `select public.ch_worker_tutor_opening_state($1, $2)`, [ANA, sid])).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", ANA, `select public.ch_worker_tutor_set_opening($1, $2, $3, 'oi', '{}', '{}')`, [ANA, sid, mid])).rejects.toThrow(/permission denied/);
    for (const fn of ["ch_worker_tutor_opening_state(uuid,uuid)", "ch_worker_tutor_set_opening(uuid,uuid,bigint,text,jsonb,jsonb)"]) {
      const def = (await rows(`select prosecdef, proconfig from pg_proc where oid = $1::regprocedure`, [`public.${fn}`]))[0];
      expect(def.prosecdef).toBe(true);
      expect(def.proconfig).toEqual(['search_path=""']);
    }
  });

  it("a abertura de reserva pode ser trocada uma vez: o texto da IA entra, a reserva fica guardada e a fala vai para a memória", async () => {
    const { sid, mid } = await newSession(ANA);
    const st = await state(ANA, sid);
    expect(st.message).toEqual({ id: mid, content: "Sepse. Fala aí o que você já sabe.", kind: "abertura" });
    expect(st.session).toMatchObject({ mode: "livre", topic: "Sepse", personality_id: "durona" });
    expect(typeof st.local_hour).toBe("number");
    // outro aluno não lê nem troca a conversa
    expect(await state(BIA, sid)).toBeNull();
    await expect(setOpening(BIA, sid, mid, "Invasão.")).rejects.toThrow(/Conversa não encontrada/);

    expect(await setOpening(ANA, sid, mid, "Sepse de novo? Bora ver se hoje sai redondo.")).toEqual({ ok: true, id: mid, content: "Sepse de novo? Bora ver se hoje sai redondo." });
    const m = (await rows(`select content, meta from public.tutor_messages where id = $1`, [mid]))[0];
    expect(m.content).toBe("Sepse de novo? Bora ver se hoje sai redondo.");
    expect(m.meta).toMatchObject({ opening: true, generated: true, reserve: "Sepse. Fala aí o que você já sabe.", model: "modelo-teste", provider: "teste", prompt_version: "1.0.0" });
    expect(await rows(`select personality_id, kind, content from public.tutor_recent_openings where session_id = $1`, [sid])).toEqual([
      { personality_id: "durona", kind: "abertura", content: "Sepse de novo? Bora ver se hoje sai redondo." },
    ]);
    // só uma vez: a segunda troca não entra e a fala já não aparece como trocável
    expect((await setOpening(ANA, sid, mid, "Outra.")).ok).toBe(false);
    expect((await state(ANA, sid)).message).toBeNull();
    // e a próxima conversa dela com a Durona já sabe o que ela ouviu
    const b = await newSession(ANA);
    expect((await state(ANA, b.sid)).recent).toEqual(["Sepse de novo? Bora ver se hoje sai redondo."]);
  });

  it("fala barrada: a reserva fica, o custo entra no registro sem gastar a cota e ninguém pede a IA de novo para a mesma fala", async () => {
    const { sid, mid } = await newSession(BIA, "tranquila");
    const antes = (await rows(`select coalesce(sum(requests), 0)::int n from public.ai_usage where user_id = $1`, [BIA]))[0].n;
    expect(await setOpening(BIA, sid, mid, null, { calls: 2, input_tokens: 900, output_tokens: 40, cost_usd: 0.0004, provider: "teste", model: "modelo-teste" }))
      .toEqual({ ok: false, id: null, content: null });
    const m = (await rows(`select content, meta from public.tutor_messages where id = $1`, [mid]))[0];
    expect(m.content).toBe("Sepse. Fala aí o que você já sabe.");
    expect(m.meta).toMatchObject({ opening: true, natural_tried: true });
    expect(m.meta.generated).toBeUndefined();
    expect((await state(BIA, sid)).message).toBeNull();
    const led = await rows(`select feature, interactions, input_text_tokens, output_text_tokens, persona, meta from public.ai_usage_ledger where session_id = $1`, [sid]);
    expect(led).toEqual([{ feature: "tutor_text", interactions: 0, input_text_tokens: 900, output_text_tokens: 40, persona: "tranquila", meta: { calls: 2, kind: "abertura_natural", used: false } }]);
    expect((await rows(`select coalesce(sum(requests), 0)::int n from public.ai_usage where user_id = $1`, [BIA]))[0].n).toBe(antes);
    expect(await rows(`select 1 from public.tutor_recent_openings where session_id = $1`, [sid])).toEqual([]);
  });

  it("só a última fala, recente e de conversa ativa: depois que o aluno fala, ou passados 15 minutos, a reserva não muda mais", async () => {
    const a = await newSession(ANA, "acolhedor");
    await db.query(`insert into public.tutor_messages (session_id, user_id, role, content) values ($1, $2, 'student', 'oi')`, [a.sid, ANA]);
    expect((await state(ANA, a.sid)).message).toBeNull();
    expect((await setOpening(ANA, a.sid, a.mid, "Troca no meio da conversa.")).ok).toBe(false);
    expect((await rows(`select content from public.tutor_messages where id = $1`, [a.mid]))[0].content).toBe("Sepse. Fala aí o que você já sabe.");

    const b = await newSession(ANA, "acolhedor");
    await db.query(`update public.tutor_messages set created_at = now() - interval '16 minutes' where id = $1`, [b.mid]);
    expect((await state(ANA, b.sid)).message).toBeNull();
    expect((await setOpening(ANA, b.sid, b.mid, "Tarde demais.")).ok).toBe(false);

    const c = await newSession(ANA, "acolhedor");
    await db.query(`update public.tutor_sessions set status = 'closed' where id = $1`, [c.sid]);
    expect((await state(ANA, c.sid)).message).toBeNull();
    // fala comum do professor (não é abertura nem passagem) nunca é trocada
    const d = await newSession(ANA, "acolhedor");
    await db.query(`insert into public.tutor_messages (session_id, user_id, role, content) values ($1, $2, 'student', 'e aí?'), ($1, $2, 'tutor', 'Resposta comum.')`, [d.sid, ANA]);
    expect((await state(ANA, d.sid)).message).toBeNull();
  });

  it("passagem para a próxima questão: reconhecida como passagem, com memória própria (separada das aberturas)", async () => {
    const { sid } = await newSession(BIA, "durao");
    await db.query(`insert into public.tutor_messages (session_id, user_id, role, content) values ($1, $2, 'student', 'Marquei a B.'), ($1, $2, 'tutor', 'Comentário.')`, [sid, BIA]);
    const p = Number((await rows(`insert into public.tutor_messages (session_id, user_id, role, content, meta) values ($1, $2, 'tutor', 'Próxima. Sem moleza.', '{"opening": true}') returning id`, [sid, BIA]))[0].id);
    expect((await state(BIA, sid)).message).toEqual({ id: p, content: "Próxima. Sem moleza.", kind: "passagem" });
    expect((await setOpening(BIA, sid, p, "Essa foi. Agora uma de outro jeito, lê com calma o caso.")).ok).toBe(true);
    expect(await rows(`select kind from public.tutor_recent_openings where session_id = $1`, [sid])).toEqual([{ kind: "passagem" }]);
  });

  it("guarda só as 10 últimas por aluno, personalidade e tipo, e o servidor recebe as 5 mais recentes (a mais nova primeiro)", async () => {
    for (let i = 1; i <= 12; i++) {
      const { sid, mid } = await newSession(BIA, "durona");
      expect((await setOpening(BIA, sid, mid, `Abertura número ${i} da Durona.`)).ok).toBe(true);
    }
    expect((await rows(`select count(*)::int n from public.tutor_recent_openings where user_id = $1 and personality_id = 'durona' and kind = 'abertura'`, [BIA]))[0].n).toBe(10);
    const { sid } = await newSession(BIA, "durona");
    expect((await state(BIA, sid)).recent).toEqual([12, 11, 10, 9, 8].map((i) => `Abertura número ${i} da Durona.`));
    // outra personalidade tem a sua memória
    const t = await newSession(BIA, "tranquila");
    expect((await state(BIA, t.sid)).recent).toEqual([]);
  });

  it("aluno que sumiu: a conversa anterior e há quantos dias foi", async () => {
    const CAIO = id(13);
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'caio@t.dev', '{}')`, [CAIO]);
    expect((await state(CAIO, (await newSession(CAIO, "acolhedor", "now() - interval '9 days'")).sid)).previous_session).toBeNull();
    await db.query(`update public.tutor_sessions set topic = 'Tuberculose', title = 'Tuberculose' where user_id = $1`, [CAIO]);
    const { sid } = await newSession(CAIO, "tranquila");
    expect((await state(CAIO, sid)).previous_session).toEqual({ days: 9, topic: "Tuberculose" });
  });

  it("apagar a conta apaga a memória das falas", async () => {
    const DEL = id(14);
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'del@t.dev', '{}')`, [DEL]);
    const { sid, mid } = await newSession(DEL, "durona");
    await setOpening(DEL, sid, mid, "Uma fala para apagar.");
    await db.query(`delete from auth.users where id = $1`, [DEL]);
    expect(await rows(`select 1 from public.tutor_recent_openings where user_id = $1`, [DEL])).toEqual([]);
  });

  it("voz ao vivo: a primeira fala de cada ligação entra na memória (uma por ligação) e a próxima ligação recebe a lista", async () => {
    const VOZ = id(15);
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'voz@t.dev', '{}')`, [VOZ]);
    const { sid } = await newSession(VOZ, "tranquila");
    const call = async () => (await rows(`insert into public.tutor_voice_calls (user_id, session_id, lease_until) values ($1, $2, now() + interval '2 minutes') returning id`, [VOZ, sid]))[0].id as string;
    const save = async (uid: string, vc: string, t: string | null) => (await rows(`select public.ch_worker_tutor_voice_opening_save($1, $2, $3) r`, [uid, vc, t]))[0].r;
    const voiceState = async (uid: string, s: string) => (await rows(`select public.ch_worker_tutor_voice_openings($1, $2) r`, [uid, s]))[0].r;
    const v1 = await call();
    expect(await save(VOZ, v1, "  Boa noite.   Hoje a gente   olha sepse com calma.  ")).toBe(true);
    expect(await save(VOZ, v1, "Segunda fala da mesma ligação.")).toBe(false); // só a primeira
    expect(await save(BIA, v1, "Fala de outro aluno.")).toBe(false); // ligação de outra pessoa
    expect(await save(VOZ, v1, "   ")).toBe(false);
    await db.query(`update public.tutor_voice_calls set status = 'ended' where id = $1`, [v1]);
    const v2 = await call();
    expect(await save(VOZ, v2, "Que bom te ver de volta.")).toBe(true);
    const st = await voiceState(VOZ, sid);
    expect(st.recent).toEqual(["Que bom te ver de volta.", "Boa noite. Hoje a gente olha sepse com calma."]);
    expect(typeof st.local_hour).toBe("number");
    expect(await voiceState(BIA, sid)).toBeNull();
    // fechadas para o aluno; só o servidor
    await expect(asRole("authenticated", VOZ, `select public.ch_worker_tutor_voice_openings($1, $2)`, [VOZ, sid])).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", VOZ, `select public.ch_worker_tutor_voice_opening_save($1, $2, 'x')`, [VOZ, v2])).rejects.toThrow(/permission denied/);
    for (const fn of ["ch_worker_tutor_voice_openings(uuid,uuid)", "ch_worker_tutor_voice_opening_save(uuid,uuid,text)"]) {
      const def = (await rows(`select prosecdef, proconfig from pg_proc where oid = $1::regprocedure`, [`public.${fn}`]))[0];
      expect(def.prosecdef).toBe(true);
      expect(def.proconfig).toEqual(['search_path=""']);
    }
    // guarda só as 10 últimas aberturas por aluno e personalidade
    for (let i = 0; i < 12; i++) {
      await db.query(`update public.tutor_voice_calls set status = 'ended' where user_id = $1 and status = 'active'`, [VOZ]);
      await save(VOZ, await call(), `Abertura número ${i}.`);
    }
    expect((await rows(`select count(*)::int n from public.tutor_recent_openings where user_id = $1 and kind = 'abertura'`, [VOZ]))[0].n).toBe(10);
  });

  it("desfazer apaga as funções e a tabela; a migração entra de novo", async () => {
    await db.exec(UNDO);
    expect((await rows(`select to_regclass('public.tutor_recent_openings') r`))[0].r).toBeNull();
    expect(await rows(`select 1 from pg_proc where proname in ('ch_worker_tutor_opening_state', 'ch_worker_tutor_set_opening', 'ch_worker_tutor_voice_openings', 'ch_worker_tutor_voice_opening_save')`)).toEqual([]);
    await db.exec(UNDO); // desfazer também pode rodar 2x
    await db.exec(SQL);
    const { sid } = await newSession(ANA, "durao");
    expect((await state(ANA, sid)).message.kind).toBe("abertura");
  });
});
