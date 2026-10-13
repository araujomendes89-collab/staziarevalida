// Rodada 2: simulação da colagem na PRODUÇÃO DE HOJE (cache de monta-producao-hoje.mjs), com os pacotes SQL reais.
// Ordem: fontes-vinculadas → similaridade (1 e 2) → carga-provas (1, 2-01..2-12, 3; a 4 das imagens fica de fora) → explicações
// (estrutura + 13 partes). Confere: cada parte responde OK; os 0-CONFERIR dizem FALTA antes e OK depois; colar tudo de novo não
// muda nada; aluno e visitante sem acesso novo; gabarito e situação intactos; pacote = migração direta (9900<9910<9920<9930);
// fora de ordem; regra de recolagem (9801, 9620, 9610) e o selo do gabarito preliminar sumindo com o definitivo.
// Uso: CACHE_PROD=<prod-hoje.tar> node simular.mjs <pasta-dos-pacotes-json> [<saida-final.tar>]
//   pasta-dos-pacotes-json: um JSON {fv, sim, cp, ex} com as pastas de cada pacote (padrão: as de Downloads de 12/10).
import fs from "node:fs"; import path from "node:path";
import { PGlite, retrato, compara, MIG, LEVA3 } from "../fase1/lib.mjs";
const DL = "/Users/joaopaulomendes/Downloads/";
const PK = Object.assign({
  fv: DL + "publicacao-staziamed-2026-10-12-fontes-vinculadas", sim: DL + "publicacao-staziamed-2026-10-12-similaridade",
  cp: DL + "publicacao-staziamed-2026-10-12-carga-provas", ex: DL + "publicacao-staziamed-2026-10-12-explicacoes",
}, process.argv[2] && fs.existsSync(process.argv[2]) ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : {});
const FINAL_TAR = process.argv[3];
const ler = (f) => fs.readFileSync(f, "utf8");
const arqs = (dir, rx) => fs.readdirSync(dir).filter((f) => rx.test(f)).sort().map((f) => path.join(dir, f));
const CACHE = process.env.CACHE_PROD;
const abre = async (tar = CACHE) => { const db = new PGlite({ loadDataDir: new Blob([fs.readFileSync(tar)]) }); await db.waitReady; return db; };
let erros = 0; const ok = (c, m) => { if (!c) erros++; console.log(`  ${c ? "ok  " : "ERRO"} ${m}`); };
const secs = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices", "enums", "dados"];
const ESTR = secs.slice(0, 8);
const difs = (a, b, ss = secs) => ss.flatMap((k) => { const c = compara(a[k], b[k]); return [...c.novos.map((z) => `${k}+${z}`), ...c.removidos.map((z) => `${k}-${z}`), ...c.mudaram.map((z) => `${k}~${z}`)]; });

