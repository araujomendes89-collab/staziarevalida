/**
 * Radar de Evidências, parte 2: ensaio da migração 20261003010200 (Fila do Radar + avisos) no banco de DESENVOLVIMENTO (PGlite).
 *   TMPDIR=/Volumes/StaziaMed/.tmp-aulas npx tsx scripts/radar/ensaio-fila-avisos.ts [--saida relatorio.json]
 * Sobe todas as migrações menos a nova, fotografa o esquema fora do radar, aplica a nova DUAS vezes, compara e testa o comportamento
 * (aviso na fila de e-mails, contagem do dono, filtros, ação com nota obrigatória, aluno e anônimo barrados). Tudo termina apagado: nada toca produção.
 */
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { LOCAL_AUTH_SQL, LOCAL_META_SQL, migrationList } from "../../src/novo/data/localCore";

const ROOT = process.cwd();
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const PASTA = arg("pasta") ?? "/Volumes/StaziaMed/.tmp-aulas/radar/devdb-fila";
const SAIDA = arg("saida") ?? "/Volumes/StaziaMed/.tmp-aulas/radar/fila-avisos-ensaio.json";
const NOVA = "20261003010200_radar_fila_e_avisos.sql";
const dir = path.join(ROOT, "supabase/migrations");
const todas = Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]));
const novaSql = todas[NOVA];
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
await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
await db.exec(LOCAL_AUTH_SQL);
await db.exec(LOCAL_META_SQL);
const lista = migrationList(todas).filter((m) => m.name !== NOVA);
for (const m of lista) await db.exec(m.sql);
const antes = await fotografia();
await db.exec(novaSql);
await db.exec(novaSql);
const depois = await fotografia();
const diferencas = (Object.keys(antes) as (keyof typeof antes)[]).filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]));
relatorio.nada_existente_mudou = diferencas.length === 0;
relatorio.categorias_que_mudaram = diferencas;
console.log(diferencas.length === 0 ? "OK: nada existente mudou" : `ATENÇÃO: mudou em ${diferencas.join(", ")}`);

const as = async (uid: string | null, sql: string, params: unknown[] = []) => {
  await db.exec(`set role ${uid ? "authenticated" : "anon"}; select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : "{}"}', false)`);
  try { return (await db.query<Record<string, any>>(sql, params)).rows; } finally { await db.exec("reset role"); }
};
const tenta = async (uid: string | null, sql: string, params: unknown[] = []) => { try { await as(uid, sql, params); return "permitido"; } catch (e) { return `barrado: ${String((e as Error).message).slice(0, 90)}`; } };
const ADMIN = "00000000-0000-4000-8000-0000000000a1", REV = "00000000-0000-4000-8000-0000000000b2", ALUNO = "00000000-0000-4000-8000-0000000000c3";
for (const [id, email] of [[ADMIN, "dono@x.test"], [REV, "rev@x.test"], [ALUNO, "aluno@x.test"]]) await db.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [id, email]);
await db.exec(`insert into public.user_roles (user_id, role) values ('${ADMIN}', 'admin'), ('${REV}', 'editor'), ('${ALUNO}', 'student') on conflict (user_id) do update set role = excluded.role`);

const ev = (g: string, sha: string) => JSON.stringify({ origem: "adaptador_mudou", gravidade: g, motivo_gravidade: g === "grave" ? "Fonte revogada" : "Só numeração", sha256_novo: sha, resumo: { total: 1 },
  itens: [{ kind: "NUMERIC", critical: true, pagina_antiga: 3, pagina_nova: 3, texto_antigo: "Dose 5 mg", texto_novo: "Dose 10 mg", trecho: { antes: "5 mg", depois: "10 mg" } }, { kind: "UNCHANGED", texto_antigo: "x", texto_novo: "x" }],
  analise_ia: { o_que_mudou: "A dose mudou.", recomendacao_alterada: "Dose", impacto_clinico_provavel: "Alto", certeza: "alta", precisa_revisao_medica: "true" },
  fonte: { url: "https://exemplo.gov.br/x", referencia: "vigente", esfera: "sus", norma_sus: true },
  afetados: [{ tipo: "questao", ref: "q1", nivel: "trecho", paginas: [3], citacao: "trecho" }, { tipo: "aula", ref: "GR-001" }] });
