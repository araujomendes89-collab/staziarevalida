// @vitest-environment node
/**
 * Stazia Match · livro de créditos · o que o aluno vê (migrações 014020 e 014030): app_credit_state, leitura do próprio
 * livro, uso do dia e cobranças, a carteira fechada, a exportação dos dados, a exclusão da conta e as permissões.
 * Conferido num Postgres em memória (PGlite) com as regras reais (todas as migrações, em ordem).
 *
 * As regras internas das funções credit_* (limites, ordem, idempotência, estorno, conciliação) ficam em
 * duplaCreditosBanco.test.ts. Como o livro é só-acrescenta, cada teste cria as próprias contas ("conta()").
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { U, makeRoom, openDuplaDb, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const COLUNAS_LIBERADAS = "id, user_id, pool, day, kind, bucket, amount, ref_type, ref_id, reverses_id, reason, created_at";
const CHAVES_DO_ESTADO = ["ativa", "ilimitado", "limite_dia", "usados_hoje", "bonus", "comprados", "disponivel", "pool", "renova_em"];

describe("Livro de créditos · o que o aluno vê, exportação, exclusão da conta e permissões", () => {
  let d: DuplaDb;

  const chave = (p = "k") => `${p}-${Math.random().toString(36).slice(2, 12)}`;
  const cota = async (ativa: boolean, match: Record<string, unknown> = {}) => {
    const valor = { ativa, match: { trial: 2, pro: 3, elite: 5, cobra_rodada_extra: false, ...match }, ia: { pro: 4, trial: { dia: 1 } } };
    await d.sql(`update public.app_settings set value = $1::jsonb where key = 'creditos'`, [JSON.stringify(valor)]);
  };
  type Perfil = "trial" | "pro" | "vencido" | "admin" | "editor" | "revisor";
  const conta = async (perfil: Perfil = "pro"): Promise<string> => {
    const id = randomUUID();
    await d.sql(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb)`, [id, `${id}@teste.dev`]);
    if (perfil === "pro") await setPlan(d.db, id, "pro", "active");
    else if (perfil === "trial") await setPlan(d.db, id, "trial", "trialing", daqui(7));
    else if (perfil === "vencido") await d.sql(`update public.subscriptions set status = 'expired', trial_ends_at = now() - interval '1 day' where user_id = $1`, [id]);
    else if (perfil === "admin") await d.sql(`update public.user_roles set role = 'admin' where user_id = $1`, [id]);
    else if (perfil === "editor") await d.sql(`update public.user_roles set role = 'editor' where user_id = $1`, [id]);
    else await d.sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [id]);
    return id;
  };
  const consome = async (uid: string, n = 1, o: { pool?: string; ref?: string; idem?: string } = {}): Promise<any> =>
    (
      await d.sql(`select public.credit_consume($1::uuid, $2, $3::int, 'room', $4::uuid, $5) as r`, [uid, o.pool ?? "match", n, o.ref ?? randomUUID(), o.idem ?? chave()])
    )[0].r;
  const concede = async (uid: string, n: number, bucket: "bonus" | "purchased", pool = "match"): Promise<any> =>
    (await d.sql(`select public.credit_grant($1::uuid, $2, $3::int, 'teste', $4, $5) as r`, [uid, pool, n, chave("g"), bucket]))[0].r;
  const estado = (uid: string, pool = "match") => d.rpc(uid, "app_credit_state", { p_pool: pool });
  const contagem = async (tabela: string, uid: string) =>
    (await d.sql<{ n: number }>(`select count(*)::int as n from public.${tabela} where user_id = $1`, [uid]))[0].n;
  const conciliar = async (pool = "match"): Promise<any> => (await d.sql(`select public.credit_reconcile($1) as r`, [pool]))[0].r;

  /** Cobrança da sala ligada ao lançamento do consumo. */
  const cobrar = (room: string, uid: string, ledger: number | null, bucket = "daily", round = 1) =>
    d.sql(`insert into public.study_room_charges (room_id, user_id, round, bucket, usage_date, ledger_id) values ($1, $2, $3, $4, current_date, $5)`, [room, uid, round, bucket, ledger]);

  beforeAll(async () => {
    d = await openDuplaDb();
  }, 120_000);
  beforeEach(async () => {
    await cota(true);
    await setDupla(d.db, { aberto: true, planos: ["trial", "pro", "elite"] });
  });
  afterAll(async () => {
    await d?.db.close();
  });

  // ------------------------------------------------------------------ app_credit_state
  describe("app_credit_state(moeda)", () => {
    it("devolve só o estado de quem chama, com as chaves combinadas", async () => {
      const a = await conta("pro"); // limite 3
      const b = await conta("trial"); // limite 2
      await consome(a);
      await consome(a);
      await concede(a, 4, "bonus");
      await concede(a, 1, "purchased");
      await consome(b);

      const ea = await estado(a);
      expect(Object.keys(ea).sort()).toEqual([...CHAVES_DO_ESTADO].sort());
      expect(ea).toMatchObject({ ativa: true, ilimitado: false, limite_dia: 3, usados_hoje: 2, bonus: 4, comprados: 1, disponivel: 6, pool: "match" });
      const eb = await estado(b);
      expect(eb).toMatchObject({ ativa: true, ilimitado: false, limite_dia: 2, usados_hoje: 1, bonus: 0, comprados: 0, disponivel: 1, pool: "match" });
      // a moeda 'ia' é outra conta
      expect(await estado(a, "ia")).toMatchObject({ limite_dia: 4, usados_hoje: 0, disponivel: 4, pool: "ia" });
      expect(await estado(b, "ia")).toMatchObject({ limite_dia: 1, disponivel: 1, pool: "ia" });
    });

    it("não aceita o estado de outra pessoa: a função não tem parâmetro de usuário", async () => {
      const [{ args }] = await d.sql<{ args: string }>(`select pg_get_function_arguments('public.app_credit_state(text)'::regprocedure) as args`);
      expect(args).toBe("p_pool text");
      const a = await conta("pro");
      await expect(d.rpc(a, "app_credit_state", { p_pool: "match", p_uid: U.ana })).rejects.toThrow(/does not exist|function/i);
    });

    it("com a cota desligada a tela recebe ativa:false, sem limite e sem disponível", async () => {
      await cota(false);
      const a = await conta("pro");
      const e = await estado(a);
      expect(e).toMatchObject({ ativa: false, ilimitado: false, limite_dia: null, usados_hoje: 0, bonus: 0, comprados: 0, disponivel: null, pool: "match" });
      expect(Object.keys(e).sort()).toEqual([...CHAVES_DO_ESTADO].sort());
    });

    it("renova_em é a próxima meia-noite de São Paulo (03:00:00Z do dia seguinte)", async () => {
      const a = await conta("pro");
      // SP é UTC-3: o dia de SP agora e o instante da próxima meia-noite de SP, calculados em JS antes e depois da chamada
      const esperado = (agora: number) => {
        const sp = new Date(agora - 3 * 3_600_000);
        return Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() + 1, 3, 0, 0, 0);
      };
      const antes = esperado(Date.now());
      const e = await estado(a);
      const depois = esperado(Date.now());
      const instante = new Date(e.renova_em);
      expect(Number.isNaN(instante.getTime())).toBe(false);
      expect([antes, depois]).toContain(instante.getTime());
      expect(instante.getUTCHours()).toBe(3);
      expect(instante.getUTCMinutes()).toBe(0);
      expect(instante.getUTCSeconds()).toBe(0);
      expect(instante.getTime()).toBeGreaterThan(Date.now());
      expect(instante.getTime()).toBeLessThanOrEqual(Date.now() + 24 * 3_600_000 + 1000);
    });

    it("moeda inválida (ou ausente) devolve 'Moeda inválida.'", async () => {
      const a = await conta("pro");
      await expect(d.rpc(a, "app_credit_state", { p_pool: "xx" })).rejects.toThrow(/Moeda inválida\./);
      await expect(d.rpc(a, "app_credit_state", { p_pool: "" })).rejects.toThrow(/Moeda inválida\./);
      await expect(d.rpc(a, "app_credit_state", { p_pool: null })).rejects.toThrow(/Moeda inválida\./);
    });

    it("o visitante é barrado", async () => {
      await expect(d.rpc(null, "app_credit_state", { p_pool: "match" })).rejects.toThrow(/permission denied/);
    });

    it("quem não tem acesso ao Treino (módulo fechado, plano vencido) também lê o próprio estado", async () => {
      await setDupla(d.db, { aberto: false, planos: [] });
      const a = await conta("pro");
      const v = await conta("vencido");
      expect(await estado(a)).toMatchObject({ ativa: true, limite_dia: 3, disponivel: 3 });
      expect(await estado(v)).toMatchObject({ ativa: true, ilimitado: false, limite_dia: 0, disponivel: 0 });
      // e a tela de procurar dupla segue fechada para esse mesmo aluno (a função de créditos não abre o módulo)
      await expect(d.rpc(v, "app_dupla_deck")).rejects.toThrow(/Sem acesso ao Treinamento em Dupla\./);
    });

    it("equipe (administrador, editor, revisor médico): ilimitado true, sem limite e sem disponível", async () => {
      for (const perfil of ["admin", "editor", "revisor"] as const) {
        const u = await conta(perfil);
        expect(await estado(u), perfil).toMatchObject({ ativa: true, ilimitado: true, limite_dia: null, usados_hoje: 0, bonus: 0, comprados: 0, disponivel: null, pool: "match" });
      }
      expect(await estado(U.admin)).toMatchObject({ ilimitado: true });
    });

    it("o estado acompanha o gasto (disponível cai a cada débito) e nunca traz o motivo nem o saldo do outro", async () => {
      const a = await conta("pro");
      const b = await conta("pro");
      for (let i = 0; i < 3; i++) {
        expect((await estado(a)).disponivel).toBe(3 - i);
        await consome(a);
      }
      expect(await estado(a)).toMatchObject({ usados_hoje: 3, disponivel: 0 });
      expect(await estado(b)).toMatchObject({ usados_hoje: 0, disponivel: 3 });
      const texto = JSON.stringify(await estado(a));
      expect(texto).not.toMatch(/idem|created_by|reason|ledger/);
    });
  });

  // ------------------------------------------------------------------ leitura das tabelas
  describe("o que o aluno lê direto das tabelas", () => {
    it("lê só os próprios lançamentos do livro, nas colunas liberadas; o colega não vê nada de outro", async () => {
      const a = await conta("pro");
      const b = await conta("pro");
      await consome(a);
      await consome(a);
      await concede(a, 2, "bonus");
      const c = await consome(b);

      const la = await d.asUser(a, `select ${COLUNAS_LIBERADAS} from public.credit_ledger order by id`);
      expect(la).toHaveLength(3);
      expect(la.every((l) => l.user_id === a)).toBe(true);
      expect(la.map((l) => l.kind)).toEqual(["consume", "consume", "grant"]);
      expect(Object.keys(la[0]).sort()).toEqual(COLUNAS_LIBERADAS.split(", ").sort());
      const lb = await d.asUser(b, `select ${COLUNAS_LIBERADAS} from public.credit_ledger order by id`);
      expect(lb).toHaveLength(1);
      expect(lb[0]).toMatchObject({ user_id: b, id: c.ledger_id, kind: "consume", bucket: "daily", amount: 1, pool: "match" });
      // tentar pedir o lançamento do outro pelo número não devolve nada
      expect(await d.asUser(b, `select id from public.credit_ledger where user_id = $1`, [a])).toEqual([]);
      expect(await d.asUser(b, `select id from public.credit_ledger where id = $1`, [la[0].id])).toEqual([]);
      // quem não tem lançamento não vê nada
      expect(await d.asUser(await conta("pro"), `select id from public.credit_ledger`)).toEqual([]);
    });

    it("idem_key e created_by são ilegíveis para o aluno ('permission denied'), inclusive com select *", async () => {
      const a = await conta("pro");
      await consome(a);
      for (const sql of [
        `select idem_key from public.credit_ledger`,
        `select created_by from public.credit_ledger`,
        `select * from public.credit_ledger`,
        `select l.idem_key from public.credit_ledger l`,
        `select id from public.credit_ledger where idem_key like 'k-%'`,
        `select count(*) from public.credit_ledger where created_by is null`,
        `select to_jsonb(l) from public.credit_ledger l`,
      ]) {
        await expect(d.asUser(a, sql), sql).rejects.toThrow(/permission denied/);
      }
    });

    it("uso do dia: só as próprias linhas", async () => {
      const a = await conta("pro");
      const b = await conta("pro");
      await consome(a);
      await consome(a, 2);
      await consome(b);
      expect(await d.asUser(a, `select user_id, pool, used from public.credit_daily`)).toEqual([{ user_id: a, pool: "match", used: 3 }]);
      expect(await d.asUser(b, `select user_id, used from public.credit_daily`)).toEqual([{ user_id: b, used: 1 }]);
      expect(await d.asUser(b, `select used from public.credit_daily where user_id = $1`, [a])).toEqual([]);
      expect(await d.asUser(await conta("pro"), `select * from public.credit_daily`)).toEqual([]);
    });

    it("cobranças da sala: só as próprias linhas", async () => {
      const a = await conta("pro");
      const b = await conta("pro");
      const room = await makeRoom(d.db, { members: [a, b], phase: "closed", station: null });
      const ca = await consome(a, 1, { ref: room });
      const cb = await consome(b, 1, { ref: room });
      await cobrar(room, a, ca.ledger_id);
      await cobrar(room, b, cb.ledger_id);
      const ra = await d.asUser(a, `select room_id, user_id, round, bucket, ledger_id from public.study_room_charges`);
      expect(ra).toEqual([{ room_id: room, user_id: a, round: 1, bucket: "daily", ledger_id: ca.ledger_id }]);
      const rb = await d.asUser(b, `select user_id from public.study_room_charges`);
      expect(rb).toEqual([{ user_id: b }]);
      expect(await d.asUser(b, `select * from public.study_room_charges where user_id = $1`, [a])).toEqual([]);
      expect(await d.asUser(await conta("pro"), `select * from public.study_room_charges`)).toEqual([]);
    });

    it("a carteira (credit_wallets) é ilegível: 'permission denied' para qualquer select, mesmo de quem tem saldo", async () => {
      const a = await conta("pro");
      await concede(a, 3, "bonus");
      for (const sql of [
        `select * from public.credit_wallets`,
        `select user_id from public.credit_wallets`,
        `select bonus_balance from public.credit_wallets where user_id = $1`,
        `select count(*) from public.credit_wallets`,
      ]) {
        await expect(d.asUser(a, sql, sql.includes("$1") ? [a] : []), sql).rejects.toThrow(/permission denied/);
      }
      // o saldo chega ao aluno só pela função
      expect(await estado(a)).toMatchObject({ bonus: 3 });
    });

    it("nenhuma escrita direta (insert, update, delete) nas 4 tabelas pelo aluno", async () => {
      const a = await conta("pro");
      const b = await conta("pro");
      const room = await makeRoom(d.db, { members: [a, b], phase: "closed", station: null });
      const c = await consome(a, 1, { ref: room });
      await concede(a, 1, "bonus");
      await cobrar(room, a, c.ledger_id);
      const escritas = [
        `insert into public.credit_wallets (user_id, pool, bonus_balance) values ($1, 'ia', 999)`,
        `update public.credit_wallets set bonus_balance = 999 where user_id = $1`,
        `delete from public.credit_wallets where user_id = $1`,
        `insert into public.credit_daily (user_id, pool, day, used) values ($1, 'ia', '2026-01-01', 0)`,
        `update public.credit_daily set used = 0 where user_id = $1`,
        `delete from public.credit_daily where user_id = $1`,
        `insert into public.credit_ledger (user_id, pool, day, kind, bucket, amount, idem_key) values ($1, 'match', '2026-01-01', 'grant', 'bonus', 999, 'invasao')`,
        `update public.credit_ledger set amount = 1 where user_id = $1`,
        `delete from public.credit_ledger where user_id = $1`,
        `insert into public.study_room_charges (room_id, user_id, round, bucket, usage_date) values ('${room}', $1, 7, 'unlimited', '2026-01-01')`,
        `update public.study_room_charges set bucket = 'unlimited', ledger_id = null where user_id = $1`,
        `delete from public.study_room_charges where user_id = $1`,
        `truncate public.credit_daily`,
        `truncate public.credit_ledger`,
      ];
      for (const sql of escritas) {
        await expect(d.asUser(a, sql, sql.includes("$1") ? [a] : []), sql).rejects.toThrow(/permission denied/);
      }
      // nada mudou
      expect(await contagem("credit_ledger", a)).toBe(2);
      expect(await contagem("credit_daily", a)).toBe(1);
      expect(await contagem("study_room_charges", a)).toBe(1);
      expect(await estado(a)).toMatchObject({ usados_hoje: 1, bonus: 1 });
      expect(await d.sql(`select 1 from public.credit_ledger where idem_key = 'invasao'`)).toEqual([]);
    });

    it("o visitante (anon) não lê nem escreve em nenhuma das 4 tabelas", async () => {
      const a = await conta("pro");
      await consome(a);
      for (const t of ["credit_wallets", "credit_daily", "credit_ledger", "study_room_charges"]) {
        for (const p of ["select", "insert", "update", "delete"]) {
          const [{ ok }] = await d.sql<{ ok: boolean }>(`select has_table_privilege('anon', $1, $2) as ok`, [`public.${t}`, p]);
          expect(ok, `anon ${p} ${t}`).toBe(false);
        }
      }
    });

    it("a configuração 'creditos' (limites por plano) não é lida direto pelo aluno: só a equipe lê app_settings", async () => {
      const a = await conta("pro");
      expect(await d.asUser(a, `select value from public.app_settings where key = 'creditos'`)).toEqual([]);
      const lida = await d.asUser(U.admin, `select value from public.app_settings where key = 'creditos'`);
      expect(lida).toHaveLength(1);
      expect(lida[0].value.match.pro).toBe(3);
      // e o aluno não grava
      await expect(d.asUser(a, `update public.app_settings set value = '{"ativa": false}'::jsonb where key = 'creditos'`)).resolves.toMatchObject({ affectedRows: 0 });
      expect((await d.sql(`select value from public.app_settings where key = 'creditos'`))[0].value.ativa).toBe(true);
    });
  });

  // ------------------------------------------------------------------ exportação
  describe("exportação dos dados (app_export_my_data / dupla_export_creditos)", () => {
    const CHAVES_ANTIGAS = [
      "exported_at", "account", "profile", "role", "subscription", "practice_sessions", "question_attempts", "question_bookmarks",
      "error_notes", "plan_tasks", "flashcards", "flashcard_states", "flashcard_reviews", "checklist_favorites",
      "checklist_station_reports", "checklist_event_confirmations", "checklist_study_sessions", "study_profile", "study_swipes",
      "study_matches", "checklist_rooms", "acceptances", "declarations", "study_chat",
    ];

    it("traz study_credits com wallets, daily, ledger e room_charges só do aluno, sem idem_key nem created_by", async () => {
      const a = await conta("pro");
      const b = await conta("pro");
      const room = await makeRoom(d.db, { members: [a, b], phase: "closed", station: null });
      const ca = await consome(a, 1, { ref: room });
      const cb = await consome(b, 1, { ref: room });
      await cobrar(room, a, ca.ledger_id);
      await cobrar(room, b, cb.ledger_id);
      await concede(a, 2, "bonus");
      await concede(b, 7, "purchased");
      const e = await d.sql(`select public.credit_refund($1::bigint, 'teste') as r`, [ca.ledger_id]); // gera um estorno com reverses_id
      expect(e[0].r.already).toBe(false);

      const out = await d.rpc(a, "app_export_my_data");
      const bloco = out.study_credits;
      expect(Object.keys(bloco).sort()).toEqual(["daily", "ledger", "room_charges", "wallets"]);

      expect(bloco.wallets).toHaveLength(1);
      expect(bloco.wallets[0]).toMatchObject({ pool: "match", bonus_balance: 2, purchased_balance: 0 });
      expect(Object.keys(bloco.wallets[0]).sort()).toEqual(["bonus_balance", "pool", "purchased_balance", "updated_at"]);

      expect(bloco.daily).toHaveLength(1);
      expect(bloco.daily[0]).toMatchObject({ pool: "match", used: 0 }); // consumiu 1 e foi estornado
      expect(Object.keys(bloco.daily[0]).sort()).toEqual(["day", "pool", "used"]);

      expect(bloco.ledger.map((l: any) => l.kind)).toEqual(["consume", "grant", "refund"]);
      for (const l of bloco.ledger) {
        // as mesmas colunas liberadas ao aluno, menos user_id (o bloco já é só dele)
        expect(Object.keys(l).sort()).toEqual(COLUNAS_LIBERADAS.split(", ").filter((c) => c !== "user_id").sort());
      }
      expect(bloco.ledger[2].reverses_id).toBe(ca.ledger_id);
      expect(bloco.ledger.map((l: any) => l.id)).not.toContain(cb.ledger_id);

      expect(bloco.room_charges).toHaveLength(1);
      expect(bloco.room_charges[0]).toMatchObject({ room_id: room, round: 1, bucket: "daily", ledger_id: ca.ledger_id });
      expect(Object.keys(bloco.room_charges[0]).sort()).toEqual(["bucket", "created_at", "ledger_id", "room_id", "round", "usage_date"]);

      const texto = JSON.stringify(bloco);
      expect(texto).not.toContain("idem_key");
      expect(texto).not.toContain("created_by");
      expect(texto).not.toContain(b); // nada do colega
      expect(JSON.stringify(out)).not.toContain("idem_key");

      // a do colega traz só o dele
      const outB = await d.rpc(b, "app_export_my_data");
      expect(outB.study_credits.wallets[0]).toMatchObject({ purchased_balance: 7, bonus_balance: 0 });
      expect(outB.study_credits.ledger.map((l: any) => l.kind)).toEqual(["consume", "purchase"]);
      expect(JSON.stringify(outB.study_credits)).not.toContain(a);
    });

    it("quem nunca usou créditos recebe listas vazias (não nulo)", async () => {
      const a = await conta("pro");
      const out = await d.rpc(a, "app_export_my_data");
      expect(out.study_credits).toEqual({ wallets: [], daily: [], ledger: [], room_charges: [] });
    });

    it("a exportação do visitante é nula, e as chaves antigas continuam todas presentes", async () => {
      expect(await d.rpc(null, "app_export_my_data")).toBeNull();
      expect(await d.rpc(null, "dupla_export_creditos")).toBeNull();
      const out = await d.rpc(U.ana, "app_export_my_data");
      const chaves = Object.keys(out);
      for (const k of CHAVES_ANTIGAS) expect(chaves, k).toContain(k);
      expect(chaves).toContain("study_credits");
      expect(chaves).toHaveLength(CHAVES_ANTIGAS.length + 1);
      expect(out.account).toEqual({ id: U.ana });
    });

    it("dupla_export_creditos chamada direto pelo aluno devolve o mesmo bloco do aluno", async () => {
      const a = await conta("pro");
      await consome(a);
      const direto = await d.rpc(a, "dupla_export_creditos");
      const completo = await d.rpc(a, "app_export_my_data");
      expect(direto).toEqual(completo.study_credits);
      expect(direto.ledger).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------ exclusão da conta
  describe("excluir a conta", () => {
    /** Monta uma sala com os dois alunos já cobrados, bônus e um estorno. */
    const montar = async () => {
      const x = await conta("pro");
      const y = await conta("pro");
      const room = await makeRoom(d.db, { members: [x, y], phase: "closed", station: null });
      const p = (await d.sql(`select public.credit_consume_pair('match', $1::uuid, $2::uuid, 'room', $3::uuid, $4) as r`, [x, y, room, chave("par")]))[0].r;
      await cobrar(room, x, p[x].ledger_id);
      await cobrar(room, y, p[y].ledger_id);
      await concede(x, 3, "bonus");
      await concede(y, 2, "purchased");
      await consome(x, 3); // 2 diários + 1 bônus
      await d.sql(`select public.credit_refund($1::bigint, 'teste')`, [p[x].ledger_id]);
      return { x, y, room };
    };

    it("apaga lançamentos, uso do dia, carteira e cobranças da conta excluída e NÃO toca nos do colega", async () => {
      const { x, y, room } = await montar();
      const antesY = {
        livro: await d.sql(`select * from public.credit_ledger where user_id = $1 order by id`, [y]),
        uso: await d.sql(`select * from public.credit_daily where user_id = $1`, [y]),
        carteira: await d.sql(`select * from public.credit_wallets where user_id = $1`, [y]),
        cobrancas: await d.sql(`select * from public.study_room_charges where user_id = $1`, [y]),
      };
      expect(await contagem("credit_ledger", x)).toBeGreaterThan(3);
      expect(await contagem("credit_daily", x)).toBe(1);
      expect(await contagem("credit_wallets", x)).toBe(1);
      expect(await contagem("study_room_charges", x)).toBe(1);

      await d.sql(`delete from auth.users where id = $1`, [x]);

      for (const t of ["credit_ledger", "credit_daily", "credit_wallets", "study_room_charges"]) expect(await contagem(t, x), t).toBe(0);
      expect({
        livro: await d.sql(`select * from public.credit_ledger where user_id = $1 order by id`, [y]),
        uso: await d.sql(`select * from public.credit_daily where user_id = $1`, [y]),
        carteira: await d.sql(`select * from public.credit_wallets where user_id = $1`, [y]),
        cobrancas: await d.sql(`select * from public.study_room_charges where user_id = $1`, [y]),
      }).toEqual(antesY);
      expect(await d.sql(`select 1 from public.study_room_charges where room_id = $1 and user_id = $2`, [room, y])).toHaveLength(1);
      // a conciliação segue em ordem depois da exclusão
      expect(await conciliar("match")).toMatchObject({ ok: true, total: 0 });
      // a exportação do colega continua inteira
      expect((await d.rpc(y, "app_export_my_data")).study_credits.ledger.length).toBe(antesY.livro.length);
    });

    it("apagar só a linha do livro de uma conta que ainda existe continua recusado", async () => {
      const { x, y } = await montar();
      const MSG = /O livro de créditos só aceita novas linhas\./;
      await expect(d.sql(`delete from public.credit_ledger where user_id = $1`, [y])).rejects.toThrow(MSG);
      await expect(d.sql(`delete from public.credit_ledger where user_id = $1`, [x])).rejects.toThrow(MSG);
      await expect(d.sql(`update public.credit_ledger set reason = 'x' where user_id = $1`, [x])).rejects.toThrow(MSG);
      expect(await contagem("credit_ledger", x)).toBeGreaterThan(3);
      expect(await contagem("credit_ledger", y)).toBeGreaterThan(1);
      // depois que a conta de x some, o livro de y segue protegido
      await d.sql(`delete from auth.users where id = $1`, [x]);
      await expect(d.sql(`delete from public.credit_ledger where user_id = $1`, [y])).rejects.toThrow(MSG);
      expect(await contagem("credit_ledger", y)).toBeGreaterThan(1);
    });

    it("excluir a conta de quem tem só lançamentos de equipe (concessão feita por um administrador) funciona", async () => {
      const aluno = await conta("pro");
      await consome(aluno);
      const g = await d.db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U.admin, role: "authenticated" })]);
        return (await tx.query<{ r: any }>(`select public.credit_grant($1::uuid, 'match', 2, 'cortesia', $2) as r`, [aluno, chave("g")])).rows[0].r;
      });
      // o lançamento guarda quem da equipe lançou, mas o aluno nunca vê isso
      expect((await d.sql(`select created_by from public.credit_ledger where id = $1`, [g.ledger_id]))[0].created_by).toBe(U.admin);
      await d.sql(`delete from auth.users where id = $1`, [aluno]);
      expect(await contagem("credit_ledger", aluno)).toBe(0);
    });

    // (Bug achado na 014020 e corrigido no gatilho do livro: zerar created_by de conta excluída é permitido.)
    // credit_ledger.created_by tem "on delete set null", mas o gatilho credit_ledger_guard recusa todo UPDATE (a única exceção é DELETE
    // de conta já excluída). Excluir a conta de um administrador que já concedeu ou estornou crédito dispara o "set null" e
    // a exclusão inteira falha com "O livro de créditos só aceita novas linhas." Esperado: a conta sai e created_by vira nulo.
    it("excluir a conta de um administrador que já lançou créditos não é travado pelo livro (created_by vira nulo)", async () => {
      const staff = await conta("admin");
      const aluno = await conta("pro");
      const g = await d.db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: staff, role: "authenticated" })]);
        return (await tx.query<{ r: any }>(`select public.credit_grant($1::uuid, 'match', 2, 'cortesia', $2) as r`, [aluno, chave("g")])).rows[0].r;
      });
      expect((await d.sql(`select created_by from public.credit_ledger where id = $1`, [g.ledger_id]))[0].created_by).toBe(staff);
      await d.sql(`delete from auth.users where id = $1`, [staff]);
      expect((await d.sql(`select created_by from public.credit_ledger where id = $1`, [g.ledger_id]))[0].created_by).toBeNull();
    });
  });

  // ------------------------------------------------------------------ permissões
  describe("permissões", () => {
    const acesso = async (assinatura: string, papel: string) =>
      (await d.sql<{ ok: boolean }>(`select has_function_privilege($1, $2::regprocedure, 'execute') as ok`, [papel, `public.${assinatura}`]))[0].ok;
    const acl = async (assinatura: string) =>
      (await d.sql<{ acl: string | null }>(`select proacl::text as acl from pg_proc where oid = $1::regprocedure`, [`public.${assinatura}`]))[0].acl ?? "";

    it("app_credit_state: fechada para anon, aberta para authenticated", async () => {
      expect(await acesso("app_credit_state(text)", "anon")).toBe(false);
      expect(await acesso("app_credit_state(text)", "authenticated")).toBe(true);
      expect(await acl("app_credit_state(text)")).not.toMatch(/(^|[{,])=X/); // nem para "public"
    });

    it("dupla_export_creditos: aberta para authenticated e anon, como dupla_export_chat", async () => {
      expect(await acesso("dupla_export_creditos()", "authenticated")).toBe(true);
      expect(await acesso("dupla_export_creditos()", "anon")).toBe(true);
      expect(await acesso("dupla_export_chat()", "anon")).toBe(true);
      expect(await acl("dupla_export_creditos()")).toBe(await acl("dupla_export_chat()"));
    });

    it("app_export_my_data segue aberta para authenticated (o visitante recebe nulo)", async () => {
      expect(await acesso("app_export_my_data()", "authenticated")).toBe(true);
    });

    it("app_credit_state e as exportações são security definer com caminho de busca vazio (a exportação roda como o aluno: security invoker)", async () => {
      const r = await d.sql<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(
        `select proname, prosecdef, proconfig from pg_proc where pronamespace = 'public'::regnamespace
            and proname in ('app_credit_state', 'dupla_export_creditos', 'app_export_my_data') order by 1`
      );
      const por = Object.fromEntries(r.map((x) => [x.proname, x]));
      expect(por.app_credit_state.prosecdef).toBe(true);
      expect(por.app_credit_state.proconfig).toContain('search_path=""');
      expect(por.dupla_export_creditos.prosecdef).toBe(true);
      expect(por.dupla_export_creditos.proconfig).toContain('search_path=""');
      expect(por.app_export_my_data.proconfig).toContain('search_path=""');
    });
  });
});
