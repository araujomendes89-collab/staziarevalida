import { describe, it, expect, vi, beforeEach } from "vitest";
import { EntitlementsService } from "../../server/services/entitlements/entitlementsService";
import { SEED_PLANS, SEED_FEATURES } from "../../server/services/entitlements/seeds";
import { SubscriptionDoc } from "../../server/services/entitlements/types";

describe("EntitlementsService Canonical 3-Tier Access System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Canonical Seed Integrity", () => {
    it("should define exactly 3 canonical plans: trial, pro, elite", () => {
      const planKeys = Object.keys(SEED_PLANS);
      expect(planKeys).toHaveLength(3);
      expect(planKeys).toEqual(["trial", "pro", "elite"]);
    });

    it("should seed all essential features including AI coach, pareto mode and weakness map", () => {
      const featureCodes = Object.keys(SEED_FEATURES);
      expect(featureCodes).toContain("official_questions");
      expect(featureCodes).toContain("simulations");
      expect(featureCodes).toContain("full_exams");
      expect(featureCodes).toContain("ai_coach");
      expect(featureCodes).toContain("pareto_mode");
      expect(featureCodes).toContain("weakness_map");
      expect(featureCodes).toContain("smart_schedule");
      expect(featureCodes).toContain("daily_adaptive_plan");
    });
  });

  describe("Master Admin Bypass", () => {
    it("should grant full access to master admin email araujomendes@staziamed.com.br regardless of plan", async () => {
      const decision = await EntitlementsService.canAccess(
        "master-user-uid",
        "ai_coach",
        "araujomendes@staziamed.com.br"
      );
      expect(decision.allowed).toBe(true);
    });

    it("should grant full access to canonical master UID cQjACVALpedbijS0WiCwuFRJgxj2", async () => {
      const decision = await EntitlementsService.canAccess(
        "cQjACVALpedbijS0WiCwuFRJgxj2",
        "pareto_mode"
      );
      expect(decision.allowed).toBe(true);
    });
  });

  describe("Trial Plan Dynamic Expiration", () => {
    it("should recognize trial active when trial_ends_at is in the future", async () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const isActive = await EntitlementsService.isTrialActive(futureDate);
      expect(isActive).toBe(true);

      const daysRemaining = await EntitlementsService.getTrialDaysRemaining(futureDate);
      expect(daysRemaining).toBe(5);
    });

    it("should recognize trial expired when trial_ends_at is in the past (FAIL-CLOSED)", async () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const isActive = await EntitlementsService.isTrialActive(pastDate);
      expect(isActive).toBe(false);

      const daysRemaining = await EntitlementsService.getTrialDaysRemaining(pastDate);
      expect(daysRemaining).toBe(0);
    });
  });

  describe("Tier Entitlement Matrix & Feature Gates", () => {
    const mockProSub: SubscriptionDoc = {
      id: "sub_pro_123",
      user_id: "user-pro-1",
      plan_id: "pro",
      status: "active",
      billing_cycle: "monthly",
      starts_at: new Date().toISOString(),
      trial_ends_at: null,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      provider: "stripe",
      provider_subscription_id: "sub_123",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mockEliteSub: SubscriptionDoc = {
      id: "sub_elite_123",
      user_id: "user-elite-1",
      plan_id: "elite",
      status: "active",
      billing_cycle: "monthly",
      starts_at: new Date().toISOString(),
      trial_ends_at: null,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      provider: "stripe",
      provider_subscription_id: "sub_456",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("should block Elite features (ai_coach, pareto_mode) for Pro users", async () => {
      vi.spyOn(EntitlementsService, "getUserSubscription").mockResolvedValue(mockProSub);
      vi.spyOn(EntitlementsService, "getUserOverrides").mockResolvedValue({} as any);

      const aiCoachDecision = await EntitlementsService.canAccess("user-pro-1", "ai_coach", "medico@hospital.com");
      expect(aiCoachDecision.allowed).toBe(false);
      expect(aiCoachDecision.requiredPlan).toBe("elite");

      const paretoDecision = await EntitlementsService.canAccess("user-pro-1", "pareto_mode", "medico@hospital.com");
      expect(paretoDecision.allowed).toBe(false);
      expect(paretoDecision.requiredPlan).toBe("elite");
    });

    it("should allow Pro features (simulations, full_exams, weakness_map) for Pro users", async () => {
      vi.spyOn(EntitlementsService, "getUserSubscription").mockResolvedValue(mockProSub);
      vi.spyOn(EntitlementsService, "getUserOverrides").mockResolvedValue({} as any);
      vi.spyOn(EntitlementsService, "getFeatureUsage").mockResolvedValue(0);

      const simulationsDecision = await EntitlementsService.canAccess("user-pro-1", "simulations", "medico@hospital.com");
      expect(simulationsDecision.allowed).toBe(true);

      const weaknessMapDecision = await EntitlementsService.canAccess("user-pro-1", "weakness_map", "medico@hospital.com");
      expect(weaknessMapDecision.allowed).toBe(true);
    });

    it("should allow all features for Elite users", async () => {
      vi.spyOn(EntitlementsService, "getUserSubscription").mockResolvedValue(mockEliteSub);
      vi.spyOn(EntitlementsService, "getUserOverrides").mockResolvedValue({} as any);
      vi.spyOn(EntitlementsService, "getFeatureUsage").mockResolvedValue(0);

      const aiCoachDecision = await EntitlementsService.canAccess("user-elite-1", "ai_coach", "elite@hospital.com");
      expect(aiCoachDecision.allowed).toBe(true);

      const paretoDecision = await EntitlementsService.canAccess("user-elite-1", "pareto_mode", "elite@hospital.com");
      expect(paretoDecision.allowed).toBe(true);

      const simulationsDecision = await EntitlementsService.canAccess("user-elite-1", "simulations", "elite@hospital.com");
      expect(simulationsDecision.allowed).toBe(true);
    });
  });

  describe("Usage Limits Enforcement", () => {
    it("should detect when usage limit is exceeded (100 questions in trial)", async () => {
      vi.spyOn(EntitlementsService, "getFeatureLimit").mockResolvedValue(100);
      vi.spyOn(EntitlementsService, "getFeatureUsage").mockResolvedValue(100);

      const check = await EntitlementsService.checkUsageLimit("trial-uid", "official_questions");
      expect(check.exceeded).toBe(true);
      expect(check.limit).toBe(100);
      expect(check.current).toBe(100);
    });

    it("should allow usage when below limit (e.g. 42 of 100 questions)", async () => {
      vi.spyOn(EntitlementsService, "getFeatureLimit").mockResolvedValue(100);
      vi.spyOn(EntitlementsService, "getFeatureUsage").mockResolvedValue(42);

      const check = await EntitlementsService.checkUsageLimit("trial-uid", "official_questions");
      expect(check.exceeded).toBe(false);
      expect(check.limit).toBe(100);
      expect(check.current).toBe(42);
    });
  });
});
