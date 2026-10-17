// Mini Tutor (pedido do dono, 17/10/2026): o Tutor numa janelinha flutuante dentro da tela de Questões, Simulados e Aulas, com o
// personagem escolhido (Stazi ou Stazia) em miniatura e animado. Abre, minimiza para uma bolinha e fecha sem sair da tela.
//  - computador: janelinha no canto que se arrasta pelo topo (mouse ou setas do teclado) e foge das alternativas e do botão de
//    responder (`evitar`); celular: folha que sobe de baixo, acima do rodapé fixo da questão.
//  - contexto automático (a tela passa `contexto`, ver contexto.js); simulado em andamento: travado até a entrega.
//  - saldo: cada mensagem gasta a cota do Tutor por texto de hoje; a voz gasta os minutos de voz de hoje. O saldo fica à vista e, quando
//    acaba, aparece o aviso com o convite para ver os planos (nada é cobrado pelo app).
// Uso: <MiniTutor contexto={contextoDaQuestao(q, {...})} evitar=".tq-alts, .tq-foot" go={go} />. Fora do app (sem servidor), não aparece.
import React from "react";
import { createPortal } from "react-dom";
import { useInRouterContext, useNavigate } from "react-router-dom";
import { Icon } from "../../../ds";
import { useSession } from "../../session.jsx";
import { tutorAvailable, tutorServerStatus } from "../api.js";
import { useTutorDock } from "../TutorDrawer.jsx";
import { realtimeSupport } from "../useRealtimeVoice.js";
import { unlockAudio } from "../voice/audioUnlock.js";
import { orbEmotion } from "../voice/StaziaVoiceOrb.jsx";
import { PersonagemTutor } from "../personagens/PersonagemTutor.jsx";
import { PERSONAGENS, lerPersonagem, personagemDe, personagemValido } from "../personagens/personagens.js";
import { useMovimentoReduzido } from "../personagens/useMovimentoReduzido.js";
import { MINI_TUTOR, TEXTOS } from "./config.js";
import { atalhos, faseDaQuestao } from "./contexto.js";
import { useMiniTutor } from "./useMiniTutor.js";
import { MiniVoz } from "./MiniVoz.jsx";
import "./miniTutor.css";

const CHAVE_POS = "smn-mini-tutor-pos";
const MARGEM = 20;
const TOPO = 76; // abaixo do cabeçalho fixo das telas
const BOLINHA = 64;

function useCelular() {
  const q = `(max-width: ${MINI_TUTOR.larguraCelular - 1}px)`;
  const ler = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? Boolean(window.matchMedia(q)?.matches) : false);
  const [v, setV] = React.useState(ler);
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(q);
    const on = () => setV(Boolean(mq?.matches));
    mq?.addEventListener?.("change", on);
    return () => mq?.removeEventListener?.("change", on);
  }, [q]);
  return v;
}

const lerPos = () => {
  try {
    const p = JSON.parse(window.localStorage.getItem(CHAVE_POS) ?? "null");
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  } catch {
    return null;
  }
};
const gravarPos = (p) => {
  try {
    if (p) window.localStorage.setItem(CHAVE_POS, JSON.stringify(p));
    else window.localStorage.removeItem(CHAVE_POS);
  } catch {
    // navegação privada: a posição vale só nesta tela
  }
};
const limitar = (p, w, h) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return { x: Math.min(Math.max(8, p.x), Math.max(8, vw - w - 8)), y: Math.min(Math.max(8, p.y), Math.max(8, vh - h - 8)) };
};

/** Retângulos (na tela) do que o mini tutor não pode cobrir: alternativas e botão de responder. */
function retangulos(seletor) {
  if (!seletor || typeof document === "undefined") return [];
  const vh = window.innerHeight;
  return [...document.querySelectorAll(seletor)].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh);
}
const sobreposicao = (a, rs) =>
  rs.reduce((soma, r) => soma + Math.max(0, Math.min(a.x + a.w, r.right) - Math.max(a.x, r.left)) * Math.max(0, Math.min(a.y + a.h, r.bottom) - Math.max(a.y, r.top)), 0);

