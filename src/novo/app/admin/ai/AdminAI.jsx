// Administração › Central de IAs: liga e desliga as IAs, atualiza as listas de modelos, define o modo e os modelos de cada
// função, os tetos de gasto e os preços, e mostra o gasto e o histórico. As chaves ficam só no servidor.
import React from "react";
import { Badge, Banner, Button, Switch, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { Loading, useLoad } from "../common.jsx";
import { KeyValue, Section } from "../content/ui.jsx";
import { aiGet, aiSend, PROVIDER_NAME, usd } from "./aiApi.js";
import { FunctionEditor } from "./FunctionEditor.jsx";

const PROVIDER_ORDER = ["anthropic", "openai", "gemini", "ollama"];
const FUNCTIONS = [
  ["criacao", "Criação"],
  ["verificacao", "Verificação e checagem"],
  ["engenharia_reversa", "Engenharia reversa"],
  ["assistente_preencher", "Assistente: preencher"],
  ["assistente_conferir", "Assistente: conferir"],
  ["assistente_revisar", "Assistente: revisar a redação"],
];
const FUNCTION_NAME = Object.fromEntries(FUNCTIONS);
const STATUS = { pronta: ["pronta", "success"], sem_chave: ["sem chave", "warning"], chave_recusada: ["chave recusada", "danger"], so_no_mac: ["roda só no Mac", "neutral"], erro: ["erro", "danger"] };
const OUTCOME = { ok: ["ok", "success"], falha: ["falha", "danger"], teto: ["teto", "warning"], bloqueada: ["bloqueada", "warning"] };
const ACTION = { "ai.provider": "IA ligada/desligada", "ai.function": "função", "ai.settings": "tetos e seletor", "ai.price": "preço" };
const ROLE = { principal: "principal", reserva: "reserva", criadora: "criadora", conferente: "conferente", membro: "membro" };

const when = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");
const day = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "—");
const statusOf = (s) => (s ? (STATUS[s] ?? [s, "neutral"]) : ["lista ainda não atualizada", "neutral"]);
const cell = { padding: "6px 8px", borderBottom: "1px solid var(--border-subtle)", textAlign: "left", verticalAlign: "middle" };
const subtle = { font: "var(--type-caption)", color: "var(--text-tertiary)" };
const note = { margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" };

function LoadFail({ error, retry }) {
  return (
    <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={retry}>Tentar de novo</Button>}>
      {error?.message || "Não foi possível carregar a Central de IAs."}
    </Banner>
  );
}

