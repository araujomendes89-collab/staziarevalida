// Monta o estado de producao simulado (base 23d53c1 + partes 1-7 do pacote + 9630 + 9610 + 9620 + 9621), guarda as funcoes, cola 9720 e 9721 duas vezes e compara.
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url"; import { execFileSync } from "node:child_process";
const [WT, PACOTE, OUT] = process.argv.slice(2);
const { PGlite } = await import(pathToFileURL(path.join(WT, "node_modules/@electric-sql/pglite/dist/index.js")).href);
const base = execFileSync("git", ["-C", WT, "--no-optional-locks", "ls-tree", "--name-only", "23d53c1", "supabase/migrations/"], { encoding: "utf8" }).trim().split("\n").map((p) => p.split("/").pop());
const db = new PGlite();
await db.exec(fs.readFileSync(path.join(WT, "supabase/tests/bootstrap.sql"), "utf8"));
for (const f of base) await db.exec(fs.readFileSync(path.join(WT, "supabase/migrations", f), "utf8"));
for (const p of fs.readdirSync(PACOTE).filter((f) => /^[1-7]-/.test(f)).sort()) await db.exec(fs.readFileSync(path.join(PACOTE, p), "utf8"));
for (const f of ["20261003009630_arena_sem_equipe.sql", "20261003009610_fontes_oficiais_ia.sql", "20261003009620_fontes_complementares.sql", "20261003009621_fontes_complementares_equipe.sql"]) await db.exec(fs.readFileSync(path.join(WT, "supabase/migrations", f), "utf8"));
const dump = async () => { const r = await db.query(`select p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def, p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p') order by 1`); return Object.fromEntries(r.rows.map((x) => [x.sig, { def: x.def, acl: x.acl }])); };
const antes = await dump();
fs.writeFileSync(path.join(OUT, "antes.json"), JSON.stringify(antes));
console.log(`producao simulada: ${base.length} base + partes 1-7 + 9630 + 9610 + 9620 + 9621`);
let erros = 0;
const mig = ["20261003009720_podcasts_aprovacao_revisor.sql", "20261003009721_podcasts_arquivos_esquecidos.sql"].map((f) => [f, fs.readFileSync(path.join(WT, "supabase/migrations", f), "utf8")]);
for (const volta of [1, 2]) for (const [f, sql] of mig) { try { await db.exec(sql); console.log(`  volta ${volta} ${f}: ok`); } catch (e) { erros++; console.log(`  volta ${volta} ${f}: ERRO ${String(e.message).slice(0, 300)}`); } }
const d1 = await dump();
fs.writeFileSync(path.join(OUT, "depois.json"), JSON.stringify(d1));
for (const [f, sql] of mig) await db.exec(sql);
const d2 = await dump();
const dif3 = Object.keys(d1).filter((k) => d1[k].def !== d2[k]?.def || d1[k].acl !== d2[k]?.acl);
console.log("funcoes que mudam na 3a colagem:", dif3.length ? dif3 : "nenhuma");
const novas = Object.keys(d1).filter((k) => !antes[k]);
const mudadas = Object.keys(d1).filter((k) => antes[k] && (antes[k].def !== d1[k].def || antes[k].acl !== d1[k].acl));
const sumidas = Object.keys(antes).filter((k) => !d1[k]);
console.log("funcoes NOVAS:", novas);
console.log("funcoes que MUDAM (existiam em producao):", mudadas);
console.log("funcoes que SUMIRAM:", sumidas.length ? sumidas : "nenhuma");
// as funcoes existentes que mudam: a interna da aprovacao (9720) e app_admin_delete_podcast (9721, so a lista de caminhos); permissao igual
const esperadas = ["ch_raw_app_admin_podcast_approve(uuid,text)", "app_admin_delete_podcast(uuid)"].sort();
if (JSON.stringify([...mudadas].sort()) !== JSON.stringify(esperadas)) { erros++; console.log("  ERRO funcoes que mudam diferem do esperado:", mudadas); }
for (const k of mudadas) if (antes[k].acl !== d1[k].acl) { erros++; console.log("  ERRO permissao mudou:", k); }
// a unica funcao existente que muda deve ser a interna da aprovacao; o invólucro da 9620 fica identico
console.log("invólucro app_admin_podcast_approve identico:", antes["app_admin_podcast_approve(uuid,text)"].def === d1["app_admin_podcast_approve(uuid,text)"].def);
// permissoes: nenhuma funcao nova chamavel por anon; internas fechadas a authenticated
const acl = async (sig) => (await db.query(`select has_function_privilege('anon', $1::regprocedure, 'execute') as anon, has_function_privilege('authenticated', $1::regprocedure, 'execute') as auth, has_function_privilege('public', $1::regprocedure, 'execute') as pub`, [sig])).rows[0];
for (const sig of novas.concat(["ch_raw_app_admin_podcast_approve(uuid,text)"])) { const a = await acl(sig); const esperadoAuth = sig.startsWith("app_admin_podcast_approval"); const ok = !a.anon && !a.pub && a.auth === esperadoAuth; if (!ok) erros++; console.log(`  ${ok ? "ok  " : "ERRO"} ${sig} anon=${a.anon} authenticated=${a.auth} public=${a.pub}`); }
// triggers presentes uma vez cada
const trg = (await db.query(`select tgname, count(*)::int n from pg_trigger where tgname like 'podcast_files_%' and not tgisinternal group by 1 order by 1`)).rows;
console.log("gatilhos:", JSON.stringify(trg)); if (trg.length !== 7 || trg.some((t) => t.n !== 1)) erros++;
// fumaca no estado de producao simulado
const ids = { adm: "00000000-0000-0000-0000-0000000000a1", ed: "00000000-0000-0000-0000-0000000000a2", rev: "00000000-0000-0000-0000-0000000000a3", al: "00000000-0000-0000-0000-0000000000b1" };
for (const [k, id] of Object.entries(ids)) await db.exec(`insert into auth.users (id, email) values ('${id}', '${k}@t.local') on conflict do nothing`);
await db.exec(`update public.user_roles set role = 'admin' where user_id = '${ids.adm}'; update public.user_roles set role = 'editor' where user_id in ('${ids.ed}', '${ids.rev}'); insert into public.ch_reviewer_areas (user_id, area_code) values ('${ids.rev}', 'PEDIATRIA')`);
const as = async (uid, sql) => { await db.exec("begin"); try { await db.exec(`select set_config('request.jwt.claim.sub','${uid}',true); select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}',true); set local role authenticated`); return (await db.query(sql)).rows; } finally { await db.exec("rollback"); } };
const asCommit = async (uid, sql) => { await db.exec("begin"); try { await db.exec(`select set_config('request.jwt.claim.sub','${uid}',true); select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}',true); set local role authenticated`); const r = (await db.query(sql)).rows; await db.exec("commit"); return r; } catch (e) { await db.exec("rollback"); throw e; } };
const ck = async (nome, fn) => { try { const r = await fn(); console.log("  ok   " + nome + (r !== undefined ? ": " + r : "")); } catch (e) { erros++; console.log("  ERRO " + nome + ": " + String(e.message).slice(0, 200)); } };
let pid;
await ck("editor cria episodio de Pediatria e edita o roteiro", async () => { pid = (await asCommit(ids.ed, `select (public.app_admin_save_podcast('{"title":"Asma em 5 min","topic":"Asma","area":"PEDIATRIA","target_minutes":5}'::jsonb)->>'id') as id`))[0].id; await asCommit(ids.ed, `select public.app_admin_podcast_save_script('${pid}', '{"lines":[{"speaker":"ANA","text":"Oi, vamos falar de asma.","sources":[]},{"speaker":"BRUNO","text":"Vamos nessa.","sources":[]}],"missing":[]}'::jsonb)`); });
await ck("editor comum NAO aprova", async () => { try { await as(ids.ed, `select public.app_admin_podcast_approve('${pid}', 'Conferi o roteiro inteiro.')`); throw new Error("passou"); } catch (e) { if (!/Só o administrador ou o revisor médico/.test(e.message)) throw e; return "barrado"; } });
await ck("revisora de Pediatria (editora) aprova", async () => (await as(ids.rev, `select (public.app_admin_podcast_approve('${pid}', 'Conferi o roteiro inteiro.')->>'status') as s`))[0].s);
await ck("tela pergunta: editor nao, revisora sim", async () => JSON.stringify([(await as(ids.ed, `select public.app_admin_podcast_approval('${pid}') as r`))[0].r.can_approve, (await as(ids.rev, `select public.app_admin_podcast_approval('${pid}') as r`))[0].r.can_approve]));
await ck("aluno nao chama a pergunta", async () => { try { await as(ids.al, `select public.app_admin_podcast_approval('${pid}')`); throw new Error("passou"); } catch (e) { if (!/Acesso restrito/.test(e.message)) throw e; return "barrado"; } });
await ck("audio invalidado entra na fila", async () => { await db.exec(`update public.podcasts set audio_path = 'podcasts/${pid}/audio-teste00000000.mp3', status = 'audio_ready' where id = '${pid}'`); await asCommit(ids.ed, `select public.app_admin_podcast_save_script('${pid}', '{"lines":[{"speaker":"ANA","text":"Oi, vamos falar de asma.","sources":[]},{"speaker":"BRUNO","text":"Vamos mesmo.","sources":[]}],"missing":[]}'::jsonb)`); const r = (await db.query(`select storage_path, status, reason from public.podcast_files_released where podcast_id = '${pid}'`)).rows; if (r.length !== 1 || r[0].status !== "pendente") throw new Error(JSON.stringify(r)); return r[0].reason; });
await ck("reserva: o caminho reservado recusa referencia nova e a confirmacao libera", async () => {
  const [r] = JSON.parse(JSON.stringify((await db.query(`select public.ch_worker_podcast_files_pending('${ids.ed}', null) as r`)).rows[0].r));
  if (!r || r.status === "mantido") throw new Error("nada reservado");
  const st = (await db.query(`select status from public.podcast_files_released where id = ${r.id}`)).rows[0].status; if (st !== "apagando") throw new Error("estado " + st);
  try { await db.exec(`insert into public.ch_file_holds (storage_path) values ('${r.path}')`); throw new Error("aceitou"); } catch (e) { if (!/está sendo apagado do depósito agora/.test(e.message)) throw e; }
  const n = (await db.query(`select public.ch_worker_podcast_files_done('${ids.ed}', '[{"id": ${r.id}, "ok": true}]'::jsonb) as n`)).rows[0].n;
  const n2 = (await db.query(`select public.ch_worker_podcast_files_done('${ids.ed}', '[{"id": ${r.id}, "ok": true}]'::jsonb) as n`)).rows[0].n;
  const reg = (await db.query(`select count(*)::int n from public.admin_audit_log where action = 'podcast.files.cleanup' and target = '${pid}'`)).rows[0].n;
  if (n !== 1 || n2 !== 0 || reg !== 1) throw new Error(JSON.stringify({ n, n2, reg }));
  return "reservou, recusou, confirmou 1x";
});
console.log(erros ? `RESULTADO: ${erros} ERRO(S)` : "RESULTADO FINAL: tudo ok");
await db.close(); process.exit(erros ? 1 : 0);
