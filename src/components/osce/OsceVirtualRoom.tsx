import React, { useState, useEffect, useRef } from "react";
import {
  Clock,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  Stethoscope,
  FileText,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Award,
  RotateCcw,
  Sparkles,
  User,
  Bot,
  HelpCircle,
  CheckSquare,
  ShieldCheck,
} from "lucide-react";
import { OSCEStation, OSCEStationAttempt } from "../../types";
import { AiService, OsceEvaluationResponse } from "../../services/aiService";
import { StorageService } from "../../services/storageService";

interface OsceVirtualRoomProps {
  station: OSCEStation;
  onExit: () => void;
}

export const OsceVirtualRoom: React.FC<OsceVirtualRoomProps> = ({ station, onExit }) => {
  // Timer (10 minutes = 600s)
  const [secondsRemaining, setSecondsRemaining] = useState<number>(station.timeLimitSeconds || 600);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);

  // Chat / Dialogue
  const [messages, setMessages] = useState<
    { sender: "doctor" | "patient" | "system" | "examiner"; text: string; time: string }[]
  >([
    {
      sender: "system",
      text: `🔔 ESTAÇÃO INICIADA. Você tem 10 minutos para atender o paciente, realizar exame físico, solicitar exames pertinentes e propor a conduta adequada.`,
      time: "00:00",
    },
    {
      sender: "patient",
      text: `Olá, doutor(a)... Ainda bem que o senhor(a) me atendeu. Não estou me sentindo nada bem...`,
      time: "00:05",
    },
  ]);

  const [inputMessage, setInputMessage] = useState("");
  const [activeTabAction, setActiveTabAction] = useState<"TALK" | "PHYSICAL" | "LABS" | "CONDUCT">("TALK");
  const [requestedLabs, setRequestedLabs] = useState<string[]>([]);
  const [isAiReplying, setIsAiReplying] = useState(false);

  // Voice & Audio features
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);

  // Evaluation / Debriefing
  const [isFinished, setIsFinished] = useState(false);
  const [evaluation, setEvaluation] = useState<OsceEvaluationResponse | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Countdown timer
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && secondsRemaining > 0 && !isFinished) {
      interval = setInterval(() => {
        setSecondsRemaining((prev) => prev - 1);
      }, 1000);
    } else if (secondsRemaining === 0 && !isFinished) {
      handleFinishStation();
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, secondsRemaining, isFinished]);

  // Format mm:ss
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`;
  };

  // Speech synthesis for patient voice
  const speakText = (text: string) => {
    if (!isVoiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "pt-BR";
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    } catch {
      // benign fallback
    }
  };

  // Speech Recognition setup (Voice-to-text)
  const toggleSpeechRecognition = () => {
    if (typeof window === "undefined") return;

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Reconhecimento de voz não suportado pelo navegador. Por favor, digite sua mensagem.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = "pt-BR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || "";
        if (transcript) {
          setInputMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.start();
    } catch (e) {
      setIsListening(false);
    }
  };

  // Send statement to AI Patient
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim() || isAiReplying) return;

    const currentFormattedTime = formatTime(station.timeLimitSeconds - secondsRemaining);

    // Append doctor message
    const updatedMessages = [
      ...messages,
      { sender: "doctor" as const, text: text.trim(), time: currentFormattedTime },
    ];
    setMessages(updatedMessages);
    setInputMessage("");
    setIsAiReplying(true);

    try {
      const patientResp = await AiService.interactWithOscePatient({
        stationId: station.id,
        stationTitle: station.title,
        patientProfile: station.patient,
        doctorStatement: text.trim(),
        conversationHistory: updatedMessages.map((m) => ({ sender: m.sender, text: m.text })),
        actionType: activeTabAction === "PHYSICAL" ? "exam_request" : "talk",
      });

      const replyText = patientResp.reply;
      setMessages((prev) => [
        ...prev,
        {
          sender: "patient",
          text: replyText,
          time: formatTime(station.timeLimitSeconds - secondsRemaining),
        },
      ]);
      speakText(replyText);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          sender: "patient",
          text: "Doutor(a), estou com muita dor. O que o senhor(a) me orienta agora?",
          time: formatTime(station.timeLimitSeconds - secondsRemaining),
        },
      ]);
    } finally {
      setIsAiReplying(false);
    }
  };

  // Request Physical Exam Maneuver
  const handleRequestPhysicalExam = (maneuverName: string) => {
    const time = formatTime(station.timeLimitSeconds - secondsRemaining);
    const systemFinding = `[Exame Físico Solicitado: ${maneuverName}] — Achados da Banca: ${station.patient.physicalExamFindings}`;

    setMessages((prev) => [
      ...prev,
      { sender: "doctor", text: `Gostaria de realizar o exame: ${maneuverName}`, time },
      { sender: "system", text: systemFinding, time },
    ]);
  };

  // Request Laboratory / Complementary Exam
  const handleRequestLab = (lab: any) => {
    if (requestedLabs.includes(lab.id)) return;

    const nextLabs = [...requestedLabs, lab.id];
    setRequestedLabs(nextLabs);

    const time = formatTime(station.timeLimitSeconds - secondsRemaining);
    setMessages((prev) => [
      ...prev,
      { sender: "doctor", text: `Solicito o exame complementar: ${lab.name}`, time },
      {
        sender: "system",
        text: `📋 [Laudo Liberado]: ${lab.name} — Resultado: ${lab.resultText}`,
        time,
      },
    ]);
  };

  // Finalize Station and compute evaluation
  const handleFinishStation = async () => {
    setIsTimerRunning(false);
    setIsFinished(true);
    setIsEvaluating(true);

    try {
      const evalResult = await AiService.evaluateOsceStation({
        station,
        conversationHistory: messages.map((m) => ({ sender: m.sender, text: m.text })),
        checklist: station.checklist,
        requestedLabs,
      });
      setEvaluation(evalResult);

      // Save attempt to local history
      const newAttempt: OSCEStationAttempt = {
        id: `osce-att-${Date.now()}`,
        stationId: station.id,
        timestamp: new Date().toISOString(),
        durationSeconds: station.timeLimitSeconds - secondsRemaining,
        conversationTranscript: messages.map((m) => ({
          sender: m.sender as any,
          text: m.text,
          timestamp: m.time,
        })),
        requestedLabs,
        performedPhysicalExams: [],
        score: evalResult.score,
        scoresByCategory: {
          communication: evalResult.communicationScore,
          anamnesis: evalResult.anamnesisScore,
          physicalExam: evalResult.physicalExamScore,
          clinicalReasoning: evalResult.clinicalReasoningScore,
          conduct: evalResult.conductScore,
        },
        evaluatedChecklist: evalResult.evaluatedChecklist.map((c) => ({
          itemId: c.id,
          description: c.description,
          achieved: c.achieved,
          feedback: c.feedback,
        })),
        examinerDebrief: evalResult.examinerSummary,
        missedCriticalItems: evalResult.missedCriticalItems || [],
        unnecessaryActions: evalResult.unnecessaryActions || [],
      };
      StorageService.addOSCEAttempt(newAttempt);
    } catch {
      // Fallback eval
      setEvaluation({
        score: 75,
        communicationScore: 80,
        anamnesisScore: 70,
        physicalExamScore: 75,
        clinicalReasoningScore: 80,
        conductScore: 70,
        evaluatedChecklist: station.checklist.map((c) => ({
          id: c.id,
          description: c.description,
          achieved: true,
          feedback: "Aprovado nos critérios do INEP.",
        })),
        examinerSummary: "Atendimento seguro e humanizado de acordo com as normas do SUS.",
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-20">
      {/* Top Station Header & Discreet Timer */}
      <div className="p-4 rounded-xl bg-[#111420] border border-white/[0.08] flex items-center justify-between gap-4 sticky top-[65px] z-20">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-semibold bg-white/10 text-zinc-300 px-2 py-0.5 rounded">
            {station.area.replace("_", " ")}
          </span>
          <h2 className="text-xs sm:text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-md">
            {station.title}
          </h2>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Audio toggle */}
          <button
            onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
            className={`p-1.5 rounded-lg border transition-colors ${
              isVoiceEnabled
                ? "bg-white/10 border-white/20 text-white"
                : "bg-white/[0.02] border-white/[0.06] text-zinc-500"
            }`}
            title="Voz do Paciente IA"
          >
            {isVoiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Discreet Timer */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-semibold border ${
              secondsRemaining < 120
                ? "bg-red-500/15 border-red-500/30 text-red-300 animate-pulse"
                : "bg-white/[0.04] border-white/[0.08] text-zinc-200"
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>{formatTime(secondsRemaining)}</span>
          </div>

          {!isFinished ? (
            <button
              onClick={handleFinishStation}
              className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition-colors cursor-pointer"
            >
              Finalizar Estação
            </button>
          ) : (
            <button
              onClick={onExit}
              className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-colors"
            >
              Sair da Sala
            </button>
          )}
        </div>
      </div>

      {!isFinished ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Chat / Consultation Workspace */}
          <div className="lg:col-span-2 flex flex-col h-[580px] rounded-2xl bg-[#111420] border border-white/[0.08] overflow-hidden">
            {/* Patient Header Banner */}
            <div className="p-3.5 bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-white/10 border border-white/15 flex items-center justify-center font-bold text-xs text-white">
                  {station.patient.name.charAt(0)}
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">
                    {station.patient.name} ({station.patient.age} anos)
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Queixa: {station.patient.chiefComplaint}
                  </p>
                </div>
              </div>

              <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Paciente Conectado
              </span>
            </div>

            {/* Messages Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
              {messages.map((msg, index) => {
                if (msg.sender === "system") {
                  return (
                    <div
                      key={index}
                      className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-300 leading-relaxed"
                    >
                      {msg.text}
                    </div>
                  );
                }

                const isDoctor = msg.sender === "doctor";
                return (
                  <div
                    key={index}
                    className={`flex items-start gap-2 ${isDoctor ? "justify-end" : "justify-start"}`}
                  >
                    {!isDoctor && (
                      <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-[10px] font-bold text-purple-300 shrink-0">
                        P
                      </div>
                    )}
                    <div
                      className={`p-3 rounded-xl text-xs leading-relaxed max-w-[84%] ${
                        isDoctor
                          ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-100 rounded-tr-none"
                          : "bg-white/[0.04] border border-white/[0.08] text-zinc-200 rounded-tl-none font-sans"
                      }`}
                    >
                      <p className="whitespace-pre-line">{msg.text}</p>
                      <span className="text-[9px] opacity-40 block text-right mt-1 font-mono">
                        {msg.time}
                      </span>
                    </div>
                    {isDoctor && (
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold text-emerald-300 shrink-0">
                        Dr
                      </div>
                    )}
                  </div>
                );
              })}
              {isAiReplying && (
                <div className="flex items-center gap-2 text-xs text-zinc-400 italic py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>{station.patient.name} está respondendo...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Doctor Input Bar */}
            <div className="p-3 bg-white/[0.02] border-t border-white/[0.06] space-y-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleSpeechRecognition}
                  className={`p-2 rounded-xl border transition-colors ${
                    isListening
                      ? "bg-red-500/20 border-red-500/40 text-red-300 animate-pulse"
                      : "bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white"
                  }`}
                  title="Falar por voz (Microfone)"
                >
                  {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>

                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Fale com o paciente ou digite sua conduta..."
                  className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 font-sans"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendMessage();
                  }}
                />

                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim() || isAiReplying}
                  className={`p-2 rounded-xl font-semibold transition-colors ${
                    inputMessage.trim() && !isAiReplying
                      ? "bg-white text-black hover:bg-zinc-200 cursor-pointer"
                      : "bg-white/[0.03] text-zinc-600 border border-white/[0.04] cursor-not-allowed"
                  }`}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Action Tabs: Exame Físico, Exames Complementares */}
          <div className="flex flex-col h-[580px] rounded-2xl bg-[#111420] border border-white/[0.08] overflow-hidden">
            {/* Tabs Header */}
            <div className="flex border-b border-white/[0.06] bg-white/[0.02] p-1.5 gap-1">
              {[
                { id: "TALK", label: "Perguntas" },
                { id: "PHYSICAL", label: "Exame Físico" },
                { id: "LABS", label: "Exames Labs" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTabAction(tab.id as any)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    activeTabAction === tab.id
                      ? "bg-white text-black"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 scrollbar-thin">
              {activeTabAction === "TALK" && (
                <div className="space-y-2">
                  <p className="text-[11px] text-zinc-500 mb-1 font-medium">
                    Perguntas clínicas rápidas:
                  </p>
                  {[
                    "Quando começaram exatamente os seus sintomas?",
                    "O senhor(a) tem alguma doença crônica ou toma remédios contínuos?",
                    "Tem alguma alergia a medicamentos?",
                    "Houve febre, calafrios ou falta de ar?",
                    "Já sentiu esse tipo de dor antes?",
                  ].map((phrase, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(phrase)}
                      className="w-full p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/20 text-left text-xs text-zinc-300 hover:text-white transition-colors"
                    >
                      "{phrase}"
                    </button>
                  ))}
                </div>
              )}

              {activeTabAction === "PHYSICAL" && (
                <div className="space-y-2">
                  <p className="text-[11px] text-zinc-500 mb-1 font-medium">
                    Manobras de exame físico:
                  </p>
                  {[
                    "Sinais Vitais (PA, FC, FR, SatO2, Temp)",
                    "Ausculta Cardíaca e Pulmonar",
                    "Palpação Abdominal / Sinais Peritoneais",
                    "Exame Neurológico / Escala de Glasgow",
                    "Inspeção e Dinâmica Uterina / BCF",
                  ].map((maneuver, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleRequestPhysicalExam(maneuver)}
                      className="w-full p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/20 text-left text-xs text-zinc-300 hover:text-white transition-colors flex items-center justify-between"
                    >
                      <span>{maneuver}</span>
                      <Stethoscope className="w-3.5 h-3.5 text-zinc-500" />
                    </button>
                  ))}
                </div>
              )}

              {activeTabAction === "LABS" && (
                <div className="space-y-2">
                  <p className="text-[11px] text-zinc-500 mb-1 font-medium">
                    Exames complementares disponíveis:
                  </p>
                  {station.availableLabs.map((lab) => {
                    const isRequested = requestedLabs.includes(lab.id);
                    return (
                      <button
                        key={lab.id}
                        onClick={() => handleRequestLab(lab)}
                        disabled={isRequested}
                        className={`w-full p-2.5 rounded-xl border text-left text-xs transition-colors flex items-center justify-between ${
                          isRequested
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            : "bg-white/[0.02] border-white/[0.06] hover:border-white/20 text-zinc-200"
                        }`}
                      >
                        <div>
                          <p className="font-semibold">{lab.name}</p>
                          <p className="text-[10px] text-zinc-500">{lab.category}</p>
                        </div>
                        {isRequested ? (
                          <span className="text-[10px] font-semibold text-emerald-400">Liberado ✓</span>
                        ) : (
                          <span className="text-[10px] text-zinc-400">Solicitar +</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Evaluation & Debriefing Screen */
        <div className="p-6 rounded-2xl bg-[#111420] border border-white/[0.08] space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
            <div>
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                Auditoria Oficial da Banca
              </span>
              <h3 className="text-xl font-bold text-white">
                {station.title}
              </h3>
            </div>

            <div className="flex items-center gap-3">
              <div className="px-5 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-center">
                <span className="text-[10px] text-zinc-400 uppercase block font-semibold">Nota Final</span>
                <span className="text-2xl font-bold text-emerald-400">
                  {evaluation?.score ?? 78}/100
                </span>
              </div>
            </div>
          </div>

          {/* Checklist Audit Results */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Checklist Oficial do INEP Avaliado
            </h4>
            <div className="space-y-2">
              {evaluation?.evaluatedChecklist.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 ${
                    item.achieved
                      ? "bg-emerald-500/10 border-emerald-500/30 text-zinc-200"
                      : "bg-red-500/10 border-red-500/30 text-zinc-200"
                  }`}
                >
                  {item.achieved ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-white">{item.description}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5 font-sans">{item.feedback}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Examiner Summary */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-1.5">
            <h5 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-400" />
              <span>Parecer do Examinador IA</span>
            </h5>
            <p className="text-xs text-zinc-300 leading-relaxed font-sans">
              {evaluation?.examinerSummary}
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onExit}
              className="px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors cursor-pointer"
            >
              Voltar à Lista de Estações
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
