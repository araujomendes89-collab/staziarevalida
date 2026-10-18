import { describe, expect, it } from "vitest";
import config from "../../vercel.json";

type Redirect = { source: string; destination: string; permanent: boolean; has?: Array<{ type: string; value: string }> };
const todos = config.redirects as Redirect[];
// as regras por endereço (www, app e sem www) ficam no fim e são testadas à parte
const redirects = todos.filter((r) => !r.has);
const porHost = todos.filter((r) => r.has);
const rewrites = config.rewrites as Array<{ source: string; destination: string }>;
const headers = (config as { headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }> }).headers ?? [];

describe("redirecionamentos do vercel.json", () => {
  it("os três redirecionamentos fixos vêm antes do geral, na ordem; a raiz não desvia mais para /novo", () => {
    expect(redirects.slice(0, 3).map((r) => [r.source, r.destination])).toEqual([
      ["/termos-de-uso", "/novo/termos"],
      ["/politica-de-privacidade", "/novo/privacidade"],
      ["/login", "/novo/login"],
    ]);
    expect(redirects).toHaveLength(4);
    expect(redirects.some((r) => r.source === "/")).toBe(false);
    expect(redirects.every((r) => r.permanent === false)).toBe(true);
    expect(redirects[3].destination).toBe("/novo");
  });

  it("o redirecionamento geral pega o app antigo e deixa passar o app novo, os arquivos, a API, robots e sitemap", () => {
    const group = redirects[3].source.replace(/^\/:path/, "");
    const re = new RegExp("^/" + group.replace(/^\(|\)$/g, "") + "$");
    for (const p of ["/questoes", "/app/inicio", "/onboarding/splash", "/pagamento/sucesso", "/admin", "/tutor-ia", "/robots.txt.bak"]) {
      expect(re.test(p), p).toBe(true);
    }
    for (const p of [
      "/api", "/api/tutor/voice/sweep", "/novo", "/novo/termos", "/novo.html", "/brand/simbolo-96w.png",
      "/assets/novo-x.js", "/ds-icons/a.svg", "/question-assets/q.png", "/images/x.png", "/.well-known/x", "/_vercel/insights",
      "/robots.txt", "/sitemap.xml", "/inicio-sem-js.css",
    ]) {
      expect(re.test(p), p).toBe(false);
    }
    // a raiz não casa com o geral (o grupo exige ao menos 1 caractere): / mostra a página inicial (dist/index.html)
    expect(re.test("/")).toBe(false);
  });

  it("www mostra a página inicial, app abre o aplicativo e o endereço sem www vai para o www", () => {
    expect(todos.slice(0, 4)).toEqual(redirects);
    const regra = (host: string, source: string) =>
      porHost.find((r) => r.source === source && r.has?.some((h) => h.type === "host" && h.value === host));
    expect(regra("app.staziamed.com.br", "/")?.destination).toBe("/novo");
    expect(regra("staziamed.com.br", "/:path*")?.destination).toBe("https://www.staziamed.com.br/:path*");
    expect(regra("www.staziamed.com.br", "/novo")?.destination).toBe("https://app.staziamed.com.br/novo");
    expect(regra("www.staziamed.com.br", "/novo/:path*")?.destination).toBe("https://app.staziamed.com.br/novo/:path*");
    expect(porHost).toHaveLength(4);
    expect(porHost.every((r) => r.permanent === false)).toBe(true);
    // a raiz do www continua sem regra: mostra a página inicial
    expect(porHost.some((r) => r.source === "/" && r.has?.some((h) => h.value === "www.staziamed.com.br"))).toBe(false);
  });

  it("endereço que não existe não cai mais no index.html (o app antigo): a Vercel responde 404.html", () => {
    expect(rewrites.some((r) => r.destination === "/index.html")).toBe(false);
    expect(rewrites.map((r) => r.source)).toEqual(["/api/:path*", "/novo", "/novo/:path*"]);
  });

  it("a página inicial tem cabeçalhos de segurança e os arquivos carimbados ficam em cache longo", () => {
    const raiz = headers.find((h) => h.source === "/");
    const csp = raiz?.headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
    expect(raiz?.headers.map((h) => h.key)).toEqual(expect.arrayContaining(["X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]));
    const assets = headers.find((h) => h.source === "/assets/(.*)");
    expect(assets?.headers[0].value).toBe("public, max-age=31536000, immutable");
  });
});
