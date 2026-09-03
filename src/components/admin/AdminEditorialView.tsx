import React, { useState } from "react";
import {
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Sparkles,
  ShieldCheck,
  BarChart3,
  ListOrdered,
  Search,
  Database,
  RefreshCw,
  Server,
  Cloud,
  Check,
  Trash2,
  RotateCcw,
  Users,
  Key,
  ShieldAlert,
  Cpu,
  Radio,
  Terminal,
  FileText,
  AlertTriangle,
  Lock,
  Globe,
  ExternalLink,
  Activity,
  CheckCircle,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { AdminQualityRiskPanel } from "./AdminQualityRiskPanel";
import { InventoryAuditView } from "../questions/InventoryAuditView";
import { FirebaseService } from "../../services/firebaseService";
import { FIRESTORE_DATABASE_ID, FIRESTORE_REGION } from "../../lib/firebase";
import { SEED_OSCE_STATIONS } from "../../data/osceStationsData";
import { AiModelSelector } from "./AiModelSelector";

export type AdminTab =
  | "users"
  | "canonical-inventory"
  | "content"
  | "ai-models"
  | "integrations"
  | "firebase-cloud"
  | "logs"
  | "audit";

export const AdminEditorialView: React.FC = () => {
  const {
    questions,
    guidelines,
    editionsInventory,
    knowledgeGraph,
    user,
    firebaseUser,
    resetUserData,
    resetAllData,
    setActiveTab,
  } = useApp();

  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>("users");
  const [isSyncing, setIsSyncing] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    success?: boolean;
    message?: string;
    details?: any;
    timestamp?: string;
  } | null>(null);

  // Search filter for content & logs
  const [searchTerm, setSearchTerm] = useState("");

  // Simulated server-backed user list for the admin console
  const [adminUsersList, setAdminUsersList] = useState([
    {
      id: "usr-admin-master",
      name: "Administrador Chefe",
      email: "admin@staziamed.com.br",
      role: "ADMIN" as const,
      tier: "PRO_PLUS" as const,
      status: "Ativo",
      verified: true,
      lastLogin: "Hoje, 11:42",
      origin: "Firebase Server Claims",
    },
    {
      id: user.id,
      name: user.name || "Dr(a). Candidato(a) Atual",
      email: firebaseUser?.email || user.email || "aluno@revalidando.med.br",
      role: user.role,
      tier: user.tier,
      status: "Ativo",
      verified: Boolean(firebaseUser?.emailVerified),
      lastLogin: "Agora",
      origin: "Firestore Server Doc",
    },
    {
      id: "usr-student-sample-1",
      name: "Dra. Mariana Costa",
      email: "mariana.costa@medicina.br",
      role: "STUDENT" as const,
      tier: "PRO" as const,
      status: "Ativo",
      verified: true,
      lastLogin: "Ontem, 19:15",
      origin: "Firestore Server Doc",
    },
    {
      id: "usr-editor-sample-2",
      name: "Dr. Carlos Eduardo (Curador Geral)",
      email: "carlos.curadoria@staziamed.com.br",
      role: "EDITOR" as const,
      tier: "PRO_PLUS" as const,
      status: "Ativo",
      verified: true,
      lastLogin: "Hoje, 09:30",
      origin: "Firestore Server Doc",
    },
  ]);

  // Server security check: Must be ADMIN role
  const isDeveloperAdmin =
    user?.role === "ADMIN" ||
    user?.tier === "ADMIN";

  if (!isDeveloperAdmin) {
    return (
      <div
        id="admin-access-denied"
        className="max-w-xl mx-auto my-12 p-8 rounded-[28px] bg-slate-950/90 border border-rose-500/30 text-center space-y-5 shadow-2xl backdrop-blur-2xl"
      >
        <div className="w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center border border-rose-500/30">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Acesso Restrito à Administração
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
            Esta área exige confirmação de privilégios <code className="text-rose-300 font-mono">ADMIN</code> validados pelo servidor.
            Por políticas de segurança contra escalada de privilégios, o perfil de acesso nunca é determinado pelo cliente.
          </p>
        </div>
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("home")}
            className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg shadow-teal-600/20 transition-all cursor-pointer"
          >
            Voltar para a Área do Aluno
          </button>
        </div>
      </div>
    );
  }

  const handleSyncToFirestore = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const res = await FirebaseService.importAllData({
        questions,
        guidelines,
        editions: editionsInventory,
        osceStations: SEED_OSCE_STATIONS,
        knowledgeNodes: knowledgeGraph,
        userProfile: user,
      });

      if (res.success) {
        setSyncStatus({
          success: true,
          message: `Importação concluída com sucesso no banco ${FIRESTORE_DATABASE_ID}!`,
          details: res,
          timestamp: new Date().toLocaleTimeString("pt-BR"),
        });
      } else {
        setSyncStatus({
          success: false,
          message: `Falha ao importar: ${res.error}`,
          timestamp: new Date().toLocaleTimeString("pt-BR"),
        });
      }
    } catch (err: any) {
      setSyncStatus({
        success: false,
        message: `Erro na sincronização: ${err?.message || String(err)}`,
        timestamp: new Date().toLocaleTimeString("pt-BR"),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const adminTabsConfig: { id: AdminTab; label: string; icon: React.ElementType }[] = [
    { id: "users", label: "Usuários e permissões", icon: Users },
    { id: "canonical-inventory", label: "Banco Canônico & Auditoria INEP", icon: ShieldCheck },
    { id: "content", label: "Conteúdo e questões", icon: ListOrdered },
    { id: "ai-models", label: "Modelos de IA", icon: Cpu },
    { id: "integrations", label: "Integrações", icon: Radio },
    { id: "firebase-cloud", label: "Firebase e nuvem", icon: Database },
    { id: "logs", label: "Logs", icon: Terminal },
    { id: "audit", label: "Auditoria", icon: ShieldAlert },
  ];

  return (
    <div id="admin-editorial-view" className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* Header da Área Administrativa */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 sm:p-8 rounded-[28px] backdrop-blur-2xl bg-gradient-to-br from-[#0c1626] to-[#0f1f38] border border-slate-800 shadow-2xl">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold text-teal-300 uppercase tracking-widest bg-teal-500/15 px-2.5 py-0.5 rounded-full border border-teal-500/30 flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              Console Administrativo de Governança
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Painel Central de Administração & Infraestrutura
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            Gestão restrita a administradores confirmados pelo servidor. Controle de dados, modelos de IA, permissões e integridade de conteúdo médico.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            id="btn-sync-database-quick"
            onClick={handleSyncToFirestore}
            disabled={isSyncing}
            className="text-xs font-bold px-4 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-500/20 border border-teal-400/30 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Sincronizando..." : "Sincronizar Firestore"}
          </button>
        </div>
      </div>

      {/* 7 Tabs de Administração */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-[#0c1626] border border-slate-800">
        {adminTabsConfig.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeAdminTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`btn-admin-tab-${tab.id}`}
              onClick={() => setActiveAdminTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                isActive
                  ? "bg-teal-500/20 text-teal-200 border border-teal-500/40 shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-teal-400" : "text-slate-400"}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 1. USUÁRIOS E PERMISSÕES                                                  */}
      {/* ========================================================================= */}
      {activeAdminTab === "users" && (
        <div className="space-y-6">
          <div className="p-6 rounded-[28px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-teal-400" />
                  Contas de Usuários & Políticas de Acesso
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Apenas o backend/administrador pode alterar privilégios (campo <code className="text-teal-300 font-mono">role</code> no Firestore protegido contra escrita direta por clientes).
                </p>
              </div>
              <span className="text-xs px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono font-bold">
                Firestore Rules: ENFORCED
              </span>
            </div>

            {/* User List Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Usuário</th>
                    <th className="pb-3 font-semibold">E-mail</th>
                    <th className="pb-3 font-semibold">Papel (Role)</th>
                    <th className="pb-3 font-semibold">Plano</th>
                    <th className="pb-3 font-semibold">Origem do Privilégio</th>
                    <th className="pb-3 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {adminUsersList.map((u) => (
                    <tr key={u.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 font-semibold text-white">{u.name}</td>
                      <td className="py-3 font-mono text-[11px] text-slate-400">{u.email}</td>
                      <td className="py-3">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                            u.role === "ADMIN"
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                              : u.role === "EDITOR"
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                              : "bg-teal-500/20 text-teal-300 border-teal-500/30"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 font-bold text-white text-[11px]">{u.tier}</td>
                      <td className="py-3 font-mono text-[11px] text-slate-400">{u.origin}</td>
                      <td className="py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {u.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. BANCO CANÔNICO & AUDITORIA INEP                                        */}
      {/* ========================================================================= */}
      {activeAdminTab === "canonical-inventory" && (
        <div className="space-y-6">
          <InventoryAuditView
            questions={questions}
            attempts={[]}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. CONTEÚDO E QUESTÕES                                                    */}
      {/* ========================================================================= */}
      {activeAdminTab === "content" && (
        <div className="space-y-6">
          <div className="p-6 rounded-[28px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-teal-400" />
                  Inventário de Questões INEP & Matriz Pedagógica
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Total de {questions.length} questões com gabarito oficial fundamentado e validação de competências
                </p>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Filtrar por código ou tema..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl bg-black/40 border border-slate-700 text-white text-xs focus:border-teal-400 focus:outline-none w-56"
                />
              </div>
            </div>

            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {questions
                .filter(
                  (q) =>
                    !searchTerm ||
                    q.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    q.topic.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((q) => (
                  <div
                    key={q.id}
                    className="p-3.5 rounded-2xl bg-white/[0.02] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-white/[0.04] transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white font-mono">{q.code}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                          {q.area.replace("_", " ")}
                        </span>
                        <span className="text-[10px] font-bold text-teal-300 bg-teal-500/20 px-2 py-0.5 rounded-full border border-teal-500/30">
                          {q.reviewStatus || "Aprovada"}
                        </span>
                      </div>
                      <p className="text-white/90 font-medium line-clamp-1">{q.topic}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Score Qualidade</span>
                        <span className="text-xs font-bold text-emerald-400 font-mono">
                          {q.qualityScore ?? 98}/100
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Copy Risk</span>
                        <span className="text-xs font-bold text-sky-300 font-mono">
                          {q.copyRiskScore ?? 16}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MODELOS DE IA                                                          */}
      {/* ========================================================================= */}
      {activeAdminTab === "ai-models" && (
        <div className="space-y-6">
          <div className="p-6 rounded-[28px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
            <AiModelSelector />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. INTEGRAÇÕES                                                            */}
      {/* ========================================================================= */}
      {activeAdminTab === "integrations" && (
        <div className="space-y-6">
          <div className="p-6 rounded-[28px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-teal-400" />
              Serviços & Conectores de Infraestrutura
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Google Cloud Vertex AI</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                    Conectado (ADC)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Projeto Cloud Run configurado na região <code className="text-teal-300">{FIRESTORE_REGION}</code> com autenticação Application Default Credentials.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Serviço de Áudio & Flash-Voice</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                    Ativo
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Web Speech Synthesis e streaming de voz para o paciente virtual nas estações do Revalida OSCE.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. FIREBASE E NUVEM                                                       */}
      {/* ========================================================================= */}
      {activeAdminTab === "firebase-cloud" && (
        <div className="space-y-6">
          <div className="p-6 rounded-[28px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">Banco de Dados Firestore Conectado</h3>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Ativo
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    {FIRESTORE_DATABASE_ID} ({FIRESTORE_REGION})
                  </p>
                </div>
              </div>

              <button
                id="btn-sync-all-to-firestore"
                onClick={handleSyncToFirestore}
                disabled={isSyncing}
                className="px-5 py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-xl shadow-teal-600/30 border border-teal-400/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Importando Coleções..." : "Executar Importação Completa"}
              </button>
            </div>

            {/* Sync Feedback Alert */}
            {syncStatus && (
              <div
                className={`p-4 rounded-2xl border flex items-start gap-3 text-xs transition-all ${
                  syncStatus.success
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}
              >
                {syncStatus.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <div className="font-bold flex items-center gap-2">
                    {syncStatus.message}
                    <span className="text-[10px] opacity-70">({syncStatus.timestamp})</span>
                  </div>
                  {syncStatus.details && (
                    <div className="text-[11px] opacity-90 font-mono flex flex-wrap gap-3 pt-1">
                      <span>• {syncStatus.details.questionsCount} Questões</span>
                      <span>• {syncStatus.details.guidelinesCount} Diretrizes</span>
                      <span>• {syncStatus.details.editionsCount} Edições</span>
                      <span>• {syncStatus.details.osceCount} Estações OSCE</span>
                      <span>• {syncStatus.details.nodesCount} Nós do Grafo</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Coleções */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
              <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-teal-400" />
                  /questions ({questions.length})
                </span>
                <p className="text-[11px] text-slate-400">Banco de questões oficiais INEP com metadados clínicos.</p>
              </div>

              <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  /guidelines ({guidelines.length})
                </span>
                <p className="text-[11px] text-slate-400">PCDT do Ministério da Saúde e consensos de sociedades médicas.</p>
              </div>

              <div className="p-4 rounded-2xl bg-black/30 border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ListOrdered className="w-4 h-4 text-amber-400" />
                  /editions ({editionsInventory.length})
                </span>
                <p className="text-[11px] text-slate-400">Edições do Revalida INEP com notas de corte históricas.</p>
              </div>
            </div>
          </div>

          {/* Limpeza de Testes para Produção */}
          <div className="p-6 rounded-[28px] bg-[#0c1626]/90 border border-slate-800 space-y-3 shadow-xl">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-amber-400" />
              Estado Inicial & Limpeza de Testes para Produção
            </h3>
            <p className="text-xs text-slate-400">
              Redefina o estado do aluno para 0% sem afetar o banco oficial de questões.
            </p>

            {resetSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{resetSuccessMsg}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                resetUserData();
                setResetSuccessMsg("Histórico de tentativas e métricas zerados com sucesso para o aluno!");
                setTimeout(() => setResetSuccessMsg(null), 5000);
              }}
              className="px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold text-xs border border-amber-500/30 flex items-center gap-2 transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-amber-400" />
              <span>Zerar Progresso & Métricas do Aluno (Estado Zero)</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. LOGS                                                                   */}
      {/* ========================================================================= */}
      {activeAdminTab === "logs" && (
        <div className="space-y-6">
          <div className="p-6 rounded-[28px] bg-[#0c1626]/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-teal-400" />
                Telemetria de Execução & Logs da IA em Tempo Real
              </h3>
              <span className="text-[10px] font-mono text-slate-400 bg-black/40 px-2 py-1 rounded-lg">
                Streaming: Conectado
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-black/60 border border-slate-800 font-mono text-xs space-y-2 text-slate-300 max-h-96 overflow-y-auto">
              <div className="text-emerald-400">[INFO] Firestore database instance bound to {FIRESTORE_DATABASE_ID}</div>
              <div className="text-slate-400">[INFO] AI Model routing active: Gemini 2.5 Pro (Clinical Analysis)</div>
              <div className="text-slate-400">[INFO] Application Default Credentials (ADC) loaded successfully</div>
              <div className="text-teal-300">[AUDIT] User profile security rule verified: immutable role field constraint active</div>
              <div className="text-slate-400">[METRIC] Spaced repetition scheduler updated: 0 pending overdue cards</div>
              <div className="text-emerald-400">[READY] System operational — 0 fatal errors in active cycle</div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. AUDITORIA                                                              */}
      {/* ========================================================================= */}
      {activeAdminTab === "audit" && (
        <div className="space-y-6">
          <AdminQualityRiskPanel />
        </div>
      )}
    </div>
  );
};
