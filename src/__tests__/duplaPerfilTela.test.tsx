/**
 * Treinamento em Dupla · etapa 3 · tarefa 8: tela "Meu perfil de estudo" (jsdom, banco simulado pelo contrato da Tarefa 6:
 * app_dupla_profile e app_dupla_save_profile). Também cobre card.js e profile.js.
 */
import fs from "fs";
import path from "path";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" }, user: { id: "u1" } }) }));

import { StudyProfileScreen } from "../novo/app/dupla/StudyProfileScreen.jsx";
import { availabilityLabel, statsLabel, toCard } from "../novo/app/dupla/card.js";
import { draftErrors, nextEditions, profileDraft } from "../novo/app/dupla/profile.js";

const SAVED = {
  public_name: "Maria Souza", school: "UFPR", city: "Curitiba · PR", goal: "Treinar GO", exam: "2026/2", bio: "Oi",
  areas: ["GO"], role_pref: "med", pace: "cronometrado", days: ["Seg", "Qua"], shifts: ["Noite"],
  radar_visible: true, show_school: true, show_stats: false,
};
const NO_STATS = { done: 0, avg: null };
let loaded: any;
let go: any;

const rpcCalls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const preview = () => screen.getByRole("article");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T15:00:00-03:00"));
  go = vi.fn();
  loaded = { profile: SAVED, defaults: { public_name: "Maria Souza", exam: "2026/2" }, stats: { done: 3, avg: 7.8 } };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_dupla_profile") return loaded;
    if (fn === "app_dupla_save_profile") return { ...loaded, profile: { ...(loaded.profile ?? {}), ...args.p_profile } };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function open() {
  render(<StudyProfileScreen go={go} />);
  await screen.findByLabelText("Nome público");
}

describe("card.js e profile.js", () => {
  it("availabilityLabel", () => {
    expect(availabilityLabel(["Noite"], ["Seg", "Qua"])).toBe("Noite · Seg, Qua");
    expect(availabilityLabel([], [])).toBe("Sem turno");
    expect(availabilityLabel(["Manhã", "Tarde"], [])).toBe("Manhã e Tarde");
    expect(availabilityLabel(["Noite"], ["Seg", "Ter", "Qua", "Qui", "Sex"])).toBe("Noite · Seg a Sex");
  });

  it("statsLabel", () => {
    expect(statsLabel(null)).toBe("Oculto");
    expect(statsLabel({ done: 0, avg: null })).toBe("0 feitas");
    expect(statsLabel({ done: 3, avg: 7.8 })).toBe("3 feitas · PEP 7,80");
  });

  it("toCard junta meta, fatos e áreas; sem escola, sem cidade ou sem prova a meta fica só com o que existe", () => {
    const c = toCard({ ...SAVED, stats: { done: 3, avg: 7.8 } } as any);
    expect(c.name).toBe("Maria Souza");
    expect(c.meta).toBe("UFPR · Curitiba · PR · Revalida 2026/2");
    expect(c.facts.map((f: any) => [f.icon, f.label, f.value])).toEqual([
      ["target", "Objetivo", "Treinar GO"],
      ["clock", "Disponível", "Noite · Seg, Qua"],
      ["user-round", "Papel", "Médico(a)"],
      ["list-checks", "Estações", "3 feitas · PEP 7,80"],
    ]);
    expect(c.tags).toEqual(["GO"]);
    expect(toCard({ public_name: "Ana", school: null, city: null, exam: null, goal: "", areas: [], days: [], shifts: [], role_pref: "any", stats: null } as any).meta).toBe("");
    expect(toCard({ public_name: "Ana", goal: "", role_pref: "any" } as any).facts[0].value).toBe("—");
  });

  it("nextEditions: três próximas, no fuso de São Paulo", () => {
    expect(nextEditions(new Date("2026-10-09T12:00:00-03:00"))).toEqual(["2026/2", "2027/1", "2027/2"]);
    expect(nextEditions(new Date("2027-03-15T12:00:00-03:00"))).toEqual(["2027/1", "2027/2", "2028/1"]);
    expect(nextEditions(new Date("2026-06-30T23:00:00-03:00"))[0]).toBe("2026/1");
    expect(nextEditions(new Date("2026-07-01T00:30:00-03:00"))[0]).toBe("2026/2");
    // 30/06 22h em São Paulo já é 1º/07 em UTC: vale o fuso de São Paulo
    expect(nextEditions(new Date("2026-06-30T22:00:00-03:00"))[0]).toBe("2026/1");
  });

  it("profileDraft: primeira vez usa a Conta; edição-alvo fora das três próximas cai na primeira; perfil salvo manda", () => {
    const today = new Date("2026-10-09T12:00:00-03:00");
    const first = profileDraft({ profile: null, defaults: { public_name: "Ana Lima", exam: "2027/1" }, stats: NO_STATS }, today);
    expect(first).toMatchObject({ public_name: "Ana Lima", exam: "2027/1", role_pref: "any", pace: "cronometrado", areas: [], days: [], shifts: [], radar_visible: true, show_school: true, show_stats: true });
    expect(profileDraft({ profile: null, defaults: { public_name: null, exam: "2025/1" }, stats: NO_STATS }, today)).toMatchObject({ public_name: "", exam: "2026/2" });
    expect(profileDraft({ profile: null, defaults: null, stats: NO_STATS }, today).exam).toBe("2026/2");
    expect(profileDraft({ profile: SAVED as any, defaults: { public_name: "Outro", exam: "2027/2" }, stats: NO_STATS }, today)).toMatchObject({ public_name: "Maria Souza", exam: "2026/2", show_stats: false });
  });

  it("draftErrors: nome com menos de 3 letras (sem contar espaços)", () => {
    expect(draftErrors({ public_name: "Ab " } as any)).toEqual({ public_name: "Informe como você quer aparecer para os colegas." });
    expect(draftErrors({ public_name: "Abc" } as any)).toEqual({});
  });
});

