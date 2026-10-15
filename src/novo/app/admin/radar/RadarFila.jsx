// Fila do Radar (Administração, só administrador): mudanças que o Radar de Evidências achou nas fontes oficiais.
// O Radar só AVISA: nada aqui altera questão, gabarito, aula ou atualização. A decisão do dono fica registrada com nota.
// Funções do banco: app_admin_radar_fila_detalhada, app_admin_radar_parecer e app_admin_radar_acao
// (supabase/migrations/20261003010200_radar_fila_e_avisos.sql), que por baixo usa app_admin_radar_decidir.
import React from "react";
import { Link } from "react-router-dom";
import { Badge, Banner, Button, Chip, EmptyState, Icon } from "../../../ds";
import { useSession } from "../../session.jsx";
import { dateTimeBR, LoadError, messageOf, TextArea, useLoad } from "../common.jsx";
import { avisarRadarMudou } from "./useRadarAvisos.js";
import {
  ACAO_CONCLUIR, ACAO_LABEL, ACOES, FILTROS, KIND_LABEL, NOTA_MINIMA, ORIGEM_LABEL, REFERENCIA_AJUDA, REFERENCIA_LABEL, STATUS_LABEL, TIPO_LABEL,
  aberto, agruparAfetados, contar, filtrar, notaValida, paginasTexto, prazoInfo,
} from "./radarFila.js";
import "./radarFila.css";

const MAX_POR_GRUPO = 12;

function Secao({ titulo, children }) {
  return (
    <section className="rf-sec">
      <h4>{titulo}</h4>
      <div className="rf-sec__conteudo">{children}</div>
    </section>
  );
}

function OQueMudou({ evento }) {
  const { analise, itens, itens_total: total } = evento;
  return (
    <Secao titulo="O que mudou">
      {analise?.o_que_mudou && <p>{analise.o_que_mudou}</p>}
      {analise?.recomendacao_alterada && <p className="rf-suave">Recomendação: {analise.recomendacao_alterada}</p>}
      {analise?.impacto_clinico_provavel && <p className="rf-suave">Impacto provável: {analise.impacto_clinico_provavel}</p>}
      {analise && (
        <p className="rf-suave">
          Resumo escrito pela IA do Radar (certeza {analise.certeza === "alta" ? "alta" : analise.certeza === "media" ? "média" : "baixa"}). É só uma sugestão: confira
          no trecho abaixo.
        </p>
      )}
      {itens.length === 0 ? (
        <p className="rf-suave">
          {analise ? "O Radar não guardou trechos para comparar." : `${ORIGEM_LABEL[evento.origem] ?? "Houve uma mudança"}. O Radar não teve texto para comparar: abra a fonte e confira.`}
        </p>
      ) : (
        itens.map((i, n) => (
          <div className="rf-diff" key={n}>
            <div className="rf-diff__tipo">
              <Badge size="sm" tone={i.critical ? "danger" : "neutral"}>
                {KIND_LABEL[i.kind] ?? "Texto alterado"}
              </Badge>
              {i.critical && <span>ponto crítico</span>}
            </div>
            <div className="rf-diff__lado rf-diff__lado--antes">
              <span className="rf-diff__rotulo">Antes{i.pagina_antiga ? ` · p. ${i.pagina_antiga}` : ""}</span>
              <p className={"rf-diff__texto" + (i.antes ? "" : " rf-diff__vazio")}>{i.antes || "não existia"}</p>
            </div>
            <div className="rf-diff__lado rf-diff__lado--depois">
              <span className="rf-diff__rotulo">Depois{i.pagina_nova ? ` · p. ${i.pagina_nova}` : ""}</span>
              <p className={"rf-diff__texto" + (i.depois ? "" : " rf-diff__vazio")}>{i.depois || "foi removido"}</p>
            </div>
          </div>
        ))
      )}
      {total > itens.length && <p className="rf-suave">Mostrando {itens.length} dos {total} trechos que o Radar guardou. Os demais estão na fonte.</p>}
    </Secao>
  );
}

