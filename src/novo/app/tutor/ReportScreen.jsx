// Relatório do Tutor em /analise ("Análise Inteligente"), com o mesmo portão da Nexus: aceite do §34, Tutor desligado e plano.
// Visual do pacote "Novas telas" (15/10/2026). Todo número vem do banco (app_tutor_report); nada é inventado e não há previsão de aprovação.
import React from "react";
import { Badge, Banner, Button, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { ERROR_CLASS, LEVEL } from "./labels.js";
import { TutorGate } from "./nexus/TutorGate.jsx";
import { explainError } from "../../../shared/errors/explicarErro";
import { areaLabel, areaOf } from "../practice/format.js";
import { AreaTile, Panel, RichIcon, Tile, useNarrow } from "../evolucao/ui.jsx";
import "./analise.css";

const messageOf = (error) => explainError(error);
// Intermediário em âmbar, como no pacote (os outros níveis seguem os rótulos de sempre)
const LEVEL_TONE = { INTERMEDIARIO: "warning" };

export function ReportScreen({ go }) {
  return <TutorGate go={go}>{() => <Report />}</TutorGate>;
}

const pct = (x) => (x.attempts ? `${Math.round((100 * x.correct) / x.attempts)}% em ${x.attempts}` : null);

function Stat({ tone, icon, label, value, caption }) {
  return (
    <div className="ev-panel an-stat">
      <Tile tone={tone} size={48} radius={14}>
        <RichIcon name={icon} size={31} />
      </Tile>
      <span className="an-stat__text">
        <span className="an-stat__label">{label}</span>
        <span className="an-stat__value ev-mono">{value}</span>
        {caption && <span className="an-stat__cap">{caption}</span>}
      </span>
    </div>
  );
}

/** Domínio por grande área: arte da área, % em N, barra e o nível. As áreas sem resposta ficam por último. */
function MasteryList({ areas }) {
  const sorted = [...areas].sort((a, b) => Number(b.attempts > 0) - Number(a.attempts > 0));
  return (
    <ul className="dp-areas">
      {sorted.map((a) => {
        const [label, tone] = LEVEL[a.level] ?? [a.level, "neutral"];
        const known = areaOf(a.area);
        return (
          <li key={a.area} className="dp-area">
            <AreaTile area={a.area} size={40} />
            <span className="dp-area__body">
              <span className="dp-area__top">
                <span className="dp-area__name">{known ? areaLabel(a.area) : a.area.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span>
                {a.attempts ? (
                  <span className="dp-area__val">
                    <strong className="ev-mono">{a.accuracy}%</strong> em <span className="ev-mono">{a.attempts}</span>
                  </span>
                ) : (
                  <span className="dp-area__val dp-area__val--none">sem respostas</span>
                )}
              </span>
              <span className="an-barline">
                <span className="dp-bar" role="img" aria-label={a.attempts ? `${a.accuracy}% em ${a.attempts} respostas` : "sem respostas"}>
                  <span style={{ width: `${a.attempts ? a.accuracy : 0}%`, background: `var(${known?.tone ?? "--text-tertiary"})` }} />
                </span>
                {a.attempts > 0 && (
                  <Badge size="sm" tone={LEVEL_TONE[a.level] ?? tone}>
                    {label}
                  </Badge>
                )}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Evolution({ data }) {
  const last = pct(data.evolution.last_30);
  const before = pct(data.evolution.previous_30);
  return (
    <Panel className="an-card" aria-label="Evolução">
      <h2 className="ev-h2" style={{ fontSize: 16 }}>Evolução</h2>
      <div className="an-evo">
        <div className="an-evo__now">
          <div className="an-evo__k an-evo__k--now">Últimos 30 dias</div>
          {last ? (
            <>
              <div className="an-evo__v ev-mono">{Math.round((100 * data.evolution.last_30.correct) / data.evolution.last_30.attempts)}%</div>
              <div className="an-evo__s">em <span className="ev-mono">{data.evolution.last_30.attempts}</span></div>
            </>
          ) : (
            <div className="an-evo__none">sem respostas</div>
          )}
        </div>
        <div className="an-evo__before">
          <div className="an-evo__k">30 dias anteriores</div>
          {before ? (
            <>
              <div className="an-evo__v ev-mono" style={{ fontSize: 22 }}>{Math.round((100 * data.evolution.previous_30.correct) / data.evolution.previous_30.attempts)}%</div>
              <div className="an-evo__s">em <span className="ev-mono">{data.evolution.previous_30.attempts}</span></div>
            </>
          ) : (
            <div className="an-evo__none">sem respostas</div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Reviews({ data }) {
  return (
    <Panel className="an-card" aria-label="Revisões">
      <div className="an-title">
        <Tile tone="blue" size={36} radius={10}>
          <RichIcon name="layers" size={24} />
        </Tile>
        <h2 className="ev-h2" style={{ fontSize: 16 }}>Revisões</h2>
      </div>
      <div className="an-reviews">
        <strong className="ev-mono">{data.reviews.due}</strong> na hora de rever · <strong className="ev-mono">{data.reviews.scheduled}</strong> agendadas
      </div>
      <div className="an-chips" aria-label="Intervalos das revisões agendadas: 1, 3, 7, 14 e 30 dias">
        {[1, 3, 7, 14, 30].map((n) => (
          <span key={n} className="an-chip">
            <span className="ev-mono">{n}</span>&nbsp;{n === 1 ? "dia" : "dias"}
          </span>
        ))}
      </div>
    </Panel>
  );
}

function WithTutor({ data, classes }) {
  return (
    <section className="an-tutor" aria-label="Com o Tutor">
      <div className="an-title">
        <span className="an-ia">
          <Icon name="sparkles" size={20} />
        </span>
        <h2 className="ev-h2" style={{ fontSize: 16, color: "var(--ai-text)" }}>Com o Tutor</h2>
      </div>
      <div className="an-tutor__grid">
        <div>
          <div className="an-tutor__v ev-mono">{data.tutor.correct}/{data.tutor.answers}</div>
          <div className="an-tutor__k">acertos em respostas</div>
        </div>
        <div>
          <div className="an-tutor__v ev-mono">{data.tutor.avg_hints}</div>
          <div className="an-tutor__k">ajuda(s) por questão, em média</div>
        </div>
      </div>
      {(data.tutor.wrong_but_sure > 0 || data.tutor.lucky_guesses > 0 || data.tutor.with_heavy_hints > 0) && (
        <div className="an-chips">
          {data.tutor.wrong_but_sure > 0 && <Badge tone="danger">{data.tutor.wrong_but_sure} erro(s) com certeza</Badge>}
          {data.tutor.lucky_guesses > 0 && <Badge tone="warning">{data.tutor.lucky_guesses} provável(is) chute(s)</Badge>}
          {data.tutor.with_heavy_hints > 0 && <Badge tone="warning">{data.tutor.with_heavy_hints} com muita ajuda</Badge>}
        </div>
      )}
      {classes.length > 0 && (
        <>
          <div className="an-chips">
            {classes.map(([k, n]) => (
              <Badge key={k} tone="warning">{ERROR_CLASS[k] ?? k} · {n}</Badge>
            ))}
          </div>
          <p className="an-tutor__note">Tipo de erro apontado pelo Tutor (IA) nos últimos 90 dias: serve de pista, não é diagnóstico revisado por médico.</p>
        </>
      )}
    </section>
  );
}

/** O que o Tutor percebeu, erros que se repetem e temas críticos: só aparecem quando o banco devolve algo. */
function Findings({ data }) {
  const insights = data.insights ?? [];
  const recurrent = data.recurrent_errors ?? [];
  if (insights.length === 0 && recurrent.length === 0 && data.critical_topics.length === 0) return null;
  return (
    <Panel className="an-card an-find" aria-label="O que o Tutor percebeu">
      {insights.length > 0 && (
        <div className="an-insight">
          <div className="sm-overline">O Tutor percebeu</div>
          {insights.map((x) => (
            <p key={x.text} style={{ margin: 0, font: "var(--type-body-sm)" }}>{x.text} <span style={{ color: "var(--text-tertiary)" }}>({x.evidence} casos)</span></p>
          ))}
        </div>
      )}
      {recurrent.length > 0 && (
        <div>
          <div className="sm-overline">Erros que se repetem</div>
          <div className="an-chips" style={{ marginTop: 8 }}>
            {recurrent.map((e) => (
              <Badge key={`${e.error_type}-${e.knowledge_gap}`} tone="danger">{ERROR_CLASS[e.error_type] ?? e.error_type}{e.knowledge_gap ? `: ${e.knowledge_gap}` : ""} · {e.times}×</Badge>
            ))}
          </div>
        </div>
      )}
      {data.critical_topics.length > 0 && (
        <div>
          <div className="sm-overline">Temas críticos</div>
          <div className="an-chips" style={{ marginTop: 8 }}>
            {data.critical_topics.map((t) => (
              <Badge key={`${t.area}-${t.subarea}`} tone={LEVEL[t.level]?.[1]}>{t.subarea} · {t.accuracy}%</Badge>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

const TABS = [
  { value: "areas", label: "Por área" },
  { value: "evo", label: "Evolução" },
  { value: "tutor", label: "Tutor" },
];

/** O relatório do aluno (dados do banco: erros, domínio, evolução, revisões e o que o Tutor percebeu). */
export function Report({ onBack = null }) {
  const { backend } = useSession();
  const narrow = useNarrow();
  const [tab, setTab] = React.useState("areas");
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    backend.rpc("app_tutor_report").then((r) => alive && setData(r), (e) => alive && setError(messageOf(e)));
    return () => {
      alive = false;
    };
  }, [backend]);
  if (error) return <Banner tone="danger">{error}</Banner>;
  if (!data) return <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;
  const classes = Object.entries(data.error_types ?? data.tutor.error_classes ?? {}).sort((a, b) => b[1] - a[1]);
  const risk = data.highest_risk_area ? (areaOf(data.highest_risk_area) ? areaLabel(data.highest_risk_area) : data.highest_risk_area.replace(/_/g, " ").toLowerCase()) : null;
  const s = data.sessions;
  const voice = s?.voice_minutes ? `${s.voice_minutes} por voz` : null;
  const back = onBack && (
    <Button size="sm" variant="ghost" icon="arrow-left" onClick={onBack}>
      Voltar
    </Button>
  );
  const note = (
    <p className="an-foot">
      <Icon name="info" size={16} /> Não há previsão de aprovação aqui: não existe base para prometer isso.
    </p>
  );
  const mastery = (
    <Panel className="an-mastery" aria-label="Domínio por grande área">
      {!narrow && <h2 className="ev-h2">Domínio por grande área</h2>}
      <MasteryList areas={data.mastery.areas} />
      {risk && !narrow && (
        <div className="an-risk" role="note">
          <Icon name="triangle-alert" size={18} />
          <span>Área com maior risco hoje: <strong>{risk}</strong>.</span>
        </div>
      )}
    </Panel>
  );

  if (narrow) {
    return (
      <div className="ev ev-stack an an--narrow">
        {back}
        <section className="an-hero" aria-label="Meu relatório">
          <span className="an-hero__top">
            <RichIcon name="sparkles" size={34} />
            <span className="an-hero__txt">
              <span className="an-hero__k">O que o Tutor percebeu</span>
              <span className="an-hero__v">{risk ? `Área com maior risco hoje: ${risk}.` : "Ainda não há área de maior risco."}</span>
            </span>
          </span>
          {s && (
            <span className="an-hero__stats">
              <span><b className="ev-mono">{s.count}</b><small>sessões</small></span>
              <span><b className="ev-mono">{s.minutes} min</b><small>de estudo{voice ? ` · ${voice}` : ""}</small></span>
              <span><b className="ev-mono">{s.questions_discussed}</b><small>questões discutidas</small></span>
            </span>
          )}
        </section>
        <div role="tablist" aria-label="Seções da análise" className="ev-tabs">
          {TABS.map((t) => (
            <button key={t.value} type="button" role="tab" id={`an-tab-${t.value}`} aria-selected={tab === t.value} aria-controls="an-panel" className="ev-tab" onClick={() => setTab(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <div id="an-panel" role="tabpanel" aria-labelledby={`an-tab-${tab}`} className="ev-stack">
          {tab === "areas" && mastery}
          {tab === "evo" && (
            <>
              <Evolution data={data} />
              <Reviews data={data} />
            </>
          )}
          {tab === "tutor" && (
            <>
              <WithTutor data={data} classes={classes} />
              <Findings data={data} />
            </>
          )}
        </div>
        {note}
      </div>
    );
  }

  return (
    <div className="ev ev-stack an">
      {back}
      <section className="an-sec" aria-label="Meu relatório">
        <div className="an-top">
          <h2 className="ev-h2">Meu relatório</h2>
          <span className="an-pill">
            <RichIcon name="sparkles" size={18} />
            Feita pelo Tutor
          </span>
        </div>
        {s && (
          <div className="an-stats">
            <Stat tone="violet" icon="sparkles" label="Sessões" value={s.count} />
            <Stat tone="blue" icon="timer" label="De estudo" value={`${s.minutes} min`} caption={voice} />
            <Stat tone="blue" icon="question" label="Questões discutidas" value={s.questions_discussed} />
          </div>
        )}
      </section>
      <div className="an-cols">
        <div className="an-main">
          {mastery}
          <Findings data={data} />
        </div>
        <div className="an-side">
          <Evolution data={data} />
          <Reviews data={data} />
          <WithTutor data={data} classes={classes} />
        </div>
      </div>
      {note}
    </div>
  );
}
