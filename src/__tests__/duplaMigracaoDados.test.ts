// @vitest-environment node
/**
 * Treinamento em Dupla · Etapa 2: a migração 9750 (supabase/migrations/…9750_treino_dupla_dados.sql) sobre o estado de produção
 * (todas as migrações até a 9630, na ordem), conferida por inteiro:
 *   - colar duas vezes dá o mesmo banco (funções, políticas, regras, colunas, gatilhos, índices, permissões e dados);
 *   - nenhuma função, política ou regra que existia em produção é desfeita, a não ser as poucas que o plano manda trocar;
 *   - as salas e avaliações que já existiam antes não se perdem nem quebram a nova regra;
 *   - quem vê o quê por papel: visitante, aluno sem acesso, Pro, teste válido, teste vencido, equipe, revisor médico, administrador.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, STATION, U, addStation, makeRoom, migrationFiles, openDuplaDb, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const MIGRACAO = "20261003013300_treino_dupla_dados.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8");
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();

interface Retrato {
  funcoes: Record<string, { def: string; acl: string | null }>;
  politicas: Record<string, string>;
  regras: Record<string, string>;
  colunas: Record<string, string>;
  gatilhos: Record<string, string>;
  indices: Record<string, string>;
  tabelas: Record<string, { rls: boolean; acl: string | null }>;
  dados: unknown;
}

/** Retrato do banco: tudo o que uma migração pode mudar, em texto estável para comparar. */
async function retrato(db: DuplaDb): Promise<Retrato> {
  const r: Retrato = { funcoes: {}, politicas: {}, regras: {}, colunas: {}, gatilhos: {}, indices: {}, tabelas: {}, dados: null };
  for (const f of await db.sql<{ id: string; def: string; acl: string | null }>(
    `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'`
  )) r.funcoes[f.id] = { def: f.def, acl: f.acl };
  for (const p of await db.sql<{ k: string; v: string }>(
    `select schemaname || '.' || tablename || ' / ' || policyname as k, cmd || ' ' || roles::text || ' using ' || coalesce(qual, '-') || ' check ' || coalesce(with_check, '-') as v from pg_policies`
  )) r.politicas[p.k] = p.v;
  for (const c of await db.sql<{ k: string; v: string }>(
    `select conrelid::regclass::text || ' / ' || conname as k, pg_get_constraintdef(oid) as v from pg_constraint where connamespace = 'public'::regnamespace`
  )) r.regras[c.k] = c.v;
  for (const c of await db.sql<{ k: string; v: string }>(
    `select table_name || '.' || column_name as k, data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '-') as v from information_schema.columns where table_schema = 'public'`
  )) r.colunas[c.k] = c.v;
  for (const g of await db.sql<{ k: string; v: string }>(
    `select tgrelid::regclass::text || ' / ' || tgname as k, pg_get_triggerdef(oid) as v from pg_trigger where not tgisinternal and exists (select 1 from pg_class c where c.oid = tgrelid and c.relnamespace = 'public'::regnamespace)`
  )) r.gatilhos[g.k] = g.v;
  for (const i of await db.sql<{ k: string; v: string }>(`select indexname as k, indexdef as v from pg_indexes where schemaname = 'public'`)) r.indices[i.k] = i.v;
  for (const t of await db.sql<{ k: string; rls: boolean; acl: string | null }>(
    `select relname as k, relrowsecurity as rls, relacl::text as acl from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`
  )) r.tabelas[t.k] = { rls: t.rls, acl: t.acl };
  r.dados = await db.sql(`select key, value from public.app_settings order by key`);
  return r;
}

const diff = <T>(antes: Record<string, T>, depois: Record<string, T>) => ({
  novos: Object.keys(depois).filter((k) => !(k in antes)).sort(),
  removidos: Object.keys(antes).filter((k) => !(k in depois)).sort(),
  mudados: Object.keys(antes).filter((k) => k in depois && JSON.stringify(antes[k]) !== JSON.stringify(depois[k])).sort(),
});

