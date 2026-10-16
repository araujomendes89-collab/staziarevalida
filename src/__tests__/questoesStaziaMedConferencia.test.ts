// @vitest-environment node
/**
 * Questões StaziaMed — conferências como tarefa (Tarefa 6): regras novas (citação oficial, semelhança 70/50, cópia dos trechos,
 * letra na explicação), a tarefa `question_check` (uma por rascunho e versão), a revisão pedagógica em ai_review, o texto editado
 * durante a conferência e "Conferir pendentes". A IA é sempre simulada (nunca um provedor real).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { copyRatio } from "../../server/contentHub/checks";
import { isStaziaCitation, softwareChecks, type DraftRow, type PassageInfo } from "../../server/contentHub/draftChecks";
import { runJob, type Job, type PipelineDeps } from "../../server/contentHub/pipeline";
import type { AiProvider, StructuredRequest, StructuredResult } from "../../server/contentHub/ai/provider";
import { addOfficialSource, insertDraft, openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 300_000 });

const PASSAGE_TEXT = "Em lactentes com otite média aguda, indica-se amoxicilina 90 mg/kg/dia por 10 dias como primeira escolha.";
const QUOTE = "indica-se amoxicilina 90 mg/kg/dia por 10 dias";
const LONG_TEXT = Array.from({ length: 40 }, (_, i) => `termo${i}`).join(" ");
const DECISION = "Tratar otite média aguda do lactente com amoxicilina 90 mg/kg/dia por 10 dias.";

let env: StaziaEnv;
let seq = 0;

/** Fonte oficial com o trecho e um rascunho do servidor que cita esse trecho (formato novo). */
async function officialDraft(over: Record<string, unknown> = {}, source: Parameters<typeof addOfficialSource>[1] = { text: PASSAGE_TEXT }) {
  seq += 1;
  const { passageId, sourceId } = await addOfficialSource(env, { title: `PCDT de Otite ${seq}`, ...source });
  const citation = { passage_id: passageId, source_id: sourceId, source: `PCDT de Otite ${seq}`, organ: "Ministério da Saúde (teste)", version: "2026", page: 7, quote: QUOTE, supports: DECISION };
  // enunciado único por rascunho: o mesmo texto repetido bateria na semelhança (100%) e nas respostas guardadas da IA
  const VOCAB = "febre tosse dispneia edema dor abdome náusea vômito diarreia cefaleia convulsão icterícia hematúria disúria prurido exantema artralgia mialgia astenia emagrecimento sudorese palpitação síncope tontura epistaxe melena dispepsia disfagia rouquidão otalgia lombalgia claudicação amenorreia sangramento corrimento nódulo massa linfonodo hepatomegalia esplenomegalia sopro taquicardia hipotensão hipertensão cianose palidez desnutrição obesidade anemia leucocitose plaquetopenia glicemia creatinina proteinúria hipocalemia acidose hipóxia derrame ascite".split(" ");
  let state = seq * 7919 + 13;
  const next = () => (state = (state * 1103515245 + 12345) % 2147483648);
  const stem = `Paciente ${seq} com ${Array.from({ length: 14 }, () => VOCAB[next() % VOCAB.length]).join(", ")}. Qual é a conduta?`;
  const id = await insertDraft(env, { stem, topic: "Otite média aguda", source_citations: [citation], clinical_decision: DECISION, ...over });
  return { id, passageId, sourceId, citation };
}
const hashOf = async (id: string) => (await env.sql(`select content_hash from public.draft_questions where id = $1`, [id]))[0].content_hash as string;

