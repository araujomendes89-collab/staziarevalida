// Módulo "imagens" do editor profissional: extensão figura do TipTap, botões e painéis.
import React from "react";
import { registrarModuloEditor } from "../registroEditor.js";
import { Botao } from "../ui.jsx";
import { criarExtensaoFigura, figuraSelecionada, tratarArquivos } from "../imagens/extensaoFigura.js";
import { useEstadoEnvio } from "../imagens/estadoEnvio.js";
import { lembrarCtx } from "../imagens/ctxEditor.js";
import PainelGaleria from "../imagens/PainelGaleria.jsx";
import PainelFormatarImagem from "../imagens/PainelFormatarImagem.jsx";
import "../imagens/figura.css";
import "../tabelas/tabelas.css";

function BotaoUploadComputador({ editor, ctx }) {
  lembrarCtx(editor, ctx);
  const inputRef = React.useRef(null);
  const estadoEnvio = useEstadoEnvio(editor);

  const aoMudar = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      tratarArquivos(editor, files, null, ctx);
    }
    e.target.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        multiple
        style={{ display: "none" }}
        onChange={aoMudar}
      />
      <Botao
        icon="image-plus"
        label="Imagem do computador"
        disabled={ctx.somenteLeitura}
        onClick={() => inputRef.current?.click()}
      />
      {estadoEnvio.enviando === 0 && estadoEnvio.erros?.length > 0 && (
        <span className="ep-erro" role="alert" title={estadoEnvio.erros.join(" ")}>
          {estadoEnvio.erros.length === 1 ? estadoEnvio.erros[0] : `${estadoEnvio.erros.length} imagens não foram enviadas.`}
        </span>
      )}
      {estadoEnvio.enviando > 0 && (
        <Botao
          label={`Enviando ${estadoEnvio.enviando}…`}
          disabled={true}
        />
      )}
    </>
  );
}

function BotaoGaleria({ editor, ctx }) {
  lembrarCtx(editor, ctx);
  return (
    <Botao
      icon="images"
      label="Galeria de imagens"
      ativo={ctx.painelAberto === "galeria-imagens"}
      disabled={ctx.somenteLeitura}
      onClick={() => ctx.abrirPainel("galeria-imagens")}
    />
  );
}

function BotaoFormatar({ editor, ctx }) {
  lembrarCtx(editor, ctx);
  const temFigura = Boolean(figuraSelecionada(editor));
  return (
    <Botao
      icon="image"
      label="Formatar imagem"
      ativo={temFigura}
      disabled={ctx.somenteLeitura}
      onClick={() => ctx.abrirPainel("formatar-imagem")}
    />
  );
}

registrarModuloEditor({
  id: "imagens",
  extensoes: (ctx) => [criarExtensaoFigura(ctx)],
  botoes: [
    {
      id: "imagem-computador",
      aba: "inserir",
      grupo: "imagens",
      rotuloGrupo: "Imagens",
      ordem: 300,
      Componente: BotaoUploadComputador,
    },
    {
      id: "imagem-galeria",
      aba: "inserir",
      grupo: "imagens",
      rotuloGrupo: "Imagens",
      ordem: 310,
      Componente: BotaoGaleria,
    },
    {
      id: "imagem-formatar",
      aba: "inserir",
      grupo: "imagens",
      rotuloGrupo: "Imagens",
      ordem: 320,
      Componente: BotaoFormatar,
    },
  ],
  paineis: [
    {
      id: "galeria-imagens",
      titulo: "Galeria de imagens",
      icone: "images",
      Componente: PainelGaleria,
    },
    {
      id: "formatar-imagem",
      titulo: "Formatar imagem",
      icone: "image",
      Componente: PainelFormatarImagem,
    },
  ],
});
