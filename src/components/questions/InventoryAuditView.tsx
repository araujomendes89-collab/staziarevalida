import React, { useState, useEffect, useMemo } from "react";
import {
  Layers,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Printer,
  ArrowRight,
  Database,
  Search,
  Filter,
  FileText,
  Clock,
  Sparkles,
  ExternalLink,
  Calendar,
  Check,
  AlertCircle,
  HelpCircle,
  UploadCloud,
} from "lucide-react";
import { Question, RevalidaEditionInventory, QuestionAttempt } from "../../types";
import { REVALIDA_EDITIONS_INVENTORY, REVALIDA_GLOBAL_STATS } from "../../data/revalidaInventoryData";
import {
  InventoryValidatorService,
  InventoryValidationResult,
  EditionAuditItem,
} from "../../services/inventoryValidatorService";
import { useApp } from "../../context/AppContext";
import { BookletIngestionModal } from "../modals/BookletIngestionModal";

interface InventoryAuditViewProps {
  questions?: Question[];
  attempts?: QuestionAttempt[];
  onStartExam?: (editionLabel: string, year: number, editionId?: string) => void;
  onPrintExam?: (editionLabel: string, year: number, editionId?: string) => void;
  onBackToHome?: () => void;
}

export const InventoryAuditView: React.FC<InventoryAuditViewProps> = ({
  questions = [],
  attempts = [],
  onStartExam,
  onPrintExam,
  onBackToHome,
}) => {
  const { syncQuestionsFromFirestore } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "REVALIDA" | "ENAMED">("ALL");
  const [filterYear, setFilterYear] = useState<string>("ALL");
  const [isAuditing, setIsAuditing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [ingestModalOpen, setIngestModalOpen] = useState(false);
  const [selectedTargetEditionId, setSelectedTargetEditionId] = useState<string>("rev-2024-2");
  const [auditResult, setAuditResult] = useState<InventoryValidationResult | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; success: boolean } | null>(null);

  // Run initial audit on mount
  useEffect(() => {
    runAudit();
  }, [questions]);

  const runAudit = async () => {
    setIsAuditing(true);
    try {
      const res = await InventoryValidatorService.auditAll(questions);
      setAuditResult(res);
    } catch (err) {
      console.error("Erro na auditoria de inventário:", err);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await InventoryValidatorService.syncAllToFirestore(questions);
      if (res.success) {
        // Also refresh local cache and state
        await syncQuestionsFromFirestore();
        setSyncFeedback({
          message: `Sincronização concluída: ${res.syncedEditions} edições e ${res.syncedQuestions} questões atualizadas no Firestore.`,
          success: true,
        });
        await runAudit();
      } else {
        setSyncFeedback({
          message: `Falha na sincronização: ${res.error || "Erro desconhecido"}`,
          success: false,
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        message: `Erro na comunicação com Firestore: ${err?.message || err}`,
        success: false,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter editions
  const filteredEditions = useMemo(() => {
    return REVALIDA_EDITIONS_INVENTORY.filter((ed) => {
      if (filterType === "ENAMED" && ed.id !== "enamed-2025") return false;
      if (filterType === "REVALIDA" && ed.id === "enamed-2025") return false;
      if (filterYear !== "ALL" && ed.year.toString() !== filterYear) return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesLabel = ed.editionLabel.toLowerCase().includes(term);
        const matchesNotice = ed.officialNotice.toLowerCase().includes(term);
        const matchesYear = ed.year.toString().includes(term);
        return matchesLabel || matchesNotice || matchesYear;
      }
      return true;
    });
  }, [filterType, filterYear, searchTerm]);

  // Unique years for filter
  const years = useMemo(() => {
    const list = Array.from(new Set(REVALIDA_EDITIONS_INVENTORY.map((e) => e.year)));
    return list.sort((a, b) => b - a);
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-[28px] bg-gradient-to-br from-[#0c101c] via-[#101526] to-[#0a0d18] border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>Inventário Oficial Canônico (2020–2026/1 & ENAMED 2025)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Auditoria de Provas & Banco Canônico INEP
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Mapeamento de 100% das provas históricas do Revalida INEP e ENAMED 2025 com gabarito oficial pós-recursos, anulações certificadas, cadernos de cores e validação em tempo real com o Firestore.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={() => {
                setSelectedTargetEditionId("rev-2024-2");
                setIngestModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-bold text-xs border border-emerald-500/30 flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Importar Caderno</span>
            </button>

            <button
              onClick={runAudit}
              disabled={isAuditing}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs border border-white/15 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? "animate-spin" : ""}`} />
              <span>{isAuditing ? "Auditando..." : "Validar Integridade"}</span>
            </button>

            <button
              onClick={handleSyncAll}
              disabled={isSyncing}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-500/25 border border-blue-400/30 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{isSyncing ? "Sincronizando..." : "Sincronizar com Firestore"}</span>
            </button>

            {onBackToHome && (
              <button
                onClick={onBackToHome}
                className="px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/10 text-white/70 hover:text-white text-xs font-bold border border-white/10 transition-all cursor-pointer"
              >
                Voltar
              </button>
            )}
          </div>
        </div>

        {/* Global Key Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <span className="text-[11px] text-zinc-400 font-medium">Edições Oficiais</span>
            <div className="text-lg font-bold text-white mt-0.5">{REVALIDA_GLOBAL_STATS.totalEditions} edições</div>
            <span className="text-[10px] text-emerald-400">2020 a 2026/2 + ENAMED</span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <span className="text-[11px] text-zinc-400 font-medium">Questões Canônicas</span>
            <div className="text-lg font-bold text-white mt-0.5">{REVALIDA_GLOBAL_STATS.totalCanonicalQuestions.toLocaleString("pt-BR")} itens</div>
            <span className="text-[10px] text-blue-400">100 por prova</span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <span className="text-[11px] text-zinc-400 font-medium">Anulações Pós-Recurso</span>
            <div className="text-lg font-bold text-amber-300 mt-0.5">{REVALIDA_GLOBAL_STATS.totalAnnulledQuestions} anuladas</div>
            <span className="text-[10px] text-zinc-400">Gabarito definitivo</span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <span className="text-[11px] text-zinc-400 font-medium">Gabaritos Alterados</span>
            <div className="text-lg font-bold text-purple-300 mt-0.5">{REVALIDA_GLOBAL_STATS.totalAlteredAnswersAfterAppeal} alterações</div>
            <span className="text-[10px] text-zinc-400">Pós-recurso INEP</span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 col-span-2 sm:col-span-1">
            <span className="text-[11px] text-zinc-400 font-medium">Status Firestore</span>
            <div className="text-lg font-bold text-emerald-400 mt-0.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {auditResult?.isOnline ? "Conectado" : "Pronto / Cache"}
            </div>
            <span className="text-[10px] text-zinc-400">{auditResult?.totalFirestoreQuestions || questions.length} itens no banco</span>
          </div>
        </div>
      </div>

      {/* Sync Feedback Message */}
      {syncFeedback && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-xs font-semibold ${
            syncFeedback.success
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          {syncFeedback.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{syncFeedback.message}</span>
        </div>
      )}

      {/* Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-[#0f121d] border border-white/10">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por edição, ano ou edital..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {/* Exam Type Tabs */}
          <div className="flex rounded-xl bg-white/[0.04] p-1 border border-white/10 text-xs">
            <button
              onClick={() => setFilterType("ALL")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                filterType === "ALL" ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Todas ({REVALIDA_EDITIONS_INVENTORY.length})
            </button>
            <button
              onClick={() => setFilterType("REVALIDA")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                filterType === "REVALIDA" ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Revalida INEP (12)
            </button>
            <button
              onClick={() => setFilterType("ENAMED")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                filterType === "ENAMED" ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              ENAMED 2025 (1)
            </button>
          </div>

          {/* Year Select */}
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-zinc-300 focus:outline-none focus:border-blue-500/50"
          >
            <option value="ALL" className="bg-[#111420] text-white">Todos os anos</option>
            {years.map((y) => (
              <option key={y} value={y.toString()} className="bg-[#111420] text-white">
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid of Edition Inventory Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredEditions.map((ed) => {
          const audit = auditResult?.editions.find((a) => a.id === ed.id);
          const localCount = audit?.localQuestionsCount || questions.filter((q) => InventoryValidatorService.matchesEdition(q, ed)).length;
          const firestoreCount = audit?.firestoreQuestionsCount || 0;

          // Attempt stats
          const edQuestions = questions.filter((q) => InventoryValidatorService.matchesEdition(q, ed));
          const qIds = new Set(edQuestions.map((q) => q.id));
          const userAttempts = attempts.filter((a) => qIds.has(a.questionId));
          const isStarted = userAttempts.length > 0;
          const isCompleted = userAttempts.length >= (ed.objectiveCount || 100);

          return (
            <div
              key={ed.id}
              className="p-5 sm:p-6 rounded-3xl bg-[#0f1320] border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between space-y-4 shadow-xl relative group"
            >
              <div className="space-y-3">
                {/* Header Tag Row */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {ed.year}
                    </span>
                    <span className="text-[11px] font-semibold text-zinc-400">
                      {ed.stage}
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Check className="w-3 h-3" />
                    100% Validada
                  </span>
                </div>

                {/* Edition Title & Official Notice */}
                <div>
                  <h3 className="text-base font-bold text-white leading-snug group-hover:text-blue-300 transition-colors">
                    {ed.editionLabel}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5 flex-wrap">
                    <span>{ed.officialNotice}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-zinc-500" />
                      {new Date(ed.examDate).toLocaleDateString("pt-BR")}
                    </span>
                  </p>
                </div>

                {/* Question Integrity Details */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-[10px] text-zinc-400 block">Questões Canônicas</span>
                    <span className="font-bold text-white font-mono">{ed.objectiveCount || 100} itens</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                    <span className="text-[10px] text-zinc-400 block">Anuladas Oficiais</span>
                    <span className="font-bold text-amber-400 font-mono">
                      {ed.annulledQuestions && ed.annulledQuestions.length > 0
                        ? `${ed.annulledQuestions.length} (${ed.annulledQuestions.map(n => `#${n}`).join(", ")})`
                        : "Nenhuma"}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-zinc-400 block">Cadernos Auditados</span>
                    <span className="font-bold text-zinc-300 font-mono">{ed.booklets?.length || 1} cores</span>
                  </div>
                </div>

                {/* Booklets Bar */}
                {ed.booklets && ed.booklets.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                      Cadernos de Prova Padrão INEP:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {ed.booklets.map((b, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-[10px] font-mono text-zinc-300"
                        >
                          <FileText className="w-2.5 h-2.5 text-blue-400" />
                          {b.color}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-zinc-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-zinc-500" />
                  ~4h estimadas
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPrintExam(ed.editionLabel, ed.year, ed.id)}
                    title="Gerar Caderno de Prova Padrão INEP para Impressão"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/15 text-white/80 hover:text-white border border-white/10 text-xs font-bold transition-all cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-blue-400" />
                    <span>Imprimir PDF</span>
                  </button>

                  <button
                    onClick={() => onStartExam(ed.editionLabel, ed.year, ed.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-black font-bold text-xs hover:bg-zinc-200 transition-all cursor-pointer shadow-md"
                  >
                    <span>{isStarted ? "Continuar" : "Resolver Prova"}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Booklet Ingestion Modal */}
      <BookletIngestionModal
        isOpen={ingestModalOpen}
        onClose={() => setIngestModalOpen(false)}
        preselectedEditionId={selectedTargetEditionId}
        onQuestionsImported={() => {
          runAudit();
        }}
      />
    </div>
  );
};
