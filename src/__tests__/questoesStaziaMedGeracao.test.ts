// @vitest-environment node
/**
 * Questões StaziaMed — geração por vaga (Tarefa 7): só trechos oficiais, "sem fonte oficial" sem gastar IA, "evidência
 * insuficiente", embaralhamento para a letra-alvo, conferências, UMA reescrita, descarte com motivo, falha da IA sem vaga presa e
 * a simulação que nunca escreve questão. A IA é sempre simulada (nunca um provedor real).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runJob, type Job, type PipelineDeps } from "../../server/contentHub/pipeline";
import { MockProvider, type AiProvider, type StructuredRequest, type StructuredResult } from "../../server/contentHub/ai/provider";
import { mockRespond } from "../../server/contentHub/ai/mock";
import type { GeneratedQuestion } from "../../server/contentHub/questoes/types";
import { addOfficialSource, openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 300_000 });

const SENTENCE = "Em lactentes com otite média aguda, indica-se amoxicilina 90 mg/kg/dia por 10 dias como primeira escolha no tratamento.";
let env: StaziaEnv;
let TOPIC: { area: string; topic: string };
let counter = 0;

const payloadOf = (req: StructuredRequest) => JSON.parse(req.input.match(/<documento>\n([\s\S]*)\n<\/documento>/)![1]);
/** Enunciado sem relação com as provas (para a semelhança não acusar): cada chamada tem o seu. */
const PALAVRAS = "gato azul chuva telhado antigo casa vazia vizinho caminho rio montanha barco vento areia pedra sino ponte jardim lanterna cavalo estrada mercado padeiro relógio janela cortina tapete biblioteca violino trem estação bicicleta nuvem tempestade fazenda celeiro colheita moinho cozinha farinha manteiga queijo horta ervilha cenoura laranja pomar abelha colmeia mel flauta tambor praça fonte escada corredor lareira lenha inverno verão outono primavera semente ferreiro martelo bigorna carroça viajante mapa bússola farol navio porto âncora corda vela remo cais pescador rede peixe maré concha coral ilha tesouro baú chave segredo carta selo envelope cartório notário balcão guichê passaporte fronteira aduana mala".split(" ");
const uniqueStem = () => {
  counter += 1;
  let state = counter * 7919 + 101;
  const next = () => Math.floor((state = (state * 1103515245 + 12345) % 2147483648) / 65536);
  return `${Array.from({ length: 22 }, () => PALAVRAS[next() % PALAVRAS.length]).join(" ")} (número ${counter}). Qual escolha foi feita?`;
};
const goodQuestion = (over: Partial<GeneratedQuestion> = {}): GeneratedQuestion => ({
  title: "Otite no lactente",
  stem: uniqueStem(),
  support_type: "NONE", support_title: null, support_rows: [],
  alternatives: { A: "Amoxicilina 90 mg/kg/dia por 10 dias.", B: "Apenas observação sem antibiótico.", C: "Azitromicina em dose única.", D: "Ceftriaxona intramuscular." },
  correct_answer: "A",
  explanation: "Em lactentes com otite média aguda indica-se amoxicilina 90 mg/kg/dia por 10 dias.",
  alternative_explanations: {
    A: "Correta: é a primeira escolha segundo a fonte oficial.",
    B: "Incorreta: em lactentes a observação isolada não é a conduta inicial.",
    C: "Incorreta: não é a primeira escolha.",
    D: "Incorreta: fica para falha do tratamento.",
  },
  clinical_decision: SENTENCE,
  key_concepts: ["otite média aguda"],
  citations: [], // preenchido com o trecho oferecido
  ...over,
});