describe("Migração 9750 sobre o estado de produção", () => {
  let d: DuplaDb;
  let antes: Retrato;
  let depoisDa1a: Retrato;
  let depoisDa2a: Retrato;
  let exportAntes: any;
  let exportDepois: any;
  let exportFinal: any;
  const velha = { sala: "", convite: "" };

  beforeAll(async () => {
    d = await openDuplaDb({ semTreino: true });
    // Dados do modelo antigo, gravados antes da migração: uma sala com "state", um convite e duas avaliações da MESMA sala.
    await addStation(d.db, STATION).catch(() => undefined); // ainda sem o esquema novo: o catálogo e o conteúdo já existem
    const [s] = await d.sql<{ id: string }>(`insert into public.checklist_rooms (member_ids, state, rev) values ($1, '{"status": "OnStation"}', 3) returning id`, [[U.ana, U.bruno]]);
    velha.sala = s.id;
    const [c] = await d.sql<{ id: string }>(`insert into public.study_invites (from_user, to_user, room_id) values ($1, $2, $3) returning id`, [U.ana, U.bruno, s.id]);
    velha.convite = c.id;
    for (const [id, fim] of [["velha-1", "2026-10-01"], ["velha-2", "2026-10-02"]]) {
      await d.sql(
        `insert into public.checklist_study_sessions (id, station_id, room_id, actor_id, doctor_id, started_at, finished_at, score, max_score, correctness)
         values ($1, $2, $3, $4, $5, $6, $6, 5, 10, 50)`,
        [id, STATION.id, s.id, U.ana, U.bruno, fim]
      );
    }
    await setPlan(d.db, U.carla, "pro", "active");
    exportAntes = await d.rpc(U.carla, "app_export_my_data");
    antes = await retrato(d);

    await d.db.exec(SQL);
    depoisDa1a = await retrato(d);
    exportDepois = await d.rpc(U.carla, "app_export_my_data");
    await d.db.exec(SQL);
    depoisDa2a = await retrato(d);
    // As outras do Treino, na ordem (a 012900 recoloca a exportação mais nova do main, com "declarations").
    for (const f of migrationFiles().filter((f) => f.includes("treino_dupla") && f !== MIGRACAO)) {
      await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    }
    exportFinal = await d.rpc(U.carla, "app_export_my_data");
  }, 120_000);
  afterAll(async () => {
    await d?.db.close();
  });

  it("o estado de produção simulado vai até a 9630, com a 9550 (acesso), a 9600 (config só equipe), a 9610 e a 8000 (Estações)", () => {
    const antesDaNossa = migrationFiles({ semTreino: true });
    for (const n of ["20261003008000", "20261003009550", "20261003009600", "20261003009610", "20261003009630"]) {
      expect(antesDaNossa.some((f) => f.startsWith(n)), n).toBe(true);
    }
    // A 9750 é a primeira do módulo; as das etapas seguintes (9760 e adiante) vêm depois dela. O main já passou da 9750 (9900 a
    // 012800, entre elas a 011500 do Termo 2.0): o "estado de produção" aqui são TODAS as migrações que não são do Treino.
    expect(migrationFiles().filter((f) => f.includes("treino_dupla"))[0]).toBe(MIGRACAO);
    expect(antesDaNossa.some((f) => f.startsWith("20261003011500"))).toBe(true);
  });

  it("colar duas vezes dá o mesmo banco (funções, políticas, regras, colunas, gatilhos, índices, permissões e dados)", () => {
    expect(depoisDa2a.funcoes).toEqual(depoisDa1a.funcoes);
    expect(depoisDa2a.politicas).toEqual(depoisDa1a.politicas);
    expect(depoisDa2a.regras).toEqual(depoisDa1a.regras);
    expect(depoisDa2a.colunas).toEqual(depoisDa1a.colunas);
    expect(depoisDa2a.gatilhos).toEqual(depoisDa1a.gatilhos);
    expect(depoisDa2a.indices).toEqual(depoisDa1a.indices);
    expect(depoisDa2a.tabelas).toEqual(depoisDa1a.tabelas);
    expect(depoisDa2a.dados).toEqual(depoisDa1a.dados);
  });

  it("nenhuma função de produção é desfeita: só app_export_my_data muda e só guard_checklist_room() sai", () => {
    const f = diff(antes.funcoes, depoisDa1a.funcoes);
    expect(f.removidos).toEqual(["guard_checklist_room()"]);
    expect(f.mudados).toEqual(["app_export_my_data()"]);
    expect(f.novos).toEqual(
      [
        "app_dupla_access()", "app_dupla_room_content(uuid)", "dupla_allowed(uuid)", "dupla_area_code(text)", "dupla_assert_access()",
        "dupla_me_allowed()", "dupla_room_member(text)", "dupla_station_meta(text)",
      ]
    );
    // As permissões das funções que já existiam não mudam (nenhuma ficou aberta nem fechada sem querer).
    for (const k of Object.keys(antes.funcoes).filter((k) => k !== "guard_checklist_room()")) {
      expect(depoisDa1a.funcoes[k].acl, k).toBe(antes.funcoes[k].acl);
    }
  });

  it("as funções que o Treino usa e não refaz seguem exatamente como em produção (acesso 9550, equipe 4600, Estações 8000)", () => {
    for (const k of [
      "has_pro()", "tutor_is_pro(uuid)", "subscription_is_paid(plan_code,subscription_status,timestamp with time zone)",
      "user_has_full_access(uuid)", "user_is_staff(uuid)", "is_staff()", "is_admin()",
      "checklist_station_area_code(text)", "app_admin_station_content(text)", "app_admin_set_station_review(text,text,text)",
      "app_announcement()", "app_admin_settings()", "app_admin_save_settings(jsonb)", "guard_study_invite()", "stamp_checklist_room()",
    ]) {
      expect(depoisDa1a.funcoes[k], k).toBeDefined();
      expect(depoisDa1a.funcoes[k], k).toEqual(antes.funcoes[k]);
    }
  });

  it("políticas e regras: saem só as que o plano manda; entram só as do Treino", () => {
    const p = diff(antes.politicas, depoisDa1a.politicas);
    expect(p.removidos).toEqual([
      "public.checklist_rooms / salas: membro cria",
      "public.checklist_rooms / salas: membros atualizam",
      "public.checklist_station_contents / estações: conteúdo (aprovada e acesso Pro quando exigido)",
      "public.study_invites / convites: enviar",
      "public.study_invites / convites: responder ou cancelar",
    ]);
    expect(p.mudados).toEqual([]);
    expect(p.novos).toEqual([
      "public.checklist_room_marks / marcações: avaliador, e candidato após a avaliação",
      "public.checklist_station_contents / estações: conteúdo só da equipe",
      "public.study_matches / matches: os dois leem",
      "public.study_profiles / perfil de estudo: ler o próprio",
      "public.study_swipes / escolhas: ler as próprias",
    ]);
    // Toda política nova é só de leitura (select) e só para quem entra (authenticated).
    for (const k of p.novos) expect(depoisDa1a.politicas[k], k).toMatch(/^SELECT \{authenticated\} using /);
    // Regras que já existiam: só mudam as que o plano refaz (chaves do app_settings, FKs de ator/médico) ou somem (a tabela perdeu "state").
    const r = diff(antes.regras, depoisDa1a.regras);
    // (As três que somem são os "não nulo" de state, actor_id e doctor_id: esta versão do Postgres os lista como regras.)
    expect(r.removidos).toEqual([
      "checklist_rooms / checklist_rooms_state_not_null",
      "checklist_study_sessions / checklist_study_sessions_actor_id_not_null",
      "checklist_study_sessions / checklist_study_sessions_doctor_id_not_null",
    ]);
    // A 012200 (desde 18/10) já aceita as chaves do Treino: montado pelos arquivos, a regra das chaves pode já vir igual. Em produção a
    // 012200 foi colada com o texto antigo (3 chaves) e a regra MUDA com esta migração.
    const chavesJaAceitas = /treino_dupla/.test(antes.regras["app_settings / app_settings_key_check"] ?? "");
    expect(r.mudados).toEqual([
      ...(chavesJaAceitas ? [] : ["app_settings / app_settings_key_check"]),
      "checklist_study_sessions / checklist_study_sessions_actor_id_fkey",
      "checklist_study_sessions / checklist_study_sessions_doctor_id_fkey",
    ]);
    expect(depoisDa1a.regras["app_settings / app_settings_key_check"]).toMatch(/trial_days.*announcement.*treino_dupla/);
    expect(depoisDa1a.regras["checklist_study_sessions / checklist_study_sessions_actor_id_fkey"]).toMatch(/ON DELETE SET NULL/);
    expect(depoisDa1a.regras["checklist_study_sessions / checklist_study_sessions_doctor_id_fkey"]).toMatch(/ON DELETE SET NULL/);
    // Gatilhos: sai só o das regras antigas da sala; o carimbo e o dos convites ficam.
    const g = diff(antes.gatilhos, depoisDa1a.gatilhos);
    expect(g.removidos).toEqual(["checklist_rooms / checklist_rooms_guard"]);
    expect(g.mudados).toEqual([]);
    expect(depoisDa1a.gatilhos["checklist_rooms / checklist_rooms_stamp"]).toBeDefined();
    expect(depoisDa1a.gatilhos["study_invites / study_invites_guard"]).toBeDefined();
    // Colunas: nenhuma some, a não ser "state" da sala; nenhuma que existia muda de tipo ou de padrão, a não ser as duas do ator/médico.
    const c = diff(antes.colunas, depoisDa1a.colunas);
    expect(c.removidos).toEqual(["checklist_rooms.state"]);
    expect(c.mudados).toEqual(["checklist_study_sessions.actor_id", "checklist_study_sessions.doctor_id"]);
    // Toda tabela com acesso por linha ligado antes continua ligado; as novas já nascem ligadas.
    for (const [t, v] of Object.entries(depoisDa1a.tabelas)) {
      if (t in antes.tabelas) expect(v.rls, t).toBe(antes.tabelas[t].rls);
      else expect(v.rls, `${t} (nova)`).toBe(true);
    }
    expect(Object.keys(depoisDa1a.tabelas).filter((t) => !(t in antes.tabelas)).sort()).toEqual(["checklist_room_marks", "study_matches", "study_profiles", "study_swipes"]);
  });

  it("depois de todas as do Treino, a exportação antiga continua inteira (com declarations) e ganha só as chaves do Treino (4 + a do chat + station_attempts da 013406 + a do treino sozinho + a dos créditos)", () => {
    expect(exportAntes).toHaveProperty("declarations");
    expect(exportDepois).toBeTruthy();
    const { exported_at: _a, ...velho } = exportAntes;
    const { exported_at: _b, ...novo } = exportFinal;
    for (const k of Object.keys(velho)) expect(novo[k], k).toEqual(velho[k]);
    expect(Object.keys(novo).filter((k) => !(k in velho)).sort()).toEqual(["checklist_rooms", "solo_attempts", "station_attempts", "study_chat", "study_credits", "study_matches", "study_profile", "study_swipes"]);
  });

  it("salas, convites e avaliações antigos não se perdem: a sala fecha (sem sinal), o convite fica, as avaliações ganham rodadas 1 e 2", async () => {
    expect(await d.sql(`select phase, closed_reason, rev, round, member_ids from public.checklist_rooms where id = $1`, [velha.sala])).toEqual([
      { phase: "closed", closed_reason: "sem_sinal", rev: 3, round: 1, member_ids: [U.ana, U.bruno] },
    ]);
    expect(await d.sql(`select status from public.study_invites where id = $1`, [velha.convite])).toEqual([{ status: "pending" }]);
    expect(await d.sql(`select id, round from public.checklist_study_sessions order by id`)).toEqual([{ id: "velha-1", round: 1 }, { id: "velha-2", round: 2 }]);
  });

  it("uma sala criada DEPOIS da 1ª colagem não é fechada pela 2ª colagem; a chave do módulo e as mudanças do dono ficam", async () => {
    const viva = await makeRoom(d.db, { members: [U.diego, U.eva], phase: "running", candidate: U.diego, evaluator: U.eva });
    await setDupla(d.db, { aberto: true, planos: ["trial"] });
    // A lista de chaves da 9750 não tem 'treino_dupla_chat' (013370, chat): colada de novo depois dela, a 9750 seria recusada
    // pela linha do chat. Por isso a linha sai antes e a 013370 é colada em seguida (devolve a lista e a linha, como antes).
    await d.sql(`delete from public.app_settings where key in ('treino_dupla_chat', 'creditos')`);
    await d.db.exec(SQL);
    await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003013370_treino_dupla_chat.sql"), "utf8"));
    await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003013490_treino_dupla_creditos_tabelas.sql"), "utf8"));
    expect(await d.sql(`select phase, closed_reason from public.checklist_rooms where id = $1`, [viva])).toEqual([{ phase: "running", closed_reason: null }]);
    expect(await d.sql(`select value from public.app_settings where key = 'treino_dupla'`)).toEqual([{ value: { aberto: true, planos: ["trial"] } }]);
    await setDupla(d.db, { aberto: false, planos: ["pro", "elite"] });
  });

  it("app_settings: a lista de chaves é a união das que existem + treino_dupla; a linha nasce desligada; outras chaves seguem recusadas", async () => {
    // (A 013370, do chat, entra na união com 'treino_dupla_chat'.)
    expect(await d.sql(`select key from public.app_settings order by key`)).toEqual([{ key: "announcement" }, { key: "creditos" }, { key: "simulado_ineditas_pct" }, { key: "treino_dupla" }, { key: "treino_dupla_chat" }, { key: "trial_days" }]);
    expect((await d.sql<{ value: unknown }>(`select value from public.app_settings where key = 'trial_days'`))[0].value).toBe(7);
    await expect(d.sql(`insert into public.app_settings (key, value) values ('outra', '1')`)).rejects.toThrow(/check constraint/);
    // O painel antigo continua salvando só as duas chaves que conhece.
    await d.rpc(U.admin, "app_admin_save_settings", { p_settings: { trial_days: 9 } });
    expect(await d.rpc(U.admin, "app_admin_settings")).toMatchObject({ trial_days: 9, treino_dupla: { aberto: false, planos: ["pro", "elite"] } });
    await d.rpc(U.admin, "app_admin_save_settings", { p_settings: { trial_days: 7 } });
  });
});

