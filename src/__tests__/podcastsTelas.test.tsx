/**
 * Telas dos podcasts e do assistente da aula (jsdom). Banco e servidor simulados; a lógica de verdade está em podcasts.test.ts
 * e lessonAssist.test.ts. Confere o que a equipe vê (avisos, aprovação com nota, publicação só do administrador), o que o aluno
 * vê (só publicado, transcrição e fontes com páginas) e que o assistente só muda o formulário quando a pessoa clica em "Usar".
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const session: { role: string } = { role: "editor" };
const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: session.role } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false }));

import { AdminPodcasts } from "../novo/app/admin/AdminPodcasts.jsx";
import { LessonAssistant } from "../novo/app/admin/LessonAssistant.jsx";
import { PodcastsSection } from "../novo/app/podcasts/PodcastsSection.jsx";

const ID = "11111111-1111-4111-8111-111111111111";
const SCRIPT_CHOICES = {
  choices: [
    { kind: "gemini", label: "Gemini", ready: false, model: null, pending: "GEMINI_API_KEY ausente no servidor." },
    { kind: "anthropic", label: "Claude", ready: true, model: "claude-sonnet-5-5", pending: null },
    { kind: "openai", label: "OpenAI", ready: true, model: "gpt-5", pending: null },
  ],
  override_allowed: true,
  configured: false,
  current: null,
};
const LOCKED_CHOICES = { ...SCRIPT_CHOICES, override_allowed: false, configured: true, current: { kind: "anthropic", label: "Claude", model: "claude-sonnet-5-5" } };
const PROVIDERS = {
  script: SCRIPT_CHOICES,
  tts: [
    { kind: "gemini", label: "Gemini (duas vozes na mesma conversa)", ready: false, model: "gemini-3.8-flash-tts", pending: "indisponível por enquanto (desligada no servidor; PODCAST_TTS_GEMINI_ENABLED=1 liga)." },
    { kind: "openai", label: "OpenAI (uma voz por fala)", ready: true, model: "gpt-4o-mini-tts", pending: null },
  ],
  voices: { gemini: ["Sulafat", "Puck"], openai: ["marin", "cedar", "coral"] },
  default_voices: { gemini: { ana: "Sulafat", bruno: "Puck" }, openai: { ana: "marin", bruno: "cedar" } },
};
const episode = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  title: "Pré-eclâmpsia em 5 minutos",
  topic: "Pré-eclâmpsia",
  area: "GINECOLOGIA_OBSTETRICIA",
  lesson_id: null,
  target_minutes: 5,
  status: "script_ready",
  sources: [{ id: "s1", kind: "pdf", title: "PCDT.pdf", pages: 2, chunks: 3, url: null }],
  chunks_total: 3,
  script: {
    lines: [
      { speaker: "ANA", text: "Hoje: pré-eclâmpsia.", style: "acolhedora", sources: [] },
      { speaker: "BRUNO", text: "Qual a dose de ataque?", style: "curioso", sources: [] },
      { speaker: "ANA", text: "O material traz 6 g IV.", style: "firme", sources: [7] },
    ],
    missing: ["A manutenção não aparece nas fontes."],
  },
  script_meta: { provider: "anthropic", model: "claude-sonnet-5-5", input_tokens: 1000, output_tokens: 500, cost_usd: 0.0123, warnings: [{ line: 2, kind: "ungrounded_number", detail: '"6 g" não está nos trechos citados' }] },
  cited: { "7": { source: "PCDT.pdf", page: 1, excerpt: "Sulfato de magnésio 4 g IV no ataque." } },
  approved_at: null,
  audio_path: null,
  audio_meta: {},
  ...extra,
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  backend.rpc.mockReset();
  fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/api/podcasts/providers")) return new Response(JSON.stringify(PROVIDERS), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/script/check")) return new Response(JSON.stringify({ warnings: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ error: "não simulado" }), { status: 500, headers: { "Content-Type": "application/json" } });
  });
  (globalThis as any).fetch = fetchMock;
});
afterEach(() => cleanup());

const renderAdmin = (role: string, view: any) => {
  session.role = role;
  backend.rpc.mockImplementation(async (fn: string) => {
    if (fn === "app_admin_podcasts") return [{ id: ID, title: view.title, status: view.status, sources: 1, lines: 3, updated_at: "2026-10-06T12:00:00Z" }];
    if (fn === "app_admin_lessons") return { lessons: [] };
    if (fn === "app_admin_podcast") return view;
    throw new Error(`rpc não simulada: ${fn}`);
  });
  return render(
    <MemoryRouter initialEntries={[`/novo/admin?aba=podcasts&ep=${ID}`]}>
      <AdminPodcasts />
    </MemoryRouter>
  );
};

describe("Administração › Podcasts", () => {
  it("mostra o fluxo, a fala com dose fora do trecho, a fonte citada com página e o que as fontes não esclarecem", async () => {
    renderAdmin("editor", episode());
    expect(await screen.findByText(/A IA nunca aprova nem publica/)).toBeTruthy();
    expect(await screen.findByText(/Número fora dos trechos citados/)).toBeTruthy();
    expect(screen.getByText("1 ponto(s) para conferir")).toBeTruthy();
    expect(screen.getByText("A manutenção não aparece nas fontes.")).toBeTruthy();
    const cite = screen.getByRole("button", { name: /T7 · PCDT.pdf, p. 1/ });
    fireEvent.click(cite);
    expect(screen.getByText("Sulfato de magnésio 4 g IV no ataque.")).toBeTruthy();
    // a IA indisponível não aparece na lista; o motivo aparece embaixo
    expect(screen.getByText(/Gemini: GEMINI_API_KEY ausente no servidor./)).toBeTruthy();
    expect(screen.getByText(/custo estimado US\$ 0,0123/)).toBeTruthy();
  });

  it("com a IA definida na Central e o seletor desligado, a tela mostra 'IA definida na Central de IAs' e não mostra o seletor", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/api/podcasts/providers") ? new Response(JSON.stringify({ ...PROVIDERS, script: LOCKED_CHOICES }), { status: 200, headers: { "Content-Type": "application/json" } }) : new Response("{}", { status: 404 })
    );
    renderAdmin("editor", episode({ status: "draft", script: null, script_meta: {} }));
    expect(await screen.findByText(/IA definida na Central de IAs: Claude claude-sonnet-5-5/)).toBeTruthy();
    expect(screen.queryByLabelText("IA do roteiro")).toBeNull();
  });

  it("o seletor de voz abre na OpenAI, mesmo com o Gemini ligado; desligado, o Gemini aparece como indisponível por enquanto", async () => {
    // Gemini ligado e pronto: a OpenAI continua sendo a escolhida na abertura
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/api/podcasts/providers")
        ? new Response(JSON.stringify({ ...PROVIDERS, tts: PROVIDERS.tts.map((p) => ({ ...p, ready: true, pending: null })) }), { status: 200, headers: { "Content-Type": "application/json" } })
        : new Response("{}", { status: 404 })
    );
    const { unmount } = renderAdmin("admin", episode({ status: "approved", approved_at: "2026-10-06T13:00:00Z", approved_by_name: "Editora", approval_note: "Conferido.", audio_path: null }));
    await waitFor(() => expect((screen.getByLabelText("Voz") as HTMLSelectElement).value).toBe("openai"));
    expect((screen.getByLabelText("Voz da Ana") as HTMLSelectElement).value).toBe("marin");
    expect((screen.getByLabelText("Voz do Bruno") as HTMLSelectElement).value).toBe("cedar");
    unmount();
    cleanup();
    // Gemini desligado: continua na OpenAI, a opção do Gemini fica travada e o motivo aparece embaixo
    fetchMock.mockImplementation(async (url: string) => (url.endsWith("/api/podcasts/providers") ? new Response(JSON.stringify(PROVIDERS), { status: 200, headers: { "Content-Type": "application/json" } }) : new Response("{}", { status: 404 })));
    renderAdmin("admin", episode({ status: "approved", approved_at: "2026-10-06T13:00:00Z", approved_by_name: "Editora", approval_note: "Conferido.", audio_path: null }));
    await waitFor(() => expect((screen.getByLabelText("Voz") as HTMLSelectElement).value).toBe("openai"));
    const gemini = Array.from((screen.getByLabelText("Voz") as HTMLSelectElement).options).find((o) => o.value === "gemini")!;
    expect(gemini.disabled).toBe(true);
    expect(gemini.textContent).toBe("Gemini — indisponível por enquanto");
    expect(screen.getByText(/Gemini: indisponível por enquanto/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Gerar áudio" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("aprovar exige escrever o que foi conferido; o editor não publica", async () => {
    renderAdmin("editor", episode());
    const approve = await screen.findByRole("button", { name: /Aprovar roteiro/ });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/O que você conferiu/), { target: { value: "Conferi a dose na página 1." } });
    expect((approve as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Só o administrador publica e apaga episódios.")).toBeTruthy();
    expect(screen.getByText(/O áudio só é gerado depois que uma pessoa da equipe aprovar o roteiro./)).toBeTruthy();
  });

  it("administrador: com roteiro aprovado e áudio pronto, aparece Publicar; vozes da OpenAI quando o Gemini falta", async () => {
    renderAdmin("admin", episode({ status: "audio_ready", approved_at: "2026-10-06T13:00:00Z", approved_by_name: "Editora", approval_note: "Conferido.", audio_path: null }));
    const publish = await screen.findByRole("button", { name: /^Publicar$/ });
    expect((publish as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Roteiro aprovado por Editora/)).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText("Voz") as HTMLSelectElement).value).toBe("openai"));
    expect((screen.getByLabelText("Voz da Ana") as HTMLSelectElement).value).toBe("marin");
    expect((screen.getByLabelText("Voz do Bruno") as HTMLSelectElement).value).toBe("cedar");
    expect(screen.getByRole("button", { name: /Apagar episódio/ })).toBeTruthy();
  });
});

describe("Assistente de IA da aula", () => {
  const RESULT = {
    suggestion: {
      title: "Bronquiolite viral aguda",
      topic: "Bronquiolite",
      area: "PEDIATRIA",
      summary: "Quadro de sibilância no lactente; tratamento de suporte.",
      summary_pages: [3, 4],
      key_points: [{ text: "Oxigênio se saturação abaixo de 90%.", sources: [2], pages: [4] }],
      missing: ["Critérios de internação não aparecem no material."],
    },
    warnings: ['Ponto-chave 2: "2 mg" não está nos trechos citados.'],
    usage: { provider: "anthropic", model: "claude-sonnet-5-5", input_tokens: 800, output_tokens: 200, cost_usd: 0.004, calls: 1 },
    used_chunks: 2,
    total_chunks: 2,
  };

  it("lê o texto colado, mostra as sugestões com as páginas e só muda o formulário ao clicar em Usar", async () => {
    const sent: any[] = [];
    (globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
      if (url.endsWith("/api/lessons/assist/providers")) return new Response(JSON.stringify(SCRIPT_CHOICES), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/api/lessons/assist")) {
        sent.push(JSON.parse(init.body));
        return new Response(JSON.stringify(RESULT), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("{}", { status: 404 });
    });
    const set = vi.fn();
    render(
      <MemoryRouter>
        <LessonAssistant form={{ title: "", topic: "", area: "CLINICA_MEDICA", summary: "", key_points: "" }} set={set} lesson={null} pending={{ slides: null, flashcast: null }} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir assistente" }));
    await waitFor(() => expect((screen.getByLabelText("IA") as HTMLSelectElement).value).toBe("anthropic"));
    expect(screen.getByText(/Gemini: GEMINI_API_KEY ausente no servidor./)).toBeTruthy();
    const generate = screen.getByRole("button", { name: "Gerar sugestões" });
    expect((generate as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Texto \(transcrição/), { target: { value: "Bronquiolite: oxigênio se saturação abaixo de 90%. ".repeat(3) } });
    fireEvent.click(generate);
    expect(await screen.findByText("Bronquiolite viral aguda")).toBeTruthy();
    expect(sent[0]).toMatchObject({ provider: "anthropic", area: "CLINICA_MEDICA", text: expect.stringContaining("Bronquiolite") });
    expect(screen.getByText("p. 4")).toBeTruthy();
    expect(screen.getByText(/"2 mg" não está nos trechos citados/)).toBeTruthy();
    expect(screen.getByText("Critérios de internação não aparecem no material.")).toBeTruthy();
    expect(set).not.toHaveBeenCalled();
    const title = screen.getByText("Título").closest("div")!.parentElement!;
    fireEvent.click(within(title).getByRole("button", { name: "Usar" }));
    expect(set).toHaveBeenLastCalledWith({ title: "Bronquiolite viral aguda" });
    fireEvent.click(screen.getByRole("button", { name: "Usar tudo no formulário" }));
    expect(set).toHaveBeenLastCalledWith({ title: "Bronquiolite viral aguda", topic: "Bronquiolite", area: "PEDIATRIA", summary: "Quadro de sibilância no lactente; tratamento de suporte.", key_points: "Oxigênio se saturação abaixo de 90%." });
  });

  it("com a IA definida na Central e o seletor desligado, a tela mostra 'IA definida na Central de IAs' e não mostra o seletor", async () => {
    const sent: any[] = [];
    (globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
      if (url.endsWith("/api/lessons/assist/providers")) return new Response(JSON.stringify(LOCKED_CHOICES), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/api/lessons/assist")) {
        sent.push(JSON.parse(init.body));
        return new Response(JSON.stringify(RESULT), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("{}", { status: 404 });
    });
    render(
      <MemoryRouter>
        <LessonAssistant form={{ title: "", topic: "", area: "CLINICA_MEDICA", summary: "", key_points: "" }} set={vi.fn()} lesson={null} pending={{ slides: null, flashcast: null }} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir assistente" }));
    expect(await screen.findByText(/IA definida na Central de IAs: Claude claude-sonnet-5-5/)).toBeTruthy();
    expect(screen.queryByLabelText("IA")).toBeNull();
    fireEvent.change(screen.getByLabelText(/Texto \(transcrição/), { target: { value: "Bronquiolite: oxigênio se saturação abaixo de 90%. ".repeat(3) } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar sugestões" }));
    await screen.findByText("Bronquiolite viral aguda");
    expect(sent[0]).toMatchObject({ provider: "anthropic" });
  });

  it("aula já salva oferece criar o podcast dela", () => {
    render(
      <MemoryRouter>
        <LessonAssistant form={{ title: "Aula", topic: "T", area: "PEDIATRIA", summary: "", key_points: "" }} set={vi.fn()} lesson={{ id: ID, title: "Aula", topic: "T", area: "PEDIATRIA", materials: [] }} pending={{}} />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: "Criar podcast desta aula" })).toBeTruthy();
  });
});

describe("Aulas › Podcasts (aluno)", () => {
  it("sem episódio publicado, a seção não aparece", async () => {
    backend.rpc.mockResolvedValue([]);
    const { container } = render(<PodcastsSection backend={backend} area="" />);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("app_podcasts", { p_area: null }));
    expect(container.textContent).toBe("");
  });

  it("lista os publicados; transcrição com Ana e Bruno e as fontes com as páginas", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_podcasts") return [{ id: ID, title: "Pré-eclâmpsia em 5 minutos", topic: "Pré-eclâmpsia", area: "GINECOLOGIA_OBSTETRICIA", seconds: 312, published_at: "2026-10-06T12:00:00Z", lesson: null }];
      if (fn === "app_podcast") return { lines: [{ speaker: "ANA", text: "Hoje: pré-eclâmpsia." }, { speaker: "BRUNO", text: "Bora!" }], sources: [{ title: "PCDT.pdf", kind: "pdf", url: null, pages: [1, 2] }] };
      return null;
    });
    render(<PodcastsSection backend={backend} area="GINECOLOGIA_OBSTETRICIA" />);
    expect(await screen.findByText("Pré-eclâmpsia em 5 minutos")).toBeTruthy();
    expect(screen.getByText(/5 min 12 s/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver transcrição e fontes" }));
    expect(await screen.findByText("Hoje: pré-eclâmpsia.")).toBeTruthy();
    expect(screen.getByText(/PCDT.pdf/).parentElement!.textContent).toContain("(p. 1, 2)");
    expect(screen.getByText(/Roteiro feito só com essas fontes e revisado pela equipe/)).toBeTruthy();
  });
});
