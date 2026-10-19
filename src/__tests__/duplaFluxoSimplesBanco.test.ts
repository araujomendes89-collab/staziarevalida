// @vitest-environment node
/**
 * Treino em Dupla · fluxo simples (desenho de 19/10: docs/superpowers/specs/2026-10-19-treino-dupla-fluxo-simples-design.md).
 * Migrações 014130 (convite e lista), 014140 (sigilo antes do início) e 014150 (início, papéis e rodadas), no PGlite com
 * TODAS as migrações em ordem. Pessoas e estações de TESTE; nenhuma IA, rede ou chave.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, STATION, U, addProfile, addSession, addStation, makeRoom, openDuplaDb, seen, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const ABERTO = { aberto: true, planos: ["trial", "pro", "elite"] };
// Estações de TESTE com marcas fáceis de procurar no texto bruto.
const SECRETA = { ...STATION, id: "teste-fluxo-e09", name: "ZZNOME fluxo simples", topic: "ZZTEMA fluxo", taxonomy_path: ["Clínica Médica", "ZZTAXO"] };
const OUTRA = { ...STATION, id: "teste-fluxo-e10", name: "ZZOUTRA estação de teste", topic: "ZZOUTRA tema" };
const MARCAS = [SECRETA.id, SECRETA.name, "ZZTEMA", "ZZTAXO", SECRETA.area];
const vaza = (x: unknown) => MARCAS.filter((m) => JSON.stringify(x).includes(m));
const PERFIS: Record<string, Record<string, unknown>> = {
  ana: { public_name: "Ana Souza", role_pref: "med", city: "Curitiba · PR" },
  bruno: { public_name: "Bruno Lima", role_pref: "med", city: "Curitiba · PR" },
  carla: { public_name: "Carla Dias", role_pref: "any", city: "Londrina · PR" },
};

describe("Fluxo simples do Treino em Dupla (014130–014150)", () => {
  let d: DuplaDb;

  const convidar = (de: string, para: string, estacao: string | null = SECRETA.id) =>
    d.rpc<any>(de, "app_dupla_invite", { p_to: para, p_station_id: estacao });
  const conviteDe = async (sala: string) => (await d.sql<any>(`select id from public.study_invites where room_id = $1`, [sala]))[0].id as string;
  const aceitar = async (quem: string, sala: string) => d.rpc<any>(quem, "app_dupla_answer_invite", { p_invite_id: await conviteDe(sala), p_accept: true });
  const estado = (uid: string, sala: string) => d.rpc<any>(uid, "app_dupla_room", { p_room_id: sala });
  const conteudo = (uid: string, sala: string) => d.rpc<any>(uid, "app_dupla_room_content", { p_room_id: sala });
  const act = (uid: string, fn: string, sala: string, args: Record<string, unknown> = {}) => d.rpc<any>(uid, `app_dupla_${fn}`, { p_room_id: sala, ...args });
  const linha = async (sala: string) => (await d.sql<any>(`select * from public.checklist_rooms where id = $1`, [sala]))[0];

  const montar = async () => {
    await d.sql(`delete from public.study_train_requests`);
    await d.sql(`delete from public.checklist_study_sessions`);
    await d.sql(`delete from public.checklist_rooms`); // convites caem junto
    await d.sql(`delete from public.study_matches`);
    await d.sql(`delete from public.study_swipes`);
    await d.sql(`delete from public.study_profiles`);
    for (const [nome, p] of Object.entries(PERFIS)) await addProfile(d.db, (U as any)[nome], p);
    for (const nome of Object.keys(PERFIS)) await seen(d.db, (U as any)[nome]);
    for (const uid of Object.values(U)) await setPlan(d.db, uid, "trial", "trialing", daqui(7));
    await setDupla(d.db, ABERTO);
  };

  beforeAll(async () => {
    d = await openDuplaDb();
    await addStation(d.db, SECRETA);
    await addStation(d.db, OUTRA);
  }, 240_000);
  beforeEach(async () => {
    await montar();
  }, 60_000);
  afterAll(async () => {
    await d?.db.close();
  });

  // ------------------------------------------------------------------ 014130: convite e lista
  it("convite direto: quem convida é o ator e quem recebe é o candidato (ignora o papel preferido); a sala nasce na preparação com a estação", async () => {
    const r = await convidar(U.ana, U.bruno); // os dois preferem ser candidatos: não importa no convite direto
    expect(r.partner).toEqual({ user_id: U.bruno, public_name: "Bruno Lima" });
    expect(await linha(r.room_id)).toMatchObject({
      phase: "setup", round: 1, match_id: null, station_id: SECRETA.id, station_chosen_by: U.ana, evaluator_id: U.ana, candidate_id: U.bruno,
    });
    const [c] = await d.sql<any>(`select kind, status, from_user, to_user, extract(epoch from (expires_at - created_at))::int as prazo from public.study_invites where room_id = $1`, [r.room_id]);
    expect(c).toEqual({ kind: "direto", status: "pending", from_user: U.ana, to_user: U.bruno, prazo: 60 });
  });

  it("convite direto sem estação é recusado e nada é criado", async () => {
    await expect(convidar(U.ana, U.bruno, null)).rejects.toThrow("Escolha a estação antes de convidar.");
    expect(await d.sql(`select 1 from public.checklist_rooms`)).toEqual([]);
    expect(await d.sql(`select 1 from public.study_invites`)).toEqual([]);
  });

  it("o convite não leva nada da estação (nem número, área, porta ou origem); pedidos antigos de 24 h não aparecem mais", async () => {
    await convidar(U.ana, U.bruno);
    const v = await d.rpc<any>(U.bruno, "app_dupla_invites");
    expect(v.invites).toHaveLength(1);
    expect(v.invites[0]).toMatchObject({ kind: "direto", role: "candidate", station: null, from: { user_id: U.ana, public_name: "Ana Souza" } });
    expect(vaza(v)).toEqual([]);
    expect(JSON.stringify(v)).not.toContain("Estação");

    await d.sql(`delete from public.checklist_rooms`);
    await d.sql(`insert into public.study_train_requests (from_user, to_user, station_id) values ($1, $2, $3)`, [U.carla, U.bruno, SECRETA.id]);
    const p = await d.rpc<any>(U.bruno, "app_dupla_requests");
    expect(p.requests).toEqual([]); // o pedido por link saiu: o pedido antigo fica guardado e não aparece
    expect((await d.sql<any>(`select count(*)::int as n from public.study_train_requests`))[0].n).toBe(1);
    expect(v.invites[0]).not.toHaveProperty("porta");
  });

  it("aceitar: a sala continua na preparação com os papéis fixos; recusar fecha 'convite_recusado'", async () => {
    const r = await convidar(U.ana, U.bruno);
    expect(await aceitar(U.bruno, r.room_id)).toEqual({ room_id: r.room_id });
    expect(await linha(r.room_id)).toMatchObject({ phase: "setup", evaluator_id: U.ana, candidate_id: U.bruno });
    await d.sql(`delete from public.checklist_rooms`);
    const b = await convidar(U.carla, U.bruno);
    await d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: await conviteDe(b.room_id), p_accept: false });
    expect(await linha(b.room_id)).toMatchObject({ phase: "closed", closed_reason: "convite_recusado" });
  });

  it("lista: só as abas 'online' e 'perto'; a aba 'atores' é recusada", async () => {
    await expect(d.rpc(U.ana, "app_dupla_radar", { p_aba: "atores" })).rejects.toThrow("Aba inválida.");
    const online = await d.rpc<any>(U.ana, "app_dupla_radar", { p_aba: "online" });
    expect(online.people.map((p: any) => p.public_name).sort()).toEqual(["Bruno Lima", "Carla Dias"]);
    const perto = await d.rpc<any>(U.ana, "app_dupla_radar", { p_aba: "perto" });
    expect(perto.people.map((p: any) => p.public_name)).toEqual(["Bruno Lima", "Carla Dias"]); // mesma cidade antes do mesmo estado
  });

  it("convite por link do @ saiu: abrir o link, pedir e responder pedido recusam e nada é criado; sem acesso, o porteiro recusa antes", async () => {
    const [{ handle }] = await d.sql<any>(`select handle from public.study_profiles where user_id = $1`, [U.bruno]);
    const chamadas: [string, Record<string, unknown>][] = [
      ["app_dupla_link_lookup", { p_handle: handle }],
      ["app_dupla_link_request", { p_handle: handle }],
      ["app_dupla_answer_request", { p_request_id: "00000000-0000-4000-8000-0000000000ff", p_accept: true }],
    ];
    for (const [fn, args] of chamadas) await expect(d.rpc(U.ana, fn, args), fn).rejects.toThrow("O convite por link saiu.");
    expect(await d.sql(`select 1 from public.checklist_rooms`)).toEqual([]);
    expect(await d.sql(`select 1 from public.study_train_requests`)).toEqual([]);
    await setDupla(d.db, { aberto: false, planos: [] });
    await expect(d.rpc(U.ana, "app_dupla_link_lookup", { p_handle: handle })).rejects.toThrow("Sem acesso ao Treinamento em Dupla.");
  });

  // ------------------------------------------------------------------ 014140: sigilo antes do início marcado
  it("antes de 'running' o candidato não recebe nada da estação (estado, conteúdo e imagem), em nenhuma fase; o ator recebe tudo", async () => {
    for (const phase of ["roles", "connecting", "setup"] as const) {
      const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase, candidate: U.bruno, evaluator: U.ana, station: SECRETA.id });
      const e = await estado(U.bruno, sala);
      expect(e.station, phase).toBeNull();
      expect(e.duration_ms, phase).toBeNull();
      expect(e.station_ready, phase).toBe(true);
      expect(e.porta, phase).toBe(1); // SECRETA é de Clínica Médica: porta 1, e só isso
      const c = await conteudo(U.bruno, sala);
      expect(c, phase).not.toHaveProperty("porta");
      expect(c, phase).toMatchObject({ station: null, pressing_count: 0, pressings: [], waiting: true });
      expect(vaza([e, c]), phase).toEqual([]);
      await expect(d.rpc(U.bruno, "app_dupla_print_path", { p_room_id: sala, p_pressing_id: "candidate_sheet" }), phase).rejects.toThrow("Esta ação não vale nesta fase da sala.");
      const a = await estado(U.ana, sala);
      expect(a.station, phase).toMatchObject({ id: SECRETA.id, name: SECRETA.name });
    }
  });

  it("na fase dos papéis sem papéis definidos ninguém recebe a estação escolhida no match", async () => {
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", station: SECRETA.id });
    for (const uid of [U.ana, U.bruno]) {
      const e = await estado(uid, sala);
      expect(e.station, uid).toBeNull();
      expect(e.station_ready, uid).toBe(true);
      expect(vaza([e, await conteudo(uid, sala)]), uid).toEqual([]);
    }
  });

  it("porta = número da área (1 CM, 2 Cirurgia, 3 Pediatria, 4 GO, 5 MFC); sem estação, sem porta; o texto bruto não traz a área", async () => {
    const areas: [string, number][] = [["Clínica Médica", 1], ["Cirurgia Geral", 2], ["Pediatria", 3], ["Ginecologia e Obstetrícia", 4], ["Medicina de Família e Comunidade", 5]];
    for (const [area, porta] of areas) {
      const id = `teste-porta-${porta}`;
      await addStation(d.db, { ...STATION, id, name: `ZZPORTA ${porta}`, topic: `ZZPORTA tema ${porta}`, area });
      const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "setup", candidate: U.bruno, evaluator: U.ana, station: id });
      const e = await estado(U.bruno, sala);
      expect(e.porta, area).toBe(porta);
      expect(e.station, area).toBeNull();
      const cru = JSON.stringify([e, await conteudo(U.bruno, sala)]);
      for (const m of [area, "ZZPORTA", id]) expect(cru, area).not.toContain(m);
    }
    const semEstacao = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "setup", candidate: U.bruno, evaluator: U.ana, station: null });
    expect(await estado(U.bruno, semEstacao)).toMatchObject({ porta: null, station_ready: false, station: null });
    expect((await d.sql<any>(`select public.dupla_porta('Área que não existe') as n`))[0].n).toBeNull();
    // os dois apoios novos são só por dentro (014140: revoke de public, anon e authenticated)
    const [acl] = await d.sql<any>(`select
        has_function_privilege('authenticated', 'public.dupla_porta(text)', 'execute') as porta_auth,
        has_function_privilege('anon', 'public.dupla_porta(text)', 'execute') as porta_anon,
        has_function_privilege('authenticated', 'public.dupla_antes_do_inicio(public.checklist_rooms)', 'execute') as antes_auth,
        has_function_privilege('anon', 'public.dupla_antes_do_inicio(public.checklist_rooms)', 'execute') as antes_anon`);
    expect(acl).toEqual({ porta_auth: false, porta_anon: false, antes_auth: false, antes_anon: false });
  });

  it("sala fechada antes de começar: o candidato segue sem a estação; em andamento (início no passado) ele recebe 'Estação N · área' sem o nome", async () => {
    const fechada = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "closed", candidate: U.bruno, evaluator: U.ana, station: SECRETA.id });
    expect((await estado(U.bruno, fechada)).station).toBeNull();
    const andando = await makeRoom(d.db, {
      members: [U.ana, U.bruno], phase: "running", candidate: U.bruno, evaluator: U.ana, station: SECRETA.id,
      extra: { started_at: new Date(Date.now() - 60_000).toISOString(), ends_at: daqui(1) },
    });
    const e = await estado(U.bruno, andando);
    expect(e.station).toMatchObject({ area: SECRETA.area });
    expect(e.station).not.toHaveProperty("name");
    expect(e.station).not.toHaveProperty("id");
    const c = await conteudo(U.bruno, andando);
    expect(c.role).toBe("candidate");
    expect(c.station).toMatchObject({ doctor_scene: expect.any(String) });
  });

  it("DONO-2: com o início marcado no futuro (o apito), o candidato não recebe nada da estação — estado, conteúdo, impressos liberados e imagem —, só a porta e o horário; o ator recebe tudo; passado o horário, o candidato recebe", async () => {
    const inicio = daqui(1); // no PGlite o now() é fixo em cada transação: "no futuro" = bem à frente
    const sala = await makeRoom(d.db, {
      members: [U.ana, U.bruno], phase: "running", candidate: U.bruno, evaluator: U.ana, station: SECRETA.id,
      extra: { started_at: inicio, ends_at: daqui(2), duration_ms: 600000, released_pressings: ["p1"] }, // o ator liberou o hemograma durante o apito
    });
    const e = await estado(U.bruno, sala);
    expect(e).toMatchObject({
      phase: "running", station: null, duration_ms: null, ends_at: null, paused_left_ms: null, released_pressings: [], station_ready: true, porta: 1,
    });
    expect(Date.parse(e.started_at)).toBe(Date.parse(inicio)); // o horário de abertura sai
    expect(typeof e.server_now).toBe("string");
    const c = await conteudo(U.bruno, sala);
    expect(c).toEqual({ role: "candidate", station: null, pressing_count: 0, pressings: [], waiting: true });
    expect(vaza([e, c])).toEqual([]);
    expect(JSON.stringify([e, c])).not.toContain("Hemograma");
    expect(JSON.stringify(e)).not.toContain("p1");
    for (const p of ["candidate_sheet", "i1", "v1", "d1"]) {
      await expect(d.rpc(U.bruno, "app_dupla_print_path", { p_room_id: sala, p_pressing_id: p }), p).rejects.toThrow("Esta ação não vale nesta fase da sala.");
    }
    // o ator recebe tudo, sempre (DONO-1: ele está na tela de trabalho durante o apito)
    const a = await estado(U.ana, sala);
    expect(a.station).toMatchObject({ id: SECRETA.id, name: SECRETA.name });
    expect(a.ends_at).not.toBeNull();
    expect(a.released_pressings).toEqual(["p1"]);
    expect((await conteudo(U.ana, sala)).station).toMatchObject({ actor_script: expect.any(String) });
    await d.rpc(U.ana, "app_dupla_print_path", { p_room_id: sala, p_pressing_id: "candidate_sheet" }); // não recusa

    // a porta abre: o início marcado passa (no PGlite, trazendo o horário para o passado)
    await d.sql(`update public.checklist_rooms set started_at = now() - interval '1 second', ends_at = now() + interval '10 minutes' where id = $1`, [sala]);
    const e2 = await estado(U.bruno, sala);
    expect(e2.station).toMatchObject({ area: SECRETA.area });
    expect(e2.station).not.toHaveProperty("name");
    expect(e2.ends_at).not.toBeNull();
    expect(e2.released_pressings).not.toContain("p1"); // sempre pela chave de tela, nunca o id verdadeiro
    const c2 = await conteudo(U.bruno, sala);
    expect(c2.station).toMatchObject({ doctor_scene: SECRETA.doctor_scene });
    expect(JSON.stringify(c2.pressings)).toContain("Hemograma");
    await d.rpc(U.bruno, "app_dupla_print_path", { p_room_id: sala, p_pressing_id: "candidate_sheet" }); // não recusa mais
  });

  it("DONO-2: resultado e histórico também esperam o início marcado (ator que encerrasse e enviasse a nota durante o apito); o ator vê na hora", async () => {
    const sala = await makeRoom(d.db, {
      members: [U.ana, U.bruno], phase: "result", candidate: U.bruno, evaluator: U.ana, station: SECRETA.id,
      extra: { started_at: daqui(1), finished_at: new Date().toISOString() },
    });
    const sess = await addSession(d.db, { room: sala, round: 1, doctor: U.bruno, actor: U.ana, station: SECRETA.id, correctness: 80 });
    await d.sql(`update public.checklist_study_sessions set started_at = $2 where id = $1`, [sess, daqui(1)]);
    const pede = (uid: string, fn: string) => d.rpc<any>(uid, fn, { p_room_id: sala, p_round: 1 });
    const daSala = async (uid: string) => ((await d.rpc<any[]>(uid, "app_dupla_history")) ?? []).filter((h: any) => h.room_id === sala);
    await expect(pede(U.bruno, "app_dupla_result")).rejects.toThrow("Resultado ainda não liberado.");
    await expect(pede(U.bruno, "app_dupla_history_result")).rejects.toThrow("Resultado ainda não liberado.");
    expect(await daSala(U.bruno)).toEqual([]);
    const e = await estado(U.bruno, sala);
    expect(e.station).toBeNull();
    expect(vaza(e)).toEqual([]);
    expect((await pede(U.ana, "app_dupla_result")).station).toMatchObject({ id: SECRETA.id });
    expect(await daSala(U.ana)).toHaveLength(1);

    await d.sql(`update public.checklist_rooms set started_at = now() - interval '1 minute' where id = $1`, [sala]);
    await d.sql(`update public.checklist_study_sessions set started_at = now() - interval '1 minute' where id = $1`, [sess]);
    expect((await pede(U.bruno, "app_dupla_result")).station).toMatchObject({ name: SECRETA.name });
    expect((await pede(U.bruno, "app_dupla_history_result")).station).toMatchObject({ name: SECRETA.name });
    expect(await daSala(U.bruno)).toHaveLength(1);
    expect((await estado(U.bruno, sala)).station).toMatchObject({ name: SECRETA.name }); // no resultado o nome aparece aos dois
  });

  // Achado da revisão da Tarefa 1: a sala do convite nasce em "setup" com o convidado já em member_ids (e o room_id chega a ele
  // em app_dupla_invites). O convite não mostra nada da estação, nem a porta (desenho §4); depois de aceitar, só a porta até o
  // início marcado.
  it("convite pendente (não aceito), sala na preparação: o convidado não recebe nada da estação, nem a porta (estado, conteúdo e imagem); o ator recebe tudo", async () => {
    const { room_id: sala } = await convidar(U.ana, U.bruno);
    expect(await linha(sala)).toMatchObject({ phase: "setup", candidate_id: U.bruno, station_id: SECRETA.id });
    const e = await estado(U.bruno, sala);
    expect(e).toMatchObject({ phase: "setup", invite_pending: true, station: null, duration_ms: null, ends_at: null, porta: null, station_ready: false });
    const c = await conteudo(U.bruno, sala);
    expect(c).toEqual({ role: "candidate", station: null, pressing_count: 0, pressings: [], waiting: true });
    expect(vaza([e, c])).toEqual([]);
    for (const p of ["candidate_sheet", "i1", "v1", "d1", "p1", "p2"]) {
      await expect(d.rpc(U.bruno, "app_dupla_print_path", { p_room_id: sala, p_pressing_id: p }), p).rejects.toThrow("Esta ação não vale nesta fase da sala.");
    }
    // o ator (quem convidou) lê a estação durante a espera (ruling C1)
    const a = await estado(U.ana, sala);
    expect(a.station).toMatchObject({ id: SECRETA.id, name: SECRETA.name });
    expect(a.porta).toBe(1);
    expect((await conteudo(U.ana, sala)).station).toMatchObject({ actor_script: expect.any(String), doctor_scene: expect.any(String) });
  });

  it("convite aceito, antes do início marcado: o candidato recebe só a porta; com o início no futuro, nada; com o início no passado, a estação", async () => {
    const { room_id: sala } = await convidar(U.ana, U.bruno);
    await aceitar(U.bruno, sala);
    const e = await estado(U.bruno, sala);
    expect(e).toMatchObject({ phase: "setup", invite_pending: false, station: null, duration_ms: null, porta: 1, station_ready: true });
    const c = await conteudo(U.bruno, sala);
    expect(c).toEqual({ role: "candidate", station: null, pressing_count: 0, pressings: [], waiting: true });
    expect(vaza([e, c])).toEqual([]);
    await expect(d.rpc(U.bruno, "app_dupla_print_path", { p_room_id: sala, p_pressing_id: "candidate_sheet" })).rejects.toThrow("Esta ação não vale nesta fase da sala.");

    // o ator iniciou e o início marcado ainda está no futuro (o apito)
    await d.sql(`update public.checklist_rooms set phase = 'running', started_at = now() + interval '1 day', ends_at = now() + interval '2 days' where id = $1`, [sala]);
    const e2 = await estado(U.bruno, sala);
    expect(e2).toMatchObject({ phase: "running", station: null, duration_ms: null, ends_at: null, released_pressings: [], porta: 1 });
    expect(await conteudo(U.bruno, sala)).toEqual({ role: "candidate", station: null, pressing_count: 0, pressings: [], waiting: true });
    expect(vaza([e2])).toEqual([]);
    await expect(d.rpc(U.bruno, "app_dupla_print_path", { p_room_id: sala, p_pressing_id: "candidate_sheet" })).rejects.toThrow("Esta ação não vale nesta fase da sala.");
    expect((await estado(U.ana, sala)).station).toMatchObject({ id: SECRETA.id });

    // a porta abre
    await d.sql(`update public.checklist_rooms set started_at = now() - interval '1 second', ends_at = now() + interval '10 minutes' where id = $1`, [sala]);
    const e3 = await estado(U.bruno, sala);
    expect(e3.station).toMatchObject({ area: SECRETA.area, label: expect.any(String) });
    expect(e3.station).not.toHaveProperty("name");
    expect(e3.duration_ms).toBe(600000);
    expect((await conteudo(U.bruno, sala)).station).toMatchObject({ doctor_scene: SECRETA.doctor_scene, doctor_tasks: SECRETA.doctor_tasks });
    await d.rpc(U.bruno, "app_dupla_print_path", { p_room_id: sala, p_pressing_id: "candidate_sheet" }); // não recusa
  });

  // Rodada de correção 1 da Tarefa 2: o aviso "você já viu esta estação" é tirado da própria estação (dupla_room_seen); antes do
  // início marcado ele não chega a quem não é o ator (nem ao convidado pendente). O ator continua recebendo o seu e o do parceiro.
  it("aviso 'já viu esta estação': o candidato que já fez a estação recebe falso no convite, na preparação e no apito; o ator recebe o dele; passado o horário, o candidato recebe verdadeiro", async () => {
    // Bruno já fez a SECRETA como candidato numa sala antiga (o que dupla_room_seen lê: avaliação com ele como médico)
    const velha = await makeRoom(d.db, { members: [U.carla, U.bruno], phase: "closed", candidate: U.bruno, evaluator: U.carla, station: SECRETA.id });
    await addSession(d.db, { room: velha, round: 1, doctor: U.bruno, actor: U.carla, station: SECRETA.id, correctness: 70 });

    const { room_id: sala } = await convidar(U.ana, U.bruno);
    const confere = async (quando: string) => {
      const b = await estado(U.bruno, sala);
      expect(b.me.seen_station, quando).toBe(false);
      expect(b.partner.seen_station, quando).toBe(false);
      const a = await estado(U.ana, sala);
      expect(a.partner, quando).toMatchObject({ role: "candidate", seen_station: true }); // o ator fica sabendo
    };
    await confere("convite pendente");
    await aceitar(U.bruno, sala);
    await confere("preparação");
    await d.sql(`update public.checklist_rooms set phase = 'running', started_at = now() + interval '1 day', ends_at = now() + interval '2 days' where id = $1`, [sala]);
    await confere("início marcado no futuro");

    // a porta abre: o candidato recebe o aviso (como antes do fluxo simples)
    await d.sql(`update public.checklist_rooms set started_at = now() - interval '1 second', ends_at = now() + interval '10 minutes' where id = $1`, [sala]);
    expect((await estado(U.bruno, sala)).me).toMatchObject({ role: "candidate", seen_station: true });
    expect((await estado(U.ana, sala)).partner.seen_station).toBe(true);
  });
});
