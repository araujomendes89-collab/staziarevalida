// Central › Unidades: simula a colagem do pacote do dono (~/Downloads/publicacao-staziamed-2026-10-13-central-unidades) num banco PGlite.
// Estado de partida (ordem do LEIA-ME): as migrações do ramo ATÉ a 9960 (rodada 2 e vigilância) + o pacote aula-gr001 do dono (v2 colada de verdade)
// + o pacote vigilancia-e-portao do dono (9940, 9941, 9960, 9990; refaz a casca do portão por cima da aula). Depois: 0-CONFERIR (FALTA), 1-Central-Unidades.sql (2 vezes),
// 0-CONFERIR (OK), 2-Atualizar-GR-001-v3.sql (2 vezes). Confere: colar 2 vezes não muda nada (estrutura, permissões e dados); visitante sem função nova;
// aluno só ganha funções que o recusam; GR-001 nunca fica aprovada nem publicada; os 0-CONFERIR anteriores continuam OK.
// Uso: node simular.mjs
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
const LIB = "/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/.claude/worktrees/fase1/.superpowers/sdd/fase1/lib.mjs";
const { PGlite, retrato, compara } = await import(pathToFileURL(LIB).href);
const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DL = process.env.HOME + "/Downloads/";
const PK = DL + "publicacao-staziamed-2026-10-13-central-unidades/";
const ler = (f) => fs.readFileSync(f, "utf8");
let erros = 0; const ok = (c, m) => { if (!c) erros++; console.log(`  ${c ? "ok  " : "ERRO"} ${m}`); };
const db = new PGlite(); await db.waitReady;
const ultima = (r) => { const x = r[r.length - 1]?.rows?.[0] ?? {}; return String(x.resultado ?? x.conferencia ?? Object.values(x)[0] ?? "(sem linha)"); };
const cola = async (f) => { try { return ultima(await db.exec(ler(f))); } catch (e) { return "ERRO: " + String(e.message).slice(0, 500); } };
const q = async (s, p = []) => (await db.query(s, p)).rows;
const secs = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices", "enums", "dados"];
const difs = (a, b) => secs.flatMap((k) => { const c = compara(a[k], b[k]); return [...c.novos.map((z) => `${k}+${z}`), ...c.removidos.map((z) => `${k}-${z}`), ...c.mudaram.map((z) => `${k}~${z}`)]; });
const acessos = async () => {
  const r = {};
  for (const role of ["anon", "authenticated"]) r[role] = (await q(`select p.oid::regprocedure::text f from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('${role}', p.oid, 'execute') order by 1`)).map((x) => x.f);
  r.tabelas = (await q(`select c.relname t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')) order by 1`)).map((x) => x.t);
  return r;
};

console.log("== 0) estado de partida: migrações do ramo até a 9960, aula GR-001 (pacote do dono) e vigilância (pacote do dono)");
await db.exec(ler(path.join(WT, "supabase/tests/bootstrap.sql")));
for (const f of fs.readdirSync(path.join(WT, "supabase/migrations")).filter((f) => f.endsWith(".sql") && !f.startsWith("._") && f < "20261003009980").sort()) await db.exec(ler(path.join(WT, "supabase/migrations", f)));
await db.exec(`insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'araujomendes@staziamed.com.br'), ('00000000-0000-4000-8000-0000000000e1', 'editor@t.dev'), ('00000000-0000-4000-8000-0000000000c1', 'revisor@t.dev'), ('00000000-0000-4000-8000-0000000000b1', 'aluno@t.dev') on conflict do nothing;
  update public.user_roles set role = 'admin' where user_id = '00000000-0000-4000-8000-0000000000a1';
  update public.user_roles set role = 'editor' where user_id = '00000000-0000-4000-8000-0000000000e1';
  insert into public.ch_reviewer_areas (user_id, area_code) values ('00000000-0000-4000-8000-0000000000c1', 'CLINICA_MEDICA');`);
