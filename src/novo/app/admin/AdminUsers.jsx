// Gestão de usuários: lista, busca, papel, plano e exclusão.
import React from "react";
import { Avatar, Badge, Banner, Button, Card, EmptyState, Icon, SegmentedControl, SelectField, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { PlanoPorFaseUsuario } from "./planos/PlanoPorFaseUsuario.jsx";
import { PagamentosAluno } from "./planos/PagamentosAluno.jsx";
import { percent } from "../practice/format.js";
import { AREA_LABEL } from "./content/labels.js";
import {
  dateBR,
  dateTimeBR,
  fromDateInput,
  isStaffRole,
  ListRow,
  LoadError,
  Loading,
  messageOf,
  paidPlanLapsed,
  PLAN_LABEL,
  ROLE_LABEL,
  SUB_STATUS_LABEL,
  toDateInput,
  trialLapsed,
  useDebounced,
  useLoad,
} from "./common.jsx";

const PAGE = 50;
const NO_MORE = { items: [], fetched: 0, total: null, done: false, loading: false, error: null };
const roleTone = { admin: "danger", editor: "info", student: "neutral" };
/**
 * Plano como aparece: a equipe tem acesso pelo papel (sem teste); os outros, pela assinatura. Plano pago depois de
 * "Plano pago até" (ou sem essa data) já não dá acesso: aparece como vencido.
 */
const planText = (u) => {
  if (isStaffRole(u.role)) return "Equipe · acesso completo";
  // cadastro feito com "Oferecer teste grátis no cadastro" desligado (PL06): sem teste e sem plano pago
  if (u.plan === "trial" && u.status === "expired" && !u.trial_ends_at) return "Acesso gratuito · sem teste";
  const text = `${PLAN_LABEL[u.plan] ?? u.plan} · ${SUB_STATUS_LABEL[u.status] ?? u.status}`;
  if (trialLapsed(u)) return `${text} · terminou em ${dateBR(u.trial_ends_at)}`;
  if (!paidPlanLapsed(u)) return text;
  return u.current_period_end ? `${text} · venceu em ${dateBR(u.current_period_end)}` : `${text} · sem data de fim`;
};
const planTone = (u) => (isStaffRole(u.role) ? "success" : paidPlanLapsed(u) || trialLapsed(u) ? "warning" : u.status === "active" ? "success" : u.status === "trialing" ? "pro" : "neutral");
/** Áreas em que a pessoa é revisora médica (a Central de Conteúdo guarda os códigos; aqui vão em português). Vazio = não é revisora. */
const reviewerAreas = (u) => (u.reviewer_areas ?? []).map((code) => AREA_LABEL[code] ?? code);
/**
 * Combinação de plano e situação que o banco aceita mas não dá acesso Pro. O acesso Pro vem de Pro/Elite com situação
 * Ativo ou Pagamento pendente (has_pro e tutor_entitlement, migração 20261003004600); o resto salva sem efeito.
 */
const planWarning = (plan, status) => {
  if ((plan === "pro" || plan === "elite") && status === "trialing") return "Pro e Elite só dão acesso com a situação Ativo (ou Pagamento pendente). Com Em teste, a pessoa fica sem acesso Pro. Para liberar, escolha Ativo; para só estender o teste, escolha Teste grátis.";
  if (plan === "trial" && (status === "active" || status === "past_due")) return "Teste grátis não dá acesso Pro, mesmo com a situação Ativo. Para liberar acesso de cortesia, escolha Pro ou Elite com situação Ativo.";
  return null;
};

function Fact({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{label}</div>
      <div style={{ font: "600 15px var(--font-sans)", marginTop: 2, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

function RoleForm({ user, onSaved }) {
  const { backend, user: me } = useSession();
  const [role, setRole] = React.useState(user.role);
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  const save = async () => {
    // Administrador tem acesso a tudo (usuários, planos, configurações): não se promove por engano.
    if (role === "admin" && user.role !== "admin" && !window.confirm(`Tornar ${user.name || user.email} Administrador? Essa pessoa passa a ter acesso a tudo, inclusive usuários, planos e configurações.`)) return;
    setState({ saving: true, error: null, done: false });
    try {
      onSaved(await backend.rpc("app_admin_set_role", { p_user_id: user.id, p_role: role }));
      setState({ saving: false, error: null, done: true });
    } catch (error) {
      setState({ saving: false, error: messageOf(error), done: false });
    }
  };
  const self = user.id === me?.id;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="sm-field__label">Papel</div>
      <div style={{ overflowX: "auto" }}>
        <SegmentedControl
          label="Papel"
          value={role}
          onChange={(value) => (setRole(value), setState((s) => ({ ...s, done: false })))}
          options={[
            { value: "student", label: "Aluno" },
            { value: "editor", label: "Editor" },
            { value: "admin", label: "Administrador" },
          ]}
        />
      </div>
      <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        Editor cuida do conteúdo: Visão geral, Questões, Aulas, Podcasts, Atualizações, Estações e Central de Conteúdo (publicar atualizações e podcasts é do Administrador). Administrador tem acesso a tudo, inclusive usuários, planos e configurações.
        {self && " Você não pode tirar o próprio acesso de administrador."}
      </div>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
        {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Papel salvo.</span>}
        <Button size="sm" onClick={save} loading={state.saving} disabled={role === user.role}>
          Salvar papel
        </Button>
      </div>
    </div>
  );
}

function PlanForm({ user, onSaved }) {
  const { backend } = useSession();
  const [form, setForm] = React.useState({
    plan: user.plan ?? "trial",
    status: user.status ?? "trialing",
    trial: toDateInput(user.trial_ends_at),
    period: toDateInput(user.current_period_end),
  });
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  const set = (patch) => (setForm((f) => ({ ...f, ...patch })), setState((s) => ({ ...s, done: false })));
  const warning = isStaffRole(user.role) ? null : planWarning(form.plan, form.status);
  const save = async () => {
    if (warning && !window.confirm(`${warning}\n\nSalvar mesmo assim?`)) return;
    setState({ saving: true, error: null, done: false });
    try {
      onSaved(
        await backend.rpc("app_admin_set_subscription", {
          p_user_id: user.id,
          p_plan: form.plan,
          p_status: form.status,
          p_trial_ends_at: fromDateInput(form.trial),
          p_current_period_end: fromDateInput(form.period),
        })
      );
      setState({ saving: false, error: null, done: true });
    } catch (error) {
      setState({ saving: false, error: messageOf(error), done: false });
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="sm-field__label">Plano</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <SelectField label="Plano" value={form.plan} onChange={(e) => set({ plan: e.target.value })} options={Object.entries(PLAN_LABEL).map(([value, label]) => ({ value, label }))} />
        <SelectField label="Situação" value={form.status} onChange={(e) => set({ status: e.target.value })} options={Object.entries(SUB_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
        <TextField label="Teste grátis até" type="date" value={form.trial} onChange={(e) => set({ trial: e.target.value })} />
        <TextField label="Plano pago até" type="date" value={form.period} onChange={(e) => set({ period: e.target.value })} />
      </div>
      <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        {isStaffRole(user.role)
          ? "Administrador e editor têm acesso completo pelo papel, sem período de teste. Este plano só passa a valer se a pessoa sair da equipe."
          : "Para liberar acesso de cortesia, escolha Pro ou Elite com situação Ativo e informe até quando vai em “Plano pago até”. Depois dessa data o acesso pago acaba sozinho; com pagamento pendente, ele continua por até 3 dias. A cobrança automática ainda não está ligada."}
      </div>
      {warning && <Banner tone="warning">{warning}</Banner>}
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
        {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Plano salvo.</span>}
        <Button size="sm" onClick={save} loading={state.saving}>
          Salvar plano
        </Button>
      </div>
    </div>
  );
}

function DeleteUser({ user, onDeleted }) {
  const { backend, user: me } = useSession();
  const [confirm, setConfirm] = React.useState("");
  const [state, setState] = React.useState({ deleting: false, error: null });
  if (user.id === me?.id) return null;
  const remove = async () => {
    setState({ deleting: true, error: null });
    try {
      await backend.rpc("app_admin_delete_user", { p_user_id: user.id, p_confirm_email: confirm });
      onDeleted();
    } catch (error) {
      setState({ deleting: false, error: messageOf(error) });
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: 16, border: "1px solid var(--danger-border)", background: "var(--danger-bg)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--type-label)", color: "var(--danger-text)" }}>
        <Icon name="triangle-alert" size={18} /> Excluir usuário
      </div>
      <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        Apaga a conta e todo o histórico dessa pessoa. Não dá para desfazer. Quem já aprovou ou publicou conteúdo na Central de Conteúdo, ou conferiu atualizações de questões, não pode ser excluído, porque esse registro precisa ficar: nesse caso, mude o papel para Aluno e o plano para Expirado.
      </div>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px" }}>
          <TextField label={`Digite ${user.email} para confirmar`} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </div>
        <Button variant="danger" icon="trash-2" onClick={remove} loading={state.deleting} disabled={confirm.trim().toLowerCase() !== String(user.email).toLowerCase()}>
          Excluir usuário
        </Button>
      </div>
    </div>
  );
}

function UserDetail({ id, onBack, onChanged }) {
  const { backend } = useSession();
  const { data: user, error, reload, setData } = useLoad(() => backend.rpc("app_admin_user", { p_user_id: id }), [backend, id]);
  const saved = (row) => {
    setData({ ...user, ...row });
    onChanged();
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={onBack}>
          Voltar à lista
        </Button>
      </div>
      {error && <LoadError error={error} retry={reload} />}
      {!user && !error && <Loading />}
      {user && (
        <>
          <Card>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <Avatar name={user.name || user.email} size={56} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: 0, font: "var(--type-h3)" }}>{user.name || "Sem nome"}</h2>
                <div style={{ color: "var(--text-secondary)", font: "var(--type-body-sm)", overflowWrap: "anywhere" }}>{user.email}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <Badge tone={roleTone[user.role]} size="sm">
                    {ROLE_LABEL[user.role]}
                  </Badge>
                  {reviewerAreas(user).length > 0 && (
                    <Badge tone="brand" size="sm">
                      Revisor médico
                    </Badge>
                  )}
                  <Badge tone="pro" size="sm">
                    {planText(user)}
                  </Badge>
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16, marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
              <Fact label="Cadastro" value={dateBR(user.created_at)} />
              <Fact label="Última atividade" value={dateTimeBR(user.last_activity)} />
              <Fact label="Respostas" value={user.answered ? `${user.answered} · ${percent(user.correct, user.answered)}% de acerto` : "0"} />
              <Fact label="Treinos e simulados" value={`${user.sessions} · ${user.simulados} simulados`} />
              <Fact label="Flashcards" value={`${user.flashcards} criados · ${user.flashcard_reviews} revisões`} />
              <Fact label="Erros para revisar" value={user.pending_errors} />
              <Fact label="Meta" value={user.target_edition ? `${user.exam_type === "ENAMED" ? "ENAMED" : "Revalida"} ${user.target_edition}` : "—"} />
              <Fact label="Teste grátis até" value={isStaffRole(user.role) ? "Não se aplica (equipe)" : dateBR(user.trial_ends_at)} />
              {reviewerAreas(user).length > 0 && <Fact label="Áreas de revisão médica" value={reviewerAreas(user).join(", ")} />}
            </div>
            {reviewerAreas(user).length > 0 && (
              <div style={{ marginTop: 12, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
                Revisor médico é um acesso à parte do papel acima. As áreas se mudam em Central de Conteúdo › Configurações.
              </div>
            )}
          </Card>
          <Card>
            <RoleForm key={`r-${user.id}`} user={user} onSaved={saved} />
          </Card>
          <Card>
            <PlanForm key={`p-${user.id}`} user={user} onSaved={saved} />
          </Card>
          {!isStaffRole(user.role) && user.email && <PlanoPorFaseUsuario email={user.email} />}
          {!isStaffRole(user.role) && <PagamentosAluno userId={user.id} />}
          <DeleteUser
            user={user}
            onDeleted={() => {
              onChanged();
              onBack();
            }}
          />
        </>
      )}
    </div>
  );
}

export function AdminUsers() {
  const { backend } = useSession();
  const mobile = useMobile();
  const [search, setSearch] = React.useState("");
  const [role, setRole] = React.useState("");
  const [plan, setPlan] = React.useState("");
  const [selected, setSelected] = React.useState(null);
  const query = useDebounced(search.trim());
  // Primeira página; as seguintes vêm de "Carregar mais", pedidas com o deslocamento (o banco devolve no máximo 200 por pedido).
  const list = useLoad(() => backend.rpc("app_admin_users", { p_search: query, p_role: role, p_plan: plan, p_limit: PAGE, p_offset: 0 }), [backend, query, role, plan]);
  const [more, setMore] = React.useState(NO_MORE);
  const generation = React.useRef(0);
  React.useEffect(() => {
    generation.current += 1;
    setMore(NO_MORE);
  }, [list.data, query, role, plan]);
  const loadMore = async () => {
    const mine = generation.current;
    setMore((m) => ({ ...m, loading: true, error: null }));
    try {
      const page = await backend.rpc("app_admin_users", { p_search: query, p_role: role, p_plan: plan, p_limit: PAGE, p_offset: list.data.items.length + more.fetched });
      if (mine !== generation.current) return;
      setMore((m) => ({ items: [...m.items, ...page.items], fetched: m.fetched + page.items.length, total: page.total, done: page.items.length === 0, loading: false, error: null }));
    } catch (error) {
      if (mine === generation.current) setMore((m) => ({ ...m, loading: false, error }));
    }
  };
  // Sem repetir ninguém em nenhuma das páginas somadas (cadastro novo no meio ou empate de ordem podem trazer a mesma pessoa de novo).
  const items = [];
  const seen = new Set();
  for (const u of list.data ? [...list.data.items, ...more.items] : []) if (!seen.has(u.id)) (seen.add(u.id), items.push(u));
  const total = more.total ?? list.data?.total ?? 0;

  if (selected) return <UserDetail id={selected} onBack={() => setSelected(null)} onChanged={list.reload} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,2fr) 1fr 1fr", gap: 12 }}>
          <TextField label="Buscar" icon="search" placeholder="Nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
          <SelectField label="Papel" value={role} onChange={(e) => setRole(e.target.value)} options={[{ value: "", label: "Todos" }, ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))]} />
          <SelectField label="Plano" value={plan} onChange={(e) => setPlan(e.target.value)} options={[{ value: "", label: "Todos" }, ...Object.entries(PLAN_LABEL).map(([value, label]) => ({ value, label }))]} />
        </div>
      </Card>
      {list.error && <LoadError error={list.error} retry={list.reload} />}
      {!list.data && !list.error && <Loading />}
      {list.data && (
        <>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }} aria-live="polite">
            {total} {total === 1 ? "usuário" : "usuários"}
          </div>
          {items.length === 0 ? (
            <EmptyState icon="users" title="Nenhum usuário encontrado" description="Ajuste a busca ou os filtros." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((u) => (
                <ListRow key={u.id} onClick={() => setSelected(u.id)} label={`Abrir ${u.name || u.email}`}>
                  <Avatar name={u.name || u.email} size={40} />
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ font: "600 15px var(--font-sans)", color: "var(--text-primary)" }}>{u.name || "Sem nome"}</span>
                      {u.role !== "student" && (
                        <Badge tone={roleTone[u.role]} size="sm">
                          {ROLE_LABEL[u.role]}
                        </Badge>
                      )}
                      {reviewerAreas(u).length > 0 && (
                        <Badge tone="brand" size="sm">
                          Revisor médico
                        </Badge>
                      )}
                      <Badge tone={planTone(u)} size="sm">
                        {planText(u)}
                      </Badge>
                    </div>
                    <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>{u.email}</span>
                    {reviewerAreas(u).length > 0 && <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>Revisa: {reviewerAreas(u).join(", ")}</span>}
                    <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                      Cadastro {dateBR(u.created_at)} · {u.answered} respostas · última atividade {u.last_activity ? dateBR(u.last_activity) : "—"}
                    </span>
                  </div>
                  <Icon name="chevron-right" size={18} style={{ color: "var(--text-tertiary)", flex: "none", alignSelf: "center" }} />
                </ListRow>
              ))}
            </div>
          )}
          {more.error && <LoadError error={more.error} retry={loadMore} />}
          {items.length < total && !more.done && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Button variant="secondary" onClick={loadMore} loading={list.loading || more.loading}>
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
