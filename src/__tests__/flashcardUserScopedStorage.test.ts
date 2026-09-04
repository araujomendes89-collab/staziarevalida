import { describe, it, expect, beforeEach } from "vitest";
import {
  StorageService,
  getFlashcardStorageKey,
  getOrGenerateGuestId,
  FlashcardStorageScope,
} from "../services/storageService";
import { Flashcard } from "../types";
import { FSRS_CONFIG } from "../config/spacedRepetition";

describe("User-Scoped Flashcard Local Storage (Etapa 1.22B)", () => {
  const sampleCardA: Flashcard = {
    id: "card-user-a-1",
    area: "CLINICA_MEDICA",
    topic: "Cardiologia",
    front: "Critérios de Duke para Endocardite",
    back: "Critérios maiores: Hemoculturas positivas e Ecocardiograma positivo.",
    schedulerVersion: FSRS_CONFIG.schedulerVersion,
    stability: 4.2,
    difficulty: 4.8,
    dueDate: "2026-09-04T12:00:00.000Z",
    reps: 2,
    lapses: 0,
    state: 2,
    intervalDays: 4,
    easeFactor: 2.5,
    repetitionCount: 2,
    masteryLevel: 60,
  };

  const sampleCardB: Flashcard = {
    id: "card-user-b-1",
    area: "CIRURGIA_GERAL",
    topic: "Trauma",
    front: "Indicação de Toracotomia no Trauma",
    back: "Drenagem imediata > 1500 mL ou > 200 mL/h por 2-4 horas.",
    schedulerVersion: FSRS_CONFIG.schedulerVersion,
    stability: 8.5,
    difficulty: 3.5,
    dueDate: "2026-09-10T12:00:00.000Z",
    reps: 4,
    lapses: 0,
    state: 2,
    intervalDays: 8,
    easeFactor: 2.5,
    repetitionCount: 4,
    masteryLevel: 85,
  };

  const sampleGuestCard: Flashcard = {
    id: "card-guest-1",
    area: "PEDIATRIA",
    topic: "Neonatologia",
    front: "Triagem neonatal: Teste do Pezinho",
    back: "Realizado idealmente entre o 3º e o 5º dia de vida.",
    schedulerVersion: FSRS_CONFIG.schedulerVersion,
    stability: 1.0,
    difficulty: 5.0,
    dueDate: "2026-09-03T12:00:00.000Z",
    reps: 1,
    lapses: 0,
    state: 1,
    intervalDays: 1,
    easeFactor: 2.5,
    repetitionCount: 1,
    masteryLevel: 25,
  };

  beforeEach(() => {
    localStorage.clear();
  });

  describe("Storage Key Namespacing", () => {
    it("should generate namespaced key for authenticated users", () => {
      const scope: FlashcardStorageScope = { userId: "user-123", isGuest: false };
      const key = getFlashcardStorageKey(scope);
      expect(key).toBe("praxis_flashcards_v4:user:user-123");
    });

    it("should generate namespaced key for guests with a stable guest ID", () => {
      const scope: FlashcardStorageScope = { userId: null, isGuest: true };
      const key1 = getFlashcardStorageKey(scope);
      expect(key1).toMatch(/^praxis_flashcards_v4:guest:guest_[a-z0-9]+$/);

      const key2 = getFlashcardStorageKey(scope);
      expect(key2).toBe(key1);
    });

    it("should accept string userId directly", () => {
      const key = getFlashcardStorageKey("user-456");
      expect(key).toBe("praxis_flashcards_v4:user:user-456");
    });
  });

  describe("Cross-Account Local Isolation", () => {
    it("should isolate User A flashcards from User B on the same browser profile", () => {
      const scopeUserA: FlashcardStorageScope = { userId: "user-alpha", isGuest: false };
      const scopeUserB: FlashcardStorageScope = { userId: "user-beta", isGuest: false };

      // User A saves cards
      StorageService.saveFlashcards([sampleCardA], scopeUserA);

      // User B initially has 0 cards
      const userBCardsInitial = StorageService.getFlashcards(scopeUserB);
      expect(userBCardsInitial).toEqual([]);

      // User B saves different cards
      StorageService.saveFlashcards([sampleCardB], scopeUserB);

      // Verify User A still only sees Card A
      const userACards = StorageService.getFlashcards(scopeUserA);
      expect(userACards).toHaveLength(1);
      expect(userACards[0].id).toBe("card-user-a-1");
      expect(userACards[0].topic).toBe("Cardiologia");

      // Verify User B still only sees Card B
      const userBCards = StorageService.getFlashcards(scopeUserB);
      expect(userBCards).toHaveLength(1);
      expect(userBCards[0].id).toBe("card-user-b-1");
      expect(userBCards[0].topic).toBe("Trauma");
    });

    it("should isolate Guest cards from Authenticated user cards", () => {
      const guestScope: FlashcardStorageScope = { userId: null, isGuest: true };
      const authScope: FlashcardStorageScope = { userId: "user-gamma", isGuest: false };

      // Guest studies and accumulates cards
      StorageService.saveFlashcards([sampleGuestCard], guestScope);

      // Authenticated user logs in: should not have guest cards automatically
      const authCards = StorageService.getFlashcards(authScope);
      expect(authCards).toEqual([]);

      // Authenticated user saves own card
      StorageService.saveFlashcards([sampleCardA], authScope);

      // Guest cards remain unchanged and separated
      const retrievedGuestCards = StorageService.getFlashcards(guestScope);
      expect(retrievedGuestCards).toHaveLength(1);
      expect(retrievedGuestCards[0].id).toBe("card-guest-1");

      const retrievedAuthCards = StorageService.getFlashcards(authScope);
      expect(retrievedAuthCards).toHaveLength(1);
      expect(retrievedAuthCards[0].id).toBe("card-user-a-1");
    });

    it("should preserve cards and FSRS states across login, logout, and relogin", () => {
      const userScope: FlashcardStorageScope = { userId: "user-delta", isGuest: false };

      // User Delta saves cards with customized FSRS metrics
      StorageService.saveFlashcards([sampleCardA, sampleCardB], userScope);

      // Simulate logout: in-memory state cleared, queried as guest
      const guestCards = StorageService.getFlashcards({ userId: null, isGuest: true });
      expect(guestCards).toEqual([]);

      // User Delta relogins
      const restoredCards = StorageService.getFlashcards(userScope);
      expect(restoredCards).toHaveLength(2);
      expect(restoredCards[0].id).toBe("card-user-a-1");
      expect(restoredCards[0].stability).toBe(4.2);
      expect(restoredCards[1].id).toBe("card-user-b-1");
      expect(restoredCards[1].stability).toBe(8.5);
    });
  });

  describe("Legacy Unscoped Flashcard (v2) Quarantine & Consent Import", () => {
    it("should not automatically load legacy praxis_flashcards_v2 into any user account", () => {
      // Plant legacy data
      localStorage.setItem("praxis_flashcards_v2", JSON.stringify([sampleCardA]));

      const userScope: FlashcardStorageScope = { userId: "user-epsilon", isGuest: false };

      // Regular getFlashcards must return empty (quarantined)
      const cards = StorageService.getFlashcards(userScope);
      expect(cards).toEqual([]);

      // Detection flags
      expect(StorageService.hasLegacyFlashcards()).toBe(true);
      expect(StorageService.getLegacyFlashcardsCount()).toBe(1);
      expect(StorageService.hasDismissedLegacyRecovery(userScope)).toBe(false);
    });

    it("should import legacy flashcards to the active scope only upon explicit user consent", () => {
      localStorage.setItem("praxis_flashcards_v2", JSON.stringify([sampleCardA]));

      const userScope: FlashcardStorageScope = { userId: "user-zeta", isGuest: false };

      // Explicit import triggered by user
      const imported = StorageService.importLegacyFlashcards(userScope);
      expect(imported).toHaveLength(1);
      expect(imported[0].id).toBe("card-user-a-1");

      // Verify scope now has the cards
      const loaded = StorageService.getFlashcards(userScope);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe("card-user-a-1");

      // Verify technical backup was created
      expect(localStorage.getItem("praxis_flashcards_v2_migrated_backup")).not.toBeNull();

      // Verify recovery banner is dismissed for this scope
      expect(StorageService.hasDismissedLegacyRecovery(userScope)).toBe(true);
    });

    it("should allow dismissing legacy recovery without importing", () => {
      localStorage.setItem("praxis_flashcards_v2", JSON.stringify([sampleCardA]));

      const userScope: FlashcardStorageScope = { userId: "user-eta", isGuest: false };

      StorageService.dismissLegacyRecovery(userScope);
      expect(StorageService.hasDismissedLegacyRecovery(userScope)).toBe(true);

      // Flashcards remain empty for this user
      expect(StorageService.getFlashcards(userScope)).toEqual([]);
      // Legacy storage remains intact in quarantine
      expect(StorageService.hasLegacyFlashcards()).toBe(true);
    });
  });

  describe("Downstream Consumer Integration (Today's Plan & Calendar)", () => {
    it("should compute due cards and future schedules strictly for the active scoped user", () => {
      const scopeUserA: FlashcardStorageScope = { userId: "user-plan-a", isGuest: false };
      const scopeUserB: FlashcardStorageScope = { userId: "user-plan-b", isGuest: false };

      const overdueCardUserA: Flashcard = {
        ...sampleCardA,
        id: "fc-due-a",
        dueDate: "2026-09-02T12:00:00.000Z",
      };

      const futureCardUserB: Flashcard = {
        ...sampleCardB,
        id: "fc-future-b",
        dueDate: "2026-09-15T12:00:00.000Z",
      };

      StorageService.saveFlashcards([overdueCardUserA], scopeUserA);
      StorageService.saveFlashcards([futureCardUserB], scopeUserB);

      const userACards = StorageService.getFlashcards(scopeUserA);
      const userBCards = StorageService.getFlashcards(scopeUserB);

      const fixedNow = new Date("2026-09-03T12:00:00.000Z");

      // User A has 1 due card today
      expect(userACards).toHaveLength(1);
      // User B has 0 due cards today
      expect(userBCards).toHaveLength(1);
      expect(userBCards[0].id).toBe("fc-future-b");
    });
  });
});
