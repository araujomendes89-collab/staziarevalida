// Quadro pessoa x função da LEVA 4 (estado de produção simulado + leva 3 + 9800, 9801, 9810, 9820, 9830 coladas 2x). Cada chamada roda numa
// transação desfeita. "libera" = passou da porta de acesso (pode dar erro de dado depois); "NEGA" = recusada por falta de acesso.
import fs from "node:fs";
import { montaProducao, sqlLeva } from "./lib.mjs";
const db = await montaProducao(); for (let v = 0; v < 2; v++) for (const s of sqlLeva()) await db.exec(s);
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = [["visitante", null], ["aluno (teste valendo)", U(6)], ["aluno (teste vencido)", U(7)], ["revisor PEDIATRIA (sem equipe)", U(3)], ["revisor CIRURGIA (sem equipe)", U(4)], ["editor", U(2)], ["editor + revisor PEDIATRIA", U(5)], ["administrador", U(1)]];
for (const [n, id] of [["adm", U(1)], ["ed", U(2)], ["revPed", U(3)], ["revCir", U(4)], ["edRev", U(5)], ["alu", U(6)], ["vencido", U(7)]]) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,'{}')`, [id, `${n}@t.local`]);
await db.exec(`update public.user_roles set role='admin' where user_id='${U(1)}'; update public.user_roles set role='editor' where user_id in ('${U(2)}','${U(5)}');
  insert into public.ch_reviewer_areas (user_id, area_code) values ('${U(3)}','PEDIATRIA'), ('${U(4)}','CIRURGIA'), ('${U(5)}','PEDIATRIA');
  update public.subscriptions set plan='trial', status='trialing', trial_ends_at=now()+interval '3 days' where user_id='${U(6)}';
  update public.subscriptions set plan='trial', status='trialing', trial_ends_at=now()-interval '1 day' where user_id='${U(7)}';`);
// um rascunho de Pediatria (aguardando revisão), para as chamadas que precisam de id
const [{ id: DID }] = (await db.query(`insert into public.draft_questions (batch, source_id, slot, area, stem, alternatives, correct_answer, explanation, alternative_explanations, source_citations, clinical_decision, content_hash, model)
  values ('lote_matriz', 'm1', 1, 'PEDIATRIA', 'Lactente de 8 meses com febre e otalgia há três dias, membrana abaulada. Qual a conduta?', '{"A":"a1","B":"b1","C":"c1","D":"d1"}'::jsonb, 'A', 'Explicação.', '{}'::jsonb, '[]'::jsonb, 'Tratar.', 'h', 'm') returning id`)).rows;
const [{ id: CID }] = (await db.query(`insert into public.ch_ai_requests (kind, status, requested_by, target_ids, params, request_key, item_count) values ('draft_check', 'na_fila', '${U(1)}', array['${DID}'], '{}'::jsonb, 'matriz', 1) returning id`)).rows;
const ZERO = "00000000-0000-4000-8000-000000000000";
const F = [
  ["app_draft_questions({limit 1})", `select public.app_draft_questions(p_limit => 1)`],
  ["app_draft_question_detail(rascunho)", `select public.app_draft_question_detail('${DID}')`],
  ["app_draft_question_decide(pedir ajustes)", `select public.app_draft_question_decide('${DID}', 'needs_changes', 'Falta a fonte oficial.')`],
  ["app_draft_question_save(rascunho)", `select public.app_draft_question_save('${DID}', 'h', '{}'::jsonb)`],
  ["app_draft_balance_answer(rascunho)", `select public.app_draft_balance_answer('${DID}', 'h')`],
  ["app_staziamed_topics()", `select public.app_staziamed_topics()`],
  ["app_staziamed_requests()", `select public.app_staziamed_requests()`],
  ["app_staziamed_request_create(...)", `select public.app_staziamed_request_create('topic', 'PEDIATRIA', 'x', 1)`],
  ["app_staziamed_check_enqueue([rascunho])", `select public.app_staziamed_check_enqueue(array['${DID}']::uuid[])`],
  ["app_staziamed_pending_checks()", `select public.app_staziamed_pending_checks()`],
  ["app_staziamed_source_enqueue(rascunho)", `select public.app_staziamed_source_enqueue('${DID}')`],
  ["app_staziamed_preview(rascunho)", `select public.app_staziamed_preview('${DID}')`],
  ["app_staziamed_publish(rascunho)", `select public.app_staziamed_publish('${DID}', 'h')`],
  ["app_staziamed_retire(questão)", `select public.app_staziamed_retire('${ZERO}', 'motivo de teste')`],
  ["app_draft_source_accept(proposta)", `select public.app_draft_source_accept('${ZERO}')`],
  ["app_ch_question_analysis_preview()", `select public.app_ch_question_analysis_preview()`],
  ["app_ch_question_analysis_request()", `select public.app_ch_question_analysis_request(p_count => 1)`],
  ["app_ch_draft_check_preview()", `select public.app_ch_draft_check_preview()`],
  ["app_ch_draft_check_request()", `select public.app_ch_draft_check_request(p_count => 1)`],
  ["app_ch_ai_requests()", `select public.app_ch_ai_requests()`],
  ["app_ch_ai_request_cancel(pedido)", `select public.app_ch_ai_request_cancel('${CID}')`],
  ["app_ch_source_candidates()", `select public.app_ch_source_candidates()`],
  ["app_ch_source_candidate_approve(candidato)", `select public.app_ch_source_candidate_approve('${ZERO}', '{}'::jsonb)`],
  ["app_ch_source_search_check(área, tema)", `select public.app_ch_source_search_check('PEDIATRIA', 'asma')`],
  ["has_ineditas()", `select public.has_ineditas()`],
  ["ineditas_gate()", `select public.ineditas_gate()`],
  ["app_start_session(Questões StaziaMed)", `select public.app_start_session('questoes', '{"exam_id":"staziamed"}'::jsonb, 1)`],
  ["ch_worker_staziamed_acervo (servico)", `select public.ch_worker_staziamed_acervo()`],
  ["ch_worker_ai_request_get (servico)", `select public.ch_worker_ai_request_get('${CID}')`],
  ["ch_worker_source_currency_pending (servico)", `select public.ch_worker_source_currency_pending()`],
  ["ch_draft_triage (interna)", `select public.ch_draft_triage('${DID}')`],
  ["ch_draft_official_evidence (interna)", `select public.ch_draft_official_evidence('${DID}')`],
  ["tabela draft_questions (linhas visíveis)", `select count(*)::int as c from public.draft_questions`, "tabela"],
  ["tabela draft_question_events (linhas visíveis)", `select count(*)::int as c from public.draft_question_events`, "tabela"],
  ["tabela ch_ai_requests (linhas visíveis)", `select count(*)::int as c from public.ch_ai_requests`, "tabela"],
  ["tabela staziamed_requests (linhas visíveis)", `select count(*)::int as c from public.staziamed_requests`, "tabela"],
];
const DENY = /Acesso restrito|permission denied|Entre na sua conta|Só o administrador|Só a equipe|restrito|revisor médico cadastrado|apenas|administrador ou revisor|Editar rascunho é da equipe|Publicar é do administrador|Só a equipe|Pedido de|fechad|Seu teste|Seu plano|assinatura/i;
const out = [];
await db.exec(`select public.draft_event('${DID}'::uuid, 'editada', 'exemplo', null, '{}'::jsonb)`);
for (const [fn, sql, kind] of F) {
  const row = [];
  for (const [, uid] of P) {
    await db.exec("begin");
    let r;
    try { await db.exec(uid ? `set local role authenticated; select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}',true)` : `set local role anon; select set_config('request.jwt.claims','{}',true)`);
      const q = await db.query(sql); r = kind === "tabela" ? `vê ${q.rows[0].c}` : "libera"; } catch (e) { r = DENY.test(e.message) ? "NEGA" : "libera (erro: " + e.message.slice(0, 50) + ")"; }
    await db.exec("rollback"); row.push(r);
  }
  out.push([fn, ...row]);
}
const head = ["função / tabela", ...P.map((p) => p[0])];
const md = ["| " + head.join(" | ") + " |", "|" + head.map(() => "---").join("|") + "|", ...out.map((r) => "| " + r.join(" | ") + " |")].join("\n");
console.log(md); fs.writeFileSync(process.argv[2] ?? "matriz-permissoes.md", md + "\n");
await db.close();
