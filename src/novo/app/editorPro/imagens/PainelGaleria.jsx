import React from "react";
import { GaleriaImagens } from "./GaleriaImagens.jsx";
import { useOptionalSession } from "../../session.jsx";

export function PainelGaleria({ editor, ctx }) {
  const sessao = useOptionalSession();
  const backend = sessao?.backend;

  const aoEscolher = (escolha) => {
    if (!editor) return;
    const lista = Array.isArray(escolha) ? escolha : [escolha];
    if (lista.length === 0) return;

    const figuras = lista.map((img) => ({
      asset: img.id,
      alt: img.alt_text || "",
    }));

    editor.commands.inserirFiguras(figuras);
    ctx?.fecharPainel?.();
  };

  if (ctx?.somenteLeitura) {
    return (
      <div className="ep-form" data-testid="painel-galeria-imagens">
        <p className="ep-aviso">Este documento está só para leitura: não dá para inserir imagens.</p>
      </div>
    );
  }

  if (!backend) {
    return (
      <div className="ep-form" data-testid="painel-galeria-imagens">
        <p className="ep-aviso">Entre na sua conta para ver a galeria.</p>
      </div>
    );
  }

  return (
    <div className="ep-form" data-testid="painel-galeria-imagens">
      <GaleriaImagens
        backend={backend}
        unidade={ctx?.contexto?.unidadeId}
        aula={ctx?.contexto?.aulaId}
        multiplo
        onEscolher={aoEscolher}
      />
    </div>
  );
}
export default PainelGaleria;
