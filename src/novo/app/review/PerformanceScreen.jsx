// Desempenho com dados do banco (app_performance).
// Visual do pacote "Novas telas" (15/10/2026): azulejos com ícone ilustrado, gráfico com área, áreas com arte própria e, no celular,
// o resumo em anel com abas Evolução, Por área e Erros. A "projeção de corte" e a linha de corte do gráfico seguem fora: não há nota
// de corte oficial carregada para comparar.
import React from "react";
import { Banner, Button, EmptyState, SegmentedControl } from "../../ds";
import { useSession } from "../session.jsx";
import { areaLabel, areaOf, formatClock, percent } from "../practice/format.js";
import { ErrorProfile } from "./ErrorProfile.jsx";
import { TutorButton } from "../tutor/TutorDrawer.jsx";
import { AreaTile, Panel, RichIcon, Tile, useNarrow } from "../evolucao/ui.jsx";
import "./desempenho.css";

const PERIODS = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];
const PAD_L = 40;
const PAD_R = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 8;
// Abaixo disso, comparar dois períodos é ruído.
const MIN_TO_COMPARE = 10;

const dayLabel = (iso) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Largura do elemento em pixels, para o gráfico ocupar o cartão sem esticar o texto. */
function useWidth() {
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(600);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setWidth(Math.max(element.clientWidth, 240));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function AccuracyChart({ daily, days, height }) {
  const [ref, width] = useWidth();
  return (
    <div ref={ref} className="dp-chart">
      <ChartBody daily={daily} days={days} W={width} H={height} />
    </div>
  );
}

function ChartBody({ daily, days, W, H }) {
  if (daily.length < 2) {
    return (
      <p className="dp-note">
        {daily.length === 0
          ? `Nenhuma resposta nos últimos ${days} dias.`
          : `Um dia com respostas neste período (${percent(daily[0].correct, daily[0].attempts)}% em ${daily[0].attempts}). A evolução aparece a partir do segundo dia de estudo.`}
      </p>
    );
  }
  const first = daily[0].day;
  const last = daily[daily.length - 1].day;
  const span = Math.max(daysBetween(first, last), 1);
  const yOf = (value) => PAD_TOP + (1 - value / 100) * (H - PAD_TOP - PAD_BOTTOM);
  const xOf = (offset) => PAD_L + (offset / span) * (W - PAD_L - PAD_R);
  const points = daily.map((d) => {
    const value = percent(d.correct, d.attempts);
    return { ...d, value, x: xOf(daysBetween(first, d.day)), y: yOf(value) };
  });
  const start = points[0];
  const end = points[points.length - 1];
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const base = yOf(0);
  const area = `M${start.x} ${base} L${points.map((p) => `${p.x} ${p.y}`).join(" L")} L${end.x} ${base} Z`;
  const middle = span >= 2 ? addDays(first, Math.round(span / 2)) : null;
  return (
    <svg width={W} height={H + 24} style={{ display: "block" }} role="img" aria-label={`Acurácia por dia: ${start.value}% em ${dayLabel(start.day)} e ${end.value}% em ${dayLabel(end.day)}`}>
      <defs>
        <linearGradient id="dp-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--action-primary)" stopOpacity=".18" />
          <stop offset="1" stopColor="var(--action-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((mark) => {
        const y = yOf(mark);
        return (
          <g key={mark}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="var(--border-subtle)" />
            <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize="12" fill="var(--text-tertiary)" fontFamily="var(--font-mono)">
              {mark}%
            </text>
          </g>
        );
      })}
      <path d={area} fill="url(#dp-area)" />
      <polyline points={line} fill="none" stroke="var(--action-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={p.day} cx={p.x} cy={p.y} r="4" fill="var(--surface-card)" stroke="var(--action-primary)" strokeWidth="2.5">
          <title>{`${dayLabel(p.day)}: ${p.value}% (${p.correct} de ${p.attempts})`}</title>
        </circle>
      ))}
      <text x={start.x} y={H + 18} fontSize="12" fill="var(--text-tertiary)">
        {dayLabel(start.day)}
      </text>
      {middle && (
        <text x={xOf(span / 2)} y={H + 18} textAnchor="middle" fontSize="12" fill="var(--text-tertiary)">
          {dayLabel(middle)}
        </text>
      )}
      <text x={end.x} y={H + 18} textAnchor="end" fontSize="12" fill="var(--text-tertiary)">
        {dayLabel(end.day)}
      </text>
    </svg>
  );
}