/** IA simulada que registra cada chamada; `onCall` roda antes de responder (pode editar o rascunho). */
class TestProvider implements AiProvider {
  readonly name = "mock";
  readonly model = "mock-dev (simulação, não é IA)";
  readonly isMock = true;
  calls: string[] = [];
  constructor(private draftId: string, private onCall?: (promptId: string) => Promise<void>) {}
  async generate<T>(req: StructuredRequest): Promise<StructuredResult<T>> {
    this.calls.push(req.promptId);
    await this.onCall?.(req.promptId);
    const payload = JSON.parse(req.input.match(/<documento>\n([\s\S]*)\n<\/documento>/)![1]);
    let output: unknown;
    if (req.promptId === "solve") output = { answer: "A", certainty: "high", rationale: "simulação", ambiguity: "" };
    else if (req.promptId === "redteam") output = { issues: [] };
    else if (req.promptId === "staziamed_pedagogia")
      output = { verdict: "sem_problemas", single_best_answer: true, stem_clear_and_sufficient: true, distractors_plausible: true, no_unintended_clues: true, competency_aligned: true, issues: [] };
    else output = { verdict: req.promptId === "currency" ? "current" : "compatible", passage_id: payload.trechos[0].passage_id, quote: PASSAGE_TEXT, rationale: "simulação" };
    return { output: output as T, provider: this.name, model: this.model, inputTokens: 10, outputTokens: 20, latencyMs: 1, costUsd: null };
  }
}
const depsWith = (provider: AiProvider | null): PipelineDeps =>
  ({ db: env.db, storage: {} as any, ai: provider ? { provider, status: { ready: true, provider: provider.name, model: provider.model, isMock: true, pending: null } } : { provider: null, status: { ready: false } } }) as any;
const claimCheck = async (draftId: string) => {
  const job = await env.db.service<Job | null>("ch_worker_claim", { p_stale_seconds: 900 });
  expect(job?.step).toBe("question_check");
  expect(job!.scope_key.startsWith(`qcheck:${draftId}:`)).toBe(true);
  return job!;
};

beforeAll(async () => {
  env = await openStaziaEnv();
}, 600_000);
afterAll(async () => {
  await env?.close();
}, 60_000);

describe("Regras novas da camada de regras", () => {
  const base = (): DraftRow => ({
    id: "d1", batch: "b", source_id: "q1", slot: 1, area: "PEDIATRIA",
    stem: "Lactente de 8 meses, 8 kg, com febre há 3 dias e diagnóstico de otite média aguda, sem alergia a antibióticos. Qual a conduta?",
    alternatives: { A: "Amoxicilina 90 mg/kg/dia por 10 dias.", B: "Observar por 48 horas sem antibiótico.", C: "Azitromicina dose única.", D: "Ceftriaxona intramuscular por 1 dia." },
    correct_answer: "A",
    explanation: "Em lactente com otite média aguda, indica-se amoxicilina 90 mg/kg/dia por 10 dias.",
    alternative_explanations: { A: "Correta. Amoxicilina é a conduta inicial.", B: "Incorreta. A observação isolada não é a conduta.", C: "Incorreta. Não é a primeira escolha.", D: "Incorreta. Reservada para falha." },
    source_citations: [{ passage_id: "p1", source_id: "s1", source: "PCDT", organ: "MS", version: "2026", page: 7, quote: QUOTE, supports: DECISION }],
    update_application: null, similarity_to_official: null, support_type: "NONE", support_title: null, support_rows: [],
    clinical_decision: DECISION, model: "gpt-5.6-luna", content_hash: "h",
  });
  const passage = (over: Partial<PassageInfo> = {}): Map<string, PassageInfo> =>
    new Map([["p1", { passage_id: "p1", source_id: "s1", source: "PCDT", organ: "MS", version: "2026", authority_level: "A", published_on: null, valid_until: null, section: null, page: 7, text: PASSAGE_TEXT, official: true, ...over }]]);
  const zero = { official: { score: 0, id: null }, staziamed: { score: 0, id: null } };

  it("citação oficial vigente e literal no formato novo: nenhum apontamento de fonte", () => {
    const f = softwareChecks(base(), { passages: passage(), similarity: zero });
    expect(f).toEqual([]);
  });

  const NOVAS_REGRAS: [string, (d: DraftRow) => void, Parameters<typeof softwareChecks>[1], string, string][] = [
    ["citation_not_official (trecho de fonte que não é oficial)", () => {}, { passages: passage({ official: false }), similarity: zero }, "citation_not_official", "critical"],
    ["citation_not_official (trecho que não existe mais)", () => {}, { passages: new Map(), similarity: zero }, "citation_not_official", "critical"],
    ["quote_not_verbatim", (d) => { (d.source_citations[0] as any).quote = "indica-se azitromicina por 5 dias"; }, { passages: passage(), similarity: zero }, "quote_not_verbatim", "critical"],
    ["third_party_source_only (citação antiga) é crítico", (d) => { d.source_citations = [{ source_file: "Apostila.pdf", supported_claim: "x" }]; }, { similarity: zero }, "third_party_source_only", "critical"],
    ["explanation_cites_letter é importante", (d) => { d.alternative_explanations.B = "Incorreta. A alternativa A é melhor."; }, { passages: passage(), similarity: zero }, "explanation_cites_letter", "major"],
    ["too_similar_official (70% ou mais)", () => {}, { passages: passage(), similarity: { official: { score: 70, id: "q1" }, staziamed: { score: 0, id: null } } }, "too_similar_official", "critical"],
    ["similar_official (50 a 69%)", () => {}, { passages: passage(), similarity: { official: { score: 55.5, id: "q1" }, staziamed: { score: 0, id: null } } }, "similar_official", "major"],
    ["too_similar_staziamed", () => {}, { passages: passage(), similarity: { official: { score: 0, id: null }, staziamed: { score: 81, id: "d9" } } }, "too_similar_staziamed", "critical"],
    ["similar_staziamed", () => {}, { passages: passage(), similarity: { official: { score: 0, id: null }, staziamed: { score: 52, id: "d9" } } }, "similar_staziamed", "major"],
    ["copied_from_source (mais de 50% dos trechos citados)", (d) => { d.stem = LONG_TEXT; }, { passages: passage({ text: LONG_TEXT }), similarity: zero }, "copied_from_source", "critical"],
    ["numbers_unsupported é crítico com citação oficial", (d) => { d.explanation += " A dose máxima é 4 g/dia."; }, { passages: passage(), similarity: zero }, "numbers_unsupported", "critical"],
  ];
  it.each(NOVAS_REGRAS)("regra nova: %s", (_name, mutate, opts, code, severity) => {
    const d = base();
    mutate(d);
    const f = softwareChecks(d, opts);
    const hit = f.find((x) => x.code === code);
    expect(hit, `esperava ${code}; veio ${f.map((x) => x.code).join(", ") || "nada"}`).toBeDefined();
    expect(hit!.severity).toBe(severity);
  });

  it("close_to_source: de 25% a 50% das sequências de 6 palavras dos trechos citados é importante", () => {
    const d = base();
    const own = (n: number) => `${PASSAGE_TEXT} ${Array.from({ length: n }, (_, i) => `palavra${i}`).join(" ")}`;
    const ratioFor = (n: number) => copyRatio(`${own(n)} ${Object.values(d.alternatives).join(" ")}`, PASSAGE_TEXT);
    let n = 0;
    while (ratioFor(n) > 0.45) n += 1;
    expect(ratioFor(n)).toBeGreaterThan(0.25);
    d.stem = own(n);
    const f = softwareChecks(d, { passages: passage(), similarity: zero });
    expect(f.find((x) => x.code === "close_to_source")?.severity).toBe("major");
    expect(f.find((x) => x.code === "copied_from_source")).toBeUndefined();
    expect(isStaziaCitation(d.source_citations[0])).toBe(true);
  });
});

