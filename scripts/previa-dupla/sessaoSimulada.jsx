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

// ----- sala ao vivo SIMULADA (Etapa 5): cada aba guarda a sua sala; o "colega" é simulado (confirma, fica pronto, inicia…) -----
// O id da sala é "<fase>-<papel>" (de onde a prévia começa). As ações mudam o estado como as funções app_dupla_* do banco.
const E1 = ESTACOES[0];
const ST = { ...resumo(E1), area: E1.area };
const itens = E1.criteria.map((c, i) => ({
  id: `i${i + 1}`, order: i + 1, content: c.title, tip: c.hint || "",
  grades: { correct: c.max, partial: c.partial, incorrect: 0 },
  criteria: {}, subitems: [],
}));
// Relato do caso = impresso INICIAL (visível desde o início); os outros são liberáveis, numerados 1, 2, 3 na tela.
const inicial = (p, i) => i === 0 && /^Relato/i.test(p.title);
let nTela = 0;
const impressos = E1.prints.map((p, i) => ({
  id: `p${i + 1}`, index: i + 1, source_number: i + 1, initially_visible: inicial(p, i),
  display_number: inicial(p, i) ? 1 : ++nTela, name: p.title, content: p.body, has_image: !inicial(p, i),
}));
const liberaveis = impressos.filter((p) => !p.initially_visible);
const chave = (p) => (p.initially_visible ? "i" : "d") + p.display_number;
// Imagens do protótipo de 11/10, lidas do disco SÓ pelo servidor da prévia (vite.config.mjs, /previa-imagens/); nada é copiado.
const IMAGEM = { candidate_sheet: "estacao-01-instrucoes-e-relato-unica.png", d1: "estacao-01-impresso-02-esfregaco-imagem.png", p2: "estacao-01-impresso-02-esfregaco-imagem.png" };
// O candidato (e quem ainda não tem papel) nunca recebe o nome nem o id da estação antes do resultado.
const { id: _id, name: _nome, topic: _tema, ...SEM_TEMA } = ST;
const stParaCandidato = { ...SEM_TEMA, label: `Estação ${ST.number}` };
const EU = { user_id: "t-eu", public_name: "Aluno de Teste" };
const ELE = { user_id: "t-1", public_name: "Colega Teste Um" };

const salas = {};
const marcas = {};
let feedbackFinal = { pos: "", neg: "", gen: "" };
let revisao = { requested_at: null, reason: null, revised_at: null, score_before_review: null };
function nova(roomId) {
  const [fase = "roles", papel = "candidate"] = String(roomId).split("-");
  const meu = papel === "evaluator" ? "evaluator" : "candidate";
  const outro = meu === "candidate" ? "evaluator" : "candidate";
  const s = {
    id: roomId, rev: 1, phase: fase, round: 1, duration_ms: 600000, papel: meu, outro,
    me: { confirmed: fase !== "roles", connected: !["roles", "connecting"].includes(fase), ready: false },
    partner: { confirmed: fase !== "roles", connected: !["roles", "connecting"].includes(fase), ready: fase === "setup" && meu === "evaluator" },
    started_at: null, ends_at: null, paused_left_ms: null, paused_at: null, paused_total_ms: 0, finished_at: null, released: [], closed_reason: null, closed_by: null,
  };
  if (fase === "running" || fase === "review") {
    s.started_at = EM(-180000);
    s.ends_at = EM(420000);
    s.released = meu === "candidate" ? [liberaveis[0]?.id].filter(Boolean) : [];
  }
  if (fase === "review" || fase === "result") s.finished_at = EM(-60000);
  if (fase === "closed") Object.assign(s, { closed_reason: "saiu", closed_by: { me: false, public_name: ELE.public_name } });
  return s;
}
const sala = (roomId) => (salas[roomId] ??= nova(roomId));
const muda = (roomId, patch) => {
  const s = sala(roomId);
  Object.assign(s, typeof patch === "function" ? patch(s) : patch);
  s.rev += 1;
  return estado(roomId);
};
// o "colega" faz a parte dele um pouco depois (só na prévia)
const depois = (ms, roomId, patch) => setTimeout(() => muda(roomId, patch), ms);

