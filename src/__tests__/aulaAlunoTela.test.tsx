/**
 * A aula dentro do Grande Tema (tela do aluno), jsdom com banco simulado (forma de app_tema_aula, migração 9992).
 * Regras: botão só com aula publicada; sem PDF/baixar/código do tema; Voltar aos temas mantém filtro; fixação corrige ao tocar;
 * anotações (uma por seção, migração 9994) e caixas gravadas no banco; imagens sem arrastar nem menu.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" }, user: { id: "u" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: ({ label }: any) => <button type="button">{label}</button> }));
import { ThemesScreen } from "../novo/app/study/ThemesScreen.jsx";
import { boxOf } from "../novo/app/study/TemaAula.jsx";

const TEMAS = {
  method: "Seleção.", official_total: 10, annulled: 0, linked: 5, unlinked: 5,
  areas: [{ id: "cm", name: "Clínica Médica", themes: 2, questions: 5 }],
  themes: [
    { id: "GR-001", order: 1, title: "Tuberculose pulmonar", area: "cm", area_name: "Clínica Médica", subarea: "Infectologia", status: "aula_pronta_aguardando_revisao", total: 5, by_exam: { a: 5 } },
    { id: "GR-002", order: 2, title: "Diabetes mellitus tipo 2", area: "cm", area_name: "Clínica Médica", subarea: "Endocrinologia", status: "roteiro_em_validacao", total: 0, by_exam: {} },
  ],
};
const AULA = {
  lesson_id: "11111111-1111-4111-8111-111111111111", titulo: "Tuberculose pulmonar: da tosse ao controle", tema: "Tuberculose pulmonar", area: "cm", area_nome: "Clínica Médica", subarea: "Infectologia",
  cabecalho: "Material StaziaMed · revisado por médico da área em 14/10/2026 · não é material oficial do Inep", atualizado_em: "2026-10-14T12:00:00Z",
  pontos_chave: ["Tosse por três semanas ou mais é sintomático respiratório."],
  secoes: [
    { titulo: "Caso clínico de abertura", paragrafos: ["Marcos, 34 anos, tosse há um mês."] },
    { titulo: "Bloco 1 · Suspeita clínica", paragrafos: ["O ponto de partida é o sintomático respiratório.", "Armadilha clássica: cicatriz de BCG não afasta tuberculose.", "Atenção ao tempo de tosse em cinco grupos."] },
    { titulo: "Erros frequentes na prova", paragrafos: ["Esperar três semanas de tosse em pessoa privada de liberdade."] },
  ],
  tabelas: [{ titulo: "Leitura do TRM-TB", posicao: 2, headers: ["Resultado", "Conduta"], rows: [["MTB detectado", "Tratar"]] }],
  midias: [{ tipo: "video", titulo: "Vídeo de apoio", posicao: 1, duracao_segundos: 60, embed_url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", legenda: "Legenda", transcricao: null }],
  revisao_aula: { titulo: "Revisão da Aula", alt: "Revisão da Aula: Tuberculose", texto_alternativo: "Página A4 de revisão." },
  flashcards: { cartoes: [{ n: 1, frente: "Quanto tempo de tosse?", verso: "Três semanas.", imagem: true }, { n: 2, frente: "Outro?", verso: "Sim.", imagem: false }] },
  questoes: { itens: [{ numero: "1", enunciado: "Qual afirmação está correta?", alternativas: [{ id: "A", text: "Errada." }, { id: "B", text: "Certa." }], correta: "B", comentarios: [{ id: "A", text: "Incorreta porque sim." }, { id: "B", text: "Correta porque sim." }] }] },
};

let go: any; let comAula: string[]; let aula: any;
beforeEach(() => {
  go = vi.fn(); comAula = ["GR-001"]; aula = AULA;
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_grandes_temas") return TEMAS;
    if (fn === "app_temas_com_aula") return comAula;
    if (fn === "app_tema_aula") return aula;
    if (fn === "app_lesson_notes") return { note: "anotação antiga", notas: { geral: "anotação antiga" }, checks: { "sec-1": true } };
    if (fn === "app_lesson_section_note_save" || fn === "app_lesson_checks_save") return { ok: true };
    throw new Error(`rpc não simulada: ${fn}`);
  });
  (globalThis as any).fetch = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) }));
  (URL as any).createObjectURL = () => "blob:teste";
  (URL as any).revokeObjectURL = () => {};
  window.scrollTo = vi.fn() as any;
});
afterEach(cleanup);
const calls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const abrir = async () => { render(<ThemesScreen go={go} />); fireEvent.click(await screen.findByRole("button", { name: /Abrir a aula/ })); await screen.findByRole("heading", { level: 1 }); };

describe("cartão do tema", () => {
  it("'Abrir a aula' só no tema com aula publicada; os outros seguem sem botão", async () => {
    render(<ThemesScreen go={go} />);
    await screen.findByText("Diabetes mellitus tipo 2");
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Abrir a aula/ })).toHaveLength(1));
  });
  it("sem aula publicada (banco devolve lista vazia ou a função ainda não existe) não há botão", async () => {
    comAula = [];
    render(<ThemesScreen go={go} />);
    await screen.findByText("Tuberculose pulmonar");
    expect(screen.queryByRole("button", { name: /Abrir a aula/ })).toBeNull();
    cleanup();
    backend.rpc.mockImplementation(async (fn: string) => { if (fn === "app_grandes_temas") return TEMAS; throw new Error("não existe"); });
    render(<ThemesScreen go={go} />);
    await screen.findByText("Tuberculose pulmonar");
    expect(screen.queryByRole("button", { name: /Abrir a aula/ })).toBeNull();
  });
});

describe("página do tema com a aula", () => {
  it("mostra capa, sumário, seções numeradas, caixas, tabela, mídia, flashcards, Revisão da Aula e anotações", async () => {
    await abrir();
    expect(calls("app_tema_aula")[0][1]).toEqual({ p_tema_id: "GR-001" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Tuberculose pulmonar/);
    expect(screen.getByRole("navigation", { name: "Sumário da aula" })).toBeTruthy();
    expect(screen.getByText("Pegadinha de prova!")).toBeTruthy();
    expect(screen.getAllByText("Atenção").length).toBeGreaterThan(0);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(document.querySelector("iframe")!.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(screen.getByRole("button", { name: /Virar flashcard 1 de 2/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Revisão da Aula" })).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("textbox", { name: "Anotação geral desta aula" }) as HTMLTextAreaElement).value).toBe("anotação antiga"));
    expect(screen.getAllByRole("textbox", { name: /^Minha anotação da seção/ })).toHaveLength(AULA.secoes.length);
  });

  it("nada de PDF, baixar, código do tema nem link de arquivo; imagens sem arrastar", async () => {
    await abrir();
    await waitFor(() => expect(document.querySelectorAll("img").length).toBeGreaterThan(0));
    const t = document.body.textContent!;
    expect(t).not.toMatch(/GR-\d{3}|\bPDF\b|baixar|download/i);
    expect(document.querySelectorAll("a[download], a[href$='.pdf']").length).toBe(0);
    for (const img of Array.from(document.querySelectorAll("img"))) expect(img.getAttribute("draggable")).toBe("false");
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.querySelector("img")!.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    expect((globalThis as any).fetch.mock.calls.map((c: any[]) => c[0]).every((u: string) => /^\/api\/content-hub\/aula-aluno\/GR-001\/(revisao|frente|verso)\/\d+$/.test(u))).toBe(true);
  });

  it("fixação corrige ao tocar: acerto e erro com a explicação da alternativa", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: /A\s*Errada/ }));
    expect(screen.getByRole("status").textContent).toMatch(/Não foi essa. A resposta correta é a alternativa B/);
    expect(screen.getByRole("status").textContent).toMatch(/Incorreta porque sim/);
    expect(screen.getByRole("status").textContent).toMatch(/Correta porque sim/);
  });

  it("caixa marcada e anotação são gravadas no banco (caixas por aula, anotação por seção)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await abrir();
      await waitFor(() => expect((screen.getByRole("textbox", { name: "Anotação geral desta aula" }) as HTMLTextAreaElement).value).toBe("anotação antiga"));
      fireEvent.click(screen.getAllByLabelText("Marcar esta seção como estudada")[1]);
      fireEvent.change(screen.getByRole("textbox", { name: /^Minha anotação da seção 2/ }), { target: { value: "nova nota" } });
      await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
      expect(calls("app_lesson_checks_save").map((c: any[]) => c[1])).toEqual([{ p_lesson_id: AULA.lesson_id, p_checks: { "sec-1": true, "sec-2": true } }]);
      expect(calls("app_lesson_section_note_save").map((c: any[]) => c[1])).toEqual([{ p_lesson_id: AULA.lesson_id, p_secao: "sec-2", p_note: "nova nota" }]);
    } finally { vi.useRealTimers(); }
  });

  it("Voltar aos temas devolve a lista com a busca e o filtro que estavam", async () => {
    render(<ThemesScreen go={go} />);
    fireEvent.change(await screen.findByPlaceholderText(/Buscar tema/), { target: { value: "tuberculose" } });
    fireEvent.click(await screen.findByRole("button", { name: /Abrir a aula/ }));
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Voltar aos temas" }));
    expect((await screen.findByPlaceholderText(/Buscar tema/) as HTMLInputElement).value).toBe("tuberculose");
    await waitFor(() => expect(screen.queryByText("Diabetes mellitus tipo 2")).toBeNull());
    expect(calls("app_grandes_temas")).toHaveLength(1); // não recarrega a lista
  });

  it("se o banco devolver nulo (aula retirada), mostra aviso simples e o botão de voltar", async () => {
    aula = null;
    await abrir().catch(() => undefined);
    expect(await screen.findByText(/ainda não está disponível/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Voltar aos temas" })).toBeTruthy();
  });

  it("classifica Pegadinha e Atenção só pelo começo do texto", () => {
    expect(boxOf("Armadilha clássica: cicatriz de BCG.")).toMatchObject({ kind: "peg", body: "cicatriz de BCG." });
    expect(boxOf("Atenção ao tempo de tosse.")).toMatchObject({ kind: "atencao" });
    expect(boxOf("O ponto de partida é outro.")).toBeNull();
  });
});
