import React, { useState, useMemo } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  BookOpen,
  Sparkles,
  Award,
  Zap,
  Clock,
  Flame,
  ChevronRight,
  ChevronLeft,
  Layers,
  Target,
  AlertOctagon,
  ShieldCheck,
  Bookmark,
  Share2,
  BrainCircuit,
  RotateCcw,
  Check,
} from "lucide-react";
import { GrandeTema } from "../../types/grandesTemas";
import { ThemeProtocolUpdateBadge } from "./ThemeProtocolUpdateBadge";
import { useApp } from "../../context/AppContext";

interface Props {
  tema: GrandeTema;
  onBack: () => void;
  onOpenQuestions: (themeTitle: string) => void;
}

export const ThemeInteractiveLesson: React.FC<Props> = ({ tema, onBack, onOpenQuestions }) => {
  const { navigateToAiQuestionGenerator } = useApp();
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [activeTabSection, setActiveTabSection] = useState<"resumo" | "fluxograma" | "inep" | "fontes">("resumo");

  const toggleStepCompleted = (index: number) => {
    if (completedSteps.includes(index)) {
      setCompletedSteps(completedSteps.filter((i) => i !== index));
    } else {
      setCompletedSteps([...completedSteps, index]);
    }
  };

  // Generate dynamic 16 structured progressive micro-modules based on the theme's core knowledge
  const progressiveModules = useMemo(() => [
    {
      num: 1,
      title: "1. Enquadramento e Relevância no Revalida INEP",
      desc: "Compreensão da matriz de competência do INEP e frequência histórica deste agravo nas provas objetivas e discursivas.",
      content: `O tema "${tema.title}" representa um dos pilares da área de ${tema.areaName}. A banca examinadora cobra não apenas a identificação diagnóstica rápida, mas principalmente o seguimento estrito dos protocolos oficiais do Ministério da Saúde e do SUS.`,
      tag: "Matriz INEP",
    },
    {
      num: 2,
      title: "2. Definição Conceitual e Critérios Diagnósticos",
      desc: "Conceitos fundamentais, pontos de corte quantitativos e critérios diagnósticos padronizados.",
      content: tema.summary,
      tag: "Conceito Chave",
    },
    {
      num: 3,
      title: "3. Epidemiologia, Fatores de Risco e Prevenção",
      desc: "Grupos vulneráveis, determinantes sociais em saúde e estratificação de risco.",
      content: `Identificar os fatores de risco clássicos descritos nos enunciados do Revalida: comorbidades prévias, histórico familiar, vulnerabilidade socioeconômica e exposições ambientais ou ocupacionais relevantes.`,
      tag: "Epidemiologia",
    },
    {
      num: 4,
      title: "4. Apresentação Clínica e Sinais de Alerta",
      desc: "Quadro sindrômico típico, sintomas cardinais e 'red flags' que exigem intervenção imediata.",
      content: `No Revalida INEP, o caso clínico comumente traz uma apresentação clássica: ${tema.inepInsights.patientProfiles[0] || "paciente padrão com sintomas exuberantes e sinais de alarme"}.`,
      tag: "Semiologia",
    },
    {
      num: 5,
      title: "5. Investigação Diagnóstica e Exames Complementares",
      desc: "Indicação correta, sequência de solicitação e interpretação de achados laboratoriais e de imagem.",
      content: `Racionalidade diagnóstica no SUS: solicitar prioritariamente exames de alta sensibilidade na triagem e exames confirmatórios de alta especificidade, evitando testes redundantes ou iatrogênicos.`,
      tag: "Diagnóstico",
    },
    {
      num: 6,
      title: "6. Diagnóstico Diferencial Crítico",
      desc: "Distinção rápida entre condições que compartilham sinais semelhantes mas exigem condutas opostas.",
      content: `Atenção aos distratores mais recorrentes da banca: ${tema.inepInsights.recurringDistractors.join(" | ") || "condições semelhantes que diferem pelo tempo de evolução ou resposta terapêutica"}.`,
      tag: "Diferencial",
    },
    {
      num: 7,
      title: "7. Estratificação de Risco e Gravidade",
      desc: "Escores validados (ex: CURB-65, Alvarado, Bishop, Glasgow) e critérios de internação hospitalar ou UTI.",
      content: `A aplicação correta dos escores clínicos define a via de cuidado: manejo ambulatorial na APS vs internação em enfermaria vs estabilização imediata na sala vermelha/UTI.`,
      tag: "Escores Clínicos",
    },
    {
      num: 8,
      title: "8. Conduta Terapêutica de Primeira Linha (Padrão-Ouro SUS)",
      desc: "Medicamentos de escolha, doses de ataque/manutenção e vias de administração preconizadas pelo MS.",
      content: `Conduta gabarito: ${tema.inepInsights.mostTestedConduct}.`,
      tag: "Gabarito Ouro",
    },
    {
      num: 9,
      title: "9. Manejo de Emergência e Situações Críticas",
      desc: "Protocolo ABCDE, choque, falência orgânica e suporte avançado de vida.",
      content: `Estabilização prioritária antes de qualquer procedimento secundário. Na emergência, garantir via aérea pérvia, oxigenação adequada, acesso venoso calibroso e monitorização contínua.`,
      tag: "Emergência",
    },
    {
      num: 10,
      title: "10. Cuidados Especiais em Populações Específicas",
      desc: "Gestantes, lactantes, idosos com polifarmácia, imunossuprimidos e insuficiência renal/hepática.",
      content: `Ajuste de doses pela função renal (ClCr) e restrições farmacológicas em gestantes (evitar drogas teratogênicas como IECA/BRA na hipertensão gestacional).`,
      tag: "Populações Especiais",
    },
    {
      num: 11,
      title: "11. Procedimentos Práticos e Habilidades Clínicas (OSCE)",
      desc: "Checklist de técnicas, consentimento informado, biossegurança e comunicação empática.",
      content: `Aspectos testados na 2ª Fase (Prova Prática): higienização das mãos, paramentação estéril, explicação clara do procedimento ao paciente e técnica asséptica rigorosa.`,
      tag: "Prova Prática",
    },
    {
      num: 12,
      title: "12. Notificação Compulsória e Vigilância Epidemiológica",
      desc: "Ficha de Notificação do SINAN, prazos de envio (imediata em 24h vs semanal) e medidas de bloqueio.",
      content: `Verificar se a patologia integra a Lista Nacional de Notificação Compulsória. Notifica-se na mera suspeita clínica sem aguardar confirmação de exames sorológicos ou de cultura.`,
      tag: "Vigilância SUS",
    },
    {
      num: 13,
      title: "13. Acompanhamento, Seguimento e Critérios de Alta",
      desc: "Controle de cura, periodicidade de consultas na APS e reabilitação funcional.",
      content: `Planejamento da alta hospitalar com contrarreferência detalhada para a Equipe de Saúde da Família (eSF) garantindo a longitudinalidade do cuidado e adesão medicamentosa.`,
      tag: "Seguimento APS",
    },
    {
      num: 14,
      title: "14. Erros Clássicos e Pegadinhas da Banca INEP",
      desc: "Armadilhas frequentes em enunciados longos e alternativas com generalizações indevidas.",
      content: `A banca frequentemente utiliza alternativas com termos absolutos ('sempre', 'nunca') ou propõe exames invasivos desnecessários em pacientes assintomáticos. Foco na racionalidade clínica.`,
      tag: "Pegadinhas INEP",
    },
    {
      num: 15,
      title: "15. Padrão Decisório e Resumo Visual (Flash-Review)",
      desc: "Síntese dos nós de decisão e conexões lógicas para fixação rápida na memória de longo prazo.",
      content: `Diagnóstico mais cobrado: ${tema.inepInsights.mostTestedDiagnosis}. Sempre atentar para a sequência lógica: Estabilizar → Diagnosticar → Tratar na dose correta → Notificar se compulsório.`,
      tag: "Síntese Rápida",
    },
    {
      num: 16,
      title: "16. Treinamento com Questões Oficiais e Inéditas",
      desc: "Fixação prática através do motor de inteligência adaptativa de questões do Revalida.",
      content: `Teste seus conhecimentos agora com as ${tema.relatedQuestionsCount} questões cadastradas especificamente para este tema, monitorando sua taxa de acerto por área.`,
      tag: "Fixação Ativa",
    },
  ], [tema]);

  const currentModule = progressiveModules[activeStepIndex];
  const progressPercent = Math.round((completedSteps.length / progressiveModules.length) * 100);
  const isFullyCompleted = completedSteps.length === progressiveModules.length;

  // Next uncompleted step logic for "Continuar Estudo"
  const nextUncompletedIndex = useMemo(() => {
    const idx = progressiveModules.findIndex((_, i) => !completedSteps.includes(i));
    return idx !== -1 ? idx : 0;
  }, [completedSteps, progressiveModules]);

  const handlePrimaryCtaClick = () => {
    setActiveTabSection("resumo");
    setActiveStepIndex(nextUncompletedIndex);
  };

  const handleAdvance = () => {
    if (activeStepIndex < progressiveModules.length - 1) {
      setActiveStepIndex(activeStepIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (activeStepIndex > 0) {
      setActiveStepIndex(activeStepIndex - 1);
    }
  };

  return (
    <div className="space-y-6 pb-20 max-w-6xl mx-auto">
      {/* 1. TOP BAR */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
          <span>Voltar para Grandes Temas</span>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsBookmarked(!isBookmarked)}
            className={`p-2 rounded-xl border transition-colors cursor-pointer text-xs ${
              isBookmarked
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-white border-slate-200 text-slate-500 hover:text-slate-800"
            }`}
            title="Salvar nos favoritos"
          >
            <Bookmark className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(window.location.href);
              }
            }}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer text-xs"
            title="Copiar link do tema"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. COMPACT THEME HERO HEADER */}
      <div className="bg-gradient-to-br from-[#0B192C] via-[#10243E] to-[#0A1A2F] text-white border border-[#1B355A] rounded-3xl p-6 sm:p-7 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                {tema.areaName}
              </span>
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-white/10 text-slate-200 border border-white/10 flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" />
                <span>Recorrência histórica: {tema.recurrence === "altissima" ? "Altíssima" : tema.recurrence === "alta" ? "Alta" : "Média"}</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-white/10 text-slate-300 border border-white/10 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>~{tema.estimatedMinutes}</span>
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {tema.title}
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed line-clamp-2">
              {tema.summary}
            </p>

            {/* Protocol Update Warning if applicable */}
            {tema.hasProtocolUpdate && tema.protocolUpdate && (
              <div className="pt-1">
                <ThemeProtocolUpdateBadge update={tema.protocolUpdate} />
              </div>
            )}
          </div>

          {/* Primary CTA & Progress Box */}
          <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3 min-w-[240px] shrink-0">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Progresso do Tema</span>
                <span className="font-bold text-teal-400">
                  {completedSteps.length} de 16 ({progressPercent}%)
                </span>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <button
              onClick={handlePrimaryCtaClick}
              className="w-full py-2.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-xs cursor-pointer"
            >
              {isFullyCompleted ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Revisar Tema</span>
                </>
              ) : completedSteps.length === 0 ? (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Começar Tema</span>
                </>
              ) : (
                <>
                  <span>Continuar Estudo</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 3. SECTION NAVIGATION PILLS */}
      <div className="flex items-center gap-1.5 bg-slate-100/90 border border-slate-200/80 p-1 rounded-2xl overflow-x-auto">
        <button
          onClick={() => setActiveTabSection("resumo")}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTabSection === "resumo"
              ? "bg-teal-600 text-white font-bold shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-white"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Trilha de Estudo (16 Módulos)</span>
        </button>

        <button
          onClick={() => setActiveTabSection("fluxograma")}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTabSection === "fluxograma"
              ? "bg-teal-600 text-white font-bold shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-white"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Mapa Visual & Árvore Decisória</span>
        </button>

        <button
          onClick={() => setActiveTabSection("inep")}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTabSection === "inep"
              ? "bg-teal-600 text-white font-bold shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-white"
          }`}
        >
          <Target className="w-3.5 h-3.5" />
          <span>Matriz Cognitiva do Tema</span>
        </button>

        <button
          onClick={() => setActiveTabSection("fontes")}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTabSection === "fontes"
              ? "bg-teal-600 text-white font-bold shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-white"
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Fontes Oficiais do SUS</span>
        </button>
      </div>

      {/* 4. MAIN WORKSPACE */}
      {activeTabSection === "resumo" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Lightweight Stepper Trail (16 Modules) */}
          <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-2 max-h-[640px] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Estrutura do Estudo
              </span>
              <span className="text-[10px] font-semibold text-slate-500">
                {completedSteps.length}/16 Concluídos
              </span>
            </div>

            <div className="space-y-1 pt-1">
              {progressiveModules.map((mod, idx) => {
                const isCurrent = activeStepIndex === idx;
                const isDone = completedSteps.includes(idx);

                return (
                  <button
                    key={idx}
                    onClick={() => setActiveStepIndex(idx)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-all flex items-start gap-2.5 cursor-pointer ${
                      isCurrent
                        ? "bg-teal-50 border border-teal-200/80 text-teal-900 shadow-2xs font-bold"
                        : isDone
                        ? "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <span
                          className={`w-4 h-4 rounded-full border text-[10px] flex items-center justify-center font-bold ${
                            isCurrent
                              ? "border-teal-600 bg-teal-600 text-white"
                              : "border-slate-300 text-slate-400"
                          }`}
                        >
                          {idx + 1}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs">{mod.title}</div>
                      <div className="text-[10px] text-slate-400 truncate">{mod.tag}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Active Module Focused Reader */}
          <div className="lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200/60">
                  {currentModule.tag}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Módulo {activeStepIndex + 1} de {progressiveModules.length}
                </span>
              </div>

              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  {currentModule.title}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 italic">
                  {currentModule.desc}
                </p>
              </div>

              {/* Module Text Content */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-5 text-sm text-slate-700 leading-relaxed space-y-4">
                <p className="whitespace-pre-line">{currentModule.content}</p>

                <div className="p-3.5 bg-blue-50/80 border border-blue-200/60 rounded-xl text-xs text-blue-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-blue-950">
                    <span>💡 Diretriz Prática para a Prova:</span>
                  </div>
                  <p className="text-blue-800">
                    Priorize memorizar os fluxos e condutas oficiais do SUS. A banca examinadora do Revalida INEP valoriza decisões com custo-efetividade comprovada e seguimento estrito de protocolos.
                  </p>
                </div>
              </div>
            </div>

            {/* Stepper Navigation Footer */}
            <div className="pt-4 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => toggleStepCompleted(activeStepIndex)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  completedSteps.includes(activeStepIndex)
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>
                  {completedSteps.includes(activeStepIndex) ? "Módulo Concluído" : "Marcar como Estudado"}
                </span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={activeStepIndex === 0}
                  onClick={handlePrevious}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1 border border-slate-200"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>

                <button
                  type="button"
                  onClick={handleAdvance}
                  disabled={activeStepIndex === progressiveModules.length - 1}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>Próximo</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. RECURSO: MAPA VISUAL & ÁRVORE DECISÓRIA */}
      {activeTabSection === "fluxograma" && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-teal-600" />
                <span>Mapa Visual e Árvore de Decisão Clínica</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Fluxograma mnemônico estruturado para raciocínio rápido durante a prova.
              </p>
            </div>
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
              Padrão SUS / INEP
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 overflow-x-auto font-mono text-xs text-emerald-400 leading-relaxed whitespace-pre">
            {tema.visualTreeMap}
          </div>
        </div>
      )}

      {/* 6. RECURSO: MATRIZ COGNITIVA DO TEMA */}
      {activeTabSection === "inep" && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 space-y-5 shadow-xs">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-500" />
              <span>Matriz Cognitiva do Tema</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Padrão de cobrança estatística no Revalida INEP com base nas questões cadastradas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="text-[11px] font-bold text-teal-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>Diagnóstico Mais Cobrado</span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-900">
                {tema.inepInsights.mostTestedDiagnosis}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-emerald-600" />
                <span>Conduta Gabarito Padronizada</span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-emerald-800">
                {tema.inepInsights.mostTestedConduct}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                <span>Distratores e Armadilhas Frequentes</span>
              </div>
              <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
                {tema.inepInsights.recurringDistractors.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="text-[11px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-600" />
                <span>Provas onde já foi cobrado</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {tema.inepInsights.observedInExams.map((exam, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white text-slate-700 border border-slate-200">
                    {exam}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. RECURSO: FONTES OFICIAIS DO SUS */}
      {activeTabSection === "fontes" && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xs">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-600" />
              <span>Diretrizes Oficiais e Legislação do SUS</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Documentos oficiais e PCDTs utilizados pela banca examinadora como referência.
            </p>
          </div>

          <div className="space-y-2.5">
            {tema.sources.map((src, i) => (
              <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs sm:text-sm font-bold text-slate-900">{src.document}</div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">
                    {src.institution} — Edição {src.year}
                  </div>
                </div>
                <span className="self-start sm:self-auto px-2.5 py-1 rounded-md text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200/60 whitespace-nowrap">
                  {src.sourceType === "oficial_sus" ? "Documento Oficial SUS" : "Sociedade Médica"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8. ACTIONS AT THE BOTTOM: PRATICAR & IA */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-900">
            Fixação Ativa deste Tema
          </h3>
          <p className="text-xs text-slate-500">
            Exercite o raciocínio clínico com questões oficiais comentadas do Revalida INEP.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              navigateToAiQuestionGenerator({
                area: tema.areaName,
                theme: tema.title,
              })
            }
            className="px-4 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <BrainCircuit className="w-4 h-4 text-purple-600" />
            <span>Gerar com IA</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenQuestions(tema.title)}
            className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Zap className="w-4 h-4 text-amber-300" />
            <span>Praticar Questões ({tema.relatedQuestionsCount})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
