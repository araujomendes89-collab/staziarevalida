// Resultado do simulado TRI (estimativa StaziaMed): nota na escala própria com a faixa de 95%, aviso fixo, "O que é isso?",
// qualidade da estimativa e desempenho por área (acertos × esperado pelo modelo). Só aparece quando a sessão foi corrigida em TRI;
// no modo clássico (ou se o banco não responder) não mostra nada e o resultado clássico segue igual.
import React from "react";
import { Badge, Button, Card } from "../../ds";
import { useSession } from "../session.jsx";
import { areaLabel, areaOf } from "./format.js";
import { TENDENCIA, TRI_EXPLANATION, TRI_LABEL, TRI_NOTICE, formatNota, tendencia } from "./tri.js";

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Régua de 0 a 100 com a faixa e o ponto da nota. */
function Scale({ nota, lo, hi, color = "var(--action-primary)", height = 10 }) {
  return (
    <div aria-hidden="true" style={{ position: "relative", height, borderRadius: height, background: "var(--surface-sunken)" }}>
      <div style={{ position: "absolute", left: `${lo}%`, width: `${Math.max(hi - lo, 0.5)}%`, top: 0, bottom: 0, borderRadius: height, background: `color-mix(in oklab, ${color} 30%, transparent)` }} />
      <div style={{ position: "absolute", left: `calc(${nota}% - ${height / 2}px)`, top: -3, width: height, height: height + 6, borderRadius: height, background: color }} />
      <div style={{ position: "absolute", left: "50%", top: -4, bottom: -4, width: 1, background: "var(--border-default)" }} />
    </div>
  );
}

export function TriResult({ sessionId, mobile }) {
  const { backend } = useSession() ?? {};
  const [tri, setTri] = React.useState(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    if (!backend?.rpc || !sessionId) return undefined;
    Promise.resolve()
      .then(() => backend.rpc("app_session_irt_result", { p_session_id: sessionId }))
      .then((result) => alive && setTri(result))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [backend, sessionId]);

  if (!tri || tri.scoring !== "irt" || !tri.ready) return null;

  const quality = [
    plural(tri.n_items, "questão na conta", "questões na conta"),
    `${tri.n_calibrated} com dificuldade calibrada`,
    `${tri.n_provisional} com dificuldade provisória`,
    tri.n_annulled > 0 && plural(tri.n_annulled, "anulada fora da conta", "anuladas fora da conta"),
    tri.n_rejected > 0 && `${tri.n_rejected} fora da conta por revisão da questão`,
    tri.n_preliminary > 0 && `${tri.n_preliminary} com gabarito preliminar (pode mudar)`,
  ].filter(Boolean);

  return (
    <Card style={{ borderRadius: 24 }} padding={mobile ? 22 : 32}>
      <section aria-label="Simulado TRI — estimativa StaziaMed" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
            Simulado TRI · escala StaziaMed 0–100
          </span>
          <Badge tone="info" size="sm">
            {TRI_LABEL}
          </Badge>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <span style={{ font: "700 56px/1 var(--font-sans)", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{formatNota(tri.nota)}</span>
          <span style={{ color: "var(--text-secondary)", paddingBottom: 6 }}>
            faixa de {formatNota(tri.nota_lo)} a {formatNota(tri.nota_hi)} (95% de confiança)
          </span>
        </div>
        <Scale nota={tri.nota} lo={tri.nota_lo} hi={tri.nota_hi} />
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{quality.join(" · ")}</p>
        <div>
          <Button variant="secondary" size="sm" icon={open ? "chevron-up" : "circle-help"} aria-expanded={open} onClick={() => setOpen(!open)}>
            O que é isso?
          </Button>
          {open && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, font: "var(--type-body-sm)", lineHeight: 1.6 }}>
              {TRI_EXPLANATION.map((paragraph) => (
                <p key={paragraph} style={{ margin: 0 }}>
                  {paragraph}
                </p>
              ))}
            </div>
          )}
        </div>
        {tri.by_area?.length > 0 && (
          <div>
            <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
              Por grande área · acertos × esperado pela sua nota
            </span>
            <ul aria-label="Desempenho por área (TRI)" style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
              {tri.by_area.map((area) => {
                const t = TENDENCIA[tendencia(area)];
                return (
                  <li key={area.area} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ font: "var(--type-label)", flex: "1 1 160px" }}>{areaLabel(area.area)}</span>
                      <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                        {area.n_correct} de {area.n_items} · esperado {formatNota(area.expected)}
                      </span>
                      <Badge size="sm" tone={t.tone}>
                        {t.label}
                      </Badge>
                    </div>
                    <Scale nota={area.nota} lo={area.nota_lo} hi={area.nota_hi} height={6} color={`var(${areaOf(area.area)?.tone ?? "--chart-1"})`} />
                    <span style={{ font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>
                      tendência da área: {formatNota(area.nota)} (faixa de {formatNota(area.nota_lo)} a {formatNota(area.nota_hi)}, com poucas questões a faixa é larga)
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>
          {TRI_LABEL}. {TRI_NOTICE}
        </p>
      </section>
    </Card>
  );
}
