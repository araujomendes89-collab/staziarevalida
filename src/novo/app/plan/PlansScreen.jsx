// Planos (PL01): tela do ALUNO, SÓ INFORMATIVA. Mostra o nome, a descrição e o que cada plano inclui, do jeito que o administrador
// escreveu em Administração > Planos (função app_plans_info), e a situação da própria pessoa. NÃO tem preço, NÃO tem botão de assinar
// e não leva a pagamento nenhum: a assinatura pelo app ainda não está disponível (a Stripe está parada) e os preços só entram depois.
import React from "react";
import { Badge, Banner, Button, Card, EmptyState } from "../../ds";
import { useSession } from "../session.jsx";
import { currentPlanCode, hasFullAccess, planStatusLabel, usePlanLock } from "./planAccess.js";

const PLAN_NAME = { trial: "Teste grátis", pro: "Pro", elite: "Elite" };
const minutes = (n) => `${n} ${n === 1 ? "minuto" : "minutos"}`;

/** Os itens extras de um plano, só com o que o painel já tem (nada é inventado): minutos de voz do Tutor e a correção de estação do Elite. */
export function planExtras(code, info) {
  const extras = [];
  if (code === "pro" && info.pro_voice_daily_minutes != null) extras.push(`Voz do Tutor: até ${minutes(info.pro_voice_daily_minutes)} por dia`);
  if (code === "elite") {
    const voice = info.elite_voice_daily_minutes ?? info.pro_voice_daily_minutes;
    if (voice != null) extras.push(`Voz do Tutor: até ${minutes(voice)} por dia`);
    if (info.elite_station_feedback) extras.push("Correção de estação com devolutiva");
  }
  return extras;
}

function PlanCard({ plan, info, current }) {
  const features = Array.isArray(plan.features) ? plan.features : [];
  const extras = planExtras(plan.code, info);
  const description = (plan.description ?? "").trim();
  const empty = !description && features.length === 0 && extras.length === 0;
  return (
    <Card padding={24} data-testid={`plano-${plan.code}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>{plan.name || PLAN_NAME[plan.code]}</h3>
          {current && <Badge tone="pro">Seu plano</Badge>}
        </div>
        {description && <p style={{ margin: 0, color: "var(--text-secondary)" }}>{description}</p>}
        {(features.length > 0 || extras.length > 0) && (
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {[...features, ...extras].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        {empty && <p style={{ margin: 0, color: "var(--text-tertiary)", font: "var(--type-body-sm)" }}>A equipe ainda vai descrever o que este plano inclui.</p>}
      </div>
    </Card>
  );
}

export function PlansScreen({ go }) {
  const { backend, boot } = useSession();
  const [state, setState] = React.useState({ status: "loading", info: null });
  const [tick, setTick] = React.useState(0);
  const lock = usePlanLock();
  const reviewer = Boolean(boot?.reviewer_areas?.length);
  const label = planStatusLabel(boot?.subscription, boot?.role, reviewer);
  const current = currentPlanCode(boot?.subscription, boot?.role, reviewer);

  React.useEffect(() => {
    let alive = true;
    setState({ status: "loading", info: null });
    Promise.resolve()
      .then(() => backend.rpc("app_plans_info"))
      .then((info) => alive && setState({ status: Array.isArray(info?.plans) ? "ready" : "error", info }))
      .catch(() => alive && setState({ status: "error", info: null }));
    return () => {
      alive = false;
    };
  }, [backend, tick]);

  const info = state.info;
  // o Teste grátis só aparece como opção enquanto é oferecido no cadastro (ou se a pessoa está nele)
  const plans = (info?.plans ?? []).filter((p) => p.code !== "trial" || p.offered_at_signup !== false || current === "trial");
  const paidParts = info?.tutor_paid ? "Os simulados completos, o Tutor e as estações Pro" : "Os simulados completos e as estações Pro";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Banner tone="info" title="A assinatura pelo app ainda não está disponível">
        Esta página só mostra o que cada plano inclui. Ainda não há cobrança nem preço aqui.
      </Banner>
      <Card padding={24}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Sua situação</h3>
          {label ? <div><Badge tone="pro">{label}</Badge></div> : <p style={{ margin: 0, color: "var(--text-secondary)" }}>Não há plano registrado na sua conta.</p>}
          {lock && (
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>
              <b>{lock.title}.</b> {lock.text}
            </p>
          )}
          {hasFullAccess(boot) && <p style={{ margin: 0, color: "var(--text-secondary)" }}>Você tem acesso completo ao app, sem precisar de plano.</p>}
        </div>
      </Card>
      {state.status === "loading" && <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando os planos…</p>}
      {state.status === "error" && (
        <EmptyState
          icon="cloud-off"
          title="Não foi possível carregar os planos agora"
          description="Tente de novo em instantes."
          action={<Button onClick={() => setTick((n) => n + 1)}>Tentar de novo</Button>}
        />
      )}
      {state.status === "ready" && (
        <>
          {plans.length === 0 ? (
            <EmptyState icon="crown" title="Nenhum plano para mostrar agora" description="Volte aqui mais tarde." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
              {plans.map((plan) => (
                <PlanCard key={plan.code} plan={plan} info={info} current={current === plan.code} />
              ))}
            </div>
          )}
          <p style={{ margin: 0, color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>
            {paidParts} ficam com os planos pagos e com o teste grátis enquanto ele vale. As questões e os flashcards ficam abertos para todos.
          </p>
        </>
      )}
      <div>
        <Button variant="secondary" icon="arrow-left" onClick={() => go("perfil")}>
          Voltar para a conta
        </Button>
      </div>
    </div>
  );
}
