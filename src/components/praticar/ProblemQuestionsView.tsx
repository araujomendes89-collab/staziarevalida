import React, { useState } from "react";
import {
  AlertTriangle,
  HelpCircle,
  XCircle,
  Sparkles,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Eye,
  Trash2,
  Wand2,
} from "lucide-react";
import { Question } from "../../types";
import { GeneratedQuestionCard } from "./GeneratedQuestionCard";

interface ProblemQuestionsViewProps {
  questions: Question[];
  onRegenerateQuestion: (question: Question) => void;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onPublish: (id: string) => void;
}

export const ProblemQuestionsView: React.FC<ProblemQuestionsViewProps> = ({
  questions,
  onRegenerateQuestion,
  onApprove,
  onReject,
  onPublish,
}) => {
  const [filterType, setFilterType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Problem items are those with status ambiguous, divergent, similar, outdated, or rejected
  const problemQuestions = questions.filter((q) => {
    const s = String(q.generationStatus || "");
    const isProblem =
      s === "Ambígua" ||
      s === "Gabarito divergente" ||
      s === "Muito semelhante" ||
      s === "Desatualizada" ||
      s === "REJECTED" ||
      s === "Rejeitada" ||
      q.officialStatus === "annulled";

    if (!isProblem) return false;

    if (filterType !== "ALL" && s !== filterType) return false;

    if (searchQuery.trim()) {
      const qLower = searchQuery.toLowerCase();
      return (
        q.topic?.toLowerCase().includes(qLower) ||
        q.clinicalCase?.toLowerCase().includes(qLower) ||
        q.code?.toLowerCase().includes(qLower)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-rose-950/40 via-amber-950/20 to-[#0c0e17] border border-rose-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <span>Fila de Tratamento de Questões com Problemas</span>
          </h3>
          <p className="text-xs text-zinc-400 max-w-2xl">
            Questões que foram sinalizadas pela auditoria adversarial como ambíguas, com divergência de diretriz ou alto índice de similaridade. Corrija ou gere substitutas com 1 clique.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            {problemQuestions.length} com pendências
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-[#0d1017] border border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: "ALL", label: "Todas com Problemas" },
            { id: "Ambígua", label: "Ambíguas" },
            { id: "Gabarito divergente", label: "Gabarito Divergente" },
            { id: "Muito semelhante", label: "Muito Semelhante" },
            { id: "Desatualizada", label: "Desatualizadas" },
            { id: "REJECTED", label: "Rejeitadas" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                filterType === tab.id
                  ? "bg-rose-600/30 text-rose-200 border border-rose-500/40"
                  : "bg-white/[0.02] text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por tema ou código..."
            className="w-full bg-[#151923] text-xs text-white border border-white/10 rounded-xl pl-8 pr-3 py-1.5 outline-none focus:border-rose-500/50"
          />
        </div>
      </div>

      {/* List */}
      {problemQuestions.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#0d1017] border border-white/10 space-y-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
          <h4 className="text-sm font-bold text-white">Nenhuma questão com problemas pendentes</h4>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Todas as questões geradas passaram com sucesso na auditoria de ambiguidade e conformidade com diretrizes.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {problemQuestions.map((q) => (
            <div key={q.id} className="relative">
              <GeneratedQuestionCard
                question={q}
                onApprove={onApprove}
                onPublish={onPublish}
                onReject={onReject}
              />
              <div className="mt-2 flex items-center justify-end gap-2 pr-2">
                <button
                  type="button"
                  onClick={() => onRegenerateQuestion(q)}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer transition-all hover:scale-105"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Gerar Substituta Inédita</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
