// Peças do Stazia Play reutilizadas pelo Início, Trilha, Classificação, Missões, Conquistas e Conta.
// Só componentes do design system e tokens (--xp, --streak, --league-*, --level-*); nada de cor solta.
import React from "react";
import { Avatar, Badge, Button, Card, Icon, ProgressBar } from "../../ds";
import { gapText, leagueColor, levelColor, levelProgress, movementText, pluralDays, RARITY, topLabel } from "./format.js";
import "./play.css";

export function Skeleton({ height = 96, style }) {
  return <div aria-hidden="true" style={{ height, borderRadius: 20, background: "var(--surface-sunken)", ...style }} />;
}

export function PlayError({ retry, children = "Não foi possível carregar a Stazia Arena." }) {
  return (
    <Card variant="subtle" padding={16} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <Icon name="cloud-off" size={18} style={{ color: "var(--text-tertiary)" }} />
      <span style={{ flex: 1, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{children}</span>
      {retry && (
        <Button size="sm" variant="secondary" onClick={retry}>
          Tentar de novo
        </Button>
      )}
    </Card>
  );
}

/** Stazia Score com nível, faixa e percentil. `compact` para o topo do Início. */
export function StaziaScoreCard({ summary, compact = false, onExplain, onClick }) {
  const level = summary.level;
  const color = levelColor(level);
  const pct = levelProgress(summary.score, level, summary.next_level);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={`sm-card${onClick ? " sm-card--interactive" : ""}`} style={{ borderRadius: 24, padding: compact ? 18 : 24, textAlign: "left", font: "inherit", color: "inherit", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>{summary.names?.score ?? "Stazia Score"}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "700 12px var(--font-sans)", color, textTransform: "uppercase", letterSpacing: ".06em" }}>
          <Icon name={level?.icon ?? "sprout"} size={14} /> {level?.name}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ font: `700 ${compact ? 32 : 40}px/1 var(--font-sans)`, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{summary.score}</span>
        <span style={{ font: "500 14px var(--font-sans)", color: "var(--text-tertiary)" }}>/ 1000</span>
        {summary.provisional ? (
          <Badge tone="warning" size="sm" icon="loader">Em calibração</Badge>
        ) : (
          summary.rank?.percentile != null && <Badge tone="brand" size="sm">{topLabel(summary.rank.percentile)}</Badge>
        )}
      </div>
      <ProgressBar value={pct} max={100} height={6} color={color} label={summary.next_level ? `Próximo nível: ${summary.next_level.name} a partir de ${summary.next_level.min_score}` : "Nível máximo"} valueLabel={summary.next_level ? `${Math.max(0, summary.next_level.min_score - summary.score)} pts` : ""} />
      {summary.provisional && !compact && (
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          Responda {Math.max(0, summary.score_min_questions - summary.questions)} questões válidas a mais para o score sair da calibração e entrar no ranking.
        </span>
      )}
      {onExplain && !compact && (
        <Button variant="link" size="sm" iconRight="chevron-right" onClick={(e) => (e.stopPropagation(), onExplain())}>
          Como meu {summary.names?.score ?? "Stazia Score"} é calculado?
        </Button>
      )}
    </Tag>
  );
}

const COMPONENT_LABEL = {
  performance: ["Desempenho", "Acertos nos últimos 90 dias, com peso maior conforme a amostra cresce."],
  difficulty: ["Dificuldade", "Quão difíceis são as questões que você resolve."],
  consistency: ["Consistência", "Dias de estudo nas últimas 4 semanas."],
  coverage: ["Cobertura", "Quantos temas diferentes você já estudou."],
  evolution: ["Evolução", "Sua precisão nos últimos 14 dias contra os 14 anteriores."],
  review: ["Revisão", "Quantos erros você já superou."],
};
export function ScoreExplainer({ summary, onClose }) {
  const c = summary.components ?? {};
  return (
    <div className="play-overlay" role="dialog" aria-modal="true" aria-label="Como o score é calculado" onClick={onClose}>
      <div className="play-modal play-pop" style={{ textAlign: "left", maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0, font: "var(--type-h3)" }}>Como meu {summary.names?.score ?? "Stazia Score"} é calculado?</h2>
        <p style={{ margin: "8px 0 16px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          Mede qualidade, não volume: 40% desempenho, 20% dificuldade, 15% consistência, 10% cobertura, 10% evolução e 5% revisão. O índice fica em calibração até {summary.score_min_questions} questões válidas e nunca dá saltos bruscos.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Object.entries(COMPONENT_LABEL).map(([key, [label, hint]]) => (
            <ProgressBar key={key} value={Math.round((Number(c[key]) || 0) * 100)} max={100} height={6} label={label} valueLabel={`${Math.round((Number(c[key]) || 0) * 100)}%`} color="var(--chart-1)" />
          ))}
        </div>
        <p style={{ margin: "16px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{Object.values(COMPONENT_LABEL).map(([l, h]) => `${l}: ${h}`).join(" ")}</p>
        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={onClose}>Entendi</Button>
        </div>
      </div>
    </div>
  );
}

/** Sequência de dias com o progresso de hoje e as proteções. */
export function StreakCard({ streak, compact = false, onClick }) {
  const today = streak.today ?? {};
  const done = streak.today_done;
  const q = Math.min(today.questions ?? 0, today.min_questions ?? 10);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={`sm-card${onClick ? " sm-card--interactive" : ""}`} style={{ borderRadius: 24, padding: compact ? 18 : 24, textAlign: "left", font: "inherit", color: "inherit", display: "flex", flexDirection: "column", gap: 10, minWidth: 0, background: "var(--streak-bg)", borderColor: "transparent" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className={done ? "play-flame" : undefined} style={{ color: done ? "var(--streak)" : "var(--text-tertiary)", display: "inline-flex" }}>
          <Icon name="flame" size={compact ? 24 : 28} />
        </span>
        <span style={{ font: `700 ${compact ? 26 : 32}px/1 var(--font-sans)`, letterSpacing: "-0.02em", color: "var(--streak-text)", fontVariantNumeric: "tabular-nums" }}>{pluralDays(streak.current)}</span>
        {streak.freezes > 0 && (
          <Badge tone="info" size="sm" icon="snowflake">{streak.freezes}</Badge>
        )}
      </div>
      <span style={{ font: "600 13px var(--font-sans)", color: "var(--streak-text)" }}>
        {done ? "Hoje já contou. Sequência protegida!" : `Hoje: ${q} de ${today.min_questions ?? 10} questões (ou ${today.min_minutes ?? 20} min de estudo)`}
      </span>
      {!compact && (
        <ProgressBar value={done ? 100 : Math.round((100 * q) / (today.min_questions || 10))} max={100} height={5} color="var(--streak)" />
      )}
      {!compact && streak.longest > streak.current && (
        <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Seu recorde: {pluralDays(streak.longest)}</span>
      )}
    </Tag>
  );
}

/** Lista compacta de missões com barra e recompensa. */
export function MissionList({ items, bonus, dense = false }) {
  if (!items?.length) return <p style={{ margin: 0, color: "var(--text-tertiary)", font: "var(--type-body-sm)" }}>Nenhuma missão por enquanto.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: dense ? 8 : 12 }}>
      {items.map((m) => (
        <div key={m.slug} className="play-fade" style={{ display: "flex", gap: 12, alignItems: "center", padding: dense ? "10px 12px" : "14px 16px", borderRadius: 16, background: m.done ? "var(--success-bg)" : "var(--surface-card)", border: `1px solid ${m.done ? "var(--success-border)" : "var(--border-subtle)"}` }}>
          <span style={{ width: 36, height: 36, borderRadius: 12, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: m.done ? "var(--success-solid)" : "var(--surface-sunken)", color: m.done ? "#fff" : "var(--text-secondary)" }} className={m.done ? "play-pop" : undefined}>
            <Icon name={m.done ? "check" : m.icon || "target"} size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, font: "600 14px var(--font-sans)" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</span>
              <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", flex: "none" }}>{m.done ? "Concluída" : `${m.progress}/${m.target}`}</span>
            </div>
            <div className="sm-progress" style={{ height: 5, marginTop: 6 }} role="progressbar" aria-valuenow={m.progress} aria-valuemin={0} aria-valuemax={m.target} aria-label={m.title}>
              <div className="sm-progress__fill play-bar-fill" style={{ width: `${Math.min(100, Math.round((100 * m.progress) / Math.max(1, m.target)))}%`, background: m.done ? "var(--success-solid)" : "var(--chart-1)" }} />
            </div>
          </div>
          <span style={{ flex: "none", font: "700 12px var(--font-sans)", color: "var(--xp-text)", whiteSpace: "nowrap" }}>+{m.xp} XP{m.coins ? ` · ${m.coins}` : ""}</span>
        </div>
      ))}
      {bonus && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, font: "600 13px var(--font-sans)", color: bonus.done ? "var(--success-text)" : "var(--text-secondary)", padding: "0 4px" }}>
          <span>{bonus.done ? "Bônus do dia garantido" : "Complete todas"}</span>
          <span style={{ color: "var(--xp-text)" }}>+{bonus.xp} XP · +{bonus.coins} moedas</span>
        </div>
      )}
    </div>
  );
}

