import React, { useState, useEffect } from "react";
import {
  Search,
  ShieldCheck,
  Building2,
  Calendar,
  ExternalLink,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileText,
  Copy,
  Check,
  Globe2,
  ArrowRight,
  Filter,
  Zap,
} from "lucide-react";
import {
  OfficialSearchService,
  OfficialSearchResult,
  TOP_2026_HOT_TOPICS,
  OfficialSourcesDirectory,
} from "../../services/officialSearchService";
import { useApp } from "../../context/AppContext";

export const OfficialMedicalSearchView: React.FC<{ initialQuery?: string }> = ({
  initialQuery = "",
}) => {
  const { addToast } = useApp();
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<"gemini" | "sonnet" | "opus">("gemini");
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");
  const [result, setResult] = useState<OfficialSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourcesDir, setSourcesDir] = useState<OfficialSourcesDirectory | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    OfficialSearchService.getOfficialSourcesDirectory().then(setSourcesDir);
    if (initialQuery) {
      handleSearch(initialQuery);
    }
  }, [initialQuery]);

  const handleSearch = async (searchTerm?: string) => {
    const q = (searchTerm !== undefined ? searchTerm : query).trim();
    if (!q) return;

    setLoading(true);
    setError(null);

    try {
      const data = await OfficialSearchService.searchOfficialProtocol(q, {
        preferredModel: selectedModel,
      });
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Erro ao consultar fontes oficiais.");
    } finally {
      setLoading(false);
    }
  };

  const copyResultToClipboard = () => {
    if (!result) return;
    const text = `📋 PESQUISA MÉDICA OFICIAL - REVALIDA INEP 2026
Protocolo: ${result.protocolName}
Órgão Emissor: ${result.publisher} (${result.publicationYear})
Status: ${result.status}

🔄 MUDANÇA RELEVANTE:
${result.relevantChanges}

🏛️ CONDUTA PADRÃO-OURO NO SUS:
${result.susStandardConduct}

🎯 IMPACTO NO REVALIDA INEP:
${result.inepImpact}

🔗 FONTES OFICIAIS:
${result.officialSources.map((s) => `- ${s.title} (${s.uri})`).join("\n")}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    if (addToast) addToast("Ficha de atualização copiada!", "success");
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-8 pb-16 animate-fadeIn max-w-5xl mx-auto">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c121e] via-[#090e17] to-[#04070c] border border-emerald-500/20 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              FONTES GOVERNAMENTAIS & DIRETRIZES 2026
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/5 text-zinc-300 border border-white/10">
              <Globe2 className="w-3 h-3 text-cyan-400" />
              gov.br • saude.gov.br • conitec • inep • anvisa
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
            🔎 Pesquisa Médica Oficial
          </h1>
          <p className="text-sm text-zinc-300 max-w-2xl mt-1.5 leading-relaxed">
            Verifique condutas clínicas e PCDTs diretamente nas bases do <strong>Ministério da Saúde</strong>,{" "}
            <strong>CONITEC</strong>, <strong>ANVISA</strong> e <strong>INEP</strong>. Sem blogs secundários, apenas
            recomendações oficiais com impacto no Revalida 2026.
          </p>

          {/* Search Box Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="mt-6 flex flex-col sm:flex-row gap-2.5"
          >
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: Dose única vacina HPV, Rastreio CA Colo Uterino DNA-HPV, Dengue Grupo C..."
                className="w-full pl-11 pr-4 py-3.5 bg-black/60 border border-white/15 focus:border-emerald-500 rounded-2xl text-white placeholder:text-zinc-500 text-sm font-medium outline-none transition-all shadow-inner focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-6 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-white font-bold text-sm shadow-lg shadow-emerald-900/30 transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Auditando Fontes...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                  <span>Verificar Atualização</span>
                </>
              )}
            </button>
          </form>

          {/* Verified Official Sources Indicator */}
          <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-zinc-300">
              <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Busca Grounded em Tempo Real
              </span>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-400">PCDTs Oficiais & Manuais MS</span>
            </div>

            <div className="flex items-center gap-1.5 text-zinc-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Restrição estrita a domínios <strong>.gov.br</strong> e Sociedades Médicas Oficiais</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Trending 2026 Topics Carousel / Grid */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            🔥 Atualizações 2025–2026 de Alto Impacto no Revalida
          </h2>
          <span className="text-xs text-slate-400">Clique para auditar</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TOP_2026_HOT_TOPICS.slice(0, 4).map((item, idx) => (
            <button
              key={idx}
              onClick={() => {
                setQuery(item.topic);
                handleSearch(item.query);
              }}
              className="p-4 rounded-2xl bg-[#0f1424] hover:bg-[#151c32] border border-slate-800 hover:border-emerald-500/40 text-left transition-all group flex flex-col justify-between shadow-md cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between text-[10px] mb-2">
                  <span className="px-2 py-0.5 rounded-md font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {item.badge}
                  </span>
                  <span className="text-slate-400 font-medium truncate max-w-[120px]">
                    {item.publisher}
                  </span>
                </div>
                <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-emerald-300 transition-colors line-clamp-2">
                  {item.topic}
                </h3>
                <p className="text-xs text-slate-300 mt-1.5 line-clamp-2 leading-relaxed">
                  {item.highlight}
                </p>
              </div>

              <div className="mt-3 flex items-center gap-1 text-[11px] text-emerald-400 font-semibold pt-2 border-t border-slate-800">
                <span>Verificar Protocolo</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/10 text-center space-y-4 animate-pulse">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Consultando Bases Governamentais Oficiais...</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Filtrando em <em>saude.gov.br</em>, <em>bvsms</em>, <em>conitec</em> e diretrizes curriculares do <em>INEP</em>.
            </p>
          </div>
          <div className="flex justify-center gap-2 pt-2">
            <span className="px-3 py-1 rounded-full text-[10px] bg-white/5 text-zinc-300">Auditoria de Portarias</span>
            <span className="px-3 py-1 rounded-full text-[10px] bg-white/5 text-zinc-300">PCDT Vigente</span>
            <span className="px-3 py-1 rounded-full text-[10px] bg-white/5 text-zinc-300">Matriz de Distratores INEP</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && !loading && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-bold">Não foi possível completar a pesquisa:</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Search Results Display (The Core Card) */}
      {result && !loading && (
        <div className="space-y-6 animate-fadeIn">
          {/* Main Verified Protocol Card */}
          <div className="rounded-3xl bg-[#090d15] border border-white/10 overflow-hidden shadow-2xl">
            {/* Card Header */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-emerald-950/40 via-transparent to-transparent border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    PROTOCOLO OFICIAL SUS / INEP
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Vigência: {result.publicationYear}
                  </span>
                  {result.searchGroundingUsed && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                      <Globe2 className="w-3 h-3" />
                      Google Search Grounding Ativo
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-black text-white mt-2">
                  {result.protocolName}
                </h2>
                <p className="text-xs text-zinc-400 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                  <strong>Órgão Emissor:</strong> {result.publisher}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={copyResultToClipboard}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Ficha</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Core 4-Block Clinical Grid */}
            <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. Mudança Relevante */}
              <div className="p-4 rounded-2xl bg-amber-500/[0.04] border border-amber-500/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                  <RefreshCw className="w-4 h-4 text-amber-400" />
                  <span>1. Mudança Relevante (O que Mudou)</span>
                </div>
                <p className="text-xs text-zinc-200 leading-relaxed">
                  {result.relevantChanges}
                </p>
                {result.previousConduct && (
                  <div className="pt-2 mt-2 border-t border-amber-500/10 text-[11px] text-zinc-400">
                    <strong className="text-amber-400/80">Conduta Anterior:</strong> {result.previousConduct}
                  </div>
                )}
              </div>

              {/* 2. Impacto no Revalida INEP */}
              <div className="p-4 rounded-2xl bg-rose-500/[0.04] border border-rose-500/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-rose-300 uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>2. Impacto no Revalida INEP</span>
                </div>
                <p className="text-xs text-zinc-200 leading-relaxed">
                  {result.inepImpact}
                </p>
                {result.pitfallsInDistractors && (
                  <div className="pt-2 mt-2 border-t border-rose-500/10 text-[11px] text-rose-300/80">
                    <strong>Pegadinha de Prova:</strong> {result.pitfallsInDistractors}
                  </div>
                )}
              </div>

              {/* 3. Conduta Padrão-Ouro no SUS */}
              <div className="p-4 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>3. Conduta Padrão-Ouro no SUS (APS/RAS)</span>
                </div>
                <p className="text-xs text-zinc-200 leading-relaxed">
                  {result.susStandardConduct || result.currentConduct}
                </p>
              </div>

              {/* 4. Fontes Oficiais & Links Verificados */}
              <div className="p-4 rounded-2xl bg-cyan-500/[0.04] border border-cyan-500/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  <Globe2 className="w-4 h-4 text-cyan-400" />
                  <span>4. Fontes Oficiais Verificadas</span>
                </div>

                <div className="space-y-1.5 pt-1">
                  {result.officialSources.map((source, sIdx) => (
                    <a
                      key={sIdx}
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 rounded-xl bg-black/40 hover:bg-cyan-950/40 border border-cyan-500/20 hover:border-cyan-500/50 transition-all text-xs text-zinc-200 group"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">
                          {source.title}
                        </p>
                        <p className="text-[10px] text-zinc-400 truncate">{source.domain}</p>
                      </div>
                      <span className="p-1 rounded-lg bg-white/5 group-hover:bg-cyan-500/20 text-cyan-400 shrink-0">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* In-depth Analysis Markdown Accordion / Section */}
            {result.fullAnalysisMarkdown && (
              <div className="p-5 sm:p-6 bg-black/30 border-t border-white/10 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Análise Clínica Estruturada Completa</span>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans">
                  {result.fullAnalysisMarkdown}
                </div>
              </div>
            )}

            {/* Card Footer Telemetry */}
            <div className="px-5 sm:px-6 py-3 bg-black/60 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
              <span>
                Auditoria gerada via <strong>{result.modelUsed}</strong>
              </span>
              <span>
                Carimbo de data: {new Date(result.timestamp).toLocaleDateString("pt-BR")} às{" "}
                {new Date(result.timestamp).toLocaleTimeString("pt-BR")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Directory of Verified Official Domains (Trust Banner) */}
      <div className="rounded-3xl bg-[#0b0f1c] border border-slate-800 p-6 space-y-4 shadow-xl">
        <h3 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Bases Governamentais & Sociedades Auditadas
        </h3>
        <p className="text-xs sm:text-sm text-slate-300">
          Esta ferramenta restringe a busca a repositórios científicos e normativos de autoridade médica nacional:
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1 text-xs">
          <div className="p-3 rounded-xl bg-[#101526] border border-slate-800 shadow-sm">
            <span className="font-bold text-emerald-300 block">saude.gov.br</span>
            <span className="text-[11px] text-slate-400">PCDT / Portarias MS</span>
          </div>
          <div className="p-3 rounded-xl bg-[#101526] border border-slate-800 shadow-sm">
            <span className="font-bold text-emerald-300 block">bvsms</span>
            <span className="text-[11px] text-slate-400">Biblioteca Virtual MS</span>
          </div>
          <div className="p-3 rounded-xl bg-[#101526] border border-slate-800 shadow-sm">
            <span className="font-bold text-emerald-300 block">conitec.gov.br</span>
            <span className="text-[11px] text-slate-400">Tecnologias SUS</span>
          </div>
          <div className="p-3 rounded-xl bg-[#101526] border border-slate-800 shadow-sm">
            <span className="font-bold text-emerald-300 block">inep.gov.br</span>
            <span className="text-[11px] text-slate-400">Matriz Revalida</span>
          </div>
          <div className="p-3 rounded-xl bg-[#101526] border border-slate-800 shadow-sm">
            <span className="font-bold text-emerald-300 block">anvisa.gov.br</span>
            <span className="text-[11px] text-slate-400">Farmacovigilância</span>
          </div>
          <div className="p-3 rounded-xl bg-[#101526] border border-slate-800 shadow-sm">
            <span className="font-bold text-emerald-300 block">Sociedades (SBP/SBC)</span>
            <span className="text-[11px] text-slate-400">Diretrizes Clínicas</span>
          </div>
        </div>
      </div>
    </div>
  );
};
