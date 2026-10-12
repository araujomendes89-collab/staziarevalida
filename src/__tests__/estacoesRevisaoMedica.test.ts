// @vitest-environment node
/**
 * Estações (ES03): aprovar uma estação é revisão médica de verdade, no modelo das Atualizações
 * (app_admin_review_guideline_update + ch_is_reviewer), num Postgres real em memória:
 *   - só aprova o revisor médico cadastrado na área da estação, ou um administrador (editor comum não);
 *   - aprovar exige registrar o que foi conferido (10 caracteres ou mais); fica gravado quem aprovou e quando;
 *   - devolver para revisão pede o motivo, e também fica gravado quem devolveu e quando;
 *   - o revisor médico que não é da equipe abre a lista e o conteúdo da estação (para conferir); o aluno não;
 *   - o registro (nota, quem, quando) é interno: fica em checklist_station_reviews, fora do catálogo que o aluno lê.
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
// Situação da estação (checklist_stations) + o registro interno da revisão (checklist_station_reviews; nulo quando não há).
const row = async (id: string) =>
  (await db.query<any>(
    `select s.medical_review, v.review_note, v.reviewed_by, v.reviewed_at
       from public.checklist_stations s left join public.checklist_station_reviews v on v.station_id = s.id
      where s.id = $1`,
    [id]
  )).rows[0];
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
    for (const sql of [
      `select public.checklist_station_area_code('Pediatria')`,
      `select public.checklist_station_can_review('Pediatria')`,
      `select public.checklist_station_assert_staff()`,
    ]) {
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

describe("Estações — não dependem da Central de Conteúdo", () => {
  it("com a Central de Conteúdo desligada, a aba Estações continua abrindo e a revisão médica continua valendo", async () => {
    await db.query(`update public.ch_flags set value = false where key = 'enabled'`);
    try {
      expect((await rpc(EDITOR, "app_admin_stations")).map((s: any) => s.id).sort()).toEqual(["st-cir", "st-cm"]);
      expect(await rpc(REV_PED, "app_admin_station_content", { p_station_id: "st-cm" })).toMatchObject({ actor_script: "Roteiro do ator." });
      const back = await rpc(REV_CM, "app_admin_set_station_review", { p_station_id: "st-cm", p_status: "pending", p_note: "Refazer a conferência do impresso." });
      expect(item(back, "st-cm")).toMatchObject({ medical_review: "pending", reviewer: "Dr. Clínico" });
      await expect(rpc(EDITOR, "app_admin_set_station_review", { p_station_id: "st-cm", p_status: "approved", p_note: NOTA })).rejects.toThrow(/revisor médico/);
      const again = await rpc(REV_CM, "app_admin_set_station_review", { p_station_id: "st-cm", p_status: "approved", p_note: NOTA });
      expect(item(again, "st-cm")).toMatchObject({ medical_review: "approved", review_note: NOTA });
      await expect(rpc(STUDENT, "app_admin_stations")).rejects.toThrow(/Acesso restrito/);
    } finally {
      await db.query(`update public.ch_flags set value = true where key = 'enabled'`);
    }
  });
});

describe("Estações — o registro da revisão não mente (rodada 1)", () => {
  const record = async (id: string) => item(await rpc(ADMIN, "app_admin_stations"), id);

  it("aprovar por comando direto no banco (fora da função) apaga o registro de quem devolveu", async () => {
    await db.exec(`insert into public.checklist_stations (id, name, topic, area, medical_review) values ('st-ped', 'Bronquiolite', 'Lactente com sibilância', 'Pediatria', 'approved')`);
    await rpc(EDITOR, "app_admin_set_station_review", { p_station_id: "st-ped", p_status: "pending", p_note: "Aluno relatou impresso trocado." });
    expect(await record("st-ped")).toMatchObject({ medical_review: "pending", reviewer: "Editora", review_note: "Aluno relatou impresso trocado." });

    // mudança que não mexe na situação mantém o registro
    await db.exec(`update public.checklist_stations set topic = 'Lactente com sibilância e tiragem' where id = 'st-ped'`);
    expect(await record("st-ped")).toMatchObject({ medical_review: "pending", reviewer: "Editora" });

    // o SQL que o README ensinava: a Editora não pode aparecer como quem aprovou
    await db.exec(`update public.checklist_stations set medical_review = 'approved' where id = 'st-ped'`);
    expect(await row("st-ped")).toMatchObject({ medical_review: "approved", review_note: null, reviewed_by: null, reviewed_at: null });
    expect(await record("st-ped")).toMatchObject({ medical_review: "approved", reviewer: null, review_note: null, reviewed_at: null });

    // pela função, o registro continua sendo gravado
    await rpc(REV_PED, "app_admin_set_station_review", { p_station_id: "st-ped", p_status: "pending", p_note: "Refazer a conferência do roteiro." });
    expect(await row("st-ped")).toMatchObject({ medical_review: "pending", reviewed_by: REV_PED, review_note: "Refazer a conferência do roteiro." });
  });

  it("colar a carga (seed) de novo devolve a estação para revisão sem dizer que o revisor devolveu", async () => {
    const { buildSeedStatements } = await import("../../scripts/supabase/seed-builder");
    const stationsSql = buildSeedStatements().find((s) => s.startsWith("insert into public.checklist_stations "));
    expect(stationsSql).toBeTruthy();
    await db.exec(stationsSql!);
    await rpc(REV_CM, "app_admin_set_station_review", { p_station_id: "seed-01", p_status: "approved", p_note: NOTA });
    expect(await row("seed-01")).toMatchObject({ medical_review: "approved", reviewed_by: REV_CM, review_note: NOTA });

    await db.exec(stationsSql!);
    expect(await row("seed-01")).toMatchObject({ medical_review: "pending", review_note: null, reviewed_by: null, reviewed_at: null });
    expect(await record("seed-01")).toMatchObject({ medical_review: "pending", reviewer: null, review_note: null });
  }, 300_000);
});

describe("Estações — permissões das funções da aba (rodada 1)", () => {
  it("visitante (anon) não tem permissão de executar as funções da aba; usuário logado tem (a checagem interna decide)", async () => {
    for (const fn of ["public.app_admin_set_station_review(text, text, text)", "public.app_admin_station_content(text)", "public.app_admin_stations()"]) {
      const r = (await db.query<any>(`select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as auth`, [fn])).rows[0];
      expect(r, fn).toEqual({ anon: false, auth: true });
    }
  });
});

// Leva 2 (revisor do conjunto): o registro interno da revisão (o que foi conferido, quem e quando) ficava em colunas de
// checklist_stations, a tabela do catálogo que todo usuário logado lê (política de …0400_checklist_bank.sql e a permissão
// padrão do Supabase em todas as colunas): /rest/v1/checklist_stations?select=id,review_note,reviewed_by entregava o registro
// a qualquer aluno. Agora o registro fica em checklist_station_reviews, que só as funções da aba leem e gravam.
const CATALOGO = ["id", "name", "topic", "area", "setting", "taxonomy_path", "goal", "institution", "year", "styles", "is_pro_only",
  "medical_review", "max_score", "duration_ms", "created_at"];
const REGISTRO = ["review_note", "reviewed_by", "reviewed_at"];
const NOTA_MFC = "Conferi roteiro, impressos e PEP da estação de MFC.";
const FORA_DA_ABA = "Nota escrita por fora da aba.";
const comoUsuario = (uid: string | null, sql: string) =>
  db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return (await tx.query<any>(sql)).rows;
  });
const registroGravado = async (id: string) =>
  (await db.query<any>(`select review_note, reviewed_by from public.checklist_station_reviews where station_id = $1`, [id])).rows;
const permissoesNaTabelaDoRegistro = async () =>
  (await db.query<any>(
    `select papel, permissao from unnest(array['anon', 'authenticated']) papel,
            unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) permissao
      where has_table_privilege(papel, 'public.checklist_station_reviews', permissao)`
  )).rows;

describe("Estações — o aluno não lê o registro da revisão (leva 2)", () => {
  beforeAll(async () => {
    await db.query(`update public.profiles set name = 'Administradora' where id = $1`, [ADMIN]);
    await db.exec(`
      insert into public.checklist_stations (id, name, topic, area, medical_review) values
        ('st-mfc', 'Hipertensão na UBS', 'Primeira consulta', 'Medicina de Família e Comunidade', 'pending');
      insert into public.checklist_station_contents (station_id, content) values ('st-mfc', '{"id": "st-mfc", "actor_script": "Roteiro MFC."}');
    `);
    await rpc(ADMIN, "app_admin_set_station_review", { p_station_id: "st-mfc", p_status: "approved", p_note: NOTA_MFC });
  });

  it("o catálogo que o aluno lê (checklist_stations) não tem coluna do registro (coluna nova obriga a decidir aqui)", async () => {
    const colunas = (await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'checklist_stations'`
    )).rows.map((r) => r.column_name);
    expect(colunas.sort()).toEqual([...CATALOGO].sort());
  });

  it("o aluno lê a estação aprovada com select * e o conteúdo dela, sem a nota, sem quem aprovou e sem quando", async () => {
    const estacoes = await comoUsuario(STUDENT, `select * from public.checklist_stations where id = 'st-mfc'`);
    expect(estacoes).toHaveLength(1);
    expect(estacoes[0]).toMatchObject({ id: "st-mfc", name: "Hipertensão na UBS", area: "Medicina de Família e Comunidade", medical_review: "approved", is_pro_only: false });
    expect(Object.keys(estacoes[0]).sort()).toEqual([...CATALOGO].sort());

    const inteira = JSON.stringify(await comoUsuario(STUDENT, `select to_jsonb(s) as estacao from public.checklist_stations s where id = 'st-mfc'`));
    expect(inteira).toContain("Hipertensão na UBS");
    expect(inteira).not.toContain(NOTA_MFC);
    expect(inteira).not.toContain(ADMIN);

    expect(await comoUsuario(STUDENT, `select station_id from public.checklist_station_contents where station_id = 'st-mfc'`)).toEqual([{ station_id: "st-mfc" }]);
    for (const c of REGISTRO) {
      await expect(comoUsuario(STUDENT, `select id, ${c} from public.checklist_stations`), c).rejects.toThrow(/does not exist/);
    }
  });

  it("aluno, revisor, equipe e visitante não leem nem mexem direto na tabela do registro (só as funções da aba)", async () => {
    for (const uid of [STUDENT, REV_CM, EDITOR, ADMIN, null]) {
      for (const sql of [
        `select * from public.checklist_station_reviews`,
        `select review_note from public.checklist_station_reviews where station_id = 'st-mfc'`,
        `insert into public.checklist_station_reviews (station_id, review_note) values ('st-cm', '${FORA_DA_ABA}')`,
        `update public.checklist_station_reviews set review_note = '${FORA_DA_ABA}'`,
        `delete from public.checklist_station_reviews`,
      ]) {
        await expect(comoUsuario(uid, sql), `${uid ?? "visitante"}: ${sql}`).rejects.toThrow(/permission denied/);
      }
    }
    expect(await permissoesNaTabelaDoRegistro()).toEqual([]);
    expect(await registroGravado("st-mfc")).toEqual([{ review_note: NOTA_MFC, reviewed_by: ADMIN }]);
  });

  it("se alguém devolver a permissão da tabela por engano, o aluno continua sem ler nem gravar (acesso por linha ligado, sem política)", async () => {
    const DESFAZER = new Error("desfaz a permissão dada só para este teste");
    await expect(
      db.transaction(async (tx) => {
        await tx.exec(`grant select, insert, update, delete on public.checklist_station_reviews to anon, authenticated`);
        await tx.exec(`set local role authenticated`);
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: STUDENT })]);
        expect((await tx.query(`select * from public.checklist_station_reviews`)).rows).toEqual([]);
        expect((await tx.query(`update public.checklist_station_reviews set review_note = '${FORA_DA_ABA}' returning station_id`)).rows).toEqual([]);
        expect((await tx.query(`delete from public.checklist_station_reviews returning station_id`)).rows).toEqual([]);
        await expect(tx.query(`insert into public.checklist_station_reviews (station_id, review_note) values ('st-cm', '${FORA_DA_ABA}')`)).rejects.toThrow(/row-level security/);
        throw DESFAZER;
      })
    ).rejects.toBe(DESFAZER);
    expect(await permissoesNaTabelaDoRegistro()).toEqual([]);
    expect(await registroGravado("st-mfc")).toEqual([{ review_note: NOTA_MFC, reviewed_by: ADMIN }]);
  });

  it("a equipe e o revisor médico continuam vendo nota, quem e quando pela função da aba; o aluno não", async () => {
    const daEquipe = item(await rpc(EDITOR, "app_admin_stations"), "st-mfc");
    expect(daEquipe).toMatchObject({ medical_review: "approved", review_note: NOTA_MFC, reviewer: "Administradora" });
    expect(daEquipe.reviewed_at).toBeTruthy();
    expect(item(await rpc(REV_CM, "app_admin_stations"), "st-mfc")).toMatchObject({ review_note: NOTA_MFC, reviewer: "Administradora" });
    await expect(rpc(STUDENT, "app_admin_stations")).rejects.toThrow(/Acesso restrito/);
  });

  it("apagar a estação apaga o registro dela", async () => {
    await db.exec(`insert into public.checklist_stations (id, name, topic, area, medical_review) values ('st-go', 'Pré-natal', 'Primeira consulta', 'Ginecologia e Obstetrícia', 'pending')`);
    await rpc(ADMIN, "app_admin_set_station_review", { p_station_id: "st-go", p_status: "approved", p_note: NOTA });
    expect(await registroGravado("st-go")).toEqual([{ review_note: NOTA, reviewed_by: ADMIN }]);
    await db.exec(`delete from public.checklist_stations where id = 'st-go'`);
    expect(await registroGravado("st-go")).toEqual([]);
  });
});

describe("Estações — colar a migração de novo por engano (leva 2)", () => {
  it("colar a …8000 pela segunda vez dá erro e não muda nada: registro, trava, permissões e funções continuam", async () => {
    const antes = await row("st-mfc");
    expect(antes).toMatchObject({ medical_review: "approved", review_note: NOTA_MFC, reviewed_by: ADMIN });
    await expect(db.exec(fs.readFileSync(path.join(MIGRATIONS, "20261003008000_estacoes_revisao_medica.sql"), "utf8"))).rejects.toThrow(/already exists/);
    expect(await row("st-mfc")).toEqual(antes);

    const contagem = (await db.query<any>(`select
        (select count(*)::int from pg_trigger where tgrelid = 'public.checklist_stations'::regclass and tgname = 'checklist_stations_review_guard') as trava,
        (select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and proname = 'app_admin_set_station_review') as funcoes_de_revisao`)).rows[0];
    expect(contagem).toEqual({ trava: 1, funcoes_de_revisao: 1 });
    for (const fn of ["public.app_admin_set_station_review(text, text, text)", "public.app_admin_station_content(text)", "public.app_admin_stations()"]) {
      const r = (await db.query<any>(`select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as auth`, [fn])).rows[0];
      expect(r, fn).toEqual({ anon: false, auth: true });
    }
    for (const fn of ["public.checklist_stations_review_guard()", "public.checklist_station_assert_staff()", "public.checklist_station_area_code(text)", "public.checklist_station_can_review(text)"]) {
      const r = (await db.query<any>(`select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as auth`, [fn])).rows[0];
      expect(r, fn).toEqual({ anon: false, auth: false });
    }

    // a revisão e a trava continuam valendo
    const devolvida = await rpc(EDITOR, "app_admin_set_station_review", { p_station_id: "st-mfc", p_status: "pending", p_note: "Aluno relatou impresso trocado." });
    expect(item(devolvida, "st-mfc")).toMatchObject({ medical_review: "pending", reviewer: "Editora", review_note: "Aluno relatou impresso trocado." });
    await db.exec(`update public.checklist_stations set medical_review = 'approved' where id = 'st-mfc'`);
    expect(await row("st-mfc")).toMatchObject({ medical_review: "approved", review_note: null, reviewed_by: null, reviewed_at: null });
  });
});
