import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActiveSessionResolutionView } from "../components/questions/ActiveSessionResolutionView";
import { TEST_QUESTIONS_COLLECTION } from "./testFixtures";
import { ActiveTrainingSession, Question } from "../types";

describe("Simulation Immersive Experience (INEP / Hardwork Layout)", () => {
  const mockOnUpdateSession = vi.fn();
  const mockOnFinishSession = vi.fn();
  const mockOnExitSession = vi.fn();

  const mockQuestions: Question[] = [
    {
      ...TEST_QUESTIONS_COLLECTION[0],
      id: "q-sim-1",
      clinicalCase: "Paciente feminina de 27 anos com dor abdominal...\n[IMAGEM: q1_img.png]",
      images: [
        {
          url: "/images/q1_img.png",
          caption: "Exame Laboratorial / Tabela",
          filename: "q1_img.png",
        },
      ],
      options: [
        { id: "A", text: "Iniciar antibioticoterapia empírica", isCorrect: false },
        { id: "B", text: "Realizar tomografia de abdome", isCorrect: true },
        { id: "C", text: "Encaminhar para cirurgia", isCorrect: false },
        { id: "D", text: "Prescrever analgesia simples", isCorrect: false },
      ],
    },
    {
      ...TEST_QUESTIONS_COLLECTION[1],
      id: "q-sim-2",
      clinicalCase: "Segundo caso clínico para teste de navegação...",
      images: [],
      options: [
        { id: "A", text: "Opção 1", isCorrect: true },
        { id: "B", text: "Opção 2", isCorrect: false },
        { id: "C", text: "Opção 3", isCorrect: false },
        { id: "D", text: "Opção 4", isCorrect: false },
      ],
    },
  ];

  const mockSimulationSession: ActiveTrainingSession = {
    id: "sim-test-1",
    title: "Simulado Revalida INEP",
    subtitle: "2 questões • Modo Simulado",
    mode: "SIMULADO",
    config: {
      mode: "SIMULADO",
      title: "Simulado Revalida INEP",
      objective: "OFICIAIS",
      areas: ["ALL"],
      topics: [],
      competencies: [],
      years: ["ALL"],
      origin: "ALL",
      difficulty: "ALL",
      inepRelevance: "ALL",
      smartFilters: {
        onlyUnanswered: false,
        onlyWrong: false,
        onlyCorrect: false,
        onlyFlagged: false,
        onlyReincidentErrors: false,
        onlyWithUpdatedGuideline: false,
        onlyHighInepPattern: false,
        excludeMastered: false,
      },
      quantity: 2,
      feedbackMode: "END_OF_SESSION",
      timerMode: "EXAM_STRICT",
      showComments: false,
      ordering: "RANDOM",
    },
    questionIds: ["q-sim-1", "q-sim-2"],
    currentIndex: 0,
    answers: {},
    flaggedQuestionIds: [],
    startTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    totalDurationSeconds: 706, // 11 min 46 sec
    isCompleted: false,
    paused: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Renders SimulationTimerHUD with minutes and seconds labels, Pause and Encerrar actions", () => {
    render(
      <ActiveSessionResolutionView
        session={mockSimulationSession}
        allQuestions={mockQuestions}
        onUpdateSession={mockOnUpdateSession}
        onFinishSession={mockOnFinishSession}
        onExitSession={mockOnExitSession}
      />
    );

    // Timer display & subtitles
    expect(screen.getByText(/Minutos/i)).toBeInTheDocument();
    expect(screen.getByText(/Segundos/i)).toBeInTheDocument();

    // Pausar e Encerrar buttons
    const pauseBtn = screen.getByRole("button", { name: /Pausar/i });
    const finishBtn = screen.getByRole("button", { name: /Encerrar/i });
    expect(pauseBtn).toBeInTheDocument();
    expect(finishBtn).toBeInTheDocument();

    // Clicking Encerrar invokes onFinishSession
    fireEvent.click(finishBtn);
    expect(mockOnFinishSession).toHaveBeenCalledTimes(1);
  });

  it("2. Toggling pause triggers pause overlay with resume option", () => {
    render(
      <ActiveSessionResolutionView
        session={mockSimulationSession}
        allQuestions={mockQuestions}
        onUpdateSession={mockOnUpdateSession}
        onFinishSession={mockOnFinishSession}
        onExitSession={mockOnExitSession}
      />
    );

    const pauseBtn = screen.getByRole("button", { name: /Pausar/i });
    fireEvent.click(pauseBtn);

    // Pause overlay appears
    expect(screen.getByText(/Simulado Pausado/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continuar Simulado/i })).toBeInTheDocument();
  });

  it("3. Displays 'Clique na imagem para ampliar' and clicking opens ClinicalMediaLightbox", () => {
    render(
      <ActiveSessionResolutionView
        session={mockSimulationSession}
        allQuestions={mockQuestions}
        onUpdateSession={mockOnUpdateSession}
        onFinishSession={mockOnFinishSession}
        onExitSession={mockOnExitSession}
      />
    );

    // Zoom trigger text
    const zoomTrigger = screen.getByText(/Clique na imagem para ampliar/i);
    expect(zoomTrigger).toBeInTheDocument();

    // Click to open lightbox
    fireEvent.click(zoomTrigger);

    // Lightbox controls appear
    expect(screen.getByTitle(/Fechar \(Esc\)/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Aumentar zoom/i)).toBeInTheDocument();
  });

  it("4. Renders SimulationQuestionDock with numbers '01', '02', 'Voltar' and 'Avançar'", () => {
    render(
      <ActiveSessionResolutionView
        session={mockSimulationSession}
        allQuestions={mockQuestions}
        onUpdateSession={mockOnUpdateSession}
        onFinishSession={mockOnFinishSession}
        onExitSession={mockOnExitSession}
      />
    );

    // Dock buttons
    expect(screen.getByRole("button", { name: /Voltar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Avançar/i })).toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();

    // Clicking '02' navigates to question 2
    fireEvent.click(screen.getByText("02"));
    expect(mockOnUpdateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        currentIndex: 1,
      })
    );
  });
});
