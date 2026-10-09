// @vitest-environment node
/**
 * Limites das respostas da IA: a conferência recusa texto longo demais e lista com itens demais, então a IA precisa
 * saber dos limites ANTES de responder. O formato enviado ao provedor leva cada limite na descrição do campo (os
 * provedores não aceitam maxLength/maxItems direto). Caso real (2026-10-09): a Classificação de um PDF falhou 3 vezes com
 * "$.population: texto longo demais; $.care_setting: texto longo demais" porque a IA nunca soube do limite de 120.
 */
import { describe, expect, it } from "vitest";
import { toProviderSchema, validate, type Schema } from "../../server/contentHub/ai/schema";
import { PROMPTS } from "../../server/contentHub/ai/prompts";

describe("formato enviado ao provedor", () => {
  it("texto com limite leva o limite na descrição (e não leva maxLength)", () => {
    expect(toProviderSchema({ type: "string", maxLength: 120 })).toEqual({ type: "string", description: "Máximo de 120 caracteres." });
    expect(toProviderSchema({ type: "string", minLength: 8, maxLength: 1200, description: "Trecho literal." })).toEqual({ type: "string", description: "Trecho literal. Máximo de 1200 caracteres." });
  });

  it("lista com limite leva o limite na descrição (e não leva maxItems)", () => {
    expect(toProviderSchema({ type: "array", maxItems: 5, items: { type: "string" } })).toEqual({ type: "array", description: "No máximo 5 itens.", items: { type: "string" } });
  });

  it("sem limite nada muda; os limites aparecem em qualquer profundidade", () => {
    expect(toProviderSchema({ type: "string" })).toEqual({ type: "string" });
    expect(toProviderSchema({ type: "string", enum: ["a", "b"] })).toEqual({ type: "string", enum: ["a", "b"] });
    const schema: Schema = {
      type: "object",
      additionalProperties: false,
      required: ["itens"],
      properties: { itens: { type: "array", maxItems: 3, items: { type: "object", properties: { nome: { type: "string", maxLength: 40 } } } } },
    };
    const out = toProviderSchema(schema) as any;
    expect(out.properties.itens.description).toBe("No máximo 3 itens.");
    expect(out.properties.itens.items.properties.nome.description).toBe("Máximo de 40 caracteres.");
    expect(JSON.stringify(out)).not.toMatch(/maxLength|maxItems|minLength/);
  });
});

describe("Classificação da Central de Conteúdo", () => {
  it("a IA recebe o limite de população e de cenário e a instrução de escrever curto", () => {
    const sent = toProviderSchema(PROMPTS.classify.schema) as any;
    expect(sent.properties.population.description).toContain("Máximo de 120 caracteres.");
    expect(sent.properties.care_setting.description).toContain("Máximo de 120 caracteres.");
    expect(PROMPTS.classify.system).toMatch(/"population"/);
    expect(PROMPTS.classify.system).toMatch(/"care_setting"/);
    expect(PROMPTS.classify.system).toMatch(/poucas palavras/);
  });

  it("a conferência continua recusando o que passa do limite (nada é consertado)", () => {
    const longo = "x".repeat(121);
    const errors = validate(PROMPTS.classify.schema, { area_codes: [], node_ids: [], suggestions: [], population: longo, care_setting: "" });
    expect(errors).toEqual(["$.population: texto longo demais"]);
  });
});
