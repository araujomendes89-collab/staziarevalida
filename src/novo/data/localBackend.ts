/**
 * Banco local de desenvolvimento: Postgres (PGlite) rodando no navegador com as MESMAS
 * migrações, políticas de acesso e carga do Supabase. Serve para desenvolver e testar o
 * app novo sem conta nem internet. Nunca é usado em produção (ver ./index.ts).
 *
 * As contas ficam só nesta máquina (IndexedDB). Login com Google não existe aqui.
 */
import { PGlite } from "@electric-sql/pglite";
import bootstrapSql from "../../../supabase/tests/bootstrap.sql?raw";
import { assertRpcCall, BackendError, PASSWORD_MIN_LENGTH, type AuthUser, type Backend } from "./backend";

const migrations = import.meta.glob("../../../supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const LOCAL_AUTH_SQL = `
  create table auth.local_credentials (
    user_id uuid primary key references auth.users (id) on delete cascade,
    email text not null unique,
    password_sha256 text not null
  );
`;
const SESSION_KEY = "smn-local-user";

/** Versão do esquema: muda quando alguma migração muda, e aí o banco local é recriado. */
function schemaVersion(): string {
  let hash = 0;
  for (const [name, sql] of Object.entries(migrations).sort()) {
    for (const ch of name + sql) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  }
  return (hash >>> 0).toString(36);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export interface LocalBackendOptions {
  /** false = banco só em memória (testes). Padrão: IndexedDB quando existir. */
  persist?: boolean;
  /** Carrega as 1.200 questões e as estações. Padrão: true. */
  seed?: boolean;
}

export async function createLocalBackend(options: LocalBackendOptions = {}): Promise<Backend> {
  const canPersist = options.persist !== false && typeof indexedDB !== "undefined";
  const db = new PGlite(canPersist ? `idb://staziamed-local-${schemaVersion()}` : undefined);

  const ready = (await db.query<{ ok: boolean }>(`select to_regclass('public.profiles') is not null as ok`)).rows[0].ok;
  if (!ready) {
    await db.exec(bootstrapSql);
    await db.exec(LOCAL_AUTH_SQL);
    for (const name of Object.keys(migrations).sort()) await db.exec(migrations[name]);
    if (options.seed !== false) {
      const { buildSeedStatements } = await import("../../../scripts/supabase/seed-builder");
      for (const statement of buildSeedStatements()) await db.exec(statement);
    }
  }

  // Garante que a gravação chegou ao IndexedDB antes de devolver (sem isso, um
  // recarregamento logo depois de uma escrita perde a alteração).
  const flush = () => (canPersist ? db.syncToFs() : Promise.resolve());
  await flush();

  const storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null =
    canPersist && typeof localStorage !== "undefined" ? localStorage : null;
  let current: AuthUser | null = null;
  try {
    current = JSON.parse(storage?.getItem(SESSION_KEY) ?? "null");
  } catch {
    current = null;
  }
  if (current) {
    const exists = (await db.query(`select 1 from auth.users where id = $1`, [current.id])).rows.length > 0;
    if (!exists) current = null;
  }

  const listeners = new Set<(user: AuthUser | null) => void>();
  const setUser = (user: AuthUser | null) => {
    current = user;
    if (user) storage?.setItem(SESSION_KEY, JSON.stringify(user));
    else storage?.removeItem(SESSION_KEY);
    listeners.forEach((cb) => cb(user));
  };

  return {
    mode: "local",
    async getUser() {
      return current;
    },
    onAuthChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    async signIn(email, password) {
      const row = (
        await db.query<{ user_id: string; email: string }>(
          `select user_id, email from auth.local_credentials where email = $1 and password_sha256 = $2`,
          [normalizeEmail(email), await sha256(password)]
        )
      ).rows[0];
      if (!row) throw new BackendError("invalid_credentials", "E-mail ou senha incorretos.");
      setUser({ id: row.user_id, email: row.email });
    },
    async signUp(name, email, password) {
      const mail = normalizeEmail(email);
      if (!isEmail(mail)) throw new BackendError("invalid_email", "E-mail inválido.");
      if (password.length < PASSWORD_MIN_LENGTH) throw new BackendError("weak_password", "Senha muito curta.");
      const taken = (await db.query(`select 1 from auth.local_credentials where email = $1`, [mail])).rows.length > 0;
      if (taken) throw new BackendError("email_taken", "Já existe uma conta com este e-mail.");

      const id = crypto.randomUUID();
      const hash = await sha256(password);
      await db.transaction(async (tx) => {
        await tx.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, mail, { name: name.trim() }]);
        await tx.query(`insert into auth.local_credentials (user_id, email, password_sha256) values ($1, $2, $3)`, [id, mail, hash]);
      });
      await flush();
      setUser({ id, email: mail });
      return { needsEmailConfirmation: false };
    },
    async signInWithGoogle() {
      throw new BackendError("google_unavailable", "O login com Google só funciona com o Supabase configurado.");
    },
    async resetPassword() {
      // Sem e-mail no modo local: nada a enviar.
    },
    async signOut() {
      setUser(null);
    },
    async rpc<T>(fn: string, args: Record<string, unknown> = {}) {
      assertRpcCall(fn, args);
      const keys = Object.keys(args);
      const call = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`;
      const user = current;
      try {
        const value = await db.transaction(async (tx) => {
          // Mesmo caminho do Supabase: papel + claims do JWT, com o RLS valendo.
          await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
            JSON.stringify(user ? { sub: user.id, role: "authenticated" } : {}),
          ]);
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
