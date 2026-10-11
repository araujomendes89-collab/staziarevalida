/**
 * FONTES OFICIAIS: a lista de sites oficiais (ch_official_domains) e o download conferido de um achado da IA.
 *
 * O servidor nunca confia no link que a IA devolve: ele confere o esquema (https, porta 443, sem usuário e senha), se o site
 * está na lista (host igual ao da linha ou subdomínio dele; se a linha tem caminho, o caminho do link começa por ele inteiro)
 * e REPETE essa conferência em cada redirecionamento (até 3). O arquivo vem com limite de 50 MB e de 60 s, e só vale PDF
 * (assinatura `%PDF-`) ou página HTML.
 */
import { fetchBytes, type FetchedBytes } from "../../podcasts/extract";

export type DomainKind = "governo" | "internacional" | "sociedade";

/** Uma linha ativa da lista de sites oficiais. `address` não tem https://, é minúsculo e só ASCII (ex.: "gov.br/saude"). */
export interface OfficialDomain {
  id: string;
  address: string;
  institution: string;
  kind: DomainKind;
}

/** Limites e identificação do download dos achados (50 MB, 60 s). */
export const OFFICIAL_FETCH = { maxBytes: 50 * 1024 * 1024, timeoutMs: 60_000, userAgent: "StaziaMed-Fontes/1.0" } as const;

/**
 * Link normalizado para achar repetidos. É a MESMA regra de `ch_url_norm` no banco: esquema e host em minúsculas (usuário e
 * senha, se houver, ficam como vieram), sem "#…", sem parâmetros `utm_*` (sem caixa), sem ":443", sem "?" vazio e sem pedaços
 * vazios entre "&". O caminho e os outros parâmetros ficam como vieram. Texto que não parece link volta sem os espaços das pontas
 * (só o espaço comum, como o btrim do banco) e sem "#…".
 */
export function normalizeLink(link: string): string {
  const v = String(link ?? "").replace(/^ +| +$/g, "").split("#")[0];
  if (v === "") return "";
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?]*)([^?]*)(\?(.*))?$/s.exec(v);
  if (!m) return v;
  const authority = m[2];
  const at = authority.lastIndexOf("@");
  let host = at >= 0 ? authority.slice(0, at + 1) + authority.slice(at + 1).toLowerCase() : authority.toLowerCase();
  host = host.replace(/:443$/, "");
  const query = (m[5] ?? "")
    .split("&")
    .filter((part) => part !== "" && !/^utm_/i.test(part))
    .join("&");
  return m[1].toLowerCase() + "://" + host + m[3] + (query ? "?" + query : "");
}

/** Problema do link (texto em português) ou nulo se o link serve para baixar: https, porta 443, sem usuário nem senha. */
export function linkProblem(link: string): string | null {
  if (typeof link !== "string" || /[\u0000- \u007f]/.test(link)) return "Link inválido.";
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return "Link inválido.";
  }
  if (u.protocol !== "https:") return "Link sem https.";
  if (u.port !== "" && u.port !== "443") return "Porta diferente de 443.";
  if (u.username !== "" || u.password !== "") return "Link com usuário ou senha.";
  if (!u.hostname) return "Link inválido.";
  return null;
}

/** A linha da lista que casa com o link (a de endereço mais longo), ou nulo. Host fora do ASCII nunca casa. */
export function matchDomain(link: string | URL, domains: OfficialDomain[]): OfficialDomain | null {
  let u: URL;
  try {
    if (typeof link === "string") {
      const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(link.trim())?.[1] ?? "";
      if (/[^\u0000-\u007f]/.test(authority)) return null;
      u = new URL(link);
    } else {
      u = link;
    }
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!host || /[^\u0000-\u007f]/.test(host)) return null;
  let best: OfficialDomain | null = null;
  for (const d of domains) {
    const address = String(d.address ?? "").toLowerCase();
    const slash = address.indexOf("/");
    const domainHost = slash < 0 ? address : address.slice(0, slash);
    const domainPath = slash < 0 ? "" : address.slice(slash);
    if (!domainHost) continue;
    if (host !== domainHost && !host.endsWith("." + domainHost)) continue;
    if (domainPath && u.pathname !== domainPath && !u.pathname.startsWith(domainPath + "/")) continue;
    if (!best || address.length > best.address.length) best = d;
  }
  return best;
}

/**
 * Baixa o arquivo de um achado conferindo a lista em CADA destino (o primeiro e os redirecionamentos). Devolve também a linha
 * da lista a que o endereço FINAL pertence. Só PDF ou página HTML; qualquer problema vira erro com a mensagem em português.
 */
export async function downloadOfficial(
  url: string,
  domains: OfficialDomain[],
  fetchImpl: typeof fetch,
  checkHost?: (host: string) => Promise<void>,
): Promise<FetchedBytes & { kind: "pdf" | "html"; domain: OfficialDomain }> {
  const got = await fetchBytes(url, fetchImpl, {
    ...OFFICIAL_FETCH,
    checkHost,
    checkUrl: (u) => linkProblem(u.href) ?? (matchDomain(u, domains) ? null : "Redirecionamento para fora da lista de sites oficiais."),
  });
  if (got.kind === "text") throw new Error("O link não é PDF nem página HTML.");
  const domain = matchDomain(got.finalUrl, domains);
  if (!domain) throw new Error("Redirecionamento para fora da lista de sites oficiais.");
  return { ...got, kind: got.kind, domain };
}
