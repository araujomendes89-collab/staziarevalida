// @vitest-environment node
/**
 * Termo de Aceite e Uso no banco (supabase/migrations/…5300_termo_aceite.sql): WhatsApp no perfil, versões vigentes, tabela de
 * aceites (a prova) gravada só pelo servidor, cadastro que já grava o aceite e a função de aceitar.
 * Spec: docs/superpowers/specs/2026-10-07-termo-aceite-cadastro-design.md (seção 9).
 */
import { beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

const PHONE = "+5541999998888";
const SEM_LOGIN = "Entre na sua conta.";
const VERSAO_VELHA = "Versão desatualizada do termo.";
const TELEFONE_RUIM = "Informe o WhatsApp com código do país.";
const ORIGEM_RUIM = "Origem do aceite inválida.";

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
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  // No Supabase real, auth.users.raw_user_meta_data aceita nulo; o stand-in do PGlite não. Igualar para testar o cadastro sem metadados.
  await db.exec(`alter table auth.users alter column raw_user_meta_data drop not null`);
}, 120_000);

describe("Termo — versões vigentes, tabela de aceites e permissões", () => {
  it("as versões começam em 1.0 e a prova não guarda endereço de internet", async () => {
    expect((await db.query<any>(`select document, version from public.legal_versions order by document`)).rows).toEqual([
      { document: "termo_uso", version: "1.0" },
      { document: "tutor_ia", version: "1.0" },
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
    expect(server.rows[0].n).toBe(3);
  });
});

describe("Termo — cadastro (gatilho de criação da conta)", () => {
  it("cadastro com metadados grava telefone e aceite 'cadastro' da versão vigente (sem sessão)", async () => {
    const { id } = await signUp({ name: "Ana", phone: PHONE, terms_version: "1.0", user_agent: "Teste/1" }, " Ana@Teste.dev ");

    expect(await profile(id)).toEqual({ name: "Ana", phone: PHONE });
    const rows = await acceptances(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: id,
      document: "termo_uso",
      version: "1.0",
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
    const ruim = await signUp({ name: "Ruim", phone: "abc", terms_version: "1.0" });
    expect((await profile(ruim.id)).phone).toBeNull();
    expect(await acceptances(ruim.id)).toHaveLength(1);

    // tipos errados nos metadados (número, objeto): conta criada, nada gravado
    const tipos = await signUp({ name: "Tipos", phone: 5541999998888, terms_version: 2, user_agent: { a: 1 } });
    expect(await profile(tipos.id)).toEqual({ name: "Tipos", phone: null });
    expect(await acceptances(tipos.id)).toHaveLength(0);

    // navegador gigante: o aceite entra com os 300 primeiros caracteres
    const longo = await signUp({ terms_version: "1.0", user_agent: "x".repeat(500) });
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
      const a = await signUp({ name: "A", phone: PHONE, terms_version: "1.0" });
      expect(await profile(a.id)).toEqual({ name: "A", phone: PHONE });
      expect(await acceptances(a.id)).toHaveLength(0);
      expect((await db.query<any>(`select 1 from public.user_roles where user_id = $1`, [a.id])).rows).toHaveLength(1);
    } finally {
      await db.exec(`alter table public.legal_acceptances drop constraint teste_aceite_sempre_falha`);
    }

    // o telefone falha (restrição que sempre recusa): conta e aceite entram, telefone não
    await db.exec(`alter table public.profiles add constraint teste_sem_telefone check (phone is null) not valid`);
    try {
      const b = await signUp({ name: "B", phone: PHONE, terms_version: "1.0" });
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

    expect(await recusa(rpc(null, "app_accept_terms", { p_document: "termo_uso", p_version: "1.0" }))).toEqual({ message: SEM_LOGIN, code: "28000" });
    expect(await recusa(rpc(id, "app_accept_terms", { p_document: "termo_uso", p_version: "0.9" }))).toEqual({ message: VERSAO_VELHA, code: "22023" });
    expect(await recusa(rpc(id, "app_accept_terms", { p_document: "termo_uso", p_version: "1.0", p_origin: "cadastro" }))).toEqual({ message: ORIGEM_RUIM, code: "22023" });
    expect(await recusa(rpc(id, "app_accept_terms", { p_document: "termo_uso", p_version: "1.0", p_origin: "qualquer" }))).toEqual({ message: ORIGEM_RUIM, code: "22023" });
    expect(await recusa(rpc(id, "app_accept_terms", { p_document: "tutor_ia", p_version: "1.0", p_origin: "tela_aceite" }))).toEqual({ message: ORIGEM_RUIM, code: "22023" });
    expect(await recusa(rpc(id, "app_accept_terms", { p_document: "tutor_ia", p_version: "1.0", p_origin: "google" }))).toEqual({ message: ORIGEM_RUIM, code: "22023" });
    for (const phone of ["123", "", "5541999998888", "+55 41 99999-8888"]) {
      expect(await recusa(rpc(id, "app_accept_terms", { p_document: "termo_uso", p_version: "1.0", p_phone: phone }))).toEqual({ message: TELEFONE_RUIM, code: "22023" });
    }
    // documento que não existe
    expect(await recusa(rpc(id, "app_accept_terms", { p_document: "outro", p_version: "1.0" }))).toEqual({ message: "Documento inválido.", code: "22023" });
    // nenhuma recusa deixou rastro: nem aceite, nem telefone
    expect(await acceptances(id)).toHaveLength(0);
    expect((await profile(id)).phone).toBeNull();

    const args = { p_document: "termo_uso", p_version: "1.0", p_origin: "tela_aceite", p_phone: PHONE, p_user_agent: "Navegador/2" };
    const first = await rpc(id, "app_accept_terms", args);
    expect(first).toHaveProperty("profile");
    expect(first.profile).toMatchObject({ id, phone: PHONE });
    expect(first.role).toBe("student");

    // repetir não duplica, e a primeira prova é a que vale
    const second = await rpc(id, "app_accept_terms", { ...args, p_origin: "google", p_user_agent: "Outro/3" });
    expect(second.profile.phone).toBe(PHONE);
    const rows = await acceptances(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ document: "termo_uso", version: "1.0", origin: "tela_aceite", user_agent: "Navegador/2", email_hash: sha256(email!.toLowerCase()) });

    // sem telefone na chamada, o que já está no perfil não muda
    await rpc(id, "app_accept_terms", { p_document: "tutor_ia", p_version: "1.0", p_origin: "tutor" });
    expect((await profile(id)).phone).toBe(PHONE);
  });

  it("as origens que valem: google e tela_aceite para o termo, só tutor para o Tutor", async () => {
    const google = await signUp({ name: "G" });
    await rpc(google.id, "app_accept_terms", { p_document: "termo_uso", p_version: "1.0", p_origin: "google" });
    expect((await acceptances(google.id)).map((r) => [r.document, r.origin])).toEqual([["termo_uso", "google"]]);

    const tutor = await signUp({ name: "T" });
    await rpc(tutor.id, "app_accept_terms", { p_document: "tutor_ia", p_version: "1.0", p_origin: "tutor" });
    expect((await acceptances(tutor.id)).map((r) => [r.document, r.version, r.origin])).toEqual([["tutor_ia", "1.0", "tutor"]]);
  });

  it("versão nova do termo: a antiga é recusada, a nova grava outra linha e o cadastro velho não grava", async () => {
    const { id } = await signUp({ name: "Antes", terms_version: "1.0" });
    const stamp = async () => (await db.query<any>(`select updated_at from public.legal_versions where document = 'termo_uso'`)).rows[0].updated_at as Date;
    const before = await stamp();
    await db.query(`update public.legal_versions set version = '1.1' where document = 'termo_uso'`);
    try {
      // trocar a versão vigente atualiza a data da linha
      expect((await stamp()).getTime()).toBeGreaterThan(before.getTime());

      const velho = await signUp({ name: "Velho", terms_version: "1.0" });
      expect(await acceptances(velho.id)).toHaveLength(0);
      const novo = await signUp({ name: "Novo", terms_version: "1.1" });
      expect((await acceptances(novo.id)).map((r) => r.version)).toEqual(["1.1"]);

      expect(await recusa(rpc(id, "app_accept_terms", { p_document: "termo_uso", p_version: "1.0" }))).toEqual({ message: VERSAO_VELHA, code: "22023" });
      await rpc(id, "app_accept_terms", { p_document: "termo_uso", p_version: "1.1" });
      expect((await acceptances(id)).map((r) => [r.version, r.origin])).toEqual([
        ["1.0", "cadastro"],
        ["1.1", "tela_aceite"],
      ]);
    } finally {
      await db.query(`update public.legal_versions set version = '1.0' where document = 'termo_uso'`);
    }
  });
});

describe("Termo — quem grava e quem lê", () => {
  it("ninguém grava aceite pelo navegador e cada um só lê os próprios", async () => {
    const ana = await signUp({ name: "Ana", terms_version: "1.0" });
    const bruno = await signUp({ name: "Bruno", terms_version: "1.0" });
    const insert = `insert into public.legal_acceptances (user_id, document, version, origin, email_hash) values ($1, 'tutor_ia', '1.0', 'tutor', 'x')`;

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
    expect((await db.query<any>(`select version from public.legal_versions order by document`)).rows).toEqual([{ version: "1.0" }, { version: "1.0" }]);

    // funções de apoio: só o servidor executa
    const calls: [string, unknown[]][] = [
      [`select public.legal_record($1, 'termo_uso', '1.0', 'google', null)`, [ana.id]],
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
    const { id } = await signUp({ name: "Davi", phone: PHONE, terms_version: "1.0", user_agent: "UA/D" }, "Davi@Teste.dev");
    const [antes] = await acceptances(id);
    expect(antes).toMatchObject({ document: "termo_uso", version: "1.0", origin: "cadastro", email_hash: sha256("davi@teste.dev") });

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
    const velha = await signUp({ name: "Eva", terms_version: "1.0" }, "Eva@Teste.dev");
    await rpc(velha.id, "app_delete_my_account", { p_confirm: "EXCLUIR" });

    const nova = await signUp({ name: "Eva", terms_version: "1.0" }, " eva@teste.dev");
    const rows = (await db.query<any>(`select user_id, version, origin from public.legal_acceptances where email_hash = $1 order by id`, [sha256("eva@teste.dev")])).rows;
    expect(rows).toEqual([
      { user_id: null, version: "1.0", origin: "cadastro" },
      { user_id: nova.id, version: "1.0", origin: "cadastro" },
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
      db.query(`select public.legal_record($1, $2, $3, $4, $5)`, [user, document, version, origin, ua]);

    expect(await recusa(record(id, "termo_uso", "0.9"))).toEqual({ message: VERSAO_VELHA, code: "22023" });
    expect(await recusa(record(id, "outro", "1.0"))).toEqual({ message: "Documento inválido.", code: "22023" });
    expect(await recusa(record(null, "termo_uso", "1.0"))).toEqual({ message: SEM_LOGIN, code: "28000" });
    expect(await recusa(record("00000000-0000-4000-8000-0000ffffffff", "termo_uso", "1.0"))).toEqual({ message: SEM_LOGIN, code: "28000" });
    expect(await acceptances(id)).toHaveLength(0);

    await record(id, "termo_uso", "1.0");
    await record(id, "termo_uso", "1.0", "tela_aceite", "UA/Outro");
    await record(id, "tutor_ia", "1.0", "tutor", null);
    const rows = await acceptances(id);
    expect(rows.map((r) => [r.document, r.version, r.origin, r.user_agent])).toEqual([
      ["termo_uso", "1.0", "google", "UA/R"],
      ["tutor_ia", "1.0", "tutor", null],
    ]);
    expect(rows.every((r) => r.email_hash === sha256("record@teste.dev"))).toBe(true);
  });
});
