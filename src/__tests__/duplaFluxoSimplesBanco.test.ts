// @vitest-environment node
/**
 * Treino em Dupla · fluxo simples (desenho de 19/10: docs/superpowers/specs/2026-10-19-treino-dupla-fluxo-simples-design.md).
 * Migrações 014130 (convite e lista), 014140 (sigilo antes do início) e 014150 (início, papéis e rodadas), no PGlite com
 * TODAS as migrações em ordem. Pessoas e estações de TESTE; nenhuma IA, rede ou chave.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, STATION, U, addProfile, addStation, makeRoom, openDuplaDb, seen, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

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
});
