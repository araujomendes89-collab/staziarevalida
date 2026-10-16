/**
 * session.acceptTerms (src/novo/app/session.jsx): chama app_accept_terms com o documento, a versão, a origem, o WhatsApp (ou
 * nulo) e o navegador (até 300 caracteres) e troca os dados de abertura (boot) pelos que a função devolve, como updateProfile.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";

const backend: any = {
  getUser: vi.fn(),
  onAuthChange: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
};
vi.mock("../novo/data", () => ({ getBackend: async () => backend }));

import { SessionProvider, useSession } from "../novo/app/session.jsx";

const abertura = (legal: Record<string, unknown>) => ({ role: "student", profile: { name: "Ana" }, legal });
const COM_TELA = abertura({ gate_required: true, phone_missing: true });
const SEM_TELA = abertura({ gate_required: false, phone_missing: false });

let session: any;
function Probe() {
  session = useSession();
  return <p>{session.status}</p>;
}
async function abrir(boot: unknown) {
  backend.rpc.mockResolvedValueOnce(boot); // app_bootstrap da abertura
  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>
  );
  await waitFor(() => expect(session.status).toBe("ready"));
}

beforeEach(() => {
  backend.getUser.mockReset().mockResolvedValue({ id: "u1", email: "ana@teste.dev" });
  backend.onAuthChange.mockReset().mockReturnValue(() => {});
  backend.rpc.mockReset();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("session.acceptTerms", () => {
  it("com declarações (Termo 2.0) chama app_accept_terms_declared com p_adult e p_physician", async () => {
    await abrir(COM_TELA);
    backend.rpc.mockResolvedValueOnce(SEM_TELA);
    await act(async () => {
      await session.acceptTerms({ document: "termo_uso", version: "2.0", origin: "tela_aceite", declarations: { adult: true, physician: true } });
    });
    expect(backend.rpc).toHaveBeenLastCalledWith("app_accept_terms_declared", {
      p_document: "termo_uso", p_version: "2.0", p_origin: "tela_aceite", p_phone: null, p_user_agent: navigator.userAgent, p_adult: true, p_physician: true,
    });
    expect(session.boot).toBe(SEM_TELA);
  });

  it("chama app_accept_terms com os argumentos p_* e troca os dados de abertura", async () => {
    await abrir(COM_TELA);
    expect(session.boot.legal.gate_required).toBe(true);

    backend.rpc.mockResolvedValueOnce(SEM_TELA);
    await act(async () => {
      expect(await session.acceptTerms({ document: "termo_uso", version: "1.0", origin: "tela_aceite", phone: "+5541999998888" })).toBeUndefined();
    });

    expect(backend.rpc).toHaveBeenLastCalledWith("app_accept_terms", {
      p_document: "termo_uso",
      p_version: "1.0",
      p_origin: "tela_aceite",
      p_phone: "+5541999998888",
      p_user_agent: navigator.userAgent,
    });
    expect(session.boot).toBe(SEM_TELA);
    expect(session.status).toBe("ready");
  });

  it("sem WhatsApp manda p_phone nulo (aceite do Tutor, aceite do Google com o WhatsApp já guardado)", async () => {
    await abrir(COM_TELA);

    backend.rpc.mockResolvedValueOnce(SEM_TELA);
    await act(async () => {
      await session.acceptTerms({ document: "tutor_ia", version: "1.0", origin: "tutor" });
    });
    expect(backend.rpc).toHaveBeenLastCalledWith("app_accept_terms", expect.objectContaining({ p_document: "tutor_ia", p_origin: "tutor", p_phone: null }));

    backend.rpc.mockResolvedValueOnce(SEM_TELA);
    await act(async () => {
      await session.acceptTerms({ document: "termo_uso", version: "1.0", origin: "google", phone: undefined });
    });
    expect(backend.rpc).toHaveBeenLastCalledWith("app_accept_terms", expect.objectContaining({ p_origin: "google", p_phone: null }));
  });

  it("manda o navegador com no máximo 300 caracteres", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("x".repeat(500));
    await abrir(COM_TELA);

    backend.rpc.mockResolvedValueOnce(SEM_TELA);
    await act(async () => {
      await session.acceptTerms({ document: "termo_uso", version: "1.0", origin: "tela_aceite" });
    });
    const args = backend.rpc.mock.lastCall![1];
    expect(args.p_user_agent).toBe("x".repeat(300));
  });

  it("se o servidor recusar, o erro chega à tela e os dados de abertura ficam como estavam", async () => {
    await abrir(COM_TELA);

    backend.rpc.mockRejectedValueOnce(new Error("Versão desatualizada do termo."));
    await act(async () => {
      await expect(session.acceptTerms({ document: "termo_uso", version: "0.9", origin: "tela_aceite" })).rejects.toThrow("Versão desatualizada do termo.");
    });
    expect(session.boot).toBe(COM_TELA);
    expect(session.status).toBe("ready");
  });
});
