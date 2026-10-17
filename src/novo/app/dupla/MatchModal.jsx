// Treino em Dupla · "Deu match!" e o convite de quem escolheu "Estudar junto" primeiro.
// Porte de Match.jsx do pacote de design (89-118) com o Dialog e as cores do app. "Enviar mensagem" abre o chat de estudo do par
// (pacote de 11/10, Etapa C); "Agendar sessão" continua fora. O pacote usa a fanfarra ao abrir e o botão de som no canto.
import React from "react";
import { Avatar as DsAvatar, Badge, Button, Dialog, Icon, ProgressBar, useToast } from "../../ds";
import { useSession } from "../session.jsx";
import { messageOf } from "../admin/common.jsx";
import { firstName } from "./deck.js";
import { useInvites, useRequests } from "./live.js";
import { playMatchSound, setSoundOn, soundOn } from "./sound.js";
import { useChatWindows } from "./chat/ChatList.jsx";

// Animações do pacote (components.css:174-181), só com nomes novos; a janela deixa o confete sair da caixa.
const STYLE = `
.dupla-match{position:relative;max-width:420px;overflow:visible}
.dupla-match .sm-dialog__body{overflow:visible;padding:8px 8px calc(24px + env(safe-area-inset-bottom,0px))}
@keyframes dupla-pop-in{0%{opacity:0;transform:scale(.6) translateY(20px)}60%{opacity:1;transform:scale(1.04)}100%{transform:scale(1)}}
@keyframes dupla-slide-l{0%{opacity:0;transform:translateX(-90px) rotate(-12deg)}70%{opacity:1;transform:translateX(6px)}100%{transform:none}}
@keyframes dupla-slide-r{0%{opacity:0;transform:translateX(90px) rotate(12deg)}70%{opacity:1;transform:translateX(-6px)}100%{transform:none}}
@keyframes dupla-badge-pop{0%,40%{opacity:0;transform:scale(0) rotate(-40deg)}75%{opacity:1;transform:scale(1.35) rotate(8deg)}100%{transform:scale(1)}}
@keyframes dupla-ring{0%{transform:scale(.4);opacity:.7}100%{transform:scale(2.6);opacity:0}}
@keyframes dupla-rise{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:none}}
@keyframes dupla-confetti{0%{opacity:1;transform:translate(0,0) rotate(0)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(var(--rot))}}
@media (prefers-reduced-motion:reduce){.dupla-match *{animation:none!important}}
`;

const CONFETTI_COLORS = ["var(--green-200)", "var(--teal-500)", "var(--amber-500)", "var(--blue-600)", "var(--red-600)", "var(--violet-600)"];

