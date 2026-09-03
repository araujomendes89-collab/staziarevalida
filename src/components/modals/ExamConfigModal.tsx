import React, { useState } from "react";
import {
  Calendar,
  X,
  Check,
  Award,
  Clock,
  ShieldCheck,
  UserCheck,
  AlertCircle,
  HelpCircle,
  LogIn,
  LogOut,
  User,
  Sparkles,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { OFFICIAL_REVALIDA_EDITIONS, ExamEngine } from "../../services/examEngine";
import { AiModelSelector } from "../admin/AiModelSelector";

interface ExamConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExamConfigModal: React.FC<ExamConfigModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    user,
    updateUserProfile,
    firebaseUser,
    isAuthLoading,
    signInWithGoogle,
    signInAnonymously,
    logout,
  } = useApp();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);

  const [selectedEdition, setSelectedEdition] = useState<string>(
    user.targetEdition || "Revalida INEP 2026/2"
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    user.examDate || "2026-09-13"
  );
  const [hasConfiguredDate, setHasConfiguredDate] = useState<boolean>(
    user.hasConfiguredExamDate !== false
  );

  if (!isOpen) return null;

  const currentExamInfo = ExamEngine.getExamInfo(
    selectedEdition,
    hasConfiguredDate ? selectedDate : undefined,
    hasConfiguredDate
  );

  const handleSelectOfficialEdition = (editionId: string) => {
    const found = OFFICIAL_REVALIDA_EDITIONS.find((e) => e.id === editionId);
    if (found) {
      setSelectedEdition(found.name);
      setSelectedDate(found.defaultDate);
      setHasConfiguredDate(true);
    }
  };

  const handleSave = () => {
    updateUserProfile({
      targetEdition: selectedEdition,
      examDate: hasConfiguredDate ? selectedDate : "",
      hasConfiguredExamDate: hasConfiguredDate,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-config-title"
    >
      <div className="relative w-full max-w-lg rounded-[28px] bg-[#0c0d14] border border-white/15 p-6 sm:p-8 shadow-2xl space-y-6 text-white overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 id="exam-config-title" className="text-lg font-bold text-white tracking-tight">
                Configuração da Prova & Perfil
              </h2>
              <p className="text-xs text-white/50">
                Fonte única de verdade do cronograma e permissões
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Edição Alvo */}
        <div className="space-y-3">
          <label className="block text-xs font-bold text-white/70 uppercase tracking-wider">
            1. Edição Alvo do Revalida INEP
          </label>
          <div className="space-y-2">
            {OFFICIAL_REVALIDA_EDITIONS.map((ed) => (
              <button
                key={ed.id}
                type="button"
                onClick={() => handleSelectOfficialEdition(ed.id)}
                className={`w-full p-3.5 rounded-2xl text-left border text-xs transition-all flex items-center justify-between ${
                  selectedEdition === ed.name
                    ? "bg-white/10 border-emerald-500/50 text-white font-bold shadow-md"
                    : "bg-white/[0.03] border-white/10 hover:bg-white/[0.06] text-white/70"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{ed.name}</span>
                    {ed.isCurrent && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.2 rounded-full font-bold">
                        Edição Atual
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/50 mt-0.5">
                    {ed.stage} • Data: {ed.defaultDate ? ed.defaultDate.split("-").reverse().join("/") : "A definir"}
                  </p>
                  {ed.edital && (
                    <p className="text-[10px] text-emerald-400/90 mt-0.5">
                      {ed.edital} · {ed.totalQuestions} questões ({ed.totalMinutes} min)
                    </p>
                  )}
                </div>
                {selectedEdition === ed.name && (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Section 2: Data da Prova & Especificações Oficiais */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="exam-date-input" className="text-xs font-bold text-white/70 uppercase tracking-wider">
              2. Data Oficial da Prova
            </label>
            <button
              type="button"
              onClick={() => setHasConfiguredDate(!hasConfiguredDate)}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold"
            >
              {hasConfiguredDate ? "Desativar contagem" : "Definir data específica"}
            </button>
          </div>

          {hasConfiguredDate ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <input
                  id="exam-date-input"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <div className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2.5 rounded-xl shrink-0">
                  {currentExamInfo.daysRemaining} dias restantes
                </div>
              </div>

              {/* Official Notice Digest */}
              {currentExamInfo?.officialDetails && (
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-[11px] text-white/70 space-y-1">
                  <div className="flex items-center justify-between font-semibold text-emerald-400 text-xs">
                    <span>{currentExamInfo?.officialDetails?.edital || "Edital Oficial"}</span>
                    <span>100 Questões (A-D)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 pt-1 text-[10px] text-white/60">
                    <div>• Cartão de Confirmação: <strong>{currentExamInfo?.officialDetails?.confirmationCardDate ? currentExamInfo.officialDetails.confirmationCardDate.split("-").reverse().join("/") : "A definir"}</strong></div>
                    <div>• Duração da Prova: <strong>{currentExamInfo?.officialDetails?.totalMinutes || 300} min (5h)</strong></div>
                    <div>• Portões: <strong>{currentExamInfo?.officialDetails?.gateOpenTime || "12:00"} às {currentExamInfo?.officialDetails?.gateCloseTime || "13:00"}</strong></div>
                    <div>• Aplicação: <strong>{currentExamInfo?.officialDetails?.examStartTime || "13:30"} às {currentExamInfo?.officialDetails?.examEndTime || "18:30"}</strong></div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
              <AlertCircle className="w-4 h-4 inline mr-1 text-amber-400" />
              Sem data definida: o sistema exibirá "Definir data da prova" e utilizará plano por volume em vez de contagem regressiva.
            </div>
          )}
        </div>

        {/* Section 3: Motor de Inteligência Artificial (Google Cloud Vertex AI) */}
        <div className="space-y-3 pt-2 border-t border-white/10">
          <AiModelSelector />
        </div>

        {/* Section 4: Sessão & Autenticação Firebase */}
        <div className="space-y-3 pt-2 border-t border-white/10">
          <label className="block text-xs font-bold text-white/70 uppercase tracking-wider">
            4. Autenticação & Nuvem Firebase
          </label>
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
            {firebaseUser ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span>{firebaseUser.displayName || user.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                        Conectado
                      </span>
                      {user.role === "ADMIN" && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                          Admin
                        </span>
                      )}
                      {user.role === "EDITOR" && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                          Editor
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/50">{firebaseUser.email || "Sessão Anônima / UID: " + firebaseUser.uid.slice(0, 8)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await logout();
                    } catch (err: any) {
                      setAuthError(err?.message || "Erro ao encerrar sessão");
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/70 hover:text-white transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-white/60">
                  Faça login para sincronizar seu progresso, histórico de questões e estatísticas na nuvem com o banco de dados.
                </p>
                {authError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                    {authError}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isSigningIn}
                    onClick={async () => {
                      setAuthError(null);
                      setIsSigningIn(true);
                      try {
                        await signInWithGoogle();
                      } catch (err: any) {
                        setAuthError(err?.message || "Erro no login Google");
                      } finally {
                        setIsSigningIn(false);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-all disabled:opacity-50"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Entrar com Google</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSigningIn}
                    onClick={async () => {
                      setAuthError(null);
                      setIsSigningIn(true);
                      try {
                        await signInAnonymously();
                      } catch (err: any) {
                        setAuthError(err?.message || "Erro no login anônimo");
                      } finally {
                        setIsSigningIn(false);
                      }
                    }}
                    className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/70 hover:text-white transition-all disabled:opacity-50"
                  >
                    Sessão Convidado
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-emerald-500/20"
          >
            Salvar Configurações
          </button>
        </div>
      </div>
    </div>
  );
};
