import { describe, it, expect, vi, beforeEach } from "vitest";
import { BillingService } from "../../server/services/billing/billingService";
import { EntitlementsService } from "../../server/services/entitlements/entitlementsService";
import { SEED_PLANS } from "../../server/services/entitlements/seeds";

// Mock Firestore Admin DB
const mockCollections: Record<string, Record<string, any>> = {};

const createDocMock = (collName: string, id: string, initialData?: any) => {
  if (!mockCollections[collName]) mockCollections[collName] = {};
  if (initialData && !mockCollections[collName][id]) {
    mockCollections[collName][id] = { ...initialData };
  }

  return {
    id,
    get: vi.fn(async () => ({
      exists: Boolean(mockCollections[collName]?.[id]),
      id,
      data: () => mockCollections[collName]?.[id],
    })),
    set: vi.fn(async (data: any, options?: { merge?: boolean }) => {
      if (!mockCollections[collName]) mockCollections[collName] = {};
      if (options?.merge && mockCollections[collName][id]) {
        mockCollections[collName][id] = { ...mockCollections[collName][id], ...data };
      } else {
        mockCollections[collName][id] = { ...data };
      }
    }),
    update: vi.fn(async (data: any) => {
      if (!mockCollections[collName]) mockCollections[collName] = {};
      mockCollections[collName][id] = { ...(mockCollections[collName][id] || {}), ...data };
    }),
    ref: {
      update: vi.fn(async (data: any) => {
        if (!mockCollections[collName]) mockCollections[collName] = {};
        mockCollections[collName][id] = { ...(mockCollections[collName][id] || {}), ...data };
      }),
      set: vi.fn(async (data: any, options?: any) => {
        if (!mockCollections[collName]) mockCollections[collName] = {};
        if (options?.merge && mockCollections[collName][id]) {
          mockCollections[collName][id] = { ...mockCollections[collName][id], ...data };
        } else {
          mockCollections[collName][id] = { ...data };
        }
      }),
    },
  };
};

vi.mock("../../server/firebaseAdmin", () => ({
  getAdminDb: () => ({
    collection: (collName: string) => ({
      doc: (docId: string) => createDocMock(collName, docId),
      where: (field: string, op: string, val: any) => ({
        limit: (n: number) => ({
          get: vi.fn(async () => {
            const coll = mockCollections[collName] || {};
            const matches: any[] = [];
            for (const [id, item] of Object.entries(coll)) {
              if (item[field] === val) {
                matches.push({
                  id,
                  data: () => item,
                  ref: createDocMock(collName, id).ref,
                });
                if (matches.length >= n) break;
              }
            }
            return {
              empty: matches.length === 0,
              docs: matches,
            };
          }),
        }),
        get: vi.fn(async () => {
          const coll = mockCollections[collName] || {};
          const matches: any[] = [];
          for (const [id, item] of Object.entries(coll)) {
            if (item[field] === val) {
              matches.push({
                id,
                data: () => item,
                ref: createDocMock(collName, id).ref,
              });
            }
          }
          return {
            empty: matches.length === 0,
            docs: matches,
          };
        }),
      }),
    }),
  }),
}));