function initials(name) {
  return String(name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toUpperCase();
}

function Avatar({ name, animation }) {
  return (
    <span
      style={{
        width: 72, height: 72, borderRadius: "50%", background: "var(--teal-600)", color: "var(--gray-0)", display: "inline-flex", alignItems: "center",
        justifyContent: "center", font: "700 28px var(--font-sans)", boxShadow: "0 0 0 4px var(--surface-card)", animation: animation + " 620ms cubic-bezier(.2,.8,.2,1) both",
      }}
    >
      {initials(name)}
    </span>
  );
}

/**
 * "Deu match!": a fanfarra toca na montagem; o botão do canto liga e desliga o som (guardado neste aparelho).
 * `onClose` serve para "Continuar buscando", Esc e clique no fundo. Com `onMessage`, aparece "Enviar mensagem" (abre o chat).
 */
export function MatchModal({ meName, partnerName, busy = false, onOpen, onMessage, onClose }) {
  const [sound, setSound] = React.useState(() => soundOn());
  React.useEffect(() => {
    playMatchSound();
  }, []);
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setSoundOn(next);
    if (next) playMatchSound();
  };
  const confetti = React.useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const angle = (i / 26) * Math.PI * 2 + Math.random() * 0.3;
        const radius = 120 + Math.random() * 90;
        return {
          dx: Math.cos(angle) * radius + "px",
          dy: Math.sin(angle) * radius + 60 + "px",
          rot: Math.random() * 540 - 270 + "deg",
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          w: 6 + Math.random() * 6,
          delay: 0.35 + Math.random() * 0.25,
          round: i % 3 === 0,
        };
      }),
    [],
  );
  const handleClose = () => {
    if (!busy && onClose) onClose();
  };
  const ring = (size, color, ms, delay) => (
    <span
      aria-hidden="true"
      style={{ position: "absolute", left: "50%", top: "50%", width: 60, height: 60, margin: "-30px 0 0 -30px", borderRadius: "50%", border: `${size}px solid ${color}`, animation: `dupla-ring ${ms}ms ${delay}ms ease-out both` }}
    />
  );

  return (
    <Dialog label="Deu match!" className="dupla-match" onClose={handleClose}>
      <style>{STYLE}</style>
      <div style={{ textAlign: "center", padding: "24px 24px 0" }}>
        <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", height: 80 }}>
          {ring(3, "var(--green-200)", 900, 420)}
          {ring(2, "var(--teal-300)", 1100, 600)}
          {confetti.map((p, i) => (
            <span
              key={i}
              aria-hidden="true"
              style={{
                position: "absolute", left: "50%", top: "40%", width: p.w, height: p.round ? p.w : p.w * 1.6, borderRadius: p.round ? "50%" : 2, background: p.color,
                "--dx": p.dx, "--dy": p.dy, "--rot": p.rot, opacity: 0, animation: `dupla-confetti 1200ms ${p.delay}s cubic-bezier(.15,.6,.3,1) both`,
              }}
            />
          ))}
          <Avatar name={meName} animation="dupla-slide-l" />
          <span
            style={{
              width: 44, height: 44, margin: "0 -10px", zIndex: 1, borderRadius: "50%", background: "var(--teal-500)", color: "var(--gray-0)", display: "inline-flex",
              alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 3px var(--surface-card)", animation: "dupla-badge-pop 700ms cubic-bezier(.2,.8,.2,1) both",
            }}
          >
            <Icon name="handshake" size={20} />
          </span>
          <Avatar name={partnerName} animation="dupla-slide-r" />
        </div>
        <h2 style={{ margin: "18px 0 8px", font: "800 30px/1.1 var(--font-sans)", letterSpacing: "-.02em", color: "var(--text-primary)", animation: "dupla-pop-in 500ms 380ms cubic-bezier(.2,.8,.2,1) both" }}>
          Deu match!
        </h2>
        <p style={{ margin: "0 0 20px", font: "16px/1.55 var(--font-sans)", color: "var(--text-secondary)", animation: "dupla-rise 400ms 520ms ease-out both" }}>
          Você e {firstName(partnerName)} querem treinar a 2ª fase. Combinem a primeira sessão.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, animation: "dupla-rise 400ms 640ms ease-out both" }}>
          <Button size="lg" fullWidth icon="video" loading={busy} onClick={onOpen}>
            Abrir sala agora
          </Button>
          {onMessage && (
            <Button size="lg" fullWidth variant="ghost" icon="message-circle" disabled={busy} onClick={onMessage}>
              Enviar mensagem
            </Button>
          )}
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            style={{ border: 0, background: "transparent", cursor: busy ? "default" : "pointer", font: "600 15px var(--font-sans)", color: "var(--text-brand)", padding: 8, opacity: busy ? 0.6 : 1 }}
          >
            Continuar buscando
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={toggleSound}
        aria-label={sound ? "Desativar som" : "Ativar som"}
        title={sound ? "Som ligado" : "Som desligado"}
        style={{
          position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: "50%", border: 0, background: "var(--surface-sunken)", color: "var(--text-tertiary)",
          cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon name={sound ? "volume-2" : "volume-x"} size={16} />
      </button>
    </Dialog>
  );
}

const INVITE_TTL_S = 60;

/**
 * Convite direto do radar (kind "direto"): "{nome} convidou você para treinar", a estação (só "Estação N", a área e a duração: o
 * convidado ainda pode ser o candidato, então o tema não aparece), contagem dos 60 s, "Aceitar" e "Agora não". O som é o do
 * "Deu match!" (desligável), sem a fanfarra visual. Esc e clique no fundo valem "Agora não".
 * @param {{ invite: { from?: { public_name?: string }, station?: { label?: string, area?: string, duration_ms?: number } | null, expires_at: string },
 *   busy?: boolean, nowMs: number, onAccept(): void, onDecline(): void }} p
 */
