/**
 * Tokens dos materiais visuais educacionais (cards, A4, story e flashcards), iguais aos de
 * tokens-especialidades.json, que veio no pacote "StaziaMed Revalida — Modelos educacionais" (2026-10-06).
 * O teste visualMaterials.test.ts confere que os dois continuam idênticos: mude os dois juntos.
 *
 * A especialidade troca só o acento. O azul-marinho da marca segue estrutural e o vermelho de alerta
 * (#C8102E) é exclusivo de pegadinhas e alertas, inclusive em Cirurgia (que usa #D94A4A só como acento).
 */

export type SpecialtyKey = "ginecologia" | "pediatria" | "clinica_medica" | "cirurgia" | "preventiva_mfc" | "fallback";

export interface SpecialtyPalette {
  label: string;
  primary: string;
  soft: string;
  dark: string;
  contrast: string;
}

export const VISUAL_TOKENS = {
  brand: {
    neutral: { navy: "#0B2545", petroleum: "#0E6B74", turquoise: "#1FA6A0", mist: "#EEF8F8", ink: "#142033", white: "#FFFFFF" },
    alert: { primary: "#C8102E", soft: "#FFF3F4" },
    note: { primary: "#FFE98A" },
  },
  specialties: {
    ginecologia: { label: "Ginecologia", primary: "#D95C82", soft: "#FCEEF3", dark: "#A8325A", contrast: "#FFFFFF" },
    pediatria: { label: "Pediatria", primary: "#3A7BD5", soft: "#EAF2FC", dark: "#1F4E96", contrast: "#FFFFFF" },
    clinica_medica: { label: "Clínica Médica", primary: "#2E9B67", soft: "#E9F6EF", dark: "#1B6B45", contrast: "#FFFFFF" },
    cirurgia: { label: "Cirurgia", primary: "#D94A4A", soft: "#FCEDED", dark: "#A12B2B", contrast: "#FFFFFF" },
    preventiva_mfc: { label: "Preventiva/MFC", primary: "#7B5DB7", soft: "#F1ECF9", dark: "#4F3787", contrast: "#FFFFFF" },
    fallback: { label: "Fallback", primary: "#1FA6A0", soft: "#EEF8F8", dark: "#0E6B74", contrast: "#FFFFFF" },
  } as Record<SpecialtyKey, SpecialtyPalette>,
  flashcards: {
    digital: { width: 1080, height: 1350 },
    print_a6: { width: 1240, height: 1748, physical_size_mm: "105x148", dpi: 300, safe_margin_mm: 5, bleed_mm: 3, duplex_flip: "long_edge" },
  },
} as const;

/** Cores da marca usadas nos modelos que não estão no arquivo de tokens (vêm das pranchas de referência). */
export const TEMPLATE_COLORS = {
  turquoiseSeal: "#7FE3DE", // selo "Atualizado" e número da página (texto marinho)
  mistLine: "#CFE3E4", // linhas de tabela e divisórias
  navyLine: "#2B4470", // divisória do cabeçalho da tabela
  brandMed: "#5FD9D3", // "Med" do logotipo sobre o azul-marinho
  tape: "#9ED8E6", // fita adesiva do "Tome nota"
  alertIcon: "#FFD23F", // triângulo do alerta
} as const;

export const SPECIALTY_KEYS: SpecialtyKey[] = ["ginecologia", "pediatria", "clinica_medica", "cirurgia", "preventiva_mfc", "fallback"];
