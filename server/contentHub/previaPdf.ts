// Rota de prévia de PDF da Central de Conteúdo (/api/content-hub/previa-pdf).
// Permite que a equipe visualize a aula com diagramação e paginação exatas antes de publicar.

import express, { type Request, type Response } from "express";
import { lessonHtml, loadBrand, opcoesPdfAula, type RenderMeta } from "./render";
import { sanearPagina } from "../../src/shared/docRico/modulos/pagina";

let cachedBrand: any = null;
function getBrand() {
  if (!cachedBrand) {
    cachedBrand = loadBrand();
  }
  return cachedBrand;
}

let renderizando = false;

export function mountPreviaPdf(router: any, deps: any, _asUser: any, requireStaff: any): void {
  router.post(
    "/previa-pdf",
    express.json({ limit: "2mb" }),
    async (req: Request, res: Response) => {
      try {
        await requireStaff(req);
      } catch {
        return res.status(403).json({ error: "Acesso restrito à equipe de conteúdo." });
      }

      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "Corpo da requisição inválido." });
      }

      let title = "Prévia da aula";
      if (body.titulo !== undefined) {
        if (typeof body.titulo !== "string" || body.titulo.length > 300) {
          return res.status(400).json({ error: "Título inválido (deve ser texto de até 300 caracteres)." });
        }
        title = body.titulo;
      }

      let versao = 0;
      if (body.versao !== undefined) {
        if (
          typeof body.versao !== "number" ||
          !Number.isInteger(body.versao) ||
          body.versao < 0 ||
          body.versao > 9999
        ) {
          return res.status(400).json({ error: "Versão inválida (deve ser número inteiro entre 0 e 9999)." });
        }
        versao = body.versao;
      }

      if (!Array.isArray(body.sections) || body.sections.length > 200) {
        return res.status(400).json({ error: "Seções inválidas (deve ser uma lista de até 200 seções)." });
      }

      const sections: Array<{
        heading: string;
        paragraphs: Array<{ text: string; rico?: unknown }>;
      }> = [];

      for (const s of body.sections) {
        if (!s || typeof s !== "object" || Array.isArray(s)) {
          return res.status(400).json({ error: "Estrutura de seção inválida." });
        }
        if (typeof s.heading !== "string" || s.heading.length > 500) {
          return res.status(400).json({ error: "Título da seção inválido (texto de até 500 caracteres)." });
        }
        if (!Array.isArray(s.paragraphs) || s.paragraphs.length > 500) {
          return res.status(400).json({ error: "Parágrafos da seção inválidos (lista de até 500 parágrafos)." });
        }
        const paragraphs: Array<{ text: string; rico?: unknown }> = [];
        for (const p of s.paragraphs) {
          if (!p || typeof p !== "object" || Array.isArray(p)) {
            return res.status(400).json({ error: "Estrutura de parágrafo inválida." });
          }
          if (typeof p.text !== "string" || p.text.length > 20000) {
            return res.status(400).json({ error: "Texto do parágrafo inválido (texto de até 20.000 caracteres)." });
          }
          const pObj: { text: string; rico?: unknown } = { text: p.text };
          if (p.rico !== undefined) {
            pObj.rico = p.rico;
          }
          paragraphs.push(pObj);
        }
        sections.push({
          heading: s.heading,
          paragraphs,
        });
      }

      const pg = sanearPagina(body.doc_config?.pagina);
      const content: any = {
        title,
        sections,
        references: [],
        label: "Prévia da equipe (não publicada)",
        ...(pg ? { doc_config: { pagina: pg } } : {}),
      };

      const meta: RenderMeta = {
        title,
        version: versao,
        revisedAt: new Date().toISOString(),
        contentHash: "previa",
      };

      const brand = getBrand();
      const html = lessonHtml(content, meta, brand);

      if (!deps?.renderer?.newPage) {
        return res.status(503).json({
          error: "A prévia exata em PDF não está disponível neste servidor. Abrimos a prévia de impressão do navegador.",
          html,
        });
      }

      if (renderizando) {
        return res.status(429).json({ error: "Outra prévia está sendo gerada. Tente de novo em alguns segundos." });
      }
      renderizando = true;

      let p: any = null;
      try {
        p = await deps.renderer.newPage();
        await p.route("**/*", (r: any) =>
          r.request().url().startsWith("data:") ? r.continue() : r.abort()
        );

        const pdfPromise = (async () => {
          await p.setContent(html, { waitUntil: "load", timeout: 15000 });
          return await p.pdf(opcoesPdfAula(content, meta));
        })();

        pdfPromise.catch(() => {}); // se o tempo acabar antes, o erro tardio não fica solto
        let relogio: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          relogio = setTimeout(() => reject(new Error("Tempo limite excedido na geração do PDF.")), 20000);
        });

        const pdf = await Promise.race([pdfPromise, timeoutPromise]).finally(() => clearTimeout(relogio));

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Cache-Control", "private, no-store");
        return res.send(Buffer.from(pdf));
      } catch (error) {
        return res.status(500).json({
          error: `Erro ao gerar prévia em PDF: ${(error as Error).message || "falha desconhecida"}.`,
        });
      } finally {
        if (p) {
          try {
            await p.close();
          } catch {
            // ignora erro ao fechar página
          }
        }
        renderizando = false;
      }
    }
  );
}
