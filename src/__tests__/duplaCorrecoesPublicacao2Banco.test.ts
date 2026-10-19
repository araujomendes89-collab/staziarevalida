// @vitest-environment node
/**
 * Publicação da 2ª fase (17/10), 2ª leva de correções: migração 013406, sobre o banco local (PGlite, migrações reais).
 *  1) o aviso "Você já viu esta estação" vale em QUALQUER sala (e nas avaliações como avaliador), sem dizer qual estação é;
 *  2) estação que voltou a pendente com aluno na sala: nada do conteúdo sai e a rodada volta aos papéis, sem nota;
 *  3) a exportação dos dados traz as tentativas do treino sozinho (station_attempts), com as colunas listadas;
 *  4) refeito pelo fluxo simples (014140): em connecting/setup o candidato não recebe nada da estação (a folha vem no início).
 * Os testes de 1 a 3 falham sem a 013406. Estações e pessoas daqui são SÓ de teste.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addSession, addStation, makeRoom, MIGRATIONS_DIR, openDuplaDb, setDupla, setPlan, STATION, U, type DuplaDb, type Phase,
} from "./helpers/duplaDb";

const MIGRACAO = "20261003013406_treino_dupla_correcoes_publicacao_2.sql";
const INDISPONIVEL = "Esta estação ficou indisponível. Escolham outra.";

const SECRETA = {
  ...STATION,
  id: "teste-inep2020-e07",
  name: "ZZNOME estação secreta",
  topic: "ZZTEMA reservado",
  taxonomy_path: ["Clínica Médica", "ZZTAXO"],
  actor_script: "ZZROTEIRO do ator",
  pressings: [
    { id: "teste-inep2020-e07-p1", name: "Relato do caso", content: "Relato inicial de teste.", image_url: null, source_number: 1, display_number: 1, initially_visible: true },
    { id: "teste-inep2020-e07-p2", name: "Exame A", content: "ZZLIBERAVEL resultado A.", image_url: null, source_number: 2, display_number: 1, initially_visible: false },
  ],
};
const OUTRA = { ...STATION, id: "teste-dupla-outra", name: "ZZOUTRA estação de teste" };
const MARCAS = ["ZZNOME", "ZZTEMA", "ZZTAXO", "teste-inep2020-e07", "ZZROTEIRO", "ZZLIBERAVEL"];
const vaza = (x: unknown) => MARCAS.filter((m) => JSON.stringify(x).includes(m));

describe("Migração 013406: correções da revisão antes de publicar (2ª leva)", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb();
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    for (const u of [U.ana, U.bruno, U.carla, U.diego]) await setPlan(d.db, u, "pro", "active");
    await addStation(d.db, STATION);
    await addStation(d.db, SECRETA);
    await addStation(d.db, OUTRA);
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });
  beforeEach(async () => {
    await d.sql(`delete from public.checklist_study_sessions`);
    await d.sql(`delete from public.study_invites`);
    await d.sql(`delete from public.checklist_rooms`);
    await d.sql(`delete from public.study_matches`);
    await d.sql(`delete from public.station_attempts`);
    // os cartões do catálogo (013420) ficam como estão: sem conteúdo, não podem ser aprovados
    await d.sql(`update public.checklist_stations set medical_review = 'approved' where catalog_edition is null`);
    await d.sql(`update public.user_roles set role = 'student' where user_id = any ($1)`, [[U.ana, U.bruno, U.carla, U.diego]]);
  });

  const act = (uid: string, fn: string, room: string, args: Record<string, unknown> = {}) =>
    d.rpc<any>(uid, `app_dupla_${fn}`, { p_room_id: room, ...args });
  const estado = (uid: string, room: string) => d.rpc<any>(uid, "app_dupla_room", { p_room_id: room });
  const conteudo = (uid: string, room: string) => d.rpc<any>(uid, "app_dupla_room_content", { p_room_id: room });
  const sala = (uid1: string, uid2: string, phase: Phase, station: string | null, extra: Record<string, unknown> = {}) =>
    makeRoom(d.db, { members: [uid1, uid2], phase, candidate: uid1, evaluator: uid2, station, extra });

  // ------------------------------------------------------------------ 1) quem já viu, em qualquer sala
  it("1: a avaliadora de uma sala sai, abre outra sala e vira candidata na MESMA estação → recebe o aviso, sem o nome", async () => {
    // sala 1: ana avaliadora (carla candidata), carla escolheu... a avaliadora escolhe a SECRETA
    const s1 = await makeRoom(d.db, { members: [U.carla, U.ana], phase: "roles", station: null, candidate: U.carla, evaluator: U.ana });
    await act(U.ana, "set_station", s1, { p_station_id: SECRETA.id });
    await d.rpc(U.ana, "app_dupla_leave", { p_room_id: s1 });
    expect((await d.sql(`select phase from public.checklist_rooms where id = $1`, [s1]))[0].phase).toBe("closed");

    // sala 2 (outro par): ana candidata, bruno avaliador escolhe a mesma SECRETA
    const s2 = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", station: null, candidate: U.ana, evaluator: U.bruno });
    await act(U.bruno, "set_station", s2, { p_station_id: SECRETA.id });
    const a = await estado(U.ana, s2);
    expect(a.me).toMatchObject({ role: "candidate", seen_station: true });
    expect(a.station).toBeNull(); // fluxo simples (014140): antes de começar, nada da estação ao candidato (nem nome nem id)
    expect(vaza(a)).toEqual([]);
    expect(vaza(await conteudo(U.ana, s2))).toEqual([]);
    // o avaliador fica sabendo (para combinarem trocar)
    expect((await estado(U.bruno, s2)).partner).toMatchObject({ role: "candidate", seen_station: true });
    // outra estação que a ana nunca viu: sem aviso
    await act(U.bruno, "set_station", s2, { p_station_id: OUTRA.id });
    expect((await estado(U.ana, s2)).me.seen_station).toBe(false);
    expect((await estado(U.bruno, s2)).partner.seen_station).toBe(false);
  });

  it("1: quem escolheu a estação no Banco/na sala de outra sala também recebe o aviso; quem só foi candidato lá, não", async () => {
    // sala 1: bruno avaliador escolhe a SECRETA (ele "escolheu" e "avaliador"); carla candidata (não viu o tema)
    const s1 = await makeRoom(d.db, { members: [U.carla, U.bruno], phase: "roles", station: null, candidate: U.carla, evaluator: U.bruno });
    await act(U.bruno, "set_station", s1, { p_station_id: SECRETA.id });
    await d.sql(`update public.checklist_rooms set phase = 'closed', closed_reason = 'saiu' where id = $1`, [s1]);
    // sala 2: carla candidata com a SECRETA → sem aviso (nunca viu como avaliadora nem escolheu)
    const s2 = await makeRoom(d.db, { members: [U.carla, U.diego], phase: "roles", station: null, candidate: U.carla, evaluator: U.diego });
    await act(U.diego, "set_station", s2, { p_station_id: SECRETA.id });
    expect((await estado(U.carla, s2)).me.seen_station).toBe(false);
    // sala 3: bruno candidato com a SECRETA → aviso
    const s3 = await makeRoom(d.db, { members: [U.bruno, U.ana], phase: "roles", station: null, candidate: U.bruno, evaluator: U.ana });
    await act(U.ana, "set_station", s3, { p_station_id: SECRETA.id });
    const b = await estado(U.bruno, s3);
    expect(b.me).toMatchObject({ role: "candidate", seen_station: true });
    expect(vaza(b)).toEqual([]);
  });

  it("1: avaliação em que a pessoa foi a avaliadora (actor_id), mesmo sem linha de 'quem já viu' (app antigo), acende o aviso", async () => {
    const velha = await makeRoom(d.db, { members: [U.carla, U.diego], phase: "closed", station: SECRETA.id, candidate: U.carla, evaluator: U.diego });
    await d.sql(`delete from public.checklist_room_station_views`);
    await addSession(d.db, { room: velha, round: 1, doctor: U.carla, actor: U.diego, station: SECRETA.id, correctness: 80 });
    const s = await makeRoom(d.db, { members: [U.diego, U.ana], phase: "roles", station: null, candidate: U.diego, evaluator: U.ana });
    await act(U.ana, "set_station", s, { p_station_id: SECRETA.id });
    const dg = await estado(U.diego, s);
    expect(dg.me).toMatchObject({ role: "candidate", seen_station: true });
    expect(vaza(dg)).toEqual([]);
    // a exportação da sala nova continua sem o tema para ele (o aviso diz "já viu", a exportação não diz qual)
    const exp = (await d.rpc<any>(U.diego, "dupla_export_rooms")).find((r: any) => r.id === s);
    expect(exp).not.toHaveProperty("station_id");
  });

  // ------------------------------------------------------------------ 2) estação que voltou a pendente
  it("2: estação volta a pendente com aluno na sala (setup) → o candidato não recebe a folha e a rodada volta aos papéis, sem nota", async () => {
    const id = await sala(U.ana, U.bruno, "setup", SECRETA.id, {
      confirmed_ids: [U.ana, U.bruno], connected_ids: [U.ana, U.bruno], ready_ids: [U.ana], duration_ms: 480000, station_chosen_by: U.bruno,
    });
    await d.sql(`insert into public.checklist_room_marks (room_id, round, item_id, evaluator_id, grade) values ($1, 1, 'i1', $2, 'correct')`, [id, U.bruno]);
    expect(await conteudo(U.ana, id)).toMatchObject({ role: "candidate", station: null, waiting: true }); // fluxo simples (014140): antes de começar, nada da estação ao candidato

    await d.sql(`update public.checklist_stations set medical_review = 'pending' where id = $1`, [SECRETA.id]);
    const c = await conteudo(U.ana, id);
    expect(c).toEqual({ role: null, station: null, pressing_count: 0, pressings: [], notice: INDISPONIVEL });
    const [r] = await d.sql(`select phase, round, station_id, station_chosen_by, candidate_id, evaluator_id, confirmed_ids, connected_ids, ready_ids,
                                    duration_ms, released_pressings, station_dropped_round from public.checklist_rooms where id = $1`, [id]);
    expect(r).toEqual({
      phase: "roles", round: 1, station_id: null, station_chosen_by: null, candidate_id: U.ana, evaluator_id: U.bruno,
      confirmed_ids: [], connected_ids: [], ready_ids: [], duration_ms: null, released_pressings: [], station_dropped_round: 1,
    });
    expect(await d.sql(`select * from public.checklist_room_marks where room_id = $1`, [id])).toEqual([]);
    expect(await d.sql(`select * from public.checklist_study_sessions where room_id = $1`, [id])).toEqual([]);
    // os dois recebem a mesma mensagem neutra, sem o motivo e sem a estação
    for (const u of [U.ana, U.bruno]) {
      const s = await estado(u, id);
      expect(s).toMatchObject({ phase: "roles", station: null, notice: INDISPONIVEL });
      expect(vaza(s)).toEqual([]);
      expect(JSON.stringify(s)).not.toMatch(/revis|aprova|pendente/i);
    }
    // o avaliador escolhe outra estação: o aviso some e a rodada segue a mesma
    const s = await act(U.bruno, "set_station", id, { p_station_id: OUTRA.id });
    expect(s).toMatchObject({ phase: "roles", round: 1, notice: null });
    expect((await estado(U.ana, id)).notice).toBeNull();
  });

  it("2: no início da rodada (iniciar, pronto, conectar) a ação é recusada com a mensagem neutra; a leitura seguinte fecha a rodada", async () => {
    for (const [phase, fn, uid, args] of [
      ["setup", "start", U.bruno, {}],
      ["setup", "ready", U.ana, { p_ready: true }],
      ["connecting", "connected", U.ana, {}],
    ] as const) {
      const id = await sala(U.ana, U.bruno, phase, SECRETA.id, { confirmed_ids: [U.ana, U.bruno], ready_ids: [U.ana, U.bruno] });
      await d.sql(`update public.checklist_stations set medical_review = 'pending' where id = $1`, [SECRETA.id]);
      await expect(act(uid, fn, id, args), fn).rejects.toThrow(INDISPONIVEL);
      expect((await d.sql(`select started_at from public.checklist_rooms where id = $1`, [id]))[0].started_at, fn).toBeNull();
      expect(await estado(U.ana, id), fn).toMatchObject({ phase: "roles", station: null, notice: INDISPONIVEL });
      await d.sql(`update public.checklist_stations set medical_review = 'approved' where id = $1`, [SECRETA.id]);
    }
  });

  it("2: em andamento (running) e na revisão (review) a rodada também fecha sem criar avaliação; finalizar é recusado", async () => {
    const run = await sala(U.ana, U.bruno, "running", SECRETA.id, { started_at: new Date().toISOString(), released_pressings: ["teste-inep2020-e07-p2"] });
    const rev = await sala(U.carla, U.diego, "review", SECRETA.id, { started_at: new Date().toISOString(), finished_at: new Date().toISOString() });
    await d.sql(`update public.checklist_stations set medical_review = 'pending' where id = $1`, [SECRETA.id]);
    expect(vaza(await conteudo(U.ana, run))).toEqual([]);
    expect((await conteudo(U.ana, run)).notice).toBe(INDISPONIVEL);
    await expect(act(U.diego, "finalize", rev, { p_feedback: { pos: "", neg: "", gen: "" } })).rejects.toThrow(INDISPONIVEL);
    expect(await estado(U.carla, rev)).toMatchObject({ phase: "roles", notice: INDISPONIVEL });
    expect(await d.sql(`select * from public.checklist_study_sessions`)).toEqual([]);
    // confirmar sem estação depois disso: a mesma mensagem
    await expect(act(U.carla, "confirm_roles", rev)).rejects.toThrow(INDISPONIVEL);
  });

  it("2: não fecha sala só da equipe, sala no resultado, rodada já avaliada (revisão da nota) nem estação aprovada", async () => {
    await d.sql(`update public.user_roles set role = 'editor' where user_id = any ($1)`, [[U.carla, U.diego]]);
    const equipe = await sala(U.carla, U.diego, "running", SECRETA.id);
    const resultado = await sala(U.ana, U.bruno, "result", SECRETA.id);
    await addSession(d.db, { room: resultado, round: 1, doctor: U.ana, actor: U.bruno, station: SECRETA.id, correctness: 70 });
    await d.sql(`update public.checklist_stations set medical_review = 'pending' where id = $1`, [SECRETA.id]);
    expect((await conteudo(U.carla, equipe)).role).toBe("candidate");
    expect((await estado(U.carla, equipe)).phase).toBe("running");
    expect((await estado(U.ana, resultado)).phase).toBe("result");
    // revisão da nota: rodada com avaliação, de volta em "review"
    await d.sql(`update public.checklist_rooms set phase = 'review' where id = $1`, [resultado]);
    expect((await estado(U.ana, resultado)).phase).toBe("review");
    expect((await d.sql(`select station_id from public.checklist_rooms where id = $1`, [resultado]))[0].station_id).toBe(SECRETA.id);
  });

  // ------------------------------------------------------------------ 3) exportação com o treino sozinho
  it("3: a exportação traz as tentativas do treino sozinho da própria pessoa, com as colunas listadas", async () => {
    await d.sql(`insert into public.station_attempts (user_id, station_id, status) values ($1, $2, 'reading'), ($3, $2, 'reading')`, [U.ana, OUTRA.id, U.bruno]);
    await d.sql(
      `insert into public.station_attempts (user_id, station_id, status, finished_at, marks, score, max_score, correctness)
       values ($1, $2, 'done', now(), '[{"order": 1, "grade": "correct", "points": 2.5, "max": 2.5}]', 2.5, 10, 25)`,
      [U.ana, STATION.id]
    );
    const exp = await d.rpc<any>(U.ana, "app_export_my_data");
    expect(exp.station_attempts).toHaveLength(2);
    expect(exp.station_attempts.map((a: any) => a.station_id).sort()).toEqual([OUTRA.id, STATION.id].sort());
    expect(Object.keys(exp.station_attempts[0]).sort()).toEqual([
      "attendance_ended_at", "attendance_started_at", "correctness", "created_at", "finished_at", "id", "marks", "max_score",
      "score", "started_at", "station_id", "status",
    ]);
    expect(exp.station_attempts.find((a: any) => a.status === "done")).toMatchObject({ correctness: 25, score: 2.5 });
    expect(JSON.stringify(exp)).not.toContain("user_id\":\"" + U.bruno);
    // as outras partes seguem lá
    for (const k of ["checklist_rooms", "declarations", "study_chat", "study_matches"]) expect(exp, k).toHaveProperty(k);
    // quem não tem tentativa: lista vazia; visitante: nada
    expect((await d.rpc<any>(U.carla, "app_export_my_data")).station_attempts).toEqual([]);
    expect(await d.rpc(null, "app_export_my_data")).toBeNull();
    expect(await d.rpc(null, "export_station_attempts")).toEqual([]);
    // a tabela segue fechada ao navegador
    expect(await d.asUser(U.ana, `select * from public.station_attempts`).catch((e) => String(e))).toMatch(/permission denied/);
    // sem a tabela (desfazer da 013330), a exportação não quebra: lista vazia
    await d.db.exec(`alter table public.station_attempts rename to station_attempts_fora`);
    try {
      expect((await d.rpc<any>(U.ana, "app_export_my_data")).station_attempts).toEqual([]);
    } finally {
      await d.db.exec(`alter table public.station_attempts_fora rename to station_attempts`);
    }
  });

  // ------------------------------------------------------------------ 4) decisão: folha em connecting/setup
  it("4 (refeito pelo fluxo simples, 014140): em connecting e setup o candidato não recebe nada da estação; a folha vem no início", async () => {
    for (const phase of ["connecting", "setup"] as const) {
      const id = await sala(U.ana, U.bruno, phase, SECRETA.id);
      const c = await conteudo(U.ana, id);
      expect(c, phase).toMatchObject({ role: "candidate", station: null, pressing_count: 0, pressings: [], waiting: true });
      expect(vaza(c), phase).toEqual([]);
      expect(vaza(await estado(U.ana, id)), phase).toEqual([]);
    }
  });

  // ------------------------------------------------------------------ colar duas vezes e permissões
  it("a 013406 colada duas vezes (com as seguintes do Treino) dá o mesmo banco; apoio fechado; exportação com os direitos de quem chama", async () => {
    const defs = () =>
      d.sql<{ id: string; def: string; acl: string | null }>(
        `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`
      );
    const antes = await defs();
    // a 013560 refaz app_dupla_room_content e a junção 013980 junta as duas versões e recoloca o remendo do Termo 3.0 na
    // exportação: cola-se a 013406 e as seguintes do Treino, na ordem
    for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.includes("treino_dupla") && x >= MIGRACAO).sort()) {
      await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    }
    expect(await defs()).toEqual(antes);
    for (const fn of ["dupla_room_seen", "dupla_sweep", "dupla_room_need", "dupla_room_state"]) {
      const [p] = await d.sql(`select has_function_privilege('authenticated', oid, 'execute') as aut, has_function_privilege('anon', oid, 'execute') as anon, prosecdef, proconfig
                                 from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [fn]);
      expect(p, fn).toEqual({ aut: false, anon: false, prosecdef: true, proconfig: ['search_path=""'] });
    }
    const [c] = await d.sql(`select has_function_privilege('authenticated', oid, 'execute') as aut, has_function_privilege('anon', oid, 'execute') as anon, provolatile
                               from pg_proc where proname = 'app_dupla_room_content' and pronamespace = 'public'::regnamespace`);
    expect(c).toEqual({ aut: true, anon: false, provolatile: "v" });
    expect(await d.sql(`select prosecdef, provolatile from pg_proc where proname = 'app_export_my_data'`)).toEqual([{ prosecdef: false, provolatile: "s" }]);
    const [e] = await d.sql(`select prosecdef, proconfig from pg_proc where proname = 'export_station_attempts'`);
    expect(e).toEqual({ prosecdef: true, proconfig: ['search_path=""'] });
  });
});
