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
  BookmarkCheck,
  AlertCircle,
  ChevronDown,
  ChevronUp,
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
  const [result, setResult] = useState<OfficialSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourcesDir, setSourcesDir] = useState<OfficialSourcesDirectory | null>(null);
  const [copied, setCopied] = useState(false);
  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(false);

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
    setIsAnalysisExpanded(false);

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
    const text = `📋 PESQUISA MÉDICA DOCUMENTAL - STAZIAMED REVALIDA
Documento: ${result.protocolName}
Órgão / Emissor: ${result.publisher} (${result.publicationYear})
Classificação: ${result.sourceTypeLabel || "Fonte Verificada"}
Status: ${result.status}

🔄 MUDANÇA RELEVANTE:
${result.relevantChanges}

🏛️ CONDUTA:
${result.susStandardConduct || result.currentConduct}

🎯 APLICAÇÃO PARA O REVALIDA INEP (SÍNTESE PEDAGÓGICA):
${result.inepImpact}

🔗 FONTES ORIGINAIS:
${result.officialSources.map((s) => `- ${s.title} (${s.uri})`).join("\n")}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    if (addToast) addToast("Ficha documental copiada!", "success");
    setTimeout(() => setCopied(false), 2500);
  };

  const primarySourceUrl = result?.officialSources?.[0]?.uri || "#";

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto">
      {/* 1. COMPACT DOCUMENT-FIRST HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
            <span>Materiais Oficiais & Diretrizes</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Consulte PCDTs, protocolos do Ministério da Saúde, documentos do INEP e diretrizes de sociedades científicas.
          </p>
        </div>

        <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl self-start sm:self-auto max-w-xs shadow-2xs leading-snug">
          A vigência é indicada quando confirmada na fonte. Consulte sempre o documento original.
        </div>
      </div>

      {/* 2. PROTAGONIST SEARCH BAR */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-xs">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por PCDT, doença, portaria, tema ou diretriz (ex: Dengue, Vacina HPV, Hipertensão)..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition shadow-inner"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Buscando Fontes...</span>
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                <span>Pesquisar Documento</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Repositórios rastreados: saude.gov.br • conitec • bvsms • inep • anvisa • sociedades</span>
          </div>
          <span>PCDTs, Portarias e Diretrizes Médicas</span>
        </div>
      </div>

      {/* 3. QUICK TRENDING TOPICS (DOCUMENT CURATION) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span>Atualizações Normativas & Clínicas em Destaque</span>
          </h2>
          <span className="text-[11px] text-slate-400">Clique para consultar</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {TOP_2026_HOT_TOPICS.slice(0, 4).map((item, idx) => (
            <button
              key={idx}
              onClick={() => {
                setQuery(item.topic);
                handleSearch(item.query);
              }}
              className="p-3.5 rounded-xl bg-white hover:bg-slate-50/80 border border-slate-200/80 text-left transition group flex flex-col justify-between shadow-2xs hover:shadow-xs cursor-pointer space-y-2"
            >
              <div>
                <div className="flex items-center justify-between text-[10px] mb-1.5">
                  <span className="px-2 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                    {item.badge}
                  </span>
                  <span className="text-slate-400 truncate max-w-[110px]">
                    {item.publisher}
                  </span>
                </div>
                <h3 className="text-xs font-bold text-slate-800 group-hover:text-emerald-700 transition line-clamp-2 leading-snug">
                  {item.topic}
                </h3>
              </div>

              <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold pt-1 border-t border-slate-100">
                <span>Consultar documento</span>
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 4. LOADING STATE */}
      {loading && (
        <div className="p-8 rounded-2xl bg-white border border-slate-200/80 text-center space-y-3 shadow-xs">
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Consultando Repositórios Documentais...</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Filtrando em bases governamentais e diretrizes científicas brasileiras.
            </p>
          </div>
        </div>
      )}

      {/* 5. ERROR STATE */}
      {error && !loading && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-bold">Não foi possível consultar os documentos:</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* 6. DOCUMENT-FIRST RESULT CARD */}
      {result && !loading && (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
            {/* Camada 1: Identificação Institucional e Metadados Documentais */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-100 pb-5">
              <div className="space-y-2 max-w-2xl">
                {/* Badges de Proveniência e Vigência */}
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <BookmarkCheck className="w-3 h-3 text-emerald-600" />
                    <span>{result.sourceTypeLabel || "Fonte Verificada"}</span>
                  </span>

                  {result.versionStatus === "CURRENT_VERIFIED" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>Vigência Confirmada</span>
                    </span>
                  ) : result.versionStatus === "SUPERSEDED" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                      <span>Documento Substituído</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertCircle className="w-3 h-3 text-amber-600" />
                      <span>Vigência a Confirmar na Fonte</span>
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-slate-500 bg-slate-50 border border-slate-200">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>Publicação: {result.publicationYear}</span>
                  </span>
                </div>

                {/* Título Principal do Documento */}
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-snug">
                  {result.protocolName}
                </h2>

                {/* Órgão / Emissor */}
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Órgão / Emissor: <strong className="text-slate-700 font-semibold">{result.publisher}</strong></span>
                </p>
              </div>

              {/* Camada 2: Ações Documentais — CTA Primário Abrir Fonte Original */}
              <div className="flex flex-col sm:flex-row md:flex-col items-stretch md:items-end gap-2 shrink-0">
                {result.officialSources?.[0]?.uri ? (
                  <a
                    href={primarySourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Abrir Fonte Original</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={copyResultToClipboard}
                  className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copiar Ficha</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Fontes Primárias Consultadas (Compacto) */}
            {result.officialSources && result.officialSources.length > 0 && (
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Fontes e Links Verificados</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {result.officialSources.map((source, sIdx) => (
                    <a
                      key={sIdx}
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-lg bg-white hover:bg-slate-100/80 border border-slate-200 transition text-xs flex items-center justify-between group shadow-2xs"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-slate-800 group-hover:text-emerald-700 truncate">
                          {source.title}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {source.sourceTypeLabel ? `${source.sourceTypeLabel} • ` : ""}
                          {source.domain}
                        </p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Camada 3: Síntese StaziaMed / Leitura para o Revalida */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Síntese Analítica StaziaMed</span>
                </div>
                <span className="text-[10px] text-slate-400">Leitura estruturada para o Revalida</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Mudança Relevante */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                    <span>Mudança Relevante</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {result.relevantChanges}
                  </p>
                </div>

                {/* 2. Conduta no SUS / Especialidade */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      {result.sourceType === "GOVERNMENT_HEALTH"
                        ? "Conduta Padrão SUS"
                        : "Recomendação Clínica"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {result.susStandardConduct || result.currentConduct}
                  </p>
                </div>

                {/* 3. Aplicação no Revalida INEP */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Aplicação no Revalida</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {result.inepImpact}
                  </p>
                </div>
              </div>

              {/* Análise Estruturada Completa Expansível */}
              {result.fullAnalysisMarkdown && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAnalysisExpanded(!isAnalysisExpanded)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold transition flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{isAnalysisExpanded ? "Ocultar análise estruturada completa" : "Ver análise estruturada completa"}</span>
                    </span>
                    {isAnalysisExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {isAnalysisExpanded && (
                    <div className="mt-2 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                      {result.fullAnalysisMarkdown}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. DIRECTORY OF VERIFIED DOMAINS (TRUST FOOTER) */}
      <div className="rounded-2xl bg-white border border-slate-200/80 p-4.5 space-y-3 shadow-2xs">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Bases Governamentais & Sociedades Científicas Catalogadas</span>
        </h3>
        <p className="text-xs text-slate-500">
          A pesquisa restringe consultas a repositórios científicos e normativos de autoridade médica nacional:
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 shadow-2xs">
            <span className="font-bold text-slate-800 block text-[11px]">saude.gov.br</span>
            <span className="text-[10px] text-slate-400">PCDTs / Portarias MS</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 shadow-2xs">
            <span className="font-bold text-slate-800 block text-[11px]">bvsms</span>
            <span className="text-[10px] text-slate-400">Biblioteca Virtual MS</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 shadow-2xs">
            <span className="font-bold text-slate-800 block text-[11px]">conitec.gov.br</span>
            <span className="text-[10px] text-slate-400">Tecnologias SUS</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 shadow-2xs">
            <span className="font-bold text-slate-800 block text-[11px]">inep.gov.br</span>
            <span className="text-[10px] text-slate-400">Matriz Revalida</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 shadow-2xs">
            <span className="font-bold text-slate-800 block text-[11px]">anvisa.gov.br</span>
            <span className="text-[10px] text-slate-400">Farmacovigilância</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 shadow-2xs">
            <span className="font-bold text-slate-800 block text-[11px]">Sociedades Médicas</span>
            <span className="text-[10px] text-slate-400">Diretrizes Clínicas</span>
          </div>
        </div>
      </div>
    </div>
  );
};
