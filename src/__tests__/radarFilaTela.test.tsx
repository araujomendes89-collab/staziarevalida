// @vitest-environment jsdom
// Fila do Radar (Administração): filtros, tela vazia, decisão com nota obrigatória, aba só do administrador e aviso só ao administrador.
import React from "react";
import { readFileSync } from "node:fs";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const rpc = vi.fn();
const backend = { rpc }; // estável, como na sessão real (useLoad recarrega quando o backend muda)
let papel = "admin";
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: papel, profile: { name: "Adm" } }, user: { id: "a" } }) }));
vi.mock("../novo/app/Shell.jsx", () => ({ useMobile: () => false, useMQ: () => false }));
vi.mock("../novo/app/admin/AdminQuestions.jsx", () => ({ AdminQuestions: () => null }));
vi.mock("../novo/app/admin/AdminUsers.jsx", () => ({ AdminUsers: () => null }));
vi.mock("../novo/app/admin/AdminPlay.jsx", () => ({ AdminPlay: () => null }));
vi.mock("../novo/app/admin/AdminLessons.jsx", () => ({ AdminLessons: () => null }));
vi.mock("../novo/app/admin/AdminUpdates.jsx", () => ({ AdminUpdates: () => null }));
vi.mock("../novo/app/admin/AdminPodcasts.jsx", () => ({ AdminPodcasts: () => null }));
vi.mock("../novo/app/admin/AdminPanels.jsx", () => ({ AdminAudit: () => null, AdminOverview: () => null, AdminPlans: () => null, AdminSettings: () => null, AdminStations: () => null, AdminTutor: () => null }));
vi.mock("../novo/app/admin/AdminSupport.jsx", () => ({ AdminReports: () => null, AdminSupportContact: () => null }));
vi.mock("../novo/app/admin/content/ContentHub.jsx", () => ({ ContentHub: () => null }));
vi.mock("../novo/app/admin/ai/AdminAI.jsx", () => ({ AdminAI: () => null }));
vi.mock("../novo/app/admin/OfficialVoicesPanel.jsx", () => ({ OfficialVoicesPanel: () => null }));

import { RadarFila } from "../novo/app/admin/radar/RadarFila.jsx";
import { RadarAvisoFaixa } from "../novo/app/admin/radar/RadarAvisoFaixa.jsx";
import { useRadarAvisos } from "../novo/app/admin/radar/useRadarAvisos.js";
import { AdminScreen } from "../novo/app/admin/AdminScreen.jsx";
import { contar, filtrar, notaValida, prazoInfo, agruparAfetados } from "../novo/app/admin/radar/radarFila.js";

const agora = Date.now();
const hora = (h: number) => new Date(agora + h * 3_600_000).toISOString();
const base = (o: Record<string, unknown>) => ({
  evento: "e0", fonte: { doc_id: "d", nome: "Fonte X", orgao: "Conitec", url: "https://exemplo.gov.br/x", referencia: "vigente", norma_sus: true, vigencia_normativa: null },
  origem: "adaptador_mudou", gravidade: "leve", motivo: "Só numeração", detectado_em: hora(-5), prazo_revisao_ate: hora(43), status: "pendente", decisao_dono: null,
  aguarda_dono: false, resumo: {}, itens: [], itens_total: 0, analise: null, afetados: [], afetados_total: 0, afetados_pendentes: 0, nota: null, decidido_em: null, parecer: null, parecer_em: null, ...o,
});
const GRAVE = base({
  evento: "g1", gravidade: "grave", aguarda_dono: true, motivo: "Fonte revogada", prazo_revisao_ate: hora(-3),
  fonte: { doc_id: "d1", nome: "Portaria da Hipertensão", orgao: "Ministério da Saúde", url: "https://exemplo.gov.br/h", referencia: "revogada", norma_sus: true },
  itens: [{ kind: "NUMERIC", critical: true, pagina_antiga: 3, pagina_nova: 4, antes: "5 mg", depois: "10 mg" }], itens_total: 3,
  analise: { o_que_mudou: "A dose mudou.", recomendacao_alterada: "Dose", impacto_clinico_provavel: "Alto", certeza: "alta" },
  afetados: [{ tipo: "questao", ref: "q1", nivel: "trecho", paginas: [3], citacao: "c", status: "pendente" }, { tipo: "aula", ref: "GR-001", nivel: "tema", paginas: [], citacao: null, status: "pendente" }], afetados_total: 2, afetados_pendentes: 2,
});
const LEVE = base({ evento: "l1", fonte: { doc_id: "d2", nome: "Calendário", referencia: "evidencia_complementar", norma_sus: false } });
const FEITA = base({ evento: "f1", status: "descartada", decisao_dono: "sem_impacto", nota: "Já conferida", decidido_em: hora(-1), fonte: { doc_id: "d3", nome: "Fonte decidida", referencia: "vigente" } });

