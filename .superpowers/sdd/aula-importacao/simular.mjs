// Aula pronta GR-001: simula a colagem do pacote do dono na PRODUÇÃO DE HOJE (cache de ../rodada2/monta-producao-hoje.mjs) DEPOIS do
// pacote da rodada 2 (na ordem do 0-ORDEM-DE-COLAGEM.txt). Confere: 0-CONFERIR diz FALTA antes e OK depois; 1-Importar-aula.sql
// responde OK; colar 2 vezes não muda nada (estrutura e dados); aluno e visitante sem acesso novo; os 0-CONFERIR da rodada 2
// continuam OK; a aula fica aguardando revisão e o aluno não vê nada dela.
// Uso: CACHE_PROD=<prod-hoje.tar> node simular.mjs <pasta-rodada2> <pasta-aula>
import fs from "node:fs"; import path from "node:path";
import { PGlite, retrato, compara } from "../fase1/lib.mjs";
const [R2, AULA] = process.argv.slice(2);
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

console.log("== 1) pacote da rodada 2, na ordem");
const pastas = fs.readdirSync(R2).filter((d) => /^\d-/.test(d) && fs.statSync(path.join(R2, d)).isDirectory()).sort();
for (const d of pastas) {
  for (const f of fs.readdirSync(path.join(R2, d)).filter((f) => /^[1-9][-\d]*-.*\.sql$/.test(f)).sort()) {
    const r = await cola(path.join(R2, d, f));
    ok(!/^ERRO/.test(r), `${d}/${f}: ${r.slice(0, 110)}`);
  }
  const c = await cola(path.join(R2, d, "0-CONFERIR.sql"));
  ok(/^OK/.test(c), `${d}/0-CONFERIR: ${c.slice(0, 110)}`);
}

console.log("== 2) aula GR-001: antes de colar");
const conf0 = await cola(path.join(AULA, "0-CONFERIR.sql"));
ok(/^FALTA/.test(conf0), `0-CONFERIR antes: ${conf0.slice(0, 300)}`);
const A0 = await acessos();
const fontesAntes = (await q(`select count(*)::int n from public.ch_sources`))[0].n;

console.log("== 3) 1-Importar-aula.sql, 1ª vez");
let t = Date.now();
const r1 = await cola(path.join(AULA, "1-Importar-aula.sql"));
ok(/^OK: aula GR-001 importada: versão 1, aguardando revisão/.test(r1), `${r1} (${Date.now() - t} ms)`);
const conf1 = await cola(path.join(AULA, "0-CONFERIR.sql"));
ok(/^OK/.test(conf1), `0-CONFERIR depois: ${conf1}`);
const R1 = await retrato(db);
const A1 = await acessos();
ok(JSON.stringify(A1.anon) === JSON.stringify(A0.anon), "visitante: nenhuma função nova");
const novasAluno = A1.authenticated.filter((f) => !A0.authenticated.includes(f));
ok(JSON.stringify(novasAluno) === JSON.stringify(["app_ch_import_lesson_package(jsonb)"]), `funções novas para quem entrou: ${novasAluno.join(", ")} (a própria função recusa quem não é da equipe)`);
ok(JSON.stringify(A1.tabelas) === JSON.stringify(A0.tabelas), "nenhuma tabela nova aberta");
ok((await q(`select count(*)::int n from public.ch_sources`))[0].n === fontesAntes, "nenhuma fonte criada (as 3 já estavam no catálogo)");
const v = (await q(`select v.id, v.status, v.version from public.ch_unit_versions v where v.base_hash like 'aula-pronta:%'`));
ok(v.length === 1 && v[0].status === "awaiting_review", `versão importada: ${JSON.stringify(v)}`);
ok((await q(`select count(*)::int n from public.lessons where ch_unit_id is not null`))[0].n === 0 && (await q(`select count(*)::int n from public.ch_publications`))[0].n === 0, "nada publicado, nenhuma aula do aluno");
const sit = await q(`select c.status, count(*)::int n from public.ch_unit_claims uc join public.ch_claims c on c.id = uc.claim_id where uc.unit_version_id = $1 group by 1 order by 1`, [v[0].id]);
console.log(`     afirmações por situação: ${JSON.stringify(sit)}`);
console.log(`     pendências para publicar: ${(await q(`select array_length(public.ch_publish_problems($1), 1) n`, [v[0].id]))[0].n}`);
console.log(`     pedido do arquivo final: ${JSON.stringify(await q(`select step, status, document_id from public.ch_jobs where scope_key = $1`, ["import:" + v[0].id]))}`);

console.log("== 4) 1-Importar-aula.sql, 2ª vez");
t = Date.now();
const r2 = await cola(path.join(AULA, "1-Importar-aula.sql"));
ok(/^OK: aula GR-001 já estava importada \(nada mudou\)/.test(r2), `${r2} (${Date.now() - t} ms)`);
const R2r = await retrato(db);
const d = difs(R1, R2r);
ok(d.length === 0, `colar 2 vezes não muda nada: ${d.length ? d.join(" | ") : "0 diferenças (estrutura, permissões e dados de todas as tabelas)"}`);
const conf2 = await cola(path.join(AULA, "0-CONFERIR.sql"));
ok(/^OK/.test(conf2), `0-CONFERIR de novo: ${conf2.slice(0, 120)}`);

console.log("== 5) os 0-CONFERIR da rodada 2 continuam OK");
for (const d2 of pastas) { const c = await cola(path.join(R2, d2, "0-CONFERIR.sql")); ok(/^OK/.test(c), `${d2}: ${c.slice(0, 90)}`); }

console.log(erros ? `\nRESULTADO: ${erros} ERRO(S)` : "\nRESULTADO: tudo OK");
await db.close();
process.exitCode = erros ? 1 : 0;