// Com RODADA2_DIR (pasta publicacao-staziamed-2026-10-13-rodada2): as etapas são as pastas numeradas, na ordem, e cada uma tem o seu 0-CONFERIR.
const R2DIR = process.env.RODADA2_DIR;
const ETAPAS = R2DIR ? fs.readdirSync(R2DIR).filter((d) => /^\d-/.test(d)).sort().map((d) => [d, arqs(path.join(R2DIR, d), /^[1-9][-\d]*-.*\.sql$/)]) : [
  ["1 fontes-vinculadas", [path.join(PK.fv, "1-Fontes-vinculadas.sql")]],
  ["2 similaridade", [path.join(PK.sim, "1-Similaridade.sql"), path.join(PK.sim, "2-Perfis-da-revisao.sql")]],
  ["3 carga-provas", [path.join(PK.cp, "1-aviso-gabarito-preliminar.sql"), ...arqs(PK.cp, /^2-\d\d-correcoes/), path.join(PK.cp, "3-prova-nova-revalida-2026-2.sql")]],
  ["4 explicacoes", [path.join(PK.ex, "1-Estrutura-carga-das-explicacoes.sql"), ...arqs(PK.ex, /^2-Prova-\d\d/)]],
];
const CONF = R2DIR ? Object.fromEntries(fs.readdirSync(R2DIR).filter((d) => /^\d-/.test(d)).sort().map((d) => [d, path.join(R2DIR, d, "0-CONFERIR.sql")])) : { fv: path.join(PK.fv, "0-CONFERIR.sql"), sim: path.join(PK.sim, "0-CONFERIR.sql"), cp: path.join(PK.cp, "0-CONFERIR.sql"), ex: path.join(PK.ex, "0-CONFERIR.sql") };
const resumoDe = (row) => { if (!row) return "(sem resposta)"; const v = row.resultado ?? row.conferencia ?? Object.values(row).find((x) => typeof x === "string"); return String(v ?? JSON.stringify(row)); };
async function cola(db, f) {
  const t = Date.now();
  try {
    const r = await db.exec(ler(f)); const rows = r[r.length - 1]?.rows ?? []; const last = rows[0] ?? {};
    const falsos = Object.entries(last).filter(([, v]) => v === false).map(([k]) => k);
    return { arq: path.basename(f), ms: Date.now() - t, resumo: resumoDe(last), falsos, rows };
  } catch (e) { return { arq: path.basename(f), ms: Date.now() - t, erro: String(e.message).slice(0, 400) }; }
}
async function conferir(db, k) {
  try { const r = await db.exec(ler(CONF[k])); return resumoDe(r[r.length - 1]?.rows?.[0]); } catch (e) { return "ERRO: " + String(e.message).slice(0, 300); }
}
const conferirTodos = async (db) => Object.fromEntries(await Promise.all(Object.keys(CONF).map(async (k) => [k, await conferir(db, k)])));
const mostraConf = (c) => { for (const [k, v] of Object.entries(c)) console.log(`     0-CONFERIR ${k}: ${v.slice(0, 260)}`); };
const q = async (db, s, p = []) => (await db.query(s, p)).rows;
async function acessos(db) {
  const r = {};
  for (const role of ["anon", "authenticated"]) {
    r[role + ":funcoes"] = (await q(db, `select p.oid::regprocedure::text f from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('${role}', p.oid, 'execute') order by 1`)).map((x) => x.f);
    r[role + ":tabelas"] = (await q(db, `select c.relname || ':' || concat_ws(',', case when has_table_privilege('${role}', c.oid, 'select') then 's' end, case when has_table_privilege('${role}', c.oid, 'insert') then 'i' end,
        case when has_table_privilege('${role}', c.oid, 'update') then 'u' end, case when has_table_privilege('${role}', c.oid, 'delete') then 'd' end) t
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','m') and (has_table_privilege('${role}', c.oid, 'select') or has_table_privilege('${role}', c.oid, 'insert') or has_table_privilege('${role}', c.oid, 'update') or has_table_privilege('${role}', c.oid, 'delete')) order by 1`)).map((x) => x.t);
  }
  r.politicas = (await q(db, `select tablename || ' :: ' || policyname || ' ' || roles::text || ' ' || cmd p from pg_policies where schemaname = 'public' and (roles && array['anon','authenticated','public']::name[]) order by 1`)).map((x) => x.p);
  return r;
}
const asUser = (db, uid, sql, params = []) => db.transaction(async (tx) => {
  await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
  await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role: "authenticated" } : {})]);
  return (await tx.query(sql, params)).rows;
});
const gabarito = async (db) => q(db, `select id, correct_option, status from public.questions order by id`);
const oficiais = async (db) => q(db, `select question_id, answer, answer_status, version, is_current from public.question_official_answers order by question_id, version`);

// =========================================================================================== A) produção de hoje
console.log("== A) produção de hoje (antes de colar): os 4 0-CONFERIR");
const db = await abre();
const R0 = await retrato(db); const G0 = await gabarito(db); const O0 = await oficiais(db); const A0 = await acessos(db);
console.log(`     questões: ${G0.length}; gabaritos oficiais registrados: ${O0.length}; fontes: ${(await q(db, "select count(*)::int n from public.ch_sources"))[0].n}`);
const c0 = await conferirTodos(db); mostraConf(c0);
// (o 0-CONFERIR dos perfis é o mesmo da estrutura da similaridade: antes dela, FALTA)
for (const k of Object.keys(c0)) ok(/^FALTA|^ATENÇÃO/.test(c0[k]) && !/^ERRO/.test(c0[k]), `${k}: antes de colar, o 0-CONFERIR diz o que falta (sem erro)`);

