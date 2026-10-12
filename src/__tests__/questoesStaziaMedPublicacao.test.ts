// @vitest-environment node
/**
 * Questões StaziaMed — publicar, republicar, recolher e "fonte desatualizada" (Tarefa 11). Só o administrador publica, só a versão
 * que o revisor aprovou, e a questão nasce em public.questions sem nunca virar "oficial" nem ter intenção do Inep.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readyDraft, setChecks, USERS, type StaziaEnv, openStaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 300_000 });
let env: StaziaEnv;

beforeAll(async () => {
  env = await openStaziaEnv();
}, 600_000);
afterAll(async () => {
  await env?.close();
}, 60_000);

const row = async (id: string) => (await env.sql(`select * from public.draft_questions where id = $1`, [id]))[0];
const approve = async (id: string) => {
  const d = await row(id);
  await env.rpc(USERS.REVISOR_PED, "app_draft_question_decide", { p_id: id, p_decision: "approved", p_note: "Conferi.", p_hash: d.content_hash, p_sources_checked: true });
  return (await row(id)).content_hash as string;
};
const publish = (id: string, hash: string, uid = USERS.ADMIN) => env.rpc<{ question_id: string; code: string; number: number; action: string }>(uid, "app_staziamed_publish", { p_id: id, p_hash: hash });
const q = async (id: string) => (await env.sql(`select * from public.questions where id = $1`, [id]))[0];
/** Edita, confere e aprova de novo (nova versão aprovada). */
async function newApprovedVersion(id: string, change: Record<string, unknown>) {
  const d = await row(id);
  await env.rpc(USERS.EDITOR, "app_draft_question_save", { p_id: id, p_hash: d.content_hash, p_content: change });
  await setChecks(env, id);
  return approve(id);
}

