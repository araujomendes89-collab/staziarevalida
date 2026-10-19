// @vitest-environment node
/**
 * Treino em Dupla · fluxo simples (desenho de 19/10: docs/superpowers/specs/2026-10-19-treino-dupla-fluxo-simples-design.md).
 * Migrações 014130 (convite e lista), 014140 (sigilo antes do início) e 014150 (início, papéis e rodadas), no PGlite com
 * TODAS as migrações em ordem. Pessoas e estações de TESTE; nenhuma IA, rede ou chave.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { MIGRATIONS_DIR, STATION, U, abrirPorta, addProfile, addSession, addStation, makeRoom, openDuplaDb, seen, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const ROOT = path.resolve(__dirname, "../..");
const NOVAS = ["20261003014130_treino_dupla_fluxo_convite.sql", "20261003014140_treino_dupla_fluxo_sigilo.sql", "20261003014150_treino_dupla_fluxo_sala.sql"];
const ler = (f: string) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
const desfazer = (f: string) => fs.readFileSync(path.join(ROOT, "supabase/desfazer", f.replace(/\.sql$/, ".desfazer.sql")), "utf8");
// Retrato do Treino no banco: funções (assinatura, texto, permissões) e gatilhos do esquema public.
const RETRATO_FN = `select p.oid::regprocedure::text as f, md5(pg_get_functiondef(p.oid)) as h, coalesce(array_to_string(p.proacl, ','), '') as acl
                      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^(app_)?dupla_' order by 1`;
const RETRATO_TRG = `select c.relname as t, t.tgname as n, pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_class c on c.oid = t.tgrelid
                      where c.relnamespace = 'public'::regnamespace and not t.tgisinternal order by 1, 2`;

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

  // ------------------------------------------------------------------ 014150: início, papéis e rodadas
  // (014150, ordem do controlador: encerrar e enviar a nota esperam o início marcado; por isso a rodada abre a porta antes.)
  const rodadaCompleta = async () => {
    const r = await convidar(U.ana, U.bruno);
    await aceitar(U.bruno, r.room_id);
    await act(U.ana, "start", r.room_id);
    await abrirPorta(d.db, r.room_id);
    await act(U.ana, "finish", r.room_id);
    await act(U.ana, "finalize", r.room_id, { p_feedback: { gen: "" } });
    return r.room_id as string;
  };

  it("um toque do ator: o início espera o aceite; depois, só o ator inicia, sem 'pronto', conexão ou confirmar", async () => {
    const r = await convidar(U.ana, U.bruno);
    await expect(act(U.ana, "start", r.room_id)).rejects.toThrow("O convite ainda não foi aceito.");
    // o ator troca a estação enquanto o convite espera: o candidato continua sem saber qual é
    await act(U.ana, "set_station", r.room_id, { p_station_id: OUTRA.id });
    await aceitar(U.bruno, r.room_id);
    expect((await estado(U.bruno, r.room_id)).station).toBeNull();
    await expect(act(U.bruno, "start", r.room_id)).rejects.toThrow("Só o avaliador pode fazer isso.");
    const s = await act(U.ana, "start", r.room_id);
    expect(s.phase).toBe("running");
    expect(await linha(r.room_id)).toMatchObject({ phase: "running", station_id: OUTRA.id, ready_ids: [], confirmed_ids: [], connected_ids: [] });
    // o início é gravado 2 s à frente (o apito); o cronômetro tem a duração inteira a partir daí
    const [t] = await d.sql<any>(
      `select round(extract(epoch from (started_at - now())) * 1000)::int as falta, round(extract(epoch from (ends_at - started_at)) * 1000)::int as dur
         from public.checklist_rooms where id = $1`, [r.room_id]);
    expect(t.falta).toBeGreaterThan(1000);
    expect(t.falta).toBeLessThanOrEqual(2000);
    expect(t.dur).toBe(600000);
    // DONO-2: até o início marcado (os 2 s do apito) o candidato recebe só a porta e o horário; com a porta aberta, a estação
    expect(await estado(U.bruno, r.room_id)).toMatchObject({ station: null, ends_at: null, station_ready: true, porta: 1 });
    await abrirPorta(d.db, r.room_id);
    expect((await estado(U.bruno, r.room_id)).station).toMatchObject({ area: OUTRA.area });
    await expect(act(U.ana, "start", r.room_id)).rejects.toThrow("Esta ação não vale nesta fase da sala.");
  });

  it("DONO-2 com o início de verdade: logo depois do toque o candidato recebe só a porta e o horário (estado, conteúdo, impressos, imagem); o ator recebe tudo; com a porta aberta, o candidato recebe a folha", async () => {
    const r = await convidar(U.ana, U.bruno);
    await aceitar(U.bruno, r.room_id);
    await act(U.ana, "start", r.room_id);
    await act(U.ana, "release", r.room_id, { p_pressing_id: "p1", p_released: true }); // o ator libera durante o apito
    const e = await estado(U.bruno, r.room_id);
    expect(e).toMatchObject({ phase: "running", station: null, duration_ms: null, ends_at: null, released_pressings: [], station_ready: true, porta: 1 });
    expect(Date.parse(e.started_at)).toBe(new Date((await linha(r.room_id)).started_at).getTime()); // o horário de abertura sai
    const c = await conteudo(U.bruno, r.room_id);
    expect(c).toEqual({ role: "candidate", station: null, pressing_count: 0, pressings: [], waiting: true });
    expect(vaza([e, c])).toEqual([]);
    await expect(d.rpc(U.bruno, "app_dupla_print_path", { p_room_id: r.room_id, p_pressing_id: "candidate_sheet" })).rejects.toThrow("Esta ação não vale nesta fase da sala.");
    expect((await estado(U.ana, r.room_id)).station).toMatchObject({ id: SECRETA.id, name: SECRETA.name });
    expect((await conteudo(U.ana, r.room_id)).station).toMatchObject({ actor_script: expect.any(String) });
    await abrirPorta(d.db, r.room_id);
    expect((await estado(U.bruno, r.room_id)).station).toMatchObject({ area: SECRETA.area });
    const c2 = await conteudo(U.bruno, r.room_id);
    expect(c2.station).toMatchObject({ doctor_scene: SECRETA.doctor_scene });
    expect(JSON.stringify(c2.pressings)).toContain("Hemograma");
    await d.rpc(U.bruno, "app_dupla_print_path", { p_room_id: r.room_id, p_pressing_id: "candidate_sheet" }); // não recusa mais
  });

  it("só o ator libera, marca, encerra e envia a nota; a nota guarda o comentário em feedback_gen; o candidato pede revisão", async () => {
    const r = await convidar(U.ana, U.bruno);
    await aceitar(U.bruno, r.room_id);
    await act(U.ana, "start", r.room_id);
    await abrirPorta(d.db, r.room_id); // encerrar e enviar a nota esperam o início marcado (teste abaixo)
    await expect(act(U.bruno, "release", r.room_id, { p_pressing_id: "p1", p_released: true })).rejects.toThrow("Só o avaliador pode fazer isso.");
    await expect(d.rpc(U.bruno, "app_dupla_mark", { p_room_id: r.room_id, p_item_id: "i1", p_grade: "correct" })).rejects.toThrow("Só o avaliador pode fazer isso.");
    await expect(act(U.bruno, "finish", r.room_id)).rejects.toThrow("Só o avaliador pode fazer isso.");
    await d.rpc(U.ana, "app_dupla_mark", { p_room_id: r.room_id, p_item_id: "i1", p_grade: "correct" });
    await act(U.ana, "finish", r.room_id);
    await expect(act(U.bruno, "finalize", r.room_id, { p_feedback: { gen: "x" } })).rejects.toThrow("Só o avaliador pode fazer isso.");
    expect((await act(U.ana, "finalize", r.room_id, { p_feedback: { gen: "Boa anamnese." } })).phase).toBe("result");
    const [sess] = await d.sql<any>(`select feedback_pos, feedback_neg, feedback_gen, doctor_id, actor_id from public.checklist_study_sessions where room_id = $1`, [r.room_id]);
    expect(sess).toEqual({ feedback_pos: "", feedback_neg: "", feedback_gen: "Boa anamnese.", doctor_id: U.bruno, actor_id: U.ana });
    await act(U.bruno, "request_review", r.room_id, { p_round: 1, p_reason: "O item 2 foi feito." });
    expect((await act(U.ana, "redo_review", r.room_id, { p_round: 1 })).phase).toBe("review");
  });

  // Ordem do controlador (Tarefa 2, achado 2): a avaliação da rodada (checklist_study_sessions, que o candidato lê direto pela
  // API) só nasce no "Enviar a nota"; encerrar ou enviar a nota durante os 2 s do apito entregaria a estação antes da porta.
  it("durante o apito (início marcado no futuro) o ator não encerra nem envia a nota; passado o horário, encerra e envia", async () => {
    const r = await convidar(U.ana, U.bruno);
    await aceitar(U.bruno, r.room_id);
    await act(U.ana, "start", r.room_id);
    await expect(act(U.ana, "finish", r.room_id)).rejects.toThrow("A estação ainda não começou. Espere o apito terminar.");
    expect(await linha(r.room_id)).toMatchObject({ phase: "running", finished_at: null });
    // mesmo que a sala já estivesse na revisão (encerrada por outro caminho), a nota espera o início marcado
    await d.sql(`update public.checklist_rooms set phase = 'review', finished_at = now() where id = $1`, [r.room_id]);
    await expect(act(U.ana, "finalize", r.room_id, { p_feedback: { gen: "x" } })).rejects.toThrow("A estação ainda não começou. Espere o apito terminar.");
    expect(await d.sql(`select 1 from public.checklist_study_sessions where room_id = $1`, [r.room_id])).toEqual([]);
    expect(await linha(r.room_id)).toMatchObject({ phase: "review" });
    // a porta abre: encerrar e enviar a nota funcionam
    await d.sql(`update public.checklist_rooms set phase = 'running', finished_at = null where id = $1`, [r.room_id]);
    await abrirPorta(d.db, r.room_id);
    expect((await act(U.ana, "finish", r.room_id)).phase).toBe("review");
    expect((await act(U.ana, "finalize", r.room_id, { p_feedback: { gen: "ok" } })).phase).toBe("result");
    expect(await d.sql(`select 1 from public.checklist_study_sessions where room_id = $1`, [r.room_id])).toHaveLength(1);
  });

  it("nova rodada 'trocar': os papéis invertem, a sala volta à preparação sem estação e só o novo ator escolhe", async () => {
    const sala = await rodadaCompleta();
    await expect(act(U.bruno, "next_station", sala, { p_papel: "outro" })).rejects.toThrow("Escolha inválida.");
    const s = await act(U.bruno, "next_station", sala, { p_papel: "trocar" });
    expect(s).toMatchObject({ phase: "setup", round: 2, station: null, station_ready: false });
    expect(await linha(sala)).toMatchObject({ evaluator_id: U.bruno, candidate_id: U.ana, station_id: null, started_at: null });
    await expect(act(U.bruno, "start", sala)).rejects.toThrow("Escolha a estação antes de iniciar.");
    await expect(act(U.ana, "set_station", sala, { p_station_id: OUTRA.id })).rejects.toThrow("Só o avaliador escolhe a estação.");
    await expect(act(U.bruno, "set_station", sala, { p_station_id: SECRETA.id })).rejects.toThrow("Vocês já treinaram esta estação nesta sala. Escolham outra.");
    await act(U.bruno, "set_station", sala, { p_station_id: OUTRA.id });
    expect(await estado(U.ana, sala)).toMatchObject({ phase: "setup", station: null, station_ready: true });
    expect((await act(U.bruno, "start", sala)).phase).toBe("running");
  });

  it("tela antiga, sem p_papel: a nova rodada mantém os papéis ('mesmo')", async () => {
    const sala = await rodadaCompleta();
    const s = await d.rpc<any>(U.bruno, "app_dupla_next_station", { p_room_id: sala });
    expect(s).toMatchObject({ phase: "setup", round: 2 });
    expect(await linha(sala)).toMatchObject({ evaluator_id: U.ana, candidate_id: U.bruno, station_id: null });
  });

  it("match: perfil, baralho e papéis pelas preferências não mudam; com os papéis decididos, aceitar leva à preparação e o ator escolhe a estação", async () => {
    await d.sql(`update public.study_profiles set role_pref = 'ator' where user_id = $1`, [U.bruno]); // Ana 'med', Bruno 'ator'
    await d.rpc(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right" });
    const m = await d.rpc<any>(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right" });
    expect(m.matched).toBe(true);
    expect(await linha(m.room_id)).toMatchObject({ phase: "roles", candidate_id: U.ana, evaluator_id: U.bruno, station_id: null });
    const [{ id }] = (await d.rpc<any>(U.bruno, "app_dupla_invites")).invites;
    await d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: true });
    expect(await linha(m.room_id)).toMatchObject({ phase: "setup", station_id: null });
    await act(U.bruno, "set_station", m.room_id, { p_station_id: SECRETA.id });
    expect((await act(U.bruno, "start", m.room_id)).phase).toBe("running");
  });

  it("match: quem trouxe a estação e virou candidato fica sem ela; quem trouxe e virou ator fica com ela", async () => {
    await d.sql(`update public.study_profiles set role_pref = 'ator' where user_id = $1`, [U.bruno]); // Ana 'med', Bruno 'ator'
    await d.rpc(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right" });
    const m = await d.rpc<any>(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right", p_station_id: SECRETA.id });
    expect(m.matched).toBe(true);
    expect(await linha(m.room_id)).toMatchObject({ candidate_id: U.ana, evaluator_id: U.bruno, station_id: null, station_chosen_by: null, duration_ms: null });
    await d.sql(`delete from public.checklist_rooms`);
    await d.sql(`delete from public.study_matches`);
    await d.sql(`delete from public.study_swipes`);
    await d.rpc(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right" });
    const n = await d.rpc<any>(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right", p_station_id: SECRETA.id });
    expect(await linha(n.room_id)).toMatchObject({ candidate_id: U.ana, evaluator_id: U.bruno, station_id: SECRETA.id, station_chosen_by: U.bruno });
  });

  it("match: os dois escolheram a mesma estação no baralho → a sala nasce sem estação (a candidata também a trouxe); só o futuro ator escolheu → fica", async () => {
    await d.sql(`update public.study_profiles set role_pref = 'ator' where user_id = $1`, [U.bruno]); // Ana 'med', Bruno 'ator'
    const limpar = async () => {
      await d.sql(`delete from public.checklist_rooms`);
      await d.sql(`delete from public.study_matches`);
      await d.sql(`delete from public.study_swipes`);
    };
    // Ana escolhe a SECRETA e o ator Bruno completa com a SECRETA
    await d.rpc(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right", p_station_id: SECRETA.id });
    const m = await d.rpc<any>(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right", p_station_id: SECRETA.id });
    expect(m.matched).toBe(true);
    expect(await linha(m.room_id)).toMatchObject({ candidate_id: U.ana, evaluator_id: U.bruno, station_id: null, station_chosen_by: null, duration_ms: null });
    expect((await d.sql<any>(`select station_id from public.study_matches where id = (select match_id from public.checklist_rooms where id = $1)`, [m.room_id]))[0].station_id).toBeNull();
    // ao contrário: o ator Bruno escolhe primeiro e a candidata Ana completa com a mesma
    await limpar();
    await d.rpc(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right", p_station_id: SECRETA.id });
    const n = await d.rpc<any>(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right", p_station_id: SECRETA.id });
    expect(await linha(n.room_id)).toMatchObject({ candidate_id: U.ana, evaluator_id: U.bruno, station_id: null, station_chosen_by: null });
    // sem regressão: só o futuro ator escolheu (a candidata não trouxe estação) → a estação fica
    await limpar();
    await d.rpc(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right", p_station_id: SECRETA.id });
    const o = await d.rpc<any>(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right" });
    expect(await linha(o.room_id)).toMatchObject({ candidate_id: U.ana, evaluator_id: U.bruno, station_id: SECRETA.id, station_chosen_by: U.bruno });
  });

  it("papéis escolhidos ou sorteados na sala depois de um match em que os dois escolheram a mesma estação: quem vira candidato também a trouxe → a estação é limpa", async () => {
    await d.sql(`update public.study_profiles set role_pref = 'any' where user_id = any ($1::uuid[])`, [[U.ana, U.bruno]]);
    const formar = async () => {
      await d.sql(`delete from public.checklist_rooms`);
      await d.sql(`delete from public.study_matches`);
      await d.sql(`delete from public.study_swipes`);
      await d.rpc(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right", p_station_id: SECRETA.id });
      const m = await d.rpc<any>(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right", p_station_id: SECRETA.id });
      // papéis não decididos: a sala nasce nos papéis com a estação de Ana (quem completou); Bruno também a escolheu
      expect(await linha(m.room_id)).toMatchObject({ phase: "roles", candidate_id: null, station_id: SECRETA.id, station_chosen_by: U.ana });
      return m.room_id as string;
    };
    // Bruno (que não ficou gravado como quem escolheu, mas também escolheu) vira candidato: limpa
    const a = await formar();
    await act(U.ana, "set_roles", a, { p_candidate_id: U.bruno });
    expect(await linha(a)).toMatchObject({ phase: "setup", candidate_id: U.bruno, evaluator_id: U.ana, station_id: null, station_chosen_by: null, duration_ms: null });
    // sorteio: seja quem for o candidato, ele trouxe a estação → sempre limpa
    for (let i = 0; i < 4; i++) {
      const b = await formar();
      await act(U.bruno, "draw_roles", b);
      expect(await linha(b)).toMatchObject({ phase: "setup", station_id: null, station_chosen_by: null, duration_ms: null });
    }
  });

  it("papéis escolhidos na sala: se quem trouxe a estação vira candidato, a estação é limpa; se vira ator, fica", async () => {
    const a = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", station: SECRETA.id, extra: { station_chosen_by: U.ana } });
    await act(U.bruno, "set_roles", a, { p_candidate_id: U.ana });
    expect(await linha(a)).toMatchObject({ phase: "setup", candidate_id: U.ana, station_id: null, station_chosen_by: null, duration_ms: null });
    const b = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", station: SECRETA.id, extra: { station_chosen_by: U.ana } });
    await act(U.ana, "set_roles", b, { p_candidate_id: U.bruno });
    expect(await linha(b)).toMatchObject({ phase: "setup", evaluator_id: U.ana, station_id: SECRETA.id });
  });

  it("match sem papéis decididos ('qualquer papel' dos dois): a sala fica nos papéis; escolher ou sortear os papéis leva à preparação", async () => {
    await d.sql(`update public.study_profiles set role_pref = 'any' where user_id = any ($1::uuid[])`, [[U.ana, U.bruno]]);
    await d.rpc(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right" });
    const m = await d.rpc<any>(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right" });
    const [{ id }] = (await d.rpc<any>(U.bruno, "app_dupla_invites")).invites;
    await d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: true });
    expect(await linha(m.room_id)).toMatchObject({ phase: "roles", candidate_id: null, evaluator_id: null });
    expect((await act(U.ana, "set_roles", m.room_id, { p_candidate_id: U.bruno })).phase).toBe("setup");
    expect(await linha(m.room_id)).toMatchObject({ candidate_id: U.bruno, evaluator_id: U.ana });

    const outra = await makeRoom(d.db, { members: [U.ana, U.carla], phase: "roles", station: null });
    expect((await act(U.carla, "draw_roles", outra)).phase).toBe("setup");
    const l = await linha(outra);
    expect([l.candidate_id, l.evaluator_id].sort()).toEqual([U.ana, U.carla].sort());
  });

  it("estação que caiu (sala nos papéis com os papéis definidos): o ator escolhe outra e a sala vai direto à preparação", async () => {
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", candidate: U.bruno, evaluator: U.ana, station: null, extra: { station_dropped_round: 1 } });
    await expect(act(U.bruno, "set_station", sala, { p_station_id: OUTRA.id })).rejects.toThrow("Só o avaliador escolhe a estação.");
    expect((await act(U.ana, "set_station", sala, { p_station_id: OUTRA.id })).phase).toBe("setup");
  });

  it("salas antigas: 'conexão' ainda leva à preparação e o início não pede mais 'pronto'", async () => {
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "connecting", candidate: U.bruno, evaluator: U.ana, station: SECRETA.id });
    await act(U.ana, "connected", sala);
    expect((await act(U.bruno, "connected", sala)).phase).toBe("setup");
    expect((await act(U.ana, "start", sala)).phase).toBe("running");
  });

  it("014150: permissões (aluno anônimo e público fora; o gatilho só por dentro) e a assinatura antiga da nova rodada sumiu", async () => {
    const [p] = await d.sql<any>(`select
        has_function_privilege('anon', 'public.app_dupla_start(uuid)', 'execute') as start_anon,
        has_function_privilege('anon', 'public.app_dupla_next_station(uuid, text)', 'execute') as next_anon,
        has_function_privilege('anon', 'public.app_dupla_set_roles(uuid, uuid)', 'execute') as roles_anon,
        has_function_privilege('anon', 'public.app_dupla_draw_roles(uuid)', 'execute') as draw_anon,
        has_function_privilege('anon', 'public.app_dupla_set_station(uuid, text)', 'execute') as station_anon,
        has_function_privilege('anon', 'public.app_dupla_swipe(uuid, text, text)', 'execute') as swipe_anon,
        has_function_privilege('anon', 'public.app_dupla_finish(uuid)', 'execute') as finish_anon,
        has_function_privilege('anon', 'public.app_dupla_finalize(uuid, jsonb)', 'execute') as finalize_anon,
        has_function_privilege('authenticated', 'public.app_dupla_next_station(uuid, text)', 'execute') as next_auth,
        has_function_privilege('authenticated', 'public.dupla_invite_accepted_setup()', 'execute') as gatilho_auth,
        has_function_privilege('anon', 'public.dupla_invite_accepted_setup()', 'execute') as gatilho_anon,
        has_function_privilege('authenticated', 'public.dupla_room_trouxe(public.checklist_rooms, uuid)', 'execute') as trouxe_auth,
        to_regprocedure('public.app_dupla_next_station(uuid)') is null as antiga_sumiu`);
    expect(p).toEqual({
      start_anon: false, next_anon: false, roles_anon: false, draw_anon: false, station_anon: false, swipe_anon: false,
      finish_anon: false, finalize_anon: false, next_auth: true, gatilho_auth: false, gatilho_anon: false, trouxe_auth: false, antiga_sumiu: true,
    });
    // só equipe: com a chave desligada, o porteiro recusa antes de qualquer regra nova
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "setup", candidate: U.bruno, evaluator: U.ana, station: SECRETA.id });
    await setDupla(d.db, { aberto: false, planos: [] });
    for (const [fn, args] of [["start", {}], ["next_station", { p_papel: "trocar" }], ["set_station", { p_station_id: OUTRA.id }], ["finish", {}]] as const) {
      await expect(act(U.ana, fn, sala, args), fn).rejects.toThrow("Sem acesso ao Treinamento em Dupla.");
    }
  });

  // ------------------------------------------------------------------ colar de novo, permissões e desfazer
  const foto = () => d.sql(RETRATO_FN);
  const assinatura = async (sig: string) => (await d.sql<any>(`select to_regprocedure($1) is not null as ok`, [sig]))[0].ok as boolean;
  const gatilho = async () => (await d.sql(`select 1 from pg_trigger where tgname = 'study_invites_accepted_setup'`)).length === 1;

  it("permissões: as app_* sem visitante; o miolo do convite e o gatilho só por dentro", async () => {
    const pode = async (papel: string, sig: string) =>
      (await d.sql<any>(`select has_function_privilege($1, $2, 'execute') as ok`, [papel, sig]))[0].ok as boolean;
    for (const sig of ["public.app_dupla_invite(uuid,text)", "public.app_dupla_next_station(uuid,text)", "public.app_dupla_start(uuid)", "public.app_dupla_set_station(uuid,text)", "public.app_dupla_radar(text,text)", "public.app_dupla_invites()", "public.app_dupla_requests()", "public.app_dupla_room_content(uuid)", "public.app_dupla_swipe(uuid,text,text)", "public.app_dupla_link_lookup(text,text)", "public.app_dupla_link_request(text,text)", "public.app_dupla_answer_request(uuid,boolean)", "public.app_dupla_print_path(uuid,text)", "public.app_dupla_result(uuid,integer)", "public.app_dupla_history_result(uuid,integer)", "public.app_dupla_history(integer)"]) {
      expect(await pode("anon", sig), sig).toBe(false);
      expect(await pode("authenticated", sig), sig).toBe(true);
    }
    for (const sig of ["public.dupla_invite_core(uuid,uuid,text,boolean,uuid,boolean)", "public.dupla_invite_accepted_setup()", "public.dupla_room_state(public.checklist_rooms,uuid)", "public.dupla_porta(text)", "public.dupla_antes_do_inicio(public.checklist_rooms)"]) {
      expect(await pode("anon", sig), sig).toBe(false);
      expect(await pode("authenticated", sig), sig).toBe(false);
    }
  });

  it("colar as três migrações de novo não muda nada (mesmas funções, mesmos textos, mesmas permissões)", async () => {
    const antes = await foto();
    for (const f of NOVAS) await d.db.exec(ler(f));
    expect(await foto()).toEqual(antes);
  });

  it("desfazer em ordem inversa volta as assinaturas da etapa 2; colar de novo volta o fluxo simples", async () => {
    const depois = await foto();
    const gatilhosDepois = await d.sql(RETRATO_TRG);
    for (const f of [...NOVAS].reverse()) await d.db.exec(desfazer(f));
    expect(await assinatura("public.dupla_invite_core(uuid,uuid,text,boolean,uuid)")).toBe(true);
    expect(await assinatura("public.dupla_invite_core(uuid,uuid,text,boolean,uuid,boolean)")).toBe(false);
    expect(await assinatura("public.app_dupla_next_station(uuid)")).toBe(true);
    expect(await assinatura("public.app_dupla_next_station(uuid,text)")).toBe(false);
    expect(await gatilho()).toBe(false);
    expect(await assinatura("public.dupla_porta(text)")).toBe(false);
    expect(await assinatura("public.dupla_antes_do_inicio(public.checklist_rooms)")).toBe(false);
    const fonte = async (nome: string) =>
      (await d.sql<any>(`select prosrc as s from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [nome]))[0].s as string;
    for (const f of ["dupla_room_state", "app_dupla_room_content", "app_dupla_print_path"]) expect(await fonte(f), f).not.toContain("dupla_antes_do_inicio");
    for (const f of ["app_dupla_result", "app_dupla_history_result", "app_dupla_history"]) expect(await fonte(f), f).not.toContain("now() < s.started_at");
    const [{ s }] = await d.sql<any>(`select prosrc as s from pg_proc where proname = 'app_dupla_start' and pronamespace = 'public'::regnamespace`);
    expect(s).toContain("Os dois precisam estar prontos.");
    const [{ l }] = await d.sql<any>(`select prosrc as l from pg_proc where proname = 'app_dupla_link_request' and pronamespace = 'public'::regnamespace`);
    expect(l).not.toContain("O convite por link saiu.");

    // retrato completo: o banco desfeito é igual a um banco que só recebeu a cadeia ATÉ a 014120 (funções, textos, permissões e gatilhos)
    const etapa2 = new PGlite();
    try {
      await etapa2.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
      for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith(".sql") && x < NOVAS[0]).sort()) await etapa2.exec(ler(f));
      expect(await foto()).toEqual((await etapa2.query(RETRATO_FN)).rows);
      expect(await d.sql(RETRATO_TRG)).toEqual((await etapa2.query(RETRATO_TRG)).rows);
    } finally {
      await etapa2.close();
    }

    // desfazer colado duas vezes não quebra nem muda nada
    const desfeito = await foto();
    for (const f of [...NOVAS].reverse()) await d.db.exec(desfazer(f));
    expect(await foto()).toEqual(desfeito);

    for (const f of NOVAS) await d.db.exec(ler(f));
    expect(await foto()).toEqual(depois);
    expect(await d.sql(RETRATO_TRG)).toEqual(gatilhosDepois);
    expect(await gatilho()).toBe(true);
  }, 300_000);
});