function SobreAFonte({ evento }) {
  const { fonte } = evento;
  const [rotulo] = REFERENCIA_LABEL[fonte.referencia] ?? REFERENCIA_LABEL.desconhecido;
  return (
    <Secao titulo="Sobre a fonte">
      <dl className="rf-dl">
        <dt>Nome oficial</dt>
        <dd>
          {fonte.nome}
          {fonte.orgao ? `, ${fonte.orgao}` : ""}
        </dd>
        <dt>Classificação</dt>
        <dd>
          <strong>{rotulo}.</strong> {REFERENCIA_AJUDA[fonte.referencia] ?? REFERENCIA_AJUDA.desconhecido}
        </dd>
        {fonte.vigencia_normativa && (
          <>
            <dt>Ato e data</dt>
            <dd>{fonte.vigencia_normativa}</dd>
          </>
        )}
        <dt>Vale como norma do SUS</dt>
        <dd>{fonte.norma_sus ? "Sim" : "Não"}</dd>
        <dt>O que detectou</dt>
        <dd>
          {ORIGEM_LABEL[evento.origem] ?? "Mudança"}, em {dateTimeBR(evento.detectado_em)}
        </dd>
        {fonte.url && (
          <>
            <dt>Endereço</dt>
            <dd>
              <a href={fonte.url} target="_blank" rel="noreferrer noopener">
                Abrir a fonte oficial (nova aba)
              </a>
            </dd>
          </>
        )}
      </dl>
    </Secao>
  );
}

