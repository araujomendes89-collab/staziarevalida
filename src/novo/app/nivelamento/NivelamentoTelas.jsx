// Visual das telas do nivelamento no padrão das "Novas telas" (Início e Desempenho): quadros brancos de 22 px, azulejos pastel com
// ícone ilustrado, arte própria de cada grande área e o cartão escuro "Comece aqui" do Início. Só apresentação: o estado, as contas
// e as chamadas ao banco ficam em Nivelamento.jsx e calculo.js.
import React from "react";
import { Badge, Banner, Button, Icon } from "../../ds";
import { BrandLogo } from "../practice/tela/QuestionHeader.jsx";
import { QuestionSheet, Alternatives } from "../practice/tela/QuestionSheet.jsx";
import { AreaTile, Panel, RichIcon, Tile } from "../evolucao/ui.jsx";
import { areaOf } from "../practice/format.js";
import { AREAS, NIVEIS, fmt1, interpretar, avisoIncerteza, AVISO_NAO_E_NOTA } from "./calculo.js";
import { TITULO, APRESENTACAO, RESULTADO, CORRECAO } from "./textos.js";
import "../review/desempenho.css";
import "./nivelamento.css";

export function ErroBanner({ erro }) {
  if (!erro) return null;
  return <Banner tone="danger">{String(erro.message || erro)}</Banner>;
}

/**
 * Moldura comum. modo "primeira": tela cheia antes de entrar no app (barra com o logo, cabeçalho de página, mesma largura das
 * outras telas). modo "rota": o corpo já está dentro do AppShell (título no cabeçalho do app), então só os quadros.
 */
export function Moldura({ modo, titulo, overline = TITULO, voltar, children }) {
  const head = titulo ? (
    <div className="nv-head">
      <span className="nv-head__text">
        {modo === "primeira" && <span className="nv-head__over">{overline}</span>}
        {modo === "primeira" ? <h1 className="nv-head__title">{titulo}</h1> : <h2 className="nv-head__title nv-head__title--rota">{titulo}</h2>}
      </span>
      {voltar}
    </div>
  ) : (
    voltar && <div className="nv-head">{voltar}</div>
  );
  if (modo !== "primeira") {
    return (
      <div className="ev ev-stack nv">
        {head}
        {children}
      </div>
    );
  }
  return (
    <div className="ev nv nv--primeira">
      <header className="nv-top">
        <div className="nv-top__in">
          <span className="tq-brand">
            <BrandLogo />
          </span>
        </div>
      </header>
      <main className="nv-wrap">
        {head}
        <div className="ev-stack">{children}</div>
      </main>
    </div>
  );
}

const PARA_QUE = [
  ["blue", "target"],
  ["violet", "chart"],
  ["green", "route"],
];
const COMO = [
  ["blue", "question"],
  ["orange", "timer"],
  ["slate", "lock"],
  ["violet", "layers"],
  ["green", "clipboard"],
];

function Lista({ itens, icones, className = "" }) {
  return (
    <ul className={`nv-list ${className}`.trim()}>
      {itens.map((texto, i) => (
        <li key={i} className="nv-list__item">
          <Tile tone={icones[i][0]} size={44} radius={13}>
            <RichIcon name={icones[i][1]} size={28} />
          </Tile>
          <span className="nv-list__text">{texto}</span>
        </li>
      ))}
    </ul>
  );
}

