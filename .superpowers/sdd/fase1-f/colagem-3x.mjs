// Simulacao de colagem da migracao 9835 (suporte e relatos): banco com TODAS as migracoes anteriores (producao + leva 3), depois a 9835
// colada 3 vezes. Confere: (1) a 1a colagem so ACRESCENTA (nada existente muda); (2) a 2a e a 3a nao mudam nada (estrutura, permissoes,
// gatilhos, politicas e dados); (3) o e-mail de suporte escolhido e os relatos ja enviados sobrevivem a nova colagem.
import fs from "node:fs"; import path from "node:path";
import { PGlite, MIG, WT, retrato, compara } from "../leva3-final/lib.mjs";
const NOVA = "20261003009835_suporte_e_relatos.sql";
const todas = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
const antes = todas.filter((f) => f < NOVA);
const db = new PGlite();
await db.exec(fs.readFileSync(path.join(WT, "supabase/tests/bootstrap.sql"), "utf8"));
for (const f of antes) await db.exec(fs.readFileSync(path.join(MIG, f), "utf8"));
console.log(`base: ${antes.length} migracoes anteriores`);
const sql = fs.readFileSync(path.join(MIG, NOVA), "utf8");
let erros = 0;
const ok = (c, m) => { console.log((c ? "  ok   " : "  ERRO ") + m); if (!c) erros++; };
const R0 = await retrato(db);
await db.exec(sql); const R1 = await retrato(db);
const secoes = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices", "enums"];
for (const s of secoes) {
  const c = compara(R0[s], R1[s]);
  ok(c.removidos.length === 0 && c.mudaram.length === 0, `1a colagem, ${s}: nada existente mudou/sumiu (novos: ${c.novos.length}${c.mudaram.length ? "; MUDARAM: " + c.mudaram.join(", ") : ""})`);
}
console.log("  novos objetos:", compara(R0.funcoes, R1.funcoes).novos.join(", "), "|", compara(R0.tabelas, R1.tabelas).novos.join(", "));
const dadosMudaram = Object.keys(R0.dados).filter((t) => JSON.stringify(R0.dados[t]) !== JSON.stringify(R1.dados[t]));
ok(dadosMudaram.length === 0, `1a colagem, dados das tabelas antigas intactos${dadosMudaram.length ? " (mudaram: " + dadosMudaram.join(", ") + ")" : ""}`);
// o administrador escolhe outro e-mail e um aluno envia um relato; colar de novo nao pode desfazer isso
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-0000000000aa','adm@t.local','{}'), ('00000000-0000-4000-8000-0000000000bb','alu@t.local','{}');
  update public.user_roles set role='admin' where user_id='00000000-0000-4000-8000-0000000000aa';
  update public.support_config set email='ajuda@staziamed.com.br' where id;
  insert into public.student_reports (user_id, screen, message) values ('00000000-0000-4000-8000-0000000000bb','Simulados','Relato anterior as novas colagens.');`);
const R1b = await retrato(db);
for (const n of [2, 3]) {
  await db.exec(sql); const Rn = await retrato(db);
  for (const s of secoes) { const c = compara(R1b[s], Rn[s]); ok(c.novos.length + c.removidos.length + c.mudaram.length === 0, `${n}a colagem, ${s}: sem nenhuma mudanca`); }
  const dm = Object.keys(R1b.dados).filter((t) => JSON.stringify(R1b.dados[t]) !== JSON.stringify(Rn.dados[t]));
  ok(dm.length === 0, `${n}a colagem, dados intactos${dm.length ? " (mudaram: " + dm.join(", ") + ")" : ""}`);
  const e = (await db.query(`select email from public.support_config`)).rows;
  ok(e.length === 1 && e[0].email === "ajuda@staziamed.com.br", `${n}a colagem: o e-mail escolhido continua (${e.map((x) => x.email)})`);
  const r = (await db.query(`select count(*)::int n from public.student_reports`)).rows[0].n;
  ok(r === 1, `${n}a colagem: o relato enviado continua (${r})`);
}
// permissoes finais das funcoes novas
const priv = async (sig, role) => (await db.query(`select has_function_privilege($1, $2::regprocedure, 'execute') x`, [role, sig])).rows[0].x;
const novas = { "app_support_contact()": [true, true], "app_admin_save_support_contact(text)": [false, true], "app_report_problem(text,text)": [false, true], "app_admin_reports(text,integer,integer)": [false, true], "app_admin_report_resolve(bigint,boolean)": [false, true], "student_reports_guard()": [false, false] };
for (const [sig, [anon, auth]] of Object.entries(novas)) ok((await priv(sig, "anon")) === anon && (await priv(sig, "authenticated")) === auth, `permissao ${sig}: visitante ${anon ? "SIM" : "NAO"}, logado ${auth ? "SIM" : "NAO"}`);
const sec = (await db.query(`select p.proname, p.prosecdef, p.proconfig::text cfg from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('app_support_contact','app_admin_save_support_contact','app_report_problem','app_admin_reports','app_admin_report_resolve','student_reports_guard')`)).rows;
ok(sec.length === 6 && sec.every((x) => x.prosecdef && /search_path=\\?"\\?"/.test(x.cfg)), "as 6 funcoes: security definer e search_path vazio");
const t = (await db.query(`select c.relname, c.relrowsecurity rls, has_table_privilege('anon', c.oid,'select') a, has_table_privilege('authenticated', c.oid,'select') u, has_table_privilege('authenticated', c.oid,'update') up, has_table_privilege('authenticated', c.oid,'delete') d from pg_class c where c.oid in ('public.support_config'::regclass,'public.student_reports'::regclass) order by 1`)).rows;
ok(t.every((x) => x.rls && !x.a && !x.up && !x.d), "tabelas novas: RLS ligado; visitante nao le; ninguem do app muda nem apaga direto");
console.log(erros ? `\nFALHOU: ${erros} erro(s)` : "\nTUDO OK");
process.exit(erros ? 1 : 0);
