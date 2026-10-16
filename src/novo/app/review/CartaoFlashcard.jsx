// Cartão de flashcard em TEXTO no padrão visual dos flashcards ilustrados das aulas (15/10/2026, pedido do dono):
// faixa azul-marinho com selos (área; "Essencial"; "Atualizado mm/aaaa"; "Meu cartão"), título do tema e ícone; corpo claro
// com o rótulo PERGUNTA/RESPOSTA e o texto em fonte condensada; "toque para virar"; rodapé com a logo StaziaMed.
// Vale para todo cartão SEM imagem ilustrada: baralho/revisão (plataforma e do próprio aluno), Atualizações e a prévia ao criar.
// Cor: variáveis --gt-* da paleta v2 (tema ou área; sem área conhecida, a cor padrão). Nenhum código de cor aparece na tela.
// Texto longo (até 2000 na frente e 4000 no verso): a fonte diminui e o texto rola DENTRO do cartão; nada é cortado.
// Teclado: espaço ou Enter vira; setas e Page Up/Down rolam o texto do lado visível. Documentação: docs/flashcard-layout.md.
import React from "react";
import { Icon } from "../../ds";
import { areaOf } from "../practice/format.js";
import { areaVars, temaVars } from "../study/temaCores.js";
import "./cartaoFlashcard.css";

/** Tamanho da letra pelo comprimento do texto: xl e lg em maiúsculas condensadas; md condensada; sm na fonte de leitura. */
export function tamanhoTexto(texto, lado = "frente") {
  const n = String(texto ?? "").trim().length;
  const [xl, lg, md] = lado === "verso" ? [110, 220, 420] : [90, 200, 450];
  return n <= xl ? "xl" : n <= lg ? "lg" : n <= md ? "md" : "sm";
}

