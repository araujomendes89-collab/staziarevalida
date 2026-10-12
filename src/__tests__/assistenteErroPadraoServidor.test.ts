// @vitest-environment node
/**
 * Q13 (servidor): o que o assistente responde com erro nunca leva texto técnico, nem em inglês, para a tela. O detalhe vai para o
 * registro do servidor (`log`); a resposta traz a frase padrão em português. As recusas que o servidor escreve de propósito (IA
 * desligada, teto, permissão, material) continuam como estão. Banco falso, IA simulada, sem rede.
 */
import express from "express";
import type { Server } from "http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminAssistantRouter, type AdminAssistantDeps } from "../../server/adminAssistant/router";
import { runAssistant, type EngineDeps } from "../../server/adminAssistant/engine";
import { atualizacoesAdapter } from "../../server/adminAssistant/adapters/atualizacoes";
import type { ContentDb } from "../../server/contentHub/infra";

const PADRAO = "O assistente não conseguiu responder agora. Tente de novo em instantes.";
const LINK_RUIM = "Não foi possível ler o link. Confira se ele abre sem senha e tente de novo, ou cole o texto.";
const USER = { id: "00000000-0000-4000-8000-0000000000e1" };
const FORM = { id: null, area: "GINECOLOGIA_OBSTETRICIA", topic: "Pré-eclâmpsia", timeline: [], flashcards: [], current_conduct: "" };
const MATERIAL = { text: "Em 2024 o protocolo passou a recomendar AAS 150 mg a partir de 12 semanas em gestantes de alto risco." };

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(() => done(null)))));
});

function fakeDb(over: Partial<ContentDb> = {}): ContentDb {
  return {
    mode: "dev",
    authenticate: async () => USER as any,
    asUser: async (_user: unknown, fn: string) => (fn === "app_ch_whoami" ? { admin: false, staff: true, reviewer_areas: [] } : null) as any,
    service: async () => [] as any,
    ...over,
  } as ContentDb;
}

async function listen(deps: Partial<AdminAssistantDeps> & { db?: ContentDb }) {
  const app = express();
  app.use(express.json());
  app.use("/api/admin-assistant", createAdminAssistantRouter({ db: fakeDb(), mockRespond: () => ({ findings: [] }), ...deps } as AdminAssistantDeps));
  return new Promise<string>((resolve) => {
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/admin-assistant`));
    servers.push(srv);
  });
}
const post = async (base: string, body: unknown) => {
  const r = await fetch(`${base}/run`, { method: "POST", headers: { Authorization: "Bearer t", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as { error?: string } };
};
const conferir = { tab: "atualizacoes", mode: "conferir", form: FORM };

describe("Q13: o motor não leva o texto do provedor para a tela", () => {
  const deps = (over: Partial<EngineDeps>): EngineDeps => ({ db: fakeDb(), ...over }) as EngineDeps;
  const run = (d: EngineDeps) => runAssistant(d, { adapter: atualizacoesAdapter, mode: "conferir", form: FORM, stored: null, material: null, actorId: USER.id });

  it("falha da IA em inglês: 502 com a frase padrão e o detalhe no registro", async () => {
    const log = vi.fn();
    const raw = "Gemini HTTP 429: RESOURCE_EXHAUSTED quota exceeded for model gemini-2.5-pro";
    await expect(
      run(
        deps({
          log,
          mockRespond: () => {
            throw new Error(raw);
          },
        })
      )
    ).rejects.toMatchObject({ status: 502, message: PADRAO });
    expect(log).toHaveBeenCalledWith(expect.stringContaining(raw));
  });

  it("resposta fora do formato: 502 com a frase padrão (a lista de campos errados vai para o registro)", async () => {
    const log = vi.fn();
    await expect(run(deps({ log, mockRespond: () => ({ findings: "não é lista" }) }))).rejects.toMatchObject({ status: 502, message: PADRAO });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/fora do formato/));
  });
});

describe("Q13: a rota", () => {
  it("erro inesperado do banco (inglês): 500 com a frase padrão; o detalhe vai para o registro", async () => {
    const log = vi.fn();
    const db = fakeDb({
      asUser: async () => {
        throw new Error("connection terminated unexpectedly");
      },
    });
    const r = await post(await listen({ db, log }), conferir);
    expect(r).toEqual({ status: 500, body: { error: PADRAO } });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("connection terminated unexpectedly"));
  });

  it("falha ao entrar na conta (banco fora do ar): 500 com a frase padrão", async () => {
    const log = vi.fn();
    const db = fakeDb({
      authenticate: async () => {
        throw new Error("getaddrinfo ENOTFOUND abc.supabase.co");
      },
    });
    const r = await post(await listen({ db, log }), conferir);
    expect(r).toEqual({ status: 500, body: { error: PADRAO } });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("ENOTFOUND"));
  });

  it("o mesmo no status das IAs (GET /status)", async () => {
    const db = fakeDb({
      asUser: async () => {
        throw new Error("canceling statement due to statement timeout");
      },
    });
    const base = await listen({ db, log: vi.fn() });
    const r = await fetch(`${base}/status?tab=atualizacoes`, { headers: { Authorization: "Bearer t" } });
    expect(r.status).toBe(500);
    expect(((await r.json()) as { error: string }).error).toBe(PADRAO);
  });

  it("link que não abre (rede, em inglês): 422 em português; o detalhe vai para o registro", async () => {
    const log = vi.fn();
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const r = await post(await listen({ log, fetchImpl }), { ...conferir, material: { url: "https://www.gov.br/saude/pcdt.pdf" } });
    expect(r).toEqual({ status: 422, body: { error: LINK_RUIM } });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("fetch failed"));
  });

  it("as recusas que o servidor escreve de propósito continuam com o texto de sempre", async () => {
    const base = await listen({ log: vi.fn(), checkHost: async () => { throw new Error("Endereço interno não é aceito."); } });
    expect(await post(base, { ...conferir, material: { url: "https://intranet" } })).toEqual({ status: 422, body: { error: "Endereço interno não é aceito." } });
    expect(await post(base, { ...conferir, mode: "x" })).toEqual({ status: 400, body: { error: "Modo inválido." } });
    expect(await post(base, { ...conferir, material: { text: "curto" } })).toEqual({
      status: 422,
      body: { error: "O material não tem texto aproveitável (PDF escaneado?). Cole o texto." },
    });
    const student = fakeDb({ asUser: async () => ({ admin: false, staff: false, reviewer_areas: [] }) as any });
    expect(await post(await listen({ db: student, log: vi.fn() }), conferir)).toEqual({ status: 403, body: { error: "Acesso restrito à equipe de conteúdo." } });
  });

  it("material com texto bom continua funcionando (200)", async () => {
    const r = await post(await listen({ log: vi.fn() }), { ...conferir, material: MATERIAL });
    expect(r.status).toBe(200);
  });
});