/** IA simulada: responde a criação/reescrita pelo roteiro e as conferências do jeito feliz; registra cada chamada. */
class Script implements AiProvider {
  readonly name = "mock";
  readonly model = "mock-dev (simulação, não é IA)";
  readonly isMock = true;
  calls: { promptId: string; payload: any }[] = [];
  questoes: (() => unknown)[] = [];
  pedagogy: () => unknown = () => ({ verdict: "sem_problemas", single_best_answer: true, stem_clear_and_sufficient: true, distractors_plausible: true, no_unintended_clues: true, competency_aligned: true, issues: [] });
  failWith: Error | null = null;
  async generate<T>(req: StructuredRequest): Promise<StructuredResult<T>> {
    const payload = payloadOf(req);
    this.calls.push({ promptId: req.promptId, payload });
    if (this.failWith && (req.promptId === "staziamed_questao" || req.promptId === "staziamed_reescrita")) throw this.failWith;
    let output: unknown;
    if (req.promptId === "staziamed_questao" || req.promptId === "staziamed_reescrita") {
      const next = this.questoes.shift();
      if (!next) throw new Error("roteiro acabou");
      output = next();
    } else if (req.promptId === "solve") output = { answer: payload.alternativas ? this.lastAnswer(payload) : "A", certainty: "high", rationale: "simulação", ambiguity: "" };
    else if (req.promptId === "redteam") output = { issues: [] };
    else if (req.promptId === "staziamed_pedagogia") output = this.pedagogy();
    else output = { verdict: req.promptId === "currency" ? "current" : "compatible", passage_id: payload.trechos[0].passage_id, quote: payload.trechos[0].text, rationale: "simulação" };
    return { output: output as T, provider: this.name, model: this.model, inputTokens: 10, outputTokens: 20, latencyMs: 1, costUsd: null };
  }
  /** A resolução às cegas acerta a que o criador marcou (a questão embaralhada tem a correta na letra-alvo). */
  private lastAnswer(payload: any) {
    return Object.entries(payload.alternativas as Record<string, string>).find(([, v]) => v.startsWith("Amoxicilina"))?.[0] ?? "A";
  }
  count(id: string) { return this.calls.filter((c) => c.promptId === id).length; }
}
/** O roteiro responde com a questão citando o PRIMEIRO trecho oferecido (a IA vê a lista de trechos no payload). */
const withCitation = (script: Script, build: (q: GeneratedQuestion) => GeneratedQuestion = (q) => q) => () => {
  const trechos = script.calls[script.calls.length - 1].payload.trechos;
  const t = trechos.find((x: any) => x.texto.includes(SENTENCE)) ?? trechos[0];
  const q = build(goodQuestion({ citations: [{ passage_id: t.passage_id, quote: SENTENCE, supports: SENTENCE }] }));
  return { status: "ok", reason: null, question: q };
};

const depsWith = (provider: AiProvider): PipelineDeps =>
  ({ db: env.db, storage: {} as any, ai: { provider, status: { ready: true, provider: provider.name, model: provider.model, isMock: true, pending: null } } }) as any;

/** Cria um pedido de 1 vaga no tema e devolve o pedido e o escopo da tarefa. */
async function newRequest(count = 1) {
  const r = await env.rpc<{ id: string; slots: any[] }>(USERS.EDITOR, "app_staziamed_request_create", { p_mode: "tema", p_area: TOPIC.area, p_topic: TOPIC.topic, p_count: count, p_estimate: {} });
  // o mesmo pedido em seguida é recusado ("já está na fila"): os testes repetem o pedido, então ele "envelhece" aqui
  await env.sql(`update public.staziamed_requests set created_at = created_at - interval '1 hour' where id = $1`, [r.id]);
  return r;
}
/** Pega e roda a tarefa daquela vaga (as outras da fila ficam paradas para não serem pegas por engano). */
async function runSlot(provider: AiProvider, requestId: string, slot = 1) {
  const key = `qgen:${requestId}:${slot}`;
  await env.sql(`update public.ch_jobs set status = 'blocked' where status = 'queued' and idempotency_key <> $1`, [key]);
  const job = await env.db.service<Job | null>("ch_worker_claim", { p_stale_seconds: 900 });
  expect(job?.idempotency_key ?? (job as any)?.scope_key).toBeTruthy();
  expect(job!.scope_key).toBe(`staziamed:${requestId}:${slot}`);
  return { job: job!, out: await runJob(depsWith(provider), job!) };
}
const slotOf = async (requestId: string, slot = 1) => (await env.sql(`select slots -> ($2 - 1) as s, state, cost_usd from public.staziamed_requests where id = $1`, [requestId, slot]))[0];

beforeAll(async () => {
  env = await openStaziaEnv();
  TOPIC = (await env.sql<{ area: string; topic: string }>(`select area, topic from public.staziamed_topic_weights('PEDIATRIA') limit 1`))[0];
  // uma fonte oficial qualquer para o acervo não ficar vazio (os trechos do tema entram por teste)
  await addOfficialSource(env, { title: "PCDT de Gastroenterite", text: "Diarreia aguda em crianças: hidratação oral com solução de reidratação é a base do tratamento." });
}, 600_000);
// cada teste parte sem rascunhos do servidor: a semelhança entre enunciados curtos de teste acusaria os dos testes anteriores
beforeEach(async () => {
  await env.sql(`delete from public.draft_questions where generated_by = 'servidor'`);
});
afterAll(async () => {
  await env?.close();
}, 60_000);

