// Planos (PL01): tela do ALUNO, SÓ INFORMATIVA. Mostra o nome, a descrição e o que cada plano inclui, do jeito que o administrador
// escreveu em Administração > Planos (função app_plans_info), e a situação da própria pessoa. NÃO tem preço, NÃO tem botão de assinar
// e não leva a pagamento nenhum: a assinatura pelo app ainda não está disponível e os preços só entram depois.
// EXCEÇÃO (cobrança, 013700): com o fornecedor ligado no servidor, a BillingSection mostra preços, compra e "Minha assinatura".
import React from "react";
import { Badge, Button, EmptyState, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { currentPlanCode, hasFullAccess, planStatusLabel, usePlanLock } from "./planAccess.js";
import { Panel, RichIcon, Tile, useNarrow } from "../evolucao/ui.jsx";
import { BillingSection } from "./BillingSection.jsx";
import "./planos.css";

const PLAN_NAME = { trial: "Teste grátis", pro: "Pro", elite: "Elite" };
// ícone ilustrado e cor do azulejo de cada plano (pacote "Novas telas"): Teste grátis = lista de tarefas, Pro = brilho do Tutor, Elite = coroa
const PLAN_ART = { trial: ["hoje", "blue"], pro: ["sparkles", "violet"], elite: ["crown", "gold"] };
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

/** Um item do plano com o ícone certo: microfone para a voz do Tutor, prancheta para a correção de estação, marca para o resto. */
function Item({ text, extra }) {
  const icon = /^Voz do Tutor/.test(text) ? "mic" : /^Correção de estação/.test(text) ? "clipboard-check" : "check";
  return (
    <li className={`pn-item${extra ? " pn-item--extra" : ""}`}>
      <Icon name={icon} size={18} />
      <span>{text}</span>
    </li>
  );
}

function PlanCard({ plan, info, current, row }) {
  const features = Array.isArray(plan.features) ? plan.features : [];
  const extras = planExtras(plan.code, info);
  const description = (plan.description ?? "").trim();
  const empty = !description && features.length === 0 && extras.length === 0;
  const [icon, tone] = PLAN_ART[plan.code] ?? PLAN_ART.trial;
  const Tag = row ? "li" : "article";
  return (
    <Tag className={row ? "pn-row" : "ev-panel pn-card"} data-testid={`plano-${plan.code}`}>
      <Tile tone={tone} size={row ? 44 : 48} radius={14}>
        <RichIcon name={icon} size={row ? 30 : 32} />
      </Tile>
      <div className="pn-body">
        <div className="pn-head">
          <h3 className="pn-name">{plan.name || PLAN_NAME[plan.code]}</h3>
          {current && <Badge tone="pro">Seu plano</Badge>}
        </div>
        {description && <p className="pn-desc">{description}</p>}
        {(features.length > 0 || extras.length > 0) && (
          <ul className="pn-items">
            {features.map((item) => (
              <Item key={item} text={item} />
            ))}
            {extras.map((item) => (
              <Item key={item} text={item} extra />
            ))}
          </ul>
        )}
        {empty && <p className="pn-empty">A equipe ainda vai descrever o que este plano inclui.</p>}
      </div>
    </Tag>
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

  const narrow = useNarrow();
  // cobrança ligada no servidor (013700): a nota "ainda não disponível" sai e entra a seção de assinatura/extras
  const [billingOn, setBillingOn] = React.useState(false);
  const onBilling = React.useCallback((on) => setBillingOn(on), []);
  // nota curta do pacote (G9.7): os mesmos textos do aviso, numa linha com ícone pequeno
  const notice = billingOn ? null : (
    <p className="pn-notice" role="note">
      <Icon name="info" size={16} />
      <span>
        <span>A assinatura pelo app ainda não está disponível</span>. Esta página só mostra o que cada plano inclui. <strong>Ainda não há cobrança nem preço aqui.</strong>
      </span>
    </p>
  );
  const situation = (
    <section className="pn-hero" aria-label="Sua situação">
      <span className="pn-hero__ic" aria-hidden="true">
        <RichIcon name="crown" size={narrow ? 40 : 42} />
      </span>
      <span className="pn-hero__txt">
        <span className="pn-hero__k">Sua situação</span>
        {label ? <span className="pn-hero__h">{label}</span> : <span className="pn-hero__p">Não há plano registrado na sua conta.</span>}
        {lock && (
          <span className="pn-hero__p">
            <b>{lock.title}.</b> {lock.text}
          </span>
        )}
        {hasFullAccess(boot) && <span className="pn-hero__p">Você tem acesso completo ao app, sem precisar de plano.</span>}
      </span>
    </section>
  );
  return (
    <div className="ev ev-stack pn">
      {narrow ? (
        <>
          {situation}
          {notice}
        </>
      ) : (
        <>
          {notice}
          {situation}
        </>
      )}
      {!hasFullAccess(boot) && <BillingSection onEnabled={onBilling} />}
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
            <section className="pn-sec" aria-label="Planos">
              <h2 className="ev-h2">O que cada plano inclui</h2>
              {narrow ? (
                <ul className="ev-panel pn-list">
                  {plans.map((plan) => (
                    <PlanCard key={plan.code} plan={plan} info={info} current={current === plan.code} row />
                  ))}
                </ul>
              ) : (
                <div className="pn-grid">
                  {plans.map((plan) => (
                    <PlanCard key={plan.code} plan={plan} info={info} current={current === plan.code} />
                  ))}
                </div>
              )}
            </section>
          )}
          <p className="pn-note">
            {paidParts} ficam com os planos pagos e com o teste grátis enquanto ele vale. <strong>As questões e os flashcards ficam abertos para todos.</strong>
          </p>
        </>
      )}
      <div>
        <button type="button" className="pn-back" onClick={() => go("perfil")}>
          <Icon name="chevron-left" size={18} />
          Voltar para a conta
        </button>
      </div>
    </div>
  );
}
