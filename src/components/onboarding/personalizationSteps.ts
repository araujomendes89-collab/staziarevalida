import {
  PreparationStage,
  DailyAvailability,
  WeekDay,
  ExamIntent,
} from "./personalizationTypes";

export interface OptionChoice<T> {
  value: T;
  label: string;
  sublabel?: string;
  letter?: string;
  colorAccent?: string;
}

export const STAGE_OPTIONS: OptionChoice<PreparationStage>[] = [
  { value: "COMECO", letter: "A", label: "Estou começando agora" },
  { value: "JA_ESTUDO", letter: "B", label: "Já estudo há algum tempo" },
  { value: "JA_FIZ_PROVAS", letter: "C", label: "Já fiz provas ou simulados" },
  { value: "JA_PRESTEI_REVALIDA", letter: "D", label: "Já prestei o Revalida anteriormente" },
];

export const DAILY_AVAILABILITY_OPTIONS: OptionChoice<DailyAvailability>[] = [
  { value: "ATE_1H", label: "Até 1 hora" },
  { value: "1_A_2H", label: "1 a 2 horas" },
  { value: "2_A_4H", label: "2 a 4 horas" },
  { value: "MAIS_4H", label: "Mais de 4 horas" },
  { value: "INDEFINIDO", label: "Ainda não tenho uma rotina definida" },
];

export const WEEK_DAYS_CONFIG: { value: WeekDay; label: string; fullLabel: string }[] = [
  { value: "SEG", label: "Seg", fullLabel: "Segunda-feira" },
  { value: "TER", label: "Ter", fullLabel: "Terça-feira" },
  { value: "QUA", label: "Qua", fullLabel: "Quarta-feira" },
  { value: "QUI", label: "Qui", fullLabel: "Quinta-feira" },
  { value: "SEX", label: "Sex", fullLabel: "Sexta-feira" },
  { value: "SAB", label: "Sáb", fullLabel: "Sábado" },
  { value: "DOM", label: "Dom", fullLabel: "Domingo" },
];

export const MEDICAL_AREAS_OPTIONS: { id: string; label: string; color: string }[] = [
  { id: "CLINICA_MEDICA", label: "Clínica Médica", color: "#2563eb" },
  { id: "CIRURGIA_GERAL", label: "Cirurgia Geral", color: "#ea580c" },
  { id: "PEDIATRIA", label: "Pediatria", color: "#0d9488" },
  { id: "GINECOLOGIA_OBSTETRICIA", label: "Ginecologia e Obstetrícia", color: "#e11d48" },
  { id: "MEDICINA_PREVENTIVA", label: "Medicina Preventiva / Saúde Coletiva", color: "#059669" },
];

export const EXAM_INTENT_OPTIONS: OptionChoice<ExamIntent>[] = [
  { value: "PROXIMA", label: "Próxima edição" },
  { value: "FUTURA", label: "Uma edição futura" },
  { value: "INDEFINIDO", label: "Ainda não defini" },
];
