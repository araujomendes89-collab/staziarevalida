import React, { useState, useMemo } from "react";
import {
  Tv,
  CheckCircle2,
  Clock,
  BookOpen,
  Search,
  ChevronRight,
  Sparkles,
  FileText,
  Volume2,
  Download,
  Layers,
  ArrowLeft,
  GraduationCap,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { getAreaVisualTheme } from "../../config/areaThemes";

export interface VideoLesson {
  id: string;
  title: string;
  area: string;
  theme: string;
  durationMinutes: number;
  instructor: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  summary: string;
  keyPoints: string[];
  materialsCount: number;
  progressPercent?: number;
  lastWatchedAt?: string;
  isCompleted?: boolean;
}

export const SAMPLE_VIDEO_LESSONS: VideoLesson[] = [
  {
    id: "aula-1",
    title: "Síndromes Hipertensivas na Gestação & Pré-Eclâmpsia Grave",
    area: "GINECOLOGIA_OBSTETRICIA",
    theme: "Obstetrícia de Alto Risco",
    durationMinutes: 42,
    instructor: "Dra. Camila Vasconcelos (USP / FEBRASGO)",
    summary: "Diagnóstico diferencial entre PE leve vs grave, critérios de gravidade, sulfato de magnésio (esquema Pritchard vs Zuspan), anti-hipertensivos de urgência e momento do parto.",
    keyPoints: [
      "Indicação clássica de Sulfatação: critérios de iminência de eclâmpsia",
      "Primeira linha na crise hipertensiva: Hidralazina IV ou Nifedipino oral",
      "Conduta na síndrome HELLP: interrupção da gestação após estabilização",
    ],
    materialsCount: 3,
  },
  {
    id: "aula-2",
    title: "Síndrome Coronariana Aguda (SCA) com e sem Supra de ST",
    area: "CLINICA_MEDICA",
    theme: "Cardiologia de Emergência",
    durationMinutes: 55,
    instructor: "Dr. Eduardo Arantes (InCor / SBC)",
    summary: "Interpretação do ECG em 10 minutos, delta de troponina ultrassensível, estratificação de risco TIMI/GRACE, terapia anti-isquêmica e indicação de cineangiocoronariografia.",
    keyPoints: [
      "Tempo porta-balão < 90 min (ou < 120 min com transferência)",
      "Dupla antiagregação: AAS + Ticagrelor/Clopidogrel",
      "Contraindicações absolutas à trombólise",
    ],
    materialsCount: 4,
  },
  {
    id: "aula-3",
    title: "Manejo da Sepse & Choque Séptico: Atualizações ILAS / Surviving Sepsis",
    area: "CLINICA_MEDICA",
    theme: "Terapia Intensiva e Urgência",
    durationMinutes: 48,
    instructor: "Dr. Marcelo Bittencourt (AMIB)",
    summary: "Identificação rápida com qSOFA vs SOFA, pacote da 1ª hora, cristaloides balanceados (30 ml/kg), antibioticoterapia precoce e noradrenalina precoce.",
    keyPoints: [
      "Lactato arterial e ressuscitação volêmica dirigida por metas",
      "Vasopressor de primeira escolha: Noradrenalina",
      "Corticoterapia na sepse refratária a vasopressores",
    ],
    materialsCount: 2,
  },
  {
    id: "aula-4",
    title: "Trauma Abdominal Fechado & Indicações de Laparotomia Imediata",
    area: "CIRURGIA_GERAL",
    theme: "Cirurgia do Trauma & ATLS 10ª Ed.",
    durationMinutes: 38,
    instructor: "Dr. Rodrigo Fagundes (HC-FMUSP / CBC)",
    summary: "Avaliação sistemática ABCDE, FAST / E-FAST nos 4 quadrantes, conduta no paciente instável vs estável, tomografia computadorizada e manejo conservador do baço/fígado.",
    keyPoints: [
      "Instabilidade hemodinâmica + FAST positivo = Laparotomia exploradora",
      "Classificação tomográfica das lesões esplênicas",
      "Sinais de peritonite e evisceração",
    ],
    materialsCount: 3,
  },
  {
    id: "aula-5",
    title: "Pneumonias Adquiridas na Comunidade na Infância (PAC) & Bronquiolite",
    area: "PEDIATRIA",
    theme: "Infectologia e Pneumologia Pediátrica",
    durationMinutes: 45,
    instructor: "Dra. Beatriz Nogales (SBP)",
    summary: "Critérios de internação hospitalar, taquipneia por faixa etária segundo OMS/MS, escolha do antimicrobiano empírico e manejo de suporte na bronquiolite viral aguda.",
    keyPoints: [
      "Taquipneia como marcador isolado mais fidedigno de pneumonia",
      "Amoxicilina em altas doses (80-90 mg/kg/dia) como 1ª escolha",
      "Não prescrever broncodilatadores de rotina na bronquiolite viral",
    ],
    materialsCount: 3,
  },
  {
    id: "aula-6",
    title: "Princípios do SUS, Atenção Primária & Financiamento (Previne Brasil / Portaria 2026)",
    area: "MEDICINA_FAMILIA_COMUNIDADE",
    theme: "Saúde Coletiva & SUS",
    durationMinutes: 50,
    instructor: "Prof. Henrique Diniz (SBMFC / UnB)",
    summary: "Princípios doutrinários e organizativos, Política Nacional de Atenção Básica (PNAB), atributos de Starfield, indicadores de desempenho e vigilância em saúde.",
    keyPoints: [
      "Atributos essenciais e derivados da Atenção Primária",
      "Universalidade, Integralidade e Equidade",
      "Notificação compulsória imediata vs semanal (SINAN)",
    ],
    materialsCount: 5,
  },
  {
    id: "aula-7",
    title: "Hemorragia Digestiva Alta (HDA) Varicosa e Não-Varicosa",
    area: "CIRURGIA_GERAL",
    theme: "Emergências Cirúrgicas",
    durationMinutes: 40,
    instructor: "Dr. André Lourenço (CBC)",
    summary: "Escore de Rockall e Glasgow-Blatchford, EDA precoce em 24h, IBP em infusão contínua, terlipressina/octreotide e profilaxia de PBE.",
    keyPoints: [
      "Classificação de Forrest para úlcera péptica",
      "Ligadura elástica como padrão-ouro em varizes de esôfago",
      "Antibioticoprofilaxia com ceftriaxona na cirrose",
    ],
    materialsCount: 2,
  },
  {
    id: "aula-8",
    title: "Rastreamento do Câncer de Colo Uterino & Lesões Precursoras",
    area: "GINECOLOGIA_OBSTETRICIA",
    theme: "Ginecologia Preventiva & Oncologia",
    durationMinutes: 36,
    instructor: "Dra. Mariana Fontes (INCA / FEBRASGO)",
    summary: "Diretrizes brasileiras do INCA/MS para colpocitologia oncótica, conduta frente a ASC-US, ASC-H, LIE-BG e LIE-AG, e indicações de colposcopia e biópsia.",
    keyPoints: [
      "Periodicidade do preventivo: trienal após 2 exames anuais negativos",
      "Idade de rastreamento: 25 aos 64 anos em mulheres com sexarca",
      "Conduta no LIE-AG: encaminhamento imediato para colposcopia",
    ],
    materialsCount: 4,
  },
];

const AREA_FILTERS = [
  { id: "ALL", label: "Todas as Áreas", areaKey: "todas" },
  { id: "CLINICA_MEDICA", label: "Clínica Médica", areaKey: "clinica-medica" },
  { id: "CIRURGIA_GERAL", label: "Cirurgia Geral", areaKey: "cirurgia-geral" },
  { id: "PEDIATRIA", label: "Pediatria", areaKey: "pediatria" },
  { id: "GINECOLOGIA_OBSTETRICIA", label: "Ginecologia e Obstetrícia", areaKey: "ginecologia-obstetricia" },
  { id: "MEDICINA_FAMILIA_COMUNIDADE", label: "Medicina Preventiva e Saúde Coletiva", areaKey: "medicina-preventiva" },
];

export const VideoLessonsCatalogView: React.FC = () => {
  const { setActiveTab } = useApp();
  const [selectedArea, setSelectedArea] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeLesson, setActiveLesson] = useState<VideoLesson | null>(null);

  // Filter lessons
  const filteredLessons = useMemo(() => {
    return SAMPLE_VIDEO_LESSONS.filter((lesson) => {
      if (selectedArea !== "ALL" && lesson.area !== selectedArea) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          lesson.title.toLowerCase().includes(q) ||
          lesson.instructor.toLowerCase().includes(q) ||
          lesson.summary.toLowerCase().includes(q) ||
          lesson.theme.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [selectedArea, searchQuery]);

  // View: LESSON_PREVIEW / DETALHE DA ESTRUTURA DA AULA
  if (activeLesson) {
    const areaTheme = getAreaVisualTheme(activeLesson.area);

    return (
      <div className="space-y-6 pb-20 max-w-5xl mx-auto">
        {/* Top Back Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setActiveLesson(null)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>Voltar para o Catálogo de Aulas</span>
          </button>
        </div>

        {/* Video Preview Stage (Sem simulação de player ou timers fake) */}
        <div className="bg-gradient-to-br from-[#0B192C] via-[#10243E] to-[#0A1A2F] text-white border border-[#1B355A] rounded-3xl overflow-hidden shadow-md">
          <div className="aspect-video w-full relative flex flex-col justify-between p-6 sm:p-8 bg-black/40 border-b border-white/10">
            <div className="flex items-center justify-between">
              <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${areaTheme.badgeBg} ${areaTheme.badgeText} ${areaTheme.badgeBorder}`}>
                {areaTheme.name}
              </span>
              <span className="text-xs text-slate-300 flex items-center gap-1 font-mono">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Estimativa: ~{activeLesson.durationMinutes} min</span>
              </span>
            </div>

            <div className="text-center space-y-3 max-w-lg mx-auto my-auto">
              <div className="w-16 h-16 rounded-full bg-teal-500/20 border border-teal-500/30 text-teal-300 flex items-center justify-center mx-auto shadow-lg">
                <Tv className="w-7 h-7" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                {activeLesson.title}
              </h2>
              <p className="text-xs text-slate-300">
                {activeLesson.instructor} • {activeLesson.theme}
              </p>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-teal-300 text-xs font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Estrutura e preview teórico-prático para o Revalida</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 border-t border-white/10 pt-3">
              <span>Módulo Audiovisual StaziaMed</span>
              <span>Diretrizes e Condutas do SUS</span>
            </div>
          </div>

          {/* Lesson Content Body */}
          <div className="p-6 sm:p-8 space-y-6 bg-white text-slate-900">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
              <div className="space-y-1">
                <div className="text-xs text-slate-500">
                  Área: <strong className="text-slate-800">{areaTheme.name}</strong> • Tema: <strong className="text-slate-800">{activeLesson.theme}</strong>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{activeLesson.title}</h1>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 pt-0.5">
                  <GraduationCap className="w-3.5 h-3.5 text-teal-600" />
                  <span>Ministrado por: <strong className="text-slate-700">{activeLesson.instructor}</strong></span>
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setActiveTab("praticar-questoes")}
                  className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>Treinar Questões Deste Tema</span>
                </button>
              </div>
            </div>

            {/* Summary & Key Points */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-teal-600" />
                  <span>Resumo & Racionalidade Clínica</span>
                </h3>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-200/80 rounded-2xl p-4.5">
                  {activeLesson.summary}
                </p>

                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 pt-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Pontos-Chave para o Revalida</span>
                </h3>
                <div className="space-y-2">
                  {activeLesson.keyPoints.map((point, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700"
                    >
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Complementary Materials */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Download className="w-4 h-4 text-blue-600" />
                  <span>Materiais Complementares</span>
                </h3>
                <div className="space-y-2">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-700">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span>Slides da Aula (PDF)</span>
                    </div>
                    <span className="text-[11px] text-teal-700 font-semibold cursor-pointer hover:underline">Disponível</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Volume2 className="w-4 h-4 text-purple-600" />
                      <span>Áudio Flashcast (MP3)</span>
                    </div>
                    <span className="text-[11px] text-teal-700 font-semibold cursor-pointer hover:underline">Disponível</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-700">
                      <BookOpen className="w-4 h-4 text-emerald-600" />
                      <span>Diretriz SUS / PCDT</span>
                    </div>
                    <span className="text-[11px] text-teal-700 font-semibold cursor-pointer hover:underline">Disponível</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // View: CATÁLOGO DE AULAS
  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* 1. COMPACT HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shadow-xs shadow-teal-500/50" />
            <span>Aulas Teórico-Práticas</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Conteúdo audiovisual complementar para aprofundamento nos temas essenciais do Revalida INEP.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-white border border-slate-200/80 px-3.5 py-1.5 rounded-xl shadow-2xs self-start sm:self-auto">
          <span className="text-teal-700 font-bold">5</span>
          <span>Grandes Áreas</span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-600">Módulo em Estruturação</span>
        </div>
      </div>

      {/* 2. 5 MEDICAL AREA FILTER PILLS */}
      <div className="flex items-center gap-1.5 bg-slate-100/90 border border-slate-200/80 p-1 rounded-2xl overflow-x-auto">
        {AREA_FILTERS.map((f) => {
          const isSelected = selectedArea === f.id;
          const areaTheme = getAreaVisualTheme(f.areaKey);

          return (
            <button
              key={f.id}
              onClick={() => setSelectedArea(f.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                isSelected
                  ? f.id === "ALL"
                    ? "bg-teal-600 text-white font-bold shadow-xs"
                    : `${areaTheme.activePillBg} text-white font-bold shadow-xs`
                  : "text-slate-600 hover:text-slate-900 hover:bg-white"
              }`}
            >
              {f.id === "ALL" && <Layers className="w-3.5 h-3.5" />}
              <span>{f.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. SEARCH BAR */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar aula por título, professor, tema ou conduta..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 transition shadow-inner"
          />
        </div>
      </div>

      {/* 4. LESSONS GRID */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <div>
            Tópicos e estruturas curriculares preparadas
          </div>
        </div>

        {filteredLessons.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center space-y-3 shadow-xs">
            <Tv className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="text-slate-800 font-bold text-sm">Nenhuma aula encontrada</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Tente ajustar os termos da busca ou selecionar outra grande área médica.
            </p>
            <button
              onClick={() => {
                setSelectedArea("ALL");
                setSearchQuery("");
              }}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold transition cursor-pointer"
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredLessons.map((lesson) => {
              const areaTheme = getAreaVisualTheme(lesson.area);

              return (
                <div
                  key={lesson.id}
                  onClick={() => setActiveLesson(lesson)}
                  className={`bg-white hover:bg-slate-50/80 border border-slate-200/80 ${areaTheme.borderLeft} border-l-[3.5px] rounded-2xl p-4.5 cursor-pointer transition flex flex-col justify-between group shadow-2xs hover:shadow-xs space-y-3`}
                >
                  <div className="space-y-2">
                    {/* Top Row: Area Tag & Duration */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${areaTheme.badgeBg} ${areaTheme.badgeText} ${areaTheme.badgeBorder}`}>
                        <span>{areaTheme.name}</span>
                      </span>

                      <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>~{lesson.durationMinutes} min</span>
                      </span>
                    </div>

                    {/* Lesson Title */}
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-700 transition tracking-tight line-clamp-2 leading-snug">
                      {lesson.title}
                    </h3>

                    {/* Instructor / Theme Subtitle */}
                    <p className="text-xs text-slate-500 line-clamp-1">
                      {lesson.instructor} • {lesson.theme}
                    </p>
                  </div>

                  {/* Bottom Meta & CTA */}
                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-400 font-medium">
                      Estrutura da aula
                    </span>

                    <div className="flex items-center gap-1 text-teal-700 font-bold text-xs group-hover:translate-x-0.5 transition-transform">
                      <span>Ver conteúdo</span>
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
