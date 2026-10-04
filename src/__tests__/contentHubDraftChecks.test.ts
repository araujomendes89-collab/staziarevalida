// @vitest-environment node
/**
 * Conferência independente dos rascunhos: erros PLANTADOS num rascunho limpo, para medir o que cada
 * camada pega e quantos acertos legítimos ela barra. A camada de IA usa a simulação (só testes) para
 * exercitar o fluxo; a qualidade real do conferente é medida depois, com chamadas de verdade.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { familyOfModel, resolveRoleProvider, type StructuredRequest } from "../../server/contentHub/ai/provider";
import { redteamCheck, runDraftChecks, softwareChecks, verdictOf, type DraftRow, type Spend } from "../../server/contentHub/draftChecks";
import { MockProvider } from "../../server/contentHub/ai/provider";
import { buildDraftStatements } from "../../scripts/supabase/engine-seed";

const clean = (): DraftRow => ({
  id: "d1",
  batch: "lote",
  source_id: "q1",
  slot: 1,
  area: "PEDIATRIA",
  stem: "Lactente de 8 meses, 8 kg, com febre há 3 dias e diagnóstico de otite média aguda, sem alergia a antibióticos. Qual a conduta?",
  alternatives: {
    A: "Amoxicilina 90 mg/kg/dia por 10 dias.",
    B: "Observar por 48 horas sem antibiótico.",
    C: "Azitromicina dose única.",
    D: "Ceftriaxona intramuscular por 1 dia.",
  },
  correct_answer: "A",
  explanation: "Em lactente com otite média aguda, indica-se amoxicilina 90 mg/kg/dia por 10 dias.",
  alternative_explanations: {
    A: "Correta. Amoxicilina 90 mg/kg/dia por 10 dias é a conduta inicial.",
    B: "Incorreta. Em menores de 2 anos a observação isolada não é a conduta.",
    C: "Incorreta. Não é a primeira escolha.",
    D: "Incorreta. Reservada para falha terapêutica.",
  },
  source_citations: [{ source_file: "Manual oficial.pdf", supported_claim: "Em menores de 2 anos com otite média aguda, amoxicilina 90 mg/kg/dia por 10 dias." }],
  update_application: null,
  similarity_to_official: 12,
  support_type: "NONE",
  support_title: null,
  support_rows: [],
  clinical_decision: "Tratar otite média aguda do lactente com amoxicilina 90 mg/kg/dia por 10 dias.",
  model: "gpt-5.6-luna",
  content_hash: "h1",
});
const official = new Set(["Manual oficial.pdf"]);
const codes = (d: DraftRow, opts = {}) => softwareChecks(d, { officialFiles: official, ...opts }).map((f) => f.code);

describe("Camada software — erros plantados", () => {
  it("rascunho limpo não gera nenhum apontamento (zero falso alarme)", () => {
    expect(softwareChecks(clean(), { officialFiles: official })).toEqual([]);
    expect(verdictOf([])).toBe("pass");
  });

  const planted: [string, (d: DraftRow) => void, string, "critical" | "major" | "minor"][] = [
    ["duas alternativas marcadas como corretas", (d) => (d.alternative_explanations.B = "Correta. Também serve."), "single_answer", "critical"],
    ["gabarito diferente da explicação", (d) => (d.correct_answer = "C"), "answer_mismatch", "critical"],
    ["nenhuma alternativa marcada como correta", (d) => (d.alternative_explanations.A = "Incorreta. Engano."), "single_answer", "critical"],
    ["alternativas repetidas", (d) => (d.alternatives.D = d.alternatives.B), "duplicate_option", "critical"],
    ["alternativa vazia", (d) => (d.alternatives.C = "  "), "empty_option", "critical"],
    ["dose trocada na resposta (sem apoio nas citações)", (d) => (d.alternatives.A = "Amoxicilina 50 mg/kg/dia por 10 dias."), "numbers_unsupported", "major"],
    ["duração trocada na explicação", (d) => (d.explanation = "Indica-se amoxicilina 90 mg/kg/dia por 5 dias."), "numbers_unsupported", "major"],
    ["unidade trocada (mg/kg/dose × mg/kg/dia)", (d) => (d.alternatives.A = "Amoxicilina 90 mg/kg/dose por 10 dias."), "numbers_unsupported", "major"],
    ["semelhança excessiva com questão oficial", (d) => (d.similarity_to_official = "91.2"), "too_similar_official", "critical"],
    ["semelhança alta com questão oficial", (d) => (d.similarity_to_official = 74), "similar_official", "major"],
    ["sem nenhuma citação", (d) => (d.source_citations = []), "no_citation", "critical"],
    ["só cita material de terceiros", (d) => (d.source_citations = [{ source_file: "Apostila de curso.pdf", supported_claim: "Amoxicilina 90 mg/kg/dia por 10 dias." }]), "third_party_source_only", "major"],
    ["explicação ausente", (d) => (d.alternative_explanations.C = ""), "explanation_missing", "major"],
    ["gerador pediu imagem que não existe", (d) => (d.support_type = "IMAGE_REQUEST"), "image_requested", "critical"],
    ["depende de figura que não acompanha", (d) => (d.stem = "Observe a imagem a seguir. " + d.stem), "figure_missing", "major"],
    ["resposta bem mais longa (pista)", (d) => (d.alternatives.A = "Amoxicilina 90 mg/kg/dia por 10 dias, associada a analgesia, hidratação oral adequada e retorno em 48 horas para reavaliação."), "answer_cue", "minor"],
  ];

  it.each(planted)("pega: %s", (_name, mutate, code, severity) => {
    const d = clean();
    mutate(d);
    const found = softwareChecks(d, { officialFiles: official });
    const hit = found.find((f) => f.code === code);
    expect(hit, `esperava ${code}; veio ${found.map((f) => f.code).join(", ") || "nada"}`).toBeDefined();
    expect(hit!.severity).toBe(severity);
  });

  it("explicação em prosa, sem rótulo, não vira falha crítica (formato real de 18 rascunhos): fica como aviso menor", () => {
    const d = clean();
    d.alternative_explanations = {
      A: "A amoxicilina 90 mg/kg/dia por 10 dias é a melhor resposta, pois é a conduta inicial.",
      B: "A observação isolada não é a conduta em menores de 2 anos.",
      C: "A azitromicina não é a primeira escolha.",
      D: "A ceftriaxona fica para falha terapêutica.",
    };
    const found = softwareChecks(d, { officialFiles: official });
    expect(found.map((f) => f.code)).toEqual(["explanation_unlabeled"]);
    expect(found[0].severity).toBe("minor");
    expect(verdictOf(found)).toBe("issues");
    // 'Adequada/Inadequada' também são rótulos
    d.alternative_explanations = { A: "Adequada. Conduta inicial.", B: "Inadequada. Não indicada.", C: "Inadequada. Não indicada.", D: "Inadequada. Não indicada." };
    expect(softwareChecks(d, { officialFiles: official })).toEqual([]);
  });

  it("número que está no enunciado ou na tabela de apoio não é apontado", () => {
    const d = clean();
    d.stem += " Peso de 8 kg.";
    d.support_rows = [{ label: "Temperatura", value: "38,9 °C" }];
    d.explanation = "Lactente de 8 kg com 38,9 °C: amoxicilina 90 mg/kg/dia por 10 dias.";
    expect(codes(d)).not.toContain("numbers_unsupported");
  });

  it("cópia do material-fonte: crítico acima de 50% das sequências de 6 palavras, atenção acima de 25%", () => {
    const d = clean();
    const reference = `${d.stem} ${Object.values(d.alternatives).join(" ")} texto de preenchimento diferente`;
    const copied = softwareChecks(d, { officialFiles: official, referenceTexts: { "Manual oficial.pdf": reference } });
    expect(copied.find((f) => f.code === "copied_from_source")?.severity).toBe("critical");
    expect(codes(d, { referenceTexts: { "Manual oficial.pdf": "assunto totalmente diferente sobre outra doença e outro cenário clínico qualquer" } })).not.toContain("copied_from_source");
  });

  it("o veredito é por bloqueio: um crítico basta; só atenção vira 'com apontamentos'", () => {
    expect(verdictOf([{ severity: "critical", code: "x", detail: "" }, { severity: "minor", code: "y", detail: "" }])).toBe("fail");
    expect(verdictOf([{ severity: "major", code: "x", detail: "" }])).toBe("issues");
    expect(verdictOf([{ severity: "info", code: "x", detail: "" }])).toBe("pass");
  });
});

describe("Independência entre criador e conferente", () => {
  const env = { ...process.env };
  afterAll(() => Object.assign(process.env, env));

  it("reconhece a família pelo nome do modelo", () => {
    expect(familyOfModel("gpt-5.6-luna")).toBe("openai");
    expect(familyOfModel("claude-sonnet-5-5")).toBe("anthropic");
    expect(familyOfModel("gemini-2.5-pro")).toBe("google");
    expect(familyOfModel("qwen3:8b")).toBe("qwen");
    expect(familyOfModel("mock-dev (simulação, não é IA)")).toBe("mock");
  });

  it("conferente da mesma família do criador é recusado, com o motivo", () => {
    process.env.CONTENT_HUB_AI_ALLOW_EXTERNAL = "1";
    process.env.ANTHROPIC_API_KEY = "chave-de-teste-nao-usada";
    process.env.CONTENT_HUB_AI_PROVIDER_REDTEAM = "anthropic";
    const same = resolveRoleProvider("redteam", "claude-opus-5-5");
    expect(same.provider).toBeNull();
    expect(same.status.pending).toMatch(/Sem independência.*mesma família/);
    const other = resolveRoleProvider("redteam", "gpt-5.6-luna");
    expect(other.provider?.model).toBe("claude-sonnet-5-5");
  });

  it("sem autorização para envio externo, a IA não é usada", () => {
    process.env.CONTENT_HUB_AI_ALLOW_EXTERNAL = "";
    process.env.CONTENT_HUB_AI_PROVIDER_SOURCES = "anthropic";
    const r = resolveRoleProvider("sources", "gpt-5.6-luna");
    expect(r.provider).toBeNull();
    expect(r.status.pending).toMatch(/ALLOW_EXTERNAL/);
  });
});

describe("Camadas com banco e simulação de IA", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ch-draftchecks-"));
  let dev: DevDatabase;
  let db: ContentDb;
  const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
  const spend = (): Spend => ({ calls: 0, inputTokens: 0, outputTokens: 0, costUsd: null });

  beforeAll(async () => {
    dev = await openDevDatabaseForTests(path.join(tmp, "db"));
    db = devContentDb(async () => dev);
    for (const st of buildDraftStatements()) await dev.db.exec(st);
    Object.assign(process.env, { CONTENT_HUB_AI_PROVIDER_REDTEAM: "mock", CONTENT_HUB_AI_PROVIDER_SOURCES: "mock", CONTENT_HUB_AI_PROVIDER_CURRENCY: "mock" });
  }, 240_000);
  afterAll(async () => {
    await dev?.db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("a tabela de apoio dos rascunhos foi importada (79 têm dados sem os quais não se responde) e o que pede imagem fica à vista", async () => {
    const r = (await sql(`select count(*) filter (where support_type <> 'NONE')::int com_apoio, count(*) filter (where support_type in ('TABLE', 'LAB_PANEL') and jsonb_array_length(support_rows) = 0)::int apoio_vazio, count(*) filter (where support_type = 'IMAGE_REQUEST')::int pede_imagem, count(*) filter (where clinical_decision is null)::int sem_afirmacao from public.draft_questions`))[0];
    expect(r.com_apoio).toBe(80); // 79 com tabela + 1 pedido de imagem
    expect(r.apoio_vazio).toBe(0);
    expect(r.pede_imagem).toBe(1);
    expect(r.sem_afirmacao).toBe(0);
  });

  it("software roda nos 200, é idempotente e só reconfere o que mudou", async () => {
    const first = await runDraftChecks({ db }, { layers: ["software"], limit: 500 });
    expect(first[0]).toMatchObject({ considered: 200, saved: 200 });
    expect(Object.values(first[0].verdicts).reduce((a, b) => a + b, 0)).toBe(200);
    const again = await runDraftChecks({ db }, { layers: ["software"], limit: 500 });
    expect(again[0]).toMatchObject({ considered: 0, saved: 0 });
    // conteúdo mudou: só aquele rascunho volta a ser conferido
    const [d] = await sql(`select id from public.draft_questions limit 1`);
    await sql(`update public.draft_questions set content_hash = 'novo-' || content_hash where id = $1`, [d.id]);
    expect((await runDraftChecks({ db }, { layers: ["software"] }))[0].considered).toBe(1);
  });

  it("todos os 200 aparecem com 'fonte só de terceiros' enquanto não há fonte oficial cadastrada", async () => {
    const n = (await sql(`select count(*)::int n from public.draft_checks where layer = 'software' and findings @> '[{"code":"third_party_source_only"}]'::jsonb`))[0].n;
    expect(n).toBe(200);
  });

  it("fontes e atualidade: sem acervo oficial o resultado é 'insuficiente'/'inconclusivo' e nenhuma IA é chamada", async () => {
    let called = 0;
    const mockRespond = () => {
      called++;
      return {};
    };
    const r = await runDraftChecks({ db, mockRespond }, { layers: ["sources", "currency"], limit: 500 });
    expect(r[0]).toMatchObject({ layer: "sources", saved: 200, verdicts: { insufficient: 200 } });
    expect(r[1]).toMatchObject({ layer: "currency", saved: 200, verdicts: { inconclusive: 200 } });
    expect(called).toBe(0);
    expect((await sql(`select count(*)::int n from public.ch_ai_runs where step like 'draft_check:%'`))[0].n).toBe(0);
  });

  it("com fonte oficial cadastrada: citação literal e números conferidos; 'compatível' com número ausente é rebaixado", async () => {
    const src = (await sql(`insert into public.ch_sources (title, organ, kind, version, published_on, authority_level) values ('PCDT de teste', 'Ministério da Saúde (teste)', 'final', '2026', '2026-01-01', 'A') returning id`))[0].id;
    const [draft] = await sql(`select id, clinical_decision from public.draft_questions order by batch, slot limit 1`);
    const passage = `Texto sintético de teste. ${draft.clinical_decision} Fim do trecho sintético.`;
    await sql(`insert into public.ch_source_passages (source_id, section, page, text) values ($1, 'Tratamento', 7, $2)`, [src, passage]);
    await sql(`delete from public.draft_checks where draft_id = $1`, [draft.id]);

    const respond = (quote: string) => (req: StructuredRequest) => {
      const payload = JSON.parse(req.input.match(/<documento>\n([\s\S]*)\n<\/documento>/)![1]);
      return { verdict: req.promptId === "currency" ? "current" : "compatible", passage_id: payload.trechos[0].passage_id, quote, rationale: "simulação" };
    };
    const ok = await runDraftChecks({ db, mockRespond: respond(passage) }, { layers: ["sources"], limit: 1 });
    expect(ok[0].verdicts).toEqual({ pass: 1 });

    await sql(`delete from public.draft_checks where draft_id = $1`, [draft.id]);
    await sql(`delete from public.ch_ai_runs`);
    const invented = await runDraftChecks({ db, mockRespond: respond("Texto que não está na fonte.") }, { layers: ["sources"], limit: 1 });
    expect(invented[0].verdicts).toEqual({ inconclusive: 1 });

    await sql(`delete from public.draft_checks where draft_id = $1`, [draft.id]);
    await sql(`delete from public.ch_ai_runs`);
    await sql(`update public.ch_source_passages set text = regexp_replace(text, '[0-9]+', '', 'g') where source_id = $1`, [src]);
    const stripped = (await sql(`select text from public.ch_source_passages where source_id = $1`, [src]))[0].text;
    const hasNumbers = /\d+\s*(mg|g|ml|mcg|%|dias?|horas?|semanas?|meses)/i.test(draft.clinical_decision);
    const down = await runDraftChecks({ db, mockRespond: respond(stripped) }, { layers: ["sources"], limit: 1 });
    expect(down[0].verdicts).toEqual(hasNumbers ? { fail: 1 } : { pass: 1 });
  });

  it("atualidade: fonte com vigência encerrada reprova sem precisar de IA", async () => {
    await sql(`update public.ch_sources set valid_until = '2020-01-01' where title = 'PCDT de teste'`);
    const [draft] = await sql(`select id from public.draft_questions order by batch, slot limit 1`);
    await sql(`delete from public.draft_checks where draft_id = $1`, [draft.id]);
    let called = 0;
    const r = await runDraftChecks({ db, mockRespond: () => (called++, {}) }, { layers: ["currency"], limit: 1 });
    expect(r[0].verdicts).toEqual({ fail: 1 });
    expect(called).toBe(0);
    const f = (await sql(`select findings from public.draft_checks where draft_id = $1 and layer = 'currency'`, [draft.id]))[0].findings;
    expect(f[0].code).toBe("source_expired");
  });

  it("revisão clínica: resposta às cegas diferente do gabarito é crítico; tudo fica registrado", async () => {
    const [row] = await sql<DraftRow>(`select * from public.draft_questions order by batch, slot limit 1`);
    const d = { ...row, alternatives: row.alternatives, support_rows: row.support_rows } as DraftRow;
    const other = ["A", "B", "C", "D"].find((l) => l !== d.correct_answer)!;
    let blindSawKey = false;
    const provider = new MockProvider((req: StructuredRequest) => {
      if (req.promptId === "solve") {
        blindSawKey = /gabarito_do_criador|explicacao/.test(req.input);
        return { answer: other, certainty: "high", rationale: "simulação", ambiguity: "" };
      }
      return { issues: [{ severity: "major", kind: "dose_or_unit", where: "alternativa A", detail: "Conferir a unidade.", basis: "model_knowledge" }] };
    });
    const out = await redteamCheck({ db }, provider, d, spend());
    expect(blindSawKey).toBe(false); // o revisor não vê o gabarito nem a explicação na resolução às cegas
    expect(out.verdict).toBe("fail");
    expect(out.findings.map((f) => f.code)).toEqual(expect.arrayContaining(["blind_answer_differs", "redteam_dose_or_unit"]));
    expect(out.findings.find((f) => f.code === "redteam_dose_or_unit")!.detail).toMatch(/conhecimento do modelo, sem fonte/);
  });

  it("revisão clínica: 'Nenhuma relevante' na ambiguidade não vira apontamento; ambiguidade descrita vira", async () => {
    const [row] = await sql<DraftRow>(`select * from public.draft_questions order by batch, slot limit 1`);
    const d = row as DraftRow;
    await sql(`delete from public.ch_ai_runs`); // respostas iguais ficam em cache: parte do zero
    const run = async (ambiguity: string) => {
      await sql(`delete from public.ch_ai_runs`);
      return redteamCheck({ db }, new MockProvider((req: StructuredRequest) => (req.promptId === "solve" ? { answer: d.correct_answer, certainty: "high", rationale: "simulação", ambiguity } : { issues: [] })), d, spend());
    };
    expect((await run("Nenhuma relevante.")).findings).toEqual([]);
    expect((await run("Nenhuma ambiguidade encontrada.")).findings).toEqual([]);
    const described = await run("A alternativa B também poderia ser aceita por quem segue outra diretriz.");
    expect(described.findings.map((f) => f.code)).toEqual(["blind_ambiguity"]);
  });

  it("revisão clínica com criador da mesma família: pendente, nada gravado", async () => {
    await sql(`update public.draft_questions set model = 'mock-dev (simulação, não é IA)'`);
    const r = await runDraftChecks({ db, mockRespond: () => ({}) }, { layers: ["redteam"], limit: 5 });
    expect(r[0].pending).toMatch(/Sem independência/);
    expect(r[0].saved).toBe(0);
    await sql(`update public.draft_questions set model = 'gpt-5.6-luna'`);
  });

  it("estimativa (dry-run) não grava nada nem chama IA", async () => {
    const before = (await sql(`select count(*)::int n from public.draft_checks`))[0].n;
    let called = 0;
    const r = await runDraftChecks({ db, mockRespond: () => (called++, {}) }, { layers: ["redteam"], limit: 20, dryRun: true });
    expect(r[0].estimate!.calls).toBe(r[0].considered * 2);
    expect(r[0].estimate!.inputTokens).toBeGreaterThan(1000);
    expect(called).toBe(0);
    expect((await sql(`select count(*)::int n from public.draft_checks`))[0].n).toBe(before);
  });
});
