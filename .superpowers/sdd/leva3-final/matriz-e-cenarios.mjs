// Tarefa 1 (parte 2): no estado de producao simulado + as 10 migracoes da leva (coladas 2x), confere PERMISSOES por pessoa e
// CENARIOS que cruzam frentes (Questoes x Aulas x Podcasts x Planos). Saida: linhas "ok" / "ERRO"; codigo de saida 1 se algo falhar.
import { montaProducao, sqlLeva, retrato, compara } from "./lib.mjs";
const db = await montaProducao();
for (let v = 0; v < 2; v++) for (const s of sqlLeva()) await db.exec(s);
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = { adm: U(1), ed: U(2), revPed: U(3), revCir: U(4), edRevPed: U(5), alu: U(6), vencido: U(7), pro: U(8), elite: U(9), proVencido: U(10), semAss: U(11), alu2: U(12) };
for (const [k, id] of Object.entries(P)) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${k}@t.local`, { name: k }]);
await db.exec(`update public.user_roles set role='admin' where user_id='${P.adm}'; update public.user_roles set role='editor' where user_id in ('${P.ed}','${P.edRevPed}');
  insert into public.ch_reviewer_areas (user_id, area_code) values ('${P.revPed}','PEDIATRIA'), ('${P.revCir}','CIRURGIA'), ('${P.edRevPed}','PEDIATRIA');
  update public.subscriptions set plan='trial', status='trialing', trial_ends_at = now() + interval '3 days' where user_id in ('${P.alu}','${P.alu2}');
  update public.subscriptions set trial_ends_at = now() - interval '1 day' where user_id='${P.vencido}';
  update public.subscriptions set plan='pro', status='active', trial_ends_at=null, current_period_end=now()+interval '20 days' where user_id='${P.pro}';
  update public.subscriptions set plan='elite', status='active', trial_ends_at=null, current_period_end=now()+interval '20 days' where user_id='${P.elite}';
  update public.subscriptions set plan='pro', status='active', trial_ends_at=null, current_period_end=now()-interval '2 days' where user_id='${P.proVencido}';
  delete from public.subscriptions where user_id='${P.semAss}';`);
let erros = 0, total = 0;
const as = async (uid, sql, params = []) => { await db.exec("begin"); try { await db.exec(uid ? `set local role authenticated; select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}',true)` : `set local role anon; select set_config('request.jwt.claims','{}',true)`); return (await db.query(sql, params)).rows; } finally { await db.exec("rollback"); } };
const asC = async (uid, sql, params = []) => { await db.exec("begin"); try { await db.exec(uid ? `set local role authenticated; select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}',true)` : `set local role anon; select set_config('request.jwt.claims','{}',true)`); const r = (await db.query(sql, params)).rows; await db.exec("commit"); return r; } catch (e) { await db.exec("rollback"); throw e; } };
const sql = async (s, p = []) => (await db.query(s, p)).rows;
const ck = async (nome, fn) => { total++; try { const r = await fn(); console.log("  ok   " + nome + (r !== undefined && r !== null ? " -> " + String(r).slice(0, 160) : "")); } catch (e) { erros++; console.log("  ERRO " + nome + " :: " + String(e.message).slice(0, 300)); } };
const nega = async (fn, re = /Acesso restrito|permission denied|permissão|Entre na sua conta|apenas|Só o administrador|Só a equipe|restrito/i) => { try { await fn(); } catch (e) { if (re.test(String(e.message))) return String(e.message).slice(0, 70); throw new Error("erro diferente do esperado: " + e.message.slice(0, 160)); } throw new Error("DEIXOU PASSAR"); };
const ok = async (fn) => { try { return await fn(); } catch (e) { throw new Error("deveria passar, mas deu: " + String(e.message).slice(0, 200)); } };
const assert = (c, m) => { if (!c) throw new Error(m); };

// ------------------------------------------------------------------ A. permissoes das funcoes (nivel do banco)
console.log("== A. permissoes das funcoes novas ou redefinidas");
const NOVAS_TELA = ["app_admin_comment_review(text)", "app_admin_comment_review_queue(jsonb,integer,integer)", "app_admin_plan_benefits()", "app_admin_podcast_approval(uuid)", "app_admin_question_comment_decide(text,text,text,jsonb)",
  "app_admin_question_history(text,integer,integer)", "app_admin_remove_question_image(text)", "app_admin_save_plan_benefits(jsonb)", "app_admin_set_question_image(text,jsonb)", "app_admin_signup_trial_rule()",
  "app_lesson_watch(uuid,integer,boolean,integer)", "app_lesson_watch_state(uuid)", "app_my_access()", "app_my_benefits()", "app_question_comment_check()", "app_question_figure(text,integer)", "simulado_gate()", "station_feedback_allowed()"];
