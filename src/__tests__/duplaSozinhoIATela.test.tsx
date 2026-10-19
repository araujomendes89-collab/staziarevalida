/**
 * Treino sozinho com avaliação por IA: a janela da escolha (IA indisponível com o motivo, aceite pendente), a espera, a falha com
 * "Tentar de novo" / "Corrigir eu mesmo", o resultado com trecho, razão e etiquetas, "Avisar a equipe" e o sigilo dos termos
 * técnicos. O servidor e a rota de avaliação são simulados; nunca há IA paga de verdade.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { makeSoloServer, resultadoIA } from "./helpers/soloServidor";

const state: { server: ReturnType<typeof makeSoloServer> } = { server: null as any };
const acceptTerms = vi.fn();
vi.mock("../novo/app/session.jsx", () => ({
  useSession: () => ({ backend: state.server.backend, boot: { role: "student" }, user: { id: "u1" }, acceptTerms }),
}));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { Fase2Player } from "../novo/app/fase2/Fase2Player.jsx";

const go = vi.fn();
const IA_OK = { available: true, reason: null, consent_required: false };
const open = () =>
  render(
    <MemoryRouter initialEntries={["/estacao?tentativa=att-teste-1"]}>
      <Fase2Player go={go} />
    </MemoryRouter>
  );
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
/** Palavras que o aluno nunca pode ler. */
const PROIBIDAS = /comit[eê]|central de ias|claude|anthropic|gemini|vertex|openai|gpt|sonnet|opus|\bmodelo\b|prompt|custo|\busd\b|us\$/i;

