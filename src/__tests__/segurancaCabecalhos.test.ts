/**
 * Auditoria de segurança (17/10/2026): cabeçalhos de proteção do site (vercel.json).
 * Sem eles, outro site podia abrir o app dentro de um quadro escondido (clickjacking) e o navegador
 * podia "adivinhar" o tipo de um arquivo. O microfone continua liberado para o próprio site (Tutor por voz)
 * e o app pode abrir a si mesmo em quadro (prévia do aluno na Administração).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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

  it("Pacote 2: as 6 tarefas agendadas continuam (voz, play, planos, cobrança, e-mail do Contrato e rotina diária do Contrato)", () => {
    const crons = ((config as { crons?: Array<{ path: string; schedule: string }> }).crons ?? []).map((c) => c.path).sort();
    expect(crons).toEqual(["/api/cobranca/cron", "/api/legal/diaria", "/api/legal/email", "/api/planos/cron", "/api/play/cron", "/api/tutor/voice/sweep"]);
  });

  it("Pacote 2: o que a Vercel manda em /novo/entrar (a tela de entrar do app) inclui o microfone do próprio site e a proteção de quadro", () => {
    // como a Vercel junta as regras: todas as que casam com o caminho, na ordem; a mesma chave numa regra seguinte substitui a anterior
    const casa = (source: string, url: string) => new RegExp(`^${source.replace(/\(\.\*\)/g, "(.*)")}$`).test(url);
    const para = (url: string) => {
      const h: Record<string, string> = {};
      for (const r of rules) if (casa(r.source, url)) for (const x of r.headers) h[x.key.toLowerCase()] = x.value;
      return h;
    };
    const entrar = para("/novo/entrar");
    expect(entrar["permissions-policy"]).toContain("microphone=(self)");
    expect(entrar["x-frame-options"]).toBe("SAMEORIGIN");
    expect(entrar["x-content-type-options"]).toBe("nosniff");
    // a página inicial (/) continua mais estrita e sem microfone; a voz não roda nela
    expect(para("/")["permissions-policy"]).toContain("microphone=()");
    expect(para("/")["x-frame-options"]).toBe("DENY");
  });

  it("um bloco de cabeçalhos só no vercel.json (a junção com a página inicial não pode apagar estes) e a página inicial em / vem depois, mais estrita", () => {
    const texto = readFileSync("vercel.json", "utf8");
    const chavesRepetidas: string[] = [];
    const nivel1 = (texto.match(/^  "[a-zA-Z$]+":/gm) ?? []).map((k) => k.trim());
    for (const k of nivel1) if (nivel1.filter((x) => x === k).length > 1 && !chavesRepetidas.includes(k)) chavesRepetidas.push(k);
    expect(chavesRepetidas).toEqual([]);
    const fontes = rules.map((r) => r.source);
    expect(fontes[0]).toBe("/(.*)");
    if (fontes.includes("/")) expect(fontes.indexOf("/")).toBeGreaterThan(fontes.indexOf("/(.*)"));
  });
});
