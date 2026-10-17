// Mini Tutor (pedido do dono, 17/10/2026): o Tutor numa janelinha flutuante dentro da tela de Questões, Simulados e Aulas, com o
// personagem escolhido (Stazi ou Stazia) em miniatura. Abre, minimiza para uma bolinha e fecha sem sair da tela.
//  - computador: janelinha numa coluna livre ao lado do conteúdo; sem coluna livre (notebook), a página abre espaço à direita e a
//    janelinha fica ali, sem cobrir enunciado, pergunta, alternativas nem o botão de responder (`evitar`). Arrasta pelo topo (mouse
//    ou setas); a posição arrastada vale só nesta questão e o botão "Voltar ao canto" desfaz.
//  - celular: folha que sobe de baixo (cobre o rodapé da questão; para responder, minimize), com 3 alturas trocadas arrastando o
//    puxador; sobe junto com o teclado; minimizada, vira uma aba pequena na borda direita, acima do rodapé.
//  - fechado, o personagem é uma imagem parada (sem animação, sem baixar as outras poses); animado só com a janelinha aberta.
//  - contexto automático (a tela passa `contexto`, ver contexto.js); simulado em andamento: travado até a entrega.
//  - saldo: cada mensagem gasta a cota do Tutor por texto de hoje; a voz gasta os minutos de voz de hoje. O saldo fica à vista e, quando
//    acaba, aparece o aviso com o convite para ver os planos (nada é cobrado pelo app).
// Uso: <MiniTutor contexto={contextoDaQuestao(q, {...})} evitar=".tq-stem, .tq-ask, .tq-alts > *, .tq-foot, .tq-side" go={go} />.
// Fora do app (sem servidor), não aparece.
import React from "react";
import { createPortal } from "react-dom";
import { useInRouterContext, useNavigate } from "react-router-dom";
import { Icon } from "../../../ds";
import { useSession } from "../../session.jsx";
import { tutorAvailable, tutorServerStatus } from "../api.js";
import * as Gaveta from "../TutorDrawer.jsx";
import { realtimeSupport } from "../useRealtimeVoice.js";
import { unlockAudio } from "../voice/audioUnlock.js";
import { orbEmotion } from "../voice/StaziaVoiceOrb.jsx";
import { PersonagemTutor } from "../personagens/PersonagemTutor.jsx";
import { PERSONAGENS, lerPersonagem, personagemDe, personagemValido } from "../personagens/personagens.js";
import { spritePose } from "../personagens/sprites.js";
import { useMovimentoReduzido } from "../personagens/useMovimentoReduzido.js";
import { MINI_TUTOR, TEXTOS } from "./config.js";
import { atalhos, chaveDoContexto, faseDaQuestao } from "./contexto.js";
import { useMiniTutor } from "./useMiniTutor.js";
import { useDemorou } from "../useDemorou.js";
import { textoConferindo } from "../../../../../server/tutor/conhecimento/frasesEspera";
import "./miniTutor.css";

// a voz só baixa quando o aluno toca no microfone
const MiniVoz = React.lazy(() => import("./MiniVoz.jsx").then((m) => ({ default: m.MiniVoz })));

// o atalho para o Tutor completo (aceite do termo). Lido com cuidado: telas e testes que trazem uma TutorDrawer sem useTutorDock
// continuam de pé (o mini tutor só não mostra o botão do aceite).
let usarGaveta;
function useTutorDock() {
  if (usarGaveta === undefined) {
    try {
      usarGaveta = typeof Gaveta.useTutorDock === "function" ? Gaveta.useTutorDock : null;
    } catch {
      usarGaveta = null;
    }
  }
  return usarGaveta ? usarGaveta() : null;
}

const MARGEM = 20;
const BOLINHA = 64;
const ABA = { w: 36, h: 56 }; // celular: aba na borda direita (cabe na margem, ao lado do "riscar alternativa")
const TAMANHOS_FOLHA = ["compacta", "media", "alta"];

function useMedia(q) {
  const ler = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? Boolean(window.matchMedia(q)?.matches) : false);
  const [v, setV] = React.useState(ler);
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(q);
    const on = () => setV(Boolean(mq?.matches));
    on();
    mq?.addEventListener?.("change", on);
    return () => mq?.removeEventListener?.("change", on);
  }, [q]);
  return v;
}
const useCelular = () => useMedia(`(max-width: ${MINI_TUTOR.larguraCelular - 1}px)`);
const useTablet = () => useMedia(`(min-width: ${MINI_TUTOR.larguraCelular}px) and (max-width: ${MINI_TUTOR.larguraComputador - 1}px)`);

/** Medidas da janelinha flutuante: tamanho cheio no computador, menor no tablet (altura limitada pela altura da tela). */
export function medidasDaJanela({ tablet, vw = 1440, vh = 900 }) {
  if (!tablet) return { ...MINI_TUTOR.janela, reservarMin: 0 };
  const t = MINI_TUTOR.tablet;
  return { larguras: t.larguras, altura: Math.min(t.altura, Math.round(vh * t.fracAltura)), alturaMin: t.alturaMin, reservarMin: t.larguraReserva };
}

