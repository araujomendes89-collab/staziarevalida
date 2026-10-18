// @vitest-environment node
/**
 * Termo de Aceite e Uso no banco (supabase/migrations/…5300_termo_aceite.sql): WhatsApp no perfil, versões vigentes, tabela de
 * aceites (a prova) gravada só pelo servidor, cadastro que já grava o aceite, a função de aceitar, os dados de abertura do app
 * (se falta o aceite ou o WhatsApp) e a exportação dos dados com os aceites.
 * Spec: docs/superpowers/specs/2026-10-07-termo-aceite-cadastro-design.md (seções 7 e 9).
 */
import { beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
// migrações que dependem da 013740 (ramo termo-funcoes): ficam de fora enquanto a 013740 estiver de fora
const DEPOIS_DO_V3 = /^20261003013(800|810)_/;

const PHONE = "+5541999998888";
const SEM_LOGIN = "Entre na sua conta.";
const VERSAO_VELHA = "Versão desatualizada do termo.";
const TELEFONE_RUIM = "Informe o WhatsApp com código do país.";
const ORIGEM_RUIM = "Origem do aceite inválida.";
// Termo vigente 2.0 (…11510_termo_v2_ativar): o aceite do termo só vale com as declarações de maioridade e de médico.
const DECL = { declares_adult: "true", declares_physician: "true" };
const SIM = { p_adult: true, p_physician: true };

let db: PGlite;
let seq = 0;

const sha256 = (text: string) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

/** Chama uma função public.* como aluno logado (uid) ou como visitante (null), igual ao app. */
async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(
      `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
      keys.map((k) => args[k])
    );
    return r.rows[0].result;
  });
}

/** SQL direto com o papel do navegador (aluno logado ou visitante): serve para provar o que ele NÃO consegue fazer. */
async function asUser(uid: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return tx.query<any>(sql, params);
  });
}

/** A chamada tem que ser recusada: devolve a mensagem e o código SQLSTATE do erro. */
async function recusa(p: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await p;
  } catch (e: any) {
    return { message: e.message, code: e.code };
  }
  throw new Error("Era para recusar, mas passou.");
}

/** Cadastro sem sessão: insere em auth.users e o gatilho cria perfil, papel, teste e (se os metadados pedirem) o aceite. */
async function signUp(meta: Record<string, unknown> | null, email?: string | null) {
  const id = `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, "0")}`;
  const mail = email === undefined ? `aluno${seq}@teste.dev` : email;
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, mail, meta]);
  return { id, email: mail };
}

const acceptances = async (userId: string) =>
  (await db.query<any>(`select * from public.legal_acceptances where user_id = $1 order by id`, [userId])).rows;
const profile = async (userId: string) =>
  (await db.query<any>(`select name, phone from public.profiles where id = $1`, [userId])).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f !== "20261003013740_termo_v3.sql" && !DEPOIS_DO_V3.test(f)).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  // No Supabase real, auth.users.raw_user_meta_data aceita nulo; o stand-in do PGlite não. Igualar para testar o cadastro sem metadados.
  await db.exec(`alter table auth.users alter column raw_user_meta_data drop not null`);
}, 120_000);

describe("Termo — versões vigentes, tabela de aceites e permissões", () => {
  it("as versões vigentes são a 2.0 (Termo e Tutores) e a prova não guarda endereço de internet", async () => {
    expect((await db.query<any>(`select document, version from public.legal_versions order by document`)).rows).toEqual([
      { document: "termo_uso", version: "2.0" },
      { document: "tutor_ia", version: "2.0" },
    ]);
    const columns = await db.query<any>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'legal_acceptances' order by ordinal_position`
    );
    expect(columns.rows.map((c) => c.column_name)).toEqual(["id", "user_id", "document", "version", "accepted_at", "origin", "user_agent", "email_hash"]);
  });

  it("as duas tabelas têm RLS e as funções de apoio só abrem para o servidor", async () => {
    const tables = await db.query<any>(
      `select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and relname in ('legal_versions', 'legal_acceptances') order by relname`
    );
    expect(tables.rows).toEqual([
      { relname: "legal_acceptances", relrowsecurity: true },
      { relname: "legal_versions", relrowsecurity: true },
    ]);
    const open = await db.query<any>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('legal_email_hash', 'legal_is_student', 'legal_record')
         and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`
    );
    expect(open.rows).toEqual([]);
    const server = await db.query<any>(
      `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('legal_email_hash', 'legal_is_student', 'legal_record')
         and has_function_privilege('service_role', p.oid, 'execute')`
    );
    // 4: legal_record tem também a versão com as declarações (7 parâmetros, …11500_termo_v2_declaracoes), fechada do mesmo jeito
    expect(server.rows[0].n).toBe(4);
  });
});

describe("Termo — cadastro (gatilho de criação da conta)", () => {
  it("cadastro com metadados grava telefone e aceite 'cadastro' da versão vigente (sem sessão)", async () => {
    const { id } = await signUp({ name: "Ana", phone: PHONE, terms_version: "2.0", ...DECL, user_agent: "Teste/1" }, " Ana@Teste.dev ");

    expect(await profile(id)).toEqual({ name: "Ana", phone: PHONE });
    const rows = await acceptances(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: id,
      document: "termo_uso",
      version: "2.0",
      origin: "cadastro",
      user_agent: "Teste/1",
      email_hash: sha256("ana@teste.dev"),
    });
    // data e hora vêm do servidor
    expect(Math.abs(Date.now() - new Date(rows[0].accepted_at).getTime())).toBeLessThan(60_000);

    // o resto do cadastro continua como antes: papel de aluno e teste de 7 dias
    const rest = await db.query<any>(
      `select r.role, s.plan, s.status, (s.trial_ends_at - now()) > interval '6 days' as seven_days
       from public.user_roles r join public.subscriptions s on s.user_id = r.user_id where r.user_id = $1`,
      [id]
    );
    expect(rest.rows).toEqual([{ role: "student", plan: "trial", status: "trialing", seven_days: true }]);
  });

  it("versão errada ou metadados ruins não gravam aceite e não impedem a conta", async () => {
    // versão antiga do termo: sem aceite (o telefone válido entra mesmo assim)
    const velha = await signUp({ name: "Velha", phone: PHONE, terms_version: "0.9", user_agent: "T" });
    expect(await acceptances(velha.id)).toHaveLength(0);
    expect(await profile(velha.id)).toEqual({ name: "Velha", phone: PHONE });

    // telefone fora do formato: fica vazio, mas o aceite da versão vigente entra
    const ruim = await signUp({ name: "Ruim", phone: "abc", terms_version: "2.0", ...DECL });
    expect((await profile(ruim.id)).phone).toBeNull();
    expect(await acceptances(ruim.id)).toHaveLength(1);

    // tipos errados nos metadados (número, objeto): conta criada, nada gravado
    const tipos = await signUp({ name: "Tipos", phone: 5541999998888, terms_version: 2, user_agent: { a: 1 } });
    expect(await profile(tipos.id)).toEqual({ name: "Tipos", phone: null });
    expect(await acceptances(tipos.id)).toHaveLength(0);

    // navegador gigante: o aceite entra com os 300 primeiros caracteres
    const longo = await signUp({ terms_version: "2.0", ...DECL, user_agent: "x".repeat(500) });
    expect((await acceptances(longo.id))[0].user_agent).toBe("x".repeat(300));

    // sem metadados (nulos ou vazios): perfil, papel e teste criados, nenhum aceite
    for (const meta of [null, {}]) {
      const sem = await signUp(meta);
      expect(await profile(sem.id)).toEqual({ name: "", phone: null });
      expect(await acceptances(sem.id)).toHaveLength(0);
      const rest = await db.query<any>(
        `select r.role, s.plan, s.status from public.user_roles r join public.subscriptions s on s.user_id = r.user_id where r.user_id = $1`,
        [sem.id]
      );
      expect(rest.rows).toEqual([{ role: "student", plan: "trial", status: "trialing" }]);
    }
    // e a inserção sem a coluna de metadados (como as outras suítes fazem)
    const id = `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, "0")}`;
    await db.query(`insert into auth.users (id, email) values ($1, 'sem-coluna@teste.dev')`, [id]);
    expect((await db.query<any>(`select 1 from public.profiles where id = $1`, [id])).rows).toHaveLength(1);
  });

  it("um erro na parte nova não impede a conta e uma parte não derruba a outra", async () => {
    // o aceite falha (restrição que sempre recusa): conta e telefone entram, aceite não
    await db.exec(`alter table public.legal_acceptances add constraint teste_aceite_sempre_falha check (false) not valid`);
    try {
      const a = await signUp({ name: "A", phone: PHONE, terms_version: "2.0", ...DECL });
      expect(await profile(a.id)).toEqual({ name: "A", phone: PHONE });
      expect(await acceptances(a.id)).toHaveLength(0);
      expect((await db.query<any>(`select 1 from public.user_roles where user_id = $1`, [a.id])).rows).toHaveLength(1);
    } finally {
      await db.exec(`alter table public.legal_acceptances drop constraint teste_aceite_sempre_falha`);
    }

    // o telefone falha (restrição que sempre recusa): conta e aceite entram, telefone não
    await db.exec(`alter table public.profiles add constraint teste_sem_telefone check (phone is null) not valid`);
    try {
      const b = await signUp({ name: "B", phone: PHONE, terms_version: "2.0", ...DECL });
      expect(await profile(b.id)).toEqual({ name: "B", phone: null });
      expect(await acceptances(b.id)).toHaveLength(1);
      expect((await db.query<any>(`select 1 from public.subscriptions where user_id = $1`, [b.id])).rows).toHaveLength(1);
    } finally {
      await db.exec(`alter table public.profiles drop constraint teste_sem_telefone`);
    }
  });
});

describe("Termo — função de aceitar", () => {
  it("app_accept_terms: login, versão vigente, origem, telefone e repetição", async () => {
    const { id, email } = await signUp({ name: "Gabi" });

    expect(await recusa(rpc(null, "app_accept_terms_declared", { ...SIM, p_document: "termo_uso", p_version: "2.0" }))).toEqual({ message: SEM_LOGIN, code: "28000" });
    expect(await recusa(rpc(id, "app_accept_terms_declared", { ...SIM, p_document: "termo_uso", p_version: "0.9" }))).toEqual({ message: VERSAO_VELHA, code: "22023" });
    expect(await recusa(rpc(id, "app_accept_terms_declared", { ...SIM, p_document: "termo_uso", p_version: "2.0", p_origin: "cadastro" }))).toEqual({ message: ORIGEM_RUIM, code: "22023" });
    expect(await recusa(rpc(id, "app_accept_terms_declared", { ...SIM, p_document: "termo_uso", p_version: "2.0", p_origin: "qualquer" }))).toEqual({ message: ORIGEM_RUIM, code: "22023" });
    expect(await recusa(rpc(id, "app_accept_terms", { p_document: "tutor_ia", p_version: "2.0", p_origin: "tela_aceite" }))).toEqual({ message: ORIGEM_RUIM, code: "22023" });
    expect(await recusa(rpc(id, "app_accept_terms", { p_document: "tutor_ia", p_version: "2.0", p_origin: "google" }))).toEqual({ message: ORIGEM_RUIM, code: "22023" });
    for (const phone of ["123", "", "5541999998888", "+55 41 99999-8888"]) {
      expect(await recusa(rpc(id, "app_accept_terms_declared", { ...SIM, p_document: "termo_uso", p_version: "2.0", p_phone: phone }))).toEqual({ message: TELEFONE_RUIM, code: "22023" });
    }
    // documento que não existe
    expect(await recusa(rpc(id, "app_accept_terms", { p_document: "outro", p_version: "2.0" }))).toEqual({ message: "Documento inválido.", code: "22023" });
    // Termo 2.0: a versão velha (1.0) é recusada e, sem a declaração de maioridade, o aceite também (desde a …13661 a de médico não é exigida)
    expect(await recusa(rpc(id, "app_accept_terms_declared", { ...SIM, p_document: "termo_uso", p_version: "1.0" }))).toEqual({ message: VERSAO_VELHA, code: "22023" });
    const SEM_DECLARACAO = { message: "Confirme que você tem 18 anos ou mais.", code: "22023" };
    expect(await recusa(rpc(id, "app_accept_terms", { p_document: "termo_uso", p_version: "2.0" }))).toEqual(SEM_DECLARACAO);
    expect(await recusa(rpc(id, "app_accept_terms_declared", { p_document: "termo_uso", p_version: "2.0", p_adult: false, p_physician: true }))).toEqual(SEM_DECLARACAO);
    // nenhuma recusa deixou rastro: nem aceite, nem telefone
    expect(await acceptances(id)).toHaveLength(0);
    expect((await profile(id)).phone).toBeNull();

    const args = { ...SIM, p_document: "termo_uso", p_version: "2.0", p_origin: "tela_aceite", p_phone: PHONE, p_user_agent: "Navegador/2" };
    const first = await rpc(id, "app_accept_terms_declared", args);
    expect(first).toHaveProperty("profile");
    expect(first.profile).toMatchObject({ id, phone: PHONE });
    expect(first.role).toBe("student");

    // repetir não duplica, e a primeira prova é a que vale
    const second = await rpc(id, "app_accept_terms_declared", { ...args, p_origin: "google", p_user_agent: "Outro/3" });
    expect(second.profile.phone).toBe(PHONE);
    const rows = await acceptances(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ document: "termo_uso", version: "2.0", origin: "tela_aceite", user_agent: "Navegador/2", email_hash: sha256(email!.toLowerCase()) });

    // sem telefone na chamada, o que já está no perfil não muda
    await rpc(id, "app_accept_terms", { p_document: "tutor_ia", p_version: "2.0", p_origin: "tutor" });
    expect((await profile(id)).phone).toBe(PHONE);
  });

  it("as origens que valem: google e tela_aceite para o termo, só tutor para o Tutor", async () => {
    const google = await signUp({ name: "G" });
    await rpc(google.id, "app_accept_terms_declared", { ...SIM, p_document: "termo_uso", p_version: "2.0", p_origin: "google" });
    expect((await acceptances(google.id)).map((r) => [r.document, r.origin])).toEqual([["termo_uso", "google"]]);

    const tutor = await signUp({ name: "T" });
    await rpc(tutor.id, "app_accept_terms", { p_document: "tutor_ia", p_version: "2.0", p_origin: "tutor" });
    expect((await acceptances(tutor.id)).map((r) => [r.document, r.version, r.origin])).toEqual([["tutor_ia", "2.0", "tutor"]]);
  });

  it("versão nova do termo: a antiga é recusada, a nova grava outra linha e o cadastro velho não grava", async () => {
    const { id } = await signUp({ name: "Antes", terms_version: "2.0", ...DECL });
    const stamp = async () => (await db.query<any>(`select updated_at from public.legal_versions where document = 'termo_uso'`)).rows[0].updated_at as Date;
    const before = await stamp();
    await db.query(`update public.legal_versions set version = '2.1' where document = 'termo_uso'`);
    try {
      // trocar a versão vigente atualiza a data da linha
      expect((await stamp()).getTime()).toBeGreaterThan(before.getTime());

      const velho = await signUp({ name: "Velho", terms_version: "2.0", ...DECL });
      expect(await acceptances(velho.id)).toHaveLength(0);
      const novo = await signUp({ name: "Novo", terms_version: "2.1", ...DECL });
      expect((await acceptances(novo.id)).map((r) => r.version)).toEqual(["2.1"]);

      expect(await recusa(rpc(id, "app_accept_terms_declared", { ...SIM, p_document: "termo_uso", p_version: "2.0" }))).toEqual({ message: VERSAO_VELHA, code: "22023" });
      await rpc(id, "app_accept_terms_declared", { ...SIM, p_document: "termo_uso", p_version: "2.1" });
      expect((await acceptances(id)).map((r) => [r.version, r.origin])).toEqual([
        ["2.0", "cadastro"],
        ["2.1", "tela_aceite"],
      ]);
    } finally {
      await db.query(`update public.legal_versions set version = '2.0' where document = 'termo_uso'`);
    }
  });
});

describe("Termo — quem grava e quem lê", () => {
  it("ninguém grava aceite pelo navegador e cada um só lê os próprios", async () => {
    const ana = await signUp({ name: "Ana", terms_version: "2.0", ...DECL });
    const bruno = await signUp({ name: "Bruno", terms_version: "2.0", ...DECL });
    const insert = `insert into public.legal_acceptances (user_id, document, version, origin, email_hash) values ($1, 'tutor_ia', '2.0', 'tutor', 'x')`;

    // gravar, alterar e apagar: nada passa
    expect((await recusa(asUser(ana.id, insert, [ana.id]))).message).toMatch(/row-level security/);
    expect((await recusa(asUser(null, insert, [ana.id]))).message).toMatch(/row-level security|permission denied/);
    expect((await asUser(ana.id, `update public.legal_acceptances set origin = 'google'`)).affectedRows).toBe(0);
    expect((await asUser(ana.id, `delete from public.legal_acceptances`)).affectedRows).toBe(0);
    expect((await acceptances(ana.id)).map((r) => r.origin)).toEqual(["cadastro"]);

    // cada um lê só as próprias; visitante não lê nada
    const mine = await asUser(ana.id, `select user_id, document from public.legal_acceptances`);
    expect(mine.rows).toEqual([{ user_id: ana.id, document: "termo_uso" }]);
    expect((await asUser(bruno.id, `select user_id from public.legal_acceptances where user_id = $1`, [ana.id])).rows).toEqual([]);
    expect((await asUser(null, `select user_id from public.legal_acceptances`)).rows).toEqual([]);

    // versões vigentes: o navegador não lê nem muda
    expect((await asUser(ana.id, `select * from public.legal_versions`)).rows).toEqual([]);
    expect((await asUser(ana.id, `update public.legal_versions set version = '9.9'`)).affectedRows).toBe(0);
    expect((await recusa(asUser(ana.id, `insert into public.legal_versions (document, version) values ('termo_uso', '9.9')`))).message).toMatch(/row-level security|duplicate key/);
    expect((await db.query<any>(`select version from public.legal_versions order by document`)).rows).toEqual([{ version: "2.0" }, { version: "2.0" }]);

    // funções de apoio: só o servidor executa
    const calls: [string, unknown[]][] = [
      [`select public.legal_record($1, 'termo_uso', '2.0', 'google', null)`, [ana.id]],
      [`select public.legal_record($1, 'termo_uso', '2.0', 'google', null, true, true)`, [ana.id]],
      [`select public.legal_is_student($1)`, [ana.id]],
      [`select public.legal_email_hash('a@b.c')`, []],
    ];
    for (const [sql, params] of calls) {
      for (const who of [ana.id, null]) {
        const erro = await recusa(asUser(who, sql, params));
        expect(erro.message).toMatch(/permission denied for function/);
        expect(erro.code).toBe("42501");
      }
    }
  });

  it("telefone fora do formato não entra nem direto pela tabela", async () => {
    const { id } = await signUp({ name: "Direto" });
    const set = (phone: string | null) => asUser(id, `update public.profiles set phone = $2 where id = $1`, [id, phone]);

    for (const ruim of ["5541999", "+5541", "+0541999998888", "+55 41 99999-8888", "+5541999998888 ", "+5541999998888\n", "+1234567890123456", "abc", ""]) {
      const erro = await recusa(set(ruim));
      expect(erro.code).toBe("23514");
      expect(erro.message).toMatch(/profiles_phone_check/);
    }
    expect((await profile(id)).phone).toBeNull();

    for (const bom of ["+12345678", PHONE, "+123456789012345", null]) {
      expect((await set(bom)).affectedRows).toBe(1);
    }
    expect((await profile(id)).phone).toBeNull();
  });
});

describe("Termo — Minha conta (app_update_profile)", () => {
  it("app_update_profile aceita phone válido e recusa vazio ou inválido", async () => {
    const { id } = await signUp({ name: "Perfil" });

    const ok = await rpc(id, "app_update_profile", { p_patch: { phone: "+351912345678" } });
    expect(ok.profile.phone).toBe("+351912345678");

    for (const ruim of ["", "123", null, "5541999998888", "+55 41 99999-8888", 5541999998888]) {
      expect(await recusa(rpc(id, "app_update_profile", { p_patch: { phone: ruim } }))).toEqual({ message: TELEFONE_RUIM, code: "22023" });
    }
    expect((await profile(id)).phone).toBe("+351912345678");

    // sem a chave phone, o telefone fica como está
    const nome = await rpc(id, "app_update_profile", { p_patch: { name: "Perfil Dois" } });
    expect(nome.profile).toMatchObject({ name: "Perfil Dois", phone: "+351912345678" });
  });

  it("app_update_profile segue com todos os campos de antes e as mesmas recusas", async () => {
    const { id } = await signUp({ name: "Campos" });
    const patch = {
      name: "Campos Silva",
      avatar_seed: "semente",
      phase: 2,
      exam_type: "ENAMED",
      target_edition: "2027/1",
      exam_date: "2027-03-01",
      daily_minutes: 90,
      study_days_per_week: 5,
      graduation_country: "Brasil",
      graduation_university: "USP",
      graduation_year: 2020,
      theme: "dark",
      timezone: "America/Manaus",
      phone: PHONE,
    };
    const boot = await rpc(id, "app_update_profile", { p_patch: patch });
    expect(boot.profile).toMatchObject(patch);
    expect(boot).toHaveProperty("role", "student");

    expect(await recusa(rpc(id, "app_update_profile", { p_patch: { phone: "+5511988887777", role: "admin" } }))).toEqual({
      message: "Campo de perfil não permitido: role",
      code: "22023",
    });
    expect(await recusa(rpc(id, "app_update_profile", { p_patch: { timezone: "Nao/Existe" } }))).toEqual({ message: "Fuso horário inválido.", code: "22023" });
    // a recusa não gravou nada do que vinha junto
    expect((await profile(id)).phone).toBe(PHONE);
  });
});

describe("Termo — conta apagada", () => {
  it("conta apagada mantém a prova sem a pessoa", async () => {
    const { id } = await signUp({ name: "Davi", phone: PHONE, terms_version: "2.0", ...DECL, user_agent: "UA/D" }, "Davi@Teste.dev");
    const [antes] = await acceptances(id);
    expect(antes).toMatchObject({ document: "termo_uso", version: "2.0", origin: "cadastro", email_hash: sha256("davi@teste.dev") });

    expect(await rpc(id, "app_delete_my_account", { p_confirm: "EXCLUIR" })).toBe(true);
    expect((await db.query<any>(`select 1 from public.profiles where id = $1`, [id])).rows).toHaveLength(0);

    const depois = (await db.query<any>(`select * from public.legal_acceptances where id = $1`, [antes.id])).rows[0];
    expect(depois.user_id).toBeNull();
    expect(depois).toMatchObject({
      document: antes.document,
      version: antes.version,
      origin: antes.origin,
      user_agent: antes.user_agent,
      email_hash: antes.email_hash,
    });
    expect(depois.accepted_at).toEqual(antes.accepted_at);
  });

  it("conta criada de novo com o mesmo e-mail aceita de novo e a prova antiga continua", async () => {
    const velha = await signUp({ name: "Eva", terms_version: "2.0", ...DECL }, "Eva@Teste.dev");
    await rpc(velha.id, "app_delete_my_account", { p_confirm: "EXCLUIR" });

    const nova = await signUp({ name: "Eva", terms_version: "2.0", ...DECL }, " eva@teste.dev");
    const rows = (await db.query<any>(`select user_id, version, origin from public.legal_acceptances where email_hash = $1 order by id`, [sha256("eva@teste.dev")])).rows;
    expect(rows).toEqual([
      { user_id: null, version: "2.0", origin: "cadastro" },
      { user_id: nova.id, version: "2.0", origin: "cadastro" },
    ]);
  });
});

describe("Termo — funções de apoio (só o servidor)", () => {
  it("legal_email_hash: SHA-256 em hexadecimal do e-mail aparado e em minúsculas", async () => {
    const hash = async (email: string | null) => (await db.query<any>(`select public.legal_email_hash($1) as h`, [email])).rows[0].h;
    expect(await hash("  Ana@Teste.DEV ")).toBe(sha256("ana@teste.dev"));
    expect(await hash("ana@teste.dev")).toBe(sha256("ana@teste.dev"));
    expect(await hash("outra@teste.dev")).not.toBe(sha256("ana@teste.dev"));
    expect(await hash(null)).toBeNull();
  });

  it("legal_is_student: papel de aluno e nenhuma área de revisão médica", async () => {
    const isStudent = async (id: string | null) => (await db.query<any>(`select public.legal_is_student($1) as v`, [id])).rows[0].v;
    const aluno = await signUp({ name: "Aluno" });
    const admin = await signUp({ name: "Admin" });
    const editor = await signUp({ name: "Editor" });
    const revisor = await signUp({ name: "Revisor" });
    await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [admin.id]);
    await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [editor.id]);
    await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [revisor.id]);

    expect(await isStudent(aluno.id)).toBe(true);
    expect(await isStudent(admin.id)).toBe(false);
    expect(await isStudent(editor.id)).toBe(false);
    expect(await isStudent(revisor.id)).toBe(false);
    expect(await isStudent("00000000-0000-4000-8000-0000ffffffff")).toBe(false);
    expect(await isStudent(null)).toBe(false);

    // quem volta a ser aluno passa a valer; revisor que perde as áreas também
    await db.query(`update public.user_roles set role = 'student' where user_id = $1`, [editor.id]);
    await db.query(`delete from public.ch_reviewer_areas where user_id = $1`, [revisor.id]);
    expect(await isStudent(editor.id)).toBe(true);
    expect(await isStudent(revisor.id)).toBe(true);
  });

  it("legal_record: versão vigente, sem duplicar e só para quem existe", async () => {
    const { id } = await signUp({ name: "Record" }, "Record@Teste.dev");
    const record = (user: string | null, document: string, version: string, origin = "google", ua: string | null = "UA/R") =>
      db.query(`select public.legal_record($1, $2, $3, $4, $5, true, true)`, [user, document, version, origin, ua]);

    expect(await recusa(record(id, "termo_uso", "0.9"))).toEqual({ message: VERSAO_VELHA, code: "22023" });
    expect(await recusa(record(id, "outro", "2.0"))).toEqual({ message: "Documento inválido.", code: "22023" });
    expect(await recusa(record(null, "termo_uso", "2.0"))).toEqual({ message: SEM_LOGIN, code: "28000" });
    expect(await recusa(record("00000000-0000-4000-8000-0000ffffffff", "termo_uso", "2.0"))).toEqual({ message: SEM_LOGIN, code: "28000" });
    expect(await acceptances(id)).toHaveLength(0);

    await record(id, "termo_uso", "2.0");
    await record(id, "termo_uso", "2.0", "tela_aceite", "UA/Outro");
    await record(id, "tutor_ia", "2.0", "tutor", null);
    const rows = await acceptances(id);
    expect(rows.map((r) => [r.document, r.version, r.origin, r.user_agent])).toEqual([
      ["termo_uso", "2.0", "google", "UA/R"],
      ["tutor_ia", "2.0", "tutor", null],
    ]);
    expect(rows.every((r) => r.email_hash === sha256("record@teste.dev"))).toBe(true);
  });
});

describe("Termo — dados de abertura do app (app_bootstrap → legal)", () => {
  const abertura = async (uid: string | null) => rpc(uid, "app_bootstrap");
  const legal = async (uid: string) => (await abertura(uid)).legal;

  it("abertura: aluno sem aceite precisa da tela; com o aceite, não (o WhatsApp não trava mais: …13660, 17/10/2026)", async () => {
    // conta recém-criada, sem nada (como a do Google): precisa da tela
    const nova = await signUp({ name: "Nova" });
    expect(await legal(nova.id)).toEqual({
      termo_uso: { current: "2.0", accepted: null, accepted_at: null },
      tutor_ia: { current: "2.0", accepted: null, accepted_at: null },
      student: true,
      phone_missing: true,
      gate_required: true,
      declarations_required: true,
    });

    // com WhatsApp e sem aceite: precisa
    const soTelefone = await signUp({ name: "So telefone", phone: PHONE });
    expect(await legal(soTelefone.id)).toMatchObject({
      termo_uso: { current: "2.0", accepted: null, accepted_at: null },
      student: true,
      phone_missing: false,
      gate_required: true,
    });

    // com aceite e sem WhatsApp: não precisa mais (phone_missing só informa)
    const soAceite = await signUp({ name: "So aceite", terms_version: "2.0", ...DECL });
    const semZap = await legal(soAceite.id);
    expect(semZap).toMatchObject({ student: true, phone_missing: true, gate_required: false });
    expect(semZap.termo_uso).toMatchObject({ current: "2.0", accepted: "2.0" });

    // com os dois: não precisa; a versão aceita e a data vêm da prova gravada
    const completo = await signUp({ name: "Completo", phone: PHONE, terms_version: "2.0", ...DECL });
    const ok = await legal(completo.id);
    expect(ok).toMatchObject({ student: true, phone_missing: false, gate_required: false });
    expect(ok.termo_uso).toMatchObject({ current: "2.0", accepted: "2.0", accepted_at: expect.any(String) });
    const [prova] = await acceptances(completo.id);
    expect(new Date(ok.termo_uso.accepted_at).getTime()).toBe(new Date(prova.accepted_at).getTime());
    expect(Math.abs(Date.now() - new Date(ok.termo_uso.accepted_at).getTime())).toBeLessThan(60_000);
  });

  it("abertura: o aceite dos Tutores é separado e não libera nem trava a tela", async () => {
    // termo + WhatsApp bastam para a tela de aceite; o Tutor tem cartão próprio
    const { id } = await signUp({ name: "Tutor", phone: PHONE, terms_version: "2.0", ...DECL });
    const antes = await legal(id);
    expect(antes.tutor_ia).toEqual({ current: "2.0", accepted: null, accepted_at: null });
    expect(antes.gate_required).toBe(false);

    await rpc(id, "app_accept_terms", { p_document: "tutor_ia", p_version: "2.0", p_origin: "tutor" });
    const depois = await legal(id);
    expect(depois.tutor_ia).toMatchObject({ current: "2.0", accepted: "2.0", accepted_at: expect.any(String) });
    expect(depois.termo_uso.accepted).toBe("2.0");
    expect(depois.gate_required).toBe(false);

    // só o aceite do Tutor não libera a tela do termo
    const soTutor = await signUp({ name: "So Tutor", phone: PHONE });
    await rpc(soTutor.id, "app_accept_terms", { p_document: "tutor_ia", p_version: "2.0", p_origin: "tutor" });
    const l = await legal(soTutor.id);
    expect(l.tutor_ia.accepted).toBe("2.0");
    expect(l.termo_uso.accepted).toBeNull();
    expect(l.gate_required).toBe(true);
  });

  it("abertura: versão nova do termo pede o aceite de novo, e desfazer a troca não prende ninguém", async () => {
    const antigo = await signUp({ name: "Antigo", phone: PHONE, terms_version: "2.0", ...DECL });
    expect((await legal(antigo.id)).gate_required).toBe(false);

    await db.query(`update public.legal_versions set version = '2.1' where document = 'termo_uso'`);
    try {
      // versão nova: a pessoa continua com a 2.0 aceita (a versão aceita aparece como é) e a tela volta
      const velha = await legal(antigo.id);
      expect(velha.termo_uso).toMatchObject({ current: "2.1", accepted: "2.0", accepted_at: expect.any(String) });
      expect(velha.gate_required).toBe(true);

      // aceitou a nova: a tela some, e a resposta do aceite já traz isso
      const aceitou = await rpc(antigo.id, "app_accept_terms_declared", { ...SIM, p_document: "termo_uso", p_version: "2.1" });
      expect(aceitou.legal.termo_uso).toMatchObject({ current: "2.1", accepted: "2.1" });
      expect(aceitou.legal.gate_required).toBe(false);

      // cadastro feito já com a 2.1 (a vigente na hora)
      const novo = await signUp({ name: "Novo", phone: PHONE, terms_version: "2.1", ...DECL });
      expect((await legal(novo.id)).gate_required).toBe(false);

      // a troca é desfeita (volta a 2.0): quem aceitou a 2.0 continua aceito, mesmo tendo aceitado a 2.1 depois
      await db.query(`update public.legal_versions set version = '2.0' where document = 'termo_uso'`);
      const volta = await legal(antigo.id);
      expect(volta.termo_uso).toMatchObject({ current: "2.0", accepted: "2.0" });
      expect(volta.gate_required).toBe(false);

      // quem só tinha a 2.1 vê a tela e, ao aceitar a 2.0, ela some (não fica num ciclo sem saída)
      const so11 = await legal(novo.id);
      expect(so11.termo_uso).toMatchObject({ current: "2.0", accepted: "2.1" });
      expect(so11.gate_required).toBe(true);
      const livre = await rpc(novo.id, "app_accept_terms_declared", { ...SIM, p_document: "termo_uso", p_version: "2.0" });
      expect(livre.legal.termo_uso).toMatchObject({ current: "2.0", accepted: "2.0" });
      expect(livre.legal.gate_required).toBe(false);
    } finally {
      await db.query(`update public.legal_versions set version = '2.0' where document = 'termo_uso'`);
    }
  });

  it("abertura: equipe e revisor médico nunca precisam; quem volta a ser aluno passa a precisar", async () => {
    const admin = await signUp({ name: "Admin" });
    const editor = await signUp({ name: "Editor" });
    const revisor = await signUp({ name: "Revisor" });
    await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [admin.id]);
    await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [editor.id]);
    await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [revisor.id]);

    // sem aceite e sem WhatsApp, e a tela não vale para eles
    for (const pessoa of [admin, editor, revisor]) {
      expect(await legal(pessoa.id)).toEqual({
        termo_uso: { current: "2.0", accepted: null, accepted_at: null },
        tutor_ia: { current: "2.0", accepted: null, accepted_at: null },
        student: false,
        phone_missing: true,
        gate_required: false,
        declarations_required: true,
      });
    }

    // o administrador rebaixa o editor: ele passa a ser aluno e a tela vale
    await rpc(admin.id, "app_admin_set_role", { p_user_id: editor.id, p_role: "student" });
    expect(await legal(editor.id)).toMatchObject({ student: true, phone_missing: true, gate_required: true });

    // revisor que perde as áreas de revisão também volta a valer
    await db.query(`delete from public.ch_reviewer_areas where user_id = $1`, [revisor.id]);
    expect(await legal(revisor.id)).toMatchObject({ student: true, gate_required: true });

    // e o caminho contrário: editor de novo, tela dispensada
    await rpc(admin.id, "app_admin_set_role", { p_user_id: editor.id, p_role: "editor" });
    expect(await legal(editor.id)).toMatchObject({ student: false, gate_required: false });

    // um aluno que vira revisor também deixa de precisar
    const aluno = await signUp({ name: "Aluno" });
    expect((await legal(aluno.id)).gate_required).toBe(true);
    await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CIRURGIA')`, [aluno.id]);
    expect(await legal(aluno.id)).toMatchObject({ student: false, gate_required: false });
  });

  it("abertura: sem login, legal é nulo e cada pessoa só vê o próprio estado", async () => {
    const ana = await signUp({ name: "Ana", phone: PHONE, terms_version: "2.0", ...DECL });
    const bruno = await signUp({ name: "Bruno" });

    expect(await abertura(null)).toHaveProperty("legal", null);
    expect(await rpc(null, "app_legal_state")).toBeNull();

    expect(await rpc(ana.id, "app_legal_state")).toMatchObject({ gate_required: false, phone_missing: false, termo_uso: { accepted: "2.0" } });
    expect(await rpc(bruno.id, "app_legal_state")).toMatchObject({ gate_required: true, phone_missing: true, termo_uso: { accepted: null } });
    // a abertura traz o mesmo estado que a função
    expect(await legal(ana.id)).toEqual(await rpc(ana.id, "app_legal_state"));
  });

  it("abertura mantém todas as chaves de antes", async () => {
    const { id } = await signUp({ name: "Chaves", phone: PHONE, terms_version: "2.0", ...DECL });
    const antes = ["profile", "role", "reviewer_areas", "subscription", "has_pro", "streak_days", "flashcards_due", "days_to_exam", "totals", "play"];

    const boot = await abertura(id);
    expect(Object.keys(boot)).toEqual(expect.arrayContaining([...antes, "legal"]));
    expect(boot.profile).toMatchObject({ id, name: "Chaves", phone: PHONE, phase: 1, theme: "light" });
    expect(boot.profile).not.toHaveProperty("onboarding");
    expect(boot).toMatchObject({
      role: "student",
      reviewer_areas: [],
      has_pro: false,
      streak_days: 0,
      flashcards_due: 0,
      days_to_exam: null,
      subscription: { plan: "trial", status: "trialing", trial_ends_at: expect.any(String), current_period_end: null },
      totals: { questions: expect.any(Number), answered: 0 },
      play: {
        enabled: true,
        flags: { leaderboard: expect.any(Boolean), leagues: expect.any(Boolean), coins: expect.any(Boolean), trail: expect.any(Boolean) },
        names: { score: expect.any(String), coins: expect.any(String) },
        streak: 0,
        provisional: expect.any(Boolean),
        level: expect.any(String),
        coins: 0,
      },
    });
    expect(boot.play).toHaveProperty("score");

    // o resto da abertura reage como antes: perfil (aqui, o dia da prova), revisor e sequência
    await rpc(id, "app_update_profile", { p_patch: { exam_date: "2099-01-01" } });
    expect((await abertura(id)).days_to_exam).toBeGreaterThan(1000);
    await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [id]);
    expect((await abertura(id)).reviewer_areas).toEqual(["PEDIATRIA"]);

    // visitante: as mesmas chaves de antes, vazias como antes, e só legal nulo
    const visitante = await abertura(null);
    expect(Object.keys(visitante)).toEqual(expect.arrayContaining([...antes, "legal"]));
    expect(visitante).toMatchObject({ profile: null, subscription: null, has_pro: false, legal: null });
  });

  it("aceitar e atualizar o WhatsApp devolvem a abertura já com o estado novo", async () => {
    // tela de aceite: termo e WhatsApp numa chamada
    const { id } = await signUp({ name: "Fluxo" });
    expect((await legal(id)).gate_required).toBe(true);
    const aceitou = await rpc(id, "app_accept_terms_declared", { ...SIM, p_document: "termo_uso", p_version: "2.0", p_origin: "google", p_phone: PHONE });
    expect(aceitou.legal).toMatchObject({
      student: true,
      phone_missing: false,
      gate_required: false,
      termo_uso: { current: "2.0", accepted: "2.0", accepted_at: expect.any(String) },
    });

    // aluno que aceitou o termo no cadastro e está sem WhatsApp: já não vê a tela; Minha conta grava o WhatsApp (opcional)
    const semZap = await signUp({ name: "Sem zap", terms_version: "2.0", ...DECL });
    expect(await legal(semZap.id)).toMatchObject({ phone_missing: true, gate_required: false });
    const salvou = await rpc(semZap.id, "app_update_profile", { p_patch: { phone: PHONE } });
    expect(salvou.legal).toMatchObject({ phone_missing: false, gate_required: false, termo_uso: { accepted: "2.0" } });
  });

  it("app_legal_state abre para quem entra e roda com os direitos do servidor; a abertura e a exportação seguem com os de quem chama", async () => {
    const r = await db.query<any>(
      `select p.proname, p.prosecdef, p.provolatile, p.pronargs,
              has_function_privilege('anon', p.oid, 'execute') as anon_executa,
              has_function_privilege('authenticated', p.oid, 'execute') as logado_executa,
              coalesce(p.proconfig, '{}'::text[]) as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('app_legal_state', 'app_bootstrap', 'app_export_my_data') order by p.proname`
    );
    const f = Object.fromEntries(r.rows.map((x) => [x.proname, x]));
    expect(Object.keys(f)).toEqual(["app_bootstrap", "app_export_my_data", "app_legal_state"]);

    // sem parâmetros (ninguém pede o estado de outra pessoa), estável, sem caminho de busca aberto e aberta para visitante e para quem entra
    expect(f.app_legal_state).toMatchObject({ prosecdef: true, provolatile: "s", pronargs: 0, anon_executa: true, logado_executa: true });
    expect(f.app_legal_state.config).toEqual(['search_path=""']);

    // a abertura e a exportação não ganharam poderes: continuam com os direitos de quem chama
    for (const nome of ["app_bootstrap", "app_export_my_data"]) {
      expect(f[nome]).toMatchObject({ prosecdef: false, provolatile: "s", anon_executa: true, logado_executa: true });
      expect(f[nome].config).toEqual(['search_path=""']);
    }
  });
});

