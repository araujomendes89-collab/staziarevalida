// @vitest-environment node
// Duas chamadas ao mesmo tempo depois do prazo do cache: se uma renova a lista enquanto a outra espera para tentar de novo,
// a que esperava usa a lista renovada (não recusa à toa). Falha dupla sem ninguém ter renovado continua recusando.
import { beforeEach, describe, expect, it } from "vitest";
import { ComplementarTermsUnavailable, loadComplementarTerms, resetComplementarTermsCache } from "../../server/contentHub/complementarGuard";

const mudo = () => {};
beforeEach(() => resetComplementarTermsCache());

describe("loadComplementarTerms: renovação concorrente", () => {
  it("a chamada que falhou usa a lista que a outra acabou de renovar, sem consultar de novo", async () => {
    let chamadas = 0;
    const db = {
      service: async () => {
        chamadas += 1;
        if (chamadas === 1) throw new Error("falha passageira");
        return ["Título Completo Cadastrado Da Fonte"];
      },
    } as never;
    const a = loadComplementarTerms(db, 1_000_000, mudo);
    const b = loadComplementarTerms(db, 1_000_010, mudo);
    const [ra, rb] = await Promise.all([a, b]);
    expect(rb).toContain("Título Completo Cadastrado Da Fonte");
    expect(ra).toEqual(rb);
    expect(chamadas).toBe(2);
  });

  it("as duas falham e ninguém renovou: recusa (lista vencida nunca vale)", async () => {
    const db = { service: async () => { throw new Error("banco fora"); } } as never;
    await expect(loadComplementarTerms(db, 2_000_000, mudo)).rejects.toBeInstanceOf(ComplementarTermsUnavailable);
  });

  it("cache vencido de uma lista antiga NÃO é usado quando a renovação falha", async () => {
    let ok = true;
    const db = { service: async () => { if (ok) return []; throw new Error("fora"); } } as never;
    expect(await loadComplementarTerms(db, 3_000_000, mudo)).toEqual([]);
    ok = false;
    await expect(loadComplementarTerms(db, 3_000_000 + 61_000, mudo)).rejects.toBeInstanceOf(ComplementarTermsUnavailable);
  });
});