/** Uma grande área: arte própria, nome, "67% · 3q" (ou "sem respostas") e a barra na cor da área. */
function AreaRow({ area }) {
  const value = percent(area.correct, area.attempts);
  return (
    <li className="dp-area">
      <AreaTile area={area.area} size={40} />
      <span className="dp-area__body">
        <span className="dp-area__top">
          <span className="dp-area__name">{areaLabel(area.area)}</span>
          {area.attempts ? (
            <span className="dp-area__val">
              <strong className="ev-mono">{value}%</strong> · <span className="ev-mono">{area.attempts}q</span>
            </span>
          ) : (
            <span className="dp-area__val dp-area__val--none">sem respostas</span>
          )}
        </span>
        <span className="dp-bar" role="img" aria-label={area.attempts ? `${areaLabel(area.area)}: ${value}% em ${area.attempts} questões` : `${areaLabel(area.area)}: sem respostas`}>
          <span style={{ width: `${area.attempts ? value : 0}%`, background: `var(${areaOf(area.area).tone})` }} />
        </span>
      </span>
    </li>
  );
}

function AreasList({ areas }) {
  return (
    <ul className="dp-areas">
      {areas.map((area) => (
        <AreaRow key={area.area} area={area} />
      ))}
    </ul>
  );
}

function PeriodControl({ days, setDays }) {
  return <SegmentedControl label="Período" value={days} onChange={setDays} options={PERIODS} />;
}

function Metric({ tone, icon, label, value, caption, captionTone }) {
  return (
    <div className="ev-panel dp-metric">
      <Tile tone={tone} size={48} radius={14}>
        <RichIcon name={icon} size={31} />
      </Tile>
      <span className="dp-metric__text">
        <span className="dp-metric__label">{label}</span>
        <span className="dp-metric__value ev-mono">{value}</span>
        {caption && <span className={`dp-metric__cap${captionTone ? ` dp-metric__cap--${captionTone}` : ""}`}>{caption}</span>}
      </span>
    </div>
  );
}

function WeakPointsButton() {
  return <TutorButton request={{ mode: "perguntas", context: { type: "weak_points" } }} label="Me teste nos pontos fracos" variant="roxo" />;
}

/** Celular: anel de acurácia e quatro linhas de resumo. */
function Summary({ data }) {
  const accuracy = percent(data.correct, data.attempts);
  return (
    <section className="ev-panel dp-summary" aria-label="Resumo">
      <span className="dp-ring">
        <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">
          <circle cx="46" cy="46" r="40" fill="none" stroke="var(--selected-bg)" strokeWidth="9" />
          <circle cx="46" cy="46" r="40" fill="none" stroke="var(--action-primary)" strokeWidth="9" strokeLinecap="round" pathLength="100" strokeDasharray={`${accuracy} 100`} />
        </svg>
        <span className="dp-ring__text">
          <span className="ev-mono dp-ring__value">{accuracy}%</span>
          <span className="dp-ring__label">acurácia</span>
        </span>
      </span>
      <span className="dp-lines">
        {[
          ["Respostas certas", `${data.correct}/${data.attempts}`],
          ["Questões resolvidas", data.questions],
          ["Simulados · média", data.simulados.count ? `${data.simulados.count} · ${data.simulados.accuracy}%` : "nenhum finalizado"],
          ["Tempo por questão", data.avg_seconds ? formatClock(data.avg_seconds) : "—"],
        ].map(([label, value]) => (
          <span key={label} className="dp-line">
            <span>{label}</span>
            <b className="ev-mono">{value}</b>
          </span>
        ))}
      </span>
    </section>
  );
}

