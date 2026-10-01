import { Router, Request, Response } from "express";
import { authenticateFirebaseRequest } from "../auth/authMiddleware";
import { BillingService } from "../services/billing/billingService";
import { EntitlementsService } from "../services/entitlements/entitlementsService";
import { SEED_PLANS } from "../services/entitlements/seeds";

export const billingRouter = Router();

/**
 * POST /api/billing/checkout
 * Inicia a ordem de checkout (Autenticado).
 * NUNCA confia em preços enviados pelo frontend.
 */
billingRouter.post("/checkout", authenticateFirebaseRequest, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.uid) {
      res.status(401).json({ error: "Usuário não autenticado." });
      return;
    }

    const { plan, billingCycle } = req.body;
    if (plan !== "pro" && plan !== "elite") {
      res.status(400).json({ error: "Plano inválido para contratação." });
      return;
    }

    if (billingCycle !== "monthly" && billingCycle !== "annual") {
      res.status(400).json({ error: "Ciclo de cobrança inválido." });
      return;
    }

    const originUrl = req.headers.origin || req.headers.referer;

    const result = await BillingService.createCheckout({
      userId: user.uid,
      userEmail: user.email,
      plan,
      billingCycle,
      originUrl: typeof originUrl === "string" ? originUrl : undefined,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("[BillingRouter] Error in /checkout:", error);
    res.status(400).json({
      success: false,
      error: error.message || "Não foi possível iniciar o checkout.",
    });
  }
});

/**
 * GET /api/billing/payment-status/:paymentId
 * Consulta o status real da transação no Firestore (Autenticado).
 */
billingRouter.get("/payment-status/:paymentId", authenticateFirebaseRequest, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { paymentId } = req.params;

    const payment = await BillingService.getPaymentStatus(paymentId, user?.uid);
    if (!payment) {
      res.status(404).json({ error: "Pagamento não encontrado." });
      return;
    }

    res.status(200).json({
      success: true,
      status: payment.status,
      plan: payment.plan_id,
      billingCycle: payment.billing_cycle,
      amount: payment.amount,
      paidAt: payment.paid_at,
      failureReason: payment.failure_reason,
    });
  } catch (error: any) {
    console.error("[BillingRouter] Error in /payment-status:", error);
    res.status(400).json({
      success: false,
      error: error.message || "Erro ao consultar status do pagamento.",
    });
  }
});

/**
 * GET /api/billing/my-subscription
 * Consulta dados completos da assinatura do usuário (Autenticado).
 */
billingRouter.get("/my-subscription", authenticateFirebaseRequest, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const sub = await EntitlementsService.getUserSubscription(user.uid);
    const planConfig = SEED_PLANS[sub.plan_id] || SEED_PLANS.trial;

    res.status(200).json({
      success: true,
      subscription: {
        id: sub.id,
        plan: sub.plan_id,
        planName: planConfig.name,
        status: sub.status,
        billingCycle: sub.billing_cycle,
        startsAt: sub.starts_at,
        expiresAt: sub.expires_at,
        trialEndsAt: sub.trial_ends_at,
        priceMonthly: planConfig.price_monthly,
        priceYearly: planConfig.price_yearly,
        canUpgrade: sub.plan_id === "trial" || sub.plan_id === "pro",
      },
    });
  } catch (error: any) {
    console.error("[BillingRouter] Error in /my-subscription:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Erro ao consultar assinatura.",
    });
  }
});

/**
 * POST /api/billing/cancel-subscription
 * Cancela a renovação automática da assinatura (mantém acesso até expires_at).
 */
billingRouter.post("/cancel-subscription", authenticateFirebaseRequest, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const canceledSub = await BillingService.cancelSubscription(user.uid);

    res.status(200).json({
      success: true,
      message: "Assinatura cancelada com sucesso. Seu acesso continuará ativo até o fim do período já pago.",
      expiresAt: canceledSub.expires_at,
    });
  } catch (error: any) {
    console.error("[BillingRouter] Error in /cancel-subscription:", error);
    res.status(400).json({
      success: false,
      error: error.message || "Erro ao cancelar assinatura.",
    });
  }
});

/**
 * POST /api/billing/simulate-gateway-action (Apenas para ambiente de desenvolvimento/teste)
 * Permite simular a ação no gateway (ex: aprovação, recusa, pendência) para validar o fluxo real.
 */
billingRouter.post("/simulate-gateway-action", async (req: Request, res: Response) => {
  try {
    const { paymentId, action } = req.body;
    const payment = await BillingService.getPaymentStatus(paymentId);
    if (!payment) {
      res.status(404).json({ error: "Pagamento não encontrado." });
      return;
    }

    if (action === "approve") {
      const result = await BillingService.processPaymentSuccess({
        paymentId: payment.id,
        userId: payment.user_id,
        plan: payment.plan_id,
        billingCycle: payment.billing_cycle,
        amountPaid: payment.amount,
        provider: "mock_sandbox",
        providerPaymentId: `sim_${Date.now()}`,
      });
      res.status(200).json({ success: true, status: "paid", result });
      return;
    }

    if (action === "reject") {
      await BillingService.processPaymentFailure({
        paymentId: payment.id,
        reason: "Cartão recusado pela operadora.",
      });
      res.status(200).json({ success: true, status: "failed" });
      return;
    }

    res.status(400).json({ error: "Ação de simulação desconhecida." });
  } catch (error: any) {
    console.error("[BillingRouter] Error in /simulate-gateway-action:", error);
    res.status(500).json({ error: error.message });
  }
});
