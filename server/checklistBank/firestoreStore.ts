import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "../firebaseAdmin";
import type { PublicProfile, StudySchedule, StudySession } from "../../src/shared/checklistBank/types";
import {
  applySavedSessionToRoom,
  type ChecklistBankStore,
  type EventConfirmation,
  type RoomDoc,
  type StationReport,
} from "./store";

export const CHECKLIST_COLLECTIONS = {
  favorites: "checklist_favorites",
  sessions: "checklist_study_sessions",
  rooms: "checklist_rooms",
  schedules: "checklist_study_schedules",
  confirmations: "checklist_event_confirmations",
  reports: "checklist_station_reports",
  users: "users",
} as const;

/** Persistência em Firestore via Admin SDK (as regras bloqueiam escrita direta do cliente). */
export class FirestoreChecklistBankStore implements ChecklistBankStore {
  private get db(): Firestore {
    return getAdminDb();
  }

  async getFavorites(userId: string) {
    const snap = await this.db.collection(CHECKLIST_COLLECTIONS.favorites).doc(userId).get();
    const ids = snap.data()?.stationIds;
    return Array.isArray(ids) ? ids.map(String) : [];
  }
  async addFavorite(userId: string, stationId: string) {
    await this.db
      .collection(CHECKLIST_COLLECTIONS.favorites)
      .doc(userId)
      .set({ stationIds: FieldValue.arrayUnion(stationId), updatedAt: new Date().toISOString() }, { merge: true });
  }
  async removeFavorite(userId: string, stationId: string) {
    await this.db
      .collection(CHECKLIST_COLLECTIONS.favorites)
      .doc(userId)
      .set({ stationIds: FieldValue.arrayRemove(stationId), updatedAt: new Date().toISOString() }, { merge: true });
  }

  async getSession(sessionId: string) {
    const snap = await this.db.collection(CHECKLIST_COLLECTIONS.sessions).doc(sessionId).get();
    return snap.exists ? (snap.data() as StudySession) : null;
  }
  async listSessionsForUser(userId: string) {
    const col = this.db.collection(CHECKLIST_COLLECTIONS.sessions);
    const [asDoctor, asActor] = await Promise.all([
      col.where("doctor_id", "==", userId).limit(500).get(),
      col.where("actor_id", "==", userId).limit(500).get(),
    ]);
    return [...asDoctor.docs, ...asActor.docs].map((d) => d.data() as StudySession);
  }
  async createSession(session: StudySession) {
    // create() falha se o id já existir: a mesma sessão não é gravada duas vezes.
    await this.db.collection(CHECKLIST_COLLECTIONS.sessions).doc(session.id).create(session);
  }

  async getRoom(roomId: string) {
    const snap = await this.db.collection(CHECKLIST_COLLECTIONS.rooms).doc(roomId).get();
    if (!snap.exists) return null;
    const data = snap.data() as Partial<RoomDoc>;
    if (!data.state || !Array.isArray(data.memberIds)) return null;
    return { memberIds: data.memberIds, state: data.state };
  }
  async markRoomSessionSaved(roomId: string, sessionId: string, correctness: number) {
    const ref = this.db.collection(CHECKLIST_COLLECTIONS.rooms).doc(roomId);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() as (RoomDoc & { rev?: number }) | undefined;
      if (!data?.state) return;
      tx.update(ref, {
        state: applySavedSessionToRoom(data.state, sessionId, correctness),
        rev: (data.rev ?? 0) + 1,
        updatedBy: "server",
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async getSchedule(scheduleId: string) {
    const snap = await this.db.collection(CHECKLIST_COLLECTIONS.schedules).doc(scheduleId).get();
    return snap.exists ? (snap.data() as StudySchedule) : null;
  }
  async saveSchedule(schedule: StudySchedule) {
    await this.db.collection(CHECKLIST_COLLECTIONS.schedules).doc(schedule.id).set(schedule);
  }
  async listSchedulesForEvent(eventId: string) {
    const snap = await this.db.collection(CHECKLIST_COLLECTIONS.schedules).where("event_id", "==", eventId).get();
    return snap.docs.map((d) => d.data() as StudySchedule);
  }

  async confirmEvent(confirmation: EventConfirmation) {
    const ref = this.db
      .collection(CHECKLIST_COLLECTIONS.confirmations)
      .doc(`${confirmation.event_id}_${confirmation.user_id}`);
    await this.db.runTransaction(async (tx) => {
      if (!(await tx.get(ref)).exists) tx.set(ref, confirmation);
    });
  }
  async listConfirmations(eventId: string) {
    const snap = await this.db
      .collection(CHECKLIST_COLLECTIONS.confirmations)
      .where("event_id", "==", eventId)
      .get();
    return snap.docs.map((d) => d.data() as EventConfirmation);
  }

  async createReport(report: StationReport) {
    await this.db.collection(CHECKLIST_COLLECTIONS.reports).add(report);
  }

  async getProfiles(userIds: string[]) {
    if (userIds.length === 0) return [];
    const col = this.db.collection(CHECKLIST_COLLECTIONS.users);
    const snaps = await this.db.getAll(...userIds.map((id) => col.doc(id)));
    return snaps
      .filter((s) => s.exists)
      .map((s): PublicProfile => {
        const data = s.data() ?? {};
        return {
          id: s.id,
          name: typeof data.name === "string" && data.name ? data.name : "Usuário",
          avatarSeed: typeof data.avatarSeed === "string" ? data.avatarSeed : null,
        };
      });
  }
}