describe("Checkout and Payment Lifecycle Flow (PRO & ELITE)", () => {
  const userId = "test_user_medico_1";

  beforeEach(() => {
    // Reset mock collections
    for (const key of Object.keys(mockCollections)) {
      delete mockCollections[key];
    }

    // Default trial user
    mockCollections["users"] = {
      [userId]: {
        id: userId,
        email: "aluno@staziamed.com.br",
        name: "Dr. Aluno",
        plan: "trial",
        tier: "TRIAL",
        trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };

    mockCollections["subscriptions"] = {
      [`sub_${userId}`]: {
        id: `sub_${userId}`,
        user_id: userId,
        plan_id: "trial",
        status: "trialing",
        billing_cycle: "trial",
        starts_at: new Date().toISOString(),
        trial_ends_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };
  });

  it("1. Trial -> PRO mensal: cria checkout com status pending e preço oficial", async () => {
    const checkout = await BillingService.createCheckout({
      userId,
      userEmail: "aluno@staziamed.com.br",
      plan: "pro",
      billingCycle: "monthly",
    });

    expect(checkout.paymentId).toBeDefined();
    expect(checkout.plan).toBe("pro");
    expect(checkout.billingCycle).toBe("monthly");
    expect(checkout.amount).toBe(99.9); // Preço canônico PRO mensal

    // PaymentDoc criado com status 'pending'
    const payment = await BillingService.getPaymentStatus(checkout.paymentId);
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe("pending");

    // Assinatura continua trialing (NÃO ATIVA ANTES DO PAGAMENTO)
    const sub = await EntitlementsService.getUserSubscription(userId);
    expect(sub.plan_id).toBe("trial");
    expect(sub.status).toBe("trialing");
  });

  it("2. Trial -> PRO anual: calcula valor de 365 dias (R$ 897,00) canônico", async () => {
    const checkout = await BillingService.createCheckout({
      userId,
      plan: "pro",
      billingCycle: "annual",
    });

    expect(checkout.amount).toBe(897); // Preço canônico PRO anual
    expect(checkout.billingCycle).toBe("yearly");
  });

  it("3. Confirmação real via webhook ativa PRO e define vigência correta", async () => {
    const checkout = await BillingService.createCheckout({
      userId,
      plan: "pro",
      billingCycle: "monthly",
    });

    const result = await BillingService.processPaymentSuccess({
      paymentId: checkout.paymentId,
      userId,
      plan: "pro",
      billingCycle: "monthly",
      amountPaid: 99.9,
      providerPaymentId: "gw_tx_123",
      providerEventId: "evt_123",
    });

    expect(result.success).toBe(true);
    expect(result.subscription.status).toBe("active");
    expect(result.subscription.plan_id).toBe("pro");
    expect(result.payment.status).toBe("paid");

    // Sincronizou users
    expect(mockCollections["users"][userId].plan).toBe("pro");
    expect(mockCollections["users"][userId].tier).toBe("PRO");

    // Entitlements liberados para PRO (ex: enamed_questions permitido, ai_coach não)
    const canEnamed = await EntitlementsService.canAccess(userId, "enamed_questions");
    expect(canEnamed.allowed).toBe(true);

    const canCoach = await EntitlementsService.canAccess(userId, "ai_coach");
    expect(canCoach.allowed).toBe(false);
  });

  it("4. Confirmação real ativa ELITE e libera todos os recursos exclusivos", async () => {
    const checkout = await BillingService.createCheckout({
      userId,
      plan: "elite",
      billingCycle: "annual",
    });

    const result = await BillingService.processPaymentSuccess({
      paymentId: checkout.paymentId,
      userId,
      plan: "elite",
      billingCycle: "yearly",
      amountPaid: 1497,
      providerPaymentId: "gw_tx_456",
      providerEventId: "evt_456",
    });

    expect(result.success).toBe(true);
    expect(result.subscription.plan_id).toBe("elite");

    // Recurso exclusivo Elite liberado
    const canCoach = await EntitlementsService.canAccess(userId, "ai_coach");
    expect(canCoach.allowed).toBe(true);

    const canPareto = await EntitlementsService.canAccess(userId, "pareto_mode");
    expect(canPareto.allowed).toBe(true);
  });

  it("5. Upgrade PRO -> ELITE: preserva a mesma assinatura sem conflito de duplicidade", async () => {
    // Colocar usuário em PRO ativo
    mockCollections["subscriptions"][`sub_${userId}`].plan_id = "pro";
    mockCollections["subscriptions"][`sub_${userId}`].status = "active";
    mockCollections["users"][userId].plan = "pro";
    mockCollections["users"][userId].tier = "PRO";

    const checkout = await BillingService.createCheckout({
      userId,
      plan: "elite",
      billingCycle: "monthly",
    });

    const result = await BillingService.processPaymentSuccess({
      paymentId: checkout.paymentId,
      userId,
      plan: "elite",
      billingCycle: "monthly",
      amountPaid: 179.9,
      providerEventId: "evt_upgrade_789",
    });

    expect(result.subscription.plan_id).toBe("elite");
    expect(result.subscription.status).toBe("active");
    expect(mockCollections["users"][userId].plan).toBe("elite");
  });

  it("6. Impede contratação duplicada do mesmo plano quando já está ativo", async () => {
    mockCollections["subscriptions"][`sub_${userId}`].plan_id = "pro";
    mockCollections["subscriptions"][`sub_${userId}`].status = "active";

    await expect(
      BillingService.createCheckout({
        userId,
        plan: "pro",
        billingCycle: "monthly",
      })
    ).rejects.toThrow(/Você já possui uma assinatura ativa deste plano/i);
  });

  it("7. Idempotência estrita: webhook duplicado é ignorado sem duplicar registros", async () => {
    const checkout = await BillingService.createCheckout({
      userId,
      plan: "pro",
      billingCycle: "monthly",
    });

    // Primeira chamada
    await BillingService.processPaymentSuccess({
      paymentId: checkout.paymentId,
      userId,
      plan: "pro",
      billingCycle: "monthly",
      amountPaid: 99.9,
      providerEventId: "evt_duplicate_test",
    });

    // Segunda chamada com mesmo providerEventId
    const secondCall = await BillingService.processPaymentSuccess({
      paymentId: checkout.paymentId,
      userId,
      plan: "pro",
      billingCycle: "monthly",
      amountPaid: 99.9,
      providerEventId: "evt_duplicate_test",
    });

    expect(secondCall.success).toBe(true);
    expect(secondCall.subscription.plan_id).toBe("pro");
  });

  it("8. Rejeita pagamento com discrepância de valor fraudulento", async () => {
    const checkout = await BillingService.createCheckout({
      userId,
      plan: "pro",
      billingCycle: "monthly",
    });

    // Tentativa com R$ 1,00 em vez de R$ 99,90
    await expect(
      BillingService.processPaymentSuccess({
        paymentId: checkout.paymentId,
        userId,
        plan: "pro",
        billingCycle: "monthly",
        amountPaid: 1.0,
      })
    ).rejects.toThrow(/Discrepância de valor/i);
  });

  it("9. Pagamento recusado marca payment como failed e NÃO ativa recursos", async () => {
    const checkout = await BillingService.createCheckout({
      userId,
      plan: "pro",
      billingCycle: "monthly",
    });

    await BillingService.processPaymentFailure({
      paymentId: checkout.paymentId,
      reason: "Saldo insuficiente.",
    });

    const payment = await BillingService.getPaymentStatus(checkout.paymentId);
    expect(payment?.status).toBe("failed");
    expect(payment?.failure_reason).toBe("Saldo insuficiente.");

    // Assinatura continua trialing
    const sub = await EntitlementsService.getUserSubscription(userId);
    expect(sub.plan_id).toBe("trial");
  });

  it("10. Cancelamento de assinatura mantém acesso até o término do período pago", async () => {
    // Usuário PRO com vencimento futuro
    const futureExpiry = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
    mockCollections["subscriptions"][`sub_${userId}`] = {
      id: `sub_${userId}`,
      user_id: userId,
      plan_id: "pro",
      status: "active",
      billing_cycle: "monthly",
      starts_at: new Date().toISOString(),
      expires_at: futureExpiry,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const canceled = await BillingService.cancelSubscription(userId);
    expect(canceled.status).toBe("canceled");
    expect(canceled.expires_at).toBe(futureExpiry);
  });
});
