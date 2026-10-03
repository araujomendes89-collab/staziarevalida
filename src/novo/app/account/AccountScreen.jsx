// Conta com dados do banco (perfil do app_bootstrap, app_update_profile, app_export_my_data,
// app_delete_my_account). Mesma marcação da ProfileScreen do kit (prototype/OtherScreens.jsx).
// Os interruptores de lembrete e de alertas do protótipo saíram: o produto ainda não envia
// notificações.
import React from "react";
import { Avatar, Badge, Banner, Button, Card, Icon, SectionHeader, SegmentedControl, SelectField, TextField } from "../../ds";
import { isStaffRole } from "../admin/AdminScreen.jsx";
import { PASSWORD_MIN_LENGTH } from "../../data";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";

const SECTIONS = [
  { id: "conta", label: "Minha conta", sub: "Nome, e-mail e aparência", icon: "user" },
  { id: "estudo", label: "Estudo e prova", sub: "Fase, prova-alvo e rotina", icon: "graduation-cap" },
  { id: "seg", label: "Segurança", sub: "Senha e sessão", icon: "shield-check" },
  { id: "priv", label: "Privacidade e dados", sub: "Exportação e exclusão (LGPD)", icon: "file-lock" },
];
const THEMES = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Do sistema" },
];
const MINUTES = [
  { value: "", label: "Não definido" },
  { value: "30", label: "30 min por dia" },
  { value: "60", label: "1 h por dia" },
  { value: "120", label: "2 h por dia" },
  { value: "180", label: "3 h ou mais por dia" },
];
const PLAN_LABEL = { trial: "Teste grátis", pro: "Plano Pro", elite: "Plano Elite" };

const dateBR = (iso) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

function planBadge(subscription) {
  if (!subscription) return null;
  const label = PLAN_LABEL[subscription.plan] ?? subscription.plan;
  if (subscription.status === "trialing" && subscription.trial_ends_at) return `${label} até ${dateBR(subscription.trial_ends_at)}`;
  if (subscription.status === "canceled" || subscription.status === "expired") return `${label} · encerrado`;
  if (subscription.status === "past_due") return `${label} · pagamento pendente`;
  return label;
}

function SaveBar({ saving, status, onCancel, dirty }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ font: "var(--type-body-sm)", color: status === "error" ? "var(--danger-text)" : "var(--success-text)", marginRight: "auto" }} aria-live="polite">
        {status === "saved" && "Alterações salvas."}
        {status === "error" && "Não foi possível salvar. Confira os campos e tente de novo."}
      </span>
      <Button variant="ghost" onClick={onCancel} disabled={!dirty || saving}>
        Cancelar
      </Button>
      <Button type="submit" loading={saving} disabled={!dirty}>
        Salvar alterações
      </Button>
    </div>
  );
}

/** Formulário ligado a campos do perfil: guarda o rascunho e salva só o que mudou. */
function useProfileForm(fields) {
  const { boot, updateProfile } = useSession();
  const initial = React.useMemo(() => Object.fromEntries(fields.map((f) => [f, boot.profile[f] == null ? "" : String(boot.profile[f])])), [boot.profile, fields]);
  const [draft, setDraft] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState(null);
  const changed = fields.filter((f) => draft[f] !== initial[f]);
  const set = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setStatus(null);
  };
  const save = async (toValue) => {
    setSaving(true);
    try {
      await updateProfile(Object.fromEntries(changed.map((f) => [f, toValue(f, draft[f])])));
      setStatus("saved");
    } catch {
      setStatus("error");
    }
    setSaving(false);
  };
  return { draft, set, save, saving, status, setStatus, dirty: changed.length > 0, reset: () => (setDraft(initial), setStatus(null)) };
}

const ACCOUNT_FIELDS = ["name"];
function AccountSection({ email }) {
  const { boot, updateProfile } = useSession();
  const form = useProfileForm(ACCOUNT_FIELDS);
  const [nameError, setNameError] = React.useState(null);
  const submit = (event) => {
    event.preventDefault();
    if (form.draft.name.trim().length < 2) return setNameError("Informe seu nome.");
    setNameError(null);
    form.save((_, value) => value.trim());
  };
  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 20 }} noValidate>
      <SectionHeader title="Minha conta" subtitle="Seus dados pessoais e a aparência do app" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
        <TextField label="Nome completo" value={form.draft.name} maxLength={120} onChange={(e) => form.set({ name: e.target.value })} error={nameError ?? undefined} autoComplete="name" />
        <TextField label="E-mail cadastrado" value={email ?? ""} hint="O e-mail é vinculado ao seu login e não pode ser alterado aqui." readOnly />
      </div>
      <div style={{ paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
        <div className="sm-field__label" style={{ marginBottom: 10 }}>
          Aparência
        </div>
        <SegmentedControl label="Aparência" value={boot.profile.theme} onChange={(theme) => updateProfile({ theme }).catch(() => {})} options={THEMES} />
      </div>
      <SaveBar saving={form.saving} status={form.status} dirty={form.dirty} onCancel={form.reset} />
    </form>
  );
}