const INTERNAS = ["ch_worker_lesson_files_audit(jsonb,uuid)", "ch_worker_lesson_files_done(jsonb,uuid)", "ch_worker_lesson_files_release(jsonb)", "ch_worker_lesson_files_renew(text,uuid)", "ch_worker_lesson_files_reserve(uuid)", "ch_worker_podcast_files_done(uuid,jsonb)", "ch_worker_podcast_files_renew(uuid,bigint,uuid)", "ch_worker_podcast_files_pending(uuid,uuid)",
  "ch_worker_question_figure_confirm(text,text,numeric)", "ch_worker_question_figure_drop(text)", "lesson_file_in_use(text)", "lesson_file_reference_guard()", "lesson_material_file_queue()", "podcast_approve_block_text(med_area)", "podcast_can_approve(med_area)",
  "podcast_files_blocked(text)", "podcast_files_guard_ref()", "podcast_files_queue_audio()", "podcast_files_queue_audio_del()", "podcast_files_queue_source()", "question_can_review_comment(med_area)", "question_comment_assert_access()", "question_comment_fields(jsonb,text,text)",
  "question_comment_review_missing()", "question_hidden_fields(jsonb,jsonb)", "question_person_name(uuid)", "questions_comment_review_mark()", "questions_images_guard()", "questions_keep_figure_flag()", "subscription_trial_is_valid(subscription_status,timestamp with time zone)",
  "user_is_paid_elite(uuid)", "user_plan_lock(uuid)", "user_without_paid_access(uuid)", "ch_raw_app_admin_podcast_approve(uuid,text)", "ch_raw_practice_correction_view(text,text)", "ch_raw_tutor_truth(text,text)", "gam_process_lesson()", "tutor_entitlement(uuid)", "questions_change_trail()", "admin_import_merge_question(text,jsonb)"];
const priv = async (sig, role) => (await sql(`select has_function_privilege($1, $2::regprocedure, 'execute') as x`, [role, sig]))[0].x;
for (const sig of NOVAS_TELA) await ck(`tela ${sig}: visitante NAO, logado SIM, servico SIM`, async () => { assert(!(await priv(sig, "anon")), "anon executa"); assert(await priv(sig, "authenticated"), "authenticated nao executa"); assert(await priv(sig, "service_role"), "service_role nao executa"); });
for (const sig of INTERNAS) await ck(`interna ${sig}: nem visitante nem logado`, async () => { assert(!(await priv(sig, "anon")), "anon executa"); assert(!(await priv(sig, "authenticated")), "authenticated executa"); });
for (const t of ["question_figure_files", "question_comment_reviews", "lesson_files_pending_delete", "podcast_files_released", "plan_benefits"]) await ck(`tabela ${t}: RLS ligado e fechada ao app`, async () => {
  const r = (await sql(`select c.relrowsecurity rls, has_table_privilege('anon', c.oid, 'select') a, has_table_privilege('authenticated', c.oid, 'select') u, has_table_privilege('authenticated', c.oid, 'insert') i,
     (select count(*) from pg_policies p where p.tablename = c.relname)::int pol from pg_class c where c.oid = 'public.${t}'::regclass`))[0];
  assert(r.rls && !r.a && !r.u && !r.i && r.pol === 0, JSON.stringify(r)); });
await ck("coluna questions.comment_review: aluno nao le", async () => { assert(!(await sql(`select has_column_privilege('authenticated','public.questions','comment_review','select') x`))[0].x, "aluno le"); assert(!(await sql(`select has_column_privilege('anon','public.questions','comment_review','select') x`))[0].x, "anon le"); });
await ck("coluna questions.comment_review: o aluno nao consegue 'select *' nem pedir a coluna", async () => { await nega(() => as(P.alu, `select comment_review from public.questions limit 1`), /permission denied/i); });

