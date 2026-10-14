// @vitest-environment jsdom
/**
 * Vigilância científica — seção da Central de Conteúdo (telas, banco simulado): só a equipe vê; os cartões (novas fontes, em
 * revisão, bloqueadas, quarentena, links fora do ar) com a última e a próxima verificação; a regra do dono à vista; a fila de
 * auditoria com os filtros e a paginação; cada ação só depois de confirmar (marcar como vista, bloquear com motivo obrigatório,
 * desbloquear, resolver, pedir a análise do que mudou); a análise desligada na Central de IAs; a confiabilidade da fonte (cinco
 * dimensões, aviso dos pesos, quarentena, retratação, sobreposição com nota); a frequência por domínio; e o aviso amigável quando
 * o banco ainda não tem as funções.
 *
 * Dados (nada inventado): fixtures/vigilancia/fontes-reais.json, com a origem anotada lá dentro.
 *  - Título, órgão, versão, endereço, nível, situação e ato de cada fonte: copiados por script do catálogo conferido de 2026-10-12.
 *  - Versões candidatas: o sucessor real que o próprio catálogo registra (ex.: Portaria Conjunta SAES/SECTICS nº 29/2023).
 *  - Questões afetadas: contagem real dos vínculos validados no estudo de vínculos de 2026-10-12.
 *  - Retratação: artigo retratado de verdade (The Lancet, 2020), conferido no Crossref; o catálogo não tem artigo retratado.
 *  - Link fora do ar: o endereço que respondeu HTTP 403 na conferência feita daqui em 2026-10-12.
 *  - Cartões: o estado real do vigia em 2026-10-12 (159 fontes vigiadas, 12 links fora do ar, 0 mudanças); as contagens das
 *    tabelas novas (novas fontes, em revisão, bloqueadas, quarentena) começam em 0.
 * Só para testar a tela (quem decide é o banco do V1): o tipo e a situação de cada item, a hora da detecção, as notas da equipe,
 * os intervalos por domínio (tirados das frequências da proposta do dono) e os pontos de cada dimensão da confiabilidade.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";

const backend: any = { rpc: vi.fn() }; // sem token: a Central não chama o servidor, só o banco (simulado)
let boot: any = { role: "admin", profile: { name: "Adm" }, reviewer_areas: [] };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));

import { ContentHub } from "../novo/app/admin/content/ContentHub.jsx";
import { when } from "../novo/app/admin/content/ui.jsx";

const REGRA = "Mudanças clínicas (justificativa, conduta, gabarito) nunca são publicadas automaticamente; gabarito oficial do Inep só muda por retificação oficial.";
const DESLIGADA = "A função “Análise do que mudou” está desligada na Central de IAs. Para pedir a análise, ligue a função lá.";

const F = JSON.parse(readFileSync("src/__tests__/fixtures/vigilancia/fontes-reais.json", "utf8"));
const C: Record<string, any> = Object.fromEntries(F.fontes.map((f: any) => [f.id, f]));
const VINC: Record<string, string[]> = F.questoes_com_vinculo_validado;
const LANCET = F.retratacao_real;
const ESTADO = F.estado_real_vigia_2026_10_12;

const AVC_ANTIGO = C["pcdt-avci-agudo-texto-conitec-2022"];
const AVC_NOVO = C["pcdt-avci-isquemico-agudo-2023"];
const TV_2020 = C["ms-pcdt-transmissao-vertical-2020"];
const TV_2022 = C["ms-pcdt-transmissao-vertical-2022"];
const PNI = C["pni-manual-normas-vacinacao-2024-rev"];
const SBC_IC = C["sbc-ic-2026"];
const WSES = C["wses-apendicite-jerusalem-2025"];
const ESGE = C["hda-nao-varicosa-esge-2026"];

const U = (n: number) => `7a1c0e52-3b9d-4f6a-8c21-${String(n).padStart(12, "0")}`;
const fonteDoBanco = (c: any, id: string) => ({ id, titulo: c.titulo, orgao: c.instituicao, versao: c.versao, url: c.url, nivel: c.nivel, status: c.status });
const item = (id: string, tipo: string, fonte: any, over: Record<string, unknown> = {}) => ({
  id, tipo, fonte, detectado_em: "2026-10-12T15:00:00Z", resumo: null, versoes_candidatas: [], situacao: "pendente", questoes_afetadas: null, nota: null, ...over,
});

const ITEM_AVC = item(U(1), "nova_versao", fonteDoBanco(AVC_ANTIGO, U(101)), {
  resumo: `Há versão oficial mais nova: ${AVC_NOVO.ato}.`,
  versoes_candidatas: [{ url: AVC_NOVO.url, titulo: AVC_NOVO.titulo, data: "2023-12-12", ato: AVC_NOVO.ato }],
  questoes_afetadas: VINC["pcdt-avci-agudo-texto-conitec-2022"].length,
});
const ITEM_TV = item(U(2), "nova_versao", fonteDoBanco(TV_2020, U(102)), {
  resumo: TV_2020.situacao_atualizacao,
  versoes_candidatas: [{ url: TV_2022.url, titulo: TV_2022.titulo, data: String(TV_2022.ano), ato: TV_2022.ato }],
  situacao: "vista",
  questoes_afetadas: VINC["ms-pcdt-transmissao-vertical-2020"].length,
});
const ITEM_MUDANCA = item(U(3), "mudanca", fonteDoBanco(PNI, U(103)), { resumo: PNI.situacao_atualizacao, questoes_afetadas: VINC["pni-manual-normas-vacinacao-2024-rev"].length });
const ITEM_FORA = item(U(4), "fora_do_ar", fonteDoBanco(WSES, U(104)), {
  resumo: "O link não abriu na última verificação: o site respondeu HTTP 403 (acesso recusado).",
  questoes_afetadas: VINC["wses-apendicite-jerusalem-2025"].length,
});
const ITEM_QUARENTENA = item(U(5), "quarentena", fonteDoBanco(ESGE, U(105)), { resumo: ESGE.observacoes, questoes_afetadas: null });
const ITEM_RETRATADA = item(
  U(6),
  "retratada",
  { id: U(106), titulo: LANCET.titulo, orgao: LANCET.revista, versao: `${LANCET.revista}, publicado em ${LANCET.publicado}; DOI ${LANCET.doi}`, url: LANCET.url, nivel: 4, status: null },
  { resumo: `A revista publicou a retratação deste artigo em ${LANCET.retratacao.data}.`, situacao: "bloqueada", nota: "Artigo retratado: bloqueado pela equipe.", detectado_em: "2026-10-12T15:30:00Z" }
);
const ITEM_NOVA_FONTE = item(U(7), "fonte_nova", fonteDoBanco(SBC_IC, U(107)), { resumo: SBC_IC.situacao_atualizacao, questoes_afetadas: VINC["sbc-ic-2026"].length });
const ITENS = [ITEM_AVC, ITEM_TV, ITEM_MUDANCA, ITEM_FORA, ITEM_QUARENTENA, ITEM_RETRATADA, ITEM_NOVA_FONTE];

const INTERVALO: Record<string, number> = { "download.inep.gov.br": 1, "www.gov.br": 1, "bvsms.saude.gov.br": 1, "www.sbp.com.br": 7, "abccardiol.org": 7 };
const POR_DOMINIO = F.dominios_no_catalogo.map((d: any) => ({
  ...d,
  intervalo_dias: INTERVALO[d.dominio],
  ultima_verificacao: "2026-10-12T15:00:00Z",
  proxima_verificacao: INTERVALO[d.dominio] === 1 ? "2026-10-13T15:00:00Z" : "2026-10-19T15:00:00Z",
}));
const RESUMO = {
  novas_fontes: 0,
  em_revisao: 0,
  bloqueadas: 0,
  quarentena: 0,
  vigiadas: ESTADO.vigiadas,
  links_fora_do_ar: ESTADO.links_fora_do_ar,
  proxima_verificacao: "2026-10-13T15:00:00Z",
  ultima_execucao: "2026-10-12T15:00:00Z",
  funcao_analise_ligada: false,
  por_dominio: POR_DOMINIO,
};

const PESOS = { autenticidade: 25, situacao_normativa: 25, metodologia: 20, correspondencia_clinica: 20, rastreabilidade: 10 };
const QUAL_ESGE = {
  total: 41,
  dimensoes: { autenticidade: 8, situacao_normativa: 10, metodologia: 14, correspondencia_clinica: null, rastreabilidade: 9 },
  pesos: PESOS,
  quarentena: true,
  motivo: ESGE.observacoes,
  bloqueada: false,
  retratada: false,
  retratacao: null,
  sobreposicao: null,
};
const QUAL_LANCET = {
  total: 30,
  dimensoes: { autenticidade: 20, situacao_normativa: 0, metodologia: 0, correspondencia_clinica: null, rastreabilidade: 10 },
  pesos: PESOS,
  quarentena: false,
  motivo: null,
  bloqueada: true,
  retratada: true,
  retratacao: { data: LANCET.retratacao.data, nota: `Registro: ${LANCET.retratacao.registro}.`, doi: LANCET.retratacao.doi },
  sobreposicao: null,
};

const MISSING = (fn: string) => Object.assign(new Error(`Could not find the function public.${fn} without parameters in the schema cache`), { code: "PGRST202" });
const SITUACAO_DEPOIS: Record<string, string> = { vista: "vista", bloquear: "bloqueada", desbloquear: "pendente", resolver: "resolvida" };

let rpcs: Record<string, (args: any) => any> = {};
const calls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
beforeEach(() => {
  boot = { role: "admin", profile: { name: "Adm" }, reviewer_areas: [] };
  rpcs = {
    app_admin_vigilance_summary: () => RESUMO,
    app_admin_vigilance_queue: () => ({ total: ITENS.length, items: ITENS }),
    app_admin_vigilance_mark: (a: any) => ({ ...ITENS.find((i) => i.id === a.p_id), situacao: SITUACAO_DEPOIS[a.p_action], nota: a.p_note }),
    app_admin_vigilance_set_interval: (a: any) => ({ dominio: a.p_domain, intervalo_dias: a.p_interval_days }),
    app_admin_source_quality: (a: any) => (a.p_source_id === ITEM_RETRATADA.fonte.id ? QUAL_LANCET : QUAL_ESGE),
    app_admin_source_quality_override: (a: any) => ({ ...QUAL_ESGE, quarentena: a.p_quarentena, sobreposicao: { quarentena: a.p_quarentena, nota: a.p_note, por: "Adm", em: "2026-10-12T22:00:00Z" } }),
    app_admin_vigilance_request_analysis: () => ({ pedido: true, job_id: U(900) }),
  };
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (rpcs[fn]) return rpcs[fn](args);
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(cleanup);

const mount = (props: { isAdmin: boolean; isStaff: boolean } = { isAdmin: true, isStaff: true }, secao = "vigilancia") =>
  render(
    <MemoryRouter initialEntries={[`/?aba=conteudo&secao=${secao}`]}>
      <ContentHub {...props} />
    </MemoryRouter>
  );
const tabs = () => screen.queryAllByRole("tab").map((t) => t.textContent);
const TIPO_ROTULO: Record<string, string> = { mudanca: "Mudança no documento", nova_versao: "Nova versão", retratada: "Retratada", quarentena: "Quarentena", fora_do_ar: "Link fora do ar", fonte_nova: "Fonte nova" };
/** Botão indisponível? (sem os matchers do jest-dom, que não têm tipo neste projeto) */
const desligado = (el: HTMLElement) => (el as HTMLButtonElement).disabled;
const itemGroup = (i: any) => screen.findByRole("group", { name: `${TIPO_ROTULO[i.tipo]}: ${i.fonte.titulo}` });

