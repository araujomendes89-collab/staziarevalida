// Resumo do que o aprovador está aprovando, mostrado ANTES do botão de confirmar (versão, afirmações, decisões, o que mudou).
import React from "react";
import { Badge, Banner, Button } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { LoadError, Loading, useLoad } from "../../common.jsx";
import { curto, ehObjeto } from "./rotulos.js";

export function ResumoAprovacao({ versionId, tipo, nota, busy, onConfirm, onCancel }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_approval_summary", { p_version_id: versionId }), [backend, versionId]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!ehObjeto(data)) return <Loading />;
  const m = data.mudancas ?? {};
  const f = data.ficha ?? {};
  const a = data.afirmacoes ?? {};
  const decididas = (f.decisoes ?? []).filter((d) => d.decision === "de_acordo").length;
  const faltaFicha = tipo === "medical" && f.existe && decididas < f.decisoes_total;
  return (
    <div role="group" aria-label="Resumo do que você vai aprovar" style={{ border: "2px solid var(--border-brand)", borderRadius: "var(--radius-md)", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <strong>O que você está aprovando ({tipo === "medical" ? "revisão médica" : "revisão editorial"})</strong>
      <ul style={{ margin: 0, paddingLeft: 20, font: "var(--type-body-sm)", display: "flex", flexDirection: "column", gap: 4 }}>
        <li>
          <b>{data.titulo}</b>, versão {data.versao} (identificação {curto(data.hash)}), {Number(data.palavras).toLocaleString("pt-BR")} palavras para o aluno.
        </li>
        <li>
          Afirmações: {a.validadas} de {a.total} validadas (fonte, página e citação).{a.criticas ? ` ${a.criticas} com dose, tempo ou via; ${a.criticas_sem_conferencia} ainda sem a conferência médica.` : ""}
        </li>
        {tipo === "medical" && (
          <li>
            Ficha do revisor: {f.existe ? `${decididas} de ${f.decisoes_total} decisões marcadas "de acordo".` : "esta versão não tem ficha."}
            {(f.decisoes ?? []).filter((d) => d.decision === "mudar").length > 0 && " Há decisão pedindo mudança."}
          </li>
        )}
        <li>
          {m.primeira_versao
            ? "Primeira versão: tudo é novo."
            : m.texto_igual
              ? `O texto é igual ao da versão ${m.versao_anterior}.`
              : `Desde a versão ${m.versao_anterior}: ${m.paragrafos_novos} parágrafo(s) novo(s) ou alterado(s), ${m.paragrafos_removidos} removido(s)/trocado(s); ${m.afirmacoes_novas} afirmação(ões) nova(s), ${m.afirmacoes_removidas} removida(s); palavras ${m.palavras_antes} → ${m.palavras_agora}.`}
        </li>
        <li>Materiais que o aluno vê: {(data.materiais_aluno ?? []).map((x) => x.title).join("; ") || "nenhum"}.</li>
      </ul>
      {faltaFicha && <Banner tone="warning">Marque "de acordo" nas decisões da ficha antes de aprovar.</Banner>}
      <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
        Fica registrado: quem aprovou, data e hora, a identificação exata desta versão e a ficha das decisões. Qualquer mudança depois derruba a aprovação. Esta aprovação não publica nada.
      </span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button icon="stamp" disabled={faltaFicha} loading={busy} onClick={() => onConfirm(nota)}>
          Confirmar aprovação {tipo === "medical" ? "médica" : "editorial"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Badge tone="neutral">Só uma pessoa aprova: nenhum processo automático ou IA</Badge>
      </div>
    </div>
  );
}
