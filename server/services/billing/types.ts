import { PlanCode, BillingCycle } from "../entitlements/types";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "canceled"
  | "refunded"
  | "expired";

export interface PaymentDoc {
  id: string; // "pay_<timestamp>_<rand>"
  user_id: string;
  user_email?: string;
  subscription_id?: string | null;
  plan_id: "pro" | "elite";
  billing_cycle: "monthly" | "yearly";
  provider: string; // "stripe" | "asaas" | "hotmart" | "mock_sandbox"
  provider_payment_id?: string | null;
  provider_checkout_id?: string | null;
  amount: number; // Em reais ou centavos canônicos (ex: 99.9 ou 897)
  currency: "BRL";
  status: PaymentStatus;
  checkout_url?: string;
  success_url: string;
  cancel_url: string;
  created_at: string;
  updated_at: string;
  paid_at?: string | null;
  failure_reason?: string | null;
  metadata?: Record<string, any>;
}

export type PaymentAuditEvent =
  | "checkout_created"
  | "payment_pending"
  | "payment_confirmed"
  | "payment_failed"
  | "subscription_activated"
  | "subscription_upgraded"
  | "subscription_canceled"
  | "subscription_expired"
  | "subscription_renewed"
  | "webhook_received"
  | "webhook_rejected"
  | "payment_refunded";

export interface PaymentAuditLogDoc {
  id: string;
  user_id: string;
  payment_id?: string | null;
  subscription_id?: string | null;
  event: PaymentAuditEvent;
  timestamp: string;
  details?: Record<string, any>;
}

export interface WebhookEventRecord {
  id: string; // provider_event_id
  provider: string;
  processed_at: string;
  event_type: string;
  status: "PROCESSED" | "IGNORED" | "FAILED";
}
