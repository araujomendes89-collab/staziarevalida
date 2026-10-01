import { getAdminDb } from "../../firebaseAdmin";
import { SEED_PLANS } from "../entitlements/seeds";
import { EntitlementsService } from "../entitlements/entitlementsService";
import {
  PaymentDoc,
  PaymentStatus,
  PaymentAuditEvent,
  PaymentAuditLogDoc,
  WebhookEventRecord,
} from "./types";
import { SubscriptionDoc } from "../entitlements/types";

export class BillingService {
  private static db() {
    return getAdminDb();
  }

  /**
   * Registra log de auditoria imutável para eventos de faturamento e pagamentos
   */
  static async logAudit(
    userId: string,
    event: PaymentAuditEvent,
    paymentId?: string | null,
    subscriptionId?: string | null,
    details?: Record<string, any>
  ): Promise<void> {
    try {
      const db = this.db();
      const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const logDoc: PaymentAuditLogDoc = {
        id,
        user_id: userId,
        payment_id: paymentId || null,
        subscription_id: subscriptionId || null,
        event,
        timestamp: new Date().toISOString(),
        details,
      };
      await db.collection("payment_audit_logs").doc(id).set(logDoc);
    } catch (e) {
      console.error("[BillingService] Audit log error:", e);
    }
  }

  /**
   * Cria uma sessão/ordem de checkout para o usuário.
   * Regra 1: O backend obtém o preço oficial canônico.
   * Regra 2: Cria o payment e a assinatura temporária com status 'pending' (NÃO ativa recursos).
   * Regra 3: Impede contratação duplicada se o plano já estiver ativo.
   */
  static async createCheckout(params: {
    userId: string;
    userEmail?: string;
    plan: "pro" | "elite";
    billingCycle: "monthly" | "annual";
    originUrl?: string;
  }): Promise<{
    paymentId: string;
    checkoutUrl: string;
    amount: number;
    plan: "pro" | "elite";
    billingCycle: "monthly" | "yearly";
  }> {
    const db = this.db();
    const { userId, userEmail, plan, billingCycle, originUrl } = params;

    // 1. Validar plano e obter preço oficial canônico
    const planConfig = SEED_PLANS[plan];
    if (!planConfig) {
      throw new Error(`Plano inválido: ${plan}`);
    }

    const canonicalCycle = billingCycle === "annual" ? "yearly" : "monthly";
    const amount = canonicalCycle === "yearly" ? planConfig.price_yearly : planConfig.price_monthly;

    // 2. Verificar assinatura atual para impedir duplicidade ou downgrade inválido
    const currentSub = await EntitlementsService.getUserSubscription(userId);
    if (currentSub.status === "active") {
      if (currentSub.plan_id === plan) {
        throw new Error("Você já possui uma assinatura ativa deste plano.");
      }
      if (currentSub.plan_id === "elite" && plan === "pro") {
        throw new Error("Você já possui o plano Elite (máximo nível).");
      }
    }

    // 3. Criar registro de Payment no Firestore com status 'pending'
    const now = new Date();
    const nowIso = now.toISOString();
    const paymentId = `pay_${now.getTime()}_${Math.random().toString(36).substring(2, 7)}`;

    const baseUrl = originUrl || process.env.APP_BASE_URL || "http://localhost:5173";
    const successUrl = `${baseUrl}/pagamento/processando?payment_id=${paymentId}`;
    const cancelUrl = `${baseUrl}/pagamento/erro?payment_id=${paymentId}`;

    // Mock/Sandbox ou Gateway URL configurada
    const checkoutUrl = `${baseUrl}/checkout/gateway-simulator?payment_id=${paymentId}`;

    const paymentDoc: PaymentDoc = {
      id: paymentId,
      user_id: userId,
      user_email: userEmail,
      plan_id: plan,
      billing_cycle: canonicalCycle,
      provider: "mock_sandbox",
      amount,
      currency: "BRL",
      status: "pending",
      checkout_url: checkoutUrl,
      success_url: successUrl,
      cancel_url: cancelUrl,
      created_at: nowIso,
      updated_at: nowIso,
    };

    await db.collection("payments").doc(paymentId).set(paymentDoc);

    // 4. Log de auditoria
    await this.logAudit(userId, "checkout_created", paymentId, null, {
      plan,
      billingCycle: canonicalCycle,
      amount,
    });

    return {
      paymentId,
      checkoutUrl,
      amount,
      plan,
      billingCycle: canonicalCycle,
    };
  }

