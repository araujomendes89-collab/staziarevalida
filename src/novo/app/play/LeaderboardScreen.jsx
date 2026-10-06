// Classificação (app_leaderboard, app_leaderboard_near_me, app_public_profile) e Liga (app_league_current).
// Nunca carrega o ranking inteiro: 50 por página, posição própria em consulta separada, "perto de mim" por janela.
import React from "react";
import { Badge, Banner, Button, Card, Icon, Tabs } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { endsIn, KIND_LABEL, KINDS, leagueColor, RARITY } from "./format.js";
import { CurrentUserRank, LeaderboardRow, PlayError, Skeleton } from "./components.jsx";
import { usePlayLoad } from "./usePlay.js";
import "./play.css";

function PublicProfile({ profile, onClose }) {
  return (
    <div className="play-overlay" role="dialog" aria-modal="true" aria-label={`Perfil de ${profile.name}`} onClick={onClose}>
      <div className="play-modal play-pop" style={{ textAlign: "left" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span className="sm-avatar" style={{ width: 56, height: 56, fontSize: 22 }} aria-hidden="true">{(profile.avatar ?? profile.name ?? "A").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "700 20px var(--font-sans)" }}>{profile.name}</div>
            <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{profile.level_info?.name} · {profile.provisional ? "score em calibração" : `${profile.score} pts`}{profile.rank ? ` · #${profile.rank} de ${profile.total}` : ""}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 16 }}>
          {[["Questões", profile.questions], ["Acertos", profile.accuracy != null ? `${Math.round(profile.accuracy)}%` : "—"], ["Sequência", profile.streak != null ? `${profile.streak} d` : "—"]].map(([l, v]) => (
            <div key={l} style={{ padding: 12, borderRadius: 14, background: "var(--surface-subtle)" }}>
              <div style={{ font: "500 11px var(--font-sans)", color: "var(--text-tertiary)" }}>{l}</div>
              <div style={{ font: "700 18px var(--font-sans)" }}>{v}</div>
            </div>
          ))}
        </div>
        {profile.achievements?.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="sm-overline" style={{ color: "var(--text-secondary)", marginBottom: 8 }}>Medalhas</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {profile.achievements.slice(0, 12).map((a) => (
                <Badge key={a.slug} size="sm" icon={a.icon} tone={a.rarity === "lendaria" ? "pro" : a.rarity === "epica" ? "ai" : "neutral"}>{a.name}</Badge>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}

export function Leaderboard({ go }) {
  const { backend } = useSession();
  const [kind, setKind] = React.useState("geral");
  const [offset, setOffset] = React.useState(0);
  const [near, setNear] = React.useState(false);
  const [profile, setProfile] = React.useState(null);
  const limit = 50;
  const board = usePlayLoad(() => (near ? backend.rpc("app_leaderboard_near_me", { p_kind: kind, p_radius: 5 }) : backend.rpc("app_leaderboard", { p_kind: kind, p_offset: offset, p_limit: limit })), [backend, kind, offset, near]);
  const open = async (row) => {
    if (row.is_me) return go("perfil");
    try {
      const p = await backend.rpc("app_public_profile", { p_public_id: row.public_id });
      if (p) setProfile(p);
    } catch {
      /* perfil indisponível */
    }
  };
  const change = (k) => {
    setKind(k);
    setOffset(0);
    setNear(false);
  };
  const data = board.data;
  const hasMe = Boolean(data?.me);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ overflowX: "auto" }}>
        <Tabs label="Tipo de ranking" value={kind} onChange={change} tabs={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      </div>
      {board.error && <PlayError retry={board.reload} />}
      {!data && !board.error && <Skeleton height={320} />}
      {data && data.enabled === false && <Banner tone="info">A classificação está desligada no momento.</Banner>}
      {data && data.enabled !== false && (
        <>
          <CurrentUserRank me={data.me} kind={kind} />
          {kind === "precisao" && <p style={{ margin: 0, font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Entra quem tem pelo menos 200 questões válidas.</p>}
          {kind === "evolucao" && <p style={{ margin: 0, font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Precisão dos últimos 14 dias contra os 14 anteriores, com no mínimo 20 questões em cada janela.</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {hasMe && (
              <Button size="sm" variant={near ? "primary" : "secondary"} icon="locate" onClick={() => setNear((v) => !v)} aria-pressed={near}>
                {near ? "Ver o topo" : "Ver perto de mim"}
              </Button>
            )}
            <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{near ? "Alunos ao seu redor" : `${Number(data.total ?? 0).toLocaleString("pt-BR")} alunos`}</span>
          </div>
          <Card style={{ borderRadius: 24 }} padding={8}>
            {data.rows.length === 0 ? (
              <p style={{ margin: 0, padding: 20, font: "var(--type-body-sm)", color: "var(--text-tertiary)", textAlign: "center" }}>Ninguém neste ranking ainda. Responda questões para aparecer aqui.</p>
            ) : (
              data.rows.map((row) => <LeaderboardRow key={row.public_id ?? row.rank} row={row} kind={kind} onOpen={open} />)
            )}
          </Card>
          {!near && data.total > limit && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}>
              <Button size="sm" variant="secondary" icon="chevron-left" disabled={offset === 0 || board.loading} onClick={() => setOffset(Math.max(0, offset - limit))}>Anteriores</Button>
              <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{offset + 1}–{Math.min(offset + limit, data.total)}</span>
              <Button size="sm" variant="secondary" iconRight="chevron-right" disabled={offset + limit >= data.total || board.loading} onClick={() => setOffset(offset + limit)}>Próximos</Button>
            </div>
          )}
        </>
      )}
      {profile && <PublicProfile profile={profile} onClose={() => setProfile(null)} />}
    </div>
  );
}

export function LeagueView() {
  const { backend } = useSession();
  const mobile = useMobile();
  const league = usePlayLoad(() => backend.rpc("app_league_current"), [backend]);
  const d = league.data;
  if (league.error) return <PlayError retry={league.reload} />;
  if (!d) return <Skeleton height={320} />;
  if (d.enabled === false) return <Banner tone="info">As ligas estão desligadas no momento.</Banner>;
  if (!d.joined) {
    return (
      <Card style={{ borderRadius: 24 }} padding={28}>
        <h3 style={{ margin: 0, font: "var(--type-h3)" }}>Você entra na liga com o primeiro XP da semana</h3>
        <p style={{ margin: "8px 0 16px", color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>Grupos de até 30 alunos ativos. Os 5 primeiros sobem, os 5 últimos descem. A semana fecha na segunda-feira.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(d.leagues ?? []).map((l) => (
            <Badge key={l.slug} icon={l.icon} style={{ color: leagueColor(l) }}>{l.name}</Badge>
          ))}
        </div>
      </Card>
    );
  }
  const color = leagueColor(d.league);
  const n = d.rows.length;
  const relegationFrom = n >= d.min_group_for_relegation ? n - d.relegate + 1 : Infinity;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card style={{ borderRadius: 24, background: `color-mix(in oklab, ${color} 10%, var(--surface-card))` }} padding={mobile ? 20 : 28}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ width: 64, height: 64, borderRadius: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `color-mix(in oklab, ${color} 22%, transparent)`, color }}>
            <Icon name={d.league.icon} size={34} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="sm-overline" style={{ color }}>Liga {d.league.name}</span>
            <h2 style={{ margin: "4px 0 0", font: "700 24px/1.2 var(--font-sans)", letterSpacing: "-0.015em" }}>Grupo {d.group_no} · termina em {endsIn(d.season.ends_on)}</h2>
            <p style={{ margin: "4px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Top {d.promote} sobem{relegationFrom !== Infinity ? ` · do ${relegationFrom}º para baixo descem` : " · grupo pequeno: ninguém desce esta semana"}.</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
          {d.leagues.map((l) => (
            <span key={l.slug} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 999, font: "600 12px var(--font-sans)", background: l.slug === d.league.slug ? leagueColor(l) : "var(--surface-sunken)", color: l.slug === d.league.slug ? "#fff" : "var(--text-tertiary)" }}>
              <Icon name={l.icon} size={12} /> {l.name}
            </span>
          ))}
        </div>
      </Card>
      <Card style={{ borderRadius: 24 }} padding={8}>
        {d.rows.map((row, i) => (
          <React.Fragment key={row.public_id ?? i}>
            {i === d.promote && n > d.promote && <div style={{ margin: "4px 12px", font: "700 11px var(--font-sans)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--success-text)", borderTop: "1px dashed var(--success-border)", paddingTop: 6 }}>▲ Promoção</div>}
            {row.position === relegationFrom && <div style={{ margin: "4px 12px", font: "700 11px var(--font-sans)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--danger-text)", borderTop: "1px dashed var(--danger-border)", paddingTop: 6 }}>▼ Rebaixamento</div>}
            <LeaderboardRow row={{ ...row, value: row.weekly_xp }} kind="semana" position={row.position} />
          </React.Fragment>
        ))}
      </Card>
      {d.history?.length > 0 && (
        <Card style={{ borderRadius: 24 }} padding={20}>
          <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>Semanas anteriores</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {d.history.slice(0, 8).map((h) => (
              <div key={h.starts_on} style={{ display: "flex", gap: 10, font: "var(--type-body-sm)" }}>
                <span style={{ color: "var(--text-tertiary)", width: 90 }}>{new Date(h.starts_on).toLocaleDateString("pt-BR")}</span>
                <span style={{ flex: 1, textTransform: "capitalize" }}>{h.league.replace("_", " ")} · #{h.position}</span>
                <Badge size="sm" tone={h.outcome === "promoted" ? "success" : h.outcome === "relegated" ? "danger" : "neutral"}>{{ promoted: "Subiu", relegated: "Desceu", stayed: "Manteve" }[h.outcome] ?? "—"}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export function LeaderboardScreen({ go }) {
  const { boot } = useSession();
  const [tab, setTab] = React.useState("ranking");
  if (boot?.play?.enabled === false) return <Banner tone="info">A classificação faz parte do Stazia Play, que está desligado no momento.</Banner>;
  const leagues = boot?.play?.flags?.leagues !== false;
  return (
    <>
      {leagues && <Tabs label="Classificação" value={tab} onChange={setTab} tabs={[{ value: "ranking", label: "Ranking", icon: "trophy" }, { value: "liga", label: "Liga da semana", icon: "medal" }]} />}
      {tab === "ranking" ? <Leaderboard go={go} /> : <LeagueView />}
    </>
  );
}

export { RARITY };