const TABS = [
  { value: "evo", label: "Evolução" },
  { value: "area", label: "Por área" },
  { value: "erros", label: "Erros" },
];

export function PerformanceScreen({ go }) {
  const { backend } = useSession();
  const narrow = useNarrow();
  const [days, setDays] = React.useState("30");
  const [tab, setTab] = React.useState("evo");
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    backend
      .rpc("app_performance", { p_days: Number(days) })
      .then((result) => alive && setData(result))
      .catch(() => alive && setError("Não foi possível carregar o desempenho. Recarregue a página."));
    return () => {
      alive = false;
    };
  }, [backend, days]);

  if (!data) return error ? <Banner tone="danger">{error}</Banner> : <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;

  if (data.attempts === 0) {
    return (
      <EmptyState
        icon="chart-no-axes-combined"
        title="Ainda não há dados suficientes"
        description="Resolva questões para que o sistema calcule sua acurácia real, evolução temporal e diagnóstico por área."
        action={
          <Button iconRight="arrow-right" onClick={() => go("questoes")}>
            Começar a praticar
          </Button>
        }
      />
    );
  }

  const comparable = data.period.attempts >= MIN_TO_COMPARE && data.previous.attempts >= MIN_TO_COMPARE;
  const delta = percent(data.period.correct, data.period.attempts) - percent(data.previous.correct, data.previous.attempts);
  const evolution = (
    <Panel className="dp-evo" aria-label="Evolução da acurácia">
      <div className="dp-head">
        <h2 className="ev-h2">{narrow ? "Acurácia no período" : "Evolução da acurácia"}</h2>
        <PeriodControl days={days} setDays={setDays} />
      </div>
      <AccuracyChart daily={data.daily} days={data.days} height={narrow ? 144 : 164} />
    </Panel>
  );

  if (narrow) {
    return (
      <div className="ev ev-stack dp dp--narrow">
        {error && <Banner tone="danger">{error}</Banner>}
        <Summary data={data} />
        <div role="tablist" aria-label="Seções do desempenho" className="ev-tabs">
          {TABS.map((t) => (
            <button key={t.value} type="button" role="tab" id={`dp-tab-${t.value}`} aria-selected={tab === t.value} aria-controls="dp-panel" className="ev-tab" onClick={() => setTab(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <div id="dp-panel" role="tabpanel" aria-labelledby={`dp-tab-${tab}`} className="ev-stack">
          {tab === "evo" && evolution}
          {tab === "area" && (
            <Panel className="dp-areas-card" aria-label="Por grande área">
              <AreasList areas={data.areas} />
              <WeakPointsButton />
            </Panel>
          )}
          {tab === "erros" && <ErrorProfile go={go} days={days} compact />}
        </div>
      </div>
    );
  }

  return (
    <div className="ev ev-stack dp">
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="dp-metrics">
        <Metric
          tone="blue"
          icon="target"
          label="Acurácia"
          value={`${percent(data.correct, data.attempts)}%`}
          caption={comparable ? `${delta >= 0 ? "+" : ""}${delta} pts em ${data.days} dias` : `${data.correct} de ${data.attempts} respostas`}
          captionTone={comparable ? (delta < 0 ? "bad" : "good") : undefined}
        />
        <Metric tone="blue" icon="question" label="Questões" value={data.questions} caption="resolvidas no total" />
        <Metric tone="violet" icon="clipboard" label="Simulados" value={data.simulados.count} caption={data.simulados.count ? `média ${data.simulados.accuracy}%` : "nenhum finalizado"} />
        <Metric tone="orange" icon="timer" label="Tempo por questão" value={data.avg_seconds ? formatClock(data.avg_seconds) : "—"} />
      </div>
      <div className="dp-row">
        {evolution}
        <Panel className="dp-areas-card" aria-label="Por grande área">
          <h2 className="ev-h2">Por grande área</h2>
          <AreasList areas={data.areas} />
          <WeakPointsButton />
        </Panel>
      </div>
      <ErrorProfile go={go} days={days} />
    </div>
  );
}