function QuemUsa({ evento }) {
  const grupos = agruparAfetados(evento.afetados);
  const total = evento.afetados_total ?? 0;
  return (
    <Secao titulo="Quem usa esta fonte">
      {grupos.length === 0 ? (
        <p className="rf-suave">O Radar não achou questão, aula ou atualização apoiada nesta fonte.</p>
      ) : (
        <>
          <p className="rf-suave">
            {evento.afetados_pendentes} de {total} {total === 1 ? "item está" : "itens estão"} marcados para conferir. Eles continuam visíveis ao aluno: o Radar só avisa.
          </p>
          <div className="rf-uso">
            {grupos.map(({ tipo, itens, trecho }) => {
              const [plural, , aba] = TIPO_LABEL[tipo] ?? [tipo, tipo, null];
              return (
                <div className="rf-uso__grupo" key={tipo}>
                  <div className="rf-uso__titulo">
                    {plural} ({itens.length})
                    <Badge size="sm" tone={trecho ? "warning" : "neutral"}>
                      {trecho ? `${trecho} por trecho` : "por tema"}
                    </Badge>
                  </div>
                  <ul className="rf-uso__itens">
                    {itens.slice(0, MAX_POR_GRUPO).map((a) => {
                      const pag = paginasTexto(a.paginas);
                      const conteudo = (
                        <>
                          <span>{a.ref}</span>
                          {pag && <span aria-label={pag}>· p. {a.paginas.join(", ")}</span>}
                        </>
                      );
                      const cls = "rf-uso__item" + (a.nivel === "trecho" ? " rf-uso__item--trecho" : "");
                      return (
                        <li key={a.ref}>
                          {aba ? (
                            <Link className={cls} to={`/admin?aba=${aba}`} title={a.citacao || `Abrir ${plural.toLowerCase()} na Administração`}>
                              {conteudo}
                            </Link>
                          ) : (
                            <span className={cls}>{conteudo}</span>
                          )}
                        </li>
                      );
                    })}
                    {itens.length > MAX_POR_GRUPO && (
                      <li>
                        <span className="rf-uso__item">+{itens.length - MAX_POR_GRUPO}</span>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="rf-suave">Em destaque amarelo: o item aponta para a página da fonte que mudou. Os demais entram só por pertencerem ao mesmo tema.</p>
        </>
      )}
    </Secao>
  );
}

function Parecer({ evento, onSaved }) {
  const { backend } = useSession();
  const [texto, setTexto] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [erro, setErro] = React.useState(null);
  const salvar = async () => {
    setBusy(true);
    setErro(null);
    try {
      await backend.rpc("app_admin_radar_parecer", { p_evento: evento.evento, p_texto: texto });
      setTexto("");
      onSaved("Parecer registrado.");
    } catch (e) {
      setErro(messageOf(e, "Não foi possível registrar o parecer. Tente de novo."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Secao titulo="Parecer dos 2 revisores">
      {evento.parecer ? (
        <>
          <div className="rf-parecer">{evento.parecer}</div>
          <p className="rf-suave">Registrado em {dateTimeBR(evento.parecer_em)}. Cole outro texto abaixo para substituir.</p>
        </>
      ) : (
        <p className="rf-suave">Os revisores têm até 48 horas para pré-revisar. Cole aqui o parecer deles.</p>
      )}
      <TextArea label="Colar ou escrever o parecer" value={texto} onChange={setTexto} rows={3} maxLength={4000} placeholder="Ex.: os 2 revisores confirmam que a dose mudou de 5 mg para 10 mg." />
      {erro && <Banner tone="danger">{erro}</Banner>}
      <div>
        <Button size="sm" variant="secondary" icon="clipboard-check" loading={busy} disabled={texto.trim().length < 3 || busy} onClick={salvar}>
          Registrar parecer
        </Button>
      </div>
    </Secao>
  );
}

function Decisao({ evento, onSaved }) {
  const { backend } = useSession();
  const [acao, setAcao] = React.useState("");
  const [nota, setNota] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [erro, setErro] = React.useState(null);
  const acoes = evento.decisao_dono && aberto(evento) ? [...ACOES, ACAO_CONCLUIR] : ACOES;
  const pronto = Boolean(acao) && notaValida(nota);
  const grupo = React.useId();

  if (!aberto(evento)) {
    return (
      <Secao titulo="Decisão">
        <div className="rf-decidido">
          <p>
            <strong>{ACAO_LABEL[evento.decisao_dono] ?? STATUS_LABEL[evento.status]?.[0]}</strong>
            {evento.decidido_em ? `, em ${dateTimeBR(evento.decidido_em)}` : ""}
          </p>
          {evento.nota && <p className="rf-suave">Nota: {evento.nota}</p>}
        </div>
      </Secao>
    );
  }
  const enviar = async (e) => {
    e.preventDefault();
    if (!pronto) return;
    setBusy(true);
    setErro(null);
    try {
      await backend.rpc("app_admin_radar_acao", { p_evento: evento.evento, p_acao: acao, p_nota: nota.trim() });
      setAcao("");
      setNota("");
      onSaved("Decisão registrada.");
    } catch (err) {
      setErro(messageOf(err, "Não foi possível registrar a decisão. Tente de novo."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Secao titulo={evento.aguarda_dono ? "Sua decisão" : "Decisão"}>
      {evento.decisao_dono && (
        <div className="rf-decidido">
          <p>
            Já encaminhada: <strong>{ACAO_LABEL[evento.decisao_dono]}</strong>. {evento.nota ? `Nota: ${evento.nota}` : ""}
          </p>
        </div>
      )}
      <form className="rf-form" onSubmit={enviar}>
        <fieldset className="rf-acoes">
          <legend>O que fazer com esta mudança?</legend>
          {acoes.map((a) => (
            <label className="rf-acao" key={a.value}>
              <input type="radio" name={grupo} value={a.value} checked={acao === a.value} onChange={() => setAcao(a.value)} />
              <strong>{a.label}</strong>
              <span>{a.hint}</span>
            </label>
          ))}
        </fieldset>
        <TextArea label="Nota (obrigatória)" value={nota} onChange={setNota} rows={2} maxLength={1000} hint={`Explique em uma frase o motivo. Mínimo de ${NOTA_MINIMA} letras. Fica guardada no registro.`} />
        {erro && <Banner tone="danger">{erro}</Banner>}
        <div className="rf-form__rodape">
          <Button type="submit" icon="check" loading={busy} disabled={!pronto || busy}>
            Registrar decisão
          </Button>
          <p>Isto só registra a sua decisão. Nenhuma questão, aula, atualização ou gabarito é alterado por aqui.</p>
        </div>
      </form>
    </Secao>
  );
}

function Evento({ evento, aberto: expandido, onToggle, onSaved }) {
  const grave = evento.gravidade === "grave";
  const [refLabel, refTom] = REFERENCIA_LABEL[evento.fonte.referencia] ?? REFERENCIA_LABEL.desconhecido;
  const [stLabel, stTom] = STATUS_LABEL[evento.status] ?? STATUS_LABEL.pendente;
  const prazo = prazoInfo(evento);
  const corpoId = `rf-corpo-${evento.evento}`;
  return (
    <li>
      <article className={"rf-ev" + (grave ? " rf-ev--grave" : "")} aria-label={`${grave ? "Mudança grave" : "Mudança leve"} em ${evento.fonte.nome}`}>
        <button type="button" className="rf-ev__cab" aria-expanded={expandido} aria-controls={corpoId} onClick={onToggle}>
          <span>
            <span className="rf-ev__marcas">
              <Badge tone={grave ? "danger" : "neutral"} icon={grave ? "triangle-alert" : "info"} caps size="sm">
                {grave ? "Grave" : "Leve"}
              </Badge>
              <Badge tone={refTom} size="sm">
                {refLabel}
              </Badge>
              <Badge tone={stTom} size="sm">
                {evento.aguarda_dono ? "Aguarda você" : stLabel}
              </Badge>
            </span>
            <h3 className="rf-ev__nome">{evento.fonte.nome}</h3>
            <p className="rf-ev__motivo">{evento.motivo || ORIGEM_LABEL[evento.origem]}</p>
          </span>
          {prazo ? <span className={`rf-ev__prazo rf-ev__prazo--${prazo.tom}`}>{prazo.texto}</span> : <span className="rf-ev__prazo">{evento.decidido_em ? `Decidida em ${dateTimeBR(evento.decidido_em)}` : ""}</span>}
          <Icon name="chevron-down" size={20} className="rf-ev__seta" />
        </button>
        {expandido && (
          <div className="rf-ev__corpo" id={corpoId}>
            <OQueMudou evento={evento} />
            <SobreAFonte evento={evento} />
            <QuemUsa evento={evento} />
            <Parecer evento={evento} onSaved={onSaved} />
            <Decisao evento={evento} onSaved={onSaved} />
          </div>
        )}
      </article>
    </li>
  );
}

export function RadarFila() {
  const { backend } = useSession();
  const { data, error, loading, reload } = useLoad(() => backend.rpc("app_admin_radar_fila_detalhada", { p_filtro: "todos" }), [backend]);
  const [filtro, setFiltro] = React.useState(null);
  const [abertos, setAbertos] = React.useState({});
  const [aviso, setAviso] = React.useState(null);
  const eventos = Array.isArray(data) ? data : [];
  const contagem = React.useMemo(() => contar(eventos), [data]);
  // abre sempre em "Aguardam você": é o que o dono precisa ver (e a tela vazia diz que não há grave pendente)
  const atual = filtro ?? "aguardam";
  const lista = filtrar(eventos, atual);
  const config = FILTROS.find((f) => f.value === atual);
  // o primeiro item da lista abre sozinho quando só há 1 ou é grave que aguarda o dono
  const abertoPadrao = (e, n) => (abertos[e.evento] ?? (n === 0 && (lista.length === 1 || e.aguarda_dono)));
  const salvo = (texto) => {
    setAviso(texto);
    reload();
    avisarRadarMudou();
  };

  return (
    <div className="rf">
      <p className="rf__intro">
        O Radar de Evidências vigia as fontes oficiais a cada 3 dias e registra aqui o que mudou. Ele só avisa: o aluno continua vendo o conteúdo, e nada é alterado ou
        bloqueado sem a sua decisão. As mudanças leves os 2 revisores resolvem em até 48 horas; as graves esperam você.
      </p>
      <div className="rf__filtros" role="group" aria-label="Filtrar mudanças">
        {FILTROS.map((f) => (
          <Chip key={f.value} selected={atual === f.value} count={loading ? undefined : contagem[f.value]} aria-pressed={atual === f.value} onClick={() => setFiltro(f.value)}>
            {f.label}
          </Chip>
        ))}
      </div>
      {aviso && (
        <div role="status">
          <Banner tone="success">{aviso}</Banner>
        </div>
      )}
      {error && <LoadError error={error} retry={reload} />}
      {loading && !data && (
        <div aria-busy="true" aria-label="Carregando a fila" style={{ display: "grid", gap: 14 }}>
          <div className="rf-esqueleto" />
          <div className="rf-esqueleto" />
        </div>
      )}
      {!error && data && lista.length === 0 && (
        <div className="rf-vazio">
          <EmptyState
            icon={atual === "aguardam" || atual === "graves" ? "shield-check" : "radar"}
            title={config.vazio}
            description={
              atual === "aguardam"
                ? "O Radar continua vigiando as fontes oficiais. Quando aparecer uma mudança grave, ela fica aqui e o aviso chega no menu e no Início."
                : "Nada para mostrar neste filtro."
            }
            action={
              atual === "aguardam" && contagem.pendentes > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => setFiltro("pendentes")}>
                  Ver as {contagem.pendentes} pendentes (leves)
                </Button>
              ) : atual !== "todas" && contagem.todas > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => setFiltro("todas")}>
                  Ver todas as {contagem.todas} mudanças
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
      {lista.length > 0 && (
        <ul className="rf__lista" aria-label={`Mudanças: ${config.label}`}>
          {lista.map((e, n) => (
            <Evento key={e.evento} evento={e} aberto={abertoPadrao(e, n)} onToggle={() => setAbertos((a) => ({ ...a, [e.evento]: !abertoPadrao(e, n) }))} onSaved={salvo} />
          ))}
        </ul>
      )}
    </div>
  );
}
