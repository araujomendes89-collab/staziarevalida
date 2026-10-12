/**
 * A08, rodada da revisão independente (achados 7 e 8), na tela do aluno (jsdom):
 *  - 7: o fim já validado que não chegou ao banco (rede) é reenviado ao sair da aula e na próxima visita;
 *  - 8: site novo + SQL antigo: a tela detecta a ausência das funções novas e fala como antes (sem prometer XP pelo fim); o fim
 *    guardado é reenviado quando o SQL chegar.
 */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OLD_XP_RULE, XP_RULE } from "../novo/app/study/lessonWatch.js";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
const boot: any = { profile: { name: "Ana" }, play: { enabled: true } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot, user: { id: "u1" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
import { LessonsScreen } from "../novo/app/study/LessonsScreen.jsx";

const ID = "11111111-1111-4111-8111-111111111111";
const lesson: any = {
  id: ID, area: "PEDIATRIA", area_label: "Pediatria", topic: "Bronquiolite", title: "Bronquiolite viral aguda", duration_minutes: 45, instructor: "Dra. Teste", specialty: "Pneumologia",
  video_url: "https://www.youtube.com/watch?v=abc123", summary: "Resumo.", key_points: [], guideline_title: null, guideline_url: null, published: true, position: 0, materials: [], progress: null,
};
let watch: (args: any) => any;
let state: () => any;
const missing = () => Object.assign(new Error("Could not find the function public.app_lesson_watch in the schema cache"), { code: "PGRST202" });
const ok = (a: any) => ({ seconds_watched: a.p_seconds, completed_at: null, watched_to_end_at: a.p_ended ? "2026-10-11T12:00:00Z" : null, xp: null });

beforeEach(() => {
  window.localStorage.clear();
  watch = ok;
  state = () => null;
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_lessons") return { total: 1, by_area: { PEDIATRIA: 1 }, completed: 0, lessons: [lesson] };
    if (fn === "app_lesson") return { ...lesson, questions_topic: 5, questions_area: 120 };
    if (fn === "app_lesson_watch_state") return state();
    if (fn === "app_lesson_watch") return watch(args);
    if (fn === "app_lesson_progress") return { seconds_watched: 0, completed_at: "2026-10-11T12:05:00Z", xp: null };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function openLesson() {
  render(<LessonsScreen go={vi.fn()} />);
  const cards = await screen.findAllByRole("button", { name: /Bronquiolite viral aguda/ });
  fireEvent.click(cards[cards.length - 1]);
  return screen.findByRole("heading", { name: "Bronquiolite viral aguda" });
}
const send = (iframe: HTMLIFrameElement, data: unknown) =>
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data), origin: "https://www.youtube-nocookie.com", source: iframe.contentWindow }));
  });
const yt = (iframe: HTMLIFrameElement, currentTime: number, playerState = 1, duration = 3) => send(iframe, { event: "infoDelivery", info: { currentTime, duration, playerState } });
const calls = () => backend.rpc.mock.calls.filter((c: any[]) => c[0] === "app_lesson_watch").map((c: any[]) => c[1]);
const assistirTudo = (iframe: HTMLIFrameElement) => {
  [0, 0.5, 1, 1.5, 2, 2.5, 3].forEach((t) => yt(iframe, t));
  yt(iframe, 3, 0);
};

describe("A08 achado 1 na tela: pular o vídeo não vale", () => {
  it("arrastar a barra para perto do fim e deixar o player andar não grava o fim", async () => {
    lesson.video_url = "https://www.youtube.com/watch?v=abc123";
    await openLesson();
    const iframe = screen.getByTitle("Vídeo da aula") as HTMLIFrameElement;
    [10, 10.25].forEach((t) => yt(iframe, t, 1, 600));
    [590, 590.25, 590.5].forEach((t) => yt(iframe, t, 1, 600));
    yt(iframe, 600, 0, 600);
    expect(calls()).toEqual([]);
    expect(screen.getByRole("note").textContent).toBe(XP_RULE);
  });
});

