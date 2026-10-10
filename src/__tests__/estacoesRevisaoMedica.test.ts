// @vitest-environment node
/**
 * Estações (ES03): aprovar uma estação é revisão médica de verdade, no modelo das Atualizações
 * (app_admin_review_guideline_update + ch_is_reviewer), num Postgres real em memória:
 *   - só aprova o revisor médico cadastrado na área da estação, ou um administrador (editor comum não);
 *   - aprovar exige registrar o que foi conferido (10 caracteres ou mais); fica gravado quem aprovou e quando;
 *   - devolver para revisão pede o motivo, e também fica gravado quem devolveu e quando;
 *   - o revisor médico que não é da equipe abre a lista e o conteúdo da estação (para conferir); o aluno não.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const REV_CM = "00000000-0000-4000-8000-0000000000f1"; // revisor médico de Clínica Médica (papel de aluno)
const REV_PED = "00000000-0000-4000-8000-0000000000f2"; // revisor médico de Pediatria (papel de aluno)
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
const NOTA = "Conferi roteiro, impressos e checklist com o PEP.";
let db: PGlite;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
    return r.rows[0].result;
  });
}
const visibleTo = (uid: string) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<{ id: string }>(`select id from public.checklist_stations order by id`)).rows.map((r) => r.id);
  });
const row = async (id: string) => (await db.query<any>(`select medical_review, review_note, reviewed_by, reviewed_at from public.checklist_stations where id = $1`, [id])).rows[0];
const item = (list: any[], id: string) => list.find((s) => s.id === id);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'ed@t.dev'), ($3, 'cm@t.dev'), ($4, 'ped@t.dev'), ($5, 'al@t.dev')`, [ADMIN, EDITOR, REV_CM, REV_PED, STUDENT]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await db.query(`update public.profiles set name = 'Dr. Clínico' where id = $1`, [REV_CM]);
  await db.query(`update public.profiles set name = 'Editora' where id = $1`, [EDITOR]);
  await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CLINICA_MEDICA'), ($2, 'PEDIATRIA')`, [REV_CM, REV_PED]);
  await db.exec(`
    insert into public.checklist_stations (id, name, topic, area, medical_review) values
      ('st-cm', 'Cetoacidose diabética', 'DM1 descompensado', 'Clínica Médica', 'pending'),
      ('st-cir', 'Abdome agudo', 'Apendicite', 'Cirurgia Geral', 'pending');
    insert into public.checklist_station_contents (station_id, content) values
      ('st-cm', '{"id": "st-cm", "doctor_scene": "Pronto-socorro.", "actor_script": "Roteiro do ator.", "pressings": [], "checklist_items": []}');
  `);
}, 300_000);

describe("Estações — quem aprova", () => {
  it("editor que não é revisor médico não aprova; revisor de outra área também não", async () => {
    await expect(rpc(EDITOR, "app_admin_set_station_review", { p_station_id: "st-cm", p_status: "approved", p_note: NOTA })).rejects.toThrow(/revisor médico cadastrado em Clínica Médica ou de um administrador/);
    await expect(rpc(REV_PED, "app_admin_set_station_review", { p_station_id: "st-cm", p_status: "approved", p_note: NOTA })).rejects.toThrow(/revisor médico cadastrado em Clínica Médica/);
    expect((await row("st-cm")).medical_review).toBe("pending");
  });

  it("aprovar exige registrar o que foi conferido (10 caracteres ou mais); a chamada antiga, sem nota, não aprova", async () => {
    await expect(rpc(REV_CM, "app_admin_set_station_review", { p_station_id: "st-cm", p_status: "approved" })).rejects.toThrow(/pelo menos 10 caracteres/);
    await expect(rpc(REV_CM, "app_admin_set_station_review", { p_station_id: "st-cm", p_status: "approved", p_note: "  ok ok   " })).rejects.toThrow(/pelo menos 10 caracteres/);
    expect((await row("st-cm")).medical_review).toBe("pending");
  });

  it("o revisor da área aprova e fica registrado quem, quando e o que conferiu (também no Registro)", async () => {
    expect(await visibleTo(STUDENT)).toEqual([]);
    const list = await rpc(REV_CM, "app_admin_set_station_review", { p_station_id: "st-cm", p_status: "approved", p_note: `  ${NOTA}  ` });
    expect(item(list, "st-cm")).toMatchObject({ medical_review: "approved", review_note: NOTA, reviewer: "Dr. Clínico" });
    expect(item(list, "st-cm").reviewed_at).toBeTruthy();
    const saved = await row("st-cm");
    expect(saved).toMatchObject({ medical_review: "approved", review_note: NOTA, reviewed_by: REV_CM });
    expect(saved.reviewed_at).toBeTruthy();
    const log = (await db.query<any>(`select actor_id, details from public.admin_audit_log where action = 'station.review' order by created_at desc limit 1`)).rows[0];
    expect(log.actor_id).toBe(REV_CM);
    expect(log.details).toMatchObject({ from: "pending", to: "approved", note: NOTA });
    expect(await visibleTo(STUDENT)).toEqual(["st-cm"]);
    await expect(rpc(REV_CM, "app_admin_set_station_review", { p_station_id: "st-cm", p_status: "approved", p_note: NOTA })).rejects.toThrow(/já está aprovada/);
  });

  it("o administrador aprova sem ser revisor cadastrado (com a nota)", async () => {
    await expect(rpc(ADMIN, "app_admin_set_station_review", { p_station_id: "st-cir", p_status: "approved", p_note: "curta" })).rejects.toThrow(/pelo menos 10 caracteres/);
    const list = await rpc(ADMIN, "app_admin_set_station_review", { p_station_id: "st-cir", p_status: "approved", p_note: "Conferida pelo administrador com o PEP." });
    expect(item(list, "st-cir")).toMatchObject({ medical_review: "approved" });
    expect((await row("st-cir")).reviewed_by).toBe(ADMIN);
  });

  it("devolver para revisão pede o motivo e grava quem devolveu e quando", async () => {
    await expect(rpc(EDITOR, "app_admin_set_station_review", { p_station_id: "st-cir", p_status: "pending" })).rejects.toThrow(/motivo/);
    await expect(rpc(EDITOR, "app_admin_set_station_review", { p_station_id: "st-cir", p_status: "pending", p_note: "erro" })).rejects.toThrow(/motivo/);
    const list = await rpc(EDITOR, "app_admin_set_station_review", { p_station_id: "st-cir", p_status: "pending", p_note: "Aluno relatou impresso trocado." });
    expect(item(list, "st-cir")).toMatchObject({ medical_review: "pending", review_note: "Aluno relatou impresso trocado.", reviewer: "Editora" });
    expect(await row("st-cir")).toMatchObject({ medical_review: "pending", reviewed_by: EDITOR });
    expect(await visibleTo(STUDENT)).toEqual(["st-cm"]);
    await expect(rpc(EDITOR, "app_admin_set_station_review", { p_station_id: "st-cir", p_status: "pending", p_note: "Aluno relatou impresso trocado." })).rejects.toThrow(/já aguarda revisão/);
    await expect(rpc(EDITOR, "app_admin_set_station_review", { p_station_id: "nao-existe", p_status: "pending", p_note: "Aluno relatou impresso trocado." })).rejects.toThrow(/não encontrada/);
  });
});

describe("Estações — quem vê", () => {
  it("o revisor médico que não é da equipe abre a lista (sabendo onde pode aprovar) e o conteúdo para conferir", async () => {
    const list = await rpc(REV_CM, "app_admin_stations");
    expect(list.map((s: any) => s.id).sort()).toEqual(["st-cir", "st-cm"]);
    expect(item(list, "st-cm").can_review).toBe(true);
    expect(item(list, "st-cir").can_review).toBe(false);
    expect(item(await rpc(ADMIN, "app_admin_stations"), "st-cir").can_review).toBe(true);
    expect(item(await rpc(EDITOR, "app_admin_stations"), "st-cir").can_review).toBe(false);
    expect(await rpc(REV_PED, "app_admin_station_content", { p_station_id: "st-cm" })).toMatchObject({ actor_script: "Roteiro do ator." });
    expect(await rpc(EDITOR, "app_admin_station_content", { p_station_id: "st-cir" })).toBeNull();
  });

  it("aluno e visitante continuam barrados na lista, no conteúdo e na revisão", async () => {
    for (const [fn, args] of [
      ["app_admin_stations", {}],
      ["app_admin_station_content", { p_station_id: "st-cm" }],
      ["app_admin_set_station_review", { p_station_id: "st-cm", p_status: "pending", p_note: "Quero devolver esta estação." }],
    ] as [string, Record<string, unknown>][]) {
      await expect(rpc(STUDENT, fn, args), fn).rejects.toThrow(/Acesso restrito/);
      await expect(rpc(null, fn, args), fn).rejects.toThrow(/Acesso restrito|permission denied/);
    }
    expect((await row("st-cm")).medical_review).toBe("approved");
  });

  it("as funções internas da revisão não podem ser chamadas de fora", async () => {
    for (const sql of [`select public.checklist_station_area_code('Pediatria')`, `select public.checklist_station_can_review('Pediatria')`]) {
      await expect(
        db.transaction(async (tx) => {
          await tx.exec("set local role authenticated");
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN })]);
          await tx.query(sql);
        })
      ).rejects.toThrow(/permission denied/);
    }
  });
});
