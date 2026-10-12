// Monta a producao simulada uma vez e guarda o diretorio de dados do PGlite (para rodar as verificacoes sem remontar).
import fs from "node:fs"; import { montaProducao } from "./lib.mjs";
const out = process.argv[2];
const t0 = Date.now();
const db = await montaProducao((m) => console.log(m));
const blob = await db.dumpDataDir("none");
fs.writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
console.log("pronto em", ((Date.now() - t0) / 1000).toFixed(0), "s ->", out, (fs.statSync(out).size / 1e6).toFixed(0), "MB");
await db.close();
