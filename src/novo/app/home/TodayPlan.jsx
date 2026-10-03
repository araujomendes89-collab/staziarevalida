// Plano de hoje com dados do banco (app_today).
// Mesma marcação da TodayScreen do kit (prototype/OtherScreens.jsx). "Personalizar plano"
// grava a data da prova e o tempo de estudo por dia no perfil e refaz o que ainda não foi feito.
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Banner, Button, Card, Checkbox, EmptyState, ProgressBar, SegmentedControl, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { percent } from "../practice/format.js";
import { KIND_LABEL, planHeadline, progressText, reasonText } from "./plan.js";

const MINUTES = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1 h" },
  { value: "120", label: "2 h" },
  { value: "180", label: "3 h ou mais" },
];
const CTA = { praticar: "Resolver questões", revisar: "Revisar agora" };

function Personalize({ profile, onSave, onCancel }) {
  const [minutes, setMinutes] = React.useState(String(MINUTES.find((m) => Number(m.value) >= (profile.daily_minutes ?? 60))?.value ?? "180"));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const today = new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD no fuso local

  const submit = async (event) => {
    event.preventDefault();
    const examDate = event.target.exam_date.value || null;
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
    <Card>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 20 }} noValidate>
        <div>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Personalizar plano</h3>
          <p style={{ margin: "4px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            O tempo por dia define quantas questões entram no plano. A data da prova aparece na contagem do Início.
          </p>
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 20, alignItems: "start" }}>
          <TextField name="exam_date" label="Data da prova" type="date" min={today} defaultValue={profile.exam_date ?? ""} hint="Deixe em branco se ainda não souber." />
          <div>
            <div className="sm-field__label" style={{ marginBottom: 10 }}>
              Tempo de estudo por dia
            </div>
            <SegmentedControl fullWidth label="Tempo de estudo por dia" value={minutes} onChange={setMinutes} options={MINUTES} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Salvar
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function TodayPlan({ go }) {
  const { backend, boot, updateProfile } = useSession();
  const [params, setParams] = useSearchParams();
  const adjusting = params.get("ajustar") === "1";
  const setAdjusting = (on) => setParams(on ? { ajustar: "1" } : {}, { replace: true });
  const [plan, setPlan] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

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
    setAdjusting(false);
  };

  const focus = plan.tasks.find((t) => !t.done);
  return (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      <Card variant="brand">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 360px" }}>
            <span className="sm-overline">Ciclo diário recomendado</span>
            <h2 style={{ margin: "6px 0 6px", font: "var(--type-h2)" }}>{planHeadline(plan)}</h2>
            <p style={{ margin: 0, color: "var(--text-secondary)", textWrap: "pretty" }}>
              {focus ? reasonText(focus) : "Você cumpriu o que estava previsto para hoje. Se quiser seguir, monte um treino livre em Questões."}
            </p>
          </div>
          <Button variant="secondary" icon="sliders-horizontal" onClick={() => setAdjusting(!adjusting)} aria-expanded={adjusting}>
            Personalizar plano
          </Button>
        </div>
      </Card>
      {adjusting && <Personalize profile={boot.profile} onSave={save} onCancel={() => setAdjusting(false)} />}
      {plan.total === 0 ? (
        <EmptyState icon="list-checks" title="Sem tarefas para hoje" description="Monte um treino em Questões para começar." action={<Button onClick={() => go("questoes")}>Montar treino</Button>} />
      ) : (
        <>
          <Card>
            <ProgressBar
              label="Progresso de hoje"
              valueLabel={`${plan.done} de ${plan.total} ${plan.total === 1 ? "tarefa concluída" : "tarefas concluídas"} (${percent(plan.done, plan.total)}%)`}
              value={plan.done}
              max={plan.total}
              height={10}
            />
          </Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Etapas do ciclo de hoje</h3>
            {plan.tasks.map((task, index) => (
              <Card key={task.id} padding={20}>
                <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  <Checkbox aria-label={`Marcar ${task.title} como concluída`} checked={task.done} onChange={() => toggle(task)} />
                  <span style={{ width: 32, height: 32, borderRadius: "50%", background: task.done ? "var(--success-bg)" : "var(--surface-sunken)", color: task.done ? "var(--success-text)" : "var(--text-secondary)", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "700 14px var(--font-sans)" }}>
                    {index + 1}
                  </span>
                  <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="sm-overline">{KIND_LABEL[task.kind]}</span>
                      <span style={{ font: "var(--type-data)", fontSize: 12, color: "var(--text-tertiary)" }}>{task.minutes} min</span>
                    </div>
                    <div style={{ font: "600 16px/1.35 var(--font-sans)", marginTop: 4, textDecoration: task.done ? "line-through" : "none", color: task.done ? "var(--text-tertiary)" : "var(--text-primary)" }}>{task.title}</div>
                    <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{progressText(task)}</div>
                  </div>
                  {task.done ? (
                    <Badge tone="success" icon="check">
                      Concluída
                    </Badge>
                  ) : (
                    <Button variant="secondary" size="sm" iconRight="arrow-right" onClick={() => start(task)} disabled={busy}>
                      {CTA[task.kind] ?? "Abrir"}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
