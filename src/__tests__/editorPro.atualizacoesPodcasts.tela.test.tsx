/**
 * Editor profissional nas telas de Atualizações e Podcasts (jsdom; banco simulado — o banco de verdade está em
 * editorPro.atualizacoesPodcasts.banco.test.ts).
 *  - AdminUpdates: a formatação vai em p_update.formatacao com as chaves na ordem GRAVADA (linha do tempo em ordem de ano; tirar um
 *    flashcard sobe a formatação dos seguintes); só formatação numa publicada não pergunta "sai do ar".
 *  - UpdatesScreen (aluno): mostra o negrito quando a formatação vale; sem formatação, o desenho de sempre; a das justificativas e
 *    do comentário só é pedida depois de responder.
 *  - AdminPodcasts: a Fala e o texto de fonte com o editor só como texto (sem botões de formatação).
 */
import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { aparaCampo, paraSalvar, tirarItem } from "../shared/atualizacoes/formatacao";

const retangulo = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
const lista = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype] as any[]) {
  if (!proto.getClientRects) proto.getClientRects = lista;
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = retangulo;
}
if (!(document as any).elementFromPoint) (document as any).elementFromPoint = () => null;

const negrito = (t: string) => ({ f: "sdoc", v: 1, doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t, marks: [{ type: "bold" }] }] }] } });

const session: { role: string } = { role: "admin" };
const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const campoFalso = { ligado: false };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: session.role, profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
// AdminUpdates: um campo simples com um botão "Negrito: <rótulo>" que devolve o mesmo texto com negrito (como o editor faria).
// AdminPodcasts: o CampoRico de verdade.
vi.mock("../novo/app/editorPro/CampoRico.jsx", async () => {
  const real: any = await vi.importActual("../novo/app/editorPro/CampoRico.jsx");
  function Falso({ label, texto, rico, onChange }: any) {
    const id = React.useId();
    return (
      <div>
        <label htmlFor={id}>{label}</label>
        <textarea id={id} data-rico={rico ? "sim" : "nao"} value={texto ?? ""} onChange={(e) => onChange({ texto: e.target.value, rico: null })} />
        <button type="button" onClick={() => onChange({ texto, rico: negrito(texto) })}>{`Negrito: ${label}`}</button>
      </div>
    );
  }
  const CampoRico = (p: any) => (campoFalso.ligado ? <Falso {...p} /> : <real.CampoRico {...p} />);
  return { CampoRico, default: CampoRico };
});

import { AdminUpdates } from "../novo/app/admin/AdminUpdates.jsx";
import { UpdateDetail } from "../novo/app/study/UpdatesScreen.jsx";
import { AdminPodcasts } from "../novo/app/admin/AdminPodcasts.jsx";

beforeAll(async () => {
  await import("../novo/app/editorPro/EditorDocumento.jsx"); // o editor é carregado sob demanda: aquece antes dos testes de tela
}, 120_000);
beforeEach(() => {
  backend.rpc.mockReset();
});
afterEach(() => cleanup());

