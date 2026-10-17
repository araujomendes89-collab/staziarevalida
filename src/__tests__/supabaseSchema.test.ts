// @vitest-environment node
/**
 * Esquema Supabase (supabase/migrations) testado num Postgres real em memória (PGlite):
 * aplica as migrações e verifica as políticas de acesso agindo como aluno, dupla e servidor.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

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
    // papel: desde a 013780 (auditoria de segurança) o aluno nem tem permissão de gravar; o RLS continua como segunda trava
    await expect(as(user(ids.ana), (tx) => tx.query(`update public.user_roles set role = 'admin'`))).rejects.toThrow(/permission denied/);
    const plan = await as(user(ids.ana), (tx) => tx.query(`update public.subscriptions set plan = 'elite', status = 'active'`));
    expect(plan.affectedRows).toBe(0);
    expect(await as(user(ids.ana), (tx) => rows(tx, `select role from public.user_roles`))).toEqual([{ role: "student" }]);
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
  it("estação em revisão médica só aparece para a equipe; conteúdo Pro exige plano", async () => {
    const student = await as(user(ids.ana), (tx) => rows(tx, `select id from public.checklist_stations order by id`));
    expect(student.map((x) => x.id)).toEqual(["st-free", "st-pro"]);
    const contents = await as(user(ids.ana), (tx) => rows(tx, `select station_id from public.checklist_station_contents order by 1`));
    expect(contents.map((x) => x.station_id)).toEqual(["st-free"]);

    await db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id = $1`, [ids.carla]);
    const pro = await as(user(ids.carla), (tx) => rows(tx, `select station_id from public.checklist_station_contents order by 1`));
    expect(pro.map((x) => x.station_id)).toEqual(["st-free", "st-pro"]);

    const admin = await as(user(ids.admin), (tx) => rows(tx, `select id from public.checklist_stations`));
    expect(admin).toHaveLength(3);
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

describe("Supabase — sala em dupla (máquina de estados no banco)", () => {
  const idle = { status: "Idle", roles: null, session: null, schedule: null };
  let roomId = "";
  let rev = 0;

  const update = (who: string, state: unknown, nextRev = rev + 1) =>
    as(user(who), (tx) =>
      tx.query(`update public.checklist_rooms set state = $1, rev = $2 where id = $3`, [state, nextRev, roomId])
    );
  const current = async () => (await db.query<any>(`select state, rev from public.checklist_rooms where id = $1`, [roomId])).rows[0];
  const step = async (who: string, mutate: (s: any) => any) => {
    const { state } = await current();
    const res = await update(who, mutate(structuredClone(state)));
    rev += 1;
    return res;
  };

  it("membro cria a sala; quem não é membro não vê", async () => {
    const r = await as(user(ids.ana), (tx) =>
      rows(tx, `insert into public.checklist_rooms (member_ids, state) values ($1, $2) returning id`, [
        [ids.ana, ids.bruno],
        idle,
      ])
    );
    roomId = r[0].id;
    expect(await as(user(ids.carla), (tx) => rows(tx, `select id from public.checklist_rooms`))).toEqual([]);
  });

  it("fluxo completo e permissões de cada papel", async () => {
    // Bruno escolhe ser médico: Ana é a atriz
    await step(ids.bruno, (s) => ({ ...s, status: "WaitingActorChooseStation", roles: { actor_id: ids.ana, doctor_id: ids.bruno } }));

    // Só o ator escolhe a estação
    const session = {
      station_id: "st-free", allowed_pressings: [], checklists: [], started_at: null, finished_at: null, paused_at: null,
      paused_total_ms: 0, is_paused: false, show_clock: true, maximum_duration: 600000, actor_notes: "",
      checklist_bank_event_id: null, saved_session_id: null,
    };
    await expect(update(ids.bruno, { ...(await current()).state, status: "WaitingActorStartStation", session })).rejects.toThrow(
      /Só o ator escolhe e inicia/
    );
    await step(ids.ana, (s) => ({ ...s, status: "WaitingActorStartStation", session }));
    await step(ids.ana, (s) => ({ ...s, status: "OnStation", session: { ...s.session, started_at: new Date().toISOString() } }));

    // Ator libera impresso e avalia; médico não pode
    await step(ids.ana, (s) => ({
      ...s,
      session: { ...s.session, allowed_pressings: [{ id: "p1", time: 30000 }], checklists: [{ id: "i1", grade: "Correct", subitems: [] }] },
    }));
    const state = (await current()).state;
    await expect(
      update(ids.bruno, { ...state, session: { ...state.session, checklists: [{ id: "i1", grade: "Correct", subitems: [] }, { id: "i2", grade: "Correct", subitems: [] }] } })
    ).rejects.toThrow(/Só o ator altera "checklists"/);

    // Médico não encerra antes do tempo
    await expect(update(ids.bruno, { ...state, status: "OnReview" })).rejects.toThrow(/antes do fim do tempo/);

    // Versão antiga é rejeitada (duas telas gravando ao mesmo tempo)
    await expect(update(ids.ana, state, rev)).rejects.toThrow(/Versão desatualizada/);

    // Ninguém marca como salva, só o servidor
    await expect(
      update(ids.ana, { ...state, session: { ...state.session, saved_session_id: "falso" } })
    ).rejects.toThrow(/Só o servidor marca/);

    // Tempo esgotado: o médico pode encerrar, mas só registrando o fim
    await as(server, (tx) =>
      tx.query(
        `update public.checklist_rooms set state = jsonb_set(state, '{session,started_at}', to_jsonb((now() - interval '11 minutes')::text)) where id = $1`,
        [roomId]
      )
    );
    await step(ids.bruno, (s) => ({ ...s, status: "OnReview", session: { ...s.session, finished_at: new Date().toISOString() } }));
    expect((await current()).state.status).toBe("OnReview");

    // Sem salvar, não começa outra estação
    await expect(update(ids.ana, { ...(await current()).state, status: "WaitingActorChooseStation", session: null })).rejects.toThrow(
      /Finalize e salve/
    );

    // Servidor salva; depois disso a avaliação fica congelada e a dupla segue para a próxima
    await as(server, (tx) =>
      tx.query(`update public.checklist_rooms set state = jsonb_set(state, '{session,saved_session_id}', '"sessao-1"') where id = $1`, [roomId])
    );
    const saved = (await current()).state;
    await expect(
      update(ids.ana, { ...saved, session: { ...saved.session, checklists: [] } })
    ).rejects.toThrow(/já foi salva/);
    await step(ids.ana, (s) => ({ ...s, status: "WaitingActorChooseStation", session: null }));
    expect((await current()).state).toMatchObject({ status: "WaitingActorChooseStation", session: null });
  });

  it("convite: só o convidado aceita, e só dentro de 60 s", async () => {
    const inv = await as(user(ids.ana), (tx) =>
      rows(tx, `insert into public.study_invites (to_user, room_id) values ($1, $2) returning id`, [ids.bruno, roomId])
    );
    const id = inv[0].id;
    await expect(
      as(user(ids.ana), (tx) => tx.query(`update public.study_invites set status = 'accepted' where id = $1`, [id]))
    ).rejects.toThrow(/Só o convidado/);
    expect(await as(user(ids.carla), (tx) => rows(tx, `select id from public.study_invites`))).toEqual([]);

    await db.query(`update public.study_invites set expires_at = now() - interval '1 second' where id = $1`, [id]);
    await expect(
      as(user(ids.bruno), (tx) => tx.query(`update public.study_invites set status = 'accepted' where id = $1`, [id]))
    ).rejects.toThrow(/expirado/);
  });
});