/** "2026-10-14T12:00:00Z" → "10/2026"; data inválida ou vazia: null. */
export function mesAno(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Cores do cartão: as do tema/área recebidas; senão as da área; senão a cor padrão (paleta v2). */
export function coresDoCartao(area, cores) {
  return cores ?? areaVars(area) ?? temaVars(null, null);
}

const ROLAGEM = { ArrowDown: 40, ArrowUp: -40, PageDown: 0.85, PageUp: -0.85 };

/**
 * front, back: texto do cartão. area: área do banco (CLINICA_MEDICA…). topic: título do tema na faixa.
 * selos: { essencial, atualizado: "mm/aaaa", meu } (só aparecem quando existem). cores: variáveis --gt-* (opcional).
 * flipped/onFlip: estado controlado (opcional). icone: ícone da faixa (padrão: o da área; "Meu cartão": caderno).
 */
export function CartaoFlashcard({ front, back, area, topic, selos = {}, cores, icone, flipped, onFlip, className = "", style }) {
  const [interno, setInterno] = React.useState(false);
  const virado = flipped ?? interno;
  const id = React.useId();
  const raiz = React.useRef(null);
  const virar = () => (onFlip ? onFlip(!virado) : setInterno(!virado));
  // texto maior que a caixa: esmaece o pé da caixa e avisa "role para ler tudo" (nada é cortado)
  const [mais, setMais] = React.useState({ f: false, v: false });
  React.useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return undefined;
    const medir = () => {
      const t = (lado) => {
        const c = el.querySelector(`.fcp-${lado} .fcp-rola`);
        return Boolean(c && c.scrollHeight > c.clientHeight + 2);
      };
      const novo = { f: t("frente"), v: t("verso") };
      setMais((m) => (m.f === novo.f && m.v === novo.v ? m : novo));
    };
    medir();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [front, back]);
  const a = areaOf(area);
  const chips = [
    a && { k: "area", icon: a.icon, label: a.label },
    selos.essencial && { k: "essencial", icon: "chart-no-axes-column", label: "Essencial" },
    selos.atualizado && { k: "atualizado", icon: "calendar-days", label: `Atualizado ${selos.atualizado}`, forte: true },
    selos.meu && { k: "meu", icon: "user-round-pen", label: "Meu cartão", forte: true },
  ].filter(Boolean);
  const simbolo = icone ?? (selos.meu ? "notebook-pen" : a?.icon ?? "layers");
  const titulo = String(topic ?? "").trim() || (selos.meu ? "Meus cartões" : a?.label ?? "Flashcard");

  const tecla = (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      virar();
      return;
    }
    const passo = ROLAGEM[event.key];
    if (!passo) return;
    const caixa = raiz.current?.querySelector(`.fcp-face${virado ? ".fcp-verso" : ".fcp-frente"} .fcp-rola`);
    if (!caixa || caixa.scrollHeight <= caixa.clientHeight) return;
    event.preventDefault();
    const dy = Math.abs(passo) < 1 ? passo * caixa.clientHeight : passo;
    if (caixa.scrollBy) caixa.scrollBy({ top: dy });
    else caixa.scrollTop += dy;
  };

  const faixa = (
    <div className="fcp-faixa">
      <div className="fcp-faixa-txt">
        {chips.length > 0 && (
          <div className="fcp-chips">
            {chips.map((c) => (
              <span key={c.k} className={`fcp-chip${c.forte ? " fcp-chip--forte" : ""}`} data-selo={c.k}>
                <Icon name={c.icon} size={13} />
                {c.label}
              </span>
            ))}
          </div>
        )}
        <div className="fcp-titulo">{titulo}</div>
      </div>
      <div className="fcp-simbolo" aria-hidden="true">
        <Icon name="sparkle" size={10} className="fcp-brilho fcp-brilho--1" />
        <Icon name="sparkle" size={14} className="fcp-brilho fcp-brilho--2" />
        <span className="fcp-simbolo-in">
          <Icon name={simbolo} size={30} />
        </span>
      </div>
    </div>
  );
  const rodape = (
    <div className="fcp-rodape">
      {/* logo nova (fundo claro sobre azul-marinho) como fundo de CSS: decorativa, não arrasta e não conta como imagem do cartão */}
      <span className="fcp-logo" aria-hidden="true" />
    </div>
  );

  return (
    <div
      ref={raiz}
      className={`sm-flash sm-flash--tema fcp${virado ? " fcp--virado" : ""}${className ? ` ${className}` : ""}`}
      style={{ ...coresDoCartao(area, cores), ...style }}
      role="button"
      tabIndex={0}
      aria-pressed={virado}
      aria-label={virado ? "Mostrar pergunta" : "Mostrar resposta"}
      aria-describedby={`${id}-${virado ? "v" : "f"}`}
      onClick={virar}
      onKeyDown={tecla}
    >
      <div className="fcp-in">
        <div className="fcp-face fcp-frente" aria-hidden={virado}>
          {faixa}
          <div className="fcp-corpo">
            <div className="fcp-caixa">
              <div className={`fcp-rola${mais.f ? " fcp-rola--mais" : ""}`}>
                <div className="fcp-centro">
                  <div className="fcp-rotulo">
                    <span className="fcp-rotulo-ic">
                      <Icon name="circle-help" size={22} />
                    </span>
                    Pergunta
                  </div>
                  <p id={`${id}-f`} className={`fcp-t fcp-t--${tamanhoTexto(front, "frente")}`}>{front}</p>
                  <span className="fcp-traco" aria-hidden="true" />
                </div>
              </div>
            </div>
            <div className="fcp-dica">
              <Icon name="refresh-cw" size={15} />
              toque para virar<span className="fcp-sr"> ou pressione espaço</span>
            </div>
            {mais.f && <MaisTexto />}
          </div>
          {rodape}
        </div>
        <div className="fcp-face fcp-verso" aria-hidden={!virado}>
          {faixa}
          <div className="fcp-corpo">
            <div className="fcp-resp">
              <div className={`fcp-rola${mais.v ? " fcp-rola--mais" : ""}`}>
                <div className="fcp-centro">
                  <div className="fcp-rotulo">
                    <span className="fcp-rotulo-ic">
                      <Icon name="check" size={16} />
                    </span>
                    Resposta
                  </div>
                  <p id={`${id}-v`} className={`fcp-t fcp-t--${tamanhoTexto(back, "verso")}`}>{back}</p>
                </div>
              </div>
            </div>
            {mais.v && <MaisTexto />}
          </div>
          {rodape}
        </div>
      </div>
    </div>
  );
}

function MaisTexto() {
  return (
    <div className="fcp-mais">
      <Icon name="chevrons-down" size={14} />
      role o texto para ler tudo
    </div>
  );
}
