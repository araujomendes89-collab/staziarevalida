import React, { useState, useEffect } from "react";
import {
  Play,
  Sparkles,
  Search,
  ChevronRight,
  Radio,
  Send,
  CheckCircle,
  MessageCircle,
  Users,
  Shield,
  Clock,
  X,
  UserCheck,
  Stethoscope,
} from "lucide-react";
import { PresenceCategory, PresenceUser, StudyInvite } from "../../types/presence";
import { PresenceService } from "../../services/presenceService";
import { DuoSessionService } from "../../services/duoSessionService";
import { NotificationService } from "../../services/notificationService";
import { SEED_OSCE_STATIONS } from "../../data/osceStationsData";
import { OSCEStation } from "../../types";
import { useAppOptional } from "../../context/AppContext";

interface ChecklistBankHubViewProps {
  onStartManualStudy: () => void;
  onStartAiStudy: () => void;
  onSelectStation: (station: OSCEStation) => void;
  onEnterDuoSession?: (sessionId: string) => void;
}

export const ChecklistBankHubView: React.FC<ChecklistBankHubViewProps> = ({
  onStartManualStudy,
  onStartAiStudy,
  onSelectStation,
  onEnterDuoSession,
}) => {

  const app = useAppOptional();
  const currentUser = app?.user || {
    id: "usr-me",
    name: "Dr(a). Candidato(a)",
  };

  const [settings, setSettings] = useState(() => PresenceService.getSettings());
  const [activeCategory, setActiveCategory] = useState<PresenceCategory>("COLLEAGUES");
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<PresenceUser[]>(() =>
    PresenceService.getUsers("COLLEAGUES", "")
  );

  // Invite Modal states
  const [selectedUserForInvite, setSelectedUserForInvite] = useState<PresenceUser | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string>(
    SEED_OSCE_STATIONS[0]?.id || ""
  );
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<StudyInvite | null>(null);

  // Real-time Heartbeat management
  useEffect(() => {
    const payload = {
      id: currentUser.id,
      name: currentUser.name || "Dr(a). Candidato(a)",
      displayName: currentUser.name || "Dr(a). Candidato(a)",
      university: (currentUser as any).targetEdition || "Médico(a) Revalidando",
      targetEdition: (currentUser as any).targetEdition || "Revalida INEP",
    };
    const cleanup = PresenceService.setupHeartbeat(payload, () => settings);
    return () => cleanup();
  }, [
    currentUser.id,
    currentUser.name,
    settings.isOnline,
    settings.radarActive,
    settings.allowInvites,
  ]);

  // Synchronize users in real time when category or search query changes
  useEffect(() => {
    const unsubscribe = PresenceService.subscribeToActiveUsers(
      activeCategory,
      searchQuery,
      (updatedList) => {
        // Exclude current user from their own search list
        setUsers(updatedList.filter((u) => u.id !== currentUser.id));
      }
    );
    return () => unsubscribe();
  }, [activeCategory, searchQuery, currentUser.id]);

  // Listen for real-time incoming study invites
  useEffect(() => {
    if (!settings.allowInvites || !currentUser.id) return;
    const unsubscribe = PresenceService.subscribeToIncomingInvites(
      currentUser.id,
      (invite) => {
        setIncomingInvite(invite);
      }
    );
    return () => unsubscribe();
  }, [currentUser.id, settings.allowInvites]);

  // Listen for automatic matches when radar is active
  useEffect(() => {
    if (!settings.radarActive || !currentUser.id) return;

    const unsubscribe = DuoSessionService.subscribeToRadarPool(
      currentUser.id,
      (matchedSession) => {
        NotificationService.playNotificationSound("match");
        NotificationService.sendBackgroundNotification("Dupla Encontrada no Radar! 🩺", {
          body: `Você foi pareado(a) com ${
            matchedSession.doctorUserId === currentUser.id
              ? matchedSession.evaluatorName
              : matchedSession.doctorName
          } para a estação "${matchedSession.stationTitle}"!`,
          tag: `match-${matchedSession.id}`,
        });
        showToast(
          `Match encontrado! Conectando com ${
            matchedSession.doctorUserId === currentUser.id
              ? matchedSession.evaluatorName
              : matchedSession.doctorName
          }...`
        );
        if (onEnterDuoSession) {
          onEnterDuoSession(matchedSession.id);
        }
      }
    );

    return () => unsubscribe();
  }, [settings.radarActive, currentUser.id, onEnterDuoSession]);

  // Persist settings changes
  const toggleOnlineStatus = () => {
    const nextState = !settings.isOnline;
    const updated = PresenceService.saveSettings({
      isOnline: nextState,
      radarActive: nextState, // activating online also powers radar
    });
    setSettings(updated);

    // Update cloud presence immediately
    PresenceService.publishPresence(
      {
        id: currentUser.id,
        name: currentUser.name || "Dr(a). Candidato(a)",
        displayName: currentUser.name || "Dr(a). Candidato(a)",
      },
      updated
    ).catch(() => {});

    if (nextState) {
      NotificationService.requestPermission().catch(() => {});
      DuoSessionService.joinRadarPool(currentUser, selectedStationId).catch(() => {});
    } else {
      DuoSessionService.leaveRadarPool(currentUser.id).catch(() => {});
    }

    showToast(
      nextState
        ? "Você agora está ONLINE e visível no radar de duplas!"
        : "Você agora está OFFLINE e invisível no radar."
    );
  };

  const toggleRadarOnly = () => {
    const nextRadar = !settings.radarActive;
    const updated = PresenceService.saveSettings({
      radarActive: nextRadar,
      isOnline: nextRadar ? true : settings.isOnline,
    });
    setSettings(updated);

    PresenceService.publishPresence(
      {
        id: currentUser.id,
        name: currentUser.name || "Dr(a). Candidato(a)",
        displayName: currentUser.name || "Dr(a). Candidato(a)",
      },
      updated
    ).catch(() => {});

    if (nextRadar) {
      NotificationService.requestPermission().catch(() => {});
      DuoSessionService.joinRadarPool(currentUser, selectedStationId).catch(() => {});
    } else {
      DuoSessionService.leaveRadarPool(currentUser.id).catch(() => {});
    }

    showToast(
      nextRadar
        ? "Busca de duplas no radar ATIVADA!"
        : "Busca no radar pausada."
    );
  };

  const toggleAllowInvites = () => {
    const nextVal = !settings.allowInvites;
    const updated = PresenceService.saveSettings({ allowInvites: nextVal });
    setSettings(updated);

    PresenceService.publishPresence(
      {
        id: currentUser.id,
        name: currentUser.name || "Dr(a). Candidato(a)",
        displayName: currentUser.name || "Dr(a). Candidato(a)",
      },
      updated
    ).catch(() => {});

    showToast(
      nextVal
        ? "Convites diretos permitidos."
        : "Recebimento de convites desativado."
    );
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const handleOpenInviteModal = (user: PresenceUser) => {
    setSelectedUserForInvite(user);
  };

  const handleConfirmInvite = () => {
    if (!selectedUserForInvite) return;
    const station = SEED_OSCE_STATIONS.find((s) => s.id === selectedStationId) || SEED_OSCE_STATIONS[0];

    PresenceService.sendInvite({
      fromUserId: currentUser.id,
      fromUserName: currentUser.name || "Dr(a). Candidato(a)",
      toUserId: selectedUserForInvite.id,
      toUserName: selectedUserForInvite.displayName,
      stationId: station.id,
      stationTitle: station.title,
    });

    setInvitedUserIds((prev) => new Set(prev).add(selectedUserForInvite.id));
    const targetName = selectedUserForInvite.name;
    setSelectedUserForInvite(null);
    showToast(`Convite de checklist enviado com sucesso para ${targetName}!`);
  };

  const handleAcceptIncomingInvite = async () => {
    if (!incomingInvite) return;
    PresenceService.respondToInvite(incomingInvite.id, "ACCEPTED").catch(() => {});
    const station =
      SEED_OSCE_STATIONS.find((s) => s.id === incomingInvite.stationId) ||
      SEED_OSCE_STATIONS[0];
    showToast(`Convite aceito! Conectando com ${incomingInvite.fromUserName}...`);
    setIncomingInvite(null);

    if (onEnterDuoSession) {
      const duoSession = await DuoSessionService.createDuoSession(
        station,
        { id: incomingInvite.fromUserId, name: incomingInvite.fromUserName },
        { id: currentUser.id, name: currentUser.name || "Dr(a). Candidato(a)" }
      );
      onEnterDuoSession(duoSession.id);
    } else {
      onSelectStation(station);
    }
  };

  const handleDeclineIncomingInvite = () => {
    if (!incomingInvite) return;
    PresenceService.respondToInvite(incomingInvite.id, "DECLINED").catch(() => {});
    setIncomingInvite(null);
    showToast("Convite recusado.");
  };




  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-24 text-slate-100 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-[#0B192C] border border-teal-500/40 text-teal-200 text-xs rounded-xl shadow-2xl animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle className="w-4 h-4 text-teal-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Header: Novo estudo */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Novo estudo
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Conecte-se com um parceiro para iniciar o treino por estações.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onStartManualStudy}
            id="btn-iniciar-estudo"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs transition-all shadow-lg shadow-sky-500/20 active:scale-95 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Iniciar estudo</span>
          </button>

          <button
            type="button"
            onClick={onStartAiStudy}
            id="btn-estudar-com-ia"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-indigo-500/10 hover:from-pink-500/20 hover:to-indigo-500/20 text-pink-300 border border-pink-500/30 font-semibold text-xs transition-all shadow-lg shadow-pink-500/10 active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-pink-400" />
            <span>Estudar com IA</span>
          </button>
        </div>
      </div>

      {/* 2. Subheading: Estude com outra pessoa */}
      <div className="space-y-1">
        <h2 className="text-base sm:text-lg font-bold text-white">
          Estude com outra pessoa
        </h2>
        <p className="text-xs text-slate-400">
          Encontre colegas e atores para treinar checklists juntos.
        </p>
      </div>

      {/* 3. WhatsApp Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#0e1726] border border-emerald-500/20 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-white">
              Encontre duplas no WhatsApp
            </h3>
            <p className="text-[11px] text-slate-400">
              Acesse o nosso grupo do WhatsApp e encontre duplas de estudo
            </p>
          </div>
        </div>

        <a
          href="https://chat.whatsapp.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm shrink-0"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span>Entrar no Grupo</span>
        </a>
      </div>

      {/* 4. Two-Column Dashboard (Radar & Quem está online) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Busca automática de duplas */}
        <div className="bg-[#0b1322] border border-slate-800/80 rounded-3xl p-6 flex flex-col justify-between shadow-xl min-h-[480px]">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Radio className={`w-4 h-4 ${settings.radarActive ? "text-sky-400 animate-pulse" : "text-slate-500"}`} />
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Busca automática de duplas
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {settings.radarActive
                  ? "Varredura ativa · Buscando parceiros compatíveis..."
                  : "Ninguém no radar ainda..."}
              </p>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              onClick={toggleRadarOnly}
              aria-label="Alternar busca no radar"
              id="radar-main-toggle"
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                settings.radarActive ? "bg-sky-500" : "bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  settings.radarActive ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Central Radar Visualization */}
          <div className="relative my-6 flex items-center justify-center py-8">
            {/* Concentric Radar Rings */}
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-full border border-sky-500/20 flex items-center justify-center bg-radial from-sky-500/10 via-transparent to-transparent">
              {/* Ring 2 */}
              <div className="absolute w-48 h-48 rounded-full border border-sky-500/20" />
              {/* Ring 3 */}
              <div className="absolute w-32 h-32 rounded-full border border-sky-500/20" />
              {/* Ring 4 */}
              <div className="absolute w-16 h-16 rounded-full border border-sky-500/30 bg-sky-500/5" />

              {/* Crosshairs */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-full h-[1px] bg-sky-500/15" />
                <div className="absolute h-full w-[1px] bg-sky-500/15" />
              </div>

              {/* Rotating Sweep Beam when active */}
              {settings.radarActive && (
                <div
                  className="absolute inset-0 rounded-full pointer-events-none animate-spin"
                  style={{
                    animationDuration: "4s",
                    background:
                      "conic-gradient(from 0deg at 50% 50%, rgba(14, 165, 233, 0.3) 0deg, transparent 60deg, transparent 360deg)",
                  }}
                />
              )}

              {/* Simulated Colleagues on Radar when Active */}
              {settings.radarActive && (
                <>
                  <div
                    className="absolute top-12 left-16 w-3 h-3 bg-teal-400 rounded-full ring-4 ring-teal-400/20 animate-ping"
                    title="Dra. Danielle online no radar"
                  />
                  <div
                    className="absolute bottom-16 right-14 w-2.5 h-2.5 bg-sky-400 rounded-full ring-4 ring-sky-400/20 animate-pulse"
                    title="Dr. Diego online no radar"
                  />
                  <div
                    className="absolute top-20 right-20 w-2 h-2 bg-emerald-400 rounded-full ring-4 ring-emerald-400/20"
                    title="Dr. Gabriel online no radar"
                  />
                </>
              )}

              {/* Central Radar Hub Status & CTA Button */}
              <div className="relative z-10 flex flex-col items-center text-center px-4">
                <span className="text-xs font-semibold text-slate-200 mb-3 drop-shadow-sm">
                  {settings.radarActive
                    ? "Você está visível no radar"
                    : "Você está invisível no radar"}
                </span>

                <button
                  type="button"
                  onClick={toggleRadarOnly}
                  id="radar-action-btn"
                  className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs transition-all cursor-pointer shadow-md active:scale-95 ${
                    settings.radarActive
                      ? "bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/40"
                      : "bg-[#0A1220] hover:bg-slate-900 text-sky-400 border border-sky-500/30"
                  }`}
                >
                  <Radio className={`w-3.5 h-3.5 ${settings.radarActive ? "animate-pulse" : ""}`} />
                  <span>
                    {settings.radarActive
                      ? "Pausar busca de duplas"
                      : "Ativar busca de duplas"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Footer: Permitir convites & Status Switch */}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-slate-200">
                Permitir convites
              </span>
              <span className="text-[10px] text-slate-400">
                {settings.allowInvites
                  ? "Colegas podem lhe enviar convites diretos"
                  : "Convites diretos bloqueados"}
              </span>
            </div>

            <button
              type="button"
              onClick={toggleAllowInvites}
              aria-label="Permitir convites de duplas"
              id="toggle-permitir-convites"
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                settings.allowInvites ? "bg-sky-500" : "bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  settings.allowInvites ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Right Column: Quem está online / Colegas & Atores */}
        <div className="bg-[#0b1322] border border-slate-800/80 rounded-3xl p-6 shadow-xl flex flex-col min-h-[480px]">
          {/* Tabs: Colegas | Atores pagos | Salas abertas */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-900/80 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveCategory("COLLEAGUES")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeCategory === "COLLEAGUES"
                  ? "bg-slate-800 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Colegas
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("PAID_ACTORS")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeCategory === "PAID_ACTORS"
                  ? "bg-slate-800 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Atores pagos
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("OPEN_ROOMS")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeCategory === "OPEN_ROOMS"
                  ? "bg-slate-800 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Salas abertas
            </button>
          </div>

          {/* Search Box */}
          <div className="relative mt-4 mb-3">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, faculdade ou tema..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:border-sky-500/50 transition-colors"
            />
          </div>

          {/* User / Room Status Header */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 py-1 mb-2">
            <span>
              {users.length} {activeCategory === "COLLEAGUES" ? "colegas online" : activeCategory === "PAID_ACTORS" ? "atores disponíveis" : "salas disponíveis"}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Tempo real
            </span>
          </div>

          {/* User List */}
          <div className="flex-1 overflow-y-auto max-h-[380px] space-y-2 pr-1 custom-scrollbar">
            {users.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                Nenhum usuário encontrado para esta busca.
              </div>
            ) : (
              users.map((user) => {
                const isInvited = invitedUserIds.has(user.id);
                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/60 hover:border-slate-700 transition-all"
                  >
                    {/* User Info Left */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        {user.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt={user.name}
                            className="w-9 h-9 rounded-full object-cover border border-slate-700"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-sky-900/50 border border-sky-500/30 text-sky-300 font-bold text-xs flex items-center justify-center">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#0b1322] rounded-full" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-semibold text-white truncate">
                            {user.displayName || user.name}
                          </h4>
                          {user.isPaidActor && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-md font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {user.pricePerHour}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="text-emerald-400 font-medium">online</span>
                          {user.university && (
                            <>
                              <span className="text-slate-600">·</span>
                              <span className="text-slate-400 truncate max-w-[140px]">
                                {user.university}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Right */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenInviteModal(user)}
                        disabled={isInvited}
                        id={`btn-convidar-${user.id}`}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isInvited
                            ? "bg-teal-500/20 text-teal-300 border border-teal-500/30 cursor-default"
                            : "bg-sky-500 hover:bg-sky-400 text-white shadow-sm active:scale-95"
                        }`}
                      >
                        {isInvited ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5 text-teal-300" />
                            <span>Convidado</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3 h-3" />
                            <span>Convidar</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenInviteModal(user)}
                        className="p-1 text-slate-500 hover:text-white transition-colors"
                        title="Ver detalhes"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 5. Station Invite Modal */}
      {selectedUserForInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#0B1526] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-bold text-white">
                  Convidar para Treino de Estação
                </h3>
              </div>
              <button
                onClick={() => setSelectedUserForInvite(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center font-bold text-xs">
                {selectedUserForInvite.name.charAt(0)}
              </div>
              <div>
                <p className="text-xs font-semibold text-white">
                  {selectedUserForInvite.displayName}
                </p>
                <p className="text-[11px] text-slate-400">
                  {selectedUserForInvite.university || "Candidato(a) Revalida"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300 block">
                Selecione o Checklist / Estação Clínica:
              </label>
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-hidden focus:border-sky-500"
              >
                {SEED_OSCE_STATIONS.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.area} · {st.title} ({Math.round(st.timeLimitSeconds / 60)} min)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedUserForInvite(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmInvite}
                id="btn-confirmar-convite"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs transition-colors shadow-md"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar Convite</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Incoming Invite Modal */}
      {incomingInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0B1526] border border-sky-500/40 rounded-2xl p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
                </span>
                <h3 className="text-sm font-bold text-white">
                  Convite de Estudo Recebido!
                </h3>
              </div>
              <button
                onClick={handleDeclineIncomingInvite}
                className="text-slate-400 hover:text-white p-1"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300 flex items-center justify-center font-bold text-sm">
                  {incomingInvite.fromUserName.charAt(0)}
                </div>
                <div>
                  <p className="text-xs font-bold text-white">
                    {incomingInvite.fromUserName}
                  </p>
                  <p className="text-[11px] text-sky-300">
                    Convidou você para treinar checklist em dupla
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Estação Proposta:
                </span>
                <p className="text-xs font-semibold text-white">
                  {incomingInvite.stationTitle}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleDeclineIncomingInvite}
                id="btn-recusar-convite"
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Recusar
              </button>
              <button
                type="button"
                onClick={handleAcceptIncomingInvite}
                id="btn-aceitar-convite"
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-xs transition-all shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Aceitar e Iniciar Treino</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

