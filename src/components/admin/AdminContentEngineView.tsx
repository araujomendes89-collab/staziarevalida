import React, { useState } from "react";
import {
  FileText,
  UploadCloud,
  Layers,
  Sparkles,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  Shield,
  FileCheck,
  AlertTriangle,
  Info,
  Clock,
  ExternalLink,
  ChevronRight,
  Table,
  Workflow,
} from "lucide-react";
import {
  SourceDocumentType,
  ContentReferenceRightsType,
  CONTENT_BLOCK_COMPONENT_REGISTRY,
} from "../../types/adminContentEngine";

export type ContentEngineSubTab =
  | "overview"
  | "import"
  | "sources"
  | "structured"
  | "generated"
  | "review"
  | "publications";

export const AdminContentEngineView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<ContentEngineSubTab>("overview");
  const [importTitle, setImportTitle] = useState("");
  const [importSourceType, setImportSourceType] = useState<SourceDocumentType>("DIRETRIZ");
  const [importRightsType, setImportRightsType] = useState<ContentReferenceRightsType>("PUBLIC_REFERENCE_ONLY");
  const [showImportNotice, setShowImportNotice] = useState(false);

  const subTabs: { id: ContentEngineSubTab; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Visão Geral", icon: BookOpen },
    { id: "import", label: "Importar PDF", icon: UploadCloud },
    { id: "sources", label: "Documentos-fonte", icon: FileText },
    { id: "structured", label: "Conteúdo estruturado", icon: Layers },
    { id: "generated", label: "Conteúdo gerado", icon: Sparkles },
    { id: "review", label: "Fila de Revisão", icon: FileCheck },
    { id: "publications", label: "Publicações", icon: CheckCircle2 },
  ];

  return (
    <div id="admin-content-engine-view" className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold text-teal-300 uppercase tracking-widest bg-teal-500/15 px-2.5 py-0.5 rounded-full border border-teal-500/30 flex items-center gap-1.5">
              <BookOpen className="w-3 h-3" />
              StaziaMed Content Engine
            </span>
            <span className="text-[10px] font-semibold text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
              Etapa 1.27B — Foundation
            </span>
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            Motor de Ingestão & Curadoria Médica Estruturada
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
            Pipeline de extração, estruturação semântica e governança editorial para apostilas, PCDTs, diretrizes e cadernos INEP.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab("import")}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition-all flex items-center gap-2 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Novo Documento</span>
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
            </button>
          );
        })}
      </div>

      {/* 1. VISÃO GERAL */}
      {activeSubTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-black/30 border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">1. Ingestão & Parsing</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Upload de PDFs e diretrizes com extração semântica respeitando direitos e proveniência.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab("import")}
                className="text-xs text-teal-300 hover:text-teal-200 font-semibold flex items-center gap-1 cursor-pointer pt-1"
              >
                <span>Importar fonte</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-black/30 border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">2. Estruturação AST</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Divisão em blocos semânticos (Alertas, Diretrizes, Tabelas, Algoritmos Clínicos).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab("structured")}
                className="text-xs text-sky-300 hover:text-sky-200 font-semibold flex items-center gap-1 cursor-pointer pt-1"
              >
                <span>Explorar AST</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-black/30 border border-slate-800/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">3. Curadoria & Publicação</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Revisão médica humana obrigatória antes de publicar no ecossistema canônico.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab("review")}
                className="text-xs text-emerald-300 hover:text-emerald-200 font-semibold flex items-center gap-1 cursor-pointer pt-1"
              >
                <span>Ver fila</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Component Registry Card */}
          <div className="p-5 rounded-2xl bg-[#0B1728]/80 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <Workflow className="w-4 h-4 text-teal-400" />
              <span>Registro de Componentes Semânticos Mapeados (JSON → StaziaComponent)</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 pt-1">
              {Object.entries(CONTENT_BLOCK_COMPONENT_REGISTRY).map(([blockKey, componentName]) => (
                <div key={blockKey} className="p-2.5 rounded-xl bg-black/40 border border-slate-800/80">
                  <span className="text-[10px] text-teal-400 font-mono block">{blockKey}</span>
                  <span className="text-xs font-semibold text-white/90 block mt-0.5 truncate">{componentName}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. IMPORTAR PDF */}
      {activeSubTab === "import" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-5">
          <div>
            <h4 className="text-sm font-bold text-white">Importar Documento Médico Fonte</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Cadastre e prepare um novo PDF médico para compreensão estruturada e curadoria.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Título do Documento</label>
              <input
                type="text"
                placeholder="Ex: Diretriz Brasileira de Hipertensão Arterial 2024"
                value={importTitle}
                onChange={(e) => setImportTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Tipo de Fonte</label>
              <select
                value={importSourceType}
                onChange={(e) => setImportSourceType(e.target.value as SourceDocumentType)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none"
              >
                <option value="DIRETRIZ">Diretriz Oficial (SBC, FEBRASGO, etc.)</option>
                <option value="PCDT">PCDT — Ministério da Saúde</option>
                <option value="APOSTILA">Apostila Teórica StaziaMed</option>
                <option value="PROVA">Caderno de Prova INEP</option>
                <option value="AULA">Roteiro de Aula / Resumo</option>
                <option value="MATERIAL_PROPRIO">Material Próprio Autoral</option>
                <option value="OUTRO">Outro Documento</option>
              </select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-medium text-slate-300">Direitos de Uso & Proveniência</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "OWNED" as const, label: "Próprio / Autoral" },
                  { id: "LICENSED" as const, label: "Licenciado" },
                  { id: "AUTHORIZED" as const, label: "Autorizado" },
                  { id: "PUBLIC_REFERENCE_ONLY" as const, label: "Referência Pública" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setImportRightsType(item.id)}
                    className={`p-2.5 rounded-xl text-xs font-medium border text-left transition-all cursor-pointer ${
                      importRightsType === item.id
                        ? "bg-teal-500/20 border-teal-500/40 text-teal-200 font-bold"
                        : "bg-black/30 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Drag & Drop Box */}
          <div className="p-8 rounded-2xl border-2 border-dashed border-slate-700 hover:border-teal-400/50 bg-black/20 text-center space-y-3 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 mx-auto flex items-center justify-center">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Arraste seu arquivo PDF aqui ou clique para selecionar</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Suporte para arquivos PDF de até 50MB</p>
            </div>
          </div>

          {/* Action Button & Foundation Notice */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowImportNotice(true)}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition-all cursor-pointer"
            >
              Iniciar Importação & Análise
            </button>

            {showImportNotice && (
              <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0" />
                <span>Motor de ingestão em preparação (Etapa 1.27B). O upload real será ativado na etapa de parsing.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. DOCUMENTOS FONTE */}
      {activeSubTab === "sources" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-white">Documentos-Fonte Cadastrados</h4>
              <p className="text-xs text-slate-400 mt-0.5">Base documental oficial registrada para extração médica.</p>
            </div>
          </div>

          <div className="space-y-2">
            {[
              {
                id: "doc-sample-1",
                title: "Diretriz Brasileira de Hipertensão Arterial 2020/2024",
                fileName: "StaziaMed_Revalida_Hipertensao_.pdf",
                type: "DIRETRIZ",
                rights: "PUBLIC_REFERENCE_ONLY",
                status: "PROCESSED",
                pages: 28,
              },
              {
                id: "doc-sample-2",
                title: "PCDT Diabetes Mellitus Tipo 2 — MS",
                fileName: "pcdt_diabetes_tipo2_ms.pdf",
                type: "PCDT",
                rights: "PUBLIC_REFERENCE_ONLY",
                status: "PENDING",
                pages: 42,
              },
            ].map((doc) => (
              <div
                key={doc.id}
                className="p-3.5 rounded-2xl bg-black/30 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{doc.title}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-semibold">
                      {doc.type}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                      {doc.rights}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] font-mono">{doc.fileName} • {doc.pages} páginas</p>
                </div>

                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  {doc.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. CONTEÚDO ESTRUTURADO */}
      {activeSubTab === "structured" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
          <div>
            <h4 className="text-sm font-bold text-white">AST de Conteúdo Médico Estruturado</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Exemplo representativo da árvore sintática abstrata gerada a partir do documento fonte.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-black/40 border border-slate-800 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-400 text-[11px] border-b border-slate-800 pb-2">
              <span>Área: CLÍNICA MÉDICA</span>
              <span>Especialidade: CARDIOLOGIA</span>
              <span>Tópico: HIPERTENSÃO ARTERIAL SISTÊMICA</span>
            </div>

            <div className="space-y-2 pt-1 text-slate-300">
              <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-200">
                <span className="text-[10px] uppercase font-bold text-teal-400 block">[HeadingBlock: Level 1]</span>
                Definição e Estratificação de Risco Cardiovascular
              </div>

              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-200">
                <span className="text-[10px] uppercase font-bold text-rose-400 block">[ClinicalWarningCard]</span>
                Atenção: Pacientes com PA ≥ 180x110 mmHg ou LOA são classificados imediatamente como ALTO RISCO.
              </div>

              <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-200">
                <span className="text-[10px] uppercase font-bold text-sky-400 block">[StaziaMedicalTable]</span>
                Tabela 1: Metas Pressóricas segundo Diretriz SBC 2020 vs INEP 2024
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. CONTEÚDO GERADO */}
      {activeSubTab === "generated" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
          <div>
            <h4 className="text-sm font-bold text-white">Rascunhos de Conteúdo Gerado</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Flashcards, questões inéditas e sínteses geradas a partir do conteúdo estruturado.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 text-xs text-slate-400 text-center py-8">
            Nenhum rascunho de IA em processamento nesta etapa de fundação.
          </div>
        </div>
      )}

      {/* 6. FILA DE REVISÃO */}
      {activeSubTab === "review" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
          <div>
            <h4 className="text-sm font-bold text-white">Fila Editorial de Curadoria</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Itens aguardando aprovação médica formal antes de publicação.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 text-xs text-slate-400 text-center py-8">
            Fila editorial limpa. Nenhum item pendente de revisão médica.
          </div>
        </div>
      )}

      {/* 7. PUBLICAÇÕES */}
      {activeSubTab === "publications" && (
        <div className="p-6 rounded-[24px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
          <div>
            <h4 className="text-sm font-bold text-white">Publicações Canônicas Ativas</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Conteúdos aprovados e integrados ao ecossistema de estudo dos alunos.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 text-xs text-slate-400 text-center py-8">
            Todas as publicações canônicas estão sincronizadas com o inventário principal.
          </div>
        </div>
      )}
    </div>
  );
};
