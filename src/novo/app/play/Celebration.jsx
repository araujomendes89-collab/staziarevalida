// Animação de conquista da Stazia Arena (pedido de 2026-10-06: o estilo do vídeo "Daily streak animation" para quando o aluno
// tem uma conquista). Mesma sequência do vídeo, com as cores e a ilustração do StaziaMed:
//   1. o ícone aparece apagado (cinza) com o número anterior;
//   2. acende (estica e encolhe, ganha cor) e a tela inunda com a cor da conquista a partir dele;
//   3. explode em faíscas, com raios girando atrás;
//   4. o número conta (sequência N-1 → N, ou o XP da medalha);
//   5. o conteúdo sobe e entram o rótulo, os detalhes (semana da sequência marcando dia a dia, descrição da medalha)
//   6. e os botões.
// Feito com Motion (motion/react). Tocar durante a animação pula para o fim; Esc ou "Continuar" fecham. Quem pede menos
// movimento no sistema (prefers-reduced-motion) vê direto o estado final. Os dados vêm do bloco `play` que o banco devolve.
import React from "react";
import { AnimatePresence, animate, motion, useReducedMotion, useReducedMotionConfig } from "motion/react";
import { Icon } from "../../ds";
import { useSession } from "../session.jsx";
import "./celebration.css";

const DAY_LABEL = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
// tempos de cada fase (ms desde a abertura), como no vídeo de referência
const TIMELINE = [0, 450, 850, 1050, 1650, 2150, 2550, 3300];
const PHASE = { pre: 0, ignite: 1, flood: 2, burst: 3, count: 4, rise: 5, details: 6, cta: 7 };

/** Cores da conquista (variáveis CSS do próprio overlay). Sequência: laranja; medalha: âmbar; nível e liga: a cor deles. */
function themeOf(item) {
  // tons um pouco mais fundos que os do app para o texto branco ficar legível
  if (item.type === "streak") return { from: "#FF8F45", to: "var(--orange-500)", deep: "#B9480C", accent: "#FFE08A" };
  if (item.type === "achievement") return { from: "#EDB447", to: "#C98306", deep: "#8C5605", accent: "#FFF3C4" };
  const c = item.color || "var(--teal-500)";
  return { from: `color-mix(in oklab, ${c} 70%, white)`, to: c, deep: `color-mix(in oklab, ${c} 70%, black)`, accent: "#FFFFFF" };
}

// ---------------------------------------------------------------- ilustrações (no estilo dos ícones ilustrados do app)
function Flame({ lit }) {
  return (
    <svg viewBox="0 0 120 140" width="100%" height="100%" aria-hidden="true" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="cel-flame-o" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFD25A" />
          <stop offset=".55" stopColor="#FF8A3D" />
          <stop offset="1" stopColor="#E5531A" />
        </linearGradient>
        <linearGradient id="cel-flame-i" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF7CC" />
          <stop offset="1" stopColor="#FFC24A" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="131" rx="30" ry="5.5" fill="rgba(0,0,0,.16)" />
      <g style={{ filter: lit ? "none" : "grayscale(1) brightness(1.18)", opacity: lit ? 1 : 0.55, transition: "filter .35s ease, opacity .35s ease" }}>
        <path d="M60 4c6 20 31 33 35 64 4 31-14 59-35 59S21 110 23 82c2-20 14-28 18-42 6 12 9 18 14 20-1-20 1-38 5-56Z" fill="url(#cel-flame-o)" />
        <path d="M60 60c4 14 20 22 20 39 0 14-9 22-20 22s-20-8-20-21c0-11 8-17 12-25 3 6 5 8 7 9-1-9-1-17 1-24Z" fill="url(#cel-flame-i)" />
        <path d="M43 47c-5 12-12 21-12 38" stroke="rgba(255,255,255,.6)" strokeWidth="5" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

function Medal({ icon, lit }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg viewBox="0 0 140 150" width="100%" height="100%" aria-hidden="true" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="cel-medal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity=".95" />
            <stop offset=".45" stopColor="var(--cel-accent)" />
            <stop offset="1" stopColor="var(--cel-to)" />
          </linearGradient>
        </defs>
        <ellipse cx="70" cy="144" rx="34" ry="5" fill="rgba(0,0,0,.16)" />
        <g style={{ filter: lit ? "none" : "grayscale(1) brightness(1.15)", opacity: lit ? 1 : 0.55, transition: "filter .35s ease, opacity .35s ease" }}>
          <path d="M40 4h22l14 44H54Z" fill="var(--cel-deep)" />
          <path d="M100 4H78L64 48h22Z" fill="color-mix(in oklab, var(--cel-deep) 80%, white)" />
          <circle cx="70" cy="92" r="48" fill="url(#cel-medal)" stroke="rgba(255,255,255,.85)" strokeWidth="4" />
          <circle cx="70" cy="92" r="36" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2" strokeDasharray="3 5" />
          <path d="M38 76a36 36 0 0 1 22-24" stroke="rgba(255,255,255,.75)" strokeWidth="5" strokeLinecap="round" fill="none" />
        </g>
      </svg>
      <span style={{ position: "absolute", left: "50%", top: "61%", transform: "translate(-50%,-50%)", color: lit ? "var(--cel-deep)" : "#9AA3B2", transition: "color .35s ease", display: "inline-flex" }}>
        <Icon name={icon || "award"} size={52} />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- efeitos
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2 + (i % 2 ? 0.17 : -0.11);
  const dist = 110 + ((i * 37) % 90);
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, size: 6 + ((i * 13) % 9), star: i % 3 === 0, delay: (i % 5) * 0.025 };
});

