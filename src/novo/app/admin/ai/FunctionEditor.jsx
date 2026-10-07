// Uma função da Central de IAs: modo, IA principal, reserva, conferentes (linha) ou membros (comitê), cuidado.
import React from "react";
import { Badge, Banner, Button, SelectField, TextField } from "../../../ds";
import { aiSend, PROVIDER_NAME } from "./aiApi.js";

const MODES = [
  { value: "sozinha", label: "Sozinha" },
  { value: "linha", label: "Linha de produção" },
  { value: "comite", label: "Comitê" },
];
const CARES = [
  { value: "rapido", label: "Rápido" },
  { value: "caprichado", label: "Caprichado" },
];
const EMPTY = { provider: "", model: "" };
const MAX_OTHERS = { linha: 3, comite: 3 };
const toRef = (r) => (r && r.provider && r.model ? { provider: r.provider, model: String(r.model).trim() } : null);
const asDraft = (r) => (r ? { provider: r.provider ?? "", model: r.model ?? "" } : { ...EMPTY });

/** IA + modelo: lista da IA quando houver; senão, o id digitado. */
function ModelPicker({ title, fn, value, onChange, providers }) {
  const info = providers.find((p) => p.id === value.provider);
  const models = Array.isArray(info?.models) ? info.models : [];
  const missing = value.model && models.length > 0 && !models.some((m) => m.id === value.model);
  const options = [{ value: "", label: "Escolha o modelo" }, ...models.map((m) => ({ value: m.id, label: m.label || m.id })), ...(missing ? [{ value: value.model, label: value.model }] : [])];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "start" }}>
      <SelectField
        label="IA"
        aria-label={`${title}: IA — ${fn}`}
        value={value.provider}
        onChange={(e) => onChange({ provider: e.target.value, model: "" })}
        options={[{ value: "", label: "Escolha a IA" }, ...providers.map((p) => ({ value: p.id, label: PROVIDER_NAME[p.id] + (p.enabled ? "" : " (desligada)") }))]}
      />
      {models.length > 0 ? (
        <SelectField label="Modelo" aria-label={`${title}: modelo — ${fn}`} value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} options={options} hint={missing ? "modelo não está mais na lista" : undefined} />
      ) : (
        <TextField label="Modelo (id)" aria-label={`${title}: modelo (id) — ${fn}`} value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} hint="Atualize a lista da IA para escolher" disabled={!value.provider} />
      )}
    </div>
  );
}

const subtle = { font: "var(--type-caption)", color: "var(--text-tertiary)" };