export function DirectInviteDialog({ invite, busy = false, nowMs, onAccept, onDecline }) {
  React.useEffect(() => {
    playMatchSound();
  }, []);
  const name = invite.from?.public_name ?? "";
  const station = invite.station ?? null;
  const left = Math.max(0, Math.ceil((Date.parse(invite.expires_at) - nowMs) / 1000));
  const minutes = station?.duration_ms ? Math.round(station.duration_ms / 60000) : null;
  const handleClose = () => {
    if (!busy) onDecline();
  };
  return (
    <Dialog
      title={`${name} convidou você para treinar`}
      onClose={handleClose}
      actions={
        <>
          <Button variant="ghost" disabled={busy} onClick={onDecline}>
            Agora não
          </Button>
          <Button icon="check" loading={busy} onClick={onAccept}>
            Aceitar
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "14px 0 16px", padding: 14, background: "var(--surface-sunken)", borderRadius: 12 }}>
        <DsAvatar name={name} size={48} />
        <div style={{ minWidth: 0 }}>
          <div style={{ font: "600 16px var(--font-sans)", color: "var(--text-primary)" }}>{name}</div>
          {station ? (
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <Badge size="sm" tone="brand">{station.label}</Badge>
              {station.area && <Badge size="sm">{station.area}</Badge>}
              {minutes != null && <Badge size="sm" icon="timer">{`${minutes} min`}</Badge>}
            </div>
          ) : (
            <div style={{ font: "13px var(--font-sans)", color: "var(--text-tertiary)", marginTop: 4 }}>A estação se escolhe na sala.</div>
          )}
        </div>
      </div>
      <ProgressBar label="O convite expira em" valueLabel={`${left} s`} value={left} max={INVITE_TTL_S} color={left <= 10 ? "var(--warning-solid)" : "var(--action-primary)"} />
    </Dialog>
  );
}

/**
 * Pedido de treino por link (vale 24 h): "{nome} pediu para treinar com você", com o @, a estação (só "Estação N", a área e a
 * duração) e "Aceitar" / "Agora não". Esc ou clique no fundo só fecham o aviso (o pedido continua valendo); "Agora não" encerra.
 */
export function RequestDialog({ request, busy = false, onAccept, onDecline, onDismiss }) {
  const name = request.from?.public_name ?? "";
  const station = request.station ?? null;
  const minutes = station?.duration_ms ? Math.round(station.duration_ms / 60000) : null;
  return (
    <Dialog
      title={`${name} pediu para treinar com você`}
      onClose={() => {
        if (!busy) onDismiss();
      }}
      actions={
        <>
          <Button variant="ghost" disabled={busy} onClick={onDecline}>
            Agora não
          </Button>
          <Button icon="check" loading={busy} onClick={onAccept}>
            Aceitar
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "14px 0 12px", padding: 14, background: "var(--surface-sunken)", borderRadius: 12 }}>
        <DsAvatar name={name} size={48} />
        <div style={{ minWidth: 0 }}>
          <div style={{ font: "600 16px var(--font-sans)", color: "var(--text-primary)" }}>{name}</div>
          {request.from?.handle && <div style={{ font: "500 12px var(--font-mono)", color: "var(--text-tertiary)" }}>{`@${request.from.handle}`}</div>}
          {station && (
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <Badge size="sm" tone="brand">{station.label}</Badge>
              {station.area && <Badge size="sm">{station.area}</Badge>}
              {minutes != null && <Badge size="sm" icon="timer">{`${minutes} min`}</Badge>}
            </div>
          )}
        </div>
      </div>
      <p style={{ margin: 0, font: "13px/1.5 var(--font-sans)", color: "var(--text-tertiary)" }}>
        Ao aceitar, a sala abre e {name.split(/\s+/)[0] || "a pessoa"} recebe o convite na hora.
      </p>
    </Dialog>
  );
}

/**
 * Convite de quem deu o primeiro "Estudar junto" (a outra pessoa completou o match) ou convite direto do radar (kind "direto", janela própria). O mais novo no prazo abre o "Deu match!":
 * "Abrir sala agora" aceita e vai à sala; "Continuar buscando" ou Esc recusa. O mesmo componente vale no Praticar e no Perfil.
 * Com `paused` (outra janela aberta na tela, como o chat) o convite espera a janela fechar.
 * @param {{ go: (route: string, query?: Record<string, string>) => void, meName: string, inviteTick: number, live: boolean, paused?: boolean }} p
 */
