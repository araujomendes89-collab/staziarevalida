// @vitest-environment node
/**
 * Stazia Match · M2b · pré-checagem de crédito ao formar o match (migração 014050: app_dupla_swipe e
 * app_dupla_answer_invite), conferida num Postgres em memória (PGlite) com as regras reais (todas as migrações, em ordem).
 *
 * A pré-checagem NUNCA debita (quem debita é o início da estação, em duplaCreditosInicio.test.ts) e nunca revela o saldo
 * nem o motivo do outro:
 *  - sem crédito MEU: "Estudar junto" devolve { matched: false, reason: 'quota' } e a escolha nem é gravada; "Pular" segue;
 *  - sem crédito DO OUTRO: a resposta é IDÊNTICA à de "o outro não escolheu" ({ matched: false });
 *  - aceitar convite: 'Sua cota de matches acabou' (só o meu lado; o de quem convidou é conferido no início, com mensagem neutra);
 *    recusar nunca é barrado; a equipe nunca é barrada.
 *
 * Isolamento: o livro é só-acrescenta (não se apaga). Cada teste cria as PRÓPRIAS contas ("conta()") e confere tudo por conta.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { MIGRATIONS_DIR, addProfile, addStation, openDuplaDb, seen, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const MIGRACAO = "20261003014050_treino_dupla_creditos_inicio.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8");
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const ABERTO = { aberto: true, planos: ["trial", "pro", "elite"] };

describe("Stazia Match · pré-checagem de crédito (escolha e convite)", () => {
  let d: DuplaDb;

  // ------------------------------------------------------------------ apoios
  /** Liga (ou desliga) a cota. `match` troca os limites (padrão trial 2, pro 3, elite 5); `undefined` tira o número do plano. */
  const cota = async (ativa: boolean, match: Record<string, unknown> = {}) => {
    const valor = { ativa, match: { trial: 2, pro: 3, elite: 5, cobra_rodada_extra: false, ...match }, ia: {} };
    await d.sql(`update public.app_settings set value = $1::jsonb where key = 'creditos'`, [JSON.stringify(valor)]);
  };

  type Perfil = "trial" | "pro" | "admin" | "editor" | "revisor";
  /** Conta nova só deste teste, com perfil de estudo (papel "qualquer") e sinal agora. */
  const conta = async (perfil: Perfil = "trial"): Promise<string> => {
    const id = randomUUID();
    await d.sql(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb)`, [id, `${id}@teste.dev`]);
    if (perfil === "pro") await setPlan(d.db, id, "pro", "active");
    else if (perfil === "trial") await setPlan(d.db, id, "trial", "trialing", daqui(7));
    else if (perfil === "admin") await d.sql(`update public.user_roles set role = 'admin' where user_id = $1`, [id]);
    else if (perfil === "editor") await d.sql(`update public.user_roles set role = 'editor' where user_id = $1`, [id]);
    else await d.sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [id]);
    await addProfile(d.db, id, { public_name: `Pessoa ${id.slice(0, 4)}`, role_pref: "any" });
    await seen(d.db, id);
    return id;
  };

  const swipe = (de: string, para: string, direcao: "right" | "left") =>
    d.rpc<any>(de, "app_dupla_swipe", { p_to: para, p_direction: direcao });
  const responder = (uid: string, convite: string, aceita: boolean) =>
    d.rpc<any>(uid, "app_dupla_answer_invite", { p_invite_id: convite, p_accept: aceita });

  const gasta = (uid: string) =>
    d.sql(`select public.credit_consume($1::uuid, 'match', 1, 'teste', $2::uuid, $3) as r`, [uid, randomUUID(), `gasto-${randomUUID()}`]);
  const concede = (uid: string, n: number) =>
    d.sql(`select public.credit_grant($1::uuid, 'match', $2::int, 'teste', $3, 'bonus') as r`, [uid, n, `conc-${randomUUID()}`]);

  const erroDe = async (p: Promise<unknown>): Promise<any> => {
    try {
      await p;
    } catch (e) {
      return e;
    }
    throw new Error("Era esperado um erro, mas a chamada deu certo.");
  };

  /** O que existe de match, sala e convite envolvendo estas contas. */
  const rastros = async (...uids: string[]) =>
    (
      await d.sql<any>(
        `select (select count(*) from public.study_matches where user_a = any ($1::uuid[]) or user_b = any ($1::uuid[]))::int as matches,
                (select count(*) from public.checklist_rooms where member_ids && $1::uuid[])::int as salas,
                (select count(*) from public.study_invites where from_user = any ($1::uuid[]) or to_user = any ($1::uuid[]))::int as convites`,
        [uids]
      )
    )[0];
  const escolhas = (de: string) =>
    d.sql<any>(`select to_user, direction from public.study_swipes where from_user = $1 order by created_at`, [de]);
  /** Livro, uso do dia e cobranças de sala destas contas: a pré-checagem não pode mexer em nada disto. */
  const contabilidade = async (...uids: string[]) =>
    (
      await d.sql<any>(
        `select (select count(*) from public.credit_ledger where user_id = any ($1::uuid[]))::int as livro,
                (select coalesce(sum(used), 0) from public.credit_daily where user_id = any ($1::uuid[]))::int as uso,
                (select count(*) from public.study_room_charges where user_id = any ($1::uuid[]))::int as cobrancas,
                (select count(*) from public.credit_wallets where user_id = any ($1::uuid[]))::int as carteiras`,
        [uids]
      )
    )[0];

  /** "ele" escolhe "eu" primeiro; "eu" completa: o convite vai de "eu" para "ele". */
  const formar = async (eu: string, ele: string) => {
    expect(await swipe(ele, eu, "right")).toEqual({ matched: false });
    const r = await swipe(eu, ele, "right");
    expect(r).toMatchObject({ matched: true, partner: { user_id: ele } });
    const [{ id }] = await d.sql<{ id: string }>(`select id from public.study_invites where room_id = $1`, [r.room_id]);
    return { sala: r.room_id as string, convite: id };
  };

  beforeAll(async () => {
    d = await openDuplaDb();
    await setDupla(d.db, ABERTO);
    await addStation(d.db);
  }, 120_000);
  beforeEach(async () => {
    await cota(false);
  });
  afterAll(async () => {
    await d?.db.close();
  });

  // ------------------------------------------------------------------ sem crédito MEU
  it.each([
    ["já gastou o crédito do dia", async (uid: string) => { await cota(true, { trial: 1 }); await gasta(uid); }],
    ["plano sem número (limite zero)", async () => { await cota(true, { trial: undefined }); }],
  ] as const)("sem crédito MEU (%s): 'Estudar junto' devolve reason 'quota' e a escolha NÃO é gravada; 'Pular' funciona", async (_nome, esvaziar) => {
    const eu = await conta("trial");
    const ele = await conta("pro");
    await cota(true, { trial: 1 });
    // ele já tinha escolhido "eu": mesmo assim, sem crédito meu, não há match, sala nem convite
    expect(await swipe(ele, eu, "right")).toEqual({ matched: false });
    await esvaziar(eu);
    const antes = await contabilidade(eu, ele);
    // sinal: quem estava "fora" volta a "livre" e o horário é regravado, como em qualquer escolha
    await seen(d.db, eu, 90, "fora");

    expect(await swipe(eu, ele, "right")).toEqual({ matched: false, reason: "quota" });
    expect(await escolhas(eu)).toEqual([]);
    expect(await rastros(eu, ele)).toEqual({ matches: 0, salas: 0, convites: 0 });
    const [p] = await d.sql<any>(`select status, extract(epoch from (now() - last_seen_at))::int as s from public.study_profiles where user_id = $1`, [eu]);
    expect(p.status).toBe("livre");
    expect(p.s).toBeLessThan(10);
    // repetir não muda nada
    expect(await swipe(eu, ele, "right")).toEqual({ matched: false, reason: "quota" });
    expect(await escolhas(eu)).toEqual([]);

    // "Pular" nunca é barrado: grava a escolha e responde como sempre, SEM reason
    const pular = await swipe(eu, ele, "left");
    expect(pular).toEqual({ matched: false });
    expect(pular).not.toHaveProperty("reason");
    expect(await escolhas(eu)).toEqual([{ to_user: ele, direction: "left" }]);
    expect(await rastros(eu, ele)).toEqual({ matches: 0, salas: 0, convites: 0 });
    // a pré-checagem não grava nada na contabilidade
    expect(await contabilidade(eu, ele)).toEqual(antes);
  });

  // ------------------------------------------------------------------ sem crédito DO OUTRO
  it("sem crédito DO OUTRO: a resposta é IDÊNTICA à de 'o outro não escolheu', sem match, sala, convite nem campo extra", async () => {
    await cota(true, { trial: 1 });
    // Cenário A: ele escolheu "eu" quando ainda tinha crédito e depois gastou.
    const eu = await conta("trial");
    const ele = await conta("trial");
    expect(await swipe(ele, eu, "right")).toEqual({ matched: false });
    await gasta(ele);
    const semCredito = await swipe(eu, ele, "right");

    // Cenário B (outro par): o outro simplesmente não escolheu.
    const eu2 = await conta("trial");
    const outro = await conta("trial");
    const naoEscolheu = await swipe(eu2, outro, "right");

    expect(semCredito).toEqual({ matched: false });
    expect(naoEscolheu).toEqual({ matched: false });
    expect(semCredito).toEqual(naoEscolheu);
    expect(Object.keys(semCredito)).toEqual(Object.keys(naoEscolheu));
    expect(JSON.stringify(semCredito)).toBe(JSON.stringify(naoEscolheu));
    expect(JSON.stringify(semCredito)).not.toMatch(/quota|reason|credit|cota|saldo|limit/i);
    expect(await rastros(eu, ele)).toEqual({ matches: 0, salas: 0, convites: 0 });

    // Minha escolha FOI gravada (eu tinha crédito): quando ele voltar a ter, o match sai no clique dele, sem que ninguém tenha
    // visto o motivo antes.
    expect(await escolhas(eu)).toEqual([{ to_user: ele, direction: "right" }]);
    await concede(ele, 1);
    const depois = await swipe(ele, eu, "right");
    expect(depois).toMatchObject({ matched: true, room_id: expect.any(String), partner: { user_id: eu } });
  });

  // ------------------------------------------------------------------ ambos com crédito
  it("ambos com crédito: forma o match normalmente e a pré-checagem NÃO grava lançamento nem uso", async () => {
    await cota(true);
    const a = await conta("trial");
    const b = await conta("pro");
    const antes = await contabilidade(a, b);

    expect(await swipe(a, b, "right")).toEqual({ matched: false });
    const r = await swipe(b, a, "right");
    expect(r).toEqual({ matched: true, room_id: expect.any(String), partner: { user_id: a, public_name: expect.any(String) } });
    expect(r).not.toHaveProperty("reason");
    const [sala] = await d.sql<any>(`select phase, round, charged_at from public.checklist_rooms where id = $1`, [r.room_id]);
    expect(sala).toMatchObject({ phase: "roles", round: 1, charged_at: null });
    expect(await rastros(a, b)).toEqual({ matches: 1, salas: 1, convites: 1 });
    // livro, uso do dia, carteira e cobranças de sala: exatamente como antes
    expect(await contabilidade(a, b)).toEqual(antes);
    expect(antes).toEqual({ livro: 0, uso: 0, cobrancas: 0, carteiras: 0 });
  });

  it("cota desligada: tudo como hoje (matched true), mesmo com limites zerados", async () => {
    await cota(false, { trial: 0, pro: 0 });
    const a = await conta("trial");
    const b = await conta("pro");
    expect(await swipe(a, b, "right")).toEqual({ matched: false });
    const r = await swipe(b, a, "right");
    expect(r).toMatchObject({ matched: true, room_id: expect.any(String) });
    expect(r).not.toHaveProperty("reason");
    const [{ id: convite }] = await d.sql<{ id: string }>(`select id from public.study_invites where room_id = $1`, [r.room_id]);
    expect(await responder(a, convite, true)).toEqual({ room_id: r.room_id });
    // "Pular" e a escolha sem retorno continuam iguais
    const c = await conta("trial");
    expect(await swipe(c, a, "left")).toEqual({ matched: false });
    expect(await swipe(c, b, "right")).toEqual({ matched: false });
    expect(await contabilidade(a, b, c)).toEqual({ livro: 0, uso: 0, cobrancas: 0, carteiras: 0 });
  });

  // ------------------------------------------------------------------ aceitar convite
  describe("aceitar ou recusar o convite", () => {
    it("sem crédito MEU: 'Sua cota de matches acabou' (INSUFFICIENT_CREDITS) e o convite continua pendente", async () => {
      await cota(true, { trial: 1 });
      const eu = await conta("trial"); // quem completou o match e convidou
      const ele = await conta("trial"); // quem recebe o convite
      const { sala, convite } = await formar(eu, ele);
      await gasta(ele);
      const antes = await contabilidade(eu, ele);
      const [rev] = await d.sql<any>(`select rev from public.checklist_rooms where id = $1`, [sala]);

      const e = await erroDe(responder(ele, convite, true));
      expect(e.message).toBe("Sua cota de matches acabou");
      expect(e.code).toBe("54000");
      expect(e.hint).toBe("INSUFFICIENT_CREDITS");
      expect(await d.sql(`select status from public.study_invites where id = $1`, [convite])).toEqual([{ status: "pending" }]);
      expect(await d.sql(`select phase, rev from public.checklist_rooms where id = $1`, [sala])).toEqual([{ phase: "roles", rev: rev.rev }]);
      expect(await contabilidade(eu, ele)).toEqual({ ...antes });

      // com crédito de novo (bônus), o MESMO convite é aceito
      await concede(ele, 1);
      expect(await responder(ele, convite, true)).toEqual({ room_id: sala });
      expect(await d.sql(`select status from public.study_invites where id = $1`, [convite])).toEqual([{ status: "accepted" }]);
    });

    it("sem crédito de quem convidou: aceitar NÃO o revela (a resposta é a de sempre); o início é que recusa os dois, com a mensagem neutra", async () => {
      await cota(true, { trial: 1 });
      const eu = await conta("trial");
      const ele = await conta("trial");
      const { sala, convite } = await formar(eu, ele);
      await gasta(eu); // quem convidou ficou sem crédito depois do match
      const antes = await contabilidade(eu, ele);

      // Revisão de segurança: conferir o lado de quem convidou ao aceitar diria a quem aceita que o colega está sem crédito.
      expect(await responder(ele, convite, true)).toEqual({ room_id: sala });
      expect(await d.sql(`select status from public.study_invites where id = $1`, [convite])).toEqual([{ status: "accepted" }]);
      expect(await contabilidade(eu, ele)).toEqual(antes);
    });

    it("os dois sem crédito: o aviso é o do MEU lado (cada um só sabe do seu)", async () => {
      await cota(true, { trial: 1 });
      const eu = await conta("trial");
      const ele = await conta("trial");
      const { convite } = await formar(eu, ele);
      await gasta(eu);
      await gasta(ele);
      const e = await erroDe(responder(ele, convite, true));
      expect(e).toMatchObject({ message: "Sua cota de matches acabou", hint: "INSUFFICIENT_CREDITS" });
    });

    it("recusar nunca é barrado, com ou sem crédito de qualquer lado", async () => {
      await cota(true, { trial: 1 });
      for (const quem of ["ele", "eu", "os dois"] as const) {
        const eu = await conta("trial");
        const ele = await conta("trial");
        const { sala, convite } = await formar(eu, ele);
        if (quem !== "eu") await gasta(ele);
        if (quem !== "ele") await gasta(eu);
        expect(await responder(ele, convite, false), quem).toEqual({ room_id: null });
        expect(await d.sql(`select status from public.study_invites where id = $1`, [convite]), quem).toEqual([{ status: "declined" }]);
        expect(await d.sql(`select phase, closed_reason from public.checklist_rooms where id = $1`, [sala]), quem).toEqual([
          { phase: "closed", closed_reason: "convite_recusado" },
        ]);
      }
    });

    it("com os dois com crédito: aceita ('accepted') e a pré-checagem não debita", async () => {
      await cota(true);
      const eu = await conta("trial");
      const ele = await conta("pro");
      const { sala, convite } = await formar(eu, ele);
      const antes = await contabilidade(eu, ele);
      expect(await responder(ele, convite, true)).toEqual({ room_id: sala });
      expect(await d.sql(`select status from public.study_invites where id = $1`, [convite])).toEqual([{ status: "accepted" }]);
      expect(await contabilidade(eu, ele)).toEqual(antes);
      expect(antes).toEqual({ livro: 0, uso: 0, cobrancas: 0, carteiras: 0 });
      // resposta repetida continua recusada pela regra de antes
      await expect(responder(ele, convite, true)).rejects.toThrow("Convite já respondido.");
    });

    it("convite que não é meu, vencido ou de sala encerrada: as recusas de antes vêm ANTES da pré-checagem", async () => {
      await cota(true, { trial: 1 });
      const eu = await conta("trial");
      const ele = await conta("trial");
      const { sala, convite } = await formar(eu, ele);
      await gasta(ele);
      await expect(responder(eu, convite, true)).rejects.toThrow("Convite não encontrado.");
      await d.sql(`update public.checklist_rooms set phase = 'closed', closed_reason = 'saiu' where id = $1`, [sala]);
      await expect(responder(ele, convite, true)).rejects.toThrow("Esta sala já foi encerrada.");
    });
  });

  // ------------------------------------------------------------------ equipe
  it.each(["editor", "revisor"] as const)("a equipe (%s) nunca é barrada: forma match e aceita convite com todo o resto da cota zerada", async (perfil) => {
    await cota(true, { trial: 0, pro: 0 }); // ninguém tem crédito
    const admin = await conta("admin");
    const equipe = await conta(perfil);
    expect(await swipe(equipe, admin, "right")).toEqual({ matched: false });
    const r = await swipe(admin, equipe, "right");
    expect(r).toMatchObject({ matched: true, room_id: expect.any(String), partner: { user_id: equipe } });
    expect(r).not.toHaveProperty("reason");
    const [{ id: convite }] = await d.sql<{ id: string }>(`select id from public.study_invites where room_id = $1`, [r.room_id]);
    expect(await responder(equipe, convite, true)).toEqual({ room_id: r.room_id });
    expect(await contabilidade(admin, equipe)).toEqual({ livro: 0, uso: 0, cobrancas: 0, carteiras: 0 });
  });

  it("a equipe não isenta o colega: aluno sem crédito é barrado dos dois lados, e a equipe nunca recebe 'quota'", async () => {
    await cota(true, { trial: 1 });
    const admin = await conta("admin");
    const aluno = await conta("trial");
    expect(await swipe(aluno, admin, "right")).toEqual({ matched: false }); // aluno ainda tinha crédito
    await gasta(aluno);
    // a equipe escolhe o aluno sem crédito: igual a "o outro não escolheu"
    expect(await swipe(admin, aluno, "right")).toEqual({ matched: false });
    expect(await rastros(admin, aluno)).toEqual({ matches: 0, salas: 0, convites: 0 });
    // e o aluno sem crédito é quem recebe 'quota'
    expect(await swipe(aluno, admin, "right")).toEqual({ matched: false, reason: "quota" });
  });

  // ------------------------------------------------------------------ colar duas vezes
  it("colar a 014050 duas vezes dá o mesmo banco (funções, permissões, índices e políticas) e a pré-checagem segue valendo", async () => {
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
    expect(await retrato()).toEqual(antes);

    // permissões e definição das duas funções redefinidas
    for (const f of ["app_dupla_swipe(uuid, text, text)", "app_dupla_answer_invite(uuid, boolean)"]) {
      const ok = async (papel: string) =>
        (await d.sql<{ ok: boolean }>(`select has_function_privilege($1, $2::regprocedure, 'execute') as ok`, [papel, `public.${f}`]))[0].ok;
      expect(await ok("anon"), `${f} anon`).toBe(false);
      expect(await ok("authenticated"), `${f} authenticated`).toBe(true);
    }
    const defs = await d.sql<any>(
      `select proname, prosecdef, proconfig, provolatile from pg_proc
        where pronamespace = 'public'::regnamespace and proname in ('app_dupla_swipe', 'app_dupla_answer_invite') order by 1`
    );
    expect(defs).toHaveLength(2);
    for (const f of defs) expect(f, f.proname).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'], provolatile: "v" });

    // depois de colada de novo, a pré-checagem continua valendo
    await cota(true, { trial: 0 });
    const eu = await conta("trial");
    const ele = await conta("pro");
    expect(await swipe(eu, ele, "right")).toEqual({ matched: false, reason: "quota" });
  });
});
