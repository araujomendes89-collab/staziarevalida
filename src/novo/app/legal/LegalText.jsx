// Desenha o subconjunto de Markdown usado pelos textos legais: "# ", "## " e "### " (títulos), "- " (lista), "---" (separador),
// tabelas com "|" (a linha "|---|" separa o cabeçalho), "> " (destaque), ***negrito e itálico***, **negrito**, *itálico* e parágrafos
// (linhas seguidas; cada linha termina numa quebra). Não muda, não junta nem tira palavras.
// Tabelas: no computador, tabela comum. No celular (até 600 px, legal.css) cada linha vira um bloco empilhado, sem arrastar para o
// lado: a 1ª coluna (ex.: "Tema") em negrito como título e as outras (ex.: "Resumo") logo abaixo, na largura toda. Com 3 colunas ou
// mais, cada célula depois da 1ª mostra o nome da coluna (data-label) em cima. Os papéis (role) mantêm a leitura de tabela.
import React from "react";

// ***x***, **x** ou *x* (o itálico não começa nem termina com espaço, para "2 * 3" não virar itálico)
const MARCAS = /(\*\*\*[^*]+?\*\*\*|\*\*[^*]+?\*\*|\*[^*\s](?:[^*]*?[^*\s])?\*)/g;

export function Inline({ text }) {
  return String(text)
    .split(MARCAS)
    .map((parte, i) => {
      if (i % 2 === 0) return parte;
      if (parte.startsWith("***")) return <strong key={i}><em>{parte.slice(3, -3)}</em></strong>;
      if (parte.startsWith("**")) return <strong key={i}>{parte.slice(2, -2)}</strong>;
      return <em key={i}>{parte.slice(1, -1)}</em>;
    });
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

const celulas = (linha) => linha.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
/** Nome da coluna em letras simples (para o data-label do celular). */
const rotulo = (c) => textoSimples(c).trim();
const separador = (linha) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(linha);

function parse(source) {
  const blocks = [];
  let para = null;
  let list = null;
  let table = null;
  const close = () => {
    para = null;
    list = null;
    table = null;
  };
  for (const raw of source.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (line === "") close();
    else if (line === "---") {
      close();
      blocks.push({ kind: "hr" });
    } else if (/^#{1,3} /.test(line)) {
      close();
      blocks.push({ kind: "heading", level: line.indexOf(" "), text: line.replace(/^#{1,3} /, "") });
    } else if (line.startsWith("|")) {
      para = null;
      list = null;
      if (!table) blocks.push((table = { kind: "table", head: celulas(line), rows: [] }));
      else if (!(table.rows.length === 0 && separador(line))) table.rows.push(celulas(line));
    } else if (line.startsWith("> ")) {
      close();
      blocks.push({ kind: "quote", text: line.slice(2) });
    } else if (line.startsWith("- ")) {
      para = null;
      table = null;
      if (!list) blocks.push((list = { kind: "list", items: [] }));
      list.items.push(line.slice(2));
    } else {
      list = null;
      table = null;
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
        // O primeiro título do arquivo é o título do documento; os demais são seções ("###": subseção).
        if (b.kind === "heading") {
          if (i === 0) return <h1 key={i}><Inline text={b.text} /></h1>;
          return b.level === 3 ? <h3 key={i}><Inline text={b.text} /></h3> : <h2 key={i}><Inline text={b.text} /></h2>;
        }
        if (b.kind === "list") return <ul key={i}>{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ul>;
        if (b.kind === "quote") return <p key={i} className="lgl-caixa"><Inline text={b.text} /></p>;
        if (b.kind === "table") {
          return (
            <div key={i} className={`lgl-tabela${b.head.length > 2 ? " lgl-tabela--rotulos" : ""}`} role="region" aria-label="Tabela" tabIndex={0}>
              <table role="table">
                <thead role="rowgroup">
                  <tr role="row">{b.head.map((c, j) => <th key={j} scope="col" role="columnheader"><Inline text={c} /></th>)}</tr>
                </thead>
                <tbody role="rowgroup">
                  {b.rows.map((r, j) => (
                    <tr key={j} role="row">
                      {r.map((c, k) => (
                        <td key={k} role="cell" data-label={b.head[k] != null ? rotulo(b.head[k]) : undefined}>
                          <Inline text={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={i}><Lines lines={b.lines} /></p>;
      })}
    </div>
  );
}

/** O texto em letras simples, para a cópia baixada (sem as marcas de negrito e itálico; as tabelas ficam com "|"). */
export function textoSimples(source) {
  return source.replace(/\r/g, "").replace(/\*\*\*([^*]+?)\*\*\*/g, "$1").replace(/\*\*([^*]+?)\*\*/g, "$1").replace(/\*([^*\s](?:[^*]*?[^*\s])?)\*/g, "$1");
}
