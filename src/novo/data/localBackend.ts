/**
 * Banco local DENTRO DO NAVEGADOR (PGlite + IndexedDB) com as mesmas migrações, políticas de
 * acesso e carga do Supabase. Hoje é usado só nos testes automáticos; o app em desenvolvimento
 * usa o banco local do servidor (./devServerBackend.ts), que o processamento em segundo plano
 * também enxerga. Nunca é usado em produção (ver ./index.ts).
 */
import { PGlite } from "@electric-sql/pglite";
import bootstrapSql from "../../../supabase/tests/bootstrap.sql?raw";
import { BackendError, signUpMetadata, type AuthUser, type Backend } from "./backend";
import { createLocalCore, migrateDatabase } from "./localCore";

const migrations = import.meta.glob("../../../supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const SESSION_KEY = "smn-local-user";
const DB_NAME = "staziamed-local-v2";
const IDB_PREFIX = "/pglite/";

/** Mantida para os testes: aplica as migrações que faltam (ver localCore.migrateDatabase). */
export function migrateLocalDatabase(db: PGlite, source: Record<string, string>, seed: (() => Promise<string[]>) | null) {
  return migrateDatabase(db, bootstrapSql, source, seed);
}

function deleteIndexedDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

/** Apaga bancos locais de versões anteriores (cada um ocupa alguns MB no navegador). */
async function dropStaleDatabases(): Promise<void> {
  try {
    const all = (await indexedDB.databases?.()) ?? [];
    const stale = all.map((d) => d.name ?? "").filter((n) => n.startsWith(`${IDB_PREFIX}staziamed-local-`) && n !== IDB_PREFIX + DB_NAME);
    await Promise.all(stale.map(deleteIndexedDb));
  } catch {
    /* limpeza é opcional */
  }
}

export interface LocalBackendOptions {
  /** false = banco só em memória (testes). Padrão: IndexedDB quando existir. */
  persist?: boolean;
  /** Carrega as 1.200 questões e as estações. Padrão: true. */
  seed?: boolean;
}

export async function createLocalBackend(options: LocalBackendOptions = {}): Promise<Backend> {
  const canPersist = options.persist !== false && typeof indexedDB !== "undefined";
  const open = () => new PGlite(canPersist ? `idb://${DB_NAME}` : undefined);
  const seed =
    options.seed === false ? null : async () => (await import("../../../scripts/supabase/seed-builder")).buildSeedStatements();

  let db = open();
  if ((await migrateLocalDatabase(db, migrations, seed)) === "drift") {
    // Uma migração já aplicada foi alterada: não há como atualizar no lugar, recria o banco.
    await db.close();
    if (canPersist) await deleteIndexedDb(IDB_PREFIX + DB_NAME);
    db = open();
    await migrateLocalDatabase(db, migrations, seed);
  }
  if (canPersist) void dropStaleDatabases();

  // Garante que a gravação chegou ao IndexedDB antes de devolver (sem isso, um
  // recarregamento logo depois de uma escrita perde a alteração).
  const flush = () => (canPersist ? db.syncToFs() : Promise.resolve());
  await flush();
  const core = createLocalCore(db, flush);

  const storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null =
    canPersist && typeof localStorage !== "undefined" ? localStorage : null;
  let current: AuthUser | null = null;
  try {
    current = JSON.parse(storage?.getItem(SESSION_KEY) ?? "null");
  } catch {
    current = null;
  }
  if (current && !(await core.userExists(current.id))) current = null;

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
      setUser(await core.verify(email, password));
    },
    async signUp(name, email, password, extra) {
      const user = await core.createAccount(name, email, password, false, signUpMetadata(extra));
      setUser(user);
      return { needsEmailConfirmation: false, userId: user.id };
    },
    masterSetup: {
      async needed() {
        return !(await core.hasAdmin());
      },
      async create(name, email, password) {
        if (await core.hasAdmin()) throw new BackendError("unknown", "Já existe um administrador neste ambiente.");
        setUser(await core.createAccount(name, email, password, true));
      },
    },
    async signInWithGoogle() {
      throw new BackendError("google_unavailable", "O login com Google só funciona com o Supabase configurado.");
    },
    async resetPassword() {
      // Sem e-mail no modo local: nada a enviar.
    },
    async updatePassword(password) {
      if (!current) throw new BackendError("invalid_credentials", "Entre na sua conta.");
      await core.setPassword(current.id, password);
    },
    async signOut() {
      setUser(null);
    },
    rpc<T>(fn: string, args: Record<string, unknown> = {}) {
      return core.rpc<T>(current, fn, args);
    },
  };
}
