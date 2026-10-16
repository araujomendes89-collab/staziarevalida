/**
 * Treino em Dupla · Tarefa 14 (plano de 12/10, "9910"): migração 013350 sobre o banco local (PGlite, migrações reais).
 * Ações da sala (papéis, estação, conexão, prontidão, cronômetro, impressos, marcações, finalizar), caminho da imagem do
 * impresso, "me.picked_station", números de tela contínuos e o aviso de tempo real (só o rev, por broadcast em room:<id>).
 * O candidato nunca recebe o tema: conferido pelo TEXTO BRUTO (JSON.stringify) das respostas.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addStation, makeRoom, MIGRATIONS_DIR, openDuplaDb, setDupla, setPlan, STATION, stationAssets, U, type DuplaDb, type Phase,
} from "./helpers/duplaDb";

const MIGRACAO = "20261003013350_treino_dupla_sala.sql";
const FASE = "Esta ação não vale nesta fase da sala.";
const SO_AVALIADOR = "Só o avaliador pode fazer isso.";
const SEM_SALA = "Sala não encontrada.";
const SEM_ACESSO = "Sem acesso ao Treinamento em Dupla.";

// Ids de arquivo (station_assets) de teste.
const A1 = "a0000000-0000-4000-8000-0000000000a1";
const A3 = "a0000000-0000-4000-8000-0000000000a3";
const AF = "a0000000-0000-4000-8000-0000000000af";

// Estação de TESTE com marcas fáceis de procurar no texto bruto (nada disto é conteúdo real). Impressos: 1 inicial e 2
// liberáveis com display_number com buraco (1 e 3) → números de tela 1 e 2.
const SECRETA = {
  ...STATION,
  id: "teste-inep2020-e07",
  name: "ZZNOME estação secreta",
  topic: "ZZTEMA reservado",
  taxonomy_path: ["Clínica Médica", "ZZTAXO"],
  summary: [{ title: "ZZRESUMO", text: "Resumo do tema" }],
  pressings: [
    { id: "teste-inep2020-e07-p1", name: "Relato do caso", content: "Relato inicial de teste.", image_url: null, source_number: 1, display_number: 1, initially_visible: true },
    { id: "teste-inep2020-e07-p2", name: "Exame A", content: "Resultado A.\nLiberação: quando pedir o exame A.", image_url: null, source_number: 2, display_number: 1, initially_visible: false },
    { id: "teste-inep2020-e07-p3", name: "Exame B", content: "Resultado B.", image_url: null, source_number: 5, display_number: 3, initially_visible: false },
  ],
  pressing_assets: { p1: A1, "teste-inep2020-e07-p3": { asset_id: A3 }, candidate_sheet: { asset_id: AF } },
};
const MARCAS = ["ZZNOME", "ZZTEMA", "ZZTAXO", "ZZRESUMO", "teste-inep2020-e07"];
const vaza = (x: unknown) => MARCAS.filter((m) => JSON.stringify(x).includes(m));

describe("Migração 013350: ações da sala do Treino em Dupla", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb({ realtime: true });
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    for (const u of [U.ana, U.bruno, U.carla]) await setPlan(d.db, u, "pro", "active");
    await addStation(d.db, STATION);
    await addStation(d.db, SECRETA);
    await addStation(d.db, { ...STATION, id: "teste-dupla-pro", name: "Estação Pro de teste", duration_ms: 480000 }, { is_pro_only: true });
    await addStation(d.db, { ...STATION, id: "teste-dupla-pendente", name: "Estação pendente de teste" }, { medical_review: "pending" });
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });
  beforeEach(async () => {
    await d.sql(`delete from public.checklist_study_sessions`);
    await d.sql(`delete from public.checklist_rooms`);
    await d.sql(`delete from public.study_swipes`);
    await setPlan(d.db, U.ana, "pro", "active");
    await setPlan(d.db, U.bruno, "pro", "active");
  });

  // ana = candidata, bruno = avaliador (quando os papéis estão definidos).
  const sala = (phase: Phase, o: { papeis?: boolean; station?: string | null; extra?: Record<string, unknown> } = {}) =>
    makeRoom(d.db, {
      members: [U.ana, U.bruno], phase, station: o.station === undefined ? STATION.id : o.station,
      ...(o.papeis === false ? {} : { candidate: U.ana, evaluator: U.bruno }),
      extra: o.extra,
    });
  const act = (uid: string | null, fn: string, room: string, args: Record<string, unknown> = {}) =>
    d.rpc<any>(uid, `app_dupla_${fn}`, { p_room_id: room, ...args });
  const linha = async (id: string) =>
    (await d.sql<any>(
      `select *, paused_total_ms::int as pausas, (extract(epoch from ends_at - started_at) * 1000)::bigint::int as ends_menos_inicio
         from public.checklist_rooms where id = $1`, [id]))[0];
  const marks = (id: string) => d.sql<any>(`select item_id, grade, subitems_checked, evaluator_id from public.checklist_room_marks where room_id = $1 order by item_id`, [id]);
  const sessoes = (id: string) =>
    d.sql<any>(
      `select *, score::float8 as score_n, max_score::float8 as max_n, correctness::float8 as pct,
              score_before_review::float8 as antes_n,
              ((extract(epoch from finished_at - started_at) * 1000)::bigint - 0)::int as bruto
         from public.checklist_study_sessions where room_id = $1 order by round`, [id]);

  // ------------------------------------------------------------------ papéis
  it("papéis: qualquer membro escolhe ou sorteia; mudar zera confirmações; confirmar exige estação e papéis; os dois → connecting", async () => {
    const id = await sala("roles", { papeis: false, station: null });
    await expect(act(U.ana, "confirm_roles", id)).rejects.toThrow("Escolha a estação antes de confirmar.");
    let s = await act(U.ana, "set_roles", id, { p_candidate_id: U.bruno });
    expect(s.me.role).toBe("evaluator");
    expect(s.partner.role).toBe("candidate");
    expect(s.rev).toBe(1);
    await expect(act(U.ana, "set_roles", id, { p_candidate_id: U.carla })).rejects.toThrow("Escolha inválida.");
    s = await act(U.bruno, "set_roles", id, { p_candidate_id: U.ana });
    expect(s.me.role).toBe("evaluator");
    // sorteio: alguém candidato, o outro avaliador
    const sorteio = await act(U.ana, "draw_roles", id);
    const r = await linha(id);
    expect([U.ana, U.bruno]).toContain(r.candidate_id);
    expect(r.evaluator_id).toBe(r.candidate_id === U.ana ? U.bruno : U.ana);
    expect(sorteio.rev).toBe(r.rev);
    // volta ao combinado e escolhe a estação (avaliador = bruno)
    await act(U.ana, "set_roles", id, { p_candidate_id: U.ana });
    await act(U.bruno, "set_station", id, { p_station_id: STATION.id });
    s = await act(U.ana, "confirm_roles", id);
    expect(s.me.confirmed).toBe(true);
    expect(s.phase).toBe("roles");
    // mudar os papéis zera as confirmações, mas não a estação
    s = await act(U.bruno, "set_roles", id, { p_candidate_id: U.ana });
    expect(s.me.confirmed).toBe(false);
    expect(s.partner.confirmed).toBe(false);
    expect((await linha(id)).station_id).toBe(STATION.id);
    await act(U.ana, "confirm_roles", id);
    s = await act(U.bruno, "confirm_roles", id);
    expect(s.phase).toBe("connecting");
    await expect(act(U.ana, "set_roles", id, { p_candidate_id: U.ana })).rejects.toThrow(FASE);
    await expect(act(U.ana, "draw_roles", id)).rejects.toThrow(FASE);
    // sem papéis (com estação gravada): confirmar recusa
    const semPapeis = await sala("roles", { papeis: false });
    await expect(act(U.ana, "confirm_roles", semPapeis)).rejects.toThrow("Definam os papéis antes de confirmar.");
  });

  // ------------------------------------------------------------------ estação
  it("estação: só o avaliador escolhe, só depois dos papéis; aprovada; Pro-only com os dois Pro; trocar zera confirmações e repõe a duração", async () => {
    const id = await sala("roles", { papeis: false, station: null });
    await expect(act(U.bruno, "set_station", id, { p_station_id: STATION.id })).rejects.toThrow("Definam os papéis antes de escolher a estação.");
    await act(U.ana, "set_roles", id, { p_candidate_id: U.ana });
    await expect(act(U.ana, "set_station", id, { p_station_id: STATION.id })).rejects.toThrow("Só o avaliador escolhe a estação.");
    await expect(act(U.bruno, "set_station", id, { p_station_id: "teste-dupla-pendente" })).rejects.toThrow("Estação não encontrada.");
    await expect(act(U.bruno, "set_station", id, { p_station_id: "nao-existe" })).rejects.toThrow("Estação não encontrada.");
    let s = await act(U.bruno, "set_station", id, { p_station_id: "teste-dupla-pro" });
    expect(s.duration_ms).toBe(480000);
    expect((await linha(id)).station_chosen_by).toBe(U.bruno);
    // trocar zera as confirmações e repõe a duração da estação nova
    await act(U.ana, "confirm_roles", id);
    s = await act(U.bruno, "set_station", id, { p_station_id: STATION.id });
    expect(s.duration_ms).toBe(600000);
    expect(s.partner.confirmed).toBe(false);
    // Pro-only: um dos dois sem plano pago → recusa
    await setPlan(d.db, U.ana, "trial", "trialing", new Date(Date.now() + 86_400_000).toISOString());
    await setDupla(d.db, { aberto: true, planos: ["trial", "pro", "elite"] });
    await expect(act(U.bruno, "set_station", id, { p_station_id: "teste-dupla-pro" })).rejects.toThrow("Estação exclusiva dos planos Pro e Elite.");
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    // fora da fase dos papéis
    const outra = await sala("setup");
    await expect(act(U.bruno, "set_station", outra, { p_station_id: STATION.id })).rejects.toThrow(FASE);
  });

  it("não existe app_dupla_set_link", async () => {
    expect(await d.sql(`select proname from pg_proc where proname = 'app_dupla_set_link'`)).toEqual([]);
  });

  // ------------------------------------------------------------------ conexão e prontidão
  it("conexão e prontidão: os dois conectados → setup; prontos", async () => {
    const id = await sala("connecting");
    await expect(act(U.ana, "ready", id, { p_ready: true })).rejects.toThrow(FASE);
    let s = await act(U.ana, "connected", id);
    expect(s.me.connected).toBe(true);
    expect(s.phase).toBe("connecting");
    s = await act(U.bruno, "connected", id);
    expect(s.phase).toBe("setup");
    s = await act(U.ana, "ready", id, { p_ready: true });
    expect(s.me.ready).toBe(true);
    s = await act(U.ana, "ready", id, { p_ready: false });
    expect(s.me.ready).toBe(false);
    s = await act(U.bruno, "ready", id, { p_ready: true });
    expect(s.me.ready).toBe(true);
    expect(s.partner.ready).toBe(false);
    await expect(act(U.ana, "connected", id)).rejects.toThrow(FASE);
  });

  // ------------------------------------------------------------------ cronômetro
  it("cronômetro: só o avaliador; set_duration nos limites; iniciar exige os dois prontos e grava ends_at = started_at + duração; iniciar duas vezes não duplica", async () => {
    const id = await sala("setup", { extra: { duration_ms: 600000 } });
    await expect(act(U.ana, "set_duration", id, { p_duration_ms: 300000 })).rejects.toThrow(SO_AVALIADOR);
    await expect(act(U.bruno, "set_duration", id, { p_duration_ms: 59999 })).rejects.toThrow("Duração fora do permitido.");
    await expect(act(U.bruno, "set_duration", id, { p_duration_ms: 600001 })).rejects.toThrow("Duração fora do permitido.");
    expect((await act(U.bruno, "set_duration", id, { p_duration_ms: 60000 })).duration_ms).toBe(60000);
    expect((await act(U.bruno, "set_duration", id, { p_duration_ms: 480000 })).duration_ms).toBe(480000);
    await expect(act(U.bruno, "start", id)).rejects.toThrow("Os dois precisam estar prontos.");
    await act(U.ana, "ready", id, { p_ready: true });
    await expect(act(U.bruno, "start", id)).rejects.toThrow("Os dois precisam estar prontos.");
    await act(U.bruno, "ready", id, { p_ready: true });
    await expect(act(U.ana, "start", id)).rejects.toThrow(SO_AVALIADOR);
    await d.sql(`update public.checklist_rooms set released_pressings = '{p1}', paused_total_ms = 5 where id = $1`, [id]);
    const s = await act(U.bruno, "start", id);
    expect(s.phase).toBe("running");
    const r = await linha(id);
    expect(r.ends_menos_inicio).toBe(480000);
    expect(r.pausas).toBe(0);
    expect(r.released_pressings).toEqual([]);
    expect(r.finished_at).toBeNull();
    await expect(act(U.bruno, "start", id)).rejects.toThrow(FASE);
    expect((await linha(id)).rev).toBe(r.rev);
    expect((await linha(id)).started_at).toEqual(r.started_at);
    await expect(act(U.bruno, "set_duration", id, { p_duration_ms: 300000 })).rejects.toThrow(FASE);
  });

  it("pausar, retomar e ±1 min com piso de 30 s, também pausado; ajuste ≠ ±60000 recusado", async () => {
    const id = await sala("running", { extra: { started_at: new Date().toISOString(), ends_at: new Date(Date.now() + 300_000).toISOString(), duration_ms: 600000 } });
    await expect(act(U.ana, "pause", id)).rejects.toThrow(SO_AVALIADOR);
    await expect(act(U.bruno, "adjust", id, { p_delta_ms: 30000 })).rejects.toThrow("Ajuste inválido.");
    // correndo: +1 min; −1 min com piso de 30 s a partir de agora
    const antes = await linha(id);
    let s = await act(U.bruno, "adjust", id, { p_delta_ms: 60000 });
    expect(Math.abs(new Date(s.ends_at).getTime() - new Date(antes.ends_at).getTime() - 60000)).toBeLessThanOrEqual(1);
    await d.sql(`update public.checklist_rooms set ends_at = now() + interval '40 seconds' where id = $1`, [id]);
    s = await act(U.bruno, "adjust", id, { p_delta_ms: -60000 });
    const resta = new Date(s.ends_at).getTime() - new Date(s.server_now).getTime();
    expect(resta).toBeGreaterThan(29_000);
    expect(resta).toBeLessThanOrEqual(30_000);
    // pausar
    await d.sql(`update public.checklist_rooms set ends_at = now() + interval '200 seconds' where id = $1`, [id]);
    s = await act(U.bruno, "pause", id);
    expect(s.ends_at).toBeNull();
    expect(s.paused_at).not.toBeNull();
    expect(s.paused_left_ms).toBeGreaterThan(198_000);
    expect(s.paused_left_ms).toBeLessThanOrEqual(200_000);
    // pausado: ±1 min com piso de 30 s
    s = await act(U.bruno, "adjust", id, { p_delta_ms: 60000 });
    expect(s.paused_left_ms).toBeGreaterThan(258_000);
    await d.sql(`update public.checklist_rooms set paused_left_ms = 40000 where id = $1`, [id]);
    s = await act(U.bruno, "adjust", id, { p_delta_ms: -60000 });
    expect(s.paused_left_ms).toBe(30000);
    // retomar: ends_at = agora + o que restava; pausa somada
    await d.sql(`update public.checklist_rooms set paused_at = now() - interval '5 seconds' where id = $1`, [id]);
    s = await act(U.bruno, "resume", id);
    expect(s.paused_at).toBeNull();
    expect(s.paused_left_ms).toBeNull();
    const volta = new Date(s.ends_at).getTime() - new Date(s.server_now).getTime();
    expect(volta).toBeGreaterThan(29_000);
    expect(volta).toBeLessThanOrEqual(30_000);
    const r = await linha(id);
    expect(r.pausas).toBeGreaterThanOrEqual(5000);
    expect(r.pausas).toBeLessThan(8000);
    // fora de running
    const setup = await sala("setup");
    for (const fn of ["pause", "resume"]) await expect(act(U.bruno, fn, setup)).rejects.toThrow(FASE);
    await expect(act(U.bruno, "adjust", setup, { p_delta_ms: 60000 })).rejects.toThrow(FASE);
  });

  // ------------------------------------------------------------------ impressos
  it("liberar: impresso inicial recusa; liberável só em running; só o avaliador; o candidato passa a receber só o liberado (pela chave de tela)", async () => {
    const setup = await sala("setup", { station: SECRETA.id });
    await expect(act(U.bruno, "release", setup, { p_pressing_id: "teste-inep2020-e07-p2", p_released: true })).rejects.toThrow("Disponível depois de iniciar a estação.");
    const id = await sala("running", { station: SECRETA.id });
    await expect(act(U.bruno, "release", id, { p_pressing_id: "teste-inep2020-e07-p1", p_released: true })).rejects.toThrow("Este impresso já está visível desde o início.");
    await expect(act(U.ana, "release", id, { p_pressing_id: "teste-inep2020-e07-p2", p_released: true })).rejects.toThrow(SO_AVALIADOR);
    await expect(act(U.bruno, "release", id, { p_pressing_id: "nao-existe", p_released: true })).rejects.toThrow("Impresso não encontrado.");
    let s = await act(U.bruno, "release", id, { p_pressing_id: "teste-inep2020-e07-p3", p_released: true });
    expect(s.released_pressings).toEqual(["teste-inep2020-e07-p3"]);
    s = await act(U.bruno, "release", id, { p_pressing_id: "teste-inep2020-e07-p3", p_released: true });
    expect(s.released_pressings).toEqual(["teste-inep2020-e07-p3"]);
    const estado = await d.rpc(U.ana, "app_dupla_room", { p_room_id: id });
    expect(estado.released_pressings).toEqual(["d2"]);
    const conteudo = await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: id });
    expect(conteudo.pressings.map((p: any) => p.id)).toEqual(["i1", "d2"]);
    s = await act(U.bruno, "release", id, { p_pressing_id: "teste-inep2020-e07-p3", p_released: false });
    expect(s.released_pressings).toEqual([]);
    expect((await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: id })).pressings.map((p: any) => p.id)).toEqual(["i1"]);
    const review = await sala("review", { station: SECRETA.id });
    await expect(act(U.bruno, "release", review, { p_pressing_id: "teste-inep2020-e07-p2", p_released: true })).rejects.toThrow(FASE);
  });

  // ------------------------------------------------------------------ marcações
  it("marcações: só o avaliador, itens e níveis válidos, pendente limpa, subitens gravados, sem mudar o rev", async () => {
    const id = await sala("running");
    const rev = (await linha(id)).rev;
    await expect(act(U.ana, "mark", id, { p_item_id: "i1", p_grade: "correct" })).rejects.toThrow(SO_AVALIADOR);
    await expect(act(U.bruno, "mark", id, { p_item_id: "x9", p_grade: "correct" })).rejects.toThrow("Item do checklist não encontrado.");
    await expect(act(U.bruno, "mark", id, { p_item_id: "i2", p_grade: "partial" })).rejects.toThrow("Nível inválido para este item.");
    await expect(act(U.bruno, "mark", id, { p_item_id: "i1", p_grade: "otimo" })).rejects.toThrow("Nível inválido para este item.");
    expect(await act(U.bruno, "mark", id, { p_item_id: "i1", p_grade: "partial" })).toEqual({ ok: true });
    expect(await act(U.bruno, "mark", id, { p_item_id: "i3", p_grade: "correct", p_subitems: ["s2", "zz", "s1", "s2"] })).toEqual({ ok: true });
    expect(await marks(id)).toEqual([
      { item_id: "i1", grade: "partial", subitems_checked: [], evaluator_id: U.bruno },
      { item_id: "i3", grade: "correct", subitems_checked: ["s1", "s2"], evaluator_id: U.bruno },
    ]);
    await act(U.bruno, "mark", id, { p_item_id: "i1", p_grade: null });
    expect((await marks(id))[0]).toMatchObject({ item_id: "i1", grade: null });
    expect((await linha(id)).rev).toBe(rev);
    const setup = await sala("setup");
    await expect(act(U.bruno, "mark", setup, { p_item_id: "i1", p_grade: "correct" })).rejects.toThrow(FASE);
  });

  // ------------------------------------------------------------------ finalizar
  it("finalizar: nota do servidor (3,75 de 10; 37,5%), sessão completa e tempo usado sem pausas; duas vezes não cria duas; nenhuma sessão antes do resultado", async () => {
    const id = await sala("running", {
      station: SECRETA.id,
      extra: { started_at: new Date(Date.now() - 600_000).toISOString(), ends_at: new Date(Date.now() + 60_000).toISOString(), duration_ms: 600000 },
    });
    await act(U.bruno, "release", id, { p_pressing_id: "teste-inep2020-e07-p2", p_released: true });
    await act(U.bruno, "mark", id, { p_item_id: "i1", p_grade: "partial" });
    await act(U.bruno, "mark", id, { p_item_id: "i2", p_grade: "correct" });
    await act(U.bruno, "mark", id, { p_item_id: "i3", p_grade: null, p_subitems: ["s1"] });
    await expect(act(U.bruno, "finalize", id, { p_feedback: {} })).rejects.toThrow(FASE);
    // pausa em curso de 60 s: entra no total ao encerrar
    await d.sql(`update public.checklist_rooms set paused_at = now() - interval '60 seconds', paused_left_ms = 60000, ends_at = null where id = $1`, [id]);
    await expect(act(U.ana, "finish", id)).rejects.toThrow(SO_AVALIADOR);
    let s = await act(U.bruno, "finish", id);
    expect(s.phase).toBe("review");
    expect(s.finished_at).not.toBeNull();
    expect(await sessoes(id)).toEqual([]);
    // review: marcar ainda vale
    await act(U.bruno, "mark", id, { p_item_id: "i3", p_grade: null });
    await expect(act(U.bruno, "finalize", id, { p_feedback: { pos: "x".repeat(1001) } })).rejects.toThrow("Feedback: máximo de 1000 caracteres em cada campo.");
    await expect(act(U.ana, "finalize", id, { p_feedback: {} })).rejects.toThrow(SO_AVALIADOR);
    s = await act(U.bruno, "finalize", id, { p_feedback: { pos: "  Boa anamnese.  ", neg: "Faltou o exame.", gen: "" } });
    expect(s.phase).toBe("result");
    const [sess] = await sessoes(id);
    const r = await linha(id);
    expect(sess).toMatchObject({
      station_id: SECRETA.id, room_id: id, round: 1, actor_id: U.bruno, doctor_id: U.ana,
      score_n: 3.75, max_n: 10, pct: 37.5, station_version: "1.0",
      feedback_pos: "Boa anamnese.", feedback_neg: "Faltou o exame.", feedback_gen: "",
      pressings_released: ["teste-inep2020-e07-p2"],
      checklist_answers: [{ id: "i1", grade: "Partial", subitems: [] }, { id: "i2", grade: "Correct", subitems: [] }],
    });
    expect(new Date(sess.started_at).getTime()).toBe(new Date(r.started_at).getTime());
    expect(new Date(sess.finished_at).getTime()).toBe(new Date(r.finished_at).getTime());
    expect(r.pausas).toBeGreaterThanOrEqual(60000);
    expect(Math.abs(sess.used_ms - (sess.bruto - r.pausas))).toBeLessThanOrEqual(1);
    expect(sess.used_ms).toBeGreaterThan(530_000);
    expect(sess.used_ms).toBeLessThan(545_000);
    // clique duplo: nada muda
    const again = await act(U.bruno, "finalize", id, { p_feedback: { pos: "outro" } });
    expect(again.rev).toBe(s.rev);
    expect(await sessoes(id)).toHaveLength(1);
    expect((await sessoes(id))[0].feedback_pos).toBe("Boa anamnese.");
    // revisão da nota (Tarefa 18): em review com a sessão já existente, atualiza e guarda a nota antiga
    await d.sql(`update public.checklist_rooms set phase = 'review' where id = $1`, [id]);
    await act(U.bruno, "mark", id, { p_item_id: "i3", p_grade: "correct" });
    await act(U.bruno, "finalize", id, { p_feedback: { gen: "Revisado." } });
    const rev = await sessoes(id);
    expect(rev).toHaveLength(1);
    expect(rev[0]).toMatchObject({ score_n: 8.75, antes_n: 3.75, pct: 87.5, feedback_gen: "Revisado." });
    expect(rev[0].revised_at).not.toBeNull();
  });

  it("conteúdo republicado no meio: item que sumiu não conta e o total segue a estação atual", async () => {
    const outra = { ...STATION, id: "teste-dupla-repub", name: "Republicada de teste" };
    await addStation(d.db, outra);
    const id = await sala("running", { station: outra.id, extra: { started_at: new Date().toISOString(), ends_at: new Date(Date.now() + 60_000).toISOString() } });
    await act(U.bruno, "mark", id, { p_item_id: "i1", p_grade: "partial" });
    await act(U.bruno, "mark", id, { p_item_id: "i2", p_grade: "correct" });
    await act(U.bruno, "finish", id);
    await addStation(d.db, { ...outra, version: "2.0", checklist_items: outra.checklist_items.filter((i) => i.id !== "i2") });
    await act(U.bruno, "finalize", id, { p_feedback: null });
    const [sess] = await sessoes(id);
    expect(sess).toMatchObject({ score_n: 1.25, max_n: 7.5, pct: 16.7, station_version: "2.0" });
    expect(sess.checklist_answers).toEqual([{ id: "i1", grade: "Partial", subitems: [] }]);
  });

  // ------------------------------------------------------------------ caminho da imagem
  it("caminho da imagem: folha e impresso inicial/liberado só em running para o candidato; avaliador em setup, running e review; sem tabela ou sem chave → null", async () => {
    const caminho = (uid: string, room: string, p: string) => d.rpc<string | null>(uid, "app_dupla_print_path", { p_room_id: room, p_pressing_id: p });
    const id = await sala("running", { station: SECRETA.id });
    // sem a tabela station_assets: sempre null
    expect(await d.sql(`select to_regclass('public.station_assets') as t`)).toEqual([{ t: null }]);
    expect(await caminho(U.ana, id, "candidate_sheet")).toBeNull();
    expect(await caminho(U.bruno, id, "teste-inep2020-e07-p3")).toBeNull();
    await stationAssets(d.db, [
      { id: A1, storage_path: "dupla/a1.jpg" },
      { id: A3, storage_path: "dupla/a3.png" },
      { id: AF, storage_path: "dupla/folha.webp" },
    ]);
    // candidato em running
    expect(await caminho(U.ana, id, "candidate_sheet")).toBe("dupla/folha.webp");
    expect(await caminho(U.ana, id, "i1")).toBe("dupla/a1.jpg");
    await expect(caminho(U.ana, id, "d2")).rejects.toThrow("Impresso não liberado.");
    await expect(caminho(U.ana, id, "teste-inep2020-e07-p3")).rejects.toThrow("Impresso não liberado.");
    await act(U.bruno, "release", id, { p_pressing_id: "teste-inep2020-e07-p3", p_released: true });
    expect(await caminho(U.ana, id, "d2")).toBe("dupla/a3.png");
    await act(U.bruno, "release", id, { p_pressing_id: "teste-inep2020-e07-p2", p_released: true });
    expect(await caminho(U.ana, id, "d1")).toBeNull(); // liberado, mas sem imagem
    // avaliador: id verdadeiro, em setup, running e review
    for (const fase of ["setup", "running", "review"] as Phase[]) {
      await d.sql(`update public.checklist_rooms set phase = $2 where id = $1`, [id, fase]);
      expect(await caminho(U.bruno, id, "teste-inep2020-e07-p3"), fase).toBe("dupla/a3.png");
      expect(await caminho(U.bruno, id, "candidate_sheet"), fase).toBe("dupla/folha.webp");
      expect(await caminho(U.bruno, id, "teste-inep2020-e07-p2"), fase).toBeNull();
    }
    await expect(caminho(U.bruno, id, "zz")).rejects.toThrow("Impresso não encontrado.");
    // candidato fora de running
    for (const fase of ["setup", "review", "result", "roles", "connecting"] as Phase[]) {
      await d.sql(`update public.checklist_rooms set phase = $2 where id = $1`, [id, fase]);
      await expect(caminho(U.ana, id, "candidate_sheet"), fase).rejects.toThrow(FASE);
    }
    for (const fase of ["roles", "connecting", "result", "closed"] as Phase[]) {
      await d.sql(`update public.checklist_rooms set phase = $2 where id = $1`, [id, fase]);
      await expect(caminho(U.bruno, id, "candidate_sheet"), fase).rejects.toThrow(FASE);
    }
    // estação sem pressing_assets: null
    const semImagem = await sala("running");
    expect(await caminho(U.ana, semImagem, "candidate_sheet")).toBeNull();
    // quem não é da sala
    await expect(caminho(U.carla, semImagem, "candidate_sheet")).rejects.toThrow(SEM_SALA);
  });

  // ------------------------------------------------------------------ tema reservado (Review Focus 6)
  it("nenhuma resposta ao candidato contém o nome, o topic, o resumo, o id da estação ou o caminho com o nome, em todas as fases até review", async () => {
    const respostas: unknown[] = [];
    const ler = async (id: string) => {
      respostas.push(await d.rpc(U.ana, "app_dupla_room", { p_room_id: id }));
      respostas.push(await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: id }));
    };
    const id = await sala("roles", { papeis: false, station: null });
    respostas.push(await act(U.ana, "set_roles", id, { p_candidate_id: U.ana }));
    await ler(id);
    await act(U.bruno, "set_station", id, { p_station_id: SECRETA.id });
    await ler(id);
    respostas.push(await act(U.ana, "confirm_roles", id));
    await act(U.bruno, "confirm_roles", id);
    await ler(id);
    respostas.push(await act(U.ana, "connected", id));
    await act(U.bruno, "connected", id);
    await ler(id);
    respostas.push(await act(U.ana, "ready", id, { p_ready: true }));
    await act(U.bruno, "ready", id, { p_ready: true });
    await ler(id);
    await act(U.bruno, "start", id);
    await ler(id);
    await act(U.bruno, "release", id, { p_pressing_id: "teste-inep2020-e07-p2", p_released: true });
    await act(U.bruno, "release", id, { p_pressing_id: "teste-inep2020-e07-p3", p_released: true });
    await ler(id);
    for (const p of ["candidate_sheet", "i1", "d1", "d2"]) respostas.push(await d.rpc(U.ana, "app_dupla_print_path", { p_room_id: id, p_pressing_id: p }));
    await act(U.bruno, "pause", id);
    await ler(id);
    await act(U.bruno, "finish", id);
    await ler(id);
    expect(respostas.length).toBeGreaterThan(15);
    expect(vaza(respostas)).toEqual([]);
    // o avaliador recebe o nome, o resumo e a folha do candidato; o candidato não recebe resumo
    const aval = await d.rpc(U.bruno, "app_dupla_room_content", { p_room_id: id });
    expect(aval.station).toMatchObject({ name: SECRETA.name, summary: SECRETA.summary, candidate_sheet: { has_image: true } });
    const cand = await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: id });
    expect(cand.station).not.toHaveProperty("summary");
    expect(cand.station.candidate_sheet).toEqual({ has_image: true });
  });

  it("resumo do avaliador: texto não vazio vira texto; vazio ou outro tipo vira null", async () => {
    const comTexto = { ...STATION, id: "teste-dupla-resumo", name: "Resumo de teste", summary: "  Texto do resumo.  " };
    await addStation(d.db, comTexto);
    const id = await sala("running", { station: comTexto.id });
    expect((await d.rpc(U.bruno, "app_dupla_room_content", { p_room_id: id })).station.summary).toBe("  Texto do resumo.  ");
    await addStation(d.db, { ...comTexto, summary: "   " });
    expect((await d.rpc(U.bruno, "app_dupla_room_content", { p_room_id: id })).station.summary).toBeNull();
    await addStation(d.db, { ...comTexto, summary: 3 });
    expect((await d.rpc(U.bruno, "app_dupla_room_content", { p_room_id: id })).station.summary).toBeNull();
  });

  // ------------------------------------------------------------------ quem escolheu a estação
  it("me.picked_station: verdadeiro para quem escolheu no Banco (swipe) e para quem escolheu na sala; falso para o outro", async () => {
    const id = await sala("roles", { papeis: false, station: null });
    await act(U.ana, "set_roles", id, { p_candidate_id: U.ana });
    let s = await act(U.bruno, "set_station", id, { p_station_id: SECRETA.id });
    expect(s.me.picked_station).toBe(true);
    expect((await d.rpc(U.ana, "app_dupla_room", { p_room_id: id })).me.picked_station).toBe(false);
    expect((await d.rpc(U.ana, "app_dupla_room", { p_room_id: id })).partner).not.toHaveProperty("picked_station");
    // a candidata escolheu a mesma estação no Banco de estações (escolha "Estudar junto" com estação)
    await d.sql(`insert into public.study_swipes (from_user, to_user, direction, station_id) values ($1, $2, 'right', $3)`, [U.ana, U.bruno, SECRETA.id]);
    expect((await d.rpc(U.ana, "app_dupla_room", { p_room_id: id })).me.picked_station).toBe(true);
    // swipe com outra estação não conta; sala sem estação: falso
    await d.sql(`update public.study_swipes set station_id = $1 where from_user = $2`, [STATION.id, U.ana]);
    expect((await d.rpc(U.ana, "app_dupla_room", { p_room_id: id })).me.picked_station).toBe(false);
    const vazia = await sala("roles", { station: null });
    s = await d.rpc(U.ana, "app_dupla_room", { p_room_id: vazia });
    expect(s.me.picked_station).toBe(false);
  });

  // ------------------------------------------------------------------ números de tela
  it("números de tela contínuos: display_number com buraco (1 e 3) → 1 e 2 para os dois papéis; avaliador recebe também source_number", async () => {
    const id = await sala("running", { station: SECRETA.id, extra: { released_pressings: ["teste-inep2020-e07-p2", "teste-inep2020-e07-p3"] } });
    const c = await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: id });
    expect(c.pressings.map((p: any) => [p.id, p.display_number])).toEqual([["i1", 1], ["d1", 1], ["d2", 2]]);
    expect(JSON.stringify(c)).not.toContain("source_number");
    expect((await d.rpc(U.ana, "app_dupla_room", { p_room_id: id })).released_pressings).toEqual(["d1", "d2"]);
    const a = await d.rpc(U.bruno, "app_dupla_room_content", { p_room_id: id });
    expect(a.pressings.map((p: any) => [p.id, p.display_number, p.source_number, p.initially_visible])).toEqual([
      ["teste-inep2020-e07-p1", 1, 1, true],
      ["teste-inep2020-e07-p2", 1, 2, false],
      ["teste-inep2020-e07-p3", 2, 5, false],
    ]);
    expect(a.pressings.map((p: any) => p.has_image)).toEqual([true, false, true]);
  });

  // ------------------------------------------------------------------ acesso
  it("quem não é membro ou está sem acesso não age", async () => {
    const id = await sala("running");
    const chamadas: [string, Record<string, unknown>][] = [
      ["set_roles", { p_candidate_id: U.ana }], ["draw_roles", {}], ["set_station", { p_station_id: STATION.id }], ["confirm_roles", {}],
      ["connected", {}], ["ready", { p_ready: true }], ["set_duration", { p_duration_ms: 60000 }], ["start", {}], ["pause", {}],
      ["resume", {}], ["adjust", { p_delta_ms: 60000 }], ["release", { p_pressing_id: "p1", p_released: true }],
      ["mark", { p_item_id: "i1", p_grade: "correct" }], ["finish", {}], ["finalize", { p_feedback: {} }], ["print_path", { p_pressing_id: "p1" }],
    ];
    for (const [fn, args] of chamadas) {
      await expect(act(U.carla, fn, id, args), fn).rejects.toThrow(SEM_SALA);
      await expect(act(U.carla, fn, "00000000-0000-4000-8000-0000000000ff", args), fn).rejects.toThrow(SEM_SALA);
      await expect(act(U.diego, fn, id, args), fn).rejects.toThrow(SEM_ACESSO);
      await expect(act(null, fn, id, args), fn).rejects.toThrow(/permission denied/);
    }
    // membro que perdeu o acesso também não age
    await setPlan(d.db, U.ana, "pro", "canceled");
    await d.sql(`update public.subscriptions set current_period_end = now() - interval '10 days' where user_id = $1`, [U.ana]);
    await expect(act(U.ana, "connected", id)).rejects.toThrow(SEM_ACESSO);
    expect((await linha(id)).phase).toBe("running");
  });

  // ------------------------------------------------------------------ tempo real
  it("aviso de tempo real: cada ação que muda o rev manda { rev } ao tópico privado room:<id>; mark não manda nada", async () => {
    const enviados = () => d.sql<any>(`select payload, event, topic, private from realtime.enviados order by n`);
    // sem realtime.send (o esquema existe, a função não): as ações funcionam
    const antes = await sala("roles", { papeis: false });
    expect((await act(U.ana, "set_roles", antes, { p_candidate_id: U.ana })).rev).toBe(1);
    await d.db.exec(`
      create table realtime.enviados (n serial, payload jsonb, event text, topic text, private boolean);
      create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
        language sql as $$ insert into realtime.enviados (payload, event, topic, private) values (payload, event, topic, private) $$;
    `);
    const id = await sala("roles", { papeis: false });
    const topic = `room:${id}`;
    let s = await act(U.ana, "set_roles", id, { p_candidate_id: U.ana });
    expect(await enviados()).toEqual([{ payload: { rev: s.rev }, event: "sala", topic, private: true }]);
    await act(U.bruno, "set_station", id, { p_station_id: STATION.id });
    await act(U.ana, "confirm_roles", id);
    await act(U.bruno, "confirm_roles", id);
    await act(U.ana, "connected", id);
    await act(U.bruno, "connected", id);
    await act(U.ana, "ready", id, { p_ready: true });
    await act(U.bruno, "ready", id, { p_ready: true });
    s = await act(U.bruno, "start", id);
    const n = (await enviados()).length;
    expect(n).toBe(9);
    await act(U.bruno, "mark", id, { p_item_id: "i1", p_grade: "correct" });
    expect(await enviados()).toHaveLength(n);
    await act(U.bruno, "release", id, { p_pressing_id: "p1", p_released: true });
    await act(U.bruno, "pause", id);
    await act(U.bruno, "adjust", id, { p_delta_ms: 60000 });
    await act(U.bruno, "resume", id);
    await act(U.bruno, "finish", id);
    s = await act(U.bruno, "finalize", id, { p_feedback: {} });
    const todos = await enviados();
    expect(todos).toHaveLength(n + 6);
    expect(todos.map((m: any) => m.payload.rev)).toEqual(Array.from({ length: n + 6 }, (_, i) => i + 1));
    expect(todos.every((m: any) => m.topic === topic && m.event === "sala" && m.private === true && Object.keys(m.payload).join() === "rev")).toBe(true);
    expect(todos.at(-1).payload.rev).toBe(s.rev);
    // falha no envio não derruba a ação
    await d.db.exec(`create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
      language plpgsql as $$ begin raise exception 'falhou'; end $$;`);
    expect((await act(U.ana, "set_roles", antes, { p_candidate_id: U.bruno })).rev).toBe(2);
  });

  // ------------------------------------------------------------------ colar de novo e permissões
  it("colar a 013350 duas vezes dá o mesmo banco; permissões iguais às das outras app_dupla_*", async () => {
    const defs = () =>
      d.sql<{ id: string; def: string; acl: string | null }>(
        `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`
      );
    const gatilhos = () => d.sql(`select tgname, pg_get_triggerdef(oid) as def from pg_trigger where tgrelid = 'public.checklist_rooms'::regclass and not tgisinternal order by 1`);
    const colunas = () => d.sql(`select column_name, data_type from information_schema.columns where table_name = 'checklist_rooms' order by 1`);
    const antes = [await defs(), await gatilhos(), await colunas()];
    await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8"));
    expect([await defs(), await gatilhos(), await colunas()]).toEqual(antes);
    const acl = Object.fromEntries(antes[0].map((f: any) => [f.id, f.acl]));
    const app = [
      "app_dupla_set_roles(uuid,uuid)", "app_dupla_draw_roles(uuid)", "app_dupla_set_station(uuid,text)", "app_dupla_confirm_roles(uuid)",
      "app_dupla_connected(uuid)", "app_dupla_ready(uuid,boolean)", "app_dupla_set_duration(uuid,integer)", "app_dupla_start(uuid)",
      "app_dupla_pause(uuid)", "app_dupla_resume(uuid)", "app_dupla_adjust(uuid,integer)", "app_dupla_release(uuid,text,boolean)",
      "app_dupla_mark(uuid,text,text,text[])", "app_dupla_finish(uuid)", "app_dupla_finalize(uuid,jsonb)", "app_dupla_print_path(uuid,text)",
    ];
    for (const f of app) expect(acl[f], f).toBe(acl["app_dupla_room(uuid,integer)"]);
    for (const f of ["dupla_pressings_tela(jsonb)", "dupla_room_notify()", "dupla_room_for_action(uuid,uuid)"]) {
      expect(acl[f], f).toBeDefined();
      expect(acl[f], f).not.toContain("authenticated");
      expect(acl[f], f).not.toContain("anon");
    }
    const volat = await d.sql(`select proname, provolatile, prosecdef, proconfig from pg_proc where proname = any ($1) order by 1`, [
      ["app_dupla_set_roles", "app_dupla_mark", "app_dupla_finalize", "app_dupla_print_path", "app_dupla_start"],
    ]);
    for (const f of volat) expect(f, f.proname).toMatchObject({ provolatile: "v", prosecdef: true, proconfig: ['search_path=""'] });
  });
});

