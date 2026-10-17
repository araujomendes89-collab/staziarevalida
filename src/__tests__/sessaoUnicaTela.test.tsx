/**
 * Sessão única na tela (src/novo/app/session.jsx + auth/SessaoDerrubada.jsx + App.jsx): dois "aparelhos" ligados ao MESMO
 * banco de verdade (PGlite com todas as migrações). Cada aparelho é um backend com o seu identificador de login (no Supabase,
 * o session_id do token); duas abas do mesmo navegador usam o mesmo identificador.
 */
import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { createLocalCore, type LocalCore } from "../novo/data/localCore";

let proximo: any = null;
vi.mock("../novo/data", async (orig) => ({ ...(await orig<any>()), getBackend: async () => proximo }));

import { SessionProvider, useSession } from "../novo/app/session.jsx";
import { App } from "../novo/app/App.jsx";
import { SESSAO_DERRUBADA_TEXTO } from "../novo/app/auth/SessaoDerrubada.jsx";
import { EVENTO_SESSAO_DERRUBADA, guardarAvisoDerrubada, lerAvisoDerrubada, resumoAparelho, quandoEntrou } from "../novo/app/sessaoUnica.js";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

let pg: PGlite;
let core: LocalCore;
let seq = 0;

async function novaConta(role: "student" | "admin" = "student") {
  const id = `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, "0")}`;
  await pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `tela${seq}@teste.dev`, { name: `Tela ${seq}` }]);
  if (role !== "student") await pg.query(`update public.user_roles set role = $2 where user_id = $1`, [id, role]);
  return { id, email: `tela${seq}@teste.dev` };
}

/** Um aparelho (ou uma aba): backend com o identificador do login e o banco de verdade por trás. */
function aparelho(user: { id: string; email: string }, sessionId: string) {
  let atual: any = user;
  const ouvintes = new Set<(u: any) => void>();
  return {
    mode: "local",
    getUser: async () => atual,
    onAuthChange: (cb: (u: any) => void) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    signOut: vi.fn(async () => {
      atual = null;
      ouvintes.forEach((cb) => cb(null));
    }),
    rpc: (fn: string, args: Record<string, unknown> = {}) => core.rpc(atual, fn, args),
    sessionId: async () => sessionId,
  };
}

