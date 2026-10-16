// Plano de hoje com dados do banco (app_today). Visual do pacote "Novas telas" (PlanoWeb, PlanoTablet, PlanoMobile e as versões "Personalizar"),
// onda 2, 15/10/2026. "Personalizar plano" grava a data da prova e o tempo de estudo por dia no perfil e refaz o que ainda não foi feito.
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Banner, Button, EmptyState, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { useLayout } from "../shell/useLayout.js";
import { AppRealIcon } from "../AppIcons.jsx";
import { percent } from "../practice/format.js";
import { IneditasCard, useMyIneditas } from "../practice/IneditasCard.jsx";
import { KIND_LABEL, planHeadline, progressText, reasonText } from "./plan.js";
import { Mono, Ring, TaskIcon, taskTile } from "./parts.jsx";
import { areaLabel } from "../practice/format.js";
import "./inicio.css";

// [minutos, rótulo, descrição]
const MINUTES = [
  ["30", "30 min", "leve"],
  ["60", "1 h", "equilibrado"],
  ["120", "2 h", "intenso"],
  ["180", "3 h+", "reta final"],
];
const MINUTES_TEXT = { 30: "30 min", 60: "1 h", 120: "2 h", 180: "3 h ou mais" };
const CTA = { praticar: "Resolver questões", revisar: "Revisar agora" };

