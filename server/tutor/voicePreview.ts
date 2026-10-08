import express, { type Request } from "express";
import { createClient } from "@supabase/supabase-js";
import type { ContentDb, Identity } from "../contentHub/infra";
import { OfficialElevenLabsSpeech } from "./elevenlabsTts";
import { elevenLabsReadiness, officialVoiceForPersonality } from "./officialVoices";
import { OFFICIAL_VOICES, VOICE_SCENARIOS, type VoiceScenario } from "../../src/shared/tutor/officialVoices";

type PreviewAuth = Pick<ContentDb, "authenticate" | "asUser">;
/** O laboratório só precisa da chave pública + token do administrador; não usa service_role para a audição. */
export function previewAuth(env: NodeJS.ProcessEnv = process.env): PreviewAuth | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return {
    async authenticate(req) {
      const jwt = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "")?.[1];
      if (!jwt) return null;
      const client = createClient(url, key, { auth: { persistSession: false } });
      const { data, error } = await client.auth.getUser(jwt);
      return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null, jwt };
    },
    async asUser<T>(user: Identity, fn: string) {
      if (fn !== "app_admin_tutor_config") throw new Error("Operação não permitida no laboratório.");
      const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${user.jwt}` } }, auth: { persistSession: false } });
      const { data, error } = await client.rpc(fn);
      if (error) throw new Error("Acesso administrativo necessário.");
      return data as T;
    },
  };
}

/** Montável no servidor normal ou no Vite local; autenticação e papel são conferidos no servidor. */
export function createVoicePreviewRouter(db: PreviewAuth | null, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch) {
  const router = express.Router();
  const recent = new Map<string, { started: number; count: number }>();
  const busy = new Set<string>();
  const cache = new Map<string, Buffer>(); // no máximo 20 áudios curtos de roteiro fixo
  router.use(async (req: Request & { voiceAdmin?: Identity }, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!db) return res.status(503).json({ error: "Autenticação administrativa indisponível no servidor local." });
    try {
      const user = await db.authenticate(req);
      if (!user) return res.status(401).json({ error: "Entre na sua conta StaziaMed." });
      try { await db.asUser(user, "app_admin_tutor_config"); }
      catch { return res.status(403).json({ error: "Somente administradores podem testar as vozes oficiais." }); }
      req.voiceAdmin = user;
      next();
    } catch { res.status(503).json({ error: "Não foi possível verificar sua sessão." }); }
  });
  router.use(express.json({ limit: "2kb" }));
  router.get("/", (_req, res) => res.json(elevenLabsReadiness(env)));
  router.post("/preview", async (req: Request & { voiceAdmin?: Identity }, res) => {
    const body = req.body;
    // Sem texto, chave, ID de fornecedor, emoção ou parâmetros arbitrários enviados pelo navegador.
    if (!body || Object.keys(body).some((key) => !["personality", "scenario"].includes(key))) return res.status(400).json({ error: "Informe somente personalidade e cenário de teste." });
    const id = officialVoiceForPersonality(body.personality);
    const scenario = body.scenario as VoiceScenario;
    if (!id || typeof scenario !== "string" || !Object.hasOwn(VOICE_SCENARIOS, scenario)) return res.status(400).json({ error: "Voz ou cenário de teste inválido." });
    const userId = req.voiceAdmin!.id;
    const now = Date.now();
    for (const [key, value] of recent) if (now - value.started >= 60_000) recent.delete(key);
    const record = recent.get(userId) ?? { started: now, count: 0 };
    if (record.count >= 12 || busy.has(userId)) return res.status(429).json({ error: "Aguarde a audição atual ou tente novamente em um minuto." });
    if (recent.size >= 1000 && !recent.has(userId)) return res.status(429).json({ error: "Muitas audições simultâneas. Tente novamente em um minuto." });
    recent.set(userId, { ...record, count: record.count + 1 });
    const readiness = elevenLabsReadiness(env);
    const row = readiness.rows.find((item) => item.id === id)!;
    if (!row.ready) return res.status(503).json({ error: row.pending });
    const cacheKey = `${row.fingerprint}:${scenario}`;
    const hit = cache.get(cacheKey);
    if (hit) return res.type("audio/mpeg").send(hit);
    busy.add(userId);
    try {
      const sample = VOICE_SCENARIOS[scenario];
      const out = await new OfficialElevenLabsSpeech(env, fetchImpl).synthesize(sample.text ?? OFFICIAL_VOICES[id].sample, {
        personality: id, direction: { emotion: sample.emotion, intensity: sample.intensity },
      });
      if (cache.size >= 20) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, out.audio);
      res.type(out.mime).send(out.audio);
    } catch {
      res.status(502).json({ error: "A audição ElevenLabs falhou. Confira a chave, as permissões, o voice_id e os créditos; não houve troca para voz do aparelho." });
    } finally { busy.delete(userId); }
  });
  return router;
}
