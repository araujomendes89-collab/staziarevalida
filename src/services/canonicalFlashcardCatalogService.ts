import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit as firestoreLimit,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { CanonicalFlashcardContent } from "../types/canonicalFlashcard";
import { MedicalArea } from "../types";
import { parseCanonicalFlashcard } from "./canonicalFlashcardValidator";

export const CANONICAL_FLASHCARDS_COLLECTION = "flashcardContents";

export class CanonicalFlashcardCatalogService {
  /**
   * Retrieves a single canonical flashcard by ID if and only if its status is PUBLISHED.
   */
  static async getPublishedFlashcardById(
    contentId: string
  ): Promise<CanonicalFlashcardContent | null> {
    if (!contentId || typeof contentId !== "string" || !contentId.trim()) {
      return null;
    }

    try {
      const docRef = doc(db, CANONICAL_FLASHCARDS_COLLECTION, contentId.trim());
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        return null;
      }

      const data = snap.data();
      if (data.publicationStatus !== "PUBLISHED") {
        return null;
      }

      return parseCanonicalFlashcard(data, snap.id);
    } catch (error) {
      console.error(`[CanonicalCatalogService] Failed to read flashcard ${contentId}:`, error);
      return null;
    }
  }

  /**
   * Retrieves all published canonical flashcards for a specific canonical topic.
   */
  static async getPublishedFlashcardsByTopic(
    canonicalTopicId: string
  ): Promise<CanonicalFlashcardContent[]> {
    if (!canonicalTopicId || typeof canonicalTopicId !== "string") {
      return [];
    }

    try {
      const collRef = collection(db, CANONICAL_FLASHCARDS_COLLECTION);
      const q = query(
        collRef,
        where("publicationStatus", "==", "PUBLISHED"),
        where("canonicalTopicId", "==", canonicalTopicId.trim())
      );

      const snapshot = await getDocs(q);
      const results: CanonicalFlashcardContent[] = [];

      snapshot.forEach((docSnap) => {
        const item = parseCanonicalFlashcard(docSnap.data(), docSnap.id);
        if (item && item.publicationStatus === "PUBLISHED") {
          results.push(item);
        }
      });

      return results;
    } catch (error) {
      console.error(
        `[CanonicalCatalogService] Failed to query by topic ${canonicalTopicId}:`,
        error
      );
      return [];
    }
  }

  /**
   * Retrieves all published canonical flashcards for a specific medical area.
   */
  static async getPublishedFlashcardsByArea(
    area: MedicalArea
  ): Promise<CanonicalFlashcardContent[]> {
    if (!area) {
      return [];
    }

    try {
      const collRef = collection(db, CANONICAL_FLASHCARDS_COLLECTION);
      const q = query(
        collRef,
        where("publicationStatus", "==", "PUBLISHED"),
        where("area", "==", area)
      );

      const snapshot = await getDocs(q);
      const results: CanonicalFlashcardContent[] = [];

      snapshot.forEach((docSnap) => {
        const item = parseCanonicalFlashcard(docSnap.data(), docSnap.id);
        if (item && item.publicationStatus === "PUBLISHED") {
          results.push(item);
        }
      });

      return results;
    } catch (error) {
      console.error(`[CanonicalCatalogService] Failed to query by area ${area}:`, error);
      return [];
    }
  }

  /**
   * Retrieves published canonical flashcards with optional limit.
   */
  static async getPublishedFlashcards(
    maxResults: number = 50
  ): Promise<CanonicalFlashcardContent[]> {
    try {
      const collRef = collection(db, CANONICAL_FLASHCARDS_COLLECTION);
      const q = query(
        collRef,
        where("publicationStatus", "==", "PUBLISHED"),
        firestoreLimit(maxResults)
      );

      const snapshot = await getDocs(q);
      const results: CanonicalFlashcardContent[] = [];

      snapshot.forEach((docSnap) => {
        const item = parseCanonicalFlashcard(docSnap.data(), docSnap.id);
        if (item && item.publicationStatus === "PUBLISHED") {
          results.push(item);
        }
      });

      return results;
    } catch (error) {
      console.error("[CanonicalCatalogService] Failed to query published flashcards:", error);
      return [];
    }
  }
}