const sessoes: Record<string, any> = {};
function Probe({ nome }: { nome: string }) {
  sessoes[nome] = useSession();
  return <p data-testid={nome}>{sessoes[nome].status}</p>;
}
async function abrir(nome: string, backend: any) {
  proximo = backend;
  render(
    <SessionProvider>
      <Probe nome={nome} />
    </SessionProvider>
  );
  await waitFor(() => expect(sessoes[nome].status).toBe("ready"), { timeout: 15_000 });
}
const regra = (cfg: Record<string, boolean>) => pg.query(`update public.app_sessao_unica_config set ativa = coalesce(($1::jsonb ->> 'ativa')::boolean, ativa), incluir_equipe = coalesce(($1::jsonb ->> 'incluir_equipe')::boolean, incluir_equipe), incluir_revisores = coalesce(($1::jsonb ->> 'incluir_revisores')::boolean, incluir_revisores)`, [JSON.stringify(cfg)]);

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  core = createLocalCore(pg);
}, 240_000);

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await pg.query(`update public.app_sessao_unica_config set ativa = true, incluir_equipe = false, incluir_revisores = false`);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Sessão única — dois aparelhos com o banco de verdade", () => {
  it("o segundo aparelho entra e o primeiro sai na próxima conferência, só neste navegador e com o aviso", async () => {
    const conta = await novaConta();
    const a = aparelho(conta, "tela-aparelho-a");
    const b = aparelho(conta, "tela-aparelho-b");
    await abrir("a", a);
    await abrir("b", b); // B entra: no banco, A deixa de valer

    let continua: boolean | undefined;
    await act(async () => {
      continua = await sessoes.a.confirmarSessao();
    });
    expect(continua).toBe(false);
    expect(sessoes.a.status).toBe("signed-out");
    expect(sessoes.a.derrubada).toMatchObject({ aparelho: resumoAparelho() });
    // sai só deste navegador: o login do outro aparelho continua
    expect(a.signOut).toHaveBeenCalledWith({ localOnly: true });
    expect(lerAvisoDerrubada()).toMatchObject({ aparelho: resumoAparelho() });

    await act(async () => {
      continua = await sessoes.b.confirmarSessao();
    });
    expect(continua).toBe(true);
    expect(sessoes.b.status).toBe("ready");
    expect(b.signOut).not.toHaveBeenCalled();
  }, 30_000);

  it("ENTRAR NOVAMENTE: login novo (sessão nova) no aparelho A derruba o B", async () => {
    const conta = await novaConta();
    await abrir("a", aparelho(conta, "tela-volta-a"));
    const b = aparelho(conta, "tela-volta-b");
    await abrir("b", b);
    await act(async () => {
      await sessoes.a.confirmarSessao();
    });
    expect(sessoes.a.status).toBe("signed-out");
    act(() => sessoes.a.entrarNovamente());
    expect(sessoes.a.derrubada).toBeNull();
    expect(lerAvisoDerrubada()).toBeNull();

    await abrir("a2", aparelho(conta, "tela-volta-a-login-novo"));
    await act(async () => {
      await sessoes.b.confirmarSessao();
    });
    expect(sessoes.b.status).toBe("signed-out");
    expect(b.signOut).toHaveBeenCalledWith({ localOnly: true });
  }, 30_000);

  it("a sessão derrubada não volta recarregando a página: abre direto no aviso", async () => {
    const conta = await novaConta();
    await abrir("a", aparelho(conta, "tela-recarrega-a"));
    await abrir("b", aparelho(conta, "tela-recarrega-b"));
    cleanup();
    // "recarregar" o aparelho A (o mesmo login de antes)
    const a = aparelho(conta, "tela-recarrega-a");
    proximo = a;
    render(
      <SessionProvider>
        <Probe nome="a" />
      </SessionProvider>
    );
    await waitFor(() => expect(sessoes.a.status).toBe("signed-out"), { timeout: 15_000 });
    expect(sessoes.a.derrubada).toBeTruthy();
    expect(a.signOut).toHaveBeenCalledWith({ localOnly: true });
  }, 30_000);

  it("mesma pessoa em duas abas do mesmo navegador não é derrubada", async () => {
    const conta = await novaConta();
    await abrir("aba1", aparelho(conta, "tela-mesmo-navegador"));
    await abrir("aba2", aparelho(conta, "tela-mesmo-navegador"));
    for (const nome of ["aba1", "aba2", "aba1"]) {
      let continua: boolean | undefined;
      await act(async () => {
        continua = await sessoes[nome].confirmarSessao();
      });
      expect(continua).toBe(true);
      expect(sessoes[nome].status).toBe("ready");
    }
  }, 30_000);

  it("chave desligada: nada muda", async () => {
    await regra({ ativa: false });
    const conta = await novaConta();
    const a = aparelho(conta, "tela-desligada-a");
    await abrir("a", a);
    await abrir("b", aparelho(conta, "tela-desligada-b"));
    await act(async () => {
      await sessoes.a.confirmarSessao();
    });
    expect(sessoes.a.status).toBe("ready");
    expect(a.signOut).not.toHaveBeenCalled();
  }, 30_000);

  it("equipe: com incluir_equipe desligado não sai; ligado, sai", async () => {
    const conta = await novaConta("admin");
    const a = aparelho(conta, "tela-equipe-a");
    await abrir("a", a);
    await abrir("b", aparelho(conta, "tela-equipe-b"));
    await act(async () => {
      await sessoes.a.confirmarSessao();
    });
    expect(sessoes.a.status).toBe("ready");

    await regra({ incluir_equipe: true });
    cleanup();
    const a2 = aparelho(conta, "tela-equipe-a");
    await abrir("a", a2);
    await abrir("b", aparelho(conta, "tela-equipe-b"));
    await act(async () => {
      await sessoes.a.confirmarSessao();
    });
    expect(sessoes.a.status).toBe("signed-out");
    expect(a2.signOut).toHaveBeenCalledWith({ localOnly: true });
  }, 30_000);
});