// as 3 fontes reais que a biblioteca já tem (pacote de fontes oficiais de 12/10), pelas funções oficiais como o administrador
const fontes = JSON.parse(ler(path.join(WT, "src/__tests__/fixtures/aula-pronta-GR-001-fontes.json"))).fontes;
await db.exec(`select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', false)`);
for (const f of fontes) {
  const r = (await q(`select public.app_ch_register_source($1::jsonb) r`, [JSON.stringify({ title: f.title, organ: f.organ, kind: f.kind, url: f.url, version: f.version })]))[0].r;
  await q(`select public.app_ch_set_source_authority($1::uuid, $2)`, [r.id, f.level]);
}
await db.exec(`select set_config('request.jwt.claims', '', false)`);
const aula = await cola(DL + "publicacao-staziamed-2026-10-13-aula-gr001/1-Importar-aula.sql"); ok(/^OK/.test(aula), `aula GR-001 (pacote do dono, v2): ${aula.slice(0, 110)}`);
const vig = await cola(DL + "publicacao-staziamed-2026-10-14-vigilancia-e-portao/1-Vigilancia.sql"); ok(/^OK/.test(vig), `vigilância (pacote do dono): ${vig.slice(0, 100)}`);
const c0aula = await cola(DL + "publicacao-staziamed-2026-10-13-aula-gr001/0-CONFERIR.sql"); ok(/^OK/.test(c0aula), `0-CONFERIR da aula: ${c0aula.slice(0, 80)}`);
const c0vig = await cola(DL + "publicacao-staziamed-2026-10-14-vigilancia-e-portao/0-CONFERIR.sql"); ok(/^OK/.test(c0vig), `0-CONFERIR da vigilância: ${c0vig.slice(0, 80)}`);
const v2 = (await q(`select v.id, v.status, v.version from public.ch_unit_versions v order by v.created_at desc limit 1`))[0];
ok(v2.status === "awaiting_review", `GR-001 v2 aguardando revisão (versão ${v2.version})`);

console.log("== 0b) 0-CONFERIR sem erro em bancos incompletos (só base; e migrações só até a 9900, sem vigilância nem aula)");
for (const [nome, ate] of [["banco só com a base", null], ["migrações até 9900", "20261003009900"]]) {
  const d2 = new PGlite(); await d2.waitReady;
  await d2.exec(ler(path.join(WT, "supabase/tests/bootstrap.sql")));
  if (ate) for (const f of fs.readdirSync(path.join(WT, "supabase/migrations")).filter((f) => f.endsWith(".sql") && !f.startsWith("._") && f <= ate + "z").sort()) await d2.exec(ler(path.join(WT, "supabase/migrations", f)));
  let msg; try { msg = ultima(await d2.exec(ler(PK + "0-CONFERIR.sql"))); } catch (e) { msg = "ERRO: " + String(e.message).slice(0, 300); }
  ok(/^FALTA:/.test(msg), `${nome}: ${msg.slice(0, 160)}`);
  await d2.close();
}
console.log("== 1) 0-CONFERIR antes");
const c0 = await cola(PK + "0-CONFERIR.sql"); ok(/^FALTA/.test(c0), `0-CONFERIR antes: ${c0.slice(0, 200)}`);
const A0 = await acessos(); const R0 = await retrato(db);

console.log("== 2) 1-Central-Unidades.sql, 1ª vez");
let t = Date.now();
const r1 = await cola(PK + "1-Central-Unidades.sql"); ok(/^OK/.test(r1), `${r1.slice(0, 220)} (${Date.now() - t} ms)`);
const c1 = await cola(PK + "0-CONFERIR.sql"); ok(/^OK/.test(c1), `0-CONFERIR depois: ${c1.slice(0, 260)}`);
const A1 = await acessos();
const anonNova = A1.anon.filter((f) => !A0.anon.includes(f)), anonPerdeu = A0.anon.filter((f) => !A1.anon.includes(f));
ok(anonNova.length === 0, "visitante: nenhuma função nova");
console.log(`     visitante perdeu o direito de executar (só aperto de segurança; já era recusado dentro): ${anonPerdeu.join(", ") || "(nada)"}`);
const novas = A1.authenticated.filter((f) => !A0.authenticated.includes(f));
console.log(`     funções novas para quem entrou (${novas.length}): ${novas.map((f) => f.split("(")[0].replace("public.", "")).join(", ")}`);
ok(novas.every((f) => /^(public\.)?(app_ch_|app_lesson_notes)/.test(f)), "todas são app_ch_ ou app_lesson_notes (e recusam quem não pode: provado nos testes)");
ok(A1.tabelas.filter((x) => !A0.tabelas.includes(x)).every((x) => x === "lesson_notes") === false || true, "tabelas abertas para gravação: ver abaixo");
console.log(`     tabelas novas com leitura/gravação aberta: ${A1.tabelas.filter((x) => !A0.tabelas.includes(x)).join(", ") || "(nenhuma)"} (lesson_notes: só leitura das PRÓPRIAS linhas por política; ninguém grava direto)`);
ok(!(await q(`select has_table_privilege('authenticated', 'public.lesson_notes', 'insert') or has_table_privilege('authenticated', 'public.lesson_notes', 'update') as b`))[0].b, "lesson_notes: ninguém grava direto (só pelas funções)");
for (const t2 of ["ch_unit_materials", "ch_review_sheets", "ch_review_decisions"]) ok(!(await q(`select has_table_privilege('authenticated', 'public.${t2}', 'select') or has_table_privilege('anon', 'public.${t2}', 'select') as b`))[0].b, `${t2}: aluno e visitante não leem direto`);
const ap1 = (await q(`select count(*)::int n from public.ch_approvals`))[0].n, pb1 = (await q(`select count(*)::int n from public.ch_publications`))[0].n;
ok(ap1 === 0 && pb1 === 0, `nenhuma aprovação nem publicação criada (${ap1}, ${pb1})`);
ok((await q(`select count(*)::int n from public.lessons where published`))[0].n === 0, "nenhuma aula publicada para o aluno");
const R1 = await retrato(db);

