// Administração › Central de IAs: liga e desliga as IAs, atualiza as listas de modelos, define o modo e os modelos de cada
// função, os tetos de gasto e os preços, e mostra o gasto e o histórico. As chaves ficam só no servidor.
import React from "react";
import { Badge, Banner, Button, Switch, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { Loading, useLoad } from "../common.jsx";
import { KeyValue, Section } from "../content/ui.jsx";
import { aiGet, aiSend, PROVIDER_NAME, usd } from "./aiApi.js";
import { FunctionEditor } from "./FunctionEditor.jsx";
import { explainError } from "../../../../shared/errors/explicarErro";
import { overallCapState } from "./overallCap.js";

const PROVIDER_ORDER = ["anthropic", "openai", "gemini", "ollama"];
const FUNCTIONS = [
  ["criacao", "Criação"],
  ["verificacao", "Verificação e checagem"],
  ["engenharia_reversa", "Engenharia reversa"],
  ["assistente_preencher", "Assistente: preencher"],
  ["assistente_conferir", "Assistente: conferir"],
  ["assistente_revisar", "Assistente: conversar e revisar"],
  ["busca_fontes", "Busca de fontes oficiais"],
  ["similaridade", "Questões parecidas"],
  ["analise_mudancas", "Análise do que mudou (Vigilância científica)"],
];
const FUNCTION_NAME = Object.fromEntries(FUNCTIONS);
const STATUS = { pronta: ["pronta", "success"], sem_chave: ["sem chave", "warning"], chave_recusada: ["chave recusada", "danger"], so_no_mac: ["roda só no Mac", "neutral"], erro: ["erro", "danger"] };
const OUTCOME = { ok: ["ok", "success"], falha: ["falha", "danger"], teto: ["teto", "warning"], bloqueada: ["bloqueada", "warning"] };
const ACTION = { "ai.provider": "IA ligada/desligada", "ai.function": "função", "ai.settings": "tetos e seletor", "ai.price": "preço" };
const ROLE = { principal: "principal", reserva: "reserva", criadora: "criadora", conferente: "conferente", membro: "membro" };

/**
 * Custo de uma chamada na tabela (IA09): IA paga que gastou tokens e ficou com custo zero é modelo sem preço cadastrado. Mostrar
 * "US$ 0" ali dizia que a chamada saiu de graça. O Ollama custa zero, e chamada sem tokens (teto, bloqueada, falha sem resposta)
 * também fica em "US$ 0".
 */
const callCost = (c) => (Number(c.cost_usd) === 0 && c.provider !== "ollama" && Number(c.input_tokens ?? 0) + Number(c.output_tokens ?? 0) > 0 ? "sem preço" : usd(c.cost_usd));

const when = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");
const day = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "—");
const statusOf = (s) => (s ? (STATUS[s] ?? [s, "neutral"]) : ["lista ainda não atualizada", "neutral"]);
const cell = { padding: "6px 8px", borderBottom: "1px solid var(--border-subtle)", textAlign: "left", verticalAlign: "middle" };
const subtle = { font: "var(--type-caption)", color: "var(--text-tertiary)" };
const note = { margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" };

function LoadFail({ error, retry }) {
  return (
    <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={retry}>Tentar de novo</Button>}>
      {explainError(error, "Não foi possível carregar a Central de IAs.")}
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

function ProviderCard({ p, spend, pending, blocks, backend, reload }) {
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
      setError(explainError(e));
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
  // o que impede este servidor de chamar a IA: bloqueio (Ollama no site publicado) ou só a chave ausente aqui no site
  const pendingText = pending ? (blocks === true ? pending : `Sem chave neste servidor (site): ${pending.replace(/\.$/, "")}. O processamento no Cloud Run usa as próprias chaves.`) : null;
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
      {pendingText && pendingText !== detail && pending !== detail && <div style={subtle}>{pendingText}</div>}
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

// Usos de IA que NÃO passam pelo interruptor de cada IA (IA03): usam a chave direto no servidor e têm a trava própria de cada um.
// Fica de acordo com docs/architecture/CENTRAL_DE_IAS.md, seção "O que o interruptor liga e desliga".
const OUTSIDE_SWITCH = [
  "Tutor: conversa e avaliação (Claude, por padrão), transcrição do microfone (OpenAI) e voz ao vivo (Gemini ou OpenAI).",
  "Voz do professor do Tutor: ElevenLabs, que não está nesta lista de IAs.",
  "Áudio dos Podcasts: OpenAI (a voz do Gemini existe, mas fica desligada por padrão no servidor).",
  "Busca por significado da Central de Conteúdo: Gemini.",
  "Rotas antigas de IA da Administração: Claude e Gemini, só para administrador.",
];

/**
 * Os tetos de gasto nascem desligados (IA01): desligados, nenhuma IA da Central tem limite em dólares. Este aviso fica no alto até os
 * dois tetos terem valor e estarem ligados. A tela não escolhe nem liga valor nenhum: a decisão é do administrador.
 */
function capsState(settings) {
  const s = settings ?? {};
  const noMonthly = s.monthly_cap_usd == null;
  const noPerRun = s.per_run_cap_usd == null;
  return { off: s.caps_enabled !== true, noMonthly, noPerRun, ok: s.caps_enabled === true && !noMonthly && !noPerRun };
}

function goToCaps() {
  const box = document.getElementById("gasto-e-tetos");
  box?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  document.getElementById("teto-mensal")?.focus();
}

function CapsNotice({ settings }) {
  const c = capsState(settings);
  if (c.ok) return null;
  const missing = [c.noMonthly && "O teto mensal está sem valor.", c.noPerRun && "O teto por chamada está sem valor."].filter(Boolean);
  return (
    <div data-testid="aviso-tetos-desligados">
      <Banner tone="warning" title={c.off ? "Os tetos de gasto estão desligados" : "Falta valor em um dos tetos de gasto"} action={<Button size="sm" variant="secondary" icon="arrow-down" onClick={goToCaps}>Escolher os tetos</Button>}>
        {c.off
          ? "Hoje não há limite em dólares para as IAs da Central: um volume grande de trabalhos ou um erro pode gastar sem parar. "
          : "Os tetos estão ligados, mas um limite sem valor não vale. "}
        {!c.off && missing.join(" ") + " "}
        {c.off && !c.noMonthly && !c.noPerRun ? "Os valores já estão preenchidos: falta ligar os tetos. " : ""}
        O Tutor, as vozes e a busca por significado não entram nestes tetos.
      </Banner>
    </div>
  );
}

/** Aviso do teto geral do mês (IA02): só aparece com o teto ligado e a partir de 80%. Só avisa; nada é parado por causa dele. */
function OverallNotice({ data }) {
  const o = overallCapState(data);
  if (o.level !== "perto" && o.level !== "passou") return null;
  return (
    <div data-testid="aviso-teto-geral">
      <Banner tone={o.level === "passou" ? "danger" : "warning"} title={o.level === "passou" ? "O gasto de IA do mês passou do teto geral" : "O gasto de IA do mês chegou perto do teto geral"}>
        {`Gasto do mês com registro: ${usd(o.spend)} de um teto geral de ${usd(o.cap)} (${o.percent}%). `}
        {o.partial ? "Esta soma só tem a Central de IAs: falta uma atualização do banco para somar o resto. " : ""}
        O teto geral só avisa: nenhuma IA foi parada por causa dele.
      </Banner>
    </div>
  );
}

function Providers({ data, backend, reload }) {
  const list = PROVIDER_ORDER.map((id) => data.providers.find((p) => p.id === id)).filter(Boolean);
  return (
    <Section title="IAs">
      <div data-testid="providers-intro" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={note}>
          As chaves ficam só no servidor. Uma IA só é chamada pelas funções abaixo se estiver ligada aqui: isso vale para tudo o que passa por elas (etapas da Central de Conteúdo, Questões, Aulas e roteiro dos Podcasts, assistentes das abas).
        </p>
        <p style={note}>Desligar uma IA aqui não desliga estes usos: eles usam a chave direto no servidor e cada um tem a trava própria.</p>
        <ul data-testid="fora-do-interruptor" style={{ margin: 0, paddingLeft: 18, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          {OUTSIDE_SWITCH.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      {list.map((p) => (
        <ProviderCard key={p.id} p={p} spend={data.spend_by_provider?.find((s) => s.provider === p.id)} pending={data.provider_checks?.[p.id]?.pending} blocks={data.provider_checks?.[p.id]?.blocks} backend={backend} reload={reload} />
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
  const [v, setV] = React.useState({ provider: row?.provider ?? "", model: row?.model ?? "", input: String(row?.input_per_mtok ?? ""), output: String(row?.output_per_mtok ?? ""), perSearch: row?.per_search_usd == null ? "" : String(row.per_search_usd), source: row?.source_url ?? "" });
  const [state, setState] = React.useState({ busy: false, error: null });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const ok = v.provider && v.model.trim() && v.input !== "" && v.output !== "";
  const save = async () => {
    setState({ busy: true, error: null });
    try {
      await aiSend(backend, "PUT", `/prices/${v.provider}/${encodeURIComponent(v.model.trim())}`, { input_per_mtok: Number(v.input), output_per_mtok: Number(v.output), per_search_usd: v.perSearch.trim() === "" ? null : Number(v.perSearch), source_url: v.source.trim() || null });
      if (fresh) setV({ provider: "", model: "", input: "", output: "", perSearch: "", source: "" });
      setState({ busy: false, error: null });
      await reload();
    } catch (e) {
      setState({ busy: false, error: explainError(e) });
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
        <TextField aria-label={`${tag}: por busca`} type="number" min="0" step="any" value={v.perSearch} onChange={set("perSearch")} />
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

const SPEND_GROUPS = {
  tutor_conversa: "Tutor: conversa e avaliação",
  tutor_voz_ao_vivo: "Tutor: voz ao vivo",
  tutor_transcricao: "Tutor: transcrição do microfone",
  tutor_voz_professor: "Tutor: voz do professor",
  podcasts_audio: "Podcasts: áudio",
  busca_significado: "Busca por significado",
};
const NO_RECORD_NAME = { rotas_antigas: "Rotas antigas de IA da Administração", perguntas_busca: "Perguntas da busca por significado" };

/** Um lugar do painel de gasto de tudo: o valor registrado, ou o que falta saber (nunca um número inventado). */
function spendCell(g) {
  const cost = Number(g.cost_usd ?? 0);
  const records = Number(g.records ?? 0);
  const unpriced = Number(g.unpriced_records ?? 0);
  if (records === 0) return "nenhum registro neste mês";
  if (unpriced === records && cost === 0) return `sem preço definido (${records} ${records === 1 ? "registro" : "registros"} com uso e custo zero)`;
  if (unpriced > 0) return `${usd(cost)} + ${unpriced} ${unpriced === 1 ? "registro sem preço" : "registros sem preço"}`;
  return usd(cost);
}

/**
 * Gasto do mês de tudo o que já fica registrado (IA02, só leitura): a Central (que entra nos tetos) e os usos que gravam em outros
 * lugares. O que não grava nada aparece como "sem registro". Não é teto: nenhum destes usos para por causa dos tetos.
 */
function AllSpend({ data }) {
  const a = data.all_spend;
  if (!a) return null;
  const groups = a.groups ?? [];
  const withRecord = Number(data.month_spend ?? 0) + groups.reduce((t, g) => t + Number(g.cost_usd ?? 0), 0);
  return (
    <div data-testid="gasto-de-tudo" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h4 style={{ margin: "8px 0 0", font: "var(--type-label)" }}>Gasto do mês de tudo (só leitura)</h4>
      <p style={note}>Soma o que já fica registrado em cada lugar. Só a Central entra nos tetos: o Tutor, as vozes e a busca por significado não param por causa deles.</p>
      {!a.available ? (
        <p style={note}>O gasto dos outros lugares ainda não está disponível: falta uma atualização do banco, que o Claude prepara para você colar.</p>
      ) : (
        <Table heads={["Lugar", "Gasto do mês"]}>
          <tr>
            <td style={cell}>Central de IAs (entra nos tetos)</td>
            <td style={cell}>{usd(data.month_spend)}</td>
          </tr>
          {groups.map((g) => (
            <tr key={g.key}>
              <td style={cell}>{SPEND_GROUPS[g.key] ?? g.key}</td>
              <td style={cell}>{spendCell(g)}</td>
            </tr>
          ))}
          {(a.no_record ?? []).map((n) => (
            <tr key={n.key}>
              <td style={cell}>{NO_RECORD_NAME[n.key] ?? n.key}</td>
              <td style={cell}>{`sem registro. ${n.note ?? ""}`.trim()}</td>
            </tr>
          ))}
        </Table>
      )}
      {a.available && (
        <p data-testid="soma-com-registro" style={note}>{`Soma do que tem registro: ${usd(withRecord)}. Não inclui o que está sem registro nem os registros sem preço.`}</p>
      )}
    </div>
  );
}

/**
 * Teto geral do mês (IA02): soma da Central, do Tutor, das vozes, da transcrição, dos Podcasts e da busca por significado. Nasce desligado
 * e sem valor; o valor é do dono. Só avisa (a 80% e ao passar): não para nada. Sem a atualização do banco (9892), a tela diz isso.
 */
function OverallCap({ data, backend, reload }) {
  const o = overallCapState(data);
  const [value, setValue] = React.useState(o.cap == null ? "" : String(o.cap));
  const [on, setOn] = React.useState(o.enabled);
  const [state, setState] = React.useState({ busy: false, error: null, done: false });
  const key = JSON.stringify([o.cap, o.enabled]);
  React.useEffect(() => {
    setValue(o.cap == null ? "" : String(o.cap));
    setOn(o.enabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const missing = on && value.trim() === "";
  const save = async () => {
    setState({ busy: true, error: null, done: false });
    try {
      await aiSend(backend, "PUT", "/settings", { overall_monthly_cap_usd: value.trim() === "" ? null : Number(value), overall_cap_enabled: on });
      setState({ busy: false, error: null, done: true });
      await reload();
    } catch (e) {
      setState({ busy: false, error: e.message, done: false });
    }
  };
  return (
    <div data-testid="teto-geral" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h4 style={{ margin: "8px 0 0", font: "var(--type-label)" }}>Teto geral do mês (só avisa)</h4>
      <p style={note}>
        Soma tudo o que tem registro: a Central de IAs, o Tutor, as vozes, a transcrição, os Podcasts e a busca por significado. Fica desligado e sem valor até você escolher. Ligado, avisa a 80% e quando passar; não para nenhuma IA.
      </p>
      {!o.supported ? (
        <p style={note}>O teto geral ainda não pode ser guardado: falta uma atualização do banco, que o Claude prepara para você colar.</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <TextField id="teto-geral-mensal" label="Teto geral do mês (US$)" type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <Switch label="Avisar pelo teto geral" checked={on} onChange={(e) => setOn(e.target.checked)} />
          {missing && <div style={subtle}>Preencha o valor para ligar</div>}
          {o.level && <p style={note}>{`Gasto do mês com registro: ${usd(o.spend)} (${o.percent}% do teto geral).`}</p>}
          {state.error && <Banner tone="danger">{state.error}</Banner>}
          {state.done && <Banner tone="success">Teto geral salvo.</Banner>}
          <div>
            <Button size="sm" icon="check" disabled={missing} loading={state.busy} onClick={save}>
              Salvar teto geral
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** O que escolher nos tetos e o que ajuda a escolher (IA01): o gasto do mês e o mínimo calculado pelos preços; nada vem preenchido. */
function CapsGuide({ data }) {
  const guide = data.cap_guidance;
  const min = guide?.per_call_min_usd ?? null;
  return (
    <div data-testid="guia-de-tetos" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={note}>Os valores são seus: a tela não escolhe nem liga nada sozinha. Os dois tetos ligados valem para as IAs da Central.</p>
      <ul style={{ margin: 0, paddingLeft: 18, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        <li>{`Teto mensal: o máximo que as IAs da Central podem gastar no mês (horário de Brasília). Gasto do mês até agora: ${usd(data.month_spend)}.`}</li>
        <li>
          {"Teto por chamada: o máximo de uma chamada à IA (principal, nova tentativa e reserva), não para um trabalho inteiro."}
          {min !== null && ` Para nenhuma função parar com as IAs de hoje, pelo menos ${usd(min)} (${(guide.by_function ?? []).map((f) => `${FUNCTION_NAME[f.key] ?? f.key} ${usd(f.min_usd)}`).join(" · ")}). Abaixo desse valor, a função para no teto. A conta usa o pior caso; o gasto real costuma ser bem menor.`}
          {guide && min === null && " Cadastre o preço dos modelos para ver o valor mínimo."}
        </li>
      </ul>
    </div>
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
      setState({ busy: false, error: explainError(e), done: false });
    }
  };
  const prices = data.prices ?? [];
  return (
    <Section title="Gasto e tetos">
      <div id="gasto-e-tetos" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <CapsGuide data={data} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <TextField id="teto-mensal" label="Teto mensal (US$)" type="number" min="0" step="any" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          <TextField label="Teto por chamada (US$)" type="number" min="0" step="any" value={perRun} onChange={(e) => setPerRun(e.target.value)} />
        </div>
        <Switch label="Tetos ligados" checked={on} onChange={(e) => setOn(e.target.checked)} />
        {missing && <div style={subtle}>Preencha os dois tetos para ligar</div>}
        <p data-testid="explicacao-tetos" style={note}>
          O teto por chamada vale para cada chamada à IA (a principal, a nova tentativa e a reserva dela, somadas), não para um trabalho inteiro: um documento que faz várias chamadas pode gastar várias vezes esse valor. O teto mensal é o que limita o total. Duas chamadas ao mesmo tempo podem passar do teto em até o custo de uma chamada.
        </p>
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
            ...(data.all_spend?.available ? [] : [["Tutor (fora do teto, só informação)", usd(data.tutor_month_spend)]]),
          ]}
        />

        <AllSpend data={data} />

        <OverallCap data={data} backend={backend} reload={reload} />

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
                  <td style={cell}>{callCost(c)}</td>
                </tr>
              );
            })}
          </Table>
        )}

        <h4 style={{ margin: "8px 0 0", font: "var(--type-label)" }}>Preços por milhão de tokens (US$)</h4>
        <Table heads={["IA", "Modelo", "Entrada", "Saída", "Por busca (US$)", "Fonte", "Conferido em", ""]}>
          {prices.map((r) => (
            <PriceRow key={`${r.provider}/${r.model}/${r.input_per_mtok}/${r.output_per_mtok}/${r.per_search_usd ?? ""}/${r.source_url}`} row={r} backend={backend} reload={reload} />
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
      setState({ busy: false, error: explainError(e) });
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
      <CapsNotice settings={data.settings} />
      <OverallNotice data={data} />
      <Providers data={data} backend={backend} reload={refresh} />
      <Functions data={data} backend={backend} reload={refresh} />
      <Spend data={data} backend={backend} reload={refresh} />
      <TabSelector data={data} backend={backend} reload={refresh} />
      <History data={data} />
    </div>
  );
}
