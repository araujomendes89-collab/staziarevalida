// Vigilância científica por tema: simula a colagem do pacote do dono na PRODUÇÃO DE HOJE (cache de ../rodada2/monta-producao-hoje.mjs)
// DEPOIS do pacote da rodada 2 e do pacote da aula GR-001 (a ordem do 0-ORDEM-DE-COLAGEM.txt e do LEIA-ME da aula). Confere:
// 0-CONFERIR diz FALTA antes e OK depois; 1-Vigilancia.sql responde OK; colar 2 vezes não muda nada (estrutura, permissões, dados);
// visitante sem função nova; o aluno só ganha funções que o recusam; os 0-CONFERIR da rodada 2 e da aula continuam OK; o dossiê da
// Tuberculose liga as 3 fontes reais da GR-001; o portão desligado não muda a lista de pendências para publicar a GR-001.
// Uso: CACHE_PROD=<prod-hoje.tar> node simular.mjs <pasta-rodada2> <pasta-aula> <pasta-vigilancia>
import fs from "node:fs"; import path from "node:path";
import { PGlite, retrato, compara } from "../fase1/lib.mjs";
const [R2, AULA, VIG] = process.argv.slice(2);
const ler = (f) => fs.readFileSync(f, "utf8");
const db = new PGlite({ loadDataDir: new Blob([fs.readFileSync(process.env.CACHE_PROD)]) }); await db.waitReady;
let erros = 0; const ok = (c, m) => { if (!c) erros++; console.log(`  ${c ? "ok  " : "ERRO"} ${m}`); };
const ultima = (r) => { const rows = r[r.length - 1]?.rows ?? []; const x = rows[0] ?? {}; return String(x.resultado ?? x.conferencia ?? Object.values(x)[0] ?? "(sem linha)"); };
const cola = async (f) => { try { return ultima(await db.exec(ler(f))); } catch (e) { return "ERRO: " + String(e.message).slice(0, 400); } };
const q = async (s, p = []) => (await db.query(s, p)).rows;
const acessos = async () => {
  const r = {};
  for (const role of ["anon", "authenticated"]) r[role] = (await q(`select p.oid::regprocedure::text f from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('${role}', p.oid, 'execute') order by 1`)).map((x) => x.f);
  r.tabelas = (await q(`select c.relname t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')) order by 1`)).map((x) => x.t);
  return r;
};
const secs = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices", "enums", "dados"];
const difs = (a, b) => secs.flatMap((k) => { const c = compara(a[k], b[k]); return [...c.novos.map((z) => `${k}+${z}`), ...c.removidos.map((z) => `${k}-${z}`), ...c.mudaram.map((z) => `${k}~${z}`)]; });

console.log("== 1) rodada 2 e aula GR-001, na ordem");
const pastas = fs.readdirSync(R2).filter((d) => /^\d-/.test(d) && fs.statSync(path.join(R2, d)).isDirectory()).sort();
for (const d of pastas) {
  for (const f of fs.readdirSync(path.join(R2, d)).filter((f) => /^[1-9][-\d]*-.*\.sql$/.test(f)).sort()) { const r = await cola(path.join(R2, d, f)); ok(!/^ERRO/.test(r), `${d}/${f}: ${r.slice(0, 90)}`); }
}
const a1 = await cola(path.join(AULA, "1-Importar-aula.sql")); ok(/^OK/.test(a1), `aula GR-001: ${a1.slice(0, 120)}`);
const versao = (await q(`select v.id from public.ch_unit_versions v where v.base_hash like 'aula-pronta:%' order by v.created_at desc limit 1`))[0]?.id;
const pend0 = (await q(`select coalesce(array_length(public.ch_publish_problems($1), 1), 0) n`, [versao]))[0].n;

console.log("== 2) vigilância: antes de colar");
const c0 = await cola(path.join(VIG, "0-CONFERIR.sql")); ok(/^FALTA/.test(c0), `0-CONFERIR antes: ${c0.slice(0, 160)}`);
const A0 = await acessos();