describe("Vigilância científica: quem vê", () => {
  it("administrador e editor veem a seção na Central de Conteúdo", async () => {
    mount();
    expect(tabs()).toContain("Vigilância científica");
    expect(screen.getByRole("tab", { name: "Vigilância científica" }).getAttribute("aria-selected")).toBe("true");
    await screen.findByRole("group", { name: "Links fora do ar" });
    cleanup();
    boot = { role: "editor", profile: { name: "Ed" }, reviewer_areas: [] };
    mount({ isAdmin: false, isStaff: true });
    expect(tabs()).toContain("Vigilância científica");
    await screen.findByRole("group", { name: "Links fora do ar" });
  });

  it("revisor médico sem papel de equipe e aluno não veem a seção nem chamam o banco, mesmo com o endereço direto", async () => {
    boot = { role: "student", profile: { name: "Dra." }, reviewer_areas: ["GINECOLOGIA_OBSTETRICIA"] };
    mount({ isAdmin: false, isStaff: false });
    expect(tabs()).not.toContain("Vigilância científica");
    expect(tabs().length).toBeGreaterThan(0);
    cleanup();
    boot = { role: "student", profile: { name: "Aluna" }, reviewer_areas: [] };
    mount({ isAdmin: false, isStaff: false });
    expect(tabs()).toEqual([]);
    await new Promise((r) => setTimeout(r, 20));
    expect(backend.rpc.mock.calls.map((c: any[]) => c[0]).filter((f: string) => /vigilance|source_quality/.test(f))).toEqual([]);
    expect(screen.queryByText(REGRA)).toBeNull();
  });
});