beforeEach(() => {
  go.mockReset();
  acceptTerms.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => json({}, 404)));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Janela 'Como você quer corrigir?' com a IA", () => {
  it("IA indisponível: botão desligado com o motivo do servidor; a autoavaliação continua disponível", async () => {
    for (const reason of ["Disponível em outro plano.", "Você usou as avaliações de hoje.", "Você usou as avaliações do mês.", "A avaliação por IA está indisponível agora."]) {
      state.server = makeSoloServer({ status: "submitted", ia: { available: false, reason, consent_required: false } });
      open();
      const dialog = await screen.findByRole("dialog", { name: "Como você quer corrigir?" });
      const ia = within(dialog).getByRole("button", { name: "Avaliar com IA" });
      expect(ia).toBeDisabled();
      expect(within(dialog).getByText(reason)).toBeTruthy();
      expect(ia.getAttribute("aria-describedby")).toBe("f2-solo-ia-reason");
      expect(within(dialog).getByRole("button", { name: "Eu mesmo avalio com o PEP" })).not.toBeDisabled();
      expect(within(dialog).queryByRole("button", { name: "Ler e aceitar o aviso" })).toBeNull();
      fireEvent.click(ia); // desligado: nada acontece
      expect(fetch).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("aceite pendente: o botão leva ao aviso do Tutor; aceitar libera 'Avaliar com IA'", async () => {
    const options: any = { status: "submitted", ia: { available: false, reason: "Aceite o aviso para usar a IA.", consent_required: true } };
    state.server = makeSoloServer(options);
    acceptTerms.mockImplementation(async () => {
      options.ia = IA_OK; // o servidor passa a aceitar a IA
    });
    open();
    const choose = await screen.findByRole("dialog", { name: "Como você quer corrigir?" });
    expect(within(choose).getByText("Aceite o aviso para usar a IA.")).toBeTruthy();
    expect(within(choose).getByRole("button", { name: "Avaliar com IA" })).toBeDisabled();
    fireEvent.click(within(choose).getByRole("button", { name: "Ler e aceitar o aviso" }));

    const aviso = await screen.findByRole("dialog", { name: "Aviso sobre a inteligência artificial" });
    expect(screen.queryByRole("dialog", { name: "Como você quer corrigir?" })).toBeNull(); // uma janela por vez
    const check = await within(aviso).findByRole("checkbox", { name: "Li e concordo" });
    expect(state.server.callsOf("app_tutor_status")).toHaveLength(1);
    const continuar = within(aviso).getByRole("button", { name: "Continuar" });
    expect(continuar).toBeDisabled();
    fireEvent.click(check);
    fireEvent.click(continuar);
    await waitFor(() => expect(acceptTerms).toHaveBeenCalledWith({ document: "tutor_ia", version: "2.0", origin: "tutor" }));

    const again = await screen.findByRole("dialog", { name: "Como você quer corrigir?" });
    await waitFor(() => expect(within(again).getByRole("button", { name: "Avaliar com IA" })).not.toBeDisabled());
    expect(within(again).queryByRole("button", { name: "Ler e aceitar o aviso" })).toBeNull();
  });

  it("Esc fecha o aviso e volta à escolha", async () => {
    state.server = makeSoloServer({ status: "submitted", ia: { available: false, reason: "Aceite o aviso para usar a IA.", consent_required: true } });
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Ler e aceitar o aviso" }));
    await screen.findByRole("dialog", { name: "Aviso sobre a inteligência artificial" });
    fireEvent.keyDown(document, { key: "Escape" });
    await screen.findByRole("dialog", { name: "Como você quer corrigir?" });
  });
});

describe("Avaliando, falha e conclusão", () => {
  it("Avaliar com IA pede a rota autenticada e mostra 'Avaliando…' sem contador; ao terminar mostra o resultado", async () => {
    state.server = makeSoloServer({ status: "submitted", ia: IA_OK });
    let release: (r: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Avaliar com IA" }));
    await screen.findByRole("heading", { name: "Avaliando…" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toBe("/api/dupla/solo/att-teste-1/evaluate");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token-de-teste");
    // sem contador falso: nenhum mm:ss nem porcentagem na espera
    expect(screen.queryByText(/\d+%/)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    // o servidor termina e a rota responde
    state.server.set({ status: "done", source: "ia", result: resultadoIA() });
    release(json({ ok: true }));
    await screen.findByRole("heading", { name: "Resultado do treino sozinho" });
    expect(screen.queryByRole("heading", { name: "Avaliando…" })).toBeNull();
  });

  it("recarregar enquanto avalia volta à espera e, quando o servidor termina, a consulta leve mostra o resultado", async () => {
    state.server = makeSoloServer({ status: "evaluating", source: null });
    open();
    await screen.findByRole("heading", { name: "Avaliando…" });
    expect(screen.queryByRole("dialog")).toBeNull();
    state.server.set({ status: "done", source: "ia", result: resultadoIA() });
    await screen.findByRole("heading", { name: "Resultado do treino sozinho" }, { timeout: 8000 });
  }, 12000);

  it("a rota recusa: a mensagem em português aparece com 'Tentar de novo' e 'Corrigir eu mesmo'", async () => {
    state.server = makeSoloServer({ status: "submitted", ia: IA_OK });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "Você usou as avaliações de hoje." }, 429))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Avaliar com IA" }));
    const dialog = await screen.findByRole("dialog", { name: "Como você quer corrigir?" });
    expect(within(dialog).getByText("Você usou as avaliações de hoje.")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Avaliar com IA" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Eu mesmo avalio com o PEP" })).toBeNull();
    // tentar de novo manda a rota outra vez
    fireEvent.click(within(dialog).getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("erro técnico da rede nunca aparece cru: vira frase em português", async () => {
    state.server = makeSoloServer({ status: "submitted", ia: IA_OK });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Avaliar com IA" }));
    const dialog = await screen.findByRole("dialog", { name: "Como você quer corrigir?" });
    expect(dialog.textContent).not.toMatch(/failed|fetch|typeerror/i);
    expect(within(dialog).getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
  });

  it("falha anterior guardada no servidor (ia_message): aparece com 'Tentar de novo' e 'Corrigir eu mesmo'; Corrigir eu mesmo abre o PEP", async () => {
    state.server = makeSoloServer({ status: "submitted", ia: IA_OK, iaMessage: "A avaliação não ficou pronta. Tente de novo." });
    open();
    const dialog = await screen.findByRole("dialog", { name: "Como você quer corrigir?" });
    expect(within(dialog).getByText("A avaliação não ficou pronta. Tente de novo.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Tentar de novo" })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Corrigir eu mesmo" }));
    await screen.findByText("Padrão Esperado de Procedimentos");
    expect(state.server.callsOf("app_fase2_finish")).toHaveLength(1);
  });
});

describe("Resultado da avaliação por IA", () => {
  const openResult = (result: any = resultadoIA()) => {
    state.server = makeSoloServer({ status: "done", source: "ia", result });
    open();
  };

  it("selos Sozinho e IA, nota 7,25 / 10,00, aviso fixo e observação da IA", async () => {
    openResult();
    await screen.findByRole("heading", { name: "Resultado do treino sozinho" });
    const head = screen.getByRole("heading", { name: "Resultado do treino sozinho" }).parentElement!;
    expect(within(head).getByText("Sozinho")).toBeTruthy();
    expect(within(head).getByText("IA")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Resumo da nota" })).getByText("7,25")).toBeTruthy();
    expect(screen.getByText("Avaliação feita por inteligência artificial. Ela pode errar. A nota vale só contra o PEP desta estação.")).toBeTruthy();
    expect(screen.getByText("Observação da IA")).toBeTruthy();
    expect(screen.getByText("Texto organizado e direto.")).toBeTruthy();
    expect(screen.getByText("Pontos positivos")).toBeTruthy();
    expect(screen.getByText("Pontos para melhorar")).toBeTruthy();
  });

  it("cada item mostra 'Trecho seu' e 'Por quê' em acordeão e as etiquetas certas", async () => {
    openResult();
    await screen.findByRole("heading", { name: "Resultado do treino sozinho" });
    const itens = within(screen.getByRole("list", { name: "Quadro por item" })).getAllByRole("listitem");
    expect(itens).toHaveLength(5);

    // 1: adequado, com trecho e razão, sem etiqueta
    const trecho = within(itens[0]).getByRole("button", { name: "Trecho seu" });
    expect(trecho.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trecho);
    expect(trecho.getAttribute("aria-expanded")).toBe("true");
    expect(within(itens[0]).getByText("Boa tarde, sou o médico de teste")).toBeTruthy();
    fireEvent.click(within(itens[0]).getByRole("button", { name: "Por quê" }));
    expect(within(itens[0]).getByText("Citou a apresentação.")).toBeTruthy();

    // 2: parcial e as duas IAs divergiram
    expect(within(itens[1]).getByText("Parcial")).toBeTruthy();
    expect(within(itens[1]).getByText("As duas IAs divergiram")).toBeTruthy();
    // 3: incorrect sem trecho = não citado
    expect(within(itens[2]).getByText("Inadequado")).toBeTruthy();
    expect(within(itens[2]).getByText("Não citado no seu texto")).toBeTruthy();
    expect(within(itens[2]).queryByRole("button", { name: "Trecho seu" })).toBeNull();
    expect(within(itens[2]).getByRole("button", { name: "Por quê" })).toBeTruthy();
    // 4: sem trecho que prove
    expect(within(itens[3]).getByText("A IA não achou um trecho seu que provasse este item")).toBeTruthy();
    expect(within(itens[3]).getByText("Sem avaliação")).toBeTruthy();
    // 5: sem avaliação (nota nula), a frase aparece uma vez só
    expect(within(itens[4]).getAllByText("Sem avaliação")).toHaveLength(1);
    expect(within(itens[4]).queryByRole("button", { name: "Trecho seu" })).toBeNull();
  });

  it("o aluno nunca lê empresa, modelo, prompt, custo, 'comitê' nem 'Central de IAs', nem se o servidor mandasse", async () => {
    const result: any = resultadoIA();
    result.ia = { ...result.ia, company: "Anthropic", model: "claude-sonnet-5-5", cost_usd: 0.04, members: [{ company: "Google" }], prompt: "prompt secreto" };
    result.marks = result.marks.map((m: any) => ({ ...m, model: "gpt-teste", company: "OpenAI", cost_usd: 0.01 }));
    openResult(result);
    await screen.findByRole("heading", { name: "Resultado do treino sozinho" });
    expect(document.body.textContent).not.toMatch(PROIBIDAS);
    expect(document.body.textContent).not.toContain("0.04");

    // as outras telas do caminho da IA também
    cleanup();
    state.server = makeSoloServer({ status: "submitted", ia: { available: false, reason: "Aceite o aviso para usar a IA.", consent_required: true }, iaMessage: "A avaliação não ficou pronta. Tente de novo." });
    open();
    await screen.findByRole("dialog", { name: "Como você quer corrigir?" });
    expect(document.body.textContent).not.toMatch(PROIBIDAS);
    cleanup();
    state.server = makeSoloServer({ status: "evaluating" });
    open();
    await screen.findByRole("heading", { name: "Avaliando…" });
    expect(document.body.textContent).not.toMatch(PROIBIDAS);
  });

  it("'Avisar a equipe que a avaliação errou' abre a janela e manda o aviso com o item e a observação; confirma com 'Aviso enviado.'", async () => {
    openResult();
    await screen.findByRole("heading", { name: "Resultado do treino sozinho" });
    fireEvent.click(screen.getByRole("button", { name: "Avisar a equipe que a avaliação errou" }));
    const dialog = await screen.findByRole("dialog", { name: "Avisar a equipe que a avaliação errou" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Sobre qual item?" }), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Observação (opcional)" }), { target: { value: "Eu citei o exame." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar aviso" }));
    await within(screen.getByRole("dialog")).findByText("Aviso enviado.");
    expect(state.server.callsOf("app_fase2_report_ia")[0].args).toEqual({ p_attempt_id: "att-teste-1", p_order: 2, p_note: "Eu citei o exame." });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("o aviso vale para a avaliação inteira sem item e sem observação; o erro do servidor aparece em português", async () => {
    openResult();
    await screen.findByRole("heading", { name: "Resultado do treino sozinho" });
    fireEvent.click(screen.getByRole("button", { name: "Avisar a equipe que a avaliação errou" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar aviso" }));
    await within(screen.getByRole("dialog")).findByText("Aviso enviado.");
    expect(state.server.callsOf("app_fase2_report_ia")[0].args).toEqual({ p_attempt_id: "att-teste-1", p_order: null, p_note: "" });

    cleanup();
    state.server = makeSoloServer({ status: "done", source: "ia", result: resultadoIA(), errors: { app_fase2_report_ia: "Só dá para avisar sobre uma avaliação por IA concluída." } });
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Avisar a equipe que a avaliação errou" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Enviar aviso" }));
    await screen.findByText("Só dá para avisar sobre uma avaliação por IA concluída.");
    expect(screen.queryByText("Aviso enviado.")).toBeNull();
  });
});
