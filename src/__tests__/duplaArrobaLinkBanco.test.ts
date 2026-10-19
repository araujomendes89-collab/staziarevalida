// @vitest-environment node
/**
 * Treino em Dupla · nome de usuário com @ (014000/014010) e convite por link com pedido de treino de 24 h (014080).
 * Postgres em memória (PGlite) com todas as migrações, em ordem.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, STATION, U, addProfile, addStation, makeRoom, openDuplaDb, seen, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const SQL_RADAR = fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003014000_treino_dupla_radar.sql"), "utf8");
const SQL_REFEITAS = fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003014010_treino_dupla_radar_refeitas.sql"), "utf8");
const SQL_LINK = fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003014080_treino_dupla_convite_link.sql"), "utf8");
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
    // @ vazio ou nulo no pedido de um perfil novo não barra: vale como "não mexer" e o servidor sorteia
    await d.sql(`delete from public.study_profiles where user_id = $1`, [U.gil]);
    const g = await d.rpc(U.gil, "app_dupla_save_profile", { p_profile: { public_name: "Gil Nunes", handle: "" } });
    expect(g.profile.handle).toMatch(/^revalida\./);
    const g2 = await d.rpc(U.gil, "app_dupla_save_profile", { p_profile: { handle: null, bio: "x" } });
    expect(g2.profile.handle).toBe(g.profile.handle);
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
    for (const h of ["admin", "Admin", "admin123", "ad.min", "suporte", "equipe", "revisor", "moderador", "staziamed", "stazia", "stazia_fan", "st.azia", "oficial", "sistema", "staff", "atendimento", "admin_joao", "suporte.app", "admin.revalida", "equipe.medica", "inep.oficial", "moderacao.dupla"]) {
      await expect(trocar(U.ana, h), h).rejects.toThrow(/Esse @ não está disponível\./);
    }
    expect(await checar(U.ana, "meu.admin")).toMatchObject({ ok: true }); // só vale no começo
    expect(await checar(U.ana, "todos.nos")).toMatchObject({ ok: true }); // as palavras genéricas só barram sozinhas
    for (const h of ["todos", "todos2", "root", "null"]) expect(await checar(U.ana, h), h).toMatchObject({ ok: false, code: "reservado" });
    expect(await checar(U.ana, "equipamento")).toMatchObject({ ok: true });
  });

  it("palavra proibida do chat (acento, número no lugar de letra, pontos entre as letras); termo clínico passa", async () => {
    for (const h of ["idiota", "bobo.idiota", "i.d.i.o.t.a", "1d10ta", "idiotas", "meu_idiota", "meuidiota", "meucaralho", "babacao"]) {
      await expect(trocar(U.ana, h), h).rejects.toThrow(/Esse @ contém uma palavra não permitida\./);
    }
    expect(await checar(U.ana, "computador")).toMatchObject({ ok: true }); // contém 'puta' no meio; as de 4 a 5 letras só valem como palavra inteira
    expect(await checar(U.ana, "amputacao")).toMatchObject({ ok: true });
  });

  it("o mesmo filtro vale para o nome ('Nome ou apelido')", async () => {
    await expect(d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { public_name: "Ana Idiota" } })).rejects.toThrow(/Esse nome contém uma palavra não permitida\./);
    await expect(d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { public_name: "p0rr4 Silva" } })).rejects.toThrow(/Esse nome contém uma palavra não permitida\./);
    for (const n of ["Suporte StaziaMed", "Equipe Stazia", "Admin Ana", "Moderador da Dupla"]) {
      await expect(d.rpc(U.ana, "app_dupla_save_profile", { p_profile: { public_name: n } }), n).rejects.toThrow(/Esse nome não está disponível\. Escolha outro\./);
    }
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

  it("corrida da mesma pessoa: dois @ diferentes ao mesmo tempo, só uma troca (regra dos 15 dias)", async () => {
    const [a, b] = await Promise.allSettled([trocar(U.ana, "ana.um.x"), trocar(U.ana, "ana.dois.x")]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect(await d.sql(`select 1 from public.study_handle_log where user_id = $1`, [U.ana])).toHaveLength(1);
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
  const arroba = async (uid: string, h: string) => {
    await d.sql(`update public.study_profiles set handle = $2 where user_id = $1`, [uid, h]);
  };

  beforeAll(async () => {
    d = await openDuplaDb();
    await addStation(d.db);
    await addStation(d.db, ESTACAO_PRO);
    // Junção da etapa 2: a situação 'sozinho' já é aceita pela restrição do perfil (014090, treino sozinho); nada a abrir.
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

  it("a tabela de pedidos não é lida nem escrita direto; colar de novo dá o mesmo banco", async () => {
    await seen(d.db, U.bruno, 3600, "fora");
    await d.sql(`insert into public.study_train_requests (from_user, to_user) values ($1, $2)`, [U.ana, U.bruno]);
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
    // Junção da etapa 2: as do Treino que vêm depois da 014010 refazem funções (swipe na 014040/014050); recoladas na ordem.
    for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.includes("treino_dupla") && x > "20261003014010").sort()) {
      await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    }
    expect(await retrato()).toEqual(antes);
    const acl = Object.fromEntries((antes.funcoes as any[]).map((f) => [f.id, f.acl]));
    for (const f of ["app_dupla_link_lookup(text,text)", "app_dupla_link_request(text,text)", "app_dupla_requests()", "app_dupla_answer_request(uuid,boolean)", "app_dupla_set_handle(text)", "app_dupla_handle_check(text)"]) {
      expect(acl[f], f).toBe(acl["app_dupla_room(uuid,integer)"]);
    }
    for (const f of ["dupla_requests_sweep()", "dupla_can_receive_now(uuid)", "dupla_station_public(text)", "dupla_invite_core(uuid,uuid,text,boolean,uuid,boolean)", "dupla_handle_generate()", "dupla_handle_problem(text,uuid)", "dupla_has_banned_word(text,boolean)", "dupla_name_reserved(text)", "dupla_credit_ok(uuid)"]) {
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