describe("Sessão única — quando o app confere", () => {
  function simulado(vigente: () => boolean) {
    let realtime: (() => void) | null = null;
    const backend: any = {
      mode: "local",
      getUser: async () => ({ id: "u-simulado", email: "s@teste.dev" }),
      onAuthChange: () => () => {},
      signOut: vi.fn(async () => {}),
      sessionId: async () => "sessao-simulada-1",
      subscribeSessao: vi.fn((_uid: string, cb: () => void) => {
        realtime = cb;
        return () => {};
      }),
      rpc: vi.fn(async (fn: string) => {
        if (fn === "app_bootstrap") return { role: "student", profile: { name: "S" }, legal: { gate_required: false } };
        if (fn === "app_session_claim") return { vigente: true, regra: true };
        if (fn === "app_session_check") return vigente() ? { vigente: true, regra: true } : { vigente: false, regra: true, aparelho: "Safari · iPhone", desde: new Date().toISOString() };
        return null;
      }),
    };
    return { backend, realtime: () => realtime?.() };
  }
  const checks = (backend: any) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_session_check").length;

  it("a cada 60 s com a aba visível (e não com ela escondida)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let vale = true;
    const { backend } = simulado(() => vale);
    await abrir("s", backend);
    expect(backend.rpc).toHaveBeenCalledWith("app_session_claim", { p_session_id: "sessao-simulada-1", p_device: resumoAparelho() });

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(checks(backend)).toBe(0);

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(checks(backend)).toBe(1);

    vale = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await waitFor(() => expect(sessoes.s.status).toBe("signed-out"));
    expect(sessoes.s.derrubada).toMatchObject({ aparelho: "Safari · iPhone" });
  });

  it("ao voltar para a aba, no aviso do Realtime e quando uma rota de IA recusa", async () => {
    let vale = true;
    const { backend, realtime } = simulado(() => vale);
    await abrir("s", backend);
    expect(backend.subscribeSessao).toHaveBeenCalledWith("u-simulado", expect.any(Function));

    await act(async () => {
      realtime();
    });
    await waitFor(() => expect(checks(backend)).toBe(1));

    await act(async () => {
      window.dispatchEvent(new Event(EVENTO_SESSAO_DERRUBADA));
    });
    await waitFor(() => expect(checks(backend)).toBe(2));

    vale = false;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.advanceTimersByTime(11_000); // voltar à aba confere no máximo a cada 10 s
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(sessoes.s.status).toBe("signed-out"));
  });

  it("sem resposta do banco (rede, migração ausente) ninguém é derrubado", async () => {
    const { backend } = simulado(() => true);
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_bootstrap") return { role: "student", profile: { name: "S" }, legal: { gate_required: false } };
      if (fn.startsWith("app_session_")) throw new Error("function app_session_claim does not exist");
      return null;
    });
    await abrir("s", backend);
    let continua: boolean | undefined;
    await act(async () => {
      continua = await sessoes.s.confirmarSessao();
    });
    expect(continua).toBe(true);
    expect(sessoes.s.status).toBe("ready");
    expect(backend.signOut).not.toHaveBeenCalled();
  });
});

describe("Sessão única — aviso na tela (App)", () => {
  function semLogin() {
    return { mode: "local", getUser: async () => null, onAuthChange: () => () => {}, signOut: vi.fn(async () => {}), rpc: vi.fn(async () => null), masterSetup: { needed: async () => false } };
  }

  it("mostra 'Sua conta foi aberta em outro aparelho' com o aparelho e ENTRAR NOVAMENTE abre o login", async () => {
    guardarAvisoDerrubada({ aparelho: "Safari · iPhone", desde: new Date().toISOString() });
    proximo = semLogin();
    window.history.pushState({}, "", "/novo");
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: SESSAO_DERRUBADA_TEXTO.title })).toBeTruthy();
    expect(screen.getByText(SESSAO_DERRUBADA_TEXTO.sub)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Safari · iPhone");
    expect(screen.getByRole("alert").textContent).toContain(quandoEntrou(new Date().toISOString())!);
    for (const dica of SESSAO_DERRUBADA_TEXTO.dicas) expect(screen.getByText(dica)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: SESSAO_DERRUBADA_TEXTO.botao }));
    await waitFor(() => expect(screen.queryByText(SESSAO_DERRUBADA_TEXTO.title)).toBeNull());
    expect(screen.getByLabelText("E-mail")).toBeTruthy();
    expect(lerAvisoDerrubada()).toBeNull();
  });

  it("sem o aviso, quem está sem login vê o login de sempre", async () => {
    proximo = semLogin();
    window.history.pushState({}, "", "/novo");
    render(<App />);
    expect(await screen.findByLabelText("E-mail")).toBeTruthy();
    expect(screen.queryByText(SESSAO_DERRUBADA_TEXTO.title)).toBeNull();
  });
});

describe("Sessão única — aparelho resumido", () => {
  it("só navegador e sistema, sem versão nem nada além", () => {
    expect(resumoAparelho("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")).toBe("Safari · iPhone");
    expect(resumoAparelho("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36")).toBe("Chrome · Windows");
    expect(resumoAparelho("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0")).toBe("Edge · Windows");
    expect(resumoAparelho("Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36")).toBe("Samsung Internet · Android");
    expect(resumoAparelho("Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0")).toBe("Firefox · Mac");
    expect(resumoAparelho("")).toBe("Outro aparelho");
  });
});