export function FunctionEditor({ fnKey, label, saved, check, providers, backend, onSaved }) {
  const init = () => ({
    mode: saved?.mode ?? "sozinha",
    care: saved?.care ?? "caprichado",
    primary: asDraft(saved?.primary_ref),
    fallback: asDraft(saved?.fallback_ref),
    others: (saved?.reviewers ?? []).map(asDraft),
  });
  const [draft, setDraft] = React.useState(init);
  const [state, setState] = React.useState({ busy: false, problems: null, error: null, warnings: null });
  const savedKey = JSON.stringify(saved ?? null);
  React.useEffect(() => {
    setDraft(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const others = draft.mode === "sozinha" ? [] : draft.others.length ? draft.others : [{ ...EMPTY }];
  const max = MAX_OTHERS[draft.mode] ?? 0;
  const setOther = (i, v) => set({ others: others.map((o, j) => (j === i ? v : o)) });

  const complete = others.filter((o) => toRef(o));
  const half = others.some((o) => (o.provider || o.model) && !toRef(o));
  const minOthers = draft.mode === "linha" ? 1 : draft.mode === "comite" ? 1 : 0;
  const localProblem = half
    ? "Complete ou remova o conferente/membro incompleto."
    : draft.mode === "linha" && complete.length < 1
      ? "Linha de produção precisa de pelo menos 1 conferente."
      : draft.mode === "comite" && complete.length < minOthers
        ? "O comitê precisa de pelo menos 2 IAs."
        : null;

  const run = async (fn, after) => {
    setState({ busy: true, problems: null, error: null, warnings: null });
    try {
      const out = await fn();
      setState({ busy: false, problems: null, error: null, warnings: after ? [] : (out?.warnings ?? []) });
      await onSaved();
    } catch (error) {
      setState({ busy: false, problems: error.problems ?? null, error: error.message, warnings: null });
    }
  };
  const save = () =>
    run(() =>
      aiSend(backend, "PUT", `/functions/${fnKey}`, {
        config: { mode: draft.mode, care: draft.care, primary: toRef(draft.primary), fallback: toRef(draft.fallback), reviewers: complete.map(toRef) },
      }),
    );
  const revert = () => {
    if (!window.confirm(`Voltar "${label}" às variáveis do servidor? A configuração salva aqui será apagada.`)) return;
    run(() => aiSend(backend, "PUT", `/functions/${fnKey}`, { config: null }), true);
  };

  const warnings = state.warnings ?? check?.warnings ?? [];
  const ref = check?.ref;
  return (
    <div data-testid={`function-${fnKey}`} style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 0", borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ font: "var(--type-label)" }}>{label}</strong>
        {check?.ready ? <Badge size="sm" tone="success">pronta</Badge> : <Badge size="sm" tone="danger">não está pronta</Badge>}
      </div>
      {check?.source === "variaveis" && ref && <div style={subtle}>{`Sem configuração salva: usa as variáveis do servidor (${PROVIDER_NAME[ref.provider] ?? ref.provider} ${ref.model})`}</div>}
      {check && !check.ready && check.problems?.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          {check.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <SelectField label="Modo" aria-label={`Modo — ${label}`} value={draft.mode} onChange={(e) => set({ mode: e.target.value })} options={MODES} />
      <div>
        <div style={{ ...subtle, marginBottom: 6 }}>IA principal</div>
        <ModelPicker fn={label} title="Principal" value={draft.primary} onChange={(v) => set({ primary: v })} providers={providers} />
      </div>
      <div>
        <div style={{ ...subtle, marginBottom: 6 }}>Reserva (opcional)</div>
        <ModelPicker fn={label} title="Reserva" value={draft.fallback} onChange={(v) => set({ fallback: v })} providers={providers} />
      </div>
      {draft.mode !== "sozinha" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={subtle}>{draft.mode === "linha" ? "Conferentes (1 a 3)" : "Outros membros — a principal também participa; total de 2 a 4"}</div>
          {others.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 360px" }}>
                <ModelPicker fn={label} title={`${draft.mode === "linha" ? "Conferente" : "Membro"} ${i + 1}`} value={o} onChange={(v) => setOther(i, v)} providers={providers} />
              </div>
              {others.length > 1 && (
                <Button size="sm" variant="ghost" icon="trash-2" onClick={() => set({ others: others.filter((_, j) => j !== i) })}>
                  Remover
                </Button>
              )}
            </div>
          ))}
          {others.length < max && (
            <div>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => set({ others: [...others, { ...EMPTY }] })}>
                {draft.mode === "linha" ? "Adicionar conferente" : "Adicionar membro"}
              </Button>
            </div>
          )}
        </div>
      )}
      <SelectField label="Cuidado" aria-label={`Cuidado — ${label}`} value={draft.care} onChange={(e) => set({ care: e.target.value })} options={CARES} />

      {localProblem && <div style={subtle}>{localProblem}</div>}
      {state.error && (
        <Banner tone="danger">
          {state.problems?.length ? state.problems.map((p) => <div key={p}>{p}</div>) : state.error}
        </Banner>
      )}
      {warnings.length > 0 && (
        <Banner tone="warning">
          {warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </Banner>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button size="sm" icon="check" loading={state.busy} disabled={Boolean(localProblem)} onClick={save}>
          Salvar
        </Button>
        {saved && (
          <Button size="sm" variant="secondary" disabled={state.busy} onClick={revert}>
            Voltar às variáveis do servidor
          </Button>
        )}
      </div>
    </div>
  );
}
