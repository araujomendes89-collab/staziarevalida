// @vitest-environment node
/**
 * Pronúncia dos nomes na voz (decisão do dono, 18/10/2026): "Estázia" (Stazia, StaziaMed, Stazia Arena, Stazia Coins), "Estázi"
 * (Stazi) e "Enamédi" (ENAMED). Só no texto que vai para o serviço de voz; a tela segue com o texto escrito. Na voz ao vivo, a
 * mesma regra vai como instrução. Sem rede.
 */
import { describe, expect, it, vi } from "vitest";
import { PRONUNCIAS, textoParaVoz } from "../../server/tutor/pronuncia";
import { OfficialGeminiSpeech } from "../../server/tutor/geminiTts";
import { fingerprintOf, fingerprintParts } from "../../server/tutor/officialVoices";
import { TUTOR_REALTIME_LANGUAGE, composeLiveInstructions, composeRealtimeInstructions } from "../../server/tutor/prompts";
import { FRASES_ESPERA } from "../../server/tutor/conhecimento/frasesEspera";
import { GEMINI_VOZ_ENV as ENV, pedidoGemini, respostaGemini } from "./helpers/vozGemini";

describe("pronúncia dos nomes no texto da voz", () => {
  it("troca a palavra inteira, sem diferenciar maiúsculas, e mantém a pontuação", () => {
    expect(textoParaVoz("Eu sou a Stazia.")).toBe("Eu sou a Estázia.");
    expect(textoParaVoz("Eu sou o Stazi, teu professor.")).toBe("Eu sou o Estázi, teu professor.");
    expect(textoParaVoz("Stazi, Stazi! Stazi? (Stazi) “Stazi”…")).toBe("Estázi, Estázi! Estázi? (Estázi) “Estázi”…");
    expect(textoParaVoz("STAZIA e stazia e StAzIa")).toBe("Estázia e Estázia e Estázia");
    expect(textoParaVoz("Bem-vindo ao StaziaMed!")).toBe("Bem-vindo ao Estázia Médi!");
    expect(textoParaVoz("staziamed, STAZIAMED")).toBe("Estázia Médi, Estázia Médi");
    expect(textoParaVoz("Você ganhou 30 Stazia Coins na Stazia Arena.")).toBe("Você ganhou 30 Estázia Coins na Estázia Arena.");
    expect(textoParaVoz("No ENAMED 2025 caiu isso.")).toBe("No Enamédi 2025 caiu isso.");
    expect(textoParaVoz("Enamed, enamed: ENAMED/Revalida")).toBe("Enamédi, Enamédi: Enamédi/Revalida");
    expect(textoParaVoz("Stazia-Arena")).toBe("Estázia-Arena");
  });

  it("não estraga e-mail, link, endereço de site nem palavra que só contém o nome", () => {
    for (const fixo of [
      "stazia.com.br", "www.stazia.com.br", "suporte@stazia.com.br", "https://staziamed.com.br/novo", "staziamed.com.br.",
      "http://stazi.app/x", "enamed.inep.gov.br", "Anastazia", "Stazias", "Stazinho", "StaziaArena2", "ENAMEDS", "pré-enamedista",
    ]) expect(textoParaVoz(fixo), fixo).toBe(fixo);
    expect(textoParaVoz("Escreva para suporte@stazia.com.br ou entre em stazia.com.br, a Stazia responde."))
      .toBe("Escreva para suporte@stazia.com.br ou entre em stazia.com.br, a Estázia responde.");
    // texto sem os nomes passa igual (inclusive espaços e quebras de linha)
    const igual = "Agora sim!\n  Você usou o enunciado — e a conduta fecha.";
    expect(textoParaVoz(igual)).toBe(igual);
    expect(Object.keys(PRONUNCIAS).sort()).toEqual(["enamed", "stazi", "stazia", "staziamed"]);
  });

  it("vai para o Gemini TTS só no pedido de voz; o texto da tela não muda; a pronúncia entra na versão da voz", async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => respostaGemini(pedidoGemini(init).text));
    const texto = "Eu sou a Stazia. Bora pro ENAMED, e escreve pra suporte@stazia.com.br.";
    await new OfficialGeminiSpeech(ENV, f as any).synthesize(texto, { personality: "durona" });
    expect(pedidoGemini(f.mock.calls[0][1] as RequestInit).text).toBe("Eu sou a Estázia. Bora pro Enamédi, e escreve pra suporte@stazia.com.br.");
    expect(texto).toContain("Stazia."); // o original (o da tela) segue escrito
    const parts = fingerprintParts("stazia", ENV) as any;
    expect(parts.pronunciation.words).toEqual(PRONUNCIAS);
    expect(fingerprintOf({ ...parts, pronunciation: { ...parts.pronunciation, version: "outra" } })).not.toBe(fingerprintOf(parts));
  });

  it("voz ao vivo: a instrução curta de pronúncia vai em todos os caminhos (ponte do Gemini, GPT-Live e Realtime)", () => {
    const linha = 'Pronuncie Stazia como "Estázia" (também em StaziaMed, Stazia Arena e Stazia Coins), Stazi como "Estázi" e ENAMED como "Enamédi".';
    expect(TUTOR_REALTIME_LANGUAGE).toContain(linha);
    const o = { mode: "livre" as any, persona: "persona", context: "contexto", personaId: "durona" };
    expect(composeLiveInstructions(o)).toContain(linha);
    expect(composeRealtimeInstructions(o)).toContain(linha);
  });

  it("as 32 frases de espera gravadas não falam esses nomes: não precisam ser regravadas", () => {
    const todas = Object.values(FRASES_ESPERA).flat() as string[];
    expect(todas).toHaveLength(32);
    expect(todas.filter((t) => textoParaVoz(t) !== t)).toEqual([]);
  });
});
