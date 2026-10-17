// @vitest-environment node
/**
 * Esquema Supabase (supabase/migrations) testado num Postgres real em memória (PGlite):
 * aplica as migrações e verifica as políticas de acesso agindo como aluno, dupla e servidor.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { STATION, U, addProfile, addStation, makeRoom, openDuplaDb, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

const ids = {
  ana: "00000000-0000-4000-8000-00000000000a",
  bruno: "00000000-0000-4000-8000-00000000000b",
  carla: "00000000-0000-4000-8000-00000000000c",
  admin: "00000000-0000-4000-8000-0000000000ad",
};

let db: PGlite;

type Who = { uid: string | null; role?: "authenticated" | "anon" | "service_role" };

/** Executa como um usuário (claims do JWT + papel), dentro de uma transação. */
async function as<T>(who: Who, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${who.role ?? "authenticated"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(who.uid ? { sub: who.uid, role: who.role ?? "authenticated" } : {}),
    ]);
    return fn(tx);
  });
}
const user = (uid: string): Who => ({ uid });
const server: Who = { uid: null, role: "service_role" };

const rows = async (tx: Transaction, sql: string, params: unknown[] = []) => (await tx.query<any>(sql, params)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const [name, id] of Object.entries(ids)) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      id,
      `${name}@teste.dev`,
      { name: name.toUpperCase() },
    ]);
  }
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ids.admin]);

  // Conteúdo mínimo
  await db.exec(`
    insert into public.exams (id, kind, year, semester, title, question_count)
      values ('revalida-2021', 'REVALIDA', 2021, null, 'Revalida INEP 2021', 3);
    insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option, status) values
      ('q1', 'REV-2021-Q001', 'revalida-2021', 1, 'CLINICA_MEDICA', 'Hipertireoidismo', 'Mulher de 38 anos com tremores e fibrilação atrial.',
        '[{"id":"A","text":"radioiodo"},{"id":"B","text":"cirurgia"},{"id":"C","text":"metimazol"},{"id":"D","text":"observação"}]', 'C', 'valid'),
      ('q2', 'REV-2021-Q002', 'revalida-2021', 2, 'PEDIATRIA', 'Bronquiolite', 'Lactente com sibilância e tiragem.',
        '[{"id":"A","text":"a"},{"id":"B","text":"b"},{"id":"C","text":"c"},{"id":"D","text":"d"}]', 'A', 'valid'),
      ('q3', 'REV-2021-Q003', 'revalida-2021', 3, 'PEDIATRIA', 'Anulada', 'Questão anulada.',
        '[{"id":"A","text":"a"},{"id":"B","text":"b"},{"id":"C","text":"c"},{"id":"D","text":"d"}]', 'B', 'annulled');
    insert into public.checklist_stations (id, name, topic, area, is_pro_only, medical_review) values
      ('st-free', 'Cetoacidose', 'DM1', 'Clínica Médica', false, 'approved'),
      ('st-pro', 'Trauma', 'ATLS', 'Cirurgia Geral', true, 'approved'),
      ('st-pending', 'Diarreia', 'Desidratação', 'Pediatria', false, 'pending');
    insert into public.checklist_station_contents (station_id, content) values
      ('st-free', '{"actor_script":"roteiro"}'), ('st-pro', '{"actor_script":"pro"}'), ('st-pending', '{"actor_script":"pendente"}');
  `);
}, 60_000);

describe("Supabase — cadastro, perfil, papel e plano", () => {
  it("cadastro cria perfil, papel de aluno e 7 dias de teste", async () => {
    const r = await as(user(ids.ana), (tx) =>
      rows(tx, `select p.name, r.role, s.plan, s.status, (s.trial_ends_at - now()) > interval '6 days' as seven_days
                from public.profiles p join public.user_roles r on r.user_id = p.id join public.subscriptions s on s.user_id = p.id`)
    );
    expect(r).toEqual([{ name: "ANA", role: "student", plan: "trial", status: "trialing", seven_days: true }]);
  });

  it("cada aluno só vê e edita o próprio perfil", async () => {
    const visible = await as(user(ids.ana), (tx) => rows(tx, `select id from public.profiles`));
    expect(visible.map((x) => x.id)).toEqual([ids.ana]);

    await as(user(ids.ana), (tx) => tx.query(`update public.profiles set name = 'Ana Lima' where id = $1`, [ids.ana]));
    const changedOther = await as(user(ids.ana), (tx) =>
      tx.query(`update public.profiles set name = 'hack' where id = $1`, [ids.bruno])
    );
    expect(changedOther.affectedRows).toBe(0);
    expect((await db.query<any>(`select name from public.profiles where id = $1`, [ids.bruno])).rows[0].name).toBe("BRUNO");
  });

  it("aluno não consegue se promover a admin nem liberar plano", async () => {
    const role = await as(user(ids.ana), (tx) => tx.query(`update public.user_roles set role = 'admin'`));
    const plan = await as(user(ids.ana), (tx) => tx.query(`update public.subscriptions set plan = 'elite', status = 'active'`));
    expect(role.affectedRows).toBe(0);
    expect(plan.affectedRows).toBe(0);
    await expect(
      as(user(ids.ana), (tx) => tx.query(`insert into public.billing_events (provider, event_id, event_type, payload) values ('x','1','paid','{}')`))
    ).rejects.toThrow(/row-level security/);
    expect(await as(user(ids.ana), (tx) => rows(tx, `select public.has_pro() as pro`))).toEqual([{ pro: false }]);
  });
});

