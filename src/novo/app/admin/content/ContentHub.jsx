// Central de Conteúdo Revalida: importação de PDFs, extração, conferência nas fontes oficiais,
// unidades e materiais StaziaMed, aprovação médica/editorial e publicação.
// Papéis: admin (tudo), editor (conteúdo), revisor médico (revisão da própria área).
// A IA nunca aprova nem publica: o banco exige pessoa em cada decisão.
import { Conflicts } from "./Conflicts.jsx";
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Banner, Chip } from "../../../ds";
import { useSession } from "../../session.jsx";
import { hubAvailable, hubGet } from "./api.js";
import { Documents } from "./Documents.jsx";
import { Units } from "./Units.jsx";
import { Sources } from "./Sources.jsx";
import { Taxonomy } from "./Taxonomy.jsx";
import { QuestoesStaziaMed } from "./questoes/QuestoesStaziaMed.jsx";
import { QuestionAnalyses } from "./QuestionAnalyses.jsx";
import { HubSettings } from "./HubSettings.jsx";
import { VisualMaterials } from "./visual/VisualMaterials.jsx";
import { explainError } from "../../../../shared/errors/explicarErro";

const SECTIONS = [
  { value: "documentos", label: "Documentos", icon: "file-up", who: "staff" },
  { value: "visuais", label: "Materiais visuais", icon: "palette", who: "staff" },
  { value: "unidades", label: "Unidades e revisão", icon: "stamp", who: "reviewer" },
  { value: "analises", label: "Análise de questões", icon: "brain", who: "reviewer" },
  { value: "ineditas", label: "Questões StaziaMed", icon: "file-question", who: "reviewer" },
  { value: "fontes", label: "Fontes oficiais", icon: "library", who: "staff" },
  { value: "conflitos", label: "Conflitos", icon: "scale", who: "staff" },
  { value: "taxonomia", label: "Taxonomia", icon: "list-tree", who: "staff" },
  { value: "config", label: "Configuração e custos", icon: "gauge", who: "staff" },
];

export function ContentHub({ isAdmin, isStaff }) {
  const { backend, boot } = useSession();
  const reviewerAreas = boot.reviewer_areas ?? [];
  const sections = SECTIONS.filter((s) => isStaff || (s.who === "reviewer" && reviewerAreas.length > 0));
  const [params, setParams] = useSearchParams();
  const section = sections.some((s) => s.value === params.get("secao")) ? params.get("secao") : sections[0]?.value;
  const [status, setStatus] = React.useState(null);
  const [showPending, setShowPending] = React.useState(false);

  React.useEffect(() => {
    if (!hubAvailable(backend)) return;
    hubGet(backend, "/status").then(setStatus, (error) => setStatus({ error: explainError(error) }));
  }, [backend]);

  const go = (secao, extra = {}) => setParams({ aba: params.get("aba") ?? "conteudo", secao, ...extra }, { replace: false });
  const ctx = { isAdmin, isStaff, reviewerAreas, status, go, params };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {!hubAvailable(backend) && (
        <Banner tone="warning" title="Servidor necessário">
          A Central de Conteúdo processa os PDFs no servidor. Neste modo (banco no navegador) só a leitura do que já existe funciona.
        </Banner>
      )}
      {status?.error && <Banner tone="danger">{status.error}</Banner>}
      {status?.pending?.length > 0 && (
        <Banner
          tone="warning"
          icon="triangle-alert"
          title={`${status.pending.length} pendência(s) de configuração`}
          action={
            <button type="button" className="sm-btn sm-btn--secondary sm-btn--sm" onClick={() => setShowPending((v) => !v)}>
              {showPending ? "Ocultar" : "Ver"}
            </button>
          }
        >
          {status.ai?.isMock && <div>IA em modo de SIMULAÇÃO (desenvolvimento): nada produzido assim pode ser publicado.</div>}
          {showPending && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {status.pending.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </Banner>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="tablist" aria-label="Central de Conteúdo">
        {sections.map((s) => (
          <Chip key={s.value} icon={s.icon} selected={s.value === section} onClick={() => go(s.value)} role="tab" aria-selected={s.value === section}>
            {s.label}
          </Chip>
        ))}
      </div>
      {section === "documentos" && <Documents {...ctx} />}
      {section === "visuais" && <VisualMaterials {...ctx} />}
      {section === "unidades" && <Units {...ctx} />}
      {section === "analises" && <QuestionAnalyses {...ctx} />}
      {section === "ineditas" && <QuestoesStaziaMed {...ctx} />}
      {section === "fontes" && <Sources {...ctx} />}
      {section === "conflitos" && <Conflicts {...ctx} />}
      {section === "taxonomia" && <Taxonomy {...ctx} />}
      {section === "config" && <HubSettings {...ctx} />}
    </div>
  );
}