describe("Vagas sem trecho ou sem evidência", () => {
  it("sem trecho oficial do tema: vaga 'pulada' com 'sem fonte oficial', nenhuma chamada de IA", async () => {
    const script = new Script();
    const r = await newRequest(1);
    const { out } = await runSlot(script, r.id);
    expect(out.status).toBe("succeeded");
    expect(script.calls).toEqual([]);
    expect((await slotOf(r.id)).s).toMatchObject({ state: "pulada", reason: "sem fonte oficial", draft_id: null });
    expect((await slotOf(r.id)).state).toBe("concluido");
  });

  it("'evidência insuficiente' da IA: vaga pulada com o motivo dela, sem rascunho", async () => {
    await addOfficialSource(env, { title: "PCDT do tema", text: `${TOPIC.topic}. ${SENTENCE}` });
    const script = new Script();
    script.questoes = [() => ({ status: "evidencia_insuficiente", reason: "Os trechos não trazem a dose.", question: null })];
    const r = await newRequest(1);
    const { out } = await runSlot(script, r.id);
    expect(out.status).toBe("succeeded");
    expect((await slotOf(r.id)).s).toMatchObject({ state: "pulada", reason: "evidência insuficiente: Os trechos não trazem a dose." });
    expect(script.count("staziamed_questao")).toBe(1);
    expect((await env.sql(`select count(*)::int as n from public.draft_questions where request_id = $1`, [r.id]))[0].n).toBe(0);
  });
});

describe("Questão válida", () => {
  it("embaralhada para a letra-alvo, conferida e gravada aguardando revisão médica com citações oficiais, semelhança e trilha", async () => {
    const script = new Script();
    script.questoes = [withCitation(script)];
    const r = await newRequest(1);
    const target = r.slots[0].target;
    const { out } = await runSlot(script, r.id);
    expect(out.status).toBe("succeeded");
    const slot = (await slotOf(r.id)).s;
    expect(slot).toMatchObject({ state: "gerada", reason: null });
    const [d] = await env.sql(`select * from public.draft_questions where id = $1`, [slot.draft_id]);
    expect(d).toMatchObject({ generated_by: "servidor", status: "awaiting_medical_review", correct_answer: target, area: TOPIC.area, topic: TOPIC.topic, request_id: r.id, source_id: "vaga_01" });
    expect(d.batch).toMatch(/^pedido_\d{8}_[0-9a-f]{8}$/);
    // a correta ficou na letra-alvo, com a explicação "Correta" junto
    expect(d.alternatives[target]).toMatch(/^Amoxicilina/);
    expect(d.alternative_explanations[target]).toMatch(/^Correta/);
    expect(d.source_citations).toHaveLength(1);
    expect(d.source_citations[0]).toMatchObject({ source: "PCDT do tema", organ: "Ministério da Saúde (teste)", version: "2026", page: 7, quote: SENTENCE, supports: SENTENCE });
    expect(d.generation.prompts.staziamed_questao).toBe("1.0.0");
    expect(d.generation.letra_alvo).toBe(target);
    expect(d.generation.reescrita.feita).toBe(false);
    expect(d.generation.trechos_oferecidos.length).toBeGreaterThan(0);
    // as 4 camadas no hash atual, a pedagogia em ai_review e a trilha 'gerada'
    const layers = await env.sql(`select layer, content_hash from public.draft_checks where draft_id = $1 order by layer`, [d.id]);
    expect(layers.map((l) => l.layer)).toEqual(["currency", "redteam", "software", "sources"]);
    expect(layers.every((l) => l.content_hash === d.content_hash)).toBe(true);
    expect(d.ai_review.pedagogia.verdict).toBe("sem_problemas");
    expect((await env.sql(`select kind from public.draft_question_events where draft_id = $1`, [d.id])).map((e) => e.kind)).toEqual(["gerada"]);
    expect(await env.sql(`select 1 from public.draft_questions where id = $1 and similarity_to_official is not null`, [d.id])).toHaveLength(1);
    // nunca passa de "aguardando revisão médica"
    expect((await env.sql(`select count(*)::int as n from public.questions where origin = 'staziamed'`))[0].n).toBe(0);
    // o pedido fechou
    expect((await slotOf(r.id)).state).toBe("concluido");
  });

  it("tarefa repetida de vaga concluída não gera de novo", async () => {
    const script = new Script();
    script.questoes = [withCitation(script)];
    const r = await newRequest(1);
    const first = await runSlot(script, r.id);
    expect(first.out, first.out.error).toMatchObject({ status: "succeeded" });
    const before = script.calls.length;
    // outra tarefa para a mesma vaga (nova chave, mesmo escopo)
    await env.sql(`insert into public.ch_jobs (document_id, step, scope_key, idempotency_key) values (null, 'question_generate', $1, $2)`, [`staziamed:${r.id}:1`, `qgen:${r.id}:1:repetida`]);
    await env.sql(`update public.ch_jobs set status = 'blocked' where status = 'queued' and idempotency_key <> $1`, [`qgen:${r.id}:1:repetida`]);
    const job = (await env.db.service<Job | null>("ch_worker_claim", { p_stale_seconds: 900 }))!;
    expect(job.scope_key).toBe(`staziamed:${r.id}:1`);
    expect((await slotOf(r.id)).s.state).toBe("gerada");
    const again = await runJob(depsWith(script), job);
    expect(again, again.error).toMatchObject({ status: "succeeded" });
    expect(script.calls.length).toBe(before);
    expect((await env.sql(`select count(*)::int as n from public.draft_questions where request_id = $1`, [r.id]))[0].n).toBe(1);
  });
});