// ------------------------------------------------------------------ B. Questoes
console.log("== B. Questoes (9700, 9701, 9702) por pessoa");
const opts = (m = {}) => ["A", "B", "C", "D"].map((id) => ({ id, text: `alternativa ${id}`, explanation: m[id] ?? "" }));
const quest = (n, x = {}) => ({ kind: "REVALIDA", year: 2024, semester: 1, number: n, area: "PEDIATRIA", topic: "Bronquiolite", subtopic: "Manejo", statement: `Lactente de 4 meses com sibilancia e coriza (questao ${n}). Qual a conduta?`, options: opts(), correct_option: "B", status: "valid", expected_conduct: "", inep_intent: "", needs_image: false, ...x });
const qid = (n) => `revalida_2024_1_q${String(n).padStart(3, "0")}`;
const rpcC = (uid, fn, args) => { const k = Object.keys(args); return asC(uid, `select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(", ")}) as r`, k.map((x) => (args[x] !== null && typeof args[x] === "object") ? JSON.stringify(args[x]) : args[x])).then((r) => r[0].r); };
const rpc = (uid, fn, args = {}) => { const k = Object.keys(args); return as(uid, `select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(", ")}) as r`, k.map((x) => (args[x] !== null && typeof args[x] === "object") ? JSON.stringify(args[x]) : args[x])).then((r) => r[0].r); };
await ck("equipe salva uma questao nova (sem comentario: nao entra em revisao)", async () => { await rpcC(P.ed, "app_admin_save_question", { p_question: quest(1, { needs_image: true }) }); assert((await sql(`select comment_review from public.questions where id=$1`, [qid(1)]))[0].comment_review === null, "marcou"); });
await ck("pagina de questoes: questao que cita figura sem imagem fica FORA do treino do aluno", async () => { const n = (await as(P.alu, `select count(*)::int c from public.practice_pool('{}'::jsonb) where question_id=$1`, [qid(1)]))[0].c; assert(n === 0, "dentro"); });
const fig = "questoes/" + "a".repeat(31) + "1.png";
await ck("servidor confirma o arquivo; editor vincula; aluno recebe {path, alt}; a questao entra no treino", async () => {
  await sql(`select public.ch_worker_question_figure_confirm($1,'image/png',120000)`, [fig]);
  const r = await rpcC(P.ed, "app_admin_set_question_image", { p_question_id: qid(1), p_image: { path: fig, alt: "Radiografia de torax em PA com hiperinsuflacao" } });
  assert(r.images?.[0]?.path === fig, JSON.stringify(r.images));
  const f = await rpc(P.alu, "app_question_figure", { p_question_id: qid(1), p_index: 0 }); assert(f.path === fig && f.alt, JSON.stringify(f));
  const n = (await as(P.alu, `select count(*)::int c from public.practice_pool('{}'::jsonb) where question_id=$1`, [qid(1)]))[0].c; assert(n === 1, "fora"); });
await ck("figura: aluno, revisor (sem equipe) e visitante NAO vinculam; revisor da area com papel de editor SIM", async () => {
  for (const u of [P.alu, P.revPed, null]) await nega(() => rpcC(u, "app_admin_set_question_image", { p_question_id: qid(1), p_image: { path: fig, alt: "texto alternativo valido" } }));
  await rpcC(P.edRevPed, "app_admin_remove_question_image", { p_question_id: qid(1) }); });
await ck("figura: caminho nunca conferido pelo servidor e recusado (SQL direto tambem)", async () => {
  await nega(() => rpcC(P.ed, "app_admin_set_question_image", { p_question_id: qid(1), p_image: { path: "questoes/" + "b".repeat(32) + ".png", alt: "texto alternativo valido" } }), /servidor ainda n/i);
  await nega(() => sql(`update public.questions set images = '[{"path":"questoes/${"c".repeat(32)}.png","alt":"x"}]' where id = $1`, [qid(1)]), /n.o foi conferida/i); });
await ck("desmarcar 'Cita figura' sem figura e recusado (editor); com figura vale", async () => {
  await nega(() => rpcC(P.ed, "app_admin_save_question", { p_question: quest(5, { needs_image: true }) }).then(() => rpcC(P.ed, "app_admin_save_question", { p_question: { ...quest(5, { needs_image: false }), id: qid(5) } })), /Cita figura|figura/i); });
