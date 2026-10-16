/**
 * Treino em Dupla · Tarefa 18 (plano de 12/10, "9920"): migração 013360 sobre o banco local (PGlite, migrações reais).
 * Pedido de revisão da nota, "Rever a nota", "Treinar outra estação" (013380: sem inverter papéis na mesma estação; o banco
 * recusa estação já treinada na sala), rodadas no histórico e o uso do mês no painel. O candidato só recebe o nome da estação
 * no resultado; na rodada seguinte, o novo candidato volta a não recebê-lo (conferido pelo TEXTO BRUTO das respostas).
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addSession, addStation, makeRoom, MIGRATIONS_DIR, openDuplaDb, setDupla, setPlan, STATION, U, type DuplaDb, type Phase } from "./helpers/duplaDb";

const MIGRACAO = "20261003013360_treino_dupla_resultado.sql";
const AJUSTES = "20261003013380_treino_dupla_ajustes_1610.sql";
const FASE = "Esta ação não vale nesta fase da sala.";
const MOTIVO = "Escreva o motivo (até 500 caracteres).";
const UMA_VEZ = "A revisão só vale depois do pedido, uma vez.";

// Estação de TESTE com marcas fáceis de procurar no texto bruto (nada disto é conteúdo real).
const SECRETA = {
  ...STATION,
  id: "teste-inep2020-e08",
  name: "ZZNOME estação secreta",
  topic: "ZZTEMA reservado",
  taxonomy_path: ["Clínica Médica", "ZZTAXO"],
  summary: [{ title: "ZZRESUMO", text: "Resumo do tema" }],
  duration_ms: 480000,
  pressings: [
    { id: "teste-inep2020-e08-p1", name: "Relato do caso", content: "Relato inicial.", image_url: null, source_number: 1, display_number: 1, initially_visible: true },
    { id: "teste-inep2020-e08-p2", name: "Exame A", content: "Resultado A.", image_url: null, source_number: 2, display_number: 1, initially_visible: false },
    { id: "teste-inep2020-e08-p3", name: "Exame B", content: "Resultado B.", image_url: null, source_number: 3, display_number: 2, initially_visible: false },
  ],
};
const MARCAS = ["ZZNOME", "ZZTEMA", "ZZTAXO", "ZZRESUMO", "teste-inep2020-e08"];
const vaza = (x: unknown) => MARCAS.filter((m) => JSON.stringify(x).includes(m));
// Outra estação de TESTE (rodada seguinte: a 013380 recusa repetir a estação na mesma sala). Mesmos impressos e itens.
const OUTRA = { ...SECRETA, id: "teste-inep2020-e09", name: "YYNOME outra estação", topic: "YYTEMA reservado", taxonomy_path: ["Clínica Médica", "YYTAXO"], duration_ms: 420000 };
const vazaOutra = (x: unknown) => ["YYNOME", "YYTEMA", "YYTAXO", "teste-inep2020-e09"].filter((m) => JSON.stringify(x).includes(m));

describe("Migração 013360 (+013380): resultado, revisão da nota, treinar outra estação e uso do mês", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb();
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    for (const u of [U.ana, U.bruno, U.carla]) await setPlan(d.db, u, "pro", "active");
    await addStation(d.db, STATION);
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

  const act = (uid: string | null, fn: string, room: string, args: Record<string, unknown> = {}) =>
    d.rpc<any>(uid, `app_dupla_${fn}`, { p_room_id: room, ...args });
  const linha = async (id: string) => (await d.sql<any>(`select * from public.checklist_rooms where id = $1`, [id]))[0];
  const sessao = async (id: string, round: number) =>
    (await d.sql<any>(
      `select *, score::float8 as score_n, score_before_review::float8 as antes_n, correctness::float8 as pct
         from public.checklist_study_sessions where room_id = $1 and round = $2`, [id, round]))[0];

  /** Uma rodada inteira pelas funções, da fase dos papéis (já definidos) ao resultado. Marca i1 e i2 com os níveis dados. */
  const rodada = async (id: string, cand: string, aval: string, i1: string | null, i2: string | null, ler?: (fase: string) => Promise<void>) => {
    await act(cand, "confirm_roles", id);
    await act(aval, "confirm_roles", id);
    await ler?.("connecting");
    await act(cand, "connected", id);
    await act(aval, "connected", id);
    await ler?.("setup");
    await act(cand, "ready", id, { p_ready: true });
    await act(aval, "ready", id, { p_ready: true });
    await act(aval, "start", id);
    await act(aval, "release", id, { p_pressing_id: "teste-inep2020-e08-p2", p_released: true });
    await ler?.("running");
    await act(aval, "mark", id, { p_item_id: "i1", p_grade: i1 });
    await act(aval, "mark", id, { p_item_id: "i2", p_grade: i2 });
    await act(aval, "finish", id);
    await ler?.("review");
    return act(aval, "finalize", id, { p_feedback: { gen: "Feedback de teste." } });
  };
  /** Sala na fase dos papéis com a estação SECRETA escolhida pelo avaliador (bruno) e ana candidata. */
  const salaPronta = async () => {
    const id = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", candidate: U.ana, evaluator: U.bruno, station: null });
    await act(U.bruno, "set_station", id, { p_station_id: SECRETA.id });
    return id;
  };

  // ------------------------------------------------------------------ pedido de revisão
  it("pedido de revisão: só o candidato, uma vez, com motivo, no resultado da rodada", async () => {
    const id = await salaPronta();
    await rodada(id, U.ana, U.bruno, "partial", "correct");
    const rev = (await linha(id)).rev;
    await expect(act(U.bruno, "request_review", id, { p_round: 1, p_reason: "Motivo." })).rejects.toThrow("Só o candidato pode pedir a revisão.");
    await expect(act(U.ana, "request_review", id, { p_round: 2, p_reason: "Motivo." })).rejects.toThrow(FASE);
    await expect(act(U.ana, "request_review", id, { p_round: 1, p_reason: "   " })).rejects.toThrow(MOTIVO);
    await expect(act(U.ana, "request_review", id, { p_round: 1, p_reason: null })).rejects.toThrow(MOTIVO);
    await expect(act(U.ana, "request_review", id, { p_round: 1, p_reason: "x".repeat(501) })).rejects.toThrow(MOTIVO);
    await expect(act(U.carla, "request_review", id, { p_round: 1, p_reason: "Motivo." })).rejects.toThrow("Sala não encontrada.");
    const s = await act(U.ana, "request_review", id, { p_round: 1, p_reason: `  ${"y".repeat(500)}  ` });
    expect(s.rev).toBe(rev + 1);
    expect(s.phase).toBe("result");
    const sess = await sessao(id, 1);
    expect(sess.review_reason).toBe("y".repeat(500));
    expect(sess.review_requested_at).not.toBeNull();
    await expect(act(U.ana, "request_review", id, { p_round: 1, p_reason: "De novo." })).rejects.toThrow("Revisão já solicitada.");
    // o resultado mostra o pedido aos dois
    expect((await d.rpc(U.bruno, "app_dupla_result", { p_room_id: id, p_round: 1 })).review).toMatchObject({ reason: "y".repeat(500), revised_at: null });
    // fora do resultado (sala em outra fase): recusa
    const outra = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "review", candidate: U.ana, evaluator: U.bruno, station: SECRETA.id });
    await addSession(d.db, { room: outra, round: 1, doctor: U.ana, actor: U.bruno, station: SECRETA.id, correctness: 50 });
    await expect(act(U.ana, "request_review", outra, { p_round: 1, p_reason: "Motivo." })).rejects.toThrow(FASE);
  });

  // ------------------------------------------------------------------ rever a nota
  it("Rever a nota: só o avaliador, só depois do pedido, uma vez; finalizar de novo guarda a nota anterior e marca revisada", async () => {
    const id = await salaPronta();
    await rodada(id, U.ana, U.bruno, "partial", "correct");
    await expect(act(U.bruno, "redo_review", id, { p_round: 1 })).rejects.toThrow(UMA_VEZ);
    await act(U.ana, "request_review", id, { p_round: 1, p_reason: "O item 3 foi feito." });
    await expect(act(U.ana, "redo_review", id, { p_round: 1 })).rejects.toThrow("Só o avaliador pode fazer isso.");
    await expect(act(U.bruno, "redo_review", id, { p_round: 2 })).rejects.toThrow(FASE);
    const s = await act(U.bruno, "redo_review", id, { p_round: 1 });
    expect(s.phase).toBe("review");
    // na conferência de novo, o candidato não lê o resultado (que traz o nome da estação); o avaliador lê
    await expect(d.rpc(U.ana, "app_dupla_result", { p_room_id: id, p_round: 1 })).rejects.toThrow("Resultado ainda não liberado.");
    expect((await d.rpc(U.bruno, "app_dupla_result", { p_room_id: id, p_round: 1 })).viewer).toBe("evaluator");
    // as marcações da rodada continuam; o avaliador corrige e finaliza de novo
    expect((await d.rpc(U.bruno, "app_dupla_marks", { p_room_id: id })).map((m: any) => [m.item_id, m.grade])).toEqual([["i1", "partial"], ["i2", "correct"]]);
    await act(U.bruno, "mark", id, { p_item_id: "i3", p_grade: "correct" });
    const fim = await act(U.bruno, "finalize", id, { p_feedback: { gen: "Revisado." } });
    expect(fim.phase).toBe("result");
    expect(await d.sql(`select count(*)::int as n from public.checklist_study_sessions where room_id = $1`, [id])).toEqual([{ n: 1 }]);
    const sess = await sessao(id, 1);
    expect(sess).toMatchObject({ score_n: 8.75, antes_n: 3.75, pct: 87.5, feedback_gen: "Revisado." });
    expect(sess.revised_at).not.toBeNull();
    const res = await d.rpc(U.ana, "app_dupla_result", { p_room_id: id, p_round: 1 });
    expect(res.review.revised_at).not.toBeNull();
    expect(Number(res.review.score_before_review)).toBe(3.75);
    // uma vez só
    await expect(act(U.bruno, "redo_review", id, { p_round: 1 })).rejects.toThrow(UMA_VEZ);
  });

  it("tempo esgotado não fecha a sala: com os dois dando sinal ela segue em andamento e vai à conferência pelo avaliador", async () => {
    const id = await salaPronta();
    for (const u of [U.ana, U.bruno]) await d.sql(`insert into public.study_profiles (user_id, public_name, last_seen_at) values ($1, 'Pessoa de teste', now()) on conflict (user_id) do update set last_seen_at = now()`, [u]);
    await act(U.ana, "confirm_roles", id);
    await act(U.bruno, "confirm_roles", id);
    await act(U.ana, "connected", id);
    await act(U.bruno, "connected", id);
    await act(U.ana, "ready", id, { p_ready: true });
    await act(U.bruno, "ready", id, { p_ready: true });
    await act(U.bruno, "start", id);
    // o cronômetro zerou há 5 minutos e a sala não mudou há 5 minutos
    await d.sql(`update public.checklist_rooms set ends_at = now() - interval '5 minutes', updated_at = now() - interval '5 minutes' where id = $1`, [id]);
    expect((await d.rpc(U.ana, "app_dupla_room", { p_room_id: id })).phase).toBe("running");
    expect((await act(U.bruno, "finish", id)).phase).toBe("review");
  });

  // ------------------------------------------------------------------ treinar outra estação (013380: sem inverter papéis)
  it("inverter papéis saiu (013380): app_dupla_swap não existe mais", async () => {
    expect(await d.sql(`select proname from pg_proc where proname = 'app_dupla_swap'`)).toEqual([]);
  });

  it("treinar outra estação: rodada 2 sem papéis e sem estação, tudo zerado (menos o link); dois cliques não pulam duas rodadas", async () => {
    const id = await salaPronta();
    await expect(act(U.ana, "next_station", id)).rejects.toThrow(FASE);
    await rodada(id, U.ana, U.bruno, "partial", "correct");
    await d.sql(`update public.checklist_rooms set call_link = 'https://meet.example.com/abc', duration_ms = 120000 where id = $1`, [id]);
    const s = await act(U.ana, "next_station", id);
    expect(s).toMatchObject({
      phase: "roles", round: 2, station: null, duration_ms: null, started_at: null, ends_at: null, paused_left_ms: null, paused_at: null,
      finished_at: null, released_pressings: [], call_link: "https://meet.example.com/abc",
      me: { role: null, confirmed: false, connected: false, ready: false, picked_station: false },
      partner: { role: null, confirmed: false, connected: false, ready: false },
    });
    const r = await linha(id);
    expect(r).toMatchObject({ station_id: null, station_chosen_by: null, candidate_id: null, evaluator_id: null, paused_total_ms: 0, connected_ids: [], ready_ids: [], confirmed_ids: [] });
    // segundo clique (outra aba): não pula para a rodada 3
    await expect(act(U.bruno, "next_station", id)).rejects.toThrow(FASE);
    expect((await linha(id)).round).toBe(2);
    // a rodada 2 não vê as marcações da rodada 1
    await act(U.ana, "set_roles", id, { p_candidate_id: U.bruno });
    expect(await d.rpc(U.ana, "app_dupla_marks", { p_room_id: id })).toEqual([]);
  });

  it("rodada seguinte: o banco recusa a estação já treinada nesta sala (qualquer rodada anterior), na escolha e na confirmação", async () => {
    const JA = "Vocês já treinaram esta estação nesta sala. Escolham outra.";
    const id = await salaPronta();
    await rodada(id, U.ana, U.bruno, "partial", "correct");
    await act(U.bruno, "next_station", id);
    // papéis trocados de propósito: quem era candidata agora avalia
    await act(U.bruno, "set_roles", id, { p_candidate_id: U.bruno });
    await expect(act(U.ana, "set_station", id, { p_station_id: SECRETA.id })).rejects.toThrow(JA);
    expect(await d.rpc(U.ana, "app_dupla_room_done_stations", { p_room_id: id })).toEqual([SECRETA.id]);
    expect(await d.rpc(U.bruno, "app_dupla_room_done_stations", { p_room_id: id })).toEqual([SECRETA.id]);
    await expect(d.rpc(U.carla, "app_dupla_room_done_stations", { p_room_id: id })).rejects.toThrow("Sala não encontrada.");
    // a mesma estação posta por fora (comando direto) também é recusada ao confirmar
    await d.sql(`update public.checklist_rooms set station_id = $2 where id = $1`, [id, SECRETA.id]);
    await expect(act(U.ana, "confirm_roles", id)).rejects.toThrow(JA);
    await d.sql(`update public.checklist_rooms set station_id = null where id = $1`, [id]);
    // outra estação: vale; quem escolheu e é avaliadora não recebe o aviso de candidato
    const s = await act(U.ana, "set_station", id, { p_station_id: OUTRA.id });
    expect(s).toMatchObject({ round: 2, station: { id: OUTRA.id }, duration_ms: OUTRA.duration_ms });
    await rodada(id, U.bruno, U.ana, "correct", "correct");
    // rodada 3: as duas estações anteriores ficam de fora
    await act(U.ana, "next_station", id);
    await act(U.ana, "set_roles", id, { p_candidate_id: U.ana });
    await expect(act(U.bruno, "set_station", id, { p_station_id: SECRETA.id })).rejects.toThrow(JA);
    await expect(act(U.bruno, "set_station", id, { p_station_id: OUTRA.id })).rejects.toThrow(JA);
    expect((await d.rpc<string[]>(U.ana, "app_dupla_room_done_stations", { p_room_id: id })).sort()).toEqual([OUTRA.id, SECRETA.id].sort());
    expect((await act(U.bruno, "set_station", id, { p_station_id: STATION.id })).station.id).toBe(STATION.id);
  });

  // ------------------------------------------------------------------ duas rodadas
  it("rodadas em salas diferentes: última nota e média da estação contam todas (previous_pct e my_last_pct)", async () => {
    const id = await salaPronta();
    await rodada(id, U.ana, U.bruno, "partial", "correct"); // ana: 37,5%
    await act(U.bruno, "next_station", id);
    await act(U.bruno, "set_roles", id, { p_candidate_id: U.bruno });
    await act(U.ana, "set_station", id, { p_station_id: OUTRA.id });
    await rodada(id, U.bruno, U.ana, "correct", "correct"); // bruno: 50% na OUTRA
    expect((await d.rpc(U.bruno, "app_dupla_result", { p_room_id: id, p_round: 2 })).previous_pct).toBeNull();
    // outra sala: ana volta à SECRETA
    await d.sql(`update public.checklist_rooms set phase = 'closed', closed_reason = 'saiu' where id = $1`, [id]);
    const id2 = await salaPronta();
    await rodada(id2, U.ana, U.bruno, "correct", "incorrect"); // ana: 25%
    const r = await d.rpc(U.ana, "app_dupla_result", { p_room_id: id2, p_round: 1 });
    expect(r).toMatchObject({ round: 1, viewer: "candidate", pct: 25, previous_pct: 38 });
    const porId = async (uid: string) => Object.fromEntries((await d.rpc<any[]>(uid, "app_dupla_stations")).map((s) => [s.id, s]));
    expect((await porId(U.ana))[SECRETA.id]).toMatchObject({ my_last_pct: 25, evaluations: 2 });
    expect((await porId(U.bruno))[OUTRA.id]).toMatchObject({ my_last_pct: 50 });
  });

  // ------------------------------------------------------------------ tema reservado
  it("o candidato só recebe o nome da estação no resultado; na rodada seguinte, o novo candidato volta a não recebê-lo (texto bruto)", async () => {
    const id = await salaPronta();
    const deAna: unknown[] = [];
    const deBruno: unknown[] = [];
    const lerComo = (uid: string, lista: unknown[]) => async () => {
      lista.push(await d.rpc(uid, "app_dupla_room", { p_room_id: id }));
      lista.push(await d.rpc(uid, "app_dupla_room_content", { p_room_id: id }));
    };
    const ana = lerComo(U.ana, deAna);
    await ana();
    await rodada(id, U.ana, U.bruno, "partial", "correct", ana);
    expect(deAna.length).toBeGreaterThan(8);
    expect(vaza(deAna)).toEqual([]);
    // no resultado a candidata recebe o nome
    expect((await d.rpc(U.ana, "app_dupla_room", { p_room_id: id })).station.name).toBe(SECRETA.name);
    expect((await d.rpc(U.ana, "app_dupla_result", { p_room_id: id, p_round: 1 })).station.name).toBe(SECRETA.name);
    // rodada 2: bruno vira candidato numa estação nova e não recebe o nome dela em nenhuma fase até o resultado
    await act(U.ana, "next_station", id);
    await act(U.ana, "set_roles", id, { p_candidate_id: U.bruno });
    await act(U.ana, "set_station", id, { p_station_id: OUTRA.id });
    const bruno = lerComo(U.bruno, deBruno);
    await bruno();
    deBruno.push(await act(U.bruno, "confirm_roles", id));
    await rodada(id, U.bruno, U.ana, "correct", null, async (fase) => {
      await bruno();
      if (fase === "running") await expect(d.rpc(U.bruno, "app_dupla_result", { p_room_id: id, p_round: 2 })).rejects.toThrow("Resultado ainda não liberado.");
    });
    expect(deBruno.length).toBeGreaterThan(8);
    expect(vazaOutra(deBruno)).toEqual([]);
    expect(vaza(deBruno)).toEqual([]);
    expect((await d.rpc(U.bruno, "app_dupla_result", { p_room_id: id, p_round: 2 })).station.name).toBe(OUTRA.name);
  });

  // ------------------------------------------------------------------ uso do mês
  it("uso do mês: salas, rodadas avaliadas, alunos e impressos por rodada no mês de Brasília; só administrador; mês inválido", async () => {
    const sala = (criada: string, membros: [string, string] = [U.ana, U.bruno]) =>
      makeRoom(d.db, { members: membros, phase: "closed", extra: { created_at: criada } });
    // agosto de 2026 em Brasília: 01/08 03:00Z até 01/09 02:59:59Z
    const a1 = await sala("2026-08-01T03:00:00Z");
    const a2 = await sala("2026-08-31T23:30:00-03:00", [U.carla, U.diego]); // 01/09 02:30Z, ainda agosto em Brasília
    await sala("2026-08-01T02:59:00Z"); // 31/07 23:59 em Brasília: julho
    await sala("2026-09-01T03:00:00Z"); // setembro
    const s1 = await addSession(d.db, { room: a1, round: 1, doctor: U.ana, actor: U.bruno, station: STATION.id, correctness: 50, finishedAt: "2026-08-10T12:00:00Z" });
    const s2 = await addSession(d.db, { room: a1, round: 2, doctor: U.bruno, actor: U.ana, station: STATION.id, correctness: 60, finishedAt: "2026-08-31T23:00:00-03:00" });
    const s3 = await addSession(d.db, { room: a2, round: 1, doctor: U.carla, actor: null, station: STATION.id, correctness: 70, finishedAt: "2026-08-20T12:00:00Z" });
    await addSession(d.db, { room: a2, round: 2, doctor: U.diego, actor: U.carla, station: STATION.id, correctness: 70, finishedAt: "2026-09-01T03:00:00Z" });
    await d.sql(`update public.checklist_study_sessions set pressings_released = $2::jsonb where id = $1`, [s1, JSON.stringify(["p1", "p2"])]);
    await d.sql(`update public.checklist_study_sessions set pressings_released = $2::jsonb where id = $1`, [s2, JSON.stringify(["p1"])]);
    await d.sql(`update public.checklist_study_sessions set pressings_released = '[]'::jsonb where id = $1`, [s3]);
    expect(await d.rpc(U.admin, "app_admin_dupla_usage", { p_month: "2026-08" })).toEqual({
      month: "2026-08", salas: 2, rodadas_avaliadas: 3, alunos: 3, impressos_por_rodada: 1,
    });
    expect(await d.rpc(U.admin, "app_admin_dupla_usage", { p_month: "2026-07" })).toEqual({
      month: "2026-07", salas: 1, rodadas_avaliadas: 0, alunos: 0, impressos_por_rodada: null,
    });
    expect(await d.rpc(U.admin, "app_admin_dupla_usage", { p_month: "2026-09" })).toMatchObject({ salas: 1, rodadas_avaliadas: 1, alunos: 2, impressos_por_rodada: 0 });
    // padrão: o mês atual em Brasília
    const atual = (await d.sql<{ m: string }>(`select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM') as m`))[0].m;
    expect((await d.rpc(U.admin, "app_admin_dupla_usage")).month).toBe(atual);
    for (const m of ["2026-13", "2026-8", "agosto", "2026-08-01", ""]) {
      await expect(d.rpc(U.admin, "app_admin_dupla_usage", { p_month: m }), m).rejects.toThrow("Mês inválido.");
    }
    await expect(d.rpc(U.ana, "app_admin_dupla_usage", { p_month: "2026-08" })).rejects.toThrow("Acesso restrito a administradores.");
    await expect(d.rpc(null, "app_admin_dupla_usage", { p_month: "2026-08" })).rejects.toThrow(/permission denied/);
  });

  // ------------------------------------------------------------------ acesso
  it("quem não é membro ou está sem acesso não age; visitante não executa", async () => {
    const id = await salaPronta();
    for (const [fn, args] of [["request_review", { p_round: 1, p_reason: "M." }], ["redo_review", { p_round: 1 }], ["next_station", {}]] as const) {
      await expect(act(U.carla, fn, id, args), fn).rejects.toThrow("Sala não encontrada.");
      await expect(act(U.diego, fn, id, args), fn).rejects.toThrow("Sem acesso ao Treinamento em Dupla.");
      await expect(act(null, fn, id, args), fn).rejects.toThrow(/permission denied/);
    }
  });

  // ------------------------------------------------------------------ colar de novo e permissões
  it("colar a 013360 e a 013380 de novo dá o mesmo banco; permissões iguais às das outras", async () => {
    const defs = () =>
      d.sql<{ id: string; def: string; acl: string | null }>(
        `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`
      );
    const antes = await defs();
    // a 013380 apaga o app_dupla_swap que a 013360 cria: as duas, na ordem, voltam ao mesmo banco
    await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8"));
    await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, AJUSTES), "utf8"));
    expect(await defs()).toEqual(antes);
    const acl = Object.fromEntries(antes.map((f) => [f.id, f.acl]));
    for (const f of ["app_dupla_request_review(uuid,integer,text)", "app_dupla_redo_review(uuid,integer)", "app_dupla_next_station(uuid)", "app_dupla_room_done_stations(uuid)"]) {
      expect(acl[f], f).toBe(acl["app_dupla_room(uuid,integer)"]);
    }
    expect(acl["app_admin_dupla_usage(text)"]).toBe(acl["app_admin_save_dupla(boolean,text[])"]);
    const f = await d.sql(`select proname, provolatile, prosecdef, proconfig from pg_proc where proname = any ($1) order by 1`, [
      ["app_dupla_request_review", "app_dupla_redo_review", "app_dupla_next_station", "app_dupla_room_done_stations", "app_admin_dupla_usage"],
    ]);
    expect(f).toHaveLength(5);
    for (const x of f) expect(x, x.proname).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'] });
  });
});
