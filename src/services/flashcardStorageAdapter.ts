import {
  Flashcard,
  FlashcardContent,
  UserFlashcardState,
  FlashcardStorageEnvelopeV4,
} from "../types";
import { FlashcardProvenanceService } from "./flashcardProvenanceService";

export class FlashcardStorageAdapter {
  /**
   * Compatibility Adapter (View Model Hydrator):
   * Reconstitutes an in-memory Flashcard compatible with existing views and consumers
   * from decoupled FlashcardContent and UserFlashcardState records.
   */
  static hydrateFlashcardItem(
    content: FlashcardContent,
    state: UserFlashcardState
  ): Flashcard {
    const stability = state.stability ?? 0;
    const reps = state.reps ?? state.repetitionCount ?? 0;
    const lapses = state.lapses ?? 0;

    // Preserve persisted mastery level or compute derived indicator
    const masteryLevel =
      state.masteryLevel ??
      (reps === 0
        ? 25
        : Math.min(
            100,
            Math.max(
              10,
              Math.round(
                stability >= 30
                  ? 85 + Math.min(15, stability / 10)
                  : stability >= 14
                  ? 70 + ((stability - 14) / 16) * 15
                  : stability >= 3
                  ? 40 + ((stability - 3) / 11) * 30
                  : 20 + stability * 6.6
              )
            )
          ));

    return {
      id: content.localBridgeId,
      canonicalTopicId: content.canonicalTopicId,
      area: content.area,
      topic: content.topic,
      front: content.front,
      back: content.back,
      keyMnemonic: content.keyMnemonic,

      // Content Identity & Provenance
      provenance: content.provenance,
      contentFingerprint: content.contentFingerprint,
      contentFingerprintVersion: content.contentFingerprintVersion,
      contentVersion: content.contentVersion,

      // User FSRS State Fields
      schedulerVersion: state.schedulerVersion,
      stability: state.stability,
      difficulty: state.difficulty,
      elapsedDays: state.elapsedDays,
      scheduledDays: state.scheduledDays,
      reps: state.reps,
      lapses: state.lapses,
      state: state.state,
      lastReviewed: state.lastReviewed,
      dueDate: state.dueDate,

      // Legacy Compatibility Fields
      intervalDays: state.intervalDays ?? Math.max(1, state.scheduledDays ?? 1),
      easeFactor: state.easeFactor ?? 2.5,
      repetitionCount: state.reps ?? state.repetitionCount ?? 0,
      masteryLevel,
    };
  }

  /**
   * Deconstructs a monolithic Flashcard into decoupled Content and UserState records
   */
  static deconstructFlashcardItem(
    card: Flashcard,
    userId: string = "user_default"
  ): { content: FlashcardContent; userState: UserFlashcardState } {
    const localBridgeId = card.id;
    const nowIso = new Date().toISOString();

    const contentFingerprint =
      card.contentFingerprint ||
      FlashcardProvenanceService.createFlashcardContentFingerprint(
        card.front,
        card.back,
        card.keyMnemonic
      );

    const provenance =
      card.provenance ||
      FlashcardProvenanceService.createLegacyProvenance("LEGACY_LOCAL");

    const content: FlashcardContent = {
      localBridgeId,
      canonicalTopicId: card.canonicalTopicId,
      area: card.area,
      topic: card.topic,
      front: card.front,
      back: card.back,
      keyMnemonic: card.keyMnemonic,
      provenance,
      contentFingerprint,
      contentFingerprintVersion: card.contentFingerprintVersion ?? FlashcardProvenanceService.CONTENT_FINGERPRINT_VERSION,
      contentVersion: card.contentVersion ?? FlashcardProvenanceService.CONTENT_VERSION,
      createdAt: provenance.createdAt || nowIso,
      updatedAt: nowIso,
    };

    const userState: UserFlashcardState = {
      localBridgeId,
      userId,
      schedulerVersion: card.schedulerVersion || "FSRS_V1",
      stability: card.stability ?? (card.reps && card.reps > 0 ? 2.0 : 0),
      difficulty: card.difficulty ?? 5.0,
      elapsedDays: card.elapsedDays ?? 0,
      scheduledDays: card.scheduledDays ?? card.intervalDays ?? 1,
      reps: card.reps ?? card.repetitionCount ?? 0,
      lapses: card.lapses ?? 0,
      state: card.state ?? ((card.reps ?? 0) > 0 ? 2 : 0),
      lastReviewed: card.lastReviewed,
      dueDate: card.dueDate || nowIso,
      intervalDays: card.intervalDays ?? 1,
      easeFactor: card.easeFactor ?? 2.5,
      repetitionCount: card.repetitionCount ?? card.reps ?? 0,
      masteryLevel: card.masteryLevel,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    return { content, userState };
  }

  /**
   * Deterministic, idempotent conversion of a V3 Flashcard array into a V4 Envelope
   */
  static migrateV3CardsToV4Envelope(
    v3Cards: Flashcard[],
    userId: string = "user_default"
  ): FlashcardStorageEnvelopeV4 {
    const contents: Record<string, FlashcardContent> = {};
    const userStates: Record<string, UserFlashcardState> = {};

    for (const card of v3Cards) {
      if (!card || !card.id) continue;
      const { content, userState } = this.deconstructFlashcardItem(card, userId);
      contents[card.id] = content;
      userStates[card.id] = userState;
    }

    return {
      schemaVersion: 4,
      updatedAt: new Date().toISOString(),
      contents,
      userStates,
    };
  }

  /**
   * Validates if a parsed object complies with the FlashcardStorageEnvelopeV4 schema
   */
  static validateV4Envelope(envelope: any): envelope is FlashcardStorageEnvelopeV4 {
    if (!envelope || typeof envelope !== "object") return false;
    if (envelope.schemaVersion !== 4) return false;
    if (!envelope.contents || typeof envelope.contents !== "object") return false;
    if (!envelope.userStates || typeof envelope.userStates !== "object") return false;
    return true;
  }
}
