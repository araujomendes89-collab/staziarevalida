// @vitest-environment jsdom
// Administração: as abas do administrador não cabem numa linha (1.744 px contra no máximo 1.200 px de conteúdo) e a
// barra rolável escondia as últimas (Central de IAs, Stazia Arena, Configurações, Registro) sem nenhum sinal. A barra da
// Administração passa a quebrar linha; as outras telas com abas continuam iguais.
import React from "react";
import { readFileSync } from "node:fs";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend: {}, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/admin/AdminQuestions.jsx", () => ({ AdminQuestions: () => null }));
vi.mock("../novo/app/admin/AdminUsers.jsx", () => ({ AdminUsers: () => null }));
vi.mock("../novo/app/admin/AdminPlay.jsx", () => ({ AdminPlay: () => null }));
vi.mock("../novo/app/admin/AdminLessons.jsx", () => ({ AdminLessons: () => null }));
vi.mock("../novo/app/admin/AdminUpdates.jsx", () => ({ AdminUpdates: () => null }));
vi.mock("../novo/app/admin/AdminPodcasts.jsx", () => ({ AdminPodcasts: () => null }));
vi.mock("../novo/app/admin/AdminPanels.jsx", () => ({ AdminAudit: () => null, AdminOverview: () => null, AdminPlans: () => null, AdminSettings: () => null, AdminStations: () => null }));
vi.mock("../novo/app/admin/content/ContentHub.jsx", () => ({ ContentHub: () => null }));
vi.mock("../novo/app/admin/ai/AdminAI.jsx", () => ({ AdminAI: () => null }));
vi.mock("../novo/app/admin/radar/RadarFila.jsx", () => ({ RadarFila: () => null }));
vi.mock("../novo/app/admin/OfficialVoicesPanel.jsx", () => ({ OfficialVoicesPanel: () => null }));

import { AdminScreen } from "../novo/app/admin/AdminScreen.jsx";
import { Tabs } from "../novo/ds";

afterEach(cleanup);

describe("Administração: todas as abas aparecem", () => {
  it("a barra da Administração quebra linha e mostra as 17 abas do administrador (Vozes do Nexus foi para Configurações; entraram Comunicados, 013830, Vendas e pagamentos, 013850, e Lista de interesse, 013960)", () => {
    render(
      <MemoryRouter initialEntries={["/admin?aba=ias"]}>
        <AdminScreen />
      </MemoryRouter>,
    );
    const barra = screen.getByRole("tablist", { name: "Administração" });
    expect(barra.classList.contains("sm-tabs--wrap")).toBe(true);
    const abas = within(barra).getAllByRole("tab");
    expect(abas).toHaveLength(17);
    expect(abas.map((a) => a.textContent)).toEqual(expect.arrayContaining(["Central de IAs", "Stazia Arena", "Configurações", "Fila do Radar", "Registro", "Comunicados", "Vendas e pagamentos", "Lista de interesse"]));
    expect(abas.map((a) => a.textContent)).not.toContain("Vozes do Nexus");
    expect(within(barra).getByRole("tab", { name: "Central de IAs" }).getAttribute("aria-selected")).toBe("true");
  });

  it("as outras barras de abas só quebram linha quando pedido", () => {
    const tabs = [{ value: "a", label: "A" }, { value: "b", label: "B" }];
    render(<Tabs label="Sem quebra" value="a" tabs={tabs} />);
    render(<Tabs wrap label="Com quebra" value="a" tabs={tabs} />);
    expect(screen.getByRole("tablist", { name: "Sem quebra" }).className).toBe("sm-tabs");
    expect(screen.getByRole("tablist", { name: "Com quebra" }).className).toBe("sm-tabs sm-tabs--wrap");
  });

  it("o design system tem a regra que faz a barra quebrar linha", () => {
    const css = readFileSync("src/novo/ds/components/components.css", "utf8");
    expect(css).toMatch(/\.sm-tabs--wrap\s*\{[^}]*flex-wrap:\s*wrap[^}]*overflow:\s*visible/);
  });
});