describe("Migração 9750: quem vê o quê por papel", () => {
  let d: DuplaDb;
  const U2 = { editor: U.fabio, revisor: U.gil };
  let sala = "";

  beforeAll(async () => {
    d = await openDuplaDb();
    await addStation(d.db);
    await d.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [U2.editor]);
    await d.db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [U2.revisor]);
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    // ana: aluna sem acesso (teste grátis, "trial" não marcado); bruno: Pro; carla: teste vencido; diego: Elite; eva: Pro cancelado
    await setPlan(d.db, U.ana, "trial", "trialing", daqui(5));
    await setPlan(d.db, U.bruno, "pro", "active");
    await setPlan(d.db, U.carla, "trial", "trialing", daqui(-2));
    await setPlan(d.db, U.diego, "elite", "active");
    await setPlan(d.db, U.eva, "pro", "canceled");
    sala = await makeRoom(d.db, { members: [U.bruno, U.diego], phase: "running", candidate: U.bruno, evaluator: U.diego });
  }, 60_000);
  afterAll(async () => {
    await d?.db.close();
  });

  const pessoas: Array<[string, string | null, boolean, boolean]> = [
    // [quem, uid, permitido com a chave ligada (Pro/Elite), permitido com o teste grátis marcado também]
    ["visitante", null, false, false],
    ["aluno em teste válido (sem 'trial' marcado)", U.ana, false, true],
    ["aluno Pro", U.bruno, true, true],
    ["aluno em teste vencido", U.carla, false, false],
    ["aluno Elite", U.diego, true, true],
    ["aluno com plano cancelado", U.eva, false, false],
    ["editor (equipe)", U2.editor, true, true],
    ["revisor médico", U2.revisor, true, true],
    ["administrador", U.admin, true, true],
  ];

  it("chave ligada: entra a equipe, o revisor médico e quem tem plano pago marcado; os outros não", async () => {
    for (const [quem, uid, esperado] of pessoas) {
      if (uid === null) {
        await expect(d.rpc(null, "app_dupla_access"), quem).rejects.toThrow(/permission denied/);
        continue;
      }
      expect((await d.rpc(uid, "app_dupla_access")).permitido, quem).toBe(esperado);
    }
  });

  it("com o teste grátis marcado, entra também quem está em teste dentro do prazo (e nunca o vencido)", async () => {
    await setDupla(d.db, { aberto: true, planos: ["trial", "pro", "elite"] });
    for (const [quem, uid, , esperado] of pessoas.filter((p) => p[1])) expect((await d.rpc(uid!, "app_dupla_access")).permitido, quem).toBe(esperado);
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
  });

  it("chave desligada: só a equipe e o revisor médico entram; a tela recebe equipe=true só para administrador e editor", async () => {
    await setDupla(d.db, { aberto: false, planos: ["pro", "elite"] });
    for (const [quem, uid] of pessoas.filter((p) => p[1])) {
      const a = await d.rpc(uid!, "app_dupla_access");
      expect(a.aberto, quem).toBe(false);
      expect(a.permitido, quem).toBe(uid === U.admin || uid === U2.editor || uid === U2.revisor);
      expect(a.equipe, quem).toBe(uid === U.admin || uid === U2.editor);
    }
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
  });

  it("chave com valor estragado (texto no lugar de verdadeiro/falso, planos que não é lista) não abre para o aluno nem dá erro", async () => {
    for (const ruim of ['"sim"', '{"aberto": "sim", "planos": ["pro"]}', '{"aberto": true, "planos": "pro"}', '{"aberto": true}', "null", "[]"]) {
      await d.db.query(`update public.app_settings set value = $1::jsonb where key = 'treino_dupla'`, [ruim]);
      expect((await d.rpc(U.bruno, "app_dupla_access")).permitido, ruim).toBe(false);
      expect((await d.rpc(U.admin, "app_dupla_access")).permitido, ruim).toBe(true);
    }
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
  });

  it("conteúdo da estação: só a equipe lê direto; aluno (Pro ou não), revisor médico e visitante não; o revisor segue lendo pela função da aba Estações", async () => {
    const direto = (uid: string) => d.asUser(uid, `select station_id from public.checklist_station_contents`);
    expect(await direto(U.admin)).toHaveLength(1);
    expect(await direto(U2.editor)).toHaveLength(1);
    for (const uid of [U.ana, U.bruno, U.diego, U.carla, U2.revisor]) expect(await direto(uid), uid).toEqual([]);
    expect((await d.rpc(U2.revisor, "app_admin_station_content", { p_station_id: STATION.id })).actor_script).toContain("Dados pessoais:");
    await expect(d.rpc(U.bruno, "app_admin_station_content", { p_station_id: STATION.id })).rejects.toThrow(/Acesso restrito/);
    // O catálogo (checklist_stations) segue como estava: o aluno lê as aprovadas.
    expect(await d.asUser(U.ana, `select id from public.checklist_stations`)).toEqual([{ id: STATION.id }]);
  });

  it("conteúdo por papel: quem tem acesso e é da sala recebe; revisor ou equipe de fora da sala não; aluno sem acesso é barrado antes", async () => {
    expect((await d.rpc(U.bruno, "app_dupla_room_content", { p_room_id: sala })).role).toBe("candidate");
    expect((await d.rpc(U.diego, "app_dupla_room_content", { p_room_id: sala })).role).toBe("evaluator");
    for (const uid of [U.admin, U2.editor, U2.revisor]) {
      await expect(d.rpc(uid, "app_dupla_room_content", { p_room_id: sala }), uid).rejects.toThrow(/Sala não encontrada\./);
    }
    for (const uid of [U.ana, U.carla, U.eva]) await expect(d.rpc(uid, "app_dupla_room_content", { p_room_id: sala }), uid).rejects.toThrow(/Sem acesso ao Treinamento em Dupla\./);
    await expect(d.rpc(null, "app_dupla_room_content", { p_room_id: sala })).rejects.toThrow(/permission denied/);
    // Quem perdeu a conta (sem login) recebe a mensagem de entrada.
    await expect(d.db.query(`select public.dupla_assert_access()`)).rejects.toThrow(/Entre na sua conta\./);
  });

  it("dupla_station_meta e dupla_area_code", async () => {
    const meta = async (id: string) => (await d.sql<{ m: unknown }>(`select public.dupla_station_meta($1) as m`, [id]))[0].m;
    expect(await meta("inep-2024-1-e01")).toEqual({ number: 1, edition: "2024/1", reapplication: false });
    expect(await meta("inep-2024-2-e12")).toEqual({ number: 12, edition: "2024/2", reapplication: false });
    expect(await meta("inep-2023-1r-e05")).toEqual({ number: 5, edition: "2023/1", reapplication: true });
    expect(await meta("teste-inep2020-e07")).toEqual({ number: 7, edition: "2020", reapplication: false });
    expect(await meta("inep-2020-e10")).toEqual({ number: 10, edition: "2020", reapplication: false });
    for (const fora of ["seed-01", "teste-dupla-e01", "inep-2024-1-e001", "inep-2024-3-e01", "", "INEP-2024-1-E01"]) {
      expect(await meta(fora), fora).toEqual({ number: null, edition: null, reapplication: false });
    }
    const area = async (a: string | null) => (await d.sql<{ c: string | null }>(`select public.dupla_area_code($1) as c`, [a]))[0].c;
    expect(await area("Clínica Médica")).toBe("CM");
    expect(await area("Cirurgia Geral")).toBe("CR");
    expect(await area("Ginecologia e Obstetrícia")).toBe("GO");
    expect(await area("Pediatria")).toBe("PED");
    expect(await area("Medicina de Família e Comunidade")).toBe("MFC");
    expect(await area("Outra")).toBeNull();
    expect(await area(null)).toBeNull();
  });
});
