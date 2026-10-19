// @vitest-environment node
/**
 * Treino sozinho · tarefa S3: rota /api/dupla/solo/:attemptId/prints/:pressingId/{link,file} (imagem do impresso).
 * Mesmo código da sala (printLink/printFile), mas chamando app_fase2_print_path(p_attempt_id, p_pressing_id) como a pessoa.
 * Banco e depósito simulados (como duplaImpressoRota.test.ts) e, no fim, o banco de verdade (PGlite) para o impresso fechado.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { localStorageDir, type ContentDb, type Identity, type Storage } from "../../server/contentHub/infra";
import { createDuplaRouter } from "../../server/dupla/router";
import { addStation, caminhoImpresso, openDuplaDb, stationAssets, STATION, U, type DuplaDb } from "./helpers/duplaDb";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dupla-solo-impresso-"));
const TENTATIVA = "22222222-2222-4222-8222-222222222222";
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
    if (p === "fechado") throw new Error("Impresso não liberado.");
    if (p === "falha") throw new Error("permission denied for function app_fase2_print_path");
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

let signed = "";
let dev = "";
let semBanco = "";
beforeAll(async () => {
  const local = localStorageDir(path.join(tmp, "files"));
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

describe("Rota da imagem do impresso do treino sozinho", () => {
  it("sem token 401; ids inválidos 400; sem imagem 404; recusa do banco 403 com a mensagem; com imagem, link assinado de 600 s", async () => {
    expect(await get(`${signed}/solo/${TENTATIVA}/prints/p1/link`, null)).toMatchObject({ status: 401, body: { error: "Entre na sua conta." } });
    expect(await get(`${signed}/solo/${TENTATIVA}/prints/p1/link`, "tok-outro")).toMatchObject({ status: 401 });
    const antes = chamadas.length;
    for (const url of [
      `${signed}/solo/nao-e-uuid/prints/p1/link`,
      `${signed}/solo/${TENTATIVA}/prints/${"x".repeat(81)}/link`,
      `${signed}/solo/${TENTATIVA}/prints/a.b/link`,
      `${signed}/solo/${TENTATIVA}/prints/%2E%2E%2Fsegredo/link`,
      `${signed}/solo/${TENTATIVA}/prints/p%201/file`,
    ]) {
      expect(await get(url), url).toMatchObject({ status: 400, body: { error: "Impresso inválido." } });
    }
    expect(chamadas.length).toBe(antes); // nada chegou ao banco
    expect(await get(`${signed}/solo/${TENTATIVA}/prints/semimagem/link`)).toMatchObject({ status: 404, body: { error: "Impresso sem imagem." } });
    expect(await get(`${signed}/solo/${TENTATIVA}/prints/fechado/link`)).toMatchObject({ status: 403, body: { error: "Impresso não liberado." } });
    const tecnico = await get(`${signed}/solo/${TENTATIVA}/prints/falha/link`);
    expect(tecnico.status).toBe(403);
    expect(JSON.stringify(tecnico.body)).not.toMatch(/app_fase2|permission/);
    const ok = await get(`${signed}/solo/${TENTATIVA}/prints/p2/link`);
    expect(ok).toMatchObject({ status: 200, body: { url: "https://deposito.test/dupla/a1.png?expira=600" } });
    expect(assinadas.at(-1)).toEqual(["dupla/a1.png", 600]);
    expect(chamadas.at(-1)).toEqual({ user: "ana", fn: "app_fase2_print_path", args: { p_attempt_id: TENTATIVA, p_pressing_id: "p2" } });
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
  });

  it("impresso ainda fechado não gera link nem arquivo", async () => {
    expect(await get(`${signed}/solo/${TENTATIVA}/prints/fechado/link`)).toMatchObject({ status: 403 });
    expect(await get(`${dev}/solo/${TENTATIVA}/prints/fechado/file`)).toMatchObject({ status: 403 });
    expect(assinadas.every(([k]) => k === "dupla/a1.png")).toBe(true);
  });

  it("desenvolvimento: link nulo e o arquivo pela rota /file sem cache e sem nome de arquivo", async () => {
    expect(await get(`${dev}/solo/${TENTATIVA}/prints/p1/link`)).toMatchObject({ status: 200, body: { url: null } });
    const f = await get(`${dev}/solo/${TENTATIVA}/prints/p1/file`);
    expect(f.status).toBe(200);
    expect(Buffer.compare(f.body as Buffer, PNG)).toBe(0);
    expect(f.headers.get("content-type")).toBe("image/png");
    expect(f.headers.get("cache-control")).toBe("private, no-store");
    expect(f.headers.get("content-disposition") ?? "").not.toMatch(/filename/i);
    expect((await get(`${dev}/solo/${TENTATIVA}/prints/jpeg/file`)).headers.get("content-type")).toBe("image/jpeg");
    expect((await get(`${dev}/solo/${TENTATIVA}/prints/outro/file`)).headers.get("content-type")).toBe("application/octet-stream");
    expect(await get(`${dev}/solo/${TENTATIVA}/prints/semimagem/file`)).toMatchObject({ status: 404, body: { error: "Impresso sem imagem." } });
    expect(await get(`${dev}/solo/${TENTATIVA}/prints/p1/file`, null)).toMatchObject({ status: 401 });
    expect(await get(`${dev}/solo/nao-e-uuid/prints/p1/file`)).toMatchObject({ status: 400, body: { error: "Impresso inválido." } });
  });

  it("sem banco configurado: 503 com o aviso", async () => {
    expect(await get(`${semBanco}/solo/${TENTATIVA}/prints/p1/link`)).toMatchObject({ status: 503, body: { error: "Servidor sem banco configurado." } });
  });

  it("a rota da sala continua igual (app_dupla_print_path com p_room_id)", async () => {
    const ok = await get(`${signed}/rooms/${SALA}/prints/candidate_sheet/link`);
    expect(ok).toMatchObject({ status: 200, body: { url: "https://deposito.test/dupla/a1.png?expira=600" } });
    expect(chamadas.at(-1)).toEqual({ user: "ana", fn: "app_dupla_print_path", args: { p_room_id: SALA, p_pressing_id: "candidate_sheet" } });
    expect(await get(`${signed}/rooms/nao-e-uuid/prints/p1/link`)).toMatchObject({ status: 400, body: { error: "Impresso inválido." } });
    expect(await get(`${dev}/rooms/${SALA}/prints/i1/link`)).toMatchObject({ status: 200, body: { url: null } });
    // a tentativa do sozinho não abre pela rota da sala e a sala não abre pela do sozinho: cada rota chama a sua função
    await get(`${signed}/solo/${SALA}/prints/p1/link`);
    expect(chamadas.at(-1)?.fn).toBe("app_fase2_print_path");
  });
});

describe("Impresso do treino sozinho com o banco de verdade", () => {
  let d: DuplaDb;
  let real: ContentDb;
  let url = "";
  let server: Server;
  const ASSET = "11111111-1111-4111-8111-111111111111";
  const P2 = caminhoImpresso("p2"); // caminho opaco (014200)

  beforeAll(async () => {
    d = await openDuplaDb();
    await addStation(d.db, { ...STATION, pressing_assets: { p2: { asset_id: ASSET } } });
    await stationAssets(d.db, [{ id: ASSET, storage_path: P2 }]);
    real = {
      mode: "dev",
      async service() {
        throw new Error("não usado");
      },
      async asUser<T>(user: Identity, fn: string, args: Record<string, unknown> = {}) {
        return d.rpc<T>(user.id, fn, args);
      },
      async authenticate(req) {
        const t = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
        return t === "tok-admin" ? { id: U.admin, email: null } : t === "tok-ana" ? { id: U.ana, email: null } : null;
      },
    };
    const app = express();
    app.use("/api/dupla", createDuplaRouter({ db: real, storage: signedStorage }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        url = `http://127.0.0.1:${(server.address() as any).port}/api/dupla`;
        resolve();
      });
    });
  }, 300_000);
  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await d?.db.close();
  });

  it("fechado: 403 do banco; depois de aberto: link de 600 s; sem imagem 404; treino de outra pessoa 403", async () => {
    const p = await d.rpc(U.admin, "app_fase2_start", { p_station_id: STATION.id });
    await d.rpc(U.admin, "app_fase2_begin", { p_attempt_id: p.attempt_id });
    const rota = (pressing: string, token = "tok-admin") => get(`${url}/solo/${p.attempt_id}/prints/${pressing}/link`, token);
    expect(await rota("p2")).toMatchObject({ status: 403, body: { error: "Impresso não liberado." } });
    await d.rpc(U.admin, "app_fase2_open_pressing", { p_attempt_id: p.attempt_id, p_pressing_id: "p2" });
    expect(await rota("p2")).toMatchObject({ status: 200, body: { url: `https://deposito.test/${P2}?expira=600` } });
    await d.rpc(U.admin, "app_fase2_open_pressing", { p_attempt_id: p.attempt_id, p_pressing_id: "p1" });
    expect(await rota("p1")).toMatchObject({ status: 404, body: { error: "Impresso sem imagem." } });
    expect((await rota("p2", "tok-ana")).status).toBe(403); // a aluna não entra no treino da equipe
  });
});
