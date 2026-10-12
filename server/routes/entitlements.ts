import { Router, Request, Response } from "express";
import { authenticateFirebaseRequest, requireServerRole } from "../auth/authMiddleware";
import { EntitlementsService } from "../services/entitlements/entitlementsService";
import { FeatureCode, PlanCode } from "../services/entitlements/types";
import { SEED_PLANS, SEED_FEATURES, SEED_PLAN_FEATURES } from "../services/entitlements/seeds";
import { getAdminDb } from "../firebaseAdmin";

export const entitlementsRouter = Router();

/**
 * Middleware para rotas protegidas por feature
 */
export function requireFeatureMiddleware(featureCode: FeatureCode) {
  return async (req: Request, res: Response, next: Function) => {
    const userId = req.auth?.uid;
    if (!userId) {
      res.status(401).json({
        error: "AUTH_MISSING_TOKEN",
        message: "Usuário não autenticado para acessar esta funcionalidade.",
      });
      return;
    }

    try {
      const decision = await EntitlementsService.canAccess(userId, featureCode);
      if (!decision.allowed) {
        if (decision.reason === "TRIAL_EXPIRED") {
          res.status(403).json({
            error: "TRIAL_EXPIRED",
            message: "Seu período de teste gratuito de 7 dias expirou.",
            requiredPlan: "pro",
          });
          return;
        }

        if (decision.reason === "FEATURE_LIMIT_EXCEEDED") {
          res.status(403).json({
            error: "FEATURE_LIMIT_EXCEEDED",
            feature: featureCode,
            limit: decision.limit,
            used: decision.used,
            message: `Você atingiu o limite de uso (${decision.used}/${decision.limit}) para este recurso.`,
          });
          return;
        }

        res.status(403).json({
          error: "FEATURE_NOT_AVAILABLE",
          feature: featureCode,
          requiredPlan: decision.requiredPlan || "pro",
          message: `Este recurso está disponível apenas no plano ${
            decision.requiredPlan === "elite" ? "Stazia Elite" : "Stazia PRO"
          }.`,
        });
        return;
      }

      next();
    } catch (err: any) {
      console.error(`[EntitlementsMiddleware] Error checking feature ${featureCode}:`, err);
      res.status(500).json({
        error: "INTERNAL_ENTITLEMENTS_ERROR",
        message: "Falha ao verificar autorização de acesso.",
      });
    }
  };
}

// -------------------------------------------------------------
// 1. ROTAS PÚBLICAS (Visitantes e Alunos)
// -------------------------------------------------------------

/**
 * GET /api/entitlements/plans
 * Retorna os 3 planos canônicos e preços para a página pública de planos e assinaturas
 */
entitlementsRouter.get("/plans", (_req: Request, res: Response) => {
  res.json({
    success: true,
    plans: Object.values(SEED_PLANS),
  });
});

// -------------------------------------------------------------
// 2. ROTAS DO USUÁRIO AUTENTICADO
// -------------------------------------------------------------

entitlementsRouter.use(authenticateFirebaseRequest);

/**
 * GET /api/entitlements/me
 * Retorna o mapa completo de entitlements, features ativas e limites do usuário autenticado.
 */
entitlementsRouter.get("/me", async (req: Request, res: Response) => {
  try {
    const userId = req.auth!.uid;
    const entitlements = await EntitlementsService.getUserEntitlements(userId);
    res.json({
      success: true,
      entitlements,
    });
  } catch (error: any) {
    console.error("[EntitlementsRouter] Error getting user entitlements:", error);
    res.status(500).json({
      error: "ENTITLEMENTS_ERROR",
      message: "Não foi possível carregar os dados de assinatura do usuário.",
    });
  }
});

/**
 * POST /api/entitlements/check
 * Checa pontualmente o acesso a uma feature antes de renderizar ou executar
 */
entitlementsRouter.post("/check", async (req: Request, res: Response) => {
  try {
    const userId = req.auth!.uid;
    const { feature } = req.body;

    if (!feature) {
      res.status(400).json({ error: "MISSING_FEATURE", message: "Campo 'feature' obrigatório." });
      return;
    }

    const decision = await EntitlementsService.canAccess(userId, feature as FeatureCode);
    res.json({
      success: true,
      feature,
      ...decision,
    });
  } catch (error: any) {
    console.error("[EntitlementsRouter] Error checking feature:", error);
    res.status(500).json({
      error: "ENTITLEMENTS_ERROR",
      message: "Falha ao checar autorização de feature.",
    });
  }
});

/**
 * POST /api/entitlements/consume
 * Registra consumo seguro de recursos limitados (questões, IA, etc.)
 */
