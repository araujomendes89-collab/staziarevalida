/**
 * Rotas /api/ai-central (Central de IAs; o prefixo /api/ai é do app antigo). Só a equipe entra; só o administrador
 * grava. As gravações passam pelas funções ch_worker_ai_* (que conferem de novo se o ator é administrador). Nenhuma
 * resposta traz chaves nem variáveis de ambiente.
 *
 *   GET  /overview                      painel completo + checks (situação de cada função) + provider_checks
 *                                       ({ pending, blocks } por IA: Ollama fora do Mac bloqueia; chave ausente neste
 *                                       servidor é só aviso)  (administrador)
 *   GET  /summary                       resumo para a equipe
 *   POST /providers/:id/enabled         { enabled }  liga ou desliga uma IA
 *   POST /providers/:id/refresh         atualiza a lista de modelos e cadastra preços do seed que faltarem
 *   PUT  /functions/:key                { config: FunctionConfig | null }  modo, IAs e cuidado de uma função (recusa
 *                                       o que este servidor não chama: Ollama no site publicado)
 *   PUT  /settings                      { monthly_cap_usd, per_run_cap_usd, caps_enabled, tab_override_enabled }
 *   PUT  /prices/:provider/:model       { input_per_mtok, output_per_mtok, source_url }
 */
import express, { type NextFunction, type Request, type Response } from "express";
import type { ContentDb, Identity } from "../contentHub/infra";
import { listModels } from "./models";
import { PRICE_SEED } from "./prices";
import { capGuidance, FUNCTION_KEYS, functionChecks, invalidateAiConfig, isProviderId, loadAiConfig, providerChecks, providerPending, validateFunctionConfig, type AiFunctionKey, type FunctionConfig, type ModelRef } from "./config";

type Authed = Request & { user?: Identity; admin?: boolean };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const forbidden = (error: unknown) => /restrito|sem acesso|administrador|42501|Acesso/i.test(message(error));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isRef = (v: any): v is ModelRef => !!v && typeof v === "object" && isProviderId(v.provider) && typeof v.model === "string" && v.model.trim().length > 0 && v.model.length <= 120;
const refOf = (v: ModelRef): ModelRef => ({ provider: v.provider, model: v.model.trim() });
const bad = (msg: string) => new Error(msg);

