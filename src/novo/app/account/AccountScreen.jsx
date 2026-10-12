// Conta com dados do banco (perfil do app_bootstrap, app_update_profile, app_export_my_data,
// app_delete_my_account). Mesma marcação da ProfileScreen do kit (prototype/OtherScreens.jsx).
// Os interruptores de lembrete e de alertas do protótipo saíram: o produto ainda não envia
// notificações.
import React from "react";
import { Avatar, Badge, Banner, Button, Card, Icon, SectionHeader, SegmentedControl, SelectField, TextField } from "../../ds";
import { isStaffRole } from "../admin/AdminScreen.jsx";
import { isPhase2Locked, paidPlanLapsed, trialLapsed } from "../admin/common.jsx";
import { PASSWORD_MIN_LENGTH } from "../../data";
import { useSession } from "../session.jsx";
import { planSummary, usePlanLock } from "../plan/planAccess.js";
import { ReportProblem } from "../support/ReportProblem.jsx";
import { SupportMail, useSupportEmail } from "../support/supportContact.jsx";
import { useMobile } from "../Shell.jsx";
import { PlayProfileSection } from "../play/PlayProfile.jsx";
import { COUNTRIES, normalizePhone, phoneError, splitPhone } from "../legal/phone.js";
import "./account.css";

