// @vitest-environment node
/**
 * Questões StaziaMed — editar, equilibrar o gabarito, a trava de aprovação no banco e a lista (Tarefa 10). Cada bloqueio tem a
 * sua mensagem exata; o revisor só aprova o texto que viu; nenhum dos 200 antigos aprova com citação de apostila.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { citesLetter } from "../../server/contentHub/questoes/validate";
import { insertDraft, openStaziaEnv, READY_DECISION, readyDraft, setChecks, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 300_000 });
let env: StaziaEnv;

beforeAll(async () => {
  env = await openStaziaEnv({ drafts: true });
}, 600_000);
afterAll(async () => {
  await env?.close();
}, 60_000);

const row = async (id: string) => (await env.sql(`select * from public.draft_questions where id = $1`, [id]))[0];
const blockers = async (id: string) => (await env.sql<{ b: string[] }>(`select public.draft_approval_blockers($1) as b`, [id]))[0].b;
const decide = (uid: string, id: string, decision: string, note: string | null, hash: string | null, checked = false) =>
  env.rpc(uid, "app_draft_question_decide", { p_id: id, p_decision: decision, p_note: note, p_hash: hash, p_sources_checked: checked });
const save = (uid: string, id: string, hash: string, content: object) => env.rpc<{ content_hash: string; status: string; changed: boolean }>(uid, "app_draft_question_save", { p_id: id, p_hash: hash, p_content: content });

describe("Editar", () => {
  it("só a equipe edita; volta a aguardar, conferências e revisão apagadas e a trilha guarda o conteúdo anterior", async () => {
    const r = await readyDraft(env);
    await env.sql(`update public.draft_questions set status = 'approved', reviewed_by = $2, reviewed_at = now(), reviewed_hash = content_hash, review_note = 'ok' where id = $1`, [r.id, USERS.REVISOR_PED]);
    const before = await row(r.id);
    for (const uid of [USERS.REVISOR_PED, USERS.PRO, USERS.TESTE]) await expect(save(uid, r.id, r.hash, { stem: before.stem + " x" }), uid).rejects.toThrow("Editar rascunho é da equipe (administrador ou editor).");
    const out = await save(USERS.EDITOR, r.id, r.hash, { stem: before.stem + " Peso de 8 kg.", explanation: "Explicação nova do rascunho." });
    expect(out).toMatchObject({ status: "awaiting_medical_review", changed: true });
    const after = await row(r.id);
    expect(after).toMatchObject({ status: "awaiting_medical_review", reviewed_by: null, reviewed_hash: null, edited_by: USERS.EDITOR, similarity_to_official: null });
    expect(after.content_hash).toBe(out.content_hash);
    expect(after.content_hash).not.toBe(r.hash);
    expect(await env.sql(`select layer from public.draft_checks where draft_id = $1`, [r.id])).toEqual([]);
    const [ev] = await env.sql(`select kind, previous, details from public.draft_question_events where draft_id = $1 and kind = 'editada'`, [r.id]);
    expect(ev.previous.stem).toBe(before.stem);
    expect(ev.previous.explanation).toBe(before.explanation);
    expect(ev.details.campos).toEqual(expect.arrayContaining(["stem", "explanation"]));
    // salvar sem mudar nada não é edição
    const same = await save(USERS.EDITOR, r.id, after.content_hash, { stem: after.stem });
    expect(same).toMatchObject({ changed: false, content_hash: after.content_hash });
    expect((await env.sql(`select count(*)::int as n from public.draft_question_events where draft_id = $1 and kind = 'editada'`, [r.id]))[0].n).toBe(1);
  });

  it("dois editores: salvar com hash antigo dá 'Outra pessoa salvou este rascunho…'", async () => {
    const r = await readyDraft(env);
    const stem = (await row(r.id)).stem;
    await save(USERS.EDITOR, r.id, r.hash, { stem: stem + " Primeiro editor." });
    await expect(save(USERS.ADMIN, r.id, r.hash, { stem: stem + " Segundo editor." })).rejects.toThrow("Outra pessoa salvou este rascunho depois que você abriu: abra de novo.");
    expect((await row(r.id)).stem).toBe(stem + " Primeiro editor.");
  });

  it("tema fora da lista de temas das provas oficiais é recusado; tema da lista vale; recusado não se edita; campos inválidos", async () => {
    const r = await readyDraft(env);
    await expect(save(USERS.EDITOR, r.id, r.hash, { topic: "Tema inventado que não é de nenhuma prova" })).rejects.toThrow("Escolha um tema da lista de temas das provas oficiais.");
    const [{ topic }] = await env.sql<{ topic: string }>(`select topic from public.staziamed_topic_weights('PEDIATRIA') offset 3 limit 1`);
    expect(await save(USERS.EDITOR, r.id, r.hash, { topic })).toMatchObject({ changed: true });
    expect((await row(r.id)).topic).toBe(topic);
    const h = (await row(r.id)).content_hash;
    await expect(save(USERS.EDITOR, r.id, h, { stem: "curto" })).rejects.toThrow("Rascunho inválido: enunciado.");
    await expect(save(USERS.EDITOR, r.id, h, { alternatives: { A: "a", B: "b", C: "", D: "d" } })).rejects.toThrow("Rascunho inválido: alternativa C.");
    await expect(save(USERS.EDITOR, r.id, h, { correct_answer: "E" })).rejects.toThrow("Rascunho inválido: gabarito.");
    await env.sql(`update public.draft_questions set status = 'rejected' where id = $1`, [r.id]);
    await expect(save(USERS.EDITOR, r.id, (await row(r.id)).content_hash, { title: "Novo" })).rejects.toThrow("Questão recusada não é editada.");
  });

  it("os 200 antigos: editar o tema e o texto não deixa a carga antiga sobrescrever", async () => {
    const [a] = await env.sql(`select id, content_hash, stem from public.draft_questions where generated_by = 'gerador_antigo' order by batch, slot limit 1`);
    const [{ topic }] = await env.sql<{ topic: string }>(`select topic from public.staziamed_topic_weights(area) limit 1`.replace("(area)", `((select area from public.draft_questions where id = '${a.id}'))`));
    await save(USERS.EDITOR, a.id, a.content_hash, { topic });
    expect((await row(a.id)).edited_at).toBeTruthy();
    expect((await row(a.id)).topic).toBe(topic);
  });
});

describe("Equilibrar o gabarito", () => {
  it("vai para a letra menos usada, explicações acompanham, conta como edição; recusado se a explicação cita letra", async () => {
    const env2 = await openStaziaEnv();
    try {
      const mk = (letter: "A" | "B" | "C" | "D") => insertDraft(env2, { correct_answer: letter, stem: `Enunciado do rascunho com gabarito ${letter}, texto próprio número ${Math.random()}.` });
      // A, A, A, A, B, C (D nunca usada) → a letra-alvo é D
      const ids = [await mk("A"), await mk("A"), await mk("A"), await mk("A"), await mk("B"), await mk("C")];
      const target = ids[0];
      const d0 = (await env2.sql(`select * from public.draft_questions where id = $1`, [target]))[0];
      const out = await env2.rpc<{ from: string; to: string; content_hash: string }>(USERS.EDITOR, "app_draft_balance_answer", { p_id: target, p_hash: d0.content_hash });
      expect(out).toMatchObject({ from: "A", to: "D" });
      const d1 = (await env2.sql(`select * from public.draft_questions where id = $1`, [target]))[0];
      expect(d1.correct_answer).toBe("D");
      expect(d1.alternatives.D).toBe(d0.alternatives.A);
      expect(d1.alternatives.A).toBe(d0.alternatives.D);
      expect(d1.alternative_explanations.D).toBe(d0.alternative_explanations.A);
      expect(d1.alternative_explanations.D).toMatch(/^Correta/);
      expect(d1.status).toBe("awaiting_medical_review");
      expect(d1.content_hash).toBe(out.content_hash);
      const [ev] = await env2.sql(`select note, previous from public.draft_question_events where draft_id = $1 and kind = 'editada'`, [target]);
      expect(ev.note).toBe("Equilibrar gabarito: A → D");
      expect(ev.previous.correct_answer).toBe("A");
      // agora A tem 3, B 1, C 1, D 1: outro A vai para B (a menor, em ordem)
      const second = ids[1];
      expect((await env2.rpc<{ to: string }>(USERS.EDITOR, "app_draft_balance_answer", { p_id: second, p_hash: (await env2.sql(`select content_hash from public.draft_questions where id = $1`, [second]))[0].content_hash })).to).toBe("B");
      // quem já está na menor letra não muda
      const h = (await env2.sql(`select content_hash from public.draft_questions where id = $1`, [target]))[0].content_hash;
      await expect(env2.rpc(USERS.EDITOR, "app_draft_balance_answer", { p_id: target, p_hash: h })).rejects.toThrow("O gabarito já está na letra menos usada.");
      // explicação que cita letra
      const third = ids[2];
      await env2.sql(`update public.draft_questions set explanation = 'Veja a alternativa B para entender.' where id = $1`, [third]);
      const h3 = (await env2.sql(`select content_hash from public.draft_questions where id = $1`, [third]))[0].content_hash;
      await expect(env2.rpc(USERS.EDITOR, "app_draft_balance_answer", { p_id: third, p_hash: h3 })).rejects.toThrow("A explicação cita letra: edite o texto antes de equilibrar o gabarito.");
      // só a equipe, e com o hash aberto
      await expect(env2.rpc(USERS.REVISOR_PED, "app_draft_balance_answer", { p_id: ids[4], p_hash: "x" })).rejects.toThrow("Editar rascunho é da equipe (administrador ou editor).");
      await expect(env2.rpc(USERS.EDITOR, "app_draft_balance_answer", { p_id: ids[4], p_hash: "antigo" })).rejects.toThrow("Outra pessoa salvou este rascunho depois que você abriu: abra de novo.");
    } finally {
      await env2.close();
    }
  });

  it("staziamed_cites_letter concorda com citesLetter (TS) nos mesmos exemplos", async () => {
    const examples = ["a alternativa B está certa", "Letra C", "veja (D)", "o item A", "os itens A e B", "Opção D", "Correta: a amoxicilina", "vitamina D", "hepatite B", "A conduta é observar", "fator B do complemento", "alternativas A", "As letras C"];
    for (const t of examples) {
      const sql = (await env.sql(`select public.staziamed_cites_letter($1) as v`, [t]))[0].v;
      expect(sql, t).toBe(citesLetter(t));
    }
  });
});

describe("Trava de aprovação no banco", () => {
  const BLOQUEIOS: [string, (r: Awaited<ReturnType<typeof readyDraft>>) => Promise<string>, (r: Awaited<ReturnType<typeof readyDraft>>) => string][] = [
    ["Falta o tema.", async (r) => (await env.sql(`update public.draft_questions set topic = null where id = $1`, [r.id]), "ok"), () => "Falta o tema."],
    ["Bloqueada: sem fonte oficial. (citação antiga)", async (r) => (await env.sql(`update public.draft_questions set source_citations = '[{"source_file": "Apostila.pdf", "supported_claim": "x"}]'::jsonb where id = $1`, [r.id]), "ok"), () => "Bloqueada: sem fonte oficial."],
    ["Fonte citada não está vigente", async (r) => (await env.sql(`update public.ch_sources set valid_until = '2020-01-01' where id = $1`, [r.sourceId]), "ok"), (r) => `Fonte citada não está vigente: ${r.title}.`],
    ["Citação não confere com o trecho", async (r) => (await env.sql(`update public.ch_source_passages set text = 'Outro texto oficial sem a frase citada.' where id = $1`, [r.passageId]), "ok"), (r) => `Citação não confere com o trecho da fonte: ${r.title}, p. 7.`],
    ["A decisão clínica não tem citação.", async (r) => (await env.sql(`update public.draft_questions set clinical_decision = 'Outra decisão clínica qualquer.' where id = $1`, [r.id]), "ok"), () => "A decisão clínica não tem citação."],
    ["Conferência pendente: Atualidade.", async (r) => (await env.sql(`delete from public.draft_checks where draft_id = $1 and layer = 'currency'`, [r.id]), "ok"), () => "Conferência pendente: Atualidade."],
    ["Conferência pendente: Regras / Fontes oficiais / Revisão clínica independente", async (r) => (await env.sql(`delete from public.draft_checks where draft_id = $1 and layer in ('software', 'sources', 'redteam')`, [r.id]), "ok"), () => "Conferência pendente: Regras. · Conferência pendente: Fontes oficiais. · Conferência pendente: Revisão clínica independente."],
    ["Regras com problema crítico.", async (r) => (await setChecks(env, r.id, { software: "fail" }), "ok"), () => "Regras com problema crítico."],
    ["Fontes oficiais: reprovada.", async (r) => (await setChecks(env, r.id, { sources: "fail" }), "ok"), () => "Fontes oficiais: reprovada."],
    ["Fontes oficiais: insuficiente.", async (r) => (await setChecks(env, r.id, { sources: "insufficient" }), "ok"), () => "Fontes oficiais: insuficiente."],
    ["Atualidade reprovada.", async (r) => (await setChecks(env, r.id, { currency: "fail" }), "ok"), () => "Atualidade reprovada."],
    ["Semelhança de 72.5% com questão oficial.", async (r) => (await env.sql(`update public.draft_questions set similarity_to_official = 72.5 where id = $1`, [r.id]), "ok"), () => "Semelhança de 72.5% com questão oficial."],
    ["Pede imagem que não existe.", async (r) => (await env.sql(`update public.draft_questions set support_type = 'IMAGE_REQUEST' where id = $1`, [r.id]), await setChecks(env, r.id), "ok"), () => "Pede imagem que não existe."],
  ];
  it("rascunho pronto não tem bloqueio nenhum", async () => {
    const r = await readyDraft(env);
    expect(await blockers(r.id)).toEqual([]);
  });
  it.each(BLOQUEIOS)("trava no banco: %s", async (_name, mutate, expected) => {
    const r = await readyDraft(env);
    await mutate(r);
    const text = expected(r);
    const got = await blockers(r.id);
    expect(got.join(" · ").includes(text) || got.includes(text), `veio: ${got.join(" | ")}`).toBe(true);
    // a mensagem chega ao revisor: nenhuma aprovação passa
    const h = (await row(r.id)).content_hash;
    await expect(decide(USERS.REVISOR_PED, r.id, "approved", "ok", h, true)).rejects.toThrow(/^.*Não aprova: /s);
    expect((await row(r.id)).status).toBe("awaiting_medical_review");
  });

  it("sem os bloqueios, aprovar exige 'Conferi as fontes citadas'; a área errada continua com a mensagem de hoje", async () => {
    const r = await readyDraft(env);
    await expect(decide(USERS.REVISOR_PED, r.id, "approved", null, r.hash, false)).rejects.toThrow('Marque "Conferi as fontes citadas".');
    await expect(decide(USERS.REVISOR_CM, r.id, "approved", null, r.hash, true)).rejects.toThrow("A revisão médica desta questão é de um revisor cadastrado na área PEDIATRIA.");
    await expect(decide(USERS.EDITOR, r.id, "approved", null, r.hash, true)).rejects.toThrow("A revisão médica desta questão é de um revisor cadastrado na área PEDIATRIA.");
    expect(await decide(USERS.REVISOR_PED, r.id, "approved", "Conferi tudo.", r.hash, true)).toBe(true);
    expect(await row(r.id)).toMatchObject({ status: "approved", reviewed_by: USERS.REVISOR_PED, reviewed_hash: r.hash });
    const [ev] = await env.sql(`select kind, note, details from public.draft_question_events where draft_id = $1 and kind = 'decisao'`, [r.id]);
    expect(ev).toMatchObject({ kind: "decisao", note: "Conferi tudo.", details: { decisao: "approved" } });
  });

  it("adversarial reprovada ou atualidade inconclusiva não travam, mas pedem observação", async () => {
    for (const verdicts of [{ redteam: "fail" }, { currency: "inconclusive" }]) {
      const r = await readyDraft(env);
      await setChecks(env, r.id, verdicts);
      expect(await blockers(r.id)).toEqual([]);
      await expect(decide(USERS.REVISOR_PED, r.id, "approved", null, (await row(r.id)).content_hash, true)).rejects.toThrow("Explique na observação por que aprova apesar da revisão adversarial reprovada ou da atualidade inconclusiva.");
      expect(await decide(USERS.REVISOR_PED, r.id, "approved", "Li a revisão adversarial e a conduta está correta.", (await row(r.id)).content_hash, true)).toBe(true);
    }
  });

  it("ajustes e recusa pedem motivo e não pedem o texto aberto; o hash, quando vem, é conferido", async () => {
    const r = await readyDraft(env);
    await expect(decide(USERS.REVISOR_PED, r.id, "needs_changes", " ", null)).rejects.toThrow("Explique o motivo para pedir ajustes ou recusar.");
    await expect(decide(USERS.REVISOR_PED, r.id, "rejected", "Não serve.", "hash-antigo")).rejects.toThrow("O texto mudou depois que você abriu: confira de novo.");
    expect(await decide(USERS.REVISOR_PED, r.id, "needs_changes", "Ajustar a dose.", null)).toBe(true);
    expect((await row(r.id)).status).toBe("needs_changes");
  });

  it("revisor com a tela antiga: 'O texto mudou depois que você abriu: confira de novo.' e nada é aprovado", async () => {
    const r = await readyDraft(env);
    // outra pessoa da equipe salva uma versão nova enquanto o revisor está com a tela aberta
    await save(USERS.EDITOR, r.id, r.hash, { stem: (await row(r.id)).stem + " Versão nova." });
    await setChecks(env, r.id);
    await expect(decide(USERS.REVISOR_PED, r.id, "approved", "ok", r.hash, true)).rejects.toThrow("O texto mudou depois que você abriu: confira de novo.");
    expect((await row(r.id)).status).toBe("awaiting_medical_review");
    // aprovar sem informar o hash também é recusado
    await expect(decide(USERS.REVISOR_PED, r.id, "approved", "ok", null, true)).rejects.toThrow("O texto mudou depois que você abriu: confira de novo.");
  });

  it("nenhum dos 200 aprova citando a apostila: 'Bloqueada: sem fonte oficial.'", async () => {
    const rows = await env.sql<{ id: string; area: string; content_hash: string }>(`select id, area, content_hash from public.draft_questions where generated_by = 'gerador_antigo' order by batch, slot limit 12`);
    expect(rows.length).toBe(12);
    for (const d of rows) {
      await setChecks(env, d.id);
      await env.sql(`update public.draft_questions set topic = coalesce(topic, 'Tema qualquer') where id = $1`, [d.id]);
      const b = await blockers(d.id);
      expect(b, d.id).toContain("Bloqueada: sem fonte oficial.");
      const reviewer = d.area === "PEDIATRIA" ? USERS.REVISOR_PED : d.area === "CLINICA_MEDICA" ? USERS.REVISOR_CM : null;
      if (reviewer) await expect(decide(reviewer, d.id, "approved", "ok", (await row(d.id)).content_hash, true)).rejects.toThrow(/Bloqueada: sem fonte oficial\./);
    }
  });
});

describe("Lista e detalhe", () => {
  it("filtros de origem, pedido/lote, área, tema, situação, bloqueadas e semelhança; contagens; detalhe com trilha, proposta e oficial mais parecida", async () => {
    const env3 = await openStaziaEnv({ drafts: true });
    try {
      const list = (filters: Record<string, unknown> = {}, uid = USERS.EDITOR) =>
        env3.rpc<any>(uid, "app_draft_questions", { p_limit: 100, ...filters });
      const all = await list();
      expect(all.total).toBe(200);
      expect(all.counts).toMatchObject({ awaiting_medical_review: 200, published: 0, retired: 0, blocked: 200 });
      expect(all.answer_distribution).toEqual({ A: 0, B: 0, C: 0, D: 0 });
      expect(all.acervo).toBe(0);
      // origem
      expect((await list({ p_origin: "servidor" })).total).toBe(0);
      expect((await list({ p_origin: "gerador_antigo" })).total).toBe(200);
      const ready = await readyDraft(env3, { batch: "pedido_teste_a" });
      const other = await insertDraft(env3, { batch: "pedido_teste_b", topic: null, stem: "Enunciado completamente diferente para o outro lote de teste, sem tema." });
      await env3.sql(`update public.draft_questions set similarity_to_official = 91.0 where id = $1`, [other]);
      expect((await list({ p_origin: "servidor" })).total).toBe(2);
      expect((await list({ p_batch: "pedido_teste_a" })).items.map((i: any) => i.id)).toEqual([ready.id]);
      expect((await list({ p_topic: "" })).items.map((i: any) => i.id)).toContain(other);
      expect((await list({ p_topic: ready.id ? (await env3.sql(`select topic from public.draft_questions where id = $1`, [ready.id]))[0].topic : "" })).items.map((i: any) => i.id)).toEqual([ready.id]);
      expect((await list({ p_blocked: false, p_origin: "servidor" })).items.map((i: any) => i.id)).toEqual([ready.id]);
      expect((await list({ p_min_similarity: 90 })).items.map((i: any) => i.id)).toEqual([other]);
      expect((await list({ p_area: "PEDIATRIA", p_origin: "servidor" })).total).toBe(2);
      // item: bloqueios, hash e permissões
      const item = (await list({ p_batch: "pedido_teste_a" })).items[0];
      expect(item).toMatchObject({ content_hash: ready.hash, situacao: "awaiting_medical_review", blocked_no_source: false, approval_blockers: [], can_edit: true, can_publish: false, question: null });
      expect((await list({ p_batch: "pedido_teste_a" }, USERS.ADMIN)).items[0].can_publish).toBe(true);
      expect((await list({ p_batch: "pedido_teste_a" }, USERS.REVISOR_PED)).items[0]).toMatchObject({ can_review: true, can_edit: false });
      expect((await list({ p_batch: "pedido_teste_b" })).items[0].approval_blockers).toEqual(expect.arrayContaining(["Falta o tema.", "Bloqueada: sem fonte oficial."]));
      // status
      await env3.sql(`update public.draft_questions set status = 'needs_changes' where id = $1`, [other]);
      expect((await list({ p_status: "needs_changes" })).items.map((i: any) => i.id)).toEqual([other]);
      expect((await list({})).counts.needs_changes).toBe(1);
      await expect(list({}, USERS.PRO)).rejects.toThrow(/restrito/);
      // detalhe
      await env3.sql(`insert into public.draft_source_proposals (draft_id, content_hash, claims, complete) values ($1, $2, '[]'::jsonb, false)`, [ready.id, ready.hash]);
      const [o] = await env3.sql<{ id: string }>(`select id from public.questions where origin = 'official' limit 1`);
      await env3.rpc(USERS.EDITOR, "app_draft_question_save", { p_id: ready.id, p_hash: ready.hash, p_content: { title: "Título novo" } });
      await env3.sql(`update public.draft_questions set similar_question_id = $2 where id = $1`, [ready.id, o.id]);
      const detail = await env3.rpc<any>(USERS.REVISOR_PED, "app_draft_question_detail", { p_id: ready.id });
      expect(detail.draft.id).toBe(ready.id);
      expect(detail.events.map((e: any) => e.kind)).toEqual(["editada"]);
      expect(detail.events[0].actor_email).toBe("editor@staziamed.teste");
      expect(detail.proposals).toHaveLength(1);
      expect(detail.similar_question).toMatchObject({ id: o.id, options: expect.any(Array) });
      expect(detail.similar_question.options).toHaveLength(4);
      await expect(env3.rpc(USERS.PRO, "app_draft_question_detail", { p_id: ready.id })).rejects.toThrow(/restrito/);
    } finally {
      await env3.close();
    }
  });
});
