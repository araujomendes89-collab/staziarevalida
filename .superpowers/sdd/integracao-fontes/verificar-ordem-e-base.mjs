// Monta o estado de producao (base 23d53c1 + partes 1-7 + 9630 + 9610), guarda pg_get_functiondef, cola 9620 e 9621 duas vezes e guarda de novo.
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url"; import { execFileSync } from "node:child_process";
const [WT, PACOTE, OUT] = process.argv.slice(2);
const { PGlite } = await import(pathToFileURL(path.join(WT, "node_modules/@electric-sql/pglite/dist/index.js")).href);
const base = execFileSync("git", ["-C", WT, "--no-optional-locks", "ls-tree", "--name-only", "23d53c1", "supabase/migrations/"], { encoding: "utf8" }).trim().split("\n").map((p) => p.split("/").pop());
const db = new PGlite();
await db.exec(fs.readFileSync(path.join(WT, "supabase/tests/bootstrap.sql"), "utf8"));
for (const f of base) await db.exec(fs.readFileSync(path.join(WT, "supabase/migrations", f), "utf8"));
for (const p of fs.readdirSync(PACOTE).filter((f) => /^[1-7]-/.test(f)).sort()) await db.exec(fs.readFileSync(path.join(PACOTE, p), "utf8"));
for (const f of ["20261003009630_arena_sem_equipe.sql", "20261003009610_fontes_oficiais_ia.sql"]) await db.exec(fs.readFileSync(path.join(WT, "supabase/migrations", f), "utf8"));
const dump = async () => { const r = await db.query(`select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def, p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p') order by 1`); return Object.fromEntries(r.rows.map((x) => [x.sig, { def: x.def, acl: x.acl }])); };
fs.writeFileSync(path.join(OUT, "antes.json"), JSON.stringify(await dump()));
console.log(`producao simulada: ${base.length} base + partes 1-7 + 9630 + 9610`);
let erros = 0;
const mig = ["20261003009620_fontes_complementares.sql", "20261003009621_fontes_complementares_equipe.sql"].map((f) => [f, fs.readFileSync(path.join(WT, "supabase/migrations", f), "utf8")]);
for (const volta of [1, 2]) for (const [f, sql] of mig) { try { await db.exec(sql); console.log(`  volta ${volta} ${f}: ok`); } catch (e) { erros++; console.log(`  volta ${volta} ${f}: ERRO ${String(e.message).slice(0, 300)}`); } }
const depois1 = await dump();
fs.writeFileSync(path.join(OUT, "depois.json"), JSON.stringify(depois1));
// colar de novo as duas na ordem deve dar o mesmo estado
for (const [f, sql] of mig) await db.exec(sql);
const depois2 = await dump();
const dif = Object.keys(depois1).filter((k) => depois1[k].def !== depois2[k]?.def);
console.log("funcoes que mudam na 3a colagem:", dif.length ? dif : "nenhuma");
console.log(erros ? `RESULTADO: ${erros} ERRO(S)` : "RESULTADO: 9620 e 9621 coladas 2x sem erro");
// fumaça no estado de producao simulado
const ids = { adm: "00000000-0000-0000-0000-0000000000a1", al: "00000000-0000-0000-0000-0000000000b1" };
for (const [k, id] of Object.entries(ids)) await db.exec(`insert into auth.users (id, email) values ('${id}', '${k}@t.local') on conflict do nothing`);
await db.exec(`update public.user_roles set role = 'admin' where user_id = '${ids.adm}'`);
const as = async (uid, sql) => { await db.exec("begin"); try { await db.exec(`select set_config('request.jwt.claim.sub','${uid}',true); select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}',true); set local role authenticated`); return (await db.query(sql)).rows; } finally { await db.exec("rollback"); } };
const ck = async (nome, fn) => { try { const r = await fn(); console.log("  ok   " + nome + (r !== undefined ? ": " + r : "")); } catch (e) { erros++; console.log("  ERRO " + nome + ": " + String(e.message).slice(0, 200)); } };
await ck("app_ch_complementar_check devolve ok", async () => JSON.stringify((await as(ids.adm, "select public.app_ch_complementar_check() as r"))[0].r));
await db.exec(`insert into public.ch_sources (title, organ, kind, authority_level) values ('Sangue nos Olhos — Clínica Médica 2026', 'Editora Sangue nos Olhos', 'final', 'E')`);
await db.exec(`insert into public.lessons (area, topic, title, guideline_title, published) values ('PEDIATRIA','Asma','Asma na prática','Sangue nos Olhos — Clínica Médica 2026', true)`);
await ck("aluno nao ve a diretriz que e apostila cadastrada", async () => { const r = (await as(ids.al, "select public.app_lessons() as r"))[0].r; const t = JSON.stringify(r); if (t.includes("Sangue nos Olhos")) throw new Error("vazou"); return "escondida"; });
await ck("admin salvar texto com o titulo cadastrado e barrado", async () => { try { await as(ids.adm, `select public.app_admin_save_lesson(p_lesson => '{"area":"PEDIATRIA","topic":"Asma","title":"Asma 2","summary":"Conforme o Sangue nos Olhos — Clínica Médica 2026, suporte."}'::jsonb)`); throw new Error("passou"); } catch (e) { if (!/cita uma fonte complementar/.test(e.message)) throw e; return "barrado"; } });
await ck("admin salvar 'sangue nos olhos' e 'apostila' soltos passa", async () => { const r2 = await as(ids.adm, `select public.app_admin_save_lesson(p_lesson => '{"area":"PEDIATRIA","topic":"Olhos","title":"Olhos 3","summary":"Queixa de sangue nos olhos; veja a apostila do curso."}'::jsonb) as r`); return "passou: " + String(r2[0].r?.id ?? r2[0].r).slice(0, 8); });
await ck("audiencia e conferencia do audio das aulas: lesson_materials_json mantem review_status", async () => { const d = (await db.query("select pg_get_functiondef('public.lesson_materials_json(uuid)'::regprocedure) as d")).rows[0].d; if (!d.includes("review_status")) throw new Error("perdeu review_status"); });
console.log(erros ? `RESULTADO: ${erros} ERRO(S)` : "RESULTADO FINAL: tudo ok");
await db.close(); process.exit(erros ? 1 : 0);
