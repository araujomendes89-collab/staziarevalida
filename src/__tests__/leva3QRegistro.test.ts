// @vitest-environment node
/**
 * Leva 3, aba Questões: as ações novas do Registro (figura da questão, comentário decidido pelo revisor) aparecem em português,
 * com a questão, o que mudou e a nota, sem código interno. (O teste registroAdministracao confere que toda ação gravada pelas
 * migrações tem nome; este confere o texto de cada uma.)
 */
import { describe, expect, it } from "vitest";
import { auditLabel, auditSummary } from "../novo/app/admin/auditLog.js";

const INTERNAL = /question\.|figure_|comment_|expected_conduct|explanation_|inep_intent|revalida_|enamed_|\bapprove\b|\breturn\b/;
const TARGET = "revalida_2025_1_q045";

describe("Registro — Questões, leva 3", () => {
  it("figura enviada, trocada e retirada", () => {
    const sent = { action: "question.figure_set", target: TARGET, details: { code: "REV-2025.1-Q045", replaced: false, alt: "Eletrocardiograma com supradesnivelamento de ST" } };
    expect(auditLabel(sent)).toBe("Figura da questão enviada");
    expect(auditSummary(sent)).toBe("REV-2025.1-Q045 · Figura nova · Texto alternativo: Eletrocardiograma com supradesnivelamento de ST");
    const swapped = { ...sent, details: { ...sent.details, replaced: true } };
    expect(auditSummary(swapped)).toMatch(/Figura trocada/);
    const removedCites = { action: "question.figure_removed", target: TARGET, details: { code: "REV-2025.1-Q045", needs_image: true } };
    expect(auditLabel(removedCites)).toBe("Figura da questão retirada");
    expect(auditSummary(removedCites)).toBe("REV-2025.1-Q045 · A questão cita uma figura: saiu dos treinos até uma nova figura ser enviada");
    expect(auditSummary({ ...removedCites, details: { code: "REV-2025.1-Q045", needs_image: false } })).toMatch(/continua nos treinos, sem figura/);
    for (const e of [sent, swapped, removedCites]) expect(auditSummary(e)).not.toMatch(INTERNAL);
  });

  it("comentário aprovado ou devolvido pelo revisor: a questão, o que foi liberado ou continua escondido e a nota", () => {
    const approved = { action: "question.comment_approved", target: TARGET, details: { code: "REV-2025.1-Q045", campos: ["explanation_B", "expected_conduct", "inep_intent"], note: "Conferi nas diretrizes vigentes." } };
    expect(auditLabel(approved)).toBe("Comentário da questão aprovado pelo revisor");
    expect(auditSummary(approved)).toBe("Revalida 2025/1, questão 45 · Liberado ao aluno: explicação da B, conduta esperada, o que a questão avalia · Nota: Conferi nas diretrizes vigentes.");
    const returned = { action: "question.comment_returned", target: TARGET, details: { code: "REV-2025.1-Q045", campos: ["expected_conduct"], note: "Falta citar a oximetria." } };
    expect(auditLabel(returned)).toBe("Comentário da questão devolvido pelo revisor");
    expect(auditSummary(returned)).toBe("Revalida 2025/1, questão 45 · Continua escondido do aluno: conduta esperada · Nota: Falta citar a oximetria.");
    for (const e of [approved, returned]) expect(auditSummary(e)).not.toMatch(INTERNAL);
  });
});
