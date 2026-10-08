// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { OFFICIAL_VOICES, VOICE_SCENARIOS } from "../shared/tutor/officialVoices";
import { elevenLabsConfiguration, elevenLabsReadiness, officialVoiceForPersonality, voiceFingerprint } from "../../server/tutor/officialVoices";
import { OfficialElevenLabsSpeech, officialSpeechDirection } from "../../server/tutor/elevenlabsTts";
import { createVoicePreviewRouter } from "../../server/tutor/voicePreview";
import { SpeechCache, tutorSpeech, MockSpeech } from "../../server/tutor/speech";
import { createTutorRouter } from "../../server/tutor/router";

const ENV = {
  ELEVENLABS_API_KEY: "test-secret-not-real-" + "x".repeat(40), TUTOR_VOICE_ALLOW_EXTERNAL: "1",
  ELEVENLABS_VOICE_DIRETO: "voiceDireto0001", ELEVENLABS_VOICE_DURONA: "voiceDurona00001",
  ELEVENLABS_VOICE_TRANQUILO: "voiceTranquilo001",
};
const audioResponse = () => new Response(new Uint8Array([73, 68, 51, 1]), { headers: { "Content-Type": "audio/mpeg" } });

describe("vozes oficiais: configuração, revisão e fronteira TTS", () => {
  it("mapeia os três professores atuais e mantém os aliases de Tranquilo", () => {
    expect(officialVoiceForPersonality("durona")).toBe("durona");
    expect(officialVoiceForPersonality("preguicoso")).toBe("tranquilo");
    expect(officialVoiceForPersonality("acolhedor")).toBe("tranquilo");
    expect(officialVoiceForPersonality("tranquilo")).toBe("tranquilo");
    expect(officialVoiceForPersonality("questionador")).toBeNull();
    expect(officialVoiceForPersonality("__proto__")).toBeNull();
  });
  it("usa os nomes atuais de variáveis e mantém IDs antigos de voz como fallback", () => {
    expect(elevenLabsConfiguration(ENV).voices.durona).toBe(ENV.ELEVENLABS_VOICE_DURONA);
    expect(elevenLabsConfiguration(ENV).voices.tranquilo).toBe(ENV.ELEVENLABS_VOICE_TRANQUILO);
    expect(elevenLabsConfiguration({ ...ENV, ELEVENLABS_VOICE_DURONA: "", ELEVENLABS_VOICE_DURAO: "voiceDuronaAntiga01" }).voices.durona).toBe("voiceDuronaAntiga01");
    expect(elevenLabsConfiguration({ ...ENV, ELEVENLABS_VOICE_TRANQUILO: "", ELEVENLABS_VOICE_PREGUICOSO: "voiceTranquilaAnt01" }).voices.tranquilo).toBe("voiceTranquilaAnt01");
  });
  it("os roteiros de Voice Design respeitam os tamanhos da API e são originais", () => {
    for (const profile of Object.values(OFFICIAL_VOICES)) {
      expect(profile.design.length).toBeGreaterThanOrEqual(20);
      expect(profile.design.length).toBeLessThanOrEqual(1000);
      expect(profile.sample.length).toBeGreaterThanOrEqual(100);
      expect(profile.sample.length).toBeLessThanOrEqual(1000);
      expect(profile.design).toMatch(/original.*Brasil/);
    }
  });
  it("credenciais e IDs ausentes não liberam nem simulam áudio", () => {
    const status = elevenLabsReadiness({});
    expect(status.keyConfigured).toBe(false);
    expect(status.rows.every((row) => !row.ready && !row.approved)).toBe(true);
    expect(status.releaseReady).toBe(false);
    expect(JSON.stringify(status)).not.toContain(ENV.ELEVENLABS_API_KEY);
  });
  it("somente audição interna fica pronta com chave, consentimento e IDs", () => {
    const status = elevenLabsReadiness(ENV);
    expect(status.rows.every((row) => row.ready)).toBe(true);
    expect(status.releaseReady).toBe(false);
    expect(status.pending).toMatch(/três vozes/);
    expect(elevenLabsReadiness({ ...ENV, TUTOR_VOICE_ALLOW_EXTERNAL: "0" }).rows.every((row) => !row.ready)).toBe(true);
  });
  it("requer três IDs distintos, modelo suportado e formato conhecido", () => {
    expect(elevenLabsReadiness({ ...ENV, ELEVENLABS_VOICE_DIRETO: ENV.ELEVENLABS_VOICE_TRANQUILO }).rows.filter((row) => !row.unique)).toHaveLength(2);
    expect(elevenLabsReadiness({ ...ENV, ELEVENLABS_MODEL_ID: "inventado" }).rows.every((row) => !row.ready)).toBe(true);
    expect(elevenLabsReadiness({ ...ENV, ELEVENLABS_OUTPUT_FORMAT: "pcm_44100" }).releaseReady).toBe(false);
  });
  it("aprovação se invalida ao trocar voz, modelo ou parâmetros de saída", () => {
    const approvals = Object.fromEntries(Object.keys(OFFICIAL_VOICES).map((id) => [id, { fingerprint: voiceFingerprint(id as any, ENV), approvedBy: "Responsável no teste", approvedAt: "2026-10-07T12:00:00Z" }]));
    expect(elevenLabsReadiness(ENV, approvals).releaseReady).toBe(true);
    expect(elevenLabsReadiness({ ...ENV, ELEVENLABS_VOICE_DURONA: "anotherVoice001" }, approvals).releaseReady).toBe(false);
    expect(elevenLabsReadiness({ ...ENV, ELEVENLABS_MODEL_ID: "eleven_multilingual_v2" }, approvals).releaseReady).toBe(false);
    expect(elevenLabsReadiness({ ...ENV, ELEVENLABS_OUTPUT_FORMAT: "mp3_22050_32" }, approvals).releaseReady).toBe(false);
  });
  it("direção emocional é local, limitada e compatível com estabilidade do v3", () => {
    const angry = officialSpeechDirection("durona", { emotion: "angry", intensity: 2, speed: 100 });
    expect(angry.tag).toBe("[angry]");
    expect(angry.settings.stability).toBe(0.5);
    expect(angry.settings.speed).toBeLessThanOrEqual(1.12);
    expect(angry.settings).not.toHaveProperty("use_speaker_boost");
    expect(officialSpeechDirection("tranquilo", { emotion: "angry", intensity: 1 }).tag).toBe("");
    expect(officialSpeechDirection("tranquilo", { emotion: "irritated", intensity: 0.5 }).tag).toBe("[sighs]");
    expect(officialSpeechDirection("direto", { emotion: "[scream]", intensity: NaN }).tag).toBe("");
    expect(officialSpeechDirection("durona", { emotion: "angry", intensity: 1 }, "eleven_multilingual_v2").tag).toBe("");
  });
  it("envia somente texto final, ID, parâmetros e direção; nunca memória, regras ou credenciais no corpo", async () => {
    const fetcher = vi.fn(async () => audioResponse());
    const provider = new OfficialElevenLabsSpeech(ENV, fetcher as any, true);
    const result = await provider.synthesize("Porra, confira o raciocínio. [shouting]", { personality: "durona", acting: "INSTRUÇÃO PRIVADA", direction: { emotion: "impatient", intensity: 0.5 } });
    expect(result.mime).toBe("audio/mpeg");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voiceDurona00001?output_format=mp3_44100_128");
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(["language_code", "model_id", "text", "voice_settings"]);
    expect(body.text).toBe("[frustrated] Porra, confira o raciocínio. (shouting)");
    expect(body.language_code).toBe("pt");
    expect(init.body).not.toContain("INSTRUÇÃO PRIVADA");
    expect(init.body).not.toContain(ENV.ELEVENLABS_API_KEY);
  });
  it("uso normal não consegue contornar aprovações e preview não aceita ID arbitrário", async () => {
    const fetcher = vi.fn(async () => audioResponse());
    await expect(new OfficialElevenLabsSpeech(ENV, fetcher as any).synthesize("Olá", { personality: "questionador" })).rejects.toThrow(/bloqueada|não tem voz/);
    await expect(new OfficialElevenLabsSpeech(ENV, fetcher as any, true).synthesize("Olá", { personality: "questionador", elevenlabs: ENV.ELEVENLABS_VOICE_DIRETO })).rejects.toThrow(/não tem voz/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("não vaza segredo no erro, não aceita retorno sem áudio e não repete chamada automaticamente", async () => {
    const fetcher = vi.fn(async () => new Response(ENV.ELEVENLABS_API_KEY, { status: 401 }));
    const error = await new OfficialElevenLabsSpeech(ENV, fetcher as any, true).synthesize("Olá", { personality: "direto" }).catch((e) => e);
    expect(error.message).toMatch(/401/);
    expect(error.message).not.toContain(ENV.ELEVENLABS_API_KEY);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(new OfficialElevenLabsSpeech(ENV, (async () => new Response("{}")) as any, true).synthesize("Olá", { personality: "direto" })).rejects.toThrow(/sem áudio/);
  });
  it("cache separa voz efetiva, personalidade e direção", () => {
    const a = new OfficialElevenLabsSpeech(ENV);
    const b = new OfficialElevenLabsSpeech({ ...ENV, ELEVENLABS_VOICE_TRANQUILO: "anotherVoice001" });
    const key = SpeechCache.key(a, { personality: "acolhedor" }, "Olá");
    expect(SpeechCache.key(b, { personality: "acolhedor" }, "Olá")).not.toBe(key);
    expect(SpeechCache.key(a, { personality: "direto" }, "Olá")).not.toBe(key);
    expect(SpeechCache.key(a, { personality: "acolhedor", direction: { emotion: "pleased" } }, "Olá")).not.toBe(key);
  });
  it("a rota existente continua buscando o texto e a personalidade do dono no banco", async () => {
    const speech = new MockSpeech();
    const service = vi.fn(async (fn) => fn === "ch_worker_tutor_speech" ? { found: true, config: { enabled: true, voice_enabled: true, requires_pro: true }, is_pro: true, personality: "durona", text: "Texto validado do banco para integração oficial.", emotion: { mood: "irritated", frustration: 60 } } : null);
    await tutorSpeech({ db: { service }, speech } as any, "student-owner", { kind: "message", sessionId: "session", messageId: 1, personalityId: null, phrase: null, letter: null });
    expect(service).toHaveBeenCalledWith("ch_worker_tutor_speech", expect.objectContaining({ p_user: "student-owner", p_session_id: "session", p_message_id: 1 }));
    expect(speech.calls[0]).toMatchObject({ text: "Texto validado do banco para integração oficial.", voice: { personality: "durona", direction: { emotion: "irritated", intensity: 0.6 } } });
  });
});

describe("audição interna autenticada (sem ElevenLabs real)", () => {
  let server: Server;
  let base: string;
  const provider = vi.fn(async () => audioResponse());
  beforeAll(async () => {
    const app = express();
    const db = {
      authenticate: async (req: any) => req.headers.authorization ? { id: req.headers.authorization } : null,
      asUser: async (user: any) => { if (user.id !== "Bearer admin") throw new Error("denied"); return {}; },
    };
    app.use("/voices", createVoicePreviewRouter(db as any, ENV, provider as any));
    app.use("/tutor", express.json(), createTutorRouter({
      db: { ...db, service: async (fn: string) => fn === "ch_worker_tutor_voice_sweep" ? [] : { voice_enabled: true } },
      mockRespond: () => ({}),
      realtime: { ready: true, model: "fake-realtime", pending: null, key: "fake-test-key", transcribeModel: null },
      live: { ready: true, model: "fake-live", pending: null, key: "fake-test-key" },
      gemini: { ready: false, model: "fake-gemini", pending: "off", key: null },
    } as any));
    server = await new Promise<Server>((resolve, reject) => { const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate)); candidate.on("error", reject); });
    base = `http://127.0.0.1:${(server.address() as any).port}/voices`;
  });
  afterAll(async () => { if (server) await new Promise<void>((resolve) => server.close(() => resolve())); });
  afterEach(() => vi.unstubAllEnvs());
  const post = (body: unknown, user = "admin") => fetch(`${base}/preview`, { method: "POST", headers: { Authorization: `Bearer ${user}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  it("nega anônimo e aluno mesmo se chamarem a rota diretamente", async () => {
    expect((await fetch(base)).status).toBe(401);
    expect((await post({ personality: "direto", scenario: "apresentacao" }, "student")).status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it("retorna estado de aprovação sem chave nem simular que foi aprovado", async () => {
    const response = await fetch(base, { headers: { Authorization: "Bearer admin" } });
    const body = await response.text();
    expect(body).not.toContain(ENV.ELEVENLABS_API_KEY);
    expect(JSON.parse(body).releaseReady).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("recusa texto livre, instruções, parâmetros, cenário desconhecido e prototype keys", async () => {
    for (const body of [{ personality: "direto", scenario: "apresentacao", text: "Faça outra coisa" }, { personality: "direto", scenario: "__proto__" }, { personality: "__proto__", scenario: "apresentacao" }, { personality: "direto", scenario: { toString: null } }]) expect((await post(body)).status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
  });
  it("gera o roteiro fixo e reaproveita o áudio ao repetir a audição", async () => {
    expect((await post({ personality: "durona", scenario: "repeticao" })).status).toBe(200);
    expect((await post({ personality: "durona", scenario: "repeticao" })).status).toBe(200);
    expect(provider).toHaveBeenCalledTimes(1);
    const [, init] = provider.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).text).toContain(VOICE_SCENARIOS.repeticao.text);
  });
  it("ao escolher TTS não anuncia Live/Realtime nem abre nova sessão nesses provedores", async () => {
    vi.stubEnv("TUTOR_VOICE_PROVIDER", "elevenlabs");
    const status = await fetch(`${base.replace(/\/voices$/, "")}/tutor/status`, { headers: { Authorization: "Bearer admin" } }).then((r) => r.json());
    expect(status).toMatchObject({ tts_only: true, realtime_voice: false, live_voice: false, voice_hint: null });
    const response = await fetch(`${base.replace(/\/voices$/, "")}/tutor/voice/start`, { method: "POST", headers: { Authorization: "Bearer admin", "Content-Type": "application/json" }, body: JSON.stringify({ session_id: "11111111-1111-4111-8111-111111111111" }) });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Stazia Tutor Engine");
  });
});
