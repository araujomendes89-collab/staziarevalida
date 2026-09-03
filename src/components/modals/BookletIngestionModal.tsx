import React, { useState, useMemo } from "react";
import {
  X,
  UploadCloud,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Database,
  Layers,
  Sparkles,
  Copy,
  Check,
  Shield,
  FileText,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import { Question, RevalidaEditionInventory, MedicalArea } from "../../types";
import { REVALIDA_EDITIONS_INVENTORY } from "../../data/revalidaInventoryData";
import { normalizeQuestion } from "../../utils/questionNormalizer";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useApp } from "../../context/AppContext";

interface BookletIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuestionsImported?: (newQuestions: Question[]) => void;
  preselectedEditionId?: string;
}

const SAMPLE_JSON_TEMPLATE = `[
  {
    "question_number": 1,
    "area": "CIRURGIA_GERAL",
    "statement": "Um homem de 46 anos vai ao pronto-socorro com queixa de dor em cólica na região lombar direita...",
    "alternatives": {
      "A": "Litíase renal; cirurgia de urgência.",
      "B": "Infecção urinária; antibioticoterapia.",
      "C": "Litíase renal; analgesia e hidratação.",
      "D": "Infecção urinária; analgesia e urocultura."
    },
    "correct_answer": "C",
    "explanation": "Quadro clássico de cólica nefrética não complicada. Conduta: analgesia e hidratação.",
    "status": "válida"
  }
]`;

