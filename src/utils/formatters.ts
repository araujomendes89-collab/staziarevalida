import { MedicalArea } from "../types";

export const MEDICAL_AREA_LABELS: Record<string, string> = {
  CLINICA_MEDICA: "Clínica Médica",
  CIRURGIA_GERAL: "Cirurgia Geral",
  GINECOLOGIA_OBSTETRICIA: "Ginecologia e Obstetrícia",
  PEDIATRIA: "Pediatria",
  MEDICINA_FAMILIA_COMUNIDADE: "Medicina de Família e Comunidade",
  MEDICINA_PREVENTIVA: "Medicina Preventiva e Social",
  PREVENTIVA: "Medicina Preventiva e Social",
  SUS: "Medicina Preventiva e SUS",
  "clinica-medica": "Clínica Médica",
  "cirurgia-geral": "Cirurgia Geral",
  "ginecologia-obstetricia": "Ginecologia e Obstetrícia",
  pediatria: "Pediatria",
  "medicina-preventiva": "Medicina Preventiva e Social",
  "medicina-familia-comunidade": "Medicina de Família e Comunidade",
};

export const SHORT_MEDICAL_AREA_LABELS: Record<string, string> = {
  CLINICA_MEDICA: "Clínica Médica",
  CIRURGIA_GERAL: "Cirurgia Geral",
  GINECOLOGIA_OBSTETRICIA: "Ginecologia e Obstetrícia",
  PEDIATRIA: "Pediatria",
  MEDICINA_FAMILIA_COMUNIDADE: "Medicina de Família",
  MEDICINA_PREVENTIVA: "Preventiva e SUS",
  PREVENTIVA: "Preventiva",
  SUS: "SUS e MFC",
};

export function formatMedicalArea(area?: string | null): string {
  if (!area) return "Área Geral";
  const normalized = String(area).trim();
  if (MEDICAL_AREA_LABELS[normalized]) {
    return MEDICAL_AREA_LABELS[normalized];
  }
  // If in format like CLINICA_MEDICA or CIRURGIA_GERAL
  const cleaned = normalized
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return cleaned;
}

export function formatShortMedicalArea(area?: string | null): string {
  if (!area) return "Geral";
  const normalized = String(area).trim();
  if (SHORT_MEDICAL_AREA_LABELS[normalized]) {
    return SHORT_MEDICAL_AREA_LABELS[normalized];
  }
  return formatMedicalArea(area);
}