  /**
   * Obtém o status do pagamento pelo ID
   */
  static async getPaymentStatus(paymentId: string, userId?: string): Promise<PaymentDoc | null> {
    const db = this.db();
    const docSnap = await db.collection("payments").doc(paymentId).get();
    if (!docSnap.exists) return null;

    const data = docSnap.data() as PaymentDoc;
    if (userId && data.user_id !== userId) {
      throw new Error("Acesso não autorizado a este pagamento.");
    }
    return data;
  }

  /**
   * Processa a confirmação real do pagamento recebida do gateway.
   * Valida idempotência, atualiza status do payment, calcula vigência e ativa a assinatura.
   */
  static async processPaymentSuccess(params: {
    paymentId?: string;
    userId?: string;
    userEmail?: string;
    plan: "pro" | "elite";
    billingCycle?: "monthly" | "yearly";
    amountPaid?: number;
    provider?: string;
    providerEventId?: string;
    providerPaymentId?: string;
    providerSubscriptionId?: string;
  }): Promise<{ success: boolean; subscription: SubscriptionDoc; payment: PaymentDoc }> {
    const db = this.db();
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Idempotência: verificar se este evento já foi processado
    if (params.providerEventId) {
      const eventRef = db.collection("webhook_events").doc(params.providerEventId);
      const eventSnap = await eventRef.get();
      if (eventSnap.exists) {
        const existingData = eventSnap.data() as WebhookEventRecord;
        if (existingData.status === "PROCESSED") {
          console.log(`[BillingService] Idempotency: Event ${params.providerEventId} already processed.`);
          // Retorna estado atual sem reprocessar
          const payment = params.paymentId ? (await this.getPaymentStatus(params.paymentId)) : null;
          const targetUser = params.userId || payment?.user_id;
          const sub = targetUser ? await EntitlementsService.getUserSubscription(targetUser) : null;
          return { success: true, subscription: sub!, payment: payment! };
        }
      }
    }

    // 2. Localizar PaymentDoc
    let paymentDoc: PaymentDoc | null = null;
    let targetUserId = params.userId;

    if (params.paymentId) {
      paymentDoc = await this.getPaymentStatus(params.paymentId);
      if (paymentDoc) {
        targetUserId = paymentDoc.user_id;
      }
    }

    // Se ainda não temos o userId, tentar buscar pelo email
    if (!targetUserId && params.userEmail) {
      const userSnap = await db.collection("users").where("email", "==", params.userEmail.toLowerCase().trim()).limit(1).get();
      if (!userSnap.empty) {
        targetUserId = userSnap.docs[0].id;
      }
    }

    if (!targetUserId) {
      throw new Error("Não foi possível identificar o usuário para ativação da assinatura.");
    }

    // 3. Validar valor e moeda canônica
    const cycle = params.billingCycle || paymentDoc?.billing_cycle || "monthly";
    const planConfig = SEED_PLANS[params.plan];
    const expectedAmount = cycle === "yearly" ? planConfig.price_yearly : planConfig.price_monthly;

    if (params.amountPaid !== undefined && params.amountPaid > 0) {
      // Se houver discrepância de valor, rejeitar
      if (Math.abs(params.amountPaid - expectedAmount) > 0.1) {
        await this.logAudit(targetUserId, "webhook_rejected", paymentDoc?.id, null, {
          reason: "AMOUNT_MISMATCH",
          expected: expectedAmount,
          received: params.amountPaid,
        });
        throw new Error(`Discrepância de valor: esperado ${expectedAmount}, recebido ${params.amountPaid}`);
      }
    }

    // 4. Calcular vigência exata conforme o ciclo contratado
    // Mensal: 30 dias; Anual: 365 dias
    const durationDays = cycle === "yearly" ? 365 : 30;
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    // 5. Atualizar ou criar registro de pagamento como 'paid'
    if (!paymentDoc) {
      const id = params.paymentId || `pay_${now.getTime()}_${Math.random().toString(36).substring(2, 7)}`;
      paymentDoc = {
        id,
        user_id: targetUserId,
        plan_id: params.plan,
        billing_cycle: cycle,
        provider: params.provider || "gateway",
        provider_payment_id: params.providerPaymentId || null,
        amount: expectedAmount,
        currency: "BRL",
        status: "paid",
        success_url: "",
        cancel_url: "",
        created_at: nowIso,
        updated_at: nowIso,
        paid_at: nowIso,
      };
    } else {
      paymentDoc.status = "paid";
      paymentDoc.paid_at = nowIso;
      paymentDoc.updated_at = nowIso;
      if (params.providerPaymentId) {
        paymentDoc.provider_payment_id = params.providerPaymentId;
      }
    }
    await db.collection("payments").doc(paymentDoc.id).set(paymentDoc, { merge: true });

    // 6. Atualizar a assinatura no Firestore
    const subSnap = await db.collection("subscriptions").where("user_id", "==", targetUserId).limit(1).get();
    let subDoc: SubscriptionDoc;
    const isUpgrade = subSnap.docs[0]?.data()?.plan_id === "pro" && params.plan === "elite";

    if (!subSnap.empty) {
      const current = subSnap.docs[0].data() as SubscriptionDoc;
      subDoc = {
        ...current,
        plan_id: params.plan,
        status: "active",
        billing_cycle: cycle,
        starts_at: nowIso,
        expires_at: expiresAt,
        trial_ends_at: null,
        provider: params.provider || current.provider || "gateway",
        provider_subscription_id: params.providerSubscriptionId || current.provider_subscription_id,
        updated_at: nowIso,
      };
      await subSnap.docs[0].ref.set(subDoc, { merge: true });
    } else {
      subDoc = {
        id: `sub_${targetUserId}_${now.getTime()}`,
        user_id: targetUserId,
        plan_id: params.plan,
        status: "active",
        billing_cycle: cycle,
        starts_at: nowIso,
        expires_at: expiresAt,
        trial_ends_at: null,
        provider: params.provider || "gateway",
        provider_subscription_id: params.providerSubscriptionId || null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      await db.collection("subscriptions").doc(subDoc.id).set(subDoc);
    }

    // 7. Sincronizar /users/{userId}
    await db.collection("users").doc(targetUserId).set(
      {
        plan: params.plan,
        tier: params.plan.toUpperCase(),
        subscriptionExpiresAt: expiresAt,
        planUpdatedAt: nowIso,
      },
      { merge: true }
    );

    // 8. Marcar evento como processado na coleção de idempotência
    if (params.providerEventId) {
      await db.collection("webhook_events").doc(params.providerEventId).set({
        id: params.providerEventId,
        provider: params.provider || "gateway",
        processed_at: nowIso,
        event_type: "payment_confirmed",
        status: "PROCESSED",
      });
    }

    // 9. Auditoria
    await this.logAudit(
      targetUserId,
      isUpgrade ? "subscription_upgraded" : "subscription_activated",
      paymentDoc.id,
      subDoc.id,
      {
        plan: params.plan,
        billingCycle: cycle,
        amount: expectedAmount,
        expiresAt,
      }
    );

    return { success: true, subscription: subDoc, payment: paymentDoc };
  }

  /**
   * Processa falha de pagamento
   */
  static async processPaymentFailure(params: {
    paymentId: string;
    reason?: string;
  }): Promise<void> {
    const db = this.db();
    const payment = await this.getPaymentStatus(params.paymentId);
    if (!payment) return;

    payment.status = "failed";
    payment.failure_reason = params.reason || "Pagamento recusado pelo gateway.";
    payment.updated_at = new Date().toISOString();

    await db.collection("payments").doc(payment.id).set(payment, { merge: true });

    await this.logAudit(payment.user_id, "payment_failed", payment.id, null, {
      reason: payment.failure_reason,
    });
  }

  /**
   * Processa cancelamento de assinatura (preserva acesso até expires_at)
   */
  static async cancelSubscription(userId: string): Promise<SubscriptionDoc> {
    const db = this.db();
    const nowIso = new Date().toISOString();
    const subSnap = await db.collection("subscriptions").where("user_id", "==", userId).limit(1).get();

    if (subSnap.empty) {
      throw new Error("Nenhuma assinatura encontrada para este usuário.");
    }

    const current = subSnap.docs[0].data() as SubscriptionDoc;
    const updatedSub: SubscriptionDoc = {
      ...current,
      status: "canceled",
      updated_at: nowIso,
    };

    await subSnap.docs[0].ref.set(updatedSub, { merge: true });

    await this.logAudit(userId, "subscription_canceled", null, updatedSub.id, {
      expiresAt: updatedSub.expires_at,
    });

    return updatedSub;
  }
}
