// @vitest-environment node
/**
 * Ensaio da migração do Personality Engine (supabase/migrations/…11900_tutor_reacoes_de_voz.sql) num banco local (PGlite), sem
 * tocar no banco real: aditiva, nasce vazia/desligada, só o administrador marca as reações (com motivo e registro), o servidor lê
 * só as liberadas; a Durona Explosiva nasce LIGADA com o padrão N3, gritos e palavrões ligados (decisão do dono de 16/10); o aluno
 * só mexe na própria escolha e N3/N4 dependem da declaração de 18+ e médico do aceite do Termo 2.0 (legal_declarations, ramo
 * vt-termo — aqui aplicada a migração 011500 de verdade quando o worktree existe); as preferências já salvas do Tutor não mudam, o desfazer remove tudo e a migração pode ser colada de novo. Também ensaia aplicar dentro de BEGIN … ROLLBACK.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const MINE = "20261003011900_tutor_reacoes_de_voz.sql";
const UNDO = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003011900_tutor_reacoes_de_voz.desfazer.sql"), "utf8");
const SQL = fs.readFileSync(path.join(MIGRATIONS, MINE), "utf8");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const EDITOR = id(2);
const ALUNO = id(3);
const OUTRO = id(4);
const MOTIVO = "Ensaio das reações de voz";
let db: PGlite;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(
      `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
      keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]))
    );
    return r.rows[0].result;
  });
}
const salvar = (rules: unknown[], explosiva: boolean | null = null, uid: string | null = ADMIN, reason = MOTIVO) =>
  rpc(uid, "app_admin_tutor_save_voice_reactions", { p_rules: rules, p_explosiva_enabled: explosiva, p_reason: reason });
const escolher = (uid: string, level: string | null, o: { shouts?: boolean; profanity?: boolean } = {}) =>
  rpc(uid, "app_tutor_save_explosiva_preferences", { p_level: level, p_shouts: o.shouts ?? null, p_profanity: o.profanity ?? null });
const TERMO_V2 = path.resolve(ROOT, "../vt-termo/supabase/migrations/20261003011500_termo_v2_declaracoes.sql");
/** Estrutura do Termo 2.0 (vt-termo): a migração de verdade quando o worktree existe; senão, a mesma tabela em miniatura. */
async function termoV2() {
  if (fs.existsSync(TERMO_V2)) await db.exec(fs.readFileSync(TERMO_V2, "utf8"));
  else await db.exec(`create table if not exists public.legal_declarations (acceptance_id bigint primary key references public.legal_acceptances (id) on delete cascade,
    adult boolean not null check (adult), physician boolean not null check (physician), declared_at timestamptz not null default now())`);
}
/** O aluno aceitou o Termo declarando 18+ e médico (como a tela de aceite grava). */
async function declara(uid: string) {
  const a = await db.query<{ id: number }>(`insert into public.legal_acceptances (user_id, document, version, origin, email_hash) values ($1, 'termo_uso', '2.0-teste', 'tela_aceite', 'x') returning id`, [uid]);
  await db.query(`insert into public.legal_declarations (acceptance_id, adult, physician) values ($1, true, true)`, [a.rows[0].id]);
}
const worker = async () => (await db.query<{ r: any }>(`select public.ch_worker_tutor_voice_reactions() as r`)).rows[0].r;
const prefsSnapshot = async () => (await db.query(`select * from public.tutor_preferences order by user_id`)).rows;
const exists = async (name: string) => (await db.query<{ t: string | null }>(`select to_regclass($1)::text as t`, [`public.${name}`])).rows[0].t !== null;
const r = (personality: string, level: string, reaction: string, over: Record<string, unknown> = {}) => ({ personality, level, reaction, allowed: true, max_per_reply: 1, max_per_10: 2, ...over });
let before: unknown[];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  // todas as migrações ANTES desta: o banco fica como o real está hoje
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f < MINE).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  for (const [name, uid] of [["admin", ADMIN], ["editor", EDITOR], ["aluno", ALUNO], ["outro", OUTRO]]) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [uid, `${name}@teste.dev`]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  // um aluno com preferência do Tutor já salva (Durona, palavrão liberado): a migração não pode mexer nela
  const persona = (await db.query<{ id: string }>(`select id from public.tutor_personalities where id = 'durona'`)).rows[0]?.id ?? (await db.query<{ id: string }>(`select id from public.tutor_personalities limit 1`)).rows[0].id;
  await db.query(`insert into public.tutor_preferences (user_id, personality_id, intensity, profanity) values ($1, $2, 4, 'moderate')`, [ALUNO, persona]);
  before = await prefsSnapshot();
  // ensaio: aplicar e desfazer com ROLLBACK não deixa rastro
  await db.exec(`begin;\n${SQL}\nrollback;`);
  expect(await exists("tutor_voice_reaction_rules")).toBe(false);
  // agora de verdade, e colada duas vezes (pode ser colada de novo)
  await db.exec(SQL);
  await db.exec(SQL);
}, 180_000);

