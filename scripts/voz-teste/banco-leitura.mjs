// Conexão SÓ DE LEITURA ao banco (produção) para medir a busca do cérebro do Tutor. Nunca grava nada:
//  - a sessão fica em "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY" (qualquer escrita dá erro no próprio banco);
//  - a URL vem de SUPABASE_DB_URL (.env do worktree ou da pasta oficial) e nunca é impressa.
// O cliente "pg" não está no projeto: fica instalado à parte em /Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro/deps
// (ou na pasta de PG_DEPS_DIR), para não mexer em package.json.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "../..");
const DEPS = process.env.PG_DEPS_DIR || "/Volumes/StaziaMed/.tmp-aulas/tutor-personagens/cerebro/deps";

function lerEnv(arquivo) {
  const out = {};
  if (!fs.existsSync(arquivo)) return out;
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (v.length >= 2 && v[0] === v.at(-1) && (v[0] === '"' || v[0] === "'")) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

export function envProjeto() {
  const oficial = path.resolve(raiz, "../../..", ".env"); // pasta oficial (o worktree fica em .claude/worktrees/<nome>)
  return { ...lerEnv(oficial), ...lerEnv(path.join(raiz, ".env")), ...process.env };
}

/** Região do banco tirada do endereço (ex.: aws-0-sa-east-1), sem imprimir usuário nem senha. */
export function regiaoDoBanco(url) {
  try {
    const host = new URL(url).hostname;
    const m = host.match(/aws-\d+-([a-z]+-[a-z]+-\d)/);
    return m ? m[1] : host.endsWith(".supabase.co") ? "conexão direta (db.<projeto>.supabase.co)" : "desconhecida";
  } catch {
    return "desconhecida";
  }
}

export async function abrirLeitura() {
  const env = envProjeto();
  const url = env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL ausente no .env");
  const req = createRequire(path.join(DEPS, "package.json"));
  const { Client } = req("pg");
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: "medicao-cerebro-tutor-leitura" });
  await c.connect();
  await c.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  await c.query("SET statement_timeout = '20s'");
  const ro = (await c.query("show transaction_read_only")).rows[0].transaction_read_only;
  if (ro !== "on") {
    await c.end();
    throw new Error("A sessão não ficou só de leitura; parei sem consultar nada.");
  }
  return { c, regiao: regiaoDoBanco(url) };
}

export function estatistica(ms) {
  const v = [...ms].sort((a, b) => a - b);
  const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))];
  const media = v.reduce((s, x) => s + x, 0) / v.length;
  return { n: v.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), min: +v[0].toFixed(1), max: +v.at(-1).toFixed(1), media: +media.toFixed(1) };
}
