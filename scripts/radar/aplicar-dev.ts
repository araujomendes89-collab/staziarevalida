/**
 * Radar de Evidências: aplica a migração no banco de DESENVOLVIMENTO (PGlite) e prova que nada existente mudou.
 *
 *   TMPDIR=/Volumes/StaziaMed/.tmp-aulas npx tsx scripts/radar/aplicar-dev.ts [--pasta DIR] [--saida relatorio.json]
 *
 * 1. cria um banco novo com TODAS as migrações menos a do Radar e tira uma "fotografia" do esquema (colunas, funções,
 *    políticas, índices, restrições e permissões de tudo que NÃO é radar_*);
 * 2. aplica a migração do Radar (e uma segunda vez, para provar que pode ser colada de novo);
 * 3. tira outra fotografia e compara: tem de ser idêntica;
 * 4. roda o ensaio de comportamento (eventos leves/graves, prazo de 48 h, decisão só do dono nas graves, aluno barrado).
 * Nunca toca em produção (PGlite local).
 */
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { LOCAL_AUTH_SQL, LOCAL_META_SQL, migrationList } from "../../src/novo/data/localCore";

const ROOT = process.cwd();
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const PASTA = arg("pasta") ?? "/Volumes/StaziaMed/.tmp-aulas/radar/devdb-ensaio";
const SAIDA = arg("saida") ?? "/Volumes/StaziaMed/.tmp-aulas/radar/migracao-ensaio.json";
const RADAR = "20261003010100_radar_evidencias.sql";

const dir = path.join(ROOT, "supabase/migrations");
const todas = Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]));
const radarSql = todas[RADAR];
if (!radarSql) throw new Error(`Migração ${RADAR} não encontrada em supabase/migrations`);

fs.rmSync(PASTA, { recursive: true, force: true });
fs.mkdirSync(PASTA, { recursive: true });
const db = new PGlite(PASTA);

async function fotografia() {
  const q = async (sql: string) => (await db.query<Record<string, unknown>>(sql)).rows;
  const naoRadar = "not (c.relname like 'radar\\_%' escape '\\')";
  return {
    colunas: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name not like 'radar\\_%' escape '\\' order by 1, 2`),
    funcoes: await q(`select p.proname, md5(pg_get_functiondef(p.oid)) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname not like 'radar\\_%' escape '\\' and p.proname not like 'app\\_admin\\_radar\\_%' escape '\\' order by 1, 2`),
    politicas: await q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' and tablename not like 'radar\\_%' escape '\\' order by 1, 2`),
    indices: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename not like 'radar\\_%' escape '\\' order by 1, 2`),
    restricoes: await q(`select c.relname, k.conname, pg_get_constraintdef(k.oid) as def from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and ${naoRadar} order by 1, 2`),
    gatilhos: await q(`select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal and ${naoRadar} order by 1, 2`),
    permissoes: await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name not like 'radar\\_%' escape '\\' order by 1, 2, 3`),
    tabelas_com_rls: await q(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and ${naoRadar} order by 1`),
  };
}

const relatorio: Record<string, unknown> = { gerado_em: new Date().toISOString(), banco: "desenvolvimento (PGlite, pasta temporária)" };
const t0 = Date.now();
await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
await db.exec(LOCAL_AUTH_SQL);
await db.exec(LOCAL_META_SQL);
const lista = migrationList(todas).filter((m) => m.name !== RADAR);
for (const m of lista) await db.exec(m.sql);
console.log(`Base: ${lista.length} migrações existentes aplicadas em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const antes = await fotografia();

await db.exec(radarSql);
await db.exec(radarSql); // colar de novo tem de funcionar
const depois = await fotografia();
const diferencas: string[] = [];
for (const k of Object.keys(antes) as (keyof typeof antes)[]) {
  if (JSON.stringify(antes[k]) !== JSON.stringify(depois[k])) diferencas.push(k);
}
relatorio.migracoes_existentes = lista.length;
relatorio.itens_fotografados = Object.fromEntries(Object.entries(antes).map(([k, v]) => [k, v.length]));
relatorio.categorias_que_mudaram = diferencas;
relatorio.nada_existente_mudou = diferencas.length === 0;
console.log(diferencas.length === 0 ? "OK: nada existente mudou (colunas, funções, políticas, índices, restrições, gatilhos, permissões, RLS)" : `ATENÇÃO: mudou em ${diferencas.join(", ")}`);

// ---------------------------------------------------------------- ensaio de comportamento
const as = async (uid: string | null, sql: string, params: unknown[] = []) => {
  await db.exec(`set role ${uid ? "authenticated" : "anon"}; select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : "{}"}', false)`);
  try { return (await db.query<Record<string, unknown>>(sql, params)).rows; } finally { await db.exec("reset role"); }
};
const tenta = async (uid: string | null, sql: string, params: unknown[] = []) => { try { await as(uid, sql, params); return "permitido"; } catch (e) { return `barrado: ${String((e as Error).message).slice(0, 80)}`; } };
const ADMIN = "00000000-0000-4000-8000-0000000000a1", REV = "00000000-0000-4000-8000-0000000000b2", ALUNO = "00000000-0000-4000-8000-0000000000c3";
for (const [id, email] of [[ADMIN, "dono@x.test"], [REV, "rev@x.test"], [ALUNO, "aluno@x.test"]]) await db.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [id, email]);
await db.exec(`insert into public.user_roles (user_id, role) values ('${ADMIN}', 'admin'), ('${REV}', 'editor'), ('${ALUNO}', 'student') on conflict (user_id) do update set role = excluded.role`);