const SECTIONS = [
  { id: "conta", label: "Minha conta", sub: "Nome, e-mail, WhatsApp e aparência", icon: "user" },
  { id: "play", label: "Minha Stazia Arena", sub: "Nível, score, ranking e visibilidade", icon: "trophy" },
  { id: "estudo", label: "Estudo e prova", sub: "Fase, prova-alvo e rotina", icon: "graduation-cap" },
  { id: "seg", label: "Segurança", sub: "Senha e sessão", icon: "shield-check" },
  { id: "priv", label: "Privacidade e dados", sub: "Exportação e exclusão (LGPD)", icon: "file-lock" },
  { id: "ajuda", label: "Ajuda e suporte", sub: "Fale com a equipe ou relate um problema", icon: "life-buoy" },
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

// Data e hora do aceite sempre no fuso de Brasília, qualquer que seja o deslocamento do texto que o banco devolve.
const dateTimeBR = (iso) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute}`;
};

function planBadge(subscription, role, reviewer = false) {
  if (isStaffRole(role)) return "Equipe · acesso completo";
  if (reviewer) return "Revisor médico · acesso completo";
  if (!subscription) return null;
  const label = PLAN_LABEL[subscription.plan] ?? subscription.plan;
  // cadastro sem teste grátis (PL06): conta gratuita, sem plano pago
  if (subscription.plan === "trial" && subscription.status === "expired" && !subscription.trial_ends_at) return "Acesso gratuito";
  if (trialLapsed(subscription)) return `${label} · encerrado`;
  if (subscription.status === "trialing" && subscription.trial_ends_at) return `${label} até ${dateBR(subscription.trial_ends_at)}`;
  // plano pago depois de "Plano pago até" (com pagamento pendente, depois dos 3 dias de tolerância) já não dá acesso
  if (subscription.status === "canceled" || subscription.status === "expired" || paidPlanLapsed(subscription)) return `${label} · encerrado`;
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

/**
 * Formulário ligado a campos do perfil: guarda o rascunho e salva só o que mudou.
 * `adjust` (opcional): `shown` troca os valores que o formulário mostra ao abrir (não contam como alteração do aluno) e
 * `extra` vai junto em todo salvamento, mesmo sem o aluno ter mexido nesses campos.
 */
function useProfileForm(fields, adjust) {
  const { boot, updateProfile } = useSession();
  const initial = React.useMemo(() => ({ ...Object.fromEntries(fields.map((f) => [f, boot.profile[f] == null ? "" : String(boot.profile[f])])), ...adjust?.shown }), [boot.profile, fields, adjust]);
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
      await updateProfile({ ...Object.fromEntries(changed.map((f) => [f, toValue(f, draft[f])])), ...adjust?.extra });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
    setSaving(false);
  };
  return { draft, set, save, saving, status, setStatus, dirty: changed.length > 0, reset: () => (setDraft(initial), setStatus(null)) };
}

const ACCOUNT_FIELDS = ["name"];
const COUNTRY_CODES = new Set(COUNTRIES.filter((c) => c.code !== "outro").map((c) => c.code));

/**
 * WhatsApp com os componentes do design system, nas mesmas regras e no mesmo contrato "Outro" do PhoneField do cadastro
 * (lógica do seletor espelhada de legal/PhoneField.jsx; o PhoneField segue só no cadastro e na tela de aceite).
 */
function PhoneInputs({ code, number, onChange, error, codeError, id }) {
  const [other, setOther] = React.useState(() => !COUNTRY_CODES.has(code));
  const selectValue = !other && COUNTRY_CODES.has(code) ? code : "outro";
  return (
    <div style={{ display: "grid", gridTemplateColumns: other ? "minmax(150px,1fr) 110px minmax(0,2fr)" : "minmax(150px,1fr) minmax(0,2fr)", gap: 12, alignItems: "start" }}>
      <SelectField
        id={`${id}-country`}
        label="País do WhatsApp"
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === "outro") {
            setOther(true);
            onChange({ code: "", number });
          } else {
            setOther(false);
            onChange({ code: e.target.value, number });
          }
        }}
        options={COUNTRIES.map((c) => ({ value: c.code, label: c.label }))}
      />
      {other && <TextField id={`${id}-code`} label="Código do país" placeholder="+44" inputMode="tel" autoComplete="off" value={code} onChange={(e) => onChange({ code: e.target.value, number })} error={codeError} />}
      <TextField id={`${id}-number`} label="WhatsApp" type="tel" autoComplete="tel-national" value={number} onChange={(e) => onChange({ code, number: e.target.value })} error={error} />
    </div>
  );
}
function AccountSection({ email }) {
  const { boot, updateProfile } = useSession();
  const savedPhone = React.useMemo(() => splitPhone(boot.profile.phone ?? null), [boot.profile.phone]);
  const [phone, setPhone] = React.useState(savedPhone);
  const typedNormalized = normalizePhone(phone.code, phone.number);
  // alterado = diferente do salvo em valor normalizado (o mesmo número digitado com máscara depois de salvar não conta)
  const phoneDirty = (phone.code !== savedPhone.code || phone.number !== savedPhone.number) && (typedNormalized == null || typedNormalized !== (boot.profile.phone ?? null));
  const normalized = phoneDirty ? typedNormalized : null;
  // muda ao cancelar: remonta o seletor de país, que volta ao estado do telefone salvo
  const [phoneKey, setPhoneKey] = React.useState(0);
  // `extra` só leva o WhatsApp quando ele mudou e é válido; `adjust` precisa ser estável entre renderizações iguais
  const adjust = React.useMemo(() => (normalized ? { extra: { phone: normalized } } : undefined), [normalized]);
  const form = useProfileForm(ACCOUNT_FIELDS, adjust);
  const [nameError, setNameError] = React.useState(null);
  const [showPhoneError, setShowPhoneError] = React.useState(false);
  const msg = phoneDirty ? phoneError(phone.code, phone.number) : null;
  const codeBad = msg && phone.number.trim() && !/^\+?[1-9][0-9]{0,2}$/.test(phone.code.trim()) && !COUNTRY_CODES.has(phone.code);
  const submit = (event) => {
    event.preventDefault();
    if (form.draft.name.trim().length < 2) return setNameError("Informe seu nome.");
    setNameError(null);
    if (msg) return setShowPhoneError(true);
    setShowPhoneError(false);
    form.save((_, value) => value.trim());
  };
  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 20 }} noValidate>
      <SectionHeader title="Minha conta" subtitle="Seus dados pessoais e a aparência do app" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
        <TextField label="Nome completo" value={form.draft.name} maxLength={120} onChange={(e) => form.set({ name: e.target.value })} error={nameError ?? undefined} autoComplete="name" />
        <TextField label="E-mail cadastrado" value={email ?? ""} hint="O e-mail é vinculado ao seu login e não pode ser alterado aqui." readOnly />
      </div>
      <PhoneInputs
          key={phoneKey}
          code={phone.code}
          number={phone.number}
          onChange={(next) => (setPhone(next), form.setStatus(null), setShowPhoneError(false))}
          error={showPhoneError && msg && !codeBad ? msg : undefined}
          codeError={showPhoneError && codeBad ? msg : undefined}
          id="conta-phone"
        />
      <div style={{ paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
        <div className="sm-field__label" style={{ marginBottom: 10 }}>
          Aparência
        </div>
        <SegmentedControl label="Aparência" value={boot.profile.theme} onChange={(theme) => updateProfile({ theme }).catch(() => {})} options={THEMES} />
      </div>
      <SaveBar saving={form.saving} status={form.status} dirty={form.dirty || phoneDirty} onCancel={() => (form.reset(), setPhone(savedPhone), setPhoneKey((k) => k + 1), setShowPhoneError(false))} />
    </form>
  );
}

const STUDY_FIELDS = ["phase", "exam_type", "target_edition", "exam_date", "daily_minutes", "graduation_country", "graduation_university", "graduation_year"];
// Aluno com a 2ª fase gravada (de antes de ela ficar "em breve"): o campo mostra a 1ª e o salvamento grava 1.
const SECOND_PHASE_BECOMES_FIRST = { shown: { phase: "1" }, extra: { phase: 1 } };
function StudySection() {
  const { boot } = useSession();
  const mobile = useMobile();
  // 2ª fase · prática "em breve" para o aluno (a equipe segue com a opção livre)
  const phase2Locked = isPhase2Locked(boot.role);
  const form = useProfileForm(STUDY_FIELDS, phase2Locked && boot.profile.phase === 2 ? SECOND_PHASE_BECOMES_FIRST : undefined);
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
        <div className={phase2Locked ? "acc-phase-soon" : undefined}>
          <SegmentedControl
            label="Fase"
            value={draft.phase}
            onChange={(phase) => set({ phase })}
            fullWidth={mobile && phase2Locked}
            options={[
              { value: "1", label: "1ª fase · objetiva" },
              { value: "2", label: phase2Locked ? "2ª fase · prática (em breve)" : "2ª fase · prática", disabled: phase2Locked },
            ]}
          />
        </div>
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

function AcceptanceLine({ title, doc }) {
  if (!doc) return null;
  return (
    <div style={{ font: "var(--type-body-sm)" }}>
      {doc.accepted && doc.accepted_at ? `${title} v${doc.accepted} — aceito em ${dateTimeBR(doc.accepted_at)}` : `${title}${doc.current ? ` v${doc.current}` : ""} — ainda não aceito`}
    </div>
  );
}

function PrivacySection() {
  const { backend, boot } = useSession();
  const legal = boot.legal;
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
      {legal && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ font: "var(--type-label)" }}>Meus aceites</div>
          <AcceptanceLine title="Termo de Aceite e Uso" doc={legal.termo_uso} />
          <AcceptanceLine title="Aceite dos Tutores de IA" doc={legal.tutor_ia} />
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", font: "var(--type-body-sm)" }}>
            <a href="/novo/termos">Termo de Aceite e Uso</a>
            <a href="/novo/privacidade">Política de Privacidade</a>
          </div>
        </div>
      )}
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

/** Ajuda e suporte: o e-mail da equipe (configuração única da Administração) e o botão de relatar um problema. */
function HelpSection({ email }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionHeader title="Ajuda e suporte" subtitle="Dúvida, problema ou sugestão? Fale com a equipe do StaziaMed" />
      <div>
        <div style={{ font: "var(--type-label)" }}>E-mail de suporte</div>
        <div style={{ font: "var(--type-body)" }}>
          <SupportMail email={email} />
        </div>
        <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Escreva por aqui para tirar dúvidas, pedir acesso ou falar sobre seu plano.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
        <div>
          <div style={{ font: "var(--type-label)" }}>Relatar um problema</div>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Algo não funcionou ou uma questão parece errada? Conte aqui e a mensagem chega direto à equipe.</div>
        </div>
        <ReportProblem email={email} />
      </div>
    </div>
  );
}

/** "Seu plano": a data de fim como está na assinatura do aluno (sem número inventado). O nome do plano já aparece no selo de cima. */
function PlanCard({ summary, email }) {
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Seu plano</h3>
        <div style={{ font: "var(--type-label)" }}>
          <span>{summary.lead}</span>
          {summary.date && (
            <>
              {" "}
              <strong>{summary.date}</strong>
            </>
          )}
        </div>
        {summary.note && <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{summary.note}</div>}
        <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          Dúvidas sobre o seu plano? Fale com o suporte: <SupportMail email={email} />
        </div>
      </div>
    </Card>
  );
}

/**
 * Benefícios do plano Elite (PL04). Só aparecem para quem tem Elite pago e dentro da data, e só os que o dono ligou/preencheu em
 * Administração > Configurações: sem valor definido, nada é mostrado (e nada é inventado).
 */
function EliteBenefits({ benefits }) {
  const items = [];
  if (benefits?.voice_daily_minutes != null) items.push(`Voz do Tutor: até ${benefits.voice_daily_minutes} minutos por dia`);
  if (benefits?.station_feedback) items.push("Correção de estação com devolutiva");
  if (!benefits?.elite || items.length === 0) return null;
  return (
    <Banner tone="brand" icon="crown" title="Benefícios do seu plano Elite">
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Banner>
  );
}

export function AccountScreen({ go }) {
  const { boot, user, signOut, backend } = useSession();
  const [benefits, setBenefits] = React.useState(null);
  const isElite = boot.subscription?.plan === "elite";
  // refaz a consulta quando o plano, a situação ou a data do plano pagão mudam (ex.: Elite cancelado ou vencido), e apaga o que estava na tela
  const eliteKey = [boot.subscription?.plan, boot.subscription?.status, boot.subscription?.current_period_end].join("|");
  // o plano mudou: o que estava na tela sai até o banco responder de novo
  React.useEffect(() => {
    setBenefits(null);
  }, [eliteKey]);
  // "tick" pede uma nova consulta sem mudar o plano: no instante em que o plano pago vence (pelo relógio) e ao voltar para a aba
  const [tick, setTick] = React.useState(0);
  const periodEnd = boot.subscription?.current_period_end;
  React.useEffect(() => {
    if (!isElite) return undefined;
    const again = () => setTick((n) => n + 1);
    const onVisible = () => {
      if (document.visibilityState !== "hidden") again();
    };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", onVisible);
    // o temporizador do navegador aceita no máximo ~24,8 dias: se o vencimento é mais longe, acorda antes e agenda de novo
    const end = periodEnd ? new Date(periodEnd).getTime() : NaN;
    const wait = end - Date.now() + 1000;
    const timer = Number.isFinite(wait) && wait > 0 ? window.setTimeout(again, Math.min(wait, 2_000_000_000)) : null;
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isElite, periodEnd, tick]);
  React.useEffect(() => {
    if (!isElite || !backend) return undefined;
    let alive = true;
    Promise.resolve(backend.rpc("app_my_benefits"))
      .then((result) => alive && setBenefits(result ?? null))
      .catch(() => alive && setBenefits(null)); // sem o aviso dos benefícios a Conta funciona igual
    return () => {
      alive = false;
    };
  }, [backend, isElite, eliteKey, tick]);
  const mobile = useMobile();
  const [section, setSection] = React.useState("conta");
  const profile = boot.profile;
  const plan = planBadge(boot.subscription, boot.role, Boolean(boot.reviewer_areas?.length));
  const supportEmail = useSupportEmail();
  const summary = planSummary(boot.subscription, boot.role, Boolean(boot.reviewer_areas?.length));
  const lock = usePlanLock(); // teste grátis terminado ou sem plano pago: o que fica nos planos pagos (PL02); o banco decide
  const phase2Locked = isPhase2Locked(boot.role); // 2ª fase "em breve" para o aluno: o selo mostra a 1ª mesmo se a 2ª estiver gravada
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
              <Badge size="sm">{profile.phase === 2 && !phase2Locked ? "2ª fase" : "1ª fase"}</Badge>
            </div>
          </div>
        </div>
      </Card>
      {summary && <PlanCard summary={summary} email={supportEmail} />}
      {lock && (
        <Banner tone="warning" icon="lock" title={lock.title}>
          {lock.text}
        </Banner>
      )}
      <EliteBenefits benefits={benefits} />
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
          Acesso completo ao app, sem período de teste.{" "}
          {boot.role === "admin" ? "Na administração: usuários, planos, conteúdo e configurações." : "Na administração: questões, aulas, atualizações, estações e Central de Conteúdo."}
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
          {section === "play" && <PlayProfileSection go={go} />}
          {section === "estudo" && <StudySection />}
          {section === "seg" && <SecuritySection />}
          {section === "priv" && <PrivacySection />}
          {section === "ajuda" && <HelpSection email={supportEmail} />}
        </Card>
      </div>
    </>
  );
}
