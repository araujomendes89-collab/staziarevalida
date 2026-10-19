// @vitest-environment jsdom
/**
 * Treino em Dupla · nome de usuário (@): campo HandleField dentro do perfil de estudo e funções puras do radarApi.js
 * (link de convite, busca por @, convite pendente, copiar). Dados SÓ de teste.
 */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" }, user: { id: "u1" } }) }));
vi.mock("../novo/app/dupla/live.js", () => ({
  useHeartbeat: () => undefined,
  useDuplaChannel: () => ({ inviteTick: 0, live: false }),
}));
vi.mock("../novo/app/dupla/sound.js", () => ({ installAudioWake: () => undefined }));
vi.mock("../novo/app/dupla/MatchModal.jsx", () => ({ InviteWatcher: () => null }));

import { StudyProfileScreen } from "../novo/app/dupla/StudyProfileScreen.jsx";
import { filterPeople } from "../novo/app/dupla/radarApi.js";

const SAVED = {
  public_name: "Colega Teste Um", handle: "colega.teste", school: "Faculdade de Teste", city: "Cidade Teste · TT", goal: "Treinar de teste", exam: "2026/2", bio: "Bio de teste",
  areas: ["GO"], role_pref: "med", pace: "cronometrado", days: ["Seg"], shifts: ["Noite"],
  radar_visible: true, allow_direct_invites: true, show_school: true, show_stats: false,
};
let loaded: any;
let handleCheck: (handle: string) => any;
const go = vi.fn();

const calls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const handleInput = () => screen.getByLabelText("Nome de usuário (@)") as HTMLInputElement;

