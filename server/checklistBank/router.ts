/**
 * Banco de Checklists + Simulados — API REST (/api/checklist-bank).
 * Especificação: checklists-pack/docs/especificacao-banco-checklists-simulados.md
 */
import { Router, type Request, type RequestHandler, type Response } from "express";
import { authenticateFirebaseRequest, requireServerCapability } from "../auth/authMiddleware";
import type { ServerPrincipal } from "../auth/types";
import { toLite } from "../../src/shared/checklistBank/catalog";
import { getEventStatus, isWithinEventWindow } from "../../src/shared/checklistBank/eventStatus";
import { computeScore, isFailed } from "../../src/shared/checklistBank/scoring";
import type {
  ChecklistEvent,
  ChecklistEventDetail,
  ChecklistEventSummary,
  EventParticipant,
  FinishStudySessionResponse,
  StudySchedule,
  StudySession,
  StudySessionSummary,
} from "../../src/shared/checklistBank/types";
import { canAccessPro, canOpenEvent, canOpenStation, isStationVisible } from "./access";
import { getChecklistCatalog, type ChecklistCatalog } from "./catalog";
import { FirestoreChecklistBankStore } from "./firestoreStore";
import { eventScheduleId, studySessionId, type ChecklistBankStore } from "./store";

export const ACTOR_NOTES_MAX_LENGTH = 1000;
const REPORT_MAX_LENGTH = 2000;
const PROFILES_MAX_IDS = 50;

export interface ChecklistBankRouterDeps {
  store: ChecklistBankStore;
  catalog: () => ChecklistCatalog;
  now: () => Date;
  /** Middlewares que preenchem `req.principal`. */
  authenticate: RequestHandler[];
}

const fail = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ error: code, message });

const average = (values: number[]) =>
  values.length === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

