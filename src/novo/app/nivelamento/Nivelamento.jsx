import React, { useState, useEffect, useRef } from "react";
import { useSession } from "../session.jsx";
import { Button, Icon } from "../../ds";
import { QUESTOES } from "./textos.js";
import { QuestionHeader } from "../practice/tela/QuestionHeader.jsx";
import { QuestionSheet, Alternatives, QuestionFooter, ReportQuestion } from "../practice/tela/QuestionSheet.jsx";
import { Panel, RichIcon, Tile, useNarrow } from "../evolucao/ui.jsx";
import { Apresentacao, Carregando, Correcao, ErroBanner, Moldura, Resultado } from "./NivelamentoTelas.jsx";

/** Relógio que só conta para cima (o diagnóstico não tem tempo limite): segundos no bloco e na questão atual. */
function useRelogio(chaveQuestao, ativo) {
  const inicio = useRef(Date.now());
  const inicioQuestao = useRef(Date.now());
  const [, setTique] = useState(0);
  useEffect(() => {
    inicioQuestao.current = Date.now();
  }, [chaveQuestao]);
  useEffect(() => {
    if (!ativo) return undefined;
    const t = setInterval(() => setTique((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [ativo]);
  const agora = Date.now();
  return { bloco: Math.floor((agora - inicio.current) / 1000), questao: Math.floor((agora - inicioQuestao.current) / 1000) };
}

export function deveMostrarNivelamento(boot) {
  return Boolean(boot?.nivelamento?.primeira_tela);
}

/**
 * `aoSair` (opcional): quem abriu o nivelamento em tela cheia por dentro de outro fluxo (o onboarding) decide o que vem depois de
 * "Depois", "Sair do diagnóstico" e "Entrar"; sem ele, a primeira tela recarrega a abertura do app, como sempre.
 */
export function Nivelamento({ modo, go, aoSair = null }) {
  const { backend, refresh, boot } = useSession();
  const sairDaPrimeira = () => (aoSair ? aoSair() : refresh());
  const narrow = useNarrow();
  
  const [estado, setEstado] = useState(null);
  const [fase, setFase] = useState("carregando"); // carregando, apresentacao, questoes, resultado, correcao
  const [erro, setErro] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);

  // Sessao de Questoes
  const [sessao, setSessao] = useState(null);
  const [idxQuestao, setIdxQuestao] = useState(0);
  const [respostasLocais, setRespostasLocais] = useState({});
  const [escolha, setEscolha] = useState(null);
  const [riscadas, setRiscadas] = useState({}); // alternativas riscadas por questão (só na tela, nada vai ao banco)
  const [painelFaltam, setPainelFaltam] = useState(false);
  const [confirmarSair, setConfirmarSair] = useState(false);

  const relogio = useRelogio(`${sessao?.bloco ?? 0}-${idxQuestao}`, fase === "questoes");

  // Correcao
  const [correcao, setCorrecao] = useState(null);
  const [filtroArea, setFiltroArea] = useState("todas");

  useEffect(() => {
    carregarEstado();
  }, []);

  // cada etapa começa do topo (a correção abre a partir do fim do resultado)
  useEffect(() => {
    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return;
    window.scrollTo?.(0, 0);
  }, [fase]);

  const carregarEstado = async () => {
    try {
      const st = await backend.rpc("app_nivelamento_estado");
      setEstado(st);
      
      const sit = st.situacao;
      if (sit === "novo" || sit === "adiado") {
        setFase("apresentacao");
      } else if (sit === "bloco1" || sit === "bloco2") {
        if (modo === "primeira") {
          setFase("apresentacao");
        } else {
          iniciarOuContinuarSessao(sit === "bloco1" ? "iniciar" : "continuar");
        }
      } else if (sit === "parcial" || sit === "concluido") {
        setFase("resultado");
      } else {
        setFase("apresentacao");
      }
    } catch (err) {
      setErro(err);
    }
  };

  const adiar = async () => {
    setLoadingAction(true);
    try {
      if (modo === "primeira") {
        await backend.rpc("app_nivelamento_adiar");
        await sairDaPrimeira();
      } else {
        go("home");
      }
    } catch (err) {
      setErro(err);
      setLoadingAction(false);
    }
  };

  const sairDasQuestoes = async () => {
    if (modo === "primeira") {
      setLoadingAction(true);
      try {
        await backend.rpc("app_nivelamento_adiar");
        await sairDaPrimeira();
      } catch (err) {
        setErro(err);
        setLoadingAction(false);
      }
    } else {
      go("home");
    }
  };

  const iniciarOuContinuarSessao = async (acao = "iniciar") => {
    setLoadingAction(true);
    setErro(null);
    try {
      const s = await backend.rpc(acao === "continuar" ? "app_nivelamento_continuar" : "app_nivelamento_iniciar");
      setSessao(s);
      setRespostasLocais({});
      
      // Construir mapa de respostas locais a partir da sessao recuperada
      const locais = {};
      let proxIdx = 0;
      s.itens.forEach((item, i) => {
        if (item.resposta) locais[item.ordem] = item.resposta;
        if (item.resposta && i === proxIdx) proxIdx = i + 1; // Pula para a primeira nao respondida
      });
      setRespostasLocais(locais);
      setIdxQuestao(Math.min(proxIdx, s.itens.length - 1));
      
      if (modo === "rota") {
        go("nivelamento", { etapa: "questoes" });
      }
      setFase("questoes");
    } catch (err) {
      setErro(err);
    } finally {
      setLoadingAction(false);
    }
  };

  const responder = async (ordem, resposta) => {
    setLoadingAction(true);
    setErro(null);
    try {
      await backend.rpc("app_nivelamento_responder", { p_ordem: ordem, p_resposta: resposta });
      setRespostasLocais(prev => ({ ...prev, [ordem]: resposta }));
      setEscolha(null);
      // Avança para a próxima se não for a última
      if (idxQuestao < sessao.itens.length - 1) {
        setIdxQuestao(idxQuestao + 1);
      }
    } catch (err) {
      setErro(err);
    } finally {
      setLoadingAction(false);
    }
  };

  const finalizar = async () => {
    const respondidas = Object.keys(respostasLocais).length;
    if (respondidas < sessao.itens.length) {
      setPainelFaltam(true);
      return;
    }
    
    setLoadingAction(true);
    setErro(null);
    try {
      const st = await backend.rpc("app_nivelamento_finalizar");
      setEstado(st);
      if (modo === "rota") {
        go("nivelamento"); // Remove ?etapa=questoes
      }
      setFase("resultado");
    } catch (err) {
      setErro(err);
    } finally {
      setLoadingAction(false);
    }
  };

  const verCorrecao = async () => {
    setLoadingAction(true);
    setErro(null);
    try {
      const c = await backend.rpc("app_nivelamento_correcao");
      setCorrecao(c);
      setFiltroArea("todas");
      setFase("correcao");
    } catch (err) {
      setErro(err);
    } finally {
      setLoadingAction(false);
    }
  };

  const renderQuestoes = () => {
    if (!sessao) return null;
    
    if (confirmarSair) {
      return (
        <Moldura modo="primeira" overline={QUESTOES.rotulo(sessao.bloco)} titulo={QUESTOES.sairTitulo}>
          <Panel className="nv-card nv-pausa">
            <Tile tone="blue" size={52} radius={16}>
              <RichIcon name="clipboard" size={32} />
            </Tile>
            <p className="nv-sum__text" style={{ margin: 0 }}>{QUESTOES.sairTexto}</p>
            <div className="nv-actions">
              <Button iconRight="arrow-right" onClick={() => setConfirmarSair(false)} disabled={loadingAction}>{QUESTOES.sairNao}</Button>
              <Button variant="secondary" onClick={sairDasQuestoes} disabled={loadingAction}>{QUESTOES.sairSim}</Button>
            </div>
          </Panel>
        </Moldura>
      );
    }

    if (painelFaltam) {
      const faltam = sessao.itens.filter((i) => !respostasLocais[i.ordem]);
      return (
        <Moldura modo="primeira" overline={QUESTOES.rotulo(sessao.bloco)} titulo="Resumo do bloco">
          <Panel className="nv-card">
            <p className="nv-faltam">
              <Icon name="info" size={16} />
              {QUESTOES.faltam(faltam.length)}
            </p>
            <ul className="nv-blocos">
              {sessao.itens.map((it, i) => {
                const resp = respostasLocais[it.ordem];
                return (
                  <li key={it.ordem}>
                    <button type="button" className={`nv-bloco${resp ? " is-done" : ""}`} onClick={() => { setIdxQuestao(i); setPainelFaltam(false); }}>
                      <span className="ev-mono">{it.posicao}</span>
                      <small>{resp ? `Resposta ${resp}` : "Em branco"}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="nv-actions">
              <Button icon="arrow-left" variant="secondary" onClick={() => setPainelFaltam(false)}>Voltar às questões</Button>
            </div>
          </Panel>
        </Moldura>
      );
    }

    const item = sessao.itens[idxQuestao];
    const respondida = respostasLocais[item.ordem];
    const selecionada = escolha || respondida;
    
    // Segmentos do QuestionHeader
    const segments = sessao.itens.map(it => respostasLocais[it.ordem] ? "done" : "open");
    segments[idxQuestao] = "current";

    const isLast = idxQuestao === sessao.itens.length - 1;
    const allDone = Object.keys(respostasLocais).length === sessao.itens.length;

    const onPick = (letra) => {
      if (!respondida) setEscolha(letra);
    };

    // Riscar é só da tela; riscar a escolhida desmarca (como no treino).
    const struck = riscadas[item.ordem] ?? [];
    const onStrike = (letra) => {
      if (respondida) return;
      if (escolha === letra && !struck.includes(letra)) setEscolha(null);
      setRiscadas((todas) => ({ ...todas, [item.ordem]: struck.includes(letra) ? struck.filter((l) => l !== letra) : [...struck, letra] }));
    };

    const primaryAction = () => {
      if (allDone && isLast && respondida) {
        finalizar();
      } else if (selecionada && !respondida) {
        responder(item.ordem, selecionada);
      } else if (isLast) {
        finalizar();
      } else {
        setIdxQuestao(idxQuestao + 1);
      }
    };

    let btnLabel = "Próxima";
    if (!respondida && selecionada) btnLabel = QUESTOES.confirmar;
    else if (isLast && respondida) btnLabel = QUESTOES.finalizar;
    else if (isLast) btnLabel = QUESTOES.finalizar;
    
    const footer = (
      <QuestionFooter
        onMark={null} // Sem botão marcar
        onPrev={idxQuestao > 0 ? () => { setIdxQuestao(idxQuestao - 1); setEscolha(null); } : null}
        prevDisabled={loadingAction}
        onSkip={!respondida && !isLast ? () => { setIdxQuestao(idxQuestao + 1); setEscolha(null); } : null}
        skipDisabled={loadingAction}
        primary={{
          label: btnLabel,
          onClick: primaryAction,
          disabled: loadingAction || (!respondida && !selecionada && isLast && !allDone)
        }}
      />
    );

    return (
      <div className="tq">
        <QuestionHeader
          label={QUESTOES.rotulo(sessao.bloco)}
          index={idxQuestao}
          total={sessao.itens.length}
          segments={segments}
          timer={{
            mainLabel: "Respondendo",
            mainValue: relogio.bloco,
            level: "ok",
            fraction: null,
            paused: false,
            questionSeconds: relogio.questao,
            aria: "Tempo respondendo o diagnóstico (sem tempo limite)",
          }}
          onExit={() => setConfirmarSair(true)}
          exitLabel="Sair do diagnóstico"
        />
        <main className="tq-main" data-revealed="false">
          <ErroBanner erro={erro} />
          <QuestionSheet
            question={item.questao}
            revealed={false}
            alternatives={
              <Alternatives 
                options={item.questao.options}
                chosen={selecionada}
                stateOf={(id) => {
                  if (selecionada === id) return "selected";
                  if (respondida && selecionada !== id) return "dimmed";
                  return "idle";
                }}
                revealed={false}
                locked={!!respondida || loadingAction}
                struck={struck}
                onPick={onPick}
                onStrike={onStrike}
              />
            }
            footer={footer}
            report={<ReportQuestion question={item.questao} />}
          />
        </main>
      </div>
    );
  };


  const entrar = async () => {
    if (modo === "primeira") await sairDaPrimeira();
    else go("home");
  };

  if (fase === "carregando") return <Carregando modo={modo} erro={erro} />;
  if (fase === "apresentacao")
    return <Apresentacao modo={modo} estado={estado} ocupado={loadingAction} erro={erro} onComecar={() => iniciarOuContinuarSessao("iniciar")} onDepois={adiar} />;
  if (fase === "questoes") return renderQuestoes();
  if (fase === "resultado" && estado?.resultado)
    return (
      <Resultado
        modo={modo}
        estado={estado}
        res={estado.resultado}
        narrow={narrow}
        ocupado={loadingAction}
        erro={erro}
        onContinuar30={() => iniciarOuContinuarSessao("continuar")}
        onEntrar={entrar}
        onCorrecao={verCorrecao}
      />
    );
  if (fase === "correcao" && correcao)
    return <Correcao modo={modo} correcao={correcao} filtro={filtroArea} setFiltro={setFiltroArea} erro={erro} onVoltar={() => setFase("resultado")} />;
  return <Carregando modo={modo} erro={erro} />;
}