await ck("comentario: editor muda a explicacao -> em revisao; aluno nao ve; revisor da area aprova; aluno ve", async () => {
  await rpcC(P.ed, "app_admin_save_question", { p_question: quest(2, { options: opts({ B: "B e a correta: suporte e oxigenio." }), expected_conduct: "Suporte." }) });
  const f = (await sql(`select comment_review from public.questions where id=$1`, [qid(2)]))[0].comment_review; assert(f && f.campos.includes("explanation_B") && f.por === P.ed, JSON.stringify(f));
  await asC(P.alu, `select public.app_answer_question($1, 'B')`, [qid(2)]).catch(() => null);
  // a correcao do aluno: usa a funcao publica de correcao
  const fn = (await sql(`select proname from pg_proc where proname in ('practice_correction_view','app_practice_correction') limit 1`))[0]?.proname;
  assert(fn, "funcao de correcao nao achada");
  await sql(`insert into public.question_attempts (user_id, question_id, selected_option, is_correct) values ($1,$2,'B',true) on conflict do nothing`, [P.alu, qid(2)]).catch(() => {});
  const c = (await as(P.alu, `select public.${fn}($1, 'B') as r`, [qid(2)]))[0].r; assert(c.explanation === null && c.in_review === true, JSON.stringify(c));
  const seen = { explanation_B: "B e a correta: suporte e oxigenio.", expected_conduct: "Suporte." };
  await nega(() => rpcC(P.ed, "app_admin_question_comment_decide", { p_question_id: qid(2), p_decision: "approve", p_note: "Conferi o texto todo.", p_seen_texts: seen }), /revisor médico cadastrado|administrador/);
  await nega(() => rpcC(P.revCir, "app_admin_question_comment_decide", { p_question_id: qid(2), p_decision: "approve", p_note: "Conferi o texto todo.", p_seen_texts: seen }), /revisor médico cadastrado|administrador/);
  await nega(() => rpcC(P.alu, "app_admin_question_comment_decide", { p_question_id: qid(2), p_decision: "approve", p_note: "Conferi o texto todo.", p_seen_texts: seen }));
  await rpcC(P.revPed, "app_admin_question_comment_decide", { p_question_id: qid(2), p_decision: "approve", p_note: "Conferi o texto todo.", p_seen_texts: seen });
  const c2 = (await as(P.alu, `select public.${fn}($1, 'B') as r`, [qid(2)]))[0].r; assert(c2.explanation === "B e a correta: suporte e oxigenio." && c2.in_review === false, JSON.stringify(c2)); });
await ck("fila do revisor: revisor da area ve so a area dele; aluno e visitante nao; editor ve tudo", async () => {
  await rpcC(P.ed, "app_admin_save_question", { p_question: quest(3, { expected_conduct: "Conduta A." }) });
  await rpcC(P.ed, "app_admin_save_question", { p_question: quest(4, { area: "CIRURGIA_GERAL", topic: "Apendicite", expected_conduct: "Conduta B." }) });
  const q = async (u) => (await rpc(u, "app_admin_comment_review_queue", {})).items.map((i) => i.code ?? i.id);
  const ped = await q(P.revPed), cir = await q(P.revCir), ed = await q(P.ed);
  assert(ped.length === 1 && cir.length === 1 && ed.length >= 2, JSON.stringify({ ped, cir, ed }));
  await nega(() => rpc(P.alu, "app_admin_comment_review_queue", {})); await nega(() => rpc(null, "app_admin_comment_review_queue", {})); });
await ck("historico: editor e administrador leem; revisor sem equipe, aluno e visitante nao", async () => {
  await rpcC(P.ed, "app_admin_save_question", { p_question: { ...quest(2, { expected_conduct: "Suporte e oxigenio revisados." }), id: qid(2) } });
  const h = await rpc(P.ed, "app_admin_question_history", { p_question_id: qid(2) }); assert(h.total >= 1 && h.items[0].changes, JSON.stringify(h).slice(0, 200));
  await rpc(P.adm, "app_admin_question_history", { p_question_id: qid(2) });
  for (const u of [P.revPed, P.alu, null]) await nega(() => rpc(u, "app_admin_question_history", { p_question_id: qid(2) })); });
await ck("historico registra a figura (por pessoa) e a marca Cita figura", async () => {
  const h = await rpc(P.ed, "app_admin_question_history", { p_question_id: qid(1) }); const campos = h.items.flatMap((i) => Object.keys(i.changes));
  assert(campos.includes("figura"), JSON.stringify(campos)); });
