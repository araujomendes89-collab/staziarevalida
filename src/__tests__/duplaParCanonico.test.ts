// @vitest-environment node
/**
 * Treino em Dupla (Stazia Match) · migração 013510, parte 2: UM PAR, UMA CONEXÃO (índice único sobre o par em ordem canônica
 * de study_matches) e o reuso da conexão pela app_dupla_swipe. Conferido num Postgres em memória (PGlite) com as regras reais
 * (todas as migrações, em ordem). Com a cota de créditos desligada (o padrão), a app_dupla_swipe da 013520 se comporta como
 * a da 013510.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, STATION, U, addProfile, addStation, openDuplaDb, seen, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003013510_treino_dupla_integridade.sql"), "utf8");
// A 013520 refaz app_dupla_swipe a partir da 013510; quem cola a primeira cola a segunda em seguida.
const SQL_CREDITOS = fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003013520_treino_dupla_creditos_inicio.sql"), "utf8");
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const ABERTO = { aberto: true, planos: ["trial", "pro", "elite"] };
const ESTACAO_2 = { ...STATION, id: "teste-dupla-e02", name: "Segunda estação de teste" };
const NOMES = ["ana", "bruno", "carla", "diego", "eva", "fabio", "gil"] as const;

describe("Migração 013510 — um par, uma conexão (study_matches_par_uniq e reuso na escolha)", () => {
  let d: DuplaDb;

  const swipe = (de: string, para: string, direcao: "right" | "left" = "right", estacao?: string | null) =>
    d.rpc(de, "app_dupla_swipe", { p_to: para, p_direction: direcao, ...(estacao === undefined ? {} : { p_station_id: estacao }) });

  const montar = async () => {
    await d.sql(`delete from public.checklist_rooms`); // convites e reservas caem junto; matches ficam sem sala
    await d.sql(`delete from public.study_matches`); // as conversas (study_chats) são apagadas a seguir: cada teste começa sem nenhuma
    await d.sql(`delete from public.study_chats`);
    await d.sql(`delete from public.study_swipes`);
    await d.sql(`delete from public.study_profiles`);
    for (const nome of NOMES) await addProfile(d.db, U[nome], { public_name: nome.toUpperCase(), role_pref: "any" });
    for (const nome of NOMES) await seen(d.db, U[nome]);
    for (const uid of Object.values(U)) await setPlan(d.db, uid, "trial", "trialing", daqui(7));
    await setDupla(d.db, ABERTO);
  };

  /** x e y se escolhem, um depois do outro (y primeiro); devolve a resposta da segunda escolha. */
  const encontro = async (x: string, y: string, estacao?: string | null) => {
    expect(await swipe(y, x, "right", estacao)).toEqual({ matched: false });
    return swipe(x, y, "right", estacao);
  };

  const matches = () => d.sql(`select id, user_a, user_b, station_id, room_id, created_at from public.study_matches order by created_at, id`);
  const contar = async (tabela: string) => (await d.sql<{ n: number }>(`select count(*)::int as n from public.${tabela}`))[0].n;
  /** Sai da sala (fecha), libera as duas pessoas e renova o sinal delas para o próximo encontro. */
  const sair = async (uid: string, sala: string, ...pessoas: string[]) => {
    await d.rpc(uid, "app_dupla_leave", { p_room_id: sala });
    for (const p of pessoas) await seen(d.db, p);
  };

  beforeAll(async () => {
    d = await openDuplaDb();
    await addStation(d.db);
    await addStation(d.db, ESTACAO_2);
  }, 120_000);
  beforeEach(async () => {
    await montar();
  }, 60_000);
  afterAll(async () => {
    await d?.db.close();
  });

  // ------------------------------------------------------------------ o índice
  it("o índice study_matches_par_uniq existe, é único e usa (menor, maior) dos dois ids", async () => {
    const [ix] = await d.sql<{ indexdef: string }>(`select indexdef from pg_indexes where schemaname = 'public' and indexname = 'study_matches_par_uniq'`);
    expect(ix).toBeDefined();
    expect(ix.indexdef).toMatch(/^CREATE UNIQUE INDEX study_matches_par_uniq ON public\.study_matches USING btree \(LEAST\(user_a, user_b\), GREATEST\(user_a, user_b\)\)$/);
  });

  it("inserir (A, B) e depois (B, A) à mão é recusado; o mesmo (A, B) de novo também; outro par passa", async () => {
    await d.sql(`insert into public.study_matches (user_a, user_b) values ($1, $2)`, [U.ana, U.bruno]);
    await expect(d.sql(`insert into public.study_matches (user_a, user_b) values ($1, $2)`, [U.bruno, U.ana])).rejects.toThrow(/study_matches_par_uniq/);
    await expect(d.sql(`insert into public.study_matches (user_a, user_b) values ($1, $2)`, [U.ana, U.bruno])).rejects.toThrow(/study_matches_par_uniq/);
    const erro: any = await d.sql(`insert into public.study_matches (user_a, user_b) values ($1, $2)`, [U.bruno, U.ana]).then(() => null, (e) => e);
    expect(erro.code).toBe("23505");
    expect(await contar("study_matches")).toBe(1);

    await d.sql(`insert into public.study_matches (user_a, user_b) values ($1, $2), ($3, $2)`, [U.ana, U.carla, U.bruno]);
    expect(await contar("study_matches")).toBe(3);
  });

  // ------------------------------------------------------------------ escolhas
  it("duas escolhas A→B e B→A (cada uma 'right', uma depois da outra) formam UMA conexão e UMA sala", async () => {
    const r = await encontro(U.ana, U.bruno);
    expect(r.matched).toBe(true);
    expect(await contar("study_matches")).toBe(1);
    expect(await contar("checklist_rooms")).toBe(1);
    expect(await contar("study_chats")).toBe(1);
    const [m] = await matches();
    expect(m.room_id).toBe(r.room_id);
    expect(new Set([m.user_a, m.user_b])).toEqual(new Set([U.ana, U.bruno]));
    expect((await d.sql(`select match_id from public.checklist_rooms where id = $1`, [r.room_id])).map((x) => x.match_id)).toEqual([m.id]);
  });

  it("duas escolhas ao mesmo tempo (Promise.all) também dão uma conexão e uma sala só", async () => {
    // O PGlite serializa as chamadas: isto prova o resultado, não o paralelismo real (o bloqueio por par cuida disso no Postgres).
    const [a, b] = await Promise.all([swipe(U.ana, U.bruno), swipe(U.bruno, U.ana)]);
    expect([a.matched, b.matched].sort()).toEqual([false, true]);
    expect(await contar("study_matches")).toBe(1);
    expect(await contar("checklist_rooms")).toBe(1);
    expect(await contar("study_room_claims")).toBe(2);
  });

  it("segundo encontro do mesmo par REUSA a conexão: mesmo match, room_id na sala mais recente, estação atualizada, sem conversa duplicada", async () => {
    const primeiro = await encontro(U.ana, U.bruno, STATION.id);
    const sala1 = primeiro.room_id as string;
    const [m1] = await matches();
    expect(m1.station_id).toBe(STATION.id);
    expect(m1.room_id).toBe(sala1);

    await sair(U.ana, sala1, U.ana, U.bruno);
    // As escolhas valem 7 dias: para a segunda rodada começar do zero, apagam-se as da primeira.
    await d.sql(`delete from public.study_swipes`);

    // Segunda vez, na ORDEM INVERSA (Ana escolhe primeiro) e com outra estação.
    const segundo = await encontro(U.bruno, U.ana, ESTACAO_2.id);
    expect(segundo.matched).toBe(true);
    const sala2 = segundo.room_id as string;
    expect(sala2).not.toBe(sala1);

    const todos = await matches();
    expect(todos).toHaveLength(1);
    expect(todos[0].id).toBe(m1.id); // a mesma conexão
    expect(todos[0].room_id).toBe(sala2); // a sala MAIS RECENTE
    expect(todos[0].station_id).toBe(ESTACAO_2.id); // a estação mais recente
    expect(todos[0].created_at).toEqual(m1.created_at); // a conexão é a de antes, não uma nova

    // As duas salas apontam para o mesmo match; só a segunda está aberta.
    expect(await d.sql(`select id, match_id, phase, station_id from public.checklist_rooms order by created_at, id`)).toEqual([
      { id: sala1, match_id: m1.id, phase: "closed", station_id: STATION.id },
      { id: sala2, match_id: m1.id, phase: "roles", station_id: ESTACAO_2.id },
    ]);
    // Um convite por sala; a conversa do par continua uma só.
    expect(await contar("study_invites")).toBe(2);
    expect(await contar("study_chats")).toBe(1);
    expect(await contar("study_room_claims")).toBe(2);
    expect(await d.sql(`select room_id from public.study_room_claims where user_id = $1`, [U.ana])).toEqual([{ room_id: sala2 }]);
  });

  it("escolhas de 8 dias atrás já não valem: a velha não forma match; a nova do outro lado forma e reusa a conexão", async () => {
    const sala1 = (await encontro(U.ana, U.bruno)).room_id as string;
    const [m1] = await matches();
    await sair(U.ana, sala1, U.ana, U.bruno);

    await d.sql(`update public.study_swipes set created_at = now() - interval '8 days'`);
    // Bruno escolhe a Ana: a escolha dela tem 8 dias, então não há match ainda.
    expect(await swipe(U.bruno, U.ana)).toEqual({ matched: false });
    // Ana escolhe o Bruno agora: a dele é de agora; forma e reusa a conexão.
    const r = await swipe(U.ana, U.bruno);
    expect(r.matched).toBe(true);
    const todos = await matches();
    expect(todos).toHaveLength(1);
    expect(todos[0]).toEqual(expect.objectContaining({ id: m1.id, room_id: r.room_id }));
    expect(await contar("study_chats")).toBe(1);
  });

  it("a ordem dos usuários não importa: o par (B, A) reusa a conexão gravada como (A, B), e vice-versa", async () => {
    const sala1 = (await encontro(U.ana, U.bruno)).room_id as string;
    const [m1] = await matches();
    await sair(U.bruno, sala1, U.ana, U.bruno);
    await d.sql(`delete from public.study_swipes`);

    const sala2 = (await encontro(U.ana, U.bruno)).room_id as string; // mesma ordem de antes
    expect((await matches()).map((m) => m.id)).toEqual([m1.id]);
    await sair(U.ana, sala2, U.ana, U.bruno);
    await d.sql(`delete from public.study_swipes`);

    const sala3 = (await encontro(U.bruno, U.ana)).room_id as string; // ordem inversa
    expect((await matches()).map((m) => m.id)).toEqual([m1.id]);
    expect((await matches())[0].room_id).toBe(sala3);
    expect(await contar("checklist_rooms")).toBe(3);
    expect(await d.sql(`select distinct match_id from public.checklist_rooms`)).toEqual([{ match_id: m1.id }]);
  });

  it("pares diferentes continuam com conexões diferentes (e cada par tem a sua conversa)", async () => {
    const s1 = (await encontro(U.ana, U.bruno)).room_id as string;
    const s2 = (await encontro(U.carla, U.diego)).room_id as string;
    await sair(U.ana, s1, U.ana, U.bruno);
    const s3 = (await encontro(U.ana, U.eva)).room_id as string;
    expect(s3).toBeTruthy();
    expect(s2).toBeTruthy();

    const todos = await matches();
    expect(todos).toHaveLength(3);
    expect(new Set(todos.map((m) => m.id)).size).toBe(3);
    expect(new Set(todos.map((m) => [m.user_a, m.user_b].sort().join("|"))).size).toBe(3);
    expect(await contar("study_chats")).toBe(3);
    expect(await d.sql(`select count(distinct match_id)::int as n from public.checklist_rooms`)).toEqual([{ n: 3 }]);
  });

  // ------------------------------------------------------------------ a migração recusa par repetido
  it("a migração RECUSA ser colada se achar o mesmo par duas vezes ('Existem matches repetidos'); sem apagar nada", async () => {
    const swipeAntes = (await d.sql<{ def: string }>(`select pg_get_functiondef('public.app_dupla_swipe(uuid,text,text)'::regprocedure) as def`))[0].def;
    try {
      // Como o índice já existe, derruba-se para fabricar o par repetido (A, B) e (B, A).
      await d.sql(`drop index public.study_matches_par_uniq`);
      await d.sql(`insert into public.study_matches (user_a, user_b) values ($1, $2), ($2, $1)`, [U.ana, U.bruno]);
      expect(await contar("study_matches")).toBe(2);

      const erro: any = await d.db.exec(SQL).then(() => null, (e) => e);
      expect(erro).not.toBeNull();
      expect(erro.message).toMatch(/Existem matches repetidos do mesmo par em study_matches\./);
      expect(erro.message).toMatch(/Junte-os antes de colar esta migração/);
      expect(erro.code).toBe("23505");

      // Nada foi apagado, o índice não voltou e a função de escolha não mudou.
      expect(await contar("study_matches")).toBe(2);
      expect(await d.sql(`select 1 from pg_indexes where indexname = 'study_matches_par_uniq'`)).toEqual([]);
      const swipeDepois = (await d.sql<{ def: string }>(`select pg_get_functiondef('public.app_dupla_swipe(uuid,text,text)'::regprocedure) as def`))[0].def;
      expect(swipeDepois).toBe(swipeAntes);

      // Resolvido o par (apaga-se a duplicata), a migração cola e o índice volta.
      await d.sql(`delete from public.study_matches where (user_a, user_b) = ($1, $2)`, [U.bruno, U.ana]);
      await d.db.exec(SQL);
      await d.db.exec(SQL_CREDITOS);
      expect(await d.sql(`select 1 from pg_indexes where indexname = 'study_matches_par_uniq'`)).toHaveLength(1);
      await expect(d.sql(`insert into public.study_matches (user_a, user_b) values ($1, $2)`, [U.bruno, U.ana])).rejects.toThrow(/study_matches_par_uniq/);
    } finally {
      // Banco do arquivo consistente no fim: o índice e as funções de volta, sem matches de teste.
      await d.sql(`delete from public.study_matches where (user_a, user_b) in (($1, $2), ($2, $1))`, [U.ana, U.bruno]);
      await d.db.exec(SQL);
      await d.db.exec(SQL_CREDITOS);
    }
    expect(await d.sql(`select 1 from pg_indexes where indexname = 'study_matches_par_uniq'`)).toHaveLength(1);
    expect((await d.sql<{ def: string }>(`select pg_get_functiondef('public.app_dupla_swipe(uuid,text,text)'::regprocedure) as def`))[0].def).toBe(swipeAntes);
  });
});
