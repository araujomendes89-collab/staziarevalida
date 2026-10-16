import React from "react";
import { normalizarLink } from "../../../../shared/docRico/modulos/insercao";

// Janela de hiperlink. Só https (o endereço é conferido aqui e de novo ao salvar o documento).
export default function PainelLink({ editor, ctx }) {
  const { from, to, empty } = editor.state.selection;
  const noLink = editor.isActive("link");
  const hrefAtual = noLink ? editor.getAttributes("link").href ?? "" : "";
  const [url, setUrl] = React.useState(hrefAtual);
  const [texto, setTexto] = React.useState("");
  const [erro, setErro] = React.useState("");

  // a seleção mudou no texto: a janela acompanha (mostra o link em que o cursor está)
  React.useEffect(() => {
    setUrl(hrefAtual);
    setErro("");
  }, [from, to, hrefAtual]);

  const aplicar = () => {
    const r = normalizarLink(url);
    if ("erro" in r) return setErro(r.erro);
    setErro("");
    const c = editor.chain().focus();
    if (!empty) c.setLink({ href: r.href }).run();
    else if (noLink) c.extendMarkRange("link").setLink({ href: r.href }).run();
    else {
      const t = texto.trim() || r.href;
      c.insertContent({ type: "text", text: t, marks: [{ type: "link", attrs: { href: r.href } }] }).run();
      setTexto("");
    }
  };
  const remover = () => editor.chain().focus().extendMarkRange("link").unsetLink().run();

  return (
    <form
      className="ep-form"
      data-testid="painel-link"
      onSubmit={(e) => {
        e.preventDefault();
        aplicar();
      }}
    >
      <label className="ep-campo">
        Endereço (https)
        <input type="text" inputMode="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Endereço do link" />
      </label>
      {empty && !noLink && (
        <label className="ep-campo">
          Texto que aparece
          <input type="text" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Texto do link" />
        </label>
      )}
      {erro && <p className="ep-erro" role="alert">{erro}</p>}
      <button type="submit" className="ep-acao" disabled={ctx.somenteLeitura}>
        {noLink ? "Atualizar link" : empty ? "Inserir link" : "Aplicar ao texto selecionado"}
      </button>
      <button type="button" className="ep-acao" disabled={ctx.somenteLeitura || !noLink} onClick={remover}>
        Remover link
      </button>
      <p className="ep-aviso">Só endereços https são aceitos. Selecione um trecho do texto para transformá-lo em link.</p>
    </form>
  );
}