const STUDY_FIELDS = ["phase", "exam_type", "target_edition", "exam_date", "daily_minutes", "graduation_country", "graduation_university", "graduation_year"];
function StudySection() {
  const form = useProfileForm(STUDY_FIELDS);
  const [errors, setErrors] = React.useState({});
  const { draft, set } = form;
  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (draft.target_edition && !/^\d{4}(\/[12])?$/.test(draft.target_edition.trim())) next.target_edition = "Use o formato 2027/1 ou 2027.";
    if (draft.graduation_year && !/^(19[5-9]\d|20\d\d)$/.test(draft.graduation_year.trim())) next.graduation_year = "Ano inválido.";
    setErrors(next);
    if (Object.keys(next).length) return;
    form.save((field, value) => {
      const v = value.trim();
      if (field === "phase" || field === "daily_minutes" || field === "graduation_year") return v ? Number(v) : null;
      return v || null;
    });
  };
  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 20 }} noValidate>
      <SectionHeader title="Estudo e prova" subtitle="Usados para montar o plano do dia e a contagem até a prova" />
      <div>
        <div className="sm-field__label" style={{ marginBottom: 10 }}>
          Fase
        </div>
        <SegmentedControl
          label="Fase"
          value={draft.phase}
          onChange={(phase) => set({ phase })}
          options={[
            { value: "1", label: "1ª fase · objetiva" },
            { value: "2", label: "2ª fase · prática" },
          ]}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
        <SelectField
          label="Prova"
          value={draft.exam_type}
          onChange={(e) => set({ exam_type: e.target.value })}
          options={[
            { value: "REVALIDA", label: "Revalida INEP" },
            { value: "ENAMED", label: "ENAMED" },
          ]}
        />
        <TextField label="Edição-alvo" value={draft.target_edition} placeholder="2027/1" maxLength={6} onChange={(e) => set({ target_edition: e.target.value })} error={errors.target_edition} />
        <TextField label="Data da prova" type="date" value={draft.exam_date} onChange={(e) => set({ exam_date: e.target.value })} />
        <SelectField label="Tempo de estudo" value={draft.daily_minutes} onChange={(e) => set({ daily_minutes: e.target.value })} options={MINUTES} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
        <TextField label="País de formação" value={draft.graduation_country} maxLength={80} onChange={(e) => set({ graduation_country: e.target.value })} />
        <TextField label="Universidade" value={draft.graduation_university} maxLength={160} onChange={(e) => set({ graduation_university: e.target.value })} />
        <TextField label="Ano de formatura" value={draft.graduation_year} inputMode="numeric" maxLength={4} onChange={(e) => set({ graduation_year: e.target.value })} error={errors.graduation_year} />
      </div>
      <SaveBar saving={form.saving} status={form.status} dirty={form.dirty} onCancel={() => (form.reset(), setErrors({}))} />
    </form>
  );
}

function SecuritySection() {
  const { backend, signOut } = useSession();
  const [error, setError] = React.useState(null);
  const [done, setDone] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const password = event.target.pw.value;
    const confirm = event.target.pw2.value;
    setDone(false);
    if (password.length < PASSWORD_MIN_LENGTH) return setError(`A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
    if (password !== confirm) return setError("As duas senhas não são iguais.");
    setError(null);
    setSaving(true);
    try {
      await backend.updatePassword(password);
      event.target.reset();
      setDone(true);
    } catch (err) {
      setError(err?.code === "weak_password" ? "Senha fraca demais. Escolha outra." : "Não foi possível trocar a senha. Tente de novo.");
    }
    setSaving(false);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionHeader title="Segurança" subtitle="Troque sua senha ou saia da conta neste aparelho" />
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
        {error && <Banner tone="danger">{error}</Banner>}
        {done && <Banner tone="success">Senha alterada.</Banner>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
          <TextField name="pw" label="Nova senha" type="password" autoComplete="new-password" hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`} />
          <TextField name="pw2" label="Repita a nova senha" type="password" autoComplete="new-password" />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="submit" loading={saving}>
            Trocar senha
          </Button>
        </div>
      </form>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
        <div>
          <div style={{ font: "var(--type-label)" }}>Sessão neste aparelho</div>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Sai da conta neste navegador.</div>
        </div>
        <Button variant="secondary" icon="log-out" onClick={() => signOut()}>
          Sair da conta
        </Button>
      </div>
    </div>
  );
}

