import { describe, expect, it } from "vitest";
import { anosVisiveis, soAnosVisiveis } from "../novo/app/study/UpdatesScreen.jsx";

describe("Diretrizes e Atualizações: o aluno só vê 2025 e 2026", () => {
  const resposta = {
    total: 5,
    years: [2013, 2016, 2024, 2025, 2026],
    items: [
      { slug: "a", years: [2013] },
      { slug: "b", years: [2016] },
      { slug: "c", years: [2024, 2026] },
      { slug: "d", years: [2024, 2025, 2026] },
      { slug: "e", years: [2025] },
    ],
  };

  it("tira quem só tem anos antigos e mostra só 2025 e 2026 nos demais", () => {
    const r = soAnosVisiveis(resposta);
    expect(r.items.map((i: any) => i.slug)).toEqual(["c", "d", "e"]);
    expect(r.items.map((i: any) => i.years)).toEqual([[2026], [2025, 2026], [2025]]);
  });

  it("os filtros de ano ficam só com 2025 e 2026 e o total acompanha", () => {
    const r = soAnosVisiveis(resposta);
    expect(r.years).toEqual([2025, 2026]);
    expect(r.total).toBe(3);
  });

  it("aceita anos como texto e ignora o que não é visível", () => {
    expect(anosVisiveis(["2013", "2025", 2016, "2026"])).toEqual([2025, 2026]);
    expect(anosVisiveis(undefined)).toEqual([]);
  });
});
