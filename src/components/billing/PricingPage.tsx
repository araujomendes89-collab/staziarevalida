import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useEntitlements } from "../../hooks/useEntitlements";
import { useApp } from "../../context/AppContext";
import {
  COMMERCIAL_PLANS,
  CommercialPlanConfig,
  BillingCycle,
  savePurchaseIntent,
  getPurchaseIntent,
  clearPurchaseIntent,
} from "./pricingTypes";
import { PricingHeader, PricingFooter } from "./PricingHeader";
import { BillingCycleToggle } from "./BillingCycleToggle";
import { PricingCard } from "./PricingCard";
import { CheckoutModal } from "./CheckoutModal";
import { CheckoutSuccessModal } from "./CheckoutSuccessModal";
import { PlanCode } from "../../services/entitlementsClient";

interface PricingPageProps {
  initialCycle?: BillingCycle;
  onNavigateHome?: () => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({
  initialCycle = "monthly",
  onNavigateHome,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, firebaseUser, isGuestMode, setActiveTab } = useApp();
  const {
    plan,
    isTrial,
    isExpired,
    trialActive,
    trialUsed,
    trialDaysRemaining,
    refreshEntitlements,
  } = useEntitlements();

  const [billingCycle, setBillingCycle] = useState<BillingCycle>(initialCycle);
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<CommercialPlanConfig | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [successPlanCode, setSuccessPlanCode] = useState<"pro" | "elite">("pro");
  const [isActivatingTrial, setIsActivatingTrial] = useState(false);

  const isAuthenticated = Boolean(firebaseUser && !isGuestMode);

  // Resume purchase intent if user just logged in/signed up and returned to pricing
  useEffect(() => {
    const savedIntent = getPurchaseIntent();
    if (savedIntent && isAuthenticated) {
      setBillingCycle(savedIntent.billingCycle);
      const targetConfig = COMMERCIAL_PLANS.find((p) => p.code === savedIntent.plan);
      if (targetConfig && targetConfig.code !== "trial" && plan !== targetConfig.code) {
        clearPurchaseIntent();
        navigate(`/checkout?plan=${targetConfig.code}&cycle=${savedIntent.billingCycle}`);
      } else {
        clearPurchaseIntent();
      }
    }
  }, [isAuthenticated, plan, navigate]);

  // Handle plan selection
  const handleSelectPlan = async (planCode: "trial" | "pro" | "elite") => {
    // 1. Visitante não-autenticado
    if (!isAuthenticated) {
      savePurchaseIntent(planCode, billingCycle);
      navigate("/login");
      return;
    }

    // 2. TRIAL para usuário autenticado
    if (planCode === "trial") {
      if (trialActive) {
        // Já tem trial ativo: levar para a plataforma
        if (onNavigateHome) {
          onNavigateHome();
        } else {
          setActiveTab("home");
          navigate("/");
        }
        return;
      }

      if (trialUsed || isExpired) {
        // Não pode mais usar trial
        return;
      }

      // Ativar Trial
      setIsActivatingTrial(true);
      try {
        const res = await fetch("/api/entitlements/upgrade-self", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id || firebaseUser?.uid,
            targetPlan: "trial",
          }),
        });
        if (res.ok) {
          await refreshEntitlements();
          if (onNavigateHome) {
            onNavigateHome();
          } else {
            setActiveTab("home");
            navigate("/");
          }
        }
      } catch (e) {
        console.error("Falha ao ativar trial:", e);
      } finally {
        setIsActivatingTrial(false);
      }
      return;
    }

    // 3. PRO ou ELITE: redirecionar para a rota dedicada de checkout (/checkout)
    const planConfig = COMMERCIAL_PLANS.find((p) => p.code === planCode);
    if (!planConfig) return;

    // Se já é o plano atual do usuário, não abre checkout
    if (plan === planCode) return;

    navigate(`/checkout?plan=${planCode}&cycle=${billingCycle}`);
  };

  const handlePaymentSuccess = async () => {
    setIsCheckoutOpen(false);
    if (selectedPlanForCheckout) {
      setSuccessPlanCode(selectedPlanForCheckout.code as "pro" | "elite");
    }
    await refreshEntitlements();
    setIsSuccessOpen(true);
  };

  const handleGoToDashboard = () => {
    setIsSuccessOpen(false);
    if (onNavigateHome) {
      onNavigateHome();
    } else {
      setActiveTab("home");
      navigate("/");
    }
  };

  // Reordenação responsiva conforme exigência:
  // Mobile: PRO primeiro (order-1), depois TRIAL (order-2), depois ELITE (order-3).
  // Desktop: Layout canônico 3 colunas (TRIAL, PRO, ELITE).
  const getCardOrderClass = (code: "trial" | "pro" | "elite"): string => {
    switch (code) {
      case "pro":
        return "order-1 lg:order-2";
      case "trial":
        return "order-2 lg:order-1";
      case "elite":
        return "order-3 lg:order-3";
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] text-slate-800 py-8 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      {/* Background Soft Glows matching clean modern medical UI */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-teal-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-6xl mx-auto relative z-10 flex flex-col items-center">
        {/* Header with StaziaMed Logo and Title */}
        <PricingHeader />

        {/* Billing Cycle Switcher */}
        <BillingCycleToggle
          billingCycle={billingCycle}
          onChange={(cycle) => setBillingCycle(cycle)}
        />

        {/* 3 Pricing Cards Grid */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch pt-4">
          {COMMERCIAL_PLANS.map((planItem) => {
            const orderClass = getCardOrderClass(planItem.code);
            return (
              <div key={planItem.code} className={`flex flex-col ${orderClass}`}>
                <PricingCard
                  plan={planItem}
                  billingCycle={billingCycle}
                  currentPlan={plan as PlanCode}
                  isTrial={isTrial}
                  trialActive={trialActive}
                  trialUsed={trialUsed}
                  isExpired={isExpired}
                  isAuthenticated={isAuthenticated}
                  isLoading={planItem.code === "trial" ? isActivatingTrial : false}
                  onSelectPlan={handleSelectPlan}
                />
              </div>
            );
          })}
        </div>

        {/* Footer with 4 trust badges + closing statement */}
        <PricingFooter />
      </div>

      {/* Checkout Modal */}
      {selectedPlanForCheckout && (
        <CheckoutModal
          isOpen={isCheckoutOpen}
          plan={selectedPlanForCheckout}
          billingCycle={billingCycle}
          userEmail={user.email || firebaseUser?.email || undefined}
          onClose={() => setIsCheckoutOpen(false)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {/* Checkout Success Confirmation Modal */}
      <CheckoutSuccessModal
        isOpen={isSuccessOpen}
        plan={successPlanCode}
        onClose={() => setIsSuccessOpen(false)}
        onGoToDashboard={handleGoToDashboard}
      />
    </div>
  );
};

export default PricingPage;
