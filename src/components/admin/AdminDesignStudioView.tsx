import React, { useState } from "react";
import {
  Palette,
  Layers,
  Layout,
  FileCode,
  Sparkles,
  Search,
  ExternalLink,
  Shield,
  CheckCircle2,
  AlertCircle,
  Eye,
  Sliders,
  Copy,
  Info,
  Grid,
  Check,
  ChevronRight,
  Maximize2,
  Edit3,
  Monitor,
  Tablet,
  Smartphone,
  CheckCheck,
  RefreshCw,
  ArrowRight,
  Zap,
  Boxes,
  Plus,
  Trash2,
  Download,
  Settings,
} from "lucide-react";
import {
  DesignReferenceRightsType,
  MEDICAL_EDITORIAL_V1,
  StaziaDesignTemplate,
  DesignBlueprint,
} from "../../types/adminDesignStudio";
import { defaultCloneEngineAdapter } from "../../services/jcodesMoreCloneAdapter";
import { CloneAnalysisResult } from "../../types/cloneEngine";
import { transformBlueprintToStaziaTemplate } from "../../services/staziaDesignTransformer";
import {
  StaziaDesignPreviewRenderer,
  PreviewViewport,
} from "./designStudio/StaziaDesignPreviewRenderer";
import {
  ComponentCaptureMode,
  DetectedComponentCandidate,
  SelectedComponentRegion,
  ComponentBlueprint,
  StaziaComponentDraft,
  ComponentPlacementTarget,
  ComponentDestinationType,
  ComponentInstallationVisibility,
  StaziaComponentInstallationPlan,
} from "../../types/componentCapture";
import {
  detectComponentsFromBlueprint,
  createSelectedComponentRegion,
  buildComponentBlueprint,
} from "../../services/componentDetectionService";
import { transformComponentBlueprintToStaziaDraft } from "../../services/staziaComponentTransformer";
import { validateInstallationPlan } from "../../services/componentValidatorService";
import { ComponentRegionMapOverlay } from "./designStudio/ComponentRegionMapOverlay";
import { StaziaComponentPreviewRenderer } from "./designStudio/StaziaComponentPreviewRenderer";

export type DesignStudioSubTab =
  | "clone"
  | "references"
  | "blueprints"
  | "templates"
  | "components"
  | "preview";