const QUESTAO = {
  statement: "Mulher de 34 anos com DNA-HPV positivo para o tipo 16. Qual é a conduta?",
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alternativa ${id} do caso.`, justification: `Justificativa ${id}.` })),
  answer: "B",
  commentary: "Comentário da questão.",
};
const ITEM = {
  id: "u1", slug: "rastreamento-colo", area: "GINECOLOGIA_OBSTETRICIA", topic: "Rastreamento do colo", subtopic: null, priority: 2, position: 0,
  years: [2024, 2025], publication_label: "03/2025", institution: "INCA", document_title: "Diretrizes", source_url: "https://www.gov.br/inca/x.pdf",
  before_text: "Citologia a cada 3 anos.", current_conduct: "DNA-HPV a cada 5 anos.", clinical_impact: "Menos exames.", exam_impact: "Caso clínico.",
  trap: "Citologia anual.", search_terms: "", timeline: [{ year: 2024, text: "Antes." }, { year: 2025, text: "Mudou." }],
  flashcards: [{ front: "Qual é o teste?", back: "DNA-HPV." }, { front: "Intervalo?", back: "5 anos." }], practice_questions: [QUESTAO],
  review_status: "approved", reviewed: true, published: true, origin: "manual", legacy: {}, can_review: true, updated_at: "2026-10-16T12:00:00Z",
};

describe("formatacao.ts (o que vai para o banco)", () => {
  it("apara só os espaços das pontas, junto com o documento; rico que não bate some", () => {
    expect(aparaCampo("  Febre alta  ", negrito("  Febre alta  "))).toEqual({ texto: "Febre alta", rico: negrito("Febre alta") });
    expect(aparaCampo("Febre alta\n", null)).toEqual({ texto: "Febre alta\n", rico: null });
    expect(aparaCampo("Febre alta", negrito("Outra coisa"))).toEqual({ texto: "Febre alta", rico: null });
  });

  it("tirarItem sobe a formatação dos itens seguintes; paraSalvar avisa acima de 64 campos", () => {
    expect(tirarItem({ "flashcard.0.frente": 1, "flashcard.1.verso": 2, "flashcard.10.verso": 3, trap: 4 }, "flashcard", 0)).toEqual({ "flashcard.0.verso": 2, "flashcard.9.verso": 3, trap: 4 });
    const flashcards = Array.from({ length: 33 }, (_, i) => ({ front: `Frente ${i}`, back: `Verso ${i}` }));
    const f = Object.fromEntries(flashcards.flatMap((c, i) => [[`flashcard.${i}.frente`, negrito(c.front)], [`flashcard.${i}.verso`, negrito(c.back)]]));
    expect(paraSalvar({ flashcards }, [], f).problema).toMatch(/66 campos; o limite é 64/);
  });
});

describe("AdminUpdates: salva a formatação", () => {
  const abrir = async (item: any) => {
    campoFalso.ligado = true;
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_guideline_updates") return { is_admin: true, review_areas: ["GINECOLOGIA_OBSTETRICIA"], items: [item] };
      if (fn === "app_admin_save_guideline_update") return { ...item, ...args.p_update };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<AdminUpdates />);
    fireEvent.click(await screen.findByRole("button", { name: /Rastreamento do colo/ }));
  };
  const salvo = () => backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_admin_save_guideline_update").map((c: any[]) => c[1].p_update);

  it("publicada: só negrito não pergunta 'sai do ar'; as chaves vão certas e o texto não muda", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      await abrir(ITEM);
      fireEvent.click(screen.getByRole("button", { name: "Negrito: Conduta vigente" }));
      fireEvent.click(screen.getAllByRole("button", { name: "Negrito: Verso" })[1]);
      fireEvent.click(screen.getByRole("button", { name: "Negrito: Texto do ano 2" }));
      const q = screen.getByRole("group", { name: "Questão de treino 1" });
      fireEvent.click(within(q).getByRole("button", { name: "Negrito: Enunciado" }));
      fireEvent.click(within(q).getByRole("button", { name: "Negrito: Justificativa da C (por que está certa ou errada)" }));
      fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
      await waitFor(() => expect(salvo()).toHaveLength(1));
      expect(confirm).not.toHaveBeenCalled();
      const p = salvo()[0];
      expect(p.formatacao).toEqual({
        current_conduct: negrito(ITEM.current_conduct),
        "flashcard.1.verso": negrito("5 anos."),
        "timeline.1": negrito("Mudou."),
        "questao.0.enunciado": negrito(QUESTAO.statement),
        "questao.0.justificativa.C": negrito("Justificativa C."),
      });
      expect(p).toMatchObject({ current_conduct: ITEM.current_conduct, timeline: ITEM.timeline, flashcards: ITEM.flashcards, practice_questions: [QUESTAO] });
    } finally {
      confirm.mockRestore();
    }
  });

  it("rascunho: linha do tempo nova de ano anterior: a formatação fica com a chave da posição gravada (ordem de ano); tirar flashcard sobe a formatação", async () => {
    await abrir({ ...ITEM, published: false, review_status: "pending" });
    fireEvent.click(screen.getByRole("button", { name: "Negrito: Texto do ano 1" })); // 2024
    fireEvent.click(screen.getByRole("button", { name: "Acrescentar ano" }));
    const anos = screen.getAllByLabelText("Ano");
    fireEvent.change(anos[2], { target: { value: "2023" } });
    fireEvent.change(screen.getByLabelText("Texto do ano 3"), { target: { value: "Bem antes." } });
    fireEvent.click(screen.getByRole("button", { name: "Negrito: Texto do ano 3" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Negrito: Frente" })[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "Remover flashcard" })[0]);
    expect((screen.getByLabelText("Frente") as HTMLTextAreaElement).dataset.rico).toBe("sim");
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(salvo()).toHaveLength(1));
    const p = salvo()[0];
    // vai na ordem do formulário (como sempre); o banco põe em ordem de ano (2023, 2024, 2025) e as chaves já seguem essa ordem
    expect(p.timeline).toEqual([{ year: 2024, text: "Antes." }, { year: 2025, text: "Mudou." }, { year: 2023, text: "Bem antes." }]);
    expect(p.flashcards).toEqual([{ front: "Intervalo?", back: "5 anos." }]);
    expect(p.formatacao).toEqual({ "timeline.0": negrito("Bem antes."), "timeline.1": negrito("Antes."), "flashcard.0.frente": negrito("Intervalo?") });
  });

  it("formatação gravada abre no campo e volta igual; texto mudado por fora (assistente) = a formatação velha some", async () => {
    await abrir({ ...ITEM, formatacao: { trap: negrito("Citologia anual."), before_text: negrito("Outro texto.") } });
    expect((screen.getByLabelText("Pegadinha da banca") as HTMLTextAreaElement).dataset.rico).toBe("sim");
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(salvo()).toHaveLength(1));
    expect(salvo()[0].formatacao).toEqual({ trap: negrito("Citologia anual.") });
  });
});

describe("UpdatesScreen (aluno): mostra a formatação", () => {
  const abrir = (formatacao: () => any, correcao: () => any = () => null) => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_guideline_update") return { ...ITEM, practice_questions: [{ statement: QUESTAO.statement, options: QUESTAO.options.map(({ id, text }) => ({ id, text })) }] };
      if (fn === "app_guideline_update_formatacao") return formatacao();
      if (fn === "app_guideline_practice_check") return { index: 0, selected: "A", answer: "B", correct: false, options: QUESTAO.options.map(({ id, justification }) => ({ id, justification })), commentary: QUESTAO.commentary };
      if (fn === "app_guideline_practice_formatacao") return correcao();
      throw new Error(`rpc não simulada: ${fn}`);
    });
    return render(<UpdateDetail slug={ITEM.slug} go={() => {}} onBack={() => {}} />);
  };

  it("negrito no 'Antes' e na frente do flashcard; HTML cru nunca", async () => {
    const { container } = abrir(() => ({ before_text: negrito(ITEM.before_text), "flashcard.0.frente": negrito("Qual é o teste?"), trap: negrito("<b>outro</b>") }));
    await waitFor(() => expect(container.querySelector(".at-box--before strong")?.textContent).toBe(ITEM.before_text));
    fireEvent.click(screen.getByRole("tab", { name: /Flashcards/ }));
    await waitFor(() => expect(container.querySelector(".fcp-t strong")?.textContent).toBe("Qual é o teste?"));
    fireEvent.click(screen.getByRole("tab", { name: /Armadilha/ }));
    expect(container.querySelector(".at-trap")?.innerHTML).not.toMatch(/<b>/); // rico de outro texto: some, fica o texto
    expect(container.querySelector(".at-trap .at-text p")?.textContent).toBe(ITEM.trap);
  });

  it("sem formatação (ou se o pedido falhar): o desenho de sempre", async () => {
    const semNada = abrir(() => null);
    await screen.findByText("Citologia a cada 3 anos.");
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_guideline_update_formatacao", { p_slug: ITEM.slug }));
    const html = semNada.container.innerHTML;
    expect(semNada.container.querySelector(".at-box--before")?.innerHTML).toContain('<div class="at-text"><p>Citologia a cada 3 anos.</p></div>');
    cleanup();
    const falha = abrir(() => {
      throw new Error("função não existe");
    });
    await screen.findByText("Citologia a cada 3 anos.");
    await new Promise((r) => setTimeout(r, 20));
    expect(falha.container.innerHTML).toBe(html);
  });

  it("questão de treino: enunciado formatado antes; comentário formatado só depois de responder", async () => {
    const { container } = abrir(() => ({ "questao.0.enunciado": negrito(QUESTAO.statement) }), () => ({ "questao.0.comentario": negrito(QUESTAO.commentary) }));
    await screen.findByText("Citologia a cada 3 anos.");
    fireEvent.click(screen.getByRole("tab", { name: /Miniquiz/ }));
    await waitFor(() => expect([...container.querySelectorAll("strong")].some((s) => s.textContent === QUESTAO.statement)).toBe(true));
    expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_guideline_practice_formatacao")).toBe(false);
    fireEvent.click(screen.getByRole("radio", { name: /Alternativa A do caso/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect([...container.querySelectorAll("strong")].some((s) => s.textContent === QUESTAO.commentary)).toBe(true));
    expect(backend.rpc).toHaveBeenCalledWith("app_guideline_practice_formatacao", { p_slug: ITEM.slug, p_index: 0, p_selected: "A" });
  });
});

describe("AdminPodcasts: Fala e texto de fonte só como texto", () => {
  it("o editor abre nas falas sem nenhum botão de formatação", async () => {
    campoFalso.ligado = false;
    session.role = "editor";
    const ID = "11111111-1111-4111-8111-111111111111";
    const ep = {
      id: ID, title: "Pré-eclâmpsia em 5 minutos", topic: "Pré-eclâmpsia", area: "GINECOLOGIA_OBSTETRICIA", lesson_id: null, target_minutes: 5, status: "script_ready",
      sources: [], chunks_total: 0, cited: {}, approved_at: null, audio_path: null, audio_meta: {}, script_meta: {},
      script: { lines: [{ speaker: "ANA", text: "Hoje: pré-eclâmpsia.", style: "", sources: [] }, { speaker: "BRUNO", text: "Qual a dose?", style: "", sources: [] }], missing: [] },
    };
    (globalThis as any).fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } }));
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_admin_podcasts") return [{ id: ID, title: ep.title, status: ep.status, sources: 0, lines: 2, updated_at: "2026-10-06T12:00:00Z" }];
      if (fn === "app_admin_lessons") return { lessons: [] };
      if (fn === "app_admin_podcast") return ep;
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(
      <MemoryRouter initialEntries={[`/novo/admin?aba=podcasts&ep=${ID}`]}>
        <AdminPodcasts />
      </MemoryRouter>
    );
    await waitFor(() => expect(document.querySelectorAll(".ProseMirror").length).toBeGreaterThanOrEqual(2), { timeout: 20000 });
    expect([...document.querySelectorAll(".ProseMirror")].map((e) => e.textContent)).toEqual(expect.arrayContaining(["Hoje: pré-eclâmpsia.", "Qual a dose?"]));
    expect(screen.getAllByRole("tab", { name: "Revisão" }).length).toBeGreaterThanOrEqual(2); // a barra do editor está lá (só texto)
    expect(screen.queryByRole("button", { name: /Negrito|Itálico|Sublinhado|Cor da fonte|Realce/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Inserir" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Layout" })).toBeNull();
  }, 60_000);
});
