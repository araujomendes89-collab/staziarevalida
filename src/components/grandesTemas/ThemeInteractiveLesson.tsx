import React, { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  BookOpen,
  Sparkles,
  Award,
  Zap,
  Clock,
  Flame,
  FileText,
  Volume2,
  ChevronRight,
  ChevronLeft,
  Layers,
  HelpCircle,
  ExternalLink,
  Target,
  AlertOctagon,
  ShieldCheck,
  Bookmark,
  Share2,
  BrainCircuit,
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
  const { setActiveTab, navigateToAiQuestionGenerator } = useApp();
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
  const progressiveModules = [
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
  ];

  const currentModule = progressiveModules[activeStepIndex];
  const progressPercent = Math.round((completedSteps.length / progressiveModules.length) * 100);

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Lista de Grandes Temas
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsBookmarked(!isBookmarked)}
            className={`p-2 rounded-lg border transition ${
              isBookmarked
                ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
            }`}
            title="Salvar nos favoritos"
          >
            <Bookmark className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(window.location.href);
                alert("Link do tema copiado para a área de transferência!");
              }
            }}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition"
            title="Compartilhar tema"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Hero Card for the Grand Theme */}
      <div className="bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-wrap items-center gap-2.5 mb-3">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {tema.areaName}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-red-400" />
            {tema.recurrenceBadgeLabel}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            {tema.estimatedMinutes}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
            {tema.moduleCount} Módulos Integrados
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
          {tema.title}
        </h1>

        <p className="text-zinc-300 text-sm sm:text-base leading-relaxed max-w-3xl mb-6">
          {tema.summary}
        </p>

        {/* Protocol Update Warning if applicable */}
        {tema.hasProtocolUpdate && tema.protocolUpdate && (
          <div className="mb-6">
            <ThemeProtocolUpdateBadge update={tema.protocolUpdate} />
          </div>
        )}

        {/* Interactive Progress & Question Quick Access */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="text-xs text-zinc-400 font-medium">
              Progresso do Estudo: <span className="text-emerald-400 font-bold">{progressPercent}%</span> ({completedSteps.length}/{progressiveModules.length} módulos)
            </div>
            <div className="w-32 sm:w-48 bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() =>
                navigateToAiQuestionGenerator({
                  area: tema.areaName,
                  theme: tema.title,
                })
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-purple-600/20 transition cursor-pointer"
            >
              <BrainCircuit className="w-4 h-4 text-purple-200" />
              <span>Gerar questões deste tema (IA)</span>
            </button>

            <button
              onClick={() => onOpenQuestions(tema.title)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-blue-600/20 transition"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              Treinar Questões ({tema.relatedQuestionsCount})
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation for Lesson Sections */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-1 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTabSection("resumo")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 whitespace-nowrap ${
            activeTabSection === "resumo"
              ? "bg-zinc-800 text-white border border-zinc-700"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Layers className="w-4 h-4 text-blue-400" />
          Módulos Progressivos do Tema (16)
        </button>

        <button
          onClick={() => setActiveTabSection("fluxograma")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 whitespace-nowrap ${
            activeTabSection === "fluxograma"
              ? "bg-zinc-800 text-white border border-zinc-700"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <BookOpen className="w-4 h-4 text-emerald-400" />
          Mapa Visual & Algoritmo Decisório
        </button>

        <button
          onClick={() => setActiveTabSection("inep")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 whitespace-nowrap ${
            activeTabSection === "inep"
              ? "bg-zinc-800 text-white border border-zinc-700"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Target className="w-4 h-4 text-amber-400" />
          Matriz Cognitiva Revalida INEP
        </button>

        <button
          onClick={() => setActiveTabSection("fontes")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 whitespace-nowrap ${
            activeTabSection === "fontes"
              ? "bg-zinc-800 text-white border border-zinc-700"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-purple-400" />
          Fontes Oficiais do SUS
        </button>
      </div>

      {/* Section 1: Progressive Micro-Modules */}
      {activeTabSection === "resumo" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Module Step Selector Sidebar */}
          <div className="lg:col-span-4 space-y-2 bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-3 sm:p-4 max-h-[600px] overflow-y-auto">
            <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-2 py-1 mb-2">
              Estrutura do Estudo (16 Etapas)
            </div>
            {progressiveModules.map((mod, idx) => {
              const isCurrent = activeStepIndex === idx;
              const isDone = completedSteps.includes(idx);

              return (
                <button
                  key={idx}
                  onClick={() => setActiveStepIndex(idx)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs sm:text-sm font-medium transition flex items-start gap-2.5 ${
                    isCurrent
                      ? "bg-blue-600/20 border border-blue-500/40 text-blue-300 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                  }`}
                >
                  <div className="mt-0.5">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <span className={`w-4 h-4 rounded-full border text-[10px] flex items-center justify-center font-bold ${
                        isCurrent ? "border-blue-400 text-blue-300" : "border-zinc-600 text-zinc-500"
                      }`}>
                        {idx + 1}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-semibold text-zinc-200">{mod.title}</div>
                    <div className="text-[11px] text-zinc-500 truncate">{mod.tag}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Module Detail Viewer */}
          <div className="lg:col-span-8 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-lg">
            <div>
              <div className="flex items-center justify-between gap-3 mb-4">
                <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {currentModule.tag}
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  Módulo {activeStepIndex + 1} de {progressiveModules.length}
                </span>
              </div>

              <h2 className="text-xl font-bold text-white mb-2 tracking-tight">
                {currentModule.title}
              </h2>
              <p className="text-xs text-zinc-400 mb-6 italic">
                {currentModule.desc}
              </p>

              <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-5 text-sm text-zinc-300 leading-relaxed space-y-4">
                <p>{currentModule.content}</p>
                <div className="p-3 bg-blue-950/20 border border-blue-900/30 rounded-lg text-xs text-blue-200">
                  💡 <strong>Diretriz Prática:</strong> Priorize memorizar os fluxos oficiais sem extrapolar o enunciado da questão. A banca valoriza condutas de custo-efetividade comprovada.
                </div>
              </div>
            </div>

            {/* Bottom Step Controller */}
            <div className="pt-6 mt-6 border-t border-zinc-800 flex items-center justify-between gap-3">
              <button
                onClick={() => toggleStepCompleted(activeStepIndex)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
                  completedSteps.includes(activeStepIndex)
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {completedSteps.includes(activeStepIndex) ? "Módulo Concluído" : "Marcar como Estudado"}
              </button>

              <div className="flex items-center gap-2">
                <button
                  disabled={activeStepIndex === 0}
                  onClick={() => setActiveStepIndex((prev) => Math.max(0, prev - 1))}
                  className="p-2 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={activeStepIndex === progressiveModules.length - 1}
                  onClick={() => setActiveStepIndex((prev) => Math.min(progressiveModules.length - 1, prev + 1))}
                  className="p-2 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 2: Visual Map & Decision Tree */}
      {activeTabSection === "fluxograma" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                Mapa Visual e Árvore de Decisão Clínica
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Fluxograma mnemônico estruturado para raciocínio rápido durante a prova.
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded bg-zinc-800 text-zinc-400">
              Padrão SUS / INEP
            </span>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 overflow-x-auto font-mono text-xs text-emerald-300 leading-relaxed whitespace-pre">
            {tema.visualTreeMap}
          </div>
        </div>
      )}

      {/* Section 3: INEP Cognitive Matrix Insights */}
      {activeTabSection === "inep" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-400" />
              Padrão de Cobrança na Matriz do Revalida INEP
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Baseado na análise estatística real de {tema.inepInsights.totalQuestionsInDb} questões históricas deste tema.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
              <div className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                Diagnóstico Mais Cobrado
              </div>
              <p className="text-sm font-semibold text-zinc-200">
                {tema.inepInsights.mostTestedDiagnosis}
              </p>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Award className="w-4 h-4" />
                Conduta Gabarito Padronizada
              </div>
              <p className="text-sm font-semibold text-emerald-300">
                {tema.inepInsights.mostTestedConduct}
              </p>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
              <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4" />
                Distratores e Armadilhas Frequentes
              </div>
              <ul className="text-xs text-zinc-300 space-y-1 list-disc list-inside">
                {tema.inepInsights.recurringDistractors.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4">
              <div className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Layers className="w-4 h-4" />
                Provas onde já foi cobrado
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {tema.inepInsights.observedInExams.map((exam, i) => (
                  <span key={i} className="px-2 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {exam}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 4: Official SUS Guidelines & Sources */}
      {activeTabSection === "fontes" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-400" />
              Diretrizes Oficiais e Legislação do SUS
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Documentos oficiais e PCDTs utilizados pela banca examinadora para formular o gabarito.
            </p>
          </div>

          <div className="space-y-3">
            {tema.sources.map((src, i) => (
              <div key={i} className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-200">{src.document}</div>
                  <div className="text-xs text-zinc-500 font-medium mt-0.5">
                    {src.institution} — Edição {src.year}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 whitespace-nowrap">
                  {src.sourceType === "oficial_sus" ? "Documento Oficial SUS" : "Sociedade Médica"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
