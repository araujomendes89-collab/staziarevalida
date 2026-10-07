/**
 * Materiais visuais: a MESMA rotina para o formulário (rota /api/content-hub/visual) e para o comando do
 * administrador (scripts/content-hub/material-visual.ts):
 *
 *   saveVisualMaterial   valida (src/shared/visualMaterials) → grava a versão (ch_worker_visual_save) → põe na fila
 *   generateVisualVersion  lê a versão → gera PNG/PDF (render.ts) → guarda no depósito → grava o conjunto de
 *                          arquivos de uma vez (ch_worker_visual_save_files) com o resultado da conferência
 *
 * A geração roda no processamento (fila ch_jobs, etapa visual_render): Cloud Run em produção; no desenvolvimento,
 * o próprio servidor. Erro de geração nunca apaga o rascunho: a versão fica com a situação e o motivo.
 */
import crypto from "crypto";
import { VISUAL_TEMPLATE_VERSION, validateVisualInput, type VisualContent, type VisualProblem } from "../../../src/shared/visualMaterials";
import type { ContentDb, Storage } from "../infra";
import type { Renderer } from "../render";
import { renderVisualContent, VisualRenderUnavailable, type VisualCheck } from "./render";

export interface VisualDeps {
  db: ContentDb;
  storage: Storage;
  renderer?: Renderer | null;
  python?: string;
  log?: (message: string) => void;
}

export class VisualValidationError extends Error {
  status = 400;
  constructor(public problems: VisualProblem[]) {
    super(problems.map((p) => p.message).join(" "));
  }
}

