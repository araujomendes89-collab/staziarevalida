import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("JCodesMore Framework & Dependency Isolation (1.27G.1)", () => {
  it("should confirm Next.js is NOT added to StaziaMed main package.json", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps["next"]).toBeUndefined();
    expect(deps["@base-ui/react"]).toBeUndefined();
  });

  it("should confirm JCodesMore template files are NOT copied into src/", () => {
    expect(fs.existsSync(path.join("src", "app", "layout.tsx"))).toBe(false);
    expect(fs.existsSync(path.join("src", "app", "page.tsx"))).toBe(false);
    expect(fs.existsSync(path.join("src", ".claude"))).toBe(false);
  });
});
