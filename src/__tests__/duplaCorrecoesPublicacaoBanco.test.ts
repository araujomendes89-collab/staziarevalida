// @vitest-environment node
/**
 * Publicação da 2ª fase (17/10): os 6 achados da revisão, um teste por achado, sobre o banco local (PGlite, migrações reais,
 * até a 013405). Cada teste reproduz o caminho do achado e falha sem a 013405 (ou sem a correção do cabeçalho da 013330).
 * Regra do dono: o candidato nunca recebe o tema, o nome ou o id da estação antes do resultado; quem já viu a estação pode ser
 * candidato, com o aviso "Você já viu esta estação" (fluxo simples, 014140: ao candidato só depois do início marcado; o
 * avaliador fica sabendo antes). Estações e pessoas daqui são SÓ de teste.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addProfile, addSession, addStation, makeRoom, MIGRATIONS_DIR, openDuplaDb, seen, setDupla, setPlan, STATION, U, type DuplaDb,
} from "./helpers/duplaDb";

const MIGRACAO = "20261003013405_treino_dupla_correcoes_publicacao.sql";
const SEM_APROVACAO = "Estação ainda sem aprovação médica: só dá para treinar entre a equipe.";

// Estação de TESTE com marcas fáceis de procurar no texto bruto. Impressos: 1 inicial e 2 liberáveis.
const SECRETA = {
  ...STATION,
  id: "teste-inep2020-e07",
  name: "ZZNOME estação secreta",
  topic: "ZZTEMA reservado",
  taxonomy_path: ["Clínica Médica", "ZZTAXO"],
  pressings: [
    { id: "teste-inep2020-e07-p1", name: "Relato do caso", content: "Relato inicial de teste.", image_url: null, source_number: 1, display_number: 1, initially_visible: true },
    { id: "teste-inep2020-e07-p2", name: "Exame A", content: "Resultado A.", image_url: null, source_number: 2, display_number: 1, initially_visible: false },
    { id: "teste-inep2020-e07-p3", name: "Exame B", content: "Resultado B.", image_url: null, source_number: 5, display_number: 3, initially_visible: false },
  ],
};
const OUTRA = { ...STATION, id: "teste-dupla-outra", name: "ZZOUTRA estação de teste" };
const PENDENTE = { ...STATION, id: "teste-dupla-pendente", name: "Estação pendente de teste" };
const MARCAS = ["ZZNOME", "ZZTEMA", "ZZTAXO", "teste-inep2020-e07"];
const vaza = (x: unknown) => MARCAS.filter((m) => JSON.stringify(x).includes(m));

describe("Migração 013405: correções da revisão antes de publicar", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb();
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    for (const u of [U.ana, U.bruno, U.carla]) await setPlan(d.db, u, "pro", "active");
    await addStation(d.db, STATION);
    await addStation(d.db, SECRETA);
    await addStation(d.db, OUTRA);
    await addStation(d.db, PENDENTE, { medical_review: "pending" });
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });
  beforeEach(async () => {
    await d.sql(`delete from public.checklist_study_sessions`);
    await d.sql(`delete from public.study_invites`);
    await d.sql(`delete from public.checklist_rooms`);
    await d.sql(`delete from public.study_matches`);
    await d.sql(`delete from public.study_swipes`);
    await d.sql(`update public.user_roles set role = 'student' where user_id = $1`, [U.carla]);
  });

  const act = (uid: string, fn: string, room: string, args: Record<string, unknown> = {}) =>
    d.rpc<any>(uid, `app_dupla_${fn}`, { p_room_id: room, ...args });
  const estado = (uid: string, room: string) => d.rpc<any>(uid, "app_dupla_room", { p_room_id: room });
  const conteudo = (uid: string, room: string) => d.rpc<any>(uid, "app_dupla_room_content", { p_room_id: room });
  const salaPapeis = async () => {
    // ana = candidata, bruno = avaliador; bruno escolhe a estação secreta.
    const id = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", station: null, candidate: U.ana, evaluator: U.bruno });
    await act(U.bruno, "set_station", id, { p_station_id: SECRETA.id });
    return id;
  };

  // ------------------------------------------------------------------ achado 1 (bloqueia)
  it("achado 1: a candidata vira avaliadora (cartão), vê o nome e volta a candidata → recebe o aviso; o avaliador também sabe", async () => {
    const id = await salaPapeis();
    let a = await estado(U.ana, id);
    expect(a.me).toMatchObject({ role: "candidate", seen_station: false });
    // cartão "Ator/Avaliador" (app_dupla_set_roles): o avaliador recebe o nome na hora (permitido: decisão de 16/10)
    a = await act(U.ana, "set_roles", id, { p_candidate_id: U.bruno });
    expect(a.me.role).toBe("evaluator");
    expect(a.station.name).toBe(SECRETA.name);
    // volta a candidata: o nome e o id continuam fora do estado e do conteúdo
    a = await act(U.ana, "set_roles", id, { p_candidate_id: U.ana });
    // fluxo simples (014140, rodada de correção 1): antes do início marcado o aviso não chega ao candidato; o avaliador fica sabendo
    expect(a.me).toMatchObject({ role: "candidate", seen_station: false });
    expect(a.me).not.toHaveProperty("picked_station");
    expect(vaza(a)).toEqual([]);
    expect(vaza(await estado(U.ana, id))).toEqual([]);
    expect(vaza(await conteudo(U.ana, id))).toEqual([]);
    // o avaliador fica sabendo (texto neutro na tela), para combinarem trocar de estação
    const b = await estado(U.bruno, id);
    expect(b.partner).toMatchObject({ role: "candidate", seen_station: true });
    // o avaliador troca a estação por uma que a candidata nunca viu: o aviso apaga
    await act(U.bruno, "set_station", id, { p_station_id: OUTRA.id });
    expect((await estado(U.ana, id)).me.seen_station).toBe(false);
    expect((await estado(U.bruno, id)).partner.seen_station).toBe(false);
  });

  it("achado 1: o mesmo pelo botão Sortear (app_dupla_draw_roles)", async () => {
    const id = await salaPapeis();
    // sorteia até a ana cair como avaliadora (o sorteio é do servidor)
    let s: any;
    for (let i = 0; i < 60; i++) {
      s = await act(U.ana, "draw_roles", id);
      if (s.me.role === "evaluator") break;
    }
    expect(s.me.role).toBe("evaluator");
    for (let i = 0; i < 60; i++) {
      s = await act(U.ana, "draw_roles", id);
      if (s.me.role === "candidate") break;
    }
    // fluxo simples (014140, rodada de correção 1): antes do início marcado o aviso não chega ao candidato; o avaliador fica sabendo
    expect(s.me).toMatchObject({ role: "candidate", seen_station: false });
    expect(vaza(s)).toEqual([]);
    expect((await estado(U.bruno, id)).partner).toMatchObject({ role: "candidate", seen_station: true });
  });

  // ------------------------------------------------------------------ achado 2 (tentativa e erro)
  it("achado 2: escolhas gravadas no Banco de estações durante a sala não acendem o aviso (não dá para testar estações)", async () => {
    await addProfile(d.db, U.ana, { public_name: "Ana Souza" });
    await addProfile(d.db, U.bruno, { public_name: "Bruno Lima" });
    try {
      const id = await salaPapeis();
      // a candidata grava escolhas com cada estação do catálogo para o parceiro e olha o estado depois de cada uma
      for (const est of [STATION.id, OUTRA.id, SECRETA.id]) {
        await d.rpc(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "left", p_station_id: est });
        const s = await estado(U.ana, id);
        expect(s.me.seen_station, est).toBe(false);
        expect(s.me, est).not.toHaveProperty("picked_station");
        expect(vaza(s)).toEqual([]);
      }
      // nem uma escolha "Estudar junto" com a estação certa
      await d.rpc(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right", p_station_id: SECRETA.id });
      expect((await estado(U.ana, id)).me.seen_station).toBe(false);
    } finally {
      await d.sql(`delete from public.study_profiles where user_id in ($1, $2)`, [U.ana, U.bruno]);
    }
  });

  it("achado 2: no match, quem escolheu a estação no Banco fica gravado como quem já viu (e só ele)", async () => {
    await addProfile(d.db, U.ana, { public_name: "Ana Souza", role_pref: "med" });
    await addProfile(d.db, U.bruno, { public_name: "Bruno Lima", role_pref: "ator" });
    try {
      await seen(d.db, U.ana);
      await seen(d.db, U.bruno);
      expect((await d.rpc(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right", p_station_id: SECRETA.id })).matched).toBe(false);
      await seen(d.db, U.ana);
      const m = await d.rpc(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right" });
      expect(m.matched).toBe(true);
      const [sala] = await d.sql(`select station_id, station_chosen_by, candidate_id, evaluator_id from public.checklist_rooms where id = $1`, [m.room_id]);
      expect(sala).toEqual({ station_id: SECRETA.id, station_chosen_by: U.ana, candidate_id: U.ana, evaluator_id: U.bruno });
      const a = await estado(U.ana, m.room_id);
      // fluxo simples (014140, rodada de correção 1): antes do início marcado o aviso não chega ao candidato; o avaliador fica sabendo
      expect(a.me).toMatchObject({ role: "candidate", seen_station: false });
      expect(vaza(a)).toEqual([]);
      expect((await estado(U.bruno, m.room_id)).partner.seen_station).toBe(true);
      expect(await d.sql(`select user_id, how from public.checklist_room_station_views where room_id = $1 order by how`, [m.room_id])).toEqual([
        { user_id: U.bruno, how: "avaliador" },
        { user_id: U.ana, how: "escolheu" },
      ]);
    } finally {
      await d.sql(`delete from public.study_profiles where user_id in ($1, $2)`, [U.ana, U.bruno]);
    }
  });

  // ------------------------------------------------------------------ achado 3 (exportação)
  it("achado 3: sala FECHADA antes do resultado → a exportação da candidata vem sem station_id e sem ids verdadeiros dos impressos", async () => {
    const id = await makeRoom(d.db, {
      members: [U.ana, U.bruno], phase: "running", candidate: U.ana, evaluator: U.bruno, station: SECRETA.id,
      extra: { released_pressings: ["teste-inep2020-e07-p2", "teste-inep2020-e07-p3"] },
    });
    await d.rpc(U.ana, "app_dupla_leave", { p_room_id: id }); // a candidata sai no meio: fecha sem resultado
    expect((await d.sql(`select phase, closed_reason from public.checklist_rooms where id = $1`, [id]))[0]).toEqual({ phase: "closed", closed_reason: "saiu" });

    const exp = await d.rpc<any>(U.ana, "app_export_my_data");
    const sala = exp.checklist_rooms.find((r: any) => r.id === id);
    expect(sala).toBeTruthy();
    expect(sala).not.toHaveProperty("station_id");
    expect(sala.released_pressings).toEqual(["d1", "d2"]);
    expect(sala.station_views).toEqual([]);
    expect(vaza(exp)).toEqual([]);
    expect(exp).toHaveProperty("declarations");
    expect(exp).toHaveProperty("study_chat");
    // chamando a função direto, o mesmo
    expect(vaza(await d.rpc(U.ana, "dupla_export_rooms"))).toEqual([]);
    // o avaliador já viu: recebe tudo
    const doAvaliador = (await d.rpc<any>(U.bruno, "app_export_my_data")).checklist_rooms.find((r: any) => r.id === id);
    expect(doAvaliador).toMatchObject({ station_id: SECRETA.id, released_pressings: ["teste-inep2020-e07-p2", "teste-inep2020-e07-p3"] });
    expect(doAvaliador.station_views).toEqual([expect.objectContaining({ station_id: SECRETA.id, how: "avaliador" })]);
    // colunas listadas: as mesmas da sala (menos as do tema para a candidata), mais station_views
    expect(Object.keys(doAvaliador).sort()).toEqual([
      "call_link", "candidate_id", "closed_reason", "confirmed_ids", "connected_ids", "created_at", "duration_ms", "ends_at",
      "evaluator_id", "finished_at", "id", "match_id", "member_ids", "paused_at", "paused_left_ms", "paused_total_ms", "phase",
      "ready_ids", "released_pressings", "rev", "round", "started_at", "station_chosen_by", "station_id", "station_views",
      "updated_at", "updated_by",
    ]);

    // com o resultado da rodada (avaliação gravada), a candidata passa a receber a estação
    await addSession(d.db, { room: id, round: 1, doctor: U.ana, actor: U.bruno, station: SECRETA.id, correctness: 70 });
    const depois = (await d.rpc<any>(U.ana, "app_export_my_data")).checklist_rooms.find((r: any) => r.id === id);
    expect(depois.station_id).toBe(SECRETA.id);
  });

  it("achado 3: sala aberta (antes do resultado) e quem já viu a estação", async () => {
    const id = await salaPapeis();
    expect((await d.rpc<any>(U.ana, "dupla_export_rooms"))[0]).not.toHaveProperty("station_id");
    // a candidata passa por avaliadora e volta: já viu, pode receber (não há nada novo para ela)
    await act(U.ana, "set_roles", id, { p_candidate_id: U.bruno });
    await act(U.ana, "set_roles", id, { p_candidate_id: U.ana });
    const [sala] = await d.rpc<any>(U.ana, "dupla_export_rooms");
    expect(sala.station_id).toBe(SECRETA.id);
    expect(sala.station_views).toEqual([expect.objectContaining({ station_id: SECRETA.id, how: "avaliador" })]);
  });

  // ------------------------------------------------------------------ achado 4
  it("achado 4: quem viu como avaliador e vira candidato recebe o aviso, só para a estação que viu", async () => {
    const id = await salaPapeis(); // bruno avaliador viu SECRETA
    await act(U.bruno, "set_station", id, { p_station_id: STATION.id }); // e depois STATION
    let b = await act(U.bruno, "set_roles", id, { p_candidate_id: U.bruno }); // bruno vira candidato, ainda em STATION
    // fluxo simples (014140, rodada de correção 1): antes do início marcado o aviso não chega ao candidato; o avaliador fica sabendo
    expect(b.me).toMatchObject({ role: "candidate", seen_station: false });
    expect(vaza(b)).toEqual([]);
    expect((await estado(U.ana, id)).partner.seen_station).toBe(true);
    // a nova avaliadora troca para OUTRA (bruno nunca viu): sem aviso
    await act(U.ana, "set_station", id, { p_station_id: OUTRA.id });
    b = await estado(U.bruno, id);
    expect(b.me.seen_station).toBe(false);
    expect((await estado(U.ana, id)).partner.seen_station).toBe(false);
    // volta para SECRETA (bruno viu antes da troca): aviso de novo (à avaliadora; ao candidato só depois do início marcado)
    await act(U.ana, "set_station", id, { p_station_id: SECRETA.id });
    b = await estado(U.bruno, id);
    expect(b.me.seen_station).toBe(false);
    expect((await estado(U.ana, id)).partner.seen_station).toBe(true);
    await d.sql(`update public.checklist_rooms set phase = 'running', started_at = now() - interval '1 second', ends_at = now() + interval '10 minutes' where id = $1`, [id]);
    expect((await estado(U.bruno, id)).me).toMatchObject({ role: "candidate", seen_station: true });
    await d.sql(`update public.checklist_rooms set phase = 'roles', started_at = null, ends_at = null where id = $1`, [id]);
    b = await estado(U.bruno, id);
    expect(vaza(b)).toEqual([]);
    expect(vaza(await conteudo(U.bruno, id))).toEqual([]);
  });

  // ------------------------------------------------------------------ achado 5
  it("achado 5: estação sem aprovação médica só entre a equipe; com aluno na sala, a equipe é recusada", async () => {
    // administrador (equipe) avaliador com a ana (aluna) candidata
    const comAluna = await makeRoom(d.db, { members: [U.admin, U.ana], phase: "roles", station: null, candidate: U.ana, evaluator: U.admin });
    await expect(act(U.admin, "set_station", comAluna, { p_station_id: PENDENTE.id })).rejects.toThrow(SEM_APROVACAO);
    // aluno não fica sabendo que a estação existe
    const alunos = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", station: null, candidate: U.ana, evaluator: U.bruno });
    await expect(act(U.bruno, "set_station", alunos, { p_station_id: PENDENTE.id })).rejects.toThrow("Estação não encontrada.");
    // estação pendente já gravada na sala (por outro caminho): confirmar recusa. Desde a 013406 a rodada fecha antes, com a
    // mensagem neutra (a estação ficou indisponível; a sala volta aos papéis sem estação).
    const gravada = await makeRoom(d.db, { members: [U.admin, U.ana], phase: "roles", station: PENDENTE.id, candidate: U.ana, evaluator: U.admin });
    await expect(act(U.ana, "confirm_roles", gravada)).rejects.toThrow("Esta estação ficou indisponível. Escolham outra.");
    // escolha no Banco de estações com estação pendente para uma aluna
    await addProfile(d.db, U.admin, { public_name: "Equipe Teste" });
    await addProfile(d.db, U.ana, { public_name: "Ana Souza" });
    await addProfile(d.db, U.carla, { public_name: "Carla Dias" });
    try {
      await expect(d.rpc(U.admin, "app_dupla_swipe", { p_to: U.ana, p_direction: "right", p_station_id: PENDENTE.id })).rejects.toThrow(SEM_APROVACAO);
      // dois da equipe: pode
      await d.sql(`update public.user_roles set role = 'editor' where user_id = $1`, [U.carla]);
      expect((await d.rpc(U.admin, "app_dupla_swipe", { p_to: U.carla, p_direction: "right", p_station_id: PENDENTE.id })).matched).toBe(false);
      const equipe = await makeRoom(d.db, { members: [U.admin, U.carla], phase: "roles", station: null, candidate: U.carla, evaluator: U.admin });
      const s = await act(U.admin, "set_station", equipe, { p_station_id: PENDENTE.id });
      expect(s.station.id).toBe(PENDENTE.id);
      await act(U.carla, "confirm_roles", equipe);
    } finally {
      await d.sql(`delete from public.study_profiles where user_id in ($1, $2, $3)`, [U.admin, U.ana, U.carla]);
    }
  });

  it("achado 5: no match completado pela equipe, a estação pendente da escolha do aluno não vai para a sala", async () => {
    // escolha antiga da aluna com a estação pendente (gravada antes da regra); a equipe completa o match
    await addProfile(d.db, U.admin, { public_name: "Equipe Teste" });
    await addProfile(d.db, U.ana, { public_name: "Ana Souza" });
    try {
      await d.sql(`insert into public.study_swipes (from_user, to_user, direction, station_id) values ($1, $2, 'right', $3)`, [U.ana, U.admin, PENDENTE.id]);
      await seen(d.db, U.ana);
      const m = await d.rpc(U.admin, "app_dupla_swipe", { p_to: U.ana, p_direction: "right" });
      expect(m.matched).toBe(true);
      expect(await d.sql(`select station_id, station_chosen_by from public.checklist_rooms where id = $1`, [m.room_id])).toEqual([
        { station_id: null, station_chosen_by: null },
      ]);
    } finally {
      await d.sql(`delete from public.study_profiles where user_id in ($1, $2)`, [U.admin, U.ana]);
    }
  });

  // ------------------------------------------------------------------ achado 6 e colar duas vezes
  it("achado 6: o cabeçalho da 013330 diz a verdade (colável duas vezes) e colar de novo não dá erro", async () => {
    const f = "20261003013330_fase2_telas_reais.sql";
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    expect(sql).not.toContain("already exists");
    expect(sql).not.toContain("colada uma vez só");
    expect(sql).toContain("Pode ser colada duas vezes");
    await expect(d.db.exec(sql)).resolves.toBeDefined();
    // Junção da etapa 2: o treino sozinho (014090–014120) refaz funções desta; recola-se o resto da cadeia, na ordem, para os
    // testes seguintes partirem do banco inteiro.
    for (const g of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.includes("treino_dupla") && x > f).sort()) {
      await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, g), "utf8"));
    }
  });

  it("a 013405 colada duas vezes dá o mesmo banco; tabela nova fechada; funções de apoio fora do navegador", async () => {
    const defs = () =>
      d.sql<{ id: string; def: string; acl: string | null }>(
        `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`
      );
    const id = await salaPapeis();
    const vistas = () => d.sql(`select room_id, station_id, user_id, how from public.checklist_room_station_views order by 1, 2, 3`);
    const antes = await defs();
    const vAntes = await vistas();
    // Colar a 013405 de novo volta as versões dela; por isso recola-se a cadeia a partir dela, na ordem (a 013406 refaz
    // dupla_room_seen, dupla_room_state e app_dupla_confirm_roles).
    for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.includes("treino_dupla") && x >= MIGRACAO).sort()) {
      await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    }
    expect(await defs()).toEqual(antes);
    expect(await vistas()).toEqual(vAntes);
    expect(vAntes).toEqual([{ room_id: id, station_id: SECRETA.id, user_id: U.bruno, how: "escolheu" }]);
    // a tabela não é lida nem gravada pelo navegador
    expect(await d.asUser(U.bruno, `select * from public.checklist_room_station_views`).catch((e) => String(e))).toMatch(/permission denied/);
    const [rls] = await d.sql(`select relrowsecurity from pg_class where oid = 'public.checklist_room_station_views'::regclass`);
    expect(rls).toEqual({ relrowsecurity: true });
    for (const fn of ["dupla_room_seen_add", "dupla_room_seen", "dupla_station_liberada"]) {
      const [p] = await d.sql(`select has_function_privilege('authenticated', oid, 'execute') as aut, has_function_privilege('anon', oid, 'execute') as anon, prosecdef, proconfig
                                 from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [fn]);
      expect(p, fn).toEqual({ aut: false, anon: false, prosecdef: true, proconfig: ['search_path=""'] });
    }
    expect(await d.rpc(null, "dupla_export_rooms")).toEqual([]);
  });
});
