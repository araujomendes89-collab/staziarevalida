// Administração › Configurações › Treinamento em Dupla: abre ou fecha o módulo para os alunos e escolhe quais planos entram.
// Equipe (administrador e editor) e revisores médicos entram sempre; quem decide o acesso é o banco (dupla_allowed).
import React from "react";
import { Banner, Button, Card, Checkbox, Switch } from "../../ds";
import { useSession } from "../session.jsx";
import { LoadError, Loading, messageOf, PLAN_LABEL, useLoad } from "./common.jsx";

const PLANS = ["trial", "pro", "elite"];
const DEFAULT = { aberto: false, planos: ["pro", "elite"] };

const normalize = (raw) => ({
  aberto: raw?.aberto === true,
  planos: Array.isArray(raw?.planos) ? PLANS.filter((plan) => raw.planos.includes(plan)) : DEFAULT.planos,
});

export function AdminDupla() {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_admin_settings"), [backend]);
  const [form, setForm] = React.useState(null);
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  React.useEffect(() => {
    if (data) setForm(normalize(data.treino_dupla ?? DEFAULT));
  }, [data]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!form) return <Loading />;

  const change = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setState((s) => ({ ...s, done: false }));
  };
  const togglePlan = (plan, on) => change({ planos: PLANS.filter((p) => (p === plan ? on : form.planos.includes(p))) });
  const save = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null, done: false });
    try {
      const saved = normalize(await backend.rpc("app_admin_save_dupla", { p_aberto: form.aberto, p_planos: form.planos }));
      setForm(saved);
      setState({ saving: false, error: null, done: true });
    } catch (err) {
      setState({ saving: false, error: messageOf(err), done: false });
    }
  };

  return (
    <form onSubmit={save} noValidate>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Treinamento em Dupla</h3>
          <Switch label="Abrir para os alunos" checked={form.aberto} onChange={(e) => change({ aberto: e.target.checked })} />
          <fieldset style={{ margin: 0, padding: 0, border: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <legend style={{ padding: 0, marginBottom: 8, font: "var(--type-label)", color: "var(--text-primary)" }}>Planos com acesso</legend>
            {PLANS.map((plan) => (
              <Checkbox key={plan} label={PLAN_LABEL[plan]} checked={form.planos.includes(plan)} onChange={(e) => togglePlan(plan, e.target.checked)} />
            ))}
          </fieldset>
          {state.error && <Banner tone="danger">{state.error}</Banner>}
          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
            {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Configurações salvas.</span>}
            <Button type="submit" loading={state.saving}>
              Salvar configurações
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
