/**
 * Defeito no ar (18/10/2026): em Desempenho, "Pontos para reforçar" mostrava os códigos do motor em inglês ("NEONATOLOGY",
 * "DIAGNOSIS · 3 erro(s) em 4 respostas", "CLINICAL_EMERGENCIES", "EMERGENCY_STABILIZATION"). O banco guarda o código
 * (question_dna.subarea/competency) e a tela o mostrava cru. Agora: nome em português em Desempenho, na Análise Inteligente
 * (temas críticos), no fim da conversa do Tutor e no contexto que o servidor manda para a IA do Tutor; código sem nome vira
 * texto genérico e fica registrado no console de desenvolvimento.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { COMPETENCY_LABEL, SUBAREA_LABEL, competencyLabel, subareaLabel, subareaParaIA } from "../shared/questions/taxonomia";
import { temasParaIA } from "../../server/tutor/temas";
import { sessionContext } from "../../server/tutor/realtime";
import { openingInput } from "../../server/tutor/opening";

// Todos os códigos de question_dna em produção (SELECT de 18/10/2026)
const SUBAREAS_EM_PRODUCAO = [
  "ACUTE_ABDOMEN", "BURNS", "CARDIOLOGY", "CLINICAL_EMERGENCIES", "COLOPROCTOLOGY", "DERMATOLOGY", "ENDOCRINOLOGY", "EPIDEMIOLOGY_BIOSTATISTICS",
  "ETHICS_COMMUNICATION", "GASTROENTEROLOGY_HEPATOLOGY", "GERIATRICS", "GYNECOLOGY", "HEALTH_SURVEILLANCE", "HEMATOLOGY_ONCOLOGY", "HERNIAS",
  "IMMUNIZATION", "IMMUNIZATION_PUBLIC_HEALTH", "INFECTIOUS_DISEASES", "MENTAL_HEALTH_PRIMARY_CARE", "NEONATOLOGY", "NEPHROLOGY_ELECTROLYTES",
  "NEUROLOGY", "OBSTETRICS", "OCCUPATIONAL_HEALTH", "ORTHOPEDICS_TRAUMA", "PEDIATRIC_EMERGENCIES", "PEDIATRIC_ENDOCRINOLOGY",
  "PEDIATRIC_GASTRO_NUTRITION", "PEDIATRIC_HEMATOLOGY_ONCOLOGY", "PEDIATRIC_INFECTIOUS_EXANTHEMS", "PEDIATRIC_NEPHROLOGY", "PEDIATRIC_NEUROLOGY",
  "PEDIATRIC_RESPIRATORY", "PERIOPERATIVE_CARE", "PREVENTION_SCREENING", "PRIMARY_CARE", "PSYCHIATRY", "PULMONOLOGY", "RHEUMATOLOGY",
  "SUS_HEALTH_SYSTEM", "TRAUMA_ATLS", "UROLOGY", "VASCULAR_SURGERY", "WELL_CHILD_CARE_GROWTH_DEVELOPMENT",
];
const COMPETENCIAS_EM_PRODUCAO = [
  "CONTRAINDICATION_ASSESSMENT", "DIAGNOSIS", "DIFFERENTIAL_DIAGNOSIS", "EMERGENCY_STABILIZATION", "EPIDEMIOLOGIC_REASONING", "ETHICAL_LEGAL_DECISION",
  "FOLLOW_UP", "INITIAL_ASSESSMENT", "INTERPRET_DIAGNOSTIC_TEST", "NONPHARMACOLOGIC_TREATMENT", "PHARMACOLOGIC_TREATMENT", "PREVENTION", "PROGNOSIS",
  "PUBLIC_HEALTH_ACTION", "RECOGNIZE_COMPLICATION", "REFERRAL", "RISK_FACTOR_ASSESSMENT", "RISK_STRATIFICATION", "SCREENING", "SELECT_DIAGNOSTIC_TEST",
  "SELECT_TREATMENT", "SURGICAL_MANAGEMENT", "VACCINATION",
];
const CODIGO = /\b[A-Z]{3,}(?:_[A-Z]+)+\b|\b(NEONATOLOGY|DIAGNOSIS|PREVENTION|SCREENING|REFERRAL|VACCINATION|PROGNOSIS|GYNECOLOGY|OBSTETRICS|CARDIOLOGY|NEUROLOGY|UROLOGY|BURNS|HERNIAS)\b/;

const RPC: Record<string, any> = {};
const backend = { accessToken: "t", rpc: vi.fn(async (fn: string) => (fn in RPC ? RPC[fn] : null)) };
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ boot: { role: "student", profile: { name: "Aluno", phase: 1 }, subscription: { plan: "pro", status: "active" } }, user: { email: "a@b.dev" }, backend }),
}));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false }));

import { ErrorProfile } from "../novo/app/review/ErrorProfile.jsx";
import { Report } from "../novo/app/tutor/ReportScreen.jsx";
import { fimDaConversa } from "../novo/app/tutor/nexus/NexusScreen.jsx";

const errorProfile = (weak_points: any[]) => ({
  wrong: 62, attempts: 228, days: 30, diagnosed: 0, error_types: [], kinds: {}, fixed_ideas: 1, confidence: { wrong_but_sure: 0, wrong_and_guessing: 0 }, traps: [], weak_points,
});

beforeEach(() => {
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) });
  RPC.app_error_reasons = { declared: {}, wrong_questions: 0 };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("mapa de nomes da classificação", () => {
  it("todo código usado em produção tem nome em português (nunca o próprio código)", () => {
    for (const c of SUBAREAS_EM_PRODUCAO) {
      expect(SUBAREA_LABEL[c], c).toBeTruthy();
      expect(subareaLabel(c)).not.toMatch(CODIGO);
    }
    for (const c of COMPETENCIAS_EM_PRODUCAO) {
      expect(COMPETENCY_LABEL[c], c).toBeTruthy();
      expect(competencyLabel(c)).not.toMatch(CODIGO);
    }
    expect(subareaLabel("NEONATOLOGY")).toBe("Neonatologia");
    expect(subareaLabel("CLINICAL_EMERGENCIES")).toBe("Emergências clínicas");
    expect(competencyLabel("DIAGNOSIS")).toBe("Diagnóstico");
    expect(competencyLabel("EMERGENCY_STABILIZATION")).toBe("Estabilização na emergência");
  });

  it("código desconhecido vira texto genérico; texto já em português passa; vazio vira null", () => {
    const aviso = vi.fn();
    expect(subareaLabel("NEW_SUBAREA_X", aviso)).toBe("Tema em classificação");
    expect(competencyLabel("NEW_SKILL", aviso)).toBe("Habilidade em classificação");
    expect(aviso).toHaveBeenCalledWith("subarea", "NEW_SUBAREA_X");
    expect(aviso).toHaveBeenCalledWith("competency", "NEW_SKILL");
    expect(subareaLabel("Neonatologia")).toBe("Neonatologia");
    expect(subareaLabel("")).toBeNull();
    expect(subareaLabel(null)).toBeNull();
    expect(subareaParaIA("NEW_SUBAREA_X")).toBeNull();
    expect(subareaParaIA("NEONATOLOGY")).toBe("Neonatologia");
  });
});

describe("Desempenho: Pontos para reforçar", () => {
  it("mostra subárea e competência em português, nunca o código do banco", async () => {
    RPC.app_error_profile = errorProfile([
      { subarea: "NEONATOLOGY", competency: "DIAGNOSIS", attempts: 4, wrong: 3, rate: 0.75 },
      { subarea: "CLINICAL_EMERGENCIES", competency: "EMERGENCY_STABILIZATION", attempts: 3, wrong: 2, rate: 0.667 },
    ]);
    const { container } = render(<ErrorProfile go={vi.fn()} days={30} />);
    expect(await screen.findByText("Neonatologia")).toBeInTheDocument();
    expect(screen.getByText("Diagnóstico · 3 erro(s) em 4 respostas (75%)")).toBeInTheDocument();
    expect(screen.getByText("Emergências clínicas")).toBeInTheDocument();
    expect(screen.getByText(/^Estabilização na emergência · 2 erro\(s\) em 3 respostas/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(CODIGO);
  });

  it("o reforço continua mandando o código ao banco (o filtro é pelo código)", async () => {
    RPC.app_error_profile = errorProfile([{ subarea: "NEONATOLOGY", competency: "DIAGNOSIS", attempts: 4, wrong: 3, rate: 0.75 }]);
    RPC.app_start_reinforcement = { session_id: "s1" };
    const go = vi.fn();
    render(<ErrorProfile go={go} days={30} />);
    (await screen.findByRole("button", { name: /Reforçar com questões reais/ })).click();
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "s1" }));
    expect(backend.rpc).toHaveBeenCalledWith("app_start_reinforcement", { p_subarea: "NEONATOLOGY", p_competency: "DIAGNOSIS", p_count: 10 });
  });

  it("código novo sem nome: texto genérico na tela e aviso no console de desenvolvimento", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    RPC.app_error_profile = errorProfile([{ subarea: "BRAND_NEW_AREA", competency: "BRAND_NEW_SKILL", attempts: 3, wrong: 3, rate: 1 }]);
    const { container } = render(<ErrorProfile go={vi.fn()} days={30} />);
    expect(await screen.findByText("Tema em classificação")).toBeInTheDocument();
    expect(screen.getByText(/^Habilidade em classificação · 3 erro/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/BRAND_NEW/);
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/BRAND_NEW_AREA/);
  });
});

describe("Análise Inteligente: temas críticos", () => {
  it("mostra o nome da subárea em português", async () => {
    RPC.app_tutor_status = { enabled: true, available: true, consent_required: false };
    RPC.app_tutor_report = {
      insights: [], sessions: { count: 1, minutes: 1, voice_minutes: 0, questions_discussed: 0 }, recurrent_errors: [],
      mastery: { areas: [{ area: "PEDIATRIA", attempts: 5, accuracy: 40, level: "FRACO" }] }, highest_risk_area: "PEDIATRIA",
      critical_topics: [{ area: "PEDIATRIA", subarea: "NEONATOLOGY", accuracy: 40, level: "FRACO", attempts: 5 }],
      evolution: { last_30: { attempts: 5, correct: 2 }, previous_30: { attempts: 0, correct: 0 } }, reviews: { due: 0, scheduled: 0 },
      tutor: { correct: 0, answers: 0, wrong_but_sure: 0, lucky_guesses: 0, with_heavy_hints: 0, avg_hints: 0, error_classes: {} }, error_types: {},
    };
    const { container } = render(<Report />);
    expect(await screen.findByText("Temas críticos")).toBeInTheDocument();
    expect(screen.getByText("Neonatologia · 40%")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NEONATOLOGY/);
  });
});

describe("Tutor", () => {
  it("fim da conversa: o próximo passo usa o nome em português", () => {
    const fim = fimDaConversa({ topic: null, summary: { next_recommended_topics: ["NEONATOLOGY"], questions_answered: 0 } });
    expect(fim.next).toEqual({ tema: "Neonatologia", texto: "10 questões de neonatologia" });
  });

  it("contexto da IA: pontos fracos e perfil em português; código sem nome sai da lista", () => {
    const mem = {
      weak_subareas: [{ area: "PEDIATRIA", subarea: "NEONATOLOGY", accuracy: 40 }, { area: "X", subarea: "BRAND_NEW_AREA", accuracy: 10 }],
      profile: { strongest_topics: ["OBSTETRICS"], weak_topics: ["CLINICAL_EMERGENCIES", "BRAND_NEW_AREA"] },
    };
    const t = temasParaIA(mem as any);
    expect(t?.weak_subareas).toEqual([{ area: "PEDIATRIA", subarea: "Neonatologia", accuracy: 40 }]);
    expect(t?.profile).toMatchObject({ strongest_topics: ["Obstetrícia"], weak_topics: ["Emergências clínicas"] });
    expect(temasParaIA(null)).toBeNull();

    const voz = sessionContext({
      session: { title: "Me teste", context: { type: "weak_points", label: null }, topic: null, question_state: "none" },
      student: null, memory: { weak_subareas: mem.weak_subareas, recurrent_errors: [] }, question: null,
    } as any, null, { live: true, continuity: false });
    expect(voz).toContain("pontos fracos do aluno (Neonatologia)");
    expect(voz).not.toMatch(/NEONATOLOGY|BRAND_NEW/);

    const abertura = openingInput(
      { session: { context_type: "weak_points", topic: null, context_label: null }, message: { id: 1, content: "", kind: "abertura" }, recent: [] } as any,
      { memory: { weak_subareas: mem.weak_subareas }, student: null, question: null } as any,
    );
    expect(abertura).toContain("\"pontos_fracos\":[\"Neonatologia\"]");
    expect(abertura).not.toMatch(/NEONATOLOGY|BRAND_NEW/);
  });
});
