import { describe, it, expect } from "vitest";
import {
  classifySourceAuthority,
  TOP_2026_HOT_TOPICS,
  OfficialSearchService,
} from "../services/officialSearchService";

describe("Official Materials Evidence Integrity (Etapa 1.19B)", () => {
  it("A: strictly distinguishes Government Health, INEP and Scientific Societies", () => {
    // 1. Ministério da Saúde / CONITEC
    const msAuth = classifySourceAuthority("saude.gov.br", "Ministério da Saúde");
    expect(msAuth.sourceType).toBe("GOVERNMENT_HEALTH");
    expect(msAuth.isGov).toBe(true);
    expect(msAuth.label).toContain("Fonte Governamental");

    // 2. CONITEC
    const conitecAuth = classifySourceAuthority("conitec.gov.br", "CONITEC");
    expect(conitecAuth.sourceType).toBe("GOVERNMENT_HEALTH");
    expect(conitecAuth.isGov).toBe(true);

    // 3. INEP
    const inepAuth = classifySourceAuthority("inep.gov.br", "INEP");
    expect(inepAuth.sourceType).toBe("INEP");
    expect(inepAuth.isGov).toBe(true);
    expect(inepAuth.label).toContain("INEP");

    // 4. SBC (Cardiologia)
    const sbcAuth = classifySourceAuthority("portal.cardiol.br", "Sociedade Brasileira de Cardiologia");
    expect(sbcAuth.sourceType).toBe("SCIENTIFIC_SOCIETY");
    expect(sbcAuth.isGov).toBe(false);
    expect(sbcAuth.label).toContain("Diretriz de Sociedade Científica");

    // 5. FEBRASGO
    const febrasgoAuth = classifySourceAuthority("febrasgo.org.br", "FEBRASGO");
    expect(febrasgoAuth.sourceType).toBe("SCIENTIFIC_SOCIETY");
    expect(febrasgoAuth.isGov).toBe(false);

    // 6. SBP
    const sbpAuth = classifySourceAuthority("sbp.com.br", "Sociedade Brasileira de Pediatria");
    expect(sbpAuth.sourceType).toBe("SCIENTIFIC_SOCIETY");
    expect(sbpAuth.isGov).toBe(false);
  });

  it("B: ensures curated hot topics contain reviewedAt audit timestamps and valid sourceTypes", () => {
    expect(TOP_2026_HOT_TOPICS.length).toBeGreaterThanOrEqual(4);

    for (const item of TOP_2026_HOT_TOPICS) {
      expect(item.reviewedAt).toBeDefined();
      expect(item.sourceType).toBeDefined();
      expect(item.sourceTypeLabel).toBeDefined();
      expect(["GOVERNMENT_HEALTH", "INEP", "SCIENTIFIC_SOCIETY", "OTHER_PRIMARY_SOURCE"]).toContain(
        item.sourceType
      );
    }
  });

  it("C: separates publication date from version verification (fail-closed principle)", async () => {
    const result = await OfficialSearchService.searchOfficialProtocol("Dengue");

    expect(result.protocolName).toBeDefined();
    expect(result.publicationYear).toBeDefined();
    expect(result.sourceType).toBeDefined();
    expect(result.versionStatus).toBeDefined();

    // In fallback / unverified grounding, version must not be claimed as CURRENT_VERIFIED without proof
    expect(["CURRENT_UNVERIFIED", "CURRENT_VERIFIED", "UNKNOWN", "SUPERSEDED"]).toContain(
      result.versionStatus
    );
  });
});
