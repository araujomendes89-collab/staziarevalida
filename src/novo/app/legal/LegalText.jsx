// Desenha o subconjunto de Markdown usado pelo Termo: "# " e "## " (títulos), "- " (lista), "---" (separador),
// **negrito** e parágrafos (linhas seguidas; cada linha termina numa quebra). Não muda, não junta nem tira palavras.
import React from "react";

export function Inline({ text }) {
  return text.split("**").map((parte, i) => (i % 2 === 1 ? <strong key={i}>{parte}</strong> : parte));
}

function Lines({ lines }) {
  return lines.map((linha, i) => (
    <React.Fragment key={i}>
      <Inline text={linha} />
      {i < lines.length - 1 && (
        <>
          <br />
          {"\n"}
        </>
      )}
    </React.Fragment>
  ));
}

function parse(source) {
  const blocks = [];
  let para = null;
  let list = null;
  const close = () => {
    para = null;
    list = null;
  };
  for (const raw of source.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (line === "") close();
    else if (line === "---") {
      close();
      blocks.push({ kind: "hr" });
    } else if (/^#{1,2} /.test(line)) {
      close();
      blocks.push({ kind: "heading", text: line.replace(/^#{1,2} /, "") });
    } else if (line.startsWith("- ")) {
      para = null;
      if (!list) blocks.push((list = { kind: "list", items: [] }));
      list.items.push(line.slice(2));
    } else {
      list = null;
      if (!para) blocks.push((para = { kind: "para", lines: [] }));
      para.lines.push(line);
    }
  }
  return blocks;
}

export function LegalText({ source }) {
  return (
    <div className="lgl-text">
      {parse(source).map((b, i) => {
        if (b.kind === "hr") return <hr key={i} />;
        // O primeiro título do arquivo é o título do documento; os demais são seções.
        if (b.kind === "heading") return i === 0 ? <h1 key={i}><Inline text={b.text} /></h1> : <h2 key={i}><Inline text={b.text} /></h2>;
        if (b.kind === "list") return <ul key={i}>{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ul>;
        return <p key={i}><Lines lines={b.lines} /></p>;
      })}
    </div>
  );
}
