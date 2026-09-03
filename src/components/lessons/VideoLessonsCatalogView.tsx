import React, { useState, useMemo } from "react";
import {
  Play,
  Tv,
  CheckCircle2,
  Clock,
  BookOpen,
  Search,
  Filter,
  Flame,
  Award,
  ChevronRight,
  Sparkles,
  FileText,
  Volume2,
  Download,
  CheckCircle,
  BarChart2,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { formatMedicalArea } from "../../utils/formatters";

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
  progressPercent: number; // 0 to 100
  lastWatchedAt?: string;
  isCompleted?: boolean;
}

const SAMPLE_VIDEO_LESSONS: VideoLesson[] = [
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
    progressPercent: 65,
    lastWatchedAt: "Ontem às 21:30",
    isCompleted: false,
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
    progressPercent: 100,
    lastWatchedAt: "Há 2 dias",
    isCompleted: true,
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
    progressPercent: 20,
    lastWatchedAt: "Hoje às 09:15",
    isCompleted: false,
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
    progressPercent: 0,
    isCompleted: false,
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
    progressPercent: 85,
    lastWatchedAt: "Há 3 dias",
    isCompleted: false,
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
    progressPercent: 100,
    lastWatchedAt: "Há 4 dias",
    isCompleted: true,
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
    progressPercent: 0,
    isCompleted: false,
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
    progressPercent: 40,
    lastWatchedAt: "Hoje às 11:00",
    isCompleted: false,
  },
];

