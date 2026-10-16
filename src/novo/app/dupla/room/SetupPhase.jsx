// Fase "setup" (Setup.jsx:28-88 do protótipo): link da chamada, prontidão, cronômetro e leitura prévia do avaliador.
import React from "react";
import { Avatar, Badge, Button, Card, Icon, IconButton, SegmentedControl, TextField, useToast } from "../../../ds";
import { formatDecimal } from "../../../ds/format.js";
import { splitActorScript, splitBlocks, splitTasks } from "../content.js";
import { ActorScript, CardBlock, PairHeader, RoleBand, Scene, firstName, pageStyle, stationTitle } from "./parts.jsx";

const LINK_RE = /^https:\/\/[^\s/.]+\.[^\s]+$/;
const clock = (ms) => {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const overline = { font: "var(--type-overline)", letterSpacing: "var(--tracking-overline)", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 6 };
const label = { font: "var(--type-label)", color: "var(--text-primary)", marginBottom: 6 };

function LinkCard({ room, actions }) {
  const [toast, show] = useToast();
  const [draft, setDraft] = React.useState(room.call_link || "");
  const [error, setError] = React.useState("");
  React.useEffect(() => setDraft(room.call_link || ""), [room.call_link]);
  const link = room.call_link;

  const share = () => {
    if (!LINK_RE.test(draft.trim())) {
      setError("Use um endereço válido começando com https://");
      return;
    }
    setError("");
    actions.setLink(draft.trim());
    show("Link compartilhado com a dupla");
  };
  const copy = () => {
    try {
      const done = navigator.clipboard?.writeText(link);
      Promise.resolve(done).catch(() => {});
    } catch {
      /* sem permissão para copiar: o aviso abaixo só aparece se der certo */
    }
    show("Link copiado");
  };

  return (
    <CardBlock title="1. Conectar com meu parceiro" action={<Badge size="sm" icon="external-link">Chamada externa</Badge>}>
      {toast}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px" }}>
          <TextField
            label="Link da reunião"
            icon="link"
            placeholder="https://meet.google.com/abc-defg-hij"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            error={error}
            hint="Meet, Zoom, Teams, WhatsApp ou outra ferramenta. O Stazia não acessa sua câmera nem o microfone."
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 26 }}>
          <Button icon="send" onClick={share}>{link ? "Atualizar link" : "Compartilhar link"}</Button>
          <IconButton icon="copy" label="Copiar link" variant="secondary" disabled={!link} onClick={copy} />
          <Button variant="secondary" icon="external-link" disabled={!link} onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>
            Abrir chamada
          </Button>
        </div>
      </div>
    </CardBlock>
  );
}

function ReadyCard({ room, actions }) {
  const people = [
    [`${room.me.public_name} (você)`, room.me.public_name, room.me.ready],
    [room.partner.public_name, room.partner.public_name, room.partner.ready],
  ];
  return (
    <CardBlock title="2. Prontidão">
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {people.map(([shown, name, ready]) => (
          <div
            key={shown}
            style={{
              flex: "1 1 220px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              background: ready ? "var(--success-bg)" : "var(--surface-sunken)",
            }}
          >
            <Avatar name={name} size={32} />
            <span style={{ flex: 1, font: "600 var(--text-sm) var(--font-sans)", color: "var(--text-primary)" }}>{shown}</span>
            <Badge size="sm" tone={ready ? "success" : "neutral"} icon={ready ? "check" : "clock"}>{ready ? "Pronto" : "Aguardando"}</Badge>
          </div>
        ))}
        <Button variant="secondary" icon={room.me.ready ? "x" : "hand"} onClick={() => actions.setReady(!room.me.ready)}>
          {room.me.ready ? (room.partner.ready ? "Cancelar" : "Pronto · aguardando o colega") : "Estou pronto para iniciar"}
        </Button>
      </div>
    </CardBlock>
  );
}

