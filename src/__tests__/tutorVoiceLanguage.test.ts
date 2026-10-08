// @vitest-environment node
import { describe, expect, it } from "vitest";
import { refreshVoiceLanguage, TUTOR_SPOKEN_LANGUAGE, TUTOR_SPOKEN_REMINDER } from "../shared/tutor/voiceLanguage";
import { composeLiveInstructions, composeRealtimeInstructions } from "../../server/tutor/prompts";
import { actingInstructions, SpeechCache } from "../../server/tutor/speech";

describe("português brasileiro neutro do Nexus", () => {
  it("atualiza a direção antiga sem apagar contexto médico, pronúncias ou personalidade", () => {
    const medical = 'PRONÚNCIA DE TERMOS MÉDICOS\nAVC: a-vê-cê.\n\nNunca invente doses.\n\nProfessor: Durona sem filtro.\nContexto: questão aberta.';
    const old = `IDIOMA E SOTAQUE (vale para toda fala, do começo ao fim)\nUse sotaque de uma capital do Sudeste.\n\n${medical}\n\nLEMBRETE FINAL: português do Brasil com sotaque de brasileiro nativo (nada de sotaque americano), fala solta de gente de verdade, no jeito do seu professor, em toda fala.`;
    const next = refreshVoiceLanguage(old)!;
    expect(next.startsWith(TUTOR_SPOKEN_LANGUAGE)).toBe(true);
    expect(next.endsWith(TUTOR_SPOKEN_REMINDER)).toBe(true);
    expect(next).toContain(medical);
    expect(next).not.toContain("capital do Sudeste");
    expect(next).not.toContain("nada de sotaque americano");
    expect(refreshVoiceLanguage(next)).toBe(next);
  });

  it("preserva um formato desconhecido e recusa instruções vazias", () => {
    expect(refreshVoiceLanguage("Outro formato: regras médicas e ferramentas.")).toContain("Outro formato: regras médicas e ferramentas.");
    for (const empty of [null, undefined, "", "   ", {}]) expect(refreshVoiceLanguage(empty)).toBeNull();
  });

  it.each([composeRealtimeInstructions, composeLiveInstructions])("usa a mesma direção ao abrir uma sessão pelo servidor", (compose) => {
    const instructions = compose({ mode: "livre", persona: "Durona sem filtro", context: "Contexto médico", pronunciations: [{ term: "INEP", say: "inépi" }] });
    expect(instructions.startsWith(TUTOR_SPOKEN_LANGUAGE)).toBe(true);
    expect(instructions.endsWith(TUTOR_SPOKEN_REMINDER)).toBe(true);
    expect(instructions).toContain("Durona sem filtro");
    expect(instructions).toContain('INEP: "inépi"');
    expect(refreshVoiceLanguage(instructions)).toBe(instructions);
  });

  it("mantém a direção no TTS e inclui a atuação efetiva na chave de cache", () => {
    expect(actingInstructions({ acting: "Durona" })).toContain(TUTOR_SPOKEN_LANGUAGE);
    expect(actingInstructions({ acting: "Durona" })).toContain("Personagem: Durona");
    const provider = { name: "openai", model: "test" } as any;
    expect(SpeechCache.key(provider, { style: "calma" }, "Olá")).not.toBe(SpeechCache.key(provider, { style: "firme" }, "Olá"));
  });
});
