import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express, { type RequestHandler } from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import stationsSeed from "../../server/checklistBank/data/stations.seed.json";
import eventsSeed from "../../server/checklistBank/data/events.seed.json";
import { createChecklistBankRouter } from "../../server/checklistBank/router";
import { MemoryChecklistBankStore } from "../../server/checklistBank/memoryStore";
import type { ServerPrincipal } from "../../server/auth/types";
import { loadEvents, loadStations } from "../shared/checklistBank/catalog";
import type { ChecklistAnswer, RoomState, Station } from "../shared/checklistBank/types";

const NOW = new Date("2026-10-10T12:00:00.000Z");

/** Catálogo de teste: seed aprovado, mais uma estação Pro e uma ainda em revisão. */
function buildCatalog() {
  const raw = JSON.parse(JSON.stringify(stationsSeed));
  for (const s of raw) s.medical_review = "approved";
  raw[1].is_pro_only = true; // seed-02
  raw[9].medical_review = "pending"; // seed-10
  const stations = loadStations(raw);
  return { stations, events: loadEvents(eventsSeed, stations) };
}

const USERS: Record<string, ServerPrincipal> = {
  doctor: { uid: "u-doctor", role: "STUDENT", tier: "FREE", name: "Dra. Ana" },
  actor: { uid: "u-actor", role: "STUDENT", tier: "FREE", name: "Dr. Bruno" },
  pro: { uid: "u-pro", role: "STUDENT", tier: "PRO", name: "Carla Pro" },
  admin: { uid: "u-admin", role: "ADMIN", tier: "ADMIN", name: "Admin" },
};

// Autenticação simulada: o header X-Test-User escolhe o usuário.
const fakeAuth: RequestHandler = (req, res, next) => {
  const principal = USERS[String(req.headers["x-test-user"] ?? "")];
  if (!principal) return void res.status(401).json({ error: "AUTH_MISSING_TOKEN" });
  req.principal = principal;
  next();
};

let server: Server;
let baseUrl = "";
let store: MemoryChecklistBankStore;
let catalog: ReturnType<typeof buildCatalog>;
let now = NOW;

