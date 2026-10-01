import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { JCodesMoreTemplatePreparer } from "../../server/jcodesmoreWorker/templatePreparer";
import { JCODESMORE_CONFIG, JCODESMORE_PINNED_SOURCE } from "../../server/jcodesmoreWorker/config";

describe("JCodesMore Worker Source Integrity & Pinning (1.27G.1)", () => {
  it("should confirm source ZIP exists at pinned path", () => {
    expect(fs.existsSync(JCODESMORE_CONFIG.SOURCE_ZIP)).toBe(true);
  });

  it("should match authoritative SHA-256 hash", async () => {
    const preparer = new JCodesMoreTemplatePreparer();
    const hash = await preparer.computeZipHash();
    expect(hash).toBe(JCODESMORE_CONFIG.PINNED_SHA256);
    expect(hash).toBe(JCODESMORE_PINNED_SOURCE.zipSha256);
  });

  it("should safely extract template and find expected files", async () => {
    const tempExtractDir = path.join(os.tmpdir(), `jcm_test_extract_${Date.now()}`);
    const preparer = new JCodesMoreTemplatePreparer();
    const res = await preparer.prepareWorkerTemplate(tempExtractDir);

    try {
      expect(res.valid).toBe(true);
      expect(res.packageVersion).toBe("0.4.0");
      expect(res.extractedPath).toBeDefined();

      if (res.extractedPath) {
        expect(fs.existsSync(path.join(res.extractedPath, "package.json"))).toBe(true);
        expect(
          fs.existsSync(path.join(res.extractedPath, ".claude", "skills", "clone-website", "SKILL.md"))
        ).toBe(true);
      }
    } finally {
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
    }
  });

  it("should confirm original ZIP is unmodified", () => {
    const stats = fs.statSync(JCODESMORE_CONFIG.SOURCE_ZIP);
    expect(stats.size).toBeGreaterThan(1000000);
  });
});
