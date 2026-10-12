// Prova do PACOTE (os arquivos que o dono vai colar): estado de producao simulado (+ dados de exemplo), roda a conferencia 0, cola as partes 1-5
// TRES vezes e confere cada "select OK" final (tudo true); compara com a colagem direta das migracoes e confere que dados antigos nao mudam.
// Uso: node verificar-pacote.mjs <pasta-do-pacote>
import fs from "node:fs"; import path from "node:path";
import { montaProducao, retrato, compara, sqlLeva } from "./lib.mjs";
const PAC = process.argv[2]; const rd = (f) => fs.readFileSync(path.join(PAC, f), "utf8");
const partes = fs.readdirSync(PAC).filter((f) => /^[1-5]-colar-ANTES/.test(f)).sort();
if (partes.length !== 5) throw new Error("esperava 5 partes, achei " + partes.length);
async function montaComDados() {
  const db = await montaProducao();
  const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const nomes = ["adm", "ed", "revPed", "revCir", "alu", "vencido", "pro", "elite", "semAss"];
  for (let i = 0; i < nomes.length; i++) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,'{}')`, [U(i + 1), `${nomes[i]}@exemplo.com`]);
  await db.exec(`update public.user_roles set role='admin' where user_id='${U(1)}'; update public.user_roles set role='editor' where user_id='${U(2)}';
    insert into public.ch_reviewer_areas (user_id, area_code) values ('${U(3)}','PEDIATRIA'), ('${U(4)}','CIRURGIA');
    update public.subscriptions set plan='trial', status='trialing', trial_ends_at=now()+interval '3 days' where user_id='${U(5)}';
    update public.subscriptions set trial_ends_at=now()-interval '1 day' where user_id='${U(6)}';
    update public.subscriptions set plan='pro', status='active', trial_ends_at=null, current_period_end=now()+interval '20 days' where user_id='${U(7)}';
    update public.subscriptions set plan='elite', status='active', trial_ends_at=null, current_period_end=now()+interval '20 days' where user_id='${U(8)}';
    delete from public.subscriptions where user_id='${U(9)}';
    update public.tutor_config set enabled=true, requires_pro=true;`);
  await db.exec(`insert into public.ch_documents (owner_id, name, sha256, status) values ('${U(2)}','Doc do editor',repeat('a',64),'awaiting_review'), ('${U(1)}','Doc do admin',repeat('b',64),'received');
    insert into public.lessons (id, area, topic, title, published, video_url) values ('00000000-0000-4000-8000-0000000000a1','PEDIATRIA','Asma','Asma yt',true,'https://youtu.be/abc');
    insert into public.ch_flags (key, value) values ('shadow_mode', true) on conflict (key) do update set value = true;`);
  return db;
}
let erros = 0;
const db = await montaComDados();
console.log("== 0-CONFERIR (antes de colar)");
const conf = (await db.query(rd("0-CONFERIR-primeiro-nao-altera-nada.sql"))).rows;
for (const r of conf) console.log("  ", [r.conferencia.slice(0, 80), r.detalhe_1, r.detalhe_2, r.detalhe_3, r.detalhe_4, r.detalhe_5].filter((x) => x != null).join(" | ").slice(0, 300));
const faltas = conf.filter((r) => /FALTA/.test(String(r.detalhe_1))); if (faltas.length) { erros++; console.log("  ERRO pre-requisito faltando"); }
const antesDados = JSON.stringify((await retrato(db)).dados);
// tabelas que GANHAM colunas na leva 5: o resumo (md5) delas muda so por causa da coluna nova; confiro linha a linha SEM as colunas novas
const COM_COLUNA_NOVA = ["lessons", "ai_settings", "tutor_config", "ch_taxonomy_nodes", "ch_evidence", "ch_publications", "ch_visual_versions", "flashcards", "flashcard_states"];
const linhas = async (t) => (await db.query(`select to_jsonb(x) as j from public.${t} x order by x::text`)).rows.map((r) => r.j);
const colunasDe = async (t) => (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [t])).rows.map((r) => r.column_name);
const antesLinhas = {}; for (const t of COM_COLUNA_NOVA) antesLinhas[t] = { cols: await colunasDe(t), rows: await linhas(t) };
console.log("== partes 1-5, tres voltas");
for (const volta of [1, 2, 3]) for (const f of partes) {
  let res;
  try { res = await db.exec(rd(f)); } catch (e) { erros++; console.log(`  volta ${volta} ${f}: ERRO ${String(e.message).slice(0, 250)}`); continue; }
  const last = res[res.length - 1]?.rows?.[0] ?? {};
  const falsos = Object.entries(last).filter(([k, v]) => k !== "resultado" && v !== true).map(([k, v]) => `${k}=${v}`);
  if (!/^OK: /.test(last.resultado ?? "") || falsos.length) { erros++; console.log(`  volta ${volta} ${f}: RESULTADO RUIM`, JSON.stringify(last).slice(0, 600)); }
  else console.log(`  volta ${volta} ${f}: ${last.resultado} (${Object.keys(last).length - 1} conferencias, todas true)`);
}
console.log("== 0-CONFERIR depois (so le; deve rodar igual e nao mudar dados)");
const conf2 = (await db.query(rd("0-CONFERIR-primeiro-nao-altera-nada.sql"))).rows;
console.log("  linhas antes/depois:", conf.length, conf2.length, "| 'ja foi colada':", conf2.find((r) => /^1\. Esta leva/.test(r.conferencia))?.detalhe_1);
const Z = JSON.parse(JSON.stringify((await retrato(db)).dados)), A = JSON.parse(antesDados);
// tabelas EXISTENTES cujos dados mudaram (as novas nao contam; ch_flags/ai_settings/tutor_config/support_config sao esperadas nao mudar)
let mudou = Object.keys(A).filter((t) => !COM_COLUNA_NOVA.includes(t) && JSON.stringify(A[t]) !== JSON.stringify(Z[t]));
for (const t of COM_COLUNA_NOVA) {
  const depois = await linhas(t); const velhas = antesLinhas[t].cols;
  const semNovas = depois.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => velhas.includes(k))));
  const ordena = (a) => a.map((r) => JSON.stringify(Object.fromEntries(Object.entries(r).sort()))).sort();
  if (JSON.stringify(ordena(semNovas)) !== JSON.stringify(ordena(antesLinhas[t].rows))) mudou.push(t + " (linhas antigas mudaram)");
  else console.log(`  ${t}: ${antesLinhas[t].rows.length} linha(s) antiga(s) intactas (colunas novas: ${(await colunasDe(t)).filter((c) => !velhas.includes(c)).join(", ") || "nenhuma"})`);
}
console.log("  tabelas EXISTENTES cujos dados mudaram com a colagem:", mudou.length ? mudou.join(", ") : "nenhuma");
if (mudou.length) erros++;
const viaPacote = await retrato(db);
const db2 = await montaComDados(); for (const s of sqlLeva()) await db2.exec(s);
const viaMig = await retrato(db2);
const dif = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices"].flatMap((k) => { const c = compara(viaMig[k], viaPacote[k]); return [...c.novos, ...c.removidos, ...c.mudaram].map((x) => k + ":" + x); });
console.log("  pacote x migracoes coladas direto:", dif.length ? "DIFERE " + dif.slice(0, 8).join(", ") : "mesma estrutura (funcoes, gatilhos, politicas, permissoes)");
if (dif.length) erros++;
console.log(erros ? `RESULTADO: ${erros} PROBLEMA(S)` : "RESULTADO FINAL: pacote cola 3x sem erro, todas as conferencias deram true");
await db.close(); await db2.close(); process.exit(erros ? 1 : 0);
