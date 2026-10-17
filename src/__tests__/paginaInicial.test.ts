import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aplicarPreviaLocal, ajustarEntrar, atualizarTopo, destinoDoLinkDeEmail, digitarTitulo, ligarAbas, ligarMenu, ligarMetro } from "../inicio/inicio.js";
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

describe("página inicial: abas (fases, franquia e ranking)", () => {
  it("cada aba aponta para o próprio painel e só a escolhida fica visível", () => {
    const doc = pagina();
    ligar(doc);
    const listas = [...doc.querySelectorAll('[role="tablist"]')];
    expect(listas).toHaveLength(3);
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

describe("página inicial: comportamentos trazidos do site do grupo (visual continua o do desenho)", () => {
  it("fontes do desenho guardadas no próprio site; Manrope e JetBrains Mono não ficam no projeto", () => {
    expect(css).toMatch(/url\("\.\/fonts\/plus-jakarta-sans-latin\.woff2"\)/);
    expect(css).toMatch(/barlow-condensed-700\.woff2/);
    expect(css).not.toMatch(/Manrope|JetBrains|--mono/);
    expect(fs.readdirSync(path.join(raiz, "src/inicio/fonts")).sort()).toEqual(["OFL-PlusJakartaSans.txt", "plus-jakarta-sans-latin.woff2"]);
  });

  it("título com cursor digitando a segunda parte; leitor de tela recebe a frase inteira", () => {
    const doc = pagina();
    const h1 = doc.querySelector("h1")!;
    expect(textoDe(doc).includes("Estude, treine e dispute. Tudo no mesmo lugar.")).toBe(true);
    expect(h1.querySelector("[data-digita]")?.textContent).toBe("Tudo no mesmo lugar.");
    expect(h1.querySelector(".cursor")?.getAttribute("aria-hidden")).toBe("true");
    digitarTitulo(doc, false);
    expect(h1.querySelector(".so-leitor")?.textContent).toBe("Tudo no mesmo lugar.");
    expect(h1.querySelector('[aria-hidden="true"]')?.querySelectorAll(".letra")).toHaveLength("Tudo no mesmo lugar.".length);
    const parado = pagina();
    digitarTitulo(parado, true); // menos movimento: nada muda
    expect(parado.querySelectorAll(".letra")).toHaveLength(0);
  });

  it("topo gruda no alto, ganha sombra ao rolar e a barra fina acompanha a rolagem", () => {
    const doc = pagina();
    const barra = doc.querySelector(".topo__progresso") as HTMLElement;
    expect(barra.getAttribute("aria-hidden")).toBe("true");
    Object.defineProperty(doc.documentElement, "scrollHeight", { value: 2800, configurable: true });
    atualizarTopo(doc, { scrollY: 0, innerHeight: 800 } as unknown as Window, true);
    expect(doc.getElementById("topo")!.classList.contains("topo--rolou")).toBe(false);
    expect(barra.style.transform).toBe("scaleX(0)");
    atualizarTopo(doc, { scrollY: 1000, innerHeight: 800 } as unknown as Window, true);
    expect(doc.getElementById("topo")!.classList.contains("topo--rolou")).toBe(true);
    expect(barra.style.transform).toBe("scaleX(0.5)");
    expect(css).toMatch(/\.topo \{ position: sticky; top: 0;/);
    expect(css).toMatch(/animation-timeline: scroll\(root\)/);
  });

  it("menos movimento: o CSS desliga animações e transições, esconde barra, cursor e bolinha e deixa a linha acesa", () => {
    const bloco = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(bloco).toMatch(/animation: none !important; transition: none !important/);
    expect(bloco).toMatch(/\.topo__progresso, \.cursor, \.metro__bolinha \{ display: none; \}/);
    expect(bloco).toMatch(/\.js \.metro__aceso \{ transform: none; \}/);
  });

  it("só anima transform e opacity (nada de mexer em largura, altura ou posição)", () => {
    const quadros = [...css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?\})\s*\}/g)].map((m) => m[1]);
    expect(quadros.length).toBeGreaterThanOrEqual(6);
    for (const q of quadros) {
      const props = [...q.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const prop of props) expect(["transform", "opacity"], q).toContain(prop);
    }
  });
});

describe("página inicial: passos do ciclo acendendo", () => {
  function metro(reduzido = false) {
    const doc = pagina();
    const raizMetro = doc.querySelector<HTMLElement>("[data-metro]")!;
    const win = { scrollY: 0, innerHeight: 800, setTimeout: () => 0, clearTimeout: () => undefined } as unknown as Window;
    const api = ligarMetro(raizMetro, win, { reduzido });
    const botoes = [...raizMetro.querySelectorAll<HTMLButtonElement>(".metro__no")];
    return { doc, raizMetro, api, botoes };
  }

  it("5 passos na ordem Estude, Treine, Simule, Corrija, Revise, com número e todo o texto visível", () => {
    const { doc, botoes } = metro();
    expect(botoes.map((b) => b.querySelector(".metro__nome")!.textContent)).toEqual(["Passo 1 de 5: Estude", "Passo 2 de 5: Treine", "Passo 3 de 5: Simule", "Passo 4 de 5: Corrija", "Passo 5 de 5: Revise"]);
    expect(botoes.map((b) => b.querySelector(".metro__ponto")!.textContent)).toEqual(["1", "2", "3", "4", "5"]);
    // nada de abas escondendo conteúdo: os 5 passos ficam no HTML e visíveis (bom para o Google e sem JavaScript)
    expect(doc.querySelectorAll("#ciclo [hidden], #ciclo [role=tab], #ciclo [role=tabpanel]")).toHaveLength(0);
    expect(doc.querySelectorAll("#ciclo .metro__t")).toHaveLength(5);
  });

  it("começa no passo 1 (aria-current) e só ele recebe o Tab", () => {
    const { botoes } = metro();
    expect(botoes[0].getAttribute("aria-current")).toBe("step");
    expect(botoes.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it("clique escolhe o passo, acende até ele e anuncia ao leitor de tela", () => {
    const { doc, botoes } = metro();
    botoes[3].click();
    expect(botoes[3].getAttribute("aria-current")).toBe("step");
    expect(botoes.filter((b) => b.hasAttribute("aria-current"))).toHaveLength(1);
    expect(botoes[3].closest("li")!.classList.contains("metro__parada--ativa")).toBe(true);
    const anuncio = doc.getElementById("ciclo-anuncio")!;
    expect(anuncio.getAttribute("aria-live")).toBe("polite");
    expect(anuncio.textContent).toBe("Passo 4 de 5: Corrija. Corrija com explicação");
  });

  it("setas, Home e End andam entre os passos", () => {
    const { botoes } = metro();
    const tecla = (b: HTMLElement, key: string) => b.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    tecla(botoes[0], "ArrowRight");
    expect(botoes[1].getAttribute("aria-current")).toBe("step");
    tecla(botoes[1], "End");
    expect(botoes[4].getAttribute("aria-current")).toBe("step");
    tecla(botoes[4], "ArrowLeft");
    expect(botoes[3].getAttribute("aria-current")).toBe("step");
    tecla(botoes[3], "Home");
    expect(botoes[0].getAttribute("aria-current")).toBe("step");
    expect(botoes.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it("com menos movimento a linha fica toda acesa e parada (sem bolinha correndo)", () => {
    const { raizMetro, botoes } = metro(true);
    expect(raizMetro.querySelectorAll(".metro__parada--acesa")).toHaveLength(5);
    botoes[2].click();
    expect(raizMetro.classList.contains("metro--corre")).toBe(false);
    expect((raizMetro.querySelector(".metro__aceso") as HTMLElement).style.transform).toBe("");
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

  it("sem parcelamento: pagamento só à vista por Pix ou cartão (decisão de 17/10)", () => {
    expect(html).not.toMatch(/\d\s*[x×]\s*sem juros|parcel/i);
    const doc = pagina();
    const pagamento = [...doc.querySelectorAll(".planos__regras li")].find((li) => /Pix/.test(li.textContent || ""));
    expect(pagamento?.textContent).toMatch(/à vista/);
  });

  it("o teste grátis é anunciado como amostra diária em toda chamada", () => {
    const doc = pagina();
    for (const sel of [".abertura__nota", ".faixa__item:last-child", ".planos__regras li:first-child", '.chamada__p[data-ate-la="amostra"]', '.chamada__p[data-quando="amostra"]']) {
      expect(doc.querySelector(sel)?.textContent, sel).toMatch(/amostra/);
    }
    expect(doc.querySelector('.chamada__p[data-quando="amostra"]')?.textContent).toMatch(/20 questões.*1 simulado curto.*3 Temas/);
  });

  it("regras de pagamento, devolução e renovação só aparecem com a cobrança ligada; o link diz Termos de Uso", () => {
    const doc = pagina();
    const regras = [...doc.querySelectorAll(".planos__regras li")];
    expect(regras[0].getAttribute("data-quando")).toBeNull();
    for (const li of regras.slice(1)) expect(li.getAttribute("data-quando"), li.textContent || "").toBe("cobranca");
    expect(textoDe(doc)).not.toMatch(/renova sozinha|condições completas/);
    const renovacao = regras.find((li) => /renovação/.test(li.textContent || ""));
    expect(renovacao?.textContent).toMatch(/No Pix.*7 dias antes.*confirmado/);
  });

  it("questões oficiais: anos que estão no banco e sem prometer comentário em cada questão", () => {
    const t = textoDe(pagina());
    expect(t).toMatch(/2020 a 2026\/2/);
    expect(t).not.toMatch(/em cada questão|Cada questão tem/);
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
