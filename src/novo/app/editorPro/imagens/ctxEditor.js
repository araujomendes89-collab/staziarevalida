// Guarda o último contexto de interface do editor para acesso pelas vistas de nós.
const mapaCtx = new WeakMap();

/**
 * Registra o contexto atual do editor (chamado ao renderizar os botões da barra).
 */
export function lembrarCtx(editor, ctx) {
  if (editor && ctx) {
    mapaCtx.set(editor, ctx);
  }
}

/**
 * Retorna o contexto registrado para o editor.
 */
export function obterCtx(editor) {
  if (!editor) return null;
  return mapaCtx.get(editor) || null;
}

/**
 * Abre um painel lateral no editor a partir de qualquer componente (ex.: VistaFigura).
 */
export function abrirPainelDo(editor, id) {
  const ctx = obterCtx(editor);
  if (ctx && typeof ctx.abrirPainel === "function") {
    return ctx.abrirPainel(id);
  }
  // os botões que guardam o ctx só aparecem na aba "Inserir": nas outras abas, usa o botão do painel na barra do editor
  const titulos = { "formatar-imagem": "Formatar imagem", "galeria-imagens": "Galeria de imagens" };
  const raiz = editor?.view?.dom?.closest?.(".ep-container");
  const botao = titulos[id] && raiz?.querySelector(`.ep-paineis-btn button[aria-label="${titulos[id]}"]`);
  if (!botao) return false;
  if (botao.getAttribute("aria-pressed") !== "true") botao.click();
  return true;
}
