// Tabela de apoio de uma Questão StaziaMed (exames, escores): o aluno precisa dela para responder. Rolagem horizontal só da tabela,
// nunca da página.
import React from "react";

export function SupportTable({ support }) {
  const rows = support?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return (
    <div style={{ margin: "18px 0 0", overflowX: "auto", maxWidth: "100%", border: "1px solid var(--border-default)", borderRadius: 12 }}>
      <table aria-label={support.title || "Dados de apoio"} style={{ borderCollapse: "collapse", width: "100%", font: "var(--type-body-sm)" }}>
        {support.title && <caption style={{ textAlign: "left", padding: "10px 12px", font: "600 14px var(--font-sans)" }}>{support.title}</caption>}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <th scope="row" style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--text-secondary)" }}>{row.label}</th>
              <td style={{ padding: "8px 12px", fontWeight: 600 }}>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
