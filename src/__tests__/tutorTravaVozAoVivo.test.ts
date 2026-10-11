// @vitest-environment node
/**
 * VZ01 (2026-10-10): a mesma autorização (TUTOR_VOICE_ALLOW_EXTERNAL) ligava a audição das vozes oficiais pela equipe E a voz ao vivo
 * dos alunos, com microfone (a fala do aluno ia para o serviço de voz ao vivo). Agora são duas travas:
 *   TUTOR_VOICE_ALLOW_EXTERNAL=1        continua bastando para a equipe ouvir e aprovar as vozes oficiais;
 *   TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1   trava nova, desligada por padrão: a voz ao vivo (e a fala do aluno pelo microfone) exige as duas.
 * Só configuração: nenhuma chamada externa, nenhum banco.
 */
import { describe, expect, it } from "vitest";
import { elevenLabsReadiness } from "../../server/tutor/officialVoices";
import { realtimeConfig, voiceReady } from "../../server/tutor/realtime";
import { geminiVoiceConfig, liveConfig, LIVE_VOICE_LOCK } from "../../server/tutor/voiceProviders";

const OKEY = "sk-" + "o".repeat(40);
const GKEY = "AIza" + "g".repeat(40);
/** Tudo pronto para a voz ao vivo, menos as travas. */
const BASE = {
  OPENAI_API_KEY: OKEY, OPENAI_REALTIME_MODEL: "gpt-realtime-2.1", OPENAI_LIVE_MODEL: "gpt-live-1", GEMINI_API_KEY: GKEY,
  ELEVENLABS_API_KEY: "chave-falsa-de-teste-" + "x".repeat(40),
  ELEVENLABS_VOICE_TRANQUILO: "vozTranquiloTeste01", ELEVENLABS_VOICE_DURONA: "vozDuronaTeste0001", ELEVENLABS_VOICE_DIRETO: "vozDiretoTeste0001",
} as NodeJS.ProcessEnv;
const EQUIPE = { ...BASE, TUTOR_VOICE_ALLOW_EXTERNAL: "1" } as NodeJS.ProcessEnv;
const AS_DUAS = { ...EQUIPE, TUTOR_LIVE_VOICE_ALLOW_EXTERNAL: "1" } as NodeJS.ProcessEnv;
const aoVivo = (env: NodeJS.ProcessEnv) => ({ realtime: realtimeConfig(env), live: liveConfig(env), gemini: geminiVoiceConfig(env) });

describe("VZ01: travas separadas para a audição da equipe e a voz ao vivo dos alunos", () => {
  it("só a autorização da equipe: as vozes oficiais ficam prontas para a audição, mas a voz ao vivo continua desligada", () => {
    expect(elevenLabsReadiness(EQUIPE).pending).toBeNull();
    expect(elevenLabsReadiness(EQUIPE).rows.every((r) => r.ready)).toBe(true);
    const cfg = aoVivo(EQUIPE);
    for (const c of [cfg.realtime, cfg.live, cfg.gemini]) {
      expect(c.ready).toBe(false);
      expect(c.key).toBeNull(); // a chave não sai da configuração sem as duas travas
      expect(c.pending).toMatch(/TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1/);
    }
    expect(voiceReady(cfg).ready).toBe(false); // sem voz ao vivo: a Nexus não oferece a voz reserva com microfone
  });

  it("a voz ao vivo exige as duas travas: só a nova também não basta", () => {
    const soNova = aoVivo({ ...BASE, TUTOR_LIVE_VOICE_ALLOW_EXTERNAL: "1" });
    for (const c of [soNova.realtime, soNova.live, soNova.gemini]) {
      expect(c.ready).toBe(false);
      expect(c.pending).toMatch(/TUTOR_VOICE_ALLOW_EXTERNAL=1/);
      expect(c.pending).not.toMatch(/TUTOR_LIVE_VOICE_ALLOW_EXTERNAL/); // só pede o que falta
    }
    const nenhuma = aoVivo(BASE);
    for (const c of [nenhuma.realtime, nenhuma.live, nenhuma.gemini]) {
      expect(c.pending).toMatch(/TUTOR_VOICE_ALLOW_EXTERNAL=1/);
      expect(c.pending).toMatch(/TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1/);
    }
    const prontas = aoVivo(AS_DUAS);
    expect(prontas.realtime).toMatchObject({ ready: true, model: "gpt-realtime-2.1", key: OKEY, pending: null });
    expect(prontas.live).toMatchObject({ ready: true, model: "gpt-live-1", key: OKEY, pending: null });
    expect(prontas.gemini).toMatchObject({ ready: true, key: GKEY, pending: null });
    expect(voiceReady(prontas).ready).toBe(true);
  });

  it("qualquer valor diferente de 1 deixa a voz ao vivo desligada (desligada por padrão)", () => {
    for (const v of ["", "0", "true", "sim", " 1"]) {
      expect(aoVivo({ ...EQUIPE, TUTOR_LIVE_VOICE_ALLOW_EXTERNAL: v }).realtime.ready).toBe(false);
    }
  });

  it("a trava nova não mexe na audição da equipe nem na voz do professor", () => {
    expect(elevenLabsReadiness(AS_DUAS).rows.every((r) => r.ready)).toBe(true);
    // a trava da equipe continua mandando nas vozes oficiais: sem ela, nada fica pronto, com ou sem a trava nova
    expect(elevenLabsReadiness({ ...BASE, TUTOR_LIVE_VOICE_ALLOW_EXTERNAL: "1" }).rows.every((r) => !r.ready)).toBe(true);
  });

  it("mensagem para a equipe em português simples, sem nome de fornecedor, e a mesma para os três caminhos da voz ao vivo", () => {
    const cfg = aoVivo(EQUIPE);
    expect(new Set([cfg.realtime.pending, cfg.live.pending, cfg.gemini.pending]).size).toBe(1);
    expect(cfg.realtime.pending).toMatch(/^Voz ao vivo dos alunos desligada/);
    expect(cfg.realtime.pending).toMatch(/microfone/);
    expect(cfg.realtime.pending).not.toMatch(/OpenAI|Google|Gemini|ElevenLabs|Claude/i);
    expect(LIVE_VOICE_LOCK).toBe("TUTOR_LIVE_VOICE_ALLOW_EXTERNAL");
  });
});