describe("Supabase — questões e tentativas", () => {
  it("logado lê questões; visitante anônimo não lê nada", async () => {
    expect((await as(user(ids.ana), (tx) => rows(tx, `select id from public.questions order by id`))).length).toBe(3);
    expect(await as({ uid: null, role: "anon" }, (tx) => rows(tx, `select id from public.questions`))).toEqual([]);
  });

  it("acerto é calculado pelo banco: o valor enviado pelo navegador é ignorado", async () => {
    await as(user(ids.ana), (tx) =>
      tx.query(`insert into public.question_attempts (question_id, selected_option, is_correct) values ('q1', 'A', true), ('q1', 'C', false)`)
    );
    const r = await as(user(ids.ana), (tx) =>
      rows(tx, `select selected_option, is_correct from public.question_attempts where question_id = 'q1' order by selected_option`)
    );
    expect(r).toEqual([
      { selected_option: "A", is_correct: false },
      { selected_option: "C", is_correct: true },
    ]);
  });

  it("não registra tentativa em nome de outro aluno e não altera histórico", async () => {
    await expect(
      as(user(ids.ana), (tx) =>
        tx.query(`insert into public.question_attempts (user_id, question_id, selected_option) values ($1, 'q2', 'A')`, [ids.bruno])
      )
    ).rejects.toThrow(/row-level security/);
    const upd = await as(user(ids.ana), (tx) => tx.query(`update public.question_attempts set is_correct = true`));
    expect(upd.affectedRows).toBe(0);
  });

  it("desempenho por área e caderno de erros mostram só os dados do próprio aluno, sem anuladas", async () => {
    await as(user(ids.bruno), (tx) =>
      tx.query(`insert into public.question_attempts (question_id, selected_option) values ('q2', 'B'), ('q3', 'A')`)
    );
    const ana = await as(user(ids.ana), (tx) => rows(tx, `select area, attempts, correct, accuracy from public.my_area_stats`));
    expect(ana).toEqual([{ area: "CLINICA_MEDICA", attempts: 2, correct: 1, accuracy: "50.0" }]);

    const bruno = await as(user(ids.bruno), (tx) => rows(tx, `select question_id, status from public.my_error_notebook`));
    expect(bruno).toEqual([{ question_id: "q2", status: "para_revisar" }]); // q3 anulada fica de fora

    const anaErrors = await as(user(ids.ana), (tx) => rows(tx, `select question_id, status from public.my_error_notebook`));
    expect(anaErrors).toEqual([{ question_id: "q1", status: "superada" }]); // errou e depois acertou
  });
});

