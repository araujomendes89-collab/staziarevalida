// Quadro pessoa x funcao das telas/funcoes novas da leva 5 (producao simulada + leva 5). Cada chamada roda numa transacao que e desfeita.
// "libera" = passou da porta de acesso (pode ate dar erro de dado depois); "NEGA" = recusada por falta de acesso.
import fs from "node:fs";
import { montaProducao, sqlLeva } from "./lib.mjs";
const db = await montaProducao(); for (let v = 0; v < 2; v++) for (const s of sqlLeva()) await db.exec(s);
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = [["visitante", null], ["aluno", U(6)], ["revisor da área (sem equipe)", U(3)], ["revisor de OUTRA área (sem equipe)", U(4)], ["editor", U(2)], ["editor + revisor da área", U(5)], ["administrador", U(1)]];
for (const [n, id] of [["adm", U(1)], ["ed", U(2)], ["revPed", U(3)], ["revCir", U(4)], ["edRev", U(5)], ["alu", U(6)], ["pro", U(8)]]) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, `${n}@t.local`, { name: n }]);
await db.exec(`update public.user_roles set role='admin' where user_id='${U(1)}'; update public.user_roles set role='editor' where user_id in ('${U(2)}','${U(5)}');
  insert into public.ch_reviewer_areas (user_id, area_code) values ('${U(3)}','PEDIATRIA'), ('${U(4)}','CIRURGIA'), ('${U(5)}','PEDIATRIA');
  update public.subscriptions set plan='trial', status='trialing', trial_ends_at=now()+interval '3 days' where user_id='${U(6)}';
  insert into public.student_reports (user_id, screen, message) values ('${U(6)}', 'Início', 'Relato de teste com mais de dez letras.');`);
