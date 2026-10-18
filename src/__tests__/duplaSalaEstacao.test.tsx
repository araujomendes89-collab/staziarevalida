/**
 * Treinamento em Dupla · etapa 5 · tarefa 17b: impressos, folha do candidato (imagem com "Ampliar") e PEP ao vivo.
 * Servidor simulado (helpers/duplaSala); a rota das imagens (/api/dupla) é simulada no fetch. Pessoas e estação de teste.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NOW, STATION, advance, asCandidate, baseRoom, contentOf, serve, type Srv } from "./helpers/duplaSala";

const rpc = vi.fn();
const backend: any = { rpc, accessToken: async () => "token-de-teste" };
const session: any = { backend, user: { id: "u-ana" }, dupla: { aberto: true, permitido: true } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/dupla/sound.js", () => ({ playWhistle: () => undefined, installAudioWake: () => undefined }));

import { RoomScreen } from "../novo/app/dupla/room/RoomScreen.jsx";
import { printUrl } from "../novo/app/dupla/printsApi.js";

const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
const calls = (fn: string) => rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const fetchMock = vi.fn();
let srv: Srv;

async function mount() {
  const view = render(<RoomScreen roomId="r1" go={vi.fn()} />);
  await advance(0);
  await advance(0);
  await advance(0);
  return view;
}
const running = (over: Record<string, any> = {}) => baseRoom({ phase: "running", started_at: NOW, ends_at: at(400000), ...over });

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // rota da imagem: link assinado
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => ({ url: "https://deposito.test/" + String(url).split("/prints/")[1].replace("/link", "") + ".png" }),
  }));
  window.localStorage.clear();
  window.sessionStorage.clear();
  srv = {
    room: running(),
    content: contentOf("evaluator"),
    marks: [],
    result: null,
    steps: {
      app_dupla_release: (a: any) => ({
        released_pressings: a.p_released ? [...srv.room.released_pressings, a.p_pressing_id] : srv.room.released_pressings.filter((x: string) => x !== a.p_pressing_id),
      }),
      app_dupla_finish: () => ({ phase: "review", finished_at: NOW }),
      app_dupla_finalize: () => ({ phase: "result" }),
    },
  };
  serve(rpc, srv);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("impressos e folha do candidato", () => {
  it("impressos: liberar chama a função; o candidato vê só o liberado e abre, fecha, amplia (−/+) e oculta a imagem; Esc fecha", async () => {
    await mount();
    fireEvent.click(screen.getAllByRole("button", { name: "Liberar" })[1]);
    await advance(0);
    expect(calls("app_dupla_release")[0][1]).toEqual({ p_room_id: "r1", p_pressing_id: "teste-p2", p_released: true });
    expect(screen.getByText("1/2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    await advance(0);
    expect(calls("app_dupla_release")[1][1]).toEqual({ p_room_id: "r1", p_pressing_id: "teste-p2", p_released: false });
    cleanup();

    // candidato com o esfregaço (tela 2) liberado
    srv.room = asCandidate(running({ released_pressings: ["d2"] }));
    srv.content = contentOf("candidate", { released: ["d2"] });
    await mount();
    expect(screen.getByText("Impresso 1 · Aguardando liberação")).toBeTruthy();
    expect(screen.getByText("Impresso 2 · Esfregaço")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/dupla/rooms/r1/prints/d2/link", { headers: { Authorization: "Bearer token-de-teste" } });
    const open = screen.getByRole("button", { name: "Ampliar impresso" });
    expect(open.querySelector("img")!.getAttribute("src")).toBe("https://deposito.test/d2.png");
    fireEvent.click(open);
    const big = screen.getByRole("dialog");
    expect(within(big).getByText("100%")).toBeTruthy();
    fireEvent.click(within(big).getByRole("button", { name: "Ampliar imagem" }));
    expect(within(big).getByText("120%")).toBeTruthy();
    fireEvent.click(within(big).getByRole("button", { name: "Diminuir imagem" }));
    fireEvent.click(within(big).getByRole("button", { name: "Diminuir imagem" }));
    expect(within(big).getByText("80%")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    // ocultar a imagem só nesta tela
    fireEvent.click(screen.getByRole("button", { name: "Ocultar imagem do impresso" }));
    expect(screen.queryByRole("button", { name: "Ampliar impresso" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar imagem do impresso" }));
    expect(screen.getByRole("button", { name: "Ampliar impresso" })).toBeTruthy();
    // fechar e abrir o impresso
    fireEvent.click(screen.getByRole("button", { name: "Fechar Impresso 2 · Esfregaço" }));
    expect(screen.queryByRole("button", { name: "Ampliar impresso" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir Impresso 2 · Esfregaço" }));
    await advance(0);
    expect(screen.getByRole("button", { name: "Ampliar impresso" })).toBeTruthy();
  });

  it("o candidato relê o conteúdo quando um impresso é liberado (sem recarregar)", async () => {
    srv.room = asCandidate(running());
    srv.content = () => contentOf("candidate", { released: srv.room.released_pressings });
    await mount();
    expect(screen.getByText("0 liberados")).toBeTruthy();
    const before = calls("app_dupla_room_content").length;
    srv.room = { ...srv.room, rev: srv.room.rev + 1, released_pressings: ["d1"] };
    await advance(2000);
    expect(calls("app_dupla_room_content").length).toBe(before + 1);
    expect(screen.getByText("1 liberado")).toBeTruthy();
    expect(screen.getByText("Impresso 1 · Hemograma")).toBeTruthy();
    expect(screen.getByText("Hb 9,0 g/dL")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Liberação:");
  });

  it("relato inicial aparece sem liberar, continua depois de recarregar e nunca entra em x/y", async () => {
    await mount();
    expect(screen.getByText("O candidato já lê este texto na folha dele, desde o início.")).toBeTruthy();
    expect(screen.getByText("Relato do caso (na folha do candidato)")).toBeTruthy();
    expect(screen.getByText("0/2")).toBeTruthy();
    cleanup();
    for (let i = 0; i < 2; i++) {
      srv.room = asCandidate(running());
      srv.content = contentOf("candidate");
      await mount();
      expect(screen.getByText("Relato do caso")).toBeTruthy(); // na folha, sem número
      expect(screen.getByText("Relato inicial de teste.")).toBeTruthy();
      expect(screen.getByText("0 liberados")).toBeTruthy();
      expect(screen.getAllByText(/Aguardando liberação/)).toHaveLength(2);
      cleanup();
    }
  });

  it("folha do candidato em imagem usa a rota; sem imagem usa o texto completo", async () => {
    srv.room = asCandidate(running());
    srv.content = contentOf("candidate", { sheetImage: true });
    await mount();
    expect(fetchMock).toHaveBeenCalledWith("/api/dupla/rooms/r1/prints/candidate_sheet/link", expect.anything());
    const img = screen.getByAltText("Instruções ao participante e relato do caso clínico");
    expect(img.getAttribute("src")).toBe("https://deposito.test/candidate_sheet.png");
    // imagem única da estação: "Ampliar imagem da estação", tela cheia com 1100 px a 100% (StationImage do protótipo)
    fireEvent.click(screen.getByRole("button", { name: "Ampliar imagem da estação" }));
    const full = within(screen.getByRole("dialog")).getAllByRole("img")[0] as HTMLImageElement;
    expect(full.style.width).toBe("1100px");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ampliar imagem" }));
    expect(full.style.width).toBe("1320px");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("INSTRUÇÕES AO PARTICIPANTE")).toBeNull();
    expect(screen.queryByText("Relato inicial de teste.")).toBeNull(); // o relato está na imagem única
    cleanup();

    // a rota diz que não há imagem (404): o texto é a folha
    fetchMock.mockImplementation(async () => ({ ok: false, status: 404, json: async () => ({ error: "Impresso sem imagem." }) }));
    await mount();
    expect(screen.getByText("INSTRUÇÕES AO PARTICIPANTE")).toBeTruthy();
    expect(screen.getByText("Nos 10 minutos de duração da estação, você deverá executar as seguintes tarefas:")).toBeTruthy();
    expect(screen.getByText("Relato inicial de teste.")).toBeTruthy();
    cleanup();

    srv.content = contentOf("candidate");
    fetchMock.mockClear();
    await mount();
    expect(screen.getByText("INSTRUÇÕES AO PARTICIPANTE")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/dupla/rooms/r1/prints/candidate_sheet/link", expect.anything());
  });
});

describe("PEP ao vivo", () => {
  it("PEP: a marcação vai 300 ms depois do último toque, uma vez por item", async () => {
    await mount();
    const item1 = screen.getByRole("radiogroup", { name: "Item 1" });
    const [c1, p1] = within(item1).getAllByRole("radio");
    fireEvent.click(c1);
    await advance(100);
    fireEvent.click(p1);
    await advance(299);
    expect(calls("app_dupla_mark")).toHaveLength(0);
    await advance(1);
    expect(calls("app_dupla_mark")).toHaveLength(1);
    expect(calls("app_dupla_mark")[0][1].p_item_id).toBe("i1");
    expect(["partial", "correct", "incorrect"]).toContain(calls("app_dupla_mark")[0][1].p_grade);
    // a marca aparece na hora (sem esperar o servidor)
    expect(p1.getAttribute("aria-checked")).toBe("true");

    const item3 = screen.getByRole("radiogroup", { name: "Item 3" });
    fireEvent.click(within(item3).getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("radiogroup", { name: "Item 2" }).querySelectorAll("[role=radio]")[0]);
    await advance(300);
    expect(calls("app_dupla_mark").map((c: any[]) => c[1].p_item_id).sort()).toEqual(["i1", "i2", "i3"]);
  });

  it("marcação pendente é enviada antes de Finalizar estação e de Finalizar e liberar resultado", async () => {
    await mount();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Item 1" })).getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Finalizar estação" }));
    await advance(0);
    const order = rpc.mock.calls.map((c: any[]) => c[0]).filter((f: string) => f === "app_dupla_mark" || f === "app_dupla_finish");
    expect(order).toEqual(["app_dupla_mark", "app_dupla_finish"]);
    await advance(0);
    expect(screen.getByText("Conferência da avaliação")).toBeTruthy();

    // conferência: mudar uma nota e finalizar em seguida
    const grader = screen.getByRole("radiogroup", { name: "Nota do critério 2" });
    fireEvent.click(within(grader).getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Finalizar e liberar resultado" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Finalizar e liberar" }));
    await advance(0);
    const order2 = rpc.mock.calls.map((c: any[]) => c[0]).filter((f: string) => f === "app_dupla_mark" || f === "app_dupla_finalize");
    expect(order2.slice(-2)).toEqual(["app_dupla_mark", "app_dupla_finalize"]);
  });

  it("marcação pendente vai na hora quando a página é escondida", async () => {
    await mount();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Item 1" })).getAllByRole("radio")[0]);
    window.dispatchEvent(new Event("pagehide"));
    await advance(0);
    expect(calls("app_dupla_mark")).toHaveLength(1);
  });

  it("anotações ficam no aparelho por sala e rodada e voltam ao recarregar", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /Anotações/ }));
    fireEvent.change(screen.getByPlaceholderText("Anote o que observar durante o atendimento"), { target: { value: "Não perguntou alergias." } });
    expect(JSON.parse(window.localStorage.getItem("smn-dupla-notas:r1:1")!)).toBe("Não perguntou alergias.");
    cleanup();
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /Anotações/ }));
    expect((screen.getByPlaceholderText("Anote o que observar durante o atendimento") as HTMLTextAreaElement).value).toBe("Não perguntou alergias.");
  });

  it("Materiais só aparece com resumo, com 'Resumo sobre o tema'", async () => {
    srv.content = contentOf("evaluator", { summary: "Resumo de teste da estação." });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /Materiais/ }));
    expect(screen.getByText("Resumo sobre o tema")).toBeTruthy();
    expect(screen.getByText("Resumo de teste da estação.")).toBeTruthy();
    expect(screen.getByText("Conferido pela revisão médica. O candidato não vê este resumo.")).toBeTruthy();
    cleanup();
    // sem resumo aprovado (o servidor manda null): nada de Materiais
    srv.content = contentOf("evaluator", { summary: null });
    await mount();
    expect(screen.queryByRole("button", { name: /Materiais/ })).toBeNull();
    cleanup();
    // candidato: nunca há Materiais
    srv.room = asCandidate(running());
    srv.content = contentOf("candidate");
    await mount();
    expect(screen.queryByRole("button", { name: /Materiais/ })).toBeNull();
    expect(document.body.textContent).not.toContain("Resumo sobre o tema");
  });

  it("o candidato nunca pede marcações nem resultado durante a estação e a tela não mostra roteiro, PEP, número da prova ou o nome", async () => {
    srv.room = asCandidate(running({ released_pressings: ["d1", "d2"] }));
    srv.content = contentOf("candidate", { released: ["d1", "d2"] });
    await mount();
    await advance(10000);
    expect(calls("app_dupla_marks")).toHaveLength(0);
    expect(calls("app_dupla_result")).toHaveLength(0);
    const text = document.body.textContent || "";
    for (const leak of [STATION.name, "Paciente de teste", "Item um", "documento oficial", "teste-p1", "teste-dupla-e01"]) expect(text).not.toContain(leak);
  });
});

describe("printsApi", () => {
  it("link assinado; 404 → null; sem link no local baixa o arquivo; sem servidor → null", async () => {
    vi.useRealTimers();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ url: "https://deposito.test/a.png" }) });
    expect(await printUrl(backend, "r1", "d1")).toBe("https://deposito.test/a.png");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: "Impresso sem imagem." }) });
    expect(await printUrl(backend, "r1", "d1")).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "Impresso não liberado." }) });
    await expect(printUrl(backend, "r1", "d9")).rejects.toThrow("Impresso não liberado.");
    const blob = new Blob(["x"], { type: "image/png" });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ url: null }) });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, blob: async () => blob });
    const created = vi.fn(() => "blob:local-1");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: created }));
    expect(await printUrl(backend, "r1", "candidate_sheet")).toBe("blob:local-1");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/dupla/rooms/r1/prints/candidate_sheet/file", { headers: { Authorization: "Bearer token-de-teste" } });
    expect(await printUrl({ rpc }, "r1", "d1")).toBeNull();
  });
});
