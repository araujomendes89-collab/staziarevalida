// Treino em Dupla · chat entre os dois do match: leitura e envio pelas funções do banco (migração 013370).
// O servidor decide tudo (quem conversa, filtro, limite de envios, 24 h); a tela só mostra o que ele devolve.
import React from "react";
import { useSession } from "../../session.jsx";
import { messageOf } from "../../admin/common.jsx";

/** Sem tempo real (banco local, ou canal fora do ar): consulta a cada 5 s. Com tempo real: a cada 30 s, só de reserva. */
export const CHAT_POLL_LOCAL_MS = 5000;
export const CHAT_POLL_LIVE_MS = 30000;

const pageVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

/**
 * @typedef {{ id: string, body: string, created_at: string, expires_at: string, mine: boolean, author: string }} ChatMessage
 * @typedef {{ chat_id: string, partner: { user_id: string | null, public_name: string }, last: { body: string, created_at: string, mine: boolean } | null,
 *   room_id: string | null, blocked_by_me: boolean, can_send: boolean }} ChatSummary
 */

/**
 * Uma conversa: mensagens, resumo (parceiro, bloqueio, sala aberta) e envio. Consulta na entrada, a cada aviso do tempo real
 * (`backend.subscribeChat`), por relógio e ao voltar a aba. Resposta atrasada nunca vence uma mais nova nem apaga a mensagem que
 * acabou de ser enviada.
 * @param {string} chatId
 */
export function useChat(chatId) {
  const { backend } = useSession();
  const [state, setState] = React.useState({ loaded: false, error: null, chat: null, messages: [], max: null });
  const [live, setLive] = React.useState(false);
  const seq = React.useRef(0);
  const alive = React.useRef(true);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = React.useCallback(async () => {
    if (!backend || !chatId) return;
    const mine = ++seq.current;
    try {
      const res = await backend.rpc("app_dupla_chat_messages", { p_chat_id: chatId });
      if (!alive.current || mine !== seq.current) return;
      setState({ loaded: true, error: null, chat: res?.chat ?? null, messages: Array.isArray(res?.messages) ? res.messages : [], max: res?.max ?? null });
    } catch (e) {
      if (!alive.current || mine !== seq.current) return;
      setState((prev) => (prev.loaded ? prev : { ...prev, error: e }));
    }
  }, [backend, chatId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // Tempo real: só avisa; quem traz as mensagens é a função.
  React.useEffect(() => {
    if (!backend?.subscribeChat || !chatId) return undefined;
    const close = backend.subscribeChat(chatId, {
      onMessage: () => void refresh(),
      onStatus: (status) => setLive(status === "SUBSCRIBED"),
    });
    return () => {
      close();
      setLive(false);
    };
  }, [backend, chatId, refresh]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (pageVisible()) void refresh();
    }, live ? CHAT_POLL_LIVE_MS : CHAT_POLL_LOCAL_MS);
    const onVisible = () => {
      if (pageVisible()) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [refresh, live]);

  /** Envia; recusada pelo servidor, devolve o motivo (texto do servidor) e nada entra na lista. */
  const send = React.useCallback(
    async (text) => {
      try {
        const message = await backend.rpc("app_dupla_chat_send", { p_chat_id: chatId, p_text: text });
        if (!alive.current) return { ok: true };
        ++seq.current; // uma leitura que saiu antes do envio não apaga a mensagem nova
        setState((prev) => ({
          ...prev,
          messages: message && !prev.messages.some((m) => m.id === message.id) ? [...prev.messages, message] : prev.messages,
        }));
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: messageOf(e) };
      }
    },
    [backend, chatId],
  );

  const setChat = React.useCallback((chat) => setState((prev) => ({ ...prev, chat })), []);

  return { ...state, live, refresh, send, setChat };
}

/**
 * Minhas conversas (`app_dupla_chats`), a mais recente primeiro. Consulta ao abrir e a cada 30 s enquanto a lista está aberta.
 */
export function useChatList() {
  const { backend } = useSession();
  const [state, setState] = React.useState({ loaded: false, error: null, chats: [] });
  const alive = React.useRef(true);
  const seq = React.useRef(0);

  const refresh = React.useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await backend.rpc("app_dupla_chats");
      if (!alive.current || mine !== seq.current) return;
      setState({ loaded: true, error: null, chats: Array.isArray(res?.chats) ? res.chats : [] });
    } catch (e) {
      if (!alive.current || mine !== seq.current) return;
      setState((prev) => (prev.loaded ? prev : { ...prev, error: e }));
    }
  }, [backend]);

  React.useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => {
      if (pageVisible()) void refresh();
    }, CHAT_POLL_LIVE_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  return { ...state, refresh };
}
