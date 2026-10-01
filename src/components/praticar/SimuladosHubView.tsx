import React, { useState, useMemo, useEffect } from "react";
import {
  FileText,
  Clock,
  CheckCircle2,
  Play,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Timer,
  SlidersHorizontal,
  Stethoscope,
  Activity,
  HeartPulse,
  Baby,
  ArrowRight,
  Zap,
  Layers,
  Calendar,
  Filter,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { formatMedicalArea } from "../../utils/formatters";
import { SessionBuilderService, DEFAULT_SESSION_CONFIG } from "../../services/sessionBuilderService";
import { QuestionSessionConfig, ActiveTrainingSession, MedicalArea } from "../../types";

export const MEDICAL_AREAS: {
  id: MedicalArea;
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [
  {
    id: "CLINICA_MEDICA",
    label: "Clínica Médica",
    icon: Stethoscope,
    description: "Cardio, Pneumo, Nefro, Gastro, Infecto e Neuro",
  },
  {
    id: "CIRURGIA_GERAL",
    label: "Cirurgia Geral",
    icon: Activity,
    description: "Trauma ATLS, Abdome Agudo, Queimaduras e Pré/Pós-operatório",
  },
  {
    id: "PEDIATRIA",
    label: "Pediatria",
    icon: Baby,
    description: "Neonatologia, Puericultura, Urgências Pediátricas e PNI",
  },
  {
    id: "GINECOLOGIA_OBSTETRICIA",
    label: "Ginecologia e Obstetrícia",
    icon: HeartPulse,
    description: "Pré-natal, Pré-Eclâmpsia, Sangramentos e Rastreio",
  },
  {
    id: "MEDICINA_FAMILIA_COMUNIDADE",
    label: "Medicina Preventiva / MFC",
    icon: ShieldCheck,
    description: "SUS, Epidemiologia, Saúde Coletiva e Bioética",
  },
];

export const AVAILABLE_SIMULATION_YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020];

export const SUBAREA_LABELS: Record<string, string> = {
  // Clínica Médica
  CARDIOLOGY: "Cardiologia",
  CLINICAL_EMERGENCIES: "Emergências Clínicas",
  DERMATOLOGY: "Dermatologia",
  ENDOCRINOLOGY: "Endocrinologia",
  GASTROENTEROLOGY_HEPATOLOGY: "Gastroenterologia e Hepatologia",
  GERIATRICS: "Geriatria",
  HEMATOLOGY_ONCOLOGY: "Hematologia e Oncologia",
  INFECTIOUS_DISEASES: "Infectologia",
  NEPHROLOGY_ELECTROLYTES: "Nefrologia e Eletrólitos",
  NEUROLOGY: "Neurologia",
  PSYCHIATRY: "Psiquiatria",
  PULMONOLOGY: "Pneumologia",
  RHEUMATOLOGY: "Reumatologia",
  
  // Cirurgia Geral
  ACUTE_ABDOMEN: "Abdome Agudo",
  BURNS: "Queimaduras",
  COLOPROCTOLOGY: "Coloproctologia",
  HERNIAS: "Hérnias",
  ORTHOPEDICS_TRAUMA: "Ortopedia e Trauma",
  PERIOPERATIVE_CARE: "Pré e Pós-Operatório",
  TRAUMA_ATLS: "Trauma e ATLS",
  UROLOGY: "Urologia",
  VASCULAR_SURGERY: "Cirurgia Vascular",
  
  // Pediatria
  NEONATOLOGY: "Neonatologia",
  PEDIATRIC_GASTRO_NUTRITION: "Gastro e Nutrição Pediátrica",
  PEDIATRIC_EMERGENCIES: "Emergências Pediátricas",
  WELL_CHILD_CARE_GROWTH_DEVELOPMENT: "Puericultura e Crescimento",
  PEDIATRIC_RESPIRATORY: "Pneumologia Pediátrica",
  IMMUNIZATION: "Imunização e PNI",
  PEDIATRIC_INFECTIOUS_EXANTHEMS: "Infectologia e Doenças Exantemáticas",
  PEDIATRIC_ENDOCRINOLOGY: "Endocrinologia Pediátrica",
  PEDIATRIC_NEUROLOGY: "Neurologia Pediátrica",
  PEDIATRIC_NEPHROLOGY: "Nefrologia Pediátrica",
  PEDIATRIC_HEMATOLOGY_ONCOLOGY: "Hematologia Pediátrica",
  
  // Ginecologia e Obstetrícia
  OBSTETRICS: "Obstetrícia",
  GYNECOLOGY: "Ginecologia",
  
  // Medicina Preventiva e Social / MFC
  PRIMARY_CARE: "Atenção Primária / APS",
  ETHICS_COMMUNICATION: "Bioética e Relação Médico-Paciente",
  HEALTH_SURVEILLANCE: "Vigilância em Saúde",
  SUS_HEALTH_SYSTEM: "Sistemas de Saúde e SUS",
  PREVENTION_SCREENING: "Prevenção e Rastreamento",
  EPIDEMIOLOGY_BIOSTATISTICS: "Epidemiologia e Bioestatística",
  OCCUPATIONAL_HEALTH: "Saúde do Trabalhador",
  MENTAL_HEALTH_PRIMARY_CARE: "Saúde Mental na APS",
  IMMUNIZATION_PUBLIC_HEALTH: "Vacinação em Saúde Pública",
};

export function getSubareaLabel(key: string): string {
  if (SUBAREA_LABELS[key]) return SUBAREA_LABELS[key];
  return key
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/(^\w{1})|(\s+\w{1})/g, (l) => l.toUpperCase());
}

