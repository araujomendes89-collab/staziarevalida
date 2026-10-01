import { getAdminDb } from "../../firebaseAdmin";
import {
  FeatureCode,
  PlanCode,
  PlanDoc,
  FeatureDoc,
  PlanFeatureDoc,
  SubscriptionDoc,
  UsageTrackingDoc,
  UserFeatureOverrideDoc,
  FeatureAccessDecision,
  UserEntitlementsSummary,
} from "./types";
import { SEED_PLANS, SEED_FEATURES, SEED_PLAN_FEATURES } from "./seeds";

export class EntitlementsService {
  private static db() {
    return getAdminDb();
  }

  /**
   * Inicializa coleções de plans, features e plan_features no Firestore
   * caso ainda não estejam populadas (idempotente).
   */
  static async seedInitialCatalog(): Promise<void> {
    const db = this.db();

    // 1. Plans
    for (const [code, plan] of Object.entries(SEED_PLANS)) {
      const ref = db.collection("plans").doc(code);
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set(plan);
      }
    }

    // 2. Features
    for (const [code, feature] of Object.entries(SEED_FEATURES)) {
      const ref = db.collection("features").doc(code);
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set(feature);
      }
    }

    // 3. Plan Features
    for (const [key, planFeature] of Object.entries(SEED_PLAN_FEATURES)) {
      const ref = db.collection("plan_features").doc(key);
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set(planFeature);
      }
    }
  }

  /**
   * Obtém a assinatura atual do usuário no Firestore.
   * Se não existir assinatura ativa mas o usuário for novo/existente, cria ou retorna o Trial de 7 dias padrão.
   */
  static async getUserSubscription(userId: string): Promise<SubscriptionDoc> {
    const db = this.db();
    const now = new Date();
    const nowIso = now.toISOString();

    // Consultar coleção /subscriptions onde user_id == userId
    const subSnap = await db
      .collection("subscriptions")
      .where("user_id", "==", userId)
      .limit(10)
      .get();

    if (!subSnap.empty) {
      // Ordenar em memória para evitar exigir índice composto no Firestore
      const sortedDocs = subSnap.docs.sort((a, b) => {
        const timeA = new Date(a.data().created_at || 0).getTime();
        const timeB = new Date(b.data().created_at || 0).getTime();
        return timeB - timeA;
      });
      const latestDoc = sortedDocs[0];
      const sub = latestDoc.data() as SubscriptionDoc;
      // Verificar se o trial expirou dinamicamente
      if (sub.status === "trialing" && sub.trial_ends_at) {
        const trialEnds = new Date(sub.trial_ends_at).getTime();
        if (now.getTime() >= trialEnds) {
          sub.status = "expired";
          // Atualiza em background de forma resiliente
          latestDoc.ref.update({ status: "expired", updated_at: nowIso }).catch(() => {});
        }
      } else if (sub.status === "active" && sub.expires_at) {
        const expiresAt = new Date(sub.expires_at).getTime();
        if (now.getTime() >= expiresAt) {
          sub.status = "expired";
          latestDoc.ref.update({ status: "expired", updated_at: nowIso }).catch(() => {});
        }
      }
      return sub;
    }

    // Consultar o perfil do usuário na coleção /users/{userId} para sincronizar datas de trial existentes
    const userDocSnap = await db.collection("users").doc(userId).get();
    const userData = userDocSnap.exists ? userDocSnap.data() : null;

    let startsAt = userData?.trialStartedAt || nowIso;
    let trialEndsAt = userData?.trialEndsAt;

    if (!trialEndsAt) {
      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      trialEndsAt = sevenDaysLater.toISOString();
    }

    const isExpired = now.getTime() >= new Date(trialEndsAt).getTime();
    const initialStatus = isExpired ? "expired" : "trialing";

    // Criar assinatura padrão Trial de 7 dias
    const newSub: SubscriptionDoc = {
      id: `sub_${userId}_${now.getTime()}`,
      user_id: userId,
      plan_id: "trial",
      status: initialStatus,
      billing_cycle: "trial",
      starts_at: startsAt,
      trial_ends_at: trialEndsAt,
      expires_at: trialEndsAt,
      provider: "internal",
      provider_subscription_id: null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    await db.collection("subscriptions").doc(newSub.id).set(newSub);
    return newSub;
  }

  /**
   * Obtém a definição do plano associado à assinatura do usuário
   */
  static async getUserPlan(userId: string): Promise<PlanDoc> {
    const sub = await this.getUserSubscription(userId);
    return SEED_PLANS[sub.plan_id] || SEED_PLANS.trial;
  }

  /**
   * Verifica se o Trial do usuário ainda está ativo (<= 7 dias).
   * Suporta passar diretamente a data ISO (trialEndsAt) ou o userId.
   */
  static async isTrialActive(userOrDate: string): Promise<boolean> {
    if (userOrDate.includes("-") || userOrDate.includes("T")) {
      const trialEnds = new Date(userOrDate).getTime();
      return !isNaN(trialEnds) && Date.now() < trialEnds;
    }
    const sub = await this.getUserSubscription(userOrDate);
    if (sub.plan_id !== "trial") return false;
    if (sub.status !== "trialing") return false;
    if (!sub.trial_ends_at) return false;

    const trialEnds = new Date(sub.trial_ends_at).getTime();
    return Date.now() < trialEnds;
  }

  /**
   * Retorna os dias restantes do Trial (0 se expirado).
   * Suporta passar diretamente a data ISO (trialEndsAt) ou o userId.
   */
  static async getTrialDaysRemaining(userOrDate: string): Promise<number> {
    if (userOrDate.includes("-") || userOrDate.includes("T")) {
      const trialEnds = new Date(userOrDate).getTime();
      if (isNaN(trialEnds)) return 0;
      const diffMs = trialEnds - Date.now();
      if (diffMs <= 0) return 0;
      return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }
    const sub = await this.getUserSubscription(userOrDate);
    if (sub.plan_id !== "trial" || !sub.trial_ends_at) return 0;

    const trialEnds = new Date(sub.trial_ends_at).getTime();
    const diffMs = trialEnds - Date.now();
    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Retorna os overrides individuais configurados para o usuário
   */
  static async getUserOverrides(userId: string): Promise<Record<FeatureCode, UserFeatureOverrideDoc>> {
    const db = this.db();
    const now = Date.now();
    const overridesSnap = await db
      .collection("user_feature_overrides")
      .where("user_id", "==", userId)
      .get();

    const result: Partial<Record<FeatureCode, UserFeatureOverrideDoc>> = {};

    for (const doc of overridesSnap.docs) {
      const data = doc.data() as UserFeatureOverrideDoc;
      if (data.expires_at) {
        const exp = new Date(data.expires_at).getTime();
        if (now >= exp) continue; // Expirado
      }
      result[data.feature_id] = data;
    }

    return result as Record<FeatureCode, UserFeatureOverrideDoc>;
  }

  /**
   * Retorna o período de contabilização do consumo
   * Para Trial: "global_trial"
   * Para PRO e Elite: "YYYY-MM"
   */
  private static resolvePeriod(planCode: PlanCode): string {
    if (planCode === "trial") {
      return "global_trial";
    }
    const d = new Date();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${d.getUTCFullYear()}-${month}`;
  }

  /**
   * Obtém a quantidade consumida de uma feature pelo usuário
   */
  static async getFeatureUsage(userId: string, featureCode: FeatureCode): Promise<number> {
    const db = this.db();
    const sub = await this.getUserSubscription(userId);
    const period = this.resolvePeriod(sub.plan_id);
    const trackingId = `${userId}_${featureCode}_${period}`;

    const snap = await db.collection("usage_tracking").doc(trackingId).get();
    if (!snap.exists) return 0;
    const data = snap.data() as UsageTrackingDoc;
    return data.usage_count || 0;
  }

  /**
   * Obtém o limite configurado para uma feature para o usuário (considerando overrides)
   */
  static async getFeatureLimit(userId: string, featureCode: FeatureCode): Promise<number | null> {
    const overrides = await this.getUserOverrides(userId);
    if (overrides[featureCode] && overrides[featureCode].limit_value !== undefined) {
      return overrides[featureCode].limit_value;
    }

    const sub = await this.getUserSubscription(userId);
    const planFeatureKey = `${sub.plan_id}:${featureCode}`;
    const pf = SEED_PLAN_FEATURES[planFeatureKey];
    return pf ? pf.limit_value : null;
  }

  /**
   * Verifica se o usuário atingiu o limite de uso de uma feature
   */
  static async checkUsageLimit(
    userId: string,
    featureCode: FeatureCode
  ): Promise<{ exceeded: boolean; limit: number | null; current: number }> {
    const limit = await this.getFeatureLimit(userId, featureCode);
    const current = await this.getFeatureUsage(userId, featureCode);

    if (limit === null) {
      return { exceeded: false, limit: null, current };
    }

    return {
      exceeded: current >= limit,
      limit,
      current,
    };
  }

  /**
   * Consome uma quantidade de uso de uma feature (ex: 1 questão ou 1 consulta IA).
   * Lança erro se o limite for ultrapassado.
   */
  static async consumeUsage(
    userId: string,
    featureCode: FeatureCode,
    amount = 1
  ): Promise<{ success: boolean; newCount: number; limit: number | null }> {
    const access = await this.canAccess(userId, featureCode);
    if (!access.allowed) {
      throw new Error(access.reason || "FEATURE_NOT_AVAILABLE");
    }

    const limit = await this.getFeatureLimit(userId, featureCode);
    const db = this.db();
    const sub = await this.getUserSubscription(userId);
    const period = this.resolvePeriod(sub.plan_id);
    const trackingId = `${userId}_${featureCode}_${period}`;
    const ref = db.collection("usage_tracking").doc(trackingId);

    const nowIso = new Date().toISOString();

    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const current = snap.exists ? (snap.data() as UsageTrackingDoc).usage_count || 0 : 0;
      const nextCount = current + amount;

      if (limit !== null && nextCount > limit) {
        throw new Error("FEATURE_LIMIT_EXCEEDED");
      }

      if (snap.exists) {
        transaction.update(ref, {
          usage_count: nextCount,
          updated_at: nowIso,
        });
      } else {
        const newUsage: UsageTrackingDoc = {
          id: trackingId,
          user_id: userId,
          feature_id: featureCode,
          subscription_id: sub.id,
          period,
          usage_count: nextCount,
          created_at: nowIso,
          updated_at: nowIso,
        };
        transaction.set(ref, newUsage);
      }

      return nextCount;
    });

    return {
      success: true,
      newCount: result,
      limit,
    };
  }

  /**
   * Função central de avaliação de acesso:
   * 1. Autenticação & usuário
   * 2. Assinatura ativa ou Trial válido
   * 3. Override individual
   * 4. Recurso disponível no plano
   * 5. Limite de uso
   */
  static async canAccess(
    userId: string,
    featureCode: FeatureCode,
    userEmail?: string
  ): Promise<FeatureAccessDecision> {
    // 0. Master Admin Bypass: araujomendes@staziamed.com.br ou UID mestre tem acesso irrestrito
    const MASTER_UID = "cQjACVALpedbijS0WiCwuFRJgxj2";
    const MASTER_EMAIL = "araujomendes@staziamed.com.br";
    if (
      userId === MASTER_UID ||
      userEmail?.toLowerCase().trim() === MASTER_EMAIL
    ) {
      return { allowed: true };
    }

    if (!userId || userId === "guest" || userId === "usr-default") {
      return {
        allowed: false,
        reason: "FEATURE_NOT_AVAILABLE",
        requiredPlan: "trial",
      };
    }

    // 1. Assinatura do usuário
    const sub = await this.getUserSubscription(userId);

    // Se o Trial expirou
    if (sub.status === "expired") {
      return {
        allowed: false,
        reason: "TRIAL_EXPIRED",
        requiredPlan: "pro",
      };
    }

    // 2. Verificar Override Individual do Administrador
    const overrides = await this.getUserOverrides(userId);
    const userOverride = overrides[featureCode];

    if (userOverride) {
      if (!userOverride.enabled) {
        return {
          allowed: false,
          reason: "FEATURE_NOT_AVAILABLE",
          requiredPlan: "elite",
        };
      }
      // Se tiver limite no override, checa consumo
      if (userOverride.limit_value !== null) {
        const usage = await this.getFeatureUsage(userId, featureCode);
        if (usage >= userOverride.limit_value) {
          return {
            allowed: false,
            reason: "FEATURE_LIMIT_EXCEEDED",
            limit: userOverride.limit_value,
            used: usage,
            remaining: 0,
          };
        }
        return {
          allowed: true,
          limit: userOverride.limit_value,
          used: usage,
          remaining: Math.max(0, userOverride.limit_value - usage),
        };
      }
      return { allowed: true };
    }

    // 3. Matriz do Plano
    const planKey = `${sub.plan_id}:${featureCode}`;
    const pf = SEED_PLAN_FEATURES[planKey];

    if (!pf || !pf.enabled) {
      // Determina qual o plano mínimo necessário para liberar
      const requiredPlan: PlanCode =
        SEED_PLAN_FEATURES[`pro:${featureCode}`]?.enabled
          ? "pro"
          : "elite";

      return {
        allowed: false,
        reason: "FEATURE_NOT_AVAILABLE",
        requiredPlan,
      };
    }

    // 4. Verificação de Limite de Uso
    if (pf.limit_value !== null) {
      const usage = await this.getFeatureUsage(userId, featureCode);
      if (usage >= pf.limit_value) {
        return {
          allowed: false,
          reason: "FEATURE_LIMIT_EXCEEDED",
          limit: pf.limit_value,
          used: usage,
          remaining: 0,
        };
      }
      return {
        allowed: true,
        limit: pf.limit_value,
        used: usage,
        remaining: Math.max(0, pf.limit_value - usage),
      };
    }

    return { allowed: true };
  }

  /**
   * Lança exceção tratada se o acesso for negado (Fail-Closed)
   */
  static async requireFeature(userId: string, featureCode: FeatureCode): Promise<void> {
    const decision = await this.canAccess(userId, featureCode);
    if (!decision.allowed) {
      const err: any = new Error(decision.reason || "FEATURE_NOT_AVAILABLE");
      err.code = decision.reason || "FEATURE_NOT_AVAILABLE";
      err.feature = featureCode;
      err.requiredPlan = decision.requiredPlan;
      err.limit = decision.limit;
      err.used = decision.used;
      throw err;
    }
  }

  /**
   * Resumo completo de entitlements para o frontend
   */
  static async getUserEntitlements(userId: string): Promise<UserEntitlementsSummary> {
    const sub = await this.getUserSubscription(userId);
    const plan = SEED_PLANS[sub.plan_id] || SEED_PLANS.trial;
    const isTrial = sub.plan_id === "trial" && sub.status === "trialing";
    const isExpired = sub.status === "expired";
    const trialDaysRemaining = isTrial ? await this.getTrialDaysRemaining(userId) : 0;

    const featuresSummary: Partial<UserEntitlementsSummary["features"]> = {};

    for (const [codeStr] of Object.entries(SEED_FEATURES)) {
      const code = codeStr as FeatureCode;
      const decision = await this.canAccess(userId, code);
      featuresSummary[code] = {
        enabled: decision.allowed,
        requiredPlan: decision.requiredPlan,
        limit: decision.limit,
        used: decision.used || 0,
        remaining: decision.remaining,
      };
    }

    return {
      userId,
      plan: sub.plan_id,
      planName: plan.name,
      status: sub.status,
      isTrial,
      isExpired,
      trialDaysRemaining,
      startsAt: sub.starts_at,
      expiresAt: sub.expires_at,
      features: featuresSummary as UserEntitlementsSummary["features"],
    };
  }

  /**
   * Atualiza a assinatura do usuário (Upgrade para PRO ou Elite ou Downgrade)
   */
  static async upgradeSubscription(
    userId: string,
    newPlan: "pro" | "elite",
    provider = "internal",
    providerSubId?: string
  ): Promise<SubscriptionDoc> {
    const db = this.db();
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 dias

    // Localizar assinatura atual
    const existingSnap = await db
      .collection("subscriptions")
      .where("user_id", "==", userId)
      .limit(1)
      .get();

    let subDoc: SubscriptionDoc;

    if (!existingSnap.empty) {
      const docRef = existingSnap.docs[0].ref;
      const current = existingSnap.docs[0].data() as SubscriptionDoc;

      subDoc = {
        ...current,
        plan_id: newPlan,
        status: "active",
        billing_cycle: "monthly",
        starts_at: nowIso,
        expires_at: expiresAt,
        provider,
        provider_subscription_id: providerSubId || current.provider_subscription_id,
        updated_at: nowIso,
      };

      await docRef.set(subDoc, { merge: true });
    } else {
      subDoc = {
        id: `sub_${userId}_${now.getTime()}`,
        user_id: userId,
        plan_id: newPlan,
        status: "active",
        billing_cycle: "monthly",
        starts_at: nowIso,
        expires_at: expiresAt,
        trial_ends_at: null,
        provider,
        provider_subscription_id: providerSubId || null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      await db.collection("subscriptions").doc(subDoc.id).set(subDoc);
    }

    // Sincronizar o documento /users/{userId}
    await db.collection("users").doc(userId).set(
      {
        plan: newPlan,
        tier: newPlan.toUpperCase(),
        subscriptionExpiresAt: expiresAt,
        planUpdatedAt: nowIso,
      },
      { merge: true }
    );

    return subDoc;
  }
}
