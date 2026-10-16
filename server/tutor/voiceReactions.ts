/**
 * Ligação do Personality Engine com o banco: a lista de reações que o DONO marcou no painel (tutor_voice_reaction_rules),
 * o interruptor da Durona Explosiva (tutor_explosiva_config) e a escolha do aluno (tutor_explosiva_preferences).
 *
 * Falha fechada: se o banco não responder (ou a migração ainda não existir), nenhuma reação passa e a Explosiva fica desligada
 * — o professor continua falando, só sem marcações. Cache curto por processo (TUTOR_SETTINGS_TTL_MS, padrão 15 s), como settings.ts.
 *
 * Ponto de encaixe do turno de voz (Custom LLM / vt-voz): `planPersonaTurn` devolve a diretiva; o texto da IA passa depois por
 * `renderReply` (voiceReactionFilter.ts) e pela conferência de sempre (safety.ts). O Tutor atual (engine.ts) não muda.
 */
import type { TutorDeps } from "./engine";
import { tutorSettings } from "./settings";
import { personaTurn, resolveProfile, type ExamContext, type ExplosivaChoice, type PersonaDirective, type PersonaMemory, type Signal } from "./personalityEngine";
import { FREQUENCY_LIMITS, REACTION_IDS, type ReactionRule, type VoiceProviderId } from "../../src/shared/tutor/voiceReactions";

export interface ReactionConfig {
  rules: ReactionRule[];
  explosiva_enabled: boolean;
}

export const NO_REACTIONS: ReactionConfig = { rules: [], explosiva_enabled: false };

const PERSONALITIES = new Set(["tranquilo", "direto", "durona"]);
const LEVELS = new Set(["padrao", "n1", "n2", "n3", "n4"]);
const int = (v: unknown, [lo, hi]: readonly [number, number], d: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : d;
};

/** Só o que é regra válida (professor, nível, reação do catálogo); o resto é descartado. */
export function sanitizeRules(raw: unknown): ReactionRule[] {
  if (!Array.isArray(raw)) return [];
  const out: ReactionRule[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    if (!PERSONALITIES.has(String(x.personality)) || !LEVELS.has(String(x.level)) || !REACTION_IDS.includes(x.reaction as never)) continue;
    if (x.level !== "padrao" && x.personality !== "durona") continue;
    out.push({
      personality: x.personality as ReactionRule["personality"], level: x.level as ReactionRule["level"], reaction: x.reaction as ReactionRule["reaction"],
      allowed: x.allowed === true,
      max_per_reply: int(x.max_per_reply, FREQUENCY_LIMITS.per_reply, 1),
      max_per_10: int(x.max_per_10, FREQUENCY_LIMITS.per_10, 2),
    });
  }
  return out;
}

const cache = new WeakMap<object, { at: number; value: ReactionConfig }>();

export async function reactionConfig(deps: Pick<TutorDeps, "db" | "log">): Promise<ReactionConfig> {
  const ttl = Number(process.env.TUTOR_SETTINGS_TTL_MS ?? 15_000);
  const hit = cache.get(deps.db);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  let value = NO_REACTIONS;
  try {
    const raw = await deps.db.service<{ rules?: unknown; explosiva_enabled?: unknown } | null>("ch_worker_tutor_voice_reactions", {});
    value = { rules: sanitizeRules(raw?.rules), explosiva_enabled: raw?.explosiva_enabled === true };
  } catch (error) {
    deps.log?.(`[tutor] reações de voz indisponíveis (nenhuma passa): ${(error as Error).message.slice(0, 120)}`);
  }
  cache.set(deps.db, { at: Date.now(), value });
  return value;
}

export const forgetReactionConfig = (deps: Pick<TutorDeps, "db">) => cache.delete(deps.db);

/** Escolha do aluno para a Durona Explosiva (null = modo não escolhido). Nunca vem do navegador: só do banco. */
export async function explosivaChoice(deps: Pick<TutorDeps, "db" | "log">, userId: string): Promise<ExplosivaChoice | null> {
  try {
    const raw = await deps.db.service<{ level?: string; shouts?: boolean; opt_in_at?: string | null; adult_confirmed_at?: string | null } | null>("ch_worker_tutor_explosiva", { p_user: userId });
    if (!raw || !["n1", "n2", "n3", "n4"].includes(String(raw.level))) return null;
    return { level: raw.level as ExplosivaChoice["level"], shouts: raw.shouts !== false, optIn: Boolean(raw.opt_in_at), adultConfirmed: Boolean(raw.adult_confirmed_at) };
  } catch {
    return null;
  }
}

export interface PlanInput {
  userId: string;
  personality: string;
  provider: VoiceProviderId;
  memory: PersonaMemory | null | undefined;
  facts?: Signal[];
  studentText?: string;
  exam?: ExamContext | null;
}

/** Diretiva do turno com tudo do servidor: teto de palavrão do painel, lista do dono, interruptor e escolha do aluno. */
export async function planPersonaTurn(deps: Pick<TutorDeps, "db" | "log">, input: PlanInput): Promise<PersonaDirective> {
  const [settings, config, choice] = await Promise.all([tutorSettings(deps), reactionConfig(deps), explosivaChoice(deps, input.userId)]);
  const resolved = resolveProfile({ personality: input.personality, explosiva: choice, platform: { maxProfanity: settings.max_profanity, explosivaEnabled: config.explosiva_enabled } });
  return personaTurn({ resolved, memory: input.memory, facts: input.facts, studentText: input.studentText, rules: config.rules, provider: input.provider, exam: input.exam });
}