function Sparks() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
      {SPARKS.map((s, i) => (
        <motion.span
          key={i}
          className={s.star ? "cel-spark cel-spark--star" : "cel-spark"}
          style={{ width: s.size, height: s.size, marginLeft: -s.size / 2, marginTop: -s.size / 2 }}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
          animate={{ x: s.x, y: s.y, scale: [0, 1.2, 0.5], opacity: [1, 1, 0] }}
          transition={{ duration: 0.95, delay: s.delay, ease: [0.16, 0.84, 0.3, 1] }}
        />
      ))}
    </div>
  );
}

/** Número que troca rolando (o antigo sobe e some; o novo entra de baixo com mola). */
function RollingNumber({ value }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", justifyContent: "center", minWidth: "1ch", overflow: "hidden", padding: "0 4px" }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ y: "70%", opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: "-70%", opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 26 }}>
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Contagem de 0 até `to` quando `active` liga. */
function CountUp({ to, active, reduce }) {
  const [n, setN] = React.useState(reduce ? to : 0);
  React.useEffect(() => {
    if (reduce) return setN(to);
    if (!active) return undefined;
    const ctl = animate(0, to, { duration: 0.8, ease: "easeOut", onUpdate: (v) => setN(Math.round(v)) });
    return () => ctl.stop();
  }, [to, active, reduce]);
  return <>{n}</>;
}

// ---------------------------------------------------------------- semana da sequência
function WeekRow({ week, show, reduce }) {
  if (!week?.days?.length) return null;
  const order = week.days.map((d, i) => ({ ...d, i, isToday: d.date === week.today }));
  return (
    <div className="cel-week" role="list" aria-label="Sua semana de estudo">
      {order.map((d) => {
        const done = d.state === "done";
        const label = DAY_LABEL[d.i];
        const status = done ? (d.isToday ? "hoje, estudou" : "estudou") : d.state === "frozen" ? "protegido" : d.state === "today" ? "hoje" : d.state === "future" ? "ainda não chegou" : "não estudou";
        // os dias estudados marcam um a um; hoje marca por último, com destaque
        const delay = reduce ? 0 : d.isToday ? 0.12 * 7 + 0.15 : 0.12 * d.i;
        return (
          <div key={d.date} role="listitem" className="cel-day" aria-label={`${label}: ${status}`}>
            <span className="cel-day__label">{label}</span>
            <span className={`cel-day__dot ${done ? (d.isToday ? "is-today" : "is-done") : d.state === "frozen" ? "is-frozen" : "is-empty"}`}>
              {(done || d.state === "frozen") && (
                <motion.span initial={reduce ? false : { scale: 0, rotate: -30 }} animate={show ? { scale: 1, rotate: 0 } : { scale: 0 }} transition={{ type: "spring", stiffness: 520, damping: 18, delay }} style={{ display: "inline-flex" }}>
                  <Icon name={d.state === "frozen" ? "snowflake" : "check"} size={16} />
                </motion.span>
              )}
              {d.isToday && done && show && !reduce && <motion.span className="cel-day__ring" initial={{ scale: 0.6, opacity: 0.9 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ duration: 0.7, delay: delay + 0.05 }} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- tela
let scrollLocks = 0;
let savedOverflow = "";
function lockScroll() {
  if (scrollLocks++ === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  return () => {
    if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
  };
}

/**
 * item: { type: "streak", streak } · { type: "achievement", achievement } · { type: "level", level, color } · { type: "league", league, color }
 */
export function Celebration({ item, onClose }) {
  const { backend } = useSession();
  // menos movimento: pedido do sistema ou MotionConfig reducedMotion="always" (usado nos testes)
  const deviceReduce = useReducedMotion();
  const configReduce = useReducedMotionConfig();
  const reduce = Boolean(deviceReduce || configReduce);
  const [phase, setPhase] = React.useState(reduce ? PHASE.cta : PHASE.pre);
  const [week, setWeek] = React.useState(null);
  const [shared, setShared] = React.useState(null);
  const continueRef = React.useRef(null);
  // fecha uma vez só (durante o esmaecer de saída, outro Esc ou clique fecharia a próxima da fila)
  const closed = React.useRef(false);
  const close = React.useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  }, [onClose]);
  const [levelInfo, setLevelInfo] = React.useState(null);
  React.useEffect(() => {
    if (item.type !== "level" || item.level?.name !== item.level?.slug || !backend?.rpc) return undefined;
    let alive = true;
    Promise.resolve()
      .then(() => backend.rpc("app_gamification_summary"))
      .then((s) => alive && s?.level?.slug === item.level.slug && setLevelInfo(s.level))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [backend, item]);
  const level = levelInfo ?? item.level;
  const theme = themeOf(levelInfo?.color_token ? { ...item, color: `var(${levelInfo.color_token})` } : item);

  // linha do tempo (menos movimento: direto ao estado final)
  React.useEffect(() => {
    if (reduce) {
      setPhase(PHASE.cta);
      return undefined;
    }
    const timers = TIMELINE.slice(1).map((ms, i) => setTimeout(() => setPhase((p) => Math.max(p, i + 1)), ms));
    return () => timers.forEach(clearTimeout);
  }, [reduce]);
  // semana da sequência (só para a sequência)
  React.useEffect(() => {
    if (item.type !== "streak" || !backend?.rpc) return undefined;
    let alive = true;
    Promise.resolve()
      .then(() => backend.rpc("app_play_streak_week"))
      .then((w) => alive && w?.days && setWeek(w))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [backend, item.type]);
  // Esc fecha; foco no botão quando ele aparece; a página atrás não rola
  React.useEffect(() => {
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const unlock = lockScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [close]);
  React.useEffect(() => {
    if (phase >= PHASE.cta) continueRef.current?.focus();
  }, [phase]);

  const lit = phase >= PHASE.ignite;
  const flooded = phase >= PHASE.flood;
  const at = (p) => phase >= p;
  const skip = () => phase < PHASE.cta && setPhase(PHASE.cta);

  const streak = item.type === "streak" ? Math.max(1, Number(item.streak) || 1) : 0;
  const title =
    item.type === "streak" ? (streak === 1 ? "dia de sequência" : "dias de sequência") : item.type === "achievement" ? item.achievement.name : item.type === "level" ? level?.name ?? "Novo nível" : `Liga ${item.league?.name ?? ""}`.trim();
  const overline = item.type === "achievement" ? "Medalha desbloqueada" : item.type === "level" ? "Novo nível" : item.type === "league" ? "Você subiu de liga" : "Sequência";
  const announce = item.type === "streak" ? `Sequência de ${streak} ${streak === 1 ? "dia" : "dias"}!` : `${overline}: ${title}`;
  const share = async () => {
    const text = `Estou há ${streak} ${streak === 1 ? "dia" : "dias"} seguidos estudando para o Revalida no StaziaMed!`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setShared("Texto copiado.");
      }
    } catch {
      // a pessoa desistiu de compartilhar
    }
  };

  return (
    <motion.div
      className="cel-root"
      role="dialog"
      aria-modal="true"
      aria-label={announce}
      style={{ "--cel-from": theme.from, "--cel-to": theme.to, "--cel-deep": theme.deep, "--cel-accent": theme.accent }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.15 } }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      onClick={skip}
    >
      <span className="cel-sr" aria-live="assertive">{announce}</span>
      {/* inundação de cor a partir do ícone */}
      <motion.div
        className="cel-flood"
        initial={reduce ? false : { clipPath: "circle(0% at 50% 38%)" }}
        animate={{ clipPath: flooded || reduce ? "circle(150% at 50% 38%)" : "circle(0% at 50% 38%)" }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      />
      {flooded && !reduce && <motion.div className="cel-rays" aria-hidden="true" initial={{ opacity: 0, rotate: 0 }} animate={{ opacity: 1, rotate: 360 }} transition={{ opacity: { duration: 0.6 }, rotate: { duration: 24, repeat: Infinity, ease: "linear" } }} />}

      <div className="cel-content">
        <motion.div className="cel-stage" initial={false} animate={{ y: at(PHASE.rise) ? 0 : 56 }} transition={{ type: "spring", stiffness: 160, damping: 20 }}>
          <motion.div
            className="cel-hero"
            initial={reduce ? false : { scale: 0.7, opacity: 0 }}
            animate={
              reduce
                ? { scale: 1, opacity: 1 }
                : phase === PHASE.pre
                  ? { scale: 0.86, opacity: 1 }
                  : phase === PHASE.ignite
                    ? { scaleX: [1, 1.18, 0.9, 1], scaleY: [1, 0.72, 1.16, 1], opacity: 1 }
                    : phase === PHASE.flood
                      ? { scale: 0.7, opacity: 1 }
                      : { scale: [0.7, 1.28, 1], y: [0, -10, 0], opacity: 1 }
            }
            transition={phase === PHASE.ignite ? { duration: 0.42, ease: "easeInOut" } : phase >= PHASE.burst ? { duration: 0.6, ease: [0.2, 1.4, 0.4, 1] } : { duration: 0.3 }}
          >
            {at(PHASE.burst) && !reduce && <Sparks />}
            <motion.div className="cel-hero__art" animate={at(PHASE.cta) && !reduce ? { y: [0, -6, 0] } : { y: 0 }} transition={at(PHASE.cta) ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}>
              {item.type === "streak" ? <Flame lit={lit || reduce} /> : <Medal icon={item.type === "achievement" ? item.achievement.icon : item.type === "level" ? level?.icon : item.league?.icon} lit={lit || reduce} />}
            </motion.div>
          </motion.div>

          {item.type === "streak" ? (
            <div className={`cel-number ${flooded || reduce ? "is-lit" : ""}`}>
              <RollingNumber value={at(PHASE.count) ? streak : Math.max(0, streak - 1)} />
            </div>
          ) : (
            <motion.div className="cel-overline" initial={false} animate={{ opacity: at(PHASE.count) ? 1 : 0, y: at(PHASE.count) ? 0 : 10 }}>
              {overline}
            </motion.div>
          )}
          <motion.h2 className="cel-title" initial={false} animate={{ opacity: at(item.type === "streak" ? PHASE.rise : PHASE.count) ? 1 : 0, y: at(PHASE.rise) ? 0 : 12 }} transition={{ duration: 0.35 }}>
            {title}
          </motion.h2>
        </motion.div>

        <motion.div className="cel-details" initial={false} animate={{ opacity: at(PHASE.details) ? 1 : 0, y: at(PHASE.details) ? 0 : 14 }} transition={{ duration: 0.35 }}>
          {item.type === "streak" && <WeekRow week={week} show={at(PHASE.details)} reduce={reduce} />}
          {item.type === "achievement" && (
            <>
              {item.achievement.description && <p className="cel-text">{item.achievement.description}</p>}
              {item.achievement.xp > 0 && (
                <div className="cel-reward">
                  <Icon name="zap" size={18} /> +<CountUp to={item.achievement.xp} active={at(PHASE.details)} reduce={reduce} /> XP
                  {item.achievement.coins > 0 && (
                    <span className="cel-reward__coins">
                      <Icon name="coins" size={16} /> +{item.achievement.coins}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
          {item.type === "level" && <p className="cel-text">{level?.description ?? "Seu Stazia Score subiu de faixa."}</p>}
          {item.type === "league" && <p className="cel-text">Sua semana terminou entre os primeiros do grupo.</p>}
        </motion.div>

        <motion.div className="cel-actions" initial={false} animate={{ opacity: at(PHASE.cta) ? 1 : 0, y: at(PHASE.cta) ? 0 : 24 }} transition={{ type: "spring", stiffness: 260, damping: 24 }} style={{ pointerEvents: at(PHASE.cta) ? "auto" : "none" }}>
          <button ref={continueRef} type="button" className="cel-btn" onClick={(e) => (e.stopPropagation(), close())}>
            Continuar
          </button>
          {item.type === "streak" && (
            <button type="button" className="cel-link" onClick={(e) => (e.stopPropagation(), share())}>
              <Icon name="share-2" size={16} /> {shared ?? "Compartilhar"}
            </button>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

/**
 * Fila de celebrações a partir do bloco `play` de uma resposta: sequência do dia, novo nível e cada medalha, nessa ordem.
 * `levels` (opcional) traz nome, ícone e cor do nível.
 */
let celebrationSeq = 0;
export function useCelebrations() {
  const [queue, setQueue] = React.useState([]);
  const push = React.useCallback((play, levels = []) => {
    if (!play) return;
    const items = [];
    if (play.streak_incremented) items.push({ type: "streak", streak: play.stats?.streak ?? 1 });
    if (play.level_up) {
      const level = levels.find((l) => l.slug === play.level_up.to) ?? { name: play.level_up.name ?? play.level_up.to, slug: play.level_up.to };
      items.push({ type: "level", level, color: level.color_token ? `var(${level.color_token})` : undefined });
    }
    for (const a of play.achievements_unlocked ?? []) items.push({ type: "achievement", achievement: a });
    if (items.length) setQueue((q) => [...q, ...items.map((it) => ({ ...it, id: ++celebrationSeq }))]);
  }, []);
  const next = React.useCallback(() => setQueue((q) => q.slice(1)), []);
  const current = queue[0] ?? null;
  const node = <AnimatePresence>{current && <Celebration key={current.id} item={current} onClose={next} />}</AnimatePresence>;
  return { push, node, current };
}
