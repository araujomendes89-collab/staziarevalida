// @vitest-environment node
/**
 * Personagem do Tutor no perfil do aluno (migração 20261003013610, decisão do dono de 17/10/2026): a escolha do Stazi ou da Stazia
 * passa a valer em qualquer aparelho. Coluna tutor_preferences.character, preenchida pelo personagem da personalidade preferida;
 * personagem e personalidade andam juntos; app_tutor_set_character grava o toque; app_tutor_status devolve o personagem.
 * Banco local (PGlite), nada remoto.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { aceitarTermos } from "./helpers/aceites";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const MINE = "20261003013610_tutor_personagem_no_perfil.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS, MINE), "utf8");
const UNDO = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013610_tutor_personagem_no_perfil.desfazer.sql"), "utf8");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const ANA = id(2); // preferência na Durona (Stazia)
const BIA = id(3); // preferência no Tranquilo (Stazi)
const CAIO = id(4); // nunca escolheu nada
const DUDA = id(5); // preferência na Tranquila (Stazia)
let db: PGlite;

const rpc = async <T = any>(uid: string | null, fn: string, args: unknown[] = []): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ r: T }>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)));
    return r.rows[0].r;
  });
/** Consulta direta como o aluno (role authenticated, RLS valendo). */
const asUser = async <T = any>(uid: string, q: string, p: unknown[] = []): Promise<{ rows: T[]; affectedRows?: number }> =>
  db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return tx.query<T>(q, p);
  });
const rows = async <T = any>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows;
const pref = async (uid: string) => (await rows(`select personality_id, profanity, "character" from public.tutor_preferences where user_id = $1`, [uid]))[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f < MINE).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  for (const [n, uid] of [["adm", ADMIN], ["ana", ANA], ["bia", BIA], ["caio", CAIO], ["duda", DUDA]] as const) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')`, [uid, `${n}@t.dev`]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  for (const uid of [ANA, BIA, CAIO, DUDA]) await aceitarTermos(db, uid);
  await db.query(`insert into public.tutor_preferences (user_id, personality_id, profanity) values ($1, 'durona', 'moderate'), ($2, 'acolhedor', 'off'), ($3, 'tranquila', 'off')`, [ANA, BIA, DUDA]);
  await db.exec(SQL);
  await db.exec(SQL); // pode ser colada de novo
}, 240_000);

