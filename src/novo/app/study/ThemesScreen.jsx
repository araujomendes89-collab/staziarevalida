// Grandes Temas: incidência REAL nas questões oficiais catalogadas (Revalida e ENAMED).
// Só contagens, com o método à vista. Nada de "recorrência" estimada ou previsão de prova.
import React from "react";
import { Badge, Banner, Button, Card, EmptyState, SegmentedControl, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { LoadError, Loading, useDebounced, useLoad } from "../admin/common.jsx";
import { AREAS, areaLabel } from "../practice/format.js";

const DIMENSIONS = [
  { value: "subarea", label: "Subárea" },
  { value: "competency", label: "Competência" },
  { value: "topic", label: "Tema detalhado" },
];

// O motor classifica com códigos em inglês; aqui só a tradução do rótulo (sem mudar o sentido).
const LABELS = {
  INFECTIOUS_DISEASES: "Infectologia", GASTROENTEROLOGY_HEPATOLOGY: "Gastroenterologia e hepatologia", NEUROLOGY: "Neurologia", HEMATOLOGY_ONCOLOGY: "Hematologia e oncologia",
  CARDIOLOGY: "Cardiologia", ENDOCRINOLOGY: "Endocrinologia", PULMONOLOGY: "Pneumologia", PSYCHIATRY: "Psiquiatria", DERMATOLOGY: "Dermatologia",
  CLINICAL_EMERGENCIES: "Emergências clínicas", RHEUMATOLOGY: "Reumatologia", NEPHROLOGY_ELECTROLYTES: "Nefrologia e eletrólitos", GERIATRICS: "Geriatria",
  PRIMARY_CARE: "Atenção primária", ETHICS_COMMUNICATION: "Ética e comunicação", HEALTH_SURVEILLANCE: "Vigilância em saúde", SUS_HEALTH_SYSTEM: "SUS e sistema de saúde",
  PREVENTION_SCREENING: "Prevenção e rastreamento", EPIDEMIOLOGY_BIOSTATISTICS: "Epidemiologia e bioestatística", OCCUPATIONAL_HEALTH: "Saúde do trabalhador",
  MENTAL_HEALTH_PRIMARY_CARE: "Saúde mental na atenção primária", IMMUNIZATION_PUBLIC_HEALTH: "Imunização (saúde pública)",
  TRAUMA_ATLS: "Trauma (ATLS)", PERIOPERATIVE_CARE: "Cuidados perioperatórios", UROLOGY: "Urologia", COLOPROCTOLOGY: "Coloproctologia", ACUTE_ABDOMEN: "Abdome agudo",
  ORTHOPEDICS_TRAUMA: "Ortopedia e trauma", BURNS: "Queimaduras", VASCULAR_SURGERY: "Cirurgia vascular", HERNIAS: "Hérnias",
  OBSTETRICS: "Obstetrícia", GYNECOLOGY: "Ginecologia",
  NEONATOLOGY: "Neonatologia", PEDIATRIC_GASTRO_NUTRITION: "Gastroenterologia e nutrição pediátricas", PEDIATRIC_EMERGENCIES: "Emergências pediátricas",
  WELL_CHILD_CARE_GROWTH_DEVELOPMENT: "Puericultura, crescimento e desenvolvimento", PEDIATRIC_RESPIRATORY: "Respiratório pediátrico", IMMUNIZATION: "Imunização",
  PEDIATRIC_INFECTIOUS_EXANTHEMS: "Exantemas e infecciosas pediátricas", PEDIATRIC_ENDOCRINOLOGY: "Endocrinologia pediátrica", PEDIATRIC_NEUROLOGY: "Neurologia pediátrica",
  PEDIATRIC_NEPHROLOGY: "Nefrologia pediátrica", PEDIATRIC_HEMATOLOGY_ONCOLOGY: "Hematologia e oncologia pediátricas",
  // competências
  SELECT_TREATMENT: "Escolher o tratamento", DIAGNOSIS: "Diagnóstico", SELECT_DIAGNOSTIC_TEST: "Escolher exame diagnóstico", EMERGENCY_STABILIZATION: "Estabilização na emergência",
  PHARMACOLOGIC_TREATMENT: "Tratamento medicamentoso", PUBLIC_HEALTH_ACTION: "Ação de saúde pública", SURGICAL_MANAGEMENT: "Conduta cirúrgica", ETHICAL_LEGAL_DECISION: "Decisão ético-legal",
  INTERPRET_DIAGNOSTIC_TEST: "Interpretar exame", FOLLOW_UP: "Seguimento", PREVENTION: "Prevenção", REFERRAL: "Encaminhamento", SCREENING: "Rastreamento", VACCINATION: "Vacinação",
  EPIDEMIOLOGIC_REASONING: "Raciocínio epidemiológico", NONPHARMACOLOGIC_TREATMENT: "Tratamento não medicamentoso", INITIAL_ASSESSMENT: "Avaliação inicial",
  CONTRAINDICATION_ASSESSMENT: "Avaliar contraindicação", RISK_STRATIFICATION: "Estratificar risco", RECOGNIZE_COMPLICATION: "Reconhecer complicação",
  RISK_FACTOR_ASSESSMENT: "Avaliar fatores de risco", DIFFERENTIAL_DIAGNOSIS: "Diagnóstico diferencial", PROGNOSIS: "Prognóstico",
};
// Código sem tradução cadastrada aparece como veio, em vez de ganhar um nome inventado.
const pretty = (key) => LABELS[key] ?? key;

export function ThemesScreen({ go }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const [dimension, setDimension] = React.useState("subarea");
  const [area, setArea] = React.useState("");
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search, 200);
  const [starting, setStarting] = React.useState(null);
  const [startError, setStartError] = React.useState(null);
  const { data, error, reload } = useLoad(() => backend.rpc("app_incidence", { p_dimension: dimension, p_area: area || null }), [backend, dimension, area]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;

  // revalida-2024-1 → "Rev. 2024/1" · enamed-2025 → "ENAMED 2025"
  const examName = (id) => {
    const m = id.match(/^(revalida|enamed)-(\d{4})(?:-(\d))?$/);
    return m ? `${m[1] === "enamed" ? "ENAMED" : "Rev."} ${m[2]}${m[3] ? `/${m[3]}` : ""}` : id;
  };
  const rows = data.rows.filter((r) => pretty(r.key).toLowerCase().includes(q.trim().toLowerCase()));
  const max = rows[0]?.total ?? 1;
  const train = async (r) => {
    if (dimension === "topic") return go("questoes", { area: r.area, tema: r.key });
    // subárea e competência: começa um treino de 20 questões desse recorte (sem repetir equivalentes)
    setStarting(r.key);
    setStartError(null);
    try {
      const filters = dimension === "subarea" ? { subarea: r.key } : { competency: r.key, ...(area ? { area } : {}) };
      const started = await backend.rpc("app_start_session", { p_kind: "questoes", p_filters: filters, p_count: 20 });
      go("sessao", { s: started.session_id });
    } catch (e) {
      setStartError("Não há questões disponíveis nesse recorte agora.");
      setStarting(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Banner tone="info" icon="chart-column" title="Como contamos">
        {data.method} Nesta contagem: {data.counted} questões, {data.annulled} anuladas (fora) e {data.unclassified} sem classificação detalhada.
      </Banner>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 280px" }}>
          <TextField icon="search" aria-label="Buscar" placeholder="Buscar tema, subárea ou competência" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <SegmentedControl label="Agrupar por" value={dimension} onChange={setDimension} options={DIMENSIONS} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Grande área">
        {[{ id: "", label: "Todas" }, ...AREAS].map((a) => (
          <button key={a.id} type="button" className={`sm-chip${area === a.id ? " is-selected" : ""}`} aria-pressed={area === a.id} onClick={() => setArea(a.id)}>
            {a.label}
          </button>
        ))}
      </div>
      {startError && <Banner tone="warning">{startError}</Banner>}
      <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
        {rows.length} {rows.length === 1 ? "item" : "itens"}
      </div>
      {rows.length === 0 && <EmptyState icon="search" title="Nada encontrado" description="Tente outra busca ou outra área." />}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
        {rows.map((r) => (
          <Card key={r.key} padding={20} style={{ borderRadius: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              {r.area ? <Badge size="sm">{areaLabel(r.area)}</Badge> : <span />}
              <Badge size="sm" tone="brand">
                {r.total} {r.total === 1 ? "questão" : "questões"} · {Object.keys(r.by_exam).length} {Object.keys(r.by_exam).length === 1 ? "prova" : "provas"}
              </Badge>
            </div>
            <div style={{ font: "600 16px/1.35 var(--font-sans)", overflowWrap: "anywhere" }}>{pretty(r.key)}</div>
            <div style={{ height: 6, borderRadius: 999, background: "var(--chart-track)" }} aria-hidden="true">
              <div style={{ width: `${Math.max((r.total / max) * 100, 4)}%`, height: "100%", borderRadius: 999, background: "var(--chart-1)" }} />
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {Object.entries(r.by_exam)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([id, n]) => (
                  <span key={id} style={{ font: "var(--type-caption)", color: "var(--text-secondary)", background: "var(--surface-sunken)", borderRadius: 6, padding: "2px 6px" }}>
                    {examName(id)}: {n}
                  </span>
                ))}
            </div>
            <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
              <Button variant="link" size="sm" iconRight="chevron-right" loading={starting === r.key} onClick={() => train(r)}>
                Treinar {dimension === "topic" ? "este tema" : dimension === "subarea" ? "esta subárea" : "esta competência"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
