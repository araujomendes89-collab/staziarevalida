import { describe, it, expect } from "vitest";
import stationsSeed from "../../server/checklistBank/data/stations.seed.json";
import eventsSeed from "../../server/checklistBank/data/events.seed.json";
import {
  CatalogValidationError,
  loadEvents,
  loadStations,
  normalizeStation,
  toLite,
  validateStation,
} from "../shared/checklistBank/catalog";
import { computeScore, gradeValue, isFailed } from "../shared/checklistBank/scoring";
import { suggestGrade } from "../shared/checklistBank/autoGrade";
import { getEventStatus } from "../shared/checklistBank/eventStatus";
import type { ChecklistAnswer, ChecklistItem, Station } from "../shared/checklistBank/types";

const stations = loadStations(stationsSeed);
const byId = (id: string) => stations.find((s) => s.id === id) as Station;

const allCorrect = (station: Station): ChecklistAnswer[] =>
  station.checklist_items.map((i) => ({ id: i.id, grade: "Correct", subitems: [] }));

const ruleItem = (subitemCount: number, partial: number | null = 0.5): ChecklistItem => ({
  id: "x",
  order: 1,
  phase: "Anamnese",
  content: "",
  tip: "",
  grades: { correct: 1, partial, incorrect: 0 },
  criteria: { correct: "", incorrect: "" },
  subitems: Array.from({ length: subitemCount }, (_, i) => ({ id: `s${i + 1}`, text: `Subitem ${i + 1}` })),
  auto_grade_rule: "all/half/none",
});
const firstN = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

describe("Banco de Checklists — seed", () => {
  it("carrega as 10 estações do seed, cada uma somando 10,0", () => {
    expect(stations).toHaveLength(10);
    for (const station of stations) {
      const total = station.checklist_items.reduce((sum, i) => sum + i.grades.correct, 0);
      expect(total).toBeCloseTo(10, 6);
      expect(validateStation(station)).toEqual([]);
    }
  });

  it("gera ids estáveis para os itens e marca o conteúdo como pendente de revisão médica", () => {
    const station = byId("seed-01");
    expect(station.checklist_items[0].id).toBe("seed-01-i1");
    expect(new Set(station.checklist_items.map((i) => i.id)).size).toBe(station.checklist_items.length);
    expect(stations.every((s) => s.medical_review === "pending")).toBe(true);
    expect(stations.every((s) => s.is_pro_only === false)).toBe(true);
  });

  it("rejeita estação que não soma 10,0", () => {
    const broken = JSON.parse(JSON.stringify(stationsSeed));
    broken[0].checklist_items[0].grades.correct += 0.5;
    expect(() => loadStations(broken)).toThrow(CatalogValidationError);
    try {
      loadStations(broken);
    } catch (e) {
      expect((e as CatalogValidationError).problems.join(" ")).toContain("seed-01: checklist soma 10.500");
    }
  });

  it("rejeita área desconhecida e parcial fora do intervalo", () => {
    const raw = JSON.parse(JSON.stringify(stationsSeed[1]));
    raw.area = "Medicina Preventiva";
    const withPartial = raw.checklist_items.find((i: any) => i.grades.partial !== null);
    withPartial.grades.partial = withPartial.grades.correct;
    const problems = validateStation(normalizeStation(raw));
    expect(problems.some((p) => p.includes("área desconhecida"))).toBe(true);
    expect(problems.some((p) => p.includes("parcial"))).toBe(true);
  });

  it("a versão lite não expõe roteiro, impressos nem checklist", () => {
    const lite = toLite(byId("seed-02")) as Record<string, unknown>;
    for (const key of ["actor_script", "doctor_scene", "doctor_tasks", "pressings", "checklist_items", "summary"]) {
      expect(lite).not.toHaveProperty(key);
    }
    expect(lite).toMatchObject({ id: "seed-02", area: "Clínica Médica" });
  });

  it("valida o simulado de exemplo: 5 estações existentes e janela coerente", () => {
    const events = loadEvents(eventsSeed, stations);
    expect(events).toHaveLength(1);
    expect(events[0].station_ids).toHaveLength(5);

    const bad = JSON.parse(JSON.stringify(eventsSeed));
    bad[0].station_ids = ["seed-01", "nao-existe"];
    expect(() => loadEvents(bad, stations)).toThrow(/precisa de 5 estações[\s\S]*estação inexistente/);
  });
});

