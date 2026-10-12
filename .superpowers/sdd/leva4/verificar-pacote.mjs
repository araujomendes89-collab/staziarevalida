// Prova do PACOTE da leva 4 (os arquivos que o dono vai colar): estado de produção simulado (leva 3 já colada, "storage" de mentira e dados de
// exemplo), roda a conferência 0, cola as partes 1-4 DUAS vezes, confere cada "select OK" final (tudo true), roda a conferência 0 de novo
// (só lê) e compara com a colagem direta das migrações. Uso: node verificar-pacote.mjs <pasta-do-pacote>
import fs from "node:fs"; import path from "node:path";
import { montaProducao, retrato, compara, sqlLeva } from "./lib.mjs";
const PAC = process.argv[2]; const rd = (f) => fs.readFileSync(path.join(PAC, f), "utf8");
const partes = fs.readdirSync(PAC).filter((f) => /^[1-4]-colar-ANTES/.test(f)).sort();
if (partes.length !== 4) throw new Error("esperava 4 partes, achei " + partes.length);
async function montaComDados() {
  const db = await montaProducao();
  await db.exec(`create schema if not exists storage; create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, created_at timestamptz default now(), metadata jsonb);`);
  const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const nomes = ["adm", "ed", "revPed", "revCir", "alu", "vencido", "pro", "semAss"];
  for (let i = 0; i < nomes.length; i++) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,'{}')`, [U(i + 1), `${nomes[i]}@exemplo.com`]);
  await db.exec(`update public.user_roles set role='admin' where user_id='${U(1)}'; update public.user_roles set role='editor' where user_id='${U(2)}';
    insert into public.ch_reviewer_areas (user_id, area_code) values ('${U(3)}','PEDIATRIA'), ('${U(4)}','CIRURGIA');
    update public.subscriptions set plan='trial', status='trialing', trial_ends_at=now()+interval '3 days' where user_id='${U(5)}';
    update public.subscriptions set trial_ends_at=now()-interval '1 day' where user_id='${U(6)}';
    update public.subscriptions set plan='pro', status='active', trial_ends_at=null, current_period_end=now()+interval '20 days' where user_id='${U(7)}';
    delete from public.subscriptions where user_id='${U(8)}';
    insert into public.ai_providers (id, enabled) values ('anthropic', true) on conflict (id) do update set enabled = true;`);
  // rascunhos antigos (como os 200 do gerador antigo): citam apostila
  for (let i = 1; i <= 6; i++) await db.query(`insert into public.draft_questions (batch, source_id, slot, area, stem, alternatives, correct_answer, explanation, alternative_explanations, source_citations, clinical_decision, content_hash, model, status)
    values ('simulado_preditivo_2026_2_001', $1, $2, $3, $4, '{"A":"a","B":"b","C":"c","D":"d"}'::jsonb, 'A', 'Explicação.', '{}'::jsonb, '[{"source_file":"Apostila.pdf","supported_claim":"x"}]'::jsonb, 'Tratar.', $5, 'gpt-5.6-luna', $6)`,
    [`q${i}`, i, i % 2 ? "PEDIATRIA" : "CIRURGIA", `Enunciado de exemplo número ${i} com texto suficiente para o rascunho.`, `h${i}`, i === 1 ? "approved" : "awaiting_medical_review"]);
  await db.exec(`insert into public.ch_sources (title, organ, kind, status, version, published_on, authority_level) values ('PCDT de exemplo', 'Ministério da Saúde', 'final', 'current', '2026', '2026-01-01', 'A');
    insert into public.ch_source_passages (source_id, section, page, text) select id, 'Tratamento', 3, 'Texto do trecho oficial de exemplo.' from public.ch_sources where title = 'PCDT de exemplo';`);
  return db;
}
let erros = 0;
const db = await montaComDados();
console.log("== 0-CONFERIR (antes de colar)");
const conf = (await db.query(rd("0-CONFERIR-primeiro-nao-altera-nada.sql"))).rows;
for (const r of conf) console.log("  ", [r.conferencia.slice(0, 80), r.detalhe_1, r.detalhe_2, r.detalhe_3, r.detalhe_4, r.detalhe_5].filter((x) => x != null).join(" | ").slice(0, 300));
if (conf.some((r) => /FALTA/.test(String(r.detalhe_1)))) { erros++; console.log("  ERRO pre-requisito faltando"); }
const antes = await retrato(db);
console.log("== partes 1-4, duas voltas");
for (const volta of [1, 2]) for (const f of partes) {
  let res;
  try { res = await db.exec(rd(f)); } catch (e) { erros++; console.log(`  volta ${volta} ${f}: ERRO ${String(e.message).slice(0, 250)}`); continue; }
  const last = res[res.length - 1]?.rows?.[0] ?? {};
  const falsos = Object.entries(last).filter(([k, v]) => k !== "resultado" && v !== true).map(([k, v]) => `${k}=${v}`);
  if (!/^OK: /.test(last.resultado ?? "") || falsos.length) { erros++; console.log(`  volta ${volta} ${f}: RESULTADO RUIM`, JSON.stringify(last).slice(0, 500)); }
  else console.log(`  volta ${volta} ${f}: ${last.resultado} (${Object.keys(last).length - 1} conferencias, todas true)`);
}
console.log("== 0-CONFERIR depois (so le; deve rodar e dizer que a leva ja foi colada)");
const conf2 = (await db.query(rd("0-CONFERIR-primeiro-nao-altera-nada.sql"))).rows;
console.log("  'já foi colada':", conf2.find((r) => /Esta leva já foi colada/.test(r.conferencia))?.detalhe_1);
const depois = await retrato(db);
const contagens = Object.keys(antes.dados).filter((t) => antes.dados[t].n !== depois.dados[t]?.n).map((t) => `${t}: ${antes.dados[t].n} -> ${depois.dados[t]?.n}`);
console.log("  tabelas EXISTENTES cujo NÚMERO de linhas mudou com a colagem (esperado: exams +1 e a trilha dos rascunhos):", contagens.length ? contagens.join("; ") : "nenhuma");
const viaPacote = depois;
const db2 = await montaComDados(); for (const s of sqlLeva()) await db2.exec(s);
const viaMig = await retrato(db2);
const dif = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices"].flatMap((k) => { const c = compara(viaMig[k], viaPacote[k]); return [...c.novos, ...c.removidos, ...c.mudaram].map((x) => k + ":" + x); });
console.log("  pacote x migracoes coladas direto (9800, 9801, 9810, 9820, 9830):", dif.length ? "DIFERE " + dif.slice(0, 8).join(", ") : "mesma estrutura (funcoes, gatilhos, politicas, permissoes)");
if (dif.length) erros++;
console.log(erros ? `RESULTADO: ${erros} PROBLEMA(S)` : "RESULTADO FINAL: pacote cola 2x sem erro, todas as conferencias deram true");
await db.close(); await db2.close(); process.exit(erros ? 1 : 0);