console.log("== 3) 1-Vigilancia.sql, 1ª vez");
let t = Date.now();
const r1 = await cola(path.join(VIG, "1-Vigilancia.sql")); ok(/^OK/.test(r1), `${r1} (${Date.now() - t} ms)`);
const c1 = await cola(path.join(VIG, "0-CONFERIR.sql")); ok(/^OK/.test(c1), `0-CONFERIR depois: ${c1}`);
const A1 = await acessos();
ok(JSON.stringify(A1.anon) === JSON.stringify(A0.anon), "visitante: nenhuma função nova");
const novas = A1.authenticated.filter((f) => !A0.authenticated.includes(f));
ok(novas.every((f) => /^(app_admin_|app_ch_import_lesson_package|app_ch_publish_preview)/.test(f)), `funções novas para quem entrou (todas recusam quem não é da equipe): ${novas.join(", ")}`);
ok(JSON.stringify(A1.tabelas) === JSON.stringify(A0.tabelas), "nenhuma tabela nova aberta para gravar");
const tb = await q(`select s.title, t.role from public.ch_topic_sources t join public.ch_topic_dossiers d on d.theme_node_id = t.theme_node_id join public.ch_taxonomy_nodes n on n.id = d.theme_node_id join public.ch_sources s on s.id = t.source_id where n.name = 'Tuberculose' order by s.title`);
ok(tb.length === 3, `dossiê Tuberculose: ${tb.map((x) => x.title.slice(0, 40) + " (" + x.role + ")").join(" | ")}`);
const pn = await q(`select count(*)::int n from public.ch_topic_sources t join public.ch_taxonomy_nodes n on n.id = t.theme_node_id where public.fold_text(n.name) = 'rotina do pre-natal de risco habitual'`);
console.log(`     dossiê pré-natal: ${pn[0].n} fontes ligadas (as que a biblioteca tem pelo link oficial)`);
const w = await q(`select interval_days, count(*)::int n from public.ch_source_watch group by 1 order by 1`);
console.log(`     vigiadas por frequência: ${JSON.stringify(w)}; fora da lista: ${(await q(`select count(*)::int n from public.ch_source_watch where domain_id is null`))[0].n}`);
console.log(`     com DOI: ${(await q(`select count(*)::int n from public.ch_sources where doi is not null`))[0].n}; itens na fila: ${JSON.stringify(await q(`select kind, count(*)::int n from public.ch_vigilance_items group by 1 order by 1`))}`);
console.log(`     GR-001: ${JSON.stringify(await q(`select public.ch_topic_gate(u.theme_node_id) g from public.ch_unit_versions v join public.ch_units u on u.id = v.unit_id where v.id = $1`, [versao]))}`);
const pend1 = (await q(`select coalesce(array_length(public.ch_publish_problems($1), 1), 0) n`, [versao]))[0].n;
ok(pend1 === pend0, `portão desligado: pendências para publicar a GR-001 iguais (${pend0} → ${pend1})`);
const R1 = await retrato(db);

console.log("== 4) 1-Vigilancia.sql, 2ª vez");
const r2 = await cola(path.join(VIG, "1-Vigilancia.sql")); ok(/^OK/.test(r2), r2);
const d = difs(R1, await retrato(db));
ok(d.length === 0, `colar 2 vezes não muda nada: ${d.length ? d.slice(0, 20).join(" | ") : "0 diferenças (estrutura, permissões e dados)"}`);

console.log("== 5) os 0-CONFERIR anteriores continuam OK");
for (const d2 of pastas) { const c = await cola(path.join(R2, d2, "0-CONFERIR.sql")); ok(/^OK/.test(c), `${d2}: ${c.slice(0, 90)}`); }
const ca = await cola(path.join(AULA, "0-CONFERIR.sql")); ok(/^OK/.test(ca), `aula GR-001: ${ca.slice(0, 100)}`);
const a2 = await cola(path.join(AULA, "1-Importar-aula.sql")); ok(/^OK/.test(a2), `aula GR-001 colada de novo (casca do portão): ${a2.slice(0, 100)}`);

const casca = async () => (await q(`select position('_antes_tema' in prosrc) > 0 c from pg_proc where oid = to_regprocedure('public.app_ch_import_lesson_package(jsonb)')`))[0].c;
console.log(`     depois de recolar o pacote da aula: portão na importação = ${await casca()} (a aula recria a função dela)`);
const r3 = await cola(path.join(VIG, "1-Vigilancia.sql")); ok(/^OK/.test(r3), `1-Vigilancia.sql de novo depois da aula: ${r3}`);
ok(await casca(), "portão de volta na importação de aula");
const a3 = await cola(path.join(AULA, "0-CONFERIR.sql")); ok(/^OK/.test(a3), `aula GR-001 continua OK: ${a3.slice(0, 80)}`);
const c3 = await cola(path.join(VIG, "0-CONFERIR.sql")); ok(/^OK/.test(c3), `0-CONFERIR da vigilância: ${c3.slice(0, 80)}`);

console.log(erros ? `\nRESULTADO: ${erros} ERRO(S)` : "\nRESULTADO: tudo OK");
await db.close();
process.exitCode = erros ? 1 : 0;
