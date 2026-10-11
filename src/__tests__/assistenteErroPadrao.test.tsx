/**
 * Q13: o erro do assistente nunca aparece cru na tela. O painel comum mostra uma frase padrão em português e manda o detalhe técnico
 * (às vezes em inglês, vindo do provedor ou do navegador) para o console. As recusas que o servidor escreve de propósito para a tela
 * (IA desligada, teto, "você revisa outra área"...) continuam aparecendo.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

// PDF que não abre: o leitor do navegador (pdf.js) responde em inglês
vi.mock("../novo/app/admin/lessonAssistApi.js", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  pdfPages: vi.fn(async () => {
    throw new Error("InvalidPDFException: Invalid PDF structure.");
  }),
}));

import { AssistantPanel } from "../novo/app/admin/assistant/AssistantPanel.jsx";

const PADRAO = "O assistente não conseguiu responder agora. Tente de novo em instantes.";
const PDF_RUIM = "Não foi possível ler este PDF. Confira se ele abre normalmente e não tem senha, ou cole o texto.";
const LINE = { ready: true, label: "Gemini", model: "gemini-2.5-pro", pending: null };
const STATUS = { preencher: LINE, conferir: LINE, conversar: LINE };
const FIELDS = [{ name: "resumo", label: "Resumo", kind: "text", ai: "editar" }];

// o painel é JSX sem tipos: as props saem como `any` para o tsc não exigir as opcionais
const panel = (o: Record<string, unknown>): any => ({ status: STATUS, fields: FIELDS, values: { resumo: "" }, onUse: vi.fn(), ...o });
const failing = (error: unknown) => async () => {
  throw error;
};
const withStatus = (message: string, status: number) => Object.assign(new Error(message), { status });
const preencher = async (run: () => Promise<unknown>) => {
  render(<AssistantPanel {...panel({ run })} />);
  fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
};
const consoleText = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.flat().map((a) => String((a as any)?.message ?? a)).join("\n");

let spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  spy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  spy.mockRestore();
});

describe("Q13: erro do assistente no painel comum", () => {
  it("falha da IA (502, texto do provedor em inglês): frase padrão na tela e o detalhe no console", async () => {
    await preencher(failing(withStatus("O assistente falhou: Gemini HTTP 429: RESOURCE_EXHAUSTED quota exceeded for model gemini-2.5-pro", 502)));
    expect(await screen.findByText(PADRAO)).toBeTruthy();
    expect(screen.queryByText(/quota|RESOURCE_EXHAUSTED|Gemini HTTP/)).toBeNull();
    expect(consoleText(spy)).toContain("RESOURCE_EXHAUSTED quota exceeded");
  });

  it("erro sem status (rede, em inglês): frase padrão; o texto do navegador vai só para o console", async () => {
    await preencher(failing(new TypeError("Failed to fetch")));
    expect(await screen.findByText(PADRAO)).toBeTruthy();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    expect(consoleText(spy)).toContain("Failed to fetch");
  });

  it("erro inesperado do servidor (500) e resposta sem texto nosso ('Erro 502.'): frase padrão", async () => {
    await preencher(failing(withStatus("Cannot read properties of undefined (reading 'options')", 500)));
    expect(await screen.findByText(PADRAO)).toBeTruthy();
    expect(screen.queryByText(/Cannot read properties/)).toBeNull();
    cleanup();
    await preencher(failing(withStatus("Erro 502.", 502)));
    expect(await screen.findByText(PADRAO)).toBeTruthy();
    expect(screen.queryByText("Erro 502.")).toBeNull();
    cleanup();
    await preencher(failing(withStatus("Erro 413.", 413)));
    expect(await screen.findByText(PADRAO)).toBeTruthy();
  });

  it.each([
    [400, "Escolha ao menos um campo que o assistente preenche."],
    [401, "Entre na sua conta."],
    [403, "Você revisa outra área: o assistente vale só para as Atualizações da sua área."],
    [404, "Atualização não encontrada."],
    [413, "Material longo demais: até 400 mil caracteres."],
    [422, "O material não tem texto aproveitável (PDF escaneado?). Cole o texto."],
    [429, "Teto de gasto atingido: Gasto do mês passa do teto."],
    [503, "IA indisponível: Gemini está desligada na Central de IAs."],
  ])("recusa que o servidor escreve para a tela (%i) continua aparecendo", async (status, text) => {
    await preencher(failing(withStatus(text, status)));
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByText(PADRAO)).toBeNull();
  });

  it("PDF que o navegador não consegue abrir: mensagem em português, sem o texto do leitor de PDF", async () => {
    const { container } = render(<AssistantPanel {...panel({ run: vi.fn() })} />);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Material" })).getByRole("radio", { name: "PDF" }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["não é um pdf"], "x.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(8) });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(PDF_RUIM)).toBeTruthy();
    expect(screen.queryByText(/Invalid PDF|InvalidPDF/)).toBeNull();
    expect(consoleText(spy)).toContain("Invalid PDF structure");
  });
});