describe("Supabase — estações (2ª fase)", () => {
  it("estação em revisão médica só aparece para a equipe; o conteúdo completo é só da equipe", async () => {
    const student = await as(user(ids.ana), (tx) => rows(tx, `select id from public.checklist_stations order by id`));
    expect(student.map((x) => x.id)).toEqual(["st-free", "st-pro"]);
    // O conteúdo (roteiro do ator, impressos, PEP) deixou de ser lido direto pelo aluno: só a equipe (Treino em Dupla, migração 9750).
    const contents = await as(user(ids.ana), (tx) => rows(tx, `select station_id from public.checklist_station_contents order by 1`));
    expect(contents).toEqual([]);

    await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id = $1`, [ids.carla]);
    const pro = await as(user(ids.carla), (tx) => rows(tx, `select station_id from public.checklist_station_contents order by 1`));
    expect(pro).toEqual([]);

    const admin = await as(user(ids.admin), (tx) => rows(tx, `select id from public.checklist_stations`));
    expect(admin).toHaveLength(3);
    const adminContents = await as(user(ids.admin), (tx) => rows(tx, `select station_id from public.checklist_station_contents order by 1`));
    expect(adminContents.map((x) => x.station_id)).toEqual(["st-free", "st-pending", "st-pro"]);
  });

  it("sessão prática só é gravada pelo servidor", async () => {
    await expect(
      as(user(ids.ana), (tx) =>
        tx.query(
          `insert into public.checklist_study_sessions (id, station_id, room_id, actor_id, doctor_id, started_at, finished_at, score, max_score, correctness)
           values ('s1', 'st-free', gen_random_uuid(), $1, $2, now(), now(), 10, 10, 100)`,
          [ids.bruno, ids.ana]
        )
      )
    ).rejects.toThrow(/row-level security/);
  });
});

describe("Supabase — Treinamento em Dupla (dados)", () => {
  let d: DuplaDb;
  const SEM_ACESSO = /Sem acesso ao Treinamento em Dupla\./;
  const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
  const ABERTO = { aberto: true, planos: ["pro", "elite"] };
  const uuidFalso = "00000000-0000-4000-8000-0000000000ff";

  /** Todo mundo volta ao teste grátis válido e a chave volta ao padrão (desligada). */
  async function zerar() {
    for (const uid of Object.values(U)) await setPlan(d.db, uid, "trial", "trialing", daqui(7));
    await setDupla(d.db, { aberto: false, planos: ["pro", "elite"] });
  }

  beforeAll(async () => {
    d = await openDuplaDb();
    await addStation(d.db);
    await addStation(d.db, { ...STATION, id: "teste-dupla-e02", name: "Segunda estação de teste" }, { is_pro_only: true });
    await addStation(d.db, { ...STATION, id: "teste-dupla-e03", name: "Terceira estação de teste" }, { medical_review: "pending" });
  }, 60_000);
  afterAll(async () => {
    await d?.db.close();
  });

  it("conteúdo das estações: só a equipe lê direto; aluno, mesmo Pro, não", async () => {
    await zerar();
    await setPlan(d.db, U.carla, "pro", "active");
    expect(await d.asUser(U.ana, `select station_id from public.checklist_station_contents`)).toEqual([]);
    expect(await d.asUser(U.carla, `select station_id from public.checklist_station_contents`)).toEqual([]);
    expect(await d.asUser(U.admin, `select station_id from public.checklist_station_contents`)).toHaveLength(3);
  });

  it("acesso: chave desligada barra o aluno, mesmo Pro; a equipe entra", async () => {
    await zerar();
    await setPlan(d.db, U.carla, "pro", "active");
    expect(await d.rpc(U.ana, "app_dupla_access")).toEqual({ aberto: false, permitido: false, planos: ["pro", "elite"], equipe: false });
    expect(await d.rpc(U.carla, "app_dupla_access")).toMatchObject({ aberto: false, permitido: false, equipe: false });
    expect(await d.rpc(U.admin, "app_dupla_access")).toMatchObject({ aberto: false, permitido: true, equipe: true });
    await expect(d.rpc(U.carla, "app_dupla_room_content", { p_room_id: uuidFalso })).rejects.toThrow(SEM_ACESSO);
  });

  it("acesso: chave ligada e padrão → Pro/Elite active ou past_due entram; teste grátis, canceled e expired não", async () => {
    await zerar();
    await setDupla(d.db, ABERTO);
    await setPlan(d.db, U.carla, "pro", "active");
    await setPlan(d.db, U.bruno, "elite", "past_due");
    await setPlan(d.db, U.eva, "pro", "canceled");
    await setPlan(d.db, U.fabio, "elite", "expired");
    // Pro ativo, mas com o "plano pago até" já vencido (regra da 9550): fora.
    await setPlan(d.db, U.diego, "pro", "active");
    await d.sql(`update public.subscriptions set current_period_end = now() - interval '1 day' where user_id = $1`, [U.diego]);
    const permitido = async (uid: string) => (await d.rpc(uid, "app_dupla_access")).permitido;
    expect(await permitido(U.carla)).toBe(true);
    expect(await permitido(U.bruno)).toBe(true);
    expect(await permitido(U.ana)).toBe(false); // teste grátis válido, mas "trial" não está marcado
    expect(await permitido(U.eva)).toBe(false);
    expect(await permitido(U.fabio)).toBe(false);
    expect(await permitido(U.diego)).toBe(false);
    expect(await permitido(U.admin)).toBe(true);
    expect(await d.rpc(U.carla, "app_dupla_access")).toEqual({ aberto: true, permitido: true, planos: ["pro", "elite"], equipe: false });
  });

  it("acesso: com o teste grátis marcado, só trialing dentro do prazo", async () => {
    await zerar();
    await setDupla(d.db, { aberto: true, planos: ["trial", "pro", "elite"] });
    await setPlan(d.db, U.bruno, "trial", "trialing", daqui(-1)); // venceu ontem
    await setPlan(d.db, U.eva, "trial", "expired", daqui(3)); // situação expirada
    await setPlan(d.db, U.fabio, "trial", "canceled", daqui(3));
    const permitido = async (uid: string) => (await d.rpc(uid, "app_dupla_access")).permitido;
    expect(await permitido(U.ana)).toBe(true);
    expect(await permitido(U.bruno)).toBe(false);
    expect(await permitido(U.eva)).toBe(false);
    expect(await permitido(U.fabio)).toBe(false);
    // Só Pro marcado: o teste grátis volta a ficar de fora, mesmo dentro do prazo.
    await setDupla(d.db, { aberto: true, planos: ["pro"] });
    expect(await permitido(U.ana)).toBe(false);
    await setPlan(d.db, U.carla, "elite", "active");
    expect(await permitido(U.carla)).toBe(false); // Elite não está marcado
  });

  it("perfil de estudo: cada um lê só o seu e ninguém grava direto", async () => {
    await addProfile(d.db, U.ana, { public_name: "Ana Teste" });
    await addProfile(d.db, U.bruno, { public_name: "Bruno Teste" });
    const lidos = await d.asUser(U.ana, `select user_id, public_name from public.study_profiles`);
    expect(lidos).toEqual([{ user_id: U.ana, public_name: "Ana Teste" }]);
    expect((await d.asUser(U.ana, `update public.study_profiles set public_name = 'Ana Mudou' where user_id = $1`, [U.ana])).affectedRows).toBe(0);
    expect((await d.asUser(U.ana, `update public.study_profiles set public_name = 'Hack Bruno' where user_id = $1`, [U.bruno])).affectedRows).toBe(0);
    expect((await d.asUser(U.ana, `delete from public.study_profiles`)).affectedRows).toBe(0);
    await expect(d.asUser(U.carla, `insert into public.study_profiles (user_id, public_name) values ($1, 'Carla Teste')`, [U.carla])).rejects.toThrow(/row-level security/);
    expect(await d.sql(`select public_name from public.study_profiles order by user_id`)).toEqual([{ public_name: "Ana Teste" }, { public_name: "Bruno Teste" }]);
    // As regras de tamanho e de valores valem no banco.
    for (const ruim of [{ public_name: "ab" }, { public_name: "  a  " }, { public_name: "x".repeat(41) }, { bio: "x".repeat(161) }, { exam: "2026/3" }, { areas: ["XX"] }, { role_pref: "outro" }, { pace: "rapido" }, { days: ["Seg", "Xis"] }, { shifts: ["Madrugada"] }, { status: "ausente" }]) {
      await expect(addProfile(d.db, U.gil, ruim), JSON.stringify(ruim)).rejects.toThrow(/check constraint/);
    }
    await d.sql(`delete from public.study_profiles where user_id = $1`, [U.gil]);
  });

  describe("conteúdo por papel", () => {
    let sala = "";
    beforeAll(async () => {
      await zerar();
      await setDupla(d.db, ABERTO);
      for (const uid of [U.ana, U.bruno, U.carla]) await setPlan(d.db, uid, "pro", "active");
      sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "running", candidate: U.ana, evaluator: U.bruno, station: STATION.id, extra: { released_pressings: ["p1"] } });
    });

    it("candidato não recebe roteiro, PEP nem impresso não liberado; avaliador recebe tudo", async () => {
      const cand = await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: sala });
      const json = JSON.stringify(cand);
      for (const proibido of ["actor_script", "checklist_items", "Liberação:", "Radiografia", "Dados pessoais", "Só se perguntado", "Subitem", "Adequado"]) expect(json, proibido).not.toContain(proibido);
      expect(cand.role).toBe("candidate");
      expect(cand.pressing_count).toBe(2);
      // Etapa P (012900): chave de tela 'd<n>', sem o nome nem o id da estação, com a folha do candidato.
      expect(cand.pressings).toEqual([{ id: "d1", display_number: 1, initially_visible: false, name: "Hemograma", content: "Hb 9,0 g/dL", has_image: false }]);
      expect(cand.station).toEqual({
        label: "Estação", area: "Clínica Médica", area_code: "CM", number: null, duration_ms: 600000, version: "1.0",
        doctor_scene: STATION.doctor_scene, doctor_tasks: STATION.doctor_tasks, candidate_sheet: { has_image: false },
      });

      const aval = await d.rpc(U.bruno, "app_dupla_room_content", { p_room_id: sala });
      expect(aval.role).toBe("evaluator");
      expect(aval.station.actor_script).toContain("Dados pessoais:");
      expect(aval.station.actor_script).toContain("Só se perguntado:");
      expect(aval.pressings).toHaveLength(2);
      expect(aval.pressings[0]).toMatchObject({ id: "p1", index: 1, has_image: false });
      expect(aval.pressings[0].content).toContain("Liberação:");
      expect(aval.pressings[1]).toMatchObject({ id: "p2", index: 2, content: "Radiografia de tórax.", has_image: true });
      expect(aval.checklist_items).toHaveLength(3);
      expect(aval.checklist_items[0]).toEqual({
        id: "i1", order: 1, content: "Item um", tip: "Dica um",
        grades: { correct: 2.5, partial: 1.25, incorrect: 0 },
        criteria: { correct: "Adequado um", partial: "Parcial um", incorrect: "Inadequado um" }, subitems: [],
      });
      expect(aval.checklist_items[1].grades.partial).toBeNull();
      expect(aval.checklist_items[1].criteria).toEqual({ correct: "Adequado dois", incorrect: "Inadequado dois" });
      expect(aval.checklist_items[2].subitems).toEqual([{ id: "s1", text: "Subitem um" }, { id: "s2", text: "Subitem dois" }]);
    });

    it("na fase roles ninguém recebe conteúdo por papel; quem não é membro recebe 'Sala não encontrada.'", async () => {
      const roles = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", candidate: U.ana, evaluator: U.bruno });
      for (const uid of [U.ana, U.bruno]) {
        const r = await d.rpc(uid, "app_dupla_room_content", { p_room_id: roles });
        expect(r.role).toBeNull();
        // Etapa P (012900): só o avaliador (Bruno) recebe o nome e o id da estação.
        const chaves = ["area", "area_code", "duration_ms", "label", "number", ...(uid === U.bruno ? ["id", "name"] : [])].sort();
        expect(Object.keys(r.station).sort()).toEqual(chaves);
        expect(r.pressing_count).toBe(2);
        expect(r.pressings).toEqual([]);
        expect(JSON.stringify(r)).not.toMatch(/actor_script|checklist_items|Hb 9|Radiografia|doctor_scene/);
      }
      const fechada = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "closed", candidate: U.ana, evaluator: U.bruno, extra: { closed_reason: "saiu" } });
      expect((await d.rpc(U.bruno, "app_dupla_room_content", { p_room_id: fechada })).role).toBeNull();
      // Membro sem papel gravado (a sala ainda não definiu quem é quem), mesmo em fase adiantada: sem papel, sem conteúdo.
      const semPapel = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "setup" });
      expect(JSON.stringify(await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: semPapel }))).not.toMatch(/actor_script|checklist_items|doctor_scene/);
      // Não membro (com acesso ao módulo) e sala que não existe.
      await expect(d.rpc(U.carla, "app_dupla_room_content", { p_room_id: sala })).rejects.toThrow(/Sala não encontrada\./);
      await expect(d.rpc(U.carla, "app_dupla_room_content", { p_room_id: uuidFalso })).rejects.toThrow(/Sala não encontrada\./);
      // Visitante e quem perdeu o acesso.
      await expect(d.rpc(null, "app_dupla_room_content", { p_room_id: sala })).rejects.toThrow(/permission denied/);
      await setPlan(d.db, U.ana, "pro", "canceled");
      await expect(d.rpc(U.ana, "app_dupla_room_content", { p_room_id: sala })).rejects.toThrow(SEM_ACESSO);
      await setPlan(d.db, U.ana, "pro", "active");
    });

    it("a chave de imagem do impresso vale pelo id ou por p<ordem>; sala sem estação devolve só o papel vazio", async () => {
      const outra = { ...STATION, id: "teste-dupla-e04", pressing_assets: { "teste-p1": {}, p2: {} }, pressings: [{ id: "teste-p1", name: "A", content: "um" }, { id: "x2", name: "B", content: "dois" }] };
      await addStation(d.db, outra);
      const s = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "review", candidate: U.ana, evaluator: U.bruno, station: outra.id, extra: { released_pressings: ["teste-p1", "x2"] } });
      expect((await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: s })).pressings.map((p: any) => p.has_image)).toEqual([true, true]);
      const semEstacao = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", station: null });
      expect(await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: semEstacao })).toEqual({ role: null, station: null, pressing_count: 0, pressings: [] });
    });
  });

  it("marcações: ninguém grava direto; o avaliador lê; o candidato só depois da avaliação da rodada", async () => {
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "review", candidate: U.ana, evaluator: U.bruno, round: 2 });
    await d.sql(`insert into public.checklist_room_marks (room_id, round, item_id, evaluator_id, grade, subitems_checked) values ($1, 2, 'i1', $2, 'correct', '{}'), ($1, 2, 'i3', $2, null, '{s1}')`, [sala, U.bruno]);
    expect(await d.asUser(U.bruno, `select item_id from public.checklist_room_marks order by item_id`)).toEqual([{ item_id: "i1" }, { item_id: "i3" }]);
    expect(await d.asUser(U.ana, `select item_id from public.checklist_room_marks`)).toEqual([]);
    expect(await d.asUser(U.carla, `select item_id from public.checklist_room_marks`)).toEqual([]);
    await expect(d.asUser(U.bruno, `insert into public.checklist_room_marks (room_id, round, item_id, evaluator_id, grade) values ($1, 2, 'i2', $2, 'partial')`, [sala, U.bruno])).rejects.toThrow(/row-level security/);
    expect((await d.asUser(U.bruno, `update public.checklist_room_marks set grade = 'incorrect'`)).affectedRows).toBe(0);
    expect((await d.asUser(U.bruno, `delete from public.checklist_room_marks`)).affectedRows).toBe(0);
    // A avaliação de OUTRA rodada não abre esta; a da mesma rodada abre para o candidato dela.
    await d.sql(
      `insert into public.checklist_study_sessions (id, station_id, room_id, round, actor_id, doctor_id, started_at, finished_at, score, max_score, correctness)
       values ('sessao-r1', $1, $2, 1, $3, $4, now(), now(), 5, 10, 50)`,
      [STATION.id, sala, U.bruno, U.ana]
    );
    expect(await d.asUser(U.ana, `select item_id from public.checklist_room_marks`)).toEqual([]);
    await d.sql(
      `insert into public.checklist_study_sessions (id, station_id, room_id, round, actor_id, doctor_id, started_at, finished_at, score, max_score, correctness)
       values ('sessao-r2', $1, $2, 2, $3, $4, now(), now(), 7.5, 10, 75)`,
      [STATION.id, sala, U.bruno, U.ana]
    );
    expect(await d.asUser(U.ana, `select item_id from public.checklist_room_marks order by item_id`)).toEqual([{ item_id: "i1" }, { item_id: "i3" }]);
    expect(await d.asUser(U.carla, `select item_id from public.checklist_room_marks`)).toEqual([]);
    // Uma avaliação por sala e rodada; feedback até 1000; motivo da revisão até 500.
    await expect(d.sql(`insert into public.checklist_study_sessions (id, station_id, room_id, round, actor_id, doctor_id, started_at, finished_at, score, max_score, correctness) values ('sessao-dup', $1, $2, 2, $3, $4, now(), now(), 1, 10, 10)`, [STATION.id, sala, U.bruno, U.ana])).rejects.toThrow(/duplicate key|unique/);
    await expect(d.sql(`update public.checklist_study_sessions set feedback_pos = $1 where id = 'sessao-r2'`, ["x".repeat(1001)])).rejects.toThrow(/check constraint/);
    await expect(d.sql(`update public.checklist_study_sessions set review_reason = $1 where id = 'sessao-r2'`, ["x".repeat(501)])).rejects.toThrow(/check constraint/);
    // Ninguém grava sessão direto (como antes).
    await expect(d.asUser(U.bruno, `insert into public.checklist_study_sessions (id, station_id, room_id, actor_id, doctor_id, started_at, finished_at, score, max_score, correctness) values ('x', $1, $2, $3, $4, now(), now(), 1, 10, 10)`, [STATION.id, sala, U.bruno, U.ana])).rejects.toThrow(/row-level security/);
  });

  it("sala, convites, escolhas e matches: envolvidos leem; ninguém cria nem altera direto", async () => {
    const sala = await makeRoom(d.db, { members: [U.diego, U.eva], phase: "roles" });
    const [match] = await d.sql<{ id: string }>(`insert into public.study_matches (user_a, user_b, station_id, room_id) values ($1, $2, $3, $4) returning id`, [U.diego, U.eva, STATION.id, sala]);
    await d.sql(`update public.checklist_rooms set match_id = $1 where id = $2`, [match.id, sala]);
    await d.sql(`insert into public.study_swipes (from_user, to_user, direction, station_id) values ($1, $2, 'right', $3), ($2, $1, 'left', null)`, [U.diego, U.eva, STATION.id]);
    const [convite] = await d.sql<{ id: string }>(`insert into public.study_invites (from_user, to_user, room_id) values ($1, $2, $3) returning id`, [U.diego, U.eva, sala]);

    for (const uid of [U.diego, U.eva]) {
      // Etapa P (012900): a sala só é lida pelas funções (a leitura direta entregava a estação ao candidato).
      expect((await d.asUser(uid, `select id from public.checklist_rooms where id = $1`, [sala])).length, "sala").toBe(0);
      expect((await d.asUser(uid, `select id from public.study_matches`)).length, "match").toBe(1);
      expect((await d.asUser(uid, `select id from public.study_invites`)).length, "convite").toBe(1);
      expect((await d.asUser(uid, `select from_user from public.study_swipes`)).map((r) => r.from_user), "escolhas").toEqual([uid]);
    }
    for (const t of ["checklist_rooms", "study_matches", "study_invites", "study_swipes"]) {
      // study_matches: só as colunas liberadas (a estação do match não é legível pelo aluno, 013300)
      expect(await d.asUser(U.fabio, `select ${t === "study_matches" ? "id" : "*"} from public.${t}`), t).toEqual([]);
    }
    expect((await d.sql(`select phase, candidate_id from public.checklist_rooms where id = $1`, [sala]))[0]).toEqual({ phase: "roles", candidate_id: null });

    // Ninguém cria nem altera direto.
    await expect(d.asUser(U.diego, `insert into public.checklist_rooms (member_ids) values ($1)`, [[U.diego, U.eva]])).rejects.toThrow(/row-level security/);
    expect((await d.asUser(U.diego, `update public.checklist_rooms set phase = 'running', candidate_id = $1 where id = $2`, [U.diego, sala])).affectedRows).toBe(0);
    expect((await d.asUser(U.diego, `delete from public.checklist_rooms`)).affectedRows).toBe(0);
    await expect(d.asUser(U.diego, `insert into public.study_invites (from_user, to_user, room_id) values ($1, $2, $3)`, [U.diego, U.eva, sala])).rejects.toThrow(/row-level security/);
    expect((await d.asUser(U.eva, `update public.study_invites set status = 'accepted' where id = $1`, [convite.id])).affectedRows).toBe(0);
    expect((await d.asUser(U.diego, `update public.study_invites set status = 'canceled' where id = $1`, [convite.id])).affectedRows).toBe(0);
    await expect(d.asUser(U.diego, `insert into public.study_swipes (from_user, to_user, direction) values ($1, $2, 'right')`, [U.diego, U.gil])).rejects.toThrow(/row-level security/);
    expect((await d.asUser(U.diego, `update public.study_swipes set direction = 'left'`)).affectedRows).toBe(0);
    await expect(d.asUser(U.diego, `insert into public.study_matches (user_a, user_b) values ($1, $2)`, [U.diego, U.gil])).rejects.toThrow(/row-level security/);
    expect((await d.asUser(U.diego, `update public.study_matches set station_id = null`)).affectedRows).toBe(0);
    // a estação do match não é legível pelo aluno (013300): o tema só sai pelas funções da sala
    await expect(d.asUser(U.diego, `select station_id from public.study_matches`)).rejects.toThrow(/permission denied/);
    expect(await d.sql(`select status from public.study_invites where id = $1`, [convite.id])).toEqual([{ status: "pending" }]);
    // O que o banco confere sozinho: sala com dois membros diferentes, link só https, duração e fase dentro dos limites.
    await expect(d.sql(`insert into public.checklist_rooms (member_ids) values ($1)`, [[U.diego, U.diego]])).rejects.toThrow(/check constraint/);
    for (const ruim of [{ call_link: "http://meet.exemplo.com/a" }, { call_link: "https://semponto" }, { call_link: "https://meet.exemplo.com/" + "a".repeat(500) }, { duration_ms: 59999 }, { duration_ms: 3600001 }, { phase: "outra" }, { round: 0 }, { closed_reason: "cansou" }]) {
      await expect(makeRoom(d.db, { members: [U.diego, U.eva], phase: "roles", extra: ruim }), JSON.stringify(ruim).slice(0, 40)).rejects.toThrow(/check constraint/);
    }
    await makeRoom(d.db, { members: [U.diego, U.eva], phase: "setup", extra: { call_link: "https://meet.exemplo.com/abc-defg", duration_ms: 60000 } });
  });

  it("excluir a conta apaga perfil, escolhas e matches e deixa a avaliação para o parceiro, sem o vínculo", async () => {
    await addProfile(d.db, U.gil, { public_name: "Gil Teste" });
    const sala = await makeRoom(d.db, { members: [U.gil, U.fabio], phase: "result", candidate: U.gil, evaluator: U.fabio });
    await d.sql(`insert into public.study_swipes (from_user, to_user, direction) values ($1, $2, 'right'), ($2, $1, 'right')`, [U.gil, U.fabio]);
    const [match] = await d.sql<{ id: string }>(`insert into public.study_matches (user_a, user_b, room_id) values ($1, $2, $3) returning id`, [U.gil, U.fabio, sala]);
    await d.sql(`insert into public.checklist_room_marks (room_id, round, item_id, evaluator_id, grade) values ($1, 1, 'i1', $2, 'correct')`, [sala, U.fabio]);
    await d.sql(
      `insert into public.checklist_study_sessions (id, station_id, room_id, round, actor_id, doctor_id, started_at, finished_at, score, max_score, correctness)
       values ('sessao-gil', $1, $2, 1, $3, $4, now(), now(), 5, 10, 50)`,
      [STATION.id, sala, U.fabio, U.gil]
    );
    await d.rpc(U.gil, "app_delete_my_account", { p_confirm: "EXCLUIR" });
    expect(await d.sql(`select 1 from public.study_profiles where user_id = $1`, [U.gil])).toEqual([]);
    expect(await d.sql(`select 1 from public.study_swipes where from_user = $1 or to_user = $1`, [U.gil])).toEqual([]);
    expect(await d.sql(`select 1 from public.study_matches where id = $1`, [match.id])).toEqual([]);
    // A avaliação fica, sem o vínculo; o parceiro (avaliador) continua lendo, e a sala também.
    expect(await d.sql(`select actor_id, doctor_id from public.checklist_study_sessions where id = 'sessao-gil'`)).toEqual([{ actor_id: U.fabio, doctor_id: null }]);
    expect(await d.asUser(U.fabio, `select id from public.checklist_study_sessions`)).toEqual([{ id: "sessao-gil" }]);
    expect(await d.sql(`select candidate_id from public.checklist_rooms where id = $1`, [sala])).toEqual([{ candidate_id: null }]);
    expect(await d.asUser(U.fabio, `select item_id from public.checklist_room_marks`)).toEqual([{ item_id: "i1" }]);
  });

  it("exportação traz perfil de estudo, escolhas, matches e salas, com os direitos de quem chama", async () => {
    await addProfile(d.db, U.ana, { public_name: "Ana Teste" }).catch(() => undefined); // já existe do teste do perfil
    const sala = await makeRoom(d.db, { members: [U.ana, U.carla], phase: "roles" });
    await d.sql(`insert into public.study_swipes (from_user, to_user, direction) values ($1, $2, 'right'), ($2, $1, 'left')`, [U.ana, U.carla]);
    await d.sql(`insert into public.study_matches (user_a, user_b, room_id) values ($1, $2, $3)`, [U.ana, U.carla, sala]);
    const ana = await d.rpc(U.ana, "app_export_my_data");
    expect(ana.study_profile).toMatchObject({ user_id: U.ana, public_name: "Ana Teste" });
    expect(ana.study_swipes).toHaveLength(1);
    expect(ana.study_swipes[0]).toMatchObject({ from_user: U.ana, to_user: U.carla, direction: "right" });
    expect(ana.study_matches).toHaveLength(1);
    expect(ana.checklist_rooms.map((r: any) => r.id)).toContain(sala);
    expect(ana).toHaveProperty("acceptances");
    expect(ana.account.id).toBe(U.ana);
    // Quem não tem nada recebe listas vazias e perfil nulo; nada de outra pessoa.
    const vazio = await d.rpc(U.admin, "app_export_my_data");
    expect(vazio.study_profile).toBeNull();
    expect(vazio.study_swipes).toEqual([]);
    expect(vazio.study_matches).toEqual([]);
    expect(vazio.checklist_rooms).toEqual([]);
    // Direitos de quem chama (não de quem escreveu a função), e visitante não recebe nada.
    expect(await d.sql(`select prosecdef, provolatile from pg_proc where proname = 'app_export_my_data'`)).toEqual([{ prosecdef: false, provolatile: "s" }]);
    expect(await d.rpc(null, "app_export_my_data")).toBeNull();
  });

  it("funções: app_dupla_* fechadas para visitante; dupla_* fechadas para o navegador, menos dupla_me_allowed e dupla_room_member", async () => {
    const funcoes = await d.sql<{ proname: string; anon: boolean; authenticated: boolean; secdef: boolean; config: string[] | null }>(
      `select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
              p.prosecdef as secdef, p.proconfig as config
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and (p.proname like 'app\\_dupla\\_%' or p.proname like 'dupla\\_%') order by 1`
    );
    const nomes = funcoes.map((f) => f.proname);
    expect(nomes).toEqual(expect.arrayContaining(["app_dupla_access", "app_dupla_room_content", "dupla_allowed", "dupla_area_code", "dupla_assert_access", "dupla_me_allowed", "dupla_room_member", "dupla_station_meta"]));
    for (const f of funcoes) {
      if (f.proname.startsWith("app_dupla_")) expect(f, f.proname).toMatchObject({ anon: false, authenticated: true });
      else if (["dupla_me_allowed", "dupla_room_member"].includes(f.proname)) expect(f, f.proname).toMatchObject({ anon: false, authenticated: true });
      // dupla_export_rooms (Etapa P, 012900): só as salas de quem chama (visitante: lista vazia); a exportação, que roda com os
      // direitos de quem chama, inclusive do visitante, precisa dela.
      // dupla_export_chat (Etapa C, 013370): idem, com o que o chat guarda de quem chama (visitante: nulo).
      else if (f.proname === "dupla_export_rooms" || f.proname === "dupla_export_chat" || f.proname === "dupla_export_creditos") expect(f, f.proname).toMatchObject({ anon: true, authenticated: true });
      else expect(f, f.proname).toMatchObject({ anon: false, authenticated: false });
      // Toda função do módulo roda com caminho de busca vazio (security definer ou, nas puras, só por segurança).
      expect(f.config, f.proname).toEqual(['search_path=""']);
    }
    for (const f of funcoes.filter((x) => x.proname !== "dupla_station_meta" && x.proname !== "dupla_area_code")) expect(f.secdef, f.proname).toBe(true);
    // Chamadas reais: o navegador não alcança as de apoio; o visitante não alcança as do app.
    await expect(d.rpc(U.ana, "dupla_allowed", { p_user: U.ana })).rejects.toThrow(/permission denied/);
    await expect(d.rpc(U.ana, "dupla_assert_access")).rejects.toThrow(/permission denied/);
    await expect(d.rpc(null, "app_dupla_access")).rejects.toThrow(/permission denied/);
    await expect(d.rpc(null, "dupla_me_allowed")).rejects.toThrow(/permission denied/);
    // Toda tabela do módulo tem o acesso por linha ligado.
    const semRls = await d.sql(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('study_profiles', 'study_swipes', 'study_matches', 'checklist_room_marks', 'checklist_rooms', 'study_invites', 'checklist_study_sessions', 'checklist_station_contents')
          and not c.relrowsecurity`
    );
    expect(semRls).toEqual([]);
  });
});