describe("Regra de fonte oficial no banco", () => {
  it("draft_has_official_sources: citação oficial vigente e literal sim; apostila, trecho alterado e fonte vencida não", async () => {
    const has = async (id: string) => (await env.sql(`select public.draft_has_official_sources(d) as v from public.draft_questions d where d.id = $1`, [id]))[0].v as boolean;
    const ok = await officialDraft();
    expect(await has(ok.id)).toBe(true);
    const legacy = await insertDraft(env); // citação antiga (apostila)
    expect(await has(legacy)).toBe(false);
    const empty = await insertDraft(env, { source_citations: [] });
    expect(await has(empty)).toBe(false);
    const altered = await officialDraft({}, { text: "Outro trecho oficial sobre a mesma doença, sem a frase citada." });
    expect(await has(altered.id)).toBe(false);
    const expired = await officialDraft({}, { text: PASSAGE_TEXT, validUntil: "2020-01-01" });
    expect(await has(expired.id)).toBe(false);
    const apostila = await officialDraft({}, { text: PASSAGE_TEXT, level: "E" });
    expect(await has(apostila.id)).toBe(false);
    // uma citação boa e uma ruim: falta fonte oficial
    const mixed = await officialDraft();
    await env.sql(`update public.draft_questions set source_citations = source_citations || '[{"source_file": "Apostila.pdf", "supported_claim": "x"}]'::jsonb where id = $1`, [mixed.id]);
    expect(await has(mixed.id)).toBe(false);
  });
});

