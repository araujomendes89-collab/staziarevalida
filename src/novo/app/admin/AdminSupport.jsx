// Administração > Configurações: o contato de suporte (uma configuração só) e a lista "Relatos dos alunos".
// Funções do banco: supabase/migrations/…9835_suporte_e_relatos.sql.
import React from "react";
import { Badge, Banner, Button, Card, EmptyState, SegmentedControl, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { DEFAULT_SUPPORT_EMAIL } from "../support/supportContact.jsx";
import { dateTimeBR, LoadError, Loading, messageOf, useLoad } from "./common.jsx";

/** O banco ainda não tem a atualização (função inexistente): diz isso em português, sem termo técnico. */
const missingInDb = (error) => /Could not find the function|PGRST202|does not exist|schema cache/i.test(String(error?.message ?? ""));
const NOT_ACTIVE = "Ainda não está ativo: falta uma atualização do banco, que o Claude prepara para você colar.";

// ---------------------------------------------------------------- contato de suporte
export function AdminSupportContact() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_support_contact"), [backend]);
  const [email, setEmail] = React.useState(null);
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  React.useEffect(() => {
    if (data) setEmail(data.email ?? DEFAULT_SUPPORT_EMAIL);
  }, [data]);
  if (error && missingInDb(error)) {
    return (
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Contato de suporte</h3>
          <Banner tone="warning">{NOT_ACTIVE} Enquanto isso, os alunos veem {DEFAULT_SUPPORT_EMAIL}.</Banner>
        </div>
      </Card>
    );
  }
  if (error) return <LoadError error={error} retry={reload} />;
  if (email === null) return <Loading />;
  const save = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null, done: false });
    try {
      setData(await backend.rpc("app_admin_save_support_contact", { p_email: email }));
      setState({ saving: false, error: null, done: true });
    } catch (err) {
      setState({ saving: false, error: messageOf(err), done: false });
    }
  };
  return (
    <Card>
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }} noValidate>
        <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Contato de suporte</h3>
        <div style={{ maxWidth: 420 }}>
          <TextField
            label="E-mail de suporte"
            type="email"
            value={email}
            maxLength={120}
            onChange={(e) => (setEmail(e.target.value), setState((s) => ({ ...s, done: false })))}
            hint={`Aparece para os alunos no login, na Conta (Ajuda e suporte) e nos avisos de acesso bloqueado. Se ficar em branco, vale ${DEFAULT_SUPPORT_EMAIL}.`}
          />
        </div>
        {state.error && <Banner tone="danger">{state.error}</Banner>}
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
          {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Contato de suporte salvo.</span>}
          <Button type="submit" loading={state.saving}>
            Salvar contato
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------- relatos dos alunos
const FILTERS = [
  { value: "open", label: "Abertos" },
  { value: "resolved", label: "Resolvidos" },
  { value: "all", label: "Todos" },
];
const PAGE = 50;

function ReportRow({ item, busy, onToggle }) {
  const resolved = item.status === "resolved";
  return (
    <div role="listitem" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        <strong style={{ color: "var(--text-primary)" }}>{item.student_name || "Aluno sem nome"}</strong>
        {item.student_email && <span style={{ overflowWrap: "anywhere" }}>{item.student_email}</span>}
        <span>· {dateTimeBR(item.created_at)}</span>
        {item.screen && <Badge size="sm">{item.screen}</Badge>}
        {resolved && (
          <Badge size="sm" tone="success">
            Resolvido{item.resolved_by_name ? ` por ${item.resolved_by_name}` : ""} em {dateTimeBR(item.resolved_at)}
          </Badge>
        )}
      </div>
      <p style={{ margin: 0, font: "var(--type-body)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.message}</p>
      <div>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => onToggle(item)}>
          {resolved ? "Reabrir" : "Marcar como resolvido"}
        </Button>
      </div>
    </div>
  );
}

export function AdminReports() {
  const { backend } = useSession();
  const [status, setStatus] = React.useState("open");
  const [limit, setLimit] = React.useState(PAGE);
  const [busyId, setBusyId] = React.useState(null);
  const [actionError, setActionError] = React.useState(null);
  const { data, error, loading, reload } = useLoad(() => backend.rpc("app_admin_reports", { p_status: status, p_limit: limit, p_offset: 0 }), [backend, status, limit]);

  const toggle = async (item) => {
    setBusyId(item.id);
    setActionError(null);
    try {
      await backend.rpc("app_admin_report_resolve", { p_id: item.id, p_resolved: item.status !== "resolved" });
      reload();
    } catch (err) {
      setActionError(messageOf(err));
    }
    setBusyId(null);
  };

  if (error && !data) {
    return (
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Relatos dos alunos</h3>
          {missingInDb(error) ? <Banner tone="warning">{NOT_ACTIVE}</Banner> : <LoadError error={error} retry={reload} />}
        </div>
      </Card>
    );
  }
  const items = data?.items ?? [];
  return (
    <Card padding={0}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Relatos dos alunos</h3>
            {data && data.open > 0 && (
              <Badge tone="warning" size="sm">
                {data.open} {data.open === 1 ? "aberto" : "abertos"}
              </Badge>
            )}
          </div>
          <SegmentedControl label="Mostrar relatos" value={status} onChange={(v) => (setStatus(v), setLimit(PAGE))} options={FILTERS} />
        </div>
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Mensagens enviadas pelos alunos em Conta &gt; Ajuda e suporte &gt; Relatar um problema.</p>
        {actionError && <Banner tone="danger">{actionError}</Banner>}
        {error && <LoadError error={error} retry={reload} />}
      </div>
      {!data || (loading && items.length === 0) ? (
        <div style={{ padding: "0 20px 20px" }}>
          <Loading />
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: "0 20px 20px" }}>
          <EmptyState icon="inbox" title={status === "resolved" ? "Nenhum relato resolvido ainda" : status === "open" ? "Nenhum relato aberto" : "Nenhum relato recebido"} description="Quando um aluno relatar um problema, ele aparece aqui, com a data, o aluno, a tela e o texto." />
        </div>
      ) : (
        <div role="list" aria-label="Relatos dos alunos">
          {items.map((item) => (
            <ReportRow key={item.id} item={item} busy={busyId === item.id} onToggle={toggle} />
          ))}
          {data.total > items.length && (
            <div style={{ padding: 16, borderTop: "1px solid var(--border-subtle)", textAlign: "center" }}>
              <Button variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>
                Mostrar mais ({data.total - items.length} {data.total - items.length === 1 ? "restante" : "restantes"})
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
