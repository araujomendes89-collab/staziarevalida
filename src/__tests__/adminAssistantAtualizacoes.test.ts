// @vitest-environment node
/**
 * Assistente das abas: adaptador de Atualizações. Permissão pela área GRAVADA, linha do tempo e flashcards, campos
 * proibidos e busca oficial. IA sempre simulada (mockRespond), sem rede.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startAssistantHarness, type AssistantHarness } from "./helpers/adminAssistantServer";
import { atualizacoesAdapter } from "../../server/adminAssistant/adapters/atualizacoes";

let h: AssistantHarness;
let GO = "";
let CM = "";
const form = (id: string | null, area: string) => ({ id, area, topic: "Pré-eclâmpsia", timeline: [], flashcards: [], current_conduct: "" });
const MATERIAL = "Em 2024 o protocolo passou a recomendar AAS 150 mg a partir de 12 semanas em gestantes de alto risco.";
const V = (o: Record<string, unknown>) => ({ text: null, items: null, timeline: null, flashcards: null, ...o });

beforeAll(async () => {
  h = await startAssistantHarness();
  const id = async (slug: string) => (await h.dev.db.query<any>(`select id from public.guideline_updates where slug = $1`, [slug])).rows[0].id as string;
  GO = await id("prot-go-preeclampsia-2025");
  CM = await id("prot-cm-has-sbc-2026");
}, 300_000);
afterAll(async () => {
  await h?.close();
});

describe("Assistente de Atualizações", () => {
  it("revisor de GO: aceito numa Atualização de GO e recusado numa de CM; editor em qualquer uma; aluno não", async () => {
    const url = await h.listen({ mockRespond: () => ({ findings: [] }) });
    const go = (t: string, id: string | null, area: string) => h.call(`${url}/run`, t, { tab: "atualizacoes", mode: "conferir", form: form(id, area) });
    expect((await go(h.tokens.reviewer, GO, "GINECOLOGIA_OBSTETRICIA")).status).toBe(200);
    expect((await go(h.tokens.reviewer, CM, "CLINICA_MEDICA")).status).toBe(403);
    expect((await go(h.tokens.editor, CM, "CLINICA_MEDICA")).status).toBe(200);
    expect((await go(h.tokens.student, GO, "GINECOLOGIA_OBSTETRICIA")).status).toBe(403);
    expect((await h.call(`${url}/status?tab=atualizacoes`, h.tokens.reviewer)).status).toBe(200);
    expect((await h.call(`${url}/status?tab=atualizacoes`, h.tokens.student)).status).toBe(403);
  });

  it("área trocada no formulário não vale: Atualização de CM com área GO no formulário é recusada", async () => {
    const url = await h.listen({ mockRespond: () => ({ findings: [] }) });
    const run = (f: unknown) => h.call(`${url}/run`, h.tokens.reviewer, { tab: "atualizacoes", mode: "conferir", form: f });
    const r = await run(form(CM, "GINECOLOGIA_OBSTETRICIA"));
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("Você revisa outra área: o assistente vale só para as Atualizações da sua área.");
    // item novo: a área do formulário vale
    expect((await run(form(null, "GINECOLOGIA_OBSTETRICIA"))).status).toBe(200);
    expect((await run(form(null, "CLINICA_MEDICA"))).status).toBe(403);
    // id que não existe: 404
    const missing = await run(form("00000000-0000-4000-8000-000000000999", "GINECOLOGIA_OBSTETRICIA"));
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("Atualização não encontrada.");
  });

  it("linha do tempo acrescenta; ano fora do trecho avisa; ano fora de 2000–2100 sai; flashcard fora do formato sai; endereço da fonte cai", async () => {
    const url = await h.listen({
      mockRespond: () => ({
        suggestions: [
          { field: "timeline", value: V({ timeline: [{ year: 2024, text: "Protocolo recomenda AAS 150 mg." }, { year: 2019, text: "Versão anterior." }, { year: 1990, text: "Antiga." }] }), sources: ["T1"] },
          { field: "flashcards", value: V({ flashcards: [{ front: "ab", back: "x" }, { front: "Dose do AAS?", back: "150 mg" }] }), sources: ["T1"] },
          { field: "source_url", value: V({ text: "https://exemplo.gov.br/x" }), sources: ["T1"] },
        ],
        missing: [],
      }),
    });
    const r = (await h.call(`${url}/run`, h.tokens.editor, { tab: "atualizacoes", mode: "preencher", form: form(GO, "GINECOLOGIA_OBSTETRICIA"), fields: ["timeline", "flashcards"], material: { text: MATERIAL } })).body;
    const tl = r.suggestions.find((s: any) => s.field === "timeline");
    const fc = r.suggestions.find((s: any) => s.field === "flashcards");
    expect(tl).toMatchObject({ field: "timeline", append: true, before: null, value: [{ year: 2024 }, { year: 2019 }] });
    expect(tl.warnings).toEqual(expect.arrayContaining(["Linha do tempo: o ano 2019 não está no trecho citado.", "Linha do tempo: ano 1990 fora de 2000–2100; item descartado."]));
    expect(fc.value).toEqual([{ front: "Dose do AAS?", back: "150 mg" }]);
    expect(r.suggestions.map((s: any) => s.field)).not.toContain("source_url");
    expect(r.warnings).toContain("Sugestão para campo que o assistente não muda foi descartada");
  });

  it("itens existentes de flashcards ficam como estão (todas as chaves) e o contexto traz só campos preenchidos", () => {
    const f = { ...form(GO, "GINECOLOGIA_OBSTETRICIA"), flashcards: [{ front: "P?", back: "R", type: "basic" }], current_conduct: "Conduta X.", institution: "Ministério", document_title: "PCDT", source_url: "https://a.gov.br", publication_label: "2025" };
    expect(atualizacoesAdapter.values(f).flashcards).toEqual([{ front: "P?", back: "R", type: "basic" }]);
    expect(atualizacoesAdapter.patch(f, "current_conduct", "Nova")).toEqual({ current_conduct: "Nova" });
    const ctx = atualizacoesAdapter.context(f, null);
    expect(ctx.item.map((i) => i.field)).toEqual(["topic", "area", "institution", "document_title", "publication_label", "source_url", "current_conduct", "flashcards"]);
    expect(ctx.item.find((i) => i.field === "flashcards")!.text).toBe("P? → R");
    expect(ctx.readOnly).toEqual([]);
    expect(atualizacoesAdapter.itemId(f)).toBe(`atualizacoes:${GO}`);
    expect(atualizacoesAdapter.itemId({})).toBe("atualizacoes:novo");
  });

  it("o pedido à IA leva o item preenchido e as regras da aba; a questão de treino, a situação e a publicação não vão", async () => {
    let seen: any;
    const url = await h.listen({ mockRespond: (req) => ((seen = req), { suggestions: [], missing: [] }) });
    const f = {
      ...form(GO, "GINECOLOGIA_OBSTETRICIA"),
      subtopic: "Síndromes hipertensivas",
      institution: "Ministério da Saúde",
      document_title: "Protocolo de prevenção com AAS",
      publication_label: "05/2025",
      source_url: "https://www.gov.br/saude/pcdt.pdf",
      before_text: "Antes: sem AAS.",
      current_conduct: "Conduta X.",
      practice_questions: [{ statement: "Gestante de 28 anos com pressão 150x100 mmHg e proteinúria.", answer: "B", options: [] }],
      review_status: "approved",
      published: true,
      priority: 1,
      position: 7,
      search_terms: "aas pre-eclampsia",
    };
    const r = await h.call(`${url}/run`, h.tokens.editor, { tab: "atualizacoes", mode: "preencher", form: f, fields: ["exam_impact"], material: { text: MATERIAL } });
    expect(r.status).toBe(200);
    // só o campo pedido é permitido; os preenchidos vão como dado, com marca, na ordem da aba
    expect(seen.input).toContain("Campos permitidos: exam_impact (Como pode aparecer no Revalida)\n");
    const marks = [...seen.input.matchAll(/\[I\d+\] (\w+) \(/g)].map((m) => m[1]);
    expect(marks).toEqual(["topic", "subtopic", "area", "institution", "document_title", "publication_label", "source_url", "before_text", "current_conduct"]);
    for (const text of ["Pré-eclâmpsia", "Síndromes hipertensivas", "Ministério da Saúde", "Protocolo de prevenção com AAS", "05/2025", "https://www.gov.br/saude/pcdt.pdf", "Antes: sem AAS.", "Conduta X."]) expect(seen.input).toContain(text);
    // a questão de treino (tem a resposta), a conferência, a publicação e os números da lista não vão para a IA
    for (const text of ["Gestante de 28 anos", "approved", "review_status", "published", "search_terms", "aas pre-eclampsia", "Somente leitura"]) expect(seen.input).not.toContain(text);
    expect(seen.system).toContain("REGRAS DESTA ABA");
    for (const rule of atualizacoesAdapter.rules) expect(seen.system).toContain(rule);
    expect(seen.system).toContain('- exam_impact (Como pode aparecer no Revalida): texto em "text", até 4000 caracteres; exige trecho [T] ou [F] citado');
  });

  it("Conferir: achado em campo que o assistente não muda diz quem muda (fonte, conferência e publicação)", async () => {
    const url = await h.listen({
      mockRespond: () => ({
        findings: [
          { field: "source_url", kind: "erro", detail: "O endereço parece não abrir.", sources: ["I1"] },
          { field: "review_status", kind: "pouco_claro", detail: "A conferência não registra o documento.", sources: ["I1"] },
          { field: "published", kind: "desatualizado", detail: "Pode estar no ar com texto antigo.", sources: ["I1"] },
          { field: "current_conduct", kind: "erro", detail: "Dose sem unidade.", sources: ["I1"] },
        ],
      }),
    });
    const f = { ...form(GO, "GINECOLOGIA_OBSTETRICIA"), source_url: "https://www.gov.br/saude/pcdt.pdf", current_conduct: "AAS 150." };
    const r = (await h.call(`${url}/run`, h.tokens.editor, { tab: "atualizacoes", mode: "conferir", form: f })).body;
    const owner = (field: string) => r.findings.find((x: any) => x.field === field)?.owner;
    expect(owner("source_url")).toBe("A fonte é o que o revisor confere: fica com a pessoa.");
    expect(owner("review_status")).toBe("A conferência médica é do revisor da área.");
    expect(owner("published")).toBe("Só o administrador publica.");
    expect(owner("current_conduct")).toBeNull(); // esse o assistente muda: tem "Propor correção"
  });

  it("Conversar: a linha do tempo só recebe itens novos, o antes vem do formulário e o total para em 30", async () => {
    const existing = Array.from({ length: 29 }, (_, i) => ({ year: 2000 + i, text: `Marco ${i}.` }));
    const url = await h.listen({
      mockRespond: () => ({
        reply: "Feito.",
        changes: [
          {
            field: "timeline",
            after: V({ timeline: [{ year: 2000, text: "Marco 0." }, { year: 2024, text: "Protocolo recomenda AAS 150 mg." }, { year: 2025, text: "Outra mudança." }] }),
            sources: ["T1"],
            reason: "Vem do trecho.",
          },
        ],
      }),
    });
    const body = { tab: "atualizacoes", mode: "conversar", form: { ...form(GO, "GINECOLOGIA_OBSTETRICIA"), timeline: existing }, message: "Acrescente as mudanças do trecho.", material: { text: MATERIAL } };
    const tl = (await h.call(`${url}/run`, h.tokens.editor, body)).body.suggestions.find((s: any) => s.field === "timeline");
    expect(tl.append).toBe(true);
    expect(tl.before).toEqual(existing);
    expect(tl.value).toEqual([{ year: 2024, text: "Protocolo recomenda AAS 150 mg." }]); // 2000 já existe; 2025 não cabe nos 30
    expect(tl.warnings).toEqual(["Linha do tempo: no máximo 30 itens; 1 ficou de fora."]);
  });

  it("busca oficial com tema, subtema e documento", async () => {
    const queries: any[] = [];
    const db = {
      async service(fn: string, args: any) {
        if (fn === "ch_worker_search_official_passages") {
          queries.push(args);
          return [];
        }
        return h.db.service(fn, args);
      },
    } as any;
    const url = await h.listen({ db: { ...h.db, service: db.service.bind(db) } as any, mockRespond: () => ({ suggestions: [], missing: [] }) });
    const f = { ...form(GO, "GINECOLOGIA_OBSTETRICIA"), topic: "Pré-eclâmpsia", subtopic: "Síndromes hipertensivas", document_title: "Protocolo de prevenção com AAS" };
    await h.call(`${url}/run`, h.tokens.editor, { tab: "atualizacoes", mode: "preencher", form: f, fields: ["current_conduct"] });
    expect(queries).toHaveLength(1);
    expect(queries[0].p_query).toContain("eclâmpsia");
    expect(queries[0].p_query).toMatch(/protocolo/);
    expect(queries[0].p_limit).toBeLessThanOrEqual(10);
  });
});

describe("Motor direto com Atualizações", () => {
  it("allow de revisor sem área e sem equipe: 403 sem consultar o banco", async () => {
    const calls: string[] = [];
    await expect(atualizacoesAdapter.allow({ admin: false, staff: false, reviewer_areas: [] }, {}, { asUser: async (fn: string) => (calls.push(fn), {} as any) })).rejects.toMatchObject({
      status: 403,
      message: "Acesso restrito à equipe de conteúdo.",
    });
    expect(calls).toEqual([]);
  });
});