export const BookletIngestionModal: React.FC<BookletIngestionModalProps> = ({
  isOpen,
  onClose,
  onQuestionsImported,
  preselectedEditionId,
}) => {
  const { syncQuestionsFromFirestore } = useApp();
  const [selectedEditionId, setSelectedEditionId] = useState<string>(
    preselectedEditionId || "rev-2024-2"
  );
  const [rawInput, setRawInput] = useState<string>("");
  const [formatMode, setFormatMode] = useState<"JSON" | "TEXT">("JSON");
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [copiedTemplate, setCopiedTemplate] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedQuestions, setParsedQuestions] = useState<Question[]>([]);
  const [importStatus, setImportStatus] = useState<{
    success: boolean;
    count: number;
    message: string;
  } | null>(null);

  const selectedEdition = useMemo(() => {
    return (
      REVALIDA_EDITIONS_INVENTORY.find((e) => e.id === selectedEditionId) ||
      REVALIDA_EDITIONS_INVENTORY[0]
    );
  }, [selectedEditionId]);

  if (!isOpen) return null;

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(SAMPLE_JSON_TEMPLATE);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2500);
  };

  const handleParse = () => {
    setParseError(null);
    setImportStatus(null);
    setIsParsing(true);

    try {
      if (!rawInput.trim()) {
        throw new Error("Por favor, cole o conteúdo das questões no campo abaixo.");
      }

      let rawItems: any[] = [];

      if (formatMode === "JSON") {
        try {
          rawItems = JSON.parse(rawInput);
          if (!Array.isArray(rawItems)) {
            if (typeof rawItems === "object" && Array.isArray((rawItems as any).questions)) {
              rawItems = (rawItems as any).questions;
            } else {
              throw new Error("O JSON precisa ser uma lista de questões (Array).");
            }
          }
        } catch (e: any) {
          throw new Error(`Erro de sintaxe JSON: ${e.message}`);
        }
      } else {
        // Simple text block parser (QUESTÃO X ... A) ... B) ... C) ... D) ... GABARITO: X)
        const blocks = rawInput.split(/(?=QUEST[ÃA]O\s+\d+|^\d+[\.\-\)]\s+)/im).filter((b) => b.trim().length > 20);
        if (blocks.length === 0) {
          throw new Error("Nenhum bloco de questão reconhecido no formato de texto.");
        }

        rawItems = blocks.map((block, idx) => {
          const numMatch = block.match(/QUEST[ÃA]O\s+(\d+)|\b(\d+)[\.\-\)]/i);
          const qNum = numMatch ? parseInt(numMatch[1] || numMatch[2], 10) : idx + 1;

          // Match alternatives
          const optA = block.match(/[A][\)\.\-]\s*([^\n\r]+(?:\n(?![B-D][\)\.\-]|GABARITO)[^\n\r]+)*)/i)?.[1]?.trim() || "Alternativa A";
          const optB = block.match(/[B][\)\.\-]\s*([^\n\r]+(?:\n(?![C-D][\)\.\-]|GABARITO)[^\n\r]+)*)/i)?.[1]?.trim() || "Alternativa B";
          const optC = block.match(/[C][\)\.\-]\s*([^\n\r]+(?:\n(?![D][\)\.\-]|GABARITO)[^\n\r]+)*)/i)?.[1]?.trim() || "Alternativa C";
          const optD = block.match(/[D][\)\.\-]\s*([^\n\r]+(?:\n(?!GABARITO)[^\n\r]+)*)/i)?.[1]?.trim() || "Alternativa D";

          const gabMatch = block.match(/GABARITO(?:\s+OFICIAL)?[\s\:\-]+([A-D])/i);
          const correctLetter = (gabMatch?.[1] || "A").toUpperCase() as "A" | "B" | "C" | "D";

          // Extract statement by stripping alternatives
          let statement = block;
          const firstOptIdx = block.search(/[A][\)\.\-]/i);
          if (firstOptIdx !== -1) {
            statement = block.substring(0, firstOptIdx).trim();
          }

          return {
            question_number: qNum,
            area: "CLINICA_MEDICA",
            statement: statement.replace(/^QUEST[ÃA]O\s+\d+[\s\:\-\.]*/i, "").trim(),
            alternatives: { A: optA, B: optB, C: optC, D: optD },
            correct_answer: correctLetter,
            status: "válida",
          };
        });
      }

      // Convert and normalize all items into strict Questions
      const questionsFormatted: Question[] = rawItems.map((raw, index) => {
        const num = raw.question_number || raw.originalNumber || index + 1;
        const normalized = normalizeQuestion({
          ...raw,
          id: `q-ingest-${selectedEdition.year}-${selectedEdition.id}-${num}`,
          code: `REV-${selectedEdition.year}-${num}`,
          examYear: selectedEdition.year,
          examEdition: selectedEdition.editionLabel,
          originalBooklet: selectedEdition.booklets?.[0]?.code || (selectedEdition as any).officialBooklets?.[0] || "Caderno 1 - Geral",
          originalNumber: num,
          origin: "INEP_OFICIAL",
        });
        return normalized;
      });

      setParsedQuestions(questionsFormatted);
    } catch (err: any) {
      setParseError(err.message || "Erro desconhecido durante o parsing.");
      setParsedQuestions([]);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSaveToDatabase = async () => {
    if (parsedQuestions.length === 0) return;
    setIsSyncing(true);
    setImportStatus(null);

    try {
      let savedCount = 0;
      for (const q of parsedQuestions) {
        try {
          const qRef = doc(db, "questions", q.id);
          const payload = JSON.parse(JSON.stringify(q, (k, v) => (v === undefined ? null : v)));
          await setDoc(qRef, { ...payload, importedAt: new Date().toISOString() }, { merge: true });
          savedCount++;
        } catch (e) {
          console.error(`Erro ao gravar ${q.id}:`, e);
        }
      }

      // Refresh application context
      await syncQuestionsFromFirestore();

      if (onQuestionsImported) {
        onQuestionsImported(parsedQuestions);
      }

      setImportStatus({
        success: true,
        count: savedCount,
        message: `🎉 Sucesso! ${savedCount} questões foram importadas para o caderno "${selectedEdition.editionLabel}" e sincronizadas com o Firestore.`,
      });
    } catch (err: any) {
      setImportStatus({
        success: false,
        count: 0,
        message: `Erro na sincronização: ${err.message || err}`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-3xl max-h-[90vh] bg-[#0c101c] border border-white/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Importador de Cadernos Oficiais
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-semibold">
                  100 Questões Ready
                </span>
              </h3>
              <p className="text-xs text-white/60">
                Adicione e sincronize blocos ou cadernos inteiros de 100 questões diretamente no Firestore.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
          {/* Target Edition Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-white/70 flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
              Selecione o Caderno / Edição Alvo:
            </label>
            <select
              value={selectedEditionId}
              onChange={(e) => setSelectedEditionId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
            >
              {REVALIDA_EDITIONS_INVENTORY.map((ed) => (
                <option key={ed.id} value={ed.id} className="bg-[#0c101c] text-white">
                  {ed.year} — {ed.editionLabel} ({ed.objectiveCount} questões oficiais)
                </option>
              ))}
            </select>
          </div>

          {/* Format Toggle & Template Helper */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/70">Formato de Entrada:</span>
              <div className="flex bg-black/40 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setFormatMode("JSON")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    formatMode === "JSON"
                      ? "bg-blue-600 text-white shadow-lg"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  JSON Estruturado
                </button>
                <button
                  type="button"
                  onClick={() => setFormatMode("TEXT")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    formatMode === "TEXT"
                      ? "bg-blue-600 text-white shadow-lg"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  Texto / Bloco Bruto
                </button>
              </div>
            </div>

            {formatMode === "JSON" && (
              <button
                type="button"
                onClick={handleCopyTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-xs font-semibold border border-white/10 transition-all cursor-pointer"
              >
                {copiedTemplate ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Modelo Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-blue-400" />
                    <span>Copiar Modelo JSON</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Textarea Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-white/70 flex items-center justify-between">
              <span>Cole o lote de questões ({formatMode === "JSON" ? "Array JSON" : "Texto com gabarito"}):</span>
              <span className="text-[11px] text-white/40">Suporta de 1 a 100 itens simultâneos</span>
            </label>
            <textarea
              rows={8}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={
                formatMode === "JSON"
                  ? '[\n  {\n    "question_number": 1,\n    "area": "CLINICA_MEDICA",\n    "statement": "...",\n    "alternatives": { "A": "...", "B": "...", "C": "...", "D": "..." },\n    "correct_answer": "B"\n  }\n]'
                  : "QUESTÃO 01\nPaciente de 45 anos...\nA) Conduta 1\nB) Conduta 2\nC) Conduta 3\nD) Conduta 4\nGABARITO: B"
              }
              className="w-full p-4 rounded-2xl bg-black/50 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-blue-500 transition-colors placeholder:text-white/20 custom-scrollbar resize-none"
            />
          </div>

          {/* Error Message */}
          {parseError && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Falha no Processamento</p>
                <p className="mt-0.5 text-rose-300/80">{parseError}</p>
              </div>
            </div>
          )}

          {/* Parse Action */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              disabled={isParsing || !rawInput.trim()}
              onClick={handleParse}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isParsing ? "Processando..." : "Validar e Pré-Visualizar"}</span>
            </button>
          </div>

          {/* Parsed Preview Table */}
          {parsedQuestions.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Prévia: {parsedQuestions.length} questões reconhecidas
                  </h4>
                </div>
                <div className="text-xs text-white/60">
                  Pronto para ingestão no banco
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto rounded-2xl border border-white/10 bg-black/40 p-2 space-y-2 custom-scrollbar">
                {parsedQuestions.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-[10px] font-bold">
                          #{q.originalNumber || idx + 1}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-white/10 text-white/80 text-[10px] font-semibold">
                          {q.area}
                        </span>
                        <span className="text-emerald-400 font-mono font-bold text-[10px]">
                          GAB: {q.correctAnswer}
                        </span>
                      </div>
                      <p className="text-white/80 line-clamp-1 text-[11px] font-sans">
                        {q.clinicalCase}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Status Message */}
              {importStatus && (
                <div
                  className={`p-4 rounded-2xl border text-xs flex items-start gap-3 ${
                    importStatus.success
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  }`}
                >
                  {importStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <p className="font-semibold">{importStatus.message}</p>
                </div>
              )}

              {/* Confirm Save to Firestore */}
              <div className="flex items-center justify-between pt-2">
                <div className="text-[11px] text-white/50">
                  Destino: Coleção <code className="text-blue-400 font-mono">/questions</code> no Firestore
                </div>
                <button
                  type="button"
                  disabled={isSyncing || importStatus?.success}
                  onClick={handleSaveToDatabase}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Database className="w-4 h-4" />
                  <span>
                    {isSyncing
                      ? "Gravando no Firestore..."
                      : `Importar ${parsedQuestions.length} Questões no Firestore`}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-white/[0.01] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
