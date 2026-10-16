// Folha do candidato e impressos (Room.jsx:289-308 do protótipo de 11/10). O enunciado (instruções + relato) e cada impresso
// aparecem como IMAGEM com "Ampliar" (tela cheia, − e +, Esc fecha), vindos da Montagem de estações pela rota da sala
// (`actions.printUrl`). Onde não houver imagem, o texto é a folha.
// TODO(dono): imagens da folha do candidato e dos impressos de cada estação vêm da Montagem (`station_assets`, chave
// `candidate_sheet` e a do impresso em `pressing_assets`); enquanto não houver, o candidato lê o texto.
// Nunca escreve o nome da estação (o tema é só do avaliador até o resultado).
import React from "react";
import { Badge, Card, Icon, PrintImage, PrintItem } from "../../../ds";
import { formatDecimal } from "../../../ds/format.js";
import { isTaskNote, splitBlocks, splitTasks } from "../content.js";
import { Scene } from "./parts.jsx";

const overline = { font: "var(--type-overline)", letterSpacing: "var(--tracking-overline)", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 10 };

/** Endereço da imagem pela rota da sala; `null` enquanto carrega ou quando não há imagem (aí o texto aparece). */
export function useImageUrl(id, hasImage, actions) {
  const [state, setState] = React.useState({ id: null, url: null, done: false });
  React.useEffect(() => {
    let alive = true;
    if (!hasImage) {
      setState({ id, url: null, done: true });
      return undefined;
    }
    setState({ id, url: null, done: false });
    Promise.resolve(actions.printUrl(id)).then(
      (url) => alive && setState({ id, url: url || null, done: true }),
      () => alive && setState({ id, url: null, done: true })
    );
    return () => {
      alive = false;
    };
  }, [id, hasImage, actions]);
  return state.id === id ? state : { id, url: null, done: !hasImage };
}

/** Imagem do impresso (com "Ocultar" para o candidato) ou, sem imagem, o texto do impresso. */
export function PressingMedia({ pressing, actions, canHide = false }) {
  const img = useImageUrl(pressing.id, Boolean(pressing.has_image), actions);
  if (img.url) return <PrintImage src={img.url} alt={`Impresso ${pressing.display_number} · ${pressing.name}`} canHide={canHide} />;
  if (!img.done) return <div aria-busy="true" style={{ minHeight: 40 }} />;
  return <div style={{ whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>{pressing.content}</div>;
}

/** Texto da folha: cenário, "Nos N minutos de duração, execute:" e as tarefas numeradas. */
function SheetText({ station }) {
  const tasks = splitTasks(station.doctor_tasks);
  const minutes = (station.duration_ms ?? 0) / 60000;
  let n = 0;
  return (
    <>
      <Card padding={28} style={{ boxShadow: "var(--shadow-sm)" }}>
        <div style={overline}>Enunciado</div>
        <Scene blocks={splitBlocks(station.doctor_scene)} style={{ font: "400 var(--text-md)/1.6 var(--font-sans)", color: "var(--text-primary)" }} />
      </Card>
      <Card padding={20}>
        <h2 style={{ margin: "0 0 14px", font: "600 var(--text-base)/1.3 var(--font-sans)", color: "var(--text-primary)" }}>
          Nos {Number.isInteger(minutes) ? minutes : formatDecimal(minutes, 1)} minutos de duração, execute:
        </h2>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {tasks.map((t, i) => {
            const note = isTaskNote(t);
            if (!note) n += 1;
            return (
              <li key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", color: "var(--text-primary)" }}>
                {!note && <span style={{ font: "600 var(--text-xs) var(--font-mono)", color: "var(--text-brand)" }}>{String(n).padStart(2, "0")}</span>}
                {t}
              </li>
            );
          })}
        </ol>
      </Card>
    </>
  );
}

/**
 * Folha do candidato: a imagem ÚNICA (instruções e relato do caso, como a do protótipo de 11/10) quando a Montagem a enviou;
 * senão o texto completo: cenário, tarefas e os impressos iniciais (visíveis desde o início, sem liberação), cada um em imagem
 * ou texto. Com a imagem única os impressos iniciais não se repetem embaixo (já estão nela).
 * TODO(dono): confirmar com a Montagem que a imagem "candidate_sheet" sempre traz o relato junto.
 */
export function CandidateSheet({ station, content, actions }) {
  const sheet = useImageUrl("candidate_sheet", Boolean(station.candidate_sheet?.has_image), actions);
  const initial = (content.pressings || []).filter((p) => p.initially_visible);
  return (
    <div className="dupla-cand__col">
      {sheet.url ? (
        <div className="dupla-sheet">
          <Card padding={8}>
            <PrintImage src={sheet.url} alt="Instruções para o participante e relato do caso clínico" baseWidth={1100} label="Ampliar imagem da estação" />
          </Card>
        </div>
      ) : sheet.done ? (
        <SheetText station={station} />
      ) : (
        <div aria-busy="true" style={{ minHeight: 120 }} />
      )}
      {!sheet.url && sheet.done && initial.map((p) => (
        <Card key={p.id} padding={20}>
          <div style={overline}>{`Impresso ${p.display_number} · ${p.name}`}</div>
          <PressingMedia pressing={p} actions={actions} />
        </Card>
      ))}
    </div>
  );
}

/** Impresso liberado: abre e fecha (aberto ao chegar), com a imagem ampliável e "Ocultar". */
function ReleasedPrint({ pressing, actions }) {
  const [open, setOpen] = React.useState(true);
  const label = `Impresso ${pressing.display_number} · ${pressing.name}`;
  return (
    <div style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${open ? "Fechar" : "Abrir"} ${label}`}
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "12px 0",
          border: 0,
          background: "transparent",
          color: "var(--text-primary)",
          cursor: "pointer",
          textAlign: "left",
          font: "600 var(--text-sm) var(--font-sans)",
        }}
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size={16} />
        <Icon name="lock-open" size={15} />
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{ font: "600 var(--text-xs) var(--font-sans)", color: "var(--text-secondary)" }}>{open ? "Fechar" : "Abrir"}</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 12 }}>
          <PressingMedia pressing={pressing} actions={actions} canHide />
        </div>
      )}
    </div>
  );
}

/** Lista "Impressos" do candidato: só os liberáveis, numerados 1, 2, 3; os não liberados aguardam. */
export function CandidatePrints({ content, actions }) {
  const total = content.pressing_count ?? 0;
  const released = (content.pressings || []).filter((p) => !p.initially_visible);
  return (
    <Card padding="12px 16px">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 0 8px" }}>
        <h2 style={{ margin: 0, font: "600 var(--text-base)/1.3 var(--font-sans)", color: "var(--text-primary)" }}>Impressos</h2>
        <Badge size="sm" tone="brand">{released.length === 1 ? "1 liberado" : `${released.length} liberados`}</Badge>
      </div>
      {Array.from({ length: total }, (_, k) => k + 1).map((index) => {
        const p = released.find((x) => x.display_number === index);
        return p ? <ReleasedPrint key={p.id} pressing={p} actions={actions} /> : <PrintItem key={index} index={index} title="Aguardando liberação" />;
      })}
    </Card>
  );
}
