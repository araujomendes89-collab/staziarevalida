// Prévia da EXPANSÃO do editor profissional (Questões, Inéditas, Atualizações, Podcasts, Central): as telas de verdade com um
// BANCO DE TESTE (PGlite, em memória, com TODAS as migrações do ramo). Sem Supabase, sem login real, sem chaves do .env, sem IA.
// Tudo o que for salvo some ao parar o servidor. Cada aba escolhe quem está "logado": equipe (administrador) ou aluno.
// Uso (da raiz do worktree): npx vite --config scripts/previa-ed-expansao/vite.config.mjs
// "Antes" (para comparar): PREVIA_RAIZ=<worktree do main> PREVIA_PORTA=32042 npx vite --config scripts/previa-ed-expansao/vite.config.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = process.env.PREVIA_RAIZ ? path.resolve(process.env.PREVIA_RAIZ) : path.resolve(here, "../..");
const porta = Number(process.env.PREVIA_PORTA || 32041);

function bancoDeTeste() {
  let pronto = null;
  // mesmo banco dos testes (src/__tests__/helpers/publicacaoCentral.ts: bootstrap + todas as migrações + 5 pessoas de teste)
  const abrir = async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { semear } = await import(path.join(here, "semente.mjs"));
    const db = new PGlite();
    await db.exec(fs.readFileSync(path.join(raiz, "supabase/tests/bootstrap.sql"), "utf8"));
    const dir = path.join(raiz, "supabase/migrations");
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql") && !f.startsWith("._")).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    const sql = async (q, p = []) => (await db.query(q, p)).rows;
    // lista vai como array do Postgres (text[]); se o parâmetro for jsonb, tenta de novo como JSON (o PostgREST sabe o tipo; aqui não)
    const arg = (v, lista) => (v !== null && typeof v === "object" && (lista || !Array.isArray(v)) ? JSON.stringify(v) : v);
    const chamar = (uid, fn, args, lista) =>
      db.transaction(async (tx) => {
        await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
        const k = Object.keys(args);
        const r = await tx.query(`select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(", ")}) as result`, k.map((x) => arg(args[x], lista)));
        return r.rows[0].result;
      });
    const rpc = (uid, fn, args = {}) =>
      chamar(uid, fn, args, false).catch((e) => {
        if (Object.values(args).some(Array.isArray) && /json|array|does not exist/i.test(String(e?.message))) return chamar(uid, fn, args, true);
        throw e;
      });
    const U = { ADMIN: "00000000-0000-4000-8000-0000000083ad", EDITOR: "00000000-0000-4000-8000-0000000083ed", REVISOR: "00000000-0000-4000-8000-0000000083c1", ALUNO: "00000000-0000-4000-8000-0000000083a1" };
    for (const [id, email] of [[U.ADMIN, "adm83@t.dev"], [U.EDITOR, "ed83@t.dev"], [U.REVISOR, "rev83@t.dev"], [U.ALUNO, "al83@t.dev"]])
      await sql(`insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing`, [id, email]);
    await sql(`update public.user_roles set role = 'admin' where user_id = $1`, [U.ADMIN]);
    await sql(`update public.user_roles set role = 'editor' where user_id = $1`, [U.EDITOR]);
    const b = { db, sql, rpc };
    const quem = { equipe: U.ADMIN, editor: U.EDITOR, revisor: U.REVISOR, aluno: U.ALUNO };
    const dados = await semear({ ...b, U, raiz });
    console.log("[prévia] banco de teste pronto:", JSON.stringify(dados));
    return { ...b, quem, dados };
  };
  return {
    name: "banco-de-teste-pglite",
    configureServer(server) {
      server.middlewares.use("/__previa", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        try {
          pronto ??= abrir().catch((e) => {
            pronto = null;
            throw e;
          });
          const b = await pronto;
          if (req.url.startsWith("/dados")) return res.end(JSON.stringify(b.dados));
          let corpo = "";
          for await (const c of req) corpo += c;
          const { quem, fn, args } = JSON.parse(corpo || "{}");
          if (!/^[a-z_0-9]+$/.test(fn ?? "")) throw new Error("função inválida");
          const data = await b.rpc(b.quem[quem] ?? null, fn, args ?? {});
          res.end(JSON.stringify({ data: data ?? null }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: String(e?.message || e) }));
        }
      });
    },
  };
}

export default defineConfig({
  root: here,
  publicDir: path.join(raiz, "public"),
  plugins: [react(), bancoDeTeste()],
  resolve: {
    alias: [
      { find: /^(\.\.?\/)+session\.jsx$/, replacement: path.join(here, "sessaoTeste.jsx") },
      { find: /^@raiz\//, replacement: raiz + "/" },
    ],
  },
  server: { port: porta, strictPort: true, host: "127.0.0.1", fs: { allow: [raiz, here] } },
  ssr: { external: ["@electric-sql/pglite"] },
  cacheDir: `/Volumes/StaziaMed/.tmp-aulas/editor-pro/vite-cache-expansao-${porta}`,
});