async function call(user: keyof typeof USERS, method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}/api/checklist-bank${path}`, {
    method,
    headers: { "x-test-user": user, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

const station = (id: string) => catalog.stations.find((s) => s.id === id) as Station;

/** Sala encerrada pelo ator (OnReview), pronta para o médico finalizar. */
function seedRoom(roomId: string, stationId: string, checklists: ChecklistAnswer[], extra: Partial<RoomState> = {}) {
  const state: RoomState = {
    id: roomId,
    status: "OnReview",
    roles: { actor_id: USERS.actor.uid, doctor_id: USERS.doctor.uid },
    session: {
      station_id: stationId,
      allowed_pressings: [
        { id: "p1", time: 30_000 },
        { id: "nao-existe", time: 40_000 },
      ],
      checklists,
      started_at: "2026-10-10T11:50:00.000Z",
      finished_at: "2026-10-10T11:59:00.000Z",
      paused_at: null,
      paused_total_ms: 0,
      is_paused: false,
      show_clock: true,
      maximum_duration: 600000,
      actor_notes: "Boa anamnese. ".repeat(100),
      checklist_bank_event_id: null,
      saved_session_id: null,
    },
    schedule: null,
    ...extra,
  };
  store.rooms.set(roomId, { memberIds: [USERS.actor.uid, USERS.doctor.uid], state });
}

beforeEach(async () => {
  store = new MemoryChecklistBankStore();
  catalog = buildCatalog();
  now = NOW;
  const app = express();
  app.use(express.json());
  app.use(
    "/api/checklist-bank",
    createChecklistBankRouter({ store, catalog: () => catalog, now: () => now, authenticate: [fakeAuth] })
  );
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("API /api/checklist-bank — estações", () => {
  it("lista enxuta; estação em revisão médica só aparece para admin", async () => {
    const student = await call("doctor", "GET", "/stations?lite=true");
    expect(student.status).toBe(200);
    expect(student.body.stations).toHaveLength(9);
    expect(student.body.stations[0]).not.toHaveProperty("checklist_items");
    expect(student.body.stations.map((s: any) => s.id)).not.toContain("seed-10");

    const admin = await call("admin", "GET", "/stations?lite=true");
    expect(admin.body.stations).toHaveLength(10);
  });

  it("sem login responde 401", async () => {
    const res = await fetch(`${baseUrl}/api/checklist-bank/stations`);
    expect(res.status).toBe(401);
  });

  it("detalhe completo; Pro exige plano; em revisão é 404 para aluno", async () => {
    const free = await call("doctor", "GET", "/stations/seed-01");
    expect(free.status).toBe(200);
    expect(free.body.station.checklist_items.length).toBeGreaterThan(0);

    expect((await call("doctor", "GET", "/stations/seed-02")).body.error).toBe("PRO_REQUIRED");
    expect((await call("pro", "GET", "/stations/seed-02")).status).toBe(200);
    expect((await call("doctor", "GET", "/stations/seed-10")).status).toBe(404);
    expect((await call("admin", "GET", "/stations/seed-10")).status).toBe(200);
  });

  it("favoritos: adiciona, lista e remove", async () => {
    expect((await call("doctor", "POST", "/favorite-stations", { station_id: "seed-03" })).body.station_ids).toEqual([
      "seed-03",
    ]);
    expect((await call("doctor", "GET", "/favorite-stations")).body.station_ids).toEqual(["seed-03"]);
    expect((await call("doctor", "DELETE", "/favorite-stations/seed-03")).body.station_ids).toEqual([]);
    expect((await call("doctor", "POST", "/favorite-stations", { station_id: "nao-existe" })).status).toBe(404);
  });

  it("reportar erro grava o relato", async () => {
    expect((await call("doctor", "POST", "/stations/seed-01/report", { message: "  " })).status).toBe(400);
    expect((await call("doctor", "POST", "/stations/seed-01/report", { message: "Valor errado no item 3" })).status).toBe(
      201
    );
    expect(store.reports).toEqual([
      expect.objectContaining({ station_id: "seed-01", user_id: USERS.doctor.uid, message: "Valor errado no item 3" }),
    ]);
  });
});

describe("API /api/checklist-bank — finalizar estação (POST /study-sessions)", () => {
  it("recalcula a nota no servidor a partir dos grades da sala", async () => {
    const s = station("seed-01");
    const answers: ChecklistAnswer[] = s.checklist_items.map((i, idx) => ({
      id: i.id,
      grade: idx === 0 ? "Incorrect" : "Correct",
      subitems: [],
    }));
    seedRoom("room-1", "seed-01", answers);

    // Campos extras do cliente (ex.: nota inventada) são ignorados.
    const res = await call("doctor", "POST", "/study-sessions", { room_id: "room-1", score: 10, correctness: 100 });
    const expected = 10 - s.checklist_items[0].grades.correct;
    expect(res.status).toBe(201);
    expect(res.body.score).toBeCloseTo(expected, 6);
    expect(res.body.max_score).toBe(10);
    expect(res.body.correctness).toBeCloseTo(expected * 10, 1);

    const saved = store.sessions.get(res.body.id)!;
    expect(saved).toMatchObject({ actor_id: USERS.actor.uid, doctor_id: USERS.doctor.uid, station_id: "seed-01" });
    expect(saved.pressings_released).toEqual([{ id: "p1", time: 30_000 }]); // impresso inexistente descartado
    expect(saved.actor_notes.length).toBe(1000);
    expect(store.rooms.get("room-1")!.state.session!.saved_session_id).toBe(res.body.id);
  });

  it("só o médico finaliza; o ator recebe 403 e quem não é da sala, 404", async () => {
    seedRoom("room-2", "seed-01", []);
    expect((await call("actor", "POST", "/study-sessions", { room_id: "room-2" })).body.error).toBe(
      "ONLY_DOCTOR_FINISHES"
    );
    expect((await call("pro", "POST", "/study-sessions", { room_id: "room-2" })).status).toBe(404);
  });

  it("não finaliza antes de o ator encerrar a estação", async () => {
    seedRoom("room-3", "seed-01", [], { status: "OnStation" });
    expect((await call("doctor", "POST", "/study-sessions", { room_id: "room-3" })).body.error).toBe(
      "STATION_NOT_FINISHED"
    );
  });

  it("finalizar duas vezes devolve a mesma sessão (sem duplicar)", async () => {
    seedRoom("room-4", "seed-04", []);
    const first = await call("doctor", "POST", "/study-sessions", { room_id: "room-4" });
    const second = await call("doctor", "POST", "/study-sessions", { room_id: "room-4" });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(store.sessions.size).toBe(1);
  });

  it("histórico marca feita/reprovada para o médico e o papel de ator para o parceiro", async () => {
    seedRoom("room-5", "seed-06", []); // tudo em branco → 0% → reprovada
    await call("doctor", "POST", "/study-sessions", { room_id: "room-5" });

    const doctor = await call("doctor", "GET", "/me/study-sessions");
    expect(doctor.body.sessions).toEqual([
      expect.objectContaining({ station_id: "seed-06", role: "doctor", correctness: 0, failed: true }),
    ]);
    const actor = await call("actor", "GET", "/me/study-sessions");
    expect(actor.body.sessions[0].role).toBe("actor");
  });
});

describe("API /api/checklist-bank — simulados", () => {
  it("lista com status calculado pela data", async () => {
    const res = await call("doctor", "GET", "/events");
    expect(res.body.events[0]).toMatchObject({ id: "simulado-2026-10", status: "ongoing", stations_count: 5 });

    now = new Date("2026-12-01T00:00:00Z");
    expect((await call("doctor", "GET", "/events")).body.events[0].status).toBe("expired");
  });

  it("confirma presença e inicia: cria uma fila com 5 sessões, uma por estação", async () => {
    expect((await call("doctor", "POST", "/events/simulado-2026-10/confirm")).body.was_confirmed).toBe(true);
    const started = await call("doctor", "POST", "/events/simulado-2026-10/start");
    expect(started.status).toBe(200);
    expect(started.body.schedule.sessions.map((s: any) => s.station_id)).toEqual([
      "seed-01",
      "seed-03",
      "seed-05",
      "seed-07",
      "seed-09",
    ]);
    // Iniciar de novo devolve a mesma fila
    const again = await call("doctor", "POST", "/events/simulado-2026-10/start");
    expect(again.body.schedule.id).toBe(started.body.schedule.id);
  });

  it("não inicia fora da janela", async () => {
    now = new Date("2026-09-01T00:00:00Z");
    expect((await call("doctor", "POST", "/events/simulado-2026-10/start")).body.error).toBe("EVENT_OUTSIDE_WINDOW");
  });

  it("estação concluída entra na fila e no ranking por % de acerto", async () => {
    const started = await call("doctor", "POST", "/events/simulado-2026-10/start");
    const s = station("seed-01");
    seedRoom("room-ev", "seed-01", s.checklist_items.map((i) => ({ id: i.id, grade: "Correct", subitems: [] })), {
      schedule: { id: started.body.schedule.id, mode: "Classic", sessions: started.body.schedule.sessions },
    });
    await call("doctor", "POST", "/study-sessions", { room_id: "room-ev" });
    await call("actor", "POST", "/events/simulado-2026-10/confirm");

    const detail = await call("actor", "GET", "/events/simulado-2026-10");
    expect(detail.body.event.was_confirmed).toBe(true);
    expect(detail.body.event.participants.map((p: any) => [p.user.id, p.correctness, p.count_sessions])).toEqual([
      [USERS.doctor.uid, 100, 1],
      [USERS.actor.uid, null, 0],
    ]);
    expect(store.rooms.get("room-ev")!.state.schedule!.sessions[0]).toMatchObject({ was_done: true, correctness: 100 });
  });
});
