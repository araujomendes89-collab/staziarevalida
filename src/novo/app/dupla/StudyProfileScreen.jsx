// Meu perfil de estudo (Treinamento em Dupla): formulário à esquerda e prévia do cartão à direita.
// Porte de Profile.jsx do pacote de design (23-70) com os componentes e as cores do app; nenhum dado de exemplo:
// nome e prova vêm da Conta (app_dupla_profile) e quem grava é app_dupla_save_profile. O título da tela fica no cabeçalho do app.
// Quem está aqui conta como online (sinal "livre", Presença e convite): o "Deu match!" aparece também nesta tela (Tarefa 13).
import React from "react";
import { Avatar, Button, Card, Chip, Icon, MatchCard, SegmentedControl, Switch, Textarea, TextField, useToast } from "../../ds";
import { useSession } from "../session.jsx";
import { LoadError, Loading, messageOf, useLoad } from "../admin/common.jsx";
import { AREAS, DAYS, PACE_LABEL, ROLE_PREF_LABEL, SHIFTS, areaVars } from "./labels.js";
import { toCard } from "./card.js";
import { useDuplaChannel, useHeartbeat } from "./live.js";
import { InviteWatcher } from "./MatchModal.jsx";
import { installAudioWake } from "./sound.js";
import { AREA_ORDER, DAY_ORDER, SHIFT_ORDER, draftErrors, draftPayload, nextEditions, profileDraft, toggleInOrder } from "./profile.js";

function Section({ title, desc, children }) {
  return (
    <Card as="section" padding={22} style={{ display: "flex", flexDirection: "column", gap: 16, borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)" }}>
      <div>
        <h2 style={{ margin: 0, font: "700 17px var(--font-sans)", color: "var(--text-primary)" }}>{title}</h2>
        {desc && <p style={{ margin: "3px 0 0", font: "13px var(--font-sans)", color: "var(--text-tertiary)" }}>{desc}</p>}
      </div>
      {children}
    </Card>
  );
}

function Label({ children }) {
  return <div style={{ font: "var(--type-label)", color: "var(--text-primary)", marginBottom: 8 }}>{children}</div>;
}

const ROLE_OPTIONS = ["med", "ator", "any"].map((value) => ({ value, label: ROLE_PREF_LABEL[value] }));
const PACE_OPTIONS = ["livre", "cronometrado", "simulacao"].map((value) => ({ value, label: PACE_LABEL[value] }));

function AreaChip({ area, on, onClick }) {
  const colors = areaVars(area.code);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 38,
        padding: "0 16px",
        borderRadius: "var(--radius-pill)",
        border: on ? "1px solid transparent" : "1px solid var(--border-default)",
        background: on ? colors.solid : "var(--surface-card)",
        color: on ? "var(--surface-card)" : colors.ink,
        font: "600 14px var(--font-sans)",
        cursor: "pointer",
      }}
    >
      {on ? <Icon name="check" size={14} /> : <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 3, background: colors.base }} />}
      {area.chip}
    </button>
  );
}

/** Sinal, Presença e convite do Perfil. Só existe com perfil salvo (o servidor não grava sinal sem perfil); o radar é o SALVO, não o do rascunho. */
function ProfileLive({ go, meName, radar }) {
  useHeartbeat("livre");
  const { inviteTick, live } = useDuplaChannel({ radar });
  React.useEffect(() => {
    installAudioWake();
  }, []);
  return <InviteWatcher go={go} meName={meName} inviteTick={inviteTick} live={live} />;
}