export const VideoLessonsCatalogView: React.FC = () => {
  const { setActiveTab } = useApp();
  const [selectedArea, setSelectedArea] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeLesson, setActiveLesson] = useState<VideoLesson | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

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

  // Lessons currently in progress (for "Continuar assistindo")
  const inProgressLessons = useMemo(() => {
    return SAMPLE_VIDEO_LESSONS.filter(
      (l) => l.progressPercent > 0 && l.progressPercent < 100
    );
  }, []);

  const totalWatchMinutes = SAMPLE_VIDEO_LESSONS.reduce(
    (acc, l) => acc + (l.durationMinutes * l.progressPercent) / 100,
    0
  );
  const completedCount = SAMPLE_VIDEO_LESSONS.filter((l) => l.isCompleted).length;

  if (activeLesson) {
    return (
      <div className="space-y-6 pb-20 max-w-7xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => {
            setActiveLesson(null);
            setIsPlaying(false);
          }}
          className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
        >
          ← Voltar para o Catálogo de Aulas
        </button>

        {/* Video Player Stage */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
          {/* Simulated Video Player Screen */}
          <div className="aspect-video w-full bg-gradient-to-br from-zinc-900 via-black to-zinc-950 relative flex items-center justify-center border-b border-zinc-800">
            {!isPlaying ? (
              <div className="text-center p-6 space-y-4 max-w-md">
                <div className="w-16 h-16 rounded-full bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center mx-auto shadow-2xl shadow-teal-500/40 cursor-pointer hover:scale-110 transition-transform"
                  onClick={() => setIsPlaying(true)}
                >
                  <Play className="w-7 h-7 fill-current ml-1" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{activeLesson.title}</h3>
                  <p className="text-xs text-zinc-400 mt-1">{activeLesson.instructor} • {activeLesson.durationMinutes} min</p>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-medium">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Resolução orientada a casos clínicos do Revalida</span>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col justify-between p-6 bg-zinc-950 relative">
                {/* Playing simulation overlay */}
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-semibold text-white">{activeLesson.title}</span>
                  <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px] animate-pulse">REPRODUZINDO</span>
                </div>
                
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center mx-auto border border-teal-500/30">
                    <Tv className="w-6 h-6 animate-pulse" />
                  </div>
                  <p className="text-sm font-semibold text-white">Videoaula em reprodução contínua HD</p>
                  <p className="text-xs text-zinc-400">{activeLesson.instructor}</p>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>14:20</span>
                    <span>{activeLesson.durationMinutes}:00</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="h-full bg-teal-500 w-[35%]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Lesson Metadata & Clinical Pearls */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-teal-500/10 text-teal-300 border border-teal-500/20">
                    {formatMedicalArea(activeLesson.area)}
                  </span>
                  <span className="text-xs text-zinc-400">• {activeLesson.theme}</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white">{activeLesson.title}</h1>
                <p className="text-xs text-zinc-400">Ministrado por: <strong className="text-zinc-200">{activeLesson.instructor}</strong></p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setActiveTab("praticar-questoes")}
                  className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>Treinar Questões Deste Tema</span>
                </button>
              </div>
            </div>

            {/* Summary & Core Pearls */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-teal-400" />
                  Resumo & Fisiopatologia
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
                  {activeLesson.summary}
                </p>

                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 pt-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  Pontos-Chave Mais Cobrados no Revalida
                </h3>
                <div className="space-y-2">
                  {activeLesson.keyPoints.map((point, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 text-xs text-zinc-200">
                      <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Download className="w-4 h-4 text-blue-400" />
                  Materiais Complementares
                </h3>
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <FileText className="w-4 h-4 text-blue-400" />
                      <span>Slides da Aula (PDF)</span>
                    </div>
                    <span className="text-[10px] text-teal-400 font-semibold cursor-pointer hover:underline">Baixar</span>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <Volume2 className="w-4 h-4 text-purple-400" />
                      <span>Áudio Flashcast (MP3)</span>
                    </div>
                    <span className="text-[10px] text-teal-400 font-semibold cursor-pointer hover:underline">Ouvir</span>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <BookOpen className="w-4 h-4 text-emerald-400" />
                      <span>Diretriz SUS / PCDT 2026</span>
                    </div>
                    <span className="text-[10px] text-teal-400 font-semibold cursor-pointer hover:underline">Ver</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-br from-[#0c1322] via-[#0f1a2e] to-[#0c1524] border border-teal-500/20 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-300 border border-teal-500/20">
              <Tv className="w-3.5 h-3.5" />
              <span>Catálogo Oficial de Videoaulas</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Aulas Teórico-Práticas
            </h1>
            <p className="text-zinc-300 text-sm max-w-2xl leading-relaxed">
              Videoaulas de alta densidade clínica ministradas por especialistas, focadas nos temas de maior incidência no Revalida INEP e baseadas nas condutas oficiais do SUS.
            </p>
          </div>

          {/* Metrics summary */}
          <div className="grid grid-cols-2 gap-3 bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 shrink-0">
            <div className="text-center px-2">
              <div className="text-xl font-bold text-teal-400">{completedCount}/{SAMPLE_VIDEO_LESSONS.length}</div>
              <div className="text-[11px] text-zinc-400">Aulas Concluídas</div>
            </div>
            <div className="text-center border-l border-zinc-800 px-2">
              <div className="text-xl font-bold text-amber-400">{Math.round(totalWatchMinutes)} min</div>
              <div className="text-[11px] text-zinc-400">Tempo Assistido</div>
            </div>
          </div>
        </div>
      </div>

      {/* Continuar Assistindo Section */}
      {inProgressLessons.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-400" />
              Continuar Assistindo
            </h2>
            <span className="text-xs text-zinc-400">{inProgressLessons.length} em andamento</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inProgressLessons.map((lesson) => (
              <div
                key={lesson.id}
                onClick={() => setActiveLesson(lesson)}
                className="p-4 rounded-2xl bg-[#0c111c] border border-teal-500/30 hover:border-teal-500/60 transition-all cursor-pointer group shadow-lg space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-300">
                      {formatMedicalArea(lesson.area)}
                    </span>
                    <h3 className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors line-clamp-1">
                      {lesson.title}
                    </h3>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>{lesson.lastWatchedAt || "Em andamento"}</span>
                    <span className="font-semibold text-teal-300">{lesson.progressPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full transition-all duration-300"
                      style={{ width: `${lesson.progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar aula por título, professor, tema ou conduta..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500 transition"
          />
        </div>

        {/* Medical Area Filter */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: "ALL", label: "Todas as Áreas" },
            { id: "CLINICA_MEDICA", label: "Clínica Médica" },
            { id: "CIRURGIA_GERAL", label: "Cirurgia Geral" },
            { id: "GINECOLOGIA_OBSTETRICIA", label: "Ginecologia e Obstetrícia" },
            { id: "PEDIATRIA", label: "Pediatria" },
            { id: "MEDICINA_FAMILIA_COMUNIDADE", label: "Medicina de Família / SUS" },
          ].map((area) => (
            <button
              key={area.id}
              onClick={() => setSelectedArea(area.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                selectedArea === area.id
                  ? "bg-teal-600 text-white"
                  : "bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800"
              }`}
            >
              {area.label}
            </button>
          ))}
        </div>
      </div>

      {/* Video Lessons Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredLessons.map((lesson) => {
          const isDone = lesson.isCompleted || lesson.progressPercent === 100;
          return (
            <div
              key={lesson.id}
              onClick={() => setActiveLesson(lesson)}
              className="p-5 rounded-3xl bg-zinc-900/80 border border-zinc-800 hover:border-teal-500/50 transition-all cursor-pointer group shadow-md flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg bg-white/[0.06] text-zinc-300 border border-white/10">
                    {formatMedicalArea(lesson.area)}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{lesson.durationMinutes} min</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white group-hover:text-teal-300 transition-colors leading-snug">
                    {lesson.title}
                  </h3>
                  <p className="text-xs text-zinc-400 line-clamp-2">
                    {lesson.summary}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                <div className="text-[11px] text-zinc-400 truncate max-w-[180px]">
                  {lesson.instructor}
                </div>

                {isDone ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Concluída
                  </span>
                ) : lesson.progressPercent > 0 ? (
                  <span className="text-[11px] font-bold text-teal-300 bg-teal-500/10 px-2 py-0.5 rounded-md">
                    {lesson.progressPercent}% assistido
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 group-hover:text-white transition-colors">
                    <span>Assistir</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
