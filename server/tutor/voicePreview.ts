/**
 * VOZES DO NEXUS no painel (/api/tutor/voices): audição e aprovação das vozes oficiais, no mesmo servidor do Tutor.
 *
 * - Só administrador ouve; só quem está em TUTOR_VOICE_APPROVERS (e-mails, no servidor) aprova ou revoga.
 * - O navegador manda só o professor e o cenário: nunca texto, voice_id, parâmetros nem a versão da voz.
 * - Cada audição fica registrada pelo servidor (também quando o áudio sai do cache); aprovar exige todos os cenários daquela
 *   versão ouvidos nas últimas 24 h (o banco confere de novo). A versão junta voz, modelo, formato, cenários e direção.
 * - Ao aprovar, a "Apresentação" vai para o depósito tutor-voice-samples/<voz>/<versão>.mp3: é ela que toca no "Ouvir" do aluno.
 * - Audições entram no registro de uso como tutor_tts_audicao, fora dos limites e dos tetos.
 */
import express, { type Request } from "express";
import path from "path";
import { localStorageDir, supabaseStorage, type ContentDb, type Identity, type Storage } from "../contentHub/infra";
import type { TutorDeps } from "./engine";
import { elevenSynth } from "./elevenlabsTts";
import { elevenLabsReadiness, officialVoiceForPersonality, type Approval, type ReadinessRow } from "./officialVoices";
import { tutorSettings } from "./settings";
import { OFFICIAL_VOICES, VOICE_SCENARIOS, scenariosFor, type OfficialVoice, type VoiceScenario } from "../../src/shared/tutor/officialVoices";

export const SAMPLE_BUCKET = "tutor-voice-samples";
export const samplePath = (voice: OfficialVoice, fingerprint: string) => `${voice}/${fingerprint}.mp3`;

/** Depósito das amostras aprovadas: bucket privado no Supabase; pasta .data/tutor-voice-samples no desenvolvimento. */
export function tutorVoiceSamplesStorage(mode: ContentDb["mode"]): Storage {
  return mode === "supabase" ? supabaseStorage(SAMPLE_BUCKET) : localStorageDir(process.env.TUTOR_VOICE_SAMPLES_DIR || path.join(process.cwd(), ".data/tutor-voice-samples"));
}

