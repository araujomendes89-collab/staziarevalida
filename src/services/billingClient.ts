import { auth } from "../lib/firebase";
import { BillingCycle } from "../components/pricing/pricingTypes";

export interface CheckoutResult {
  paymentId: string;
  checkoutUrl: string;
  amount: number;
  plan: "pro" | "elite";
  billingCycle: "monthly" | "yearly";
}

export interface PaymentStatusResult {
  success: boolean;
  status: "pending" | "processing" | "paid" | "failed" | "canceled" | "refunded" | "expired";
  plan: "pro" | "elite";
  billingCycle: "monthly" | "yearly";
  amount: number;
  paidAt?: string | null;
  failureReason?: string | null;
}

export interface MySubscriptionResult {
  id: string;
  plan: "trial" | "pro" | "elite";
  planName: string;
  status: string;
  billingCycle: string;
  startsAt: string;
  expiresAt?: string | null;
  trialEndsAt?: string | null;
  priceMonthly: number;
  priceYearly: number;
  canUpgrade: boolean;
}

export class BillingClient {
  private static async getAuthHeaders(): Promise<HeadersInit> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Usuário não autenticado.");
    }
    const token = await user.getIdToken();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Inicia o checkout no backend para criar o PaymentDoc com status pending
   */
  static async startCheckout(plan: "pro" | "elite", billingCycle: BillingCycle): Promise<CheckoutResult> {
    const headers = await this.getAuthHeaders();
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers,
      body: JSON.stringify({
        plan,
        billingCycle,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Não foi possível iniciar o checkout.");
    }

    return data.data;
  }

  /**
   * Consulta o status real do pagamento no servidor
   */
  static async getPaymentStatus(paymentId: string): Promise<PaymentStatusResult> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/billing/payment-status/${encodeURIComponent(paymentId)}`, {
      method: "GET",
      headers,
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Erro ao consultar status do pagamento.");
    }

    return data;
  }

  /**
   * Obtém detalhes da assinatura atual do usuário
   */
  static async getMySubscription(): Promise<MySubscriptionResult> {
    const headers = await this.getAuthHeaders();
    const res = await fetch("/api/billing/my-subscription", {
      method: "GET",
      headers,
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Erro ao carregar detalhes da assinatura.");
    }

    return data.subscription;
  }

  /**
   * Cancela a renovação automática da assinatura
   */
  static async cancelSubscription(): Promise<{ success: boolean; expiresAt: string }> {
    const headers = await this.getAuthHeaders();
    const res = await fetch("/api/billing/cancel-subscription", {
      method: "POST",
      headers,
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Erro ao cancelar assinatura.");
    }

    return data;
  }

  /**
   * Simula a ação do gateway (apenas em desenvolvimento e testes)
   */
  static async simulateGatewayAction(paymentId: string, action: "approve" | "reject"): Promise<any> {
    const res = await fetch("/api/billing/simulate-gateway-action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentId,
        action,
      }),
    });
    return await res.json();
  }
}
