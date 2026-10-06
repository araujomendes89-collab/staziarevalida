// Feedback de cada resposta: "+17 XP" subindo ao lado do veredito, detalhe do XP, aviso de sequência,
// e os modais curtos de novo nível, medalha e liga. Tudo vem do bloco `play` que o banco devolve.
import React from "react";
import { Button, Icon } from "../../ds";
import { invalidReason, pluralDays, xpLines } from "./format.js";
import "./play.css";

/** "+17 XP" com o detalhe (primeira tentativa +3, difícil +4). Sem XP válido, explica o motivo. */
export function XPToast({ play }) {
  const [open, setOpen] = React.useState(false);
  if (!play) return null;
  const xp = play.xp ?? {};
  const lines = xpLines(xp);
  const bonus = (play.bonus ?? []).reduce((n, b) => n + (b.xp ?? 0), 0);
  if (!xp.valid) {
    return (
      <div role="status" style={{ display: "flex", gap: 8, alignItems: "center", font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>
        <Icon name="info" size={16} />
        {invalidReason(xp.reason)}
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span key={xp.total} className="play-pop" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: "var(--xp-bg)", color: "var(--xp-text)", font: "700 15px var(--font-sans)" }}>
          <Icon name="zap" size={16} /> +{xp.total} XP
        </span>
        {bonus > 0 && (
          <span className="play-fade" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: "var(--success-bg)", color: "var(--success-text)", font: "600 13px var(--font-sans)" }}>
            <Icon name="gift" size={14} /> +{bonus} XP de bônus
          </span>
        )}
        {play.coins > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "600 13px var(--font-sans)", color: "var(--text-secondary)" }}>
            <Icon name="coins" size={14} /> +{play.coins}
          </span>
        )}
        {play.streak_incremented && (
          <span className="play-fade" style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "600 13px var(--font-sans)", color: "var(--streak-text)" }}>
            <span className="play-flame" style={{ display: "inline-flex" }}><Icon name="flame" size={16} /></span> Sequência: {pluralDays(play.stats?.streak ?? 0)}
          </span>
        )}
        {lines.length > 1 && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ border: 0, background: "none", padding: 0, font: "600 12px var(--font-sans)", color: "var(--text-link)", cursor: "pointer" }}>
            {open ? "Ocultar detalhe" : "Ver detalhe"}
          </button>
        )}
      </div>
      {open && (
        <div className="play-fade" style={{ display: "flex", gap: 10, flexWrap: "wrap", font: "var(--type-caption)", color: "var(--text-secondary)" }}>
          {lines.map((l) => (
            <span key={l.label}>
              {l.label} <b style={{ color: "var(--xp-text)" }}>+{l.value}</b>
            </span>
          ))}
          {xp.multiplier != null && Number(xp.multiplier) < 1 && <span>× {xp.multiplier} (questão repetida)</span>}
        </div>
      )}
    </div>
  );
}

function Confetti() {
  const colors = ["var(--teal-400)", "var(--xp)", "var(--league-diamante)", "var(--league-master)"];
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} className="play-confetti" style={{ left: `${(i * 53) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 6) * 80}ms` }} />
      ))}
    </div>
  );
}

function Modal({ title, overline, icon, color, children, onClose, confetti = false, cta = "Continuar" }) {
  React.useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="play-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="play-modal play-pop" onClick={(e) => e.stopPropagation()}>
        {confetti && <Confetti />}
        <span style={{ width: 72, height: 72, borderRadius: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
          <Icon name={icon} size={36} />
        </span>
        <div className="sm-overline" style={{ marginTop: 16, color }}>{overline}</div>
        <h2 style={{ margin: "6px 0 0", font: "var(--type-h2)", letterSpacing: "-0.02em" }}>{title}</h2>
        <div style={{ margin: "10px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{children}</div>
        <div style={{ marginTop: 22 }}>
          <Button onClick={onClose} autoFocus>
            {cta}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function LevelUpModal({ level, onClose }) {
  return (
    <Modal overline="Novo nível" title={level?.name ?? level?.to ?? "Novo nível"} icon={level?.icon ?? "award"} color={level?.color_token ? `var(${level.color_token})` : "var(--text-brand)"} onClose={onClose} confetti>
      {level?.description ?? "Seu Stazia Score subiu de faixa."}
    </Modal>
  );
}

export function AchievementUnlockedModal({ achievement, onClose }) {
  return (
    <Modal overline="Medalha desbloqueada" title={achievement.name} icon={achievement.icon} color="var(--xp)" onClose={onClose} confetti={achievement.rarity === "lendaria" || achievement.rarity === "epica"}>
      {achievement.description}
      <div style={{ marginTop: 8, font: "600 13px var(--font-sans)", color: "var(--xp-text)" }}>
        +{achievement.xp} XP{achievement.coins ? ` · +${achievement.coins} moedas` : ""}
      </div>
    </Modal>
  );
}

export function LeaguePromotionModal({ league, onClose }) {
  return (
    <Modal overline="Você subiu para" title={`Liga ${league.name}`} icon={league.icon ?? "medal"} color={league.color_token ? `var(${league.color_token})` : "var(--league)"} onClose={onClose} confetti>
      Sua semana terminou entre os primeiros do grupo.
    </Modal>
  );
}

/**
 * Fila de modais a partir do bloco `play` de uma resposta: primeiro o nível, depois cada medalha.
 * `levels` (lista do banco) traz nome, ícone e cor do nível.
 */
export function useTurnFeedback() {
  const [queue, setQueue] = React.useState([]);
  const push = React.useCallback((play, levels = []) => {
    if (!play) return;
    const items = [];
    if (play.level_up) items.push({ type: "level", level: levels.find((l) => l.slug === play.level_up.to) ?? play.level_up });
    for (const a of play.achievements_unlocked ?? []) items.push({ type: "achievement", achievement: a });
    if (items.length) setQueue((q) => [...q, ...items]);
  }, []);
  const next = React.useCallback(() => setQueue((q) => q.slice(1)), []);
  const current = queue[0] ?? null;
  const modal = !current ? null : current.type === "level" ? <LevelUpModal level={current.level} onClose={next} /> : <AchievementUnlockedModal achievement={current.achievement} onClose={next} />;
  return { push, modal };
}
