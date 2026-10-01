import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  Square,
  Sparkles,
  Car,
  Brain,
  Layers,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ChevronRight,
  Settings,
  Flame,
  Award,
  BookOpen,
  FastForward,
  Radio,
  Cpu,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import {
  VoiceTutorService,
  VoiceTutorResponse,
  TransitQuizQuestion,
  TransitEvaluationResult,
} from "../../services/voiceTutorService";
import { FeatureGate } from "../common/FeatureGate";

interface ChatEntry {
  id: string;
  sender: "user" | "tutor";
  text: string;
  spokenText?: string;
  keyPoints?: string[];
  area?: string;
  timestamp: string;
  isEvaluating?: boolean;
}

export const VoiceTutorView: React.FC = () => {
  const { setActiveTab } = useApp();

  // Mode Selection: "conversar" (Direct Socratic Chat) | "transito" (Hands-free Transit Audio Quiz)
  const [activeMode, setActiveMode] = useState<"conversar" | "transito">("conversar");

  // Audio / Speech Recognition State
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isSpeakingTutor, setIsSpeakingTutor] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [speechRate, setSpeechRate] = useState(1.05);
  const [selectedModel, setSelectedModel] = useState<"sonnet" | "opus" | "gemini">("sonnet");

  // Conversational Tutor State
  const [conversation, setConversation] = useState<ChatEntry[]>([
    {
      id: "welcome-1",
      sender: "tutor",
      text: "Olá, Doutor! Eu sou o seu Preceptor por Voz. Pode falar livremente sobre qualquer dúvida médica, caso clínico ou pedir explicações conceituais. Pressione o microfone ou escolha um dos temas abaixo.",
      spokenText:
        "Olá, Doutor! Eu sou o seu Preceptor por Voz. Pode falar livremente sobre qualquer dúvida médica, caso clínico ou pedir explicações conceituais.",
      keyPoints: [
        "Comunicação por voz natural e socrática",
        "Diferenciação fisiopatológica rápida",
        "Modo Trânsito com quiz oral em 10 perguntas",
      ],
      area: "Preceptoria Geral",
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [isThinking, setIsThinking] = useState(false);
  const recognitionControllerRef = useRef<{ stop: () => void } | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Transit Mode State
  const [transitArea, setTransitArea] = useState("Pediatria");
  const [transitTotalQuestions, setTransitTotalQuestions] = useState(10);
  const [transitState, setTransitState] = useState<"idle" | "asking" | "listening" | "evaluating" | "feedback" | "finished">("idle");
  const [currentQuestion, setCurrentQuestion] = useState<TransitQuizQuestion | null>(null);
  const [transitHistory, setTransitHistory] = useState<
    Array<{
      question: TransitQuizQuestion;
      studentAnswer: string;
      evaluation: TransitEvaluationResult;
    }>
  >([]);
  const [transitScore, setTransitScore] = useState(0);

  // Quick Preset Prompts
  const conversationPresets = [
    {
      label: "🩺 Síndrome Nefrótica vs Nefrítica",
      prompt: "Eu nunca entendo síndrome nefrótica e nefrítica.",
      area: "Clínica Médica",
    },
    {
      label: "🤰 Pré-Eclâmpsia Grave & Sulfato",
      prompt: "Explique como conduzir a pré-eclâmpsia grave com critérios de gravidade e uso de sulfato de magnésio.",
      area: "Ginecologia e Obstetrícia",
    },
    {
      label: "👶 Desidratação: Planos A, B e C",
      prompt: "Qual a diferença prática entre os planos A, B e C de desidratação infantil no SUS?",
      area: "Pediatria",
    },
    {
      label: "🩸 Sangramento no 3º Trimestre",
      prompt: "Como diferenciar descolamento prematuro de placenta e placenta prévia em questão de prova?",
      area: "Ginecologia e Obstetrícia",
    },
    {
      label: "🧪 Fórmula de Winter na Gasometria",
      prompt: "Como calcular a compensação respiratória na acidose metabólica usando a fórmula de Winter?",
      area: "Clínica Médica",
    },
  ];

  // Auto scroll to bottom of chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, isThinking, liveTranscript]);

  // Clean speech when unmounting
  useEffect(() => {
    return () => {
      VoiceTutorService.stopSpeaking();
      recognitionControllerRef.current?.stop();
    };
  }, []);

  // -------------------------------------------------------------
  // Conversational Tutor Handlers
  // -------------------------------------------------------------
  const startListening = () => {
    VoiceTutorService.stopSpeaking();
    setIsSpeakingTutor(false);
    setLiveTranscript("");
    VoiceTutorService.playCueSound("start");

    const controller = VoiceTutorService.startSpeechRecognition({
      continuous: true,
      onResult: (transcript, isFinal) => {
        setLiveTranscript(transcript);
      },
      onError: (err) => {
        console.warn("Speech error:", err);
        setIsListening(false);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });

    recognitionControllerRef.current = controller;
    setIsListening(true);
  };

  const stopListeningAndSend = async (forcedText?: string) => {
    VoiceTutorService.playCueSound("stop");
    recognitionControllerRef.current?.stop();
    setIsListening(false);

    const textToSend = (forcedText || liveTranscript).trim();
    if (!textToSend) return;

    // Add user message to conversation
    const userMsg: ChatEntry = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };

    setConversation((prev) => [...prev, userMsg]);
    setLiveTranscript("");
    setIsThinking(true);

    try {
      const response = await VoiceTutorService.askVoiceTutor({
        userInput: textToSend,
        preferredModel: selectedModel,
        studentLevel: "Interno / Médico Revalidando",
      });

      const tutorMsg: ChatEntry = {
        id: `tutor-${Date.now()}`,
        sender: "tutor",
        text: response.text,
        spokenText: response.spokenText,
        keyPoints: response.keyPoints,
        area: response.area,
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      };

      setConversation((prev) => [...prev, tutorMsg]);

      // Speak aloud automatically if autoSpeak is on
      if (autoSpeak && response.spokenText) {
        speakTutorMessage(response.spokenText);
      }
    } catch (err: any) {
      console.error("Voice Tutor Query Error:", err);
      const errorMsg: ChatEntry = {
        id: `tutor-err-${Date.now()}`,
        sender: "tutor",
        text: "Desculpe, tive uma instabilidade momentânea na conexão de voz. Pode repetir sua dúvida?",
        spokenText: "Desculpe, tive uma instabilidade momentânea na conexão. Pode repetir sua dúvida?",
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      };
      setConversation((prev) => [...prev, errorMsg]);
    } finally {
      setIsThinking(false);
    }
  };

  const speakTutorMessage = (text: string) => {
    setIsSpeakingTutor(true);
    VoiceTutorService.speak(text, {
      rate: speechRate,
      onStart: () => setIsSpeakingTutor(true),
      onEnd: () => setIsSpeakingTutor(false),
      onError: () => setIsSpeakingTutor(false),
    });
  };

  const stopAllSpeech = () => {
    VoiceTutorService.stopSpeaking();
    setIsSpeakingTutor(false);
  };

  // -------------------------------------------------------------
  // Transit Mode (Modo Trânsito) Engine
  // -------------------------------------------------------------
  const startTransitQuiz = async (area = transitArea) => {
    VoiceTutorService.stopSpeaking();
    setTransitArea(area);
    setTransitHistory([]);
    setTransitScore(0);
    setTransitState("asking");

    try {
      const q1 = await VoiceTutorService.getTransitQuestion({
        area,
        questionNumber: 1,
        totalQuestions: transitTotalQuestions,
        preferredModel: selectedModel === "opus" ? "sonnet" : selectedModel,
      });

      setCurrentQuestion(q1);

      // Speak question aloud, then auto-listen
      speakTransitQuestionAndListen(q1);
    } catch (error) {
      console.error("Transit Start Error:", error);
      alert("Não foi possível iniciar o Modo Trânsito. Verifique sua conexão.");
      setTransitState("idle");
    }
  };

  const speakTransitQuestionAndListen = (question: TransitQuizQuestion) => {
    setIsSpeakingTutor(true);
    setTransitState("asking");

    VoiceTutorService.speak(question.spokenQuestion, {
      rate: speechRate,
      onStart: () => setIsSpeakingTutor(true),
      onEnd: () => {
        setIsSpeakingTutor(false);
        // Automatically start listening for student's voice
        startTransitListening(question);
      },
      onError: () => {
        setIsSpeakingTutor(false);
        startTransitListening(question);
      },
    });
  };

  const startTransitListening = (question: TransitQuizQuestion) => {
    setTransitState("listening");
    setLiveTranscript("");
    VoiceTutorService.playCueSound("start");

    const controller = VoiceTutorService.startSpeechRecognition({
      continuous: true,
      onResult: (transcript, isFinal) => {
        setLiveTranscript(transcript);
      },
      onError: (err) => {
        console.warn("Transit Speech error:", err);
      },
      onEnd: () => {
        // Auto evaluate if something was spoken
      },
    });

    recognitionControllerRef.current = controller;
    setIsListening(true);
  };

  const submitTransitAnswer = async (forcedTranscript?: string) => {
    VoiceTutorService.playCueSound("stop");
    recognitionControllerRef.current?.stop();
    setIsListening(false);

    if (!currentQuestion) return;

    const spokenAnswer = (forcedTranscript || liveTranscript).trim() || "Não soube responder.";
    setTransitState("evaluating");

    try {
      const evalResult = await VoiceTutorService.evaluateTransitAnswer({
        question: currentQuestion,
        spokenAnswer,
        preferredModel: selectedModel === "opus" ? "sonnet" : selectedModel,
      });

      // Update history & score
      setTransitHistory((prev) => [
        ...prev,
        {
          question: currentQuestion,
          studentAnswer: spokenAnswer,
          evaluation: evalResult,
        },
      ]);

      if (evalResult.isCorrect) {
        setTransitScore((prev) => prev + 1);
        VoiceTutorService.playCueSound("success");
      }

      setTransitState("feedback");

      // Speak feedback, then advance to next question
      VoiceTutorService.speak(evalResult.spokenFeedback, {
        rate: speechRate,
        onStart: () => setIsSpeakingTutor(true),
        onEnd: () => {
          setIsSpeakingTutor(false);
          advanceTransitQuiz(currentQuestion.questionNumber + 1);
        },
        onError: () => {
          setIsSpeakingTutor(false);
          advanceTransitQuiz(currentQuestion.questionNumber + 1);
        },
      });
    } catch (error) {
      console.error("Transit Evaluation Error:", error);
      setTransitState("feedback");
    }
  };

  const advanceTransitQuiz = async (nextQuestionNum: number) => {
    if (nextQuestionNum > transitTotalQuestions) {
      setTransitState("finished");
      VoiceTutorService.speak(
        `Parabéns, Doutor! Você concluiu as dez perguntas do Modo Trânsito em ${transitArea}. Você acertou ${transitScore} questões.`,
        { rate: speechRate }
      );
      return;
    }

    setTransitState("asking");
    try {
      const nextQ = await VoiceTutorService.getTransitQuestion({
        area: transitArea,
        questionNumber: nextQuestionNum,
        totalQuestions: transitTotalQuestions,
        preferredModel: selectedModel === "opus" ? "sonnet" : selectedModel,
      });

      setCurrentQuestion(nextQ);
      speakTransitQuestionAndListen(nextQ);
    } catch (error) {
      console.error("Advance error:", error);
    }
  };

  return (
    <FeatureGate
      feature="ai_coach"
      title="Tutor por Voz & Stazia AI Coach"
      description="O Tutor por Voz com preceptoria socrática em tempo real e o Modo Trânsito hands-free são exclusivos do plano Stazia Elite."
    >
      <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
        {/* 1. HERO HEADER */}
        <div className="p-6 rounded-2xl bg-[#101827] border border-slate-700 shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg border border-blue-400/40">
                <Mic className="w-6 h-6" />
              </div>
              {isListening && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Tutor por Voz & Modo Trânsito
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-900 text-blue-200 border border-blue-500/60 text-xs font-mono font-bold">
                  Speech-to-Text & Text-to-Speech
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Converse naturalmente em português com o preceptor socrático ou treine oralmente no carro com o Modo Trânsito hands-free.
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-[#1a2638] border border-slate-600 self-start md:self-auto">
            <button
              type="button"
              onClick={() => {
                setActiveMode("conversar");
                VoiceTutorService.stopSpeaking();
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeMode === "conversar"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Conversar com Tutor</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode("transito");
                VoiceTutorService.stopSpeaking();
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeMode === "transito"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span>🚗 Modo Trânsito (10Q)</span>
            </button>
          </div>
        </div>

        {/* Audio Controls & Voice Configuration Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Model Selector */}
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 font-medium">Modelo:</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as any)}
                className="bg-black/60 border border-white/20 rounded-lg px-2 py-1 text-blue-200 font-medium text-xs focus:outline-none focus:border-blue-400 cursor-pointer"
              >
                <option value="sonnet">Claude Sonnet 5 (Raciocínio Clínico Fluido)</option>
                <option value="gemini">Gemini 3.7 Flash (Latência Ultrabaixa)</option>
                <option value="opus">Claude Opus 5 (Profundidade Máxima)</option>
              </select>
            </div>

            {/* Voice Speed */}
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400">Velocidade:</span>
              {[0.9, 1.05, 1.25].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setSpeechRate(rate)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                    speechRate === rate
                      ? "bg-blue-600 text-white font-bold"
                      : "bg-black/40 text-zinc-400 hover:text-white"
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* Auto-Speech Toggle */}
            <label className="flex items-center gap-1.5 text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => setAutoSpeak(e.target.checked)}
                className="rounded border-zinc-700 text-blue-600 focus:ring-blue-500 bg-black/50"
              />
              <span className="flex items-center gap-1 text-xs">
                <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                Voz Automática (TTS)
              </span>
            </label>
          </div>

          {/* Voice Activity Status */}
          <div className="flex items-center gap-2">
            {isSpeakingTutor && (
              <button
                type="button"
                onClick={stopAllSpeech}
                className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 text-xs flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Interromper Áudio</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  isSpeakingTutor
                    ? "bg-blue-400 animate-ping"
                    : isListening
                    ? "bg-red-500 animate-pulse"
                    : "bg-emerald-400"
                }`}
              ></span>
              <span>
                {isSpeakingTutor
                  ? "Tutor Falando..."
                  : isListening
                  ? "Ouvindo sua voz..."
                  : "Pronto para falar"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. TAB 1: CONVERSAR COM TUTOR (Direct Socratic Dialogue) */}
      {activeMode === "conversar" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Chat Stream & Mic Console (2 Cols) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Conversation Log Card */}
            <div className="p-4 sm:p-6 rounded-2xl bg-[#101827] border border-slate-700 shadow-lg min-h-[420px] max-h-[560px] overflow-y-auto space-y-4 flex flex-col">
              {conversation.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-[92%] ${
                    msg.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold border ${
                      msg.sender === "user"
                        ? "bg-purple-600/30 text-purple-200 border-purple-500/40"
                        : "bg-blue-600/30 text-blue-200 border-blue-500/40"
                    }`}
                  >
                    {msg.sender === "user" ? "Eu" : <Brain className="w-4 h-4" />}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`p-4 rounded-2xl text-xs sm:text-sm space-y-2.5 ${
                      msg.sender === "user"
                        ? "bg-purple-950 border border-purple-500/50 text-purple-100 rounded-tr-none"
                        : "bg-[#1a2638] border border-slate-600 text-slate-100 rounded-tl-none"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-400 border-b border-white/5 pb-1">
                      <span className="font-bold text-zinc-300">
                        {msg.sender === "user" ? "Sua Fala (STT)" : "Preceptor por Voz (Claude)"}
                      </span>
                      <span>{msg.timestamp}</span>
                    </div>

                    {/* Text Body */}
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                    {/* Key Clinical Pearls Card for Tutor */}
                    {msg.keyPoints && msg.keyPoints.length > 0 && (
                      <div className="p-2.5 rounded-xl bg-blue-950/30 border border-blue-500/20 space-y-1 mt-2 text-xs">
                        <span className="font-bold text-blue-300 flex items-center gap-1 text-[11px]">
                          <Sparkles className="w-3 h-3 text-blue-400" />
                          Fixação Rápida / Padrão Ouro:
                        </span>
                        <ul className="space-y-0.5 text-zinc-300 text-[11px] list-disc list-inside">
                          {msg.keyPoints.map((pt, idx) => (
                            <li key={idx}>{pt}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Audio Play Button */}
                    {msg.spokenText && (
                      <div className="flex items-center justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => speakTutorMessage(msg.spokenText!)}
                          className="px-2.5 py-1 rounded-lg bg-[#1a2638] hover:bg-blue-900 text-blue-200 border border-slate-600 hover:border-blue-400 text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>Ouvir novamente</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Thinking state */}
              {isThinking && (
                <div className="flex gap-3 max-w-[80%] mr-auto items-center animate-pulse">
                  <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-300">
                    <Brain className="w-4 h-4 animate-spin" />
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[#1a2638] border border-slate-600 text-xs text-blue-100">
                    Claude estruturando resposta oral com fisiopatologia e conduta...
                  </div>
                </div>
              )}

              {/* Live Transcript Bubble when recording */}
              {isListening && liveTranscript && (
                <div className="flex gap-3 max-w-[85%] ml-auto flex-row-reverse animate-in fade-in">
                  <div className="w-8 h-8 rounded-xl bg-red-600/30 border border-red-500/40 flex items-center justify-center text-red-200">
                    <Mic className="w-4 h-4 animate-bounce" />
                  </div>
                  <div className="p-3.5 rounded-2xl bg-red-950 border border-red-500/50 text-xs text-red-100 italic">
                    "{liveTranscript}"
                  </div>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Big Reactive Voice Mic Bar */}
            <div className="p-4 rounded-2xl bg-[#101827] border border-slate-700 shadow-lg space-y-3">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={isListening ? () => stopListeningAndSend() : startListening}
                    className={`p-4 rounded-2xl flex items-center justify-center shadow-lg transition-all cursor-pointer ${
                      isListening
                        ? "bg-red-600 text-white animate-pulse shadow-red-500/30 scale-105"
                        : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:scale-105 shadow-blue-500/20"
                    }`}
                  >
                    {isListening ? (
                      <MicOff className="w-6 h-6" />
                    ) : (
                      <Mic className="w-6 h-6" />
                    )}
                  </button>

                  <div>
                    <span className="font-bold text-sm text-white block">
                      {isListening
                        ? "Ouvindo... Fale sua dúvida"
                        : "Pressione para falar com o Tutor"}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {isListening
                        ? "Pressione novamente quando terminar ou digite ao lado"
                        : "Speech-to-Text em português pt-BR com Claude"}
                    </span>
                  </div>
                </div>

                {isListening ? (
                  <button
                    type="button"
                    onClick={() => stopListeningAndSend()}
                    disabled={!liveTranscript.trim()}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md cursor-pointer transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Concluir e Enviar Fala</span>
                  </button>
                ) : (
                  <div className="text-xs font-mono text-zinc-500 flex items-center gap-1">
                    <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                    <span>Pronto para Áudio</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar with Prompt Presets & Pedagogical Focus (1 Col) */}
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#0e111d] border border-white/10 shadow-lg space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-100 uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Exemplos de Dúvidas Clínicas</span>
              </div>
              <p className="text-xs text-slate-300">
                Clique para simular uma fala instantânea do aluno:
              </p>

              <div className="space-y-2">
                {conversationPresets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => stopListeningAndSend(preset.prompt)}
                    className="w-full p-3 rounded-xl bg-[#1a2638] hover:bg-blue-900 border border-slate-600 hover:border-blue-400 text-left transition-all cursor-pointer group"
                  >
                    <div className="font-bold text-xs text-slate-50 group-hover:text-blue-200 flex items-center justify-between">
                      <span>{preset.label}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 italic">
                      "{preset.prompt}"
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Switch to Modo Trânsito */}
            <div className="p-4 rounded-2xl bg-[#1a1720] border border-amber-500/50 shadow-lg space-y-3">
              <div className="flex items-center gap-2">
                <Car className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-sm text-white">Modo Trânsito</h3>
                  <span className="text-[11px] text-slate-300">Treino oral sem olhar para a tela</span>
                </div>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                A IA pergunta oralmente 10 casos clínicos rápidos, você responde por voz, ela avalia e avança sozinha.
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveMode("transito");
                  startTransitQuiz("Pediatria");
                }}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Iniciar 10 Perguntas de Pediatria</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. TAB 2: MODO TRÂNSITO (Hands-Free Transit Audio Quiz) */}
      {activeMode === "transito" && (
        <div className="space-y-6">
          {/* Transit Mode Setup & Active Card */}
          <div className="p-6 sm:p-8 rounded-3xl bg-[#101827] border border-amber-500/60 shadow-lg space-y-6 text-center max-w-4xl mx-auto">
            <div className="flex items-center justify-between gap-4 border-b border-slate-600 pb-4">
              <div className="flex items-center gap-3 text-left">
                <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  <Car className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-white">
                    Modo Trânsito & Caminhada
                  </h2>
                  <p className="text-xs text-slate-300">
                    Sessão de quiz oral contínuo · Feedback em áudio e avanço inteligente
                  </p>
                </div>
              </div>

              {/* Specialty Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 hidden sm:inline">Especialidade:</span>
                <select
                  value={transitArea}
                  disabled={transitState !== "idle" && transitState !== "finished"}
                  onChange={(e) => setTransitArea(e.target.value)}
                  className="bg-[#1a2638] border border-amber-500/60 rounded-xl px-3 py-1.5 text-xs text-amber-100 font-bold focus:outline-none cursor-pointer"
                >
                  <option value="Pediatria">Pediatria (10 Questões)</option>
                  <option value="Clínica Médica">Clínica Médica (10 Questões)</option>
                  <option value="Ginecologia e Obstetrícia">Ginecologia e Obstetrícia (10 Questões)</option>
                  <option value="Cirurgia Geral">Cirurgia Geral (10 Questões)</option>
                  <option value="Medicina Preventiva e Social">Medicina Preventiva e Social (10 Questões)</option>
                </select>
              </div>
            </div>

            {/* Current Active Question Display / Audio Waveform */}
            {transitState === "idle" && (
              <div className="py-8 space-y-4">
                <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-500/40 text-amber-300 flex items-center justify-center mx-auto shadow-xl">
                  <Radio className="w-10 h-10 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Pronto para Iniciar Quiz Oral de {transitArea}?
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-200 max-w-lg mx-auto mt-1">
                    Coloque seus fones de ouvido. A IA vai falar o primeiro caso clínico e abrir o microfone para ouvir sua conduta.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => startTransitQuiz(transitArea)}
                  className="px-8 py-3.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black rounded-2xl text-sm shadow-xl flex items-center justify-center gap-2 mx-auto cursor-pointer transition-all hover:scale-105"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Iniciar 10 Perguntas Orais de {transitArea}</span>
                </button>
              </div>
            )}

            {(transitState === "asking" ||
              transitState === "listening" ||
              transitState === "evaluating" ||
              transitState === "feedback") &&
              currentQuestion && (
                <div className="space-y-6 py-2">
                  {/* Progress Header */}
                  <div className="flex items-center justify-between gap-2 max-w-lg mx-auto text-xs font-mono">
                    <span className="text-amber-300 font-bold">
                      Pergunta {currentQuestion.questionNumber} de {currentQuestion.totalQuestions}
                    </span>
                    <span className="text-emerald-400 font-bold">
                      Acertos: {transitScore}
                    </span>
                  </div>

                  {/* Visual Pulse / Audio Waveform */}
                  <div className="relative flex items-center justify-center py-4">
                    <div
                      className={`w-28 h-28 rounded-full border-4 flex items-center justify-center transition-all ${
                        transitState === "asking" || isSpeakingTutor
                          ? "bg-blue-600/20 border-blue-500 shadow-blue-500/40 animate-pulse scale-105"
                          : transitState === "listening"
                          ? "bg-red-600/20 border-red-500 shadow-red-500/40 animate-bounce scale-110"
                          : "bg-amber-600/20 border-amber-500 animate-spin"
                      }`}
                    >
                      {transitState === "asking" || isSpeakingTutor ? (
                        <Volume2 className="w-12 h-12 text-blue-400" />
                      ) : transitState === "listening" ? (
                        <Mic className="w-12 h-12 text-red-400" />
                      ) : (
                        <Brain className="w-12 h-12 text-amber-400" />
                      )}
                    </div>
                  </div>

                  {/* Status Banner */}
                  <div>
                    <span className="px-3 py-1 rounded-full bg-black/60 border border-white/10 text-xs font-mono font-bold text-amber-300 inline-block mb-2">
                      {transitState === "asking"
                        ? "🔊 Tutor Falando a Pergunta..."
                        : transitState === "listening"
                        ? "🎙️ Sua Vez! Fale sua conduta ou diagnóstico"
                        : transitState === "evaluating"
                        ? "🧠 Claude Avaliando sua Resposta..."
                        : "🗣️ Tutor Comentando o Padrão Ouro..."}
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-white max-w-2xl mx-auto leading-relaxed">
                      {currentQuestion.spokenQuestion}
                    </h3>
                  </div>

                  {/* Live Student Speech Text */}
                  {transitState === "listening" && (
                    <div className="p-4 rounded-2xl bg-black/60 border border-red-500/40 max-w-xl mx-auto space-y-3">
                      <p className="text-xs text-zinc-400">
                        Ouvindo pelo microfone:
                      </p>
                      <p className="text-sm font-medium text-red-200 italic min-h-[30px]">
                        {liveTranscript || "Diga a conduta, medicamento ou classificação..."}
                      </p>
                      <div className="flex items-center justify-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => submitTransitAnswer()}
                          className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-md transition-all"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Enviar Resposta Falada</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => submitTransitAnswer("Não soube responder, pular.")}
                          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 text-xs cursor-pointer transition-colors"
                        >
                          Pular Pergunta
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Latest Feedback Box */}
                  {transitHistory.length > 0 && transitState === "feedback" && (
                    <div className="p-4 rounded-2xl bg-black/60 border border-white/10 max-w-xl mx-auto text-left space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">Última Avaliação:</span>
                        <span
                          className={`font-bold px-2 py-0.5 rounded-full ${
                            transitHistory[transitHistory.length - 1].evaluation.isCorrect
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {transitHistory[transitHistory.length - 1].evaluation.isCorrect
                            ? "Correto (+1 Ponto)"
                            : "Parcial / Incompleto"}
                        </span>
                      </div>
                      <p className="text-zinc-300 leading-relaxed">
                        {transitHistory[transitHistory.length - 1].evaluation.spokenFeedback}
                      </p>
                    </div>
                  )}

                  {/* Quick Advance / Stop Controls */}
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => speakTransitQuestionAndListen(currentQuestion)}
                      className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Repetir Áudio da Pergunta</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        VoiceTutorService.stopSpeaking();
                        setTransitState("idle");
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Encerrar Modo Trânsito</span>
                    </button>
                  </div>
                </div>
              )}

            {/* Finished State Summary */}
            {transitState === "finished" && (
              <div className="py-8 space-y-6">
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 text-emerald-300 flex items-center justify-center mx-auto shadow-xl">
                  <Award className="w-10 h-10" />
                </div>

                <div>
                  <h3 className="text-xl font-black text-white">
                    Sessão Concluída: {transitScore} de {transitTotalQuestions} Acertos!
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-300 max-w-md mx-auto mt-1">
                    Você treinou raciocínio clínico oral instantâneo em {transitArea} no padrão INEP Revalida.
                  </p>
                </div>

                {/* History Breakdown Table */}
                <div className="max-w-2xl mx-auto space-y-2 text-left">
                  {transitHistory.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-start justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-zinc-300 block">
                          Q{idx + 1}: {item.question.theme}
                        </span>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Sua resposta: "{item.studentAnswer}"
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] shrink-0 ${
                          item.evaluation.isCorrect
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-red-500/20 text-red-300"
                        }`}
                      >
                        {item.evaluation.isCorrect ? "Acertou" : "Errou"}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => startTransitQuiz(transitArea)}
                    className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-md transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Treinar Novamente ({transitArea})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveMode("conversar")}
                    className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Voltar ao Chat por Voz</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </FeatureGate>
  );
};
