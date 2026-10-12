// Quadro pessoa x funcao das telas novas da leva 3 (estado de producao simulado + leva). Cada chamada roda numa transacao que e desfeita.
// "libera" = passou da porta de acesso (pode ate dar erro de dado depois); "NEGA" = recusada por falta de acesso.
import fs from "node:fs";
import { montaProducao, sqlLeva } from "./lib.mjs";
const db = await montaProducao(); for (let v = 0; v < 2; v++) for (const s of sqlLeva()) await db.exec(s);
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = [["visitante", null], ["aluno", U(6)], ["revisor da área (sem equipe)", U(3)], ["revisor de OUTRA área (sem equipe)", U(4)], ["editor", U(2)], ["editor + revisor da área", U(5)], ["administrador", U(1)]];
for (const [n, id] of [["adm", U(1)], ["ed", U(2)], ["revPed", U(3)], ["revCir", U(4)], ["edRev", U(5)], ["alu", U(6)], ["pro", U(8)], ["elite", U(9)]]) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)`, [id, `${n}@t.local`, { name: n }]);
await db.exec(`update public.user_roles set role='admin' where user_id='${U(1)}'; update public.user_roles set role='editor' where user_id in ('${U(2)}','${U(5)}');
  insert into public.ch_reviewer_areas (user_id, area_code) values ('${U(3)}','PEDIATRIA'), ('${U(4)}','CIRURGIA'), ('${U(5)}','PEDIATRIA');
  update public.subscriptions set plan='trial', status='trialing', trial_ends_at=now()+interval '3 days' where user_id='${U(6)}';`);
// dados: uma questao de Pediatria com comentario em revisao, uma aula, um episodio
const opts = ["A", "B", "C", "D"].map((id) => ({ id, text: "alt " + id, explanation: id === "B" ? "B correta por suporte." : "" }));
const q = { kind: "REVALIDA", year: 2024, semester: 1, number: 1, area: "PEDIATRIA", topic: "Bronquiolite", statement: "Lactente com sibilancia. Conduta?", options: opts, correct_option: "B", status: "valid", expected_conduct: "Suporte.", inep_intent: "", needs_image: false };
await db.exec("begin"); await db.exec(`select set_config('request.jwt.claims','{"sub":"${U(2)}","role":"authenticated"}',true); set local role authenticated`);
await db.query(`select public.app_admin_save_question($1::jsonb)`, [JSON.stringify(q)]);
const pe = (await db.query(`select public.app_admin_save_podcast($1::jsonb) ->> 'id' as id`, [JSON.stringify({ title: "Episodio de teste", topic: "Asma", area: "PEDIATRIA", target_minutes: 5 })])).rows[0]; await db.exec("commit");
const podId = (await db.query(`select id from public.podcasts limit 1`)).rows[0].id;
const QID = "revalida_2024_1_q001"; const LID = "00000000-0000-4000-8000-0000000000a1";
await db.query(`insert into public.lessons (id, area, topic, title, published) values ($1,'PEDIATRIA','Asma','Asma',true)`, [LID]);
const fig = "questoes/" + "d".repeat(32) + ".png";
const F = [
  ["app_admin_question_history(q)", `select public.app_admin_question_history('${QID}')`],
  ["app_admin_comment_review_queue()", `select public.app_admin_comment_review_queue('{}'::jsonb)`],
  ["app_admin_comment_review(q)", `select public.app_admin_comment_review('${QID}')`],
  ["app_admin_question_comment_decide(approve)", `select public.app_admin_question_comment_decide('${QID}', 'approve', 'Conferi o texto do comentario.', '{"explanation_B":"B correta por suporte.","expected_conduct":"Suporte."}'::jsonb)`],
  ["app_question_comment_check()", `select public.app_question_comment_check()`],
  ["app_admin_set_question_image(q, caminho nao conferido)", `select public.app_admin_set_question_image('${QID}', '{"path":"${fig}","alt":"Radiografia de torax em PA normal"}'::jsonb)`],
  ["app_admin_remove_question_image(q)", `select public.app_admin_remove_question_image('${QID}')`],
  ["app_question_figure(q, 0)", `select public.app_question_figure('${QID}', 0)`],
  ["app_lesson_watch(aula)", `select public.app_lesson_watch('${LID}', 30, false, 600)`],
  ["app_lesson_watch_state(aula)", `select public.app_lesson_watch_state('${LID}')`],
  ["app_admin_podcast_approval(ep)", `select public.app_admin_podcast_approval('${podId}')`],
  ["app_admin_podcast_approve(ep)", `select public.app_admin_podcast_approve('${podId}', 'Conferi o roteiro inteiro.')`],
  ["app_my_access()", `select public.app_my_access()`],
  ["simulado_gate()", `select public.simulado_gate()`],
  ["app_my_benefits()", `select public.app_my_benefits()`],
  ["station_feedback_allowed()", `select public.station_feedback_allowed()`],
  ["app_admin_plan_benefits()", `select public.app_admin_plan_benefits()`],
  ["app_admin_save_plan_benefits()", `select public.app_admin_save_plan_benefits('{"elite_voice_daily_minutes": null, "elite_station_feedback": false}'::jsonb)`],
  ["app_admin_signup_trial_rule()", `select public.app_admin_signup_trial_rule()`],
  ["app_start_session(simulado)", `select public.app_start_session('simulado', '{}'::jsonb, 1)`],
  ["ch_worker_lesson_files_reserve (servico)", `select public.ch_worker_lesson_files_reserve(null)`],
  ["ch_worker_podcast_files_pending (servico)", `select public.ch_worker_podcast_files_pending('${U(1)}', null)`],
  ["ch_worker_question_figure_drop (servico)", `select public.ch_worker_question_figure_drop('${fig}')`],
  ["tabela question_figure_files (select)", `select * from public.question_figure_files limit 1`],
  ["tabela question_comment_reviews (select)", `select * from public.question_comment_reviews limit 1`],
  ["tabela plan_benefits (select)", `select * from public.plan_benefits limit 1`],
  ["tabela lesson_files_pending_delete (select)", `select * from public.lesson_files_pending_delete limit 1`],
  ["tabela podcast_files_released (select)", `select * from public.podcast_files_released limit 1`],
];
const DENY = /Acesso restrito|permission denied|Entre na sua conta|Só o administrador|Só a equipe|restrito|revisor médico cadastrado|Só o administrador ou o revisor|apenas/i;
const out = [];
for (const [fn, sql] of F) {
  const row = [];
  for (const [, uid] of P) {
    await db.exec("begin");
    let r;
    try { await db.exec(uid ? `set local role authenticated; select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}',true)` : `set local role anon; select set_config('request.jwt.claims','{}',true)`);
      await db.query(sql); r = "libera"; } catch (e) { r = DENY.test(e.message) ? "NEGA" : "libera (erro: " + e.message.slice(0, 40) + ")"; }
    await db.exec("rollback"); row.push(r);
  }
  out.push([fn, ...row]);
}
const head = ["função / tabela", ...P.map((p) => p[0])];
const md = ["| " + head.join(" | ") + " |", "|" + head.map(() => "---").join("|") + "|", ...out.map((r) => "| " + r.join(" | ") + " |")].join("\n");
console.log(md); fs.writeFileSync(process.argv[2] ?? "matriz-permissoes.md", md + "\n");
await db.close();