function Table({ heads, children }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", font: "var(--type-body-sm)" }}>
        <thead>
          <tr style={{ color: "var(--text-tertiary)" }}>
            {heads.map((h) => (
              <th key={h} style={cell}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function ProviderCard({ p, spend, pending, backend, reload }) {
  const name = PROVIDER_NAME[p.id];
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [refreshed, setRefreshed] = React.useState(null);
  const act = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (enabled) => {
    if (enabled && !window.confirm(`Ligar ${name}? A partir de agora o servidor pode enviar trechos do material da equipe para ${name}. Fica registrado quem ligou e quando.`)) return;
    act(async () => {
      await aiSend(backend, "POST", `/providers/${p.id}/enabled`, { enabled });
      await reload();
    });
  };
  const refresh = () =>
    act(async () => {
      setRefreshed(await aiSend(backend, "POST", `/providers/${p.id}/refresh`));
      await reload();
    });
  const [label, tone] = statusOf(refreshed ? refreshed.status : p.last_status);
  const detail = refreshed ? refreshed.detail : p.last_status_detail;
  const count = (refreshed ? refreshed.models : p.models)?.length ?? 0;
  const by = p.enabled_by_email;
  return (
    <div data-testid={`provider-${p.id}`} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 0", borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <strong style={{ font: "var(--type-label)" }}>{name}</strong>
          <Badge size="sm" tone={tone}>
            {label}
          </Badge>
        </div>
        <Switch label={p.enabled ? "Ligada" : "Desligada"} aria-label={`${name}: ligar ou desligar`} checked={p.enabled === true} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
      </div>
      {detail && <div style={subtle}>{detail}</div>}
      {pending && <div style={subtle}>{pending}</div>}
      {p.enabled && <div style={subtle}>{`Ligada${by ? ` por ${by}` : ""} em ${when(p.enabled_at)}`}</div>}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ font: "var(--type-body-sm)" }}>{count === 1 ? "1 modelo" : `${count} modelos`}</span>
        <Button size="sm" variant="secondary" icon="refresh-cw" loading={busy} onClick={refresh}>
          Atualizar lista
        </Button>
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{`Gasto do mês: ${usd(spend?.cost_usd)}`}</span>
      </div>
      {refreshed?.prices_added > 0 && <div style={subtle}>{`${refreshed.prices_added} preços preenchidos pela tabela oficial`}</div>}
      {error && <Banner tone="danger">{error}</Banner>}
    </div>
  );
}

function Providers({ data, backend, reload }) {
  const list = PROVIDER_ORDER.map((id) => data.providers.find((p) => p.id === id)).filter(Boolean);
  return (
    <Section title="IAs">
      <p style={note}>As chaves ficam só no servidor. Uma IA só é chamada se estiver ligada aqui.</p>
      {list.map((p) => (
        <ProviderCard key={p.id} p={p} spend={data.spend_by_provider?.find((s) => s.provider === p.id)} pending={data.provider_checks?.[p.id]?.pending} backend={backend} reload={reload} />
      ))}
    </Section>
  );
}

function Functions({ data, backend, reload }) {
  return (
    <Section title="Funções">
      <p style={note}>Para cada função, escolha como as IAs trabalham. Tudo continua rascunho até uma pessoa aprovar.</p>
      {FUNCTIONS.map(([key, label]) => (
        <FunctionEditor key={key} fnKey={key} label={label} saved={data.functions?.find((f) => f.key === key)} check={data.checks?.[key]} providers={data.providers} providerChecks={data.provider_checks} backend={backend} onSaved={reload} />
      ))}
    </Section>
  );
}

function PriceRow({ row, backend, reload }) {
  const fresh = !row;
  const [v, setV] = React.useState({ provider: row?.provider ?? "", model: row?.model ?? "", input: String(row?.input_per_mtok ?? ""), output: String(row?.output_per_mtok ?? ""), source: row?.source_url ?? "" });
  const [state, setState] = React.useState({ busy: false, error: null });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const ok = v.provider && v.model.trim() && v.input !== "" && v.output !== "";
  const save = async () => {
    setState({ busy: true, error: null });
    try {
      await aiSend(backend, "PUT", `/prices/${v.provider}/${encodeURIComponent(v.model.trim())}`, { input_per_mtok: Number(v.input), output_per_mtok: Number(v.output), source_url: v.source.trim() || null });
      if (fresh) setV({ provider: "", model: "", input: "", output: "", source: "" });
      setState({ busy: false, error: null });
      await reload();
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  };
  const tag = fresh ? "Novo preço" : `${PROVIDER_NAME[row.provider]} ${row.model}`;
  return (
    <tr>
      <td style={cell}>
        {fresh ? (
          <select aria-label="Novo preço: IA" value={v.provider} onChange={set("provider")} className="sm-btn sm-btn--secondary sm-btn--sm">
            <option value="">IA</option>
            {PROVIDER_ORDER.map((id) => (
              <option key={id} value={id}>
                {PROVIDER_NAME[id]}
              </option>
            ))}
          </select>
        ) : (
          PROVIDER_NAME[row.provider]
        )}
      </td>
      <td style={cell}>{fresh ? <TextField aria-label="Novo preço: modelo" placeholder="Novo preço: modelo" value={v.model} onChange={set("model")} /> : row.model}</td>
      <td style={cell}>
        <TextField aria-label={`${tag}: entrada`} type="number" min="0" step="any" value={v.input} onChange={set("input")} />
      </td>
      <td style={cell}>
        <TextField aria-label={`${tag}: saída`} type="number" min="0" step="any" value={v.output} onChange={set("output")} />
      </td>
      <td style={cell}>
        {fresh ? (
          <TextField aria-label="Novo preço: fonte" placeholder="https://… (opcional)" value={v.source} onChange={set("source")} />
        ) : row.source_url ? (
          <a href={row.source_url} target="_blank" rel="noreferrer">
            fonte
          </a>
        ) : (
          "—"
        )}
      </td>
      <td style={cell}>{fresh ? "—" : day(row.checked_on)}</td>
      <td style={cell}>
        <Button size="sm" variant="secondary" disabled={!ok} loading={state.busy} aria-label={`${tag}: salvar preço`} onClick={save}>
          Salvar
        </Button>
        {state.error && <div style={{ ...subtle, color: "var(--text-danger, var(--text-secondary))" }}>{state.error}</div>}
      </td>
    </tr>
  );
}

function Spend({ data, backend, reload }) {
  const s = data.settings ?? {};
  const [monthly, setMonthly] = React.useState(s.monthly_cap_usd == null ? "" : String(s.monthly_cap_usd));
  const [perRun, setPerRun] = React.useState(s.per_run_cap_usd == null ? "" : String(s.per_run_cap_usd));
  const [on, setOn] = React.useState(s.caps_enabled === true);
  const [state, setState] = React.useState({ busy: false, error: null, done: false });
  const settingsKey = JSON.stringify([s.monthly_cap_usd, s.per_run_cap_usd, s.caps_enabled]);
  React.useEffect(() => {
    setMonthly(s.monthly_cap_usd == null ? "" : String(s.monthly_cap_usd));
    setPerRun(s.per_run_cap_usd == null ? "" : String(s.per_run_cap_usd));
    setOn(s.caps_enabled === true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey]);
  const missing = on && (monthly.trim() === "" || perRun.trim() === "");
  const num = (t) => (t.trim() === "" ? null : Number(t));
  const save = async () => {
    setState({ busy: true, error: null, done: false });
    try {
      await aiSend(backend, "PUT", "/settings", { monthly_cap_usd: num(monthly), per_run_cap_usd: num(perRun), caps_enabled: on });
      setState({ busy: false, error: null, done: true });
      await reload();
    } catch (e) {
      setState({ busy: false, error: e.message, done: false });
    }
  };
  const prices = data.prices ?? [];
  return (
    <Section title="Gasto e tetos">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <TextField label="Teto mensal (US$)" type="number" min="0" step="any" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          <TextField label="Teto por execução (US$)" type="number" min="0" step="any" value={perRun} onChange={(e) => setPerRun(e.target.value)} />
        </div>
        <Switch label="Tetos ligados" checked={on} onChange={(e) => setOn(e.target.checked)} />
        {missing && <div style={subtle}>Preencha os dois tetos para ligar</div>}
        <p style={note}>Duas execuções ao mesmo tempo podem passar do teto em até o custo de uma execução.</p>
        {state.error && <Banner tone="danger">{state.error}</Banner>}
        {state.done && <Banner tone="success">Tetos salvos.</Banner>}
        <div>
          <Button size="sm" icon="check" disabled={missing} loading={state.busy} onClick={save}>
            Salvar tetos
          </Button>
        </div>

        <KeyValue
          items={[
            ["Gasto do mês", usd(data.month_spend)],
            ["Por IA", (data.spend_by_provider ?? []).length ? (data.spend_by_provider ?? []).map((x) => `${PROVIDER_NAME[x.provider] ?? x.provider}: ${usd(x.cost_usd)}`).join(" · ") : "nenhuma chamada neste mês"],
            ["Por função", (data.spend_by_function ?? []).length ? (data.spend_by_function ?? []).map((x) => `${FUNCTION_NAME[x.function_key] ?? x.function_key}: ${usd(x.cost_usd)}`).join(" · ") : "nenhuma chamada neste mês"],
            ["Tutor (fora do teto, só informação)", usd(data.tutor_month_spend)],
          ]}
        />

        <h4 style={{ margin: "8px 0 0", font: "var(--type-label)" }}>Últimas chamadas</h4>
        {(data.recent_calls ?? []).length === 0 ? (
          <p style={note}>Nenhuma chamada registrada.</p>
        ) : (
          <Table heads={["Quando", "Função", "Papel", "IA", "Modelo", "Resultado", "Custo"]}>
            {data.recent_calls.map((c) => {
              const [label, tone] = OUTCOME[c.outcome] ?? [c.outcome, "neutral"];
              return (
                <tr key={c.id}>
                  <td style={cell}>{when(c.created_at)}</td>
                  <td style={cell}>{FUNCTION_NAME[c.function_key] ?? c.function_key}</td>
                  <td style={cell}>{ROLE[c.role] ?? c.role}</td>
                  <td style={cell}>{PROVIDER_NAME[c.provider] ?? c.provider}</td>
                  <td style={cell}>{c.model}</td>
                  <td style={cell}>
                    <Badge size="sm" tone={tone}>
                      {label}
                    </Badge>
                  </td>
                  <td style={cell}>{usd(c.cost_usd)}</td>
                </tr>
              );
            })}
          </Table>
        )}

        <h4 style={{ margin: "8px 0 0", font: "var(--type-label)" }}>Preços por milhão de tokens (US$)</h4>
        <Table heads={["IA", "Modelo", "Entrada", "Saída", "Fonte", "Conferido em", ""]}>
          {prices.map((r) => (
            <PriceRow key={`${r.provider}/${r.model}/${r.input_per_mtok}/${r.output_per_mtok}/${r.source_url}`} row={r} backend={backend} reload={reload} />
          ))}
          <PriceRow key="novo" row={null} backend={backend} reload={reload} />
        </Table>
      </div>
    </Section>
  );
}

function TabSelector({ data, backend, reload }) {
  const [state, setState] = React.useState({ busy: false, error: null });
  const toggle = async (value) => {
    setState({ busy: true, error: null });
    try {
      await aiSend(backend, "PUT", "/settings", { tab_override_enabled: value });
      setState({ busy: false, error: null });
      await reload();
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  };
  return (
    <Section title="Seletor nas abas">
      <Switch label="Permitir trocar a IA nas abas" description="Desligado: Aulas, Podcasts e as outras abas usam o que está definido aqui." checked={data.settings?.tab_override_enabled === true} disabled={state.busy} onChange={(e) => toggle(e.target.checked)} />
      {state.error && <Banner tone="danger">{state.error}</Banner>}
    </Section>
  );
}

function History({ data }) {
  const rows = data.history ?? [];
  const who = (h) => h.actor_email ?? "—";
  const target = (h) => (typeof h.target === "string" ? h.target : h.target == null ? "—" : JSON.stringify(h.target));
  return (
    <Section title="Histórico">
      {rows.length === 0 ? (
        <p style={note}>Nenhuma mudança registrada ainda.</p>
      ) : (
        <Table heads={["Quando", "Quem", "Ação", "Alvo"]}>
          {rows.map((h) => (
            <tr key={h.id}>
              <td style={cell}>{when(h.created_at)}</td>
              <td style={cell}>{who(h)}</td>
              <td style={cell}>{ACTION[h.action] ?? h.action}</td>
              <td style={cell}>{target(h)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

export function AdminAI() {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => aiGet(backend, "/overview"), [backend]);
  if (error && !data) return <LoadFail error={error} retry={reload} />;
  if (!data) return <Loading />;
  const refresh = async () => reload();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <LoadFail error={error} retry={reload} />}
      <Providers data={data} backend={backend} reload={refresh} />
      <Functions data={data} backend={backend} reload={refresh} />
      <Spend data={data} backend={backend} reload={refresh} />
      <TabSelector data={data} backend={backend} reload={refresh} />
      <History data={data} />
    </div>
  );
}
