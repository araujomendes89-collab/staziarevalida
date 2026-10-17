// Loja em memória do estado de envio de imagens por editor (enviando N / erros).
import React from "react";

const estados = new WeakMap();
const ouvintes = new WeakMap();

const ESTADO_PADRAO = Object.freeze({ enviando: 0, erros: Object.freeze([]) });

/**
 * Retorna o estado atual de envio do editor.
 */
export function obterEstado(editor) {
  if (!editor) return ESTADO_PADRAO;
  return estados.get(editor) ?? ESTADO_PADRAO;
}

/**
 * Atualiza o estado de envio de um editor e notifica os ouvintes.
 */
export function definirEstado(editor, novo) {
  if (!editor) return;
  const atual = obterEstado(editor);
  const proximo = {
    enviando: typeof novo?.enviando === "number" ? novo.enviando : atual.enviando,
    erros: Array.isArray(novo?.erros) ? [...novo.erros] : atual.erros,
  };
  estados.set(editor, proximo);
  const lista = ouvintes.get(editor);
  if (lista) {
    for (const fn of lista) {
      try {
        fn();
      } catch {
        // ignora erro do ouvinte
      }
    }
  }
}

/**
 * Hook para reagir a mudanças no estado de envio de imagens do editor.
 */
export function useEstadoEnvio(editor) {
  const subs = React.useCallback(
    (onChange) => {
      if (!editor) return () => {};
      let set = ouvintes.get(editor);
      if (!set) {
        set = new Set();
        ouvintes.set(editor, set);
      }
      set.add(onChange);
      return () => {
        set.delete(onChange);
      };
    },
    [editor]
  );

  const getSnap = React.useCallback(() => obterEstado(editor), [editor]);

  return React.useSyncExternalStore(subs, getSnap, () => ESTADO_PADRAO);
}