const r: Record<string, unknown> = {};
const reg = async (doc: string, g: string, sha: string) => (await db.query<{ id: string }>(`select public.radar_registrar_evento($1, $2::jsonb) as id`, [doc, ev(g, sha)])).rows[0].id;
const sha = (c: string) => c.repeat(64);
r.avisos_antes = (await db.query(`select count(*)::int as n from public.radar_avisos`)).rows[0];
const idGrave = await reg("adaptador:teste:grave", "grave", sha("a"));
const idLeve = await reg("adaptador:teste:leve", "leve", sha("b"));
const idGrave2 = await reg("adaptador:teste:grave2", "grave", sha("c"));
await reg("adaptador:teste:grave", "grave", sha("a")); // repetir a rodada
r.avisos_depois = (await db.query(`select evento_id = $1 as e_o_grave, destinatario = $2 as e_o_dono, canal, status, assunto, corpo from public.radar_avisos order by criado_em`, [idGrave, ADMIN])).rows;
r.avisos_total_grave_e_leve = (await db.query(`select count(*)::int as n from public.radar_avisos`)).rows[0].n; // 2 graves, 0 leve
r.dono_avisos = (await as(ADMIN, `select public.app_admin_radar_avisos() as a`))[0].a;
r.revisor_avisos = (await as(REV, `select public.app_admin_radar_avisos() as a`))[0].a;
r.aluno_avisos = (await as(ALUNO, `select public.app_admin_radar_avisos() as a`))[0].a;
r.anonimo_avisos = await tenta(null, `select public.app_admin_radar_avisos()`);
r.aluno_le_avisos_tabela = (await as(ALUNO, `select count(*)::int as n from public.radar_avisos`))[0];
r.revisor_le_avisos_tabela = (await as(REV, `select count(*)::int as n from public.radar_avisos`))[0];
r.dono_le_avisos_tabela = (await as(ADMIN, `select count(*)::int as n from public.radar_avisos`))[0];
r.aluno_escreve_avisos = await tenta(ALUNO, `update public.radar_avisos set status = 'enviado'`);
r.dono_escreve_avisos = await tenta(ADMIN, `update public.radar_avisos set status = 'enviado'`);
r.aluno_fila_detalhada = (await as(ALUNO, `select public.app_admin_radar_fila_detalhada('todos') as f`))[0].f;
r.anonimo_fila_detalhada = await tenta(null, `select public.app_admin_radar_fila_detalhada('todos')`);
r.aluno_parecer = await tenta(ALUNO, `select public.app_admin_radar_parecer($1::uuid, 'parecer')`, [idGrave]);
r.aluno_acao = await tenta(ALUNO, `select public.app_admin_radar_acao($1::uuid, 'sem_impacto', 'nota valida')`, [idLeve]);
const filas: Record<string, number> = {};
for (const f of ["todos", "graves", "leves", "pendentes", "em_andamento", "decididos"]) filas[f] = (await as(ADMIN, `select public.app_admin_radar_fila_detalhada($1) as f`, [f]))[0].f.length;
r.filas_inicio = filas;
const primeira = (await as(ADMIN, `select public.app_admin_radar_fila_detalhada('graves') as f`))[0].f[0];
r.exemplo_evento = { fonte: primeira.fonte.nome, gravidade: primeira.gravidade, aguarda_dono: primeira.aguarda_dono, itens: primeira.itens, analise: primeira.analise, afetados: primeira.afetados, itens_total: primeira.itens_total };
r.nota_obrigatoria = await tenta(ADMIN, `select public.app_admin_radar_acao($1::uuid, 'sem_impacto', '  ')`, [idGrave]);
r.acao_invalida = await tenta(ADMIN, `select public.app_admin_radar_acao($1::uuid, 'apagar', 'nota valida')`, [idGrave]);
r.revisor_parecer = await tenta(REV, `select public.app_admin_radar_parecer($1::uuid, 'Os 2 revisores concordam: mudança real de dose.')`, [idGrave]);
r.revisor_encaminha_grave = await tenta(REV, `select public.app_admin_radar_acao($1::uuid, 'encaminhar_revisao', 'parecer feito')`, [idGrave]);
r.dono_ainda_aguardado_apos_revisor = (await as(ADMIN, `select (public.app_admin_radar_avisos() ->> 'graves_pendentes')::int as n`))[0].n;
r.revisor_sem_impacto_grave = await tenta(REV, `select public.app_admin_radar_acao($1::uuid, 'sem_impacto', 'nota valida')`, [idGrave]);
r.revisor_sem_impacto_leve = await tenta(REV, `select public.app_admin_radar_acao($1::uuid, 'sem_impacto', 'só numeração')`, [idLeve]);
r.dono_refazer = await tenta(ADMIN, `select public.app_admin_radar_acao($1::uuid, 'refazer', 'Refazer a questão 1 com a dose nova')`, [idGrave]);
r.dono_depois_refazer = (await as(ADMIN, `select public.app_admin_radar_avisos() as a`))[0].a.graves_pendentes;
r.estado_depois_refazer = (await db.query(`select status, decisao_dono, nota from public.radar_eventos where id = $1`, [idGrave])).rows[0];
r.dono_sem_impacto = await tenta(ADMIN, `select public.app_admin_radar_acao($1::uuid, 'sem_impacto', 'Fonte já estava conferida')`, [idGrave2]);
r.afetados_apos_sem_impacto = (await db.query(`select status, count(*)::int as n from public.radar_afetados where evento_id = $1 group by 1`, [idGrave2])).rows;
r.dono_final = (await as(ADMIN, `select public.app_admin_radar_avisos() as a`))[0].a.graves_pendentes;
const filas2: Record<string, number> = {};
for (const f of ["todos", "graves", "leves", "pendentes", "em_andamento", "decididos"]) filas2[f] = (await as(ADMIN, `select public.app_admin_radar_fila_detalhada($1) as f`, [f]))[0].f.length;
r.filas_fim = filas2;
r.parecer_gravado = (await as(ADMIN, `select public.app_admin_radar_fila_detalhada('em_andamento') as f`))[0].f[0]?.parecer;
r.questions_tocadas = (await db.query<{ n: number }>(`select count(*)::int as n from public.questions`)).rows[0].n;
relatorio.comportamento = r;
fs.writeFileSync(SAIDA, JSON.stringify(relatorio, null, 1));
console.log(JSON.stringify(r, null, 1));
await db.close();
fs.rmSync(PASTA, { recursive: true, force: true });
