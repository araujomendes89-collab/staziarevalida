/**
 * Leva 3, aba Questões, Q07, nas telas (jsdom, banco e servidor simulados): o editor da questão envia, troca e tira a figura
 * (uma por questão, texto alternativo obrigatório, PNG ou JPG de até 5 MB), a marca "Cita figura" não pode ser tirada sem a
 * imagem, e o aluno vê a figura (endereço pedido ao servidor). As regras de verdade estão em leva3QFiguraBanco.test.ts e
 * leva3QFiguraServidor.test.ts.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
const session: any = { backend, boot: { role: "editor", profile: { name: "Ed" } }, user: { id: "a" }, refresh: async () => {} };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { QuestionEditor } from "../novo/app/admin/AdminQuestions.jsx";
import { QuestionFigures } from "../novo/app/practice/QuestionFigures.jsx";

const ALT = "Eletrocardiograma de 12 derivações com supradesnivelamento de ST";
const PATH = "questoes/0123456789abcdef0123456789abcdef.png";
const ROW = {
  id: "q1", code: "REV-2024.1-Q001", attempts: 0, exam: { kind: "REVALIDA", year: 2024, semester: 1 }, number: 1, area: "PEDIATRIA", topic: "ECG", subtopic: "",
  statement: "Paciente com dor torácica, veja o ECG.", options: ["A", "B", "C", "D"].map((id) => ({ id, text: `Alt ${id}`, explanation: "" })),
  correct_option: "B", status: "valid", expected_conduct: "", inep_intent: "", needs_image: true, images: [], explanations_review: null,
  official: { answer: "B", answer_status: "FINAL", version: 1, source: "Gabarito", source_url: null, published_at: null },
};
const withFigure = { ...ROW, images: [{ path: PATH, alt: ALT }] };
const png = (name = "ecg-do-joao-silva.png", size = 2000) => new File([new Uint8Array(size)], name, { type: "image/png" });

type Call = { url: string; method: string; headers: Record<string, string>; body: any };
let calls: Call[];
let figureRow: any;
/** Servidor simulado das figuras: modo local (envio pelo servidor). */
function stubServer(row: any = ROW) {
  figureRow = row;
  calls = [];
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:figura" }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any = {}) => {
      calls.push({ url, method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body });
      const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, blob: async () => new Blob(["x"], { type: "image/png" }) });
      if (/\/upload$/.test(url)) return ok({ mode: "direct" });
      if (/\/figure\?/.test(url) && init.method === "POST") {
        figureRow = { ...figureRow, images: [{ path: PATH, alt: new URL(url, "http://x").searchParams.get("alt") }] };
        return ok(figureRow, 201);
      }
      if (/\/figure$/.test(url) && init.method === "DELETE") {
        figureRow = { ...figureRow, images: [] };
        return ok(figureRow);
      }
      if (/\/link$/.test(url)) return ok({ url: null });
      if (/\/file$/.test(url)) return ok({});
      return ok({ error: "rota não simulada" }, 404);
    })
  );
}
const open = async (row: any = ROW) => {
  stubServer(row);
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_admin_question") return figureRow;
    throw new Error(`rpc não simulada: ${fn}`);
  });
  const onSaved = vi.fn();
  render(<QuestionEditor id="q1" onClose={vi.fn()} onSaved={onSaved} />);
  const card = await screen.findByRole("region", { name: "Figura da questão" });
  return { card, onSaved };
};

