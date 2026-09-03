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
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { formatMedicalArea } from "../../utils/formatters";
import { SessionBuilderService, DEFAULT_SESSION_CONFIG } from "../../services/sessionBuilderService";
import { QuestionSessionConfig, ActiveTrainingSession, MedicalArea } from "../../types";

const MEDICAL_AREAS: {
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

  // Area Config
  const [selectedArea, setSelectedArea] = useState<MedicalArea>("CLINICA_MEDICA");
  const [areaQuestionCount, setAreaQuestionCount] = useState<number>(20);

  // Completo Config
  const [completoCount, setCompletoCount] = useState<number>(50);

  // Personalizado Config
  const [customAreas, setCustomAreas] = useState<MedicalArea[]>([
    "CLINICA_MEDICA",
    "CIRURGIA_GERAL",
    "PEDIATRIA",
    "GINECOLOGIA_OBSTETRICIA",
    "MEDICINA_FAMILIA_COMUNIDADE",
  ]);
  const [customCount, setCustomCount] = useState<number>(30);
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

  // Dynamic available counts
  const availableInSelectedArea = questionsCountPerArea[selectedArea] || 0;
  const availableInCustomAreas = useMemo(() => {
    return questions.filter((q) => customAreas.includes(q.area)).length;
  }, [questions, customAreas]);

  // Safe effective values bounded by available questions
  const effectiveRapidoCount = Math.max(1, Math.min(rapidoCount, Math.min(100, totalQuestionsInBank) || 1));
  const effectiveAreaCount = Math.max(1, Math.min(areaQuestionCount, Math.min(100, availableInSelectedArea) || 1));
  const effectiveCompletoCount = Math.max(1, Math.min(completoCount, Math.min(100, totalQuestionsInBank) || 1));
  const effectiveCustomCount = Math.max(1, Math.min(customCount, Math.min(100, availableInCustomAreas) || 1));

  // Auto-adjust area count if area changes
  useEffect(() => {
    const maxForArea = Math.min(100, availableInSelectedArea);
    if (areaQuestionCount > maxForArea && maxForArea > 0) {
      setAreaQuestionCount(maxForArea);
    }
  }, [selectedArea, availableInSelectedArea]);

  // Auto-adjust custom count if custom areas change
  useEffect(() => {
    const maxForCustom = Math.min(100, availableInCustomAreas);
    if (customCount > maxForCustom && maxForCustom > 0) {
      setCustomCount(maxForCustom);
    }
  }, [customAreas, availableInCustomAreas]);

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
                Treino ágil multidisciplinar com questões oficiais das 5 grandes áreas. Arraste o controle para definir o volume de questões.
              </p>
            </div>

            {/* Range Slider */}
            <QuantityRangeSlider
              value={effectiveRapidoCount}
              onChange={setRapidoCount}
              maxAvailable={totalQuestionsInBank}
              label="Volume de Questões"
            />

            {/* Resumo e CTA */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-sm font-bold text-slate-900 block">
                  Simulado Rápido • {effectiveRapidoCount} {effectiveRapidoCount === 1 ? "questão" : "questões"}
                </span>
                <span className="text-xs text-slate-500">
                  Multidisciplinar • Gabarito no final • Tempo estimado: ~{effectiveRapidoCount * 2} min
                </span>
              </div>

              <button
                type="button"
                disabled={totalQuestionsInBank === 0}
                onClick={() =>
                  handleStartSimulado({
                    ...DEFAULT_SESSION_CONFIG,
                    mode: "SIMULADO",
                    title: `Simulado Rápido (${effectiveRapidoCount} Questões)`,
                    objective: "TREINO_LIVRE",
                    areas: ["ALL"],
                    quantity: effectiveRapidoCount,
                    feedbackMode: "END_OF_SESSION",
                    timerMode: "EXAM_STRICT",
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
                Aprofunde seu desempenho em uma área específica para consolidar condutas clínicas.
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
                    onClick={() => setSelectedArea(area.id)}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? "bg-teal-50 border-teal-500 text-teal-950 ring-1 ring-teal-500/30 font-semibold"
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

            {/* Range Slider de Área */}
            <QuantityRangeSlider
              value={effectiveAreaCount}
              onChange={setAreaQuestionCount}
              maxAvailable={availableInSelectedArea}
              label={`Questões de ${MEDICAL_AREAS.find((a) => a.id === selectedArea)?.label}`}
            />

            {/* Resumo e CTA */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-sm font-bold text-slate-900 block">
                  Simulado: {MEDICAL_AREAS.find((a) => a.id === selectedArea)?.label}
                </span>
                <span className="text-xs text-slate-500">
                  {effectiveAreaCount} {effectiveAreaCount === 1 ? "questão" : "questões"} • Gabarito no final • Tempo estimado: ~{effectiveAreaCount * 2} min
                </span>
              </div>

              <button
                type="button"
                disabled={availableInSelectedArea === 0}
                onClick={() =>
                  handleStartSimulado({
                    ...DEFAULT_SESSION_CONFIG,
                    mode: "SIMULADO",
                    title: `Simulado de ${MEDICAL_AREAS.find((a) => a.id === selectedArea)?.label}`,
                    objective: "TREINO_LIVRE",
                    areas: [selectedArea],
                    quantity: effectiveAreaCount,
                    feedbackMode: "END_OF_SESSION",
                    timerMode: "EXAM_STRICT",
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
                Simulação ampla com distribuição equilibrada nas 5 grandes áreas médicas. Arraste para escolher o volume desejado.
              </p>
            </div>

            {/* Range Slider Geral */}
            <QuantityRangeSlider
              value={effectiveCompletoCount}
              onChange={setCompletoCount}
              maxAvailable={totalQuestionsInBank}
              label="Volume Global de Questões"
            />

            {/* Resumo e CTA */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-sm font-bold text-slate-900 block">
                  Simulado Geral • {effectiveCompletoCount} {effectiveCompletoCount === 1 ? "questão" : "questões"}
                </span>
                <span className="text-xs text-slate-500">
                  Multidisciplinar balanceado • Gabarito no final • Tempo estimado: ~{effectiveCompletoCount * 2} min
                </span>
              </div>

              <button
                type="button"
                disabled={totalQuestionsInBank === 0}
                onClick={() =>
                  handleStartSimulado({
                    ...DEFAULT_SESSION_CONFIG,
                    mode: "SIMULADO",
                    title: `Simulado Geral (${effectiveCompletoCount} Questões)`,
                    objective: "OFICIAIS",
                    areas: ["ALL"],
                    quantity: effectiveCompletoCount,
                    feedbackMode: "END_OF_SESSION",
                    timerMode: "EXAM_STRICT",
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
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Simulado Personalizado
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Monte seu caderno de simulado definindo as áreas médicas participantes, volume de questões pelo slider e modo de feedback.
              </p>
            </div>

            {/* Seleção de Áreas */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Áreas Médicas Participantes
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {MEDICAL_AREAS.map((a) => {
                  const isSelected = customAreas.includes(a.id);
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
                      className={`p-2.5 rounded-xl border text-center text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? "bg-teal-50 border-teal-500 text-teal-950 ring-1 ring-teal-500/30"
                          : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Range Slider e Modo de Feedback */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <QuantityRangeSlider
                value={effectiveCustomCount}
                onChange={setCustomCount}
                maxAvailable={availableInCustomAreas}
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
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      customFeedbackMode === "END_OF_SESSION"
                        ? "bg-teal-600 text-white shadow-2xs"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    No Final (Prova)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomFeedbackMode("IMMEDIATE")}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      customFeedbackMode === "IMMEDIATE"
                        ? "bg-teal-600 text-white shadow-2xs"
                        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    Imediato (Estudo)
                  </button>
                </div>
              </div>
            </div>

            {/* Resumo e CTA */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-sm font-bold text-slate-900 block">
                  Simulado Personalizado • {effectiveCustomCount} {effectiveCustomCount === 1 ? "questão" : "questões"}
                </span>
                <span className="text-xs text-slate-500">
                  {customAreas.length} {customAreas.length === 1 ? "área selecionada" : "áreas selecionadas"} •{" "}
                  {customFeedbackMode === "END_OF_SESSION" ? "Gabarito no final" : "Feedback imediato"}
                </span>
              </div>

              <button
                type="button"
                disabled={availableInCustomAreas === 0}
                onClick={() =>
                  handleStartSimulado({
                    ...DEFAULT_SESSION_CONFIG,
                    mode: "SIMULADO",
                    title: "Simulado Personalizado",
                    objective: "TREINO_LIVRE",
                    areas: customAreas.length === 5 ? ["ALL"] : customAreas,
                    quantity: effectiveCustomCount,
                    feedbackMode: customFeedbackMode,
                    timerMode: customFeedbackMode === "END_OF_SESSION" ? "EXAM_STRICT" : "FREE",
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
