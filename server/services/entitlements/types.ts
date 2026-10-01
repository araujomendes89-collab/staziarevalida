export type PlanCode = "trial" | "pro" | "elite";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

export type BillingCycle = "monthly" | "yearly" | "trial" | "lifetime";

export type FeatureCode =
  | "official_questions"
  | "enamed_questions"
  | "full_exams"
  | "question_comments"
  | "advanced_filters"
  | "favorites"
  | "error_notebook"
  | "smart_error_notebook"
  | "basic_stats"
  | "advanced_stats"
  | "simulations"
  | "adaptive_simulations"
  | "protocol_updates"
  | "historical_vs_current_guideline"
  | "flashcards"
  | "great_topics"
  | "strategic_summaries"
  | "original_questions"
  | "ai_explanations"
  | "ai_question_generation"
  | "smart_schedule"
  | "adaptive_schedule"
  | "spaced_repetition"
  | "weakness_map"
  | "revalida_dna"
  | "error_based_questions"
  | "pro_group"
  | "vip_group"
  | "pareto_mode"
  | "daily_adaptive_plan"
  | "preparation_radar"
  | "final_review"
  | "ai_coach"
  | "early_access";

export interface PlanDoc {
  id: string;
  code: PlanCode;
  name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeatureDoc {
  id: string;
  code: FeatureCode;
  name: string;
  description: string;
  active: boolean;
}

export interface PlanFeatureDoc {
  id: string;
  plan_id: PlanCode;
  feature_id: FeatureCode;
  enabled: boolean;
  limit_value: number | null; // null = unlimited when enabled
  created_at: string;
  updated_at: string;
}

export interface SubscriptionDoc {
  id: string;
  user_id: string;
  plan_id: PlanCode;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  starts_at: string;
  expires_at?: string | null;
  trial_ends_at?: string | null;
  provider: string; // "stripe" | "hotmart" | "asaas" | "internal" | "manual"
  provider_subscription_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageTrackingDoc {
  id: string;
  user_id: string;
  feature_id: FeatureCode;
  subscription_id?: string | null;
  period: string; // "global_trial" | "YYYY-MM"
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface UserFeatureOverrideDoc {
  id: string;
  user_id: string;
  feature_id: FeatureCode;
  enabled: boolean;
  limit_value: number | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureAccessDecision {
  allowed: boolean;
  reason?: "TRIAL_EXPIRED" | "FEATURE_NOT_AVAILABLE" | "FEATURE_LIMIT_EXCEEDED" | "USER_DISABLED";
  requiredPlan?: PlanCode;
  limit?: number | null;
  used?: number;
  remaining?: number | null;
}

export interface UserEntitlementsSummary {
  userId: string;
  plan: PlanCode;
  planName: string;
  status: SubscriptionStatus;
  isTrial: boolean;
  isExpired: boolean;
  trialDaysRemaining: number;
  startsAt: string;
  expiresAt?: string | null;
  features: Record<
    FeatureCode,
    {
      enabled: boolean;
      requiredPlan?: PlanCode;
      limit?: number | null;
      used: number;
      remaining?: number | null;
    }
  >;
}
