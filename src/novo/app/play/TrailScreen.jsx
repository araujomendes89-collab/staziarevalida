// Trilha de aprendizado (app_trail): Área → temas mais cobrados → simulado da área.
// Cada etapa tem estado (bloqueada, disponível, em andamento, concluída, dominada); abrir uma etapa
// cria um treino só daquele tema (app_start_trail_node). O elemento principal da experiência.
import React from "react";
import { Badge, Banner, Button, Card, Icon, ProgressBar } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { AREAS, areaLabel } from "../practice/format.js";
import { NODE_STATE } from "./format.js";
import { PlayError, Skeleton } from "./components.jsx";
import "./play.css";

const STATE_STYLE = {
  locked: { ring: "var(--locked)", fg: "var(--locked)", bg: "var(--locked-bg)" },
  available: { ring: "var(--action-primary)", fg: "var(--action-primary)", bg: "var(--surface-brand-soft)" },
  in_progress: { ring: "var(--chart-1)", fg: "var(--text-brand)", bg: "var(--surface-brand-soft)" },
  completed: { ring: "var(--success-solid)", fg: "var(--success-text)", bg: "var(--success-bg)" },
  mastered: { ring: "var(--xp)", fg: "var(--xp-text)", bg: "var(--xp-bg)" },
};

/** Nó grande da trilha, com anel de progresso. */
export function TrailNode({ node, onOpen, busy, last }) {
  const st = STATE_STYLE[node.state] ?? STATE_STYLE.locked;
  const meta = NODE_STATE[node.state] ?? NODE_STATE.locked;
  const pct = Math.min(100, Math.round((100 * node.answered) / Math.max(1, node.goal)));
  const locked = node.state === "locked";
  return (
    <>
      <button type="button" className="play-trail-node" disabled={locked || busy} onClick={() => onOpen(node)} aria-label={`${node.topic}: ${meta.label}`}>
        <span className="play-trail-ring" style={{ background: `conic-gradient(${st.ring} ${node.state === "locked" ? 0 : Math.max(pct, node.state === "available" ? 0 : 4)}%, var(--border-default) 0)` }}>
          <span style={{ width: 44, height: 44, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: st.bg, color: st.fg }}>
            <Icon name={meta.icon} size={20} />
          </span>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", font: "600 15px var(--font-sans)", color: locked ? "var(--text-tertiary)" : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.topic}</span>
          <span style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--type-caption)", color: "var(--text-tertiary)", flexWrap: "wrap" }}>
            <span style={{ color: st.fg, fontWeight: 600 }}>{meta.label}</span>
            <span>· {node.answered}/{node.goal} questões</span>
            {node.accuracy != null && <span>· {node.accuracy}% acertos</span>}
            <span>· {node.questions} no banco</span>
          </span>
        </span>
        {!locked && <Icon name="chevron-right" size={18} style={{ color: "var(--text-tertiary)", flex: "none" }} />}
      </button>
      {!last && <span className={`play-trail-link${node.state === "completed" || node.state === "mastered" ? " play-trail-link--done" : ""}`} aria-hidden="true" />}
    </>
  );
}

export function AreaTrail({ area, onOpenNode, onOpenSimulado, busy }) {
  const sim = area.simulado;
  const simState = STATE_STYLE[sim.state] ?? STATE_STYLE.locked;
  return (
    <div className="play-trail">
      {area.nodes.map((node, i) => (
        <TrailNode key={node.topic} node={node} onOpen={onOpenNode} busy={busy} last={false} />
      ))}
      <button type="button" className="play-trail-node" disabled={sim.state === "locked" || busy} onClick={onOpenSimulado} aria-label={`Simulado de ${area.label}: ${NODE_STATE[sim.state]?.label}`}>
        <span className="play-trail-ring" style={{ width: 76, height: 76, background: `conic-gradient(${simState.ring} ${sim.state === "completed" ? 100 : Math.min(100, Math.round((100 * area.done) / Math.max(1, area.total)))}%, var(--border-default) 0)` }}>
          <span style={{ width: 54, height: 54, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: simState.bg, color: simState.fg }}>
            <Icon name={sim.state === "locked" ? "lock" : "timer"} size={24} />
          </span>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", font: "700 16px var(--font-sans)", color: sim.state === "locked" ? "var(--text-tertiary)" : "var(--text-primary)" }}>Simulado de {area.label}</span>
          <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
            {sim.state === "locked" ? `Libera com ${sim.unlock_pct}% das etapas concluídas (${area.done} de ${area.total})` : sim.state === "completed" ? `${sim.done} ${sim.done === 1 ? "simulado feito" : "simulados feitos"} · 30 questões, 90 min` : "30 questões em condições de prova, 90 min"}
          </span>
        </span>
        {sim.state !== "locked" && <Icon name="chevron-right" size={18} style={{ color: "var(--text-tertiary)", flex: "none" }} />}
      </button>
    </div>
  );
}

