/**
 * Registro dos prompts no banco (texto, schema e hash por versão) e trava por sinalizador.
 * O texto fica no código (revisão por pull request); o banco guarda a cópia imutável do que RODOU, para reproduzir um resultado.
 */
import crypto from "crypto";
import type { ContentDb } from "../infra";
import { PROMPTS } from "./prompts";

export const promptHash = (system: string, schema: unknown) => crypto.createHash("sha256").update(`${system}\n${JSON.stringify(schema)}`).digest("hex");

export interface PromptEntry {
  id: string;
  version: string;
  system: string;
  schema: unknown;
}

/** Grava todas as versões de prompt em uso (idempotente). Devolve quantas eram novas. */
export async function registerPrompts(db: ContentDb, list: PromptEntry[] = Object.values(PROMPTS) as PromptEntry[]): Promise<number> {
  let added = 0;
  for (const p of list) {
    const isNew = await db.service<boolean>("ch_worker_register_prompt", { p_prompt_id: p.id, p_version: p.version, p_hash: promptHash(p.system, p.schema), p_system: p.system, p_schema: p.schema });
    if (isNew) added++;
  }
  return added;
}

const off = (v: string | undefined) => /^(false|0|off|no)$/i.test((v ?? "").trim());

/**
 * IA permitida? O ambiente (CONTENT_LAB_ENABLED / CONTENT_LAB_AI_ENABLED = false) vale mais que o banco;
 * depois valem os sinalizadores `enabled` e `ai_enabled` que o administrador muda no painel.
 */
export async function aiAllowed(db: ContentDb): Promise<{ ok: boolean; why: string }> {
  if (off(process.env.CONTENT_LAB_ENABLED)) return { ok: false, why: "Content Lab desligado no servidor (CONTENT_LAB_ENABLED=false)." };
  if (off(process.env.CONTENT_LAB_AI_ENABLED)) return { ok: false, why: "IA desligada no servidor (CONTENT_LAB_AI_ENABLED=false)." };
  if (!(await db.service<boolean>("ch_worker_flag", { p_key: "enabled" }))) return { ok: false, why: "Content Lab desligado pelo administrador." };
  if (!(await db.service<boolean>("ch_worker_flag", { p_key: "ai_enabled" }))) return { ok: false, why: "IA desligada pelo administrador (sinalizador ai_enabled)." };
  return { ok: true, why: "" };
}

const seen = new WeakSet<object>();
/** Registra os prompts uma vez por conexão de banco (barato de chamar em todo uso de IA). */
export async function registerPromptsOnce(db: ContentDb): Promise<void> {
  if (seen.has(db)) return;
  await registerPrompts(db);
  seen.add(db);
}
