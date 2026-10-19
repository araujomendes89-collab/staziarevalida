// @vitest-environment node
/**
 * Treino em Dupla (Stazia Match) · migração 013510, parte 1: UMA PESSOA, UMA SALA ABERTA, garantido no banco.
 * A tabela study_room_claims (user_id é a chave primária) e o gatilho checklist_rooms_claims, conferidos num Postgres em
 * memória (PGlite) com as regras reais (todas as migrações, em ordem). Com a cota de créditos desligada (o padrão), a
 * app_dupla_swipe da 013520 se comporta como a da 013510.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, U, addProfile, addStation, openDuplaDb, seen, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const MIGRACAO = "20261003013510_treino_dupla_integridade.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8");
// A 013510 refaz app_dupla_swipe sem crédito; a 013520 refaz de novo, com crédito. Quem cola a primeira cola a segunda em seguida.
const SQL_CREDITOS = fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003013520_treino_dupla_creditos_inicio.sql"), "utf8");
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const ABERTO = { aberto: true, planos: ["trial", "pro", "elite"] };
const JA_EM_SALA = /Você já está em uma sala\./;

const NOMES = ["ana", "bruno", "carla", "diego", "eva", "fabio", "gil"] as const;

describe("Migração 013510 — uma pessoa, uma sala aberta (study_room_claims e gatilho)", () => {
  let d: DuplaDb;

  const swipe = (de: string, para: string, direcao: "right" | "left" = "right", estacao?: string | null) =>
    d.rpc(de, "app_dupla_swipe", { p_to: para, p_direction: direcao, ...(estacao === undefined ? {} : { p_station_id: estacao }) });

  /** Banco limpo: sem salas (as reservas caem junto), sem escolhas e sem matches; perfis com sinal agora e plano de teste no prazo. */
  const montar = async () => {
    await d.sql(`delete from public.checklist_rooms`);
    await d.sql(`delete from public.study_swipes`);
    await d.sql(`delete from public.study_matches`);
    await d.sql(`delete from public.study_profiles`);
    for (const nome of NOMES) await addProfile(d.db, U[nome], { public_name: nome.toUpperCase(), role_pref: "any" });
    for (const nome of NOMES) await seen(d.db, U[nome]);
    for (const uid of Object.values(U)) await setPlan(d.db, uid, "trial", "trialing", daqui(7));
    await setDupla(d.db, ABERTO);
  };

  /** x e y formam uma sala pelo caminho real: y escolhe x primeiro (sem match), depois x escolhe y. Devolve a resposta da segunda escolha. */
  const formar = async (x: string, y: string) => {
    const primeira = await swipe(y, x);
    expect(primeira).toEqual({ matched: false });
    return swipe(x, y);
  };

  const abertas = (uid: string) =>
    d.sql<{ id: string }>(`select id from public.checklist_rooms where phase <> 'closed' and $1 = any (member_ids) order by created_at, id`, [uid]);
  const reservas = (uid: string) => d.sql<{ room_id: string }>(`select room_id from public.study_room_claims where user_id = $1`, [uid]);
  const contar = async (tabela: string) => (await d.sql<{ n: number }>(`select count(*)::int as n from public.${tabela}`))[0].n;
  /** Pessoas que aparecem em mais de uma sala aberta (tem de ser sempre vazio). */
  const emDuasSalas = () =>
    d.sql(`select u, count(*)::int as n from public.checklist_rooms r, unnest(r.member_ids) u where r.phase <> 'closed' group by u having count(*) > 1`);
  /** Envelhece uma sala sem o carimbo automático de updated_at (o gatilho checklist_rooms_stamp o refaria a "agora"). */
  const envelhecerSala = async (minutos: number) => {
    await d.sql(`alter table public.checklist_rooms disable trigger checklist_rooms_stamp`);
    try {
      await d.sql(`update public.checklist_rooms set updated_at = now() - ($1 || ' minutes')::interval`, [String(minutos)]);
    } finally {
      await d.sql(`alter table public.checklist_rooms enable trigger checklist_rooms_stamp`);
    }
  };

  beforeAll(async () => {
    d = await openDuplaDb();
    await addStation(d.db);
  }, 120_000);
  beforeEach(async () => {
    await montar();
  }, 60_000);
  afterAll(async () => {
    await d?.db.close();
  });

  // ------------------------------------------------------------------ a escolha
  it("A escolhe B e depois C (os dois já tinham escolhido A): só o primeiro forma match e sala; o segundo é { matched: false } sem gravar nada", async () => {
    expect(await swipe(U.bruno, U.ana)).toEqual({ matched: false });
    expect(await swipe(U.carla, U.ana)).toEqual({ matched: false });

    const primeiro = await swipe(U.ana, U.bruno);
    expect(primeiro.matched).toBe(true);
    const sala = primeiro.room_id as string;
    expect(await contar("study_matches")).toBe(1);
    expect(await contar("checklist_rooms")).toBe(1);
    expect(await contar("study_invites")).toBe(1);

    const segundo = await swipe(U.ana, U.carla);
    expect(segundo).toEqual({ matched: false });
    // Nada do segundo par ficou: nem match, nem sala, nem convite, nem reserva da Carla.
    expect(await contar("study_matches")).toBe(1);
    expect(await contar("checklist_rooms")).toBe(1);
    expect(await contar("study_invites")).toBe(1);
    expect(await reservas(U.carla)).toEqual([]);
    expect(await d.sql(`select 1 from public.study_matches where $1 in (user_a, user_b)`, [U.carla])).toEqual([]);

    // A Ana tem uma reserva só, a da primeira sala; a Carla segue livre.
    expect(await reservas(U.ana)).toEqual([{ room_id: sala }]);
    expect(await reservas(U.bruno)).toEqual([{ room_id: sala }]);
    expect(await d.sql(`select count(*)::int as n from public.study_room_claims where user_id = $1`, [U.ana])).toEqual([{ n: 1 }]);
    expect(await emDuasSalas()).toEqual([]);
  });

  it("corrida: escolhas que disputam a mesma pessoa ao mesmo tempo deixam no máximo uma sala aberta por pessoa", async () => {
    // Atenção: o PGlite roda uma consulta por vez, então o Promise.all é SERIALIZADO. Isto prova o resultado final (a regra
    // vale quando as escolhas competem), não o paralelismo real de duas transações; a corrida de verdade fica a cargo da
    // chave primária de study_room_claims e do bloqueio por par (pg_advisory_xact_lock), conferidos nos outros casos.
    for (const quem of [U.ana, U.carla, U.diego]) expect(await swipe(U.bruno, quem)).toEqual({ matched: false });

    const respostas = await Promise.all([swipe(U.ana, U.bruno), swipe(U.carla, U.bruno), swipe(U.diego, U.bruno)]);
    expect(respostas.filter((r) => r.matched)).toHaveLength(1);
    expect(respostas.filter((r) => !r.matched)).toHaveLength(2);

    expect(await abertas(U.bruno)).toHaveLength(1);
    expect(await reservas(U.bruno)).toHaveLength(1);
    expect(await emDuasSalas()).toEqual([]);
    expect(await contar("checklist_rooms")).toBe(1);
    expect(await contar("study_matches")).toBe(1);
    expect(await contar("study_invites")).toBe(1);
    expect(await contar("study_room_claims")).toBe(2); // Bruno e quem ganhou
  });

  it("aceitar dois convites: o aceite não cria sala nova e cada pessoa segue com uma reserva só", async () => {
    const r1 = (await formar(U.ana, U.bruno)).room_id as string; // convite para o Bruno
    const r2 = (await formar(U.carla, U.diego)).room_id as string; // convite para o Diego
    expect(await contar("checklist_rooms")).toBe(2);
    expect(await contar("study_room_claims")).toBe(4);

    const convite = async (uid: string) => (await d.rpc(uid, "app_dupla_invites")).invites as any[];
    const [i1] = await convite(U.bruno);
    const [i2] = await convite(U.diego);
    expect(i1.room_id).toBe(r1);
    expect(i2.room_id).toBe(r2);

    expect(await d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: i1.id, p_accept: true })).toEqual({ room_id: r1 });
    expect(await d.rpc(U.diego, "app_dupla_answer_invite", { p_invite_id: i2.id, p_accept: true })).toEqual({ room_id: r2 });

    expect(await contar("checklist_rooms")).toBe(2);
    expect(await contar("study_room_claims")).toBe(4);
    expect(await reservas(U.ana)).toEqual([{ room_id: r1 }]);
    expect(await reservas(U.bruno)).toEqual([{ room_id: r1 }]);
    expect(await reservas(U.carla)).toEqual([{ room_id: r2 }]);
    expect(await reservas(U.diego)).toEqual([{ room_id: r2 }]);
    expect(await emDuasSalas()).toEqual([]);
    expect((await d.sql(`select status from public.study_invites order by status`)).map((r) => r.status)).toEqual(["accepted", "accepted"]);
  });

  // ------------------------------------------------------------------ o banco recusa
  it("sala ABERTA a mais, inserida à mão com quem já está numa sala: 'Você já está em uma sala.' (23505, ALREADY_IN_SESSION) e o INSERT inteiro é desfeito", async () => {
    const r1 = (await formar(U.bruno, U.carla)).room_id as string;
    const salas = await contar("checklist_rooms");
    const reservasAntes = await contar("study_room_claims");

    // Ana (0a, a menor id) está livre e entra primeiro na ordem das reservas; Bruno já tem sala e derruba o INSERT inteiro.
    const erro: any = await d
      .sql(`insert into public.checklist_rooms (member_ids, phase) values (array[$1, $2]::uuid[], 'roles')`, [U.ana, U.bruno])
      .then(() => null, (e) => e);
    expect(erro).not.toBeNull();
    expect(erro.message).toMatch(JA_EM_SALA);
    expect(erro.code).toBe("23505");
    expect(erro.hint).toBe("ALREADY_IN_SESSION");

    // Nenhuma sala órfã, nenhuma reserva da Ana, as de antes intactas.
    expect(await contar("checklist_rooms")).toBe(salas);
    expect(await contar("study_room_claims")).toBe(reservasAntes);
    expect(await reservas(U.ana)).toEqual([]);
    expect(await reservas(U.bruno)).toEqual([{ room_id: r1 }]);

    // A ordem inversa dos membros dá o mesmo resultado.
    await expect(d.sql(`insert into public.checklist_rooms (member_ids, phase) values (array[$1, $2]::uuid[], 'roles')`, [U.carla, U.diego])).rejects.toThrow(JA_EM_SALA);
    expect(await reservas(U.diego)).toEqual([]);
    expect(await contar("checklist_rooms")).toBe(salas);
  });

  it("membros fora de ordem de UUID entram do mesmo jeito (as duas reservas)", async () => {
    const [{ id }] = await d.sql<{ id: string }>(`insert into public.checklist_rooms (member_ids, phase) values (array[$1, $2]::uuid[], 'roles') returning id`, [U.eva, U.ana]);
    expect((await d.sql(`select user_id from public.study_room_claims where room_id = $1 order by user_id`, [id])).map((r) => r.user_id)).toEqual([U.ana, U.eva]);
  });

  it("inserir uma sala já 'closed' não reserva ninguém e não impede a pessoa de entrar noutra", async () => {
    await d.sql(`insert into public.checklist_rooms (member_ids, phase, closed_reason) values (array[$1, $2]::uuid[], 'closed', 'saiu')`, [U.ana, U.bruno]);
    expect(await contar("study_room_claims")).toBe(0);
    const r = await formar(U.ana, U.carla);
    expect(r.matched).toBe(true);
    expect(await reservas(U.ana)).toEqual([{ room_id: r.room_id }]);
  });

  // ------------------------------------------------------------------ fechar solta
  describe("fechar a sala solta as duas pessoas", () => {
    /** Ana e Bruno numa sala; depois de fechada, as reservas somem e cada um forma uma sala nova com outra pessoa. */
    const soltaEFormaOutra = async (sala: string) => {
      expect((await d.sql(`select phase from public.checklist_rooms where id = $1`, [sala])).map((r) => r.phase)).toEqual(["closed"]);
      expect(await reservas(U.ana)).toEqual([]);
      expect(await reservas(U.bruno)).toEqual([]);
      expect(await contar("study_room_claims")).toBe(0);
      await seen(d.db, U.ana);
      await seen(d.db, U.bruno);
      const a = await formar(U.ana, U.carla);
      const b = await formar(U.bruno, U.diego);
      expect(a.matched).toBe(true);
      expect(b.matched).toBe(true);
      expect(a.room_id).not.toBe(sala);
      expect(await reservas(U.ana)).toEqual([{ room_id: a.room_id }]);
      expect(await reservas(U.bruno)).toEqual([{ room_id: b.room_id }]);
      expect(await emDuasSalas()).toEqual([]);
    };

    it("sair (app_dupla_leave)", async () => {
      const sala = (await formar(U.ana, U.bruno)).room_id as string;
      expect(await contar("study_room_claims")).toBe(2);
      await d.rpc(U.ana, "app_dupla_leave", { p_room_id: sala });
      expect(await d.sql(`select closed_reason from public.checklist_rooms where id = $1`, [sala])).toEqual([{ closed_reason: "saiu" }]);
      await soltaEFormaOutra(sala);
    });

    it("recusar o convite (app_dupla_answer_invite com accept = false)", async () => {
      const sala = (await formar(U.ana, U.bruno)).room_id as string;
      const [convite] = (await d.rpc(U.bruno, "app_dupla_invites")).invites as any[];
      expect(await d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: convite.id, p_accept: false })).toEqual({ room_id: null });
      expect(await d.sql(`select closed_reason from public.checklist_rooms where id = $1`, [sala])).toEqual([{ closed_reason: "convite_recusado" }]);
      await soltaEFormaOutra(sala);
    });

    it("convite vencido: a varredura (dupla_sweep, disparada por app_dupla_invites) fecha a sala", async () => {
      const sala = (await formar(U.ana, U.bruno)).room_id as string;
      await d.sql(`update public.study_invites set expires_at = now() - interval '1 minute'`);
      expect((await d.rpc(U.carla, "app_dupla_invites")).invites).toEqual([]);
      expect(await d.sql(`select closed_reason from public.checklist_rooms where id = $1`, [sala])).toEqual([{ closed_reason: "convite_expirado" }]);
      await soltaEFormaOutra(sala);
    });

    it("sem sinal há mais de 15 minutos: a varredura (disparada pelo baralho) fecha a sala", async () => {
      const sala = (await formar(U.ana, U.bruno)).room_id as string;
      // A sala só fecha por falta de sinal depois que o convite deixou de estar pendente (aceito aqui) e os dois sumiram.
      const [convite] = (await d.rpc(U.bruno, "app_dupla_invites")).invites as any[];
      await d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: convite.id, p_accept: true });
      await envelhecerSala(20);
      await d.sql(`update public.study_profiles set last_seen_at = now() - interval '20 minutes' where user_id in ($1, $2)`, [U.ana, U.bruno]);
      // Quem lê o baralho é outra pessoa (Carla), para não renovar o sinal dos dois.
      await d.rpc(U.carla, "app_dupla_deck");
      expect(await d.sql(`select closed_reason from public.checklist_rooms where id = $1`, [sala])).toEqual([{ closed_reason: "sem_sinal" }]);
      await soltaEFormaOutra(sala);
    });

    it("com sinal de um dos dois, a varredura NÃO fecha e as reservas ficam", async () => {
      const sala = (await formar(U.ana, U.bruno)).room_id as string;
      await envelhecerSala(20);
      await d.sql(`update public.study_profiles set last_seen_at = now() - interval '20 minutes' where user_id = $1`, [U.ana]);
      await d.rpc(U.carla, "app_dupla_deck"); // o Bruno ainda tem sinal recente
      expect(await d.sql(`select phase from public.checklist_rooms where id = $1`, [sala])).toEqual([{ phase: "roles" }]);
      expect(await contar("study_room_claims")).toBe(2);
    });
  });

  it("a fase 'result' continua prendendo as duas pessoas; só 'closed' solta", async () => {
    const sala = (await formar(U.ana, U.bruno)).room_id as string;
    await d.sql(`update public.checklist_rooms set phase = 'result' where id = $1`, [sala]);
    expect(await reservas(U.ana)).toEqual([{ room_id: sala }]);
    expect(await reservas(U.bruno)).toEqual([{ room_id: sala }]);

    // Quem está em 'result' não forma outra sala, e quem tentou entrar em outra à mão também é recusado.
    await swipe(U.carla, U.ana);
    expect(await swipe(U.ana, U.carla)).toEqual({ matched: false });
    await expect(d.sql(`insert into public.checklist_rooms (member_ids, phase) values (array[$1, $2]::uuid[], 'roles')`, [U.ana, U.carla])).rejects.toThrow(JA_EM_SALA);
    expect(await contar("checklist_rooms")).toBe(1);

    await d.rpc(U.ana, "app_dupla_leave", { p_room_id: sala });
    expect(await contar("study_room_claims")).toBe(0);
    await seen(d.db, U.ana);
    expect((await swipe(U.ana, U.carla)).matched).toBe(true);
  });

  it("reabrir uma sala fechada (phase de 'closed' para aberta) reserva de novo; se a pessoa já estiver em outra, é recusado", async () => {
    const sala = (await formar(U.ana, U.bruno)).room_id as string;
    await d.rpc(U.ana, "app_dupla_leave", { p_room_id: sala });
    expect(await contar("study_room_claims")).toBe(0);
    await d.sql(`update public.checklist_rooms set phase = 'roles', closed_reason = null where id = $1`, [sala]);
    expect(await reservas(U.ana)).toEqual([{ room_id: sala }]);

    await d.rpc(U.ana, "app_dupla_leave", { p_room_id: sala });
    await seen(d.db, U.ana);
    const outra = (await formar(U.ana, U.carla)).room_id as string;
    await expect(d.sql(`update public.checklist_rooms set phase = 'roles', closed_reason = null where id = $1`, [sala])).rejects.toThrow(JA_EM_SALA);
    expect(await d.sql(`select phase from public.checklist_rooms where id = $1`, [sala])).toEqual([{ phase: "closed" }]);
    expect(await reservas(U.ana)).toEqual([{ room_id: outra }]);
  });

  // ------------------------------------------------------------------ preenchimento
  it("preenchimento: a sala aberta mais antiga fica com a pessoa, a outra fecha ('sem_sinal'), a terceira fica; colar de novo não muda nada", async () => {
    await d.sql(`alter table public.checklist_rooms disable trigger checklist_rooms_claims`);
    let antiga: string, nova: string, outras: string;
    try {
      const inserir = async (a: string, b: string, minutos: number) =>
        (await d.sql<{ id: string }>(
          `insert into public.checklist_rooms (member_ids, phase, created_at) values (array[$1, $2]::uuid[], 'roles', now() - ($3 || ' minutes')::interval) returning id`,
          [a, b, String(minutos)]
        ))[0].id;
      antiga = await inserir(U.ana, U.bruno, 60);
      nova = await inserir(U.bruno, U.carla, 30); // disputa o Bruno com a mais antiga
      outras = await inserir(U.diego, U.eva, 10);
      await d.sql(`delete from public.study_room_claims`);
    } finally {
      await d.sql(`alter table public.checklist_rooms enable trigger checklist_rooms_claims`);
    }

    const retrato = async () => ({
      salas: await d.sql(`select id, member_ids, phase, closed_reason, rev from public.checklist_rooms order by id`),
      reservas: await d.sql(`select user_id, room_id from public.study_room_claims order by user_id`),
    });

    await d.db.exec(SQL);
    await d.db.exec(SQL_CREDITOS);

    expect(await d.sql(`select id, phase, closed_reason, rev from public.checklist_rooms order by created_at`)).toEqual([
      { id: antiga!, phase: "roles", closed_reason: null, rev: 0 },
      { id: nova!, phase: "closed", closed_reason: "sem_sinal", rev: 1 }, // fechar soma 1 ao rev
      { id: outras!, phase: "roles", closed_reason: null, rev: 0 },
    ]);
    expect(await d.sql(`select user_id, room_id from public.study_room_claims order by user_id`)).toEqual([
      { user_id: U.ana, room_id: antiga! },
      { user_id: U.bruno, room_id: antiga! },
      { user_id: U.diego, room_id: outras! },
      { user_id: U.eva, room_id: outras! },
    ]);
    // A pessoa que só estava na sala fechada (Carla) fica livre, e reservas = salas abertas.
    expect(await reservas(U.carla)).toEqual([]);
    expect(await d.sql(`select count(*)::int as n from public.study_room_claims c join public.checklist_rooms r on r.id = c.room_id where r.phase = 'closed'`)).toEqual([{ n: 0 }]);
    expect(await emDuasSalas()).toEqual([]);

    const depois = await retrato();
    await d.db.exec(SQL);
    await d.db.exec(SQL_CREDITOS);
    expect(await retrato()).toEqual(depois);
  });

  // ------------------------------------------------------------------ colar duas vezes
  it("colar a migração duas vezes dá o mesmo banco (funções com permissões, índices, políticas, gatilhos, colunas e dados)", async () => {
    // Uma sala viva para a colagem não ter só tabelas vazias.
    await formar(U.ana, U.bruno);
    const retrato = async () => ({
      funcoes: await d.sql(`select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`),
      politicas: await d.sql(`select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' order by 1, 2`),
      regras: await d.sql(`select conrelid::regclass::text as t, conname, pg_get_constraintdef(oid) as def from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
      indices: await d.sql(`select indexname, indexdef from pg_indexes where schemaname = 'public' order by 1`),
      gatilhos: await d.sql(`select tgrelid::regclass::text as t, tgname, tgenabled, pg_get_triggerdef(oid) as def from pg_trigger where not tgisinternal order by 1, 2`),
      colunas: await d.sql(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' order by 1, ordinal_position`),
      rls: await d.sql(`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`),
      permissoes: await d.sql(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'study_room_claims' order by 1, 2, 3`),
      dados: await d.sql(`select key, value from public.app_settings order by key`),
      reservas: await d.sql(`select user_id, room_id from public.study_room_claims order by user_id`),
    });
    const antes = await retrato();
    // A 013510 não mexe na lista de chaves de app_settings (a linha 'creditos' fica), então não há o que apagar antes de colar.
    await d.db.exec(SQL);
    // (A 013520 refaz app_dupla_swipe a partir desta; colada em seguida, a função volta igual.)
    await d.db.exec(SQL_CREDITOS);
    expect(await retrato()).toEqual(antes);

    // A função de apoio e a de escolha não são chamáveis pelo navegador sem passar pelo porteiro.
    const acl = Object.fromEntries((antes.funcoes as any[]).map((f) => [f.id, f.acl]));
    expect(acl["dupla_room_claims()"] ?? "").not.toContain("authenticated");
    expect(acl["dupla_room_claims()"] ?? "").not.toContain("anon");
    await expect(d.asUser(U.ana, `select public.dupla_room_claims()`)).rejects.toThrow(/permission denied/);
  });

  // ------------------------------------------------------------------ a tabela
  it("study_room_claims: RLS ligada, sem política; o aluno não lê nem escreve", async () => {
    const sala = (await formar(U.ana, U.bruno)).room_id as string;
    expect(await d.sql(`select relrowsecurity from pg_class where oid = 'public.study_room_claims'::regclass`)).toEqual([{ relrowsecurity: true }]);
    expect(await d.sql(`select policyname from pg_policies where schemaname = 'public' and tablename = 'study_room_claims'`)).toEqual([]);

    await expect(d.asUser(U.ana, `select * from public.study_room_claims`)).rejects.toThrow(/permission denied/);
    await expect(d.asUser(U.ana, `insert into public.study_room_claims (user_id, room_id) values ($1, $2)`, [U.carla, sala])).rejects.toThrow(/permission denied/);
    await expect(d.asUser(U.ana, `delete from public.study_room_claims`)).rejects.toThrow(/permission denied/);
    await expect(d.asUser(U.ana, `update public.study_room_claims set room_id = room_id`)).rejects.toThrow(/permission denied/);
    // Nem o administrador do app (papel authenticated com a função de admin) lê direto.
    await expect(d.asUser(U.admin, `select * from public.study_room_claims`)).rejects.toThrow(/permission denied/);
    expect(await contar("study_room_claims")).toBe(2);
  });

  it("excluir a conta de uma pessoa apaga a reserva dela (e só a dela)", async () => {
    const extra = "00000000-0000-4000-8000-0000000000f1";
    await d.db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'extra@teste.dev', '{}'::jsonb)`, [extra]);
    try {
      const [{ id }] = await d.sql<{ id: string }>(`insert into public.checklist_rooms (member_ids, phase) values (array[$1, $2]::uuid[], 'roles') returning id`, [U.ana, extra]);
      expect(await reservas(extra)).toEqual([{ room_id: id }]);

      await d.sql(`delete from auth.users where id = $1`, [extra]);
      expect(await reservas(extra)).toEqual([]);
      expect(await reservas(U.ana)).toEqual([{ room_id: id }]); // a da Ana fica até a sala fechar
    } finally {
      await d.sql(`delete from auth.users where id = $1`, [extra]);
    }
  });

  it("o gatilho reserva em ordem crescente de UUID (a definição da função tem 'order by' sobre os membros)", async () => {
    const [{ def }] = await d.sql<{ def: string }>(`select pg_get_functiondef('public.dupla_room_claims()'::regprocedure) as def`);
    expect(def).toMatch(/select distinct x as u from unnest\(new\.member_ids\) x where x is not null order by x/);
    const [{ tgdef }] = await d.sql<{ tgdef: string }>(`select pg_get_triggerdef(oid) as tgdef from pg_trigger where tgname = 'checklist_rooms_claims'`);
    expect(tgdef).toMatch(/AFTER INSERT OR UPDATE OF phase ON public\.checklist_rooms FOR EACH ROW/);
  });
});