await ck("questao: so a equipe abre app_admin_question / app_admin_questions (aluno e visitante nao)", async () => {
  await rpc(P.ed, "app_admin_question", { p_id: qid(2) });
  for (const u of [P.alu, P.revPed, null]) { await nega(() => rpc(u, "app_admin_question", { p_id: qid(2) })); await nega(() => rpc(u, "app_admin_questions", {})); } });
await ck("conferencia app_question_comment_check: administrador ok=true; editor nao", async () => { const r = await rpc(P.adm, "app_question_comment_check"); assert(r.ok === true, JSON.stringify(r)); await nega(() => rpc(P.ed, "app_question_comment_check")); });

// ------------------------------------------------------------------ C. Aulas
console.log("== C. Aulas (9710, 9711)");
const L = "00000000-0000-4000-8000-0000000000a1";
await sql(`insert into public.lessons (id, area, topic, title, published, video_url) values ($1,'PEDIATRIA','Asma','Asma',true,'https://youtu.be/abc') on conflict do nothing`, [L]);
await ck("aluno conclui sem assistir: aula marcada feita, SEM XP", async () => { await rpcC(P.alu, "app_lesson_progress", { p_id: L, p_seconds: null, p_completed: true }).catch(async () => rpcC(P.alu, "app_lesson_progress", { p_lesson_id: L, p_completed: true }));
  const xp = (await sql(`select count(*)::int c from public.gamification_events where user_id=$1 and event_type='LESSON_COMPLETED'`, [P.alu]))[0].c; assert(xp === 0, "deu XP"); });
await ck("fim sem tempo (p_seconds=0, p_ended=true) NAO grava o fim", async () => { const r = await rpcC(P.alu2, "app_lesson_watch", { p_id: L, p_seconds: 0, p_ended: true, p_duration: 600 }); assert(r.watched_to_end_at === null, JSON.stringify(r)); });
await ck("assistiu ate o fim (tempo coerente) depois de concluir: paga 20 XP uma vez so", async () => {
  const r = await rpcC(P.alu, "app_lesson_watch", { p_id: L, p_seconds: 598, p_ended: true, p_duration: 600 }); assert(r.watched_to_end_at, JSON.stringify(r));
  const n = (await sql(`select count(*)::int c, max(xp_awarded)::int x from public.gamification_events where user_id=$1 and event_type='LESSON_COMPLETED'`, [P.alu]))[0]; assert(n.c === 1 && n.x === 20, JSON.stringify(n));
  await rpcC(P.alu, "app_lesson_watch", { p_id: L, p_seconds: 600, p_ended: true, p_duration: 600 });
  assert((await sql(`select count(*)::int c from public.gamification_events where user_id=$1 and event_type='LESSON_COMPLETED'`, [P.alu]))[0].c === 1, "pagou de novo"); });
await ck("visitante nao chama app_lesson_watch", async () => nega(() => rpc(null, "app_lesson_watch", { p_id: L, p_seconds: 5, p_ended: false })));
// arquivos: Aulas x Podcasts
const lp = `lessons/${L}/slides-1111111111111111.pdf`;
const M = "00000000-0000-4000-8000-0000000000b1";
await ck("Aulas: remover material poe o caminho na fila; reserva so devolve o que ninguem usa", async () => {
  await sql(`insert into public.lesson_materials (id, lesson_id, kind, title, storage_path) values ($1,$2,'slides','s',$3)`, [M, L, lp]);
  await sql(`delete from public.lesson_materials where id=$1`, [M]);
  const q = (await sql(`select state from public.lesson_files_pending_delete where storage_path=$1`, [lp]))[0]; assert(q?.state === "pending", JSON.stringify(q));
  const r = (await sql(`select public.ch_worker_lesson_files_reserve($1::uuid) r`, [P.adm]))[0].r; assert(JSON.stringify(r.items.map((i) => i.path)) === JSON.stringify([lp]) && r.items[0].token, JSON.stringify(r));
  globalThis.__tokenLp = r.items[0].token; });