describe("Publicar", () => {
  it("só administrador e só a versão aprovada; staziamed_q0001 / STZ-0001, área mapeada, opções com explicação, conduta, fontes, sem intenção do Inep", async () => {
    const r = await readyDraft(env, { area: "CIRURGIA" });
    await expect(publish(r.id, r.hash)).rejects.toThrow("Publique só a versão aprovada pelo revisor médico.");
    const hash = await (async () => {
      const [{ topic }] = await env.sql<{ topic: string }>(`select topic from public.staziamed_topic_weights('CIRURGIA') limit 1`);
      await env.rpc(USERS.EDITOR, "app_draft_question_save", { p_id: r.id, p_hash: r.hash, p_content: { topic } });
      await setChecks(env, r.id);
      await env.sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CIRURGIA') on conflict do nothing`, [USERS.REVISOR_PED]);
      return approve(r.id);
    })();
    for (const uid of [USERS.EDITOR, USERS.REVISOR_PED, USERS.PRO, USERS.TESTE]) await expect(publish(r.id, hash, uid), uid).rejects.toThrow("Publicar é do administrador.");
    await expect(publish(r.id, "hash-antigo")).rejects.toThrow("Publique só a versão aprovada pelo revisor médico.");
    const out = await publish(r.id, hash);
    expect(out).toEqual({ question_id: "staziamed_q0001", code: "STZ-0001", number: 1, action: "publicada" });
    const d = await row(r.id);
    const s = await q("staziamed_q0001");
    expect(s).toMatchObject({ origin: "staziamed", exam_id: "staziamed", number: 1, area: "CIRURGIA_GERAL", status: "valid", inep_intent: null, retired_at: null, correct_option: d.correct_answer, expected_conduct: d.clinical_decision, statement: d.stem });
    expect(s.options).toHaveLength(4);
    expect(s.options.find((o: any) => o.id === d.correct_answer).explanation).toBe(d.explanation);
    const wrong = s.options.find((o: any) => o.id !== d.correct_answer);
    expect(wrong.explanation).toBe(d.alternative_explanations[wrong.id]);
    // o aluno lê `sources` direto: só título, órgão, nível, página e versão
    expect(s.sources).toEqual([{ title: r.title, organ: "Ministério da Saúde (teste)", level: "A", page: 7, version: "2026" }]);
    expect(JSON.stringify(s.sources)).not.toMatch(/quote|supports|amoxicilina/);
    expect(d).toMatchObject({ question_id: "staziamed_q0001", published_hash: hash, published_by: USERS.ADMIN });
    expect((await env.sql(`select kind from public.draft_question_events where draft_id = $1 and kind = 'publicada'`, [r.id]))).toHaveLength(1);
    expect((await env.sql(`select question_count from public.exams where id = 'staziamed'`))[0].question_count).toBe(1);
    // nunca como oficial: sem gabarito oficial e fora das contagens oficiais
    expect((await env.sql(`select count(*)::int as n from public.question_official_answers where question_id = 'staziamed_q0001'`))[0].n).toBe(0);
    expect((await env.rpc(USERS.PRO, "app_question_filters", {})).total).toBe((await env.rpc(USERS.TESTE, "app_question_filters", {})).total);
    // o aluno com acesso vê a opção na lista e o fechado vê o cadeado
    const option = (await env.rpc<any>(USERS.TESTE, "app_question_filters", {})).exams.find((e: any) => e.id === "staziamed");
    expect(option).toMatchObject({ total: 1, locked: false });
    expect((await env.rpc<any>(USERS.TESTE_VENCIDO, "app_question_filters", {})).exams.find((e: any) => e.id === "staziamed")).toMatchObject({ locked: true });
  });

  it("publicar duas vezes seguidas: uma questão só ('Esta versão já está publicada.')", async () => {
    const r = await readyDraft(env);
    const hash = await approve(r.id);
    const first = await publish(r.id, hash);
    await expect(publish(r.id, hash)).rejects.toThrow("Esta versão já está publicada.");
    expect((await env.sql(`select count(*)::int as n from public.questions where origin = 'staziamed' and id = $1`, [first.question_id]))[0].n).toBe(1);
    // a numeração é por sequência: a próxima publicação não repete número
    const r2 = await readyDraft(env);
    expect((await publish(r2.id, await approve(r2.id))).number).toBe(first.number + 1);
  });

  it("a prévia é igual ao que fica gravado", async () => {
    const r = await readyDraft(env);
    const hash = await approve(r.id);
    await expect(env.rpc(USERS.EDITOR, "app_staziamed_preview", { p_id: r.id })).rejects.toThrow("Publicar é do administrador.");
    const preview = await env.rpc<any>(USERS.ADMIN, "app_staziamed_preview", { p_id: r.id });
    expect(preview.exam).toMatchObject({ kind: "STAZIAMED" });
    const out = await publish(r.id, hash);
    expect(preview.number).toBe(out.number);
    expect(preview.code).toBe(out.code);
    const s = await q(out.question_id);
    for (const k of ["statement", "options", "expected_conduct", "sources", "topic", "correct_option"]) expect(s[k], k).toEqual(preview[k]);
    expect(String(s.area)).toBe(preview.area);
    expect(preview.blockers).toEqual([]);
  });
});

