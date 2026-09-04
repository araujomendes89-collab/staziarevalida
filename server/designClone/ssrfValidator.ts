import dns from "dns";
import { URL } from "url";

export interface IpValidationResult {
  isSafe: boolean;
  resolvedIps: string[];
  reason?: string;
}

/**
 * Checks if a given IPv4 address string falls into private, loopback, link-local, or reserved ranges.
 */
export function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // invalid format considered unsafe
  }

  const [a, b, c, d] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private)
  if (a === 10) return true;

  // 100.64.0.0/10 (Carrier-grade NAT: 100.64.0.0 - 100.127.255.255)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-local / Cloud Metadata)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Network benchmark tests: 198.18.0.0 - 198.19.255.255)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved: 240.0.0.0 - 255.255.255.254)
  if (a >= 240) return true;

  return false;
}

/**
 * Checks if a given IPv6 address falls into loopback, unspecified, link-local, unique-local, or mapped IPv4 private.
 */
export function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // ::1 / Loopback
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;

  // :: / Unspecified
  if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true;

  // fe80::/10 (Link-local)
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true;
  }

  // fc00::/7 (Unique Local Addresses: fc00:: - fdff::)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (normalized.startsWith("::ffff:")) {
    const rawIpv4 = normalized.replace("::ffff:", "");
    if (rawIpv4.includes(".")) {
      return isPrivateOrReservedIpv4(rawIpv4);
    }
  }

  return false;
}

export interface SsrfValidationOptions {
  allowLocalTestHosts?: boolean;
}

/**
 * Performs full pre-flight DNS lookup and SSRF verification for a target URL.
 */
export async function validateSsrfTargetUrl(
  rawUrl: string,
  options: SsrfValidationOptions = {}
): Promise<IpValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      isSafe: false,
      resolvedIps: [],
      reason: "Formato de URL inválido.",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      isSafe: false,
      resolvedIps: [],
      reason: `Protocolo '${parsed.protocol}' não é permitido. Apenas HTTP e HTTPS são aceitos.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Handle local test hosts if explicitly allowed in test environment
  if (options.allowLocalTestHosts) {
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return {
        isSafe: true,
        resolvedIps: ["127.0.0.1"],
      };
    }
  }

  // Static checks against obvious local hosts
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return {
      isSafe: false,
      resolvedIps: [],
      reason: `Host local '${hostname}' bloqueado por proteção SSRF.`,
    };
  }

  // Check if hostname is direct IP literal
  if (isPrivateOrReservedIpv4(hostname)) {
    return {
      isSafe: false,
      resolvedIps: [hostname],
      reason: `IP literal privado '${hostname}' bloqueado por proteção SSRF.`,
    };
  }

  if (hostname.includes(":") && isPrivateOrReservedIpv6(hostname)) {
    return {
      isSafe: false,
      resolvedIps: [hostname],
      reason: `IPv6 literal reservado '${hostname}' bloqueado por proteção SSRF.`,
    };
  }

  // Asynchronous DNS Resolution
  try {
    const lookupResults = await dns.promises.lookup(hostname, { all: true });
    if (!lookupResults || lookupResults.length === 0) {
      return {
        isSafe: false,
        resolvedIps: [],
        reason: `Não foi possível resolver o hostname '${hostname}' no DNS.`,
      };
    }

    const resolvedIps = lookupResults.map((r) => r.address);

    for (const record of lookupResults) {
      const address = record.address;
      if (record.family === 4) {
        if (isPrivateOrReservedIpv4(address)) {
          return {
            isSafe: false,
            resolvedIps,
            reason: `Hostname '${hostname}' resolveu para IP privado ou reservado (${address}). Bloqueado por SSRF.`,
          };
        }
      } else if (record.family === 6) {
        if (isPrivateOrReservedIpv6(address)) {
          return {
            isSafe: false,
            resolvedIps,
            reason: `Hostname '${hostname}' resolveu para IPv6 reservado (${address}). Bloqueado por SSRF.`,
          };
        }
      }
    }

    return {
      isSafe: true,
      resolvedIps,
    };
  } catch (error: any) {
    return {
      isSafe: false,
      resolvedIps: [],
      reason: `Falha na resolução de DNS para '${hostname}': ${error?.message || "Erro desconhecido"}`,
    };
  }
}