describe("A08 achado 7: o fim que não chegou ao banco é reenviado", () => {
  it("falha na rede no evento final; o aluno sai da aula e a conexão volta: ao sair, o fim é reenviado (p_ended true) e o banco guarda", async () => {
    await openLesson();
    const iframe = screen.getByTitle("Vídeo da aula") as HTMLIFrameElement;
    watch = () => {
      throw new Error("sem rede");
    };
    assistirTudo(iframe);
    await waitFor(() => expect(calls().length).toBe(1));
    expect(calls()[0]).toMatchObject({ p_ended: true });
    // o fim ficou guardado neste aparelho
    expect(window.localStorage.getItem("stazia.lessonEnds.v1")).toContain(ID);
    watch = ok;
    fireEvent.click(screen.getByRole("button", { name: /Voltar para as aulas/ }));
    await waitFor(() => expect(calls().length).toBe(2));
    expect(calls()[1]).toMatchObject({ p_id: ID, p_ended: true, p_seconds: 3 });
    await waitFor(() => expect(window.localStorage.getItem("stazia.lessonEnds.v1") ?? "{}").not.toContain(ID));
  });

  it("o aluno fecha o app sem conexão; ao abrir as aulas de novo, o fim guardado é reenviado sozinho", async () => {
    await openLesson();
    const iframe = screen.getByTitle("Vídeo da aula") as HTMLIFrameElement;
    watch = () => {
      throw new Error("sem rede");
    };
    assistirTudo(iframe);
    await waitFor(() => expect(calls().length).toBe(1));
    cleanup(); // app fechado: tudo desmonta (a tentativa ao sair também falha)
    expect(window.localStorage.getItem("stazia.lessonEnds.v1")).toContain(ID);
    const antes = calls().length;
    watch = ok;
    render(<LessonsScreen go={vi.fn()} />);
    await waitFor(() => expect(calls().length).toBeGreaterThan(antes));
    expect(calls().at(-1)).toMatchObject({ p_id: ID, p_ended: true, p_seconds: 3, p_duration: 3 });
    await waitFor(() => expect(window.localStorage.getItem("stazia.lessonEnds.v1") ?? "{}").not.toContain(ID));
  });
});

describe("A08 achado 8: site novo + SQL antigo", () => {
  const SEM_SQL = () => {
    throw missing();
  };

  it("a tela detecta a ausência das funções novas e fala como antes (concluir vale XP), sem prometer o XP pelo fim", async () => {
    state = SEM_SQL;
    watch = SEM_SQL;
    await openLesson();
    await waitFor(() => expect(screen.getByRole("note").textContent).toBe(OLD_XP_RULE));
    const iframe = screen.getByTitle("Vídeo da aula") as HTMLIFrameElement;
    assistirTudo(iframe);
    await waitFor(() => expect(calls().length).toBe(1));
    expect(screen.getByRole("note").textContent).toBe(OLD_XP_RULE); // nada de "assistiu até o fim, marque para ganhar o XP"
    expect(screen.queryByText(/Falta assistir/)).toBeNull();
    // concluir marca como feita e a nota some (como antes)
    fireEvent.click(screen.getByRole("button", { name: /Marcar como concluída/ }));
    expect(await screen.findByRole("button", { name: /Aula concluída/ })).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("o fim fica guardado e é reenviado quando o SQL chega (próxima visita)", async () => {
    state = SEM_SQL;
    watch = SEM_SQL;
    await openLesson();
    const iframe = screen.getByTitle("Vídeo da aula") as HTMLIFrameElement;
    assistirTudo(iframe);
    await waitFor(() => expect(calls().length).toBe(1));
    cleanup();
    expect(window.localStorage.getItem("stazia.lessonEnds.v1")).toContain(ID);
    const antes = calls().length;
    watch = ok; // o SQL chegou
    state = () => null;
    render(<LessonsScreen go={vi.fn()} />);
    await waitFor(() => expect(calls().length).toBeGreaterThan(antes));
    expect(calls().at(-1)).toMatchObject({ p_id: ID, p_ended: true });
    await waitFor(() => expect(window.localStorage.getItem("stazia.lessonEnds.v1") ?? "{}").not.toContain(ID));
  });
});
