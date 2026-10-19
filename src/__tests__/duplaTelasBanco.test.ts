// @vitest-environment node
/**
 * Treinamento em Dupla · Etapa 3 · Tarefa 6: a migração 9760 (supabase/migrations/…9760_treino_dupla_telas.sql).
 * Leituras das telas (Banco de estações, perfil de estudo, estado da sala, marcações, resultado) e a chave do painel,
 * conferidas num Postgres em memória (PGlite) com as regras reais (todas as migrações, em ordem).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, STATION, U, addProfile, addSession, addStation, makeRoom, openDuplaDb, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const MIGRACAO = "20261003013310_treino_dupla_telas.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8");
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const minutosAtras = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const ABERTO = { aberto: true, planos: ["trial", "pro", "elite"] };
const SEM_ACESSO = /Sem acesso ao Treinamento em Dupla\./;

describe("Migração 9760 — leituras das telas, perfil de estudo e chave no painel", () => {
  let d: DuplaDb;

  /** Estação de teste aprovada com o id e o nome dados (conteúdo igual ao de STATION: 3 itens, 2 impressos). */
  const estacao = (id: string, extra: Record<string, unknown> = {}, rev: { medical_review?: string } = {}) =>
    addStation(d.db, { ...STATION, id, name: `Estação ${id}`, ...extra }, rev);

  beforeAll(async () => {
    d = await openDuplaDb();
    for (const uid of Object.values(U)) await setPlan(d.db, uid, "trial", "trialing", daqui(7));
    await setDupla(d.db, ABERTO);
    await addStation(d.db); // teste-dupla-e01
  }, 120_000);
  afterAll(async () => {
    await d?.db.close();
  });

  // ------------------------------------------------------------------ Banco de estações
  it("estações: aluno vê só aprovadas, na ordem da prova, com número e edição tirados do id", async () => {
    const ids = ["autoral-x", "inep-2020-e03", "inep-2022-1r-e10", "inep-2024-1-e02", "inep-2024-1-e01", "inep-2022-1-e05"];
    for (const id of ids) await estacao(id, { institution: id.startsWith("inep") ? "INEP" : null });
    await estacao("inep-2025-1-e01", { institution: "INEP" }, { medical_review: "pending" });

    const lista: any[] = await d.rpc(U.ana, "app_dupla_stations");
    const meus = lista.filter((s) => ids.includes(s.id));
    expect(meus.map((s) => s.id)).toEqual(["inep-2024-1-e01", "inep-2024-1-e02", "inep-2022-1-e05", "inep-2022-1r-e10", "inep-2020-e03", "autoral-x"]);
    const por = Object.fromEntries(meus.map((s) => [s.id, s]));
    expect(meus.map((s) => s.number)).toEqual([1, 2, 5, 10, 3, null]);
    expect(meus.map((s) => s.edition)).toEqual(["2024/1", "2024/1", "2022/1", "2022/1", "2020", null]);
    expect(por["inep-2022-1r-e10"].reapplication).toBe(true);
    expect(por["inep-2022-1-e05"].reapplication).toBe(false);
    expect(por["inep-2024-1-e01"]).toMatchObject({
      name: "Estação inep-2024-1-e01", topic: "Estação de teste", area: "Clínica Médica", area_code: "CM", institution: "INEP",
      duration_ms: 600000, is_pro_only: false, criteria_count: 3, pressing_count: 2, my_last_pct: null, average_pct: null, evaluations: 0,
    });
    expect(por["autoral-x"].institution).toBeNull();
    // A pendente não aparece para o aluno; a equipe vê.
    expect(lista.some((s) => s.id === "inep-2025-1-e01")).toBe(false);
    const daEquipe: any[] = await d.rpc(U.admin, "app_dupla_stations");
    expect(daEquipe.some((s) => s.id === "inep-2025-1-e01")).toBe(true);
    // Sem acesso (chave desligada) ou sem login: recusa.
    await setDupla(d.db, { aberto: false, planos: ["pro", "elite"] });
    await expect(d.rpc(U.ana, "app_dupla_stations")).rejects.toThrow(SEM_ACESSO);
    await expect(d.rpc(null, "app_dupla_stations")).rejects.toThrow();
    await setDupla(d.db, ABERTO);
  });

  // ------------------------------------------------------------------ perfil de estudo
  it("perfil: valores iniciais do nome e da edição-alvo; salvar valida, ordena e só muda o que veio", async () => {
    await d.sql(`update public.profiles set name = 'Ana Souza', target_edition = '2027/1' where id = $1`, [U.ana]);
    const inicial = await d.rpc(U.ana, "app_dupla_profile");
    expect(inicial).toEqual({ profile: null, defaults: { public_name: "Ana Souza", exam: "2027/1" }, stats: { done: 0, avg: null } });

    const salvo = await d.rpc(U.ana, "app_dupla_save_profile", {
      p_profile: { public_name: "  Ana S.  ", days: ["Qua", "Seg", "Qua"], shifts: ["Noite", "Manhã"], areas: ["PED", "CM"], exam: "2027/1", school: "UFPR", bio: "Oi" },
    });
    expect(salvo.profile).toMatchObject({
      public_name: "Ana S.", days: ["Seg", "Qua"], shifts: ["Manhã", "Noite"], areas: ["CM", "PED"], exam: "2027/1", school: "UFPR", bio: "Oi",
      role_pref: "any", pace: "cronometrado", radar_visible: true, show_school: true, show_stats: true, city: null, goal: null,
    });
    expect(salvo.profile).not.toHaveProperty("user_id");
    expect(salvo.profile).not.toHaveProperty("status");
    expect(salvo.profile).not.toHaveProperty("last_seen_at");
    expect(salvo.defaults).toEqual({ public_name: "Ana Souza", exam: "2027/1" });

    // Só role_pref: o resto fica.
    const depois = await d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { role_pref: "med" } });
    expect(depois.profile).toMatchObject({ public_name: "Ana S.", role_pref: "med", days: ["Seg", "Qua"], areas: ["CM", "PED"], school: "UFPR" });
    // Limpar um campo de texto (nulo ou vazio) e ligar/desligar a privacidade.
    const limpo = await d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { school: "", exam: null, show_stats: false, radar_visible: false } });
    expect(limpo.profile).toMatchObject({ school: null, exam: null, show_stats: false, radar_visible: false, show_school: true });
    // Chaves que não são do perfil (status, user_id, sinal) não mudam nada.
    await d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { status: "livre", last_seen_at: "2020-01-01T00:00:00Z", user_id: U.bruno } });
    const [linha] = await d.sql(`select user_id, status, last_seen_at from public.study_profiles where user_id = $1`, [U.ana]);
    expect(linha).toMatchObject({ user_id: U.ana, status: "fora", last_seen_at: null });
    expect(await d.sql(`select 1 from public.study_profiles where user_id = $1`, [U.bruno])).toHaveLength(0);
  });

  it("perfil: cada campo inválido recusa com a mensagem em português e não grava", async () => {
    const salvar = (p: Record<string, unknown>) => d.rpc(U.bruno, "app_dupla_save_profile", { p_profile: p });
    await expect(salvar({ role_pref: "med" })).rejects.toThrow("Informe como você quer aparecer para os colegas.");
    await expect(salvar({ public_name: "ab" })).rejects.toThrow("Informe como você quer aparecer para os colegas.");
    await expect(salvar({ public_name: "x".repeat(41) })).rejects.toThrow("Nome: máximo de 40 caracteres.");
    const ok = { public_name: "Bruno Lima" };
    await expect(salvar({ ...ok, bio: "x".repeat(161) })).rejects.toThrow("Bio: máximo de 160 caracteres.");
    await expect(salvar({ ...ok, areas: ["CM", "XX"] })).rejects.toThrow("Área inválida.");
    await expect(salvar({ ...ok, role_pref: "medico" })).rejects.toThrow("Papel inválido.");
    await expect(salvar({ ...ok, pace: "rapido" })).rejects.toThrow("Ritmo inválido.");
    await expect(salvar({ ...ok, days: ["Seg", "Feriado"] })).rejects.toThrow("Dia inválido.");
    await expect(salvar({ ...ok, shifts: ["Madrugada"] })).rejects.toThrow("Turno inválido.");
    await expect(salvar({ ...ok, exam: "2027" })).rejects.toThrow("Prova inválida.");
    await expect(salvar({ ...ok, exam: "2027/3" })).rejects.toThrow("Prova inválida.");
    for (const campo of ["school", "city", "goal"]) {
      await expect(salvar({ ...ok, [campo]: "x".repeat(81) })).rejects.toThrow("Instituição, cidade e objetivo: até 80 caracteres.");
    }
    await expect(salvar({ ...ok, areas: "CM" })).rejects.toThrow("Dados do perfil inválidos.");
    await expect(salvar({ ...ok, show_stats: "sim" })).rejects.toThrow("Dados do perfil inválidos.");
    expect(await d.sql(`select 1 from public.study_profiles where user_id = $1`, [U.bruno])).toHaveLength(0);
    // Dados limite entram: nome com 3 e com 40 caracteres, bio com 160.
    expect((await salvar({ public_name: "Bru", bio: "x".repeat(160) })).profile.public_name).toBe("Bru");
    expect((await salvar({ public_name: "y".repeat(40) })).profile.public_name).toHaveLength(40);
    // Sem acesso: recusa.
    await setDupla(d.db, { aberto: false, planos: ["pro", "elite"] });
    await expect(salvar({ public_name: "Bruno Lima" })).rejects.toThrow(SEM_ACESSO);
    await expect(d.rpc(U.bruno, "app_dupla_profile")).rejects.toThrow(SEM_ACESSO);
    await setDupla(d.db, ABERTO);
    await d.sql(`delete from public.study_profiles where user_id = $1`, [U.bruno]);
  });

  it("perfil: estatística própria das sessões como candidato", async () => {
    const sala = () => makeRoom(d.db, { members: [U.diego, U.eva], phase: "closed" });
    await addSession(d.db, { room: await sala(), round: 1, doctor: U.diego, actor: U.eva, station: STATION.id, correctness: 60 });
    await addSession(d.db, { room: await sala(), round: 1, doctor: U.diego, actor: U.eva, station: STATION.id, correctness: 85 });
    await addSession(d.db, { room: await sala(), round: 1, doctor: U.eva, actor: U.diego, station: STATION.id, correctness: 10 }); // Diego avaliou: não conta
    const diego = await d.rpc(U.diego, "app_dupla_profile");
    expect(diego.stats).toEqual({ done: 2, avg: 7.25 });
    expect((await d.rpc(U.eva, "app_dupla_profile")).stats).toEqual({ done: 1, avg: 1 });
    expect((await d.rpc(U.gil, "app_dupla_profile")).stats).toEqual({ done: 0, avg: null });
  });

  it("estações: 'Sua última nota' é a última como candidato; 'Média geral' só com 5 avaliações", async () => {
    await estacao("inep-2023-1-e01");
    await estacao("inep-2023-1-e02");
    const sala = () => makeRoom(d.db, { members: [U.ana, U.bruno], phase: "closed" });
    // e01: Ana 60 e depois 72,5 (última = 73); só 2 avaliações → sem média.
    await addSession(d.db, { room: await sala(), round: 1, doctor: U.ana, actor: U.bruno, station: "inep-2023-1-e01", correctness: 60, finishedAt: minutosAtras(50) });
    await addSession(d.db, { room: await sala(), round: 1, doctor: U.ana, actor: U.bruno, station: "inep-2023-1-e01", correctness: 72.5, finishedAt: minutosAtras(40) });
    // e02: cinco avaliações de candidatos diferentes (e uma de Ana como avaliadora, que não conta como dela).
    for (const [doctor, nota, ago] of [[U.ana, 60, 90], [U.carla, 72.5, 80], [U.diego, 80, 70], [U.eva, 90, 60], [U.fabio, 50, 30]] as const) {
      await addSession(d.db, { room: await sala(), round: 1, doctor, actor: U.bruno, station: "inep-2023-1-e02", correctness: nota, finishedAt: minutosAtras(ago) });
    }
    await addSession(d.db, { room: await sala(), round: 1, doctor: U.bruno, actor: U.ana, station: "inep-2023-1-e02", correctness: 10, finishedAt: minutosAtras(10) });

    const porId = async (uid: string) => Object.fromEntries(((await d.rpc(uid, "app_dupla_stations")) as any[]).map((s) => [s.id, s]));
    const ana = await porId(U.ana);
    expect(ana["inep-2023-1-e01"]).toMatchObject({ my_last_pct: 73, average_pct: null, evaluations: 2 });
    // e02: Ana foi candidata uma vez (60); a avaliação em que ela foi avaliadora não vira nota dela. 6 avaliações no total.
    expect(ana["inep-2023-1-e02"]).toMatchObject({ my_last_pct: 60, evaluations: 6 });
    expect(ana["inep-2023-1-e02"].average_pct).toBe(60.4); // (60+72,5+80+90+50+10)/6 = 60,4
    const fabio = await porId(U.fabio);
    expect(fabio["inep-2023-1-e02"].my_last_pct).toBe(50);
    expect(fabio["inep-2023-1-e01"].my_last_pct).toBeNull();
    // Exatamente 5 avaliações: média com uma casa.
    await estacao("inep-2023-1-e03");
    for (const [doctor, nota] of [[U.ana, 60], [U.carla, 72.5], [U.diego, 80], [U.eva, 90], [U.fabio, 50]] as const) {
      await addSession(d.db, { room: await sala(), round: 1, doctor, actor: U.bruno, station: "inep-2023-1-e03", correctness: nota, finishedAt: minutosAtras(20) });
    }
    expect((await porId(U.gil))["inep-2023-1-e03"]).toMatchObject({ average_pct: 70.5, evaluations: 5, my_last_pct: null });
  });

  // ------------------------------------------------------------------ sala
  describe("estado da sala", () => {
    const perfis = async () => {
      await addProfile(d.db, U.carla, { public_name: "Carla Dias", role_pref: "med", last_seen_at: new Date().toISOString() });
      await addProfile(d.db, U.fabio, { public_name: "Fábio Nunes Prado", role_pref: "any", last_seen_at: minutosAtras(0.25) });
    };
    const matchId = async () => (await d.sql<{ id: string }>(`insert into public.study_matches (user_a, user_b) values ($1, $2) returning id`, [U.fabio, U.carla]))[0].id;

    it("estado de cada membro com papéis, nomes, prontidão e faixa do match; mesmo rev → null; não membro não vê", async () => {
      await perfis();
      const match = await matchId();
      const sala = await makeRoom(d.db, {
        members: [U.carla, U.fabio], phase: "roles", candidate: U.carla, evaluator: U.fabio,
        extra: { match_id: match, confirmed_ids: [U.carla], ready_ids: [U.fabio], connected_ids: [U.carla, U.fabio], rev: 4, duration_ms: 480000 },
      });
      const carla = await d.rpc(U.carla, "app_dupla_room", { p_room_id: sala });
      expect(carla).toMatchObject({
        id: sala, rev: 4, phase: "roles", round: 1, duration_ms: null, station_ready: true, porta: 1, invite_pending: false, call_link: null, started_at: null,
        ends_at: null, paused_left_ms: null, paused_at: null, finished_at: null, released_pressings: [], closed_reason: null, closed_by: null,
        station: null, // fluxo simples (014140): antes de começar, nada da estação à candidata (só a porta)
        me: { user_id: U.carla, public_name: "Carla Dias", role: "candidate", confirmed: true, connected: true, ready: false },
        partner: { user_id: U.fabio, public_name: "Fábio Nunes Prado", role: "evaluator", confirmed: false, connected: true, ready: true },
        match_note: "Definido pelo match: você quer ser médico(a) e Fábio topa qualquer papel. Vocês ainda podem trocar.",
      });
      expect(new Date(carla.server_now).getTime()).toBeGreaterThan(Date.now() - 60_000);
      expect(carla.partner.seen_ms_ago).toBeGreaterThanOrEqual(14_000);
      expect(carla.partner.seen_ms_ago).toBeLessThan(120_000);
      // Etapa P (012900) e fluxo simples (014140): antes de começar, a candidata não recebe nada da estação; o avaliador recebe.
      expect(carla.station).toBeNull();
      const fabio = await d.rpc(U.fabio, "app_dupla_room", { p_room_id: sala });
      expect(fabio.station).toMatchObject({ id: "teste-dupla-e01", name: STATION.name, label: "Estação" });
      expect(fabio.me).toMatchObject({ user_id: U.fabio, role: "evaluator", confirmed: false, ready: true });
      expect(fabio.partner).toMatchObject({ user_id: U.carla, public_name: "Carla Dias", role: "candidate", confirmed: true });
      expect(fabio.match_note).toBe("Definido pelo match: você topa qualquer papel e Carla quer ser médico(a). Vocês ainda podem trocar.");

      // Mesmo rev → nada (null); rev antigo ou sem rev → estado completo.
      expect(await d.rpc(U.carla, "app_dupla_room", { p_room_id: sala, p_since_rev: 4 })).toBeNull();
      expect((await d.rpc(U.carla, "app_dupla_room", { p_room_id: sala, p_since_rev: 3 })).rev).toBe(4);
      // Quem não é da sala não vê (nem a equipe), e sem acesso ao módulo ninguém vê.
      await expect(d.rpc(U.ana, "app_dupla_room", { p_room_id: sala })).rejects.toThrow("Sala não encontrada.");
      await expect(d.rpc(U.admin, "app_dupla_room", { p_room_id: sala })).rejects.toThrow("Sala não encontrada.");
      await expect(d.rpc(U.ana, "app_dupla_room", { p_room_id: "00000000-0000-4000-8000-0000000000ff" })).rejects.toThrow("Sala não encontrada.");
      await expect(d.rpc(null, "app_dupla_room", { p_room_id: sala })).rejects.toThrow();

      // A faixa só aparece na rodada 1, na fase dos papéis, na sala do match e quando houve sugestão.
      const semFaixa = async (extra: Record<string, unknown>, phase: any = "roles") => {
        const s = await makeRoom(d.db, { members: [U.carla, U.fabio], phase, candidate: U.carla, evaluator: U.fabio, extra });
        return (await d.rpc(U.carla, "app_dupla_room", { p_room_id: s })).match_note;
      };
      expect(await semFaixa({ match_id: match, round: 2 })).toBeNull();
      expect(await semFaixa({ match_id: match }, "setup")).toBeNull();
      expect(await semFaixa({})).toBeNull();
      await d.sql(`update public.study_profiles set role_pref = 'any' where user_id = $1`, [U.carla]);
      expect(await semFaixa({ match_id: match })).toBeNull(); // os dois "qualquer": sem sugestão
      await d.sql(`update public.study_profiles set role_pref = 'med' where user_id = $1`, [U.carla]);
    });

    it("convite pendente e relógio gravados aparecem no estado", async () => {
      const sala = await makeRoom(d.db, {
        members: [U.carla, U.fabio], phase: "running", candidate: U.carla, evaluator: U.fabio, station: null,
        extra: { started_at: minutosAtras(2), ends_at: daqui(0.01), released_pressings: ["p1"], call_link: "https://meet.example.com/abc", paused_total_ms: 5000 },
      });
      const e = await d.rpc(U.carla, "app_dupla_room", { p_room_id: sala });
      expect(e).toMatchObject({ phase: "running", station: null, duration_ms: null, released_pressings: ["p1"], call_link: "https://meet.example.com/abc" });
      expect(e.started_at).toBeTruthy();
      expect(e.ends_at).toBeTruthy();
      // Convite pendente no prazo.
      const s2 = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "roles" });
      await d.sql(`insert into public.study_invites (from_user, to_user, room_id) values ($1, $2, $3)`, [U.fabio, U.carla, s2]);
      expect((await d.rpc(U.carla, "app_dupla_room", { p_room_id: s2 })).invite_pending).toBe(true);
      expect((await d.rpc(U.fabio, "app_dupla_room", { p_room_id: s2 })).invite_pending).toBe(true);
    });

    it("parceiro que excluiu a conta aparece como 'Conta excluída'", async () => {
      await addProfile(d.db, U.gil, { public_name: "Gil Prado" });
      const sala = await makeRoom(d.db, { members: [U.gil, U.carla], phase: "roles", candidate: U.gil, evaluator: U.carla });
      expect((await d.rpc(U.carla, "app_dupla_room", { p_room_id: sala })).partner).toMatchObject({ user_id: U.gil, public_name: "Gil Prado", role: "candidate" });
      await d.sql(`delete from auth.users where id = $1`, [U.gil]);
      const depois = await d.rpc(U.carla, "app_dupla_room", { p_room_id: sala });
      expect(depois.partner).toMatchObject({ user_id: null, public_name: "Conta excluída", seen_ms_ago: null });
      expect(depois.me.role).toBe("evaluator");
    });

    it("quem encerrou aparece só quando a pessoa saiu ou recusou", async () => {
      const fechada = async (reason: string, quem: string | null) =>
        (await d.rpc(U.carla, "app_dupla_room", {
          p_room_id: await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "closed", extra: { closed_reason: reason, updated_by: quem } }),
        })).closed_by;
      expect(await fechada("saiu", U.fabio)).toEqual({ user_id: U.fabio, public_name: "Fábio Nunes Prado", me: false });
      expect(await fechada("saiu", U.carla)).toEqual({ user_id: U.carla, public_name: "Carla Dias", me: true });
      expect(await fechada("convite_recusado", U.fabio)).toMatchObject({ me: false });
      expect(await fechada("convite_expirado", U.fabio)).toBeNull();
      expect(await fechada("sem_sinal", U.fabio)).toBeNull();
      expect(await fechada("saiu", null)).toBeNull();
    });

    it("convite vencido e 15 min sem sinal fecham na próxima leitura e apagam o link", async () => {
      // Convite vencido (60 s): sala e convite fecham; o link some; o rev sobe.
      const s1 = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "roles", extra: { call_link: "https://meet.example.com/x", rev: 2 } });
      await d.sql(`insert into public.study_invites (from_user, to_user, room_id, expires_at) values ($1, $2, $3, now() - interval '1 second')`, [U.fabio, U.carla, s1]);
      const e1 = await d.rpc(U.carla, "app_dupla_room", { p_room_id: s1 });
      expect(e1).toMatchObject({ phase: "closed", closed_reason: "convite_expirado", call_link: null, rev: 3, invite_pending: false, closed_by: null });
      expect((await d.sql(`select status from public.study_invites where room_id = $1`, [s1]))[0].status).toBe("canceled");
      // Convite ainda no prazo não fecha.
      const s2 = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "roles" });
      await d.sql(`insert into public.study_invites (from_user, to_user, room_id) values ($1, $2, $3)`, [U.fabio, U.carla, s2]);
      expect((await d.rpc(U.carla, "app_dupla_room", { p_room_id: s2 })).phase).toBe("roles");

      // 15 min sem sinal dos dois e sala parada → sem_sinal.
      await d.sql(`update public.study_profiles set last_seen_at = $2 where user_id = any ($1)`, [[U.carla, U.fabio], minutosAtras(20)]);
      const parada = { updated_at: minutosAtras(20), call_link: "https://meet.example.com/y" };
      const s3 = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "running", candidate: U.carla, evaluator: U.fabio, extra: parada });
      const e3 = await d.rpc(U.carla, "app_dupla_room", { p_room_id: s3 });
      expect(e3).toMatchObject({ phase: "closed", closed_reason: "sem_sinal", call_link: null });
      expect(e3.rev).toBe(1);
      // Controles: sala mexida há pouco; e sala parada mas com um dos dois com sinal recente.
      const s4 = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "running", extra: { updated_at: minutosAtras(5) } });
      expect((await d.rpc(U.carla, "app_dupla_room", { p_room_id: s4 })).phase).toBe("running");
      await d.sql(`update public.study_profiles set last_seen_at = $2 where user_id = $1`, [U.fabio, minutosAtras(1)]);
      const s5 = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "setup", extra: { updated_at: minutosAtras(30) } });
      expect((await d.rpc(U.carla, "app_dupla_room", { p_room_id: s5 })).phase).toBe("setup");
      // Sala já fechada não é fechada de novo (rev fica).
      expect((await d.rpc(U.carla, "app_dupla_room", { p_room_id: s3 })).rev).toBe(1);

      // O fechamento geral (sem sala) pega as que estão paradas, e só elas. Interna: o navegador não chama.
      await d.sql(`update public.study_profiles set last_seen_at = $2 where user_id = $1`, [U.fabio, minutosAtras(20)]);
      const s6 = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "setup", extra: { updated_at: minutosAtras(30) } });
      const s7 = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "setup" });
      await d.sql(`select public.dupla_sweep()`);
      const fases = await d.sql<{ id: string; phase: string }>(`select id, phase from public.checklist_rooms where id = any ($1)`, [[s5, s6, s7]]);
      expect(Object.fromEntries(fases.map((f) => [f.id, f.phase]))).toEqual({ [s5]: "closed", [s6]: "closed", [s7]: "setup" });
      await d.sql(`update public.study_profiles set last_seen_at = $2 where user_id = any ($1)`, [[U.carla, U.fabio], new Date().toISOString()]);
    });
  });

  // ------------------------------------------------------------------ marcações
  it("marcações: só o avaliador da rodada", async () => {
    const sala = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "running", candidate: U.carla, evaluator: U.fabio, round: 2 });
    await d.sql(
      `insert into public.checklist_room_marks (room_id, round, item_id, evaluator_id, grade, subitems_checked) values
         ($1, 1, 'i1', $2, 'correct', '{}'), ($1, 2, 'i1', $2, 'partial', '{}'), ($1, 2, 'i2', $2, null, '{}'), ($1, 2, 'i3', $2, 'correct', '{s1,s2}')`,
      [sala, U.fabio]
    );
    expect(await d.rpc(U.fabio, "app_dupla_marks", { p_room_id: sala })).toEqual([
      { item_id: "i1", grade: "partial", subitems: [] },
      { item_id: "i2", grade: null, subitems: [] },
      { item_id: "i3", grade: "correct", subitems: ["s1", "s2"] },
    ]);
    await expect(d.rpc(U.carla, "app_dupla_marks", { p_room_id: sala })).rejects.toThrow("Só o avaliador vê as marcações durante a rodada.");
    await expect(d.rpc(U.ana, "app_dupla_marks", { p_room_id: sala })).rejects.toThrow("Sala não encontrada.");
    await expect(d.rpc(U.admin, "app_dupla_marks", { p_room_id: sala })).rejects.toThrow("Sala não encontrada.");
    // Sem papéis definidos ninguém é avaliador.
    const semPapel = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "roles" });
    await expect(d.rpc(U.fabio, "app_dupla_marks", { p_room_id: semPapel })).rejects.toThrow("Só o avaliador vê as marcações durante a rodada.");
    // Sala sem marcações: lista vazia.
    const vazia = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "running", candidate: U.carla, evaluator: U.fabio });
    expect(await d.rpc(U.fabio, "app_dupla_marks", { p_room_id: vazia })).toEqual([]);
  });

  // ------------------------------------------------------------------ resultado
  it("resultado: só depois da avaliação; última vez, avaliador da rodada, tempo usado e 'Conta excluída'", async () => {
    await estacao("inep-2021-1-e07", { institution: "INEP" });
    await estacao("inep-2021-1-e08", { institution: "INEP" });
    const sala = await makeRoom(d.db, { members: [U.carla, U.fabio], phase: "result", candidate: U.carla, evaluator: U.fabio, station: "inep-2021-1-e07", round: 2 });
    // Antes de existir a avaliação ninguém recebe nada; nem de uma rodada que não existe.
    for (const uid of [U.carla, U.fabio, U.ana]) {
      await expect(d.rpc(uid, "app_dupla_result", { p_room_id: sala, p_round: 2 })).rejects.toThrow("Resultado ainda não liberado.");
    }

    // Rodada 1 (outra sala, mesma candidata e estação) e uma sessão de outra estação (não conta como "última vez").
    const antiga = await makeRoom(d.db, { members: [U.carla, U.diego], phase: "closed" });
    await addSession(d.db, { room: antiga, round: 1, doctor: U.carla, actor: U.diego, station: "inep-2021-1-e07", correctness: 55, finishedAt: minutosAtras(300) });
    await addSession(d.db, { room: antiga, round: 2, doctor: U.carla, actor: U.diego, station: "inep-2021-1-e08", correctness: 99, finishedAt: minutosAtras(200) });
    await addSession(d.db, { room: sala, round: 1, doctor: U.fabio, actor: U.carla, station: "inep-2021-1-e07", correctness: 20, finishedAt: minutosAtras(100) });
    await addSession(d.db, {
      room: sala, round: 2, doctor: U.carla, actor: U.fabio, station: "inep-2021-1-e07", correctness: 62.5, finishedAt: minutosAtras(10), usedMs: 421000,
      answers: [{ id: "i1", grade: "Partial", subitems: [] }, { id: "i2", grade: "Correct", subitems: [] }, { id: "i3", grade: "Incorrect", subitems: [] }, { id: "item-que-sumiu", grade: "Correct", subitems: [] }],
      feedback: { pos: "Boa anamnese.", neg: "Faltou o exame físico.", gen: "Treine mais." },
    });
    await d.sql(
      `update public.checklist_study_sessions set review_requested_at = '2026-10-10T12:00:00Z', review_reason = 'Item 3 estava certo.'
       where room_id = $1 and round = 2`,
      [sala]
    );

    const candidata = await d.rpc(U.carla, "app_dupla_result", { p_room_id: sala, p_round: 2 });
    expect(candidata).toMatchObject({
      round: 2, viewer: "candidate", score: 6.25, max_score: 10, pct: 63, previous_pct: 55, used_ms: 421000,
      station: { id: "inep-2021-1-e07", name: "Estação inep-2021-1-e07", area: "Clínica Médica", area_code: "CM", number: 7, edition: "2021/1", reapplication: false, institution: "INEP", duration_ms: 600000 },
      evaluator: { user_id: U.fabio, public_name: "Fábio Nunes Prado" },
      candidate: { user_id: U.carla, public_name: "Carla Dias" },
      feedback: { pos: "Boa anamnese.", neg: "Faltou o exame físico.", gen: "Treine mais." },
      review: { reason: "Item 3 estava certo.", revised_at: null, score_before_review: null },
    });
    expect(candidata.review.requested_at).toBeTruthy();
    expect(candidata.finished_at).toBeTruthy();
    expect(candidata.items).toEqual([
      { id: "i1", order: 1, content: "Item um", max_points: 2.5, grade: "partial", points: 1.25 },
      { id: "i2", order: 2, content: "Item dois", max_points: 2.5, grade: "correct", points: 2.5 },
      { id: "i3", order: 3, content: "Item três", max_points: 5, grade: "incorrect", points: 0 },
    ]);
    const avaliador = await d.rpc(U.fabio, "app_dupla_result", { p_room_id: sala, p_round: 2 });
    expect(avaliador).toMatchObject({ viewer: "evaluator", score: 6.25, previous_pct: 55 });
    // Rodada 1 tem outra avaliação (o papel inverteu): Fábio foi o candidato dela.
    expect(await d.rpc(U.fabio, "app_dupla_result", { p_room_id: sala, p_round: 1 })).toMatchObject({ viewer: "candidate", pct: 20, previous_pct: null });
    // Quem não é da rodada (nem a equipe, nem o outro lado de outra sala) não recebe.
    await expect(d.rpc(U.ana, "app_dupla_result", { p_room_id: sala, p_round: 2 })).rejects.toThrow("Resultado ainda não liberado.");
    await expect(d.rpc(U.admin, "app_dupla_result", { p_room_id: sala, p_round: 2 })).rejects.toThrow("Resultado ainda não liberado.");
    await expect(d.rpc(U.diego, "app_dupla_result", { p_room_id: sala, p_round: 2 })).rejects.toThrow("Resultado ainda não liberado.");
    await expect(d.rpc(U.carla, "app_dupla_result", { p_room_id: sala, p_round: 3 })).rejects.toThrow("Resultado ainda não liberado.");

    // Avaliador sem conta: vem como "Conta excluída" e o candidato ainda lê.
    await d.sql(`update public.checklist_study_sessions set actor_id = null where room_id = $1 and round = 2`, [sala]);
    const semAvaliador = await d.rpc(U.carla, "app_dupla_result", { p_room_id: sala, p_round: 2 });
    expect(semAvaliador.evaluator).toEqual({ user_id: null, public_name: "Conta excluída" });
    expect(semAvaliador.candidate.public_name).toBe("Carla Dias");
  });

  // ------------------------------------------------------------------ painel
  it("chave no painel: só administrador, planos válidos, e app_dupla_access reflete", async () => {
    const salvar = (uid: string | null, aberto: boolean | null, planos: string[] | null) => d.rpc(uid, "app_admin_save_dupla", { p_aberto: aberto, p_planos: planos });
    await expect(salvar(U.ana, true, ["pro"])).rejects.toThrow("Acesso restrito a administradores.");
    await expect(salvar(null, true, ["pro"])).rejects.toThrow();
    await expect(salvar(U.admin, true, ["pro", "vip"])).rejects.toThrow("Planos inválidos.");
    await expect(salvar(U.admin, true, null)).rejects.toThrow("Planos inválidos.");

    // Aberto só para Pro e Elite: Ana (teste grátis) fica de fora; a equipe entra sempre.
    expect(await salvar(U.admin, true, ["elite", "pro", "pro"])).toEqual({ aberto: true, planos: ["pro", "elite"] });
    expect(await d.rpc(U.ana, "app_dupla_access")).toEqual({ aberto: true, permitido: false, planos: ["pro", "elite"], equipe: false });
    expect(await d.rpc(U.admin, "app_dupla_access")).toMatchObject({ aberto: true, permitido: true, equipe: true });
    // Com o teste grátis marcado, Ana entra.
    expect(await salvar(U.admin, true, ["trial", "pro"])).toEqual({ aberto: true, planos: ["trial", "pro"] });
    expect(await d.rpc(U.ana, "app_dupla_access")).toMatchObject({ aberto: true, permitido: true, planos: ["trial", "pro"] });
    // Fechar (e "aberto" nulo também fecha); lista vazia vale.
    expect(await salvar(U.admin, false, [])).toEqual({ aberto: false, planos: [] });
    expect(await d.rpc(U.ana, "app_dupla_access")).toMatchObject({ aberto: false, permitido: false, planos: [] });
    expect(await salvar(U.admin, null, ["pro"])).toEqual({ aberto: false, planos: ["pro"] });
    // A linha da chave guarda o valor, quem mexeu e foi para o registro.
    const [linha] = await d.sql(`select value, updated_by from public.app_settings where key = 'treino_dupla'`);
    expect(linha).toEqual({ value: { aberto: false, planos: ["pro"] }, updated_by: U.admin });
    const log = await d.sql(`select actor_id, action, target, details from public.admin_audit_log where action = 'dupla.save' order by id`);
    expect(log).toHaveLength(4);
    expect(log[3]).toEqual({ actor_id: U.admin, action: "dupla.save", target: null, details: { aberto: false, planos: ["pro"] } });
    await setDupla(d.db, ABERTO);
  });

  // ------------------------------------------------------------------ permissões e colagem dupla
  it("permissões: app_* fechadas para visitante, apoios fechados para o navegador, e colar duas vezes dá o mesmo banco", async () => {
    const acesso = async (assinatura: string, papel: string) =>
      (await d.sql<{ ok: boolean }>(`select has_function_privilege($1, $2::regprocedure, 'execute') as ok`, [papel, `public.${assinatura}`]))[0].ok;
    for (const f of [
      "app_dupla_room(uuid, integer)", "app_dupla_marks(uuid)", "app_dupla_result(uuid, integer)", "app_dupla_stations()",
      "app_dupla_profile()", "app_dupla_save_profile(jsonb)", "app_admin_save_dupla(boolean, text[])",
    ]) {
      expect(await acesso(f, "anon"), `${f} anon`).toBe(false);
      expect(await acesso(f, "authenticated"), `${f} authenticated`).toBe(true);
    }
    for (const f of ["dupla_public_name(uuid)", "dupla_sweep(uuid)", "dupla_room_state(public.checklist_rooms, uuid)"]) {
      expect(await acesso(f, "anon"), `${f} anon`).toBe(false);
      expect(await acesso(f, "authenticated"), `${f} authenticated`).toBe(false);
    }
    // Todas as funções são security definer com o caminho de busca vazio (menos as duas puras da 9750, que só formatam texto).
    const soltas = await d.sql<{ proname: string }>(
      `select proname from pg_proc where pronamespace = 'public'::regnamespace
         and (proname like 'app_dupla\\_%' or proname like 'dupla\\_%' or proname = 'app_admin_save_dupla')
         and proname not in ('dupla_station_meta', 'dupla_area_code')
         and (not prosecdef or proconfig is null or not ('search_path=""' = any (proconfig)))`
    );
    expect(soltas).toEqual([]);

    const retrato = async () => ({
      funcoes: await d.sql(
        `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1`
      ),
      indices: await d.sql(`select indexname, indexdef from pg_indexes where schemaname = 'public' order by 1`),
      dados: await d.sql(`select key, value from public.app_settings order by key`),
    });
    const antes = await retrato();
    await d.db.exec(SQL);
    // As do Treino que vêm depois refazem funções desta (a 012900 refaz dupla_room_state): colar de novo na ordem.
    // A lista de chaves de app_settings da 013370 não tem 'creditos' (014020): colada de novo antes dela, seria recusada pela
    // linha dos créditos. A linha sai antes e a 014020, colada em seguida na ordem, devolve a lista e a linha, como antes.
    await d.sql(`delete from public.app_settings where key = 'creditos'`);
    for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.includes("treino_dupla") && f > MIGRACAO).sort()) {
      await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    }
    expect(await retrato()).toEqual(antes);
    expect((antes.indices as any[]).map((i) => i.indexname)).toEqual(expect.arrayContaining(["checklist_rooms_open_idx", "study_invites_pending_idx"]));
  });
});