function PrivacySection() {
  const { backend } = useSession();
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState(null);
  const [confirm, setConfirm] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState(null);

  const download = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const data = await backend.rpc("app_export_my_data");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `staziamed-meus-dados-${new Date().toLocaleDateString("en-CA")}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError("Não foi possível gerar o arquivo. Tente de novo.");
    }
    setExporting(false);
  };
  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await backend.rpc("app_delete_my_account", { p_confirm: confirm });
      await backend.signOut().catch(() => {});
    } catch {
      setDeleteError("Não foi possível excluir a conta. Tente de novo.");
      setDeleting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionHeader title="Privacidade e dados" subtitle="Seus direitos pela LGPD: acesso e exclusão dos seus dados" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 280px" }}>
          <div style={{ font: "var(--type-label)" }}>Baixar meus dados</div>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Perfil, respostas, sessões, flashcards, anotações e plano, num arquivo JSON.</div>
        </div>
        <Button variant="secondary" icon="download" onClick={download} loading={exporting}>
          Baixar arquivo
        </Button>
      </div>
      {exportError && <Banner tone="danger">{exportError}</Banner>}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20, borderRadius: 16, border: "1px solid var(--danger-border)", background: "var(--danger-bg)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", font: "var(--type-label)", color: "var(--danger-text)" }}>
          <Icon name="triangle-alert" size={18} /> Excluir conta
        </div>
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          Apaga sua conta e todo o seu histórico: respostas, sessões, flashcards, anotações e plano. Não dá para desfazer. Baixe seus dados antes, se quiser guardá-los.
        </p>
        {deleteError && <Banner tone="danger">{deleteError}</Banner>}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px" }}>
            <TextField label="Digite EXCLUIR para confirmar" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </div>
          <Button variant="danger" icon="trash-2" onClick={remove} loading={deleting} disabled={confirm !== "EXCLUIR"}>
            Excluir minha conta
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AccountScreen({ go }) {
  const { boot, user, signOut } = useSession();
  const mobile = useMobile();
  const [section, setSection] = React.useState("conta");
  const profile = boot.profile;
  const plan = planBadge(boot.subscription);
  const goal = profile.target_edition ? `Meta: ${profile.exam_type === "ENAMED" ? "ENAMED" : "Revalida INEP"} ${profile.target_edition}` : null;

  return (
    <>
      <Card>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <Avatar name={profile.name || user?.email || ""} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, font: "var(--type-h3)" }}>{profile.name || "Sua conta"}</h2>
            <div style={{ color: "var(--text-secondary)", font: "var(--type-body-sm)", overflowWrap: "anywhere" }}>{user?.email}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {plan && (
                <Badge tone="pro" size="sm">
                  {plan}
                </Badge>
              )}
              {goal && <Badge size="sm">{goal}</Badge>}
              <Badge size="sm">{profile.phase === 2 ? "2ª fase" : "1ª fase"}</Badge>
            </div>
          </div>
        </div>
      </Card>
      {isStaffRole(boot.role) && (
        <Banner
          tone="brand"
          icon="shield-check"
          title={boot.role === "admin" ? "Você é administrador" : "Você é editor"}
          action={
            <Button size="sm" iconRight="arrow-right" onClick={() => go("admin")}>
              Abrir administração
            </Button>
          }
        >
          {boot.role === "admin" ? "Usuários, questões, planos, estações e configurações." : "Questões e estações."}
        </Banner>
      )}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "minmax(0,1fr)" : "260px minmax(0,1fr)", gap: 24, alignItems: "start" }}>
        <Card padding={8}>
          <nav aria-label="Seções da conta" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {SECTIONS.map((s) => (
              <button key={s.id} type="button" className="sm-nav__item" aria-current={section === s.id ? "page" : undefined} onClick={() => setSection(s.id)} style={{ height: "auto", padding: "10px 12px", alignItems: "flex-start" }}>
                <Icon name={s.icon} size={18} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                  <span>{s.label}</span>
                  <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{s.sub}</span>
                </span>
              </button>
            ))}
            <button type="button" className="sm-nav__item" style={{ color: "var(--danger-text)" }} onClick={() => signOut()}>
              <Icon name="log-out" size={18} />
              Sair da conta
            </button>
          </nav>
        </Card>
        <Card padding={mobile ? 20 : 28}>
          {section === "conta" && <AccountSection email={user?.email} />}
          {section === "estudo" && <StudySection />}
          {section === "seg" && <SecuritySection />}
          {section === "priv" && <PrivacySection />}
        </Card>
      </div>
    </>
  );
}