const DOC = "00000000-0000-4000-8000-0000000000d1", ZERO = "00000000-0000-4000-8000-000000000000";
await db.query(`insert into public.ch_documents (id, owner_id, name, sha256) values ($1, $2, 'Doc do editor', repeat('a',64))`, [DOC, U(2)]);
const F = [
  ["app_support_contact()", `select public.app_support_contact()`],
  ["app_admin_save_support_contact(e-mail)", `select public.app_admin_save_support_contact('ajuda@exemplo.com')`],
  ["app_report_problem(tela, texto)", `select public.app_report_problem('Início', 'Relato de teste com mais de dez letras.')`],
  ["app_admin_reports()", `select public.app_admin_reports('open', 20, 0)`],
  ["app_admin_report_resolve(1)", `select public.app_admin_report_resolve(1, true)`],
  ["app_ch_documents()", `select public.app_ch_documents()`],
  ["app_ch_processing_settings()", `select public.app_ch_processing_settings()`],
  ["app_ch_set_processing_settings(teto)", `select public.app_ch_set_processing_settings(false, null)`],
  ["ch_worker_processing_settings() (serviço)", `select public.ch_worker_processing_settings()`],
  ["ch_worker_note_credit_pause() (serviço)", `select public.ch_worker_note_credit_pause('${DOC}')`],
  ["app_ch_publish_preview(unidade)", `select public.app_ch_publish_preview('${ZERO}', '{}'::jsonb)`],
  ["app_ch_publish(unidade, opções)", `select public.app_ch_publish('${ZERO}', '{}'::jsonb)`],
  ["app_ch_retire(unidade, motivo)", `select public.app_ch_retire('${ZERO}', 'motivo de teste')`],
  ["app_ch_new_version(unidade)", `select public.app_ch_new_version('${ZERO}')`],
  ["app_ch_claim_can_confirm(afirmação)", `select public.app_ch_claim_can_confirm('${ZERO}')`],
  ["app_ch_discard_evidence(evidência)", `select public.app_ch_discard_evidence('${ZERO}', 'motivo de teste')`],
  ["app_ch_confirm_critical(afirmação)", `select public.app_ch_confirm_critical('${ZERO}')`],
  ["app_ch_visual_review(material)", `select public.app_ch_visual_review('${ZERO}', 'Conferi a dose.')`],
  ["app_ch_visual_list()", `select public.app_ch_visual_list('{}'::jsonb)`],
  ["ch_publish_problems(unidade) (interna)", `select public.ch_publish_problems('${ZERO}')`],
  ["app_ch_reanalysis_status()", `select public.app_ch_reanalysis_status()`],
  ["app_ch_reanalysis_request()", `select public.app_ch_reanalysis_request()`],
  ["app_ch_request_sources_check()", `select public.app_ch_request_sources_check()`],
  ["app_ch_taxonomy_draft()", `select public.app_ch_taxonomy_draft()`],
  ["app_ch_taxonomy_publish()", `select public.app_ch_taxonomy_publish('nota de teste')`],
  ["ch_worker_reanalysis_claim() (serviço)", `select public.ch_worker_reanalysis_claim()`],
  ["ch_worker_document_extraction() (serviço)", `select public.ch_worker_document_extraction('${DOC}')`],
  ["app_plans_info()", `select public.app_plans_info()`],
  ["app_admin_tutor_save_config()", `select public.app_admin_tutor_save_config('{}'::jsonb, 'motivo de teste')`],
  ["ch_worker_tutor_settings() (serviço)", `select public.ch_worker_tutor_settings()`],
  ["ch_worker_tutor_stt_today() (serviço)", `select public.ch_worker_tutor_stt_today('${U(6)}')`],
  ["ch_worker_ai_save_settings() (serviço)", `select public.ch_worker_ai_save_settings('${U(1)}', '{}'::jsonb)`],
  ["tabela student_reports (select)", `select * from public.student_reports limit 1`],
  ["tabela support_config (select)", `select * from public.support_config limit 1`],
  ["tabela ch_processing_settings (select)", `select * from public.ch_processing_settings limit 1`],
  ["tabela ch_reanalysis_control (select)", `select * from public.ch_reanalysis_control limit 1`],
  ["tabela ch_documents (select, documento do editor)", `select * from public.ch_documents where id = '${DOC}'`],
  ["tabela ch_blocks/pages (select)", `select * from public.ch_pages limit 1`],
];
const DENY = /Acesso restrito|permission denied|Entre na sua conta|Só o administrador|Só a equipe|restrito|revisor médico|Só o administrador ou o revisor|apenas|Somente|equipe|administrador|sem acesso/i;
const out = [], detalhes = [];
for (const [fn, sql] of F) {
  const row = [];
  for (const [pn, uid] of P) {
    await db.exec("begin");
    let r, linhas = null;
    try { await db.exec(uid ? `set local role authenticated; select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}',true)` : `set local role anon; select set_config('request.jwt.claims','{}',true)`);
      const res = await db.query(sql); linhas = res.rows.length; r = "libera"; } catch (e) { r = DENY.test(e.message) ? "NEGA" : "libera (erro: " + e.message.slice(0, 40) + ")"; detalhes.push(`${fn} | ${pn} | ${e.message.slice(0, 100)}`); }
    if (/^tabela/.test(fn) && r === "libera") r = linhas ? `libera (${linhas} linha)` : "libera (0 linhas)";
    await db.exec("rollback"); row.push(r);
  }
  out.push([fn, ...row]);
}
const head = ["função / tabela", ...P.map((p) => p[0])];
const md = ["| " + head.join(" | ") + " |", "|" + head.map(() => "---").join("|") + "|", ...out.map((r) => "| " + r.join(" | ") + " |")].join("\n");
console.log(md); fs.writeFileSync(process.argv[2] ?? "matriz-permissoes.md", md + "\n");
fs.writeFileSync((process.argv[2] ?? "matriz-permissoes.md") + ".erros.txt", detalhes.join("\n"));
await db.close();