describe("Reescrita (uma só)", () => {
  it("validação falha: uma reescrita só; se ainda falha, vaga descartada com o motivo", async () => {
    const script = new Script();
    const bad = withCitation(script, (q) => ({ ...q, citations: [{ ...q.citations[0], quote: "Frase que não está em nenhum trecho oficial." }] }));
    script.questoes = [bad, bad, bad]; // o terceiro nunca deve ser usado
    const r = await newRequest(1);
    const { out } = await runSlot(script, r.id);
    expect(out.status).toBe("succeeded");
    expect(script.count("staziamed_questao")).toBe(1);
    expect(script.count("staziamed_reescrita")).toBe(1);
    expect(script.questoes).toHaveLength(1);
    expect((await slotOf(r.id)).s).toMatchObject({ state: "descartada" });
    expect((await slotOf(r.id)).s.reason).toMatch(/^Validação: O trecho citado não aparece literalmente/);
    expect((await env.sql(`select count(*)::int as n from public.draft_questions where request_id = $1`, [r.id]))[0].n).toBe(0);
    // a reescrita recebeu os achados
    const rewrite = script.calls.find((c) => c.promptId === "staziamed_reescrita")!;
    expect(rewrite.payload.achados.map((a: any) => a.code)).toContain("quote_not_verbatim");
  });

  it("a reescrita conserta: vaga gerada e a trilha da geração registra os achados", async () => {
    const script = new Script();
    const bad = withCitation(script, (q) => ({ ...q, citations: [{ ...q.citations[0], quote: "Frase que não está em nenhum trecho oficial." }] }));
    script.questoes = [bad, withCitation(script)];
    const r = await newRequest(1);
    await runSlot(script, r.id);
    const slot = (await slotOf(r.id)).s;
    expect(slot.state, slot.reason).toBe("gerada");
    const [d] = await env.sql(`select generation from public.draft_questions where id = $1`, [slot.draft_id]);
    expect(d.generation.reescrita.feita).toBe(true);
    expect(d.generation.reescrita.achados.map((a: any) => a.code)).toContain("quote_not_verbatim");
    expect(d.generation.prompts.staziamed_reescrita).toBe("1.0.0");
  });

  it("70% de semelhança com questão oficial: reescreve uma vez; persiste → descartada", async () => {
    const [{ statement }] = await env.sql<{ statement: string }>(`select statement from public.questions where origin = 'official' limit 1`);
    const script = new Script();
    const copy = withCitation(script, (q) => ({ ...q, stem: statement }));
    script.questoes = [copy, copy];
    const r = await newRequest(1);
    await runSlot(script, r.id);
    expect(script.count("staziamed_reescrita")).toBe(1);
    expect((await slotOf(r.id)).s).toMatchObject({ state: "descartada" });
    expect((await slotOf(r.id)).s.reason).toMatch(/^Validação: Semelhança de \d+(\.\d)?% com questão oficial/);
  });

  it("achado importante da conferência: uma reescrita; o que sobra fica para o revisor", async () => {
    const script = new Script();
    script.pedagogy = () => ({ verdict: "revisar", single_best_answer: true, stem_clear_and_sufficient: true, distractors_plausible: false, no_unintended_clues: true, competency_aligned: true,
      issues: [{ severity: "major", where: "alternativa C", detail: "Distrator pouco plausível." }] });
    script.questoes = [withCitation(script), withCitation(script)];
    const r = await newRequest(1);
    await runSlot(script, r.id);
    expect(script.count("staziamed_reescrita")).toBe(1);
    const slot = (await slotOf(r.id)).s;
    expect(slot.state, slot.reason).toBe("gerada");
    const [d] = await env.sql(`select ai_review, generation from public.draft_questions where id = $1`, [slot.draft_id]);
    expect(d.ai_review.pedagogia.findings.some((f: any) => f.code === "pedagogy_distractors")).toBe(true); // sobrou para o revisor
    expect(d.generation.reescrita.achados.length).toBeGreaterThan(0);
    // 2 criações e 2 rodadas de conferência (fontes e atualidade podem vir das respostas guardadas: a decisão e os trechos são os mesmos)
    expect(script.count("staziamed_questao") + script.count("staziamed_reescrita")).toBe(2);
    expect(script.count("solve")).toBe(2);
    expect(script.count("redteam")).toBe(2);
    expect(script.count("staziamed_pedagogia")).toBe(2);
  });
});

