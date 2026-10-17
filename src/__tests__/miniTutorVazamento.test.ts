// @vitest-environment node
/**
 * Mini Tutor (revisão de 17/10/2026): com a questão ABERTA, a conferência de segurança barra os jeitos de confirmar a letra sem a
 * palavra "alternativa" ("Isso mesmo, é a B", "Vai na B", "Pode marcar a B") e qualquer reação ao palpite do aluno ("é a B?").
 * Pistas de verdade (sem letra certa, sem sim/não ao palpite) continuam passando. Só regras de software, sem IA.
 */
import { describe, expect, it } from "vitest";
import { safetyCheck, type SafetyContext } from "../../server/tutor/safety";
import { NO_EVALUATION, type TutorOutput } from "../../server/tutor/prompts";

const out = (reply: string): TutorOutput => ({ reply, grounding: "GENERAL", citations: [], evaluation: NO_EVALUATION, justification: "NONE", reveals_answer: false, suggested_replies: [] });
const ctx = (aluno: string, open = true, hintLevel: number | null = null): SafetyContext => ({
  blocks: [], supportTerms: [], conversationTexts: [aluno], hintLevel, hasUpdateCard: false, profanity: "off",
  question: { open, officialLetter: "B", officialText: "Solicitar tomografia de crânio sem contraste" },
});
const vaza = (reply: string, aluno = "Me dá uma ajuda aqui.", open = true) => safetyCheck(out(reply), ctx(aluno, open)).violations.some((v) => v.code === "answer_leak");

describe("confirmação da letra com a questão aberta", () => {
  it.each([
    "Isso mesmo, é a B.", "Sim, é a B.", "Sim! Pode marcar a B sem medo.", "Você acertou: B.", "Confirmo: B.", "Vai na B.", "Exato. Marca B e segue.",
    "Seu raciocínio está certo, pode responder B.", "É essa mesma, a B.", "A B está certa.", "Alternativa B é a correta.", "Fica com a B.", "B mesmo, sem medo.",
  ])("barra: %s", (f) => expect(vaza(f, "é a B?")).toBe(true));

  it.each(["Isso mesmo, é a B.", "Vai na B.", "Pode marcar a B.", "Você acertou: B.", "Confirmo: B."])("barra mesmo sem palpite do aluno: %s", (f) => expect(vaza(f)).toBe(true));

  it("reação ao palpite (sim ou não) é barrada, mesmo sem dizer a letra", () => {
    for (const aluno of ["é a B?", "Acho que é a B, só confirma", "letra c", "D?", "Marquei a A, tá certo?"]) {
      for (const r of ["Sim!", "Não, pensa de novo.", "Você acertou.", "Seu caminho está certo.", "Errou, olha o tempo de evolução.", "É essa mesma.", "Não é essa."]) {
        expect(vaza(r, aluno), `${aluno} → ${r}`).toBe(true);
      }
    }
  });

  it("pistas de verdade passam (sem a letra certa e sem reagir ao palpite)", () => {
    for (const [aluno, r] of [
      ["é a B?", "Não vou confirmar ainda. Me diz por que você pensou nela: qual dado do caso te levou até lá?"],
      ["Me dá uma ajuda aqui.", "Olhe a idade e o tempo de evolução: o que isso muda no raciocínio?"],
      ["Me ajuda mais um pouco.", "A A sai porque não trata a causa; a D sai porque é exame de seguimento, não de urgência."],
      ["Qual a diferença entre a C e a D?", "A diferença está no momento: uma é conduta inicial e a outra, de seguimento. Qual delas cabe agora?"],
      ["A paciente tem quantos anos?", "A paciente tem a idade do enunciado; releia a primeira linha."],
    ]) expect(vaza(r, aluno), r).toBe(false);
  });

  it("questão respondida (ou resolução pedida) explica tudo, sem trava", () => {
    expect(vaza("Isso mesmo, é a B.", "é a B?", false)).toBe(false);
    expect(safetyCheck(out("A resposta é a B."), ctx("Me mostra a resolução.", true, 5)).violations.some((v) => v.code === "answer_leak")).toBe(false);
  });
});
