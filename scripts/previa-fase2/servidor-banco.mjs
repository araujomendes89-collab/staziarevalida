// PRÉVIA da 2ª fase (porta 31984): um Postgres de verdade em memória (PGlite) com TODAS as migrações do projeto, para as telas
// novas conversarem com as funções SQL reais (app_fase2_*). Tudo é DADO DE TESTE: nada daqui vai ao banco de produção.
// Dois bancos: ?db=vazio (as 10 estações de exemplo ainda PENDENTES de revisão médica, como no banco real hoje) e
//              ?db=dados (as mesmas 10 aprovadas + algumas estações já feitas).
// Uso (da raiz do projeto): node scripts/previa-fase2/servidor-banco.mjs
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STAFF = "00000000-0000-4000-8000-0000000000ad";
const ALUNO = "00000000-0000-4000-8000-0000000000b1";
const estacoes = JSON.parse(fs.readFileSync(path.join(raiz, "server/checklistBank/data/stations.seed.json"), "utf8"));

async function criar(aprovadas) {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(raiz, "supabase/tests/bootstrap.sql"), "utf8"));
  const dir = path.join(raiz, "supabase/migrations");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1, 'equipe@teste.dev'), ($2, 'aluno@teste.dev')`, [STAFF, ALUNO]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [STAFF]);
  for (const s of estacoes) {
    await db.query(
      `insert into public.checklist_stations (id, name, topic, area, setting, institution, medical_review, duration_ms) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [s.id, s.name, s.topic, s.area, s.setting ?? null, null, aprovadas ? "approved" : "pending", s.duration_ms ?? 600000]
    );
    await db.query(`insert into public.checklist_station_contents (station_id, content) values ($1, $2::jsonb)`, [s.id, JSON.stringify(s)]);
  }
  return db;
}

async function rpc(db, uid, fn, args = {}) {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    const r = await tx.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
    return r.rows[0].result;
  });
}

// algumas estações já feitas, com notas variadas (a mesma regra do aplicativo: marcar item a item)
async function preencher(db) {
  const planos = [
    ["seed-01", 1.0], ["seed-02", 0.7], ["seed-03", 0.55], ["seed-05", 0.9], ["seed-07", 0.4], ["seed-01", 0.8],
  ];
  for (const [id, taxa] of planos) {
    let t = await rpc(db, STAFF, "app_fase2_start", { p_station_id: id });
    t = await rpc(db, STAFF, "app_fase2_begin", { p_attempt_id: t.attempt_id });
    t = await rpc(db, STAFF, "app_fase2_finish", { p_attempt_id: t.attempt_id });
    const marks = {};
    t.checklist.forEach((i, k) => {
      const bom = ((k * 37 + id.length * 11) % 100) / 100 < taxa;
      marks[String(i.order)] = bom ? "correct" : i.partial != null && k % 2 === 0 ? "partial" : "incorrect";
    });
    await rpc(db, STAFF, "app_fase2_submit", { p_attempt_id: t.attempt_id, p_marks: marks });
    // espalha as datas para o gráfico de evolução
    await db.query(`update public.station_attempts set finished_at = now() - ($1 || ' days')::interval where id = $2`, [String(planos.length - planos.findIndex((p) => p[0] === id && p[1] === taxa)), t.attempt_id]);
  }
}

const bancos = {};
async function pegar(nome) {
  bancos[nome] ??= (async () => {
    const db = await criar(nome === "dados");
    if (nome === "dados") await preencher(db);
    return db;
  })();
  return bancos[nome];
}

http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.end();
  const url = new URL(req.url, "http://x");
  let corpo = "";
  for await (const c of req) corpo += c;
  try {
    const { fn, args } = JSON.parse(corpo || "{}");
    const nome = url.searchParams.get("db") === "dados" ? "dados" : "vazio";
    const data = await rpc(await pegar(nome), STAFF, fn, args);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data }));
  } catch (e) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e.message ?? e) }));
  }
}).listen(31984, "127.0.0.1", () => console.log("banco de teste da 2ª fase em http://127.0.0.1:31984"));
