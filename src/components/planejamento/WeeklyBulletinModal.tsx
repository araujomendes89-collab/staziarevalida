import React, { useState, useEffect } from "react";
import {
  Mail,
  Send,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Target,
  Clock,
  ArrowUpRight,
  RefreshCw,
  Layers,
  Activity,
  Award,
  BookOpen,
} from "lucide-react";
import { WeeklyBulletinService } from "../../services/weeklyBulletinService";
import { useApp } from "../../context/AppContext";
import { WeeklyReadinessBulletin, MedicalArea } from "../../types";

const AREA_LABELS: Record<MedicalArea, string> = {
  CLINICA_MEDICA: "Clínica Médica",
  CIRURGIA_GERAL: "Cirurgia Geral",
  GINECOLOGIA_OBSTETRICIA: "Ginecologia e Obstetrícia",
  PEDIATRIA: "Pediatria",
  MEDICINA_FAMILIA_COMUNIDADE: "Medicina de Família",
};

export const WeeklyBulletinModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useApp();
  const [bulletin, setBulletin] = useState<WeeklyReadinessBulletin | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [recipientEmail, setRecipientEmail] = useState(user?.email || "");
  const [copied, setCopied] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);

    WeeklyBulletinService.processFirestoreWeeklyReadiness({
      userId: user?.id || "guest",
      userProfile: user,
    })
      .then((res) => {
        if (isMounted) {
          setBulletin(res);
          if (res.userEmail) setRecipientEmail(res.userEmail);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("Error processing Firestore weekly bulletin:", err);
        if (isMounted) {
          setBulletin(WeeklyBulletinService.generateWeeklyBulletin(user));
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await WeeklyBulletinService.processFirestoreWeeklyReadiness({
        userId: user?.id || "guest",
        userProfile: user,
      });
      setBulletin(res);
    } catch (err) {
      console.warn("Refresh error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = () => {
    if (!bulletin) return;
    try {
      const updatedBulletin = { ...bulletin, userEmail: recipientEmail };
      const mailtoUrl = WeeklyBulletinService.generateMailtoUrl(updatedBulletin);
      const link = document.createElement("a");
      link.href = mailtoUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setSentSuccess(true);
      setTimeout(() => setSentSuccess(false), 4000);
    } catch (e) {
      console.warn("Mailto link error:", e);
    }
  };

  const handleCopyText = () => {
    if (!bulletin) return;
    const textToCopy = `[StaziaMed Revalida] Boletim Semanal de Prontidão Clínica\nCandidato: ${bulletin.userName}\nPPS Atual: ${bulletin.currentPPS}% (${bulletin.deltaPPS >= 0 ? "+" : ""}${bulletin.deltaPPS}%)\nFaixa Projetada: [${bulletin.projectedPassScoreMin}% - ${bulletin.projectedPassScoreMax}%]\nStatus: ${bulletin.status}\n\nTópicos de Maior Ganho:\n` +
      bulletin.topYieldTopicsToGainPoints.map((t, i) => `${i + 1}. [${t.area}] ${t.topic} (+${t.estimatedPointGain} pts no INEP | Domínio: ${t.currentMastery}%)`).join("\n") +
      `\n\nAutópsia de Erros:\n• Falha mais frequente: ${bulletin.errorAutopsySummary.mostFrequentErrorType}\n• Pendentes: ${bulletin.errorAutopsySummary.pendingReviewCount}\n\nPrescrição: ${bulletin.aiStudyPrescription}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#111420] border border-white/10 shadow-2xl p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wider">
                  Boletim Firestore de Prontidão
                </span>
                <span className="text-xs text-zinc-400">
                  {bulletin?.reportDate || "Processando dados do Firestore..."}
                </span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">
                Boletim Semanal de Prontidão Clínica (PPS)
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              title="Recalcular com dados recentes do Firestore"
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-purple-400" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white text-lg font-bold p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
            <div className="text-sm font-bold text-white">Processando dados de progresso no Firestore...</div>
            <p className="text-xs text-zinc-400 max-w-sm">
              Analisando sessões de treino, acurácia por área, autópsias de erro e nós de conhecimento do candidato.
            </p>
          </div>
        ) : bulletin ? (
          <div className="space-y-6">
            {/* Score Projection & Countdown Card */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-purple-950/40 via-blue-950/30 to-black/40 border border-purple-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs text-zinc-400 font-medium">
                  Projected Pass Score (PPS) — {bulletin.targetEdition}
                </span>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-black text-white">{bulletin.currentPPS}%</span>
                  <span className="text-xs font-bold text-emerald-400 flex items-center">
                    <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
                    +{bulletin.deltaPPS}% esta semana
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
                  <span>Faixa projetada: [{bulletin.projectedPassScoreMin}% - {bulletin.projectedPassScoreMax}%]</span>
                  <span>•</span>
                  <span className="text-amber-300 font-semibold">Meta de segurança: 70.0%</span>
                </div>
              </div>

              <div className="flex flex-col sm:items-end gap-1.5">
                <span className="text-[10px] uppercase font-bold text-zinc-400">Status da Preparação</span>
                <span
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl border ${
                    bulletin.status === "APROVADO_PROJETADO"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                  }`}
                >
                  {bulletin.status.replace("_", " ")}
                </span>
                <span className="text-[11px] text-zinc-400 font-mono">
                  Faltam {bulletin.daysRemaining} dias para a prova
                </span>
              </div>
            </div>

            {/* Performance by 5 Areas of Revalida */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-purple-400" />
                <span>Desempenho Ponderado nas 5 Grandes Áreas (Matriz INEP)</span>
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {(bulletin.areaPerformances || []).map((ap) => (
                  <div
                    key={ap.area}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between gap-1.5"
                  >
                    <span className="text-[11px] font-semibold text-zinc-400 truncate">
                      {AREA_LABELS[ap.area] || ap.area}
                    </span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-base font-black text-white">{ap.accuracy}%</span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          ap.status === "EXCELENTE"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : ap.status === "CRITICO"
                            ? "bg-red-500/20 text-red-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {ap.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Yield Topics to Gain Points */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-4 h-4 text-emerald-400" />
                <span>Tópicos de Maior Ganho de Pontos (Prioridade Máxima)</span>
              </h4>

              <div className="space-y-2.5">
                {(bulletin.topYieldTopicsToGainPoints || []).map((topic, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-zinc-300">
                          {AREA_LABELS[topic.area] || topic.area}
                        </span>
                        <span className="font-bold text-white">{topic.topic}</span>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          (Domínio atual: {topic.currentMastery}%)
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400">{topic.reason}</p>
                      <p className="text-[11px] text-emerald-400/90 font-medium">{topic.actionableAdvice}</p>
                    </div>

                    <div className="sm:text-right shrink-0">
                      <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 inline-block">
                        +{topic.estimatedPointGain} pts no INEP
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Error Autopsy Diagnostics & AI Prescription */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Cognitive Error Autopsy Box */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/[0.08] space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Autópsia Cognitiva de Erros</span>
                </div>
                <div className="space-y-1 text-xs text-zinc-300">
                  <div>
                    <span className="text-zinc-500">Padrão de falha mais comum: </span>
                    <span className="font-bold text-amber-300">
                      {bulletin.errorAutopsySummary?.mostFrequentErrorType || "DISTRACTOR_TRAP"}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Erros aguardando reflexão: </span>
                    <span className="font-bold text-white">
                      {bulletin.errorAutopsySummary?.pendingReviewCount ?? 0} de {bulletin.errorAutopsySummary?.totalErrorsRecorded ?? 0}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 pt-1 border-t border-white/[0.06]">
                    {bulletin.errorAutopsySummary?.recommendedRemediation || "Revisar distratores frequentes."}
                  </p>
                </div>
              </div>

              {/* AI Study Prescription */}
              <div className="p-4 rounded-xl bg-black/40 border border-purple-500/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-300 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>Prescrição Adaptativa da IA</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line line-clamp-5">
                  {bulletin.aiStudyPrescription || "Foco na consolidação dos tópicos de maior rentabilidade no Revalida INEP."}
                </p>
              </div>
            </div>

            {/* Email Dispatch Footer */}
            <div className="space-y-3 pt-2 border-t border-white/[0.08]">
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-400 font-medium whitespace-nowrap">
                  Email do Destinatário:
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                  placeholder="seu.email@exemplo.com"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={handleCopyText}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-white/[0.04] text-zinc-300 border border-white/10 hover:bg-white/[0.08] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied ? "Copiado!" : "Copiar Texto do Relatório"}</span>
                </button>

                <button
                  onClick={handleSendEmail}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-lg shadow-purple-600/30 flex items-center gap-2 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar Boletim Semanal por E-mail</span>
                </button>
              </div>

              {sentSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Cliente de e-mail acionado! O boletim foi preparado para envio para {recipientEmail}.</span>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
