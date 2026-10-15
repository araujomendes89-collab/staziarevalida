// Cliente HTTP educado do Radar: user-agent identificado, pausa entre pedidos, robots.txt respeitado, nunca lança erro.
// Todo adaptador usa SÓ este cliente (nenhum fetch solto), por isso a regra vale para todos.
import zlib from "node:zlib";
import { createHash } from "node:crypto";

export const USER_AGENT = "StaziaMed-Radar/0.2 (vigia de fontes oficiais de saude para estudo; contato@staziamed.com.br)";

/** Interpreta um robots.txt e diz se o caminho é permitido para o nosso user-agent (regra do grupo mais específico; Allow mais longo vence). */
export function robotsPermite(robotsTxt, caminho, agente = "StaziaMed-Radar") {
  const grupos = [];
  let atual = null, ultimaFoiAgente = false;
  for (const bruta of String(robotsTxt ?? "").split(/\r?\n/)) {
    const linha = bruta.replace(/#.*/, "").trim();
    if (!linha) continue;
    const m = linha.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const campo = m[1].toLowerCase(), valor = m[2].trim();
    if (campo === "user-agent") {
      if (!ultimaFoiAgente) { atual = { agentes: [], regras: [] }; grupos.push(atual); }
      atual.agentes.push(valor.toLowerCase());
      ultimaFoiAgente = true;
    } else if (campo === "allow" || campo === "disallow") {
      ultimaFoiAgente = false;
      if (atual) atual.regras.push({ permite: campo === "allow", padrao: valor });
    } else ultimaFoiAgente = false;
  }
  const nome = agente.toLowerCase();
  const especifico = grupos.filter((g) => g.agentes.some((a) => a !== "*" && nome.includes(a)));
  const escolhidos = especifico.length ? especifico : grupos.filter((g) => g.agentes.includes("*"));
  let melhor = null;
  for (const g of escolhidos) for (const r of g.regras) {
    if (!r.padrao) continue; // "Disallow:" vazio = tudo permitido
    const re = new RegExp("^" + r.padrao.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(caminho) && (!melhor || r.padrao.length > melhor.padrao.length || (r.padrao.length === melhor.padrao.length && r.permite))) melhor = r;
  }
  return melhor ? melhor.permite : true;
}

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * criarCliente({ fetchImpl, pausaMs, timeoutMs, respeitarRobots })
 * get(url, { aceita, limiteMb }) → { ok, status, url, tipo, buf, texto, erro, bloqueadoPorRobots }
 */
export function criarCliente({ fetchImpl = globalThis.fetch, pausaMs = 1500, timeoutMs = 45000, respeitarRobots = true, userAgent = USER_AGENT, relogio = () => Date.now() } = {}) {
  let ultimoPedido = 0;
  const robots = new Map(); // host → texto do robots.txt (ou null quando não existe)
  const contagem = { pedidos: 0, bloqueados_robots: 0, falhas: 0 };

  async function pausar() {
    const espera = ultimoPedido + pausaMs - relogio();
    if (espera > 0) await dorme(espera);
    ultimoPedido = relogio();
  }

  async function pedir(url, { aceita, limiteMb = 25 } = {}) {
    await pausar();
    contagem.pedidos++;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(url, { signal: ctl.signal, redirect: "follow", headers: { "user-agent": userAgent, ...(aceita ? { accept: aceita } : {}) } });
      const tipo = r.headers.get("content-type") ?? "";
      if (!r.ok) { contagem.falhas++; return { ok: false, status: r.status, url, erro: `HTTP ${r.status}` }; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > limiteMb * 1048576) return { ok: false, status: r.status, url, erro: "arquivo grande demais" };
      return { ok: true, status: r.status, url: r.url || url, tipo, buf, headers: Object.fromEntries(r.headers ?? []), total: r.headers.get("x-wp-total") };
    } catch (e) {
      contagem.falhas++;
      return { ok: false, status: 0, url, erro: String(e?.cause?.code ?? e?.name ?? e?.message ?? e).slice(0, 120) };
    } finally { clearTimeout(t); }
  }

  async function permitido(url) {
    if (!respeitarRobots) return true;
    const u = new URL(url);
    if (!robots.has(u.host)) {
      const r = await pedir(`${u.protocol}//${u.host}/robots.txt`, { limiteMb: 2 });
      // robots.txt ausente (404) = sem restrição; erro de rede ou 5xx = prudência: segue sem pedir o conteúdo? Não: só trata como sem restrição o 404/4xx
      robots.set(u.host, r.ok ? r.buf.toString("utf8") : r.status >= 400 && r.status < 500 ? null : "User-agent: *\nDisallow: /");
    }
    const txt = robots.get(u.host);
    return txt == null ? true : robotsPermite(txt, u.pathname + u.search);
  }

  async function get(url, opcoes = {}) {
    if (!(await permitido(url))) { contagem.bloqueados_robots++; return { ok: false, status: 0, url, erro: "bloqueado pelo robots.txt do site", bloqueadoPorRobots: true }; }
    const r = await pedir(url, opcoes);
    if (r.ok) {
      r.buf = descomprimir(r.buf);
      r.texto = () => decodificar(r.buf, r.tipo);
    }
    return r;
  }

  return { get, contagem, permitido };
}

/** .gz de verdade vira texto; o resto passa como veio. */
export function descomprimir(buf) {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) { try { return zlib.gunzipSync(buf); } catch { return buf; } }
  return buf;
}
export function decodificar(buf, tipo = "") {
  const cs = /charset=([\w-]+)/i.exec(tipo)?.[1]?.toLowerCase();
  if (cs && /8859|latin|1252/.test(cs)) return new TextDecoder("windows-1252").decode(buf);
  return buf.toString("utf8");
}

// ---------------------------------------------------------------- item normalizado
export const sha = (s) => createHash("sha256").update(s).digest("hex");

/** Todo adaptador devolve itens neste formato: { adaptador, fonte, chave, titulo, versao, data, url, hash, tipo, texto? }. */
export function criarItem({ adaptador, fonte, chave, titulo, versao = null, data = null, url, conteudo, tipo = "documento", texto = null }) {
  const dataIso = data ? String(data).slice(0, 10) : null;
  return {
    adaptador, fonte, chave: chave ?? url, titulo: String(titulo ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || null,
    versao: versao == null ? null : String(versao).slice(0, 80), data: dataIso && /^\d{4}-\d{2}-\d{2}$/.test(dataIso) ? dataIso : null,
    url, tipo, hash: sha(typeof conteudo === "string" ? conteudo : `${chave ?? url}|${versao ?? ""}|${dataIso ?? ""}|${titulo ?? ""}`),
    ...(texto != null ? { texto } : {}),
  };
}