describe("Banco de Checklists — nota", () => {
  it("todos corretos = 10,0 e 100%", () => {
    const station = byId("seed-01");
    expect(computeScore(station, allCorrect(station))).toMatchObject({ score: 10, max_score: 10, correctness: 100 });
  });

  it("itens sem resposta valem o nível incorreto; ids desconhecidos são ignorados", () => {
    const station = byId("seed-03");
    const result = computeScore(station, [{ id: "inventado", grade: "Correct", subitems: [] }]);
    expect(result.score).toBe(0);
    expect(result.correctness).toBe(0);
  });

  it("soma o valor do nível escolhido em cada item, inclusive o parcial", () => {
    const station = byId("seed-01");
    const threeLevel = station.checklist_items.find((i) => i.grades.partial !== null) as ChecklistItem;
    const answers: ChecklistAnswer[] = allCorrect(station).map((a) =>
      a.id === threeLevel.id ? { ...a, grade: "Partial" } : a
    );
    const expected = 10 - threeLevel.grades.correct + (threeLevel.grades.partial as number);
    const result = computeScore(station, answers);
    expect(result.score).toBeCloseTo(expected, 6);
    expect(result.correctness).toBeCloseTo(expected * 10, 1);
  });

  it("'Parcial' num item de 2 níveis vale como incorreto", () => {
    const twoLevel = byId("seed-01").checklist_items.find((i) => i.grades.partial === null) as ChecklistItem;
    expect(gradeValue(twoLevel, "Partial")).toBe(twoLevel.grades.incorrect);
  });

  it("agrupa a nota por fase", () => {
    const station = byId("seed-05");
    const result = computeScore(station, allCorrect(station));
    const phaseTotal = result.by_phase.reduce((sum, p) => sum + p.max_score, 0);
    expect(phaseTotal).toBeCloseTo(10, 6);
    expect(result.by_phase.every((p) => p.score === p.max_score)).toBe(true);
  });

  it("reprovada abaixo de 60%", () => {
    expect(isFailed(59.9)).toBe(true);
    expect(isFailed(60)).toBe(false);
    expect(isFailed(70, 75)).toBe(true);
  });
});

describe("Banco de Checklists — sugestão automática de nível", () => {
  it.each([
    // [subitens, marcados, nível esperado] — conferido com os critérios do seed
    [4, 4, "Correct"],
    [4, 2, "Partial"],
    [4, 1, "Incorrect"],
    [5, 5, "Correct"],
    [5, 3, "Partial"],
    [5, 2, "Incorrect"],
    [6, 3, "Partial"],
    [6, 2, "Incorrect"],
    [7, 4, "Partial"],
    [7, 3, "Incorrect"],
  ])("%i subitens, %i marcados → %s", (total, checked, expected) => {
    expect(suggestGrade(ruleItem(total), firstN(checked))).toBe(expected);
  });

  it("ignora ids de subitens que não são do item", () => {
    expect(suggestGrade(ruleItem(4), ["s1", "s2", "x9", "x10"])).toBe("Partial");
  });

  it("sem regra não sugere nada; item de 2 níveis não sugere parcial", () => {
    expect(suggestGrade({ ...ruleItem(4), auto_grade_rule: null }, firstN(4))).toBeNull();
    expect(suggestGrade(ruleItem(4, null), firstN(3))).toBe("Incorrect");
  });

  it("os critérios do seed batem com a regra (parcial a partir da metade arredondada para cima)", () => {
    for (const station of stations) {
      for (const item of station.checklist_items.filter((i) => i.auto_grade_rule)) {
        const threshold = Math.ceil(item.subitems.length / 2);
        expect(item.criteria.partial).toContain(`pelo menos ${threshold}`);
      }
    }
  });
});

describe("Simulados — status por data", () => {
  const event = { starts_at: "2026-10-01T03:00:00.000Z", ends_at: "2026-11-01T02:59:59.000Z" };
  it("próximo, em andamento e expirado", () => {
    expect(getEventStatus(event, new Date("2026-09-30T12:00:00Z"))).toBe("upcoming");
    expect(getEventStatus(event, new Date("2026-10-01T03:00:00Z"))).toBe("ongoing");
    expect(getEventStatus(event, new Date("2026-11-01T02:59:59Z"))).toBe("ongoing");
    expect(getEventStatus(event, new Date("2026-11-01T03:00:00Z"))).toBe("expired");
  });
});
