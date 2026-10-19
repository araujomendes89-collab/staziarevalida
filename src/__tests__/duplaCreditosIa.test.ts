// @vitest-environment node
/**
 * Stazia Match · Etapa M3 (preparação), migração 014070: a moeda "ia" no mesmo livro, com as janelas de dia, semana e mês, e o
 * estorno por referência. NÃO liga o treino sozinho (o ramo dupla-sozinho-ia ainda não foi juntado): a ligação está descrita no
 * cabeçalho da migração. Num Postgres em memória (PGlite) com as regras reais.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, U, openDuplaDb, setPlan, type DuplaDb } from "./helpers/duplaDb";

const MIGRACAO = "20261003014070_treino_dupla_creditos_ia.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8");
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
// 2026-10-14 é uma quarta-feira (semana de segunda 12 a domingo 18); o mês é outubro. Instantes ao meio-dia de São Paulo.
const DIA = (d: number) => `2026-10-${String(d).padStart(2, "0")}T15:00:00Z`;

describe("Migração 014070 — moeda 'ia': janelas de dia, semana e mês e estorno por referência", () => {
  let d: DuplaDb;
  let n = 0;
  const conta = async () => {
    // O livro não se apaga: cada teste usa uma conta nova.
    const id = `00000000-0000-4000-8000-0000000009${String(++n).padStart(2, "0")}`;
    await d.sql(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb)`, [id, `ia${n}@teste.dev`]);
    await setPlan(d.db, id, "pro", "active");
    return id;
  };
  const ia = (cfg: Record<string, unknown>, ativa = true) =>
    d.sql(`update public.app_settings set value = $1::jsonb where key = 'creditos'`, [JSON.stringify({ ativa, match: { pro: 3 }, ia: cfg })]);
  const gasta = (uid: string, chave: string, agora: string, peso = 1, ref: string | null = null) =>
    d.sql<{ r: any }>(`select public.credit_consume($1::uuid, 'ia', $2, 'solo_run', $3::uuid, $4, $5::timestamptz) as r`, [uid, peso, ref ?? "11111111-1111-4111-8111-111111111111", chave, agora]);
  const estado = async (uid: string, agora: string) =>
    (await d.sql<{ s: any }>(`select public.credit_state($1::uuid, 'ia', $2::timestamptz) as s`, [uid, agora]))[0].s;

  beforeAll(async () => {
    d = await openDuplaDb();
  }, 120_000);
  afterAll(async () => {
    await d?.db.close();
  });

  it("cota desligada: a moeda ia não limita nem lança nada (como antes)", async () => {
    const a = await conta();
    await ia({ pro: { dia: 1 } }, false);
    const r = await gasta(a, "ia-off", DIA(14));
    expect(r[0].r).toMatchObject({ charged: false });
    expect(await d.sql(`select count(*)::int as n from public.credit_ledger where user_id = $1`, [a])).toEqual([{ n: 0 }]);
  });

  it("plano sem nenhuma janela (ou vazio) = bloqueada; com número só de dia limita só o dia", async () => {
    const a = await conta();
    await ia({});
    expect(await estado(a, DIA(14))).toMatchObject({ ativa: true, disponivel: 0 });
    await expect(gasta(a, "ia-vazio", DIA(14))).rejects.toThrow(/sem_credito/);
    await ia({ pro: {} });
    expect(await estado(a, DIA(14))).toMatchObject({ disponivel: 0 });
    await ia({ pro: { dia: null, semana: null, mes: null } });
    expect(await estado(a, DIA(14))).toMatchObject({ disponivel: 0 });
    await ia({ pro: 2 });
    expect(await estado(a, DIA(14))).toMatchObject({ limite_dia: 2, disponivel: 2 });
    await gasta(a, "ia-n1", DIA(14));
    await gasta(a, "ia-n2", DIA(14));
    await expect(gasta(a, "ia-n3", DIA(14))).rejects.toThrow(/sem_credito/);
    expect(await estado(a, DIA(15))).toMatchObject({ disponivel: 2, usados_hoje: 0 });
  });

  it("janela de semana: o disponível é o MENOR entre dia, semana e mês; a semana vai de segunda a domingo (Brasília)", async () => {
    const a = await conta();
    await ia({ pro: { dia: 2, semana: 3, mes: 100 } });
    // segunda (12) e terça (13): 2 + 1 = 3 na semana
    await gasta(a, "sem-a", DIA(12)); await gasta(a, "sem-b", DIA(12));
    await gasta(a, "sem-c", DIA(13));
    // quarta (14): sobram 2 no dia, mas 0 na semana
    expect(await estado(a, DIA(14))).toMatchObject({ disponivel: 0, limite_semana: 3, usados_semana: 3, limite_mes: 100, usados_mes: 3 });
    await expect(gasta(a, "sem-d", DIA(14))).rejects.toThrow(/sem_credito/);
    // a semana seguinte (segunda 19) libera: 2 no dia
    expect(await estado(a, DIA(19))).toMatchObject({ disponivel: 2, usados_semana: 0, usados_mes: 3 });
    // domingo (18) ainda é a semana de 12 a 18
    expect(await estado(a, DIA(18))).toMatchObject({ disponivel: 0, usados_semana: 3 });
  });

  it("janela de mês: esgotado no mês, só volta no mês seguinte; janela ausente não limita aquela janela", async () => {
    const a = await conta();
    await ia({ pro: { dia: 5, mes: 2 } });
    await gasta(a, "mes-a", DIA(1)); await gasta(a, "mes-b", DIA(20));
    expect(await estado(a, DIA(21))).toMatchObject({ disponivel: 0, usados_mes: 2, limite_semana: null });
    await expect(gasta(a, "mes-c", DIA(21))).rejects.toThrow(/sem_credito/);
    expect(await estado(a, "2026-11-02T15:00:00Z")).toMatchObject({ disponivel: 2 });
  });

  it("peso maior que 1: gasta várias unidades de uma vez, repartidas entre os baldes; bônus vale depois do limite do plano", async () => {
    const a = await conta();
    await ia({ pro: { dia: 2 }, pesos: { avaliacao_sozinho: 3 } });
    await d.sql(`select public.credit_grant($1::uuid, 'ia', 5, 'teste', 'ia-bonus-' || $1::text, 'bonus')`, [a]);
    expect(await estado(a, DIA(14))).toMatchObject({ disponivel: 7, bonus: 5 });
    const r = await gasta(a, "peso-3", DIA(14), 3);
    expect(r[0].r).toMatchObject({ charged: true });
    expect(r[0].r.buckets.map((b: any) => [b.bucket, b.n])).toEqual([["daily", 2], ["bonus", 1]]);
    expect(await estado(a, DIA(14))).toMatchObject({ disponivel: 4, bonus: 4, usados_hoje: 2 });
    await expect(gasta(a, "peso-9", DIA(14), 9)).rejects.toThrow(/sem_credito/);
  });

  it("estorno por referência: devolve cada consumo da referência ao seu balde, uma vez só; outra referência não é tocada", async () => {
    const a = await conta();
    const refA = "22222222-2222-4222-8222-222222222222";
    const refB = "33333333-3333-4333-8333-333333333333";
    await ia({ pro: { dia: 2 } });
    await d.sql(`select public.credit_grant($1::uuid, 'ia', 2, 'teste', 'ia-bonus2-' || $1::text, 'bonus')`, [a]);
    await gasta(a, "ref-a", DIA(14), 3, refA); // 2 diários + 1 bônus
    await gasta(a, "ref-b", DIA(14), 1, refB);
    const antes = await estado(a, DIA(14));
    expect(antes).toMatchObject({ usados_hoje: 2, bonus: 0 });
    const r1 = (await d.sql<{ r: any }>(`select public.credit_refund_ref('solo_run', $1::uuid, 'Falha da avaliação por IA', $2::timestamptz) as r`, [refA, DIA(14)]))[0].r;
    expect(r1.estornados).toBe(2);
    // A devolveu 2 ao diário e 1 ao bônus; o consumo da referência B (1 do bônus) ficou
    expect(await estado(a, DIA(14))).toMatchObject({ usados_hoje: 0, bonus: 1 });
    const r2 = (await d.sql<{ r: any }>(`select public.credit_refund_ref('solo_run', $1::uuid, 'de novo', $2::timestamptz) as r`, [refA, DIA(14)]))[0].r;
    expect(r2).toEqual({ estornados: 0, ledger_ids: [] });
    expect(await d.sql(`select count(*)::int as n from public.credit_ledger where user_id = $1 and kind = 'refund'`, [a])).toEqual([{ n: 2 }]);
    // a conciliação continua em ordem para a moeda ia
    expect((await d.sql<{ r: any }>(`select public.credit_reconcile('ia') as r`))[0].r).toMatchObject({ ok: true });
  });

  it("equipe não é limitada; a moeda match não muda (só dia); a ia não vaza para a cota do match", async () => {
    await ia({ pro: { dia: 1 } });
    const st = (await d.sql<{ s: any }>(`select public.credit_state($1::uuid, 'ia') as s`, [U.admin]))[0].s;
    expect(st).toMatchObject({ ativa: true, ilimitado: true });
    const a = await conta();
    await d.sql(`update public.app_settings set value = $1::jsonb where key = 'creditos'`, [JSON.stringify({ ativa: true, match: { pro: 4 }, ia: { pro: { dia: 1, semana: 1 } } })]);
    expect(await estado(a, DIA(14))).toMatchObject({ disponivel: 1 });
    const m = (await d.sql<{ s: any }>(`select public.credit_state($1::uuid, 'match', $2::timestamptz) as s`, [a, DIA(14)]))[0].s;
    expect(m).toMatchObject({ limite_dia: 4, disponivel: 4 });
    expect(m).not.toHaveProperty("limite_semana");
  });

  it("o estado de 'hoje' (Início do aluno) renova na virada de Brasília e preserva bônus e comprados", async () => {
    const a = await conta();
    await ia({ pro: { dia: 5 } });
    await d.sql(`select public.credit_grant($1::uuid, 'ia', 3, 'teste', 'virada-bonus-' || $1::text, 'bonus')`, [a]);
    await gasta(a, "virada-1", "2026-10-17T20:00:00Z"); // 17:00 de Brasília
    await gasta(a, "virada-2", "2026-10-18T02:59:59Z"); // 23:59:59 de Brasília, ainda dia 17
    expect(await estado(a, "2026-10-18T02:59:59Z")).toMatchObject({ usados_hoje: 2, limite_dia: 5, bonus: 3, disponivel: 6 });
    expect(await estado(a, "2026-10-18T03:00:01Z")).toMatchObject({ usados_hoje: 0, limite_dia: 5, bonus: 3, disponivel: 8 });
  });

  it("colar duas vezes dá o mesmo banco; credit_* continuam fechadas para o navegador", async () => {
    const defs = () =>
      d.sql(`select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`);
    const antes = await defs();
    await d.db.exec(SQL);
    expect(await defs()).toEqual(antes);
    for (const f of ["credit_avail(uuid,text,timestamp with time zone)", "credit_state(uuid,text,timestamp with time zone)", "credit_refund_ref(text,uuid,text,timestamp with time zone)"]) {
      for (const papel of ["anon", "authenticated"]) {
        expect((await d.sql<{ ok: boolean }>(`select has_function_privilege($1, $2::regprocedure, 'execute') as ok`, [papel, `public.${f}`]))[0].ok, `${f} ${papel}`).toBe(false);
      }
    }
    const frouxas = await d.sql(`select proname from pg_proc where proname in ('credit_avail', 'credit_state', 'credit_refund_ref') and (not prosecdef or proconfig is null or not ('search_path=""' = any (proconfig)))`);
    expect(frouxas).toEqual([]);
  });
});