export function StudyProfileScreen({ go }) {
  const { backend } = useSession();
  const [toastNode, showToast] = useToast();
  const { data, error, loading, reload, setData } = useLoad(() => backend.rpc("app_dupla_profile"), [backend]);
  const [saving, setSaving] = React.useState(false);
  const [edit, setEdit] = React.useState({ base: null, value: null });

  const initial = React.useMemo(() => (data ? profileDraft(data, new Date()) : null), [data]);
  const editions = React.useMemo(() => nextEditions(new Date()), []);

  if (error && !data) return <LoadError error={error} retry={reload} />;
  if (loading || !data || !initial) return <Loading />;

  // O rascunho vale enquanto os dados salvos são os mesmos de quando ele começou; depois de salvar, volta ao salvo.
  const draft = edit.base === initial ? edit.value : initial;
  const set = (key, value) => setEdit({ base: initial, value: { ...draft, [key]: value } });
  const toggle = (key, item, order) => set(key, toggleInOrder(draft[key], item, order));
  const changed = JSON.stringify(draft) !== JSON.stringify(initial);
  const errors = draftErrors(draft);
  const canSave = (changed || !data.profile) && !errors.public_name && !saving;
  const examOptions = draft.exam && !editions.includes(draft.exam) ? [draft.exam, ...editions] : editions;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const result = await backend.rpc("app_dupla_save_profile", { p_profile: draftPayload(draft) });
      setData(result);
      setEdit({ base: null, value: null });
      showToast("Perfil de estudo salvo");
    } catch (e) {
      showToast(messageOf(e), "danger");
    } finally {
      setSaving(false);
    }
  };

  // Como o servidor mostra o cartão aos outros: instituição só com "mostrar instituição", estações só com "mostrar desempenho".
  const preview = toCard({
    ...draft,
    public_name: draft.public_name.trim() || "Seu nome",
    online: draft.radar_visible,
    school: draft.show_school ? draft.school : null,
    stats: draft.show_stats ? (data.stats ?? { done: 0, avg: null }) : null,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {toastNode}
      {data.profile && <ProfileLive go={go} meName={data.profile.public_name} radar={data.profile.radar_visible !== false} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <button
            type="button"
            onClick={() => go("dupla")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, border: 0, background: "transparent", padding: 0, cursor: "pointer", font: "600 13px var(--font-sans)", color: "var(--text-brand)" }}
          >
            <Icon name="arrow-left" size={14} />
            Voltar para Praticar
          </button>
          <p style={{ margin: "8px 0 0", font: "15px var(--font-sans)", color: "var(--text-tertiary)" }}>É assim que os colegas veem você ao procurar uma dupla.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" disabled={!changed || saving} onClick={() => setEdit({ base: null, value: null })}>
            Descartar
          </Button>
          <Button icon="check" disabled={!canSave} loading={saving} onClick={save}>
            Salvar perfil
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
          <Section title="Sobre você" desc="Somente informações públicas. E-mail e telefone nunca aparecem.">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Avatar name={draft.public_name.trim() || "?"} size={64} />
              <div style={{ font: "13px/1.5 var(--font-sans)", color: "var(--text-tertiary)" }}>A foto usa suas iniciais.</div>
            </div>
            <TextField
              label="Nome público"
              value={draft.public_name}
              maxLength={40}
              onChange={(e) => set("public_name", e.target.value)}
              error={errors.public_name}
              placeholder="Como você quer aparecer"
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
              <TextField label="Instituição de formação" value={draft.school} maxLength={80} onChange={(e) => set("school", e.target.value)} placeholder="ex.: UMSA · Bolívia" />
              <TextField label="Cidade / estado" value={draft.city} maxLength={80} onChange={(e) => set("city", e.target.value)} placeholder="ex.: Curitiba · PR" />
            </div>
            <div>
              <Label>Prova que vou fazer</Label>
              <SegmentedControl label="Prova" value={draft.exam} onChange={(v) => set("exam", v)} options={examOptions} />
            </div>
            <Textarea
              label="Bio"
              rows={3}
              maxLength={160}
              showCount
              value={draft.bio}
              onChange={(e) => set("bio", e.target.value)}
              placeholder="Conte em poucas palavras como você gosta de treinar."
            />
          </Section>

          <Section title="Como quero treinar" desc="Usamos estas respostas para calcular a compatibilidade.">
            <TextField label="Objetivo principal" icon="target" value={draft.goal} maxLength={80} onChange={(e) => set("goal", e.target.value)} placeholder="ex.: Treinar GO e Pediatria" />
            <div>
              <Label>Áreas de interesse</Label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {AREAS.map((area) => (
                  <AreaChip key={area.code} area={area} on={draft.areas.includes(area.code)} onClick={() => toggle("areas", area.code, AREA_ORDER)} />
                ))}
              </div>
            </div>
            <div>
              <Label>Papel preferido</Label>
              <SegmentedControl fullWidth label="Papel" value={draft.role_pref} onChange={(v) => set("role_pref", v)} options={ROLE_OPTIONS} />
            </div>
            <div>
              <Label>Ritmo</Label>
              <SegmentedControl fullWidth label="Ritmo" value={draft.pace} onChange={(v) => set("pace", v)} options={PACE_OPTIONS} />
            </div>
          </Section>

          <Section title="Disponibilidade">
            <div>
              <Label>Dias</Label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {DAYS.map((day) => (
                  <Chip key={day} selected={draft.days.includes(day)} onClick={() => toggle("days", day, DAY_ORDER)}>
                    {day}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <Label>Turnos</Label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {SHIFTS.map((shift) => (
                  <Chip key={shift} selected={draft.shifts.includes(shift)} onClick={() => toggle("shifts", shift, SHIFT_ORDER)}>
                    {shift}
                  </Chip>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Privacidade">
            <Switch
              label="Aparecer no radar de duplas"
              description="Colegas compatíveis podem ver seu cartão e convidar você."
              checked={draft.radar_visible}
              onChange={(e) => set("radar_visible", e.target.checked)}
            />
            <Switch
              label="Mostrar instituição de formação"
              description="Aparece na linha abaixo do seu nome."
              checked={draft.show_school}
              onChange={(e) => set("show_school", e.target.checked)}
            />
            <Switch
              label="Mostrar meu desempenho"
              description="Exibe quantas estações você fez e sua média no PEP."
              checked={draft.show_stats}
              onChange={(e) => set("show_stats", e.target.checked)}
            />
          </Section>
        </div>

        <aside style={{ flex: "1 1 340px", maxWidth: 440, minWidth: 0, position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ font: "700 13px var(--font-sans)", color: "var(--text-primary)" }}>Pré-visualização do seu cartão</span>
            {changed && <span style={{ font: "600 12px var(--font-sans)", color: "var(--warning-text)" }}>Alterações não salvas</span>}
          </div>
          <div style={{ pointerEvents: "none" }}>
            <MatchCard person={preview} />
          </div>
          {!draft.radar_visible && (
            <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--warning-bg)", color: "var(--warning-text)", font: "13px/1.45 var(--font-sans)" }}>
              <Icon name="eye-off" size={15} style={{ marginTop: 2 }} />
              Com o radar desligado, ninguém vê seu cartão.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
