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
