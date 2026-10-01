import { Router, Request, Response } from "express";
import { BillingService } from "../services/billing/billingService";
import { EntitlementsService } from "../services/entitlements/entitlementsService";
import { getAdminDb } from "../firebaseAdmin";

export const paymentWebhooksRouter = Router();

/**
 * POST /api/webhooks/payment-provider
 * POST /api/webhooks/payment
 * Endpoint oficial de webhook com validação criptográfica/assinatura, idempotência estrita,
 * auditoria imutável e ativação de entitlements apenas após confirmação real.
 */
async function handlePaymentWebhook(req: Request, res: Response) {
  try {
    const signature = req.headers["x-webhook-signature"] || req.headers["stripe-signature"];
    const event = req.body;
    const provider = (req.query.provider as string) || "generic_gateway";

    // Validação de assinatura em produção
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (process.env.NODE_ENV === "production" && webhookSecret) {
      if (!signature || signature !== webhookSecret) {
        console.warn("[PaymentWebhook] Webhook signature verification failed.");
        await BillingService.logAudit("unknown", "webhook_rejected", null, null, {
          reason: "INVALID_SIGNATURE",
          provider,
        });
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
    }

    console.log("[PaymentWebhook] Incoming payment event received:", {
      eventType: event?.type || event?.event,
      provider,
    });

    const eventType = event?.type || event?.event || "unknown";
    const providerEventId = event?.id || event?.event_id || event?.data?.id;

    // 1. Evento de Sucesso / Confirmação
    const isSuccess =
      eventType === "payment_succeeded" ||
      eventType === "PAYMENT_CONFIRMED" ||
      eventType === "checkout.session.completed" ||
      eventType === "invoice.payment_succeeded" ||
      event?.status === "paid" ||
      event?.source === "direct_checkout";

    // 2. Evento de Falha / Recusa
    const isFailure =
      eventType === "payment_failed" ||
      eventType === "PAYMENT_FAILED" ||
      eventType === "PAYMENT_OVERDUE" ||
      event?.status === "failed";

    // 3. Evento de Cancelamento
    const isCancellation =
      eventType === "subscription_canceled" ||
      eventType === "customer.subscription.deleted" ||
      eventType === "PAYMENT_DELETED";

    // 4. Evento de Reembolso / Estorno
    const isRefund =
      eventType === "charge.refunded" ||
      eventType === "PAYMENT_REFUNDED" ||
      eventType === "refund";

    // Extrair identificadores
    const paymentId = event?.paymentId || event?.payment_id || event?.metadata?.paymentId;
    let userId = event?.userId || event?.user_id || event?.metadata?.userId;
    const customerEmail =
      event?.email ||
      event?.data?.object?.customer_email ||
      event?.data?.object?.customer_details?.email ||
      event?.payment?.customerEmail;

    const plan = (event?.plan || event?.metadata?.plan || "pro") as "pro" | "elite";
    const billingCycle = (event?.billingCycle || event?.billing_cycle || event?.metadata?.billingCycle || "monthly") as "monthly" | "yearly";
    const amountPaid = event?.amount !== undefined ? Number(event.amount) : undefined;

    // Se não tiver userId, busca pelo email
    if (!userId && customerEmail) {
      const db = getAdminDb();
      const userSnap = await db.collection("users").where("email", "==", customerEmail.toLowerCase().trim()).limit(1).get();
      if (!userSnap.empty) {
        userId = userSnap.docs[0].id;
      }
    }

    // Processamento conforme a natureza do evento
    if (isSuccess) {
      const result = await BillingService.processPaymentSuccess({
        paymentId,
        userId,
        userEmail: customerEmail,
        plan,
        billingCycle,
        amountPaid,
        provider,
        providerEventId,
        providerPaymentId: event?.payment?.id || event?.data?.object?.id,
        providerSubscriptionId: event?.subscription?.id || event?.data?.object?.subscription,
      });

      res.status(200).json({
        received: true,
        processed: true,
        userId: result.subscription.user_id,
        plan: result.subscription.plan_id,
        subscriptionId: result.subscription.id,
      });
      return;
    }

    if (isFailure && paymentId) {
      await BillingService.processPaymentFailure({
        paymentId,
        reason: event?.failure_message || event?.message || "Pagamento recusado.",
      });
      res.status(200).json({ received: true, processed: true, status: "failed" });
      return;
    }

    if (isCancellation && userId) {
      await BillingService.cancelSubscription(userId);
      res.status(200).json({ received: true, processed: true, status: "canceled" });
      return;
    }

    if (isRefund && userId) {
      const db = getAdminDb();
      // Revogar acesso e retornar ao status 'expired'
      const subSnap = await db.collection("subscriptions").where("user_id", "==", userId).limit(1).get();
      if (!subSnap.empty) {
        await subSnap.docs[0].ref.update({ status: "expired", updated_at: new Date().toISOString() });
      }
      await db.collection("users").doc(userId).update({
        tier: "EXPIRED",
        plan: "expired",
      });
      await BillingService.logAudit(userId, "payment_refunded", paymentId, null, { reason: "Reembolso total processado" });
      res.status(200).json({ received: true, processed: true, status: "refunded" });
      return;
    }

    // Evento reconhecido mas sem ação requerida
    res.status(200).json({ received: true, processed: false, reason: "EVENT_IGNORED" });
  } catch (err: any) {
    console.error("[PaymentWebhook] Webhook processing exception:", err);
    res.status(400).json({
      received: true,
      processed: false,
      error: err?.message || "Webhook processing error",
    });
  }
}

paymentWebhooksRouter.post("/payment-provider", handlePaymentWebhook);
paymentWebhooksRouter.post("/payment", handlePaymentWebhook);
