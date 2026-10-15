// Mapas Mentais: menu na ordem certa, mapa piloto (Tuberculose pulmonar), dois níveis, aluno sem códigos/links/páginas
// e "Mapa em preparação" para tema sem mapa.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../novo/app/Shell.jsx";
import { MapaMental } from "../novo/app/mapas/MapaMental.jsx";
import { MapaDoTema, BotaoMapaMental, temMapa } from "../novo/app/mapas/MapaDoTema.jsx";
import { MapasScreen } from "../novo/app/mapas/MapasScreen.jsx";
import { MAPAS, mapaPorCodigo, textoVisivel } from "../novo/app/mapas/mapas.js";
import { NOMES_ICONES } from "../novo/app/mapas/icones.jsx";

afterEach(cleanup);

const piloto = () => mapaPorCodigo("GR-001")!;

describe("menu", () => {
  it("'Mapas Mentais' fica no grupo Aprender, logo abaixo de Diretrizes e Atualizações", () => {
    const { container } = render(
      <AppShell route="home" go={() => {}} phase={1} setPhase={() => {}} theme="light" setTheme={() => {}} info={{ isStaff: false }}>
        <div />
      </AppShell>
    );
    const chaves = Array.from(container.querySelectorAll("nav [data-key]")).map((n) => n.getAttribute("data-key"));
    const i = chaves.indexOf("atualizacoes");
    expect(i).toBeGreaterThan(-1);
    expect(chaves[i + 1]).toBe("mapas");
    expect(screen.getAllByText("Mapas Mentais").length).toBeGreaterThan(0);
  });
});

describe("mapa piloto: Tuberculose pulmonar", () => {
  it("mostra o tema central, os ramos e o rodapé do mapa", () => {
    render(<MapaMental mapa={piloto()} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/Tuberculose\s+pulmonar/);
    expect(screen.getByText("MAPA MENTAL · STAZIAMED")).toBeTruthy();
    for (const t of ["Suspeita clínica", "Diagnóstico", "Tratamento (esquema básico)", "Acompanhamento", "Controle de contatos e ILTB", "Situações especiais", "Revalida INEP: decisões e pegadinhas"]) {
      expect(screen.getByRole("heading", { level: 3, name: t })).toBeTruthy();
    }
    expect(piloto().ramos.length).toBeGreaterThanOrEqual(6);
    expect(piloto().ramos.length).toBeLessThanOrEqual(8);
  });

  it("cuidados clínicos do dono aparecem no mapa", () => {
    render(<MapaMental mapa={piloto()} />);
    const txt = document.body.textContent ?? "";
    expect(txt).toMatch(/2RHZE\/4RH/);
    expect(txt).toMatch(/TRM-TB negativo com quadro persistente/);
    expect(txt).toMatch(/ILTB não é TB ativa/);
    expect(txt).toMatch(/não diagnosticam doença ativa/);
    expect(txt).toMatch(/3HP tem alternativas e restrições|3HP é o preferencial, mas há alternativas/);
    expect(txt).not.toMatch(/06\/10\/2026/); // data do BPaLM não verificada
  });

  it("Revisão não abre detalhes; Aprofundado abre ramo por ramo", () => {
    render(<MapaMental mapa={piloto()} />);
    expect(screen.queryByRole("button", { name: /Aprofundar/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Aprofundado" }));
    const botoes = screen.getAllByRole("button", { name: /Aprofundar/ });
    expect(botoes.length).toBe(piloto().ramos.length);
    expect(screen.queryByText("Como ler o TRM-TB no caso novo")).toBeNull();
    fireEvent.click(botoes[2]);
    expect(screen.getByText("Como ler o TRM-TB no caso novo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abrir tudo" }));
    expect(screen.getByText("Esquema encurtado pediátrico (abril de 2024)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revisão" }));
    expect(screen.queryByText("Como ler o TRM-TB no caso novo")).toBeNull();
  });
});

describe("o aluno não vê rastreabilidade", () => {
  it("nenhum mapa mostra código GR, id de afirmação, link, página ou cor em hexadecimal", () => {
    expect(MAPAS.length).toBeGreaterThan(0);
    for (const m of MAPAS) {
      const t = textoVisivel(m);
      expect(t, m.slug).not.toMatch(/GR-\d{3}/i);
      expect(t, m.slug).not.toMatch(/\bTB\d{2,3}\b/);
      expect(t, m.slug).not.toMatch(/https?:|www\.|\.gov\.br|\.pdf/i);
      expect(t, m.slug).not.toMatch(/\bp\.\s?\d+|\bpágina\s+\d+|#[0-9a-f]{6}\b/i);
    }
    render(<MapaMental mapa={piloto()} />);
    const tela = document.body.textContent ?? "";
    expect(tela).not.toMatch(/GR-\d{3}|https?:|pre-revisado|pré-revisado/i);
  });

  it("todo mapa é dado válido: ramos de 6 a 8, ícones conhecidos, status de agente e nenhuma aprovação humana", () => {
    for (const m of MAPAS) {
      expect(m.ramos.length, m.slug).toBeGreaterThanOrEqual(6);
      expect(m.ramos.length, m.slug).toBeLessThanOrEqual(8);
      expect(m.revisao.status, m.slug).toBe("pre-revisado por agente");
      expect(m.revisao.aprovacao_humana, m.slug).toBeNull();
      expect(m.ramos.filter((r: any) => r.lado === "centro").length, m.slug).toBeLessThanOrEqual(1);
      for (const r of m.ramos) expect(NOMES_ICONES, `${m.slug}/${r.id}`).toContain(r.icone);
      expect(m.ramos[m.ramos.length - 1].cor, m.slug).toBe("vermelho");
    }
    expect(new Set(MAPAS.map((m) => m.slug)).size).toBe(MAPAS.length);
  });
});

describe("tema sem mapa e integração", () => {
  it("tema sem aula mostra 'Mapa em preparação' e nenhum conteúdo", () => {
    render(<MapaDoTema codigo="GR-002" />);
    expect(screen.getByText("Mapa em preparação")).toBeTruthy();
    expect(temMapa("GR-002")).toBe(false);
  });
  it("o botão do cartão do tema só aparece quando há mapa e leva ao mapa pelo nome do tema", () => {
    const chamadas: any[] = [];
    const go = (...a: any[]) => chamadas.push(a);
    const { container, rerender } = render(<BotaoMapaMental codigo="GR-002" go={go} />);
    expect(container.firstChild).toBeNull();
    rerender(<BotaoMapaMental codigo="GR-001" go={go} />);
    fireEvent.click(screen.getByRole("button", { name: /Mapa mental/ }));
    expect(chamadas[0]).toEqual(["mapas", { tema: "tuberculose-pulmonar" }]);
  });
  it("a tela lista só temas com mapa, filtra por área e busca, e abre o mapa", () => {
    render(
      <MemoryRouter>
        <MapasScreen go={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText("Tuberculose pulmonar")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Buscar tema"), { target: { value: "xyzxyz" } });
    expect(screen.getByText("Nenhum mapa encontrado")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Buscar tema"), { target: { value: "tuberculose" } });
    const lista = screen.getByRole("list");
    fireEvent.click(within(lista).getByRole("button", { name: /Tuberculose pulmonar/ }));
    expect(screen.getByRole("button", { name: /Todos os mapas/ })).toBeTruthy();
    expect(screen.getByText("MAPA MENTAL · STAZIAMED")).toBeTruthy();
  });
});