describe("Conferir como tarefa", () => {
  it("Conferir: uma tarefa por rascunho e versão; pedir de novo não duplica; só a equipe pede", async () => {
    const { id } = await officialDraft();
    const enqueue = (uid: string) => env.rpc<{ na_fila: number; ja_na_fila: number }>(uid, "app_staziamed_check_enqueue", { p_draft_ids: [id], p_estimate: { chamadas: 5 } });
    expect(await enqueue(USERS.EDITOR)).toEqual({ na_fila: 1, ja_na_fila: 0 });
    expect(await enqueue(USERS.ADMIN)).toEqual({ na_fila: 0, ja_na_fila: 1 });
    const key = `qcheck:${id}:${await hashOf(id)}`;
    const jobs = await env.sql(`select step, document_id, scope_key, idempotency_key, status from public.ch_jobs where scope_key like $1`, [`qcheck:${id}:%`]);
    expect(jobs).toEqual([{ step: "question_check", document_id: null, scope_key: key, idempotency_key: key, status: "queued" }]);
    // editado: outra versão, outra tarefa
    await env.sql(`update public.draft_questions set stem = stem || ' Peso estável.' where id = $1`, [id]);
    expect(await enqueue(USERS.EDITOR)).toEqual({ na_fila: 1, ja_na_fila: 0 });
    for (const uid of [USERS.REVISOR_PED, USERS.PRO, USERS.TESTE]) await expect(enqueue(uid), uid).rejects.toThrow("Conferir é da equipe (administrador ou editor).");
    await env.sql(`delete from public.ch_jobs where scope_key like $1`, [`qcheck:${id}:%`]);
  });

  it("a tarefa grava as 4 camadas no hash atual, a semelhança, a pedagogia em ai_review e a trilha 'conferida'", async () => {
    const { id } = await officialDraft();
    await env.rpc(USERS.EDITOR, "app_staziamed_check_enqueue", { p_draft_ids: [id] });
    const hash = await hashOf(id);
    const provider = new TestProvider(id);
    const job = await claimCheck(id);
    const out = await runJob(depsWith(provider), job);
    expect(out.status).toBe("succeeded");
    expect(provider.calls).toEqual(["evidence", "currency", "solve", "redteam", "staziamed_pedagogia"]);
    const layers = await env.sql(`select layer, verdict, content_hash, model from public.draft_checks where draft_id = $1 order by layer`, [id]);
    expect(layers.map((l) => l.layer).sort()).toEqual(["currency", "redteam", "software", "sources"]);
    expect(layers.every((l) => l.content_hash === hash)).toBe(true);
    // fontes e números em ordem (a semelhança de enunciados de teste, todos curtos e parecidos, pode acusar; não é o que se testa aqui)
    const found = ((await env.sql(`select findings from public.draft_checks where draft_id = $1 and layer = 'software'`, [id]))[0].findings as { code: string }[]).map((f) => f.code);
    expect(found.filter((c) => !c.startsWith("similar_") && !c.startsWith("too_similar_"))).toEqual([]);
    expect(layers.find((l) => l.layer === "sources")!.verdict).toBe("pass");
    const [row] = await env.sql(`select ai_review, similarity_to_official from public.draft_questions where id = $1`, [id]);
    expect(row.ai_review.pedagogia).toMatchObject({ verdict: "sem_problemas", single_best_answer: true });
    expect(Number(row.similarity_to_official)).toBeGreaterThanOrEqual(0);
    const events = await env.sql(`select kind, content_hash, details from public.draft_question_events where draft_id = $1`, [id]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "conferida", content_hash: hash });
    expect(events[0].details.verdicts).toMatchObject({ sources: "pass", currency: "pass", redteam: "pass" });
    // o custo e as chamadas ficam nas métricas da tarefa
    const [j] = await env.sql(`select status, metrics from public.ch_jobs where id = $1`, [job.id]);
    expect(j.status).toBe("succeeded");
    expect(j.metrics.ai_calls).toBe(5);
  });

  it("texto editado durante a conferência: o resultado é descartado e as chamadas seguintes não acontecem", async () => {
    const { id } = await officialDraft();
    await env.rpc(USERS.EDITOR, "app_staziamed_check_enqueue", { p_draft_ids: [id] });
    const old = await hashOf(id);
    const provider = new TestProvider(id, async (promptId) => {
      if (promptId === "solve") await env.sql(`update public.draft_questions set stem = stem || ' Editado durante a conferência.' where id = $1`, [id]);
    });
    const job = await claimCheck(id);
    const out = await runJob(depsWith(provider), job);
    expect(out, JSON.stringify([provider.calls, out])).toMatchObject({ status: "succeeded" });
    const now = await hashOf(id);
    expect(now).not.toBe(old);
    expect(provider.calls).toEqual(["evidence", "currency", "solve"]); // nenhuma chamada 'redteam' nem pedagógica depois da edição
    expect(await env.sql(`select layer from public.draft_checks where draft_id = $1 and content_hash = $2`, [id, now])).toEqual([]);
    expect((await env.sql(`select ai_review from public.draft_questions where id = $1`, [id]))[0].ai_review?.pedagogia).toBeUndefined();
    expect(await env.sql(`select kind from public.draft_question_events where draft_id = $1 and kind = 'conferida'`, [id])).toEqual([]);
    const [j] = await env.sql(`select metrics from public.ch_jobs where id = $1`, [job.id]);
    expect(j.metrics.descartada).toBe("texto mudou");
  });

  it("tarefa de versão antiga: termina sem chamar IA", async () => {
    const { id } = await officialDraft();
    await env.rpc(USERS.EDITOR, "app_staziamed_check_enqueue", { p_draft_ids: [id] });
    await env.sql(`update public.draft_questions set stem = stem || ' Mudou antes de rodar.' where id = $1`, [id]);
    const provider = new TestProvider(id);
    const out = await runJob(depsWith(provider), await claimCheck(id));
    expect(out.status).toBe("succeeded");
    expect(provider.calls).toEqual([]);
  });

  it("sem conferente configurado: a tarefa fica bloqueada, sem gastar tentativa nem chamar IA", async () => {
    const { id } = await officialDraft();
    await env.rpc(USERS.EDITOR, "app_staziamed_check_enqueue", { p_draft_ids: [id] });
    const job = await claimCheck(id);
    const out = await runJob(depsWith(null), job);
    expect(out.status).toBe("blocked");
    const [j] = await env.sql(`select status, attempts, max_attempts from public.ch_jobs where id = $1`, [job.id]);
    expect(j.status).toBe("blocked");
    expect(j.attempts).toBeLessThan(j.max_attempts);
    expect(await env.sql(`select layer from public.draft_checks where draft_id = $1`, [id])).toEqual([]);
    await env.sql(`delete from public.ch_jobs where id = $1`, [job.id]);
  });
});

