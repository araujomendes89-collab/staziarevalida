// Monta o banco de teste (PGlite, todas as migrações do ramo), importa a GR-001 v3 e a ficha pelas funções oficiais, faz algumas ações da equipe e
// guarda o que as funções devolvem (dados.json) para a tela ser fotografada com dados REAIS do banco, sem servidor. Nenhuma IA, nenhuma chave.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WT = path.resolve(AQUI, "../../../..");
const { PGlite } = await import(pathToFileURL(path.join(WT, "node_modules/@electric-sql/pglite/dist/index.js")).href);
const fx = (n) => JSON.parse(fs.readFileSync(path.join(WT, "src/__tests__/fixtures", n), "utf8"));
const ADMIN = "00000000-0000-4000-8000-0000000083ad", EDITOR = "00000000-0000-4000-8000-0000000083ed", REVISOR = "00000000-0000-4000-8000-0000000083c1";
const db = new PGlite();
await db.exec(fs.readFileSync(path.join(WT, "supabase/tests/bootstrap.sql"), "utf8"));
for (const f of fs.readdirSync(path.join(WT, "supabase/migrations")).filter((f) => f.endsWith(".sql") && !f.startsWith("._")).sort()) await db.exec(fs.readFileSync(path.join(WT, "supabase/migrations", f), "utf8"));
for (const [id, email] of [[ADMIN, "adm@staziamed.com.br"], [EDITOR, "editor@staziamed.com.br"], [REVISOR, "revisor@staziamed.com.br"]]) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
await db.exec(`update public.user_roles set role='admin' where user_id='${ADMIN}'; update public.user_roles set role='editor' where user_id='${EDITOR}'; insert into public.ch_reviewer_areas values ('${REVISOR}','CLINICA_MEDICA');`);
const arg = (v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);
const rpc = (uid, fn, args = {}) => db.transaction(async (tx) => {
  await tx.exec(`set local role authenticated`); await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
  const k = Object.keys(args); return (await tx.query(`select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(", ")}) as r`, k.map((x) => arg(args[x])))).rows[0].r;
});
for (const f of fx("aula-pronta-GR-001-v3-fontes.json").fontes) { const r = await rpc(ADMIN, "app_ch_register_source", { p_source: { title: f.title, organ: f.organ, kind: f.kind, url: f.url, version: f.version } }); await rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: r.id, p_level: f.level }); }
const imp = await rpc(EDITOR, "app_ch_import_lesson_package", { p_package: fx("aula-pronta-GR-001-v3.json") });
const V = imp.version_id;
await rpc(EDITOR, "app_ch_review_sheet_import", { p_version_id: V, p_sheet: fx("ficha-revisor-GR-001-v3.json"), p_origin_name: "para-o-revisor-medico.md (v3)" });
for (const n of [1, 2, 3]) await rpc(ADMIN, "app_ch_review_decide", { p_version_id: V, p_n: n, p_decision: "de_acordo", p_note: n === 1 ? "Cenário, como está." : null });
const items = await rpc(EDITOR, "app_ch_unit_materials", { p_version_id: V });
await rpc(EDITOR, "app_ch_unit_material_insert", { p_version_id: V, p_item: { kind: "video", title: "Como colher o escarro (vídeo de apoio)", url: "https://youtu.be/dQw4w9WgXcQ", duration_seconds: 125, position: 2, caption: "Vídeo curto de apoio para a seção do diagnóstico." } });
await rpc(EDITOR, "app_ch_unit_material_retire", { p_item_id: items.find((x) => x.kind === "story").id, p_reason: "Story fora da campanha desta semana." });
const out = {};
out.versionId = V;
out.units = await rpc(EDITOR, "app_ch_units");
out.list = await rpc(EDITOR, "app_ch_unit_overview_list");
out.versao = await rpc(EDITOR, "app_ch_unit_version", { p_version_id: V });
out.overview = await rpc(ADMIN, "app_ch_unit_overview", { p_version_id: V });
out.materials = await rpc(EDITOR, "app_ch_unit_materials", { p_version_id: V });
out.sheet = await rpc(ADMIN, "app_ch_review_sheet", { p_version_id: V });
out.history = await rpc(EDITOR, "app_ch_unit_history", { p_version_id: V });
out.summary = await rpc(ADMIN, "app_ch_approval_summary", { p_version_id: V });
out.preview = await rpc(EDITOR, "app_ch_unit_student_preview", { p_version_id: V });
fs.writeFileSync(path.join(AQUI, "dados.json"), JSON.stringify(out));
console.log("dados.json: unidade", out.overview.unit.code, "versão", out.overview.version.version, out.overview.version.status, "| materiais", out.materials.length, "| afirmações", out.overview.afirmacoes.total, "| histórico", out.history.length);
await db.close();
