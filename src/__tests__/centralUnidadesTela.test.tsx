/**
 * Tela Central › Unidades (jsdom, banco simulado com as formas que as funções da migração 9980 devolvem): lista com código e dados do banco,
 * caminho até publicar com estados reais, botão Publicar desligado, materiais (inserir, retirar, pré-visualizar), resumo antes da aprovação
 * médica (administrador ou revisor; editor não) e ficha do revisor. Textos de teste; nada é publicado.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn(), accessToken: async () => "t" };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin", profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { Units } from "../novo/app/admin/content/Units.jsx";
import { passosDoCaminho } from "../novo/app/admin/content/unidades/Topo.jsx";

const VISAO = (over: any = {}) => ({
  unit: { id: "u1", code: "GR-001", title: "Tuberculose pulmonar", caminho: { area: "Clínica Médica", area_code: "CLINICA_MEDICA", subarea: "Infectologia", tema: "Tuberculose" } },
  version: { id: "v1", version: 1, status: "awaiting_review", date: "2026-10-13T12:00:00Z", hash: "abcdef0123456789" },
  palavras: 2071, questoes_ligadas: 17,
  afirmacoes: { total: 86, validadas: 86, sem_validacao: 0, criticas: 10, criticas_sem_conferencia: 0, ultima_conferencia: "2026-10-13" },
  auditoria: { estado: "feita", data: "2026-10-13" },
  aprovacao_medica: { valida: false }, aprovacao_editorial: { valida: false },
  portao: { modo: "desligado", status: "sem_dossie", motivos: ["O tema não tem dossiê de evidência (fontes vigentes conferidas)."] },
  publicacao: { no_ar: false, problemas: [] },
  ficha: { existe: true, decisoes: [], total: 2 },
  pode: { editar: true, aprovar_medica: true, aprovar_editorial: true, conferir_criticas: true, publicar: false },
  ...over,
});
const MATERIAIS = [
  { id: "i1", kind: "texto_aula", title: "Texto da aula (7 seções)", visibility: "aluno", status: "ativo", origin: "importado", position: 0, files: [] },
  { id: "i2", kind: "flashcards_ilustrados", title: "Flashcards ilustrados (9 cartões)", visibility: "aluno", status: "ativo", origin: "importado", position: 99, files: [] },
  { id: "i3", kind: "pdf_interativo", title: "PDF interativo da aula (só equipe)", visibility: "equipe", status: "ativo", origin: "importado", position: 0, files: [{ idx: 0, tipo: "application/pdf", rotulo: "aula.pdf" }] },
  { id: "i4", kind: "story", title: "Story (só equipe)", visibility: "equipe", status: "ativo", origin: "importado", position: 0, files: [{ idx: 0, tipo: "image/png", rotulo: "story.png", texto_alternativo: "Story" }] },
  { id: "i5", kind: "video", title: "Vídeo antigo", visibility: "aluno", status: "retirado", origin: "inserido", position: 2, duration_seconds: 90, retired_at: "2026-10-13T13:00:00Z", retired_by: "ed@t.dev", retire_reason: "Trocado.", files: [] },
];
const FICHA = { existe: true, origem: "para-o-revisor-medico.md", importada_em: "2026-10-13T12:00:00Z", decisoes: [],
  ficha: { intro: ["A aprovação médica é do revisor, não nossa."], decisoes: [{ n: 1, titulo: "Cultura: cenário ou \"todos\"?", pergunta: "O GVS diz as duas coisas.", como_esta: "A aula ensina o cenário.", onde: "aula, F01" }, { n: 2, titulo: "Data do 3HP.", pergunta: "", como_esta: "Sem ano.", onde: "seção 7" }],
    pontos: [{ n: 1, texto: "**Tosse (TB02).** Agora a fonte é o GVS.", onde: "GVS p. 125" }], fixacao: ["**Q1:** a letra C tem comentário."], fixacao_instrucao: "Confira cada alternativa.", fora: ["TARV."], apresentacao: ["O aluno não vê referência."] } };
const VERSAO = { version: { id: "v1", version: 1, status: "awaiting_review", content: { sections: [{ heading: "Caso", paragraphs: [] }] }, content_hash: "h", generated_by_model: null, review_flags: [] }, title: "Tuberculose pulmonar", area_code: "CLINICA_MEDICA", problems: [], claims: [], materials: [], approvals: [], publications: [] };

let visao: any; let materiais: any[];
const chamadas: { fn: string; args: any }[] = [];
beforeEach(() => {
  chamadas.length = 0;
  visao = VISAO(); materiais = structuredClone(MATERIAIS);
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    chamadas.push({ fn, args });
    if (fn === "app_ch_unit_version") return VERSAO;
    if (fn === "app_ch_units") return [{ unit_id: "u1", title: "Tuberculose pulmonar", area_code: "CLINICA_MEDICA", versions: [{ id: "v1", version: 1, status: "awaiting_review" }] }];
    if (fn === "app_ch_unit_overview_list") return [{ unit_id: "u1", code: "GR-001", date: "2026-10-13T12:00:00Z", afirmacoes: 86, palavras: 2071, questoes_ligadas: 17, caminho: { subarea: "Infectologia" } }];
    if (fn === "app_ch_unit_overview") return visao;
    if (fn === "app_ch_unit_materials") return materiais;
    if (fn === "app_ch_review_sheet") return FICHA;
    if (fn === "app_ch_unit_history") return [{ em: "2026-10-13T13:00:00Z", quem: "ed@t.dev", acao: "unit.material.retire", versao: 1, detalhes: { title: "Vídeo antigo", reason: "Trocado." } }];
    if (fn === "app_ch_approval_summary") return { titulo: "Tuberculose pulmonar", versao: 1, hash: "abcdef0123456789", palavras: 2071, afirmacoes: visao.afirmacoes, ficha: { existe: true, decisoes_total: 2, decisoes: [{ n: 1, decision: "de_acordo" }, { n: 2, decision: "de_acordo" }] }, mudancas: { primeira_versao: true }, materiais_aluno: [{ title: "Texto da aula (7 seções)" }] };
    if (fn === "app_ch_unit_student_preview") return { titulo: "Tuberculose pulmonar", tema: "Tuberculose", area: "Clínica Médica", cabecalho: "Material StaziaMed · aguardando revisão médica da área", pontos_chave: ["Ponto."], secoes: [{ titulo: "Caso clínico", paragrafos: ["Texto da seção."] }], tabelas: [], midias: [{ tipo: "video", titulo: "Vídeo de apoio", posicao: 1, duracao_segundos: 125, embed_url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" }], flashcards: { titulo: "x", cartoes: [{ frente: "F", verso: "V" }] }, questoes: { titulo: "q", itens: [] } };
    return true;
  });
});
afterEach(() => cleanup());
const ctx = (extra: any = {}) => ({ params: new URLSearchParams({ versao: "v1" }), go: vi.fn(), isAdmin: true, isStaff: true, reviewerAreas: [], ...extra });
const chamou = (fn: string) => chamadas.filter((c) => c.fn === fn);

describe("Lista de unidades", () => {
  it("mostra código, área › subárea, versão com data, afirmações, palavras e questões ligadas (do banco)", async () => {
    render(<Units {...ctx({ params: new URLSearchParams() })} />);
    expect(await screen.findByText("GR-001")).toBeTruthy();
    await waitFor(() => expect(document.body.textContent).toMatch(/86 afirmações · 2\.071 palavras · 17 questões ligadas/));
    expect(document.body.textContent).toMatch(/Clínica Médica › Infectologia/);
    expect(document.body.textContent).toMatch(/versão 1 · 13\/10\/2026/);
  });
});

describe("Página da unidade: cabeçalho e caminho até publicar", () => {
  it("cabeçalho com código, título, área, versão, questões, palavras e situação; passos reais; Publicar desligado", async () => {
    render(<Units {...ctx()} />);
    expect(await screen.findByLabelText("Cabeçalho da unidade")).toBeTruthy();
    const cab = screen.getByLabelText("Cabeçalho da unidade");
    for (const t of [/GR-001/, /Clínica Médica › Infectologia/, /Versão 1/, /17 questões ligadas/, /2\.071 palavras/, /Aguardando revisão/]) expect(cab.textContent).toMatch(t);
    const caminho = screen.getByLabelText("Caminho até publicar");
    expect(caminho.textContent).toMatch(/Auditoria científica/);
    expect(caminho.textContent).toMatch(/86 afirmações validadas/);
    expect(caminho.textContent).toMatch(/Aprovação médica pendente/);
    expect(caminho.textContent).toMatch(/Do administrador ou do revisor médico/);
    expect(caminho.textContent).toMatch(/Portão de atualidade da vigilância/);
    expect((screen.getByRole("button", { name: /Publicar ao aluno/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(caminho.querySelectorAll("[data-estado=feito]").length).toBe(3); // auditoria... + portão desligado (não segura)
    expect(within(caminho).getByText("agora")).toBeTruthy();
  });

  it("passos: aprovações válidas e portão em ordem liberam o botão; portão fora de ordem o segura com os motivos", () => {
    const pronto = VISAO({ version: { id: "v1", version: 1, status: "approved", date: "x" }, aprovacao_medica: { valida: true, por: "adm@t.dev", em: "2026-10-13T12:00:00Z", hash: "abcdef0123" }, aprovacao_editorial: { valida: true, por: "ed@t.dev", em: "2026-10-13T12:00:00Z" }, portao: { modo: "bloqueia", status: "ok", motivos: [], verificado_em: "2026-10-13" }, pode: { publicar: true } });
    const p = passosDoCaminho(pronto);
    expect(p.map((x) => x.estado)).toEqual(["feito", "feito", "feito", "feito", "feito", "pendente"]);
    expect(p[2].texto).toMatch(/Por adm@t\.dev/);
    const preso = passosDoCaminho(VISAO({ portao: { modo: "desligado", status: "vencido", motivos: ["Última conferência do dossiê em 01/01/2026."] } }));
    // modo desligado: o portão não segura a publicação (não vira o "agora" do caminho)
    expect(preso[4].texto).toMatch(/desligado/);
    expect(preso[4].agora).toBe(false);
    const avisando = passosDoCaminho(VISAO({ portao: { modo: "aviso", status: "vencido", motivos: ["Última conferência do dossiê em 01/01/2026."] } }));
    expect(avisando[4].estado).toBe("aviso");
    expect(avisando[4].texto).toMatch(/Só avisar.*não impede/);
    expect(avisando[4].texto).toMatch(/Última conferência/);
    const travado = passosDoCaminho(VISAO({ portao: { modo: "bloqueia", status: "vencido", motivos: ["Última conferência do dossiê em 01/01/2026."] } }));
    expect(travado[4].estado).toBe("aviso");
    expect(travado[4].texto).toMatch(/Bloquear/);
  });

  it("com tudo pronto o administrador pode abrir a publicação", async () => {
    visao = VISAO({ version: { id: "v1", version: 1, status: "approved", date: "2026-10-13T12:00:00Z" }, pode: { editar: false, aprovar_medica: false, publicar: true }, portao: { modo: "bloqueia", status: "ok", motivos: [] } });
    render(<Units {...ctx()} />);
    const botao = (await screen.findByRole("button", { name: /Publicar ao aluno/ })) as HTMLButtonElement;
    expect(botao.disabled).toBe(false);
  });
});

describe("Materiais da unidade", () => {
  it("lista com tipo, quem vê e estado; PDF e Story só equipe; retirado aparece com motivo", async () => {
    render(<Units {...ctx()} />);
    const sec = await screen.findByLabelText("Materiais da unidade");
    await within(sec).findByText("Texto da aula (7 seções)");
    const linha = (k: string) => sec.querySelector(`[data-kind=${k}]`) as HTMLElement;
    expect(linha("texto_aula").textContent).toMatch(/Aluno vê/);
    expect(linha("pdf_interativo").textContent).toMatch(/Só equipe/);
    expect(linha("pdf_interativo").textContent).not.toMatch(/Aluno vê/);
    expect(linha("story").textContent).toMatch(/Só equipe/);
    expect(linha("video").textContent).toMatch(/Retirado em .* por ed@t\.dev: Trocado\./);
    expect(linha("video").textContent).toMatch(/Continua no histórico/);
    expect(within(linha("texto_aula")).queryByRole("button", { name: /Retirar/ })).toBeNull(); // o texto da aula não se retira
    expect(within(linha("video")).getByRole("button", { name: /Inserir de novo/ })).toBeTruthy();
  });

  it("retirar pede o motivo e chama a função (nada é apagado)", async () => {
    render(<Units {...ctx()} />);
    const sec = await screen.findByLabelText("Materiais da unidade");
    await within(sec).findByText("Story (só equipe)");
    fireEvent.click(within(sec.querySelector("[data-kind=story]") as HTMLElement).getByRole("button", { name: /Retirar/ }));
    const janela = await screen.findByRole("dialog", { name: /Retirar: Story/ });
    const botao = within(janela).getByRole("button", { name: "Retirar" }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.change(within(janela).getByLabelText("Motivo da retirada"), { target: { value: "Fora da campanha." } });
    fireEvent.click(botao);
    await waitFor(() => expect(chamou("app_ch_unit_material_retire")).toHaveLength(1));
    expect(chamou("app_ch_unit_material_retire")[0].args).toEqual({ p_item_id: "i4", p_reason: "Fora da campanha." });
  });

  it("inserir vídeo por link: manda duração em segundos, posição e quem vê; o envio de arquivo aparece como etapa futura", async () => {
    render(<Units {...ctx()} />);
    const sec = await screen.findByLabelText("Materiais da unidade");
    await within(sec).findByText("Story (só equipe)");
    fireEvent.click(within(sec).getByRole("button", { name: /^Inserir$/ }));
    const janela = await screen.findByRole("dialog", { name: /Inserir material/ });
    expect(janela.textContent).toMatch(/Arquivo enviado \(etapa futura\)/);
    expect(janela.textContent).toMatch(/streaming/);
    fireEvent.change(within(janela).getByLabelText("Título"), { target: { value: "Vídeo de apoio" } });
    fireEvent.change(within(janela).getByLabelText("Link do vídeo ou áudio"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    fireEvent.change(within(janela).getByLabelText(/Duração/), { target: { value: "2:05" } });
    fireEvent.change(within(janela).getByLabelText("Posição na aula"), { target: { value: "1" } });
    fireEvent.click(within(janela).getByRole("button", { name: /Inserir vídeo/ }));
    await waitFor(() => expect(chamou("app_ch_unit_material_insert")).toHaveLength(1));
    expect(chamou("app_ch_unit_material_insert")[0].args.p_item).toMatchObject({ kind: "video", title: "Vídeo de apoio", url: "https://youtu.be/dQw4w9WgXcQ", duration_seconds: 125, position: 1, visibility: "aluno" });
  });

  it("revisor sem papel de equipe vê a lista mas não tem Inserir nem Retirar", async () => {
    visao = VISAO({ pode: { editar: false, aprovar_medica: true, publicar: false } });
    render(<Units {...ctx({ isAdmin: false, isStaff: false, reviewerAreas: ["CLINICA_MEDICA"] })} />);
    const sec = await screen.findByLabelText("Materiais da unidade");
    await within(sec).findByText("Story (só equipe)");
    expect(within(sec).queryByRole("button", { name: /^Inserir$/ })).toBeNull();
    expect(within(sec).queryByRole("button", { name: /^Retirar$/ })).toBeNull();
  });

  it("pré-visualizar como aluno: abre a página da aula com o player; sem PDF nem peças da equipe", async () => {
    render(<Units {...ctx()} />);
    const sec = await screen.findByLabelText("Materiais da unidade");
    await within(sec).findByText("Story (só equipe)");
    fireEvent.click(within(sec).getAllByRole("button", { name: /Pré-visualizar como aluno/ })[0]);
    const janela = await screen.findByRole("dialog", { name: /Pré-visualizar como aluno/ });
    await within(janela).findByText("Caso clínico");
    expect(janela.textContent).toMatch(/Prévia: ainda não publicado/);
    const iframe = janela.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(iframe.getAttribute("sandbox")).toMatch(/allow-scripts/);
    expect((janela.querySelector("article") as HTMLElement).textContent).not.toMatch(/PDF|Story|Card de feed|A6/);
    expect(janela.querySelector("a[href]")).toBeNull(); // nenhum link de arquivo
  });
});

describe("Aprovação médica: resumo antes do botão, administrador ou revisor", () => {
  it("o botão abre o resumo (versão, afirmações, decisões, o que mudou) e só o 'Confirmar' grava", async () => {
    render(<Units {...ctx()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Aprovar \(revisão médica\)/ }));
    const resumo = await screen.findByLabelText("Resumo do que você vai aprovar");
    expect(resumo.textContent).toMatch(/versão 1/);
    expect(resumo.textContent).toMatch(/86 de 86 validadas/);
    expect(resumo.textContent).toMatch(/2 de 2 decisões marcadas "de acordo"/);
    expect(resumo.textContent).toMatch(/Primeira versão: tudo é novo/);
    expect(resumo.textContent).toMatch(/Esta aprovação não publica nada/);
    expect(chamou("app_ch_approve")).toHaveLength(0);
    fireEvent.click(within(resumo).getByRole("button", { name: /Confirmar aprovação médica/ }));
    await waitFor(() => expect(chamou("app_ch_approve")).toHaveLength(1));
    expect(chamou("app_ch_approve")[0].args).toMatchObject({ p_version_id: "v1", p_kind: "medical" });
  });

  it("editor (nem administrador nem revisor) não consegue aprovar: botão desligado e explicação", async () => {
    render(<Units {...ctx({ isAdmin: false, isStaff: true, reviewerAreas: [] })} />);
    const botao = (await screen.findByRole("button", { name: /Aprovar \(revisão médica\)/ })) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(document.body.textContent).toMatch(/A aprovação médica é do administrador ou de um revisor médico/);
  });

  it("revisor da área aprova", async () => {
    render(<Units {...ctx({ isAdmin: false, isStaff: false, reviewerAreas: ["CLINICA_MEDICA"] })} />);
    const botao = (await screen.findByRole("button", { name: /Aprovar \(revisão médica\)/ })) as HTMLButtonElement;
    expect(botao.disabled).toBe(false);
  });
});

describe("Ficha do revisor e histórico", () => {
  it("mostra as decisões com o texto do arquivo, os pontos, o que ficou fora, e grava 'De acordo' com a observação", async () => {
    render(<Units {...ctx()} />);
    const ficha = await screen.findByLabelText("Ficha do revisor médico");
    await within(ficha).findByText(/Cultura: cenário ou/);
    expect(ficha.textContent).toMatch(/0 de 2 decisões "de acordo"/);
    expect(ficha.textContent).toMatch(/A aula ensina o cenário\./);
    expect(ficha.textContent).toMatch(/Pontos para conferir no documento original \(1\)/);
    expect(ficha.querySelector("strong")).toBeTruthy(); // **negrito** do arquivo virou marcação
    const d1 = ficha.querySelector("[data-decisao='1']") as HTMLElement;
    fireEvent.change(within(d1).getByLabelText("Observação (opcional)"), { target: { value: "Cenário, como está." } });
    fireEvent.click(within(d1).getByRole("button", { name: "De acordo" }));
    await waitFor(() => expect(chamou("app_ch_review_decide")).toHaveLength(1));
    expect(chamou("app_ch_review_decide")[0].args).toEqual({ p_version_id: "v1", p_n: 1, p_decision: "de_acordo", p_note: "Cenário, como está." });
  });

  it("histórico da unidade lista a alteração com quem e o motivo", async () => {
    render(<Units {...ctx()} />);
    const h = await screen.findByLabelText("Histórico da unidade");
    await within(h).findByText("Material retirado");
    expect(h.textContent).toMatch(/ed@t\.dev/);
    expect(h.textContent).toMatch(/motivo: Trocado\./);
  });
});
