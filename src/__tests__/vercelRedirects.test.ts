import { describe, expect, it } from "vitest";
import config from "../../vercel.json";

const redirects = config.redirects as Array<{ source: string; destination: string; permanent: boolean }>;

describe("redirecionamentos do vercel.json", () => {
  it("os quatro redirecionamentos fixos vêm antes do geral, na ordem", () => {
    expect(redirects.slice(0, 4).map((r) => [r.source, r.destination])).toEqual([
      ["/termos-de-uso", "/novo/termos"],
      ["/politica-de-privacidade", "/novo/privacidade"],
      ["/login", "/novo/login"],
      ["/", "/novo"],
    ]);
    expect(redirects).toHaveLength(5);
    expect(redirects.every((r) => r.permanent === false)).toBe(true);
    expect(redirects[4].destination).toBe("/novo");
  });

  it("o redirecionamento geral pega o app antigo e deixa passar o app novo, os arquivos e a API", () => {
    const group = redirects[4].source.replace(/^\/:path/, "");
    const re = new RegExp("^/" + group.replace(/^\(|\)$/g, "") + "$");
    for (const p of ["/questoes", "/app/inicio", "/onboarding/splash", "/pagamento/sucesso", "/admin", "/tutor-ia"]) {
      expect(re.test(p), p).toBe(true);
    }
    for (const p of [
      "/api", "/api/tutor/voice/sweep", "/novo", "/novo/termos", "/novo.html", "/brand/simbolo-96w.png",
      "/assets/novo-x.js", "/ds-icons/a.svg", "/question-assets/q.png", "/images/x.png", "/.well-known/x", "/_vercel/insights",
    ]) {
      expect(re.test(p), p).toBe(false);
    }
  });
});
