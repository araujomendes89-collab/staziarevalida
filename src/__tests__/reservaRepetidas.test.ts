// @vitest-environment node
/**
 * Reserva de rascunhos repetidos (migração 13010, decisão do dono de 16/10/2026): guardada fora da fila, sem apagar nada,
 * só a equipe guarda e devolve, não se aprova/edita na reserva, não conta como aguardando e volta à fila como era.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { insertDraft, openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 120_000 });
let env: StaziaEnv;
beforeAll(async () => {
  env = await openStaziaEnv();
}, 600_000);
afterAll(async () => {
  await env?.close();
}, 60_000);

const item = (id: string, sib: string) => ({ id, group: "G99", reason: "Mesma pergunta e mesma resposta da irmã.", sibling_id: sib, sibling_code: "RASC-x-1", sibling_ids: [sib] });
const status = async (id: string) => (await env.sql(`select status, reserve, content_hash from public.draft_questions where id = $1`, [id]))[0];

describe("Reserva de rascunhos repetidos", () => {
  it("guarda na reserva sem mudar o conteúdo, sai das contas de aguardando e aparece no filtro Reserva com motivo e irmã", async () => {
    const a = await insertDraft(env);
    const b = await insertDraft(env);
    const before = await status(b);
    const r = await env.rpc(USERS.ADMIN, "app_draft_reserve", { p_items: [item(b, a)] });
    expect(r).toMatchObject({ guardadas: 1, ja_estavam: 0 });
    const after = await status(b);
    expect(after.status).toBe("reserve");
    expect(after.content_hash).toBe(before.content_hash);
    expect(after.reserve).toMatchObject({ group: "G99", sibling_id: a, status_before: "awaiting_medical_review" });
    const lista = await env.rpc<any>(USERS.ADMIN, "app_draft_questions", { p_status: "reserve", p_limit: 50 });
    expect(lista.items.map((i: any) => i.id)).toEqual([b]);
    expect(lista.items[0].situacao).toBe("reserve");
    expect(lista.counts.awaiting_medical_review).toBeGreaterThanOrEqual(1);
    const aguardando = await env.rpc<any>(USERS.ADMIN, "app_draft_questions", { p_status: "awaiting_medical_review", p_limit: 100 });
    expect(aguardando.items.map((i: any) => i.id)).toContain(a);
    expect(aguardando.items.map((i: any) => i.id)).not.toContain(b);
    const pend = await env.rpc<string[]>(USERS.ADMIN, "app_staziamed_pending_checks", { p_filters: {} });
    expect(pend).toContain(a);
    expect(pend).not.toContain(b);
  });

  it("repetir não perde a situação de antes; ninguém aprova, edita nem tira da reserva por outro caminho", async () => {
    const a = await insertDraft(env);
    const b = await insertDraft(env);
    await env.sql(`update public.draft_questions set status = 'needs_changes' where id = $1`, [b]);
    await env.rpc(USERS.ADMIN, "app_draft_reserve", { p_items: [item(b, a)] });
    const again = await env.rpc(USERS.ADMIN, "app_draft_reserve", { p_items: [item(b, a)] });
    expect(again).toMatchObject({ guardadas: 0, ja_estavam: 1 });
    expect((await status(b)).reserve.status_before).toBe("needs_changes");
    await expect(env.sql(`update public.draft_questions set status = 'awaiting_medical_review' where id = $1`, [b])).rejects.toThrow(/reserva/);
    await expect(env.rpc(USERS.REVISOR_PED, "app_draft_question_decide", { p_id: b, p_decision: "rejected", p_note: "x" })).rejects.toThrow(/reserva/);
    expect((await status(b)).status).toBe("reserve");
  });

  it("só a equipe guarda e devolve; aluno e revisor não; exige motivo; recusada e publicada não entram", async () => {
    const a = await insertDraft(env);
    const b = await insertDraft(env);
    await expect(env.rpc(USERS.PRO, "app_draft_reserve", { p_items: [item(b, a)] })).rejects.toThrow();
    await expect(env.rpc(USERS.ADMIN, "app_draft_reserve", { p_items: [{ ...item(b, a), reason: " " }] })).rejects.toThrow(/motivo/);
    await env.sql(`update public.draft_questions set status = 'rejected' where id = $1`, [b]);
    await expect(env.rpc(USERS.ADMIN, "app_draft_reserve", { p_items: [item(b, a)] })).rejects.toThrow(/recusada/);
    expect((await status(b)).status).toBe("rejected");
    await env.sql(`update public.draft_questions set status = 'awaiting_medical_review' where id = $1`, [b]);
    await env.rpc(USERS.ADMIN, "app_draft_reserve", { p_items: [item(b, a)] });
    await expect(env.rpc(USERS.PRO, "app_draft_unreserve", { p_ids: [b] })).rejects.toThrow();
    expect((await status(b)).status).toBe("reserve");
  });

  it("volta à fila na situação de antes, limpa a reserva, deixa rastro na trilha e a questão pode ser decidida de novo", async () => {
    const a = await insertDraft(env);
    const b = await insertDraft(env);
    await env.rpc(USERS.ADMIN, "app_draft_reserve", { p_items: [item(b, a)] });
    const r = await env.rpc(USERS.ADMIN, "app_draft_unreserve", { p_ids: [b] });
    expect(r).toMatchObject({ voltaram: 1 });
    const s = await status(b);
    expect(s.status).toBe("awaiting_medical_review");
    expect(s.reserve).toBeNull();
    const ev = await env.sql(`select details->>'decisao' d from public.draft_question_events where draft_id = $1 and kind = 'decisao' order by id`, [b]);
    expect(ev.map((e: any) => e.d)).toEqual(["reserva", "volta_da_reserva"]);
    await env.rpc(USERS.REVISOR_PED, "app_draft_question_decide", { p_id: b, p_decision: "needs_changes", p_note: "ajustar" });
    expect((await status(b)).status).toBe("needs_changes");
  });
});
