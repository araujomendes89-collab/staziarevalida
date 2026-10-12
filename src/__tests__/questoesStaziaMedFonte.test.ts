// @vitest-environment node
/**
 * Questões StaziaMed — buscar fonte oficial (Tarefa 8): afirmações a sustentar, proposta por afirmação (só citação literal, com
 * os mesmos números e negações), proposta completa ou incompleta, "Usar estas fontes" nos 200 rascunhos antigos e o rascunho
 * que muda durante ou depois da busca. A IA é sempre simulada.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runJob, type Job, type PipelineDeps } from "../../server/contentHub/pipeline";
import type { AiProvider, StructuredRequest, StructuredResult } from "../../server/contentHub/ai/provider";
import { sourceClaims } from "../../server/contentHub/questoes/source";
import { addOfficialSource, insertDraft, openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 300_000 });

const DECISION = "Tratar otite média aguda do lactente com amoxicilina 90 mg/kg/dia por 10 dias.";
const PASSAGE = "Em lactentes com otite média aguda, indica-se amoxicilina 90 mg/kg/dia por 10 dias. Em menores de 2 anos a observação isolada não é a conduta. Tratar otite média aguda do lactente com amoxicilina 90 mg/kg/dia por 10 dias.";
let env: StaziaEnv;
let caso = 0;
/** Decisão clínica única por rascunho: as respostas guardadas da IA (mesma entrada, mesma resposta) não escondem o roteiro do teste. */
const decisionOf = () => `${DECISION.slice(0, -1)} (caso ${++caso}).`;

/** Conferente de fontes simulado: responde "compatível" com o trecho inteiro, salvo roteiro em contrário. */
class Evidence implements AiProvider {
  readonly name = "mock";
  readonly model = "mock-dev (simulação, não é IA)";
  readonly isMock = true;
  calls: string[] = [];
  constructor(public answer: (claim: string, payload: any) => Partial<{ verdict: string; quote: string; passage_id: string }> = () => ({}), private onCall?: () => Promise<void>) {}
  async generate<T>(req: StructuredRequest): Promise<StructuredResult<T>> {
    const payload = JSON.parse(req.input.match(/<documento>\n([\s\S]*)\n<\/documento>/)![1]);
    this.calls.push(payload.afirmacao.text);
    await this.onCall?.();
    const t = payload.trechos[0];
    const output = { verdict: "compatible", passage_id: t.passage_id, quote: t.text, rationale: "simulação", ...this.answer(payload.afirmacao.text, payload) };
    return { output: output as T, provider: this.name, model: this.model, inputTokens: 5, outputTokens: 5, latencyMs: 1, costUsd: null };
  }
}
const depsWith = (provider: AiProvider): PipelineDeps =>
  ({ db: env.db, storage: {} as any, ai: { provider, status: { ready: true, provider: provider.name, model: provider.model, isMock: true, pending: null } } }) as any;
const hashOf = async (id: string) => (await env.sql(`select content_hash from public.draft_questions where id = $1`, [id]))[0].content_hash as string;
async function run(provider: AiProvider, draftId: string) {
  await env.sql(`update public.ch_jobs set status = 'blocked' where status = 'queued' and scope_key not like $1`, [`qsource:${draftId}:%`]);
  const job = (await env.db.service<Job | null>("ch_worker_claim", { p_stale_seconds: 900 }))!;
  expect(job.scope_key.startsWith(`qsource:${draftId}:`)).toBe(true);
  return runJob(depsWith(provider), job);
}
const enqueue = (id: string, uid: string = USERS.EDITOR) => env.rpc<{ job_id: string; ja_na_fila: boolean }>(uid, "app_staziamed_source_enqueue", { p_draft_id: id, p_estimate: {} });
const latestProposal = async (id: string) => (await env.sql(`select * from public.draft_source_proposals where draft_id = $1 order by created_at desc, id limit 1`, [id]))[0];

beforeAll(async () => {
  env = await openStaziaEnv();
}, 600_000);
afterAll(async () => {
  await env?.close();
}, 60_000);

