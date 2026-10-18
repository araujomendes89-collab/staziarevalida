// Página inicial (Home v7): abas (telas do app, grupos de ferramentas, mensal/trimestral), linha de metrô do ciclo, título
// digitado com cursor, demonstração do Tutor, topo que ganha sombra e barra de leitura, menu do celular.
// Sem React, sem biblioteca, sem cookie, sem nada de fora.
// Movimento só com transform e opacity; com "menos movimento" nada anima (o CSS também trava tudo).
// O CSS entra pelo <link> do HTML (sem piscar). Estilo só por CSSOM (style.setProperty), que a CSP permite.

const LIBERACOES = ["cobranca", "carteira", "tutor", "amostra"];

/** Volta para o app quem chegou na raiz por um link de e-mail (confirmar cadastro / nova senha / erro do link). */
export function destinoDoLinkDeEmail(loc) {
  const { search = "", hash = "" } = loc;
  const doEmail = /(?:^|[#&])(access_token|refresh_token|error_code|error)=/.test(hash) || /type=(recovery|signup|invite|magiclink|email_change)/.test(hash + search) || /[?&](code|token_hash|error_code)=/.test(search);
  return doEmail ? "/novo" + search + hash : null;
}

/** Abas acessíveis (padrão WAI-ARIA): clique, setas, Home e End. */
export function ligarAbas(lista) {
  const abas = Array.from(lista.querySelectorAll('[role="tab"]'));
  const doc = lista.ownerDocument;
  const escolher = (aba, focar) => {
    for (const a of abas) {
      const sel = a === aba;
      a.setAttribute("aria-selected", String(sel));
      a.tabIndex = sel ? 0 : -1;
      const painel = doc.getElementById(a.getAttribute("aria-controls"));
      if (painel) painel.hidden = !sel;
    }
    const alvo = lista.dataset.tituloAlvo && doc.getElementById(lista.dataset.tituloAlvo);
    if (alvo && aba.dataset.titulo) alvo.textContent = aba.dataset.titulo;
    if (focar) aba.focus();
  };
  for (const aba of abas) {
    aba.addEventListener("click", () => escolher(aba, false));
    aba.addEventListener("keydown", (e) => {
      const i = abas.indexOf(aba);
      let prox = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") prox = abas[(i + 1) % abas.length];
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") prox = abas[(i - 1 + abas.length) % abas.length];
      else if (e.key === "Home") prox = abas[0];
      else if (e.key === "End") prox = abas[abas.length - 1];
      if (prox) {
        e.preventDefault();
        escolher(prox, true);
        prox.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }
    });
  }
  escolher(abas.find((a) => a.getAttribute("aria-selected") === "true") || abas[0], false);
}

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Linha de metrô do ciclo (5 paradas). A linha acende conforme a pessoa rola (a parada da vez fica ativa)
 * ou quando ela toca/clica numa parada (fica ativa a escolhida, anunciada ao leitor de tela).
 * Teclado: Tab chega na parada ativa; setas, Home e End andam entre as paradas.
 * Celular/tablet: linha vertical; computador largo (CSS ≥ 1180 px): linha horizontal. Mede tudo no próprio desenho.
 */
export function ligarMetro(raiz, win = window, opcoes = {}) {
  const doc = raiz.ownerDocument;
  const paradas = Array.from(raiz.querySelectorAll(".metro__parada"));
  const botoes = paradas.map((p) => p.querySelector(".metro__no"));
  const trilho = raiz.querySelector(".metro__trilho");
  const aceso = raiz.querySelector(".metro__aceso");
  const anuncio = doc.getElementById("ciclo-anuncio");
  const reduzido = Boolean(opcoes.reduzido);
  const total = paradas.length;
  let ativo = -1;
  let manual = false;
  let ancora = null;
  let espera = 0;
  let horizontal = false;
  let comprimento = 0;
  let posicoes = paradas.map(() => 0);

  const textoDoPasso = (i) => {
    const nome = (botoes[i].querySelector(".metro__nome")?.textContent || "").trim();
    const titulo = (paradas[i].querySelector(".metro__t")?.textContent || "").trim();
    return `${nome}. ${titulo}`;
  };

  function acender(alcance) {
    paradas.forEach((p, k) => p.classList.toggle("metro__parada--acesa", reduzido || posicoes[k] <= alcance + 2));
  }

  function aplicarAlcance(alcance) {
    acender(alcance);
    if (reduzido || !aceso || comprimento <= 0) return;
    const f = limitar(alcance / comprimento, 0, 1);
    aceso.style.transform = horizontal ? `scaleX(${f})` : `scaleY(${f})`;
  }

  function bolinha() {
    const corre = !reduzido && ativo > 0 && posicoes[ativo] > 0;
    raiz.classList.toggle("metro--corre", corre);
    if (corre) raiz.style.setProperty("--alcance", `${Math.round(posicoes[ativo])}px`);
  }

  function marcarAtivo(i, { anunciar = false, focar = false } = {}) {
    if (i !== ativo) {
      paradas.forEach((p, k) => p.classList.toggle("metro__parada--ativa", k === i));
      botoes.forEach((b, k) => (k === i ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
      ativo = i;
      bolinha();
    }
    // o Tab cai na parada ativa (sem roubar o lugar de quem já está andando pelas paradas com o teclado)
    if (anunciar || !raiz.contains(doc.activeElement)) botoes.forEach((b, k) => (b.tabIndex = k === i ? 0 : -1));
    if (focar) botoes[i].focus();
    if (anunciar && anuncio) anuncio.textContent = textoDoPasso(i);
  }

  function medir() {
    if (!trilho) return;
    const t = trilho.getBoundingClientRect();
    horizontal = t.width > t.height;
    comprimento = horizontal ? t.width : t.height;
    posicoes = paradas.map((p) => {
      const r = (p.querySelector(".metro__ponto") || p).getBoundingClientRect();
      return Math.max(0, horizontal ? r.left + r.width / 2 - t.left : r.top + r.height / 2 - t.top);
    });
    bolinha();
  }

  /** Rolagem: a linha acende até o ponto de leitura (60% da tela no celular; no computador, conforme a linha sobe). */
  function aoRolar() {
    if (reduzido || !trilho) return;
    if (manual) {
      if (ancora === null || Math.abs(win.scrollY - ancora) < 240) return;
      manual = false;
      raiz.classList.remove("metro--manual");
    }
    const t = trilho.getBoundingClientRect();
    const vh = win.innerHeight || 1;
    const fim = posicoes[total - 1] || 0;
    if (fim <= 0) return; // ainda sem medida (página escondida ou sem desenho): não mexe
    const alcance = horizontal ? limitar((vh * 0.85 - t.top) / (vh * 0.45), 0, 1) * fim : limitar(vh * 0.6 - t.top, 0, fim);
    aplicarAlcance(alcance);
    let i = 0;
    posicoes.forEach((pos, k) => { if (pos <= alcance + 2) i = k; });
    marcarAtivo(i);
  }

  /** Escolha da pessoa (clique, toque ou teclado): acende até a parada e anuncia. Vale até ela rolar para longe. */
  function escolher(i, { focar = false } = {}) {
    const k = limitar(i, 0, total - 1);
    manual = true;
    raiz.classList.add("metro--manual");
    aplicarAlcance(posicoes[k]);
    marcarAtivo(k, { anunciar: true, focar });
    ancora = null;
    win.clearTimeout(espera);
    espera = win.setTimeout(() => { ancora = win.scrollY; }, 800);
  }

  botoes.forEach((b, k) => {
    b.addEventListener("click", () => escolher(k));
    b.addEventListener("keydown", (e) => {
      let prox = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") prox = Math.min(total - 1, k + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") prox = Math.max(0, k - 1);
      else if (e.key === "Home") prox = 0;
      else if (e.key === "End") prox = total - 1;
      if (prox !== null) {
        e.preventDefault();
        escolher(prox, { focar: true });
      }
    });
  });

  medir();
  if (reduzido) acender(Infinity);
  marcarAtivo(0);
  aoRolar();
  return { medir, aoRolar, escolher, get ativo() { return ativo; } };
}

/** Título principal: a segunda frase aparece letra por letra, com cursor (como no desenho: palavras sem quebrar no meio).
 *  Leitor de tela recebe o texto inteiro. */
export function digitarTitulo(doc, reduzido) {
  const alvo = doc.querySelector("[data-digita]");
  if (!alvo || reduzido) return;
  const texto = alvo.textContent || "";
  const visual = doc.createElement("span");
  visual.setAttribute("aria-hidden", "true");
  let i = 0;
  for (const palavra of texto.split(" ")) {
    const grupo = doc.createElement("span");
    grupo.className = "palavra";
    for (const ch of Array.from(palavra)) {
      const s = doc.createElement("span");
      s.className = "letra";
      s.textContent = ch;
      s.style.setProperty("--i", String(i));
      grupo.appendChild(s);
      i += 1;
    }
    i += 1; // o espaço também conta tempo
    visual.appendChild(grupo);
  }
  const leitor = doc.createElement("span");
  leitor.className = "so-leitor";
  leitor.textContent = texto;
  alvo.replaceChildren(leitor, visual);
  const titulo = alvo.closest("h1");
  if (titulo) {
    titulo.classList.add("digitando");
    titulo.style.setProperty("--fim", `${texto.length * 55 + 350}ms`);
  }
}

/**
 * Demonstração do Tutor: começa com a primeira fala; "Reproduzir" mostra as outras a cada 1,5 s;
 * "Mostrar a conversa toda" mostra tudo. Respostas escritas antes, sem cadastro e sem IA. Sem JavaScript a conversa aparece inteira.
 */
export function ligarConversa(doc, win = window, reduzido = false) {
  const caixa = doc.getElementById("conversa-falas");
  const tocar = doc.getElementById("conversa-tocar");
  const tudo = doc.getElementById("conversa-tudo");
  const rotulo = doc.getElementById("conversa-tocar-rotulo");
  if (!caixa || !tocar || !tudo) return null;
  const falas = Array.from(caixa.querySelectorAll(".fala"));
  let relogio = 0;
  let rodando = false;
  const mostrar = (n, animar) => {
    falas.forEach((f, k) => {
      const visivel = k < n;
      const era = !f.classList.contains("fala--espera");
      f.classList.toggle("fala--espera", !visivel);
      f.classList.toggle("fala--chega", visivel && !era && animar && !reduzido);
    });
  };
  const parar = () => { win.clearTimeout(relogio); relogio = 0; };
  const atualizarRotulo = (n) => {
    if (!rotulo) return;
    rotulo.textContent = rodando ? "Reproduzindo…" : n >= falas.length ? "Reproduzir de novo" : "Reproduzir demonstração";
  };
  const avancar = (n) => {
    if (n > falas.length) { rodando = false; atualizarRotulo(falas.length); return; }
    relogio = win.setTimeout(() => { mostrar(n, true); avancar(n + 1); }, 1500);
  };
  tocar.addEventListener("click", () => {
    parar();
    rodando = true;
    mostrar(1, false);
    atualizarRotulo(1);
    avancar(2);
  });
  tudo.addEventListener("click", () => {
    parar();
    rodando = false;
    mostrar(falas.length, false);
    atualizarRotulo(falas.length);
  });
  mostrar(1, false);
  return { get visiveis() { return falas.filter((f) => !f.classList.contains("fala--espera")).length; } };
}

/** Botão que abre um bloco logo abaixo (lista de interesse da 2ª fase). */
export function ligarAbre(botao, doc = botao.ownerDocument) {
  const bloco = doc.getElementById(botao.getAttribute("aria-controls"));
  if (!bloco) return;
  botao.addEventListener("click", () => {
    const abrir = botao.getAttribute("aria-expanded") !== "true";
    botao.setAttribute("aria-expanded", String(abrir));
    bloco.hidden = !abrir;
  });
}

export function ligarMenu(doc) {
  const botao = doc.getElementById("botao-menu");
  const painel = doc.getElementById("menu-celular");
  if (!botao || !painel) return;
  const fechar = () => { botao.setAttribute("aria-expanded", "false"); botao.setAttribute("aria-label", "Abrir menu"); painel.hidden = true; };
  botao.addEventListener("click", () => {
    const abrir = botao.getAttribute("aria-expanded") !== "true";
    botao.setAttribute("aria-expanded", String(abrir));
    botao.setAttribute("aria-label", abrir ? "Fechar menu" : "Abrir menu");
    painel.hidden = !abrir;
  });
  painel.addEventListener("click", (e) => { if (e.target.closest("a")) fechar(); });
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && botao.getAttribute("aria-expanded") === "true") { fechar(); botao.focus(); }
  });
}

