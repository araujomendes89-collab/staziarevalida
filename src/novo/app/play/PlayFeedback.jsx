// Feedback de cada resposta: "+17 XP" subindo ao lado do veredito, detalhe do XP e aviso de sequência.
// As comemorações (sequência, nível, medalha, missão, meta do dia, acerto/erro) agora são as do Stazi
// (play/celebracoes, sistema do Motion Studio), que substituíram a animação antiga (Celebration.jsx) e os modais curtos.
// Tudo vem do bloco `play` que o banco devolve.
import React from "react";
import { Icon } from "../../ds";
import { invalidReason, pluralDays, xpLines } from "./format.js";
import { useCelebracoesApp } from "./celebracoes/CelebracoesProvider.jsx";
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

/**
 * Comemorações de uma resposta: entrega o bloco `play` (e se acertou) ao provedor das comemorações do Stazi, que decide
 * o que mostrar e quando (durante o treino só a faixa pequena; o resto no fim). `modal` ficou só por compatibilidade:
 * a comemoração é desenhada pelo provedor, acima de todas as telas.
 */
export function useTurnFeedback() {
  const { enviarResposta } = useCelebracoesApp();
  const push = React.useCallback((play, opcoes) => enviarResposta(play, Array.isArray(opcoes) ? {} : opcoes ?? {}), [enviarResposta]);
  return { push, modal: null };
}