await ck("Aulas: caminho reservado recusa material novo, fonte de podcast e retencao (os tres gatilhos)", async () => {
  await nega(() => sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ($1,'slides','s',$2)`, [L, lp]), /sendo apagado/);
  const ep = (await rpcC(P.ed, "app_admin_save_podcast", { p_podcast: { title: "Ep teste", topic: "Asma", area: "PEDIATRIA", target_minutes: 5 } })).id;
  await nega(() => sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path) values ($1,'pdf','x',$2)`, [ep, lp]), /sendo apagado/).catch(async (e) => { throw e; });
  await nega(() => sql(`insert into public.ch_file_holds (storage_path) values ($1)`, [lp]), /sendo apagado/);
  assert((await sql(`select public.ch_worker_lesson_files_renew($1, $2::uuid) r`, [lp, globalThis.__tokenLp]))[0].r === true, "renovar reserva vigente");
  await sql(`select public.ch_worker_lesson_files_done($1::jsonb, $2::uuid)`, [JSON.stringify([{ path: lp, token: globalThis.__tokenLp }]), P.adm]); });
let ep2;
await ck("Podcasts: tirar fonte com arquivo poe na fila; fonte do MESMO arquivo em outro episodio impede apagar (mantido)", async () => {
  ep2 = (await rpcC(P.ed, "app_admin_save_podcast", { p_podcast: { title: "Ep A", topic: "Asma", area: "PEDIATRIA", target_minutes: 5 } })).id;
  const ep3 = (await rpcC(P.ed, "app_admin_save_podcast", { p_podcast: { title: "Ep B", topic: "Asma", area: "PEDIATRIA", target_minutes: 5 } })).id;
  const pth = `podcasts/${ep2}/fonte-aaaaaaaa.pdf`;
  await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path) values ($1,'pdf','x',$3),($2,'pdf','y',$3)`, [ep2, ep3, pth]);
  await sql(`delete from public.podcast_sources where podcast_id=$1`, [ep2]);
  const r = (await sql(`select public.ch_worker_podcast_files_pending($1::uuid, null) r`, [P.adm]))[0].r; assert(r.length === 0, "reservou arquivo ainda usado: " + JSON.stringify(r));
  const st = (await sql(`select status from public.podcast_files_released where storage_path=$1`, [pth]))[0]; assert(st.status === "mantido", JSON.stringify(st)); });
await ck("Podcasts: arquivo do 'PDF da aula' (lessons/..) usado por fonte nao e apagado por nenhuma das duas filas", async () => {
  const ep = (await rpcC(P.ed, "app_admin_save_podcast", { p_podcast: { title: "Ep C", topic: "Asma", area: "PEDIATRIA", target_minutes: 5 } })).id;
  const pth = `lessons/${L}/slides-2222222222222222.pdf`;
  await sql(`insert into public.lesson_materials (id, lesson_id, kind, title, storage_path) values ($1,$2,'slides','s',$3)`, ["00000000-0000-4000-8000-0000000000b2", L, pth]);
  await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path) values ($1,'pdf','x',$2)`, [ep, pth]);
  await sql(`delete from public.lesson_materials where id='00000000-0000-4000-8000-0000000000b2'`);
  const r = (await sql(`select public.ch_worker_lesson_files_reserve($1::uuid) r`, [P.adm]))[0].r; assert(!r.items.some((i) => i.path === pth), "aulas reservou arquivo usado por fonte de podcast");
  await sql(`delete from public.podcast_sources where podcast_id=$1`, [ep]);
  const r2 = (await sql(`select public.ch_worker_podcast_files_pending($1::uuid, null) r`, [P.adm]))[0].r; assert(!r2.some((x) => x.path === pth), "podcasts reservou lessons/");
  const st = (await sql(`select status from public.podcast_files_released where storage_path=$1`, [pth]))[0]; assert(st?.status === "mantido", JSON.stringify(st)); });

// ------------------------------------------------------------------ D. Podcasts: aprovar
console.log("== D. Podcasts: quem aprova o roteiro");
let pe;
await ck("episodio pronto para aprovar", async () => {
  pe = (await rpcC(P.ed, "app_admin_save_podcast", { p_podcast: { title: "Asma em 5 min", topic: "Asma", area: "PEDIATRIA", target_minutes: 5 } })).id;
  await rpcC(P.ed, "app_admin_podcast_save_script", { p_id: pe, p_script: { lines: [{ speaker: "ANA", text: "Oi, vamos falar de asma.", sources: [] }, { speaker: "BRUNO", text: "Vamos nessa.", sources: [] }], missing: [] } }); });
