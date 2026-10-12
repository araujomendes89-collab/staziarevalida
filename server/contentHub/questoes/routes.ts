/**
 * Rotas /api/content-hub/questoes-staziamed/*: a estimativa de custo (antes de gastar) e o enfileiramento de Gerar, Conferir e
 * Buscar fonte oficial. Tudo da equipe (administrador ou editor); nenhuma rota aprova ou publica. O trabalho em si roda na fila
 * (`question_generate`, `question_check`, `question_source`), onde a fila já roda (Cloud Run em produção, o servidor no desenvolvimento).
 */
import type { Request, Response, Router } from "express";
import { functionChecks, loadAiConfig, type AiFunctionKey } from "../../ai/config";
import type { Identity } from "../infra";
import type { DraftRow } from "../draftChecks";
import type { PipelineDeps } from "../pipeline";
import { estimateChecks, estimateGeneration, estimateSource, type Estimate } from "./estimate";
import { sourceClaims } from "./source";

type Authed = Request & { user?: Identity };
type AsUser = <T>(req: Authed, fn: string, args?: Record<string, unknown>) => Promise<T>;

const NO_ACERVO = "Cadastre fontes oficiais na Central de Conteúdo";
const NO_DECISION = "Preencha a decisão clínica central";
const NOT_STAFF = "Gerar, conferir e buscar fonte é da equipe (administrador ou editor).";
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const UUID = /^[0-9a-f-]{36}$/i;

