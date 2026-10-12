// Montar treino (Questões) e simulado, com dados do banco.
// Mesma marcação do Builder do protótipo (prototype/Session.jsx); muda de onde vêm os números.
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Banner, Button, Card, Chip, EmptyState, Icon, SegmentedControl, SelectField, TextField } from "../../ds";
import { IconTile } from "../../prototype/RealIcons.jsx";
import { useMobile } from "../Shell.jsx";
import { useSession } from "../session.jsx";
import { isPlanLockMessage, usePlanLock, withSupport } from "../plan/planAccess.js";
import { useSupportEmail } from "../support/supportContact.jsx";
import "./practice.css";
import { AREAS, SIM_MAX_MINUTES, STAZIAMED_NOTICE, areaLabel, examLabel, formatClock, formatMinutes, formatWhen, paceLabel, parseDuration, percent } from "./format.js";

const STATUS_OPTIONS = [
  { value: "unanswered", label: "Não resolvidas" },
  { value: "wrong", label: "Erradas" },
  { value: "bookmarked", label: "Marcadas" },
  { value: "all", label: "Todas" },
];
const SIM_TYPES = [
  { value: "rapido", label: "Rápido" },
  { value: "area", label: "Por área" },
  { value: "geral", label: "Geral" },
  { value: "pers", label: "Personalizado" },
];
// Segundos por questão em cada cronômetro (prova: 100 questões em 5 h).
const PACE = { prova: 180, acelerado: 72 };
// Atalhos do tempo personalizado (minutos); o aluno também digita horas e minutos.
const DURATION_PRESETS = [30, 60, 90, 120, 180, 300];

