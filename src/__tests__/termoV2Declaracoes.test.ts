// @vitest-environment node
/**
 * Termo 2.0 (Tutor de voz): migração …11500_termo_v2_declaracoes (estrutura), a ativação (migração …11510_termo_v2_ativar) e os dois desfazer.
 * Também é o ENSAIO da migração no PGlite: aplicada duas vezes, sem mudar nada para o aluno enquanto a 2.0 não é ativada, e
 * desfeita dentro de uma transação com rollback. Nada aqui toca o banco real.
 * Texto e decisões: docs/voice-tutor/04-termo-voz.md.
 */
import { beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const NOVA = "20261003011500_termo_v2_declaracoes.sql";
const ATIVACAO = "20261003011510_termo_v2_ativar.sql";
const ler = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const NOVA_SQL = ler(`supabase/migrations/${NOVA}`);
const ATIVAR = ler(`supabase/migrations/${ATIVACAO}`);
const DESFAZER_ATIVAR = ler("supabase/desfazer/20261003011510_termo_v2_ativar.desfazer.sql");
const DESFAZER = ler("supabase/desfazer/20261003011500_termo_v2_declaracoes.desfazer.sql");

const PHONE = "+5541999998888";
const SEM_DECLARACAO = "Confirme que você tem 18 anos ou mais e que é médico(a).";
const VERSAO_VELHA = "Versão desatualizada do termo.";

let db: PGlite;
let seq = 0;
const sha256 = (t: string) => crypto.createHash("sha256").update(t, "utf8").digest("hex");

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
    return r.rows[0].result;
  });
}
/** Como rpc, mas sem abrir transação própria: para usar DENTRO do begin/rollback do ensaio (outra transação faria commit). */
async function rpcDentro<T = any>(uid: string, fn: string): Promise<T> {
  await db.exec("set role authenticated");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: uid })]);
    return (await db.query<{ result: T }>(`select public.${fn}() as result`)).rows[0].result;
  } finally {
    await db.exec("reset role");
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}
async function asUser(uid: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return tx.query<any>(sql, params);
  });
}
async function recusa(p: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await p;
  } catch (e: any) {
    return { message: e.message, code: e.code };
  }
  throw new Error("Era para recusar, mas passou.");
}
async function signUp(meta: Record<string, unknown>, email?: string) {
  const id = `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, "0")}`;
  const mail = email ?? `medico${seq}@teste.dev`;
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, mail, meta]);
  return { id, email: mail };
}
const aceites = async (uid: string) =>
  (await db.query<any>(
    `select a.document, a.version, a.origin, d.adult, d.physician from public.legal_acceptances a
     left join public.legal_declarations d on d.acceptance_id = a.id where a.user_id = $1 order by a.id`, [uid])).rows;
const legal = async (uid: string) => (await rpc(uid, "app_bootstrap")).legal;
const termoVigente = async () => (await db.query<any>(`select version, requires_declarations from public.legal_versions where document = 'termo_uso'`)).rows[0];

/** O que o ensaio compara antes e depois de aplicar a migração: tabelas, colunas, políticas e permissões que já existiam. */
async function fotografia() {
  const q = async (sql: string) => JSON.stringify((await db.query(sql)).rows);
  return {
    colunas: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
                      where table_schema = 'public' and not (table_name = 'legal_declarations' or (table_name = 'legal_versions' and column_name = 'requires_declarations'))
                      order by 1, 2`),
    politicas: await q(`select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' and tablename <> 'legal_declarations' order by 1, 2`),
    permissoes_funcoes: await q(`select p.proname, pg_get_function_identity_arguments(p.oid) as args,
                                   has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
                                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                 where n.nspname = 'public' and not (p.proname = 'app_accept_terms_declared' or (p.proname = 'legal_record' and p.pronargs = 7))
                                 order by 1, 2`),
  };
}

let antigo: { id: string };
let estadoAntes: unknown;
let antes: Awaited<ReturnType<typeof fotografia>>;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ler("supabase/tests/bootstrap.sql"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f !== NOVA && f !== ATIVACAO).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  // um aluno com o Termo 1.0 aceito antes da migração
  antigo = await signUp({ name: "Antigo", phone: PHONE, terms_version: "1.0" });
  estadoAntes = await legal(antigo.id);
  antes = await fotografia();
  // aplicada duas vezes: tem de poder ser colada de novo sem estragar nada
  await db.exec(NOVA_SQL);
  await db.exec(NOVA_SQL);
}, 180_000);

