// @vitest-environment node
/**
 * Stazia Match · livro de créditos · tabelas (migração 014020) e funções internas credit_* (migração 014030), conferidos num
 * Postgres em memória (PGlite) com as regras reais (todas as migrações, em ordem).
 *
 * As funções credit_* são internas: aqui são chamadas pelo dono do banco, como o servidor faria. O que o aluno enxerga
 * (app_credit_state, leitura do livro, exportação, exclusão da conta) fica em duplaCreditosRls.test.ts.
 *
 * Isolamento: o livro é só-acrescenta (não se apaga), por isso cada teste cria as próprias contas ("conta()") e usa
 * chaves de operação únicas. Os testes nunca mexem no livro, no uso do dia ou na carteira por fora das funções (exceto
 * os de "adulterar", que consertam a linha em seguida), de modo que a conciliação do final do arquivo continua em ordem.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { MIGRATIONS_DIR, U, makeRoom, openDuplaDb, setPlan, type DuplaDb } from "./helpers/duplaDb";

// (A 014070 refaz credit_avail e credit_state da 014030: quem cola as duas primeiras de novo cola a terceira em seguida.)
const MIGRACOES = [
  "20261003014020_treino_dupla_creditos_tabelas.sql", "20261003014030_treino_dupla_creditos_funcoes.sql", "20261003014070_treino_dupla_creditos_ia.sql",
];
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const CHAVE_INICIAL = { ativa: false, match: { cobra_rodada_extra: true }, ia: {} };

// Instantes de teste. São Paulo é UTC-3 (sem horário de verão): 02:59:59Z do dia 17 ainda é 16/10 em São Paulo.
const FIM_DO_DIA_16 = "2026-10-17T02:59:59Z";
const COMECO_DO_DIA_17 = "2026-10-17T03:00:01Z";

describe("Livro de créditos · tabelas e funções internas", () => {
  let d: DuplaDb;
  let valorInicial: unknown;

  // ------------------------------------------------------------------ apoios
  const chave = (p = "k") => `${p}-${Math.random().toString(36).slice(2, 12)}`;

  /** Liga (ou desliga) a cota. `match` e `ia` trocam os limites por plano (padrão: trial 2, pro 3, elite 5). */
  const cota = async (ativa: boolean, o: { match?: Record<string, unknown>; ia?: Record<string, unknown> } = {}) => {
    const valor = { ativa, match: { trial: 2, pro: 3, elite: 5, cobra_rodada_extra: false, ...(o.match ?? {}) }, ia: o.ia ?? {} };
    await d.sql(`update public.app_settings set value = $1::jsonb where key = 'creditos'`, [JSON.stringify(valor)]);
  };

  type Perfil = "trial" | "pro" | "elite" | "vencido" | "admin" | "editor" | "revisor";
  /** Conta nova só deste teste (o gatilho do cadastro cria perfil, papel e assinatura de teste). */
  const conta = async (perfil: Perfil = "pro"): Promise<string> => {
    const id = randomUUID();
    await d.sql(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb)`, [id, `${id}@teste.dev`]);
    if (perfil === "pro" || perfil === "elite") await setPlan(d.db, id, perfil, "active");
    else if (perfil === "trial") await setPlan(d.db, id, "trial", "trialing", daqui(7));
    else if (perfil === "vencido") await d.sql(`update public.subscriptions set status = 'expired', trial_ends_at = now() - interval '1 day' where user_id = $1`, [id]);
    else if (perfil === "admin") await d.sql(`update public.user_roles set role = 'admin' where user_id = $1`, [id]);
    else if (perfil === "editor") await d.sql(`update public.user_roles set role = 'editor' where user_id = $1`, [id]);
    else await d.sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [id]);
    return id;
  };

  const consome = async (uid: string, n: number, idem: string, o: { now?: string; pool?: string; ref?: string } = {}): Promise<any> =>
    (
      await d.sql(
        `select public.credit_consume($1::uuid, $2, $3::int, 'room', $4::uuid, $5, coalesce($6::timestamptz, now())) as r`,
        [uid, o.pool ?? "match", n, o.ref ?? randomUUID(), idem, o.now ?? null]
      )
    )[0].r;

  const concede = async (uid: string, n: number, bucket: "bonus" | "purchased", idem = chave("g"), pool = "match"): Promise<any> =>
    (await d.sql(`select public.credit_grant($1::uuid, $2, $3::int, 'teste', $4, $5) as r`, [uid, pool, n, idem, bucket]))[0].r;

  const estorna = async (ledgerId: number | string, now?: string): Promise<any> =>
    (await d.sql(`select public.credit_refund($1::bigint, 'teste', coalesce($2::timestamptz, now())) as r`, [ledgerId, now ?? null]))[0].r;

  const estado = async (uid: string, now?: string, pool = "match"): Promise<any> =>
    (await d.sql(`select public.credit_state($1::uuid, $2, coalesce($3::timestamptz, now())) as r`, [uid, pool, now ?? null]))[0].r;

  const limite = async (uid: string, pool = "match"): Promise<number | null> =>
    (await d.sql(`select public.credit_limit($1::uuid, $2) as r`, [uid, pool]))[0].r;

  const livro = (uid: string, pool = "match") =>
    d.sql(`select id::int as id, kind, bucket, amount, day::text as day, idem_key, reverses_id::int as reverses_id, ref_type, ref_id from public.credit_ledger where user_id = $1 and pool = $2 order by id`, [uid, pool]);
  const usoDoDia = (uid: string, pool = "match") =>
    d.sql(`select day::text as day, used from public.credit_daily where user_id = $1 and pool = $2 order by day`, [uid, pool]);
  const carteira = async (uid: string, pool = "match") =>
    (await d.sql(`select bonus_balance, purchased_balance from public.credit_wallets where user_id = $1 and pool = $2`, [uid, pool]))[0] ?? null;
  const conciliar = async (pool = "match"): Promise<any> => (await d.sql(`select public.credit_reconcile($1) as r`, [pool]))[0].r;

  /** A função recusou por falta de crédito (mensagem de máquina + código 54000 + dica INSUFFICIENT_CREDITS). */
  const semCredito = async (p: Promise<unknown>) => {
    await expect(p).rejects.toMatchObject({ message: "sem_credito", code: "54000", hint: "INSUFFICIENT_CREDITS" });
  };

  beforeAll(async () => {
    d = await openDuplaDb();
    valorInicial = (await d.sql(`select value from public.app_settings where key = 'creditos'`))[0]?.value;
  }, 120_000);
  beforeEach(async () => {
    await cota(false);
  });
  afterAll(async () => {
    await d?.db.close();
  });

  // ------------------------------------------------------------------ tabelas
  describe("tabelas, regras de acesso e travas", () => {
    const TABELAS = ["credit_wallets", "credit_daily", "credit_ledger", "study_room_charges"];

    it("as 4 tabelas existem com a segurança por linha (RLS) ligada", async () => {
      const r = await d.sql<{ relname: string; relrowsecurity: boolean }>(
        `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = any($1) order by relname`,
        [TABELAS]
      );
      expect(r.map((x) => x.relname)).toEqual([...TABELAS].sort());
      expect(r.every((x) => x.relrowsecurity)).toBe(true);
    });

    it("credit_wallets não tem política nenhuma e o aluno e o visitante não têm nenhum direito sobre ela", async () => {
      expect(await d.sql(`select policyname from pg_policies where schemaname = 'public' and tablename = 'credit_wallets'`)).toEqual([]);
      for (const papel of ["authenticated", "anon"]) {
        for (const privilegio of ["select", "insert", "update", "delete", "truncate", "references", "trigger"]) {
          const [{ ok }] = await d.sql<{ ok: boolean }>(`select has_table_privilege($1, 'public.credit_wallets', $2) as ok`, [papel, privilegio]);
          expect(ok, `${papel} ${privilegio}`).toBe(false);
        }
        const [{ ok }] = await d.sql<{ ok: boolean }>(`select has_any_column_privilege($1, 'public.credit_wallets', 'select') as ok`, [papel]);
        expect(ok, `${papel} coluna`).toBe(false);
      }
    });

    it("o livro recusa update, delete e truncate, mesmo vindo do dono do banco", async () => {
      const u = await conta("pro");
      const g = await concede(u, 2, "bonus");
      const MSG = /O livro de créditos só aceita novas linhas\./;
      await expect(d.sql(`update public.credit_ledger set amount = 99 where id = $1`, [g.ledger_id])).rejects.toThrow(MSG);
      await expect(d.sql(`update public.credit_ledger set reason = 'x'`)).rejects.toThrow(MSG);
      await expect(d.sql(`delete from public.credit_ledger where id = $1`, [g.ledger_id])).rejects.toThrow(MSG);
      await expect(d.sql(`delete from public.credit_ledger`)).rejects.toThrow(MSG);
      // Sem "cascade" o próprio Postgres já recusa (há chaves estrangeiras apontando para o livro); com "cascade" quem recusa é o gatilho.
      await expect(d.sql(`truncate public.credit_ledger`)).rejects.toThrow(/cannot truncate a table referenced in a foreign key constraint|O livro de créditos só aceita novas linhas\./);
      await expect(d.sql(`truncate public.credit_ledger cascade`)).rejects.toThrow(MSG);
      await expect(d.sql(`truncate public.credit_ledger, public.study_room_charges restart identity cascade`)).rejects.toThrow(MSG);
      // A linha segue intacta.
      const [linha] = await livro(u);
      expect(linha).toMatchObject({ id: g.ledger_id, kind: "grant", bucket: "bonus", amount: 2 });
    });

    it("o gatilho do livro tem os dois gatilhos: um por linha (update e delete) e um por comando (truncate)", async () => {
      const t = await d.sql<{ tgname: string; def: string }>(
        `select tgname, pg_get_triggerdef(oid) as def from pg_trigger where tgrelid = 'public.credit_ledger'::regclass and not tgisinternal order by 1`
      );
      expect(t.map((x) => x.tgname)).toEqual(["credit_ledger_no_change", "credit_ledger_no_truncate"]);
      expect(t[0].def).toMatch(/BEFORE (UPDATE OR DELETE|DELETE OR UPDATE) .* FOR EACH ROW/);
      expect(t[1].def).toMatch(/BEFORE TRUNCATE .* FOR EACH STATEMENT/);
    });

    it("saldo negativo (bônus ou comprados) é recusado pelo banco, e o uso do dia também não fica negativo", async () => {
      const u = await conta("pro");
      await concede(u, 1, "bonus");
      await expect(d.sql(`update public.credit_wallets set bonus_balance = -1 where user_id = $1`, [u])).rejects.toThrow(/check constraint|credit_wallets_bonus_balance_check/);
      await expect(d.sql(`update public.credit_wallets set purchased_balance = -1 where user_id = $1`, [u])).rejects.toThrow(/check constraint|credit_wallets_purchased_balance_check/);
      await expect(d.sql(`insert into public.credit_wallets (user_id, pool, bonus_balance) values ($1, 'ia', -5)`, [u])).rejects.toThrow(/check constraint/);
      await expect(d.sql(`insert into public.credit_daily (user_id, pool, day, used) values ($1, 'match', '2026-01-01', -1)`, [u])).rejects.toThrow(/check constraint/);
      expect(await carteira(u)).toEqual({ bonus_balance: 1, purchased_balance: 0 });
    });

    it("moeda (pool) ou balde (bucket) desconhecidos são recusados em todas as tabelas", async () => {
      const u = await conta("pro");
      const room = await makeRoom(d.db, { members: [u, await conta("pro")], phase: "closed", station: null });
      await expect(d.sql(`insert into public.credit_wallets (user_id, pool) values ($1, 'xx')`, [u])).rejects.toThrow(/check constraint/);
      await expect(d.sql(`insert into public.credit_daily (user_id, pool, day) values ($1, 'xx', '2026-01-01')`, [u])).rejects.toThrow(/check constraint/);
      await expect(
        d.sql(`insert into public.credit_ledger (user_id, pool, day, kind, bucket, amount, idem_key) values ($1, 'xx', '2026-01-01', 'grant', 'bonus', 1, $2)`, [u, chave()])
      ).rejects.toThrow(/check constraint/);
      await expect(
        d.sql(`insert into public.credit_ledger (user_id, pool, day, kind, bucket, amount, idem_key) values ($1, 'match', '2026-01-01', 'grant', 'xx', 1, $2)`, [u, chave()])
      ).rejects.toThrow(/check constraint/);
      await expect(
        d.sql(`insert into public.credit_ledger (user_id, pool, day, kind, bucket, amount, idem_key) values ($1, 'match', '2026-01-01', 'xx', 'bonus', 1, $2)`, [u, chave()])
      ).rejects.toThrow(/check constraint/);
      await expect(
        d.sql(`insert into public.study_room_charges (room_id, user_id, bucket, usage_date) values ($1, $2, 'xx', '2026-01-01')`, [room, u])
      ).rejects.toThrow(/check constraint/);
    });

    it("combinações impossíveis no livro são recusadas (valor zero, valor negativo fora do ajuste, balde diário fora de consumo/estorno)", async () => {
      const u = await conta("pro");
      const ins = (kind: string, bucket: string, amount: number, key = chave()) =>
        d.sql(`insert into public.credit_ledger (user_id, pool, day, kind, bucket, amount, idem_key) values ($1, 'match', '2026-01-01', $2, $3, $4, $5)`, [u, kind, bucket, amount, key]);
      await expect(ins("grant", "bonus", 0)).rejects.toThrow(/check constraint/);
      await expect(ins("consume", "daily", -1)).rejects.toThrow(/check constraint/);
      await expect(ins("grant", "daily", 1)).rejects.toThrow(/check constraint/);
      await expect(ins("purchase", "daily", 1)).rejects.toThrow(/check constraint/);
      await expect(ins("grant", "purchased", 1)).rejects.toThrow(/check constraint/);
      await expect(ins("purchase", "bonus", 1)).rejects.toThrow(/check constraint/);
      await expect(ins("adjust", "daily", 1)).rejects.toThrow(/check constraint/);
      await expect(ins("grant", "bonus", 1, "")).rejects.toThrow(/check constraint/);
      await expect(ins("grant", "bonus", 1, "x".repeat(201))).rejects.toThrow(/check constraint/);
      expect(await livro(u)).toEqual([]);
    });

    it("a chave de operação (idem_key) repetida é recusada no livro", async () => {
      const u = await conta("pro");
      const k = chave("repetida");
      await concede(u, 1, "bonus", k);
      await expect(
        d.sql(`insert into public.credit_ledger (user_id, pool, day, kind, bucket, amount, idem_key) values ($1, 'match', '2026-01-01', 'grant', 'bonus', 1, $2)`, [u, k])
      ).rejects.toThrow(/duplicate key|credit_ledger_idem_key_key/);
      expect((await livro(u)).length).toBe(1);
    });

    it("study_room_charges: (sala, aluno, rodada) repetido é recusado, rodada nova na mesma sala é aceita, e 'unlimited' exige ficar sem lançamento", async () => {
      const a = await conta("pro");
      const b = await conta("pro");
      const room = await makeRoom(d.db, { members: [a, b], phase: "closed", station: null });
      const ins = (uid: string, round: number | null, bucket: string, ledger: number | null = null) =>
        d.sql(
          `insert into public.study_room_charges (room_id, user_id, ${round === null ? "" : "round, "}bucket, usage_date, ledger_id) values ($1, $2, ${round === null ? "" : round + ", "}$3, '2026-10-17', $4)`,
          [room, uid, bucket, ledger]
        );
      await cota(true);
      await ins(a, 1, "unlimited");
      await expect(ins(a, 1, "unlimited")).rejects.toThrow(/duplicate key|study_room_charges_pkey/);
      await expect(ins(a, null, "unlimited")).rejects.toThrow(/duplicate key|study_room_charges_pkey/); // rodada padrão = 1
      await ins(a, 2, "unlimited"); // outra rodada da mesma sala
      await ins(b, 1, "unlimited"); // outro aluno
      await expect(ins(a, 0, "unlimited")).rejects.toThrow(/check constraint/);
      // bucket 'unlimited' sem lançamento; qualquer outro balde precisa do lançamento.
      const c = await consome(a, 1, chave());
      await expect(ins(b, 3, "unlimited", c.ledger_id)).rejects.toThrow(/check constraint/);
      await expect(ins(b, 3, "daily", null)).rejects.toThrow(/check constraint/);
      await d.sql(`delete from public.study_room_charges where room_id = $1`, [room]);
    });
  });

  // ------------------------------------------------------------------ chave de configuração
  describe("chave 'creditos' de app_settings", () => {
    it("nasce desligada e sem número: { ativa: false, match: { cobra_rodada_extra: true }, ia: {} }", () => {
      expect(valorInicial).toEqual(CHAVE_INICIAL);
    });

    it("as chaves antigas continuam aceitas e uma chave desconhecida continua recusada", async () => {
      for (const k of ["trial_days", "announcement", "simulado_ineditas_pct", "treino_dupla", "treino_dupla_chat", "creditos"]) {
        // dentro de uma transação desfeita, para não mudar o valor gravado
        await d.db.transaction(async (tx) => {
          await tx.query(`insert into public.app_settings (key, value) values ($1, '{}'::jsonb) on conflict (key) do update set value = excluded.value`, [k]);
          await tx.rollback();
        });
      }
      await expect(d.sql(`insert into public.app_settings (key, value) values ('outra', '{}'::jsonb)`)).rejects.toThrow(/app_settings_key_check/);
      expect(await d.sql(`select 1 from public.app_settings where key = 'outra'`)).toEqual([]);
    });
  });

  // ------------------------------------------------------------------ cota desligada
  describe("cota desligada", () => {
    it("credit_consume devolve charged:false, não grava nada e o limite é nulo", async () => {
      const u = await conta("pro");
      const k = chave();
      const r = await consome(u, 1, k);
      expect(r).toEqual({ charged: false, already: false, bucket: null, ledger_id: null });
      expect(await livro(u)).toEqual([]);
      expect(await usoDoDia(u)).toEqual([]);
      expect(await carteira(u)).toBeNull();
      expect(await limite(u)).toBeNull();
      expect(await limite(await conta("vencido"))).toBeNull();
      expect((await d.sql(`select public.credit_available($1::uuid, 'match', 5) as r`, [u]))[0].r).toBe(true);
      expect(await estado(u)).toEqual({ ativa: false, ilimitado: false, limite_dia: null, usados_hoje: 0, bonus: 0, comprados: 0, disponivel: null });
      await d.sql(`select public.credit_assert_available($1::uuid, 'match')`, [u]); // não levanta erro
    });

    it("sem a linha 'creditos' na tabela a cota também está desligada (falha aberta, como era antes)", async () => {
      const u = await conta("pro");
      await d.db.transaction(async (tx) => {
        await tx.query(`delete from public.app_settings where key = 'creditos'`);
        const r = await tx.query<{ r: any }>(`select public.credit_consume($1::uuid, 'match', 1, 'room', gen_random_uuid(), $2) as r`, [u, chave()]);
        expect(r.rows[0].r.charged).toBe(false);
        const a = await tx.query<{ r: boolean }>(`select public.credit_ativa() as r`);
        expect(a.rows[0].r).toBe(false);
        await tx.rollback();
      });
    });

    it("'ativa' só vale se for exatamente o booleano true (texto 'true' ou número 1 não ligam)", async () => {
      const u = await conta("pro");
      for (const ativa of ['"true"', "1", "null", '"sim"']) {
        await d.sql(`update public.app_settings set value = jsonb_build_object('ativa', '${ativa}'::jsonb, 'match', jsonb_build_object('pro', 3)) where key = 'creditos'`);
        expect((await d.sql(`select public.credit_ativa() as r`))[0].r, ativa).toBe(false);
      }
      expect(await livro(u)).toEqual([]);
    });
  });

  // ------------------------------------------------------------------ cota ligada
  describe("cota ligada: limites por plano e ordem do débito", () => {
    it("plano sem número na configuração = limite ZERO: credit_consume recusa com 'sem_credito' (54000, INSUFFICIENT_CREDITS)", async () => {
      await cota(true, { match: { pro: undefined } }); // JSON.stringify descarta o campo: pro fica sem número
      const u = await conta("pro");
      expect(await limite(u)).toBe(0);
      expect(await estado(u)).toMatchObject({ ativa: true, ilimitado: false, limite_dia: 0, usados_hoje: 0, disponivel: 0 });
      await semCredito(consome(u, 1, chave()));
      expect(await livro(u)).toEqual([]);
      expect(await usoDoDia(u)).toEqual([]);
      expect((await d.sql(`select public.credit_available($1::uuid, 'match') as r`, [u]))[0].r).toBe(false);
      await expect(d.sql(`select public.credit_assert_available($1::uuid, 'match')`, [u])).rejects.toMatchObject({ message: "sem_credito", code: "54000", hint: "INSUFFICIENT_CREDITS" });
    });

    it("sem plano vivo (teste vencido) o limite é zero, e a moeda 'ia' sem número também", async () => {
      await cota(true);
      const v = await conta("vencido");
      expect(await limite(v)).toBe(0);
      await semCredito(consome(v, 1, chave()));
      const p = await conta("pro");
      expect(await limite(p, "ia")).toBe(0);
      await semCredito(consome(p, 1, chave(), { pool: "ia" }));
    });

    it("números fora do aceitável (negativo, acima de 100000, texto) valem zero; objeto com 'dia' vale o número; decimal é cortado", async () => {
      const casos: [unknown, number][] = [[-1, 0], [100001, 0], ["3", 0], [null, 0], [{ dia: 4 }, 4], [{ dia: "4" }, 0], [{ semana: 9 }, 0], [2.9, 2], [0, 0], [100000, 100000]];
      const u = await conta("pro");
      for (const [valor, esperado] of casos) {
        await cota(true, { ia: { pro: valor } });
        expect(await limite(u, "ia"), JSON.stringify(valor)).toBe(esperado);
      }
    });

    it("com número: gasta o diário, depois o bônus, depois os comprados, e recusa no seguinte", async () => {
      await cota(true);
      const u = await conta("pro"); // limite 3
      await concede(u, 2, "bonus");
      await concede(u, 2, "purchased");
      expect(await estado(u)).toMatchObject({ limite_dia: 3, usados_hoje: 0, bonus: 2, comprados: 2, disponivel: 7 });
      const buckets: string[] = [];
      for (let i = 0; i < 7; i++) buckets.push((await consome(u, 1, chave())).bucket);
      expect(buckets).toEqual(["daily", "daily", "daily", "bonus", "bonus", "purchased", "purchased"]);
      expect(await carteira(u)).toEqual({ bonus_balance: 0, purchased_balance: 0 });
      expect((await usoDoDia(u)).map((x) => x.used)).toEqual([3]);
      await semCredito(consome(u, 1, chave()));
      expect(await estado(u)).toMatchObject({ usados_hoje: 3, bonus: 0, comprados: 0, disponivel: 0 });
      // 7 consumos + 2 concessões no livro; a recusa não deixou nada.
      expect((await livro(u)).filter((l) => l.kind === "consume").length).toBe(7);
      expect((await livro(u)).length).toBe(9);
    });

    it("a ordem pode ser trocada por creditos.match.ordem (ex.: comprados, bônus, diário); ordem inválida volta ao padrão", async () => {
      await cota(true, { match: { ordem: ["purchased", "bonus", "daily"] } });
      const u = await conta("pro");
      await concede(u, 1, "bonus");
      await concede(u, 1, "purchased");
      const buckets: string[] = [];
      for (let i = 0; i < 4; i++) buckets.push((await consome(u, 1, chave())).bucket);
      expect(buckets).toEqual(["purchased", "bonus", "daily", "daily"]);

      for (const ordem of [["bonus", "daily"], ["daily", "daily", "bonus"], ["x", "y", "z"], "daily", ["daily", "bonus", "purchased", "daily"]]) {
        await cota(true, { match: { ordem } });
        expect((await d.sql(`select public.credit_order('match') as r`))[0].r, JSON.stringify(ordem)).toEqual(["daily", "bonus", "purchased"]);
      }
    });

    it("uma moeda não gasta a da outra (match x ia), cada uma com o seu limite", async () => {
      await cota(true, { ia: { pro: { dia: 2 } } });
      const u = await conta("pro");
      expect((await consome(u, 1, chave(), { pool: "ia" })).bucket).toBe("daily");
      expect((await consome(u, 1, chave(), { pool: "ia" })).bucket).toBe("daily");
      await semCredito(consome(u, 1, chave(), { pool: "ia" }));
      expect(await estado(u, undefined, "match")).toMatchObject({ limite_dia: 3, usados_hoje: 0, disponivel: 3 });
      expect(await estado(u, undefined, "ia")).toMatchObject({ limite_dia: 2, usados_hoje: 2, disponivel: 0 });
    });

    it("pedidos inválidos: moeda desconhecida, quantidade menor que 1, chave vazia, usuário nulo", async () => {
      await cota(true);
      const u = await conta("pro");
      await expect(consome(u, 1, chave(), { pool: "xx" })).rejects.toThrow(/Moeda inválida\./);
      await expect(consome(u, 0, chave())).rejects.toThrow(/Operação inválida\./);
      await expect(consome(u, -3, chave())).rejects.toThrow(/Operação inválida\./);
      await expect(consome(u, 1, "   ")).rejects.toThrow(/Operação inválida\./);
      await expect(d.sql(`select public.credit_consume(null, 'match', 1, 'room', null, 'k')`)).rejects.toThrow(/Moeda inválida\./);
      await expect(d.sql(`select public.credit_consume($1::uuid, 'match', null, 'room', null, 'k')`, [u])).rejects.toThrow(/Operação inválida\./);
      await expect(concede(u, 0, "bonus")).rejects.toThrow(/Operação inválida\./);
      await expect(concede(u, 100001, "bonus")).rejects.toThrow(/Operação inválida\./);
      await expect(concede(u, 1, "daily" as any)).rejects.toThrow(/Moeda inválida\./);
      await expect(concede(u, 1, "bonus", chave(), "xx")).rejects.toThrow(/Moeda inválida\./);
      expect(await livro(u)).toEqual([]);
    });
  });

  // ------------------------------------------------------------------ equipe
  describe("equipe (administrador, editor, revisor médico)", () => {
    it.each(["admin", "editor", "revisor"] as const)("%s não gasta nem é limitada: balde 'unlimited', sem lançamento", async (perfil) => {
      await cota(true, { match: { trial: 0, pro: 0, elite: 0 } });
      const u = await conta(perfil);
      expect(await limite(u)).toBeNull();
      for (let i = 0; i < 5; i++) {
        expect(await consome(u, 3, chave())).toEqual({ charged: false, already: false, bucket: "unlimited", ledger_id: null });
      }
      expect(await livro(u)).toEqual([]);
      expect(await usoDoDia(u)).toEqual([]);
      expect(await estado(u)).toEqual({ ativa: true, ilimitado: true, limite_dia: null, usados_hoje: 0, bonus: 0, comprados: 0, disponivel: null });
      expect((await d.sql(`select public.credit_available($1::uuid, 'match', 99) as r`, [u]))[0].r).toBe(true);
      await d.sql(`select public.credit_assert_available($1::uuid, 'match')`, [u]);
    });

    it("a equipe também é ilimitada na moeda 'ia'", async () => {
      await cota(true);
      const u = await conta("admin");
      expect((await consome(u, 1, chave(), { pool: "ia" })).bucket).toBe("unlimited");
      expect(await livro(u, "ia")).toEqual([]);
    });
  });

  // ------------------------------------------------------------------ idempotência
  describe("chave de operação (idempotência)", () => {
    it("repetir a mesma chave não debita de novo e devolve already:true com o mesmo ledger_id", async () => {
      await cota(true);
      const u = await conta("pro");
      const k = chave();
      const primeira = await consome(u, 1, k);
      expect(primeira).toMatchObject({ charged: true, already: false, bucket: "daily" });
      const segunda = await consome(u, 1, k);
      const terceira = await consome(u, 1, k);
      expect(segunda).toMatchObject({ charged: true, already: true, bucket: "daily", ledger_id: primeira.ledger_id });
      expect(terceira.ledger_id).toBe(primeira.ledger_id);
      expect((await livro(u)).length).toBe(1);
      expect(await usoDoDia(u)).toEqual([{ day: expect.any(String), used: 1 }]);
    });

    it("a repetição devolve o que já foi feito mesmo sem saldo no momento (não recusa por falta de crédito)", async () => {
      await cota(true, { match: { pro: 1 } });
      const u = await conta("pro");
      const k = chave();
      const primeira = await consome(u, 1, k);
      await semCredito(consome(u, 1, chave())); // acabou
      expect(await consome(u, 1, k)).toMatchObject({ already: true, ledger_id: primeira.ledger_id });
    });

    it("usar a mesma chave para OUTRO aluno é recusado, e chave de concessão não serve para consumo", async () => {
      await cota(true);
      const a = await conta("pro");
      const b = await conta("pro");
      const k = chave();
      await consome(a, 1, k);
      await expect(consome(b, 1, k)).rejects.toThrow(/Operação inválida\./);
      expect(await livro(b)).toEqual([]);
      expect(await usoDoDia(b)).toEqual([]);
      // chave de uma concessão: outro tipo de lançamento
      const kg = chave("g");
      await concede(a, 1, "bonus", kg);
      await expect(consome(a, 1, kg)).rejects.toThrow(/Operação inválida\./);
      await expect(concede(b, 1, "bonus", kg)).rejects.toThrow(/Operação inválida\./);
      await expect(concede(a, 1, "bonus", k)).rejects.toThrow(/Operação inválida\./); // chave de consumo
    });

    it("conceder duas vezes com a mesma chave só soma uma vez (already:true)", async () => {
      const u = await conta("pro");
      const k = chave("g");
      const g1 = await concede(u, 5, "bonus", k);
      const g2 = await concede(u, 5, "bonus", k);
      expect(g1).toMatchObject({ already: false, bucket: "bonus" });
      expect(g2).toEqual({ already: true, ledger_id: g1.ledger_id, bucket: "bonus" });
      expect(await carteira(u)).toEqual({ bonus_balance: 5, purchased_balance: 0 });
      expect((await livro(u)).length).toBe(1);
      const c = await concede(u, 3, "purchased", chave("c"));
      expect((await livro(u)).find((l) => l.id === c.ledger_id)).toMatchObject({ kind: "purchase", bucket: "purchased", amount: 3 });
      expect(await carteira(u)).toEqual({ bonus_balance: 5, purchased_balance: 3 });
    });
  });

  // ------------------------------------------------------------------ n > 1
  describe("consumo de mais de uma unidade", () => {
    it("n=2 com saldos repartidos gera duas linhas (chaves k e k#2)", async () => {
      await cota(true);
      const u = await conta("pro"); // limite 3
      await concede(u, 5, "bonus");
      await consome(u, 1, chave());
      await consome(u, 1, chave()); // sobra 1 diário
      const k = chave();
      const r = await consome(u, 2, k);
      expect(r).toMatchObject({ charged: true, already: false, bucket: "daily" });
      expect(r.buckets).toEqual([
        { bucket: "daily", n: 1, ledger_id: r.ledger_id },
        { bucket: "bonus", n: 1, ledger_id: expect.any(Number) },
      ]);
      const linhas = (await livro(u)).filter((l) => l.idem_key.startsWith(k));
      expect(linhas.map((l) => [l.idem_key, l.bucket, l.amount])).toEqual([[k, "daily", 1], [`${k}#2`, "bonus", 1]]);
      expect(await carteira(u)).toEqual({ bonus_balance: 4, purchased_balance: 0 });
      expect((await usoDoDia(u))[0].used).toBe(3);
      // repetir a chave devolve o primeiro lançamento e não debita de novo
      expect(await consome(u, 2, k)).toMatchObject({ already: true, ledger_id: r.ledger_id });
      expect((await livro(u)).filter((l) => l.kind === "consume").length).toBe(4);
    });

    it("n=3 espalhado pelos 3 baldes gera k, k#2 e k#3; sem saldo para todos, nada é gravado", async () => {
      await cota(true, { match: { pro: 1 } });
      const u = await conta("pro");
      await concede(u, 1, "bonus");
      await concede(u, 1, "purchased");
      const k = chave();
      await semCredito(consome(u, 4, k));
      expect((await livro(u)).filter((l) => l.kind === "consume")).toEqual([]);
      expect(await carteira(u)).toEqual({ bonus_balance: 1, purchased_balance: 1 });
      const r = await consome(u, 3, k);
      expect(r.buckets.map((b: any) => [b.bucket, b.n])).toEqual([["daily", 1], ["bonus", 1], ["purchased", 1]]);
      expect((await livro(u)).filter((l) => l.kind === "consume").map((l) => l.idem_key)).toEqual([k, `${k}#2`, `${k}#3`]);
      expect(await carteira(u)).toEqual({ bonus_balance: 0, purchased_balance: 0 });
    });

    it("n=2 de uma vez num único balde gera uma linha só, com amount 2", async () => {
      await cota(true);
      const u = await conta("pro");
      const k = chave();
      const r = await consome(u, 2, k);
      expect(r.buckets).toHaveLength(1);
      expect((await livro(u)).filter((l) => l.kind === "consume").map((l) => [l.idem_key, l.amount])).toEqual([[k, 2]]);
      expect((await usoDoDia(u))[0].used).toBe(2);
    });
  });

  // ------------------------------------------------------------------ par
  describe("credit_consume_pair: os dois, ou nenhum", () => {
    const par = async (a: string, b: string, prefixo: string, ref = randomUUID(), pool = "match"): Promise<any> =>
      (await d.sql(`select public.credit_consume_pair($1, $2::uuid, $3::uuid, 'room', $4::uuid, $5) as r`, [pool, a, b, ref, prefixo]))[0].r;

    it.each([
      ["quem não tem saldo é o de UUID menor", true],
      ["quem não tem saldo é o de UUID maior", false],
    ])("se um dos dois não tem saldo NENHUM é cobrado e nada é gravado (%s)", async (_titulo, semSaldoEhMenor) => {
      await cota(true);
      const x = await conta("pro");
      const y = await conta("pro");
      const [menor, maior] = x < y ? [x, y] : [y, x];
      const semSaldo = semSaldoEhMenor ? menor : maior;
      const comSaldo = semSaldoEhMenor ? maior : menor;
      await d.sql(`update public.subscriptions set status = 'expired', plan = 'trial', trial_ends_at = now() - interval '1 day', current_period_end = null where user_id = $1`, [semSaldo]);
      const p = chave("par");
      // nos dois sentidos de chamada
      await semCredito(par(comSaldo, semSaldo, p));
      await semCredito(par(semSaldo, comSaldo, p));
      for (const u of [x, y]) {
        expect(await livro(u), "livro").toEqual([]);
        expect(await usoDoDia(u), "credit_daily").toEqual([]);
        expect(await carteira(u), "carteira").toBeNull();
      }
      // depois de dar crédito ao outro (bônus), o par passa
      await concede(semSaldo, 1, "bonus");
      const r = await par(comSaldo, semSaldo, p);
      expect(Object.keys(r).sort()).toEqual([menor, maior].sort());
      expect((await livro(semSaldo)).filter((l) => l.kind === "consume")[0].bucket).toBe("bonus");
    });

    it("grava dois lançamentos, um por aluno, com a mesma referência e chaves prefixo:<uuid>", async () => {
      await cota(true);
      const a = await conta("pro");
      const b = await conta("trial");
      const ref = randomUUID();
      const p = chave("sala");
      const r = await par(a, b, p, ref);
      expect(Object.keys(r).sort()).toEqual([a, b].sort());
      for (const u of [a, b]) {
        expect(r[u]).toMatchObject({ charged: true, already: false, bucket: "daily" });
        const l = (await livro(u)).filter((x) => x.kind === "consume");
        expect(l).toHaveLength(1);
        expect(l[0]).toMatchObject({ idem_key: `${p}:${u}`, amount: 1, ref_type: "room", ref_id: ref, bucket: "daily" });
        expect(l[0].id).toBe(r[u].ledger_id);
        expect((await usoDoDia(u))[0].used).toBe(1);
      }
    });

    it("repetir o par não debita de novo, nem mesmo depois de acabar o saldo; par cruzado (A,B) e (B,A) dá o mesmo resultado", async () => {
      await cota(true, { match: { pro: 1 } });
      const a = await conta("pro");
      const b = await conta("pro");
      const p = chave("par");
      const r1 = await par(a, b, p);
      expect(r1[a]).toMatchObject({ charged: true, already: false });
      expect(r1[b]).toMatchObject({ charged: true, already: false });
      // saldo dos dois acabou (limite 1): a repetição ainda devolve o que foi feito
      const r2 = await par(a, b, p);
      const r3 = await par(b, a, p);
      for (const r of [r2, r3]) {
        expect(Object.keys(r).sort()).toEqual([a, b].sort());
        expect(r[a]).toMatchObject({ charged: true, already: true, ledger_id: r1[a].ledger_id });
        expect(r[b]).toMatchObject({ charged: true, already: true, ledger_id: r1[b].ledger_id });
      }
      expect(r2).toEqual(r3);
      expect((await livro(a)).length).toBe(1);
      expect((await livro(b)).length).toBe(1);
      expect((await usoDoDia(a))[0].used).toBe(1);
      // e um par NOVO com os mesmos alunos, agora sem saldo, é recusado nos dois sentidos
      await semCredito(par(a, b, chave("outro")));
      await semCredito(par(b, a, chave("outro")));
    });

    it("par cruzado: a mesma situação de falta de saldo dá o mesmo resultado nos dois sentidos", async () => {
      await cota(true);
      const a = await conta("pro");
      const b = await conta("vencido");
      const p = chave("par");
      await semCredito(par(a, b, p));
      await semCredito(par(b, a, p));
      expect(await livro(a)).toEqual([]);
    });

    it("equipe no par: só o aluno é cobrado; cota desligada: ninguém; pedido inválido é recusado", async () => {
      await cota(true);
      const aluno = await conta("pro");
      const staff = await conta("admin");
      const r = await par(aluno, staff, chave("par"));
      expect(r[aluno]).toMatchObject({ charged: true, bucket: "daily" });
      expect(r[staff]).toEqual({ charged: false, already: false, bucket: "unlimited", ledger_id: null });
      expect(await livro(staff)).toEqual([]);

      await cota(false);
      const x = await conta("pro");
      const y = await conta("pro");
      const off = await par(x, y, chave("par"));
      expect(off[x]).toMatchObject({ charged: false });
      expect(off[y]).toMatchObject({ charged: false });
      expect(await livro(x)).toEqual([]);

      await expect(par(x, x, chave())).rejects.toThrow(/Operação inválida\./);
      await expect(par(x, y, "  ")).rejects.toThrow(/Operação inválida\./);
      await expect(par(x, y, chave(), randomUUID(), "xx")).rejects.toThrow(/Operação inválida\./);
      await expect(d.sql(`select public.credit_consume_pair('match', null, $1::uuid, 'room', null, 'k')`, [x])).rejects.toThrow(/Operação inválida\./);
    });

    it("o texto da função trava os dois em ordem crescente de UUID (least/greatest) e confere os dois antes de gravar", async () => {
      const [{ def }] = await d.sql<{ def: string }>(`select pg_get_functiondef('public.credit_consume_pair(text,uuid,uuid,text,uuid,text,timestamptz)'::regprocedure) as def`);
      expect(def).toContain("least(");
      expect(def).toContain("greatest(");
      expect(def).toMatch(/pg_advisory_xact_lock\([^;]*v_lo[^;]*;\s*perform pg_advisory_xact_lock\([^;]*v_hi/);
      // a conferência dos dois vem antes do primeiro credit_consume
      expect(def.indexOf("credit_available(v_lo")).toBeGreaterThan(-1);
      expect(def.indexOf("credit_available(v_hi")).toBeLessThan(def.indexOf("credit_consume(v_lo"));
    });
  });

  // ------------------------------------------------------------------ virada do dia
  describe("virada do dia (São Paulo)", () => {
    it("credit_day: 02:59:59Z ainda é o dia anterior, 03:00:00Z já é o dia novo", async () => {
      const dia = async (iso: string) => (await d.sql(`select public.credit_day($1::timestamptz)::text as r`, [iso]))[0].r;
      expect(await dia("2026-10-17T02:59:59Z")).toBe("2026-10-16");
      expect(await dia("2026-10-17T03:00:00Z")).toBe("2026-10-17");
      expect(await dia("2026-10-17T03:00:01Z")).toBe("2026-10-17");
      expect(await dia("2026-10-17T23:59:59Z")).toBe("2026-10-17");
      expect(await dia("2026-10-18T02:59:59Z")).toBe("2026-10-17");
    });

    it("23:59:59 e 00:00:01 de São Paulo caem em dias diferentes; bônus e comprados são preservados; o dia novo tem cota nova", async () => {
      await cota(true);
      const u = await conta("pro"); // limite 3
      await concede(u, 2, "bonus");
      await concede(u, 1, "purchased");
      for (let i = 0; i < 3; i++) expect((await consome(u, 1, chave(), { now: FIM_DO_DIA_16 })).bucket).toBe("daily");
      expect(await estado(u, FIM_DO_DIA_16)).toMatchObject({ limite_dia: 3, usados_hoje: 3, bonus: 2, comprados: 1, disponivel: 3 });

      // minutos depois, já no dia seguinte
      expect(await estado(u, COMECO_DO_DIA_17)).toMatchObject({ limite_dia: 3, usados_hoje: 0, bonus: 2, comprados: 1, disponivel: 6 });
      const novo = await consome(u, 1, chave(), { now: COMECO_DO_DIA_17 });
      expect(novo).toMatchObject({ bucket: "daily", day: "2026-10-17" });
      expect(await usoDoDia(u)).toEqual([{ day: "2026-10-16", used: 3 }, { day: "2026-10-17", used: 1 }]);
      expect(await carteira(u)).toEqual({ bonus_balance: 2, purchased_balance: 1 });
      const dias = (await livro(u)).filter((l) => l.kind === "consume").map((l) => l.day);
      expect(dias).toEqual(["2026-10-16", "2026-10-16", "2026-10-16", "2026-10-17"]);
      // no fim do dia 16 os 3 usados já esgotaram o diário: o 4º vai para o bônus, ainda no dia 16
      const extra = await consome(u, 1, chave(), { now: FIM_DO_DIA_16 });
      expect(extra).toMatchObject({ bucket: "bonus", day: "2026-10-16" });
    });

    it("a data em UTC não vale: 21:00 de São Paulo (00:00Z do dia seguinte) ainda é o dia de São Paulo", async () => {
      await cota(true);
      const u = await conta("pro");
      const r = await consome(u, 1, chave(), { now: "2026-10-18T00:00:00Z" });
      expect(r.day).toBe("2026-10-17");
    });
  });

  // ------------------------------------------------------------------ upgrade e downgrade
  describe("troca de plano no meio do dia", () => {
    it("o upgrade vale na hora: sobe o limite descontando o que já foi usado", async () => {
      await cota(true); // trial 2, pro 3, elite 5
      const u = await conta("trial");
      await consome(u, 1, chave());
      await consome(u, 1, chave());
      expect(await estado(u)).toMatchObject({ limite_dia: 2, usados_hoje: 2, disponivel: 0 });
      await semCredito(consome(u, 1, chave()));
      await setPlan(d.db, u, "pro", "active");
      expect(await estado(u)).toMatchObject({ limite_dia: 3, usados_hoje: 2, disponivel: 1 });
      expect((await consome(u, 1, chave())).bucket).toBe("daily");
      await semCredito(consome(u, 1, chave()));
      await setPlan(d.db, u, "elite", "active");
      expect(await estado(u)).toMatchObject({ limite_dia: 5, usados_hoje: 3, disponivel: 2 });
      expect((await usoDoDia(u))[0].used).toBe(3);
    });

    it("o downgrade abaixo do usado deixa disponível ZERO (nunca negativo) e o bônus segue disponível", async () => {
      await cota(true);
      const u = await conta("elite");
      for (let i = 0; i < 4; i++) await consome(u, 1, chave());
      expect(await estado(u)).toMatchObject({ limite_dia: 5, usados_hoje: 4, disponivel: 1 });
      await setPlan(d.db, u, "trial", "trialing", daqui(3)); // limite 2, usados 4
      const e = await estado(u);
      expect(e).toMatchObject({ limite_dia: 2, usados_hoje: 4, bonus: 0, comprados: 0, disponivel: 0 });
      expect(e.disponivel).toBe(0);
      await semCredito(consome(u, 1, chave()));
      expect((await d.sql(`select public.credit_avail($1::uuid, 'match') -> 'daily' as r`, [u]))[0].r).toBe(0);
      await concede(u, 2, "bonus");
      expect(await estado(u)).toMatchObject({ disponivel: 2 });
      expect((await consome(u, 1, chave())).bucket).toBe("bonus");
    });

    it("plano pago vencido ou cancelado perde o plano vivo (limite zero); teste com prazo vencido também", async () => {
      await cota(true);
      const u = await conta("pro");
      expect(await limite(u)).toBe(3);
      await d.sql(`update public.subscriptions set current_period_end = now() - interval '10 days' where user_id = $1`, [u]);
      expect(await limite(u)).toBe(0);
      await d.sql(`update public.subscriptions set status = 'canceled' where user_id = $1`, [u]);
      expect(await limite(u)).toBe(0);
      const t = await conta("trial");
      expect(await limite(t)).toBe(2);
      await d.sql(`update public.subscriptions set trial_ends_at = now() - interval '1 second' where user_id = $1`, [t]);
      expect(await limite(t)).toBe(0);
    });
  });

  // ------------------------------------------------------------------ estorno
  describe("credit_refund", () => {
    it("volta ao MESMO balde, uma vez só: a segunda chamada devolve already:true", async () => {
      await cota(true);
      const u = await conta("pro");
      const c = await consome(u, 1, chave());
      expect((await usoDoDia(u))[0].used).toBe(1);
      const e1 = await estorna(c.ledger_id);
      expect(e1).toMatchObject({ already: false, bucket: "daily", same_day: true });
      expect((await usoDoDia(u))[0].used).toBe(0);
      const e2 = await estorna(c.ledger_id);
      expect(e2).toMatchObject({ already: true, ledger_id: e1.ledger_id, bucket: "daily" });
      expect((await usoDoDia(u))[0].used).toBe(0);
      const l = await livro(u);
      expect(l.map((x) => [x.kind, x.bucket, x.amount, x.idem_key])).toEqual([
        ["consume", "daily", 1, expect.any(String)],
        ["refund", "daily", 1, `refund:${c.ledger_id}`],
      ]);
      expect(l[1].reverses_id).toBe(c.ledger_id);
      expect(l[1].id).toBe(e1.ledger_id);
      expect(await estado(u)).toMatchObject({ usados_hoje: 0, disponivel: 3 });
    });

    it("bônus e comprados voltam ao saldo do balde de onde saíram", async () => {
      await cota(true, { match: { pro: 0 } });
      const u = await conta("pro");
      await concede(u, 1, "bonus");
      await concede(u, 2, "purchased");
      const k = chave();
      const c = await consome(u, 2, k); // bônus 1 + comprados 1
      expect(c.buckets.map((b: any) => b.bucket)).toEqual(["bonus", "purchased"]);
      expect(await carteira(u)).toEqual({ bonus_balance: 0, purchased_balance: 1 });
      // estorna só a parte dos comprados
      expect((await estorna(c.buckets[1].ledger_id)).bucket).toBe("purchased");
      expect(await carteira(u)).toEqual({ bonus_balance: 0, purchased_balance: 2 });
      expect((await estorna(c.buckets[0].ledger_id)).bucket).toBe("bonus");
      expect(await carteira(u)).toEqual({ bonus_balance: 1, purchased_balance: 2 });
      expect((await estorna(c.buckets[0].ledger_id)).already).toBe(true);
      expect(await carteira(u)).toEqual({ bonus_balance: 1, purchased_balance: 2 });
      expect(await usoDoDia(u)).toEqual([]);
    });

    it("estorno de diário de DIA PASSADO reduz o uso do dia original, não o de hoje, e não cria cota nova hoje", async () => {
      await cota(true);
      const u = await conta("pro"); // limite 3
      const ontem = "2026-10-16T15:00:00Z";
      const hoje = "2026-10-17T15:00:00Z";
      const c16 = await consome(u, 1, chave(), { now: ontem });
      const c17 = await consome(u, 1, chave(), { now: hoje });
      expect(await usoDoDia(u)).toEqual([{ day: "2026-10-16", used: 1 }, { day: "2026-10-17", used: 1 }]);

      const e = await estorna(c16.ledger_id, hoje);
      expect(e).toMatchObject({ already: false, bucket: "daily", day: "2026-10-16", same_day: false });
      expect(await usoDoDia(u)).toEqual([{ day: "2026-10-16", used: 0 }, { day: "2026-10-17", used: 1 }]);
      expect(await estado(u, hoje)).toMatchObject({ usados_hoje: 1, disponivel: 2 }); // não virou 3
      const linha = (await livro(u)).find((l) => l.id === e.ledger_id);
      expect(linha).toMatchObject({ kind: "refund", day: "2026-10-16", reverses_id: c16.ledger_id });
      // o consumo de hoje continua estornável e reduz o uso de hoje
      expect((await estorna(c17.ledger_id, hoje)).same_day).toBe(true);
      expect(await usoDoDia(u)).toEqual([{ day: "2026-10-16", used: 0 }, { day: "2026-10-17", used: 0 }]);
    });

    it("estornar no dia seguinte um consumo de ontem sem uso hoje não dá cota além do limite (nem cria linha do dia novo)", async () => {
      await cota(true);
      const u = await conta("pro");
      const c = await consome(u, 1, chave(), { now: "2026-10-16T15:00:00Z" });
      const hoje = "2026-10-17T15:00:00Z";
      expect(await estado(u, hoje)).toMatchObject({ usados_hoje: 0, disponivel: 3 });
      await estorna(c.ledger_id, hoje);
      expect(await estado(u, hoje)).toMatchObject({ usados_hoje: 0, disponivel: 3, limite_dia: 3 });
      expect((await usoDoDia(u)).map((x) => x.day)).toEqual(["2026-10-16"]);
    });

    it("só consumo pode ser estornado: concessão, estorno e lançamento inexistente são recusados", async () => {
      await cota(true);
      const u = await conta("pro");
      const g = await concede(u, 1, "bonus");
      await expect(estorna(g.ledger_id)).rejects.toThrow(/Só um consumo pode ser estornado\./);
      const c = await consome(u, 1, chave());
      const e = await estorna(c.ledger_id);
      await expect(estorna(e.ledger_id)).rejects.toThrow(/Só um consumo pode ser estornado\./);
      await expect(estorna(999_999_999)).rejects.toThrow(/Lançamento não encontrado\./);
      expect(await carteira(u)).toEqual({ bonus_balance: 1, purchased_balance: 0 });
    });

    it("estornar o consumo que usou o último crédito devolve o crédito para gastar de novo", async () => {
      await cota(true, { match: { pro: 1 } });
      const u = await conta("pro");
      const c = await consome(u, 1, chave());
      await semCredito(consome(u, 1, chave()));
      await estorna(c.ledger_id);
      expect((await consome(u, 1, chave())).bucket).toBe("daily");
      await semCredito(consome(u, 1, chave()));
    });
  });

  // ------------------------------------------------------------------ nunca negativo
  describe("o saldo nunca fica negativo", () => {
    it("20 chamadas seguidas no último crédito: exatamente 3 lançamentos com limite 3", async () => {
      await cota(true);
      const u = await conta("pro");
      let ok = 0;
      let recusadas = 0;
      for (let i = 0; i < 20; i++) {
        try {
          await consome(u, 1, chave());
          ok++;
        } catch (e: any) {
          expect(e.message).toBe("sem_credito");
          recusadas++;
        }
      }
      expect([ok, recusadas]).toEqual([3, 17]);
      expect((await livro(u)).filter((l) => l.kind === "consume")).toHaveLength(3);
      expect((await usoDoDia(u))[0].used).toBe(3);
    });

    it("20 chamadas ao mesmo tempo (Promise.all): exatamente 3 lançamentos, e nenhum saldo abaixo de zero", async () => {
      await cota(true);
      const u = await conta("pro");
      const r = await Promise.allSettled(Array.from({ length: 20 }, () => consome(u, 1, chave())));
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(3);
      const rec = r.filter((x): x is PromiseRejectedResult => x.status === "rejected");
      expect(rec).toHaveLength(17);
      expect(rec.every((x) => x.reason.message === "sem_credito")).toBe(true);
      expect((await livro(u)).filter((l) => l.kind === "consume")).toHaveLength(3);
      expect((await usoDoDia(u))[0].used).toBe(3);
    });

    it("com bônus e comprados também: 20 chamadas ao mesmo tempo gastam exatamente o saldo (limite 1 + 2 bônus + 1 comprado = 4)", async () => {
      await cota(true, { match: { pro: 1 } });
      const u = await conta("pro");
      await concede(u, 2, "bonus");
      await concede(u, 1, "purchased");
      const r = await Promise.allSettled(Array.from({ length: 20 }, () => consome(u, 1, chave())));
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(4);
      expect(await carteira(u)).toEqual({ bonus_balance: 0, purchased_balance: 0 });
      expect((await usoDoDia(u))[0].used).toBe(1);
    });

    it("a mesma chave pedida 10 vezes ao mesmo tempo debita uma vez só", async () => {
      await cota(true);
      const u = await conta("pro");
      const k = chave();
      const r = await Promise.all(Array.from({ length: 10 }, () => consome(u, 1, k)));
      expect(r.filter((x) => !x.already)).toHaveLength(1);
      expect(new Set(r.map((x) => x.ledger_id)).size).toBe(1);
      expect((await usoDoDia(u))[0].used).toBe(1);
    });

    it("dois pares simultâneos disputando o último crédito de um aluno: só um par passa, e o outro não cobra ninguém", async () => {
      await cota(true, { match: { pro: 1 } });
      const a = await conta("pro");
      const b = await conta("pro");
      const c = await conta("pro");
      const par = (x: string, y: string, p: string) => d.sql(`select public.credit_consume_pair('match', $1::uuid, $2::uuid, 'room', gen_random_uuid(), $3) as r`, [x, y, p]);
      const r = await Promise.allSettled([par(a, b, chave("p1")), par(c, b, chave("p2")), par(b, a, chave("p3"))]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      // b só tinha 1 crédito: foi cobrado uma vez; e quem entrou no par que falhou não foi cobrado
      expect((await livro(b)).filter((l) => l.kind === "consume")).toHaveLength(1);
      const cobrados = [a, c].map(async (u) => (await livro(u)).filter((l) => l.kind === "consume").length);
      expect((await Promise.all(cobrados)).reduce((s, n) => s + n, 0)).toBe(1);
    });
  });

  // ------------------------------------------------------------------ conciliação
  describe("credit_reconcile", () => {
    it("moeda inválida é recusada", async () => {
      await expect(conciliar("xx")).rejects.toThrow(/Moeda inválida\./);
    });

    it("depois de consumos, estornos e concessões: ok:true e total 0 (moeda 'ia', usada só por este teste)", async () => {
      await cota(true, { ia: { pro: 3, trial: { dia: 2 } } });
      const a = await conta("pro");
      const b = await conta("trial");
      const ia = (uid: string, n: number, k = chave()) => consome(uid, n, k, { pool: "ia" });

      const c1 = await ia(a, 2);
      await concede(a, 3, "bonus", chave("g"), "ia");
      await concede(a, 2, "purchased", chave("c"), "ia");
      const c2 = await ia(a, 3); // 1 diário + 2 bônus
      const c3 = await ia(a, 3); // 1 bônus + 2 comprados
      await estorna(c1.ledger_id);
      await estorna(c2.buckets[1].ledger_id); // parte do bônus
      await ia(b, 1);
      await concede(b, 4, "purchased", chave("c"), "ia");
      const c4 = await ia(b, 4); // 1 diário + 3 comprados
      await estorna(c4.buckets[1].ledger_id);
      await estorna(c3.ledger_id);
      await semCredito(ia(b, 9)); // recusa não deixa rastro

      const r = await conciliar("ia");
      expect(r).toEqual({ pool: "ia", ok: true, total: 0, problemas: [] });
    });

    it("adulterar o uso do dia à mão é detectado (uso_do_dia), e consertar a linha devolve ok:true", async () => {
      await cota(true, { ia: { pro: 3 } });
      const u = await conta("pro");
      await consome(u, 2, chave(), { pool: "ia" });
      expect((await conciliar("ia")).ok).toBe(true);

      await d.sql(`update public.credit_daily set used = used + 1 where user_id = $1 and pool = 'ia'`, [u]);
      const r = await conciliar("ia");
      expect(r.ok).toBe(false);
      expect(r.total).toBe(1);
      expect(r.problemas[0]).toMatchObject({ tipo: "uso_do_dia", user_id: u, no_resumo: 3, no_livro: 2 });

      await d.sql(`update public.credit_daily set used = used - 1 where user_id = $1 and pool = 'ia'`, [u]);
      expect(await conciliar("ia")).toMatchObject({ ok: true, total: 0 });
    });

    it("adulterar o saldo de bônus ou de comprados à mão é detectado (saldo_bonus, saldo_comprados), e consertar devolve ok:true", async () => {
      await cota(true, { ia: { pro: 3 } });
      const u = await conta("pro");
      await concede(u, 2, "bonus", chave("g"), "ia");
      await concede(u, 2, "purchased", chave("c"), "ia");
      expect((await conciliar("ia")).ok).toBe(true);

      await d.sql(`update public.credit_wallets set bonus_balance = bonus_balance + 1 where user_id = $1 and pool = 'ia'`, [u]);
      let r = await conciliar("ia");
      expect(r.ok).toBe(false);
      expect(r.problemas).toEqual([{ tipo: "saldo_bonus", user_id: u, no_resumo: 3, no_livro: 2 }]);
      await d.sql(`update public.credit_wallets set bonus_balance = bonus_balance - 1 where user_id = $1 and pool = 'ia'`, [u]);

      await d.sql(`update public.credit_wallets set purchased_balance = purchased_balance + 5 where user_id = $1 and pool = 'ia'`, [u]);
      r = await conciliar("ia");
      expect(r.problemas).toEqual([{ tipo: "saldo_comprados", user_id: u, no_resumo: 7, no_livro: 2 }]);
      await d.sql(`update public.credit_wallets set purchased_balance = purchased_balance - 5 where user_id = $1 and pool = 'ia'`, [u]);

      // carteira apagada à mão: o livro ainda mostra a concessão
      const guardada = (await d.sql(`select bonus_balance, purchased_balance from public.credit_wallets where user_id = $1 and pool = 'ia'`, [u]))[0];
      await d.sql(`delete from public.credit_wallets where user_id = $1 and pool = 'ia'`, [u]);
      r = await conciliar("ia");
      expect(r.problemas.map((p: any) => p.tipo).sort()).toEqual(["saldo_bonus", "saldo_comprados"]);
      await d.sql(`insert into public.credit_wallets (user_id, pool, bonus_balance, purchased_balance) values ($1, 'ia', $2, $3)`, [u, guardada.bonus_balance, guardada.purchased_balance]);
      expect(await conciliar("ia")).toMatchObject({ ok: true, total: 0 });
    });

    it("uso do dia sem nenhum lançamento no livro (linha inventada) também é detectado", async () => {
      await cota(true, { ia: { pro: 3 } });
      const u = await conta("pro");
      await d.sql(`insert into public.credit_daily (user_id, pool, day, used) values ($1, 'ia', '2026-01-02', 4)`, [u]);
      const r = await conciliar("ia");
      expect(r.problemas).toEqual([{ tipo: "uso_do_dia", user_id: u, day: "2026-01-02", no_resumo: 4, no_livro: 0 }]);
      await d.sql(`delete from public.credit_daily where user_id = $1 and pool = 'ia'`, [u]);
      expect((await conciliar("ia")).ok).toBe(true);
    });

    it("cobranca_sem_lancamento: cobrança da sala apontando para o lançamento de outro aluno é detectada; a correta não", async () => {
      await cota(true);
      const a = await conta("pro");
      const b = await conta("pro");
      const room = await makeRoom(d.db, { members: [a, b], phase: "closed", station: null });
      const ca = await consome(a, 1, chave(), { ref: room });
      const cb = await consome(b, 1, chave(), { ref: room });
      const cobrar = (uid: string, ledger: number) =>
        d.sql(`insert into public.study_room_charges (room_id, user_id, round, bucket, usage_date, ledger_id) values ($1, $2, 1, 'daily', current_date, $3)`, [room, uid, ledger]);
      await cobrar(a, ca.ledger_id);
      await cobrar(b, cb.ledger_id);
      const doQuarto = (r: any) => r.problemas.filter((p: any) => p.room_id === room);
      expect(doQuarto(await conciliar("match"))).toEqual([]);

      await d.sql(`update public.study_room_charges set ledger_id = $1 where room_id = $2 and user_id = $3`, [ca.ledger_id, room, b]);
      const r = await conciliar("match");
      expect(doQuarto(r)).toEqual([{ tipo: "cobranca_sem_lancamento", room_id: room, user_id: b, round: 1 }]);
      expect(r.ok).toBe(false);
      await d.sql(`delete from public.study_room_charges where room_id = $1`, [room]);
      expect(doQuarto(await conciliar("match"))).toEqual([]);
    });
  });

  // ------------------------------------------------------------------ permissões
  describe("permissões das funções credit_*", () => {
    const NOMES = [
      "credit_day", "credit_cfg", "credit_ativa", "credit_plan", "credit_limit", "credit_order", "credit_avail", "credit_state",
      "credit_available", "credit_assert_available", "credit_consume", "credit_consume_pair", "credit_refund", "credit_grant",
      "credit_reconcile", "credit_ledger_guard", "credit_refund_ref", "credit_cobra_rodada",
    ];

    it("o aluno (authenticated) e o visitante NÃO executam nenhuma credit_*", async () => {
      const fns = await d.sql<{ proname: string; assinatura: string; auth: boolean; anon: boolean }>(
        `select proname, p.oid::regprocedure::text as assinatura,
                has_function_privilege('authenticated', p.oid, 'execute') as auth,
                has_function_privilege('anon', p.oid, 'execute') as anon
           from pg_proc p where pronamespace = 'public'::regnamespace and proname like 'credit\\_%' order by 1`
      );
      expect(fns.map((f) => f.proname).sort()).toEqual([...NOMES].sort());
      for (const f of fns) {
        expect(f.auth, `${f.assinatura} authenticated`).toBe(false);
        expect(f.anon, `${f.assinatura} anon`).toBe(false);
      }
    });

    it("chamar pelo papel do aluno é recusado de verdade (permission denied)", async () => {
      await expect(d.rpc(U.ana, "credit_consume", { p_uid: U.ana, p_pool: "match", p_n: 1, p_ref_type: "room", p_ref_id: randomUUID(), p_idem: chave() })).rejects.toThrow(/permission denied/);
      await expect(d.rpc(U.ana, "credit_grant", { p_uid: U.ana, p_pool: "match", p_n: 50, p_reason: "x", p_idem: chave() })).rejects.toThrow(/permission denied/);
      await expect(d.rpc(U.ana, "credit_reconcile", { p_pool: "match" })).rejects.toThrow(/permission denied/);
      await expect(d.rpc(null, "credit_state", { p_uid: U.ana, p_pool: "match" })).rejects.toThrow(/permission denied/);
      expect(await carteira(U.ana)).toBeNull();
    });

    it("todas são security definer com o caminho de busca (search_path) vazio", async () => {
      const soltas = await d.sql<{ proname: string }>(
        `select proname from pg_proc where pronamespace = 'public'::regnamespace and proname like 'credit\\_%'
            and (not prosecdef or proconfig is null or not ('search_path=""' = any (proconfig)))`
      );
      expect(soltas).toEqual([]);
    });

    it("as que gravam não são 'stable' nem 'immutable'", async () => {
      const r = await d.sql<{ proname: string }>(
        `select proname from pg_proc where pronamespace = 'public'::regnamespace
            and proname in ('credit_consume', 'credit_consume_pair', 'credit_refund', 'credit_grant') and provolatile <> 'v'`
      );
      expect(r).toEqual([]);
    });
  });

  // ------------------------------------------------------------------ conciliação geral e colagem dupla
  describe("fechamento", () => {
    it("depois de todos os testes acima, a conciliação do match também está em ordem (nada foi gravado por fora das funções)", async () => {
      const r = await conciliar("match");
      expect(r.problemas).toEqual([]);
      expect(r).toMatchObject({ ok: true, total: 0 });
      expect(await conciliar("ia")).toMatchObject({ ok: true, total: 0 });
    });

    it("colar as duas migrações de novo dá o mesmo banco (funções, permissões, índices, políticas, gatilhos, colunas)", async () => {
      const TABELAS = ["credit_wallets", "credit_daily", "credit_ledger", "study_room_charges"];
      const retrato = async () => ({
        funcoes: await d.sql(
          `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl, p.provolatile
             from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1`
        ),
        indices: await d.sql(`select indexname, indexdef from pg_indexes where schemaname = 'public' order by 1`),
        politicas: await d.sql(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`),
        gatilhos: await d.sql(`select tgrelid::regclass::text as tabela, tgname, pg_get_triggerdef(oid) as def from pg_trigger where not tgisinternal order by 1, 2`),
        colunas: await d.sql(
          `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
            where table_schema = 'public' and (table_name = any($1) or (table_name = 'checklist_rooms' and column_name = 'charged_at')) order by 1, ordinal_position`,
          [TABELAS]
        ),
        regras: await d.sql(`select conrelid::regclass::text as t, conname, pg_get_constraintdef(oid) as def from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
        direitos: await d.sql(
          `select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = any($1) order by 1, 2, 3`,
          [TABELAS]
        ),
        direitosColuna: await d.sql(
          `select grantee, table_name, column_name, privilege_type from information_schema.column_privileges
            where table_schema = 'public' and table_name = any($1) and grantee in ('authenticated', 'anon', 'public') order by 1, 2, 3, 4`,
          [TABELAS]
        ),
        seguranca: await d.sql(`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = any($1) order by 1`, [TABELAS]),
        chaves: await d.sql(`select key from public.app_settings order by key`),
        dados: await d.sql(
          `select (select count(*) from public.credit_ledger)::int as livro, (select count(*) from public.credit_daily)::int as diario,
                  (select count(*) from public.credit_wallets)::int as carteiras, (select count(*) from public.study_room_charges)::int as cobrancas`
        ),
      });
      const antes = await retrato();
      expect((antes.chaves as any[]).map((x) => x.key)).toContain("creditos");
      // (Junção da etapa 2: as do Treino que vêm depois refazem funções destas, como a exportação na 014120; recoladas na ordem, o
      // banco volta igual.)
      for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.includes("treino_dupla") && x >= MIGRACOES[0]).sort()) {
        await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
      }
      expect(await retrato()).toEqual(antes);
      // e o sistema continua funcionando
      await cota(true);
      expect((await consome(await conta("pro"), 1, chave())).bucket).toBe("daily");
    });
  });
});
