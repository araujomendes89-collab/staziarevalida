// Treino em Dupla · chat de estudo entre os dois do match. Porte de StudyChat.jsx do pacote de design (11/10) com o Dialog e as
// cores do app, ligado ao servidor (migração 013370): só os dois do par conversam, o filtro e o limite de envios são do servidor
// e o motivo da recusa aparece ao lado do campo. Mensagens somem 24 horas depois de enviadas (decisão do dono, D6).
// Bloquear e denunciar ficam aqui (D6). Texto sempre como texto, nunca como HTML. Sem IA.
import React from "react";
import { Banner, Button, Dialog, Icon, IconButton, Textarea } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, messageOf } from "../../admin/common.jsx";
import { firstName } from "../deck.js";
import { useChat } from "./useChat.js";

const STYLE = `
.dupla-chat{max-width:620px;height:min(730px,calc(100dvh - 48px))}
.dupla-chat .sm-dialog__body{padding:0;display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
.dupla-chat__header{display:flex;align-items:center;gap:12px;padding:20px 24px;border-bottom:1px solid var(--border-subtle);flex-shrink:0}
.dupla-chat__title{flex:1;min-width:0}
.dupla-chat__title small{display:block;font:700 10px var(--font-sans);letter-spacing:.1em;color:var(--teal-700);margin-bottom:4px}
.dupla-chat__title h2{margin:0;font:750 19px/1.35 var(--font-sans);color:var(--text-primary);overflow-wrap:anywhere}
.dupla-chat__avatar{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:42px;height:42px;border-radius:50%;font:700 14px var(--font-sans);background:var(--teal-100);color:var(--teal-800)}
.dupla-chat__safety{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:10px 24px;background:var(--surface-brand-soft);color:var(--teal-800);font:12px/1.5 var(--font-sans);flex-shrink:0}
.dupla-chat__safety-text{flex:1 1 220px}
.dupla-chat__tools{display:flex;gap:4px;flex:0 0 auto}
.dupla-chat__tool{border:0;background:transparent;color:var(--teal-800);font:600 12px var(--font-sans);padding:4px 8px;border-radius:8px;cursor:pointer;text-decoration:underline}
.dupla-chat__tool:hover{background:var(--teal-50)}
.dupla-chat__tool:disabled{opacity:.5;cursor:default}
.dupla-chat__log{padding:24px;overflow:auto;min-height:110px;flex:1;background:var(--surface-subtle);display:flex;flex-direction:column;gap:14px}
.dupla-chat__intro{text-align:center;max-width:360px;margin:6px auto 18px;font:13px/1.7 var(--font-sans);color:var(--text-tertiary)}
.dupla-chat__intro strong{display:block;margin:12px 0 6px;font-size:16px;color:var(--text-primary)}
.dupla-chat__intro p{margin:0}
.dupla-chat__symbol{width:46px;height:46px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;background:var(--teal-50);color:var(--teal-700)}
.dupla-chat__msg{max-width:85%;border-radius:16px;padding:12px 15px;color:var(--text-primary);font:14px/1.65 var(--font-sans)}
.dupla-chat__msg p{margin:0 0 6px;white-space:pre-wrap;overflow-wrap:anywhere}
.dupla-chat__msg small{display:block;color:var(--text-tertiary);font-size:10px}
.dupla-chat__msg--mine{align-self:flex-end;background:var(--teal-50);border:1px solid var(--teal-100);border-bottom-right-radius:4px}
.dupla-chat__msg--mine small{text-align:right}
.dupla-chat__msg--theirs{align-self:flex-start;background:var(--surface-card);border:1px solid var(--border-subtle);border-bottom-left-radius:4px}
.dupla-chat__composer{padding:16px 24px;border-top:1px solid var(--border-subtle);flex-shrink:0;background:var(--surface-card)}
.dupla-chat__composer>label{display:block;font:700 12px var(--font-sans);color:var(--text-primary);margin-bottom:8px}
.dupla-chat__suggestions{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.dupla-chat__suggestions button{border:1px solid var(--border-subtle);background:var(--surface-card);border-radius:20px;padding:7px 11px;color:var(--teal-800);font:11px var(--font-sans);cursor:pointer;text-align:left}
.dupla-chat__suggestions button:hover{border-color:var(--teal-500);background:var(--teal-50)}
.dupla-chat__input{display:flex;align-items:flex-end;border:1px solid var(--border-strong);border-radius:12px;padding:10px;gap:8px;background:var(--surface-card)}
.dupla-chat__input:focus-within{outline:2px solid var(--teal-300);border-color:var(--teal-600)}
.dupla-chat__input textarea{width:100%;flex:1;min-width:0;border:0;outline:none;resize:none;background:transparent;color:var(--text-primary);font:14px/1.6 var(--font-sans);padding:0 3px}
.dupla-chat__send{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:40px;height:40px;border:0;border-radius:10px;background:var(--action-primary);color:var(--text-inverse);cursor:pointer}
.dupla-chat__send:disabled{opacity:.45;cursor:default}
.dupla-chat__meta{display:flex;gap:10px;justify-content:space-between;font:10px var(--font-sans);color:var(--text-tertiary);margin-top:8px}
.dupla-chat__meta>span:last-child{white-space:nowrap}
.dupla-chat__error{display:flex;align-items:flex-start;gap:8px;color:var(--danger-text);background:var(--danger-bg);border-radius:9px;font:12px/1.6 var(--font-sans);padding:10px 12px;margin:0 0 12px}
.dupla-chat__panel{padding:24px;display:flex;flex-direction:column;gap:14px;overflow:auto;flex:1;font:14px/1.6 var(--font-sans);color:var(--text-secondary)}
.dupla-chat__panel h3{margin:0;font:700 17px var(--font-sans);color:var(--text-primary)}
.dupla-chat__panel p{margin:0}
.dupla-chat__actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
@media (max-width:640px){
  .dupla-chat{height:calc(100dvh - 24px)}
  .dupla-chat__header{padding:16px;gap:8px;flex-wrap:wrap}
  .dupla-chat__title h2{font-size:17px}
  .dupla-chat__header>.dupla-chat__avatar{width:34px;height:34px;font-size:12px}
  .dupla-chat__safety{padding:10px 16px;font-size:11px}
  .dupla-chat__log{padding:18px 16px}
  .dupla-chat__composer{padding:14px 16px}
  .dupla-chat__msg{max-width:94%}
  .dupla-chat__panel{padding:18px 16px}
}
`;