/**
 * Maior faixa vertical livre numa coluna da tela (x, x + w) entre `topo` e `base`, sem nada de `rs` na frente.
 * Devolve { y, h } (h = 0 quando não sobra nada).
 */
export function faixaLivre(rs, x, w, topo, base) {
  const cobre = rs.filter((r) => r.right > x && r.left < x + w).map((r) => [Math.max(topo, r.top - 10), Math.min(base, r.bottom + 10)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let melhor = { y: topo, h: 0 };
  let cursor = topo;
  // de baixo para cima conta como preferência: o canto de baixo vence um empate
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
 * Onde a janelinha (ou a bolinha) fica sem cobrir o que importa. No celular: a "folga" de baixo é a altura do rodapé fixo da questão
 * (o botão de responder), e a folha/bolinha sobe acima dele. No computador: a maior faixa livre na coluna da direita (ou da esquerda)
 * ao lado das alternativas e do botão; a janelinha encolhe até `hMin` para caber. Sem faixa boa, o canto que menos cobre.
 */
function usePosicaoAuto({ evitar, celular, w, h, hMin = h, ativo, chave }) {
  const [auto, setAuto] = React.useState({ x: null, y: null, h: null, folga: 0 });
  React.useEffect(() => {
    if (!ativo || typeof window === "undefined") return undefined;
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rs = retangulos(evitar);
      // rodapé preso embaixo da tela (o .tq-foot fica "sticky" no celular): a folha e a bolinha sobem acima dele
      const folga = rs.reduce((f, r) => (r.bottom >= vh - 4 && r.top > vh * 0.45 ? Math.max(f, vh - r.top) : f), 0);
      if (celular) {
        setAuto((a) => (a.folga === folga && a.x === null ? a : { x: null, y: null, h: null, folga }));
        return;
      }
      const base = vh - MARGEM;
      const colunas = [vw - w - MARGEM, MARGEM];
      let escolha = null;
      for (const x of colunas) {
        const f = faixaLivre(rs, x, w, TOPO, base);
        if (f.h >= hMin && (!escolha || f.h >= Math.min(h, escolha.f.h) + 1)) {
          escolha = { x, f };
          if (f.h >= h) break; // a da direita já cabe inteira
        }
      }
      let c;
      if (escolha) {
        const hh = Math.min(h, escolha.f.h);
        // encostada embaixo da faixa (perto do canto), como um chat
        c = { x: escolha.x, y: Math.round(escolha.f.y + escolha.f.h - hh), h: Math.round(hh) };
      } else {
        const cantos = [
          { x: vw - w - MARGEM, y: vh - h - MARGEM },
          { x: vw - w - MARGEM, y: TOPO },
          { x: MARGEM, y: vh - h - MARGEM },
          { x: MARGEM, y: TOPO },
        ].map((k) => ({ ...k, y: Math.max(8, k.y), h }));
        const custos = cantos.map((k) => sobreposicao({ ...k, w, h }, rs));
        c = cantos[custos.indexOf(Math.min(...custos))];
      }
      setAuto((a) => (a.x === c.x && a.y === c.y && a.h === c.h && a.folga === folga ? a : { ...c, folga }));
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
  }, [evitar, celular, w, h, hMin, ativo, chave]);
  return auto;
}

/** A cabeça do personagem num círculo (bolinha e topo da janelinha). */
function Rosto({ personagem, estado = "idle", avatar = null, tamanho = 44, reduzido }) {
  const emo = orbEmotion(avatar);
  return (
    <span className="mt-rosto" style={{ "--mt-rosto": `${tamanho}px` }} aria-hidden="true">
      <span className="mt-rosto__corpo">
        <PersonagemTutor personagem={personagem} conversationState={estado} emotion={emo.emotion} emotionIntensity={emo.intensity} reduzido={reduzido} decorativo />
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
 *  evitar: seletor CSS do que a janelinha não pode cobrir (alternativas, botão de responder).
 */
export function MiniTutor({ contexto, evitar = null, go = null }) {
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
  const [manual, setManual] = React.useState(lerPos);
  const celular = useCelular();
  const reduzido = useMovimentoReduzido();
  const abrirTutor = useTutorDock();
  const mt = useMiniTutor({ backend, contexto, aberto });
  const tituloId = React.useId();
  const painel = React.useRef(null);
  const bolinha = React.useRef(null);
  const campo = React.useRef(null);
  const lista = React.useRef(null);
  const arrasto = React.useRef(null);
  const focoAoAbrir = React.useRef(false);

  const st = mt.status;
  const pref = st?.preferences ?? {};
  const personagem = personagemValido(pref.character) ?? personagemDe(pref.personality_id) ?? lerPersonagem(pref.personality_id ?? null);
  const nomePersonagem = PERSONAGENS[personagem]?.nome ?? "Tutor";
  const personalidade = (st?.personalities ?? []).find((p) => p.id === pref.personality_id) ?? null;
  const fase = faseDaQuestao(contexto);
  const ent = st?.entitlement ?? null;
  const vozMin = ent?.voice?.enabled ? Math.max(0, Math.floor((ent.voice.remaining_today_s ?? ent.voice.remaining_s ?? 0) / 60)) : null;
  const vozPossivel = MINI_TUTOR.vozLigada && Boolean(st?.voice_enabled) && Boolean(ent?.voice?.enabled) && realtimeSupport();
  const vozLiberadaAqui = fase !== "antes" || MINI_TUTOR.vozAntesDeResponder;
  const podeVoz = vozPossivel && ent?.can_voice !== false && vozLiberadaAqui;

  // posição: celular = folha/bolinha acima do rodapé; computador = canto livre (ou onde o aluno arrastou)
  const larg = aberto ? MINI_TUTOR.janela.largura : BOLINHA;
  const alt = aberto ? Math.min(MINI_TUTOR.janela.altura, typeof window !== "undefined" ? window.innerHeight - TOPO - MARGEM : MINI_TUTOR.janela.altura) : BOLINHA;
  const auto = usePosicaoAuto({ evitar, celular, w: larg, h: alt, hMin: aberto ? MINI_TUTOR.janela.alturaMin : BOLINHA, ativo: true, chave: `${aberto}:${contexto ? JSON.stringify([contexto.questao?.id, contexto.respondida]) : ""}` });
  const pos = !celular && manual && aberto ? limitar(manual, larg, alt) : null;

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
  }, [ultimas, mt.enviando, aberto]);

  // foco: abrir leva para o campo (ou o primeiro botão); minimizar volta para a bolinha
  React.useEffect(() => {
    if (!focoAoAbrir.current) return;
    if (aberto && !mt.motivo && !st && !mt.erroStatus) {
      painel.current?.focus?.(); // carregando: o foco fica na janelinha e vai para o campo quando ele aparecer
      return;
    }
    focoAoAbrir.current = false;
    const alvo = aberto ? campo.current ?? painel.current?.querySelector(".mt-corpo button:not([disabled]), .mt-corpo a[href]") ?? painel.current : bolinha.current;
    alvo?.focus?.();
  });

  const abrir = () => {
    focoAoAbrir.current = true;
    setAberto(true);
  };
  const minimizar = React.useCallback(() => {
    focoAoAbrir.current = true;
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

  // arrastar pelo topo (computador): mouse/caneta; teclado: setas no botão "Mover"
  const comecarArrasto = (e) => {
    if (celular || e.button > 0 || e.target.closest("button")) return;
    const r = painel.current?.getBoundingClientRect();
    if (!r) return;
    arrasto.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const moverArrasto = (e) => {
    const a = arrasto.current;
    if (!a) return;
    setManual(limitar({ x: e.clientX - a.dx, y: e.clientY - a.dy }, larg, alt));
  };
  const soltarArrasto = () => {
    if (!arrasto.current) return;
    arrasto.current = null;
    setManual((p) => (gravarPos(p), p));
  };
  const moverTeclado = (e) => {
    const passo = e.shiftKey ? 64 : 24;
    const d = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
    if (e.key === "Home") {
      e.preventDefault();
      setManual(null);
      gravarPos(null);
      return;
    }
    if (!d) return;
    e.preventDefault();
    const r = painel.current?.getBoundingClientRect();
    const base = manual ?? { x: r?.left ?? auto.x ?? 0, y: r?.top ?? auto.y ?? 0 };
    const p = limitar({ x: base.x + d[0], y: base.y + d[1] }, larg, alt);
    setManual(p);
    gravarPos(p);
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
          <MiniVoz
            backend={backend} sessionId={vozSessao} personagem={personagemDe(personalidade?.id) ?? personagem} servidor={servidorVoz} minutosHoje={vozMin} reduzido={reduzido}
            onTranscricao={(role, t) => mt.acrescentar({ role, texto: t, voz: true })} onSair={sairDaVoz}
          />
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
            <div className="mt-msg mt-msg--tutor mt-msg--pensando" aria-label={`${nomePersonagem} está pensando`}>
              <span />
              <span />
              <span />
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
                  id={`${tituloId}-campo`} ref={campo} rows={1} value={texto} maxLength={2000}
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

  // ---------------------------------------------------------------- bolinha (minimizado)
  const nome = nomePersonagem;
  const estiloBolinha = celular
    ? { right: 16, bottom: 16 + auto.folga }
    : auto.x != null
      ? { left: auto.x, top: auto.y }
      : { right: MARGEM, bottom: MARGEM };
  const estiloPainel = celular
    ? { bottom: auto.folga, height: `min(${Math.round(MINI_TUTOR.folhaAlturaMax * 100)}dvh, calc(100dvh - ${auto.folga}px - 72px))` }
    : pos
      ? { left: pos.x, top: pos.y, height: alt }
      : auto.x != null
        ? { left: auto.x, top: auto.y, height: auto.h ?? alt }
        : { right: MARGEM, bottom: MARGEM, height: alt };

  const ui = (
    <div className={`mt${celular ? " mt--celular" : ""}${reduzido ? " mt--quieto" : ""}`} data-personagem={personagem}>
      {!aberto && (
        <button
          ref={bolinha} type="button" className={`mt-bolinha${mt.motivo ? " mt-bolinha--trava" : ""}`} style={estiloBolinha} onClick={abrir}
          aria-label={`${TEXTOS.rotuloBolinha(nome)}${mt.motivo === "simulado" ? ", travado até a entrega do simulado" : ""}${naoLida ? ", nova resposta" : ""}`}
          aria-haspopup="dialog" aria-expanded="false" title={`${nome}: tire dúvidas aqui`}
        >
          <Rosto personagem={personagem} tamanho={BOLINHA - 8} reduzido={reduzido} />
          {mt.motivo && (
            <span className="mt-bolinha__selo" aria-hidden="true">
              <Icon name="lock" size={12} />
            </span>
          )}
          {!mt.motivo && naoLida && <span className="mt-bolinha__ponto" aria-hidden="true" />}
        </button>
      )}
      {aberto && (
        <section
          ref={painel} className="mt-painel" role="dialog" aria-modal="false" aria-labelledby={tituloId} style={estiloPainel} onKeyDown={onKeyDown} tabIndex={-1}
        >
          {celular && (
            <button type="button" className="mt-puxador" onClick={minimizar} aria-label="Minimizar o mini tutor">
              <span aria-hidden="true" />
            </button>
          )}
          <header className="mt-topo" onPointerDown={comecarArrasto} onPointerMove={moverArrasto} onPointerUp={soltarArrasto} onPointerCancel={soltarArrasto}>
            <Rosto personagem={personagem} estado={modo === "voz" ? "idle" : estado} avatar={mt.avatar} tamanho={44} reduzido={reduzido} />
            <div className="mt-topo__texto">
              <h2 id={tituloId} className="mt-topo__nome">
                {nome}
                {personalidade?.name ? <span className="mt-topo__jeito"> · {personalidade.name}</span> : null}
              </h2>
              <span className="mt-topo__fase">{rotuloFase}</span>
            </div>
            {!celular && (
              <button type="button" className="mt-icone mt-icone--leve mt-mover" onKeyDown={moverTeclado} aria-label="Mover o mini tutor (use as setas; Home volta ao canto)" title="Arraste para mover">
                <Icon name="grip-horizontal" size={16} />
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
    </div>
  );
  return (
    <>
      {/* celular com a folha aberta: espaço no fim da página para rolar o conteúdo para cima dela */}
      {celular && aberto && <div className="mt-espaco" aria-hidden="true" />}
      {typeof document !== "undefined" ? createPortal(ui, document.body) : ui}
    </>
  );
}
