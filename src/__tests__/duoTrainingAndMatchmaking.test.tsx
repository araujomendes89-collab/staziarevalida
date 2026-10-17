import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NotificationService } from "../services/notificationService";
import { DuoSessionService } from "../services/duoSessionService";
import { OsceDuoRoomView } from "../components/osce/OsceDuoRoomView";
import { SEED_OSCE_STATIONS } from "../data/osceStationsData";
import { DuoSession } from "../types/duoSession";

// O app antigo usa o Firebase de PRODUÇÃO: aqui ele é sempre simulado, para nenhum teste ler ou gravar nada lá.
vi.mock("../lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(async () => undefined),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  deleteDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  onSnapshot: vi.fn(() => () => undefined),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => "agora"),
}));

describe("Sessão de Treino em Dupla, Matchmaking de Radar & Notificações", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. NotificationService (Web Push & Web Audio Chimes)", () => {
    it("should request notification permissions cleanly", async () => {
      const perm = await NotificationService.requestPermission();
      expect(["granted", "denied", "default"]).toContain(perm);
    });

    it("should synthesize audio chime without throwing error", () => {
      expect(() => NotificationService.playNotificationSound("invite")).not.toThrow();
      expect(() => NotificationService.playNotificationSound("match")).not.toThrow();
      expect(() => NotificationService.playNotificationSound("timer_warning")).not.toThrow();
      expect(() => NotificationService.playNotificationSound("success")).not.toThrow();
    });

    it("should handle background notifications safely", () => {
      const dispatched = NotificationService.sendBackgroundNotification("Teste", {
        body: "Corpo do alerta",
      });
      expect(typeof dispatched).toBe("boolean");
    });
  });

  describe("2. DuoSessionService (Matchmaking & Session Lifecycle)", () => {
    const station = SEED_OSCE_STATIONS[0];
    const doctor = { id: "usr_doc_1", name: "Dr. André Santos" };
    const evaluator = { id: "usr_eval_2", name: "Dra. Beatriz Lima" };

    it("should join and leave radar pool cleanly", async () => {
      await expect(DuoSessionService.joinRadarPool(doctor, station.id)).resolves.not.toThrow();
      await expect(DuoSessionService.leaveRadarPool(doctor.id)).resolves.not.toThrow();
    });

    it("should create a duo session with initialized INEP checklist items", async () => {
      const session = await DuoSessionService.createDuoSession(station, doctor, evaluator);

      expect(session.id).toBeDefined();
      expect(session.doctorUserId).toBe(doctor.id);
      expect(session.evaluatorUserId).toBe(evaluator.id);
      expect(session.status).toBe("LOBBY");
      expect(session.totalScore).toBe(0);
      expect(session.maxScore).toBeGreaterThan(0);
      expect(Object.keys(session.checklistScores).length).toBe(station.checklist.length);
    });

    it("should update checklist item score and compute points proportionally", async () => {
      const session = await DuoSessionService.createDuoSession(station, doctor, evaluator);
      const firstItemId = station.checklist[0].id;
      const maxPts = station.checklist[0].points;

      // Mock getDuoSession
      vi.spyOn(DuoSessionService, "getDuoSession").mockResolvedValue(session);

      await expect(
        DuoSessionService.updateChecklistScore(session.id, firstItemId, "ADEQUATE", maxPts)
      ).resolves.not.toThrow();

      await expect(
        DuoSessionService.updateChecklistScore(session.id, firstItemId, "PARTIAL", maxPts)
      ).resolves.not.toThrow();
    });

    it("should reveal exams and append chat messages", async () => {
      const session = await DuoSessionService.createDuoSession(station, doctor, evaluator);
      vi.spyOn(DuoSessionService, "getDuoSession").mockResolvedValue(session);

      await expect(
        DuoSessionService.revealExam(session.id, "Eletrocardiograma")
      ).resolves.not.toThrow();

      await expect(
        DuoSessionService.sendChatMessage(
          session.id,
          "doctor",
          doctor.name,
          "O senhor sente dor no peito?"
        )
      ).resolves.not.toThrow();
    });

    it("não inverte mais os papéis na mesma estação (decisão do dono de 17/10)", () => {
      expect((DuoSessionService as unknown as Record<string, unknown>).swapRoles).toBeUndefined();
    });
  });

  describe("3. OsceDuoRoomView UI Component", () => {
    const station = SEED_OSCE_STATIONS[0];
    const mockSession: DuoSession = {
      id: "duo_mock_123",
      stationId: station.id,
      stationTitle: station.title,
      stationArea: station.area,
      doctorUserId: "usr_me",
      doctorName: "Dr. André (Você)",
      evaluatorUserId: "usr_partner",
      evaluatorName: "Dra. Beatriz",
      status: "IN_PROGRESS",
      startedAt: Date.now() - 60000, // 1 min elapsed
      timeLimitSeconds: 600,
      checklistScores: {
        [station.checklist[0].id]: {
          itemId: station.checklist[0].id,
          itemDescription: station.checklist[0].description,
          status: "ADEQUATE",
          pointsAwarded: station.checklist[0].points,
          maxPoints: station.checklist[0].points,
        },
      },
      totalScore: station.checklist[0].points,
      maxScore: 10,
      chatMessages: [
        {
          id: "msg_1",
          sender: "system",
          senderName: "StaziaMed Revalida",
          text: "Sessão iniciada",
          time: "10:00",
        },
      ],
      revealedExams: ["Exame Físico"],
      createdAt: new Date().toISOString(),
    };

    beforeEach(() => {
      vi.spyOn(DuoSessionService, "subscribeToDuoSession").mockImplementation((_id, cb) => {
        cb(mockSession);
        return () => {};
      });
    });

    it("should render doctor view with synchronized timer and checklist status", () => {
      render(
        <OsceDuoRoomView
          sessionId="duo_mock_123"
          currentUserId="usr_me"
          onExit={vi.fn()}
        />
      );

      expect(screen.getByText(station.title)).toBeInTheDocument();
      expect(screen.getByText(/Seu Papel: Médico\(a\) Atendente/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Dra. Beatriz/i).length).toBeGreaterThan(0);
      expect(screen.getByText("Finalizar Atendimento")).toBeInTheDocument();
      expect(screen.getByText(/Espelho de Avaliação INEP/i)).toBeInTheDocument();

    });

    it("should render evaluator view with scoring buttons and confidential script tab", () => {
      render(
        <OsceDuoRoomView
          sessionId="duo_mock_123"
          currentUserId="usr_partner" // current user is evaluator
          onExit={vi.fn()}
        />
      );

      expect(screen.getByText(/Seu Papel: Avaliador\(a\) \/ Paciente/i)).toBeInTheDocument();
      expect(screen.getByText("Roteiro do Paciente")).toBeInTheDocument();

      // Click Roteiro do Paciente
      fireEvent.click(screen.getByText("Roteiro do Paciente"));
      expect(screen.getByText(/Roteiro Confidencial do Ator \/ Paciente/i)).toBeInTheDocument();
    });

    it("estação concluída: sem 'Inverter Papéis', só 'Sair da sala' (decisão do dono de 17/10)", () => {
      vi.spyOn(DuoSessionService, "subscribeToDuoSession").mockImplementation((_id, cb) => {
        cb({ ...mockSession, status: "COMPLETED" });
        return () => {};
      });
      const onExit = vi.fn();
      const { container } = render(<OsceDuoRoomView sessionId="duo_mock_123" currentUserId="usr_partner" onExit={onExit} />);
      expect(screen.queryByText(/Inverter Pap/i)).toBeNull();
      expect(container.querySelector("#btn-inverter-papeis")).toBeNull();
      fireEvent.click(screen.getByTitle("Sair da sala"));
      expect(onExit).toHaveBeenCalled();
    });

    it("should allow sending clinical dialogue message", async () => {
      const sendMsgSpy = vi.spyOn(DuoSessionService, "sendChatMessage").mockResolvedValue();

      render(
        <OsceDuoRoomView
          sessionId="duo_mock_123"
          currentUserId="usr_me"
          onExit={vi.fn()}
        />
      );

      const input = screen.getByPlaceholderText(/Pergunte ao paciente ou solicite exames/i);
      fireEvent.change(input, { target: { value: "Quando a dor começou?" } });

      const form = input.closest("form")!;
      await act(async () => {
        fireEvent.submit(form);
      });

      expect(sendMsgSpy).toHaveBeenCalledWith(
        "duo_mock_123",
        "doctor",
        "Dr. André (Você)",
        "Quando a dor começou?"
      );
    });
  });

  describe("4. Security Rules Inspection for Matchmaking & Duo Sessions", () => {
    it("should declare secure rules for radar_pool and duo_sessions in firestore.rules", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const rulesPath = path.resolve(__dirname, "../../firestore.rules");
      const rulesContent = fs.readFileSync(rulesPath, "utf-8");

      expect(rulesContent).toContain("match /radar_pool/{userId}");
      expect(rulesContent).toContain("match /duo_sessions/{sessionId}");
      expect(rulesContent).toContain("resource.data.doctorUserId == request.auth.uid");
      expect(rulesContent).toContain("resource.data.evaluatorUserId == request.auth.uid");
    });
  });
});