// =========================================================================================== B) ordem certa, 1ª volta
const tempos = {};
for (let volta = 1; volta <= 2; volta++) {
  console.log(`== B${volta}) colagem na ordem, volta ${volta}`);
  for (const [nome, lista] of ETAPAS) {
    let ms = 0;
    for (const f of lista) {
      const r = await cola(db, f); ms += r.ms;
      if (r.erro) { ok(false, `${nome} ${r.arq}: ERRO ${r.erro}`); continue; }
      // as estruturas (1-Similaridade e 1-Estrutura, iguais às migrações) não têm linha final: sem erro = colada ("Success. No rows returned")
      if (!r.rows.length && /^1-(Similaridade|Estrutura)/.test(r.arq)) r.resumo = "OK (sem linha final; o editor mostra 'Success. No rows returned')";
      const bom = /^OK/.test(r.resumo) && r.falsos.length === 0;
      // carga das provas e explicações podem responder "ATENÇÃO" listando o que pularam: mostrado e conferido abaixo
      ok(bom || /^ATENÇÃO/.test(r.resumo), `${nome} ${r.arq.slice(0, 48)} (${(r.ms / 1000).toFixed(1)} s): ${r.resumo.slice(0, 230)}${r.falsos.length ? " | FALSE: " + r.falsos.join(",") : ""}`);
    }
    tempos[nome] = (tempos[nome] ?? 0) + ms;
    const c = await conferirTodos(db); mostraConf(c);
    const feitos = Object.keys(CONF).slice(0, ETAPAS.findIndex((e) => e[0] === nome) + 1);
    for (const k of feitos) ok(/^OK/.test(c[k]), `depois de ${nome}: 0-CONFERIR ${k} responde OK`);
  }
  if (volta === 1) globalThis.R1 = await retrato(db);
}
const R2 = await retrato(db);
const d12 = difs(globalThis.R1, R2);
ok(d12.length === 0, `colar tudo de novo (2ª volta) não muda nada: ${d12.length ? "DIFERE " + d12.slice(0, 8).join(" | ") : "estrutura, permissões e dados idênticos"}`);
console.log("     tempo de cada etapa (2 voltas somadas, no PGlite deste Mac):", Object.entries(tempos).map(([k, v]) => `${k} ${(v / 2000).toFixed(1)} s/volta`).join("; "));

