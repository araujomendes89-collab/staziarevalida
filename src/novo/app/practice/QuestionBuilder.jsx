// Montar treino (Questões) e simulado, com dados do banco.
// Mesma marcação do Builder do protótipo (prototype/Session.jsx); muda de onde vêm os números.
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Banner, Button, Card, Chip, EmptyState, Icon, SegmentedControl, SelectField, TextField } from "../../ds";
import { AreaArtTile } from "../../ds/area-icons/AreaArtTile.jsx";
import { useMQ } from "../Shell.jsx";
import { useSession } from "../session.jsx";
import { isPlanLockMessage, usePlanLock, withSupport } from "../plan/planAccess.js";
import { useSupportEmail } from "../support/supportContact.jsx";
import "./practice.css";
import { AREAS, SIM_MAX_MINUTES, STAZIAMED_NOTICE, areaLabel, examLabel, formatClock, formatMinutes, formatWhen, paceLabel, parseDuration, percent } from "./format.js";
import { IneditasQuota, isIneditasLimited, quotaText } from "./IneditasQuota.jsx";
import { IneditasCard } from "./IneditasCard.jsx";
import { SCORING_MODES, TRI_MIN_QUESTIONS, TRI_SO_OFICIAIS } from "./tri.js";

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
// Nomes curtos no seletor de área do simulado no celular (como no pacote e no filtro de área do Aprender); o nome inteiro fica no aria-label.
const PICK_LABEL = { CLINICA_MEDICA: "Clínica", GINECOLOGIA_OBSTETRICIA: "GO", MEDICINA_FAMILIA_COMUNIDADE: "Preventiva" };

