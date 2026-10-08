/**
 * Porteiro das rotas antigas do Gemini (/api/gemini/*, do app antigo): a chave do Gemini do servidor é só para a criação
 * de conteúdo, então só entra o administrador do app novo. É a mesma conferência da Central de IAs (server/ai/router.ts):
 * o token do pedido diz quem é (authenticate) e o banco diz se é administrador (app_ch_whoami).
 *
 *   sem a Central configurada neste servidor  503  { error: "Recurso indisponível neste servidor." }
 *   sem login válido                          401  { error: "Entre na sua conta." }
 *   logado, mas não administrador             403  { error: "Acesso restrito a administradores." }
 *   erro de permissão ao conferir             403  (mesmo texto)
 *   qualquer outro erro ao conferir           500  { error: "Não foi possível conferir o acesso." }
 *   administrador                             segue para a rota (next)
 *
 * Na dúvida, recusa: a rota só roda depois da confirmação, nunca por causa de um erro.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ContentDb } from "../contentHub/infra";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** Mesma regra de server/ai/router.ts para reconhecer erro de permissão (inclui o código 42501 do Postgres). */
const forbidden = (error: unknown) => /restrito|sem acesso|administrador|42501|Acesso/i.test(message(error));
const refuse = (res: Response, status: number, error: string) => {
  res.status(status).json({ error });
};

export function requireAdmin(deps: { db: ContentDb } | null): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!deps) return refuse(res, 503, "Recurso indisponível neste servidor.");
    try {
      const user = await deps.db.authenticate(req);
      if (!user) return refuse(res, 401, "Entre na sua conta.");
      const me = await deps.db.asUser<{ admin: boolean; staff: boolean } | null>(user, "app_ch_whoami");
      if (me?.admin !== true) return refuse(res, 403, "Acesso restrito a administradores.");
    } catch (error) {
      return forbidden(error) ? refuse(res, 403, "Acesso restrito a administradores.") : refuse(res, 500, "Não foi possível conferir o acesso.");
    }
    next();
  };
}
