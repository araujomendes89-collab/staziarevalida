/**
 * Fontes complementares, telas da EQUIPE (APOIO-B; jsdom, banco simulado):
 *  - aba Fontes da Central de Conteúdo: seção "Textos que citam fontes complementares" (só administrador) com o resultado da varredura,
 *    onde editar cada texto e o botão "Conferir de novo";
 *  - Podcasts da equipe: botão para marcar a fonte do episódio como complementar (o aluno deixa de vê-la) ou voltar a oficial, só administrador;
 *  - Registro da Administração: a marcação aparece em português.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const session: { role: string } = { role: "admin" };
const backend: any = { rpc: vi.fn(), accessToken: async () => "token-de-teste" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: session.role, profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { Sources } from "../novo/app/admin/content/Sources.jsx";
import { whereToEdit } from "../novo/app/admin/content/ComplementarMentions.jsx";
import { AdminPodcasts } from "../novo/app/admin/AdminPodcasts.jsx";
import { ACTION_LABEL, auditLabel, auditSummary } from "../novo/app/admin/auditLog.js";

const ACHADOS = [
  { kind: "aula", tabela: "lessons", id: "l1", campo: "Professor", onde: "Aula: Bronquiolite no lactente", aba: "aulas", item: "l1", trecho: "Equipe Sangue nos Olhos", publicado: true },
  { kind: "questao", tabela: "questions", id: "q1", campo: "Conduta esperada", onde: "Questão REV-2024-Q001", aba: "questoes", item: "q1", trecho: "Suporte conforme a apostila", publicado: true },
  { kind: "podcast", tabela: "podcasts", id: "p1", campo: "Falas do roteiro", onde: "Podcast: Bronquiolite em 8 minutos", aba: "podcasts", item: "p1", trecho: "Segundo a apostila, suporte", publicado: false },
  { kind: "tutor_mensagem", tabela: "tutor_messages", id: "9", campo: "Resposta do Tutor", onde: "Conversa do Tutor (resposta)", aba: "tutor", item: "s1", trecho: "Conforme a apostila", publicado: true },
];

let achados: any[];
let chamadas: string[];

beforeEach(() => {
  session.role = "admin";
  achados = [...ACHADOS];
  chamadas = [];
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string) => {
    chamadas.push(fn);
    if (fn === "app_ch_sources") return [];
    if (fn === "app_ch_source_audiences") return {};
    if (fn === "app_ch_complementar_mentions") return achados;
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

describe("aba Fontes › Textos que citam fontes complementares", () => {
  it("o administrador vê cada texto com o lugar, o campo, o trecho e a aba onde editar", async () => {
    render(<MemoryRouter><Sources isAdmin go={() => {}} /></MemoryRouter>);
    expect(await screen.findByText("Textos que citam fontes complementares")).toBeTruthy();
    expect(await screen.findByText("Aula: Bronquiolite no lactente")).toBeTruthy();
    expect(screen.getByText("Professor")).toBeTruthy();
    expect(screen.getByText(/Equipe Sangue nos Olhos/)).toBeTruthy();
    expect(screen.getByText("Rascunho")).toBeTruthy(); // o podcast ainda não está publicado
    const links = screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual(expect.arrayContaining([
      ["Abrir em Aulas", "/?aba=aulas"],
      ["Abrir em Questões", "/?aba=questoes"],
      ["Abrir em Podcasts", "/?aba=podcasts&ep=p1"],
    ]));
    // conversa do aluno com o Tutor: não há tela de edição, e a tela diz isso em português
    expect(screen.getByText(/não há tela de edição/)).toBeTruthy();
  });

  it("'Conferir de novo' roda a varredura outra vez e mostra a lista nova", async () => {
    render(<MemoryRouter><Sources isAdmin go={() => {}} /></MemoryRouter>);
    await screen.findByText("Aula: Bronquiolite no lactente");
    expect(chamadas.filter((f) => f === "app_ch_complementar_mentions")).toHaveLength(1);
    achados = [ACHADOS[1]];
    fireEvent.click(screen.getByRole("button", { name: /Conferir de novo/ }));
    await waitFor(() => expect(screen.queryByText("Aula: Bronquiolite no lactente")).toBeNull());
    expect(chamadas.filter((f) => f === "app_ch_complementar_mentions")).toHaveLength(2);
    expect(screen.getByText("Questão REV-2024-Q001")).toBeTruthy();
  });

  it("lista vazia: diz que nenhum texto cita fonte complementar", async () => {
    achados = [];
    render(<MemoryRouter><Sources isAdmin go={() => {}} /></MemoryRouter>);
    expect(await screen.findByText("Nenhum texto cita fonte complementar")).toBeTruthy();
  });

  it("se a varredura falhar, a seção mostra o erro e as fontes continuam na tela", async () => {
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_ch_sources") return [{ id: "s1", title: "PCDT de Bronquiolite", organ: "Ministério da Saúde", kind: "final", status: "current", version: "1", authority_level: "A", passages: 1, freshness: "FRESH", changes: 0, diffs: 0, url: null }];
      if (fn === "app_ch_source_audiences") return { s1: "oficial" };
      // painéis da busca de fontes oficiais com IA (publicar-fontes-ia): carregam sem erro, para só a varredura falhar
      if (["app_ch_official_domains", "app_ch_source_candidates", "app_ch_source_searches", "app_incidence"].includes(fn)) return [];
      throw new Error("fora do ar");
    });
    render(<MemoryRouter><Sources isAdmin go={() => {}} /></MemoryRouter>);
    expect(await screen.findByText("PCDT de Bronquiolite")).toBeTruthy();
    // (a aba também tem painéis novos da busca de fontes oficiais, que podem mostrar o próprio "Tentar de novo")
    expect((await screen.findAllByRole("button", { name: "Tentar de novo" })).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Textos que citam fontes complementares")).toBeTruthy();
  });

  it("quem não é administrador não vê a seção e a varredura nem é chamada", async () => {
    render(<MemoryRouter><Sources isAdmin={false} go={() => {}} /></MemoryRouter>);
    await waitFor(() => expect(chamadas).toContain("app_ch_sources"));
    expect(screen.queryByText("Textos que citam fontes complementares")).toBeNull();
    expect(chamadas).not.toContain("app_ch_complementar_mentions");
  });

  it("sem roteador (testes e telas soltas) o texto ganha link comum em vez de quebrar", async () => {
    render(<Sources isAdmin go={() => {}} />);
    expect(await screen.findByText("Aula: Bronquiolite no lactente")).toBeTruthy();
    expect(screen.getAllByRole("link").some((a) => a.getAttribute("href") === "?aba=aulas")).toBe(true);
  });

  it("onde editar: cada tipo aponta para a aba certa", () => {
    expect(whereToEdit({ aba: "atualizacoes" })).toMatchObject({ label: "Atualizações", search: "?aba=atualizacoes" });
    expect(whereToEdit({ aba: "central" })).toMatchObject({ search: "?aba=conteudo&secao=analises" });
    expect(whereToEdit({ aba: "estacoes" })).toMatchObject({ search: "?aba=estacoes" });
    expect(whereToEdit({ aba: "configuracoes" })).toMatchObject({ search: "?aba=config" });
    expect(whereToEdit({ aba: "tutor" })).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------- podcasts
const ID = "11111111-1111-4111-8111-111111111111";
const episodio = (fonteExtra: Record<string, unknown> = {}, status = "script_ready") => ({
  id: ID, title: "Bronquiolite em 8 minutos", topic: "Bronquiolite", area: "PEDIATRIA", lesson_id: null, target_minutes: 8, status,
  sources: [
    { id: "s1", kind: "link", title: "PCDT Bronquiolite", pages: null, chunks: 4, url: "https://www.gov.br/saude/pcdt", complementar: false, student_hidden: false },
    { id: "s2", kind: "pdf", title: "resumo-final.pdf", pages: 400, chunks: 9, url: null, complementar: false, student_hidden: false, ...fonteExtra },
  ],
  chunks_total: 13, script: null, script_meta: {}, cited: {}, approved_at: null, audio_path: null, audio_meta: {},
});
const PROVIDERS = { script: { choices: [], override_allowed: true, configured: false, current: null }, tts: [], voices: {}, default_voices: {} };

function montaPodcast(role: string, view: any, extra?: (fn: string, args: any) => any) {
  session.role = role;
  let atual = view;
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    chamadas.push(fn);
    const custom = extra?.(fn, args);
    if (custom !== undefined) return custom;
    if (fn === "app_admin_podcasts") return [{ id: ID, title: atual.title, status: atual.status, sources: 2, lines: 0, updated_at: "2026-10-06T12:00:00Z" }];
    if (fn === "app_admin_lessons") return { lessons: [] };
    if (fn === "app_admin_podcast") return atual;
    throw new Error(`rpc não simulada: ${fn}`);
  });
  (globalThis as any).fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/api/podcasts/providers") ? PROVIDERS : {}), { status: 200, headers: { "Content-Type": "application/json" } }));
  return { set: (v: any) => (atual = v), ...render(<MemoryRouter initialEntries={[`/novo/admin?aba=podcasts&ep=${ID}`]}><AdminPodcasts /></MemoryRouter>) };
}

describe("Administração › Podcasts: fonte complementar", () => {
  it("o administrador marca a fonte como complementar e a tela mostra que o aluno não a vê", async () => {
    const depois = episodio({ complementar: true, student_hidden: true });
    montaPodcast("admin", episodio(), (fn, args) => (fn === "app_admin_podcast_source_complementar" ? (expect(args).toEqual({ p_source_id: "s2", p_complementar: true }), depois) : undefined));
    const botoes = await screen.findAllByRole("button", { name: "Marcar como complementar" });
    expect(botoes).toHaveLength(2); // uma por fonte
    fireEvent.click(botoes[1]);
    await waitFor(() => expect(chamadas).toContain("app_admin_podcast_source_complementar"));
    expect(await screen.findByText("Fonte complementar · o aluno não vê esta fonte")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Voltar a oficial" })).toBeTruthy();
  });

  it("voltar a oficial pede confirmação e chama a função com falso", async () => {
    const volta = episodio();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    montaPodcast("admin", episodio({ complementar: true, student_hidden: true }), (fn, args) => (fn === "app_admin_podcast_source_complementar" ? (expect(args).toEqual({ p_source_id: "s2", p_complementar: false }), volta) : undefined));
    fireEvent.click(await screen.findByRole("button", { name: "Voltar a oficial" }));
    await waitFor(() => expect(chamadas).toContain("app_admin_podcast_source_complementar"));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("O aluno voltará a ver"));
    await waitFor(() => expect(screen.queryByText("Fonte complementar · o aluno não vê esta fonte")).toBeNull());
  });

  it("voltar a oficial: se a pessoa desistir na confirmação, nada é chamado", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    montaPodcast("admin", episodio({ complementar: true, student_hidden: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Voltar a oficial" }));
    expect(chamadas).not.toContain("app_admin_podcast_source_complementar");
  });

  it("fonte cujo nome bate com uma fonte complementar da biblioteca já aparece como escondida do aluno", async () => {
    montaPodcast("admin", episodio({ student_hidden: true, complementar: false }));
    expect(await screen.findByText(/O aluno não vê esta fonte: o nome bate com uma fonte complementar da biblioteca/)).toBeTruthy();
  });

  it("o editor não vê o botão", async () => {
    montaPodcast("editor", episodio());
    await screen.findByText(/resumo-final.pdf/);
    expect(screen.queryByRole("button", { name: "Marcar como complementar" })).toBeNull();
  });

  it("episódio publicado: marcar continua possível (só esconde do aluno); renomear e tirar ficam travados", async () => {
    montaPodcast("admin", episodio({}, "published"));
    expect((await screen.findAllByRole("button", { name: "Marcar como complementar" })).length).toBe(2);
    expect(screen.queryByRole("button", { name: /Renomear/ })).toBeNull();
  });

  it("erro do banco aparece em português na tela", async () => {
    montaPodcast("admin", episodio(), (fn) => {
      if (fn === "app_admin_podcast_source_complementar") throw new Error("Fonte não encontrada.");
      return undefined;
    });
    fireEvent.click((await screen.findAllByRole("button", { name: "Marcar como complementar" }))[0]);
    expect(await screen.findByText("Fonte não encontrada.")).toBeTruthy();
  });
});

describe("Registro da Administração: fonte de podcast", () => {
  it("a marcação tem nome e resumo em português, com o episódio e a fonte", () => {
    expect(ACTION_LABEL["podcast.source_complementar"]).toBe("Classe da fonte do podcast alterada");
    const entry = { action: "podcast.source_complementar", target: ID, title: "Bronquiolite em 8 minutos", details: { source: "s2", title: "resumo-final.pdf", from: "oficial", to: "complementar" } };
    expect(auditLabel(entry)).toBe("Classe da fonte do podcast alterada");
    const resumo = auditSummary(entry);
    expect(resumo).toContain("Bronquiolite em 8 minutos");
    expect(resumo).toContain("resumo-final.pdf");
    expect(resumo).toContain("o aluno não vê esta fonte");
    expect(auditSummary({ ...entry, details: { ...entry.details, to: "oficial" } })).toContain("volta a ver");
  });
});
