// @vitest-environment node
/**
 * VOZ DO PROFESSOR UNIFICADA (18/10/2026): a voz que lê as respostas do Tutor é a MESMA do personagem na voz ao vivo e nas frases
 * de espera: Gemini TTS (gemini-3.8-flash-tts, pelo Vertex), Stazi = "Zubenelgenubi" afinado +3 semitons, Stazia = "Kore". O pedido
 * leva só a fala (o Gemini TTS lê em voz alta qualquer instrução de tom); o servidor afina, apara, iguala o volume e entrega MP3.
 * A ElevenLabs é reserva desligada. Sem rede.
 */
import { describe, expect, it, vi } from "vitest";
import { PERSONAGENS } from "../novo/app/tutor/personagens/personagens.js";
import { afinarTudo } from "../novo/app/tutor/voice/pitchShift.js";
import { OFFICIAL_VOICES, VOICE_SCENARIOS, scenariosFor } from "../shared/tutor/officialVoices";
import { GEMINI_TTS_MODEL, fingerprintOf, fingerprintParts, geminiVoiceOf, voiceEngine, voiceFingerprint, voiceReadiness } from "../../server/tutor/officialVoices";
import { OfficialGeminiSpeech, geminiTtsCost, geminiTtsPrice } from "../../server/tutor/geminiTts";
import { professorSynth } from "../../server/tutor/professorVoice";
import { OfficialElevenLabsSpeech } from "../../server/tutor/elevenlabsTts";
import { SpeechCache, speechProviderFor } from "../../server/tutor/speech";
import { ACABAMENTO_VERSAO, LUFS_ALVO, PICO_MAX_DB, acabarVoz, apararPontas, ganhoComLimite, igualarVolume, loudnessLufs, pcmParaFloat } from "../../server/tutor/vozAcabamento";
import { GEMINI_VOZ_ENV as ENV, custoDe, pcmDe, pedidoGemini, respostaGemini, usoDe } from "./helpers/vozGemini";

const TAXA = 24_000;
const seno = (amp: number, seg: number, f = 997) => Float32Array.from({ length: Math.round(seg * TAXA) }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / TAXA));
const fakeGemini = () => vi.fn(async (_url: string, init: RequestInit) => respostaGemini(pedidoGemini(init).text));