function ClockCard({ room, official, actions }) {
  const duration = room.duration_ms;
  const reduced = duration !== official;
  const isEval = room.me.role === "evaluator";
  const big = { font: "600 34px/1 var(--font-mono)", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" };

  if (!isEval) {
    return (
      <CardBlock title="3. Cronômetro">
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={big}>{clock(duration)}</div>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            {reduced ? "Tempo reduzido pelo avaliador" : "Tempo oficial"} · definido por {firstName(room.partner.public_name)} (avaliador)
          </div>
        </div>
      </CardBlock>
    );
  }
  const options = [
    ["Oficial", official],
    ["−1 min", official - 60000],
    ["−2 min", official - 120000],
    ["−3 min", official - 180000],
  ].map(([text, ms]) => ({ value: String(ms), label: text, disabled: ms < 60000 }));
  return (
    <CardBlock title="3. Cronômetro" action={reduced ? <Badge size="sm" tone="warning" icon="timer-reset">Tempo reduzido</Badge> : <Badge size="sm" tone="brand">Tempo oficial</Badge>}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <IconButton icon="minus" label="Reduzir 30 segundos" variant="secondary" disabled={duration <= 60000} onClick={() => actions.setDuration(Math.max(60000, duration - 30000))} />
          <div style={{ minWidth: 120, textAlign: "center" }}>
            <div style={big}>{clock(duration)}</div>
            <div style={{ font: "var(--text-xs) var(--font-sans)", color: "var(--text-secondary)", marginTop: 6 }}>
              {reduced ? `−${formatDecimal((official - duration) / 60000, 1)} min do oficial` : `oficial: ${formatDecimal(official / 60000, Number.isInteger(official / 60000) ? 0 : 1)} min`}
            </div>
          </div>
          <IconButton icon="plus" label="Aumentar 30 segundos" variant="secondary" disabled={duration >= official} onClick={() => actions.setDuration(Math.min(official, duration + 30000))} />
        </div>
        <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>Desafio de tempo</div>
          <SegmentedControl fullWidth label="Duração" value={String(duration)} onChange={(v) => actions.setDuration(Number(v))} options={options} />
          <div style={{ font: "var(--text-xs) var(--font-sans)", color: "var(--text-secondary)" }}>
            Treine com menos tempo para ganhar ritmo de prova. A nota não muda; o tempo usado fica registrado no resultado.
          </div>
        </div>
      </div>
    </CardBlock>
  );
}

function PreReading({ room, content }) {
  const st = content?.station;
  if (!st) return null;
  const station = room.station;
  const tasks = splitTasks(st.doctor_tasks);
  const initial = content.pressings.filter((p) => p.initially_visible);
  const releasable = content.pressings.filter((p) => !p.initially_visible);
  return (
    <CardBlock title="Leitura prévia do avaliador" action={<Badge size="sm" tone="actor" icon="eye-off">O candidato não vê</Badge>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, font: "var(--type-body-sm)", lineHeight: 1.6, color: "var(--text-primary)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--role-actor-soft)",
            color: "var(--role-actor-ink)",
            font: "600 var(--text-sm) var(--font-sans)",
          }}
        >
          <Icon name="book-open" size={16} />
          Leia o cenário e o roteiro antes de iniciar. O cronômetro só começa quando você clicar em Iniciar estação.
        </div>
        <div>
          <div style={overline}>{(station?.number ?? st.number) != null ? `Estação ${station?.number ?? st.number} · ${st.area}` : st.area}</div>
          <div style={{ font: "700 var(--text-base) var(--font-sans)", color: "var(--text-primary)", marginBottom: 6 }}>{st.name}</div>
          <Scene blocks={splitBlocks(st.doctor_scene)} />
        </div>
        {tasks.length > 0 && (
          <div>
            <div style={label}>Tarefas do candidato</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{tasks.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        )}
        <div>
          <div style={label}>Roteiro do ator</div>
          <ActorScript
            script={splitActorScript(st.actor_script)}
            fallback="O roteiro do ator não consta nos documentos enviados. Use o cenário, os impressos e o checklist PEP como referência."
          />
        </div>
        {initial.length > 0 && (
          <div>
            <div style={label}>Visíveis ao candidato desde o início</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {initial.map((p) => (
                <Badge key={p.id} size="md" icon="file-text">{pressingLabel(p)}</Badge>
              ))}
            </div>
          </div>
        )}
        {releasable.length > 0 && (
          <div>
            <div style={label}>Impressos que você vai liberar</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {releasable.map((p) => (
                <Badge key={p.id} size="md" icon="file-text">{pressingLabel(p)}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </CardBlock>
  );
}

/** "Impresso {tela} · {nome}"; quando o número da prova é outro: "· no documento oficial: Impresso {origem}" (só o avaliador). */
function pressingLabel(p) {
  const shown = p.display_number ?? p.index;
  const source = p.source_number != null && p.source_number !== shown ? ` · no documento oficial: Impresso ${p.source_number}` : "";
  return `Impresso ${shown} · ${p.name}${source}`;
}

/** Candidato: só "Estação N · Área", sem o tema; o enunciado aparece quando o avaliador iniciar (pacote: Sala · Configuração). */
function CandidateWaiting({ room }) {
  const station = room.station;
  if (!station) return null;
  return (
    <Card padding={20}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Icon name="stethoscope" size={22} style={{ color: "var(--text-brand)" }} />
        <div style={{ ...overline, marginBottom: 0 }}>{stationTitle(station)}</div>
      </div>
      <p style={{ margin: "10px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>O enunciado aparece quando o avaliador iniciar a estação.</p>
    </Card>
  );
}

export function SetupPhase({ room, content, actions }) {
  const isEval = room.me.role === "evaluator";
  const both = room.me.ready && room.partner.ready;
  const official = content?.station?.duration_ms ?? room.station?.duration_ms ?? room.duration_ms;
  const partner = room.partner.public_name;

  return (
    <main style={pageStyle}>
      <PairHeader
        room={room}
        title={`Sala com ${partner}`}
        subtitle="Conecte-se pela chamada externa e confirmem a prontidão."
        right={!both && <Badge tone="warning">Aguardando prontidão</Badge>}
      />
      <RoleBand room={room} />
      <LinkCard room={room} actions={actions} />
      <ReadyCard room={room} actions={actions} />
      <ClockCard room={room} official={official} actions={actions} />
      {isEval ? <PreReading room={room} content={content} /> : <CandidateWaiting room={room} />}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          padding: "16px 20px",
          borderRadius: "var(--radius-lg)",
          background: both ? "var(--success-bg)" : "var(--surface-sunken)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, font: "600 var(--text-sm) var(--font-sans)", color: both ? "var(--success-text)" : "var(--text-secondary)" }}>
          <Icon name={both ? "link-2" : "loader"} size={18} />
          {!both
            ? "Aguardando os dois confirmarem prontidão"
            : isEval
              ? "Dupla conectada. Você é o avaliador: inicie quando o candidato estiver pronto."
              : `Dupla conectada. Aguardando ${firstName(partner)} (avaliador) iniciar a estação…`}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Button variant="ghost" icon="log-out" onClick={() => actions.leave()}>
            Sair da sala
          </Button>
          {isEval ? (
            <Button size="lg" icon="play" disabled={!both} onClick={() => actions.start()}>
              Iniciar estação
            </Button>
          ) : (
            <Badge tone={both ? "success" : "neutral"} icon="lock">
              Só o avaliador inicia
            </Badge>
          )}
        </div>
      </div>
    </main>
  );
}