describe("migração das reações de voz — ensaio no banco local", () => {
  it("é aditiva: as preferências já salvas dos alunos não mudam", async () => {
    expect(await prefsSnapshot()).toEqual(before);
  });

  it("nasce sem reação marcada e com a Durona Explosiva LIGADA", async () => {
    expect(await worker()).toEqual({ explosiva_enabled: true, rules: [] });
    expect(await rpc(ADMIN, "app_admin_tutor_voice_reactions")).toMatchObject({ explosiva_enabled: true, rules: [] });
  });

  it("aluno sem escolha recebe o padrão N3 com gritos e palavrões; sem o Termo 2.0 no banco, sem maioridade (o servidor usa N2)", async () => {
    expect(await rpc(ALUNO, "app_tutor_explosiva_preferences")).toEqual({ available: true, adult_declared: false, choice: { level: "n3", shouts: true, profanity: true, is_default: true } });
    expect((await db.query<any>(`select public.ch_worker_tutor_explosiva($1) as r`, [ALUNO])).rows[0].r).toEqual({ level: "n3", shouts: true, profanity: true, is_default: true, adult_declared: false });
    await expect(escolher(ALUNO, "n3")).rejects.toThrow(/aceite do Termo/);
  });

  it("aluno, editor e visitante não leem nem salvam as reações do painel", async () => {
    await expect(rpc(null, "app_admin_tutor_voice_reactions")).rejects.toThrow(/permission denied/);
    for (const uid of [ALUNO, EDITOR]) {
      await expect(rpc(uid, "app_admin_tutor_voice_reactions")).rejects.toThrow("Acesso restrito a administradores.");
      await expect(salvar([r("durona", "n4", "laughs")], false, uid)).rejects.toThrow("Acesso restrito a administradores.");
    }
    expect(await worker()).toEqual({ explosiva_enabled: true, rules: [] });
  });

  it("o servidor (ch_worker_*) não fica aberto a aluno nem a visitante; as tabelas não são lidas direto", async () => {
    for (const fn of ["ch_worker_tutor_voice_reactions()", "ch_worker_tutor_explosiva(uuid)", "tutor_adult_declared(uuid)"]) {
      const q = await db.query<any>(`select has_function_privilege('anon', 'public.${fn}', 'execute') a, has_function_privilege('authenticated', 'public.${fn}', 'execute') b`);
      expect(q.rows[0]).toEqual({ a: false, b: false });
    }
    await expect(db.transaction(async (tx) => {
      await tx.exec(`set local role authenticated`);
      return tx.query(`select * from public.tutor_voice_reaction_rules`);
    })).rejects.toThrow(/permission denied/);
  });

  it("regra inválida e motivo curto são recusados (nada muda)", async () => {
    await expect(salvar([r("durona", "n4", "laughs")], null, ADMIN, "curto")).rejects.toThrow(/motivo/);
    await expect(salvar([r("direto", "n3", "laughs")])).rejects.toThrow(/Regra de reação inválida/);
    await expect(salvar([r("durona", "n4", "laughs", { max_per_reply: 5 })])).rejects.toThrow(/Regra de reação inválida/);
    await expect(salvar([r("durona", "n4", "angry")])).rejects.toThrow();
    expect(await worker()).toEqual({ explosiva_enabled: true, rules: [] });
  });

  it("o administrador marca; o servidor vê só as liberadas; o registro guarda o motivo; salvar de novo substitui a lista", async () => {
    await salvar([r("durona", "n4", "laughs", { max_per_reply: 2, max_per_10: 4 }), r("durona", "n4", "shouts"), r("tranquilo", "padrao", "sighs", { allowed: false })], null);
    const w = await worker();
    expect(w.explosiva_enabled).toBe(true);
    expect(w.rules.map((x: any) => `${x.personality}:${x.level}:${x.reaction}`).sort()).toEqual(["durona:n4:laughs", "durona:n4:shouts"]);
    expect(w.rules.find((x: any) => x.reaction === "laughs")).toMatchObject({ max_per_reply: 2, max_per_10: 4 });
    const log = (await db.query<any>(`select actor_id, details from public.admin_audit_log where action = 'tutor.voice_reactions' order by id desc limit 1`)).rows[0];
    expect(log.actor_id).toBe(ADMIN);
    expect(log.details.reason).toBe(MOTIVO);
    await salvar([r("durona", "n3", "sighs")]);
    expect((await worker()).rules.map((x: any) => x.reaction)).toEqual(["sighs"]);
    expect((await worker()).explosiva_enabled).toBe(true); // nulo = não mexe no interruptor
  });

  it("com o Termo 2.0 aceito (18+ e médico): N3/N4 liberados; o aluno baixa o nível e desliga gritos/palavrões; lê só a própria escolha", async () => {
    await termoV2();
    expect((await rpc(ALUNO, "app_tutor_explosiva_preferences")).adult_declared).toBe(false);
    await declara(ALUNO);
    expect((await rpc(ALUNO, "app_tutor_explosiva_preferences")).adult_declared).toBe(true);
    expect((await db.query<any>(`select public.ch_worker_tutor_explosiva($1) as r`, [ALUNO])).rows[0].r).toMatchObject({ level: "n3", adult_declared: true, is_default: true });
    await escolher(ALUNO, "n4");
    await escolher(ALUNO, "n2", { shouts: false, profanity: false });
    expect((await rpc(ALUNO, "app_tutor_explosiva_preferences")).choice).toEqual({ level: "n2", shouts: false, profanity: false, is_default: false });
    expect((await db.query<any>(`select public.ch_worker_tutor_explosiva($1) as r`, [ALUNO])).rows[0].r).toEqual({ level: "n2", shouts: false, profanity: false, is_default: false, adult_declared: true });
    await expect(escolher(ALUNO, "n9")).rejects.toThrow(/Nível inválido/);
    // o outro aluno (sem declaração) não grava N3/N4 e não vê a escolha deste
    await expect(escolher(OUTRO, "n4")).rejects.toThrow(/aceite do Termo/);
    expect((await rpc(OUTRO, "app_tutor_explosiva_preferences")).choice.is_default).toBe(true);
    const rows = await db.transaction(async (tx) => {
      await tx.exec(`set local role authenticated`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: OUTRO })]);
      return (await tx.query(`select * from public.tutor_explosiva_preferences`)).rows;
    });
    expect(rows).toEqual([]);
    await expect(rpc(null, "app_tutor_save_explosiva_preferences", { p_level: "n1", p_shouts: null, p_profanity: null })).rejects.toThrow(/permission denied/);
    // voltar ao padrão apaga a escolha
    await escolher(ALUNO, null);
    expect((await rpc(ALUNO, "app_tutor_explosiva_preferences")).choice).toEqual({ level: "n3", shouts: true, profanity: true, is_default: true });
  });

  it("com a Explosiva desligada no painel o aluno não consegue escolher", async () => {
    await salvar([], false);
    await expect(escolher(OUTRO, "n1")).rejects.toThrow(/desligada/);
    expect((await rpc(OUTRO, "app_tutor_explosiva_preferences")).available).toBe(false);
  });

  it("desfazer remove só o que a migração criou; as preferências do Tutor continuam; e dá para aplicar de novo", async () => {
    await db.exec(UNDO);
    for (const t of ["tutor_voice_reaction_rules", "tutor_explosiva_config", "tutor_explosiva_preferences"]) expect(await exists(t)).toBe(false);
    const fns = (await db.query<{ n: number }>(`select count(*)::int n from pg_proc where proname in ('app_admin_tutor_voice_reactions','app_admin_tutor_save_voice_reactions','ch_worker_tutor_voice_reactions','ch_worker_tutor_explosiva','app_tutor_explosiva_preferences','app_tutor_save_explosiva_preferences','tutor_adult_declared')`)).rows[0].n;
    expect(fns).toBe(0);
    expect(await prefsSnapshot()).toEqual(before);
    expect(await exists("legal_declarations")).toBe(true); // a estrutura do Termo 2.0 não é tocada pelo desfazer
    await db.exec(SQL);
    expect(await worker()).toEqual({ explosiva_enabled: true, rules: [] });
  });
});
