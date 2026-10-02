import { auth } from "../../lib/firebase";
import type {
  ChecklistEventDetail,
  ChecklistEventSummary,
  FinishStudySessionResponse,
  PublicProfile,
  Station,
  StationLite,
  StudySchedule,
  StudySession,
  StudySessionSummary,
} from "../../shared/checklistBank/types";
import type { PhaseScore } from "../../shared/checklistBank/scoring";

const BASE = "/api/checklist-bank";

export class ChecklistApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ChecklistApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ChecklistApiError(401, "AUTH_MISSING_TOKEN", "Entre na sua conta para continuar.");
  const token = await user.getIdToken();

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ChecklistApiError(
      res.status,
      body?.error ?? "REQUEST_FAILED",
      body?.message ?? "Não foi possível completar a ação. Tente novamente."
    );
  }
  return body as T;
}

const post = <T>(path: string, data?: unknown) =>
  request<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) });

export const checklistBankApi = {
  listStations: () => request<{ stations: StationLite[]; can_access_pro: boolean }>("/stations?lite=true"),
  getStation: (id: string) => request<{ station: Station }>(`/stations/${encodeURIComponent(id)}`),
  reportStation: (id: string, message: string) => post<{ ok: true }>(`/stations/${encodeURIComponent(id)}/report`, { message }),

  getFavorites: () => request<{ station_ids: string[] }>("/favorite-stations"),
  addFavorite: (stationId: string) => post<{ station_ids: string[] }>("/favorite-stations", { station_id: stationId }),
  removeFavorite: (stationId: string) =>
    request<{ station_ids: string[] }>(`/favorite-stations/${encodeURIComponent(stationId)}`, { method: "DELETE" }),

  getMySessions: () => request<{ sessions: StudySessionSummary[] }>("/me/study-sessions"),
  getSession: (id: string) =>
    request<{ session: StudySession; by_phase: PhaseScore[] }>(`/study-sessions/${encodeURIComponent(id)}`),
  finishSession: (roomId: string) => post<FinishStudySessionResponse>("/study-sessions", { room_id: roomId }),

  listEvents: () => request<{ events: ChecklistEventSummary[] }>("/events"),
  getEvent: (id: string) => request<{ event: ChecklistEventDetail }>(`/events/${encodeURIComponent(id)}`),
  confirmEvent: (id: string) => post<{ was_confirmed: true }>(`/events/${encodeURIComponent(id)}/confirm`),
  startEvent: (id: string) => post<{ schedule: StudySchedule }>(`/events/${encodeURIComponent(id)}/start`),

  getProfiles: (ids: string[]) =>
    request<{ profiles: PublicProfile[] }>(`/profiles?ids=${ids.map(encodeURIComponent).join(",")}`),
};
