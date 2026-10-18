// Linha de estado do modo de voz. Só palavras para o aluno: nada de detalhe técnico da API.
import React from "react";

export const STATUS_LABEL = {
  idle: "Preparando...",
  connecting: "Conectando...",
  ready: "Pronto",
  listening: "Ouvindo...",
  interrupted: "Ouvindo...",
  thinking: "Pensando...",
  speaking: "Falando...",
  paused: "Pausado",
  reconnecting: "Reconectando...",
  ended: "Conversa encerrada",
  closing: "Se despedindo...",
  error: "A conversa por voz parou",
};

export function statusText({ state, muted = false }) {
  // erro: a explicação e as saídas ficam no quadro de erro; aqui só o estado
  if (muted && ["ready", "listening", "interrupted"].includes(state)) return "Microfone desligado";
  return STATUS_LABEL[state] ?? "";
}

export function VoiceStatus({ state, muted }) {
  return (
    <p className="svm__status" role="status" aria-live="polite">
      {statusText({ state, muted })}
    </p>
  );
}
