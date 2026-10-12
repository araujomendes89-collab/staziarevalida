// Fase 1 objetiva, grupo E. Estado de producao simulado = todas as migracoes de 5d659d1 (site no ar), cola 9890, 9891 e 9892 duas vezes,
// compara as funcoes na 3a colagem e lista as que mudam em relacao ao estado de antes. Uso: node verificar-colagem.mjs <worktree> <pasta-de-saida>
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url"; import { execFileSync } from "node:child_process";
const [WT, OUT] = process.argv.slice(2);
const { PGlite } = await import(pathToFileURL(path.join(WT, "node_modules/@electric-sql/pglite/dist/index.js")).href);
const base = execFileSync("git", ["-C", WT, "--no-optional-locks", "ls-tree", "--name-only", "5d659d1", "supabase/migrations/"], { encoding: "utf8" }).trim().split("\n").map((p) => p.split("/").pop());
const db = new PGlite();
await db.exec(fs.readFileSync(path.join(WT, "supabase/tests/bootstrap.sql"), "utf8"));
for (const f of base) await db.exec(fs.readFileSync(path.join(WT, "supabase/migrations", f), "utf8"));
const dump = async () => { const r = await db.query(`select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def, p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p') order by 1`); return Object.fromEntries(r.rows.map((x) => [x.sig, { def: x.def, acl: x.acl }])); };
const antes = await dump();
console.log(`producao simulada: ${base.length} migracoes de 5d659d1`);
let erros = 0;
const mig = ["20261003009890_planos_informativo_aluno.sql", "20261003009891_microfone_transcricao_estrutura.sql", "20261003009892_teto_geral_ia_mes.sql"].map((f) => [f, fs.readFileSync(path.join(WT, "supabase/migrations", f), "utf8")]);
for (const volta of [1, 2]) for (const [f, sql] of mig) { try { await db.exec(sql); console.log(`  volta ${volta} ${f}: ok`); } catch (e) { erros++; console.log(`  volta ${volta} ${f}: ERRO ${String(e.message).slice(0, 300)}`); } }
const depois1 = await dump();
for (const [f, sql] of mig) await db.exec(sql);
const depois2 = await dump();
const dif = Object.keys(depois1).filter((k) => depois1[k].def !== depois2[k]?.def || depois1[k].acl !== depois2[k]?.acl);
console.log("funcoes que mudam na 3a colagem:", dif.length ? dif : "nenhuma");
const novas = Object.keys(depois1).filter((k) => !(k in antes));
const mudadas = Object.keys(antes).filter((k) => k in depois1 && (antes[k].def !== depois1[k].def || antes[k].acl !== depois1[k].acl));
const sumidas = Object.keys(antes).filter((k) => !(k in depois1));
console.log("funcoes novas:", novas);
console.log("funcoes existentes que mudam:", mudadas);
console.log("funcoes que sumiram:", sumidas.length ? sumidas : "nenhuma");
// acesso: nenhuma funcao nova chamavel por visitante (anon), exceto as que ja eram assim
for (const sig of novas) { const r = (await db.query(`select has_function_privilege('anon', '${sig}', 'execute') a, has_function_privilege('authenticated', '${sig}', 'execute') u`)).rows[0]; console.log(`  ${sig}: anon=${r.a} logado=${r.u}`); if (r.a) { erros++; console.log("  ERRO: chamavel por visitante"); } }
fs.writeFileSync(path.join(OUT, "diferencas-funcoes.json"), JSON.stringify({ novas, mudadas }, null, 1));
// fumaca
const ids = { adm: "00000000-0000-0000-0000-0000000000a1", al: "00000000-0000-0000-0000-0000000000b1" };
for (const [k, id] of Object.entries(ids)) await db.exec(`insert into auth.users (id, email) values ('${id}', '${k}@t.local') on conflict do nothing`);
await db.exec(`update public.user_roles set role = 'admin' where user_id = '${ids.adm}'`);
const as = async (uid, sql) => { await db.exec("begin"); try { await db.exec(`select set_config('request.jwt.claim.sub','${uid}',true); select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}',true); set local role authenticated`); return (await db.query(sql)).rows; } finally { await db.exec("rollback"); } };
const ck = async (nome, fn) => { try { const r = await fn(); console.log("  ok   " + nome + (r !== undefined ? ": " + r : "")); } catch (e) { erros++; console.log("  ERRO " + nome + ": " + String(e.message).slice(0, 200)); } };
await ck("aluno ve a tela de planos (sem preco)", async () => { const r = (await as(ids.al, "select public.app_plans_info() as r"))[0].r; if (JSON.stringify(r).match(/price|billing/)) throw new Error("vazou preco"); return r.plans.length + " planos"; });
await ck("microfone dos alunos nasce so da equipe, tetos vazios", async () => { const r = (await db.query("select stt_team_only, stt_trial_daily_seconds, stt_paid_daily_seconds, stt_account_daily_seconds from public.tutor_config")).rows[0]; if (r.stt_team_only !== true || r.stt_trial_daily_seconds !== null || r.stt_paid_daily_seconds !== null || r.stt_account_daily_seconds !== null) throw new Error(JSON.stringify(r)); return "so equipe"; });
await ck("teto geral de IA nasce desligado e sem valor", async () => { const r = (await db.query("select overall_monthly_cap_usd, overall_cap_enabled from public.ai_settings")).rows[0]; if (r.overall_cap_enabled !== false || r.overall_monthly_cap_usd !== null) throw new Error(JSON.stringify(r)); return "desligado"; });
await ck("admin salva o Tutor sem mexer no microfone (chaves ausentes = mantem)", async () => { await db.exec(`select set_config('request.jwt.claims','{"sub":"${ids.adm}","role":"authenticated"}',false)`); const r = (await as(ids.adm, "select public.app_admin_tutor_save_config('{\"inside_jokes\": true}'::jsonb, 'Teste da colagem do SQL') as r"))[0].r; if (r.stt_team_only !== true) throw new Error("mudou"); return "mantido"; });
console.log(erros ? `RESULTADO: ${erros} ERRO(S)` : "RESULTADO FINAL: tudo ok");
await db.close(); process.exit(erros ? 1 : 0);
