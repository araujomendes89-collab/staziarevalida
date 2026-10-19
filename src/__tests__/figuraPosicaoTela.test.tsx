/**
 * Administração, figura da questão: "Posição no enunciado" (19/10/2026, defeito da Revalida 2024/2 Q73). A equipe diz depois de qual
 * trecho do enunciado cada figura entra e se ela é uma tabela. A tela confere o trecho antes de salvar (precisa aparecer uma vez só) e
 * avisa quando a posição gravada se perdeu porque o enunciado mudou. As regras de verdade estão em figuraPosicaoBanco.test.ts.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "editor" }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { situacaoDoTrecho } from "../novo/app/practice/format.js";
import { FigurePositions } from "../novo/app/admin/QuestionFigureCard.jsx";

afterEach(cleanup);

const STATEMENT = "Recém-nascido com icterícia. Os exames revelam: O pediatra iniciou fototerapia e obteve-se: Qual a conduta adequada?";
const Q = {
  id: "q73",
  statement: STATEMENT,
  images: [
    { url: "/a.png", alt: "Tabela 1" },
    { url: "/b.png", alt: "Tabela 2", apos: "obteve-se:", tipo: "tabela" },
  ],
};

describe("situacaoDoTrecho", () => {
  it("ok, ausente, repetido ou vazio", () => {
    expect(situacaoDoTrecho(STATEMENT, "revelam:")).toBe("ok");
    expect(situacaoDoTrecho(STATEMENT, "não existe")).toBe("ausente");
    expect(situacaoDoTrecho(STATEMENT, "e")).toBe("repetido");
    expect(situacaoDoTrecho(STATEMENT, "  ")).toBe("vazio");
  });
});

describe("Posição no enunciado (Administração)", () => {
  it("mostra a posição gravada, confere o trecho digitado e salva só quando todos estão certos", async () => {
    const onChanged = vi.fn();
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_set_question_figure_layout") return { ...Q, images: Q.images.map((im, i) => ({ ...im, ...args.p_layout[i] })) };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<FigurePositions question={Q} onChanged={onChanged} />);
    const regiao = screen.getByRole("group", { name: "Posição no enunciado" });
    const t1 = within(regiao).getByLabelText("Figura 1: entra depois do trecho") as HTMLInputElement;
    const t2 = within(regiao).getByLabelText("Figura 2: entra depois do trecho") as HTMLInputElement;
    expect(t1.value).toBe("");
    expect(t2.value).toBe("obteve-se:");
    expect((within(regiao).getByLabelText("Figura 2 é uma tabela (usa a largura toda)") as HTMLInputElement).checked).toBe(true);
    const salvar = within(regiao).getByRole("button", { name: "Salvar posição" }) as HTMLButtonElement;
    expect(salvar.disabled).toBe(true); // nada mudou

    fireEvent.change(t1, { target: { value: "e" } });
    expect(within(regiao).getByText(/aparece mais de uma vez/)).toBeTruthy();
    expect(salvar.disabled).toBe(true);
    fireEvent.change(t1, { target: { value: "trecho inventado" } });
    expect(within(regiao).getByText(/não está no enunciado/)).toBeTruthy();
    expect(salvar.disabled).toBe(true);
    fireEvent.change(t1, { target: { value: "revelam:" } });
    expect(salvar.disabled).toBe(false);
    fireEvent.click(within(regiao).getByLabelText("Figura 1 é uma tabela (usa a largura toda)"));
    fireEvent.click(salvar);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_set_question_figure_layout", {
      p_question_id: "q73",
      p_layout: [
        { index: 0, apos: "revelam:", tipo: "tabela" },
        { index: 1, apos: "obteve-se:", tipo: "tabela" },
      ],
    });
    expect(await screen.findByText("Posição salva.")).toBeTruthy();
  });

  it("posição perdida: o enunciado mudou e o trecho gravado sumiu", () => {
    render(<FigurePositions question={{ ...Q, statement: "Texto novo sem o trecho. Qual a conduta adequada?" }} onChanged={() => {}} />);
    expect(screen.getByText(/Posição perdida/)).toBeTruthy();
  });
});
