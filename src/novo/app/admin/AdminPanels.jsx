// Visão geral, planos, estações, configurações e registro de ações.
import React from "react";
import { Badge, Banner, Button, Card, EmptyState, SelectField, StatCard, Switch, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { dateTimeBR, LoadError, Loading, messageOf, PLAN_LABEL, ROLE_LABEL, SUB_STATUS_LABEL, TextArea, useDebounced, useLoad } from "./common.jsx";
import { auditActor, auditLabel, auditSummary } from "./auditLog.js";
import { FolhaBadge, FolhaCandidato } from "./FolhaCandidato.jsx";

// ---------------------------------------------------------------- visão geral
/** O que espera conferência, por aba (chaves de pending_review em app_admin_overview). */
const PENDING_REVIEW = [
  ["stations", "Estações"],
  ["lessons_draft", "Aulas em rascunho"],
  ["podcasts", "Podcasts com roteiro para aprovar"],
  ["updates", "Atualizações pendentes"],
  ["content", "Central de Conteúdo"],
];
export function AdminOverview({ isAdmin }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const { data, error, reload } = useLoad(() => backend.rpc("app_admin_overview"), [backend]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  // só o administrador recebe os números de usuários e planos (o banco não os envia ao editor)
  const plans = data.users?.by_plan ?? {};
  const paying = ["pro:active", "elite:active"].reduce((n, k) => n + (plans[k] ?? 0), 0);
  const pastDue = ["pro:past_due", "elite:past_due"].reduce((n, k) => n + (plans[k] ?? 0), 0);
  const pending = PENDING_REVIEW.filter(([key]) => data.pending_review?.[key] != null);
  // sem nenhuma das duas somas (falha isolada no banco), o bloco some em vez de mostrar só o título
  const ai = data.ai_month && (data.ai_month.central_usd != null || data.ai_month.tutor_usd != null) ? data.ai_month : null;
  const usd = (v) => `US$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;
  const grid = { display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))", gap: 16 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {isAdmin && data.users && (
        <div style={grid}>
          <StatCard label="Usuários" value={data.users.total} caption={`${data.users.new_7d} novos em 7 dias`} icon="users" />
          <StatCard label="Ativos" value={data.users.active_7d} caption="alunos que estudaram nos últimos 7 dias (questões, flashcards, aulas ou Nexus)" tone="success" icon="activity" />
          <StatCard label="Em teste" value={plans["trial:trialing"] ?? 0} caption="teste grátis dentro do prazo" tone="warning" icon="clock" />
          <StatCard label="Planos pagos" value={paying} caption={pastDue > 0 ? `Pro e Elite ativos · ${pastDue} com pagamento pendente` : "Pro e Elite ativos"} tone="info" icon="crown" />
        </div>
      )}
      <div style={grid}>
        <StatCard label="Questões" value={data.questions.total} caption={`${data.questions.exams} provas · ${data.questions.annulled} anuladas`} icon="file-question" />
        <StatCard label="Sem figura" value={data.questions.needs_image} caption="citam figura sem imagem vinculada e ficam fora dos treinos; envie a figura em Questões" tone="warning" icon="image" />
        <StatCard label="Respostas" value={data.activity.attempts} caption={`${data.activity.attempts_7d} nos últimos 7 dias`} tone="success" icon="circle-check" />
        <StatCard label="Estações" value={data.stations.approved} caption={`${data.stations.pending} aguardando revisão médica`} tone="info" icon="clipboard-list" />
      </div>
      {(pending.length > 0 || ai) && (
        <Card>
          {pending.length > 0 && (
            <>
              <div style={{ font: "var(--type-label)", marginBottom: 12 }}>Esperando revisão</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {pending.map(([key, label]) => (
                  <Badge key={key} tone={data.pending_review[key] > 0 ? "warning" : "neutral"}>
                    {label}: {data.pending_review[key]}
                  </Badge>
                ))}
              </div>
            </>
          )}
          {ai && (
            <>
              <div style={{ font: "var(--type-label)", margin: pending.length ? "20px 0 12px" : "0 0 12px" }}>Gasto de IA neste mês (estimado)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {ai.central_usd != null && <Badge>Central de IAs: {usd(ai.central_usd)}</Badge>}
                {ai.tutor_usd != null && <Badge>Nexus: {usd(ai.tutor_usd)}</Badge>}
              </div>
            </>
          )}
        </Card>
      )}
      {isAdmin && data.users && (
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
/**
 * Preço digitado → centavos. Aceita "129,90", "129.90" (ponto com 1 ou 2 casas é decimal), "1.299,90" e "1.299" (ponto de milhar).
 * Vazio = sem preço (null); o que não dá para entender = NaN.
 */
function toCents(text) {
  const raw = String(text).replace(/R\$|\s/g, "");
  if (!raw) return null;
  let clean;
  if (raw.includes(",")) clean = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d+\.\d{1,2}$/.test(raw)) clean = raw;
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) clean = raw.replace(/\./g, "");
  else clean = raw;
  const value = /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : NaN;
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}
/** Prévia do preço que vai ser salvo ("R$ 129,90"), para o erro de digitação aparecer antes de salvar. */
const pricePreview = (cents) => (cents == null || Number.isNaN(cents) ? undefined : `Vai salvar: R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

// O banco já tem a regra "Oferecer teste grátis no cadastro vale de verdade" (migração 9732)? Três respostas possíveis:
//   "nova"        - o banco confirmou que a chave vale de verdade;
//   "antiga"      - o banco comprovadamente NÃO tem a regra (a função não existe, ou ela diz que não vale): comportamento de antes;
//   "desconhecida" - ainda conferindo, ou a pergunta falhou por outro motivo (rede, sessão): a tela NÃO afirma nenhum dos dois comportamentos.
const MISSING_FUNCTION = /could not find the function|schema cache|does not exist|PGRST202|42883/i;
function useSignupTrialRule() {
  const { backend } = useSession();
  const [rule, setRule] = React.useState("desconhecida");
  React.useEffect(() => {
    let alive = true;
    setRule("desconhecida");
    Promise.resolve()
      .then(() => backend.rpc("app_admin_signup_trial_rule"))
      .then((r) => alive && setRule(r?.applies === true ? "nova" : r && typeof r === "object" ? "antiga" : "desconhecida"))
      .catch((error) => alive && setRule(MISSING_FUNCTION.test(String(error?.message ?? error)) ? "antiga" : "desconhecida"));
    return () => {
      alive = false;
    };
  }, [backend]);
  return rule;
}

function PlanEditor({ plan, onSaved, signupRule = "desconhecida" }) {
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
          features: form.features.split("\n").map((x) => x.trim()).filter(Boolean),
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
          <Badge tone={plan.active ? "success" : "neutral"}>{plan.active ? (trial ? "Oferecido no cadastro" : "Marcado para venda") : trial && signupRule === "nova" ? "Cadastro sem teste" : trial && signupRule === "desconhecida" ? "Conferindo…" : "Fora de venda"}</Badge>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <TextField label="Nome exibido" value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
          {!trial && <TextField label="Preço (R$)" value={form.price} inputMode="decimal" placeholder="49,90" hint={pricePreview(toCents(form.price))} onChange={(e) => set({ price: e.target.value })} />}
          {!trial && <SelectField label="Cobrança" value={form.billing_period} onChange={(e) => set({ billing_period: e.target.value })} options={PERIODS} />}
        </div>
        <TextArea label="Descrição" rows={2} maxLength={400} value={form.description} onChange={(description) => set({ description })} />
        <TextArea label="Recursos incluídos (um por linha)" rows={4} value={form.features} onChange={(features) => set({ features })} hint="Até 20 itens. Aparecem para o aluno na tela de Planos." />
        <Switch label={trial ? "Oferecer teste grátis no cadastro" : "Marcar para venda"} description={trial ? (signupRule === "nova" ? "Ligado: quem se cadastrar ganha o teste grátis pelos dias de Configurações. Desligado: quem se cadastrar depois entra sem teste, só com questões e flashcards, até a equipe liberar um plano ou um teste em Usuários. Quem já está em teste não muda." : signupRule === "antiga" ? "Os dias de teste ficam em Configurações. Hoje todo cadastro novo recebe o teste, com esta chave ligada ou desligada." : "Os dias de teste ficam em Configurações. Conferindo como esta chave funciona hoje…") : "Só com preço definido. Por enquanto só marca o plano para quando a cobrança existir: não muda nada para o aluno."} checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
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

/**
 * Questões Inéditas por plano (migração …010300): quantas Questões Inéditas cada plano libera. Número inteiro, ou "todas".
 * O aluno vê o total existente ("20 de 74 liberadas no seu plano"); aqui o administrador troca os números. Teste grátis começa em 20.
 */
function IneditasLimits() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_ineditas_limits"), [backend]);
  const [form, setForm] = React.useState(null);
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  React.useEffect(() => {
    if (data) setForm(Object.fromEntries(data.plans.map((p) => [p.plan, { all: p.all, value: p.limit == null ? "" : String(p.limit) }])));
  }, [data]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!form) return <Loading />;
  const set = (plan, patch) => (setForm((f) => ({ ...f, [plan]: { ...f[plan], ...patch } })), setState((x) => ({ ...x, done: false, error: null })));
  const invalid = (plan) => !form[plan].all && !/^\d{1,6}$/.test(form[plan].value.trim());
  const anyInvalid = data.plans.some((p) => invalid(p.plan));
  const save = async (event) => {
    event.preventDefault();
    if (anyInvalid) return setState({ saving: false, error: "Informe um número inteiro (0 ou mais) em cada plano que não libera todas.", done: false });
    setState({ saving: true, error: null, done: false });
    try {
      const limits = Object.fromEntries(data.plans.map((p) => [p.plan, form[p.plan].all ? null : Number(form[p.plan].value)]));
      setData(await backend.rpc("app_admin_save_ineditas_limits", { p_limits: limits }));
      setState({ saving: false, error: null, done: true });
    } catch (err) {
      setState({ saving: false, error: messageOf(err), done: false });
    }
  };
  return (
    <Card>
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
        <div>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Questões Inéditas por plano</h3>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>
            Hoje existem <b>{data.published}</b> Questões Inéditas publicadas. Defina quantas cada plano libera. O aluno vê o total existente (por exemplo, “20 de {data.published} liberadas no seu plano”) e as demais ficam bloqueadas, com convite para conhecer os planos. Sem acesso (teste vencido ou sem plano) continua sem nenhuma. As questões oficiais do Inep não mudam.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
          {data.plans.map((p) => (
            <div key={p.plan} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 16, border: "1px solid var(--border-default)", background: "var(--surface-subtle)" }}>
              <b style={{ font: "var(--type-h5, var(--type-body-md))" }}>{PLAN_LABEL[p.plan] ?? p.plan}</b>
              <Switch label="Liberar todas" checked={form[p.plan].all} onChange={(e) => set(p.plan, { all: e.target.checked })} />
              {!form[p.plan].all && (
                <TextField
                  label="Quantas liberar"
                  value={form[p.plan].value}
                  inputMode="numeric"
                  maxLength={6}
                  error={invalid(p.plan) ? "Número inteiro, 0 ou mais" : undefined}
                  hint={invalid(p.plan) ? undefined : Number(form[p.plan].value) > data.published ? `Mais que as ${data.published} publicadas: libera todas as de hoje e as próximas.` : `${form[p.plan].value || 0} de ${data.published}`}
                  onChange={(e) => set(p.plan, { value: e.target.value.replace(/\D/g, "") })}
                />
              )}
              {p.plan === "trial" && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Padrão: 20. Vale para quem está no teste grátis em dia.</span>}
            </div>
          ))}
        </div>
        <p style={{ margin: 0, color: "var(--text-tertiary)", font: "var(--type-caption)" }}>
          Cada aluno recebe sempre o mesmo conjunto (as que ele já respondeu mais as primeiras da ordem dele). Subir o número só acrescenta; baixar nunca tira o que o aluno já respondeu. Equipe e revisor médico veem todas.
        </p>
        {state.error && <Banner tone="danger">{state.error}</Banner>}
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
          {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Limites salvos.</span>}
          <Button type="submit" loading={state.saving} disabled={anyInvalid}>
            Salvar limites
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function AdminPlans() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_plans"), [backend]);
  const signupRule = useSignupTrialRule();
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Banner tone="info" title="O que o aluno vê dos planos">
        O aluno tem uma tela de Planos só para informar: nome, descrição e recursos de cada plano, como você escreve aqui, e a situação dele. Ela não mostra preço e não tem botão de assinar: o preço fica guardado aqui para quando a cobrança existir, pela Stripe, numa próxima etapa. Até lá, libere planos manualmente em Usuários, com a data em “Plano pago até”. O que só o Elite tem (minutos de voz do Tutor e correção de estação com devolutiva) fica em Configurações, no bloco “Benefícios do plano Elite”, e só aparece na tela de planos depois que você preenche.
      </Banner>
      <IneditasLimits />
      {data.map((plan) => (
        <PlanEditor key={plan.code} plan={plan} onSaved={setData} signupRule={signupRule} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- estações
// Aprovar é revisão médica: revisor cadastrado na área da estação ou administrador, com o registro do que foi conferido
// (o banco confere tudo em app_admin_set_station_review, migração …8000). Voltar para revisão pede o motivo.
const MIN_NOTE = 10;
const pts = (n) => (n == null ? "—" : Number(n).toLocaleString("pt-BR"));

// Níveis do item do checklist (src/shared/checklistBank/types.ts: grades e criteria).
const LEVELS = [
  ["correct", "Adequado"],
  ["partial", "Parcial"],
  ["incorrect", "Inadequado"],
];

/** Critério e valor de cada nível do item: é o texto médico que o avaliador usa para dar a nota, e a aprovação vale para ele. */
function ItemCriteria({ item }) {
  return (
    <ul style={{ margin: "2px 0 0", paddingLeft: 18, color: "var(--text-secondary)" }}>
      {LEVELS.map(([key, label]) => {
        const points = item.grades?.[key];
        const text = typeof item.criteria?.[key] === "string" ? item.criteria[key].trim() : "";
        if (key === "partial" && points == null && !text) return null; // item de 2 níveis
        return (
          <li key={key}>
            <b>
              {label} ({pts(points)}):
            </b>{" "}
            {text || <span style={{ color: "var(--text-tertiary)" }}>sem critério escrito</span>}
          </li>
        );
      })}
    </ul>
  );
}

function ContentBlock({ title, children }) {
  return (
    <div>
      <div style={{ font: "var(--type-label)", marginBottom: 4 }}>{title}</div>
      <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{children}</div>
    </div>
  );
}

/** Conteúdo completo da estação, só para ler e conferir: tudo o que a aprovação cobre (checklist_station_contents). */
function StationContent({ content }) {
  if (!content) return <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Esta estação não tem roteiro, impressos nem checklist cadastrados.</p>;
  const pressings = Array.isArray(content.pressings) ? content.pressings : [];
  const items = (Array.isArray(content.checklist_items) ? content.checklist_items : []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const summary = Array.isArray(content.summary)
    ? content.summary.filter((t) => t && (t.topic || t.summary))
    : typeof content.summary === "string" && content.summary.trim()
      ? [{ topic: "", summary: content.summary }]
      : [];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {content.doctor_scene && <ContentBlock title="Cenário de atuação">{content.doctor_scene}</ContentBlock>}
      {content.doctor_tasks && <ContentBlock title="Tarefas do participante">{content.doctor_tasks}</ContentBlock>}
      {content.actor_script && <ContentBlock title="Roteiro do ator">{content.actor_script}</ContentBlock>}
      {pressings.length > 0 && (
        <div>
          <div style={{ font: "var(--type-label)", marginBottom: 4 }}>Impressos</div>
          {pressings.map((p, i) => (
            <div key={p.id ?? i} style={{ marginTop: 6, font: "var(--type-body-sm)" }}>
              <b>{p.name}</b>
              {p.content && <div style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{p.content}</div>}
              {p.image_url && <img src={p.image_url} alt={p.name ?? "Impresso"} loading="lazy" style={{ display: "block", maxWidth: "100%", marginTop: 6, borderRadius: 8 }} />}
            </div>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <div>
          <div style={{ font: "var(--type-label)", marginBottom: 4 }}>Checklist ({items.length} {items.length === 1 ? "item" : "itens"})</div>
          <ol style={{ margin: 0, paddingLeft: 20, font: "var(--type-body-sm)", display: "grid", gap: 6 }}>
            {items.map((it, i) => (
              <li key={it.id ?? i}>
                {it.phase && <span style={{ color: "var(--text-tertiary)" }}>{it.phase} · </span>}
                {it.content}
                <ItemCriteria item={it} />
                {Array.isArray(it.subitems) && it.subitems.length > 0 && (
                  <ul style={{ margin: "2px 0 0", paddingLeft: 18, color: "var(--text-secondary)" }}>
                    {it.subitems.map((sub, k) => <li key={sub.id ?? k}>{sub.text}</li>)}
                  </ul>
                )}
                {typeof it.tip === "string" && it.tip.trim() && (
                  <div style={{ marginTop: 2, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                    <b>Saiba mais:</b> {it.tip.trim()}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      {summary.length > 0 && (
        <div>
          <div style={{ font: "var(--type-label)", marginBottom: 4 }}>Resumo dos temas</div>
          {summary.map((t, i) => (
            <div key={i} style={{ marginTop: 6, font: "var(--type-body-sm)" }}>
              {t.topic && <b>{t.topic}</b>}
              {t.summary && <div style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{t.summary}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Resumo dos temas" que veio no conteúdo da estação (Montagem), como texto, para a equipe copiar ao rascunho. */
export function legacySummaryText(content) {
  const v = content?.summary;
  if (typeof v === "string") return v.trim();
  if (!Array.isArray(v)) return "";
  return v
    .map((t) => (typeof t === "string" ? t : [t?.topic ?? t?.title, t?.summary ?? t?.text].filter((x) => x && String(x).trim()).join("\n")))
    .filter((x) => x && x.trim())
    .join("\n\n")
    .trim();
}

const SUMMARY_MAX = 8000;
const SUMMARY_BADGE = { draft: ["warning", "Resumo em rascunho"], approved: ["success", "Resumo aprovado"] };

/**
 * "Resumo sobre o tema" da estação (D9; pedido do dono de 16/10): o texto que o avaliador lê em "Materiais" na sala do
 * Treino em Dupla. A equipe (ou o revisor médico) escreve o rascunho; só vai à sala depois de aprovado por revisor médico da
 * área ou administrador, com quem e quando. Texto novo volta a rascunho (o banco garante). O candidato nunca vê.
 * Conteúdo médico só da equipe: nada aqui é escrito por IA.
 * Ponto preparado e DESLIGADO para a Central de IAs: `suggestDraft` (função que devolve um texto). Sem ela, o botão
 * "Sugerir rascunho com a IA" não aparece; quando existir, a sugestão entra só no campo, como rascunho, e passa pela mesma
 * revisão médica (o banco já aceita a origem 'ia_sugestao' na tabela checklist_station_summaries).
 */
export function StationSummary({ station, legacy = "", onStatus, suggestDraft = null }) {
  const { backend } = useSession();
  const [data, setData] = React.useState(undefined);
  const [text, setText] = React.useState("");
  const [state, setState] = React.useState({ busy: false, error: null });
  const apply = React.useCallback(
    (res) => {
      setData(res ?? null);
      setText(res?.body ?? "");
      onStatus?.(res?.status ?? null);
    },
    [onStatus]
  );
  React.useEffect(() => {
    let alive = true;
    backend.rpc("app_admin_station_summary", { p_station_id: station.id }).then(
      (res) => alive && apply(res),
      (err) => alive && (setData(null), setState({ busy: false, error: messageOf(err) }))
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, station.id]);
  const run = async (fn, args) => {
    setState({ busy: true, error: null });
    try {
      apply(await backend.rpc(fn, { p_station_id: station.id, ...args }));
      setState({ busy: false, error: null });
    } catch (err) {
      setState({ busy: false, error: messageOf(err) });
    }
  };
  if (data === undefined && !state.error) return <Loading />;
  const status = data?.status ?? null;
  const saved = (data?.body ?? "").trim();
  const changed = text.trim() !== saved;
  const badge = SUMMARY_BADGE[status];
  const record =
    status === "approved"
      ? `Aprovado${data.approved_by ? ` por ${data.approved_by}` : ""} em ${dateTimeBR(data.approved_at)}.`
      : status === "draft"
        ? `Rascunho salvo${data.updated_by ? ` por ${data.updated_by}` : ""} em ${dateTimeBR(data.updated_at)}. Ainda não aparece na sala.`
        : null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ font: "var(--type-label)" }}>Resumo sobre o tema</div>
        <Badge size="sm" tone={badge ? badge[0] : undefined}>
          {badge ? badge[1] : "Sem resumo"}
        </Badge>
      </div>
      <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        Aparece ao avaliador em Materiais, na sala do Treino em Dupla, só depois de aprovado pela revisão médica. O candidato nunca vê. Se o texto mudar, volta a rascunho.
      </p>
      {record && <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{record}</div>}
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <TextArea label="Texto do resumo" value={text} rows={6} maxLength={SUMMARY_MAX} onChange={setText} hint="Até 8.000 caracteres. Parágrafos separados por uma linha em branco." />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button size="sm" variant="secondary" icon="save" disabled={!changed} loading={state.busy} onClick={() => run("app_admin_save_station_summary", { p_body: text })}>
          {text.trim() || !saved ? "Salvar rascunho" : "Apagar resumo"}
        </Button>
        {legacy && !text.trim() && (
          <Button size="sm" variant="ghost" icon="copy" onClick={() => setText(legacy)}>
            Copiar o Resumo dos temas para o rascunho
          </Button>
        )}
        {typeof suggestDraft === "function" && !text.trim() && (
          <Button size="sm" variant="ghost" icon="sparkles" onClick={async () => setText(String((await suggestDraft(station)) ?? ""))}>
            Sugerir rascunho com a IA
          </Button>
        )}
        {status === "draft" && !changed && data?.can_approve && (
          <Button size="sm" icon="check" loading={state.busy} onClick={() => run("app_admin_review_station_summary", { p_status: "approved" })}>
            Aprovar resumo
          </Button>
        )}
        {status === "approved" && !changed && (
          <Button size="sm" variant="ghost" icon="undo-2" loading={state.busy} onClick={() => run("app_admin_review_station_summary", { p_status: "draft" })}>
            Voltar a rascunho
          </Button>
        )}
      </div>
      {status === "draft" && !data?.can_approve && (
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>
          Só um revisor médico cadastrado em {station.area} ou um administrador aprova este resumo.
        </p>
      )}
    </div>
  );
}

function reviewRecord(s) {
  if (s.reviewed_at) {
    const what = s.medical_review === "approved" ? "Aprovada" : "Devolvida para revisão";
    return `${what}${s.reviewer ? ` por ${s.reviewer}` : ""} em ${dateTimeBR(s.reviewed_at)}${s.review_note ? `: “${s.review_note}”` : ""}`;
  }
  // aprovada antes do registro existir, ou por comando direto no banco (a trava da migração …8000 apaga o registro)
  if (s.medical_review === "approved") return "Aprovada sem registro de quem conferiu: vale conferir de novo.";
  return null;
}

function StationCard({ station: s, onSaved, folha, onFolha }) {
  const { backend } = useSession();
  const [open, setOpen] = React.useState(false);
  const [content, setContent] = React.useState({ loading: false, data: undefined, error: null });
  const [note, setNote] = React.useState("");
  const [state, setState] = React.useState({ busy: false, error: null });
  const approved = s.medical_review === "approved";
  const record = reviewRecord(s);
  const [summaryStatus, setSummaryStatus] = React.useState(s.summary_status ?? null);
  React.useEffect(() => setSummaryStatus(s.summary_status ?? null), [s.summary_status]);
  const summaryBadge = SUMMARY_BADGE[summaryStatus];

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || content.data !== undefined || content.loading) return;
    setContent({ loading: true, data: undefined, error: null });
    try {
      setContent({ loading: false, data: (await backend.rpc("app_admin_station_content", { p_station_id: s.id })) ?? null, error: null });
    } catch (err) {
      setContent({ loading: false, data: undefined, error: messageOf(err) });
    }
  };
  const decide = async (status) => {
    setState({ busy: true, error: null });
    try {
      onSaved(await backend.rpc("app_admin_set_station_review", { p_station_id: s.id, p_status: status, p_note: note.trim() }));
      setNote("");
      setState({ busy: false, error: null });
    } catch (err) {
      setState({ busy: false, error: messageOf(err) });
    }
  };
  const short = note.trim().length < MIN_NOTE;

  return (
    <Card>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Badge tone={approved ? "success" : "warning"} size="sm">
              {approved ? "Aprovada" : "Aguardando revisão médica"}
            </Badge>
            <Badge size="sm">{s.area}</Badge>
            {s.is_pro_only && (
              <Badge tone="pro" size="sm">
                Pro
              </Badge>
            )}
            {s.institution === "INEP" && <Badge size="sm">INEP</Badge>}
            {summaryBadge && (
              <Badge size="sm" tone={summaryBadge[0]}>
                {summaryBadge[1]}
              </Badge>
            )}
            <FolhaBadge situacao={folha} />
          </div>
          <div style={{ font: "600 16px var(--font-sans)", marginTop: 8 }}>{s.name}</div>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{s.topic}</div>
          {record && <div style={{ marginTop: 8, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{record}</div>}
          {s.reports > 0 && (
            <div style={{ marginTop: 10, font: "var(--type-body-sm)" }}>
              <b>
                {s.reports} {s.reports === 1 ? "relato de erro" : "relatos de erro"}
              </b>
              {s.reports > s.last_reports.length && <span style={{ color: "var(--text-tertiary)" }}> (mostrando os {s.last_reports.length} mais recentes)</span>}
              {s.last_reports.map((r) => (
                <div key={r.created_at} style={{ color: "var(--text-secondary)", marginTop: 4 }}>
                  “{r.message}” · {dateTimeBR(r.created_at)}
                </div>
              ))}
            </div>
          )}
        </div>
        <Button variant="secondary" size="sm" icon={open ? "chevron-up" : "chevron-down"} aria-expanded={open} onClick={toggle}>
          {open ? "Fechar" : "Conferir"}
        </Button>
      </div>

      {open && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-subtle)", display: "grid", gap: 16 }}>
          {content.loading && <Loading />}
          {content.error && <Banner tone="danger">{content.error}</Banner>}
          {content.data !== undefined && <StationContent content={content.data} />}
          <StationSummary station={s} legacy={legacySummaryText(content.data)} onStatus={setSummaryStatus} />
          <FolhaCandidato stationId={s.id} onSituacao={onFolha} />
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ font: "var(--type-label)" }}>Revisão médica</div>
            {state.error && <Banner tone="danger">{state.error}</Banner>}
            {approved ? (
              <>
                <TextArea label="Motivo para voltar à revisão" value={note} rows={2} maxLength={2000} onChange={setNote} hint="Pelo menos 10 caracteres. Fica registrado com seu nome e a data." />
                <div>
                  <Button variant="secondary" size="sm" icon="undo-2" disabled={short} loading={state.busy} onClick={() => decide("pending")}>
                    Voltar para revisão
                  </Button>
                </div>
              </>
            ) : s.can_review ? (
              <>
                <TextArea label="O que foi conferido (roteiro, impressos e checklist)" value={note} rows={2} maxLength={2000} onChange={setNote} hint="Pelo menos 10 caracteres. Fica registrado com seu nome e a data." />
                <div>
                  <Button size="sm" icon="check" disabled={short} loading={state.busy} onClick={() => decide("approved")}>
                    Aprovar
                  </Button>
                </div>
              </>
            ) : (
              <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>
                Só um revisor médico cadastrado em {s.area} ou um administrador aprova esta estação. O administrador cadastra os revisores em Central de Conteúdo › Configuração e custos.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export function AdminStations() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_stations"), [backend]);
  // situação da folha do candidato de cada estação (migração 013390); sem a função, os cartões ficam sem o selo
  const [folhas, setFolhas] = React.useState({});
  React.useEffect(() => {
    let vivo = true;
    Promise.resolve(backend.rpc("app_admin_dupla_folhas")).then(
      (m) => vivo && setFolhas(m && typeof m === "object" ? m : {}),
      () => undefined
    );
    return () => {
      vivo = false;
    };
  }, [backend]);
  const folhaDe = React.useCallback((id) => (situacao) => setFolhas((m) => ({ ...m, [id]: situacao })), []);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Banner tone="info" title="Telas de estações do aluno em construção">
        As telas de estações do aluno ainda estão em construção e continuam escondidas: por enquanto, só a equipe vê as estações, aprovadas ou não. Aprovar agora deixa a estação pronta para quando essas telas forem ligadas. Pelo mesmo motivo, os alunos ainda não conseguem relatar erro numa estação: os relatos só vão aparecer aqui depois que essas telas tiverem o botão de relatar.
      </Banner>
      <Banner tone="warning" title="Aprovação é revisão médica">
        Só aprova o revisor médico cadastrado na área da estação, ou um administrador, depois de conferir roteiro, impressos e checklist. O que foi conferido fica registrado com o nome de quem aprovou e a data.
      </Banner>
      {data.length === 0 && <EmptyState icon="clipboard-list" title="Nenhuma estação cadastrada" />}
      {data.map((s) => (
        <StationCard key={s.id} station={s} onSaved={setData} folha={folhas[s.id]} onFolha={folhaDe(s.id)} />
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

/**
 * Benefícios que só o plano Elite tem (PL04, migração …9731). SÓ A ESTRUTURA: o dono ainda não definiu os números. Vazio e desligado =
 * o Elite fica igual ao Pro e nada muda para ninguém.
 * TODO(dono): definir os minutos de voz do Tutor por dia do Elite e se a correção de estação com devolutiva entra no Elite.
 */
function EliteBenefits() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_plan_benefits"), [backend]);
  const [form, setForm] = React.useState(null);
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  React.useEffect(() => {
    if (data) setForm({ minutes: data.elite_voice_daily_minutes == null ? "" : String(data.elite_voice_daily_minutes), feedback: Boolean(data.elite_station_feedback) });
  }, [data]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!form) return <Loading />;
  const set = (patch) => (setForm((f) => ({ ...f, ...patch })), setState((x) => ({ ...x, done: false })));
  const save = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null, done: false });
    try {
      setData(await backend.rpc("app_admin_save_plan_benefits", { p_benefits: { elite_voice_daily_minutes: form.minutes.trim() || null, elite_station_feedback: form.feedback } }));
      setState({ saving: false, error: null, done: true });
    } catch (err) {
      setState({ saving: false, error: messageOf(err), done: false });
    }
  };
  const noMinutes = form.minutes.trim() === "";
  return (
    <Card>
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }} noValidate>
        <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Benefícios do plano Elite</h3>
        <p style={{ margin: 0, color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>
          Hoje o Pro e o Elite liberam o mesmo. Aqui você define o que só o Elite tem. Enquanto nada estiver preenchido, nada muda para ninguém: o Elite fica igual ao Pro. Só quem tem plano Elite pago e dentro da data vê estes benefícios.
        </p>
        <div style={{ maxWidth: 360 }}>
          <TextField
            label="Voz do Tutor por dia no Elite (minutos)"
            value={form.minutes}
            inputMode="numeric"
            maxLength={4}
            placeholder={`Igual ao Pro (${data.pro_voice_daily_minutes} min)`}
            onChange={(e) => set({ minutes: e.target.value })}
            hint={`Pro: ${data.pro_voice_daily_minutes} min por dia (muda no painel do Tutor, em “Voz por dia (plano pago, minutos)”). Vazio = igual ao Pro; o Elite nunca fica abaixo do Pro.`}
          />
        </div>
        {noMinutes && <Badge tone="warning">Pendente: definir os minutos de voz do Elite</Badge>}
        <Switch
          label="Correção de estação com devolutiva: só Elite"
          description="Desligado: ninguém recebe este benefício. As telas de estações do aluno ainda estão em construção; ligado, o aluno Elite passa a ver o benefício na Conta e a função fica pronta para essas telas."
          checked={form.feedback}
          onChange={(e) => set({ feedback: e.target.checked })}
        />
        {!form.feedback && <Badge tone="warning">Pendente: decidir se a correção de estação com devolutiva entra no Elite</Badge>}
        {state.error && <Banner tone="danger">{state.error}</Banner>}
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
          {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Benefícios do Elite salvos.</span>}
          <Button type="submit" loading={state.saving}>
            Salvar benefícios do Elite
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function AdminSettings() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_settings"), [backend]);
  const [form, setForm] = React.useState(null);
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  React.useEffect(() => {
    if (data) setForm({ trial_days: String(data.trial_days), simulado_ineditas_pct: String(data.simulado_ineditas_pct ?? 10), ...data.announcement });
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
          p_settings: { trial_days: form.trial_days.trim(), simulado_ineditas_pct: String(form.simulado_ineditas_pct).trim(), announcement: { active: form.active, tone: form.tone, title: form.title, text: form.text } },
        })
      );
      setState({ saving: false, error: null, done: true });
    } catch (err) {
      setState({ saving: false, error: messageOf(err), done: false });
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Simulados</h3>
          <div style={{ maxWidth: 260 }}>
            <TextField label="Questões Inéditas nos simulados (%)" value={form.simulado_ineditas_pct} inputMode="numeric" maxLength={2} onChange={(e) => set({ simulado_ineditas_pct: e.target.value })} hint="No máximo esta parte do simulado comum (Rápido, Geral, Por área, Por tema) vem de Questões Inéditas liberadas no plano do aluno. De 0 a 50; 0 desliga. O simulado TRI é sempre só de questões oficiais." />
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
    <EliteBenefits />
    </div>
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
/** Vozes que a lista conhece; qualquer outro nome salvo volta em "Outra" (digite o nome). */
const KNOWN_VOICES = VOICE_NAMES.map((v) => v.value).filter((v) => v && v !== "__outra");
const DURONA_LEVELS = [
  { value: "moderada", label: "Moderada" },
  { value: "forte", label: "Forte" },
  { value: "sem_filtro", label: "Sem filtro (padrão; ataque pessoal continua proibido)" },
];
const ENDED_LABEL = { student: "pelo aluno", timeout: "sem sinal", quota: "cota", replaced: "outro aparelho", error: "erro", session_closed: "sessão encerrada", session_limit: "limite da conversa", ativa: "ativas" };
/** Segundos do banco → minutos no campo ("" quando o teto ainda não tem valor). */
const secondsToMinutes = (seconds) => (seconds == null ? "" : String(Math.round((Number(seconds) / 60) * 100) / 100));
const positive = (x) => Number(String(x ?? "").replace(",", ".")) > 0;
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

/** Mesma mensagem da trava do banco (…9550_correcoes_acesso.sql): Tutor ligado exige "Planos pagos + teste grátis". */
const TUTOR_NEEDS_PLANS = "Para ligar o Tutor, ligue também “Planos pagos + teste grátis”. Sem isso, todo aluno usaria o Tutor de graça, com os limites do plano pago.";

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
        voice_choice: !data.voice_name ? "" : KNOWN_VOICES.includes(data.voice_name) ? data.voice_name : "__outra",
        voice_other: data.voice_name && !KNOWN_VOICES.includes(data.voice_name) ? data.voice_name : "",
        voice_session_max_min: String(Math.round((data.voice_session_max_seconds ?? 1800) / 60)),
        save_transcripts: data.save_transcripts ?? true,
        transcript_retention_days: String(data.transcript_retention_days ?? 180),
        emotion_engine: data.emotion_engine ?? true,
        inside_jokes: data.inside_jokes ?? true,
        durona_level: data.durona_level ?? "forte",
        pronunciations: pronText(data.pronunciations),
        tts_team_only: data.tts_team_only ?? true,
        tts_trial_daily_chars: String(data.tts_trial_daily_chars ?? 4500),
        tts_paid_daily_chars: String(data.tts_paid_daily_chars ?? 4500),
        tts_account_daily_chars: String(data.tts_account_daily_chars ?? 4500),
        tts_account_monthly_chars: String(data.tts_account_monthly_chars ?? 30000),
        tts_price_per_1k_chars_usd: String(data.tts_price_per_1k_chars_usd ?? 0),
        stt_price_per_min_usd: String(data.stt_price_per_min_usd ?? 0),
        stt_team_only: data.stt_team_only ?? true,
        question_hint_enabled: data.question_hint_enabled ?? false,
        stt_trial_daily_min: secondsToMinutes(data.stt_trial_daily_seconds),
        stt_paid_daily_min: secondsToMinutes(data.stt_paid_daily_seconds),
        stt_account_daily_min: secondsToMinutes(data.stt_account_daily_seconds),
        live_account_daily_min: secondsToMinutes(data.live_account_daily_seconds),
        live_account_daily_usd: data.live_account_daily_usd != null ? String(data.live_account_daily_usd) : "",
        live_account_monthly_usd: data.live_account_monthly_usd != null ? String(data.live_account_monthly_usd) : "",
        live_price_per_min_usd: data.live_price_per_min_usd != null ? String(data.live_price_per_min_usd) : "",
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
  // o banco recusa o Tutor ligado sem os planos pagos: avisa e trava o salvar antes
  const needsPlans = form.enabled && !form.requires_pro;
  // o banco também recusa (…9891): o microfone só abre aos alunos com os três tetos e o preço da transcrição; a voz do professor, com o preço da voz
  const micCapsFilled = [form.stt_trial_daily_min, form.stt_paid_daily_min, form.stt_account_daily_min].every(positive);
  // banco ainda sem a atualização do microfone (…9891 não colada): a tela diz isso em vez de fingir que guarda os tetos
  const micSupported = Object.prototype.hasOwnProperty.call(data, "stt_team_only");
  // banco ainda sem a coluna da dica (migração …10600 não colada): o interruptor fica travado em vez de fingir que guarda
  const hintSupported = Object.prototype.hasOwnProperty.call(data, "question_hint_enabled");
  // banco ainda sem a coluna dos tetos da plataforma da voz ao vivo (migração …012800 não colada)
  const liveCapsSupported = Object.prototype.hasOwnProperty.call(data, "live_account_monthly_usd");
  const needsMicCaps = micSupported && !form.stt_team_only && !(micCapsFilled && positive(form.stt_price_per_min_usd));
  const needsVoicePrice = !form.tts_team_only && data.tts_team_only !== false && !positive(form.tts_price_per_1k_chars_usd);
  const blocked = needsPlans || needsMicCaps || needsVoicePrice;
  const save = async (event) => {
    event.preventDefault();
    if (blocked) return;
    setState({ saving: true, error: null, done: false });
    try {
      const n = (x) => String(x ?? "").trim();
      const min = (x) => (n(x) === "" ? "" : String(Math.round(Number(n(x)) * 60)));
      const price = (x) => n(x).replace(",", ".");
      const isNumeric = (val) => {
        const s = String(val ?? "").trim().replace(",", ".");
        return s !== "" && !Number.isNaN(Number(s)) && Number.isFinite(Number(s));
      };
      const liveConfig = liveCapsSupported
        ? {
            ...(isNumeric(form.live_account_daily_min) ? { live_account_daily_seconds: min(price(form.live_account_daily_min)) } : {}),
            ...(isNumeric(form.live_account_daily_usd) ? { live_account_daily_usd: price(form.live_account_daily_usd) } : {}),
            ...(isNumeric(form.live_account_monthly_usd) ? { live_account_monthly_usd: price(form.live_account_monthly_usd) } : {}),
            ...(isNumeric(form.live_price_per_min_usd) ? { live_price_per_min_usd: price(form.live_price_per_min_usd) } : {}),
          }
        : {};
      const config = {
        enabled: form.enabled, requires_pro: form.requires_pro, max_profanity: form.max_profanity, voice_enabled: form.voice_enabled,
        daily_message_limit: n(form.daily_message_limit), trial_text_daily: n(form.trial_text_daily), trial_questions_daily: n(form.trial_questions_daily),
        trial_voice_daily_seconds: min(form.trial_voice_daily_min), trial_voice_total_seconds: min(form.trial_voice_total_min), paid_voice_daily_seconds: min(form.paid_voice_daily_min),
        voice_provider: form.voice_provider, voice_name: form.voice_choice === "__outra" ? n(form.voice_other).toLowerCase() : form.voice_choice,
        voice_session_max_seconds: min(form.voice_session_max_min), save_transcripts: form.save_transcripts, transcript_retention_days: n(form.transcript_retention_days),
        emotion_engine: form.emotion_engine, inside_jokes: form.inside_jokes, durona_level: form.durona_level, pronunciations: pronList(form.pronunciations),
        tts_team_only: form.tts_team_only, tts_trial_daily_chars: n(form.tts_trial_daily_chars), tts_paid_daily_chars: n(form.tts_paid_daily_chars),
        tts_account_daily_chars: n(form.tts_account_daily_chars), tts_account_monthly_chars: n(form.tts_account_monthly_chars),
        tts_price_per_1k_chars_usd: price(form.tts_price_per_1k_chars_usd), stt_price_per_min_usd: price(form.stt_price_per_min_usd),
        ...(hintSupported ? { question_hint_enabled: form.question_hint_enabled } : {}),
        ...(micSupported
          ? { stt_team_only: form.stt_team_only, stt_trial_daily_seconds: min(form.stt_trial_daily_min), stt_paid_daily_seconds: min(form.stt_paid_daily_min), stt_account_daily_seconds: min(form.stt_account_daily_min) }
          : {}),
        ...liveConfig,
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
              {server.realtime_voice ? `Voz em tempo real pronta no servidor (${server.realtime_model}).` : `Voz em tempo real não configurada: ${server.realtime_pending ?? "sem detalhe"} Sem ela, não há voz reserva: a Nexus usa a voz do professor ou o Chat.`}
            </Banner>
          )}
          <Switch label="Planos pagos + teste grátis" description="Ligado: quem não assina tem o teste grátis do Tutor (começa no primeiro uso) e depois vê o convite para assinar. Precisa ficar ligado para o Tutor ficar ligado." checked={form.requires_pro} onChange={(e) => set({ requires_pro: e.target.checked })} />
          {needsPlans && <Banner tone="warning">{TUTOR_NEEDS_PLANS}</Banner>}
          <Switch label="Conversa por voz" description="Desligada: só o Chat, por escrito (sem as vozes e sem o microfone)." checked={form.voice_enabled} onChange={(e) => set({ voice_enabled: e.target.checked })} />
          <Switch label="Dica do Tutor nas questões do treino" description="Dica do Tutor nas questões do treino (não revela a resposta; não aparece em simulados)." checked={form.question_hint_enabled} disabled={!hintSupported} onChange={(e) => set({ question_hint_enabled: e.target.checked })} />
          {!hintSupported && <Banner tone="warning">A dica do Tutor ainda não pode ser ligada por aqui: falta uma atualização do banco, que o Claude prepara para você colar.</Banner>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <TextField label="Interações de texto por dia (plano pago)" value={form.daily_message_limit} inputMode="numeric" maxLength={3} onChange={(e) => set({ daily_message_limit: e.target.value })} hint="De 1 a 500. É o teto de gasto por aluno." />
            <TextField label="Voz por dia (plano pago, minutos)" value={form.paid_voice_daily_min} inputMode="numeric" maxLength={4} onChange={(e) => set({ paid_voice_daily_min: e.target.value })} />
            <SelectField label="Palavrões (teto para a Durona)" value={form.max_profanity} onChange={(e) => set({ max_profanity: e.target.value })} options={PROFANITY_CAP} />
          </div>
          <div className="sm-overline">Voz do professor (Nexus)</div>
          <Switch label="Voz do professor só para a equipe" description="Ligado: só administrador e editor ouvem a voz do professor; alunos seguem na voz reserva." checked={form.tts_team_only} onChange={(e) => set({ tts_team_only: e.target.checked })} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <TextField label="Voz do professor por dia — teste grátis (caracteres)" value={form.tts_trial_daily_chars} inputMode="numeric" maxLength={6} onChange={(e) => set({ tts_trial_daily_chars: e.target.value })} hint="900 caracteres = 1 minuto de fala." />
            <TextField label="Voz do professor por dia — plano pago (caracteres)" value={form.tts_paid_daily_chars} inputMode="numeric" maxLength={6} onChange={(e) => set({ tts_paid_daily_chars: e.target.value })} hint="900 caracteres = 1 minuto de fala." />
            <TextField label="Teto da plataforma por dia (caracteres)" value={form.tts_account_daily_chars} inputMode="numeric" maxLength={8} onChange={(e) => set({ tts_account_daily_chars: e.target.value })} hint="900 caracteres = 1 minuto de fala." />
            <TextField label="Teto da plataforma por mês (caracteres)" value={form.tts_account_monthly_chars} inputMode="numeric" maxLength={9} onChange={(e) => set({ tts_account_monthly_chars: e.target.value })} hint="900 caracteres = 1 minuto de fala." />
            <TextField label="Preço da voz do professor (US$ por mil caracteres)" value={form.tts_price_per_1k_chars_usd} inputMode="decimal" maxLength={10} onChange={(e) => set({ tts_price_per_1k_chars_usd: e.target.value })} />
            <TextField label="Preço da transcrição (US$ por minuto)" value={form.stt_price_per_min_usd} inputMode="decimal" maxLength={10} onChange={(e) => set({ stt_price_per_min_usd: e.target.value })} />
          </div>
          {(!(Number(String(form.tts_price_per_1k_chars_usd).replace(",", ".")) > 0) || !(Number(String(form.stt_price_per_min_usd).replace(",", ".")) > 0)) && (
            <Banner tone="warning">Preço não preenchido: o custo da voz do professor e da transcrição fica zerado no registro de consumo.</Banner>
          )}
          {needsVoicePrice && <Banner tone="warning">Para liberar a voz do professor aos alunos, preencha antes o preço da voz (US$ por mil caracteres). Sem o preço, o gasto aparece como zero.</Banner>}
          <div className="sm-overline">Microfone e transcrição (fala do aluno)</div>
          {!micSupported && <Banner tone="warning">O microfone dos alunos continua só para a equipe e ainda não pode ser liberado: falta uma atualização do banco, que o Claude prepara para você colar.</Banner>}
          <Switch label="Microfone só para a equipe" description="Ligado: só administrador e editor falam ao microfone da Nexus; os alunos escrevem pelo Chat. Para desligar, preencha antes os três tetos diários abaixo e o preço da transcrição." checked={form.stt_team_only} disabled={!micSupported} onChange={(e) => set({ stt_team_only: e.target.checked })} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <TextField label="Microfone por dia — teste grátis (minutos por aluno)" value={form.stt_trial_daily_min} inputMode="decimal" maxLength={6} disabled={!micSupported} onChange={(e) => set({ stt_trial_daily_min: e.target.value })} hint="Vazio = ainda sem valor. De 1 segundo a 1.440 minutos." />
            <TextField label="Microfone por dia — plano pago (minutos por aluno)" value={form.stt_paid_daily_min} inputMode="decimal" maxLength={6} disabled={!micSupported} onChange={(e) => set({ stt_paid_daily_min: e.target.value })} hint="Vazio = ainda sem valor." />
            <TextField label="Teto da plataforma por dia (minutos, todos juntos)" value={form.stt_account_daily_min} inputMode="decimal" maxLength={6} disabled={!micSupported} onChange={(e) => set({ stt_account_daily_min: e.target.value })} hint="Vazio = ainda sem valor. A equipe também entra na soma." />
          </div>
          {micSupported && !micCapsFilled && <Badge tone="warning">Pendente: definir os tetos diários da transcrição antes de liberar o microfone aos alunos</Badge>}
          {needsMicCaps && <Banner tone="warning">Para liberar o microfone aos alunos, preencha antes o teto diário de transcrição (teste grátis, plano pago e a plataforma toda) e o preço da transcrição.</Banner>}
          <div className="sm-overline">Voz ao vivo: teto de gasto da plataforma</div>
          {!liveCapsSupported && (
            <Banner tone="warning">O teto de gasto da voz ainda não pode ser mudado por aqui: falta uma atualização do banco, que o Claude prepara para você colar.</Banner>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <TextField label="Minutos de voz ao vivo por dia (todos os alunos)" value={form.live_account_daily_min} inputMode="decimal" maxLength={6} disabled={!liveCapsSupported} onChange={(e) => set({ live_account_daily_min: e.target.value })} hint="Soma de todos os alunos no dia." />
            <TextField label="Teto de gasto por dia (US$)" value={form.live_account_daily_usd} inputMode="decimal" maxLength={8} disabled={!liveCapsSupported} onChange={(e) => set({ live_account_daily_usd: e.target.value })} hint="Custo real ou estimado do dia." />
            <TextField label="Teto de gasto por mês (US$)" value={form.live_account_monthly_usd} inputMode="decimal" maxLength={8} disabled={!liveCapsSupported} onChange={(e) => set({ live_account_monthly_usd: e.target.value })} hint="Quando o teto do mês chega, a voz fecha para todos e o chat continua." />
            <TextField label="Preço por minuto da voz ao vivo (US$)" value={form.live_price_per_min_usd} inputMode="decimal" maxLength={8} disabled={!liveCapsSupported} onChange={(e) => set({ live_price_per_min_usd: e.target.value })} hint="Usado enquanto a ponte ainda não relatou o custo real." />
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
              {reason.trim().length < 10 && (
                <p style={{ margin: "0 0 8px", font: "var(--type-caption)", color: "var(--text-secondary)" }}>
                  Para ligar ou desligar um professor, escreva primeiro o motivo da mudança (pelo menos 10 letras) no campo “Motivo da mudança”, mais abaixo.
                </p>
              )}
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
            <Button type="submit" loading={state.saving} disabled={reason.trim().length < 10 || blocked}>Salvar Tutor</Button>
          </div>
        </div>
      </Card>
    </form>
  );
}

// ---------------------------------------------------------------- registro
// Nome de cada ação, resumo e quem fez: auditLog.js (em português, sem códigos internos).
const AUDIT_PAGE = 50;
const NO_FILTERS = { action: "", person: "", from: "", to: "" };

export function AdminAudit() {
  const { backend } = useSession();
  const mobile = useMobile();
  const [filters, setFilters] = React.useState(NO_FILTERS);
  const [page, setPage] = React.useState(0);
  const person = useDebounced(filters.person.trim());
  const set = (patch) => (setFilters((f) => ({ ...f, ...patch })), setPage(0));
  const filtering = Boolean(filters.action || filters.person.trim() || filters.from || filters.to);
  const { data, error, loading, reload } = useLoad(
    () => backend.rpc("app_admin_audit_page", { p_filters: { action: filters.action, person, from: filters.from, to: filters.to }, p_limit: AUDIT_PAGE, p_offset: page * AUDIT_PAGE }),
    [backend, filters.action, person, filters.from, filters.to, page]
  );
  if (error && !data) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const pages = Math.max(1, Math.ceil(data.total / AUDIT_PAGE));
  // tipos de ação que existem, com o nome em português (o escolhido continua na lista mesmo se não houver mais nenhum)
  const types = [...new Set([...(data.actions ?? []), ...(filters.action ? [filters.action] : [])])]
    .map((action) => ({ value: action, label: auditLabel({ action, details: {} }) }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  if (!filtering && data.total === 0) return <EmptyState icon="history" title="Nenhuma ação registrada" description="Toda alteração feita na administração e na Central de Conteúdo aparece aqui, com quem fez e quando." />;
  const first = page * AUDIT_PAGE + 1;
  const last = page * AUDIT_PAGE + data.items.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1.4fr) minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr)", gap: 12, alignItems: "end" }}>
          <SelectField label="Tipo de ação" value={filters.action} onChange={(e) => set({ action: e.target.value })} options={[{ value: "", label: "Todos os tipos" }, ...types]} />
          <TextField label="Pessoa" icon="search" placeholder="E-mail de quem fez ou de quem foi afetado" value={filters.person} onChange={(e) => set({ person: e.target.value })} />
          <TextField label="De" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
          <TextField label="Até" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </div>
        {filtering && (
          <div style={{ marginTop: 12 }}>
            <Button variant="ghost" size="sm" icon="x" onClick={() => (setFilters(NO_FILTERS), setPage(0))}>Limpar filtros</Button>
          </div>
        )}
      </Card>
      {error && <LoadError error={error} retry={reload} />}
      {data.items.length > 0 && (
        <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }} aria-live="polite">
          {`Mostrando ${first} a ${last} de ${data.total} ${data.total === 1 ? "ação" : "ações"}`}
          {filtering ? " com esses filtros" : ""}
        </div>
      )}
      {data.items.length === 0 ? (
        <EmptyState icon="search" title="Nenhuma ação com esses filtros" description="Ajuste o tipo, a pessoa ou as datas." />
      ) : (
        <Card padding={8} role="list" aria-label="Ações registradas">
          {data.items.map((entry, index) => (
            <div key={entry.key ?? entry.id} role="listitem" style={{ display: "flex", gap: 12, padding: "12px 16px", borderTop: index ? "1px solid var(--border-subtle)" : 0, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ font: "600 14px var(--font-sans)" }}>{auditLabel(entry)}</span>
                  {entry.source === "central" && <Badge size="sm">Central de Conteúdo</Badge>}
                </div>
                <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>{auditSummary(entry)}</div>
              </div>
              <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", textAlign: "right" }}>
                {dateTimeBR(entry.created_at)}
                <br />
                {auditActor(entry)}
              </div>
            </div>
          ))}
        </Card>
      )}
      {pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Button variant="secondary" size="sm" icon="chevron-left" disabled={page === 0 || loading} onClick={() => setPage((n) => Math.max(0, n - 1))}>Anterior</Button>
          <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Página {page + 1} de {pages}</span>
          <Button variant="secondary" size="sm" iconRight="chevron-right" disabled={page >= pages - 1 || loading} onClick={() => setPage((n) => n + 1)}>Próxima</Button>
        </div>
      )}
    </div>
  );
}
