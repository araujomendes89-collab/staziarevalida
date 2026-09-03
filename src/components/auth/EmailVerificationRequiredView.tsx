import React, { useState } from "react";
import { Mail, CheckCircle2, RotateCw, AlertCircle, LogOut, ArrowRight, ShieldAlert } from "lucide-react";
import { useApp } from "../../context/AppContext";

export const EmailVerificationRequiredView: React.FC = () => {
  const { firebaseUser, resendVerificationEmail, reloadUserAuth, logout } = useApp();
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);
  const [justCheckedNotYet, setJustCheckedNotYet] = useState(false);

  const handleResend = async () => {
    if (isResending) return;
    setIsResending(true);
    setErrorMessage(null);
    setJustCheckedNotYet(false);
    try {
      await resendVerificationEmail();
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 8000);
    } catch (err: any) {
      console.error("Resend verification error:", err);
      setErrorMessage(
        "Não foi possível reenviar o e-mail no momento. Aguarde alguns instantes antes de tentar novamente."
      );
    } finally {
      setIsResending(false);
    }
  };

  const handleReload = async () => {
    if (isReloading) return;
    setIsReloading(true);
    setErrorMessage(null);
    setJustCheckedNotYet(false);
    try {
      const isNowVerified = await reloadUserAuth();
      if (!isNowVerified) {
        setJustCheckedNotYet(true);
        setTimeout(() => setJustCheckedNotYet(false), 5000);
      }
    } catch (err) {
      console.warn("Error reloading auth:", err);
      setErrorMessage("Erro ao verificar status. Tente novamente.");
    } finally {
      setIsReloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#06101E] text-slate-100 flex flex-col justify-between font-sans selection:bg-teal-500/20 selection:text-teal-200">
      {/* Top Brand Bar */}
      <header className="w-full border-b border-slate-800/80 bg-[#07162A]/60 backdrop-blur-md px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-600 p-0.5 shadow-lg shadow-teal-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-[#07162A] rounded-[10px] flex items-center justify-center text-teal-300 font-bold text-lg">
                +
              </div>
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                Stazia<span className="text-teal-400">Med</span>
                <span className="text-[9px] font-black tracking-widest uppercase bg-teal-500/10 text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded">
                  REVALIDA
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Ambiente Preparatório Oficial</p>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair da conta</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="max-w-lg w-full bg-[#0B1C33] border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/40 text-center relative overflow-hidden">
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Icon Badge */}
          <div className="relative mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-5 shadow-inner">
            <Mail className="w-8 h-8" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-black text-[11px] shadow-sm">
              !
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-2">
            Confirme seu endereço de e-mail
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed max-w-md mx-auto mb-4">
            Para garantir a segurança acadêmica do seu histórico e liberar o acesso completo aos
            simulados, cadernos INEP e inteligência artificial, precisamos que você valide o seu e-mail:
          </p>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-teal-300 font-mono text-xs sm:text-sm font-semibold max-w-full truncate mb-6">
            <Mail className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span className="truncate">{firebaseUser?.email || "seu-email@dominio.com"}</span>
          </div>

          {/* Feedback Alerts */}
          {resendSuccess && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs text-left flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-300">Novo link de confirmação enviado!</p>
                <p className="text-[11px] text-emerald-300/80 mt-0.5">
                  Verifique sua Caixa de Entrada, aba de Promoções e pasta de Spam. O link expira em breve.
                </p>
              </div>
            </div>
          )}

          {justCheckedNotYet && (
            <div className="mb-5 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs text-left flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                O link ainda não foi confirmado no servidor. Abra o e-mail recebido e clique no link de validação antes de checar novamente.
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs text-left flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Instructions Box */}
          <div className="text-left bg-slate-900/60 border border-slate-800 rounded-2xl p-4 mb-6 space-y-2.5 text-xs text-slate-300">
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                1
              </div>
              <p>Abra seu provedor de e-mail e procure por uma mensagem de <strong>StaziaMed</strong> ou <strong>Firebase</strong>.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                2
              </div>
              <p>Clique no link de confirmação contido na mensagem.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                3
              </div>
              <p>Retorne a esta aba e clique no botão <strong>"Já confirmei meu e-mail"</strong> abaixo.</p>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              type="button"
              id="btn-screen-check-verified"
              onClick={handleReload}
              disabled={isReloading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-bold text-sm shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <RotateCw className={`w-4 h-4 ${isReloading ? "animate-spin" : ""}`} />
              <span>{isReloading ? "Verificando confirmação..." : "Já confirmei meu e-mail"}</span>
              {!isReloading && <ArrowRight className="w-4 h-4" />}
            </button>

            <button
              type="button"
              id="btn-screen-resend-email"
              onClick={handleResend}
              disabled={isResending}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span>{isResending ? "Reenviando e-mail..." : "Reenviar e-mail de confirmação"}</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-4 text-center text-xs text-slate-500 border-t border-slate-900">
        StaziaMed Revalida • Sistema Operacional de Aprovação no Revalida INEP
      </footer>
    </div>
  );
};