entitlementsRouter.post("/consume", async (req: Request, res: Response) => {
  try {
    const userId = req.auth!.uid;
    const { feature, amount = 1 } = req.body;

    if (!feature) {
      res.status(400).json({ error: "MISSING_FEATURE", message: "Campo 'feature' obrigatório." });
      return;
    }

    const result = await EntitlementsService.consumeUsage(userId, feature as FeatureCode, amount);
    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    if (error.message === "FEATURE_LIMIT_EXCEEDED") {
      res.status(403).json({
        error: "FEATURE_LIMIT_EXCEEDED",
        feature: req.body.feature,
        message: "Limite de uso atingido para este recurso no período atual.",
      });
      return;
    }
    if (error.message === "TRIAL_EXPIRED") {
      res.status(403).json({
        error: "TRIAL_EXPIRED",
        message: "Seu teste gratuito encerrou. Faça upgrade para continuar utilizando.",
      });
      return;
    }

    console.error("[EntitlementsRouter] Error consuming usage:", error);
    res.status(500).json({
      error: "CONSUME_ERROR",
      message: "Erro ao registrar consumo do recurso.",
    });
  }
});

/**
 * POST /api/entitlements/upgrade-self
 * Troca de plano SEM pagamento: só administrador (RT03, 2026-10-12). Antes qualquer conta logada se dava Pro ou Elite de graça.
 * A cobrança de verdade será feita do zero, com conferência obrigatória da assinatura (Stripe está parada por decisão do dono).
 */
entitlementsRouter.post("/upgrade-self", requireServerRole("ADMIN"), async (req: Request, res: Response) => {
  try {
    const userId = req.auth!.uid;
    const { plan } = req.body;

    if (plan !== "pro" && plan !== "elite") {
      res.status(400).json({
        error: "INVALID_PLAN",
        message: "Plano inválido para contratação. Escolha 'pro' ou 'elite'.",
      });
      return;
    }

    const updatedSub = await EntitlementsService.upgradeSubscription(userId, plan, "manual");
    res.json({
      success: true,
      subscription: updatedSub,
    });
  } catch (error: any) {
    console.error("[EntitlementsRouter] Error upgrading subscription:", error);
    res.status(500).json({
      error: "UPGRADE_ERROR",
      message: "Não foi possível atualizar a assinatura.",
    });
  }
});

// -------------------------------------------------------------
// 2. ROTAS ADMINISTRATIVAS (/api/admin/entitlements)
// -------------------------------------------------------------

export const adminEntitlementsRouter = Router();
adminEntitlementsRouter.use(authenticateFirebaseRequest);
adminEntitlementsRouter.use(requireServerRole("ADMIN"));

/**
 * GET /api/admin/entitlements/plans
 * Lista planos do sistema
 */
adminEntitlementsRouter.get("/plans", async (_req: Request, res: Response) => {
  try {
    const db = getAdminDb();
    const snap = await db.collection("plans").get();
    const plans = snap.docs.map((d) => d.data());
    res.json({
      success: true,
      plans: plans.length > 0 ? plans : Object.values(SEED_PLANS),
    });
  } catch (error) {
    res.json({
      success: true,
      plans: Object.values(SEED_PLANS),
    });
  }
});

/**
 * GET /api/admin/entitlements/features
 * Lista features cadastradas
 */
adminEntitlementsRouter.get("/features", async (_req: Request, res: Response) => {
  try {
    const db = getAdminDb();
    const snap = await db.collection("features").get();
    const features = snap.docs.map((d) => d.data());
    res.json({
      success: true,
      features: features.length > 0 ? features : Object.values(SEED_FEATURES),
    });
  } catch (error) {
    res.json({
      success: true,
      features: Object.values(SEED_FEATURES),
    });
  }
});

/**
 * POST /api/admin/entitlements/overrides
 * Concede ou revoga override individual para um usuário
 */
adminEntitlementsRouter.post("/overrides", async (req: Request, res: Response) => {
  try {
    const { userId, featureId, enabled, limitValue, expiresAt } = req.body;

    if (!userId || !featureId || enabled === undefined) {
      res.status(400).json({ error: "MISSING_FIELDS", message: "Campos obrigatórios ausentes." });
      return;
    }

    const db = getAdminDb();
    const overrideId = `${userId}_${featureId}`;
    const nowIso = new Date().toISOString();

    const docData = {
      id: overrideId,
      user_id: userId,
      feature_id: featureId,
      enabled: Boolean(enabled),
      limit_value: limitValue !== undefined ? limitValue : null,
      expires_at: expiresAt || null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    await db.collection("user_feature_overrides").doc(overrideId).set(docData, { merge: true });

    res.json({
      success: true,
      override: docData,
    });
  } catch (error: any) {
    console.error("[AdminEntitlementsRouter] Error saving override:", error);
    res.status(500).json({ error: "OVERRIDE_SAVE_ERROR", message: "Falha ao salvar override." });
  }
});
