// Legenda (aparece aos poucos, enquanto se fala) e o painel de chat/transcrição do modo de voz. O chat é a MESMA conversa: o aluno
// pode falar, digitar e voltar a falar sem desligar a voz.
import React from "react";
import { Icon } from "../../../ds";

/** Legenda (só com "Legendas" ligado): a fala do professor e, menor, a do aluno, numa faixa própria embaixo do personagem. */
export function VoiceCaptions({ show, captions }) {
  if (!show) return null;
  const tutor = (captions?.tutor ?? "").trim();
  const student = (captions?.student ?? "").trim();
  if (!tutor && !student) return <div className="svm__captions" aria-hidden="true" />;
  return (
    <div className="svm__captions">
      {tutor}
      {student && <small>Você: {student}</small>}
    </div>
  );
}

export function VoiceChatSheet({ messages, onSend, onClose, showCaptions, onToggleCaptions, volume, onVolume, canSend }) {
  const [text, setText] = React.useState("");
  const end = React.useRef(null);
  const input = React.useRef(null);
  React.useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length]);
  React.useEffect(() => {
    input.current?.focus?.();
  }, []);
  const submit = (e) => {
    e.preventDefault();
    if (!text.trim() || !canSend) return;
    if (onSend(text.trim()) !== false) setText("");
  };
  return (
    <section className="svm__sheet" aria-label="Chat e transcrição da conversa">
      <div className="svm__sheet-head">
        <span>Conversa</span>
        <button type="button" className="svm__btn" style={{ width: 40, height: 40 }} aria-label="Fechar o chat" onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="svm__msgs" aria-live="polite">
        {messages.length === 0 && <span style={{ color: "var(--svm-faint)", font: "400 14px var(--font-sans, system-ui)" }}>A transcrição aparece aqui enquanto vocês conversam.</span>}
        {messages.map((m) => (
          <div key={m.id} className={`svm__msg is-${m.role === "tutor" ? "tutor" : "student"}`}>
            <span className="svm-sr">{m.role === "tutor" ? "Tutor: " : "Você: "}</span>
            {m.content}
          </div>
        ))}
        <div ref={end} />
      </div>
      <label className="svm__row">
        <input type="checkbox" checked={showCaptions} onChange={(e) => onToggleCaptions(e.target.checked)} />
        Legendas na tela
      </label>
      <label className="svm__row">
        <Icon name="volume-2" size={18} />
        <span className="svm-sr">Volume do professor</span>
        <input type="range" min="0" max="1" step="0.05" value={volume} aria-label="Volume do professor" onChange={(e) => onVolume(Number(e.target.value))} />
      </label>
      <form className="svm__form" onSubmit={submit}>
        <input ref={input} type="text" aria-label="Escrever para o Tutor" placeholder={canSend ? "Escreva para o Tutor…" : "Conectando…"} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="svm__send" disabled={!canSend || !text.trim()}>
          Enviar
        </button>
      </form>
    </section>
  );
}
