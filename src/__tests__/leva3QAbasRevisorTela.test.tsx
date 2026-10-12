// @vitest-environment jsdom
// Leva 3 (Q09): o revisor médico sem papel de equipe passa a ver a aba Questões (só a fila de comentários a revisar), além de
// Atualizações, Estações e Central de Conteúdo; as outras abas da equipe continuam fechadas para ele.
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const session: any = { backend: {}, boot: { role: "student", profile: { name: "Dra. Revisora" } }, user: { id: "a" } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/admin/AdminQuestions.jsx", () => ({ AdminQuestions: () => <div>aba de questões</div> }));
vi.mock("../novo/app/admin/AdminUsers.jsx", () => ({ AdminUsers: () => null }));
vi.mock("../novo/app/admin/AdminPlay.jsx", () => ({ AdminPlay: () => null }));
vi.mock("../novo/app/admin/AdminLessons.jsx", () => ({ AdminLessons: () => null }));
vi.mock("../novo/app/admin/AdminUpdates.jsx", () => ({ AdminUpdates: () => null }));
vi.mock("../novo/app/admin/AdminPodcasts.jsx", () => ({ AdminPodcasts: () => null }));
vi.mock("../novo/app/admin/AdminPanels.jsx", () => ({ AdminAudit: () => null, AdminOverview: () => null, AdminPlans: () => null, AdminSettings: () => null, AdminStations: () => null, AdminTutor: () => null }));
vi.mock("../novo/app/admin/content/ContentHub.jsx", () => ({ ContentHub: () => null }));
vi.mock("../novo/app/admin/ai/AdminAI.jsx", () => ({ AdminAI: () => null }));
vi.mock("../novo/app/admin/OfficialVoicesPanel.jsx", () => ({ OfficialVoicesPanel: () => null }));

import { AdminScreen } from "../novo/app/admin/AdminScreen.jsx";

afterEach(cleanup);

const tabsOf = (role: string) => {
  session.boot = { role, profile: { name: "Pessoa" } };
  render(
    <MemoryRouter initialEntries={["/admin"]}>
      <AdminScreen />
    </MemoryRouter>,
  );
  return within(screen.getByRole("tablist", { name: "Administração" })).getAllByRole("tab").map((t) => t.textContent);
};

describe("Administração: abas do revisor médico sem papel de equipe", () => {
  it("vê Questões (fila de comentários), Atualizações, Estações e Central de Conteúdo, e mais nada", () => {
    expect(tabsOf("student")).toEqual(["Questões", "Atualizações", "Estações", "Central de Conteúdo"]);
    expect(screen.getByText("aba de questões")).toBeTruthy();
  });

  it("o editor continua vendo as abas da equipe, com Questões", () => {
    const tabs = tabsOf("editor");
    expect(tabs).toContain("Questões");
    expect(tabs).toContain("Visão geral");
    expect(tabs).not.toContain("Usuários");
  });
});
