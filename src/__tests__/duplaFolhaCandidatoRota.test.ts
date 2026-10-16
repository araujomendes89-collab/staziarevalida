// @vitest-environment node
/**
 * Treino em Dupla · rota /api/dupla/folhas (Administração › Estações): pedir a folha do candidato e ver a imagem.
 * Banco e depósito simulados: quem decide o acesso é o banco (app_admin_dupla_folha_pedir / _caminho chamadas como a pessoa);
 * sem o Chromium, o pedido fica para o processamento (202). Nada de rede nem de banco real.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "http";
import type { ContentDb, Identity, Storage } from "../../server/contentHub/infra";
import { AVISO_PROCESSAMENTO, createFolhaRouter } from "../../server/dupla/folhaRouter";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const chamadas: { user: string; fn: string; args: Record<string, unknown> }[] = [];

const db: ContentDb = {
  mode: "dev",
  async service() {
    throw new Error("não usado sem o Chromium");
  },
  async asUser<T>(user: Identity, fn: string, args: Record<string, unknown> = {}) {
    chamadas.push({ user: user.id, fn, args });
    if (user.id === "aluno") throw new Error("Gerar a folha do candidato: só a equipe (administrador ou editor).");
    if (fn === "app_admin_dupla_folha_pedir") return { estado: "pedida" } as T;
    if (fn === "app_admin_dupla_folha_caminho") return (args.p_station_id === "sem-folha" ? null : "dupla/folhas/a.png") as T;
    throw new Error(`não simulada: ${fn}`);
  },
  async authenticate(req) {
    const t = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    return t === "tok-adm" ? { id: "adm", email: null } : t === "tok-aluno" ? { id: "aluno", email: null } : null;
  },
};
const storage: Storage = {
  async put(k) {
    return k;
  },
  async get(k) {
    if (k !== "dupla/folhas/a.png") throw new Error("sem arquivo");
    return PNG;
  },
  async exists() {
    return true;
  },
};

let base = "";
let srv: Server;
beforeAll(async () => {
  const app = express();
  app.use("/api/dupla/folhas", createFolhaRouter({ db, storage, renderer: null }));
  base = await new Promise<string>((resolve) => {
    srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/dupla/folhas`));
  });
});
afterAll(() => srv?.close());

const req = async (path: string, token: string | null, method = "GET") => {
  const r = await fetch(base + path, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, cache: r.headers.get("cache-control"), body: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};

describe("rota da folha do candidato", () => {
  it("sem login 401; estação com caractere inválido 400; aluno recebe a recusa do banco (403)", async () => {
    expect((await req("/teste-inep2020-e01/gerar", null, "POST")).status).toBe(401);
    expect((await req("/a%20b/gerar", "tok-adm", "POST")).status).toBe(400);
    const aluno = await req("/teste-inep2020-e01/gerar", "tok-aluno", "POST");
    expect(aluno.status).toBe(403);
    expect(aluno.body.error).toMatch(/só a equipe/);
  });

  it("sem o gerador de imagens neste servidor: o pedido fica registrado para o processamento (202)", async () => {
    const r = await req("/teste-inep2020-e01/gerar", "tok-adm", "POST");
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ gerada: false, aviso: AVISO_PROCESSAMENTO, situacao: { estado: "pedida" } });
    expect(r.cache).toBe("private, no-store");
    expect(chamadas.at(-1)).toEqual({ user: "adm", fn: "app_admin_dupla_folha_pedir", args: { p_station_id: "teste-inep2020-e01" } });
  });

  it("ver a imagem: link nulo no desenvolvimento e o arquivo pelo servidor; sem folha 404", async () => {
    expect((await req("/teste-inep2020-e01/imagem/link", "tok-adm")).body).toEqual({ url: null });
    const f = await req("/teste-inep2020-e01/imagem/file", "tok-adm");
    expect(f.status).toBe(200);
    expect(Buffer.compare(f.body as Buffer, PNG)).toBe(0);
    expect((await req("/sem-folha/imagem/file", "tok-adm")).status).toBe(404);
  });
});
