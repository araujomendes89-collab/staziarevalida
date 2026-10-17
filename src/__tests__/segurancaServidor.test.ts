// @vitest-environment node
/**
 * Auditoria de segurança (17/10/2026): proteções pequenas do servidor.
 * - tarefas agendadas: segredo conferido em tempo constante;
 * - /api/dev-db (cadastro e "primeiro administrador" sem conferência) nunca sobe na Vercel nem no Cloud Run;
 * - o servidor não anuncia "Express" nas respostas.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { cronAutorizado, podeMontarBancoDev } from "../../server/seguranca/protecoes";

const ROOT = path.resolve(__dirname, "../..");

describe("segredo das tarefas agendadas", () => {
  it("aceita só o cabeçalho exato", () => {
    expect(cronAutorizado("Bearer abc123", "abc123")).toBe(true);
    expect(cronAutorizado("Bearer abc124", "abc123")).toBe(false);
    expect(cronAutorizado("Bearer abc12", "abc123")).toBe(false);
    expect(cronAutorizado("abc123", "abc123")).toBe(false);
    expect(cronAutorizado(undefined, "abc123")).toBe(false);
  });
  it("sem segredo configurado, recusa todo mundo (inclusive cabeçalho vazio)", () => {
    expect(cronAutorizado("Bearer ", "")).toBe(false);
    expect(cronAutorizado("Bearer undefined", undefined)).toBe(false);
  });
  it("a rotina diária do Play usa a conferência nova", () => {
    const src = fs.readFileSync(path.join(ROOT, "server/play/router.ts"), "utf8");
    expect(src).toContain("cronAutorizado(req.headers.authorization, secret)");
    expect(src).not.toMatch(/authorization !== `Bearer/);
  });
});

describe("banco de desenvolvimento (/api/dev-db)", () => {
  it("só na máquina de quem desenvolve", () => {
    expect(podeMontarBancoDev({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(true);
    expect(podeMontarBancoDev({} as NodeJS.ProcessEnv)).toBe(true);
  });
  it("nunca em produção, na Vercel ou no Cloud Run — mesmo com NODE_ENV errado", () => {
    expect(podeMontarBancoDev({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
    expect(podeMontarBancoDev({ NODE_ENV: "development", VERCEL: "1" } as NodeJS.ProcessEnv)).toBe(false);
    expect(podeMontarBancoDev({ VERCEL_ENV: "preview" } as NodeJS.ProcessEnv)).toBe(false);
    expect(podeMontarBancoDev({ K_SERVICE: "staziamed-api" } as NodeJS.ProcessEnv)).toBe(false);
  });
  it("o servidor monta o /api/dev-db só por essa regra e não anuncia o Express", () => {
    const src = fs.readFileSync(path.join(ROOT, "server.ts"), "utf8");
    const mount = src.indexOf('app.use("/api/dev-db"');
    const guard = src.lastIndexOf("if (podeMontarBancoDev())", mount);
    expect(mount).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(0);
    expect(mount - guard).toBeLessThan(200);
    expect(src).toContain('app.disable("x-powered-by")');
  });
});