describe("personagem no perfil (migração 013610)", () => {
  it("coluna nova, só 'stazi' ou 'stazia' (ou vazia)", async () => {
    const col = await rows(`select data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'tutor_preferences' and column_name = 'character'`);
    expect(col).toEqual([{ data_type: "text", is_nullable: "YES" }]);
    // o Direto (aposentado) não tem personagem, então o gatilho não sobrescreve: quem barra é a regra da coluna
    await expect(db.query(`insert into public.tutor_preferences (user_id, personality_id, "character") values ($1, 'direto', 'direto')`, [ADMIN])).rejects.toThrow(/tutor_preferences_character_check/);
  });

  it("quem já tinha preferência ganha o personagem da personalidade preferida; quem nunca escolheu fica sem linha", async () => {
    expect(await pref(ANA)).toEqual({ personality_id: "durona", profanity: "moderate", character: "stazia" });
    expect(await pref(BIA)).toEqual({ personality_id: "acolhedor", profanity: "off", character: "stazi" });
    expect(await pref(DUDA)).toEqual({ personality_id: "tranquila", profanity: "off", character: "stazia" });
    expect(await pref(CAIO)).toBeUndefined();
  });

  it("app_tutor_status devolve o personagem do perfil (vazio para quem nunca escolheu)", async () => {
    expect((await rpc<any>(ANA, "app_tutor_status")).preferences).toEqual({ personality_id: "durona", profanity: "moderate", chosen: true, character: "stazia" });
    expect((await rpc<any>(CAIO, "app_tutor_status")).preferences).toEqual({ personality_id: "acolhedor", profanity: "off", chosen: false, character: null });
  });

  it("tocar no personagem grava no perfil: no mesmo personagem nada muda; no outro, vai para a calma dele sem palavrão", async () => {
    // Ana já está na Durona (Stazia): tocar na Stazia não troca a professora nem o palavrão
    expect(await rpc(ANA, "app_tutor_set_character", ["stazia"])).toEqual({ personality_id: "durona", profanity: "moderate", chosen: true, character: "stazia" });
    // tocar no Stazi: Tranquilo, sem palavrão
    expect(await rpc(ANA, "app_tutor_set_character", ["stazi"])).toEqual({ personality_id: "acolhedor", profanity: "off", chosen: true, character: "stazi" });
    expect(await pref(ANA)).toEqual({ personality_id: "acolhedor", profanity: "off", character: "stazi" });
    expect((await rpc<any>(ANA, "app_tutor_status")).preferences.character).toBe("stazi");
    // quem nunca escolheu: a linha nasce com a calma do personagem tocado
    expect(await rpc(CAIO, "app_tutor_set_character", ["stazia"])).toMatchObject({ personality_id: "tranquila", profanity: "off", character: "stazia" });
    expect((await rpc<any>(CAIO, "app_tutor_status")).preferences).toEqual({ personality_id: "tranquila", profanity: "off", chosen: true, character: "stazia" });
  });

  it("valor inválido é recusado; sem login também", async () => {
    for (const v of ["direto", "STAZI", "", null]) await expect(rpc(BIA, "app_tutor_set_character", [v])).rejects.toThrow(/Personagem inválido/);
    await expect(rpc(null, "app_tutor_set_character", ["stazi"])).rejects.toThrow();
    expect(await pref(BIA)).toEqual({ personality_id: "acolhedor", profanity: "off", character: "stazi" });
  });

  it("aluno A não lê nem grava a linha de B", async () => {
    // ler: só a própria linha
    const visto = await asUser(BIA, `select user_id, "character" from public.tutor_preferences`);
    expect(visto.rows).toEqual([{ user_id: BIA, character: "stazi" }]);
    // gravar direto na tabela: nem a de outro aluno, nem a própria (só pelas funções)
    await asUser(BIA, `update public.tutor_preferences set "character" = 'stazia' where user_id = $1`, [DUDA]).catch(() => null);
    await asUser(BIA, `update public.tutor_preferences set "character" = 'stazia' where user_id = $1`, [BIA]).catch(() => null);
    await expect(asUser(BIA, `insert into public.tutor_preferences (user_id, personality_id, "character") values ($1, 'durao', 'stazi')`, [ADMIN])).rejects.toThrow();
    expect(await pref(DUDA)).toEqual({ personality_id: "tranquila", profanity: "off", character: "stazia" });
    expect(await pref(BIA)).toEqual({ personality_id: "acolhedor", profanity: "off", character: "stazi" });
    expect(await pref(ADMIN)).toBeUndefined();
    // a função só mexe na linha de quem está logado
    await rpc(BIA, "app_tutor_set_character", ["stazia"]);
    expect((await pref(BIA)).character).toBe("stazia");
    expect(await pref(DUDA)).toEqual({ personality_id: "tranquila", profanity: "off", character: "stazia" });
    await rpc(BIA, "app_tutor_set_character", ["stazi"]);
  });

  it("personalidade e personagem andam juntos: gravar uma personalidade do outro personagem leva o personagem junto", async () => {
    await db.query(`update public.tutor_config set enabled = true, requires_pro = false`);
    // Bia está no Stazi; salvar a Durona leva para a Stazia
    expect(await rpc(BIA, "app_tutor_save_preferences", [{ personality_id: "durona" }])).toMatchObject({ personality_id: "durona", character: "stazia" });
    expect((await pref(BIA)).character).toBe("stazia");
    // começar a conversa com o Durão leva para o Stazi
    await rpc(BIA, "app_tutor_start", ["livre", null, null, null, "durao"]);
    expect(await pref(BIA)).toMatchObject({ personality_id: "durao", character: "stazi" });
    // e a Tranquila, de volta à Stazia
    await rpc(BIA, "app_tutor_start", ["livre", null, null, null, "tranquila"]);
    expect(await pref(BIA)).toMatchObject({ personality_id: "tranquila", character: "stazia" });
    // gravar direto (equipe) um personagem que não bate com a personalidade não pega: a personalidade manda
    await db.query(`update public.tutor_preferences set "character" = 'stazi' where user_id = $1`, [BIA]);
    expect((await pref(BIA)).character).toBe("stazia");
    // nenhuma linha fica com personagem diferente do da personalidade
    const fora = await rows(`select p.user_id from public.tutor_preferences p join public.tutor_personalities t on t.id = p.personality_id
                             where t."character" is not null and p."character" is distinct from t."character"`);
    expect(fora).toEqual([]);
  });

  it("se a equipe desligar a calma, o toque vai para a outra personalidade ligada do personagem", async () => {
    await db.query(`update public.tutor_personalities set active = false where id = 'acolhedor'`);
    try {
      expect(await rpc(DUDA, "app_tutor_set_character", ["stazi"])).toMatchObject({ personality_id: "durao", character: "stazi" });
    } finally {
      await db.query(`update public.tutor_personalities set active = true where id = 'acolhedor'`);
    }
    expect(await rpc(DUDA, "app_tutor_set_character", ["stazia"])).toMatchObject({ personality_id: "tranquila", profanity: "off", character: "stazia" });
  });

  it("idempotente: colar de novo não muda as escolhas", async () => {
    const antes = await rows(`select user_id, personality_id, profanity, "character" from public.tutor_preferences order by user_id`);
    await db.exec(SQL);
    expect(await rows(`select user_id, personality_id, profanity, "character" from public.tutor_preferences order by user_id`)).toEqual(antes);
    expect((await rpc<any>(ANA, "app_tutor_status")).preferences).toMatchObject({ character: "stazi" });
  });

  it("desfazer tira a coluna e o campo; a migração entra de novo", async () => {
    await db.exec(UNDO);
    await db.exec(UNDO); // pode ser colado de novo
    expect((await rpc<any>(ANA, "app_tutor_status")).preferences).toEqual({ personality_id: "acolhedor", profanity: "off", chosen: true });
    expect(await rpc(ANA, "app_tutor_save_preferences", [{ personality_id: "acolhedor" }])).toEqual({ personality_id: "acolhedor", profanity: "off", chosen: true });
    expect("character" in (await rows(`select * from public.tutor_preferences where user_id = $1`, [ANA]))[0]).toBe(false);
    await expect(rpc(ANA, "app_tutor_set_character", ["stazi"])).rejects.toThrow();
    await db.exec(SQL);
    expect((await rpc<any>(ANA, "app_tutor_status")).preferences).toEqual({ personality_id: "acolhedor", profanity: "off", chosen: true, character: "stazi" });
  });
});
