// Administração › Configurações › Treinamento em Dupla: abre ou fecha o módulo para os alunos e escolhe quais planos entram.
// Equipe (administrador e editor) e revisores médicos entram sempre; quem decide o acesso é o banco (dupla_allowed).
// Também: "Avaliação por IA no treino sozinho" (DuplaIA: abre, planos e limites por aluno; o estado da função vem da Central de IAs)
// e "Uso do mês" (a dupla e, separado, o treino sozinho).
import React from "react";
import { Banner, Button, Card, Checkbox, StatTile, Switch, TextField } from "../../ds";
import { formatDecimal } from "../../ds/format.js";
import { useSession } from "../session.jsx";
import { usd } from "./ai/aiApi.js";
import { LoadError, Loading, messageOf, PLAN_LABEL, useLoad } from "./common.jsx";

const PLANS = ["trial", "pro", "elite"];
const DEFAULT = { aberto: false, planos: ["pro", "elite"] };

const normalize = (raw) => ({
  aberto: raw?.aberto === true,
  planos: Array.isArray(raw?.planos) ? PLANS.filter((plan) => raw.planos.includes(plan)) : DEFAULT.planos,
});

/**
 * "Uso do mês" (mês corrente, fuso de Brasília): salas abertas, rodadas avaliadas, alunos que treinaram e impressos liberados
 * por rodada, de app_admin_dupla_usage (só administrador). Embaixo e separado, o treino sozinho (`usage.sozinho`): treinos,
 * avaliações por IA, autoavaliações e o gasto com a IA do treino. Sem dado: "—".
 */
export function DuplaUsage() {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_admin_dupla_usage", {}), [backend]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const num = (v) => (typeof v === "number" ? String(v) : "—");
  const solo = data.sozinho && typeof data.sozinho === "object" ? data.sozinho : {};
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Uso do mês</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <StatTile label="Salas" value={num(data.salas)} icon="door-open" />
          <StatTile label="Rodadas avaliadas" value={num(data.rodadas_avaliadas)} icon="list-checks" />
          <StatTile label="Alunos que treinaram" value={num(data.alunos)} icon="users" />
          <StatTile
            label="Impressos por rodada"
            value={typeof data.impressos_por_rodada === "number" ? formatDecimal(data.impressos_por_rodada, 1) : "—"}
            icon="files"
          />
        </div>
        <div data-testid="uso-sozinho" style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
          <span style={{ font: "var(--type-label)", color: "var(--text-secondary)" }}>Treino sozinho</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <StatTile label="Treinos sozinhos" value={num(solo.treinos)} icon="user" />
            <StatTile label="Avaliações por IA" value={num(solo.ia)} icon="bot" />
            <StatTile label="Autoavaliações" value={num(solo.autoavaliacao)} icon="clipboard-check" />
            <StatTile label="Gasto com IA do treino" value={typeof solo.gasto_ia_usd === "number" ? usd(solo.gasto_ia_usd) : "—"} icon="wallet" />
          </div>
        </div>
      </div>
    </Card>
  );
}

const IA_DEFAULT = { aberto: false, planos: [], dia: "", mes: "" };
const limitText = (v) => (typeof v === "number" ? String(v) : "");
const normalizeIA = (raw) => ({
  aberto: raw?.aberto === true,
  planos: Array.isArray(raw?.planos) ? PLANS.filter((plan) => raw.planos.includes(plan)) : [],
  dia: limitText(raw?.limite_dia),
  mes: limitText(raw?.limite_mes),
});
const LIMIT_PROBLEM = "Limites inválidos: use números inteiros de 1 em diante, com o do mês maior ou igual ao do dia.";
/** "" vira nulo (vazio = IA bloqueada); inteiro vira número; qualquer outra coisa é inválida (undefined). */
const parseLimit = (text) => {
  const t = String(text).trim();
  if (t === "") return null;
  return /^\d+$/.test(t) ? Number(t) : undefined;
};