describe("Afirmações a sustentar", () => {
  it("a decisão clínica e cada frase com número da resposta e das explicações, sem repetir, até 8", () => {
    const claims = sourceClaims({
      clinical_decision: DECISION,
      alternatives: { A: "Amoxicilina 90 mg/kg/dia por 10 dias.", B: "x", C: "y", D: "z" },
      correct_answer: "A",
      explanation: "Em lactente com otite média aguda, indica-se amoxicilina 90 mg/kg/dia por 10 dias. Amoxicilina 90 mg/kg/dia por 10 dias.",
      alternative_explanations: { A: "Correta. É a conduta inicial.", B: "Incorreta. Em menores de 2 anos a observação isolada não é a conduta.", C: "Incorreta. Sem número aqui.", D: "Incorreta. Em menores de 2 anos a observação isolada não é a conduta." },
    });
    expect(claims[0]).toEqual({ kind: "decisao_clinica", text: DECISION });
    expect(claims.slice(1).every((c) => c.kind === "numero")).toBe(true);
    expect(claims.map((c) => c.text)).toEqual([
      DECISION,
      "Amoxicilina 90 mg/kg/dia por 10 dias.",
      "Em lactente com otite média aguda, indica-se amoxicilina 90 mg/kg/dia por 10 dias.",
      "Incorreta. Em menores de 2 anos a observação isolada não é a conduta.".replace("Incorreta. ", ""),
    ]);
    // limite de 8
    const many = sourceClaims({
      clinical_decision: DECISION, alternatives: { A: "a", B: "b", C: "c", D: "d" }, correct_answer: "A",
      explanation: Array.from({ length: 12 }, (_, i) => `Dose ${i + 1} mg no dia ${i + 1}.`).join(" "), alternative_explanations: { A: "", B: "", C: "", D: "" },
    });
    expect(many).toHaveLength(8);
  });
});

describe("Pedir a busca", () => {
  it("sem decisão clínica: 'Preencha a decisão clínica central'; sem acervo: 'Cadastre fontes oficiais na Central de Conteúdo'; nenhuma tarefa", async () => {
    const semDecisao = await insertDraft(env, { clinical_decision: "  " });
    const comDecisao = await insertDraft(env);
    expect((await env.sql(`select public.staziamed_acervo() as n`))[0].n).toBe(0);
    await expect(enqueue(semDecisao)).rejects.toThrow("Preencha a decisão clínica central");
    await expect(enqueue(comDecisao)).rejects.toThrow("Cadastre fontes oficiais na Central de Conteúdo");
    expect((await env.sql(`select count(*)::int as n from public.ch_jobs where step = 'question_source'`))[0].n).toBe(0);
    await addOfficialSource(env, { title: "PCDT de Otite", text: PASSAGE });
    await expect(enqueue(comDecisao, USERS.REVISOR_PED)).rejects.toThrow("Buscar fonte oficial é da equipe (administrador ou editor).");
    const first = await enqueue(comDecisao);
    expect(first.ja_na_fila).toBe(false);
    expect((await enqueue(comDecisao)).ja_na_fila).toBe(true);
    expect((await env.sql(`select count(*)::int as n from public.ch_jobs where step = 'question_source' and scope_key like $1`, [`qsource:${comDecisao}:%`]))[0].n).toBe(1);
  });
});

