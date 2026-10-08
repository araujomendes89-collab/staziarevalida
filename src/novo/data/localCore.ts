/**
 * Núcleo do banco local de desenvolvimento (PGlite), sem nada específico de navegador ou de
 * Vite: aplica migrações, cria contas, confere senhas e executa as funções app_* como um
 * usuário (papel + claims do JWT, com o RLS valendo, igual ao Supabase).
 *
 * Usado por:
 *   - ./localBackend.ts         (banco dentro do navegador; hoje só nos testes)
 *   - server/devDb/devDatabase  (banco do servidor de desenvolvimento, compartilhado pelo app,
 *                                pelo painel e pelo processamento em segundo plano)
 * Nunca é usado em produção.
 */
import type { PGlite } from "@electric-sql/pglite";
import { assertRpcCall, BackendError, PASSWORD_MIN_LENGTH, type AuthUser } from "./backend";

export const LOCAL_AUTH_SQL = `
  create table auth.local_credentials (
    user_id uuid primary key references auth.users (id) on delete cascade,
    email text not null unique,
    password_sha256 text not null
  );
`;
// Quais migrações este banco já recebeu (o Supabase guarda o mesmo controle do lado dele).
export const LOCAL_META_SQL = `
  create schema local_meta;
  create table local_meta.migrations (
    name text primary key,
    hash text not null,
    applied_at timestamptz not null default now()
  );
`;

export function hashOf(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

/** Migrações pelo nome do arquivo, na ordem em que devem ser aplicadas. */
export function migrationList(source: Record<string, string>): { name: string; sql: string }[] {
  return Object.entries(source)
    .map(([file, sql]) => ({ name: file.split("/").pop() as string, sql }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Deixa o banco no esquema atual aplicando só as migrações que faltam, para que as contas
 * e o histórico de teste sobrevivam a uma atualização do app.
 * Devolve "drift" quando uma migração já aplicada mudou ou sumiu: aí o banco precisa ser recriado.
 */
export async function migrateDatabase(
  db: PGlite,
  bootstrapSql: string,
  source: Record<string, string>,
  seed: (() => Promise<string[]>) | null
): Promise<"ready" | "drift"> {
  const fresh = !(await db.query<{ ok: boolean }>(`select to_regclass('local_meta.migrations') is not null as ok`)).rows[0].ok;
  if (fresh) {
    await db.exec(bootstrapSql);
    await db.exec(LOCAL_AUTH_SQL);
    await db.exec(LOCAL_META_SQL);
  }

  const list = migrationList(source);
  const applied = new Map(
    (await db.query<{ name: string; hash: string }>(`select name, hash from local_meta.migrations`)).rows.map((r) => [r.name, r.hash])
  );
  if ([...applied.keys()].some((name) => !list.some((m) => m.name === name))) return "drift";

  let changed = false;
  for (const { name, sql } of list) {
    const hash = hashOf(sql);
    if (applied.has(name)) {
      if (applied.get(name) !== hash) return "drift";
      continue;
    }
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query(`insert into local_meta.migrations (name, hash) values ($1, $2)`, [name, hash]);
    });
    changed = true;
  }

  // A carga é idempotente (insert … on conflict do update): roda de novo quando o esquema muda.
  if (changed && seed) {
    for (const statement of await seed()) await db.exec(statement);
  }
  return "ready";
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export interface LocalCore {
  db: PGlite;
  /**
   * Cria a conta (sem sessão). `admin`: já nasce administradora, na mesma transação. `meta`: metadados extras da conta
   * (ex.: phone, terms_version, user_agent), gravados em auth.users.raw_user_meta_data para o gatilho de criação da conta;
   * o nome vem sempre do parâmetro `name`.
   */
  createAccount(name: string, email: string, password: string, admin?: boolean, meta?: Record<string, unknown>): Promise<AuthUser>;
  /** Confere e-mail e senha; devolve o usuário ou lança invalid_credentials. */
  verify(email: string, password: string): Promise<AuthUser>;
  setPassword(userId: string, password: string): Promise<void>;
  userExists(userId: string): Promise<boolean>;
  hasAdmin(): Promise<boolean>;
  /** Executa uma função app_* como o usuário (ou visitante, se nulo). */
  rpc<T>(user: AuthUser | null, fn: string, args?: Record<string, unknown>): Promise<T>;
}

export function createLocalCore(db: PGlite, flush: () => Promise<void> = async () => {}): LocalCore {
  return {
    db,
    async createAccount(name, email, password, admin = false, meta = {}) {
      const mail = normalizeEmail(email);
      if (!isEmail(mail)) throw new BackendError("invalid_email", "E-mail inválido.");
      if (password.length < PASSWORD_MIN_LENGTH) throw new BackendError("weak_password", "Senha muito curta.");
      const taken = (await db.query(`select 1 from auth.local_credentials where email = $1`, [mail])).rows.length > 0;
      if (taken) throw new BackendError("email_taken", "Já existe uma conta com este e-mail.");

      const id = crypto.randomUUID();
      const hash = await sha256(password);
      await db.transaction(async (tx) => {
        await tx.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, mail, { ...meta, name: name.trim() }]);
        await tx.query(`insert into auth.local_credentials (user_id, email, password_sha256) values ($1, $2, $3)`, [id, mail, hash]);
        if (admin) await tx.query(`update public.user_roles set role = 'admin', updated_at = now() where user_id = $1`, [id]);
      });
      await flush();
      return { id, email: mail };
    },
    async verify(email, password) {
      const row = (
        await db.query<{ user_id: string; email: string }>(
          `select user_id, email from auth.local_credentials where email = $1 and password_sha256 = $2`,
          [normalizeEmail(email), await sha256(password)]
        )
      ).rows[0];
      if (!row) throw new BackendError("invalid_credentials", "E-mail ou senha incorretos.");
      return { id: row.user_id, email: row.email };
    },
    async setPassword(userId, password) {
      if (password.length < PASSWORD_MIN_LENGTH) throw new BackendError("weak_password", "Senha muito curta.");
      await db.query(`update auth.local_credentials set password_sha256 = $2 where user_id = $1`, [userId, await sha256(password)]);
      await flush();
    },
    async userExists(userId) {
      return (await db.query(`select 1 from auth.users where id = $1`, [userId])).rows.length > 0;
    },
    async hasAdmin() {
      return (await db.query(`select 1 from public.user_roles where role = 'admin' limit 1`)).rows.length > 0;
    },
    async rpc<T>(user: AuthUser | null, fn: string, args: Record<string, unknown> = {}) {
      assertRpcCall(fn, args);
      const keys = Object.keys(args);
      const call = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`;
      try {
        const value = await db.transaction(async (tx) => {
          // Mesmo caminho do Supabase: papel + claims do JWT, com o RLS valendo.
          await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(user ? { sub: user.id, role: "authenticated" } : {})]);
          const result = await tx.query<{ result: T }>(call, keys.map((k) => args[k]));
          return result.rows[0].result;
        });
        await flush();
        return value as T;
      } catch (error) {
        throw new BackendError("unknown", error instanceof Error ? error.message : String(error));
      }
    },
  };
}