// =========================================================================================== C) o que mudou
console.log("== C) o que a rodada 2 acrescentou; gabarito, situação e acesso");
const d0 = difs(R0, R2, ESTR);
const mudou = d0.filter((x) => !x.includes("+"));
console.log(`     novos: ${d0.filter((x) => x.includes("+")).length} objetos; redefinidos/removidos: ${mudou.length}`);
for (const m of mudou) console.log("       ~ " + m);
const G2 = await gabarito(db); const g2 = new Map(G2.map((x) => [x.id, x]));
const mexidos = G0.filter((x) => JSON.stringify(g2.get(x.id)) !== JSON.stringify(x));
ok(mexidos.length === 0, `gabarito e situação das ${G0.length} questões de antes: intactos${mexidos.length ? " — MUDARAM: " + mexidos.slice(0, 5).map((x) => x.id).join(", ") : ""}`);
const novas = G2.filter((x) => !G0.find((y) => y.id === x.id));
ok(novas.length === 100 && novas.every((x) => x.id.startsWith("revalida_2026_2_")), `questões novas: ${novas.length} (todas da Revalida 2026/2)`);
const O2 = await oficiais(db);
const oAntes = JSON.stringify(O0), oDepoisVelhas = JSON.stringify(O2.filter((x) => !x.question_id.startsWith("revalida_2026_2_")));
ok(oAntes === oDepoisVelhas, "gabaritos oficiais registrados antes: intactos");
const o26 = O2.filter((x) => x.question_id.startsWith("revalida_2026_2_"));
ok(o26.length === 100 && o26.every((x) => x.answer_status === "PRELIMINARY" && x.is_current && x.answer === g2.get(x.question_id).correct_option), `2026/2: ${o26.length} gabaritos PRELIMINARES, iguais à letra da questão`);
const sim26 = await q(db, `select to_char(final_answer_expected_on, 'DD/MM/YYYY') d from public.exams where id = 'revalida-2026-2'`);
ok(sim26[0]?.d === "04/12/2026", `data do gabarito definitivo da 2026/2 gravada como dado: ${sim26[0]?.d}`);
const A2 = await acessos(db);
for (const k of Object.keys(A0)) {
  const novosAc = A2[k].filter((x) => !A0[k].includes(x)), tirados = A0[k].filter((x) => !A2[k].includes(x));
  if (k.startsWith("anon")) ok(novosAc.length === 0, `visitante (${k}): nada novo${novosAc.length ? ": " + novosAc.join(", ") : ""}`);
  else console.log(`     ${k}: +${novosAc.length} ${novosAc.join(", ")}${tirados.length ? " | -" + tirados.join(", ") : ""}`);
}
const desat = (await q(db, `select count(*)::int n from public.question_profiles p join public.questions q on q.id = p.question_id where p.basis_hash is distinct from public.similarity_text_hash(q.statement, q.options)`))[0].n;
const nPerf = (await q(db, `select count(*)::int n from public.question_profiles`))[0].n;
ok(desat === 0, `perfis da similaridade batem com o texto final das questões: ${nPerf - desat} de ${nPerf} (desatualizados: ${desat})`);
const aiSim = await q(db, `select count(*)::int n from public.ai_functions where key = 'similaridade'`);
ok(aiSim[0].n === 0, "função 'Questões parecidas' DESLIGADA na Central de IAs (sem linha em ai_functions)");
// aluno e visitante não leem as tabelas novas
const ANA = "00000000-0000-4000-8000-00000000a0a0";
await db.exec(`insert into auth.users (id, email) values ('${ANA}', 'aluna.simulacao@example.com') on conflict do nothing`);
for (const t of ["question_source_links", "question_source_checks", "question_update_notes", "question_profiles", "question_relations", "question_embeddings", "similarity_runs", "question_relation_history", "question_similarity_state"]) {
  for (const uid of [ANA, null]) {
    let negado = false, n = null; try { n = (await asUser(db, uid, `select count(*)::int n from public.${t}`))[0].n; } catch (e) { negado = /permission denied/.test(e.message); }
    const linhas = (await q(db, `select count(*)::int n from public.${t}`))[0].n;
    ok(negado || n === 0, `${uid ? "aluno" : "visitante"} não lê ${t} (${negado ? "sem permissão" : `política da equipe: vê 0 de ${linhas} linhas`})`);
  }
}

// =========================================================================================== D) regra de ouro e selo
console.log("== D) nota 'O que mudou' sem repetir; selo do gabarito preliminar");
const notas = await q(db, `select question_id, note from public.question_update_notes order by 1`);
console.log(`     notas da carga das explicações: ${notas.length} (${notas.map((n) => n.question_id).join(", ")})`);
if (notas.length) {
  const QN = notas[0].question_id;
  const ADMIN = "00000000-0000-4000-8000-0000000000a1";
  const dec = await asUser(db, ADMIN, `select public.app_admin_question_update_note_decide(p_question_id => $1, p_decision => 'approve', p_note => 'Simulação da rodada 2', p_seen_text => $2) r`, [QN, notas[0].note]);
  const vis1 = (await q(db, `select public.question_update_note_visible($1) v`, [QN]))[0].v;
  ok(vis1 === notas[0].note, `nota aprovada aparece (${QN})${dec ? "" : ""}`);
  const [src] = await q(db, `select id from public.ch_sources where status = 'current' and audience = 'oficial' and kind = 'final' order by created_at limit 1`);
  const st = (await q(db, `select statement from public.questions where id = $1`, [QN]))[0].statement;
  const [{ id: link }] = await q(db, `insert into public.question_source_links (question_id, source_id, role, temporal, section, quote, status, origin, update_note) values ($1, $2, 'conduta', 'vigente', 'Enunciado da questão', $3, 'em_revisao', 'importacao', $4) returning id`, [QN, src.id, st.slice(0, 120), notas[0].note]);
  await asUser(db, ADMIN, `select public.app_admin_question_source_link_confirm($1)`, [link]);
  const vis2 = (await q(db, `select public.question_update_note_visible($1) v`, [QN]))[0].v;
  ok(vis2 === null, "com a nota do quadro Fontes vinculadas confirmada, a da carga some (não repete)");
}
const Q26 = "revalida_2026_2_q001";
const pv = async () => (await asUser(db, ANA, `select public.practice_question_view($1) v`, [Q26]))[0].v;
ok(JSON.stringify((await pv())?.preliminary) === JSON.stringify({ expected_on: "2026-12-04" }), `aluno vê o selo antes de responder: ${JSON.stringify((await pv())?.preliminary)}`);
const letra = g2.get(Q26).correct_option;
await asUser(db, "00000000-0000-4000-8000-0000000000a1", `select public.app_admin_set_official_answer(p_question_id => $1, p_answer => $2, p_status => 'FINAL', p_source => 'Gabarito definitivo do Inep (simulação)', p_reason => 'Simulação da rodada 2')`, [Q26, letra]);
ok((await pv())?.preliminary === null, "registrado o gabarito DEFINITIVO, o selo some sozinho");
await db.close();

