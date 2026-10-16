import React, { useState, useEffect, useRef } from "react";
import { useSession } from "../session.jsx";
import { Banner, Button, Icon } from "../../ds";
import { TITULO, APRESENTACAO, QUESTOES, RESULTADO, CORRECAO, CONVITE } from "./textos.js";
import { fmt1, interpretar, avisoIncerteza, nomeArea, AVISO_NAO_E_NOTA } from "./calculo.js";
import { QuestionHeader } from "../practice/tela/QuestionHeader.jsx";
import { QuestionSheet, Alternatives, QuestionFooter, ReportQuestion } from "../practice/tela/QuestionSheet.jsx";
import "./nivelamento.css";

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

function ErroBanner({ erro }) {
  if (!erro) return null;
  return (
    <div style={{ padding: "0 24px" }}>
      <Banner tone="danger">{String(erro.message || erro)}</Banner>
    </div>
  );
}

export function Nivelamento({ modo, go }) {
  const { backend, refresh, boot } = useSession();
  
  const [estado, setEstado] = useState(null);
  const [fase, setFase] = useState("carregando"); // carregando, apresentacao, questoes, resultado, correcao
  const [erro, setErro] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);

  // Sessao de Questoes
  const [sessao, setSessao] = useState(null);
  const [idxQuestao, setIdxQuestao] = useState(0);
  const [respostasLocais, setRespostasLocais] = useState({});
  const [escolha, setEscolha] = useState(null);
  const [painelFaltam, setPainelFaltam] = useState(false);
  const [confirmarSair, setConfirmarSair] = useState(false);

  const relogio = useRelogio(`${sessao?.bloco ?? 0}-${idxQuestao}`, fase === "questoes");

  // Correcao
  const [correcao, setCorrecao] = useState(null);
  const [mostrarCalculo, setMostrarCalculo] = useState(false);

  useEffect(() => {
    carregarEstado();
  }, []);

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
        await refresh();
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
        await refresh();
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
      setFase("correcao");
    } catch (err) {
      setErro(err);
    } finally {
      setLoadingAction(false);
    }
  };

  const renderApresentacao = () => {
    const andamento = estado?.situacao === "bloco1" || estado?.situacao === "bloco2";
    
    return (
      <div className="nivelamento-layout">
        <div className="nivelamento-content">
          <ErroBanner erro={erro} />
          <div className="nivelamento-apresentacao">
            <h2>{APRESENTACAO.titulo}</h2>
            <p className="sub">{APRESENTACAO.subtitulo}</p>
            
            <div className="nivelamento-secao" style={{ marginTop: 16 }}>
              <h3>Para que serve</h3>
              <ul>
                {APRESENTACAO.paraQue.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
            
            <div className="nivelamento-secao">
              <h3>Como funciona</h3>
              <ul>
                {APRESENTACAO.comoFunciona.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
            
            <p className="separacao">{APRESENTACAO.separacao}</p>
            
            <div className="nivelamento-acoes">
              <button 
                className="primario" 
                onClick={() => iniciarOuContinuarSessao("iniciar")}
                disabled={loadingAction}
              >
                {andamento ? APRESENTACAO.continuar(estado.respondidas, estado.total_bloco) : APRESENTACAO.comecar}
              </button>
              <button 
                className="secundario" 
                onClick={adiar}
                disabled={loadingAction}
              >
                {APRESENTACAO.depois}
              </button>
            </div>
            {modo === "primeira" && (
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: -8 }}>
                {APRESENTACAO.depoisAviso}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderQuestoes = () => {
    if (!sessao) return null;
    
    if (confirmarSair) {
      return (
        <div className="nivelamento-layout">
          <div className="nivelamento-header">
            <h1>{QUESTOES.rotulo(sessao.bloco)}</h1>
          </div>
          <div className="nivelamento-content" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 24 }}>
            <h2 style={{ margin: 0, fontSize: 24 }}>{QUESTOES.sairTitulo}</h2>
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>{QUESTOES.sairTexto}</p>
            <div style={{ display: "flex", gap: 16 }}>
              <Button variant="secondary" onClick={() => setConfirmarSair(false)} disabled={loadingAction}>{QUESTOES.sairNao}</Button>
              <Button variant="danger" onClick={sairDasQuestoes} disabled={loadingAction}>{QUESTOES.sairSim}</Button>
            </div>
          </div>
        </div>
      );
    }
    
    if (painelFaltam) {
      const faltam = sessao.itens.filter(i => !respostasLocais[i.ordem]);
      return (
        <div className="nivelamento-layout">
          <div className="nivelamento-header">
            <h1>{QUESTOES.rotulo(sessao.bloco)}</h1>
            <button className="nivelamento-close" onClick={() => setConfirmarSair(true)} aria-label="Sair">
              <Icon name="x" size={24} />
            </button>
          </div>
          <div className="nivelamento-content">
            <h2 style={{ fontSize: 20, marginBottom: 16 }}>Resumo do bloco</h2>
            <p style={{ color: "var(--danger-text)", marginBottom: 24 }}>{QUESTOES.faltam(faltam.length)}</p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
              {sessao.itens.map((it, i) => {
                const resp = respostasLocais[it.ordem];
                return (
                  <button 
                    key={it.ordem}
                    onClick={() => { setIdxQuestao(i); setPainelFaltam(false); }}
                    style={{ 
                      display: "flex", justifyContent: "space-between", alignItems: "center", 
                      padding: 16, background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", 
                      borderRadius: 8, cursor: "pointer", textAlign: "left"
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>Questão {it.posicao}</span>
                    {resp ? (
                      <span style={{ color: "var(--success-text)", fontSize: 14 }}>Respondida ({resp})</span>
                    ) : (
                      <span style={{ color: "var(--danger-text)", fontSize: 14 }}>Em branco</span>
                    )}
                  </button>
                );
              })}
            </div>
            
            <Button onClick={() => setPainelFaltam(false)}>Voltar às questões</Button>
          </div>
        </div>
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
                onPick={onPick}
              />
            }
            footer={footer}
            report={<ReportQuestion question={item.questao} />}
          />
        </main>
      </div>
    );
  };

  const renderResultado = () => {
    const res = estado.resultado;
    if (!res) return null; // Fallback
    
    const { status } = res;
    
    const acertosGerais = RESULTADO.acertos(res.acertos, res.total, fmt1(res.percentual_bruto));
    const primeiraPrioridade = res.prioridades?.[0] ? nomeArea(res.prioridades[0]) : null;

    return (
      <div className="nivelamento-layout">
        <div className="nivelamento-header">
          <h1>{RESULTADO.titulo}</h1>
        </div>
        <div className="nivelamento-content">
          <ErroBanner erro={erro} />
          <div className="nivelamento-resultado">
            
            <div className="nivelamento-pg-container">
              {status !== "DADOS_INSUFICIENTES" && <div className="nivelamento-selo">{RESULTADO.selo}</div>}
              
              {status === "DADOS_INSUFICIENTES" ? (
                <div style={{ fontSize: 16, color: "var(--text-secondary)", marginTop: 16, padding: "0 24px" }}>
                  {RESULTADO.insuficiente}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {RESULTADO.rotuloPG}
                  </div>
                  <div className="nivelamento-pg">{fmt1(res.score)}%</div>
                  <div className="nivelamento-nivel">Nível {res.nivel} · {res.nivel_nome}</div>
                  <div className="nivelamento-foco">{res.nivel_foco}</div>
                </>
              )}
              
              <div className="nivelamento-acertos" style={{ marginTop: 24 }}>
                <Icon name="target" size={16} /> {acertosGerais}
              </div>
            </div>

            <div className="nivelamento-secao">
              <h3>{RESULTADO.porArea}</h3>
              <div className="nivelamento-barras">
                {res.perfil.map(p => (
                  <div key={p.area} className="nivelamento-barra">
                    <div className="nivelamento-barra-head">
                      <span>{p.nome}</span>
                      <span>{fmt1(p.proficiencia)}%</span>
                    </div>
                    <div className="nivelamento-barra-bg">
                      <div className="nivelamento-barra-fill" style={{ width: `${Math.max(0, Math.min(100, p.proficiencia))}%` }} />
                    </div>
                    <div className="nivelamento-barra-sub">{p.acertos} de {p.total}</div>
                  </div>
                ))}
              </div>
            </div>

            {res.prioridades && res.prioridades.length > 0 && (
              <div className="nivelamento-secao">
                <h3>{RESULTADO.prioridades}</h3>
                <div className="nivelamento-prioridades">
                  {res.prioridades.map((areaId, i) => {
                    const p = res.perfil.find(x => x.area === areaId);
                    return (
                      <div key={areaId} className="nivelamento-prioridade-item">
                        <div className="nivelamento-prioridade-numero">{i + 1}</div>
                        <span>{RESULTADO.prioridadeItem(p.nome, fmt1(p.prioridade))}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="nivelamento-interpretacao">
              {interpretar(res, { pessoa: "voce" })}
            </div>
            
            <div className="nivelamento-aviso">
              <Icon name="info" size={16} style={{ float: "left", marginRight: 8, marginTop: 2 }} />
              {avisoIncerteza(res)}
            </div>

            <div className="nivelamento-calculo-box">
              <button 
                className="nivelamento-calculo-btn" 
                onClick={() => setMostrarCalculo(!mostrarCalculo)}
                aria-expanded={mostrarCalculo}
              >
                <span>{RESULTADO.comoCalculamosTitulo}</span>
                <Icon name={mostrarCalculo ? "chevron-up" : "chevron-down"} size={20} />
              </button>
              {mostrarCalculo && (
                <div className="nivelamento-calculo-content">
                  <ul>
                    {RESULTADO.comoCalculamos.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                  <div style={{ marginTop: 16 }}>{RESULTADO.acertosNota}</div>
                </div>
              )}
            </div>

            <div className="nivelamento-aviso">
              <Icon name="triangle-alert" size={16} style={{ float: "left", marginRight: 8, marginTop: 2 }} />
              {AVISO_NAO_E_NOTA}
            </div>

            {primeiraPrioridade && status !== "DADOS_INSUFICIENTES" && (
              <div style={{ fontSize: 15, fontWeight: 500, textAlign: "center", color: "var(--action-primary)", marginTop: 8 }}>
                {RESULTADO.planoComeca(primeiraPrioridade)}
              </div>
            )}

            <div className="nivelamento-acoes" style={{ marginTop: 0 }}>
              {estado.situacao === "parcial" && (
                <button 
                  className="primario" 
                  onClick={() => iniciarOuContinuarSessao("continuar")}
                  disabled={loadingAction}
                  style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center", padding: "12px 16px" }}
                >
                  <span>{RESULTADO.continuar30}</span>
                  <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.9 }}>{RESULTADO.continuar30Texto}</span>
                </button>
              )}
              <button 
                className={estado.situacao === "parcial" ? "secundario" : "primario"} 
                onClick={async () => {
                  if (modo === "primeira") await refresh();
                  else go("home");
                }}
                disabled={loadingAction}
              >
                {modo === "primeira" ? RESULTADO.entrar : RESULTADO.inicio}
              </button>
            </div>
            
            <div style={{ textAlign: "center" }}>
              <Button variant="ghost" onClick={verCorrecao} disabled={loadingAction}>{RESULTADO.verCorrecao}</Button>
            </div>

          </div>
        </div>
      </div>
    );
  };

  const renderCorrecao = () => {
    if (!correcao) return null;
    return (
      <div className="nivelamento-layout" style={{ background: "var(--bg-app)" }}>
        <div className="nivelamento-header">
          <h1>{CORRECAO.titulo}</h1>
          <button className="nivelamento-close" onClick={() => setFase("resultado")} aria-label={RESULTADO.ocultarCorrecao}>
            <Icon name="x" size={24} />
          </button>
        </div>
        <div className="nivelamento-content" style={{ maxWidth: 800 }}>
          <ErroBanner erro={erro} />
          
          <div style={{ marginBottom: 24 }}>
            <Button variant="secondary" onClick={() => setFase("resultado")}>
              <Icon name="arrow-left" size={16} /> Voltar ao resultado
            </Button>
          </div>
          
          <div>
            {correcao.itens.map((item, i) => {
              const certa = item.correta;
              return (
                <div key={item.ordem} className="nivelamento-correcao-item">
                  <div className={`nivelamento-correcao-badge ${certa ? "certa" : "errada"}`}>
                    <Icon name={certa ? "check" : "x"} size={16} />
                    {certa ? CORRECAO.certa : CORRECAO.errada}
                  </div>
                  
                  <div style={{ marginBottom: 24, fontSize: 13, color: "var(--text-tertiary)" }}>
                    Bloco {item.bloco} · Questão {item.posicao}
                  </div>
                  
                  <QuestionSheet
                    compact
                    revealed
                    question={item.questao}
                    alternatives={
                      <Alternatives
                        options={item.questao.options}
                        revealed
                        chosen={item.resposta}
                        stateOf={(id) => {
                          if (id === item.gabarito) return "correct";
                          if (id === item.resposta && !item.correta) return "incorrect";
                          return "dimmed";
                        }}
                      />
                    }
                  />
                  
                  <div className="nivelamento-comentario">
                    <h4>{CORRECAO.comentario}</h4>
                    <p className="nivelamento-comentario-texto">
                      {item.comentario || CORRECAO.semComentario}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  if (fase === "carregando") {
    return (
      <div className="nivelamento-layout" style={{ alignItems: "center", justifyContent: "center" }}>
        <ErroBanner erro={erro} />
        {!erro && <p style={{ color: "var(--text-tertiary)" }}>Carregando...</p>}
      </div>
    );
  }

  if (fase === "apresentacao") return renderApresentacao();
  if (fase === "questoes") return renderQuestoes();
  if (fase === "resultado") return renderResultado();
  if (fase === "correcao") return renderCorrecao();
  
  return null;
}