export function InviteWatcher({ go, meName, inviteTick, live, paused = false }) {
  const { backend } = useSession();
  const { invites, serverNow, refresh } = useInvites(inviteTick, live);
  const [answered, setAnswered] = React.useState(() => new Set());
  const { requests, refresh: refreshRequests } = useRequests(inviteTick);
  const [dismissed, setDismissed] = React.useState(() => new Set());
  const [busy, setBusy] = React.useState(false);
  const [, bump] = React.useState(0);
  const [toastNode, showToast] = useToast();
  const chat = useChatWindows({ go, onError: (text) => showToast(text, "danger") });

  // Relógio do servidor: o prazo do convite vem de `expires_at` (do servidor), então a hora do aparelho é corrigida pela diferença.
  const offset = React.useMemo(() => {
    const server = serverNow ? Date.parse(serverNow) : NaN;
    return Number.isNaN(server) ? 0 : server - Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverNow]);
  const nowMs = Date.now() + offset;
  const open = invites
    .filter((i) => !answered.has(i.id) && Date.parse(i.expires_at) > nowMs)
    .sort((a, b) => Date.parse(b.expires_at) - Date.parse(a.expires_at));
  const invite = open[0] ?? null;

  // Convite direto na tela: a contagem dos 60 s anda a cada segundo.
  const isDirect = invite?.kind === "direto";
  React.useEffect(() => {
    if (!isDirect) return undefined;
    const timer = setInterval(() => bump((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [isDirect, invite?.id]);

  // Quando o convite que está na tela vence, ele sai (sem esperar a próxima consulta).
  const expiresAt = invite ? Date.parse(invite.expires_at) : null;
  React.useEffect(() => {
    if (expiresAt == null) return undefined;
    const timer = setTimeout(() => bump((n) => n + 1), Math.max(0, expiresAt - (Date.now() + offset)) + 20);
    return () => clearTimeout(timer);
  }, [expiresAt, offset]);

  const respond = async (accept) => {
    if (!invite || busy) return;
    setBusy(true);
    try {
      const result = await backend.rpc("app_dupla_answer_invite", { p_invite_id: invite.id, p_accept: accept });
      setAnswered((prev) => new Set(prev).add(invite.id));
      if (accept && result?.room_id) go("dupla-sala", { sala: result.room_id });
      else void refresh();
    } catch (e) {
      setAnswered((prev) => new Set(prev).add(invite.id));
      showToast(messageOf(e), "danger");
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  // Pedidos de treino por link: só aparecem quando não há convite na tela; fechar o aviso não recusa o pedido.
  const request = invite ? null : requests.find((r) => !dismissed.has(r.id) && Date.parse(r.expires_at) > nowMs) ?? null;
  const answerRequest = async (accept) => {
    if (!request || busy) return;
    setBusy(true);
    try {
      const result = await backend.rpc("app_dupla_answer_request", { p_request_id: request.id, p_accept: accept });
      setDismissed((prev) => new Set(prev).add(request.id));
      if (accept && result?.room_id) go("dupla-sala", { sala: result.room_id });
      else void refreshRequests();
    } catch (e) {
      showToast(messageOf(e), "danger");
      setDismissed((prev) => new Set(prev).add(request.id));
      void refreshRequests();
    } finally {
      setBusy(false);
    }
  };

  // "Enviar mensagem": o convite sai da tela sem ser recusado (vence sozinho em 60 s, ou vira aceito pelo "Abrir sala" do chat).
  const message = async () => {
    if (!invite || busy) return;
    const partnerId = invite.from?.user_id;
    setAnswered((prev) => new Set(prev).add(invite.id));
    if (partnerId) await chat.openWith(partnerId);
  };

  return (
    <>
      {toastNode}
      {invite && !chat.chatOpen && !paused && invite.kind === "direto" && (
        <DirectInviteDialog key={invite.id} invite={invite} busy={busy} nowMs={nowMs} onAccept={() => respond(true)} onDecline={() => respond(false)} />
      )}
      {invite && !chat.chatOpen && !paused && invite.kind !== "direto" && (
        <MatchModal key={invite.id} meName={meName} partnerName={invite.from?.public_name ?? ""} busy={busy} onOpen={() => respond(true)} onMessage={message} onClose={() => respond(false)} />
      )}
      {request && !chat.chatOpen && !paused && (
        <RequestDialog
          key={request.id}
          request={request}
          busy={busy}
          onAccept={() => answerRequest(true)}
          onDecline={() => answerRequest(false)}
          onDismiss={() => setDismissed((prev) => new Set(prev).add(request.id))}
        />
      )}
      {chat.node}
    </>
  );
}