export function createChecklistBankRouter(deps: ChecklistBankRouterDeps): Router {
  const router = Router();
  const { store, now } = deps;
  router.use(...deps.authenticate);

  const principalOf = (req: Request): ServerPrincipal => req.principal as ServerPrincipal;

  const findStation = (id: string) => deps.catalog().stations.find((s) => s.id === id);
  const findEvent = (id: string) => deps.catalog().events.find((e) => e.id === id);

  const summarizeEvent = async (principal: ServerPrincipal, event: ChecklistEvent): Promise<ChecklistEventSummary> => ({
    ...event,
    status: getEventStatus(event, now()),
    stations_count: event.station_ids.length,
    confirmed_users_count: (await store.listConfirmations(event.id)).length,
    accessible: canOpenEvent(principal, event, deps.catalog().stations),
  });

  // ---------------------------------------------------------------- Estações

  router.get("/stations", (req, res) => {
    const principal = principalOf(req);
    const visible = deps.catalog().stations.filter((s) => isStationVisible(principal, s));
    // A lista é sempre enxuta: o detalhe completo só sai por /stations/:id.
    res.json({ stations: visible.map(toLite), can_access_pro: canAccessPro(principal) });
  });

  router.get("/stations/:id", (req, res) => {
    const principal = principalOf(req);
    const station = findStation(req.params.id);
    if (!station || !isStationVisible(principal, station)) {
      return fail(res, 404, "STATION_NOT_FOUND", "Estação não encontrada.");
    }
    if (!canOpenStation(principal, station)) {
      return fail(res, 403, "PRO_REQUIRED", "Esta estação é exclusiva do plano Pro.");
    }
    res.json({ station });
  });

  router.post("/stations/:id/report", async (req, res) => {
    const principal = principalOf(req);
    const station = findStation(req.params.id);
    if (!station || !isStationVisible(principal, station)) {
      return fail(res, 404, "STATION_NOT_FOUND", "Estação não encontrada.");
    }
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) return fail(res, 400, "REPORT_EMPTY", "Descreva o erro encontrado.");
    await store.createReport({
      station_id: station.id,
      user_id: principal.uid,
      message: message.slice(0, REPORT_MAX_LENGTH),
      created_at: now().toISOString(),
    });
    res.status(201).json({ ok: true });
  });

  // ---------------------------------------------------------------- Favoritos

  router.get("/favorite-stations", async (req, res) => {
    res.json({ station_ids: await store.getFavorites(principalOf(req).uid) });
  });

  router.post("/favorite-stations", async (req, res) => {
    const principal = principalOf(req);
    const stationId = typeof req.body?.station_id === "string" ? req.body.station_id : "";
    const station = findStation(stationId);
    if (!station || !isStationVisible(principal, station)) {
      return fail(res, 404, "STATION_NOT_FOUND", "Estação não encontrada.");
    }
    await store.addFavorite(principal.uid, stationId);
    res.json({ station_ids: await store.getFavorites(principal.uid) });
  });

  router.delete("/favorite-stations/:stationId", async (req, res) => {
    const principal = principalOf(req);
    await store.removeFavorite(principal.uid, req.params.stationId);
    res.json({ station_ids: await store.getFavorites(principal.uid) });
  });

  // ---------------------------------------------------------------- Sessões

  router.get("/me/study-sessions", async (req, res) => {
    const uid = principalOf(req).uid;
    const sessions = await store.listSessionsForUser(uid);
    const summaries: StudySessionSummary[] = sessions
      .map((s) => ({
        id: s.id,
        station_id: s.station_id,
        role: s.doctor_id === uid ? ("doctor" as const) : ("actor" as const),
        correctness: s.correctness,
        failed: isFailed(s.correctness),
        finished_at: s.finished_at,
      }))
      .sort((a, b) => b.finished_at.localeCompare(a.finished_at));
    res.json({ sessions: summaries });
  });

  /**
   * Finaliza a estação. Só o médico da sala chama; tudo o que entra na nota é lido do
   * documento da sala (onde só o ator escreve) e a nota é recalculada pelos `grades`.
   */
  router.post("/study-sessions", async (req, res) => {
    const principal = principalOf(req);
    const roomId = typeof req.body?.room_id === "string" ? req.body.room_id : "";
    if (!roomId) return fail(res, 400, "ROOM_REQUIRED", "Informe a sala.");

    const room = await store.getRoom(roomId);
    if (!room || !room.memberIds.includes(principal.uid)) {
      return fail(res, 404, "ROOM_NOT_FOUND", "Sala não encontrada.");
    }
    const { state } = room;
    const roles = state.roles;
    if (!roles || roles.doctor_id !== principal.uid) {
      return fail(res, 403, "ONLY_DOCTOR_FINISHES", "Só o médico finaliza a estação.");
    }
    const session = state.session;
    if (state.status !== "OnReview" || !session?.started_at || !session.finished_at) {
      return fail(res, 409, "STATION_NOT_FINISHED", "A estação ainda não foi encerrada pelo ator.");
    }
    const station = findStation(session.station_id);
    if (!station || !canOpenStation(principal, station)) {
      return fail(res, 404, "STATION_NOT_FOUND", "Estação não encontrada.");
    }

    const id = session.saved_session_id ?? studySessionId(roomId, session.started_at);
    const existing = await store.getSession(id);
    if (existing) {
      const body: FinishStudySessionResponse = {
        id: existing.id,
        score: existing.score,
        max_score: existing.max_score,
        correctness: existing.correctness,
      };
      return res.json(body);
    }

    const score = computeScore(station, session.checklists);
    const pressingIds = new Set(station.pressings.map((p) => p.id));

    // A fila da sala só é vinculada se pertencer ao próprio médico.
    let schedule: StudySchedule | null = null;
    if (state.schedule?.id) {
      const stored = await store.getSchedule(state.schedule.id);
      if (stored && stored.user_id === principal.uid) schedule = stored;
    }

    const saved: StudySession = {
      id,
      station_id: station.id,
      room_id: roomId,
      schedule_id: schedule?.id ?? null,
      event_id: schedule?.event_id ?? null,
      actor_id: roles.actor_id,
      doctor_id: roles.doctor_id,
      started_at: session.started_at,
      finished_at: session.finished_at,
      pressings_released: session.allowed_pressings.filter((p) => pressingIds.has(p.id)),
      checklist_answers: session.checklists,
      score: score.score,
      max_score: score.max_score,
      correctness: score.correctness,
      actor_notes: (session.actor_notes ?? "").slice(0, ACTOR_NOTES_MAX_LENGTH),
      created_at: now().toISOString(),
    };
    await store.createSession(saved);

    if (schedule) {
      let marked = false;
      await store.saveSchedule({
        ...schedule,
        sessions: schedule.sessions.map((entry) => {
          if (marked || entry.station_id !== station.id || entry.was_done) return entry;
          marked = true;
          return { ...entry, checklist_bank_study_session_id: id, correctness: score.correctness, was_done: true };
        }),
      });
    }
    await store.markRoomSessionSaved(roomId, id, score.correctness);

    const body: FinishStudySessionResponse = {
      id,
      score: score.score,
      max_score: score.max_score,
      correctness: score.correctness,
    };
    res.status(201).json(body);
  });

  router.get("/study-sessions/:id", async (req, res) => {
    const uid = principalOf(req).uid;
    const session = await store.getSession(req.params.id);
    if (!session || (session.doctor_id !== uid && session.actor_id !== uid)) {
      return fail(res, 404, "SESSION_NOT_FOUND", "Sessão não encontrada.");
    }
    const station = findStation(session.station_id);
    res.json({ session, by_phase: station ? computeScore(station, session.checklist_answers).by_phase : [] });
  });

  // ---------------------------------------------------------------- Simulados

  router.get("/events", async (req, res) => {
    const principal = principalOf(req);
    const events = await Promise.all(deps.catalog().events.map((e) => summarizeEvent(principal, e)));
    res.json({ events });
  });

  router.get("/events/:id", async (req, res) => {
    const principal = principalOf(req);
    const uid = principal.uid;
    const event = findEvent(req.params.id);
    if (!event) return fail(res, 404, "EVENT_NOT_FOUND", "Simulado não encontrado.");

    const [summary, confirmations, schedules] = await Promise.all([
      summarizeEvent(principal, event),
      store.listConfirmations(event.id),
      store.listSchedulesForEvent(event.id),
    ]);
    const profiles = new Map(
      (await store.getProfiles([...new Set(schedules.map((s) => s.user_id))].slice(0, PROFILES_MAX_IDS))).map((p) => [
        p.id,
        p.name,
      ])
    );

    const participants = new Map<string, EventParticipant>();
    for (const c of confirmations) {
      participants.set(c.user_id, {
        user: { id: c.user_id, name: c.name },
        confirmed_at: c.confirmed_at,
        schedule_id: null,
        sessions_ids: [],
        count_sessions: 0,
        correctness: null,
      });
    }
    for (const schedule of schedules) {
      const done = schedule.sessions.filter((s) => s.was_done && s.checklist_bank_study_session_id);
      const current = participants.get(schedule.user_id);
      participants.set(schedule.user_id, {
        user: current?.user ?? { id: schedule.user_id, name: profiles.get(schedule.user_id) ?? "Participante" },
        confirmed_at: current?.confirmed_at ?? schedule.created_at,
        schedule_id: schedule.id,
        sessions_ids: done.map((s) => s.checklist_bank_study_session_id as string),
        count_sessions: done.length,
        correctness: average(done.map((s) => s.correctness ?? 0)),
      });
    }

    // Ranking: quem concluiu estações primeiro, por % de acerto; depois os só confirmados.
    const ranked = [...participants.values()].sort((a, b) => {
      if (a.correctness === null && b.correctness === null) return a.confirmed_at.localeCompare(b.confirmed_at);
      if (a.correctness === null) return 1;
      if (b.correctness === null) return -1;
      return b.correctness - a.correctness;
    });

    const detail: ChecklistEventDetail = {
      ...summary,
      was_confirmed: participants.has(uid),
      participants: ranked,
    };
    res.json({ event: detail });
  });

  router.post("/events/:id/confirm", async (req, res) => {
    const principal = principalOf(req);
    const event = findEvent(req.params.id);
    if (!event) return fail(res, 404, "EVENT_NOT_FOUND", "Simulado não encontrado.");
    if (getEventStatus(event, now()) === "expired") {
      return fail(res, 409, "EVENT_EXPIRED", "Este simulado já terminou.");
    }
    await store.confirmEvent({
      event_id: event.id,
      user_id: principal.uid,
      name: principal.name || "Participante",
      confirmed_at: now().toISOString(),
    });
    res.json({ was_confirmed: true });
  });

  /** Inicia o simulado: cria (ou devolve) a fila do usuário com uma sessão por estação. */
  router.post("/events/:id/start", async (req, res) => {
    const principal = principalOf(req);
    const event = findEvent(req.params.id);
    if (!event) return fail(res, 404, "EVENT_NOT_FOUND", "Simulado não encontrado.");
    if (!isWithinEventWindow(event, now())) {
      return fail(res, 409, "EVENT_OUTSIDE_WINDOW", "O simulado só pode ser iniciado dentro do período.");
    }
    const stations = deps.catalog().stations;
    if (!canOpenEvent(principal, event, stations)) {
      return fail(res, 403, "EVENT_FORBIDDEN", "Você não tem acesso às estações deste simulado.");
    }

    await store.confirmEvent({
      event_id: event.id,
      user_id: principal.uid,
      name: principal.name || "Participante",
      confirmed_at: now().toISOString(),
    });

    const scheduleId = eventScheduleId(event.id, principal.uid);
    let schedule = await store.getSchedule(scheduleId);
    if (!schedule) {
      schedule = {
        id: scheduleId,
        user_id: principal.uid,
        event_id: event.id,
        mode: "Classic",
        sessions: event.station_ids.map((stationId) => ({
          station_id: stationId,
          checklist_bank_study_session_id: null,
          correctness: null,
          was_done: false,
          maximum_duration: stations.find((s) => s.id === stationId)?.duration_ms ?? 600000,
          show_clock: true,
          checklist_bank_event_id: event.id,
        })),
        created_at: now().toISOString(),
      };
      await store.saveSchedule(schedule);
    }
    res.json({ schedule });
  });

  // ---------------------------------------------------------------- Perfis

  /** Nome/avatar em lote (substitui uma chamada por pessoa). */
  router.get("/profiles", async (req, res) => {
    const raw = typeof req.query.ids === "string" ? req.query.ids : "";
    const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
    if (ids.length > PROFILES_MAX_IDS) {
      return fail(res, 400, "TOO_MANY_IDS", `No máximo ${PROFILES_MAX_IDS} perfis por chamada.`);
    }
    res.json({ profiles: await store.getProfiles(ids) });
  });

  return router;
}

export const checklistBankRouter = createChecklistBankRouter({
  store: new FirestoreChecklistBankStore(),
  catalog: getChecklistCatalog,
  now: () => new Date(),
  authenticate: [authenticateFirebaseRequest, requireServerCapability(["STUDENT", "EDITOR", "ADMIN"])],
});
