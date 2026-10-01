/**
 * Publication Preflight Gate Service (Etapa 1.28F).
 * Strictly validates editorial approval, canonical topic registration,
 * source rights, asset integrity, and renderer compatibility before publishing.
 */

import { StaziaEditorialDocumentDraft } from "../types/medicalEditorial";
import { STAZIAMED_CANONICAL_TOPICS } from "../types/medicalTaxonomy";
import {
  PublicationPreflightReport,
  PreflightGateCheck,
  PUBLICATION_SCHEMA_VERSION,
} from "../types/publishedContent";

export class PublicationPreflightService {
  /**
   * Deterministic Read Time Estimator based on Portuguese medical reading speed (160 words/min).
   */
  static estimateReadMinutes(totalWords: number): number {
    if (totalWords <= 0) return 1;
    const wpm = 160;
    return Math.max(1, Math.ceil(totalWords / wpm));
  }

  /**
   * Generates a deterministic publication fingerprint.
   */
  static generateFingerprint(
    draft: StaziaEditorialDocumentDraft,
    canonicalTopicId: string
  ): string {
    const blocksText = draft.pages
      .flatMap((p) => p.blocks)
      .map((b) => `${b.id}:${b.type}:${b.content.length}:${b.content.slice(0, 30)}`)
      .join("|");

    const payload = [
      canonicalTopicId,
      draft.id,
      draft.compositionVersion,
      draft.styleProfile,
      PUBLICATION_SCHEMA_VERSION,
      draft.sourceRightsType || "OFFICIAL_PUBLIC_DOCUMENT",
      blocksText,
    ].join("::");

    // Simple robust deterministic string hash for audit fingerprinting
    let hash = 0;
    for (let i = 0; i < payload.length; i++) {
      const char = payload.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `fp_pub_${Math.abs(hash).toString(16)}_${payload.length}`;
  }

  /**
   * Executes all 6 Preflight Gates.
   */
  static runPreflight(
    draft: StaziaEditorialDocumentDraft,
    confirmedCanonicalTopicId?: string
  ): PublicationPreflightReport {
    const checks: PreflightGateCheck[] = [];
    const warnings: string[] = [];

    // Target Canonical Topic Resolution
    const targetTopicId = confirmedCanonicalTopicId || draft.canonicalTopicId || "";
    const canonicalTopicDef = STAZIAMED_CANONICAL_TOPICS.find((t) => t.id === targetTopicId);

    // 1. Gate: PREFLIGHT_EDITORIAL_APPROVAL
    const isApproved = draft.status === "APPROVED_EDITORIAL";
    checks.push({
      gate: "PREFLIGHT_EDITORIAL_APPROVAL",
      passed: isApproved,
      message: isApproved
        ? "Documento editorial com status APPROVED_EDITORIAL confirmado."
        : `Status inválido: ${draft.status}. Apenas documentos APPROVED_EDITORIAL podem ser publicados.`,
    });

    // 2. Gate: PREFLIGHT_CANONICAL_TOPIC
    const hasCanonicalTopic = Boolean(targetTopicId && canonicalTopicDef);
    checks.push({
      gate: "PREFLIGHT_CANONICAL_TOPIC",
      passed: hasCanonicalTopic,
      message: hasCanonicalTopic
        ? `Tema canônico confirmado no registro: ${canonicalTopicDef?.name} (${canonicalTopicDef?.id}).`
        : `Tema canônico ausente ou não registrado em STAZIAMED_CANONICAL_TOPICS. Informado: '${targetTopicId}'.`,
      details: canonicalTopicDef,
    });

    // 3. Gate: PREFLIGHT_RIGHTS
    const allBlocks = draft.pages.flatMap((p) => p.blocks);
    const unapprovedRightsBlocks = allBlocks.filter(
      (b) => b.rightsWarning === "REPUBLICATION_REVIEW_REQUIRED"
    );
    const hasRightsWarningsInDraft =
      draft.assetRightsWarnings && draft.assetRightsWarnings.length > 0;
    const rightsPassed = unapprovedRightsBlocks.length === 0;

    checks.push({
      gate: "PREFLIGHT_RIGHTS",
      passed: rightsPassed,
      message: rightsPassed
        ? "Direitos autorais de todas as figuras, tabelas e fontes aprovados para publicação."
        : `Bloqueio de Direitos: ${unapprovedRightsBlocks.length} bloco(s) possuem aviso REPUBLICATION_REVIEW_REQUIRED sem aprovação expressa.`,
      details: {
        unapprovedCount: unapprovedRightsBlocks.length,
        hasDraftWarnings: hasRightsWarningsInDraft,
      },
    });

    // 4. Gate: PREFLIGHT_ASSETS
    const imageBlocks = allBlocks.filter((b) => b.type === "MedicalImageBlock");
    const brokenImages = imageBlocks.filter((b) => !b.figureData && !b.content);
    const assetsPassed = brokenImages.length === 0;

    checks.push({
      gate: "PREFLIGHT_ASSETS",
      passed: assetsPassed,
      message: assetsPassed
        ? `Todos os assets visuais (${imageBlocks.length}) validados e referenciados com integridade.`
        : `${brokenImages.length} asset(s) de imagem estão sem dados válidos de figura.`,
    });

    // 5. Gate: PREFLIGHT_CONTENT_INTEGRITY
    const unaccountedBlocks = draft.plan?.unaccountedSourceBlocks ?? 0;
    const duplicatedBlocks = draft.plan?.duplicatedSourceBlockAssignments ?? 0;
    const hasPages = draft.pages && draft.pages.length > 0;
    const hasBlocks = allBlocks.length > 0;
    const integrityPassed =
      unaccountedBlocks === 0 && duplicatedBlocks === 0 && hasPages && hasBlocks;

    checks.push({
      gate: "PREFLIGHT_CONTENT_INTEGRITY",
      passed: integrityPassed,
      message: integrityPassed
        ? `Integridade 100% validada (${allBlocks.length} blocos distribuídos em ${draft.pages.length} páginas, 0 perdas).`
        : `Falha de integridade: unaccounted=${unaccountedBlocks}, duplicated=${duplicatedBlocks}, totalBlocks=${allBlocks.length}.`,
    });

    // 6. Gate: PREFLIGHT_RENDERER_COMPATIBILITY
    const supportedTypes = new Set([
      "MedicalEditorialHero",
      "BrushSectionHeader",
      "EditorialSubheading",
      "EditorialParagraph",
      "EditorialList",
      "StickyNoteCard",
      "StaziaMedicalTable",
      "ClinicalWarningCard",
      "ProtocolUpdateCard",
      "ComparisonCard",
      "ClinicalAlgorithmSteps",
      "MedicalImageBlock",
      "MedicalFigureCaption",
      "DefinitionCard",
      "ReferenceBlock",
      "QuickSummaryStrip",
      "EditorialSourceWarning",
    ]);

    const unsupportedBlocks = allBlocks.filter((b) => !supportedTypes.has(b.type));
    const rendererPassed = unsupportedBlocks.length === 0;

    checks.push({
      gate: "PREFLIGHT_RENDERER_COMPATIBILITY",
      passed: rendererPassed,
      message: rendererPassed
        ? "Todos os tipos de blocos são compatíveis com o renderizador de componentes canônicos."
        : `${unsupportedBlocks.length} bloco(s) possuem tipos não suportados pelo renderizador.`,
    });

    // Calculate Word Count and Read Time
    const totalWords = allBlocks.reduce((acc, b) => {
      const words = b.content.trim().split(/\s+/).filter(Boolean).length;
      return acc + words;
    }, 0);
    const estimatedReadMinutes = this.estimateReadMinutes(totalWords);

    const allPassed = checks.every((c) => c.passed);
    const fingerprint = this.generateFingerprint(draft, targetTopicId);

    return {
      passed: allPassed,
      canonicalTopicId: targetTopicId,
      canonicalTopicName: canonicalTopicDef?.name || draft.topic,
      editorialDocumentId: draft.id,
      checks,
      totalBlocks: allBlocks.length,
      estimatedReadMinutes,
      fingerprint,
      warnings,
      timestamp: new Date().toISOString(),
    };
  }
}
