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

// ---------------------------------------------------------------- Nexus
const VOICE_PROVIDERS = [
  { value: "auto", label: "Automático: Gemini quando configurado, senão GPT-Live, senão Realtime" },
  { value: "gemini", label: "Gemini (português do Brasil nativo)" },
  { value: "live", label: "GPT-Live (OpenAI)" },
  { value: "realtime", label: "OpenAI Realtime" },
];
const VOICE_NAMES = [
  { value: "", label: "A voz de cada professor (padrão)" },
  { value: "kore", label: "Kore (Gemini, feminina firme)" },
  { value: "sulafat", label: "Sulafat (Gemini, calorosa)" },
  { value: "orus", label: "Orus (Gemini, masculina firme)" },
  { value: "marin", label: "Marin (OpenAI)" },
  { value: "cedar", label: "Cedar (OpenAI)" },
  { value: "__outra", label: "Outra (digite o nome)" },
];
const DURONA_LEVELS = [
  { value: "moderada", label: "Moderada" },
  { value: "forte", label: "Forte" },
  { value: "sem_filtro", label: "Sem filtro (padrão; ataque pessoal continua proibido)" },
];
const ENDED_LABEL = { student: "pelo aluno", timeout: "sem sinal", quota: "cota", replaced: "outro aparelho", error: "erro", session_closed: "sessão encerrada", session_limit: "limite da conversa", ativa: "ativas" };
/** "INEP = inépi" (uma por linha) ↔ [{ term, say }] */
const pronText = (list) => (list ?? []).map((x) => `${x.term} = ${x.say}`).join("\n");
const pronList = (text) =>
  String(text ?? "")
    .split("\n")
    .map((l) => l.split("="))
    .filter((p) => p.length >= 2 && p[0].trim() && p.slice(1).join("=").trim())
    .map((p) => ({ term: p[0].trim().slice(0, 40), say: p.slice(1).join("=").trim().slice(0, 80) }));