// =========================================================================================== E) pacote = migração direta
console.log("== E) pacotes x migrações do ramo rodada2 coladas direto (ordem 9900 < 9910 < 9920 < 9930)");
const migs = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
const nums = migs.map((f) => f.slice(0, 14)); const rep = nums.filter((n, i) => nums.indexOf(n) !== i);
ok(rep.length === 0, `nenhum número de migração repetido (${migs.length} arquivos)${rep.length ? ": " + rep.join(", ") : ""}`);
const novasM = migs.filter((f) => f >= "20261003009900");
ok(JSON.stringify(novasM.map((f) => f.slice(8, 14))) === JSON.stringify(["009900", "009910", "009920", "009930"]), `migrações novas, nesta ordem: ${novasM.join(", ")}`);
const dbm = await abre();
for (const f of novasM) await dbm.exec(ler(path.join(MIG, f)));
const RM = await retrato(dbm); await dbm.close();
const dm = difs(globalThis.R1, RM, ESTR);
ok(dm.length === 0, `estrutura do pacote = estrutura das migrações diretas${dm.length ? ": DIFERE " + dm.slice(0, 10).join(" | ") : ""}`);

// =========================================================================================== F) fora de ordem
console.log("== F) fora de ordem: explicações ANTES da carga das provas; depois o resto");
const dbf = await abre();
for (const f of ETAPAS[3][1]) { const r = await cola(dbf, f); console.log(`     ${r.arq.slice(0, 40)}: ${r.erro ? "ERRO " + r.erro : r.resumo.slice(0, 200)}`); }
const cf = await conferirTodos(dbf); mostraConf(cf);
const [, , kCp, kEx] = Object.keys(CONF);
ok(/^FALTA/.test(cf[kEx]) && /2026\/2/.test(cf[kEx]), "0-CONFERIR das explicações diz o que falta (a 2026/2 ainda não existe)");
ok(/^FALTA|^ATENÇÃO/.test(cf[kCp]), "0-CONFERIR da carga das provas diz que falta");
for (const [, lista] of [ETAPAS[2], ETAPAS[0], ETAPAS[1], ETAPAS[3], ...ETAPAS.slice(4)]) for (const f of lista) { const r = await cola(dbf, f); if (r.erro) ok(false, `${r.arq}: ${r.erro}`); }
const cf2 = await conferirTodos(dbf); mostraConf(cf2);
for (const k of Object.keys(cf2)) ok(/^OK/.test(cf2[k]), `fora de ordem e colando de novo o que faltou: ${k} OK`);
const RF = await retrato(dbf); await dbf.close();
const dfx = difs(globalThis.R1, RF, ESTR);
ok(dfx.length === 0, `mesma estrutura da ordem certa${dfx.length ? ": DIFERE " + dfx.slice(0, 6).join(" | ") : ""}`);
const qf = (x) => x.dados["questions"]?.h;
console.log(`     questões iguais às da ordem certa: ${qf(RF) === qf(globalThis.R1) ? "sim" : "NÃO (ver relatório)"}; histórico: ${RF.dados["question_change_log"]?.n} x ${globalThis.R1.dados["question_change_log"]?.n} linhas`);