describe("Termo 2.0 — ensaio: a migração sozinha não muda nada para o aluno", () => {
  it("nada do que já existia mudou (colunas, políticas, permissões) e o estado do aluno é o mesmo", async () => {
    const depois = await fotografia();
    expect(depois.colunas).toBe(antes.colunas);
    expect(depois.politicas).toBe(antes.politicas);
    expect(depois.permissoes_funcoes).toBe(antes.permissoes_funcoes);
    expect(await legal(antigo.id)).toEqual(estadoAntes);
    expect(await termoVigente()).toEqual({ version: "1.0", requires_declarations: false });
  });

  it("com o 1.0 vigente: cadastro, aceite e abertura funcionam como antes (sem a chave declarations_required)", async () => {
    const novo = await signUp({ name: "Novo", phone: PHONE, terms_version: "1.0" });
    expect(await aceites(novo.id)).toEqual([{ document: "termo_uso", version: "1.0", origin: "cadastro", adult: null, physician: null }]);
    const l = await legal(novo.id);
    expect(l).not.toHaveProperty("declarations_required");
    expect(l.gate_required).toBe(false);

    const google = await signUp({ name: "G" });
    await rpc(google.id, "app_accept_terms", { p_document: "termo_uso", p_version: "1.0", p_origin: "google", p_phone: PHONE });
    expect((await legal(google.id)).gate_required).toBe(false);
  });

  it("a prova nova e a função de apoio de 7 parâmetros ficam fechadas para o navegador", async () => {
    const r = await db.query<any>(
      `select p.proname, p.pronargs, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('service_role', p.oid, 'execute') as servidor
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('legal_record', 'app_accept_terms_declared') order by 1, 2`
    );
    expect(r.rows).toEqual([
      { proname: "app_accept_terms_declared", pronargs: 7, anon: true, auth: true, servidor: true },
      { proname: "legal_record", pronargs: 5, anon: false, auth: false, servidor: true },
      { proname: "legal_record", pronargs: 7, anon: false, auth: false, servidor: true },
    ]);
    const rls = await db.query<any>(`select relrowsecurity from pg_class where relname = 'legal_declarations'`);
    expect(rls.rows[0].relrowsecurity).toBe(true);
    expect(await recusa(rpc(null, "app_accept_terms_declared", { p_document: "termo_uso", p_version: "1.0", p_adult: true, p_physician: true })))
      .toEqual({ message: "Entre na sua conta.", code: "28000" });
  });
});

