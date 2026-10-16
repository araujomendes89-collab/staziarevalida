// Mostra o "texto com marcas" (src/shared/textoRico) já formatado: negrito, itálico, sublinhado, link https, títulos, listas,
// citação e tabela. Monta elementos React a partir do documento lido (nunca HTML cru): texto sem marca sai exatamente igual.
import React from "react";
import { hrefValido, ler } from "../../../shared/textoRico";
import "./textoRico.css";

const SEM_MARCA = /[*\\<[#>|\-\d]/;

function Inline({ nos }) {
  return (nos ?? []).map((n, i) => {
    if (n.type === "hardBreak") return <br key={i} />;
    let el = n.text;
    const marks = n.marks ?? [];
    if (marks.some((m) => m.type === "italic")) el = <em>{el}</em>;
    if (marks.some((m) => m.type === "bold")) el = <strong>{el}</strong>;
    if (marks.some((m) => m.type === "underline")) el = <u>{el}</u>;
    const link = marks.find((m) => m.type === "link");
    if (link && hrefValido(link.attrs?.href)) el = <a href={link.attrs.href} target="_blank" rel="noopener noreferrer nofollow">{el}</a>;
    return <React.Fragment key={i}>{el}</React.Fragment>;
  });
}

const paras = (ps) => (ps ?? []).map((p, i) => (
  <React.Fragment key={i}>
    {i > 0 && <br />}
    <Inline nos={p.content} />
  </React.Fragment>
));

function Bloco({ b }) {
  switch (b.type) {
    case "paragraph":
      return <p className="tr-p"><Inline nos={b.content} /></p>;
    case "heading":
      return b.attrs?.level === 3 ? <h4 className="tr-h3"><Inline nos={b.content} /></h4> : <h3 className="tr-h2"><Inline nos={b.content} /></h3>;
    case "bulletList":
    case "orderedList": {
      const Tag = b.type === "orderedList" ? "ol" : "ul";
      return (
        <Tag className="tr-lista" start={b.type === "orderedList" && b.attrs?.start > 1 ? b.attrs.start : undefined}>
          {b.content.map((it, i) => <li key={i}>{paras(it.content)}</li>)}
        </Tag>
      );
    }
    case "blockquote":
      return <blockquote className="tr-citacao">{b.content.map((p, i) => <p key={i}><Inline nos={p.content} /></p>)}</blockquote>;
    case "table": {
      const [cab, ...corpo] = b.content;
      return (
        <div className="tr-tabela-rolagem">
          <table className="tr-tabela">
            {cab && <thead><tr>{cab.content.map((c, i) => <th key={i} scope="col">{paras(c.content)}</th>)}</tr></thead>}
            <tbody>{corpo.map((r, i) => <tr key={i}>{r.content.map((c, j) => <td key={j}>{paras(c.content)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    default:
      return null;
  }
}

/**
 * modo "linha": só o conteúdo da linha (vai dentro do <p>/<span> de quem chama).
 * modo "documento": blocos dentro de um <div className="tr-doc">.
 * modo "pontos": uma lista.
 */
export function TextoRico({ texto, modo = "linha", className = "", style }) {
  const s = String(texto ?? "");
  if (modo === "linha") {
    if (!SEM_MARCA.test(s) && !s.includes("\n")) return s;
    return <Inline nos={ler(s, "linha").content[0]?.content} />;
  }
  const doc = ler(s, modo);
  return (
    <div className={`tr-doc ${className}`.trim()} style={style}>
      {doc.content.map((b, i) => <Bloco key={i} b={b} />)}
    </div>
  );
}

export default TextoRico;
