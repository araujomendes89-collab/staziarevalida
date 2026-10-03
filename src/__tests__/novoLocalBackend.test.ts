// @vitest-environment node
/**
 * Camada de dados do app novo no modo local (PGlite): mesma interface do Supabase,
 * mesmas migrações e políticas de acesso.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { createLocalBackend, migrateLocalDatabase } from "../novo/data/localBackend";
import { BackendError, type Backend } from "../novo/data/backend";

const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");
let backend: Backend;

beforeAll(async () => {
  backend = await createLocalBackend({ persist: false, seed: false });
}, 60_000);

describe("App novo — camada de dados (modo local)", () => {
  it("cadastro entra direto e o bootstrap traz perfil, papel e teste de 7 dias", async () => {
    const seen: (string | null)[] = [];
    const stop = backend.onAuthChange((u) => seen.push(u?.email ?? null));

    const result = await backend.signUp("Ana Lima", "  Ana@Teste.dev ", "senha-segura");
    expect(result.needsEmailConfirmation).toBe(false);
    expect((await backend.getUser())?.email).toBe("ana@teste.dev");
    expect(seen).toEqual(["ana@teste.dev"]);
    stop();

    const boot = await backend.rpc<any>("app_bootstrap");
    expect(boot.profile).toMatchObject({ name: "Ana Lima", phase: 1, theme: "light" });
    expect(boot).toMatchObject({ role: "student", has_pro: false, streak_days: 0, flashcards_due: 0, days_to_exam: null });
    expect(boot.subscription).toMatchObject({ plan: "trial", status: "trialing" });
  });

  it("atualiza o perfil só nos campos permitidos", async () => {
    const boot = await backend.rpc<any>("app_update_profile", { p_patch: { phase: 2, name: "Ana L.", exam_date: "2099-01-01" } });
    expect(boot.profile).toMatchObject({ phase: 2, name: "Ana L." });
    expect(boot.days_to_exam).toBeGreaterThan(1000);

    await expect(backend.rpc("app_update_profile", { p_patch: { role: "admin" } })).rejects.toThrow(/não permitido/);
  });

  it("só chama funções app_* com argumentos p_*", async () => {
    await expect(backend.rpc("handle_new_user")).rejects.toThrow(/Função não permitida/);
    await expect(backend.rpc("app_bootstrap", { "x); drop table public.profiles; --": 1 })).rejects.toThrow(/Argumento inválido/);
  });

  it("valida e-mail, senha e conta duplicada; senha errada não entra", async () => {
    await expect(backend.signUp("B", "sem-arroba", "senha-segura")).rejects.toMatchObject({ code: "invalid_email" });
    await expect(backend.signUp("B", "b@teste.dev", "curta")).rejects.toMatchObject({ code: "weak_password" });
    await expect(backend.signUp("Ana 2", "ana@teste.dev", "senha-segura")).rejects.toMatchObject({ code: "email_taken" });

    await backend.signOut();
    expect(await backend.getUser()).toBeNull();
    await expect(backend.signIn("ana@teste.dev", "errada")).rejects.toBeInstanceOf(BackendError);
    await backend.signIn("ANA@teste.dev", "senha-segura");
    expect((await backend.rpc<any>("app_bootstrap")).profile.name).toBe("Ana L.");
  });

  it("sem login, o bootstrap não traz perfil de ninguém", async () => {
    await backend.signOut();
    const boot = await backend.rpc<any>("app_bootstrap");
    expect(boot.profile).toBeNull();
    expect(boot.subscription).toBeNull();
  });

  it("troca a senha de quem está logado", async () => {
    await backend.signIn("ana@teste.dev", "senha-segura");
    await expect(backend.updatePassword("curta")).rejects.toMatchObject({ code: "weak_password" });
    await backend.updatePassword("outra-senha-1");
    await backend.signOut();
    await expect(backend.updatePassword("outra-senha-2")).rejects.toMatchObject({ code: "invalid_credentials" });
    await expect(backend.signIn("ana@teste.dev", "senha-segura")).rejects.toMatchObject({ code: "invalid_credentials" });
    await backend.signIn("ana@teste.dev", "outra-senha-1");
    expect((await backend.getUser())?.email).toBe("ana@teste.dev");
  });

  it("um aluno não enxerga o perfil de outro", async () => {
    await backend.signUp("Bruno", "bruno@teste.dev", "senha-segura");
    const boot = await backend.rpc<any>("app_bootstrap");
    expect(boot.profile.name).toBe("Bruno");
  });
});

describe("App novo — atualização do banco local", () => {
  const all = Object.fromEntries(
    fs
      .readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => [`../../../supabase/migrations/${f}`, fs.readFileSync(path.join(MIGRATIONS, f), "utf8")])
  );
  const names = Object.keys(all).sort();
  // Banco "antigo": parado antes da migração de treino (…0700), que cria app_get_session.
  const older = Object.fromEntries(names.filter((n) => path.basename(n) < "20261003000700").map((n) => [n, all[n]]));

  it("aplica só as migrações que faltam e preserva as contas; a carga roda de novo", async () => {
    const db = new PGlite();
    let seeded = 0;
    const seed = async () => (seeded++, [] as string[]);

    expect(await migrateLocalDatabase(db, older, seed)).toBe("ready");
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'ana@teste.dev', '{"name":"Ana"}')`, [
      "00000000-0000-4000-8000-00000000000a",
    ]);
    expect((await db.query<any>(`select to_regprocedure('public.app_get_session(uuid)') is null as missing`)).rows[0].missing).toBe(true);

    expect(await migrateLocalDatabase(db, all, seed)).toBe("ready");
    expect((await db.query<any>(`select to_regprocedure('public.app_get_session(uuid)') is null as missing`)).rows[0].missing).toBe(false);
    expect((await db.query<any>(`select name from public.profiles`)).rows).toEqual([{ name: "Ana" }]);
    expect((await db.query<any>(`select count(*)::int as n from local_meta.migrations`)).rows[0].n).toBe(names.length);
    expect(seeded).toBe(2);

    expect(await migrateLocalDatabase(db, all, seed)).toBe("ready");
    expect(seeded).toBe(2);
  }, 60_000);

  it("migração já aplicada que mudou ou sumiu pede para recriar o banco", async () => {
    const db = new PGlite();
    await migrateLocalDatabase(db, all, null);
    const edited = { ...all, [names[0]]: `${all[names[0]]}\n-- alterada` };
    expect(await migrateLocalDatabase(db, edited, null)).toBe("drift");
    expect(await migrateLocalDatabase(db, older, null)).toBe("drift");
  }, 60_000);
});