/** Quem pode aprovar e revogar: e-mails em TUTOR_VOICE_APPROVERS, separados por vírgula. */
export function voiceApprovers(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.TUTOR_VOICE_APPROVERS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export interface VoicePanel {
  model: string;
  keyConfigured: boolean;
  pending: string | null;
  approver: boolean;
  rows: (ReadinessRow & { approved_at: string | null; scenarios: { id: VoiceScenario; label: string; heard: boolean }[]; can_approve: boolean })[];
}

interface PanelData {
  approvals: Partial<Record<OfficialVoice, Approval & { revoked_at: string | null }>>;
  heard: { voice: string; fingerprint: string; scenario: string }[];
}

type Admin = Request & { voiceAdmin?: Identity };

const NO_APPROVER = "Só quem está na lista de aprovação pode aprovar ou revogar.";
const NOT_HEARD = "Ouça todos os cenários desta voz antes de aprovar.";

export function createVoicePreviewRouter(deps: TutorDeps | null, env: NodeJS.ProcessEnv = process.env) {
  const router = express.Router();
  const recent = new Map<string, { started: number; count: number }>();
  const busy = new Set<string>();
  const cache = new Map<string, Buffer>(); // no máximo 20 áudios curtos de roteiro fixo
  const voiceEnv = () => deps!.elevenEnv ?? env;

  router.use(async (req: Admin, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!deps) return res.status(503).json({ error: "Vozes do Nexus sem servidor configurado." });
    try {
      const user = await deps.db.authenticate(req);
      if (!user) return res.status(401).json({ error: "Entre na sua conta StaziaMed." });
      try {
        await deps.db.asUser(user, "app_admin_tutor_config");
      } catch {
        return res.status(403).json({ error: "Somente administradores podem testar as vozes oficiais." });
      }
      req.voiceAdmin = user;
      next();
    } catch {
      res.status(503).json({ error: "Não foi possível verificar sua sessão." });
    }
  });
  router.use(express.json({ limit: "2kb" }));

  const isApprover = (user: Identity) => voiceApprovers(env).includes((user.email ?? "").trim().toLowerCase());

  async function panelOf(user: Identity): Promise<VoicePanel> {
    const data = await deps!.db.service<PanelData>("ch_worker_tutor_voice_panel", { p_user: user.id });
    const approvals = Object.fromEntries(Object.entries(data?.approvals ?? {}).filter(([, a]) => a && !a.revoked_at)) as Partial<Record<OfficialVoice, Approval>>;
    const r = elevenLabsReadiness(voiceEnv(), approvals);
    const approver = isApprover(user);
    return {
      model: r.model, keyConfigured: r.keyConfigured, pending: r.pending, approver,
      rows: r.rows.map((row) => {
        const scenarios = scenariosFor(row.id).map((id) => ({
          id, label: VOICE_SCENARIOS[id].label,
          heard: (data?.heard ?? []).some((h) => h.voice === row.id && h.fingerprint === row.fingerprint && h.scenario === id),
        }));
        return { ...row, approved_at: row.approved ? approvals[row.id]?.approved_at ?? null : null, scenarios, can_approve: approver && row.ready && !row.approved && scenarios.every((s) => s.heard) };
      }),
    };
  }

  /** Áudio de um cenário: do cache ou gerado agora (gerar entra no registro como audição). */
  async function scenarioAudio(user: Identity, id: OfficialVoice, row: ReadinessRow, scenario: VoiceScenario): Promise<Buffer> {
    const key = `${row.fingerprint}:${scenario}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const provider = elevenSynth(deps!);
    if (!provider) throw new Error("Voz oficial indisponível.");
    const sample = VOICE_SCENARIOS[scenario];
    const text = sample.text ?? OFFICIAL_VOICES[id].sample;
    const out = await provider.synthesize(text, { personality: id, direction: { emotion: sample.emotion, intensity: sample.intensity } });
    const settings = await tutorSettings(deps!);
    await deps!.db.service("ch_worker_tutor_ledger", {
      p_user: user.id, p_session_id: null,
      p_entry: { feature: "tutor_tts_audicao", provider: provider.name, model: provider.model, characters: text.length,
                 estimated_cost_usd: Math.round((text.length / 1000) * settings.tts_price_per_1k_chars_usd * 1e6) / 1e6, meta: { voice: id, scenario } },
    }).catch((e) => deps!.log?.(`[tutor] vozes: registro da audição falhou: ${(e as Error).message.slice(0, 120)}`));
    if (cache.size >= 20) cache.delete(cache.keys().next().value!);
    cache.set(key, out.audio);
    return out.audio;
  }

  const onlyPersonality = (body: unknown) => Boolean(body) && typeof body === "object" && Object.keys(body as object).every((k) => k === "personality");

  router.get("/", async (req: Admin, res) => {
    try {
      res.json(await panelOf(req.voiceAdmin!));
    } catch (error) {
      res.status(503).json({ error: (error as Error).message.slice(0, 160) });
    }
  });

  router.post("/preview", async (req: Admin, res) => {
    const body = req.body;
    // Sem texto, chave, ID de fornecedor, emoção ou parâmetros arbitrários enviados pelo navegador.
    if (!body || Object.keys(body).some((key) => !["personality", "scenario"].includes(key))) return res.status(400).json({ error: "Informe somente personalidade e cenário de teste." });
    const id = officialVoiceForPersonality(body.personality);
    const scenario = body.scenario as VoiceScenario;
    if (!id || typeof scenario !== "string" || !scenariosFor(id).includes(scenario)) return res.status(400).json({ error: "Voz ou cenário de teste inválido." });
    const user = req.voiceAdmin!;
    const now = Date.now();
    for (const [key, value] of recent) if (now - value.started >= 60_000) recent.delete(key);
    const record = recent.get(user.id) ?? { started: now, count: 0 };
    if (record.count >= 12 || busy.has(user.id)) return res.status(429).json({ error: "Aguarde a audição atual ou tente novamente em um minuto." });
    if (recent.size >= 1000 && !recent.has(user.id)) return res.status(429).json({ error: "Muitas audições simultâneas. Tente novamente em um minuto." });
    recent.set(user.id, { ...record, count: record.count + 1 });
    const row = elevenLabsReadiness(voiceEnv()).rows.find((item) => item.id === id)!;
    if (!row.ready) return res.status(503).json({ error: row.pending });
    busy.add(user.id);
    try {
      const audio = await scenarioAudio(user, id, row, scenario);
      // a audição desta versão conta para a aprovação (registrada pelo servidor, nunca pelo navegador)
      await deps!.db.service("ch_worker_tutor_voice_listened", { p_user: user.id, p_voice: id, p_fingerprint: row.fingerprint, p_scenario: scenario });
      res.type("audio/mpeg").send(audio);
    } catch {
      res.status(502).json({ error: "A audição falhou. Confira a chave, as permissões, o voice_id e os créditos no painel do fornecedor." });
    } finally {
      busy.delete(user.id);
    }
  });

  router.post("/approve", async (req: Admin, res) => {
    if (!onlyPersonality(req.body)) return res.status(400).json({ error: "Informe somente o professor." });
    const user = req.voiceAdmin!;
    if (!isApprover(user)) return res.status(403).json({ error: NO_APPROVER });
    const id = officialVoiceForPersonality(req.body.personality);
    if (!id) return res.status(400).json({ error: "Voz inválida." });
    try {
      const row = (await panelOf(user)).rows.find((r) => r.id === id)!;
      if (!row.ready) return res.status(409).json({ error: row.pending ?? "A voz não está configurada no servidor." });
      if (!row.scenarios.every((s) => s.heard)) return res.status(409).json({ error: NOT_HEARD });
      if (!deps!.storage) return res.status(503).json({ error: "Depósito das amostras indisponível no servidor." });
      // a Apresentação desta versão vira a amostra do "Ouvir" (do cache ou gerada de novo, como audição)
      const audio = await scenarioAudio(user, id, row, "apresentacao");
      const key = samplePath(id, row.fingerprint);
      await deps!.storage.put(key, audio, "audio/mpeg");
      await deps!.db.service("ch_worker_tutor_voice_approve", { p_user: user.id, p_voice: id, p_fingerprint: row.fingerprint, p_scenarios: scenariosFor(id), p_sample_path: key });
      res.json(await panelOf(user));
    } catch (error) {
      res.status(409).json({ error: (error as Error).message.slice(0, 200) });
    }
  });

  router.post("/revoke", async (req: Admin, res) => {
    if (!onlyPersonality(req.body)) return res.status(400).json({ error: "Informe somente o professor." });
    const user = req.voiceAdmin!;
    if (!isApprover(user)) return res.status(403).json({ error: NO_APPROVER });
    const id = officialVoiceForPersonality(req.body.personality);
    if (!id) return res.status(400).json({ error: "Voz inválida." });
    try {
      await deps!.db.service("ch_worker_tutor_voice_revoke", { p_user: user.id, p_voice: id });
      res.json(await panelOf(user));
    } catch (error) {
      res.status(409).json({ error: (error as Error).message.slice(0, 200) });
    }
  });

  return router;
}
