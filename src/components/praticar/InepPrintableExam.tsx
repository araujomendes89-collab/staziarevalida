import React, { useState, useMemo } from "react";
import {
  Printer,
  FileDown,
  QrCode,
  CheckSquare,
  Shield,
  HelpCircle,
  Eye,
  Clock,
  Sparkles,
  ArrowRight,
  BookOpen,
  Award,
  Calendar,
  AlertTriangle,
  Camera,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { Question, MedicalArea } from "../../types";
import { useApp } from "../../context/AppContext";

interface InepPrintableExamProps {
  questions: Question[];
  examTitle?: string;
  examEdition?: string;
  durationHours?: number;
  onClose?: () => void;
}

const AREA_DISPLAY_LABELS: Record<MedicalArea, string> = {
  CLINICA_MEDICA: "CLÍNICA MÉDICA",
  CIRURGIA_GERAL: "CIRURGIA GERAL",
  GINECOLOGIA_OBSTETRICIA: "GINECOLOGIA E OBSTETRÍCIA",
  PEDIATRIA: "PEDIATRIA",
  MEDICINA_FAMILIA_COMUNIDADE: "MEDICINA DE FAMÍLIA E COMUNIDADE / SUS",
};

export const InepPrintableExam: React.FC<InepPrintableExamProps> = ({
  questions,
  examTitle = "CADERNO DE QUESTÕES OBJETIVAS - REVALIDA INEP",
  examEdition = "Revalida INEP 2026/2 - 1ª Etapa (Prova Teórica)",
  durationHours = 5,
  onClose,
}) => {
  const { user, recordQuestionAttempt } = useApp();
  const [activeTab, setActiveTab] = useState<"EXAM_BOOKLET" | "ANSWER_CARD" | "ANSWER_KEY_QR">("EXAM_BOOKLET");
  const [includeExplanations, setIncludeExplanations] = useState<boolean>(true);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, "A" | "B" | "C" | "D">>({});
  const [submittedToFirestore, setSubmittedToFirestore] = useState<boolean>(false);
  const [qrCodeBipSuccess, setQrCodeBipSuccess] = useState<boolean>(false);

  // Group questions by medical area if desired, or sequential
  const totalQuestions = questions.length;
  
  const userName = user?.name || "Dr(a). Candidato(a)";
  const now = new Date();
  const dateString = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`;
  const watermarkText = encodeURIComponent(`${userName} - ${dateString}`);
  const watermarkSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="12" fill="rgba(0,0,0,0.08)" transform="rotate(-45 150 150)">${watermarkText}</text></svg>`;


  const handlePrint = () => {
    window.print();
  };

  const handleSelectAnswer = (questionIndex: number, letter: "A" | "B" | "C" | "D") => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionIndex]: letter,
    }));
  };

  const handleSubmitPaperAnswers = () => {
    // Record attempts into AppContext & Firestore
    let correctCount = 0;
    questions.forEach((q, idx) => {
      const selected = selectedAnswers?.[idx + 1];
      if (selected) {
        const correctOpt = q.options.find((opt) => opt.isCorrect);
        const isCorrect = correctOpt ? correctOpt.id === selected : false;
        if (isCorrect) correctCount++;

        recordQuestionAttempt({
          questionId: q.id,
          selectedOption: selected,
          isCorrect,
          timeSpentSeconds: 120,
          confidence: "HIGH",
          mode: "EXAM",
        });
      }
    });

    setSubmittedToFirestore(true);
    setTimeout(() => {
      setSubmittedToFirestore(false);
      setQrCodeBipSuccess(true);
      setTimeout(() => setQrCodeBipSuccess(false), 5000);
    }, 1200);
  };

  const answeredCount = Object.keys(selectedAnswers || {}).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20">
      {/* Top Interactive Toolbar (Hidden during Print) */}
      <header className="print:hidden sticky top-0 z-50 bg-[#0c0e17]/90 backdrop-blur-md border-b border-white/10 px-4 py-3 shadow-xl">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-black text-sm">
              INEP
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase tracking-wider">
                  Layout Oficial INEP Impressão
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  {totalQuestions} Questões · Formato A4 2 Colunas
                </span>
              </div>
              <h1 className="text-sm font-bold text-white truncate max-w-md">
                {examTitle}
              </h1>
            </div>
          </div>

          {/* View Toggles & Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-white/[0.04] p-1 rounded-xl border border-white/10 text-xs font-semibold">
              <button
                onClick={() => setActiveTab("EXAM_BOOKLET")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === "EXAM_BOOKLET"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Caderno de Prova
              </button>
              <button
                onClick={() => setActiveTab("ANSWER_CARD")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === "ANSWER_CARD"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Cartão-Resposta ({answeredCount}/{totalQuestions})
              </button>
              <button
                onClick={() => setActiveTab("ANSWER_KEY_QR")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === "ANSWER_KEY_QR"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Gabarito + QR Code
              </button>
            </div>

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Simulado (PDF)</span>
            </button>

            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white border border-white/10 text-xs font-bold transition-colors cursor-pointer"
              >
                ✕ Fechar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Print Container simulating pure Physical Paper */}
      <main className="max-w-5xl mx-auto p-4 sm:p-8">
        {/* VIEW 1: CADERNO DE PROVA OFICIAL PADRÃO INEP */}
        {activeTab === "EXAM_BOOKLET" && (
          <div 
            className="bg-white text-black p-6 sm:p-12 rounded-lg shadow-2xl font-serif leading-snug print:p-0 print:shadow-none print:m-0 print:rounded-none relative"
            style={{ backgroundImage: `url('${watermarkSvg}')`, backgroundRepeat: 'repeat' }}
          >
            {/* INEP Official Header Block */}
            <div className="border-4 border-black p-4 mb-6 text-center space-y-2">
              <div className="flex items-center justify-between border-b-2 border-black pb-2">
                <div className="text-left font-sans text-xs">
                  <div className="font-extrabold uppercase text-sm tracking-wider">MINISTÉRIO DA EDUCAÇÃO</div>
                  <div>INSTITUTO NACIONAL DE ESTUDOS E PESQUISAS EDUCACIONAIS ANÍSIO TEIXEIRA - INEP</div>
                </div>
                <div className="text-right font-sans text-xs">
                  <div className="font-black text-base">REVALIDA {examEdition.match(/20\d{2}/) ? examEdition.match(/20\d{2}/)![0] : "2026"}</div>
                  <div className="font-bold">1ª ETAPA - PROVA OBJETIVA</div>
                </div>
              </div>

              <div className="py-2">
                <h2 className="text-xl sm:text-2xl font-black font-sans uppercase tracking-tight">
                  {examTitle}
                </h2>
                <p className="text-xs font-sans font-bold uppercase tracking-widest text-zinc-800">
                  {examEdition} · CADERNO 1 (AZUL / OFICIAL)
                </p>
              </div>

              {/* Instructions Box */}
              <div className="border border-black p-3 text-left font-sans text-[11px] leading-tight space-y-1 bg-zinc-50">
                <div className="font-bold uppercase text-[12px] underline">INSTRUÇÕES AO CANDIDATO:</div>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Verifique se este caderno contém exatamente <strong>{totalQuestions} questões</strong> objetivas de múltipla escolha.</li>
                  <li>Cada questão apresenta 4 (quatro) opções (A, B, C e D), das quais apenas uma é correta.</li>
                  <li>Duração total da prova: <strong>{durationHours} horas</strong>. Controle seu tempo dedicando ~2 minutos e meio por questão.</li>
                  <li>Marque no <strong>Cartão-Resposta</strong> a opção escolhida preenchendo integralmente o alvéolo com caneta esferográfica azul ou preta.</li>
                  <li>Ao terminar a resolução no papel, use a câmera do celular para bipar o <strong>QR Code do Gabarito Oficial</strong> ou transcrever suas marcações para atualizar instantaneamente o seu <strong>Projected Pass Score (PPS)</strong> no sistema StaziaMed.</li>
                </ul>
              </div>
            </div>

            {/* Candidate Identification Stripe */}
            <div className="border-2 border-black p-3 mb-8 flex flex-col sm:flex-row justify-between gap-4 font-sans text-xs font-bold">
              <div className="flex-1">
                <span>NOME DO CANDIDATO: </span>
                <span className="font-mono underline uppercase">{user?.name || "________________________________________________________"}</span>
              </div>
              <div>
                <span>INSCRIÇÃO: </span>
                <span className="font-mono underline">REV-2026-BR-{user?.id?.slice(0, 8) || "892011"}</span>
              </div>
              <div>
                <span>SALA: </span>
                <span className="font-mono underline">001-A</span>
              </div>
            </div>

            {/* Two-Column Newspaper Layout for Questions (Authentic Inep Competition Style) */}
            <div className="columns-1 md:columns-2 gap-8 text-[13px] leading-relaxed text-justify space-y-6 print:columns-2 print:text-[12px]">
              {questions.map((q, idx) => {
                const questionNumber = idx + 1;
                const areaLabel = AREA_DISPLAY_LABELS[q.area] || q.area;

                return (
                  <div
                    key={q.id}
                    className="break-inside-avoid-column mb-6 pb-5 border-b border-zinc-300 last:border-b-0"
                  >
                    {/* Authentic INEP Question Header */}
                    <div className="mb-2">
                      <div className="inline-block bg-[#4a4a4a] text-white font-sans text-[11px] font-bold px-6 py-0.5" style={{ clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)" }}>
                        QUESTÃO {questionNumber}
                      </div>
                    </div>

                    {/* Clinical Case Text (Stem) */}
                    <div className="text-zinc-900 whitespace-pre-line mb-3 font-serif">
                      {q.clinicalCase.split(/(\[IMAGEM:.*?\])/g).map((part, i) => {
                        if (part.startsWith('[IMAGEM:') && part.endsWith(']')) {
                          const imgPath = part.replace('[IMAGEM:', '').replace(']', '').trim();
                          const matchedImg = q.images?.find(
                            img => img.relativePath === imgPath || img.url === imgPath || (img.filename && imgPath.includes(img.filename))
                          );
                          return (
                            <div key={i} className="my-3 inline-block w-full text-center">
                              <img
                                src={matchedImg?.url || `/${imgPath}`}
                                alt={matchedImg?.caption || "Imagem clínica"}
                                className="max-h-64 mx-auto object-contain border border-zinc-300 rounded"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          );
                        }
                        return <span key={i}>{part}</span>;
                      })}
                    </div>
                    {/* Fallback for un-tagged images */}
                    {q.images && q.images.filter(img => !q.clinicalCase.includes(img.relativePath || '') && !q.clinicalCase.includes(img.filename || '')).length > 0 && (
                      <div className="space-y-2 mb-3">
                        {q.images.filter(img => !q.clinicalCase.includes(img.relativePath || '') && !q.clinicalCase.includes(img.filename || '')).map((img, idx) => (
                          <div key={idx} className="my-2 text-center">
                            <img
                              src={img.url || `/${img.relativePath}`}
                              alt={img.caption || "Imagem clínica"}
                              className="max-h-64 mx-auto object-contain border border-zinc-300 rounded"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Multiple Choice Options (A, B, C, D) */}
                    <div className="space-y-1.5 font-sans text-xs pl-1">
                      {q.options.map((opt) => (
                        <div key={opt.id} className="flex items-start gap-2">
                          <span className="font-bold shrink-0 w-4 text-center">
                            ({opt.id})
                          </span>
                          <span className="text-zinc-900 leading-snug">{opt.text}</span>
                        </div>
                      ))}
                    </div>


                  </div>
                );
              })}
            </div>

            {/* End of Exam Notice */}
            <div className="text-center font-sans font-black text-xs uppercase tracking-widest border-t-2 border-black pt-4 mt-8">
              FIM DO CADERNO DE QUESTÕES OBJETIVAS · REVALIDA INEP 2026
            </div>
          </div>
        )}

        {/* VIEW 2: CARTÃO-RESPOSTA OFICIAL DE MARCAÇÃO */}
        {activeTab === "ANSWER_CARD" && (
          <div className="bg-white text-black p-6 sm:p-10 rounded-lg shadow-2xl font-sans print:p-0 print:shadow-none">
            {/* Answer Card Header */}
            <div className="border-4 border-black p-4 mb-6 text-center space-y-2">
              <div className="flex items-center justify-between border-b-2 border-black pb-2 text-xs">
                <div className="font-black text-left">
                  INSTITUTO NACIONAL DE ESTUDOS E PESQUISAS EDUCACIONAIS ANÍSIO TEIXEIRA<br />
                  <span className="text-sm font-extrabold uppercase">FOLHA DE RESPOSTAS (CARTÃO-RESPOSTA ÓPTICO)</span>
                </div>
                <div className="text-right font-black">
                  <div>REVALIDA INEP</div>
                  <div className="font-mono text-sm">PROVA OBJETIVA</div>
                </div>
              </div>

              <div className="p-2 bg-zinc-100 border border-black text-xs text-left leading-tight space-y-1">
                <strong>INSTRUÇÕES DE PREENCHIMENTO:</strong>
                <p>• Preencha completamente o alvéolo correspondente à sua opção de resposta: <span className="font-bold">●</span> (não use "X" ou traço).</p>
                <p>• Respostas com dupla marcação ou em branco serão computadas como nulas.</p>
              </div>
            </div>

            {/* Candidate Metadata Bar */}
            <div className="border-2 border-black p-3 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-bold">
              <div>CANDIDATO: <span className="underline font-mono">{user?.name || "DR. CANDIDATO REVALIDA"}</span></div>
              <div>INSCRIÇÃO: <span className="underline font-mono">2026-REV-892011</span></div>
              <div>DATA DE APLICAÇÃO: <span className="underline font-mono">{new Date().toLocaleDateString("pt-BR")}</span></div>
            </div>

            {/* Optical Bubbles Grid (Alvéolos) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 border-2 border-black p-4 bg-zinc-50">
              {questions.map((_, idx) => {
                const qNum = idx + 1;
                const currentAnswer = selectedAnswers[qNum];

                return (
                  <div
                    key={qNum}
                    className="flex items-center justify-between bg-white px-2 py-1.5 border border-zinc-300 rounded shadow-sm hover:border-black transition-colors"
                  >
                    <span className="font-bold text-xs w-6 font-mono text-zinc-900">
                      {qNum < 10 ? `0${qNum}` : qNum}
                    </span>
                    <div className="flex items-center gap-1">
                      {(["A", "B", "C", "D"] as const).map((letter) => {
                        const isMarked = currentAnswer === letter;
                        return (
                          <button
                            key={letter}
                            type="button"
                            onClick={() => handleSelectAnswer(qNum, letter)}
                            className={`w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center border transition-all cursor-pointer ${
                              isMarked
                                ? "bg-black text-white border-black scale-110 shadow-sm"
                                : "bg-white text-zinc-800 border-zinc-400 hover:bg-zinc-200"
                            }`}
                          >
                            {letter}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Submission Action Bar for Syncing with Firestore & PPS */}
            <div className="mt-8 border-t-2 border-black pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
              <div className="text-xs text-zinc-600">
                <span className="font-bold text-black">{answeredCount} de {totalQuestions}</span> questões preenchidas no gabarito óptico.
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedAnswers({})}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 hover:bg-zinc-100 text-zinc-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Limpar Cartão
                </button>

                <button
                  onClick={handleSubmitPaperAnswers}
                  disabled={answeredCount === 0 || submittedToFirestore}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-black hover:bg-zinc-800 text-white text-xs font-bold transition-all shadow-xl disabled:opacity-50 cursor-pointer"
                >
                  {submittedToFirestore ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                      <span>Processando no Firestore...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Submeter Cartão & Atualizar PPS</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {qrCodeBipSuccess && (
              <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-500 text-emerald-900 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Marcações sincronizadas com sucesso! O seu histórico de tentativas, o caderno de erros e o Projected Pass Score (PPS) foram recalculados.</span>
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: GABARITO OFICIAL COMENTADO + QR CODE DE CORREÇÃO INSTANTÂNEA */}
        {activeTab === "ANSWER_KEY_QR" && (
          <div className="bg-white text-black p-6 sm:p-10 rounded-lg shadow-2xl font-sans print:p-0 print:shadow-none space-y-8">
            {/* Answer Key Header */}
            <div className="border-4 border-black p-4 text-center space-y-2">
              <div className="flex items-center justify-between border-b-2 border-black pb-2 text-xs">
                <div className="font-black text-left">
                  MINISTÉRIO DA EDUCAÇÃO · INEP<br />
                  <span className="text-sm font-extrabold uppercase">GABARITO OFICIAL DEFINITIVO & COMENTÁRIO CLÍNICO</span>
                </div>
                <div className="text-right font-black">
                  <div>REVALIDA INEP 2026</div>
                  <div className="font-mono text-sm">FASE 1 · TEÓRICA</div>
                </div>
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight pt-2">
                {examTitle} - GABARITO & MATRIZ DE COMPETÊNCIAS
              </h2>
            </div>

            {/* QR Code & Mobile Sync Hero Box */}
            <div className="border-2 border-black p-6 bg-gradient-to-r from-zinc-50 to-blue-50/40 flex flex-col md:flex-row items-center justify-between gap-6 rounded-lg">
              <div className="space-y-2 flex-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-blue-600 text-white font-mono text-[10px] font-bold uppercase">
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Sincronização Instantânea via Câmera</span>
                </div>
                <h3 className="text-lg font-black text-zinc-900">
                  Corrija Sua Prova Impressa no Celular
                </h3>
                <p className="text-xs text-zinc-700 leading-relaxed">
                  Aponte a câmera do seu smartphone para o QR Code ao lado para abrir a tela de transcrição óptica rápida. Ao confirmar suas respostas, o <strong>StaziaMed</strong> audita suas respostas com os PCDTs vigentes e atualiza o seu <strong>PPS (Projected Pass Score)</strong>.
                </p>
                <div className="pt-2 flex items-center gap-3 text-xs font-mono font-bold text-blue-900">
                  <span>URL Direta: ais-dev-revalida.run.app/scanner</span>
                </div>
              </div>

              {/* High Quality SVG QR Code Simulation for Paper Printing */}
              <div className="p-4 bg-white border-2 border-black rounded-xl shadow-md text-center shrink-0">
                <div className="w-36 h-36 bg-black p-2 rounded flex flex-col items-center justify-center text-white text-center">
                  <QrCode className="w-24 h-24 text-white" />
                  <span className="text-[9px] font-mono font-bold mt-1 text-zinc-300">BIPAR GABARITO</span>
                </div>
                <span className="text-[10px] font-bold text-zinc-800 mt-2 block font-mono">
                  INEP-REV-2026-KEY
                </span>
              </div>
            </div>

            {/* Quick Answer Key Table (Gabarito Sintético) */}
            <div className="space-y-2">
              <h4 className="text-sm font-black uppercase tracking-wider text-black flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-blue-600" />
                <span>Gabarito Oficial Sintético</span>
              </h4>

              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-2 border-2 border-black p-3 bg-zinc-50 text-center font-mono">
                {questions.map((q, idx) => {
                  const qNum = idx + 1;
                  const correctOpt = q.options.find((opt) => opt.isCorrect);
                  return (
                    <div key={qNum} className="p-1.5 bg-white border border-zinc-300 rounded">
                      <div className="text-[10px] text-zinc-500 font-bold">Q{qNum}</div>
                      <div className="text-base font-black text-black">{correctOpt?.id || "A"}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detailed Explanations & SUS Protocol references */}
            <div className="space-y-4 pt-4 border-t-2 border-black">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black uppercase tracking-wider text-black flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-600" />
                  <span>Comentários Detalhados & Justificativas da Banca</span>
                </h4>
                <label className="text-xs font-bold text-zinc-700 flex items-center gap-1.5 cursor-pointer print:hidden">
                  <input
                    type="checkbox"
                    checked={includeExplanations}
                    onChange={(e) => setIncludeExplanations(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Exibir Justificativas Completas</span>
                </label>
              </div>

              {includeExplanations && (
                <div className="space-y-4 text-xs leading-relaxed">
                  {questions.map((q, idx) => {
                    const qNum = idx + 1;
                    const correctOpt = q.options.find((opt) => opt.isCorrect);

                    return (
                      <div key={q.id} className="p-4 rounded-lg border border-zinc-300 bg-zinc-50/60 space-y-2">
                        <div className="flex items-center justify-between font-bold border-b border-zinc-200 pb-1.5">
                          <span className="text-sm text-zinc-900">
                            Questão {qNum} — Gabarito Oficial: <strong className="text-emerald-700 text-base font-black">({correctOpt?.id})</strong>
                          </span>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-200 text-zinc-800">
                            {AREA_DISPLAY_LABELS[q.area] || q.area}
                          </span>
                        </div>

                        <p className="text-zinc-800 italic">
                          <strong>Enunciado:</strong> {q.clinicalCase.slice(0, 180)}...
                        </p>

                        <div className="space-y-1.5 pt-1">
                          <div className="font-bold text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200">
                            <strong>Alternativa Correta ({correctOpt?.id}):</strong> {correctOpt?.text}
                            <p className="mt-1 text-zinc-700 font-normal">{correctOpt?.explanation}</p>
                          </div>

                          <div className="space-y-1 text-zinc-600 pl-2">
                            {q.options.filter(o => !o.isCorrect).map(opt => (
                              <div key={opt.id} className="text-[11px]">
                                <span className="font-bold text-zinc-700">Distrator ({opt.id}):</span> {opt.explanation}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