describe("Conferir pendentes", () => {
  it("só os rascunhos do filtro sem as 4 camadas em dia", async () => {
    const full = await officialDraft({ batch: "lote-pendentes" });
    const half = await officialDraft({ batch: "lote-pendentes" });
    const none = await officialDraft({ batch: "lote-pendentes" });
    const other = await officialDraft({ batch: "outro-lote" });
    const hash = await hashOf(full.id);
    for (const layer of ["software", "sources", "currency", "redteam"]) {
      await env.sql(`insert into public.draft_checks (draft_id, layer, verdict, content_hash) values ($1, $2, 'pass', $3)`, [full.id, layer, hash]);
    }
    await env.sql(`insert into public.draft_checks (draft_id, layer, verdict, content_hash) values ($1, 'software', 'pass', $2)`, [half.id, await hashOf(half.id)]);
    const pending = (filters: object, uid: string = USERS.EDITOR) => env.rpc<string[]>(uid, "app_staziamed_pending_checks", { p_filters: filters });
    expect(new Set(await pending({ batch: "lote-pendentes" }))).toEqual(new Set([half.id, none.id]));
    expect(await pending({ batch: "outro-lote" })).toEqual([other.id]);
    // camadas de um texto antigo não contam
    await env.sql(`update public.draft_questions set stem = stem || ' Nova versão.' where id = $1`, [full.id]);
    expect(new Set(await pending({ batch: "lote-pendentes" }))).toEqual(new Set([full.id, half.id, none.id]));
    // filtros da lista
    expect(await pending({ batch: "lote-pendentes", blocked: true })).toEqual([]);
    const legacy = await insertDraft(env, { batch: "lote-pendentes" });
    expect(await pending({ batch: "lote-pendentes", blocked: true })).toEqual([legacy]);
    expect((await pending({ batch: "lote-pendentes", topic: "" })).length).toBe(1);
    await expect(pending({}, USERS.REVISOR_PED)).rejects.toThrow("Conferir é da equipe (administrador ou editor).");
  });
});
