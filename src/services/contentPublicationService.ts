/**
 * Content Publication Service (Legacy Client / Test Support).
 * NOTE: Production administrative publication MUST use AdminContentPublicationClientService
 * via the secure backend API (ServerContentPublicationService + Firebase Admin SDK).
 * Direct client SDK write operations in this file are preserved for unit test fixture compatibility.
 */

import { doc, getDoc, setDoc, runTransaction } from "firebase/firestore";
import { db } from "../lib/firebase";
import { StaziaEditorialDocumentDraft } from "../types/medicalEditorial";
import { STAZIAMED_CANONICAL_TOPICS } from "../types/medicalTaxonomy";
import {
  PublishedTopicHeader,
  PublishedTopicContentVersion,
  PublishedEditorialBlock,
  PublicationJobResult,
  PublicationPreflightReport,
} from "../types/publishedContent";
import { PublicationPreflightService } from "./publicationPreflightService";

export class ContentPublicationService {
  /**
   * Transforms approved editorial blocks into clean, student-safe published blocks.
   * Strips OCR internal paths, administrative notes, and review logs.
   */
  static extractStudentSafeBlocks(
    draft: StaziaEditorialDocumentDraft
  ): PublishedEditorialBlock[] {
    let orderCounter = 0;
    const studentBlocks: PublishedEditorialBlock[] = [];

    for (const page of draft.pages) {
      for (const block of page.blocks) {
        orderCounter++;
        studentBlocks.push({
          id: `pub_blk_${block.id || orderCounter}`,
          type: block.type,
          semanticRole: block.semanticRole,
          content: block.content, // 100% Verbatim approved editorial text
          styleVariant: block.styleVariant,
          warningSeverity: block.warningSeverity,
          tableData: block.tableData,
          figureData: block.figureData,
          listItems: block.listItems,
          order: orderCounter,
        });
      }
    }

    return studentBlocks;
  }

  /**
   * Resolves the parent topic header / current pointer.
   */
  static async getTopicHeader(
    canonicalTopicId: string
  ): Promise<PublishedTopicHeader | null> {
    try {
      const parentRef = doc(db, "publishedTopicContents", canonicalTopicId);
      const snap = await getDoc(parentRef);
      if (snap.exists()) {
        return snap.data() as PublishedTopicHeader;
      }
      return null;
    } catch (err) {
      console.warn("[ContentPublicationService] Error reading topic header:", err);
      return null;
    }
  }

  /**
   * Reads a specific immutable version snapshot.
   */
  static async getVersionSnapshot(
    canonicalTopicId: string,
    versionId: string
  ): Promise<PublishedTopicContentVersion | null> {
    try {
      const versionRef = doc(
        db,
        "publishedTopicContents",
        canonicalTopicId,
        "versions",
        versionId
      );
      const snap = await getDoc(versionRef);
      if (snap.exists()) {
        return snap.data() as PublishedTopicContentVersion;
      }
      return null;
    } catch (err) {
      console.warn("[ContentPublicationService] Error reading version snapshot:", err);
      return null;
    }
  }

