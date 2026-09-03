import React, { useState, useEffect } from "react";
import { Mail, AlertCircle, CheckCircle2, RotateCw, X, ChevronDown, ChevronUp } from "lucide-react";
import { useApp } from "../../context/AppContext";

export const EmailVerificationBanner: React.FC = () => {
  const { firebaseUser, isEmailVerified, resendVerificationEmail, reloadUserAuth } = useApp();
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return sessionStorage.getItem("revalida_email_banner_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [showPromptModal, setShowPromptModal] = useState(false);

  // Listen for AI email unverified event
  useEffect(() => {
    const handleUnverifiedAi = () => {
      setShowPromptModal(true);
      setIsCollapsed(false);
    };
    window.addEventListener("ai-email-unverified", handleUnverifiedAi);
    return () => {
      window.removeEventListener("ai-email-unverified", handleUnverifiedAi);
    };
  }, []);

  if (!firebaseUser || isEmailVerified) {
    return null;
  }

  const handleResend = async () => {
    if (isResending) return;
    setIsResending(true);
    setErrorMessage(null);
    try {
      await resendVerificationEmail();
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 6000);
    } catch (err: any) {
      console.error("Resend verification error:", err);
      setErrorMessage("Não foi possível reenviar agora. Tente novamente em instantes.");
    } finally {
      setIsResending(false);
    }
  };

  const handleReload = async () => {
    if (isReloading) return;
    setIsReloading(true);
    try {
      const ok = await reloadUserAuth();
      if (ok) {
        setShowPromptModal(false);
      }
    } catch (err) {
      console.warn("Error reloading auth:", err);
    } finally {
      setIsReloading(false);
    }
  };

  const toggleCollapse = (collapse: boolean) => {
    setIsCollapsed(collapse);
    try {
      if (collapse) {
        sessionStorage.setItem("revalida_email_banner_collapsed", "true");
      } else {
        sessionStorage.removeItem("revalida_email_banner_collapsed");
      }
    } catch (_) {}
  };

  return (
    <>
      {/* Collapsed Compact Strip */}
      {isCollapsed ? (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-3 py-1.5 text-xs text-amber-900 transition-all">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 truncate">
              <Mail className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="text-[11px] font-medium text-amber-950 truncate">
                E-mail pendente de confirmação: <strong className="font-semibold">{firebaseUser.email}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => toggleCollapse(false)}
              className="px-2 py-0.5 rounded bg-amber-600/10 hover:bg-amber-600/20 text-amber-800 font-bold text-[10px] transition-colors flex items-center gap-1 cursor-pointer shrink-0"
              title="Expandir aviso de confirmação de e-mail"
            >
              <span>Verificar</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : (
        /* Expanded Compact Banner */
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-3 sm:px-4 py-2 text-xs text-amber-900 transition-all">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Mail className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="font-medium text-amber-950 text-[11px] sm:text-xs truncate">
                Enviamos confirmação para <strong className="font-bold">{firebaseUser.email}</strong>
                <span className="hidden md:inline text-amber-800/90 ml-1">
                  — confirme para desbloquear os recursos de Inteligência Artificial.
                </span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
              <button
                type="button"
                onClick={handleResend}
                disabled={isResending}
                id="btn-banner-resend-email"
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] shadow-2xs transition-colors cursor-pointer"
              >
                {isResending ? "Enviando..." : "Reenviar"}
              </button>
              <button
                type="button"
                onClick={handleReload}
                disabled={isReloading}
                id="btn-banner-check-verified"
                className="px-2 py-1 rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 font-semibold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                title="Verificar se já confirmou"
              >
                <RotateCw className={`w-3 h-3 ${isReloading ? "animate-spin text-amber-700" : ""}`} />
                <span className="text-[10px] sm:text-[11px]">Já confirmei</span>
              </button>
              <button
                type="button"
                onClick={() => toggleCollapse(true)}
                className="p-1 rounded text-amber-700 hover:text-amber-900 hover:bg-amber-200/50 transition-colors ml-0.5 cursor-pointer"
                title="Recolher aviso temporariamente"
                aria-label="Recolher aviso temporariamente"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {resendSuccess && (
            <div className="max-w-7xl mx-auto mt-1 flex items-center gap-1.5 text-[11px] text-emerald-800 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>E-mail reenviado com sucesso! Verifique sua caixa de entrada e spam.</span>
            </div>
          )}
          {errorMessage && (
            <div className="max-w-7xl mx-auto mt-1 text-[11px] text-rose-700 font-semibold">
              {errorMessage}
            </div>
          )}
        </div>
      )}

      {/* Intercept Modal when an AI action fails due to EMAIL_NOT_VERIFIED */}
      {showPromptModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-slate-800">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 mx-auto">
              <Mail className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                Confirmação de E-mail Obrigatória
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Para utilizar os recursos de inteligência artificial clínica (tutor socrático, gerador de questões e autópsias), você precisa confirmar seu endereço de e-mail <strong>{firebaseUser.email}</strong>.
              </p>
            </div>

            {resendSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>E-mail de verificação reenviado com sucesso!</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2 text-xs text-rose-800 font-medium">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <button
                type="button"
                id="btn-modal-resend-email"
                onClick={handleResend}
                disabled={isResending}
                className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{isResending ? "Reenviando..." : "Reenviar e-mail de confirmação"}</span>
              </button>

              <button
                type="button"
                id="btn-modal-check-verified"
                onClick={handleReload}
                disabled={isReloading}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isReloading ? "animate-spin text-teal-600" : ""}`} />
                <span>{isReloading ? "Checando..." : "Já confirmei meu e-mail"}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPromptModal(false)}
                className="w-full py-2 text-center text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