const limitar = (p, w, h) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return { x: Math.min(Math.max(8, p.x), Math.max(8, vw - w - 8)), y: Math.min(Math.max(8, p.y), Math.max(8, vh - h - 8)) };
};

/** Elementos (visíveis na tela) do que o mini tutor não pode cobrir, com o retângulo de cada um. */
function visiveis(seletor) {
  if (!seletor || typeof document === "undefined") return [];
  const vh = window.innerHeight;
  const out = [];
  for (const el of document.querySelectorAll(seletor)) {
    if (el.closest?.(".mt")) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh) out.push({ el, r });
  }
  return out;
}
const sobreposicao = (a, rs) =>
  rs.reduce((soma, r) => soma + Math.max(0, Math.min(a.x + a.w, r.right) - Math.max(a.x, r.left)) * Math.max(0, Math.min(a.y + a.h, r.bottom) - Math.max(a.y, r.top)), 0);

/**
 * Maior faixa vertical livre numa coluna da tela (x, x + w) entre `topo` e `base`, sem nada de `rs` na frente.
 * Devolve { y, h } (h = 0 quando não sobra nada). Empate: a de baixo (perto do canto).
 */
export function faixaLivre(rs, x, w, topo, base) {
  const cobre = rs.filter((r) => r.right > x - 10 && r.left < x + w + 10).map((r) => [Math.max(topo, r.top - 10), Math.min(base, r.bottom + 10)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let melhor = { y: topo, h: 0 };
  let cursor = topo;
  const gaps = [];
  for (const [a, b] of cobre) {
    if (a > cursor) gaps.push({ y: cursor, h: a - cursor });
    cursor = Math.max(cursor, b);
  }
  if (base > cursor) gaps.push({ y: cursor, h: base - cursor });
  for (const g of gaps) if (g.h >= melhor.h) melhor = g;
  return melhor;
}

/**
 * Onde a janelinha fica no computador, sem cobrir o que importa (função pura, testável):
 *  1) uma coluna livre à direita (ou à esquerda) do conteúdo, nas larguras de `larguras`, com altura de pelo menos `hMin`;
 *  2) sem coluna livre: `reserva` (a página abre espaço à direita: a janelinha ocupa a coluna da direita, do topo até embaixo);
 *  3) sem poder abrir espaço: o canto que menos cobre, na altura mínima.
 * vw/vh: tamanho da tela; topo: abaixo das barras presas no topo; rs: retângulos a evitar.
 */
export function posicaoNoComputador({ vw, vh, topo, rs, larguras, h, hMin, reservar }) {
  const base = vh - MARGEM;
  const hMax = Math.max(hMin, Math.min(h, base - topo));
  for (const w of larguras) {
    for (const x of [vw - w - MARGEM, MARGEM]) {
      const f = faixaLivre(rs, x, w, topo, base);
      if (f.h >= Math.min(hMin, hMax)) {
        const hh = Math.min(hMax, f.h);
        return { x, y: Math.round(f.y + f.h - hh), w, h: Math.round(hh), reserva: 0 };
      }
    }
  }
  const w = larguras[0];
  if (reservar) return { x: vw - w - MARGEM, y: Math.round(topo), w, h: Math.round(hMax), reserva: w + 2 * MARGEM };
  const hh = Math.min(hMax, hMin);
  const cantos = [
    { x: vw - w - MARGEM, y: base - hh },
    { x: vw - w - MARGEM, y: topo },
    { x: MARGEM, y: base - hh },
    { x: MARGEM, y: topo },
  ];
  const custos = cantos.map((k) => sobreposicao({ ...k, w, h: hh }, rs));
  const c = cantos[custos.indexOf(Math.min(...custos))];
  return { x: Math.round(c.x), y: Math.round(c.y), w, h: Math.round(hh), reserva: 0 };
}

/**
 * Posição automática. Celular: só a "folga" de baixo (altura do rodapé PRESO da questão, onde fica o botão de responder), para a aba
 * minimizada ficar acima dele. Computador: ver posicaoNoComputador. A decisão de abrir espaço na página fica valendo enquanto a
 * janelinha estiver aberta (a página mudou de largura; medir de novo faria a janelinha pular de um lado para o outro); muda ao
 * redimensionar a janela.
 */
function usePosicaoAuto({ evitar, celular, tablet, aberto, ativo, chave }) {
  const [auto, setAuto] = React.useState({ x: null, y: null, w: null, h: null, folga: 0, reserva: 0 });
  const reservaFixa = React.useRef(0);
  React.useEffect(() => {
    if (!aberto) reservaFixa.current = 0;
  }, [aberto]);
  React.useEffect(() => {
    if (!ativo || typeof window === "undefined") return undefined;
    let quadro = 0;
    let largura = window.innerWidth;
    const medir = () => {
      quadro = 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw !== largura) {
        largura = vw;
        reservaFixa.current = 0; // mudou o tamanho da janela: decide de novo
      }
      const itens = visiveis(evitar);
      const rs = itens.map((i) => i.r);
      let folga = 0;
      for (const { el, r } of itens) {
        if (r.bottom >= vh - 4 && r.top > vh * 0.45 && /^(fixed|sticky)$/.test(window.getComputedStyle(el).position)) folga = Math.max(folga, vh - r.top);
      }
      if (celular) {
        setAuto((a) => (a.folga === folga && a.x === null && !a.reserva ? a : { x: null, y: null, w: null, h: null, folga, reserva: 0 }));
        return;
      }
      let topo = MARGEM;
      for (const { r } of visiveis(MINI_TUTOR.cabecalhos)) if (r.top <= 8 && r.height < 200) topo = Math.max(topo, r.bottom + 12);
      const med = medidasDaJanela({ tablet, vw, vh });
      const larguras = aberto ? med.larguras : [BOLINHA];
      const h = aberto ? med.altura : BOLINHA;
      const hMin = aberto ? med.alturaMin : BOLINHA;
      let c;
      if (aberto && reservaFixa.current) {
        const w = larguras[0];
        c = { x: vw - w - MARGEM, y: topo, w, h: Math.round(Math.max(hMin, Math.min(h, vh - MARGEM - topo))), reserva: reservaFixa.current };
      } else {
        c = posicaoNoComputador({ vw, vh, topo, rs, larguras, h, hMin, reservar: aberto && MINI_TUTOR.abrirEspacoNaPagina && vw >= med.reservarMin });
        if (c.reserva) reservaFixa.current = c.reserva;
      }
      setAuto((a) => (a.x === c.x && a.y === c.y && a.w === c.w && a.h === c.h && a.folga === folga && a.reserva === c.reserva ? a : { ...c, folga }));
    };
    const pedir = () => {
      if (!quadro) quadro = window.requestAnimationFrame ? window.requestAnimationFrame(medir) : (setTimeout(medir, 16), 1);
    };
    medir();
    window.addEventListener("scroll", pedir, { passive: true, capture: true });
    window.addEventListener("resize", pedir);
    const vigia = setInterval(pedir, 1200); // a tela muda sem rolar (corrigiu a questão, abriu a explicação)
    return () => {
      window.removeEventListener("scroll", pedir, { capture: true });
      window.removeEventListener("resize", pedir);
      clearInterval(vigia);
      if (quadro && window.cancelAnimationFrame) window.cancelAnimationFrame(quadro);
    };
  }, [evitar, celular, tablet, aberto, ativo, chave]);
  return auto;
}

/** A página abre espaço à direita para a janelinha (computador sem coluna livre). Some quando a janelinha fecha. */
function useEspacoNaPagina(px) {
  React.useEffect(() => {
    if (!px || typeof document === "undefined") return undefined;
    const raiz = document.documentElement;
    raiz.style.setProperty("--mt-reserva", `${px}px`);
    raiz.classList.add("mt-reserva");
    return () => {
      raiz.classList.remove("mt-reserva");
      raiz.style.removeProperty("--mt-reserva");
    };
  }, [px]);
}

/**
 * Celular: quanto o teclado cobre embaixo (px), pela área visível da tela (visualViewport). A folha sobe por cima dele enquanto o
 * aluno escreve. { baixo, altura } (altura = área visível); sem visualViewport, 0.
 */
function useTeclado(ativo) {
  const [t, setT] = React.useState({ baixo: 0, altura: null });
  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!ativo || !vv) {
      setT((a) => (a.baixo === 0 && a.altura === null ? a : { baixo: 0, altura: null }));
      return undefined;
    }
    const medir = () => {
      const baixo = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const altura = Math.round(vv.height);
      setT((a) => (a.baixo === baixo && a.altura === altura ? a : { baixo, altura }));
    };
    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
    };
  }, [ativo]);
  return t;
}

