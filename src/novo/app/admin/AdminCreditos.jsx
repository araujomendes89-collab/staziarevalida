// Administração › Configurações › Treinamento em Dupla › Créditos (migração 20261003013530; só administrador, o banco confere).
// Cinco blocos: configuração da cota, uso de hoje, conceder créditos, extrato do aluno (com estorno) e conferência de saldos.
// Moeda "match" (créditos de matches). A moeda "ia" ainda não tem tela: a configuração dela volta ao banco como veio.
// Todo número de limite começa VAZIO e a cota começa DESLIGADA; nada aqui inventa valor.
import React from "react";
import { Badge, Banner, Button, Card, Checkbox, SelectField, StatTile, Switch, Textarea, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { dateTimeBR, ListRow, LoadError, Loading, messageOf, PLAN_LABEL, useDebounced, useLoad } from "./common.jsx";

const PLANS = ["trial", "pro", "elite"];
const POOL = "match";
const MAX_LIMIT = 100000;
const MAX_GRANT = 10000;

const KIND_LABEL = { consume: "Consumo", refund: "Estorno", grant: "Concessão", purchase: "Compra", revoke: "Revogação", adjust: "Ajuste" };
const BUCKET_LABEL = { daily: "Diária", bonus: "Bônus", purchased: "Comprados", unlimited: "Sem limite" };
// Ordem de débito do documento (o banco só aceita estes três, sem repetir). Somente leitura nesta etapa.
const DEFAULT_ORDER = ["daily", "bonus", "purchased"];
const PERIODS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "365", label: "Últimos 365 dias" },
];
const PROBLEM_LABEL = {
  uso_do_dia: "Uso do dia diferente do livro",
  saldo_bonus: "Saldo de bônus diferente do livro",
  saldo_comprados: "Saldo de comprados diferente do livro",
  cobranca_sem_lancamento: "Cobrança de sala sem lançamento",
};

