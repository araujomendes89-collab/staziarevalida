// Desempenho com dados do banco (app_performance).
// Mesma marcação da Performance do protótipo (prototype/More.jsx). A "projeção de corte" e a
// linha de corte do gráfico saíram: não há nota de corte oficial carregada para comparar.
import React from "react";
import { Banner, Button, Card, EmptyState, ProgressBar, SegmentedControl, StatCard } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { areaLabel, areaOf, formatClock, percent } from "../practice/format.js";
import { ErrorProfile } from "./ErrorProfile.jsx";

const R = { borderRadius: 24 };
const PERIODS = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];
const H = 180;
const PAD_X = 8;
const PAD_TOP = 20; // espaço para o rótulo de 100%
const PAD_BOTTOM = 8;
// Abaixo disso, comparar dois períodos é ruído.
const MIN_TO_COMPARE = 10;

const dayLabel = (iso) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

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

function AccuracyChart({ daily, days }) {
  const [ref, width] = useWidth();
  return (
    <div ref={ref} style={{ marginTop: 16 }}>
      <ChartBody daily={daily} days={days} W={width} />
    </div>
  );
}

function ChartBody({ daily, days, W }) {
  if (daily.length < 2) {
    return (
      <p style={{ margin: 0, color: "var(--text-secondary)" }}>
        {daily.length === 0
          ? `Nenhuma resposta nos últimos ${days} dias.`
          : `Um dia com respostas neste período (${percent(daily[0].correct, daily[0].attempts)}% em ${daily[0].attempts}). A evolução aparece a partir do segundo dia de estudo.`}
      </p>
    );
  }
  const first = daily[0].day;
  const span = Math.max(daysBetween(first, daily[daily.length - 1].day), 1);
  const yOf = (value) => PAD_TOP + (1 - value / 100) * (H - PAD_TOP - PAD_BOTTOM);
  const points = daily.map((d) => {
    const value = percent(d.correct, d.attempts);
    return { ...d, value, x: PAD_X + (daysBetween(first, d.day) / span) * (W - 2 * PAD_X), y: yOf(value) };
  });
  const start = points[0];
  const end = points[points.length - 1];
  return (
    <svg width={W} height={H + 22} style={{ display: "block" }} role="img" aria-label={`Acurácia por dia: ${start.value}% em ${dayLabel(start.day)} e ${end.value}% em ${dayLabel(end.day)}`}>
      {[0, 50, 100].map((mark) => {
        const y = yOf(mark);
        return (
          <g key={mark}>
            <line x1="0" x2={W} y1={y} y2={y} stroke="var(--border-subtle)" strokeDasharray={mark === 50 ? "4 4" : undefined} />
            <text x={W} y={y - 4} textAnchor="end" fontSize="11" fill="var(--text-tertiary)" fontFamily="var(--font-mono)">
              {mark}%
            </text>
          </g>
        );
      })}
      <polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--teal-500)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={p.day} cx={p.x} cy={p.y} r="4" fill="var(--surface-card)" stroke="var(--teal-500)" strokeWidth="2">
          <title>{`${dayLabel(p.day)}: ${p.value}% (${p.correct} de ${p.attempts})`}</title>
        </circle>
      ))}
      <text x="0" y={H + 18} fontSize="11" fill="var(--text-tertiary)" fontFamily="var(--font-mono)">
        {dayLabel(start.day)}
      </text>
      <text x={W} y={H + 18} textAnchor="end" fontSize="11" fill="var(--text-tertiary)" fontFamily="var(--font-mono)">
        {dayLabel(end.day)}
      </text>
    </svg>
  );
}

export function PerformanceScreen({ go }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const [days, setDays] = React.useState("30");
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
  return (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 16 }}>
        <StatCard
          label="Acurácia"
          value={`${percent(data.correct, data.attempts)}%`}
          caption={comparable ? `${delta >= 0 ? "+" : ""}${delta} pts em ${data.days} dias` : `${data.correct} de ${data.attempts} respostas`}
          tone={comparable && delta < 0 ? "warning" : "success"}
          icon="target"
        />
        <StatCard label="Questões" value={data.questions} caption="resolvidas no total" />
        <StatCard label="Simulados" value={data.simulados.count} caption={data.simulados.count ? `média ${data.simulados.accuracy}%` : "nenhum finalizado"} tone="info" icon="timer" />
        <StatCard label="Tempo por questão" value={data.avg_seconds ? formatClock(data.avg_seconds) : "—"} caption="média respondendo" tone="neutral" icon="clock" />
      </div>
      <Card style={R} padding={28}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, font: "600 18px var(--font-sans)" }}>Evolução da acurácia</h3>
          <SegmentedControl label="Período" value={days} onChange={setDays} options={PERIODS} />
        </div>
        <AccuracyChart daily={data.daily} days={data.days} />
      </Card>
      <Card style={R} padding={28}>
        <h3 style={{ margin: "0 0 18px", font: "600 18px var(--font-sans)" }}>Por grande área</h3>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: "18px 40px" }}>
          {data.areas.map((area) => {
            const value = percent(area.correct, area.attempts);
            return (
              <ProgressBar
                key={area.area}
                label={areaLabel(area.area)}
                valueLabel={area.attempts ? `${value}% · ${area.attempts}q` : "sem respostas"}
                value={value}
                height={8}
                color={`var(${areaOf(area.area).tone})`}
              />
            );
          })}
        </div>
      </Card>
      <ErrorProfile go={go} days={days} />
    </>
  );
}