/** Topo: ganha fundo depois de rolar um pouco. Barra de rolagem: CSS (scroll-timeline) ou, sem suporte, este cálculo. */
export function atualizarTopo(doc, win, comBarra) {
  const topo = doc.getElementById("topo");
  if (!topo) return;
  const y = win.scrollY || 0;
  topo.classList.toggle("topo--rolou", y > 8);
  if (!comBarra) return;
  const barra = topo.querySelector(".topo__progresso");
  const total = (doc.documentElement.scrollHeight || 0) - (win.innerHeight || 0);
  if (barra) barra.style.transform = `scaleX(${total > 0 ? limitar(y / total, 0, 1) : 0})`;
}

/** Prévia local: ?liberar=carteira,tutor mostra os textos finais. Só no computador de quem programa, nunca no site. */
export function aplicarPreviaLocal(doc, loc) {
  if (!/^(localhost|127\.0\.0\.1)$/.test(loc.hostname)) return;
  const pedido = new URLSearchParams(loc.search).get("liberar");
  if (pedido == null) return;
  const lista = pedido === "tudo" ? LIBERACOES : pedido.split(",").filter((p) => LIBERACOES.includes(p));
  doc.documentElement.dataset.liberado = lista.join(" ");
}

/** Gentileza: quem já tem sessão do app no navegador vê "Ir para o app" (sem desviar sozinho). */
export function ajustarEntrar(doc, armazenamento) {
  try {
    let temSessao = false;
    for (let i = 0; i < armazenamento.length; i++) {
      const k = armazenamento.key(i) || "";
      if (/^sb-.+-auth-token$/.test(k)) { temSessao = true; break; }
    }
    if (!temSessao) return;
    for (const a of doc.querySelectorAll("[data-entrar]")) { a.textContent = "Ir para o app"; a.setAttribute("href", "https://app.staziamed.com.br/novo"); }
  } catch {
    /* armazenamento bloqueado: fica "Entrar" */
  }
}

