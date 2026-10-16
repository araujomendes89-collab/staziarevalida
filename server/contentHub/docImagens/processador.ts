/**
 * Processador de imagens baseado no Chromium (Playwright) para redimensionamento
 * seguro e conversão de SVG para PNG.
 * Opera isolado sem rede e com JavaScript desativado no navegador.
 */
import fs from "fs";

export interface ProcessadorImagem {
  /** Reduz (lado maior ≤ ladoMaximo) e recompacta uma imagem raster; JPEG sai JPEG (qualidade 85), o resto sai PNG. */
  reduzir(
    buf: Buffer,
    info: { mime: string; width: number; height: number },
    ladoMaximo: number
  ): Promise<{ data: Buffer; mime: string; width: number; height: number }>;

  /** Converte SVG em PNG (o SVG pode carregar código: nunca é guardado nem entregue). */
  svgParaPng(
    svg: Buffer,
    info: { width: number; height: number },
    ladoMaximo: number
  ): Promise<{ data: Buffer; width: number; height: number }>;

  fechar(): Promise<void>;
}

function calcularDimensoes(width: number, height: number, ladoMaximo: number): { W: number; H: number } {
  const maxLado = Math.max(width, height);
  const escala = maxLado > ladoMaximo ? ladoMaximo / maxLado : 1;
  const W = Math.max(1, Math.round(width * escala));
  const H = Math.max(1, Math.round(height * escala));
  return { W, H };
}

/**
 * Cria um processador de imagens utilizando o Chromium do Playwright.
 * Devolve null se o Playwright ou o binário do Chromium não estiverem disponíveis.
 */
export async function criarProcessadorChromium(): Promise<ProcessadorImagem | null> {
  let chromium: typeof import("playwright").chromium;
  try {
    chromium = (await import("playwright")).chromium;
    if (!fs.existsSync(chromium.executablePath())) return null;
  } catch {
    return null;
  }

  let browser: import("playwright").Browser | null = null;

  const obterBrowser = async () => {
    if (!browser || !browser.isConnected()) browser = await chromium.launch();
    return browser;
  };

  return {
    async reduzir(buf, info, ladoMaximo) {
      const { W, H } = calcularDimensoes(info.width, info.height, ladoMaximo);
      const isJpeg = info.mime === "image/jpeg";
      const b = await obterBrowser();
      const context = await b.newContext({
        javaScriptEnabled: false,
        viewport: { width: W, height: H },
        deviceScaleFactor: 1,
      });

      try {
        await context.route("**/*", (r) => (r.request().url().startsWith("data:") ? r.continue() : r.abort()));
        const page = await context.newPage();
        const dataUrl = `data:${info.mime};base64,${buf.toString("base64")}`;
        const html = `<html><body style="margin:0;background:transparent"><img id="i" src="${dataUrl}" style="display:block;width:${W}px;height:${H}px"></body></html>`;
        await page.setContent(html, { waitUntil: "load" });

        const screenshot = await page.locator("#i").screenshot({
          type: isJpeg ? "jpeg" : "png",
          quality: isJpeg ? 85 : undefined,
          omitBackground: !isJpeg,
        });

        return {
          data: Buffer.from(screenshot),
          mime: isJpeg ? "image/jpeg" : "image/png",
          width: W,
          height: H,
        };
      } finally {
        await context.close();
      }
    },

    async svgParaPng(svg, info, ladoMaximo) {
      const { W, H } = calcularDimensoes(info.width, info.height, ladoMaximo);
      const b = await obterBrowser();
      const context = await b.newContext({
        javaScriptEnabled: false,
        viewport: { width: W, height: H },
        deviceScaleFactor: 1,
      });

      try {
        await context.route("**/*", (r) => (r.request().url().startsWith("data:") ? r.continue() : r.abort()));
        const page = await context.newPage();
        const dataUrl = `data:image/svg+xml;base64,${svg.toString("base64")}`;
        const html = `<html><body style="margin:0;background:transparent"><img id="i" src="${dataUrl}" style="display:block;width:${W}px;height:${H}px"></body></html>`;
        await page.setContent(html, { waitUntil: "load" });

        const screenshot = await page.locator("#i").screenshot({
          type: "png",
          omitBackground: true,
        });

        return {
          data: Buffer.from(screenshot),
          width: W,
          height: H,
        };
      } finally {
        await context.close();
      }
    },

    async fechar() {
      if (browser) {
        await browser.close();
        browser = null;
      }
    },
  };
}
