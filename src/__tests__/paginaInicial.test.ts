import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aplicarPreviaLocal, ajustarEntrar, destinoDoLinkDeEmail, ligarAbas, ligarMenu } from "../inicio/inicio.js";
import { telaInicialPeloEndereco } from "../novo/app/AuthScreens.jsx";

const raiz = path.resolve(__dirname, "../..");
const html = fs.readFileSync(path.join(raiz, "index.html"), "utf-8");
const css = fs.readFileSync(path.join(raiz, "src/inicio/inicio.css"), "utf-8");
const html404 = fs.readFileSync(path.join(raiz, "404.html"), "utf-8");

function pagina() {
  return new DOMParser().parseFromString(html, "text/html");
}
function ligar(doc: Document) {
  for (const lista of doc.querySelectorAll<HTMLElement>('[role="tablist"]')) ligarAbas(lista);
  ligarMenu(doc);
}
const textoDe = (doc: Document) => (doc.body.textContent || "").replace(/\s+/g, " ");

describe("página inicial: estrutura e SEO", () => {
  it("tem um só h1, idioma, título, descrição, canonical e Open Graph", () => {
    const doc = pagina();
    expect(doc.documentElement.lang).toBe("pt-BR");
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    expect(doc.title).toMatch(/StaziaMed Revalida/);
    expect(doc.title.length).toBeLessThanOrEqual(65);
    const desc = doc.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    expect(desc.length).toBeGreaterThan(50);
    expect(desc.length).toBeLessThanOrEqual(160);
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://app.staziamed.com.br/");
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe("https://app.staziamed.com.br/brand/og-image.png");
    expect(doc.querySelector('meta[name="viewport"]')?.getAttribute("content")).not.toMatch(/user-scalable=no|maximum-scale/);
  });

  it("JSON-LD só com Organização e Site: sem preço, oferta ou avaliação", () => {
    const doc = pagina();
    const blocos = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent || "{}"));
    expect(blocos).toHaveLength(1);
    const tipos = blocos[0]["@graph"].map((n: { "@type": string }) => n["@type"]);
    expect(tipos).toEqual(["Organization", "WebSite"]);
    expect(JSON.stringify(blocos)).not.toMatch(/Offer|Product|AggregateRating|Review|price/i);
  });

  it("nada de terceiros: fontes, estilos, scripts e imagens vêm do próprio site", () => {
    const doc = pagina();
    const carregados = [
      ...[...doc.querySelectorAll("script[src]")].map((e) => e.getAttribute("src")),
      ...[...doc.querySelectorAll('link[rel="stylesheet"], link[rel="preload"], link[rel="icon"], link[rel="manifest"], link[rel="apple-touch-icon"]')].map((e) => e.getAttribute("href")),
      ...[...doc.querySelectorAll("img[src], source[srcset]")].map((e) => e.getAttribute("src") || e.getAttribute("srcset")),
    ];
    for (const u of carregados) expect(u, String(u)).toMatch(/^\//);
    expect(html).not.toMatch(/googleapis|gstatic|googletagmanager|google-analytics|gtag\(|fbq\(|hotjar|vercel\/insights|speed-insights/i);
    expect(css).not.toMatch(/@import|https?:\/\//);
    // sem estilo inline (a página roda com Content-Security-Policy style-src 'self')
    expect(doc.querySelectorAll("[style]")).toHaveLength(0);
    expect(doc.querySelectorAll("style")).toHaveLength(0);
    expect(doc.querySelectorAll("script:not([src]):not([type='application/ld+json'])")).toHaveLength(0);
  });

  it("404.html existe, não é indexada e não usa nada de fora", () => {
    expect(html404).toMatch(/Página não encontrada/);
    expect(html404).toMatch(/name="robots" content="noindex"/);
    expect(html404).not.toMatch(/https?:\/\//);
  });
});

describe("página inicial: links", () => {
  it("Entrar leva ao login e todo Teste grátis leva ao Criar conta", () => {
    const doc = pagina();
    const entrar = [...doc.querySelectorAll("[data-entrar]")];
    expect(entrar.length).toBeGreaterThanOrEqual(2);
    for (const a of entrar) expect(a.getAttribute("href")).toBe("/novo/login");
    const testes = [...doc.querySelectorAll("a")].filter((a) => /teste grátis/i.test(a.textContent || ""));
    expect(testes.length).toBeGreaterThanOrEqual(4);
    for (const a of testes) expect(a.getAttribute("href")).toBe("/novo/criar-conta");
  });

  it("rodapé tem Termos, Privacidade e os contatos", () => {
    const doc = pagina();
    const hrefs = [...doc.querySelectorAll("footer a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/novo/termos", "/novo/privacidade", "/novo/login", "/novo/criar-conta", "mailto:suporte@staziamed.com.br", "mailto:privacidade@staziamed.com.br"]));
    expect(textoDe(doc)).toMatch(/CNPJ 64\.964\.213\/0001-16/);
    expect(textoDe(doc)).toMatch(/Usamos só cookies essenciais/);
  });

  it("todo link interno (#) aponta para algo que existe e os ids não se repetem", () => {
    const doc = pagina();
    const ids = [...doc.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of doc.querySelectorAll('a[href^="#"]')) {
      const alvo = a.getAttribute("href")!.slice(1);
      expect(doc.getElementById(alvo), alvo).not.toBeNull();
    }
  });

  it("nenhum link para páginas do pacote de desenho (Main.dc.html) ou vazio", () => {
    expect(html).not.toMatch(/href="[^"]*\.dc\.html"|href="#"/);
  });
});

describe("página inicial: abas (fases, ciclo, franquia e ranking)", () => {
  it("cada aba aponta para o próprio painel e só a escolhida fica visível", () => {
    const doc = pagina();
    ligar(doc);
    const listas = [...doc.querySelectorAll('[role="tablist"]')];
    expect(listas).toHaveLength(4);
    for (const lista of listas) {
      const abas = [...lista.querySelectorAll('[role="tab"]')];
      expect(abas.filter((a) => a.getAttribute("aria-selected") === "true")).toHaveLength(1);
      for (const aba of abas) {
        const painel = doc.getElementById(aba.getAttribute("aria-controls")!)!;
        expect(painel.getAttribute("role")).toBe("tabpanel");
        expect(painel.hidden).toBe(aba.getAttribute("aria-selected") !== "true");
      }
    }
  });

  it("clique troca o painel das fases", () => {
    const doc = pagina();
    ligar(doc);
    (doc.getElementById("aba-fase-2") as HTMLButtonElement).click();
    expect(doc.getElementById("painel-fase-2")!.hidden).toBe(false);
    expect(doc.getElementById("painel-fase-1")!.hidden).toBe(true);
    expect(doc.getElementById("aba-fase-2")!.getAttribute("aria-selected")).toBe("true");
    expect((doc.getElementById("aba-fase-1") as HTMLElement).tabIndex).toBe(-1);
  });

  it("setas, Home e End andam pelos passos do ciclo", () => {
    const doc = pagina();
    ligar(doc);
    const passo1 = doc.getElementById("aba-passo-1")!;
    passo1.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(doc.getElementById("painel-passo-5")!.hidden).toBe(false);
    doc.getElementById("aba-passo-5")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(doc.getElementById("painel-passo-1")!.hidden).toBe(false);
    passo1.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(doc.getElementById("aba-passo-5")!.getAttribute("aria-selected")).toBe("true");
  });

  it("ranking troca o título entre semana e mês", () => {
    const doc = pagina();
    ligar(doc);
    (doc.getElementById("aba-rank-mes") as HTMLButtonElement).click();
    expect(doc.getElementById("titulo-ranking")!.textContent).toBe("Ranking do mês");
    expect(doc.getElementById("painel-rank-mes")!.hidden).toBe(false);
  });

  it("menu do celular abre, fecha com Esc e fecha ao escolher um link", () => {
    const doc = pagina();
    ligar(doc);
    const botao = doc.getElementById("botao-menu") as HTMLButtonElement;
    const painel = doc.getElementById("menu-celular")!;
    botao.click();
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(painel.hidden).toBe(false);
    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(painel.hidden).toBe(true);
    botao.click();
    (painel.querySelector("a") as HTMLAnchorElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(painel.hidden).toBe(true);
  });
});

describe("página inicial: acessibilidade básica", () => {
  it("imagens com texto alternativo, atalho para o conteúdo e botões com nome", () => {
    const doc = pagina();
    for (const img of doc.querySelectorAll("img")) {
      expect(img.hasAttribute("alt")).toBe(true);
      expect(img.getAttribute("width")).toBeTruthy();
      expect(img.getAttribute("height")).toBeTruthy();
    }
    expect(doc.querySelector('a.pular[href="#conteudo"]')).not.toBeNull();
    expect(doc.getElementById("conteudo")?.tagName).toBe("MAIN");
    for (const b of doc.querySelectorAll("button")) expect((b.textContent || "").trim() || b.getAttribute("aria-label")).toBeTruthy();
  });

  it("CSS respeita menos movimento, tem anel de foco e letras de no mínimo 12 px", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
    expect(css).toMatch(/:focus-visible/);
    const tamanhos = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(Math.min(...tamanhos)).toBeGreaterThanOrEqual(12);
  });

  it("contraste dos pares de cor usados em texto passa de 4,5:1", () => {
    const lum = (hex: string) => {
      const c = [0, 2, 4].map((i) => parseInt(hex.slice(i + 1, i + 3), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const razao = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const pares: Array<[string, string]> = [
      ["#0B5FC4", "#FFFFFF"], ["#0B5FC4", "#F1F5FB"], ["#0B5FC4", "#EBF5FF"], ["#4F5A69", "#F1F5FB"], ["#4F5A69", "#FFFFFF"],
      ["#FFFFFF", "#0A6FD8"], ["#9A5B06", "#FEF5E3"], ["#CFE0F7", "#052A5A"], ["#B3DCFF", "#052A5A"], ["#AFC6E6", "#052A5A"], ["#052A5A", "#FFFFFF"],
    ];
    for (const [t, f] of pares) expect(razao(t, f), `${t} sobre ${f}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe("página inicial: só promete o que existe (decisões do dono)", () => {
  it("o que não existe hoje não aparece", () => {
    const t = textoDe(pagina());
    for (const proibido of [/Meet/, /semana[il]s?\b.*simulado|simulados? semana/i, /ao vivo semanal|correção ao vivo/i, /PDF/, /StaziaMind/, /Farmácia/i, /Consultas com parceiros/i, /Grupos exclusivos/i, /\bMatch/i, /ilimitad/i, /3 personalidades/i, /Todas as personalidades/i, /acesso demonstrativo/i, /duas fases e ao Tutor/i, /aprovação garantida|garantimos sua aprovação/i, /troque por benefícios|trocados por desconto/i, /ranking próprio/i]) {
      expect(t, String(proibido)).not.toMatch(proibido);
    }
  });

  it("só o PRO tem preço; PRÁTICA e ELITE aparecem como Em breve, sem preço nem compra", () => {
    const doc = pagina();
    const planos = [...doc.querySelectorAll(".plano")];
    expect(planos).toHaveLength(3);
    expect(planos[0].textContent).toMatch(/R\$\s*99,90/);
    expect(planos[0].textContent).toMatch(/R\$\s*269,70/);
    for (const p of planos.slice(1)) {
      expect(p.textContent).toMatch(/Em breve/);
      expect(p.textContent).not.toMatch(/R\$/);
      expect(p.querySelector("a")).toBeNull();
    }
    expect(textoDe(doc)).not.toMatch(/169,90|458,70|199,90|539,70|152,90|179,90/);
  });

  it("o Tutor fala em 2 personagens e 4 personalidades, e a voz gasta só minutos", () => {
    const t = textoDe(pagina());
    expect(t).toMatch(/2 personagens · 4 personalidades/);
    expect(t).toMatch(/não gasta créditos/);
    expect(t).not.toMatch(/consome créditos e minutos/);
  });

  it("Coins sem valor em dinheiro e benefícios de parceiros como cortesia", () => {
    const t = textoDe(pagina());
    expect(t).toMatch(/Coins são bônus e não têm valor em dinheiro/);
    expect(t).toMatch(/não fazem parte do plano contratado/);
  });

  it("o arquivo sai com tudo desligado: os textos que dependem do app ficam escondidos", () => {
    const doc = pagina();
    expect(doc.documentElement.dataset.liberado).toBe("");
    const usados = new Set([...doc.querySelectorAll("[data-quando],[data-ate-la]")].flatMap((e) => (e.getAttribute("data-quando") || e.getAttribute("data-ate-la") || "").split(/\s+/)));
    expect([...usados].sort()).toEqual(["amostra", "carteira", "cobranca", "tutor"]);
    for (const p of usados) {
      expect(css).toContain(`html:not([data-liberado~="${p}"]) [data-quando~="${p}"]`);
      expect(css).toContain(`html[data-liberado~="${p}"] [data-ate-la~="${p}"]`);
    }
    // "Assinar o PRO" só existe sob a liberação da cobrança
    const assinar = [...doc.querySelectorAll("a")].find((a) => /Assinar o PRO/.test(a.textContent || ""));
    expect(assinar?.getAttribute("data-quando")).toBe("cobranca");
  });
});

describe("página inicial: script", () => {
  it("quem chega na raiz por link de e-mail volta para o app", () => {
    expect(destinoDoLinkDeEmail({ search: "", hash: "#access_token=abc&type=recovery" } as Location)).toBe("/novo#access_token=abc&type=recovery");
    expect(destinoDoLinkDeEmail({ search: "?code=123", hash: "" } as Location)).toBe("/novo?code=123");
    expect(destinoDoLinkDeEmail({ search: "", hash: "#error=access_denied&error_code=otp_expired" } as Location)).toBe("/novo#error=access_denied&error_code=otp_expired");
    expect(destinoDoLinkDeEmail({ search: "", hash: "#ferramentas" } as Location)).toBeNull();
    expect(destinoDoLinkDeEmail({ search: "", hash: "" } as Location)).toBeNull();
  });

  it("a prévia dos textos finais (?liberar=) só funciona no computador local", () => {
    const doc = pagina();
    aplicarPreviaLocal(doc, { hostname: "app.staziamed.com.br", search: "?liberar=tudo" } as Location);
    expect(doc.documentElement.dataset.liberado).toBe("");
    aplicarPreviaLocal(doc, { hostname: "127.0.0.1", search: "?liberar=carteira,xyz" } as Location);
    expect(doc.documentElement.dataset.liberado).toBe("carteira");
  });

  it("com sessão do app no navegador, Entrar vira Ir para o app", () => {
    const doc = pagina();
    const mem = { length: 1, key: () => "sb-abc-auth-token" } as unknown as Storage;
    ajustarEntrar(doc, mem);
    for (const a of doc.querySelectorAll("[data-entrar]")) {
      expect(a.textContent).toBe("Ir para o app");
      expect(a.getAttribute("href")).toBe("/novo");
    }
  });

  it("/novo/criar-conta abre o Criar conta; o resto abre o login", () => {
    expect(telaInicialPeloEndereco("/novo/criar-conta")).toBe("signup");
    expect(telaInicialPeloEndereco("/novo/criar-conta/")).toBe("signup");
    expect(telaInicialPeloEndereco("/novo/login")).toBe("login");
    expect(telaInicialPeloEndereco("/novo")).toBe("login");
  });
});
