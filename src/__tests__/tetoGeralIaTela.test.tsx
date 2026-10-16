/**
 * IA02 (Fase 1 objetiva, 2026-10-12) na Central de IAs: teto geral do mês, só a estrutura. Nasce desligado e sem valor (nada inventado),
 * só avisa (a 80% e ao passar) e diz a verdade quando o banco ainda não tem a atualização.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { AdminAI } from "../novo/app/admin/ai/AdminAI.jsx";

const provider = (id: string) => ({ id, enabled: false, enabled_by: null, enabled_by_email: null, enabled_at: null, models: [], models_refreshed_at: null, last_status: null, last_status_detail: null });
const SETTINGS = { monthly_cap_usd: null, per_run_cap_usd: null, caps_enabled: false, tab_override_enabled: false, overall_monthly_cap_usd: null, overall_cap_enabled: false };
const OVERVIEW: any = {
  providers: ["anthropic", "openai", "gemini", "ollama"].map(provider),
  functions: [],
  settings: SETTINGS,
  prices: [],
  spend_by_provider: [],
  spend_by_function: [],
  month_spend: 10,
  tutor_month_spend: 0,
  recent_calls: [],
  history: [],
  all_spend: { available: true, month_start: "2026-10-01", groups: [{ key: "tutor_conversa", cost_usd: 5, records: 3, unpriced_records: 0 }], no_record: [] },
  checks: {},
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let sent: any[] = [];
const abrir = (over: any = {}, putAnswer: () => Response = () => json({ ok: true })) => {
  sent = [];
  (globalThis as any).fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/ai-central/overview") return json({ ...structuredClone(OVERVIEW), ...over });
    if (url === "/api/ai-central/settings" && init?.method === "PUT") {
      sent.push(JSON.parse(String(init.body)));
      return putAnswer();
    }
    return json({ ok: true });
  });
  return render(<AdminAI />);
};
beforeEach(() => {
  sent = [];
});
afterEach(cleanup);

describe("IA02 — teto geral do mês na Central de IAs", () => {
  it("nasce vazio e desligado, com a explicação, e nenhum aviso aparece", async () => {
    abrir();
    const bloco = await screen.findByTestId("teto-geral");
    expect((within(bloco).getByLabelText("Teto geral do mês (US$)") as HTMLInputElement).value).toBe("");
    expect((within(bloco).getByRole("switch", { name: "Avisar pelo teto geral" }) as HTMLInputElement).checked).toBe(false);
    expect(bloco.textContent).toMatch(/Fica desligado e sem valor até você escolher/);
    expect(bloco.textContent).toMatch(/não para nenhuma IA/);
    expect(screen.queryByTestId("aviso-teto-geral")).toBeNull();
  });

  it("não deixa ligar sem valor; com valor, manda os dois campos", async () => {
    abrir();
    const bloco = await screen.findByTestId("teto-geral");
    const salvar = within(bloco).getByRole("button", { name: /Salvar teto geral/ }) as HTMLButtonElement;
    fireEvent.click(within(bloco).getByRole("switch", { name: "Avisar pelo teto geral" }));
    expect(within(bloco).getByText("Preencha o valor para ligar")).toBeTruthy();
    expect(salvar.disabled).toBe(true);
    fireEvent.change(within(bloco).getByLabelText("Teto geral do mês (US$)"), { target: { value: "80" } });
    expect(salvar.disabled).toBe(false);
    fireEvent.click(salvar);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ overall_monthly_cap_usd: 80, overall_cap_enabled: true });
    expect(await within(bloco).findByText("Teto geral salvo.")).toBeTruthy();
  });

  it("salvar vazio e desligado manda nulo e desligado (nada muda)", async () => {
    abrir();
    const bloco = await screen.findByTestId("teto-geral");
    fireEvent.click(within(bloco).getByRole("button", { name: /Salvar teto geral/ }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ overall_monthly_cap_usd: null, overall_cap_enabled: false });
  });

  it("mostra o erro do servidor em português", async () => {
    abrir({}, () => json({ error: "Para ligar o teto geral do mês, preencha o valor dele." }, 400));
    const bloco = await screen.findByTestId("teto-geral");
    fireEvent.click(within(bloco).getByRole("button", { name: /Salvar teto geral/ }));
    expect(await within(bloco).findByText("Para ligar o teto geral do mês, preencha o valor dele.")).toBeTruthy();
  });

  it("a 80% avisa 'chegou perto' e ao passar avisa 'passou', sempre dizendo que nada foi parado", async () => {
    // gasto com registro: 10 (Central) + 5 (Tutor) = 15
    abrir({ settings: { ...SETTINGS, overall_monthly_cap_usd: 18, overall_cap_enabled: true } });
    const perto = await screen.findByTestId("aviso-teto-geral");
    expect(perto.textContent).toMatch(/chegou perto do teto geral/);
    expect(perto.textContent).toMatch(/US\$ 15,00 de um teto geral de US\$ 18,00 \(83%\)/);
    expect(perto.textContent).toMatch(/nenhuma IA foi parada/);
    cleanup();
    abrir({ settings: { ...SETTINGS, overall_monthly_cap_usd: 15, overall_cap_enabled: true } });
    expect((await screen.findByTestId("aviso-teto-geral")).textContent).toMatch(/passou do teto geral/);
    cleanup();
    abrir({ settings: { ...SETTINGS, overall_monthly_cap_usd: 100, overall_cap_enabled: true } });
    await screen.findByTestId("teto-geral");
    expect(screen.queryByTestId("aviso-teto-geral")).toBeNull();
    cleanup();
    abrir({ settings: { ...SETTINGS, overall_monthly_cap_usd: 10, overall_cap_enabled: false } });
    await screen.findByTestId("teto-geral");
    expect(screen.queryByTestId("aviso-teto-geral")).toBeNull();
  });

  it("sem a atualização do banco (sem os campos): diz o que falta e não mostra campos que não gravam", async () => {
    const { overall_monthly_cap_usd, overall_cap_enabled, ...antigo } = SETTINGS;
    abrir({ settings: antigo });
    const bloco = await screen.findByTestId("teto-geral");
    expect(bloco.textContent).toMatch(/falta uma atualização do banco/);
    expect(within(bloco).queryByLabelText("Teto geral do mês (US$)")).toBeNull();
    expect(within(bloco).queryByRole("button", { name: /Salvar teto geral/ })).toBeNull();
  });

  it("os tetos de sempre continuam como eram (a nota diz que o Tutor e as vozes não entram neles)", async () => {
    abrir();
    await screen.findByTestId("teto-geral");
    expect(screen.getByTestId("gasto-de-tudo").textContent).toMatch(/Só a Central entra nos tetos/);
    expect(screen.getByLabelText("Teto mensal (US$)")).toBeTruthy();
  });
});
