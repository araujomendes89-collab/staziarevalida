import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Activity, ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { useAppOptional } from "../../context/AppContext";
import { resolveOnboardingState } from "../../services/onboardingStateResolver";
import { OnboardingPersistenceService } from "../../services/onboardingPersistenceService";
import { validateOnboardingPersonalization } from "../../services/onboardingValidator";
import {
  PersonalizationStepId,
  OnboardingPersonalizationDraft,
  INITIAL_PERSONALIZATION_DRAFT,
  PreparationStage,
  DailyAvailability,
  WeekDay,
  ExamIntent,
} from "./personalizationTypes";
import {
  STAGE_OPTIONS,
  DAILY_AVAILABILITY_OPTIONS,
  WEEK_DAYS_CONFIG,
  MEDICAL_AREAS_OPTIONS,
  EXAM_INTENT_OPTIONS,
} from "./personalizationSteps";
import { PersonalizationOptionCard } from "./PersonalizationOptionCard";
import { PersonalizationProgress } from "./PersonalizationProgress";
import { PersonalizationSummary } from "./PersonalizationSummary";
import { createCarouselSlideVariant, TRANSITION_EASE } from "./motionTokens";

interface OnboardingPersonalizationViewProps {
  onBackToExperience?: () => void;
  onCompletePersonalization?: (draft: OnboardingPersonalizationDraft) => void;
}

