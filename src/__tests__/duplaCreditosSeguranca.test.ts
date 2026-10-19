// @vitest-environment node
/**
 * Stazia Match · Etapa M5a e M5c (nível do banco): as provas de segurança do documento de engenharia (§47) e a jornada completa
 * do dinheiro/crédito, do match à conciliação, num Postgres em memória (PGlite) com as regras reais (todas as migrações).
 * O PGlite tem UMA conexão: a corrida entre conexões fica no roteiro scripts/dupla/concorrencia-creditos.mjs (Postgres real).
 * A jornada é o equivalente, no banco, do "ponta a ponta" do plano (M5c); o ponta a ponta no navegador depende do roteiro
 * scripts/e2e/dupla.mjs (Tarefa 20 do plano de 11/10), que ainda não existe.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { U, addProfile, addStation, openDuplaDb, seen, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const ABERTO = { aberto: true, planos: ["trial", "pro", "elite"] };
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const NOMES = ["ana", "bruno", "carla", "diego", "eva", "fabio", "gil"] as const;
const COTA = (match: Record<string, unknown>, ativa = true) => JSON.stringify({ ativa, match: { cobra_rodada_extra: false, ...match }, ia: {} });
const MENSAGEM_NEUTRA = "Não foi possível iniciar agora. Confirmem a cota de hoje e tentem de novo.";

describe("Créditos · segurança (§47 do documento) e jornada completa", () => {
  let d: DuplaDb;

  const cota = (match: Record<string, unknown>, ativa = true) =>
    d.sql(`update public.app_settings set value = $1::jsonb where key = 'creditos'`, [COTA(match, ativa)]);
  const swipe = (de: string, para: string, direcao: "right" | "left" = "right") => d.rpc(de, "app_dupla_swipe", { p_to: para, p_direction: direcao });
  const estado = (uid: string) => d.rpc(uid, "app_credit_state", { p_pool: "match" });
  const gasto = async (uid: string) =>
    Number((await d.sql<{ n: string }>(`select coalesce(sum(amount), 0) as n from public.credit_ledger where user_id = $1 and kind = 'consume'`, [uid]))[0].n);
  const abertas = (uid: string) =>
    d.sql<{ id: string }>(`select id from public.checklist_rooms where phase <> 'closed' and $1 = any (member_ids)`, [uid]);

  /**
   * Banco do teste de volta ao começo. O livro de créditos não se apaga (é só-acrescenta), então as contas de teste são
   * excluídas e recriadas: a exclusão da conta leva junto o extrato, o uso do dia e a carteira (e o livro continua conciliado).
   */
  const montar = async () => {
    await d.sql(`delete from public.checklist_rooms`);
    await d.sql(`delete from public.study_matches`);
    await d.sql(`delete from auth.users where id = any ($1::uuid[])`, [Object.values(U)]);
    for (const [nome, id] of Object.entries(U)) {
      await d.sql(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`, [id, `${nome}@teste.dev`, JSON.stringify({ name: nome.toUpperCase() })]);
    }
    await d.sql(`update public.user_roles set role = 'admin' where user_id = $1`, [U.admin]);
    for (const nome of NOMES) await addProfile(d.db, U[nome], { public_name: nome.toUpperCase(), role_pref: "any" });
    for (const nome of NOMES) await seen(d.db, U[nome]);
    for (const uid of Object.values(U)) await setPlan(d.db, uid, "trial", "trialing", daqui(7));
    await setDupla(d.db, ABERTO);
    await cota({}, false);
  };

  /** x e y formam a sala pelo caminho real e a deixam em "setup", os dois prontos (a fase "setup" é montada direto no banco). */
  const salaPronta = async (x: string, y: string, avaliador: string) => {
    expect(await swipe(y, x)).toEqual({ matched: false });
    const r = await swipe(x, y);
    expect(r.matched).toBe(true);
    // (Com a cota ligada o início exige o convite aceito: quem foi convidado, y, aceita.)
    const inv = await d.rpc(y, "app_dupla_invites");
    await d.rpc(y, "app_dupla_answer_invite", { p_invite_id: inv.invites[0].id, p_accept: true });
    const candidato = avaliador === x ? y : x;
    await d.sql(
      `update public.checklist_rooms set phase = 'setup', candidate_id = $2, evaluator_id = $3, ready_ids = member_ids, confirmed_ids = member_ids, connected_ids = member_ids
        where id = $1`,
      [r.room_id, candidato, avaliador]
    );
    return r.room_id as string;
  };
  const iniciar = (quem: string, sala: string) => d.rpc(quem, "app_dupla_start", { p_room_id: sala });

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

  // ------------------------------------------------------------------ o navegador nunca manda
  it("mexer no plano, no saldo, no limite ou no dia pelo navegador não muda a cota: o servidor ignora e recusa", async () => {
    await cota({ trial: 1, pro: 5 });
    await setPlan(d.db, U.ana, "trial", "trialing", daqui(7));
    const antes = await estado(U.ana);
    expect(antes).toMatchObject({ ativa: true, limite_dia: 1, disponivel: 1 });

    // Tentar virar Elite ou mudar o plano direto na tabela: sem efeito (ou recusado).
    const tentativas = [
      `update public.subscriptions set plan = 'elite', status = 'active', current_period_end = now() + interval '30 days' where user_id = '${U.ana}'`,
      `update public.credit_daily set used = 0 where user_id = '${U.ana}'`,
      `insert into public.credit_wallets (user_id, pool, bonus_balance) values ('${U.ana}', 'match', 999)`,
      `insert into public.credit_ledger (user_id, pool, day, kind, bucket, amount, idem_key) values ('${U.ana}', 'match', current_date, 'grant', 'bonus', 99, 'hack-1')`,
      `update public.app_settings set value = '{"ativa": false}' where key = 'creditos'`,
      `delete from public.credit_ledger where user_id = '${U.ana}'`,
    ];
    for (const sql of tentativas) {
      let linhas = 0;
      try {
        linhas = (await d.asUser(U.ana, sql)).affectedRows;
      } catch {
        linhas = 0; // recusado: também vale
      }
      expect(linhas, sql).toBe(0);
    }
    expect(await estado(U.ana)).toEqual(antes);

    // As funções do aluno não têm parâmetro de plano, saldo, limite nem dia: mandar um é erro.
    await expect(d.rpc(U.ana, "app_credit_state", { p_pool: "match", p_plan: "elite" } as any)).rejects.toThrow();
    await expect(d.rpc(U.ana, "app_credit_state", { p_pool: "match", p_now: "2030-01-01T00:00:00Z" } as any)).rejects.toThrow();
    await expect(d.rpc(U.ana, "app_credit_state", { p_pool: "ia; drop table x" })).rejects.toThrow(/Moeda inválida\./);
  });

  it("nenhuma credit_* é executável pelo aluno nem pelo visitante; app_credit_state só devolve o do próprio aluno", async () => {
    const funcoes = await d.sql<{ id: string }>(
      `select p.oid::regprocedure::text as id from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'credit\\_%'`
    );
    expect(funcoes.length).toBeGreaterThanOrEqual(14);
    for (const { id } of funcoes) {
      for (const papel of ["anon", "authenticated"]) {
        const ok = (await d.sql<{ ok: boolean }>(`select has_function_privilege($1, $2::regprocedure, 'execute') as ok`, [papel, id]))[0].ok;
        expect(ok, `${id} ${papel}`).toBe(false);
      }
    }
    await cota({ trial: 2 });
    await d.sql(`select public.credit_grant($1::uuid, 'match', 4, 'teste', 'seg-bonus-bruno', 'bonus')`, [U.bruno]);
    expect(await estado(U.ana)).toMatchObject({ bonus: 0 });
    expect(await estado(U.bruno)).toMatchObject({ bonus: 4 });
    await expect(d.rpc(null, "app_credit_state", { p_pool: "match" })).rejects.toThrow(/permission denied|Entre na sua conta/);
    // Um terceiro (carla) não lê o extrato nem o estado de ninguém por tabela nenhuma.
    for (const t of ["credit_wallets", "credit_ledger", "credit_daily", "study_room_charges", "study_room_claims"]) {
      const linhas = await d.asUser(U.carla, `select * from public.${t}`).catch(() => []);
      expect(linhas, t).toEqual([]);
    }
    // Todas as funções do administrador de créditos barram quem não é administrador.
    for (const [fn, args] of [
      ["app_admin_credit_config", {}], ["app_admin_credit_today", {}],
      ["app_admin_credit_statement", { p_user: U.bruno, p_pool: "match" }], ["app_admin_credit_reconcile", { p_pool: "match" }],
      ["app_admin_credit_grant", { p_user: U.bruno, p_pool: "match", p_n: 1, p_reason: "x" }],
    ] as const) {
      await expect(d.rpc(U.carla, fn, args as any), fn).rejects.toThrow(/Acesso restrito a administradores\./);
      await expect(d.rpc(null, fn, args as any), `${fn} visitante`).rejects.toThrow(/permission denied/);
    }
  });

  it("usuário 'online' falso (sinal velho, situação 'fora', sem acesso ao módulo) não forma match nem entra em sala", async () => {
    await cota({ trial: 3 });
    // (Escolher é um sinal de vida de quem escolhe; por isso as escolhas "de antes" entram direto e o sinal envelhece depois.)
    const escolheu = (de: string, para: string) =>
      d.sql(`insert into public.study_swipes (from_user, to_user, direction) values ($1, $2, 'right')`, [de, para]);
    // sinal velho de 10 minutos
    await escolheu(U.bruno, U.ana);
    await seen(d.db, U.bruno, 600);
    expect(await swipe(U.ana, U.bruno)).toEqual({ matched: false });
    // situação 'fora'
    await escolheu(U.carla, U.diego);
    await seen(d.db, U.carla, 0, "fora");
    expect(await swipe(U.diego, U.carla)).toEqual({ matched: false });
    // sem acesso ao módulo (teste vencido): quem escolhe sem acesso é recusado pelo porteiro; quem escolhe quem perdeu o acesso não forma match
    await escolheu(U.eva, U.fabio);
    await setPlan(d.db, U.eva, "trial", "trialing", daqui(-2));
    await expect(swipe(U.eva, U.gil)).rejects.toThrow(/Sem acesso ao Treinamento em Dupla\./);
    expect(await swipe(U.fabio, U.eva)).toEqual({ matched: false });
    expect(await d.sql(`select count(*)::int as n from public.checklist_rooms`)).toEqual([{ n: 0 }]);
    expect(await d.sql(`select count(*)::int as n from public.study_matches`)).toEqual([{ n: 0 }]);
    expect(await d.sql(`select count(*)::int as n from public.credit_ledger where user_id = any ($1::uuid[])`, [[U.ana, U.bruno, U.carla, U.diego, U.eva, U.fabio]])).toEqual([{ n: 0 }]);
  });

  // ------------------------------------------------------------------ cota desligada = como antes
  it("cota desligada em todos os caminhos: escolha, convite, início e saída se comportam como antes e não deixam rastro de crédito", async () => {
    const sala = await salaPronta(U.ana, U.bruno, U.bruno);
    // (O convite já foi aceito por Bruno dentro de salaPronta, sem consulta de crédito: a cota está desligada.)
    expect(await d.sql(`select status from public.study_invites where room_id = $1`, [sala])).toEqual([{ status: "accepted" }]);
    const s = await iniciar(U.bruno, sala);
    expect(s.phase).toBe("running");
    expect(JSON.stringify(s)).not.toMatch(/credit|saldo|bucket|idem/i);
    await d.rpc(U.ana, "app_dupla_leave", { p_room_id: sala });
    for (const t of ["credit_ledger", "credit_daily", "credit_wallets", "study_room_charges"]) {
      expect(await d.sql(`select count(*)::int as n from public.${t} where user_id = any ($1::uuid[])`, [[U.ana, U.bruno]]), t).toEqual([{ n: 0 }]);
    }
    expect((await d.sql<{ c: unknown }>(`select charged_at as c from public.checklist_rooms where id = $1`, [sala]))[0].c).toBeNull();
    expect(await estado(U.ana)).toMatchObject({ ativa: false, disponivel: null });
  });

  // ------------------------------------------------------------------ achados da revisão de segurança (Opus)
  it("com a cota ligada o início exige o convite aceito (senão o convite vencido fecharia uma sala já paga); desligada, segue como antes", async () => {
    await cota({ trial: 3 });
    expect(await swipe(U.bruno, U.ana)).toEqual({ matched: false });
    const r = await swipe(U.ana, U.bruno);
    await d.sql(
      `update public.checklist_rooms set phase = 'setup', candidate_id = $2, evaluator_id = $3, ready_ids = member_ids, confirmed_ids = member_ids, connected_ids = member_ids where id = $1`,
      [r.room_id, U.ana, U.bruno]
    );
    await expect(iniciar(U.bruno, r.room_id)).rejects.toThrow("O convite ainda não foi aceito.");
    expect(await d.sql(`select count(*)::int as n from public.credit_ledger where user_id = any ($1::uuid[])`, [[U.ana, U.bruno]])).toEqual([{ n: 0 }]);
    expect((await d.sql<{ phase: string }>(`select phase from public.checklist_rooms where id = $1`, [r.room_id]))[0].phase).toBe("setup");
    // aceito o convite, inicia e cobra os dois
    const inv = await d.rpc(U.bruno, "app_dupla_invites");
    await d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: inv.invites[0].id, p_accept: true });
    expect((await iniciar(U.bruno, r.room_id)).phase).toBe("running");
    expect(await gasto(U.ana)).toBe(1);
    expect(await gasto(U.bruno)).toBe(1);
  });

  it("desligada, o início não olha o convite (comportamento de antes)", async () => {
    expect(await swipe(U.bruno, U.ana)).toEqual({ matched: false });
    const r = await swipe(U.ana, U.bruno);
    await d.sql(
      `update public.checklist_rooms set phase = 'setup', candidate_id = $2, evaluator_id = $3, ready_ids = member_ids where id = $1`,
      [r.room_id, U.ana, U.bruno]
    );
    expect((await iniciar(U.bruno, r.room_id)).phase).toBe("running");
  });

  it("o consumo não grava created_by (quem aperta 'iniciar' não é 'quem lançou' os créditos dos dois); os membros de uma sala aberta não mudam", async () => {
    await cota({ trial: 3 });
    const sala = await salaPronta(U.ana, U.bruno, U.bruno);
    await iniciar(U.bruno, sala);
    expect(await d.sql(`select count(*)::int as n from public.credit_ledger where kind = 'consume' and ref_id = $1 and created_by is null`, [sala])).toEqual([{ n: 2 }]);
    await expect(d.sql(`update public.checklist_rooms set member_ids = array[$2::uuid, $3::uuid] where id = $1`, [sala, U.ana, U.carla])).rejects.toThrow(/Os membros de uma sala aberta não mudam\./);
  });

  it("uso de hoje da Administração conta também o que saiu de bônus; o preenchimento das reservas fecha sala com membro de conta excluída", async () => {
    await cota({ trial: 0 });
    await d.sql(`select public.credit_grant($1::uuid, 'match', 2, 'teste', 'hoje-bonus-' || $1::text, 'bonus')`, [U.carla]);
    await d.sql(`select public.credit_consume($1::uuid, 'match', 1, 'room', gen_random_uuid(), 'hoje-consumo-' || $1::text)`, [U.carla]);
    expect((await d.rpc(U.admin, "app_admin_credit_today")).match).toMatchObject({ creditos: 1, alunos: 1 });

    // sala aberta de uma conta que não existe mais, criada com o gatilho desligado (como estaria antes da migração)
    const fantasma = "00000000-0000-4000-8000-0000000fffff";
    await d.sql(`alter table public.checklist_rooms disable trigger checklist_rooms_claims`);
    const [sala] = await d.sql<{ id: string }>(`insert into public.checklist_rooms (member_ids, phase) values (array[$1::uuid, $2::uuid], 'roles') returning id`, [U.diego, fantasma]);
    await d.sql(`alter table public.checklist_rooms enable trigger checklist_rooms_claims`);
    await d.sql(`delete from public.study_room_claims`);
    const fs = await import("fs");
    const path = await import("path");
    for (const f of ["20261003014040_treino_dupla_integridade.sql", "20261003014050_treino_dupla_creditos_inicio.sql"]) {
      await d.db.exec(fs.readFileSync(path.join(__dirname, "../../supabase/migrations", f), "utf8"));
    }
    expect(await d.sql(`select phase, closed_reason from public.checklist_rooms where id = $1`, [sala.id])).toEqual([{ phase: "closed", closed_reason: "sem_sinal" }]);
  });

  // ------------------------------------------------------------------ a jornada completa (M5c, no banco)
  it("jornada: match, sala, início debita os dois, recarregar não debita, sem crédito não inicia e ninguém paga, cota esgotada, concessão, estorno, extrato e conciliação em zero", async () => {
    const respostas: unknown[] = [];
    const guarda = <T>(x: T): T => (respostas.push(x), x);
    // Cota ligada só no banco de teste, com valores de TESTE (nunca os definitivos).
    await cota({ trial: 1 });

    // 1) match e sala pelo caminho real; Bruno avalia
    const sala = await salaPronta(U.ana, U.bruno, U.bruno);
    expect(await estado(U.ana)).toMatchObject({ ativa: true, limite_dia: 1, usados_hoje: 0, disponivel: 1 });

    // 2) iniciar debita 1 de cada um; recarregar (repetir o início) não debita de novo
    const s = guarda(await iniciar(U.bruno, sala));
    expect(s.phase).toBe("running");
    expect(await gasto(U.ana)).toBe(1);
    expect(await gasto(U.bruno)).toBe(1);
    await expect(iniciar(U.bruno, sala)).rejects.toThrow("Esta ação não vale nesta fase da sala.");
    guarda(await d.rpc(U.ana, "app_dupla_room", { p_room_id: sala }));
    expect(await gasto(U.ana)).toBe(1);
    expect(await estado(U.ana)).toMatchObject({ usados_hoje: 1, disponivel: 0 });

    // 3) a sala termina; os dois formam outra dupla com Carla (que tem crédito) e Diego (sem crédito: já gastou o dia)
    await d.rpc(U.ana, "app_dupla_leave", { p_room_id: sala });
    await d.sql(`select public.credit_consume($1::uuid, 'match', 1, 'room', gen_random_uuid(), 'jornada-diego')`, [U.diego]);
    // Carla e Diego: Diego (sem crédito) não consegue "Estudar junto": cota esgotada para ele, e a resposta não revela o saldo de ninguém
    const diego = guarda(await swipe(U.diego, U.carla));
    expect(diego).toEqual({ matched: false, reason: "quota" });
    // Carla tem crédito e escolhe Diego: igual a "o outro não escolheu" (Diego não escolheu, e está sem crédito)
    expect(guarda(await swipe(U.carla, U.diego))).toEqual({ matched: false });

    // 4) um segundo par com um sem crédito não inicia e ninguém paga: Carla com Eva; Eva sem crédito por conta própria
    await d.sql(`select public.credit_consume($1::uuid, 'match', 1, 'room', gen_random_uuid(), 'jornada-eva')`, [U.eva]);
    const outra = await d.sql<{ id: string }>(
      `insert into public.checklist_rooms (member_ids, phase, round, candidate_id, evaluator_id, ready_ids, confirmed_ids, connected_ids)
         values (array[$1::uuid, $2::uuid], 'setup', 1, $1, $2, array[$1::uuid, $2::uuid], array[$1::uuid, $2::uuid], array[$1::uuid, $2::uuid]) returning id`,
      [U.carla, U.eva]
    );
    const antesCarla = await gasto(U.carla);
    for (const quem of [U.eva, U.carla]) {
      // quem inicia é o avaliador: a sala foi montada com Eva avaliadora; a recusa é a mesma mensagem neutra
      if (quem === U.eva) await expect(iniciar(U.eva, outra[0].id)).rejects.toThrow(MENSAGEM_NEUTRA);
    }
    expect(await gasto(U.carla)).toBe(antesCarla);
    expect((await d.sql<{ phase: string }>(`select phase from public.checklist_rooms where id = $1`, [outra[0].id]))[0].phase).toBe("setup");
    expect(await d.sql(`select count(*)::int as n from public.study_room_charges where room_id = $1`, [outra[0].id])).toEqual([{ n: 0 }]);

    // 5) concessão manual pela Administração: o número do aluno sobe
    const antes = await estado(U.eva);
    expect(antes).toMatchObject({ disponivel: 0, bonus: 0 });
    guarda(await d.rpc(U.admin, "app_admin_credit_grant", { p_user: U.eva, p_pool: "match", p_n: 2, p_reason: "Concessão de teste", p_key: "jornada-g1" }));
    expect(await estado(U.eva)).toMatchObject({ bonus: 2, disponivel: 2 });
    // e agora a sala inicia, debitando o bônus de Eva e a cota diária de Carla
    guarda(await iniciar(U.eva, outra[0].id));
    expect(await estado(U.eva)).toMatchObject({ bonus: 1 });

    // 6) estorno de um débito pela Administração e extrato
    const extrato = guarda(await d.rpc(U.admin, "app_admin_credit_statement", { p_user: U.carla, p_pool: "match", p_days: 7 }));
    const consumo = extrato.ledger.find((l: any) => l.kind === "consume");
    expect(consumo).toBeTruthy();
    const estorno = await d.rpc(U.admin, "app_admin_credit_refund", { p_ledger_id: consumo.id, p_reason: "Falha técnica comprovada (teste)" });
    expect(estorno.already).toBe(false);
    expect(await estado(U.carla)).toMatchObject({ disponivel: 1 });

    // 7) conciliação em zero
    const conc = await d.rpc(U.admin, "app_admin_credit_reconcile", { p_pool: "match" });
    expect(conc).toMatchObject({ ok: true, total: 0, problemas: [] });

    // 8) nenhuma resposta ao ALUNO trouxe saldo do colega, chave interna ou quem lançou
    const texto = JSON.stringify(respostas).replace(/"ledger":\[.*?\]\}$/s, "");
    const aluno = JSON.stringify(respostas.filter((r: any) => !r?.ledger));
    expect(aluno).not.toMatch(/idem_key|created_by/);
    expect(texto).not.toMatch(/idem_key/);
    expect(await abertas(U.ana)).toEqual([]);
  });
});
