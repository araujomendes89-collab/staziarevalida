import { AiService } from "./aiService";

export interface VoiceTutorResponse {
  text: string;
  spokenText: string;
  keyPoints: string[];
  followUpPrompt: string;
  area: string;
}

export interface TransitQuizQuestion {
  questionNumber: number;
  totalQuestions: number;
  area: string;
  theme: string;
  spokenQuestion: string;
  context: string;
  expectedKeyTerms: string[];
  explanation: string;
}

export interface TransitEvaluationResult {
  isCorrect: boolean;
  score: number;
  spokenFeedback: string;
  detailedAnalysis: string;
  missedKeyPoints: string[];
}

export class VoiceTutorService {
  private static speechSynth: SpeechSynthesis | null =
    typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  private static recognition: any = null;
  private static currentUtterance: SpeechSynthesisUtterance | null = null;

  private static handleApiError(response: Response, err: any) {
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent("ai-auth-required", { detail: err }));
    } else if (response.status === 403) {
      if (err.code === "PLAN_EXPIRED" || err.quota?.reason === "PLAN_EXPIRED") {
        window.dispatchEvent(new CustomEvent("ai-plan-expired", { detail: err }));
        window.dispatchEvent(new CustomEvent("open-pricing-modal", { detail: { reason: "PLAN_EXPIRED", message: err.message } }));
      }
    }
  }

  /**
   * Consulta a API do Tutor por Voz para obter a resposta clínica socrática e falada
   */
  static async askVoiceTutor(params: {
    userInput: string;
    contextArea?: string;
    studentLevel?: string;
    preferredModel?: "gemini" | "sonnet" | "opus";
  }): Promise<VoiceTutorResponse> {
    const response = await fetch("/api/ai/voice-tutor/explain", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...AiService.getUserHeaders(),
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      this.handleApiError(response, err);
      throw new Error(err.message || err.error || `Erro HTTP ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Obtém a próxima pergunta oral do Modo Trânsito
   */
  static async getTransitQuestion(params: {
    area: string;
    questionNumber: number;
    totalQuestions?: number;
    preferredModel?: "gemini" | "sonnet";
  }): Promise<TransitQuizQuestion> {
    const response = await fetch("/api/ai/voice-tutor/transit-question", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...AiService.getUserHeaders(),
      },
      body: JSON.stringify({
        area: params.area,
        questionNumber: params.questionNumber,
        totalQuestions: params.totalQuestions || 10,
        preferredModel: params.preferredModel || "gemini",
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      this.handleApiError(response, err);
      throw new Error(err.message || err.error || `Erro HTTP ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Avalia a resposta falada pelo aluno no Modo Trânsito
   */
  static async evaluateTransitAnswer(params: {
    question: TransitQuizQuestion;
    spokenAnswer: string;
    preferredModel?: "gemini" | "sonnet";
  }): Promise<TransitEvaluationResult> {
    const response = await fetch("/api/ai/voice-tutor/transit-evaluate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...AiService.getUserHeaders(),
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      this.handleApiError(response, err);
      throw new Error(err.message || err.error || `Erro HTTP ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Executa a síntese de voz (TTS) do navegador para falar o texto
   */
  static speak(
    text: string,
    options: {
      rate?: number;
      pitch?: number;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: any) => void;
    } = {}
  ): boolean {
    if (!this.speechSynth) {
      console.warn("SpeechSynthesis não suportado neste navegador.");
      options.onError?.(new Error("SpeechSynthesis not supported"));
      return false;
    }

    // Stop ongoing speech before new utterance
    this.stopSpeaking();

    // Clean text from markdown formatting or asterisks
    const cleanText = text
      .replace(/[*#_`~>[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanText) return false;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "pt-BR";
    utterance.rate = options.rate || 1.05; // Slightly faster, natural pacing
    utterance.pitch = options.pitch || 1.0;

    // Pick best pt-BR voice if available
    const voices = this.speechSynth.getVoices();
    const ptVoices = voices.filter(
      (v) => v.lang === "pt-BR" || v.lang === "pt_BR" || v.lang.startsWith("pt")
    );

    const preferredVoice =
      ptVoices.find((v) => v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Neural")) ||
      ptVoices[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      options.onStart?.();
    };

    utterance.onend = () => {
      this.currentUtterance = null;
      options.onEnd?.();
    };

    utterance.onerror = (e) => {
      this.currentUtterance = null;
      console.warn("SpeechSynthesis utterance error:", e);
      options.onError?.(e);
    };

    this.currentUtterance = utterance;
    this.speechSynth.speak(utterance);
    return true;
  }

  /**
   * Pausa ou cancela a fala ativa
   */
  static stopSpeaking() {
    if (this.speechSynth) {
      this.speechSynth.cancel();
      this.currentUtterance = null;
    }
  }

  /**
   * Verifica se o sintetizador está falando no momento
   */
  static isSpeaking(): boolean {
    return !!this.speechSynth?.speaking;
  }

  /**
   * Inicializa o Reconhecimento de Fala (Speech-to-Text) do navegador
   */
  static startSpeechRecognition(options: {
    onResult: (transcript: string, isFinal: boolean) => void;
    onError: (error: any) => void;
    onEnd: () => void;
    continuous?: boolean;
  }): { stop: () => void } {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      options.onError(new Error("Seu navegador não possui suporte ao microfone Web Speech API."));
      return { stop: () => {} };
    }

    try {
      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch (_) {}
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.continuous = options.continuous ?? true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentText = finalTranscript || interimTranscript;
        options.onResult(currentText, !!finalTranscript);
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        if (event.error !== "no-speech") {
          options.onError(event);
        }
      };

      recognition.onend = () => {
        options.onEnd();
      };

      recognition.start();
      this.recognition = recognition;

      return {
        stop: () => {
          try {
            recognition.stop();
          } catch (_) {}
        },
      };
    } catch (err) {
      options.onError(err);
      return { stop: () => {} };
    }
  }

  /**
   * Toca um beep sutil para confirmar ativação do microfone
   */
  static playCueSound(type: "start" | "success" | "stop") {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === "start") {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === "success") {
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else {
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch (_) {}
  }
}
