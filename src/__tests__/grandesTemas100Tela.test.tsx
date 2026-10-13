/**
 * Tela "Grandes Temas" (Estudar) com os 100 Grandes Temas Prioritários, jsdom com o banco simulado (a forma da resposta é a de
 * app_grandes_temas, migração 9960; a contagem com as questões reais é testada em grandesTemas100Banco.test.ts).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" }, user: { id: "u" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
const tutorRequests: any[] = [];
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({
  TutorButton: ({ request, label }: any) => (
    <button type="button" onClick={() => tutorRequests.push(request)}>
      {label}
    </button>
  ),
}));

import { ThemesScreen } from "../novo/app/study/ThemesScreen.jsx";

const DATA = {
  method:
    "Os 100 Grandes Temas são uma seleção pedagógica do StaziaMed, não um ranking oficial do Inep nem uma previsão de prova. A contagem de cada tema é o número de questões oficiais catalogadas (Revalida e ENAMED) ligadas a ele; questões anuladas ficam de fora.",
  official_total: 1217,
  annulled: 83,
  linked: 701,
  unlinked: 516,
  areas: [
    { id: "cm", name: "Clínica Médica", themes: 2, questions: 12 },
    { id: "go", name: "Ginecologia e Obstetrícia", themes: 2, questions: 16 },
    { id: "sm", name: "Saúde Mental", themes: 1, questions: 0 },
  ],
  themes: [
    { id: "GR-001", order: 1, title: "Tuberculose pulmonar", area: "cm", area_name: "Clínica Médica", subarea: "Infectologia", status: "aula_pronta_aguardando_revisao", total: 12, by_exam: { "revalida-2024-1": 7, "enamed-2025": 5 } },
    { id: "GR-002", order: 2, title: "Diabetes mellitus tipo 2", area: "cm", area_name: "Clínica Médica", subarea: "Endocrinologia", status: "roteiro_em_validacao", total: 0, by_exam: {} },
    { id: "GR-043", order: 43, title: "Assistência ao pré-natal", area: "go", area_name: "Ginecologia e Obstetrícia", subarea: "Obstetrícia / Pré-natal", status: "roteiro_em_validacao", total: 1, by_exam: { "revalida-2022-2": 1 } },
    { id: "GR-044", order: 44, title: "Infecções na gestação e congênitas", area: "go", area_name: "Ginecologia e Obstetrícia", subarea: "Obstetrícia / Infectologia", status: "roteiro_em_validacao", total: 15, by_exam: { "revalida-2023-1": 15 } },
    { id: "GR-097", order: 97, title: "Psicoses e esquizofrenia", area: "sm", area_name: "Saúde Mental", subarea: "Psiquiatria / Psicoses", status: "roteiro_em_validacao", total: 0, by_exam: {} },
  ],
};

let go: any;
beforeEach(() => {
  go = vi.fn();
  tutorRequests.length = 0;
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_grandes_temas") return DATA;
    if (fn === "app_start_session") return { session_id: "sess-1", count: 12 };
    throw new Error(`rpc não simulada: ${fn} ${JSON.stringify(args)}`);
  });
});
afterEach(cleanup);

const calls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);

describe("Grandes Temas: 100 Grandes Temas Prioritários", () => {
  it("o banner 'Como contamos' diz que é seleção pedagógica (não ranking do Inep), o que é contado, as anuladas e quantas ficam sem tema", async () => {
    render(<ThemesScreen go={go} />);
    const banner = await screen.findByText("Como contamos");
    const texto = banner.parentElement!.textContent!;
    expect(texto).toMatch(/seleção pedagógica do StaziaMed/);
    expect(texto).toMatch(/não um ranking oficial do Inep/);
    expect(texto).toMatch(/questões oficiais catalogadas \(Revalida e ENAMED\) ligadas a ele/);
    expect(texto).toMatch(/1\.?217 questões oficiais \(fora as 83 anuladas\)/);
    expect(texto).toMatch(/701 estão ligadas a algum dos 100 temas e 516 ainda não têm tema/);
    expect(calls("app_grandes_temas")).toHaveLength(1);
    // a antiga contagem por subárea/competência não é mais chamada
    expect(calls("app_incidence")).toHaveLength(0);
  });

  it("lista os temas por área, com contagem de questões e provas, e a situação do conteúdo", async () => {
    render(<ThemesScreen go={go} />);
    const cm = await screen.findByRole("heading", { name: /Clínica Médica/ });
    expect(cm.textContent).toMatch(/2 temas · 12 questões ligadas/);
    expect(screen.getByRole("heading", { name: /Ginecologia e Obstetrícia/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Saúde Mental/ })).toBeTruthy();
    const tb = screen.getByText("Tuberculose pulmonar").closest("div")!.parentElement!;
    expect(within(tb).getByText("12 questões · 2 provas")).toBeTruthy();
    expect(within(tb).getByText("Aula pronta, aguardando revisão médica")).toBeTruthy();
    expect(within(tb).getByText("Rev. 2024/1: 7")).toBeTruthy();
    expect(within(tb).getByText("ENAMED 2025: 5")).toBeTruthy();
    const pn = screen.getByText("Assistência ao pré-natal").closest("div")!.parentElement!;
    expect(within(pn).getByText("1 questão · 1 prova")).toBeTruthy();
    expect(within(pn).getByText("Roteiro em validação")).toBeTruthy();
    expect(screen.getAllByText("Roteiro em validação")).toHaveLength(4);
  });

  it("tema sem questão mostra 0 questões, explica e não oferece treino (mas mantém o 'Me teste')", async () => {
    render(<ThemesScreen go={go} />);
    const card = (await screen.findByText("Diabetes mellitus tipo 2")).closest("div")!.parentElement!;
    expect(within(card).getByText("0 questões")).toBeTruthy();
    expect(within(card).getByText("Ainda não há questão oficial catalogada ligada a este tema.")).toBeTruthy();
    expect(within(card).queryByRole("button", { name: /Treinar este tema/ })).toBeNull();
    expect(within(card).getByRole("button", { name: "Me teste" })).toBeTruthy();
  });

  it("'Treinar este tema' abre um treino só com as questões ligadas ao tema (filtro grande_tema)", async () => {
    render(<ThemesScreen go={go} />);
    const card = (await screen.findByText("Tuberculose pulmonar")).closest("div")!.parentElement!;
    fireEvent.click(within(card).getByRole("button", { name: /Treinar este tema/ }));
    await waitFor(() => expect(calls("app_start_session")).toHaveLength(1));
    expect(calls("app_start_session")[0][1]).toEqual({ p_kind: "questoes", p_filters: { grande_tema: "GR-001" }, p_count: 20 });
    await waitFor(() => expect(go).toHaveBeenCalledWith("sessao", { s: "sess-1" }));
  });

  it("se o treino não abrir, avisa em português e fica na tela", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_grandes_temas") return DATA;
      throw new Error("Nenhuma questão encontrada com esses filtros.");
    });
    render(<ThemesScreen go={go} />);
    const card = (await screen.findByText("Tuberculose pulmonar")).closest("div")!.parentElement!;
    fireEvent.click(within(card).getByRole("button", { name: /Treinar este tema/ }));
    expect(await screen.findByText("Não há questões disponíveis nesse tema agora.")).toBeTruthy();
    expect(go).not.toHaveBeenCalled();
  });

  it("'Me teste' abre o Tutor com o tema", async () => {
    render(<ThemesScreen go={go} />);
    const card = (await screen.findByText("Tuberculose pulmonar")).closest("div")!.parentElement!;
    fireEvent.click(within(card).getByRole("button", { name: "Me teste" }));
    expect(tutorRequests[0]).toEqual({ mode: "perguntas", topic: "Tuberculose pulmonar", context: { type: "theme", id: "GR-001", label: "Tuberculose pulmonar", area: "Clínica Médica" } });
  });

  it("busca sem acento e filtro por área", async () => {
    render(<ThemesScreen go={go} />);
    await screen.findByText("Tuberculose pulmonar");
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "pre natal" } });
    await waitFor(() => expect(screen.queryByText("Tuberculose pulmonar")).toBeNull());
    expect(screen.getByText("Assistência ao pré-natal")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "" } });
    await waitFor(() => expect(screen.getByText("Tuberculose pulmonar")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Saúde Mental" }));
    expect(screen.getByText("Psicoses e esquizofrenia")).toBeTruthy();
    expect(screen.queryByText("Tuberculose pulmonar")).toBeNull();
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "zzzz" } });
    expect(await screen.findByText("Nada encontrado")).toBeTruthy();
  });

  it("não mostra referências nem fontes ao aluno", async () => {
    render(<ThemesScreen go={go} />);
    await screen.findByText("Tuberculose pulmonar");
    const todo = document.body.textContent ?? "";
    expect(todo).not.toMatch(/Referências?|Fontes?\b|Segundo o |Guia de Vigil|Manual d|Nota Informativa|PCDT|Portaria/i);
  });
});
