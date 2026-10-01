export type BillingCycle = "monthly" | "annual";

export interface PlanFeatureItem {
  text: string;
  included: boolean;
  highlight?: boolean;
}

export interface CommercialPlanConfig {
  code: "trial" | "pro" | "elite";
  name: string;
  badge?: string;
  badgeVariant?: "trial" | "pro" | "elite";
  tagline: string;
  monthlyPrice: number;
  monthlyPriceFormatted: string;
  annualTotal: number;
  annualTotalFormatted: string;
  annualMonthlyEquivalentFormatted: string;
  pricePeriodText: string;
  features: string[];
  ctaText: string;
  footerNote: string;
  popular?: boolean;
  theme: "light" | "featured" | "dark";
}

export const COMMERCIAL_PLANS: CommercialPlanConfig[] = [
  {
    code: "trial",
    name: "TRIAL",
    badge: "7 dias grátis",
    badgeVariant: "trial",
    tagline: "DÊ O PRIMEIRO PASSO HOJE",
    monthlyPrice: 0,
    monthlyPriceFormatted: "R$ 0",
    annualTotal: 0,
    annualTotalFormatted: "R$ 0",
    annualMonthlyEquivalentFormatted: "R$ 0",
    pricePeriodText: "Teste gratuito por 7 dias",
    features: [
      "Até 100 questões",
      "1 prova completa demonstrativa",
      "Comentários das questões",
      "Filtros básicos",
      "Favoritos e estatísticas básicas",
      "20 flashcards",
      "10 interações com IA",
      "Diagnóstico inicial",
    ],
    ctaText: "Começar grátis",
    footerNote: "Perfeito para conhecer a plataforma",
    popular: false,
    theme: "light",
  },
  {
    code: "pro",
    name: "PRO",
    badge: "MAIS ESCOLHIDO",
    badgeVariant: "pro",
    tagline: "ESTUDO INTELIGENTE RESULTADOS REAIS",
    monthlyPrice: 99.9,
    monthlyPriceFormatted: "R$ 99,90",
    annualTotal: 897,
    annualTotalFormatted: "R$ 897/ano",
    annualMonthlyEquivalentFormatted: "R$ 74,75",
    pricePeriodText: "ou R$ 897/ano",
    features: [
      "Banco completo de questões",
      "Revalida + ENAMED",
      "Questões inéditas Stazia",
      "Estatísticas avançadas",
      "Caderno de erros inteligente",
      "Cronograma inteligente",
      "Revisão espaçada",
      "Flashcards completos",
      "IA para explicar e revisar questões",
      "Mapa de fraquezas",
      "DNA Revalida/ENAMED",
      "Grupo exclusivo PRO",
    ],
    ctaText: "Assinar PRO",
    footerNote: "Ideal para a maior parte dos alunos",
    popular: true,
    theme: "featured",
  },
  {
    code: "elite",
    name: "ELITE",
    badge: "Premium",
    badgeVariant: "elite",
    tagline: "MÁXIMO POTENCIAL ATÉ A APROVAÇÃO",
    monthlyPrice: 179.9,
    monthlyPriceFormatted: "R$ 179,90",
    annualTotal: 1497,
    annualTotalFormatted: "R$ 1.497/ano",
    annualMonthlyEquivalentFormatted: "R$ 124,75",
    pricePeriodText: "ou R$ 1.497/ano",
    features: [
      "Tudo do PRO",
      "Stazia AI Coach",
      "Modo Pareto",
      "Plano diário adaptativo",
      "Simulados adaptativos",
      "Radar de preparação",
      "Priorização automática de temas",
      "Revisão personalizada de reta final",
      "Maior limite de IA",
      "Grupo VIP Elite",
      "Early access a novos recursos",
    ],
    ctaText: "Assinar Elite",
    footerNote: "Seu copiloto até a prova",
    popular: false,
    theme: "dark",
  },
];

export const PURCHASE_INTENT_KEY = "staziamed_purchase_intent";

export interface PurchaseIntent {
  plan: "trial" | "pro" | "elite";
  billingCycle: BillingCycle;
  timestamp: number;
}

export function savePurchaseIntent(plan: "trial" | "pro" | "elite", billingCycle: BillingCycle) {
  try {
    const intent: PurchaseIntent = {
      plan,
      billingCycle,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(PURCHASE_INTENT_KEY, JSON.stringify(intent));
    localStorage.setItem(PURCHASE_INTENT_KEY, JSON.stringify(intent));
  } catch (e) {
    console.warn("Could not persist purchase intent:", e);
  }
}

export function getPurchaseIntent(): PurchaseIntent | null {
  try {
    const raw = sessionStorage.getItem(PURCHASE_INTENT_KEY) || localStorage.getItem(PURCHASE_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PurchaseIntent;
    // Expira após 2 horas
    if (Date.now() - parsed.timestamp > 2 * 60 * 60 * 1000) {
      clearPurchaseIntent();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPurchaseIntent() {
  try {
    sessionStorage.removeItem(PURCHASE_INTENT_KEY);
    localStorage.removeItem(PURCHASE_INTENT_KEY);
  } catch {}
}