export function mountQuestoesStaziaMed(router: Router, deps: PipelineDeps, asUser: AsUser): void {
  const base = "/questoes-staziamed";
  const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
  /** Erros do banco viram o código HTTP certo (a frase vai como está, em português). */
  const dbError = (res: Response, error: unknown) => {
    const m = message(error);
    if (/é da equipe|restrito|42501/i.test(m)) return fail(res, 403, m.includes("é da equipe") ? NOT_STAFF : m);
    if (m.startsWith(NO_ACERVO) || /já está na fila/i.test(m)) return fail(res, 409, m);
    return fail(res, 400, m);
  };
  const staff = async (req: Authed) => {
    const me = await asUser<{ staff: boolean } | null>(req, "app_ch_whoami");
    return Boolean(me?.staff);
  };
  const acervo = async () => Number(await deps.db.service<number>("ch_worker_staziamed_acervo"));

  /** O que ainda falta para a IA rodar (função desligada, sem modelo...), nas palavras da Central de IAs. */
  async function pendencias(fns: AiFunctionKey[]) {
    if (deps.ai.status.isMock) return [] as string[];
    const cfg = await loadAiConfig(deps.db);
    const checks = functionChecks(cfg, process.env);
    return fns.flatMap((fn) => (checks[fn].ready ? [] : checks[fn].problems.length ? checks[fn].problems : [`Função ${fn} sem IA pronta na Central de IAs.`]));
  }
  const teto = async () => {
    const s = (await loadAiConfig(deps.db)).settings;
    return { ligado: s.caps_enabled, mensal: s.monthly_cap_usd, por_execucao: s.per_run_cap_usd };
  };

  router.post(`${base}/estimativa`, async (req: Authed, res) => {
    try {
      if (!(await staff(req))) return fail(res, 403, NOT_STAFF);
      const b = (req.body ?? {}) as { acao?: string; quantidade?: number; rascunhos?: string[]; filtro?: object; rascunho?: string };
      const cfg = await loadAiConfig(deps.db);
      const n = await acervo();
      let estimate: Estimate;
      let extra: Record<string, unknown> = {};
      let ia: AiFunctionKey[];
      if (b.acao === "gerar") {
        const q = Number(b.quantidade);
        if (!Number.isInteger(q) || q < 1 || q > 20) return fail(res, 400, "Escolha de 1 a 20 questões.");
        if (n === 0) return fail(res, 409, NO_ACERVO);
        estimate = estimateGeneration(cfg, q);
        ia = ["criacao", "verificacao"];
      } else if (b.acao === "conferir") {
        const ids = Array.isArray(b.rascunhos) ? b.rascunhos.filter((x) => UUID.test(String(x))) : await asUser<string[]>(req, "app_staziamed_pending_checks", { p_filters: b.filtro ?? {} });
        estimate = estimateChecks(cfg, ids.length);
        extra = { rascunhos: ids };
        ia = ["verificacao"];
      } else if (b.acao === "fonte") {
        if (!UUID.test(String(b.rascunho))) return fail(res, 400, "Rascunho inválido.");
        const d = await deps.db.service<DraftRow | null>("ch_worker_draft_for_job", { p_draft_id: b.rascunho });
        if (!d) return fail(res, 404, "Questão não encontrada.");
        if (!String(d.clinical_decision ?? "").trim()) return fail(res, 400, NO_DECISION);
        if (n === 0) return fail(res, 409, NO_ACERVO);
        estimate = estimateSource(cfg, sourceClaims(d).length);
        ia = ["verificacao"];
      } else {
        return fail(res, 400, "Ação inválida: use gerar, conferir ou fonte.");
      }
      res.json({ ...estimate, acervo: n, ia_pendente: await pendencias(ia), teto: await teto(), ...extra });
    } catch (error) {
      dbError(res, error);
    }
  });

  router.post(`${base}/pedidos`, async (req: Authed, res) => {
    try {
      if (!(await staff(req))) return fail(res, 403, NOT_STAFF);
      const b = (req.body ?? {}) as { modo?: string; area?: string | null; tema?: string | null; quantidade?: number };
      const q = Number(b.quantidade);
      if (!Number.isInteger(q) || q < 1 || q > 20) return fail(res, 400, "Escolha de 1 a 20 questões.");
      if ((await acervo()) === 0) return fail(res, 409, NO_ACERVO);
      const estimate = { ...estimateGeneration(await loadAiConfig(deps.db), q), calculado_em: new Date().toISOString() };
      const pedido = await asUser<unknown>(req, "app_staziamed_request_create", { p_mode: b.modo, p_area: b.area ?? null, p_topic: b.tema ?? null, p_count: q, p_estimate: estimate });
      res.status(201).json(pedido);
    } catch (error) {
      dbError(res, error);
    }
  });

  router.post(`${base}/conferir`, async (req: Authed, res) => {
    try {
      if (!(await staff(req))) return fail(res, 403, NOT_STAFF);
      const b = (req.body ?? {}) as { rascunhos?: string[]; filtro?: object };
      const ids = Array.isArray(b.rascunhos) ? b.rascunhos.filter((x) => UUID.test(String(x))) : await asUser<string[]>(req, "app_staziamed_pending_checks", { p_filters: b.filtro ?? {} });
      if (!ids.length) return res.json({ na_fila: 0, ja_na_fila: 0 });
      const estimate = estimateChecks(await loadAiConfig(deps.db), ids.length);
      res.json(await asUser<unknown>(req, "app_staziamed_check_enqueue", { p_draft_ids: ids, p_estimate: estimate }));
    } catch (error) {
      dbError(res, error);
    }
  });

  router.post(`${base}/rascunhos/:id/buscar-fonte`, async (req: Authed, res) => {
    try {
      if (!(await staff(req))) return fail(res, 403, NOT_STAFF);
      const id = String(req.params.id);
      if (!UUID.test(id)) return fail(res, 400, "Rascunho inválido.");
      const d = await deps.db.service<DraftRow | null>("ch_worker_draft_for_job", { p_draft_id: id });
      const estimate = d ? estimateSource(await loadAiConfig(deps.db), sourceClaims(d).length) : {};
      res.json(await asUser<unknown>(req, "app_staziamed_source_enqueue", { p_draft_id: id, p_estimate: estimate }));
    } catch (error) {
      dbError(res, error);
    }
  });
}
