/**
 * Rotas /api/content-hub/visual (Central de Conteúdo › Materiais visuais). Só a equipe (administrador ou editor).
 * Gravar passa pelo servidor (validação única em src/shared/visualMaterials, a mesma do comando do administrador);
 * as leituras do painel usam as funções app_ch_visual_* com o token da própria pessoa.
 *
 *   POST /materials                 { input, generate?, note? }  material novo (generate: já entra na fila)
 *   PUT  /materials/:id             { input, generate?, note? }  versão nova (a anterior continua guardada)
 *   POST /materials/:id/duplicate                                 cópia como rascunho (flashcard ganha card_id novo)
 *   POST /materials/:id/regenerate  { version? }                  gerar de novo a versão atual (ou a indicada)
 *   POST /assets                    imagem PNG, JPEG ou WebP (corpo bruto, até 4 MB) para a ilustração
 *   GET  /assets/:name              imagem enviada (prévia)
 *   GET  /files/:id                 arquivo gerado (PDF ou PNG); ?inline=1 abre no navegador
 */
import crypto from "crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { visualFileName } from "../../../src/shared/visualMaterials";
import type { Identity } from "../infra";
import type { PipelineDeps } from "../pipeline";
import { assetKey, duplicateVisualMaterial, regenerateVisualMaterial, saveVisualMaterial, VisualValidationError } from "./service";
import { ACCESS_CHECK_FAILED, shown } from "../../auth/friendlyError";

type Authed = Request & { user?: Identity };

const MAX_IMAGE_MB = 4; // a Vercel limita o corpo da requisição a 4,5 MB
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const forbidden = (error: unknown) => /restrito|sem acesso|administrador|42501|Acesso/i.test(message(error));
const notFound = (error: unknown) => /não encontrad|P0002/i.test(message(error));

