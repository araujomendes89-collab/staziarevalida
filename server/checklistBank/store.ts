import type {
  PublicProfile,
  RoomState,
  StudySchedule,
  StudySession,
} from "../../src/shared/checklistBank/types";

/** Documento da sala de estudo em dupla (coleção `checklist_rooms`). */
export interface RoomDoc {
  memberIds: string[];
  state: RoomState;
}

export interface EventConfirmation {
  event_id: string;
  user_id: string;
  name: string;
  confirmed_at: string;
}

export interface StationReport {
  station_id: string;
  user_id: string;
  message: string;
  created_at: string;
}

/** Persistência do Banco de Checklists. Firestore em produção; memória nos testes. */
export interface ChecklistBankStore {
  getFavorites(userId: string): Promise<string[]>;
  addFavorite(userId: string, stationId: string): Promise<void>;
  removeFavorite(userId: string, stationId: string): Promise<void>;

  getSession(sessionId: string): Promise<StudySession | null>;
  /** Sessões em que o usuário foi médico ou ator. */
  listSessionsForUser(userId: string): Promise<StudySession[]>;
  createSession(session: StudySession): Promise<void>;

  getRoom(roomId: string): Promise<RoomDoc | null>;
  /** Grava na sala o id da sessão salva e atualiza a fila (schedule) da sala. */
  markRoomSessionSaved(roomId: string, sessionId: string, correctness: number): Promise<void>;

  getSchedule(scheduleId: string): Promise<StudySchedule | null>;
  saveSchedule(schedule: StudySchedule): Promise<void>;
  listSchedulesForEvent(eventId: string): Promise<StudySchedule[]>;

  confirmEvent(confirmation: EventConfirmation): Promise<void>;
  listConfirmations(eventId: string): Promise<EventConfirmation[]>;

  createReport(report: StationReport): Promise<void>;

  getProfiles(userIds: string[]): Promise<PublicProfile[]>;
}

/** Id determinístico da fila de um usuário num simulado (uma por pessoa). */
export const eventScheduleId = (eventId: string, userId: string) => `event_${eventId}_${userId}`;

/** Mesma sala + mesmo início = mesma sessão (evita salvar duas vezes num duplo clique). */
export const studySessionId = (roomId: string, startedAt: string) => `${roomId}_${Date.parse(startedAt)}`;

/** Atualiza a sala em memória após salvar a sessão (usado pelas duas implementações). */
export function applySavedSessionToRoom(state: RoomState, sessionId: string, correctness: number): RoomState {
  if (!state.session) return state;
  const stationId = state.session.station_id;
  let marked = false;
  return {
    ...state,
    session: { ...state.session, saved_session_id: sessionId },
    schedule: state.schedule && {
      ...state.schedule,
      sessions: state.schedule.sessions.map((entry) => {
        if (marked || entry.station_id !== stationId || entry.was_done) return entry;
        marked = true;
        return { ...entry, checklist_bank_study_session_id: sessionId, correctness, was_done: true };
      }),
    },
  };
}
