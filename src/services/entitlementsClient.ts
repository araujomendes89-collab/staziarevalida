import { auth } from "../lib/firebase";
import {
  FeatureCode,
  PlanCode,
  SubscriptionStatus,
  UserEntitlementsSummary,
} from "../../server/services/entitlements/types";

export type { FeatureCode, PlanCode, SubscriptionStatus, UserEntitlementsSummary };

class EntitlementsClientService {
  private cache: UserEntitlementsSummary | null = null;
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minuto de cache local
  private fetchPromise: Promise<UserEntitlementsSummary | null> | null = null;

  private async getAuthToken(): Promise<string | null> {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    return currentUser.getIdToken();
  }

  /**
   * Obtém os entitlements completos do usuário conectado via backend
   */
  async getMyEntitlements(forceRefresh = false): Promise<UserEntitlementsSummary | null> {
    const now = Date.now();
    if (!forceRefresh && this.cache && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      return this.cache;
    }

    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = (async () => {
      try {
        const token = await this.getAuthToken();
        if (!token) {
          return null;
        }

        const res = await fetch("/api/entitlements/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          console.warn("[EntitlementsClient] Failed to fetch entitlements:", res.status);
          return null;
        }

        const data = await res.json();
        if (data.success && data.entitlements) {
          this.cache = data.entitlements;
          this.lastFetchTime = Date.now();
          return this.cache;
        }
        return null;
      } catch (err) {
        console.error("[EntitlementsClient] Error fetching entitlements:", err);
        return null;
      } finally {
        this.fetchPromise = null;
      }
    })();

    return this.fetchPromise;
  }

  /**
   * Checa se o usuário atual pode usar um recurso
   */
  async canUse(feature: FeatureCode): Promise<{ allowed: boolean; requiredPlan?: PlanCode; limit?: number | null; used?: number }> {
    const entitlements = await this.getMyEntitlements();
    if (!entitlements) {
      // Fallback seguro se offline/sem conexão
      return { allowed: false, requiredPlan: "trial" };
    }

    const feat = entitlements.features[feature];
    if (!feat) {
      return { allowed: false, requiredPlan: "pro" };
    }

    return {
      allowed: feat.enabled,
      requiredPlan: feat.requiredPlan,
      limit: feat.limit,
      used: feat.used,
    };
  }

  /**
   * Consome uso de uma feature no backend de forma atômica
   */
  async consume(feature: FeatureCode, amount = 1): Promise<{ success: boolean; newCount?: number; limit?: number | null }> {
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error("Usuário não autenticado.");
    }

    const res = await fetch("/api/entitlements/consume", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ feature, amount }),
    });

    const data = await res.json();
    if (!res.ok) {
      const errorMsg = data.message || data.error || "Erro ao registrar uso.";
      throw new Error(errorMsg);
    }

    // Invalida cache local para atualizar contadores
    this.invalidateCache();
    return {
      success: true,
      newCount: data.newCount,
      limit: data.limit,
    };
  }

  /**
   * Dispara upgrade da assinatura
   */
  async upgradePlan(plan: "pro" | "elite"): Promise<boolean> {
    const token = await this.getAuthToken();
    if (!token) return false;

    const res = await fetch("/api/entitlements/upgrade-self", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan }),
    });

    if (res.ok) {
      this.invalidateCache();
      return true;
    }
    return false;
  }

  /**
   * Obtém os planos disponíveis da API ou fallback de seeds
   */
  async getAvailablePlans(): Promise<any[]> {
    try {
      const res = await fetch("/api/entitlements/plans");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.plans)) {
          return data.plans;
        }
      }
    } catch (e) {
      console.warn("[EntitlementsClient] Failed to load available plans from backend:", e);
    }
    return [
      {
        id: "plan_trial",
        code: "trial",
        name: "Stazia Trial (7 Dias)",
        price_monthly: 0,
        price_yearly: 0,
      },
      {
        id: "plan_pro",
        code: "pro",
        name: "Stazia PRO",
        price_monthly: 99.9,
        price_yearly: 897,
      },
      {
        id: "plan_elite",
        code: "elite",
        name: "Stazia ELITE",
        price_monthly: 179.9,
        price_yearly: 1497,
      },
    ];
  }

  invalidateCache() {
    this.cache = null;
    this.lastFetchTime = 0;
  }
}

export const EntitlementsClient = new EntitlementsClientService();
