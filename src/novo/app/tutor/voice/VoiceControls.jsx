// Rodapé do modo de voz: chat (sem desligar a voz), microfone (liga e desliga; não encerra) e fechar.
import React from "react";
import { Icon } from "../../../ds";

// closing: o professor está se despedindo; um toque em "Encerrar agora" pula a despedida.
export function VoiceControls({ muted, onToggleMute, chatOpen, onToggleChat, onClose, micDisabled = false, micRef = null, closing = false }) {
  return (
    <div className="svm__controls">
      <button type="button" className="svm__btn" aria-label={chatOpen ? "Fechar o chat" : "Abrir o chat e a transcrição"} aria-pressed={chatOpen} onClick={onToggleChat}>
        <Icon name="message-square-text" size={24} />
        <span className="svm__label" aria-hidden="true">Chat</span>
      </button>
      <button
        ref={micRef}
        type="button"
        className={`svm__btn svm__mic${muted ? " is-muted" : ""}`}
        aria-label={muted ? "Ligar o microfone" : "Desligar o microfone"}
        aria-pressed={muted}
        onClick={onToggleMute}
        disabled={micDisabled}
      >
        <Icon name={muted ? "mic-off" : "mic"} size={32} />
        <span className="svm__label" aria-hidden="true">Microfone</span>
      </button>
      <button type="button" className="svm__btn" aria-label={closing ? "Encerrar agora, sem esperar a despedida" : "Encerrar a conversa por voz"} onClick={onClose}>
        <Icon name="x" size={24} />
        <span className="svm__label" aria-hidden="true">{closing ? "Encerrar agora" : "Encerrar"}</span>
      </button>
    </div>
  );
}