describe("Republicar e recolher", () => {
  it("republicar depois de nova aprovação troca o conteúdo da mesma questão; gabarito diferente recusa; recolher e publicar como nova dá número novo", async () => {
    const r = await readyDraft(env);
    const first = await publish(r.id, await approve(r.id));
    const stem = (await q(first.question_id)).statement;
    const h2 = await newApprovedVersion(r.id, { stem: stem + " Detalhe novo do caso." });
    const again = await publish(r.id, h2);
    expect(again).toMatchObject({ question_id: first.question_id, number: first.number, action: "republicada" });
    expect((await q(first.question_id)).statement).toBe(stem + " Detalhe novo do caso.");
    expect((await env.sql(`select kind from public.draft_question_events where draft_id = $1 and kind = 'republicada'`, [r.id]))).toHaveLength(1);
    // gabarito diferente: recusa enquanto a questão está no ar
    const d = await row(r.id);
    const other = d.correct_answer === "A" ? "B" : "A";
    const alts = { ...d.alternatives, [d.correct_answer]: d.alternatives[other], [other]: d.alternatives[d.correct_answer] };
    const exps = { ...d.alternative_explanations, [d.correct_answer]: d.alternative_explanations[other], [other]: d.alternative_explanations[d.correct_answer] };
    const h3 = await newApprovedVersion(r.id, { correct_answer: other, alternatives: alts, alternative_explanations: exps });
    await expect(publish(r.id, h3)).rejects.toThrow("O gabarito mudou: recolha esta questão e publique como nova.");
    // recolhida: com o gabarito novo vira outra questão, com número novo; a antiga continua recolhida
    await env.rpc(USERS.ADMIN, "app_staziamed_retire", { p_id: r.id, p_reason: "Gabarito trocado." });
    const fresh = await publish(r.id, h3);
    expect(fresh).toMatchObject({ action: "publicada" });
    expect(fresh.question_id).not.toBe(first.question_id);
    expect(fresh.number).toBeGreaterThan(first.number);
    expect((await q(first.question_id)).retired_at).toBeTruthy();
    expect((await row(r.id)).question_id).toBe(fresh.question_id);
  });

  it("recolher: só administrador e com motivo; sai do sorteio e quem respondeu continua vendo; republicar o mesmo gabarito volta ao sorteio", async () => {
    const r = await readyDraft(env);
    const out = await publish(r.id, await approve(r.id));
    const session = await env.rpc<{ session_id: string }>(USERS.PRO, "app_start_session", { p_kind: "questoes", p_filters: { exam_id: "staziamed" }, p_count: 50 });
    const ids = (await env.sql<{ question_ids: string[] }>(`select question_ids from public.practice_sessions where id = $1`, [session.session_id]))[0].question_ids;
    expect(ids).toContain(out.question_id);
    await env.rpc(USERS.PRO, "app_answer_question", { p_session_id: session.session_id, p_question_id: out.question_id, p_option: "A" });
    for (const uid of [USERS.EDITOR, USERS.REVISOR_PED, USERS.PRO]) await expect(env.rpc(uid, "app_staziamed_retire", { p_id: r.id, p_reason: "x" }), uid).rejects.toThrow("Recolher é do administrador.");
    await expect(env.rpc(USERS.ADMIN, "app_staziamed_retire", { p_id: r.id, p_reason: " " })).rejects.toThrow("Explique o motivo para recolher.");
    const retired = await env.rpc<{ retired_at: string }>(USERS.ADMIN, "app_staziamed_retire", { p_id: r.id, p_reason: "Fonte revista." });
    expect(retired.retired_at).toBeTruthy();
    expect((await env.sql(`select note from public.draft_question_events where draft_id = $1 and kind = 'recolhida'`, [r.id]))[0].note).toBe("Fonte revista.");
    // fora do sorteio...
    const pool = await env.sqlAs<{ question_id: string }>(USERS.PRO, `select question_id from public.practice_pool('{"exam_id": "staziamed"}'::jsonb)`);
    expect(pool.map((p) => p.question_id)).not.toContain(out.question_id);
    // ...mas a sessão de quem respondeu abre com a correção
    const old = await env.rpc<any>(USERS.PRO, "app_get_session", { p_session_id: session.session_id });
    expect(old.questions.find((x: any) => x.id === out.question_id)).toMatchObject({ selected: "A" });
    expect(old.questions.find((x: any) => x.id === out.question_id).correction).toBeTruthy();
    expect((await env.sql(`select question_count from public.exams where id = 'staziamed'`))[0].question_count).toBe(
      Number((await env.sql(`select count(*)::int as n from public.questions where origin = 'staziamed' and retired_at is null`))[0].n)
    );
    // mesma versão recolhida: publicar de novo volta ao sorteio (mesma questão, mesmo número)
    const back = await publish(r.id, (await row(r.id)).content_hash);
    expect(back).toMatchObject({ question_id: out.question_id, action: "republicada" });
    expect((await q(out.question_id)).retired_at).toBeNull();
  });
});

