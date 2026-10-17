// Treino em Dupla · convite por link do @ (rota /novo/convite/<@>?estacao=<id>). Quem abre, com conta e acesso ao módulo, vê o
// cartão público do dono do @ e "Pedir para treinar com {nome}":
//  - dono online e livre: vira o convite direto de 60 s (quem pediu entra na sala e espera);
//  - dono fora do ar: vira um pedido de treino de 24 h, que aparece quando ele abrir o app.
// Sem conta o app mostra o cadastro/login nesta mesma rota (e guarda o convite para voltar depois). Sem acesso ao módulo, mensagem
// neutra. Bloqueio entre os dois ou @ inexistente: "Este convite não está disponível." (sem dizer qual). Nunca e-mail.
import React from "react";
import { Badge, Banner, Button, EmptyState, MatchCard, useToast } from "../../ds";
import { useSession } from "../session.jsx";
import { LoadError, Loading, messageOf, useLoad } from "../admin/common.jsx";
import { toCard } from "./card.js";
import { InviteWatcher } from "./MatchModal.jsx";
import { useDuplaChannel, useHeartbeat } from "./live.js";
import { installAudioWake } from "./sound.js";
import { duplaAllowed } from "./DuplaGate.jsx";

const firstName = (n) => String(n ?? "").trim().split(/\s+/)[0] || "a pessoa";

/** Sinal de presença e aviso de convite enquanto a pessoa está na tela (só com perfil de estudo): ela precisa estar online para
 *  receber o convite de 60 s quando o dono aceitar o pedido. */
function Live({ go, meName, radar }) {
  useHeartbeat("livre");
  const { inviteTick, live } = useDuplaChannel({ radar });
  React.useEffect(() => {
    installAudioWake();
  }, []);
  return <InviteWatcher go={go} meName={meName} inviteTick={inviteTick} live={live} />;
}

function Neutral({ go, title, description, plans }) {
  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <EmptyState
        icon="link-2-off"
        title={title}
        description={description}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {plans && (
              <Button variant="secondary" onClick={() => go("planos")}>
                Ver planos
              </Button>
            )}
            <Button onClick={() => go("home")}>Ir para o início</Button>
          </div>
        }
      />
    </div>
  );
}

/**
 * @param {{ go: (route: string, query?: Record<string, string>) => void, handle: string, stationId?: string | null }} p
 */
