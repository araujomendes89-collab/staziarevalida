// Perfil de erros e reforço (SQIE fase 5). Tudo vem das respostas do próprio aluno e das análises PUBLICADAS por
// revisor médico; sem análise publicada o erro aparece sem "tipo" e a tela diz quanto já foi diagnosticado.
import React from "react";
import { Badge, Banner, Button, Card } from "../../ds";
import { useSession } from "../session.jsx";
import { ERROR_TYPE, KIND_LABEL } from "../practice/diagnosisLabels.js";

const R = { borderRadius: 24 };
const REASON = { conhecimento: "Não sabia o conteúdo", interpretacao: "Interpretei mal", atencao: "Falta de atenção", chute: "Chutei", outro: "Outro" };
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

export function ErrorProfile({ go, days }) {
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
  return (
    <Card style={R} padding={28}>
      <h3 style={{ margin: "0 0 4px", font: "600 18px var(--font-sans)" }}>Por que você erra</h3>
      <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>
        {data.wrong} erro(s) em {data.attempts} respostas nos últimos {data.days} dias.{" "}
        {data.diagnosed > 0
          ? `${data.diagnosed} deles (${pct(data.diagnosed, data.wrong)}%) têm análise revisada por médico; os tipos abaixo valem só para esses.`
          : "Ainda não há análise revisada por médico para as questões que você errou, então o tipo de erro não pode ser dito."}
      </p>
      {error && <Banner tone="warning">{error}</Banner>}
      {data.error_types.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {data.error_types.map((t) => (
            <Badge key={t.type} tone="warning">{ERROR_TYPE[t.type] ?? t.type} · {t.count}</Badge>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {data.kinds?.TRUE_BUT_NOT_BEST > 0 && <Badge tone="info">{data.kinds.TRUE_BUT_NOT_BEST} vez(es): alternativa verdadeira, mas não a melhor</Badge>}
        {data.fixed_ideas > 0 && <Badge tone="danger">{data.fixed_ideas} questão(ões) em que você repetiu a mesma alternativa errada</Badge>}
        {data.confidence.wrong_but_sure > 0 && <Badge tone="danger">{data.confidence.wrong_but_sure} erro(s) com certeza da resposta</Badge>}
        {data.confidence.wrong_and_guessing > 0 && <Badge>{data.confidence.wrong_and_guessing} erro(s) em chute</Badge>}
      </div>
      {reasons && Object.keys(reasons.declared).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="sm-overline">O que você mesmo declarou como motivo</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {Object.entries(reasons.declared).map(([k, n]) => (
              <Badge key={k}>{REASON[k] ?? k} · {n}</Badge>
            ))}
          </div>
          <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 4 }}>Vem das suas anotações no caderno de erros ({Object.values(reasons.declared).reduce((a, b) => a + b, 0)} de {reasons.wrong_questions} questões erradas).</div>
        </div>
      )}
      {data.traps.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="sm-overline">Armadilhas em que você mais caiu</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, font: "var(--type-body-sm)" }}>
            {data.traps.map((t, i) => (
              <li key={i}>{t.trap}{t.count > 1 ? ` (${t.count}×)` : ""}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="sm-overline">Pontos para reforçar</div>
      {data.weak_points.length === 0 ? (
        <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>Nenhum ponto com 3 ou mais respostas e 40% ou mais de erro. Continue praticando para o sistema enxergar padrões.</p>
      ) : (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {data.weak_points.map((p) => {
            const key = `${p.subarea}|${p.competency}`;
            return (
              <div key={key} style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "10px 12px", border: "1px solid var(--border-subtle)", borderRadius: 14 }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{p.subarea}</strong>
                  <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{p.competency} · {p.wrong} erro(s) em {p.attempts} respostas ({Math.round(p.rate * 100)}%)</div>
                </div>
                <Button size="sm" iconRight="arrow-right" loading={starting === key} onClick={() => reinforce(p)}>Reforçar com questões reais</Button>
              </div>
            );
          })}
        </div>
      )}
      <p style={{ margin: "12px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>O reforço usa só questões reais do banco: primeiro as que você errou e ainda não superou, depois as que ainda não respondeu.</p>
    </Card>
  );
}
