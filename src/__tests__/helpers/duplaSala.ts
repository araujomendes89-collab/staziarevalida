/**
 * Apoio dos testes de tela da sala ao vivo (Tarefas 17a a 17c): um "servidor" simulado que guarda a sala e responde como as
 * funções app_dupla_* (o rev sobe a cada ação), e o conteúdo de cada papel como o banco devolve (013350). Tudo é de TESTE.
 */
import { act } from "@testing-library/react";
import { vi } from "vitest";

export const NOW = "2026-10-11T15:00:00.000Z";
export const STATION = {
  id: "teste-dupla-e01", name: "Estação de teste", area: "Clínica Médica", area_code: "CM", number: 3,
  edition: "2020", reapplication: false, institution: "INEP", duration_ms: 600000, is_pro_only: false,
};
const { id: _i, name: _n, ...CAND } = STATION;
export const CAND_STATION = { ...CAND, label: "Estação 3" };

export const ITEMS = [
  { id: "i1", order: 1, content: "Item um", tip: "", grades: { correct: 2.5, partial: 1.25, incorrect: 0 }, criteria: {}, subitems: [] },
  { id: "i2", order: 2, content: "Item dois", tip: "", grades: { correct: 2.5, partial: null, incorrect: 0 }, criteria: {}, subitems: [] },
  { id: "i3", order: 3, content: "Item três", tip: "", grades: { correct: 5, partial: 2.5, incorrect: 0 }, criteria: {}, subitems: [{ id: "s1", text: "Subitem um" }, { id: "s2", text: "Subitem dois" }] },
];

export function baseRoom(over: Record<string, any> = {}) {
  return {
    id: "r1", rev: 1, phase: "setup", round: 1, server_now: NOW, station: STATION, duration_ms: 600000,
    me: { user_id: "u-ana", public_name: "Ana Souza", role: "evaluator", confirmed: true, connected: true, ready: true, picked_station: false },
    partner: { user_id: "u-bruno", public_name: "Bruno Lima", role: "candidate", confirmed: true, connected: true, ready: true, seen_ms_ago: 1000 },
    match_note: null, invite_pending: false, call_link: null, started_at: null, ends_at: null, paused_left_ms: null, paused_at: null,
    finished_at: null, released_pressings: [], closed_reason: null, closed_by: null,
    ...over,
  };
}
export const asCandidate = (r: any) => ({ ...r, station: CAND_STATION, me: { ...r.me, role: "candidate", user_id: "u-bruno", public_name: "Bruno Lima" }, partner: { ...r.partner, role: "evaluator", user_id: "u-ana", public_name: "Ana Souza" } });

const RELATO = { initially_visible: true, display_number: 1, name: "Relato do caso", content: "Relato inicial de teste.", has_image: false };
const PRINTS = [
  { id: "teste-p1", display_number: 1, source_number: 2, initially_visible: false, name: "Hemograma", content: "Hb 9,0 g/dL\n\nLiberação: quando pedir.", has_image: false },
  { id: "teste-p2", display_number: 2, source_number: 3, initially_visible: false, name: "Esfregaço", content: "Esfregaço de sangue.", has_image: true },
];

/** Conteúdo do papel como a 013350 devolve. Candidato: chaves de tela ('i1', 'd1'…), sem source_number e sem o nome. */
export function contentOf(role: "evaluator" | "candidate", o: { released?: string[]; sheetImage?: boolean; summary?: unknown } = {}) {
  if (role === "evaluator") {
    return {
      role,
      station: { ...STATION, label: "Estação 3", version: "1.0", doctor_scene: "Cenário de teste.", doctor_tasks: "1. Fazer a anamnese.", actor_script: "Dados pessoais:\nPaciente de teste.", candidate_sheet: { has_image: Boolean(o.sheetImage) }, summary: o.summary ?? null },
      pressing_count: 2,
      pressings: [{ ...RELATO, id: "teste-p0", source_number: 1 }, ...PRINTS],
      checklist_items: ITEMS,
    };
  }
  const released = o.released ?? [];
  return {
    role,
    station: { ...CAND_STATION, version: "1.0", doctor_scene: "Cenário de teste.", doctor_tasks: "1. Fazer a anamnese.", candidate_sheet: { has_image: Boolean(o.sheetImage) } },
    pressing_count: 2,
    pressings: [
      { ...RELATO, id: "i1" },
      ...PRINTS.map(({ source_number: _s, id: _id, ...p }) => ({ ...p, id: "d" + p.display_number, content: p.content.replace(/\n\nLiberação:.*$/s, "") })).filter((p) => released.includes(p.id)),
    ],
  };
}

export interface Srv {
  room: any;
  content: any;
  marks: any[];
  result: any;
  steps: Record<string, (args: any) => any>;
}

/** Liga `rpc` ao servidor simulado. Funções sem passo devolvem o estado com rev + 1 (ou `{ ok: true }` em app_dupla_mark). */
export function serve(rpc: ReturnType<typeof vi.fn>, srv: Srv) {
  rpc.mockImplementation(async (fn: string, args: any = {}) => {
    if (fn === "app_dupla_room") return args.p_since_rev != null && args.p_since_rev === srv.room.rev ? null : { ...srv.room, server_now: NOW };
    if (fn === "app_dupla_room_content") return typeof srv.content === "function" ? srv.content() : srv.content;
    if (fn === "app_dupla_marks") return srv.marks;
    if (fn === "app_dupla_result") return srv.result;
    if (fn === "app_dupla_heartbeat") return { server_now: NOW };
    if (fn === "app_dupla_mark" && !srv.steps[fn]) return { ok: true };
    const step = srv.steps[fn];
    const next = step ? step(args) : {};
    if (next instanceof Error) throw next;
    srv.room = { ...srv.room, ...next, rev: srv.room.rev + 1 };
    return { ...srv.room, server_now: NOW };
  });
}

export const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
