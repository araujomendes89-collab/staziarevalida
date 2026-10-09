import React from "react";
import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AssistantPanel } from "../novo/app/admin/assistant/AssistantPanel.jsx";

const FIELDS = [{ name: "resumo", label: "Resumo", kind: "text", ai: "editar" }, { name: "passos", label: "Passos", kind: "lines", ai: "editar" }, { name: "titulo", label: "Título", kind: "text", ai: "conferir" }, { name: "nota", label: "Nota", kind: "text", ai: "nunca" }];
const LINE = { ready: true, label: "Gemini", model: "gemini-2.5-pro", pending: null };
const STATUS = { preencher: LINE, conferir: LINE, conversar: LINE };
const S = (o: any) => ({ id: "s1", before: null, sources: [{ label: "p. 3", kind: "material" }], warnings: [], redacao: false, append: false, reason: null, ...o });
const R = (o: any) => ({ mode: "preencher", suggestions: [], findings: [], missing: [], reply: null, no_source: [], warnings: [], usage: null, ...o });
const modeRadios = () => within(screen.getByRole("radiogroup", { name: "Modo" })).getAllByRole("radio").map((r) => r.textContent);

describe("AssistantPanel", () => {
  it("três modos; Preencher manda os campos marcados (vazios já vêm marcados)", async () => {
    const run = vi.fn(async () => R({}));
    render(<AssistantPanel status={STATUS} fields={FIELDS} values={{ resumo: "", passos: ["a"], titulo: "T", nota: "" }} run={run} onUse={vi.fn()} />);
    expect(modeRadios()).toEqual(["Preencher", "Conferir", "Conversar"]);
    expect((screen.getByLabelText("Resumo") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Passos") as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText("Título")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("preencher", { fields: ["resumo"] }));
  });

  it("Usar entrega o valor e o item; texto mostra o antes e a fonte", async () => {
    const onUse = vi.fn();
    const item = S({ field: "resumo", value: "Novo.", before: "Velho." });
    render(<AssistantPanel status={STATUS} fields={FIELDS} values={{ resumo: "" }} run={async () => R({ suggestions: [item] })} onUse={onUse} />);
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    const card = await screen.findByRole("region", { name: "Sugestão: Resumo" });
    expect(within(card).getByText("Antes: Velho.")).toBeTruthy();
    expect(within(card).getByText("Fonte: p. 3")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Usar" }));
    expect(onUse).toHaveBeenCalledWith("resumo", "Novo.", expect.objectContaining({ id: "s1" }));
    expect(within(card).getByRole("button", { name: "Usado" })).toBeTruthy();
  });

  it("lista: Usar acrescenta ao fim e o segundo clique não acrescenta de novo", async () => {
    const onUse = vi.fn();
    render(<AssistantPanel status={STATUS} fields={FIELDS} values={{ resumo: "", passos: ["a"] }} run={async () => R({ suggestions: [S({ field: "passos", value: ["b"], append: true })] })} onUse={onUse} />);
    fireEvent.click(screen.getByLabelText("Passos"));
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    const card = await screen.findByRole("region", { name: "Sugestão: Passos" });
    fireEvent.click(within(card).getByRole("button", { name: "Usar" }));
    fireEvent.click(within(card).getByRole("button", { name: "Usado" }));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse).toHaveBeenCalledWith("passos", ["a", "b"], expect.objectContaining({ id: "s1" }));
  });

  it("Conversar: diferença por palavra; campo mudado depois da proposta não é aplicado", async () => {
    const onUse = vi.fn();
    const run = vi.fn(async () => R({ mode: "conversar", reply: "Feito.", suggestions: [S({ field: "resumo", before: "O lactente tem febre.", value: "O lactente tem febre alta." })] }));
    const props = { status: STATUS, fields: FIELDS, run, onUse };
    const { container, rerender } = render(<AssistantPanel {...props} values={{ resumo: "O lactente tem febre." }} />);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Modo" })).getByRole("radio", { name: "Conversar" }));
    fireEvent.change(screen.getByLabelText("Pedido"), { target: { value: "Diga que a febre é alta." } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByText("Feito.");
    expect(run).toHaveBeenCalledWith("conversar", { message: "Diga que a febre é alta." });
    expect(container.querySelector("ins")?.textContent).toContain("alta");
    rerender(<AssistantPanel {...props} values={{ resumo: "Outro texto." }} />);
    fireEvent.click(screen.getByRole("button", { name: "Usar" }));
    expect(screen.getByText("O campo mudou depois da proposta: peça de novo")).toBeTruthy();
    expect(onUse).not.toHaveBeenCalled();
  });

  it("Conferir: sem Usar; suspeita; dono do campo; Propor correção leva ao Conversar", async () => {
    const findings = [
      { id: "f1", field: "resumo", kind: "desatualizado", detail: "Conduta antiga.", sources: [], suspeita: true, owner: null },
      { id: "f2", field: "nota", kind: "erro", detail: "Nota errada.", sources: [{ label: "Item: Nota", kind: "item" }], suspeita: false, owner: "A nota fica com a equipe." },
    ];
    render(<AssistantPanel status={STATUS} fields={FIELDS} values={{ resumo: "x", nota: "y" }} run={async () => R({ mode: "conferir", findings })} onUse={vi.fn()} />);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Modo" })).getByRole("radio", { name: "Conferir" }));
    fireEvent.click(screen.getByRole("button", { name: "Conferir agora" }));
    await screen.findByRole("region", { name: "Achado: Resumo" });
    expect(screen.queryByRole("button", { name: "Usar" })).toBeNull();
    expect(screen.getByText("Possivelmente desatualizado")).toBeTruthy();
    expect(screen.getByText("Suspeita sem fonte: confira antes de mudar")).toBeTruthy();
    expect(screen.getByText("A nota fica com a equipe.")).toBeTruthy();
    const propose = screen.getAllByRole("button", { name: "Propor correção" });
    expect(propose).toHaveLength(1);
    fireEvent.click(propose[0]);
    expect(within(screen.getByRole("radiogroup", { name: "Modo" })).getByRole("radio", { name: "Conversar" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("Pedido") as HTMLTextAreaElement).value).toBe("Resumo: Conduta antiga.");
  });

  it("Conferir de um campo manda só o campo", async () => {
    const run = vi.fn(async () => R({ mode: "conferir" }));
    render(<AssistantPanel status={STATUS} fields={FIELDS} values={{}} run={run} onUse={vi.fn()} />);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Modo" })).getByRole("radio", { name: "Conferir" }));
    fireEvent.change(screen.getByLabelText("O que conferir"), { target: { value: "titulo" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferir agora" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("conferir", { field: "titulo" }));
  });

  it("Sem fonte, A fonte não esclarece, avisos e custo", async () => {
    const res = R({ no_source: ["resumo"], missing: [{ field: "resumo", reason: "Nada sobre dose." }], warnings: ["Número fora do trecho."], usage: { provider: "gemini", label: "Gemini", model: "gemini-2.5-pro", cost_usd: 0.0123, input_tokens: 1, output_tokens: 1 } });
    render(<AssistantPanel status={STATUS} fields={FIELDS} values={{ resumo: "" }} run={async () => res} onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    expect(await screen.findByText("Resumo: Sem fonte: cole um trecho da diretriz ou envie o material")).toBeTruthy();
    expect(screen.getByText("A fonte não esclarece")).toBeTruthy();
    expect(screen.getByText("Confira antes de usar")).toBeTruthy();
    expect(screen.getByText("Número fora do trecho.")).toBeTruthy();
    expect(screen.getByText("US$ 0,0123 · Gemini gemini-2.5-pro")).toBeTruthy();
  });

  it("linha da IA e aviso da aba; IA não pronta desliga o envio", () => {
    const status = { ...STATUS, conversar: { ready: false, label: null, model: null, pending: "Gemini está desligada na Central de IAs." } };
    render(<AssistantPanel notice="Aviso da aba." status={status} fields={FIELDS} values={{}} run={vi.fn()} onUse={vi.fn()} />);
    expect(screen.getByText("Aviso da aba.")).toBeTruthy();
    expect(screen.getByText("IA definida na Central de IAs: Gemini gemini-2.5-pro")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Modo" })).getByRole("radio", { name: "Conversar" }));
    expect(screen.getByText("Gemini está desligada na Central de IAs.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Enviar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("material: link do item, texto colado e notas vão no pedido", async () => {
    const run = vi.fn(async () => R({}));
    const { unmount } = render(<AssistantPanel status={STATUS} fields={FIELDS} values={{ resumo: "", passos: ["a"] }} materialLink="https://www.gov.br/saude/pcdt.pdf" run={run} onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ler o documento oficial deste item" }));
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("preencher", { fields: ["resumo"], material: { url: "https://www.gov.br/saude/pcdt.pdf" } }));
    unmount();
    const run2 = vi.fn(async () => R({}));
    const r2 = render(<AssistantPanel status={STATUS} fields={FIELDS} values={{ resumo: "", passos: ["a"] }} run={run2} onUse={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Texto"), { target: { value: "Trecho colado." } });
    fireEvent.change(screen.getByLabelText("Pedido (opcional)"), { target: { value: "Seja breve." } });
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    await waitFor(() => expect(run2).toHaveBeenCalledWith("preencher", { fields: ["resumo"], message: "Seja breve.", material: { text: "Trecho colado." } }));
    r2.unmount();
    const run3 = vi.fn(async () => R({}));
    render(<AssistantPanel status={STATUS} fields={FIELDS} values={{ resumo: "", passos: ["a"] }} material="notas" run={run3} onUse={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Suas notas"), { target: { value: "Minhas notas." } });
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    await waitFor(() => expect(run3).toHaveBeenCalledWith("preencher", { fields: ["resumo"], material: { text: "Minhas notas." } }));
  });

  it("erro do run aparece e useLabel 'Aplicar' e Descartar", async () => {
    const onDiscard = vi.fn();
    const item = S({ field: "resumo", value: "Novo." });
    render(<AssistantPanel status={STATUS} fields={FIELDS} values={{ resumo: "" }} useLabel="Aplicar" run={async () => R({ suggestions: [item] })} onUse={vi.fn()} onDiscard={onDiscard} />);
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    const card = await screen.findByRole("region", { name: "Sugestão: Resumo" });
    expect(within(card).getByRole("button", { name: "Aplicar" })).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Descartar" }));
    expect(screen.queryByRole("region", { name: "Sugestão: Resumo" })).toBeNull();
    expect(onDiscard).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }));
  });

  it("erro do run vai para um aviso de perigo", async () => {
    render(<AssistantPanel status={STATUS} fields={FIELDS} values={{ resumo: "" }} run={async () => { throw Object.assign(new Error("O assistente falhou: x"), { status: 502 }); }} onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Preencher campos" }));
    expect(await screen.findByText("O assistente falhou: x")).toBeTruthy();
  });

  it("o painel não conhece nenhuma aba", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../novo/app/admin/assistant/AssistantPanel.jsx"), "utf8");
    expect(src).not.toMatch(/questoes|Questões|gabarito|atualizac|planos|app_admin/i);
  });
});
