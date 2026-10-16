// Treino em Dupla · "Conversas de estudo": a lista das conversas de quem deu match (StudyConversations do pacote de 11/10), com
// os dados reais do servidor (app_dupla_chats). Abrir uma conversa não consome match.
import React from "react";
import { Badge, Dialog, Icon, IconButton } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, messageOf } from "../../admin/common.jsx";
import { ChatDialog } from "./ChatDialog.jsx";
import { useChatList } from "./useChat.js";

const STYLE = `
.dupla-chats{max-width:520px}
.dupla-chats .sm-dialog__body{padding:0;display:flex;flex-direction:column;min-height:0}
.dupla-chats__head{display:flex;align-items:center;gap:10px;padding:20px 22px 12px;font:750 16px var(--font-sans);color:var(--text-primary)}
.dupla-chats__head h2{margin:0;font:inherit;flex:1;display:flex;align-items:center;gap:9px}
.dupla-chats__count{background:var(--teal-50);color:var(--teal-700);border-radius:8px;min-width:26px;padding:2px 7px;text-align:center;font-size:12px}
.dupla-chats__list{max-height:min(420px,60dvh);overflow-y:auto;padding:0 22px}
.dupla-chats__row{width:100%;padding:13px 0;background:transparent;border:0;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;gap:12px;text-align:left;color:var(--text-primary);cursor:pointer;font:14px/1.4 var(--font-sans)}
.dupla-chats__row:last-child{border-bottom:0}
.dupla-chats__row:hover{background:var(--surface-subtle)}
.dupla-chats__row:focus-visible{outline:3px solid var(--teal-300);outline-offset:2px}
.dupla-chats__row>span:nth-child(2){flex:1;min-width:0}
.dupla-chats__row small{display:block;font-size:12px;color:var(--text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:3px}
.dupla-chats__avatar{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:42px;height:42px;border-radius:50%;font:700 14px var(--font-sans);background:var(--teal-100);color:var(--teal-800)}
.dupla-chats__empty{padding:8px 22px 4px;font:14px/1.6 var(--font-sans)}
.dupla-chats__empty p{margin:0 0 5px;font-weight:650;color:var(--text-primary)}
.dupla-chats__empty small{color:var(--text-tertiary);line-height:1.7;display:block}
.dupla-chats__caption{font:11px var(--font-sans);color:var(--text-tertiary);border-top:1px solid var(--border-subtle);padding:12px 22px calc(18px + env(safe-area-inset-bottom,0px));margin:12px 0 0}
`;

function initials(name) {
  return String(name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toUpperCase();
}

/** Lista "Conversas de estudo" (janela). `onOpen(chatId)` abre a conversa. */
export function ChatList({ onClose, onOpen }) {
  const list = useChatList();
  const chats = list.chats;
  return (
    <Dialog label="Conversas de estudo" className="dupla-chats" onClose={onClose}>
      <style>{STYLE}</style>
      <div className="dupla-chats__head">
        <h2>
          <Icon name="message-circle" size={19} />
          Conversas de estudo
        </h2>
        {list.loaded && <span className="dupla-chats__count">{chats.length}</span>}
        <IconButton icon="x" label="Fechar conversas" onClick={onClose} />
      </div>
      {list.error && !list.loaded ? (
        <div style={{ padding: "0 22px" }}>
          <LoadError error={list.error} retry={list.refresh} />
        </div>
      ) : !list.loaded ? (
        <div style={{ padding: "0 22px" }}>
          <Loading />
        </div>
      ) : chats.length ? (
        <div className="dupla-chats__list" role="list" aria-label="Conversas">
          {chats.map((c) => {
            const name = c.partner?.public_name ?? "";
            const preview = c.last ? (c.last.mine ? "Você: " : "") + c.last.body : "Combine o próximo treino";
            return (
              <div role="listitem" key={c.chat_id}>
                <button type="button" className="dupla-chats__row" onClick={() => onOpen(c.chat_id)}>
                  <span className="dupla-chats__avatar" aria-hidden="true">
                    {initials(name)}
                  </span>
                  <span>
                    <strong>{name}</strong>
                    <small>{preview}</small>
                  </span>
                  {c.blocked_by_me && (
                    <Badge size="sm" tone="neutral">
                      Bloqueado
                    </Badge>
                  )}
                  {!c.blocked_by_me && c.room_id && (
                    <Badge size="sm" tone="brand" icon="video">
                      Sala aberta
                    </Badge>
                  )}
                  <Icon name="chevron-right" size={18} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dupla-chats__empty">
          <p>Um match, uma nova dupla.</p>
          <small>Suas conversas aparecem aqui depois do match. Use o chat para combinar estações, horários e papéis.</small>
        </div>
      )}
      <p className="dupla-chats__caption">Conversar e retomar uma dupla não consome novos matches.</p>
    </Dialog>
  );
}

/**
 * Janelas do chat numa tela: a lista ("Conversas") e a conversa aberta. `openWith(partnerId)` abre a conversa com quem deu match
 * (`app_dupla_chat_open`); "Abrir sala" leva à sala por `go`. Erros vão a `onError` (texto do servidor).
 * @param {{ go: (route: string, query?: Record<string, string>) => void, onError?: (text: string) => void }} p
 */
export function useChatWindows({ go, onError }) {
  const { backend } = useSession();
  const [listOpen, setListOpen] = React.useState(false);
  const [chatId, setChatId] = React.useState(null);
  const errorRef = React.useRef(onError);
  errorRef.current = onError;

  const openWith = React.useCallback(
    async (partnerId) => {
      try {
        const summary = await backend.rpc("app_dupla_chat_open", { p_partner: partnerId });
        if (summary?.chat_id) setChatId(summary.chat_id);
        return Boolean(summary?.chat_id);
      } catch (e) {
        errorRef.current?.(messageOf(e));
        return false;
      }
    },
    [backend],
  );

  const node = (
    <>
      {listOpen && !chatId && (
        <ChatList
          onClose={() => setListOpen(false)}
          onOpen={(id) => {
            setChatId(id);
          }}
        />
      )}
      {chatId && (
        <ChatDialog
          key={chatId}
          chatId={chatId}
          onClose={() => setChatId(null)}
          onOpenRoom={(roomId) => {
            setChatId(null);
            setListOpen(false);
            go("dupla-sala", { sala: roomId });
          }}
        />
      )}
    </>
  );

  return { node, openList: () => setListOpen(true), openWith, chatOpen: Boolean(chatId) || listOpen };
}