describe("Fonte desatualizada", () => {
  it("fonte vencida ou substituída: publicar recusa e a lista mostra a fonte desatualizada", async () => {
    const r = await readyDraft(env);
    const hash = await approve(r.id);
    await env.sql(`update public.ch_sources set valid_until = '2020-01-01' where id = $1`, [r.sourceId]);
    await expect(publish(r.id, hash)).rejects.toThrow(new RegExp(`^Não publica: .*Fonte citada não está vigente: ${r.title}\\.`, "s"));
    const list = await env.rpc<any>(USERS.ADMIN, "app_draft_questions", { p_batch: (await row(r.id)).batch, p_limit: 100 });
    const item = list.items.find((i: any) => i.id === r.id);
    expect(item.stale_sources).toEqual([r.title]);
    expect(list.counts.stale).toBeGreaterThanOrEqual(1);
    expect(item).toMatchObject({ can_publish: true, situacao: "approved" });
    // fonte substituída por outra versão
    const r2 = await readyDraft(env);
    const hash2 = await approve(r2.id);
    await env.sql(`update public.ch_sources set status = 'superseded' where id = $1`, [r2.sourceId]);
    await expect(publish(r2.id, hash2)).rejects.toThrow(/Fonte citada não está vigente/);
    expect((await env.rpc<any>(USERS.ADMIN, "app_draft_questions", { p_batch: (await row(r2.id)).batch, p_limit: 100 })).items.find((i: any) => i.id === r2.id).stale_sources).toEqual([r2.title]);
  });

  it("publicada com fonte que depois venceu: a lista avisa (o alerta do painel), sem recolher sozinha", async () => {
    const r = await readyDraft(env);
    const out = await publish(r.id, await approve(r.id));
    await env.sql(`update public.ch_sources set valid_until = '2020-01-01' where id = $1`, [r.sourceId]);
    const item = (await env.rpc<any>(USERS.ADMIN, "app_draft_questions", { p_batch: (await row(r.id)).batch, p_limit: 100 })).items.find((i: any) => i.id === r.id);
    expect(item).toMatchObject({ situacao: "published", stale_sources: [r.title], question: { id: out.question_id } });
    expect((await q(out.question_id)).retired_at).toBeNull(); // só alerta: recolher é decisão do administrador
  });
});

describe("O que o aluno recebe da Questão StaziaMed publicada", () => {
  it("a correção traz as fontes oficiais com o trecho SÓ depois de responder; a coluna sources nunca traz o trecho; o Início separa as inéditas", async () => {
    const r = await readyDraft(env);
    const out = await publish(r.id, await approve(r.id));
    const [{ topic }] = await env.sql<{ topic: string }>(`select topic from public.draft_questions where id = $1`, [r.id]);
    // antes de responder: nada de gabarito, de trecho nem de fonte
    const view = (await env.sqlAs(USERS.PRO, `select public.practice_question_view($1) as v`, [out.question_id]))[0].v;
    expect(JSON.stringify(view)).not.toMatch(/amoxicilina 90|quote|official_sources|correct/);
    expect((await env.sqlAs(USERS.PRO, `select public.practice_correction_view($1, 'A') as v`, [out.question_id]))[0].v).toBeNull();
    await expect(env.sqlAs(USERS.PRO, `select source_quotes from public.questions where id = $1`, [out.question_id])).rejects.toThrow(/permission denied/);
    const s = await env.rpc<{ session_id: string }>(USERS.PRO, "app_start_session", { p_kind: "questoes", p_filters: { exam_id: "staziamed", topic }, p_count: 200 });
    // errou de propósito (a correta é a A): o tema entra nos temas prioritários do Início
    const answered = await env.rpc<any>(USERS.PRO, "app_answer_question", { p_session_id: s.session_id, p_question_id: out.question_id, p_option: "B" });
    expect(answered.is_correct).toBe(false);
    expect(answered.origin).toBe("staziamed");
    expect(answered.official_sources).toHaveLength(1);
    expect(answered.official_sources[0]).toMatchObject({ source: r.title, organ: "Ministério da Saúde (teste)", version: "2026", page: 7, quote: "indica-se amoxicilina 90 mg/kg/dia por 10 dias" });
    expect(answered.sources).toEqual([{ title: r.title, organ: "Ministério da Saúde (teste)", level: "A", page: 7, version: "2026" }]);
    expect(answered.inep_intent).toBeNull();
    // o Início: o tema com erro mostra as oficiais e, separado, as inéditas
    const home = await env.rpc<any>(USERS.PRO, "app_home", {});
    const t = home.priority_topics.find((x: any) => x.topic === topic);
    expect(t).toBeTruthy();
    expect(t.ineditas).toBeGreaterThanOrEqual(1);
    expect(t.questions).toBeGreaterThanOrEqual(0);
  });
});
