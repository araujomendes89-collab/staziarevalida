// Confiabilidade de uma fonte (proposta do dono de 2026-10-12, pontuação de confiabilidade): as cinco dimensões com barra e a nota
// total, avisando que os pesos são proposta inicial e não escala validada; quarentena com motivo; retratação; e a equipe pode
// sobrepor a quarentena, sempre com nota. O cálculo é do banco: a tela só mostra e registra a decisão de uma pessoa.
import React from "react";
import { Badge, Banner, Button, ProgressBar } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { LoadError, Loading, TextArea, useLoad } from "../../common.jsx";
import { isMissingFunction } from "../AiRequests.jsx";
import { useAction, when } from "../ui.jsx";
import { AvisoFaltaBanco, chamar, Confirmacao, dia, DIMENSOES, legenda, linkDoi, NOTA_MINIMA, numero, PESOS_PROPOSTA, tentar, texto } from "./comum.jsx";

function avisoPesos(pesos) {
  const partes = DIMENSOES.map(([chave, rotulo]) => `${rotulo.toLowerCase()} ${numero(pesos[chave])}`);
  const lista = `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;
  return `Os pesos são uma proposta inicial, não uma escala validada: ${lista}. A nota ajuda a ordenar a revisão; não decide sozinha. Fonte retratada fica bloqueada mesmo com nota alta; nota baixa leva à quarentena, sem apagar nada.`;
}

function Retratacao({ r }) {
  const doi = linkDoi(r.doi);
  return (
    <div role="group" aria-label="Retratação" style={{ border: "1px solid var(--danger-border)", background: "var(--danger-bg)", borderRadius: "var(--radius-md)", padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
      <strong style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>Artigo retratado</strong>
      <span style={texto}>
        {r.data ? `Retratação publicada em ${dia(r.data)}.` : "Retratação registrada."}
        {r.doi && (
          <>
            {" "}DOI da retratação:{" "}
            {doi ? (
              <a href={doi} target="_blank" rel="noopener noreferrer">
                {r.doi}
              </a>
            ) : (
              r.doi
            )}
          </>
        )}
      </span>
      {r.nota && <span style={texto}>{r.nota}</span>}
    </div>
  );
}

function Sobreposicao({ s }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ font: "var(--type-body-sm)" }}>
        <strong>Decisão da equipe:</strong> {s.quarentena ? "colocou em quarentena" : "tirou da quarentena"}
        {s.por ? ` · por ${s.por}` : ""}
        {s.em ? ` · em ${when(s.em)}` : ""}
      </span>
      {s.nota && <span style={texto}>Motivo: {s.nota}</span>}
    </div>
  );
}

export function Confiabilidade({ fonteId, aoMudar }) {
  const { backend } = useSession();
  const q = useLoad(() => backend.rpc("app_admin_source_quality", { p_source_id: fonteId }), [backend, fonteId]);
  const acao = useAction();
  const [pedindo, setPedindo] = React.useState(false);
  const [nota, setNota] = React.useState("");
  const [feito, setFeito] = React.useState(null);
  if (isMissingFunction(q.error)) return <AvisoFaltaBanco titulo="Confiabilidade da fonte ainda indisponível" />;
  if (q.error) return <LoadError error={q.error} retry={q.reload} />;
  if (!q.data) return <Loading />;
  const d = q.data;
  const pesos = { ...PESOS_PROPOSTA, ...(d.pesos ?? {}) };
  const tirar = Boolean(d.quarentena); // a decisão oferecida: tirar da quarentena (se está) ou colocar
  const confirmar = async () => {
    const r = await tentar(acao, () => chamar(backend, "app_admin_source_quality_override", { p_source_id: fonteId, p_quarentena: !tirar, p_note: nota.trim() }));
    if (!r.ok) return;
    if (r.resultado && typeof r.resultado === "object") q.setData(r.resultado);
    else q.reload();
    setPedindo(false);
    setNota("");
    setFeito(tirar ? "Decisão registrada: a fonte saiu da quarentena." : "Decisão registrada: a fonte entrou em quarentena.");
    aoMudar?.();
  };
  return (
    <div role="region" aria-label="Confiabilidade da fonte" style={{ marginTop: 10, padding: 12, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <strong style={{ font: "var(--type-label)" }}>Confiabilidade da fonte</strong>
        <span style={{ font: "var(--type-body-sm)" }}>
          Nota total: <strong>{numero(d.total)}</strong>
        </span>
        {d.quarentena ? <Badge size="sm" tone="warning" icon="shield-alert">Em quarentena</Badge> : <Badge size="sm">Fora da quarentena</Badge>}
        {d.bloqueada && <Badge size="sm" tone="danger" icon="ban">Bloqueada</Badge>}
        {d.retratada && <Badge size="sm" tone="danger">Retratada</Badge>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {DIMENSOES.map(([chave, rotulo]) => {
          const valor = d.dimensoes?.[chave];
          const peso = Number(pesos[chave]) || 0;
          if (valor == null) {
            return (
              <div key={chave} style={{ display: "flex", justifyContent: "space-between", gap: 12, font: "var(--type-body-sm)" }}>
                <span style={{ fontWeight: 500 }}>{rotulo}</span>
                <span style={{ color: "var(--text-tertiary)" }}>ainda não avaliada</span>
              </div>
            );
          }
          return <ProgressBar key={chave} label={rotulo} value={Number(valor)} max={peso > 0 ? peso : 100} valueLabel={peso > 0 ? `${numero(Number(valor))} de ${numero(peso)}` : numero(Number(valor))} />;
        })}
      </div>
      <p style={{ ...legenda, margin: 0 }}>{avisoPesos(pesos)}</p>
      {d.quarentena && <span style={{ font: "var(--type-body-sm)" }}><strong>Motivo da quarentena:</strong> {d.motivo || "não informado"}</span>}
      {d.retratacao && <Retratacao r={d.retratacao} />}
      {d.sobreposicao && <Sobreposicao s={d.sobreposicao} />}
      {feito && <Banner tone="success">{feito}</Banner>}
      {!pedindo && (
        <div>
          <Button size="sm" variant="secondary" icon={tirar ? "shield-check" : "shield-alert"} onClick={() => (setPedindo(true), setFeito(null))}>
            {tirar ? "Tirar da quarentena" : "Colocar em quarentena"}
          </Button>
        </div>
      )}
      {pedindo && (
        <Confirmacao
          titulo={tirar ? "Tirar esta fonte da quarentena?" : "Colocar esta fonte em quarentena?"}
          rotulo={tirar ? "Sim, tirar da quarentena" : "Sim, colocar em quarentena"}
          icone={tirar ? "shield-check" : "shield-alert"}
          ocupado={acao.busy}
          bloqueado={nota.trim().length < NOTA_MINIMA}
          aoConfirmar={confirmar}
          aoCancelar={() => (setPedindo(false), setNota(""))}
        >
          <span style={texto}>
            {tirar
              ? "A decisão da equipe passa por cima do cálculo e fica registrada com quem decidiu e o motivo."
              : "A fonte entra em quarentena por decisão da equipe e nada é apagado. Fica registrado quem decidiu e o motivo."}
            {tirar && d.bloqueada ? " Esta fonte está bloqueada: sair da quarentena não a desbloqueia." : ""}
          </span>
          <TextArea label={`Motivo (obrigatório, pelo menos ${NOTA_MINIMA} caracteres)`} value={nota} onChange={setNota} rows={2} maxLength={1000} />
        </Confirmacao>
      )}
      {acao.feedback}
    </div>
  );
}
