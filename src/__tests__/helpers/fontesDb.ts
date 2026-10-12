/**
 * Apoio dos testes das Fontes oficiais com IA: abre um banco de desenvolvimento isolado (todas as migrações e a carga) na
 * pasta pedida e cria as três contas de teste — administrador, editor e aluno —, a mesma montagem de `aiCentral.test.ts`.
 * Quem chama fecha o banco no fim (`dev.db.close()`) e apaga a pasta.
 */
import { openDevDatabaseForTests, type DevDatabase } from "../../../server/devDb/devDatabase";
import { devContentDb, type ContentDb, type Identity } from "../../../server/contentHub/infra";

const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";

export interface FontesDb {
  dev: DevDatabase;
  db: ContentDb;
  ADMIN: string;
  EDITOR: string;
  STUDENT: string;
  adminUser: Identity;
  editorUser: Identity;
  studentUser: Identity;
}

export async function openFontesDb(dir: string): Promise<FontesDb> {
  const dev = await openDevDatabaseForTests(dir);
  const db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ad@t.dev'), ($2, 'ed@t.dev'), ($3, 'al@t.dev')`, [ADMIN, EDITOR, STUDENT]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  return {
    dev,
    db,
    ADMIN,
    EDITOR,
    STUDENT,
    adminUser: { id: ADMIN, email: "ad@t.dev" },
    editorUser: { id: EDITOR, email: "ed@t.dev" },
    studentUser: { id: STUDENT, email: "al@t.dev" },
  };
}