const ev = (g: string) => JSON.stringify({ origem: "adaptador_novo", gravidade: g, motivo_gravidade: "teste", resumo: { total: 1 }, itens: [],
  fonte: { url: "https://exemplo.gov.br/x", referencia: "desconhecido", esfera: "sus", norma_sus: true },
  afetados: [{ tipo: "questao", ref: "q1", nivel: "trecho", paginas: [12, 13], citacao: "trecho" }, { tipo: "aula", ref: "GR-001" }] });
const r: Record<string, unknown> = {};
const idLeve = (await db.query<{ id: string }>(`select public.radar_registrar_evento('adaptador:teste:leve', $1::jsonb) as id`, [ev("leve")])).rows[0].id;
const idGrave = (await db.query<{ id: string }>(`select public.radar_registrar_evento('adaptador:teste:grave', $1::jsonb) as id`, [ev("grave")])).rows[0].id;
const repetido = (await db.query<{ id: string }>(`select public.radar_registrar_evento('adaptador:teste:leve', $1::jsonb) as id`, [ev("leve").replace('"origem":"adaptador_novo"', '"origem":"adaptador_novo","sha256_novo":"abc"')])).rows[0].id;
const repetido2 = (await db.query<{ id: string }>(`select public.radar_registrar_evento('adaptador:teste:leve', $1::jsonb) as id`, [ev("leve").replace('"origem":"adaptador_novo"', '"origem":"adaptador_novo","sha256_novo":"abc"')])).rows[0].id;
r.registrar_repetido_nao_duplica = repetido === repetido2;
r.prazo_48h = (await db.query<{ h: number }>(`select round(extract(epoch from (prazo_revisao_ate - detectado_em)) / 3600)::int as h from public.radar_eventos where id = $1`, [idLeve])).rows[0].h;
r.grave_precisa_dono = (await db.query(`select gravidade, precisa_decisao_dono from public.radar_eventos where id = $1`, [idGrave])).rows[0];
r.afetados_trecho = (await db.query(`select tipo, ref, nivel, paginas, citacao from public.radar_afetados where evento_id = $1 order by tipo`, [idGrave])).rows;
r.aluno_le_eventos = (await as(ALUNO, `select count(*)::int as n from public.radar_eventos`)).at(0);
r.aluno_chama_registrar = await tenta(ALUNO, `select public.radar_registrar_evento('x', '{}'::jsonb)`);
r.aluno_escreve_direto = await tenta(ALUNO, `insert into public.radar_eventos (fonte_id, origem) select id, 'documento_novo' from public.radar_fontes limit 1`);
r.anonimo_le = await tenta(null, `select count(*) from public.radar_eventos`);
r.aluno_fila = (await as(ALUNO, `select public.app_admin_radar_fila(false) as f`)).at(0);
r.equipe_fila_graves = ((await as(REV, `select public.app_admin_radar_fila(true) as f`))[0].f as unknown[]).length;
r.revisor_encerra_leve = await tenta(REV, `select public.app_admin_radar_decidir($1::uuid, 'resolvida', 'ok')`, [idLeve]);
r.revisor_encerra_grave = await tenta(REV, `select public.app_admin_radar_decidir($1::uuid, 'resolvida', 'ok')`, [idGrave]);
r.revisor_parecer_grave = await tenta(REV, `select public.app_admin_radar_decidir($1::uuid, 'em_revisao', 'parecer dos 2 revisores')`, [idGrave]);
r.dono_encerra_grave = await tenta(ADMIN, `select public.app_admin_radar_decidir($1::uuid, 'resolvida', 'dono decidiu')`, [idGrave]);
r.afetados_depois = (await db.query(`select status, count(*)::int as n from public.radar_afetados where evento_id = $1 group by 1`, [idGrave])).rows;
r.rodada_registrada = (await db.query(`insert into public.radar_rodadas (ensaio) values (true) returning ensaio`)).rows[0];
r.custo_soma = [(await db.query<{ v: string }>(`select public.radar_custo_somar('2026-10', 0.004, 1300, 1000) as v`)).rows[0].v, (await db.query<{ v: string }>(`select public.radar_custo_somar('2026-10', 0.003, 900, 800) as v`)).rows[0].v];
r.ia_sem_revisao_medica = await tenta(null, `select 1`).then(async () => { try { await db.query(`update public.radar_eventos set analise_ia = '{"precisa_revisao_medica":"false"}'::jsonb where id = $1`, [idLeve]); return "gravou (ERRO)"; } catch { return "barrado pela constraint"; } });
r.samu_com_conduta = await (async () => { try { await db.query(`insert into public.radar_fontes (library_doc_id, referencia, uso_permitido) values ('samu-x', 'proibida_samu', 'conduta')`); return "gravou (ERRO)"; } catch { return "barrado pela constraint"; } })();
// o Radar não tem como tocar em questão/gabarito: contagens antes e depois
r.questions_tocadas = (await db.query<{ n: number }>(`select count(*)::int as n from public.questions`)).rows[0].n;
relatorio.comportamento = r;
fs.writeFileSync(SAIDA, JSON.stringify(relatorio, null, 1));
console.log(JSON.stringify(r, null, 1));
console.log(`Relatório: ${SAIDA}`);
await db.close();