/** Liga atual, posição no grupo e tempo restante. */
export function LeagueCard({ league, compact = false, onClick }) {
  if (!league) return null;
  const color = leagueColor(league);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={`sm-card${onClick ? " sm-card--interactive" : ""}`} style={{ borderRadius: 24, padding: compact ? 18 : 24, textAlign: "left", font: "inherit", color: "inherit", display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
      <span style={{ width: 48, height: 48, borderRadius: 16, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}>
        <Icon name={league.icon || "medal"} size={26} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "500 12px var(--font-sans)", color: "var(--text-tertiary)" }}>Liga {league.name}</div>
        <div style={{ font: `700 ${compact ? 20 : 24}px/1.1 var(--font-sans)`, letterSpacing: "-0.01em" }}>#{league.position}</div>
        <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{league.weekly_xp} XP · {league.group_size} no grupo</div>
      </div>
    </Tag>
  );
}

/** Setinha de movimento no ranking (↑ 34 posições). */
export function RankMovementIndicator({ change }) {
  const text = movementText(change);
  if (!text) return null;
  const tone = change > 0 ? "var(--success-text)" : change < 0 ? "var(--danger-text)" : "var(--text-tertiary)";
  return <span style={{ font: "600 13px var(--font-sans)", color: tone }}>{text}</span>;
}

