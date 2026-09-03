import { describe, it, expect } from "vitest";
import { getAreaVisualTheme, CANONICAL_AREA_DISPLAY_LABELS } from "../config/areaThemes";
import { ALL_GRANDES_TEMAS } from "../data/grandesTemas";

describe("Visual Terminology and Area Normalization (Etapa 1.17F)", () => {
  it("A: verifies the 5 canonical area display labels", () => {
    expect(CANONICAL_AREA_DISPLAY_LABELS.CLINICA_MEDICA).toBe("Clínica Médica");
    expect(CANONICAL_AREA_DISPLAY_LABELS.CIRURGIA_GERAL).toBe("Cirurgia Geral");
    expect(CANONICAL_AREA_DISPLAY_LABELS.PEDIATRIA).toBe("Pediatria");
    expect(CANONICAL_AREA_DISPLAY_LABELS.GINECOLOGIA_OBSTETRICIA).toBe("Ginecologia e Obstetrícia");
    expect(CANONICAL_AREA_DISPLAY_LABELS.MEDICINA_PREVENTIVA).toBe("Medicina Preventiva e Saúde Coletiva");
  });

  it("B: ensures all internal aliases for the 5th area resolve to the canonical name and emerald color", () => {
    const aliases = [
      "medicina-preventiva",
      "MEDICINA_PREVENTIVA",
      "PREVENTIVA",
      "MEDICINA_FAMILIA_COMUNIDADE",
      "PREVENTIVA_MFC",
    ];

    for (const alias of aliases) {
      const theme = getAreaVisualTheme(alias);
      expect(theme.name).toBe("Medicina Preventiva e Saúde Coletiva");
      expect(theme.colorHex).toBe("#059669");
      expect(theme.borderLeft).toBe("border-l-emerald-500");
    }
  });

  it("C: ensures all internal aliases for Cirurgia Geral resolve to the canonical name and orange color", () => {
    const aliases = ["cirurgia-geral", "cirurgia", "CIRURGIA_GERAL"];

    for (const alias of aliases) {
      const theme = getAreaVisualTheme(alias);
      expect(theme.name).toBe("Cirurgia Geral");
      expect(theme.colorHex).toBe("#ea580c");
      expect(theme.borderLeft).toBe("border-l-orange-500");
    }
  });

  it("D: ensures all internal aliases for Ginecologia e Obstetrícia resolve to the canonical name and rose color", () => {
    const aliases = ["ginecologia-obstetricia", "GINECOLOGIA_OBSTETRICIA"];

    for (const alias of aliases) {
      const theme = getAreaVisualTheme(alias);
      expect(theme.name).toBe("Ginecologia e Obstetrícia");
      expect(theme.colorHex).toBe("#e11d48");
      expect(theme.borderLeft).toBe("border-l-rose-500");
    }
  });

  it("E: verifies that all 75 canonical topics map to valid area visual themes", () => {
    expect(ALL_GRANDES_TEMAS.length).toBe(75);

    for (const tema of ALL_GRANDES_TEMAS) {
      const theme = getAreaVisualTheme(tema.areaId);
      expect(theme.id).not.toBe("default");
      expect(theme.colorHex).toBeTruthy();
      expect(theme.name).toBeTruthy();
    }
  });
});
