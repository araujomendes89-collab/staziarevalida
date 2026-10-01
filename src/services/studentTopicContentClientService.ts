/**
 * Student Topic Content Client Service (Etapa 1.28F).
 * Fetches published topic headers and immutable snapshots for student consumption.
 * Strictly guarantees fail-closed handling and honest NOT_PUBLISHED states.
 */

import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  PublishedTopicHeader,
  PublishedTopicContentVersion,
} from "../types/publishedContent";

export interface StudentTopicContentResult {
  status: "LOADING" | "READY" | "NOT_PUBLISHED" | "ERROR";
  header?: PublishedTopicHeader;
  version?: PublishedTopicContentVersion;
  error?: string;
}

export class StudentTopicContentClientService {
  /**
   * Fetches the current published version for a specific canonical topic.
   */
  static async getPublishedTopic(
    canonicalTopicId: string
  ): Promise<StudentTopicContentResult> {
    try {
      if (!canonicalTopicId) {
        return { status: "NOT_PUBLISHED" };
      }

      // 1. Fetch parent header / pointer document
      const headerRef = doc(db, "publishedTopicContents", canonicalTopicId);
      const headerSnap = await getDoc(headerRef);

      if (!headerSnap.exists()) {
        return { status: "NOT_PUBLISHED" };
      }

      const header = headerSnap.data() as PublishedTopicHeader;
      if (header.publicationStatus !== "PUBLISHED" || !header.currentVersionId) {
        return { status: "NOT_PUBLISHED", header };
      }

      // 2. Fetch the immutable snapshot pointed by currentVersionId
      const versionRef = doc(
        db,
        "publishedTopicContents",
        canonicalTopicId,
        "versions",
        header.currentVersionId
      );
      const versionSnap = await getDoc(versionRef);

      if (!versionSnap.exists()) {
        return {
          status: "ERROR",
          header,
          error: `Versão publicada '${header.currentVersionId}' não encontrada.`,
        };
      }

      const version = versionSnap.data() as PublishedTopicContentVersion;

      return {
        status: "READY",
        header,
        version,
      };
    } catch (err: any) {
      console.error("[StudentTopicContentClientService] Error fetching published topic:", err);
      return {
        status: "ERROR",
        error: err?.message || "Não foi possível carregar o conteúdo publicado deste tema.",
      };
    }
  }

  /**
   * Fetches all published topic headers for the Grandes Temas catalog.
   */
  static async getAllPublishedTopicHeaders(): Promise<Map<string, PublishedTopicHeader>> {
    const map = new Map<string, PublishedTopicHeader>();
    try {
      const colRef = collection(db, "publishedTopicContents");
      const snap = await getDocs(colRef);
      snap.docs.forEach((d) => {
        const data = d.data() as PublishedTopicHeader;
        if (data && data.canonicalTopicId) {
          map.set(data.canonicalTopicId, data);
        }
      });
    } catch (err) {
      console.warn("[StudentTopicContentClientService] Error fetching published catalog:", err);
    }
    return map;
  }
}
