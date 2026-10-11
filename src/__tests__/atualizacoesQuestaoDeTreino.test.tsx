/**
 * AT07: a questão de treino de uma Atualização é editada em formulário (enunciado, alternativas A a D com justificativa, gabarito e
 * comentário), e não mais em código com chaves em inglês. Grava no formato que o banco já usa, sem perder o que o formulário não mostra.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminUpdates } from "../novo/app/admin/AdminUpdates.jsx";

// formato real das questões de treino já gravadas (inclui chaves que o formulário não mostra: difficulty e old_protocol_trap)
const OPTIONS = [
  { id: "A", text: "Repetir o teste de DNA-HPV em 12 meses.", justification: "Incorreto. Essa conduta é para outro caso.", old_protocol_trap: false },
  { id: "B", text: "Encaminhar a paciente para colposcopia imediata.", justification: "Correto. HPV 16 ou 18 impõe colposcopia direta.", old_protocol_trap: false },
  { id: "C", text: "Repetir a citologia oncótica em 6 meses.", justification: "Incorreto. Atrasa a colposcopia.", old_protocol_trap: true },
  { id: "D", text: "Prescrever imiquimode e reavaliar em 1 ano.", justification: "Incorreto. Sem indicação em colo sem NIC.", old_protocol_trap: false },
];
const QUESTION = {
  difficulty: "MEDIO",
  statement: "Mulher de 34 anos, assintomática, com teste de DNA-HPV positivo para o tipo 16 e citologia reflexa sem atipias. Qual é a conduta?",
  options: OPTIONS,
  answer: "B",
  commentary: "No rastreamento com DNA-HPV, o tipo 16 ou 18 impõe colposcopia diagnóstica imediata.",
};
const ITEM = {
  id: "u1", slug: "prot-x", area: "GINECOLOGIA_OBSTETRICIA", topic: "Atualização de teste", subtopic: null, years: [2025], priority: 1,
  publication_label: "05/2025", institution: "Instituição", document_title: "Documento", source_url: "https://www.gov.br/saude/pcdt.pdf", before_text: "Antes.",
  timeline: [{ year: 2025, text: "Mudou." }], current_conduct: "Agora.", clinical_impact: null, exam_impact: null, trap: null, search_terms: "teste",
  flashcards: [], practice_questions: [QUESTION], reviewed: false, reviewed_at: null, published: false, review_status: "pending", review_note: null,
  reviewer: null, source_checked_at: null, origin: "manual", position: 1, can_review: true, legacy: {},
};

let listed: any;
const saveCalls = () => backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_admin_save_guideline_update");
const saved = () => saveCalls().at(-1)[1].p_update.practice_questions;
const open = async () => fireEvent.click(await screen.findByRole("button", { name: /Atualização de teste/ }));
const group = (n: number) => screen.getByRole("group", { name: `Questão de treino ${n}` });
const field = (g: HTMLElement, label: string | RegExp) => within(g).getByLabelText(label) as HTMLTextAreaElement | HTMLSelectElement;
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: /Salvar alterações|Criar atualização/ }));

beforeEach(() => {
  listed = ITEM;
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_admin_guideline_updates") return { is_admin: true, review_areas: ["GINECOLOGIA_OBSTETRICIA"], items: [listed] };
    if (fn === "app_admin_save_guideline_update") return { ...listed, ...args.p_update, id: args.p_update.id ?? "u9" };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

describe("AT07: questão de treino em formulário", () => {
  it("mostra a questão gravada em campos (enunciado, alternativas com justificativa, gabarito, comentário), sem código nem chaves em inglês", async () => {
    render(<AdminUpdates />);
    await open();
    const g = group(1);
    expect(field(g, "Enunciado").value).toBe(QUESTION.statement);
    for (const o of OPTIONS) {
      expect(field(g, `Alternativa ${o.id}`).value).toBe(o.text);
      expect(field(g, new RegExp(`^Justificativa da ${o.id}`)).value).toBe(o.justification);
    }
    expect(field(g, "Gabarito (alternativa correta)").value).toBe("B");
    expect(field(g, /^Comentário/).value).toBe(QUESTION.commentary);
    // nada de JSON: nem campo com código, nem as chaves em inglês na tela
    expect(screen.queryByDisplayValue(/"statement"|"options"|"commentary"/)).toBeNull();
    expect(screen.queryByText(/JSON|statement|options|commentary|justification|answer/)).toBeNull();
    expect(screen.queryByLabelText(/JSON|statement|options|commentary|justification/i)).toBeNull();
  });

  it("salvar sem mexer grava a questão exatamente como estava, inclusive o que o formulário não mostra", async () => {
    render(<AdminUpdates />);
    await open();
    save();
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saved()).toEqual([QUESTION]);
    expect(await screen.findByText("Atualização salva.")).toBeTruthy();
  });

  it("mudar o enunciado, uma alternativa e o gabarito grava no mesmo formato e mantém o resto", async () => {
    render(<AdminUpdates />);
    await open();
    const g = group(1);
    type(field(g, "Enunciado"), "Mulher de 40 anos com DNA-HPV positivo para o tipo 18. Qual é a conduta?");
    type(field(g, "Alternativa C"), "Repetir a citologia em 3 meses.");
    type(field(g, "Gabarito (alternativa correta)"), "C");
    type(field(g, /^Comentário/), "Comentário novo.");
    save();
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saved()).toEqual([
      {
        ...QUESTION,
        statement: "Mulher de 40 anos com DNA-HPV positivo para o tipo 18. Qual é a conduta?",
        options: [OPTIONS[0], OPTIONS[1], { ...OPTIONS[2], text: "Repetir a citologia em 3 meses." }, OPTIONS[3]],
        answer: "C",
        commentary: "Comentário novo.",
      },
    ]);
  });

  it("questão nova: acrescentar, preencher aos poucos (a tela diz o que falta, em português) e salvar no formato do banco", async () => {
    listed = { ...ITEM, practice_questions: [] };
    render(<AdminUpdates />);
    await open();
    expect(screen.queryByRole("group", { name: /Questão de treino/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Acrescentar questão de treino" }));
    const g = group(1);
    save();
    expect(await screen.findByText("Questão de treino 1: o enunciado precisa ter pelo menos 20 caracteres.")).toBeTruthy();
    type(field(g, "Enunciado"), "Gestante de 28 anos com pressão alta e proteinúria. Qual é a conduta?");
    save();
    expect(await screen.findByText("Questão de treino 1: escreva o texto das alternativas A, B, C e D.")).toBeTruthy();
    type(field(g, "Alternativa A"), "Observar.");
    type(field(g, "Alternativa B"), "Internar.");
    type(field(g, "Alternativa C"), "Dar alta.");
    save();
    expect(await screen.findByText("Questão de treino 1: escreva o texto da alternativa D.")).toBeTruthy();
    type(field(g, "Alternativa D"), "Repetir o exame.");
    save();
    expect(await screen.findByText("Questão de treino 1: escolha o gabarito (a alternativa correta).")).toBeTruthy();
    expect(saveCalls()).toHaveLength(0);
    type(field(g, "Gabarito (alternativa correta)"), "B");
    type(field(g, new RegExp("^Justificativa da B")), "Internar é o certo.");
    save();
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saved()).toEqual([
      {
        statement: "Gestante de 28 anos com pressão alta e proteinúria. Qual é a conduta?",
        options: [
          { id: "A", text: "Observar.", justification: "" },
          { id: "B", text: "Internar.", justification: "Internar é o certo." },
          { id: "C", text: "Dar alta.", justification: "" },
          { id: "D", text: "Repetir o exame.", justification: "" },
        ],
        answer: "B",
        commentary: "",
      },
    ]);
  });

  it("várias questões: a segunda tem os próprios campos; remover uma tira só ela", async () => {
    render(<AdminUpdates />);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Acrescentar questão de treino" }));
    expect(field(group(2), "Enunciado").value).toBe("");
    expect(field(group(1), "Enunciado").value).toBe(QUESTION.statement);
    fireEvent.click(screen.getByRole("button", { name: "Remover questão de treino 2" }));
    expect(screen.queryByRole("group", { name: "Questão de treino 2" })).toBeNull();
    save();
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saved()).toEqual([QUESTION]);
    fireEvent.click(screen.getByRole("button", { name: "Remover questão de treino 1" }));
    save();
    await waitFor(() => expect(saveCalls()).toHaveLength(2));
    expect(saved()).toEqual([]);
  });

  it("atualização no ar: mexer na questão de treino pergunta antes (sai do ar); salvar sem mexer não pergunta", async () => {
    listed = { ...ITEM, published: true, review_status: "approved", reviewed: true };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      render(<AdminUpdates />);
      await open();
      save();
      await waitFor(() => expect(saveCalls()).toHaveLength(1));
      expect(confirm).not.toHaveBeenCalled();
      type(field(group(1), "Alternativa D"), "Outra conduta qualquer.");
      save();
      expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/sai do ar/));
      expect(saveCalls()).toHaveLength(1);
      confirm.mockReturnValue(true);
      save();
      await waitFor(() => expect(saveCalls()).toHaveLength(2));
      expect(saved()[0].options[3]).toEqual({ ...OPTIONS[3], text: "Outra conduta qualquer." });
    } finally {
      confirm.mockRestore();
    }
  });

  it("atualização nova sem questão de treino grava lista vazia", async () => {
    render(<AdminUpdates />);
    fireEvent.click(await screen.findByRole("button", { name: "Nova atualização" }));
    fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Pré-eclâmpsia" } });
    save();
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saved()).toEqual([]);
  });
});
