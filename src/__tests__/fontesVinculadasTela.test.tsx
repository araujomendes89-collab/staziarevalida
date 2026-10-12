/**
 * Fontes vinculadas nas telas (jsdom, banco simulado; as regras de verdade estão em fontesVinculadasBanco.test.ts).
 *  - Aluno: o quadro "Fontes vinculadas" no comentário da questão, com "Referência atual" e "Versão da época da prova
 *    (histórico — não é a conduta atual)"; conferida e não confirmada = aviso "Fonte não confirmada"; sem conferência = nada.
 *    Anulada: nada (nem a busca). Texto longo quebra a linha (celular sem rolagem lateral).
 *  - Administração › Questões: lista dos vínculos com a situação; "Confirmar" e "Tirar" (com confirmação e motivo opcional).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const session: any = { backend, boot: { role: "student", profile: { name: "Aluna" } }, user: { id: "a" }, refresh: async () => {} };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: ({ label }: any) => <button type="button">{label}</button> }));

import fs from "fs";
import path from "path";
import { HISTORICAL_TITLE, LinkedSources, NOT_CONFIRMED_TEXT, UPDATE_CAPTION, UPDATE_TITLE } from "../novo/app/practice/LinkedSources.jsx";
import { Correction } from "../novo/app/practice/Correction.jsx";
import { QuestionSourceLinksCard } from "../novo/app/admin/QuestionSourceLinksCard.jsx";
import { PCDT_IC, Q_IC, SBC_IC_2018, SECAO_ENUNCIADO, TRECHO_IC_2 } from "./helpers/fontesVinculadasReais";
// @ts-ignore script em JavaScript puro (roda com node, sem compilar)
import { limpaNotaAtualizacao } from "../../scripts/fontes-vinculadas/gerar-sql.mjs";

// Dados REAIS (regra do dono): o arquivo real do agente Vinculador (revalida_2025_2) e o catálogo de fontes conferido.
const FX = path.join(__dirname, "fixtures/fontes-vinculadas");
const REAIS: any[] = JSON.parse(fs.readFileSync(path.join(FX, "vinculos-revalida_2025_2.json"), "utf8"));
const CATALOGO: any[] = JSON.parse(fs.readFileSync(path.join(FX, "catalogo-amostra.json"), "utf8"));
const vinculoReal = (q: string, pred: (v: any) => boolean = () => true) => REAIS.find((it) => it.question_id === q)!.vinculos.find(pred);
// revalida_2025_2_q001: PCDT da insuficiência cardíaca, p. 12 (trecho real do documento)
const V_IC = vinculoReal("revalida_2025_2_q001", (v) => v.pagina === 12);
// revalida_2025_2_q019: PCDT da hipertensão, p. 32, com divergência e a nota do que mudou proposta pelo Vinculador
const V_HAS = vinculoReal("revalida_2025_2_q019", (v) => Boolean(v.nota_atualizacao_proposta));
const HAS = CATALOGO.find((f) => f.id === V_HAS.doc_id);
const NOTA_HAS = limpaNotaAtualizacao(V_HAS.nota_atualizacao_proposta);

const ATUAL = {
  title: PCDT_IC.title, organ: PCDT_IC.organ, year: 2024, version: PCDT_IC.version, act: PCDT_IC.act, url: PCDT_IC.url,
  page: V_IC.pagina, page_label: null, section: null, quote: V_IC.citacao, temporal: "vigente", role: V_IC.papel,
  verified_at: "2026-10-12T15:00:00Z", validity_checked_on: "2026-10-12", update_note: null,
};
const COM_NOTA = {
  title: HAS.titulo, organ: HAS.instituicao, year: 2025, version: HAS.versao, act: HAS.ato, url: HAS.url,
  page: V_HAS.pagina, page_label: null, section: null, quote: V_HAS.citacao, temporal: "vigente", role: V_HAS.papel,
  verified_at: "2026-10-12T15:00:00Z", validity_checked_on: "2026-10-12", update_note: NOTA_HAS,
};
// versão da época da prova: a diretriz SBC 2018 (revogada no catálogo); a "citação" é um trecho literal do enunciado real
const EPOCA = {
  title: SBC_IC_2018.title, organ: SBC_IC_2018.organ, year: null, version: SBC_IC_2018.version, act: null, url: SBC_IC_2018.url,
  page: null, page_label: null, section: SECAO_ENUNCIADO, quote: TRECHO_IC_2, temporal: "historica", role: "conduta",
  verified_at: "2026-10-12T15:00:00Z", validity_checked_on: null, update_note: null,
};
const ROLE = { tratamento: "Tratamento", conduta: "Conduta", diagnostico: "Diagnóstico" } as Record<string, string>;

// sem devolver nada: o que o beforeEach devolve vira limpeza do teste (o vitest chamaria a rpc simulada)
beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(cleanup);

describe("Quadro do aluno", () => {
  it("referência atual: documento, versão, ato, página, seção, citação e data da vigência conferida", () => {
    render(<LinkedSources data={{ status: "confirmada", checked_at: "2026-10-12T15:00:00Z", current: [ATUAL], historical: [] }} />);
    const quadro = screen.getByRole("region", { name: "Fontes vinculadas" });
    expect(within(quadro).getByText("Referência atual")).toBeTruthy();
    const link = within(quadro).getByRole("link", { name: PCDT_IC.title }) as HTMLAnchorElement;
    expect(link.href).toBe(PCDT_IC.url);
    expect(link.target).toBe("_blank");
    // o ano não se repete quando a versão já o traz
    expect(quadro.textContent).toContain(`${PCDT_IC.organ} · versão ${PCDT_IC.version} · ${PCDT_IC.act}`);
    expect(quadro.textContent).toContain(`p. ${V_IC.pagina}`);
    expect(quadro.textContent).toContain(`“${V_IC.citacao}”`);
    expect(quadro.textContent).toContain("Vigência conferida em 12/10/2026");
    expect(within(quadro).getByText(ROLE[V_IC.papel])).toBeTruthy();
    expect(screen.queryByText(UPDATE_TITLE)).toBeNull(); // sem nota, sem o bloco do que mudou
    expect(screen.queryByText("Fonte não confirmada")).toBeNull();
    expect(screen.queryByText(HISTORICAL_TITLE)).toBeNull();
    // celular: o link e a citação longos quebram a linha (sem rolagem lateral)
    expect((link.closest("div") as HTMLElement).style.overflowWrap).toBe("anywhere");
    expect(quadro.style.minWidth).toBe("0px");
  });

  it("versão da época da prova: separada, marcada como histórico e sem data de vigência", () => {
    render(<LinkedSources data={{ status: "confirmada", checked_at: "2026-10-12T15:00:00Z", current: [ATUAL], historical: [EPOCA] }} />);
    const quadro = screen.getByRole("region", { name: "Fontes vinculadas" });
    const titulos = [...quadro.querySelectorAll(".sm-overline")].map((e) => e.textContent);
    expect(titulos).toEqual(["Referência atual", "Versão da época da prova (histórico — não é a conduta atual)"]);
    expect(quadro.textContent).toContain("Explica por que o Inep deu este gabarito. Não use como conduta de hoje.");
    expect(quadro.textContent).toContain(`Seção: ${SECAO_ENUNCIADO}`);
    expect(quadro.textContent).toContain(`“${TRECHO_IC_2}”`);
    expect(quadro.textContent).toContain(`${SBC_IC_2018.organ} · versão ${SBC_IC_2018.version}`);
    expect(quadro.textContent?.match(/Vigência conferida/g)).toHaveLength(1); // só na referência atual
    // só o histórico (referência atual ainda não conferida): aparece só o bloco histórico
    cleanup();
    render(<LinkedSources data={{ status: null, checked_at: null, current: [], historical: [EPOCA] }} />);
    expect(screen.queryByText("Referência atual")).toBeNull();
    expect(screen.getByText(HISTORICAL_TITLE)).toBeTruthy();
    expect(screen.queryByText("Fonte não confirmada")).toBeNull();
  });

  it("conferida e não confirmada: o aviso, nunca uma referência atual no lugar", () => {
    render(<LinkedSources data={{ status: "nao_confirmada", checked_at: "2026-10-12T15:00:00Z", current: [ATUAL], historical: [EPOCA] }} />);
    const quadro = screen.getByRole("region", { name: "Fontes vinculadas" });
    expect(within(quadro).getByText("Fonte não confirmada")).toBeTruthy();
    expect(within(quadro).getByText(NOT_CONFIRMED_TEXT)).toBeTruthy();
    expect(NOT_CONFIRMED_TEXT).toBe("Ainda não localizamos o trecho exato de um documento oficial que sustente esta resposta.");
    expect(quadro.textContent).toContain("Conferência feita em 12/10/2026");
    expect(within(quadro).queryByText("Referência atual")).toBeNull();
    expect(within(quadro).queryByRole("link", { name: PCDT_IC.title })).toBeNull(); // a referência atual não aparece
    expect(within(quadro).queryByText(`“${V_IC.citacao}”`)).toBeNull();
    expect(within(quadro).getByText(HISTORICAL_TITLE)).toBeTruthy();
  });

  it("O que mudou desde a prova: a nota aprovada da referência atual, com o gabarito mantido; não se repete se o comentário já mostra", () => {
    render(<LinkedSources data={{ status: "confirmada", checked_at: "2026-10-12T15:00:00Z", current: [ATUAL, COM_NOTA], historical: [] }} />);
    const quadro = screen.getByRole("region", { name: "Fontes vinculadas" });
    expect(within(quadro).getByText(UPDATE_TITLE)).toBeTruthy();
    expect(within(quadro).getByText(NOTA_HAS)).toBeTruthy();
    expect(NOTA_HAS.startsWith("O que mudou desde a prova")).toBe(false); // o título não se repete dentro da nota
    expect(within(quadro).getByText(UPDATE_CAPTION)).toBeTruthy();
    expect(UPDATE_CAPTION).toContain("O gabarito oficial da prova não muda");
    const titulos = [...quadro.querySelectorAll(".sm-overline")].map((e) => e.textContent);
    expect(titulos).toEqual(["Referência atual", UPDATE_TITLE]);
    cleanup();
    render(<LinkedSources hideUpdateNote data={{ status: "confirmada", checked_at: "2026-10-12T15:00:00Z", current: [ATUAL, COM_NOTA], historical: [] }} />);
    expect(screen.queryByText(UPDATE_TITLE)).toBeNull();
    expect(screen.getByText(`“${V_HAS.citacao}”`)).toBeTruthy(); // a referência continua
    // conferida e não confirmada: nem referência atual, nem nota
    cleanup();
    render(<LinkedSources data={{ status: "nao_confirmada", checked_at: "2026-10-12T15:00:00Z", current: [COM_NOTA], historical: [] }} />);
    expect(screen.queryByText(UPDATE_TITLE)).toBeNull();
  });

  it("ainda não conferida e sem vínculo, ou sem resposta do banco: nada aparece", () => {
    const { container } = render(<LinkedSources data={{ status: null, checked_at: null, current: [], historical: [] }} />);
    expect(container.innerHTML).toBe("");
    const outro = render(<LinkedSources data={null} />);
    expect(outro.container.innerHTML).toBe("");
    // conferência confirmada mas a referência saiu (ex.: fonte substituída): nada, nem aviso
    const terceiro = render(<LinkedSources data={{ status: "confirmada", checked_at: "2026-10-12T15:00:00Z", current: [], historical: [] }} />);
    expect(terceiro.container.innerHTML).toBe("");
  });
});

describe("No comentário da questão (Correção)", () => {
  // ENAMED 2025, questão 1 (real): gabarito A; tema como está na carga; sem textos de explicação (o teste é do quadro)
  const question = { id: Q_IC.id, area: "CLINICA_MEDICA", origin: "official" };
  const correction = { is_correct: true, correct_option: "A", annulled: false, explanation: null, option_notes: [], expected_conduct: null, topic: "Insuficiência cardíaca com fração de ejeção reduzida", sources: [] };
  const routes = (data: any) =>
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_question_source_links") return data;
      if (fn === "app_question_commentary" || fn === "app_attempt_diagnosis") return null;
      throw new Error(`rpc não simulada: ${fn}`);
    });

  it("depois de responder, o quadro aparece com o que o banco devolveu", async () => {
    routes({ status: "confirmada", checked_at: "2026-10-12T15:00:00Z", current: [ATUAL], historical: [EPOCA] });
    render(<Correction selected="A" correction={correction} question={question} />);
    const quadro = await screen.findByRole("region", { name: "Fontes vinculadas" });
    expect(within(quadro).getByText("Referência atual")).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_question_source_links", { p_question_id: question.id });
  });

  it("banco sem a atualização (função não existe): nada aparece, sem erro na tela", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_question_source_links") throw Object.assign(new Error("Could not find the function public.app_question_source_links"), { code: "PGRST202" });
      return null;
    });
    render(<Correction selected="A" correction={correction} question={question} />);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_question_source_links", { p_question_id: question.id }));
    expect(screen.queryByRole("region", { name: "Fontes vinculadas" })).toBeNull();
    expect(screen.queryByText(/não foi atualizada|Não foi possível/)).toBeNull();
  });

  it("questão anulada: nem busca as fontes", async () => {
    routes({ status: "confirmada", checked_at: null, current: [ATUAL], historical: [] });
    render(<Correction selected="A" correction={{ ...correction, annulled: true, correct_option: null }} question={question} />);
    await screen.findByText(/Questão anulada pela banca/);
    expect(backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_question_source_links")).toEqual([]);
    expect(screen.queryByRole("region", { name: "Fontes vinculadas" })).toBeNull();
  });
});

describe("Administração › Questões: Fontes vinculadas", () => {
  // o vínculo real com divergência (q019, PCDT da hipertensão, p. 32): entra em revisão, com a observação e a nota do Vinculador
  const SOURCE = { id: "s1", title: HAS.titulo, organ: HAS.instituicao, version: HAS.versao, url: HAS.url, status: "current", kind: "final", year: 2025 };
  const LINK = {
    id: "l1", role: V_HAS.papel, temporal: "vigente", status: "em_revisao", page: V_HAS.pagina, page_label: null, section: null, quote: V_HAS.citacao, act: HAS.ato,
    update_note: NOTA_HAS, reason: V_HAS.observacao, origin: "importacao", validity_checked_on: null, verified_at: null, verified_by: null,
    hidden: "Ainda não confirmado: o aluno não vê.", source: SOURCE,
  };
  const HIST = {
    ...LINK, id: "l2", temporal: "historica", status: "confirmada", update_note: null, reason: null, page: null, section: SECAO_ENUNCIADO, quote: TRECHO_IC_2, act: null,
    verified_at: "2026-10-12T15:00:00Z", verified_by: "Editora", hidden: null,
    source: { id: "s2", title: SBC_IC_2018.title, organ: SBC_IC_2018.organ, version: SBC_IC_2018.version, url: SBC_IC_2018.url, status: "superseded", kind: "society_guideline", year: null },
  };

  it("mostra a conferência e cada vínculo com a situação; Confirmar chama o banco e mostra o que voltou", async () => {
    let current: any = { check: null, links: [LINK, HIST] };
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_question_source_links") return current;
      if (fn === "app_admin_question_source_link_confirm") {
        expect(args).toEqual({ p_link_id: "l1" });
        current = { check: { status: "confirmada", note: null, origin: "equipe", checked_at: "2026-10-12T16:00:00Z", checked_by: "Editora" }, links: [{ ...LINK, status: "confirmada", verified_at: "2026-10-12T16:00:00Z", verified_by: "Editora", validity_checked_on: "2026-10-12", hidden: null }, HIST] };
        return current;
      }
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<QuestionSourceLinksCard questionId="revalida_2025_2_q019" isNew={false} />);
    const card = await screen.findByRole("region", { name: "Fontes vinculadas" });
    await within(card).findByText(/ainda não conferida/);
    const grupos = within(card).getAllByRole("group", { name: /^Vínculo: / });
    expect(grupos.map((g) => g.getAttribute("aria-label"))).toEqual([`Vínculo: ${HAS.titulo}`, `Vínculo: ${SBC_IC_2018.title}`]);
    expect(within(grupos[0]).getByText("Em revisão")).toBeTruthy();
    expect(within(grupos[0]).getByText("Referência atual")).toBeTruthy();
    expect(grupos[0].textContent).toContain(`Motivo: ${V_HAS.observacao}`);
    expect(grupos[0].textContent).toContain(`O que mudou desde a prova (vai ao aluno só depois de Confirmar): ${NOTA_HAS}`);
    expect(within(grupos[1]).getByText("Confirmada")).toBeTruthy();
    expect(within(grupos[1]).getByText("Versão da época da prova (histórico)")).toBeTruthy();
    expect(within(grupos[1]).queryByRole("button", { name: "Confirmar" })).toBeNull(); // já confirmado: só "Tirar"
    fireEvent.click(within(grupos[0]).getByRole("button", { name: "Confirmar" }));
    expect(await within(card).findByText("Vínculo confirmado.")).toBeTruthy();
    expect(within(card).getByText(/Referência atual conferida e confirmada em 12\/10\/2026, por Editora/)).toBeTruthy();
    const depois = within(card).getAllByRole("group")[0];
    expect(within(depois).getByText("Confirmada")).toBeTruthy();
    expect(depois.textContent).toContain(`O que mudou desde a prova (o aluno vê esta nota): ${NOTA_HAS}`);
  });

  it("Tirar pede confirmação, manda o motivo e mostra a lista de volta; o erro do banco aparece em português", async () => {
    // a nota da conferência é a nota REAL do Vinculador de uma questão "não confirmada"
    const naoConf = REAIS.find((it) => it.conferencia === "nao_confirmada" && it.nota);
    let current: any = { check: { status: "nao_confirmada", note: naoConf.nota, origin: "importacao", checked_at: "2026-10-12T15:00:00Z", checked_by: null }, links: [HIST] };
    let fail = true;
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_question_source_links") return current;
      if (fn === "app_admin_question_source_link_remove") {
        if (fail) {
          fail = false;
          throw Object.assign(new Error("Vínculo não encontrado."), { code: "P0002" });
        }
        expect(args).toEqual({ p_link_id: "l2", p_reason: "Motivo de teste." });
        current = { ...current, links: [] };
        return current;
      }
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<QuestionSourceLinksCard questionId="revalida_2025_2_q019" isNew={false} />);
    const card = await screen.findByRole("region", { name: "Fontes vinculadas" });
    expect(await within(card).findByText(/NÃO confirmada em 12\/10\/2026, importada\. O aluno vê o aviso “Fonte não confirmada”/)).toBeTruthy();
    expect(within(card).getByText(`Nota: ${naoConf.nota}`)).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Tirar" }));
    expect(within(card).getByText("Tirar este vínculo?")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Sim, tirar" }));
    expect(await within(card).findByText("Vínculo não encontrado.")).toBeTruthy();
    fireEvent.change(within(card).getByLabelText("Motivo (opcional)"), { target: { value: " Motivo de teste. " } });
    // Enter no campo do motivo não envia o formulário da questão
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    within(card).getByLabelText("Motivo (opcional)").dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    fireEvent.click(within(card).getByRole("button", { name: "Sim, tirar" }));
    expect(await within(card).findByText("Vínculo tirado.")).toBeTruthy();
    expect(within(card).getByText("Nenhuma fonte vinculada a esta questão ainda.")).toBeTruthy();
    expect(within(card).queryByText("Tirar este vínculo?")).toBeNull();
  });

  it("questão nova: pede para salvar antes e não chama o banco", () => {
    render(<QuestionSourceLinksCard questionId={undefined} isNew />);
    expect(screen.getByText("Salve a questão primeiro.")).toBeTruthy();
    expect(backend.rpc).not.toHaveBeenCalled();
  });
});
