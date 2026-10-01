import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Firebase Storage Security Rules Hardening & Canonical Namespace Invariants", () => {
  const storageRulesPath = path.resolve(__dirname, "../../storage.rules");
  const rulesContent = fs.readFileSync(storageRulesPath, "utf-8");

  describe("1. isAdmin() Canonical Security Gate", () => {
    it("E. isAdmin() must strictly validate user role == 'ADMIN' in named database 'staziamed-revalida-prod'", () => {
      expect(rulesContent).toContain(
        "firestore.exists(/databases/staziamed-revalida-prod/documents/users/$(request.auth.uid))"
      );
      expect(rulesContent).toContain(
        "firestore.get(/databases/staziamed-revalida-prod/documents/users/$(request.auth.uid)).data.role == 'ADMIN'"
      );
    });

    it("storage.rules MUST NOT contain any references to database '(default)'", () => {
      expect(rulesContent).not.toContain("(default)");
      expect(rulesContent).not.toContain("/databases/(default)");
    });

    it("storage.rules MUST NOT use legacy 'documents/admins/' collection for authorization", () => {
      expect(rulesContent).not.toContain("documents/admins");
      expect(rulesContent).not.toContain("/admins/");
    });
  });

  describe("2. Canonical Content Engine Source Documents Namespace Hardening", () => {
    it("A. storage.rules MUST declare the canonical namespace match /content-engine/source-documents/{allPaths=**}", () => {
      expect(rulesContent).toContain("match /content-engine/source-documents/{allPaths=**}");
    });

    it("B. content-engine/source-documents MUST strictly require isAdmin() for both read and write", () => {
      const sourceDocumentsBlock = rulesContent.match(
        /match\s+\/content-engine\/source-documents\/\{allPaths=\*\*\}\s*\{([^}]+)\}/
      );
      expect(sourceDocumentsBlock).toBeDefined();
      const blockBody = sourceDocumentsBlock ? sourceDocumentsBlock[1].trim() : "";

      expect(blockBody).toMatch(/allow\s+read,\s*write:\s*if\s+isAdmin\(\);/);
    });

    it("C. storage.rules MUST NOT contain the unused legacy namespace /source-pdfs/", () => {
      expect(rulesContent).not.toContain("match /source-pdfs/");
      expect(rulesContent).not.toContain("/source-pdfs/");
    });

    it("D. content-engine/source-documents MUST NOT allow public or unauthenticated read", () => {
      const sourceDocumentsBlock = rulesContent.match(
        /match\s+\/content-engine\/source-documents\/\{allPaths=\*\*\}\s*\{([^}]+)\}/
      );
      expect(sourceDocumentsBlock).toBeDefined();
      const blockBody = sourceDocumentsBlock ? sourceDocumentsBlock[1] : "";

      expect(blockBody).not.toContain("allow read: if true");
      expect(blockBody).not.toContain("if true");
      expect(blockBody).not.toContain("if isAuthenticated()");
    });
  });

  describe("3. Published Content & Question Images Isolation", () => {
    it("G. published-content allows authenticated read and admin write", () => {
      const pubContentBlock = rulesContent.match(/match\s+\/published-content\/\{allPaths=\*\*\}\s*\{([^}]+)\}/);
      expect(pubContentBlock).toBeDefined();
      const blockBody = pubContentBlock ? pubContentBlock[1] : "";

      expect(blockBody).toContain("allow read: if isAuthenticated();");
      expect(blockBody).toContain("allow write: if isAdmin();");
    });

    it("F. questions-images maintains public read and admin write in this stage", () => {
      const qImgBlock = rulesContent.match(/match\s+\/questions-images\/\{allPaths=\*\*\}\s*\{([^}]+)\}/);
      expect(qImgBlock).toBeDefined();
      const blockBody = qImgBlock ? qImgBlock[1] : "";

      expect(blockBody).toContain("allow read: if true;");
      expect(blockBody).toContain("allow write: if isAdmin();");
    });

    it("H. Global fallback denies all unmatched reads and writes (Fail-Closed)", () => {
      const fallbackBlock = rulesContent.match(/match\s+\/\{allPaths=\*\*\}\s*\{([^}]+)\}/);
      expect(fallbackBlock).toBeDefined();
      const blockBody = fallbackBlock ? fallbackBlock[1] : "";

      expect(blockBody).toContain("allow read, write: if false;");
    });
  });
});
