// Fase "closed": a sala foi encerrada. O motivo vem gravado no servidor (`closed_reason`, `closed_by`).
// Encerrada por mim: volta direto ao Praticar (quem decide isso é RoomScreen); aqui fica o botão para quem chega depois.
import React from "react";
import { Button, EmptyState } from "../../../ds";
import { pageStyle } from "./parts.jsx";

/**
 * Texto de cada motivo (Tarefa 9 do plano):
 *  saiu pelo parceiro → "Treino encerrado por {nome}."; convite_recusado / convite_expirado → "{nome} não entrou na sala.";
 *  sem_sinal → "Treino encerrado."
 * @param {object} room RoomState
 * @returns {string}
 */
export function closedMessage(room) {
  const partner = room.partner?.public_name;
  switch (room.closed_reason) {
    case "saiu": {
      const by = room.closed_by;
      return by && !by.me && by.public_name ? `Treino encerrado por ${by.public_name}.` : "Treino encerrado.";
    }
    case "convite_recusado":
    case "convite_expirado":
      return partner ? `${partner} não entrou na sala.` : "Treino encerrado.";
    default:
      return "Treino encerrado.";
  }
}

export function ClosedPhase({ room, go }) {
  return (
    <main style={{ ...pageStyle, maxWidth: 560, justifyContent: "center", flex: 1 }}>
      <EmptyState
        icon="door-closed"
        title={closedMessage(room)}
        action={
          <Button icon="arrow-left" onClick={() => go("dupla")}>
            Voltar para Praticar
          </Button>
        }
      />
    </main>
  );
}
