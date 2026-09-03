import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Zap,
  AlertTriangle,
  Clock,
  Mail,
  RotateCw,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { AiService } from "../../services/aiService";

interface QuotaData {
  userId: string;
  allowed: boolean;
  tier: string;
  dailyLimitRequests: number;
  currentRequests: number;
  remainingRequests: number;
  dailyLimitTokens: number;
  currentTokens: number;
  remainingTokens: number;
  dailyLimitUsd: number;
  currentUsageUsd: number;
  remainingCostUsd: number;
  resetsAt: string;
  reason?: string;
  message?: string;
}

export const AiQuotaIndicator: React.FC = () => {
  const {
    firebaseUser,
    user,
    isEmailVerified,
    resendVerificationEmail,
    reloadUserAuth,
    setIsSubscriptionModalOpen,
  } = useApp();

  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [resendStatus, setResendStatus] = useState<"idle" | "success" | "error">("idle");
  const [isReloadingAuth, setIsReloadingAuth] = useState(false);
  
  const popoverRef = useRef<HTMLDivElement>(null);

  const fetchUsage = async () => {
    try {
      setIsLoading(true);
      const data = await AiService.getAiUsage();
      if (data) {
        setQuota({
          userId: data.userId || "",
          allowed: data.allowed ?? true,
          tier: data.tier || user.tier || "TRIAL",
          dailyLimitRequests: data.dailyLimitRequests ?? (user.tier === "PRO_PLUS" ? 100 : user.tier === "PRO" ? 50 : 5),
          currentRequests: data.currentRequests ?? 0,
          remainingRequests: (data.dailyLimitRequests ?? 5) - (data.currentRequests ?? 0),
          dailyLimitTokens: data.dailyLimitTokens ?? 100000,
          currentTokens: data.currentTokens ?? 0,
          remainingTokens: data.remainingTokens ?? 100000,
          dailyLimitUsd: data.dailyLimitUsd ?? 0.5,
          currentUsageUsd: data.currentUsageUsd ?? 0,
          remainingCostUsd: data.remainingCostUsd ?? 0.5,
          resetsAt: data.resetsAt || "00:00 UTC",
          reason: data.reason,
          message: data.message,
        });
      }
    } catch (err) {
      console.warn("[AiQuotaIndicator] Could not fetch AI usage:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();

    const handleQuotaUpdate = () => fetchUsage();
    window.addEventListener("ai-quota-updated", handleQuotaUpdate);
    window.addEventListener("ai-quota-blocked", handleQuotaUpdate);
    window.addEventListener("ai-plan-expired", handleQuotaUpdate);
    window.addEventListener("ai-email-unverified", handleQuotaUpdate);
    window.addEventListener("focus", handleQuotaUpdate);

    return () => {
      window.removeEventListener("ai-quota-updated", handleQuotaUpdate);
      window.removeEventListener("ai-quota-blocked", handleQuotaUpdate);
      window.removeEventListener("ai-plan-expired", handleQuotaUpdate);
      window.removeEventListener("ai-email-unverified", handleQuotaUpdate);
      window.removeEventListener("focus", handleQuotaUpdate);
    };
  }, [user.tier, isEmailVerified]);

  // Click outside to close popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleResendVerification = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isResendingEmail) return;
    setIsResendingEmail(true);
    setResendStatus("idle");
    try {
      await resendVerificationEmail();
      setResendStatus("success");
      setTimeout(() => setResendStatus("idle"), 5000);
    } catch (err) {
      console.error("Failed to resend verification email:", err);
      setResendStatus("error");
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleReloadAuth = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReloadingAuth) return;
    setIsReloadingAuth(true);
    try {
      const verified = await reloadUserAuth();
      if (verified) {
        await fetchUsage();
      }
    } catch (err) {
      console.warn("Could not reload auth state:", err);
    } finally {
      setIsReloadingAuth(false);
    }
  };

  // Status checks
  const isExpired =
    quota?.reason === "PLAN_EXPIRED" ||
    user.tier === "EXPIRED" ||
    quota?.tier === "EXPIRED" ||
    (user.trialEndsAt && new Date(user.trialEndsAt).getTime() < Date.now() && user.tier !== "PRO" && user.tier !== "PRO_PLUS" && user.tier !== "ADMIN");

  const isUnverified = !isEmailVerified && !isExpired;

  const totalLimit = quota?.dailyLimitRequests || (user.tier === "PRO_PLUS" ? 100 : user.tier === "PRO" ? 50 : 5);
  const currentCount = quota?.currentRequests || 0;
  const remaining = Math.max(0, totalLimit - currentCount);
  const percentage = Math.min(100, Math.max(0, (remaining / totalLimit) * 100));

  const tierLabel =
    user.tier === "PRO_PLUS"
      ? "Plano PRO+ OSCE"
      : user.tier === "PRO"
      ? "Plano PRO"
      : user.tier === "ADMIN"
      ? "Acesso Administrativo"
      : isExpired
      ? "Trial Expirado"
      : "Trial (7 Dias)";

  return (
    <div className="relative" ref={popoverRef}>
      {/* Pill Trigger Button */}
      <button
        type="button"
        id="btn-ai-quota-indicator"
        onClick={() => {
          if (isExpired) {
            setIsSubscriptionModalOpen(true);
          } else {
            setIsOpen(!isOpen);
          }
        }}
        className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-full border shadow-xs text-xs font-semibold transition-all cursor-pointer min-h-[38px] ${
          isExpired
            ? "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700"
            : isUnverified
            ? "bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800"
            : remaining === 0
            ? "bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700"
            : "bg-white hover:bg-teal-50/60 border-slate-200/90 hover:border-teal-300 text-slate-700"
        }`}
        title={
          isExpired
            ? "Seu período de teste expirou. Clique para assinar."
            : isUnverified
            ? "Confirme seu e-mail para desbloquear a IA."
            : `Cota de IA: ${remaining}/${totalLimit} requisições disponíveis hoje.`
        }
      >
        {isExpired ? (
          <>
            <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
              <Lock className="w-3 h-3" />
            </div>
            <span className="font-bold text-rose-700 whitespace-nowrap">IA Expirada</span>
          </>
        ) : isUnverified ? (
          <>
            <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <Mail className="w-3 h-3" />
            </div>
            <span className="font-bold text-amber-800 whitespace-nowrap hidden sm:inline">Confirmar E-mail</span>
            <span className="font-bold text-amber-800 sm:hidden">E-mail</span>
          </>
        ) : (
          <>
            <div className="w-5 h-5 rounded-full bg-teal-50 border border-teal-200/60 flex items-center justify-center text-teal-600 shrink-0">
              <Sparkles className="w-3 h-3 text-teal-600" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-bold text-slate-900 tracking-tight">{remaining}/{totalLimit}</span>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider hidden sm:inline">IA</span>
            </div>
          </>
        )}
      </button>

      {/* Popover Details Modal */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200/90 shadow-2xl p-4 sm:p-5 z-50 text-left animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200/60 flex items-center justify-center text-teal-600 shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Cota de Inteligência Artificial</h4>
                <p className="text-[11px] text-teal-700 font-semibold">{tierLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => fetchUsage()}
              disabled={isLoading}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Atualizar cota"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-teal-600" : ""}`} />
            </button>
          </div>

          {/* Unverified Email Warning Banner inside Popover */}
          {isUnverified && (
            <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200/80 space-y-2 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="font-medium text-amber-900 leading-snug">
                  Seu e-mail ainda não foi confirmado. A IA requer confirmação para ser liberada.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={isResendingEmail}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] transition-colors shadow-xs flex items-center gap-1.5"
                >
                  <Mail className="w-3 h-3" />
                  {isResendingEmail ? "Enviando..." : "Reenviar e-mail"}
                </button>
                <button
                  type="button"
                  onClick={handleReloadAuth}
                  disabled={isReloadingAuth}
                  className="px-2 py-1 rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 font-semibold text-[11px] transition-colors"
                >
                  {isReloadingAuth ? "Checando..." : "Já confirmei"}
                </button>
              </div>
              {resendStatus === "success" && (
                <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> E-mail enviado com sucesso! Verifique sua caixa de entrada e spam.
                </p>
              )}
              {resendStatus === "error" && (
                <p className="text-[11px] text-rose-600 font-medium pt-1">
                  Erro ao reenviar. Aguarde alguns instantes antes de tentar novamente.
                </p>
              )}
            </div>
          )}

          {/* Quota Progress Bar */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">Requisições Diárias Disponíveis</span>
              <span className="font-bold text-slate-900">
                {remaining} <span className="text-slate-400 font-normal">/ {totalLimit} hoje</span>
              </span>
            </div>
            
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  percentage > 50
                    ? "bg-teal-500"
                    : percentage > 20
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
              <span>{currentCount} consumidas</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> Reseta às 00:00 UTC (21:00 BRT)
              </span>
            </div>
          </div>

          {/* Features supported */}
          <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200/60 space-y-1.5 text-xs">
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Recursos de IA Inclusos
            </p>
            <ul className="text-slate-600 text-[11px] space-y-1">
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" /> Tutor Socrático e Explicações Clínicas
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" /> Autópsia de Erro e Lacunas Cognitivas
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" /> Gerador de Questões Inéditas Padrão INEP
              </li>
            </ul>
          </div>

          {/* Action Upgrade / Plans */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              id="btn-ai-quota-upgrade"
              onClick={() => {
                setIsOpen(false);
                setIsSubscriptionModalOpen(true);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-teal-700 text-white font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-teal-400" />
              <span>Ver Planos & Mais Limites de IA</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