describe("Meu perfil de estudo", () => {
  it("primeira vez: nome e prova vêm da Conta; prova só entre as três próximas edições", async () => {
    loaded = { profile: null, defaults: { public_name: "Ana Lima", exam: "2027/1" }, stats: NO_STATS };
    await open();
    expect((screen.getByLabelText("Nome público") as HTMLInputElement).value).toBe("Ana Lima");
    const group = screen.getByRole("radiogroup", { name: "Prova" });
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual(["2026/2", "2027/1", "2027/2"]);
    expect(within(group).getByRole("radio", { name: "2027/1" }).getAttribute("aria-checked")).toBe("true");
    // ainda nada salvo: dá para salvar o que veio da Conta sem mudar nada
    expect((screen.getByRole("button", { name: "Salvar perfil" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Descartar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("primeira vez: edição-alvo da Conta fora da lista cai na primeira edição", async () => {
    loaded = { profile: null, defaults: { public_name: "Ana Lima", exam: "2025/1" }, stats: NO_STATS };
    await open();
    expect(within(screen.getByRole("radiogroup", { name: "Prova" })).getByRole("radio", { name: "2026/2" }).getAttribute("aria-checked")).toBe("true");
  });

  it("perfil salvo com prova fora das três próximas: a prova salva entra na frente e fica marcada", async () => {
    loaded = { profile: { ...SAVED, exam: "2026/1" }, defaults: null, stats: NO_STATS };
    await open();
    const group = screen.getByRole("radiogroup", { name: "Prova" });
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual(["2026/1", "2026/2", "2027/1", "2027/2"]);
    expect(within(group).getByRole("radio", { name: "2026/1" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByRole("button", { name: "Salvar perfil" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("nome com menos de 3 letras mostra o erro e não salva; Salvar e Descartar só com alteração", async () => {
    await open();
    const save = screen.getByRole("button", { name: "Salvar perfil" }) as HTMLButtonElement;
    const discard = screen.getByRole("button", { name: "Descartar" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(discard.disabled).toBe(true);
    expect(screen.queryByText("Alterações não salvas")).toBeNull();

    fireEvent.change(screen.getByLabelText("Nome público"), { target: { value: "Ab" } });
    expect(screen.getByText("Informe como você quer aparecer para os colegas.")).toBeTruthy();
    expect(save.disabled).toBe(true);
    expect(discard.disabled).toBe(false);
    expect(screen.getByText("Alterações não salvas")).toBeTruthy();
    fireEvent.click(save);
    expect(rpcCalls("app_dupla_save_profile")).toHaveLength(0);

    fireEvent.click(discard);
    expect((screen.getByLabelText("Nome público") as HTMLInputElement).value).toBe("Maria Souza");
    expect(screen.queryByText("Informe como você quer aparecer para os colegas.")).toBeNull();
    expect(discard.disabled).toBe(true);
  });

  it("salvar manda p_profile e mostra 'Perfil de estudo salvo'", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Nome público"), { target: { value: "  Maria S. Souza " } });
    fireEvent.click(screen.getByRole("button", { name: "Sáb" }));
    fireEvent.click(screen.getByRole("button", { name: "Cirurgia" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar perfil" }));
    await waitFor(() => expect(rpcCalls("app_dupla_save_profile")).toHaveLength(1));
    const sent = rpcCalls("app_dupla_save_profile")[0][1].p_profile;
    expect(sent).toMatchObject({
      public_name: "Maria S. Souza", school: "UFPR", city: "Curitiba · PR", goal: "Treinar GO", exam: "2026/2", bio: "Oi",
      areas: ["CR", "GO"], days: ["Seg", "Qua", "Sáb"], shifts: ["Noite"], role_pref: "med", pace: "cronometrado",
      radar_visible: true, show_school: true, show_stats: false,
    });
    expect(await screen.findByText("Perfil de estudo salvo")).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "Salvar perfil" }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByLabelText("Nome público") as HTMLInputElement).value).toBe("Maria S. Souza");
  });

  it("salvar com erro do servidor mostra a mensagem e mantém o rascunho", async () => {
    await open();
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_dupla_save_profile") throw new Error("Bio: máximo de 160 caracteres.");
      return loaded;
    });
    fireEvent.change(screen.getByLabelText("Nome público"), { target: { value: "Maria Nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar perfil" }));
    expect(await screen.findByText("Bio: máximo de 160 caracteres.")).toBeTruthy();
    expect((screen.getByLabelText("Nome público") as HTMLInputElement).value).toBe("Maria Nova");
  });

  it("prévia: meta, Disponível ('Noite · Seg, Qua'), Papel e Estações ('Oculto'; '3 feitas · PEP 7,80')", async () => {
    await open();
    const card = within(preview());
    expect(card.getByText("Maria Souza")).toBeTruthy();
    expect(card.getByText("UFPR · Curitiba · PR · Revalida 2026/2")).toBeTruthy();
    expect(card.getByText("Noite · Seg, Qua")).toBeTruthy();
    expect(card.getByText("Médico(a)")).toBeTruthy();
    expect(card.getByText("Treinar GO")).toBeTruthy();
    expect(card.getByText("Oculto")).toBeTruthy();
    expect(card.getByText("GO")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /Mostrar meu desempenho/ }));
    expect(within(preview()).getByText("3 feitas · PEP 7,80")).toBeTruthy();
    expect(within(preview()).queryByText("Oculto")).toBeNull();
    expect(screen.getByText("Alterações não salvas")).toBeTruthy();
  });

  it("prévia mostra 0 feitas sem sessões e '—' sem objetivo", async () => {
    loaded = { profile: { ...SAVED, goal: null, show_stats: true }, defaults: null, stats: NO_STATS };
    await open();
    expect(within(preview()).getByText("0 feitas")).toBeTruthy();
    expect(within(preview()).getByText("—")).toBeTruthy();
  });

  it("prévia sem a instituição quando 'Mostrar instituição de formação' está desligado", async () => {
    await open();
    expect(within(preview()).getByText("UFPR · Curitiba · PR · Revalida 2026/2")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /Mostrar instituição de formação/ }));
    expect(within(preview()).getByText("Curitiba · PR · Revalida 2026/2")).toBeTruthy();
    expect(within(preview()).queryByText(/UFPR/)).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: /Mostrar instituição de formação/ }));
    expect(within(preview()).getByText("UFPR · Curitiba · PR · Revalida 2026/2")).toBeTruthy();
  });

  it("radar desligado: aviso sem a frase de convidar colegas; sem 'Envio de foto em breve.'", async () => {
    await open();
    expect(screen.queryByText(/ninguém vê seu cartão/)).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: /Aparecer no radar de duplas/ }));
    const warn = screen.getByText("Com o radar desligado, ninguém vê seu cartão.");
    expect(warn).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/convidar colegas/);
    expect(document.body.textContent).not.toMatch(/Envio de foto em breve/);
    expect(screen.getByText("A foto usa suas iniciais.")).toBeTruthy();
  });

  it("textos do protótipo, contador da bio, chips das áreas, papel, ritmo, dias e turnos", async () => {
    await open();
    expect(screen.getByRole("button", { name: /Voltar para Praticar/ })).toBeTruthy();
    expect(screen.getByText("É assim que os colegas veem você ao procurar uma dupla.")).toBeTruthy();
    expect(screen.getByText("Sobre você")).toBeTruthy();
    expect(screen.getByText("Somente informações públicas. E-mail e telefone nunca aparecem.")).toBeTruthy();
    expect(screen.getByText("Como quero treinar")).toBeTruthy();
    expect(screen.getByText("Usamos estas respostas para calcular a compatibilidade.")).toBeTruthy();
    expect(screen.getByText("Disponibilidade")).toBeTruthy();
    expect(screen.getByText("Privacidade")).toBeTruthy();
    expect(screen.getByText("Pré-visualização do seu cartão")).toBeTruthy();
    expect(screen.getByText("2/160")).toBeTruthy();

    const goChip = screen.getByRole("button", { name: "GO" });
    expect(goChip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Pediatria" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Pediatria" }));
    expect(screen.getByRole("button", { name: "Pediatria" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(preview()).getByText("Pediatria")).toBeTruthy();

    const role = screen.getByRole("radiogroup", { name: "Papel" });
    expect(within(role).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Médico(a)", "Ator / avaliador", "Qualquer papel"]);
    const pace = screen.getByRole("radiogroup", { name: "Ritmo" });
    expect(within(pace).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Treino livre", "Cronometrado", "Simulação de prova"]);
    expect(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom", "Manhã", "Tarde", "Noite"].every((t) => screen.getAllByRole("button", { name: t }).length >= 1)).toBe(true);
  });

  it("'Voltar para Praticar' leva ao Praticar", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /Voltar para Praticar/ }));
    expect(go).toHaveBeenCalledWith("dupla");
  });

  it("sem cor hexadecimal, sem lucide-react e sem nada do pacote nas telas e módulos", () => {
    for (const f of ["StudyProfileScreen.jsx", "PracticeScreen.jsx", "card.js", "profile.js"]) {
      const src = fs.readFileSync(path.resolve(__dirname, "../novo/app/dupla", f), "utf8");
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, f).not.toMatch(/lucide-react|window\.StaziaRevalidaDesignSystem|SZ_MATCH/);
      expect(src, f).not.toMatch(/server\/ai|Gabriela Carlyle|Tiago Nunes|14 feitas/);
    }
  });
});
