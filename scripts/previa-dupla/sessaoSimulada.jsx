// Substitui src/novo/app/session.jsx só na prévia: um "banco" em memória com as funções app_dupla_* que as telas usam.
// TUDO é DADO DE TESTE: colegas fictícios, notas fictícias. As 10 estações do INEP 2020 vêm do pacote de design (só locais).
import React from "react";
import ESTACOES from "./estacoes-inep2020-teste.json";

const NOW = () => new Date().toISOString();
const EM = (ms) => new Date(Date.now() + ms).toISOString();

const resumo = (s) => ({
  id: `teste-inep2020-e${String(s.n).padStart(2, "0")}`,
  name: s.name, topic: s.tags?.[0] ?? null, number: s.n, area: s.area, area_code: s.code, styles: s.tags ?? [],
  edition: "2020", reapplication: false, institution: "INEP", duration_ms: s.duration * 1000, is_pro_only: false,
  my_last_pct: s.n === 1 ? 74 : s.n === 4 ? 52 : null, average_pct: [61, 55, 70, 58, 49, 66, 72, 45, 60, 53][s.n - 1],
});
const BANCO = ESTACOES.map(resumo);
const porId = (id) => ESTACOES.find((s) => resumo(s).id === id) ?? ESTACOES[0];

let perfil = {
  public_name: "Aluno de Teste", school: "Faculdade de Teste", city: "Cidade de Teste · UF", goal: "Treinar as estações de Ginecologia e Clínica",
  exam: "2026/2", bio: "Perfil de teste, sem pessoa real.", areas: ["GO", "CM"], role_pref: "any", pace: "cronometrado",
  days: ["Seg", "Qua", "Sex"], shifts: ["Noite"], radar_visible: true, show_school: true, show_stats: true,
};
const semPerfil = new URLSearchParams(location.search).get("perfil") === "nenhum";
if (semPerfil) perfil = null;

const colega = (id, nome, extra = {}) => ({
  user_id: id, public_name: nome, school: "Faculdade de Teste", city: "Cidade de Teste · UF", exam: "2026/2", bio: "Colega fictício (dados de teste).",
  goal: "Treinar GO", areas: ["GO"], role_pref: "ator", pace: "cronometrado", days: ["Seg", "Qua"], shifts: ["Noite"], stats: { done: 3, avg: 7.8 },
  compat: 92, reasons: [{ icon: "check", text: "Ginecologia e Obstetrícia em comum", strong: true }, { icon: "check", text: "Papéis se completam" }], online: true, ...extra,
});
let baralho = [
  colega("t-1", "Colega Teste Um", { compat: 92 }),
  colega("t-2", "Colega Teste Dois", { compat: 78, areas: ["CM", "PED"], role_pref: "any", reasons: [{ icon: "check", text: "Clínica Médica em comum", strong: true }] }),
  colega("t-3", "Colega Teste Três", { compat: 63, areas: ["CR"], role_pref: "med", reasons: [{ icon: "alert", text: "Poucas áreas em comum", weak: true }] }),
  colega("t-4", "Colega Teste Quatro", { compat: 41, areas: ["MFC"], role_pref: "ator", stats: null }),
];

