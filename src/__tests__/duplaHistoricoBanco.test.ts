// @vitest-environment node
/**
 * Treino em Dupla · decisão (c) do dono de 17/10, migração 013400: o histórico (Meus PEPs) mostra o resultado de cada rodada
 * concluída, inclusive depois de a sala fechar. Só as rodadas em que a pessoa foi candidata ou avaliadora; nome e nota só com o
 * resultado liberado; revisão pedida e não feita = "aguardando_revisao". Banco em memória (PGlite, migrações reais), dados de
 * TESTE com marcas fáceis de procurar no texto bruto.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addSession, addStation, makeRoom, MIGRATIONS_DIR, openDuplaDb, setDupla, setPlan, STATION, U, type DuplaDb } from "./helpers/duplaDb";

const MIGRACAO = "20261003013400_treino_dupla_decisoes_1710.sql";
const SECRETA = { ...STATION, id: "teste-inep2020-e08", name: "ZZNOME estação secreta", topic: "ZZTEMA reservado", area: "Pediatria" };
const OUTRA = { ...STATION, id: "teste-inep2020-e09", name: "YYNOME outra estação", topic: "YYTEMA reservado" };
const tem = (x: unknown, marca: string) => JSON.stringify(x).includes(marca);

describe("Migração 013400 (parte 1): histórico das rodadas em dupla com o resultado", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb();
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    for (const u of [U.ana, U.bruno, U.carla]) await setPlan(d.db, u, "pro", "active");
    await addStation(d.db, SECRETA);
    await addStation(d.db, OUTRA);
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });
  beforeEach(async () => {
    await d.sql(`delete from public.checklist_study_sessions`);
    await d.sql(`delete from public.checklist_rooms`);
  });

  const hist = (uid: string | null) => d.rpc<any[]>(uid, "app_dupla_history", {});
  const abrir = (uid: string | null, sala: string, round: number) => d.rpc<any>(uid, "app_dupla_history_result", { p_room_id: sala, p_round: round });

  it("sala ENCERRADA: o candidato não abre mais pela sala, mas vê e abre o resultado pelo histórico", async () => {
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "closed", candidate: U.ana, evaluator: U.bruno, station: SECRETA.id, extra: { closed_reason: "saiu" } });
    await addSession(d.db, { room: sala, round: 1, doctor: U.ana, actor: U.bruno, station: SECRETA.id, correctness: 75, feedback: { pos: "Boa anamnese." } });
    // a regra da sala (013360) continua: com a sala fechada, o candidato não abre pela sala
    await expect(d.rpc(U.ana, "app_dupla_result", { p_room_id: sala, p_round: 1 })).rejects.toThrow("Resultado ainda não liberado.");

    const [linha] = await hist(U.ana);
    expect(linha).toMatchObject({
      room_id: sala, round: 1, role: "candidate", status: "concluida", revised: false,
      partner: { public_name: expect.any(String) },
      station: { number: 8, area: "Pediatria", area_code: "PED", name: "ZZNOME estação secreta", edition: "2020" },
      pct: 75,
    });
    expect(Number(linha.score)).toBe(7.5);
    const res = await abrir(U.ana, sala, 1);
    expect(res).toMatchObject({ round: 1, viewer: "candidate", pct: 75, station: { name: "ZZNOME estação secreta" }, feedback: { pos: "Boa anamnese." } });
    // o avaliador também
    expect((await hist(U.bruno))[0]).toMatchObject({ role: "evaluator", status: "concluida" });
    expect((await abrir(U.bruno, sala, 1)).viewer).toBe("evaluator");
  });

  it("o mesmo conteúdo do resultado da sala (mesma função por dentro)", async () => {
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "result", candidate: U.ana, evaluator: U.bruno, station: SECRETA.id });
    await addSession(d.db, { room: sala, round: 1, doctor: U.ana, actor: U.bruno, station: SECRETA.id, correctness: 50 });
    expect(await abrir(U.ana, sala, 1)).toEqual(await d.rpc(U.ana, "app_dupla_result", { p_room_id: sala, p_round: 1 }));
  });

  it("só as próprias rodadas: quem não estava nelas não vê nem abre; visitante barrado", async () => {
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "closed", candidate: U.ana, evaluator: U.bruno, station: SECRETA.id });
    await addSession(d.db, { room: sala, round: 1, doctor: U.ana, actor: U.bruno, station: SECRETA.id, correctness: 80 });
    expect(await hist(U.carla)).toEqual([]);
    await expect(abrir(U.carla, sala, 1)).rejects.toThrow("Resultado ainda não liberado.");
    await expect(abrir(U.ana, sala, 2)).rejects.toThrow("Resultado ainda não liberado.");
    await expect(hist(null)).rejects.toThrow(/permission denied/);
    await expect(abrir(null, sala, 1)).rejects.toThrow(/permission denied/);
  });

  it("revisão da nota pedida e não feita: 'aguardando_revisao', sem nome, sem nota e sem abrir; depois de revisada volta", async () => {
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "review", candidate: U.ana, evaluator: U.bruno, station: SECRETA.id });
    const id = await addSession(d.db, { room: sala, round: 1, doctor: U.ana, actor: U.bruno, station: SECRETA.id, correctness: 40 });
    await d.sql(`update public.checklist_study_sessions set review_requested_at = now(), review_reason = 'Motivo de teste.' where id = $1`, [id]);
    for (const uid of [U.ana, U.bruno]) {
      const [linha] = await hist(uid);
      expect(linha).toMatchObject({ status: "aguardando_revisao", station: { number: 8, area: "Pediatria", name: null, edition: null }, score: null, max_score: null, pct: null });
      expect(tem(linha, "ZZNOME")).toBe(false);
      expect(tem(linha, "ZZTEMA")).toBe(false);
      await expect(abrir(uid, sala, 1)).rejects.toThrow("Aguardando revisão da nota.");
    }
    // a sala fecha sem a revisão: continua aguardando
    await d.sql(`update public.checklist_rooms set phase = 'closed', closed_reason = 'saiu' where id = $1`, [sala]);
    expect((await hist(U.ana))[0].status).toBe("aguardando_revisao");
    // revisada: liberada, com "revisada"
    await d.sql(`update public.checklist_study_sessions set revised_at = now(), score_before_review = 4 where id = $1`, [id]);
    expect((await hist(U.ana))[0]).toMatchObject({ status: "concluida", revised: true, station: { name: "ZZNOME estação secreta" } });
    expect((await abrir(U.ana, sala, 1)).review.revised_at).not.toBeNull();
  });

  it("rodada seguinte em andamento: o histórico tem só a rodada concluída; a estação da rodada nova não aparece", async () => {
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "running", candidate: U.bruno, evaluator: U.ana, station: OUTRA.id, round: 2 });
    await addSession(d.db, { room: sala, round: 1, doctor: U.ana, actor: U.bruno, station: SECRETA.id, correctness: 90, finishedAt: "2026-10-16T10:00:00Z" });
    for (const uid of [U.ana, U.bruno]) {
      const linhas = await hist(uid);
      expect(linhas.map((l) => l.round)).toEqual([1]);
      for (const marca of ["YYNOME", "YYTEMA", OUTRA.id]) expect(tem(linhas, marca)).toBe(false);
    }
    // ordem: mais nova primeiro, com várias salas
    const sala2 = await makeRoom(d.db, { members: [U.ana, U.carla], phase: "closed", candidate: U.carla, evaluator: U.ana, station: OUTRA.id });
    await addSession(d.db, { room: sala2, round: 1, doctor: U.carla, actor: U.ana, station: OUTRA.id, correctness: 60, finishedAt: "2026-10-17T10:00:00Z" });
    const linhas = await hist(U.ana);
    expect(linhas.map((l) => [l.room_id, l.role])).toEqual([[sala2, "evaluator"], [sala, "candidate"]]);
    expect((await hist(U.bruno)).map((l) => l.room_id)).toEqual([sala]);
  });

  it("colar a 013400 de novo dá o mesmo banco; funções com search_path vazio; as internas fechadas", async () => {
    const defs = () =>
      d.sql<{ id: string; def: string; acl: string | null }>(
        `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`
      );
    const antes = await defs();
    await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8"));
    expect(await defs()).toEqual(antes);
    const f = await d.sql(`select proname, prosecdef, proconfig from pg_proc where proname = any ($1) order by 1`, [
      ["app_dupla_history", "app_dupla_history_result", "dupla_history_released", "dupla_result_payload", "app_dupla_result"],
    ]);
    expect(f).toHaveLength(5);
    for (const x of f) expect(x, x.proname).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'] });
    await expect(d.asUser(U.ana, `select public.dupla_history_released(null::public.checklist_study_sessions)`)).rejects.toThrow(/permission denied for function/);
    await expect(d.asUser(U.ana, `select public.dupla_result_payload(null::public.checklist_study_sessions, $1::uuid)`, [U.ana])).rejects.toThrow(/permission denied for function/);
  });
});
