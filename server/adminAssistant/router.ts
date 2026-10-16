/**
 * Rotas /api/admin-assistant: assistente de IA das abas da Administração (especificação §6.1).
 *  - GET  /status?tab=  a IA de cada modo, pela configuração da Central de IAs (sem rede, sem gasto);
 *  - POST /run          Preencher, Conferir ou Conversar, com a permissão conferida ANTES de qualquer gasto.
 * O navegador manda só o token da pessoa; chaves e modelo ficam no servidor. A rota não grava nada: o único registro é o
 * `ai_calls` que o maestro já faz. Material e texto gerado não são guardados.
 */
import express, { type NextFunction, type Request, type Response } from "express";
import type { Identity } from "../contentHub/infra";
import { fetchLink, type ExtractedPage } from "../podcasts/extract";
import type { AssistForm, AssistMode, AssistTab } from "../../src/shared/adminAssistant/types";
import { ASSIST_ERRORS } from "../../src/shared/adminAssistant/errors";
import { assistantStatus, runAssistant, type AssistMaterial, type EngineDeps } from "./engine";
import { httpError, type TabAdapter, type Whoami } from "./types";
import { ADAPTERS } from "./adapters";
import { shown } from "../auth/friendlyError";

export interface AdminAssistantDeps extends EngineDeps {
  /** Testes: links sem rede e endereço conferido por um falso. */
  fetchImpl?: typeof fetch;
  checkHost?: (host: string) => Promise<void>;
}

const MODES: AssistMode[] = ["preencher", "conferir", "conversar"];
const MAX_FORM = 100_000;
const MAX_MESSAGE = 1000;
const MAX_PAGES = 3000;
const MIN_MATERIAL = 80;
const MAX_MATERIAL = 400_000;
const MAX_URL = 2000;

type Authed = Request & { user?: Identity };
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const forbidden = (error: unknown) => /restrito|sem acesso|administrador|42501|Acesso/i.test(message(error));

/**
 * A resposta de um erro (Q13). O que vem de `httpError` (tem código) é texto nosso, em português, para a tela. Qualquer outro erro é
 * imprevisto (banco, rede, defeito) e traz texto técnico, muitas vezes em inglês: o detalhe vai para o registro do servidor e a tela
 * recebe a frase padrão.
 */
function failFrom(res: Response, error: unknown, log?: (m: string) => void) {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number") return fail(res, status, shown(error));
  if (forbidden(error)) return fail(res, 403, shown(error));
  log?.(`[assistente] erro inesperado: ${message(error)}`.slice(0, 300));
  return fail(res, 500, ASSIST_ERRORS.failed);
}

/** O que `fetchLink` escreve de propósito, em português; qualquer outro erro (rede, tempo esgotado, PDF quebrado) é técnico (Q13). */
const LINK_OWN = /^(Só links https|O link |O conteúdo do link|Endereço interno|O arquivo não é)/;
function linkMessage(error: unknown, log?: (m: string) => void) {
  const text = message(error);
  if (LINK_OWN.test(text)) return text;
  log?.(`[assistente] link não lido: ${text}`.slice(0, 300));
  return ASSIST_ERRORS.link;
}

