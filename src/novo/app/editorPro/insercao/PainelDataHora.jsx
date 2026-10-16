import React from "react";
import { FORMATOS_DATA, formatarDataHora } from "../../../../shared/docRico/modulos/insercao";

// Janela "Data e hora": mostra como ficará e insere o texto na hora do clique (horário do computador de quem edita).
export default function PainelDataHora({ editor, ctx }) {
  const agora = new Date();
  return (
    <div className="ep-form" data-testid="painel-datahora">
      {FORMATOS_DATA.map((f) => {
        const texto = formatarDataHora(agora, f.id);
        return (
          <button
            key={f.id}
            type="button"
            className="ep-acao"
            disabled={ctx.somenteLeitura}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().insertContent(formatarDataHora(new Date(), f.id)).run()}
          >
            {f.rotulo}: {texto}
          </button>
        );
      })}
      <p className="ep-aviso">A data fica gravada como texto; ela não se atualiza sozinha.</p>
    </div>
  );
}
