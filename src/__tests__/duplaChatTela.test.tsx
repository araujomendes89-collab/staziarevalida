/**
 * Treinamento em Dupla · Etapa C · Tarefa C2: chat de estudo na tela (jsdom). O banco é simulado pelo contrato da migração 013370
 * (app_dupla_chats, app_dupla_chat_open, app_dupla_chat_messages, app_dupla_chat_send, app_dupla_chat_block,
 * app_dupla_chat_report, app_dupla_chat_room); o resto do Praticar, pelo contrato da Tarefa 11.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { makeFakeAudio } from "./helpers/fakeAudio";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "student" }, user: { id: "u1" } }) }));

import { PracticeScreen } from "../novo/app/dupla/PracticeScreen.jsx";
import { ChatDialog } from "../novo/app/dupla/chat/ChatDialog.jsx";
import { AdminDuplaChatReports, AdminDuplaChatSettings } from "../novo/app/admin/AdminDuplaChat.jsx";

const PALAVRA = "Essa mensagem contém uma palavra não permitida. Reformule com respeito e mantenha o foco no treino.";
const PROFILE = {
  public_name: "Maria Souza", school: "UFPR", city: "Curitiba · PR", goal: "Treinar GO", exam: "2026/2", bio: "",
  areas: ["GO"], role_pref: "any", pace: "cronometrado", days: ["Seg"], shifts: ["Noite"],
  radar_visible: true, show_school: true, show_stats: true,
};
const CARLA = {
  user_id: "u-carla", public_name: "Carla Dias", school: "UFPR", city: "Curitiba · PR", exam: "2026/2", bio: "Oi.", goal: "Treinar GO",
  areas: ["GO"], role_pref: "ator", pace: "cronometrado", days: ["Seg"], shifts: ["Noite"], stats: { done: 3, avg: 7.8 },
  compat: 92, reasons: [], online: true,
};
const summary = (extra: Record<string, unknown> = {}) => ({
  chat_id: "chat-1", partner: { user_id: "u-carla", public_name: "Carla Dias" }, last: null, room_id: null, blocked_by_me: false, can_send: true, ...extra,
});
let seq = 0;
const msg = (body: string, mine: boolean, extra: Record<string, unknown> = {}) => ({
  id: `m-${++seq}`, body, created_at: "2026-10-16T20:15:00.000Z", expires_at: "2026-10-17T20:15:00.000Z", mine, author: mine ? "Maria Souza" : "Carla Dias", ...extra,
});

let chatNow: any;
let messagesNow: any[];
let chatsNow: any[];
let sendError: Error | null;
let swipeResult: any;
let invitesNow: any[];
let go: any;
const rpcCalls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);

beforeEach(() => {
  go = vi.fn();
  localStorage.clear();
  seq = 0;
  chatNow = summary();
  messagesNow = [];
  chatsNow = [];
  sendError = null;
  swipeResult = { matched: false };
  invitesNow = [];
  delete backend.subscribeInvites;
  delete backend.subscribeChat;
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_dupla_profile") return { profile: PROFILE, defaults: null, stats: null };
    if (fn === "app_dupla_deck") return { cards: [CARLA], hidden_by_role: 0, online: 2, matches_today: 0, open_room: null, server_now: new Date().toISOString() };
    if (fn === "app_dupla_heartbeat") return { server_now: new Date().toISOString() };
    if (fn === "app_dupla_invites") return { invites: invitesNow, server_now: new Date().toISOString() };
    if (fn === "app_dupla_swipe") return swipeResult;
    if (fn === "app_dupla_leave") return { id: args.p_room_id, phase: "closed" };
    if (fn === "app_dupla_answer_invite") return { room_id: args.p_accept ? "sala-aceita" : null };
    if (fn === "app_dupla_chats") return { chats: chatsNow, server_now: new Date().toISOString() };
    if (fn === "app_dupla_chat_open") return summary({ partner: { user_id: args.p_partner, public_name: args.p_partner === "u-bruno" ? "Bruno Lima" : "Carla Dias" } });
    if (fn === "app_dupla_chat_messages") return { chat: chatNow, messages: messagesNow, max: 600, server_now: new Date().toISOString() };
    if (fn === "app_dupla_chat_send") {
      if (sendError) throw sendError;
      const m = msg(String(args.p_text).trim(), true);
      messagesNow = [...messagesNow, m];
      return m;
    }
    if (fn === "app_dupla_chat_block") {
      chatNow = summary({ blocked_by_me: args.p_block, can_send: !args.p_block });
      return chatNow;
    }
    if (fn === "app_dupla_chat_report") return { report_id: "den-1", messages: messagesNow.length };
    if (fn === "app_dupla_chat_room") return { room_id: "sala-chat" };
    throw new Error(`rpc não simulada: ${fn}`);
  });
  const audio = makeFakeAudio();
  (window as any).AudioContext = audio.Ctor;
  delete (window as any).__szAudio;
  Object.defineProperty(navigator, "vibrate", { configurable: true, writable: true, value: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function openPractice() {
  render(
    <MemoryRouter initialEntries={["/dupla"]}>
      <PracticeScreen go={go} />
    </MemoryRouter>,
  );
  await screen.findByText("2 colegas online");
}
async function openChat(props: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  const onOpenRoom = vi.fn();
  render(<ChatDialog chatId="chat-1" onClose={onClose} onOpenRoom={onOpenRoom} {...props} />);
  await screen.findByText("Vocês têm o treino em comum.");
  return { onClose, onOpenRoom };
}
const field = () => screen.getByLabelText("Mensagem para Carla") as HTMLTextAreaElement;
const sendButton = () => screen.getByRole("button", { name: "Enviar mensagem no chat" });

describe("Chat de estudo — Etapa C", () => {
  it("Deu match!: 'Enviar mensagem' abre a conversa daquele par; 'Continuar buscando' e 'Abrir sala agora' seguem como antes; sem 'Agendar sessão'", async () => {
    swipeResult = { matched: true, room_id: "sala-1", partner: { user_id: "u-carla", public_name: "Carla Dias" } };
    await openPractice();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    const dialog = await screen.findByRole("dialog");
    const botoes = within(dialog).getAllByRole("button").map((b) => b.textContent?.trim()).filter(Boolean);
    expect(botoes).toEqual(["Abrir sala agora", "Enviar mensagem", "Continuar buscando"]);
    expect(document.body.textContent).not.toContain("Agendar sessão");

    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar mensagem" }));
    const chat = await screen.findByRole("dialog", { name: "Chat de estudo com Carla Dias" });
    expect(rpcCalls("app_dupla_chat_open")).toEqual([["app_dupla_chat_open", { p_partner: "u-carla" }]]);
    expect(rpcCalls("app_dupla_leave")).toEqual([]); // a sala não fecha: o convite segue valendo
    expect(screen.queryByText("Deu match!")).toBeNull();
    expect(within(chat).getByText("CHAT DE ESTUDO")).toBeTruthy();
    expect(within(chat).getByText("Um espaço para treinar juntos. Sem ofensas, divulgação ou contatos externos.")).toBeTruthy();
  });

  it("convite (quem escolheu primeiro): 'Enviar mensagem' abre o chat sem recusar o convite", async () => {
    invitesNow = [{ id: "inv-1", room_id: "sala-9", from: { user_id: "u-bruno", public_name: "Bruno Lima" }, expires_at: new Date(Date.now() + 60000).toISOString() }];
    chatNow = summary({ partner: { user_id: "u-bruno", public_name: "Bruno Lima" } });
    await openPractice();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar mensagem" }));
    await screen.findByRole("dialog", { name: "Chat de estudo com Bruno Lima" });
    expect(rpcCalls("app_dupla_chat_open")).toEqual([["app_dupla_chat_open", { p_partner: "u-bruno" }]]);
    expect(rpcCalls("app_dupla_answer_invite")).toEqual([]);
  });

  it("enviar: grava, mostra, e a mensagem bloqueada mostra o motivo do servidor e não aparece na lista", async () => {
    await openChat();
    fireEvent.change(field(), { target: { value: "  Vamos treinar às 20h?  " } });
    fireEvent.click(sendButton());
    const log = screen.getByRole("log", { name: "Mensagens do treino" });
    await waitFor(() => expect(within(log).getByText("Vamos treinar às 20h?")).toBeTruthy());
    expect(rpcCalls("app_dupla_chat_send")).toEqual([["app_dupla_chat_send", { p_chat_id: "chat-1", p_text: "  Vamos treinar às 20h?  " }]]);
    expect(field().value).toBe("");

    sendError = new Error(PALAVRA);
    fireEvent.change(field(), { target: { value: "idiota" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect((await screen.findByRole("alert")).textContent).toContain(PALAVRA);
    expect(within(log).queryByText("idiota")).toBeNull();
    expect(field().value).toBe("idiota"); // o texto fica para a pessoa reformular
    expect(field().getAttribute("aria-invalid")).toBe("true");
    // Ao mexer no texto, o aviso sai.
    fireEvent.change(field(), { target: { value: "Vamos?" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("contador 0/600, envio desligado vazio e texto com < > & aparece como texto", async () => {
    messagesNow = [msg("<b>oi</b> & <script>alert(1)</script>", false)];
    await openChat();
    expect(screen.getByText("0/600")).toBeTruthy();
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field(), { target: { value: "   " } });
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field(), { target: { value: "Oi" } });
    expect(screen.getByText("2/600")).toBeTruthy();
    expect((sendButton() as HTMLButtonElement).disabled).toBe(false);
    expect(field().maxLength).toBe(600);
    const log = screen.getByRole("log");
    expect(within(log).getByText("<b>oi</b> & <script>alert(1)</script>")).toBeTruthy();
    expect(log.querySelector("b, script")).toBeNull();
    expect(within(log).getByText(/^Carla Dias · /)).toBeTruthy();
    expect(screen.getByText("As mensagens se apagam 24 horas depois de enviadas.")).toBeTruthy();
    // Sem "prévia": as mensagens vão de verdade ao parceiro.
    expect(document.body.textContent).not.toMatch(/Prévia local|salvo na prévia/);
  });

  it("lista de conversas e 'Abrir sala' sem consumir match", async () => {
    await openPractice();
    fireEvent.click(screen.getByRole("button", { name: "Conversas" }));
    const vazia = await screen.findByRole("dialog", { name: "Conversas de estudo" });
    await within(vazia).findByText("Suas conversas aparecem aqui depois do match. Use o chat para combinar estações, horários e papéis.");
    expect(within(vazia).getByText("Conversar e retomar uma dupla não consome novos matches.")).toBeTruthy();
    fireEvent.click(within(vazia).getByRole("button", { name: "Fechar conversas" }));

    chatsNow = [
      summary({ last: { body: "Combinado!", created_at: "2026-10-16T20:15:00Z", mine: true }, room_id: "sala-x" }),
      summary({ chat_id: "chat-2", partner: { user_id: null, public_name: "Conta excluída" }, can_send: false }),
    ];
    fireEvent.click(screen.getByRole("button", { name: "Conversas" }));
    const lista = await screen.findByRole("dialog", { name: "Conversas de estudo" });
    const linhas = await within(lista).findAllByRole("listitem");
    expect(linhas.map((l) => l.textContent)).toEqual([expect.stringContaining("Carla DiasVocê: Combinado!"), expect.stringContaining("Conta excluídaCombine o próximo treino")]);
    expect(within(linhas[0]).getByText("Sala aberta")).toBeTruthy();
    fireEvent.click(within(linhas[0]).getByRole("button"));
    const chat = await screen.findByRole("dialog", { name: "Chat de estudo com Carla Dias" });
    fireEvent.click(within(chat).getByRole("button", { name: "Abrir sala" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-chat" }));
    expect(rpcCalls("app_dupla_chat_room")).toEqual([["app_dupla_chat_room", { p_chat_id: "chat-1" }]]);
    expect(rpcCalls("app_dupla_swipe")).toEqual([]);
  });

  it("banco local consulta a cada 5 s; com tempo real usa o canal da conversa e fecha ao sair", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { unmount } = render(<ChatDialog chatId="chat-1" onClose={() => {}} onOpenRoom={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(rpcCalls("app_dupla_chat_messages")).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(rpcCalls("app_dupla_chat_messages")).toHaveLength(2);
    unmount();

    backend.rpc.mockClear();
    const close = vi.fn();
    let h: any;
    backend.subscribeChat = vi.fn((id: string, handlers: any) => {
      h = handlers;
      return close;
    });
    const second = render(<ChatDialog chatId="chat-1" onClose={() => {}} onOpenRoom={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(backend.subscribeChat).toHaveBeenCalledWith("chat-1", expect.any(Object));
    act(() => h.onStatus("SUBSCRIBED"));
    const before = rpcCalls("app_dupla_chat_messages").length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(rpcCalls("app_dupla_chat_messages")).toHaveLength(before); // com o canal ligado, nada de consulta a cada 5 s
    messagesNow = [msg("Chegou pelo tempo real", false)];
    await act(async () => {
      h.onMessage();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(rpcCalls("app_dupla_chat_messages")).toHaveLength(before + 1);
    expect(screen.getByText("Chegou pelo tempo real")).toBeTruthy();
    second.unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("bloquear e denunciar: confirmação, aviso e o campo some para quem bloqueou", async () => {
    messagesNow = [msg("Oi", false)];
    await openChat();
    fireEvent.click(screen.getByRole("button", { name: "Denunciar" }));
    expect(screen.getByText(/recebe uma cópia das mensagens desta conversa que ainda não se apagaram/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("O que aconteceu? (opcional)"), { target: { value: "Falou palavrão" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar denúncia" }));
    expect(await screen.findByText("Denúncia enviada. A equipe vai analisar.")).toBeTruthy();
    expect(rpcCalls("app_dupla_chat_report")).toEqual([["app_dupla_chat_report", { p_chat_id: "chat-1", p_reason: "Falou palavrão" }]]);

    fireEvent.click(screen.getByRole("button", { name: "Bloquear" }));
    expect(screen.getByText("Bloquear Carla Dias?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bloquear" }));
    expect(await screen.findByText("Você bloqueou esta pessoa. Desbloqueie para enviar mensagens.")).toBeTruthy();
    expect(screen.queryByLabelText("Mensagem para Carla")).toBeNull();
    expect((screen.getByRole("button", { name: "Abrir sala" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Desbloquear" }));
    await screen.findByLabelText("Mensagem para Carla");
    expect(rpcCalls("app_dupla_chat_block")).toEqual([
      ["app_dupla_chat_block", { p_chat_id: "chat-1", p_block: true }],
      ["app_dupla_chat_block", { p_chat_id: "chat-1", p_block: false }],
    ]);
  });

  it("quem foi bloqueado lê a frase neutra; conta excluída sem bloquear nem denunciar", async () => {
    chatNow = summary({ can_send: false });
    await openChat();
    expect(screen.getByText("Esta conversa não aceita novas mensagens.")).toBeTruthy();
    expect(screen.queryByText(/Você bloqueou/)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    cleanup();

    chatNow = summary({ partner: { user_id: null, public_name: "Conta excluída" }, can_send: false });
    messagesNow = [msg("Mensagem antiga", false, { author: "Conta excluída" })];
    render(<ChatDialog chatId="chat-1" onClose={() => {}} onOpenRoom={() => {}} />);
    const chat = await screen.findByRole("dialog", { name: "Chat de estudo com Conta excluída" });
    expect(within(chat).getByText(/^Conta excluída · /)).toBeTruthy();
    expect(within(chat).queryByRole("button", { name: "Bloquear" })).toBeNull();
    expect(within(chat).queryByRole("button", { name: "Denunciar" })).toBeNull();
  });
});

describe("Administração — denúncias do chat e configurações", () => {
  it("a equipe vê a lista, lê só a cópia da conversa denunciada e encerra com anotação", async () => {
    let status = "aberta";
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_dupla_chat_reports") {
        return status === "aberta" && args.p_status === "aberta"
          ? { open: 1, items: [{ id: "den-1", created_at: "2026-10-16T20:00:00Z", status: "aberta", reporter_name: "Bruno Lima", reported_name: "Ana Souza", reason: "Ofensa", message_count: 2 }] }
          : { open: 0, items: [] };
      }
      if (fn === "app_admin_dupla_chat_report") {
        return {
          id: "den-1", status: "aberta", reporter_name: "Bruno Lima", reported_name: "Ana Souza", reason: "Ofensa", team_note: null,
          messages: [
            { autor: "denunciado", nome: "Ana Souza", texto: "<i>texto</i> ofensivo", enviada_em: "2026-10-16T19:00:00Z" },
            { autor: "denunciante", nome: "Bruno Lima", texto: "Pare, por favor", enviada_em: "2026-10-16T19:01:00Z" },
          ],
        };
      }
      if (fn === "app_admin_dupla_chat_report_close") {
        status = "encerrada";
        return { id: args.p_id, status: "encerrada" };
      }
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<AdminDuplaChatReports />);
    expect(await screen.findByText("Bruno Lima denunciou Ana Souza")).toBeTruthy();
    expect(screen.getByText("1 aberta")).toBeTruthy();
    expect(screen.getByText("Motivo: Ofensa")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ler conversa denunciada" }));
    const lista = await screen.findByRole("list", { name: "Mensagens denunciadas" });
    expect(within(lista).getByText("<i>texto</i> ofensivo")).toBeTruthy();
    expect(lista.querySelector("i")).toBeNull();
    expect(within(lista).getByText(/Ana Souza \(denunciado\(a\)\)/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Anotação da equipe (opcional)"), { target: { value: "Advertência enviada" } });
    fireEvent.click(screen.getByRole("button", { name: "Encerrar denúncia" }));
    await waitFor(() => expect(rpcCalls("app_admin_dupla_chat_report_close")).toEqual([["app_admin_dupla_chat_report_close", { p_id: "den-1", p_note: "Advertência enviada" }]]));
    expect(await screen.findByText("Nenhuma denúncia aberta")).toBeTruthy();
  });

  it("configurações do chat: lê os valores do banco e salva o que o administrador digitou", async () => {
    backend.rpc.mockImplementation(async (fn: string, args: any) => {
      if (fn === "app_admin_settings") return { treino_dupla_chat: { palavras: ["idiota", "babaca"], max: 600, rajada: 5, janela_s: 30, guarda_denuncia_dias: null } };
      if (fn === "app_admin_save_dupla_chat") return args.p_settings;
      throw new Error(`rpc não simulada: ${fn}`);
    });
    render(<AdminDuplaChatSettings />);
    const palavras = (await screen.findByLabelText("Palavras bloqueadas (uma por linha)")) as HTMLTextAreaElement;
    expect(palavras.value).toBe("idiota\nbabaca");
    expect((screen.getByLabelText("Tamanho máximo (caracteres)") as HTMLInputElement).value).toBe("600");
    fireEvent.change(palavras, { target: { value: "idiota\nbabaca\n tomate " } });
    fireEvent.change(screen.getByLabelText("Guardar denúncias encerradas (dias)"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar configurações do chat" }));
    await screen.findByText("Configurações salvas.");
    expect(rpcCalls("app_admin_save_dupla_chat")).toEqual([
      ["app_admin_save_dupla_chat", { p_settings: { palavras: ["idiota", "babaca", "tomate"], max: 600, rajada: 5, janela_s: 30, guarda_denuncia_dias: 90 } }],
    ]);
  });
});