describe("Termo 2.0 — ativado (migração 011510)", () => {
  beforeAll(async () => {
    await db.exec(ATIVAR);
  });

  it("vira a versão vigente (Termo e §34), exige as declarações e encurta a retenção da transcrição da voz para 7 dias", async () => {
    expect(await termoVigente()).toEqual({ version: "2.0", requires_declarations: true });
    const tutor = (await db.query<any>(`select version from public.legal_versions where document = 'tutor_ia'`)).rows[0];
    expect(tutor.version).toBe("2.0");
    const cfg = (await db.query<any>(`select transcript_retention_days from public.tutor_config`)).rows;
    expect(cfg.length).toBeGreaterThan(0);
    expect(cfg.every((c: any) => c.transcript_retention_days >= 1 && c.transcript_retention_days <= 7)).toBe(true);
  });

  it("quem tinha aceitado o 1.0 precisa aceitar de novo no próximo login, e só passa com as duas declarações", async () => {
    const l = await legal(antigo.id);
    expect(l).toMatchObject({ gate_required: true, declarations_required: true, termo_uso: { current: "2.0", accepted: "1.0" } });

    // o caminho antigo (sem declarações) e as declarações incompletas são recusados, sem deixar rastro
    expect(await recusa(rpc(antigo.id, "app_accept_terms", { p_document: "termo_uso", p_version: "2.0" }))).toEqual({ message: SEM_DECLARACAO, code: "22023" });
    for (const [adult, physician] of [[false, true], [true, false], [null, true], [true, null], [false, false]]) {
      expect(await recusa(rpc(antigo.id, "app_accept_terms_declared", { p_document: "termo_uso", p_version: "2.0", p_adult: adult, p_physician: physician })))
        .toEqual({ message: SEM_DECLARACAO, code: "22023" });
    }
    expect(await recusa(rpc(antigo.id, "app_accept_terms_declared", { p_document: "termo_uso", p_version: "1.0", p_adult: true, p_physician: true })))
      .toEqual({ message: VERSAO_VELHA, code: "22023" });
    expect((await aceites(antigo.id)).map((a: any) => a.version)).toEqual(["1.0"]);

    const boot = await rpc(antigo.id, "app_accept_terms_declared", { p_document: "termo_uso", p_version: "2.0", p_adult: true, p_physician: true, p_user_agent: "UA/2" });
    expect(boot.legal).toMatchObject({ gate_required: false, termo_uso: { current: "2.0", accepted: "2.0" } });
    expect(await aceites(antigo.id)).toEqual([
      { document: "termo_uso", version: "1.0", origin: "cadastro", adult: null, physician: null },
      { document: "termo_uso", version: "2.0", origin: "tela_aceite", adult: true, physician: true },
    ]);
    // repetir não duplica
    await rpc(antigo.id, "app_accept_terms_declared", { p_document: "termo_uso", p_version: "2.0", p_adult: true, p_physician: true, p_origin: "google" });
    expect(await aceites(antigo.id)).toHaveLength(2);
  });

  it("cadastro com a 2.0: grava aceite e declarações quando vêm as duas; sem elas, a conta nasce e a tela pede depois", async () => {
    const ok = await signUp({ name: "Dra. Ana", phone: PHONE, terms_version: "2.0", declares_adult: "true", declares_physician: "true", user_agent: "UA" });
    expect(await aceites(ok.id)).toEqual([{ document: "termo_uso", version: "2.0", origin: "cadastro", adult: true, physician: true }]);
    expect((await legal(ok.id)).gate_required).toBe(false);
    // verdadeiro como booleano do JSON também vale (o texto lido é o mesmo "true")
    const bool = await signUp({ name: "Dr. Bia", phone: PHONE, terms_version: "2.0", declares_adult: true, declares_physician: true });
    expect((await aceites(bool.id)).map((a: any) => [a.adult, a.physician])).toEqual([[true, true]]);

    for (const meta of [{}, { declares_adult: "true" }, { declares_physician: "true" }, { declares_adult: "sim", declares_physician: "sim" }]) {
      const sem = await signUp({ name: "Sem", phone: PHONE, terms_version: "2.0", ...meta });
      expect(await aceites(sem.id)).toEqual([]);
      expect((await db.query<any>(`select 1 from public.user_roles where user_id = $1`, [sem.id])).rows).toHaveLength(1);
      expect((await legal(sem.id)).gate_required).toBe(true);
    }
    // cadastro feito pela tela antiga (1.0) depois da ativação: nada gravado, conta criada, tela de aceite na entrada
    const velho = await signUp({ name: "Velho", phone: PHONE, terms_version: "1.0", declares_adult: "true", declares_physician: "true" });
    expect(await aceites(velho.id)).toEqual([]);
    expect((await legal(velho.id)).gate_required).toBe(true);
  });

  it("o aceite dos Tutores (§34) segue sem declarações e a equipe continua dispensada", async () => {
    const { id } = await signUp({ name: "T", phone: PHONE, terms_version: "2.0", declares_adult: "true", declares_physician: "true" });
    await rpc(id, "app_accept_terms", { p_document: "tutor_ia", p_version: "2.0", p_origin: "tutor" });
    expect((await aceites(id)).map((a: any) => [a.document, a.version])).toEqual([["termo_uso", "2.0"], ["tutor_ia", "2.0"]]);

    const editor = await signUp({ name: "Editor" });
    await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [editor.id]);
    expect(await legal(editor.id)).toMatchObject({ student: false, gate_required: false, declarations_required: true });
  });

  it("cada um lê só as próprias declarações; ninguém grava pelo navegador; exportação leva as declarações", async () => {
    const a = await signUp({ name: "A", phone: PHONE, terms_version: "2.0", declares_adult: "true", declares_physician: "true" });
    const b = await signUp({ name: "B", phone: PHONE, terms_version: "2.0", declares_adult: "true", declares_physician: "true" });
    expect((await asUser(a.id, `select acceptance_id from public.legal_declarations`)).rows).toHaveLength(1);
    expect((await asUser(null, `select acceptance_id from public.legal_declarations`)).rows).toEqual([]);
    const idB = (await db.query<any>(`select id from public.legal_acceptances where user_id = $1`, [b.id])).rows[0].id;
    expect((await asUser(a.id, `select 1 from public.legal_declarations where acceptance_id = $1`, [idB])).rows).toEqual([]);
    expect((await recusa(asUser(a.id, `insert into public.legal_declarations (acceptance_id, adult, physician) values ($1, true, true)`, [idB]))).message)
      .toMatch(/row-level security|permission denied/);
    expect((await asUser(a.id, `delete from public.legal_declarations`)).affectedRows).toBe(0);
    // "não" nunca é gravado, nem direto pelo dono do banco
    expect((await recusa(db.query(`update public.legal_declarations set adult = false where acceptance_id = $1`, [idB]))).message).toMatch(/check/);

    const exp = await rpc(a.id, "app_export_my_data");
    expect(exp.declarations).toEqual([{ document: "termo_uso", version: "2.0", adult: true, physician: true, declared_at: expect.any(String) }]);
    expect(exp.acceptances).toHaveLength(1);
    expect(Object.keys(exp.acceptances[0]).sort()).toEqual(["accepted_at", "document", "origin", "user_agent", "version"]);
  });

  it("conta apagada: aceite e declaração ficam como prova, sem a pessoa", async () => {
    const { id, email } = await signUp({ name: "Davi", phone: PHONE, terms_version: "2.0", declares_adult: "true", declares_physician: "true" }, "Davi2@Teste.dev");
    const [{ id: aceiteId }] = (await db.query<any>(`select id from public.legal_acceptances where user_id = $1`, [id])).rows;
    expect(await rpc(id, "app_delete_my_account", { p_confirm: "EXCLUIR" })).toBe(true);
    const fica = (await db.query<any>(
      `select a.user_id, a.version, a.email_hash, d.adult, d.physician from public.legal_acceptances a join public.legal_declarations d on d.acceptance_id = a.id where a.id = $1`, [aceiteId])).rows;
    expect(fica).toEqual([{ user_id: null, version: "2.0", email_hash: sha256(email.toLowerCase()), adult: true, physician: true }]);
  });

  it("desfazer a ativação volta o 1.0 sem prender ninguém", async () => {
    const so2 = await signUp({ name: "So 2.0", phone: PHONE, terms_version: "2.0", declares_adult: "true", declares_physician: "true" });
    await db.exec(DESFAZER_ATIVAR);
    try {
      expect(await termoVigente()).toEqual({ version: "1.0", requires_declarations: false });
      expect((await db.query<any>(`select version from public.legal_versions where document = 'tutor_ia'`)).rows[0].version).toBe("1.0");
      // quem aceitou o 1.0 e depois a 2.0 continua liberado; a chave nova some
      const l = await legal(antigo.id);
      expect(l).toMatchObject({ gate_required: false, termo_uso: { current: "1.0", accepted: "1.0" } });
      expect(l).not.toHaveProperty("declarations_required");
      // quem só tinha a 2.0 aceita o 1.0 uma vez, pelo caminho de sempre
      expect((await legal(so2.id)).gate_required).toBe(true);
      await rpc(so2.id, "app_accept_terms", { p_document: "termo_uso", p_version: "1.0" });
      expect((await legal(so2.id)).gate_required).toBe(false);
      // as provas da 2.0 ficam
      expect((await aceites(antigo.id)).map((a: any) => a.version)).toEqual(["1.0", "2.0"]);
    } finally {
      await db.exec(ATIVAR);
    }
  });
});

