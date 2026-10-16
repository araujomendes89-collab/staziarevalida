// Cabeçalho da tela de questão (modelo "Tela de Questão"): logo, rótulo, progresso, cronômetro e ações.
//  - simulado: rótulo "Simulado Revalida · área", cronômetro com anel (se há prazo), "Nesta questão", pausa e "Encerrar";
//  - treino: o mesmo cabeçalho, sem pausa nem "Encerrar" (o treino não tem prazo): rótulo "Treino · área", "Respondendo" e "Nesta questão".
// Só mostra o que a sessão tem: sem prazo, não há anel nem "Restante".
import React from "react";
import { Icon } from "../../../ds";
import { formatClock } from "../format.js";
import "./tela-questao.css";

const RING = 106.81; // 2 * pi * 17

/** Nível do cronômetro regressivo: ok · warn (reta final) · critical (últimos 2 min) · over (esgotado). */
export function timerLevel(left, total) {
  if (left == null || total == null) return "ok";
  if (left <= 0) return "over";
  if (left <= 120) return "critical";
  if (left <= Math.max(300, total * 0.15)) return "warn";
  return "ok";
}

// Pausar/continuar do pacote: formas cheias (o Lucide só tem o contorno).
function PauseGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="14" y="4" width="4" height="16" rx="1" />
      <rect x="6" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
function PlayGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <polygon points="7 4 20 12 7 20 7 4" />
    </svg>
  );
}

export function BrandLogo() {
  return (
    <>
      <img className="tq-logo tq-logo--sym tq-logo--light" src="/brand/simbolo-96w.png" alt="" aria-hidden="true" />
      <img className="tq-logo tq-logo--sym tq-logo--dark" src="/brand/simbolo-escuro-96w.png" alt="" aria-hidden="true" />
      <img className="tq-logo tq-logo--light" src="/brand/horizontal-480w.png" alt="StaziaMed Revalida" />
      <img className="tq-logo tq-logo--dark" src="/brand/horizontal-escuro-480w.png" alt="" aria-hidden="true" />
    </>
  );
}

/**
 * segments: lista de estados ("current" | "done" | "right" | "wrong" | "open") ou null para a barra contínua (sessões longas).
 * timer: { mainLabel, mainValue (segundos), level, fraction (0..1 ou null), paused, questionSeconds, aria }
 */
export function QuestionHeader({ label, index, total, segments, progress = 0, timer, onExit, exitLabel = "Sair", pause = null, onEnd = null, endDisabled = false, xp = 0 }) {
  const offset = timer.fraction == null ? 0 : RING * (1 - Math.max(0, Math.min(1, timer.fraction)));
  return (
    <header className="tq-head">
      <div className="tq-head__in">
        <div className="tq-brand">
          <button type="button" className="tq-exit" onClick={onExit} aria-label={exitLabel} title={exitLabel}>
            <Icon name="x" size={20} />
          </button>
          <BrandLogo />
        </div>
        <div className="tq-prog">
          <div className="tq-prog__top">
            <span className="tq-prog__label">{label}</span>
            <span className="tq-prog__count tq-mono">
              {index + 1} / {total}
            </span>
          </div>
          {segments ? (
            <div role="img" aria-label={`Progresso: questão ${index + 1} de ${total}`} className="tq-seg" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
              {segments.map((s, k) => (
                <span key={k} className="tq-seg__i" data-s={s} />
              ))}
            </div>
          ) : (
            <div role="img" aria-label={`Progresso: ${Math.round(progress)}% respondido, questão ${index + 1} de ${total}`} className="tq-bar">
              <span style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
        <div className="tq-tools">
          {xp > 0 && (
            <span className="tq-xp" title="XP ganho nesta sessão">
              <Icon name="zap" size={16} />
              <span className="tq-mono">+{xp}</span>
            </span>
          )}
          <div role="timer" aria-label={timer.aria} className="tq-timer" data-level={timer.level} data-paused={timer.paused ? "true" : "false"}>
            <div className="tq-ring">
              <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
                <circle cx="22" cy="22" r="17" fill="none" stroke="var(--border-default)" strokeWidth="4" />
                {timer.fraction != null && (
                  <circle cx="22" cy="22" r="17" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset .32s ease" }} />
                )}
              </svg>
              <svg className="tq-ring__ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2 2" />
                <path d="M10 2h4" />
              </svg>
            </div>
            <div className="tq-timer__col tq-timer__col--main">
              <span className="tq-timer__lab">{timer.mainLabel}</span>
              <span className="tq-timer__val">{formatClock(timer.mainValue)}</span>
            </div>
            <span className="tq-timer__sep tq-timer__q-wrap" aria-hidden="true" />
            <div className="tq-timer__col tq-timer__q-wrap">
              <span className="tq-timer__lab">Nesta questão</span>
              <span className="tq-timer__q">{formatClock(timer.questionSeconds)}</span>
            </div>
            {pause && (
              <button type="button" className="tq-round" onClick={pause.onToggle} disabled={pause.disabled} aria-label={pause.paused ? "Continuar o simulado" : "Pausar o simulado"} title={pause.paused ? "Continuar o simulado" : "Pausar o simulado"}>
                {pause.paused ? <PlayGlyph /> : <PauseGlyph />}
              </button>
            )}
          </div>
          {onEnd && (
            <button type="button" className="tq-ghost tq-end" onClick={onEnd} disabled={endDisabled} aria-label="Encerrar o simulado" title="Encerrar o simulado">
              {/* no celular fica só o ícone (o nome continua no aria-label); no tablet e no computador, só a palavra */}
              <Icon name="circle-stop" size={20} className="tq-end__ico" />
              <span className="tq-end__t">Encerrar</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
