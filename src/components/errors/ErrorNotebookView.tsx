import React, { useState } from "react";
import {
  AlertOctagon,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Filter,
  Brain,
  Layers,
  FileQuestion,
  BookOpen,
  Edit3,
  Check,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { AdaptiveEngine } from "../../services/adaptiveEngine";
import { ErrorTaxonomy, MedicalArea } from "../../types";

const TAXONOMY_OPTIONS: { id: ErrorTaxonomy; label: string; desc: string }[] = [
  { id: "DISTRACTOR_TRAP", label: "Pegadinha / Distrator", desc: "Alternativa atraente com termo incorreto" },
  { id: "KNOWLEDGE_GAP", label: "Lacuna Teórica", desc: "Conceito fisiopatológico ou critério esquecido" },
  { id: "DIAGNOSIS_VS_CONDUCT", label: "Diagnóstico vs Conduta", desc: "Acertou o quadro clínico, mas errou a conduta ouro" },
  { id: "READING_HASTE", label: "Desatenção / Leitura Rápida", desc: "Não notou palavra-chave (ex: 'exceto', 'incorreta')" },
  { id: "PROTOCOL_CONFUSION", label: "Protocolo SUS", desc: "Confusão entre linha de cuidado municipal/estadual" },
  { id: "ELIMINATED_RIGHT_ANSWER", label: "Trocou a Certa", desc: "Estava na dúvida entre duas e marcou a errada" },
  { id: "TIME_PRESSURE", label: "Pressão de Tempo", desc: "Respondeu com pressa devido ao cronômetro" },
  { id: "OUTDATED_GUIDELINE", label: "Diretriz Antiga", desc: "Aplicou conduta anterior à atualização recente" },
];

export const ErrorNotebookView: React.FC = () => {
  const {
    attempts,
    questions,
    setActiveTab,
    setActiveQuestionIndex,
    setQuestionFilterArea,
  } = useApp();

  const [selectedAreaFilter, setSelectedAreaFilter] = useState<MedicalArea | "ALL">("ALL");
  const [selectedTaxonomyFilter, setSelectedTaxonomyFilter] = useState<ErrorTaxonomy | "ALL">("ALL");
  const [editingAttemptId, setEditingAttemptId] = useState<string | null>(null);
  const [customTaxonomies, setCustomTaxonomies] = useState<Record<string, ErrorTaxonomy>>({});
  const [flashcardCreatedSet, setFlashcardCreatedSet] = useState<Set<string>>(new Set());

  const { persistentErrors, returnedErrors, newErrors, byTaxonomy } =
    AdaptiveEngine.categorizeErrors(attempts);

  const wrongAttempts = attempts.filter((a) => !a.isCorrect);

  const filteredWrongAttempts = wrongAttempts.filter((att) => {
    const q = questions.find((item) => item.id === att.questionId);
    if (!q) return false;
    if (selectedAreaFilter !== "ALL" && q.area !== selectedAreaFilter) return false;
    
    const effectiveTaxonomy = customTaxonomies[att.id] || att.errorTaxonomy || "DISTRACTOR_TRAP";
    if (selectedTaxonomyFilter !== "ALL" && effectiveTaxonomy !== selectedTaxonomyFilter) return false;

    return true;
  });

  const handleUpdateTaxonomy = (attemptId: string, taxonomy: ErrorTaxonomy) => {
    setCustomTaxonomies((prev) => ({ ...prev, [attemptId]: taxonomy }));
    setEditingAttemptId(null);
  };

  const handleCreateFlashcard = (attemptId: string) => {
    setFlashcardCreatedSet((prev) => new Set(prev).add(attemptId));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 sm:p-7 rounded-3xl bg-[#0e1322] border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <AlertOctagon className="w-5 h-5 text-amber-400" />
            <span className="text-[10px] font-bold text-amber-300 uppercase tracking-widest bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/40">
              Caderno de Erros & Autópsia Clínica
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Autópsia do Raciocínio & Diagnóstico de Lacunas
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl leading-relaxed">
            Identifique se o erro ocorreu por lacuna teórica, distrator da banca ou desatenção, e execute a ação corretiva imediata.
          </p>
        </div>

        <button
          onClick={() => setActiveTab("review")}
          id="error-notebook-flashcards-btn"
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-slate-900 font-bold text-xs hover:bg-slate-100 hover:scale-[1.02] transition-all active:scale-95 shadow-lg shrink-0 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 text-indigo-600" />
          <span>REVISAR FLASHCARDS DE ERROS</span>
        </button>
      </div>

      {/* 4 Diagnostic Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-5 rounded-2xl bg-[#141220] border border-red-500/30 shadow-md">
          <span className="text-xs font-bold text-red-400 block mb-1">
            Erros Persistentes
          </span>
          <span className="text-3xl font-black text-white">
            {persistentErrors.length}
          </span>
          <p className="text-xs text-slate-400 mt-1">
            Reincidentes em ≥2 sessões
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0e1b1f] border border-emerald-500/30 shadow-md">
          <span className="text-xs font-bold text-emerald-400 block mb-1">
            Erros Consolidados
          </span>
          <span className="text-3xl font-black text-white">
            {attempts.filter((a) => a.isCorrect).length}
          </span>
          <p className="text-xs text-slate-400 mt-1">
            Superados em retestes
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#1b1712] border border-amber-500/30 shadow-md">
          <span className="text-xs font-bold text-amber-400 block mb-1">
            Erros de Retenção
          </span>
          <span className="text-3xl font-black text-white">
            {returnedErrors.length}
          </span>
          <p className="text-xs text-slate-400 mt-1">
            Curva de esquecimento ativa
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#121626] border border-indigo-500/30 shadow-md">
          <span className="text-xs font-bold text-indigo-400 block mb-1">
            Novos Erros
          </span>
          <span className="text-3xl font-black text-white">
            {newErrors.length}
          </span>
          <p className="text-xs text-slate-400 mt-1">
            Últimas sessões de treino
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-[#0e1322] border border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider mr-1">
            Área:
          </span>
          {(["ALL", "CLINICA_MEDICA", "CIRURGIA_GERAL", "GINECOLOGIA_OBSTETRICIA", "PEDIATRIA", "MEDICINA_FAMILIA_COMUNIDADE"] as const).map((area) => {
            const labels: Record<string, string> = {
              ALL: "Todas as Áreas",
              CLINICA_MEDICA: "Clínica",
              CIRURGIA_GERAL: "Cirurgia",
              GINECOLOGIA_OBSTETRICIA: "G.O.",
              PEDIATRIA: "Pediatria",
              MEDICINA_FAMILIA_COMUNIDADE: "SUS / Preventiva",
            };
            return (
              <button
                key={area}
                onClick={() => setSelectedAreaFilter(area)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  selectedAreaFilter === area
                    ? "bg-white text-slate-900 shadow-md font-bold"
                    : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700"
                }`}
              >
                {labels[area]}
              </button>
            );
          })}
        </div>

        <div className="text-xs text-slate-400">
          Mostrando <strong className="text-white">{filteredWrongAttempts.length}</strong> erros registrados
        </div>
      </div>

      {/* Actionable Error Cards List */}
      <div className="space-y-4">
        {filteredWrongAttempts.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-[#0e1322] border border-slate-800 shadow-md">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-white">Nenhum erro encontrado para estes filtros</p>
            <p className="text-xs text-slate-400 mt-1">Selecione outra área ou continue resolvendo questões.</p>
          </div>
        ) : (
          filteredWrongAttempts.map((att) => {
            const q = questions.find((item) => item.id === att.questionId);
            if (!q) return null;

            const effectiveTaxonomy = customTaxonomies[att.id] || att.errorTaxonomy || "DISTRACTOR_TRAP";
            const currentTaxonomyObj = TAXONOMY_OPTIONS.find((t) => t.id === effectiveTaxonomy) || TAXONOMY_OPTIONS[0];
            const isFlashcardCreated = flashcardCreatedSet.has(att.id);

            return (
              <div
                key={att.id}
                className="p-6 rounded-3xl bg-[#0f1424] border border-slate-800 hover:border-slate-700 transition-all space-y-4 shadow-lg"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-white px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700">
                      {q.code}
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {q.area.replace("_", " ")}
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30">
                      Marcou {att.selectedOption} (Gabarito: {q.correctAnswer || (q as any).correctOption || "A"})
                    </span>
                  </div>

                  {/* Taxonomy Badge with Reclassify Option */}
                  <div className="relative">
                    {editingAttemptId === att.id ? (
                      <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-slate-900 border border-slate-700 z-20">
                        {TAXONOMY_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => handleUpdateTaxonomy(att.id, opt.id)}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-white transition-all"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingAttemptId(att.id)}
                        className="flex items-center gap-1.5 text-xs font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40 px-3 py-1 rounded-full hover:bg-amber-500/30 transition-all"
                        title="Clique para corrigir a classificação do erro"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Causa: {currentTaxonomyObj.label}</span>
                        <Edit3 className="w-3 h-3 text-amber-400 ml-0.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Question Vignette / Finding */}
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-100 leading-relaxed">
                    {q.clinicalCase || (q as any).statement}
                  </p>
                </div>

                {/* Distractor & Conduct Rationale */}
                <div className="p-4 rounded-2xl bg-[#080d1a] border border-slate-800/80 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Conduta Padrão-Ouro INEP:</span>
                  </div>
                  <p className="text-slate-300 pl-5 leading-relaxed">
                    {q.expectedConduct || q.options?.find(o => o.isCorrect)?.explanation || (q as any).explanation || "Revisão e estabilização de acordo com o protocolo vigente."}
                  </p>
                </div>

                {/* Actionable Next Steps Bar */}
                <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {/* Action 1: Drill 5 questions of this theme */}
                    <button
                      onClick={() => {
                        setQuestionFilterArea(q.area);
                        setActiveTab("questions");
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-slate-900 font-bold text-xs hover:bg-slate-100 hover:scale-[1.02] active:scale-95 transition-all shadow-md cursor-pointer"
                    >
                      <FileQuestion className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Treinar Tema ({q.topic || q.area})</span>
                    </button>

                    {/* Action 2: Create Flashcard */}
                    <button
                      onClick={() => handleCreateFlashcard(att.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        isFlashcardCreated
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                      }`}
                    >
                      {isFlashcardCreated ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Flashcard Criado</span>
                        </>
                      ) : (
                        <>
                          <Layers className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Criar Flashcard</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Action 3: Retest Question */}
                  <button
                    onClick={() => {
                      const qIndex = questions.findIndex((item) => item.id === q.id);
                      if (qIndex >= 0) setActiveQuestionIndex(qIndex);
                      setActiveTab("questions");
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                  >
                    <span>Refazer Esta Questão</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
