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
  ShieldAlert,
  Layers,
  Target,
} from "lucide-react";
import { MEDICAL_AREAS_CONFIG, ALL_GRANDES_TEMAS } from "../../data/grandesTemas";
import { GrandeTema, MedicalAreaId, RecurrenceLevel } from "../../types/grandesTemas";
import { ThemeInteractiveLesson } from "./ThemeInteractiveLesson";
import { useApp } from "../../context/AppContext";
import { getAreaVisualTheme } from "../../config/areaThemes";

export const GrandesTemasView: React.FC = () => {
  const { setActiveTab, todayMission, knowledgeGraph } = useApp();
  const [selectedAreaId, setSelectedAreaId] = useState<MedicalAreaId | "todas">("todas");
  const [searchQuery, setSearchQuery] = useState("");
  const [recurrenceFilter, setRecurrenceFilter] = useState<RecurrenceLevel | "todas">("todas");
  const [onlyProtocolUpdates, setOnlyProtocolUpdates] = useState(false);
  const [activeTheme, setActiveTheme] = useState<GrandeTema | null>(null);

  // In-progress / Recommended study theme
  const inProgressTheme = useMemo(() => {
    const focusTitle = todayMission?.focusTopic?.toLowerCase();
    if (focusTitle) {
      const found = ALL_GRANDES_TEMAS.find((t) =>
        t.title.toLowerCase().includes(focusTitle) || focusTitle.includes(t.title.toLowerCase())
      );
      if (found) return found;
    }

    if (Array.isArray(knowledgeGraph) && knowledgeGraph.length > 0) {
      const topWeakness = [...knowledgeGraph].sort(
        (a, b) => (b?.expectedPointGain ?? 0) - (a?.expectedPointGain ?? 0)
      )[0];
      if (topWeakness?.name) {
        const found = ALL_GRANDES_TEMAS.find((t) =>
          t.title.toLowerCase().includes(topWeakness.name.toLowerCase()) ||
          topWeakness.name.toLowerCase().includes(t.title.toLowerCase())
        );
        if (found) return found;
      }
    }

    return null;
  }, [todayMission, knowledgeGraph]);

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
      case "cirurgia":
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
      {/* 1. CONTINUAR ESTUDANDO (Exibido se houver tema prioritário/em andamento) */}
      {inProgressTheme && (
        <div className="bg-gradient-to-br from-[#0B192C] via-[#10243E] to-[#0A1A2F] text-white border border-[#1B355A] rounded-3xl p-6 sm:p-7 shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                <Target className="w-3.5 h-3.5 text-teal-400" />
                <span>Continuar Estudando</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {inProgressTheme.title}
              </h2>
              <p className="text-xs text-slate-300">
                Área: <span className="text-teal-300 font-medium">{getAreaVisualTheme(inProgressTheme.areaId).name}</span> • Recorrência histórica: {inProgressTheme.recurrence === "altissima" ? "Altíssima" : inProgressTheme.recurrence === "alta" ? "Alta" : "Média"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveTheme(inProgressTheme)}
              className="px-5 py-3 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all hover:scale-[1.02] cursor-pointer shrink-0"
            >
              <span>Continuar estudo</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 2. COMPACT HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shadow-xs shadow-teal-500/50" />
            <span>Grandes Temas do Revalida</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Os 75 temas essenciais da Taxonomia Canônica StaziaMed organizados nas 5 grandes áreas médicas do Revalida INEP.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-white border border-slate-200/80 px-3.5 py-1.5 rounded-xl shadow-2xs self-start sm:self-auto">
          <span className="text-teal-700 font-bold">75</span>
          <span>Grandes Temas</span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-700 font-bold">5</span>
          <span>Áreas</span>
        </div>
      </div>

      {/* 3. 5 MEDICAL AREA FILTER PILLS (SISTEMA CENTRALIZADO DE CORES) */}
      <div className="flex items-center gap-1.5 bg-slate-100/90 border border-slate-200/80 p-1 rounded-2xl overflow-x-auto">
        <button
          onClick={() => setSelectedAreaId("todas")}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            selectedAreaId === "todas"
              ? "bg-teal-600 text-white font-bold shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-white"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Todas as Áreas</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              selectedAreaId === "todas" ? "bg-teal-700 text-teal-100" : "bg-slate-200 text-slate-600"
            }`}
          >
            75
          </span>
        </button>

        {MEDICAL_AREAS_CONFIG.map((area) => {
          const Icon = getAreaIcon(area.id);
          const isSelected = selectedAreaId === area.id;
          const areaTheme = getAreaVisualTheme(area.id);

          return (
            <button
              key={area.id}
              onClick={() => setSelectedAreaId(area.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                isSelected
                  ? `${areaTheme.activePillBg} text-white font-bold shadow-xs`
                  : "text-slate-600 hover:text-slate-900 hover:bg-white"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{area.shortName || area.name}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  isSelected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                }`}
              >
                {area.themeCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* 4. SEARCH & RECURRENCE BAR */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar tema, doença ou conduta..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 transition shadow-inner"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={recurrenceFilter}
            onChange={(e) => setRecurrenceFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-teal-500 cursor-pointer"
          >
            <option value="todas">Todas as Recorrências</option>
            <option value="altissima">🔥 Altíssima Recorrência</option>
            <option value="alta">🔴 Alta Recorrência</option>
            <option value="media">🟡 Média Recorrência</option>
          </select>

          <button
            onClick={() => setOnlyProtocolUpdates(!onlyProtocolUpdates)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
              onlyProtocolUpdates
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            <span>Diretrizes Atualizadas</span>
          </button>
        </div>
      </div>

      {/* 5. 75 THEMES COMPACT SCANNABLE GRID (COM SINALIZAÇÃO CROMÁTICA DISCRETA) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <div>
            Exibindo <strong>{filteredThemes.length}</strong> de {ALL_GRANDES_TEMAS.length} Grandes Temas
          </div>
          {selectedAreaId !== "todas" && (
            <div className="font-medium text-teal-700">
              {MEDICAL_AREAS_CONFIG.find((a) => a.id === selectedAreaId)?.name}
            </div>
          )}
        </div>

        {filteredThemes.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center space-y-3 shadow-xs">
            <BookOpenCheck className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="text-slate-800 font-bold text-sm">Nenhum Grande Tema encontrado</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Tente ajustar os termos da busca ou limpar os filtros de área e recorrência.
            </p>
            <button
              onClick={() => {
                setSelectedAreaId("todas");
                setSearchQuery("");
                setRecurrenceFilter("todas");
                setOnlyProtocolUpdates(false);
              }}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold transition cursor-pointer"
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredThemes.map((tema) => {
              const AreaIcon = getAreaIcon(tema.areaId);
              const areaTheme = getAreaVisualTheme(tema.areaId);

              return (
                <div
                  key={tema.id}
                  onClick={() => setActiveTheme(tema)}
                  className={`bg-white hover:bg-slate-50/80 border border-slate-200/80 ${areaTheme.borderLeft} border-l-[3.5px] rounded-2xl p-4.5 cursor-pointer transition flex flex-col justify-between group shadow-2xs hover:shadow-xs space-y-3`}
                >
                  <div className="space-y-2">
                    {/* Top Row: Area Tag with semantic area color & Recurrence */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${areaTheme.badgeBg} ${areaTheme.badgeText} ${areaTheme.badgeBorder}`}>
                        <AreaIcon className={`w-3 h-3 ${areaTheme.iconColor}`} />
                        <span>{areaTheme.name}</span>
                      </span>

                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200/60 flex items-center gap-1">
                        <Flame className="w-3 h-3 text-amber-500" />
                        <span>
                          {tema.recurrence === "altissima"
                            ? "Altíssima"
                            : tema.recurrence === "alta"
                            ? "Alta"
                            : "Média"}
                        </span>
                      </span>
                    </div>

                    {/* Theme Title */}
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-700 transition tracking-tight line-clamp-2 leading-snug">
                      {tema.title}
                    </h3>

                    {/* Protocol Update Alert if exists */}
                    {tema.hasProtocolUpdate && (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/60">
                        <ShieldAlert className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>Diretriz atualizada</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Meta & CTA Bar */}
                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                      <Clock className="w-3 h-3" />
                      <span>~{tema.estimatedMinutes}</span>
                    </div>

                    <div className="flex items-center gap-1 text-teal-700 font-bold text-xs group-hover:translate-x-0.5 transition-transform">
                      <span>Estudar Tema</span>
                      <ChevronRight className="w-3.5 h-3.5" />
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