export function PercentileBadge({ percentile }) {
  const label = topLabel(percentile);
  return label ? <Badge tone="brand">{label}</Badge> : null;
}

/** Posição própria: #437 de 18.492, TOP, movimento e distância para os próximos. */
export function CurrentUserRank({ me, kind = "geral", compact = false }) {
  if (!me) {
    return (
      <Card variant="subtle" padding={compact ? 14 : 20}>
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Você ainda não aparece neste ranking.</span>
      </Card>
    );
  }
  return (
    <Card variant="brand" padding={compact ? 14 : 20} style={{ borderRadius: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ font: "500 12px var(--font-sans)", color: "var(--text-tertiary)" }}>Sua posição</div>
          <div style={{ font: `700 ${compact ? 24 : 30}px/1.1 var(--font-sans)`, letterSpacing: "-0.02em" }}>
            #{me.rank} <span style={{ font: "500 14px var(--font-sans)", color: "var(--text-secondary)" }}>de {Number(me.total).toLocaleString("pt-BR")}</span>
          </div>
        </div>
        <PercentileBadge percentile={me.percentile} />
        <RankMovementIndicator change={me.week_change} />
      </div>
      {!compact && me.next?.length > 0 && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          {me.next.map((n) => (
            <span key={n.rank}>{gapText(n, kind)}</span>
          ))}
        </div>
      )}
    </Card>
  );
}

