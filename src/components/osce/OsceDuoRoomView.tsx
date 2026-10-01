import React, { useState, useEffect, useRef } from "react";
import {
  Clock,
  Mic,
  MicOff,
  Volume2,
  Send,
  Stethoscope,
  FileText,
  Activity,
  CheckCircle2,
  XCircle,
  Award,
  RotateCcw,
  Sparkles,
  User,
  ShieldCheck,
  Eye,
  AlertCircle,
  HelpCircle,
  Play,
  ArrowRightLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { DuoSession, DuoParticipantRole, DuoItemScoreStatus } from "../../types/duoSession";
import { DuoSessionService } from "../../services/duoSessionService";
import { NotificationService } from "../../services/notificationService";
import { SEED_OSCE_STATIONS } from "../../data/osceStationsData";
import { OSCEStation } from "../../types";

interface OsceDuoRoomViewProps {
  sessionId: string;
  currentUserId: string;
  onExit: () => void;
}

export const OsceDuoRoomView: React.FC<OsceDuoRoomViewProps> = ({
  sessionId,
  currentUserId,
  onExit,
}) => {
  const [session, setSession] = useState<DuoSession | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [activeTab, setActiveTab] = useState<"CHECKLIST" | "SCRIPT" | "EXAMS" | "NOTES">("CHECKLIST");
  const [inputMessage, setInputMessage] = useState("");
  const [isMicMuted, setIsMicMuted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to real-time session changes
  useEffect(() => {
    const unsub = DuoSessionService.subscribeToDuoSession(sessionId, (updated) => {
      setSession(updated);
    });
    return () => unsub();
  }, [sessionId]);

  // Synchronized countdown timer tick
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [session?.chatMessages]);


  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 space-y-3">
        <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">Conectando à Sala de Treino em Dupla...</p>
      </div>
    );
  }

  const station: OSCEStation =
    SEED_OSCE_STATIONS.find((s) => s.id === session.stationId) || SEED_OSCE_STATIONS[0];

  const role: DuoParticipantRole =
    session.doctorUserId === currentUserId ? "DOCTOR" : "EVALUATOR";

  const isDoctor = role === "DOCTOR";
  const partnerName = isDoctor ? session.evaluatorName : session.doctorName;

  // Calculate synchronized remaining time
  let secondsRemaining = session.timeLimitSeconds;
  if (session.status === "IN_PROGRESS" && session.startedAt) {
    const elapsedSeconds = Math.floor((now - session.startedAt) / 1000);
    secondsRemaining = Math.max(0, session.timeLimitSeconds - elapsedSeconds);
  } else if (session.status === "COMPLETED") {
    secondsRemaining = 0;
  }

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`;
  };

  const handleStartSession = async () => {
    NotificationService.playNotificationSound("match");
    await DuoSessionService.startSession(sessionId);
  };

  const handleScoreItem = async (itemId: string, status: DuoItemScoreStatus, maxPoints: number) => {
    if (!isDoctor) {
      await DuoSessionService.updateChecklistScore(sessionId, itemId, status, maxPoints);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const senderName = isDoctor ? session.doctorName : session.evaluatorName;
    const senderRole = isDoctor ? "doctor" : "evaluator";
    await DuoSessionService.sendChatMessage(sessionId, senderRole, senderName, inputMessage);
    setInputMessage("");
  };

  const handleRevealExam = async (examName: string) => {
    await DuoSessionService.revealExam(sessionId, examName);
  };

  const handleSwapRoles = async () => {
    NotificationService.playNotificationSound("match");
    await DuoSessionService.swapRoles(sessionId);
  };

  const handleFinishSession = async () => {
    NotificationService.playNotificationSound("success");
    await DuoSessionService.finishSession(sessionId);
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 pb-20 text-slate-100 font-sans">
      {/* Top Header Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#09101d] border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/30">
              {session.stationArea}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
              {isDoctor ? "Seu Papel: Médico(a) Atendente" : "Seu Papel: Avaliador(a) / Paciente"}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Dupla Conectada: {partnerName}
            </span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            {session.stationTitle}
          </h1>
        </div>

        {/* Timer & Controls */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono font-bold text-base ${
              secondsRemaining <= 120
                ? "bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse"
                : "bg-slate-900 border-slate-800 text-sky-300"
            }`}
          >
            <Clock className="w-4 h-4 text-sky-400" />
            <span>{formatTimer(secondsRemaining)}</span>
          </div>

          {/* Action button */}
          {session.status === "LOBBY" && (
            <button
              onClick={handleStartSession}
              id="btn-iniciar-estacao-dupla"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Iniciar 10 Min</span>
            </button>
          )}

          {session.status === "IN_PROGRESS" && (
            <button
              onClick={handleFinishSession}
              id="btn-finalizar-estacao-dupla"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Finalizar Atendimento</span>
            </button>
          )}

          {session.status === "COMPLETED" && (
            <button
              onClick={handleSwapRoles}
              id="btn-inverter-papeis"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Inverter Papéis (Rodada 2)</span>
            </button>
          )}

          <button
            onClick={onExit}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            title="Sair da sala"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Grid: Left Consultation / Right Scoring & Script */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (Dialogue / Patient Bedside / Audio) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Audio & Participant Status Header */}
          <div className="p-4 rounded-2xl bg-[#0B1526] border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-300 font-bold text-sm">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">
                  Médico: {session.doctorName} {isDoctor && "(Você)"}
                </p>
                <p className="text-[11px] text-slate-400">
                  Avaliador/Paciente: {session.evaluatorName} {!isDoctor && "(Você)"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsMicMuted(!isMicMuted)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                isMicMuted
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                  : "bg-slate-800 border-slate-700 text-emerald-400"
              }`}
            >
              {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span>{isMicMuted ? "Microfone Mudo" : "Microfone Ativo"}</span>
            </button>
          </div>

          {/* Dialogue & Chat Area */}
          <div className="p-4 rounded-2xl bg-[#070D18] border border-slate-800/80 flex flex-col h-[460px]">
            <div className="text-xs font-bold text-slate-300 pb-2 border-b border-slate-800 flex items-center justify-between">
              <span>Diálogo Clínico da Dupla</span>
              <span className="text-[10px] text-slate-500">
                Fale pelo microfone ou digite as perguntas
              </span>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-2">
              {session.chatMessages.map((msg) => {
                const isMe =
                  (isDoctor && msg.sender === "doctor") || (!isDoctor && msg.sender === "evaluator");
                const isSys = msg.sender === "system";

                if (isSys) {
                  return (
                    <div
                      key={msg.id}
                      className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-sky-300 text-center"
                    >
                      {msg.text}
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                  >
                    <span className="text-[10px] text-slate-400 mb-0.5 px-1">
                      {msg.senderName} ({msg.sender === "doctor" ? "Médico" : "Avaliador/Paciente"}) · {msg.time}
                    </span>
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl text-xs font-medium ${
                        isMe
                          ? "bg-sky-600 text-white rounded-tr-xs"
                          : "bg-slate-800 text-slate-100 rounded-tl-xs border border-slate-700"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input message form */}
            <form onSubmit={handleSendMessage} className="pt-2 flex items-center gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={
                  isDoctor
                    ? "Pergunte ao paciente ou solicite exames..."
                    : "Responda como paciente ou forneça laudos..."
                }
                className="flex-1 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-hidden focus:border-sky-500"
              />
              <button
                type="submit"
                className="p-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold transition-all shadow-md"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Tabbed Checklist, Confidential Script, Exams */}
        <div className="lg:col-span-5 space-y-4">
          {/* Sub-tab Switcher */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#09101d] border border-slate-800">
            <button
              onClick={() => setActiveTab("CHECKLIST")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "CHECKLIST"
                  ? "bg-sky-500 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Checklist Oficial INEP
            </button>

            {!isDoctor && (
              <button
                onClick={() => setActiveTab("SCRIPT")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "SCRIPT"
                    ? "bg-sky-500 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Roteiro do Paciente
              </button>
            )}

            <button
              onClick={() => setActiveTab("EXAMS")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "EXAMS"
                  ? "bg-sky-500 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Exames ({session.revealedExams.length})
            </button>
          </div>

          {/* 1. Checklist Tab */}
          {activeTab === "CHECKLIST" && (
            <div className="p-4 rounded-2xl bg-[#0B1526] border border-slate-800 space-y-4 max-h-[520px] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-xs font-bold text-white">Espelho de Avaliação INEP</h3>
                  <p className="text-[11px] text-slate-400">
                    {isDoctor
                      ? "Acompanhe as pontuações registradas pelo avaliador"
                      : "Pontue o desempenho do médico em tempo real"}
                  </p>
                </div>
                <div className="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold font-mono">
                  Nota: {session.totalScore.toFixed(2)} / {session.maxScore.toFixed(2)}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                {Object.values(session.checklistScores).map((item, idx) => (
                  <div
                    key={item.itemId}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-slate-200 leading-relaxed font-medium">
                        <span className="text-slate-500 font-bold mr-1.5">#{idx + 1}</span>
                        {item.itemDescription}
                      </p>
                      <span className="text-[10px] font-mono text-sky-400 shrink-0 font-bold">
                        {item.pointsAwarded.toFixed(2)} / {item.maxPoints.toFixed(2)} pts
                      </span>
                    </div>

                    {/* Evaluator buttons vs Doctor status pill */}
                    {!isDoctor ? (
                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleScoreItem(item.itemId, "ADEQUATE", item.maxPoints)}
                          className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold transition-all ${
                            item.status === "ADEQUATE"
                              ? "bg-emerald-500 text-white shadow-md"
                              : "bg-slate-800 text-slate-400 hover:text-emerald-300"
                          }`}
                        >
                          Adequado
                        </button>
                        <button
                          type="button"
                          onClick={() => handleScoreItem(item.itemId, "PARTIAL", item.maxPoints)}
                          className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold transition-all ${
                            item.status === "PARTIAL"
                              ? "bg-amber-500 text-white shadow-md"
                              : "bg-slate-800 text-slate-400 hover:text-amber-300"
                          }`}
                        >
                          Parcial
                        </button>
                        <button
                          type="button"
                          onClick={() => handleScoreItem(item.itemId, "INADEQUATE", item.maxPoints)}
                          className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold transition-all ${
                            item.status === "INADEQUATE"
                              ? "bg-rose-500 text-white shadow-md"
                              : "bg-slate-800 text-slate-400 hover:text-rose-300"
                          }`}
                        >
                          Insuficiente
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 pt-1 text-[11px]">
                        <span className="text-slate-500">Status registrado:</span>
                        <span
                          className={`font-bold ${
                            item.status === "ADEQUATE"
                              ? "text-emerald-400"
                              : item.status === "PARTIAL"
                              ? "text-amber-400"
                              : item.status === "INADEQUATE"
                              ? "text-rose-400"
                              : "text-slate-500"
                          }`}
                        >
                          {item.status === "ADEQUATE"
                            ? "✓ Adequado"
                            : item.status === "PARTIAL"
                            ? "⚡ Parcial"
                            : item.status === "INADEQUATE"
                            ? "✗ Insuficiente"
                            : "Aguardando avaliação"}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Confidential Script Tab (Evaluator only) */}
          {activeTab === "SCRIPT" && !isDoctor && (
            <div className="p-4 rounded-2xl bg-[#0B1526] border border-purple-500/30 space-y-4 max-h-[520px] overflow-y-auto">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-purple-400">
                <ShieldCheck className="w-4 h-4" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Roteiro Confidencial do Ator / Paciente
                </h3>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-purple-300 tracking-wider">
                    Instrução Geral ao Ator
                  </span>
                  <p className="text-xs leading-relaxed text-slate-200 font-medium">
                    {station.patientScript?.generalInstructions ||
                      "Aja como um paciente com dor moderada a intensa. Responda apenas o que o médico perguntar especificamente."}
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                    Respostas às Perguntas do Médico:
                  </span>
                  <div className="space-y-2">
                    {station.patientScript?.dialogueTriggers?.map((dt, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-slate-900 border border-slate-800"
                      >
                        <p className="text-[11px] text-sky-300 font-semibold">
                          Se perguntar: {dt.trigger}
                        </p>
                        <p className="text-xs text-white font-medium mt-0.5">
                          Responda: "{dt.response}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. Exams Tab */}
          {activeTab === "EXAMS" && (
            <div className="p-4 rounded-2xl bg-[#0B1526] border border-slate-800 space-y-4 max-h-[520px] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-xs font-bold text-white">Exames Físicos e Complementares</h3>
                {!isDoctor && (
                  <span className="text-[10px] text-slate-400">
                    Clique em liberar quando o médico solicitar
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {station.physicalExamData && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Sinais Vitais e Exame Físico</span>
                      {!isDoctor && !session.revealedExams.includes("Exame Físico") && (
                        <button
                          onClick={() => handleRevealExam("Exame Físico")}
                          className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold transition-all"
                        >
                          Liberar Exame
                        </button>
                      )}
                    </div>
                    {isDoctor && !session.revealedExams.includes("Exame Físico") ? (
                      <p className="text-xs text-slate-500 italic">
                        Solicite a aferição ao examinador para visualizar os dados.
                      </p>
                    ) : (
                      <div className="text-xs text-slate-300 space-y-1 font-mono">
                        <p>PA: {station.physicalExamData.vitalSigns.bloodPressure}</p>
                        <p>FC: {station.physicalExamData.vitalSigns.heartRate} bpm</p>
                        <p>FR: {station.physicalExamData.vitalSigns.respiratoryRate} irpm</p>
                        <p>SpO2: {station.physicalExamData.vitalSigns.oxygenSaturation}%</p>
                        <p>Temp: {station.physicalExamData.vitalSigns.temperature}°C</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
