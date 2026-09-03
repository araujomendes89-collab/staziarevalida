import React, { useState, useMemo } from "react";
import {
  BookOpenCheck,
  Search,
  Flame,
  Clock,
  Sparkles,
  Stethoscope,
  Scissors,
  Baby,
  HeartPulse,
  ShieldCheck,
  ChevronRight,
  Filter,
  CheckCircle2,
  TrendingUp,
  FileQuestion,
  ShieldAlert,
  Layers,
  Award,
  Zap,
} from "lucide-react";
import { MEDICAL_AREAS_CONFIG, ALL_GRANDES_TEMAS } from "../../data/grandesTemas";
import { GrandeTema, MedicalAreaId, RecurrenceLevel } from "../../types/grandesTemas";
import { ThemeInteractiveLesson } from "./ThemeInteractiveLesson";
import { useApp } from "../../context/AppContext";

export const GrandesTemasView: React.FC = () => {
  const { setActiveTab } = useApp();
  const [selectedAreaId, setSelectedAreaId] = useState<MedicalAreaId | "todas">("todas");
  const [searchQuery, setSearchQuery] = useState("");
  const [recurrenceFilter, setRecurrenceFilter] = useState<RecurrenceLevel | "todas">("todas");
  const [onlyProtocolUpdates, setOnlyProtocolUpdates] = useState(false);
  const [activeTheme, setActiveTheme] = useState<GrandeTema | null>(null);

  // Filtered list
  const filteredThemes = useMemo(() => {
    return ALL_GRANDES_TEMAS.filter((tema) => {
      // Area filter
      if (selectedAreaId !== "todas" && tema.areaId !== selectedAreaId) {
        return false;
      }
      // Recurrence filter
      if (recurrenceFilter !== "todas" && tema.recurrence !== recurrenceFilter) {
        return false;
      }
      // Protocol update filter
      if (onlyProtocolUpdates && !tema.hasProtocolUpdate) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = tema.title.toLowerCase().includes(q);
        const matchesSummary = tema.summary.toLowerCase().includes(q);
        const matchesDiagnosis = tema.inepInsights.mostTestedDiagnosis.toLowerCase().includes(q);
        const matchesConduct = tema.inepInsights.mostTestedConduct.toLowerCase().includes(q);
        return matchesTitle || matchesSummary || matchesDiagnosis || matchesConduct;
      }
      return true;
    });
  }, [selectedAreaId, recurrenceFilter, onlyProtocolUpdates, searchQuery]);

  // Area icons map
  const getAreaIcon = (areaId: MedicalAreaId) => {
    switch (areaId) {
      case "clinica-medica":
        return Stethoscope;
      case "cirurgia-geral":
        return Scissors;
      case "pediatria":
        return Baby;
      case "ginecologia-obstetricia":
        return HeartPulse;
      case "medicina-preventiva":
        return ShieldCheck;
      default:
        return BookOpenCheck;
    }
  };

  const handleOpenQuestions = (themeTitle: string) => {
    // Navigate to questions bank with the topic
    setActiveTab("questions");
  };

  // If a theme is opened for full interactive lesson
  if (activeTheme) {
    return (
      <ThemeInteractiveLesson
        tema={activeTheme}
        onBack={() => setActiveTheme(null)}
        onOpenQuestions={handleOpenQuestions}
      />
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <BookOpenCheck className="w-3.5 h-3.5" />
              Módulo Estruturante Revalida INEP
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Grandes Temas do Revalida
            </h1>
            <p className="text-zinc-400 text-sm sm:text-base max-w-2xl leading-relaxed">
              Matriz completa dos <strong>75 assuntos de maior relevância e recorrência histórica</strong> no Revalida INEP, distribuídos uniformemente pelas 5 grandes áreas da Medicina com diretrizes e condutas do SUS.
            </p>
          </div>

          {/* Quick Metrics Badge */}
          <div className="grid grid-cols-3 gap-3 bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 self-start md:self-auto">
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-blue-400">75</div>
              <div className="text-[11px] text-zinc-400 font-medium">Grandes Temas</div>
            </div>
            <div className="text-center border-x border-zinc-800 px-3">
              <div className="text-xl sm:text-2xl font-bold text-emerald-400">5</div>
              <div className="text-[11px] text-zinc-400 font-medium">Áreas Médicas</div>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-amber-400">100%</div>
              <div className="text-[11px] text-zinc-400 font-medium">Foco no SUS</div>
            </div>
          </div>
        </div>
      </div>

      {/* 5 Medical Area Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <button
          onClick={() => setSelectedAreaId("todas")}
          className={`p-3.5 rounded-xl border transition text-left flex flex-col justify-between ${
            selectedAreaId === "todas"
              ? "bg-zinc-800 border-blue-500 text-white shadow-md"
              : "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <Layers className="w-5 h-5 text-blue-400" />
            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-zinc-950 text-zinc-300">
              75
            </span>
          </div>
          <div className="text-xs font-semibold">Todas as Áreas</div>
        </button>

        {MEDICAL_AREAS_CONFIG.map((area) => {
          const Icon = getAreaIcon(area.id);
          const isSelected = selectedAreaId === area.id;

          return (
            <button
              key={area.id}
              onClick={() => setSelectedAreaId(area.id)}
              className={`p-3.5 rounded-xl border transition text-left flex flex-col justify-between ${
                isSelected
                  ? `bg-zinc-800 ${area.colorTheme.border} text-white shadow-md`
                  : "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-5 h-5 ${area.colorTheme.text}`} />
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-zinc-950 text-zinc-300">
                  {area.themeCount}
                </span>
              </div>
              <div className="text-xs font-semibold truncate">{area.name}</div>
            </button>
          );
        })}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por tema, conduta do SUS, diagnóstico ou palavras-chave..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Recurrence Filter */}
          <select
            value={recurrenceFilter}
            onChange={(e) => setRecurrenceFilter(e.target.value as any)}
            className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
          >
            <option value="todas">Todas as Recorrências</option>
            <option value="altissima">🔥 Altíssima Recorrência</option>
            <option value="alta">🔴 Alta Recorrência</option>
            <option value="media">🟡 Média Recorrência</option>
          </select>

          {/* Protocol Update Toggle */}
          <button
            onClick={() => setOnlyProtocolUpdates(!onlyProtocolUpdates)}
            className={`px-3 py-2 rounded-lg text-xs font-medium border transition flex items-center gap-1.5 ${
              onlyProtocolUpdates
                ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            Apenas Diretrizes Atualizadas
          </button>
        </div>
      </div>

      {/* Themes Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
          <div>
            Exibindo <strong>{filteredThemes.length}</strong> de {ALL_GRANDES_TEMAS.length} Grandes Temas
          </div>
          {selectedAreaId !== "todas" && (
            <div className="text-zinc-500 font-mono">
              Filtro ativo: {MEDICAL_AREAS_CONFIG.find((a) => a.id === selectedAreaId)?.name}
            </div>
          )}
        </div>

        {filteredThemes.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center space-y-3">
            <BookOpenCheck className="w-10 h-10 text-zinc-600 mx-auto" />
            <div className="text-white font-semibold">Nenhum Grande Tema encontrado</div>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Tente ajustar os termos da busca ou limpar os filtros de área e recorrência.
            </p>
            <button
              onClick={() => {
                setSelectedAreaId("todas");
                setSearchQuery("");
                setRecurrenceFilter("todas");
                setOnlyProtocolUpdates(false);
              }}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 text-xs font-semibold transition"
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredThemes.map((tema) => {
              const AreaIcon = getAreaIcon(tema.areaId);

              return (
                <div
                  key={tema.id}
                  onClick={() => setActiveTheme(tema)}
                  className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 cursor-pointer transition flex flex-col justify-between group shadow-sm hover:shadow-md"
                >
                  <div className="space-y-3">
                    {/* Top Row: Area Tag & Recurrence */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
                        <AreaIcon className="w-3 h-3 text-blue-400" />
                        {tema.areaName}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                        {tema.recurrenceBadgeLabel}
                      </span>
                    </div>

                    {/* Theme Title */}
                    <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition tracking-tight">
                      {tema.title}
                    </h3>

                    {/* Short Summary */}
                    <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
                      {tema.summary}
                    </p>

                    {/* Protocol Update Alert if exists */}
                    {tema.hasProtocolUpdate && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-950/40 text-amber-300 border border-amber-500/30">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span>Atualização de Diretriz Oficial</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Meta Bar */}
                  <div className="pt-4 mt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{tema.estimatedMinutes}</span>
                    </div>

                    <div className="flex items-center gap-1 text-blue-400 font-semibold group-hover:translate-x-1 transition">
                      <span>Acessar Aula</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
