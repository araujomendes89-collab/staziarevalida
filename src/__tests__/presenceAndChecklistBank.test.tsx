import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PresenceService, DEFAULT_PRESENCE_SETTINGS } from "../services/presenceService";
import { ChecklistBankHubView } from "../components/osce/ChecklistBankHubView";
import { pathToTab } from "../services/routeMapping";

describe("Presença Online, Busca no Radar e Banco de Checklists (Medstudier Style)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("1. PresenceService Core", () => {
    it("should return default settings when nothing is stored", () => {
      const settings = PresenceService.getSettings();
      expect(settings).toEqual(DEFAULT_PRESENCE_SETTINGS);
      expect(settings.isOnline).toBe(false);
      expect(settings.radarActive).toBe(false);
      expect(settings.allowInvites).toBe(true);
    });

    it("should persist and update presence settings (online / offline / radar)", () => {
      const updated = PresenceService.saveSettings({ isOnline: true, radarActive: true });
      expect(updated.isOnline).toBe(true);
      expect(updated.radarActive).toBe(true);

      const loaded = PresenceService.getSettings();
      expect(loaded.isOnline).toBe(true);
      expect(loaded.radarActive).toBe(true);
    });

    it("should filter users by category (COLLEAGUES, PAID_ACTORS, OPEN_ROOMS)", () => {
      const colleagues = PresenceService.getUsers("COLLEAGUES");
      expect(colleagues.length).toBeGreaterThan(0);
      expect(colleagues.every((u) => u.category === "COLLEAGUES")).toBe(true);

      const actors = PresenceService.getUsers("PAID_ACTORS");
      expect(actors.length).toBeGreaterThan(0);
      expect(actors.every((u) => u.category === "PAID_ACTORS")).toBe(true);

      const rooms = PresenceService.getUsers("OPEN_ROOMS");
      expect(rooms.length).toBeGreaterThan(0);
      expect(rooms.every((u) => u.category === "OPEN_ROOMS")).toBe(true);
    });

    it("should search users by name or university", () => {
      const searchResult = PresenceService.getUsers("COLLEAGUES", "Danielle");
      expect(searchResult.length).toBe(1);
      expect(searchResult[0].name).toContain("Danielle");

      const emptyResult = PresenceService.getUsers("COLLEAGUES", "InexistenteXyz");
      expect(emptyResult.length).toBe(0);
    });

    it("should send and store study invites", () => {
      const invite = PresenceService.sendInvite({
        fromUserId: "usr-1",
        fromUserName: "Dr. João",
        toUserId: "usr_colleague_1",
        toUserName: "Danielledpf Dra",
        stationId: "station-apendicite",
        stationTitle: "Apendicite Aguda",
      });

      expect(invite.id).toBeDefined();
      expect(invite.status).toBe("PENDING");

      const sent = PresenceService.getSentInvites();
      expect(sent.length).toBe(1);
      expect(sent[0].toUserName).toBe("Danielledpf Dra");
    });
  });

  describe("2. ChecklistBankHubView Component UI & Interactions", () => {
    it("should render main header with action buttons and WhatsApp community banner", () => {
      render(
        <ChecklistBankHubView
          onStartManualStudy={vi.fn()}
          onStartAiStudy={vi.fn()}
          onSelectStation={vi.fn()}
        />
      );

      expect(screen.getByText("Novo estudo")).toBeInTheDocument();
      expect(screen.getByText(/Conecte-se com um parceiro/i)).toBeInTheDocument();
      expect(screen.getByText("Iniciar estudo")).toBeInTheDocument();
      expect(screen.getByText("Estudar com IA")).toBeInTheDocument();
      expect(screen.getByText("Encontre duplas no WhatsApp")).toBeInTheDocument();
      expect(screen.getByText("Entrar no Grupo")).toBeInTheDocument();
    });

    it("should render the radar section and toggle between invisible and visible status", () => {
      render(
        <ChecklistBankHubView
          onStartManualStudy={vi.fn()}
          onStartAiStudy={vi.fn()}
          onSelectStation={vi.fn()}
        />
      );

      // Default state: invisible
      expect(screen.getByText("Você está invisível no radar")).toBeInTheDocument();
      expect(screen.getByText("Ativar busca de duplas")).toBeInTheDocument();

      // Click button inside radar to activate
      const activateBtn = screen.getByText("Ativar busca de duplas");
      fireEvent.click(activateBtn);

      // Now should be visible in radar
      expect(screen.getByText("Você está visível no radar")).toBeInTheDocument();
      expect(screen.getByText("Pausar busca de duplas")).toBeInTheDocument();
    });

    it("should render the online users list and support category tab switching", () => {
      render(
        <ChecklistBankHubView
          onStartManualStudy={vi.fn()}
          onStartAiStudy={vi.fn()}
          onSelectStation={vi.fn()}
        />
      );

      expect(screen.getByText("Colegas")).toBeInTheDocument();
      expect(screen.getByText("Atores pagos")).toBeInTheDocument();
      expect(screen.getByText("Salas abertas")).toBeInTheDocument();

      // Colleagues by default
      expect(screen.getByText("Danielledpf Dra")).toBeInTheDocument();

      // Switch to Atores pagos
      fireEvent.click(screen.getByText("Atores pagos"));
      expect(screen.getByText("Dra. Carolina Mendes (Atriz OSCE)")).toBeInTheDocument();

      // Switch to Salas abertas
      fireEvent.click(screen.getByText("Salas abertas"));
      expect(screen.getByText("Sala Cirurgia · Apendicite Aguda")).toBeInTheDocument();
    });

    it("should open invite modal, pick station, and trigger invite with visual feedback", () => {
      render(
        <ChecklistBankHubView
          onStartManualStudy={vi.fn()}
          onStartAiStudy={vi.fn()}
          onSelectStation={vi.fn()}
        />
      );

      // Find first Convidar button
      const inviteButtons = screen.getAllByText("Convidar");
      expect(inviteButtons.length).toBeGreaterThan(0);

      fireEvent.click(inviteButtons[0]);

      // Invite modal should open
      expect(screen.getByText("Convidar para Treino de Estação")).toBeInTheDocument();
      expect(screen.getByText("Enviar Convite")).toBeInTheDocument();

      // Click Enviar Convite
      fireEvent.click(screen.getByText("Enviar Convite"));

      // Modal closes, button transforms to "Convidado"
      expect(screen.queryByText("Convidar para Treino de Estação")).not.toBeInTheDocument();
      expect(screen.getByText("Convidado")).toBeInTheDocument();
    });

    it("should toggle allow invites preference", () => {
      render(
        <ChecklistBankHubView
          onStartManualStudy={vi.fn()}
          onStartAiStudy={vi.fn()}
          onSelectStation={vi.fn()}
        />
      );

      const inviteToggle = screen.getByTestId ? screen.getByLabelText("Permitir convites de duplas") : screen.getByText("Permitir convites");
      fireEvent.click(inviteToggle);

      expect(PresenceService.getSettings().allowInvites).toBe(false);
    });

    it("should render incoming invite modal when an invite arrives and navigate on accept", async () => {
      let incomingCallback: ((invite: any) => void) | null = null;
      vi.spyOn(PresenceService, "subscribeToIncomingInvites").mockImplementation((_userId, cb) => {
        incomingCallback = cb;
        return () => {};
      });

      const onSelectStationMock = vi.fn();

      render(
        <ChecklistBankHubView
          onStartManualStudy={vi.fn()}
          onStartAiStudy={vi.fn()}
          onSelectStation={onSelectStationMock}
        />
      );

      expect(incomingCallback).not.toBeNull();

      // Simulate incoming invite
      const mockInvite = {
        id: "inv_test_123",
        fromUserId: "usr_partner",
        fromUserName: "Dr. Roberto Parceiro",
        toUserId: "usr-me",
        toUserName: "Dr. Candidato",
        stationId: "osce_cm_01",
        stationTitle: "Dor Torácica e Infarto Agudo",
        status: "PENDING" as const,
        createdAt: new Date().toISOString(),
      };

      act(() => {
        if (incomingCallback) {
          (incomingCallback as any)(mockInvite);
        }
      });


      // Incoming modal should be visible
      expect(screen.getByText("Convite de Estudo Recebido!")).toBeInTheDocument();
      expect(screen.getByText("Dr. Roberto Parceiro")).toBeInTheDocument();
      expect(screen.getByText("Dor Torácica e Infarto Agudo")).toBeInTheDocument();
      expect(screen.getByText("Aceitar e Iniciar Treino")).toBeInTheDocument();
      expect(screen.getByText("Recusar")).toBeInTheDocument();

      // Click Aceitar
      const acceptBtn = screen.getByText("Aceitar e Iniciar Treino");
      await act(async () => {
        fireEvent.click(acceptBtn);
      });


      expect(onSelectStationMock).toHaveBeenCalled();
      expect(screen.queryByText("Convite de Estudo Recebido!")).not.toBeInTheDocument();
    });
  });

  describe("3. Real-time Service Methods & Firestore Sync", () => {
    it("should publish presence and manage heartbeat lifecycle", async () => {
      const user = { id: "usr_test_doctor", name: "Dra. Teste" };
      const settings = {
        isOnline: true,
        radarActive: true,
        allowInvites: true,
        activeCategory: "COLLEAGUES" as const,
      };

      await expect(PresenceService.publishPresence(user, settings)).resolves.not.toThrow();

      const cleanup = PresenceService.setupHeartbeat(user, () => settings);
      expect(typeof cleanup).toBe("function");
      cleanup();
    });

    it("should respond to invite and transition status to ACCEPTED or DECLINED", async () => {
      const invite = PresenceService.sendInvite({
        fromUserId: "usr_a",
        fromUserName: "Dr. A",
        toUserId: "usr_b",
        toUserName: "Dr. B",
        stationId: "station_1",
        stationTitle: "Estação 1",
      });

      expect(invite.status).toBe("PENDING");

      await PresenceService.respondToInvite(invite.id, "ACCEPTED");
      const sent = PresenceService.getSentInvites();
      const target = sent.find((i) => i.id === invite.id);
      expect(target?.status).toBe("ACCEPTED");

      await PresenceService.respondToInvite(invite.id, "DECLINED");
      const sentDeclined = PresenceService.getSentInvites();
      const targetDeclined = sentDeclined.find((i) => i.id === invite.id);
      expect(targetDeclined?.status).toBe("DECLINED");
    });

    it("should subscribe to active users and emit colleagues list", () => {
      const onUpdate = vi.fn();
      const unsub = PresenceService.subscribeToActiveUsers("COLLEAGUES", "", onUpdate);

      expect(onUpdate).toHaveBeenCalled();
      const emittedUsers = onUpdate.mock.calls[0][0];
      expect(emittedUsers.length).toBeGreaterThan(0);
      expect(typeof unsub).toBe("function");
      unsub();
    });
  });

  describe("4. Route Resolution for Checklist Bank", () => {
    it("should resolve canonical and alias routes for checklist bank to praticar-checklists tab", () => {
      expect(pathToTab("/osce")).toBe("praticar-checklists");
      expect(pathToTab("/praticar/checklists")).toBe("praticar-checklists");
      expect(pathToTab("/checklist-bank")).toBe("praticar-checklists");
      expect(pathToTab("/app/checklist-bank")).toBe("praticar-checklists");
      expect(pathToTab("/checklists")).toBe("praticar-checklists");
      expect(pathToTab("/estacoes")).toBe("praticar-checklists");
    });
  });

  describe("5. Firestore Security Rules Inspection", () => {
    it("should have valid rule definitions for /presence and /study_invites in firestore.rules", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const rulesPath = path.resolve(__dirname, "../../firestore.rules");
      const rulesContent = fs.readFileSync(rulesPath, "utf-8");

      expect(rulesContent).toContain("match /presence/{userId}");
      expect(rulesContent).toContain("match /study_invites/{inviteId}");
      expect(rulesContent).toContain("allow read: if isAuthenticated();");
      expect(rulesContent).toContain("request.auth.uid == userId");
    });
  });
});

