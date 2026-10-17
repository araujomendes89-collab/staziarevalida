// @vitest-environment node
/**
 * Treino em Dupla · nome de usuário com @ (013470/013480) e convite por link com pedido de treino de 24 h (013550).
 * Postgres em memória (PGlite) com todas as migrações, em ordem.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, STATION, U, addProfile, addStation, makeRoom, openDuplaDb, seen, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const SQL_RADAR = fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003013470_treino_dupla_radar.sql"), "utf8");
const SQL_REFEITAS = fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003013480_treino_dupla_radar_refeitas.sql"), "utf8");
const SQL_LINK = fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003013550_treino_dupla_convite_link.sql"), "utf8");
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const ABERTO = { aberto: true, planos: ["trial", "pro", "elite"] };
const FORMATO = /Use de 3 a 20 caracteres/;
const ESTACAO_PRO = { ...STATION, id: "teste-dupla-pro", name: "Estação Pro de teste", is_pro_only: true };
const NOMES: Record<string, string> = { ana: "Ana Souza", bruno: "Bruno Lima", carla: "Carla Dias", diego: "Diego Melo", eva: "Eva Rocha" };

describe("Nome de usuário com @", () => {
  let d: DuplaDb;
  const handleDe = async (uid: string) => (await d.sql<{ handle: string }>(`select handle from public.study_profiles where user_id = $1`, [uid]))[0].handle;
  const trocar = (uid: string, h: string) => d.rpc(uid, "app_dupla_set_handle", { p_handle: h });
  const checar = (uid: string, h: string) => d.rpc(uid, "app_dupla_handle_check", { p_handle: h });

  beforeAll(async () => {
    d = await openDuplaDb();
  }, 120_000);
  beforeEach(async () => {
    await d.sql(`delete from public.study_handle_log`);
    await d.sql(`delete from public.checklist_rooms`);
    await d.sql(`delete from public.study_matches`);
    await d.sql(`delete from public.study_profiles`);
    for (const [k, nome] of Object.entries(NOMES)) await addProfile(d.db, (U as any)[k], { public_name: nome });
    for (const uid of Object.values(U)) await setPlan(d.db, uid, "trial", "trialing", daqui(7));
    await setDupla(d.db, ABERTO);
  }, 60_000);
  afterAll(async () => {
    await d?.db.close();
  });

  it("perfil novo ganha um @ neutro, único e sem dado pessoal", async () => {
    const hs = await Promise.all(Object.keys(NOMES).map((k) => handleDe((U as any)[k])));
    for (const h of hs) expect(h).toMatch(/^revalida\.[a-z0-9]{4}$/);
    expect(new Set(hs).size).toBe(hs.length);
    for (const [k, nome] of Object.entries(NOMES)) {
      const h = await handleDe((U as any)[k]);
      const primeiro = nome.split(" ")[0].toLowerCase();
      if (primeiro.length >= 4) expect(h).not.toContain(primeiro);
      expect(h).not.toMatch(/@|teste\.dev/);
    }
    // pelo app: criar o perfil sem mandar @ também sorteia um
    await d.sql(`delete from public.study_profiles where user_id = $1`, [U.fabio]);
    const r = await d.rpc(U.fabio, "app_dupla_save_profile", { p_profile: { public_name: "Fábio Reis" } });
    expect(r.profile.handle).toMatch(/^revalida\.[a-z0-9]{4}$/);
    expect(await d.sql(`select 1 from public.study_handle_log`)).toEqual([]); // o sorteado não conta como troca
  });

  it("a geração tenta de novo quando o @ já existe ou cai em palavra proibida", async () => {
    // ocupa quase todo o espaço de 4 letras depois de 'revalida.' não dá; força colisões trocando o sorteio: o próprio banco é testado
    const gerar = async () => (await d.sql<{ h: string }>(`select public.dupla_handle_generate() as h`))[0].h;
    const vistos = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const h = await gerar();
      expect(await d.sql<{ p: string | null }>(`select public.dupla_handle_problem($1, null) as p`, [h])).toEqual([{ p: null }]);
      vistos.add(h);
    }
    expect(vistos.size).toBeGreaterThan(30);
    await d.sql(`update public.app_settings set value = jsonb_set(value, '{palavras}', '["revalida"]') where key = 'treino_dupla_chat'`);
    // com 'revalida' proibida, nenhum prefixo serve: o banco desiste com mensagem clara em vez de travar
    await expect(gerar()).rejects.toThrow(/Não foi possível gerar o nome de usuário/);
    await d.sql(`update public.app_settings set value = jsonb_set(value, '{palavras}', '["idiota","imbecil","babaca","otario","porra","caralho","merda","puta","puto"]') where key = 'treino_dupla_chat'`);
  });

  it("backfill: perfis que já existiam ganham um @; colar de novo não muda os que já têm", async () => {
    const antes = await Promise.all([U.ana, U.bruno].map(handleDe));
    await d.sql(`alter table public.study_profiles alter column handle drop not null`);
    await d.sql(`alter table public.study_profiles disable trigger study_profiles_handle_fill`);
    await d.sql(`update public.study_profiles set handle = null where user_id in ($1, $2, $3)`, [U.carla, U.diego, U.eva]);
    await d.db.exec(SQL_RADAR);
    await d.sql(`alter table public.study_profiles enable trigger study_profiles_handle_fill`);
    const todos = await d.sql<{ handle: string }>(`select handle from public.study_profiles`);
    expect(todos.every((t) => /^revalida\.[a-z0-9]{4}$/.test(t.handle))).toBe(true);
    expect(new Set(todos.map((t) => t.handle)).size).toBe(todos.length);
    expect(await Promise.all([U.ana, U.bruno].map(handleDe))).toEqual(antes);
    expect((await d.sql<{ n: string }>(`select is_nullable as n from information_schema.columns where table_name = 'study_profiles' and column_name = 'handle'`))[0].n).toBe("NO");
  });

  it("único sem diferença de maiúsculas e guardado em minúsculas; com @ no começo vale sem o @", async () => {
    expect(await trocar(U.ana, "@Ana.Silva")).toEqual({ handle: "ana.silva" });
    expect(await handleDe(U.ana)).toBe("ana.silva");
    await expect(trocar(U.bruno, "ANA.SILVA")).rejects.toThrow(/Esse @ já está em uso\./);
    await expect(trocar(U.bruno, "Ana.silva")).rejects.toThrow(/Esse @ já está em uso\./);
    // direto no banco o índice também impede
    await expect(d.sql(`update public.study_profiles set handle = 'ANA.SILVA' where user_id = $1`, [U.bruno])).rejects.toThrow();
    await expect(d.sql(`update public.study_profiles set handle = 'Ana_Maiuscula' where user_id = $1`, [U.bruno])).rejects.toThrow();
  });

  it("formato: 3 a 20 de a-z 0-9 . _, sem ponto no começo nem no fim", async () => {
    const ruins = ["ab", "a".repeat(21), "com espaço", "acentuaçao", "ana-silva", "ana!", ".ana", "ana.", "...", "ana@silva", ""];
    for (const h of ruins) await expect(trocar(U.ana, h), JSON.stringify(h)).rejects.toThrow(FORMATO);
    for (const h of ["abc", "a".repeat(20), "ana.silva", "ana_silva", "a.b.c", "_ana_", "123"]) {
      const r = await checar(U.ana, h);
      expect(r, h).toMatchObject({ ok: true, message: "Disponível." });
    }
    expect(await checar(U.ana, "ab")).toMatchObject({ ok: false, code: "formato" });
  });

  it("reservados e parecidos", async () => {
    for (const h of ["admin", "Admin", "admin123", "ad.min", "suporte", "equipe", "revisor", "moderador", "staziamed", "stazia", "stazia_fan", "st.azia", "oficial", "sistema", "staff", "atendimento"]) {
      await expect(trocar(U.ana, h), h).rejects.toThrow(/Esse @ não está disponível\./);
    }
    expect(await checar(U.ana, "admin_joao")).toMatchObject({ ok: true });
    expect(await checar(U.ana, "equipamento")).toMatchObject({ ok: true });
  });

  it("palavra proibida do chat (acento, número no lugar de letra, pontos entre as letras); termo clínico passa", async () => {
    for (const h of ["idiota", "bobo.idiota", "i.d.i.o.t.a", "1d10ta", "idiotas", "meu_idiota"]) {
      await expect(trocar(U.ana, h), h).rejects.toThrow(/Esse @ contém uma palavra não permitida\./);
    }
    expect(await checar(U.ana, "computador")).toMatchObject({ ok: true }); // contém 'puta' no meio, não é a palavra inteira
    expect(await checar(U.ana, "amputacao")).toMatchObject({ ok: true });
  });

  it("o mesmo filtro vale para o nome ('Nome ou apelido')", async () => {
    await expect(d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { public_name: "Ana Idiota" } })).rejects.toThrow(/Esse nome contém uma palavra não permitida\./);
    await expect(d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { public_name: "p0rr4 Silva" } })).rejects.toThrow(/Esse nome contém uma palavra não permitida\./);
    expect((await d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { public_name: "Ana, a Cirurgiã" } })).profile.public_name).toBe("Ana, a Cirurgiã");
    expect((await d.sql(`select public_name from public.study_profiles where user_id = $1`, [U.ana]))[0].public_name).toBe("Ana, a Cirurgiã");
  });

  it("trocar o @ não muda o nome, o user_id, o match, a sala nem a conversa; fica registrado (quem, de, para, quando)", async () => {
    await d.sql(`insert into public.study_matches (user_a, user_b) values ($1, $2)`, [U.ana, U.bruno]);
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", station: null });
    const [chat] = await d.sql<{ id: string }>(`select id from public.study_chats`);
    const velho = await handleDe(U.ana);
    expect(await trocar(U.ana, "ana.cirurgia")).toEqual({ handle: "ana.cirurgia" });
    const p = await d.sql<any>(`select user_id, public_name from public.study_profiles where user_id = $1`, [U.ana]);
    expect(p).toEqual([{ user_id: U.ana, public_name: "Ana Souza" }]);
    expect(await d.sql(`select user_a, user_b from public.study_matches`)).toHaveLength(1);
    expect((await d.sql<any>(`select member_ids from public.checklist_rooms where id = $1`, [sala]))[0].member_ids).toContain(U.ana);
    expect((await d.rpc(U.ana, "app_dupla_chats")).chats.map((c: any) => c.chat_id ?? c.id)).toContain(chat.id);
    const log = await d.sql<any>(`select user_id, old_handle, new_handle, changed_at from public.study_handle_log`);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ user_id: U.ana, old_handle: velho, new_handle: "ana.cirurgia" });
    expect(Math.abs(new Date(log[0].changed_at).getTime() - Date.now())).toBeLessThan(60_000);
    // trocar para o mesmo @ não gasta a troca
    expect(await trocar(U.ana, "ana.cirurgia")).toEqual({ handle: "ana.cirurgia" });
    expect(await d.sql(`select 1 from public.study_handle_log`)).toHaveLength(1);
  });

  it("no máximo 1 troca a cada 15 dias; o @ sorteado não conta; a tela recebe a data", async () => {
    expect(await checar(U.ana, "ana.um")).toMatchObject({ ok: true, next_change_at: null });
    await trocar(U.ana, "ana.um");
    const dep = await checar(U.ana, "ana.dois");
    expect(dep).toMatchObject({ ok: false, code: "espera", message: expect.stringMatching(/^Você poderá trocar de novo em \d{2}\/\d{2}\.$/) });
    expect(dep.next_change_at).toBeTruthy();
    const dias = (new Date(dep.next_change_at).getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(14.9);
    expect(dias).toBeLessThanOrEqual(15);
    await expect(trocar(U.ana, "ana.dois")).rejects.toThrow(/Você poderá trocar de novo em \d{2}\/\d{2}\./);
    // pelo perfil também
    await expect(d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { handle: "ana.tres" } })).rejects.toThrow(/Você poderá trocar de novo em/);
    expect(await handleDe(U.ana)).toBe("ana.um");
    // o @ atual ainda vale, e salvar o perfil sem mexer no @ não é troca
    expect(await checar(U.ana, "ana.um")).toMatchObject({ ok: true, message: "Este já é o seu @." });
    expect((await d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { bio: "Nova bio", handle: "ana.um" } })).profile.handle).toBe("ana.um");
    // depois de 15 dias
    await d.sql(`update public.study_handle_log set changed_at = now() - interval '15 days 1 minute'`);
    expect(await trocar(U.ana, "ana.dois")).toEqual({ handle: "ana.dois" });
    expect((await d.sql(`select 1 from public.study_handle_log`)).length).toBe(2);
  });

  it("pelo perfil: troca registrada, conflito e formato recusados", async () => {
    const r = await d.rpc(U.bruno, "app_dupla_save_profile", { p_profile: { handle: "Bruno.PED", bio: "x" } });
    expect(r.profile).toMatchObject({ handle: "bruno.ped", public_name: "Bruno Lima" });
    expect(await d.sql(`select old_handle, new_handle from public.study_handle_log`)).toEqual([{ old_handle: expect.stringMatching(/^revalida\./), new_handle: "bruno.ped" }]);
    await expect(d.rpc(U.carla, "app_dupla_save_profile", { p_profile: { handle: "BRUNO.ped" } })).rejects.toThrow(/Esse @ já está em uso\./);
    await expect(d.rpc(U.carla, "app_dupla_save_profile", { p_profile: { handle: "x" } })).rejects.toThrow(FORMATO);
    await expect(d.rpc(U.carla, "app_dupla_save_profile", { p_profile: { handle: 5 } })).rejects.toThrow(/Dados do perfil inválidos\./);
  });

  it("corrida: dois alunos pegando o mesmo @ ao mesmo tempo, só um fica", async () => {
    const [a, b] = await Promise.allSettled([trocar(U.ana, "disputa.arroba"), trocar(U.bruno, "Disputa.Arroba")]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect(await d.sql(`select user_id from public.study_profiles where lower(handle) = 'disputa.arroba'`)).toHaveLength(1);
    expect(await d.sql(`select 1 from public.study_handle_log`)).toHaveLength(1);
    const [c, e] = await Promise.allSettled([
      d.rpc(U.carla, "app_dupla_save_profile", { p_profile: { handle: "outra.disputa" } }),
      d.rpc(U.diego, "app_dupla_save_profile", { p_profile: { handle: "OUTRA.disputa" } }),
    ]);
    expect([c.status, e.status].sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("sem perfil não troca; visitante e sem acesso não chamam", async () => {
    await expect(trocar(U.fabio, "fabio.med")).rejects.toThrow(/Crie seu perfil de estudo antes de escolher um @\./);
    await expect(d.rpc(null, "app_dupla_set_handle", { p_handle: "x.y.z" })).rejects.toThrow();
    await expect(d.rpc(null, "app_dupla_handle_check", { p_handle: "x.y.z" })).rejects.toThrow();
    await setPlan(d.db, U.eva, "trial", "trialing", daqui(-1));
    await expect(trocar(U.eva, "eva.go")).rejects.toThrow(/Sem acesso ao Treinamento em Dupla\./);
  });

  it("a equipe lê as trocas (sem e-mail); aluno não", async () => {
    await trocar(U.ana, "ana.log");
    await d.sql(`update public.user_roles set role = 'editor' where user_id = $1`, [U.fabio]);
    const lido = await d.rpc(U.fabio, "app_admin_dupla_handle_log");
    expect(lido.items).toHaveLength(1);
    expect(lido.items[0]).toMatchObject({ user_id: U.ana, public_name: "Ana Souza", new_handle: "ana.log" });
    expect(JSON.stringify(lido)).not.toMatch(/@|teste\.dev|email/i);
    await expect(d.rpc(U.bruno, "app_admin_dupla_handle_log")).rejects.toThrow();
    expect(await d.asUser(U.bruno, `select * from public.study_handle_log`)).toEqual([]); // RLS sem política: o aluno não lê nada
    // a troca some com a conta
    await d.sql(`delete from auth.users where id = $1`, [U.ana]);
    expect(await d.sql(`select 1 from public.study_handle_log`)).toEqual([]);
    await d.sql(`insert into auth.users (id, email) values ($1, 'ana@teste.dev')`, [U.ana]);
  });

  it("o @ aparece no cartão do baralho e do radar; nunca e-mail", async () => {
    for (const k of Object.keys(NOMES)) await seen(d.db, (U as any)[k]);
    await trocar(U.bruno, "bruno.cirurgia");
    const deck = await d.rpc(U.ana, "app_dupla_deck");
    expect(deck.cards.find((c: any) => c.user_id === U.bruno).handle).toBe("bruno.cirurgia");
    const radar = await d.rpc(U.ana, "app_dupla_radar");
    expect(radar.people.find((p: any) => p.user_id === U.bruno).handle).toBe("bruno.cirurgia");
    expect(JSON.stringify([deck, radar])).not.toMatch(/teste\.dev|email/i);
    // o perfil de quem olha traz o seu
    expect((await d.rpc(U.ana, "app_dupla_profile")).profile.handle).toMatch(/^revalida\./);
  });
});

describe("Convite por link e pedido de treino de 24 h", () => {
  let d: DuplaDb;
  const lookup = (uid: string, h: string, est?: string | null) => d.rpc(uid, "app_dupla_link_lookup", { p_handle: h, ...(est === undefined ? {} : { p_station_id: est }) });
  const pedir = (uid: string, h: string, est?: string | null) => d.rpc(uid, "app_dupla_link_request", { p_handle: h, ...(est === undefined ? {} : { p_station_id: est }) });
  const pedidos = (uid: string) => d.rpc(uid, "app_dupla_requests");
  const responder = (uid: string, id: string, ok: boolean) => d.rpc(uid, "app_dupla_answer_request", { p_request_id: id, p_accept: ok });
  const bloquear = (quem: string, alvo: string) => d.sql(`insert into public.study_chat_blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing`, [quem, alvo]);
  const arroba = async (uid: string, h: string) => {
    await d.sql(`update public.study_profiles set handle = $2 where user_id = $1`, [uid, h]);
  };

  beforeAll(async () => {
    d = await openDuplaDb();
    await addStation(d.db);
    await addStation(d.db, ESTACAO_PRO);
    await d.sql(`alter table public.study_profiles drop constraint if exists study_profiles_status_check`);
  }, 120_000);
  beforeEach(async () => {
    await d.sql(`delete from public.study_train_requests`);
    await d.sql(`delete from public.study_chat_blocks`);
    await d.sql(`delete from public.checklist_rooms`);
    await d.sql(`delete from public.study_matches`);
    await d.sql(`delete from public.study_profiles`);
    for (const [k, nome] of Object.entries(NOMES)) await addProfile(d.db, (U as any)[k], { public_name: nome, school: "UFPR", role_pref: "any" });
    for (const k of Object.keys(NOMES)) await seen(d.db, (U as any)[k]);
    await arroba(U.ana, "ana.link");
    await arroba(U.bruno, "bruno.link");
    await arroba(U.carla, "carla.link");
    for (const uid of Object.values(U)) await setPlan(d.db, uid, "trial", "trialing", daqui(7));
    await setDupla(d.db, ABERTO);
  }, 60_000);
  afterAll(async () => {
    await d?.db.close();
  });

  it("link de @ que não existe, de bloqueado (nos dois sentidos) ou de quem não tem acesso: 'não encontrado', sem dizer o motivo", async () => {
    expect(await lookup(U.ana, "ninguem.assim")).toEqual({ found: false });
    expect(await lookup(U.ana, "@BRUNO.link")).toMatchObject({ found: true, self: false });
    await bloquear(U.bruno, U.ana);
    expect(await lookup(U.ana, "bruno.link")).toEqual({ found: false });
    expect(await lookup(U.bruno, "ana.link")).toEqual({ found: false });
    await expect(pedir(U.ana, "bruno.link")).rejects.toThrow(/Este convite não está disponível\./);
    await expect(pedir(U.bruno, "ana.link")).rejects.toThrow(/Este convite não está disponível\./);
    await expect(pedir(U.ana, "ninguem.assim")).rejects.toThrow(/Este convite não está disponível\./);
    await setPlan(d.db, U.carla, "trial", "trialing", daqui(-1));
    expect(await lookup(U.ana, "carla.link")).toEqual({ found: false }); // dono sem acesso ao módulo
    await expect(lookup(U.carla, "ana.link")).rejects.toThrow(/Sem acesso ao Treinamento em Dupla\./);
    await expect(d.rpc(null, "app_dupla_link_lookup", { p_handle: "ana.link" })).rejects.toThrow();
  });

  it("o próprio link", async () => {
    expect(await lookup(U.ana, "ana.link")).toMatchObject({ found: true, self: true });
    await expect(pedir(U.ana, "ana.link")).rejects.toThrow(/Este é o seu próprio link\./);
  });

  it("cartão público: instituição e estatística só se o dono mostra; nunca e-mail; estação sem nome", async () => {
    await d.sql(`update public.study_profiles set show_school = false, show_stats = false where user_id = $1`, [U.bruno]);
    const r = await lookup(U.ana, "bruno.link", STATION.id);
    expect(r.person).toMatchObject({ public_name: "Bruno Lima", handle: "bruno.link", school: null, stats: null });
    expect(r.station).toMatchObject({ area: "Clínica Médica", area_code: "CM", duration_ms: 600000 });
    expect(r.station.label).toMatch(/^Estação/);
    const cru = JSON.stringify(r);
    expect(cru).not.toMatch(/teste\.dev|email|phone/i);
    expect(cru).not.toContain(STATION.name);
    expect(cru).not.toContain(STATION.id);
    expect(Object.keys(r.person).sort()).toEqual(["areas", "bio", "city", "compat", "days", "exam", "goal", "handle", "online", "pace", "public_name", "reasons", "role_pref", "school", "shifts", "stats", "user_id"].sort());
  });

  it("modo: online e livre = convite; offline, em sala ou treinando sozinho = pedido; convites desligados = indisponível", async () => {
    expect((await lookup(U.ana, "bruno.link")).mode).toBe("convite");
    await seen(d.db, U.bruno, 600);
    expect((await lookup(U.ana, "bruno.link")).mode).toBe("pedido");
    await seen(d.db, U.bruno);
    await d.sql(`update public.study_profiles set status = 'sozinho' where user_id = $1`, [U.bruno]);
    expect((await lookup(U.ana, "bruno.link")).mode).toBe("pedido");
    await seen(d.db, U.bruno);
    await makeRoom(d.db, { members: [U.bruno, U.eva], phase: "roles" });
    expect((await lookup(U.ana, "bruno.link")).mode).toBe("pedido");
    await d.sql(`delete from public.checklist_rooms`);
    await d.sql(`update public.study_profiles set allow_direct_invites = false where user_id = $1`, [U.bruno]);
    expect(await lookup(U.ana, "bruno.link")).toMatchObject({ mode: "indisponivel", why_not: "Não recebe convites." });
    await expect(pedir(U.ana, "bruno.link")).rejects.toThrow(/Bruno Lima não pode receber convites agora\./);
    // quem tem o radar desligado ainda recebe por link
    await d.sql(`update public.study_profiles set allow_direct_invites = true, radar_visible = false where user_id = $1`, [U.bruno]);
    expect((await lookup(U.ana, "bruno.link")).mode).toBe("convite");
  });

  it("online e livre: vira o convite direto normal de 60 s, com a estação", async () => {
    const r = await pedir(U.ana, "bruno.link", STATION.id);
    expect(r).toMatchObject({ kind: "convite", partner: { user_id: U.bruno, public_name: "Bruno Lima" } });
    const [conv] = await d.sql<any>(`select kind, status, from_user, to_user, extract(epoch from (expires_at - created_at))::int as s from public.study_invites where room_id = $1`, [r.room_id]);
    expect(conv).toEqual({ kind: "direto", status: "pending", from_user: U.ana, to_user: U.bruno, s: 60 });
    expect((await d.sql<any>(`select station_id, phase from public.checklist_rooms where id = $1`, [r.room_id]))[0]).toEqual({ station_id: STATION.id, phase: "roles" });
    expect(await d.sql(`select 1 from public.study_train_requests`)).toEqual([]);
    expect((await d.rpc(U.bruno, "app_dupla_invites")).invites[0]).toMatchObject({ kind: "direto", from: { public_name: "Ana Souza" } });
    // pelo convite com o radar do dono desligado também
  });

  it("offline: vira um pedido de 24 h, que o dono vê ao abrir o app (estação sem nome)", async () => {
    await seen(d.db, U.bruno, 3600, "fora");
    const r = await pedir(U.ana, "bruno.link", STATION.id);
    expect(r).toMatchObject({ kind: "pedido", partner: { user_id: U.bruno } });
    const [linha] = await d.sql<any>(`select status, station_id, extract(epoch from (expires_at - created_at))::int as s from public.study_train_requests where id = $1`, [r.request_id]);
    expect(linha).toEqual({ status: "pending", station_id: STATION.id, s: 86400 });
    expect(await d.sql(`select 1 from public.study_invites`)).toEqual([]); // nenhum convite de 60 s
    const v = await pedidos(U.bruno);
    expect(v.requests).toHaveLength(1);
    expect(v.requests[0]).toMatchObject({ id: r.request_id, from: { user_id: U.ana, public_name: "Ana Souza", handle: "ana.link" }, station: { area: "Clínica Médica" } });
    expect(JSON.stringify(v)).not.toContain(STATION.name);
    expect(JSON.stringify(v)).not.toContain(STATION.id);
    expect((await pedidos(U.ana)).requests).toEqual([]); // quem pediu não tem pedido na caixa
    expect((await lookup(U.ana, "bruno.link")).pending).toBe(true);
    expect((await lookup(U.bruno, "ana.link")).incoming).toBe(true);
  });

  it("1 pedido por par: repetir, ou o outro lado pedir enquanto há um, é recusado", async () => {
    await seen(d.db, U.bruno, 3600, "fora");
    await seen(d.db, U.ana, 3600, "fora");
    await pedir(U.ana, "bruno.link");
    await expect(pedir(U.ana, "bruno.link")).rejects.toThrow(/Você já pediu para treinar com Bruno Lima\. Aguarde a resposta\./);
    await expect(pedir(U.bruno, "ana.link")).rejects.toThrow(/Ana Souza já pediu para treinar com você\./);
    const [a, b] = await Promise.allSettled([pedir(U.carla, "bruno.link"), pedir(U.carla, "bruno.link")]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("o pedido vence em 24 h: some da caixa, não responde e permite um novo", async () => {
    await seen(d.db, U.bruno, 3600, "fora");
    const r = await pedir(U.ana, "bruno.link");
    await d.sql(`update public.study_train_requests set expires_at = now() - interval '1 second' where id = $1`, [r.request_id]);
    await d.sql(`update public.study_profiles set status = 'livre', last_seen_at = now() where user_id = $1`, [U.bruno]);
    await expect(responder(U.bruno, r.request_id, true)).rejects.toThrow(/Pedido vencido\./);
    expect((await pedidos(U.bruno)).requests).toEqual([]);
    expect((await d.sql<any>(`select status from public.study_train_requests where id = $1`, [r.request_id]))[0].status).toBe("expired");
    await seen(d.db, U.bruno, 3600, "fora");
    expect((await pedir(U.ana, "bruno.link")).kind).toBe("pedido");
    // linhas com mais de 7 dias são apagadas
    await d.sql(`update public.study_train_requests set expires_at = now() - interval '8 days' where status = 'expired'`);
    await pedidos(U.bruno);
    expect((await d.sql(`select 1 from public.study_train_requests where status = 'expired'`)).length).toBe(0);
  });

  it("aceitar cria a sala com a estação e convida quem pediu (60 s, convite direto)", async () => {
    await seen(d.db, U.bruno, 3600, "fora");
    const r = await pedir(U.ana, "bruno.link", STATION.id);
    await seen(d.db, U.bruno); // Bruno abriu o app; Ana também está online
    const ok = await responder(U.bruno, r.request_id, true);
    expect(ok.room_id).toBeTruthy();
    expect(ok.partner).toMatchObject({ user_id: U.ana });
    const [sala] = await d.sql<any>(`select station_id, phase, member_ids from public.checklist_rooms where id = $1`, [ok.room_id]);
    expect(sala).toMatchObject({ station_id: STATION.id, phase: "roles" });
    expect(sala.member_ids.sort()).toEqual([U.ana, U.bruno].sort());
    expect(await d.sql<any>(`select kind, from_user, to_user, status from public.study_invites where room_id = $1`, [ok.room_id])).toEqual([{ kind: "direto", from_user: U.bruno, to_user: U.ana, status: "pending" }]);
    expect((await d.sql<any>(`select status, room_id from public.study_train_requests where id = $1`, [r.request_id]))[0]).toEqual({ status: "accepted", room_id: ok.room_id });
    expect((await d.rpc(U.ana, "app_dupla_invites")).invites[0]).toMatchObject({ kind: "direto", from: { public_name: "Bruno Lima" } });
    await expect(responder(U.bruno, r.request_id, true)).rejects.toThrow(/Pedido já respondido\./);
    expect((await pedidos(U.bruno)).requests).toEqual([]);
  });

  it("aceitar com quem pediu fora do ar: avisa e o pedido continua valendo; outra pessoa não responde o pedido", async () => {
    await seen(d.db, U.bruno, 3600, "fora");
    const r = await pedir(U.ana, "bruno.link");
    await seen(d.db, U.bruno);
    await seen(d.db, U.ana, 3600, "fora");
    await expect(responder(U.bruno, r.request_id, true)).rejects.toThrow(/Ana Souza não pode receber convites agora\./);
    expect((await d.sql<any>(`select status from public.study_train_requests where id = $1`, [r.request_id]))[0].status).toBe("pending");
    expect(await d.sql(`select 1 from public.checklist_rooms`)).toEqual([]);
    await expect(responder(U.carla, r.request_id, true)).rejects.toThrow(/Pedido não encontrado\./);
    await expect(responder(U.ana, r.request_id, false)).rejects.toThrow(/Pedido não encontrado\./);
  });

  it("agora não: encerra sem sala; quem pediu não vê o motivo; espera configurada vale para pedir de novo", async () => {
    await seen(d.db, U.bruno, 3600, "fora");
    const r = await pedir(U.ana, "bruno.link");
    expect(await responder(U.bruno, r.request_id, false)).toEqual({ room_id: null });
    expect((await d.sql<any>(`select status from public.study_train_requests where id = $1`, [r.request_id]))[0].status).toBe("declined");
    expect(await d.sql(`select 1 from public.checklist_rooms`)).toEqual([]);
    expect((await pedir(U.ana, "bruno.link")).kind).toBe("pedido"); // sem espera preenchida, pode de novo
    await d.sql(`update public.study_train_requests set status = 'declined', answered_at = now() where status = 'pending'`);
    await d.sql(`update public.app_settings set value = value || '{"convites": {"espera_min": 30}}'::jsonb where key = 'treino_dupla'`);
    await expect(pedir(U.ana, "bruno.link")).rejects.toThrow(/Você pediu há pouco para treinar com Bruno Lima\. Tente de novo em (29|30) min\./);
    expect((await pedir(U.carla, "bruno.link")).kind).toBe("pedido"); // outra pessoa pode
  });

  it("limite de pedidos por dia: vazio = sem limite; preenchido, a mensagem diz quando tentar de novo", async () => {
    await seen(d.db, U.bruno, 3600, "fora");
    await seen(d.db, U.carla, 3600, "fora");
    await pedir(U.ana, "bruno.link");
    await pedir(U.ana, "carla.link");
    await d.sql(`update public.study_train_requests set status = 'declined'`);
    await d.sql(`update public.app_settings set value = value || '{"convites": {"pedidos_por_dia": 2}}'::jsonb where key = 'treino_dupla'`);
    await expect(pedir(U.ana, "bruno.link")).rejects.toThrow(/Muitos pedidos seguidos\. Tente de novo em \d+ min\./);
    const cfg = await d.rpc(U.admin, "app_admin_save_dupla_radar", { p_config: { convites: { por_hora: null, por_dia: null, espera_min: null, pedidos_por_dia: null } } });
    expect(cfg.convites.pedidos_por_dia).toBeNull();
    expect((await pedir(U.ana, "bruno.link")).kind).toBe("pedido");
  });

  it("bloqueio depois do pedido: some da caixa e não responde", async () => {
    await seen(d.db, U.bruno, 3600, "fora");
    const r = await pedir(U.ana, "bruno.link");
    await bloquear(U.bruno, U.ana);
    expect((await pedidos(U.bruno)).requests).toEqual([]);
    await seen(d.db, U.bruno);
    await expect(responder(U.bruno, r.request_id, true)).rejects.toThrow(/Pedido não encontrado\./);
  });

  it("trocar o @ invalida o link antigo; o novo vale", async () => {
    await d.sql(`update public.study_profiles set handle = 'revalida.sorteado' where user_id = $1`, [U.bruno]);
    expect((await lookup(U.ana, "revalida.sorteado")).found).toBe(true);
    await d.rpc(U.bruno, "app_dupla_set_handle", { p_handle: "bruno.novo" });
    expect(await lookup(U.ana, "revalida.sorteado")).toEqual({ found: false });
    await expect(pedir(U.ana, "revalida.sorteado")).rejects.toThrow(/Este convite não está disponível\./);
    expect((await lookup(U.ana, "bruno.novo")).found).toBe(true);
    // um pedido já feito continua ligado à pessoa (user_id), não ao @
    await seen(d.db, U.bruno, 3600, "fora");
    const r = await pedir(U.ana, "bruno.novo");
    expect((await pedidos(U.bruno)).requests[0].id).toBe(r.request_id);
  });

  it("estação só dos planos Pro e Elite: o link diz que é indisponível; sem estação, segue", async () => {
    expect(await lookup(U.ana, "bruno.link", ESTACAO_PRO.id)).toMatchObject({ mode: "indisponivel", why_not: "Estação exclusiva dos planos Pro e Elite." });
    await expect(pedir(U.ana, "bruno.link", ESTACAO_PRO.id)).rejects.toThrow(/Estação exclusiva dos planos Pro e Elite\./);
    await setPlan(d.db, U.ana, "pro", "active");
    await setPlan(d.db, U.bruno, "elite", "active");
    expect((await pedir(U.ana, "bruno.link", ESTACAO_PRO.id)).kind).toBe("convite");
    await expect(pedir(U.ana, "bruno.link", "nao-existe")).rejects.toThrow(/Estação não encontrada\./);
  });

  it("sem perfil de estudo não pede; a conta sem acesso ao módulo não responde pedido", async () => {
    await d.sql(`delete from public.study_profiles where user_id = $1`, [U.eva]);
    await expect(pedir(U.eva, "bruno.link")).rejects.toThrow(/Crie seu perfil de estudo/);
    expect((await lookup(U.eva, "bruno.link")).found).toBe(true); // vê o cartão (precisa de acesso, não de perfil)
    await expect(d.rpc(null, "app_dupla_requests")).rejects.toThrow();
    await expect(d.rpc(null, "app_dupla_answer_request", { p_request_id: U.ana, p_accept: true })).rejects.toThrow();
  });

  it("a tabela de pedidos não é lida nem escrita direto; colar de novo dá o mesmo banco", async () => {
    await seen(d.db, U.bruno, 3600, "fora");
    await pedir(U.ana, "bruno.link");
    await expect(d.asUser(U.ana, `select * from public.study_train_requests`)).resolves.toEqual([]); // RLS sem política
    await expect(d.asUser(U.ana, `insert into public.study_train_requests (from_user, to_user) values ($1, $2)`, [U.ana, U.carla])).rejects.toThrow();
    const retrato = async () => ({
      funcoes: await d.sql(`select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`),
      indices: await d.sql(`select indexname, indexdef from pg_indexes where schemaname = 'public' order by 1`),
      regras: await d.sql(`select conrelid::regclass::text as t, conname, pg_get_constraintdef(oid) as def from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
      gatilhos: await d.sql(`select tgname from pg_trigger where not tgisinternal order by 1`),
      perfis: await d.sql(`select user_id, handle from public.study_profiles order by 1`),
    });
    const antes = await retrato();
    await d.db.exec(SQL_RADAR);
    await d.db.exec(SQL_REFEITAS);
    await d.db.exec(SQL_LINK);
    expect(await retrato()).toEqual(antes);
    const acl = Object.fromEntries((antes.funcoes as any[]).map((f) => [f.id, f.acl]));
    for (const f of ["app_dupla_link_lookup(text,text)", "app_dupla_link_request(text,text)", "app_dupla_requests()", "app_dupla_answer_request(uuid,boolean)", "app_dupla_set_handle(text)", "app_dupla_handle_check(text)"]) {
      expect(acl[f], f).toBe(acl["app_dupla_room(uuid,integer)"]);
    }
    for (const f of ["dupla_requests_sweep()", "dupla_can_receive_now(uuid)", "dupla_station_public(text)", "dupla_invite_core(uuid,uuid,text,boolean)", "dupla_handle_generate()", "dupla_handle_problem(text,uuid)", "dupla_has_banned_word(text)"]) {
      expect(acl[f], f).not.toContain("authenticated");
      expect(acl[f], f).not.toContain("anon");
    }
    for (const f of antes.funcoes as any[]) {
      if (/^(app_dupla_link_|app_dupla_requests|app_dupla_answer_request|app_dupla_set_handle|app_dupla_handle_check|dupla_handle_|dupla_invite_core|dupla_can_receive_now|dupla_station_public|dupla_requests_sweep|dupla_has_banned_word)/.test(f.id)) {
        expect(f.def, f.id).toMatch(/SECURITY DEFINER/);
        expect(f.def, f.id).toMatch(/SET search_path TO ''/);
      }
    }
  });
});
