/**
 * Gera supabase/seed.sql (ver scripts/supabase/seed-builder.ts).
 * Uso: npm run supabase:seed
 */
import fs from "fs";
import path from "path";
import { buildSeedRows, buildSeedStatements } from "./seed-builder";
import { buildEngineStatements } from "./engine-seed";

const out = path.resolve("supabase/seed.sql");
const sql = ["-- Gerado por scripts/supabase/build-seed.ts. Não editar à mão.", "begin;", ...buildSeedStatements(), ...buildEngineStatements(), "commit;", ""].join("\n");
fs.writeFileSync(out, sql);
const r = buildSeedRows();
console.log(
  `[seed] ${out}: ${r.exams.length} provas, ${r.questions.length} questões, ${r.stations.length} estações, ${r.events.length} simulado(s) — ${(sql.length / 1024 / 1024).toFixed(1)} MB`
);