const adapterFor = (tab: unknown): TabAdapter => {
  const adapter = typeof tab === "string" && Object.hasOwn(ADAPTERS, tab) ? ADAPTERS[tab as AssistTab] : undefined;
  if (!adapter) throw httpError(400, "Aba sem assistente.");
  return adapter;
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Material do pedido (texto, PDF lido no navegador ou link https), conferido por tamanho; ausente = null. */
export async function readMaterial(raw: unknown, adapter: TabAdapter, deps: AdminAssistantDeps): Promise<AssistMaterial | null> {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) throw httpError(400, "Material inválido: texto, PDF (texto por página) ou link.");
  const notes = adapter.material === "notas";
  let pages: ExtractedPage[];
  let origin: AssistMaterial["origin"];
  let url: string | null = null;
  if (!notes && Array.isArray(raw.pages)) {
    if (raw.pages.length > MAX_PAGES) throw httpError(413, "Material longo demais: até 3.000 páginas.");
    pages = raw.pages.map((p: unknown) => {
      const rec = isRecord(p) ? p : {};
      const n = Number(rec.page);
      return { page: Number.isFinite(n) && n > 0 ? Math.floor(n) : null, text: typeof rec.text === "string" ? rec.text : "" };
    });
    origin = "pdf";
  } else if (typeof raw.text === "string") {
    pages = [{ page: null, text: raw.text }];
    origin = notes ? "notas" : "texto";
  } else if (!notes && typeof raw.url === "string") {
    const link = raw.url.trim();
    if (link.length > MAX_URL || !/^https:\/\/\S+$/.test(link)) throw httpError(400, "Use um link https.");
    try {
      pages = (await fetchLink(link, deps.fetchImpl ?? fetch, deps.checkHost)).pages;
    } catch (error) {
      throw httpError(422, linkMessage(error, deps.log));
    }
    origin = "link";
    url = link;
  } else {
    throw httpError(400, "Material inválido: texto, PDF (texto por página) ou link.");
  }
  const chars = pages.reduce((n, p) => n + p.text.length, 0);
  const useful = pages.reduce((n, p) => n + p.text.trim().length, 0);
  if (useful < MIN_MATERIAL) throw httpError(422, notes ? "Suas notas precisam de pelo menos 80 caracteres." : "O material não tem texto aproveitável (PDF escaneado?). Cole o texto.");
  if (chars > MAX_MATERIAL) throw httpError(413, "Material longo demais: até 400 mil caracteres.");
  return { pages, origin, url };
}

export function createAdminAssistantRouter(deps: AdminAssistantDeps | null, pending: string | null = null) {
  const router = express.Router();

  router.use(async (req: Authed, res: Response, next: NextFunction) => {
    if (!deps) return fail(res, 503, pending ?? "Assistente sem servidor configurado.");
    try {
      const user = await deps.db.authenticate(req);
      if (!user) return fail(res, 401, "Entre na sua conta.");
      req.user = user;
      next();
    } catch (error) {
      deps?.log?.(`[assistente] não foi possível entrar na conta: ${message(error)}`.slice(0, 300));
      fail(res, 500, ASSIST_ERRORS.failed);
    }
  });

  const whoami = async (req: Authed): Promise<Whoami> => {
    const me = await deps!.db.asUser<Whoami | null>(req.user!, "app_ch_whoami");
    if (!me) throw httpError(403, "Acesso restrito.");
    return { admin: !!me.admin, staff: !!me.staff, reviewer_areas: Array.isArray(me.reviewer_areas) ? me.reviewer_areas : [] };
  };

  router.get("/status", async (req: Authed, res) => {
    try {
      const adapter = adapterFor(req.query.tab);
      if (!adapter.allowTab(await whoami(req))) throw httpError(403, "Acesso restrito.");
      res.json(await assistantStatus(deps!, adapter.tab, req.user!.id));
    } catch (error) {
      failFrom(res, error, deps?.log);
    }
  });

  router.post("/run", async (req: Authed, res) => {
    try {
      const body = isRecord(req.body) ? req.body : {};
      const adapter = adapterFor(body.tab);
      if (!MODES.includes(body.mode as AssistMode)) throw httpError(400, "Modo inválido.");
      if (!isRecord(body.form)) throw httpError(400, "Envie o formulário.");
      if (JSON.stringify(body.form).length > MAX_FORM) throw httpError(413, "Formulário grande demais: até 100 mil caracteres.");
      if (body.message !== undefined && body.message !== null && (typeof body.message !== "string" || body.message.length > MAX_MESSAGE))
        throw httpError(400, "Pedido longo demais: até 1.000 caracteres.");
      const form = body.form as AssistForm;
      // permissão antes de qualquer gasto
      const me = await whoami(req);
      const { stored } = await adapter.allow(me, form, { asUser: (fn, args) => deps!.db.asUser(req.user!, fn, args ?? {}) });
      const material = await readMaterial(body.material, adapter, deps!);
      const result = await runAssistant(deps!, {
        adapter,
        mode: body.mode as AssistMode,
        form,
        stored,
        fields: Array.isArray(body.fields) ? body.fields.map(String) : null,
        field: typeof body.field === "string" ? body.field : null,
        message: typeof body.message === "string" ? body.message : null,
        material,
        actorId: req.user!.id,
      });
      res.json(result);
    } catch (error) {
      failFrom(res, error, deps?.log);
    }
  });

  return router;
}