export const OnboardingPersonalizationView: React.FC<OnboardingPersonalizationViewProps> = ({
  onBackToExperience,
  onCompletePersonalization,
}) => {
  const navigate = useNavigate();
  const appContext = useAppOptional();
  const user = appContext?.user;
  const firebaseUser = appContext?.firebaseUser;
  const isGuestMode = appContext?.isGuestMode ?? false;
  const profileResolutionStatus = appContext?.profileResolutionStatus ?? "IDLE";
  const prefersReduced = useReducedMotion();
  const isReduced = Boolean(prefersReduced);

  // Local Ephemeral Draft State
  const [draft, setDraft] = useState<OnboardingPersonalizationDraft>(INITIAL_PERSONALIZATION_DRAFT);
  const [currentStep, setCurrentStep] = useState<PersonalizationStepId>("INTRO");
  const [direction, setDirection] = useState<number>(1);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const slideVariant = createCarouselSlideVariant(isReduced);

  // Step indices
  const stepOrder: PersonalizationStepId[] = [
    "INTRO",
    "STAGE",
    "DAILY_TIME",
    "DAYS",
    "WEAK_AREAS",
    "EXAM_INTENT",
    "SUMMARY",
  ];
  const stepIndex = stepOrder.indexOf(currentStep);

  // Map step to question number (1 to 5) for progress bar
  const getQuestionNumber = (): number | null => {
    switch (currentStep) {
      case "STAGE":
        return 1;
      case "DAILY_TIME":
        return 2;
      case "DAYS":
        return 3;
      case "WEAK_AREAS":
        return 4;
      case "EXAM_INTENT":
        return 5;
      default:
        return null;
    }
  };

  const isStepValid = (): boolean => {
    switch (currentStep) {
      case "INTRO":
        return true;
      case "STAGE":
        return draft.preparationStage !== null;
      case "DAILY_TIME":
        return draft.dailyStudyAvailability !== null;
      case "DAYS":
        return draft.variableRoutine || draft.studyDays.length > 0;
      case "WEAK_AREAS":
        return draft.dontKnowWeakAreas || draft.selfReportedWeakAreas.length > 0;
      case "EXAM_INTENT":
        return draft.examIntent !== null;
      case "SUMMARY":
        return true;
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (!isStepValid() || isSaving) return;
    setDirection(1);

    if (currentStep === "INTRO") setCurrentStep("STAGE");
    else if (currentStep === "STAGE") setCurrentStep("DAILY_TIME");
    else if (currentStep === "DAILY_TIME") setCurrentStep("DAYS");
    else if (currentStep === "DAYS") setCurrentStep("WEAK_AREAS");
    else if (currentStep === "WEAK_AREAS") setCurrentStep("EXAM_INTENT");
    else if (currentStep === "EXAM_INTENT") setCurrentStep("SUMMARY");
    else if (currentStep === "SUMMARY") {
      // Evaluate persistent onboarding eligibility
      const isPersistentEligible =
        Boolean(user) &&
        Boolean(firebaseUser) &&
        !isGuestMode &&
        profileResolutionStatus === "READY" &&
        resolveOnboardingState(user).shouldOnboard;

      if (isPersistentEligible && user) {
        const payload = {
          preparationStage: draft.preparationStage,
          dailyStudyAvailability: draft.dailyStudyAvailability,
          studyDays: draft.variableRoutine ? [] : draft.studyDays,
          variableRoutine: draft.variableRoutine,
          selfReportedWeakAreas: draft.dontKnowWeakAreas ? [] : draft.selfReportedWeakAreas,
          dontKnowWeakAreas: draft.dontKnowWeakAreas,
          examIntent: draft.examIntent,
        };

        const validation = validateOnboardingPersonalization(payload);
        if (!validation.success) {
          setError("Por favor, verifique se todas as respostas foram preenchidas corretamente.");
          return;
        }

        setIsSaving(true);
        setError(null);

        try {
          const result = await OnboardingPersistenceService.saveOnboardingPersonalization(
            user.id,
            payload
          );

          if (!isMountedRef.current) return;

          if (result.success) {
            if (onCompletePersonalization) {
              onCompletePersonalization(draft);
            } else {
              navigate("/onboarding/progress-preview", {
                state: {
                  selfReportedWeakAreas: draft.selfReportedWeakAreas,
                  dontKnowWeakAreas: draft.dontKnowWeakAreas,
                },
              });
            }
          } else {
            setIsSaving(false);
            setError("Não foi possível salvar suas respostas. Tente novamente.");
          }
        } catch (err) {
          if (!isMountedRef.current) return;
          setIsSaving(false);
          setError("Não foi possível salvar suas respostas. Tente novamente.");
        }
      } else {
        // Safe preview mode
        if (onCompletePersonalization) {
          onCompletePersonalization(draft);
        } else {
          navigate("/onboarding/progress-preview", {
            state: {
              selfReportedWeakAreas: draft.selfReportedWeakAreas,
              dontKnowWeakAreas: draft.dontKnowWeakAreas,
            },
          });
        }
      }
    }
  };

  const handlePrev = () => {
    setDirection(-1);
    if (currentStep === "INTRO") {
      if (onBackToExperience) onBackToExperience();
      else navigate("/onboarding/experience");
    } else if (currentStep === "STAGE") setCurrentStep("INTRO");
    else if (currentStep === "DAILY_TIME") setCurrentStep("STAGE");
    else if (currentStep === "DAYS") setCurrentStep("DAILY_TIME");
    else if (currentStep === "WEAK_AREAS") setCurrentStep("DAYS");
    else if (currentStep === "EXAM_INTENT") setCurrentStep("WEAK_AREAS");
    else if (currentStep === "SUMMARY") setCurrentStep("EXAM_INTENT");
  };

  // Day toggle handler
  const handleToggleDay = (day: WeekDay) => {
    setDraft((prev) => {
      const exists = prev.studyDays.includes(day);
      const nextDays = exists
        ? prev.studyDays.filter((d) => d !== day)
        : [...prev.studyDays, day];
      return {
        ...prev,
        studyDays: nextDays,
        variableRoutine: false,
      };
    });
  };

  const handleToggleVariableRoutine = () => {
    setDraft((prev) => ({
      ...prev,
      variableRoutine: !prev.variableRoutine,
      studyDays: !prev.variableRoutine ? [] : prev.studyDays,
    }));
  };

  // Weak area toggle handler
  const handleToggleWeakArea = (areaId: string) => {
    setDraft((prev) => {
      const exists = prev.selfReportedWeakAreas.includes(areaId);
      const nextAreas = exists
        ? prev.selfReportedWeakAreas.filter((a) => a !== areaId)
        : [...prev.selfReportedWeakAreas, areaId];
      return {
        ...prev,
        selfReportedWeakAreas: nextAreas,
        dontKnowWeakAreas: false,
      };
    });
  };

  const handleToggleDontKnowWeakAreas = () => {
    setDraft((prev) => ({
      ...prev,
      dontKnowWeakAreas: !prev.dontKnowWeakAreas,
      selfReportedWeakAreas: !prev.dontKnowWeakAreas ? [] : prev.selfReportedWeakAreas,
    }));
  };

  const questionNum = getQuestionNumber();

  return (
    <div className="relative min-h-screen w-full bg-[#06101E] text-slate-100 flex flex-col items-center justify-start overflow-x-hidden selection:bg-teal-500/20 selection:text-teal-200 py-8 px-4 sm:px-6 lg:px-8">
      {/* Background Ambient Highlights */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 65% 45% at 50% 0%, rgba(20, 184, 166, 0.12), rgba(14, 165, 233, 0.05) 50%, transparent 80%)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-xl mx-auto flex flex-col items-center space-y-6 my-auto">
        {/* Top Header */}
        <header className="w-full flex flex-col items-center space-y-4 text-center">
          <div className="w-full flex items-center justify-between">
            <button
              onClick={handlePrev}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800/60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400 cursor-pointer min-h-[36px]"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
              <span>Voltar</span>
            </button>

            {/* Brand Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/60 border border-slate-700/50 shadow-sm backdrop-blur-xs">
              <div className="w-4 h-4 rounded bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center shrink-0">
                <Activity className="w-2.5 h-2.5 text-teal-400" />
              </div>
              <span className="text-[11px] font-bold text-white tracking-tight">
                Stazia<span className="text-teal-400">Med</span>
              </span>
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              <span className="text-[9px] font-black text-teal-400 tracking-wider uppercase">
                PERSONALIZAÇÃO
              </span>
            </div>

            <div className="w-16" aria-hidden="true" />
          </div>

          {/* Thin Progress Bar for Question Steps */}
          {questionNum !== null && (
            <PersonalizationProgress currentQuestionIndex={questionNum} totalQuestions={5} />
          )}
        </header>

        {/* Dynamic Step Content Container */}
        <main className="w-full min-h-[340px] flex items-center justify-center">
          <AnimatePresence custom={direction} mode="popLayout" initial={false}>
            {/* 1. INTRO STEP */}
            {currentStep === "INTRO" && (
              <motion.div
                key="step-intro"
                custom={direction}
                variants={slideVariant}
                initial="enter"
                animate="center"
                exit="exit"
                className="w-full text-center space-y-6 py-4"
              >
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-500/20 text-teal-400 border border-teal-500/30 shadow-lg mb-2">
                  <Sparkles className="w-7 h-7 text-teal-400" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    Agora vamos montar sua preparação.
                  </h1>
                  <p className="text-sm sm:text-base text-slate-300 max-w-md mx-auto leading-relaxed">
                    São só algumas perguntas para entender sua rotina de estudos.
                  </p>
                </div>
              </motion.div>
            )}

            {/* 2. QUESTION 1 — MOMENTO DA PREPARAÇÃO */}
            {currentStep === "STAGE" && (
              <motion.div
                key="step-stage"
                custom={direction}
                variants={slideVariant}
                initial="enter"
                animate="center"
                exit="exit"
                className="w-full space-y-6 text-left"
              >
                <div className="space-y-1.5 text-center">
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    Em que momento da sua preparação você está?
                  </h1>
                  <p className="text-xs text-slate-400">Escolha a opção que melhor te descreve hoje.</p>
                </div>

                <div className="space-y-2.5" role="radiogroup" aria-label="Momento da preparação">
                  {STAGE_OPTIONS.map((opt) => (
                    <PersonalizationOptionCard
                      key={opt.value}
                      id={opt.value}
                      letter={opt.letter}
                      label={opt.label}
                      isSelected={draft.preparationStage === opt.value}
                      onClick={() => setDraft((p) => ({ ...p, preparationStage: opt.value }))}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* 3. QUESTION 2 — TEMPO DISPONÍVEL */}
            {currentStep === "DAILY_TIME" && (
              <motion.div
                key="step-daily-time"
                custom={direction}
                variants={slideVariant}
                initial="enter"
                animate="center"
                exit="exit"
                className="w-full space-y-6 text-left"
              >
                <div className="space-y-1.5 text-center">
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    Quanto tempo você consegue estudar em um dia de estudo?
                  </h1>
                  <p className="text-xs text-slate-400">Uma média estimada para calibrar seu ritmo.</p>
                </div>

                <div className="space-y-2.5" role="radiogroup" aria-label="Tempo disponível">
                  {DAILY_AVAILABILITY_OPTIONS.map((opt) => (
                    <PersonalizationOptionCard
                      key={opt.value}
                      id={opt.value}
                      label={opt.label}
                      isSelected={draft.dailyStudyAvailability === opt.value}
                      onClick={() => setDraft((p) => ({ ...p, dailyStudyAvailability: opt.value }))}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* 4. QUESTION 3 — DIAS DA SEMANA */}
            {currentStep === "DAYS" && (
              <motion.div
                key="step-days"
                custom={direction}
                variants={slideVariant}
                initial="enter"
                animate="center"
                exit="exit"
                className="w-full space-y-6 text-left"
              >
                <div className="space-y-1.5 text-center">
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    Em quais dias você normalmente consegue estudar?
                  </h1>
                  <p className="text-xs text-slate-400">Selecione todos os dias que você costuma reservar.</p>
                </div>

                {/* Day selector pills */}
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2" role="group" aria-label="Dias da semana">
                  {WEEK_DAYS_CONFIG.map((day) => {
                    const isSelected = draft.studyDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        onClick={() => handleToggleDay(day.value)}
                        type="button"
                        role="checkbox"
                        aria-checked={isSelected}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400 min-h-[48px] ${
                          isSelected
                            ? "bg-teal-500 text-slate-950 font-bold border-teal-400 shadow-sm"
                            : "bg-[#132644]/70 border-slate-700/60 text-slate-300 hover:bg-[#162d50]"
                        }`}
                      >
                        <div className="text-xs">{day.label}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Variable routine alternative */}
                <div className="pt-2">
                  <PersonalizationOptionCard
                    id="variable-routine"
                    label="Minha rotina varia muito"
                    sublabel="Não tenho dias fixos durante a semana"
                    isMultiSelect
                    isSelected={draft.variableRoutine}
                    onClick={handleToggleVariableRoutine}
                  />
                </div>
              </motion.div>
            )}

            {/* 5. QUESTION 4 — ÁREAS DE MAIOR DIFICULDADE */}
            {currentStep === "WEAK_AREAS" && (
              <motion.div
                key="step-weak-areas"
                custom={direction}
                variants={slideVariant}
                initial="enter"
                animate="center"
                exit="exit"
                className="w-full space-y-6 text-left"
              >
                <div className="space-y-1.5 text-center">
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    Quais áreas hoje exigem mais atenção de você?
                  </h1>
                  <p className="text-xs text-slate-400">Sua percepção inicial nos ajuda a equilibrar o foco.</p>
                </div>

                <div className="space-y-2.5" role="group" aria-label="Áreas de maior atenção">
                  {MEDICAL_AREAS_OPTIONS.map((area) => (
                    <PersonalizationOptionCard
                      key={area.id}
                      id={area.id}
                      label={area.label}
                      colorAccent={area.color}
                      isMultiSelect
                      isSelected={draft.selfReportedWeakAreas.includes(area.id)}
                      onClick={() => handleToggleWeakArea(area.id)}
                    />
                  ))}

                  <PersonalizationOptionCard
                    id="dont-know-areas"
                    label="Ainda não sei"
                    sublabel="Prefiro descobrir durante as resoluções e simulados"
                    isMultiSelect
                    isSelected={draft.dontKnowWeakAreas}
                    onClick={handleToggleDontKnowWeakAreas}
                  />
                </div>
              </motion.div>
            )}

            {/* 6. QUESTION 5 — OBJETIVO DE PROVA */}
            {currentStep === "EXAM_INTENT" && (
              <motion.div
                key="step-exam-intent"
                custom={direction}
                variants={slideVariant}
                initial="enter"
                animate="center"
                exit="exit"
                className="w-full space-y-6 text-left"
              >
                <div className="space-y-1.5 text-center">
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    Você já sabe para qual edição do Revalida pretende se preparar?
                  </h1>
                  <p className="text-xs text-slate-400">Você poderá ajustar a data oficial exata mais tarde.</p>
                </div>

                <div className="space-y-2.5" role="radiogroup" aria-label="Objetivo de prova">
                  {EXAM_INTENT_OPTIONS.map((opt) => (
                    <PersonalizationOptionCard
                      key={opt.value}
                      id={opt.value}
                      label={opt.label}
                      isSelected={draft.examIntent === opt.value}
                      onClick={() => setDraft((p) => ({ ...p, examIntent: opt.value }))}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* 7. SUMMARY STEP */}
            {currentStep === "SUMMARY" && (
              <div className="w-full space-y-4">
                <PersonalizationSummary draft={draft} />
                {error && (
                  <div
                    data-testid="personalization-error-message"
                    className="text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5 text-center max-w-md mx-auto"
                  >
                    {error}
                  </div>
                )}
              </div>
            )}
          </AnimatePresence>
        </main>

        {/* Persistent Action Footer */}
        <div className="w-full flex items-center justify-end pt-4">
          <button
            onClick={handleNext}
            disabled={!isStepValid() || isSaving}
            data-testid="personalization-next-cta"
            type="button"
            className={`group inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white transition-all rounded-xl shadow-lg min-h-[48px] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-400 ${
              !isStepValid() || isSaving
                ? "bg-slate-800/80 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-50 shadow-none"
                : currentStep === "INTRO" || currentStep === "SUMMARY"
                ? "bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 shadow-teal-500/25 hover:shadow-teal-500/40 cursor-pointer"
                : "bg-teal-600 hover:bg-teal-500 shadow-teal-600/25 hover:shadow-teal-600/40 cursor-pointer"
            }`}
          >
            <span>
              {isSaving
                ? "Salvando..."
                : currentStep === "SUMMARY"
                ? "Continuar"
                : "Continuar"}
            </span>
            {!isSaving && (
              <ArrowRight className="w-4 h-4 text-teal-100 group-hover:translate-x-0.5 transition-transform" />
            )}
          </button>
        </div>

        {/* Subtle Bottom System Watermark */}
        <footer className="pt-4 text-center text-xs text-slate-500 font-medium">
          StaziaMed Revalida • Personalização Inicial
        </footer>
      </div>
    </div>
  );
};

export default OnboardingPersonalizationView;
