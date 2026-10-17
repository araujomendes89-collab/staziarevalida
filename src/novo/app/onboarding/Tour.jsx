// Tour guiado no painel REAL (sem biblioteca: código próprio, ~200 linhas). Cada passo procura o primeiro marcador data-tour
// visível (o mesmo nome pode estar no menu do computador, no trilho do tablet e na barra do celular), escurece o resto, abre a
// explicação ao lado e se reposiciona quando a tela muda (redimensionar, rolar, conteúdo que chega depois). Interromper (Esc ou
// fechar) guarda o passo no banco; o Início oferece retomar. Teclado: Tab fica dentro da caixa, setas avançam e voltam.
import React from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "motion/react";
import { Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { TOUR } from "./textos.js";
import { Personagem, personagemDoAluno } from "./Personagem.jsx";

const MARGEM = 12;
const BORDA = 16;
const FOLGA = 6;

function visivel(el) {
  if (!el || !el.getClientRects().length) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  // fora da janela (menu escondido de lado, por exemplo) não conta
  if (r.right <= 0 || r.left >= window.innerWidth || r.bottom <= 0 || r.top >= Math.max(document.documentElement.scrollHeight, window.innerHeight) + window.scrollY) return false;
  const st = window.getComputedStyle(el);
  return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
}

/** O primeiro alvo visível do passo: [elemento, nome do alvo] ou null. */
export function acharAlvo(passo, soPreferido = false) {
  for (const nome of soPreferido ? passo.alvos.slice(0, 1) : passo.alvos) {
    const el = [...document.querySelectorAll(`[data-tour~="${nome}"]`)].find(visivel);
    if (el) return [el, nome];
  }
  return null;
}

/** Onde a caixa fica: à direita de alvos do menu lateral; senão embaixo; senão em cima; senão no pé da tela. */
export function posicionar(r, caixa, vw, vh) {
  const W = caixa.width;
  const H = caixa.height;
  const lim = (v, min, max) => Math.max(min, Math.min(v, max));
  let top;
  let left;
  let lado;
  if (r.left < vw * 0.3 && vw - r.right >= W + MARGEM + BORDA && r.right < vw * 0.5) {
    lado = "direita";
    left = r.right + MARGEM;
    top = r.top + r.height / 2 - H / 2;
  } else if (vh - r.bottom >= H + MARGEM + BORDA) {
    lado = "baixo";
    top = r.bottom + MARGEM;
    left = r.left + r.width / 2 - W / 2;
  } else if (r.top >= H + MARGEM + BORDA) {
    lado = "cima";
    top = r.top - MARGEM - H;
    left = r.left + r.width / 2 - W / 2;
  } else {
    lado = "pe";
    top = vh - H - BORDA;
    left = (vw - W) / 2;
  }
  return { top: lim(top, BORDA, Math.max(BORDA, vh - H - BORDA)), left: lim(left, BORDA, Math.max(BORDA, vw - W - BORDA)), lado };
}

export function Tour({ inicio = 0, onMudou, personagem = "stazi" }) {
  const { backend } = useSession();
  const reduzir = useReducedMotion();
  const [idx, setIdx] = React.useState(() => Math.min(Math.max(0, inicio), TOUR.length - 1));
  const [alvo, setAlvo] = React.useState(null); // [el, nome]
  const [rect, setRect] = React.useState(null);
  const [pos, setPos] = React.useState(null);
  const [aberto, setAberto] = React.useState(true);
  const caixa = React.useRef(null);
  const anterior = React.useRef(typeof document !== "undefined" ? document.activeElement : null);
  const passo = TOUR[idx];

  const gravar = React.useCallback(
    (status, n) => {
      backend
        .rpc("app_onboarding_tour", { p_status: status, p_passo: n })
        .then((e) => onMudou?.(e))
        .catch(() => {});
    },
    [backend, onMudou]
  );
  const fechar = React.useCallback(
    (status) => {
      setAberto(false);
      gravar(status, status === "concluido" ? TOUR.length - 1 : idx);
      const a = anterior.current;
      if (a && typeof a.focus === "function" && document.contains(a)) a.focus();
    },
    [gravar, idx]
  );
  const ir = React.useCallback(
    (n) => {
      if (n >= TOUR.length) return fechar("concluido");
      if (n < 0) return;
      setIdx(n);
      gravar("em_andamento", n);
    },
    [fechar, gravar]
  );

  // acha o alvo do passo (o Início carrega os dados depois: tenta por até ~3 s; sem alvo, pula para o próximo passo)
  React.useEffect(() => {
    if (!aberto) return undefined;
    let vivo = true;
    let tentativas = 0;
    let t = null;
    const procurar = () => {
      if (!vivo) return;
      // o alvo preferido (o cartão da tela) costuma chegar depois dos dados; espera um pouco por ele antes do menu
      const achado = acharAlvo(passo, Boolean(passo.esperarPreferido) && tentativas < 8);
      if (achado) {
        const [el] = achado;
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView?.({ block: "center", behavior: reduzir ? "auto" : "smooth" });
        setAlvo(achado);
        return;
      }
      tentativas += 1;
      if (tentativas < 15) t = setTimeout(procurar, 200);
      else if (idx < TOUR.length - 1) setIdx(idx + 1);
      else fechar("concluido");
    };
    setAlvo(null);
    setRect(null);
    setPos(null);
    procurar();
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [idx, aberto, passo, reduzir, fechar]);

  // mede o alvo e a caixa; refaz quando a tela muda
  React.useLayoutEffect(() => {
    if (!alvo || !aberto) return undefined;
    const [el] = alvo;
    let quadro = 0;
    const medir = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        if (!document.contains(el)) {
          setAlvo(acharAlvo(passo));
          return;
        }
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height, right: r.right, bottom: r.bottom });
        const c = caixa.current?.getBoundingClientRect();
        if (c) setPos(posicionar(r, c, window.innerWidth, window.innerHeight));
      });
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    if (caixa.current) ro?.observe(caixa.current);
    const relogio = setInterval(medir, 500); // conteúdo que chega depois e empurra o alvo
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
      ro?.disconnect();
      clearInterval(relogio);
    };
  }, [alvo, aberto, passo]);

  // foco na caixa a cada passo; teclado
  React.useEffect(() => {
    if (!aberto || !alvo) return undefined;
    caixa.current?.querySelector(".ob-tour__pri")?.focus({ preventScroll: true });
    const tecla = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        fechar("pausado");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        ir(idx + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        ir(idx - 1);
      } else if (e.key === "Tab" && caixa.current) {
        const f = [...caixa.current.querySelectorAll("button")].filter((b) => !b.disabled);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && (i === f.length - 1 || i === -1)) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aberto, alvo, idx, ir, fechar]);

  if (!aberto || typeof document === "undefined") return null;
  const texto = (alvo && passo.textoAlvo?.[alvo[1]]) || passo.texto;
  const ultimo = idx === TOUR.length - 1;
  const furo = rect ? { top: rect.top - FOLGA, left: rect.left - FOLGA, width: rect.width + FOLGA * 2, height: rect.height + FOLGA * 2 } : null;

  return createPortal(
    <div className={`ob-tour${reduzir ? " ob-tour--parado" : ""}`}>
      {/* o resto da tela fica escurecido e sem clique durante o tour */}
      <div className="ob-tour__fundo" aria-hidden="true" onClick={(e) => e.preventDefault()} />
      {furo ? <div className="ob-tour__furo" style={furo} aria-hidden="true" /> : null}
      <div
        ref={caixa}
        className={`ob-tour__caixa${pos ? ` is-${pos.lado}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-tour-t"
        aria-describedby="ob-tour-d"
        style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: 0 }}
      >
        <div className="ob-tour__cab">
          <span className="ob-tour__pers" aria-hidden="true">
            <Personagem id={personagem} pose={idx === TOUR.length - 1 ? "polegar" : "acenando"} altura={52} decorativo animar={false} />
          </span>
          <span className="ob-over">
            Tour · {idx + 1} de {TOUR.length}
          </span>
          <button type="button" className="ob-tour__x" onClick={() => fechar("pausado")} aria-label="Interromper o tour (dá para retomar no Início)">
            <Icon name="x" size={18} />
          </button>
        </div>
        <h2 id="ob-tour-t" className="ob-tour__t">
          {passo.titulo}
        </h2>
        <p id="ob-tour-d" className="ob-tour__d">
          {texto}
        </p>
        <div className="ob-tour__pe">
          <span className="ob-pontos ob-pontos--tour" aria-hidden="true">
            {TOUR.map((p, i) => (
              <i key={p.id} className={i === idx ? "on" : i < idx ? "feito" : ""} />
            ))}
          </span>
          {idx > 0 ? (
            <button type="button" className="ob-btn ob-btn--sec ob-btn--sm" onClick={() => ir(idx - 1)}>
              Voltar
            </button>
          ) : (
            <button type="button" className="ob-btn ob-btn--link ob-btn--sm" onClick={() => fechar("pulado")}>
              Pular tour
            </button>
          )}
          <button type="button" className="ob-btn ob-btn--pri ob-btn--sm ob-tour__pri" onClick={() => ir(idx + 1)}>
            {ultimo ? "Concluir" : "Próximo"}
          </button>
        </div>
        <span className="ob-sr" aria-live="polite">
          Passo {idx + 1} de {TOUR.length}: {passo.titulo}
        </span>
      </div>
    </div>,
    document.body
  );
}

/** Liga o tour no Início quando o banco diz que ele está em andamento (depois do onboarding ou pela Ajuda). */
export function TourNoPainel({ route }) {
  const { boot, setOnboarding } = useSession();
  const tour = boot.onboarding?.tour;
  // função estável: recriá-la a cada desenho reiniciava a busca do alvo (o tour piscava ao abrir)
  const onMudou = React.useCallback((e) => {
    if (e?.tour?.status !== "em_andamento") setOnboarding(e);
  }, [setOnboarding]);
  if (route !== "home" || tour?.status !== "em_andamento") return null;
  return <Tour key={`tour-${tour.passo}`} inicio={tour.passo} onMudou={onMudou} personagem={personagemDoAluno(boot.onboarding)} />;
}
