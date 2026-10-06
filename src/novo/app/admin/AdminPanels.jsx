// Visão geral, planos, estações, configurações e registro de ações.
import React from "react";
import { Badge, Banner, Button, Card, EmptyState, SelectField, StatCard, Switch, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { dateTimeBR, LoadError, Loading, messageOf, PLAN_LABEL, ROLE_LABEL, SUB_STATUS_LABEL, TextArea, useLoad } from "./common.jsx";

// ---------------------------------------------------------------- visão geral
export function AdminOverview({ isAdmin }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const { data, error, reload } = useLoad(() => backend.rpc("app_admin_overview"), [backend]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const plans = data.users.by_plan;
  const paying = ["pro:active", "elite:active", "pro:past_due", "elite:past_due"].reduce((n, k) => n + (plans[k] ?? 0), 0);
  const grid = { display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))", gap: 16 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {isAdmin && (
        <div style={grid}>
          <StatCard label="Usuários" value={data.users.total} caption={`${data.users.new_7d} novos em 7 dias`} icon="users" />
          <StatCard label="Ativos" value={data.users.active_7d} caption="estudaram nos últimos 7 dias" tone="success" icon="activity" />
          <StatCard label="Em teste" value={plans["trial:trialing"] ?? 0} caption="teste grátis em andamento" tone="warning" icon="clock" />
          <StatCard label="Planos pagos" value={paying} caption="Pro e Elite ativos" tone="info" icon="crown" />
        </div>
      )}
      <div style={grid}>
        <StatCard label="Questões" value={data.questions.total} caption={`${data.questions.exams} provas · ${data.questions.annulled} anuladas`} icon="file-question" />
        <StatCard label="Sem figura" value={data.questions.needs_image} caption="citam imagem não vinculada" tone="warning" icon="image" />
        <StatCard label="Respostas" value={data.activity.attempts} caption={`${data.activity.attempts_7d} nos últimos 7 dias`} tone="success" icon="circle-check" />
        <StatCard label="Estações" value={data.stations.approved} caption={`${data.stations.pending} aguardando revisão médica`} tone="info" icon="clipboard-list" />
      </div>
      {isAdmin && (
        <Card>
          <div style={{ font: "var(--type-label)", marginBottom: 12 }}>Usuários por papel</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(ROLE_LABEL).map(([role, label]) => (
              <Badge key={role}>
                {label}: {data.users.by_role[role] ?? 0}
              </Badge>
            ))}
          </div>
          <div style={{ font: "var(--type-label)", margin: "20px 0 12px" }}>Assinaturas</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.keys(plans).length === 0 && <span style={{ color: "var(--text-tertiary)" }}>Nenhuma.</span>}
            {Object.entries(plans).map(([key, n]) => {
              const [plan, status] = key.split(":");
              return (
                <Badge key={key} tone="pro">
                  {PLAN_LABEL[plan] ?? plan} · {SUB_STATUS_LABEL[status] ?? status}: {n}
                </Badge>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- planos
const PERIODS = [
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "yearly", label: "Anual" },
  { value: "one_time", label: "Pagamento único" },
];
const toPrice = (cents) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));
function toCents(text) {
  const clean = String(text).replace(/[R$\s.]/g, "").replace(",", ".");
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : NaN;
}

function PlanEditor({ plan, onSaved }) {
  const { backend } = useSession();
  const [form, setForm] = React.useState({
    name: plan.name,
    description: plan.description ?? "",
    price: toPrice(plan.price_cents),
    billing_period: plan.billing_period,
    features: (plan.features ?? []).join("\n"),
    active: plan.active,
  });
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  const set = (patch) => (setForm((f) => ({ ...f, ...patch })), setState((s) => ({ ...s, done: false })));
  const trial = plan.code === "trial";

  const save = async (event) => {
    event.preventDefault();
    const cents = toCents(form.price);
    if (Number.isNaN(cents)) return setState({ saving: false, error: "Preço inválido. Use, por exemplo, 49,90.", done: false });
    setState({ saving: true, error: null, done: false });
    try {
      const plans = await backend.rpc("app_admin_save_plan", {
        p_plan: {
          code: plan.code,
          name: form.name,
          description: form.description,
          price_cents: trial ? 0 : cents,
          billing_period: form.billing_period,
          features: form.features.split("\n"),
          active: form.active,
        },
      });
      onSaved(plans);
      setState({ saving: false, error: null, done: true });
    } catch (error) {
      setState({ saving: false, error: messageOf(error), done: false });
    }
  };

  return (
    <Card>
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>{PLAN_LABEL[plan.code]}</h3>
          <Badge tone={plan.active ? "success" : "neutral"}>{plan.active ? (trial ? "Oferecido no cadastro" : "À venda") : "Fora de venda"}</Badge>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <TextField label="Nome exibido" value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
          {!trial && <TextField label="Preço (R$)" value={form.price} inputMode="decimal" placeholder="49,90" onChange={(e) => set({ price: e.target.value })} />}
          {!trial && <SelectField label="Cobrança" value={form.billing_period} onChange={(e) => set({ billing_period: e.target.value })} options={PERIODS} />}
        </div>
        <TextArea label="Descrição" rows={2} maxLength={400} value={form.description} onChange={(description) => set({ description })} />
        <TextArea label="Recursos incluídos (um por linha)" rows={4} value={form.features} onChange={(features) => set({ features })} hint="Aparecem na tela de planos do aluno. Até 20 itens." />
        <Switch label={trial ? "Oferecer teste grátis no cadastro" : "Colocar à venda"} description={trial ? "Os dias de teste ficam em Configurações." : "Só com preço definido."} checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
        {state.error && <Banner tone="danger">{state.error}</Banner>}
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
          {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Plano salvo.</span>}
          <Button type="submit" loading={state.saving}>
            Salvar plano
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function AdminPlans() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_plans"), [backend]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Banner tone="info" title="Cobrança ainda não ligada">
        Nome, preço e recursos definidos aqui aparecem para os alunos. O pagamento on-line depende da integração com o provedor (próxima etapa). Até lá, libere planos manualmente em Usuários.
      </Banner>
      {data.map((plan) => (
        <PlanEditor key={plan.code} plan={plan} onSaved={setData} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- estações
export function AdminStations() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_stations"), [backend]);
  const [busy, setBusy] = React.useState(null);
  const [actionError, setActionError] = React.useState(null);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const setReview = async (id, status) => {
    setBusy(id);
    setActionError(null);
    try {
      setData(await backend.rpc("app_admin_set_station_review", { p_station_id: id, p_status: status }));
    } catch (err) {
      setActionError(messageOf(err));
    }
    setBusy(null);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Banner tone="warning" title="Aprovação depende de revisão médica">
        Só aprove uma estação depois que um médico revisor conferir roteiro, impressos e checklist. Aprovada, ela aparece para todos os alunos.
      </Banner>
      {actionError && <Banner tone="danger">{actionError}</Banner>}
      {data.length === 0 && <EmptyState icon="clipboard-list" title="Nenhuma estação cadastrada" />}
      {data.map((s) => (
        <Card key={s.id}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Badge tone={s.medical_review === "approved" ? "success" : "warning"} size="sm">
                  {s.medical_review === "approved" ? "Aprovada" : "Aguardando revisão médica"}
                </Badge>
                <Badge size="sm">{s.area}</Badge>
                {s.is_pro_only && (
                  <Badge tone="pro" size="sm">
                    Pro
                  </Badge>
                )}
                {s.institution === "INEP" && <Badge size="sm">INEP</Badge>}
              </div>
              <div style={{ font: "600 16px var(--font-sans)", marginTop: 8 }}>{s.name}</div>
              <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{s.topic}</div>
              {s.reports > 0 && (
                <div style={{ marginTop: 10, font: "var(--type-body-sm)" }}>
                  <b>
                    {s.reports} {s.reports === 1 ? "relato de erro" : "relatos de erro"}
                  </b>
                  {s.last_reports.map((r) => (
                    <div key={r.created_at} style={{ color: "var(--text-secondary)", marginTop: 4 }}>
                      “{r.message}” · {dateTimeBR(r.created_at)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {s.medical_review === "approved" ? (
              <Button variant="secondary" size="sm" onClick={() => setReview(s.id, "pending")} loading={busy === s.id}>
                Voltar para revisão
              </Button>
            ) : (
              <Button size="sm" icon="check" onClick={() => setReview(s.id, "approved")} loading={busy === s.id}>
                Aprovar
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- configurações
const TONES = [
  { value: "info", label: "Informação (azul)" },
  { value: "brand", label: "Destaque (verde)" },
  { value: "warning", label: "Atenção (amarelo)" },
  { value: "success", label: "Boa notícia (verde claro)" },
];

export function AdminSettings() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_settings"), [backend]);
  const [form, setForm] = React.useState(null);
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  React.useEffect(() => {
    if (data) setForm({ trial_days: String(data.trial_days), ...data.announcement });
  }, [data]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!form) return <Loading />;
  const set = (patch) => (setForm((f) => ({ ...f, ...patch })), setState((s) => ({ ...s, done: false })));
  const save = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null, done: false });
    try {
      setData(
        await backend.rpc("app_admin_save_settings", {
          p_settings: { trial_days: form.trial_days.trim(), announcement: { active: form.active, tone: form.tone, title: form.title, text: form.text } },
        })
      );
      setState({ saving: false, error: null, done: true });
    } catch (err) {
      setState({ saving: false, error: messageOf(err), done: false });
    }
  };
  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Cadastro</h3>
          <div style={{ maxWidth: 260 }}>
            <TextField label="Dias de teste grátis" value={form.trial_days} inputMode="numeric" maxLength={2} onChange={(e) => set({ trial_days: e.target.value })} hint="Vale para os próximos cadastros (0 a 90)." />
          </div>
        </div>
      </Card>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Aviso para os alunos</h3>
          <Switch label="Mostrar aviso no Início" description="Aparece para todos os alunos logados." checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <TextField label="Título" value={form.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
            <SelectField label="Cor" value={form.tone} onChange={(e) => set({ tone: e.target.value })} options={TONES} />
          </div>
          <TextArea label="Texto" rows={3} maxLength={600} value={form.text} onChange={(text) => set({ text })} />
          {(form.title || form.text) && (
            <div>
              <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginBottom: 6 }}>Prévia</div>
              <Banner tone={form.tone} title={form.title}>
                {form.text}
              </Banner>
            </div>
          )}
        </div>
      </Card>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
        {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Configurações salvas.</span>}
        <Button type="submit" loading={state.saving}>
          Salvar configurações
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Stazia Tutor
const PROFANITY_CAP = [
  { value: "off", label: "Desativados para todos" },
  { value: "mild", label: "Até leves" },
  { value: "moderate", label: "Até liberados (xinga o aluno na zoeira)" },
];

/** Liga e desliga o Tutor, define o limite por aluno e mostra o consumo. Toda mudança pede motivo e vai para o registro. */
export function AdminTutor() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_tutor_config"), [backend]);
  const [form, setForm] = React.useState(null);
  const [reason, setReason] = React.useState("");
  const [server, setServer] = React.useState(null);
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  React.useEffect(() => {
    if (data) setForm({ enabled: data.enabled, requires_pro: data.requires_pro, daily_message_limit: String(data.daily_message_limit), max_profanity: data.max_profanity, voice_enabled: data.voice_enabled });
  }, [data]);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = backend.accessToken ? await backend.accessToken() : null;
        if (!token) return;
        const res = await fetch("/api/tutor/status", { headers: { Authorization: `Bearer ${token}` } });
        if (alive && res.ok) setServer(await res.json());
      } catch {
        // servidor indisponível: o painel segue sem a situação da IA
      }
    })();
    return () => {
      alive = false;
    };
  }, [backend]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!form) return <Loading />;
  const set = (patch) => (setForm((f) => ({ ...f, ...patch })), setState((s) => ({ ...s, done: false })));
  const save = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null, done: false });
    try {
      setData(await backend.rpc("app_admin_tutor_save_config", { p_config: { ...form, daily_message_limit: form.daily_message_limit.trim() }, p_reason: reason }));
      setReason("");
      setState({ saving: false, error: null, done: true });
    } catch (err) {
      setState({ saving: false, error: messageOf(err), done: false });
    }
  };
  const u = data.usage_30d;
  return (
    <form onSubmit={save} noValidate>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Stazia Tutor</h3>
          <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            Cada mensagem do aluno é uma chamada de IA paga. O Tutor nasce desligado. A fala do aluno é enviada ao provedor de IA configurado no servidor.
          </p>
          {server && (
            <Banner tone={server.ready ? (server.simulated ? "warning" : "success") : "warning"}>
              {server.ready ? (server.simulated ? "IA em modo de SIMULAÇÃO (desenvolvimento): as respostas não são de IA." : `IA pronta no servidor: ${server.provider} (${server.model}).`) : `IA ainda não configurada no servidor: ${server.pending ?? "sem detalhe"}`}
            </Banner>
          )}
          <Switch label="Tutor ligado" description="Desligado: os alunos veem que o Tutor ainda não está no ar." checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          <Switch label="Só para planos pagos" description="Ligado: quem está no teste grátis vê o convite para assinar." checked={form.requires_pro} onChange={(e) => set({ requires_pro: e.target.checked })} />
          <Switch label="Conversa por voz" description="O aluno fala e ouve o professor no próprio aparelho (voz do navegador, sem custo extra de IA)." checked={form.voice_enabled} onChange={(e) => set({ voice_enabled: e.target.checked })} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <TextField label="Mensagens por aluno por dia" value={form.daily_message_limit} inputMode="numeric" maxLength={3} onChange={(e) => set({ daily_message_limit: e.target.value })} hint="De 1 a 500. É o teto de gasto por aluno." />
            <SelectField label="Palavrões (teto para todos os professores)" value={form.max_profanity} onChange={(e) => set({ max_profanity: e.target.value })} options={PROFANITY_CAP} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge>{u.requests} mensagens em 30 dias</Badge>
            <Badge>{u.students} aluno(s)</Badge>
            <Badge>{Number(u.cost_usd) > 0 ? `US$ ${Number(u.cost_usd).toFixed(2)}` : "custo não medido"}</Badge>
            <Badge>{data.sessions} conversa(s)</Badge>
          </div>
          <TextField label="Motivo da mudança (obrigatório, fica no registro)" value={reason} onChange={(e) => setReason(e.target.value)} />
          {state.error && <Banner tone="danger">{state.error}</Banner>}
          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
            {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Tutor atualizado.</span>}
            <Button type="submit" loading={state.saving} disabled={reason.trim().length < 10}>Salvar Tutor</Button>
          </div>
        </div>
      </Card>
    </form>
  );
}

// ---------------------------------------------------------------- registro
const ACTION_LABEL = {
  "user.role": "Papel alterado",
  "user.subscription": "Plano alterado",
  "user.delete": "Usuário excluído",
  "questions.import": "Questões importadas",
  "question.inserted": "Questão criada",
  "question.updated": "Questão editada",
  "station.review": "Revisão de estação",
  "plan.save": "Plano editado",
  "settings.save": "Configurações salvas",
  "tutor.config": "Tutor configurado",
};

function summary(entry) {
  const d = entry.details ?? {};
  if (entry.action === "user.role") return `${ROLE_LABEL[d.from] ?? d.from} → ${ROLE_LABEL[d.to] ?? d.to}`;
  if (entry.action === "user.subscription") return `${PLAN_LABEL[d.to?.plan] ?? d.to?.plan} · ${SUB_STATUS_LABEL[d.to?.status] ?? d.to?.status}`;
  if (entry.action === "user.delete") return d.email;
  if (entry.action === "questions.import") return `${d.inserted} novas · ${d.updated} atualizadas · ${d.skipped} puladas`;
  if (entry.action === "station.review") return `${entry.target}: ${d.to === "approved" ? "aprovada" : "voltou para revisão"}`;
  if (entry.action === "plan.save") return `${PLAN_LABEL[entry.target] ?? entry.target}${d.active ? " · à venda" : ""}`;
  if (entry.action.startsWith("question.")) return entry.target;
  return "";
}

export function AdminAudit() {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_admin_audit", { p_limit: 200 }), [backend]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  if (data.length === 0) return <EmptyState icon="history" title="Nenhuma ação registrada" description="Toda alteração feita na administração aparece aqui, com quem fez e quando." />;
  return (
    <Card padding={8}>
      {data.map((entry, index) => (
        <div key={entry.id} style={{ display: "flex", gap: 12, padding: "12px 16px", borderTop: index ? "1px solid var(--border-subtle)" : 0, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ font: "600 14px var(--font-sans)" }}>{ACTION_LABEL[entry.action] ?? entry.action}</div>
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>{summary(entry)}</div>
          </div>
          <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", textAlign: "right" }}>
            {dateTimeBR(entry.created_at)}
            <br />
            {entry.actor ?? "conta excluída"}
          </div>
        </div>
      ))}
    </Card>
  );
}