describe("Termo 2.0 — ensaio do desfazer da migração (transação com rollback)", () => {
  it("o desfazer volta as funções de antes e apaga o que a migração criou; o rollback devolve tudo", async () => {
    await db.exec(DESFAZER_ATIVAR);
    await db.exec("begin");
    try {
      await db.exec(DESFAZER);
      const objetos = await db.query<any>(
        `select (select count(*)::int from pg_class where relname = 'legal_declarations') as tabela,
                (select count(*)::int from pg_proc where proname = 'app_accept_terms_declared') as aceitar,
                (select count(*)::int from pg_proc where proname = 'legal_record') as gravar,
                (select count(*)::int from information_schema.columns where table_name = 'legal_versions' and column_name = 'requires_declarations') as coluna`
      );
      expect(objetos.rows[0]).toEqual({ tabela: 0, aceitar: 0, gravar: 1, coluna: 0 });
      // o banco funciona como antes da migração: cadastro 1.0, aceite e abertura
      const depois = await signUp({ name: "Depois", phone: PHONE, terms_version: "1.0" });
      expect(await db.query<any>(`select version, origin from public.legal_acceptances where user_id = $1`, [depois.id]).then((r) => r.rows))
        .toEqual([{ version: "1.0", origin: "cadastro" }]);
      expect((await rpcDentro(depois.id, "app_bootstrap")).legal).toEqual({
        termo_uso: { current: "1.0", accepted: "1.0", accepted_at: expect.any(String) },
        tutor_ia: { current: "1.0", accepted: null, accepted_at: null },
        student: true, phone_missing: false, gate_required: false,
      });
      expect(await rpcDentro(depois.id, "app_export_my_data")).not.toHaveProperty("declarations");
    } finally {
      await db.exec("rollback");
    }
    const volta = await db.query<any>(`select count(*)::int as n from pg_proc where proname = 'app_accept_terms_declared'`);
    expect(volta.rows[0].n).toBe(1);
    expect((await aceites(antigo.id)).map((a: any) => [a.version, a.adult])).toEqual([["1.0", null], ["2.0", true]]);
  });
});
