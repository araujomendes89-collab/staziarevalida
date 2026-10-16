// Rodada 2: monta a PRODUÇÃO DE HOJE (13/10/2026) em PGlite e guarda o diretório de dados (para a simulação não remontar).
//   base 23d53c1 + pacote 11/10 + COLAR-* + leva 3 (lib da fase1) → as 1.200 questões reais do export da produção de 12/10
//   (comentarios-agentes/questoes-1200.json, sha256 6cf1336b…, o mesmo que a carga das provas usou) → pacotes reais da leva 4 e
//   da leva 5 (Downloads) → o administrador araujomendes@staziamed.com.br e as 12 fontes reais da biblioteca (lidas da produção
//   por GET em 12/10, com trechos onde a produção tem) → pacote real das fontes oficiais (catálogo, colado em produção em 13/10).
// Uso: node monta-producao-hoje.mjs <export questoes-1200.json> <pasta incorporacao/prod> <saida.tar>
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
import { montaProducao } from "../fase1/lib.mjs";
const [EXPORT, PROD, OUT] = process.argv.slice(2);
const DL = "/Users/joaopaulomendes/Downloads/";
const ler = (f) => fs.readFileSync(f, "utf8");
const arqs = (dir, rx) => fs.readdirSync(dir).filter((f) => rx.test(f)).sort().map((f) => path.join(dir, f));
const t0 = Date.now(); const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
const sha = crypto.createHash("sha256").update(fs.readFileSync(EXPORT)).digest("hex");
if (sha !== "6cf1336b03ee48f08fb73ae815688e5ce0fb93176ed19ee06971eb31e0caeba4") throw new Error("export diferente do usado pela carga das provas: " + sha);
const db = await montaProducao(log);
// provas e questões reais (como a carga das provas faz no teste dela; título no formato "Revalida 2022/1")
const qs = JSON.parse(ler(EXPORT));
for (const ex of [...new Set(qs.map((q) => q.exam_id))]) {
  const [kind, year, sem] = ex.split("-");
  const title = `${kind === "enamed" ? "ENAMED" : "Revalida"} ${year}${sem ? "/" + sem : ""}`;
  await db.query(`insert into public.exams (id, kind, year, semester, title) values ($1,$2,$3,$4,$5) on conflict do nothing`, [ex, kind.toUpperCase(), Number(year), sem ? Number(sem) : null, title]);
}
for (const q of qs) {
  await db.query(`insert into public.questions (id, code, exam_id, number, area, specialty, topic, subtopic, statement, options, correct_option, status, key_finding, expected_conduct, inep_intent, needs_image, images, sources)
     values ($1,$2,$3,$4,$5::public.med_area,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [q.id, q.code, q.exam_id, q.number, q.area, q.specialty, q.topic, q.subtopic, q.statement, JSON.stringify(q.options), q.correct_option, q.status, q.key_finding, q.expected_conduct, q.inep_intent, q.needs_image, JSON.stringify(q.images), JSON.stringify(q.sources)]);
}
log(`questões reais: ${qs.length}`);
for (const f of [...arqs(DL + "publicacao-staziamed-2026-10-12-leva4", /^[1-4]-colar/), ...arqs(DL + "publicacao-staziamed-2026-10-12-leva5", /^[1-5]-colar/)]) {
  const r = await db.exec(ler(f)); const last = r[r.length - 1]?.rows?.[0] ?? {};
  log(`${path.basename(f).slice(0, 50)}: ${last.resultado}`);
}
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
await db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'araujomendes@staziamed.com.br');
  insert into public.user_roles (user_id, role) values ('${ADMIN}', 'admin') on conflict (user_id) do update set role = 'admin';`);
const prod = JSON.parse(ler(path.join(PROD, "ch_sources.json"))), deps = JSON.parse(ler(path.join(PROD, "dependentes.json")));
for (const s of prod) {
  await db.query(`insert into public.ch_sources (id, title, organ, kind, url, version, status, authority_level, audience, editorial_approved, created_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() - interval '1 day')`, [s.id, s.title, s.organ, s.kind, s.url, s.version, s.status, s.authority_level, s.audience, s.editorial_approved]);
  if (deps.find((x) => x.id === s.id)?.tem_trechos) await db.query(`insert into public.ch_source_passages (source_id, section, text) values ($1, 'teste', 'trecho de teste da fonte da produção')`, [s.id]);
}
log(`fontes reais da produção: ${prod.length}`);
const rf = await db.exec(ler(DL + "publicacao-staziamed-2026-10-12-fontes-oficiais/1-Fontes-oficiais.sql"));
log("fontes oficiais: " + JSON.stringify(rf[rf.length - 1]?.rows?.slice(0, 6)));
const cf = await db.exec(ler(DL + "publicacao-staziamed-2026-10-12-fontes-oficiais/0-CONFERIR.sql"));
log("conferir fontes oficiais: " + String(Object.values(cf[cf.length - 1].rows[0])[0]).slice(0, 160));
const blob = await db.dumpDataDir("none");
fs.writeFileSync(OUT, Buffer.from(await blob.arrayBuffer()));
log(`pronto -> ${OUT} ${(fs.statSync(OUT).size / 1e6).toFixed(0)} MB`);
await db.close();
