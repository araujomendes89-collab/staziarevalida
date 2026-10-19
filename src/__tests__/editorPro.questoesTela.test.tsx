// @vitest-environment jsdom
/**
 * Editor profissional nas QUESTÕES (013120), nas telas (jsdom, banco simulado). As regras de verdade estão em editorPro.questoesBanco.
 *   - Administração, questões oficiais (QuestionEditor): a formatação vai para p_question.formatacao com as chaves oficiais, pelo
 *     app_admin_save_question de sempre; texto e gabarito não mudam; só formatação não acende os avisos de revisão/análise.
 *   - Inéditas (DraftEditor dentro do DraftDetail): a formatação vai para p_content.formatacao (stem, alt.X...); a tela diz, antes e
 *     depois de salvar, se foi "só formatação" (aprovação mantida) ou texto (volta para a revisão médica).
 *   - Aluno: enunciado, alternativas e correção com negrito pelo ParagrafoRico; sem formatação (ou com formatação velha), igual a hoje.
 *   - Pacote do aluno: nada do TipTap no caminho das telas de questão.
 * O CampoRico de verdade é testado em editorPro.campos; aqui ele vira um textarea com um botão "Negrito: <rótulo>".
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const session: any = { backend, boot: { role: "admin", profile: { name: "Adm" }, reviewer_areas: [] }, user: { id: "a" }, refresh: async () => {} };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/editorPro/CampoRico.jsx", async () => {
  const React = await import("react");
  function CampoRico({ label, texto, rico, onChange }: any) {
    const id = React.useId();
    const negrito = { f: "sdoc", v: 1, doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: String(texto ?? ""), marks: [{ type: "bold" }] }] }] } };
    return (
      <div className="sm-field">
        <label htmlFor={id}>{label}</label>
        <textarea id={id} data-rico={rico ? "sim" : "nao"} value={texto ?? ""} onChange={(e) => onChange?.({ texto: e.target.value, rico: null })} />
        <button type="button" onClick={() => onChange?.({ texto: String(texto ?? ""), rico: negrito })}>{`Negrito: ${label}`}</button>
      </div>
    );
  }
  return { CampoRico, default: CampoRico };
});

import { QuestionEditor } from "../novo/app/admin/AdminQuestions.jsx";
import { DraftDetail } from "../novo/app/admin/content/questoes/DraftDetail.jsx";
import { Alternatives, QuestionStatement } from "../novo/app/practice/tela/QuestionSheet.jsx";
import { CorrectionBody } from "../novo/app/practice/Correction.jsx";
import { QuestionCard } from "../novo/app/tutor/nexus/QuestionCard.jsx";

const negrito = (t: string) => ({ f: "sdoc", v: 1, doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t, marks: [{ type: "bold" }] }] }] } });
const italico = (t: string) => ({ f: "sdoc", v: 1, doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t, marks: [{ type: "italic" }] }] }] } });
let rpcs: Record<string, (args: any) => any> = {};
const call = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
beforeEach(() => {
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    const h = rpcs[fn];
    if (!h) throw new Error(`rpc não simulada: ${fn}`);
    return h(args);
  });
});
afterEach(cleanup);

// ---------------------------------------------------------------- Administração: questões oficiais
const ROW = {
  id: "q1", code: "REV-2024.1-Q001", attempts: 3, exam: { kind: "REVALIDA", year: 2024, semester: 1 }, number: 1, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "",
  statement: "Lactente com desconforto respiratório há dois dias.", options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alt ${id}`, explanation: id === "B" ? "B é a correta." : "" })),
  correct_option: "B", status: "valid", expected_conduct: "Suporte.", inep_intent: "", needs_image: false, images: [], explanations_review: null, comment_review_ready: true,
  official: { answer: "B", answer_status: "FINAL", version: 1, source: "Gabarito definitivo INEP 2024/1", source_url: null, published_at: null },
  formatacao: { statement: negrito("Lactente com desconforto respiratório há dois dias.") },
};

describe("Administração, questões oficiais", () => {
  it("negrito na alternativa e na explicação vai em p_question.formatacao (chaves oficiais); texto e gabarito iguais; sem avisos de revisão", async () => {
    rpcs = { app_admin_question: () => ROW, app_admin_save_question: (a) => ({ ...ROW, formatacao: a.p_question.formatacao }) };
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    // a formatação gravada chega ao campo certo
    expect((await screen.findByLabelText("Enunciado")).getAttribute("data-rico")).toBe("sim");
    expect(screen.getByLabelText("Alternativa A").getAttribute("data-rico")).toBe("nao");
    fireEvent.click(screen.getByRole("button", { name: "Negrito: Alternativa A" }));
    expect(screen.getByLabelText("Alternativa A").getAttribute("data-rico")).toBe("sim");
    fireEvent.click(screen.getByRole("button", { name: "Negrito: Explicação da B (opcional)" }));
    fireEvent.click(screen.getByRole("button", { name: "Negrito: Conduta esperada" }));
    // só formatação: nada de "o comentário vai para revisão" nem "a análise sai do ar"
    expect(screen.queryByText("O comentário vai para revisão")).toBeNull();
    expect(screen.queryByText("A análise publicada sai do ar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salvar questão" }));
    await waitFor(() => expect(call("app_admin_save_question")).toHaveLength(1));
    const q = call("app_admin_save_question")[0][1].p_question;
    expect(Object.keys(q.formatacao)).toEqual(["expected_conduct", "opcao.A.texto", "opcao.B.explicacao", "statement"]);
    expect(q.formatacao["opcao.A.texto"].doc.content[0].content[0]).toMatchObject({ text: "Alt A", marks: [{ type: "bold" }] });
    expect(q.options.map((o: any) => o.text)).toEqual(["Alt A", "Alt B", "Alt C", "Alt D"]);
    expect(q.statement).toBe(ROW.statement);
    expect(q.correct_option).toBe("B");
    expect(await screen.findByText("Questão salva.")).toBeTruthy();
  });

  it("mudar o texto de um campo formatado: a formatação velha dele não vai (não bate mais com o texto) e o aviso de sempre aparece", async () => {
    rpcs = { app_admin_question: () => ROW, app_admin_save_question: (a) => ({ ...ROW, ...a.p_question }) };
    render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("Enunciado"), { target: { value: "Lactente com desconforto respiratório há três dias." } });
    expect(screen.getByText("A análise publicada sai do ar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar questão" }));
    await waitFor(() => expect(call("app_admin_save_question")).toHaveLength(1));
    expect(call("app_admin_save_question")[0][1].p_question.formatacao).toBeNull();
  });
});

// ---------------------------------------------------------------- Inéditas
const HASH = "a".repeat(64);
const DRAFT = {
  id: "d1", batch: "pedido_20261012_abcd1234", source_id: "vaga_01", slot: 1, area: "PEDIATRIA", subarea: null, competency: null, title: "Otite no lactente",
  stem: "Lactente de 8 meses com febre e otalgia. Qual a conduta?", alternatives: { A: "Amoxicilina.", B: "Observar.", C: "Azitromicina.", D: "Ceftriaxona." },
  correct_answer: "A", explanation: "Amoxicilina é a primeira escolha.", alternative_explanations: { A: "Correta. Ok.", B: "Incorreta.", C: "Incorreta.", D: "Incorreta." },
  source_citations: [], update_application: null, similarity_to_official: 12, support_type: "NONE", support_title: null, support_rows: [],
  clinical_decision: "Tratar a otite com amoxicilina.", status: "approved", reviewed_hash: HASH, ai_review: null, generated_by: "servidor", topic: "Otite média aguda",
  content_hash: HASH, published_hash: null, question_id: null, situacao: "approved", can_review: false, can_edit: true, can_publish: true, review_outdated: false,
  blocked_no_source: false, stale_sources: [], approval_blockers: [], checks: {}, formatacao: null,
};

describe("Inéditas: editar com formatação", () => {
  const abrirEditor = async (resposta: any) => {
    rpcs = {
      app_draft_question_detail: () => ({ draft: DRAFT, events: [], proposals: [], similar_question: null, request: null }),
      app_staziamed_topics: () => [{ area: "PEDIATRIA", topic: "Otite média aguda", total: 12 }],
      app_draft_question_save: () => resposta,
    };
    render(<DraftDetail item={DRAFT} isAdmin isStaff onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Otite no lactente/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
  };

  it("só formatação: a tela avisa antes que a aprovação continua, salva p_content.formatacao e depois confirma em português simples", async () => {
    await abrirEditor({ id: "d1", content_hash: HASH, status: "approved", changed: true, so_formatacao: true });
    expect(screen.getByText("Mudar o texto zera as conferências e a revisão médica deste rascunho.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Negrito: Enunciado" }));
    fireEvent.click(screen.getByRole("button", { name: "Negrito: Alternativa B" }));
    fireEvent.click(screen.getByRole("button", { name: "Negrito: Comentário do professor (explicação geral)" }));
    expect(screen.getByText("Até agora você mudou só a formatação.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(call("app_draft_question_save")).toHaveLength(1));
    const args = call("app_draft_question_save")[0][1];
    expect(args.p_hash).toBe(HASH);
    expect(Object.keys(args.p_content.formatacao)).toEqual(["alt.B", "explanation", "stem"]);
    expect(args.p_content.stem).toBe(DRAFT.stem);
    expect(args.p_content.alternatives).toEqual(DRAFT.alternatives);
    expect(args.p_content.correct_answer).toBe("A");
    expect(await screen.findByText("Salvo: só a formatação mudou.")).toBeTruthy();
    expect(screen.getByText(/A aprovação e as conferências continuam valendo/)).toBeTruthy();
  });

  it("texto mudou: a tela avisa que volta para a revisão médica e, depois de salvar, confirma", async () => {
    await abrirEditor({ id: "d1", content_hash: "b".repeat(64), status: "awaiting_medical_review", changed: true, so_formatacao: false });
    fireEvent.change(screen.getByLabelText("Decisão clínica central"), { target: { value: "Tratar a otite com amoxicilina por 10 dias." } });
    expect(screen.getByText("Você mudou o texto.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(call("app_draft_question_save")).toHaveLength(1));
    expect(call("app_draft_question_save")[0][1].p_content.clinical_decision).toBe("Tratar a otite com amoxicilina por 10 dias.");
    expect(call("app_draft_question_save")[0][1].p_content.formatacao).toBeNull();
    expect(await screen.findByText("Salvo: o texto mudou.")).toBeTruthy();
  });
});

// ---------------------------------------------------------------- Aluno
const ENUNCIADO = "Criança de 3 anos com febre há dois dias. Qual a conduta mais adequada?";
const QUESTAO = { id: "q9", statement: ENUNCIADO, options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Texto da ${id}.` })), images: [], support: null };
const DADOS = { staz: false, annulled: false, commentary: null, linked: null, linkedNote: false };

describe("Aluno: leitura com formatação (ParagrafoRico)", () => {
  it("enunciado e alternativa com negrito; sem formatação, a pergunta em negrito no fim do caso (Proposta B)", () => {
    const { container, unmount } = render(<QuestionStatement question={{ ...QUESTAO, formatacao: { statement: negrito(ENUNCIADO) } }} />);
    expect(container.querySelector(".tq-stem strong")?.textContent).toBe(ENUNCIADO);
    unmount();
    const antes = render(<QuestionStatement question={QUESTAO} />);
    expect(antes.container.querySelector("p.tq-stem")?.textContent).toBe(ENUNCIADO);
    expect(antes.container.querySelector(".tq-ask__text")).toBeNull();
    // o único negrito é o da pergunta (a tela pôs, não o banco)
    expect(Array.from(antes.container.querySelectorAll("strong")).map((n) => n.textContent)).toEqual(["Qual a conduta mais adequada?"]);
    antes.unmount();
    const alts = render(<Alternatives options={QUESTAO.options} formatacao={{ "opcao.A.texto": negrito("Texto da A."), "opcao.B.texto": negrito("Texto VELHO da B.") }} stateOf={() => "idle"} />);
    expect(alts.container.querySelector(".tq-alt__text strong")?.textContent).toBe("Texto da A.");
    // formatação velha (o texto mudou depois): a B aparece como sempre, sem negrito
    expect(screen.getByRole("radio", { name: /Texto da B\./ }).querySelector("strong")).toBeNull();
  });

  it("correção: explicação da correta, 'por que não as outras' e conduta com formatação; sem ela, o texto de sempre", () => {
    const correcao = {
      is_correct: true, correct_option: "B", explanation: "A B é a conduta.", option_notes: [{ id: "A", text: "A não trata." }], expected_conduct: "Hidratar.", inep_intent: "Avalia o manejo.",
      formatacao: { "opcao.B.explicacao": negrito("A B é a conduta."), "opcao.A.explicacao": italico("A não trata."), expected_conduct: negrito("Hidratar."), inep_intent: italico("Avalia o manejo.") },
    };
    const { container, unmount } = render(<CorrectionBody selected="B" correction={correcao} question={QUESTAO} data={DADOS} />);
    expect(container.querySelector(".tq-expl strong")?.textContent).toBe("A B é a conduta.");
    expect(container.querySelector(".tq-letters em")?.textContent).toBe("A não trata.");
    expect([...container.querySelectorAll("strong")].map((s) => s.textContent)).toContain("Hidratar.");
    expect([...container.querySelectorAll("em")].map((s) => s.textContent)).toContain("Avalia o manejo.");
    unmount();
    const { formatacao: _f, ...semFormatacao } = correcao;
    const antes = render(<CorrectionBody selected="B" correction={semFormatacao} question={QUESTAO} data={DADOS} />);
    expect(antes.container.querySelector("p.tq-expl")?.textContent).toBe("A B é a conduta.");
    expect(antes.container.querySelector(".tq-expl strong")).toBeNull();
    expect(antes.container.querySelector(".tq-letters span")?.textContent).toBe("A não trata.");
  });

  it("Tutor (cartão da questão): enunciado com negrito quando o tutor_question_view manda a formatação", () => {
    const sessao = { question: { ...QUESTAO, state: "open", exam: null, formatacao: { statement: negrito(ENUNCIADO), "opcao.C.texto": negrito("Texto da C.") } }, hint_level: 0, status: "active" };
    const { container } = render(<QuestionCard session={sessao} marked={null} onMark={vi.fn()} onAnswer={vi.fn()} onHint={vi.fn()} onReveal={vi.fn()} onNext={vi.fn()} />);
    expect(container.querySelector(".nx-q__stem strong")?.textContent).toBe(ENUNCIADO);
    expect([...container.querySelectorAll("strong")].map((s) => s.textContent)).toContain("Texto da C.");
  });
});

// ---------------------------------------------------------------- pacote do aluno
describe("Pacote do aluno: nada do editor (TipTap) no caminho das telas de questão", () => {
  it("as importações (estáticas e dinâmicas) das telas do aluno não chegam ao TipTap, ao EditorDocumento nem ao CampoRico", () => {
    const SRC = path.resolve(__dirname, "..");
    const visto = new Set<string>();
    const ruins: string[] = [];
    const resolver = (de: string, esp: string) => {
      const base = path.resolve(path.dirname(de), esp);
      for (const c of [base, ...[".js", ".jsx", ".ts", ".tsx"].map((e) => base + e), ...["index.js", "index.ts", "index.jsx", "index.tsx"].map((i) => path.join(base, i))])
        if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
      return null;
    };
    const andar = (arq: string) => {
      if (visto.has(arq)) return;
      visto.add(arq);
      if (/EditorDocumento|CampoRico/.test(arq)) ruins.push(path.relative(SRC, arq));
      const fonte = fs.readFileSync(arq, "utf8");
      for (const m of fonte.matchAll(/(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g)) {
        const esp = m[1] ?? m[2] ?? m[3];
        if (/^@tiptap|^prosemirror/.test(esp)) ruins.push(`${path.relative(SRC, arq)} → ${esp}`);
        if (!esp.startsWith(".")) continue;
        const r = resolver(arq, esp);
        if (r && /\.(jsx?|tsx?)$/.test(r)) andar(r);
      }
    };
    for (const f of ["novo/app/practice/PracticeSession.jsx", "novo/app/practice/Correction.jsx", "novo/app/practice/tela/QuestionReview.jsx", "novo/app/tutor/nexus/QuestionCard.jsx"])
      andar(path.join(SRC, f));
    expect(visto.size).toBeGreaterThan(20);
    expect([...visto].some((f) => f.endsWith("ParagrafoRico.jsx"))).toBe(true);
    expect(ruins).toEqual([]);
  });
});