/** A cabeça do personagem num círculo, animada (topo da janelinha aberta). */
function Rosto({ personagem, estado = "idle", avatar = null, tamanho = 44, reduzido }) {
  const emo = orbEmotion(avatar);
  return (
    <span className="mt-rosto" style={{ "--mt-rosto": `${tamanho}px` }} aria-hidden="true">
      <span className="mt-rosto__corpo">
        <PersonagemTutor personagem={personagem} conversationState={estado} emotion={emo.emotion} emotionIntensity={emo.intensity} reduzido={reduzido} decorativo preCarregar="provaveis" />
      </span>
    </span>
  );
}

/**
 * A cabeça do personagem PARADA (bolinha/aba fechada): só a imagem da pose de base (versão de meia resolução, ~20 KB), no mesmo
 * enquadramento do Rosto animado. Não liga laço de quadros, áudio nem baixa as outras poses (fica o tempo todo na tela, inclusive
 * num simulado de horas).
 */
function RostoParado({ personagem, tamanho }) {
  const s = spritePose(personagem, "base");
  return (
    <span className="mt-rosto" style={{ "--mt-rosto": `${tamanho}px` }} aria-hidden="true">
      <span className="mt-rosto__corpo mt-rosto__corpo--parado">
        <span className="mt-rosto__caixa">
          {s?.url ? (
            <img
              className="mt-rosto__img" src={s.urlMeia ?? s.url} alt="" draggable={false} decoding="async"
              style={{ left: `calc(${(300 - s.ax).toFixed(1)} * var(--mt-u))`, top: `calc(${(800 - s.ay).toFixed(1)} * var(--mt-u))`, width: `calc(${s.w.toFixed(1)} * var(--mt-u))`, height: `calc(${s.h.toFixed(1)} * var(--mt-u))` }}
            />
          ) : null}
        </span>
      </span>
    </span>
  );
}

