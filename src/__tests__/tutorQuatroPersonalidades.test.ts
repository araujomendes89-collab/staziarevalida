// @vitest-environment node
/**
 * Dois personagens, quatro personalidades (migração 20261003013590, decisão do dono de 17/10/2026):
 *   Stazi  = Durão (id durao) e Tranquilo (id acolhedor, preservado);  Stazia = Durona (id durona) e Tranquila (id tranquila).
 * O Direto sai: fica inativo, as conversas dele passam a ser só leitura e as preferências dele vão para o Tranquilo. A voz vem do
 * personagem. O Durão herda da Durona a mecânica de nível e o travamento por 18+ e médico do Termo. Banco local (PGlite), nada remoto.
 * (A migração das três personalidades, …5500, tem teste próprio e fica como histórico.)
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { aceitarTermos } from "./helpers/aceites";
import { resolveProfile, DEFAULT_EXPLOSIVA, PROFILES } from "../../server/tutor/personalityEngine";
import { engineFor, familyOf } from "../../server/tutor/emotion";
import { officialVoiceForPersonality } from "../../server/tutor/officialVoices";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const MINE = "20261003013590_tutor_quatro_personalidades.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS, MINE), "utf8");
const UNDO = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013590_tutor_quatro_personalidades.desfazer.sql"), "utf8");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const ANA = id(2); // estava no Direto
const BIA = id(3); // estava na Durona
const CAIO = id(4); // estava no Tranquilo
const DUDA = id(5); // aluna que nunca escolheu nada
let db: PGlite;
const sessions: Record<string, string> = {};

const rpc = async <T = any>(uid: string | null, fn: string, args: unknown[] = []): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ r: T }>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)));
    return r.rows[0].r;
  });
const rows = async <T = any>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows;
const byId = async () => Object.fromEntries((await rows(`select * from public.tutor_personalities`)).map((r: any) => [r.id, r]));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  // o banco como está hoje: todas as migrações antes desta
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f < MINE).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  for (const [n, uid] of [["adm", ADMIN], ["ana", ANA], ["bia", BIA], ["caio", CAIO], ["duda", DUDA]] as const) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [uid, `${n}@t.dev`]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  for (const uid of [ANA, BIA, CAIO, DUDA]) await aceitarTermos(db, uid);
  // conversas antigas dos três professores de antes e preferências de cada aluno
  for (const p of ["acolhedor", "durona", "direto"]) {
    sessions[p] = (await rows(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity) values ($1, 'livre', 'x', $2, 3) returning id`, [ANA, p]))[0].id;
  }
  await db.query(`insert into public.tutor_preferences (user_id, personality_id, profanity) values ($1, 'direto', 'moderate'), ($2, 'durona', 'moderate'), ($3, 'acolhedor', 'off')`, [ANA, BIA, CAIO]);
  await db.exec(SQL);
  await db.exec(SQL); // pode ser colada de novo
}, 240_000);

describe("quatro personalidades em dois personagens (migração 013590)", () => {
  it("quatro ativas, na ordem da tela, cada uma no seu personagem; o Direto fica inativo e sem personagem", async () => {
    const t = await byId();
    const ativas = Object.values(t).filter((r: any) => r.active).sort((a: any, b: any) => a.position - b.position).map((r: any) => [r.id, r.name, r.emoji, r.character]);
    expect(ativas).toEqual([["durao", "Durão", "🔥", "stazi"], ["acolhedor", "Tranquilo", "😌", "stazi"], ["durona", "Durona", "🔥", "stazia"], ["tranquila", "Tranquila", "😌", "stazia"]]);
    expect(t.direto).toMatchObject({ active: false, character: null });
    // os ids antigos preservados: o Tranquilo continua sendo o acolhedor, com o jeito de antes
    expect(t.acolhedor.style_notes).toMatch(/Age como se explicar desse trabalho demais/);
  });

  it("uma voz por personagem: os dois do Stazi com voz masculina (cedar / Charon), os dois da Stazia com voz feminina (marin / Kore)", async () => {
    const t = await byId();
    for (const p of ["durao", "acolhedor"]) expect(t[p].voice).toMatchObject({ realtime: "cedar", openai: "cedar", gemini: "Charon" });
    for (const p of ["durona", "tranquila"]) expect(t[p].voice).toMatchObject({ realtime: "marin", openai: "marin", gemini: "Kore" });
    // e o servidor leva a fala para a voz oficial do personagem
    expect(["durao", "acolhedor"].map(officialVoiceForPersonality)).toEqual(["stazi", "stazi"]);
    expect(["durona", "tranquila"].map(officialVoiceForPersonality)).toEqual(["stazia", "stazia"]);
    expect(officialVoiceForPersonality("direto")).toBeNull();
  });

  it("Durão herda da Durona os parâmetros, o motor e as falas; é masculino; a Tranquila é texto novo, calmo e sem palavrão", async () => {
    const t = await byId();
    expect(t.durao.params).toEqual(t.durona.params);
    expect(t.durao.engine).toEqual(t.durona.engine);
    expect(t.durao.examples).toEqual(t.durona.examples);
    expect(t.durao.examples_strong).toEqual(t.durona.examples_strong);
    expect(t.durao.lines_strong).toEqual(t.durona.lines_strong);
    expect(t.durao.style_notes).toMatch(/professor brasileiro escrachado/);
    expect(t.durao.style_notes).not.toMatch(/professora|sarcástica|engraçada|expressiva/);
    expect(t.durao.tagline).toBe("Provocador, escrachado e sem passar a mão na cabeça");
    // Tranquila: calma, sem palavrão, com mais acolhimento (friendliness) que o Tranquilo e mantendo exigência
    expect(Number(t.tranquila.params.profanity)).toBe(0);
    expect(t.tranquila.examples_strong).toEqual([]);
    expect(Number(t.tranquila.params.friendliness)).toBeGreaterThan(Number(t.acolhedor.params.friendliness));
    expect(Number(t.tranquila.params.strictness)).toBeGreaterThanOrEqual(40);
    expect(t.tranquila.style_notes).toMatch(/professora brasileira calma, acolhedora e sem pressa/);
    expect(t.tranquila.style_notes).toMatch(/não baixa a exigência/);
    expect(t.tranquila.engine).toMatchObject({ language_max: 1, aggression_max: 10 });
    for (const p of ["durao", "tranquila"]) {
      expect(t[p].examples.length).toBeGreaterThanOrEqual(4);
      for (const k of ["question", "review", "next", "topic", "discuss"]) expect(t[p].lines[k].length).toBeGreaterThanOrEqual(2);
      expect(t[p].lines.topic.every((l: string) => l.includes("{tema}"))).toBe(true);
    }
  });

  it("conversas antigas do Direto viram só leitura (nome e emoji originais); as outras seguem normais", async () => {
    const legacy = async (p: string) => (await rows(`select legacy_persona from public.tutor_sessions where id = $1`, [sessions[p]]))[0].legacy_persona;
    expect(await legacy("direto")).toEqual({ name: "Direto", emoji: "🎯" });
    expect(await legacy("acolhedor")).toBeNull();
    expect(await legacy("durona")).toBeNull();
    const lista = await rpc<any[]>(ANA, "app_tutor_sessions", [10]);
    expect(lista.find((s) => s.id === sessions.direto)).toMatchObject({ read_only: true, persona: "Direto" });
    expect(lista.find((s) => s.id === sessions.durona)).toMatchObject({ read_only: false });
    expect(lista.find((s) => s.id === sessions.acolhedor)).toMatchObject({ read_only: false });
  });

  it("preferência do Direto passa para o Tranquilo sem palavrão; Durona e Tranquilo ficam como estavam", async () => {
    const p = Object.fromEntries((await rows(`select user_id, personality_id, profanity from public.tutor_preferences`)).map((r: any) => [r.user_id, [r.personality_id, r.profanity]]));
    expect(p).toEqual({ [ANA]: ["acolhedor", "off"], [BIA]: ["durona", "moderate"], [CAIO]: ["acolhedor", "off"] });
  });

  it("o aluno vê os 4 com o personagem de cada um; quem nunca escolheu abre no Tranquilo", async () => {
    const st = await rpc<any>(DUDA, "app_tutor_status");
    expect(st.personalities.map((p: any) => [p.id, p.name, p.emoji, p.character])).toEqual([
      ["durao", "Durão", "🔥", "stazi"], ["acolhedor", "Tranquilo", "😌", "stazi"], ["durona", "Durona", "🔥", "stazia"], ["tranquila", "Tranquila", "😌", "stazia"]]);
    expect(st.personalities.filter((p: any) => p.swears).map((p: any) => p.id)).toEqual(["durao", "durona"]);
    expect(st.preferences).toEqual({ personality_id: "acolhedor", profanity: "off", chosen: false });
    expect(st.personalities.map((p: any) => p.tagline).every((x: string) => x.length > 10)).toBe(true);
  });

  it("começar conversa: os 4 abrem (Durão e Tranquila com a preferência gravada); o Direto, não", async () => {
    await db.query(`update public.tutor_config set enabled = true, requires_pro = false`);
    const comeca = (uid: string, p: string) => rpc<any>(uid, "app_tutor_start", ["livre", null, null, null, p]);
    const durao = await comeca(DUDA, "durao");
    expect(durao.personality).toMatchObject({ id: "durao", emoji: "🔥" });
    expect((await rows(`select personality_id, profanity from public.tutor_preferences where user_id = $1`, [DUDA]))[0]).toMatchObject({ personality_id: "durao", profanity: "moderate" });
    // a abertura é do repertório do Durão (copiado da Durona), no masculino
    const dur = (await rows(`select openings, lines from public.tutor_personalities where id = 'durao'`))[0];
    expect([...dur.openings, ...dur.lines.opening_good, ...dur.lines.opening_neutral, ...dur.lines.opening_impatient]).toContain(durao.messages[0].content);
    const tranquila = await comeca(DUDA, "tranquila");
    expect(tranquila.personality).toMatchObject({ id: "tranquila", emoji: "😌" });
    expect((await rows(`select personality_id, profanity from public.tutor_preferences where user_id = $1`, [DUDA]))[0]).toMatchObject({ personality_id: "tranquila", profanity: "off" });
    await expect(comeca(DUDA, "direto")).rejects.toThrow(/Professor não encontrado/);
    expect((await comeca(DUDA, "acolhedor")).personality.id).toBe("acolhedor");
    expect((await comeca(DUDA, "durona")).personality.id).toBe("durona");
    await expect(rpc(DUDA, "app_tutor_save_preferences", [{ personality_id: "direto" }])).rejects.toThrow(/Professor não encontrado/);
    expect(await rpc(DUDA, "app_tutor_save_preferences", [{ personality_id: "durao" }])).toMatchObject({ personality_id: "durao", profanity: "moderate" });
  });

  it("painel: lista os 4 com o personagem; só administrador mexe; o Direto não aparece nem volta; cada personagem mantém uma ligada", async () => {
    const lista = await rpc<any[]>(ADMIN, "app_admin_tutor_personalities");
    expect(lista.map((p) => [p.id, p.name, p.character, p.active, p.default])).toEqual([
      ["durao", "Durão", "stazi", true, false], ["acolhedor", "Tranquilo", "stazi", true, true], ["durona", "Durona", "stazia", true, false], ["tranquila", "Tranquila", "stazia", true, false]]);
    await expect(rpc(DUDA, "app_admin_tutor_personalities")).rejects.toThrow(/administradores/);
    const motivo = "Ajuste de teste do painel do Tutor.";
    await expect(rpc(DUDA, "app_admin_tutor_set_personality", ["durao", false, motivo])).rejects.toThrow(/administradores/);
    await expect(rpc(ADMIN, "app_admin_tutor_set_personality", ["direto", true, motivo])).rejects.toThrow(/Professor não encontrado/);
    await expect(rpc(ADMIN, "app_admin_tutor_set_personality", ["durao", false, "curto"])).rejects.toThrow(/motivo/);
    await expect(rpc(ADMIN, "app_admin_tutor_set_personality", ["acolhedor", false, motivo])).rejects.toThrow(/Tranquilo é o professor padrão/);
    // Durona e Tranquila: pode desligar uma, nunca as duas
    expect((await rpc<any[]>(ADMIN, "app_admin_tutor_set_personality", ["durona", false, motivo])).find((p) => p.id === "durona").active).toBe(false);
    await expect(rpc(ADMIN, "app_admin_tutor_set_personality", ["tranquila", false, motivo])).rejects.toThrow(/pelo menos uma personalidade ligada/);
    await expect(rpc(DUDA, "app_tutor_start", ["livre", null, null, null, "durona"])).rejects.toThrow(/Professor não encontrado/);
    expect((await rpc<any[]>(ADMIN, "app_admin_tutor_set_personality", ["durona", true, motivo])).find((p) => p.id === "durona").active).toBe(true);
    expect((await rows(`select details from public.admin_audit_log where action = 'tutor.personality' order by id desc limit 1`))[0].details).toMatchObject({ id: "durona", active: true });
  });

  it("aprovação das vozes é por personagem: stazi e stazia valem; as antigas (tranquilo, durona, direto) não", async () => {
    for (const v of ["stazi", "stazia"]) {
      await db.query(`select public.tutor_voice_check($1, $2)`, [ADMIN, v]);
      await db.query(`insert into public.tutor_voice_approvals (voice, fingerprint) values ($1, $2) on conflict (voice) do nothing`, [v, "a".repeat(64)]);
    }
    for (const v of ["tranquilo", "durona", "direto", "durao"]) await expect(db.query(`select public.tutor_voice_check($1, $2)`, [ADMIN, v])).rejects.toThrow(/Voz inválida/);
    await expect(db.query(`insert into public.tutor_voice_approvals (voice, fingerprint) values ('durao', $1)`, ["a".repeat(64)])).rejects.toThrow();
    await expect(db.query(`select public.tutor_voice_check($1, 'stazi')`, [DUDA])).rejects.toThrow(/administradores/);
  });

  it("Durão herda o travamento 18+ e médico: N3 e N4 só com a declaração do Termo; sem ela vale o N2", async () => {
    // banco: a escolha de nível é do aluno (vale para o Durão e para a Durona) e N3/N4 pedem a declaração do aceite
    await expect(rpc(DUDA, "app_tutor_save_explosiva_preferences", ["n3", true, true])).rejects.toThrow(/Os níveis 3 e 4/);
    await expect(rpc(DUDA, "app_tutor_save_explosiva_preferences", ["n4", true, true])).rejects.toThrow(/Os níveis 3 e 4/);
    expect(await rpc(DUDA, "app_tutor_save_explosiva_preferences", ["n2", true, true])).toMatchObject({ choice: { level: "n2" }, adult_declared: false });
    await rpc(DUDA, "app_tutor_save_explosiva_preferences", [null, null, null]);
    // servidor: sem a declaração, o Durão (como a Durona) cai no N2; com ela, o padrão é o N3 com gritos e palavrões
    const platform = { maxProfanity: "moderate" as const, explosivaEnabled: true };
    const sem = resolveProfile({ personality: "durao", explosiva: { ...DEFAULT_EXPLOSIVA, adultDeclared: false }, platform });
    expect(sem.profile.key).toBe("durao:n2");
    expect(sem.note).toMatch(/Termo/);
    const com = resolveProfile({ personality: "durao", explosiva: { ...DEFAULT_EXPLOSIVA, adultDeclared: true }, platform });
    expect(com.profile.key).toBe("durao:n3");
    expect(com.shoutsAllowed).toBe(true);
    expect(com.profanityCap).toBe("moderate");
    // o aluno desliga gritos e palavrões, baixa o nível ou o painel desliga a Explosiva: o Durão obedece como a Durona
    expect(resolveProfile({ personality: "durao", explosiva: { ...DEFAULT_EXPLOSIVA, adultDeclared: true, profanity: false, shouts: false }, platform })).toMatchObject({ profanityCap: "off", shoutsAllowed: false });
    expect(resolveProfile({ personality: "durao", explosiva: { level: "n1", shouts: true, profanity: true, adultDeclared: true }, platform }).profile.key).toBe("durao:n1");
    expect(resolveProfile({ personality: "durao", explosiva: { ...DEFAULT_EXPLOSIVA, adultDeclared: true }, platform: { ...platform, explosivaEnabled: false } }).profile.key).toBe("durao");
    expect(resolveProfile({ personality: "durao", explosiva: null, platform }).profile.key).toBe("durao:n2");
    // mesmas regras que a Durona (família "durona"), em perfis masculinos
    for (const lvl of ["", ":n1", ":n2", ":n3", ":n4"]) {
      expect(PROFILES[`durao${lvl}`]).toMatchObject({ personality: "durona", level: PROFILES[`durona${lvl}`].level, params: PROFILES[`durona${lvl}`].params, profanity_max: PROFILES[`durona${lvl}`].profanity_max });
      expect(PROFILES[`durao${lvl}`].style).not.toMatch(/Professora|sarcástica|Estressada/);
    }
    // a Tranquila é da família do Tranquilo e nunca xinga nem grita
    const tr = resolveProfile({ personality: "tranquila", explosiva: { ...DEFAULT_EXPLOSIVA, adultDeclared: true }, platform });
    expect(tr.profile).toMatchObject({ key: "tranquila", personality: "tranquilo", profanity_max: "off", shouts: false });
    expect(tr.profanityCap).toBe("off");
    // motor emocional: Durão = família da Durona (nível do painel vale), Tranquila = família do Tranquilo
    expect(familyOf("durao")).toBe("durona");
    expect(familyOf("tranquila")).toBe("acolhedor");
    expect(engineFor("durao", null, "sem_filtro")).toEqual(engineFor("durona", null, "sem_filtro"));
    expect(engineFor("tranquila", null, "sem_filtro")).toEqual(engineFor("acolhedor", null, "sem_filtro"));
  });

  it("desfazer volta ao desenho de antes (Tranquilo, Durona, Direto), sem apagar o Durão e a Tranquila; e a migração entra de novo", async () => {
    await db.exec(UNDO);
    const t = await byId();
    expect(Object.values(t).filter((r: any) => r.active).map((r: any) => r.id).sort()).toEqual(["acolhedor", "direto", "durona"]);
    expect(t.durao.active).toBe(false);
    expect(t.tranquila.active).toBe(false);
    expect("character" in t.durao).toBe(false);
    expect((await rpc<any[]>(ADMIN, "app_admin_tutor_personalities")).map((p) => p.id)).toEqual(["acolhedor", "durona", "direto"]);
    expect((await rpc<any>(DUDA, "app_tutor_status")).personalities.map((p: any) => p.id)).toEqual(["acolhedor", "durona", "direto"]);
    await db.exec(SQL);
    expect((await rpc<any>(DUDA, "app_tutor_status")).personalities.map((p: any) => p.id)).toEqual(["durao", "acolhedor", "durona", "tranquila"]);
    expect((await byId()).direto.active).toBe(false);
  });
});
