// @vitest-environment node
/**
 * Treino em Dupla · Tarefa 14: rota /api/dupla/rooms/:roomId/prints/:pressingId/{link,file} (imagem do impresso).
 * Banco e depósito simulados (como lessonsRoutes.test.ts): quem decide é o banco (app_dupla_print_path chamada como a pessoa);
 * a rota só confere o formato dos ids, assina o endereço (Supabase) ou entrega o arquivo (desenvolvimento), sem cache.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { localStorageDir, type ContentDb, type Identity, type Storage } from "../../server/contentHub/infra";
import { createDuplaRouter, DUPLA_PRINTS_BUCKET, duplaStorage } from "../../server/dupla/router";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dupla-impresso-"));
const SALA = "11111111-1111-4111-8111-111111111111";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const chamadas: { user: string; fn: string; args: Record<string, unknown> }[] = [];

// Banco simulado: token "tok-ana" é a Ana; o caminho depende do id do impresso.
const db: ContentDb = {
  mode: "dev",
  async service() {
    throw new Error("não usado");
  },
  async asUser<T>(user: Identity, fn: string, args: Record<string, unknown> = {}) {
    chamadas.push({ user: user.id, fn, args });
    const p = String(args.p_pressing_id);
    if (p === "d9") throw new Error("Impresso não liberado.");
    if (p === "falha") throw new Error("permission denied for function app_dupla_print_path");
    if (p === "semimagem") return null as T;
    if (p === "jpeg") return "dupla/foto.jpeg" as T;
    if (p === "outro") return "dupla/arquivo.bin" as T;
    return "dupla/a1.png" as T;
  },
  async authenticate(req) {
    const t = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    return t === "tok-ana" ? { id: "ana", email: null } : null;
  },
};

const assinadas: [string, number][] = [];
const signedStorage: Storage = {
  async put(k) {
    return k;
  },
  async get() {
    throw new Error("não usado");
  },
  async exists() {
    return true;
  },
  async signedUrl(k, s) {
    assinadas.push([k, s]);
    return `https://deposito.test/${k}?expira=${s}`;
  },
};

const servers: Server[] = [];
let signed = "";
let dev = "";
let semBanco = "";
const listen = (deps: Parameters<typeof createDuplaRouter>[0], pending: string | null = null) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use("/api/dupla", createDuplaRouter(deps, pending));
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/dupla`));
    servers.push(srv);
  });
const get = async (url: string, token: string | null = "tok-ana") => {
  const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, headers: r.headers, body: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};

beforeAll(async () => {
  const dir = path.join(tmp, "files");
  const local = localStorageDir(dir);
  await local.put("dupla/a1.png", PNG, "image/png");
  await local.put("dupla/foto.jpeg", PNG, "image/jpeg");
  await local.put("dupla/arquivo.bin", PNG, "application/octet-stream");
  signed = await listen({ db, storage: signedStorage });
  dev = await listen({ db, storage: local });
  semBanco = await listen(null, "Servidor sem banco configurado.");
});
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Rota da imagem do impresso", () => {
  it("depósito do Treino: content-hub", () => {
    expect(DUPLA_PRINTS_BUCKET).toBe("content-hub");
    expect(duplaStorage("dev").signedUrl).toBeUndefined();
  });

  it("sem token 401; ids inválidos 400; sem imagem 404; recusa do banco 403 com a mensagem; com imagem, link assinado de 600 s", async () => {
    expect(await get(`${signed}/rooms/${SALA}/prints/p1/link`, null)).toMatchObject({ status: 401, body: { error: "Entre na sua conta." } });
    expect(await get(`${signed}/rooms/${SALA}/prints/p1/link`, "tok-outro")).toMatchObject({ status: 401 });
    const antes = chamadas.length;
    for (const url of [
      `${signed}/rooms/nao-e-uuid/prints/p1/link`,
      `${signed}/rooms/${SALA}/prints/${"x".repeat(81)}/link`,
      `${signed}/rooms/${SALA}/prints/a.b/link`,
      `${signed}/rooms/${SALA}/prints/%2E%2E%2Fsegredo/link`,
      `${signed}/rooms/${SALA}/prints/p%201/file`,
    ]) {
      expect(await get(url), url).toMatchObject({ status: 400, body: { error: "Impresso inválido." } });
    }
    expect(chamadas.length).toBe(antes); // nada chegou ao banco
    expect(await get(`${signed}/rooms/${SALA}/prints/semimagem/link`)).toMatchObject({ status: 404, body: { error: "Impresso sem imagem." } });
    expect(await get(`${signed}/rooms/${SALA}/prints/d9/link`)).toMatchObject({ status: 403, body: { error: "Impresso não liberado." } });
    const tecnico = await get(`${signed}/rooms/${SALA}/prints/falha/link`);
    expect(tecnico.status).toBe(403);
    expect(JSON.stringify(tecnico.body)).not.toMatch(/app_dupla|permission/);
    const ok = await get(`${signed}/rooms/${SALA}/prints/candidate_sheet/link`);
    expect(ok).toMatchObject({ status: 200, body: { url: "https://deposito.test/dupla/a1.png?expira=600" } });
    expect(assinadas.at(-1)).toEqual(["dupla/a1.png", 600]);
    expect(chamadas.at(-1)).toEqual({ user: "ana", fn: "app_dupla_print_path", args: { p_room_id: SALA, p_pressing_id: "candidate_sheet" } });
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
  });

  it("desenvolvimento: link nulo e o arquivo pela rota /file sem cache e sem nome de arquivo", async () => {
    expect(await get(`${dev}/rooms/${SALA}/prints/i1/link`)).toMatchObject({ status: 200, body: { url: null } });
    const f = await get(`${dev}/rooms/${SALA}/prints/i1/file`);
    expect(f.status).toBe(200);
    expect(Buffer.compare(f.body as Buffer, PNG)).toBe(0);
    expect(f.headers.get("content-type")).toBe("image/png");
    expect(f.headers.get("cache-control")).toBe("private, no-store");
    expect(f.headers.get("content-disposition") ?? "").not.toMatch(/filename/i);
    expect((await get(`${dev}/rooms/${SALA}/prints/jpeg/file`)).headers.get("content-type")).toBe("image/jpeg");
    expect((await get(`${dev}/rooms/${SALA}/prints/outro/file`)).headers.get("content-type")).toBe("application/octet-stream");
    expect(await get(`${dev}/rooms/${SALA}/prints/semimagem/file`)).toMatchObject({ status: 404, body: { error: "Impresso sem imagem." } });
    expect(await get(`${dev}/rooms/${SALA}/prints/d9/file`)).toMatchObject({ status: 403, body: { error: "Impresso não liberado." } });
    expect(await get(`${dev}/rooms/${SALA}/prints/i1/file`, null)).toMatchObject({ status: 401 });
  });

  it("sem banco configurado: 503 com o aviso", async () => {
    expect(await get(`${semBanco}/rooms/${SALA}/prints/i1/link`)).toMatchObject({ status: 503, body: { error: "Servidor sem banco configurado." } });
  });
});