export function TrailScreen({ go }) {
  const { backend, boot } = useSession();
  const mobile = useMobile();
  const [area, setArea] = React.useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("smn-trail-area")) || AREAS[0].id);
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setError(null);
    backend
      .rpc("app_trail", { p_area: null })
      .then((r) => alive && setData(r))
      .catch(() => alive && setError("Não foi possível carregar a trilha."));
    return () => {
      alive = false;
    };
  }, [backend, tick]);

  const pick = (id) => {
    setArea(id);
    try {
      localStorage.setItem("smn-trail-area", id);
    } catch {
      /* opcional */
    }
  };
  const start = async (topic) => {
    setBusy(true);
    setError(null);
    try {
      const started = await backend.rpc("app_start_trail_node", { p_area: area, p_topic: topic });
      go("sessao", { s: started.session_id });
    } catch {
      setError("Não foi possível abrir esta etapa. Tente de novo.");
      setBusy(false);
    }
  };

  if (boot?.play?.enabled === false) return <Banner tone="info">A trilha faz parte do Stazia Play, que está desligado no momento.</Banner>;
  if (error && !data) return <PlayError retry={() => setTick((n) => n + 1)}>{error}</PlayError>;
  if (!data) return <Skeleton height={420} />;
  if (data.enabled === false) return <Banner tone="info">A trilha está desligada no momento.</Banner>;

  const current = data.areas.find((a) => a.area === area) ?? data.areas[0];
  const next = current.nodes.find((n) => n.state === "available" || n.state === "in_progress");
  return (
    <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1.4fr) minmax(280px,1fr)", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div role="tablist" aria-label="Grande área" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
          {data.areas.map((a) => {
            const meta = AREAS.find((x) => x.id === a.area);
            const on = a.area === current.area;
            return (
              <button key={a.area} type="button" role="tab" aria-selected={on} className="sm-chip" aria-pressed={on} onClick={() => pick(a.area)} style={{ flex: "none", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: `var(${meta?.tone ?? "--action-primary"})` }} />
                {a.label}
                <span className="sm-chip__count">{a.done}/{a.total}</span>
              </button>
            );
          })}
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
        <Card style={{ borderRadius: 24 }} padding={mobile ? 18 : 28}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
            <div>
              <span className="sm-overline">Trilha</span>
              <h2 style={{ margin: "4px 0 0", font: `700 ${mobile ? 22 : 26}px/1.2 var(--font-sans)`, letterSpacing: "-0.015em" }}>{current.label}</h2>
            </div>
            <div style={{ minWidth: 180, flex: mobile ? "1 1 100%" : "none" }}>
              <ProgressBar value={current.done} max={Math.max(1, current.total)} height={6} valueLabel={`${current.done} de ${current.total} etapas`} label={current.mastered ? `${current.mastered} dominadas` : "Progresso"} />
            </div>
          </div>
          <AreaTrail area={current} onOpenNode={(n) => start(n.topic)} onOpenSimulado={() => start(null)} busy={busy} />
        </Card>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, position: mobile ? "static" : "sticky", top: 24 }}>
        <Card variant="inverse" style={{ borderRadius: 24 }} padding={24}>
          <span className="sm-overline" style={{ color: "var(--teal-300)" }}>Próxima etapa</span>
          <h3 style={{ margin: "8px 0 6px", font: "700 20px/1.25 var(--font-sans)", color: "#fff" }}>{next ? next.topic : current.simulado.state === "available" ? `Simulado de ${current.label}` : "Trilha concluída"}</h3>
          <p style={{ margin: 0, color: "var(--navy-200)", font: "var(--type-body-sm)" }}>
            {next ? `${Math.max(0, next.goal - next.answered)} ${next.goal - next.answered === 1 ? "questão" : "questões"} para concluir a etapa. Cerca de ${Math.max(5, (next.goal - next.answered) * 2)} min.` : current.simulado.state === "available" ? "30 questões em condições de prova." : "Revise as etapas ou escolha outra área."}
          </p>
          <div style={{ marginTop: 16 }}>
            <button type="button" className="sm-btn sm-btn--lg" disabled={busy || (!next && current.simulado.state !== "available")} onClick={() => start(next ? next.topic : null)} style={{ background: "var(--teal-400)", color: "var(--navy-950)" }}>
              Continuar estudando <Icon name="arrow-right" size={18} />
            </button>
          </div>
        </Card>
        <Card style={{ borderRadius: 24 }} padding={20}>
          <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>Como funciona</span>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, font: "var(--type-body-sm)", color: "var(--text-secondary)", display: "grid", gap: 6 }}>
            <li>Os temas seguem a incidência real nas provas oficiais.</li>
            <li>Uma etapa conclui com {data.goal} questões do tema e fica <b>dominada</b> com {data.mastery_accuracy}% de acerto.</li>
            <li>Concluir uma etapa libera a seguinte; o simulado da área abre quando a trilha avança.</li>
            <li>Cada resposta vale XP e conta para a sequência e as missões.</li>
          </ul>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {Object.entries(NODE_STATE).map(([k, v]) => (
              <Badge key={k} size="sm" icon={v.icon}>{v.label}</Badge>
            ))}
          </div>
        </Card>
        <Button variant="secondary" fullWidth iconRight="chevron-right" onClick={() => go("temas")}>
          Ver Grandes Temas por incidência
        </Button>
      </div>
    </div>
  );
}

export const trailAreaLabel = areaLabel;