/** Janela "Personalizar plano": data da prova e tempo por dia. Fecha com Esc, com o fundo ou em Cancelar; devolve o foco ao botão que abriu. */
function PersonalizeDialog({ profile, onSave, onCancel }) {
  const [minutes, setMinutes] = React.useState(String(MINUTES.find(([v]) => Number(v) >= (profile.daily_minutes ?? 60))?.[0] ?? "180"));
  const [date, setDate] = React.useState(profile.exam_date ?? "");
  const [noDate, setNoDate] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const ref = React.useRef(null);
  const today = new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD no fuso local

  React.useEffect(() => {
    const opener = document.activeElement;
    const first = ref.current && ref.current.querySelector("input[type=date]");
    if (first) first.focus();
    const key = (e) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Tab" && ref.current) {
        const f = [...ref.current.querySelectorAll("button,input:not([disabled])")].filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (opener && opener.focus) opener.focus();
    };
  }, [onCancel]);

  const submit = async (event) => {
    event.preventDefault();
    const examDate = noDate ? null : date || null;
    if (examDate && examDate < today) {
      setError("A data da prova precisa ser hoje ou depois.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ exam_date: examDate, daily_minutes: Number(minutes) });
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="ipd-back" onClick={onCancel} aria-label="Fechar" tabIndex={-1} />
      <form ref={ref} role="dialog" aria-modal="true" aria-labelledby="ipd-title" className="ipd" onSubmit={submit} noValidate>
        <div className="ipd-h">
          <span className="ipd-ic">{AppRealIcon({ name: "list-checks", size: 30 })}</span>
          <div>
            <h2 id="ipd-title">Personalizar plano</h2>
            <p>O tempo por dia define quantas questões entram no plano. A data da prova aparece na contagem do Início.</p>
          </div>
          <button type="button" className="ipd-x" onClick={onCancel} aria-label="Fechar">
            <Icon name="x" size={20} />
          </button>
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="ipd-f">
          <label htmlFor="ipd-date">Data da prova</label>
          <input id="ipd-date" name="exam_date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} disabled={noDate} />
          <span className="ipd-hint">Deixe em branco se ainda não souber.</span>
          <label className="ipd-unk">
            <input type="checkbox" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} />
            Ainda não sei a data da prova
          </label>
        </div>
        <fieldset>
          <legend>Tempo de estudo por dia</legend>
          <div role="radiogroup" aria-label="Tempo de estudo por dia" className="ipd-times">
            {MINUTES.map(([v, l, d]) => (
              <button key={v} type="button" role="radio" aria-checked={minutes === v} className="ipd-time" onClick={() => setMinutes(v)}>
                <b>{l}</b>
                <small>{d}</small>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="ipd-act">
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="p" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </>
  );
}

const chipText = (focus) => {
  if (!focus) return "Ciclo concluído";
  if (focus.ref?.reason === "diagnostic") return "Diagnóstico · ciclo recomendado";
  if (focus.kind === "revisar") return "Revisão · ciclo recomendado";
  return focus.ref?.area ? `${areaLabel(focus.ref.area)} · ciclo recomendado` : "Ciclo recomendado";
};
const dateBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

export function TodayPlan({ go }) {
  const { backend, boot, updateProfile } = useSession();
  const compact = useLayout() === "mobile";
  const [params, setParams] = useSearchParams();
  const adjusting = params.get("ajustar") === "1";
  const setAdjusting = React.useCallback((on) => setParams(on ? { ajustar: "1" } : {}, { replace: true }), [setParams]);
  const [plan, setPlan] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(null);
  const ineditas = useMyIneditas(backend);

  React.useEffect(() => {
    let alive = true;
    backend
      .rpc("app_today")
      .then((result) => alive && setPlan(result))
      .catch(() => alive && setError("Não foi possível carregar o plano de hoje. Recarregue a página."));
    return () => {
      alive = false;
    };
  }, [backend]);

  if (!plan) return error ? <Banner tone="danger">{error}</Banner> : <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;

  const start = async (task) => {
    setBusy(true);
    setError(null);
    try {
      const started = await backend.rpc("app_start_plan_task", { p_task_id: task.id });
      go("sessao", { s: started.session_id });
    } catch {
      setError("Não foi possível abrir o treino. Tente de novo.");
      setBusy(false);
    }
  };
  const toggle = async (task) => {
    try {
      setPlan(await backend.rpc("app_set_plan_task", { p_task_id: task.id, p_done: !task.done }));
    } catch {
      setError("Não foi possível atualizar a tarefa. Tente de novo.");
    }
  };
  const save = async (patch) => {
    await updateProfile(patch);
    setPlan(await backend.rpc("app_today", { p_rebuild: true }));
    setSaved(`Plano atualizado: ${MINUTES_TEXT[patch.daily_minutes] ?? `${patch.daily_minutes} min`} por dia${patch.exam_date ? ` · prova em ${dateBR(patch.exam_date)}` : ""}.`);
    setAdjusting(false);
  };

  const focus = plan.tasks.find((t) => !t.done);
  const totalMinutes = plan.tasks.reduce((n, t) => n + (Number(t.minutes) || 0), 0);
  const pct = percent(plan.done, plan.total);
  const stepIndex = focus ? plan.tasks.indexOf(focus) + 1 : 0;

  return (
    <div className="ih ip">
      {error && <Banner tone="danger">{error}</Banner>}
      {saved && (
        <div role="status" className="ip-ok">
          <Icon name="circle-check" size={18} />
          <span>{saved}</span>
        </div>
      )}
      <section className="ih-hero" aria-label="Foco de hoje">
        <div className="ih-hero-main">
          <div className="ih-hero-txt" style={{ flex: "1 1 260px", gap: 8 }}>
            <span className="ip-chip">
              <i />
              {chipText(focus)}
            </span>
            <h2>{planHeadline(plan)}</h2>
            <span className="ih-hero-sub">{focus ? reasonText(focus) : "Você cumpriu o que estava previsto para hoje. Se quiser seguir, monte um treino livre em Questões."}</span>
          </div>
          {plan.total > 0 && (
            <div className="ip-ring">
              <Ring value={plan.done} total={plan.total} size={compact ? 76 : 104} stroke={compact ? 7 : 8}>
                <span className="ih-ring-n">
                  {plan.done}
                  <small>/{plan.total}</small>
                </span>
                <span className="ih-ring-u">etapas</span>
              </Ring>
              <span className="ip-pc">
                <b>{pct}% concluído</b>
                {totalMinutes > 0 && (
                  <span>
                    cerca de <Mono>{totalMinutes} min</Mono> no total
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </section>

      {plan.total === 0 ? (
        <EmptyState icon="list-checks" title="Sem tarefas para hoje" description="Monte um treino em Questões para começar." action={<Button onClick={() => go("questoes")}>Montar treino</Button>} />
      ) : (
        <section className="ip-sec" aria-label="Etapas do ciclo de hoje">
          <h2 className="ip-h2">Etapas do ciclo de hoje</h2>
          <ol className="ip-ol">
            {plan.tasks.map((task, index) => {
              const now = focus && task.id === focus.id;
              const last = index === plan.tasks.length - 1;
              return (
                <li key={task.id} className="ip-li">
                  {!last && <span className="ip-line" aria-hidden="true" />}
                  <button type="button" role="checkbox" aria-checked={task.done} aria-label={`Marcar ${task.title} como concluída`} className={`ip-n${task.done ? " ip-n--done" : now ? " ip-n--now" : ""}`} onClick={() => toggle(task)}>
                    {task.done ? <Icon name="check" size={16} /> : index + 1}
                  </button>
                  <div className={`ip-step${now ? " ip-step--now" : ""}`}>
                    <span className="ip-step-l">
                      <span className={`ih-tile ${taskTile(task.kind)}`}>
                        <TaskIcon kind={task.kind} size={32} />
                      </span>
                      <span className="ip-step-t">
                        <span className={`ip-kind${task.kind === "revisar" ? " ip-kind--rev" : task.kind === "estudar" ? " ip-kind--est" : ""}`}>
                          {KIND_LABEL[task.kind]} · <span className="ih-mono">{task.minutes} min</span>
                          {now ? " · Agora" : ""}
                        </span>
                        <span className={`ip-name${task.done ? " ip-name--done" : ""}`}>{task.title}</span>
                        <span className="ip-prog">
                          <i>
                            <b style={{ width: `${percent(task.progress, task.target)}%` }} />
                          </i>
                          <span>{progressText(task)}</span>
                        </span>
                      </span>
                    </span>
                    {task.done ? (
                      <span className="ih-pill ih-pill--done" style={{ justifySelf: "start" }}>
                        <Icon name="check" size={14} />
                        Concluída
                      </span>
                    ) : (
                      <button type="button" className={`ip-btn${now ? " ip-btn--p" : ""}`} onClick={() => start(task)} disabled={busy}>
                        {CTA[task.kind] ?? "Abrir"} <Icon name="arrow-right" size={16} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {ineditas && <IneditasCard variant="plano" ineditas={ineditas} onPlans={() => go("planos")} onOpen={({ status }) => go("questoes", { prova: "staziamed", status })} />}

      {compact && focus && (
        <>
          <div style={{ height: 64 }} aria-hidden="true" />
          <div className="ip-sticky" role="region" aria-label="Etapa atual">
            <span className="ip-sticky-t">
              <small>
                Etapa {stepIndex} de {plan.total} · {focus.minutes} min
              </small>
              <b>{focus.title}</b>
            </span>
            <button type="button" onClick={() => start(focus)} disabled={busy}>
              {focus.progress > 0 ? "Continuar" : "Começar"}
            </button>
          </div>
        </>
      )}

      {adjusting && <PersonalizeDialog profile={boot.profile} onSave={save} onCancel={() => setAdjusting(false)} />}
    </div>
  );
}