function BotaoPlanosRota({ children }) {
  const navigate = useNavigate();
  return (
    <button type="button" className="mt-botao mt-botao--primario" onClick={() => navigate(MINI_TUTOR.rotaPlanos)}>
      {children}
    </button>
  );
}
function BotaoPlanos({ go }) {
  const dentro = useInRouterContext();
  const rotulo = (
    <>
      Ver planos
      <Icon name="arrow-right" size={16} />
    </>
  );
  if (typeof go === "function")
    return (
      <button type="button" className="mt-botao mt-botao--primario" onClick={() => go(MINI_TUTOR.rotaPlanos.replace(/^\//, ""))}>
        {rotulo}
      </button>
    );
  if (dentro) return <BotaoPlanosRota>{rotulo}</BotaoPlanosRota>;
  return (
    <a className="mt-botao mt-botao--primario" href={`/novo${MINI_TUTOR.rotaPlanos}`}>
      {rotulo}
    </a>
  );
}

/** Saldo do dia: mensagens de texto (e minutos de voz quando a voz está ligada). */
function Saldo({ saldo, voz }) {
  if (saldo.limite == null) return null;
  const pouco = saldo.restam > 0 && saldo.restam <= MINI_TUTOR.avisoPoucasMensagens;
  const frac = saldo.limite > 0 ? saldo.restam / saldo.limite : 0;
  return (
    <div className={`mt-saldo${pouco ? " mt-saldo--pouco" : ""}${saldo.restam <= 0 ? " mt-saldo--zero" : ""}`} aria-label="Saldo do Tutor hoje">
      <div className="mt-saldo__linha">
        <span>
          <b>{saldo.restam}</b> de {saldo.limite} mensagens restantes hoje
        </span>
        {voz != null && <span className="mt-saldo__voz">{voz} min de voz</span>}
      </div>
      <span className="mt-saldo__barra" aria-hidden="true">
        <span style={{ width: `${Math.round(frac * 100)}%` }} />
      </span>
      {pouco && (
        <span className="mt-saldo__aviso" role="status">
          {saldo.restam === 1 ? "Resta 1 mensagem hoje." : `Restam ${saldo.restam} mensagens hoje.`}
        </span>
      )}
    </div>
  );
}

/**
 * <MiniTutor contexto evitar? go? />
 *  contexto: ver contexto.js (contextoDaQuestao, contextoDaRevisao, contextoDaAula). null = não aparece.
 *  evitar: seletor CSS do que a janelinha não pode cobrir (enunciado, pergunta, alternativas, botão de responder; aula: a coluna de
 *          leitura). Padrão: MINI_TUTOR.evitarPadrao.
 */
export function MiniTutor({ contexto, evitar = MINI_TUTOR.evitarPadrao, go = null }) {
  const { backend } = useSession() ?? {};
  if (!contexto || !backend || !tutorAvailable(backend)) return null;
  return <MiniTutorJanela backend={backend} contexto={contexto} evitar={evitar} go={go} />;
}

function MiniTutorJanela({ backend, contexto, evitar, go }) {
  const [aberto, setAberto] = React.useState(false);
  const [modo, setModo] = React.useState("texto"); // texto | voz
  const [vozSessao, setVozSessao] = React.useState(null);
  const [servidorVoz, setServidorVoz] = React.useState(null);
  const [abrindoVoz, setAbrindoVoz] = React.useState(false);
  const [texto, setTexto] = React.useState("");
  const [digitando, setDigitando] = React.useState(false);
  const [naoLida, setNaoLida] = React.useState(false);
  const [manual, setManual] = React.useState(null); // { x, y, h }: onde o aluno arrastou (só nesta questão; nada fica gravado)
  const [tamanho, setTamanho] = React.useState(MINI_TUTOR.folha.inicial); // celular: compacta | media | alta
  const [puxando, setPuxando] = React.useState(0); // celular: quanto o aluno está arrastando a folha para baixo (px)
  const celular = useCelular();
  const tablet = useTablet();
  const reduzido = useMovimentoReduzido();
  const abrirTutor = useTutorDock();
  const mt = useMiniTutor({ backend, contexto, aberto });
  const tituloId = React.useId();
  const painel = React.useRef(null);
  const bolinha = React.useRef(null);
  const campo = React.useRef(null);
  const lista = React.useRef(null);
  const arrasto = React.useRef(null);
  const gesto = React.useRef(null);
  const focoAoAbrir = React.useRef(false);

  const st = mt.status;
  const pref = st?.preferences ?? {};
  const personagem = personagemValido(pref.character) ?? personagemDe(pref.personality_id) ?? lerPersonagem(pref.personality_id ?? null);
  const nomePersonagem = PERSONAGENS[personagem]?.nome ?? "Tutor";
  // resposta que passa de ~600 ms: "Stazia está conferindo a fonte…" (frases de espera, decisão do dono de 17/10)
  const conferindo = useDemorou(mt.enviando);
  const personalidade = (st?.personalities ?? []).find((p) => p.id === pref.personality_id) ?? null;
  const fase = faseDaQuestao(contexto);
  const ent = st?.entitlement ?? null;
  const vozMin = ent?.voice?.enabled ? Math.max(0, Math.floor((ent.voice.remaining_today_s ?? ent.voice.remaining_s ?? 0) / 60)) : null;
  const vozPossivel = MINI_TUTOR.vozLigada && Boolean(st?.voice_enabled) && Boolean(ent?.voice?.enabled) && realtimeSupport();
  const vozLiberadaAqui = fase !== "antes" || MINI_TUTOR.vozAntesDeResponder;
  const podeVoz = vozPossivel && ent?.can_voice !== false && vozLiberadaAqui;

  // posição: celular = folha embaixo e aba na borda; computador = coluna livre, espaço aberto na página, ou onde o aluno arrastou
  const chave = chaveDoContexto(contexto);
  const auto = usePosicaoAuto({ evitar, celular, tablet, aberto, ativo: true, chave });
  useEspacoNaPagina(!celular && aberto && !manual ? auto.reserva : 0);
  const teclado = useTeclado(celular && aberto && digitando);
  // outra questão (ou respondeu): a janelinha volta ao lugar automático
  React.useEffect(() => setManual(null), [chave]);
  const pos = !celular && manual && aberto ? { ...limitar(manual, auto.w ?? medidasDaJanela({ tablet }).larguras[0], manual.h), h: manual.h } : null;

  // nova resposta com a janelinha minimizada: a bolinha avisa
  const ultimas = mt.mensagens.length;
  const vistas = React.useRef(0);
  React.useEffect(() => {
    if (aberto) {
      vistas.current = ultimas;
      setNaoLida(false);
    } else if (ultimas > vistas.current && mt.mensagens[ultimas - 1]?.role === "tutor" && !mt.mensagens[ultimas - 1]?.local) setNaoLida(true);
  }, [ultimas, aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  // a conversa rola até a última fala
  React.useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ultimas, mt.enviando, aberto, teclado.baixo]);

  // foco: no computador, abrir leva para o campo; no celular, para a janelinha (o teclado só sobe quando o aluno toca no campo);
  // minimizar volta para a bolinha
  React.useEffect(() => {
    if (!focoAoAbrir.current) return;
    if (aberto && !mt.motivo && !st && !mt.erroStatus) {
      painel.current?.focus?.({ preventScroll: true }); // carregando: o foco fica na janelinha
      return;
    }
    focoAoAbrir.current = false;
    const alvo = aberto
      ? celular
        ? painel.current
        : campo.current ?? painel.current?.querySelector(".mt-corpo button:not([disabled]), .mt-corpo a[href]") ?? painel.current
      : bolinha.current;
    alvo?.focus?.({ preventScroll: true });
  });

  const abrir = () => {
    focoAoAbrir.current = true;
    setTamanho(MINI_TUTOR.folha.inicial);
    setAberto(true);
  };
  const minimizar = React.useCallback(() => {
    focoAoAbrir.current = true;
    setPuxando(0);
    setAberto(false);
  }, []);
  const sairDaVoz = () => {
    setModo("texto");
    setVozSessao(null);
    void mt.lerStatus(); // os minutos de voz mudaram
  };
  const fechar = () => {
    if (modo === "voz") sairDaVoz();
    mt.reiniciar();
    setTexto("");
    setManual(null);
    minimizar();
  };

  // Esc minimiza (sem fechar a conversa)
  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      minimizar();
    }
  };

  const enviar = async (e) => {
    e?.preventDefault?.();
    const t = texto.trim();
    if (!t || mt.enviando) return;
    setTexto("");
    await mt.enviar(t);
  };

  const ligarVoz = async () => {
    if (!podeVoz || abrindoVoz) return;
    unlockAudio(); // o toque do aluno libera o som (Safari e iPhone)
    setAbrindoVoz(true);
    try {
      const c = await mt.garantirConversa();
      const s = await tutorServerStatus(backend).catch(() => null);
      setServidorVoz({ live: Boolean(s?.live_voice), hint: s?.voice_hint ?? null });
      setVozSessao(c.id);
      setModo("voz");
    } catch {
      // o erro aparece como aviso no texto (mesma mensagem do Tutor)
    } finally {
      setAbrindoVoz(false);
    }
  };

  // ---------------------------------------------------------------- computador: arrastar pelo topo (mouse/caneta) ou setas no "Mover"
  const altAtual = () => painel.current?.getBoundingClientRect().height ?? auto.h ?? MINI_TUTOR.janela.alturaMin;
  const larguraAtual = auto.w ?? medidasDaJanela({ tablet }).larguras[0];
  const comecarArrasto = (e) => {
    if (celular || e.button > 0 || e.target.closest("button")) return;
    const r = painel.current?.getBoundingClientRect();
    if (!r) return;
    arrasto.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, h: Math.round(r.height) };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const moverArrasto = (e) => {
    const a = arrasto.current;
    if (!a) return;
    setManual({ ...limitar({ x: e.clientX - a.dx, y: e.clientY - a.dy }, larguraAtual, a.h), h: a.h });
  };
  const soltarArrasto = () => {
    arrasto.current = null;
  };
  const voltarAoCanto = () => {
    setManual(null);
    painel.current?.focus?.({ preventScroll: true });
  };
  const moverTeclado = (e) => {
    const passo = e.shiftKey ? 64 : 24;
    const d = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
    if (e.key === "Home") {
      e.preventDefault();
      setManual(null);
      return;
    }
    if (!d) return;
    e.preventDefault();
    const r = painel.current?.getBoundingClientRect();
    const h = manual?.h ?? Math.round(altAtual());
    const base = manual ?? { x: r?.left ?? auto.x ?? 0, y: r?.top ?? auto.y ?? 0 };
    setManual({ ...limitar({ x: base.x + d[0], y: base.y + d[1] }, larguraAtual, h), h });
  };

  // ---------------------------------------------------------------- celular: puxador da folha (toque minimiza; arrastar troca a altura)
  const iTam = TAMANHOS_FOLHA.indexOf(tamanho);
  const menor = () => (iTam <= 0 ? minimizar() : setTamanho(TAMANHOS_FOLHA[iTam - 1]));
  const maior = () => setTamanho(TAMANHOS_FOLHA[Math.min(TAMANHOS_FOLHA.length - 1, iTam + 1)]);
  const gestoInicio = (e) => {
    if (!celular || e.button > 0 || (e.target.closest("button") && !e.target.closest(".mt-puxador"))) return;
    gesto.current = { y: e.clientY, puxador: Boolean(e.target.closest(".mt-puxador")), id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const gestoMove = (e) => {
    const g = gesto.current;
    if (!g) return;
    setPuxando(Math.max(0, e.clientY - g.y));
  };
  const gestoFim = (e) => {
    const g = gesto.current;
    if (!g) return;
    gesto.current = null;
    setPuxando(0);
    const dy = e.clientY - g.y;
    if (dy > 60) menor();
    else if (dy < -40) maior();
    else if (Math.abs(dy) < 8 && g.puxador && e.type === "pointerup") minimizar(); // toque no puxador
  };
  const gestoCancela = () => {
    gesto.current = null;
    setPuxando(0);
  };

  // ---------------------------------------------------------------- estado do personagem
  const estado = mt.enviando ? "thinking" : mt.falando ? "speaking" : digitando ? "listening" : "idle";
  const rotuloFase = mt.motivo === "simulado" ? "Travado até a entrega" : mt.motivo ? "Sem conversa nesta questão" : fase === "antes" ? "Só pistas, sem a resposta" : fase === "depois" ? "Explicação completa" : contexto.tipo === "aula" ? contexto.secao || contexto.tema?.title : contexto.rotulo;

  // ---------------------------------------------------------------- corpo da janelinha
  let corpo;
  if (mt.motivo) {
    const textos = {
      simulado: [TEXTOS.travadoTitulo, TEXTOS.travadoTexto],
      inedita: ["Questão Inédita", TEXTOS.inedita],
      anulada: ["Questão anulada", TEXTOS.anulada],
    }[mt.motivo];
    corpo = (
      <div className="mt-trava">
        <span className="mt-trava__icone" aria-hidden="true">
          <Icon name="lock" size={20} />
        </span>
        <p className="mt-trava__titulo">{textos[0]}</p>
        <p className="mt-trava__texto">{textos[1]}</p>
        <button type="button" className="mt-botao" onClick={minimizar}>
          Entendi
        </button>
      </div>
    );
  } else if (!st) {
    corpo = mt.erroStatus ? (
      <div className="mt-trava">
        <p className="mt-trava__texto" role="alert">{mt.erroStatus}</p>
        <button type="button" className="mt-botao" onClick={() => void mt.lerStatus()}>
          Tentar de novo
        </button>
      </div>
    ) : (
      <p className="mt-carregando" role="status">Carregando…</p>
    );
  } else if (!st.enabled) {
    corpo = (
      <div className="mt-trava">
        <p className="mt-trava__titulo">O Tutor ainda não está ligado</p>
        <p className="mt-trava__texto">Ele entra no ar quando a equipe StaziaMed ligar. As questões seguem funcionando.</p>
      </div>
    );
  } else if (st.consent_required) {
    corpo = (
      <div className="mt-trava">
        <p className="mt-trava__titulo">Antes de conversar, aceite o termo do Tutor</p>
        <p className="mt-trava__texto">É rapidinho e vale para o mini tutor e para o Tutor completo.</p>
        {abrirTutor && (
          <button type="button" className="mt-botao mt-botao--primario" onClick={() => (minimizar(), abrirTutor({ mode: "livre" }))}>
            Ler e aceitar o termo
          </button>
        )}
        <button type="button" className="mt-botao" onClick={() => void mt.lerStatus()}>
          Já aceitei
        </button>
      </div>
    );
  } else if (!st.available) {
    const expirou = ent?.block_reason === "trial_expired";
    corpo = (
      <div className="mt-trava">
        <span className="mt-trava__icone" aria-hidden="true">
          <Icon name="lock" size={20} />
        </span>
        <p className="mt-trava__titulo">{expirou ? "Seu teste grátis do Tutor terminou" : "O Tutor faz parte dos planos pagos"}</p>
        <p className="mt-trava__texto">As questões e os flashcards continuam abertos.</p>
        <BotaoPlanos go={go} />
      </div>
    );
  } else {
    // as perguntas prontas aparecem no começo; a pista (antes de responder) fica sempre à mão
    const sugestoes = atalhos(contexto).filter((s) => mt.mensagens.length <= 3 || s.acao === "hint");
    const pistasAcabaram = fase === "antes" && mt.pistas >= MINI_TUTOR.pistaMaxima;
    corpo = (
      <>
        {modo === "voz" && vozSessao ? (
          <React.Suspense fallback={<p className="mt-carregando" role="status">Preparando a voz…</p>}>
            <MiniVoz
              backend={backend} sessionId={vozSessao} personagem={personagemDe(personalidade?.id) ?? personagem} servidor={servidorVoz} minutosHoje={vozMin} reduzido={reduzido}
              onTranscricao={(role, t) => mt.acrescentar({ role, texto: t, voz: true })} onSair={sairDaVoz}
            />
          </React.Suspense>
        ) : null}
        <div className="mt-lista" ref={lista} role="log" aria-live="polite" aria-label="Conversa com o Tutor" tabIndex={0}>
          {mt.mensagens.map((m) => (
            <div key={m.id} className={`mt-msg mt-msg--${m.role}`}>
              {m.role === "tutor" && <span className="mt-sr">{nomePersonagem}: </span>}
              {m.role === "aluno" && <span className="mt-sr">Você: </span>}
              {m.texto}
            </div>
          ))}
          {mt.enviando && (
            <div className="mt-msg mt-msg--tutor mt-msg--pensando" aria-label={conferindo ? textoConferindo(nomePersonagem) : `${nomePersonagem} está pensando`}>
              <span />
              <span />
              <span />
              {conferindo && <em className="mt-conferindo">{textoConferindo(nomePersonagem)}</em>}
            </div>
          )}
        </div>
        {mt.erro && <p className="mt-aviso mt-aviso--erro" role="alert">{mt.erro}</p>}
        {mt.esgotado ? (
          <div className="mt-acabou" role="alert">
            <p className="mt-acabou__titulo">{TEXTOS.saldoAcabouTitulo}</p>
            <p className="mt-acabou__texto">{TEXTOS.saldoAcabouTexto}</p>
            <BotaoPlanos go={go} />
          </div>
        ) : (
          modo === "texto" && (
            <>
              {sugestoes.length > 0 && (
                <div className="mt-atalhos" role="group" aria-label="Perguntas prontas">
                  {sugestoes.map((s) => (
                    <button
                      key={s.id} type="button" className="mt-atalho" disabled={mt.enviando || (s.acao === "hint" && pistasAcabaram)}
                      onClick={() => (s.acao === "hint" ? mt.pista() : mt.enviar(s.texto))}
                    >
                      {s.acao === "hint" && <Icon name="lightbulb" size={14} />}
                      {s.rotulo}
                    </button>
                  ))}
                </div>
              )}
              <form className="mt-escrever" onSubmit={enviar}>
                <label className="mt-sr" htmlFor={`${tituloId}-campo`}>
                  Sua pergunta para {nomePersonagem}
                </label>
                <textarea
                  id={`${tituloId}-campo`} ref={campo} rows={1} value={texto} maxLength={2000} enterKeyHint="send"
                  placeholder={fase === "antes" ? "Peça uma pista ou tire uma dúvida…" : "Escreva sua dúvida…"}
                  onChange={(e) => setTexto(e.target.value)} onFocus={() => setDigitando(true)} onBlur={() => setDigitando(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void enviar();
                    }
                  }}
                />
                {vozPossivel && (
                  <button
                    type="button" className="mt-icone" onClick={ligarVoz} disabled={!podeVoz || abrindoVoz || mt.enviando}
                    aria-label={!vozLiberadaAqui ? TEXTOS.vozDepois : ent?.can_voice === false ? TEXTOS.vozAcabou : `Falar com ${nomePersonagem} por voz`}
                    title={!vozLiberadaAqui ? TEXTOS.vozDepois : ent?.can_voice === false ? TEXTOS.vozAcabou : "Falar por voz"}
                  >
                    <Icon name="mic" size={18} />
                  </button>
                )}
                <button type="submit" className="mt-icone mt-icone--enviar" disabled={!texto.trim() || mt.enviando} aria-label="Enviar">
                  <Icon name="send" size={18} />
                </button>
              </form>
            </>
          )
        )}
        <Saldo saldo={mt.saldo} voz={vozPossivel ? vozMin : null} />
      </>
    );
  }

  // ---------------------------------------------------------------- posição
  const nome = nomePersonagem;
  const estiloBolinha = celular
    ? { right: 0, bottom: 12 + auto.folga }
    : auto.x != null
      ? { left: auto.x, top: auto.y }
      : { right: MARGEM, bottom: MARGEM };
  const fracFolha = MINI_TUTOR.folha[tamanho] ?? MINI_TUTOR.folha.media;
  const alturaFolha = teclado.altura != null && teclado.baixo > 0
    ? `min(${Math.round(fracFolha * 100)}dvh, ${Math.max(200, teclado.altura - 12)}px)` // teclado aberto: a folha cabe na área visível
    : `${Math.round(fracFolha * 100)}dvh`;
  const estiloPainel = celular
    ? { bottom: teclado.baixo, height: alturaFolha, ...(puxando ? { transform: `translateY(${puxando}px)`, transition: "none" } : {}) }
    : pos
      ? { left: pos.x, top: pos.y, width: larguraAtual, height: pos.h }
      : auto.x != null
        ? { left: auto.x, top: auto.y, width: auto.w, height: auto.h }
        : { right: MARGEM, bottom: MARGEM, height: MINI_TUTOR.janela.alturaMin };

  const ui = (
    <div className={`mt${celular ? " mt--celular" : ""}${tablet ? " mt--tablet" : ""}${reduzido ? " mt--quieto" : ""}`} data-personagem={personagem}>
      {!aberto && (
        <button
          ref={bolinha} type="button" className={`mt-bolinha${celular ? " mt-bolinha--aba" : ""}${mt.motivo ? " mt-bolinha--trava" : ""}`} style={estiloBolinha} onClick={abrir}
          aria-label={`${TEXTOS.rotuloBolinha(nome)}${mt.motivo === "simulado" ? ", travado até a entrega do simulado" : ""}${naoLida ? ", nova resposta" : ""}`}
          aria-haspopup="dialog" aria-expanded="false" title={`${nome}: tire dúvidas aqui`}
        >
          <RostoParado personagem={personagem} tamanho={celular ? ABA.w - 6 : BOLINHA - 8} />
          {mt.motivo && (
            <span className="mt-bolinha__selo" aria-hidden="true">
              <Icon name="lock" size={celular ? 10 : 12} />
            </span>
          )}
          {!mt.motivo && naoLida && <span className="mt-bolinha__ponto" aria-hidden="true" />}
        </button>
      )}
      {aberto && (
        <section
          ref={painel} className={`mt-painel${celular ? ` mt-painel--${tamanho}` : ""}`} role="dialog" aria-modal="false" aria-labelledby={tituloId} style={estiloPainel} onKeyDown={onKeyDown} tabIndex={-1}
        >
          {celular && (
            <button
              type="button" className="mt-puxador" onClick={(e) => e.detail === 0 && minimizar()} aria-label="Minimizar o mini tutor (arraste para mudar a altura)"
              onPointerDown={gestoInicio} onPointerMove={gestoMove} onPointerUp={gestoFim} onPointerCancel={gestoCancela}
            >
              <span aria-hidden="true" />
            </button>
          )}
          <header
            className="mt-topo"
            onPointerDown={celular ? gestoInicio : comecarArrasto} onPointerMove={celular ? gestoMove : moverArrasto}
            onPointerUp={celular ? gestoFim : soltarArrasto} onPointerCancel={celular ? gestoCancela : soltarArrasto}
          >
            <Rosto personagem={personagem} estado={modo === "voz" ? "idle" : estado} avatar={mt.avatar} tamanho={celular ? 32 : tablet ? 40 : 44} reduzido={reduzido} />
            <div className="mt-topo__texto">
              <h2 id={tituloId} className="mt-topo__nome">
                {nome}
                {personalidade?.name ? <span className="mt-topo__jeito"> · {personalidade.name}</span> : null}
              </h2>
              <span className="mt-topo__fase">{rotuloFase}</span>
            </div>
            {!celular && manual && (
              <button type="button" className="mt-icone mt-icone--leve" onClick={voltarAoCanto} aria-label="Voltar o mini tutor ao canto" title="Voltar ao canto">
                <Icon name="arrow-down-right" size={16} />
              </button>
            )}
            {!celular && (
              <button type="button" className="mt-icone mt-icone--leve mt-mover" onKeyDown={moverTeclado} aria-label="Mover o mini tutor (use as setas; Home volta ao canto)" title="Arraste para mover">
                <Icon name="grip-horizontal" size={16} />
              </button>
            )}
            {celular && (
              <button
                type="button" className="mt-icone mt-icone--leve" onClick={tamanho === "alta" ? menor : maior}
                aria-label={tamanho === "alta" ? "Diminuir o mini tutor" : "Aumentar o mini tutor"}
              >
                <Icon name={tamanho === "alta" ? "chevrons-down" : "chevrons-up"} size={18} />
              </button>
            )}
            <button type="button" className="mt-icone mt-icone--leve" onClick={minimizar} aria-label="Minimizar o mini tutor">
              <Icon name="minus" size={18} />
            </button>
            <button type="button" className="mt-icone mt-icone--leve" onClick={fechar} aria-label="Fechar o mini tutor e encerrar a conversa">
              <Icon name="x" size={18} />
            </button>
          </header>
          <div className="mt-corpo">{corpo}</div>
        </section>
      )}
      {/* celular com a folha aberta: espaço no FIM da página (aqui, no fim do body) para rolar o conteúdo para cima dela */}
      {celular && aberto && <div className="mt-espaco" style={{ height: alturaFolha }} aria-hidden="true" />}
    </div>
  );
  return typeof document !== "undefined" ? createPortal(ui, document.body) : ui;
}