// Sample initial session component drafts for immediate exploration
const INITIAL_SESSION_DRAFTS: StaziaComponentDraft[] = [
  {
    id: "draft_card_group_hypertension",
    name: "Painel de Cartões Clínicos (Síndromes Hipertensivas)",
    componentType: "CARD_GROUP",
    classification: "VISUAL_COMPONENT",
    sourceComponentBlueprintId: "bp_initial_card_group",
    sourceReferenceId: "ref_official_hypertension_guideline",
    styleProfile: "MEDICAL_EDITORIAL_V1",
    layout: {
      display: "grid",
      gridColumns: 3,
      gap: "16px",
      padding: "24px",
    },
    componentTree: {
      id: "root_card_group",
      type: "StaziaCardGroup",
      children: [
        {
          id: "card_1",
          type: "StaziaCard",
          props: {
            badgeText: "Emergência Hipertensiva",
            title: "Crise Hipertensiva com LOA",
            description: "PA ≥ 180x120 mmHg associada a lesão aguda de órgão-alvo (encefalopatia, edema agudo de pulmão, dissecação aórtica).",
            conductTip: "Iniciar Nitroprussiato de Sódio ou Nitroglicerina IV em ambiente de UTI. Redução máxima de 20-25% na primeira hora.",
          },
        },
        {
          id: "card_2",
          type: "StaziaCard",
          props: {
            badgeText: "Urgência Hipertensiva",
            title: "Elevação Pressórica sem LOA",
            description: "PA severamente elevada (≥ 180x120 mmHg) sem evidência clínica de lesão progressiva de órgãos-alvo.",
            conductTip: "Controle gradual por via oral (Captopril ou Clonidina) em 24 a 48 horas. Observação ambulatorial.",
          },
        },
        {
          id: "card_3",
          type: "StaziaCard",
          props: {
            badgeText: "Hipertensão Gestacional",
            title: "Pré-Eclâmpsia com Sinais de Gravidade",
            description: "PA ≥ 160x110 mmHg após 20 semanas com plaquetopenia (<100k) ou elevação de transaminases.",
            conductTip: "Sulfato de Magnésio (esquema de Pritchard ou Zuspan) para profilaxia de convulsões e estabilização para parto.",
          },
        },
      ],
    },
    tokenMapping: {
      brandNavy: "#0A192F",
      brandTeal: "#0D9488",
      pageBackground: "#F8FAFC",
      surface: "#FFFFFF",
    },
    interactionMapping: [
      {
        elementId: "action_1",
        action: "OPEN_MODAL",
        description: "Exibe fluxograma detalhado de conduta",
      },
    ],
    responsiveRules: {
      mobileStack: true,
      tabletColumns: 2,
      desktopColumns: 3,
    },
    status: "DRAFT",
    functionalToolLogicCaptured: false,
    createdAt: new Date().toISOString(),
    createdBy: "admin-master",
  },
  {
    id: "draft_table_drugs",
    name: "Tabela de Condutas e Protocolos Farmacológicos",
    componentType: "TABLE",
    classification: "VISUAL_COMPONENT",
    sourceComponentBlueprintId: "bp_initial_table",
    sourceReferenceId: "ref_official_hypertension_guideline",
    styleProfile: "MEDICAL_EDITORIAL_V1",
    layout: {
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "24px",
    },
    componentTree: {
      id: "root_table",
      type: "StaziaTable",
      props: {
        title: "Tabela Farmacológica: Anti-hipertensivos na Emergência",
      },
    },
    tokenMapping: {
      tableHeaderBg: "#0A192F",
      tableHeaderText: "#FFFFFF",
      tableRowBg: "#FFFFFF",
    },
    interactionMapping: [],
    responsiveRules: {
      mobileStack: false,
      tabletColumns: 1,
      desktopColumns: 1,
    },
    status: "DRAFT",
    functionalToolLogicCaptured: false,
    createdAt: new Date().toISOString(),
    createdBy: "admin-master",
  },
  {
    id: "draft_calc_score",
    name: "Calculadora Clínica (Layout Revalida)",
    componentType: "CALCULATOR_LAYOUT",
    classification: "FUNCTIONAL_TOOL",
    sourceComponentBlueprintId: "bp_initial_calc",
    sourceReferenceId: "ref_calculator_tool",
    styleProfile: "MEDICAL_EDITORIAL_V1",
    layout: {
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "24px",
    },
    componentTree: {
      id: "root_calc",
      type: "StaziaFormLayout",
      children: [
        { id: "c_in_1", type: "StaziaInput", label: "Pressão Arterial Sistólica (mmHg)" },
        { id: "c_in_2", type: "StaziaInput", label: "Idade do Paciente (Anos)" },
        { id: "c_btn", type: "StaziaButton", label: "Simular Escore Cardiovascular" },
      ],
    },
    tokenMapping: {
      brandNavy: "#0A192F",
      brandTeal: "#0D9488",
    },
    interactionMapping: [
      {
        elementId: "action_calc",
        action: "SUBMIT_PLACEHOLDER",
        description: "Simulação declarativa no cliente (lógica proprietária excluída)",
      },
    ],
    responsiveRules: {
      mobileStack: true,
      tabletColumns: 1,
      desktopColumns: 1,
    },
    status: "DRAFT",
    functionalToolLogicCaptured: false,
    createdAt: new Date().toISOString(),
    createdBy: "admin-master",
  },
];

