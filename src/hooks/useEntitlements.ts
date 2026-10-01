import { useState, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import {
  EntitlementsClient,
  FeatureCode,
  PlanCode,
  SubscriptionStatus,
  UserEntitlementsSummary,
} from "../services/entitlementsClient";

export interface UseEntitlementsReturn {
  entitlements: UserEntitlementsSummary | null;
  loading: boolean;
  error: Error | null;
  plan: PlanCode;
  subscriptionStatus: SubscriptionStatus;
  isTrial: boolean;
  isExpired: boolean;
  trialActive: boolean;
  trialUsed: boolean;
  trialDaysRemaining: number;
  canUse: (feature: FeatureCode) => boolean;
  getFeatureDetails: (feature: FeatureCode) => {
    enabled: boolean;
    requiredPlan?: PlanCode;
    limit?: number | null;
    used: number;
    remaining?: number | null;
  };
  consume: (feature: FeatureCode, amount?: number) => Promise<boolean>;
  upgradePlan: (plan: "pro" | "elite") => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useEntitlements(): UseEntitlementsReturn {
  const { firebaseUser, user } = useApp();
  const [entitlements, setEntitlements] = useState<UserEntitlementsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEntitlements = useCallback(async (force = false) => {
    if (!firebaseUser) {
      setEntitlements(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await EntitlementsClient.getMyEntitlements(force);
      setEntitlements(data);
    } catch (err: any) {
      console.warn("[useEntitlements] Error fetching:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    fetchEntitlements();
  }, [fetchEntitlements]);

  // Master Admin bypass: se for o usuário araujomendes ou ADMIN, tem permissão total
  const isMasterAdmin =
    (firebaseUser?.email || "").trim().toLowerCase() === "araujomendes@staziamed.com.br" ||
    firebaseUser?.uid === "cQjACVALpedbijS0WiCwuFRJgxj2" ||
    user?.role === "ADMIN";

  const plan: PlanCode = isMasterAdmin
    ? "elite"
    : entitlements?.plan || ((user?.plan as string) === "elite" ? "elite" : (user?.plan as string) === "pro" ? "pro" : "trial");

  const subscriptionStatus: SubscriptionStatus = isMasterAdmin
    ? "active"
    : entitlements?.status || (user?.tier === "EXPIRED" ? "expired" : "trialing");

  const isTrial = plan === "trial" && subscriptionStatus === "trialing";
  const isExpired = subscriptionStatus === "expired";
  const trialDaysRemaining = entitlements?.trialDaysRemaining ?? 0;
  const trialActive = isTrial && !isExpired && trialDaysRemaining > 0;
  const trialUsed = isExpired || plan === "pro" || plan === "elite" || (user?.trialStartedAt ? true : false);

  const canUse = useCallback(
    (feature: FeatureCode): boolean => {
      if (isMasterAdmin) return true;
      if (!entitlements) {
        // Fallback temporário sincronizado com o userProfile enquanto carrega
        if (isExpired) return false;
        if (plan === "elite") return true;
        if (plan === "pro") {
          return !["ai_coach", "pareto_mode", "daily_adaptive_plan", "adaptive_simulations", "adaptive_schedule", "vip_group"].includes(feature);
        }
        // Trial básico
        return ["official_questions", "question_comments", "favorites", "error_notebook", "basic_stats", "flashcards", "great_topics", "original_questions", "ai_explanations", "weakness_map"].includes(feature);
      }
      return entitlements.features[feature]?.enabled ?? false;
    },
    [isMasterAdmin, entitlements, isExpired, plan]
  );

  const getFeatureDetails = useCallback(
    (feature: FeatureCode) => {
      if (entitlements?.features?.[feature]) {
        return entitlements.features[feature];
      }
      return {
        enabled: canUse(feature),
        requiredPlan: "pro" as PlanCode,
        limit: null,
        used: 0,
        remaining: null,
      };
    },
    [entitlements, canUse]
  );

  const consume = useCallback(
    async (feature: FeatureCode, amount = 1): Promise<boolean> => {
      if (isMasterAdmin) return true;
      try {
        await EntitlementsClient.consume(feature, amount);
        await fetchEntitlements(true);
        return true;
      } catch (err) {
        console.warn(`[useEntitlements] Could not consume ${feature}:`, err);
        return false;
      }
    },
    [isMasterAdmin, fetchEntitlements]
  );

  const upgradePlan = useCallback(
    async (targetPlan: "pro" | "elite"): Promise<boolean> => {
      const ok = await EntitlementsClient.upgradePlan(targetPlan);
      if (ok) {
        await fetchEntitlements(true);
      }
      return ok;
    },
    [fetchEntitlements]
  );

  return {
    entitlements,
    loading,
    error,
    plan,
    subscriptionStatus,
    isTrial,
    isExpired,
    trialActive,
    trialUsed,
    trialDaysRemaining,
    canUse,
    getFeatureDetails,
    consume,
    upgradePlan,
    refresh: () => fetchEntitlements(true),
  };
}