describe("Proposta", () => {
  it("proposta completa só com a decisão e todos os números encontrados, cada citação literal e completa", async () => {
    const id = await insertDraft(env, { source_citations: [{ source_file: "Apostila.pdf", supported_claim: "x" }] });
    await enqueue(id);
    const provider = new Evidence();
    const out = await run(provider, id);
    expect(out.status, out.error).toBe("succeeded");
    const p = await latestProposal(id);
    expect(p).toMatchObject({ state: "pendente", complete: true, content_hash: await hashOf(id) });
    expect(p.claims[0]).toMatchObject({ kind: "decisao_clinica", status: "encontrada" });
    expect(p.claims[0].citation).toMatchObject({ source: "PCDT de Otite", organ: "Ministério da Saúde (teste)", version: "2026", page: 7, quote: PASSAGE, supports: DECISION });
    expect(p.claims.every((c: any) => c.status === "encontrada" && c.citation.supports === c.text)).toBe(true);
    expect((await env.sql(`select kind from public.draft_question_events where draft_id = $1 and kind = 'fonte_proposta'`, [id]))).toHaveLength(1);
  });

  it("citação não literal é descartada; 'compatível' sem o número do texto não vale; o que a IA não sustenta fica 'não encontrada'", async () => {
    const decision = decisionOf();
    const n = caso;
    const id = await insertDraft(env, {
      source_citations: [], clinical_decision: decision,
      alternatives: { A: `Amoxicilina 90 mg/kg/dia por 10 dias, caso ${n}.`, B: "Observar sem antibiótico.", C: "Azitromicina em dose única.", D: "Ceftriaxona intramuscular." },
      explanation: `Em lactentes com otite indica-se amoxicilina 90 mg/kg/dia por 10 dias, caso ${n}.`,
      alternative_explanations: { A: "Correta. Conduta inicial.", B: `Incorreta. Em menores de 2 anos a observação isolada não é a conduta, caso ${n}.`, C: "Incorreta. Não é a primeira escolha.", D: "Incorreta. Fica para falha." },
    });
    await enqueue(id);
    const provider = new Evidence((claim) => {
      if (claim === decision) return { quote: "Frase que não está em nenhum trecho oficial." }; // não literal
      if (claim.startsWith("Amoxicilina 90 mg/kg/dia")) return { quote: "indica-se amoxicilina" }; // literal, mas sem 90 mg/kg/dia nem 10 dias
      if (claim.includes("menores de 2 anos")) return { verdict: "insufficient" };
      return {};
    });
    await run(provider, id);
    const p = await latestProposal(id);
    expect(p.complete).toBe(false);
    const byText = (t: string) => p.claims.find((c: any) => c.text.startsWith(t));
    expect(byText("Tratar otite")).toMatchObject({ status: "nao_encontrada", citation: null });
    expect(byText("Tratar otite").reason).toMatch(/não é cópia literal/);
    expect(byText("Amoxicilina 90")).toMatchObject({ status: "nao_encontrada" });
    expect(byText("Amoxicilina 90").reason).toMatch(/90mg\/kg\/dia|10dias/);
    expect(byText("Em menores")).toMatchObject({ status: "nao_encontrada" });
    expect(byText("Em menores").reason).toMatch(/não sustentam/);
  });

  it("proposta incompleta não pode ser usada, mas pode ser descartada", async () => {
    const decision = decisionOf();
    const id = await insertDraft(env, { clinical_decision: decision });
    await enqueue(id);
    await run(new Evidence((claim) => (claim === decision ? { verdict: "insufficient" } : {})), id);
    const p = await latestProposal(id);
    expect(p.complete).toBe(false);
    await expect(env.rpc(USERS.EDITOR, "app_draft_source_accept", { p_proposal_id: p.id })).rejects.toThrow("Proposta incompleta: falta fonte oficial para a decisão clínica ou para algum número.");
    expect(await env.rpc(USERS.EDITOR, "app_draft_source_discard", { p_proposal_id: p.id })).toBe(true);
    expect((await latestProposal(id)).state).toBe("descartada");
    expect(await env.rpc(USERS.EDITOR, "app_draft_source_discard", { p_proposal_id: p.id })).toBe(false);
    await expect(env.rpc(USERS.REVISOR_PED, "app_draft_source_discard", { p_proposal_id: p.id })).rejects.toThrow("Descartar proposta é da equipe");
  });
});

