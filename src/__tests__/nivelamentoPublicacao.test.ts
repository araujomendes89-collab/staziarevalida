// @vitest-environment node
// Ensaio da publicação do nivelamento (16/10/2026): a migração 012300 roda de novo sem erro, a conferência responde OK,
// o desfazer devolve app_today ao corpo da 000800 (o de produção) e a migração volta a entrar por cima do desfazer.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import { openStaziaEnv, type StaziaEnv, USERS } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 300_000 });

const raiz = path.resolve(__dirname, "../..");
const ler = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");
const MIGRACAO = ler("supabase/migrations/20261003012300_nivelamento_diagnostico.sql");
const DESFAZER = ler("supabase/desfazer/20261003012300_nivelamento_diagnostico.desfazer.sql");
const CONFERIR = ler("supabase/conferir/nivelamento-diagnostico.sql");
const BASE_000800 = ler("supabase/migrations/20261003000800_home_api.sql");

/** Corpo de app_today sem comentários e espaços, para comparar versões. */
const corpo = (def: string) =>
  def
    .slice(def.indexOf("declare"), def.lastIndexOf("end"))
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();

describe("Nivelamento - ensaio da publicação (migração, conferência e desfazer)", () => {
  let env: StaziaEnv;
  const conferir = async () => (await env.sql<{ resultado: string }>(CONFERIR))[0].resultado;
  const appToday = async () =>
    (await env.sql<{ d: string }>(`select pg_get_functiondef('public.app_today(boolean)'::regprocedure) as d`))[0].d;

  beforeAll(async () => {
    env = await openStaziaEnv();
  }, 600_000);
  afterAll(async () => {
    if (env) await env.close();
  });

  it("conferência OK com todas as migrações, e a 012300 roda de novo sem erro", async () => {
    expect(await conferir()).toMatch(/^OK: /);
    await env.dev.db.exec(MIGRACAO);
    expect(await conferir()).toMatch(/^OK: /);
  });

  it("app_today da 012300 = corpo da 000800 (produção) + só o bloco do nivelamento", async () => {
    const atual = corpo(await appToday());
    const m = BASE_000800.match(/create function public\.app_today[\s\S]*?\n\$\$;/);
    const base = corpo(m![0]);
    // tirando as linhas do nivelamento, sobra exatamente o corpo de produção
    const semNivelamento = atual
      .replace(" v_niv jsonb;", "")
      .replace(" v_niv := public.app_nivelamento_prioridades();", "")
      .replace(
        / if v_niv is not null then delete from public\.plan_tasks [^;]*'diagnostic'; end if;/,
        ""
      )
      .replace(/ if v_niv is not null then v_area := [\s\S]*?v_count \* 2\); elsif v_attempts < 10 then/, " if v_attempts < 10 then");
    expect(semNivelamento).toBe(base);
  });

  it("aluno novo sem diagnóstico: Plano de hoje igual ao de antes (diagnóstico inicial de 10)", async () => {
    const hoje = await env.rpc<any>(USERS.TESTE, "app_today", {});
    expect(hoje.tasks.find((t: any) => t.kind === "praticar")?.ref?.reason).toBe("diagnostic");
  });

  it("desfazer devolve app_today ao corpo de produção, apaga as funções e guarda os dados; refazer volta ao OK", async () => {
    await env.dev.db.exec(DESFAZER);
    await env.dev.db.exec(DESFAZER); // pode rodar duas vezes
    const m = BASE_000800.match(/create function public\.app_today[\s\S]*?\n\$\$;/);
    expect(corpo(await appToday())).toBe(corpo(m![0]));
    const [{ n }] = await env.sql<{ n: number }>(
      `select count(*)::int as n from pg_proc where pronamespace = 'public'::regnamespace and proname like '%nivelamento%'`
    );
    expect(n).toBe(0);
    expect(await conferir()).toMatch(/^FALTA: .*app_today sem o nivelamento/);
    expect(await conferir()).not.toMatch(/tabela nivelamento/);
    const hoje = await env.rpc<any>(USERS.TESTE, "app_today", {});
    expect(Array.isArray(hoje.tasks)).toBe(true);

    await env.dev.db.exec(MIGRACAO);
    expect(await conferir()).toMatch(/^OK: /);
  });
});
