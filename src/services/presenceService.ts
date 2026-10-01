import { PresenceSettings, PresenceUser, PresenceCategory, StudyInvite, PresencePayload } from "../types/presence";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { ref, onValue, onDisconnect, set } from "firebase/database";
import { db, rtdb } from "../lib/firebase";
import { NotificationService } from "./notificationService";


const SETTINGS_KEY = "praxis_presence_settings";
const INVITES_KEY = "praxis_study_invites";


export const DEFAULT_PRESENCE_SETTINGS: PresenceSettings = {
  isOnline: false,
  radarActive: false,
  allowInvites: true,
  activeCategory: "COLLEAGUES",
};

export const MOCK_PRESENCE_USERS: PresenceUser[] = [
  {
    id: "usr_colleague_1",
    name: "Danielledpf Dra",
    displayName: "Danielledpf Dra",
    category: "COLLEAGUES",
    status: "ONLINE",
    statusText: "online",
    university: "USP · São Paulo",
    targetEdition: "Revalida 2026/2",
    lastActive: "Agora mesmo",
    avatarUrl: "https://images.unsplash.com/photo-1594824813590-785c490479b1?w=150&auto=format&fit=crop&q=80",
  },
  {
    id: "usr_colleague_2",
    name: "Diego Monteiro",
    displayName: "Diego Monteiro",
    category: "COLLEAGUES",
    status: "ONLINE",
    statusText: "online",
    university: "UERJ · Rio de Janeiro",
    targetEdition: "Revalida 2026/2",
    lastActive: "Há 1 min",
    avatarUrl: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80",
  },
  {
    id: "usr_colleague_3",
    name: "Gabriel Oliveira",
    displayName: "Gabriel Oliveira",
    category: "COLLEAGUES",
    status: "ONLINE",
    statusText: "online",
    university: "UFMG · Minas Gerais",
    targetEdition: "Revalida 2026/1",
    lastActive: "Há 2 min",
    avatarUrl: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=150&auto=format&fit=crop&q=80",
  },
  {
    id: "usr_colleague_4",
    name: "Gabriel Torres",
    displayName: "Gabriel Torres",
    category: "COLLEAGUES",
    status: "ONLINE",
    statusText: "online",
    university: "UBA · Argentina",
    targetEdition: "Revalida 2026/2",
    lastActive: "Agora mesmo",
  },
  {
    id: "usr_colleague_5",
    name: "Gabriela Carlyle",
    displayName: "Gabriela Carlyle",
    category: "COLLEAGUES",
    status: "ONLINE",
    statusText: "online",
    university: "UFPR · Paraná",
    targetEdition: "Revalida 2026/2",
    lastActive: "Há 3 min",
    avatarUrl: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150&auto=format&fit=crop&q=80",
  },
  {
    id: "usr_colleague_6",
    name: "Haylla Drika",
    displayName: "Haylla Drika",
    category: "COLLEAGUES",
    status: "ONLINE",
    statusText: "online",
    university: "UNIFESP · São Paulo",
    targetEdition: "Revalida 2026/1",
    lastActive: "Agora mesmo",
    avatarUrl: "https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=150&auto=format&fit=crop&q=80",
  },
  {
    id: "usr_colleague_7",
    name: "Jean Venturi",
    displayName: "Jean Venturi",
    category: "COLLEAGUES",
    status: "ONLINE",
    statusText: "online",
    university: "UDABOL · Bolívia",
    targetEdition: "Revalida 2026/2",
    lastActive: "Há 5 min",
  },
  {
    id: "usr_colleague_8",
    name: "LUCAS MARTINS",
    displayName: "LUCAS MARTINS",
    category: "COLLEAGUES",
    status: "ONLINE",
    statusText: "online",
    university: "UFRJ · Rio de Janeiro",
    targetEdition: "Revalida 2026/2",
    lastActive: "Agora mesmo",
  },
  {
    id: "usr_colleague_9",
    name: "Luiz Corrêa",
    displayName: "Luiz Corrêa",
    category: "COLLEAGUES",
    status: "ONLINE",
    statusText: "online",
    university: "UCP · Paraguai",
    targetEdition: "Revalida 2026/1",
    lastActive: "Há 1 min",
    avatarUrl: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150&auto=format&fit=crop&q=80",
  },
  {
    id: "usr_colleague_10",
    name: "LUNA ampuero",
    displayName: "LUNA ampuero",
    category: "COLLEAGUES",
    status: "ONLINE",
    statusText: "online",
    university: "UNMSM · Peru",
    targetEdition: "Revalida 2026/2",
    lastActive: "Há 4 min",
  },
  {
    id: "usr_colleague_11",
    name: "matheus pierini",
    displayName: "matheus pierini",
    category: "COLLEAGUES",
    status: "ONLINE",
    statusText: "online",
    university: "Santa Casa SP",
    targetEdition: "Revalida 2026/1",
    lastActive: "Agora mesmo",
  },
  // Paid Actors
  {
    id: "usr_actor_1",
    name: "Dra. Carolina Mendes",
    displayName: "Dra. Carolina Mendes (Atriz OSCE)",
    category: "PAID_ACTORS",
    status: "ONLINE",
    statusText: "online",
    isPaidActor: true,
    pricePerHour: "R$ 45/h",
    university: "Especialista em Simulação Realística",
    targetEdition: "Checklists INEP 2020-2026",
    lastActive: "Agora mesmo",
    avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
  },
  {
    id: "usr_actor_2",
    name: "Dr. Rodrigo Silveira",
    displayName: "Dr. Rodrigo Silveira (Ator Pediátrico)",
    category: "PAID_ACTORS",
    status: "ONLINE",
    statusText: "online",
    isPaidActor: true,
    pricePerHour: "R$ 50/h",
    university: "Pediatria e Emergência",
    targetEdition: "Checklists INEP",
    lastActive: "Há 2 min",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
  },
  // Open Rooms
  {
    id: "room_1",
    name: "Sala Cirurgia · Apendicite Aguda",
    displayName: "Sala Cirurgia · Apendicite Aguda",
    category: "OPEN_ROOMS",
    status: "IN_STATION",
    statusText: "1/2 participantes",
    university: "Moderador: Dr. Roberto",
    currentStationTitle: "Apendicite Aguda em Jovem",
    targetEdition: "Caderno 01",
    lastActive: "Iniciada há 3 min",
  },
  {
    id: "room_2",
    name: "Sala GO · Pré-Eclâmpsia Grave",
    displayName: "Sala GO · Pré-Eclâmpsia Grave",
    category: "OPEN_ROOMS",
    status: "IN_STATION",
    statusText: "1/2 participantes",
    university: "Moderadora: Dra. Juliana",
    currentStationTitle: "Conduta na Síndrome HELLP",
    targetEdition: "Caderno 02",
    lastActive: "Iniciada há 1 min",
  },
];

