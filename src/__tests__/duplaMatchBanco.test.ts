// @vitest-environment node
/**
 * Treinamento em Dupla · Etapa 4 · Tarefa 11: a migração 9770 (supabase/migrations/…9770_treino_dupla_match.sql).
 * Sinal de "online", baralho com a compatibilidade do protótipo (match-rules.js), escolha ("Pular" / "Estudar junto"), match,
 * convite e saída da sala, conferidos num Postgres em memória (PGlite) com as regras reais (todas as migrações, em ordem).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, STATION, U, addProfile, addSession, addStation, makeRoom, openDuplaDb, seen, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const MIGRACAO = "20261003013320_treino_dupla_match.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8");
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const diasAtras = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();
const ABERTO = { aberto: true, planos: ["trial", "pro", "elite"] };
const SEM_ACESSO = /Sem acesso ao Treinamento em Dupla\./;
const SEM_PERFIL = "Crie seu perfil de estudo antes de procurar uma dupla.";
const SEMANA = ["Seg", "Ter", "Qua", "Qui"];

// Perfis do plano (Tarefa 11): papel, áreas, dias, turno, ritmo e prova.
const PERFIS: Record<string, Record<string, unknown>> = {
  ana: { public_name: "Ana Souza", role_pref: "any", areas: ["CM", "CR"], days: SEMANA, shifts: ["Noite"], pace: "cronometrado", exam: "2026/2", school: "UFPR", city: "Curitiba", goal: "Passar na 2ª fase", bio: "Oi!" },
  bruno: { public_name: "Bruno Lima", role_pref: "ator", areas: ["CM", "PED"], days: ["Seg", "Qua", "Sex"], shifts: ["Noite"], pace: "cronometrado", exam: "2026/2" },
  carla: { public_name: "Carla Dias", role_pref: "med", areas: ["CM", "CR"], days: ["Ter", "Qua", "Qui"], shifts: ["Noite"], pace: "cronometrado", exam: "2026/2" },
  diego: { public_name: "Diego Melo", role_pref: "any", areas: ["GO", "PED"], days: SEMANA, shifts: ["Noite"], pace: "cronometrado", exam: "2026/2" },
  eva: { public_name: "Eva Rocha", role_pref: "med", areas: ["GO"], days: ["Sáb"], shifts: ["Manhã"], pace: "simulacao", exam: "2027/1" },
  fabio: { public_name: "Fábio Reis", role_pref: "med", areas: ["CM", "CR"], days: SEMANA, shifts: ["Noite"], pace: "cronometrado", exam: "2026/2" },
  gil: { public_name: "Gil Nunes", role_pref: "ator", areas: [], days: [], shifts: [], pace: "livre", exam: "2027/1" },
};
const COM_SINAL = ["ana", "bruno", "carla", "diego", "eva"] as const;

describe("Migração 9770 — sinal, baralho, escolha, match, convite e saída da sala", () => {
  let d: DuplaDb;

  const deck = (uid: string) => d.rpc(uid, "app_dupla_deck");
  const ids = (cards: any[]) => cards.map((c) => c.user_id);
  const nomes = (cards: any[]) => cards.map((c) => c.public_name);
  const swipe = (de: string, para: string, direcao: "right" | "left", estacao?: string | null) =>
    d.rpc(de, "app_dupla_swipe", { p_to: para, p_direction: direcao, ...(estacao === undefined ? {} : { p_station_id: estacao }) });

  /** Perfis do plano de volta ao estado inicial: sinal agora em Ana, Bruno, Carla, Diego e Eva; Fábio e Gil sem sinal. */
  const montar = async () => {
    await d.sql(`delete from public.checklist_study_sessions`);
    await d.sql(`delete from public.checklist_rooms`); // convites caem junto; matches ficam sem sala
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
    await addStation(d.db); // teste-dupla-e01
  }, 120_000);
  beforeEach(async () => {
    await montar();
  }, 60_000);
  afterAll(async () => {
    await d?.db.close();
  });

  // ------------------------------------------------------------------ compatibilidade
  it("compatibilidade como em match-rules.js, vista de quem olha", async () => {
    const ana = await deck(U.ana);
    expect(ids(ana.cards)).toEqual([U.carla, U.bruno, U.diego, U.eva]);
    expect(ana.cards.map((c: any) => c.compat)).toEqual([92, 78, 63, 41]);
    expect(ana.hidden_by_role).toBe(0);
    expect(ana.online).toBe(4);
    expect(ana.matches_today).toBe(0);
    expect(ana.open_room).toBeNull();
    expect(new Date(ana.server_now).getTime()).toBeGreaterThan(Date.now() - 60_000);

    // Fábio (médico, sem sinal, só olha): papel elimina quem também quer ser médico (Carla e Eva = 2 ocultos).
    const fabio = await deck(U.fabio);
    expect(ids(fabio.cards)).toEqual([U.ana, U.bruno, U.diego]);
    expect(fabio.cards.map((c: any) => c.compat)).toEqual([94, 84, 69]);
    expect(fabio.hidden_by_role).toBe(2);
    expect(fabio.online).toBe(5);
    // Gil (ator, sem áreas, dias e turnos): meia nota nas áreas e 0,2 nos dias; o mesmo papel (Bruno) fica oculto.
    const gil = await deck(U.gil);
    expect(gil.cards.find((c: any) => c.user_id === U.carla).compat).toBe(63);
    expect(gil.hidden_by_role).toBe(1);
    // A conta é de quem olha: Bruno → Ana não é Ana → Bruno.
    const bruno = await deck(U.bruno);
    expect(bruno.cards.find((c: any) => c.user_id === U.ana).compat).toBe(79);
    expect(ids(bruno.cards)).not.toContain(U.bruno);
  });

  it("empate na compatibilidade: quem teve sinal mais recente vem primeiro", async () => {
    await d.sql(`update public.study_profiles set days = $2 where user_id = $1`, [U.carla, SEMANA]); // Carla igual a Fábio
    await seen(d.db, U.fabio, 20);
    await seen(d.db, U.carla, 50);
    const bruno = await deck(U.bruno);
    const [a, b] = ["carla", "fabio"].map((n) => bruno.cards.findIndex((c: any) => c.user_id === (U as any)[n]));
    expect(bruno.cards[a].compat).toBe(bruno.cards[b].compat);
    expect(b).toBeLessThan(a); // Fábio (sinal há 20 s) antes de Carla (há 50 s)
    await seen(d.db, U.carla, 5);
    const depois = await deck(U.bruno);
    expect(depois.cards.findIndex((c: any) => c.user_id === U.carla)).toBeLessThan(depois.cards.findIndex((c: any) => c.user_id === U.fabio));
  });

  it("razões com os textos do protótipo", async () => {
    const razoes = async (de: string, para: string) =>
      (await deck(de)).cards.find((c: any) => c.user_id === para).reasons;
    expect(await razoes(U.ana, U.bruno)).toEqual([
      { icon: "arrow-left-right", text: "Bruno quer ser ator/avaliador; você topa qualquer papel", strong: true },
      { icon: "stethoscope", text: "Clínica Médica em comum" },
      { icon: "clock", text: "Noite · 2 dias em comum" },
      { icon: "timer", text: "Cronometrado" },
    ]);
    // Papéis complementares (com o primeiro nome do outro) e "um flexível" visto do outro lado.
    expect((await razoes(U.fabio, U.bruno))[0]).toEqual({ icon: "arrow-left-right", text: "Papéis complementares: você médico(a), Bruno ator/avaliador", strong: true });
    expect((await razoes(U.bruno, U.carla)).length).toBeGreaterThan(0); // Bruno e Carla se completam
    expect((await razoes(U.bruno, U.carla))[0]).toEqual({ icon: "arrow-left-right", text: "Papéis complementares: você ator/avaliador, Carla médico(a)", strong: true });
    expect((await razoes(U.bruno, U.ana))[0]).toEqual({ icon: "arrow-left-right", text: "Ana topa qualquer papel", strong: true });
    // Os dois topam qualquer papel (sem destaque); áreas sem nada em comum não geram razão; turno com 4 dias.
    expect(await razoes(U.ana, U.diego)).toEqual([
      { icon: "shuffle", text: "Os dois topam qualquer papel" },
      { icon: "clock", text: "Noite · 4 dias em comum" },
      { icon: "timer", text: "Cronometrado" },
    ]);
    // Prova diferente aparece apagada (weak) no fim; sem ritmo igual não há a razão do ritmo.
    const eva = await razoes(U.ana, U.eva);
    expect(eva[0]).toEqual({ icon: "arrow-left-right", text: "Eva quer ser médico(a); você topa qualquer papel", strong: true });
    expect(eva[eva.length - 1]).toEqual({ icon: "calendar", text: "Prova diferente (2027/1)", weak: true });
    expect(eva.some((r: any) => r.icon === "timer")).toBe(false);
    // Várias áreas e turnos: "Clínica Médica e Cirurgia em comum", "GO e Pediatria", turno sem dia em comum.
    expect((await razoes(U.fabio, U.ana)).find((r: any) => r.icon === "stethoscope").text).toBe("Clínica Médica e Cirurgia em comum");
    await d.sql(`update public.study_profiles set areas = '{GO,PED,MFC}' where user_id = $1`, [U.diego]);
    await d.sql(`update public.study_profiles set areas = '{GO,PED}' where user_id = $1`, [U.ana]);
    expect((await razoes(U.ana, U.diego)).find((r: any) => r.icon === "stethoscope").text).toBe("GO e Pediatria em comum");
    await d.sql(`update public.study_profiles set days = '{Sáb,Dom}' where user_id = $1`, [U.ana]);
    expect((await razoes(U.ana, U.diego)).find((r: any) => r.icon === "clock").text).toBe("Noite");
    await d.sql(`update public.study_profiles set days = '{Seg}' where user_id = $1`, [U.ana]);
    expect((await razoes(U.ana, U.diego)).find((r: any) => r.icon === "clock").text).toBe("Noite · 1 dia em comum");
    // Ritmos: o texto é o do seletor do perfil.
    await d.sql(`update public.study_profiles set pace = 'livre' where user_id in ($1, $2)`, [U.ana, U.diego]);
    expect((await razoes(U.ana, U.diego)).find((r: any) => r.icon === "timer").text).toBe("Treino livre");
    await d.sql(`update public.study_profiles set pace = 'simulacao' where user_id in ($1, $2)`, [U.ana, U.diego]);
    expect((await razoes(U.ana, U.diego)).find((r: any) => r.icon === "timer").text).toBe("Simulação de prova");
  });

  it("a função de compatibilidade e a de papéis têm os números do protótipo", async () => {
    const compat = async (a: string, b: string) =>
      (await d.sql(`select public.dupla_compat(a, b) as c from public.study_profiles a, public.study_profiles b where a.user_id = $1 and b.user_id = $2`, [a, b]))[0].c;
    expect(await compat(U.ana, U.carla)).toMatchObject({ ok: true, compat: 92, kind: "um-flexivel" });
    expect(await compat(U.fabio, U.bruno)).toMatchObject({ ok: true, compat: 84, kind: "complementar" });
    expect(await compat(U.ana, U.diego)).toMatchObject({ ok: true, compat: 63, kind: "flexivel" });
    // Mesmo papel específico elimina: sem nota e sem razões.
    expect(await compat(U.carla, U.eva)).toEqual({ ok: false, compat: 0, kind: "conflito", reasons: [] });
    expect(await compat(U.bruno, U.gil)).toEqual({ ok: false, compat: 0, kind: "conflito", reasons: [] });
    // Limites: nunca abaixo de 40 nem acima de 99 (perfis iguais, tudo em comum, dá no máximo 99).
    await d.sql(`update public.study_profiles set role_pref = 'ator' where user_id = $1`, [U.ana]);
    await d.sql(`update public.study_profiles set role_pref = 'med' where user_id = $1`, [U.fabio]);
    await d.sql(`update public.study_profiles set areas = '{CM}', days = '{Seg}', shifts = '{Noite}', pace = 'livre', exam = '2026/2' where user_id in ($1, $2)`, [U.ana, U.fabio]);
    expect((await compat(U.ana, U.fabio)).compat).toBe(99);
    await d.sql(`update public.study_profiles set areas = '{GO}', days = '{Sáb}', shifts = '{Manhã}', pace = 'simulacao', exam = '2030/1' where user_id = $1`, [U.fabio]);
    expect((await compat(U.ana, U.fabio)).compat).toBe(47); // 40 do papel + 0 + 0 + 4 + 2,5 = 46,5 → 47 (meio sobe, como Math.round)
    // Piso de 40: os dois "qualquer papel" sem mais nada em comum dariam 34,5.
    await d.sql(`update public.study_profiles set role_pref = 'any' where user_id in ($1, $2)`, [U.ana, U.fabio]);
    expect((await compat(U.ana, U.fabio)).compat).toBe(40);
  });

  it("assign: papéis sugeridos como em match-rules.js", async () => {
    const assign = async (a: string, b: string) => (await d.sql(`select public.dupla_assign($1, $2) as r`, [a, b]))[0].r;
    expect(await assign("med", "ator")).toBe("candidato");
    expect(await assign("med", "any")).toBe("candidato");
    expect(await assign("any", "ator")).toBe("candidato");
    expect(await assign("ator", "med")).toBe("ator");
    expect(await assign("ator", "any")).toBe("ator");
    expect(await assign("any", "med")).toBe("ator");
    expect(await assign("any", "any")).toBeNull();
  });

  // ------------------------------------------------------------------ baralho
  it("quem fica fora do baralho e quando volta", async () => {
    const baralho = async () => ids((await deck(U.ana)).cards);
    expect(await baralho()).toEqual([U.carla, U.bruno, U.diego, U.eva]);
    // Radar desligado.
    await d.sql(`update public.study_profiles set radar_visible = false where user_id = $1`, [U.bruno]);
    expect(await baralho()).not.toContain(U.bruno);
    await d.sql(`update public.study_profiles set radar_visible = true where user_id = $1`, [U.bruno]);
    expect(await baralho()).toContain(U.bruno);
    // Sinal de 3 minutos; e de 1 minuto ainda vale.
    await seen(d.db, U.carla, 180);
    expect(await baralho()).not.toContain(U.carla);
    await seen(d.db, U.carla, 60);
    expect(await baralho()).toContain(U.carla);
    // Saiu das telas ("fora").
    await seen(d.db, U.diego, 0, "fora");
    expect(await baralho()).not.toContain(U.diego);
    await seen(d.db, U.diego);
    // Sala aberta (qualquer fase menos "closed"); fechada, volta.
    const sala = await makeRoom(d.db, { members: [U.eva, U.fabio], phase: "setup", candidate: U.eva, evaluator: U.fabio });
    expect(await baralho()).not.toContain(U.eva);
    await d.sql(`update public.checklist_rooms set phase = 'closed' where id = $1`, [sala]);
    expect(await baralho()).toContain(U.eva);
    // Sem acesso ao módulo (plano cancelado) ou sem perfil de estudo.
    await setPlan(d.db, U.bruno, "trial", "canceled");
    expect(await baralho()).not.toContain(U.bruno);
    await setPlan(d.db, U.bruno, "trial", "trialing", daqui(7));
    expect(await baralho()).toContain(U.bruno);
    await d.sql(`delete from public.study_profiles where user_id = $1`, [U.bruno]);
    expect(await baralho()).not.toContain(U.bruno);
    await addProfile(d.db, U.bruno, PERFIS.bruno);
    await seen(d.db, U.bruno);
    // Escolhido por mim há 6 dias (fora) e há 8 (volta); para qualquer lado.
    await d.sql(`insert into public.study_swipes (from_user, to_user, direction, created_at) values ($1, $2, 'left', $4), ($1, $3, 'right', $4)`, [U.ana, U.carla, U.diego, diasAtras(6)]);
    expect(await baralho()).not.toContain(U.carla);
    expect(await baralho()).not.toContain(U.diego);
    await d.sql(`update public.study_swipes set created_at = $1`, [diasAtras(8)]);
    expect(await baralho()).toEqual(expect.arrayContaining([U.carla, U.diego]));
    // Quem me escolheu e eu não vi continua no baralho (para eu poder completar o match).
    await d.sql(`delete from public.study_swipes`);
    await d.sql(`insert into public.study_swipes (from_user, to_user, direction) values ($1, $2, 'right')`, [U.carla, U.ana]);
    expect(await baralho()).toContain(U.carla);
    // Sem perfil: recusa com a mensagem do plano; sem acesso: recusa.
    await expect(deck(U.admin)).rejects.toThrow(SEM_PERFIL);
    await setDupla(d.db, { aberto: false, planos: ["pro", "elite"] });
    await expect(deck(U.ana)).rejects.toThrow(SEM_ACESSO);
    await setDupla(d.db, ABERTO);
    await expect(d.rpc(null, "app_dupla_deck")).rejects.toThrow();
  });

  it("papel: quem fica oculto só conta se estaria no baralho; radar ou sinal fora não somam", async () => {
    expect((await deck(U.fabio)).hidden_by_role).toBe(2);
    await d.sql(`update public.study_profiles set radar_visible = false where user_id = $1`, [U.eva]);
    expect((await deck(U.fabio)).hidden_by_role).toBe(1);
    await seen(d.db, U.carla, 300);
    expect((await deck(U.fabio)).hidden_by_role).toBe(0);
  });

  it("cartão só com campos públicos: instituição com show_school; estatística com show_stats; nunca e-mail ou telefone", async () => {
    const sala = () => makeRoom(d.db, { members: [U.bruno, U.carla], phase: "closed" });
    await addSession(d.db, { room: await sala(), round: 1, doctor: U.bruno, actor: U.carla, station: STATION.id, correctness: 60 });
    await addSession(d.db, { room: await sala(), round: 1, doctor: U.bruno, actor: U.carla, station: STATION.id, correctness: 85 });
    await d.sql(`update public.study_profiles set school = 'UNAM', city = 'Londrina', goal = 'Treinar', bio = 'Bio do Bruno' where user_id = $1`, [U.bruno]);

    const card = async (de: string, para: string) => (await deck(de)).cards.find((c: any) => c.user_id === para);
    const completo = await card(U.ana, U.bruno);
    expect(completo).toMatchObject({
      user_id: U.bruno, public_name: "Bruno Lima", school: "UNAM", city: "Londrina", exam: "2026/2", bio: "Bio do Bruno", goal: "Treinar",
      areas: ["CM", "PED"], role_pref: "ator", pace: "cronometrado", days: ["Seg", "Qua", "Sex"], shifts: ["Noite"],
      stats: { done: 2, avg: 7.25 }, online: true,
    });
    expect(Object.keys(completo).sort()).toEqual(
      ["areas", "bio", "city", "compat", "days", "exam", "goal", "online", "pace", "public_name", "reasons", "role_pref", "school", "shifts", "stats", "user_id"]
    );
    // Instituição e estatística escondidas quando a pessoa pede.
    await d.sql(`update public.study_profiles set show_school = false, show_stats = false where user_id = $1`, [U.bruno]);
    const escondido = await card(U.ana, U.bruno);
    expect(escondido.school).toBeNull();
    expect(escondido.stats).toBeNull();
    expect(escondido.city).toBe("Londrina");
    // Quem ainda não fez nenhuma estação: 0 feitas e média vazia.
    expect((await card(U.bruno, U.carla)).stats).toEqual({ done: 0, avg: null });
    // O texto do cartão nunca traz e-mail nem telefone da conta.
    expect(JSON.stringify(await deck(U.ana))).not.toMatch(/@teste\.dev|phone|email/i);
  });

  it("matches hoje desde 0 h de Brasília", async () => {
    const [{ zero }] = await d.sql<{ zero: string }>(
      `select (extract(epoch from (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) * 1000)::text as zero`
    );
    const zeroMs = Number(zero);
    const em = (ms: number) => new Date(ms).toISOString();
    await d.sql(`insert into public.study_matches (user_a, user_b, created_at) values ($1, $2, $3), ($4, $2, $5), ($1, $6, $7), ($8, $9, $3)`, [
      U.bruno, U.ana, em(zeroMs + 60_000), // hoje 0h01: conta
      U.carla, em(zeroMs - 60_000), // ontem 23h59: não conta
      U.diego, em(zeroMs + 120_000), // dos outros dois: não é da Ana
      U.eva, U.fabio,
    ]);
    // Ana: o de 0h01 como user_b (conta); o de ontem não; o de Bruno-Diego e Eva-Fábio não são dela.
    expect((await deck(U.ana)).matches_today).toBe(1);
    await d.sql(`insert into public.study_matches (user_a, user_b, created_at) values ($1, $2, now())`, [U.ana, U.diego]);
    expect((await deck(U.ana)).matches_today).toBe(2);
    expect((await deck(U.eva)).matches_today).toBe(1);
    expect((await deck(U.gil)).matches_today).toBe(0);
  });

  // ------------------------------------------------------------------ escolha e match
  it("Estudar junto sem reciprocidade grava e não dá match; recíproco com os dois online forma sala, match e convite", async () => {
    expect(await swipe(U.ana, U.bruno, "right")).toEqual({ matched: false });
    const [escolha] = await d.sql(`select from_user, to_user, direction, station_id from public.study_swipes`);
    expect(escolha).toEqual({ from_user: U.ana, to_user: U.bruno, direction: "right", station_id: null });
    expect(await d.sql(`select 1 from public.study_matches`)).toHaveLength(0);
    // Regrava: Ana muda de ideia ("Pular") e depois volta atrás; a linha é uma só.
    expect(await swipe(U.ana, U.bruno, "left")).toEqual({ matched: false });
    expect(await d.sql(`select direction from public.study_swipes`)).toEqual([{ direction: "left" }]);
    expect(await swipe(U.ana, U.bruno, "right")).toEqual({ matched: false });
    expect(await d.sql(`select direction from public.study_swipes`)).toEqual([{ direction: "right" }]);

    // Pular de volta não forma nada.
    expect(await swipe(U.bruno, U.ana, "left")).toEqual({ matched: false });
    expect(await d.sql(`select 1 from public.study_matches`)).toHaveLength(0);

    const r = await swipe(U.bruno, U.ana, "right");
    expect(r).toEqual({ matched: true, room_id: expect.any(String), partner: { user_id: U.ana, public_name: "Ana Souza" } });
    const [sala] = await d.sql(`select * from public.checklist_rooms`);
    expect(sala).toMatchObject({ id: r.room_id, phase: "roles", round: 1, member_ids: [U.bruno, U.ana], station_id: null, call_link: null });
    const [match] = await d.sql(`select * from public.study_matches`);
    expect(match).toMatchObject({ user_a: U.ana, user_b: U.bruno, room_id: r.room_id, station_id: null });
    expect(sala.match_id).toBe(match.id);
    const [convite] = await d.sql(`select from_user, to_user, room_id, status, extract(epoch from (expires_at - created_at)) as prazo from public.study_invites`);
    expect(convite).toMatchObject({ from_user: U.bruno, to_user: U.ana, room_id: r.room_id, status: "pending" });
    expect(Number(convite.prazo)).toBe(60);
    // Os dois têm sala aberta agora: ninguém mais os vê no baralho.
    expect(ids((await deck(U.carla)).cards)).not.toEqual(expect.arrayContaining([U.ana]));
    expect(ids((await deck(U.carla)).cards)).not.toContain(U.bruno);
    // Meu sinal é regravado a cada escolha.
    await seen(d.db, U.carla, 90);
    await swipe(U.carla, U.diego, "left");
    expect(Number((await d.sql(`select extract(epoch from (now() - last_seen_at)) as s from public.study_profiles where user_id = $1`, [U.carla]))[0].s)).toBeLessThan(10);
  });

  it("escolha inválida, colega ou estação que não existem", async () => {
    await expect(swipe(U.ana, U.bruno, "up" as any)).rejects.toThrow("Escolha inválida.");
    await expect(swipe(U.ana, U.ana, "right")).rejects.toThrow("Escolha inválida.");
    await expect(d.rpc(U.ana, "app_dupla_swipe", { p_to: null, p_direction: "right" })).rejects.toThrow("Escolha inválida.");
    await expect(swipe(U.ana, "00000000-0000-4000-8000-0000000000ff", "right")).rejects.toThrow("Colega não encontrado.");
    await expect(swipe(U.ana, U.bruno, "right", "nao-existe")).rejects.toThrow("Estação não encontrada.");
    await addStation(d.db, { ...STATION, id: "teste-dupla-pendente" }, { medical_review: "pending" });
    await expect(swipe(U.ana, U.bruno, "right", "teste-dupla-pendente")).rejects.toThrow("Estação não encontrada.");
    // Sem perfil de estudo próprio, sem acesso e sem login: recusa.
    await expect(swipe(U.admin, U.bruno, "right")).rejects.toThrow(SEM_PERFIL);
    await d.sql(`delete from public.study_profiles where user_id = $1`, [U.bruno]);
    await expect(swipe(U.ana, U.bruno, "right")).rejects.toThrow("Colega não encontrado.");
    await addProfile(d.db, U.bruno, PERFIS.bruno);
    await setDupla(d.db, { aberto: false, planos: ["pro", "elite"] });
    await expect(swipe(U.ana, U.bruno, "right")).rejects.toThrow(SEM_ACESSO);
    await setDupla(d.db, ABERTO);
    await expect(d.rpc(null, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right" })).rejects.toThrow();
    expect(await d.sql(`select 1 from public.study_swipes`)).toHaveLength(0);
  });

  it("estação da sala: a de quem completou, senão a do outro; Pro-only com alguém sem Pro fica sem estação", async () => {
    await addStation(d.db, { ...STATION, id: "teste-dupla-e02", duration_ms: 480000 });
    await addStation(d.db, { ...STATION, id: "teste-dupla-pro", duration_ms: 420000 }, { is_pro_only: true });
    const par = async (primeiro: string | null, segundo: string | null) => {
      await d.sql(`delete from public.checklist_rooms`);
      await d.sql(`delete from public.study_matches`);
      await d.sql(`delete from public.study_swipes`);
      await swipe(U.ana, U.bruno, "right", primeiro);
      const r = await swipe(U.bruno, U.ana, "right", segundo);
      expect(r.matched).toBe(true);
      const [sala] = await d.sql(`select station_id, duration_ms from public.checklist_rooms where id = $1`, [r.room_id]);
      const [match] = await d.sql(`select station_id from public.study_matches`);
      expect(match.station_id).toBe(sala.station_id);
      return sala;
    };
    expect(await par("teste-dupla-e01", "teste-dupla-e02")).toEqual({ station_id: "teste-dupla-e02", duration_ms: 480000 }); // a de quem completou
    expect(await par("teste-dupla-e01", null)).toEqual({ station_id: "teste-dupla-e01", duration_ms: 600000 }); // a do outro
    expect(await par(null, "teste-dupla-e02")).toEqual({ station_id: "teste-dupla-e02", duration_ms: 480000 });
    expect(await par(null, null)).toEqual({ station_id: null, duration_ms: null });
    // Pro-only: sem Pro (teste grátis) nos dois, ou em um só, fica sem estação; com Pro nos dois, vale.
    expect(await par(null, "teste-dupla-pro")).toEqual({ station_id: null, duration_ms: null });
    await setPlan(d.db, U.bruno, "pro", "active");
    expect(await par(null, "teste-dupla-pro")).toEqual({ station_id: null, duration_ms: null }); // só Bruno tem Pro
    await setPlan(d.db, U.ana, "elite", "active");
    expect(await par(null, "teste-dupla-pro")).toEqual({ station_id: "teste-dupla-pro", duration_ms: 420000 });
    expect(await par("teste-dupla-pro", null)).toEqual({ station_id: "teste-dupla-pro", duration_ms: 420000 });
  });

  it("papéis sugeridos por assign; os dois 'qualquer' ficam sem sugestão", async () => {
    const sala = async (primeiro: string, segundo: string) => {
      await d.sql(`delete from public.checklist_rooms`);
      await d.sql(`delete from public.study_matches`);
      await d.sql(`delete from public.study_swipes`);
      await swipe(primeiro, segundo, "right");
      const r = await swipe(segundo, primeiro, "right"); // quem completa é o "eu" do assign
      const [s] = await d.sql(`select candidate_id, evaluator_id from public.checklist_rooms where id = $1`, [r.room_id]);
      return { candidato: s.candidate_id, avaliador: s.evaluator_id, estado: await d.rpc(segundo, "app_dupla_room", { p_room_id: r.room_id }) };
    };
    // Bruno (ator) completa com Ana (qualquer): Bruno avalia e Ana é a candidata.
    const a = await sala(U.ana, U.bruno);
    expect(a).toMatchObject({ candidato: U.ana, avaliador: U.bruno });
    expect(a.estado.me).toMatchObject({ role: "evaluator" });
    expect(a.estado.match_note).toBe("Definido pelo match: você quer ser ator/avaliador e Ana topa qualquer papel. Vocês ainda podem trocar.");
    // Ana (qualquer) completa com Bruno (ator): Ana é a candidata.
    expect(await sala(U.bruno, U.ana)).toMatchObject({ candidato: U.ana, avaliador: U.bruno });
    // Carla (médica) completa com Ana: Carla candidata. Ana (qualquer) completa com Carla: Ana avalia.
    expect(await sala(U.ana, U.carla)).toMatchObject({ candidato: U.carla, avaliador: U.ana });
    expect(await sala(U.carla, U.ana)).toMatchObject({ candidato: U.carla, avaliador: U.ana });
    // Bruno (ator) com Carla (médica): complementares.
    expect(await sala(U.carla, U.bruno)).toMatchObject({ candidato: U.carla, avaliador: U.bruno });
    // Os dois "qualquer": sem sugestão e sem faixa.
    const dd = await sala(U.ana, U.diego);
    expect(dd).toMatchObject({ candidato: null, avaliador: null });
    expect(dd.estado.match_note).toBeNull();
    expect(dd.estado.me.role).toBeNull();
  });

  it("sem match: recíproco de 8 dias, outro sem sinal, outro em sala aberta", async () => {
    const semMatch = async (esperado = false) => {
      const r = await swipe(U.ana, U.bruno, "right");
      if (esperado) expect(r).toMatchObject({ matched: true, partner: { user_id: U.bruno } });
      else expect(r).toEqual({ matched: false });
    };
    // Recíproco de 8 dias.
    await d.sql(`insert into public.study_swipes (from_user, to_user, direction, created_at) values ($1, $2, 'right', $3)`, [U.bruno, U.ana, diasAtras(8)]);
    await semMatch();
    // Recíproco de 6 dias: vale (e a escolha da Ana regravada agora forma a sala).
    await d.sql(`update public.study_swipes set created_at = $3 where from_user = $1 and to_user = $2`, [U.bruno, U.ana, diasAtras(6)]);
    // ... mas antes: o outro sem sinal (3 minutos), "fora" e em sala aberta não formam.
    await seen(d.db, U.bruno, 180);
    await semMatch();
    await seen(d.db, U.bruno, 5, "fora");
    await semMatch();
    await seen(d.db, U.bruno);
    const outra = await makeRoom(d.db, { members: [U.bruno, U.carla], phase: "running", candidate: U.bruno, evaluator: U.carla });
    await semMatch();
    // Eu em sala aberta: também não.
    await d.sql(`delete from public.checklist_rooms`);
    await makeRoom(d.db, { members: [U.ana, U.eva], phase: "roles" });
    await semMatch();
    await d.sql(`update public.checklist_rooms set phase = 'closed'`);
    // Sem acesso de um dos dois: nada. Com tudo certo: forma.
    await setPlan(d.db, U.bruno, "trial", "canceled");
    await semMatch();
    await setPlan(d.db, U.bruno, "trial", "trialing", daqui(7));
    expect(outra).toBeTruthy();
    await semMatch(true);
    expect(await d.sql(`select 1 from public.study_matches`)).toHaveLength(1);
  });

  it("dois 'Estudar junto' juntos dão um match e uma sala só; a função trava o par", async () => {
    const [a, b] = await Promise.all([swipe(U.ana, U.bruno, "right"), swipe(U.bruno, U.ana, "right")]);
    expect([a.matched, b.matched].sort()).toEqual([false, true]);
    expect(await d.sql(`select count(*)::int as n from public.study_matches`)).toEqual([{ n: 1 }]);
    expect(await d.sql(`select count(*)::int as n from public.checklist_rooms`)).toEqual([{ n: 1 }]);
    expect(await d.sql(`select count(*)::int as n from public.study_invites`)).toEqual([{ n: 1 }]);
    const [{ src }] = await d.sql<{ src: string }>(`select prosrc as src from pg_proc where proname = 'app_dupla_swipe' and pronamespace = 'public'::regnamespace`);
    expect(src).toContain("pg_advisory_xact_lock");
    expect(src).toContain("dupla-par:");
  });

  // ------------------------------------------------------------------ convite
  describe("convite", () => {
    const formar = async () => {
      await swipe(U.bruno, U.ana, "right");
      return swipe(U.ana, U.bruno, "right"); // Ana completa; Bruno recebe o convite
    };
    const convites = (uid: string) => d.rpc(uid, "app_dupla_invites");

    it("lista só o pendente no prazo, para quem foi convidado", async () => {
      expect(await convites(U.ana)).toEqual({ invites: [], server_now: expect.any(String) });
      const r = await formar();
      expect(r.matched).toBe(true);
      const bruno = await convites(U.bruno);
      expect(bruno.invites).toEqual([{ id: expect.any(String), room_id: r.room_id, from: { user_id: U.ana, public_name: "Ana Souza" }, expires_at: expect.any(String) }]);
      expect(new Date(bruno.invites[0].expires_at).getTime()).toBeGreaterThan(Date.now());
      expect(new Date(bruno.server_now).getTime()).toBeGreaterThan(Date.now() - 60_000);
      // Quem completou o match não recebe o convite; outras pessoas também não.
      expect((await convites(U.ana)).invites).toEqual([]);
      expect((await convites(U.carla)).invites).toEqual([]);
      // Vencido sai da lista (e a sala fecha na mesma chamada).
      await d.sql(`update public.study_invites set expires_at = now() - interval '1 second'`);
      expect((await convites(U.bruno)).invites).toEqual([]);
      expect((await d.sql(`select phase, closed_reason from public.checklist_rooms`))[0]).toEqual({ phase: "closed", closed_reason: "convite_expirado" });
      await expect(d.rpc(null, "app_dupla_invites")).rejects.toThrow();
    });

    it("aceitar libera a sala", async () => {
      const r = await formar();
      const [{ id }] = (await convites(U.bruno)).invites;
      const [antes] = await d.sql(`select rev from public.checklist_rooms`);
      expect(await d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: true })).toEqual({ room_id: r.room_id });
      expect(await d.sql(`select status from public.study_invites`)).toEqual([{ status: "accepted" }]);
      const [depois] = await d.sql(`select phase, rev, closed_reason from public.checklist_rooms`);
      expect(depois).toEqual({ phase: "roles", rev: antes.rev + 1, closed_reason: null });
      expect((await convites(U.bruno)).invites).toEqual([]);
      // Resposta repetida recusa.
      await expect(d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: true })).rejects.toThrow("Convite já respondido.");
      await expect(d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: false })).rejects.toThrow("Convite já respondido.");
    });

    it("recusar fecha a sala e diz quem recusou", async () => {
      const r = await formar();
      const [{ id }] = (await convites(U.bruno)).invites;
      await d.sql(`update public.checklist_rooms set call_link = 'https://meet.example.com/abc-defg'`);
      expect(await d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: false })).toEqual({ room_id: null });
      expect(await d.sql(`select status from public.study_invites`)).toEqual([{ status: "declined" }]);
      const [sala] = await d.sql(`select phase, closed_reason, call_link from public.checklist_rooms`);
      expect(sala).toEqual({ phase: "closed", closed_reason: "convite_recusado", call_link: null });
      const ana = await d.rpc(U.ana, "app_dupla_room", { p_room_id: r.room_id });
      expect(ana).toMatchObject({ phase: "closed", closed_reason: "convite_recusado", closed_by: { user_id: U.bruno, public_name: "Bruno Lima", me: false } });
      await expect(d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: true })).rejects.toThrow("Convite já respondido.");
    });

    it("vencido avisa e a sala fecha na chamada seguinte", async () => {
      const r = await formar();
      const [{ id }] = (await convites(U.bruno)).invites;
      await d.sql(`update public.study_invites set expires_at = now() - interval '1 second'`);
      await expect(d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: true })).rejects.toThrow("Convite expirado (60 s).");
      await expect(d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: false })).rejects.toThrow("Convite expirado (60 s).");
      // O erro desfaz a chamada; o fechamento é o preguiçoso, na próxima leitura de qualquer um dos dois.
      const ana = await d.rpc(U.ana, "app_dupla_room", { p_room_id: r.room_id });
      expect(ana).toMatchObject({ phase: "closed", closed_reason: "convite_expirado", call_link: null, closed_by: null, invite_pending: false });
      expect(await d.sql(`select status from public.study_invites`)).toEqual([{ status: "canceled" }]);
    });

    it("só o convidado responde; convite que não existe; sem acesso", async () => {
      await formar();
      const [{ id }] = (await convites(U.bruno)).invites;
      await expect(d.rpc(U.ana, "app_dupla_answer_invite", { p_invite_id: id, p_accept: true })).rejects.toThrow("Convite não encontrado.");
      await expect(d.rpc(U.carla, "app_dupla_answer_invite", { p_invite_id: id, p_accept: false })).rejects.toThrow("Convite não encontrado.");
      await expect(d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: "00000000-0000-4000-8000-0000000000ff", p_accept: true })).rejects.toThrow("Convite não encontrado.");
      await expect(d.rpc(null, "app_dupla_answer_invite", { p_invite_id: id, p_accept: true })).rejects.toThrow();
      await setDupla(d.db, { aberto: false, planos: ["pro", "elite"] });
      await expect(d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: true })).rejects.toThrow(SEM_ACESSO);
      await expect(convites(U.bruno)).rejects.toThrow(SEM_ACESSO);
      expect(await d.sql(`select status from public.study_invites`)).toEqual([{ status: "pending" }]);
    });

    it("sala já encerrada: o convite não abre mais", async () => {
      const r = await formar();
      const [{ id }] = (await convites(U.bruno)).invites;
      await d.sql(`update public.checklist_rooms set phase = 'closed', closed_reason = 'saiu' where id = $1`, [r.room_id]);
      await expect(d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: true })).rejects.toThrow("Esta sala já foi encerrada.");
      expect(await d.sql(`select status from public.study_invites`)).toEqual([{ status: "pending" }]);
    });
  });

  // ------------------------------------------------------------------ sair da sala
  it("sair fecha para os dois, apaga o link e cancela o convite; até lá o baralho mostra a sala aberta", async () => {
    await swipe(U.bruno, U.ana, "right");
    const r = await swipe(U.ana, U.bruno, "right"); // Ana completa
    await d.sql(`update public.checklist_rooms set call_link = 'https://meet.example.com/abc-defg-hij'`);
    // Sala aberta esconde o baralho nos dois lados e diz com quem.
    const ana = await deck(U.ana);
    expect(ana.open_room).toEqual({ id: r.room_id, phase: "roles", partner_name: "Bruno Lima" });
    expect(ana.cards).toEqual([]);
    expect((await deck(U.bruno)).open_room).toEqual({ id: r.room_id, phase: "roles", partner_name: "Ana Souza" });
    expect(ana.hidden_by_role).toBe(0);
    expect(ana.online).toBeGreaterThan(0);

    const [antes] = await d.sql(`select rev from public.checklist_rooms`);
    const estado = await d.rpc(U.bruno, "app_dupla_leave", { p_room_id: r.room_id });
    expect(estado).toMatchObject({
      id: r.room_id, phase: "closed", closed_reason: "saiu", call_link: null, rev: antes.rev + 1, invite_pending: false,
      closed_by: { user_id: U.bruno, public_name: "Bruno Lima", me: true },
    });
    expect(await d.sql(`select status from public.study_invites`)).toEqual([{ status: "canceled" }]);
    const [sala] = await d.sql(`select phase, closed_reason, call_link, rev from public.checklist_rooms`);
    expect(sala).toEqual({ phase: "closed", closed_reason: "saiu", call_link: null, rev: antes.rev + 1 });
    // O outro lado vê o mesmo, com "quem saiu".
    expect(await d.rpc(U.ana, "app_dupla_room", { p_room_id: r.room_id })).toMatchObject({ phase: "closed", closed_by: { user_id: U.bruno, me: false } });
    // Sair de novo não muda nada (nem o motivo, nem o rev).
    const repetido = await d.rpc(U.ana, "app_dupla_leave", { p_room_id: r.room_id });
    expect(repetido).toMatchObject({ phase: "closed", closed_reason: "saiu", rev: antes.rev + 1, closed_by: { user_id: U.bruno } });
    // O baralho volta; as duas escolhas (de há instantes) ainda escondem um ao outro por 7 dias.
    const depois = await deck(U.ana);
    expect(depois.open_room).toBeNull();
    expect(ids(depois.cards)).not.toContain(U.bruno);
    expect(ids(depois.cards)).toEqual(expect.arrayContaining([U.carla, U.diego, U.eva]));
    expect(ids((await deck(U.bruno)).cards)).not.toContain(U.ana);
    // Quem não é da sala, ou sem login, ou sem acesso: recusa.
    await expect(d.rpc(U.carla, "app_dupla_leave", { p_room_id: r.room_id })).rejects.toThrow("Sala não encontrada.");
    await expect(d.rpc(U.admin, "app_dupla_leave", { p_room_id: r.room_id })).rejects.toThrow("Sala não encontrada.");
    await expect(d.rpc(null, "app_dupla_leave", { p_room_id: r.room_id })).rejects.toThrow();
    await setDupla(d.db, { aberto: false, planos: ["pro", "elite"] });
    await expect(d.rpc(U.ana, "app_dupla_leave", { p_room_id: r.room_id })).rejects.toThrow(SEM_ACESSO);
  });

  it("sala aberta em qualquer fase (menos fechada) aparece no baralho como sala aberta", async () => {
    const sala = await makeRoom(d.db, { members: [U.ana, U.eva], phase: "running", candidate: U.ana, evaluator: U.eva });
    expect((await deck(U.ana)).open_room).toEqual({ id: sala, phase: "running", partner_name: "Eva Rocha" });
    expect(nomes((await deck(U.carla)).cards)).not.toContain("Eva Rocha");
    await d.sql(`delete from public.study_profiles where user_id = $1`, [U.eva]);
    expect((await deck(U.ana)).open_room).toEqual({ id: sala, phase: "running", partner_name: "Conta excluída" });
  });

  // ------------------------------------------------------------------ sinal
  it("sinal grava hora e situação; situação inválida recusa", async () => {
    await seen(d.db, U.ana, 100, "fora");
    const r = await d.rpc(U.ana, "app_dupla_heartbeat", { p_status: "livre" });
    expect(Object.keys(r)).toEqual(["server_now"]);
    expect(new Date(r.server_now).getTime()).toBeGreaterThan(Date.now() - 60_000);
    const lido = async (uid: string) => (await d.sql(`select status, extract(epoch from (now() - last_seen_at)) as s from public.study_profiles where user_id = $1`, [uid]))[0];
    expect(await lido(U.ana)).toMatchObject({ status: "livre" });
    expect(Number((await lido(U.ana)).s)).toBeLessThan(10);
    // "fora" ao sair das telas; volta ao baralho dos outros só com um novo "livre".
    await d.rpc(U.ana, "app_dupla_heartbeat", { p_status: "fora" });
    expect((await lido(U.ana)).status).toBe("fora");
    expect(ids((await deck(U.carla)).cards)).not.toContain(U.ana);
    await d.rpc(U.ana, "app_dupla_heartbeat", { p_status: "livre" });
    expect(ids((await deck(U.carla)).cards)).toContain(U.ana);
    // "em_estacao" só com sala aberta da pessoa; senão fica "livre".
    await d.rpc(U.ana, "app_dupla_heartbeat", { p_status: "em_estacao" });
    expect((await lido(U.ana)).status).toBe("livre");
    const alheia = await makeRoom(d.db, { members: [U.bruno, U.carla], phase: "setup" });
    await d.rpc(U.ana, "app_dupla_heartbeat", { p_status: "em_estacao", p_room_id: alheia });
    expect((await lido(U.ana)).status).toBe("livre");
    const minha = await makeRoom(d.db, { members: [U.ana, U.eva], phase: "setup" });
    await d.rpc(U.ana, "app_dupla_heartbeat", { p_status: "em_estacao", p_room_id: minha });
    expect((await lido(U.ana)).status).toBe("em_estacao");
    await d.sql(`update public.checklist_rooms set phase = 'closed' where id = $1`, [minha]);
    await d.rpc(U.ana, "app_dupla_heartbeat", { p_status: "em_estacao", p_room_id: minha });
    expect((await lido(U.ana)).status).toBe("livre");
    // Só muda o sinal da própria pessoa.
    expect((await lido(U.bruno)).status).toBe("livre");
    // Situação inválida, vazia e nula recusam e não gravam.
    await expect(d.rpc(U.ana, "app_dupla_heartbeat", { p_status: "ocupado" })).rejects.toThrow("Situação inválida.");
    await expect(d.rpc(U.ana, "app_dupla_heartbeat", { p_status: "" })).rejects.toThrow("Situação inválida.");
    await expect(d.rpc(U.ana, "app_dupla_heartbeat", { p_status: null })).rejects.toThrow("Situação inválida.");
    // Sem perfil de estudo não grava (e não cria perfil), mas responde.
    const semPerfil = await d.rpc(U.admin, "app_dupla_heartbeat", { p_status: "livre" });
    expect(Object.keys(semPerfil)).toEqual(["server_now"]);
    expect(await d.sql(`select 1 from public.study_profiles where user_id = $1`, [U.admin])).toHaveLength(0);
    // Sem login ou sem acesso: recusa.
    await expect(d.rpc(null, "app_dupla_heartbeat", { p_status: "livre" })).rejects.toThrow();
    await setDupla(d.db, { aberto: false, planos: ["pro", "elite"] });
    await expect(d.rpc(U.ana, "app_dupla_heartbeat", { p_status: "livre" })).rejects.toThrow(SEM_ACESSO);
  });

  it("o sinal também fecha o que venceu (fechamento preguiçoso)", async () => {
    await makeRoom(d.db, {
      members: [U.diego, U.eva], phase: "setup",
      extra: { call_link: "https://meet.example.com/x-y-z", updated_at: new Date(Date.now() - 20 * 60_000).toISOString() },
    });
    await d.sql(`update public.study_profiles set last_seen_at = now() - interval '20 minutes' where user_id in ($1, $2)`, [U.diego, U.eva]);
    await d.rpc(U.ana, "app_dupla_heartbeat", { p_status: "livre" });
    expect((await d.sql(`select phase, closed_reason, call_link from public.checklist_rooms`))[0]).toEqual({ phase: "closed", closed_reason: "sem_sinal", call_link: null });
  });

  // ------------------------------------------------------------------ permissões e colagem dupla
  it("permissões: app_* fechadas para visitante, apoios fechados para o navegador, e colar duas vezes dá o mesmo banco", async () => {
    const acesso = async (assinatura: string, papel: string) =>
      (await d.sql<{ ok: boolean }>(`select has_function_privilege($1, $2::regprocedure, 'execute') as ok`, [papel, `public.${assinatura}`]))[0].ok;
    for (const f of [
      "app_dupla_heartbeat(text, uuid)", "app_dupla_deck()", "app_dupla_swipe(uuid, text, text)", "app_dupla_invites()",
      "app_dupla_answer_invite(uuid, boolean)", "app_dupla_leave(uuid)",
    ]) {
      expect(await acesso(f, "anon"), `${f} anon`).toBe(false);
      expect(await acesso(f, "authenticated"), `${f} authenticated`).toBe(true);
    }
    for (const f of ["dupla_compat(public.study_profiles, public.study_profiles)", "dupla_assign(text, text)"]) {
      expect(await acesso(f, "anon"), `${f} anon`).toBe(false);
      expect(await acesso(f, "authenticated"), `${f} authenticated`).toBe(false);
    }
    // Todas as funções novas são security definer com o caminho de busca vazio.
    const soltas = await d.sql<{ proname: string }>(
      `select proname from pg_proc where pronamespace = 'public'::regnamespace
         and proname in ('app_dupla_heartbeat', 'app_dupla_deck', 'app_dupla_swipe', 'app_dupla_invites', 'app_dupla_answer_invite',
                         'app_dupla_leave', 'dupla_compat', 'dupla_assign')
         and (not prosecdef or proconfig is null or not ('search_path=""' = any (proconfig)))`
    );
    expect(soltas).toEqual([]);
    // As que gravam (ou chamam o fechamento) não podem ser "stable".
    const estaveis = await d.sql<{ proname: string }>(
      `select proname from pg_proc where pronamespace = 'public'::regnamespace
         and proname in ('app_dupla_heartbeat', 'app_dupla_deck', 'app_dupla_swipe', 'app_dupla_invites', 'app_dupla_answer_invite', 'app_dupla_leave')
         and provolatile <> 'v'`
    );
    expect(estaveis).toEqual([]);

    const retrato = async () => ({
      funcoes: await d.sql(
        `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1`
      ),
      indices: await d.sql(`select indexname, indexdef from pg_indexes where schemaname = 'public' order by 1`),
      politicas: await d.sql(`select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`),
    });
    const antes = await retrato();
    await d.db.exec(SQL);
    // As do Treino que vêm depois refazem funções desta (a 013510 refaz app_dupla_swipe, a 013520 também): coladas de novo na
    // ordem, o banco volta igual. A linha 'creditos' sai antes (a lista de chaves da 013370 não a conhece; a 013490 a devolve).
    await d.sql(`delete from public.app_settings where key = 'creditos'`);
    for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.includes("treino_dupla") && f > MIGRACAO).sort()) {
      await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    }
    expect(await retrato()).toEqual(antes);
  });
});
