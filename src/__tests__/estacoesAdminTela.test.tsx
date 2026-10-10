/**
 * Aba Estações da Administração (jsdom, banco simulado).
 * ES02: o aviso não promete mais que a estação aprovada "aparece para todos os alunos" (as telas de estações do aluno ainda
 *       estão em construção e escondidas; só a equipe vê).
 * ES03: aprovar pede o que foi conferido (10 caracteres ou mais) e mostra quem aprovou e quando; quem não é revisor da área
 *       nem administrador não vê o botão de aprovar; voltar para revisão pede o motivo; o revisor médico que não é da equipe
 *       vê a aba; o conteúdo da estação abre para conferir; o Registro mostra o que foi conferido.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const session: any = { backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/admin/AdminQuestions.jsx", () => ({ AdminQuestions: () => null }));
vi.mock("../novo/app/admin/AdminUsers.jsx", () => ({ AdminUsers: () => null }));
vi.mock("../novo/app/admin/AdminPlay.jsx", () => ({ AdminPlay: () => null }));
vi.mock("../novo/app/admin/AdminLessons.jsx", () => ({ AdminLessons: () => null }));
vi.mock("../novo/app/admin/AdminUpdates.jsx", () => ({ AdminUpdates: () => null }));
vi.mock("../novo/app/admin/AdminPodcasts.jsx", () => ({ AdminPodcasts: () => null }));
vi.mock("../novo/app/admin/content/ContentHub.jsx", () => ({ ContentHub: () => null }));
vi.mock("../novo/app/admin/ai/AdminAI.jsx", () => ({ AdminAI: () => null }));
vi.mock("../novo/app/admin/OfficialVoicesPanel.jsx", () => ({ OfficialVoicesPanel: () => null }));

import { AdminAudit, AdminStations } from "../novo/app/admin/AdminPanels.jsx";
import { AdminScreen } from "../novo/app/admin/AdminScreen.jsx";

const NOTA = "Conferi roteiro, impressos e checklist com o PEP.";
const base = { name: "Cetoacidose diabética", topic: "DM1 descompensado", area: "Clínica Médica", is_pro_only: false, institution: null, reports: 0, last_reports: [], review_note: null, reviewed_at: null, reviewer: null };
const PENDING = { ...base, id: "st-cm", medical_review: "pending", can_review: true };
const CONTENT = {
  doctor_scene: "Pronto-socorro. Paciente de 24 anos.",
  doctor_tasks: "Realizar anamnese dirigida.",
  actor_script: "Você tem DM1 há 10 anos.",
  pressings: [{ id: "p1", name: "Gasometria venosa", content: "pH 7,12", image_url: null }],
  checklist_items: [{ id: "i1", order: 1, phase: "Apresentação", content: "Apresenta-se ao paciente.", grades: { correct: 0.3, partial: null, incorrect: 0 }, criteria: { correct: "Faz.", incorrect: "Não faz." }, subitems: [] }],
};
let stations: any[] = [];

beforeEach(() => {
  session.boot = { role: "admin", profile: { name: "Adm" }, reviewer_areas: [] };
  stations = [PENDING];
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_stations") return stations;
    if (fn === "app_admin_station_content") return CONTENT;
    if (fn === "app_admin_set_station_review")
      return stations.map((s) => (s.id === args.p_station_id ? { ...s, medical_review: args.p_status, review_note: args.p_note, reviewer: "Dr. Clínico", reviewed_at: "2026-10-10T12:00:00Z" } : s));
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

const textOf = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

describe("Estações (ES02): o aviso da aba diz a verdade", () => {
  it("não promete que a estação aprovada aparece para os alunos: as telas do aluno estão em construção e só a equipe vê", async () => {
    const { container } = render(<AdminStations />);
    await screen.findByText("Cetoacidose diabética");
    const text = textOf(container);
    expect(text).not.toMatch(/aparece para todos os alunos/i);
    expect(text).toMatch(/telas de estações do aluno ainda estão em construção/i);
    expect(text).toMatch(/só a equipe vê/i);
  });
});

describe("Estações (ES03): aprovar é revisão médica registrada", () => {
  it("abre o conteúdo para conferir; aprovar só com o que foi conferido; depois mostra quem aprovou e quando", async () => {
    render(<AdminStations />);
    fireEvent.click(await screen.findByRole("button", { name: "Conferir" }));
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_station_content", { p_station_id: "st-cm" }));
    expect(await screen.findByText("Você tem DM1 há 10 anos.")).toBeTruthy();
    expect(screen.getByText("Gasometria venosa")).toBeTruthy();
    expect(screen.getByText(/Apresenta-se ao paciente\./)).toBeTruthy();

    const approve = screen.getByRole("button", { name: "Aprovar" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("O que foi conferido (roteiro, impressos e checklist)"), { target: { value: "curta" } });
    expect(approve.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("O que foi conferido (roteiro, impressos e checklist)"), { target: { value: NOTA } });
    expect(approve.disabled).toBe(false);
    fireEvent.click(approve);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_set_station_review", { p_station_id: "st-cm", p_status: "approved", p_note: NOTA }));
    expect(await screen.findByText(/Aprovada por Dr\. Clínico em/)).toBeTruthy();
    expect(screen.getByText(new RegExp(NOTA))).toBeTruthy();
  });

  it("quem não é revisor da área nem administrador não vê o botão de aprovar, e sim quem pode aprovar", async () => {
    stations = [{ ...PENDING, area: "Cirurgia Geral", can_review: false }];
    render(<AdminStations />);
    fireEvent.click(await screen.findByRole("button", { name: "Conferir" }));
    expect(await screen.findByText(/Só um revisor médico cadastrado em Cirurgia Geral ou um administrador aprova esta estação/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aprovar" })).toBeNull();
  });

  it("voltar para revisão pede o motivo e registra quem devolveu", async () => {
    stations = [{ ...PENDING, medical_review: "approved", review_note: NOTA, reviewer: "Dra. Antiga", reviewed_at: "2026-10-09T12:00:00Z" }];
    render(<AdminStations />);
    expect(await screen.findByText(/Aprovada por Dra\. Antiga em/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Conferir" }));
    const back = (await screen.findByRole("button", { name: "Voltar para revisão" })) as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Motivo para voltar à revisão"), { target: { value: "Aluno relatou impresso trocado." } });
    expect(back.disabled).toBe(false);
    fireEvent.click(back);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_admin_set_station_review", { p_station_id: "st-cm", p_status: "pending", p_note: "Aluno relatou impresso trocado." }));
    expect(await screen.findByText(/Devolvida para revisão por Dr\. Clínico em/)).toBeTruthy();
  });

  it("estação aprovada antes do registro avisa que ninguém ficou registrado como revisor", async () => {
    stations = [{ ...PENDING, medical_review: "approved" }];
    render(<AdminStations />);
    expect(await screen.findByText(/Aprovada antes de o app registrar quem conferiu/)).toBeTruthy();
  });

  it("o Registro mostra o que foi conferido na revisão da estação", async () => {
    backend.rpc.mockImplementation(async (fn: string) =>
      fn === "app_admin_audit"
        ? [{ id: 1, action: "station.review", target: "st-cm", details: { from: "pending", to: "approved", note: NOTA, area: "Clínica Médica" }, created_at: "2026-10-10T12:00:00Z", actor: "Dr. Clínico" }]
        : [],
    );
    render(<AdminAudit />);
    expect(await screen.findByText(`st-cm: aprovada · “${NOTA}”`)).toBeTruthy();
    expect(screen.getByText("Revisão de estação")).toBeTruthy();
  });

  it("o revisor médico que não é da equipe vê a aba Estações", async () => {
    session.boot = { role: "student", profile: { name: "Dr. Clínico" }, reviewer_areas: ["CLINICA_MEDICA"] };
    render(
      <MemoryRouter initialEntries={["/admin?aba=estacoes"]}>
        <AdminScreen />
      </MemoryRouter>,
    );
    const barra = screen.getByRole("tablist", { name: "Administração" });
    expect(within(barra).getByRole("tab", { name: "Estações" }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText("Cetoacidose diabética")).toBeTruthy();
  });
});
