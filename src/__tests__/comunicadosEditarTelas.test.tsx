// @vitest-environment jsdom
/**
 * Comunicados com editar, apagar e editor profissional (migração 013940) nas telas:
 *   - sino do aluno: comunicado formatado (negrito, lista, título, link) pelo leitor seguro, com selo discreto "editado"; comunicado
 *     antigo só texto igual a antes; HTML no texto nunca vira HTML; formatação maliciosa (script, javascript:) some;
 *   - Administração: Editar e Apagar em cada comunicado; edição com o editor (manda texto + rico e a versão aberta), aviso de que não
 *     vai e-mail, público fixo depois que alguém leu; apagar com confirmação na própria página (sem window.confirm), motivo opcional,
 *     "Desfazer" por alguns segundos e "Restaurar" no filtro Apagados; histórico;
 *   - decisões do dono 18/10: editar volta a "não lido" (aviso na tela; "lido antes da edição: N" na lista); "Enviar também por
 *     e-mail" no envio (a prévia diz quantos recebem por e-mail) e na edição (só se ainda não foi; se já foi, "o e-mail já enviado
 *     não muda");
 *   - e-mail do comunicado (fila de serviço): HTML e texto simples do conteúdo formatado, rodapé e cabeçalho de descadastro;
 *     página de descadastro (abrir não descadastra; confirmar sim).
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, refresh: async () => {}, boot: { role: "admin" }, user: { id: "u1" } }) }));
// O editor de verdade é testado nos testes editorPro.*; aqui um textarea que devolve { texto, rico } como o CampoRico (o rico vem do teste).
vi.mock("../novo/app/editorPro/CampoRico.jsx", () => {
  const React = require("react");
  function CampoRico({ label, texto, onChange, id }: any) {
    return (
      <div className="sm-field">
        <label htmlFor={id}>{label}</label>
        <textarea id={id} value={texto ?? ""} onChange={(e: any) => onChange?.({ texto: e.target.value, rico: (globalThis as any).__ricoDoEditor?.(e.target.value) ?? null })} />
      </div>
    );
  }
  return { CampoRico, default: CampoRico };
});

import { NotificacoesFixas } from "../novo/app/notificacoes/NotificacoesProvider.jsx";
import { NotificacaoItem, PainelNotificacoes } from "../novo/app/notificacoes/Sino.jsx";
import { precisaLeitorRico } from "../novo/app/notificacoes/modelo.js";
import { AdminComunicados, DESFAZER_MS } from "../novo/app/admin/AdminComunicados.jsx";
import { campoDoDoc } from "../shared/docRico/campos";
import { renderItem, type ItemFila } from "../../server/legal/emails";
import { createLegalRouter } from "../../server/legal/router";
import { resumoLeitura } from "../novo/app/admin/AdminComunicados.jsx";
import express from "express";
import type { AddressInfo } from "node:net";

const DOC = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Simulado nacional" }] },
    { type: "paragraph", content: [{ type: "text", text: "Sábado, " }, { type: "text", text: "às 9h", marks: [{ type: "bold" }] }, { type: "text", text: "." }] },
    { type: "bulletList", content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Teoria" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Prática", marks: [{ type: "italic" }] }] }] },
    ] },
    { type: "paragraph", content: [{ type: "text", text: "Inscrição", marks: [{ type: "link", attrs: { href: "https://www.gov.br/inep" } }] }] },
  ],
};
const CAMPO = campoDoDoc(DOC);
const agora = Date.now();
const iso = (h: number) => new Date(agora - h * 3600e3).toISOString();

beforeEach(() => {
  backend.rpc.mockReset();
  (globalThis as any).__ricoDoEditor = undefined;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as any;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("sino do aluno: comunicado formatado e 'editado'", () => {
  it("só comunicado com formatação ou marca usa o leitor formatado", () => {
    expect(precisaLeitorRico({ tipo: "comunicado", texto: "Simples.", rico: null })).toBe(false);
    expect(precisaLeitorRico({ tipo: "comunicado", texto: CAMPO.texto, rico: CAMPO.rico })).toBe(true);
    expect(precisaLeitorRico({ tipo: "comunicado", texto: "Veja [aqui](https://www.gov.br).", rico: null })).toBe(true);
    expect(precisaLeitorRico({ tipo: "renovacao", texto: "Pague *hoje*.", rico: null })).toBe(false);
  });

  it("mostra negrito, itálico, lista, título e link (https, nova aba) e o selo discreto 'editado'", async () => {
    const n = { id: 9, tipo: "comunicado", titulo: "Simulado no sábado", texto: CAMPO.texto, rico: CAMPO.rico, rota: "nenhuma", link: null, acao: null, em: iso(2), lida: false, editado: true, editado_em: iso(1) };
    const { container } = render(<NotificacaoItem n={n} />);
    const forte = await screen.findByText("às 9h");
    expect(forte.closest("strong")).toBeTruthy();
    expect(screen.getByText("Prática").closest("em")).toBeTruthy();
    expect(container.querySelectorAll(".ntf-rico li")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Simulado nacional" })).toBeTruthy();
    const a = screen.getByRole("link", { name: "Inscrição" }) as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("https://www.gov.br/inep");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(screen.getByTestId("selo-editado").textContent).toBe("editado");
    expect(screen.getByTestId("selo-editado").getAttribute("title")).toMatch(/^Editado pela equipe em \d{2}\/\d{2}\/\d{4}/);
  });

  it("comunicado antigo só texto fica igual a antes (parágrafo simples, sem selo)", () => {
    const { container } = render(<NotificacaoItem n={{ id: 1, tipo: "comunicado", titulo: "Antigo", texto: "Às 9h, no app.", rota: "nenhuma", link: null, acao: null, em: iso(30), lida: true }} />);
    expect(container.querySelector(".ntf-corpo > p")?.textContent).toBe("Às 9h, no app.");
    expect(container.querySelector(".ntf-rico")).toBeNull();
    expect(screen.queryByTestId("selo-editado")).toBeNull();
  });

  it("nada de HTML cru: tag no texto aparece como texto; script e javascript: na formatação somem", async () => {
    const texto = "<img src=x onerror=alert(1)> Oi";
    const { container, unmount } = render(<NotificacaoItem n={{ id: 2, tipo: "comunicado", titulo: "T", texto, rico: null, rota: "nenhuma", em: iso(1), lida: false }} />);
    await waitFor(() => expect(container.textContent).toContain("onerror"));
    expect(container.querySelector("img")).toBeNull();
    unmount();
    const ruim = {
      f: "sdoc",
      v: 1,
      doc: { type: "doc", content: [
        { type: "script", content: [{ type: "text", text: "alert(1)" }] },
        { type: "paragraph", content: [{ type: "text", text: "clique", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }, { type: "bold" }] }] },
      ] },
    };
    const r2 = render(<NotificacaoItem n={{ id: 3, tipo: "comunicado", titulo: "T2", texto: "alert(1)\nclique", rico: ruim, rota: "nenhuma", em: iso(1), lida: false }} />);
    await waitFor(() => expect(r2.container.textContent).toContain("clique"));
    expect(r2.container.querySelector("script")).toBeNull();
    expect(r2.container.querySelector("a[href^='javascript']")).toBeNull();
  });

  it("no painel do sino: o comunicado editado aparece formatado", async () => {
    const itens = [{ id: 9, tipo: "comunicado", titulo: "Simulado no sábado", texto: CAMPO.texto, rico: CAMPO.rico, rota: "nenhuma", link: null, acao: null, em: iso(2), lida: false, editado: true }];
    const ancora = { current: document.createElement("button") };
    render(
      <MemoryRouter>
        <NotificacoesFixas valor={{ itens, naoLidas: 1, urgentes: 0, carregado: true, carregando: false, erro: null, recarregar() {}, marcarLidas() {} }}>
          <PainelNotificacoes ancora={ancora} onFechar={() => {}} />
        </NotificacoesFixas>
      </MemoryRouter>
    );
    const painel = await screen.findByTestId("painel-notificacoes");
    expect((await within(painel).findByText("às 9h")).closest("strong")).toBeTruthy();
    expect(within(painel).getByTestId("selo-editado")).toBeTruthy();
  });
});

// ------------------------------------------------------------------------------------------------ Administração
const C1 = { id: 1, titulo: "Aula ao vivo", texto: "Hoje às 20h.", rico: null, link: null, publico: "todos", filtro: null, destinatarios: 40, enviado_em: iso(3), enviado_por: "Admin Teste", lidas: 0, versao: 1, editado_em: null, editado_por: null, apagado_em: null, apagado_por: null, apagado_motivo: null, por_email: false };
const C2 = { ...C1, id: 2, titulo: "Simulado nacional", texto: "Sábado.", lidas: 7, destinatarios: 12, publico: "plano", filtro: "pro" };

function montarAdmin(responder: (fn: string, args: any) => any) {
  backend.rpc.mockImplementation(async (fn: string, args: any) => responder(fn, args));
  return render(
    <MemoryRouter>
      <AdminComunicados />
    </MemoryRouter>
  );
}

describe("Administração > Comunicados: editar", () => {
  it("cada comunicado tem Editar e Apagar; o editor abre com o texto, avisa que não vai e-mail e salva texto + rico + versão", async () => {
    const confirmar = vi.spyOn(window, "confirm");
    (globalThis as any).__ricoDoEditor = (t: string) => (t === CAMPO.texto ? CAMPO.rico : null);
    let lista = [C1, C2];
    montarAdmin((fn, a) => {
      if (fn === "app_admin_comunicados") return a.p_situacao === "apagados" ? [] : lista;
      if (fn === "app_admin_comunicado_editar") {
        const r = { ...C1, titulo: a.p_titulo, texto: a.p_texto, rico: a.p_rico, versao: 2, editado_em: new Date().toISOString(), editado_por: "Admin Teste", mudou: true };
        lista = [r, C2];
        return r;
      }
      return null;
    });
    const item = await screen.findByTestId("comunicado-1");
    expect(within(item).getByRole("button", { name: "Editar “Aula ao vivo”" })).toBeTruthy();
    expect(within(item).getByRole("button", { name: "Apagar “Aula ao vivo”" })).toBeTruthy();
    fireEvent.click(within(item).getByRole("button", { name: "Editar “Aula ao vivo”" }));
    const ed = within(item).getByTestId("editar-comunicado");
    expect(ed.textContent).toMatch(/volta a aparecer como não lido para todos/);
    // ainda não foi por e-mail: dá para mandar agora
    expect(within(ed).getByRole("checkbox", { name: "Enviar também por e-mail" })).toBeTruthy();
    expect(ed.textContent).not.toMatch(/O e-mail já enviado não muda/);
    expect((within(ed).getByLabelText("Título") as HTMLInputElement).value).toBe("Aula ao vivo");
    expect((within(ed).getByLabelText("Texto") as HTMLTextAreaElement).value).toBe("Hoje às 20h.");
    // sem mudança: não salva
    expect((within(ed).getByRole("button", { name: /Salvar alteração/ }) as HTMLButtonElement).disabled).toBe(true);
    // ninguém leu: dá para mudar o público
    expect(within(ed).getByRole("radiogroup", { name: "Para quem" })).toBeTruthy();
    fireEvent.change(within(ed).getByLabelText("Título"), { target: { value: "Aula ao vivo (novo horário)" } });
    fireEvent.change(within(ed).getByLabelText("Texto"), { target: { value: CAMPO.texto } });
    // prévia do sino com o selo "editado" e a formatação
    expect(await within(ed).findByTestId("selo-editado")).toBeTruthy();
    fireEvent.click(within(ed).getByRole("button", { name: /Salvar alteração/ }));
    expect(await screen.findByText(/foi atualizado/)).toBeTruthy();
    const args = backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_admin_comunicado_editar")[1];
    expect(args).toMatchObject({ p_id: 1, p_titulo: "Aula ao vivo (novo horário)", p_texto: CAMPO.texto, p_rico: CAMPO.rico, p_versao: 1, p_publico: null, p_filtro: null });
    expect(backend.rpc).not.toHaveBeenCalledWith("app_admin_comunicado_email", expect.anything());
    expect(screen.getByText(/Editado por Admin Teste em/)).toBeTruthy();
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("depois que alguém leu, o público fica fixo e a tela explica", async () => {
    montarAdmin((fn) => (fn === "app_admin_comunicados" ? [C2] : null));
    const item = await screen.findByTestId("comunicado-2");
    fireEvent.click(within(item).getByRole("button", { name: /Editar/ }));
    const fixo = within(item).getByTestId("publico-fixo");
    expect(fixo.textContent).toContain("Alunos do PRO (12 alunos)");
    expect(fixo.textContent).toContain("7 alunos já leram");
    expect(within(item).queryByRole("radiogroup", { name: "Para quem" })).toBeNull();
  });

  it("mudar o público (ninguém leu) mostra quantos recebem e manda o público novo", async () => {
    montarAdmin((fn, a) => {
      if (fn === "app_admin_comunicados") return [C1];
      if (fn === "app_admin_comunicado_previa") return { destinatarios: a.p_filtro === "pro" ? 5 : 40 };
      if (fn === "app_admin_comunicado_editar") return { ...C1, publico: a.p_publico, filtro: a.p_filtro, versao: 2, editado_em: new Date().toISOString(), editado_por: "Admin Teste" };
      return null;
    });
    const item = await screen.findByTestId("comunicado-1");
    fireEvent.click(within(item).getByRole("button", { name: /Editar/ }));
    fireEvent.click(within(item).getByRole("radio", { name: "Um plano" }));
    expect(await within(item).findByText(/vai para 5 alunos \(Alunos do PRO\)/)).toBeTruthy();
    fireEvent.click(within(item).getByRole("button", { name: /Salvar alteração/ }));
    await screen.findByText(/foi atualizado/);
    expect(backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_admin_comunicado_editar")[1]).toMatchObject({ p_publico: "plano", p_filtro: "pro" });
  });

  it("erro do banco (ex.: outra pessoa editou) aparece na tela e a edição continua aberta", async () => {
    montarAdmin((fn) => {
      if (fn === "app_admin_comunicados") return [C1];
      if (fn === "app_admin_comunicado_editar") throw Object.assign(new Error("Outra pessoa da equipe editou este comunicado agora há pouco. Feche e abra de novo para ver a versão atual."), { code: "40001" });
      return null;
    });
    const item = await screen.findByTestId("comunicado-1");
    fireEvent.click(within(item).getByRole("button", { name: /Editar/ }));
    fireEvent.change(within(item).getByLabelText("Título"), { target: { value: "Outro título" } });
    fireEvent.click(within(item).getByRole("button", { name: /Salvar alteração/ }));
    expect(await within(item).findByRole("alert")).toBeTruthy();
    expect(within(item).getByTestId("editar-comunicado")).toBeTruthy();
  });
});

describe("Administração > Comunicados: leitura por versão e e-mail (decisões do dono 18/10)", () => {
  it("resumo da lista: leitura da versão atual, lido antes da edição e e-mail", () => {
    expect(resumoLeitura({ lidas: 3, destinatarios: 40, versao: 1 })).toBe("lido por 3 de 40");
    expect(resumoLeitura({ lidas: 0, destinatarios: 40, versao: 2, lidas_antes: 12 })).toBe("lido por 0 de 40 (versão atual) · lido antes da edição: 12");
    expect(resumoLeitura({ lidas: 1, destinatarios: 40, versao: 1, por_email: true, email: { enviados: 20, na_fila: 5, nao_enviados: 1, incertos: 0 } })).toBe(
      "lido por 1 de 40 · e-mail: 20 enviados (5 na fila, 1 não enviados)"
    );
  });

  it("já foi por e-mail: a edição avisa que o e-mail já enviado não muda e não oferece mandar de novo", async () => {
    const C3 = { ...C1, id: 3, por_email: true, email_em: iso(2), email: { enviados: 30, na_fila: 0, incertos: 0, nao_enviados: 0 }, pode_mudar_publico: false };
    montarAdmin((fn) => (fn === "app_admin_comunicados" ? [C3] : null));
    const item = await screen.findByTestId("comunicado-3");
    expect(item.textContent).toContain("e-mail: 30 enviados");
    fireEvent.click(within(item).getByRole("button", { name: /Editar/ }));
    const ed = within(item).getByTestId("editar-comunicado");
    expect(ed.textContent).toMatch(/O e-mail já enviado não muda/);
    expect(within(ed).queryByRole("checkbox", { name: "Enviar também por e-mail" })).toBeNull();
    expect(within(ed).getByTestId("publico-fixo").textContent).toMatch(/já foi por e-mail/);
  });

  it("na edição, marcar 'Enviar também por e-mail' mostra quantos recebem e manda p_email", async () => {
    montarAdmin((fn, a) => {
      if (fn === "app_admin_comunicados") return [C1];
      if (fn === "app_admin_comunicado_previa") return { destinatarios: 40, por_email: 17 };
      if (fn === "app_admin_comunicado_email") return { ...C1, por_email: true, email: { enviados: 0, na_fila: 17, incertos: 0, nao_enviados: 0 }, emails: 17, ja_enviado: false };
      return null;
    });
    const item = await screen.findByTestId("comunicado-1");
    fireEvent.click(within(item).getByRole("button", { name: /Editar/ }));
    fireEvent.click(within(item).getByRole("checkbox", { name: "Enviar também por e-mail" }));
    expect(await within(item).findByText(/Vai por e-mail para 17 alunos/)).toBeTruthy();
    fireEvent.click(within(item).getByRole("button", { name: /Salvar alteração/ }));
    expect(await screen.findByText(/17 e-mails entraram na fila/)).toBeTruthy();
    // só o e-mail: o texto não mudou, então não edita (a leitura não zera)
    expect(backend.rpc).not.toHaveBeenCalledWith("app_admin_comunicado_editar", expect.anything());
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_comunicado_email", { p_id: 1 });
    expect(screen.getByTestId("comunicado-1").textContent).toContain("e-mail: 0 enviados (17 na fila)");
  });

  it("comunicado novo com e-mail: a prévia diz quantos recebem por e-mail e o envio manda p_email", async () => {
    montarAdmin((fn) => {
      if (fn === "app_admin_comunicados") return [];
      if (fn === "app_admin_comunicado_previa") return { destinatarios: 40, por_email: 17 };
      if (fn === "app_admin_comunicado_enviar") return { id: 9, destinatarios: 40, repetido: false };
      if (fn === "app_admin_comunicado_email") return { id: 9, por_email: true, emails: 17, ja_enviado: false };
      return null;
    });
    await screen.findByText("Nenhum comunicado enviado ainda.");
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Simulado no sábado" } });
    fireEvent.change(screen.getByLabelText("Texto"), { target: { value: "Às 9h." } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Enviar também por e-mail" }));
    fireEvent.click(screen.getByRole("button", { name: /Ver prévia/ }));
    const previa = await screen.findByTestId("previa-comunicado");
    expect(within(previa).getByTestId("previa-email").textContent).toMatch(/Por e-mail: 17 alunos \(só para quem aceitou receber novidades/);
    fireEvent.click(within(previa).getByRole("button", { name: "Enviar para 40 alunos" }));
    expect(await screen.findByText(/17 e-mails entraram na fila/)).toBeTruthy();
    expect(backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_admin_comunicado_enviar")[1]).not.toHaveProperty("p_email");
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_comunicado_email", { p_id: 9 });
  });

  it("se o e-mail falhar depois do envio, a tela avisa e diz como mandar pela edição", async () => {
    montarAdmin((fn) => {
      if (fn === "app_admin_comunicados") return [];
      if (fn === "app_admin_comunicado_previa") return { destinatarios: 3, por_email: 1 };
      if (fn === "app_admin_comunicado_enviar") return { id: 9, destinatarios: 3, repetido: false };
      if (fn === "app_admin_comunicado_email") throw new Error("Sem conexão.");
      return null;
    });
    await screen.findByText("Nenhum comunicado enviado ainda.");
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Aviso" } });
    fireEvent.change(screen.getByLabelText("Texto"), { target: { value: "Texto." } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Enviar também por e-mail" }));
    fireEvent.click(screen.getByRole("button", { name: /Ver prévia/ }));
    fireEvent.click(within(await screen.findByTestId("previa-comunicado")).getByRole("button", { name: "Enviar para 3 alunos" }));
    expect(await screen.findByText(/o e-mail não entrou na fila/)).toBeTruthy();
    expect(screen.getByText("Comunicado enviado")).toBeTruthy();
  });
});

describe("Administração > Comunicados: apagar, desfazer e restaurar", () => {
  it("confirmação na própria página (sem window.confirm), com motivo; some da lista e aparece o Desfazer", async () => {
    const confirmar = vi.spyOn(window, "confirm");
    montarAdmin((fn, a) => {
      if (fn === "app_admin_comunicados") return a.p_situacao === "apagados" ? [] : [C1, C2];
      if (fn === "app_admin_comunicado_apagar") return { ...C2, apagado_em: new Date().toISOString(), mudou: true };
      if (fn === "app_admin_comunicado_restaurar") return { ...C2, mudou: true };
      return null;
    });
    const item = await screen.findByTestId("comunicado-2");
    fireEvent.click(within(item).getByRole("button", { name: "Apagar “Simulado nacional”" }));
    const conf = within(item).getByTestId("confirmar-apagar");
    expect(conf.textContent).toContain("Apagar “Simulado nacional”?");
    expect(conf.textContent).toContain("dos 12 alunos que receberam");
    expect(conf.textContent).toContain("inclusive de quem já leu: 7");
    expect(conf.textContent).toContain("dá para restaurar");
    // cancelar fecha sem apagar
    fireEvent.click(within(conf).getByRole("button", { name: "Cancelar" }));
    expect(within(item).queryByTestId("confirmar-apagar")).toBeNull();
    fireEvent.click(within(item).getByRole("button", { name: /Apagar/ }));
    fireEvent.change(within(item).getByLabelText("Motivo (opcional)"), { target: { value: "Data errada" } });
    fireEvent.click(within(item).getByRole("button", { name: "Apagar comunicado" }));
    const barra = await screen.findByTestId("barra-desfazer");
    expect(barra.textContent).toContain("“Simulado nacional” saiu do sino dos alunos");
    expect(screen.queryByTestId("comunicado-2")).toBeNull();
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_comunicado_apagar", { p_id: 2, p_motivo: "Data errada" });
    expect(confirmar).not.toHaveBeenCalled();
    // Desfazer
    fireEvent.click(within(barra).getByRole("button", { name: "Desfazer" }));
    expect(await screen.findByText("“Simulado nacional” voltou para o sino dos alunos.")).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_comunicado_restaurar", { p_id: 2 });
    expect(screen.queryByTestId("barra-desfazer")).toBeNull();
  });

  it("o Desfazer some sozinho depois de alguns segundos", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    montarAdmin((fn) => {
      if (fn === "app_admin_comunicados") return [C1];
      if (fn === "app_admin_comunicado_apagar") return { ...C1, apagado_em: new Date().toISOString() };
      return null;
    });
    const item = await screen.findByTestId("comunicado-1");
    fireEvent.click(within(item).getByRole("button", { name: /Apagar/ }));
    fireEvent.click(within(item).getByRole("button", { name: "Apagar comunicado" }));
    await screen.findByTestId("barra-desfazer");
    await act(async () => {
      vi.advanceTimersByTime(DESFAZER_MS + 100);
    });
    expect(screen.queryByTestId("barra-desfazer")).toBeNull();
  });

  it("filtro Apagados: mostra quem apagou, quando e o motivo, com Restaurar e Histórico", async () => {
    const apagado = { ...C2, apagado_em: iso(1), apagado_por: "Admin Teste", apagado_motivo: "Data errada" };
    montarAdmin((fn, a) => {
      if (fn === "app_admin_comunicados") return a.p_situacao === "apagados" ? [apagado] : [C1];
      if (fn === "app_admin_comunicado_restaurar") return { ...C2, mudou: true };
      if (fn === "app_admin_comunicado_historico")
        return [{ id: 5, acao: "apagar", versao: 1, antes: { titulo: C2.titulo }, depois: { titulo: C2.titulo }, motivo: "Data errada", em: iso(1), por: "Admin Teste" }];
      return null;
    });
    await screen.findByTestId("comunicado-1");
    fireEvent.click(screen.getByRole("radio", { name: "Apagados" }));
    const item = await screen.findByTestId("comunicado-2");
    expect(item.textContent).toMatch(/Apagado por Admin Teste em .* · Motivo: Data errada/);
    expect(within(item).queryByRole("button", { name: /Editar/ })).toBeNull();
    fireEvent.click(within(item).getByRole("button", { name: /Histórico/ }));
    expect(await within(item).findByText(/por Admin Teste em .* · Motivo: Data errada/)).toBeTruthy();
    fireEvent.click(within(item).getByRole("button", { name: "Fechar" }));
    fireEvent.click(within(item).getByRole("button", { name: /Restaurar/ }));
    expect(await screen.findByText("“Simulado nacional” voltou para o sino dos alunos.")).toBeTruthy();
    expect(backend.rpc).toHaveBeenCalledWith("app_admin_comunicado_restaurar", { p_id: 2 });
  });
});

describe("comunicado novo com o editor profissional", () => {
  it("envia o texto e a formatação (p_rico) e a prévia já mostra formatado", async () => {
    (globalThis as any).__ricoDoEditor = (t: string) => (t === CAMPO.texto ? CAMPO.rico : null);
    montarAdmin((fn, a) => {
      if (fn === "app_admin_comunicados") return [];
      if (fn === "app_admin_comunicado_previa") return { destinatarios: 3 };
      if (fn === "app_admin_comunicado_enviar") return { id: 9, destinatarios: 3, repetido: false };
      return null;
    });
    await screen.findByText("Nenhum comunicado enviado ainda.");
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Simulado no sábado" } });
    fireEvent.change(screen.getByLabelText("Texto"), { target: { value: CAMPO.texto } });
    fireEvent.click(screen.getByRole("button", { name: /Ver prévia/ }));
    const previa = await screen.findByTestId("previa-comunicado");
    expect((await within(previa).findByText("às 9h")).closest("strong")).toBeTruthy();
    expect(previa.textContent).toContain("dá para editar ou apagar");
    fireEvent.click(within(previa).getByRole("button", { name: "Enviar para 3 alunos" }));
    await screen.findByText("Comunicado enviado");
    expect(backend.rpc.mock.calls.find((c: any[]) => c[0] === "app_admin_comunicado_enviar")[1]).toMatchObject({ p_texto: CAMPO.texto, p_rico: CAMPO.rico });
  });

  it("texto acima de 600 letras não deixa ver a prévia", async () => {
    montarAdmin((fn) => (fn === "app_admin_comunicados" ? [] : null));
    await screen.findByText("Nenhum comunicado enviado ainda.");
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Longo demais" } });
    fireEvent.change(screen.getByLabelText("Texto"), { target: { value: "x".repeat(601) } });
    expect(screen.getByText(/passou de 600 letras/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Ver prévia/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

const ITEM_EMAIL = (payload: Partial<ItemFila["payload"]> = {}): ItemFila => ({
  id: 7,
  kind: "comunicado",
  tentativas: 1,
  email: "ana@teste.dev",
  nome: "Ana Souza",
  payload: { comunicado_id: 9, titulo: "Simulado <no> sábado", texto: CAMPO.texto, rico: CAMPO.rico, link: "/atualizacoes", descadastro: "a".repeat(64), ...payload },
});

describe("e-mail do comunicado (fila de serviço)", () => {
  it("HTML e texto simples saem do conteúdo formatado, escapados; rodapé e cabeçalho de descadastro", () => {
    const r = renderItem(ITEM_EMAIL(), "https://app.staziamed.com.br");
    expect(r.subject).toBe("Simulado <no> sábado · StaziaMed");
    expect(r.html).toContain("Simulado &lt;no&gt; sábado");
    expect(r.html).toMatch(/<strong>às 9h<\/strong>/);
    expect(r.html).toMatch(/<li[^>]*>.*Teoria/);
    expect(r.html).toContain('href="https://www.gov.br/inep"');
    expect(r.html).toContain("https://app.staziamed.com.br/novo/atualizacoes");
    const sair = `https://app.staziamed.com.br/api/legal/descadastro?t=${"a".repeat(64)}`;
    expect(r.html).toContain(sair);
    expect(r.html).toContain("aceitou receber novidades");
    expect(r.headers).toEqual({ "List-Unsubscribe": `<${sair}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(r.text).toContain("Olá, Ana!");
    expect(r.text).toContain("• Teoria");
    expect(r.text).toContain("Inscrição (https://www.gov.br/inep)");
    expect(r.text).toContain(`Descadastrar: ${sair}`);
    expect(r.text).not.toMatch(/<strong|<li|\*\*|\]\(/);
  });

  it("comunicado antigo (só texto) e texto com HTML: nada vira HTML; sem código de descadastro não manda", () => {
    const r = renderItem(ITEM_EMAIL({ texto: "<script>alert(1)</script> Oi", rico: null, link: null }), null);
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.text).toContain("<script>alert(1)</script> Oi");
    expect(() => renderItem(ITEM_EMAIL({ descadastro: undefined }), null)).toThrow(/descadastro/);
    expect(() => renderItem(ITEM_EMAIL({ titulo: undefined }), null)).toThrow(/título/);
  });
});

describe("página de descadastro (/api/legal/descadastro)", () => {
  async function servidor(estado: { recebe: boolean; valido?: boolean }) {
    const chamadas: any[] = [];
    const db: any = {
      mode: "dev",
      async service(fn: string, args: any) {
        chamadas.push([fn, args]);
        if (fn !== "ch_worker_marketing_descadastro") throw new Error(fn);
        if (estado.valido === false) return { valido: false };
        if (args.p_confirmar) estado.recebe = false;
        return { valido: true, recebe: estado.recebe };
      },
    };
    const app = express();
    app.use("/api/legal", createLegalRouter({ db, mailer: null, baseUrl: "https://app.staziamed.com.br" }));
    const srv = await new Promise<any>((r) => {
      const x = app.listen(0, "127.0.0.1", () => r(x));
    });
    return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/legal/descadastro`, chamadas, fechar: () => srv.close() };
  }
  const T = "b".repeat(64);

  it("abrir o link NÃO descadastra: mostra o botão de confirmar; confirmar (POST) descadastra", async () => {
    const s = await servidor({ recebe: true });
    try {
      const g = await fetch(`${s.url}?t=${T}`);
      expect(g.status).toBe(200);
      const html = await g.text();
      expect(html).toContain("Confirmar: não quero mais receber");
      expect(html).toContain('method="post"');
      expect(s.chamadas).toEqual([["ch_worker_marketing_descadastro", { p_token: T, p_confirmar: false }]]);
      const p = await fetch(`${s.url}?t=${T}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
      expect(p.status).toBe(200);
      expect(await p.text()).toContain("Pronto, descadastrado");
      expect(s.chamadas[1]).toEqual(["ch_worker_marketing_descadastro", { p_token: T, p_confirmar: true }]);
      expect(await (await fetch(`${s.url}?t=${T}`)).text()).toContain("Você já não recebe");
    } finally {
      s.fechar();
    }
  });

  it("código inválido: página explica e aponta Minha Conta; nada é chamado com código malformado", async () => {
    const s = await servidor({ recebe: true, valido: false });
    try {
      const r1 = await fetch(`${s.url}?t=<script>`);
      expect(r1.status).toBe(400);
      expect(await r1.text()).toContain("Privacidade e dados");
      expect(s.chamadas).toEqual([]);
      const r2 = await fetch(`${s.url}?t=${T}`);
      expect(r2.status).toBe(404);
      expect(r2.headers.get("cache-control")).toBe("no-store");
    } finally {
      s.fechar();
    }
  });
});