export function InviteLinkScreen({ go, handle, stationId = null }) {
  const { backend, boot, dupla } = useSession();
  const allowed = duplaAllowed(boot, dupla);
  const [toastNode, showToast] = useToast();
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(null); // { name, expires_at } depois de um pedido de 24 h
  const [needsProfile, setNeedsProfile] = React.useState(false);

  const lookup = useLoad(
    () => (allowed ? backend.rpc("app_dupla_link_lookup", { p_handle: handle, p_station_id: stationId ?? null }) : Promise.resolve(null)),
    [backend, allowed, handle, stationId],
  );
  const profile = useLoad(() => (allowed ? backend.rpc("app_dupla_profile") : Promise.resolve(null)), [backend, allowed]);

  if (!allowed) {
    return <Neutral go={go} title="Este convite não está disponível para a sua conta." description="Peça ao seu colega outro jeito de combinar o treino." plans />;
  }
  if (lookup.error && !lookup.data) {
    return /acesso/i.test(messageOf(lookup.error)) ? (
      <Neutral go={go} title="Este convite não está disponível para a sua conta." description="Peça ao seu colega outro jeito de combinar o treino." plans />
    ) : (
      <LoadError error={lookup.error} retry={lookup.reload} />
    );
  }
  if (lookup.loading || !lookup.data || profile.loading) return <Loading />;

  const r = lookup.data;
  const me = profile.data?.profile ?? null;
  if (!r.found) {
    return <Neutral go={go} title="Este convite não está disponível." description="O link pode ter sido trocado pela pessoa, ou não vale mais." />;
  }
  const person = r.person;
  const name = person.public_name;

  const request = async () => {
    if (sending) return;
    setSending(true);
    try {
      const res = await backend.rpc("app_dupla_link_request", { p_handle: handle, p_station_id: stationId ?? null });
      if (res?.kind === "convite" && res.room_id) {
        go("dupla-sala", { sala: res.room_id });
        return;
      }
      setSent({ name: res?.partner?.public_name ?? name, expires_at: res?.expires_at ?? null });
      void lookup.reload();
    } catch (e) {
      const text = messageOf(e);
      if (/perfil de estudo/i.test(text)) setNeedsProfile(true);
      showToast(text, "danger");
    } finally {
      setSending(false);
    }
  };

  const station = r.station;
  const minutes = station?.duration_ms ? Math.round(station.duration_ms / 60000) : null;
  let action;
  let note = null;
  if (r.self) {
    note = <Banner tone="brand" icon="link">Este é o seu link de convite. Envie para um colega pelo WhatsApp: ele só leva o seu @.</Banner>;
  } else if (sent || r.pending) {
    note = (
      <Banner tone="success" icon="send" title={`Pedido enviado a ${firstName(name)}`}>
        O pedido vale por 24 horas e aparece quando {firstName(name)} abrir o app. Se aceitar, você recebe o convite aqui. Deixe esta tela aberta ou volte ao Praticar.
      </Banner>
    );
  } else if (r.incoming) {
    note = <Banner tone="brand" icon="inbox">{`${firstName(name)} já pediu para treinar com você.`}</Banner>;
    action = <Button onClick={() => go("dupla")}>Ver em Praticar</Button>;
  } else if (r.mode === "indisponivel") {
    note = <Banner tone="warning" icon="user-x">{r.why_not === "Não recebe convites." ? `${firstName(name)} não recebe convites no momento.` : r.why_not}</Banner>;
  } else if (!me || needsProfile) {
    note = <Banner tone="brand" icon="user-pen">Para pedir um treino, crie antes o seu perfil de estudo: é o cartão que o colega vê.</Banner>;
    action = (
      <Button icon="user-pen" onClick={() => go("dupla-perfil")}>
        Criar meu perfil de estudo
      </Button>
    );
  } else {
    note = (
      <span style={{ font: "14px/1.5 var(--font-sans)", color: "var(--text-secondary)" }}>
        {r.mode === "convite"
          ? `${firstName(name)} está online agora. Ao pedir, o convite chega na hora e vocês treinam em seguida.`
          : `${firstName(name)} não está online agora. O pedido vale por 24 horas e aparece quando abrir o app.`}
      </span>
    );
    action = (
      <Button size="lg" icon="send" loading={sending} onClick={request}>
        {`Pedir para treinar com ${firstName(name)}`}
      </Button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 520, margin: "0 auto" }}>
      {toastNode}
      {me && !r.self && <Live go={go} meName={me.public_name} radar={me.radar_visible !== false} />}
      <div>
        <h2 style={{ margin: 0, font: "700 22px var(--font-sans)", color: "var(--text-primary)" }}>Convite para treinar</h2>
        <p style={{ margin: "4px 0 0", font: "14px var(--font-sans)", color: "var(--text-tertiary)" }}>Você abriu o link de {name}.</p>
      </div>
      {station && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 14px", borderRadius: "var(--radius-lg)", background: "var(--surface-brand-soft)", border: "1px solid var(--border-subtle)" }}>
          <Badge size="sm" tone="brand" icon="clipboard-list">{station.label}</Badge>
          {station.area && <Badge size="sm">{station.area}</Badge>}
          {minutes != null && <Badge size="sm" icon="timer">{`${minutes} min`}</Badge>}
        </div>
      )}
      <div style={{ pointerEvents: "none" }}>
        <MatchCard person={toCard(person)} />
      </div>
      {note}
      {action}
    </div>
  );
}
