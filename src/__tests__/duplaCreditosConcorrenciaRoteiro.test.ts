// @vitest-environment node
/**
 * Stazia Match · M5b: confere, no PGlite (UMA conexão, chamadas em série), a LÓGICA do roteiro de concorrência real
 * `scripts/dupla/concorrencia-creditos.mjs`. Isto NÃO prova a corrida entre conexões: a prova real roda esse roteiro num
 * Postgres de verdade (ver o cabeçalho do roteiro). Aqui se garante que os cenários, as contas de teste, as consultas e as
 * conferências estão certos e que o resultado final de cada cenário é o esperado quando as chamadas se serializam.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error módulo .mjs sem tipos
import { CENARIOS, CONTAS, limpar, montar, rodarCenarios } from "../../scripts/dupla/concorrencia-creditos.mjs";
import { openDuplaDb, type DuplaDb } from "./helpers/duplaDb";

describe("Roteiro de concorrência dos créditos (conferido em série no PGlite)", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb();
  }, 120_000);
  afterAll(async () => {
    await d?.db.close();
  });

  const harness = (log: string[]) => ({
    falhas: [] as string[],
    log: (s: string) => log.push(s),
    confere(cond: unknown, texto: string) {
      if (!cond) this.falhas.push(texto);
    },
    admin: (sql: string, params: unknown[] = []) => d.sql(sql, params),
    comoAluno: (uid: string, sql: string, params: unknown[] = []) => d.asUser(uid, sql, params),
    paralelo: (n: number, fn: (i: number) => Promise<unknown>) => Promise.allSettled(Array.from({ length: n }, (_, i) => fn(i))),
  });

  it("os sete cenários do plano passam quando as chamadas se serializam, e o roteiro limpa as contas que criou", async () => {
    const log: string[] = [];
    const h = harness(log);
    await montar(h);
    const r = await rodarCenarios(h);
    expect(r.falhas, log.join("\n")).toEqual([]);
    expect(r.passou).toBe(true);
    expect(CENARIOS).toHaveLength(7);
    expect(log.filter((l) => l.startsWith("PASSOU"))).toHaveLength(7);
    await limpar(h);
    expect(await d.sql(`select count(*)::int as n from auth.users where id = any ($1::uuid[])`, [Object.values(CONTAS)])).toEqual([{ n: 0 }]);
    // o extrato das contas de teste sumiu junto (a exclusão da conta apaga o livro dela)
    expect(await d.sql(`select count(*)::int as n from public.credit_ledger where user_id = any ($1::uuid[])`, [Object.values(CONTAS)])).toEqual([{ n: 0 }]);
  });

  it("o roteiro recusa endereços do Supabase e não usa o pacote pg sem ordem", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../../scripts/dupla/concorrencia-creditos.mjs", import.meta.url), "utf8");
    expect(src).toMatch(/supabase\\\.\(co\|com\)/);
    expect(src).toMatch(/NUNCA contra produção/);
    // a URL vem só do ambiente e nunca é impressa
    expect(src).not.toMatch(/console\.(log|error)\([^)]*\burl\b/);
  });
});
