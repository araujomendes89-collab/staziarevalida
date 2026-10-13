// Sobe um PGlite com todas as migrações (e cola a 9920 de novo, 2 vezes) para conferir que a estrutura entra sem erro.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { PGlite } = await import(pathToFileURL(path.join(WT, "node_modules/@electric-sql/pglite/dist/index.js")).href);
const MIG = path.join(WT, "supabase/migrations");
const db = new PGlite();
await db.exec(fs.readFileSync(path.join(WT, "supabase/tests/bootstrap.sql"), "utf8"));
const files = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) { try { await db.exec(fs.readFileSync(path.join(MIG, f), "utf8")); } catch (e) { console.log("ERRO", f, e.message); process.exit(1); } }
const nova = files.find((f) => f.includes("009920"));
for (let i = 0; i < 2; i++) await db.exec(fs.readFileSync(path.join(MIG, nova), "utf8"));
console.log("ok", files.length, "migracoes; 9920 colada 3x");
