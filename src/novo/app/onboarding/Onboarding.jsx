// Onboarding inteligente: apresentação → configuração (7 perguntas, cada uma salva no Supabase ao continuar) → nivelamento
// (o EXISTENTE, opcional) → seu plano (o Plano de Hoje real) → painel com o tour.
// modo "primeira": tela cheia antes do app, para a conta nova (o servidor decide em app_onboarding_estado.mostrar).
// modo "refazer": pela Conta → Ajuda ("Refazer apresentação") ou pelo Início (convite / Primeiros passos); fecha e volta ao app.
// Quem decide acesso, teste e plano é sempre o servidor: aqui só se pergunta e se guarda a preferência.
import React from "react";
import { useNavigate } from "react-router-dom";
import { Banner, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../shell/useLayout.js";
import { Nivelamento } from "../nivelamento/Nivelamento.jsx";
import { Apresentacao, BotoesApresentacao } from "./Apresentacao.jsx";
import { Trilha } from "./Trilha.jsx";
import {
  PassoDificuldades, PassoFase, PassoJeito, PassoLembretes, PassoProva, PassoRotina, PassoTutor,
  dificuldadesInicial, dificuldadesValida, faseInicial, faseValida, lembretesInicial, provaErro, provaValida, rotinaInicial, rotinaValida,
  tutorInicial, tutorValido,
} from "./Passos.jsx";
import { CENAS, PASSOS_TEXTO, TITULO } from "./textos.js";
import { PERGUNTAS, etapasVisiveis, ordem, passoInicial, passosVisiveis } from "./estado.js";
import "./onboarding.css";

export function deveMostrarOnboarding(boot) {
  return Boolean(boot?.onboarding?.mostrar);
}

function aplicarTema(tema) {
  const escuro = tema === "dark" || (tema === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = escuro ? "dark" : "light";
}

/** O que cada pergunta manda ao banco (app_onboarding_salvar). */
function dadosDoPasso(passo, v) {
  if (passo === "fase") return v.prioridade ? { prioridade: v.prioridade } : v.escolha ? { escolha: v.escolha } : {};
  if (passo === "prova") return { exam_date: v.semData ? null : v.data || null };
  if (passo === "rotina") return { daily_minutes: v.minutos, dias_semana: v.dias };
  if (passo === "dificuldades") return { areas: v.nenhuma ? [] : v.areas };
  if (passo === "jeito") return { jeito: v.jeito };
  if (passo === "tutor") return { personagem: v.personagem, personalidade: v.personalidade };
  if (passo === "lembretes") return { quer: Boolean(v.quer), horario: v.quer ? v.horario || null : null };
  return {};
}

function valoresIniciais(estado) {
  const p = estado.preferencias || {};
  return {
    fase: faseInicial(estado),
    prova: { data: p.exam_date || "", semData: false },
    rotina: rotinaInicial(estado),
    dificuldades: dificuldadesInicial(estado),
    jeito: { jeito: p.jeito_estudar || null },
    tutor: tutorInicial(estado),
    lembretes: lembretesInicial(estado),
  };
}

const VALIDO = {
  fase: (estado, v) => faseValida(estado, v),
  prova: (_e, v) => provaValida(v),
  rotina: (_e, v) => rotinaValida(v),
  dificuldades: (_e, v) => dificuldadesValida(v),
  jeito: (_e, v) => Boolean(v.jeito),
  tutor: (_e, v) => tutorValido(v),
  lembretes: (_e, v) => !v.quer || /^([01]\d|2[0-3]):[0-5]\d$/.test(v.horario || ""),
};

/** Moldura de tela cheia: barra do topo (logo, nome, sair), progresso em 4 etapas, conteúdo e rodapé com os botões. */
function Moldura({ estado, passo, modo, onSair, rotuloSair, ocupado, rodape, largura = "estreita", children }) {
  const etapas = etapasVisiveis(estado);
  const atual = Math.max(0, etapas.findIndex((e) => e.passos.includes(passo)));
  const nPergunta = PERGUNTAS.indexOf(passo);
  return (
    <div className={`ob ob--${largura}`}>
      <header className="ob-top">
        <span className="ob-logo">
          <img className="ob-logo__claro" src="/brand/horizontal-480w.png" alt="StaziaMed Revalida" />
          <img className="ob-logo__escuro" src="/brand/horizontal-escuro-480w.png" alt="" aria-hidden="true" />
        </span>
        <span className="ob-top__rotulo">
          <span aria-hidden="true" />
          {modo === "refazer" ? "Rever a apresentação" : TITULO}
        </span>
        <button type="button" className="ob-top__sair" onClick={onSair} disabled={ocupado}>
          {modo === "refazer" ? <Icon name="x" size={18} /> : null}
          <span>{rotuloSair}</span>
        </button>
      </header>
      <nav className="ob-prog" aria-label="Etapas">
        <ol>
          {etapas.map((e, i) => (
            <li key={e.id} className={i < atual ? "feito" : i === atual ? "atual" : ""} aria-current={i === atual ? "step" : undefined}>
              <i aria-hidden="true">{i === atual && nPergunta >= 0 ? <b style={{ width: `${((nPergunta + 1) / PERGUNTAS.length) * 100}%` }} /> : null}</i>
              <span>{e.rotulo}</span>
            </li>
          ))}
        </ol>
        <span className="ob-prog__txt" aria-live="polite">
          Etapa {atual + 1} de {etapas.length}
          {nPergunta >= 0 ? ` · pergunta ${nPergunta + 1} de ${PERGUNTAS.length}` : ""}
        </span>
      </nav>
      <main className="ob-main">{children}</main>
      {rodape ? <footer className="ob-rodape"><div className="ob-rodape__in">{rodape}</div></footer> : null}
    </div>
  );
}

export function Onboarding({ modo = "primeira", inicio = null, go }) {
  const { backend, boot, refresh, setOnboarding } = useSession();
  const navigate = useNavigate();
  const mobile = useMobile();
  const [estado, setEstado] = React.useState(boot.onboarding);
  const [passo, setPasso] = React.useState(() => passoInicial(boot.onboarding, inicio));
  const [cena, setCena] = React.useState(0);
  const [valores, setValores] = React.useState(() => valoresIniciais(boot.onboarding || {}));
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState(null);
  const titulo = React.useRef(null);

  React.useEffect(() => {
    if (modo === "primeira") aplicarTema(boot.profile?.theme);
  }, [modo, boot.profile?.theme]);

  // cada passo (e cada cena) começa do topo, com o foco no título (o leitor de tela anuncia a pergunta)
  React.useEffect(() => {
    if (!/jsdom/i.test(navigator.userAgent)) window.scrollTo?.(0, 0);
    titulo.current?.focus({ preventScroll: true });
  }, [passo, cena]);

  const visiveis = passosVisiveis(estado);
  const indice = visiveis.indexOf(passo);

  // publicar=false: ao sair da tela cheia (concluir/pular), quem troca a abertura inteira é o refresh(); publicar antes faria o
  // app aparecer com o nivelamento antigo por um instante (e, se o refresh falhasse, o aviso de erro sumiria com a tela)
  const salvar = async (p, dados = {}, publicar = true) => {
    const e = await backend.rpc("app_onboarding_salvar", { p_passo: p, p_dados: dados });
    setEstado(e);
    if (publicar) setOnboarding(e);
    return e;
  };
  const executar = async (fn) => {
    setOcupado(true);
    setErro(null);
    try {
      await fn();
    } catch (err) {
      setErro(err?.message || "Não foi possível salvar. Verifique a conexão e tente de novo.");
    } finally {
      setOcupado(false);
    }
  };
  const irPara = (p) => {
    setErro(null);
    setPasso(p);
  };
  // o próximo passo visível DEPOIS de p na ordem do banco (p pode não estar na lista, como o nivelamento de quem não o faz)
  const proximoDe = (p, e = estado) => passosVisiveis(e).find((x) => ordem(x) > ordem(p)) ?? "trilha";

  /** Fecha o onboarding e entra no app (primeira vez: recarrega a abertura e o app aparece; refazer: volta para a rota). */
  const entrarNoApp = async (destino = null) => {
    if (modo === "primeira") {
      await refresh();
      if (destino) navigate(destino);
    } else if (destino) navigate(destino);
    else go?.("home");
  };

  const fimApresentacao = () => executar(async () => {
    const e = await salvar("apresentacao");
    irPara(proximoDe("apresentacao", e));
  });
  const continuarPergunta = () => executar(async () => {
    const e = await salvar(passo, dadosDoPasso(passo, valores[passo]));
    // nivelamento já feito (ou que não cabe): o servidor registra e o passo some da lista
    let prox = proximoDe(passo, e);
    if (prox === "trilha" && e.nivelamento && !e.etapas?.nivelamento) {
      const n = await salvar("nivelamento");
      prox = proximoDe("nivelamento", n);
    }
    irPara(prox);
  });
  const voltar = () => irPara(visiveis[Math.max(0, indice - 1)]);
  const pularTudo = () => executar(async () => {
    if (modo === "refazer") return entrarNoApp();
    await salvar("pular", {}, false);
    await entrarNoApp();
  });
  const concluir = (destino = null) => executar(async () => {
    await salvar("concluir", {}, modo !== "primeira");
    await entrarNoApp(destino);
  });

  // ---------------------------------------------------------------- nivelamento: o componente existente, sem mudar o fluxo dele
  if (passo === "nivelamento") {
    return (
      <Nivelamento
        modo="primeira"
        go={() => {}}
        aoSair={async () => {
          // o nivelamento já guardou a parte dele; se a anotação do onboarding falhar, segue mesmo assim (o "concluir" refaz)
          try {
            const e = await salvar("nivelamento");
            irPara(proximoDe("nivelamento", e));
          } catch {
            irPara("trilha");
          }
        }}
      />
    );
  }

  const sair = modo === "refazer" ? { rotulo: "Fechar", acao: () => entrarNoApp() } : { rotulo: "Pular tudo", acao: pularTudo };
  const erroBanner = erro ? <Banner tone="danger">{erro}</Banner> : null;

  // ---------------------------------------------------------------- apresentação
  if (passo === "apresentacao") {
    const contexto = { questoes: boot.totals?.questions ?? 0, arena: boot.play?.enabled !== false };
    return (
      <Moldura estado={estado} passo={passo} modo={modo} onSair={sair.acao} rotuloSair={sair.rotulo} ocupado={ocupado} largura="larga"
        rodape={<BotoesApresentacao cena={cena} setCena={setCena} onFim={fimApresentacao} onPular={fimApresentacao} ocupado={ocupado} />}>
        {erroBanner}
        <Apresentacao contexto={contexto} cena={cena} setCena={setCena} onFim={fimApresentacao} ocupado={ocupado} mobile={mobile} tituloRef={titulo} />
      </Moldura>
    );
  }

  // ---------------------------------------------------------------- seu plano
  if (passo === "trilha") {
    return (
      <Moldura estado={estado} passo={passo} modo={modo} onSair={sair.acao} rotuloSair={sair.rotulo} ocupado={ocupado}
        rodape={
          <>
            <span className="ob-rodape__esq">
              <button type="button" className="ob-btn ob-btn--sec" onClick={() => irPara("rotina")} disabled={ocupado}>
                <Icon name="sliders-horizontal" size={18} /> Ajustar<span className="ob-so-largo-txt"> respostas</span>
              </button>
            </span>
            <button type="button" className="ob-btn ob-btn--pri" onClick={() => concluir()} disabled={ocupado} aria-busy={ocupado || undefined}>
              {modo === "refazer" ? "Voltar ao painel" : "Ir para o meu painel"} <Icon name="arrow-right" size={18} />
            </button>
          </>
        }>
        <Trilha estado={estado} mobile={mobile} tituloRef={titulo} erro={erro} setErro={setErro} onPronto={() => salvar("trilha").catch(() => {})} />
      </Moldura>
    );
  }

  // ---------------------------------------------------------------- perguntas
  const valor = valores[passo] ?? {};
  const setValor = (v) => setValores((s) => ({ ...s, [passo]: v }));
  const valido = VALIDO[passo]?.(estado, valor) ?? true;
  const aviso = passo === "prova" ? provaErro(valor) : null;
  const texto = PASSOS_TEXTO[passo] ?? {};
  const corpo = {
    fase: <PassoFase estado={estado} valor={valor} setValor={setValor} />,
    prova: <PassoProva valor={valor} setValor={setValor} />,
    rotina: <PassoRotina valor={valor} setValor={setValor} />,
    dificuldades: <PassoDificuldades valor={valor} setValor={setValor} />,
    jeito: <PassoJeito valor={valor} setValor={setValor} />,
    tutor: <PassoTutor valor={valor} setValor={setValor} mobile={mobile} />,
    lembretes: <PassoLembretes valor={valor} setValor={setValor} />,
  }[passo];
  const tituloFase = passo === "fase" && !["escolher_teste", "elite"].includes(estado?.acesso?.modo_fase) ? "Sua fase de estudo" : texto.titulo;

  return (
    <Moldura estado={estado} passo={passo} modo={modo} onSair={sair.acao} rotuloSair={sair.rotulo} ocupado={ocupado}
      rodape={
        <>
          <span className="ob-rodape__esq">
            <button type="button" className="ob-btn ob-btn--sec" onClick={voltar} disabled={ocupado}>
              <Icon name="arrow-left" size={18} /> Voltar
            </button>
          </span>
          <button type="submit" form="ob-form" className="ob-btn ob-btn--pri" disabled={ocupado || !valido} aria-busy={ocupado || undefined}>
            {ocupado ? "Salvando…" : "Continuar"} <Icon name="arrow-right" size={18} />
          </button>
        </>
      }>
      <form
        id="ob-form"
        className="ob-q"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (valido && !ocupado) continuarPergunta();
        }}
      >
        <div className="ob-q__cab">
          <span className="ob-over">Seu estudo</span>
          <h1 className="ob-h1" ref={titulo} tabIndex={-1}>
            {tituloFase}
          </h1>
          {texto.sub ? <p className="ob-sub">{texto.sub}</p> : null}
        </div>
        {erroBanner}
        {aviso ? <p className="ob-aviso" role="alert">{aviso}</p> : null}
        {corpo}
      </form>
    </Moldura>
  );
}

export const TOTAL_CENAS = CENAS.length;