beforeEach(() => {
  go.mockReset();
  loaded = { profile: SAVED, defaults: { public_name: "Colega Teste Um", exam: "2026/2" }, stats: { done: 0, avg: null } };
  handleCheck = () => ({ ok: true, next_change_at: null });
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_dupla_profile") return loaded;
    if (fn === "app_dupla_save_profile") return { ...loaded, profile: { ...(loaded.profile ?? {}), ...args.p_profile } };
    if (fn === "app_dupla_handle_check") return handleCheck(args.p_handle);
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function open() {
  render(<StudyProfileScreen go={go} />);
  await screen.findByLabelText("Nome ou apelido");
}
/** Digita no campo do @ com relógio falso e deixa passar o debounce de 400 ms + as respostas simuladas. */
async function typeHandle(value: string, wait = 400) {
  vi.useFakeTimers();
  fireEvent.change(handleInput(), { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(wait);
  });
}

describe("Perfil de estudo · campo de nome e do @", () => {
  it("o campo de nome se chama 'Nome ou apelido'", async () => {
    await open();
    expect(screen.getByLabelText("Nome ou apelido")).toBeTruthy();
    expect(screen.queryByLabelText("Nome público")).toBeNull();
  });

  it("mostra o @ atual sem '@' duplicado, a dica do @ atual e o texto fixo", async () => {
    await open();
    expect(handleInput().value).toBe("colega.teste");
    expect(handleInput().value.startsWith("@")).toBe(false);
    expect(screen.getByText("Seu @ atual. Você pode trocar a cada 15 dias.")).toBeTruthy();
    expect(screen.getByText(/Trocar o @ não muda seu nome\./)).toBeTruthy();
    expect(screen.queryByText(/link de convite/)).toBeNull();
  });

  it("perfil salvo com '@' no começo é mostrado sem o '@'", async () => {
    loaded = { ...loaded, profile: { ...SAVED, handle: "colega.teste" } };
    await open();
    fireEvent.change(handleInput(), { target: { value: "@colega.outro" } });
    expect(handleInput().value).toBe("colega.outro");
  });

  it("no @ atual pergunta uma vez ao servidor quando poderá trocar", async () => {
    await open();
    await waitFor(() => expect(calls("app_dupla_handle_check")).toHaveLength(1));
    expect(calls("app_dupla_handle_check")[0][1]).toEqual({ p_handle: "colega.teste" });
  });
});

describe("Perfil de estudo · verificação do @ ao digitar", () => {
  it("espera 400 ms depois da última tecla e mostra 'Disponível.'", async () => {
    await open();
    await waitFor(() => expect(calls("app_dupla_handle_check")).toHaveLength(1)); // consulta do @ atual
    vi.useFakeTimers();
    fireEvent.change(handleInput(), { target: { value: "colega.novo" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(calls("app_dupla_handle_check")).toHaveLength(1);
    expect(screen.queryByText("Disponível.")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(calls("app_dupla_handle_check")).toHaveLength(2);
    expect(calls("app_dupla_handle_check")[1][1]).toEqual({ p_handle: "colega.novo" });
    expect(screen.getByText("Disponível.")).toBeTruthy();
  });

  it("digitar de novo antes dos 400 ms reinicia a espera (uma só consulta, com o último texto)", async () => {
    await open();
    await waitFor(() => expect(calls("app_dupla_handle_check")).toHaveLength(1));
    vi.useFakeTimers();
    fireEvent.change(handleInput(), { target: { value: "colega.n" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    fireEvent.change(handleInput(), { target: { value: "colega.nov" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(calls("app_dupla_handle_check")).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(calls("app_dupla_handle_check")).toHaveLength(2);
    expect(calls("app_dupla_handle_check")[1][1]).toEqual({ p_handle: "colega.nov" });
  });

  it("mostra a mensagem de erro do servidor ('Esse @ já está em uso.')", async () => {
    handleCheck = (h) => (h === "colega.teste" ? { ok: true, next_change_at: null } : { ok: false, message: "Esse @ já está em uso." });
    await open();
    await typeHandle("outro.em.uso");
    expect(screen.getByText("Esse @ já está em uso.")).toBeTruthy();
    expect(screen.queryByText("Disponível.")).toBeNull();
  });

  it("maiúsculas viram minúsculas e espaços somem", async () => {
    await open();
    vi.useFakeTimers();
    fireEvent.change(handleInput(), { target: { value: "  Colega Novo.ABC " } });
    expect(handleInput().value).toBe("colegano" + "vo.abc");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(calls("app_dupla_handle_check").some((c: any[]) => c[1].p_handle === "colegano" + "vo.abc")).toBe(true);
  });

  it("voltar ao @ atual não consulta o servidor nem mostra aviso de disponibilidade", async () => {
    await open();
    await waitFor(() => expect(calls("app_dupla_handle_check")).toHaveLength(1));
    await typeHandle("colega.teste");
    expect(calls("app_dupla_handle_check")).toHaveLength(1);
    expect(screen.queryByText("Disponível.")).toBeNull();
  });

  it("se a consulta do @ lançar erro a tela não quebra", async () => {
    handleCheck = () => {
      throw new Error("falha de rede de teste");
    };
    await open();
    await typeHandle("colega.novo");
    expect(handleInput().value).toBe("colega.novo");
    expect(screen.getByLabelText("Nome ou apelido")).toBeTruthy();
    expect(screen.queryByText("Disponível.")).toBeNull();
    expect((handleInput() as HTMLInputElement).disabled).toBe(false);
  });
});

describe("Perfil de estudo · troca travada por 15 dias", () => {
  it("com next_change_at no futuro o campo fica desabilitado e mostra a frase do servidor", async () => {
    handleCheck = () => ({ ok: true, next_change_at: "2999-11-02T12:00:00Z", next_change_message: "Você poderá trocar de novo em 02/11." });
    await open();
    expect(await screen.findByText("Você poderá trocar de novo em 02/11.")).toBeTruthy();
    expect(handleInput().disabled).toBe(true);
    expect(handleInput().value).toBe("colega.teste");
    expect(screen.queryByText("Seu @ atual. Você pode trocar a cada 15 dias.")).toBeNull();
  });

  it("sem next_change_at o campo continua livre", async () => {
    await open();
    await waitFor(() => expect(calls("app_dupla_handle_check")).toHaveLength(1));
    expect(handleInput().disabled).toBe(false);
  });
});

describe("Perfil de estudo · salvar com o @", () => {
  it("manda 'handle' e continua mandando allow_direct_invites", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Nome ou apelido"), { target: { value: "Colega Teste Três" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar perfil" }));
    await waitFor(() => expect(calls("app_dupla_save_profile")).toHaveLength(1));
    const sent = calls("app_dupla_save_profile")[0][1].p_profile;
    expect(sent.handle).toBe("colega.teste");
    expect(sent.allow_direct_invites).toBe(true);
    expect(sent.public_name).toBe("Colega Teste Três");
  });

  it("manda o @ novo digitado, já em minúsculas", async () => {
    await open();
    fireEvent.change(handleInput(), { target: { value: "Colega.Novo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar perfil" }));
    await waitFor(() => expect(calls("app_dupla_save_profile")).toHaveLength(1));
    expect(calls("app_dupla_save_profile")[0][1].p_profile.handle).toBe("colega.novo");
  });

  it("perfil novo sem @ não manda 'handle' (o servidor sorteia)", async () => {
    loaded = { profile: null, defaults: { public_name: "Colega Teste Dois", exam: "2026/2" }, stats: { done: 0, avg: null } };
    await open();
    expect(handleInput().value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Salvar perfil" }));
    await waitFor(() => expect(calls("app_dupla_save_profile")).toHaveLength(1));
    const sent = calls("app_dupla_save_profile")[0][1].p_profile;
    expect("handle" in sent).toBe(false);
    expect(sent.allow_direct_invites).toBe(true);
  });

  it("perfil novo: o @ escolhido vai junto", async () => {
    loaded = { profile: null, defaults: { public_name: "Colega Teste Dois", exam: "2026/2" }, stats: { done: 0, avg: null } };
    await open();
    fireEvent.change(handleInput(), { target: { value: "Colega.Dois" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar perfil" }));
    await waitFor(() => expect(calls("app_dupla_save_profile")).toHaveLength(1));
    expect(calls("app_dupla_save_profile")[0][1].p_profile.handle).toBe("colega.dois");
  });

  it("o interruptor 'Permitir convites diretos' existe, vem ligado e a mudança é salva", async () => {
    await open();
    const sw = screen.getByRole("switch", { name: /Permitir convites diretos/ }) as HTMLInputElement;
    expect(sw.checked).toBe(true);
    fireEvent.click(sw);
    expect((screen.getByRole("switch", { name: /Permitir convites diretos/ }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Salvar perfil" }));
    await waitFor(() => expect(calls("app_dupla_save_profile")).toHaveLength(1));
    expect(calls("app_dupla_save_profile")[0][1].p_profile.allow_direct_invites).toBe(false);
  });
});

// ------------------------------------------------------------------ radarApi.js · funções puras
describe("radarApi · filterPeople por @", () => {
  const people = [
    { public_name: "Colega Teste Um", handle: "colega.um", school: "Faculdade A", areas: ["GO"] },
    { public_name: "Colega Teste Dois", handle: "revalida.k7m2", school: "Faculdade B", areas: [] },
  ];
  it("acha pelo @ com ou sem o '@', sem diferença de maiúscula", () => {
    expect(filterPeople(people, "@revalida.k7m2").map((p) => p.public_name)).toEqual(["Colega Teste Dois"]);
    expect(filterPeople(people, "revalida").map((p) => p.public_name)).toEqual(["Colega Teste Dois"]);
    expect(filterPeople(people, "@COLEGA.UM").map((p) => p.public_name)).toEqual(["Colega Teste Um"]);
  });
  it("busca vazia ou só '@' devolve todos; sem resultado devolve lista vazia", () => {
    expect(filterPeople(people, "")).toBe(people);
    expect(filterPeople(people, "@")).toBe(people);
    expect(filterPeople(people, "@nao.existe")).toEqual([]);
  });
  it("pessoa sem @ ainda é achada pelo nome", () => {
    expect(filterPeople([{ public_name: "Colega Sem Arroba" }], "arroba")).toHaveLength(1);
  });
});
