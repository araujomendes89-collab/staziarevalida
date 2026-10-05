// @vitest-environment node
/** Comandos de voz do Tutor: o que o aluno faz falando (marcar, confirmar, ajuda, próxima, repetir, parar) e o que é conversa. */
import { describe, expect, it } from "vitest";
import { micErrorMessage, parseVoiceCommand, questionSpeech } from "../novo/app/tutor/voiceCommands.js";

const open = { questionOpen: true, picked: null, canNext: false };
const type = (t: string, ctx: any = open) => parseVoiceCommand(t, ctx);

describe("Comandos de voz", () => {
  it("marcar alternativa: aceita o nome da letra como o reconhecimento escreve (bê, cê, dê, se, de)", () => {
    expect(type("alternativa B")).toEqual({ type: "answer", option: "B" });
    expect(type("Acho que é a letra cê.")).toEqual({ type: "answer", option: "C" });
    expect(type("eu marco a dê")).toEqual({ type: "answer", option: "D" });
    expect(type("vou de A")).toEqual({ type: "answer", option: "A" });
    expect(type("letra se")).toEqual({ type: "answer", option: "C" });
    expect(type("alternativa de")).toEqual({ type: "answer", option: "D" });
    expect(type("fico com a alternativa bê")).toEqual({ type: "answer", option: "B" });
    expect(type("resposta é a letra A")).toEqual({ type: "answer", option: "A" });
  });

  it("letra solta ou pergunta sobre uma alternativa é conversa, não resposta", () => {
    expect(type("se o paciente tem febre, muda a conduta?").type).toBe("message");
    expect(type("de onde vem essa dor?").type).toBe("message");
    expect(type("a criança chia desde ontem").type).toBe("message");
    expect(type("por que a alternativa B não serve?").type).toBe("message");
    expect(type("como eu descarto a letra C nesse caso que você falou agora há pouco?").type).toBe("message");
    expect(type("a alternativa A é certa ou errada?").type).toBe("message");
  });

  it("só marca com questão aberta; confirmar e desmarcar só valem depois de marcar", () => {
    expect(type("alternativa B", { questionOpen: false }).type).toBe("message");
    expect(type("confirmo").type).toBe("message"); // nada marcado ainda
    const picked = { questionOpen: true, picked: "B" };
    expect(type("confirmo", picked)).toEqual({ type: "confirm" });
    expect(type("Isso mesmo!", picked)).toEqual({ type: "confirm" });
    expect(type("pode responder", picked)).toEqual({ type: "confirm" });
    expect(type("não", picked)).toEqual({ type: "cancel" });
    expect(type("alternativa cê", picked)).toEqual({ type: "answer", option: "C" }); // trocou de ideia
    expect(type("sim, mas por que não a outra?", picked).type).toBe("message");
  });

  it("ajuda, repetir, próxima e parar", () => {
    expect(type("me dá uma dica")).toEqual({ type: "hint" });
    expect(type("preciso de ajuda")).toEqual({ type: "hint" });
    expect(type("me ajuda a entender por que esse exame veio normal nesse paciente").type).toBe("message"); // pedido de explicação, não de dica
    expect(type("repete a questão")).toEqual({ type: "repeat" });
    expect(type("lê de novo")).toEqual({ type: "repeat" });
    expect(type("próxima", { canNext: true })).toEqual({ type: "next" });
    expect(type("manda a próxima", { canNext: true })).toEqual({ type: "next" });
    expect(type("próxima", { questionOpen: true, canNext: false }).type).toBe("message"); // com a questão aberta ainda não há próxima
    expect(type("Espera.")).toEqual({ type: "pause" });
    expect(type("pera aí", { questionOpen: false })).toEqual({ type: "pause" });
    expect(type("   ")).toEqual({ type: "none" });
  });

  it("o resto vai para o professor como foi dito", () => {
    expect(type("não sei nem por onde começar essa")).toEqual({ type: "message", text: "não sei nem por onde começar essa" });
  });

  it("leitura da questão e mensagens de erro do microfone", () => {
    const q = { options: [{ id: "A", text: "Oxigênio" }, { id: "B", text: "Salbutamol" }] };
    expect(questionSpeech(q, { stem: "Lactente com sibilância.", ask: "Qual a conduta?" })).toBe("Lactente com sibilância. Qual a conduta? Alternativa A: Oxigênio Alternativa B: Salbutamol");
    expect(micErrorMessage("not-allowed")).toMatch(/bloqueou o microfone/);
    expect(micErrorMessage("unsupported")).toMatch(/Chrome, o Edge ou o Safari/);
    expect(micErrorMessage(null)).toBeNull();
  });
});
