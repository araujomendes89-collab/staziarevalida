/**
 * Editor profissional, expansão — Central de Conteúdo + Aulas (migração 013160), telas (jsdom, banco simulado).
 *   * Unidades › Materiais: inserir e "Legenda e transcrição" mandam a formatação (content.formatacao) ao banco; versão no ar só
 *     "Ajustar formatação".
 *   * Aluno (TemaAula): negrito na legenda, na transcrição e nos pontos-chave quando o rico bate com o texto; sem formatação, igual a hoje.
 *   * Editar aula: pontos-chave com formatação chegam ao banco como key_points_rico alinhado aos pontos.
 * O CampoRico (editor TipTap) vira aqui um textarea com um botão "Negrito" que devolve o que o editor de verdade devolveria
 * (campoDoDoc de um documento com o primeiro parágrafo em negrito); o editor de verdade é testado em editorPro.campos.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "tok" };
let papel = "admin";
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: papel, profile: { name: "Adm" } }, user: { id: "u" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/tutor/TutorDrawer.jsx", () => ({ TutorButton: ({ label }: any) => <button type="button">{label}</button> }));
vi.mock("../novo/app/editorPro/CampoRico.jsx", async () => {
  const React = await import("react");
  const { campoDoDoc } = await import("../shared/docRico/campos");
  function CampoRico({ label, texto, rico, onChange, disabled }: any) {
    const id = React.useId();
    const negrito = () => {
      const linhas = String(texto ?? "").split("\n");
      const doc = { type: "doc", content: linhas.map((l, i) => ({ type: "paragraph", content: l ? [{ type: "text", text: l, ...(i === 0 ? { marks: [{ type: "bold" }] } : {}) }] : [] })) };
      onChange?.(campoDoDoc(doc));
    };
    return React.createElement("div", { className: "sm-field" },
      React.createElement("label", { htmlFor: id }, label),
      React.createElement("textarea", { id, value: texto ?? "", disabled, onChange: (e: any) => onChange?.({ texto: e.target.value, rico: null }) }),
      React.createElement("button", { type: "button", onClick: negrito }, `Negrito: ${label}`),
      React.createElement("span", { "data-rico": label }, rico ? "com formatação" : "sem formatação"));
  }
  return { CampoRico, default: CampoRico };
});
vi.mock("../novo/app/editorPro/editarAula/EditorResumo.jsx", async () => {
  const React = await import("react");
  function EditorResumo({ summary, aoMudar, rotulo = "Resumo & racionalidade clínica" }: any) {
    const id = React.useId();
    return React.createElement("div", null, React.createElement("label", { htmlFor: id }, rotulo),
      React.createElement("textarea", { id, value: summary ?? "", onChange: (e: any) => aoMudar?.({ summary: e.target.value, summary_rico: null }) }));
  }
  return { default: EditorResumo };
});

import { MateriaisUnidade } from "../novo/app/admin/content/unidades/Materiais.jsx";
import { ThemesScreen } from "../novo/app/study/ThemesScreen.jsx";
import { AdminLessons } from "../novo/app/admin/AdminLessons.jsx";

const env = (content: any[]) => ({ f: "sdoc", v: 1, doc: { type: "doc", content } });
const par = (inline: any[]) => env([{ type: "paragraph", content: inline }]);
const txt = (t: string, marks?: any[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const negritoNoInicio = (forte: string, resto: string) => par([txt(forte, [{ type: "bold" }]), txt(resto)]);
const chamadas = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn).map((c: any[]) => c[1]);

afterEach(cleanup);

describe("Unidades › Materiais (equipe)", () => {
  const VIDEO = { id: "v1", kind: "video", title: "Vídeo de apoio", visibility: "aluno", status: "ativo", origin: "inserido", position: 1, duration_seconds: 60, files: [],
    content: { legenda: "Legenda antiga", transcricao: "Transcrição antiga" } };
  beforeEach(() => {
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_ch_unit_materials") return [VIDEO];
      if (fn === "app_ch_unit_material_insert") return { id: "novo", status: "draft" };
      if (fn === "app_ch_unit_material_textos") return { id: "v1", status: "draft", so_formatacao: true };
      throw new Error(`rpc não simulada: ${fn}`);
    });
  });

  it("inserir vídeo: legenda e transcrição com formatação vão em p_item.formatacao (texto aparado); sem formatação, como antes", async () => {
    render(<MateriaisUnidade versionId="ver" secoes={[{ titulo: "Seção 1" }]} canEdit />);
    fireEvent.click(await screen.findByRole("button", { name: /^Inserir$/ }));
    const janela = await screen.findByRole("dialog", { name: /Inserir material/ });
    fireEvent.change(within(janela).getByLabelText("Título"), { target: { value: "Vídeo novo" } });
    fireEvent.change(within(janela).getByLabelText("Link do vídeo ou áudio"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    fireEvent.change(within(janela).getByLabelText(/Duração/), { target: { value: "1:30" } });
    fireEvent.change(within(janela).getByLabelText("Legenda (opcional)"), { target: { value: "Vídeo curto" } });
    fireEvent.click(within(janela).getByRole("button", { name: "Negrito: Legenda (opcional)" }));
    fireEvent.change(within(janela).getByLabelText("Transcrição (opcional)"), { target: { value: "  Texto falado  " } });
    fireEvent.click(within(janela).getByRole("button", { name: /Inserir vídeo/ }));
    await waitFor(() => expect(chamadas("app_ch_unit_material_insert")).toHaveLength(1));
    const item = chamadas("app_ch_unit_material_insert")[0].p_item;
    expect(item).toMatchObject({ kind: "video", caption: "Vídeo curto", transcript: "Texto falado", duration_seconds: 90 });
    expect(item.formatacao).toEqual({ legenda: par([txt("Vídeo curto", [{ type: "bold" }])]) });
  });

  it("sem formatação nenhuma: p_item não leva a chave formatacao (igual a hoje)", async () => {
    render(<MateriaisUnidade versionId="ver" secoes={[]} canEdit />);
    fireEvent.click(await screen.findByRole("button", { name: /^Inserir$/ }));
    const janela = await screen.findByRole("dialog", { name: /Inserir material/ });
    fireEvent.change(within(janela).getByLabelText("Título"), { target: { value: "Vídeo novo" } });
    fireEvent.change(within(janela).getByLabelText("Link do vídeo ou áudio"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    fireEvent.change(within(janela).getByLabelText(/Duração/), { target: { value: "30" } });
    fireEvent.change(within(janela).getByLabelText("Legenda (opcional)"), { target: { value: "Só texto" } });
    fireEvent.click(within(janela).getByRole("button", { name: /Inserir vídeo/ }));
    await waitFor(() => expect(chamadas("app_ch_unit_material_insert")).toHaveLength(1));
    expect("formatacao" in chamadas("app_ch_unit_material_insert")[0].p_item).toBe(false);
  });

  it("'Legenda e transcrição' de um vídeo da lista: salva a formatação e avisa que as aprovações continuam", async () => {
    render(<MateriaisUnidade versionId="ver" secoes={[]} canEdit />);
    fireEvent.click(await screen.findByRole("button", { name: "Legenda e transcrição" }));
    const janela = await screen.findByRole("dialog", { name: /Legenda e transcrição: Vídeo de apoio/ });
    expect((within(janela).getByLabelText("Legenda") as HTMLTextAreaElement).value).toBe("Legenda antiga");
    fireEvent.click(within(janela).getByRole("button", { name: "Negrito: Transcrição" }));
    fireEvent.click(within(janela).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(chamadas("app_ch_unit_material_textos")).toHaveLength(1));
    expect(chamadas("app_ch_unit_material_textos")[0]).toEqual({ p_item_id: "v1", p_item: { caption: "Legenda antiga", transcript: "Transcrição antiga", formatacao: { transcricao: par([txt("Transcrição antiga", [{ type: "bold" }])]) } } });
    expect(await screen.findByText(/as aprovações continuam valendo/)).toBeTruthy();
  });

  it("versão no ar (sem editar): só 'Ajustar formatação', com o aviso de que o texto não muda aqui; revisor não vê", async () => {
    render(<MateriaisUnidade versionId="ver" secoes={[]} canEdit={false} podeFormatar />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajustar formatação" }));
    expect((await screen.findByRole("dialog", { name: /Legenda e transcrição/ })).textContent).toMatch(/só a formatação muda/);
    cleanup();
    render(<MateriaisUnidade versionId="ver" secoes={[]} canEdit={false} />);
    await screen.findByText("Vídeo de apoio");
    expect(screen.queryByRole("button", { name: /Ajustar formatação|Legenda e transcrição/ })).toBeNull();
  });
});

describe("Aula do aluno (TemaAula)", () => {
  const TEMAS = { method: "x", official_total: 1, annulled: 0, linked: 1, unlinked: 0, areas: [{ id: "cm", name: "Clínica Médica", themes: 1, questions: 1 }],
    themes: [{ id: "GR-001", order: 1, title: "Tuberculose pulmonar", area: "cm", area_name: "Clínica Médica", subarea: "Infecto", status: "x", total: 1, by_exam: { a: 1 } }] };
  const AULA = {
    lesson_id: "11111111-1111-4111-8111-111111111111", titulo: "Tuberculose: da tosse ao controle", tema: "Tuberculose pulmonar", area: "cm", area_nome: "Clínica Médica", subarea: "Infecto",
    cabecalho: "Material StaziaMed", atualizado_em: "2026-10-14T12:00:00Z",
    pontos_chave: ["Tosse por três semanas", "Escarro para TRM-TB"],
    secoes: [{ titulo: "Abertura", paragrafos: ["Marcos, 34 anos."] }],
    tabelas: [],
    midias: [{ tipo: "video", titulo: "Vídeo de apoio", posicao: 1, duracao_segundos: 60, embed_url: "https://www.youtube-nocookie.com/embed/x", legenda: "Vídeo curto sobre a febre", transcricao: "Febre alta exige avaliação" }],
    revisao_aula: null, flashcards: null, questoes: null,
  };
  let aula: any;
  beforeEach(() => {
    papel = "student";
    aula = AULA;
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string) => {
      if (fn === "app_grandes_temas") return TEMAS;
      if (fn === "app_temas_com_aula") return ["GR-001"];
      if (fn === "app_tema_aula") return aula;
      if (fn === "app_lesson_notes") return { note: "", notas: {}, checks: {} };
      throw new Error(`rpc não simulada: ${fn}`);
    });
    window.scrollTo = vi.fn() as any;
  });
  afterEach(() => { papel = "admin"; });
  const abrir = async () => {
    const r = render(<ThemesScreen go={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Abrir a aula/ }));
    await screen.findByRole("heading", { level: 1 });
    return r.container;
  };

  it("negrito na legenda, na transcrição e no ponto-chave quando a formatação bate com o texto", async () => {
    aula = { ...AULA,
      pontos_chave_ricos: [negritoNoInicio("Tosse", " por três semanas"), null],
      midias: [{ ...AULA.midias[0], formatacao: { legenda: negritoNoInicio("Vídeo curto", " sobre a febre"), transcricao: negritoNoInicio("Febre alta", " exige avaliação") } }] };
    const c = await abrir();
    expect(c.querySelector(".al-cap-l strong")?.textContent).toBe("Vídeo curto");
    expect(c.querySelector(".al-cap-l")?.textContent).toBe("Vídeo curto sobre a febre");
    expect(c.querySelector(".al-det strong")?.textContent).toBe("Febre alta");
    const pontos = c.querySelectorAll(".al-pontos li");
    expect(pontos[0].querySelector("strong")?.textContent).toBe("Tosse");
    expect(pontos[0].textContent).toBe("Tosse por três semanas");
    expect(pontos[1].querySelector("strong")).toBeNull();
    expect(c.innerHTML).not.toMatch(/<script|sdoc/);
  });

  it("formatação que não bate com o texto (desatualizada) é ignorada: mostra o texto como sempre", async () => {
    aula = { ...AULA, pontos_chave_ricos: [negritoNoInicio("Outro", " texto"), null],
      midias: [{ ...AULA.midias[0], formatacao: { legenda: negritoNoInicio("Outro", " texto") } }] };
    const c = await abrir();
    expect(c.querySelector(".al-cap-l strong")).toBeNull();
    expect(c.querySelector(".al-cap-l")?.textContent).toBe("Vídeo curto sobre a febre");
    expect(c.querySelector(".al-pontos strong")).toBeNull();
  });

  it("sem formatação: o mesmo HTML de hoje na legenda, na transcrição e nos pontos-chave", async () => {
    const c = await abrir();
    expect(c.querySelector(".al-cap-l")?.outerHTML).toBe('<span class="al-cap-l">Vídeo curto sobre a febre</span>');
    expect(c.querySelector(".al-det p")?.outerHTML).toBe('<p class="al-p">Febre alta exige avaliação</p>');
    expect(c.querySelector(".al-pontos li > span:last-child")?.outerHTML).toBe("<span>Tosse por três semanas</span>");
  });
});

describe("Editar aula: pontos-chave com formatação", () => {
  beforeEach(() => {
    papel = "admin";
    backend.rpc.mockReset();
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_lessons") return { lessons: [{ id: "l9", area: "PEDIATRIA", topic: "Febre", title: "Aula com pontos", key_points: ["Febre alta", "Tosse"], key_points_rico: [negritoNoInicio("Febre", " alta"), null], published: false, materials: [], updated_at: "2026-10-16T12:00:00Z" }] };
      if (fn === "app_lesson_topics") return [];
      if (fn === "app_admin_save_lesson") return { id: "l1", ...args.p_lesson, materials: [], published: false, updated_at: "2026-10-16T12:00:00Z" };
      throw new Error(`rpc não simulada: ${fn}`);
    });
  });

  it("nova aula: negrito no primeiro ponto chega como key_points_rico alinhado (ponto vazio sai)", async () => {
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: "Nova aula" }));
    fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Febre" } });
    fireEvent.change(screen.getByLabelText("Título da aula"), { target: { value: "Aula de teste" } });
    fireEvent.change(screen.getByLabelText("Pontos-chave para o Revalida (um por linha)"), { target: { value: "Ponto 1\n\nPonto 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Negrito: Pontos-chave para o Revalida (um por linha)" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar aula" }));
    await waitFor(() => expect(chamadas("app_admin_save_lesson")).toHaveLength(1));
    const p = chamadas("app_admin_save_lesson")[0].p_lesson;
    expect(p.key_points).toEqual(["Ponto 1", "Ponto 2"]);
    expect(p.key_points_rico).toEqual([par([txt("Ponto 1", [{ type: "bold" }])]), null]);
  });

  it("aula guardada: abre com a formatação dos pontos e, sem mexer, manda de volta a mesma", async () => {
    render(<AdminLessons />);
    fireEvent.click(await screen.findByText("Aula com pontos"));
    expect((screen.getByLabelText("Pontos-chave para o Revalida (um por linha)") as HTMLTextAreaElement).value).toBe("Febre alta\nTosse");
    expect(document.querySelector('[data-rico="Pontos-chave para o Revalida (um por linha)"]')?.textContent).toBe("com formatação");
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(chamadas("app_admin_save_lesson")).toHaveLength(1));
    const p = chamadas("app_admin_save_lesson")[0].p_lesson;
    expect(p.key_points).toEqual(["Febre alta", "Tosse"]);
    expect(p.key_points_rico).toEqual([negritoNoInicio("Febre", " alta"), null]);
  });

  it("sem formatação: key_points_rico vai nulo (aula como as de hoje)", async () => {
    render(<AdminLessons />);
    fireEvent.click(await screen.findByRole("button", { name: "Nova aula" }));
    fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Febre" } });
    fireEvent.change(screen.getByLabelText("Título da aula"), { target: { value: "Aula de teste" } });
    fireEvent.change(screen.getByLabelText("Pontos-chave para o Revalida (um por linha)"), { target: { value: "Ponto 1\nPonto 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar aula" }));
    await waitFor(() => expect(chamadas("app_admin_save_lesson")).toHaveLength(1));
    expect(chamadas("app_admin_save_lesson")[0].p_lesson).toMatchObject({ key_points: ["Ponto 1", "Ponto 2"], key_points_rico: null });
  });
});
