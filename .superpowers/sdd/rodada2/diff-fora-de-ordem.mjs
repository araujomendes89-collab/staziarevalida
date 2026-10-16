import fs from "node:fs"; import path from "node:path";
import { PGlite } from "../fase1/lib.mjs";
const [PROD, FINAL, R2] = process.argv.slice(2);
const abre = async (t) => { const d = new PGlite({ loadDataDir: new Blob([fs.readFileSync(t)]) }); await d.waitReady; return d; };
const pastas = fs.readdirSync(R2).filter((d) => /^\d-/.test(d)).sort();
const arqs = (d) => fs.readdirSync(path.join(R2, d)).filter((f) => /^[1-9][-\d]*-.*\.sql$/.test(f)).sort().map((f) => path.join(R2, d, f));
console.log("abrindo"); const db = await abre(PROD); console.log("aberto");
for (const d of [pastas[3], pastas[2], pastas[0], pastas[1], pastas[3], pastas[4]]) for (const f of arqs(d)) await db.exec(fs.readFileSync(f, "utf8"));
console.log("colado"); const ok = await abre(FINAL); console.log("final aberto");
const rows = async (x) => new Map((await x.query(`select id, to_jsonb(q) - 'updated_at' - 'created_at' j from public.questions q`)).rows.map((r) => [r.id, r.j]));
const a = await rows(ok), b = await rows(db);
const campos = {}; let n = 0;
for (const [id, ja] of a) { const jb = b.get(id); for (const k of Object.keys(ja)) if (JSON.stringify(ja[k]) !== JSON.stringify(jb?.[k])) { campos[k] = (campos[k] ?? 0) + 1; if (k === "comment_review" && n++ < 2) console.log(id, JSON.stringify(ja[k]).slice(0, 300), "\n  X ", JSON.stringify(jb?.[k]).slice(0, 300)); } }
// dentro de comment_review: quais chaves diferem
const sub = {};
const walk = (x, y, pre) => { if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x)) { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], pre + "." + k); } else if (JSON.stringify(x) !== JSON.stringify(y)) { sub[pre] = (sub[pre] ?? 0) + 1; if (sub[pre] === 1) console.log("  exemplo", pre, JSON.stringify(x)?.slice(0, 120), "x", JSON.stringify(y)?.slice(0, 120)); } };
for (const [id, ja] of a) walk(ja.comment_review, b.get(id)?.comment_review, "comment_review");
console.log(campos, sub);
process.exit(0);
