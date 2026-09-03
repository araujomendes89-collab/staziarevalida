import { describe, it, expect } from "vitest";
import { getAreaVisualTheme, AREA_VISUAL_THEMES } from "../config/areaThemes";

describe("Area Visual Theme System (Adendo)", () => {
  it("A: maps all 5 medical areas with consistent semantic colors", () => {
    // 1. Clínica Médica -> blue
    const clinica = getAreaVisualTheme("clinica-medica");
    expect(clinica.name).toBe("Clínica Médica");
    expect(clinica.colorHex).toBe("#2563eb");
    expect(clinica.borderLeft).toContain("blue");
    expect(clinica.badgeBg).toContain("blue");

    // 2. Cirurgia Geral -> orange/amber
    const cirurgia = getAreaVisualTheme("cirurgia-geral");
    expect(cirurgia.name).toBe("Cirurgia Geral");
    expect(cirurgia.colorHex).toBe("#ea580c");
    expect(cirurgia.borderLeft).toContain("orange");
    expect(cirurgia.badgeBg).toContain("orange");

    // 3. Pediatria -> teal/turquesa
    const pediatria = getAreaVisualTheme("pediatria");
    expect(pediatria.name).toBe("Pediatria");
    expect(pediatria.colorHex).toBe("#0d9488");
    expect(pediatria.borderLeft).toContain("teal");
    expect(pediatria.badgeBg).toContain("teal");

    // 4. Ginecologia e Obstetrícia -> rose/pink
    const go = getAreaVisualTheme("ginecologia-obstetricia");
    expect(go.name).toBe("Ginecologia e Obstetrícia");
    expect(go.colorHex).toBe("#e11d48");
    expect(go.borderLeft).toContain("rose");
    expect(go.badgeBg).toContain("rose");

    // 5. Medicina Preventiva / SUS -> emerald/green
    const preventiva = getAreaVisualTheme("medicina-preventiva");
    expect(preventiva.name).toBe("Medicina Preventiva e Saúde Coletiva");
    expect(preventiva.colorHex).toBe("#059669");
    expect(preventiva.borderLeft).toContain("emerald");
    expect(preventiva.badgeBg).toContain("emerald");
  });

  it("B: resolves uppercase enum aliases properly", () => {
    expect(getAreaVisualTheme("CLINICA_MEDICA").colorHex).toBe("#2563eb");
    expect(getAreaVisualTheme("CIRURGIA_GERAL").colorHex).toBe("#ea580c");
    expect(getAreaVisualTheme("PEDIATRIA").colorHex).toBe("#0d9488");
    expect(getAreaVisualTheme("GINECOLOGIA_OBSTETRICIA").colorHex).toBe("#e11d48");
    expect(getAreaVisualTheme("MEDICINA_FAMILIA_COMUNIDADE").colorHex).toBe("#059669");
    expect(getAreaVisualTheme("PREVENTIVA").colorHex).toBe("#059669");
  });

  it("C: returns graceful default theme for invalid or null keys", () => {
    const defaultTheme = getAreaVisualTheme(null);
    expect(defaultTheme).toBeDefined();
    expect(defaultTheme.id).toBe("default");

    const unknownTheme = getAreaVisualTheme("UNKNOWN_AREA");
    expect(unknownTheme).toBeDefined();
    expect(unknownTheme.id).toBe("default");
  });
});