function estado(roomId) {
  const s = sala(roomId);
  const comNome = s.papel === "evaluator" || s.phase === "result";
  return {
    id: roomId, rev: s.rev, phase: s.phase, round: s.round, server_now: NOW(),
    station: comNome ? ST : stParaCandidato, duration_ms: s.duration_ms,
    me: { ...EU, role: s.papel, ...s.me, picked_station: false },
    partner: { ...ELE, role: s.outro, ...s.partner, seen_ms_ago: 2000 },
    match_note: s.round === 1 && s.phase === "roles" ? "Definido pelo match: você topa qualquer papel e Colega Teste Um quer ser ator/avaliador. Vocês ainda podem trocar. (dado de teste)" : null,
    invite_pending: false, call_link: null,
    started_at: s.started_at, ends_at: s.ends_at, paused_left_ms: s.paused_left_ms, paused_at: s.paused_at, finished_at: s.finished_at,
    released_pressings: s.papel === "evaluator" || s.phase === "result" ? s.released : impressos.filter((p) => s.released.includes(p.id)).map(chave),
    closed_reason: s.closed_reason, closed_by: s.closed_by,
  };
}
function conteudo(roomId) {
  const s = sala(roomId);
  const comNome = s.papel === "evaluator" || s.phase === "result";
  const min = { ...(comNome ? { id: ST.id, name: ST.name } : {}), label: `Estação ${ST.number}`, area: ST.area, area_code: ST.area_code, number: ST.number, duration_ms: 600000 };
  if (s.phase === "roles") return { role: null, station: min, pressing_count: liberaveis.length, pressings: [] };
  const doc = { version: "teste", doctor_scene: E1.scenario, doctor_tasks: E1.tasks.map((t, i) => `${i + 1}. ${t}`).join("\n"), candidate_sheet: { has_image: true } };
  if (s.papel === "candidate") {
    const vistos = impressos.filter((p) => p.initially_visible || s.released.includes(p.id));
    return {
      role: "candidate", station: { ...min, ...doc }, pressing_count: liberaveis.length,
      pressings: vistos.map(({ source_number: _s, index: _i, ...p }) => ({ ...p, id: chave(p) })),
    };
  }
  return {
    role: "evaluator",
    station: { ...min, ...doc, actor_script: "", summary: null },
    pressing_count: liberaveis.length, pressings: impressos, checklist_items: itens,
  };
}
const pontos = (it, g) => (g ? it.grades[g] ?? 0 : 0);
function resultado(roomId) {
  const s = sala(roomId);
  const m = marcas[`${roomId}:${s.round}`] ?? {};
  const lista = itens.map((it) => ({ id: it.id, order: it.order, content: it.content, max_points: it.grades.correct, grade: m[it.id]?.grade ?? null, points: pontos(it, m[it.id]?.grade) }));
  const score = lista.reduce((a, b) => a + b.points, 0);
  const max = itens.reduce((a, b) => a + b.grades.correct, 0) || 10;
  const avaliador = s.papel === "evaluator" ? EU : ELE;
  const candidato = s.papel === "evaluator" ? ELE : EU;
  return {
    round: s.round, viewer: s.papel, station: ST, score, max_score: max, pct: Math.round((score / max) * 100), previous_pct: null,
    items: lista, evaluator: avaliador, candidate: candidato, finished_at: s.finished_at ?? NOW(),
    used_ms: s.started_at && s.finished_at ? Date.parse(s.finished_at) - Date.parse(s.started_at) - s.paused_total_ms : null,
    feedback: feedbackFinal, review: revisao,
  };
}
const sala_acoes = {
  app_dupla_room: ({ p_room_id, p_since_rev }) => (p_since_rev != null && p_since_rev === sala(p_room_id).rev ? null : estado(p_room_id)),
  app_dupla_room_content: ({ p_room_id }) => conteudo(p_room_id),
  app_dupla_marks: ({ p_room_id }) => Object.entries(marcas[`${p_room_id}:${sala(p_room_id).round}`] ?? {}).map(([item_id, v]) => ({ item_id, ...v })),
  app_dupla_result: ({ p_room_id }) => resultado(p_room_id),
  app_dupla_set_roles: ({ p_room_id, p_candidate_id }) => muda(p_room_id, () => ({ papel: p_candidate_id === EU.user_id ? "candidate" : "evaluator", outro: p_candidate_id === EU.user_id ? "evaluator" : "candidate", me: { ...sala(p_room_id).me, confirmed: false } })),
  app_dupla_draw_roles: ({ p_room_id }) => muda(p_room_id, () => (Math.random() < 0.5 ? { papel: "candidate", outro: "evaluator" } : { papel: "evaluator", outro: "candidate" })),
  app_dupla_set_station: ({ p_room_id }) => muda(p_room_id, {}),
  app_dupla_confirm_roles: ({ p_room_id }) => {
    depois(1500, p_room_id, (s) => ({ phase: "connecting", partner: { ...s.partner, confirmed: true } }));
    return muda(p_room_id, (s) => ({ me: { ...s.me, confirmed: true } }));
  },
  app_dupla_connected: ({ p_room_id }) => muda(p_room_id, (s) => ({ phase: "setup", me: { ...s.me, connected: true }, partner: { ...s.partner, connected: true } })),
  app_dupla_ready: ({ p_room_id, p_ready }) => {
    const s = sala(p_room_id);
    if (p_ready && !s.partner.ready) depois(1500, p_room_id, (x) => ({ partner: { ...x.partner, ready: true } }));
    // candidato pronto: o "avaliador" inicia a estação depois de uns segundos
    if (p_ready && s.papel === "candidate") depois(5000, p_room_id, () => ({ phase: "running", started_at: NOW(), ends_at: EM(sala(p_room_id).duration_ms), released: [] }));
    if (p_ready && s.papel === "candidate") depois(15000, p_room_id, (x) => ({ released: x.phase === "running" ? [liberaveis[0]?.id].filter(Boolean) : x.released }));
    return muda(p_room_id, (x) => ({ me: { ...x.me, ready: Boolean(p_ready) } }));
  },
  app_dupla_set_duration: ({ p_room_id, p_duration_ms }) => muda(p_room_id, { duration_ms: Math.max(60000, Math.min(600000, p_duration_ms)) }),
  app_dupla_start: ({ p_room_id }) => muda(p_room_id, (s) => ({ phase: "running", started_at: NOW(), ends_at: EM(s.duration_ms), released: [] })),
  app_dupla_pause: ({ p_room_id }) => muda(p_room_id, (s) => ({ paused_left_ms: Math.max(0, Date.parse(s.ends_at) - Date.now()), paused_at: NOW(), ends_at: null })),
  app_dupla_resume: ({ p_room_id }) => muda(p_room_id, (s) => ({ ends_at: EM(s.paused_left_ms), paused_total_ms: s.paused_total_ms + (Date.now() - Date.parse(s.paused_at)), paused_left_ms: null, paused_at: null })),
  app_dupla_adjust: ({ p_room_id, p_delta_ms }) =>
    muda(p_room_id, (s) => (s.ends_at ? { ends_at: new Date(Math.max(Date.now() + 30000, Date.parse(s.ends_at) + p_delta_ms)).toISOString() } : { paused_left_ms: Math.max(30000, s.paused_left_ms + p_delta_ms) })),
  app_dupla_release: ({ p_room_id, p_pressing_id, p_released }) => muda(p_room_id, (s) => ({ released: p_released ? [...new Set([...s.released, p_pressing_id])] : s.released.filter((x) => x !== p_pressing_id) })),
  app_dupla_mark: ({ p_room_id, p_item_id, p_grade, p_subitems }) => {
    const k = `${p_room_id}:${sala(p_room_id).round}`;
    marcas[k] = { ...(marcas[k] ?? {}), [p_item_id]: { grade: p_grade, subitems: p_subitems ?? [] } };
    return { ok: true };
  },
  app_dupla_finish: ({ p_room_id }) => muda(p_room_id, { phase: "review", finished_at: NOW() }),
  app_dupla_finalize: ({ p_room_id, p_feedback }) => {
    if (revisao.requested_at) revisao = { ...revisao, revised_at: NOW() };
    feedbackFinal = { pos: p_feedback?.pos ?? "", neg: p_feedback?.neg ?? "", gen: p_feedback?.gen ?? "" };
    return muda(p_room_id, { phase: "result" });
  },
  app_dupla_request_review: ({ p_room_id, p_reason }) => {
    revisao = { ...revisao, requested_at: NOW(), reason: p_reason };
    return muda(p_room_id, {});
  },
  app_dupla_redo_review: ({ p_room_id }) => muda(p_room_id, { phase: "review" }),
  app_dupla_swap: ({ p_room_id }) =>
    muda(p_room_id, (s) => ({
      phase: "roles", round: s.round + 1, papel: s.outro, outro: s.papel, me: { confirmed: false, connected: false, ready: false }, partner: { confirmed: false, connected: false, ready: false },
      started_at: null, ends_at: null, paused_left_ms: null, paused_at: null, paused_total_ms: 0, finished_at: null, released: [], duration_ms: 600000,
    })),
  app_dupla_leave: ({ p_room_id }) => muda(p_room_id, { phase: "closed", closed_reason: "saiu", closed_by: { me: true, public_name: EU.public_name } }),
};

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
  ...sala_acoes,
};
const backend = {
  rpc: async (fn, args = {}) => {
    const f = respostas[fn];
    if (!f) throw new Error(`Função sem simulação na prévia: ${fn}`);
    await new Promise((r) => setTimeout(r, 120));
    return f(args);
  },
  // imagens da estação 1 (folha do candidato e esfregaço) vindas do protótipo, só no servidor da prévia
  duplaPrintUrl: async (_roomId, id) => (IMAGEM[id] ? `/previa-imagens/${IMAGEM[id]}` : null),
};
const sessao = { status: "ready", backend, user: { id: "t-eu" }, boot: { role: "admin" }, dupla: { aberto: true, permitido: true, equipe: true, planos: ["pro", "elite"] } };
export const SessionProvider = ({ children }) => <>{children}</>;
export const rememberChoice = () => {};
export const useSession = () => ({ ...sessao, updateProfile: async () => {}, signOut: async () => {} });
