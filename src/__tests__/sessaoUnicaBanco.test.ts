// @vitest-environment node
/**
 * Sessão única no banco (supabase/migrations/…13670_sessao_unica.sql): uma sessão ativa por vez em cada conta.
 * Dois "aparelhos" = duas sessões de login (session_id do token); duas abas do mesmo navegador = a MESMA sessão.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

let db: PGlite;
let seq = 0;
let chaveInicial: unknown;

type Claims = { sub: string; session_id?: string } | null;

/** Chama uma função public.* como o navegador: aluno logado (com ou sem session_id no token) ou visitante (null). */
async function rpc<T = any>(claims: Claims, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${claims ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ? { ...claims, role: "authenticated" } : {})]);
    const r = await tx.query<{ result: T }>(
      `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
      keys.map((k) => args[k])
    );
    return r.rows[0].result;
  });
}

async function asUser(claims: Claims, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${claims ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ?? {})]);
    return tx.query<any>(sql, params);
  });
}

async function recusa(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e: any) {
    return e.message;
  }
  throw new Error("Era para recusar, mas passou.");
}

async function novaConta(role: "student" | "admin" | "editor" = "student") {
  const id = `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, "0")}`;
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `conta${seq}@teste.dev`, { name: `Conta ${seq}` }]);
  if (role !== "student") await db.query(`update public.user_roles set role = $2 where user_id = $1`, [id, role]);
  return id;
}

/** Um aparelho = uma sessão de login do Supabase (session_id no token). */
const aparelho = (uid: string, sessao: string): Claims => ({ sub: uid, session_id: sessao });

async function regra(cfg: Record<string, boolean>) {
  await db.query(`update public.app_sessao_unica_config set ativa = coalesce(($1::jsonb ->> 'ativa')::boolean, ativa), incluir_equipe = coalesce(($1::jsonb ->> 'incluir_equipe')::boolean, incluir_equipe), incluir_revisores = coalesce(($1::jsonb ->> 'incluir_revisores')::boolean, incluir_revisores)`, [JSON.stringify(cfg)]);
}

const vigente = async (uid: string) => (await db.query<any>(`select * from public.app_sessao_vigente where user_id = $1`, [uid])).rows[0] ?? null;
const derrubadas = async (uid: string) => (await db.query<any>(`select count(*)::int as n from public.app_sessao_derrubada where user_id = $1`, [uid])).rows[0].n;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  chaveInicial = (await db.query<any>(`select ativa, incluir_equipe, incluir_revisores from public.app_sessao_unica_config`)).rows[0];
}, 240_000);

beforeEach(async () => {
  await db.query(`update public.app_sessao_unica_config set ativa = true, incluir_equipe = false, incluir_revisores = false`);
});

describe("Sessão única — chave e estrutura", () => {
  it("a chave nasce DESLIGADA e a migração pode ser colada de novo", async () => {
    expect(chaveInicial).toEqual({ ativa: false, incluir_equipe: false, incluir_revisores: false });
    // colar duas vezes não quebra nem muda a chave já gravada
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, "20261003013670_sessao_unica.sql"), "utf8"));
    expect((await db.query<any>(`select ativa, incluir_equipe, incluir_revisores from public.app_sessao_unica_config`)).rows[0]).toMatchObject({ ativa: true });
  });

  it("as tabelas têm RLS, não guardam IP e as funções são SECURITY DEFINER com search_path vazio", async () => {
    const rls = await db.query<any>(
      `select relname, relrowsecurity from pg_class where relname in ('app_sessao_vigente', 'app_sessao_derrubada') order by relname`
    );
    expect(rls.rows).toEqual([
      { relname: "app_sessao_derrubada", relrowsecurity: true },
      { relname: "app_sessao_vigente", relrowsecurity: true },
    ]);
    const cols = await db.query<any>(
      `select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in ('app_sessao_vigente', 'app_sessao_derrubada') order by table_name, ordinal_position`
    );
    const nomes = cols.rows.map((c) => c.column_name);
    expect(nomes.some((n) => /ip|addr|email|token/i.test(n))).toBe(false);
    const fns = await db.query<any>(
      `select proname, prosecdef, proconfig from pg_proc where proname in ('app_session_claim', 'app_session_check', 'app_admin_sessao_unica', 'sessao_unica_assumir', 'sessao_unica_vale') order by proname`
    );
    for (const f of fns.rows) {
      expect(f.prosecdef).toBe(true);
      expect(f.proconfig).toContain('search_path=""');
    }
    expect(fns.rows).toHaveLength(5);
  });

  it("o navegador não chama as funções internas", async () => {
    const uid = await novaConta();
    const quem = aparelho(uid, "sessao-interna-1");
    expect(await recusa(rpc(quem, "sessao_unica_vale", { p_uid: uid }))).toMatch(/permission denied/i);
    expect(await recusa(asUser(quem, `select public.sessao_unica_assumir('x-12345678', 'y', interval '1 minute')`))).toMatch(/permission denied/i);
    expect(await recusa(asUser(quem, `select public.sessao_unica_id('x-12345678')`))).toMatch(/permission denied/i);
  });
});

describe("Sessão única — dois aparelhos", () => {
  it("o segundo aparelho entra e o primeiro é derrubado na próxima conferência", async () => {
    const uid = await novaConta();
    const a = aparelho(uid, "sessao-aparelho-a");
    const b = aparelho(uid, "sessao-aparelho-b");

    expect(await rpc(a, "app_session_claim", { p_session_id: null, p_device: "Chrome · Windows" })).toMatchObject({ vigente: true, regra: true });
    expect(await rpc(a, "app_session_check", { p_session_id: null })).toMatchObject({ vigente: true });

    const entrou = await rpc(b, "app_session_claim", { p_session_id: null, p_device: "Safari · iPhone" });
    expect(entrou).toMatchObject({ vigente: true, regra: true, derrubou: true });

    const conferido = await rpc(a, "app_session_check", { p_session_id: null });
    expect(conferido).toMatchObject({ vigente: false, regra: true, aparelho: "Safari · iPhone" });
    expect(conferido.desde).toBeTruthy();
    expect(await rpc(b, "app_session_check", { p_session_id: null })).toMatchObject({ vigente: true });

    // guardado como md5, nunca o identificador da sessão
    const row = await vigente(uid);
    expect(row.sessao).toMatch(/^[0-9a-f]{32}$/);
    expect(row.sessao).not.toContain("aparelho-b");
    expect(row.aparelho).toBe("Safari · iPhone");
  });

  it("a sessão derrubada não volta a valer recarregando a página (claim recusado); entrar de novo (sessão nova) derruba o outro", async () => {
    const uid = await novaConta();
    const a = aparelho(uid, "sessao-a-recarrega");
    const b = aparelho(uid, "sessao-b-recarrega");
    await rpc(a, "app_session_claim", { p_session_id: null, p_device: "A" });
    await rpc(b, "app_session_claim", { p_session_id: null, p_device: "B" });

    expect(await rpc(a, "app_session_claim", { p_session_id: null, p_device: "A" })).toMatchObject({ vigente: false });
    expect(await rpc(a, "app_session_check", { p_session_id: null })).toMatchObject({ vigente: false });
    expect(await rpc(b, "app_session_check", { p_session_id: null })).toMatchObject({ vigente: true });

    // ENTRAR NOVAMENTE no aparelho A = login novo = sessão nova
    const a2 = aparelho(uid, "sessao-a-de-novo");
    expect(await rpc(a2, "app_session_claim", { p_session_id: null, p_device: "A" })).toMatchObject({ vigente: true, derrubou: true });
    expect(await rpc(b, "app_session_check", { p_session_id: null })).toMatchObject({ vigente: false, aparelho: "A" });
    expect(await derrubadas(uid)).toBe(2);
  });

  it("mesma pessoa em duas abas do mesmo navegador (mesma sessão) não é derrubada", async () => {
    const uid = await novaConta();
    const aba1 = aparelho(uid, "sessao-do-navegador");
    const aba2 = aparelho(uid, "sessao-do-navegador");
    await rpc(aba1, "app_session_claim", { p_session_id: null, p_device: "Chrome · Mac" });
    await rpc(aba2, "app_session_claim", { p_session_id: null, p_device: "Chrome · Mac" });
    for (let i = 0; i < 3; i++) {
      expect(await rpc(aba1, "app_session_check", { p_session_id: null })).toMatchObject({ vigente: true });
      expect(await rpc(aba2, "app_session_check", { p_session_id: null })).toMatchObject({ vigente: true });
    }
    expect(await derrubadas(uid)).toBe(0);
  });

  it("sessão aberta antes de a regra ligar: a primeira a conferir vale, a outra cai e não volta", async () => {
    const uid = await novaConta();
    const a = aparelho(uid, "sessao-antiga-a");
    const b = aparelho(uid, "sessao-antiga-b");
    expect(await rpc(a, "app_session_check", { p_session_id: null })).toMatchObject({ vigente: true });
    expect(await rpc(b, "app_session_check", { p_session_id: null })).toMatchObject({ vigente: true, derrubou: true });
    expect(await rpc(a, "app_session_check", { p_session_id: null })).toMatchObject({ vigente: false });
  });

  it("banco local (token sem session_id): vale a sessão que o app manda", async () => {
    const uid = await novaConta();
    const semSessao: Claims = { sub: uid };
    await rpc(semSessao, "app_session_claim", { p_session_id: "local-aparelho-a", p_device: "A" });
    await rpc(semSessao, "app_session_claim", { p_session_id: "local-aparelho-b", p_device: "B" });
    expect(await rpc(semSessao, "app_session_check", { p_session_id: "local-aparelho-a" })).toMatchObject({ vigente: false });
    expect(await rpc(semSessao, "app_session_check", { p_session_id: "local-aparelho-b" })).toMatchObject({ vigente: true });
    // sem identificação nenhuma: recusa
    expect(await recusa(rpc(semSessao, "app_session_check", { p_session_id: null }))).toMatch(/Sessão inválida/);
    expect(await recusa(rpc(semSessao, "app_session_check", { p_session_id: "curto" }))).toMatch(/Sessão inválida/);
    expect(await recusa(rpc(semSessao, "app_session_check", { p_session_id: "tem espaço e ' aspas" }))).toMatch(/Sessão inválida/);
  });

  it("com session_id no token, o p_session_id é ignorado: não dá para se passar por outra sessão", async () => {
    const uid = await novaConta();
    const a = aparelho(uid, "sessao-verdadeira-a");
    const b = aparelho(uid, "sessao-verdadeira-b");
    await rpc(a, "app_session_claim", { p_session_id: null, p_device: "A" });
    await rpc(b, "app_session_claim", { p_session_id: null, p_device: "B" });
    // o aparelho A (derrubado) manda o identificador do B: continua sendo A
    expect(await rpc(a, "app_session_check", { p_session_id: "sessao-verdadeira-b" })).toMatchObject({ vigente: false });
  });

  it("o aparelho é resumido: sem caracteres de controle e com no máximo 60 caracteres", async () => {
    const uid = await novaConta();
    await rpc(aparelho(uid, "sessao-aparelho-longo"), "app_session_claim", { p_session_id: null, p_device: "Chrome\n\t· " + "x".repeat(200) });
    const row = await vigente(uid);
    expect(row.aparelho.length).toBeLessThanOrEqual(60);
    expect(row.aparelho).not.toMatch(/[\n\t]/);
  });
});

describe("Sessão única — segurança", () => {
  it("visitante (sem login) não se declara vigente", async () => {
    expect(await recusa(rpc(null, "app_session_claim", { p_session_id: "visitante-1234", p_device: "x" }))).toMatch(/permission denied|Entre na sua conta/i);
    expect(await recusa(rpc(null, "app_session_check", { p_session_id: "visitante-1234" }))).toMatch(/permission denied|Entre na sua conta/i);
  });

  it("o aluno lê só a própria linha e não grava nas tabelas direto", async () => {
    const eu = await novaConta();
    const outro = await novaConta();
    await rpc(aparelho(eu, "sessao-eu-12345"), "app_session_claim", { p_session_id: null, p_device: "Meu" });
    await rpc(aparelho(outro, "sessao-outro-123"), "app_session_claim", { p_session_id: null, p_device: "Outro" });
    const minha = aparelho(eu, "sessao-eu-12345");

    const lidas = await asUser(minha, `select user_id from public.app_sessao_vigente`);
    expect(lidas.rows).toEqual([{ user_id: eu }]);
    expect(await recusa(asUser(minha, `select * from public.app_sessao_derrubada`))).toMatch(/permission denied/i);
    expect(await recusa(asUser(minha, `select * from public.app_sessao_unica_config`))).toMatch(/permission denied/i);
    expect(await recusa(asUser(minha, `update public.app_sessao_unica_config set ativa = false`))).toMatch(/permission denied/i);
    expect(await recusa(asUser(minha, `update public.app_sessao_vigente set sessao = md5('x') where user_id = $1`, [outro]))).toMatch(/permission denied/i);
    expect(await recusa(asUser(minha, `insert into public.app_sessao_vigente (user_id, sessao) values ($1, md5('x'))`, [outro]))).toMatch(/permission denied/i);
    expect(await recusa(asUser(minha, `delete from public.app_sessao_vigente where user_id = $1`, [eu]))).toMatch(/permission denied/i);
    expect(await recusa(asUser(minha, `insert into public.app_sessao_derrubada (user_id, sessao) values ($1, md5('x'))`, [outro]))).toMatch(/permission denied/i);
  });

  it("não dá para derrubar a sessão de outro usuário: cada chamada só mexe na própria conta", async () => {
    const vitima = await novaConta();
    const atacante = await novaConta();
    const sessaoVitima = aparelho(vitima, "sessao-da-vitima");
    await rpc(sessaoVitima, "app_session_claim", { p_session_id: null, p_device: "Vítima" });
    // o atacante usa o mesmo identificador de sessão (no banco local) e reivindica: só afeta a conta dele
    await rpc({ sub: atacante }, "app_session_claim", { p_session_id: "sessao-da-vitima", p_device: "Atacante" });
    await rpc({ sub: atacante }, "app_session_claim", { p_session_id: "outra-do-atacante", p_device: "Atacante" });
    expect(await rpc(sessaoVitima, "app_session_check", { p_session_id: null })).toMatchObject({ vigente: true });
    expect((await vigente(vitima)).aparelho).toBe("Vítima");
    expect(await derrubadas(vitima)).toBe(0);
  });

  it("só o administrador muda a chave, e só com verdadeiro/falso", async () => {
    const aluno = await novaConta();
    const admin = await novaConta("admin");
    expect(await recusa(rpc({ sub: aluno }, "app_admin_sessao_unica", { p_patch: { ativa: false } }))).toBeTruthy();
    expect(await recusa(rpc({ sub: admin }, "app_admin_sessao_unica", { p_patch: { ativa: "sim" } }))).toMatch(/Configuração inválida/);
    expect(await recusa(rpc({ sub: admin }, "app_admin_sessao_unica", { p_patch: { outra: true } }))).toMatch(/Configuração inválida/);
    expect(await rpc({ sub: admin }, "app_admin_sessao_unica", { p_patch: { incluir_equipe: true } })).toMatchObject({ ativa: true, incluir_equipe: true });
    expect(await rpc({ sub: admin }, "app_admin_sessao_unica", {})).toMatchObject({ incluir_equipe: true });
  });
});

describe("Sessão única — equipe, revisores e chave desligada", () => {
  it("equipe (admin e editor) não é derrubada com incluir_equipe desligado; com ele ligado, é", async () => {
    for (const role of ["admin", "editor"] as const) {
      const uid = await novaConta(role);
      const a = aparelho(uid, `sessao-${role}-a`);
      const b = aparelho(uid, `sessao-${role}-b`);
      expect(await rpc(a, "app_session_claim", { p_session_id: null, p_device: "A" })).toEqual({ vigente: true, regra: false });
      await rpc(b, "app_session_claim", { p_session_id: null, p_device: "B" });
      expect(await rpc(a, "app_session_check", { p_session_id: null })).toEqual({ vigente: true, regra: false });
      expect(await vigente(uid)).toBeNull();

      await regra({ incluir_equipe: true });
      await rpc(a, "app_session_claim", { p_session_id: null, p_device: "A" });
      await rpc(b, "app_session_claim", { p_session_id: null, p_device: "B" });
      expect(await rpc(a, "app_session_check", { p_session_id: null })).toMatchObject({ vigente: false, regra: true });
      await regra({ incluir_equipe: false });
    }
  });

  it("revisor médico segue a chave incluir_revisores", async () => {
    const uid = await novaConta();
    await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CM')`, [uid]);
    const a = aparelho(uid, "sessao-revisor-a");
    const b = aparelho(uid, "sessao-revisor-b");
    await rpc(a, "app_session_claim", { p_session_id: null, p_device: "A" });
    await rpc(b, "app_session_claim", { p_session_id: null, p_device: "B" });
    expect(await rpc(a, "app_session_check", { p_session_id: null })).toEqual({ vigente: true, regra: false });

    await regra({ incluir_revisores: true });
    await rpc(a, "app_session_claim", { p_session_id: null, p_device: "A" });
    await rpc(b, "app_session_claim", { p_session_id: null, p_device: "B" });
    expect(await rpc(a, "app_session_check", { p_session_id: null })).toMatchObject({ vigente: false });
  });

  it("chave desligada: nada muda (ninguém é derrubado e nada é gravado)", async () => {
    await regra({ ativa: false });
    const uid = await novaConta();
    const a = aparelho(uid, "sessao-desligada-a");
    const b = aparelho(uid, "sessao-desligada-b");
    expect(await rpc(a, "app_session_claim", { p_session_id: null, p_device: "A" })).toEqual({ vigente: true, regra: false });
    expect(await rpc(b, "app_session_claim", { p_session_id: null, p_device: "B" })).toEqual({ vigente: true, regra: false });
    expect(await rpc(a, "app_session_check", { p_session_id: null })).toEqual({ vigente: true, regra: false });
    expect(await vigente(uid)).toBeNull();
    expect(await derrubadas(uid)).toBe(0);
  });
});
