// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { OFFICIAL_VOICES, VOICE_SCENARIOS, scenariosFor } from "../shared/tutor/officialVoices";
import { elevenLabsConfiguration, elevenLabsReadiness, fingerprintOf, fingerprintParts, officialVoiceForPersonality, voiceFingerprint } from "../../server/tutor/officialVoices";
import { OfficialElevenLabsSpeech, elevenSynth, officialSpeechDirection } from "../../server/tutor/elevenlabsTts";
import { SPEECH_PROFILES, SPEED_RANGE, TAG_RULES, speechDirectionFromState } from "../../server/tutor/speechDirector";
import { createVoicePreviewRouter } from "../../server/tutor/voicePreview";
import { SpeechCache, tutorSpeech, MockSpeech, speechProviderFor } from "../../server/tutor/speech";
import { createTutorRouter } from "../../server/tutor/router";

const ENV = {
  ELEVENLABS_API_KEY: "test-secret-not-real-" + "x".repeat(40), TUTOR_VOICE_ALLOW_EXTERNAL: "1",
  ELEVENLABS_VOICE_DIRETO: "voiceDireto0001", ELEVENLABS_VOICE_DURONA: "voiceDurona00001",
  ELEVENLABS_VOICE_TRANQUILO: "voiceTranquilo001",
};
/** Intensidade que o Speech Director tira do estado salvo (os humores novos usam a frustração). */
const speechDirectionFromStateIntensity = (mood: string) => speechDirectionFromState({ mood, frustration: 35, enthusiasm: 90 }).intensity;
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
    expect(JSON.stringify(status)).not.toContain(ENV.ELEVENLABS_API_KEY);
  });
  it("com chave, consentimento e IDs as vozes ficam prontas; aprovadas, nenhuma, até a audição no painel", () => {
    const status = elevenLabsReadiness(ENV);
    expect(status.rows.every((row) => row.ready)).toBe(true);
    expect(status.rows.every((row) => !row.approved)).toBe(true);
    expect(status.pending).toBeNull();
    expect(elevenLabsReadiness({ ...ENV, TUTOR_VOICE_ALLOW_EXTERNAL: "0" }).rows.every((row) => !row.ready)).toBe(true);
  });
  it("requer três IDs distintos, modelo suportado e formato conhecido", () => {
    expect(elevenLabsReadiness({ ...ENV, ELEVENLABS_VOICE_DIRETO: ENV.ELEVENLABS_VOICE_TRANQUILO }).rows.filter((row) => !row.unique)).toHaveLength(2);
    expect(elevenLabsReadiness({ ...ENV, ELEVENLABS_MODEL_ID: "inventado" }).rows.every((row) => !row.ready)).toBe(true);
    expect(elevenLabsReadiness({ ...ENV, ELEVENLABS_OUTPUT_FORMAT: "pcm_44100" }).rows.every((row) => !row.ready)).toBe(true);
  });
  it("aprovação se invalida ao trocar voz, modelo ou parâmetros de saída", () => {
    const approvals = Object.fromEntries(Object.keys(OFFICIAL_VOICES).map((id) => [id, { fingerprint: voiceFingerprint(id as any, ENV), approved_at: "2026-10-07T12:00:00Z", sample_path: null }]));
    const approved = (env: NodeJS.ProcessEnv) => elevenLabsReadiness(env, approvals).rows.find((r) => r.id === "durona")!.approved;
    expect(approved(ENV)).toBe(true);
    expect(approved({ ...ENV, ELEVENLABS_VOICE_DURONA: "anotherVoice001" })).toBe(false);
    expect(approved({ ...ENV, ELEVENLABS_MODEL_ID: "eleven_multilingual_v2" })).toBe(false);
    expect(approved({ ...ENV, ELEVENLABS_OUTPUT_FORMAT: "mp3_22050_32" })).toBe(false);
  });

  it("cenários por voz: os cinco de hoje para as três; 'firme' e 'alivio' só da Durona; 'comemoracao' só do Direto", () => {
    const today = ["apresentacao", "erro", "repeticao", "acerto", "pronuncia"];
    expect(scenariosFor("durona")).toEqual([...today, "firme", "alivio"]);
    expect(scenariosFor("tranquilo")).toEqual(today);
    expect(scenariosFor("direto")).toEqual([...today, "comemoracao"]);
    expect(VOICE_SCENARIOS.firme).toMatchObject({ emotion: "firm", intensity: 0.3, only: "durona", text: "Sério isso? Você tinha o diagnóstico na mão e jogou fora na conduta." });
    expect(VOICE_SCENARIOS.alivio).toMatchObject({ emotion: "relieved", intensity: 0.35, only: "durona", text: "Ufa, porra, até que enfim! Dessa vez você usou a informação do enunciado para sustentar a resposta." });
    expect(VOICE_SCENARIOS.comemoracao).toMatchObject({ emotion: "impressed", intensity: 0.7, only: "direto", text: "Isso, porra. Essa era difícil. Boa. Agora sim." });
  });

  it("a versão da voz junta voz, modelo, formato, cenários dela e a direção do Speech Director; mudar qualquer um muda a versão", () => {
    const parts = fingerprintParts("durona", ENV);
    expect(parts).toMatchObject({ id: "durona", voiceId: ENV.ELEVENLABS_VOICE_DURONA, model: "eleven_v3", format: "mp3_44100_128", profile: OFFICIAL_VOICES.durona });
    expect(parts.scenarios.map(([k]) => k)).toEqual(scenariosFor("durona"));
    expect(parts.direction).toEqual({ profiles: SPEECH_PROFILES, tags: TAG_RULES, speed: SPEED_RANGE });
    const v = fingerprintOf(parts);
    expect(v).toMatch(/^[0-9a-f]{64}$/);
    expect(voiceFingerprint("durona", ENV)).toBe(v);
    const copy = JSON.parse(JSON.stringify(parts));
    copy.direction.profiles.firm.style = 0.99;
    expect(fingerprintOf(copy)).not.toBe(v);
    expect(fingerprintOf({ ...parts, scenarios: parts.scenarios.slice(0, 5) })).not.toBe(v);
    expect(voiceFingerprint("durona", { ...ENV, ELEVENLABS_VOICE_DURONA: "anotherVoice001" })).not.toBe(v);
    expect(voiceFingerprint("durona", { ...ENV, ELEVENLABS_MODEL_ID: "eleven_multilingual_v2" })).not.toBe(v);
    // a versão de uma voz não depende das outras
    expect(voiceFingerprint("durona", { ...ENV, ELEVENLABS_VOICE_DIRETO: "anotherVoice002" })).toBe(v);
  });

  it("cada voz vale sozinha: aprovada a Durona, Tranquilo e Direto seguem sem aprovação; aprovação de outra versão não vale; não há 'releaseReady'", () => {
    const status = elevenLabsReadiness(ENV, { durona: { fingerprint: voiceFingerprint("durona", ENV), approved_at: "2026-10-08T12:00:00Z", sample_path: "durona/abc.mp3" } });
    expect(Object.fromEntries(status.rows.map((r) => [r.id, r.approved]))).toEqual({ tranquilo: false, durona: true, direto: false });
    expect(status).not.toHaveProperty("releaseReady");
    expect(status).not.toHaveProperty("allApproved");
    expect(status.pending).toBeNull();
    const old = elevenLabsReadiness(ENV, { durona: { fingerprint: "0".repeat(64), approved_at: "2026-10-08T12:00:00Z", sample_path: null } });
    expect(old.rows.find((r) => r.id === "durona")!.approved).toBe(false);
  });

  it("firme e alívio: no v3 a estabilidade fica 0,5 e o alívio muda estilo e ritmo; no multilingual_v2 também a estabilidade; nenhuma marcação", () => {
    expect(SPEECH_PROFILES.firm).toEqual({ stability: 0.6, style: 0.24, speed: 0.02 });
    expect(SPEECH_PROFILES.relieved).toEqual({ stability: 0.62, style: 0.3, speed: -0.04 });
    const relieved = officialSpeechDirection("durona", { emotion: "relieved", intensity: 0.35 });
    const neutral = officialSpeechDirection("durona", { emotion: "neutral", intensity: 0.35 });
    expect(relieved.tag).toBe("");
    expect(relieved.settings.stability).toBe(0.5);
    expect(relieved.settings.style).toBeGreaterThan(neutral.settings.style);
    expect(relieved.settings.speed).toBeLessThan(OFFICIAL_VOICES.durona.speed);
    const v2 = officialSpeechDirection("durona", { emotion: "relieved", intensity: 0.35 }, "eleven_multilingual_v2");
    expect(v2.settings.stability).toBe(0.56);
    expect(v2.tag).toBe("");
    expect(officialSpeechDirection("durona", { emotion: "firm", intensity: 0.3 }).tag).toBe("");
    // humores antigos: o mesmo de antes
    expect(officialSpeechDirection("durona", { emotion: "irritated", intensity: 0.5 }).tag).toBe("[frustrated]");
    expect(officialSpeechDirection("direto", { emotion: "pleased", intensity: 0.2 }).tag).toBe("[encouraging]");
    expect(speechDirectionFromStateIntensity("relieved")).toBe(0.35);
  });

  it("o transporte só exige a voz configurada: quem decide aprovação é o servidor", async () => {
    const fetcher = vi.fn(async () => audioResponse());
    const out = await new OfficialElevenLabsSpeech(ENV, fetcher as any).synthesize("Olá", { personality: "direto" });
    expect(out.mime).toBe("audio/mpeg");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(new OfficialElevenLabsSpeech({ ...ENV, ELEVENLABS_VOICE_DIRETO: "" }, fetcher as any).synthesize("Olá", { personality: "direto" })).rejects.toThrow(/ELEVENLABS_VOICE_DIRETO/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new OfficialElevenLabsSpeech(ENV, fetcher as any)).not.toHaveProperty("pricePerMinute");
  });

  it("TUTOR_VOICE_PROVIDER não decide mais: sem deps.speech o servidor usa a voz oficial", () => {
    for (const provider of [undefined, "openai", "gemini", "off"]) {
      const r = speechProviderFor({ db: {} as any, elevenEnv: { ...ENV, ...(provider ? { TUTOR_VOICE_PROVIDER: provider } : {}) } });
      expect(r.provider, provider).toBeInstanceOf(OfficialElevenLabsSpeech);
      expect(r.status, provider).toMatchObject({ ready: true, provider: "elevenlabs", pending: null });
    }
    const off = speechProviderFor({ db: {} as any, elevenEnv: {} });
    expect(off.provider).toBeNull();
    expect(off.status).toMatchObject({ ready: false, provider: "elevenlabs", pending: expect.stringMatching(/ELEVENLABS_API_KEY/) });
    // nos testes, deps.speech decide (null = desligada)
    const mock = new MockSpeech();
    expect(elevenSynth({ speech: mock })).toBe(mock);
    expect(elevenSynth({ speech: null })).toBeNull();
    expect(elevenSynth({ elevenEnv: ENV })).toBeInstanceOf(OfficialElevenLabsSpeech);
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
    const provider = new OfficialElevenLabsSpeech(ENV, fetcher as any);
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
  it("professor sem voz oficial não fala e não aceita ID arbitrário", async () => {
    const fetcher = vi.fn(async () => audioResponse());
    await expect(new OfficialElevenLabsSpeech(ENV, fetcher as any).synthesize("Olá", { personality: "questionador" })).rejects.toThrow(/não tem voz/);
    await expect(new OfficialElevenLabsSpeech(ENV, fetcher as any).synthesize("Olá", { personality: "questionador", elevenlabs: ENV.ELEVENLABS_VOICE_DIRETO })).rejects.toThrow(/não tem voz/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("não vaza segredo no erro, não aceita retorno sem áudio e não repete chamada automaticamente", async () => {
    const fetcher = vi.fn(async () => new Response(ENV.ELEVENLABS_API_KEY, { status: 401 }));
    const error = await new OfficialElevenLabsSpeech(ENV, fetcher as any).synthesize("Olá", { personality: "direto" }).catch((e) => e);
    expect(error.message).toMatch(/401/);
    expect(error.message).not.toContain(ENV.ELEVENLABS_API_KEY);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(new OfficialElevenLabsSpeech(ENV, (async () => new Response("{}")) as any).synthesize("Olá", { personality: "direto" })).rejects.toThrow(/sem áudio/);
  });
  it("cache separa voz efetiva, personalidade e direção", () => {
    const a = new OfficialElevenLabsSpeech(ENV);
    const b = new OfficialElevenLabsSpeech({ ...ENV, ELEVENLABS_VOICE_TRANQUILO: "anotherVoice001" });
    const key = SpeechCache.key(a, { personality: "acolhedor" }, "Olá");
    expect(SpeechCache.key(b, { personality: "acolhedor" }, "Olá")).not.toBe(key);
    expect(SpeechCache.key(a, { personality: "direto" }, "Olá")).not.toBe(key);
    expect(SpeechCache.key(a, { personality: "acolhedor", direction: { emotion: "pleased" } }, "Olá")).not.toBe(key);
  });
  it("a rota busca no banco o texto, o professor e o estado com que a fala foi escrita", async () => {
    const speech = new MockSpeech();
    const quota = { mode: "paid", voice_enabled: true, team_only: false, staff: false, remaining_today: 4500, account_day_left: 4500, account_month_left: 30000,
      approvals: { durona: { fingerprint: voiceFingerprint("durona", ENV), approved_at: "2026-10-08T12:00:00Z", sample_path: null } } };
    const service = vi.fn(async (fn) => fn === "ch_worker_tutor_speech"
      ? { found: true, config: { enabled: true, voice_enabled: true }, quota, session_id: "session", personality: "durona", text: "Texto validado do banco para integração oficial.", direction: { mood: "irritated", frustration: 60 } }
      : fn === "ch_worker_tutor_tts_reserve" ? { ok: true, reservation: 1 } : null);
    await tutorSpeech({ db: { service }, speech, elevenEnv: ENV } as any, "student-owner", { kind: "message", sessionId: "session", messageId: 1, personalityId: null, phrase: null, letter: null });
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
    expect(JSON.parse(body).rows.every((r: { approved: boolean }) => !r.approved)).toBe(true);
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
  it("TUTOR_VOICE_PROVIDER não desliga mais a voz ao vivo (reserva): o status não tem tts_only e a abertura não recusa por ele", async () => {
    vi.stubEnv("TUTOR_VOICE_PROVIDER", "elevenlabs");
    const status = await fetch(`${base.replace(/\/voices$/, "")}/tutor/status`, { headers: { Authorization: "Bearer admin" } }).then((r) => r.json());
    expect(status).not.toHaveProperty("tts_only");
    expect(status.realtime_voice).toBe(true);
    const response = await fetch(`${base.replace(/\/voices$/, "")}/tutor/voice/start`, { method: "POST", headers: { Authorization: "Bearer admin", "Content-Type": "application/json" }, body: JSON.stringify({ session_id: "11111111-1111-4111-8111-111111111111" }) });
    expect(JSON.stringify(await response.json())).not.toContain("Stazia Tutor Engine");
  });
});
