// Mapas Mentais: menu na ordem certa, mapa piloto (Tuberculose pulmonar), dois níveis, aluno sem códigos/links/páginas
// e "Mapa em preparação" para tema sem mapa.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../novo/app/Shell.jsx";
import { Poster, temPoster, CARTOES } from "../novo/app/mapas/Poster.jsx";
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
    fireEvent.click(screen.getByRole("button", { name: /^Aprender/ })); // sanfona
    const nomes = Array.from(container.querySelectorAll("nav .smn-sub .smn-item")).map((n) => (n.textContent ?? "").trim());
    const i = nomes.indexOf("Diretrizes e Atualizações");
    expect(i).toBeGreaterThan(-1);
    expect(nomes[i + 1]).toBe("Mapas Mentais");
    expect(screen.getAllByText("Mapas Mentais").length).toBeGreaterThan(0);
  });
});

// o visual principal é a imagem; sem ela (falha ao carregar) cai no mapa em código
const semImagem = () => {
  const r = render(<MapaMental mapa={piloto()} />);
  fireEvent.error(screen.getByRole("img", { name: /Mapa mental: Tuberculose pulmonar/ }));
  return r;
};

describe("pôster realista (imagem) como visual principal", () => {
  it("abre com a imagem, com texto do mapa como descrição para leitor de tela, sem estado nem ressalvas", () => {
    render(<MapaMental mapa={piloto()} />);
    const img = screen.getByRole("img", { name: /Mapa mental: Tuberculose pulmonar/ });
    expect(img.getAttribute("src")).toMatch(/\/mapas-mentais\/poster-tuberculose-pulmonar\.webp$/);
    const desc = document.getElementById(img.getAttribute("aria-describedby")!)!;
    expect(desc.textContent).toMatch(/2RHZE\/4RH/);
    const tela = document.body.textContent ?? "";
    expect(tela).not.toMatch(/pendente de revisão|ressalva|aprovada|gemini|pre-revisado/i);
    expect(screen.getByRole("button", { name: "Pôster" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Baixar imagem/ })).toBeTruthy();
  });
  it("amplia em tela cheia com zoom e fecha", () => {
    render(<MapaMental mapa={piloto()} />);
    fireEvent.click(screen.getByRole("button", { name: /Ampliar o mapa mental/ }));
    const dlg = screen.getByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Aumentar" }));
    expect(within(dlg).getByText("150%")).toBeTruthy();
    fireEvent.click(within(dlg).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ampliar o mapa mental/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("se a imagem falhar, cai no mapa em código", () => {
    semImagem();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/Tuberculose\s+pulmonar/);
  });
  it("a lista não tem miniatura de imagem: só a caixa com os escritos", () => {
    render(<MemoryRouter><MapasScreen go={() => {}} /></MemoryRouter>);
    // só o ícone 3D decorativo (alt vazio, carregamento preguiçoso) pode aparecer no canto
    const imgs = Array.from(document.querySelectorAll(".mm-lcard img"));
    for (const i of imgs) { expect(i.className).toBe("mm-lcard-ico"); expect(i.getAttribute("alt")).toBe(""); expect(i.getAttribute("loading")).toBe("lazy"); }
    expect(imgs.length).toBe(MAPAS.filter((m: any) => m.icone?.webp).length);
    expect(screen.getAllByText(/ramos · revisão rápida e aprofundado/).length).toBe(MAPAS.length);
    // todos os cartões são iguais: o título completo fica acessível por title e aria-label
    const cartoes = Array.from(document.querySelectorAll("button.mm-lcard"));
    expect(cartoes.length).toBe(MAPAS.length);
    for (const c of cartoes) { expect(c.getAttribute("title")).toBeTruthy(); expect(c.getAttribute("aria-label")).toContain(c.getAttribute("title")!); }
  });
});

describe("mapa piloto: Tuberculose pulmonar", () => {
  it("mostra o tema central, os ramos e o rodapé do mapa", () => {
    semImagem();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/Tuberculose\s+pulmonar/);
    expect(screen.getByText("MAPA MENTAL · STAZIAMED")).toBeTruthy();
    for (const t of ["Suspeita clínica", "Diagnóstico", "Tratamento (esquema básico)", "Acompanhamento", "Controle de contatos e ILTB", "Situações especiais", "Revalida INEP: decisões e pegadinhas"]) {
      expect(screen.getByRole("heading", { level: 3, name: t })).toBeTruthy();
    }
    expect(piloto().ramos.length).toBeGreaterThanOrEqual(6);
    expect(piloto().ramos.length).toBeLessThanOrEqual(8);
  });

  it("cuidados clínicos do dono aparecem no mapa", () => {
    semImagem();
    const txt = document.body.textContent ?? "";
    expect(txt).toMatch(/2RHZE\/4RH/);
    expect(txt).toMatch(/TRM-TB negativo com quadro persistente/);
    expect(txt).toMatch(/ILTB não é TB ativa/);
    expect(txt).toMatch(/não diagnosticam doença ativa/);
    expect(txt).toMatch(/3HP tem alternativas e restrições|3HP é o preferencial, mas há alternativas/);
    expect(txt).not.toMatch(/06\/10\/2026/); // data do BPaLM não verificada
  });

  it("Pôster não abre detalhes; Aprofundado abre ramo por ramo", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Pôster" }));
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
    semImagem();
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
    expect(chamadas[0]).toEqual(["mapas", { tema: "tuberculose-pulmonar", de: "temas" }]);
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
    expect(screen.getByRole("button", { name: "Voltar" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Mapa mental: Tuberculose pulmonar/ })).toBeTruthy();
  });
});

describe("pôster 3:2", () => {
  it("monta o pôster com cartão central, oito cartões, pontos-chave, atenção e rodapé", () => {
    render(<Poster mapa={piloto()} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/Tuberculose\s+pulmonar/);
    expect(document.querySelectorAll(".mmp-card").length).toBe(8);
    expect(screen.getByLabelText("Pontos-chave")).toBeTruthy();
    expect(screen.getByLabelText("Atenção")).toBeTruthy();
    expect(screen.getByText("MAPA MENTAL · STAZIAMED")).toBeTruthy();
  });
  it("todo mapa tem o bloco do pôster com os oito cartões e textos curtos, sem código, link ou página", () => {
    for (const m of MAPAS as any[]) {
      expect(temPoster(m), m.slug).toBe(true);
      const t: string[] = [];
      for (const k of Object.keys(CARTOES)) {
        const c = m.cartoes[k];
        expect(NOMES_ICONES, `${m.slug}/${k}`).toContain(c.icone);
        t.push(c.titulo, ...(c.itens ?? []), ...(c.linhas ?? []).flatMap((l: any) => [l.rotulo, l.texto, ...(l.itens ?? [])]), ...(c.faixas ?? []).flatMap((f: any) => [f.rotulo, f.chip, f.texto]));
        for (const x of c.itens ?? []) expect(String(x.t ?? x).length, `${m.slug}/${k}`).toBeLessThanOrEqual(60);
      }
      const tudo = t.filter(Boolean).join("\n");
      expect(tudo, m.slug).not.toMatch(/GR-\d{3}|https?:|\.gov\.br|\bp\.\s?\d+/i);
    }
  });
  it("sem foto aparece o desenho de reserva", () => {
    const sem = { ...piloto(), foto: undefined };
    const { container } = render(<Poster mapa={sem} />);
    expect(container.querySelector("svg.mm-emblema")).toBeTruthy();
  });
});