describe("Termo — exportação dos dados (app_export_my_data → acceptances)", () => {
  const acceptanceKeys = ["accepted_at", "document", "origin", "user_agent", "version"];

  it("exportação inclui os aceites da pessoa", async () => {
    const { id } = await signUp({ name: "Export", phone: PHONE, terms_version: "2.0", ...DECL, user_agent: "UA/Export" });
    await rpc(id, "app_accept_terms", { p_document: "tutor_ia", p_version: "2.0", p_origin: "tutor", p_user_agent: "UA/Tutor" });

    const data = await rpc(id, "app_export_my_data");
    expect(data.acceptances).toEqual([
      { document: "termo_uso", version: "2.0", accepted_at: expect.any(String), origin: "cadastro", user_agent: "UA/Export" },
      { document: "tutor_ia", version: "2.0", accepted_at: expect.any(String), origin: "tutor", user_agent: "UA/Tutor" },
    ]);
    // a data exportada é a da prova gravada
    const provas = await acceptances(id);
    expect(data.acceptances.map((a: any) => new Date(a.accepted_at).getTime())).toEqual(provas.map((p) => new Date(p.accepted_at).getTime()));
    expect(data.acceptances.every((a: any) => Object.keys(a).sort().join() === acceptanceKeys.join())).toBe(true);
  });

  it("exportação: em ordem de data, só da pessoa, e sem aceites o campo vem vazio", async () => {
    const eu = await signUp({ name: "Eu", phone: PHONE, terms_version: "2.0", ...DECL, user_agent: "UA/Eu" }, "eu@teste.dev");
    const outra = await signUp({ name: "Outra", phone: PHONE, terms_version: "2.0", ...DECL, user_agent: "UA/Outra" }, "outra@teste.dev");
    const apagada = await signUp({ name: "Apagada", terms_version: "2.0", ...DECL, user_agent: "UA/Apagada" }, "apagada@teste.dev");
    await rpc(apagada.id, "app_delete_my_account", { p_confirm: "EXCLUIR" });

    // gravado por último, mas com data de antes: a ordem é pela data, não pela ordem de gravação
    await db.query(
      `insert into public.legal_acceptances (user_id, document, version, origin, email_hash, accepted_at)
       values ($1, 'tutor_ia', '2.0', 'tutor', 'x', now() - interval '2 days'),
              ($1, 'termo_uso', '0.9', 'google', 'x', now() - interval '30 days')`,
      [eu.id]
    );
    const data = await rpc(eu.id, "app_export_my_data");
    expect(data.acceptances.map((a: any) => [a.document, a.version, a.origin])).toEqual([
      ["termo_uso", "0.9", "google"],
      ["tutor_ia", "2.0", "tutor"],
      ["termo_uso", "2.0", "cadastro"],
    ]);
    const datas = data.acceptances.map((a: any) => new Date(a.accepted_at).getTime());
    expect(datas).toEqual([...datas].sort((a, b) => a - b));

    // nada da outra pessoa nem da conta apagada (a prova dela fica sem ligação com ninguém)
    const tudo = JSON.stringify(data);
    for (const alheio of [outra.id, apagada.id, "UA/Outra", "UA/Apagada", sha256("outra@teste.dev"), sha256("apagada@teste.dev")]) {
      expect(tudo).not.toContain(alheio);
    }
    expect((await db.query<any>(`select count(*)::int as n from public.legal_acceptances where user_id is null`)).rows[0].n).toBeGreaterThan(0);

    // o filtro da própria função vale mesmo para quem passa por cima do RLS (papel de serviço com as claims da pessoa)
    const pelaFuncao = await db.transaction(async (tx) => {
      await tx.exec(`set local role service_role`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: eu.id })]);
      return (await tx.query<any>(`select public.app_export_my_data() as result`)).rows[0].result;
    });
    expect(pelaFuncao.acceptances).toEqual(data.acceptances);

    // quem não aceitou nada recebe a lista vazia (não nulo)
    const sem = await signUp({ name: "Sem aceite" });
    expect((await rpc(sem.id, "app_export_my_data")).acceptances).toEqual([]);
  });

  it("exportação mantém todas as chaves de antes e sem login continua nula", async () => {
    const { id } = await signUp({ name: "Antes", terms_version: "2.0", ...DECL });
    const antes = [
      "exported_at", "account", "profile", "role", "subscription", "practice_sessions", "question_attempts", "question_bookmarks",
      "error_notes", "plan_tasks", "flashcards", "flashcard_states", "flashcard_reviews", "checklist_favorites",
      "checklist_station_reports", "checklist_event_confirmations", "checklist_study_sessions",
    ];
    const data = await rpc(id, "app_export_my_data");
    expect(Object.keys(data)).toEqual(expect.arrayContaining([...antes, "acceptances"]));
    expect(data).toMatchObject({ account: { id }, profile: { id, name: "Antes" }, role: "student", subscription: { plan: "trial" } });
    expect(data.subscription).not.toHaveProperty("provider_customer_id");

    expect(await rpc(null, "app_export_my_data")).toBeNull();
  });
});