export interface VisualSaveResult {
  material_id: string;
  version_id: string;
  version: number;
  card_id: string | null;
  created: boolean;
  unchanged: boolean;
  queued: boolean;
  warnings: VisualProblem[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida e grava (material novo ou versão nova). Com generate, a geração entra na fila. */
export async function saveVisualMaterial(
  db: ContentDb,
  actorId: string,
  input: unknown,
  opts: { materialId?: string | null; generate?: boolean; note?: string | null } = {}
): Promise<VisualSaveResult> {
  if (opts.materialId && !UUID.test(opts.materialId)) throw new VisualValidationError([{ field: "material", message: "Material inválido." }]);
  const v = validateVisualInput(input);
  if (!v.ok) throw new VisualValidationError(v.problems);
  const r = await db.service<Omit<VisualSaveResult, "warnings">>("ch_worker_visual_save", {
    p_actor: actorId,
    p_material_id: opts.materialId ?? null,
    p_content: v.content,
    p_generate: Boolean(opts.generate),
    p_template: VISUAL_TEMPLATE_VERSION,
    p_note: opts.note ? String(opts.note).slice(0, 300) : null,
  });
  return { ...r, warnings: v.warnings };
}

export function duplicateVisualMaterial(db: ContentDb, actorId: string, materialId: string) {
  if (!UUID.test(materialId)) throw new VisualValidationError([{ field: "material", message: "Material inválido." }]);
  return db.service<VisualSaveResult & { duplicated_from: string }>("ch_worker_visual_duplicate", { p_actor: actorId, p_material_id: materialId });
}

export function regenerateVisualMaterial(db: ContentDb, actorId: string, materialId: string, version?: number | null) {
  if (!UUID.test(materialId)) throw new VisualValidationError([{ field: "material", message: "Material inválido." }]);
  const v = version == null ? null : Math.trunc(Number(version));
  return db.service<{ material_id: string; version_id: string; version: number; job_id: string }>("ch_worker_visual_regenerate", {
    p_actor: actorId,
    p_material_id: materialId,
    p_version: v && v > 0 ? v : null,
    p_template: VISUAL_TEMPLATE_VERSION,
  });
}

// ---------------------------------------------------------------------------- imagens das ilustrações
export const assetKey = (name: string) => `visual/assets/${name}`;
const MIME_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

async function loadImages(storage: Storage, c: VisualContent): Promise<Record<string, string>> {
  const name = c.ilustracao?.tipo === "imagem" ? c.ilustracao.imagem : "";
  if (!name) return {};
  const data = await storage.get(assetKey(name));
  return { [name]: `data:${MIME_BY_EXT[name.split(".").pop() ?? ""] ?? "image/png"};base64,${data.toString("base64")}` };
}

// ---------------------------------------------------------------------------- geração
export interface VisualJobRow {
  version_id: string;
  material_id: string;
  version: number;
  model: string;
  card_id: string | null;
  batch_order: number;
  specialty_key: string;
  specialty_label: string;
  title: string;
  content: VisualContent;
  render_status: string;
}

const sha256 = (data: Buffer) => crypto.createHash("sha256").update(data).digest("hex");

/**
 * Gera e grava os arquivos de uma versão. Sem gerador (Chromium/PyMuPDF) lança VisualRenderUnavailable e a versão
 * volta para "na fila" (o trabalho fica pendente, sem gastar tentativa). Outros erros: versão "falhou", com o motivo.
 */
export async function generateVisualVersion(deps: VisualDeps, versionId: string): Promise<{ status: "ready" | "check_failed"; check: VisualCheck; files: number }> {
  const job = await deps.db.service<VisualJobRow | null>("ch_worker_visual_job", { p_version_id: versionId });
  if (!job) throw new Error("Versão do material não encontrada.");
  try {
    if (!deps.renderer?.newPage) throw new VisualRenderUnavailable("Gerador de PDF (Playwright/Chromium) indisponível neste processamento.");
    await deps.db.service("ch_worker_visual_status", { p_version_id: versionId, p_status: "rendering" });
    const images = await loadImages(deps.storage, job.content);
    const result = await renderVisualContent(deps.renderer, job.content, { images, python: deps.python });
    const files = [];
    for (const f of result.files) {
      const hash = sha256(f.data);
      const key = `visual/${job.material_id}/v${job.version}/${hash.slice(0, 16)}-${f.side}.${f.format}`;
      await deps.storage.put(key, f.data, f.format === "pdf" ? "application/pdf" : "image/png");
      files.push({
        format: f.format,
        side: f.side,
        pages: f.pages,
        width: f.width,
        height: f.height,
        storage_path: key,
        sha256: hash,
        bytes: f.data.length,
        card_id: job.card_id ?? "",
        specialty_key: job.specialty_key,
        batch_order: job.batch_order,
      });
    }
    const saved = await deps.db.service<{ saved: number; removed: string[] | null }>("ch_worker_visual_save_files", {
      p_version_id: versionId,
      p_files: files,
      p_check: result.check,
      p_template: VISUAL_TEMPLATE_VERSION,
    });
    if (saved.removed?.length && deps.storage.remove) await deps.storage.remove(saved.removed).catch(() => undefined);
    deps.log?.(`[central] material visual ${job.card_id ?? job.material_id} v${job.version}: ${result.check.ok ? "pronto" : `reprovado na conferência (${result.check.problems.length})`}`);
    return { status: result.check.ok ? "ready" : "check_failed", check: result.check, files: files.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const waiting = error instanceof VisualRenderUnavailable;
    await deps.db
      .service("ch_worker_visual_status", { p_version_id: versionId, p_status: waiting ? "queued" : "failed", p_error: (waiting ? "Aguardando o processamento: " : "") + message })
      .catch(() => undefined);
    throw error;
  }
}

/** Trabalho da fila (etapa visual_render): scope_key = "visual:<id da versão>". */
export function visualVersionOf(job: { scope_key: string }): string {
  const id = job.scope_key.startsWith("visual:") ? job.scope_key.slice("visual:".length) : "";
  if (!UUID.test(id)) throw new Error("Trabalho de material visual sem versão.");
  return id;
}

export { VisualRenderUnavailable };