/**
 * "Avaliação por IA no treino sozinho": interruptor, planos e limites por aluno (por dia e por mês) em app_admin_dupla_ia /
 * app_admin_save_dupla_ia (só administrador grava). Limite vazio = IA bloqueada; nenhum número sugerido é salvo. O estado da
 * função vem da Central de IAs (funcao_pronta / funcao_motivo); `onOpenIAs` leva até lá.
 * @param {{ onOpenIAs?: () => void }} props
 */
export function DuplaIA({ onOpenIAs }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_admin_dupla_ia", {}), [backend]);
  const [form, setForm] = React.useState(null);
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  React.useEffect(() => {
    if (data) setForm(normalizeIA(data));
  }, [data]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data || !form) return <Loading />;

  const change = (patch) => {
    setForm((f) => ({ ...(f ?? IA_DEFAULT), ...patch }));
    setState((s) => ({ ...s, done: false }));
  };
  const togglePlan = (plan, on) => change({ planos: PLANS.filter((p) => (p === plan ? on : form.planos.includes(p))) });
  const save = async (event) => {
    event.preventDefault();
    const dia = parseLimit(form.dia);
    const mes = parseLimit(form.mes);
    if (dia === undefined || mes === undefined) {
      setState({ saving: false, error: LIMIT_PROBLEM, done: false });
      return;
    }
    setState({ saving: true, error: null, done: false });
    try {
      const config = { aberto: form.aberto, planos: form.planos, limite_dia: dia, limite_mes: mes };
      setForm(normalizeIA((await backend.rpc("app_admin_save_dupla_ia", { p_config: config })) ?? config));
      setState({ saving: false, error: null, done: true });
    } catch (err) {
      setState({ saving: false, error: messageOf(err), done: false });
    }
  };
  const ready = data.funcao_pronta === true;
  const blocked = form.dia.trim() === "" || form.mes.trim() === "";

  return (
    <form onSubmit={save} noValidate>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Avaliação por IA no treino sozinho</h3>
          <Switch label="Avaliação por IA no treino sozinho" checked={form.aberto} onChange={(e) => change({ aberto: e.target.checked })} />
          <fieldset style={{ margin: 0, padding: 0, border: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <legend style={{ padding: 0, marginBottom: 8, font: "var(--type-label)", color: "var(--text-primary)" }}>Planos com acesso</legend>
            {PLANS.map((plan) => (
              <Checkbox
                key={plan}
                label={PLAN_LABEL[plan]}
                aria-label={`${PLAN_LABEL[plan]} — avaliação por IA`}
                checked={form.planos.includes(plan)}
                onChange={(e) => togglePlan(plan, e.target.checked)}
              />
            ))}
          </fieldset>
          {data.elite_libera === true && (
            <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
              O benefício Elite “correção de estação com devolutiva” também libera a avaliação por IA.
            </span>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <TextField label="Limite por aluno por dia" type="number" inputMode="numeric" min="1" step="1" value={form.dia} onChange={(e) => change({ dia: e.target.value })} />
            <TextField label="Limite por aluno por mês" type="number" inputMode="numeric" min="1" step="1" value={form.mes} onChange={(e) => change({ mes: e.target.value })} />
          </div>
          {blocked && <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Sem limite preenchido, a avaliação por IA fica bloqueada.</span>}
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span data-testid="funcao-estado" style={{ font: "var(--type-body-sm)", color: ready ? "var(--success-text)" : "var(--text-secondary)" }}>
              {ready ? "Função pronta" : data.funcao_motivo ? `Função não pronta: ${data.funcao_motivo}` : "Função não pronta"}
            </span>
            {onOpenIAs && (
              <Button size="sm" variant="secondary" icon="bot" onClick={onOpenIAs}>
                Abrir a Central de IAs
              </Button>
            )}
          </div>
          {state.error && <Banner tone="danger">{state.error}</Banner>}
          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
            {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Configurações salvas.</span>}
            <Button type="submit" loading={state.saving}>
              Salvar avaliação por IA
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}

/** @param {{ onOpenIAs?: () => void }} props */
export function AdminDupla({ onOpenIAs }) {
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
    <>
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
      <div style={{ marginTop: 16 }}>
        <DuplaIA onOpenIAs={onOpenIAs} />
      </div>
      <div style={{ marginTop: 16 }}>
        <DuplaUsage />
      </div>
    </>
  );
}