const PROFANITY_CAP = [
  { value: "off", label: "Desativados para todos" },
  { value: "mild", label: "Até leves" },
  { value: "moderate", label: "Até liberados (Durona: contra a resposta, nunca contra o aluno)" },
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
    if (data)
      setForm({
        enabled: data.enabled, requires_pro: data.requires_pro, daily_message_limit: String(data.daily_message_limit), max_profanity: data.max_profanity, voice_enabled: data.voice_enabled,
        trial_text_daily: String(data.trial_text_daily ?? 40), trial_questions_daily: String(data.trial_questions_daily ?? 30),
        trial_voice_daily_min: String(Math.round((data.trial_voice_daily_seconds ?? 600) / 60)), trial_voice_total_min: String(Math.round((data.trial_voice_total_seconds ?? 2400) / 60)),
        paid_voice_daily_min: String(Math.round((data.paid_voice_daily_seconds ?? 3600) / 60)),
        voice_provider: data.voice_provider ?? "auto",
        voice_choice: !data.voice_name ? "" : ["marin", "cedar"].includes(data.voice_name) ? data.voice_name : "__outra",
        voice_other: data.voice_name && !["marin", "cedar"].includes(data.voice_name) ? data.voice_name : "",
        voice_session_max_min: String(Math.round((data.voice_session_max_seconds ?? 1800) / 60)),
        save_transcripts: data.save_transcripts ?? true,
        transcript_retention_days: String(data.transcript_retention_days ?? 180),
        emotion_engine: data.emotion_engine ?? true,
        inside_jokes: data.inside_jokes ?? true,
        durona_level: data.durona_level ?? "forte",
        pronunciations: pronText(data.pronunciations),
      });
  }, [data]);
  const personas = useLoad(() => backend.rpc("app_admin_tutor_personalities"), [backend]);
  const [personaState, setPersonaState] = React.useState({ busy: null, error: null });
  const togglePersona = async (id, active) => {
    setPersonaState({ busy: id, error: null });
    try {
      personas.setData(await backend.rpc("app_admin_tutor_set_personality", { p_id: id, p_active: active, p_reason: reason }));
      setPersonaState({ busy: null, error: null });
    } catch (err) {
      setPersonaState({ busy: null, error: messageOf(err) });
    }
  };
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
      const n = (x) => String(x ?? "").trim();
      const min = (x) => (n(x) === "" ? "" : String(Math.round(Number(n(x)) * 60)));
      const config = {
        enabled: form.enabled, requires_pro: form.requires_pro, max_profanity: form.max_profanity, voice_enabled: form.voice_enabled,
        daily_message_limit: n(form.daily_message_limit), trial_text_daily: n(form.trial_text_daily), trial_questions_daily: n(form.trial_questions_daily),
        trial_voice_daily_seconds: min(form.trial_voice_daily_min), trial_voice_total_seconds: min(form.trial_voice_total_min), paid_voice_daily_seconds: min(form.paid_voice_daily_min),
        voice_provider: form.voice_provider, voice_name: form.voice_choice === "__outra" ? n(form.voice_other).toLowerCase() : form.voice_choice,
        voice_session_max_seconds: min(form.voice_session_max_min), save_transcripts: form.save_transcripts, transcript_retention_days: n(form.transcript_retention_days),
        emotion_engine: form.emotion_engine, inside_jokes: form.inside_jokes, durona_level: form.durona_level, pronunciations: pronList(form.pronunciations),
      };
      setData(await backend.rpc("app_admin_tutor_save_config", { p_config: config, p_reason: reason }));
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
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Nexus</h3>
          <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            Cada mensagem do aluno é uma chamada de IA paga. O Tutor nasce desligado. A fala do aluno é enviada ao provedor de IA configurado no servidor.
          </p>
          {server && (
            <Banner tone={server.ready ? (server.simulated ? "warning" : "success") : "warning"}>
              {server.ready ? (server.simulated ? "IA em modo de SIMULAÇÃO (desenvolvimento): as respostas não são de IA." : `IA pronta no servidor: ${server.provider} (${server.model}).`) : `IA ainda não configurada no servidor: ${server.pending ?? "sem detalhe"}`}
            </Banner>
          )}
          <Switch label="Tutor ligado" description="Desligado: os alunos veem que o Tutor ainda não está no ar." checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          {server && (
            <Banner tone={server.realtime_voice ? "success" : "warning"}>
              {server.realtime_voice ? `Voz em tempo real pronta no servidor (${server.realtime_model}).` : `Voz em tempo real não configurada: ${server.realtime_pending ?? "sem detalhe"} Sem ela, a voz é a do aparelho.`}
            </Banner>
          )}
          <Switch label="Planos pagos + teste grátis" description="Ligado: quem não assina tem o teste grátis do Tutor (começa no primeiro uso) e depois vê o convite para assinar. Desligado: o Tutor fica liberado para todos (só para testes internos)." checked={form.requires_pro} onChange={(e) => set({ requires_pro: e.target.checked })} />
          <Switch label="Conversa por voz" description="Voz em tempo real pelo servidor (paga por minuto) quando configurada; senão, a voz do próprio aparelho." checked={form.voice_enabled} onChange={(e) => set({ voice_enabled: e.target.checked })} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <TextField label="Interações de texto por dia (plano pago)" value={form.daily_message_limit} inputMode="numeric" maxLength={3} onChange={(e) => set({ daily_message_limit: e.target.value })} hint="De 1 a 500. É o teto de gasto por aluno." />
            <TextField label="Voz por dia (plano pago, minutos)" value={form.paid_voice_daily_min} inputMode="numeric" maxLength={4} onChange={(e) => set({ paid_voice_daily_min: e.target.value })} />
            <SelectField label="Palavrões (teto para a Durona)" value={form.max_profanity} onChange={(e) => set({ max_profanity: e.target.value })} options={PROFANITY_CAP} />
          </div>
          <div className="sm-overline">Teste grátis (7 dias, a partir do primeiro uso)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <TextField label="Interações de texto por dia" value={form.trial_text_daily} inputMode="numeric" maxLength={3} onChange={(e) => set({ trial_text_daily: e.target.value })} />
            <TextField label="Questões por dia" value={form.trial_questions_daily} inputMode="numeric" maxLength={3} onChange={(e) => set({ trial_questions_daily: e.target.value })} />
            <TextField label="Voz por dia (minutos)" value={form.trial_voice_daily_min} inputMode="numeric" maxLength={4} onChange={(e) => set({ trial_voice_daily_min: e.target.value })} />
            <TextField label="Voz no teste todo (minutos)" value={form.trial_voice_total_min} inputMode="numeric" maxLength={5} onChange={(e) => set({ trial_voice_total_min: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge>{u.requests} mensagens em 30 dias</Badge>
            <Badge>{u.students} aluno(s)</Badge>
            <Badge>{Number(u.cost_usd) > 0 ? `US$ ${Number(u.cost_usd).toFixed(2)}` : "custo não medido"}</Badge>
            <Badge>{data.sessions} sessão(ões)</Badge>
            {u.voice_minutes > 0 && <Badge>{u.voice_minutes} min de voz</Badge>}
            {data.trials && <Badge>{data.trials.started} teste(s) iniciados · {data.trials.converted} assinaram</Badge>}
          </div>
          <div className="sm-overline" style={{ marginTop: 8 }}>Voz e personalidade</div>
          {server && (
            <Banner tone={(server.gemini_voice_model && !server.gemini_voice_pending) || (server.live_model && !server.live_pending) ? "success" : "info"}>
              {server.gemini_voice_model && !server.gemini_voice_pending
                ? `Gemini pronto no servidor (${server.gemini_voice_model}), com sotaque de brasileiro nativo.`
                : `Gemini: ${server.gemini_voice_pending ?? "não configurado"}`}{" "}
              {server.live_model && !server.live_pending ? `GPT-Live: ${server.live_model}.` : `GPT-Live: ${server.live_pending ?? "não configurado"}`}{" "}
              {server.realtime_model && !server.realtime_pending ? `Realtime de reserva: ${server.realtime_model}.` : ""}
            </Banner>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <SelectField label="Provedor da voz" value={form.voice_provider} onChange={(e) => set({ voice_provider: e.target.value })} options={VOICE_PROVIDERS} hint="Se o escolhido recusar, o servidor usa o próximo sozinho. Cada professor tem uma voz do Gemini e uma da OpenAI." />
            <SelectField label="Voz" value={form.voice_choice} onChange={(e) => set({ voice_choice: e.target.value })} options={VOICE_NAMES} hint="Trocar a voz vale a partir da próxima ligação. Avalie com ouvido humano em português antes de fixar." />
            {form.voice_choice === "__outra" && <TextField label="Nome da voz" value={form.voice_other} maxLength={30} onChange={(e) => set({ voice_other: e.target.value })} hint="Só letras minúsculas, como aparece na OpenAI." />}
            <TextField label="Limite de cada conversa por voz (minutos)" value={form.voice_session_max_min} inputMode="numeric" maxLength={3} onChange={(e) => set({ voice_session_max_min: e.target.value })} hint="O professor termina a frase e a ligação encerra." />
            <SelectField label="Nível da Durona" value={form.durona_level} onChange={(e) => set({ durona_level: e.target.value })} options={DURONA_LEVELS} />
          </div>
          <Switch label="Motor emocional" description="Ligado: o humor do professor muda com os acertos e erros (frustração, paciência, inércia). Desligado: tom de base o tempo todo." checked={form.emotion_engine} onChange={(e) => set({ emotion_engine: e.target.checked })} />
          <Switch label="Piadas internas" description="O professor pode lembrar, com leveza, do assunto que mais derruba o aluno." checked={form.inside_jokes} onChange={(e) => set({ inside_jokes: e.target.checked })} />
          <Switch label="Salvar a transcrição da voz" description="As falas viram texto na conversa (para o aluno rever e para o professor lembrar). Desligado: nada da voz é guardado." checked={form.save_transcripts} onChange={(e) => set({ save_transcripts: e.target.checked })} />
          <Switch label="Salvar o áudio" description="Nunca: o áudio não é gravado em lugar nenhum; ficam só transcrição (se ligada), métricas e resumo." checked={false} disabled onChange={() => {}} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <TextField label="Guardar transcrições da voz por (dias)" value={form.transcript_retention_days} inputMode="numeric" maxLength={4} onChange={(e) => set({ transcript_retention_days: e.target.value })} hint="0 = sem prazo. A limpeza roda uma vez por dia." />
          </div>
          <TextArea label="Pronúncias (uma por linha: termo = como falar)" value={form.pronunciations} rows={3} maxLength={4000} onChange={(v) => set({ pronunciations: v })} placeholder={"INEP = inépi\nPCDT = pê-cê-dê-tê"} />
          {personas.data && (
            <div>
              <div className="sm-field__label" style={{ marginBottom: 6 }}>Professores disponíveis para os alunos (usa o motivo abaixo)</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {personas.data.map((p) => (
                  <Switch key={p.id} label={`${p.emoji} ${p.name}`} description={p.default ? "Padrão: fica sempre ligado." : p.voice ? `Voz: ${p.voice}` : p.tagline} checked={p.active} disabled={p.default || personaState.busy === p.id || reason.trim().length < 10} onChange={(e) => togglePersona(p.id, e.target.checked)} />
                ))}
              </div>
              {personaState.error && <div style={{ marginTop: 8 }}><Banner tone="danger">{personaState.error}</Banner></div>}
            </div>
          )}
          {data.voice_30d && data.voice_30d.calls > 0 && (
            <p style={{ margin: 0, font: "var(--type-caption)", color: "var(--text-secondary)" }}>
              Voz em 30 dias: {data.voice_30d.calls} ligação(ões) · {data.voice_30d.minutes} min (média {data.voice_30d.avg_minutes} min)
              {data.voice_30d.cost_usd > 0 ? ` · US$ ${Number(data.voice_30d.cost_usd).toFixed(2)} (US$ ${(Number(data.voice_30d.cost_usd) / data.voice_30d.calls).toFixed(3)} por ligação)` : ""}
              {data.voice_30d.connect_ms != null ? ` · conectar ${data.voice_30d.connect_ms} ms` : ""}
              {data.voice_30d.first_audio_ms != null ? ` · primeira fala ${data.voice_30d.first_audio_ms} ms` : ""}
              {data.voice_30d.turn_ms != null ? ` · resposta ${data.voice_30d.turn_ms} ms` : ""}
              {` · ${data.voice_30d.reconnects} reconexão(ões)`}
              {Object.keys(data.voice_30d.by_provider ?? {}).length ? ` · ${Object.entries(data.voice_30d.by_provider).map(([k, v]) => `${k === "live" ? "GPT-Live" : k === "gemini" ? "Gemini" : "Realtime"} ${v}`).join(", ")}` : ""}
              {Object.keys(data.voice_30d.ended_by ?? {}).length ? ` · fim: ${Object.entries(data.voice_30d.ended_by).map(([k, v]) => `${ENDED_LABEL[k] ?? k} ${v}`).join(", ")}` : ""}
            </p>
          )}
          {data.cost_by_feature && Object.keys(data.cost_by_feature).length > 0 && (
            <p style={{ margin: 0, font: "var(--type-caption)", color: "var(--text-secondary)" }}>
              Custo estimado em 30 dias por recurso: {Object.entries(data.cost_by_feature).map(([k, v]) => `${k} US$ ${Number(v).toFixed(2)}`).join(" · ")}
              {data.cost_by_persona && Object.keys(data.cost_by_persona).length > 0 ? ` | por professor: ${Object.entries(data.cost_by_persona).map(([k, v]) => `${k} US$ ${Number(v).toFixed(2)}`).join(" · ")}` : ""}
            </p>
          )}
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
  "tutor.personality": "Professor ligado ou desligado",
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