function useDebounced(value, delay) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// "Como corrigir?" do simulado: Clássico por acertos (padrão) ou TRI (estimativa StaziaMed, opcional).
// Computador e tablet: dois cartões com bolinha (visual do pacote). Celular: dois botões lado a lado e o texto do escolhido embaixo.
function ScoringChoice({ value, onChange, compact }) {
  if (compact) {
    const current = SCORING_MODES.find((m) => m.value === value) ?? SCORING_MODES[0];
    return (
      <div>
        <div id="sim-correcao" className="qb-label">
          Correção
        </div>
        <div className="qb-corrseg">
          <SegmentedControl fullWidth label="Como corrigir?" value={value} onChange={onChange} options={SCORING_MODES.map((m) => ({ value: m.value, label: m.value === "irt" ? "TRI · estimativa" : "Clássico" }))} />
        </div>
        <p className="sm-field__hint" style={{ margin: "10px 0 0" }}>
          {current.text}
        </p>
      </div>
    );
  }
  return (
    <div>
      <div id="sim-correcao" className="qb-label">
        Como corrigir?
      </div>
      <div role="radiogroup" aria-labelledby="sim-correcao" className="qb-corr">
        {SCORING_MODES.map((mode) => {
          const on = value === mode.value;
          return (
            <button key={mode.value} type="button" role="radio" aria-checked={on} aria-describedby={`sim-correcao-${mode.value}`} onClick={() => onChange(mode.value)} className="qb-corr__opt">
              <span className="qb-corr__head">
                <span className="qb-corr__dot" aria-hidden="true" />
                <span className="qb-corr__title">{mode.title}</span>
                <Badge size="sm" tone={mode.value === "irt" ? "info" : "neutral"}>
                  {mode.badge}
                </Badge>
              </span>
              <span id={`sim-correcao-${mode.value}`} className="qb-corr__text">
                {mode.text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Ring({ pct, done }) {
  return (
    <span className="qb-ring" aria-hidden="true">
      <svg width="42" height="42" viewBox="0 0 42 42">
        <circle cx="21" cy="21" r="18" fill="none" stroke="var(--info-bg)" strokeWidth="4" />
        <circle cx="21" cy="21" r="18" fill="none" stroke={done ? "var(--success-solid)" : "var(--action-primary)"} strokeWidth="4" strokeLinecap="round" pathLength="100" strokeDasharray={`${pct} 100`} />
      </svg>
      <span className={`qb-ring__dot${done ? " qb-ring__dot--done" : ""}`}>
        <Icon name={done ? "check" : "play"} size={12} />
      </span>
    </span>
  );
}

function RecentSessions({ sessions, go, sim }) {
  const anyOpen = sessions.some((s) => !s.finished_at);
  const title = sim ? "Seus simulados" : anyOpen ? "Continue um treino" : "Seus treinos";
  return (
    <section className="qb-recent" aria-label={title}>
      <h2>{title}</h2>
      <div>
        {sessions.map((s) => {
          const open = !s.finished_at;
          // anuladas pela banca não contam como acerto nem erro (o banco já as tira de respondidas e acertos)
          const base = sim ? s.total - (s.annulled ?? 0) : s.answered;
          const pct = open ? Math.max(3, Math.round((s.answered / Math.max(s.total, 1)) * 100)) : 100;
          return (
            <button key={s.id} type="button" className="qb-row" onClick={() => go("sessao", { s: s.id })}>
              <Ring pct={pct} done={!open} />
              <span className="qb-row__body">
                <span className="qb-row__title">
                  {s.total} questões · {areaLabel(s.filters?.area)}
                </span>
                <span className="qb-row__meta">
                  {open && (
                    <span className="qb-row__bar" aria-hidden="true">
                      <i style={{ width: `${pct}%` }} />
                    </span>
                  )}
                  <span>
                    {open && `${s.answered}/${s.total} · `}
                    {formatWhen(s.started_at)}
                    {open && s.paused && s.remaining_seconds != null && ` · faltam ${formatClock(s.remaining_seconds)}`}
                  </span>
                </span>
              </span>
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
    </section>
  );
}

export function QuestionBuilder({ go, mode }) {
  const { backend } = useSession();
  const compact = useMQ("(max-width: 719px)"); // celular: barra fixa com o resumo, abas e "Mais filtros"
  const [simTab, setSimTab] = React.useState("novo");
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
  // celular, simulado: tema e prova ficam em "Mais filtros" (abre sozinho se veio um filtro no endereço)
  const [moreOpen, setMoreOpen] = React.useState(() => Boolean(form.search || form.exam));
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
  // correção do simulado: "classic" (padrão) ou "irt" (TRI, estimativa StaziaMed)
  const [scoring, setScoring] = React.useState("classic");
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
  const tri = sim && scoring === "irt";
  const triTooFew = tri && total < TRI_MIN_QUESTIONS;
  const setDuration = (minutes) => set({ hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) });

  // Questões Inéditas (a prova "staziamed" da lista): aberta a quem tem plano pago ou teste grátis em dia; para os outros, cadeado e convite
  const ineditas = (options?.exams ?? []).find((e) => e.id === "staziamed") ?? null;
  const onIneditas = form.exam === "staziamed";
  const lockedIneditas = onIneditas && (ineditas?.locked === true || !ineditas);
  // TRI + prova "Questões Inéditas": o banco recusa (a nota TRI e a calibração são só de questões oficiais); a tela avisa antes e não deixa começar
  const triOnIneditas = tri && onIneditas;
  // Simulado comum (nenhuma prova escolhida) mistura algumas Questões Inéditas liberadas no plano (o percentual é do administrador); o TRI não
  const mixIneditas = sim && !tri && form.exam === "" && Boolean(ineditas) && ineditas.locked !== true && ineditas.released !== 0;
  const lockMessage = ineditas?.lock_message || "As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia. As questões das provas oficiais continuam abertas.";
  // limite do plano (ex.: teste grátis): a tela mostra o total existente e quantas o plano libera
  // no Banco de Questões o cartão "Questões Inéditas" do topo já mostra o contador; no Simulado o quadro aparece junto do filtro
  const limitedIneditas = isIneditasLimited(ineditas);
  const topics = (options?.topics ?? []).filter((t) => !form.area || t.area === form.area).slice(0, 6);
  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const filters = { area: form.area, exam_id: form.exam, search: form.search.trim(), status: form.status };
      const started = tri
        ? await backend.rpc("app_start_simulado_tri", { p_filters: filters, p_count: requested, p_time_limit_seconds: limitSeconds })
        : await backend.rpc("app_start_session", { p_kind: kind, p_filters: filters, p_count: requested, p_time_limit_seconds: limitSeconds });
      go("sessao", { s: started.session_id });
    } catch (e) {
      setError(
        isPlanLockMessage(e?.message)
          ? withSupport(e.message, supportEmail)
          : tri && /simulado TRI/.test(e?.message ?? "")
            ? e.message
            : "Não foi possível iniciar. Ajuste os filtros e tente de novo."
      );
      setStarting(false);
    }
  };

  // Atalho do cartão "Questões Inéditas": abre direto um treino só com elas (as que faltam; se já fez todas, as respondidas).
  // Se não abrir, deixa a prova "Questões Inéditas" escolhida no montador, com o aviso do motivo.
  const openIneditas = async ({ status }) => {
    setStarting(true);
    setError(null);
    try {
      const filters = { area: "", exam_id: "staziamed", search: "", status };
      const started = await backend.rpc("app_start_session", { p_kind: "questoes", p_filters: filters, p_count: 20, p_time_limit_seconds: null });
      go("sessao", { s: started.session_id });
    } catch (e) {
      set({ exam: "staziamed", status });
      setError(isPlanLockMessage(e?.message) ? withSupport(e.message, supportEmail) : "Não foi possível abrir as Questões Inéditas agora. Ajuste os filtros abaixo e tente de novo.");
      setStarting(false);
    }
  };

  if (options && options.total === 0) {
    return <EmptyState icon="file-question" title="Banco de questões vazio" description="Ainda não há questões carregadas neste ambiente." />;
  }

  const areaCards = [{ id: "", label: "Todas" }, ...AREAS];
  const summary = [
    areaLabel(form.area),
    sim ? (limitSeconds ? `${formatMinutes(limitSeconds / 60)} de prova` : form.timer === "none" ? "sem cronômetro" : "tempo a definir") : `~${formatMinutes(total * 2)}`,
    form.search.trim(),
    tri && "correção TRI (estimativa)",
  ].filter(Boolean);
  const noun = total === 1 ? "questão" : "questões";
  const canStart = Boolean(available) && !customInvalid && !lock && !lockedIneditas && !triTooFew && !triOnIneditas;
  const startLabel = sim ? "Iniciar simulado" : "Começar treino";
  const onlyNew = compact && sim && simTab === "novo";
  const onlyMine = compact && sim && simTab === "meus";

  const areaPicker = compact && sim ? (
    <div role="radiogroup" aria-label="Grande área" className="qb-scroll">
      {areaCards.map((area) => {
        const on = form.area === area.id;
        const count = counts ? (area.id ? counts.by_area[area.id] ?? 0 : counts.total) : null;
        return (
          <button key={area.id || "todas"} type="button" role="radio" aria-checked={on} aria-label={`${area.label} ${count === null ? "…" : count}`} onClick={() => edit({ area: area.id })} className="qb-pick">
            <AreaArtTile area={area.id} size={52} />
            <span className="qb-pick__name">{PICK_LABEL[area.id] ?? area.label}</span>
            <span className="qb-pick__n">{count === null ? "…" : count}</span>
          </button>
        );
      })}
    </div>
  ) : (
    <div role="radiogroup" aria-label="Grande área" className="qb-areas">
      {areaCards.map((area) => {
        const on = form.area === area.id;
        const count = counts ? (area.id ? counts.by_area[area.id] ?? 0 : counts.total) : null;
        return (
          <button key={area.id || "todas"} type="button" role="radio" aria-checked={on} onClick={() => edit({ area: area.id })} className="qb-area">
            <AreaArtTile area={area.id} />
            <span className="qb-area__name">{area.label}</span>
            <span className="qb-area__n">{count === null ? "…" : `${count} q.`}</span>
          </button>
        );
      })}
    </div>
  );

  const searchField = (
    <div className="qb-search" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <TextField label={<>Tema ou assunto <small style={{ fontWeight: 500, color: "var(--text-tertiary)" }}>(opcional)</small></>} icon="search" placeholder="Ex.: asma, sepse, pré-eclâmpsia" value={form.search} onChange={(e) => edit({ search: e.target.value })} />
      {topics.length > 0 && (
        <div className="qb-topics">
          {topics.map((t) => (
            <Chip key={`${t.area}-${t.topic}`} selected={form.search === t.topic} onClick={() => edit({ search: form.search === t.topic ? "" : t.topic })}>
              {t.topic}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );

  const examField = (
    <SelectField
      label="Prova / edição"
      value={form.exam}
      onChange={(e) => edit({ exam: e.target.value })}
      options={[{ value: "", label: mixIneditas ? "Todas as provas (oficiais e algumas Inéditas)" : "Todas as provas oficiais" }, ...(options?.exams ?? []).map((e) => ({ value: e.id, label: e.id === "staziamed" && e.locked ? `${examLabel(e)} (indisponível no seu plano agora)` : e.id === "staziamed" && isIneditasLimited(e) ? `${examLabel(e)} (${e.released} de ${e.total})` : examLabel(e) }))]}
    />
  );
  const timerField = (
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
  );
  const statusField = <SelectField label="Status" value={form.status} onChange={(e) => edit({ status: e.target.value })} options={STATUS_OPTIONS} />;

  const noticeBlocks = (
    <>
      {onIneditas && !lockedIneditas && (
        <Banner tone="info" icon="shield-check" title="Questões Inéditas">
          {STAZIAMED_NOTICE} Aqui "inéditas" quer dizer escritas pela StaziaMed; não é o mesmo que "ainda não respondidas"{sim ? "." : " (isso é o filtro Status)."}
        </Banner>
      )}
      {mixIneditas && (
        <p className="sm-field__hint" style={{ margin: 0 }}>
          Algumas questões deste simulado podem ser Questões Inéditas liberadas no seu plano (aparecem como “Questão Inédita”). O simulado TRI usa só questões oficiais.
        </p>
      )}
      {sim && onIneditas && limitedIneditas && <IneditasQuota ineditas={ineditas} onPlans={() => go("planos")} />}
      {lockedIneditas && (
        <Banner tone="warning" icon="lock" title="Questões Inéditas indisponíveis agora" action={<Button size="sm" variant="secondary" onClick={() => go("planos")}>Ver planos</Button>}>
          {lockMessage}
          {ineditas?.total > 0 && <div style={{ marginTop: 6 }}>Existem {ineditas.total} Questões Inéditas no banco.</div>}
        </Banner>
      )}
      {sim && form.timer === "custom" && (
        <div role="group" aria-labelledby="sim-duracao">
          <div id="sim-duracao" className="qb-label">
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
    </>
  );

  const availability =
    available === null
      ? null
      : lockedIneditas
        ? "Disponível nos planos pagos e no teste grátis em dia."
        : onIneditas && limitedIneditas && available === 0
          ? `Você já usou as ${ineditas.released} Questões Inéditas do seu plano com esses filtros. ${quotaText(ineditas)}.`
          : onIneditas && limitedIneditas
            ? `${available} disponíveis com esses filtros · ${quotaText(ineditas)}.`
            : available === 0
              ? "Nenhuma questão com esses filtros."
              : available < requested
                ? `Só há ${available} com esses filtros.`
                : `${available} disponíveis com esses filtros.`;
  const triNote = tri
    ? triOnIneditas
      ? TRI_SO_OFICIAIS
      : triTooFew
        ? `O simulado TRI precisa de pelo menos ${TRI_MIN_QUESTIONS} questões. Escolha mais questões ou tire filtros.`
        : total < 100
          ? `Correção TRI (estimativa StaziaMed): com ${total} questões a faixa de incerteza fica larga; com 100 fica mais precisa.`
          : "Correção TRI (estimativa StaziaMed): o resultado mostra a nota de 0 a 100 com a faixa de incerteza."
    : null;

  const recentBlock = recent.length > 0 && !onlyNew && <RecentSessions sessions={recent} go={go} sim={sim} />;

  return (
    <div className={`qb${sim ? " qb--sim" : ""}${compact ? " qb-compact" : ""}`}>
      {lock && (
        <Banner tone="warning" icon="lock" title={lock.title} action={<Button size="sm" variant="secondary" onClick={() => go("planos")}>Ver planos</Button>}>
          {lock.text}
        </Banner>
      )}
      {!sim && ineditas && <IneditasCard ineditas={ineditas} variant={compact ? "linha" : "banco"} onOpen={openIneditas} onPlans={() => go("planos")} busy={starting} />}
      {compact && sim && (
        <div className="qb-tabs" role="tablist" aria-label="Simulados">
          <button type="button" role="tab" className="qb-tab" aria-selected={simTab === "novo"} onClick={() => setSimTab("novo")}>
            Novo simulado
          </button>
          <button type="button" role="tab" className="qb-tab" aria-selected={simTab === "meus"} onClick={() => setSimTab("meus")}>
            Meus simulados
            {recent.length > 0 && <span className="qb-tab__n">{recent.length}</span>}
          </button>
        </div>
      )}
      {compact && !sim && recentBlock}
      {onlyMine && recent.length === 0 && <EmptyState icon="timer" title="Nenhum simulado ainda" description="Os simulados que você começar aparecem aqui." />}
      <div className="qb-grid">
        {!onlyMine && (
          <section className="qb-main" aria-label={sim ? "Montar simulado" : "Montar treino"}>
            {sim && (
              <div className="qb-simtype">
                <SegmentedControl fullWidth label="Tipo de simulado" value={simType} onChange={applySimType} options={SIM_TYPES} />
              </div>
            )}
            {sim && !compact && <ScoringChoice value={scoring} onChange={setScoring} />}
            <fieldset className="qb-set">
              <legend className="qb-label">Área</legend>
              {areaPicker}
            </fieldset>
            {sim && compact && (
              <div>
                <div className="qb-label">Questões</div>
                <div className="qb-num">
                  <SegmentedControl fullWidth label="Quantidade" value={form.count} onChange={(count) => edit({ count })} options={["30", "50", "100"]} />
                </div>
              </div>
            )}
            {sim && compact && <ScoringChoice value={scoring} onChange={setScoring} compact />}
            {sim && compact ? (
              <div className="qb-more">
                <button type="button" aria-expanded={moreOpen} aria-controls="qb-more-body" onClick={() => setMoreOpen(!moreOpen)}>
                  Mais filtros
                  <Icon name={moreOpen ? "chevron-up" : "chevron-down"} size={18} />
                </button>
                {moreOpen && (
                  <div id="qb-more-body" className="qb-more__body">
                    {searchField}
                    {examField}
                    {timerField}
                    {noticeBlocks}
                  </div>
                )}
              </div>
            ) : (
              <>
                {searchField}
                <div className="qb-two">
                  {examField}
                  {sim ? timerField : statusField}
                </div>
                {noticeBlocks}
              </>
            )}
            {!(sim && compact) && (
              <fieldset className="qb-set">
                <legend className="qb-label">Quantidade de questões</legend>
                <div className="qb-num">
                  <SegmentedControl fullWidth label="Quantidade" value={form.count} onChange={(count) => edit({ count })} options={sim ? ["30", "50", "100"] : ["10", "20", "30", "50"]} />
                </div>
              </fieldset>
            )}
            {compact && sim && !moreOpen && noticeBlocks}
          </section>
        )}
        {!compact && (
          <div className="qb-aside">
            <section className="qb-summary" aria-label="Resumo">
              <span className="qb-summary__eyebrow">{sim ? "Seu simulado" : "Seu treino"}</span>
              <span className="qb-summary__total">
                {total} {noun}
              </span>
              <span className="qb-summary__meta">{summary.join(" · ")}</span>
              {availability && (
                <span className={`qb-summary__note${available < requested || lockedIneditas ? " qb-summary__note--warn" : ""}`} aria-live="polite">
                  {availability}
                </span>
              )}
              {triNote && (
                <span className={`qb-summary__note${triTooFew || triOnIneditas ? " qb-summary__note--warn" : ""}`} aria-live="polite">
                  {triNote}
                </span>
              )}
              {error && (
                <div style={{ marginTop: 8 }}>
                  <Banner tone="danger">{error}</Banner>
                </div>
              )}
              <Button className="qb-summary__go" size="lg" fullWidth iconRight="arrow-right" onClick={start} loading={starting} disabled={!canStart}>
                {startLabel}
              </Button>
            </section>
            {recentBlock}
          </div>
        )}
        {compact && !onlyMine && (error || triNote || (availability && (lockedIneditas || available < requested))) && (
          <div aria-live="polite" style={{ gridColumn: "1 / -1" }}>
            {error ? <Banner tone="danger">{error}</Banner> : <p className="sm-field__hint" style={{ margin: 0, color: available < requested ? "var(--warning-text)" : undefined }}>{[availability, triNote].filter(Boolean).join(" ")}</p>}
          </div>
        )}
        {compact && sim && onlyMine && recentBlock}
      </div>
      {compact && !onlyMine && (
        <div className="qb-bar" role="region" aria-label="Resumo">
          <span className="qb-bar__text">
            <strong>
              {total} {noun}
              {sim ? ` · ${limitSeconds ? `${formatMinutes(limitSeconds / 60)} de prova` : form.timer === "none" ? "sem cronômetro" : "tempo a definir"}` : ` · ~${formatMinutes(total * 2)}`}
            </strong>
            <span>
              {areaLabel(form.area)}
              {available !== null && ` · ${available} disponíveis`}
            </span>
          </span>
          <Button size="md" aria-label={startLabel} onClick={start} loading={starting} disabled={!canStart}>
            {sim ? "Iniciar" : "Começar"}
          </Button>
        </div>
      )}
    </div>
  );
}
