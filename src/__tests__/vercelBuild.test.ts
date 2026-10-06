// @vitest-environment node
/**
 * Build da Vercel: os ícones do design system (public/ds-icons) não vão para o git; são copiados do pacote
 * lucide-static antes de cada build. Sem isso o site publicado fica sem nenhum ícone de linha (aconteceu em 2026-10-06).
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

describe("Build da Vercel", () => {
  it("copia os ícones do design system antes do vite build", () => {
    expect(vercel.buildCommand).toBe("npm run build:vercel");
    const steps = pkg.scripts["build:vercel"].split("&&").map((s: string) => s.trim());
    expect(steps.indexOf("npm run ds:icons")).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf("npm run ds:icons")).toBeLessThan(steps.findIndex((s: string) => s.startsWith("vite build")));
    expect(fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8")).toMatch(/public\/ds-icons/);
  });
});