export const AdminDesignStudioView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<DesignStudioSubTab>("clone");
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneRights, setCloneRights] = useState<DesignReferenceRightsType>("PUBLIC_REFERENCE_ONLY");
  const [captureMode, setCaptureMode] = useState<ComponentCaptureMode>("FULL_PAGE");
  const [analysisResult, setAnalysisResult] = useState<CloneAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeBlueprint, setActiveBlueprint] = useState<DesignBlueprint | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<StaziaDesignTemplate>(MEDICAL_EDITORIAL_V1);
  const [transformedTemplate, setTransformedTemplate] = useState<StaziaDesignTemplate | null>(null);
  const [isTransforming, setIsTransforming] = useState(false);
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>("DESKTOP_1440");
  const [showMetadataModal, setShowMetadataModal] = useState(false);

  // Component Capture & Stazia Library State
  const [detectedCandidates, setDetectedCandidates] = useState<DetectedComponentCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [sessionComponentLibrary, setSessionComponentLibrary] = useState<StaziaComponentDraft[]>(INITIAL_SESSION_DRAFTS);
  const [activeComponentDraft, setActiveComponentDraft] = useState<StaziaComponentDraft | null>(INITIAL_SESSION_DRAFTS[0]);
  const [previewTarget, setPreviewTarget] = useState<"FULL_TEMPLATE" | "COMPONENT_DRAFT">("FULL_TEMPLATE");
  
  // Library Modal State
  const [renameDraftId, setRenameDraftId] = useState<string | null>(null);
  const [renameDraftName, setRenameDraftName] = useState("");
  const [prepareInstallDraft, setPrepareInstallDraft] = useState<StaziaComponentDraft | null>(null);
  const [installTarget, setInstallTarget] = useState<ComponentPlacementTarget>("SIDEBAR");
  const [installDestination, setInstallDestination] = useState<ComponentDestinationType>("ROUTE");
  const [installVisibility, setInstallVisibility] = useState<ComponentInstallationVisibility>("STUDENT");
  const [installButtonLabel, setInstallButtonLabel] = useState("");
  const [installTargetRoute, setInstallTargetRoute] = useState("");
  const [planValidationNotice, setPlanValidationNotice] = useState<string | null>(null);
  const [libraryFilterType, setLibraryFilterType] = useState<string>("ALL");
  const [librarySearchQuery, setLibrarySearchQuery] = useState<string>("");

  const handleOpenPrepareInstall = (draft: StaziaComponentDraft) => {
    setPrepareInstallDraft(draft);
    setPlanValidationNotice(null);
    if (draft.componentType === "CALCULATOR_LAYOUT") {
      setInstallTarget("SIDEBAR");
      setInstallDestination("ROUTE");
      setInstallVisibility("STUDENT");
      setInstallButtonLabel("Calculadora clínica");
      setInstallTargetRoute("/ferramentas/calculadora-clinica");
    } else {
      setInstallTarget("DASHBOARD");
      setInstallDestination("INLINE_PANEL");
      setInstallVisibility("STUDENT");
      setInstallButtonLabel(draft.name);
      setInstallTargetRoute("");
    }
  };

  const handleValidatePlan = () => {
    if (!prepareInstallDraft) return;
    const plan: StaziaComponentInstallationPlan = {
      id: `plan_${prepareInstallDraft.id}_${Date.now()}`,
      componentDraftId: prepareInstallDraft.id,
      target: installTarget,
      destinationType: installDestination,
      visibility: installVisibility,
      buttonLabel: installButtonLabel,
      targetRoute: installDestination === "ROUTE" ? installTargetRoute : undefined,
      status: "PLANNED",
      createdAt: new Date().toISOString(),
    };
    const result = validateInstallationPlan(plan);
    if (result.valid) {
      setPlanValidationNotice(`Plano de instalação validado com sucesso (Status: PLANNED). Alvo: ${installTarget} • Visibilidade: ${installVisibility}. Nota: Nenhuma rota ou botão real foi adicionado nesta etapa.`);
    } else {
      setPlanValidationNotice(`Erros na validação: ${result.errors.join(", ")}`);
    }
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setDetectedCandidates([]);
    setSelectedCandidateId(null);

    // Map capture mode to adapter mode
    const mappedMode: "FULL_PAGE" | "COMPONENTS" | "DESIGN_SYSTEM" | "STRUCTURE_LAYOUT" =
      captureMode === "COMPONENT" || captureMode === "SECTION"
        ? "COMPONENTS"
        : captureMode === "DESIGN_SYSTEM"
        ? "DESIGN_SYSTEM"
        : "STRUCTURE_LAYOUT";

    try {
      const res = await defaultCloneEngineAdapter.analyze({
        requestId: `req_${Date.now()}`,
        url: cloneUrl,
        rightsType: cloneRights,
        analysisMode: mappedMode,
        requestedBy: "admin-master",
        requestedAt: new Date().toISOString(),
      });
      setAnalysisResult(res);
      if (res.success && res.blueprint) {
        setActiveBlueprint(res.blueprint);
        const candidates = detectComponentsFromBlueprint(res.blueprint, res.blueprint.id);
        setDetectedCandidates(candidates);
        if (candidates.length > 0) {
          setSelectedCandidateId(candidates[0].id);
        }
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleTransformToStazia = (targetBlueprint?: DesignBlueprint | null) => {
    const bp = targetBlueprint || activeBlueprint;
    if (!bp) return;

    setIsTransforming(true);
    try {
      const template = transformBlueprintToStaziaTemplate(bp, "MEDICAL_EDITORIAL_V1");
      setTransformedTemplate(template);
      setSelectedTemplate(template);
      setPreviewTarget("FULL_TEMPLATE");
      setActiveSubTab("preview");
    } catch (err: any) {
      console.error("Transformation Error:", err);
    } finally {
      setIsTransforming(false);
    }
  };

  const handleTransformSelectedCandidate = () => {
    if (!activeBlueprint || !selectedCandidateId) return;
    const candidate = detectedCandidates.find((c) => c.id === selectedCandidateId);
    if (!candidate) return;

    setIsTransforming(true);
    try {
      const region: SelectedComponentRegion = createSelectedComponentRegion(candidate, activeBlueprint);
      const compBlueprint: ComponentBlueprint = buildComponentBlueprint(region, cloneRights);
      const draft: StaziaComponentDraft = transformComponentBlueprintToStaziaDraft(compBlueprint, "MEDICAL_EDITORIAL_V1");

      // Prepend to session library
      setSessionComponentLibrary((prev) => [draft, ...prev.filter((d) => d.id !== draft.id)]);
      setActiveComponentDraft(draft);
      setPreviewTarget("COMPONENT_DRAFT");
      setActiveSubTab("preview");
    } catch (err: any) {
      console.error("Component Transformation Error:", err);
    } finally {
      setIsTransforming(false);
    }
  };

  // Library Actions
  const handleOpenRename = (draft: StaziaComponentDraft) => {
    setRenameDraftId(draft.id);
    setRenameDraftName(draft.name);
  };

  const handleSaveRename = () => {
    if (!renameDraftId || !renameDraftName.trim()) return;
    setSessionComponentLibrary((prev) =>
      prev.map((d) => (d.id === renameDraftId ? { ...d, name: renameDraftName.trim() } : d))
    );
    if (activeComponentDraft?.id === renameDraftId) {
      setActiveComponentDraft({ ...activeComponentDraft, name: renameDraftName.trim() });
    }
    setRenameDraftId(null);
    setRenameDraftName("");
  };

  const handleDuplicateDraft = (draft: StaziaComponentDraft) => {
    const duplicatedDraft: StaziaComponentDraft = {
      ...draft,
      id: `draft_${Date.now()}_copy`,
      name: `${draft.name} (Cópia)`,
      createdAt: new Date().toISOString(),
    };
    setSessionComponentLibrary((prev) => [duplicatedDraft, ...prev]);
  };

  const handlePreviewDraft = (draft: StaziaComponentDraft) => {
    setActiveComponentDraft(draft);
    setPreviewTarget("COMPONENT_DRAFT");
    setActiveSubTab("preview");
  };

  const filteredDrafts = sessionComponentLibrary.filter((draft) => {
    const matchesType = libraryFilterType === "ALL" || draft.componentType === libraryFilterType;
    const matchesQuery =
      !librarySearchQuery.trim() ||
      draft.name.toLowerCase().includes(librarySearchQuery.toLowerCase()) ||
      draft.componentType.toLowerCase().includes(librarySearchQuery.toLowerCase());
    return matchesType && matchesQuery;
  });

  const subTabs: { id: DesignStudioSubTab; label: string; icon: React.ElementType }[] = [
    { id: "clone", label: "Clonar referência", icon: Copy },
    { id: "references", label: "Referências", icon: Layers },
    { id: "blueprints", label: "Blueprints", icon: Layout },
    { id: "templates", label: "Templates StaziaMed", icon: Palette },
    { id: "components", label: "Biblioteca Stazia", icon: Grid },
    { id: "preview", label: "Pré-visualização", icon: Eye },
  ];

  return (
    <div id="admin-design-studio-view" className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold text-teal-300 uppercase tracking-widest bg-teal-500/15 px-2.5 py-0.5 rounded-full border border-teal-500/30 flex items-center gap-1.5">
              <Palette className="w-3 h-3" />
              StaziaMed Design Studio
            </span>
            <span className="text-[10px] font-semibold text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
              Etapa 1.27E — Transformation Preview
            </span>
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            Motor de Compreensão Visual & Engenharia de Templates
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
            Transformação pura de Blueprints em templates canônicos StaziaMed, mantendo fidelidade estrutural e identidade visual original.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab("clone")}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Copy className="w-4 h-4" />
            <span>Clonar Referência</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-slate-800/80">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                isActive
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-teal-300" : "text-slate-500"}`} />
              <span>{tab.label}</span>
              {tab.id === "blueprints" && activeBlueprint && (
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* 1. CLONAR REFERÊNCIA */}
      {activeSubTab === "clone" && (
        <div className="space-y-6">
          <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-5">
            <div>
              <h4 className="text-sm font-bold text-white">Análise e Extração de Referência Visual</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Informe a URL de destino, selecione o modo de captura e a política de direitos para isolar componentes.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">URL da Referência</label>
                <div className="relative">
                  <input
                    type="url"
                    placeholder="https://exemplo.com.br/pagina-de-estudo-ou-painel"
                    value={cloneUrl}
                    onChange={(e) => setCloneUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Direitos de Uso & Política de Propriedade</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: "OWNED" as const, label: "Site próprio", desc: "Reconstrução 100% autorizada" },
                    { id: "LICENSED" as const, label: "Licenciado", desc: "Uso comercial sob licença" },
                    { id: "AUTHORIZED" as const, label: "Autorizado", desc: "Autorização expressa concedida" },
                    { id: "PUBLIC_REFERENCE_ONLY" as const, label: "Apenas referência visual", desc: "Extrai apenas layout & grid" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCloneRights(item.id)}
                      className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                        cloneRights === item.id
                          ? "bg-teal-500/20 border-teal-500/40 text-teal-200 font-bold"
                          : "bg-black/30 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <span className="text-xs font-bold block">{item.label}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5 font-normal">{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Modo de Captura & Granularidade</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: "FULL_PAGE" as const, label: "Página inteira", desc: "Página completa e grid mestre" },
                    { id: "SECTION" as const, label: "Selecionar seção", desc: "Isola blocos e seções específicas" },
                    { id: "COMPONENT" as const, label: "Selecionar componente", desc: "Captura elementos atômicos/cards" },
                    { id: "DESIGN_SYSTEM" as const, label: "Design system", desc: "Tokens de cores, fontes e raios" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setCaptureMode(mode.id)}
                      className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                        captureMode === mode.id
                          ? "bg-sky-500/20 border-sky-500/40 text-sky-200 font-bold"
                          : "bg-black/30 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <span className="text-xs font-bold block">{mode.label}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5 font-normal">{mode.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isAnalyzing ? "Executando Análise Isolada..." : "Analisar Referência"}</span>
              </button>

              {analysisResult?.error && (
                <div className="p-3 rounded-xl text-xs flex items-center gap-2 border bg-rose-500/10 border-rose-500/30 text-rose-300 max-w-xl">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{analysisResult.error.message}</span>
                </div>
              )}
            </div>

            {/* Live Progress or Success Result Card with Full Page Transform Button */}
            {analysisResult?.success && analysisResult.blueprint && (
              <div className="mt-4 p-5 rounded-2xl bg-teal-950/30 border border-teal-500/40 space-y-4 animate-in fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCheck className="w-5 h-5 text-teal-400" />
                    <div>
                      <h5 className="text-xs font-bold text-teal-200">
                        Blueprint Estrutural Extraído & Sanitizado
                      </h5>
                      <p className="text-[11px] text-slate-400">
                        ID: {analysisResult.blueprint.id} • {detectedCandidates.length} componentes candidatos identificados
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTransformToStazia(analysisResult.blueprint)}
                      disabled={isTransforming}
                      className="px-4 py-2 bg-gradient-to-r from-teal-500 to-sky-600 hover:from-teal-400 hover:to-sky-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-teal-500/25 transition-all cursor-pointer flex items-center gap-2 shrink-0 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTransforming ? "animate-spin" : ""}`} />
                      <span>{isTransforming ? "Transformando..." : "Transformar Template Completo"}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-black/40 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Seções Mapeadas</span>
                    <span className="text-sm font-bold text-white">
                      {analysisResult.sanitizedExtraction?.layoutObservations.length || 0}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Componentes Detectados</span>
                    <span className="text-sm font-bold text-teal-300">
                      {detectedCandidates.length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Cores Observadas</span>
                    <span className="text-sm font-bold text-white">
                      {analysisResult.sanitizedExtraction?.observedTokens.colors.length || 0}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Viewports Inspecionados</span>
                    <span className="text-sm font-bold text-teal-300">
                      3 (1440p, 768p, 390p)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Region Map & Component Candidate Selection Overlay */}
          {detectedCandidates.length > 0 && (
            <ComponentRegionMapOverlay
              candidates={detectedCandidates}
              selectedCandidateId={selectedCandidateId}
              onSelectCandidate={(cand) => setSelectedCandidateId(cand.id)}
              onTransformSelected={handleTransformSelectedCandidate}
              isTransforming={isTransforming}
            />
          )}
        </div>
      )}

      {/* 2. REFERÊNCIAS */}
      {activeSubTab === "references" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
          <div>
            <h4 className="text-sm font-bold text-white">Catálogo de Referências Capturadas</h4>
            <p className="text-xs text-slate-400 mt-0.5">Histórico de URLs e capturas registradas para inspiração de design.</p>
          </div>

          {analysisResult?.rawExtraction ? (
            <div className="p-4 rounded-2xl bg-black/40 border border-teal-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{analysisResult.rawExtraction.targetUrl}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold">
                  {analysisResult.rawExtraction.rightsType}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Título: {analysisResult.rawExtraction.pageMetadata.title || "Sem título"} • Capturado em: {new Date(analysisResult.rawExtraction.capturedAt).toLocaleString("pt-BR")}
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 text-xs text-slate-400 text-center py-8">
              Nenhuma referência externa capturada nesta sessão. Execute uma análise na aba "Clonar referência".
            </div>
          )}
        </div>
      )}

      {/* 3. BLUEPRINTS */}
      {activeSubTab === "blueprints" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-white">
                {activeBlueprint ? `Blueprint Abstrato: ${activeBlueprint.id}` : "Blueprint Abstrato Detectado"}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeBlueprint
                  ? `Gerado a partir da referência ${analysisResult?.request.url || "captura"}`
                  : "Exemplo estático controlado de extração de padrões e hierarquia."}
              </p>
            </div>

            {activeBlueprint && (
              <button
                type="button"
                onClick={() => handleTransformToStazia(activeBlueprint)}
                disabled={isTransforming}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition-all cursor-pointer flex items-center gap-2 shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTransforming ? "animate-spin" : ""}`} />
                <span>{isTransforming ? "Transformando..." : "Transformar para StaziaMed"}</span>
              </button>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-black/40 border border-slate-800 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-slate-800 flex items-center gap-2 text-slate-300">
                <Check className="w-4 h-4 text-teal-400" />
                <span>
                  {activeBlueprint ? `${activeBlueprint.sections.length} Seções de Layout` : "Header de Navegação"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-slate-800 flex items-center gap-2 text-slate-300">
                <Check className="w-4 h-4 text-teal-400" />
                <span>Grid Responsivo ({activeBlueprint?.layout.gridColumns || 12} Colunas)</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-slate-800 flex items-center gap-2 text-slate-300">
                <Check className="w-4 h-4 text-teal-400" />
                <span>
                  {activeBlueprint ? `${activeBlueprint.componentTypes.length} Componentes Mapeados` : "4 Tipos de Cards Clínicos"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-slate-800 flex items-center gap-2 text-slate-300">
                <Check className="w-4 h-4 text-teal-400" />
                <span>
                  {activeBlueprint ? `${activeBlueprint.observedTokens.colorPalette.length} Cores Detectadas` : "Tabela Comparativa"}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-slate-800 flex items-center gap-2 text-slate-300">
                <Check className="w-4 h-4 text-teal-400" />
                <span>Sanitização Rigorosa de Marcas</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-slate-800 flex items-center gap-2 text-slate-300">
                <Check className="w-4 h-4 text-teal-400" />
                <span>Breakpoints 1440 / 768 / 390</span>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleTransformToStazia(activeBlueprint)}
                className="px-4 py-2 bg-teal-600/80 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Transformar para StaziaMed
              </button>
              <span className="text-[11px] text-slate-400">
                Gera um novo StaziaDesignTemplate com tokens corporativos da StaziaMed.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 4. TEMPLATES STAZIAMED */}
      {activeSubTab === "templates" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-white">Templates Oficiais StaziaMed</h4>
              <p className="text-xs text-slate-400 mt-0.5">Modelos canônicos aprovados para renderização de conteúdo no ecossistema.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-black/40 border border-teal-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-xs">{selectedTemplate.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold">
                    v{selectedTemplate.version}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                    {selectedTemplate.templateFamily}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                    {selectedTemplate.status} / FOUNDATION
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Referência visual canônica: StaziaMed_Revalida_Hipertensao_.pdf • 6 Componentes mapeados
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewTarget("FULL_TEMPLATE");
                    setActiveSubTab("preview");
                  }}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Visualizar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowMetadataModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar Metadata</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. BIBLIOTECA STAZIA (COMPONENTES) */}
      {activeSubTab === "components" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest bg-teal-500/15 px-2.5 py-0.5 rounded-full border border-teal-500/30 flex items-center gap-1.5">
                  <Boxes className="w-3 h-3" />
                  Biblioteca Stazia
                </span>
                <span className="text-[10px] font-semibold text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                  {sessionComponentLibrary.length} Componentes na Sessão
                </span>
              </div>
              <h4 className="text-base font-bold text-white tracking-tight">
                Biblioteca de Componentes Transformados
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Componentes isolados com identidade visual Medical Editorial StaziaMed prontos para pré-visualização e gerenciamento.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSubTab("clone")}
                className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Capturar Novo</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-black/40 border border-slate-800">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar componente por nome ou tipo..."
                value={librarySearchQuery}
                onChange={(e) => setLibrarySearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none placeholder:text-slate-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {["ALL", "CARD_GROUP", "TABLE", "CALCULATOR_LAYOUT", "FILTER_PANEL"].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setLibraryFilterType(type)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    libraryFilterType === type
                      ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                      : "text-slate-400 hover:text-white bg-white/[0.02]"
                  }`}
                >
                  {type === "ALL" ? "Todos" : type}
                </button>
              ))}
            </div>
          </div>

          {/* Drafts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDrafts.map((draft) => {
              const isFunctionalTool = draft.classification === "FUNCTIONAL_TOOL";
              return (
                <div
                  key={draft.id}
                  data-testid={`stazia-library-item-${draft.id}`}
                  className="p-5 rounded-2xl bg-black/40 border border-slate-800/90 hover:border-teal-500/40 transition-all flex flex-col justify-between space-y-4 group"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-white group-hover:text-teal-200 transition-colors">
                            {draft.name}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                              isFunctionalTool
                                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                : "bg-teal-500/15 text-teal-300 border-teal-500/30"
                            }`}
                          >
                            {draft.componentType}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          ID: <span className="font-mono text-slate-300">{draft.id}</span> • Criado em: {new Date(draft.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>

                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono shrink-0">
                        {draft.styleProfile}
                      </span>
                    </div>

                    {/* Metadata Badges */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                      <div className="p-2 rounded-xl bg-white/[0.02] border border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block">Classificação</span>
                        <span className="font-semibold text-slate-300">
                          {isFunctionalTool ? "Ferramenta / Calculadora" : "Componente Visual"}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-white/[0.02] border border-slate-800/80">
                        <span className="text-[10px] text-slate-500 block">Lógica Proprietária Capturada</span>
                        <span className="font-semibold text-emerald-400 flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          NÃO (Isolado)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid={`btn-preview-draft-${draft.id}`}
                        onClick={() => handlePreviewDraft(draft)}
                        className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Visualizar</span>
                      </button>

                      <button
                        type="button"
                        data-testid={`btn-rename-draft-${draft.id}`}
                        onClick={() => handleOpenRename(draft)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Renomear</span>
                      </button>

                      <button
                        type="button"
                        data-testid={`btn-duplicate-draft-${draft.id}`}
                        onClick={() => handleDuplicateDraft(draft)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Duplicar</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      data-testid={`btn-prepare-install-${draft.id}`}
                      onClick={() => handleOpenPrepareInstall(draft)}
                      className="px-3 py-1.5 rounded-xl bg-sky-950/60 hover:bg-sky-900/80 border border-sky-600/40 text-sky-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Preparar instalação</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredDrafts.length === 0 && (
            <div className="p-8 rounded-2xl bg-black/30 border border-slate-800 text-center space-y-2">
              <Boxes className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-xs text-slate-400">Nenhum componente encontrado com os filtros selecionados.</p>
            </div>
          )}
        </div>
      )}

      {/* 6. PRÉ-VISUALIZAÇÃO */}
      {activeSubTab === "preview" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-white">
                  {previewTarget === "COMPONENT_DRAFT" && activeComponentDraft
                    ? activeComponentDraft.name
                    : selectedTemplate.name}
                </span>
                <span className="text-[10px] font-bold text-teal-300 bg-teal-500/10 border border-teal-500/30 px-2 py-0.5 rounded-full">
                  Status: DRAFT
                </span>
                <span className="text-[10px] font-semibold text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                  {previewTarget === "COMPONENT_DRAFT" && activeComponentDraft
                    ? activeComponentDraft.componentType
                    : selectedTemplate.templateFamily}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {previewTarget === "COMPONENT_DRAFT"
                  ? "Renderização isolada de componente em React com tokens Medical Editorial StaziaMed."
                  : "Renderização React do template completo com layout master e seções coordenadas."}
              </p>
            </div>

            {/* Preview Target Switcher (Full vs Component) & Viewport Switcher */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-slate-800">
                <button
                  type="button"
                  data-testid="btn-switch-full-template"
                  onClick={() => setPreviewTarget("FULL_TEMPLATE")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    previewTarget === "FULL_TEMPLATE"
                      ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Template Completo
                </button>
                {activeComponentDraft && (
                  <button
                    type="button"
                    data-testid="btn-switch-component-draft"
                    onClick={() => setPreviewTarget("COMPONENT_DRAFT")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      previewTarget === "COMPONENT_DRAFT"
                        ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Componente Isolado
                  </button>
                )}
              </div>

              {/* Viewport Switcher */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setPreviewViewport("DESKTOP_1440")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    previewViewport === "DESKTOP_1440"
                      ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Desktop (1440px)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewViewport("TABLET_768")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    previewViewport === "TABLET_768"
                      ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Tablet className="w-3.5 h-3.5" />
                  <span>Tablet (768px)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewViewport("MOBILE_390")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    previewViewport === "MOBILE_390"
                      ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Mobile (390px)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Interactive React Preview (Component vs Template) */}
          {previewTarget === "COMPONENT_DRAFT" && activeComponentDraft ? (
            <StaziaComponentPreviewRenderer
              draft={activeComponentDraft}
              viewport={previewViewport}
              onViewportChange={setPreviewViewport}
            />
          ) : (
            <StaziaDesignPreviewRenderer
              template={selectedTemplate}
              viewport={previewViewport}
            />
          )}
        </div>
      )}

      {/* Rename Draft Modal */}
      {renameDraftId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-[#0B192C] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <h4 className="text-sm font-bold text-white">Renomear Componente</h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Nome do Componente</label>
                <input
                  type="text"
                  value={renameDraftName}
                  onChange={(e) => setRenameDraftName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-slate-700 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRenameDraftId(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                data-testid="btn-confirm-rename"
                onClick={handleSaveRename}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prepare Installation Modal (Read-Only Manifest & Contract Plan) */}
      {prepareInstallDraft && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="max-w-lg w-full bg-[#0B192C] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-sky-400" />
                <span>Preparar Instalação de Componente</span>
              </h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                STAGE 1.27F (CONTRATO APENAS)
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-black/40 border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 block">Componente Selecionado</span>
                <span className="font-bold text-white">{prepareInstallDraft.name}</span>
                <span className="text-[10px] text-slate-400 block">
                  Tipo: {prepareInstallDraft.componentType} • Perfil: {prepareInstallDraft.styleProfile}
                </span>
              </div>

              {/* Plan Configuration Form */}
              <div className="space-y-3 p-3.5 rounded-xl bg-black/30 border border-slate-800">
                <h5 className="text-[11px] font-bold text-sky-300">Configuração do Plano de Instalação:</h5>

                <div>
                  <label className="text-slate-400 block mb-1">Local de Destino (Placement Target)</label>
                  <select
                    value={installTarget}
                    onChange={(e) => setInstallTarget(e.target.value as ComponentPlacementTarget)}
                    className="w-full px-3 py-1.5 rounded-lg bg-black/50 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
                  >
                    <option value="SIDEBAR">SIDEBAR (Barra Lateral)</option>
                    <option value="DASHBOARD">DASHBOARD (Painel Principal)</option>
                    <option value="EXISTING_PAGE">EXISTING_PAGE (Página Existente)</option>
                    <option value="NEW_PAGE">NEW_PAGE (Nova Página Dedicada)</option>
                    <option value="MODAL">MODAL (Janela Suspensa)</option>
                    <option value="ADMIN_PANEL">ADMIN_PANEL (Painel do Administrador)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">Tipo de Destino</label>
                    <select
                      value={installDestination}
                      onChange={(e) => setInstallDestination(e.target.value as ComponentDestinationType)}
                      className="w-full px-3 py-1.5 rounded-lg bg-black/50 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
                    >
                      <option value="ROUTE">ROUTE (Rota)</option>
                      <option value="MODAL">MODAL</option>
                      <option value="INLINE_PANEL">INLINE_PANEL</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Visibilidade</label>
                    <select
                      value={installVisibility}
                      onChange={(e) => setInstallVisibility(e.target.value as ComponentInstallationVisibility)}
                      className="w-full px-3 py-1.5 rounded-lg bg-black/50 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
                    >
                      <option value="STUDENT">STUDENT (Alunos)</option>
                      <option value="ADMIN_ONLY">ADMIN_ONLY (Apenas Admin)</option>
                      <option value="ALL_AUTHENTICATED">ALL_AUTHENTICATED</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Rótulo do Botão / Entrada</label>
                  <input
                    type="text"
                    value={installButtonLabel}
                    onChange={(e) => setInstallButtonLabel(e.target.value)}
                    placeholder="Ex: Calculadora clínica"
                    className="w-full px-3 py-1.5 rounded-lg bg-black/50 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
                  />
                </div>

                {installDestination === "ROUTE" && (
                  <div>
                    <label className="text-slate-400 block mb-1">Rota de Destino (targetRoute)</label>
                    <input
                      type="text"
                      value={installTargetRoute}
                      onChange={(e) => setInstallTargetRoute(e.target.value)}
                      placeholder="Ex: /ferramentas/calculadora-clinica"
                      className="w-full px-3 py-1.5 rounded-lg bg-black/50 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
                    />
                  </div>
                )}

                <button
                  type="button"
                  data-testid="btn-validate-installation-plan"
                  onClick={handleValidatePlan}
                  className="w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Validar Plano de Instalação (Contrato)</span>
                </button>

                {planValidationNotice && (
                  <div
                    data-testid="plan-validation-notice"
                    className="p-2.5 rounded-lg bg-teal-950/40 border border-teal-500/40 text-[11px] text-teal-200"
                  >
                    {planValidationNotice}
                  </div>
                )}
              </div>

              <div className="space-y-2 p-3 rounded-xl bg-black/30 border border-slate-800">
                <h5 className="text-[11px] font-bold text-teal-300">Checklist de Conformidade Arquitetural:</h5>
                <div className="space-y-1 text-[11px] text-slate-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span>Nenhum código externo ou script arbitrário presente</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span>Lógica proprietária descartada (apenas interface declarativa)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span>Garantia estrita: SIDEBAR_CHANGED = NO & PRODUCT_ROUTES_CREATED = 0</span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-500/30 text-[11px] text-sky-200">
                ℹ️ <strong>Nota de Isolamento:</strong> Nesta etapa, o plano é meramente contratual. Nenhuma rota de aluno é criada, a Sidebar não é alterada e nenhuma gravação no Firestore/Storage ocorre (`FIRESTORE_WRITES = 0`).
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPrepareInstallDraft(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metadata Modal */}
      {showMetadataModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-[#0B192C] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <h4 className="text-sm font-bold text-white">Editar Metadata do Template</h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Nome do Template</label>
                <input
                  type="text"
                  value={selectedTemplate.name}
                  onChange={(e) => setSelectedTemplate({ ...selectedTemplate, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-slate-700 text-white focus:border-teal-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Família</label>
                <input
                  type="text"
                  disabled
                  value={selectedTemplate.templateFamily}
                  className="w-full px-3 py-2 rounded-xl bg-black/20 border border-slate-800 text-slate-400"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowMetadataModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
