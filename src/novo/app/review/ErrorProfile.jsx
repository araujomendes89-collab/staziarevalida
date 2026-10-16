// Perfil de erros e reforço (SQIE fase 5). Tudo vem das respostas do próprio aluno e das análises PUBLICADAS por
// revisor médico; sem análise publicada o erro aparece sem "tipo" e a tela diz quanto já foi diagnosticado.
import React from "react";
import { Badge, Banner, Button } from "../../ds";
import { useSession } from "../session.jsx";
import { ERROR_TYPE } from "../practice/diagnosisLabels.js";
import { Panel, RichIcon, Tile } from "../evolucao/ui.jsx";

const REASON = { conhecimento: "Não sabia o conteúdo", interpretacao: "Interpretei mal", atencao: "Falta de atenção", chute: "Chutei", outro: "Outro" };
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

export function ErrorProfile({ go, days, compact = false }) {
  const { backend } = useSession();
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [starting, setStarting] = React.useState(null);
  const [reasons, setReasons] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    setData(null);
    backend.rpc("app_error_profile", { p_days: Number(days) }).then((r) => alive && setData(r), () => alive && setError("Não foi possível carregar o seu perfil de erros."));
    backend.rpc("app_error_reasons", { p_days: Number(days) }).then((r) => alive && setReasons(r), () => {});
    return () => {
      alive = false;
    };
  }, [backend, days]);

  const reinforce = async (point) => {
    setStarting(`${point.subarea}|${point.competency}`);
    setError(null);
    try {
      const r = await backend.rpc("app_start_reinforcement", { p_subarea: point.subarea, p_competency: point.competency, p_count: 10 });
      go("sessao", { s: r.session_id });
    } catch (e) {
      setError(/Nada novo/.test(e?.message ?? "") ? "Neste ponto você já respondeu e superou as questões disponíveis." : "Não foi possível montar o reforço. Tente de novo.");
      setStarting(null);
    }
  };

  if (error && !data) return <Banner tone="danger">{error}</Banner>;
  if (!data || data.wrong === 0) return null;
  const declaredTotal = reasons ? Object.values(reasons.declared).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className={`dp-errors${compact ? " dp-errors--stack" : ""}`}>
      <Panel className="dp-err" aria-label="Por que você erra">
        <Tile tone="orange" size={44} radius={13}>
          <RichIcon name="notebook" size={29} />
        </Tile>
        <div className="dp-err__body">
          <h2 className="ev-h2" style={{ fontSize: 16 }}>Por que você erra</h2>
          <p className="dp-err__text">
            <strong>
              <span className="ev-mono">{data.wrong}</span> erro(s) em <span className="ev-mono">{data.attempts}</span> respostas
            </strong>{" "}
            nos últimos {data.days} dias.{" "}
            {data.diagnosed > 0
              ? `${data.diagnosed} deles (${pct(data.diagnosed, data.wrong)}%) têm análise revisada por médico; os tipos abaixo valem só para esses.`
              : "Ainda não há análise revisada por médico."}
          </p>
          {error && <Banner tone="warning">{error}</Banner>}
          {data.error_types.length > 0 && (
            <div className="dp-chips">
              {data.error_types.map((t) => (
                <Badge key={t.type} tone="warning">{ERROR_TYPE[t.type] ?? t.type} · {t.count}</Badge>
              ))}
            </div>
          )}
          <div className="dp-chips">
            {data.kinds?.TRUE_BUT_NOT_BEST > 0 && <Badge tone="info">{data.kinds.TRUE_BUT_NOT_BEST} vez(es): alternativa verdadeira, mas não a melhor</Badge>}
            {data.fixed_ideas > 0 && <Badge tone="danger">{data.fixed_ideas} questão(ões) em que você repetiu a mesma alternativa errada</Badge>}
            {data.confidence.wrong_but_sure > 0 && <Badge tone="danger">{data.confidence.wrong_but_sure} erro(s) com certeza da resposta</Badge>}
            {data.confidence.wrong_and_guessing > 0 && <Badge>{data.confidence.wrong_and_guessing} erro(s) em chute</Badge>}
          </div>
          {reasons && Object.keys(reasons.declared).length > 0 && (
            <>
              <p className="dp-err__sub">O que você mesmo declarou como motivo</p>
              <div className="dp-chips">
                {Object.entries(reasons.declared).map(([k, n]) => (
                  <Badge key={k}>{REASON[k] ?? k} · {n}</Badge>
                ))}
              </div>
              <p className="dp-foot">Vem das suas anotações no caderno de erros ({declaredTotal} de {reasons.wrong_questions} questões erradas).</p>
            </>
          )}
          {data.traps.length > 0 && (
            <>
              <p className="dp-err__sub">Armadilhas em que você mais caiu</p>
              <ul style={{ margin: 0, paddingLeft: 18, font: "var(--type-body-sm)" }}>
                {data.traps.map((t, i) => (
                  <li key={i}>{t.trap}{t.count > 1 ? ` (${t.count}×)` : ""}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Panel>
      <Panel className="dp-err" aria-label="Pontos para reforçar">
        <Tile tone="green" size={44} radius={13}>
          <RichIcon name="target" size={29} />
        </Tile>
        <div className="dp-err__body">
          <h2 className="ev-h2" style={{ fontSize: 16 }}>Pontos para reforçar</h2>
          {data.weak_points.length === 0 ? (
            <p className="dp-err__text">Nenhum ponto com 3 ou mais respostas e 40% ou mais de erro.</p>
          ) : (
            <div className="dp-weak">
              {data.weak_points.map((p) => {
                const key = `${p.subarea}|${p.competency}`;
                return (
                  <div key={key} className="dp-weak__row">
                    <div style={{ minWidth: 0 }}>
                      <strong>{p.subarea}</strong>
                      <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{p.competency} · {p.wrong} erro(s) em {p.attempts} respostas ({Math.round(p.rate * 100)}%)</div>
                    </div>
                    <Button size="sm" iconRight="arrow-right" loading={starting === key} onClick={() => reinforce(p)}>Reforçar com questões reais</Button>
                  </div>
                );
              })}
              <p className="dp-foot">O reforço usa só questões reais do banco: primeiro as que você errou e ainda não superou, depois as que ainda não respondeu.</p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
