/**
 * Rotas /api/content-hub/doc-imagens — imagens do editor profissional (módulo M11a: guarda). Depósito PRIVADO "doc-imagens";
 * o navegador nunca recebe o caminho do depósito.
 *
 *   GET  /aluno/:id                  qualquer pessoa LOGADA: bytes só se a imagem está numa aula PUBLICADA (senão 404 genérico)
 *   POST /                           equipe: envia (corpo bruto até 4 MB; X-File-Name e X-Texto-Alternativo com encodeURIComponent;
 *                                    ?unidade=<ch_units.id>&aula=<lessons.id>&substitui=<id da imagem>) → 201 { imagem } (200 se repetida)
 *   GET  /                           equipe: galeria (?unidade, aula, busca, arquivadas=1, todas_versoes=1, limite, pagina) → { itens, total }
 *   POST /links       { ids }        equipe ou revisor médico: endereços assinados de 5 min ({ links: { id: url|null } }; null no banco local)
 *   GET  /:id                        equipe: detalhe, versões e histórico
 *   GET  /:id/link                   equipe ou revisor: { url } assinado de 5 min (null no banco local → use /:id/arquivo)
 *   GET  /:id/arquivo                equipe ou revisor: bytes (sem cache)
 *   PUT  /:id/texto-alternativo { texto }   equipe
 *   POST /:id/arquivar { arquivar }          equipe (arquivada some da galeria; aula publicada que usa continua mostrando)
 */
import path from "path";
import express, { type NextFunction, type Request, type Response } from "express";
import { ACCESS_CHECK_FAILED, shown } from "../../auth/friendlyError";
import { localStorageDir, supabaseStorage, type Identity, type Storage } from "../infra";
import type { PipelineDeps } from "../pipeline";
import { ID_IMAGEM, MAX_ENVIO_BYTES } from "../../../src/shared/docImagens";
import { ErroImagem, guardarImagem, lerBytesImagem } from "./servico";
import { criarProcessadorChromium, type ProcessadorImagem } from "./processador";

export const DOC_IMAGENS_BUCKET = "doc-imagens";

type Authed = Request & { user?: Identity };

const MSG_EQUIPE = "Imagens do editor: acesso restrito à equipe (administrador ou editor).";

function handleDbError(res: Response, error: unknown) {
  if ((error as { status?: number })?.status === 500) return res.status(500).json({ error: ACCESS_CHECK_FAILED });
  if (error instanceof ErroImagem) {
    return res.status(error.status).json({ error: error.message });
  }
  const msg = error instanceof Error ? error.message : String(error);
  if (/42501|restrito|sem acesso/i.test(msg)) {
    return res.status(403).json({ error: shown(error) });
  }
  if (/P0002|não encontrad/i.test(msg)) {
    return res.status(404).json({ error: shown(error) });
  }
  return res.status(400).json({ error: shown(error) });
}