export class PresenceService {
  static getSettings(): PresenceSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        return { ...DEFAULT_PRESENCE_SETTINGS, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn("[PresenceService] Could not read settings:", e);
    }
    return DEFAULT_PRESENCE_SETTINGS;
  }

  static saveSettings(settings: Partial<PresenceSettings>): PresenceSettings {
    try {
      const current = this.getSettings();
      const updated: PresenceSettings = { ...current, ...settings };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      return updated;
    } catch (e) {
      console.warn("[PresenceService] Could not save settings:", e);
      return { ...DEFAULT_PRESENCE_SETTINGS, ...settings };
    }
  }

  static getUsers(category: PresenceCategory = "COLLEAGUES", searchQuery: string = ""): PresenceUser[] {
    const cleanSearch = searchQuery.toLowerCase().trim();
    return MOCK_PRESENCE_USERS.filter((user) => {
      const matchCategory = user.category === category;
      if (!matchCategory) return false;

      if (!cleanSearch) return true;
      return (
        user.name.toLowerCase().includes(cleanSearch) ||
        user.displayName.toLowerCase().includes(cleanSearch) ||
        (user.university && user.university.toLowerCase().includes(cleanSearch)) ||
        (user.targetEdition && user.targetEdition.toLowerCase().includes(cleanSearch))
      );
    });
  }

  static getSentInvites(): StudyInvite[] {
    try {
      const raw = localStorage.getItem(INVITES_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return [];
  }

  static sendInvite(invite: Omit<StudyInvite, "id" | "createdAt" | "status">): StudyInvite {
    const newInvite: StudyInvite = {
      ...invite,
      id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };

    try {
      const current = this.getSentInvites();
      const updated = [newInvite, ...current];
      localStorage.setItem(INVITES_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("[PresenceService] Could not persist invite:", e);
    }

    // Fire-and-forget sync to Firestore if possible
    this.saveInviteToFirestore(newInvite).catch((err) => {
      console.warn("[PresenceService] Could not sync invite to Firestore:", err);
    });

    return newInvite;
  }

  static async sendCloudInvite(
    invite: Omit<StudyInvite, "id" | "createdAt" | "status">
  ): Promise<StudyInvite> {
    const newInvite = this.sendInvite(invite);
    await this.saveInviteToFirestore(newInvite);
    return newInvite;
  }

  static async saveInviteToFirestore(invite: StudyInvite): Promise<void> {
    try {
      const inviteRef = doc(db, "study_invites", invite.id);
      await setDoc(inviteRef, {
        ...invite,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("[PresenceService] Firestore save invite failed:", err);
    }
  }

  static async publishPresence(
    user: PresencePayload,
    settings: PresenceSettings
  ): Promise<void> {
    if (!user || !user.id) return;
    try {
      const presenceRef = doc(db, "presence", user.id);
      if (settings.isOnline) {
        const payload: Record<string, any> = {
          id: user.id,
          name: user.name || "Dr(a). Candidato(a)",
          displayName: user.displayName || user.name || "Dr(a). Candidato(a)",
          avatarUrl: user.avatarUrl || null,
          category: "COLLEAGUES",
          status: settings.radarActive ? "SEARCHING" : "ONLINE",
          statusText: settings.radarActive ? "procurando dupla" : "online",
          university: user.university || "Médico(a) Revalidando",
          targetEdition: user.targetEdition || "Revalida INEP",
          allowInvites: settings.allowInvites ?? true,
          lastActive: "Agora mesmo",
          lastSeen: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(presenceRef, payload, { merge: true });
      } else {
        await deleteDoc(presenceRef).catch(() => {
          return updateDoc(presenceRef, {
            status: "OFFLINE",
            statusText: "offline",
            lastSeen: new Date().toISOString(),
          });
        });
      }
    } catch (err) {
      console.warn("[PresenceService] publishPresence failed (offline or unauthenticated):", err);
    }
  }

  static subscribeToActiveUsers(
    category: PresenceCategory = "COLLEAGUES",
    searchQuery: string = "",
    onUpdate: (users: PresenceUser[]) => void
  ): () => void {
    const cleanSearch = searchQuery.toLowerCase().trim();

    if (category !== "COLLEAGUES") {
      const filtered = this.getUsers(category, searchQuery);
      onUpdate(filtered);
      return () => {};
    }

    // Always deliver initial list immediately
    const initialColleagues = this.getUsers("COLLEAGUES", searchQuery);
    onUpdate(initialColleagues);

    try {
      const presenceCol = collection(db, "presence");
      const unsubscribe = onSnapshot(
        presenceCol,
        (snapshot) => {
          const liveUsersMap = new Map<string, PresenceUser>();

          snapshot.docs.forEach((d) => {
            const data = d.data() as Partial<PresenceUser> & { lastSeen?: string };
            if (data.status === "OFFLINE") return;

            // Stale check: if lastSeen is older than 5 minutes, consider disconnected
            if (data.lastSeen) {
              const diffMs = Date.now() - new Date(data.lastSeen).getTime();
              if (diffMs > 5 * 60 * 1000) return;
            }

            liveUsersMap.set(d.id, {
              id: d.id,
              name: data.name || "Colega Médico",
              displayName: data.displayName || data.name || "Colega Médico",
              avatarUrl: data.avatarUrl || undefined,
              category: "COLLEAGUES",
              status: data.status || "ONLINE",
              statusText: data.statusText || "online",
              university: data.university,
              targetEdition: data.targetEdition,
              lastActive: data.lastActive || "Agora mesmo",
            });
          });

          // Blend simulated/mock colleagues with live users
          const combined: PresenceUser[] = [];

          // Live users first
          liveUsersMap.forEach((user) => {
            combined.push(user);
          });

          // Add mock colleagues that don't collide with live IDs
          MOCK_PRESENCE_USERS.forEach((mockUser) => {
            if (mockUser.category === "COLLEAGUES" && !liveUsersMap.has(mockUser.id)) {
              combined.push(mockUser);
            }
          });

          // Filter by search query
          const filtered = combined.filter((u) => {
            if (!cleanSearch) return true;
            return (
              u.name.toLowerCase().includes(cleanSearch) ||
              u.displayName.toLowerCase().includes(cleanSearch) ||
              (u.university && u.university.toLowerCase().includes(cleanSearch)) ||
              (u.targetEdition && u.targetEdition.toLowerCase().includes(cleanSearch))
            );
          });

          onUpdate(filtered);
        },
        (error) => {
          console.warn("[PresenceService] onSnapshot presence error:", error);
          onUpdate(this.getUsers(category, searchQuery));
        }
      );

      return unsubscribe;
    } catch (err) {
      console.warn("[PresenceService] subscribeToActiveUsers setup error:", err);
      return () => {};
    }
  }

  static subscribeToIncomingInvites(
    userId: string,
    onInvite: (invite: StudyInvite) => void
  ): () => void {
    if (!userId) return () => {};

    try {
      const invitesCol = collection(db, "study_invites");
      const q = query(
        invitesCol,
        where("toUserId", "==", userId),
        where("status", "==", "PENDING")
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
              const data = change.doc.data() as StudyInvite;
              if (data.status === "PENDING") {
                // Play notification chime and alert candidate
                NotificationService.playNotificationSound("invite");
                NotificationService.sendBackgroundNotification("Novo Convite de Estudo! 🩺", {
                  body: `${data.fromUserName} convidou você para o checklist "${data.stationTitle}". Clique para aceitar!`,
                  tag: `invite-${data.id}`,
                });

                onInvite({ ...data, id: change.doc.id });
              }
            }
          });
        },
        (err) => {
          console.warn("[PresenceService] subscribeToIncomingInvites error:", err);
        }
      );

      return unsubscribe;
    } catch (err) {
      console.warn("[PresenceService] subscribeToIncomingInvites setup error:", err);
      return () => {};
    }
  }

  static async respondToInvite(
    inviteId: string,
    status: "ACCEPTED" | "DECLINED"
  ): Promise<void> {
    try {
      // Update locally
      const sent = this.getSentInvites();
      const updated = sent.map((inv) => (inv.id === inviteId ? { ...inv, status } : inv));
      localStorage.setItem(INVITES_KEY, JSON.stringify(updated));

      // Update in Firestore
      const inviteRef = doc(db, "study_invites", inviteId);
      await updateDoc(inviteRef, {
        status,
        respondedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("[PresenceService] respondToInvite error:", err);
    }
  }

  static setupHeartbeat(
    user: PresencePayload,
    getSettings: () => PresenceSettings
  ): () => void {
    if (typeof window === "undefined" || !user?.id) return () => {};

    const currentSettings = getSettings();
    if (currentSettings.isOnline) {
      this.publishPresence(user, currentSettings).catch(() => {});
    }

    // 1. Firebase Realtime Database (RTDB) instant onDisconnect integration
    try {
      if (rtdb) {
        const userStatusDatabaseRef = ref(rtdb, `/status/${user.id}`);
        const connectedRef = ref(rtdb, ".info/connected");

        onValue(connectedRef, (snapshot) => {
          if (snapshot.val() === true) {
            onDisconnect(userStatusDatabaseRef)
              .set({
                state: "offline",
                last_changed: Date.now(),
              })
              .catch(() => {});

            set(userStatusDatabaseRef, {
              state: currentSettings.isOnline ? "online" : "offline",
              last_changed: Date.now(),
            }).catch(() => {});
          }
        });
      }
    } catch (e) {
      console.warn("[PresenceService] RTDB onDisconnect hook skipped:", e);
    }

    // 2. Periodic Firestore heartbeat (every 30s)
    const intervalId = window.setInterval(() => {
      const s = getSettings();
      if (s.isOnline) {
        this.publishPresence(user, s).catch(() => {});
      }
    }, 30000);

    const handleUnload = () => {
      try {
        const presenceRef = doc(db, "presence", user.id);
        deleteDoc(presenceRef).catch(() => {});
      } catch {}
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }
}