// =========================================================================================== G) recolagem de arquivos antigos
if (FINAL_TAR) {
  console.log("== G) se alguém colar de novo um arquivo antigo (9801, 9620, 9610): o que precisa colar depois");
  // estado final da ordem certa (1 volta), guardado para os casos abaixo
  const dbg = await abre();
  for (const [, lista] of ETAPAS) for (const f of lista) await cola(dbg, f);
  const RG = await retrato(dbg);
  fs.writeFileSync(FINAL_TAR, Buffer.from(await (await dbg.dumpDataDir("none")).arrayBuffer())); await dbg.close();
  const L3 = LEVA3.map((f) => path.join(MIG, f)), L4 = arqs(DL + "publicacao-staziamed-2026-10-12-leva4", /^[1-4]-colar/), L5 = arqs(DL + "publicacao-staziamed-2026-10-12-leva5", /^[1-5]-colar/);
  const EST = R2DIR ? { fv: path.join(R2DIR, "1-fontes-vinculadas/1-Fontes-vinculadas.sql"), sim: path.join(R2DIR, "2-similaridade-estrutura/1-Similaridade.sql"), ex: path.join(R2DIR, "4-explicacoes/1-Estrutura-carga-das-explicacoes.sql"), cp: path.join(R2DIR, "3-carga-das-provas/1-aviso-gabarito-preliminar.sql") }
    : { fv: path.join(PK.fv, "1-Fontes-vinculadas.sql"), sim: path.join(PK.sim, "1-Similaridade.sql"), ex: path.join(PK.ex, "1-Estrutura-carga-das-explicacoes.sql"), cp: path.join(PK.cp, "1-aviso-gabarito-preliminar.sql") };
  const ESTRUTURAS = [EST.fv, EST.sim, EST.ex, EST.cp];
  const casos = [
    ["9801 (leva 4 parte 2) + só o aviso (parte 1 da carga das provas)", [L4[1]], [EST.cp]],
    ["9801 (leva 4 parte 2) + estrutura das explicações + aviso", [L4[1]], [EST.ex, EST.cp]],
    ["9620 (COLAR-fonte-complementar) + só o aviso", [DL + "COLAR-fonte-complementar-9620-9621.sql"], [EST.cp]],
    ["9620 + ORDEM GERAL (leva 3, 4, 5) + as 4 estruturas da rodada 2", [DL + "COLAR-fonte-complementar-9620-9621.sql"], [...L3, ...L4, ...L5, ...ESTRUTURAS]],
    ["9610 (COLAR-fontes-oficiais) + ORDEM GERAL + as 4 estruturas da rodada 2", [DL + "COLAR-fontes-oficiais-9610.sql"], [...L3, ...L4, ...L5, ...ESTRUTURAS]],
    ["leva 4 inteira + leva 5 inteira de novo + as 4 estruturas da rodada 2", [...L4, ...L5], ESTRUTURAS],
  ];
  for (const [nome, antigo, depois] of casos) {
    const d = await abre(FINAL_TAR);
    for (const f of antigo) { const r = await cola(d, f); if (r.erro) console.log("     erro ao recolar", r.arq, r.erro); }
    const Rx = await retrato(d);
    const quebrou = difs(RG, Rx, ESTR);
    for (const f of depois) { const r = await cola(d, f); if (r.erro) console.log("     erro", r.arq, r.erro); }
    const Ry = await retrato(d); await d.close();
    const resta = difs(RG, Ry, ESTR);
    console.log(`     ${nome}: o arquivo antigo desfaz ${quebrou.length} objeto(s) [${quebrou.slice(0, 6).join(" | ")}]; depois do conserto restam ${resta.length}${resta.length ? " [" + resta.slice(0, 8).join(" | ") + "]" : " (volta igual)"}`);
    globalThis.recolagem = [...(globalThis.recolagem ?? []), { nome, desfaz: quebrou.length, resta }];
  }
}
console.log(erros ? `RESULTADO: ${erros} PROBLEMA(S)` : "RESULTADO FINAL: tudo certo");
process.exit(erros ? 1 : 0);
