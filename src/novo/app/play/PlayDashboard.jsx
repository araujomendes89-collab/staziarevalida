// Bloco do Stazia Play no Início: score, sequência, meta do dia, próxima etapa da trilha, missões,
// ranking semanal e conquistas recentes. O ranking não domina: fica compacto, abaixo do estudo.
import React from "react";
import { Button, Card, Icon, ProgressBar } from "../../ds";
import { useSession } from "../session.jsx";
import { CurrentUserRank, LeagueCard, MissionList, PlayError, RecentAchievements, ScoreExplainer, Skeleton, StaziaScoreCard, StreakCard } from "./components.jsx";
import { usePlayLoad, usePlaySummary } from "./usePlay.js";

/** Topo do painel: score · sequência · meta do dia (ordem pedida no design). */
export function PlayHeader({ summary, mobile, go }) {
  const [explain, setExplain] = React.useState(false);
  const missions = summary.missions ?? { done: 0, total: 0 };
  const today = summary.streak?.today ?? {};
  const goalQ = today.min_questions ?? 10;
  const pct = summary.streak?.today_done ? 100 : Math.min(100, Math.round((100 * (today.questions ?? 0)) / goalQ));
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr)", gap: mobile ? 12 : 16 }}>
        <StaziaScoreCard summary={summary} compact onClick={() => setExplain(true)} />
        <StreakCard streak={summary.streak} compact onClick={() => go("missoes")} />
        <Card style={{ borderRadius: 24, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }} padding={18}>
          <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>Meta de hoje</span>
          <ProgressBar value={pct} max={100} height={8} color={pct >= 100 ? "var(--success-solid)" : "var(--action-primary)"} label={`${Math.min(today.questions ?? 0, goalQ)}/${goalQ} questões`} valueLabel={`${missions.done}/${missions.total} missões`} />
          <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{pct >= 100 ? "Dia garantido na sequência." : `Faltam ${Math.max(0, goalQ - (today.questions ?? 0))} questões (ou ${today.min_minutes ?? 20} min) para o dia contar.`}</span>
        </Card>
      </div>
      {explain && <ScoreExplainer summary={summary} onClose={() => setExplain(false)} />}
    </>
  );
}

/** Prévia da trilha: próxima etapa disponível com o botão principal. */
export function TrailPreview({ go, mobile, onStart, busy }) {
  const { backend } = useSession();
  const trail = usePlayLoad(() => backend.rpc("app_trail", { p_area: null }), [backend]);
  if (trail.error) return null;
  if (!trail.data) return <Skeleton height={140} />;
  if (trail.data.enabled === false) return null;
  const areas = trail.data.areas;
  let pick = null;
  for (const a of areas) {
    const n = a.nodes.find((x) => x.state === "in_progress") ?? a.nodes.find((x) => x.state === "available");
    if (n && (!pick || n.state === "in_progress")) pick = { area: a, node: n };
    if (pick?.node.state === "in_progress") break;
  }
  const done = areas.reduce((s, a) => s + a.done, 0);
  const total = areas.reduce((s, a) => s + a.total, 0);
  return (
    <Card style={{ borderRadius: 24 }} padding={mobile ? 18 : 24}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <span className="sm-overline">Trilha de aprendizado</span>
          <h3 style={{ margin: "6px 0 4px", font: "700 20px/1.25 var(--font-sans)" }}>{pick ? `${pick.node.topic}` : "Trilha concluída"}</h3>
          <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            {pick ? `${pick.area.label} · ${pick.node.answered}/${pick.node.goal} questões da etapa · ${done} de ${total} etapas no total` : `${done} de ${total} etapas concluídas.`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {pick && (
            <Button iconRight="arrow-right" loading={busy} onClick={() => onStart(pick.area.area, pick.node.topic)}>
              Continuar estudando
            </Button>
          )}
          <Button variant="secondary" icon="route" onClick={() => go("trilha")}>
            Ver trilha
          </Button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 14 }} aria-hidden="true">
        {areas.map((a) => (
          <span key={a.area} title={a.label} style={{ flex: 1, height: 6, borderRadius: 9, background: "var(--chart-track)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${a.total ? Math.round((100 * a.done) / a.total) : 0}%`, background: "var(--action-primary)" }} />
          </span>
        ))}
      </div>
    </Card>
  );
}

/** Missões do dia · ranking semanal · conquistas (abaixo do estudo, sem poluir). */
export function PlayLower({ summary, mobile, go }) {
  const leaderboard = summary.flags?.leaderboard !== false;
  const leagues = summary.flags?.leagues !== false;
  return (
    <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1.2fr) minmax(0,1fr)", gap: mobile ? 12 : 20, alignItems: "start" }}>
      <Card style={{ borderRadius: 24 }} padding={20}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>Missões de hoje · {summary.missions?.done ?? 0}/{summary.missions?.total ?? 0}</span>
          <Button variant="link" size="sm" iconRight="chevron-right" onClick={() => go("missoes")}>Todas</Button>
        </div>
        <MissionList items={summary.missions?.items ?? []} dense />
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {leaderboard && (
          <Card style={{ borderRadius: 24 }} padding={20}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>Ranking semanal</span>
              <Button variant="link" size="sm" iconRight="chevron-right" onClick={() => go("classificacao")}>Ver classificação completa</Button>
            </div>
            <CurrentUserRank me={summary.weekly_rank} kind="semana" compact />
          </Card>
        )}
        {leagues && summary.league && <LeagueCard league={summary.league} compact onClick={() => go("classificacao")} />}
        <RecentAchievements items={summary.recent_achievements} onSeeAll={() => go("conquistas")} />
      </div>
    </div>
  );
}

/** Hook usado pelo Início: resumo e abertura de etapa da trilha. */
export function usePlayHome(go) {
  const { backend } = useSession();
  const summary = usePlaySummary();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const startNode = async (area, topic) => {
    setBusy(true);
    setError(null);
    try {
      const started = await backend.rpc("app_start_trail_node", { p_area: area, p_topic: topic });
      go("sessao", { s: started.session_id });
    } catch {
      setError("Não foi possível abrir a etapa. Tente de novo.");
      setBusy(false);
    }
  };
  return { summary, startNode, busy, error };
}

export function PlayLoading() {
  return <Skeleton height={120} />;
}

export { PlayError, Icon };