export type SimulationTimerOption = "INEP_STANDARD" | "CUSTOM" | "FREE";

export const DURATION_PRESETS = [
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 45, label: "45 min" },
  { minutes: 60, label: "1 hora" },
  { minutes: 90, label: "1h 30m" },
  { minutes: 120, label: "2 horas" },
  { minutes: 180, label: "3 horas" },
  { minutes: 240, label: "4 horas" },
  { minutes: 300, label: "5 horas (Oficial)" },
];

export function formatMinutesDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m (${totalMinutes} min)`;
  if (h > 0) return `${h}h (${totalMinutes} min)`;
  return `${m} min`;
}

interface QuantityRangeSliderProps {
  value: number;
  onChange: (val: number) => void;
  maxAvailable: number;
  label?: string;
}

export const QuantityRangeSlider: React.FC<QuantityRangeSliderProps> = ({
  value,
  onChange,
  maxAvailable,
  label = "Quantidade de Questões",
}) => {
  const effectiveMax = Math.max(1, Math.min(100, maxAvailable));
  const effectiveValue = Math.max(1, Math.min(value, effectiveMax));

  if (maxAvailable === 0) {
    return (
      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-1">
        <p className="text-xs font-bold text-amber-900">
          Nenhuma questão disponível para esta configuração.
        </p>
        <p className="text-[11px] text-amber-700">
          Selecione outras áreas ou filtros para habilitar o simulado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/80">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          {label}
        </span>
        <div className="flex items-baseline gap-1 bg-white px-3 py-1 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-base sm:text-lg font-extrabold text-teal-700 font-mono">
            {effectiveValue}
          </span>
          <span className="text-xs font-bold text-slate-600">
            {effectiveValue === 1 ? "questão" : "questões"}
          </span>
        </div>
      </div>

      <div className="space-y-1.5 pt-1">
        <div className="relative flex items-center">
          <input
            type="range"
            min={1}
            max={effectiveMax}
            step={1}
            value={effectiveValue}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            aria-label={label}
            aria-valuemin={1}
            aria-valuemax={effectiveMax}
            aria-valuenow={effectiveValue}
            className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </div>

        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
          <span>1 questão</span>
          <span className="text-slate-500">
            Máx: {effectiveMax} {effectiveMax === 1 ? "questão" : "questões"}
          </span>
        </div>
      </div>
    </div>
  );
};

interface YearSelectorProps {
  selectedYears: (number | "ALL")[];
  onChange: (years: (number | "ALL")[]) => void;
  yearCounts?: Record<number, number>;
}

export const YearSelector: React.FC<YearSelectorProps> = ({
  selectedYears,
  onChange,
  yearCounts = {},
}) => {
  const isAllSelected = selectedYears.includes("ALL");

  const handleToggleYear = (year: number) => {
    if (isAllSelected) {
      onChange([year]);
      return;
    }
    if (selectedYears.includes(year)) {
      const filtered = selectedYears.filter((y) => y !== year);
      if (filtered.length === 0) {
        onChange(["ALL"]);
      } else {
        onChange(filtered);
      }
    } else {
      const next = [...selectedYears.filter((y) => y !== "ALL"), year];
      if (next.length === AVAILABLE_SIMULATION_YEARS.length) {
        onChange(["ALL"]);
      } else {
        onChange(next);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-teal-600" />
          <span>Ano da Prova Oficial</span>
        </label>
        <span className="text-[11px] text-slate-500 font-medium">
          {isAllSelected
            ? "Todas as edições (2020 a 2026/1)"
            : `${selectedYears.length} ${selectedYears.length === 1 ? "edição selecionada" : "edições selecionadas"}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(["ALL"])}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            isAllSelected
              ? "bg-teal-600 text-white shadow-2xs"
              : "bg-slate-100 hover:bg-slate-200 text-slate-700"
          }`}
        >
          Todos os Anos
        </button>

        {AVAILABLE_SIMULATION_YEARS.map((year) => {
          const isSelected = !isAllSelected && selectedYears.includes(year);
          const count = yearCounts[year];
          return (
            <button
              key={year}
              type="button"
              onClick={() => handleToggleYear(year)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                isSelected
                  ? "bg-teal-600 text-white font-bold shadow-2xs"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80"
              }`}
            >
              <span>{year}</span>
              {typeof count === "number" && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                    isSelected ? "bg-teal-700 text-teal-100" : "bg-slate-200/70 text-slate-600"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface SubareaSelectorProps {
  availableSubareas: { key: string; label: string; count: number; area: MedicalArea }[];
  selectedSubareas: string[];
  onChange: (subareas: string[]) => void;
}

export const SubareaSelector: React.FC<SubareaSelectorProps> = ({
  availableSubareas,
  selectedSubareas,
  onChange,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const isAllSubareas = selectedSubareas.length === 0;

  const handleToggleSubarea = (key: string) => {
    if (selectedSubareas.includes(key)) {
      onChange(selectedSubareas.filter((s) => s !== key));
    } else {
      onChange([...selectedSubareas, key]);
    }
  };

  const handleSelectAll = () => {
    onChange([]);
  };

  if (availableSubareas.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-teal-600" />
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Subáreas & Especialidades Clínicas
          </label>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold">
            {availableSubareas.length} especialidades
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer"
        >
          <span>{isExpanded ? "Recolher" : "Personalizar Subáreas"}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
        <p className="text-[11px]">
          {isAllSubareas
            ? "Todas as subáreas das áreas selecionadas estão inclusas."
            : `${selectedSubareas.length} subárea(s) selecionada(s) especificamente.`}
        </p>

        {!isAllSubareas && (
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-[11px] font-bold text-teal-600 hover:text-teal-700 underline cursor-pointer"
          >
            Restaurar todas
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="pt-2 space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-slate-200/60">
            <button
              type="button"
              onClick={handleSelectAll}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isAllSubareas
                  ? "bg-teal-600 text-white shadow-2xs"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              Todas as Subáreas
            </button>
            <button
              type="button"
              onClick={() => onChange(availableSubareas.map((s) => s.key))}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
            >
              Selecionar Todas Específicas
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
            >
              Limpar Filtro
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
            {availableSubareas.map((sub) => {
              const isSelected = !isAllSubareas && selectedSubareas.includes(sub.key);
              const isActiveAll = isAllSubareas;
              return (
                <button
                  key={sub.key}
                  type="button"
                  onClick={() => handleToggleSubarea(sub.key)}
                  className={`p-2 rounded-xl border text-left text-xs transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                    isSelected
                      ? "bg-teal-50 border-teal-500 text-teal-950 font-bold ring-1 ring-teal-500/30"
                      : isActiveAll
                      ? "bg-white border-slate-200 text-slate-700 hover:border-teal-300"
                      : "bg-slate-50/60 border-slate-200/70 text-slate-400 hover:text-slate-700"
                  }`}
                >
                  <span className="truncate" title={sub.label}>
                    {sub.label}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono shrink-0">
                    {sub.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

interface TimerCustomizerProps {
  timerOption: SimulationTimerOption;
  onOptionChange: (opt: SimulationTimerOption) => void;
  customMinutes: number;
  onCustomMinutesChange: (mins: number) => void;
  questionCount: number;
}

export const TimerCustomizer: React.FC<TimerCustomizerProps> = ({
  timerOption,
  onOptionChange,
  customMinutes,
  onCustomMinutesChange,
  questionCount,
}) => {
  const inepStandardMinutes = Math.max(5, questionCount * 3);
  const activeDurationMinutes =
    timerOption === "INEP_STANDARD"
      ? inepStandardMinutes
      : timerOption === "CUSTOM"
      ? customMinutes
      : 0;

  const minutesPerQuestion =
    questionCount > 0 && activeDurationMinutes > 0
      ? (activeDurationMinutes / questionCount).toFixed(1)
      : null;

  return (
    <div className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/80">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-teal-600" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Cronômetro & Duração do Simulado
          </span>
        </div>

        {timerOption !== "FREE" && (
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 font-bold text-teal-700 font-mono shadow-2xs">
              {formatMinutesDuration(activeDurationMinutes)}
            </span>
            {minutesPerQuestion && (
              <span className="text-[11px] text-slate-500 font-medium">
                (~{minutesPerQuestion} min/q)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Opções de Modo do Timer */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
        <button
          type="button"
          onClick={() => onOptionChange("INEP_STANDARD")}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
            timerOption === "INEP_STANDARD"
              ? "bg-teal-50 border-teal-500 text-teal-950 font-bold ring-1 ring-teal-500/30"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100/70"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">Padrão INEP Oficial</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 font-bold">
              3 min/q
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-normal">
            Calcula {inepStandardMinutes} min proporcional às {questionCount} questões.
          </span>
        </button>

        <button
          type="button"
          onClick={() => onOptionChange("CUSTOM")}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
            timerOption === "CUSTOM"
              ? "bg-teal-50 border-teal-500 text-teal-950 font-bold ring-1 ring-teal-500/30"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100/70"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">Personalizado</span>
            <SlidersHorizontal className="w-3.5 h-3.5 text-teal-600" />
          </div>
          <span className="text-[11px] text-slate-500 font-normal">
            Defina minutos exatos com slider e presets.
          </span>
        </button>

        <button
          type="button"
          onClick={() => onOptionChange("FREE")}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
            timerOption === "FREE"
              ? "bg-teal-50 border-teal-500 text-teal-950 font-bold ring-1 ring-teal-500/30"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100/70"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">Sem Limite (Livre)</span>
            <Clock className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <span className="text-[11px] text-slate-500 font-normal">
            Cronômetro progressivo para treino sem pressão.
          </span>
        </button>
      </div>

      {/* Controles de Tempo Personalizado */}
      {timerOption === "CUSTOM" && (
        <div className="pt-3 space-y-3 border-t border-slate-200/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              Ajuste de Duração em Minutos:
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={5}
                max={360}
                step={5}
                value={customMinutes}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 5) onCustomMinutesChange(val);
                }}
                className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <span className="text-xs text-slate-500">minutos</span>
            </div>
          </div>

          <div className="space-y-1">
            <input
              type="range"
              min={5}
              max={300}
              step={5}
              value={customMinutes}
              onChange={(e) => onCustomMinutesChange(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600 focus:outline-none"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
              <span>5 min</span>
              <span>1h (60m)</span>
              <span>2h (120m)</span>
              <span>3h (180m)</span>
              <span>5h (300m)</span>
            </div>
          </div>

          {/* Presets Rápidos */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-bold text-slate-400 mr-1">Presets:</span>
            {DURATION_PRESETS.map((p) => {
              const isActive = customMinutes === p.minutes;
              return (
                <button
                  key={p.minutes}
                  type="button"
                  onClick={() => onCustomMinutesChange(p.minutes)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    isActive
                      ? "bg-teal-600 text-white font-bold shadow-2xs"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const SimuladosHubView: React.FC = () => {
  const {
    setActiveTab,
    setQuestionMode,
    questions,
    attempts,
    knowledgeGraph,
  } = useApp();

  // Active Session from SessionBuilderService
  const [activeSession, setActiveSession] = useState<ActiveTrainingSession | null>(
    () => SessionBuilderService.getActiveSession()
  );

  // Custom simulation config state
  const [activeCategory, setActiveCategory] = useState<
    "RAPIDO" | "AREA" | "COMPLETO" | "PERSONALIZADO"
  >("RAPIDO");

  // Rapido Config
  const [rapidoCount, setRapidoCount] = useState<number>(20);
  const [rapidoYears, setRapidoYears] = useState<(number | "ALL")[]>(["ALL"]);
  const [rapidoTimerOption, setRapidoTimerOption] = useState<SimulationTimerOption>("INEP_STANDARD");
  const [rapidoCustomMinutes, setRapidoCustomMinutes] = useState<number>(60);

  // Area Config
  const [selectedArea, setSelectedArea] = useState<MedicalArea>("CLINICA_MEDICA");
  const [areaQuestionCount, setAreaQuestionCount] = useState<number>(20);
  const [areaYears, setAreaYears] = useState<(number | "ALL")[]>(["ALL"]);
  const [areaSelectedSubareas, setAreaSelectedSubareas] = useState<string[]>([]);
  const [areaTimerOption, setAreaTimerOption] = useState<SimulationTimerOption>("INEP_STANDARD");
  const [areaCustomMinutes, setAreaCustomMinutes] = useState<number>(60);

  // Completo Config
  const [completoCount, setCompletoCount] = useState<number>(50);
  const [completoYears, setCompletoYears] = useState<(number | "ALL")[]>(["ALL"]);
  const [completoTimerOption, setCompletoTimerOption] = useState<SimulationTimerOption>("INEP_STANDARD");
  const [completoCustomMinutes, setCompletoCustomMinutes] = useState<number>(150);

  // Personalizado Config
  const [customAreas, setCustomAreas] = useState<MedicalArea[]>([
    "CLINICA_MEDICA",
    "CIRURGIA_GERAL",
    "PEDIATRIA",
    "GINECOLOGIA_OBSTETRICIA",
    "MEDICINA_FAMILIA_COMUNIDADE",
  ]);
  const [customYears, setCustomYears] = useState<(number | "ALL")[]>(["ALL"]);
  const [customSelectedSubareas, setCustomSelectedSubareas] = useState<string[]>([]);
  const [customCount, setCustomCount] = useState<number>(30);
  const [customTimerOption, setCustomTimerOption] = useState<SimulationTimerOption>("INEP_STANDARD");
  const [customMinutes, setCustomMinutes] = useState<number>(90);
  const [customFeedbackMode, setCustomFeedbackMode] = useState<
    "END_OF_SESSION" | "IMMEDIATE"
  >("END_OF_SESSION");

  // Stats
  const totalQuestionsInBank = questions.length;

  const questionsCountPerArea = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of MEDICAL_AREAS) {
      map[a.id] = questions.filter((q) => q.area === a.id).length;
    }
    return map;
  }, [questions]);

  const yearCountsMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const y of AVAILABLE_SIMULATION_YEARS) {
      map[y] = questions.filter((q) => q.examYear === y).length;
    }
    return map;
  }, [questions]);

  // Subareas disponíveis para a aba AREA
  const availableSubareasForArea = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number; area: MedicalArea }>();
    questions.forEach((q) => {
      if (q.area === selectedArea) {
        if (areaYears.includes("ALL") || (q.examYear && areaYears.includes(q.examYear))) {
          const spec = q.specialty || q.subtopic;
          if (spec && spec.trim().length > 0) {
            const existing = map.get(spec);
            if (existing) {
              existing.count++;
            } else {
              map.set(spec, {
                key: spec,
                label: getSubareaLabel(spec),
                count: 1,
                area: q.area,
              });
            }
          }
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [questions, selectedArea, areaYears]);

  // Subareas disponíveis para a aba PERSONALIZADO
  const availableSubareasForCustom = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number; area: MedicalArea }>();
    questions.forEach((q) => {
      if (customAreas.includes(q.area)) {
        if (customYears.includes("ALL") || (q.examYear && customYears.includes(q.examYear))) {
          const spec = q.specialty || q.subtopic;
          if (spec && spec.trim().length > 0) {
            const existing = map.get(spec);
            if (existing) {
              existing.count++;
            } else {
              map.set(spec, {
                key: spec,
                label: getSubareaLabel(spec),
                count: 1,
                area: q.area,
              });
            }
          }
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [questions, customAreas, customYears]);

  // Filtered pool de questões para a aba AREA
  const filteredQuestionsForArea = useMemo(() => {
    return questions.filter((q) => {
      if (q.area !== selectedArea) return false;
      if (!areaYears.includes("ALL")) {
        if (!q.examYear || !areaYears.includes(q.examYear)) return false;
      }
      if (areaSelectedSubareas.length > 0) {
        const match = areaSelectedSubareas.some(
          (sub) =>
            q.specialty?.toLowerCase() === sub.toLowerCase() ||
            q.subtopic?.toLowerCase().includes(sub.toLowerCase())
        );
        if (!match) return false;
      }
      return true;
    });
  }, [questions, selectedArea, areaYears, areaSelectedSubareas]);

  // Filtered pool de questões para a aba PERSONALIZADO
  const filteredQuestionsForCustom = useMemo(() => {
    return questions.filter((q) => {
      if (customAreas.length > 0 && !customAreas.includes(q.area)) return false;
      if (!customYears.includes("ALL")) {
        if (!q.examYear || !customYears.includes(q.examYear)) return false;
      }
      if (customSelectedSubareas.length > 0) {
        const match = customSelectedSubareas.some(
          (sub) =>
            q.specialty?.toLowerCase() === sub.toLowerCase() ||
            q.subtopic?.toLowerCase().includes(sub.toLowerCase())
        );
        if (!match) return false;
      }
      return true;
    });
  }, [questions, customAreas, customYears, customSelectedSubareas]);

  // Filtered pool para a aba RÁPIDO
  const filteredQuestionsForRapido = useMemo(() => {
    return questions.filter((q) => {
      if (!rapidoYears.includes("ALL")) {
        if (!q.examYear || !rapidoYears.includes(q.examYear)) return false;
      }
      return true;
    });
  }, [questions, rapidoYears]);

  // Filtered pool para a aba COMPLETO
  const filteredQuestionsForCompleto = useMemo(() => {
    return questions.filter((q) => {
      if (!completoYears.includes("ALL")) {
        if (!q.examYear || !completoYears.includes(q.examYear)) return false;
      }
      return true;
    });
  }, [questions, completoYears]);

  // Safe effective values bounded by available questions
  const effectiveRapidoCount = Math.max(1, Math.min(rapidoCount, Math.min(100, filteredQuestionsForRapido.length) || 1));
  const effectiveAreaCount = Math.max(1, Math.min(areaQuestionCount, Math.min(100, filteredQuestionsForArea.length) || 1));
  const effectiveCompletoCount = Math.max(1, Math.min(completoCount, Math.min(100, filteredQuestionsForCompleto.length) || 1));
  const effectiveCustomCount = Math.max(1, Math.min(customCount, Math.min(100, filteredQuestionsForCustom.length) || 1));

  // Auto-adjust Area count
  useEffect(() => {
    const maxForArea = Math.min(100, filteredQuestionsForArea.length);
    if (areaQuestionCount > maxForArea && maxForArea > 0) {
      setAreaQuestionCount(maxForArea);
    }
  }, [filteredQuestionsForArea.length, areaQuestionCount]);

  // Auto-adjust Custom count
  useEffect(() => {
    const maxForCustom = Math.min(100, filteredQuestionsForCustom.length);
    if (customCount > maxForCustom && maxForCustom > 0) {
      setCustomCount(maxForCustom);
    }
  }, [filteredQuestionsForCustom.length, customCount]);

  // Start Simulation Session
  const handleStartSimulado = (config: QuestionSessionConfig) => {
    const matchedQuestions = SessionBuilderService.buildQuestionSession(
      config,
      questions,
      attempts,
      knowledgeGraph
    );

    if (matchedQuestions.length === 0) {
      alert("Nenhuma questão disponível para esta configuração de simulado.");
      return;
    }

    const selectedQuestions = matchedQuestions.slice(0, config.quantity);

    const newSession: ActiveTrainingSession = {
      id: `simulado-${Date.now()}`,
      title: config.title || "Simulado Revalida INEP",
      subtitle: `${selectedQuestions.length} questões • Modo Simulado`,
      mode: "SIMULADO",
      config,
      questionIds: selectedQuestions.map((q) => q.id),
      currentIndex: 0,
      answers: {},
      flaggedQuestionIds: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalDurationSeconds: 0,
      isCompleted: false,
      paused: false,
    };

    SessionBuilderService.saveActiveSession(newSession);
    setActiveSession(newSession);
    setQuestionMode("EXAM");
    setActiveTab("praticar-questoes");
  };

  // Discard in-progress session
  const handleDiscardSession = () => {
    SessionBuilderService.clearActiveSession();
    setActiveSession(null);
  };

  // Resume in-progress session
  const handleResumeSession = () => {
    setQuestionMode("EXAM");
    setActiveTab("praticar-questoes");
  };

  const hasActiveSession = Boolean(activeSession && !activeSession.isCompleted);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* 1. CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Simulados
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Treine em condições próximas à prova oficial do Revalida.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 shrink-0">
          <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
          <span className="font-bold text-slate-900">
            {totalQuestionsInBank} questões disponíveis
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-500">5 Grandes Áreas</span>
        </div>
      </div>

      {/* 2. SESSÃO EM ANDAMENTO (Se houver) */}
      {hasActiveSession && activeSession && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 font-bold">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-950">
                Simulado em andamento: {activeSession.title}
              </p>
              <p className="text-[11px] text-amber-700">
                Questão {activeSession.currentIndex + 1} de{" "}
                {activeSession.questionIds.length} · Progresso salvo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDiscardSession}
              className="px-3 py-1.5 text-slate-500 hover:text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={handleResumeSession}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs"
            >
              Continuar Simulado
            </button>
          </div>
        </div>
      )}

      {/* 3. SELETOR DE MODALIDADE */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { id: "RAPIDO" as const, label: "Simulado Rápido", icon: Zap, desc: "Slider de 1 a 100 q." },
          { id: "AREA" as const, label: "Por Grande Área", icon: Layers, desc: "Foco especializado" },
          { id: "COMPLETO" as const, label: "Simulado Geral", icon: FileText, desc: "Simulação ampla" },
          { id: "PERSONALIZADO" as const, label: "Personalizado", icon: SlidersHorizontal, desc: "Filtros sob medida" },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveCategory(tab.id)}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                isActive
                  ? "bg-teal-50 border-teal-500 text-teal-950 shadow-xs ring-1 ring-teal-500/30"
                  : "bg-white border-slate-200/80 text-slate-600 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon className={`w-4 h-4 ${isActive ? "text-teal-600" : "text-slate-400"}`} />
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />}
              </div>
              <div>
                <span className="text-xs font-bold block leading-tight">
                  {tab.label}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {tab.desc}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 4. CONTEÚDO DA MODALIDADE SELECIONADA */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-xs space-y-6">
        {/* MODALIDADE 1: SIMULADO RÁPIDO */}
        {activeCategory === "RAPIDO" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Simulado Rápido de Tiro Curto
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Treino ágil multidisciplinar com questões oficiais. Defina o volume, ano da prova e duração do cronômetro.
              </p>
            </div>

            {/* Seletor de Anos */}
            <YearSelector
              selectedYears={rapidoYears}
              onChange={setRapidoYears}
              yearCounts={yearCountsMap}
            />

            {/* Range Slider */}
            <QuantityRangeSlider
              value={effectiveRapidoCount}
              onChange={setRapidoCount}
              maxAvailable={filteredQuestionsForRapido.length}
              label="Volume de Questões"
            />

            {/* Cronômetro */}
            <TimerCustomizer
              timerOption={rapidoTimerOption}
              onOptionChange={setRapidoTimerOption}
              customMinutes={rapidoCustomMinutes}
              onCustomMinutesChange={setRapidoCustomMinutes}
              questionCount={effectiveRapidoCount}
            />

            {/* Resumo e CTA */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-sm font-bold text-slate-900 block">
                  Simulado Rápido • {effectiveRapidoCount} {effectiveRapidoCount === 1 ? "questão" : "questões"}
                </span>
                <span className="text-xs text-slate-500">
                  Multidisciplinar • Gabarito no final • {rapidoTimerOption === "FREE" ? "Tempo livre" : `Duração: ${formatMinutesDuration(rapidoTimerOption === "INEP_STANDARD" ? effectiveRapidoCount * 3 : rapidoCustomMinutes)}`}
                </span>
              </div>

              <button
                type="button"
                disabled={filteredQuestionsForRapido.length === 0}
                onClick={() =>
                  handleStartSimulado({
                    ...DEFAULT_SESSION_CONFIG,
                    mode: "SIMULADO",
                    title: `Simulado Rápido (${effectiveRapidoCount} Questões)`,
                    objective: "TREINO_LIVRE",
                    areas: ["ALL"],
                    years: rapidoYears.includes("ALL") ? undefined : (rapidoYears as number[]),
                    quantity: effectiveRapidoCount,
                    feedbackMode: "END_OF_SESSION",
                    timerMode: rapidoTimerOption === "FREE" ? "FREE" : "EXAM_STRICT",
                    customDurationMinutes:
                      rapidoTimerOption === "FREE"
                        ? undefined
                        : rapidoTimerOption === "INEP_STANDARD"
                        ? effectiveRapidoCount * 3
                        : rapidoCustomMinutes,
                  })
                }
                className="px-7 py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all hover:scale-[1.02] cursor-pointer"
              >
                <span>INICIAR SIMULADO</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* MODALIDADE 2: SIMULADO POR GRANDE ÁREA */}
        {activeCategory === "AREA" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Simulado por Grande Área Médica
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Aprofunde seu desempenho em uma área específica, refine por subáreas clínicas e personalize o cronômetro.
              </p>
            </div>

            {/* Seletor das 5 Áreas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {MEDICAL_AREAS.map((area) => {
                const isSelected = selectedArea === area.id;
                const count = questionsCountPerArea[area.id] || 0;
                const Icon = area.icon;

                return (
                  <button
                    key={area.id}
                    type="button"
                    onClick={() => {
                      setSelectedArea(area.id);
                      setAreaSelectedSubareas([]);
                    }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? "bg-teal-50 border-teal-500 text-teal-950 ring-1 ring-teal-500/30 font-semibold shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className={`w-5 h-5 ${isSelected ? "text-teal-600" : "text-slate-400"}`} />
                      <span className="text-xs font-bold text-slate-500">
                        {count} disponíveis
                      </span>
                    </div>
                    <div>
                      <span className="text-sm font-bold block leading-tight">
                        {area.label}
                      </span>
                      <span className="text-[11px] text-slate-500 block mt-1 line-clamp-2">
                        {area.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Filtro de Anos */}
            <YearSelector
              selectedYears={areaYears}
              onChange={setAreaYears}
              yearCounts={yearCountsMap}
            />

            {/* Filtro de Subáreas para a área selecionada */}
            <SubareaSelector
              availableSubareas={availableSubareasForArea}
              selectedSubareas={areaSelectedSubareas}
              onChange={setAreaSelectedSubareas}
            />

            {/* Range Slider de Área */}
            <QuantityRangeSlider
              value={effectiveAreaCount}
              onChange={setAreaQuestionCount}
              maxAvailable={filteredQuestionsForArea.length}
              label={`Volume de Questões (${MEDICAL_AREAS.find((a) => a.id === selectedArea)?.label})`}
            />

            {/* Cronômetro */}
            <TimerCustomizer
              timerOption={areaTimerOption}
              onOptionChange={setAreaTimerOption}
              customMinutes={areaCustomMinutes}
              onCustomMinutesChange={setAreaCustomMinutes}
              questionCount={effectiveAreaCount}
            />

            {/* Resumo e CTA */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-sm font-bold text-slate-900 block">
                  Simulado: {MEDICAL_AREAS.find((a) => a.id === selectedArea)?.label}
                </span>
                <span className="text-xs text-slate-500">
                  {effectiveAreaCount} {effectiveAreaCount === 1 ? "questão" : "questões"} •{" "}
                  {areaSelectedSubareas.length > 0
                    ? `${areaSelectedSubareas.length} subárea(s) filtrada(s)`
                    : "Todas as subáreas"}{" "}
                  • {areaTimerOption === "FREE" ? "Tempo livre" : `Duração: ${formatMinutesDuration(areaTimerOption === "INEP_STANDARD" ? effectiveAreaCount * 3 : areaCustomMinutes)}`}
                </span>
              </div>

              <button
                type="button"
                disabled={filteredQuestionsForArea.length === 0}
                onClick={() =>
                  handleStartSimulado({
                    ...DEFAULT_SESSION_CONFIG,
                    mode: "SIMULADO",
                    title: `Simulado de ${MEDICAL_AREAS.find((a) => a.id === selectedArea)?.label}`,
                    objective: "TREINO_LIVRE",
                    areas: [selectedArea],
                    subareas: areaSelectedSubareas.length > 0 ? areaSelectedSubareas : undefined,
                    years: areaYears.includes("ALL") ? undefined : (areaYears as number[]),
                    quantity: effectiveAreaCount,
                    feedbackMode: "END_OF_SESSION",
                    timerMode: areaTimerOption === "FREE" ? "FREE" : "EXAM_STRICT",
                    customDurationMinutes:
                      areaTimerOption === "FREE"
                        ? undefined
                        : areaTimerOption === "INEP_STANDARD"
                        ? effectiveAreaCount * 3
                        : areaCustomMinutes,
                  })
                }
                className="px-7 py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all hover:scale-[1.02] cursor-pointer"
              >
                <span>INICIAR SIMULADO</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* MODALIDADE 3: SIMULADO GERAL COMPLETO */}
        {activeCategory === "COMPLETO" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Simulado Geral Multidisciplinar
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Simulação ampla com distribuição equilibrada nas 5 grandes áreas médicas. Arraste para escolher o volume e configure o tempo.
              </p>
            </div>

            {/* Seletor de Anos */}
            <YearSelector
              selectedYears={completoYears}
              onChange={setCompletoYears}
              yearCounts={yearCountsMap}
            />

            {/* Range Slider Geral */}
            <QuantityRangeSlider
              value={effectiveCompletoCount}
              onChange={setCompletoCount}
              maxAvailable={filteredQuestionsForCompleto.length}
              label="Volume Global de Questões"
            />

            {/* Cronômetro */}
            <TimerCustomizer
              timerOption={completoTimerOption}
              onOptionChange={setCompletoTimerOption}
              customMinutes={completoCustomMinutes}
              onCustomMinutesChange={setCompletoCustomMinutes}
              questionCount={effectiveCompletoCount}
            />

            {/* Resumo e CTA */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-sm font-bold text-slate-900 block">
                  Simulado Geral • {effectiveCompletoCount} {effectiveCompletoCount === 1 ? "questão" : "questões"}
                </span>
                <span className="text-xs text-slate-500">
                  Multidisciplinar balanceado • Gabarito no final • {completoTimerOption === "FREE" ? "Tempo livre" : `Duração: ${formatMinutesDuration(completoTimerOption === "INEP_STANDARD" ? effectiveCompletoCount * 3 : completoCustomMinutes)}`}
                </span>
              </div>

              <button
                type="button"
                disabled={filteredQuestionsForCompleto.length === 0}
                onClick={() =>
                  handleStartSimulado({
                    ...DEFAULT_SESSION_CONFIG,
                    mode: "SIMULADO",
                    title: `Simulado Geral (${effectiveCompletoCount} Questões)`,
                    objective: "OFICIAIS",
                    areas: ["ALL"],
                    years: completoYears.includes("ALL") ? undefined : (completoYears as number[]),
                    quantity: effectiveCompletoCount,
                    feedbackMode: "END_OF_SESSION",
                    timerMode: completoTimerOption === "FREE" ? "FREE" : "EXAM_STRICT",
                    customDurationMinutes:
                      completoTimerOption === "FREE"
                        ? undefined
                        : completoTimerOption === "INEP_STANDARD"
                        ? effectiveCompletoCount * 3
                        : completoCustomMinutes,
                  })
                }
                className="px-7 py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all hover:scale-[1.02] cursor-pointer"
              >
                <span>INICIAR SIMULADO GERAL</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* MODALIDADE 4: SIMULADO PERSONALIZADO */}
        {activeCategory === "PERSONALIZADO" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Simulado Personalizado com Filtros Avançados
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Monte seu simulado sob medida selecionando as Grandes Áreas, Subáreas clínicas específicas, Ano da prova e duração personalizada do cronômetro.
              </p>
            </div>

            {/* 1. SELEÇÃO DE GRANDES ÁREAS */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-teal-600" />
                  <span>Grandes Áreas Médicas Participantes</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCustomAreas([
                        "CLINICA_MEDICA",
                        "CIRURGIA_GERAL",
                        "PEDIATRIA",
                        "GINECOLOGIA_OBSTETRICIA",
                        "MEDICINA_FAMILIA_COMUNIDADE",
                      ])
                    }
                    className="text-[11px] font-semibold text-teal-600 hover:text-teal-800 cursor-pointer"
                  >
                    Todas
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setCustomAreas(["CLINICA_MEDICA"])}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Apenas Clínica
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {MEDICAL_AREAS.map((a) => {
                  const isSelected = customAreas.includes(a.id);
                  const count = questionsCountPerArea[a.id] || 0;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          if (customAreas.length > 1) {
                            setCustomAreas(customAreas.filter((id) => id !== a.id));
                          }
                        } else {
                          setCustomAreas([...customAreas, a.id]);
                        }
                      }}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                        isSelected
                          ? "bg-teal-50 border-teal-500 text-teal-950 font-bold ring-1 ring-teal-500/30 shadow-2xs"
                          : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      <span className="text-xs block leading-tight">{a.label}</span>
                      <span
                        className={`text-[10px] font-mono ${
                          isSelected ? "text-teal-700 font-bold" : "text-slate-400"
                        }`}
                      >
                        {count} q.
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. FILTRO DE ANOS DA PROVA */}
            <YearSelector
              selectedYears={customYears}
              onChange={setCustomYears}
              yearCounts={yearCountsMap}
            />

            {/* 3. FILTRO DE SUBÁREAS */}
            <SubareaSelector
              availableSubareas={availableSubareasForCustom}
              selectedSubareas={customSelectedSubareas}
              onChange={setCustomSelectedSubareas}
            />

            {/* 4. QUANTIDADE DE QUESTÕES E MODO DE FEEDBACK */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <QuantityRangeSlider
                value={effectiveCustomCount}
                onChange={setCustomCount}
                maxAvailable={filteredQuestionsForCustom.length}
                label="Volume de Questões"
              />

              <div className="space-y-2 p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Modo de Feedback
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Escolha quando deseja visualizar o gabarito e comentários.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCustomFeedbackMode("END_OF_SESSION")}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      customFeedbackMode === "END_OF_SESSION"
                        ? "bg-teal-600 text-white shadow-2xs"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>No Final (Simulação Real)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomFeedbackMode("IMMEDIATE")}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      customFeedbackMode === "IMMEDIATE"
                        ? "bg-teal-600 text-white shadow-2xs"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Imediato (Estudo Ativo)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 5. CRONÔMETRO COM PERSONALIZAÇÃO DO TEMPO */}
            <TimerCustomizer
              timerOption={customTimerOption}
              onOptionChange={setCustomTimerOption}
              customMinutes={customMinutes}
              onCustomMinutesChange={setCustomMinutes}
              questionCount={effectiveCustomCount}
            />

            {/* 6. RESUMO E BOTÃO DE INICIAR */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-sm font-bold text-slate-900 block">
                  Simulado Personalizado • {effectiveCustomCount} {effectiveCustomCount === 1 ? "questão" : "questões"}
                </span>
                <span className="text-xs text-slate-500">
                  {customAreas.length} {customAreas.length === 1 ? "área" : "áreas"} •{" "}
                  {customSelectedSubareas.length > 0
                    ? `${customSelectedSubareas.length} subárea(s)`
                    : "Todas subáreas"}{" "}
                  • {customYears.includes("ALL") ? "Todos os anos" : `${customYears.length} ano(s)`} •{" "}
                  {customTimerOption === "FREE"
                    ? "Tempo livre"
                    : `Duração: ${formatMinutesDuration(customTimerOption === "INEP_STANDARD" ? effectiveCustomCount * 3 : customMinutes)}`}
                </span>
              </div>

              <button
                type="button"
                disabled={filteredQuestionsForCustom.length === 0}
                onClick={() =>
                  handleStartSimulado({
                    ...DEFAULT_SESSION_CONFIG,
                    mode: "SIMULADO",
                    title: "Simulado Personalizado",
                    objective: "TREINO_LIVRE",
                    areas: customAreas.length === 5 ? ["ALL"] : customAreas,
                    subareas: customSelectedSubareas.length > 0 ? customSelectedSubareas : undefined,
                    years: customYears.includes("ALL") ? undefined : (customYears as number[]),
                    quantity: effectiveCustomCount,
                    feedbackMode: customFeedbackMode,
                    timerMode: customTimerOption === "FREE" ? "FREE" : "EXAM_STRICT",
                    customDurationMinutes:
                      customTimerOption === "FREE"
                        ? undefined
                        : customTimerOption === "INEP_STANDARD"
                        ? effectiveCustomCount * 3
                        : customMinutes,
                  })
                }
                className="px-7 py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all hover:scale-[1.02] cursor-pointer"
              >
                <span>INICIAR SIMULADO</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
