// Proposta de fonte oficial (resultado de "Buscar fonte oficial"): cada afirmação ao lado do trecho que a sustenta, ou "não encontrada".
// A equipe escolhe "Usar estas fontes" (só proposta completa e do texto atual) ou "Descartar".
import React from "react";
import { Badge, Button } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { when, useAction } from "../ui.jsx";

export function SourceProposal({ proposal, canAct, onUsed, onDiscarded }) {
  const { backend } = useSession();
  const act = useAction();
  const pending = proposal.state === "pendente";
  const use = () => act.run(() => backend.rpc("app_draft_source_accept", { p_proposal_id: proposal.id }), "Fontes aplicadas ao rascunho. Confira de novo e peça a revisão.").then((r) => r && onUsed(r));
  const discard = () => act.run(() => backend.rpc("app_draft_source_discard", { p_proposal_id: proposal.id }), "Proposta descartada.").then((r) => r !== undefined && onDiscarded?.());
  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 10, margin: "6px 0" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", font: "var(--type-body-sm)" }}>
        <strong>Busca de {when(proposal.created_at)}</strong>
        <Badge size="sm" tone={proposal.complete ? "success" : "warning"}>{proposal.complete ? "completa" : "incompleta"}</Badge>
        <Badge size="sm" tone={pending ? "info" : "neutral"}>{{ pendente: "pendente", aceita: "usada", descartada: "descartada", obsoleta: "obsoleta" }[proposal.state] ?? proposal.state}</Badge>
        {pending && !proposal.current && <Badge size="sm" tone="danger">o rascunho mudou depois da busca: busque de novo</Badge>}
      </div>
      {(proposal.claims ?? []).map((c, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12, marginTop: 8, font: "var(--type-body-sm)" }}>
          <div>
            <Badge size="sm" tone="neutral">{c.kind === "decisao_clinica" ? "decisão clínica" : "número"}</Badge>
            <div style={{ marginTop: 4 }}>{c.text}</div>
          </div>
          <div>
            {c.status === "encontrada" && c.citation ? (
              <>
                <Badge size="sm" tone="success">encontrada</Badge>
                <div style={{ marginTop: 4 }}>
                  <strong>{c.citation.source}</strong> · {c.citation.organ}
                  {c.citation.version ? ` · versão ${c.citation.version}` : ""}
                  {c.citation.page != null ? ` · p. ${c.citation.page}` : ""}
                </div>
                <blockquote style={{ margin: "4px 0 0", paddingLeft: 10, borderLeft: "3px solid var(--border-default)", color: "var(--text-secondary)" }}>{c.citation.quote}</blockquote>
              </>
            ) : (
              <>
                <Badge size="sm" tone="danger">não encontrada</Badge>
                {c.reason && <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>{c.reason}</div>}
              </>
            )}
          </div>
        </div>
      ))}
      {pending && canAct && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <Button size="sm" icon="check" loading={act.busy} disabled={!proposal.complete || !proposal.current} onClick={use}>
            Usar estas fontes
          </Button>
          <Button size="sm" variant="secondary" icon="x" loading={act.busy} onClick={discard}>
            Descartar
          </Button>
        </div>
      )}
      {pending && !proposal.complete && <p style={{ margin: "8px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Proposta incompleta não pode ser usada: falta fonte oficial para a decisão clínica ou para algum número. Complete o texto ou cadastre a fonte e busque de novo.</p>}
      {act.feedback}
    </div>
  );
}
