/**
 * Carga das provas corrigidas: (1) o envio das imagens com os 79 arquivos REAIS (simulação padrão, sem rede; e o envio com um
 * depósito de mentira em memória: confere sha256, não sobrescreve arquivo diferente, segunda vez não envia de novo);
 * (2) o aviso "Gabarito preliminar do Inep" na correção do aluno.
 */
import React from "react";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const backend: any = { rpc: vi.fn(async () => null), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" }, user: { id: "a" }, refresh: async () => {} }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: ({ label }: any) => <button type="button">{label}</button> }));

import { Correction, PreliminarySeal, PRELIMINARY_SEAL, preliminaryText } from "../novo/app/practice/Correction.jsx";
// @ts-ignore módulo .mjs
import { enviarImagens, conferirArquivos } from "../../scripts/carga-provas/subir-imagens.mjs";

const ROOT = path.resolve(__dirname, "../..");
const manifesto = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/carga-provas/manifesto-imagens.json"), "utf8"));
const pasta = path.join(ROOT, "scripts/carga-provas/imagens");
const deposito = () => {
  const m = new Map<string, Buffer>();
  return { m, exists: async (k: string) => m.has(k), get: async (k: string) => m.get(k)!, put: vi.fn(async (k: string, b: Buffer) => void m.set(k, Buffer.from(b))) };
};
afterEach(cleanup);

describe("envio das imagens", () => {
  it("os 79 arquivos reais passam na conferência do servidor (PNG completo, até 5 MB, sha256 do manifesto)", () => {
    const r = conferirArquivos(manifesto, pasta);
    expect(r).toHaveLength(79);
    expect(r.filter((x: any) => x.problema)).toEqual([]);
    expect(manifesto.imagens.filter((i: any) => i.tipo === "tabela")).toHaveLength(66); // 56 das provas + 10 da 2026/2
    expect(new Set(manifesto.imagens.map((i: any) => i.destino)).size).toBe(79);
  });

  it("simular (padrão) não usa depósito nenhum", async () => {
    const r = await enviarImagens({ manifesto, pasta });
    expect([r.modo, r.enviadas, r.problemas.length, r.itens.length]).toEqual(["simular", 0, 0, 79]);
  });

  it("enviar: confere de volta, a segunda vez não envia de novo, e nunca sobrescreve um arquivo diferente", async () => {
    const d = deposito();
    const r1 = await enviarImagens({ manifesto, pasta, storage: d, enviar: true });
    expect([r1.enviadas, r1.ja_estavam, r1.problemas]).toEqual([79, 0, []]);
    const r2 = await enviarImagens({ manifesto, pasta, storage: d, enviar: true });
    expect([r2.enviadas, r2.ja_estavam]).toEqual([0, 79]);
    expect(d.put).toHaveBeenCalledTimes(79);
    const d3 = deposito();
    d3.m.set(manifesto.imagens[0].destino, Buffer.from("outro"));
    const r3 = await enviarImagens({ manifesto, pasta, storage: d3, enviar: true });
    expect(r3.problemas[0].problema).toMatch(/OUTRO arquivo/);
    expect(d3.put).not.toHaveBeenCalled();
  });

  it("arquivo trocado na pasta: nada é enviado", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "img-"));
    for (const i of manifesto.imagens) fs.copyFileSync(path.join(pasta, i.arquivo), path.join(tmp, i.arquivo));
    fs.writeFileSync(path.join(tmp, manifesto.imagens[5].arquivo), Buffer.from("nao e png"));
    const d = deposito();
    const r = await enviarImagens({ manifesto, pasta: tmp, storage: d, enviar: true });
    expect(r.problemas).toHaveLength(1);
    expect(d.put).not.toHaveBeenCalled();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe("selo GABARITO PRELIMINAR (Revalida 2026/2)", () => {
  // Revalida 2026/2 Q1 (texto real da prova; gabarito preliminar do Inep: B); a data vem do banco (exams.final_answer_expected_on)
  const question = { id: "revalida_2026_2_q001", area: "CLINICA_MEDICA", exam: { kind: "REVALIDA", year: 2026, semester: 2 } };
  const base = { is_correct: false, correct_option: "B", annulled: false, option_notes: [], sources: [{ title: "Gabarito oficial do Inep — Revalida INEP 2026/2 — 2ª Edição Semestral", organization: "INEP / MEC" }] };
  const FRASE = "O gabarito definitivo só será divulgado pelo Inep em 04/12/2026.";

  it("a data é dado do banco: a frase sai da data gravada na prova", () => {
    expect(preliminaryText("2026-12-04")).toBe(FRASE);
    expect(preliminaryText("2027-01-15")).toBe("O gabarito definitivo só será divulgado pelo Inep em 15/01/2027.");
    expect(preliminaryText(null)).toBe("O gabarito definitivo ainda não foi divulgado pelo Inep.");
  });

  it("na correção: selo e frase visíveis junto do veredito", () => {
    const { container } = render(<Correction selected="A" correction={{ ...base, answer_preliminary: true, preliminary: { expected_on: "2026-12-04" } }} question={question} />);
    expect(screen.getByText("Resposta incorreta")).toBeTruthy();
    expect(container.querySelector(".tq-verdict__key")!.textContent).toBe("Gabarito: B");
    const nota = screen.getByRole("note", { name: PRELIMINARY_SEAL });
    expect(nota.textContent).toBe(`${PRELIMINARY_SEAL}${FRASE}`);
  });

  it("nas listas (resultado da sessão, caderno de erros) o selo compacto; sem gabarito preliminar, nada", () => {
    const { container } = render(<PreliminarySeal info={{ expected_on: "2026-12-04" }} compact />);
    expect(container.textContent).toBe("GABARITO PRELIMINAR");
    cleanup();
    expect(render(<PreliminarySeal info={null} />).container.textContent).toBe("");
  });

  it("não aparece com gabarito definitivo (o banco manda answer_preliminary falso), servidor antigo ou questão anulada", () => {
    for (const c of [{ ...base, answer_preliminary: false, preliminary: null }, base, { ...base, annulled: true, answer_preliminary: true, preliminary: { expected_on: "2026-12-04" } }]) {
      render(<Correction selected="A" correction={c} question={question} />);
      expect(screen.queryByText(FRASE)).toBeNull();
      expect(screen.queryByText(PRELIMINARY_SEAL)).toBeNull();
      cleanup();
    }
  });
});
