// Trilha de aprendizado (app_trail): Área → temas mais cobrados → simulado da área.
// Cada etapa tem estado (bloqueada, disponível, em andamento, concluída, dominada); abrir uma etapa
// cria um treino só daquele tema (app_start_trail_node). Visual do pacote "Novas telas" (onda 6, 15/10/2026):
// computador e tablet deitado (a partir de 960 px) = trilha em zigue-zague + coluna com "Próxima etapa"; tablet em pé = uma coluna
// com "Próxima etapa" primeiro (G10.2, 16/10/2026); celular = áreas com arte,
// cartão azul primeiro e a lista curta com "Ver as N etapas + simulado". Os dados são os de sempre.
import React from "react";
import { Banner, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { AREAS, areaLabel } from "../practice/format.js";
import { AreaTile, Panel, RichIcon, useBreakpoint, useNarrow } from "../evolucao/ui.jsx";
import { NODE_STATE } from "./format.js";
import { PlayError, Skeleton } from "./components.jsx";
import "./play.css";
import "./arena.css";

/** Play cheio (o pacote usa o "play" preenchido; é o mesmo desenho do Lucide com preenchimento). */
export function PlayFilled({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "block", marginLeft: size * 0.1 }}>
      <polygon points="6 3 20 12 6 21 6 3" strokeLinejoin="round" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const stepMeta = (node) => {
  const parts = [`${node.answered}/${node.goal} questões`];
  if (node.accuracy != null) parts.push(`${node.accuracy}% acertos`);
  parts.push(`${node.questions} no banco`);
  return parts.join(" · ");
};

/** Uma etapa: o círculo (estado) e o texto. A etapa atual é o círculo azul grande com o play. */
function Step({ node, current, busy, onOpen, small }) {
  const meta = NODE_STATE[node.state] ?? NODE_STATE.locked;
  const locked = node.state === "locked";
  const cls = current ? "ar-node ar-node--cur" : `ar-node ar-node--${node.state}`;
  return (
    <li>
      <button type="button" className={`ar-step${current ? " ar-step--cur" : ""}${locked ? "" : " ar-step--open"}`} disabled={locked || busy} onClick={() => onOpen(node)} aria-label={`${node.topic}: ${meta.label}`}>
        <span className={cls} aria-hidden="true">
          {current ? <PlayFilled size={small ? 18 : 24} /> : <Icon name={meta.icon} size={small ? 16 : 20} />}
        </span>
        <span className="ar-step__txt">
          <span className="ar-step__title">{node.topic}</span>
          <span className="ar-step__meta">
            <span className={`ar-step__st ar-st--${node.state}`}>{meta.label}</span> · {stepMeta(node)}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Simulado da área (fim da trilha): troféu em círculo tracejado enquanto bloqueado. */
function SimStep({ area, busy, onOpen, small }) {
  const sim = area.simulado;
  const label = NODE_STATE[sim.state]?.label ?? "Bloqueada";
  const locked = sim.state === "locked";
  const meta = locked
    ? `libera com ${sim.unlock_pct}% das etapas concluídas (${area.done} de ${area.total})`
    : sim.state === "completed"
      ? `${sim.done} ${sim.done === 1 ? "simulado feito" : "simulados feitos"} · 30 questões, 90 min`
      : "30 questões em condições de prova, 90 min";
  return (
    <li className="ar-li--final">
      <button type="button" className="ar-step ar-step--final" disabled={locked || busy} onClick={onOpen} aria-label={`Simulado de ${area.label}: ${label}`}>
        <span className={`ar-node ar-node--final ${locked ? "is-locked" : sim.state === "completed" ? "is-done" : "is-open"}`} aria-hidden="true">
          <RichIcon name="trophy" size={small ? 24 : 30} fallback="trophy" />
        </span>
        <span className="ar-step__txt">
          <span className="ar-step__title">Simulado de {area.label}</span>
          <span className="ar-step__meta">
            <span className={`ar-step__st ar-st--${sim.state}`}>{label}</span> · {meta}
          </span>
        </span>
      </button>
    </li>
  );
}

function TrailProgress({ area }) {
  return (
    <div className="ar-trail__prog">
      <span className="ar-trail__prog-t">
        <b>
          {area.done} de {area.total}
        </b>{" "}
        etapas
      </span>
      <span className="ar-bar" role="progressbar" aria-label="Etapas concluídas" aria-valuenow={area.done} aria-valuemin={0} aria-valuemax={Math.max(1, area.total)}>
        <span style={{ width: `${Math.min(100, Math.round((100 * area.done) / Math.max(1, area.total)))}%` }} />
      </span>
    </div>
  );
}

/** Cartão azul "Próxima etapa" (a etapa disponível ou em andamento; sem ela, o simulado ou "Trilha concluída"). */
function NextCard({ area, next, busy, onStart }) {
  const total = area.nodes.length;
  const idx = next ? area.nodes.indexOf(next) + 1 : 0;
  const left = next ? Math.max(0, next.goal - next.answered) : 0;
  const simOpen = area.simulado.state === "available";
  return (
    <section className="ar-hero" aria-label="Próxima etapa">
      <span className="ar-kicker">{next ? `Próxima etapa · ${idx} de ${total}` : "Próxima etapa"}</span>
      <h2 className="ar-hero__title">{next ? next.topic : simOpen ? `Simulado de ${area.label}` : "Trilha concluída"}</h2>
      <span className="ar-hero__sub">
        {next ? (
          <>
            <span className="ar-mono">{left}</span> {left === 1 ? "questão" : "questões"} para concluir a etapa · cerca de <span className="ar-mono">{Math.max(5, left * 2)} min</span>
          </>
        ) : simOpen ? (
          "30 questões em condições de prova."
        ) : (
          "Revise as etapas ou escolha outra área."
        )}
      </span>
      <button type="button" className="ar-hero__btn" disabled={busy || (!next && !simOpen)} onClick={() => onStart(next ? next.topic : null)}>
        Continuar estudando <Icon name="arrow-right" size={18} />
      </button>
    </section>
  );
}

function HowItWorks({ data, defaultOpen }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const id = React.useId();
  return (
    <section className="ar-how" aria-label="Como funciona">
      <button type="button" className="ar-how__btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span>Como funciona a trilha</span>
        <Icon name="chevron-down" size={18} className={`ar-how__chev${open ? " is-open" : ""}`} />
      </button>
      {open && (
        <div className="ar-how__body" id={id}>
          <ul>
            <li>Os temas seguem a incidência real nas provas oficiais.</li>
            <li>
              Uma etapa conclui com {data.goal} questões do tema e fica <strong>dominada</strong> com {data.mastery_accuracy}% de acerto.
            </li>
            <li>Concluir uma etapa libera a seguinte; o simulado da área abre quando a trilha avança.</li>
            <li>Cada resposta vale XP e conta para a sequência e as missões.</li>
          </ul>
          <div className="ar-legend">
            {Object.entries(NODE_STATE).map(([k, v]) => (
              <span key={k}>
                <i className={`ar-lg--${k}`} aria-hidden="true" />
                {v.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const AREA_DOT = Object.fromEntries(AREAS.map((a) => [a.id, `var(${a.tone})`]));

export function TrailScreen({ go }) {
  const { backend, boot } = useSession();
  const bp = useBreakpoint();
  const narrow = bp === "narrow";
  // G10.2 (16/10/2026): a coluna lateral vale a partir de 960 px (regra só desta tela; o useBreakpoint segue igual para as outras)
  const twoCols = !useNarrow(959);
  const [area, setArea] = React.useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("smn-trail-area")) || AREAS[0].id);
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [all, setAll] = React.useState(false);

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
    setAll(false);
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

  if (boot?.play?.enabled === false) return <Banner tone="info">A trilha faz parte da Stazia Arena, que está desligada no momento.</Banner>;
  if (error && !data) return <PlayError retry={() => setTick((n) => n + 1)}>{error}</PlayError>;
  if (!data) return <Skeleton height={420} />;
  if (data.enabled === false) return <Banner tone="info">A trilha está desligada no momento.</Banner>;
  if (!data.areas?.length) return <Banner tone="info">A trilha ainda não tem etapas.</Banner>;

  const current = data.areas.find((a) => a.area === area) ?? data.areas[0];
  const next = current.nodes.find((n) => n.state === "available" || n.state === "in_progress");
  const open = (n) => start(n.topic);

  const tabs = narrow ? (
    <div role="tablist" aria-label="Grande área" className="ar-areas">
      {data.areas.map((a) => {
        const on = a.area === current.area;
        return (
          <button key={a.area} type="button" role="tab" aria-selected={on} className="ar-area" onClick={() => pick(a.area)}>
            <AreaTile area={a.area} size={52} />
            <span className="ar-area__l">{a.label}</span>
            <span className="ar-area__n">
              {a.done}/{a.total}
            </span>
          </button>
        );
      })}
    </div>
  ) : (
    <div role="tablist" aria-label="Grande área" className="ar-chips">
      {data.areas.map((a) => {
        const on = a.area === current.area;
        return (
          <button key={a.area} type="button" role="tab" aria-selected={on} className="ar-chip" onClick={() => pick(a.area)}>
            <span className="ar-chip__dot" style={{ background: AREA_DOT[a.area] ?? "var(--action-primary)" }} aria-hidden="true" />
            {a.label}
            <span className="ar-chip__n">
              {a.done}/{a.total}
            </span>
          </button>
        );
      })}
    </div>
  );

  if (narrow) {
    // celular: mostra 4 etapas (a partir da anterior à atual) e o simulado; o resto abre em "Ver as N etapas"
    const curIdx = next ? current.nodes.indexOf(next) : 0;
    const from = all ? 0 : Math.max(0, Math.min(curIdx - 1, current.nodes.length - 4));
    const shown = all ? current.nodes : current.nodes.slice(from, from + 4);
    return (
      <div className="ev ar">
        {tabs}
        {error && <Banner tone="danger">{error}</Banner>}
        <NextCard area={current} next={next} busy={busy} onStart={start} />
        <Panel className="ar-msteps" aria-label={`Trilha de ${current.label}`}>
          <div className="ar-trail__head">
            <h2 className="ar-mcard__h">Etapas da trilha</h2>
            <TrailProgress area={current} />
          </div>
          <ol className="ar-steps">
            {shown.map((n) => (
              <Step key={n.topic} node={n} current={n === next} busy={busy} onOpen={open} small />
            ))}
            <SimStep area={current} busy={busy} onOpen={() => start(null)} small />
          </ol>
          {current.nodes.length > 4 && (
            <button type="button" className="ar-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
              {all ? "Mostrar menos" : `Ver as ${current.nodes.length} etapas + simulado`}
              <Icon name={all ? "chevron-up" : "chevron-down"} size={16} />
            </button>
          )}
        </Panel>
        <HowItWorks data={data} defaultOpen={false} />
        <button type="button" className="ar-link" onClick={() => go("temas")}>
          Ver Grandes Temas por incidência <Icon name="chevron-right" size={16} />
        </button>
      </div>
    );
  }

  const trail = (
    <Panel className="ar-trail" aria-label={`Trilha de ${current.label}`}>
      <div className="ar-trail__head">
        <div>
          <div className="ar-kicker ar-trail__kicker">Trilha</div>
          <h2 className="ar-trail__name">{current.label}</h2>
        </div>
        <TrailProgress area={current} />
      </div>
      <ol className="ar-steps">
        {current.nodes.map((n) => (
          <Step key={n.topic} node={n} current={n === next} busy={busy} onOpen={open} />
        ))}
        <SimStep area={current} busy={busy} onOpen={() => start(null)} />
      </ol>
    </Panel>
  );
  const nextCard = <NextCard area={current} next={next} busy={busy} onStart={start} />;
  const extras = (
    <>
      <HowItWorks data={data} defaultOpen />
      <button type="button" className="ar-link" onClick={() => go("temas")}>
        Ver Grandes Temas por incidência <Icon name="chevron-right" size={16} />
      </button>
    </>
  );

  // tablet em pé (720 a 959 px): uma coluna com "Próxima etapa" antes da trilha (decisão D8, provisória), como no celular
  if (!twoCols) {
    return (
      <div className="ev ar">
        {tabs}
        {error && <Banner tone="danger">{error}</Banner>}
        {nextCard}
        {trail}
        {extras}
      </div>
    );
  }

  return (
    <div className="ev ar">
      {tabs}
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="ar-cols">
        {trail}
        <div className="ar-side">
          {nextCard}
          {extras}
        </div>
      </div>
    </div>
  );
}

export const trailAreaLabel = areaLabel;
