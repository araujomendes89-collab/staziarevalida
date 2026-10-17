// Página inicial: só as interações do desenho (abas das fases, passos do ciclo, franquia por plano, ranking semana/mês)
// e o menu do celular. Sem React, sem biblioteca, sem cookie, sem nada de fora. O CSS entra pelo <link> do HTML (sem piscar).

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
    for (const a of doc.querySelectorAll("[data-entrar]")) { a.textContent = "Ir para o app"; a.setAttribute("href", "/novo"); }
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
  let armazenamento = null;
  try { armazenamento = win.localStorage; } catch { armazenamento = null; }
  if (armazenamento) ajustarEntrar(doc, armazenamento);
}

if (typeof document !== "undefined" && document.getElementById("pagina-inicial")) iniciar();
