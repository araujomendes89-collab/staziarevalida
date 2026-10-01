import { describe, it, expect } from "vitest";
import { JCodesMoreSecretScanner } from "../../server/jcodesmoreWorker/secretScanner";
import { JCodesMoreRawArtifactBundle } from "../types/jcodesmoreWorker";

describe("1.27G.2 — JCodesMore Secret Scanner", () => {
  it("passes clean artifact bundle with zero violations", () => {
    const cleanBundle: JCodesMoreRawArtifactBundle = {
      jobId: "job_test_clean",
      targetUrl: "https://beta.penserevalida.com/checklists",
      capturedAt: new Date().toISOString(),
      rightsType: "OWNED",
      screenshots: {
        referenceDesktop: "data:image/png;base64,iVBORw0KGgo=",
      },
      researchSpecs: {
        topologyJson: JSON.stringify({ title: "Checklists", sections: 4 }),
        tokensJson: JSON.stringify({ primaryColor: "#3B82F6", font: "Inter" }),
        componentSpecs: [{ name: "card.spec.md", content: "# Card Spec\nNeutral component" }],
      },
      generatedCodeFiles: [
        {
          relativePath: "components/Card.tsx",
          sizeBytes: 120,
          previewContent: "export const Card = () => <div>Card</div>;",
        },
      ],
      secretScanPassed: false,
    };

    const result = JCodesMoreSecretScanner.scanBundle(cleanBundle);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("detects and blocks bearer tokens and JWTs in specs", () => {
    const dirtyBundle: JCodesMoreRawArtifactBundle = {
      jobId: "job_test_dirty",
      targetUrl: "https://beta.penserevalida.com/checklists",
      capturedAt: new Date().toISOString(),
      rightsType: "OWNED",
      screenshots: {},
      researchSpecs: {
        topologyJson: JSON.stringify({ token: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" }),
      },
      generatedCodeFiles: [],
      secretScanPassed: false,
    };

    const result = JCodesMoreSecretScanner.scanBundle(dirtyBundle);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations.some((v) => v.includes("Bearer Token") || v.includes("JWT Token"))).toBe(true);
  });

  it("detects and blocks .env and private key files in generatedCodeFiles", () => {
    const dirtyBundle: JCodesMoreRawArtifactBundle = {
      jobId: "job_test_env",
      targetUrl: "https://beta.penserevalida.com/checklists",
      capturedAt: new Date().toISOString(),
      rightsType: "OWNED",
      screenshots: {},
      researchSpecs: {},
      generatedCodeFiles: [
        {
          relativePath: ".env.local",
          sizeBytes: 40,
          previewContent: "SECRET_KEY=1234567890abcdef",
        },
      ],
      secretScanPassed: false,
    };

    const result = JCodesMoreSecretScanner.scanBundle(dirtyBundle);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("[DISALLOWED_FILE]"))).toBe(true);
  });

  it("detects and blocks session cookie headers in string contents", () => {
    const scan = JCodesMoreSecretScanner.scanString("Set-Cookie: auth_token=982374982374; Path=/;", "headers");
    expect(scan.passed).toBe(false);
    expect(scan.violations.some((v) => v.includes("Cookie Session Header"))).toBe(true);
  });
});
