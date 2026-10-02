import type { PublicProfile, StudySchedule, StudySession } from "../../src/shared/checklistBank/types";
import {
  applySavedSessionToRoom,
  type ChecklistBankStore,
  type EventConfirmation,
  type RoomDoc,
  type StationReport,
} from "./store";

/** Implementação em memória, para testes e para rodar sem Firebase. */
export class MemoryChecklistBankStore implements ChecklistBankStore {
  favorites = new Map<string, Set<string>>();
  sessions = new Map<string, StudySession>();
  rooms = new Map<string, RoomDoc>();
  schedules = new Map<string, StudySchedule>();
  confirmations = new Map<string, EventConfirmation>();
  reports: StationReport[] = [];
  profiles = new Map<string, PublicProfile>();

  async getFavorites(userId: string) {
    return [...(this.favorites.get(userId) ?? [])];
  }
  async addFavorite(userId: string, stationId: string) {
    const set = this.favorites.get(userId) ?? new Set<string>();
    set.add(stationId);
    this.favorites.set(userId, set);
  }
  async removeFavorite(userId: string, stationId: string) {
    this.favorites.get(userId)?.delete(stationId);
  }

  async getSession(sessionId: string) {
    return this.sessions.get(sessionId) ?? null;
  }
  async listSessionsForUser(userId: string) {
    return [...this.sessions.values()].filter((s) => s.doctor_id === userId || s.actor_id === userId);
  }
  async createSession(session: StudySession) {
    this.sessions.set(session.id, session);
  }

  async getRoom(roomId: string) {
    return this.rooms.get(roomId) ?? null;
  }
  async markRoomSessionSaved(roomId: string, sessionId: string, correctness: number) {
    const room = this.rooms.get(roomId);
    if (room) this.rooms.set(roomId, { ...room, state: applySavedSessionToRoom(room.state, sessionId, correctness) });
  }

  async getSchedule(scheduleId: string) {
    return this.schedules.get(scheduleId) ?? null;
  }
  async saveSchedule(schedule: StudySchedule) {
    this.schedules.set(schedule.id, schedule);
  }
  async listSchedulesForEvent(eventId: string) {
    return [...this.schedules.values()].filter((s) => s.event_id === eventId);
  }

  async confirmEvent(confirmation: EventConfirmation) {
    const key = `${confirmation.event_id}_${confirmation.user_id}`;
    if (!this.confirmations.has(key)) this.confirmations.set(key, confirmation);
  }
  async listConfirmations(eventId: string) {
    return [...this.confirmations.values()].filter((c) => c.event_id === eventId);
  }

  async createReport(report: StationReport) {
    this.reports.push(report);
  }

  async getProfiles(userIds: string[]) {
    return userIds.map((id) => this.profiles.get(id)).filter((p): p is PublicProfile => p !== undefined);
  }
}
