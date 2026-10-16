// Prova do PACOTE (os arquivos que o dono vai colar): estado de producao simulado (+ esquema "storage" de mentira + dados de exemplo),
// roda a conferencia 0, cola as partes 1-4 DUAS vezes e confere cada "select OK" final (tudo true); compara com a colagem direta das migracoes.
// Uso: node verificar-pacote.mjs <pasta-do-pacote>
import fs from "node:fs"; import path from "node:path";
import { montaProducao, retrato, compara, sqlLeva } from "./lib.mjs";
const PAC = process.argv[2]; const rd = (f) => fs.readFileSync(path.join(PAC, f), "utf8");
const partes = fs.readdirSync(PAC).filter((f) => /^[1-4]-colar-ANTES/.test(f)).sort();
if (partes.length !== 4) throw new Error("esperava 4 partes, achei " + partes.length);
async function montaComDados() {
  const db = await montaProducao();
  await db.exec(`create schema if not exists storage;
    create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, created_at timestamptz default now(), metadata jsonb);`);
  const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const nomes = ["adm", "ed", "revPed", "revCir", "alu", "vencido", "pro", "elite", "proVencido", "semAss", "naoCobra"];
  for (let i = 0; i < nomes.length; i++) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,'{}')`, [U(i + 1), `${nomes[i]}@exemplo.com`]);
  await db.exec(`update public.user_roles set role='admin' where user_id='${U(1)}'; update public.user_roles set role='editor' where user_id='${U(2)}';
    insert into public.ch_reviewer_areas (user_id, area_code) values ('${U(3)}','PEDIATRIA'), ('${U(4)}','CIRURGIA');
    update public.subscriptions set plan='trial', status='trialing', trial_ends_at=now()+interval '3 days' where user_id='${U(5)}';
    update public.subscriptions set trial_ends_at=now()-interval '1 day' where user_id='${U(6)}';
    update public.subscriptions set plan='pro', status='active', trial_ends_at=null, current_period_end=now()+interval '20 days' where user_id='${U(7)}';
    update public.subscriptions set plan='elite', status='active', trial_ends_at=null, current_period_end=now()+interval '20 days' where user_id='${U(8)}';
    update public.subscriptions set plan='pro', status='active', trial_ends_at=null, current_period_end=now()-interval '2 days' where user_id='${U(9)}';
    delete from public.subscriptions where user_id='${U(10)}';
    update public.tutor_config set enabled=true, requires_pro=true;`);
  await db.exec(`insert into public.lessons (id, area, topic, title, published, video_url) values
      ('00000000-0000-4000-8000-0000000000a1','PEDIATRIA','Asma','Asma yt',true,'https://youtu.be/abc'),
      ('00000000-0000-4000-8000-0000000000a2','PEDIATRIA','Asma','Asma hls',true,'https://cdn.exemplo.com/aula/index.m3u8'),
      ('00000000-0000-4000-8000-0000000000a3','PEDIATRIA','Asma','Asma sem video',true,null),
      ('00000000-0000-4000-8000-0000000000a4','PEDIATRIA','Asma','Asma mp4',true,'https://cdn.exemplo.com/a.mp4');
    insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ('00000000-0000-4000-8000-0000000000a1','slides','s','lessons/00000000-0000-4000-8000-0000000000a1/slides-1111111111111111.pdf');
    insert into public.lesson_materials (lesson_id, kind, title, url) values ('00000000-0000-4000-8000-0000000000a1','guideline','g','https://exemplo.com/diretriz');
    insert into storage.objects (bucket_id, name, metadata) values ('podcasts','podcasts/00000000-0000-4000-8000-0000000000b1/audio-velho.mp3','{"size": 2097152}'), ('podcasts','podcasts/00000000-0000-4000-8000-0000000000b1/tmp/parte-1','{"size": 100}');`);
  return db;
}
let erros = 0;
const db = await montaComDados();
console.log("== 0-CONFERIR (antes de colar)");
const conf = (await db.query(rd("0-CONFERIR-primeiro-nao-altera-nada.sql"))).rows;
for (const r of conf) console.log("  ", [r.conferencia.slice(0, 70), r.detalhe_1, r.detalhe_2, r.detalhe_3, r.detalhe_4, r.detalhe_5].filter((x) => x != null).join(" | ").slice(0, 330));
const antesDados = JSON.stringify((await retrato(db)).dados);
const faltas = conf.filter((r) => /FALTA/.test(String(r.detalhe_1))); if (faltas.length) { erros++; console.log("  ERRO pre-requisito faltando"); }
console.log("== partes 1-4, duas voltas");
for (const volta of [1, 2]) for (const f of partes) {
  let res;
  try { res = await db.exec(rd(f)); } catch (e) { erros++; console.log(`  volta ${volta} ${f}: ERRO ${String(e.message).slice(0, 250)}`); continue; }
  const last = res[res.length - 1]?.rows?.[0] ?? {};
  const falsos = Object.entries(last).filter(([k, v]) => k !== "resultado" && v !== true).map(([k, v]) => `${k}=${v}`);
  if (!/^OK: /.test(last.resultado ?? "") || falsos.length) { erros++; console.log(`  volta ${volta} ${f}: RESULTADO RUIM`, JSON.stringify(last).slice(0, 400)); }
  else console.log(`  volta ${volta} ${f}: ${last.resultado} (${Object.keys(last).length - 1} conferencias, todas true)`);
}
console.log("== 0-CONFERIR depois (so le; deve rodar igual e nao mudar dados)");
const conf2 = (await db.query(rd("0-CONFERIR-primeiro-nao-altera-nada.sql"))).rows;
console.log("  linhas antes/depois:", conf.length, conf2.length, "| 'ja foi colada':", conf2.find((r) => /Esta leva já foi colada/.test(r.conferencia))?.detalhe_1);
const dadosApos = JSON.stringify((await retrato(db)).dados);
const A = JSON.parse(antesDados), Z = JSON.parse(dadosApos);
const mudou = Object.keys(A).filter((t) => JSON.stringify(A[t]) !== JSON.stringify(Z[t]));
console.log("  tabelas EXISTENTES cujos dados mudaram com a colagem:", mudou.length ? mudou.join(", ") : "nenhuma");
if (mudou.length) erros++;
// o pacote == as migracoes coladas direto?
const viaPacote = await retrato(db);
const db2 = await montaComDados(); for (const s of sqlLeva()) await db2.exec(s);
const viaMig = await retrato(db2);
const dif = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices"].flatMap((k) => { const c = compara(viaMig[k], viaPacote[k]); return [...c.novos, ...c.removidos, ...c.mudaram].map((x) => k + ":" + x); });
console.log("  pacote x migracoes coladas direto:", dif.length ? "DIFERE " + dif.slice(0, 8).join(", ") : "mesma estrutura (funcoes, gatilhos, politicas, permissoes)");
if (dif.length) erros++;
console.log(erros ? `RESULTADO: ${erros} PROBLEMA(S)` : "RESULTADO FINAL: pacote cola 2x sem erro, todas as conferencias deram true");
await db.close(); await db2.close(); process.exit(erros ? 1 : 0);
