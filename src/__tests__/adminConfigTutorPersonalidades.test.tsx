// @vitest-environment jsdom
/**
 * Decisão do dono de 17/10: o painel das 4 personalidades do Tutor (ligar e desligar personalidades, aprovar as vozes de cada
 * personagem e a linguagem forte da Durona e do Durão) fica nas CONFIGURAÇÕES, só para a equipe. A antiga aba "Vozes do Nexus"
 * deixa de existir; links antigos (?aba=vozes) abrem as Configurações.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const sessao = { role: "admin" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend: {}, boot: { role: sessao.role, profile: { name: "Equipe" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/admin/AdminQuestions.jsx", () => ({ AdminQuestions: () => null }));
vi.mock("../novo/app/admin/AdminUsers.jsx", () => ({ AdminUsers: () => null }));
vi.mock("../novo/app/admin/AdminPlay.jsx", () => ({ AdminPlay: () => null }));
vi.mock("../novo/app/admin/AdminLessons.jsx", () => ({ AdminLessons: () => null }));
vi.mock("../novo/app/admin/AdminUpdates.jsx", () => ({ AdminUpdates: () => null }));
vi.mock("../novo/app/admin/AdminPodcasts.jsx", () => ({ AdminPodcasts: () => null }));
vi.mock("../novo/app/admin/AdminSupport.jsx", () => ({ AdminReports: () => null, AdminSupportContact: () => null }));
vi.mock("../novo/app/admin/AdminPanels.jsx", () => ({
  AdminAudit: () => null, AdminOverview: () => null, AdminPlans: () => null, AdminSettings: () => null, AdminStations: () => null,
  AdminTutor: () => <div data-testid="painel-tutor">Tutor: 4 personalidades (ligar e desligar)</div>,
}));
vi.mock("../novo/app/admin/content/ContentHub.jsx", () => ({ ContentHub: () => null }));
vi.mock("../novo/app/admin/ai/AdminAI.jsx", () => ({ AdminAI: () => null }));
vi.mock("../novo/app/admin/radar/RadarFila.jsx", () => ({ RadarFila: () => null }));
// painéis da 2ª fase nas Configurações (chave do Treino em Dupla e do chat) e aba de denúncias: têm testes próprios
vi.mock("../novo/app/admin/AdminDupla.jsx", () => ({ AdminDupla: () => null }));
vi.mock("../novo/app/admin/AdminDuplaChat.jsx", () => ({ AdminDuplaChatReports: () => null, AdminDuplaChatSettings: () => null }));
// convites do radar (etapa 2 da 2ª fase): quadro próprio em Configurações, testado em adminDuplaConvitesTela
vi.mock("../novo/app/admin/AdminDuplaConvites.jsx", () => ({ AdminDuplaConvites: () => null, AdminDuplaHandleLog: () => null }));
vi.mock("../novo/app/admin/OfficialVoicesPanel.jsx", () => ({ OfficialVoicesPanel: () => <div data-testid="painel-vozes">Aprovar vozes</div> }));
vi.mock("../novo/app/admin/VoiceReactionsPanel.jsx", () => ({ VoiceReactionsPanel: () => <div data-testid="painel-linguagem">Linguagem forte</div> }));

import { AdminScreen } from "../novo/app/admin/AdminScreen.jsx";

afterEach(() => {
  cleanup();
  sessao.role = "admin";
});
const abrir = (aba: string) =>
  render(
    <MemoryRouter initialEntries={[`/admin?aba=${aba}`]}>
      <AdminScreen />
    </MemoryRouter>,
  );

describe("Configurações: personalidades, vozes e linguagem forte do Tutor", () => {
  it("administrador: as Configurações trazem as personalidades, a aprovação das vozes e a linguagem forte juntas", () => {
    abrir("config");
    const barra = screen.getByRole("tablist", { name: "Administração" });
    expect(within(barra).getByRole("tab", { name: "Configurações" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("painel-tutor")).toBeInTheDocument();
    const secao = screen.getByRole("region", { name: "Personagens e vozes do Tutor" });
    expect(within(secao).getByTestId("painel-vozes")).toBeInTheDocument();
    expect(within(secao).getByTestId("painel-linguagem")).toBeInTheDocument();
  });

  it("não existe mais a aba Vozes do Nexus; o link antigo abre as Configurações", () => {
    abrir("vozes");
    const barra = screen.getByRole("tablist", { name: "Administração" });
    expect(within(barra).queryByRole("tab", { name: "Vozes do Nexus" })).toBeNull();
    expect(within(barra).getByRole("tab", { name: "Configurações" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("painel-vozes")).toBeInTheDocument();
  });

  it("editor (equipe de conteúdo) e revisor não veem as Configurações nem os painéis do Tutor", () => {
    for (const role of ["editor", "reviewer", "student"]) {
      sessao.role = role;
      abrir("config");
      const barra = screen.queryByRole("tablist", { name: "Administração" });
      if (barra) expect(within(barra).queryByRole("tab", { name: "Configurações" })).toBeNull();
      expect(screen.queryByTestId("painel-tutor")).toBeNull();
      expect(screen.queryByTestId("painel-vozes")).toBeNull();
      expect(screen.queryByTestId("painel-linguagem")).toBeNull();
      cleanup();
    }
  });
});