describe("Usar estas fontes", () => {
  it("num dos 200: sai a apostila (fica na trilha), volta a aguardar com conferências zeradas e pede revisão da aplicação", async () => {
    const id = await insertDraft(env, {
      generated_by: "gerador_antigo", batch: "lote-antigo",
      source_citations: [{ source_file: "ATUALIZAÇÕES 2025-2026.pdf", supported_claim: "Amoxicilina 90 mg/kg/dia por 10 dias." }],
    });
    await env.sql(`update public.draft_questions set update_application = 'Aplicação conforme a apostila Sangue nos Olhos.', status = 'approved', reviewed_by = $2, reviewed_at = now(), reviewed_hash = content_hash, review_note = 'ok' where id = $1`, [id, USERS.REVISOR_PED]);
    const hash = await hashOf(id);
    await env.sql(`insert into public.draft_checks (draft_id, layer, verdict, content_hash) values ($1, 'software', 'pass', $2)`, [id, hash]);
    await enqueue(id);
    await run(new Evidence(), id);
    const p = await latestProposal(id);
    const r = await env.rpc<{ draft_id: string; content_hash: string; revisar_aplicacao: boolean }>(USERS.EDITOR, "app_draft_source_accept", { p_proposal_id: p.id });
    expect(r).toMatchObject({ draft_id: id, revisar_aplicacao: true });
    const [d] = await env.sql(`select * from public.draft_questions where id = $1`, [id]);
    expect(r.content_hash).toBe(d.content_hash);
    expect(d.content_hash).not.toBe(hash);
    expect(d).toMatchObject({ status: "awaiting_medical_review", reviewed_by: null, reviewed_hash: null, edited_by: USERS.EDITOR });
    expect(d.edited_at).toBeTruthy();
    expect(d.source_citations.every((c: any) => typeof c.passage_id === "string")).toBe(true);
    expect(JSON.stringify(d.source_citations)).not.toMatch(/ATUALIZAÇÕES|Apostila|source_file/);
    expect(await env.sql(`select layer from public.draft_checks where draft_id = $1`, [id])).toEqual([]);
    const events = await env.sql(`select kind, previous from public.draft_question_events where draft_id = $1 and kind = 'fonte_aceita'`, [id]);
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0].previous)).toMatch(/ATUALIZAÇÕES 2025-2026/); // a apostila fica só na trilha
    expect((await latestProposal(id)).state).toBe("aceita");
    // e a regra de fonte oficial agora passa
    expect((await env.sql(`select public.draft_has_official_sources(d) as v from public.draft_questions d where d.id = $1`, [id]))[0].v).toBe(true);
    // não usa duas vezes
    await expect(env.rpc(USERS.EDITOR, "app_draft_source_accept", { p_proposal_id: p.id })).rejects.toThrow(/já foi decidida/);
  });

  it("proposta de versão antiga: editar depois da busca impede usar", async () => {
    const id = await insertDraft(env);
    await enqueue(id);
    await run(new Evidence(), id);
    const p = await latestProposal(id);
    await env.sql(`update public.draft_questions set stem = stem || ' Peso de 9 kg.' where id = $1`, [id]);
    await expect(env.rpc(USERS.EDITOR, "app_draft_source_accept", { p_proposal_id: p.id })).rejects.toThrow("O rascunho mudou depois da busca: busque a fonte de novo.");
    expect((await latestProposal(id)).state).toBe("pendente");
  });

  it("editar durante a busca impede gravar a proposta e as chamadas seguintes não acontecem", async () => {
    const id = await insertDraft(env, { clinical_decision: decisionOf() });
    await enqueue(id);
    let edited = false;
    const provider = new Evidence(() => ({}), async () => {
      if (!edited) {
        edited = true;
        await env.sql(`update public.draft_questions set stem = stem || ' Editado durante a busca.' where id = $1`, [id]);
      }
    });
    const out = await run(provider, id);
    expect(out.status).toBe("succeeded");
    expect(provider.calls).toHaveLength(1); // só a primeira afirmação foi enviada; o resto parou
    expect(await env.sql(`select 1 from public.draft_source_proposals where draft_id = $1`, [id])).toEqual([]);
    const [j] = await env.sql(`select metrics from public.ch_jobs where scope_key like $1`, [`qsource:${id}:%`]);
    expect(j.metrics.descartada).toBe("texto mudou");
  });

  it("uma nova proposta torna a anterior obsoleta", async () => {
    const id = await insertDraft(env);
    await enqueue(id);
    await run(new Evidence(), id);
    const first = await latestProposal(id);
    await env.sql(`update public.ch_jobs set status = 'succeeded' where scope_key like $1`, [`qsource:${id}:%`]);
    await env.sql(`delete from public.ch_jobs where scope_key like $1`, [`qsource:${id}:%`]);
    await enqueue(id);
    await run(new Evidence(), id);
    expect((await env.sql(`select state from public.draft_source_proposals where id = $1`, [first.id]))[0].state).toBe("obsoleta");
    expect((await latestProposal(id)).state).toBe("pendente");
  });
});