describe("voz do professor = voz do personagem (Gemini)", () => {
  it("a voz e a afinação vêm de personagens.js, as mesmas da voz ao vivo e das frases de espera", () => {
    expect(geminiVoiceOf("stazi")).toEqual({ voice: "Zubenelgenubi", semitons: 3 });
    expect(geminiVoiceOf("stazia")).toEqual({ voice: "Kore", semitons: 0 });
    expect(geminiVoiceOf("stazi")).toEqual({ voice: PERSONAGENS.stazi.voz.gemini, semitons: PERSONAGENS.stazi.voz.semitons });
    expect(GEMINI_TTS_MODEL).toBe("gemini-3.8-flash-tts");
  });

  it("Gemini é o padrão; a ElevenLabs só com TUTOR_VOICE_ENGINE=elevenlabs; o painel não diz o nome da chave ao aluno", () => {
    expect(voiceEngine({})).toBe("gemini");
    expect(voiceEngine({ TUTOR_VOICE_ENGINE: "elevenlabs" })).toBe("elevenlabs");
    expect(professorSynth({ elevenEnv: ENV })).toBeInstanceOf(OfficialGeminiSpeech);
    expect(professorSynth({ elevenEnv: { ...ENV, TUTOR_VOICE_ENGINE: "elevenlabs" } })).toBeInstanceOf(OfficialElevenLabsSpeech);
    // as variáveis da ElevenLabs (inclusive as antigas, que existem na Vercel) não mudam nada sem a chave de escolha
    const comAntigas = { ...ENV, ELEVENLABS_API_KEY: "k".repeat(40), ELEVENLABS_VOICE_TRANQUILO: "vozAntigaTranquilo1", ELEVENLABS_VOICE_DURONA: "vozAntigaDurona0001" };
    expect(professorSynth({ elevenEnv: comAntigas })).toBeInstanceOf(OfficialGeminiSpeech);
    expect(voiceFingerprint("stazia", comAntigas)).toBe(voiceFingerprint("stazia", ENV));
    const pronto = voiceReadiness(ENV);
    expect(pronto).toMatchObject({ engine: "gemini", model: "gemini-3.8-flash-tts", keyConfigured: true, pending: null });
    expect(pronto.rows.map((r) => [r.id, r.ready, r.unique, r.approved])).toEqual([["stazi", true, true, false], ["stazia", true, true, false]]);
    expect(speechProviderFor({ db: {} as any, elevenEnv: ENV }).status).toMatchObject({ ready: true, provider: "gemini", model: "gemini-3.8-flash-tts" });
    const semChave = voiceReadiness({ TUTOR_VOICE_ALLOW_EXTERNAL: "1" });
    expect(semChave).toMatchObject({ keyConfigured: false, pending: "A chave de acesso da voz do professor ainda não foi configurada no servidor.", detail: "Configure VERTEX_API_KEY no servidor." });
    expect(semChave.rows.every((r) => !r.ready)).toBe(true);
    const semAutorizacao = voiceReadiness({ VERTEX_API_KEY: ENV.VERTEX_API_KEY });
    expect(semAutorizacao).toMatchObject({ pending: "O envio do texto para gerar a voz ainda não foi autorizado no servidor.", detail: "Defina TUTOR_VOICE_ALLOW_EXTERNAL=1 no servidor." });
    for (const r of [semChave, semAutorizacao]) expect(r.pending).not.toMatch(/[A-Z]{3,}_[A-Z_]+|gemini|vertex/i);
    expect(JSON.stringify(pronto)).not.toContain(ENV.VERTEX_API_KEY);
  });

  it("a versão (impressão digital da aprovação) muda com o serviço, a voz, o tom, o modelo, o acabamento e os cenários", () => {
    const parts = fingerprintParts("stazi", ENV);
    expect(parts).toMatchObject({ id: "stazi", engine: "gemini", model: "gemini-3.8-flash-tts", voice: "Zubenelgenubi", semitons: 3, format: "mp3_24000_64",
      finish: { version: ACABAMENTO_VERSAO, lufs: LUFS_ALVO.stazi, peakDb: PICO_MAX_DB }, profile: OFFICIAL_VOICES.stazi });
    expect(parts.scenarios.map(([k]) => k)).toEqual(scenariosFor("stazi"));
    const v = fingerprintOf(parts);
    expect(voiceFingerprint("stazi", ENV)).toBe(v);
    expect(v).toMatch(/^[0-9a-f]{64}$/);
    for (const muda of [{ voice: "Puck" }, { semitons: 2 }, { model: "gemini-3.8-flash-lite-tts" }, { format: "mp3_44100_128" }, { finish: { ...parts.finish, version: "outra" } }, { scenarios: parts.scenarios.slice(0, 3) }, { engine: "elevenlabs" }]) {
      expect(fingerprintOf({ ...parts, ...muda }), JSON.stringify(muda)).not.toBe(v);
    }
    expect(voiceFingerprint("stazia", ENV)).not.toBe(v);
    // a chave não entra na versão (trocar a chave não pede nova aprovação)
    expect(voiceFingerprint("stazi", { ...ENV, VERTEX_API_KEY: "outra-chave-vertex-falsa-" + "y".repeat(30) })).toBe(v);
    // aprovação de outra versão não vale
    const old = voiceReadiness(ENV, { stazi: { fingerprint: "0".repeat(64), approved_at: "2026-10-08T12:00:00Z", sample_path: null } });
    expect(old.rows.find((r) => r.id === "stazi")!.approved).toBe(false);
    const ok = voiceReadiness(ENV, { stazi: { fingerprint: v, approved_at: "2026-10-18T12:00:00Z", sample_path: null } });
    expect(Object.fromEntries(ok.rows.map((r) => [r.id, r.approved]))).toEqual({ stazi: true, stazia: false });
  });

  it("o pedido leva só a fala e a voz do personagem (sem instrução de tom, sem direção, sem segredo); a chave vai no cabeçalho", async () => {
    const f = fakeGemini();
    const out = await new OfficialGeminiSpeech(ENV, f as any).synthesize("Porra, confira o raciocínio. [shouting]", { personality: "durona", acting: "INSTRUÇÃO PRIVADA", style: "brava", direction: { emotion: "impatient", intensity: 0.5 } });
    expect(out.mime).toBe("audio/mpeg");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash-tts:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(ENV.VERTEX_API_KEY);
    expect(init.redirect).toBe("error");
    const { body, text, voice } = pedidoGemini(init);
    expect(body).toEqual({
      contents: [{ role: "user", parts: [{ text: "Porra, confira o raciocínio. (shouting)" }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
    });
    expect([text, voice]).toEqual(["Porra, confira o raciocínio. (shouting)", "Kore"]);
    expect(String(init.body)).not.toMatch(/INSTRUÇÃO PRIVADA|brava|impatient|systemInstruction/);
    expect(String(init.body)).not.toContain(ENV.VERTEX_API_KEY);
    // o Durão e o Tranquilo falam com a voz do Stazi
    for (const p of ["durao", "acolhedor", "stazi"]) await new OfficialGeminiSpeech(ENV, f as any).synthesize("Olá.", { personality: p });
    expect(f.mock.calls.slice(1).map(([, i]) => pedidoGemini(i as RequestInit).voice)).toEqual(["Zubenelgenubi", "Zubenelgenubi", "Zubenelgenubi"]);
    // sem a chave do Vertex, o AI Studio (mesmo pedido, outro endereço)
    await new OfficialGeminiSpeech({ GEMINI_API_KEY: "chave-studio-falsa-de-teste-" + "z".repeat(30), TUTOR_VOICE_ALLOW_EXTERNAL: "1" }, f as any).synthesize("Olá.", { personality: "tranquila" });
    expect(f.mock.calls.at(-1)![0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent");
  });

  it("personalidade sem voz, texto vazio ou longo e voz não pronta não chamam o serviço", async () => {
    const f = fakeGemini();
    await expect(new OfficialGeminiSpeech(ENV, f as any).synthesize("Olá", { personality: "direto" })).rejects.toThrow(/não tem voz/);
    await expect(new OfficialGeminiSpeech(ENV, f as any).synthesize("  ", { personality: "durao" })).rejects.toThrow(/vazio/);
    await expect(new OfficialGeminiSpeech(ENV, f as any).synthesize("a".repeat(4001), { personality: "durao" })).rejects.toThrow(/4.000/);
    await expect(new OfficialGeminiSpeech({ VERTEX_API_KEY: ENV.VERTEX_API_KEY }, f as any).synthesize("Olá", { personality: "durao" })).rejects.toThrow(/autorizado/);
    expect(f).not.toHaveBeenCalled();
  });

  it("erro do serviço não vaza a chave nem o corpo; resposta sem áudio (bloqueio) falha; não repete sozinho", async () => {
    const f = vi.fn(async () => new Response(`erro com ${ENV.VERTEX_API_KEY}`, { status: 403 }));
    const e = await new OfficialGeminiSpeech(ENV, f as any).synthesize("Olá", { personality: "durao" }).catch((x) => x);
    expect(e.message).toMatch(/403/);
    expect(e.message).not.toContain(ENV.VERTEX_API_KEY);
    expect(f).toHaveBeenCalledTimes(1);
    const bloqueio = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason: "PROHIBITED_CONTENT", content: { parts: [{ text: "não" }] } }] })));
    await expect(new OfficialGeminiSpeech(ENV, bloqueio as any).synthesize("Olá", { personality: "durao" })).rejects.toThrow(/sem áudio válido \(PROHIBITED_CONTENT\)/);
    const rede = vi.fn(async () => { throw new Error(`falhou ${ENV.VERTEX_API_KEY}`); });
    const r = await new OfficialGeminiSpeech(ENV, rede as any).synthesize("Olá", { personality: "durao" }).catch((x) => x);
    expect(r.message).not.toContain(ENV.VERTEX_API_KEY);
  });

  it("o custo vem dos tokens que o Google informa (texto de entrada e áudio de saída); preço promocional até 31/12/2026", async () => {
    expect(geminiTtsPrice("gemini-3.8-flash-tts", new Date("2026-10-18T12:00:00Z"))).toEqual({ textIn: 0.5, audioOut: 9.0 });
    expect(geminiTtsPrice("gemini-3.8-flash-tts", new Date("2027-01-01T03:00:00Z"))).toEqual({ textIn: 1.0, audioOut: 18.0 });
    expect(geminiTtsPrice("outro-modelo")).toBeNull();
    const uso = { promptTokensDetails: [{ modality: "TEXT", tokenCount: 100 }], candidatesTokensDetails: [{ modality: "AUDIO", tokenCount: 750 }] };
    // 100 × 0,50 + 750 × 9,00 por milhão = US$ 0,00680 (30 s de fala)
    expect(geminiTtsCost("gemini-3.8-flash-tts", uso, new Date("2026-10-18T12:00:00Z"))).toBe(0.0068);
    expect(geminiTtsCost("gemini-3.8-flash-tts", { promptTokenCount: 100, candidatesTokenCount: 750 }, new Date("2026-10-18T12:00:00Z"))).toBe(0.0068);
    expect(geminiTtsCost("gemini-3.8-flash-tts", null)).toBeNull();
    const out = await new OfficialGeminiSpeech(ENV, fakeGemini() as any).synthesize("Isso. Diagnóstico e conduta certos.", { personality: "durao" });
    expect(out.costUsd).toBe(custoDe("Isso. Diagnóstico e conduta certos."));
    expect(out.costUsd).toBe(geminiTtsCost("gemini-3.8-flash-tts", usoDe("Isso. Diagnóstico e conduta certos.")));
    expect(out.seconds).toBeGreaterThan(0);
  });

  it("o Stazi sai afinado +3 semitons pelo mesmo afinador da voz ao vivo; a Stazia sem afinar; o mesmo texto dá o mesmo MP3", async () => {
    const pcm = pcmDe("Agora sim.");
    const stazi = await acabarVoz(pcm, TAXA, { semitons: 3, lufs: LUFS_ALVO.stazi });
    const stazia = await acabarVoz(pcm, TAXA, { semitons: 0, lufs: LUFS_ALVO.stazia });
    expect(stazi.mp3.equals(stazia.mp3)).toBe(false);
    expect((await acabarVoz(pcm, TAXA, { semitons: 3, lufs: LUFS_ALVO.stazi })).mp3.equals(stazi.mp3)).toBe(true);
    // o afinador mantém a duração (só muda o tom): as duas saem com a mesma duração depois de aparar
    expect(Math.abs(stazi.segundos - stazia.segundos)).toBeLessThan(0.05);
    // a frequência do tom sobe 2^(3/12) no Stazi: conta as passagens por zero do afinador puro
    const tom = seno(0.3, 1, 200);
    const zeros = (a: Float32Array) => a.slice(2400, -2400).reduce((n, v, i, arr) => (i && Math.sign(v) !== Math.sign(arr[i - 1]) ? n + 1 : n), 0);
    expect(zeros(afinarTudo(tom, { semitons: 3, taxa: TAXA }) as Float32Array) / zeros(tom)).toBeCloseTo(Math.pow(2, 3 / 12), 1);
    // o provedor usa o acabamento: o MP3 da rota é o mesmo do acabamento direto
    const out = await new OfficialGeminiSpeech(ENV, fakeGemini() as any).synthesize("Agora sim.", { personality: "durao" });
    expect(out.audio.equals(stazi.mp3)).toBe(true);
  });

  it("acabamento: loudness BS.1770 (seno de 997 Hz a −20 dBFS = −23 LUFS), limitador nunca passa do teto, pontas aparadas", () => {
    expect(loudnessLufs(seno(0.1, 3), TAXA)).toBeCloseTo(-23.0, 0);
    expect(loudnessLufs(seno(Math.SQRT1_2, 3), TAXA)).toBeCloseTo(-6.0, 0);
    expect(loudnessLufs(new Float32Array(TAXA), TAXA)).toBe(-Infinity);
    const alto = ganhoComLimite(seno(0.5, 1), TAXA, 12);
    const teto = Math.pow(10, PICO_MAX_DB / 20);
    expect(Math.max(...alto.map(Math.abs))).toBeLessThanOrEqual(teto + 1e-6);
    // fala baixa sobe até o volume das frases de espera do personagem (a 0,3 LU)
    const baixa = seno(0.05, 2, 300);
    expect(loudnessLufs(igualarVolume(baixa, TAXA, -20), TAXA)).toBeCloseTo(-20, 0);
    // silêncio de 0,5 s nas pontas sai, ficando ~60 ms de folga de cada lado
    const comPontas = new Float32Array(TAXA * 2);
    comPontas.set(seno(0.3, 1), TAXA / 2);
    const aparado = apararPontas(comPontas, TAXA);
    expect(aparado.length / TAXA).toBeGreaterThan(1.0);
    expect(aparado.length / TAXA).toBeLessThan(1.2);
    expect(Math.abs(aparado[0])).toBeLessThan(1e-3); // entrada suave, sem estalo
    expect(pcmParaFloat(Buffer.from([0x00, 0x80]))[0]).toBe(-1);
  });

  it("o cache separa voz, personagem e versão; ouvir de novo o mesmo texto não gera outra vez", () => {
    const a = new OfficialGeminiSpeech(ENV);
    const key = SpeechCache.key(a, { personality: "acolhedor" }, "Olá");
    expect(SpeechCache.key(a, { personality: "durao" }, "Olá")).not.toBe(key);
    expect(SpeechCache.key(new OfficialElevenLabsSpeech({ ...ENV, ELEVENLABS_API_KEY: "k".repeat(40), ELEVENLABS_VOICE_STAZI: "vozStaziTeste000001", ELEVENLABS_VOICE_STAZIA: "vozStaziaTeste00001" }), { personality: "acolhedor" }, "Olá")).not.toBe(key);
    expect(SpeechCache.key(new OfficialGeminiSpeech(ENV), { personality: "acolhedor" }, "Olá")).toBe(key);
    expect(a.cacheIdentity).toBe(`${voiceFingerprint("stazi", ENV)}:${voiceFingerprint("stazia", ENV)}`);
  });

  it("os textos de audição citam Stazi e Stazia (não mais o Nexus) e não trazem instrução de tom para o serviço ler", () => {
    expect(OFFICIAL_VOICES.stazi.sample).toContain("Eu sou o Stazi.");
    expect(OFFICIAL_VOICES.stazia.sample.startsWith("Eu sou a Stazia.")).toBe(true);
    for (const t of [...Object.values(OFFICIAL_VOICES).map((v) => v.sample), ...Object.values(VOICE_SCENARIOS).map((s) => s.text).filter(Boolean) as string[]]) {
      expect(t).not.toMatch(/Nexus|\[|\]|tom de|fale (num|com)|em voz/i);
    }
  });
});
