// Perfil gamificado na Conta: nível, score, percentil, ranking, sequência, acertos, questões, horas,
// histórico do score e as preferências de visibilidade no ranking (nome abreviado por padrão).
import React from "react";
import { Badge, Banner, Button, Card, Icon, SectionHeader, SegmentedControl, Switch, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { messageOf } from "../admin/common.jsx";
import { levelColor, movementText, pluralDays, topLabel } from "./format.js";
import { PlayError, RecentAchievements, ScoreChart, Skeleton, StaziaScoreCard } from "./components.jsx";
import { usePlayLoad, usePlaySummary } from "./usePlay.js";

const VISIBILITY = [
  { value: "abbreviated", label: "Nome abreviado" },
  { value: "username", label: "Usuário" },
  { value: "anonymous", label: "Anônimo" },
  { value: "hidden", label: "Oculto" },
];
const RANGES = [
  { value: "30", label: "30 dias" },
  { value: "90", label: "3 meses" },
  { value: "180", label: "6 meses" },
  { value: "3650", label: "Tudo" },
];

export function PlayPreferences() {
  const { backend } = useSession();
  const prefs = usePlayLoad(() => backend.rpc("app_gamification_preferences"), [backend]);
  const [draft, setDraft] = React.useState(null);
  const [state, setState] = React.useState({ saving: false, error: null, saved: false });
  const d = draft ?? prefs.data;
  if (prefs.error) return <PlayError retry={prefs.reload} />;
  if (!d) return <Skeleton height={160} />;
  const set = (patch) => (setDraft({ ...d, ...patch }), setState({ saving: false, error: null, saved: false }));
  const save = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null, saved: false });
    try {
      const saved = await backend.rpc("app_gamification_save_preferences", {
        p_prefs: { leaderboard_visibility: d.leaderboard_visibility, username: d.username ?? "", show_avatar: d.show_avatar, show_accuracy: d.show_accuracy, show_streak: d.show_streak, show_achievements: d.show_achievements },
      });
      prefs.setData(saved);
      setDraft(null);
      setState({ saving: false, error: null, saved: true });
    } catch (error) {
      setState({ saving: false, error: messageOf(error), saved: false });
    }
  };
  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
      <SectionHeader title="Visibilidade no ranking" subtitle={`Como você aparece para os outros alunos. Hoje: ${d.display_name}`} />
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <SegmentedControl label="Visibilidade" value={d.leaderboard_visibility} onChange={(v) => set({ leaderboard_visibility: v })} options={VISIBILITY} fullWidth />
      {d.leaderboard_visibility === "username" && (
        <TextField label="Nome de usuário" value={d.username ?? ""} maxLength={20} onChange={(e) => set({ username: e.target.value.toLowerCase() })} hint="3 a 20 letras minúsculas, números ou _." />
      )}
      {d.leaderboard_visibility === "hidden" && <Banner tone="info">Oculto: você não aparece em nenhum ranking, mas continua ganhando XP, sequência e medalhas.</Banner>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        {[["show_avatar", "Mostrar avatar"], ["show_accuracy", "Mostrar precisão"], ["show_streak", "Mostrar sequência"], ["show_achievements", "Mostrar medalhas"]].map(([k, label]) => (
          <div key={k} style={{ padding: "10px 14px", borderRadius: 14, border: "1px solid var(--border-subtle)" }}>
            <Switch checked={Boolean(d[k])} onChange={(e) => set({ [k]: e.target.checked })} label={label} />
          </div>
        ))}
      </div>
      <p style={{ margin: 0, font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Nunca aparecem no ranking: e-mail, telefone, documentos, dados de pagamento ou de saúde.</p>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)", marginRight: "auto" }} aria-live="polite">{state.saved && "Preferências salvas."}</span>
        <Button variant="ghost" onClick={() => setDraft(null)} disabled={!draft || state.saving}>Cancelar</Button>
        <Button type="submit" loading={state.saving} disabled={!draft}>Salvar</Button>
      </div>
    </form>
  );
}