beforeEach(() => {
  session.boot = { role: "editor", profile: { name: "Ed" } };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Q07 — o editor envia, troca e tira a figura", () => {
  it("questão sem figura: mostra o aviso, pede o arquivo e o texto alternativo, e só libera o envio com os dois", async () => {
    const { card } = await open();
    expect(within(card).getByText(/Esta questão ainda não tem figura/)).toBeTruthy();
    expect(within(card).getByText(/PNG ou JPG, até 5 MB/)).toBeTruthy();
    const send = within(card).getByRole("button", { name: "Enviar figura" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const input = within(card).getByLabelText("Arquivo da figura") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png()] } });
    expect(send.disabled).toBe(true); // falta o texto alternativo
    const alt = within(card).getByLabelText("Texto alternativo da figura");
    fireEvent.change(alt, { target: { value: "curto" } });
    expect(send.disabled).toBe(true);
    expect(within(card).getByText(/de 10 a 300 letras/)).toBeTruthy();
    fireEvent.change(alt, { target: { value: ALT } });
    expect(send.disabled).toBe(false);
  });

  it("envia pelo servidor, mostra a figura enviada com o texto alternativo e avisa a lista; o nome do arquivo não vai ao servidor como nome", async () => {
    const { card, onSaved } = await open();
    fireEvent.change(within(card).getByLabelText("Arquivo da figura"), { target: { files: [png("ecg-do-joao-silva.png")] } });
    fireEvent.change(within(card).getByLabelText("Texto alternativo da figura"), { target: { value: ALT } });
    fireEvent.click(within(card).getByRole("button", { name: "Enviar figura" }));
    expect(await within(card).findByText("Figura enviada.")).toBeTruthy();
    const post = calls.find((c) => /\/figure\?/.test(c.url))!;
    expect(post.method).toBe("POST");
    expect(post.headers["Content-Type"]).toBe("image/png");
    expect(post.headers.Authorization).toBe("Bearer t");
    expect(post.url).not.toMatch(/joao|silva/i);
    expect(new URL(post.url, "http://x").searchParams.get("alt")).toBe(ALT);
    // a figura aparece (pelo servidor local) com o texto alternativo, e dá para trocar ou tirar
    expect(await within(card).findByAltText(ALT)).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Trocar figura" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Tirar figura" })).toBeTruthy();
    expect(onSaved).toHaveBeenCalled();
    // as outras alterações do formulário continuam como estavam (a figura não regrava a questão)
    expect(backend.rpc.mock.calls.some((c: any[]) => c[0] === "app_admin_save_question")).toBe(false);
  });

  it("recusa na hora o arquivo que não é PNG ou JPG e o que passa de 5 MB, sem chamar o servidor", async () => {
    const { card } = await open();
    const input = within(card).getByLabelText("Arquivo da figura") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["%PDF"], "laudo.pdf", { type: "application/pdf" })] } });
    expect(await within(card).findByText("Envie a figura em PNG ou JPG.")).toBeTruthy();
    fireEvent.change(input, { target: { files: [new File(["x"], "foto.gif", { type: "image/gif" })] } });
    expect(await within(card).findByText("Envie a figura em PNG ou JPG.")).toBeTruthy();
    fireEvent.change(input, { target: { files: [png("grande.png", 5 * 1024 * 1024 + 1)] } });
    expect(await within(card).findByText("A figura pode ter no máximo 5 MB.")).toBeTruthy();
    expect(calls).toHaveLength(0);
    expect((within(card).getByRole("button", { name: "Enviar figura" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("mostra a recusa do servidor em português e não diz que enviou", async () => {
    const { card } = await open();
    (fetch as any).mockImplementationOnce(async () => ({ ok: false, status: 403, json: async () => ({ error: "Acesso restrito à equipe." }) }));
    fireEvent.change(within(card).getByLabelText("Arquivo da figura"), { target: { files: [png()] } });
    fireEvent.change(within(card).getByLabelText("Texto alternativo da figura"), { target: { value: ALT } });
    fireEvent.click(within(card).getByRole("button", { name: "Enviar figura" }));
    expect(await within(card).findByText("Acesso restrito à equipe.")).toBeTruthy();
    expect(within(card).queryByText("Figura enviada.")).toBeNull();
  });

  it("trocar: o texto alternativo vem preenchido e o envio substitui a figura", async () => {
    const { card } = await open(withFigure);
    expect(await within(card).findByAltText(ALT)).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Trocar figura" }));
    const alt = within(card).getByLabelText("Texto alternativo da figura") as HTMLTextAreaElement;
    expect(alt.value).toBe(ALT);
    fireEvent.change(within(card).getByLabelText("Arquivo da figura"), { target: { files: [png("outra.png")] } });
    fireEvent.change(alt, { target: { value: "Radiografia de tórax em PA com derrame pleural à direita" } });
    fireEvent.click(within(card).getByRole("button", { name: "Enviar figura" }));
    expect(await within(card).findByText("Figura enviada.")).toBeTruthy();
    expect(await within(card).findByAltText("Radiografia de tórax em PA com derrame pleural à direita")).toBeTruthy();
  });

  it("tirar a figura pede confirmação e avisa que a questão que cita figura sai dos treinos", async () => {
    const { card } = await open(withFigure);
    fireEvent.click(await within(card).findByRole("button", { name: "Tirar figura" }));
    expect(within(card).getByText(/sai dos treinos/)).toBeTruthy();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(within(card).getByRole("button", { name: "Cancelar" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(within(card).getByRole("button", { name: "Tirar figura" }));
    fireEvent.click(within(card).getByRole("button", { name: "Sim, tirar a figura" }));
    expect(await within(card).findByText("Figura retirada.")).toBeTruthy();
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
    expect(within(card).getByText(/Esta questão ainda não tem figura/)).toBeTruthy();
  });

  it("questão nova: manda salvar primeiro; questão com várias figuras do caderno: só mostra, sem trocar", async () => {
    stubServer(ROW);
    render(<QuestionEditor id={undefined} onClose={vi.fn()} onSaved={vi.fn()} />);
    const fresh = await screen.findByRole("region", { name: "Figura da questão" });
    expect(within(fresh).getByText(/Salve a questão primeiro para enviar a figura/)).toBeTruthy();
    expect(within(fresh).queryByLabelText("Arquivo da figura")).toBeNull();
    cleanup();
    const { card } = await open({ ...ROW, images: [{ url: "/question-assets/a.png", alt: "Figura A do caderno" }, { url: "/question-assets/b.png", alt: "Figura B do caderno" }] });
    expect(within(card).getByText(/2 figuras vindas do caderno oficial/)).toBeTruthy();
    expect(within(card).queryByRole("button", { name: "Trocar figura" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Enviar figura" })).toBeNull();
    expect(within(card).getByAltText("Figura A do caderno")).toBeTruthy();
  });

  it("'Cita figura' não pode ser desmarcada enquanto não há figura; com a figura, pode", async () => {
    await open();
    const box = screen.getByLabelText(/Cita uma figura que não está vinculada/) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
    expect(screen.getByText(/Para tirar esta marca, envie a figura/)).toBeTruthy();
    cleanup();
    await open(withFigure);
    const linked = (await screen.findByLabelText(/Cita figura \(a imagem está vinculada\)/)) as HTMLInputElement;
    expect(linked.disabled).toBe(false);
    fireEvent.click(linked);
    expect(linked.checked).toBe(false);
  });

  it("questão que não cita figura pode ser marcada e desmarcada à vontade", async () => {
    await open({ ...ROW, needs_image: false });
    const box = (await screen.findByLabelText(/Cita figura|Cita uma figura/)) as HTMLInputElement;
    expect(box.disabled).toBe(false);
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(box.checked).toBe(false);
  });
});

describe("Q07 — a figura chega ao aluno", () => {
  const withBackend = () => {
    stubServer(ROW);
    (fetch as any).mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ url: /\/0\/link$/.test(url) ? "https://deposito.test/figura.png?expira=3600" : null }),
      blob: async () => new Blob(["x"]),
    }));
  };

  it("figura enviada pela equipe: pede o endereço ao servidor e mostra a imagem com o texto alternativo", async () => {
    withBackend();
    render(<QuestionFigures questionId="q1" images={[{ path: PATH, alt: ALT }]} />);
    const img = (await screen.findByAltText(ALT)) as HTMLImageElement;
    expect(img.src).toBe("https://deposito.test/figura.png?expira=3600");
    expect((fetch as any).mock.calls[0][0]).toBe("/api/question-figures/q1/0/link");
    expect(screen.queryByText(PATH)).toBeNull();
  });

  it("figura do caderno (endereço público) aparece sem pedir nada ao servidor", async () => {
    withBackend();
    render(<QuestionFigures questionId="q1" images={[{ url: "/question-assets/a.png", alt: "Figura do caderno" }]} />);
    expect(((await screen.findByAltText("Figura do caderno")) as HTMLImageElement).getAttribute("src")).toBe("/question-assets/a.png");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("se o servidor não entrega a figura, o aluno vê um aviso em português (e o texto alternativo)", async () => {
    stubServer(ROW);
    (fetch as any).mockImplementation(async () => ({ ok: false, status: 404, json: async () => ({ error: "Figura não encontrada." }) }));
    render(<QuestionFigures questionId="q1" images={[{ path: PATH, alt: ALT }]} />);
    expect(await screen.findByText("Não foi possível carregar a figura.")).toBeTruthy();
    expect(screen.getByText(ALT)).toBeTruthy();
  });

  it("sem figura não mostra nada", () => {
    const { container } = render(<QuestionFigures questionId="q1" images={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