describe("Vigilância científica: cartões e a regra do dono", () => {
  it("cartões com o estado real do vigia (159 fontes vigiadas, 12 links fora do ar) e a última e a próxima verificação", async () => {
    mount();
    const fora = await screen.findByRole("group", { name: "Links fora do ar" });
    expect(within(fora).getByText("12")).toBeTruthy();
    expect(within(fora).getByText(`de ${ESTADO.vigiadas} fontes vigiadas`)).toBeTruthy();
    for (const nome of ["Novas fontes", "Em revisão", "Bloqueadas", "Quarentena"]) {
      expect(within(screen.getByRole("group", { name: nome })).getByText("0")).toBeTruthy();
    }
    expect(screen.getByText("159 fontes vigiadas")).toBeTruthy();
    expect(screen.getByText(`Última verificação: ${when(RESUMO.ultima_execucao)}`)).toBeTruthy();
    expect(screen.getByText(`Próxima verificação: ${when(RESUMO.proxima_verificacao)}`)).toBeTruthy();
  });

  it("antes da primeira rodada: diz que a verificação ainda não houve e que a próxima não está agendada", async () => {
    rpcs.app_admin_vigilance_summary = () => ({ ...RESUMO, ultima_execucao: null, proxima_verificacao: null });
    mount();
    expect(await screen.findByText("Última verificação: ainda não houve")).toBeTruthy();
    expect(screen.getByText("Próxima verificação: não agendada")).toBeTruthy();
  });

  it("a regra do dono fica à vista: mudança clínica nunca é publicada sozinha e gabarito do Inep só por retificação oficial", async () => {
    mount();
    expect(await screen.findByText(REGRA)).toBeTruthy();
  });

  it("Atualizar recarrega o resumo e a fila", async () => {
    mount();
    await itemGroup(ITEM_AVC);
    const resumo = calls("app_admin_vigilance_summary").length;
    const fila = calls("app_admin_vigilance_queue").length;
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    await waitFor(() => expect(calls("app_admin_vigilance_summary").length).toBeGreaterThan(resumo));
    await waitFor(() => expect(calls("app_admin_vigilance_queue").length).toBeGreaterThan(fila));
  });
});

