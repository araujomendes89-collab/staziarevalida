/**
 * Auditoria de segurança (17/10/2026): cabeçalhos de proteção do site (vercel.json).
 * Sem eles, outro site podia abrir o app dentro de um quadro escondido (clickjacking) e o navegador
 * podia "adivinhar" o tipo de um arquivo. O microfone continua liberado para o próprio site (Tutor por voz)
 * e o app pode abrir a si mesmo em quadro (prévia do aluno na Administração).
 */
import { describe, expect, it } from "vitest";
import config from "../../vercel.json";

type Header = { key: string; value: string };
const rules = (config as { headers?: Array<{ source: string; headers: Header[] }> }).headers ?? [];
const all = rules.find((r) => r.source === "/(.*)");
const get = (key: string) => all?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

describe("cabeçalhos de segurança do vercel.json", () => {
  it("valem para todos os caminhos", () => {
    expect(all).toBeDefined();
  });

  it("o app só pode ser aberto em quadro pelo próprio site", () => {
    expect(get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
    expect(get("Content-Security-Policy")).toContain("object-src 'none'");
  });

  it("o navegador não adivinha tipo de arquivo e não vaza o endereço completo para outros sites", () => {
    expect(get("X-Content-Type-Options")).toBe("nosniff");
    expect(get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("câmera e localização desligadas; microfone só para o próprio site (Tutor por voz)", () => {
    const policy = get("Permissions-Policy") ?? "";
    expect(policy).toContain("camera=()");
    expect(policy).toContain("geolocation=()");
    expect(policy).toContain("microphone=(self)");
  });

  it("a política de conteúdo não restringe scripts (para não quebrar login do Google, voz e pagamentos)", () => {
    expect(get("Content-Security-Policy")).not.toMatch(/script-src|default-src|connect-src/);
  });
});