export function ScoreHistory() {
  const { backend } = useSession();
  const [days, setDays] = React.useState("30");
  const h = usePlayLoad(() => backend.rpc("app_gamification_history", { p_days: Number(days) }), [backend, days]);
  return (
    <Card style={{ borderRadius: 24 }} padding={20}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>Evolução do Stazia Score</span>
        <SegmentedControl label="Período" value={days} onChange={setDays} options={RANGES} />
      </div>
      {h.error ? <PlayError retry={h.reload} /> : !h.data ? <Skeleton height={140} /> : <ScoreChart points={h.data.points} />}
    </Card>
  );
}

export function PlayProfileSection({ go }) {
  const { boot } = useSession();
  const mobile = useMobile();
  const { data: s, error, loading, reload } = usePlaySummary();
  if (boot?.play?.enabled === false) return <Banner tone="info">A Stazia Arena está desligada no momento. Seu histórico fica guardado.</Banner>;
  if (error) return <PlayError retry={reload} />;
  if (loading || !s) return <Skeleton height={320} />;
  const name = boot.profile.name || "Sua conta";
  const color = levelColor(s.level);
  const stats = [
    ["flame", pluralDays(s.streak?.current ?? 0), "sequência", "var(--streak-text)"],
    ["target", `${Math.round(Number(s.accuracy) || 0)}%`, "acertos", "var(--success-text)"],
    ["file-question", Number(s.questions).toLocaleString("pt-BR"), "questões", "var(--text-brand)"],
    ["timer", `${s.hours_studied}h`, "estudadas", "var(--text-secondary)"],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionHeader title="Minha Stazia Arena" subtitle="Seu perfil de estudo: nível, score, ranking e conquistas" />
      <Card style={{ borderRadius: 24 }} padding={mobile ? 20 : 28}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ width: 64, height: 64, borderRadius: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
            <Icon name={s.level?.icon ?? "sprout"} size={32} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, font: "700 22px/1.2 var(--font-sans)", textTransform: "uppercase", letterSpacing: "-0.01em" }}>{name}</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              <Badge tone="neutral" icon={s.level?.icon}>{s.level?.name}</Badge>
              {!s.provisional && s.rank && <Badge tone="brand">{topLabel(s.rank.percentile)}</Badge>}
              {s.rank && <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Ranking geral #{s.rank.rank}</span>}
              {s.rank?.week_change != null && <span style={{ font: "600 13px var(--font-sans)", color: s.rank.week_change > 0 ? "var(--success-text)" : "var(--text-tertiary)" }}>{movementText(s.rank.week_change)}</span>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ font: "500 12px var(--font-sans)", color: "var(--text-tertiary)" }}>{s.names?.score}</div>
            <div style={{ font: "700 34px/1 var(--font-sans)", letterSpacing: "-0.02em" }}>{s.score} <span style={{ font: "500 14px var(--font-sans)", color: "var(--text-tertiary)" }}>/ 1000</span></div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 10, marginTop: 20 }}>
          {stats.map(([icon, value, label, c]) => (
            <div key={label} style={{ padding: 14, borderRadius: 16, background: "var(--surface-subtle)", display: "flex", gap: 10, alignItems: "center" }}>
              <Icon name={icon} size={20} style={{ color: c }} />
              <div>
                <div style={{ font: "700 18px/1.1 var(--font-sans)" }}>{value}</div>
                <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2,minmax(0,1fr))", gap: 16, alignItems: "start" }}>
        <StaziaScoreCard summary={s} />
        <RecentAchievements items={s.recent_achievements} onSeeAll={() => go("conquistas")} />
      </div>
      <ScoreHistory />
      <Card style={{ borderRadius: 24 }} padding={mobile ? 18 : 24}>
        <PlayPreferences />
      </Card>
    </div>
  );
}
