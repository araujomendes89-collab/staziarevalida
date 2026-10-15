// @vitest-environment node
/**
 * Dica do Tutor antes de responder (server/tutor/questionHint.ts): nasce DESLIGADA; com tudo ligado, a IA (simulada, sem rede)
 * recebe só enunciado e alternativas; dica que cita letra, gabarito ou resposta é barrada e vira dica de reserva.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HINT_FALLBACK, HINT_OFF, forgetHintUsage, hintLeak, questionHint, questionHintEnabled } from "../../server/tutor/questionHint";
import { forgetTutorSettings } from "../../server/tutor/settings";
import { TutorError } from "../../server/tutor/engine";

const USER: any = { id: "u1" };
const CTX = { statement: "Mulher de 19 anos no pronto-socorro. Qual é a conduta?", options: [{ id: "A", text: "Alt A" }, { id: "B", text: "Alt B" }], consent_pending: false, entitlement: { enabled: true, mode: "paid", can_text: true } };

function fakeDb(over: { ctx?: any; settingsEnabled?: boolean; ai?: boolean } = {}) {
  const asUser = vi.fn(async (_u: any, fn: string) => {
    if (fn === "app_question_hint_context") return "ctx" in over ? over.ctx : CTX;
    throw new Error(`asUser inesperada: ${fn}`);
  });
  const service = vi.fn(async (fn: string, args: any) => {
    if (fn === "ch_worker_tutor_settings") return { enabled: over.settingsEnabled ?? true };
    if (fn === "ch_worker_flag") return over.ai ?? true;
    return null;
  });
  return { asUser, service } as any;
}
const ENV = { ...process.env };
beforeEach(() => {
  process.env = { ...ENV, TUTOR_QUESTION_HINT: "1", TUTOR_AI_PROVIDER: "mock" };
  delete process.env.TUTOR_ENABLED;
  forgetHintUsage();
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("desligada por padrão", () => {
  it("sem TUTOR_QUESTION_HINT não há dica nem chamada de IA", async () => {
    delete process.env.TUTOR_QUESTION_HINT;
    expect(questionHintEnabled()).toBe(false);
    const db = fakeDb();
    const mock = vi.fn(() => ({ hint: "x".repeat(20) }));
    await expect(questionHint({ db, mockRespond: mock }, USER, "q1")).rejects.toThrow(HINT_OFF);
    expect(mock).not.toHaveBeenCalled();
    expect(db.asUser).not.toHaveBeenCalled();
  });
  it("Tutor desligado no painel ou no servidor também desliga", async () => {
    const db = fakeDb({ settingsEnabled: false });
    forgetTutorSettings(db);
    await expect(questionHint({ db, mockRespond: () => ({ hint: "x".repeat(20) }) }, USER, "q1")).rejects.toThrow(HINT_OFF);
    process.env.TUTOR_ENABLED = "false";
    expect(questionHintEnabled()).toBe(false);
  });
});

describe("ligada", () => {
  it("manda para a IA só enunciado e alternativas e devolve a dica", async () => {
    const db = fakeDb();
    forgetTutorSettings(db);
    const seen: any[] = [];
    const out = await questionHint({ db, mockRespond: (r: any) => (seen.push(r), { hint: "Releia o que a pergunta pede e pense nos dados do caso que mudam a conduta." }) }, USER, "q1");
    expect(out.source).toBe("ia");
    expect(out.hint).toContain("Releia");
    expect(seen).toHaveLength(1);
    expect(seen[0].input).toContain("Mulher de 19 anos");
    for (const proibido of ["gabarito", "correct_option", "explanation", "fonte"]) expect(seen[0].input.toLowerCase()).not.toContain(`"${proibido}`);
    expect(seen[0].system).toMatch(/nunca diga nem sugira qual alternativa/);
  });

  it("dica que cita letra ou gabarito é barrada, refeita uma vez e, se insistir, vira a dica de reserva", async () => {
    const db = fakeDb();
    forgetTutorSettings(db);
    const calls: string[] = [];
    const out = await questionHint({ db, mockRespond: (r: any) => (calls.push(r.input), { hint: "A alternativa B é a correta, confie nela." }) }, USER, "q1");
    expect(out).toEqual({ hint: HINT_FALLBACK, source: "reserva" });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("barrada");
    const again = await questionHint({ db, mockRespond: (r: any) => (r.input.includes("barrada") ? { hint: "Pense no que a pergunta pede antes de olhar as opções." } : { hint: "O gabarito é óbvio." }) }, USER, "q1");
    expect(again.source).toBe("ia");
    expect(HINT_FALLBACK).toBeTruthy();
    expect(hintLeak(HINT_FALLBACK)).toBeNull();
  });

  it("recusas: sem contexto (simulado, já respondida), aceite pendente, teste vencido, IA bloqueada, teto diário", async () => {
    const run = async (over: any, env: Record<string, string> = {}) => {
      Object.assign(process.env, env);
      const db = fakeDb(over);
      forgetTutorSettings(db);
      return questionHint({ db, mockRespond: () => ({ hint: "Pense no que a pergunta pede com calma." }) }, USER, "q1").catch((e) => e);
    };
    const semContexto = await run({ ctx: null });
    expect(semContexto).toBeInstanceOf(TutorError);
    expect((semContexto as TutorError).status).toBe(409);
    expect(((await run({ ctx: { ...CTX, consent_pending: true } })) as any).code).toBe("tutor_consent");
    expect(((await run({ ctx: { ...CTX, entitlement: { enabled: true, mode: "blocked" } } })) as TutorError).status).toBe(403);
    expect(((await run({ ai: false })) as TutorError).status).toBe(503);
    forgetHintUsage();
    process.env.TUTOR_QUESTION_HINT_DAILY = "1";
    expect((await run({})).source).toBe("ia");
    expect(((await run({})) as TutorError).status).toBe(429);
  });
});

describe("conferidor de vazamento", () => {
  it.each([
    ["A alternativa C está certa.", true], ["Opção B parece a melhor.", true], ["Letra D.", true], ["(B) é a melhor", true], ["O gabarito indica outra.", true],
    ["A resposta correta é a primeira.", true], ["Releia o enunciado e destaque a idade e a queixa principal.", false], ["Pense em qual dado do caso muda a conduta.", false],
  ])("%s", (texto, barra) => {
    expect(hintLeak(texto) !== null).toBe(barra);
  });
});
