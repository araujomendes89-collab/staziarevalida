// Vigilância científica (proposta do dono de 2026-10-12, seção 2: painel, frequências, pontuação de confiabilidade e o que pode ou
// não ser publicado sozinho). Seção da Central de Conteúdo só para a equipe (o revisor médico e o aluno não a veem): cartões com o
// resumo, a regra do dono à vista, a fila de auditoria e a frequência por domínio. A vigilância encontra e organiza; quem decide é a
// equipe. Banco ainda sem as funções: aviso amigável, e o resto da Central continua funcionando.
import React from "react";
import { Banner, Button, StatCard } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { LoadError, Loading, useLoad } from "../../common.jsx";
import { isMissingFunction } from "../AiRequests.jsx";
import { Section } from "../ui.jsx";
import { AvisoFaltaBanco, legenda, plural, quando, REGRA_DO_DONO } from "./comum.jsx";
import { FilaAuditoria } from "./FilaAuditoria.jsx";
import { FrequenciaDominios } from "./FrequenciaDominios.jsx";
import { TemasVigiados } from "./TemasVigiados.jsx";
import { GrandesTemasAtualidade } from "./GrandesTemasAtualidade.jsx";

const CARTOES = [
  { campo: "novas_fontes", rotulo: "Novas fontes", icone: "file-plus", tom: "brand", legenda: () => "achadas pela vigilância" },
  { campo: "em_revisao", rotulo: "Em revisão", icone: "scan-eye", tom: "info", legenda: () => "esperando a equipe" },
  { campo: "bloqueadas", rotulo: "Bloqueadas", icone: "ban", tom: "danger", legenda: () => "não valem como evidência" },
  { campo: "quarentena", rotulo: "Quarentena", icone: "shield-alert", tom: "warning", legenda: () => "nota baixa ou origem a confirmar; nada é apagado" },
  { campo: "links_fora_do_ar", rotulo: "Links fora do ar", icone: "link-2-off", tom: "danger", legenda: (r) => `de ${plural(Number(r.vigiadas) || 0, "fonte vigiada", "fontes vigiadas")}` },
];

/** Contagem do banco (número ou texto numérico); sem valor: travessão, nunca um número inventado. */
const contagem = (v) => {
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR") : "—";
};

function Regra() {
  return (
    <Banner tone="info" icon="shield-check" title="Regra da vigilância">
      <p style={{ margin: 0 }}>{REGRA_DO_DONO}</p>
      <p style={{ margin: "4px 0 0" }}>A vigilância encontra e organiza os avisos; quem decide é a equipe.</p>
    </Banner>
  );
}

function Cartoes({ r }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        {CARTOES.map((c) => (
          <div key={c.campo} role="group" aria-label={c.rotulo} style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
            <StatCard label={c.rotulo} value={contagem(r[c.campo])} caption={c.legenda(r)} icon={c.icone} tone={c.tom} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "4px 16px", flexWrap: "wrap", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        <span>{plural(Number(r.vigiadas) || 0, "fonte vigiada", "fontes vigiadas")}</span>
        <span>Última verificação: {quando(r.ultima_execucao, "ainda não houve")}</span>
        <span>Próxima verificação: {quando(r.proxima_verificacao, "não agendada")}</span>
      </div>
    </div>
  );
}

export function VigilanciaCientifica() {
  const { backend } = useSession();
  const resumo = useLoad(() => backend.rpc("app_admin_vigilance_summary"), [backend]);
  const [filaChave, setFilaChave] = React.useState(0);
  const atualizar = () => {
    resumo.reload();
    setFilaChave((k) => k + 1);
  };
  if (isMissingFunction(resumo.error)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Regra />
        <AvisoFaltaBanco titulo="Vigilância científica ainda indisponível" />
      </div>
    );
  }
  const r = resumo.data;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Regra />
      <Section
        title="Resumo da vigilância"
        action={
          <Button size="sm" variant="secondary" icon="refresh-cw" loading={resumo.loading && Boolean(r)} onClick={atualizar}>
            Atualizar
          </Button>
        }
      >
        {resumo.error && <LoadError error={resumo.error} retry={resumo.reload} />}
        {!r && !resumo.error && <Loading />}
        {r && <Cartoes r={r} />}
        {r && !r.funcao_analise_ligada && <p style={{ ...legenda, margin: "10px 0 0" }}>A função “Análise do que mudou” está desligada na Central de IAs: a fila funciona, mas o pedido de análise fica indisponível.</p>}
      </Section>
      <GrandesTemasAtualidade />
      <TemasVigiados />
      <FilaAuditoria analiseLigada={Boolean(r?.funcao_analise_ligada)} recarregar={filaChave} aoMudar={resumo.reload} />
      {r && <FrequenciaDominios dominios={r.por_dominio} aoSalvar={resumo.reload} />}
    </div>
  );
}