// Sugestões do pacote (StudyChat.jsx), só quando a conversa está vazia.
const SUGGESTIONS = ["Vamos treinar uma estação?", "Qual horário funciona para você?", "Posso começar como ator/avaliador."];
const REPORT_MAX = 500;

const hora = (iso) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function initials(name) {
  return String(name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toUpperCase();
}

/**
 * Chat de estudo de uma conversa (`chatId` = `study_chats.id`). "Abrir sala" chama `app_dupla_chat_room` (sala do par, sem novo
 * match) e entrega o id a `onOpenRoom`. `onClose` fecha (botão, Esc, fundo).
 * @param {{ chatId: string, onClose: () => void, onOpenRoom: (roomId: string) => void }} p
 */
export function ChatDialog({ chatId, onClose, onOpenRoom }) {
  const { backend } = useSession();
  const chat = useChat(chatId);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [view, setView] = React.useState("chat"); // chat | block | report
  const [notice, setNotice] = React.useState(null); // { tone, text }
  const [busy, setBusy] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const sendingRef = React.useRef(false);
  const input = React.useRef(null);
  const end = React.useRef(null);
  const focused = React.useRef(false);

  const summary = chat.chat;
  const partnerName = summary?.partner?.public_name ?? "";
  const first = firstName(partnerName) || partnerName;
  const canSend = Boolean(summary?.can_send);
  const max = Number.isInteger(chat.max) && chat.max > 0 ? chat.max : null;

  React.useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [chat.messages.length, view]);
  React.useEffect(() => {
    if (chat.loaded && canSend && view === "chat" && !focused.current) {
      focused.current = true;
      input.current?.focus();
    }
  }, [chat.loaded, canSend, view]);

  const send = async (event) => {
    event?.preventDefault();
    if (sendingRef.current || !draft.trim()) return;
    sendingRef.current = true;
    setSending(true);
    const result = await chat.send(draft);
    if (result.ok) {
      setDraft("");
      setError("");
    } else {
      setError(result.reason);
      void chat.refresh(); // o resumo pode ter mudado (bloqueio, conta excluída)
    }
    sendingRef.current = false;
    setSending(false);
    input.current?.focus();
  };

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setNotice({ tone: "danger", text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  };

  const openRoom = () =>
    run(async () => {
      const res = await backend.rpc("app_dupla_chat_room", { p_chat_id: chatId });
      if (res?.room_id) onOpenRoom(res.room_id);
    });
  const setBlock = (block) =>
    run(async () => {
      chat.setChat(await backend.rpc("app_dupla_chat_block", { p_chat_id: chatId, p_block: block }));
      setView("chat");
      setError("");
      setNotice(block ? { tone: "success", text: `${partnerName} foi bloqueado(a) nesta conversa.` } : null);
    });
  const report = () =>
    run(async () => {
      await backend.rpc("app_dupla_chat_report", { p_chat_id: chatId, p_reason: reason.trim() || null });
      setReason("");
      setView("chat");
      setNotice({ tone: "success", text: "Denúncia enviada. A equipe vai analisar." });
    });

  const header = (
    <header className="dupla-chat__header">
      <span className="dupla-chat__avatar" aria-hidden="true">
        {initials(partnerName)}
      </span>
      <div className="dupla-chat__title">
        <small>CHAT DE ESTUDO</small>
        <h2>{partnerName || "Conversa"}</h2>
      </div>
      {summary && (
        <Button size="sm" variant="secondary" icon="arrow-right" disabled={!canSend} loading={busy && view === "chat"} onClick={openRoom}>
          Abrir sala
        </Button>
      )}
      <IconButton icon="x" label="Fechar chat" onClick={onClose} />
    </header>
  );

  let body;
  if (chat.error && !chat.loaded) {
    body = (
      <div className="dupla-chat__panel">
        <LoadError error={chat.error} retry={chat.refresh} />
      </div>
    );
  } else if (!chat.loaded) {
    body = (
      <div className="dupla-chat__panel">
        <Loading />
      </div>
    );
  } else if (view === "block") {
    body = (
      <div className="dupla-chat__panel">
        <h3>Bloquear {partnerName}?</h3>
        <p>Vocês não poderão trocar mensagens nem abrir sala por esta conversa. Você pode desbloquear quando quiser.</p>
        <div className="dupla-chat__actions">
          <Button variant="ghost" disabled={busy} onClick={() => setView("chat")}>
            Voltar
          </Button>
          <Button variant="danger" icon="ban" loading={busy} onClick={() => setBlock(true)}>
            Bloquear
          </Button>
        </div>
      </div>
    );
  } else if (view === "report") {
    body = (
      <div className="dupla-chat__panel">
        <h3>Denunciar conversa</h3>
        <p>
          A equipe do StaziaMed recebe uma cópia das mensagens desta conversa que ainda não se apagaram e analisa o caso. A outra pessoa não é
          avisada.
        </p>
        <Textarea label="O que aconteceu? (opcional)" rows={4} maxLength={REPORT_MAX} showCount value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="dupla-chat__actions">
          <Button variant="ghost" disabled={busy} onClick={() => setView("chat")}>
            Voltar
          </Button>
          <Button variant="danger" icon="flag" loading={busy} onClick={report}>
            Enviar denúncia
          </Button>
        </div>
      </div>
    );
  } else {
    const messages = chat.messages;
    body = (
      <>
        <div className="dupla-chat__log" role="log" aria-label="Mensagens do treino" aria-live="polite">
          <div className="dupla-chat__intro">
            <span className="dupla-chat__symbol" aria-hidden="true">
              <Icon name="handshake" size={23} />
            </span>
            <strong>Vocês têm o treino em comum.</strong>
            <p>Escolham a estação, combinem os papéis e comecem quando estiverem prontos.</p>
          </div>
          {messages.map((m) => (
            <div key={m.id} className={"dupla-chat__msg " + (m.mine ? "dupla-chat__msg--mine" : "dupla-chat__msg--theirs")}>
              <p>{m.body}</p>
              <small>{m.mine ? hora(m.created_at) : `${m.author} · ${hora(m.created_at)}`}</small>
            </div>
          ))}
          <div ref={end} />
        </div>
        {canSend ? (
          <form className="dupla-chat__composer" onSubmit={send}>
            {!messages.length && (
              <div className="dupla-chat__suggestions" aria-label="Sugestões de mensagem">
                {SUGGESTIONS.map((text) => (
                  <button
                    type="button"
                    key={text}
                    onClick={() => {
                      setDraft(text);
                      setError("");
                      input.current?.focus();
                    }}
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}
            {error && (
              <p className="dupla-chat__error" role="alert" id="dupla-chat-erro">
                <Icon name="shield" size={17} />
                {error}
              </p>
            )}
            <label htmlFor="dupla-chat-mensagem">Mensagem para {first}</label>
            <div className="dupla-chat__input">
              <textarea
                id="dupla-chat-mensagem"
                ref={input}
                rows={2}
                maxLength={max ?? undefined}
                value={draft}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "dupla-chat-nota dupla-chat-erro" : "dupla-chat-nota"}
                placeholder="Combine uma estação ou um horário…"
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button className="dupla-chat__send" type="submit" disabled={!draft.trim() || sending} aria-label="Enviar mensagem no chat">
                <Icon name="send" size={19} />
              </button>
            </div>
            <div className="dupla-chat__meta">
              <span id="dupla-chat-nota">As mensagens se apagam 24 horas depois de enviadas.</span>
              <span>{max ? `${draft.length}/${max}` : draft.length}</span>
            </div>
          </form>
        ) : (
          <div className="dupla-chat__composer">
            <Banner tone="warning" icon="message-circle-off">
              {summary?.blocked_by_me ? "Você bloqueou esta pessoa. Desbloqueie para enviar mensagens." : "Esta conversa não aceita novas mensagens."}
            </Banner>
          </div>
        )}
      </>
    );
  }

  return (
    <Dialog label={partnerName ? `Chat de estudo com ${partnerName}` : "Chat de estudo"} className="dupla-chat" onClose={onClose}>
      <style>{STYLE}</style>
      {header}
      <div className="dupla-chat__safety">
        <Icon name="shield" size={18} />
        <span className="dupla-chat__safety-text">Um espaço para treinar juntos. Sem ofensas, divulgação ou contatos externos.</span>
        {summary && summary.partner?.user_id && view === "chat" && (
          <span className="dupla-chat__tools">
            {summary.blocked_by_me ? (
              <button type="button" className="dupla-chat__tool" disabled={busy} onClick={() => setBlock(false)}>
                Desbloquear
              </button>
            ) : (
              <button type="button" className="dupla-chat__tool" disabled={busy} onClick={() => (setNotice(null), setView("block"))}>
                Bloquear
              </button>
            )}
            <button type="button" className="dupla-chat__tool" disabled={busy} onClick={() => (setNotice(null), setView("report"))}>
              Denunciar
            </button>
          </span>
        )}
      </div>
      {notice && (
        <div style={{ padding: "10px 24px 0" }}>
          <Banner tone={notice.tone}>{notice.text}</Banner>
        </div>
      )}
      {body}
    </Dialog>
  );
}