describe("Só trechos oficiais vão para a IA", () => {
  it("nível E e fonte vencida ficam de fora, e o trecho vai dentro de <documento>", async () => {
    const official = await addOfficialSource(env, { title: "PCDT oficial do tema", text: `${TOPIC.topic}. ${SENTENCE}` });
    const apostila = await addOfficialSource(env, { title: "Apostila do curso", text: `${TOPIC.topic}. Texto de apostila sobre o tema.`, level: "E" });
    const vencida = await addOfficialSource(env, { title: "PCDT vencido", text: `${TOPIC.topic}. Texto vencido sobre o tema.`, validUntil: "2020-01-01" });
    const script = new Script();
    script.questoes = [() => ({ status: "evidencia_insuficiente", reason: "teste", question: null })];
    const r = await newRequest(1);
    await runSlot(script, r.id);
    const call = script.calls[0];
    const ids = call.payload.trechos.map((t: any) => t.passage_id);
    expect(ids).toContain(official.passageId);
    expect(ids).not.toContain(apostila.passageId);
    expect(ids).not.toContain(vencida.passageId);
    expect(call.payload.vaga).toMatchObject({ area: TOPIC.area, tema: TOPIC.topic });
  });
});

describe("Falha da IA", () => {
  it("IA falha nas 3 tentativas: vaga 'descartada' com 'Falha da IA' e pedido concluído (nunca presa em 'gerando')", async () => {
    const script = new Script();
    script.failWith = new Error("provedor fora do ar");
    const r = await newRequest(1);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await env.sql(`update public.ch_jobs set run_after = now() where idempotency_key = $1`, [`qgen:${r.id}:1`]);
      const { out } = await runSlot(script, r.id);
      expect(out.status, `tentativa ${attempt}`).not.toBe("blocked");
      if (attempt < 3) expect((await slotOf(r.id)).s.state).toBe("gerando");
    }
    const slot = (await slotOf(r.id)).s;
    expect(slot).toMatchObject({ state: "descartada" });
    expect(slot.reason).toMatch(/^Falha da IA: .*provedor fora do ar/);
    expect((await slotOf(r.id)).state).toBe("concluido");
    expect((await env.sql(`select status from public.ch_jobs where idempotency_key = $1`, [`qgen:${r.id}:1`]))[0].status).toBe("dead");
  });

  it("IA desligada ou sem configuração: a tarefa fica pendente, sem gastar tentativa e sem criar rascunho", async () => {
    const r = await newRequest(1);
    await env.sql(`update public.ch_jobs set status = 'blocked' where status = 'queued' and idempotency_key <> $1`, [`qgen:${r.id}:1`]);
    const job = (await env.db.service<Job | null>("ch_worker_claim", { p_stale_seconds: 900 }))!;
    const out = await runJob({ db: env.db, storage: {} as any, ai: { provider: null, status: { ready: false } } } as any, job);
    expect(out.status).toBe("blocked");
    expect((await slotOf(r.id)).s.state).toBe("gerando");
    expect((await env.sql(`select count(*)::int as n from public.draft_questions where request_id = $1`, [r.id]))[0].n).toBe(0);
  });
});

describe("Simulação do desenvolvimento", () => {
  it("a simulação nunca escreve questão", async () => {
    const r = await newRequest(1);
    const { out } = await runSlot(new MockProvider(mockRespond), r.id);
    expect(out.status).toBe("succeeded");
    expect((await slotOf(r.id)).s).toMatchObject({ state: "pulada" });
    expect((await slotOf(r.id)).s.reason).toMatch(/^evidência insuficiente: Simulação: sem IA real/);
    expect((await env.sql(`select count(*)::int as n from public.draft_questions where request_id = $1`, [r.id]))[0].n).toBe(0);
  });
});