export function createAiRouter(
  deps: { db: ContentDb } | null,
  opts: { pending?: string | null; fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
) {
  const router = express.Router();
  const env = opts.env ?? process.env;

  router.use(async (req: Authed, res: Response, next: NextFunction) => {
    if (!deps) return res.status(503).json({ error: opts.pending ?? "Central de IAs não configurada no servidor." });
    try {
      const user = await deps.db.authenticate(req);
      if (!user) return res.status(401).json({ error: "Entre na sua conta." });
      req.user = user;
      const me = await deps.db.asUser<{ admin: boolean; staff: boolean } | null>(user, "app_ch_whoami");
      if (!me?.staff) return res.status(403).json({ error: "Central de IAs: acesso restrito à equipe." });
      req.admin = me.admin === true;
      if (!req.admin && !(req.method === "GET" && req.path === "/summary")) {
        return res.status(403).json({ error: "Central de IAs: acesso restrito a administradores." });
      }
      next();
    } catch (error) {
      res.status(forbidden(error) ? 403 : 500).json({ error: message(error) });
    }
  });

  const fail = (res: Response, error: unknown) => {
    res.status(forbidden(error) ? 403 : 400).json({ error: message(error) });
  };
  const db = () => deps!.db;
  const json = express.json({ limit: "64kb" });
  const body = (req: Request) => (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, any>;
  const fresh = async () => {
    invalidateAiConfig(db());
    return loadAiConfig(db());
  };
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  router.get("/overview", async (req: Authed, res) => {
    try {
      const overview = await db().asUser<Record<string, unknown>>(req.user!, "app_admin_ai_overview");
      const cfg = await fresh();
      // gasto do mês de tudo o que já fica registrado fora do maestro (IA02, só leitura). Banco sem a migração 9520 (ainda não colada
      // no Supabase): o painel de sempre continua e o gasto de tudo vem como indisponível
      let groups: unknown[] | null = null;
      let monthStart: string | null = null;
      try {
        const spend = await db().asUser<{ month_start: string; groups: unknown[] }>(req.user!, "app_admin_ai_spend_month");
        groups = Array.isArray(spend?.groups) ? spend.groups : null;
        monthStart = spend?.month_start ?? null;
      } catch (error) {
        console.warn(`[central] gasto do mês de tudo indisponível: ${message(error).slice(0, 120)}`);
      }
      // usos que não gravam o gasto em lugar nenhum: aparecem como "sem registro", nunca com número inventado
      const noRecord = [
        { key: "rotas_antigas", note: "O contador das rotas antigas de IA fica só na memória do servidor e some quando ele reinicia." },
        { key: "perguntas_busca", note: "Cada pergunta da busca por significado custa frações de centavo e não é registrada." },
      ];
      res.json({
        ...overview,
        checks: functionChecks(cfg, env),
        provider_checks: providerChecks(cfg, env),
        cap_guidance: capGuidance(cfg, env),
        all_spend: { available: groups !== null, month_start: monthStart, groups: groups ?? [], no_record: noRecord },
      });
    } catch (error) {
      fail(res, error);
    }
  });

  router.get("/summary", async (req: Authed, res) => {
    try {
      res.json(await db().asUser(req.user!, "app_ai_summary"));
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/providers/:id/enabled", json, async (req: Authed, res) => {
    try {
      const id = req.params.id;
      if (!isProviderId(id)) throw bad("IA desconhecida.");
      const { enabled } = body(req);
      if (typeof enabled !== "boolean") throw bad("Informe ligar ou desligar.");
      const out = await db().service("ch_worker_ai_set_provider", { p_actor: req.user!.id, p_provider: id, p_enabled: enabled });
      invalidateAiConfig(db());
      res.json(out);
    } catch (error) {
      fail(res, error);
    }
  });

  router.post("/providers/:id/refresh", async (req: Authed, res) => {
    try {
      const id = req.params.id;
      if (!isProviderId(id)) throw bad("IA desconhecida.");
      const list = await listModels(id, env, opts.fetchImpl ?? fetch);
      const ok = list.status === "pronta";
      await db().service("ch_worker_ai_store_models", { p_provider: id, p_models: ok ? list.models : null, p_status: list.status, p_detail: list.detail });
      let added = 0;
      if (ok) {
        const cfg = await fresh();
        const listed = new Set(list.models.map((m) => m.id));
        for (const seed of PRICE_SEED) {
          if (seed.provider !== id || !listed.has(seed.model) || cfg.prices.some((p) => p.provider === id && p.model === seed.model)) continue;
          await db().service("ch_worker_ai_save_price", {
            p_actor: req.user!.id,
            p_provider: id,
            p_model: seed.model,
            p_price: { input_per_mtok: seed.input_per_mtok, output_per_mtok: seed.output_per_mtok, source_url: seed.source_url, checked_on: seed.checked_on },
          });
          added++;
        }
      }
      invalidateAiConfig(db());
      res.json({ status: list.status, detail: list.detail, models: list.models, prices_added: added });
    } catch (error) {
      fail(res, error);
    }
  });

  router.put("/functions/:key", json, async (req: Authed, res) => {
    try {
      const key = req.params.key as AiFunctionKey;
      if (!FUNCTION_KEYS.includes(key)) return res.status(404).json({ error: "Função desconhecida." });
      const raw = body(req).config;
      if (raw === undefined) throw bad("Informe a configuração da função.");
      if (raw === null) {
        await db().service("ch_worker_ai_save_function", { p_actor: req.user!.id, p_key: key, p_config: null });
        invalidateAiConfig(db());
        return res.json({ ok: true, warnings: [] });
      }
      if (typeof raw !== "object" || Array.isArray(raw)) throw bad("Configuração inválida.");
      if (!["sozinha", "linha", "comite"].includes(raw.mode)) throw bad("Escolha o modo da função.");
      const care = raw.care ?? "caprichado";
      if (care !== "rapido" && care !== "caprichado") throw bad("Cuidado inválido.");
      const primary = raw.primary ?? null;
      const fallback = raw.fallback ?? null;
      const reviewers = raw.reviewers ?? [];
      if (primary !== null && !isRef(primary)) throw bad("IA ou modelo principal inválido.");
      if (fallback !== null && !isRef(fallback)) throw bad("IA ou modelo da reserva inválido.");
      if (!Array.isArray(reviewers) || !reviewers.every(isRef)) throw bad("IA ou modelo de conferente inválido.");
      const config: FunctionConfig = {
        key,
        mode: raw.mode,
        care,
        primary: primary && refOf(primary),
        fallback: fallback && refOf(fallback),
        reviewers: reviewers.map(refOf),
      };
      const cfg = await fresh();
      // ao salvar, o modelo pago sem preço é problema, com ou sem tetos (IA09); o que já está salvo e rodando só avisa
      const { problems, warnings } = validateFunctionConfig(config, cfg, { requirePrice: true });
      // IA que este servidor não consegue chamar (Ollama no site publicado ou sem resposta) não pode ser escolhida
      for (const ref of [config.primary, config.fallback, ...config.reviewers]) {
        const why = ref && providerPending(ref, cfg, env);
        if (why && !problems.includes(why)) problems.push(why);
      }
      if (problems.length) return res.status(400).json({ error: "A função tem problemas: " + problems.join(" "), problems, warnings });
      await db().service("ch_worker_ai_save_function", {
        p_actor: req.user!.id,
        p_key: key,
        p_config: { mode: config.mode, primary_ref: config.primary, fallback_ref: config.fallback, reviewers: config.reviewers, care },
      });
      invalidateAiConfig(db());
      res.json({ ok: true, warnings });
    } catch (error) {
      fail(res, error);
    }
  });

  router.put("/settings", json, async (req: Authed, res) => {
    try {
      const b = body(req);
      const patch: Record<string, number | boolean | null> = {};
      for (const k of ["monthly_cap_usd", "per_run_cap_usd"]) {
        if (!(k in b)) continue;
        if (b[k] !== null && !isNum(b[k])) throw bad("Os tetos precisam ser números maiores ou iguais a zero, ou vazios.");
        patch[k] = b[k];
      }
      for (const k of ["caps_enabled", "tab_override_enabled"]) {
        if (!(k in b)) continue;
        if (typeof b[k] !== "boolean") throw bad("Ligado ou desligado precisa ser verdadeiro ou falso.");
        patch[k] = b[k];
      }
      const cur = (await fresh()).settings;
      const eff = { ...cur, ...patch } as typeof cur;
      if (eff.caps_enabled && (eff.monthly_cap_usd === null || eff.per_run_cap_usd === null)) throw bad("Para ligar os tetos, preencha o teto mensal e o teto por chamada.");
      const out = await db().service("ch_worker_ai_save_settings", { p_actor: req.user!.id, p_settings: patch });
      invalidateAiConfig(db());
      res.json(out);
    } catch (error) {
      fail(res, error);
    }
  });

  router.put("/prices/:provider/:model", json, async (req: Authed, res) => {
    try {
      const { provider, model } = req.params;
      if (!isProviderId(provider)) throw bad("IA desconhecida.");
      if (!model || model.length < 1 || model.length > 120) throw bad("Modelo inválido.");
      const b = body(req);
      if (!isNum(b.input_per_mtok) || !isNum(b.output_per_mtok)) throw bad("Os preços precisam ser números maiores ou iguais a zero.");
      if (b.source_url != null && typeof b.source_url !== "string") throw bad("Fonte inválida.");
      const url = typeof b.source_url === "string" ? b.source_url.trim() : "";
      if (url && !url.startsWith("https://")) throw bad("A fonte precisa começar com https://.");
      const out = await db().service("ch_worker_ai_save_price", {
        p_actor: req.user!.id,
        p_provider: provider,
        p_model: model,
        p_price: { input_per_mtok: b.input_per_mtok, output_per_mtok: b.output_per_mtok, source_url: url || null, checked_on: today() },
      });
      invalidateAiConfig(db());
      res.json(out);
    } catch (error) {
      fail(res, error);
    }
  });

  return router;
}
