/**
 * Treino em Dupla: gera a FOLHA DO CANDIDATO de uma estação como imagem PNG (Playwright, o mesmo Chromium dos PDFs da Central)
 * e grava no depósito privado. O modelo é src/shared/dupla/folhaCandidato.ts; os dados vêm do banco (dupla_folha_fonte, 013390).
 *
 *   1. ch_worker_dupla_folha_fonte → fonte + marca (hash) do conteúdo;
 *   2. HTML → PNG (largura 802 px × 2), com conferência: todo o texto da estação aparece na página e nada passa da largura;
 *   3. depósito: dupla/folhas/<sha256>.png (o nome não diz a estação);
 *   4. ch_worker_dupla_folha_gravar (confere que o conteúdo não mudou no meio e aponta a estação para a imagem).
 * Falha → ch_worker_dupla_folha_falha (a Administração mostra o motivo). Sem IA.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { ContentDb, Storage } from "../contentHub/infra";
import type { Renderer } from "../contentHub/render";
import { FOLHA_ESCALA, FOLHA_LARGURA, FOLHA_MODELO, folhaHtml, textosEsperados, type FolhaFonte } from "../../src/shared/dupla/folhaCandidato";

const ROOT = process.cwd();
/** Logotipo do app (StaziaMed Revalida), o mesmo da tela. */
export const FOLHA_LOGO = "public/novo-assets/logo-staziamed-revalida-v2.png";

export interface FolhaDeps {
  db: ContentDb;
  storage: Storage;
  renderer: Renderer | null;
  log?: (m: string) => void;
}

export class FolhaIndisponivel extends Error {}

export interface FolhaGerada {
  station_id: string;
  path: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  situacao: unknown;
}