// ----- sala (estado por fase; o id da sala é "<fase>-<papel>") -----
const E1 = ESTACOES[0];
const ST = { ...resumo(E1), area: E1.area };
const itens = E1.criteria.map((c, i) => ({
  id: `i${i + 1}`, order: i + 1, content: c.title, tip: c.hint || "",
  grades: { correct: c.max, partial: c.partial, incorrect: 0 },
  criteria: {}, subitems: [],
}));
const impressos = E1.prints.map((p, i) => ({ id: `p${i + 1}`, index: i + 1, name: p.title, content: p.body, has_image: false }));
const lerSala = (roomId) => {
  const [fase = "roles", papel = "candidate"] = String(roomId).split("-");
  return { fase, papel: papel === "evaluator" ? "evaluator" : "candidate" };
};
function salaEstado(roomId) {
  const { fase, papel } = lerSala(roomId);
  const outro = papel === "candidate" ? "evaluator" : "candidate";
  const base = {
    id: roomId, rev: 3, phase: fase, round: 1, server_now: NOW(), station: ST, duration_ms: 600000,
    me: { user_id: "t-eu", public_name: "Aluno de Teste", role: papel, confirmed: false, connected: true, ready: false },
    partner: { user_id: "t-1", public_name: "Colega Teste Um", role: outro, confirmed: false, connected: true, ready: false, seen_ms_ago: 2000 },
    match_note: "Definido pelo match: você topa qualquer papel e Colega Teste Um quer ser ator/avaliador. Vocês ainda podem trocar. (dado de teste)",
    invite_pending: false, call_link: fase === "setup" || fase === "running" ? "https://meet.exemplo.teste/sala" : null,
    started_at: null, ends_at: null, paused_left_ms: null, paused_at: null, finished_at: null, released_pressings: [], closed_reason: null, closed_by: null,
  };
  if (fase === "running") return { ...base, started_at: EM(-180000), ends_at: EM(420000), released_pressings: ["p1"] };
  if (fase === "review") return { ...base, finished_at: EM(-60000) };
  if (fase === "result") return { ...base, finished_at: EM(-600000) };
  if (fase === "closed") return { ...base, closed_reason: "saiu", closed_by: { me: false, public_name: "Colega Teste Um" } };
  if (fase === "setup") return { ...base, me: { ...base.me, confirmed: true }, partner: { ...base.partner, confirmed: true } };
  return base;
}
function salaConteudo(roomId) {
  const { fase, papel } = lerSala(roomId);
  const min = { id: ST.id, name: ST.name, area: ST.area, area_code: ST.area_code, number: ST.number, duration_ms: 600000 };
  if (fase === "roles" || fase === "connecting") return { role: papel, station: min, pressing_count: impressos.length, pressings: [] };
  const liberados = fase === "running" ? [impressos[0]] : impressos;
  const cena = [E1.scenario, "Tarefas:\n" + E1.tasks.map((t, i) => `${i + 1}. ${t}`).join("\n")].join("\n\n");
  const doc = { version: "teste", doctor_scene: E1.scenario, doctor_tasks: E1.tasks.map((t, i) => `${i + 1}. ${t}`).join("\n") };
  if (papel === "candidate") return { role: papel, station: { ...min, ...doc }, pressing_count: impressos.length, pressings: liberados };
  return {
    role: papel, station: { ...min, ...doc, actor_script: "TODO: o roteiro do ator não consta nos documentos do INEP (precisa vir da Montagem de estações)." },
    pressing_count: impressos.length, pressings: impressos, checklist_items: itens,
  };
}
function salaResultado(roomId) {
  const marcas = ["correct", "correct", "partial", "incorrect", "correct", "correct", "correct", "incorrect"];
  const lista = itens.map((it, i) => {
    const g = marcas[i] ?? "correct";
    const pts = g === "correct" ? it.grades.correct : g === "partial" ? (it.grades.partial ?? 0) : 0;
    return { id: it.id, order: it.order, content: it.content, max_points: it.grades.correct, grade: g, points: pts };
  });
  const score = lista.reduce((a, b) => a + b.points, 0);
  return {
    round: 1, viewer: lerSala(roomId).papel, station: ST, score, max_score: 10, pct: Math.round(score * 10), previous_pct: 62,
    items: lista, evaluator: { user_id: "t-1", public_name: "Colega Teste Um" }, candidate: { user_id: "t-eu", public_name: "Aluno de Teste" },
    finished_at: EM(-600000), used_ms: 452000, feedback: { pos: "Boa comunicação (texto de teste).", neg: "", gen: "Organize o raciocínio (texto de teste)." },
    review: { requested_at: null, reason: null, revised_at: null, score_before_review: null },
  };
}

let convites = [];
if (new URLSearchParams(location.search).get("convite") === "1") {
  convites = [{ id: "cv-1", room_id: "roles-candidate", from: { user_id: "t-1", public_name: "Colega Teste Um" }, expires_at: EM(10 * 60000) }];
}
const respostas = {
  app_dupla_access: () => ({ aberto: true, permitido: true, equipe: true, planos: ["pro", "elite"] }),
  app_dupla_profile: () => ({ profile: perfil, defaults: perfil ? null : { public_name: "Aluno de Teste", exam: "2026/2" }, stats: { done: 3, avg: 7.8 } }),
  app_dupla_save_profile: ({ p_profile }) => {
    perfil = { ...(perfil ?? {}), ...p_profile };
    return { profile: perfil, defaults: null, stats: { done: 3, avg: 7.8 } };
  },
  app_dupla_stations: () => BANCO,
  app_dupla_deck: () => ({ cards: baralho, hidden_by_role: 2, online: 5, matches_today: 1, open_room: null, server_now: NOW() }),
  app_dupla_heartbeat: () => ({ server_now: NOW() }),
  app_dupla_invites: () => ({ invites: convites, server_now: NOW() }),
  app_dupla_swipe: ({ p_to, p_direction }) => {
    baralho = baralho.filter((c) => c.user_id !== p_to);
    // na prévia, o primeiro colega "curte de volta": mostra o Deu match!
    return p_direction === "right" && p_to === "t-1" ? { matched: true, room_id: "roles-candidate", partner: { public_name: "Colega Teste Um" } } : { matched: false };
  },
  app_dupla_answer_invite: ({ p_accept }) => {
    convites = [];
    return { room_id: p_accept ? "roles-candidate" : null };
  },
  app_dupla_leave: ({ p_room_id }) => ({ id: p_room_id, phase: "closed" }),
  app_dupla_room: ({ p_room_id }) => salaEstado(p_room_id),
  app_dupla_room_content: ({ p_room_id }) => salaConteudo(p_room_id),
  app_dupla_marks: () => [{ item_id: "i1", grade: "correct", subitems: [] }, { item_id: "i2", grade: "partial", subitems: [] }],
  app_dupla_result: ({ p_room_id }) => salaResultado(p_room_id),
};
const backend = {
  rpc: async (fn, args = {}) => {
    const f = respostas[fn];
    if (!f) throw new Error(`Função sem simulação na prévia: ${fn}`);
    await new Promise((r) => setTimeout(r, 120));
    return f(args);
  },
};
const sessao = { status: "ready", backend, user: { id: "t-eu" }, boot: { role: "admin" }, dupla: { aberto: true, permitido: true, equipe: true, planos: ["pro", "elite"] } };
export const SessionProvider = ({ children }) => <>{children}</>;
export const rememberChoice = () => {};
export const useSession = () => ({ ...sessao, updateProfile: async () => {}, signOut: async () => {} });
