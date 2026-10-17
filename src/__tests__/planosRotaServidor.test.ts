// @vitest-environment node
/**
 * Planos · ETAPAS 2 e 3 no servidor: server/planos/router.ts (ativação do teste com o código do IP; tarefa diária) e
 * server/planos/carteira.ts (reservar/confirmar/devolver; banco sem a carteira = caminho antigo idêntico).
 */
import { describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { codigoDoIp, createPlanosRouter, ipDe } from "../../server/planos/router";
import { funcaoAusente, reservarCarteira } from "../../server/planos/carteira";

async function chamar(app: express.Express, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json() };
  } finally {
    server.close();
  }
}

describe("código do IP", () => {
  it("é um HMAC de 64 hexadecimais, igual para o mesmo IP e diferente entre IPs; o IP não aparece", () => {
    const env = { PLANOS_IP_SEGREDO: "segredo-de-teste", NODE_ENV: "production" } as any;
    const a = codigoDoIp("200.1.2.3", env)!;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(codigoDoIp("::ffff:200.1.2.3", env)).toBe(a);
    expect(codigoDoIp("200.1.2.4", env)).not.toBe(a);
    expect(a).not.toContain("200");
    expect(codigoDoIp("200.1.2.3", { NODE_ENV: "production" } as any)).toBeNull(); // sem chave em produção: sem código
  });
  it("lê o IP do cabeçalho da Vercel primeiro", () => {
    expect(ipDe({ headers: { "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "9.9.9.9, 8.8.8.8" }, socket: {} as any } as any)).toBe("1.1.1.1");
    expect(ipDe({ headers: { "x-forwarded-for": "9.9.9.9, 8.8.8.8" }, socket: {} as any } as any)).toBe("9.9.9.9");
  });
});

describe("POST /api/planos/teste/ativar", () => {
  const montar = (service = vi.fn(async () => ({ ok: true }))) => {
    const db: any = { service, authenticate: vi.fn(async (req: any) => (req.headers.authorization === "Bearer ok" ? { id: "u1", jwt: "ok" } : null)) };
    const app = express();
    app.use(express.json());
    app.use("/api/planos", createPlanosRouter({ db }));
    return { app, db, service };
  };
  it("sem login: 401; escolha inválida: 400", async () => {
    const { app } = montar();
    expect((await chamar(app, "POST", "/api/planos/teste/ativar", {})).status).toBe(401);
    expect((await chamar(app, "POST", "/api/planos/teste/ativar", { escolha: "elite" }, { authorization: "Bearer ok" })).status).toBe(400);
  });
  it("manda ao banco o aluno do login (nunca do corpo), a escolha e só o código do IP", async () => {
    const { app, service } = montar();
    const r = await chamar(app, "POST", "/api/planos/teste/ativar", { escolha: "as_duas", user_id: "outro" }, { authorization: "Bearer ok", "x-vercel-forwarded-for": "177.10.20.30" });
    expect(r.status).toBe(200);
    const [fn, args] = service.mock.calls[0] as any;
    expect(fn).toBe("ch_worker_teste_ativar");
    expect(args.p_user).toBe("u1");
    expect(args.p_escolha).toBe("as_duas");
    expect(args.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain("177.10.20.30");
  });
  it("tarefa diária só com CRON_SECRET", async () => {
    const { app } = montar();
    const antes = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "c";
    try {
      expect((await chamar(app, "GET", "/api/planos/cron")).status).toBe(401);
      expect((await chamar(app, "GET", "/api/planos/cron", undefined, { authorization: "Bearer c" })).status).toBe(200);
    } finally {
      process.env.CRON_SECRET = antes;
    }
  });
});

describe("carteira no servidor", () => {
  it("banco sem a carteira (função ausente): o Tutor usa a reserva antiga, idêntica; devolver devolve a antiga", async () => {
    const service = vi.fn(async (fn: string) => {
      if (fn === "ch_worker_carteira_reservar") throw new Error("Could not find the function public.ch_worker_carteira_reservar(p_user, ...) in the schema cache");
      if (fn === "ch_worker_tutor_text_reserve") return { ok: true, reservation: 41 };
      return null;
    });
    const w = await reservarCarteira({ service } as any, { user: "u1", recurso: "tutor_texto", sessionId: "s1" });
    expect(w).toMatchObject({ ok: true, modo: "legado", reservation: 41 });
    await w.devolver();
    expect(service.mock.calls.map((c) => c[0])).toEqual(["ch_worker_carteira_reservar", "ch_worker_tutor_text_reserve", "ch_worker_tutor_text_release"]);
  });
  it("outro erro do banco não é engolido", async () => {
    const service = vi.fn(async () => {
      throw new Error("connection refused");
    });
    await expect(reservarCarteira({ service } as any, { user: "u1", recurso: "dica_questao" })).rejects.toThrow("connection refused");
    expect(funcaoAusente(new Error("function public.x() does not exist"))).toBe(true);
  });
  it("com a carteira: reserva, confirma pelo custo real e não confirma o que foi recusado", async () => {
    const calls: any[] = [];
    const service = vi.fn(async (fn: string, args: any) => {
      calls.push([fn, args]);
      if (fn === "ch_worker_carteira_reservar") return args.p_recurso === "dica_questao" ? { ok: false, reason: "sem_creditos", modo: "ligado", mensagem: "Seus créditos de IA de hoje acabaram. Amanhã tem mais." } : { ok: true, modo: "ligado" };
      if (fn === "ch_worker_carteira_confirmar") return { ok: true, creditos: 1.1 };
      return null;
    });
    const w = await reservarCarteira({ service } as any, { user: "u1", recurso: "tutor_janela" });
    expect(w.requestId).toMatch(/^tutor_janela:[0-9a-f-]{36}$/);
    expect(await w.confirmar(0.021)).toMatchObject({ creditos: 1.1 });
    expect(calls.find(([fn]) => fn === "ch_worker_carteira_confirmar")[1]).toMatchObject({ p_request_id: w.requestId, p_custo_usd: 0.021 });
    const d = await reservarCarteira({ service } as any, { user: "u1", recurso: "dica_questao" });
    expect(d).toMatchObject({ ok: false, reason: "sem_creditos", modo: "ligado" });
    expect(await d.confirmar(1)).toBeNull();
  });
});