describe("Vigilância científica: fila de auditoria", () => {
  it("cada item mostra a fonte (título, órgão, versão, nível, link), quando foi detectado, o resumo, as versões candidatas e as questões afetadas", async () => {
    mount();
    const avc = await itemGroup(ITEM_AVC);
    expect(within(avc).getByText("Nova versão")).toBeTruthy();
    expect(within(avc).getByText("Pendente")).toBeTruthy();
    expect(within(avc).getByText(AVC_ANTIGO.titulo)).toBeTruthy();
    expect(within(avc).getByText(AVC_ANTIGO.instituicao)).toBeTruthy();
    expect(within(avc).getByText(`Versão: ${AVC_ANTIGO.versao}`)).toBeTruthy();
    expect(within(avc).getByText("nível 3 · diretriz nacional")).toBeTruthy();
    expect(within(avc).getByText("Substituída ou revogada")).toBeTruthy();
    expect(within(avc).getByText(`detectado em ${when(ITEM_AVC.detectado_em)}`)).toBeTruthy();
    expect(within(avc).getByText(ITEM_AVC.resumo as string)).toBeTruthy();
    const abrir = within(avc).getByRole("link", { name: "Abrir fonte" });
    expect(abrir.getAttribute("href")).toBe(AVC_ANTIGO.url);
    expect(abrir.getAttribute("target")).toBe("_blank");
    expect(abrir.getAttribute("rel")).toContain("noopener");
    const versoes = within(avc).getByRole("list", { name: "Versões candidatas" });
    expect(within(versoes).getByRole("link", { name: AVC_NOVO.titulo }).getAttribute("href")).toBe(AVC_NOVO.url);
    expect(within(versoes).getByText(`data: 12/12/2023 · ato: ${AVC_NOVO.ato}`)).toBeTruthy();
    expect(within(avc).getByText("1 questão afetada")).toBeTruthy();

    const tv = await itemGroup(ITEM_TV);
    expect(within(tv).getByText("Vista")).toBeTruthy();
    expect(within(tv).getByText("Nenhuma questão afetada")).toBeTruthy();
    expect(within(tv).getByText(`data: 2022 · ato: ${TV_2022.ato}`)).toBeTruthy();
    expect(within(tv).getByRole("link", { name: TV_2022.titulo }).getAttribute("href")).toBe(TV_2022.url);

    const q = await itemGroup(ITEM_QUARENTENA);
    expect(within(q).getByText("Questões afetadas: ainda não calculado")).toBeTruthy();
    expect(within(q).getByText("nível 4 · científica complementar")).toBeTruthy();
    expect(within(q).getByText("Versão a confirmar")).toBeTruthy();

    const ret = await itemGroup(ITEM_RETRATADA);
    expect(within(ret).getByText("Bloqueada")).toBeTruthy();
    expect(within(ret).getByText("Artigo retratado: bloqueado pela equipe.")).toBeTruthy();
    expect(within(ret).getByRole("link", { name: "Abrir fonte" }).getAttribute("href")).toBe(LANCET.url);

    for (const i of [ITEM_MUDANCA, ITEM_FORA, ITEM_NOVA_FONTE]) expect(await itemGroup(i)).toBeTruthy();
    expect(screen.getByText(`${ITENS.length} itens nesta fila`)).toBeTruthy();
  });

  it("endereço que não é http(s) não vira link", async () => {
    rpcs.app_admin_vigilance_queue = () => ({ total: 1, items: [{ ...ITEM_AVC, fonte: { ...ITEM_AVC.fonte, url: "javascript:alert(1)" } }] });
    mount();
    const avc = await itemGroup(ITEM_AVC);
    expect(within(avc).queryByRole("link", { name: "Abrir fonte" })).toBeNull();
  });

  it("filtros: Pendentes (de início), Mudanças, Novas versões, Retratadas, Quarentena, Fora do ar e Todas; cada troca volta à primeira página", async () => {
    mount();
    await itemGroup(ITEM_AVC);
    const filtros = screen.getByRole("group", { name: "Filtrar a fila" });
    expect(calls("app_admin_vigilance_queue")[0][1]).toEqual({ p_filter: "pendentes", p_limit: 20, p_offset: 0 });
    expect(within(filtros).getByRole("button", { name: "Pendentes" }).getAttribute("aria-pressed")).toBe("true");
    const pares = [
      ["Mudanças", "mudancas"],
      ["Novas versões", "novas_versoes"],
      ["Retratadas", "retratadas"],
      ["Quarentena", "quarentena"],
      ["Fora do ar", "fora_do_ar"],
      ["Todas", "todas"],
      ["Pendentes", "pendentes"],
    ];
    for (const [rotulo, valor] of pares) {
      fireEvent.click(within(filtros).getByRole("button", { name: rotulo }));
      expect(within(filtros).getByRole("button", { name: rotulo }).getAttribute("aria-pressed")).toBe("true");
      await waitFor(() => expect(calls("app_admin_vigilance_queue").at(-1)[1]).toEqual({ p_filter: valor, p_limit: 20, p_offset: 0 }));
    }
  });

  it("paginação como nas outras listas: 20 por página", async () => {
    rpcs.app_admin_vigilance_queue = (a: any) => ({ total: 45, items: a.p_offset === 0 ? [ITEM_AVC] : [ITEM_TV] });
    mount();
    await itemGroup(ITEM_AVC);
    expect(screen.getByText("1/3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await itemGroup(ITEM_TV);
    expect(calls("app_admin_vigilance_queue").at(-1)[1]).toEqual({ p_filter: "pendentes", p_limit: 20, p_offset: 20 });
    expect(screen.getByText("2/3")).toBeTruthy();
  });

  it("fila vazia: diz que não há nada nesta fila", async () => {
    rpcs.app_admin_vigilance_queue = () => ({ total: 0, items: [] });
    mount();
    expect(await screen.findByText("Nada nesta fila")).toBeTruthy();
  });
});

describe("Vigilância científica: ações, sempre com confirmação", () => {
  it("marcar como vista: cancelar não manda nada; confirmar manda, avisa e recarrega a fila e o resumo", async () => {
    mount();
    const avc = await itemGroup(ITEM_AVC);
    fireEvent.click(within(avc).getByRole("button", { name: "Marcar como vista" }));
    const caixa = within(avc).getByRole("group", { name: "Marcar este item como visto?" });
    expect(calls("app_admin_vigilance_mark")).toHaveLength(0);
    fireEvent.click(within(caixa).getByRole("button", { name: "Cancelar" }));
    expect(within(avc).queryByRole("group", { name: "Marcar este item como visto?" })).toBeNull();
    expect(calls("app_admin_vigilance_mark")).toHaveLength(0);
    const fila = calls("app_admin_vigilance_queue").length;
    const resumo = calls("app_admin_vigilance_summary").length;
    fireEvent.click(within(avc).getByRole("button", { name: "Marcar como vista" }));
    fireEvent.click(within(avc).getByRole("button", { name: "Sim, marcar como vista" }));
    expect(await screen.findByText("Item marcado como visto.")).toBeTruthy();
    expect(calls("app_admin_vigilance_mark")).toEqual([["app_admin_vigilance_mark", { p_id: ITEM_AVC.id, p_action: "vista", p_note: null }]]);
    await waitFor(() => expect(calls("app_admin_vigilance_queue").length).toBeGreaterThan(fila));
    await waitFor(() => expect(calls("app_admin_vigilance_summary").length).toBeGreaterThan(resumo));
  });

  it("bloquear: o motivo é obrigatório (pelo menos 10 caracteres) e vai junto ao banco", async () => {
    mount();
    const fora = await itemGroup(ITEM_FORA);
    fireEvent.click(within(fora).getByRole("button", { name: "Bloquear" }));
    const caixa = within(fora).getByRole("group", { name: "Bloquear esta fonte?" });
    const sim = within(caixa).getByRole("button", { name: "Sim, bloquear" });
    expect(desligado(sim)).toBe(true);
    const motivo = within(caixa).getByLabelText("Motivo do bloqueio (obrigatório, pelo menos 10 caracteres)");
    fireEvent.change(motivo, { target: { value: "curto" } });
    expect(desligado(sim)).toBe(true);
    fireEvent.click(sim);
    expect(calls("app_admin_vigilance_mark")).toHaveLength(0);
    const nota = "O site recusa o acesso (HTTP 403) desde a última verificação.";
    fireEvent.change(motivo, { target: { value: nota } });
    expect(desligado(sim)).toBe(false);
    fireEvent.click(sim);
    expect(await screen.findByText("Fonte bloqueada. O motivo ficou registrado.")).toBeTruthy();
    expect(calls("app_admin_vigilance_mark")).toEqual([["app_admin_vigilance_mark", { p_id: ITEM_FORA.id, p_action: "bloquear", p_note: nota }]]);
  });

  it("desbloquear (item bloqueado): no lugar de 'Bloquear'; confirma, lembra que artigo retratado não volta e manda sem nota", async () => {
    mount();
    const ret = await itemGroup(ITEM_RETRATADA);
    expect(within(ret).queryByRole("button", { name: "Bloquear" })).toBeNull();
    expect(within(ret).queryByRole("button", { name: "Marcar como vista" })).toBeNull();
    fireEvent.click(within(ret).getByRole("button", { name: "Desbloquear" }));
    const caixa = within(ret).getByRole("group", { name: "Desbloquear esta fonte?" });
    expect(within(caixa).getByText(/artigo retratado não deve voltar a ser usado como evidência/)).toBeTruthy();
    expect(calls("app_admin_vigilance_mark")).toHaveLength(0);
    fireEvent.click(within(caixa).getByRole("button", { name: "Sim, desbloquear" }));
    expect(await screen.findByText("Fonte desbloqueada.")).toBeTruthy();
    expect(calls("app_admin_vigilance_mark")[0][1]).toEqual({ p_id: ITEM_RETRATADA.id, p_action: "desbloquear", p_note: null });
  });

  it("resolver: confirma com nota opcional", async () => {
    mount();
    const tv = await itemGroup(ITEM_TV);
    expect(within(tv).queryByRole("button", { name: "Marcar como vista" })).toBeNull();
    fireEvent.click(within(tv).getByRole("button", { name: "Resolver" }));
    const caixa = within(tv).getByRole("group", { name: "Marcar como resolvido?" });
    fireEvent.change(within(caixa).getByLabelText("Nota (opcional)"), { target: { value: "Cadastro trocado pela edição de 2022." } });
    fireEvent.click(within(caixa).getByRole("button", { name: "Sim, resolver" }));
    expect(await screen.findByText("Item resolvido.")).toBeTruthy();
    expect(calls("app_admin_vigilance_mark")[0][1]).toEqual({ p_id: ITEM_TV.id, p_action: "resolver", p_note: "Cadastro trocado pela edição de 2022." });
  });

  it("item resolvido não oferece ações de novo (só abrir a fonte e ver a confiabilidade)", async () => {
    rpcs.app_admin_vigilance_queue = () => ({ total: 1, items: [{ ...ITEM_AVC, situacao: "resolvida", nota: "Fonte trocada pela portaria de 2023." }] });
    mount();
    const avc = await itemGroup(ITEM_AVC);
    expect(within(avc).getByText("Resolvida")).toBeTruthy();
    for (const nome of ["Marcar como vista", "Bloquear", "Desbloquear", "Resolver", "Pedir análise do que mudou"]) {
      expect(within(avc).queryByRole("button", { name: nome })).toBeNull();
    }
    expect(within(avc).getByRole("link", { name: "Abrir fonte" })).toBeTruthy();
    expect(within(avc).getByRole("button", { name: "Ver confiabilidade" })).toBeTruthy();
  });

  it("recusa do banco em português aparece no próprio item e não há aviso de sucesso", async () => {
    rpcs.app_admin_vigilance_mark = () => {
      throw Object.assign(new Error("Só a equipe pode mexer na fila da vigilância."), { code: "42501" });
    };
    mount();
    const avc = await itemGroup(ITEM_AVC);
    fireEvent.click(within(avc).getByRole("button", { name: "Resolver" }));
    fireEvent.click(within(avc).getByRole("button", { name: "Sim, resolver" }));
    expect(await within(avc).findByText("Só a equipe pode mexer na fila da vigilância.")).toBeTruthy();
    expect(screen.queryByText("Item resolvido.")).toBeNull();
    expect(within(avc).getByRole("group", { name: "Marcar como resolvido?" })).toBeTruthy();
  });

  it("pedir análise do que mudou (função ligada): confirma e manda o item", async () => {
    rpcs.app_admin_vigilance_summary = () => ({ ...RESUMO, funcao_analise_ligada: true });
    mount();
    const avc = await itemGroup(ITEM_AVC);
    await waitFor(() => expect(desligado(within(avc).getByRole("button", { name: "Pedir análise do que mudou" }))).toBe(false));
    expect(within(avc).queryByText(DESLIGADA)).toBeNull();
    fireEvent.click(within(avc).getByRole("button", { name: "Pedir análise do que mudou" }));
    const caixa = within(avc).getByRole("group", { name: "Pedir a análise do que mudou?" });
    expect(within(caixa).getByText(/Nada é publicado nem muda nas questões sem a equipe/)).toBeTruthy();
    expect(calls("app_admin_vigilance_request_analysis")).toHaveLength(0);
    fireEvent.click(within(caixa).getByRole("button", { name: "Sim, pedir a análise" }));
    expect(await within(avc).findByText("Pedido de análise enviado. A análise roda no servidor; nada é publicado sem a equipe.")).toBeTruthy();
    expect(calls("app_admin_vigilance_request_analysis")).toEqual([["app_admin_vigilance_request_analysis", { p_item_id: ITEM_AVC.id }]]);
  });

  it("análise desligada na Central de IAs: botão indisponível com a explicação e nada vai ao banco; só aparece em mudança e nova versão", async () => {
    mount();
    const avc = await itemGroup(ITEM_AVC);
    const botao = within(avc).getByRole("button", { name: "Pedir análise do que mudou" });
    expect(desligado(botao)).toBe(true);
    expect(within(avc).getByText(DESLIGADA)).toBeTruthy();
    fireEvent.click(botao);
    expect(within(avc).queryByRole("group", { name: "Pedir a análise do que mudou?" })).toBeNull();
    expect(calls("app_admin_vigilance_request_analysis")).toHaveLength(0);
    expect(desligado(within(await itemGroup(ITEM_MUDANCA)).getByRole("button", { name: "Pedir análise do que mudou" }))).toBe(true);
    for (const i of [ITEM_FORA, ITEM_QUARENTENA, ITEM_RETRATADA, ITEM_NOVA_FONTE]) {
      expect(within(await itemGroup(i)).queryByRole("button", { name: "Pedir análise do que mudou" })).toBeNull();
    }
  });

  it("função desligada depois de abrir a tela: a recusa do banco (P0001) aparece no item", async () => {
    rpcs.app_admin_vigilance_summary = () => ({ ...RESUMO, funcao_analise_ligada: true });
    rpcs.app_admin_vigilance_request_analysis = () => {
      throw Object.assign(new Error("A função 'Análise do que mudou' está desligada na Central de IAs."), { code: "P0001" });
    };
    mount();
    const avc = await itemGroup(ITEM_AVC);
    await waitFor(() => expect(desligado(within(avc).getByRole("button", { name: "Pedir análise do que mudou" }))).toBe(false));
    fireEvent.click(within(avc).getByRole("button", { name: "Pedir análise do que mudou" }));
    fireEvent.click(within(avc).getByRole("button", { name: "Sim, pedir a análise" }));
    expect(await within(avc).findByText("A função 'Análise do que mudou' está desligada na Central de IAs.")).toBeTruthy();
    expect(within(avc).queryByText(/Pedido de análise enviado/)).toBeNull();
  });
});

describe("Vigilância científica: confiabilidade da fonte", () => {
  it("as cinco dimensões com barra, a nota total, o aviso de que os pesos não são escala validada e a quarentena com motivo", async () => {
    mount();
    const q = await itemGroup(ITEM_QUARENTENA);
    fireEvent.click(within(q).getByRole("button", { name: "Ver confiabilidade" }));
    const painel = await within(q).findByRole("region", { name: "Confiabilidade da fonte" });
    expect(calls("app_admin_source_quality")).toEqual([["app_admin_source_quality", { p_source_id: ITEM_QUARENTENA.fonte.id }]]);
    expect(within(painel).getByText("41")).toBeTruthy();
    const barras: [string, number, number][] = [
      ["Autenticidade", 8, 25],
      ["Situação normativa", 10, 25],
      ["Qualidade metodológica", 14, 20],
      ["Rastreabilidade", 9, 10],
    ];
    for (const [nome, valor, peso] of barras) {
      const barra = within(painel).getByRole("progressbar", { name: nome });
      expect(barra.getAttribute("aria-valuenow")).toBe(String(valor));
      expect(barra.getAttribute("aria-valuemax")).toBe(String(peso));
      expect(within(painel).getByText(`${valor} de ${peso}`)).toBeTruthy();
    }
    expect(within(painel).queryByRole("progressbar", { name: "Correspondência clínica" })).toBeNull();
    expect(within(painel).getByText("Correspondência clínica")).toBeTruthy();
    expect(within(painel).getByText("ainda não avaliada")).toBeTruthy();
    expect(
      within(painel).getByText(
        /Os pesos são uma proposta inicial, não uma escala validada: autenticidade 25, situação normativa 25, qualidade metodológica 20, correspondência clínica 20 e rastreabilidade 10\./
      )
    ).toBeTruthy();
    expect(within(painel).getByText("Em quarentena")).toBeTruthy();
    expect(within(painel).getByText(ESGE.observacoes)).toBeTruthy();
    expect(within(q).getByRole("button", { name: "Fechar confiabilidade" })).toBeTruthy();
  });

  it("fonte retratada: retratação com data e DOI (artigo real, conferido no Crossref) e o selo de bloqueada", async () => {
    mount();
    const ret = await itemGroup(ITEM_RETRATADA);
    fireEvent.click(within(ret).getByRole("button", { name: "Ver confiabilidade" }));
    const painel = await within(ret).findByRole("region", { name: "Confiabilidade da fonte" });
    const caixa = within(painel).getByRole("group", { name: "Retratação" });
    expect(within(caixa).getByText(/Retratação publicada em 05\/06\/2020\./)).toBeTruthy();
    expect(within(caixa).getByRole("link", { name: LANCET.retratacao.doi }).getAttribute("href")).toBe(`https://doi.org/${LANCET.retratacao.doi}`);
    expect(within(painel).getByText("Bloqueada")).toBeTruthy();
    expect(within(painel).getByText("Retratada")).toBeTruthy();
    expect(within(painel).getByText("Fora da quarentena")).toBeTruthy();
  });

  it("sobrepor a quarentena: confirmação com motivo obrigatório; a decisão volta do banco e aparece no painel", async () => {
    mount();
    const q = await itemGroup(ITEM_QUARENTENA);
    fireEvent.click(within(q).getByRole("button", { name: "Ver confiabilidade" }));
    const painel = await within(q).findByRole("region", { name: "Confiabilidade da fonte" });
    fireEvent.click(within(painel).getByRole("button", { name: "Tirar da quarentena" }));
    const caixa = within(painel).getByRole("group", { name: "Tirar esta fonte da quarentena?" });
    const sim = within(caixa).getByRole("button", { name: "Sim, tirar da quarentena" });
    expect(desligado(sim)).toBe(true);
    fireEvent.click(within(caixa).getByRole("button", { name: "Cancelar" }));
    expect(within(painel).queryByRole("group", { name: "Tirar esta fonte da quarentena?" })).toBeNull();
    fireEvent.click(within(painel).getByRole("button", { name: "Tirar da quarentena" }));
    const nota = "A equipe confere a fonte primária antes de usar.";
    fireEvent.change(within(painel).getByLabelText("Motivo (obrigatório, pelo menos 10 caracteres)"), { target: { value: nota } });
    expect(calls("app_admin_source_quality_override")).toHaveLength(0);
    const resumo = calls("app_admin_vigilance_summary").length;
    fireEvent.click(within(painel).getByRole("button", { name: "Sim, tirar da quarentena" }));
    expect(await within(painel).findByText("Decisão registrada: a fonte saiu da quarentena.")).toBeTruthy();
    expect(calls("app_admin_source_quality_override")).toEqual([
      ["app_admin_source_quality_override", { p_source_id: ITEM_QUARENTENA.fonte.id, p_quarentena: false, p_note: nota }],
    ]);
    expect(within(painel).getByText("Fora da quarentena")).toBeTruthy();
    expect(within(painel).getByText(/tirou da quarentena · por Adm/)).toBeTruthy();
    expect(within(painel).getByText(`Motivo: ${nota}`)).toBeTruthy();
    expect(within(painel).getByRole("button", { name: "Colocar em quarentena" })).toBeTruthy();
    await waitFor(() => expect(calls("app_admin_vigilance_summary").length).toBeGreaterThan(resumo));
  });
});

describe("Vigilância científica: frequência por domínio", () => {
  it("tabela com cada domínio, quantas fontes, a frequência e as verificações", async () => {
    mount();
    const tabela = await screen.findByRole("table", { name: "Frequência por domínio" });
    for (const d of POR_DOMINIO) {
      const linha = within(tabela).getByRole("row", { name: d.dominio });
      expect(within(linha).getByText(String(d.fontes))).toBeTruthy();
      expect(within(linha).getByText(d.intervalo_dias === 1 ? "todo dia" : `a cada ${d.intervalo_dias} dias`)).toBeTruthy();
      expect(within(linha).getByText(when(d.ultima_verificacao))).toBeTruthy();
      expect(within(linha).getByText(when(d.proxima_verificacao))).toBeTruthy();
    }
  });

  it("mudar a frequência: aceita só 1 a 90, pede confirmação, grava e recarrega o resumo", async () => {
    mount();
    const tabela = await screen.findByRole("table", { name: "Frequência por domínio" });
    const gov = POR_DOMINIO.find((d: any) => d.dominio === "www.gov.br");
    fireEvent.click(within(tabela).getByRole("button", { name: "Mudar a frequência de www.gov.br" }));
    const painel = screen.getByRole("group", { name: "Frequência de www.gov.br" });
    const campo = within(painel).getByLabelText("A cada quantos dias? (1 a 90)") as HTMLInputElement;
    expect(campo.value).toBe("1");
    const salvar = within(painel).getByRole("button", { name: "Salvar" });
    expect(desligado(salvar)).toBe(true);
    for (const ruim of ["0", "91", "2.5"]) {
      fireEvent.change(campo, { target: { value: ruim } });
      expect(within(painel).getByText("Use um número inteiro de 1 a 90.")).toBeTruthy();
      expect(desligado(salvar)).toBe(true);
    }
    fireEvent.change(campo, { target: { value: "3" } });
    expect(within(painel).queryByText("Use um número inteiro de 1 a 90.")).toBeNull();
    fireEvent.click(salvar);
    const caixa = within(painel).getByRole("group", { name: "Mudar a frequência de www.gov.br?" });
    expect(within(caixa).getByText(`As ${gov.fontes} fontes deste domínio passam a ser verificadas a cada 3 dias (hoje: todo dia).`)).toBeTruthy();
    fireEvent.click(within(caixa).getByRole("button", { name: "Cancelar" }));
    expect(calls("app_admin_vigilance_set_interval")).toHaveLength(0);
    const resumo = calls("app_admin_vigilance_summary").length;
    fireEvent.click(salvar);
    fireEvent.click(within(within(painel).getByRole("group", { name: "Mudar a frequência de www.gov.br?" })).getByRole("button", { name: "Sim, mudar a frequência" }));
    expect(await screen.findByText("Frequência salva: o domínio www.gov.br passa a ser verificado a cada 3 dias.")).toBeTruthy();
    expect(calls("app_admin_vigilance_set_interval")).toEqual([["app_admin_vigilance_set_interval", { p_domain: "www.gov.br", p_interval_days: 3 }]]);
    await waitFor(() => expect(calls("app_admin_vigilance_summary").length).toBeGreaterThan(resumo));
  });

  it("sem domínio vigiado: avisa em vez de tabela vazia", async () => {
    rpcs.app_admin_vigilance_summary = () => ({ ...RESUMO, por_dominio: [] });
    mount();
    expect(await screen.findByText("Nenhum domínio vigiado ainda.")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Frequência por domínio" })).toBeNull();
  });
});

describe("Vigilância científica: banco ainda sem a atualização", () => {
  it("sem a função do resumo: aviso amigável, sem texto técnico, e a Central continua com as outras seções", async () => {
    rpcs.app_admin_vigilance_summary = () => {
      throw MISSING("app_admin_vigilance_summary");
    };
    mount();
    expect(await screen.findByText(/Falta aplicar a atualização do banco desta função/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/schema cache|PGRST|app_admin/);
    expect(screen.getByText(REGRA)).toBeTruthy();
    expect(tabs()).toEqual(expect.arrayContaining(["Fontes oficiais", "Conflitos", "Vigilância científica", "Taxonomia"]));
  });

  it("sem a função da fila: os cartões continuam e a fila mostra o aviso", async () => {
    rpcs.app_admin_vigilance_queue = () => {
      throw MISSING("app_admin_vigilance_queue");
    };
    mount();
    expect(await screen.findByText(/Falta aplicar a atualização do banco desta função/)).toBeTruthy();
    expect(await screen.findByRole("group", { name: "Links fora do ar" })).toBeTruthy();
    expect(screen.getByText("Fila de auditoria ainda indisponível")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/schema cache|PGRST|app_admin/);
  });

  it("sem a função da confiabilidade: aviso no painel da fonte", async () => {
    rpcs.app_admin_source_quality = () => {
      throw MISSING("app_admin_source_quality");
    };
    mount();
    const q = await itemGroup(ITEM_QUARENTENA);
    fireEvent.click(within(q).getByRole("button", { name: "Ver confiabilidade" }));
    expect(await within(q).findByText(/Falta aplicar a atualização do banco desta função/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/schema cache|PGRST|app_admin/);
  });

  it("sem as funções de marcar e de frequência: o aviso amigável aparece onde a pessoa clicou", async () => {
    rpcs.app_admin_vigilance_mark = () => {
      throw MISSING("app_admin_vigilance_mark");
    };
    rpcs.app_admin_vigilance_set_interval = () => {
      throw MISSING("app_admin_vigilance_set_interval");
    };
    mount();
    const avc = await itemGroup(ITEM_AVC);
    fireEvent.click(within(avc).getByRole("button", { name: "Marcar como vista" }));
    fireEvent.click(within(avc).getByRole("button", { name: "Sim, marcar como vista" }));
    expect(await within(avc).findByText(/Falta aplicar a atualização do banco desta função/)).toBeTruthy();
    const tabela = await screen.findByRole("table", { name: "Frequência por domínio" });
    fireEvent.click(within(tabela).getByRole("button", { name: "Mudar a frequência de www.sbp.com.br" }));
    const painel = screen.getByRole("group", { name: "Frequência de www.sbp.com.br" });
    fireEvent.change(within(painel).getByLabelText("A cada quantos dias? (1 a 90)"), { target: { value: "14" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Salvar" }));
    fireEvent.click(within(painel).getByRole("button", { name: "Sim, mudar a frequência" }));
    expect(await within(painel).findByText(/Falta aplicar a atualização do banco desta função/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/schema cache|PGRST|app_admin/);
  });
});