let logoCache: string | null = null;
/** Logotipo em data URI (a página do Chromium não busca nada fora). */
export function logoDataUri(): string {
  if (logoCache) return logoCache;
  const file = path.join(ROOT, FOLHA_LOGO);
  if (!fs.existsSync(file)) throw new FolhaIndisponivel(`Logotipo não encontrado em ${FOLHA_LOGO}.`);
  logoCache = `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
  return logoCache;
}

let fontCache: string | null = null;
/** Plus Jakarta Sans embutida (server/contentHub/fonts; CONTENT_HUB_FONT_DIR troca a pasta). Sem os arquivos: fonte do sistema. */
export function fonteCss(): string {
  if (fontCache !== null) return fontCache;
  const dir = process.env.CONTENT_HUB_FONT_DIR || path.join(ROOT, "server/contentHub/fonts");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^PlusJakartaSans-(Regular|Medium|SemiBold|Bold)\.woff2$/.test(f)) : [];
  fontCache = files
    .map((f) => {
      const weight = /SemiBold/.test(f) ? 600 : /Bold/.test(f) ? 700 : /Medium/.test(f) ? 500 : 400;
      return `@font-face{font-family:'Plus Jakarta Sans';font-weight:${weight};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, f)).toString("base64")}) format('woff2')}`;
    })
    .join("");
  return fontCache;
}

/** HTML da folha como o servidor desenha (logotipo e fonte embutidos). */
export function folhaHtmlServidor(fonte: FolhaFonte): string {
  return folhaHtml(fonte, { logoSrc: logoDataUri(), fontCss: fonteCss() });
}

const espacos = (t: string) => t.replace(/\s+/g, " ").trim();

/**
 * Desenha a folha e devolve o PNG. Confere no navegador: todo o texto esperado está na página (nada cortado nem perdido) e
 * nenhuma linha passa da largura. Problema → erro com o motivo (a imagem não é gravada).
 */
export async function desenharFolha(renderer: Renderer, fonte: FolhaFonte): Promise<{ png: Buffer; width: number; height: number }> {
  if (!renderer.newPage) throw new FolhaIndisponivel("O gerador de imagens (Chromium) não está disponível neste servidor.");
  const page = await renderer.newPage({ viewport: { width: FOLHA_LARGURA, height: 1200 }, deviceScaleFactor: FOLHA_ESCALA });
  try {
    await page.setContent(folhaHtmlServidor(fonte), { waitUntil: "load" });
    await page.evaluate(() => (document as any).fonts?.ready);
    const conferencia = await page.$eval("main.folha", (el) => ({
      texto: (el as HTMLElement).innerText,
      largura: el.scrollWidth,
      caixa: el.clientWidth,
      imagens: Array.from(el.querySelectorAll("img")).every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0),
    }));
    if (!conferencia.imagens) throw new Error("O logotipo não carregou na folha.");
    if (conferencia.largura > conferencia.caixa + 1) throw new Error("Algum texto passou da largura da folha.");
    const pagina = espacos(conferencia.texto);
    const faltando = textosEsperados(fonte).filter((t) => !pagina.includes(espacos(t)));
    if (faltando.length) throw new Error(`Texto da estação ausente na folha: “${faltando[0].slice(0, 80)}”.`);
    const png = Buffer.from(await page.locator("main.folha").screenshot({ type: "png", animations: "disabled" }));
    if (png.length < 24 || png.subarray(12, 16).toString("latin1") !== "IHDR") throw new Error("A imagem gerada não é um PNG.");
    return { png, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** Caminho da imagem no depósito: só o sha256 (nada da estação). */
export const caminhoDaFolha = (sha256: string) => `dupla/folhas/${sha256}.png`;

/**
 * Gera e grava a folha de uma estação. `actor`: quem pediu (nulo = comando do administrador). Falha de geração vira
 * "falhou" na Administração (com o motivo) e o erro sobe.
 */
export async function gerarFolha(deps: FolhaDeps, stationId: string, actor: string | null = null): Promise<FolhaGerada> {
  if (!deps.renderer) throw new FolhaIndisponivel("O gerador de imagens (Chromium/Playwright) não está instalado neste servidor.");
  try {
    const { fonte, hash } = await deps.db.service<{ fonte: FolhaFonte; hash: string }>("ch_worker_dupla_folha_fonte", { p_station_id: stationId });
    if (fonte.bloqueio) throw new Error(fonte.bloqueio);
    const { png, width, height } = await desenharFolha(deps.renderer, fonte);
    const sha256 = crypto.createHash("sha256").update(png).digest("hex");
    const key = caminhoDaFolha(sha256);
    if (!(await deps.storage.exists(key))) await deps.storage.put(key, png, "image/png");
    const situacao = await deps.db.service("ch_worker_dupla_folha_gravar", {
      p_actor: actor,
      p_station_id: stationId,
      p_hash: hash,
      p_path: key,
      p_sha256: sha256,
      p_width: width,
      p_height: height,
      p_bytes: png.length,
      p_modelo: FOLHA_MODELO,
    });
    deps.log?.(`[folha] estação ${stationId}: folha gerada (${width}×${height} px)`);
    return { station_id: stationId, path: key, sha256, width, height, bytes: png.length, situacao };
  } catch (error) {
    const msg = (error as Error).message ?? String(error);
    await deps.db.service("ch_worker_dupla_folha_falha", { p_station_id: stationId, p_error: msg.slice(0, 500) }).catch(() => undefined);
    throw error;
  }
}

/**
 * Gera as folhas da fila: as pedidas na Administração e, com `todas`, as das estações aprovadas sem folha valendo.
 * `simular`: só lista. Uma falha não para as outras.
 */
export async function gerarFolhasPendentes(
  deps: FolhaDeps,
  opts: { todas?: boolean; max?: number; simular?: boolean } = {}
): Promise<{ estacoes: string[]; geradas: string[]; falhas: { station_id: string; erro: string }[] }> {
  const estacoes = await deps.db.service<string[]>("ch_worker_dupla_folhas_a_gerar", { p_todas: opts.todas === true, p_limit: opts.max ?? 50 });
  const geradas: string[] = [];
  const falhas: { station_id: string; erro: string }[] = [];
  if (opts.simular) return { estacoes, geradas, falhas };
  for (const id of estacoes) {
    try {
      await gerarFolha(deps, id, null);
      geradas.push(id);
    } catch (error) {
      falhas.push({ station_id: id, erro: (error as Error).message });
      deps.log?.(`[folha] estação ${id}: falhou: ${(error as Error).message}`.slice(0, 300));
    }
  }
  return { estacoes, geradas, falhas };
}
