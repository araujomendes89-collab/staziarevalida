/**
 * Canonical React Print Renderer (Etapa 1.28E).
 * Single Editorial Renderer: Reuses canonical React component tree (A4PageContainer,
 * EditorialComponents, EditorialBlockRenderer) via renderToStaticMarkup.
 * Guaranteed SSR-safe, injects Tailwind CSS and print stylesheet, and enforces
 * strict non-executable escaping for all source medical text.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "fs/promises";
import path from "path";
import { StaziaEditorialDocumentDraft } from "../../../src/types/medicalEditorial";
import { CANONICAL_A4_PRINT_CONFIG } from "../../../src/types/editorialPdfExport";
import { A4PageContainer } from "../../../src/components/admin/contentEngine/editorial/A4PageContainer";
import { ResolvedAssetData } from "./editorialPrintAssetResolver";

export interface RenderPrintHtmlOptions {
  draft: StaziaEditorialDocumentDraft;
  resolvedAssets?: Map<string, ResolvedAssetData>;
}

export class EditorialReactPrintRenderer {
  private static instance: EditorialReactPrintRenderer;
  private cachedPrintCss: string | null = null;

  public static getInstance(): EditorialReactPrintRenderer {
    if (!EditorialReactPrintRenderer.instance) {
      EditorialReactPrintRenderer.instance = new EditorialReactPrintRenderer();
    }
    return EditorialReactPrintRenderer.instance;
  }

  /**
   * Renders the complete, self-contained HTML print document for Playwright.
   */
  public async renderPrintHtml(options: RenderPrintHtmlOptions): Promise<string> {
    const { draft, resolvedAssets = new Map() } = options;

    // Load print CSS
    if (!this.cachedPrintCss) {
      const cssPath = path.resolve(__dirname, "medicalEditorialPrint.css");
      try {
        this.cachedPrintCss = await fs.readFile(cssPath, "utf-8");
      } catch {
        this.cachedPrintCss = "";
      }
    }

    // Clone draft and inject resolved assets into figure blocks if available
    const printDraft: StaziaEditorialDocumentDraft = {
      ...draft,
      pages: draft.pages.map((page) => ({
        ...page,
        blocks: page.blocks.map((block) => {
          if (block.figureData) {
            const assetId = block.figureData.assetId || block.figureData.id || block.id;
            const resolved = resolvedAssets.get(assetId);
            if (resolved) {
              return {
                ...block,
                figureData: {
                  ...block.figureData,
                  base64Data: resolved.dataUri,
                },
              };
            }
          }
          return block;
        }),
      })),
    };

    const totalPages = printDraft.pages.length || 1;

    // Render each page using the canonical A4PageContainer in PRINT mode
    const pagesMarkup = printDraft.pages
      .map((page) =>
        renderToStaticMarkup(
          React.createElement(A4PageContainer, {
            key: page.pageIndex,
            page,
            totalPages,
            topic: printDraft.topic,
            area: printDraft.area,
            specialty: printDraft.specialty,
            subtopics: printDraft.subtopics,
            renderMode: "PRINT",
          })
        )
      )
      .join("\n");

    const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(printDraft.topic)} — StaziaMed Revalida</title>
  <!-- Tailwind CSS CDN Fallback for Print Renderer -->
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    ${this.cachedPrintCss}

    /* Core Print Fallbacks & Exact Tokens */
    body {
      background-color: #F8FAFC;
      color: #0F172A;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  </style>
</head>
<body class="bg-[#F8FAFC] antialiased">
  <div id="print-container">
    ${pagesMarkup}
  </div>
</body>
</html>`;

    return fullHtml;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