export function iniciar(doc = document, win = window) {
  const destino = destinoDoLinkDeEmail(win.location);
  if (destino) { win.location.replace(destino); return; }
  doc.documentElement.classList.add("js");
  aplicarPreviaLocal(doc, win.location);
  for (const lista of doc.querySelectorAll('[role="tablist"]')) ligarAbas(lista);
  ligarMenu(doc);
  const interesse = doc.getElementById("botao-interesse");
  if (interesse) ligarAbre(interesse, doc);
  let armazenamento = null;
  try { armazenamento = win.localStorage; } catch { armazenamento = null; }
  if (armazenamento) ajustarEntrar(doc, armazenamento);

  const reduzido = Boolean(win.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const barraPorScript = !reduzido && !(win.CSS?.supports?.("animation-timeline: scroll()"));
  digitarTitulo(doc, reduzido);
  ligarConversa(doc, win, reduzido);
  const raizMetro = doc.querySelector("[data-metro]");
  const metro = raizMetro ? ligarMetro(raizMetro, win, { reduzido }) : null;

  // um só ouvinte de rolagem, passivo, com no máximo uma atualização por quadro
  let pedido = 0;
  const quadro = () => { pedido = 0; atualizarTopo(doc, win, barraPorScript); metro?.aoRolar(); };
  const agendar = () => { if (!pedido) pedido = win.requestAnimationFrame(quadro); };
  win.addEventListener("scroll", agendar, { passive: true });
  const remedir = () => { metro?.medir(); agendar(); };
  win.addEventListener("resize", remedir, { passive: true });
  win.addEventListener("load", remedir);
  doc.fonts?.ready?.then(remedir);
  quadro();
}

if (typeof document !== "undefined" && document.getElementById("pagina-inicial")) iniciar();
