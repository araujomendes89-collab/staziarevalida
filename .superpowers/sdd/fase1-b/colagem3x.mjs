// Simulação da colagem dos 5 SQL do grupo B (9860 a 9864) no estado de produção (base 5d659d1 = site no ar), 3 vezes seguidas, com dados.
// Confere: nenhum erro; o retrato do banco (funções, permissões, gatilhos, políticas, restrições, índices, colunas) depois da 1ª colagem
// é IGUAL ao da 3ª; os dados que já existiam não mudam; as permissões das funções novas estão fechadas para visitante.
// Uso: node colagem3x.mjs
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
import { PGlite, WT, MIG, retrato, compara } from "../leva3-final/lib.mjs";
const read = (p) => fs.readFileSync(p, "utf8");
const NOVOS = ["20261003009860_central_conferencia_e_conflitos.sql", "20261003009861_publicar_unidade_aula_aluno.sql", "20261003009862_publicar_unidade_flashcards.sql", "20261003009863_visuais_revisao_medica.sql", "20261003009864_criar_versao_para_corrigir.sql"];
const BASE = "5d659d1";
const lista = execFileSync("git", ["-C", WT, "--no-optional-locks", "ls-tree", "--name-only", BASE, "supabase/migrations/"], { encoding: "utf8" }).trim().split("\n");
const db = new PGlite();
await db.exec(read(path.join(WT, "supabase/tests/bootstrap.sql")));
for (const f of lista) await db.exec(execFileSync("git", ["-C", WT, "--no-optional-locks", "show", `${BASE}:${f}`], { encoding: "utf8", maxBuffer: 1 << 28 }));
console.log(`base ${BASE}: ${lista.length} migracoes aplicadas`);
// dados de produção simulados
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
for (const [i, e] of [[1, "adm"], [2, "ed"], [3, "rev"], [4, "alu"]]) await db.query(`insert into auth.users (id, email) values ($1,$2)`, [U(i), `${e}@exemplo.com`]);
await db.exec(`update public.user_roles set role='admin' where user_id='${U(1)}'; update public.user_roles set role='editor' where user_id='${U(2)}';
  insert into public.ch_reviewer_areas (user_id, area_code) values ('${U(3)}','PEDIATRIA');
  insert into public.lessons (id, area, topic, title, published, summary, key_points) values ('${U(900)}','PEDIATRIA','Asma','Aula antiga publicada',true,'Resumo antigo','{ponto}'), ('${U(901)}','CIRURGIA_GERAL','Hérnias','Aula antiga rascunho',false,null,'{}');
  insert into public.lesson_progress (user_id, lesson_id, seconds_watched, completed_at) values ('${U(4)}','${U(900)}',100, now());
  insert into public.flashcards (id, owner_id, area, topic, front, back) values ('${U(910)}','${U(4)}','PEDIATRIA','Asma','Frente pessoal','Verso pessoal');
  insert into public.flashcard_states (user_id, card_id, due, state, reps) values ('${U(4)}','${U(910)}', now() - interval '1 day', 2, 3);`);
// unidade já publicada pelo site antigo (sem aula): a colagem não pode quebrá-la
const [t] = (await db.query(`select n.id from public.ch_taxonomy_nodes n join public.ch_taxonomy_versions v on v.id=n.version_id where v.status='published' and n.name='Bronquiolite viral aguda'`)).rows;
const [un] = (await db.query(`insert into public.ch_units (theme_node_id, title) values ($1,'Unidade já publicada antes') returning id`, [t.id])).rows;
const [vv] = (await db.query(`insert into public.ch_unit_versions (unit_id, version, status, content, content_hash) values ($1,1,'published','{"sections": []}', 'h') returning id`, [un.id])).rows;
await db.query(`insert into public.ch_publications (unit_version_id, content_hash, published_by) values ($1,'h',$2)`, [vv.id, U(1)]);
const antes = await retrato(db);
// as 4 tabelas que ganham coluna nova: o retrato por linha inteira muda por causa da coluna nova, então a conferência dos dados usa só as colunas que já existiam
const COLS = { "public.lessons": "id, area, topic, title, published, summary, key_points, position", "public.flashcards": "id, owner_id, area, topic, front, back, published, review_status",
  "public.flashcard_states": "user_id, card_id, due, state, reps", "public.ch_publications": "id, unit_version_id, content_hash, published_at, retired_at" };