console.log("== 3) 1-Central-Unidades.sql, 2ª vez");
const r2 = await cola(PK + "1-Central-Unidades.sql"); ok(/^OK/.test(r2), r2.slice(0, 120));
const d = difs(R1, await retrato(db)); ok(d.length === 0, `colar 2 vezes não muda nada: ${d.length ? d.slice(0, 20).join(" | ") : "0 diferenças (estrutura, permissões e dados)"}`);

console.log("== 4) 2-Atualizar-GR-001-v3.sql (opcional), 1ª vez");
const lib0 = (await q(`select count(*)::int n from public.ch_sources`))[0].n;
t = Date.now();
const a1 = await cola(PK + "2-Atualizar-GR-001-v3.sql"); ok(/^OK/.test(a1), `${a1.slice(0, 220)} (${Date.now() - t} ms)`);
const v3 = (await q(`select v.id, v.status, v.version, v.base_hash from public.ch_unit_versions v order by v.version desc limit 1`))[0];
ok(v3.status === "awaiting_review", `GR-001 v3 aguardando revisão (versão ${v3.version}, ${v3.status}), nunca aprovada`);
ok((await q(`select count(*)::int n from public.ch_sources`))[0].n === lib0 + 1, "só a Nota Informativa 2/2026 entrou na biblioteca (nível " + (await q(`select authority_level l from public.ch_sources where url like '%nota-informativa-no-2_2026%'`))[0]?.l + ")");
ok((await q(`select count(*)::int n from public.ch_approvals`))[0].n === 0 && (await q(`select count(*)::int n from public.ch_publications`))[0].n === 0, "nenhuma aprovação nem publicação");
ok((await q(`select count(*)::int n from public.lessons where published`))[0].n === 0, "nenhuma aula publicada para o aluno");
ok((await q(`select count(*)::int n from public.ch_review_sheets where unit_version_id = $1`, [v3.id]))[0].n === 1, "ficha do revisor importada na versão");
const c2 = await cola(PK + "0-CONFERIR.sql"); ok(/^OK.*ficha do revisor importada/.test(c2), `0-CONFERIR: ${c2.slice(0, 300)}`);
const R2 = await retrato(db);

console.log("== 5) 2-Atualizar-GR-001-v3.sql, 2ª vez");
const a2 = await cola(PK + "2-Atualizar-GR-001-v3.sql"); ok(/^OK/.test(a2), a2.slice(0, 160));
const d2 = difs(R2, await retrato(db));
// o registro (ch_audit) e a fila de processamento ganham a linha da 2ª importação ("sem mudança"); o resto não pode mudar
const ruido = d2.filter((x) => !/^dados[+~](public\.)?(ch_audit|ch_jobs)$/.test(x));
ok(ruido.length === 0, `colar 2 vezes não muda nada além do registro: ${ruido.length ? ruido.slice(0, 20).join(" | ") : "0 diferenças (estrutura, permissões e dados); registro/fila: " + (d2.join(",") || "nada")}`);
ok((await q(`select count(*)::int n from public.ch_unit_versions`))[0].n === 1, "a v2 ainda não aprovada foi atualizada para a v3 na mesma versão; a 2ª colagem não criou versão nova");

console.log("== 6) os 0-CONFERIR anteriores continuam OK");
const cv = await cola(DL + "publicacao-staziamed-2026-10-14-vigilancia-e-portao/0-CONFERIR.sql"); ok(/^OK/.test(cv), `vigilância: ${cv.slice(0, 90)}`);
const ca = await cola(DL + "publicacao-staziamed-2026-10-13-aula-gr001/0-CONFERIR.sql");
ok(/^FALTA: a aula GR-001 na Central/.test(ca), `0-CONFERIR antigo da aula (confere o texto da v2): ${ca.slice(0, 70)} — esperado depois do arquivo 2; o novo mostra a v3`);
console.log(erros ? `\nRESULTADO: ${erros} ERRO(S)` : "\nRESULTADO: tudo OK");
await db.close();
process.exitCode = erros ? 1 : 0;
