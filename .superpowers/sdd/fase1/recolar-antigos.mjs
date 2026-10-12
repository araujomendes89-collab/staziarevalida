// Cola de novo cada arquivo ANTIGO (pacote de 11/10, 9610, 9620/9621, DESLIGAR, leva 3) DEPOIS da leva 5 e depois recola a leva 3 e a leva 5 (9835..9892):
// o estado tem de voltar a ser o mesmo de antes (funções, gatilhos, políticas, permissões, colunas, restrições, índices, dados).
import fs from "node:fs"; import path from "node:path";
import { montaProducao, retrato, compara, sqlLeva, DL, PACOTE } from "./lib.mjs";
const L3 = DL + "/publicacao-staziamed-2026-10-12-leva3";
const arquivos = [
  ...fs.readdirSync(PACOTE).filter((f) => /^[1-7]-/.test(f)).sort().map((f) => path.join(PACOTE, f)),
  ...["COLAR-arena-equipe-fora-do-ranking.sql", "COLAR-fontes-oficiais-9610.sql", "COLAR-fonte-complementar-9620-9621.sql", "DESLIGAR-tetos-de-IA.sql"].map((f) => path.join(DL, f)),
  ...fs.readdirSync(L3).filter((f) => /^[1-4]-colar/.test(f)).sort().map((f) => path.join(L3, f)),
];
const secs = ["funcoes", "gatilhos", "politicas", "tabelas", "colunas", "restricoes", "indices", "enums", "dados"];
async function base() {
  const db = await montaProducao();
  await db.exec(`create schema if not exists storage; create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, created_at timestamptz default now(), metadata jsonb);`);
  for (let v = 0; v < 2; v++) for (const s of sqlLeva()) await db.exec(s);
  return db;
}
let ruins = 0;
for (const f of arquivos) {
  const db = await base(); const a = await retrato(db); let erro = null;
  try { await db.exec(fs.readFileSync(f, "utf8")); } catch (e) { erro = String(e.message).slice(0, 160); }
  const b = await retrato(db);
  const mud = compara(a.funcoes, b.funcoes, ["def", "acl"]).mudaram;
  for (const f3 of fs.readdirSync(L3).filter((x) => /^[1-4]-colar/.test(x)).sort()) await db.exec(fs.readFileSync(path.join(L3, f3), "utf8")); // a leva 3 do pacote, na ordem
  for (const s of sqlLeva()) await db.exec(s);
  const c = await retrato(db);
  const dif = secs.flatMap((k) => { const x = compara(a[k], c[k]); return [...x.novos, ...x.removidos, ...x.mudaram].map((y) => k + ":" + y); });
  if (dif.length || erro) ruins++;
  console.log(`${path.basename(f)}: ${erro ? "ERRO " + erro + "; " : ""}depois de colar, funções da leva 5 que mudam: ${mud.length ? mud.join(", ") : "nenhuma"}; depois de recolar a leva 3 (partes 1 a 4) e a leva 5: ${dif.length ? "DIFERE " + dif.slice(0, 6).join(", ") : "tudo igual ao de antes"}`);
  await db.close();
}
console.log(ruins ? `RESULTADO: ${ruins} arquivo(s) com problema` : "RESULTADO: recolar qualquer arquivo antigo e depois a leva 5 volta tudo ao mesmo estado");