export function Apresentacao({ modo, estado, ocupado, erro, onComecar, onDepois }) {
  const andamento = estado?.situacao === "bloco1" || estado?.situacao === "bloco2";
  return (
    <Moldura modo={modo} titulo={modo === "primeira" ? APRESENTACAO.titulo : null}>
      <ErroBanner erro={erro} />
      <div className="nv-intro">
        <section className="nv-hero" aria-label={TITULO}>
          <span className="sm-overline nv-hero__over">{modo === "primeira" ? "Comece aqui" : APRESENTACAO.titulo}</span>
          <h2 className="nv-hero__title">{APRESENTACAO.subtitulo}</h2>
          <div className="nv-hero__stats">
            <span className="nv-stat">
              <b className="ev-mono">15</b>
              <span>questões</span>
            </span>
            <span className="nv-stat">
              <b className="ev-mono">5</b>
              <span>grandes áreas</span>
            </span>
            <span className="nv-stat">
              <b className="ev-mono">~30</b>
              <span>minutos</span>
            </span>
          </div>
          <div className="nv-hero__actions">
            <button type="button" className="sm-btn sm-btn--lg nv-hero__cta" onClick={onComecar} disabled={ocupado}>
              {andamento ? APRESENTACAO.continuar(estado.respondidas, estado.total_bloco) : APRESENTACAO.comecar} <Icon name="arrow-right" size={18} />
            </button>
            <button type="button" className="sm-btn sm-btn--lg nv-hero__later" onClick={onDepois} disabled={ocupado}>
              {APRESENTACAO.depois}
            </button>
          </div>
          {modo === "primeira" && <p className="nv-hero__note">{APRESENTACAO.depoisAviso}</p>}
        </section>
        <Panel className="nv-card" aria-label="Para que serve">
          <h2 className="ev-h2">Para que serve</h2>
          <Lista itens={APRESENTACAO.paraQue} icones={PARA_QUE} />
          <p className="nv-aside nv-aside--foot">
            <Icon name="info" size={16} />
            <span>{APRESENTACAO.separacao}</span>
          </p>
        </Panel>
      </div>
      <Panel className="nv-card" aria-label="Como funciona">
        <h2 className="ev-h2">Como funciona</h2>
        <Lista itens={APRESENTACAO.comoFunciona} icones={COMO} className="nv-list--grid" />
      </Panel>
    </Moldura>
  );
}