const fp = async () => Object.fromEntries(await Promise.all(Object.entries(COLS).map(async ([t, c]) => [t, (await db.query(`select count(*)::int n, coalesce(md5(string_agg(row(${c})::text, '|' order by row(${c})::text)), '') h from ${t}`)).rows[0]])));
const fpAntes = await fp();
let erros = 0;
const retratos = [];
for (const volta of [1, 2, 3]) {
  for (const f of NOVOS) {
    try { await db.exec(read(path.join(MIG, f))); } catch (e) { erros++; console.log(`  volta ${volta} ${f}: ERRO ${String(e.message).slice(0, 300)}`); }
  }
  retratos.push(await retrato(db));
  console.log(`volta ${volta}: colados ${NOVOS.length} arquivos`);
}
const SECOES = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices"];
for (const s of SECOES) {
  const c = compara(retratos[0][s], retratos[2][s]);
  if (c.novos.length || c.removidos.length || c.mudaram.length) { erros++; console.log(`  ${s}: a 3ª colagem é diferente da 1ª`, JSON.stringify(c).slice(0, 400)); }
}
console.log("1ª = 3ª colagem em", SECOES.join(", "), erros ? "COM DIFERENÇAS" : "(idênticas)");
// dados que já existiam não mudam
const A = antes.dados, Z = retratos[2].dados;
const fpDepois = await fp();
const mudou = [...Object.keys(A).filter((k) => JSON.stringify(A[k]) !== JSON.stringify(Z[k]) && !["ch_audit", "admin_audit"].includes(k) && !(("public." + k) in COLS)),
               ...Object.keys(COLS).filter((k) => JSON.stringify(fpAntes[k]) !== JSON.stringify(fpDepois[k]))];
console.log("tabelas existentes cujos dados mudaram:", mudou.length ? mudou.join(", ") : "nenhuma");
if (mudou.length) erros++;
// novidades estruturais
const nf = Object.keys(retratos[2].funcoes).filter((k) => !(k in antes.funcoes));
console.log(`funções novas: ${nf.length}; alteradas: ${compara(antes.funcoes, retratos[2].funcoes, ["def"]).mudaram.length}`);
// permissões: nenhuma função nova/alterada de app_* fica aberta para visitante (anon); ch_* internas fechadas
const q = async (s) => (await db.query(s)).rows;
const abertas = await q(`select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and p.proname in ('app_ch_publish','app_ch_publish_preview','app_ch_retire','app_ch_confirm_critical','app_ch_discard_evidence','app_ch_claim_can_confirm','app_ch_claim_evidence','app_ch_conflict_decide','app_ch_link_evidence','app_ch_visual_review','app_ch_visual_file','app_ch_visual_material','app_ch_visual_list','app_ch_new_version')
   and has_function_privilege('anon', p.oid, 'execute')`);
console.log("funções app_ch_* do grupo B abertas para visitante:", abertas.length ? abertas.map((x) => x.f).join(", ") : "nenhuma");
if (abertas.length) erros++;
const internas = await q(`select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and p.proname ~ '^(ch_distribute|ch_undistribute|ch_student_lesson|ch_distribution_plan|ch_publish_problems|ch_publish_problems_student|ch_publish_problems_base|ch_cards_plan|ch_distribute_cards|ch_hide_cards|ch_hide_card_rows|ch_version_cards|ch_claim_recompute_status|ch_evidence_settled|ch_evidence_counts|ch_claim_effective_status|ch_visual_text|ch_visual_is_clinical|ch_visual_review_pending|ch_visual_can_review|ch_worker_visual_files|lessons_central_guard)$'
   and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`);
console.log("funções internas abertas para alguém de fora:", internas.length ? internas.map((x) => x.f).join(", ") : "nenhuma");
if (internas.length) erros++;
// o que já estava no ar continua: a aula antiga, o progresso, o cartão pessoal e a unidade publicada
const ok = (await q(`select (select count(*)::int from public.lessons where id='${U(900)}' and published and origin='manual' and summary='Resumo antigo') a,
  (select count(*)::int from public.lesson_progress where user_id='${U(4)}' and completed_at is not null) b,
  (select count(*)::int from public.flashcard_states where card_id='${U(910)}' and hidden_due is null and due < now()) c,
  (select count(*)::int from public.ch_publications where unit_version_id='${vv.id}' and retired_at is null) d`))[0];
console.log("dados antigos intactos:", JSON.stringify(ok));
if (ok.a !== 1 || ok.b !== 1 || ok.c !== 1 || ok.d !== 1) erros++;
console.log(erros ? `RESULTADO RUIM (${erros})` : "OK: colagem tripla sem erro, idêntica, dados antigos intactos, permissões fechadas");
process.exit(erros ? 1 : 0);