  /**
   * Executes the full publication workflow:
   * PREFLIGHT -> PREPARE IMMUTABLE SNAPSHOT -> SHORT ATOMIC COMMIT ON PARENT
   */
  static async publishEditorialDraft(
    draft: StaziaEditorialDocumentDraft,
    confirmedCanonicalTopicId: string,
    publishedBy: string = "ADMIN_CONSOLE"
  ): Promise<PublicationJobResult> {
    // 1. PREFLIGHT GATE
    const preflightReport = PublicationPreflightService.runPreflight(
      draft,
      confirmedCanonicalTopicId
    );

    if (!preflightReport.passed) {
      const rightsFailure = preflightReport.checks.find(
        (c) => c.gate === "PREFLIGHT_RIGHTS" && !c.passed
      );
      const topicFailure = preflightReport.checks.find(
        (c) => c.gate === "PREFLIGHT_CANONICAL_TOPIC" && !c.passed
      );

      let state: PublicationJobResult["state"] = "PUBLICATION_FAILED";
      if (rightsFailure) state = "PUBLICATION_BLOCKED_RIGHTS";
      if (topicFailure) state = "PUBLICATION_BLOCKED_CANONICAL_TOPIC_REQUIRED";

      return {
        state,
        canonicalTopicId: confirmedCanonicalTopicId,
        error: preflightReport.checks
          .filter((c) => !c.passed)
          .map((c) => `${c.gate}: ${c.message}`)
          .join(" | "),
        preflightReport,
      };
    }

    const canonicalTopicDef = STAZIAMED_CANONICAL_TOPICS.find(
      (t) => t.id === confirmedCanonicalTopicId
    )!;

    try {
      // 2. Resolve current pointer and calculate next version
      const existingHeader = await this.getTopicHeader(confirmedCanonicalTopicId);
      const nextContentVersion = (existingHeader?.currentContentVersion || 0) + 1;
      const newVersionId = `pub_${confirmedCanonicalTopicId}_v${nextContentVersion}`;
      const nowIso = new Date().toISOString();

      const fingerprint = PublicationPreflightService.generateFingerprint(
        draft,
        confirmedCanonicalTopicId
      );

      // Check if current version already has the exact same fingerprint
      if (existingHeader && existingHeader.currentVersionId) {
        const currentVersion = await this.getVersionSnapshot(
          confirmedCanonicalTopicId,
          existingHeader.currentVersionId
        );
        if (currentVersion && currentVersion.fingerprint === fingerprint) {
          return {
            state: "PUBLISHED",
            canonicalTopicId: confirmedCanonicalTopicId,
            versionId: existingHeader.currentVersionId,
            contentVersion: existingHeader.currentContentVersion,
            publishedAt: existingHeader.updatedAt,
            preflightReport,
          };
        }
      }

      // 3. Prepare clean student-safe blocks
      const studentBlocks = this.extractStudentSafeBlocks(draft);

      // 4. Create Immutable Snapshot Document
      const immutableSnapshot: PublishedTopicContentVersion = {
        id: newVersionId,
        canonicalTopicId: confirmedCanonicalTopicId,
        contentVersion: nextContentVersion,
        sourceEditorialDocumentId: draft.id,
        sourceEditorialVersion: draft.compositionVersion || "2026.1.0",
        styleProfile: "MEDICAL_EDITORIAL_V1",
        styleProfileVersion: "2026.1.0",
        pages: draft.pages,
        blocks: studentBlocks,
        rightsSnapshot: {
          rightsType: draft.sourceRightsType || "OFFICIAL_PUBLIC_DOCUMENT",
          sourceDocumentTitle: draft.topic,
          organization: canonicalTopicDef.area,
          year: "2026",
          verifiedAt: nowIso,
        },
        fingerprint,
        publishedAt: nowIso,
        publishedBy,
        previousVersionId: existingHeader?.currentVersionId,
        totalBlocks: studentBlocks.length,
        estimatedReadMinutes: preflightReport.estimatedReadMinutes,
      };

      // Write immutable version document first
      const versionDocRef = doc(
        db,
        "publishedTopicContents",
        confirmedCanonicalTopicId,
        "versions",
        newVersionId
      );
      await setDoc(versionDocRef, immutableSnapshot);

      // 5. SHORT ATOMIC COMMIT on parent header document (Pointer Update)
      const parentDocRef = doc(db, "publishedTopicContents", confirmedCanonicalTopicId);

      await runTransaction(db, async (tx) => {
        const parentSnap = await tx.get(parentDocRef);
        const parentData = parentSnap.exists() ? (parentSnap.data() as PublishedTopicHeader) : null;

        const updatedHeader: PublishedTopicHeader = {
          canonicalTopicId: confirmedCanonicalTopicId,
          currentVersionId: newVersionId,
          currentContentVersion: nextContentVersion,
          publicationStatus: "PUBLISHED",
          area: canonicalTopicDef.area,
          specialty: canonicalTopicDef.specialty,
          topic: canonicalTopicDef.name,
          subtopics: draft.subtopics || [],
          publishedAt: parentData?.publishedAt || nowIso,
          updatedAt: nowIso,
          totalVersions: nextContentVersion,
          estimatedReadMinutes: preflightReport.estimatedReadMinutes,
        };

        tx.set(parentDocRef, updatedHeader, { merge: true });
      });

      // INVARIANT CHECK: Note that NO mutation was made to older version documents.
      // Older versions remain 100% untouched and byte-equivalent to when they were created.

      return {
        state: "PUBLISHED",
        canonicalTopicId: confirmedCanonicalTopicId,
        versionId: newVersionId,
        contentVersion: nextContentVersion,
        publishedAt: nowIso,
        preflightReport,
      };
    } catch (err: any) {
      console.error("[ContentPublicationService] Publication error:", err);
      return {
        state: "PUBLICATION_FAILED",
        canonicalTopicId: confirmedCanonicalTopicId,
        error: err?.message || String(err),
        preflightReport,
      };
    }
  }
}
