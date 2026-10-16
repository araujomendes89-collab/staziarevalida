// Histórico da unidade: cada alteração (importação, material, decisão, aprovação, publicação) com quem e quando.
import React from "react";
import { TextoRico } from "../../../textoRico/TextoRico.jsx";
import { Badge } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { LoadError, useLoad } from "../../common.jsx";
import { ACAO_HISTORICO, dataHora } from "./rotulos.js";

function Detalhe({ acao, d }) {
  if (!d) return null;
  if (acao.startsWith("unit.material")) return <span>{[d.title, d.reason && `motivo: ${d.reason}`].filter(Boolean).join(" · ")}</span>;
  if (acao === "review.decision") return <span>decisão {d.n}: {d.decision === "de_acordo" ? "de acordo" : "pede mudança"}{d.note ? <> · <TextoRico texto={d.note} /></> : ""}</span>;
  if (acao === "approval.invalidate") return <span>motivo: {d.why}</span>;
  if (acao === "unit.import") return <span>{d.result}</span>;
  return null;
}

export function HistoricoUnidade({ versionId, refresh }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_unit_history", { p_version_id: versionId }), [backend, versionId, refresh]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!Array.isArray(data)) return null;
  return (
    <section className="sm-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }} aria-label="Histórico da unidade">
      <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Histórico da unidade ({data.length})</h3>
      {data.length === 0 && <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Nada registrado ainda.</p>}
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {data.slice(0, 40).map((h, i) => (
          <li key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline", padding: "6px 0", borderTop: "1px solid var(--border-subtle)", font: "var(--type-body-sm)" }}>
            <span style={{ color: "var(--text-tertiary)" }}>{dataHora(h.em)}</span>
            <strong>{ACAO_HISTORICO[h.acao] ?? h.acao}</strong>
            {h.versao != null && <Badge size="sm">versão {h.versao}</Badge>}
            <span>{h.quem ?? "sistema"}</span>
            <Detalhe acao={h.acao} d={h.detalhes} />
          </li>
        ))}
      </ul>
    </section>
  );
}
