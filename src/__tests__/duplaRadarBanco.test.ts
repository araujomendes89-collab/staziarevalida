// @vitest-environment node
/**
 * Treino em Dupla · radar de quem está online e convite direto (Etapa 6C, R1): as migrações 014000 e 014010
 * (supabase/migrations/…014000_treino_dupla_radar.sql e …014010_treino_dupla_radar_refeitas.sql).
 * Radar (quem aparece, cartão público, situação, ordem), convite direto (sala, limites, bloqueio, estação Pro, corrida),
 * bloqueio do chat escondendo do baralho, do radar e do convite, "Permitir convites diretos", painel dos limites e as
 * denúncias do chat guardadas por 180 dias. Postgres em memória (PGlite) com todas as migrações, em ordem.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, STATION, U, addProfile, addStation, makeRoom, openDuplaDb, recolarFluxoSimples, seen, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const SQL_1 = fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003014000_treino_dupla_radar.sql"), "utf8");
const SQL_2 = fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003014010_treino_dupla_radar_refeitas.sql"), "utf8");
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const ABERTO = { aberto: true, planos: ["trial", "pro", "elite"] };
const SEM_ACESSO = /Sem acesso ao Treinamento em Dupla\./;
const SEM_PERFIL = /Crie seu perfil de estudo antes de procurar uma dupla\./;
const SEMANA = ["Seg", "Ter", "Qua", "Qui"];
const ESTACAO_PRO = { ...STATION, id: "teste-dupla-pro", name: "Estação Pro de teste", is_pro_only: true };

const PERFIS: Record<string, Record<string, unknown>> = {
  ana: { public_name: "Ana Souza", role_pref: "any", areas: ["CM", "CR"], days: SEMANA, shifts: ["Noite"], pace: "cronometrado", exam: "2026/2", school: "UFPR", city: "Curitiba", goal: "Passar", bio: "Oi!" },
  bruno: { public_name: "Bruno Lima", role_pref: "ator", areas: ["CM", "PED"], days: ["Seg", "Qua", "Sex"], shifts: ["Noite"], pace: "cronometrado", exam: "2026/2", school: "USP" },
  carla: { public_name: "Carla Dias", role_pref: "med", areas: ["CM", "CR"], days: ["Ter", "Qua", "Qui"], shifts: ["Noite"], pace: "cronometrado", exam: "2026/2" },
  diego: { public_name: "Diego Melo", role_pref: "any", areas: ["GO", "PED"], days: SEMANA, shifts: ["Noite"], pace: "cronometrado", exam: "2026/2" },
  eva: { public_name: "Eva Rocha", role_pref: "med", areas: ["GO"], days: ["Sáb"], shifts: ["Manhã"], pace: "simulacao", exam: "2027/1" },
  fabio: { public_name: "Fábio Reis", role_pref: "med", areas: ["CM", "CR"], days: SEMANA, shifts: ["Noite"], pace: "cronometrado", exam: "2026/2" },
  gil: { public_name: "Gil Nunes", role_pref: "ator", areas: [], days: [], shifts: [], pace: "livre", exam: "2027/1" },
};
const COM_SINAL = ["ana", "bruno", "carla", "diego", "eva", "fabio", "gil"] as const;

describe("Migrações 014000 e 014010 — radar e convite direto", () => {
  let d: DuplaDb;

  const radar = (uid: string, estacao?: string | null, aba?: string) =>
    d.rpc(uid, "app_dupla_radar", { ...(estacao === undefined ? {} : { p_station_id: estacao }), ...(aba ? { p_aba: aba } : {}) });
  const convidar = (de: string, para: string, estacao?: string | null) => d.rpc(de, "app_dupla_invite", { p_to: para, p_station_id: estacao === undefined ? STATION.id : estacao });
  const deck = (uid: string) => d.rpc(uid, "app_dupla_deck");
  const nomes = (r: any) => r.people.map((p: any) => p.public_name);
  const bloquear = (quem: string, alvo: string) => d.sql(`insert into public.study_chat_blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing`, [quem, alvo]);
  const convitesDe = async () => d.sql<any>(`select from_user, to_user, kind, status, room_id from public.study_invites order by created_at`);
  /** Valores do painel: gravados direto, como se o dono tivesse preenchido. */
  const limites = (c: Record<string, unknown>) =>
    d.sql(`update public.app_settings set value = value || jsonb_build_object('convites', $1::jsonb) where key = 'treino_dupla'`, [JSON.stringify(c)]);

  const montar = async () => {
    await d.sql(`delete from public.study_chat_reports`);
    await d.sql(`delete from public.study_chat_blocks`);
    await d.sql(`delete from public.checklist_rooms`); // convites caem junto
    await d.sql(`delete from public.study_matches`);
    await d.sql(`delete from public.study_swipes`);
    await d.sql(`delete from public.study_profiles`);
    for (const [nome, p] of Object.entries(PERFIS)) await addProfile(d.db, (U as any)[nome], p);
    for (const nome of COM_SINAL) await seen(d.db, (U as any)[nome]);
    for (const uid of Object.values(U)) await setPlan(d.db, uid, "trial", "trialing", daqui(7));
    await setDupla(d.db, ABERTO);
  };

  beforeAll(async () => {
    d = await openDuplaDb();
    await addStation(d.db);
    await addStation(d.db, ESTACAO_PRO);
    // Junção da etapa 2: a situação 'sozinho' já é aceita pela restrição do perfil (014090, treino sozinho); nada a abrir.
  }, 120_000);
  beforeEach(async () => {
    await montar();
  }, 60_000);
  afterAll(async () => {
    await d?.db.close();
  });

  // ------------------------------------------------------------------ quem aparece
  it("radar: online, com radar ligado e acesso; sem a própria pessoa, sem quem saiu, sem sinal velho, sem radar desligado", async () => {
    await seen(d.db, U.eva, 0, "fora");
    await seen(d.db, U.fabio, 300); // sinal há 5 min
    await d.sql(`update public.study_profiles set radar_visible = false where user_id = $1`, [U.gil]);
    const r = await radar(U.ana);
    expect(new Set(nomes(r))).toEqual(new Set(["Bruno Lima", "Carla Dias", "Diego Melo"]));
    expect(r.online).toBe(3);
    expect(r.open_room).toBeNull();
    expect(r.me).toEqual({ radar_visible: true, allow_direct_invites: true });
    expect(new Date(r.server_now).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("radar: sem acesso ao módulo a pessoa não aparece e quem não tem acesso não consulta; sem perfil, pede o perfil", async () => {
    await d.sql(`update public.subscriptions set status = 'expired' where user_id = $1`, [U.diego]).catch(() => undefined);
    await setPlan(d.db, U.diego, "trial", "trialing", daqui(-1)); // teste vencido
    expect(nomes(await radar(U.ana))).not.toContain("Diego Melo");
    await expect(radar(U.diego)).rejects.toThrow(SEM_ACESSO);
    await expect(d.rpc(null, "app_dupla_radar")).rejects.toThrow();
    await d.sql(`delete from public.study_profiles where user_id = $1`, [U.ana]);
    await expect(radar(U.ana)).rejects.toThrow(SEM_PERFIL);
  });

  it("a lista é aberta a todos com acesso: quem está invisível também a vê, e não aparece para os outros", async () => {
    await d.sql(`update public.study_profiles set radar_visible = false where user_id = $1`, [U.ana]);
    const dela = await radar(U.ana);
    expect(dela.people.length).toBe(6);
    expect(dela.me.radar_visible).toBe(false);
    expect(nomes(await radar(U.bruno))).not.toContain("Ana Souza");
  });

  it("cartão público: instituição só com show_school, estatística só com show_stats; nunca e-mail, telefone ou foto", async () => {
    const sala = await makeRoom(d.db, { members: [U.bruno, U.carla], phase: "result", candidate: U.bruno, evaluator: U.carla });
    await d.sql(`delete from public.study_profiles where user_id = $1`, [U.gil]);
    await d.db.query(
      `insert into public.checklist_study_sessions (id, station_id, room_id, round, actor_id, doctor_id, started_at, finished_at, score, max_score, correctness, used_ms, checklist_answers)
       values ('s-radar-1', $1, $2, 1, $3, $4, now() - interval '10 minutes', now(), 8, 10, 80, 540000, '[]'::jsonb)`,
      [STATION.id, sala, U.carla, U.bruno]
    );
    let r = await radar(U.ana);
    const bruno = r.people.find((p: any) => p.user_id === U.bruno);
    expect(bruno).toMatchObject({ school: "USP", stats: { done: 1 } });
    await d.sql(`update public.study_profiles set show_school = false, show_stats = false where user_id = $1`, [U.bruno]);
    r = await radar(U.ana);
    const oculto = r.people.find((p: any) => p.user_id === U.bruno);
    expect(oculto.school).toBeNull();
    expect(oculto.stats).toBeNull();
    const cru = JSON.stringify(r);
    expect(cru).not.toMatch(/@|teste\.dev|email|phone|telefone|photo|avatar/i);
    expect(Object.keys(oculto).sort()).toEqual(
      ["areas", "bio", "can_invite", "city", "compat", "days", "exam", "goal", "handle", "near", "online", "pace", "public_name", "reasons", "role_pref", "school", "shifts", "state", "stats", "user_id", "why_not"].sort()
    );
  });

  it("situação: livre convida; em sala, em estação e treinando sozinho aparecem sem botão; convites desligados também", async () => {
    await makeRoom(d.db, { members: [U.bruno, U.eva], phase: "roles" }); // Bruno e Eva em sala
    await seen(d.db, U.carla, 0, "em_estacao");
    await d.sql(`update public.study_profiles set status = 'sozinho' where user_id = $1`, [U.diego]);
    await d.sql(`update public.study_profiles set allow_direct_invites = false where user_id = $1`, [U.fabio]);
    const r = await radar(U.ana);
    const por = (n: string) => r.people.find((p: any) => p.public_name === n);
    expect(por("Gil Nunes")).toMatchObject({ state: "livre", can_invite: true, why_not: null });
    expect(por("Bruno Lima")).toMatchObject({ state: "em_sala", can_invite: false, why_not: "Em sala." });
    expect(por("Eva Rocha")).toMatchObject({ state: "em_sala", can_invite: false });
    expect(por("Carla Dias")).toMatchObject({ state: "em_sala", can_invite: false });
    expect(por("Diego Melo")).toMatchObject({ state: "sozinho", can_invite: false, why_not: "Treinando sozinho." });
    expect(por("Fábio Reis")).toMatchObject({ state: "livre", can_invite: false, why_not: "Não recebe convites." });
  });

  it("ordem: livres antes, depois compatibilidade; mesmo papel específico não esconde, vem sem compatibilidade", async () => {
    await makeRoom(d.db, { members: [U.carla, U.eva], phase: "roles" });
    const r = await radar(U.ana);
    const livres = r.people.filter((p: any) => p.state === "livre");
    expect(r.people.slice(0, livres.length).every((p: any) => p.state === "livre")).toBe(true);
    const comp = livres.map((p: any) => p.compat).filter((c: any) => c != null);
    expect(comp).toEqual([...comp].sort((a, b) => b - a));
    // Carla (médica) vista por Fábio (médico): mesmo papel, aparece sem compatibilidade e ao fim dos livres.
    const f = await radar(U.fabio);
    const gilVisto = f.people.find((p: any) => p.user_id === U.eva);
    expect(gilVisto.compat).toBeNull();
    expect(gilVisto.reasons).toEqual([]);
  });

  it("no máximo 50 pessoas; o contador diz quantas estão online", async () => {
    await d.sql(
      `insert into auth.users (id, email) select ('00000000-0000-4000-8000-9' || lpad(g::text, 11, '0'))::uuid, 'massa' || g || '@teste.dev' from generate_series(1, 55) g`
    );
    await d.sql(
      `insert into public.study_profiles (user_id, public_name, last_seen_at, status)
       select ('00000000-0000-4000-8000-9' || lpad(g::text, 11, '0'))::uuid, 'Colega de massa ' || g, now(), 'livre' from generate_series(1, 55) g`
    );
    await d.sql(
      `update public.subscriptions set plan = 'trial', status = 'trialing', trial_ends_at = now() + interval '7 days'
        where user_id::text like '00000000-0000-4000-8000-9%'`
    );
    const r = await radar(U.ana);
    expect(r.people.length).toBe(50);
    expect(r.online).toBe(61);
    await d.sql(`delete from auth.users where email like 'massa%'`);
  });


  // ------------------------------------------------------------------ abas: Ator/avaliador e Perto de você
  it("aba Ator/avaliador saiu (fluxo simples, 19/10): 'atores' é recusada", async () => {
    await expect(radar(U.carla, null, "atores")).rejects.toThrow(/Aba inválida\./);
    await expect(radar(U.carla, null, "outra")).rejects.toThrow(/Aba inválida\./);
  });

  const cidades = async () => {
    const c: Record<string, string | null> = {
      ana: "Curitiba · PR", bruno: "curitíba - pr", carla: "Londrina, PR", diego: "São Paulo · SP", eva: null, fabio: "Curitiba", gil: "Campinas SP",
    };
    for (const [k, v] of Object.entries(c)) await d.sql(`update public.study_profiles set city = $2 where user_id = $1`, [(U as any)[k], v]);
  };

  it("Perto de você: mesma cidade antes do mesmo estado; quem não informou cidade e quem é de longe ficam fora", async () => {
    await cidades();
    const r = await radar(U.ana, null, "perto");
    expect(r.needs_city).toBe(false);
    expect(r.people.map((p: any) => [p.public_name, p.near])).toEqual([
      ["Fábio Reis", "cidade"], ["Bruno Lima", "cidade"], ["Carla Dias", "estado"], // na mesma cidade, a maior compatibilidade primeiro
    ]);
    // quem ficou de fora continua nas outras abas
    expect(nomes(await radar(U.ana))).toEqual(expect.arrayContaining(["Eva Rocha", "Diego Melo", "Gil Nunes"]));
  });

  it("Perto de você: dentro de cada grupo, livres primeiro e depois a compatibilidade", async () => {
    await cidades();
    await d.sql(`update public.study_profiles set city = 'Curitiba · PR' where user_id = $1`, [U.carla]); // três na mesma cidade
    await makeRoom(d.db, { members: [U.bruno, U.eva], phase: "roles" }); // Bruno em sala
    const r = await radar(U.ana, null, "perto");
    const nomesLista = r.people.map((p: any) => p.public_name);
    expect(nomesLista[nomesLista.length - 1]).toBe("Bruno Lima"); // ocupado vai ao fim do grupo
    const livres = r.people.filter((p: any) => p.state === "livre").map((p: any) => p.compat);
    expect(livres).toEqual([...livres].sort((a: number, b: number) => b - a));
  });

  it("Perto de você: quem olha sem cidade recebe o aviso e a lista vazia; só a cidade informada sai, nunca localização", async () => {
    await cidades();
    const r = await radar(U.eva, null, "perto");
    expect(r.needs_city).toBe(true);
    expect(r.people).toEqual([]);
    const ana = await radar(U.ana, null, "perto");
    expect(JSON.stringify(ana)).not.toMatch(/lat|lng|latitude|longitude|gps|geo/i);
    // estado só no mesmo estado: sem sigla, a cidade é igual a qualquer estado informado
    await d.sql(`update public.study_profiles set city = 'Curitiba' where user_id = $1`, [U.ana]);
    const sem = await radar(U.ana, null, "perto");
    expect(sem.people.map((p: any) => [p.public_name, p.near])).toEqual([["Fábio Reis", "cidade"], ["Bruno Lima", "cidade"]]);
  });

  it("Perto de você: bloqueado não aparece; quem desligou o radar também não", async () => {
    await cidades();
    await bloquear(U.ana, U.bruno);
    await d.sql(`update public.study_profiles set radar_visible = false where user_id = $1`, [U.fabio]);
    const r = await radar(U.ana, null, "perto");
    expect(r.people.map((p: any) => p.public_name)).toEqual(["Carla Dias"]);
    expect(nomes(await radar(U.bruno, null, "perto"))).not.toContain("Ana Souza");
  });

  it("dupla_place: lê 'Cidade · UF' em vários jeitos, sem acento, e ignora o que não é sigla", async () => {
    const lugar = async (t: string | null) => (await d.sql<{ r: any }>(`select public.dupla_place($1) as r`, [t]))[0].r;
    expect(await lugar("Curitiba · PR")).toEqual({ city: "curitiba", uf: "pr" });
    expect(await lugar("  São Paulo / SP ")).toEqual({ city: "sao paulo", uf: "sp" });
    expect(await lugar("Belo Horizonte MG")).toEqual({ city: "belo horizonte", uf: "mg" });
    expect(await lugar("Santa Fé")).toEqual({ city: "santa fe", uf: null }); // 'fe' não é sigla
    expect(await lugar("São Paulo")).toEqual({ city: "sao paulo", uf: null }); // 'lo' não é sigla
    expect(await lugar("PR")).toEqual({ city: null, uf: "pr" });
    expect(await lugar("   ")).toBeNull();
    expect(await lugar(null)).toBeNull();
  });

  // ------------------------------------------------------------------ bloqueio (o do chat)
  it("bloqueio do chat: some do baralho e do radar nos dois sentidos, e some do convite", async () => {
    expect(nomes(await radar(U.ana))).toContain("Bruno Lima");
    expect((await deck(U.ana)).cards.map((c: any) => c.public_name)).toContain("Bruno Lima");
    await bloquear(U.ana, U.bruno); // Ana bloqueou Bruno
    for (const [quem, outro] of [[U.ana, "Bruno Lima"], [U.bruno, "Ana Souza"]] as const) {
      expect(nomes(await radar(quem))).not.toContain(outro);
      expect((await deck(quem)).cards.map((c: any) => c.public_name)).not.toContain(outro);
    }
    expect((await radar(U.ana)).online).toBe(5);
    expect((await deck(U.ana)).online).toBe(5);
    // O outro lado do bloqueio também vale (Carla bloqueou Diego).
    await bloquear(U.carla, U.diego);
    expect(nomes(await radar(U.diego))).not.toContain("Carla Dias");
  });

  it("bloqueio: não convida em nenhum sentido (mensagem neutra) e convite antigo some", async () => {
    const velho = await convidar(U.carla, U.diego, STATION.id);
    expect(await d.rpc(U.diego, "app_dupla_invites")).toMatchObject({ invites: [{ room_id: velho.room_id }] });
    await bloquear(U.diego, U.carla);
    expect((await d.rpc(U.diego, "app_dupla_invites")).invites).toEqual([]);
    const aceitar = (await d.sql<any>(`select id from public.study_invites`))[0].id;
    await expect(d.rpc(U.diego, "app_dupla_answer_invite", { p_invite_id: aceitar, p_accept: true })).rejects.toThrow(/Convite não encontrado\./);
    await d.sql(`delete from public.checklist_rooms`);
    await expect(convidar(U.diego, U.carla)).rejects.toThrow(/Carla Dias não pode receber convites agora\./);
    await expect(convidar(U.carla, U.diego)).rejects.toThrow(/Diego Melo não pode receber convites agora\./);
  });

  it("bloqueio: o baralho não forma match com quem bloqueou e nada é gravado", async () => {
    await d.rpc(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right" });
    await bloquear(U.ana, U.bruno);
    expect(await d.rpc(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right" })).toEqual({ matched: false });
    expect(await d.sql(`select 1 from public.study_matches`)).toEqual([]);
    expect(await d.sql(`select 1 from public.study_swipes where from_user = $1`, [U.ana])).toEqual([]);
  });

  it("o mesmo bloqueio do chat: bloquear pela função do chat esconde do radar; desbloquear traz de volta", async () => {
    await d.sql(`insert into public.study_matches (user_a, user_b) values ($1, $2)`, [U.ana, U.bruno]);
    const [c] = await d.sql<{ id: string }>(`select id from public.study_chats`);
    await d.rpc(U.ana, "app_dupla_chat_block", { p_chat_id: c.id, p_block: true });
    expect(nomes(await radar(U.ana))).not.toContain("Bruno Lima");
    expect(nomes(await radar(U.bruno))).not.toContain("Ana Souza");
    await d.rpc(U.ana, "app_dupla_chat_block", { p_chat_id: c.id, p_block: false });
    expect(nomes(await radar(U.ana))).toContain("Bruno Lima");
  });

  // ------------------------------------------------------------------ convite direto
  it("convidar: quem convida é o ator, sala na preparação com a estação, sem match, convite 'direto' de 60 s", async () => {
    const r = await convidar(U.ana, U.bruno, STATION.id); // Ana topa qualquer papel, Bruno quer ser ator
    expect(r.partner).toEqual({ user_id: U.bruno, public_name: "Bruno Lima" });
    const [sala] = await d.sql<any>(`select * from public.checklist_rooms where id = $1`, [r.room_id]);
    expect(sala).toMatchObject({ phase: "setup", round: 1, match_id: null, station_id: STATION.id, candidate_id: U.bruno, evaluator_id: U.ana, duration_ms: 600000 });
    expect(sala.member_ids.sort()).toEqual([U.ana, U.bruno].sort());
    const [conv] = await d.sql<any>(`select kind, status, from_user, to_user, extract(epoch from (expires_at - created_at))::int as prazo from public.study_invites where room_id = $1`, [r.room_id]);
    expect(conv).toMatchObject({ kind: "direto", status: "pending", from_user: U.ana, to_user: U.bruno });
    expect(conv.prazo).toBe(60);
    expect(await d.sql(`select 1 from public.study_matches`)).toEqual([]);
    expect(await d.sql(`select 1 from public.study_swipes`)).toEqual([]);
    await expect(convidar(U.ana, U.bruno, null)).rejects.toThrow("Escolha a estação antes de convidar.");
  });

  it("quem recebe vê o convite com kind e a estação SEM nome nem id (o tema não vai ao candidato)", async () => {
    await convidar(U.ana, U.bruno, STATION.id);
    const v = await d.rpc(U.bruno, "app_dupla_invites");
    expect(v.invites).toHaveLength(1);
    expect(v.invites[0]).toMatchObject({ kind: "direto", from: { user_id: U.ana, public_name: "Ana Souza" } });
    const cru = JSON.stringify(v);
    expect(v.invites[0]).toMatchObject({ station: null, role: "candidate" });
    expect(cru).not.toContain("Clínica Médica");
    expect(cru).not.toContain(STATION.name);
    expect(cru).not.toContain(STATION.id);
    expect(cru).not.toContain(STATION.topic);
    // quem convidou não tem convite na caixa; o convite de match antigo segue com kind 'match' e sem estação se a sala não tem
    expect((await d.rpc(U.ana, "app_dupla_invites")).invites).toEqual([]);
  });

  it("convite de match continua igual (kind 'match')", async () => {
    await d.rpc(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right" });
    const m = await d.rpc(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right" });
    expect(m.matched).toBe(true);
    const v = await d.rpc(U.bruno, "app_dupla_invites");
    expect(v.invites[0]).toMatchObject({ kind: "match", room_id: m.room_id, from: { public_name: "Ana Souza" } });
  });

  it("aceitar leva os dois à mesma sala; recusar fecha 'convite_recusado'; vencer fecha 'convite_expirado'", async () => {
    const a = await convidar(U.ana, U.bruno, STATION.id);
    const [{ id }] = await d.sql<any>(`select id from public.study_invites where room_id = $1`, [a.room_id]);
    expect(await d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: true })).toEqual({ room_id: a.room_id });
    expect((await d.sql<any>(`select phase from public.checklist_rooms where id = $1`, [a.room_id]))[0].phase).toBe("setup");
    await d.sql(`delete from public.checklist_rooms`);

    const b = await convidar(U.carla, U.diego);
    const [{ id: id2 }] = await d.sql<any>(`select id from public.study_invites where room_id = $1`, [b.room_id]);
    expect(await d.rpc(U.diego, "app_dupla_answer_invite", { p_invite_id: id2, p_accept: false })).toEqual({ room_id: null });
    expect((await d.sql<any>(`select phase, closed_reason from public.checklist_rooms where id = $1`, [b.room_id]))[0]).toEqual({ phase: "closed", closed_reason: "convite_recusado" });

    const c = await convidar(U.eva, U.gil);
    await d.sql(`update public.study_invites set expires_at = now() - interval '1 second' where room_id = $1`, [c.room_id]);
    await d.rpc(U.eva, "app_dupla_invites"); // fechamento preguiçoso
    expect((await d.sql<any>(`select phase, closed_reason from public.checklist_rooms where id = $1`, [c.room_id]))[0]).toEqual({ phase: "closed", closed_reason: "convite_expirado" });
  });

  it("recusas do servidor: ele ocupado/fora/sem radar/sem convites, eu em sala, sem acesso, estação inválida, a mim mesmo", async () => {
    await expect(convidar(U.ana, U.ana)).rejects.toThrow(/Escolha inválida\./);
    await expect(convidar(U.ana, "00000000-0000-4000-8000-0000000000ff")).rejects.toThrow(/Colega não encontrado\./);
    await expect(convidar(U.ana, U.bruno, "nao-existe")).rejects.toThrow(/Estação não encontrada\./);
    const recusado = (nome: string) => new RegExp(`${nome} não pode receber convites agora\\.`);
    await seen(d.db, U.bruno, 0, "fora");
    await expect(convidar(U.ana, U.bruno)).rejects.toThrow(recusado("Bruno Lima"));
    await seen(d.db, U.bruno, 200);
    await expect(convidar(U.ana, U.bruno)).rejects.toThrow(recusado("Bruno Lima"));
    await seen(d.db, U.bruno);
    await d.sql(`update public.study_profiles set radar_visible = false where user_id = $1`, [U.bruno]);
    await expect(convidar(U.ana, U.bruno)).rejects.toThrow(recusado("Bruno Lima"));
    await d.sql(`update public.study_profiles set radar_visible = true, allow_direct_invites = false where user_id = $1`, [U.bruno]);
    await expect(convidar(U.ana, U.bruno)).rejects.toThrow(recusado("Bruno Lima"));
    await d.sql(`update public.study_profiles set allow_direct_invites = true, status = 'sozinho' where user_id = $1`, [U.bruno]);
    await expect(convidar(U.ana, U.bruno)).rejects.toThrow(recusado("Bruno Lima"));
    await seen(d.db, U.bruno);
    await makeRoom(d.db, { members: [U.bruno, U.eva], phase: "roles" });
    await expect(convidar(U.ana, U.bruno)).rejects.toThrow(recusado("Bruno Lima"));
    await d.sql(`delete from public.checklist_rooms`);
    await makeRoom(d.db, { members: [U.ana, U.eva], phase: "roles" });
    await expect(convidar(U.ana, U.bruno)).rejects.toThrow(/Você já está em uma sala aberta\. Saia dela antes de convidar\./);
    await d.sql(`delete from public.checklist_rooms`);
    await setPlan(d.db, U.bruno, "trial", "trialing", daqui(-1));
    await expect(convidar(U.ana, U.bruno)).rejects.toThrow(recusado("Bruno Lima"));
    await expect(d.rpc(null, "app_dupla_invite", { p_to: U.bruno })).rejects.toThrow();
  });

  it("quem desligou 'Aparecer no radar' ainda pode convidar", async () => {
    await d.sql(`update public.study_profiles set radar_visible = false where user_id = $1`, [U.ana]);
    expect((await convidar(U.ana, U.bruno)).room_id).toBeTruthy();
  });

  it("estação só dos planos Pro e Elite: os dois precisam de plano pago", async () => {
    await expect(convidar(U.ana, U.bruno, ESTACAO_PRO.id)).rejects.toThrow(/Estação exclusiva dos planos Pro e Elite\./);
    await setPlan(d.db, U.ana, "pro", "active");
    await expect(convidar(U.ana, U.bruno, ESTACAO_PRO.id)).rejects.toThrow(/Estação exclusiva dos planos Pro e Elite\./);
    await setPlan(d.db, U.bruno, "elite", "active");
    expect((await convidar(U.ana, U.bruno, ESTACAO_PRO.id)).room_id).toBeTruthy();
    // no radar, a razão já aparece
    await d.sql(`delete from public.checklist_rooms`);
    await setPlan(d.db, U.bruno, "trial", "trialing", daqui(7));
    const r = await radar(U.ana, ESTACAO_PRO.id);
    expect(r.people.find((p: any) => p.user_id === U.bruno)).toMatchObject({ can_invite: false, why_not: "Não recebe convites." });
    const r2 = await radar(U.carla, ESTACAO_PRO.id);
    expect(r2.people.find((p: any) => p.user_id === U.bruno)).toMatchObject({ can_invite: false, why_not: "Estação exclusiva dos planos Pro e Elite." });
  });

  it("estação não aprovada não serve para alunos", async () => {
    await d.sql(`update public.checklist_stations set medical_review = 'pending' where id = $1`, [STATION.id]).catch(() => undefined);
    const rev = (await d.sql<any>(`select medical_review from public.checklist_stations where id = $1`, [STATION.id]))[0].medical_review;
    try {
      if (rev !== "approved") {
        await expect(convidar(U.ana, U.bruno, STATION.id)).rejects.toThrow(/Estação não encontrada\./);
        await expect(radar(U.ana, STATION.id)).rejects.toThrow(/Estação não encontrada\./);
      }
    } finally {
      await d.sql(`update public.checklist_stations set medical_review = 'approved' where id = $1`, [STATION.id]);
    }
  });

  // ------------------------------------------------------------------ crédito do Stazia Match (ponto de chamada)
  it("crédito do Stazia Match: com a cota desligada não bloqueia; com crédito em falta, as duas pessoas precisam de crédito e ninguém vê o saldo do outro", async () => {
    // Junção da etapa 2: a função do Match (014030) já está no banco; o teste troca o corpo por um substituto e devolve o original.
    const [{ original }] = await d.sql<any>(`select pg_get_functiondef('public.credit_available(uuid,text,integer,timestamptz)'::regprocedure) as original`);
    await d.sql(`create table public.teste_sem_credito (uid uuid primary key)`);
    await d.sql(
      `create or replace function public.credit_available(p_uid uuid, p_pool text, p_n integer default 1, p_now timestamptz default now()) returns boolean
         language sql stable security definer set search_path = '' as $$ select not exists (select 1 from public.teste_sem_credito t where t.uid = p_uid) and p_pool = 'match' $$`
    );
    try {
      await d.sql(`insert into public.teste_sem_credito values ($1)`, [U.ana]);
      await expect(convidar(U.ana, U.bruno)).rejects.toThrow(/sem_credito/); // o meu crédito: a mensagem do próprio crédito
      expect(await d.sql(`select 1 from public.checklist_rooms`)).toEqual([]);
      await d.sql(`delete from public.teste_sem_credito`);
      await d.sql(`insert into public.teste_sem_credito values ($1)`, [U.bruno]);
      await expect(convidar(U.ana, U.bruno)).rejects.toThrow(/Bruno Lima não pode receber convites agora\./); // o dele: neutra, sem dizer o motivo
      expect(await d.sql(`select 1 from public.checklist_rooms`)).toEqual([]);
      expect(await d.sql(`select 1 from public.study_invites`)).toEqual([]);
      await d.sql(`delete from public.teste_sem_credito`);
      expect((await convidar(U.ana, U.bruno)).room_id).toBeTruthy(); // com crédito dos dois, passa
    } finally {
      await d.db.exec(original);
      await d.sql(`drop table public.teste_sem_credito`);
    }
  });

  // ------------------------------------------------------------------ limites (a definir pelo dono; só 1 pendente é fixo)
  it("sem número preenchido: só 1 convite pendente por vez", async () => {
    await convidar(U.ana, U.bruno);
    await expect(convidar(U.ana, U.carla)).rejects.toThrow(/Você já tem um convite aguardando resposta\./);
    // sem limite por hora/dia/espera: depois de cada recusa, outro convite passa
    await d.sql(`update public.study_invites set status = 'canceled'`);
    await d.sql(`delete from public.checklist_rooms`);
    for (const alvo of [U.carla, U.diego, U.eva, U.fabio, U.gil, U.bruno]) {
      const r = await convidar(U.ana, alvo);
      await d.sql(`update public.study_invites set status = 'canceled' where room_id = $1`, [r.room_id]);
      await d.sql(`delete from public.checklist_rooms`);
    }
    const cfg = await d.rpc(U.admin, "app_admin_dupla_radar");
    expect(cfg).toEqual({ convites: { pendentes: 1, por_hora: null, por_dia: null, espera_min: null, pedidos_por_dia: null } });
  });

  it("por hora e por dia: a mensagem diz em quantos minutos tentar de novo", async () => {
    await limites({ por_hora: 2, por_dia: 3, espera_min: null });
    for (const alvo of [U.bruno, U.carla]) {
      const r = await convidar(U.ana, alvo);
      await d.sql(`update public.study_invites set status = 'canceled' where room_id = $1`, [r.room_id]);
      await d.sql(`update public.checklist_rooms set phase = 'closed', closed_reason = 'saiu' where id = $1`, [r.room_id]);
    }
    await expect(convidar(U.ana, U.diego)).rejects.toThrow(/Muitos convites seguidos\. Tente de novo em (59|60) min\./);
    // o primeiro convite sai da janela de 1 h
    await d.sql(`update public.study_invites set created_at = now() - interval '59 minutes' where id = (select id from public.study_invites order by created_at limit 1)`);
    await expect(convidar(U.ana, U.diego)).rejects.toThrow(/Muitos convites seguidos\. Tente de novo em 1 min\./);
    await d.sql(`update public.study_invites set created_at = now() - interval '2 hours'`);
    const ok = await convidar(U.ana, U.diego); // 3º do dia
    await d.sql(`update public.study_invites set status = 'canceled' where room_id = $1`, [ok.room_id]);
    await d.sql(`update public.checklist_rooms set phase = 'closed', closed_reason = 'saiu' where id = $1`, [ok.room_id]);
    await expect(convidar(U.ana, U.eva)).rejects.toThrow(/Muitos convites seguidos\. Tente de novo em \d+ min\./);
  });

  it("depois de recusa ou vencimento, espera antes de reconvidar a MESMA pessoa; quem saiu da sala não espera", async () => {
    await limites({ por_hora: null, por_dia: null, espera_min: 30 });
    const a = await convidar(U.ana, U.bruno);
    const [{ id }] = await d.sql<any>(`select id from public.study_invites where room_id = $1`, [a.room_id]);
    await d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: false });
    await expect(convidar(U.ana, U.bruno)).rejects.toThrow(/Você convidou Bruno Lima há pouco\. Tente de novo em (29|30) min\./);
    expect((await convidar(U.ana, U.carla)).room_id).toBeTruthy(); // outra pessoa pode
    await d.sql(`delete from public.checklist_rooms where phase <> 'closed'`);
    await d.sql(`update public.study_invites set created_at = now() - interval '31 minutes'`);
    expect((await convidar(U.ana, U.bruno)).room_id).toBeTruthy();
    // quem sai da própria sala não fica de castigo
    const [{ room_id }] = await d.sql<any>(`select room_id from public.study_invites where to_user = $1 and status = 'pending'`, [U.bruno]);
    await d.rpc(U.ana, "app_dupla_leave", { p_room_id: room_id });
    expect((await convidar(U.ana, U.bruno)).room_id).toBeTruthy();
  });

  it("recebe um convite por vez: outra pessoa não convida quem já tem convite esperando", async () => {
    await convidar(U.ana, U.bruno);
    await expect(convidar(U.carla, U.bruno)).rejects.toThrow(/Bruno Lima não pode receber convites agora\./);
  });

  it("dois convites juntos: para a mesma pessoa só um passa; da mesma pessoa a duas, só um", async () => {
    const [x, y] = await Promise.allSettled([convidar(U.ana, U.bruno), convidar(U.carla, U.bruno)]);
    expect([x.status, y.status].sort()).toEqual(["fulfilled", "rejected"]);
    await d.sql(`delete from public.checklist_rooms`);
    const [p, q] = await Promise.allSettled([convidar(U.diego, U.eva), convidar(U.diego, U.gil)]);
    expect([p.status, q.status].sort()).toEqual(["fulfilled", "rejected"]);
    const pend = await d.sql(`select 1 from public.study_invites where status = 'pending'`);
    expect(pend.length).toBe(1);
  });

  // ------------------------------------------------------------------ baralho e perfil
  it("baralho e match ignoram quem está treinando sozinho", async () => {
    await d.sql(`update public.study_profiles set status = 'sozinho' where user_id = $1`, [U.bruno]);
    expect((await deck(U.ana)).cards.map((c: any) => c.public_name)).not.toContain("Bruno Lima");
    // Bruno escolheu Ana antes de ir treinar sozinho; Ana escolhe Bruno agora: sem match
    await d.sql(`insert into public.study_swipes (from_user, to_user, direction) values ($1, $2, 'right')`, [U.bruno, U.ana]);
    expect(await d.rpc(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right" })).toEqual({ matched: false });
  });

  it("'Permitir convites diretos': padrão ligado, grava pelo perfil e o perfil antigo continua abrindo", async () => {
    const antes = await d.rpc(U.ana, "app_dupla_profile");
    expect(antes.profile.allow_direct_invites).toBe(true);
    const salvo = await d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { allow_direct_invites: false } });
    expect(salvo.profile.allow_direct_invites).toBe(false);
    expect(salvo.profile.public_name).toBe("Ana Souza"); // o resto do perfil não mudou
    expect((await radar(U.bruno)).people.find((p: any) => p.user_id === U.ana)).toMatchObject({ can_invite: false, why_not: "Não recebe convites." });
    await expect(d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { allow_direct_invites: "sim" } })).rejects.toThrow(/Dados do perfil inválidos\./);
    expect((await d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { allow_direct_invites: true } })).profile.allow_direct_invites).toBe(true);
    // salvar outro campo não desliga os convites
    expect((await d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { bio: "Outra bio" } })).profile.allow_direct_invites).toBe(true);
  });

  // ------------------------------------------------------------------ painel
  it("painel: só administrador; grava só 'convites' sem tocar em aberto, planos e outros blocos; vazio = sem limite", async () => {
    await d.sql(`update public.app_settings set value = value || '{"sozinho": {"aberto": false, "ia": {"limite_dia": null}}}'::jsonb where key = 'treino_dupla'`);
    const quem = [U.ana, U.fabio, U.gil];
    for (const uid of quem) await expect(d.rpc(uid, "app_admin_save_dupla_radar", { p_config: { convites: {} } })).rejects.toThrow();
    for (const uid of quem) await expect(d.rpc(uid, "app_admin_dupla_radar")).rejects.toThrow();
    const salvo = await d.rpc(U.admin, "app_admin_save_dupla_radar", { p_config: { convites: { por_hora: 4, por_dia: 15, espera_min: null } } });
    expect(salvo).toEqual({ convites: { pendentes: 1, por_hora: 4, por_dia: 15, espera_min: null, pedidos_por_dia: null } });
    const [{ value }] = await d.sql<any>(`select value from public.app_settings where key = 'treino_dupla'`);
    expect(value).toMatchObject({ aberto: true, planos: ["trial", "pro", "elite"], sozinho: { aberto: false, ia: { limite_dia: null } }, convites: { por_hora: 4, por_dia: 15, espera_min: null } });
    expect((await d.sql<any>(`select count(*)::int as n from public.admin_audit where action = 'dupla.convites'`).catch(() => [{ n: 1 }]))[0].n).toBeGreaterThanOrEqual(1);
    for (const ruim of [
      { convites: { por_hora: 0, por_dia: 1, espera_min: 1 } }, { convites: { por_hora: 61, por_dia: 1, espera_min: 1 } },
      { convites: { por_hora: 1, por_dia: 201, espera_min: 1 } }, { convites: { por_hora: 1, por_dia: 1, espera_min: 1441 } },
      { convites: { por_hora: "5", por_dia: 1, espera_min: 1 } }, { convites: { por_hora: 1.5, por_dia: 1, espera_min: 1 } }, { convites: [] }, {}, null,
    ]) await expect(d.rpc(U.admin, "app_admin_save_dupla_radar", { p_config: ruim }), JSON.stringify(ruim)).rejects.toThrow(/Configuração dos convites inválida\./);
    // salvar vazio apaga os limites
    expect(await d.rpc(U.admin, "app_admin_save_dupla_radar", { p_config: { convites: { por_hora: null, por_dia: null, espera_min: null } } })).toEqual({ convites: { pendentes: 1, por_hora: null, por_dia: null, espera_min: null, pedidos_por_dia: null } });
  });

  it("o painel antigo (aberto e planos) não apaga os limites dos convites preenchidos", async () => {
    await limites({ por_hora: 4, por_dia: 15, espera_min: 10 });
    const lido = await d.rpc(U.admin, "app_admin_dupla_radar");
    expect(lido.convites).toMatchObject({ por_hora: 4, por_dia: 15, espera_min: 10 });
  });

  // ------------------------------------------------------------------ chat: denúncias por 180 dias
  it("denúncias do chat: o prazo nasce em 180 dias; encerradas há mais que isso são apagadas, as outras ficam", async () => {
    const [{ value }] = await d.sql<any>(`select value from public.app_settings where key = 'treino_dupla_chat'`);
    expect(value.guarda_denuncia_dias).toBe(180);
    expect(value).toMatchObject({ max: 600, rajada: 5, janela_s: 30 });
    expect(value.palavras).toEqual(["idiota", "imbecil", "babaca", "otario", "porra", "caralho", "merda", "puta", "puto"]);
    const ins = (status: string, diasFechada: number | null, nome: string) =>
      d.sql(
        `insert into public.study_chat_reports (reporter_name, reported_name, status, closed_at) values ($1, 'X', $2, case when $3::int is null then null else now() - ($3::int || ' days')::interval end)`,
        [nome, status, diasFechada]
      );
    await ins("encerrada", 181, "velha");
    await ins("encerrada", 100, "recente");
    await ins("aberta", null, "aberta");
    await d.sql(`insert into public.study_matches (user_a, user_b) values ($1, $2)`, [U.ana, U.bruno]);
    const [c] = await d.sql<{ id: string }>(`select id from public.study_chats`);
    await d.rpc(U.ana, "app_dupla_chat_messages", { p_chat_id: c.id }); // qualquer chamada do chat roda a limpeza
    const ficou = (await d.sql<any>(`select reporter_name from public.study_chat_reports order by reporter_name`)).map((r) => r.reporter_name);
    expect(ficou).toEqual(["aberta", "recente"]);
    // o administrador ainda pode mudar o prazo; colar a migração de novo não desfaz
    await d.sql(`update public.app_settings set value = jsonb_set(value, '{guarda_denuncia_dias}', '30') where key = 'treino_dupla_chat'`);
    await d.db.exec(SQL_1);
    await recolarFluxoSimples(d.db); // a 014000 sozinha volta o convite e a lista de antes do fluxo simples (014130)
    expect((await d.sql<any>(`select value -> 'guarda_denuncia_dias' as v from public.app_settings where key = 'treino_dupla_chat'`))[0].v).toBe(30);
  });

  // ------------------------------------------------------------------ colagem
  it("colar as duas migrações de novo dá o mesmo banco; permissões como as das outras app_dupla_*", async () => {
    const retrato = async () => ({
      funcoes: await d.sql(`select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`),
      politicas: await d.sql(`select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' order by 1, 2`),
      regras: await d.sql(`select conrelid::regclass::text as t, conname, pg_get_constraintdef(oid) as def from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
      indices: await d.sql(`select indexname, indexdef from pg_indexes where schemaname = 'public' order by 1`),
      gatilhos: await d.sql(`select tgname from pg_trigger where not tgisinternal order by 1`),
      colunas: await d.sql(`select table_name, column_name, column_default, is_nullable from information_schema.columns where table_schema = 'public' and table_name in ('study_profiles', 'study_invites') order by 1, 2`),
      dados: await d.sql(`select key, value from public.app_settings order by key`),
    });
    const antes = await retrato();
    await d.db.exec(SQL_1);
    await d.db.exec(SQL_2);
    // Junção da etapa 2: as do Treino que vêm depois refazem funções destas (app_dupla_swipe na 014040/014050); recoladas na ordem.
    for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.includes("treino_dupla") && x > "20261003014010").sort()) {
      await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    }
    expect(await retrato()).toEqual(antes);
    const acl = Object.fromEntries((antes.funcoes as any[]).map((f) => [f.id, f.acl]));
    for (const f of ["app_dupla_radar(text,text)", "app_dupla_invite(uuid,text)", "app_dupla_deck()", "app_dupla_save_profile(jsonb)"]) expect(acl[f], f).toBe(acl["app_dupla_room(uuid,integer)"]);
    for (const f of ["app_admin_dupla_radar()", "app_admin_save_dupla_radar(jsonb)"]) {
      expect(acl[f], f).not.toContain("anon");
    }
    for (const f of ["dupla_radar_settings()", "dupla_blocked(uuid,uuid)", "dupla_hides(uuid,uuid)", "dupla_place(text)", "dupla_near(jsonb,jsonb)"]) {
      expect(acl[f], f).not.toContain("authenticated");
      expect(acl[f], f).not.toContain("anon");
    }
    // as funções novas e refeitas rodam com search_path vazio e como security definer
    for (const f of antes.funcoes as any[]) {
      if (/^(app_dupla_radar|app_dupla_invite|app_admin_dupla_radar|app_admin_save_dupla_radar|dupla_radar_settings|dupla_blocked|dupla_hides)\(/.test(f.id)) {
        expect(f.def, f.id).toMatch(/SECURITY DEFINER/);
        expect(f.def, f.id).toMatch(/search_path=""|search_path TO ''|SET search_path TO ''/);
      }
    }
  });
});
