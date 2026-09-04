/**
 * Stazia Editorial Composition Engine (Etapa 1.28D).
 * Transforms APPROVED StructuredSourceContent into StaziaEditorialDocumentDraft
 * applying MEDICAL_EDITORIAL_V1 visual standards, density heuristics,
 * and zero-loss / zero-rewriting guarantees.
 */

import {
  DensityState,
  EDITORIAL_COMPOSITION_VERSION,
  EditorialBlock,
  EditorialCompositionPlan,
  EditorialPagePlan,
  PageRole,
  SourceBlockAssignment,
  StaziaEditorialDocumentDraft,
} from "../types/medicalEditorial";
import { StructuredSourceContent } from "../types/medicalTaxonomy";
import { EditorialSemanticMappingService } from "./editorialSemanticMappingService";

export class StaziaEditorialCompositionEngine {
  private static instance: StaziaEditorialCompositionEngine;
  public readonly engineName = "StaziaEditorialCompositionEngine";
  public readonly engineVersion = EDITORIAL_COMPOSITION_VERSION;

  private mappingService: EditorialSemanticMappingService;

  public constructor() {
    this.mappingService = EditorialSemanticMappingService.getInstance();
  }

  public static getInstance(): StaziaEditorialCompositionEngine {
    if (!StaziaEditorialCompositionEngine.instance) {
      StaziaEditorialCompositionEngine.instance = new StaziaEditorialCompositionEngine();
    }
    return StaziaEditorialCompositionEngine.instance;
  }

  /**
   * Composes a StructuredSourceContent into an Editorial Document Draft.
   */
  public async composeDocument(
    sourceContent: StructuredSourceContent,
    customTitle?: string
  ): Promise<{ draft: StaziaEditorialDocumentDraft; plan: EditorialCompositionPlan }> {
    const rawBlocks = sourceContent.blocks || [];
    const totalSourceBlocks = rawBlocks.length;

    // 1. Semantic Mapping (Deterministic & Verbatim)
    const editorialBlocks: EditorialBlock[] = rawBlocks.map((b, idx) =>
      this.mappingService.mapSourceBlockToEditorial(b, idx + 1)
    );

    // 2. Source Block Assignment Tracking
    const assignments: SourceBlockAssignment[] = rawBlocks.map((b, idx) => ({
      sourceBlockId: b.sourceBlockId || b.id,
      status: "ASSIGNED",
      assignedEditorialBlockId: editorialBlocks[idx].id,
    }));

    // 3. Density & Page Layout Planning
    const pages = this.planPages(editorialBlocks);

    // 4. Zero Loss & Duplication Audits
    const assignedCount = assignments.filter((a) => a.status === "ASSIGNED").length;
    const unaccountedSourceBlocks = totalSourceBlocks - assignedCount;

    const assignedIds = assignments.map((a) => a.sourceBlockId);
    const uniqueAssignedIds = new Set(assignedIds);
    const duplicatedSourceBlockAssignments = assignedIds.length - uniqueAssignedIds.size;

    const plan: EditorialCompositionPlan = {
      id: `plan_${sourceContent.id}_${Date.now()}`,
      structuredSourceContentId: sourceContent.id,
      styleProfile: "MEDICAL_EDITORIAL_V1",
      documentTitle: customTitle || sourceContent.topic,
      pagePlan: pages,
      sourceBlockAssignments: assignments,
      warnings: [],
      compositionStatus: "DRAFT",
      totalStructuredSourceBlocks: totalSourceBlocks,
      assignedEditorialBlocks: editorialBlocks.length,
      adminExcludedBlocks: 0,
      reviewRequiredBlocks: 0,
      unaccountedSourceBlocks: Math.max(0, unaccountedSourceBlocks),
      duplicatedSourceBlockAssignments: Math.max(0, duplicatedSourceBlockAssignments),
    };

    const draft: StaziaEditorialDocumentDraft = {
      id: `draft_${sourceContent.id}`,
      structuredSourceContentId: sourceContent.id,
      sourceDocumentId: sourceContent.sourceDocumentId,
      segmentId: sourceContent.segmentId,
      canonicalTopicId: sourceContent.canonicalTopicId,
      area: sourceContent.area,
      specialty: sourceContent.specialty,
      topic: sourceContent.topic,
      subtopics: sourceContent.subtopics,
      styleProfile: "MEDICAL_EDITORIAL_V1",
      compositionVersion: EDITORIAL_COMPOSITION_VERSION,
      pages,
      plan,
      status: "DRAFT",
      sourceRightsType: undefined,
      assetRightsWarnings: [],
      createdAt: new Date().toISOString(),
      createdBy: "admin-master",
      updatedAt: new Date().toISOString(),
    };

    return { draft, plan };
  }

