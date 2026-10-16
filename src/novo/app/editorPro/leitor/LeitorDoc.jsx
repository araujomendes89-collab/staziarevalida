// Leitura do documento rico para o ALUNO (e prévias da equipe): elementos React montados do documento saneado, nunca HTML cru.
// Não importa nada do TipTap (o pacote do aluno não carrega o editor). Nós com desenho próprio vêm de ./modulos (registrarLeitor).
import React from "react";
import { leitorDe } from "./registroLeitor.js";
import { sanear, defNo, defMarca, atributosDe, estiloReact, nomesMarcasRegistradas } from "../../../../shared/docRico";
import { hrefValido } from "../../../../shared/textoRico";
import "./modulos.js";
import "../../textoRico/textoRico.css";

// Só estas tags podem sair do desenho genérico; nó de módulo que precise de outra coisa registra um leitor próprio.
const TAGS = new Set(["p", "h3", "h4", "h5", "ul", "ol", "li", "blockquote", "table", "thead", "tbody", "tr", "td", "th", "div", "span", "strong", "em", "u", "s", "sub", "sup", "mark", "small", "figure", "figcaption", "aside", "section", "hr", "br"]);
const tagSegura = (t, padrao) => (TAGS.has(t) ? t : padrao);
const estilo = (css) => {
  const r = estiloReact(css);
  return Object.keys(r).length ? r : undefined;
};

export default function LeitorDoc({ rico, doc, className = "", style = {} }) {
  const d = sanear((rico?.doc) ?? doc, { semRef: true });

  const renderNo = (no, i) => {
    if (no.type === "text") {
      let elemento = <React.Fragment key={i}>{no.text}</React.Fragment>;
      const marks = no.marks ?? [];

      if (marks.length > 0) {
        const nucleoMarcas = new Set(["italic", "bold", "underline", "link"]);
        const modMarcas = marks.filter((m) => !nucleoMarcas.has(m.type));
        const ordemRegistro = nomesMarcasRegistradas();
        modMarcas.sort((a, b) => ordemRegistro.indexOf(a.type) - ordemRegistro.indexOf(b.type));
        
        for (const m of modMarcas) {
          const defM = defMarca(m.type);
          const tagM = tagSegura(defM?.tag ?? "span", "span");
          const cssObjM = {};
          for (const at of atributosDe(m.type)) {
            if (at.css && m.attrs && at.nome in m.attrs) {
              const val = m.attrs[at.nome];
              if (val !== undefined) Object.assign(cssObjM, at.css(val));
            }
          }
          const clsM = defM?.classe;
          const TagM = tagM;
          elemento = <TagM key={i} className={clsM} style={estilo(cssObjM)}>{elemento}</TagM>;
        }

        if (marks.some((m) => m.type === "italic")) {
          elemento = <em key={i}>{elemento}</em>;
        }
        if (marks.some((m) => m.type === "bold")) {
          elemento = <strong key={i}>{elemento}</strong>;
        }
        if (marks.some((m) => m.type === "underline")) {
          elemento = <u key={i}>{elemento}</u>;
        }
        const lk = marks.find((m) => m.type === "link");
        if (lk && hrefValido(lk.attrs?.href)) {
          elemento = <a key={i} href={lk.attrs.href} target="_blank" rel="noopener noreferrer nofollow">{elemento}</a>;
        }
      }
      return elemento;
    }

    if (no.type === "hardBreak") {
      return <br key={i} />;
    }

    const Comp = leitorDe(no.type);
    const filhos = (no.content ?? []).map((f, j) => renderNo(f, j));

    if (Comp) {
      return <Comp key={i} no={no} filhos={filhos} />;
    }

    const def = defNo(no.type);
    let tag = tagSegura(def?.tag ?? (def?.grupo === "bloco" ? "div" : "span"), def?.grupo === "inline" ? "span" : "div");

    let cls = def?.classe ?? "";
    if (no.type === "bulletList" || no.type === "orderedList") cls = "tr-lista";
    if (no.type === "blockquote") cls = "tr-citacao";
    if (no.type === "paragraph") cls = "tr-p";

    let wrapper = null;
    if (no.type === "table") {
      cls = "tr-tabela";
      wrapper = "tr-tabela-rolagem";
    }

    if (no.type === "heading") {
      const lvl = no.attrs?.level === 3 ? 4 : no.attrs?.level === 4 ? 5 : 3;
      tag = `h${lvl}`;
    }

    const cssObj = {};
    for (const at of atributosDe(no.type)) {
      if (at.css && no.attrs && at.nome in no.attrs) {
        const val = no.attrs[at.nome];
        if (val !== undefined) Object.assign(cssObj, at.css(val));
      }
    }

    let extraProps = {};
    if (no.type === "orderedList" && no.attrs?.start && Number(no.attrs.start) > 1) {
      extraProps.start = no.attrs.start;
    }

    const Tag = tag;
    
    // Tabela: linhas que começam com tableHeader vão no thead.
    let contentEl = filhos;
    if (no.type === "table") {
      const rows = no.content || [];
      const theadRows = [];
      const tbodyRows = [];
      rows.forEach((row, rowIndex) => {
        if (row.type === "tableRow") {
          const isHeader = row.content && row.content.length > 0 && row.content[0].type === "tableHeader";
          if (isHeader) {
            theadRows.push(renderNo(row, rowIndex));
          } else {
            tbodyRows.push(renderNo(row, rowIndex));
          }
        }
      });
      contentEl = (
        <>
          {theadRows.length > 0 && <thead>{theadRows}</thead>}
          {tbodyRows.length > 0 && <tbody>{tbodyRows}</tbody>}
        </>
      );
    }

    const elementoBase = (
      <Tag key={i} className={cls || undefined} style={estilo(cssObj)} {...extraProps}>
        {contentEl}
      </Tag>
    );

    if (wrapper) {
      return <div key={i} className={wrapper}>{elementoBase}</div>;
    }

    return elementoBase;
  };

  return (
    <div className={`tr-doc dr-doc ${className}`.trim()} style={style}>
      {(d?.content ?? []).map((no, i) => renderNo(no, i))}
    </div>
  );
}
