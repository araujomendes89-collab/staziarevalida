import React, { useState } from "react";
import {
  Layers,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Hash,
  BookOpen,
  Calendar,
  Sparkles,
  Download,
  Copy,
  Check,
  ArrowUpRight,
  FileSpreadsheet,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { REVALIDA_GLOBAL_STATS } from "../../data/revalidaInventoryData";
import { MedicalArea, ContentStatus, Question } from "../../types";

export const RevalidaInventoryView: React.FC = () => {
  const {
    editionsInventory,
    questions,
    setActiveTab,
    setActiveQuestionIndex,
  } = useApp();

  const [selectedYear, setSelectedYear] = useState<number | "ALL">("ALL");
  const [selectedArea, setSelectedArea] = useState<MedicalArea | "ALL">("ALL");
  const [selectedStatus, setSelectedStatus] = useState<ContentStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCanonicalQuestion, setSelectedCanonicalQuestion] = useState<Question | null>(null);
  const [copiedSha, setCopiedSha] = useState<string | null>(null);

  const filteredEditions = editionsInventory.filter((ed) => {
    if (selectedYear !== "ALL" && ed.year !== selectedYear) return false;
    return true;
  });

  const filteredQuestions = questions.filter((q) => {
    if (selectedYear !== "ALL" && q.examYear !== selectedYear) return false;
    if (selectedArea !== "ALL" && q.area !== selectedArea) return false;
    if (selectedStatus !== "ALL") {
      const qStatus = q.guidelineUpdate?.status || (q.officialStatus === "annulled" ? "ANNULLED" : "CURRENT");
      if (qStatus !== selectedStatus) return false;
    }
    if (searchQuery) {
      const text = `${q.code} ${q.topic} ${q.subtopic} ${q.clinicalCase}`.toLowerCase();
      if (!text.includes(searchQuery.toLowerCase())) return false;
    }
    return true;
  });

  const handleCopySha = (sha: string) => {
    navigator.clipboard.writeText(sha);
    setCopiedSha(sha);
    setTimeout(() => setCopiedSha(null), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-6 rounded-[28px] backdrop-blur-2xl bg-white/[0.04] border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
                <Layers className="w-4 h-4 text-blue-300" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-blue-300">
                Inventário Oficial Revalida INEP & ENAMED (2020–2026)
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Banco Canônico Estruturado & Provas Oficiais
            </h1>
            <p className="text-xs sm:text-sm text-white/60 mt-1 max-w-2xl">
              Todas as 13 edições oficiais do Revalida INEP e ENAMED 2025 mapeadas, baixadas dos repositórios governamentais,
              deduplicadas entre cadernos de cores e auditadas contra os gabaritos definitivos.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={() => setActiveTab("export")}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 transition-all hover:scale-[1.02] shadow-[0_0_20px_rgba(37,99,235,0.4)]"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Base Completa</span>
            </button>
          </div>
        </div>

        {/* Global Extraction KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
            <span className="text-[11px] text-white/50 font-medium block">Edições Oficiais</span>
            <span className="text-xl font-black text-white mt-0.5 block">{REVALIDA_GLOBAL_STATS.totalEditions}</span>
            <span className="text-[10px] text-blue-400 font-semibold">2021 a 2026</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
            <span className="text-[11px] text-white/50 font-medium block">Questões Canônicas</span>
            <span className="text-xl font-black text-white mt-0.5 block">{REVALIDA_GLOBAL_STATS.totalCanonicalQuestions}</span>
            <span className="text-[10px] text-emerald-400 font-semibold">100% Deduplicadas</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
            <span className="text-[11px] text-white/50 font-medium block">Ocorrências em Cadernos</span>
            <span className="text-xl font-black text-white mt-0.5 block">{REVALIDA_GLOBAL_STATS.totalOccurrencesBetweenBooklets}</span>
            <span className="text-[10px] text-white/60 font-semibold">4 cores por edição</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
            <span className="text-[11px] text-white/50 font-medium block">Imagens Clínicas</span>
            <span className="text-xl font-black text-white mt-0.5 block">{REVALIDA_GLOBAL_STATS.totalImagesExtracted}</span>
            <span className="text-[10px] text-purple-400 font-semibold">ECG, TC, RX e Dermato</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
            <span className="text-[11px] text-white/50 font-medium block">Anuladas pelo INEP</span>
            <span className="text-xl font-black text-amber-300 mt-0.5 block">{REVALIDA_GLOBAL_STATS.totalAnnulledQuestions}</span>
            <span className="text-[10px] text-amber-400 font-semibold">Gabarito pós-recurso</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
            <span className="text-[11px] text-white/50 font-medium block">Gabaritos Retificados</span>
            <span className="text-xl font-black text-emerald-300 mt-0.5 block">{REVALIDA_GLOBAL_STATS.totalAlteredAnswersAfterAppeal}</span>
            <span className="text-[10px] text-emerald-400 font-semibold">Histórico preservado</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-5 rounded-[24px] backdrop-blur-2xl bg-white/[0.03] border border-white/10 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por código, tema, palavra-chave no caso clínico..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs placeholder:text-white/40 focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Year selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {["ALL", 2026, 2025, 2024, 2023, 2022, 2021, 2020].map((yr) => (
              <button
                key={yr.toString()}
                onClick={() => setSelectedYear(yr as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  selectedYear === yr
                    ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]"
                    : "bg-white/5 text-white/60 hover:text-white"
                }`}
              >
                {yr === "ALL" ? "Todos os Anos" : yr}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary filters */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/5 text-xs">
          <span className="text-white/40 font-semibold mr-1">Área Médica:</span>
          {[
            { id: "ALL", label: "Todas" },
            { id: "CLINICA_MEDICA", label: "Clínica Médica" },
            { id: "CIRURGIA_GERAL", label: "Cirurgia Geral" },
            { id: "GINECOLOGIA_OBSTETRICIA", label: "GO" },
            { id: "PEDIATRIA", label: "Pediatria" },
            { id: "MEDICINA_FAMILIA_COMUNIDADE", label: "MFC/SUS" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedArea(item.id as any)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                selectedArea === item.id
                  ? "bg-white/20 text-white font-bold"
                  : "bg-white/5 text-white/50 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Editions List & Questions Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Official Editions Inventory */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Edições Oficiais ({filteredEditions.length})
            </h3>
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              100% Auditadas
            </span>
          </div>

          <div className="space-y-3">
            {filteredEditions.map((edition) => (
              <div
                key={edition.id}
                className="p-4 rounded-2xl backdrop-blur-2xl bg-white/[0.03] border border-white/10 hover:border-blue-400/40 transition-all shadow-lg space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{edition.editionLabel}</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold">
                    {edition.status}
                  </span>
                </div>

                <div className="text-[11px] text-white/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span>Edital: {edition.officialNotice}</span>
                    <span>Data: {edition.examDate}</span>
                  </div>
                  <div className="flex items-center justify-between text-white/80 font-medium">
                    <span>100 Objetivas + 5 Discursivas</span>
                    {edition.annulledQuestions.length > 0 ? (
                      <span className="text-amber-400">{edition.annulledQuestions.length} Anuladas</span>
                    ) : (
                      <span className="text-emerald-400">0 Anuladas</span>
                    )}
                  </div>
                </div>

                {/* Booklet Badges & PDFs */}
                <div className="pt-2 border-t border-white/5 space-y-1.5">
                  <span className="text-[10px] font-bold text-white/40 uppercase block">
                    Cadernos de Aplicação & SHA-256:
                  </span>
                  {edition.booklets.map((b) => (
                    <div
                      key={b.code}
                      className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-[11px]"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="text-white/80 font-medium truncate">{b.color}</span>
                        <span className="text-white/40 text-[10px]">({b.pages} pág)</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleCopySha(b.sha256)}
                          title="Copiar Hash SHA-256 do PDF Oficial"
                          className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-colors"
                        >
                          {copiedSha === b.sha256 ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Hash className="w-3 h-3" />
                          )}
                        </button>

                        <a
                          href={b.officialUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Acessar no Portal INEP/gov.br"
                          className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Canonical Questions Explorer */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Questões Canônicas Filtradas ({filteredQuestions.length})
            </h3>
            <span className="text-xs text-white/50">
              Clique para inspecionar ocorrências nos cadernos
            </span>
          </div>

          <div className="space-y-3">
            {filteredQuestions.map((q) => {
              const hasGuidelineUpdate = !!q.guidelineUpdate;
              return (
                <div
                  key={q.id}
                  onClick={() => setSelectedCanonicalQuestion(q)}
                  className={`p-5 rounded-[24px] backdrop-blur-2xl border transition-all cursor-pointer shadow-xl ${
                    selectedCanonicalQuestion?.id === q.id
                      ? "bg-blue-600/15 border-blue-400 shadow-[0_0_25px_rgba(37,99,235,0.25)]"
                      : "bg-white/[0.03] border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 font-black text-[10px] tracking-wider border border-blue-400/30">
                        {q.code}
                      </span>
                      <span className="text-xs text-white/60 font-semibold">
                        {q.canonicalQuestionId}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {hasGuidelineUpdate && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-500/20 border border-purple-500/40 text-purple-300">
                          {q.guidelineUpdate?.status}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white/70">
                        Gabarito: {q.correctAnswer}
                      </span>
                    </div>
                  </div>

                  <h4 className="text-sm font-bold text-white mb-1.5">
                    {q.topic} — {q.subtopic}
                  </h4>
                  <p className="text-xs text-white/70 line-clamp-2 mb-3">
                    {q.clinicalCase}
                  </p>

                  {/* Booklet Cross-mapping */}
                  {q.occurrences && q.occurrences.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex flex-wrap items-center gap-3 text-[11px] text-white/60">
                      <span className="font-bold text-white/40 uppercase text-[10px]">Ocorrências:</span>
                      {q.occurrences.map((occ) => (
                        <span key={occ.booklet} className="flex items-center gap-1">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              occ.bookletColor === "Azul"
                                ? "bg-blue-400"
                                : occ.bookletColor === "Amarelo"
                                ? "bg-yellow-400"
                                : occ.bookletColor === "Verde"
                                ? "bg-emerald-400"
                                : "bg-white"
                            }`}
                          />
                          <strong className="text-white/90">Q.{occ.originalNumber}</strong> ({occ.bookletColor})
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/10 text-xs">
                    <span className="text-white/50 text-[11px]">
                      Página {q.sourcePage} do PDF oficial
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const idx = questions.findIndex((item) => item.id === q.id);
                        if (idx !== -1) {
                          setActiveQuestionIndex(idx);
                          setActiveTab("questions");
                        }
                      }}
                      className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1"
                    >
                      <span>Abrir no Solucionador</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
