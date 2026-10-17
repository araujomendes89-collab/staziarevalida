/**
 * Banco de DESENVOLVIMENTO no servidor (PGlite gravado em .data/dev-db), com as mesmas
 * migrações e a mesma carga do Supabase. Um só banco para o app do aluno, o painel e o
 * processamento em segundo plano (Central de Conteúdo). Nunca é usado em produção.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PGlite } from "@electric-sql/pglite";
import { createLocalCore, migrateDatabase, type LocalCore } from "../../src/novo/data/localCore";
import type { AuthUser } from "../../src/novo/data/backend";

const ROOT = process.cwd();
const SESSION_DAYS = 30;

export interface DevDatabase {
  db: PGlite;
  core: LocalCore;
  createSession(userId: string): Promise<string>;
  userForToken(token: string | null | undefined): Promise<AuthUser | null>;
  revokeSession(token: string): Promise<void>;
}

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

function readMigrations(): Record<string, string> {
  const dir = path.join(ROOT, "supabase/migrations");
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")])
  );
}

async function open(dir: string): Promise<DevDatabase> {
  fs.mkdirSync(dir, { recursive: true });
  const bootstrap = fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8");
  const seed = async () => [
    ...(await import("../../scripts/supabase/seed-builder")).buildSeedStatements(),
    // pacote do motor: imagens, classificação detalhada e questões equivalentes
    ...(await import("../../scripts/supabase/engine-seed")).buildEngineStatements(),
    // Treino em Dupla: 10 estações de teste (teste-inep2020-eNN), só aqui no banco local; a carga do Supabase as recusa
    ...(await import("../dupla/testStations")).buildDuplaTestStatements(),
  ];
  let db = new PGlite(dir);
  if ((await migrateDatabase(db, bootstrap, readMigrations(), seed)) === "drift") {
    // Migração já aplicada foi alterada: guarda o banco antigo ao lado e recria.
    await db.close();
    fs.renameSync(dir, `${dir}.antigo-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    db = new PGlite(dir);
    await migrateDatabase(db, bootstrap, readMigrations(), seed);
    console.warn(`[dev-db] Uma migração já aplicada mudou: o banco foi recriado (o anterior ficou em ${dir}.antigo-*).`);
  }
  await db.exec(`
    create table if not exists local_meta.sessions (
      token_hash text primary key,
      user_id uuid not null references auth.users (id) on delete cascade,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    );
  `);
  const core = createLocalCore(db);
  return {
    db,
    core,
    async createSession(userId) {
      const token = crypto.randomBytes(32).toString("hex");
      await db.query(`insert into local_meta.sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`, [
        hashToken(token),
        userId,
        SESSION_DAYS,
      ]);
      return token;
    },
    async userForToken(token) {
      if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
      const row = (
        await db.query<{ id: string; email: string }>(
          `select u.id, u.email from local_meta.sessions s join auth.users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()`,
          [hashToken(token)]
        )
      ).rows[0];
      return row ? { id: row.id, email: row.email } : null;
    },
    async revokeSession(token) {
      await db.query(`delete from local_meta.sessions where token_hash = $1`, [hashToken(token)]);
    },
  };
}

let instance: Promise<DevDatabase> | null = null;

export function getDevDatabase(dir = process.env.DEV_DB_DIR || path.join(ROOT, ".data/dev-db")): Promise<DevDatabase> {
  if (process.env.NODE_ENV === "production") throw new Error("O banco de desenvolvimento não existe em produção.");
  instance ??= open(dir);
  return instance;
}

/** Para testes: abre um banco isolado (memória ou pasta temporária). */
export function openDevDatabaseForTests(dir: string): Promise<DevDatabase> {
  return open(dir);
}