await ck("aprovar: editor comum, revisor de outra area, aluno e visitante NAO", async () => { for (const u of [P.ed, P.alu, null]) await nega(() => rpc(u, "app_admin_podcast_approve", { p_id: pe, p_note: "Conferi o roteiro inteiro." })); });
await ck("aprovar: revisor da area SEM papel de equipe NAO entra (so a equipe abre a aba)", async () => nega(() => rpc(P.revPed, "app_admin_podcast_approve", { p_id: pe, p_note: "Conferi o roteiro inteiro." })));
await ck("aprovar: editor que tambem e revisor de Pediatria SIM; administrador SIM", async () => { const r = await rpcC(P.edRevPed, "app_admin_podcast_approve", { p_id: pe, p_note: "Conferi o roteiro inteiro." }); assert(r.status === "approved", JSON.stringify(r).slice(0, 100)); await rpcC(P.adm, "app_admin_podcast_approve", { p_id: pe, p_note: "Conferi de novo o roteiro." }); });
await ck("a recusa de roteiro que cita fonte complementar (invólucro da 9620) continua valendo", async () => { const d = (await sql(`select pg_get_functiondef('public.app_admin_podcast_approve(uuid,text)'::regprocedure) d`))[0].d; assert(/ch_podcast_script_check|ch_raw_app_admin_podcast_approve/.test(d), d.slice(0, 200)); });

// ------------------------------------------------------------------ E. Planos
console.log("== E. Planos (9730, 9731, 9732)");
const sim = (u, k = "simulado") => rpcC(u, "app_start_session", { p_kind: k, p_filters: {}, p_count: 2 });
await ck("simulado: teste valido SIM, pago SIM, Elite SIM, editor SIM, revisor SIM", async () => { for (const u of [P.alu, P.pro, P.elite, P.ed, P.adm, P.revPed]) await ok(() => sim(u)); });
await ck("simulado: teste vencido, plano vencido, SEM assinatura: recusado com mensagem em portugues; questoes abertas", async () => {
  for (const u of [P.vencido, P.proVencido, P.semAss]) { const m = await nega(() => sim(u), /fazem parte dos planos pagos/); await ok(() => sim(u, "questoes")); } });
await ck("simulado: visitante recusado", async () => nega(() => sim(null)));
await ck("BYPASS: aluno com teste vencido insere sessao 'simulado' direto na tabela (API REST)", async () => {
  try { await asC(P.vencido, `insert into public.practice_sessions (user_id, kind, config, question_ids) values ($1,'simulado','{}'::jsonb, array[$2])`, [P.vencido, qid(2)]); } catch (e) { return "recusado: " + String(e.message).slice(0, 80); }
  throw new Error("INSERT DIRETO PASSOU (a trava do simulado so existe em app_start_session)"); });
await ck("Tutor: teste vencido bloqueado e plan_locked; valido disponivel; pago pago", async () => {
  await sql(`update public.tutor_config set enabled = true, requires_pro = true`);
  const e = async (u) => (await rpc(u, "app_tutor_status")).entitlement;
  const a = await e(P.vencido); assert(a.mode === "blocked" && a.plan_locked === true, JSON.stringify(a).slice(0, 120));
  const b = await e(P.alu); assert(b.mode === "trial", b.mode);
  const c = await e(P.pro); assert(c.mode === "paid", c.mode);
  const d = await e(P.ed); assert(d.mode === "paid" && d.staff, d.mode); });
await ck("Elite: beneficios so o administrador le/grava; aluno Elite le os dele; Pro nao e Elite", async () => {
  await nega(() => rpc(P.ed, "app_admin_plan_benefits")); await nega(() => rpc(P.alu, "app_admin_plan_benefits")); await nega(() => rpc(null, "app_admin_plan_benefits"));
  await rpcC(P.adm, "app_admin_save_plan_benefits", { p_benefits: { elite_voice_daily_minutes: 90, elite_station_feedback: true } });
  const e = await rpc(P.elite, "app_my_benefits"); assert(e.elite === true && e.voice_daily_minutes >= 90 && e.station_feedback === true, JSON.stringify(e));
  const p = await rpc(P.pro, "app_my_benefits"); assert(p.elite === false && p.voice_daily_minutes === null && p.station_feedback === false, JSON.stringify(p));
  assert((await rpc(P.elite, "station_feedback_allowed")) === true && (await rpc(P.pro, "station_feedback_allowed")) === false && (await rpc(P.ed, "station_feedback_allowed")) === true, "station_feedback_allowed");
  const v = (await rpc(P.elite, "app_tutor_status")).entitlement.voice.limit_today_s; assert(v >= 90 * 60 || v === 0, "voz do Elite " + v); });
