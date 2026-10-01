import React, { useState } from "react";
import {
  X,
  FileText,
  Sparkles,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Database,
  RefreshCw,
  Search,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { BatchQuestionExtractorService } from "../../services/batchQuestionExtractor";
import { Question, MedicalArea } from "../../types";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

interface BatchQuestionExtractorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIngestSuccess?: (newQuestions: Question[]) => void;
}

const OFFICIAL_EDITIONS_PRESETS = [
  { year: 2020, edition: "Revalida INEP 2020 — Edição de Retomada", label: "2020 Retomada (100 Qs)", count: 100 },
  { year: 2021, edition: "Revalida INEP 2021 — Edição Única", label: "2021 Edição Única (100 Qs)", count: 100 },
  { year: 2022, edition: "Revalida INEP 2022/1 — 1ª Etapa Teórica", label: "2022/1 Teórica (100 Qs)", count: 100 },
  { year: 2022, edition: "Revalida INEP 2022/2 — 1ª Etapa Teórica", label: "2022/2 Teórica (100 Qs)", count: 100 },
  { year: 2023, edition: "Revalida INEP 2023/1 — 1ª Etapa Teórica", label: "2023/1 Teórica (100 Qs)", count: 100 },
  { year: 2023, edition: "Revalida INEP 2023/2 — 1ª Etapa Teórica", label: "2023/2 Teórica (100 Qs)", count: 100 },
  { year: 2024, edition: "Revalida INEP 2024/1 — 1ª Etapa Teórica", label: "2024/1 Teórica (100 Qs)", count: 100 },
  { year: 2024, edition: "Revalida INEP 2024/2 — 1ª Etapa Teórica", label: "2024/2 Teórica (100 Qs)", count: 100 },
  { year: 2025, edition: "Revalida INEP 2025/1 — 1ª Etapa Teórica", label: "2025/1 Teórica (100 Qs)", count: 100 },
  { year: 2025, edition: "Revalida INEP 2025/2 — 1ª Etapa Teórica", label: "2025/2 Teórica (100 Qs)", count: 100 },
  { year: 2026, edition: "Revalida INEP 2026/1 — 1ª Etapa Teórica", label: "2026/1 Teórica (100 Qs)", count: 100 },
  { year: 2025, edition: "ENAMED 2025 — Exame Nacional de Avaliação da Formação Médica", label: "ENAMED 2025 (100 Qs)", count: 100 },
];

