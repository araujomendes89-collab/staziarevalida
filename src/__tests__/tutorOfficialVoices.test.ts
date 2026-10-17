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
  ELEVENLABS_VOICE_STAZI: "voiceStazi00001", ELEVENLABS_VOICE_STAZIA: "voiceStazia0001",
};
/** Direção de uma fala: a voz é do personagem (stazi, stazia); as marcações vêm da personalidade. */
const direcao = (voice: "stazi" | "stazia", personality: string, d: Parameters<typeof officialSpeechDirection>[1], model = "eleven_v3") => officialSpeechDirection(voice, d, model, personality);
/** Intensidade que o Speech Director tira do estado salvo (os humores novos usam a frustração). */
const speechDirectionFromStateIntensity = (mood: string) => speechDirectionFromState({ mood, frustration: 35, enthusiasm: 90 }).intensity;
const audioResponse = () => new Response(new Uint8Array([73, 68, 51, 1]), { headers: { "Content-Type": "audio/mpeg" } });

describe("vozes oficiais: configuração, revisão e fronteira TTS", () => {
  it("a voz vem do personagem: Durão e Tranquilo falam com a voz do Stazi; Durona e Tranquila, com a da Stazia; o Direto saiu", () => {
    expect(officialVoiceForPersonality("durao")).toBe("stazi");
    expect(officialVoiceForPersonality("acolhedor")).toBe("stazi");
    expect(officialVoiceForPersonality("durona")).toBe("stazia");
    expect(officialVoiceForPersonality("tranquila")).toBe("stazia");
    // aliases antigos e o próprio id do personagem
    expect(officialVoiceForPersonality("preguicoso")).toBe("stazi");
    expect(officialVoiceForPersonality("tranquilo")).toBe("stazi");
    expect(officialVoiceForPersonality("stazi")).toBe("stazi");
    expect(officialVoiceForPersonality("stazia")).toBe("stazia");
    expect(officialVoiceForPersonality("direto")).toBeNull();
    expect(officialVoiceForPersonality("questionador")).toBeNull();
    expect(officialVoiceForPersonality("__proto__")).toBeNull();
  });
  it("usa os nomes atuais de variáveis e mantém IDs antigos de voz como fallback", () => {
    expect(elevenLabsConfiguration(ENV).voices.stazia).toBe(ENV.ELEVENLABS_VOICE_STAZIA);
    expect(elevenLabsConfiguration(ENV).voices.stazi).toBe(ENV.ELEVENLABS_VOICE_STAZI);
    // reserva de compatibilidade: as variáveis de antes valem enquanto as novas não existem (a Stazia herda a da Durona; o Stazi, a do Tranquilo)
    const antigas = { ELEVENLABS_API_KEY: ENV.ELEVENLABS_API_KEY, TUTOR_VOICE_ALLOW_EXTERNAL: "1" };
    expect(elevenLabsConfiguration({ ...antigas, ELEVENLABS_VOICE_DURONA: "voiceDuronaAntiga01", ELEVENLABS_VOICE_TRANQUILO: "voiceTranquiloAnt01" }).voices).toEqual({ stazi: "voiceTranquiloAnt01", stazia: "voiceDuronaAntiga01" });
    expect(elevenLabsConfiguration({ ...antigas, ELEVENLABS_VOICE_DURAO: "voiceDuronaAntiga02", ELEVENLABS_VOICE_PREGUICOSO: "voiceTranquiloAnt02" }).voices).toEqual({ stazi: "voiceTranquiloAnt02", stazia: "voiceDuronaAntiga02" });
    // a variável nova vence a antiga; a do Direto não vale mais
    expect(elevenLabsConfiguration({ ...ENV, ELEVENLABS_VOICE_DURONA: "voiceDuronaAntiga01", ELEVENLABS_VOICE_DIRETO: "voiceDiretoAntigo1" }).voices).toEqual({ stazi: ENV.ELEVENLABS_VOICE_STAZI, stazia: ENV.ELEVENLABS_VOICE_STAZIA });
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
  it("VZ04: os avisos do painel vêm em português simples, sem nome de variável do servidor; o detalhe técnico vem à parte", () => {
    const tecnico = /[A-Z]{3,}_[A-Z_]+|voice_?id|eleven_v3|mp3_|=1/i;
    const semChave = elevenLabsReadiness({});
    expect(semChave.pending).toBe("A chave de acesso da voz do professor ainda não foi configurada no servidor.");
    expect(semChave.detail).toBe("Configure ELEVENLABS_API_KEY no servidor.");
    const semAutorizacao = elevenLabsReadiness({ ...ENV, TUTOR_VOICE_ALLOW_EXTERNAL: "0" });
    expect(semAutorizacao.pending).toBe("O envio do texto para gerar a voz ainda não foi autorizado no servidor.");
    expect(semAutorizacao.detail).toBe("Defina TUTOR_VOICE_ALLOW_EXTERNAL=1 no servidor.");
    const modelo = elevenLabsReadiness({ ...ENV, ELEVENLABS_MODEL_ID: "modelo_antigo" });
    expect(modelo.pending).toBe("O modelo de voz configurado não foi homologado. Use um dos dois modelos aprovados e teste de novo.");
    expect(modelo.detail).toBe("Use eleven_v3 ou eleven_multilingual_v2 (ELEVENLABS_MODEL_ID).");
    const formato = elevenLabsReadiness({ ...ENV, ELEVENLABS_OUTPUT_FORMAT: "mp3_22050_32" });
    expect(formato.pending).toBe("O formato de áudio configurado não é o homologado para a audição.");
    expect(formato.detail).toBe("Use ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128.");
    for (const r of [semChave, semAutorizacao, modelo, formato]) {
      expect(r.pending).not.toMatch(tecnico);
      expect(r.rows.every((row) => row.pending === r.pending && row.detail === r.detail)).toBe(true);
    }
    // voz sem cadastro e vozes repetidas: por linha
    const semVoz = elevenLabsReadiness({ ...ENV, ELEVENLABS_VOICE_STAZIA: "" });
    const stazia = semVoz.rows.find((row) => row.id === "stazia")!;
    expect(stazia.pending).toBe("A voz de Stazia ainda não foi cadastrada no servidor.");
    expect(stazia.detail).toBe("Configure ELEVENLABS_VOICE_STAZIA com o voice_id salvo.");
    expect(stazia.pending).not.toMatch(tecnico);
    expect(semVoz.pending).toBeNull();
    const repetida = elevenLabsReadiness({ ...ENV, ELEVENLABS_VOICE_STAZIA: ENV.ELEVENLABS_VOICE_STAZI });
    const rep = repetida.rows.find((row) => row.id === "stazia")!;
    expect(rep.pending).toBe("Cada personagem precisa de uma voz própria: há vozes repetidas.");
    expect(rep.detail).toBe("Os voice_id de ELEVENLABS_VOICE_STAZI e ELEVENLABS_VOICE_STAZIA devem ser diferentes entre si.");
    // tudo certo: nada a avisar
    expect(elevenLabsReadiness(ENV).detail).toBeNull();
    expect(elevenLabsReadiness(ENV).rows.every((row) => row.detail === null)).toBe(true);
  });
  it("requer dois IDs distintos (um por personagem), modelo suportado e formato conhecido", () => {
    expect(elevenLabsReadiness({ ...ENV, ELEVENLABS_VOICE_STAZIA: ENV.ELEVENLABS_VOICE_STAZI }).rows.filter((row) => !row.unique)).toHaveLength(2);
    expect(elevenLabsReadiness({ ...ENV, ELEVENLABS_MODEL_ID: "inventado" }).rows.every((row) => !row.ready)).toBe(true);
    expect(elevenLabsReadiness({ ...ENV, ELEVENLABS_OUTPUT_FORMAT: "pcm_44100" }).rows.every((row) => !row.ready)).toBe(true);
  });
  it("aprovação se invalida ao trocar voz, modelo ou parâmetros de saída", () => {
    const approvals = Object.fromEntries(Object.keys(OFFICIAL_VOICES).map((id) => [id, { fingerprint: voiceFingerprint(id as any, ENV), approved_at: "2026-10-07T12:00:00Z", sample_path: null }]));
    const approved = (env: NodeJS.ProcessEnv) => elevenLabsReadiness(env, approvals).rows.find((r) => r.id === "stazia")!.approved;
    expect(approved(ENV)).toBe(true);
    expect(approved({ ...ENV, ELEVENLABS_VOICE_STAZIA: "anotherVoice001" })).toBe(false);
    expect(approved({ ...ENV, ELEVENLABS_MODEL_ID: "eleven_multilingual_v2" })).toBe(false);
    expect(approved({ ...ENV, ELEVENLABS_OUTPUT_FORMAT: "mp3_22050_32" })).toBe(false);
  });

  it("cenários por voz: os cinco de hoje mais 'firme' e 'alivio' (o Durão e a Durona usam) para as duas vozes; 'comemoracao' saiu com o Direto", () => {
    const today = ["apresentacao", "erro", "repeticao", "acerto", "pronuncia"];
    expect(scenariosFor("stazia")).toEqual([...today, "firme", "alivio"]);
    expect(scenariosFor("stazi")).toEqual([...today, "firme", "alivio"]);
    expect(Object.keys(VOICE_SCENARIOS)).not.toContain("comemoracao");
    expect(VOICE_SCENARIOS.firme).toMatchObject({ emotion: "firm", intensity: 0.3, text: "Sério isso? Você tinha o diagnóstico na mão e jogou fora na conduta." });
    expect(VOICE_SCENARIOS.alivio).toMatchObject({ emotion: "relieved", intensity: 0.35, text: "Ufa, porra, até que enfim! Dessa vez você usou a informação do enunciado para sustentar a resposta." });
  });

  it("a versão da voz junta voz, modelo, formato, cenários dela e a direção do Speech Director; mudar qualquer um muda a versão", () => {
    const parts = fingerprintParts("stazia", ENV);
    expect(parts).toMatchObject({ id: "stazia", voiceId: ENV.ELEVENLABS_VOICE_STAZIA, model: "eleven_v3", format: "mp3_44100_128", profile: OFFICIAL_VOICES.stazia });
    expect(parts.scenarios.map(([k]) => k)).toEqual(scenariosFor("stazia"));
    expect(parts.direction).toEqual({ profiles: SPEECH_PROFILES, tags: TAG_RULES, speed: SPEED_RANGE });
    const v = fingerprintOf(parts);
    expect(v).toMatch(/^[0-9a-f]{64}$/);
    expect(voiceFingerprint("stazia", ENV)).toBe(v);
    const copy = JSON.parse(JSON.stringify(parts));
    copy.direction.profiles.firm.style = 0.99;
    expect(fingerprintOf(copy)).not.toBe(v);
    expect(fingerprintOf({ ...parts, scenarios: parts.scenarios.slice(0, 5) })).not.toBe(v);
    expect(voiceFingerprint("stazia", { ...ENV, ELEVENLABS_VOICE_STAZIA: "anotherVoice001" })).not.toBe(v);
    expect(voiceFingerprint("stazia", { ...ENV, ELEVENLABS_MODEL_ID: "eleven_multilingual_v2" })).not.toBe(v);
    // a versão de uma voz não depende da outra
    expect(voiceFingerprint("stazia", { ...ENV, ELEVENLABS_VOICE_STAZI: "anotherVoice002" })).toBe(v);
  });

  it("cada voz vale sozinha: aprovada a da Stazia, a do Stazi segue sem aprovação; aprovação de outra versão não vale; não há 'releaseReady'", () => {
    const status = elevenLabsReadiness(ENV, { stazia: { fingerprint: voiceFingerprint("stazia", ENV), approved_at: "2026-10-08T12:00:00Z", sample_path: "stazia/abc.mp3" } });
    expect(Object.fromEntries(status.rows.map((r) => [r.id, r.approved]))).toEqual({ stazi: false, stazia: true });
    expect(status).not.toHaveProperty("releaseReady");
    expect(status).not.toHaveProperty("allApproved");
    expect(status.pending).toBeNull();
    const old = elevenLabsReadiness(ENV, { stazia: { fingerprint: "0".repeat(64), approved_at: "2026-10-08T12:00:00Z", sample_path: null } });
    expect(old.rows.find((r) => r.id === "stazia")!.approved).toBe(false);
  });

  it("firme e alívio: no v3 a estabilidade fica 0,5 e o alívio muda estilo e ritmo; no multilingual_v2 também a estabilidade; nenhuma marcação", () => {
    expect(SPEECH_PROFILES.firm).toEqual({ stability: 0.6, style: 0.24, speed: 0.02 });
    expect(SPEECH_PROFILES.relieved).toEqual({ stability: 0.62, style: 0.3, speed: -0.04 });
    const relieved = direcao("stazia", "durona", { emotion: "relieved", intensity: 0.35 });
    const neutral = direcao("stazia", "durona", { emotion: "neutral", intensity: 0.35 });
    expect(relieved.tag).toBe("");
    expect(relieved.settings.stability).toBe(0.5);
    expect(relieved.settings.style).toBeGreaterThan(neutral.settings.style);
    expect(relieved.settings.speed).toBeLessThan(OFFICIAL_VOICES.stazia.speed);
    const v2 = direcao("stazia", "durona", { emotion: "relieved", intensity: 0.35 }, "eleven_multilingual_v2");
    expect(v2.settings.stability).toBe(0.56);
    expect(v2.tag).toBe("");
    expect(direcao("stazia", "durona", { emotion: "firm", intensity: 0.3 }).tag).toBe("");
    // humores antigos: o mesmo de antes, e o Durão (voz do Stazi) marca como a Durona
    expect(direcao("stazia", "durona", { emotion: "irritated", intensity: 0.5 }).tag).toBe("[frustrated]");
    expect(direcao("stazi", "durao", { emotion: "irritated", intensity: 0.5 }).tag).toBe("[frustrated]");
    expect(direcao("stazi", "durao", { emotion: "pleased", intensity: 0.2 }).tag).toBe("[encouraging]");
    expect(speechDirectionFromStateIntensity("relieved")).toBe(0.35);
  });

  it("o transporte só exige a voz configurada: quem decide aprovação é o servidor", async () => {
    const fetcher = vi.fn(async () => audioResponse());
    const out = await new OfficialElevenLabsSpeech(ENV, fetcher as any).synthesize("Olá", { personality: "durao" });
    expect(out.mime).toBe("audio/mpeg");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(new OfficialElevenLabsSpeech({ ...ENV, ELEVENLABS_VOICE_STAZI: "" }, fetcher as any).synthesize("Olá", { personality: "durao" })).rejects.toThrow(/ELEVENLABS_VOICE_STAZI/);
    // o Direto saiu: sem voz oficial
    await expect(new OfficialElevenLabsSpeech(ENV, fetcher as any).synthesize("Olá", { personality: "direto" })).rejects.toThrow(/não tem voz/);
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
    expect(off.status).toMatchObject({ ready: false, provider: "elevenlabs", pending: expect.stringMatching(/chave de acesso/), detail: expect.stringMatching(/ELEVENLABS_API_KEY/) });
    // nos testes, deps.speech decide (null = desligada)
    const mock = new MockSpeech();
    expect(elevenSynth({ speech: mock })).toBe(mock);
    expect(elevenSynth({ speech: null })).toBeNull();
    expect(elevenSynth({ elevenEnv: ENV })).toBeInstanceOf(OfficialElevenLabsSpeech);
  });
  it("direção emocional é local, limitada e compatível com estabilidade do v3", () => {
    const angry = direcao("stazia", "durona", { emotion: "angry", intensity: 2, speed: 100 });
    expect(angry.tag).toBe("[angry]");
    expect(angry.settings.stability).toBe(0.5);
    expect(angry.settings.speed).toBeLessThanOrEqual(1.12);
    expect(angry.settings).not.toHaveProperty("use_speaker_boost");
    expect(direcao("stazi", "acolhedor", { emotion: "angry", intensity: 1 }).tag).toBe("");
    expect(direcao("stazi", "acolhedor", { emotion: "irritated", intensity: 0.5 }).tag).toBe("[sighs]");
    expect(direcao("stazia", "tranquila", { emotion: "irritated", intensity: 0.5 }).tag).toBe("[sighs]"); // a Tranquila marca como o Tranquilo
    expect(direcao("stazi", "durao", { emotion: "[scream]", intensity: NaN }).tag).toBe("");
    expect(direcao("stazia", "durona", { emotion: "angry", intensity: 1 }, "eleven_multilingual_v2").tag).toBe("");
  });
  it("envia somente texto final, ID, parâmetros e direção; nunca memória, regras ou credenciais no corpo", async () => {
    const fetcher = vi.fn(async () => audioResponse());
    const provider = new OfficialElevenLabsSpeech(ENV, fetcher as any);
    const result = await provider.synthesize("Porra, confira o raciocínio. [shouting]", { personality: "durona", acting: "INSTRUÇÃO PRIVADA", direction: { emotion: "impatient", intensity: 0.5 } });
    expect(result.mime).toBe("audio/mpeg");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voiceStazia0001?output_format=mp3_44100_128");
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
    await expect(new OfficialElevenLabsSpeech(ENV, fetcher as any).synthesize("Olá", { personality: "questionador", elevenlabs: ENV.ELEVENLABS_VOICE_STAZI })).rejects.toThrow(/não tem voz/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("não vaza segredo no erro, não aceita retorno sem áudio e não repete chamada automaticamente", async () => {
    const fetcher = vi.fn(async () => new Response(ENV.ELEVENLABS_API_KEY, { status: 401 }));
    const error = await new OfficialElevenLabsSpeech(ENV, fetcher as any).synthesize("Olá", { personality: "durao" }).catch((e) => e);
    expect(error.message).toMatch(/401/);
    expect(error.message).not.toContain(ENV.ELEVENLABS_API_KEY);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(new OfficialElevenLabsSpeech(ENV, (async () => new Response("{}")) as any).synthesize("Olá", { personality: "durao" })).rejects.toThrow(/sem áudio/);
  });
  it("cache separa voz efetiva, personalidade e direção", () => {
    const a = new OfficialElevenLabsSpeech(ENV);
    const b = new OfficialElevenLabsSpeech({ ...ENV, ELEVENLABS_VOICE_STAZI: "anotherVoice001" });
    const key = SpeechCache.key(a, { personality: "acolhedor" }, "Olá");
    expect(SpeechCache.key(b, { personality: "acolhedor" }, "Olá")).not.toBe(key);
    expect(SpeechCache.key(a, { personality: "durao" }, "Olá")).not.toBe(key);
    expect(SpeechCache.key(a, { personality: "acolhedor", direction: { emotion: "pleased" } }, "Olá")).not.toBe(key);
  });
  it("a rota busca no banco o texto, o professor e o estado com que a fala foi escrita", async () => {
    const speech = new MockSpeech();
    const quota = { mode: "paid", voice_enabled: true, team_only: false, staff: false, remaining_today: 4500, account_day_left: 4500, account_month_left: 30000,
      approvals: { stazia: { fingerprint: voiceFingerprint("stazia", ENV), approved_at: "2026-10-08T12:00:00Z", sample_path: null } } };
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
      authenticate: async (req: any) => req.headers.authorization ? { id: req.headers.authorization, email: null } : null,
      asUser: async (user: any) => { if (user.id !== "Bearer admin") throw new Error("denied"); return {}; },
      // o painel lê aprovações e audições no banco; a audição fica registrada pelo servidor
      service: async (fn: string) => (fn === "ch_worker_tutor_voice_panel" ? { approvals: {}, heard: [] } : null),
    };
    app.use("/voices", createVoicePreviewRouter({ db, elevenEnv: ENV, fetch: provider } as any, {}));
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
    expect((await post({ personality: "stazi", scenario: "apresentacao" }, "student")).status).toBe(403);
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
    for (const body of [{ personality: "stazi", scenario: "apresentacao", text: "Faça outra coisa" }, { personality: "stazi", scenario: "__proto__" }, { personality: "__proto__", scenario: "apresentacao" }, { personality: "stazi", scenario: { toString: null } }]) expect((await post(body)).status).toBe(400);
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