/** Tipo e tamanho da imagem pela assinatura do arquivo (não pelo nome nem pelo cabeçalho da requisição). */
export function imageInfo(buf: Buffer): { mime: string; ext: "png" | "jpg" | "webp"; width: number; height: number } | null {
  if (buf.length > 24 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && buf.subarray(12, 16).toString("latin1") === "IHDR") {
    return { mime: "image/png", ext: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { mime: "image/jpeg", ext: "jpg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  if (buf.length > 30 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    const chunk = buf.subarray(12, 16).toString("latin1");
    if (chunk === "VP8 ") return { mime: "image/webp", ext: "webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { mime: "image/webp", ext: "webp", width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { mime: "image/webp", ext: "webp", width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  return null;
}

export function createVisualRouter(deps: PipelineDeps | null, opts: { pending?: string | null } = {}) {
  const router = express.Router();

  router.use(async (req: Authed, res: Response, next: NextFunction) => {
    if (!deps) return res.status(503).json({ error: opts.pending ?? "Central de Conteúdo não configurada no servidor." });
    try {
      const user = await deps.db.authenticate(req);
      if (!user) return res.status(401).json({ error: "Entre na sua conta." });
      req.user = user;
      const me = await deps.db.asUser<{ staff: boolean } | null>(user, "app_ch_whoami");
      if (!me?.staff) return res.status(403).json({ error: "Materiais visuais: acesso restrito à equipe (administrador ou editor)." });
      next();
    } catch (error) {
      res.status(forbidden(error) ? 403 : 500).json({ error: forbidden(error) ? shown(error) : ACCESS_CHECK_FAILED });
    }
  });

  const fail = (res: Response, error: unknown) => {
    if (error instanceof VisualValidationError) return res.status(400).json({ error: error.message, problems: error.problems });
    res.status(forbidden(error) ? 403 : notFound(error) ? 404 : 400).json({ error: shown(error) });
  };
  const body = (req: Request) => (req.body && typeof req.body === "object" ? req.body : {}) as { input?: unknown; generate?: unknown; note?: unknown; version?: unknown };
  const json = express.json({ limit: "256kb" });

  router.post("/materials", json, async (req: Authed, res) => {
    try {
      const b = body(req);
      res.status(201).json(await saveVisualMaterial(deps!.db, req.user!.id, b.input, { generate: b.generate === true, note: b.note ? String(b.note) : null }));
    } catch (error) {
      fail(res, error);
    }
  });

  router.put("/materials/:id", json, async (req: Authed, res) => {
    try {
      const b = body(req);
      res.json(await saveVisualMaterial(deps!.db, req.user!.id, b.input, { materialId: String(req.params.id), generate: b.generate === true, note: b.note ? String(b.note) : null }));
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/materials/:id/duplicate", async (req: Authed, res) => {
    try {
      res.status(201).json(await duplicateVisualMaterial(deps!.db, req.user!.id, String(req.params.id)));
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/materials/:id/regenerate", json, async (req: Authed, res) => {
    try {
      const v = body(req).version;
      res.json(await regenerateVisualMaterial(deps!.db, req.user!.id, String(req.params.id), v == null ? null : Number(v)));
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/assets", express.raw({ type: ["image/png", "image/jpeg", "image/webp", "application/octet-stream"], limit: `${MAX_IMAGE_MB}mb` }), async (req: Authed, res) => {
    try {
      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: "Envie a imagem no corpo da requisição." });
      const info = imageInfo(buf);
      if (!info) return res.status(415).json({ error: "Imagem não reconhecida: envie PNG, JPEG ou WebP." });
      if (info.width < 16 || info.height < 16 || info.width > 6000 || info.height > 6000)
        return res.status(400).json({ error: `Imagem com ${info.width}×${info.height} px: use entre 16 e 6000 px de cada lado.` });
      const name = `${crypto.createHash("sha256").update(buf).digest("hex")}.${info.ext}`;
      const key = assetKey(name);
      if (!(await deps!.storage.exists(key))) await deps!.storage.put(key, buf, info.mime);
      await deps!.db.service("ch_worker_visual_register_asset", {
        p_actor: req.user!.id,
        p_asset: { name, mime: info.mime, width: info.width, height: info.height, bytes: buf.length, storage_path: key },
      });
      res.status(201).json({ name, mime: info.mime, width: info.width, height: info.height, bytes: buf.length });
    } catch (error: any) {
      if (error?.type === "entity.too.large") return res.status(413).json({ error: `Imagem acima de ${MAX_IMAGE_MB} MB.` });
      fail(res, error);
    }
  });

  router.get("/assets/:name", async (req: Authed, res) => {
    try {
      const a = await deps!.db.asUser<{ storage_path: string; mime: string }>(req.user!, "app_ch_visual_asset", { p_name: String(req.params.name) });
      const data = await deps!.storage.get(a.storage_path);
      res.setHeader("Content-Type", a.mime);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(data);
    } catch (error) {
      fail(res, error);
    }
  });

  router.get("/files/:id", async (req: Authed, res) => {
    try {
      const f = await deps!.db.asUser<{ storage_path: string; format: string; side: string; card_id: string | null; model: string; title: string; version: number; render_status: string }>(
        req.user!,
        "app_ch_visual_file",
        { p_file_id: String(req.params.id) }
      );
      // arquivo reprovado na conferência (texto cortado, fonte errada…) não sai para uso
      if (f.render_status !== "ready") return res.status(409).json({ error: "Arquivo reprovado na conferência ou desatualizado: ajuste o conteúdo e gere de novo." });
      const data = await deps!.storage.get(f.storage_path);
      const name = visualFileName({ model: f.model, card_id: f.card_id, title: f.title }, f.version, f.side, f.format);
      res.setHeader("Content-Type", f.format === "pdf" ? "application/pdf" : "image/png");
      res.setHeader("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(data);
    } catch (error) {
      fail(res, error);
    }
  });

  return router;
}
