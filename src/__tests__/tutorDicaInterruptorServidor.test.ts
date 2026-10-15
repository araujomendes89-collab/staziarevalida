// @vitest-environment node
/**
 * Interruptor da dica do Tutor (painel): a dica liga pelo painel OU pela variável TUTOR_QUESTION_HINT=1, nasce desligada,
 * e em simulado (sem contexto de treino) nunca devolve dica nem chama a IA.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HINT_OFF, forgetHintUsage, questionHint, questionHintEnabled } from "../../server/tutor/questionHint";
import { DEFAULT_SETTINGS, forgetTutorSettings } from "../../server/tutor/settings";

const USER: any = { id: "u1" };
const CTX = { statement: "Mulher de 19 anos no pronto-socorro. Qual é a conduta?", options: [{ id: "A", text: "Alt A" }, { id: "B", text: "Alt B" }], consent_pending: false, entitlement: { enabled: true, mode: "paid", can_text: true } };
const DICA = "Releia o que a pergunta pede e pense nos dados do caso que mudam a conduta.";

function fakeDb(over: { panelHint?: boolean | undefined; ctx?: any } = {}) {
  const asUser = vi.fn(async (_u: any, fn: string) => {
    if (fn === "app_question_hint_context") return "ctx" in over ? over.ctx : CTX;
    throw new Error(`asUser inesperada: ${fn}`);
  });
  const service = vi.fn(async (fn: string) => {
    if (fn === "ch_worker_tutor_settings") return { enabled: true, ...(over.panelHint === undefined ? {} : { question_hint_enabled: over.panelHint }) };
    if (fn === "ch_worker_flag") return true;
    return null;
  });
  return { asUser, service } as any;
}
const ENV = { ...process.env };
beforeEach(() => {
  process.env = { ...ENV, TUTOR_AI_PROVIDER: "mock" };
  delete process.env.TUTOR_QUESTION_HINT;
  delete process.env.TUTOR_ENABLED;
  forgetHintUsage();
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("interruptor da dica do Tutor", () => {
  it("padrão: desligada (configuração padrão, painel sem a chave e painel desligado), sem IA e sem ler a questão", async () => {
    expect(DEFAULT_SETTINGS.question_hint_enabled).toBe(false);
    expect(questionHintEnabled()).toBe(false);
    expect(questionHintEnabled(process.env, false)).toBe(false);
    for (const panelHint of [undefined, false]) {
      const db = fakeDb({ panelHint });
      forgetTutorSettings(db);
      const mock = vi.fn(() => ({ hint: DICA }));
      await expect(questionHint({ db, mockRespond: mock }, USER, "q1")).rejects.toThrow(HINT_OFF);
      expect(mock).not.toHaveBeenCalled();
      expect(db.asUser).not.toHaveBeenCalled();
    }
  });

  it("ligada pelo painel (sem a variável): devolve a dica", async () => {
    const db = fakeDb({ panelHint: true });
    forgetTutorSettings(db);
    const out = await questionHint({ db, mockRespond: () => ({ hint: DICA }) }, USER, "q1");
    expect(out).toEqual({ hint: DICA, source: "ia" });
  });

  it("ligada pela variável TUTOR_QUESTION_HINT=1 (painel desligado): continua valendo", async () => {
    process.env.TUTOR_QUESTION_HINT = "1";
    const db = fakeDb({ panelHint: false });
    forgetTutorSettings(db);
    expect((await questionHint({ db, mockRespond: () => ({ hint: DICA }) }, USER, "q1")).source).toBe("ia");
  });

  it("Tutor desligado no servidor (TUTOR_ENABLED=false) desliga a dica mesmo com o painel ligado", async () => {
    process.env.TUTOR_ENABLED = "false";
    expect(questionHintEnabled(process.env, true)).toBe(false);
    const db = fakeDb({ panelHint: true });
    forgetTutorSettings(db);
    await expect(questionHint({ db, mockRespond: () => ({ hint: DICA }) }, USER, "q1")).rejects.toThrow(HINT_OFF);
  });

  it("simulado nunca recebe a dica: sem contexto de treino o banco devolve nulo, o servidor recusa e a IA não é chamada", async () => {
    process.env.TUTOR_QUESTION_HINT = "1";
    const db = fakeDb({ panelHint: true, ctx: null });
    forgetTutorSettings(db);
    const mock = vi.fn(() => ({ hint: DICA }));
    await expect(questionHint({ db, mockRespond: mock }, USER, "q-simulado")).rejects.toMatchObject({ status: 409 });
    expect(mock).not.toHaveBeenCalled();
  });
});
