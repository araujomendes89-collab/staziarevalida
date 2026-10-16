// @vitest-environment node
/**
 * Privacidade do cartão criado pelo aluno (15/10/2026, pedido do dono: "cada flashcard gerado por cada aluno fica somente para ele").
 * Todas as migrações num Postgres real em memória (PGlite), com o RLS valendo. Só leitura das regras: o banco NÃO é alterado aqui.
 * O que vale hoje: cartão do aluno tem owner_id = o aluno; outro aluno não lê, não muda, não apaga e não vê na fila nem nas imagens;
 * visitante não lê nada; cartão da plataforma tem owner_id nulo e só aparece publicado. A equipe (editor/admin) lê pela regra
 * is_staff() da tabela — está documentado em docs/flashcard-layout.md.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ANA = "00000000-0000-4000-8000-0000000000a1";
const BRUNO = "00000000-0000-4000-8000-0000000000b2";
const EDITORA = "00000000-0000-4000-8000-0000000000e3";

let db: PGlite;
let cartaoAna: string;

/** Roda SQL como um usuário (authenticated) ou visitante (anon), com o RLS valendo. */
async function como<T = any>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
const rpc = async (uid: string, fn: string, args: Record<string, unknown> = {}) => {
  const keys = Object.keys(args);
  const r = await como<{ r: any }>(uid, `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, keys.map((k) => args[k]));
  return r[0].r;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'ana@teste.dev'), ($2, 'bruno@teste.dev'), ($3, 'editora@teste.dev')`, [ANA, BRUNO, EDITORA]);
  await db.query(`insert into public.user_roles (user_id, role) values ($1, 'editor') on conflict (user_id) do update set role = excluded.role`, [EDITORA]);
  await db.exec(`
    insert into public.flashcards (area, topic, front, back, review_status, published) values
      ('CLINICA_MEDICA', 'Oficial', 'Cartão da plataforma publicado', 'Verso', 'approved', true),
      ('CLINICA_MEDICA', 'Oficial', 'Cartão da plataforma em revisão', 'Verso', 'unreviewed', false);
  `);
  cartaoAna = (await rpc(ANA, "app_create_flashcard", { p_area: "PEDIATRIA", p_topic: "Bronquiolite", p_front: "Pergunta da Ana", p_back: "Resposta da Ana" })).id;
}, 120_000);

describe("cartão criado pelo aluno é só dele", () => {
  it("o cartão nasce com owner_id = a aluna, não publicado e sem revisão", async () => {
    const [c] = (await db.query<any>(`select owner_id, published, review_status from public.flashcards where id = $1`, [cartaoAna])).rows;
    expect(c).toEqual({ owner_id: ANA, published: false, review_status: "unreviewed" });
  });

  it("a dona vê o cartão na fila (com mine = true); outro aluno não vê nem na fila nem lendo a tabela", async () => {
    const fila = (await rpc(ANA, "app_flashcards")).queue;
    expect(fila.find((c: any) => c.id === cartaoAna)).toMatchObject({ mine: true, front: "Pergunta da Ana" });
    const filaBruno = (await rpc(BRUNO, "app_flashcards")).queue;
    expect(filaBruno.map((c: any) => c.front)).toEqual(["Cartão da plataforma publicado"]);
    expect((await rpc(BRUNO, "app_flashcards")).counts.mine).toBe(0);
    expect(await como(BRUNO, `select * from public.flashcards where id = $1`, [cartaoAna])).toEqual([]);
    expect(await como(BRUNO, `select * from public.flashcards where owner_id is not null`)).toEqual([]);
  });

  it("outro aluno não muda, não apaga e não revisa o cartão; o cartão continua intacto", async () => {
    expect(await como(BRUNO, `update public.flashcards set front = 'invadido' where id = $1 returning id`, [cartaoAna])).toEqual([]);
    expect(await como(BRUNO, `delete from public.flashcards where id = $1 returning id`, [cartaoAna])).toEqual([]);
    await expect(rpc(BRUNO, "app_delete_flashcard", { p_card_id: cartaoAna })).rejects.toThrow(/não encontrado/);
    await expect(rpc(BRUNO, "app_review_flashcard", { p_card_id: cartaoAna, p_rating: 3, p_next: { due: new Date().toISOString(), state: 1, stability: 1, difficulty: 5, reps: 1, lapses: 0, scheduled_days: 0, elapsed_days: 0 } })).rejects.toThrow(/não encontrado/);
    const [c] = (await db.query<any>(`select front from public.flashcards where id = $1`, [cartaoAna])).rows;
    expect(c.front).toBe("Pergunta da Ana");
  });

  it("outro aluno não consegue criar cartão em nome da colega nem publicar o próprio", async () => {
    await expect(como(BRUNO, `insert into public.flashcards (owner_id, area, topic, front, back) values ($1, 'PEDIATRIA', 'x', 'f', 'b')`, [ANA])).rejects.toThrow(/row-level security/);
    await expect(como(BRUNO, `insert into public.flashcards (owner_id, area, topic, front, back, published) values ($1, 'PEDIATRIA', 'x', 'f', 'b', true)`, [BRUNO])).rejects.toThrow(/row-level security/);
  });

  it("a função das imagens ilustradas não devolve nada do cartão pessoal (nem para a dona)", async () => {
    expect(await rpc(BRUNO, "app_flashcards_ilustrados", { p_ids: [cartaoAna] })).toEqual({});
    expect(await rpc(ANA, "app_flashcards_ilustrados", { p_ids: [cartaoAna] })).toEqual({});
  });

  it("visitante sem login não lê cartão nenhum", async () => {
    expect(await como(null, `select * from public.flashcards`)).toEqual([]);
  });

  it("cartão da plataforma: owner_id nulo e só aparece publicado", async () => {
    const plataforma = await como<any>(BRUNO, `select front, owner_id from public.flashcards where owner_id is null order by front`);
    expect(plataforma).toEqual([{ front: "Cartão da plataforma publicado", owner_id: null }]);
  });

  it("estado da revisão (agenda) de um aluno não aparece para outro", async () => {
    await rpc(ANA, "app_review_flashcard", { p_card_id: cartaoAna, p_rating: 3, p_next: { due: new Date(Date.now() + 86_400_000).toISOString(), state: 1, stability: 1, difficulty: 5, reps: 1, lapses: 0, scheduled_days: 1, elapsed_days: 0 } });
    expect((await como(ANA, `select card_id from public.flashcard_states`)).length).toBe(1);
    expect(await como(BRUNO, `select * from public.flashcard_states`)).toEqual([]);
    expect(await como(BRUNO, `select * from public.flashcard_reviews`)).toEqual([]);
  });

  it("equipe (editor/admin) não recebe o cartão pessoal na própria fila, mas a regra da tabela deixa ler (ver docs/flashcard-layout.md)", async () => {
    expect((await rpc(EDITORA, "app_flashcards")).queue.map((c: any) => c.id)).not.toContain(cartaoAna);
    expect((await como(EDITORA, `select id from public.flashcards where id = $1`, [cartaoAna])).length).toBe(1);
  });
});
