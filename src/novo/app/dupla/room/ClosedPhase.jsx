// Fase "closed": a sala foi encerrada. O motivo vem gravado no servidor (`closed_reason`, `closed_by`).
// Encerrada por mim: volta direto ao Praticar (quem decide isso é RoomScreen); aqui fica o botão para quem chega depois.
import React from "react";
import { Button, EmptyState } from "../../../ds";
import { useSession } from "../../session.jsx";
import { isStaffRole } from "../../admin/common.jsx";
import { invitedStationOf } from "../radarApi.js";
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

/**
 * Estação para oferecer "Treinar sozinho esta estação": só quando o convite foi recusado ou venceu. A sala traz o id da estação só
 * para quem pode saber o nome; quem mandou o convite no radar escolheu a estação, e este aparelho a guardou (radarApi.js).
 */
export function soloStationOf(room) {
  if (room.closed_reason !== "convite_recusado" && room.closed_reason !== "convite_expirado") return null;
  return room.station?.id ?? invitedStationOf(room.id);
}

export function ClosedPhase({ room, go }) {
  const { boot } = useSession();
  // GANCHO (junção com o treino sozinho): hoje o treino sozinho é só da equipe (mesma regra do Banco de estações). Quando o
  // acesso do sozinho mudar, trocar `canSolo` pela regra nova.
  const canSolo = isStaffRole(boot?.role);
  const soloStation = canSolo ? soloStationOf(room) : null;
  return (
    <main style={{ ...pageStyle, maxWidth: 560, justifyContent: "center", flex: 1 }}>
      <EmptyState
        icon="door-closed"
        title={closedMessage(room)}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {soloStation && (
              <Button variant="secondary" icon="user" onClick={() => go("estacao", { id: soloStation })}>
                Treinar sozinho esta estação
              </Button>
            )}
            <Button icon="arrow-left" onClick={() => go("dupla")}>
              Voltar para Praticar
            </Button>
          </div>
        }
      />
    </main>
  );
}
