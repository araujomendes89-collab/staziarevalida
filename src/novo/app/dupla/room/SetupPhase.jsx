// Fase "setup" no fluxo simples (dono, 19/10): sem prontidão, sem conexão e sem link (a conversa é por fora). O ator com a estação
// escolhida vai direto à "sala do avaliador" (RunningPhase antes do início, decidido em RoomScreen). Aqui ficam só:
//  - o ator ainda SEM estação (sala do match ou rodada nova): escolhe pela lista do Banco de estações;
//  - o candidato, de frente para a PORTA com o número da área (dono, 19/10) e SEM mais nada da estação (nem nome, número da
//    estação, área por escrito ou origem: o servidor nem manda, 014140). Sem estação escolhida: "O ator está escolhendo a
//    estação", sem porta (nunca há porta sem número).
import React from "react";
import { Button, Card, Icon } from "../../../ds";
import { OwnQuotaLine } from "../CreditHeader.jsx";
import { PairHeader, RoleBand, firstName, pageStyle } from "./parts.jsx";
import { Porta } from "./Porta.jsx";
import { StationPicker } from "./StationPicker.jsx";
import { useAudioBloqueado } from "../audioLiberado.js";

const status = { display: "flex", alignItems: "center", gap: 10, font: "600 var(--text-sm)/1.45 var(--font-sans)", color: "var(--text-primary)" };
const note = { margin: "10px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" };

/** Texto da espera do candidato: o servidor diz só se a estação já foi escolhida (`station_ready`), nunca qual é. */
export function candidateWaitText(room) {
  const ator = firstName(room.partner?.public_name) || "o ator";
  return room.station_ready ? `Aguardando ${ator} iniciar a estação` : "O ator está escolhendo a estação";
}

/**
 * "Ativar som do apito" (dono, 19/10): só na espera do candidato e só quando o navegador ainda não liberou o som (a sala aberta
 * por link, sem nenhum toque). Tocar destrava o áudio; com o som desligado ("sz-sound") ou sem áudio no aparelho, não aparece.
 */
function AtivarSomApito() {
  const [bloqueado, destravar] = useAudioBloqueado(true);
  const [ativado, setAtivado] = React.useState(false);
  if (!bloqueado && !ativado) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 14 }}>
      {bloqueado ? (
        <>
          <Button
            variant="secondary"
            icon="volume-2"
            aria-describedby="dupla-som-apito-dica"
            onClick={async () => {
              await destravar();
              setAtivado(true);
            }}
          >
            Ativar som do apito
          </Button>
          <span id="dupla-som-apito-dica" style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", textAlign: "center" }}>
            O navegador só toca o apito depois de um toque na tela.
          </span>
        </>
      ) : (
        <span role="status" style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>
          Som do apito ativado.
        </span>
      )}
    </div>
  );
}

export function SetupPhase({ room, actions, askLeave }) {
  const [picking, setPicking] = React.useState(false);
  const isEval = room.me.role === "evaluator";
  const partner = room.partner.public_name;
  const leave = () => (askLeave ? askLeave("sair") : actions.leave());

  return (
    <main style={pageStyle}>
      <PairHeader
        room={room}
        title={`Sala com ${partner}`}
        subtitle={isEval ? "Você é o ator: escolha a estação para começar." : "A conversa é por fora (WhatsApp, Meet ou ligação)."}
      />
      <RoleBand room={room} />
      <OwnQuotaLine roomId={room.id} />
      {isEval ? (
        <Card padding={20}>
          <div style={status}>
            <Icon name="clipboard-list" size={20} style={{ color: "var(--text-brand)" }} />
            Escolha a estação na lista do Banco de estações.
          </div>
          <p style={note}>{`${firstName(partner)} só vê a estação quando você iniciar o atendimento.`}</p>
          <div style={{ marginTop: 14 }}>
            <Button size="lg" icon="clipboard-list" onClick={() => setPicking(true)}>
              Escolher estação
            </Button>
          </div>
        </Card>
      ) : (
        <Card padding={20}>
          {room.station_ready && room.porta ? <Porta numero={room.porta} /> : null}
          <div role="status" style={{ ...status, justifyContent: "center", marginTop: room.station_ready && room.porta ? 14 : 0 }}>
            <Icon name="loader" size={20} style={{ color: "var(--text-brand)" }} />
            {candidateWaitText(room)}
          </div>
          <p style={{ ...note, textAlign: "center" }}>O enunciado aparece quando a porta abrir.</p>
          <AtivarSomApito />
        </Card>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="ghost" icon="log-out" onClick={leave}>
          Sair da sala
        </Button>
      </div>
      {picking && isEval && (
        <StationPicker
          roomId={room.id}
          title="Escolher estação"
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setPicking(false);
            actions.setStation(id);
          }}
        />
      )}
    </main>
  );
}
