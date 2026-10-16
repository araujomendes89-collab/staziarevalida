import React from "react";
import { GRUPOS_SIMBOLOS } from "../../../../shared/docRico/modulos/insercao";

// Janela "Símbolos": grade de caracteres especiais; cada clique insere o caractere como texto comum.
export default function PainelSimbolos({ editor, ctx }) {
  return (
    <div data-testid="painel-simbolos">
      {GRUPOS_SIMBOLOS.map((g) => (
        <section key={g.id}>
          <h4 className="ep-simbolos-titulo">{g.rotulo}</h4>
          <div className="ep-simbolos">
            {g.itens.map((s) => (
              <button
                key={s}
                type="button"
                className="ep-simbolo"
                disabled={ctx.somenteLeitura}
                title={`Inserir ${s}`}
                aria-label={`Inserir ${s}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().insertContent(s).run()}
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
