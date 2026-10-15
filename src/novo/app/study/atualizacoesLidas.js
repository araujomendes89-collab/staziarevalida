// "Marcar como lido" das Atualizações: o app não tem tabela de leitura de atualização, então fica SÓ neste navegador
// (localStorage, por conta). A tela avisa isso ao aluno. Se o navegador bloquear o armazenamento, funciona só enquanto a
// página está aberta.
import React from "react";

const chave = (userId) => `sm-atualizacoes-lidas:${userId || "anon"}`;

export function lerLidas(userId) {
  try {
    const v = JSON.parse(window.localStorage.getItem(chave(userId)) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function gravarLidas(userId, mapa) {
  try {
    window.localStorage.setItem(chave(userId), JSON.stringify(mapa));
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

/** [lidas {slug: data}, alternar(slug)] */
export function useLidas(userId) {
  const [lidas, setLidas] = React.useState(() => lerLidas(userId));
  React.useEffect(() => {
    setLidas(lerLidas(userId));
    const onStorage = (e) => e.key === chave(userId) && setLidas(lerLidas(userId));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);
  const alternar = React.useCallback(
    (slug) => {
      setLidas((atual) => {
        const novo = { ...atual };
        if (novo[slug]) delete novo[slug];
        else novo[slug] = new Date().toISOString();
        gravarLidas(userId, novo);
        return novo;
      });
    },
    [userId]
  );
  return [lidas, alternar];
}