  /**
   * Plans distribution of blocks across pages using density heuristics.
   */
  private planPages(blocks: EditorialBlock[]): EditorialPagePlan[] {
    if (blocks.length === 0) {
      return [
        {
          pageIndex: 1,
          pageRole: "TOPIC_OPENING",
          blocks: [],
          sourceBlockRefs: [],
          estimatedDensity: "LOW",
          densityScore: 0,
        },
      ];
    }

    const pages: EditorialPagePlan[] = [];
    const MAX_PAGE_DENSITY = 9.5; // Target density threshold for an A4 page

    let currentPageBlocks: EditorialBlock[] = [];
    let currentDensity = 0;
    let currentPageIndex = 1;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const weight = block.layoutHints.densityWeight || 1.0;

      // Check orphan heading constraint
      const isOrphanHeadingRisk =
        block.layoutHints.keepWithNext && currentDensity + weight > MAX_PAGE_DENSITY - 1.5;

      // Check overflow constraint
      const wouldOverflow = currentDensity + weight > MAX_PAGE_DENSITY || isOrphanHeadingRisk;

      if (wouldOverflow && currentPageBlocks.length > 0) {
        // Finalize current page
        pages.push(this.finalizePage(currentPageIndex, currentPageBlocks, currentDensity, "Densidade máxima atingida"));
        currentPageIndex++;
        currentPageBlocks = [block];
        currentDensity = weight;
      } else {
        currentPageBlocks.push(block);
        currentDensity += weight;
      }
    }

    if (currentPageBlocks.length > 0) {
      pages.push(this.finalizePage(currentPageIndex, currentPageBlocks, currentDensity));
    }

    return pages;
  }

  /**
   * Builds finalized EditorialPagePlan with pageRole and density state.
   */
  private finalizePage(
    pageIndex: number,
    pageBlocks: EditorialBlock[],
    densityScore: number,
    pageBreakReason?: string
  ): EditorialPagePlan {
    let pageRole: PageRole = pageIndex === 1 ? "TOPIC_OPENING" : "CORE_CONTENT";

    // Determine specific page role if dominated by a component
    if (pageBlocks.some((b) => b.type === "StaziaMedicalTable")) {
      pageRole = pageIndex === 1 ? "TOPIC_OPENING" : "TABLE_FOCUSED";
    } else if (pageBlocks.some((b) => b.type === "ClinicalAlgorithmSteps")) {
      pageRole = "ALGORITHM_FOCUSED";
    } else if (pageBlocks.some((b) => b.type === "MedicalImageBlock")) {
      pageRole = "FIGURE_FOCUSED";
    } else if (pageBlocks.some((b) => b.type === "ClinicalWarningCard")) {
      pageRole = "WARNING_FOCUSED";
    } else if (pageBlocks.every((b) => b.type === "ReferenceBlock")) {
      pageRole = "REFERENCES";
    }

    let estimatedDensity: DensityState = "BALANCED";
    if (densityScore < 3.5) {
      estimatedDensity = "LOW";
    } else if (densityScore <= 8.5) {
      estimatedDensity = "BALANCED";
    } else if (densityScore <= 10.0) {
      estimatedDensity = "HIGH";
    } else {
      estimatedDensity = "OVERFLOW_RISK";
    }

    const sourceBlockRefs = pageBlocks.flatMap((b) => b.sourceBlockRefs);

    return {
      pageIndex,
      pageRole,
      blocks: pageBlocks,
      sourceBlockRefs,
      estimatedDensity,
      densityScore: Number(densityScore.toFixed(1)),
      pageBreakReason,
    };
  }
}