const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };
/** Uma linha do ranking (lista responsiva, nunca tabela larga). */
export function LeaderboardRow({ row, kind = "geral", onOpen, position }) {
  const rank = position ?? row.rank;
  const value = kind === "precisao" ? `${Math.round(Number(row.value))}%` : kind === "evolucao" ? `${Number(row.value) > 0 ? "+" : ""}${Number(row.value)} pts` : kind === "streak" ? pluralDays(Number(row.value)) : kind === "geral" ? row.value : `${Number(row.value).toLocaleString("pt-BR")} XP`;
  const frameColor = row.frame === "gold" ? "var(--league-ouro)" : row.frame === "teal" ? "var(--teal-500)" : null;
  return (
    <button
      type="button"
      onClick={() => onOpen?.(row)}
      aria-current={row.is_me ? "true" : undefined}
      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 12px", border: 0, borderRadius: 14, background: row.is_me ? "var(--selected-bg)" : "transparent", font: "inherit", color: "inherit", textAlign: "left", cursor: onOpen ? "pointer" : "default" }}
    >
      <span style={{ width: 32, flex: "none", textAlign: "center", font: "700 14px var(--font-mono)", color: rank <= 3 ? "var(--text-primary)" : "var(--text-tertiary)" }}>{MEDAL[rank] ?? rank}</span>
      <span style={{ flex: "none", borderRadius: "50%", padding: frameColor ? 2 : 0, boxShadow: frameColor ? `0 0 0 2px ${frameColor}` : "none" }}>
        <Avatar name={row.avatar ?? "A"} size={34} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", font: `${row.is_me ? 700 : 600} 14px var(--font-sans)`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.is_me ? "Você" : row.name}</span>
        <span style={{ display: "flex", gap: 8, font: "var(--type-caption)", color: "var(--text-tertiary)", flexWrap: "wrap" }}>
          {row.level && <span style={{ textTransform: "capitalize" }}>{row.level}</span>}
          {row.accuracy != null && <span>{Math.round(Number(row.accuracy))}% acertos</span>}
          {row.streak != null && row.streak > 0 && <span style={{ color: "var(--streak-text)" }}>🔥 {row.streak}</span>}
        </span>
      </span>
      <span style={{ flex: "none", font: "700 15px var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </button>
  );
}

/** Medalha: desbloqueada em destaque, bloqueada discreta. */
export function AchievementCard({ item, onClick }) {
  const unlocked = Boolean(item.unlocked_at);
  const rarityTone = { comum: "neutral", rara: "info", epica: "ai", lendaria: "pro" }[item.rarity] ?? "neutral";
  return (
    <button type="button" onClick={onClick} className="sm-card sm-card--interactive" style={{ borderRadius: 20, padding: 16, textAlign: "left", font: "inherit", color: "inherit", display: "flex", flexDirection: "column", gap: 10, opacity: unlocked ? 1 : 0.72, minWidth: 0 }} aria-label={`${item.name}${unlocked ? ", desbloqueada" : ", bloqueada"}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ width: 44, height: 44, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", background: unlocked ? "var(--xp-bg)" : "var(--locked-bg)", color: unlocked ? "var(--xp-text)" : "var(--locked)" }}>
          <Icon name={unlocked ? item.icon : item.secret ? "lock" : item.icon} size={22} />
        </span>
        <Badge tone={rarityTone} size="sm">{RARITY[item.rarity] ?? item.rarity}</Badge>
      </div>
      <div style={{ font: "600 14px var(--font-sans)" }}>{item.name}</div>
      <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{item.description}</div>
      <div style={{ font: "600 12px var(--font-sans)", color: unlocked ? "var(--success-text)" : "var(--xp-text)" }}>
        {unlocked ? `Desbloqueada em ${new Date(item.unlocked_at).toLocaleDateString("pt-BR")}` : `+${item.xp} XP${item.coins ? ` · ${item.coins} moedas` : ""}`}
      </div>
    </button>
  );
}

/** Lista de conquistas recentes (até 3) para o Início e a Conta. */
export function RecentAchievements({ items, onSeeAll }) {
  return (
    <Card style={{ borderRadius: 24 }} padding={20}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>Conquistas recentes</span>
        {onSeeAll && (
          <Button variant="link" size="sm" iconRight="chevron-right" onClick={onSeeAll}>
            Ver todas
          </Button>
        )}
      </div>
      {items?.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((a) => (
            <div key={a.slug} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ width: 32, height: 32, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--xp-bg)", color: "var(--xp-text)" }}>
                <Icon name={a.icon} size={16} />
              </span>
              <span style={{ font: "600 14px var(--font-sans)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
              <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{new Date(a.unlocked_at).toLocaleDateString("pt-BR")}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Suas medalhas aparecem aqui. A primeira vem com 10 questões.</p>
      )}
    </Card>
  );
}

/** Gráfico simples da evolução do score (SVG, sem dependência nova). */
export function ScoreChart({ points, height = 120 }) {
  if (!points?.length) return <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>O histórico começa a ser gravado a cada dia de uso.</p>;
  const W = 600;
  const H = height;
  const scores = points.map((p) => p.score);
  const min = Math.max(0, Math.min(...scores) - 20);
  const max = Math.min(1000, Math.max(...scores) + 20);
  const x = (i) => (points.length === 1 ? W / 2 : (i * W) / (points.length - 1));
  const y = (v) => H - ((v - min) / Math.max(1, max - min)) * (H - 16) - 8;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} width="100%" height={H + 20} role="img" aria-label={`Stazia Score: ${first.score} em ${first.day} e ${last.score} em ${last.day}`} style={{ display: "block" }}>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill="color-mix(in oklab, var(--chart-1) 14%, transparent)" />
      <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(last.score)} r={5} fill="var(--chart-1)" />
      <text x={0} y={H + 16} style={{ font: "11px var(--font-sans)", fill: "var(--text-tertiary)" }}>{new Date(first.day).toLocaleDateString("pt-BR")}</text>
      <text x={W} y={H + 16} textAnchor="end" style={{ font: "11px var(--font-sans)", fill: "var(--text-tertiary)" }}>{new Date(last.day).toLocaleDateString("pt-BR")}</text>
    </svg>
  );
}