/** Anel da proficiência geral (0–100), no desenho do resumo de Desempenho. */
export function Anel({ valor, tamanho }) {
  const r = tamanho / 2 - 9;
  return (
    <span className="nv-ring" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} aria-hidden="true">
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="var(--selected-bg)" strokeWidth="11" />
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="var(--action-primary)" strokeWidth="11" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.max(0, Math.min(100, valor))} 100`} />
      </svg>
      <span className="nv-ring__text">
        <span className="ev-mono nv-ring__value">{fmt1(valor)}%</span>
        <span className="nv-ring__label">proficiência</span>
      </span>
    </span>
  );
}

/** Régua dos 5 níveis provisórios, com o nível do aluno aceso (sem números de faixa: são parâmetros internos). */
export function Regua({ nivel }) {
  return (
    <div className="nv-scale" role="img" aria-label={`Nível ${nivel} de ${NIVEIS.length}`}>
      {NIVEIS.map((n) => (
        <span key={n.nivel} className={`nv-scale__seg${n.nivel < nivel ? " is-past" : ""}${n.nivel === nivel ? " is-on" : ""}`}>
          <span className="ev-mono">{n.nivel}</span>
        </span>
      ))}
    </div>
  );
}

function Metrica({ tone, icon, label, value, caption, texto }) {
  return (
    <div className="ev-panel dp-metric nv-metric">
      <Tile tone={tone} size={48} radius={14}>
        <RichIcon name={icon} size={31} />
      </Tile>
      <span className="dp-metric__text">
        <span className="dp-metric__label">{label}</span>
        <span className={texto ? "nv-metric__name" : "dp-metric__value ev-mono"}>{value}</span>
        {caption && <span className="dp-metric__cap">{caption}</span>}
      </span>
    </div>
  );
}

export function Resultado({ modo, estado, res, narrow, ocupado, erro, onContinuar30, onEntrar, onCorrecao }) {
  const perfil = res.perfil ?? [];
  const prioridades = res.prioridades ?? [];
  const insuficiente = res.status === "DADOS_INSUFICIENTES" || res.score == null;
  const primeira = perfil.find((p) => p.area === prioridades[0]);
  const parcial = estado?.situacao === "parcial";

  return (
    <Moldura modo={modo} titulo={modo === "primeira" ? RESULTADO.titulo : null}>
      <ErroBanner erro={erro} />

      <Panel className={`nv-sum${narrow ? " nv-sum--narrow" : ""}`} aria-label={RESULTADO.rotuloPG}>
        {insuficiente ? (
          <Tile tone="slate" size={narrow ? 64 : 88} radius={22}>
            <RichIcon name="chart-pie" size={narrow ? 40 : 54} />
          </Tile>
        ) : (
          <Anel valor={res.score} tamanho={narrow ? 104 : 148} />
        )}
        <div className="nv-sum__body">
          <div className="nv-sum__top">
            <span className="nv-sum__over">{RESULTADO.rotuloPG}</span>
            <Badge tone="warning" size="sm">
              {RESULTADO.selo}
            </Badge>
          </div>
          {insuficiente ? (
            <p className="nv-sum__level nv-sum__level--sm">{RESULTADO.insuficiente}</p>
          ) : (
            <>
              <p className="nv-sum__level">{`Nível ${res.nivel} · ${res.nivel_nome}`}</p>
              {res.nivel_foco && <p className="nv-sum__foco">Foco: {res.nivel_foco}</p>}
              <Regua nivel={res.nivel} />
            </>
          )}
          <p className="nv-sum__text">{interpretar(res, { pessoa: "voce" })}</p>
        </div>
      </Panel>

      <div className="nv-metrics">
        <Metrica tone="blue" icon="target" label="Acertos brutos" value={`${fmt1(res.percentual_bruto)}%`} caption={`${res.acertos} de ${res.total} questões`} />
        <Metrica tone="violet" icon="question" label="Questões feitas" value={res.total} caption={`${res.total / AREAS.length} por grande área`} />
        <Metrica
          tone="orange"
          icon="route"
          label="1ª prioridade"
          texto
          value={primeira ? primeira.nome : "—"}
          caption={primeira ? `prioridade ${fmt1(primeira.prioridade)}` : null}
        />
      </div>

      {parcial && (
        <section className="nv-next" aria-label={RESULTADO.continuar30}>
          <Tile tone="blue" size={52} radius={16}>
            <RichIcon name="layers" size={32} />
          </Tile>
          <span className="nv-next__text">
            <span className="sm-overline">Parte 2 de 2</span>
            <span className="nv-next__title">{RESULTADO.continuar30Texto}</span>
          </span>
          <Button iconRight="arrow-right" onClick={onContinuar30} disabled={ocupado}>
            {RESULTADO.continuar30}
          </Button>
        </section>
      )}

      <div className="dp-row">
        <Panel className="dp-areas-card nv-areas" aria-label={RESULTADO.porArea}>
          <h2 className="ev-h2">{RESULTADO.porArea}</h2>
          <ul className="dp-areas">
            {perfil.map((p) => {
              const tom = areaOf(p.area)?.tone;
              const largura = Math.max(0, Math.min(100, p.proficiencia));
              return (
                <li key={p.area} className="dp-area">
                  <AreaTile area={p.area} size={40} />
                  <span className="dp-area__body">
                    <span className="dp-area__top">
                      <span className="dp-area__name">{p.nome}</span>
                      <span className="dp-area__val">
                        <strong className="ev-mono">{fmt1(p.proficiencia)}%</strong> · <span className="ev-mono">{p.acertos}/{p.total}</span>
                      </span>
                    </span>
                    <span className="dp-bar" role="img" aria-label={`${p.nome}: proficiência ${fmt1(p.proficiencia)}%, ${p.acertos} acertos em ${p.total} questões`}>
                      <span style={{ width: `${largura}%`, background: tom ? `var(${tom})` : "var(--action-primary)" }} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="dp-foot">{RESULTADO.acertosNota}</p>
        </Panel>

        {prioridades.length > 0 && !insuficiente && (
          <Panel className="dp-areas-card nv-prio" aria-label={RESULTADO.prioridades}>
            <h2 className="ev-h2">{RESULTADO.prioridades}</h2>
            <ol className="nv-prio__list">
              {prioridades.map((id, i) => {
                const p = perfil.find((x) => x.area === id);
                if (!p) return null;
                return (
                  <li key={id} className={`nv-prio__row${i === 0 ? " is-first" : ""}`}>
                    <span className="nv-prio__n ev-mono">{i + 1}</span>
                    <AreaTile area={id} size={32} />
                    <span className="nv-prio__txt">
                      <span className="nv-prio__name">{p.nome}</span>
                      <span className="nv-prio__val">
                        prioridade <b className="ev-mono">{fmt1(p.prioridade)}</b>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
            {primeira && (
              <p className="nv-prio__plan">
                <Icon name="calendar" size={16} />
                <span>{RESULTADO.planoComeca(primeira.nome)}</span>
              </p>
            )}
          </Panel>
        )}
      </div>

      <div className="nv-notes">
        <p className="nv-aside nv-aside--box">
          <Icon name="info" size={16} />
          <span>
            {avisoIncerteza(res)} {AVISO_NAO_E_NOTA}
          </span>
        </p>
        <details className="nv-how">
          <summary>{RESULTADO.comoCalculamosTitulo}</summary>
          <ul>
            {RESULTADO.comoCalculamos.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </details>
      </div>

      <div className="nv-actions">
        <Button size="lg" iconRight="arrow-right" onClick={onEntrar} disabled={ocupado}>
          {modo === "primeira" ? RESULTADO.entrar : RESULTADO.inicio}
        </Button>
        <Button size="lg" variant="secondary" icon="check" onClick={onCorrecao} disabled={ocupado}>
          {RESULTADO.verCorrecao}
        </Button>
      </div>
    </Moldura>
  );
}

export function Correcao({ modo, correcao, filtro, setFiltro, erro, onVoltar }) {
  const itens = correcao.itens ?? [];
  const contar = (id) => itens.filter((i) => id === "todas" || i.questao?.area === id).length;
  const chips = [{ id: "todas", label: "Todas" }, ...AREAS.map((a) => ({ id: a.id, label: areaOf(a.id)?.label ?? a.nome }))];
  const filtrados = itens.filter((i) => filtro === "todas" || i.questao?.area === filtro);
  const certas = itens.filter((i) => i.correta).length;

  const voltar = (
    <Button size="sm" variant="secondary" icon="arrow-left" onClick={onVoltar}>
      {RESULTADO.ocultarCorrecao}
    </Button>
  );

  return (
    <Moldura modo={modo} titulo={CORRECAO.titulo} voltar={voltar}>
      <ErroBanner erro={erro} />
      <Panel className="nv-cor-sum">
        <Tile tone="green" size={44} radius={13}>
          <RichIcon name="list-checks" size={28} />
        </Tile>
        <span className="nv-cor-sum__text">
          <b className="ev-mono">
            {certas} de {itens.length}
          </b>{" "}
          questões certas. Veja o gabarito e o comentário de cada uma.
        </span>
      </Panel>
      <div className="nv-chips" role="group" aria-label="Filtrar por grande área">
        {chips.map((c) => (
          <button key={c.id} type="button" className="nv-chip" aria-pressed={filtro === c.id} onClick={() => setFiltro(c.id)}>
            {c.label} <span className="ev-mono nv-chip__n">{contar(c.id)}</span>
          </button>
        ))}
      </div>
      <div className="tq nv-cor-list">
        {filtrados.map((item) => {
          const certa = item.correta;
          return (
            <article key={`${item.bloco}-${item.ordem}`} className="nv-qa">
              <div className="nv-qa__head">
                <span className={`nv-res ${certa ? "nv-res--ok" : "nv-res--bad"}`}>
                  <Icon name={certa ? "check" : "x"} size={15} />
                  {certa ? CORRECAO.certa : CORRECAO.errada}
                </span>
                <span className="nv-qa__meta">
                  Parte {item.bloco} · Questão {item.posicao}
                </span>
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
              <div className="nv-comment">
                <Tile tone="violet" size={36} radius={11}>
                  <RichIcon name="notebook" size={22} />
                </Tile>
                <span className="nv-comment__body">
                  <h3 className="nv-comment__title">{CORRECAO.comentario}</h3>
                  <p className="nv-comment__text">{item.comentario || CORRECAO.semComentario}</p>
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </Moldura>
  );
}

export function Carregando({ modo, erro }) {
  return (
    <Moldura modo={modo}>
      <ErroBanner erro={erro} />
      {!erro && (
        <Panel className="nv-loading" aria-busy="true">
          <span className="sm-spin" aria-hidden="true" />
          <span>Carregando o seu diagnóstico…</span>
        </Panel>
      )}
    </Moldura>
  );
}