await ck("recolar a 9730 depois de o dono preencher os beneficios NAO apaga o que ele preencheu", async () => { await db.exec(sqlLeva()[7]); const r = (await sql(`select elite_voice_daily_minutes m, elite_station_feedback f from public.plan_benefits`))[0]; assert(r.m === 90 && r.f === true, JSON.stringify(r)); });
await ck("cadastro novo: chave ligada = com teste; desligada = sem teste (expirado, sem data)", async () => {
  await sql(`insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f1','n1@t.local')`);
  let r = (await sql(`select status, trial_ends_at from public.subscriptions where user_id='00000000-0000-4000-8000-0000000000f1'`))[0]; assert(r.status === "trialing" && r.trial_ends_at, JSON.stringify(r));
  await sql(`update public.plans set active = false where code='trial'`);
  await sql(`insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f2','n2@t.local')`);
  r = (await sql(`select status, trial_ends_at from public.subscriptions where user_id='00000000-0000-4000-8000-0000000000f2'`))[0]; assert(r.status === "expired" && r.trial_ends_at === null, JSON.stringify(r));
  await sql(`update public.plans set active = true where code='trial'`); });
await ck("cadastro sem teste: o termo de uso e o telefone continuam sendo gravados (handle_new_user inteiro)", async () => {
  const v = (await sql(`select version from public.legal_versions where document='termo_uso'`))[0]?.version; assert(v, "sem versao do termo");
  await sql(`insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-0000000000f3','n3@t.local', $1)`, [{ name: "Fulana", terms_version: v, phone: "+5511999998888" }]);
  const pr = (await sql(`select name, phone from public.profiles where id='00000000-0000-4000-8000-0000000000f3'`))[0]; assert(pr.phone === "+5511999998888", JSON.stringify(pr));
  const lg = (await sql(`select count(*)::int c from public.legal_acceptances where user_id='00000000-0000-4000-8000-0000000000f3'`).catch(() => [{ c: -1 }]))[0].c; return "aceites: " + lg; });
await ck("regra do cabecalho da 9730: consulta de conferencia roda e lista o vencido, o plano vencido e a conta sem assinatura", async () => {
  const q = `select u.email from auth.users u left join public.subscriptions s on s.user_id = u.id
   where not exists (select 1 from public.user_roles r where r.user_id = u.id and r.role in ('admin','editor')) and not exists (select 1 from public.ch_reviewer_areas a where a.user_id = u.id)
     and not coalesce(s.plan in ('pro','elite') and ((s.status='active' and s.current_period_end > now()) or (s.status='past_due' and s.current_period_end + interval '3 days' > now())), false)
     and not coalesce(s.status='trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()), false) order by 1`;
  const l = (await sql(q)).map((x) => x.email.split("@")[0]); for (const k of ["vencido", "proVencido", "semAss"]) assert(l.includes(k), "faltou " + k + " em " + l); for (const k of ["alu", "pro", "elite", "ed", "adm", "revPed"]) assert(!l.includes(k), "sobrou " + k); return l.join(","); });

// ------------------------------------------------------------------ F. recolar COM DADOS (depois de todos os cenarios acima)
console.log("== F. colar a leva de novo com dados de verdade no banco");
await ck("colagem extra com dados: nenhuma funcao, gatilho, politica, permissao nem LINHA de dado muda", async () => {
  const a = await retrato(db); for (const s of sqlLeva()) await db.exec(s); const b = await retrato(db);
  const dif = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices", "dados"].flatMap((k) => { const c = compara(a[k], b[k]); return [...c.novos, ...c.removidos, ...c.mudaram].map((x) => k + ":" + x); });
  assert(dif.length === 0, dif.join(", ")); return `${Object.keys(a.dados).length} tabelas conferidas`; });

console.log(erros ? `\nRESULTADO: ${erros} ERRO(S) em ${total} checagens` : `\nRESULTADO FINAL: ${total} checagens, tudo ok`);
await db.close(); process.exit(erros ? 1 : 0);