function useDebounced(value, delay) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function RecentSessions({ sessions, go, sim }) {
  return (
    <Card style={{ borderRadius: 24 }} padding={20}>
      <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
        {sim ? "Seus simulados" : "Seus treinos"}
      </span>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
        {sessions.map((s, index) => {
          const open = !s.finished_at;
          // anuladas pela banca não contam como acerto nem erro (o banco já as tira de respondidas e acertos)
          const base = sim ? s.total - (s.annulled ?? 0) : s.answered;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => go("sessao", { s: s.id })}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", border: 0, borderTop: index ? "1px solid var(--border-subtle)" : 0, background: "transparent", cursor: "pointer", font: "inherit", color: "var(--text-primary)", textAlign: "left" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "var(--type-label)" }}>
                  {s.total} questões · {areaLabel(s.filters?.area)}
                </div>
                <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
                  {formatWhen(s.started_at)}
                  {open && ` · ${s.answered}/${s.total} respondidas`}
                  {open && s.paused && s.remaining_seconds != null && ` · faltam ${formatClock(s.remaining_seconds)}`}
                </div>
              </div>
              {open && s.paused ? (
                <Badge icon="pause">Pausado</Badge>
              ) : open ? (
                <Badge tone={s.expired ? "warning" : "info"}>{s.expired ? "Tempo encerrado" : "Continuar"}</Badge>
              ) : (
                <Badge tone={percent(s.correct, base) >= 60 ? "success" : "neutral"}>
                  {s.correct}/{base} · {percent(s.correct, base)}%
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

export function QuestionBuilder({ go, mode }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const sim = mode === "sim";
  // Teste grátis terminado (ou sem plano pago): simulado completo fica nos planos pagos; o treino de questões segue aberto (PL02).
  const planLock = usePlanLock();
  const supportEmail = useSupportEmail();
  const lock = sim ? planLock : null;
  const kind = sim ? "simulado" : "questoes";

  // O endereço pode trazer um ponto de partida (ex.: tema prioritário escolhido no Início).
  const [params] = useSearchParams();
  const [form, setForm] = React.useState(() => {
    const area = params.get("area");
    const status = params.get("status");
    return {
      area: AREAS.some((a) => a.id === area) ? area : "",
      search: params.get("tema") ?? "",
      exam: params.get("prova") === "staziamed" ? "staziamed" : "",
      status: sim ? "all" : STATUS_OPTIONS.some((o) => o.value === status) ? status : "unanswered",
      count: sim ? "30" : "20",
      timer: "prova",
      hours: "",
      minutes: "",
    };
  });
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  // O tipo de simulado é um atalho: preenche os campos. Mexer num campo depois vira "Personalizado"
  // (menos a área em "Por área" e o cronômetro, que não fazem parte do atalho: o cronômetro muda por set()).
  const [simType, setSimType] = React.useState("rapido");
  const edit = (patch) => {
    set(patch);
    if (sim && !("timer" in patch) && !(simType === "area" && patch.area)) setSimType("pers");
  };
  const applySimType = (type) => {
    setSimType(type);
    if (type === "rapido") set({ area: "", search: "", exam: "", count: "30" });
    else if (type === "geral") set({ area: "", search: "", exam: "", count: "100" });
    else if (type === "area") set({ area: form.area || AREAS[0].id, search: "", exam: "", count: "50" });
  };
  const [options, setOptions] = React.useState(null);
  const [counts, setCounts] = React.useState(null);
  const [recent, setRecent] = React.useState([]);
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    backend
      .rpc("app_question_filters")
      .then((result) => alive && setOptions(result))
      .catch(() => alive && setError("Não foi possível carregar o banco de questões. Recarregue a página."));
    backend
      .rpc("app_recent_sessions", { p_kind: kind, p_limit: 4 })
      .then((result) => alive && setRecent(result))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [backend, kind]);

  const search = useDebounced(form.search.trim(), 300);
  React.useEffect(() => {
    let alive = true;
    backend
      .rpc("app_count_questions", { p_filters: { exam_id: form.exam, search, status: form.status } })
      .then((result) => alive && setCounts(result))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [backend, form.exam, form.status, search]);

  const requested = Number(form.count);
  const available = counts ? (form.area ? counts.by_area[form.area] ?? 0 : counts.total) : null;
  const total = available === null ? requested : Math.min(requested, available);
  // Tempo personalizado: o aluno escolhe horas e minutos (de 1 minuto a 12 horas).
  const custom = parseDuration(form.hours, form.minutes);
  const customInvalid = sim && form.timer === "custom" && !!custom.error;
  const limitSeconds = !sim || form.timer === "none" ? null : form.timer === "custom" ? (custom.minutes ?? 0) * 60 || null : total * PACE[form.timer];
  const chooseTimer = (timer) => {
    // Na primeira vez, o tempo personalizado começa no tempo de prova da quantidade escolhida.
    if (timer === "custom" && form.hours === "" && form.minutes === "") {
      const minutes = Math.min(SIM_MAX_MINUTES, Math.max(1, Math.round((total * PACE.prova) / 60)));
      set({ timer, hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) });
    } else set({ timer });
  };
  const setDuration = (minutes) => set({ hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) });

  // Questões Inéditas (a prova "staziamed" da lista): aberta a quem tem plano pago ou teste grátis em dia; para os outros, cadeado e convite
  const ineditas = (options?.exams ?? []).find((e) => e.id === "staziamed") ?? null;
  const onIneditas = form.exam === "staziamed";
  const lockedIneditas = onIneditas && (ineditas?.locked === true || !ineditas);
  const lockMessage = ineditas?.lock_message || "As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia. As questões das provas oficiais continuam abertas.";
  const topics = (options?.topics ?? []).filter((t) => !form.area || t.area === form.area).slice(0, 6);
  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const started = await backend.rpc("app_start_session", {
        p_kind: kind,
        p_filters: { area: form.area, exam_id: form.exam, search: form.search.trim(), status: form.status },
        p_count: requested,
        p_time_limit_seconds: limitSeconds,
      });
      go("sessao", { s: started.session_id });
    } catch (e) {
      setError(isPlanLockMessage(e?.message) ? withSupport(e.message, supportEmail) : "Não foi possível iniciar. Ajuste os filtros e tente de novo.");
      setStarting(false);
    }
  };

  if (options && options.total === 0) {
    return <EmptyState icon="file-question" title="Banco de questões vazio" description="Ainda não há questões carregadas neste ambiente." />;
  }

  const areaCards = [{ id: "", label: "Todas", icon: "library", tone: "brand" }, ...AREAS];
  const summary = [
    areaLabel(form.area),
    sim ? (limitSeconds ? `${formatMinutes(limitSeconds / 60)} de prova` : form.timer === "none" ? "sem cronômetro" : "tempo a definir") : `~${formatMinutes(total * 2)}`,
    form.search.trim(),
  ].filter(Boolean);

  return (
    <div style={{ display: "grid", gridTemplateColumns: mobile ? "minmax(0,1fr)" : "minmax(0,1fr) 340px", gap: 24, alignItems: "start" }}>
      {lock && (
        <div style={{ gridColumn: "1 / -1" }}>
          <Banner tone="warning" icon="lock" title={lock.title} action={<Button size="sm" variant="secondary" onClick={() => go("planos")}>Ver planos</Button>}>
            {lock.text}
          </Banner>
        </div>
      )}
      <Card style={{ borderRadius: 24 }} padding={mobile ? 22 : 32}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {sim && (
            <div className="qb-simtype">
              <SegmentedControl fullWidth label="Tipo de simulado" value={simType} onChange={applySimType} options={SIM_TYPES} />
            </div>
          )}
          <TextField
            label="Tema ou assunto"
            icon="search"
            placeholder="Ex.: asma, sepse, pré-eclâmpsia"
            value={form.search}
            onChange={(e) => edit({ search: e.target.value })}
          />
          {topics.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: -16 }}>
              {topics.map((t) => (
                <Chip key={`${t.area}-${t.topic}`} selected={form.search === t.topic} onClick={() => edit({ search: form.search === t.topic ? "" : t.topic })}>
                  {t.topic}
                </Chip>
              ))}
            </div>
          )}
          <div role="radiogroup" aria-label="Grande área" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>
            {areaCards.map((area) => {
              const on = form.area === area.id;
              const count = counts ? (area.id ? counts.by_area[area.id] ?? 0 : counts.total) : null;
              return (
                <button
                  key={area.id || "todas"}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => edit({ area: area.id })}
                  style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, padding: 16, borderRadius: 16, border: `${on ? 2 : 1}px solid ${on ? "var(--selected-border)" : "var(--border-default)"}`, background: on ? "var(--selected-bg)" : "var(--surface-card)", cursor: "pointer", font: "inherit", color: "var(--text-primary)", textAlign: "left" }}
                >
                  <IconTile name={area.icon} size={40} tone={area.tone} />
                  <span style={{ font: "var(--type-label)" }}>{area.label}</span>
                  <span style={{ font: "500 12px var(--font-mono)", color: "var(--text-tertiary)" }}>{count === null ? "…" : `${count} q.`}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <SelectField
              label="Prova / edição"
              value={form.exam}
              onChange={(e) => edit({ exam: e.target.value })}
              options={[{ value: "", label: "Todas as provas oficiais" }, ...(options?.exams ?? []).map((e) => ({ value: e.id, label: e.id === "staziamed" && e.locked ? `${examLabel(e)} (indisponível no seu plano agora)` : examLabel(e) }))]}
            />
            {sim ? (
              <SelectField
                label="Cronômetro"
                value={form.timer}
                onChange={(e) => chooseTimer(e.target.value)}
                options={[
                  { value: "prova", label: `Tempo de prova (${formatMinutes((total * PACE.prova) / 60)})` },
                  { value: "acelerado", label: `Acelerado (${formatMinutes((total * PACE.acelerado) / 60)})` },
                  { value: "custom", label: form.timer === "custom" && custom.minutes ? `Tempo personalizado (${formatMinutes(custom.minutes)})` : "Tempo personalizado" },
                  { value: "none", label: "Sem cronômetro" },
                ]}
              />
            ) : (
              <SelectField label="Status" value={form.status} onChange={(e) => edit({ status: e.target.value })} options={STATUS_OPTIONS} />
            )}
          </div>
          {onIneditas && !lockedIneditas && (
            <Banner tone="info" icon="shield-check" title="Questões Inéditas">
              {STAZIAMED_NOTICE} Aqui "inéditas" quer dizer escritas pela StaziaMed; não é o mesmo que "ainda não respondidas" (isso é o filtro Status).
            </Banner>
          )}
          {lockedIneditas && (
            <Banner
              tone="warning"
              icon="lock"
              title="Questões Inéditas indisponíveis agora"
              action={
                <Button size="sm" variant="secondary" onClick={() => go("planos")}>
                  Ver planos
                </Button>
              }
            >
              {lockMessage}
            </Banner>
          )}
          {sim && form.timer === "custom" && (
            <div role="group" aria-labelledby="sim-duracao">
              <div id="sim-duracao" className="sm-field__label" style={{ marginBottom: 10 }}>
                Duração do simulado
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {DURATION_PRESETS.map((minutes) => (
                  <Chip key={minutes} selected={custom.minutes === minutes} onClick={() => setDuration(minutes)}>
                    {formatMinutes(minutes)}
                  </Chip>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <TextField label="Horas" type="number" inputMode="numeric" min={0} max={12} step={1} value={form.hours} onChange={(e) => set({ hours: e.target.value })} />
                <TextField label="Minutos" type="number" inputMode="numeric" min={0} max={59} step={1} value={form.minutes} onChange={(e) => set({ minutes: e.target.value })} />
              </div>
              <div className={custom.error ? "sm-field__error" : "sm-field__hint"} style={{ marginTop: 8 }} aria-live="polite">
                {custom.error ? (
                  <>
                    <Icon name="circle-alert" size={14} />
                    {custom.error}
                  </>
                ) : (
                  `${formatMinutes(custom.minutes)} para ${total} ${total === 1 ? "questão" : "questões"} · ${paceLabel((custom.minutes * 60) / Math.max(total, 1))} · você pode pausar durante o simulado`
                )}
              </div>
            </div>
          )}
          <div>
            <div className="sm-field__label" style={{ marginBottom: 10 }}>
              Quantidade
            </div>
            <SegmentedControl fullWidth label="Quantidade" value={form.count} onChange={(count) => edit({ count })} options={sim ? ["30", "50", "100"] : ["10", "20", "30", "50"]} />
          </div>
        </div>
      </Card>
      <div style={{ position: mobile ? "static" : "sticky", top: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <Card style={{ borderRadius: 24 }} padding={24}>
          <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
            Resumo
          </span>
          <div style={{ font: "700 34px/1.1 var(--font-sans)", letterSpacing: "-0.02em", marginTop: 10 }}>
            {total} {total === 1 ? "questão" : "questões"}
          </div>
          <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>{summary.join(" · ")}</div>
          {available !== null && (
            <div style={{ font: "var(--type-body-sm)", color: available < requested ? "var(--warning-text)" : "var(--text-tertiary)", marginTop: 8 }} aria-live="polite">
              {lockedIneditas
                ? "Disponível nos planos pagos e no teste grátis em dia."
                : available === 0
                ? "Nenhuma questão com esses filtros."
                : available < requested
                  ? `Só há ${available} com esses filtros.`
                  : `${available} disponíveis com esses filtros.`}
            </div>
          )}
          {error && (
            <div style={{ marginTop: 16 }}>
              <Banner tone="danger">{error}</Banner>
            </div>
          )}
          <div style={{ marginTop: 20 }}>
            <Button size="lg" fullWidth iconRight="arrow-right" onClick={start} loading={starting} disabled={!available || customInvalid || Boolean(lock) || lockedIneditas}>
              {sim ? "Iniciar simulado" : "Começar treino"}
            </Button>
          </div>
        </Card>
        {recent.length > 0 && <RecentSessions sessions={recent} go={go} sim={sim} />}
      </div>
    </div>
  );
}
