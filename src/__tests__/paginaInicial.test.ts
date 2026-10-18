import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aplicarPreviaLocal, ajustarEntrar, atualizarTopo, destinoDoLinkDeEmail, digitarTitulo, ligarAbas, ligarAbre, ligarConversa, ligarMenu, ligarMetro } from "../inicio/inicio.js";
import { telaInicialPeloEndereco } from "../novo/app/AuthScreens.jsx";
import { HTML_DESLIGADA, LIBERACOES, aplicarTextos, chavePaginaInicial, paginaInicialLigada, palavrasLiberadas } from "../inicio/chave.js";

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
const APP = "https://app.staziamed.com.br/novo";

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
    // a página inicial fica no www (app.staziamed.com.br/ leva para /novo desde 18/10)
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://www.staziamed.com.br/");
    expect(doc.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe("https://www.staziamed.com.br/");
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe("https://www.staziamed.com.br/brand/compartilhar-inicio.jpg");
    expect(fs.existsSync(path.join(raiz, "public/brand/compartilhar-inicio.jpg"))).toBe(true);
    expect(doc.querySelector('meta[property="og:image:width"]')?.getAttribute("content")).toBe("1200");
    expect(doc.querySelector('meta[property="og:image:height"]')?.getAttribute("content")).toBe("630");
    expect(doc.querySelector('meta[name="viewport"]')?.getAttribute("content")).not.toMatch(/user-scalable=no|maximum-scale/);
  });

  it("JSON-LD só com Organização e Site: sem preço, oferta ou avaliação", () => {
    const doc = pagina();
    const blocos = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent || "{}"));
    expect(blocos).toHaveLength(1);
    const tipos = blocos[0]["@graph"].map((n: { "@type": string }) => n["@type"]);
    expect(tipos).toEqual(["Organization", "WebSite"]);
    expect(JSON.stringify(blocos)).not.toMatch(/Offer|Product|AggregateRating|Review|price/i);
    // sem endereço (o dono tirou o endereço da página em 18/10)
    expect(JSON.stringify(blocos)).not.toMatch(/address|streetAddress|Visconde|Conj\./i);
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
  it("Entrar leva ao login do app e todo botão de teste grátis leva ao Criar conta do app (app.staziamed.com.br/novo)", () => {
    const doc = pagina();
    const entrar = [...doc.querySelectorAll("[data-entrar]")];
    expect(entrar.length).toBeGreaterThanOrEqual(3);
    for (const a of entrar) expect(a.getAttribute("href")).toBe(`${APP}/entrar`);
    expect(html404).toContain('href="/novo/entrar"');
    const testes = [...doc.querySelectorAll('a[data-evento="trial_cta_clicked"]')];
    expect(testes.length).toBeGreaterThanOrEqual(5);
    for (const a of testes) expect(a.getAttribute("href")).toBe(`${APP}/criar-conta`);
    expect(testes.map((a) => (a.textContent || "").trim())).toEqual(expect.arrayContaining(["Teste grátis", "Começar meus 7 dias grátis", "Começar grátis"]));
    // nada de links do desenho para www.staziamed.com.br/novo (dariam uma volta a mais) nem parâmetros que o cadastro não lê
    expect(html).not.toMatch(/www\.staziamed\.com\.br\/novo|[?&](plano|ciclo)=/);
    // todo link para o app vai para o app.staziamed.com.br
    for (const a of doc.querySelectorAll('a[href*="/novo"]')) expect(a.getAttribute("href"), a.textContent || "").toMatch(/^https:\/\/app\.staziamed\.com\.br\/novo(\/|$)/);
  });

  it("atendimento pelo WhatsApp oficial do SAC (o mesmo do Contrato), abrindo sem passar o endereço de origem", () => {
    const doc = pagina();
    const zap = [...doc.querySelectorAll('a[href^="https://wa.me/"]')];
    expect(zap.length).toBeGreaterThanOrEqual(4);
    for (const a of zap) {
      expect(a.getAttribute("href")).toBe("https://wa.me/5541999031074");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("rodapé tem as páginas legais 3.0 (Termos e Contrato, Privacidade, Regulamento) e os contatos", () => {
    const doc = pagina();
    const hrefs = [...doc.querySelectorAll("footer a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining([`${APP}/termos`, `${APP}/privacidade`, `${APP}/regulamento`, `${APP}/entrar`, `${APP}/criar-conta`, "mailto:suporte@staziamed.com.br"]));
    // os mesmos nomes do menu das páginas legais do app (src/novo/app/legal/LegalPage.jsx)
    const legal = fs.readFileSync(path.join(raiz, "src/novo/app/legal/LegalPage.jsx"), "utf-8");
    for (const nome of ["Termos de Uso e Contrato", "Política de Privacidade", "Regulamento de Coins e Ligas"]) {
      expect(legal).toContain(nome);
      expect([...doc.querySelectorAll("footer a")].some((a) => a.textContent === nome), nome).toBe(true);
    }
    const robots = fs.readFileSync(path.join(raiz, "public/robots.txt"), "utf-8");
    const sitemap = fs.readFileSync(path.join(raiz, "public/sitemap.xml"), "utf-8");
    for (const p of ["/novo/termos", "/novo/privacidade", "/novo/regulamento"]) {
      expect(robots).toContain(`Allow: ${p}`);
      expect(sitemap).toContain(`https://app.staziamed.com.br${p}<`);
    }
    expect(textoDe(doc)).toMatch(/CNPJ 64\.964\.213\/0001-16/);
    expect(textoDe(doc)).toMatch(/Usamos só cookies essenciais/);
    expect(sitemap).toContain("<loc>https://www.staziamed.com.br/</loc>");
    expect(robots).toContain("Sitemap: https://www.staziamed.com.br/sitemap.xml");
  });

  it("rodapé só com a empresa, o CNPJ e os contatos: sem nome nem endereço do dono (pedido de 18/10)", () => {
    const doc = pagina();
    const base = (doc.querySelector(".rodape__base")?.textContent || "").replace(/\s+/g, " ");
    expect(base).toContain("Stazia Tecnologia e Educação Ltda · CNPJ 64.964.213/0001-16");
    const tudo = textoDe(doc) + html;
    expect(tudo).not.toMatch(/Jo[aã]o Paulo|Mendes|Visconde|Rio Branco|Conj\.|80420|Curitiba|Encarregad/i);
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

describe("página inicial: abas (telas do app, grupos de ferramentas e mensal/trimestral)", () => {
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

  it("clique troca a tela do app e o grupo de ferramentas", () => {
    const doc = pagina();
    ligar(doc);
    (doc.getElementById("aba-tela-desempenho") as HTMLButtonElement).click();
    expect(doc.getElementById("tela-desempenho")!.hidden).toBe(false);
    expect(doc.getElementById("tela-questoes")!.hidden).toBe(true);
    expect((doc.getElementById("aba-tela-questoes") as HTMLElement).tabIndex).toBe(-1);
    (doc.getElementById("aba-grupo-evolua") as HTMLButtonElement).click();
    expect(doc.getElementById("grupo-evolua")!.hidden).toBe(false);
    expect(doc.getElementById("grupo-aprenda")!.hidden).toBe(true);
  });

  it("a chave A cada 3 meses mostra R$ 89,90 por mês e o total de R$ 269,70; Mensal volta a R$ 99,90", () => {
    const doc = pagina();
    ligar(doc);
    expect(doc.getElementById("preco-mensal")!.textContent).toMatch(/R\$ 99,90/);
    (doc.getElementById("aba-trimestral") as HTMLButtonElement).click();
    const tri = doc.getElementById("preco-trimestral")!;
    expect(tri.hidden).toBe(false);
    expect(tri.textContent).toMatch(/R\$ 89,90.*R\$ 269,70 a cada 3 meses/s);
    expect(doc.getElementById("preco-mensal")!.hidden).toBe(true);
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
    const frase = "Sua evolução em cada estudo.";
    expect(textoDe(doc).includes(`Sua preparação organizada. ${frase}`)).toBe(true);
    expect(h1.querySelector("[data-digita]")?.textContent).toBe(frase);
    expect(h1.querySelector(".cursor")?.getAttribute("aria-hidden")).toBe("true");
    digitarTitulo(doc, false);
    expect(h1.querySelector(".so-leitor")?.textContent).toBe(frase);
    const visual = h1.querySelector('[aria-hidden="true"]')!;
    // como no desenho: cada palavra num bloco que não quebra, e só as letras (sem os espaços) aparecem uma a uma
    expect([...visual.querySelectorAll(".palavra")].map((p) => p.textContent)).toEqual(frase.split(" "));
    expect(visual.querySelectorAll(".letra")).toHaveLength(frase.replace(/ /g, "").length);
    expect((visual.querySelectorAll(".letra")[3] as HTMLElement).style.getPropertyValue("--i")).toBe("4");
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
    expect(anuncio.textContent).toBe("Passo 4 de 5: Corrija. Corrija entendendo o raciocínio");
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

  it("CSS respeita menos movimento, tem anel de foco e letras de no mínimo 11 px (só os selos em caixa alta do desenho têm 11)", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
    expect(css).toMatch(/:focus-visible/);
    const tamanhos = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(Math.min(...tamanhos)).toBeGreaterThanOrEqual(11);
  });

  it("contraste dos pares de cor usados em texto passa de 4,5:1", () => {
    const lum = (hex: string) => {
      const c = [0, 2, 4].map((i) => parseInt(hex.slice(i + 1, i + 3), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const razao = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    // cores do desenho (Home v7, "cores da auditoria")
    const pares: Array<[string, string]> = [
      ["#1559C4", "#FFFFFF"], ["#1559C4", "#F4F7FC"], ["#1559C4", "#E8F0FC"], ["#4F5A69", "#FFFFFF"], ["#4F5A69", "#F4F7FC"], ["#4F5A69", "#DCE1E8"],
      ["#071F43", "#23D5C3"], ["#FFFFFF", "#1559C4"], ["#D4E2F2", "#071F43"], ["#B9CCE2", "#071F43"], ["#9FB6D2", "#071F43"], ["#9FB6D2", "#052A5A"],
      ["#23D5C3", "#052A5A"], ["#0B6B4F", "#E1F6EE"], ["#071F43", "#F3B44B"],
    ];
    for (const [t, f] of pares) expect(razao(t, f), `${t} sobre ${f}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe("página inicial: só promete o que existe (decisões do dono)", () => {
  it("o que não existe hoje não aparece", () => {
    const t = textoDe(pagina());
    for (const proibido of [/captura real da tela entra aqui/i, /amanhã/i, /comentário de cada alternativa/i, /Meet/, /semana[il]s?\b.*simulado|simulados? semana/i, /ao vivo semanal|correção ao vivo/i, /PDF/, /StaziaMind/, /Farmácia/i, /Consultas com parceiros/i, /Grupos exclusivos/i, /\bMatch/i, /ilimitad/i, /3 personalidades/i, /Todas as personalidades/i, /acesso demonstrativo/i, /duas fases e ao Tutor/i, /aprova/i, /troque por benefícios|trocados por desconto/i, /ranking próprio/i]) {
      expect(t, String(proibido)).not.toMatch(proibido);
    }
  });

  it("só o PRO tem preço (R$ 99,90 ou R$ 269,70 a cada 3 meses, a conta fecha); PRÁTICA e ELITE aparecem como Em breve, sem preço nem compra", () => {
    const doc = pagina();
    const pro = doc.querySelector(".pro")!;
    expect(pro.textContent).toMatch(/R\$ 99,90/);
    expect(pro.textContent).toMatch(/R\$ 269,70/);
    expect(pro.textContent).toMatch(/R\$ 3,33 por dia/); // 99,90 / 30
    expect(textoDe(doc)).toMatch(/economiza R\$ 30,00/); // 3 × 99,90 − 269,70
    const outros = [...doc.querySelectorAll(".fase2__plano")];
    expect(outros).toHaveLength(2);
    for (const p of outros) {
      expect(p.textContent).toMatch(/Em breve/i);
      expect(p.textContent).not.toMatch(/R\$/);
      expect(p.querySelector("a")).toBeNull();
    }
    expect(doc.querySelector(".fase2")!.textContent).not.toMatch(/R\$/);
    expect(textoDe(doc)).not.toMatch(/169,90|458,70|199,90|539,70|152,90|179,90/);
    // nada de "de/por" riscado
    expect(html).not.toMatch(/<s>|<del>|line-through/);
  });

  it("o Tutor fala em dois personagens e quatro personalidades, e a voz gasta só minutos", () => {
    const t = textoDe(pagina());
    expect(t).toMatch(/Dois personagens e quatro personalidades/);
    expect(t).toMatch(/não gasta créditos/);
    expect(t).not.toMatch(/consome créditos e minutos/);
  });

  it("Coins sem valor em dinheiro", () => {
    const t = textoDe(pagina());
    expect(t).toMatch(/Coins são bônus e não têm valor em dinheiro/);
  });

  it("preço do PRO em destaque (pedido do dono 18/10): herói, barra de baixo, selo Disponível agora e Economize R$ 30 no trimestral, sem exagero", () => {
    const doc = pagina();
    const heroi = doc.querySelector('.heroi__preco[data-quando="cobranca"]')!;
    expect(heroi.textContent?.replace(/\s+/g, " ")).toBe("7 dias grátis, sem cartão · depois, PRO por R$ 99,90/mês");
    expect(heroi.querySelector("strong")?.textContent?.replace(/\s+/g, " ")).toBe("R$ 99,90/mês");
    // sem a cobrança ligada, o preço aparece como previsto (nada de "depois, PRO por" com a contratação fechada)
    expect(doc.querySelector('.heroi__preco[data-ate-la="cobranca"]')?.textContent).toMatch(/PRO previsto: R\$\s99,90\/mês/);
    const barra = doc.querySelector(".barra-fixa__preco")!;
    expect(barra.textContent?.replace(/\s+/g, " ")).toBe("PRO R$ 99,90/mês");
    expect(barra.getAttribute("data-quando")).toBe("cobranca");
    expect(barra.getAttribute("href")).toBe("#planos");
    expect(doc.querySelector('.pro__selo[data-quando="cobranca"]')?.textContent).toBe("Disponível agora");
    expect(doc.querySelector("#preco-trimestral .pro__economia")?.textContent).toBe("Economize R$ 30");
    expect(doc.querySelector("#preco-mensal .pro__economia")).toBeNull();
    expect(doc.querySelector(".topo__nav .topo__link--planos")?.getAttribute("href")).toBe("#planos");
    // nada que não dê para provar nem urgência falsa
    expect(textoDe(doc)).not.toMatch(/mais escolhid|mais popular|mais vendid|recomendad|últimas vagas|só hoje|por tempo limitado|oferta|promoção/i);
    // o celular estreito não aperta o botão: com o preço na barra, o atendimento sai da barra abaixo de 480 px
    expect(css).toMatch(/@media \(max-width: 480px\) \{ html\[data-liberado~="cobranca"\] \.barra-fixa__atendimento \{ display: none; \} \}/);
    expect(css).toMatch(/\.barra-fixa__acoes \.barra-fixa__cta \{ flex: 1 0 auto; white-space: nowrap; \}/);
  });

  it("sem parcelamento: pagamento só à vista por Pix ou cartão (decisão de 17/10)", () => {
    expect(html).not.toMatch(/\d\s*[x×]\s*sem juros|parcel/i);
    const doc = pagina();
    const pagamento = [...doc.querySelectorAll(".regra")].find((li) => /Pix/.test(li.textContent || ""));
    expect(pagamento?.textContent).toMatch(/à vista/);
  });

  it("a página não detalha o que o teste grátis inclui (pedido do dono 18/10): sem quadro e sem números de limite", () => {
    const doc = pagina();
    expect(doc.querySelector(".incluido")).toBeNull();
    expect(html).not.toMatch(/20 questões por dia|2 min de voz no teste inteiro|5 créditos de Tutor IA por dia/);
    const faq = [...doc.querySelectorAll(".pergunta")][0];
    expect(faq.textContent).toMatch(/não pede cartão/);
    expect(faq.textContent).not.toMatch(/20 questões|2 minutos de voz/);
  });

  it("regras de pagamento, renovação e cancelamento só aparecem com a cobrança ligada; o arrependimento (lei) sempre", () => {
    const doc = pagina();
    const regras = [...doc.querySelectorAll(".regra")];
    expect(regras[0].getAttribute("data-quando")).toBeNull();
    expect(regras[0].textContent).toMatch(/7 dias, sem cartão/);
    for (const li of regras.filter((r) => /Pix ou cartão|Minha Conta/.test(r.textContent || ""))) expect(li.getAttribute("data-quando"), li.textContent || "").toBe("cobranca");
    const renovacao = [...doc.querySelectorAll(".pergunta")].find((d) => /renovação\?/.test(d.querySelector("summary")?.textContent || ""));
    expect(renovacao?.querySelector('[data-quando="cobranca"]')?.textContent).toMatch(/No Pix.*7 dias antes.*confirmado/);
    expect(doc.querySelector(".arrependimento")?.getAttribute("data-quando")).toBeNull();
    expect(doc.querySelector(".arrependimento")?.textContent).toMatch(/art\. 49/);
    expect(doc.querySelector('.arrependimento a')?.getAttribute("href")).toBe(`${APP}/termos`);
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
    expect([...usados].sort()).toEqual(["carteira", "cobranca", "tutor"]);
    for (const p of usados) {
      expect(css).toContain(`html:not([data-liberado~="${p}"]) [data-quando~="${p}"]`);
      expect(css).toContain(`html[data-liberado~="${p}"] [data-ate-la~="${p}"]`);
    }
    // "Contratar o PRO" e "vendas abertas" só existem sob a liberação da cobrança
    const contratar = [...doc.querySelectorAll("a")].find((a) => /Contratar o PRO/.test(a.textContent || ""));
    expect(contratar?.getAttribute("data-quando")).toBe("cobranca");
    expect(contratar?.getAttribute("href")).toBe(`${APP}/planos`);
    for (const e of [...doc.querySelectorAll("*")].filter((x) => x.children.length === 0 && /vendas abertas/i.test(x.textContent || ""))) {
      expect(e.closest("[data-quando]")?.getAttribute("data-quando"), e.textContent || "").toBe("cobranca");
    }
    // os números da franquia do Tutor só com a carteira ligada
    expect(doc.querySelector('[data-quando="carteira"]')?.textContent).toMatch(/8 créditos por dia, até 180 por mês, e 10 minutos/);
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
      expect(a.getAttribute("href")).toBe(APP);
    }
  });

  it("demonstração do Tutor: começa com uma fala, Reproduzir mostra uma a uma e Mostrar a conversa toda mostra as 4", () => {
    const doc = pagina();
    const relogios: Array<() => void> = [];
    const win = { setTimeout: (f: () => void) => { relogios.push(f); return relogios.length; }, clearTimeout: () => undefined } as unknown as Window;
    const api = ligarConversa(doc, win, false)!;
    expect(api.visiveis).toBe(1);
    (doc.getElementById("conversa-tocar") as HTMLButtonElement).click();
    expect(doc.getElementById("conversa-tocar-rotulo")!.textContent).toBe("Reproduzindo…");
    relogios.shift()!();
    expect(api.visiveis).toBe(2);
    (doc.getElementById("conversa-tudo") as HTMLButtonElement).click();
    expect(api.visiveis).toBe(4);
    expect(doc.getElementById("conversa-tocar-rotulo")!.textContent).toBe("Reproduzir de novo");
    // sem JavaScript as 4 falas já estão no HTML e os botões somem (inicio-sem-js.css)
    expect(pagina().querySelectorAll("#conversa-falas .fala")).toHaveLength(4);
    expect(fs.readFileSync(path.join(raiz, "public/inicio-sem-js.css"), "utf-8")).toMatch(/\.conversa__botoes \{ display: none !important; \}/);
    expect(textoDe(doc)).toMatch(/Respostas escritas previamente para esta demonstração/);
  });

  it("lista de interesse da 2ª fase: o botão abre o encaixe do formulário (que vem do ramo lista-interesse)", () => {
    const doc = pagina();
    const botao = doc.getElementById("botao-interesse") as HTMLButtonElement;
    const encaixe = doc.getElementById("lista-interesse")!;
    expect(encaixe.getAttribute("data-encaixe")).toBe("lista-interesse");
    expect(encaixe.hidden).toBe(true);
    ligarAbre(botao, doc);
    botao.click();
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(encaixe.hidden).toBe(false);
    botao.click();
    expect(encaixe.hidden).toBe(true);
  });

  it("telas T1 a T4 e a Arena (T6, Liga da semana) são capturas reais do app no tamanho do desenho, com texto alternativo e aviso de dados de exemplo", () => {
    const doc = pagina();
    const imgs = [doc.querySelector(".painel-app__tela img"), ...doc.querySelectorAll(".tela-real img"), doc.querySelector(".semana--real img")] as HTMLImageElement[];
    expect(imgs).toHaveLength(5);
    expect(doc.querySelector(".semana--real .semana__nota")?.textContent).toBe("Tela do aplicativo. Os dados são de exemplo.");
    expect(doc.querySelector(".semana--real img")?.getAttribute("alt")).toMatch(/Liga da semana/);
    // a ilustração "Sua semana" saiu (o app não tem essa faixa)
    expect(textoDe(doc)).not.toMatch(/Sua semana|Exemplo ilustrativo|960 XP/);
    for (const img of imgs) {
      expect((img.getAttribute("alt") || "").length, img.outerHTML).toBeGreaterThan(40);
      expect(img.getAttribute("alt")).toMatch(/aplicativo StaziaMed/);
    }
    expect([...doc.querySelectorAll(".demo__legenda")].map((p) => p.textContent)).toEqual([
      "Tela do aplicativo: questão do Revalida 2026/1.", "Tela do aplicativo com dados de exemplo. Não representa resultado de alunos.", "Tela do aplicativo. Os dados são de exemplo.",
    ]);
    expect(doc.querySelector(".painel-app__nota")?.textContent).toMatch(/dados são de exemplo/);
    // cada arquivo citado existe (AVIF e WebP, 1x e 2x, celular, tablet e computador)
    const citados = new Set([...html.matchAll(/\/src\/inicio\/img\/[\w/.-]+\.(?:avif|webp|png)/g)].map((m) => m[0]));
    expect(citados.size).toBeGreaterThanOrEqual(60);
    for (const c of citados) expect(fs.existsSync(path.join(raiz, c)), c).toBe(true);
  });

  it("perguntas abrem sem JavaScript (details), uma por vez, com a primeira aberta", () => {
    const doc = pagina();
    const perguntas = [...doc.querySelectorAll("details.pergunta")];
    expect(perguntas).toHaveLength(10);
    expect(perguntas.filter((d) => d.hasAttribute("open"))).toHaveLength(1);
    expect(perguntas[0].hasAttribute("open")).toBe(true);
    for (const d of perguntas) expect(d.getAttribute("name")).toBe("duvidas");
  });

  it("/novo/criar-conta abre o Criar conta; o resto abre o login", () => {
    expect(telaInicialPeloEndereco("/novo/criar-conta")).toBe("signup");
    expect(telaInicialPeloEndereco("/novo/criar-conta/")).toBe("signup");
    expect(telaInicialPeloEndereco("/novo/login")).toBe("login");
    expect(telaInicialPeloEndereco("/novo")).toBe("login");
  });
});

describe("página inicial: chaves PAGINA_INICIAL e PAGINA_INICIAL_TEXTOS (build)", () => {
  it("só liga com PAGINA_INICIAL=ligada (sem a variável, / continua levando ao app)", () => {
    expect(paginaInicialLigada({})).toBe(false);
    expect(paginaInicialLigada({ PAGINA_INICIAL: "" })).toBe(false);
    expect(paginaInicialLigada({ PAGINA_INICIAL: "desligada" })).toBe(false);
    expect(paginaInicialLigada({ PAGINA_INICIAL: "ligada" })).toBe(true);
    expect(paginaInicialLigada({ PAGINA_INICIAL: " Ligada " })).toBe(true);
    expect(paginaInicialLigada({ PAGINA_INICIAL: "1" })).toBe(true);
  });

  it("textos: hoje = nada liberado; pronto = tudo; ou só as palavras pedidas", () => {
    expect(palavrasLiberadas({})).toEqual([]);
    expect(palavrasLiberadas({ PAGINA_INICIAL_TEXTOS: "hoje" })).toEqual([]);
    expect(palavrasLiberadas({ PAGINA_INICIAL_TEXTOS: "pronto" })).toEqual(["cobranca", "carteira", "tutor", "amostra"]);
    expect(palavrasLiberadas({ PAGINA_INICIAL_TEXTOS: "tutor, cobranca xyz" })).toEqual(["cobranca", "tutor"]);
    // as mesmas palavras do script da página e do CSS
    const js = fs.readFileSync(path.join(raiz, "src/inicio/inicio.js"), "utf-8");
    expect(js).toContain(`const LIBERACOES = ${JSON.stringify(LIBERACOES).replace(/,/g, ", ")};`);
  });

  it("ligada: escreve as palavras no <html> e mantém o resto da página igual", () => {
    const pronto = aplicarTextos(html, { PAGINA_INICIAL_TEXTOS: "pronto" });
    const doc = new DOMParser().parseFromString(pronto, "text/html");
    expect(doc.documentElement.dataset.liberado).toBe("cobranca carteira tutor amostra");
    expect(pronto.replace('data-liberado="cobranca carteira tutor amostra"', 'data-liberado=""')).toBe(html);
    expect(new DOMParser().parseFromString(aplicarTextos(html, {}), "text/html").documentElement.dataset.liberado).toBe("");
  });

  it("o plugin só mexe no index.html: desligada vira a página que leva ao app, sem nada inline", () => {
    const plugin = chavePaginaInicial({});
    const h = plugin.transformIndexHtml.handler;
    expect(h(html, { filename: "/x/index.html", path: "/index.html" })).toBe(HTML_DESLIGADA);
    expect(h(html404, { filename: "/x/404.html", path: "/404.html" })).toBe(html404);
    expect(h("<html>novo</html>", { filename: "/x/novo.html", path: "/novo.html" })).toBe("<html>novo</html>");
    const ligada = chavePaginaInicial({ PAGINA_INICIAL: "ligada", PAGINA_INICIAL_TEXTOS: "hoje" }).transformIndexHtml.handler;
    expect(ligada(html, { filename: "/x/index.html", path: "/index.html" })).toBe(html);
    const doc = new DOMParser().parseFromString(HTML_DESLIGADA, "text/html");
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
    expect(doc.querySelector("script[src]")?.getAttribute("src")).toBe("/src/inicio/ir-para-o-app.js");
    expect(doc.querySelectorAll("script:not([src]), [style], style")).toHaveLength(0);
    expect(HTML_DESLIGADA).not.toMatch(/https?:\/\//);
    const ir = fs.readFileSync(path.join(raiz, "src/inicio/ir-para-o-app.js"), "utf-8");
    expect(ir).toContain('location.replace("/novo" + location.search + location.hash)');
  });
});
