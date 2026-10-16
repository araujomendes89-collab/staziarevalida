// Cores dos Grandes Temas (paleta v2 aprovada em 14/10/2026): 100 temas com cor, uma família por área, texto legível e
// nenhuma cor de tema nos tons proibidos (vermelho só em Ginecologia e Obstetrícia).
import { describe, expect, it } from "vitest";
import { AREA_CORES, TEMA_CORES, temaVars } from "../novo/app/study/temaCores.js";

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contraste = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe("Cores dos Grandes Temas (paleta v2)", () => {
  it("os 100 temas têm cor e o 1º de cada área usa a cor-base da área", () => {
    expect(Object.keys(TEMA_CORES)).toHaveLength(100);
    expect(TEMA_CORES["GR-001"][0]).toBe("#087A63");
    expect(AREA_CORES.cm[0]).toBe("#087A63");
    expect(AREA_CORES.go[0]).toBe("#A94136");
  });
  it("texto escuro sobre o fundo suave (selo) e brilho no modo escuro passam no contraste mínimo", () => {
    for (const [id, [p, e, c, b]] of Object.entries(TEMA_CORES)) {
      expect(contraste(e, c), `${id} selo`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(b, "#0B1B30"), `${id} brilho no escuro`).toBeGreaterThanOrEqual(4.5);
      expect(contraste("#FFFFFF", p), `${id} branco sobre a cor`).toBeGreaterThanOrEqual(3);
    }
  });
  it("vermelho só em Ginecologia e Obstetrícia", () => {
    const vermelho = (h: number) => h < 20 || h > 345;
    for (const [k, v] of Object.entries(AREA_CORES)) if (k !== "go") expect(vermelho(hue(v[0])), `área ${k}`).toBe(false);
  });
  it("temaVars devolve as quatro variáveis e cai na cor da área", () => {
    expect(temaVars("GR-043", "go")).toMatchObject({ "--gt-p": expect.stringMatching(/^#[0-9A-F]{6}$/), "--gt-b": expect.any(String) });
    expect(temaVars("area-sm", "sm")["--gt-p"]).toBe(AREA_CORES.sm[0]);
  });
});
