import React from "react";
import { Icon } from "../core/Icon.jsx";
import { formatDecimal } from "../../format.js";

// Cartão de parceiro de estudo para deslizar (MatchCard.jsx do pacote de design), com os tokens do app.
// Todos os dados vêm por `person`: o cartão não tem pessoa de exemplo. Quem usa deve dar `key` por pessoa:
// depois que o cartão sai (arrasto ou `command`), ele não volta.
const LIMIAR = 110; // px de arrasto para decidir
const SAIDA_MS = 260; // voo do cartão
const AVISO_MS = 240; // onSwipe sai um pouco antes do fim do voo
const VOLTA_MS = 220; // cartão volta ao centro

function iniciais(nome) {
  return String(nome || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => Array.from(parte)[0])
    .join("")
    .toUpperCase();
}

export function MatchCard({ person, onSwipe, command }) {
  const el = React.useRef(null);
  const yes = React.useRef(null);
  const no = React.useRef(null);
  const st = React.useRef({ x0: 0, dx: 0, drag: false, gone: false, raf: 0, id: null });
  const swipeRef = React.useRef(onSwipe);
  swipeRef.current = onSwipe;

  // O movimento vai direto no DOM (sem estado do React) para o arrasto acompanhar o dedo a cada quadro.
  const paint = () => {
    const s = st.current;
    s.raf = 0;
    const node = el.current;
    if (!node) return;
    node.style.transform = "translate3d(" + s.dx + "px,0,0) rotate(" + s.dx / 22 + "deg)";
    const r = Math.min(1, Math.abs(s.dx) / LIMIAR);
    if (yes.current) yes.current.style.opacity = s.dx > 0 ? r : 0;
    if (no.current) no.current.style.opacity = s.dx < 0 ? r : 0;
  };
  const schedule = () => {
    if (!st.current.raf) st.current.raf = requestAnimationFrame(paint);
  };
  const fly = (dir) => {
    const s = st.current;
    if (s.gone) return;
    s.gone = true;
    s.drag = false;
    const node = el.current;
    if (node) {
      node.style.transition = "transform " + SAIDA_MS + "ms cubic-bezier(.2,.7,.2,1), opacity " + SAIDA_MS + "ms";
      s.dx = dir * Math.max(700, window.innerWidth);
      paint();
      node.style.opacity = "0";
    }
    setTimeout(() => {
      if (swipeRef.current) swipeRef.current(dir > 0 ? "right" : "left");
    }, AVISO_MS);
  };

  const commandN = command && command.n;
  React.useEffect(() => {
    if (command && command.dir) fly(command.dir);
    // só um novo `n` dispara; o cartão que já saiu ignora
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandN]);
  React.useEffect(() => () => cancelAnimationFrame(st.current.raf), []);

  const down = (e) => {
    const s = st.current;
    if (s.gone || (e.pointerType === "mouse" && e.button !== 0)) return;
    s.drag = true;
    s.id = e.pointerId;
    s.x0 = e.clientX - s.dx;
    if (el.current) el.current.style.transition = "none";
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {
      /* sem captura de ponteiro (ambiente sem suporte): o arrasto segue pelos eventos do cartão */
    }
  };
  const move = (e) => {
    const s = st.current;
    if (!s.drag || e.pointerId !== s.id) return;
    s.dx = e.clientX - s.x0;
    schedule();
  };
  const up = (e) => {
    const s = st.current;
    if (!s.drag) return;
    s.drag = false;
    try {
      e.currentTarget.releasePointerCapture(s.id);
    } catch (_) {
      /* idem */
    }
    if (Math.abs(s.dx) > LIMIAR) return fly(s.dx > 0 ? 1 : -1);
    if (el.current) el.current.style.transition = "transform " + VOLTA_MS + "ms cubic-bezier(.2,.7,.2,1)";
    s.dx = 0;
    schedule();
  };

  const p = person || { name: "" };
  const temCompat = typeof p.compat === "number" && Number.isFinite(p.compat);
  return (
    <article
      ref={el}
      className="sm-match"
      style={{ willChange: "transform", touchAction: "pan-y" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onDragStart={(e) => e.preventDefault()}
      aria-label={p.name + ". Arraste para a direita para estudar, para a esquerda para pular."}
    >
      <div className="sm-match__band">
        {p.online && (
          <span className="sm-match__pill sm-match__pill--left">
            <span className="sm-match__dot" />
            online
          </span>
        )}
        {temCompat && (
          <span className="sm-match__pill sm-match__pill--right">
            <Icon name="sparkles" size={15} />
            {formatDecimal(p.compat, 0)}% compatível
          </span>
        )}
        <span className="sm-match__avatar" aria-hidden="true">
          {iniciais(p.name)}
        </span>
      </div>
      <div className="sm-match__body">
        <h2 className="sm-match__name">{p.name}</h2>
        {p.meta && <div className="sm-match__meta">{p.meta}</div>}
        {p.bio && <p className="sm-match__bio">{p.bio}</p>}
        {p.facts && p.facts.length > 0 && (
          <div className="sm-match__facts">
            {p.facts.map((f, i) => (
              <div key={i + f.label} className="sm-match__fact">
                <div className="sm-match__fact-l">
                  <Icon name={f.icon} size={13} />
                  {f.label}
                </div>
                <div className="sm-match__fact-v">{f.value}</div>
              </div>
            ))}
          </div>
        )}
        {p.reasons && p.reasons.length > 0 && (
          <div className="sm-match__why">
            <div className="sm-match__why-title">Por que vocês combinam</div>
            <div className="sm-match__why-list">
              {p.reasons.map((r, i) => (
                <div
                  key={i}
                  className={"sm-match__reason" + (r.strong ? " sm-match__reason--strong" : "") + (r.weak ? " sm-match__reason--weak" : "")}
                >
                  <Icon name={r.icon} size={14} />
                  {r.text}
                </div>
              ))}
            </div>
          </div>
        )}
        {p.tags && p.tags.length > 0 && (
          <div className="sm-match__tags">
            {p.tags.map((t) => (
              <span key={t} className="sm-match__tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <span ref={yes} className="sm-match__stamp sm-match__stamp--yes" aria-hidden="true">
        ESTUDAR
      </span>
      <span ref={no} className="sm-match__stamp sm-match__stamp--no" aria-hidden="true">
        PULAR
      </span>
    </article>
  );
}