const titleStyle = { margin: 0, font: "var(--type-h4)" };
const stackStyle = { display: "flex", flexDirection: "column", gap: 12 };
const mutedStyle = { margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" };
const rightStyle = { display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" };
const doneStyle = { font: "var(--type-body-sm)", color: "var(--success-text)" };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 };
const thStyle = { textAlign: "left", padding: "8px 10px", font: "var(--type-label)", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" };
const tdStyle = { padding: "8px 10px", font: "var(--type-body-sm)", color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)", verticalAlign: "top" };

/** "2026-10-17" → "17/10/2026" sem passar por fuso (a data do livro já é a de Brasília). */
const dayBR = (day) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};
/** Data de hoje em Brasília ("AAAA-MM-DD"), igual à do banco; só serve de reserva se "Uso de hoje" não carregou. */
const todayInBrazil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const num = (v) => (typeof v === "number" ? String(v) : "—");

// ------------------------------------------------------------------------------------------------ 1) configuração
const fromConfig = (raw) => {
  const match = raw?.match ?? {};
  const field = (plan) => (Number.isInteger(match[plan]) ? String(match[plan]) : "");
  return {
    ativa: raw?.ativa === true,
    limites: { trial: field("trial"), pro: field("pro"), elite: field("elite") },
    cobra: match.cobra_rodada_extra !== false,
    ordem: Array.isArray(match.ordem) ? match.ordem : null,
    ia: raw?.ia && typeof raw.ia === "object" ? raw.ia : {},
  };
};

/** Campo vazio → null; inteiro de 0 a 100000 → número; qualquer outra coisa → erro do campo. */
const parseLimit = (text) => {
  const s = String(text).trim();
  if (s === "") return { value: null };
  if (/^\d+$/.test(s) && Number(s) <= MAX_LIMIT) return { value: Number(s) };
  return { error: `Use um número inteiro de 0 a ${MAX_LIMIT} ou deixe vazio.` };
};

function ConfigCard() {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_admin_credit_config", {}), [backend]);
  const [form, setForm] = React.useState(null);
  const [fieldErrors, setFieldErrors] = React.useState({});
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  React.useEffect(() => {
    if (data) setForm(fromConfig(data));
  }, [data]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!form) return <Loading />;

  const touch = () => setState((s) => ({ ...s, done: false }));
  const change = (patch) => (setForm((f) => ({ ...f, ...patch })), touch());
  const setLimit = (plan, text) => {
    setForm((f) => ({ ...f, limites: { ...f.limites, [plan]: text } }));
    setFieldErrors((e) => ({ ...e, [plan]: undefined }));
    touch();
  };
  const save = async (event) => {
    event.preventDefault();
    const errors = {};
    const values = {};
    for (const plan of PLANS) {
      const parsed = parseLimit(form.limites[plan]);
      if (parsed.error) errors[plan] = parsed.error;
      else values[plan] = parsed.value;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    const match = { ...values, cobra_rodada_extra: form.cobra, ...(form.ordem ? { ordem: form.ordem } : {}) };
    setState({ saving: true, error: null, done: false });
    try {
      const saved = await backend.rpc("app_admin_save_credit_config", { p_config: { ativa: form.ativa, match, ia: form.ia } });
      if (saved && typeof saved === "object") setForm(fromConfig(saved));
      setState({ saving: false, error: null, done: true });
    } catch (err) {
      setState({ saving: false, error: messageOf(err), done: false });
    }
  };
  const order = (form.ordem ?? DEFAULT_ORDER).map((b) => BUCKET_LABEL[b] ?? b);

  return (
    <form onSubmit={save} noValidate>
      <Card>
        <div style={stackStyle}>
          <h4 style={titleStyle}>Configuração</h4>
          <Switch label="Cota diária de matches" checked={form.ativa} onChange={(e) => change({ ativa: e.target.checked })} />
          <div style={gridStyle}>
            {PLANS.map((plan) => (
              <TextField
                key={plan}
                label={PLAN_LABEL[plan]}
                hint="Créditos por dia"
                inputMode="numeric"
                autoComplete="off"
                value={form.limites[plan]}
                error={fieldErrors[plan]}
                onChange={(e) => setLimit(plan, e.target.value)}
              />
            ))}
          </div>
          <Banner tone="info">Plano sem número fica sem crédito quando a cota estiver ligada.</Banner>
          <Switch label="Cada estação nova na mesma sala gasta crédito" checked={form.cobra} onChange={(e) => change({ cobra: e.target.checked })} />
          <p style={mutedStyle}>Treinar outra estação na mesma sala cobra 1 crédito de cada um, como o primeiro início.</p>
          <p style={mutedStyle}>Ordem de débito: {order.join(", ").toLowerCase()}.</p>
          {state.error && <Banner tone="danger">{state.error}</Banner>}
          <div style={rightStyle}>
            {state.done && <span style={doneStyle}>Configurações de créditos salvas.</span>}
            <Button type="submit" loading={state.saving}>
              Salvar configurações de créditos
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}

// ------------------------------------------------------------------------------------------------ 2) uso de hoje
function TodayCard({ today }) {
  const { data, error, reload } = today;
  return (
    <Card>
      <div style={stackStyle}>
        <h4 style={titleStyle}>Uso de hoje</h4>
        {error ? (
          <LoadError error={error} retry={reload} />
        ) : !data ? (
          <Loading />
        ) : (
          <div style={gridStyle}>
            <StatTile label="Créditos de matches usados" value={num(data.match?.creditos)} icon="coins" />
            <StatTile label="Alunos" value={num(data.match?.alunos)} icon="users" />
            <StatTile label="Salas" value={num(data.match?.salas)} icon="door-open" />
          </div>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ escolher o aluno
/** Busca por nome ou e-mail (app_admin_users) e lista clicável. `value` é a linha escolhida ({ id, name, email }) ou null. */
function StudentPicker({ value, onChange }) {
  const { backend } = useSession();
  const [search, setSearch] = React.useState("");
  const query = useDebounced(search.trim());
  const list = useLoad(
    () => (query ? backend.rpc("app_admin_users", { p_search: query, p_role: "", p_plan: "", p_limit: 8, p_offset: 0 }) : Promise.resolve(null)),
    [backend, query]
  );
  if (value) {
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Aluno</div>
          <div style={{ font: "600 15px var(--font-sans)", color: "var(--text-primary)", overflowWrap: "anywhere" }}>{value.name || "Sem nome"}</div>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>{value.email}</div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => (onChange(null), setSearch(""))}>
          Trocar aluno
        </Button>
      </div>
    );
  }
  const items = query && Array.isArray(list.data?.items) ? list.data.items : [];
  return (
    <div style={stackStyle}>
      <TextField
        label="Buscar aluno"
        icon="search"
        placeholder="Nome ou e-mail"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
      />
      {query && list.error && <LoadError error={list.error} retry={list.reload} />}
      {query && !list.error && !list.data && <Loading />}
      {query && list.data && items.length === 0 && <p style={mutedStyle}>Nenhum aluno encontrado.</p>}
      {items.length > 0 && (
        <div role="list" aria-label="Alunos encontrados" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((u) => (
            <div role="listitem" key={u.id}>
              <ListRow label={`Escolher ${u.name || u.email}`} onClick={() => onChange({ id: u.id, name: u.name ?? "", email: u.email ?? "" })}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ font: "600 15px var(--font-sans)", color: "var(--text-primary)" }}>{u.name || "Sem nome"}</span>
                  <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>{u.email}</span>
                </div>
              </ListRow>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ 3) conceder
function GrantCard({ onGranted }) {
  const { backend } = useSession();
  const [student, setStudent] = React.useState(null);
  const [qty, setQty] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState({});
  const [state, setState] = React.useState({ busy: false, error: null, done: false });
  // Uma chave por envio: vale até o sucesso (repetir o clique ou tentar de novo não concede duas vezes) e some se o pedido mudar.
  const key = React.useRef(null);
  const inFlight = React.useRef(false);

  const edit = (patch) => {
    if (patch.student !== undefined) setStudent(patch.student);
    if (patch.qty !== undefined) setQty(patch.qty);
    if (patch.reason !== undefined) setReason(patch.reason);
    key.current = null;
    setErrors({});
    setState((s) => ({ ...s, done: false }));
  };
  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    const next = {};
    if (!student) next.student = "Escolha o aluno.";
    const n = String(qty).trim();
    if (!/^\d+$/.test(n) || Number(n) < 1 || Number(n) > MAX_GRANT) next.qty = `Use um número inteiro de 1 a ${MAX_GRANT}.`;
    if (!reason.trim()) next.reason = "Diga o motivo da concessão.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    inFlight.current = true;
    key.current ??= globalThis.crypto.randomUUID();
    setState({ busy: true, error: null, done: false });
    try {
      await backend.rpc("app_admin_credit_grant", { p_user: student.id, p_pool: POOL, p_n: Number(n), p_reason: reason.trim(), p_key: key.current });
      key.current = null;
      setQty("");
      setReason("");
      setState({ busy: false, error: null, done: true });
      onGranted(student.id);
    } catch (err) {
      setState({ busy: false, error: messageOf(err), done: false });
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Card>
        <div style={stackStyle}>
          <h4 style={titleStyle}>Conceder créditos</h4>
          <StudentPicker value={student} onChange={(s) => edit({ student: s })} />
          {errors.student && <Banner tone="danger">{errors.student}</Banner>}
          <TextField label="Quantidade" inputMode="numeric" autoComplete="off" value={qty} error={errors.qty} onChange={(e) => edit({ qty: e.target.value })} />
          <Textarea
            label="Motivo"
            rows={3}
            maxLength={300}
            showCount
            hint="A concessão entra como bônus e o motivo aparece no extrato do aluno."
            value={reason}
            onChange={(e) => edit({ reason: e.target.value })}
          />
          {errors.reason && <Banner tone="danger">{errors.reason}</Banner>}
          {state.error && <Banner tone="danger">{state.error}</Banner>}
          <div style={rightStyle}>
            {state.done && <span style={doneStyle}>Créditos concedidos.</span>}
            <Button type="submit" loading={state.busy}>
              Conceder créditos
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}

// ------------------------------------------------------------------------------------------------ 4) extrato
const signedAmount = (row) => {
  const n = Number(row.amount);
  if (row.kind === "consume" || row.kind === "revoke") return `−${n}`;
  if (row.kind === "adjust") return n > 0 ? `+${n}` : String(n);
  return `+${n}`;
};

function RefundForm({ row, canCompensate, onDone, onCancel }) {
  const { backend } = useSession();
  const [reason, setReason] = React.useState("");
  const [compensar, setCompensar] = React.useState(false);
  const [state, setState] = React.useState({ busy: false, error: null });
  const inFlight = React.useRef(false);
  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (!reason.trim()) return setState({ busy: false, error: "Diga o motivo do estorno." });
    inFlight.current = true;
    setState({ busy: true, error: null });
    try {
      await backend.rpc("app_admin_credit_refund", { p_ledger_id: row.id, p_reason: reason.trim(), p_compensar: canCompensate && compensar });
      onDone();
    } catch (err) {
      setState({ busy: false, error: messageOf(err) });
    } finally {
      inFlight.current = false;
    }
  };
  return (
    <form onSubmit={submit} noValidate style={stackStyle}>
      <Textarea label="Motivo do estorno" rows={2} maxLength={300} showCount value={reason} onChange={(e) => setReason(e.target.value)} />
      {canCompensate && <Checkbox label="Compensar com bônus" checked={compensar} onChange={(e) => setCompensar(e.target.checked)} />}
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div style={rightStyle}>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" type="submit" loading={state.busy}>
          Confirmar estorno
        </Button>
      </div>
    </form>
  );
}

function StatementCard({ stamp, todayDay }) {
  const { backend } = useSession();
  const [student, setStudent] = React.useState(null);
  const [days, setDays] = React.useState("30");
  const [version, setVersion] = React.useState(0);
  const [refunding, setRefunding] = React.useState(null);
  const [refunded, setRefunded] = React.useState(false);
  const { data, error, reload } = useLoad(
    () => (student ? backend.rpc("app_admin_credit_statement", { p_user: student.id, p_pool: POOL, p_days: Number(days) }) : Promise.resolve(null)),
    [backend, student?.id, days, stamp, version]
  );
  const pick = (s) => (setStudent(s), setRefunding(null), setRefunded(false));
  const current = student && data?.user?.id === student.id ? data : null;
  const today = todayDay || todayInBrazil();
  const state = current?.state ?? {};
  const ledger = Array.isArray(current?.ledger) ? current.ledger : [];
  const cobrancas = Array.isArray(current?.cobrancas) ? current.cobrancas : [];

  let quota = "—";
  let quotaHint;
  if (state.ativa === false) quotaHint = "Cota desligada";
  else if (state.ilimitado) quota = "Sem limite";
  else if (typeof state.usados_hoje === "number" && typeof state.limite_dia === "number") quota = `${state.usados_hoje} de ${state.limite_dia}`;

  return (
    <Card>
      <div style={stackStyle}>
        <h4 style={titleStyle}>Extrato do aluno</h4>
        <StudentPicker value={student} onChange={pick} />
        {student && (
          <SelectField label="Período" value={days} onChange={(e) => (setDays(e.target.value), setRefunding(null))} options={PERIODS} />
        )}
        {student && error && <LoadError error={error} retry={reload} />}
        {student && !error && !current && <Loading />}
        {current && (
          <>
            <div style={gridStyle}>
              <StatTile label="Cota do dia" value={quota} hint={quotaHint} icon="coins" />
              <StatTile label="Bônus" value={num(state.bonus)} icon="coins" />
              <StatTile label="Comprados" value={num(state.comprados)} icon="coins" />
            </div>
            {refunded && <span style={doneStyle}>Estorno feito.</span>}
            {ledger.length === 0 ? (
              <p style={mutedStyle}>Nenhum lançamento neste período.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }} aria-label="Lançamentos">
                  <thead>
                    <tr>
                      {["Data", "Tipo", "Saldo", "Quantidade", "Motivo", ""].map((h, i) => (
                        <th key={i} scope="col" style={thStyle}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((row) => {
                      const canRefund = row.kind === "consume" && !row.estornado;
                      const canCompensate = row.bucket === "daily" && typeof row.day === "string" && row.day < today;
                      return (
                        <React.Fragment key={row.id}>
                          <tr>
                            <td style={tdStyle}>{dateTimeBR(row.created_at)}</td>
                            <td style={tdStyle}>{KIND_LABEL[row.kind] ?? row.kind}</td>
                            <td style={tdStyle}>{BUCKET_LABEL[row.bucket] ?? row.bucket}</td>
                            <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{signedAmount(row)}</td>
                            <td style={{ ...tdStyle, overflowWrap: "anywhere" }}>{row.reason || "—"}</td>
                            <td style={tdStyle}>
                              {canRefund && refunding !== row.id && (
                                <Button size="sm" variant="secondary" onClick={() => (setRefunding(row.id), setRefunded(false))}>
                                  Estornar
                                </Button>
                              )}
                              {row.kind === "consume" && row.estornado && (
                                <Badge size="sm" tone="neutral">
                                  Estornado
                                </Badge>
                              )}
                            </td>
                          </tr>
                          {canRefund && refunding === row.id && (
                            <tr>
                              <td colSpan={6} style={tdStyle}>
                                <RefundForm
                                  row={row}
                                  canCompensate={canCompensate}
                                  onCancel={() => setRefunding(null)}
                                  onDone={() => (setRefunding(null), setRefunded(true), setVersion((v) => v + 1))}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <h5 style={{ margin: 0, font: "var(--type-label)", color: "var(--text-primary)" }}>Cobranças das salas</h5>
            {cobrancas.length === 0 ? (
              <p style={mutedStyle}>Nenhuma cobrança de sala neste período.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }} aria-label="Cobranças das salas">
                  <thead>
                    <tr>
                      {["Data", "Rodada", "Saldo"].map((h) => (
                        <th key={h} scope="col" style={thStyle}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cobrancas.map((c, i) => (
                      <tr key={`${c.room_id}-${c.round}-${i}`}>
                        <td style={tdStyle}>{dayBR(c.usage_date)}</td>
                        <td style={tdStyle}>{c.round}</td>
                        <td style={tdStyle}>{BUCKET_LABEL[c.bucket] ?? c.bucket}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ 5) conferir saldos
function problemDetail(p) {
  const parts = [];
  if (p.user_id) parts.push(`aluno ${p.user_id}`);
  if (p.day) parts.push(`dia ${dayBR(p.day)}`);
  if (p.room_id) parts.push(`sala ${p.room_id}`);
  if (p.round != null) parts.push(`rodada ${p.round}`);
  if (p.no_resumo != null) parts.push(`no resumo ${p.no_resumo}`);
  if (p.no_livro != null) parts.push(`no livro ${p.no_livro}`);
  return parts.join(" · ");
}

function ReconcileCard() {
  const { backend } = useSession();
  const [state, setState] = React.useState({ busy: false, error: null, result: null });
  const run = async () => {
    setState({ busy: true, error: null, result: null });
    try {
      setState({ busy: false, error: null, result: await backend.rpc("app_admin_credit_reconcile", { p_pool: POOL }) });
    } catch (err) {
      setState({ busy: false, error: messageOf(err), result: null });
    }
  };
  const result = state.result;
  const problems = Array.isArray(result?.problemas) ? result.problemas : [];
  const total = typeof result?.total === "number" ? result.total : problems.length;
  return (
    <Card>
      <div style={stackStyle}>
        <h4 style={titleStyle}>Conferir saldos</h4>
        <div>
          <Button variant="secondary" loading={state.busy} onClick={run}>
            Conferir saldos
          </Button>
        </div>
        {state.error && <Banner tone="danger">{state.error}</Banner>}
        {result && result.ok === true && <Banner tone="success">Tudo certo.</Banner>}
        {result && result.ok !== true && (
          <div style={stackStyle}>
            <Banner tone="warning">
              {total} {total === 1 ? "problema encontrado" : "problemas encontrados"}
            </Banner>
            {total > problems.length && <p style={mutedStyle}>Mostrando os primeiros {problems.length}.</p>}
            <ul aria-label="Problemas encontrados" style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              {problems.map((p, i) => (
                <li key={i} style={{ font: "var(--type-body-sm)", color: "var(--text-primary)", overflowWrap: "anywhere" }}>
                  <strong>{PROBLEM_LABEL[p.tipo] ?? p.tipo}</strong>
                  {problemDetail(p) && `: ${problemDetail(p)}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

export function AdminCreditos() {
  const { backend } = useSession();
  const today = useLoad(() => backend.rpc("app_admin_credit_today", {}), [backend]);
  // Sobe a cada concessão para o extrato do mesmo aluno e o "Uso de hoje" não ficarem velhos.
  const [stamp, setStamp] = React.useState(0);
  return (
    <section aria-labelledby="creditos-titulo" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 id="creditos-titulo" style={{ margin: 0, font: "var(--type-h4)" }}>
        Créditos
      </h3>
      <ConfigCard />
      <TodayCard today={today} />
      <GrantCard onGranted={() => (setStamp((n) => n + 1), today.reload())} />
      <StatementCard stamp={stamp} todayDay={today.data?.day} />
      <ReconcileCard />
    </section>
  );
}