export function createDocImagensRouter(
  deps: PipelineDeps | null,
  opts: {
    pending?: string | null;
    storage?: Storage;
    processador?: ProcessadorImagem | null | "auto";
  } = {}
) {
  const router = express.Router();

  let storage: Storage | null = opts.storage ?? null;
  const getStorage = (): Storage => {
    if (!storage) {
      if (deps?.db.mode === "supabase") {
        storage = supabaseStorage(DOC_IMAGENS_BUCKET);
      } else {
        const baseDir =
          process.env.CONTENT_HUB_STORAGE_DIR || path.join(process.cwd(), ".data/content-hub");
        storage = localStorageDir(path.join(baseDir, "doc-imagens"));
      }
    }
    return storage;
  };

  let processadorPromise: Promise<ProcessadorImagem | null> | null = null;
  const getProcessador = async (): Promise<ProcessadorImagem | null> => {
    if (opts.processador !== undefined && opts.processador !== "auto") {
      return opts.processador;
    }
    if (!processadorPromise) {
      processadorPromise = criarProcessadorChromium();
    }
    return processadorPromise;
  };

  // Middleware de autenticação para todas as rotas
  router.use(async (req: Authed, res: Response, next: NextFunction) => {
    if (!deps) {
      return res.status(503).json({
        error: opts.pending ?? "Central de Conteúdo não configurada no servidor.",
      });
    }
    try {
      const user = await deps.db.authenticate(req);
      if (!user) {
        return res.status(401).json({ error: "Entre na sua conta." });
      }
      req.user = user;
      next();
    } catch {
      res.status(500).json({ error: ACCESS_CHECK_FAILED });
    }
  });

  const papel = async (req: Authed): Promise<{ equipe: boolean; revisor: boolean }> => {
    try {
      const me = await deps!.db.asUser<{ staff: boolean; reviewer_areas?: string[] } | null>(
        req.user!,
        "app_ch_whoami"
      );
      const staff = Boolean(me?.staff);
      const areas = Array.isArray(me?.reviewer_areas) ? me.reviewer_areas : [];
      return {
        equipe: staff,
        revisor: areas.length > 0,
      };
    } catch (error) {
      // falha ao conferir o papel não vira "sem acesso": a pessoa vê que foi um problema passageiro
      throw Object.assign(new Error(ACCESS_CHECK_FAILED), { status: 500, cause: error });
    }
  };

  const jsonParser = express.json({ limit: "64kb" });
  const rawParser = express.raw({ type: () => true, limit: MAX_ENVIO_BYTES });

  // 1. GET /aluno/:id — qualquer pessoa logada (sem consulta de papel)
  router.get("/aluno/:id", async (req: Authed, res: Response) => {
    const { id } = req.params;
    if (!ID_IMAGEM.test(id)) {
      return res.status(400).json({ error: "Imagem inválida." });
    }
    try {
      const file = await lerBytesImagem(
        { db: deps!.db, storage: getStorage() },
        { aluno: true },
        id
      );
      res.setHeader("Content-Type", file.mime);
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.send(file.data);
    } catch {
      // Qualquer falha na leitura da imagem devolve 404 genérico para não expor existência
      res.status(404).json({ error: "Imagem indisponível." });
    }
  });

  // 2. POST / — equipe envia imagem
  router.post(
    "/",
    // só a equipe chega a ler o corpo (até 4 MB): o papel é conferido antes
    async (req: Authed, res: Response, next: NextFunction) => {
      try {
        if (!(await papel(req)).equipe) return res.status(403).json({ error: MSG_EQUIPE });
        next();
      } catch (error) {
        handleDbError(res, error);
      }
    },
    (req: Request, res: Response, next: NextFunction) => {
      rawParser(req, res, (err) => {
        if (err) {
          if ((err as any)?.type === "entity.too.large") {
            return res.status(413).json({ error: "Imagem acima de 4 MB: o editor reduz antes de enviar." });
          }
          return res.status(400).json({ error: "Não foi possível ler a imagem enviada. Tente de novo." });
        }
        next();
      });
    },
    async (req: Authed, res: Response) => {
      try {
        let nome: string | null = null;
        const rawNome = req.headers["x-file-name"];
        if (rawNome && typeof rawNome === "string") {
          try {
            nome = decodeURIComponent(rawNome);
          } catch {
            nome = rawNome;
          }
        }

        let alt: string | null = null;
        const rawAlt = req.headers["x-texto-alternativo"];
        if (rawAlt && typeof rawAlt === "string") {
          try {
            alt = decodeURIComponent(rawAlt);
          } catch {
            alt = rawAlt;
          }
        }

        const unidade = typeof req.query.unidade === "string" ? req.query.unidade : null;
        const aula = typeof req.query.aula === "string" ? req.query.aula : null;
        const substitui = typeof req.query.substitui === "string" ? req.query.substitui : null;

        const proc = await getProcessador();
        const imagem = await guardarImagem(
          { db: deps!.db, storage: getStorage() },
          req.user!,
          req.body as Buffer,
          { nome, alt, unidade, aula, substitui },
          proc
        );

        const status = imagem.repetida ? 200 : 201;
        res.status(status).json({ imagem });
      } catch (error) {
        handleDbError(res, error);
      }
    }
  );

  // 3. GET / — galeria para a equipe
  router.get("/", async (req: Authed, res: Response) => {
    try {
      const p = await papel(req);
      if (!p.equipe) {
        return res.status(403).json({ error: MSG_EQUIPE });
      }

      for (const k of ["unidade", "aula"] as const)
        if (req.query[k] && !ID_IMAGEM.test(String(req.query[k]))) return res.status(400).json({ error: k === "unidade" ? "Unidade inválida." : "Aula inválida." });
      const p_filtro: Record<string, unknown> = {};
      if (req.query.unidade) p_filtro.unit_id = String(req.query.unidade);
      if (req.query.aula) p_filtro.lesson_id = String(req.query.aula);
      if (req.query.busca) p_filtro.busca = String(req.query.busca);
      if (req.query.arquivadas === "1" || req.query.arquivadas === "true") p_filtro.arquivadas = true;
      if (req.query.todas_versoes === "1" || req.query.todas_versoes === "true") p_filtro.todas_versoes = true;
      if (req.query.limite) p_filtro.limite = Number(req.query.limite);
      if (req.query.pagina) p_filtro.pagina = Number(req.query.pagina);

      const dados = await deps!.db.asUser(req.user!, "app_ch_doc_imagens", { p_filtro });
      res.json(dados);
    } catch (error) {
      handleDbError(res, error);
    }
  });

  // 4. POST /links — equipe ou revisor
  router.post("/links", jsonParser, async (req: Authed, res: Response) => {
    try {
      const p = await papel(req);
      if (!p.equipe && !p.revisor) {
        return res.status(403).json({ error: MSG_EQUIPE });
      }

      const ids = req.body?.ids;
      if (
        !Array.isArray(ids) ||
        ids.length < 1 ||
        ids.length > 100 ||
        !ids.every((id) => typeof id === "string" && ID_IMAGEM.test(id))
      ) {
        return res.status(400).json({ error: "Pedido de links inválido." });
      }

      const itens = await deps!.db.service<{ id: string; caminho: string; tipo: string }[]>(
        "ch_worker_doc_imagem_links",
        {
          p_actor: req.user!.id,
          p_ids: ids,
        }
      );

      const st = getStorage();
      const links: Record<string, string | null> = {};
      for (const id of ids) {
        links[id] = null;
      }

      if (Array.isArray(itens)) {
        for (const item of itens) {
          links[item.id] = st.signedUrl ? await st.signedUrl(item.caminho, 300) : null;
        }
      }

      res.json({ links, expira_em_segundos: 300 });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  // 5. GET /:id/link — equipe ou revisor
  router.get("/:id/link", async (req: Authed, res: Response) => {
    const { id } = req.params;
    if (!ID_IMAGEM.test(id)) {
      return res.status(400).json({ error: "Imagem inválida." });
    }
    try {
      const p = await papel(req);
      if (!p.equipe && !p.revisor) {
        return res.status(403).json({ error: MSG_EQUIPE });
      }

      const f = await deps!.db.service<{ caminho: string; tipo: string }>(
        "ch_worker_doc_imagem_arquivo",
        {
          p_actor: req.user!.id,
          p_id: id,
        }
      );

      const st = getStorage();
      const url = st.signedUrl ? await st.signedUrl(f.caminho, 300) : null;
      res.json({ url, expira_em_segundos: 300 });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  // 6. GET /:id/arquivo — equipe ou revisor
  router.get("/:id/arquivo", async (req: Authed, res: Response) => {
    const { id } = req.params;
    if (!ID_IMAGEM.test(id)) {
      return res.status(400).json({ error: "Imagem inválida." });
    }
    try {
      const p = await papel(req);
      if (!p.equipe && !p.revisor) {
        return res.status(403).json({ error: MSG_EQUIPE });
      }

      const file = await lerBytesImagem(
        { db: deps!.db, storage: getStorage() },
        { equipe: req.user! },
        id
      );
      res.setHeader("Content-Type", file.mime);
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.send(file.data);
    } catch (error) {
      handleDbError(res, error);
    }
  });

  // 7. PUT /:id/texto-alternativo — equipe
  router.put("/:id/texto-alternativo", jsonParser, async (req: Authed, res: Response) => {
    const { id } = req.params;
    if (!ID_IMAGEM.test(id)) {
      return res.status(400).json({ error: "Imagem inválida." });
    }
    try {
      const p = await papel(req);
      if (!p.equipe) {
        return res.status(403).json({ error: MSG_EQUIPE });
      }

      const texto = typeof req.body?.texto === "string" ? req.body.texto : "";
      const alterada = await deps!.db.asUser(req.user!, "app_ch_doc_imagem_texto_alternativo", {
        p_id: id,
        p_texto: texto,
      });
      res.json(alterada);
    } catch (error) {
      handleDbError(res, error);
    }
  });

  // 8. POST /:id/arquivar — equipe
  router.post("/:id/arquivar", jsonParser, async (req: Authed, res: Response) => {
    const { id } = req.params;
    if (!ID_IMAGEM.test(id)) {
      return res.status(400).json({ error: "Imagem inválida." });
    }
    try {
      const p = await papel(req);
      if (!p.equipe) {
        return res.status(403).json({ error: MSG_EQUIPE });
      }

      const arquivar = Boolean(req.body?.arquivar);
      const alterada = await deps!.db.asUser(req.user!, "app_ch_doc_imagem_arquivar", {
        p_id: id,
        p_arquivar: arquivar,
      });
      res.json(alterada);
    } catch (error) {
      handleDbError(res, error);
    }
  });

  // 9. GET /:id — detalhe para a equipe
  router.get("/:id", async (req: Authed, res: Response) => {
    const { id } = req.params;
    if (!ID_IMAGEM.test(id)) {
      return res.status(400).json({ error: "Imagem inválida." });
    }
    try {
      const p = await papel(req);
      if (!p.equipe) {
        return res.status(403).json({ error: MSG_EQUIPE });
      }

      const detalhe = await deps!.db.asUser(req.user!, "app_ch_doc_imagem", { p_id: id });
      res.json(detalhe);
    } catch (error) {
      handleDbError(res, error);
    }
  });

  return router;
}