const montar = () => render(<MemoryRouter><RadarFila /></MemoryRouter>);
beforeEach(() => { rpc.mockReset(); papel = "admin"; });
afterEach(cleanup);

describe("regras da Fila do Radar", () => {
  it("filtros e contagem", () => {
    const todos = [GRAVE, LEVE, FEITA];
    expect(contar(todos)).toEqual({ aguardam: 1, graves: 1, leves: 2, pendentes: 2, decididos: 1, todas: 3 });
    expect(filtrar(todos, "decididos").map((e: any) => e.evento)).toEqual(["f1"]);
  });
  it("prazo de 48 h: vencido, perto e encerrado", () => {
    expect(prazoInfo(GRAVE as any)?.vencido).toBe(true);
    expect(prazoInfo(LEVE as any)?.texto).toMatch(/Faltam/);
    expect(prazoInfo(FEITA as any)).toBeNull();
  });
  it("nota precisa de pelo menos 5 letras e itens agrupam por tipo", () => {
    expect(notaValida("  ab ")).toBe(false);
    expect(notaValida("motivo")).toBe(true);
    expect(agruparAfetados(GRAVE.afetados as any).map((g) => g.tipo)).toEqual(["questao", "aula"]);
  });
});

describe("tela Fila do Radar", () => {
  it("mostra a mudança grave que espera o dono, com fonte, antes/depois, quem usa e links internos", async () => {
    rpc.mockResolvedValue([GRAVE, LEVE, FEITA]);
    montar();
    expect(await screen.findByRole("heading", { name: "Portaria da Hipertensão" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Calendário" })).toBeNull(); // filtro padrão: só o que espera o dono
    expect(screen.getByText("Prazo venceu há 3 h")).toBeTruthy();
    expect(screen.getByText("5 mg")).toBeTruthy();
    expect(screen.getByText("10 mg")).toBeTruthy();
    expect(screen.getByText("A dose mudou.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /q1/ }).getAttribute("href")).toBe("/admin?aba=questoes");
    expect(screen.getByRole("link", { name: /GR-001/ }).getAttribute("href")).toBe("/admin?aba=aulas");
    expect(rpc).toHaveBeenCalledWith("app_admin_radar_fila_detalhada", { p_filtro: "todos" });
  });

  it("filtros trocam a lista", async () => {
    rpc.mockResolvedValue([GRAVE, LEVE, FEITA]);
    montar();
    await screen.findByRole("heading", { name: "Portaria da Hipertensão" });
    fireEvent.click(screen.getByRole("button", { name: /Decididos/ }));
    expect(screen.getByRole("heading", { name: "Fonte decidida" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Portaria da Hipertensão" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Leves/ }));
    expect(screen.getByRole("heading", { name: "Calendário" })).toBeTruthy();
  });

  it("tela vazia: Nenhuma mudança grave pendente", async () => {
    rpc.mockResolvedValue([LEVE]);
    montar();
    expect(await screen.findByText("Nenhuma mudança grave pendente")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ver as 1 pendentes/ })).toBeTruthy();
  });

  it("decidir exige ação e nota; manda para app_admin_radar_acao e depois recarrega", async () => {
    rpc.mockImplementation(async (nome: string) => (nome === "app_admin_radar_fila_detalhada" ? [GRAVE] : null));
    montar();
    await screen.findByRole("heading", { name: "Portaria da Hipertensão" });
    const registrar = screen.getByRole("button", { name: "Registrar decisão" }) as HTMLButtonElement;
    expect(registrar.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Refazer/ }));
    expect(registrar.disabled).toBe(true); // falta a nota
    fireEvent.change(screen.getByLabelText(/Nota \(obrigatória\)/), { target: { value: "ab" } });
    expect(registrar.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Nota \(obrigatória\)/), { target: { value: "Refazer a questão 1" } });
    expect(registrar.disabled).toBe(false);
    fireEvent.click(registrar);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("app_admin_radar_acao", { p_evento: "g1", p_acao: "refazer", p_nota: "Refazer a questão 1" }));
    expect(await screen.findByText("Decisão registrada.")).toBeTruthy();
    expect(rpc.mock.calls.filter((c) => c[0] === "app_admin_radar_fila_detalhada").length).toBeGreaterThanOrEqual(2);
  });

  it("registra o parecer dos revisores", async () => {
    rpc.mockImplementation(async (nome: string) => (nome === "app_admin_radar_fila_detalhada" ? [GRAVE] : null));
    montar();
    await screen.findByRole("heading", { name: "Portaria da Hipertensão" });
    fireEvent.change(screen.getByLabelText(/Colar ou escrever o parecer/), { target: { value: "Os 2 revisores concordam." } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar parecer" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("app_admin_radar_parecer", { p_evento: "g1", p_texto: "Os 2 revisores concordam." }));
  });

  it("erro do banco vira frase em português com botão de tentar de novo", async () => {
    rpc.mockRejectedValue(new Error("function app_admin_radar_fila_detalhada does not exist"));
    montar();
    expect(await screen.findByRole("button", { name: "Tentar de novo" })).toBeTruthy();
  });
});

describe("aba e aviso só para o administrador", () => {
  const Sonda = ({ ativo }: { ativo: boolean }) => <span data-testid="n">{useRadarAvisos(ativo).graves}</span>;

  it("administrador vê a aba com o número de graves; editor não vê a aba", async () => {
    rpc.mockResolvedValue({ graves_pendentes: 2, vencidas: 1, itens: [] });
    const { unmount } = render(<MemoryRouter initialEntries={["/admin"]}><AdminScreen /></MemoryRouter>);
    const aba = screen.getByRole("tab", { name: /Fila do Radar/ });
    await waitFor(() => expect(within(aba).getByText("2")).toBeTruthy());
    unmount();
    papel = "editor";
    render(<MemoryRouter initialEntries={["/admin?aba=radar"]}><AdminScreen /></MemoryRouter>);
    expect(screen.queryByRole("tab", { name: /Fila do Radar/ })).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1); // o editor não pergunta nada ao banco sobre o Radar
  });

  it("aluno: nenhuma chamada ao banco e nenhuma faixa", () => {
    papel = "student";
    render(<Sonda ativo={papel === "admin"} />);
    expect(rpc).not.toHaveBeenCalled();
    const { container } = render(<RadarAvisoFaixa avisos={{ graves: 0, vencidas: 0, itens: [] }} go={() => {}} />);
    expect(container.textContent).toBe("");
  });

  it("faixa do Início lista as graves e abre a aba do Radar", () => {
    const go = vi.fn();
    render(<RadarAvisoFaixa avisos={{ graves: 4, vencidas: 0, itens: [1, 2, 3].map((n) => ({ evento: `e${n}`, fonte: `Fonte ${n}`, motivo: "Revogada", prazo_revisao_ate: hora(10) })) }} go={go} />);
    expect(screen.getByText("4 mudanças graves em fontes oficiais esperam a sua decisão")).toBeTruthy();
    expect(screen.getByText("E mais 1 na fila.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Abrir a Fila do Radar/ }));
    expect(go).toHaveBeenCalledWith("admin", { aba: "radar" });
  });
});

describe("migração e conexões", () => {
  const sql = readFileSync("supabase/migrations/20261003010200_radar_fila_e_avisos.sql", "utf8");
  it("a fila de e-mails só é lida pelo administrador e ninguém escreve direto", () => {
    expect(sql).toMatch(/alter table public\.radar_avisos enable row level security/);
    expect(sql).toMatch(/create policy "radar avisos: administrador lê" on public\.radar_avisos for select to authenticated using \(public\.is_admin\(\)\)/);
    expect(sql).toMatch(/revoke insert, update, delete, truncate on table public\.radar_avisos from authenticated/);
    expect(sql).toMatch(/revoke all on table public\.radar_avisos from anon/);
  });
  it("todas as funções novas negam o anônimo e a migração não toca em conteúdo", () => {
    for (const f of ["app_admin_radar_avisos()", "app_admin_radar_fila_detalhada(text)", "app_admin_radar_parecer(uuid, text)", "app_admin_radar_acao(uuid, text, text)"]) {
      expect(sql).toContain(`revoke all on function public.${f} from public, anon;`);
    }
    expect(sql).not.toMatch(/\b(update|insert into|delete from)\s+public\.(questions|lessons|guideline_updates|question_official_answers)\b/);
  });
  it("o menu e o Início do administrador usam o contador", () => {
    expect(readFileSync("src/novo/app/Shell.jsx", "utf8")).toContain("info.radarGraves");
    expect(readFileSync("src/novo/app/home/HomeScreen.jsx", "utf8")).toContain('boot.role === "admin" && <RadarAvisoFaixa');
    expect(readFileSync("src/novo/app/App.jsx", "utf8")).toContain('useRadarAvisos(boot.role === "admin")');
  });
});
