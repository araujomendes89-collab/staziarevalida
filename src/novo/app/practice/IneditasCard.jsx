// "Questões Inéditas" na tela do aluno: o cartão do Banco de Questões e do Início (contador + convite) e o selo da questão.
// Dados: app_my_ineditas() = { total, released, answered, limit, limited, locked }. Só números: nada de conteúdo de questão, gabarito,
// explicação, fonte ou código; sem preço (a assinatura pelo app ainda não existe).
import React from "react";
import { Button, Card, Icon, ProgressBar } from "../../ds";
import { Badge } from "../../ds";

/** Qual dos quatro estados mostrar: sem inéditas publicadas (oculto), sem acesso, plano com limite, ou todas liberadas. */
export function ineditasState(i) {
  if (!i || !(Number(i.total) > 0)) return "oculto";
  if (i.locked === true) return "sem_acesso";
  if (i.limited === true && Number(i.released) < Number(i.total)) return "limitado";
  return "todas";
}

/** Lê o resumo do aluno; se o banco não responder, devolve null e o cartão simplesmente não aparece. */
export function useMyIneditas(backend) {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => backend.rpc("app_my_ineditas"))
      .then((result) => alive && setData(result && typeof result === "object" ? result : null))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [backend]);
  return data;
}

/** "20 de 74 liberadas" · "Todas as 74 liberadas" · "74 Questões Inéditas" */
export function counterText(i) {
  const state = ineditasState(i);
  if (state === "limitado") return `${i.released} de ${i.total} liberadas`;
  if (state === "todas") return Number(i.total) === 1 ? "A única questão está liberada" : `Todas as ${i.total} liberadas`;
  return `${i.total} ${Number(i.total) === 1 ? "questão no banco" : "questões no banco"}`;
}

const TEXTS = {
  limitado: "Questões novas, escritas pela StaziaMed. Seu plano libera parte delas; as outras abrem em um plano com mais acesso.",
  todas: "Questões novas, escritas pela StaziaMed a partir de fontes oficiais. Todas estão liberadas no seu plano.",
  sem_acesso: "Questões novas, escritas pela StaziaMed. Abrem com plano ou teste grátis em dia. As provas oficiais continuam abertas.",
};

/**
 * Cartão "Questões Inéditas". variant "banco" (grande, no Banco de Questões) ou "inicio" (compacto, no Início e no Plano de Hoje).
 * onOpen({ status }) abre a resolução (status "unanswered" enquanto houver pendentes, "all" depois); onPlans abre a tela de planos.
 */
export function IneditasCard({ ineditas, onOpen, onPlans, variant = "banco", busy = false }) {
  const state = ineditasState(ineditas);
  if (state === "oculto") return null;
  const released = Number(ineditas.released) || 0;
  const answered = Math.min(Number(ineditas.answered) || 0, released);
  const pending = Math.max(0, released - answered);
  const missing = Math.max(0, Number(ineditas.total) - released);
  const locked = state === "sem_acesso";
  const compact = variant === "inicio";
  const primary = locked ? (
    <Button size={compact ? "sm" : "md"} icon="lock" onClick={onPlans} disabled={!onPlans}>
      Ver planos
    </Button>
  ) : (
    <Button size={compact ? "sm" : "md"} iconRight="arrow-right" onClick={() => onOpen?.({ status: pending > 0 ? "unanswered" : "all" })} loading={busy} disabled={!onOpen}>
      {pending > 0 || answered === 0 ? "Resolver Questões Inéditas" : "Rever Questões Inéditas"}
    </Button>
  );
  return (
    <Card variant="brand" padding={compact ? 20 : 24} role="region" aria-label="Questões Inéditas" style={{ borderRadius: 24 }}>
      <div style={{ display: "flex", gap: compact ? 14 : 18, alignItems: compact ? "center" : "flex-start", flexWrap: "wrap" }}>
        <span
          aria-hidden="true"
          style={{ flex: "none", width: compact ? 44 : 52, height: compact ? 44 : 52, borderRadius: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--action-primary)", color: "var(--action-on-primary)" }}
        >
          <Icon name={locked ? "lock" : "lightbulb"} size={compact ? 22 : 26} />
        </span>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <span className="sm-overline">Questões Inéditas</span>
          <div style={{ font: `700 ${compact ? 20 : 26}px/1.2 var(--font-sans)`, letterSpacing: "-0.015em", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{counterText(ineditas)}</div>
          {!compact && <p style={{ margin: "8px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)", textWrap: "pretty" }}>{TEXTS[state]}</p>}
          {compact && <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", marginTop: 2 }}>{locked ? "Abrem com plano ou teste grátis em dia." : "Escritas pela StaziaMed. Não são questões do Inep."}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {primary}
          {!locked && missing > 0 && onPlans && (
            <Button size={compact ? "sm" : "md"} variant="ghost" icon="crown" onClick={onPlans}>
              Conhecer os planos
            </Button>
          )}
        </div>
      </div>
      {!compact && !locked && released > 0 && (
        <div style={{ marginTop: 18 }}>
          <ProgressBar label="Respondidas" valueLabel={`${answered} de ${released}`} value={answered} max={released} />
        </div>
      )}
    </Card>
  );
}

/** Selo da Questão Inédita, na resolução e na correção. O número é o da própria questão na coleção StaziaMed. */
export function IneditaSeal({ number }) {
  return (
    <Badge tone="brand" icon="lightbulb">
      {number != null ? `Questão Inédita · nº ${number}` : "Questão Inédita"}
    </Badge>
  );
}