export const BatchQuestionExtractorModal: React.FC<BatchQuestionExtractorModalProps> = ({
  isOpen,
  onClose,
  onIngestSuccess,
}) => {
  const { questions, addBatchQuestions, firebaseUser } = useApp();

  const [activeTab, setActiveTab] = useState<"TEXT_OCR" | "PRESET_SYNC" | "AI_PARSER">("PRESET_SYNC");
  const [rawInputText, setRawInputText] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [selectedEdition, setSelectedEdition] = useState<string>("Revalida INEP 2025/1 — 1ª Etapa Teórica");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [extractedQuestions, setExtractedQuestions] = useState<Question[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleParseLocal = () => {
    if (!rawInputText.trim()) {
      alert("Por favor, cole o texto do caderno oficial ou OCR antes de extrair.");
      return;
    }

    setIsProcessing(true);
    setFeedbackMessage(null);
    try {
      const result = BatchQuestionExtractorService.parseRawExamText(
        rawInputText,
        selectedYear,
        selectedEdition
      );

      setExtractedQuestions(result.questions);
      setWarnings(result.warnings);

      if (result.questions.length > 0) {
        setFeedbackMessage(`${result.questions.length} questões identificadas com sucesso pelo parser regex!`);
      } else {
        setFeedbackMessage("Nenhuma questão formatada encontrada. Verifique os marcadores 'QUESTÃO XX'.");
      }
    } catch (err: any) {
      alert(`Erro durante extração: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleParseWithAi = async () => {
    if (!rawInputText.trim()) {
      alert("Por favor, cole o texto do caderno oficial antes de enviar para a IA.");
      return;
    }

    setIsProcessing(true);
    setFeedbackMessage(null);
    try {
      const result = await BatchQuestionExtractorService.extractWithAi(
        rawInputText,
        selectedYear,
        selectedEdition
      );

      setExtractedQuestions(result.questions);
      setWarnings(result.warnings);

      if (result.questions.length > 0) {
        setFeedbackMessage(`${result.questions.length} questões extraídas e categorizadas clinicamente com IA!`);
      } else {
        setFeedbackMessage("A IA não conseguiu decodificar questões do texto fornecido.");
      }
    } catch (err: any) {
      alert(`Erro no processamento da IA: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommitQuestions = async () => {
    if (extractedQuestions.length === 0) return;

    setIsProcessing(true);
    try {
      // Merge with existing questions via AppContext
      addBatchQuestions(extractedQuestions);

      // Sincronizar em background com Firestore se conectado
      if (firebaseUser) {
        for (const q of extractedQuestions.slice(0, 50)) {
          setDoc(doc(db, "questions", q.id), q, { merge: true }).catch((e) =>
            console.warn("Firestore sync warning:", e)
          );
        }
      }

      setFeedbackMessage(`${extractedQuestions.length} questões foram inseridas no banco de dados ativo com sucesso!`);
      if (onIngestSuccess) {
        onIngestSuccess(extractedQuestions);
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      alert(`Erro ao salvar questões: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-[24px] shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Motor de Ingestão & Extração em Lote (PDF / OCR)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Converta cadernos brutos do INEP em questões estruturadas com taxonomia médica e gabaritos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2">
          <button
            onClick={() => setActiveTab("PRESET_SYNC")}
            title={`Banco oficial de provas do INEP (${questions.length.toLocaleString("pt-BR")} questões catalogadas com gabarito comentado)`}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === "PRESET_SYNC"
                ? "border-teal-600 text-teal-700 bg-white rounded-t-lg shadow-xs"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers className="w-4 h-4" />
            Cadernos Oficiais Prontos ({questions.length.toLocaleString("pt-BR")} Qs)
          </button>

          <button
            onClick={() => setActiveTab("TEXT_OCR")}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === "TEXT_OCR"
                ? "border-teal-600 text-teal-700 bg-white rounded-t-lg shadow-xs"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileText className="w-4 h-4" />
            Colar Texto de PDF / OCR
          </button>

          <button
            onClick={() => setActiveTab("AI_PARSER")}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === "AI_PARSER"
                ? "border-teal-600 text-teal-700 bg-white rounded-t-lg shadow-xs"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Sparkles className="w-4 h-4 text-teal-500" />
            Extrator Clínico com IA (Gemini / Claude)
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: PRESET SYNC */}
          {activeTab === "PRESET_SYNC" && (
            <div className="space-y-4">
              <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-teal-900">
                <ShieldCheck className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-teal-950">Acervo Oficial Catalogado do INEP e ENAMED</p>
                  <p className="text-teal-800 mt-1 leading-relaxed">
                    Você pode sincronizar instantaneamente todas as questões canônicas disponíveis para cada uma das 13 edições registradas no sistema, enriquecendo o banco de dados com casos clínicos oficiais e justificativas detalhadas.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {OFFICIAL_EDITIONS_PRESETS.map((item) => {
                  const existingForEdition = questions.filter((q) => q.examYear === item.year && q.origin === "INEP_OFICIAL");
                  return (
                    <div
                      key={item.edition}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-teal-400/80 transition-all shadow-xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">{item.year}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                            {existingForEdition.length} Qs ativas
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 font-medium line-clamp-2">
                          {item.edition}
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedYear(item.year);
                          setSelectedEdition(item.edition);
                          setActiveTab("TEXT_OCR");
                        }}
                        className="mt-3 w-full py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-teal-600 hover:text-white text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>Importar Mais Questões</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: TEXT / OCR PARSER */}
          {activeTab === "TEXT_OCR" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Ano da Prova</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  >
                    {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Edição / Caderno</label>
                  <input
                    type="text"
                    value={selectedEdition}
                    onChange={(e) => setSelectedEdition(e.target.value)}
                    placeholder="Ex: Revalida INEP 2024/1 - 1ª Etapa Teórica"
                    className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between mb-1">
                  <span>Texto Bruto Copiado do PDF / OCR</span>
                  <span className="text-[11px] text-slate-400">Reconhece: QUESTÃO 01, A), B), C), D), Gabarito</span>
                </label>
                <textarea
                  value={rawInputText}
                  onChange={(e) => setRawInputText(e.target.value)}
                  rows={8}
                  placeholder={`Cole aqui o texto do caderno ou OCR. Exemplo:\n\nQUESTÃO 01\nUm paciente de 45 anos procura a UBS com queixa de febre...\nA) Solicitar hemograma e prescrever paracetamol.\nB) Indicar internação hospitalar de urgência.\nC) Coleta de baciloscopia e radiografia.\nD) Alta com orientações gerais.\nGabarito: C`}
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleParseLocal}
                  disabled={isProcessing || !rawInputText.trim()}
                  className="flex-1 py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  <span>Executar Extração Rápida (Parser INEP)</span>
                </button>

                <button
                  type="button"
                  onClick={handleParseWithAi}
                  disabled={isProcessing || !rawInputText.trim()}
                  className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-teal-400" />
                  <span>Processar com IA</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: AI DEEP EXTRACTION */}
          {activeTab === "AI_PARSER" && (
            <div className="space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-xs text-purple-900">
                <div className="flex items-center gap-2 font-bold text-purple-950 mb-1">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>Pipeline de Extração Neural com IA Gemini / Claude</span>
                </div>
                <p className="text-purple-800 leading-relaxed">
                  A IA analisa o documento não estruturado, corrige erros de OCR em termos médicos (ex: dosagens, nomenclaturas de fármacos), deduz a Grande Área segundo a Matriz de Competências do INEP e gera justificativas clínicas automáticas para os distratores.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Texto Scaneado / Enunciados Desformatados
                </label>
                <textarea
                  value={rawInputText}
                  onChange={(e) => setRawInputText(e.target.value)}
                  rows={8}
                  placeholder="Cole aqui o texto desformatado de provas scaneadas ou tabelas de questões..."
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <button
                type="button"
                onClick={handleParseWithAi}
                disabled={isProcessing || !rawInputText.trim()}
                className="w-full py-3 px-4 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>Iniciar Extração e Normalização com IA</span>
              </button>
            </div>
          )}

          {/* Feedback & Warnings */}
          {feedbackMessage && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{feedbackMessage}</span>
            </div>
          )}

          {/* Extracted Questions Preview */}
          {extractedQuestions.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-teal-600" />
                  <span>Pré-Visualização das Questões Extraídas ({extractedQuestions.length})</span>
                </h3>
                <span className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full">
                  Prontas para Gravação
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2.5 pr-2">
                {extractedQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        Questão #{q.originalNumber || idx + 1} — {q.area.replace(/_/g, " ")}
                      </span>
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-teal-700">
                        Gabarito: {q.correctAnswer}
                      </span>
                    </div>
                    <p className="text-slate-600 line-clamp-2">{q.clinicalCase}</p>
                    <div className="grid grid-cols-2 gap-1 pt-1">
                      {q.options.map((opt) => (
                        <div
                          key={opt.id}
                          className={`p-1.5 rounded text-[11px] truncate ${
                            opt.isCorrect
                              ? "bg-emerald-100/80 text-emerald-900 font-bold border border-emerald-300"
                              : "bg-white text-slate-600 border border-slate-200"
                          }`}
                        >
                          <span className="font-bold mr-1">({opt.id})</span>
                          {opt.text}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleCommitQuestions}
                disabled={isProcessing}
                className="w-full py-3.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Gravar {extractedQuestions.length} Questões no Banco Ativo & Firestore</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
